import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WindowsHostManifestV1 } from "./types.js";
import {
  PROCESS_HOST_PROTOCOL,
  ProcessHostFrameParser,
  encodeProcessHostFrame,
  parseStrictJsonObject,
  processHostError,
  type ProcessHostFrameV1
} from "./windowsHostProtocol.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "..", "..");
const SAFE_HOST_CODE = /^[A-Z][A-Z0-9_]{0,79}$/;
const DEFAULT_WINDOWS_HOST_STARTUP_TIMEOUT_MS = 60_000;

async function digestFile(file: string): Promise<string> {
  const handle = await fsp.open(file, "r");
  try {
    const [content, stat] = await Promise.all([handle.readFile(), handle.stat()]);
    if (!stat.isFile()) throw processHostError("HOST_MANIFEST_INVALID");
    return createHash("sha256").update(content).digest("hex");
  } finally {
    await handle.close();
  }
}

function validateDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function parseManifest(value: unknown): WindowsHostManifestV1 {
  const manifest = value as Partial<WindowsHostManifestV1>;
  if (
    !manifest || typeof manifest !== "object" || manifest.schemaVersion !== 1 || manifest.protocolName !== "CXP4" ||
    manifest.protocolVersion !== 1 || manifest.headerLength !== 64 ||
    manifest.productionPowerShell !== "scripts/windows-process-host.ps1" ||
    manifest.productionCSharp !== "scripts/windows-process-host.cs" ||
    manifest.conPtyWorker !== "scripts/windows-conpty-worker.ps1" ||
    manifest.conPtyProbeChild !== "scripts/windows-conpty-probe-child.mjs" ||
    manifest.protocolAuthority !== "scripts/windows-process-host-protocol-v1.json" ||
    manifest.bootstrapSecretTransport !== "private_parent_stdin" || manifest.hostStdout !== "protocol_only" ||
    manifest.hostStderr !== "bounded_safe_codes" || typeof manifest.nativeFactoryClass !== "string" ||
    !validateDigest(manifest.productionPowerShellSha256) || !validateDigest(manifest.productionCSharpSha256) || !validateDigest(manifest.conPtyWorkerSha256) ||
    !validateDigest(manifest.conPtyProbeChildSha256) || !validateDigest(manifest.protocolSha256)
  ) throw processHostError("HOST_MANIFEST_INVALID");
  return Object.freeze({ ...manifest }) as WindowsHostManifestV1;
}

export async function loadAndVerifyWindowsHostManifest(options: { scriptsRoot?: string } = {}): Promise<{
  manifest: WindowsHostManifestV1;
  scriptsRoot: string;
  powerShellSource: string;
  csharpSource: string;
  conPtyWorker: string;
  conPtyProbeChild: string;
  protocolAuthority: string;
}> {
  const requestedRoot = path.resolve(options.scriptsRoot ?? path.join(packageRoot, "scripts"));
  const scriptsRoot = await fsp.realpath(requestedRoot);
  if (scriptsRoot.toLocaleLowerCase("en-US") !== requestedRoot.toLocaleLowerCase("en-US")) throw processHostError("HOST_MANIFEST_INVALID");
  const manifestPath = path.join(scriptsRoot, "windows-process-host-manifest.json");
  const manifest = parseManifest(JSON.parse(await fsp.readFile(manifestPath, "utf8")));
  const powerShellSource = path.join(scriptsRoot, path.basename(manifest.productionPowerShell));
  const csharpSource = path.join(scriptsRoot, path.basename(manifest.productionCSharp));
  const conPtyWorker = path.join(scriptsRoot, path.basename(manifest.conPtyWorker));
  const conPtyProbeChild = path.join(scriptsRoot, path.basename(manifest.conPtyProbeChild));
  const protocolAuthority = path.join(scriptsRoot, path.basename(manifest.protocolAuthority));
  for (const file of [manifestPath, powerShellSource, csharpSource, conPtyWorker, conPtyProbeChild, protocolAuthority]) {
    const real = await fsp.realpath(file);
    if (path.dirname(real).toLocaleLowerCase("en-US") !== scriptsRoot.toLocaleLowerCase("en-US") || real.toLocaleLowerCase("en-US") !== file.toLocaleLowerCase("en-US")) {
      throw processHostError("HOST_MANIFEST_INVALID");
    }
  }
  const [powerShellDigest, csharpDigest, conPtyWorkerDigest, conPtyProbeChildDigest, protocolDigest] = await Promise.all([
    digestFile(powerShellSource), digestFile(csharpSource), digestFile(conPtyWorker), digestFile(conPtyProbeChild), digestFile(protocolAuthority)
  ]);
  if (powerShellDigest !== manifest.productionPowerShellSha256 || csharpDigest !== manifest.productionCSharpSha256 || conPtyWorkerDigest !== manifest.conPtyWorkerSha256 || conPtyProbeChildDigest !== manifest.conPtyProbeChildSha256 || protocolDigest !== manifest.protocolSha256) {
    throw processHostError("HOST_MANIFEST_STALE");
  }
  return Object.freeze({ manifest, scriptsRoot, powerShellSource, csharpSource, conPtyWorker, conPtyProbeChild, protocolAuthority });
}

function fixedWindowsPaths(): { systemRoot: string; systemDrive: string; powershell: string } {
  const systemDrive = path.parse(process.execPath).root.replace(/[\\/]$/, "");
  const systemRoot = path.join(`${systemDrive}\\`, "Windows");
  return { systemRoot, systemDrive, powershell: path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") };
}

function boundedEnvironment(tempRoot: string): NodeJS.ProcessEnv {
  const fixed = fixedWindowsPaths();
  return {
    SystemDrive: fixed.systemDrive,
    SystemRoot: fixed.systemRoot,
    WINDIR: fixed.systemRoot,
    ProgramData: path.join(`${fixed.systemDrive}\\`, "ProgramData"),
    ComSpec: path.join(fixed.systemRoot, "System32", "cmd.exe"),
    PATH: `${path.join(fixed.systemRoot, "System32")};${fixed.systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: tempRoot,
    TMP: tempRoot
  };
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve) => {
    child.once("error", () => resolve({ code: 127, signal: null }));
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

interface PendingRequest {
  resolve(value: { frame: ProcessHostFrameV1; body: Record<string, unknown> }): void;
  reject(error: unknown): void;
}

export class WindowsProcessHostClient {
  readonly hostId: string;
  readonly childProcessId: number;
  readonly manifest: WindowsHostManifestV1;
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #nodeToHostKey: Buffer;
  readonly #hostToNodeKey: Buffer;
  readonly #parser: ProcessHostFrameParser;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #exit: Promise<{ code: number; signal: NodeJS.Signals | null }>;
  readonly #tempRoot: string;
  #sendSequence = 1;
  #stderr = Buffer.alloc(0);
  #fatal: Error | null = null;
  #closePromise: Promise<void> | null = null;

  private constructor(input: {
    child: ChildProcessWithoutNullStreams;
    nodeToHostKey: Buffer;
    hostToNodeKey: Buffer;
    tempRoot: string;
    manifest: WindowsHostManifestV1;
  }) {
    this.hostId = `host_${randomBytes(16).toString("hex")}`;
    this.childProcessId = input.child.pid ?? 0;
    this.manifest = input.manifest;
    this.#child = input.child;
    this.#nodeToHostKey = input.nodeToHostKey;
    this.#hostToNodeKey = input.hostToNodeKey;
    this.#tempRoot = input.tempRoot;
    this.#parser = new ProcessHostFrameParser({ key: input.hostToNodeKey, direction: "host-to-node" });
    this.#exit = waitForExit(input.child);
    input.child.stdout.on("data", (chunk: Buffer) => this.#onData(chunk));
    input.child.stdout.on("end", () => {
      try { this.#parser.end(); } catch (error) { this.#fail(error); }
    });
    input.child.stderr.on("data", (chunk: Buffer) => {
      const incoming = Buffer.from(chunk);
      const combined = Buffer.concat([this.#stderr, incoming]);
      this.#stderr = combined.subarray(Math.max(0, combined.length - 16_384));
    });
    input.child.once("close", () => this.#fail(processHostError("HOST_CLOSED", this.#safeStderrCode())));
  }

  static async start(options: { scriptsRoot?: string; platform?: NodeJS.Platform; startupTimeoutMs?: number } = {}): Promise<WindowsProcessHostClient> {
    if ((options.platform ?? process.platform) !== "win32") throw processHostError("HOST_UNAVAILABLE");
    const verified = await loadAndVerifyWindowsHostManifest({ scriptsRoot: options.scriptsRoot });
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-phase4-host-"));
    const nodeToHostKey = randomBytes(32);
    const hostToNodeKey = randomBytes(32);
    const nonce = randomBytes(32).toString("hex");
    const fixed = fixedWindowsPaths();
    const child = spawn(fixed.powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", verified.powerShellSource], {
      cwd: packageRoot,
      env: boundedEnvironment(tempRoot),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const client = new WindowsProcessHostClient({ child, nodeToHostKey, hostToNodeKey, tempRoot, manifest: verified.manifest });
    try {
      child.stdin.write(Buffer.concat([nodeToHostKey, hostToNodeKey]));
      const hello = await client.#requestFrame(PROCESS_HOST_PROTOCOL.kinds.HELLO, { schemaVersion: 1, protocolVersion: 1, nonce }, options.startupTimeoutMs ?? DEFAULT_WINDOWS_HOST_STARTUP_TIMEOUT_MS);
      if (hello.frame.kind !== PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK || hello.body.nonce !== nonce || hello.body.protocolVersion !== 1) throw processHostError("HELLO_MISMATCH");
      return client;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  }

  #safeStderrCode(): string {
    const lines = this.#stderr.toString("utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.length > 0 && lines.every((line) => SAFE_HOST_CODE.test(line)) ? lines.at(-1)! : "HOST_CLOSED";
  }

  #fail(error: unknown): void {
    const failure = error instanceof Error ? error : processHostError("HOST_PROTOCOL_ERROR");
    this.#fatal = failure;
    for (const pending of this.#pending.values()) pending.reject(failure);
    this.#pending.clear();
  }

  #onData(chunk: Buffer): void {
    let frames: ProcessHostFrameV1[];
    try { frames = this.#parser.push(chunk); } catch (error) {
      this.#fail(error);
      this.#child.kill();
      return;
    }
    for (const frame of frames) {
      const allowedHostKinds = new Set([
        PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK,
        PROCESS_HOST_PROTOCOL.kinds.RESPONSE_JSON,
        PROCESS_HOST_PROTOCOL.kinds.EVENT_JSON,
        PROCESS_HOST_PROTOCOL.kinds.OUTPUT,
        PROCESS_HOST_PROTOCOL.kinds.CREDIT,
        PROCESS_HOST_PROTOCOL.kinds.FATAL
      ]);
      if (!allowedHostKinds.has(frame.kind)) {
        this.#fail(processHostError("DIRECTION_INVALID"));
        this.#child.kill();
        continue;
      }
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.EVENT_JSON) {
        try { parseStrictJsonObject(frame.payload); } catch (error) { this.#fail(error); this.#child.kill(); }
        continue;
      }
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.FATAL) {
        const body = parseStrictJsonObject(frame.payload);
        this.#fail(processHostError(typeof body.code === "string" && SAFE_HOST_CODE.test(body.code) ? body.code : "HOST_PROTOCOL_ERROR"));
        this.#child.kill();
        continue;
      }
      const pending = this.#pending.get(frame.requestId);
      if (!pending) {
        this.#fail(processHostError("UNKNOWN_RESPONSE_REQUEST"));
        this.#child.kill();
        continue;
      }
      if (frame.kind !== PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK && frame.kind !== PROCESS_HOST_PROTOCOL.kinds.RESPONSE_JSON) {
        this.#fail(processHostError("DIRECTION_INVALID"));
        this.#child.kill();
        continue;
      }
      this.#pending.delete(frame.requestId);
      try { pending.resolve({ frame, body: parseStrictJsonObject(frame.payload) }); } catch (error) { pending.reject(error); }
    }
  }

  #sendFrame(kind: number, body: unknown, requestId: string): void {
    if (this.#fatal) throw this.#fatal;
    if (this.#sendSequence > 0xffffffff) throw processHostError("SEQUENCE_EXHAUSTED");
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const frame = encodeProcessHostFrame({ kind, sequence: this.#sendSequence++, requestId, payload, key: this.#nodeToHostKey });
    if (this.#child.stdin.writableLength + frame.length > PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerHost) throw processHostError("HOST_BACKPRESSURE");
    this.#child.stdin.write(frame);
  }

  #requestFrame(kind: number, body: unknown, timeoutMs: number): Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }> {
    if (this.#pending.size >= PROCESS_HOST_PROTOCOL.maxInflightPerHost) return Promise.reject(processHostError("HOST_BACKPRESSURE"));
    const requestId = randomUUID().replaceAll("-", "");
    const promise = new Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(processHostError("HOST_REQUEST_TIMEOUT"));
      }, timeoutMs);
      timer.unref?.();
      this.#pending.set(requestId, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    });
    try { this.#sendFrame(kind, body, requestId); } catch (error) {
      this.#pending.get(requestId)?.reject(error);
      this.#pending.delete(requestId);
    }
    return promise;
  }

  request(operation: string, input: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }> {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(operation)) return Promise.reject(processHostError("HOST_REQUEST_INVALID"));
    return this.#requestFrame(PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON, { schemaVersion: 1, operation, input }, options.timeoutMs ?? 30_000);
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closePromise = (async () => {
      this.#child.stdin.end();
      const exited = await Promise.race([
        this.#exit.then(() => true),
        new Promise<boolean>((resolve) => { const timer = setTimeout(() => resolve(false), 10_000); timer.unref?.(); })
      ]);
      if (!exited) {
        this.#child.kill();
        await this.#exit;
      }
      this.#nodeToHostKey.fill(0);
      this.#hostToNodeKey.fill(0);
      await fsp.rm(this.#tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    })();
    return this.#closePromise;
  }
}

export class WindowsProcessHostRuntime {
  readonly #options: { scriptsRoot?: string; platform?: NodeJS.Platform; startupTimeoutMs?: number };
  #clientPromise: Promise<WindowsProcessHostClient> | null = null;
  #closed = false;

  constructor(options: { scriptsRoot?: string; platform?: NodeJS.Platform; startupTimeoutMs?: number } = {}) {
    this.#options = { ...options };
  }

  get(): Promise<WindowsProcessHostClient> {
    if (this.#closed) return Promise.reject(processHostError("HOST_UNAVAILABLE"));
    this.#clientPromise ??= WindowsProcessHostClient.start(this.#options).catch((error) => {
      this.#clientPromise = null;
      throw error;
    });
    return this.#clientPromise;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const client = await this.#clientPromise?.catch(() => null);
    await client?.close();
    this.#clientPromise = null;
  }
}

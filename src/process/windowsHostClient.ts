import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOwnedTempRoot, type OwnedTempRoot } from "../../scripts/owned-temp-root.mjs";
import type { WindowsHostManifestV1 } from "./types.js";
import {
  PROCESS_HOST_PROTOCOL,
  ProcessHostFrameParser,
  decodeProcessHostCredit,
  encodeProcessHostCredit,
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
  framed: boolean;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  stdout: Buffer[];
  stderr: Buffer[];
  stdoutBytes: number;
  stderrBytes: number;
  stdoutEof: boolean;
  stderrEof: boolean;
  outputStarted: boolean;
  cancelRequested: boolean;
  cancelSent: boolean;
  timeout?: NodeJS.Timeout;
  cancelGrace?: NodeJS.Timeout;
}

const FRAMED_INPUT_LIMIT_BYTES = PROCESS_HOST_PROTOCOL.streaming.maxInputBytes;
const FRAMED_OUTPUT_LIMIT_BYTES = PROCESS_HOST_PROTOCOL.streaming.maxOutputBytesPerStream;
const CANCEL_GRACE_MS = 10_000;

function strictBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw processHostError("HOST_REQUEST_INVALID");
  }
  return Buffer.from(value, "base64");
}

function boundedOutputLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > FRAMED_OUTPUT_LIMIT_BYTES) {
    throw processHostError("HOST_REQUEST_INVALID");
  }
  return value as number;
}

function requiredByteCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw processHostError("HOST_PROTOCOL_ERROR");
  return value as number;
}

function prepareFramedRequest(operation: string, input: Record<string, unknown>): {
  input: Record<string, unknown>;
  bytes: Buffer;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
} | null {
  if (operation !== "run" && operation !== "run_powershell") return null;
  const prepared = { ...input };
  let bytes: Buffer;
  if (operation === "run") {
    bytes = strictBase64(prepared.stdinBase64);
    delete prepared.stdinBase64;
  } else {
    if (typeof prepared.script !== "string" || prepared.script.includes("\0")) throw processHostError("HOST_REQUEST_INVALID");
    bytes = Buffer.from(prepared.script, "utf8");
    delete prepared.script;
  }
  if (bytes.length > FRAMED_INPUT_LIMIT_BYTES) throw processHostError("HOST_REQUEST_INVALID");
  return {
    input: prepared,
    bytes,
    stdoutLimitBytes: boundedOutputLimit(prepared.stdoutLimitBytes),
    stderrLimitBytes: boundedOutputLimit(prepared.stderrLimitBytes)
  };
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
  readonly #ownedTemp: OwnedTempRoot;
  #sendSequence = 1;
  #nodeToHostCredit = PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerHost;
  #queuedRequests = 0;
  #framedTail: Promise<void> = Promise.resolve();
  #stderr = Buffer.alloc(0);
  #fatal: Error | null = null;
  #closePromise: Promise<void> | null = null;
  #closing = false;

  private constructor(input: {
    child: ChildProcessWithoutNullStreams;
    nodeToHostKey: Buffer;
    hostToNodeKey: Buffer;
    tempRoot: string;
    ownedTemp: OwnedTempRoot;
    manifest: WindowsHostManifestV1;
  }) {
    this.hostId = `host_${randomBytes(16).toString("hex")}`;
    this.childProcessId = input.child.pid ?? 0;
    this.manifest = input.manifest;
    this.#child = input.child;
    this.#nodeToHostKey = input.nodeToHostKey;
    this.#hostToNodeKey = input.hostToNodeKey;
    this.#tempRoot = input.tempRoot;
    this.#ownedTemp = input.ownedTemp;
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
    const ownedTemp = await createOwnedTempRoot("process-host");
    const tempRoot = ownedTemp.path;
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
    const client = new WindowsProcessHostClient({ child, nodeToHostKey, hostToNodeKey, tempRoot, ownedTemp, manifest: verified.manifest });
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
    for (const pending of this.#pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      if (pending.cancelGrace) clearTimeout(pending.cancelGrace);
      pending.reject(failure);
    }
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
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.CREDIT) {
        try {
          const pending = this.#pending.get(frame.requestId);
          if (!pending?.framed || frame.processGeneration !== 0n) {
            throw processHostError("CONTROL_CORRELATION_INVALID");
          }
          const credit = decodeProcessHostCredit(frame.payload);
          if (this.#nodeToHostCredit + credit > PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerHost) {
            throw processHostError("CREDIT_OVERFLOW");
          }
          this.#nodeToHostCredit += credit;
        } catch (error) {
          this.#fail(error);
          this.#child.kill();
        }
        continue;
      }
      const pending = this.#pending.get(frame.requestId);
      if (!pending) {
        this.#fail(processHostError("UNKNOWN_RESPONSE_REQUEST"));
        this.#child.kill();
        continue;
      }
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.OUTPUT) {
        try {
          if (!pending.framed || frame.processGeneration !== 0n) throw processHostError("DIRECTION_INVALID");
          pending.outputStarted = true;
          const stderr = (frame.flags & PROCESS_HOST_PROTOCOL.flags.STDERR) !== 0;
          const eof = (frame.flags & PROCESS_HOST_PROTOCOL.flags.EOF) !== 0;
          const chunks = stderr ? pending.stderr : pending.stdout;
          const alreadyEof = stderr ? pending.stderrEof : pending.stdoutEof;
          const nextBytes = (stderr ? pending.stderrBytes : pending.stdoutBytes) + frame.payload.length;
          const limit = stderr ? pending.stderrLimitBytes : pending.stdoutLimitBytes;
          if (alreadyEof || nextBytes > limit) throw processHostError("HOST_OUTPUT_LIMIT_EXCEEDED");
          if (frame.payload.length) chunks.push(Buffer.from(frame.payload));
          if (stderr) {
            pending.stderrBytes = nextBytes;
            pending.stderrEof = eof;
          } else {
            pending.stdoutBytes = nextBytes;
            pending.stdoutEof = eof;
          }
          if (!pending.cancelSent) {
            this.#sendPayloadFrame(
              PROCESS_HOST_PROTOCOL.kinds.CREDIT,
              encodeProcessHostCredit(frame.frameBytes),
              frame.requestId,
              frame.processGeneration
            );
          }
        } catch (error) {
          this.#fail(error);
          this.#child.kill();
        }
        continue;
      }
      if (frame.kind !== PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK && frame.kind !== PROCESS_HOST_PROTOCOL.kinds.RESPONSE_JSON) {
        this.#fail(processHostError("DIRECTION_INVALID"));
        this.#child.kill();
        continue;
      }
      this.#pending.delete(frame.requestId);
      if (pending.timeout) clearTimeout(pending.timeout);
      if (pending.cancelGrace) clearTimeout(pending.cancelGrace);
      try {
        const parsed = parseStrictJsonObject(frame.payload);
        if (pending.cancelRequested) {
          pending.reject(processHostError("HOST_REQUEST_TIMEOUT"));
          continue;
        }
        if (pending.framed) {
          if (
            frame.processGeneration !== 0n ||
            parsed.streamTransport !== "framed_v1" ||
            !pending.stdoutEof ||
            !pending.stderrEof
          ) throw processHostError("HOST_PROTOCOL_ERROR");
          const stdout = Buffer.concat(pending.stdout, pending.stdoutBytes);
          const stderr = Buffer.concat(pending.stderr, pending.stderrBytes);
          const stdoutTotal = requiredByteCount(parsed.stdoutTotalBytes);
          const stderrTotal = requiredByteCount(parsed.stderrTotalBytes);
          const stdoutDropped = requiredByteCount(parsed.stdoutDroppedBytes);
          const stderrDropped = requiredByteCount(parsed.stderrDroppedBytes);
          if (
            stdoutTotal - stdoutDropped !== stdout.length ||
            stderrTotal - stderrDropped !== stderr.length ||
            typeof parsed.stdoutTruncated !== "boolean" ||
            typeof parsed.stderrTruncated !== "boolean" ||
            parsed.stdoutTruncated !== (stdoutDropped > 0) ||
            parsed.stderrTruncated !== (stderrDropped > 0)
          ) throw processHostError("HOST_PROTOCOL_ERROR");
          parsed.stdoutBase64 = stdout.toString("base64");
          parsed.stderrBase64 = stderr.toString("base64");
        }
        pending.resolve({ frame, body: parsed });
      } catch (error) {
        pending.reject(error);
      }
    }
  }

  #sendPayloadFrame(
    kind: number,
    payload: Buffer,
    requestId: string,
    processGeneration: bigint = 0n,
    flags = 0
  ): void {
    if (this.#fatal) throw this.#fatal;
    if (this.#sendSequence > 0xffffffff) throw processHostError("SEQUENCE_EXHAUSTED");
    const frame = encodeProcessHostFrame({
      kind,
      flags,
      sequence: this.#sendSequence++,
      requestId,
      processGeneration,
      payload,
      key: this.#nodeToHostKey
    });
    if (this.#child.stdin.writableLength + frame.length > PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerHost) throw processHostError("HOST_BACKPRESSURE");
    this.#child.stdin.write(frame);
  }

  #sendFrame(kind: number, body: unknown, requestId: string): void {
    this.#sendPayloadFrame(kind, Buffer.from(JSON.stringify(body), "utf8"), requestId);
  }

  #sendFramedRequest(body: unknown, input: Buffer, requestId: string): void {
    if (this.#fatal) throw this.#fatal;
    const payloads: Array<{ kind: number; flags: number; payload: Buffer }> = [{
      kind: PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON,
      flags: 0,
      payload: Buffer.from(JSON.stringify(body), "utf8")
    }];
    if (input.length === 0) {
      payloads.push({ kind: PROCESS_HOST_PROTOCOL.kinds.INPUT, flags: PROCESS_HOST_PROTOCOL.flags.EOF, payload: Buffer.alloc(0) });
    } else {
      for (let offset = 0; offset < input.length; offset += PROCESS_HOST_PROTOCOL.maxFramePayloadBytes) {
        const end = Math.min(input.length, offset + PROCESS_HOST_PROTOCOL.maxFramePayloadBytes);
        payloads.push({
          kind: PROCESS_HOST_PROTOCOL.kinds.INPUT,
          flags: end === input.length ? PROCESS_HOST_PROTOCOL.flags.EOF : 0,
          payload: input.subarray(offset, end)
        });
      }
    }
    const total = payloads.reduce((sum, entry) => sum + PROCESS_HOST_PROTOCOL.headerLength + entry.payload.length, 0);
    if (
      total > PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerProcess ||
      total > this.#nodeToHostCredit ||
      this.#child.stdin.writableLength + total > PROCESS_HOST_PROTOCOL.maxNodeToHostQueuedBytesPerHost
    ) throw processHostError("HOST_BACKPRESSURE");
    if (this.#sendSequence + payloads.length - 1 > 0xffffffff) throw processHostError("SEQUENCE_EXHAUSTED");
    let sequence = this.#sendSequence;
    const frames = payloads.map((entry) => encodeProcessHostFrame({
      kind: entry.kind,
      flags: entry.flags,
      sequence: sequence++,
      requestId,
      payload: entry.payload,
      key: this.#nodeToHostKey
    }));
    this.#sendSequence = sequence;
    this.#nodeToHostCredit -= total;
    for (const frame of frames) this.#child.stdin.write(frame);
  }

  #requestFrame(
    kind: number,
    body: unknown,
    timeoutMs: number,
    framed?: { input: Buffer; stdoutLimitBytes: number; stderrLimitBytes: number }
  ): Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }> {
    if (this.#pending.size >= PROCESS_HOST_PROTOCOL.maxInflightPerHost) return Promise.reject(processHostError("HOST_BACKPRESSURE"));
    const requestId = randomUUID().replaceAll("-", "");
    const promise = new Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        framed: Boolean(framed),
        stdoutLimitBytes: framed?.stdoutLimitBytes ?? 0,
        stderrLimitBytes: framed?.stderrLimitBytes ?? 0,
        stdout: [],
        stderr: [],
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutEof: false,
        stderrEof: false,
        outputStarted: false,
        cancelRequested: false,
        cancelSent: false
      };
      pending.timeout = setTimeout(() => {
        if (!framed) {
          this.#pending.delete(requestId);
          const failure = processHostError("HOST_REQUEST_TIMEOUT");
          this.#child.kill();
          void this.#exit.then(() => reject(failure));
          return;
        }
        pending.cancelRequested = true;
        if (!pending.outputStarted) {
          try {
            this.#sendPayloadFrame(PROCESS_HOST_PROTOCOL.kinds.CANCEL, Buffer.alloc(0), requestId);
            pending.cancelSent = true;
          } catch {
            this.#pending.delete(requestId);
            const failure = processHostError("HOST_REQUEST_TIMEOUT");
            this.#child.kill();
            void this.#exit.then(() => reject(failure));
            return;
          }
        }
        pending.cancelGrace = setTimeout(() => {
          this.#pending.delete(requestId);
          const failure = processHostError("HOST_REQUEST_TIMEOUT");
          this.#child.kill();
          void this.#exit.then(() => reject(failure));
        }, CANCEL_GRACE_MS);
        pending.cancelGrace.unref?.();
      }, timeoutMs);
      pending.timeout.unref?.();
      this.#pending.set(requestId, pending);
    });
    try {
      if (framed) {
        try { this.#sendFramedRequest(body, framed.input, requestId); }
        finally { framed.input.fill(0); }
      } else this.#sendFrame(kind, body, requestId);
    } catch (error) {
      const pending = this.#pending.get(requestId);
      if (pending?.timeout) clearTimeout(pending.timeout);
      if (pending?.cancelGrace) clearTimeout(pending.cancelGrace);
      this.#pending.delete(requestId);
      if (framed && pending) {
        this.#child.kill();
        void this.#exit.then(() => pending.reject(error));
      } else pending?.reject(error);
    }
    return promise;
  }

  request(operation: string, input: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<{ frame: ProcessHostFrameV1; body: Record<string, unknown> }> {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(operation)) return Promise.reject(processHostError("HOST_REQUEST_INVALID"));
    if (this.#closing || this.#fatal) return Promise.reject(this.#fatal ?? processHostError("HOST_CLOSED"));
    if (this.#queuedRequests >= PROCESS_HOST_PROTOCOL.maxInflightPerHost) return Promise.reject(processHostError("HOST_BACKPRESSURE"));
    let framed: ReturnType<typeof prepareFramedRequest>;
    try { framed = prepareFramedRequest(operation, input); } catch (error) { return Promise.reject(error); }
    const body = framed
      ? {
          schemaVersion: 1,
          operation,
          input: framed.input,
          stream: { version: PROCESS_HOST_PROTOCOL.streaming.version, inputBytes: framed.bytes.length, output: "frames" }
        }
      : { schemaVersion: 1, operation, input };
    this.#queuedRequests += 1;
    const run = () => {
      if (this.#closing || this.#fatal) {
        return Promise.reject(this.#fatal ?? processHostError("HOST_CLOSED"));
      }
      return this.#requestFrame(
        PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON,
        body,
        options.timeoutMs ?? 30_000,
        framed ? {
          input: framed.bytes,
          stdoutLimitBytes: framed.stdoutLimitBytes,
          stderrLimitBytes: framed.stderrLimitBytes
        } : undefined
      );
    };
    const result = framed ? this.#framedTail.then(run, run) : run();
    if (framed) this.#framedTail = result.then(() => undefined, () => undefined);
    return result.finally(() => { this.#queuedRequests -= 1; });
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
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
      await this.#ownedTemp.cleanup();
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

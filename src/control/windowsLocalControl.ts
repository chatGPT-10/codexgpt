import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalApprovalServer } from "./localApprovalServer.js";
import { localControlResponseV3Schema, type LocalControlResponseV3 } from "./schemas.js";

const MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_WINDOWS_LOCAL_CONTROL_STARTUP_TIMEOUT_MS = 60_000;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "..", "..");

export interface WindowsLocalControlRuntimeOptions {
  server: LocalApprovalServer;
  stateBaseRoot: string;
  scriptsRoot?: string;
  startupTimeoutMs?: number;
}

interface ReadyRecord {
  schemaVersion: number;
  code: string;
  serverId: string;
  nonce: string;
  pid: number;
  processCreationTime: string;
  pipePath: string;
  ownedJobName: string;
  pipeRejectRemoteClients: boolean;
}

interface DispatchRecord {
  schemaVersion: number;
  code: string;
  requestId: string;
  serverId: string;
  request: unknown;
}

function controlError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function safeControlCode(error: unknown): string {
  const candidate = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "CONTROL_REQUEST_INVALID";
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ? candidate : "CONTROL_REQUEST_INVALID";
}

function fixedWindowsPaths(): { systemRoot: string; systemDrive: string; powershell: string } {
  const systemDrive = path.parse(process.execPath).root.replace(/[\\/]$/, "");
  const systemRoot = path.join(`${systemDrive}\\`, "Windows");
  return {
    systemDrive,
    systemRoot,
    powershell: path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  };
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

function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length === 0 || payload.length > MAX_MESSAGE_BYTES) throw controlError("CONTROL_MESSAGE_TOO_LARGE");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function createLineReader(stream: NodeJS.ReadableStream): () => Promise<unknown> {
  let buffer = Buffer.alloc(0);
  let terminal: Error | null = null;
  const waiters: Array<{ resolve(value: unknown): void; reject(error: unknown): void }> = [];
  const settle = () => {
    while (waiters.length > 0) {
      const newline = buffer.indexOf(0x0a);
      if (newline < 0) break;
      const line = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      const waiter = waiters.shift()!;
      try {
        waiter.resolve(JSON.parse(line));
      } catch {
        waiter.reject(controlError("CONTROL_HOST_PROTOCOL_INVALID"));
      }
    }
    if (terminal) while (waiters.length > 0) waiters.shift()!.reject(terminal);
  };
  stream.on("data", (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (buffer.length > MAX_MESSAGE_BYTES) terminal = controlError("CONTROL_HOST_OUTPUT_TOO_LARGE");
    settle();
  });
  stream.on("end", () => {
    terminal = controlError("CONTROL_HOST_CLOSED");
    settle();
  });
  stream.on("error", (error) => {
    terminal = error instanceof Error ? error : controlError("CONTROL_HOST_STREAM_FAILED");
    settle();
  });
  return () => new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
    settle();
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve) => {
    child.once("error", () => resolve({ code: 127, signal: null }));
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function responseFailure(serverId: string, code: string): LocalControlResponseV3 {
  return localControlResponseV3Schema.parse({
    schemaVersion: 3,
    contractVersion: 3,
    serverId,
    ok: false,
    code,
    sequence: 0,
    approvals: [],
    processes: [],
    grantId: null,
    changed: false
  });
}

async function readFramedResponse(socket: import("node:net").Socket, timeoutMs: number): Promise<Record<string, unknown>> {
  let buffer = Buffer.alloc(0);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(controlError("CONTROL_RESPONSE_TIMEOUT")), timeoutMs);
    timer.unref?.();
    const finish = (error?: unknown, value?: Record<string, unknown>) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      error ? reject(error) : resolve(value!);
    };
    const onError = (error: Error) => finish(error);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_MESSAGE_BYTES) return finish(controlError("CONTROL_RESPONSE_TOO_LARGE"));
      if (buffer.length < 4 + length) return;
      try {
        finish(undefined, JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")) as Record<string, unknown>);
      } catch {
        finish(controlError("CONTROL_RESPONSE_INVALID"));
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function callOwnedPipe(ready: ReadyRecord, secret: Buffer, operation: "shutdown", timeoutMs = 5_000): Promise<Record<string, unknown>> {
  const net = await import("node:net");
  const socket = await new Promise<import("node:net").Socket>((resolve, reject) => {
    const candidate = net.createConnection(ready.pipePath);
    const timer = setTimeout(() => {
      candidate.destroy();
      reject(controlError("CONTROL_CONNECT_TIMEOUT"));
    }, timeoutMs);
    timer.unref?.();
    candidate.once("connect", () => {
      clearTimeout(timer);
      resolve(candidate);
    });
    candidate.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.on("error", () => {});
  try {
    socket.write(encodeFrame({
      schemaVersion: 1,
      requestId: randomUUID().replaceAll("-", ""),
      serverId: ready.serverId,
      nonce: ready.nonce,
      bootstrapKey: secret.toString("base64"),
      operation,
      input: {}
    }));
    return await readFramedResponse(socket, timeoutMs);
  } finally {
    socket.destroy();
  }
}

export class WindowsLocalControlRuntime {
  readonly serverId: string;
  readonly stateRoot: string;
  readonly ready: Readonly<ReadyRecord>;
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #secret: Buffer;
  readonly #stderr: Buffer[];
  readonly #exit: Promise<{ code: number; signal: NodeJS.Signals | null }>;
  #closePromise: Promise<void> | null = null;

  private constructor(input: {
    child: ChildProcessWithoutNullStreams;
    secret: Buffer;
    stateRoot: string;
    ready: ReadyRecord;
    stderr: Buffer[];
    exit: Promise<{ code: number; signal: NodeJS.Signals | null }>;
  }) {
    this.#child = input.child;
    this.#secret = input.secret;
    this.stateRoot = input.stateRoot;
    this.ready = Object.freeze({ ...input.ready });
    this.serverId = input.ready.serverId;
    this.#stderr = input.stderr;
    this.#exit = input.exit;
  }

  static async start(options: WindowsLocalControlRuntimeOptions): Promise<WindowsLocalControlRuntime> {
    if (process.platform !== "win32") throw controlError("WINDOWS_LOCAL_CONTROL_UNAVAILABLE");
    const serverId = options.server.serverId;
    const baseRoot = path.resolve(options.stateBaseRoot);
    const stateRoot = path.join(baseRoot, serverId);
    if (path.dirname(stateRoot).toLocaleLowerCase("en-US") !== baseRoot.toLocaleLowerCase("en-US")) {
      throw controlError("CONTROL_STATE_ROOT_INVALID");
    }
    await fsp.mkdir(baseRoot, { recursive: true });
    await fsp.mkdir(stateRoot, { recursive: false });
    const scriptsRoot = path.resolve(options.scriptsRoot ?? path.join(packageRoot, "scripts"));
    const hostScript = path.join(scriptsRoot, "windows-local-control.ps1");
    const fixed = fixedWindowsPaths();
    const secret = randomBytes(32);
    const nonce = randomBytes(32).toString("hex");
    const child = spawn(fixed.powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", hostScript
    ], {
      cwd: packageRoot,
      env: boundedEnvironment(stateRoot),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const nextLine = createLineReader(child.stdout);
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(Buffer.from(chunk));
      while (Buffer.concat(stderr).length > 16_384) stderr.shift();
    });
    const exit = waitForExit(child);
    child.stdin.write(`${JSON.stringify({
      schemaVersion: 1,
      serverId,
      nonce,
      bootstrapKey: secret.toString("base64"),
      stateRoot
    })}\n`);

    let ready: ReadyRecord;
    try {
      ready = await Promise.race([
        nextLine() as Promise<ReadyRecord>,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(controlError("CONTROL_READY_TIMEOUT")), options.startupTimeoutMs ?? DEFAULT_WINDOWS_LOCAL_CONTROL_STARTUP_TIMEOUT_MS);
          timer.unref?.();
        })
      ]);
      if (
        ready?.schemaVersion !== 1 || ready.code !== "CONTROL_READY" || ready.serverId !== serverId ||
        ready.nonce !== nonce || ready.pipeRejectRemoteClients !== true ||
        ready.pipePath !== `\\\\.\\pipe\\codexgpt-control-${serverId}`
      ) throw controlError("CONTROL_READY_MISMATCH");
    } catch (error) {
      child.kill();
      await exit;
      secret.fill(0);
      await fsp.rm(stateRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
      throw controlError(safeControlCode(error), diagnostic || (error instanceof Error ? error.message : String(error)));
    }

    const runtime = new WindowsLocalControlRuntime({ child, secret, stateRoot, ready, stderr, exit });
    void runtime.#dispatchLoop(options.server, nextLine);
    return runtime;
  }

  async #dispatchLoop(server: LocalApprovalServer, nextLine: () => Promise<unknown>): Promise<void> {
    while (this.#child.exitCode === null && !this.#closePromise) {
      let raw: unknown;
      try {
        raw = await nextLine();
      } catch {
        return;
      }
      const dispatch = raw as Partial<DispatchRecord>;
      if (
        dispatch?.schemaVersion !== 1 || dispatch.code !== "CONTROL_DISPATCH" ||
        dispatch.serverId !== this.serverId || !/^[a-f0-9]{32}$/.test(String(dispatch.requestId ?? ""))
      ) {
        this.#child.kill();
        return;
      }
      let response: LocalControlResponseV3;
      try {
        response = await server.handle(dispatch.request);
      } catch (error) {
        response = responseFailure(this.serverId, safeControlCode(error));
      }
      const line = `${JSON.stringify({
        schemaVersion: 1,
        code: "CONTROL_DISPATCH_RESULT",
        requestId: dispatch.requestId,
        response
      })}\n`;
      if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
        this.#child.kill();
        return;
      }
      this.#child.stdin.write(line);
    }
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closePromise = (async () => {
      try {
        const response = await callOwnedPipe(this.ready, this.#secret, "shutdown");
        if (response.ok !== true || response.code !== "CONTROL_SHUTDOWN") throw controlError("CONTROL_SHUTDOWN_REJECTED");
      } catch {
        this.#child.kill();
      }
      this.#child.stdin.end();
      let forced = false;
      await Promise.race([
        this.#exit,
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            forced = true;
            this.#child.kill();
            resolve();
          }, 5_000);
          timer.unref?.();
        })
      ]);
      if (forced) await this.#exit;
      this.#secret.fill(0);
      await fsp.rm(this.stateRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      try {
        await fsp.lstat(this.stateRoot);
        throw controlError("CONTROL_CLEANUP_FAILED", Buffer.concat(this.#stderr).toString("utf8").trim());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    })();
    return this.#closePromise;
  }
}

export function localControlServerId(): string {
  return randomBytes(16).toString("hex");
}

export function localControlSecretDigest(secret: Buffer): string {
  return createHash("sha256").update(secret).digest("hex");
}

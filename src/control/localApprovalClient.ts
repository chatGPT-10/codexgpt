import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  localControlRequestV3Schema,
  localControlResponseV3Schema,
  localServerIdSchema,
  type LocalControlRequestV3,
  type LocalControlResponseV3
} from "./schemas.js";

const execFileAsync = promisify(execFile);
const MAX_MESSAGE_BYTES = 64 * 1024;

interface LocalControlStateV1 {
  schemaVersion: 1;
  serverId: string;
  nonce: string;
  keyDigest: string;
  pid: number;
  processCreationTime: string;
  pipePath: string;
}

interface FileIdentity {
  dev: string;
  ino: string;
  nlink: number;
  size: number;
}

export interface LocalApprovalClientOptions {
  stateBaseRoot?: string;
  timeoutMs?: number;
  processCreationTime?: (pid: number) => Promise<string | null>;
}

function controlError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fileIdentity(stat: import("node:fs").Stats): FileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino), nlink: Number(stat.nlink), size: Number(stat.size) };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink && left.size === right.size;
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

function fixedChildEnvironment(): NodeJS.ProcessEnv {
  const fixed = fixedWindowsPaths();
  return {
    SystemDrive: fixed.systemDrive,
    SystemRoot: fixed.systemRoot,
    WINDIR: fixed.systemRoot,
    ProgramData: path.join(`${fixed.systemDrive}\\`, "ProgramData"),
    ComSpec: path.join(fixed.systemRoot, "System32", "cmd.exe"),
    PATH: `${path.join(fixed.systemRoot, "System32")};${fixed.systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD"
  };
}

async function windowsProcessCreationTime(pid: number): Promise<string | null> {
  if (process.platform !== "win32") return null;
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const fixed = fixedWindowsPaths();
  const command = `$p=Get-Process -Id ${pid} -ErrorAction Stop;[Console]::Out.Write($p.StartTime.ToUniversalTime().ToString('O'))`;
  try {
    const result = await execFileAsync(fixed.powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command
    ], {
      encoding: "utf8",
      env: fixedChildEnvironment(),
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 8_192
    });
    const value = result.stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function defaultLocalControlStateBaseRoot(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const localAppData = env.LOCALAPPDATA?.trim();
  const base = localAppData ? path.resolve(localAppData) : path.join(path.resolve(homeDirectory), "AppData", "Local");
  return path.join(base, "CodexGPT", "control");
}

async function readLocalControlState(
  stateBaseRoot: string,
  serverId: string,
  creationTime: (pid: number) => Promise<string | null>
): Promise<{ state: LocalControlStateV1; stateRoot: string }> {
  const exactServerId = localServerIdSchema.parse(serverId);
  const baseRoot = path.resolve(stateBaseRoot);
  const stateRoot = path.join(baseRoot, exactServerId);
  if (path.dirname(stateRoot).toLocaleLowerCase("en-US") !== baseRoot.toLocaleLowerCase("en-US")) {
    throw controlError("CONTROL_STATE_ROOT_INVALID");
  }
  const rootBefore = await fsp.lstat(stateRoot);
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) throw controlError("CONTROL_STATE_ROOT_UNSAFE");
  const rootIdentity = fileIdentity(rootBefore);
  const statePath = path.join(stateRoot, `${exactServerId}.json`);
  const handle = await fsp.open(statePath, "r");
  let beforeIdentity: FileIdentity;
  let raw: string;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 2 || before.size > MAX_MESSAGE_BYTES) {
      throw controlError("CONTROL_STATE_FILE_UNSAFE");
    }
    beforeIdentity = fileIdentity(before);
    raw = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat();
    if (!sameIdentity(beforeIdentity, fileIdentity(after))) throw controlError("CONTROL_STATE_REPLACED");
  } finally {
    await handle.close();
  }
  const pathAfter = await fsp.lstat(statePath);
  if (pathAfter.isSymbolicLink() || !sameIdentity(beforeIdentity!, fileIdentity(pathAfter))) {
    throw controlError("CONTROL_STATE_REPLACED");
  }
  const rootAfter = await fsp.lstat(stateRoot);
  if (!sameIdentity(rootIdentity, fileIdentity(rootAfter))) throw controlError("CONTROL_STATE_ROOT_REPLACED");

  let state: Partial<LocalControlStateV1>;
  try {
    state = JSON.parse(raw!) as Partial<LocalControlStateV1>;
  } catch {
    throw controlError("CONTROL_STATE_INVALID");
  }
  if (
    state.schemaVersion !== 1 || state.serverId !== exactServerId ||
    !/^[a-f0-9]{64}$/.test(String(state.nonce ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(state.keyDigest ?? "")) ||
    !Number.isSafeInteger(state.pid) || Number(state.pid) <= 0 ||
    typeof state.processCreationTime !== "string" ||
    state.pipePath !== `\\\\.\\pipe\\codexgpt-control-${exactServerId}`
  ) throw controlError("CONTROL_STATE_INVALID");
  const liveCreationTime = await creationTime(Number(state.pid));
  if (!liveCreationTime || liveCreationTime !== state.processCreationTime) throw controlError("CONTROL_SERVER_STALE");
  return { state: state as LocalControlStateV1, stateRoot };
}

function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length === 0 || payload.length > MAX_MESSAGE_BYTES) throw controlError("CONTROL_MESSAGE_TOO_LARGE");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

async function connectPipe(pipePath: string, timeoutMs: number): Promise<net.Socket> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(pipePath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(controlError("CONTROL_CONNECT_TIMEOUT"));
    }, timeoutMs);
    timer.unref?.();
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function readFrame(socket: net.Socket, timeoutMs: number): Promise<Record<string, unknown>> {
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

async function sendOuter(
  state: LocalControlStateV1,
  operation: "bootstrap" | "dispatch",
  input: unknown,
  secret: Buffer | null,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const socket = await connectPipe(state.pipePath, timeoutMs);
  socket.on("error", () => {});
  try {
    const request: Record<string, unknown> = {
      schemaVersion: 1,
      requestId: randomUUID().replaceAll("-", ""),
      serverId: state.serverId,
      nonce: state.nonce,
      operation,
      input
    };
    if (secret) request.bootstrapKey = secret.toString("base64");
    socket.write(encodeFrame(request));
    return await readFrame(socket, timeoutMs);
  } finally {
    socket.destroy();
  }
}

export class LocalApprovalClient {
  readonly #stateBaseRoot: string;
  readonly #timeoutMs: number;
  readonly #processCreationTime: (pid: number) => Promise<string | null>;

  constructor(options: LocalApprovalClientOptions = {}) {
    this.#stateBaseRoot = path.resolve(options.stateBaseRoot ?? defaultLocalControlStateBaseRoot());
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#processCreationTime = options.processCreationTime ?? windowsProcessCreationTime;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 30_000) {
      throw controlError("CONTROL_TIMEOUT_INVALID");
    }
  }

  list(serverId: string): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "approvals.list", serverId });
  }

  watch(serverId: string, afterSequence: number, timeoutMs = this.#timeoutMs): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "approvals.watch", serverId, afterSequence, timeoutMs });
  }

  approve(serverId: string, approvalId: string): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId, approvalId });
  }

  deny(serverId: string, approvalId: string): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "approvals.deny", serverId, approvalId });
  }

  listProcesses(serverId: string): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "processes.list", serverId });
  }

  terminateProcess(serverId: string, processId: string): Promise<LocalControlResponseV3> {
    return this.request({ schemaVersion: 3, contractVersion: 3, operation: "processes.terminate", serverId, processId });
  }

  async request(raw: LocalControlRequestV3): Promise<LocalControlResponseV3> {
    const request = localControlRequestV3Schema.parse(raw);
    const discovered = await readLocalControlState(this.#stateBaseRoot, request.serverId, this.#processCreationTime);
    const bootstrap = await sendOuter(discovered.state, "bootstrap", {}, null, this.#timeoutMs);
    const secret = Buffer.from(String(bootstrap.bootstrapKey ?? ""), "base64");
    try {
      if (
        bootstrap.ok !== true || bootstrap.code !== "CONTROL_BOOTSTRAP" ||
        bootstrap.serverId !== request.serverId || bootstrap.nonce !== discovered.state.nonce ||
        bootstrap.bootstrapKeyTransport !== "private_local_pipe" || secret.length !== 32 ||
        createHash("sha256").update(secret).digest("hex") !== discovered.state.keyDigest
      ) throw controlError("CONTROL_BOOTSTRAP_MISMATCH");
      const response = await sendOuter(discovered.state, "dispatch", request, secret, this.#timeoutMs);
      return localControlResponseV3Schema.parse(response);
    } finally {
      secret.fill(0);
      delete bootstrap.bootstrapKey;
    }
  }
}

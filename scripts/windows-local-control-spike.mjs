#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { processCreationTime } from "./long-task-runner.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const hostScriptPath = path.join(scriptDirectory, "windows-local-control-spike.ps1");
const MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_WINDOWS_LOCAL_CONTROL_SPIKE_STARTUP_TIMEOUT_MS = 60_000;

function controlError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function boundedEnvironment(tempRoot) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const systemDrive = path.parse(systemRoot).root.replace(/[\\/]$/, "");
  return {
    SystemDrive: systemDrive,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ProgramData: path.join(systemDrive, "ProgramData"),
    ComSpec: path.join(systemRoot, "System32", "cmd.exe"),
    PATH: `${path.join(systemRoot, "System32")};${systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: tempRoot,
    TMP: tempRoot
  };
}

function powershellPath() {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: 127, signal: null, error }));
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, error: null }));
  });
}

function lineReader(stream, { maxBytes = MAX_MESSAGE_BYTES } = {}) {
  let buffer = Buffer.alloc(0);
  const waiting = [];
  let terminalError = null;
  function settle() {
    while (waiting.length > 0) {
      const newline = buffer.indexOf(0x0a);
      if (newline === -1) break;
      const line = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      const waiter = waiting.shift();
      try {
        waiter.resolve(JSON.parse(line));
      } catch (error) {
        waiter.reject(controlError("INVALID_CONTROL_JSON", error.message));
      }
    }
    if (terminalError) {
      while (waiting.length > 0) waiting.shift().reject(terminalError);
    }
  }
  stream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (buffer.length > maxBytes) terminalError = controlError("CONTROL_OUTPUT_TOO_LARGE");
    settle();
  });
  stream.on("end", () => {
    terminalError = controlError("CONTROL_HOST_CLOSED");
    settle();
  });
  stream.on("error", (error) => {
    terminalError = error;
    settle();
  });
  return () => new Promise((resolve, reject) => {
    waiting.push({ resolve, reject });
    settle();
  });
}

function encodeMessage(value) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length > MAX_MESSAGE_BYTES) throw controlError("CONTROL_MESSAGE_TOO_LARGE");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

async function readFramedMessage(socket, timeoutMs = 5000) {
  let buffer = Buffer.alloc(0);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(controlError("CONTROL_RESPONSE_TIMEOUT")), timeoutMs);
    function finish(error, value) {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      error ? reject(error) : resolve(value);
    }
    function onError(error) { finish(error); }
    function onData(chunk) {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (length > MAX_MESSAGE_BYTES) return finish(controlError("CONTROL_RESPONSE_TOO_LARGE"));
      if (buffer.length < 4 + length) return;
      try {
        finish(null, JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
      } catch (error) {
        finish(controlError("INVALID_CONTROL_RESPONSE", error.message));
      }
    }
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function connectPipe(pipePath, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(pipePath);
    socket.on("error", () => {});
    const timer = setTimeout(() => {
      socket.destroy();
      reject(controlError("CONTROL_CONNECT_TIMEOUT"));
    }, timeoutMs);
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

export function validateServerId(serverId) {
  if (!/^[0-9a-f]{32}$/i.test(String(serverId))) throw controlError("INVALID_SERVER_ID");
  return String(serverId).toLowerCase();
}

function identityOf(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino), nlink: Number(stat.nlink), size: Number(stat.size) });
}

export async function readLocalControlState(stateRoot, serverId) {
  const exactServerId = validateServerId(serverId);
  const rootStat = await fsp.lstat(stateRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw controlError("CONTROL_STATE_ROOT_UNSAFE");
  const statePath = path.join(stateRoot, `${exactServerId}.json`);
  const handle = await fsp.open(statePath, "r");
  let raw;
  let beforeIdentity;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) throw controlError("CONTROL_STATE_FILE_UNSAFE");
    beforeIdentity = identityOf(before);
    raw = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat();
    if (JSON.stringify(beforeIdentity) !== JSON.stringify(identityOf(after))) throw controlError("CONTROL_STATE_REPLACED");
  } finally {
    await handle.close();
  }
  const pathAfter = await fsp.lstat(statePath);
  if (pathAfter.isSymbolicLink() || JSON.stringify(beforeIdentity) !== JSON.stringify(identityOf(pathAfter))) {
    throw controlError("CONTROL_STATE_REPLACED");
  }
  const rootAfter = await fsp.lstat(stateRoot);
  if (JSON.stringify(identityOf(rootStat)) !== JSON.stringify(identityOf(rootAfter))) throw controlError("CONTROL_STATE_ROOT_REPLACED");
  let state;
  try { state = JSON.parse(raw); } catch { throw controlError("CONTROL_STATE_INVALID"); }
  if (state.schemaVersion !== 1 || state.serverId !== exactServerId) throw controlError("CONTROL_STATE_MISMATCH");
  if (!/^[0-9a-f]{64}$/i.test(state.nonce) || !/^[0-9a-f]{64}$/i.test(state.keyDigest)) throw controlError("CONTROL_STATE_INVALID");
  if (!Number.isSafeInteger(state.pid) || state.pid <= 0 || typeof state.processCreationTime !== "string") throw controlError("CONTROL_STATE_INVALID");
  if (typeof state.pipePath !== "string" || state.pipePath !== `\\\\.\\pipe\\codexpro-control-${exactServerId}`) throw controlError("CONTROL_STATE_INVALID");
  const liveCreationTime = await processCreationTime(state.pid);
  if (liveCreationTime !== state.processCreationTime) throw controlError("CONTROL_SERVER_STALE");
  return Object.freeze({ state, statePath, rootIdentity: identityOf(rootStat), fileIdentity: beforeIdentity });
}

export async function callLocalControl({ stateRoot, serverId, startupSecret, operation = "ping", input = {}, timeoutMs = 5000 }) {
  const discovered = await readLocalControlState(stateRoot, serverId);
  const bootstrapOnly = startupSecret === undefined || startupSecret === null;
  if (bootstrapOnly && operation !== "bootstrap") throw controlError("CONTROL_SECRET_REQUIRED");
  const secret = bootstrapOnly
    ? null
    : Buffer.isBuffer(startupSecret)
      ? Buffer.from(startupSecret)
      : Buffer.from(startupSecret, "base64");
  if (secret && (secret.length !== 32 || createHash("sha256").update(secret).digest("hex") !== discovered.state.keyDigest)) {
    throw controlError("CONTROL_SECRET_MISMATCH");
  }
  const socket = await connectPipe(discovered.state.pipePath, timeoutMs);
  socket.on("error", () => {});
  try {
    const request = {
      schemaVersion: 1,
      requestId: randomUUID().replaceAll("-", ""),
      serverId: discovered.state.serverId,
      nonce: discovered.state.nonce,
      operation,
      input
    };
    if (secret) request.bootstrapKey = secret.toString("base64");
    socket.write(encodeMessage(request));
    const response = await readFramedMessage(socket, timeoutMs);
    if (operation === "bootstrap" && response?.ok === true) {
      const transferred = Buffer.from(String(response.bootstrapKey ?? ""), "base64");
      if (
        response.code !== "CONTROL_BOOTSTRAP" ||
        response.serverId !== discovered.state.serverId ||
        response.nonce !== discovered.state.nonce ||
        response.bootstrapKeyTransport !== "private_local_pipe" ||
        transferred.length !== 32 ||
        createHash("sha256").update(transferred).digest("hex") !== discovered.state.keyDigest
      ) {
        transferred.fill(0);
        throw controlError("CONTROL_BOOTSTRAP_MISMATCH");
      }
    }
    return response;
  } finally {
    socket.end();
    socket.destroy();
    secret?.fill(0);
  }
}

export async function acquireLocalControlSecret({ stateRoot, serverId, timeoutMs = 5000 }) {
  const response = await callLocalControl({ stateRoot, serverId, operation: "bootstrap", timeoutMs });
  const secret = Buffer.from(String(response.bootstrapKey), "base64");
  delete response.bootstrapKey;
  return secret;
}

export async function dispatchLocalControl({ stateRoot, serverId, request, timeoutMs = 5000 }) {
  const secret = await acquireLocalControlSecret({ stateRoot, serverId, timeoutMs });
  try {
    return await callLocalControl({
      stateRoot,
      serverId,
      startupSecret: secret,
      operation: "dispatch",
      input: request,
      timeoutMs
    });
  } finally {
    secret.fill(0);
  }
}

export async function remotePipeRefused(pipePath, timeoutMs = 3000) {
  const remotePath = pipePath.replace(/^\\\\\.\\pipe\\/i, "\\\\localhost\\pipe\\");
  try {
    const socket = await connectPipe(remotePath, timeoutMs);
    socket.on("error", () => {});
    socket.destroy();
    return false;
  } catch {
    return true;
  }
}

export class WindowsLocalControlSpikeSession {
  constructor({ child, stateRoot, serverId, nonce, startupSecret, ready, stderr, exitPromise }) {
    this.child = child;
    this.stateRoot = stateRoot;
    this.serverId = serverId;
    this.nonce = nonce;
    this.startupSecret = startupSecret;
    this.ready = ready;
    this.stderr = stderr;
    this.exitPromise = exitPromise;
  }
  request(operation, input = {}, options = {}) {
    return callLocalControl({
      stateRoot: this.stateRoot,
      serverId: this.serverId,
      startupSecret: this.startupSecret,
      operation,
      input,
      ...options
    });
  }
  async close() {
    let failure;
    try {
      const response = await this.request("shutdown", {}, { timeoutMs: 5000 });
      if (response?.ok !== true || response?.code !== "CONTROL_SHUTDOWN") {
        failure = controlError(response?.code ?? "CONTROL_SHUTDOWN_REJECTED");
      }
    } catch (error) {
      failure = error;
    }
    this.child.stdin.end();
    let outcome;
    try {
      outcome = await Promise.race([
        this.exitPromise,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(controlError("CONTROL_SHUTDOWN_TIMEOUT")), 5000);
          timer.unref?.();
        })
      ]);
    } catch (error) {
      failure ??= error;
      this.child.kill();
      outcome = await this.exitPromise;
    } finally {
      await fsp.rm(this.stateRoot, { recursive: true, force: true });
    }
    if (failure) {
      const diagnostic = Buffer.concat(this.stderr).toString("utf8").trim();
      throw controlError(failure.code ?? "CONTROL_CLOSE_FAILED", diagnostic || failure.message);
    }
    return outcome;
  }
}

export async function startWindowsLocalControlSpike({ platform = process.platform, stateRoot } = {}) {
  if (platform !== "win32") throw controlError("WINDOWS_LOCAL_CONTROL_UNAVAILABLE");
  const root = stateRoot ?? await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-control-"));
  await fsp.mkdir(root, { recursive: true });
  const serverId = randomBytes(16).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const startupSecret = randomBytes(32);
  const child = spawn(powershellPath(), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", hostScriptPath
  ], {
    cwd: repositoryRoot,
    env: boundedEnvironment(root),
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const nextLine = lineReader(child.stdout);
  const stderr = [];
  child.stdin.on("error", (error) => {
    stderr.push(Buffer.from(`STDIN_${error?.code ?? "ERROR"}\n`));
    while (Buffer.concat(stderr).length > 16384) stderr.shift();
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(Buffer.from(chunk));
    while (Buffer.concat(stderr).length > 16384) stderr.shift();
  });
  child.stderr.on("error", (error) => {
    stderr.push(Buffer.from(`STDERR_${error?.code ?? "ERROR"}\n`));
    while (Buffer.concat(stderr).length > 16384) stderr.shift();
  });
  const exitPromise = waitForExit(child);
  child.stdin.write(`${JSON.stringify({
    schemaVersion: 1,
    serverId,
    nonce,
    bootstrapKey: startupSecret.toString("base64"),
    stateRoot: path.resolve(root)
  })}\n`);
  let ready;
  try {
    ready = await Promise.race([
      nextLine(),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(controlError("CONTROL_READY_TIMEOUT")), DEFAULT_WINDOWS_LOCAL_CONTROL_SPIKE_STARTUP_TIMEOUT_MS);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    child.kill();
    await exitPromise;
    await fsp.rm(root, { recursive: true, force: true });
    throw controlError(error?.code ?? "CONTROL_READY_FAILED", Buffer.concat(stderr).toString("utf8") || error?.message || "CONTROL_READY_FAILED");
  }
  if (ready.code !== "CONTROL_READY" || ready.serverId !== serverId || ready.nonce !== nonce) {
    child.kill();
    await exitPromise;
    await fsp.rm(root, { recursive: true, force: true });
    throw controlError("CONTROL_READY_MISMATCH", Buffer.concat(stderr).toString("utf8") || "CONTROL_READY_MISMATCH");
  }
  const liveCreationTime = await processCreationTime(child.pid);
  if (ready.pid !== child.pid || ready.processCreationTime !== liveCreationTime) {
    child.kill();
    await exitPromise;
    await fsp.rm(root, { recursive: true, force: true });
    throw controlError("CONTROL_PROCESS_IDENTITY_MISMATCH");
  }
  await readLocalControlState(root, serverId);
  return new WindowsLocalControlSpikeSession({ child, stateRoot: root, serverId, nonce, startupSecret, ready, stderr, exitPromise });
}

async function main() {
  const session = await startWindowsLocalControlSpike();
  try {
    const response = await session.request("describe");
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main().catch((error) => {
  console.error(error?.message ?? error?.code ?? String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const protocolPath = path.join(scriptDirectory, "windows-process-host-protocol-v1.json");
const hostScriptPath = path.join(scriptDirectory, "windows-process-host.ps1");

export const PROCESS_HOST_PROTOCOL = Object.freeze(JSON.parse(fs.readFileSync(protocolPath, "utf8")));
const HEADER_LENGTH = PROCESS_HOST_PROTOCOL.headerLength;
const TAG_OFFSET = 48;
const TAG_LENGTH = PROCESS_HOST_PROTOCOL.tagLength;
const MAX_PAYLOAD = PROCESS_HOST_PROTOCOL.maxFramePayloadBytes;
const ALLOWED_KINDS = new Set(Object.values(PROCESS_HOST_PROTOCOL.kinds));

function protocolError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function allowedFlags(kind) {
  if (kind === PROCESS_HOST_PROTOCOL.kinds.OUTPUT) return PROCESS_HOST_PROTOCOL.flags.STDERR | PROCESS_HOST_PROTOCOL.flags.EOF;
  if (kind === PROCESS_HOST_PROTOCOL.kinds.INPUT) return PROCESS_HOST_PROTOCOL.flags.EOF;
  return 0;
}

function validateKindPayload(kind, payloadLength) {
  if (payloadLength > MAX_PAYLOAD) throw protocolError("FRAME_TOO_LARGE");
  if ((kind === PROCESS_HOST_PROTOCOL.kinds.HELLO || kind === PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK) && payloadLength > PROCESS_HOST_PROTOCOL.maxHelloPayloadBytes) {
    throw protocolError("HELLO_TOO_LARGE");
  }
  if (kind === PROCESS_HOST_PROTOCOL.kinds.CREDIT && payloadLength !== PROCESS_HOST_PROTOCOL.rules.creditPayloadBytes) {
    throw protocolError("INVALID_CREDIT_LENGTH");
  }
  if (kind === PROCESS_HOST_PROTOCOL.kinds.CANCEL && payloadLength !== PROCESS_HOST_PROTOCOL.rules.cancelPayloadBytes) {
    throw protocolError("INVALID_CANCEL_LENGTH");
  }
}

function requestIdBytes(requestId) {
  if (requestId === undefined || requestId === null) return Buffer.alloc(16);
  if (Buffer.isBuffer(requestId)) {
    if (requestId.length !== 16) throw protocolError("INVALID_REQUEST_ID");
    return Buffer.from(requestId);
  }
  const compact = String(requestId).replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) throw protocolError("INVALID_REQUEST_ID");
  return Buffer.from(compact, "hex");
}

export function encodeProcessHostFrame({
  kind,
  flags = 0,
  sequence,
  requestId,
  processGeneration = 0n,
  payload = Buffer.alloc(0),
  key
}) {
  if (!ALLOWED_KINDS.has(kind)) throw protocolError("UNKNOWN_FRAME_KIND");
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0xffffffff) throw protocolError("INVALID_SEQUENCE");
  if ((flags & ~allowedFlags(kind)) !== 0) throw protocolError("INVALID_FLAGS");
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  validateKindPayload(kind, body.length);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw protocolError("INVALID_HMAC_KEY");
  const header = Buffer.alloc(HEADER_LENGTH);
  Buffer.from(PROCESS_HOST_PROTOCOL.magicHex, "hex").copy(header, 0);
  header.writeUInt16LE(PROCESS_HOST_PROTOCOL.version, 4);
  header.writeUInt16LE(HEADER_LENGTH, 6);
  header.writeUInt16LE(kind, 8);
  header.writeUInt16LE(flags, 10);
  header.writeUInt32LE(sequence, 12);
  requestIdBytes(requestId).copy(header, 16);
  header.writeBigUInt64LE(BigInt(processGeneration), 32);
  header.writeUInt32LE(body.length, 40);
  header.writeUInt32LE(0, 44);
  const tag = createHmac("sha256", key).update(header.subarray(0, TAG_OFFSET)).update(body).digest().subarray(0, TAG_LENGTH);
  tag.copy(header, TAG_OFFSET);
  return Buffer.concat([header, body]);
}

export function decodeProcessHostFrame(buffer, { key, expectedSequence, direction = "peer" } = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < HEADER_LENGTH) throw protocolError("TRUNCATED_HEADER");
  if (!buffer.subarray(0, 4).equals(Buffer.from(PROCESS_HOST_PROTOCOL.magicHex, "hex"))) throw protocolError("BAD_MAGIC");
  if (buffer.readUInt16LE(4) !== PROCESS_HOST_PROTOCOL.version) throw protocolError("BAD_VERSION");
  if (buffer.readUInt16LE(6) !== HEADER_LENGTH) throw protocolError("BAD_HEADER_LENGTH");
  const kind = buffer.readUInt16LE(8);
  const flags = buffer.readUInt16LE(10);
  const sequence = buffer.readUInt32LE(12);
  const payloadLength = buffer.readUInt32LE(40);
  if (!ALLOWED_KINDS.has(kind)) throw protocolError("UNKNOWN_FRAME_KIND");
  if ((flags & ~allowedFlags(kind)) !== 0) throw protocolError("INVALID_FLAGS");
  if (buffer.readUInt32LE(44) !== 0) throw protocolError("NONZERO_RESERVED");
  validateKindPayload(kind, payloadLength);
  if (buffer.length !== HEADER_LENGTH + payloadLength) throw protocolError(buffer.length < HEADER_LENGTH + payloadLength ? "TRUNCATED_PAYLOAD" : "TRAILING_FRAME_BYTES");
  if (expectedSequence !== undefined && sequence !== expectedSequence) throw protocolError(sequence < expectedSequence ? "DUPLICATE_SEQUENCE" : "OUT_OF_ORDER_SEQUENCE");
  if (!Buffer.isBuffer(key) || key.length !== 32) throw protocolError("INVALID_HMAC_KEY");
  const payload = buffer.subarray(HEADER_LENGTH);
  const expectedTag = createHmac("sha256", key).update(buffer.subarray(0, TAG_OFFSET)).update(payload).digest().subarray(0, TAG_LENGTH);
  if (!timingSafeEqual(expectedTag, buffer.subarray(TAG_OFFSET, TAG_OFFSET + TAG_LENGTH))) throw protocolError("BAD_AUTH_TAG");
  return Object.freeze({
    direction,
    kind,
    flags,
    sequence,
    requestId: buffer.subarray(16, 32).toString("hex"),
    processGeneration: buffer.readBigUInt64LE(32),
    payload: Buffer.from(payload),
    frameBytes: buffer.length
  });
}

export class ProcessHostFrameParser {
  constructor({ key, direction = "peer", firstSequence = 1, maxQueuedBytes = PROCESS_HOST_PROTOCOL.maxHostToNodeQueuedBytesPerHost } = {}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw protocolError("INVALID_HMAC_KEY");
    this.key = Buffer.from(key);
    this.direction = direction;
    this.expectedSequence = firstSequence;
    this.maxQueuedBytes = maxQueuedBytes;
    this.buffer = Buffer.alloc(0);
    this.fatal = false;
  }

  push(chunk) {
    if (this.fatal) throw protocolError("PARSER_FATAL");
    const incoming = Buffer.from(chunk);
    if (this.buffer.length + incoming.length > this.maxQueuedBytes) {
      this.fatal = true;
      throw protocolError("HOST_QUEUE_LIMIT_EXCEEDED");
    }
    this.buffer = Buffer.concat([this.buffer, incoming]);
    const frames = [];
    try {
      while (this.buffer.length >= HEADER_LENGTH) {
        const payloadLength = this.buffer.readUInt32LE(40);
        if (payloadLength > MAX_PAYLOAD) throw protocolError("FRAME_TOO_LARGE");
        const frameLength = HEADER_LENGTH + payloadLength;
        if (this.buffer.length < frameLength) break;
        const frameBytes = this.buffer.subarray(0, frameLength);
        const frame = decodeProcessHostFrame(frameBytes, {
          key: this.key,
          expectedSequence: this.expectedSequence,
          direction: this.direction
        });
        frames.push(frame);
        this.expectedSequence += 1;
        if (this.expectedSequence > 0xffffffff) throw protocolError("SEQUENCE_EXHAUSTED");
        this.buffer = this.buffer.subarray(frameLength);
      }
      return frames;
    } catch (error) {
      this.fatal = true;
      throw error;
    }
  }

  end() {
    if (this.buffer.length !== 0) {
      this.fatal = true;
      throw protocolError(this.buffer.length < HEADER_LENGTH ? "TRUNCATED_HEADER" : "TRUNCATED_PAYLOAD");
    }
  }
}

function scanJsonStrings(text) {
  const strings = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const char = text[index];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        strings.push({ start, end: index + 1, value: JSON.parse(text.slice(start, index + 1)) });
        break;
      }
      index += 1;
    }
    if (index >= text.length) throw protocolError("INVALID_JSON");
  }
  return strings;
}

export function parseStrictJsonObject(payload, { maxBytes = MAX_PAYLOAD, maxDepth = 16, maxKeys = 256, maxStringLength = 16384 } = {}) {
  const bytes = Buffer.from(payload);
  if (bytes.length > maxBytes) throw protocolError("JSON_TOO_LARGE");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw protocolError("INVALID_UTF8");
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) throw protocolError("JSON_OBJECT_REQUIRED");
  const strings = scanJsonStrings(trimmed);
  if (strings.some((entry) => entry.value.length > maxStringLength)) throw protocolError("JSON_STRING_TOO_LONG");
  let depth = 0;
  let keys = 0;
  const keySets = [];
  let stringIndex = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const currentString = strings[stringIndex];
    if (currentString && index === currentString.start) {
      let cursor = currentString.end;
      while (/\s/.test(trimmed[cursor] ?? "")) cursor += 1;
      if (trimmed[cursor] === ":") {
        const objectKeys = keySets[keySets.length - 1];
        if (!objectKeys) throw protocolError("INVALID_JSON");
        if (objectKeys.has(currentString.value)) throw protocolError("DUPLICATE_JSON_KEY");
        objectKeys.add(currentString.value);
        keys += 1;
        if (keys > maxKeys) throw protocolError("JSON_TOO_MANY_KEYS");
      }
      index = currentString.end - 1;
      stringIndex += 1;
      continue;
    }
    if (trimmed[index] === "{") {
      depth += 1;
      if (depth > maxDepth) throw protocolError("JSON_TOO_DEEP");
      keySets.push(new Set());
    } else if (trimmed[index] === "[") {
      depth += 1;
      if (depth > maxDepth) throw protocolError("JSON_TOO_DEEP");
      keySets.push(null);
    } else if (trimmed[index] === "}" || trimmed[index] === "]") {
      depth -= 1;
      keySets.pop();
      if (depth < 0) throw protocolError("INVALID_JSON");
    }
  }
  if (depth !== 0) throw protocolError("INVALID_JSON");
  let value;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw protocolError("INVALID_JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") throw protocolError("JSON_OBJECT_REQUIRED");
  return value;
}

function boundedEnvironment(tempRoot) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const windir = process.env.WINDIR ?? systemRoot;
  const systemDrive = path.parse(systemRoot).root.replace(/[\\/]$/, "");
  return {
    SystemDrive: systemDrive,
    SystemRoot: systemRoot,
    WINDIR: windir,
    ProgramData: path.join(systemDrive, "ProgramData"),
    ComSpec: path.join(systemRoot, "System32", "cmd.exe"),
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
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: 127, signal: null, error }));
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, error: null }));
  });
}

export class WindowsProcessHostSpikeSession {
  constructor({ child, nodeToHostKey, hostToNodeKey, nonce, tempRoot }) {
    this.child = child;
    this.nodeToHostKey = nodeToHostKey;
    this.hostToNodeKey = hostToNodeKey;
    this.nonce = nonce;
    this.tempRoot = tempRoot;
    this.sendSequence = 1;
    this.parser = new ProcessHostFrameParser({ key: hostToNodeKey, direction: "host-to-node" });
    this.pending = new Map();
    this.events = [];
    this.fatalCode = null;
    this.stderr = Buffer.alloc(0);
    this.exitPromise = waitForExit(child);
    child.stdout.on("data", (chunk) => this.#onData(chunk));
    child.stderr.on("data", (chunk) => {
      const incoming = Buffer.from(chunk);
      const combined = Buffer.concat([this.stderr, incoming]);
      this.stderr = combined.subarray(Math.max(0, combined.length - 16384));
    });
    child.stdout.on("end", () => {
      try {
        this.parser.end();
      } catch (error) {
        this.#rejectAll(error);
      }
    });
    child.once("close", () => this.#rejectAll(protocolError("HOST_CLOSED", this.stderr.toString("utf8") || "Native spike host closed.")));
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  #onData(chunk) {
    let frames;
    try {
      frames = this.parser.push(chunk);
    } catch (error) {
      this.#rejectAll(error);
      return;
    }
    for (const frame of frames) {
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.EVENT_JSON) {
        this.events.push(parseStrictJsonObject(frame.payload));
        continue;
      }
      if (frame.kind === PROCESS_HOST_PROTOCOL.kinds.FATAL) {
        const fatal = parseStrictJsonObject(frame.payload);
        this.fatalCode = fatal.code ?? "HOST_FATAL";
        this.#rejectAll(protocolError(this.fatalCode, this.fatalCode));
        continue;
      }
      const pending = this.pending.get(frame.requestId);
      if (!pending) {
        this.#rejectAll(protocolError("UNKNOWN_RESPONSE_REQUEST"));
        continue;
      }
      this.pending.delete(frame.requestId);
      try {
        pending.resolve({ frame, body: parseStrictJsonObject(frame.payload) });
      } catch (error) {
        pending.reject(error);
      }
    }
  }

  sendFrame(kind, body, { requestId = randomUUID(), flags = 0, processGeneration = 0n } = {}) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), "utf8");
    const frame = encodeProcessHostFrame({
      kind,
      flags,
      sequence: this.sendSequence,
      requestId,
      processGeneration,
      payload,
      key: this.nodeToHostKey
    });
    this.sendSequence += 1;
    if (!this.child.stdin.write(frame)) return new Promise((resolve) => this.child.stdin.once("drain", resolve));
    return undefined;
  }

  request(operation, input = {}, { timeoutMs = 30000 } = {}) {
    if (this.pending.size >= PROCESS_HOST_PROTOCOL.maxInflightPerHost) return Promise.reject(protocolError("HOST_BACKPRESSURE"));
    const requestId = randomUUID().replaceAll("-", "");
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(protocolError("HOST_REQUEST_TIMEOUT"));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
    });
    this.sendFrame(PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON, {
      schemaVersion: 1,
      operation,
      input
    }, { requestId });
    return promise;
  }

  async close() {
    this.child.stdin.end();
    const outcome = await this.exitPromise;
    await fsp.rm(this.tempRoot, { recursive: true, force: true });
    return outcome;
  }

  async abort() {
    this.child.stdin.destroy();
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
    const outcome = await this.exitPromise;
    await fsp.rm(this.tempRoot, { recursive: true, force: true });
    return outcome;
  }
}

export async function startWindowsProcessHostSpike({ platform = process.platform } = {}) {
  if (platform !== "win32") throw protocolError("WINDOWS_HOST_UNAVAILABLE");
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-phase4-host-"));
  const nodeToHostKey = randomBytes(32);
  const hostToNodeKey = randomBytes(32);
  const nonce = randomBytes(32).toString("hex");
  const child = spawn(powershellPath(), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", hostScriptPath
  ], {
    cwd: repositoryRoot,
    env: boundedEnvironment(tempRoot),
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const session = new WindowsProcessHostSpikeSession({ child, nodeToHostKey, hostToNodeKey, nonce, tempRoot });
  child.stdin.write(Buffer.concat([nodeToHostKey, hostToNodeKey]));
  const requestId = randomUUID().replaceAll("-", "");
  const helloPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(requestId);
      reject(protocolError("HELLO_TIMEOUT"));
    }, 30000);
    session.pending.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    });
  });
  session.sendFrame(PROCESS_HOST_PROTOCOL.kinds.HELLO, {
    schemaVersion: 1,
    protocolVersion: 1,
    nonce
  }, { requestId });
  let hello;
  try {
    hello = await helloPromise;
  } catch (error) {
    await session.abort();
    throw error;
  }
  if (hello.frame.kind !== PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK || hello.body.nonce !== nonce || hello.body.protocolVersion !== 1) {
    await session.close();
    throw protocolError("HELLO_MISMATCH");
  }
  return session;
}

async function sha256File(file) {
  return createHash("sha256").update(await fsp.readFile(file)).digest("hex");
}

async function nativeHostSourceIdentity() {
  const files = [
    "windows-conpty-worker.ps1",
    "windows-native-api-inventory-v1.json",
    "windows-process-host-protocol-v1.json",
    "windows-process-host.cs",
    "windows-process-host-spike.mjs",
    "windows-process-host.ps1"
  ];
  return Object.fromEntries(await Promise.all(files.map(async (name) => [name, await sha256File(path.join(scriptDirectory, name))])));
}

function conPtyEvidence(body) {
  return {
    ok: body.ok,
    code: body.code,
    created: body.conPtyCreated,
    resized: body.resized,
    etxDelivered: body.etxDelivered,
    readyObserved: body.outputContainsReady,
    inputAckObserved: body.outputContainsInputAck,
    etxAckObserved: body.outputContainsEtxAck,
    exitCode: body.exitCode,
    timedOut: body.timedOut,
    workerInOwnedJob: body.workerInOwnedJob,
    targetInInheritedJobAtCreation: body.targetInInheritedJobAtCreation,
    closeDurationMs: body.closeDurationMs,
    closeDeadlineMs: body.closeDeadlineMs,
    outputTotalBytes: body.outputTotalBytes,
    outputDroppedBytes: body.outputDroppedBytes,
    outputTruncated: body.outputTruncated
  };
}

async function writeCapabilityEvidence() {
  const session = await startWindowsProcessHostSpike();
  let capabilities;
  let conPty;
  let closeWatchdog;
  let restartedConPty;
  let closed = false;
  try {
    capabilities = (await session.request("capabilities", {})).body;
    conPty = (await session.request("conpty_probe", {}, { timeoutMs: 30000 })).body;
    closeWatchdog = (await session.request("conpty_close_hang_probe", {}, { timeoutMs: 20000 })).body;
    restartedConPty = (await session.request("conpty_probe", {}, { timeoutMs: 30000 })).body;
  } finally {
    await session.close();
    closed = true;
  }
  const report = {
    schemaVersion: 1,
    probeRevision: "phase4-gate-n-v1",
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    windowsRelease: os.release(),
    nodeVersion: process.version,
    protocolVersion: PROCESS_HOST_PROTOCOL.version,
    sourceIdentity: await nativeHostSourceIdentity(),
    capabilities,
    conPty: conPtyEvidence(conPty),
    closeWatchdog: {
      ok: closeWatchdog.ok,
      code: closeWatchdog.code,
      workerTimedOut: closeWatchdog.workerTimedOut,
      workerJobAssignedAtCreation: closeWatchdog.workerJobAssignedAtCreation,
      workerExactHandleList: closeWatchdog.workerExactHandleList,
      workerImageIdentityVerified: closeWatchdog.workerImageIdentityVerified,
      workerElapsedMilliseconds: closeWatchdog.workerElapsedMilliseconds,
      restartSucceeded: restartedConPty.ok === true && restartedConPty.code === "CONPTY_PROBE_OK"
    },
    cleanup: {
      sessionClosed: closed,
      temporaryRootRemoved: !fs.existsSync(session.tempRoot),
      persistentHostChanges: false
    }
  };
  const evidenceDirectory = path.join(repositoryRoot, ".ai-bridge", "phase-4");
  const target = path.join(evidenceDirectory, "native-host-capability.json");
  await fsp.mkdir(evidenceDirectory, { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fsp.rename(temporary, target);
  return report;
}

async function main() {
  if (process.argv.includes("--write-evidence")) {
    const report = await writeCapabilityEvidence();
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, evidence: ".ai-bridge/phase-4/native-host-capability.json", report }, null, 2)}\n`);
    return;
  }
  const session = await startWindowsProcessHostSpike();
  try {
    const { body } = await session.request("capabilities", {});
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error?.code ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
}

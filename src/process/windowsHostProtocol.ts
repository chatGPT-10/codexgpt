import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "..", "..");

export interface ProcessHostProtocolAuthorityV1 {
  name: "CXP4";
  magicHex: string;
  version: 1;
  headerLength: 64;
  tagLength: 16;
  maxFramePayloadBytes: number;
  maxHelloPayloadBytes: number;
  maxInflightPerProcess: number;
  maxInflightPerHost: number;
  maxHostToNodeQueuedBytesPerProcess: number;
  maxHostToNodeQueuedBytesPerHost: number;
  maxNodeToHostQueuedBytesPerProcess: number;
  maxNodeToHostQueuedBytesPerHost: number;
  kinds: Readonly<Record<string, number>>;
  flags: Readonly<Record<string, number>>;
  rules: Readonly<Record<string, number>>;
}

export const PROCESS_HOST_PROTOCOL = Object.freeze(
  JSON.parse(fs.readFileSync(path.join(packageRoot, "scripts", "windows-process-host-protocol-v1.json"), "utf8"))
) as ProcessHostProtocolAuthorityV1;

const HEADER_LENGTH = PROCESS_HOST_PROTOCOL.headerLength;
const TAG_OFFSET = 48;
const MAX_PAYLOAD = PROCESS_HOST_PROTOCOL.maxFramePayloadBytes;
const ALLOWED_KINDS = new Set(Object.values(PROCESS_HOST_PROTOCOL.kinds));

export function processHostError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function allowedFlags(kind: number): number {
  if (kind === PROCESS_HOST_PROTOCOL.kinds.OUTPUT) return PROCESS_HOST_PROTOCOL.flags.STDERR | PROCESS_HOST_PROTOCOL.flags.EOF;
  if (kind === PROCESS_HOST_PROTOCOL.kinds.INPUT) return PROCESS_HOST_PROTOCOL.flags.EOF;
  return 0;
}

function validateKindPayload(kind: number, payloadLength: number): void {
  if (payloadLength > MAX_PAYLOAD) throw processHostError("FRAME_TOO_LARGE");
  if ((kind === PROCESS_HOST_PROTOCOL.kinds.HELLO || kind === PROCESS_HOST_PROTOCOL.kinds.HELLO_ACK) && payloadLength > PROCESS_HOST_PROTOCOL.maxHelloPayloadBytes) {
    throw processHostError("HELLO_TOO_LARGE");
  }
  if (kind === PROCESS_HOST_PROTOCOL.kinds.CREDIT && payloadLength !== PROCESS_HOST_PROTOCOL.rules.creditPayloadBytes) throw processHostError("INVALID_CREDIT_LENGTH");
  if (kind === PROCESS_HOST_PROTOCOL.kinds.CANCEL && payloadLength !== PROCESS_HOST_PROTOCOL.rules.cancelPayloadBytes) throw processHostError("INVALID_CANCEL_LENGTH");
}

function requestIdBytes(requestId?: string | Buffer | null): Buffer {
  if (requestId === undefined || requestId === null) return Buffer.alloc(16);
  if (Buffer.isBuffer(requestId)) {
    if (requestId.length !== 16) throw processHostError("INVALID_REQUEST_ID");
    return Buffer.from(requestId);
  }
  const compact = requestId.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) throw processHostError("INVALID_REQUEST_ID");
  return Buffer.from(compact, "hex");
}

export interface ProcessHostFrameV1 {
  direction: string;
  kind: number;
  flags: number;
  sequence: number;
  requestId: string;
  processGeneration: bigint;
  payload: Buffer;
  frameBytes: number;
}

export function encodeProcessHostFrame(input: {
  kind: number;
  flags?: number;
  sequence: number;
  requestId?: string | Buffer | null;
  processGeneration?: bigint | number;
  payload?: Buffer | Uint8Array | string;
  key: Buffer;
}): Buffer {
  const flags = input.flags ?? 0;
  if (!ALLOWED_KINDS.has(input.kind)) throw processHostError("UNKNOWN_FRAME_KIND");
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || input.sequence > 0xffffffff) throw processHostError("INVALID_SEQUENCE");
  if ((flags & ~allowedFlags(input.kind)) !== 0) throw processHostError("INVALID_FLAGS");
  const payload = Buffer.isBuffer(input.payload) ? input.payload : Buffer.from(input.payload ?? Buffer.alloc(0));
  validateKindPayload(input.kind, payload.length);
  if (!Buffer.isBuffer(input.key) || input.key.length !== 32) throw processHostError("INVALID_HMAC_KEY");
  const header = Buffer.alloc(HEADER_LENGTH);
  Buffer.from(PROCESS_HOST_PROTOCOL.magicHex, "hex").copy(header, 0);
  header.writeUInt16LE(PROCESS_HOST_PROTOCOL.version, 4);
  header.writeUInt16LE(HEADER_LENGTH, 6);
  header.writeUInt16LE(input.kind, 8);
  header.writeUInt16LE(flags, 10);
  header.writeUInt32LE(input.sequence, 12);
  requestIdBytes(input.requestId).copy(header, 16);
  header.writeBigUInt64LE(BigInt(input.processGeneration ?? 0), 32);
  header.writeUInt32LE(payload.length, 40);
  const tag = createHmac("sha256", input.key).update(header.subarray(0, TAG_OFFSET)).update(payload).digest().subarray(0, PROCESS_HOST_PROTOCOL.tagLength);
  tag.copy(header, TAG_OFFSET);
  return Buffer.concat([header, payload]);
}

export function decodeProcessHostFrame(buffer: Buffer | Uint8Array, options: { key: Buffer; expectedSequence?: number; direction?: string }): ProcessHostFrameV1 {
  const bytes = Buffer.from(buffer);
  if (bytes.length < HEADER_LENGTH) throw processHostError("TRUNCATED_HEADER");
  if (!bytes.subarray(0, 4).equals(Buffer.from(PROCESS_HOST_PROTOCOL.magicHex, "hex"))) throw processHostError("BAD_MAGIC");
  if (bytes.readUInt16LE(4) !== PROCESS_HOST_PROTOCOL.version) throw processHostError("BAD_VERSION");
  if (bytes.readUInt16LE(6) !== HEADER_LENGTH) throw processHostError("BAD_HEADER_LENGTH");
  const kind = bytes.readUInt16LE(8);
  const flags = bytes.readUInt16LE(10);
  const sequence = bytes.readUInt32LE(12);
  const payloadLength = bytes.readUInt32LE(40);
  if (!ALLOWED_KINDS.has(kind)) throw processHostError("UNKNOWN_FRAME_KIND");
  if ((flags & ~allowedFlags(kind)) !== 0) throw processHostError("INVALID_FLAGS");
  if (bytes.readUInt32LE(44) !== 0) throw processHostError("NONZERO_RESERVED");
  validateKindPayload(kind, payloadLength);
  if (bytes.length !== HEADER_LENGTH + payloadLength) throw processHostError(bytes.length < HEADER_LENGTH + payloadLength ? "TRUNCATED_PAYLOAD" : "TRAILING_FRAME_BYTES");
  if (options.expectedSequence !== undefined && sequence !== options.expectedSequence) throw processHostError(sequence < options.expectedSequence ? "DUPLICATE_SEQUENCE" : "OUT_OF_ORDER_SEQUENCE");
  if (!Buffer.isBuffer(options.key) || options.key.length !== 32) throw processHostError("INVALID_HMAC_KEY");
  const payload = bytes.subarray(HEADER_LENGTH);
  const expectedTag = createHmac("sha256", options.key).update(bytes.subarray(0, TAG_OFFSET)).update(payload).digest().subarray(0, PROCESS_HOST_PROTOCOL.tagLength);
  if (!timingSafeEqual(expectedTag, bytes.subarray(TAG_OFFSET, TAG_OFFSET + PROCESS_HOST_PROTOCOL.tagLength))) throw processHostError("BAD_AUTH_TAG");
  return Object.freeze({ direction: options.direction ?? "peer", kind, flags, sequence, requestId: bytes.subarray(16, 32).toString("hex"), processGeneration: bytes.readBigUInt64LE(32), payload: Buffer.from(payload), frameBytes: bytes.length });
}

export class ProcessHostFrameParser {
  readonly key: Buffer;
  readonly direction: string;
  readonly maxQueuedBytes: number;
  expectedSequence: number;
  buffer = Buffer.alloc(0);
  fatal = false;

  constructor(options: { key: Buffer; direction?: string; firstSequence?: number; maxQueuedBytes?: number }) {
    if (!Buffer.isBuffer(options.key) || options.key.length !== 32) throw processHostError("INVALID_HMAC_KEY");
    this.key = Buffer.from(options.key);
    this.direction = options.direction ?? "peer";
    this.expectedSequence = options.firstSequence ?? 1;
    this.maxQueuedBytes = options.maxQueuedBytes ?? PROCESS_HOST_PROTOCOL.maxHostToNodeQueuedBytesPerHost;
  }

  push(chunk: Buffer | Uint8Array): ProcessHostFrameV1[] {
    if (this.fatal) throw processHostError("PARSER_FATAL");
    const incoming = Buffer.from(chunk);
    if (this.buffer.length + incoming.length > this.maxQueuedBytes) {
      this.fatal = true;
      throw processHostError("HOST_QUEUE_LIMIT_EXCEEDED");
    }
    this.buffer = Buffer.concat([this.buffer, incoming]);
    const frames: ProcessHostFrameV1[] = [];
    try {
      while (this.buffer.length >= HEADER_LENGTH) {
        const payloadLength = this.buffer.readUInt32LE(40);
        if (payloadLength > MAX_PAYLOAD) throw processHostError("FRAME_TOO_LARGE");
        const frameLength = HEADER_LENGTH + payloadLength;
        if (this.buffer.length < frameLength) break;
        frames.push(decodeProcessHostFrame(this.buffer.subarray(0, frameLength), { key: this.key, expectedSequence: this.expectedSequence, direction: this.direction }));
        this.expectedSequence += 1;
        if (this.expectedSequence > 0xffffffff) throw processHostError("SEQUENCE_EXHAUSTED");
        this.buffer = this.buffer.subarray(frameLength);
      }
      return frames;
    } catch (error) {
      this.fatal = true;
      throw error;
    }
  }

  end(): void {
    if (this.buffer.length !== 0) {
      this.fatal = true;
      throw processHostError(this.buffer.length < HEADER_LENGTH ? "TRUNCATED_HEADER" : "TRUNCATED_PAYLOAD");
    }
  }
}

function scanJsonStrings(text: string): Array<{ start: number; end: number; value: string }> {
  const strings: Array<{ start: number; end: number; value: string }> = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const start = index++;
    let escaped = false;
    while (index < text.length) {
      const char = text[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        strings.push({ start, end: index + 1, value: JSON.parse(text.slice(start, index + 1)) as string });
        break;
      }
      index += 1;
    }
    if (index >= text.length) throw processHostError("INVALID_JSON");
  }
  return strings;
}

export function parseStrictJsonObject(payload: Buffer | Uint8Array, options: { maxBytes?: number; maxDepth?: number; maxKeys?: number; maxStringLength?: number } = {}): Record<string, unknown> {
  const bytes = Buffer.from(payload);
  if (bytes.length > (options.maxBytes ?? MAX_PAYLOAD)) throw processHostError("JSON_TOO_LARGE");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw processHostError("INVALID_UTF8"); }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) throw processHostError("JSON_OBJECT_REQUIRED");
  const strings = scanJsonStrings(trimmed);
  if (strings.some((entry) => entry.value.length > (options.maxStringLength ?? 16_384))) throw processHostError("JSON_STRING_TOO_LONG");
  let depth = 0;
  let keys = 0;
  const keySets: Array<Set<string> | null> = [];
  let stringIndex = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const currentString = strings[stringIndex];
    if (currentString && index === currentString.start) {
      let cursor = currentString.end;
      while (/\s/.test(trimmed[cursor] ?? "")) cursor += 1;
      if (trimmed[cursor] === ":") {
        const objectKeys = keySets[keySets.length - 1];
        if (!objectKeys) throw processHostError("INVALID_JSON");
        if (objectKeys.has(currentString.value)) throw processHostError("DUPLICATE_JSON_KEY");
        objectKeys.add(currentString.value);
        if (++keys > (options.maxKeys ?? 256)) throw processHostError("JSON_TOO_MANY_KEYS");
      }
      index = currentString.end - 1;
      stringIndex += 1;
      continue;
    }
    if (trimmed[index] === "{") { if (++depth > (options.maxDepth ?? 16)) throw processHostError("JSON_TOO_DEEP"); keySets.push(new Set()); }
    else if (trimmed[index] === "[") { if (++depth > (options.maxDepth ?? 16)) throw processHostError("JSON_TOO_DEEP"); keySets.push(null); }
    else if (trimmed[index] === "}" || trimmed[index] === "]") { depth -= 1; keySets.pop(); if (depth < 0) throw processHostError("INVALID_JSON"); }
  }
  if (depth !== 0) throw processHostError("INVALID_JSON");
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { throw processHostError("INVALID_JSON"); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw processHostError("JSON_OBJECT_REQUIRED");
  return value as Record<string, unknown>;
}

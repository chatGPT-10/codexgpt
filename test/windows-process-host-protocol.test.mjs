import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROCESS_HOST_PROTOCOL,
  ProcessHostFrameParser,
  WindowsProcessHostSpikeSession,
  decodeProcessHostFrame,
  encodeProcessHostFrame,
  parseStrictJsonObject
} from "../scripts/windows-process-host-spike.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function frame(overrides = {}) {
  return encodeProcessHostFrame({
    kind: PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON,
    sequence: 1,
    requestId: "00112233445566778899aabbccddeeff",
    payload: Buffer.from('{"schemaVersion":1}', "utf8"),
    key: Buffer.alloc(32, 0x11),
    ...overrides
  });
}

function errorCode(fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(typeof error.code, "string");
    return error.code;
  }
  assert.fail("Expected protocol operation to throw.");
}

test("CXP4 protocol authority freezes the exact 64-byte frame layout and limits", async () => {
  const authority = JSON.parse(await fs.readFile(path.join(repositoryRoot, "scripts", "windows-process-host-protocol-v1.json"), "utf8"));
  assert.deepEqual(PROCESS_HOST_PROTOCOL, authority);
  assert.equal(authority.magicHex, "43585034");
  assert.equal(authority.version, 1);
  assert.equal(authority.headerLength, 64);
  assert.equal(authority.tagLength, 16);
  assert.equal(authority.maxFramePayloadBytes, 65536);
  assert.deepEqual(authority.kinds, {
    HELLO: 1,
    HELLO_ACK: 2,
    REQUEST_JSON: 16,
    RESPONSE_JSON: 17,
    EVENT_JSON: 18,
    OUTPUT: 32,
    INPUT: 33,
    CREDIT: 34,
    CANCEL: 35,
    FATAL: 127
  });
});

test("frame encoding authenticates header bytes 0..47 and exact payload with a directional key", () => {
  const key = randomBytes(32);
  const encoded = frame({ key, processGeneration: 27n, flags: 0 });
  assert.equal(encoded.length, 64 + Buffer.byteLength('{"schemaVersion":1}'));
  assert.equal(encoded.subarray(0, 4).toString("hex"), "43585034");
  assert.equal(encoded.readUInt16LE(4), 1);
  assert.equal(encoded.readUInt16LE(6), 64);
  assert.equal(encoded.readUInt32LE(12), 1);
  assert.equal(encoded.readBigUInt64LE(32), 27n);
  assert.equal(encoded.readUInt32LE(44), 0);
  const decoded = decodeProcessHostFrame(encoded, { key, expectedSequence: 1, direction: "node-to-host" });
  assert.equal(decoded.kind, PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON);
  assert.equal(decoded.requestId, "00112233445566778899aabbccddeeff");
  assert.equal(decoded.payload.toString("utf8"), '{"schemaVersion":1}');

  const reflectedKey = randomBytes(32);
  assert.equal(errorCode(() => decodeProcessHostFrame(encoded, { key: reflectedKey, expectedSequence: 1 })), "BAD_AUTH_TAG");
  const corruptedPayload = Buffer.from(encoded);
  corruptedPayload[corruptedPayload.length - 1] ^= 1;
  assert.equal(errorCode(() => decodeProcessHostFrame(corruptedPayload, { key, expectedSequence: 1 })), "BAD_AUTH_TAG");
  const corruptedHeader = Buffer.from(encoded);
  corruptedHeader.writeBigUInt64LE(28n, 32);
  assert.equal(errorCode(() => decodeProcessHostFrame(corruptedHeader, { key, expectedSequence: 1 })), "BAD_AUTH_TAG");
});

test("protocol parser rejects unknown, duplicate, out-of-order, oversized, malformed, and truncated frames", () => {
  const key = Buffer.alloc(32, 0x22);
  const valid = frame({ key });

  const duplicateParser = new ProcessHostFrameParser({ key });
  assert.equal(duplicateParser.push(valid).length, 1);
  assert.equal(errorCode(() => duplicateParser.push(valid)), "DUPLICATE_SEQUENCE");

  const outOfOrder = frame({ key, sequence: 2 });
  assert.equal(errorCode(() => new ProcessHostFrameParser({ key }).push(outOfOrder)), "OUT_OF_ORDER_SEQUENCE");

  const unknown = Buffer.from(valid);
  unknown.writeUInt16LE(0x55, 8);
  assert.equal(errorCode(() => decodeProcessHostFrame(unknown, { key, expectedSequence: 1 })), "UNKNOWN_FRAME_KIND");

  const badVersion = Buffer.from(valid);
  badVersion.writeUInt16LE(2, 4);
  assert.equal(errorCode(() => decodeProcessHostFrame(badVersion, { key, expectedSequence: 1 })), "BAD_VERSION");

  const badFlags = frame({ key, flags: 0 });
  badFlags.writeUInt16LE(0x0001, 10);
  assert.equal(errorCode(() => decodeProcessHostFrame(badFlags, { key, expectedSequence: 1 })), "INVALID_FLAGS");

  const badReserved = Buffer.from(valid);
  badReserved.writeUInt32LE(1, 44);
  assert.equal(errorCode(() => decodeProcessHostFrame(badReserved, { key, expectedSequence: 1 })), "NONZERO_RESERVED");

  const oversizedHeader = Buffer.alloc(64);
  Buffer.from("43585034", "hex").copy(oversizedHeader);
  oversizedHeader.writeUInt16LE(1, 4);
  oversizedHeader.writeUInt16LE(64, 6);
  oversizedHeader.writeUInt16LE(PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON, 8);
  oversizedHeader.writeUInt32LE(1, 12);
  oversizedHeader.writeUInt32LE(65537, 40);
  assert.equal(errorCode(() => new ProcessHostFrameParser({ key }).push(oversizedHeader)), "FRAME_TOO_LARGE");

  const truncated = new ProcessHostFrameParser({ key });
  truncated.push(valid.subarray(0, valid.length - 1));
  assert.equal(errorCode(() => truncated.end()), "TRUNCATED_PAYLOAD");
});

test("kind-specific flags and payload lengths are strict", () => {
  const key = Buffer.alloc(32, 0x33);
  assert.doesNotThrow(() => encodeProcessHostFrame({
    kind: PROCESS_HOST_PROTOCOL.kinds.OUTPUT,
    flags: PROCESS_HOST_PROTOCOL.flags.STDERR | PROCESS_HOST_PROTOCOL.flags.EOF,
    sequence: 1,
    requestId: Buffer.alloc(16),
    payload: Buffer.from("x"),
    key
  }));
  assert.equal(errorCode(() => encodeProcessHostFrame({
    kind: PROCESS_HOST_PROTOCOL.kinds.RESPONSE_JSON,
    flags: PROCESS_HOST_PROTOCOL.flags.EOF,
    sequence: 1,
    requestId: Buffer.alloc(16),
    payload: Buffer.alloc(0),
    key
  })), "INVALID_FLAGS");
  assert.equal(errorCode(() => encodeProcessHostFrame({
    kind: PROCESS_HOST_PROTOCOL.kinds.CREDIT,
    sequence: 1,
    requestId: Buffer.alloc(16),
    payload: Buffer.alloc(7),
    key
  })), "INVALID_CREDIT_LENGTH");
  assert.equal(errorCode(() => encodeProcessHostFrame({
    kind: PROCESS_HOST_PROTOCOL.kinds.CANCEL,
    sequence: 1,
    requestId: Buffer.alloc(16),
    payload: Buffer.from("x"),
    key
  })), "INVALID_CANCEL_LENGTH");
});

test("strict JSON enforces UTF-8 object roots, duplicate-key rejection, and structural bounds", () => {
  assert.deepEqual(parseStrictJsonObject(Buffer.from('{"a":1,"nested":{"b":"ok"}}')), { a: 1, nested: { b: "ok" } });
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from('{"a":1,"a":2}'))), "DUPLICATE_JSON_KEY");
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from('{"a":{"b":1,"b":2}}'))), "DUPLICATE_JSON_KEY");
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from("[]"))), "JSON_OBJECT_REQUIRED");
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from([0xc3, 0x28]))), "INVALID_UTF8");
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from('{"a":{"b":{"c":1}}}'), { maxDepth: 2 })), "JSON_TOO_DEEP");
  assert.equal(errorCode(() => parseStrictJsonObject(Buffer.from('{"a":1,"b":2}'), { maxKeys: 1 })), "JSON_TOO_MANY_KEYS");
});

test("parser queue cap is fatal and does not retain unbounded partial input", () => {
  const key = Buffer.alloc(32, 0x44);
  const parser = new ProcessHostFrameParser({ key, maxQueuedBytes: 128 });
  assert.equal(errorCode(() => parser.push(Buffer.alloc(129))), "HOST_QUEUE_LIMIT_EXCEEDED");
  assert.equal(errorCode(() => parser.push(Buffer.alloc(1))), "PARSER_FATAL");
});

test("startup abort terminates the exact spawned host and removes its temporary root", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-host-abort-test-"));
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    child.exitCode = 1;
    queueMicrotask(() => child.emit("close", 1, null));
    return true;
  };

  const session = new WindowsProcessHostSpikeSession({
    child,
    nodeToHostKey: Buffer.alloc(32, 0x55),
    hostToNodeKey: Buffer.alloc(32, 0x66),
    nonce: "n".repeat(64),
    tempRoot
  });
  const outcome = await session.abort();
  assert.equal(child.killCalls, 1);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(outcome.code, 1);
  await assert.rejects(fs.stat(tempRoot), (error) => error?.code === "ENOENT");

  const source = await fs.readFile(path.join(repositoryRoot, "scripts", "windows-process-host-spike.mjs"), "utf8");
  assert.match(source, /catch \(error\) \{\s*await session\.abort\(\);\s*throw error;\s*\}/);
});

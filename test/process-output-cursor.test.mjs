import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { OutputCursorCodec } = await tsImport("../fixtures/ts-imports/process-output-imports.ts", import.meta.url);

test("AEAD cursor hides offsets and rejects forge, context, version, and expiry drift", () => {
  let now = 1000;
  const codec = new OutputCursorCodec({ key: Buffer.alloc(32, 7), now: () => now, randomBytes: (n) => Buffer.alloc(n, 9) });
  const cursor = codec.encode({ processId: "process_" + "1".repeat(32), generation: 3, sequence: 99, offset: 7, contextFingerprint: "ctx-a", expiresAt: 2000 });
  assert.doesNotMatch(cursor, /99|ctx-a|process_/);
  assert.equal(codec.decode(cursor, { processId: "process_" + "1".repeat(32), generation: 3, contextFingerprint: "ctx-a" }).offset, 7);
  assert.throws(() => codec.decode(cursor.slice(0, -1) + "A", { processId: "process_" + "1".repeat(32), generation: 3, contextFingerprint: "ctx-a" }), /invalid/i);
  assert.throws(() => codec.decode(cursor, { processId: "process_" + "1".repeat(32), generation: 3, contextFingerprint: "ctx-b" }), /context/i);
  now = 2000;
  assert.throws(() => codec.decode(cursor, { processId: "process_" + "1".repeat(32), generation: 3, contextFingerprint: "ctx-a" }), /expired/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { OutputRing, StreamingRedactor } = await tsImport("../fixtures/ts-imports/process-output-imports.ts", import.meta.url);

test("ring evicts oldest bytes and old cursors resume with truncation", () => {
  const ring = new OutputRing({ capacityBytes: 5 });
  ring.append("stdout", "abc");
  ring.append("stderr", "def");
  const page = ring.read({ sequence: 0, offset: 0, maxBytes: 5 });
  assert.equal(page.chunks.map((x) => x.text).join(""), "bcdef");
  assert.equal(page.truncated, true);
});

test("max_bytes=1 resumes inside a chunk without loss or duplication", () => {
  const ring = new OutputRing({ capacityBytes: 32 });
  ring.append("stdout", "abcd");
  let cursor = { sequence: 0, offset: 0 };
  let output = "";
  for (let i = 0; i < 4; i += 1) {
    const page = ring.read({ ...cursor, maxBytes: 1 });
    output += page.chunks[0].text;
    cursor = page.next;
  }
  assert.equal(output, "abcd");
});

test("waiters wake on output/exit and cancellation leaves no waiter", async () => {
  const ring = new OutputRing({ capacityBytes: 32 });
  const controller = new AbortController();
  const cancelled = ring.waitForChange({ sequence: 0, signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, /abort/i);
  assert.equal(ring.waiterCount(), 0);
  const waiting = ring.waitForChange({ sequence: 0 });
  ring.close();
  assert.equal((await waiting).eof, true);
});

test("UTF-8 eviction and one-byte pages never retain or project split scalars", () => {
  const ring = new OutputRing({ capacityBytes: 4 });
  ring.append("stdout", "a€b");
  const page = ring.read({ sequence: 0, offset: 0, maxBytes: 1 });
  assert.doesNotMatch(page.chunks.map((x) => x.text).join(""), /�/);
});

test("secret filtering is explicit before retention", () => {
  const ring = new OutputRing({ capacityBytes: 256 });
  const redactor = new StreamingRedactor();
  ring.appendRedacted("stdout", redactor, Buffer.from("Authorization: Bearer abcdefghijkl done"));
  ring.append("stdout", redactor.end());
  const page = ring.read({ sequence: 0, offset: 0, maxBytes: 256 });
  const projected = page.chunks.map((x) => x.text).join("");
  assert.doesNotMatch(projected, /abcdefghijkl/);
  assert.match(projected, /REDACTED_SECRET/);
});

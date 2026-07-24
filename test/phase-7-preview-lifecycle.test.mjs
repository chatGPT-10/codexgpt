import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { SemanticPreviewStore } from "../dist/semantic/previewStore.js";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function plan(workspaceId = "ws_preview", path = "src/value.ts", generation = 1) {
  const before = "export const value = 1;\n";
  const after = "export const renamed = 1;\n";
  return {
    workspaceId,
    workspaceBindingDigest: `sha256:${"9".repeat(64)}`,
    providerGeneration: generation,
    providerFacts: { provider: "builtin-typescript", engineVersion: "5.9.3" },
    oldName: "value",
    newName: "renamed",
    files: [{
      snapshot: {
        relativePath: path,
        canonicalPathKey: `C:/fixture/${path}`.toLocaleLowerCase("en-US"),
        canonicalParentPathKey: "c:/fixture/src",
        parentIdentity: `parent_${"8".repeat(24)}`,
        utf8Text: before,
        sha256: digest(before),
        stableIdentity: { dev: "7", ino: "11", nlink: 1 },
        language: "typescript",
        bytes: Buffer.byteLength(before)
      },
      edits: [{ path, start: 13, length: 5, newText: "renamed" }],
      resultingText: after,
      resultingSha256: digest(after)
    }]
  };
}

function randomSequence() {
  let value = 0;
  return (size) => Buffer.alloc(size, ++value);
}

test("semantic previews are opaque, workspace-bound, monotonic-TTL bounded, and single-use", () => {
  let monotonic = 100;
  const store = new SemanticPreviewStore({
    ttlMs: 1_000,
    monotonicNow: () => monotonic,
    wallNow: () => 5_000,
    random: randomSequence()
  });
  const created = store.create(plan(), 2_000);
  assert.match(created.preview_id, /^sp_[A-Za-z0-9_-]{32}$/);
  assert.equal("sha256" in created.files[0], false);
  assert.match(store.resolve(created.preview_id, "ws_preview").semanticFactsDigest, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => store.resolve(created.preview_id, "ws_foreign"), /unavailable/);

  store.reserve(created.preview_id, "invocation-1", "ws_preview");
  assert.throws(() => store.reserve(created.preview_id, "invocation-2", "ws_preview"), /unavailable/);
  store.consume(created.preview_id, "invocation-1");
  assert.throws(() => store.resolve(created.preview_id, "ws_preview"), /unavailable/);

  const expiring = store.create(plan(), 2_000);
  monotonic = 1_101;
  assert.throws(() => store.resolve(expiring.preview_id, "ws_preview"), /unavailable/);
});

test("preview quotas evict only ready plans and never displace a reserved transaction", () => {
  const store = new SemanticPreviewStore({
    maxPerWorkspace: 1,
    random: randomSequence()
  });
  const unused = store.create(plan(), 2_000);
  const replacement = store.create(plan(), 2_000);
  assert.throws(() => store.resolve(unused.preview_id), /unavailable/);
  store.reserve(replacement.preview_id, "invocation-1");
  assert.throws(() => store.create(plan(), 2_000), /workspace storage is full/);
  assert.throws(() => store.resolve(replacement.preview_id), /unavailable/);
});

test("workspace and changed-path invalidation remove every related preview without touching others", () => {
  const store = new SemanticPreviewStore({ random: randomSequence() });
  const first = store.create(plan("ws_one", "src/a.ts"), 2_000);
  const second = store.create(plan("ws_one", "src/b.ts"), 2_000);
  const foreign = store.create(plan("ws_two", "src/a.ts"), 2_000);
  store.invalidatePaths("ws_one", ["src\\a.ts"]);
  assert.throws(() => store.resolve(first.preview_id), /unavailable/);
  assert.equal(store.resolve(second.preview_id).plan.workspaceId, "ws_one");
  assert.equal(store.resolve(foreign.preview_id).plan.workspaceId, "ws_two");
  store.invalidateWorkspace("ws_one");
  assert.throws(() => store.resolve(second.preview_id), /unavailable/);
  assert.equal(store.resolve(foreign.preview_id).plan.workspaceId, "ws_two");
});

test("terminal previews are reclaimed and retained text counts toward the byte budget", () => {
  const store = new SemanticPreviewStore({
    maxPerWorkspace: 1,
    maxTotalBytes: 8_000,
    random: randomSequence()
  });
  for (let index = 0; index < 25; index += 1) {
    const created = store.create(plan(), 2_000);
    store.burn(created.preview_id);
  }
  assert.doesNotThrow(() => store.create(plan(), 2_000));

  const oversized = plan("ws_large");
  oversized.files[0].snapshot.utf8Text = "x".repeat(5_000);
  oversized.files[0].resultingText = "y".repeat(5_000);
  assert.throws(() => store.create(oversized, 2_000), /too large/);
});

test("rename preview shows late edit hunks with bounded context and redacts secret-looking text", () => {
  const lines = Array.from({ length: 300 }, (_, index) => `// line ${index + 1}`);
  lines[248] = "const API_TOKEN = \"abcdefghijklmnopqrstuvwxyz123456\";";
  lines[249] = "export const value = 1;";
  const before = `${lines.join("\n")}\n`;
  const start = before.indexOf("value");
  const after = `${before.slice(0, start)}renamed${before.slice(start + 5)}`;
  const custom = plan("ws_hunk");
  custom.files[0].snapshot.utf8Text = before;
  custom.files[0].snapshot.sha256 = digest(before);
  custom.files[0].snapshot.byteLength = Buffer.byteLength(before);
  custom.files[0].snapshot.lineIndex = [0];
  custom.files[0].edits = [{ path: "src/value.ts", start, length: 5, newText: "renamed" }];
  custom.files[0].resultingText = after;
  custom.files[0].resultingSha256 = digest(after);
  const created = new SemanticPreviewStore({ random: randomSequence() }).create(custom, 4_000);
  assert.match(created.diff_preview, /renamed/);
  assert.match(created.diff_preview, /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(created.diff_preview, /abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(created.diff_preview, /line 1\b/);
  assert.equal(created.preview_truncated, false);
  assert.equal(created.omitted_preview_chars, 0);
});

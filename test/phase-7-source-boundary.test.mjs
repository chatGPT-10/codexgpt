import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const source = await tsImport("../src/semantic/sourceSnapshot.ts", import.meta.url).catch(() => null);
const positions = await tsImport("../src/semantic/positions.ts", import.meta.url).catch(() => null);
const guardModule = await tsImport("../src/guard.ts", import.meta.url).catch(() => null);

async function withRoot(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-source-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

test("semantic snapshots use the canonical same-handle reader and bind content identity", async () => {
  assert.ok(source);
  await withRoot(async (root) => {
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "main.ts"), "export const value = 1;\n", "utf8");
    const snapshot = await source.readSemanticSourceSnapshot({
      root,
      relativePath: "src/main.ts",
      maxBytes: 1024,
      blockedGlobs: [".env", ".env.*"]
    });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.snapshot.relativePath, "src/main.ts");
    assert.equal(snapshot.snapshot.language, "typescript");
    assert.equal(snapshot.snapshot.utf8Text, "export const value = 1;\n");
    assert.match(snapshot.snapshot.sha256, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.snapshot.stableIdentity.nlink, 1);
    assert.equal(Object.isFrozen(snapshot.snapshot), true);
  });
});

test("semantic snapshots reject hardlinks, blocked files, invalid UTF-8, and replacement races", async () => {
  assert.ok(source);
  await withRoot(async (root) => {
    const original = path.join(root, "original.ts");
    const hardlink = path.join(root, "linked.ts");
    await fs.writeFile(original, "export {};\n");
    await fs.link(original, hardlink);
    await fs.writeFile(path.join(root, ".env"), "SECRET=value\n");
    await fs.writeFile(path.join(root, "invalid.ts"), Buffer.from([0xc3, 0x28]));
    await fs.writeFile(path.join(root, "replace.ts"), "before");
    await fs.writeFile(path.join(root, "replacement.ts"), "after!");

    assert.equal((await source.readSemanticSourceSnapshot({
      root,
      relativePath: "linked.ts",
      maxBytes: 1024,
      blockedGlobs: [".env"]
    })).reason, "SOURCE_HARDLINK_UNSAFE");
    assert.equal((await source.readSemanticSourceSnapshot({
      root,
      relativePath: ".env",
      maxBytes: 1024,
      blockedGlobs: [".env"]
    })).reason, "SOURCE_BLOCKED");
    assert.equal((await source.readSemanticSourceSnapshot({
      root,
      relativePath: "invalid.ts",
      maxBytes: 1024,
      blockedGlobs: []
    })).reason, "SOURCE_NOT_TEXT");
    assert.equal((await source.readSemanticSourceSnapshot({
      root,
      relativePath: "replace.ts",
      maxBytes: 1024,
      blockedGlobs: [],
      testHooks: {
        afterOpen: async () => {
          await fs.rename(path.join(root, "replace.ts"), path.join(root, "old.ts"));
          await fs.rename(path.join(root, "replacement.ts"), path.join(root, "replace.ts"));
        }
      }
    })).reason, "SOURCE_IDENTITY_CHANGED");
  });
});

test("parent identity distinguishes a reused directory object generation", () => {
  assert.ok(guardModule);
  const initial = guardModule.parentObjectIdentity("/workspace/src", {
    dev: 7n,
    ino: 11n,
    birthtimeNs: 13n,
    ctimeNs: 17n
  });
  const replaced = guardModule.parentObjectIdentity("/workspace/src", {
    dev: 7n,
    ino: 11n,
    birthtimeNs: 19n,
    ctimeNs: 23n
  });
  const fallbackInitial = guardModule.parentObjectIdentity("/workspace/src", {
    dev: 7n,
    ino: 11n,
    birthtimeNs: 0n,
    ctimeNs: 29n
  });
  const fallbackReplaced = guardModule.parentObjectIdentity("/workspace/src", {
    dev: 7n,
    ino: 11n,
    birthtimeNs: 0n,
    ctimeNs: 31n
  });
  assert.notEqual(initial, replaced);
  assert.notEqual(fallbackInitial, fallbackReplaced);
});

test("public positions use one-based Unicode code points across BOM, CRLF, and surrogate pairs", () => {
  assert.ok(positions);
  const snapshot = positions.createLineIndex("\uFEFFconst emoji = \"😀e\u0301\";\r\nnext();\n");
  const emojiColumn = 16;
  const offset = positions.publicPositionToOffset(snapshot, { line: 1, column: emojiColumn });
  assert.equal(snapshot.text.slice(offset, offset + 2), "😀");
  assert.deepEqual(positions.offsetToPublicPosition(snapshot, offset), { line: 1, column: emojiColumn });
  assert.deepEqual(positions.offsetToPublicPosition(snapshot, snapshot.text.indexOf("next")), { line: 2, column: 1 });
  assert.throws(() => positions.publicPositionToOffset(snapshot, { line: 0, column: 1 }), /position/i);
  assert.throws(() => positions.publicPositionToOffset(snapshot, { line: 1, column: 10_000 }), /position/i);
});

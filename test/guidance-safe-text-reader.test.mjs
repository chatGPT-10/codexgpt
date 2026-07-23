import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const reader = await tsImport("../src/guidance/safeTextReader.ts", import.meta.url).catch(() => null);

async function withRoot(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-guidance-reader-"));
  const root = await fs.realpath(created);
  try { return await callback(root); } finally { await fs.rm(created, { recursive: true, force: true }); }
}

test("safe guidance reader returns exact UTF-8 bytes from one bounded handle", async () => {
  assert.ok(reader);
  await withRoot(async (root) => {
    await fs.writeFile(path.join(root, "AGENTS.md"), "hello π\n", "utf8");
    const result = await reader.readGuidanceText({
      root,
      relativePath: "AGENTS.md",
      maxBytes: Buffer.byteLength("hello π\n"),
      blockedGlobs: [".env", ".env.*"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "hello π\n");
    assert.equal(result.sourceBytes, Buffer.byteLength("hello π\n"));
    assert.equal(result.returnedBytes, result.sourceBytes);
    assert.equal(result.path, "AGENTS.md");
  });
});

test("safe guidance reader rejects blocked, binary, oversized, and hardlinked content", async () => {
  assert.ok(reader);
  await withRoot(async (root) => {
    await fs.writeFile(path.join(root, ".env"), "SECRET=value\n");
    await fs.writeFile(path.join(root, "binary.md"), Buffer.from([65, 0, 66]));
    await fs.writeFile(path.join(root, "large.md"), "12345");
    const original = path.join(root, "original.md");
    const linked = path.join(root, "AGENTS.md");
    await fs.writeFile(original, "linked");
    await fs.link(original, linked);

    assert.equal((await reader.readGuidanceText({ root, relativePath: ".env", maxBytes: 100, blockedGlobs: [".env"] })).reason, "READ_BLOCKED");
    assert.equal((await reader.readGuidanceText({ root, relativePath: "binary.md", maxBytes: 100, blockedGlobs: [] })).reason, "READ_NOT_TEXT");
    assert.equal((await reader.readGuidanceText({ root, relativePath: "large.md", maxBytes: 4, blockedGlobs: [] })).reason, "READ_TOO_LARGE");
    assert.equal((await reader.readGuidanceText({ root, relativePath: "AGENTS.md", maxBytes: 100, blockedGlobs: [] })).reason, "READ_HARDLINK_UNSAFE");
  });
});

test("safe guidance reader detects deterministic replacement after open", async () => {
  assert.ok(reader);
  await withRoot(async (root) => {
    const target = path.join(root, "AGENTS.md");
    const replacement = path.join(root, "replacement.md");
    await fs.writeFile(target, "trusted");
    await fs.writeFile(replacement, "changed");
    const result = await reader.readGuidanceText({
      root,
      relativePath: "AGENTS.md",
      maxBytes: 100,
      blockedGlobs: [],
      testHooks: {
        afterOpen: async () => {
          await fs.rename(target, path.join(root, "old.md"));
          await fs.rename(replacement, target);
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "READ_IDENTITY_CHANGED");
    assert.equal("text" in result, false);
  });
});

test("safe guidance reader rejects same-size in-place mutation during the read", async () => {
  assert.ok(reader);
  await withRoot(async (root) => {
    await fs.writeFile(path.join(root, "AGENTS.md"), "before");
    const result = await reader.readGuidanceText({
      root,
      relativePath: "AGENTS.md",
      maxBytes: 100,
      blockedGlobs: [],
      testHooks: {
        afterRead: async () => {
          await fs.writeFile(path.join(root, "AGENTS.md"), "after!");
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "READ_IDENTITY_CHANGED");
  });
});

test("safe guidance reader rejects canonical parent replacement after open", async (context) => {
  assert.ok(reader);
  if (process.platform !== "win32") {
    context.skip("Windows junction replacement fixture");
    return;
  }
  await withRoot(async (root) => {
    const original = path.join(root, "original");
    const moved = path.join(root, "moved");
    await fs.mkdir(original);
    await fs.writeFile(path.join(original, "AGENTS.md"), "trusted");
    const result = await reader.readGuidanceText({
      root,
      relativePath: "original/AGENTS.md",
      maxBytes: 100,
      blockedGlobs: [],
      testHooks: {
        afterOpen: async () => {
          await fs.rename(original, moved);
          await fs.symlink(moved, original, "junction");
        }
      }
    });
    assert.equal(result.ok, false);
    assert.ok(["READ_IDENTITY_CHANGED", "READ_FAILED"].includes(result.reason));
  });
});

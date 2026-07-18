import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildTaskTreeManifest } from "../dist/worktrees/treeManifest.js";
import { materializeTaskTree } from "../dist/worktrees/materializer.js";
import { withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("raw task tree materializer writes exact committed bytes without checkout integrations", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const repository = await fixture.manager.primaryRepository(fixture.workspace);
    const manifest = await buildTaskTreeManifest({
      executor: fixture.executor,
      repository,
      treeish: "HEAD",
      guard: fixture.guard,
      maxFiles: 100,
      maxBytes: 1024 * 1024
    });
    const target = path.join(fixture.root.root, `task_${"1".repeat(32)}`);
    const result = await materializeTaskTree({
      root: fixture.root,
      target,
      executor: fixture.executor,
      repository,
      manifest
    });
    assert.equal(await fs.readFile(path.join(target, "tracked.txt"), "utf8"), "alpha\n");
    assert.equal(result.totalBytes, manifest.totalBytes);
    assert.equal(fixture.calls.some((args) => args[0] === "checkout"), false);
  });
});

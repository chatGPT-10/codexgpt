import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { admitManagedWorktreeRoot } from "../dist/worktrees/root.js";

test("managed worktree root is canonical, fixed-volume, and disjoint from protected roots", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-worktree-root-"));
  try {
    const managed = path.join(base, "managed");
    const protectedRoot = path.join(base, "protected");
    await fs.mkdir(managed);
    await fs.mkdir(protectedRoot);
    const result = await admitManagedWorktreeRoot({ root: managed, protectedRoots: [protectedRoot] });
    assert.equal(result.root, await fs.realpath(managed));
    assert.match(result.identity, /^[a-f0-9]{64}$/);
    await assert.rejects(() => admitManagedWorktreeRoot({
      root: path.join(protectedRoot, "nested"),
      protectedRoots: [protectedRoot],
      create: true
    }), /TASK_WORKTREE_ROOT_UNSAFE/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

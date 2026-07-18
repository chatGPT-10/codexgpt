import assert from "node:assert/strict";
import test from "node:test";
import { TaskWorktreeStoreV1 } from "../dist/worktrees/store.js";
import { withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("task store persists sealed owner-bound records across store reconstruction", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = fixture.store.create({
      managedRoot: fixture.root.root,
      ownerFingerprint: fixture.ownerFingerprint,
      repositoryId: `repo_${"1".repeat(32)}`,
      branchRef: "refs/heads/codex/test-1234",
      targetRef: "refs/heads/main",
      branchId: `branch_${"2".repeat(32)}`,
      targetBranchId: `branch_${"3".repeat(32)}`,
      baseOid: "4".repeat(40)
    });
    const reopened = new TaskWorktreeStoreV1({
      stateRoot: fixture.stateRoot,
      masterKey: Buffer.alloc(32, 71)
    });
    const read = reopened.read(created.record.taskWorktreeId);
    assert.equal(read.privateState.ownerFingerprint, fixture.ownerFingerprint);
    assert.equal(read.privateState.worktreePath.includes(created.record.taskWorktreeId), true);
    assert.equal(reopened.list("e".repeat(64)).length, 0);
  });
});

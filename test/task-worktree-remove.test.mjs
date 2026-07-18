import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createTaskWorktree, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("clean task removal is reviewed, revokes handles, and retains the branch", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove clean task"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    const removed = await fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    });
    assert.equal(removed.removed, true);
    assert.equal(await fs.stat(item.privateState.worktreePath).then(() => true).catch(() => false), false);
    const branch = await fixture.executor.run(
      await fixture.manager.primaryRepository(fixture.workspace),
      ["show-ref", "--verify", item.privateState.branchRef]
    );
    assert.equal(branch.status, 0);
    assert.throws(() => fixture.authority.getWorkspace(created.workspace_id), /TASK_WORKTREE_NOT_FOUND/);
  });
});

test("task removal rechecks cleanliness immediately before deletion", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove race task"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    const lateFile = path.join(item.privateState.worktreePath, "late.txt");
    await fs.writeFile(lateFile, "must survive\n");
    await assert.rejects(() => fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    }), /TASK_WORKTREE_DIRTY/);
    assert.equal(await fs.readFile(lateFile, "utf8"), "must survive\n");
  });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("task worktree create/list/get persists the artifact and rotates session workspace handles", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard
    });
    const reviewed = await fixture.service.create({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      taskName: "Implement bounded worktree"
    });
    assert.throws(
      () => fixture.store.read(reviewed.task_worktree_id),
      /TRANSACTION_STATE_CORRUPT|TASK_WORKTREE_NOT_FOUND/
    );
    assert.equal(
      await fs.stat(path.join(fixture.root.root, reviewed.task_worktree_id))
        .then(() => true)
        .catch(() => false),
      false
    );
    const repository = await fixture.manager.primaryRepository(fixture.workspace);
    const reviewFacts = fixture.reviews.inspect(reviewed.review_token, "task_create");
    const branchBefore = await fixture.executor.run(repository, [
      "for-each-ref", "--format=%(refname)", reviewFacts.branchRef
    ]);
    assert.equal(branchBefore.status, 0);
    assert.equal(branchBefore.stdout.length, 0);
    const created = await fixture.service.create({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      reviewToken: reviewed.review_token,
      authorization: fixture.authorization
    });
    assert.equal(created.task.state, "ready");
    assert.equal(await fs.readFile(path.join(
      fixture.store.read(created.task.task_worktree_id).privateState.worktreePath,
      "tracked.txt"
    ), "utf8"), "alpha\n");
    const listed = await fixture.service.list({ workspace: fixture.workspace });
    assert.deepEqual(listed.tasks.map((task) => task.task_worktree_id), [created.task.task_worktree_id]);
    const opened = await fixture.service.get({ taskWorktreeId: created.task.task_worktree_id });
    assert.notEqual(opened.workspace_id, created.workspace_id);
    assert.equal(opened.access_class, "task_worktree");
  });
});

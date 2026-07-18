import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";
import { createChangedTask, createTaskWorktree, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("merge prepare binds an immutable fast-forward candidate and complete scans", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      authorization: fixture.authorization
    });
    assert.equal(prepared.status, "checks_required");
    assert.equal(prepared.checks_complete, false);
    assert.equal(prepared.path_scan_complete, true);
    assert.equal(prepared.secret_scan_complete, true);
    assert.equal(prepared.history_scan_complete, true);
    assert.match(prepared.merge_plan_id, /^merge_/);
    assert.equal(prepared.changes.some((change) => change.path === "tracked.txt"), true);
  });
});

test("divergent merge preparation creates a scanned two-parent candidate without touching target", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "divergent candidate"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(path.join(item.privateState.worktreePath, "tracked.txt"), "task-side\n");
    runGit(item.privateState.worktreePath, ["add", "tracked.txt"]);
    runGit(item.privateState.worktreePath, ["commit", "-m", "task side"]);
    await fs.writeFile(path.join(fixture.workspace.root, "main-only.txt"), "main\n");
    runGit(fixture.workspace.root, ["add", "main-only.txt"]);
    runGit(fixture.workspace.root, ["commit", "-m", "main side"]);
    const targetBefore = runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim();
    const reviewed = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
    });
    assert.equal(reviewed.status, "approval_required");
    assert.equal(reviewed.merge_plan_id, null);
    assert.match(reviewed.review_token, /^review_/);
    assert.notEqual(
      runGit(fixture.workspace.root, ["cat-file", "-e", `${reviewed.candidate_oid}^{commit}`], undefined, { allowFailure: true }).status,
      0
    );
    const repositoryBeforeFinalize = await fixture.manager.primaryRepository(fixture.workspace);
    const refsBeforeFinalize = await fixture.executor.run(repositoryBeforeFinalize, [
      "for-each-ref", "refs/codexpro/candidates/"
    ]);
    assert.equal(refsBeforeFinalize.stdout.length, 0);
    const prepared = await fixture.service.merge({
      action: "finalize",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: reviewed.review_token,
      authorization: fixture.authorization
    });
    assert.equal(prepared.status, "checks_required");
    assert.equal(prepared.checks_complete, false);
    assert.match(prepared.merge_plan_id, /^merge_/);
    assert.notEqual(prepared.candidate_oid, prepared.task_oid);
    await assert.rejects(() => fixture.service.merge({
      action: "finalize",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: reviewed.review_token,
      authorization: fixture.authorization
    }), /GIT_STATE_TOKEN_INVALID/);
    assert.equal(runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim(), targetBefore);
  });
});

test("conflicted divergent merge promotes no candidate ref", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "conflict candidate"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(path.join(item.privateState.worktreePath, "tracked.txt"), "task-side\n");
    runGit(item.privateState.worktreePath, ["add", "tracked.txt"]);
    runGit(item.privateState.worktreePath, ["commit", "-m", "task side"]);
    await fs.writeFile(path.join(fixture.workspace.root, "tracked.txt"), "main-side\n");
    runGit(fixture.workspace.root, ["add", "tracked.txt"]);
    runGit(fixture.workspace.root, ["commit", "-m", "main side"]);
    const conflicted = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
    });
    assert.equal(conflicted.status, "conflicted");
    assert.equal(conflicted.merge_plan_id, null);
    const repository = await fixture.manager.primaryRepository(fixture.workspace);
    const refs = await fixture.executor.run(repository, ["for-each-ref", "refs/codexpro/candidates/"]);
    assert.equal(refs.stdout.length, 0);
  });
});

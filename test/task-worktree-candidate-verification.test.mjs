import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";
import { createChangedTask, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("merge preparation exposes an exact candidate-only verification workspace", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    assert.match(prepared.integration_workspace_id, /^ws_[a-f0-9]{32}$/u);
    assert.deepEqual(prepared.required_check_categories, ["test"]);

    const binding = fixture.candidateWorkspaces.describeExecution({
      mergePlanId: prepared.merge_plan_id,
      integrationWorkspaceId: prepared.integration_workspace_id,
      category: "test"
    });
    const before = await fixture.candidateWorkspaces.beginExecution(binding);
    await fs.writeFile(path.join(binding.cwd, "verification-output.tmp"), "dirty\n", "utf8");
    await assert.rejects(
      () => fixture.candidateWorkspaces.completeExecution(binding, before),
      /MERGE_CHECKS_REQUIRED/
    );
  });
});

test("candidate verification rejects an executable-mode drift", { skip: process.platform === "win32" }, async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    await fs.writeFile(path.join(fixture.workspace.root, "main-only.txt"), "main\n", "utf8");
    runGit(fixture.workspace.root, ["add", "main-only.txt"]);
    runGit(fixture.workspace.root, ["commit", "-m", "diverge primary"]);
    const reviewed = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    const prepared = await fixture.service.merge({
      action: "finalize",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: reviewed.review_token,
      authorization: fixture.authorization
    });
    const binding = fixture.candidateWorkspaces.describeExecution({
      mergePlanId: prepared.merge_plan_id,
      integrationWorkspaceId: prepared.integration_workspace_id,
      category: prepared.required_check_categories[0]
    });
    assert.equal(binding.record.ownsRoot, true);
    const before = await fixture.candidateWorkspaces.beginExecution(binding);
    await fs.chmod(path.join(binding.cwd, "tracked.txt"), 0o755);
    await assert.rejects(
      () => fixture.candidateWorkspaces.completeExecution(binding, before),
      /MERGE_CHECKS_REQUIRED/
    );
  });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createChangedTask, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";

test("merge execute updates the exact clean target by CAS and retains the task", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      authorization: fixture.authorization
    });
    const executed = await fixture.service.merge({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true,
      authorization: fixture.authorization
    });
    assert.equal(executed.integrated, true);
    assert.equal(executed.task_retained, true);
    assert.equal(await fs.readFile(path.join(fixture.workspace.root, "tracked.txt"), "utf8"), "task-change\n");
  });
});

test("merge execute uses twice-proved ref-only CAS when the target is not checked out", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    const beforeBytes = await fs.readFile(path.join(fixture.workspace.root, "tracked.txt"), "utf8");
    runGit(fixture.workspace.root, ["switch", "-c", "other"]);
    const executed = await fixture.service.merge({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true,
      authorization: fixture.authorization
    });
    assert.equal(executed.integrated, true);
    assert.equal(await fs.readFile(path.join(fixture.workspace.root, "tracked.txt"), "utf8"), beforeBytes);
    assert.equal(
      runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"]).stdout.toString().trim(),
      prepared.candidate_oid
    );
    assert.equal(runGit(fixture.workspace.root, ["branch", "--show-current"]).stdout.toString().trim(), "other");
  });
});

test("merge execute requires verified receipts or an explicitly approved check skip", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    await assert.rejects(() => fixture.service.merge({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      authorization: fixture.authorization
    }), /MERGE_CHECKS_REQUIRED/);
    const receipt = fixture.verificationReceipts.issue({
      taskWorktreeId: created.task.task_worktree_id,
      candidateOid: prepared.candidate_oid,
      ownerFingerprint: fixture.ownerFingerprint,
      policyRevision: "policy-test",
      capabilityRevision: fixture.executor.capabilityRevision,
      commandDigest: "command-test",
      terminalAuditEventId: `event_${"a".repeat(32)}`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const executed = await fixture.service.merge({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      verificationReceipts: [receipt],
      authorization: fixture.authorization
    });
    assert.equal(executed.integrated, true);
  });
});

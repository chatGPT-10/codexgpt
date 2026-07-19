import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createChangedTask,
  createTaskWorktree,
  withTaskWorktreeFixture
} from "../fixtures/task-worktree-v4-helper.mjs";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";
import { TaskWorktreeRecoveryV4 } from "../dist/worktrees/recovery.js";

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
    const binding = fixture.candidateWorkspaces.describeExecution({
      mergePlanId: prepared.merge_plan_id,
      integrationWorkspaceId: prepared.integration_workspace_id,
      category: prepared.required_check_categories[0]
    });
    const clean = await fixture.candidateWorkspaces.beginExecution(binding);
    const receipt = fixture.candidateWorkspaces.issueReceipt(binding, clean, {
      commandDigest: "1".repeat(64),
      commandResourceFingerprint: "2".repeat(64),
      backendId: "test-backend",
      backendVersion: "v1",
      executableIdentity: "3".repeat(64),
      effectiveEnvironmentDigest: "4".repeat(64),
      cwdIdentity: "5".repeat(64),
      policyRevision: "policy-test",
      terminalAuditEventId: `event_${"a".repeat(32)}`,
      exitCode: 0
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
    assert.throws(() => fixture.verificationReceipts.verify(receipt, {}), /VERIFICATION_RECEIPT_INVALID/);
  });
});

test("merge cleanup failure is restart-recoverable without replaying the target update", async () => {
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
      skipChecks: true,
      authorization: fixture.authorization
    }), /GIT_RECOVERY_REQUIRED/);

    const targetAfterEffect = runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"])
      .stdout.toString("ascii").trim();
    assert.equal(targetAfterEffect, prepared.candidate_oid);
    assert.equal(fixture.store.read(created.task.task_worktree_id).record.state, "recovery_required");
    assert.equal(
      fixture.plans.getForRecovery(prepared.merge_plan_id, fixture.ownerFingerprint).lifecycleState,
      "recovery_required"
    );
    await assert.rejects(() => fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    }));

    const audit = [];
    const recovery = new TaskWorktreeRecoveryV4({
      manager: fixture.manager,
      plans: fixture.plans,
      candidateWorkspaces: fixture.candidateWorkspaces,
      verificationReceipts: fixture.verificationReceipts,
      ownerFingerprint: () => fixture.ownerFingerprint,
      recordRecovery: async (plan, outcome) => audit.push([plan.mergePlanId, outcome])
    });
    assert.deepEqual(await recovery.recover(), [{
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      outcome: "cleanup_completed"
    }]);
    assert.deepEqual(audit, [[prepared.merge_plan_id, "cleanup_completed"]]);
    assert.equal(fixture.store.read(created.task.task_worktree_id).record.state, "ready");
    assert.equal(
      runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"]).stdout.toString("ascii").trim(),
      targetAfterEffect
    );
    assert.throws(
      () => fixture.plans.getForRecovery(prepared.merge_plan_id, fixture.ownerFingerprint),
      /MERGE_PLAN_INVALID|GIT_STATE_TOKEN_INVALID/
    );
  }, { candidateCleanupFailures: 1 });
});

test("recovery detects a target CAS completed before the prepared lifecycle transition", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    runGit(fixture.workspace.root, [
      "update-ref",
      "--no-deref",
      "refs/heads/main",
      prepared.candidate_oid,
      prepared.target_oid
    ]);
    fixture.store.update(created.task.task_worktree_id, {
      state: "ready",
      headOid: prepared.task_oid
    });

    const recovery = new TaskWorktreeRecoveryV4({
      manager: fixture.manager,
      plans: fixture.plans,
      candidateWorkspaces: fixture.candidateWorkspaces,
      verificationReceipts: fixture.verificationReceipts,
      ownerFingerprint: () => fixture.ownerFingerprint
    });
    assert.deepEqual(await recovery.recover(), [{
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      outcome: "cleanup_completed"
    }]);
    assert.equal(
      runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"]).stdout.toString("ascii").trim(),
      prepared.candidate_oid
    );
    assert.equal(fixture.store.read(created.task.task_worktree_id).record.state, "ready");
    assert.equal(fixture.candidateWorkspaces.has(prepared.integration_workspace_id), false);
  });
});

test("merge execute accepts a normal 300 KiB tracked file without journaling raw undo bytes", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const primaryBytes = Buffer.alloc(300 * 1024, 0x61);
    await fs.writeFile(path.join(fixture.workspace.root, "tracked.txt"), primaryBytes);
    runGit(fixture.workspace.root, ["add", "tracked.txt"]);
    runGit(fixture.workspace.root, ["commit", "-m", "large primary file"]);
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard
    });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "large merge candidate"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(path.join(item.privateState.worktreePath, "tracked.txt"), Buffer.alloc(300 * 1024, 0x62));
    runGit(item.privateState.worktreePath, ["add", "tracked.txt"]);
    runGit(item.privateState.worktreePath, ["commit", "-m", "large task file"]);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    });
    const journalStates = [];
    const originalRun = fixture.manager.options.journal.run;
    fixture.manager.options.journal.run = async (input) => {
      if (input.canonicalAction === "task_merge_execute") journalStates.push(input.privateState);
      return originalRun.call(fixture.manager.options.journal, input);
    };
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
    assert.equal((await fs.readFile(path.join(fixture.workspace.root, "tracked.txt"))).length, 300 * 1024);
    assert.equal(journalStates.some((state) => Object.hasOwn(state, "indexUndo")), false);
    assert.equal(journalStates.some((state) => Object.hasOwn(state, "fileUndo")), false);
    assert.ok(JSON.stringify(journalStates).length < 4096);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DurableOpaqueRecordStoreV4 } from "../dist/git/opaqueRecordStore.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { MergePlanStoreV4 } from "../dist/worktrees/mergePlanStore.js";

test("review tokens and merge plans survive restart and remain one-use", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-review-plan-"));
  const masterKey = Buffer.alloc(32, 21);
  const tokenKey = Buffer.alloc(32, 22);
  const now = Date.now();
  try {
    const firstReviews = new GitReviewTokenServiceV4({
      key: Buffer.from(tokenKey),
      now: () => now,
      stateRoot,
      masterKey
    });
    const review = firstReviews.mint("task_remove", { exact: "facts" });
    firstReviews.dispose();
    const restartedReviews = new GitReviewTokenServiceV4({
      key: Buffer.from(tokenKey),
      now: () => now + 1,
      stateRoot,
      masterKey
    });
    assert.deepEqual(restartedReviews.consume(review, "task_remove"), { exact: "facts" });
    assert.throws(() => restartedReviews.inspect(review, "task_remove"), /GIT_STATE_TOKEN_INVALID/);
    restartedReviews.dispose();

    const firstPlans = new MergePlanStoreV4({ now: () => now, stateRoot, masterKey });
    const plan = firstPlans.create({
      lifecycleState: "prepared",
      taskWorktreeId: `task_${"1".repeat(32)}`,
      taskGeneration: 1,
      repositoryId: `repo_${"2".repeat(32)}`,
      repositoryIdentityFingerprint: "6".repeat(64),
      capabilityRevision: "7".repeat(64),
      contextFingerprint: "8".repeat(64),
      policyRevision: null,
      ownerFingerprint: "3".repeat(64),
      primaryWorkspaceRoot: path.join(stateRoot, "repository"),
      targetRef: "refs/heads/main",
      taskRef: "refs/heads/codex/task-1234",
      candidateRef: null,
      targetOid: "4".repeat(40),
      taskOid: "5".repeat(40),
      candidateOid: "5".repeat(40),
      candidateTreeOid: "9".repeat(40),
      manifestDigest: "a".repeat(64),
      diffDigest: "b".repeat(64),
      historyDigest: "c".repeat(64),
      checksComplete: true,
      receiptIds: [],
      integrationWorkspaceId: `ws_${"d".repeat(32)}`,
      requiredCheckCategories: ["test"],
      affectedPathCount: 1,
      affectedByteCount: 5,
      scanDigest: "e".repeat(64),
      repositoryIntegrations: "disabled",
      integrationIdentitiesDigest: null,
      integrationConfigDigest: null,
      integrationSemanticStateDigest: null
    });
    firstPlans.dispose();
    const restartedPlans = new MergePlanStoreV4({ now: () => now + 1, stateRoot, masterKey });
    assert.equal(restartedPlans.get(plan.mergePlanId, "3".repeat(64)).candidateOid, plan.candidateOid);
    restartedPlans.consume(plan.mergePlanId, "3".repeat(64));
    assert.throws(() => restartedPlans.get(plan.mergePlanId, "3".repeat(64)), /GIT_STATE_TOKEN_INVALID|MERGE_PLAN_INVALID/);
    restartedPlans.dispose();
  } finally {
    masterKey.fill(0);
    tokenKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
});

test("durable Git review records retain configured-size rollback facts", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-large-review-"));
  const masterKey = Buffer.alloc(32, 31);
  const tokenKey = Buffer.alloc(32, 32);
  const now = Date.now();
  try {
    const reviews = new GitReviewTokenServiceV4({
      key: tokenKey,
      now: () => now,
      stateRoot,
      masterKey
    });
    const rollback = Buffer.alloc(300 * 1024, 97).toString("base64");
    const token = reviews.mint("restore_worktree", { rollback });
    reviews.dispose();
    const restarted = new GitReviewTokenServiceV4({
      key: tokenKey,
      now: () => now + 1,
      stateRoot,
      masterKey
    });
    assert.equal(restarted.inspect(token, "restore_worktree").rollback.length, rollback.length);
    restarted.dispose();
  } finally {
    masterKey.fill(0);
    tokenKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
});

test("merge plans written before integration-mode binding fail closed after restart", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-legacy-merge-plan-"));
  const masterKey = Buffer.alloc(32, 23);
  const now = Date.now();
  const mergePlanId = `merge_${"6".repeat(32)}`;
  try {
    const records = new DurableOpaqueRecordStoreV4({
      stateRoot,
      masterKey,
      namespace: "merge-plans",
      now: () => now
    });
    records.put({
      recordId: mergePlanId,
      kind: "merge_plan",
      expiresAt: now + 30 * 60_000,
      value: {
        mergePlanId,
        taskWorktreeId: `task_${"1".repeat(32)}`,
        repositoryId: `repo_${"2".repeat(32)}`,
        ownerFingerprint: "3".repeat(64),
        targetRef: "refs/heads/main",
        taskRef: "refs/heads/codex/task-1234",
        candidateRef: null,
        targetOid: "4".repeat(40),
        taskOid: "5".repeat(40),
        candidateOid: "5".repeat(40),
        checksComplete: true,
        receiptIds: [],
        affectedPathCount: 1,
        affectedByteCount: 5,
        scanDigest: "d".repeat(64),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 30 * 60_000).toISOString(),
        consumed: false
      }
    });
    records.dispose();
    const plans = new MergePlanStoreV4({ now: () => now + 1, stateRoot, masterKey });
    assert.throws(() => plans.get(mergePlanId, "3".repeat(64)), /MERGE_PLAN_INVALID/);
    plans.dispose();
  } finally {
    masterKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
});

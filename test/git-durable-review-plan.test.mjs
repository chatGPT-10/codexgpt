import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
      scanDigest: "d".repeat(64)
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

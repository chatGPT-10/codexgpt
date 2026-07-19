import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitCommitServiceV4 } from "../dist/git/commitService.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { GitStashServiceV4 } from "../dist/git/stashService.js";
import { withGitMutationRepository } from "../fixtures/git-v4-test-helper.mjs";
import { createChangedTask, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

test("SHA-256 repositories support V4 status stage commit and private stash", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "sha256 commit\n", "utf8");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    assert.equal(status.head.oid.length, 64);
    const index = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    const staged = await index.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    });
    const commit = new GitCommitServiceV4(fixture.mutationContext, fixture.indexTokens);
    const committed = await commit.commit({
      workspace: fixture.workspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "SHA-256 V4 commit"
    });
    assert.equal(committed.commit_oid.length, 64);

    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "sha256 stash\n", "utf8");
    const stashStatus = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 91) });
    try {
      const stash = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const reviewed = await stash.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: stashStatus.state_token,
        paths: ["tracked.txt"]
      });
      const created = await stash.executeCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: reviewed.review_token
      });
      assert.match(created.stash_id, /^stash_[a-f0-9]{32}$/u);
    } finally {
      reviews.dispose();
    }
  }, { objectFormat: "sha256" });
});

test("SHA-256 managed task creation and merge execute use 64-character object IDs", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    assert.equal(created.task.head_oid.length, 64);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      authorization: fixture.authorization
    });
    assert.equal(prepared.candidate_oid.length, 64);
    const historyRange = `${prepared.target_oid}..${prepared.candidate_oid}`;
    assert.deepEqual(
      fixture.calls.find((args) => args[0] === "rev-list" && args.includes(historyRange)),
      ["rev-list", "--max-count=4097", historyRange, "--"]
    );
    const executed = await fixture.service.merge({
      action: "execute",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true,
      authorization: fixture.authorization
    });
    assert.equal(executed.target_new_oid.length, 64);
    assert.equal(executed.integrated, true);
  }, { objectFormat: "sha256" });
});

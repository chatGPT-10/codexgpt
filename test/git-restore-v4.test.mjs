import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { GitRestoreServiceV4 } from "../dist/git/restoreService.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 restore unstages exact paths without changing worktree bytes", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "changed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const index = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    await index.stage({
      workspace: fixture.workspace, guard: fixture.guard, stateToken: status.state_token, paths: ["tracked.txt"]
    });
    const afterStage = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 51) });
    try {
      const service = new GitRestoreServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const review = await service.prepare({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: afterStage.state_token,
        mode: "index_from_head",
        paths: ["tracked.txt"]
      });
      await service.execute({ workspace: fixture.workspace, guard: fixture.guard, reviewToken: review.review_token });
      assert.equal(runGit(fixture.root, ["diff", "--cached", "--quiet"], undefined, { allowFailure: true }).status, 0);
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "changed\n");
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 restore worktree execution retains complete undo and writes exact index bytes", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "changed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 52) });
    try {
      const service = new GitRestoreServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const review = await service.prepare({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        mode: "worktree_from_index",
        paths: ["tracked.txt"]
      });
      assert.equal(review.complete_undo_retained, true);
      await service.execute({ workspace: fixture.workspace, guard: fixture.guard, reviewToken: review.review_token });
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "alpha\n");
      await assert.rejects(
        () => service.execute({ workspace: fixture.workspace, guard: fixture.guard, reviewToken: review.review_token }),
        /GIT_STATE_TOKEN_INVALID/
      );
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 restore rejects a post-review hardlink without changing the outside file", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "changed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 54) });
    const outside = path.join(path.dirname(fixture.root), `outside-${Date.now()}.txt`);
    try {
      const service = new GitRestoreServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const review = await service.prepare({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        mode: "worktree_from_index",
        paths: ["tracked.txt"]
      });
      await fs.writeFile(outside, "changed\n");
      await fs.rm(path.join(fixture.root, "tracked.txt"));
      await fs.link(outside, path.join(fixture.root, "tracked.txt"));
      await assert.rejects(
        () => service.execute({ workspace: fixture.workspace, guard: fixture.guard, reviewToken: review.review_token }),
        /GIT_STATE_CHANGED|TRANSACTION_PRECONDITION_FAILED|single-link ordinary files/
      );
      assert.equal(await fs.readFile(outside, "utf8"), "changed\n");
    } finally {
      reviews.dispose();
      await fs.rm(outside, { force: true });
    }
  });
});

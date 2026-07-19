import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitMutationContextV4 } from "../dist/git/mutationContext.js";
import { RepositoryIdentityRegistry } from "../dist/git/repositoryIdentity.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { GitStashServiceV4 } from "../dist/git/stashService.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 private stash list is empty without a not-found distinction", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 53) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const result = await service.list({ workspace: fixture.workspace });
      assert.match(result.repository_id, /^repo_/);
      assert.deepEqual(result.stashes, []);
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash create/apply preserves staged and unstaged planes and retains the ref", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "staged\n");
    const initial = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const index = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    await index.stage({
      workspace: fixture.workspace, guard: fixture.guard, stateToken: initial.state_token, paths: ["tracked.txt"]
    });
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "unstaged\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 61) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const createReview = await service.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      });
      const created = await service.executeCreate({
        workspace: fixture.workspace, guard: fixture.guard, reviewToken: createReview.review_token
      });
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "alpha\n");
      assert.equal(runGit(fixture.root, ["show", ":tracked.txt"]).stdout.toString(), "alpha\n");
      const clean = await fixture.readService.status({
        workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
      });
      const applyReview = await service.prepareApply({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stashId: created.stash_id,
        stateToken: clean.state_token
      });
      const applied = await service.executeApply({
        workspace: fixture.workspace, guard: fixture.guard, reviewToken: applyReview.review_token
      });
      assert.equal(applied.retained, true);
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "unstaged\n");
      assert.equal(runGit(fixture.root, ["show", ":tracked.txt"]).stdout.toString(), "staged\n");
      assert.equal(fixture.calls.some((args) => args[0] === "stash"), false);
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash forget deletes one expected app ref without GC", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "changed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 62) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const prepared = await service.prepareCreate({
        workspace: fixture.workspace, guard: fixture.guard, stateToken: status.state_token, paths: ["tracked.txt"]
      });
      const created = await service.executeCreate({
        workspace: fixture.workspace, guard: fixture.guard, reviewToken: prepared.review_token
      });
      const forget = await service.prepareForget({ workspace: fixture.workspace, stashId: created.stash_id });
      const result = await service.executeForget({ workspace: fixture.workspace, reviewToken: forget.review_token });
      assert.equal(result.retained, false);
      assert.equal(result.gc_executed, false);
      assert.equal(fixture.calls.some((args) => args[0] === "gc"), false);
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash rejects a worktree edit made after review", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "reviewed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 65) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const prepared = await service.prepareCreate({
        workspace: fixture.workspace, guard: fixture.guard, stateToken: status.state_token, paths: ["tracked.txt"]
      });
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "user-edit\n");
      await assert.rejects(
        () => service.executeCreate({
          workspace: fixture.workspace, guard: fixture.guard, reviewToken: prepared.review_token
        }),
        /GIT_STATE_CHANGED/
      );
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "user-edit\n");
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash commit excludes unselected staged changes", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "selected-staged\n");
    runGit(fixture.root, ["add", "tracked.txt"]);
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "selected-worktree\n");
    await fs.writeFile(path.join(fixture.root, "delete.txt"), "unselected-staged\n");
    runGit(fixture.root, ["add", "delete.txt"]);
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 66) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const prepared = await service.prepareCreate({
        workspace: fixture.workspace, guard: fixture.guard, stateToken: status.state_token, paths: ["tracked.txt"]
      });
      const created = await service.executeCreate({
        workspace: fixture.workspace, guard: fixture.guard, reviewToken: prepared.review_token
      });
      const ref = `refs/codexpro/stash/${created.stash_id.slice(6)}`;
      assert.equal(runGit(fixture.root, ["show", `${ref}:tracked.txt`]).stdout.toString(), "selected-staged\n");
      assert.equal(runGit(fixture.root, ["show", `${ref}:delete.txt`]).stdout.toString(), "remove\n");
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash apply previews a conservative three-way merge and rejects overlap", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "stashed\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
    });
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 67) });
    try {
      const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
      const create = await service.prepareCreate({
        workspace: fixture.workspace, guard: fixture.guard, stateToken: status.state_token, paths: ["tracked.txt"]
      });
      const created = await service.executeCreate({
        workspace: fixture.workspace, guard: fixture.guard, reviewToken: create.review_token
      });
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "current\n");
      const current = await fixture.readService.status({
        workspace: fixture.workspace, guard: fixture.guard, paths: ["tracked.txt"]
      });
      await assert.rejects(() => service.prepareApply({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stashId: created.stash_id,
        stateToken: current.state_token
      }), /MERGE_CONFLICT/);
      assert.equal(await fs.readFile(path.join(fixture.root, "tracked.txt"), "utf8"), "current\n");
    } finally {
      reviews.dispose();
    }
  });
});

test("V4 private stash registry survives same-binary restart without exposing private paths", async () => {
  await withGitMutationRepository(async (fixture) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-stash-restart-"));
    const masterKey = Buffer.alloc(32, 63);
    const reviewKey = Buffer.alloc(32, 64);
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "restart-stash\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    try {
      const reviewsA = new GitReviewTokenServiceV4({
        key: Buffer.from(reviewKey),
        stateRoot,
        masterKey
      });
      const serviceA = new GitStashServiceV4(
        fixture.mutationContext,
        reviewsA,
        fixture.fileTransactions,
        Date.now,
        {
          stateRoot,
          masterKey,
          ownerFingerprint: () => "d".repeat(64)
        }
      );
      const reviewed = await serviceA.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      });
      const created = await serviceA.executeCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: reviewed.review_token
      });
      serviceA.dispose();
      reviewsA.dispose();

      const reviewsB = new GitReviewTokenServiceV4({
        key: Buffer.from(reviewKey),
        stateRoot,
        masterKey
      });
      const restartedRegistry = new RepositoryIdentityRegistry({
        contextFingerprint: "stash-restart-context"
      });
      const restartedContext = new GitMutationContextV4({
        executor: fixture.executor,
        registry: restartedRegistry,
        stateTokens: fixture.stateTokens,
        readService: fixture.readService,
        contextFingerprint: "stash-restart-context"
      });
      const serviceB = new GitStashServiceV4(
        restartedContext,
        reviewsB,
        fixture.fileTransactions,
        Date.now,
        {
          stateRoot,
          masterKey,
          ownerFingerprint: () => "d".repeat(64)
        }
      );
      const rotatedWorkspace = {
        ...fixture.workspace,
        id: "ws_rotated_after_restart"
      };
      const listed = await serviceB.list({ workspace: rotatedWorkspace });
      assert.deepEqual(listed.stashes.map((entry) => entry.stash_id), [created.stash_id]);
      assert.notEqual(listed.repository_id, created.repository_id);
      assert.equal(JSON.stringify(listed).includes(stateRoot), false);
      serviceB.dispose();
      const foreignReviews = new GitReviewTokenServiceV4({
        key: Buffer.from(reviewKey),
        stateRoot,
        masterKey
      });
      const foreignService = new GitStashServiceV4(
        restartedContext,
        foreignReviews,
        fixture.fileTransactions,
        Date.now,
        {
          stateRoot,
          masterKey,
          ownerFingerprint: () => "f".repeat(64)
        }
      );
      assert.deepEqual((await foreignService.list({ workspace: rotatedWorkspace })).stashes, []);
      foreignService.dispose();
      foreignReviews.dispose();
      restartedRegistry.dispose();
      reviewsB.dispose();
    } finally {
      masterKey.fill(0);
      reviewKey.fill(0);
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });
});

test("V4 private stash remains actionable beyond the opaque-record TTL horizon", async () => {
  await withGitMutationRepository(async (fixture) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-stash-age-"));
    const masterKey = Buffer.alloc(32, 68);
    const reviewKey = Buffer.alloc(32, 69);
    const initialNow = Date.now();
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "aged-stash\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    try {
      const reviewsA = new GitReviewTokenServiceV4({
        key: Buffer.from(reviewKey),
        stateRoot,
        masterKey
      });
      const serviceA = new GitStashServiceV4(
        fixture.mutationContext,
        reviewsA,
        fixture.fileTransactions,
        () => initialNow,
        {
          stateRoot,
          masterKey,
          ownerFingerprint: () => "e".repeat(64)
        }
      );
      const reviewed = await serviceA.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      });
      const created = await serviceA.executeCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: reviewed.review_token
      });
      serviceA.dispose();
      reviewsA.dispose();

      const reviewsB = new GitReviewTokenServiceV4({
        key: Buffer.from(reviewKey),
        stateRoot,
        masterKey
      });
      const serviceB = new GitStashServiceV4(
        fixture.mutationContext,
        reviewsB,
        fixture.fileTransactions,
        () => initialNow + 366 * 24 * 60 * 60_000,
        {
          stateRoot,
          masterKey,
          ownerFingerprint: () => "e".repeat(64)
        }
      );
      const rotatedWorkspace = { ...fixture.workspace, id: "ws_rotated_after_one_year" };
      const listed = await serviceB.list({ workspace: rotatedWorkspace });
      assert.deepEqual(listed.stashes.map((entry) => entry.stash_id), [created.stash_id]);
      const forget = await serviceB.prepareForget({
        workspace: rotatedWorkspace,
        stashId: created.stash_id
      });
      const forgotten = await serviceB.executeForget({
        workspace: rotatedWorkspace,
        reviewToken: forget.review_token
      });
      assert.equal(forgotten.retained, false);
      serviceB.dispose();
      reviewsB.dispose();
    } finally {
      masterKey.fill(0);
      reviewKey.fill(0);
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });
});

test("V4 private stash removes private indexes after create and apply failures", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 70) });
    const service = new GitStashServiceV4(fixture.mutationContext, reviews, fixture.fileTransactions);
    const originalCreatePrivateDirectory = fixture.executor.createPrivateDirectory.bind(fixture.executor);
    const originalRun = fixture.executor.run.bind(fixture.executor);
    try {
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "cleanup-create\n");
      let status = await fixture.readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const failedCreateReview = await service.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      });
      let failedPrivateRoot;
      fixture.executor.createPrivateDirectory = async (prefix) => {
        failedPrivateRoot = await originalCreatePrivateDirectory(prefix);
        return failedPrivateRoot;
      };
      fixture.executor.run = async (repository, args, options) => {
        if (failedPrivateRoot && args[0] === "read-tree") throw new Error("INJECTED_STASH_CREATE_FAILURE");
        return originalRun(repository, args, options);
      };
      await assert.rejects(() => service.executeCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: failedCreateReview.review_token
      }), /GIT_CAPABILITY_UNAVAILABLE/);
      await assert.rejects(() => fs.lstat(failedPrivateRoot), { code: "ENOENT" });

      fixture.executor.run = originalRun;
      fixture.executor.createPrivateDirectory = originalCreatePrivateDirectory;
      status = await fixture.readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const createReview = await service.prepareCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      });
      const created = await service.executeCreate({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: createReview.review_token
      });
      const cleanStatus = await fixture.readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const applyReview = await service.prepareApply({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stashId: created.stash_id,
        stateToken: cleanStatus.state_token
      });
      let applyPrivateRoot;
      fixture.executor.createPrivateDirectory = async (prefix) => {
        applyPrivateRoot = await originalCreatePrivateDirectory(prefix);
        return applyPrivateRoot;
      };
      fixture.executor.run = async (repository, args, options) => {
        if (applyPrivateRoot && args[0] === "update-index") throw new Error("INJECTED_STASH_APPLY_FAILURE");
        return originalRun(repository, args, options);
      };
      await assert.rejects(() => service.executeApply({
        workspace: fixture.workspace,
        guard: fixture.guard,
        reviewToken: applyReview.review_token
      }), /GIT_CAPABILITY_UNAVAILABLE/);
      await assert.rejects(() => fs.lstat(applyPrivateRoot), { code: "ENOENT" });
    } finally {
      fixture.executor.run = originalRun;
      fixture.executor.createPrivateDirectory = originalCreatePrivateDirectory;
      service.dispose();
      reviews.dispose();
    }
  });
});

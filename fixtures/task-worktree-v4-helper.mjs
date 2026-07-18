import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { admitManagedWorktreeRoot } from "../dist/worktrees/root.js";
import { TaskWorktreeStoreV1 } from "../dist/worktrees/store.js";
import { TaskWorktreeManagerV4 } from "../dist/worktrees/manager.js";
import { TaskWorktreeWorkspaceAuthorityV4 } from "../dist/worktrees/workspaceAuthority.js";
import { TaskWorktreeServiceV4 } from "../dist/worktrees/service.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { MergePlanStoreV4 } from "../dist/worktrees/mergePlanStore.js";
import { TaskWorktreeMergePrepareV4 } from "../dist/worktrees/mergePrepare.js";
import { TaskWorktreeMergeExecuteV4 } from "../dist/worktrees/mergeExecute.js";
import { TaskWorktreeRemoveV4 } from "../dist/worktrees/remove.js";
import { VerificationReceiptServiceV4 } from "../dist/worktrees/verificationReceipts.js";
import { withGitMutationRepository } from "./git-v4-test-helper.mjs";
import { runGit } from "./git-v4-test-helper.mjs";

export async function withTaskWorktreeFixture(callback) {
  await withGitMutationRepository(async (git) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-task-v4-"));
    const managedPath = path.join(base, "managed");
    const stateRoot = path.join(base, "state");
    await fs.mkdir(managedPath);
    await fs.mkdir(stateRoot);
    const root = await admitManagedWorktreeRoot({
      root: managedPath,
      protectedRoots: [git.root, stateRoot],
      create: false
    });
    const ownerFingerprint = "d".repeat(64);
    const store = new TaskWorktreeStoreV1({
      stateRoot,
      masterKey: Buffer.alloc(32, 71)
    });
    const journal = {
      gateRBound: true,
      async run(input) {
        if (!input.authorization) throw new Error("APPROVAL_REQUIRED");
        await input.preEffect?.();
        return input.effect();
      }
    };
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 72) });
    const manager = new TaskWorktreeManagerV4({
      context: git.mutationContext,
      journal,
      reviews,
      root,
      store,
      maxTasks: 8,
      maxFiles: 10_000,
      maxBytes: 64 * 1024 * 1024
    });
    const authority = new TaskWorktreeWorkspaceAuthorityV4({
      manager,
      ownerFingerprint: () => ownerFingerprint
    });
    const plans = new MergePlanStoreV4();
    const verificationReceipts = new VerificationReceiptServiceV4(Buffer.alloc(32, 73));
    const mergePrepare = new TaskWorktreeMergePrepareV4({
      manager,
      plans,
      reviews,
      ownerFingerprint: () => ownerFingerprint
    });
    const mergeExecute = new TaskWorktreeMergeExecuteV4({
      manager,
      plans,
      ownerFingerprint: () => ownerFingerprint,
      verificationReceipts,
      fileTransactions: git.fileTransactions
    });
    const remove = new TaskWorktreeRemoveV4({
      manager,
      authority,
      reviews,
      ownerFingerprint: () => ownerFingerprint
    });
    const service = new TaskWorktreeServiceV4({
      manager,
      authority,
      ownerFingerprint: () => ownerFingerprint,
      mergePrepare,
      mergeExecute,
      remove
    });
    try {
      await callback({
        ...git,
        base,
        stateRoot,
        root,
        ownerFingerprint,
        store,
        manager,
        authority,
        reviews,
        plans,
        verificationReceipts,
        service,
        authorization: { outcome: "allow" }
      });
    } finally {
      reviews.dispose();
      verificationReceipts.dispose();
      await fs.rm(base, { recursive: true, force: true });
    }
  });
}

export async function createChangedTask(fixture) {
  const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
  const created = await createTaskWorktree(fixture, {
    stateToken: status.state_token,
    taskName: "merge candidate"
  });
  const item = fixture.store.read(created.task.task_worktree_id);
  await fs.writeFile(path.join(item.privateState.worktreePath, "tracked.txt"), "task-change\n");
  runGit(item.privateState.worktreePath, ["add", "tracked.txt"]);
  runGit(item.privateState.worktreePath, ["commit", "-m", "task candidate"]);
  return created;
}

export async function createTaskWorktree(fixture, input) {
  const reviewed = await fixture.service.create({
    action: "prepare",
    workspace: fixture.workspace,
    guard: fixture.guard,
    stateToken: input.stateToken,
    taskName: input.taskName,
    ...(input.branchName ? { branchName: input.branchName } : {})
  });
  return fixture.service.create({
    action: "execute",
    workspace: fixture.workspace,
    guard: fixture.guard,
    reviewToken: reviewed.review_token,
    authorization: fixture.authorization
  });
}

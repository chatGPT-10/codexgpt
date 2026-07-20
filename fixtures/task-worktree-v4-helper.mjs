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
import { GitIntegrationGateV4 } from "../dist/git/integrations.js";
import { GitReadServiceV4 } from "../dist/git/readService.js";
import { CandidateVerificationWorkspaceV4 } from "../dist/worktrees/candidateWorkspace.js";
import { withGitMutationRepository } from "./git-v4-test-helper.mjs";
import { runGit } from "./git-v4-test-helper.mjs";

export async function withTaskWorktreeFixture(callback, options = {}) {
  await withGitMutationRepository(async (git) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-task-v4-"));
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
    const integrationGate = options.integrations === true
      ? new GitIntegrationGateV4({ executor: git.executor, reviews, enabled: true })
      : undefined;
    const integrationReadService = integrationGate
      ? new GitReadServiceV4({
          executor: git.executor,
          registry: git.registry,
          stateTokens: git.stateTokens,
          contextFingerprint: "context-v4-mutation",
          integrationGate
        })
      : undefined;
    const manager = new TaskWorktreeManagerV4({
      context: git.mutationContext,
      journal,
      reviews,
      root,
      store,
      maxTasks: 8,
      maxFiles: 10_000,
      maxBytes: options.maxBytes ?? 64 * 1024 * 1024
    });
    const authority = new TaskWorktreeWorkspaceAuthorityV4({
      manager,
      ownerFingerprint: () => ownerFingerprint
    });
    const now = options.now ?? Date.now;
    const lifecycleState = options.durableLifecycle
      ? { stateRoot, masterKey: Buffer.alloc(32, 74) }
      : {};
    const basePlans = new MergePlanStoreV4({ now, ...lifecycleState });
    const plans = options.failPlanCreate
      ? new Proxy(basePlans, {
          get(target, property) {
            if (property === "create") return () => { throw new Error("TEST_PLAN_CREATE_FAILED"); };
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      : basePlans;
    const verificationReceipts = new VerificationReceiptServiceV4(
      Buffer.alloc(32, 73),
      now,
      lifecycleState
    );
    const baseCandidateWorkspaces = new CandidateVerificationWorkspaceV4({
      manager,
      guard: git.guard,
      ownerFingerprint: () => ownerFingerprint,
      contextFingerprint: () => "context-v4-mutation",
      verificationReceipts,
      now,
      ...lifecycleState
    });
    let candidateCleanupFailures = options.candidateCleanupFailures ?? 0;
    const candidateWorkspaces = candidateCleanupFailures > 0
      ? new Proxy(baseCandidateWorkspaces, {
          get(target, property) {
            if (property === "cleanup") {
              return async (...args) => {
                if (candidateCleanupFailures > 0) {
                  candidateCleanupFailures -= 1;
                  throw new Error("TEST_CANDIDATE_CLEANUP_FAILED");
                }
                return target.cleanup(...args);
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      : baseCandidateWorkspaces;
    const mergePrepare = new TaskWorktreeMergePrepareV4({
      manager,
      plans,
      reviews,
      ownerFingerprint: () => ownerFingerprint,
      integrationGate,
      candidateWorkspaces
    });
    const mergeExecute = new TaskWorktreeMergeExecuteV4({
      manager,
      plans,
      ownerFingerprint: () => ownerFingerprint,
      verificationReceipts,
      fileTransactions: git.fileTransactions,
      integrationGate,
      candidateWorkspaces
    });
    const remove = new TaskWorktreeRemoveV4({
      manager,
      authority,
      reviews,
      ownerFingerprint: () => ownerFingerprint,
      ...(options.hasActiveProcesses ? { hasActiveProcesses: options.hasActiveProcesses } : {}),
      ...(options.drainActiveProcesses ? { drainActiveProcesses: options.drainActiveProcesses } : {}),
      ...(options.beforeAdminQuarantine ? { beforeAdminQuarantine: options.beforeAdminQuarantine } : {})
    });
    const service = new TaskWorktreeServiceV4({
      manager,
      authority,
      ownerFingerprint: () => ownerFingerprint,
      mergePrepare,
      mergeExecute,
      remove,
      integrationGate
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
        integrationGate,
        integrationReadService,
        plans,
        basePlans,
        verificationReceipts,
        candidateWorkspaces,
        baseCandidateWorkspaces,
        service,
        authorization: { outcome: "allow" }
      });
    } finally {
      reviews.dispose();
      basePlans.dispose();
      verificationReceipts.dispose();
      baseCandidateWorkspaces.dispose();
      await fs.rm(base, { recursive: true, force: true });
    }
  }, { objectFormat: options.objectFormat });
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

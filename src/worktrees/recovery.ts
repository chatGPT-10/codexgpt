import fsp from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../guard.js";
import type { GitRepositoryIdentity } from "../git/repositoryIdentity.js";
import type { CandidateVerificationWorkspaceV4 } from "./candidateWorkspace.js";
import type { MergePlanStoreV4, MergePlanV4 } from "./mergePlanStore.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { TaskWorktreeStoreV1 } from "./store.js";
import type { VerificationReceiptServiceV4 } from "./verificationReceipts.js";
import { taskRemovalQuarantinePaths } from "./remove.js";
import { removeManagedTaskTree, validateManagedTaskTree } from "./remover.js";

export interface TaskWorktreeRecoveryResultV4 {
  taskWorktreeId: string;
  mergePlanId: string | null;
  outcome: "rolled_back" | "cleanup_completed" | "recovery_required";
}

export class TaskWorktreeRecoveryV4 {
  readonly #legacyStore: TaskWorktreeStoreV1 | null;
  readonly #options: {
    manager: TaskWorktreeManagerV4;
    plans: MergePlanStoreV4;
    candidateWorkspaces: CandidateVerificationWorkspaceV4;
    verificationReceipts: VerificationReceiptServiceV4;
    ownerFingerprint: () => string;
    now: () => number;
    recordRecovery?: (
      plan: MergePlanV4,
      outcome: TaskWorktreeRecoveryResultV4["outcome"]
    ) => void | Promise<void>;
  } | null;

  constructor(storeOrOptions: TaskWorktreeStoreV1 | {
    manager: TaskWorktreeManagerV4;
    plans: MergePlanStoreV4;
    candidateWorkspaces: CandidateVerificationWorkspaceV4;
    verificationReceipts: VerificationReceiptServiceV4;
    ownerFingerprint: () => string;
    now?: () => number;
    recordRecovery?: (
      plan: MergePlanV4,
      outcome: TaskWorktreeRecoveryResultV4["outcome"]
    ) => void | Promise<void>;
  }) {
    if ("listAll" in storeOrOptions) {
      this.#legacyStore = storeOrOptions;
      this.#options = null;
    } else {
      this.#legacyStore = null;
      this.#options = {
        ...storeOrOptions,
        now: storeOrOptions.now ?? Date.now
      };
    }
  }

  async recover(_ownerFingerprint?: string): Promise<TaskWorktreeRecoveryResultV4[]> {
    if (this.#legacyStore) {
      const results: TaskWorktreeRecoveryResultV4[] = [];
      for (const { record } of this.#legacyStore.listAll()) {
        if (record.state !== "preparing") continue;
        this.#legacyStore.update(record.taskWorktreeId, { state: "recovery_required" });
        results.push({
          taskWorktreeId: record.taskWorktreeId,
          mergePlanId: null,
          outcome: "recovery_required"
        });
      }
      return results;
    }

    const options = this.#options!;
    const owner = options.ownerFingerprint();
    const results: TaskWorktreeRecoveryResultV4[] = [];
    for (const candidate of options.plans.listForRecovery(owner)) {
      let reservation: ReturnType<MergePlanStoreV4["reserveForRecovery"]> | null = null;
      try {
        reservation = options.plans.reserveForRecovery(candidate.mergePlanId, owner);
        const plan = reservation.plan;
        const outcome = await this.#recoverPlan(plan);
        if (outcome === "preserved") {
          reservation.release();
          reservation = null;
          continue;
        }
        await options.recordRecovery?.(plan, outcome);
        reservation.consume();
        reservation = null;
        results.push({
          taskWorktreeId: plan.taskWorktreeId,
          mergePlanId: plan.mergePlanId,
          outcome
        });
      } catch {
        reservation?.release();
        try {
          const plan = options.plans.getForRecovery(candidate.mergePlanId, owner);
          if (plan.lifecycleState !== "recovery_required") {
            options.plans.transition(
              plan.mergePlanId,
              owner,
              plan.lifecycleState,
              "recovery_required"
            );
          }
          const task = options.manager.options.store.read(plan.taskWorktreeId);
          if (task.record.state !== "recovery_required") {
            options.manager.options.store.update(plan.taskWorktreeId, {
              state: "recovery_required",
              headOid: plan.taskOid
            });
          }
          await options.recordRecovery?.(plan, "recovery_required");
        } catch { }
        results.push({
          taskWorktreeId: candidate.taskWorktreeId,
          mergePlanId: candidate.mergePlanId,
          outcome: "recovery_required"
        });
      }
    }

    const activeTasks = new Set(options.plans.listForRecovery(owner).map((plan) => plan.taskWorktreeId));
    for (const { record, privateState } of options.manager.options.store.listAll()) {
      if (
        privateState.ownerFingerprint === owner &&
        record.state === "recovery_required" &&
        !activeTasks.has(record.taskWorktreeId) &&
        privateState.adminDir &&
        privateState.removalReview
      ) {
        try {
          const outcome = await this.#recoverRemoval({ record, privateState });
          if (!outcome) throw new Error("GIT_RECOVERY_REQUIRED");
          results.push({ taskWorktreeId: record.taskWorktreeId, mergePlanId: null, outcome });
          continue;
        } catch {
          results.push({
            taskWorktreeId: record.taskWorktreeId,
            mergePlanId: null,
            outcome: "recovery_required"
          });
          continue;
        }
      }
      if (
        privateState.ownerFingerprint === owner &&
        record.state === "preparing"
      ) {
        options.manager.options.store.update(record.taskWorktreeId, { state: "recovery_required" });
        results.push({
          taskWorktreeId: record.taskWorktreeId,
          mergePlanId: null,
          outcome: "recovery_required"
        });
      } else if (
        privateState.ownerFingerprint === owner &&
        record.state === "merge_prepared" &&
        !activeTasks.has(record.taskWorktreeId)
      ) {
        options.manager.options.store.update(record.taskWorktreeId, { state: "recovery_required" });
        results.push({
          taskWorktreeId: record.taskWorktreeId,
          mergePlanId: null,
          outcome: "recovery_required"
        });
      }
    }
    return results;
  }

  async #recoverRemoval(input: {
    record: ReturnType<TaskWorktreeStoreV1["read"]>["record"];
    privateState: ReturnType<TaskWorktreeStoreV1["read"]>["privateState"];
  }): Promise<"rolled_back" | "cleanup_completed" | null> {
    const options = this.#options!;
    const { record, privateState } = input;
    const removalReview = privateState.removalReview;
    if (!removalReview) return null;
    const paths = taskRemovalQuarantinePaths({
      managedRoot: options.manager.options.root.root,
      taskWorktreeId: record.taskWorktreeId,
      generation: record.generation,
      worktreePath: privateState.worktreePath,
      adminDir: privateState.adminDir!
    });
    const exists = async (target: string) => fsp.lstat(target).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    const [worktree, admin, worktreeQuarantine, adminQuarantine] = await Promise.all([
      exists(privateState.worktreePath),
      exists(privateState.adminDir!),
      exists(paths.worktreeQuarantine),
      exists(paths.adminQuarantine)
    ]);
    if (worktree || worktreeQuarantine) {
      const inventory = await validateManagedTaskTree({
        root: options.manager.options.root,
        target: worktree ? privateState.worktreePath : paths.worktreeQuarantine,
        allowGitMarker: true
      });
      if (
        inventory.identityDigest !== removalReview.worktreeInventoryDigest ||
        inventory.entryCount !== removalReview.worktreeEntryCount
      ) throw new Error("GIT_RECOVERY_REQUIRED");
    }
    if (admin || adminQuarantine) {
      const inventory = await validateManagedTaskTree({
        root: {
          root: paths.adminParent,
          volume: path.parse(paths.adminParent).root.toLocaleLowerCase("en-US"),
          identity: "admin-parent"
        },
        target: admin ? privateState.adminDir! : paths.adminQuarantine
      });
      if (
        inventory.identityDigest !== removalReview.adminInventoryDigest ||
        inventory.entryCount !== removalReview.adminEntryCount
      ) throw new Error("GIT_RECOVERY_REQUIRED");
    }
    if (worktree && admin && !worktreeQuarantine && !adminQuarantine) return null;
    if (!worktree && admin && worktreeQuarantine && !adminQuarantine) {
      await fsp.rename(paths.worktreeQuarantine, privateState.worktreePath);
      options.manager.options.store.update(record.taskWorktreeId, { state: "ready" });
      return "rolled_back";
    }
    if (worktree && !admin && !worktreeQuarantine && adminQuarantine) {
      await fsp.rename(paths.adminQuarantine, privateState.adminDir!);
      options.manager.options.store.update(record.taskWorktreeId, { state: "ready" });
      return "rolled_back";
    }
    if (worktree || admin) throw new Error("GIT_RECOVERY_REQUIRED");
    if (worktreeQuarantine) {
      await removeManagedTaskTree({
        root: options.manager.options.root,
        target: paths.worktreeQuarantine,
        allowGitMarker: true
      });
    }
    if (adminQuarantine) {
      await removeManagedTaskTree({
        root: {
          root: paths.adminParent,
          volume: path.parse(paths.adminParent).root.toLocaleLowerCase("en-US"),
          identity: "admin-parent"
        },
        target: paths.adminQuarantine
      });
    }
    options.manager.options.store.update(record.taskWorktreeId, { state: "removed" });
    return "cleanup_completed";
  }

  async #recoverPlan(
    plan: MergePlanV4
  ): Promise<"rolled_back" | "cleanup_completed" | "preserved"> {
    const options = this.#options!;
    const task = options.manager.options.store.read(plan.taskWorktreeId);
    if (
      task.privateState.ownerFingerprint !== plan.ownerFingerprint ||
      task.record.repositoryId !== plan.repositoryId ||
      task.privateState.targetRef !== plan.targetRef ||
      task.privateState.branchRef !== plan.taskRef ||
      task.record.headOid !== plan.taskOid ||
      task.record.state === "removed"
    ) throw new Error("GIT_RECOVERY_REQUIRED");
    const workspace: Workspace = {
      id: "ws_merge_recovery",
      root: plan.primaryWorkspaceRoot,
      openedAt: new Date(0).toISOString()
    };
    const repository = await options.manager.primaryRepository(workspace);
    if (
      repository.repositoryId !== plan.repositoryId ||
      repository.stableIdentityFingerprint !== plan.repositoryIdentityFingerprint ||
      repository.capabilityRevision !== plan.capabilityRevision
    ) throw new Error("GIT_RECOVERY_REQUIRED");
    const targetOid = await this.#refOid(repository, plan.targetRef);
    const taskOid = await this.#refOid(repository, plan.taskRef);
    if (taskOid !== plan.taskOid) throw new Error("GIT_RECOVERY_REQUIRED");
    const effectObserved = targetOid === plan.candidateOid;
    if (!effectObserved && targetOid !== plan.targetOid) throw new Error("GIT_RECOVERY_REQUIRED");
    if (
      !effectObserved &&
      plan.lifecycleState === "prepared" &&
      Date.parse(plan.expiresAt) > options.now()
    ) return "preserved";
    if (plan.candidateRef) {
      const candidateOid = await this.#optionalRefOid(repository, plan.candidateRef);
      if (candidateOid !== null && candidateOid !== plan.candidateOid) {
        throw new Error("GIT_RECOVERY_REQUIRED");
      }
      if (candidateOid === plan.candidateOid) {
        const deleted = await options.manager.options.context.options.executor.run(repository, [
          "update-ref", "--no-deref", "-d", plan.candidateRef, plan.candidateOid
        ]);
        if (deleted.status !== 0) throw new Error("GIT_RECOVERY_REQUIRED");
      }
    }
    await options.candidateWorkspaces.cleanup(plan.integrationWorkspaceId);
    options.verificationReceipts.revokeForPlan(plan.mergePlanId);
    const current = options.manager.options.store.read(plan.taskWorktreeId);
    if (current.record.state !== "ready") {
      options.manager.options.store.update(plan.taskWorktreeId, {
        state: "ready",
        headOid: plan.taskOid
      });
    }
    return effectObserved ? "cleanup_completed" : "rolled_back";
  }

  async #refOid(repository: GitRepositoryIdentity, ref: string): Promise<string> {
    const result = await this.#options!.manager.options.context.options.executor.run(repository, [
      "rev-parse", "--verify", ref
    ], { stdoutLimitBytes: 256 });
    const oid = result.stdout.toString("ascii").trim();
    if (
      result.status !== 0 ||
      result.timedOut ||
      result.stdoutTruncated ||
      result.stderrTruncated ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid)
    ) throw new Error("GIT_RECOVERY_REQUIRED");
    return oid;
  }

  async #optionalRefOid(repository: GitRepositoryIdentity, ref: string): Promise<string | null> {
    const result = await this.#options!.manager.options.context.options.executor.run(repository, [
      "show-ref", "--hash", "--verify", ref
    ], { stdoutLimitBytes: 256 });
    if (result.status === 1 && !result.timedOut && !result.stdoutTruncated && !result.stderrTruncated) {
      return null;
    }
    const oid = result.stdout.toString("ascii").trim();
    if (
      result.status !== 0 ||
      result.timedOut ||
      result.stdoutTruncated ||
      result.stderrTruncated ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid)
    ) throw new Error("GIT_RECOVERY_REQUIRED");
    return oid;
  }
}

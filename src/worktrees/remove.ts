import fsp from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitReviewTokenServiceV4 } from "../git/reviewToken.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { TaskWorktreeWorkspaceAuthorityV4 } from "./workspaceAuthority.js";
import { removeManagedTaskTree, validateManagedTaskTree } from "./remover.js";

interface RemoveReviewV4 {
  taskWorktreeId: string;
  ownerFingerprint: string;
  repositoryId: string;
  generation: number;
  headOid: string;
  worktreePath: string;
  adminDir: string;
  markerDigest: string;
  worktreeInventoryDigest: string;
  worktreeEntryCount: number;
  adminInventoryDigest: string;
  adminEntryCount: number;
}

function taskWorktreeInUseError(error: unknown): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
    return new Error("TASK_WORKTREE_IN_USE", { cause: error });
  }
  return error instanceof Error ? error : new Error("TASK_WORKTREE_IN_USE", { cause: error });
}

export function taskRemovalQuarantinePaths(input: {
  managedRoot: string;
  taskWorktreeId: string;
  generation: number;
  worktreePath: string;
  adminDir: string;
}): { worktreeQuarantine: string; adminQuarantine: string; adminParent: string } {
  const suffix = `.${input.taskWorktreeId}.codexgpt-removing`;
  const adminParent = path.dirname(input.adminDir);
  return {
    worktreeQuarantine: path.join(input.managedRoot, `${path.basename(input.worktreePath)}${suffix}`),
    adminQuarantine: path.join(adminParent, `${path.basename(input.adminDir)}${suffix}`),
    adminParent
  };
}

async function removalInventories(input: {
  managedRoot: TaskWorktreeManagerV4["options"]["root"];
  worktreePath: string;
  adminDir: string;
}) {
  const adminParent = path.dirname(input.adminDir);
  if (await fsp.realpath(adminParent) !== adminParent) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
  const worktree = await validateManagedTaskTree({
    root: input.managedRoot,
    target: input.worktreePath,
    allowGitMarker: true
  });
  const admin = await validateManagedTaskTree({
    root: {
      root: adminParent,
      volume: path.parse(adminParent).root.toLocaleLowerCase("en-US"),
      identity: "admin-parent"
    },
    target: input.adminDir
  });
  return { worktree, admin };
}

function removalReviewFacts(review: RemoveReviewV4) {
  return {
    worktreeInventoryDigest: review.worktreeInventoryDigest,
    worktreeEntryCount: review.worktreeEntryCount,
    adminInventoryDigest: review.adminInventoryDigest,
    adminEntryCount: review.adminEntryCount
  };
}

export class TaskWorktreeRemoveV4 {
  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    authority: TaskWorktreeWorkspaceAuthorityV4;
    reviews: GitReviewTokenServiceV4;
    ownerFingerprint: () => string;
    hasActiveProcesses?: (root: string) => boolean | Promise<boolean>;
    drainActiveProcesses?: (root: string) => void | Promise<void>;
    beforeAdminQuarantine?: (paths: { worktreeQuarantine: string; adminQuarantine: string }) => void | Promise<void>;
  }) {}

  async prepare(input: { workspace: Workspace; taskWorktreeId: string }) {
    const owner = this.options.ownerFingerprint();
    const task = await this.options.manager.revalidate(input.taskWorktreeId, owner);
    if (!task.privateState.adminDir || task.record.state !== "ready") {
      throw new Error("TASK_WORKTREE_DIRTY");
    }
    if (await this.options.hasActiveProcesses?.(task.privateState.worktreePath)) {
      throw new Error("TASK_WORKTREE_IN_USE");
    }
    const repository = await this.options.manager.primaryRepository(input.workspace);
    const taskRepository = {
      ...repository,
      worktreeRoot: task.privateState.worktreePath,
      gitDir: task.privateState.adminDir
    };
    const status = await this.options.manager.options.context.options.executor.run(taskRepository, [
      "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
    ], { stdoutLimitBytes: 4 * 1024 * 1024 });
    if (status.status !== 0 || status.stdout.length !== 0) throw new Error("TASK_WORKTREE_DIRTY");
    const headOid = (await runGitRequired(
      this.options.manager.options.context.options.executor,
      taskRepository,
      ["rev-parse", "--verify", "HEAD"],
      { stdoutLimitBytes: 256 }
    )).stdout.toString("ascii").trim();
    if (headOid !== task.record.headOid) throw new Error("GIT_STATE_CHANGED");
    const marker = await fsp.readFile(path.join(task.privateState.worktreePath, ".git"));
    const inventories = await removalInventories({
      managedRoot: this.options.manager.options.root,
      worktreePath: task.privateState.worktreePath,
      adminDir: task.privateState.adminDir
    });
    const reviewToken = this.options.reviews.mint<RemoveReviewV4>("task_remove", {
      taskWorktreeId: task.record.taskWorktreeId,
      ownerFingerprint: owner,
      repositoryId: task.record.repositoryId,
      generation: task.record.generation,
      headOid,
      worktreePath: task.privateState.worktreePath,
      adminDir: task.privateState.adminDir,
      markerDigest: sha256Git(marker),
      worktreeInventoryDigest: inventories.worktree.identityDigest,
      worktreeEntryCount: inventories.worktree.entryCount,
      adminInventoryDigest: inventories.admin.identityDigest,
      adminEntryCount: inventories.admin.entryCount
    });
    return {
      action: "prepare" as const,
      repository_id: task.record.repositoryId,
      task_worktree_id: task.record.taskWorktreeId,
      review_token: reviewToken,
      clean: true as const,
      branch_retained: true as const,
      commits_retained: true as const,
      private_stashes_retained: true as const
    };
  }

  async execute(input: {
    workspace: Workspace;
    taskWorktreeId: string;
    reviewToken: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }) {
    const review = this.options.reviews.inspect<RemoveReviewV4>(input.reviewToken, "task_remove");
    const owner = this.options.ownerFingerprint();
    if (review.taskWorktreeId !== input.taskWorktreeId || review.ownerFingerprint !== owner) {
      throw new Error("TASK_WORKTREE_NOT_FOUND");
    }
    const task = await this.options.manager.revalidate(input.taskWorktreeId, owner);
    if (
      task.record.generation !== review.generation ||
      task.record.headOid !== review.headOid ||
      task.privateState.worktreePath !== review.worktreePath ||
      task.privateState.adminDir !== review.adminDir
    ) throw new Error("GIT_STATE_CHANGED");
    const markerPath = path.join(review.worktreePath, ".git");
    const marker = await fsp.readFile(markerPath);
    if (sha256Git(marker) !== review.markerDigest) throw new Error("GIT_STATE_CHANGED");
    const repository = await this.options.manager.primaryRepository(input.workspace);
    return this.options.manager.options.journal.run({
      authorization: input.authorization,
      repository,
      toolName: "remove_task_worktree",
      canonicalAction: "task_remove",
      workspaceId: input.workspace.id,
      participants: ["file_transaction", "task_registry"],
      counts: { affectedTaskCount: 1 },
      privateState: review,
      preEffect: async () => {
        const current = await this.options.manager.revalidate(input.taskWorktreeId, owner);
        if (
          current.record.state !== "ready" ||
          current.record.generation !== review.generation ||
          current.record.headOid !== review.headOid
        ) throw new Error("GIT_STATE_CHANGED");
        const taskRepository = {
          ...repository,
          worktreeRoot: review.worktreePath,
          gitDir: review.adminDir
        };
        const status = await this.options.manager.options.context.options.executor.run(taskRepository, [
          "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
        ], { stdoutLimitBytes: 4 * 1024 * 1024 });
        const currentHead = (await runGitRequired(
          this.options.manager.options.context.options.executor,
          taskRepository,
          ["rev-parse", "--verify", "HEAD"],
          { stdoutLimitBytes: 256 }
        )).stdout.toString("ascii").trim();
        const currentMarker = await fsp.readFile(markerPath);
        const inventories = await removalInventories({
          managedRoot: this.options.manager.options.root,
          worktreePath: review.worktreePath,
          adminDir: review.adminDir
        });
        if (
          status.status !== 0 ||
          status.stdout.length !== 0 ||
          currentHead !== review.headOid ||
          sha256Git(currentMarker) !== review.markerDigest ||
          inventories.worktree.identityDigest !== review.worktreeInventoryDigest ||
          inventories.worktree.entryCount !== review.worktreeEntryCount ||
          inventories.admin.identityDigest !== review.adminInventoryDigest ||
          inventories.admin.entryCount !== review.adminEntryCount
        ) throw new Error("TASK_WORKTREE_DIRTY");
        await this.options.drainActiveProcesses?.(review.worktreePath);
        if (await this.options.hasActiveProcesses?.(review.worktreePath)) {
          throw new Error("TASK_WORKTREE_IN_USE");
        }
      },
      effect: async () => {
        const { worktreeQuarantine, adminQuarantine, adminParent } = taskRemovalQuarantinePaths({
          managedRoot: this.options.manager.options.root.root,
          taskWorktreeId: review.taskWorktreeId,
          generation: review.generation,
          worktreePath: review.worktreePath,
          adminDir: review.adminDir
        });
        if (await fsp.realpath(adminParent) !== adminParent) throw new Error("GIT_RECOVERY_REQUIRED");
        try {
          await fsp.rename(review.worktreePath, worktreeQuarantine);
        } catch (error) {
          throw taskWorktreeInUseError(error);
        }
        await this.options.beforeAdminQuarantine?.({ worktreeQuarantine, adminQuarantine });
        try {
          await fsp.rename(review.adminDir, adminQuarantine);
        } catch (error) {
          const restored = await fsp.rename(worktreeQuarantine, review.worktreePath)
            .then(() => true, () => false);
          if (!restored) {
            const current = this.options.manager.options.store.read(review.taskWorktreeId);
            this.options.manager.options.store.update(review.taskWorktreeId, {
              state: "recovery_required",
              privateState: { ...current.privateState, removalReview: removalReviewFacts(review) }
            });
            throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
          }
          throw taskWorktreeInUseError(error);
        }
        try {
          const worktreeInventory = await validateManagedTaskTree({
            root: this.options.manager.options.root,
            target: worktreeQuarantine,
            allowGitMarker: true
          });
          const adminInventory = await validateManagedTaskTree({
            root: {
              root: adminParent,
              volume: path.parse(adminParent).root.toLocaleLowerCase("en-US"),
              identity: "admin-parent"
            },
            target: adminQuarantine
          });
          if (
            worktreeInventory.identityDigest !== review.worktreeInventoryDigest ||
            worktreeInventory.entryCount !== review.worktreeEntryCount ||
            adminInventory.identityDigest !== review.adminInventoryDigest ||
            adminInventory.entryCount !== review.adminEntryCount
          ) throw new Error("GIT_STATE_CHANGED");
        } catch (error) {
          const rollbackFailures: unknown[] = [];
          await fsp.rename(adminQuarantine, review.adminDir).catch((rollbackError) => {
            rollbackFailures.push(rollbackError);
          });
          await fsp.rename(worktreeQuarantine, review.worktreePath).catch((rollbackError) => {
            rollbackFailures.push(rollbackError);
          });
          if (rollbackFailures.length > 0) {
            const current = this.options.manager.options.store.read(review.taskWorktreeId);
            this.options.manager.options.store.update(review.taskWorktreeId, {
              state: "recovery_required",
              privateState: { ...current.privateState, removalReview: removalReviewFacts(review) }
            });
            throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
          }
          throw error;
        }
        try {
          const current = this.options.manager.options.store.read(review.taskWorktreeId);
          this.options.manager.options.store.update(review.taskWorktreeId, {
            state: "recovery_required",
            privateState: { ...current.privateState, removalReview: removalReviewFacts(review) }
          });
        } catch (error) {
          const rollbackFailures: unknown[] = [];
          await fsp.rename(adminQuarantine, review.adminDir).catch((rollbackError) => {
            rollbackFailures.push(rollbackError);
          });
          await fsp.rename(worktreeQuarantine, review.worktreePath).catch((rollbackError) => {
            rollbackFailures.push(rollbackError);
          });
          if (rollbackFailures.length > 0) throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
          throw error;
        }
        try {
          await removeManagedTaskTree({
            root: this.options.manager.options.root,
            target: worktreeQuarantine,
            allowGitMarker: true
          });
          await removeManagedTaskTree({
            root: {
              root: adminParent,
              volume: path.parse(adminParent).root.toLocaleLowerCase("en-US"),
              identity: "admin-parent"
            },
            target: adminQuarantine
          });
        } catch (error) {
          this.options.manager.options.store.update(review.taskWorktreeId, { state: "recovery_required" });
          throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
        }
        try {
          this.options.manager.options.store.update(review.taskWorktreeId, { state: "removed" });
        } catch (error) {
          throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
        }
        this.options.authority.revokeTask(review.taskWorktreeId);
        this.options.reviews.consume<RemoveReviewV4>(input.reviewToken, "task_remove");
        return {
          action: "execute" as const,
          repository_id: review.repositoryId,
          task_worktree_id: review.taskWorktreeId,
          removed: true as const,
          branch_retained: true as const
        };
      }
    });
  }
}

import fsp from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitReviewTokenServiceV4 } from "../git/reviewToken.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { TaskWorktreeWorkspaceAuthorityV4 } from "./workspaceAuthority.js";
import { removeManagedTaskTree } from "./remover.js";

interface RemoveReviewV4 {
  taskWorktreeId: string;
  ownerFingerprint: string;
  repositoryId: string;
  generation: number;
  headOid: string;
  worktreePath: string;
  adminDir: string;
  markerDigest: string;
}

export class TaskWorktreeRemoveV4 {
  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    authority: TaskWorktreeWorkspaceAuthorityV4;
    reviews: GitReviewTokenServiceV4;
    ownerFingerprint: () => string;
  }) {}

  async prepare(input: { workspace: Workspace; taskWorktreeId: string }) {
    const owner = this.options.ownerFingerprint();
    const task = await this.options.manager.revalidate(input.taskWorktreeId, owner);
    if (!task.privateState.adminDir || task.record.state !== "ready") {
      throw new Error("TASK_WORKTREE_DIRTY");
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
    const reviewToken = this.options.reviews.mint<RemoveReviewV4>("task_remove", {
      taskWorktreeId: task.record.taskWorktreeId,
      ownerFingerprint: owner,
      repositoryId: task.record.repositoryId,
      generation: task.record.generation,
      headOid,
      worktreePath: task.privateState.worktreePath,
      adminDir: task.privateState.adminDir,
      markerDigest: sha256Git(marker)
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
        if (
          status.status !== 0 ||
          status.stdout.length !== 0 ||
          currentHead !== review.headOid ||
          sha256Git(currentMarker) !== review.markerDigest
        ) throw new Error("TASK_WORKTREE_DIRTY");
      },
      effect: async () => {
        this.options.authority.revokeTask(review.taskWorktreeId);
        await fsp.unlink(markerPath);
        await removeManagedTaskTree({
          root: this.options.manager.options.root,
          target: review.worktreePath
        });
        const adminParent = await fsp.realpath(path.dirname(review.adminDir));
        await removeManagedTaskTree({
          root: {
            root: adminParent,
            volume: path.parse(adminParent).root.toLocaleLowerCase("en-US"),
            identity: "admin-parent"
          },
          target: review.adminDir
        });
        this.options.manager.options.store.update(review.taskWorktreeId, { state: "removed" });
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

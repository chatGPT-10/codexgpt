import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitMutationContextV4 } from "../git/mutationContext.js";
import { gitMutationError, runGitRequired, sha256Git } from "../git/mutationContext.js";
import type { GitMutationJournalV4 } from "../git/mutationJournal.js";
import type { GitReviewTokenServiceV4 } from "../git/reviewToken.js";
import { admitGitRepository } from "../git/repositoryIdentity.js";
import type { ManagedWorktreeRoot } from "./root.js";
import { managedTaskPath } from "./root.js";
import { buildTaskTreeManifest, type TaskTreeManifestV1 } from "./treeManifest.js";
import { materializeTaskTree } from "./materializer.js";
import type { TaskWorktreeStoreV1 } from "./store.js";

interface CreateTaskReviewV4 {
  workspaceId: string;
  ownerFingerprint: string;
  repositoryId: string;
  capabilityRevision: string;
  taskWorktreeId: string;
  targetRef: string;
  baseOid: string;
  branchRef: string;
  branchId: string;
  targetBranchId: string;
  treeOid: string;
  manifestDigest: string;
  entryCount: number;
  totalBytes: number;
  managedRootIdentity: string;
}

function slug(value: string): string {
  const result = value.normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("en-US")
    .slice(0, 40);
  return result || "task";
}

function manifestDigest(manifest: TaskTreeManifestV1): string {
  return sha256Git(JSON.stringify({
    treeOid: manifest.treeOid,
    totalBytes: manifest.totalBytes,
    entries: manifest.entries
  }));
}

async function adminDirectory(target: string): Promise<string> {
  const marker = await fsp.readFile(path.join(target, ".git"), "utf8");
  const match = /^gitdir: (.+)\r?\n?$/u.exec(marker);
  if (!match) throw new Error("TASK_WORKTREE_RECOVERY_REQUIRED");
  const resolved = path.resolve(target, match[1]);
  return fsp.realpath(resolved);
}

export class TaskWorktreeManagerV4 {
  constructor(readonly options: {
    context: GitMutationContextV4;
    journal: GitMutationJournalV4;
    reviews: GitReviewTokenServiceV4;
    root: ManagedWorktreeRoot;
    store: TaskWorktreeStoreV1;
    maxTasks: number;
    maxFiles: number;
    maxBytes: number;
  }) {}

  async prepareCreate(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    taskName: string;
    branchName?: string;
    ownerFingerprint: string;
  }) {
    const verified = await this.options.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken
    });
    this.#assertQuota(input.ownerFingerprint, verified.repository.repositoryId);
    const repository = verified.repository;
    const clean = await this.options.context.options.executor.run(repository, [
      "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
    ], { stdoutLimitBytes: 4 * 1024 * 1024 });
    if (clean.status !== 0 || clean.stdout.length !== 0) throw new Error("GIT_STATE_CHANGED");
    const targetRef = (await runGitRequired(this.options.context.options.executor, repository, [
      "symbolic-ref", "-q", "HEAD"
    ], { stdoutLimitBytes: 512 })).stdout.toString("utf8").trim();
    if (!targetRef.startsWith("refs/heads/")) throw gitMutationError("GIT_DETACHED_HEAD");
    const baseOid = (await runGitRequired(this.options.context.options.executor, repository, [
      "rev-parse", "--verify", targetRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    const manifest = await buildTaskTreeManifest({
      executor: this.options.context.options.executor,
      repository,
      treeish: baseOid,
      guard: input.guard,
      maxFiles: this.options.maxFiles,
      maxBytes: this.options.maxBytes
    });
    const taskWorktreeId = `task_${randomBytes(16).toString("hex")}`;
    const branchRef = `refs/heads/${input.branchName ?? `codex/${slug(input.taskName)}-${randomBytes(4).toString("hex")}`}`;
    if (!/^refs\/heads\/codex\/[a-z0-9][a-z0-9._/-]{0,119}$/u.test(branchRef)) {
      throw new Error("GIT_BRANCH_NAME_INVALID");
    }
    const branchId = this.options.context.branchId(repository.repositoryId, branchRef);
    const targetBranchId = this.options.context.branchId(repository.repositoryId, targetRef);
    const reviewToken = this.options.reviews.mint<CreateTaskReviewV4>("task_create", {
      workspaceId: input.workspace.id,
      ownerFingerprint: input.ownerFingerprint,
      repositoryId: repository.repositoryId,
      capabilityRevision: repository.capabilityRevision,
      taskWorktreeId,
      targetRef,
      baseOid,
      branchRef,
      branchId,
      targetBranchId,
      treeOid: manifest.treeOid,
      manifestDigest: manifestDigest(manifest),
      entryCount: manifest.entries.length,
      totalBytes: manifest.totalBytes,
      managedRootIdentity: this.options.root.identity
    });
    return {
      action: "prepare" as const,
      repository_id: repository.repositoryId,
      task_worktree_id: taskWorktreeId,
      branch_id: branchId,
      target_branch_id: targetBranchId,
      base_oid: baseOid,
      review_token: reviewToken,
      affected_entry_count: manifest.entries.length,
      affected_byte_count: manifest.totalBytes,
      materialization: "raw_git_blobs" as const,
      external_filters_hydrated: false as const,
      submodules_initialized: false as const
    };
  }

  async executeCreate(input: {
    workspace: Workspace;
    guard: PathGuard;
    reviewToken: string;
    ownerFingerprint: string;
    authorization: AuthorizationAuditEventV4 | null | undefined;
  }) {
    const review = this.options.reviews.inspect<CreateTaskReviewV4>(
      input.reviewToken,
      "task_create"
    );
    if (
      review.workspaceId !== input.workspace.id ||
      review.ownerFingerprint !== input.ownerFingerprint ||
      review.managedRootIdentity !== this.options.root.identity
    ) throw new Error("GIT_STATE_CHANGED");
    const repository = await this.primaryRepository(input.workspace);
    this.#assertQuota(input.ownerFingerprint, repository.repositoryId);
    if (
      repository.repositoryId !== review.repositoryId ||
      repository.capabilityRevision !== review.capabilityRevision
    ) throw new Error("GIT_STATE_CHANGED");
    const clean = await this.options.context.options.executor.run(repository, [
      "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
    ], { stdoutLimitBytes: 4 * 1024 * 1024 });
    if (clean.status !== 0 || clean.stdout.length !== 0) throw new Error("GIT_STATE_CHANGED");
    const currentRef = (await runGitRequired(this.options.context.options.executor, repository, [
      "symbolic-ref", "-q", "HEAD"
    ], { stdoutLimitBytes: 512 })).stdout.toString("utf8").trim();
    const baseOid = (await runGitRequired(this.options.context.options.executor, repository, [
      "rev-parse", "--verify", review.targetRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    if (currentRef !== review.targetRef || baseOid !== review.baseOid) throw new Error("GIT_STATE_CHANGED");
    const manifest = await buildTaskTreeManifest({
      executor: this.options.context.options.executor,
      repository,
      treeish: baseOid,
      guard: input.guard,
      maxFiles: this.options.maxFiles,
      maxBytes: this.options.maxBytes
    });
    if (
      manifest.treeOid !== review.treeOid ||
      manifest.entries.length !== review.entryCount ||
      manifest.totalBytes !== review.totalBytes ||
      manifestDigest(manifest) !== review.manifestDigest
    ) throw new Error("GIT_STATE_CHANGED");
    const target = managedTaskPath(this.options.root, review.taskWorktreeId);
    const zero = "0".repeat(baseOid.length);
    try {
      const result = await this.options.journal.run({
        authorization: input.authorization,
        repository,
        toolName: "create_task_worktree",
        canonicalAction: "task_create",
        workspaceId: input.workspace.id,
        participants: ["ref_cas", "file_transaction", "task_registry"],
        counts: {
          affectedEntryCount: manifest.entries.length,
          affectedByteCount: manifest.totalBytes
        },
        privateState: {
          taskWorktreeId: review.taskWorktreeId,
          target,
          branchRef: review.branchRef,
          targetRef: review.targetRef,
          baseOid,
          treeOid: manifest.treeOid,
          reviewTokenDigest: sha256Git(input.reviewToken)
        },
        effectState: (value) => ({
          taskWorktreeId: value.record.taskWorktreeId,
          taskGeneration: value.record.generation,
          taskState: value.record.state,
          branchRef: review.branchRef,
          baseOid,
          treeOid: manifest.treeOid,
          worktreePath: value.privateState.worktreePath,
          adminDir: value.privateState.adminDir,
          reviewTokenDigest: sha256Git(input.reviewToken)
        }),
        effect: async () => {
          const created = this.options.store.create({
            managedRoot: this.options.root.root,
            ownerFingerprint: input.ownerFingerprint,
            repositoryId: repository.repositoryId,
            branchRef: review.branchRef,
            targetRef: review.targetRef,
            branchId: review.branchId,
            targetBranchId: review.targetBranchId,
            baseOid: review.baseOid,
            taskWorktreeId: review.taskWorktreeId
          });
          const ref = await this.options.context.options.executor.run(repository, [
            "update-ref", "--no-deref", review.branchRef, baseOid, zero
          ]);
          if (ref.status !== 0) throw new Error("GIT_REF_CHANGED");
          const add = await this.options.context.options.executor.run(repository, [
            "worktree", "add", "--no-checkout", "--lock", target,
            review.branchRef.slice("refs/heads/".length)
          ]);
          if (add.status !== 0) throw new Error("TASK_WORKTREE_CREATE_FAILED");
          const adminDir = await adminDirectory(target);
          await materializeTaskTree({
            root: this.options.root,
            target,
            executor: this.options.context.options.executor,
            repository,
            manifest,
            existingTarget: true
          });
          await runGitRequired(this.options.context.options.executor, repository, [
            "read-tree", manifest.treeOid
          ], { privateIndexPath: path.join(adminDir, "index") });
          const nextPrivate = { ...created.privateState, adminDir };
          const record = this.options.store.update(created.record.taskWorktreeId, {
            state: "ready",
            headOid: baseOid,
            privateState: nextPrivate
          });
          return { record, privateState: nextPrivate, manifest };
        }
      });
      this.options.reviews.consume<CreateTaskReviewV4>(input.reviewToken, "task_create");
      return result;
    } catch (error) {
      try {
        this.options.store.update(review.taskWorktreeId, { state: "recovery_required" });
      } catch {
        // Authorization or journal preparation may fail before the task record exists.
      }
      throw error;
    }
  }

  async revalidate(taskWorktreeId: string, ownerFingerprint: string) {
    const item = this.options.store.read(taskWorktreeId);
    if (
      item.privateState.ownerFingerprint !== ownerFingerprint ||
      item.record.state === "removed" ||
      item.record.state === "recovery_required"
    ) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const root = await fsp.realpath(item.privateState.worktreePath).catch(() => null);
    if (root !== item.privateState.worktreePath || path.dirname(root) !== this.options.root.root) {
      throw new Error("TASK_WORKTREE_NOT_FOUND");
    }
    return item;
  }

  async primaryRepository(workspace: Workspace) {
    return admitGitRepository({
      workspaceRoot: workspace.root,
      executor: this.options.context.options.executor,
      registry: this.options.context.options.registry
    });
  }

  #assertQuota(ownerFingerprint: string, repositoryId: string): void {
    if (this.options.store.list(ownerFingerprint, repositoryId).length >= this.options.maxTasks) {
      throw new Error("TASK_WORKTREE_QUOTA_EXCEEDED");
    }
  }
}

import fsp from "node:fs/promises";
import path from "node:path";
import { hasSecretValue } from "../redact.js";
import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import { parseGitRawDiffZ } from "../git/parsers.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import { GitObjectQuarantine } from "../git/objectQuarantine.js";
import type { GitReviewTokenServiceV4 } from "../git/reviewToken.js";
import type { GitRepositoryIdentity } from "../git/repositoryIdentity.js";
import type { GitIntegrationGateV4 } from "../git/integrations.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { MergePlanStoreV4 } from "./mergePlanStore.js";
import { buildTaskTreeManifest } from "./treeManifest.js";

interface DivergentMergeReviewV4 {
  repositoryId: string;
  taskWorktreeId: string;
  ownerFingerprint: string;
  targetRef: string;
  taskRef: string;
  targetOid: string;
  taskOid: string;
  candidateOid: string;
  message: string;
  systemDate: string;
  scanDigest: string;
  expiresAt: string;
}

async function localIdentity(manager: TaskWorktreeManagerV4, repository: GitRepositoryIdentity) {
  const read = async (key: string) => {
    const result = await manager.options.context.options.executor.run(repository, [
      "config", "--local", "--no-includes", "--get", key
    ], { stdoutLimitBytes: 1024 });
    const value = result.stdout.toString("utf8").trim();
    if (result.status !== 0 || !value || /[\u0000\r\n]/u.test(value) || hasSecretValue(value)) {
      throw new Error("GIT_IDENTITY_REQUIRED");
    }
    return value;
  };
  return { name: await read("user.name"), email: await read("user.email") };
}

async function looseObjectIds(root: string, width: number): Promise<string[]> {
  const output: string[] = [];
  for (const directory of await fsp.readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !/^[a-f0-9]{2}$/u.test(directory.name)) continue;
    for (const file of await fsp.readdir(path.join(root, directory.name), { withFileTypes: true })) {
      const oid = `${directory.name}${file.name}`;
      if (!file.isFile() || !new RegExp(`^[a-f0-9]{${width}}$`, "u").test(oid)) {
        throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
      }
      output.push(oid);
    }
  }
  return output.sort();
}

function conflictPaths(stdout: Buffer, guard: PathGuard): string[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
  } catch {
    throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
  }
  const values: string[] = [];
  for (const field of text.split("\0")) {
    const match = /^(?:100644|100755) [a-f0-9]{40,64} [123]\t(.+)$/u.exec(field);
    if (!match) continue;
    const value = match[1];
    if (
      value.length > 4096 ||
      value.startsWith("/") ||
      value.includes("\\") ||
      value.split("/").some((segment) =>
        !segment || segment === "." || segment === ".." || segment.includes(":") || /[. ]$/u.test(segment)
      ) ||
      guard.isBlockedRelativePath(value) ||
      hasSecretValue(value)
    ) throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
    values.push(value);
  }
  return [...new Set(values)].sort().slice(0, 256);
}

async function hasCustomMergeDriver(
  manager: TaskWorktreeManagerV4,
  repository: GitRepositoryIdentity
): Promise<boolean> {
  const result = await manager.options.context.options.executor.run(repository, [
    "config",
    "--local",
    "--no-includes",
    "--get-regexp",
    "^merge\\..*\\.driver$"
  ], { stdoutLimitBytes: 128 * 1024 });
  if (
    result.timedOut ||
    result.stdoutTruncated ||
    result.stderrTruncated ||
    (result.status !== 0 && result.status !== 1)
  ) throw new Error("GIT_INTEGRATION_REQUIRED");
  return result.status === 0;
}

export class TaskWorktreeMergePrepareV4 {
  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    plans: MergePlanStoreV4;
    reviews: GitReviewTokenServiceV4;
    ownerFingerprint: () => string;
    integrationGate?: GitIntegrationGateV4;
  }) {}

  prepare(input: {
    workspace: Workspace;
    guard: PathGuard;
    taskWorktreeId: string;
    message?: string;
    integrationReviewToken?: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }) {
    return this.#prepare(input, null);
  }

  async finalize(input: {
    workspace: Workspace;
    guard: PathGuard;
    taskWorktreeId: string;
    reviewToken: string;
    integrationReviewToken?: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }) {
    const review = this.options.reviews.inspect<DivergentMergeReviewV4>(
      input.reviewToken,
      "task_merge_finalize"
    );
    return this.#prepare(input, { review, reviewToken: input.reviewToken, authorization: input.authorization });
  }

  async #prepare(
    input: {
      workspace: Workspace;
      guard: PathGuard;
      taskWorktreeId: string;
      message?: string;
      integrationReviewToken?: string;
      authorization?: AuthorizationAuditEventV4 | null;
    },
    finalize: {
      review: DivergentMergeReviewV4;
      reviewToken: string;
      authorization?: AuthorizationAuditEventV4 | null;
    } | null
  ) {
    const ownerFingerprint = this.options.ownerFingerprint();
    const task = await this.options.manager.revalidate(input.taskWorktreeId, ownerFingerprint);
    const repository = await this.options.manager.primaryRepository(input.workspace);
    if (repository.repositoryId !== task.record.repositoryId) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const executor = this.options.manager.options.context.options.executor;
    const integrationReview = input.integrationReviewToken
      ? this.options.integrationGate?.inspect(input.integrationReviewToken)
      : null;
    if (input.integrationReviewToken && (
      !this.options.integrationGate?.enabled ||
      integrationReview?.workspaceId !== input.workspace.id ||
      integrationReview.repositoryId !== repository.repositoryId
    )) throw new Error("GIT_INTEGRATION_REQUIRED");
    const targetOid = (await runGitRequired(executor, repository, [
      "rev-parse", "--verify", task.privateState.targetRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    const taskOid = (await runGitRequired(executor, repository, [
      "rev-parse", "--verify", task.privateState.branchRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    if (taskOid !== task.record.headOid) {
      this.options.manager.options.store.update(task.record.taskWorktreeId, {
        state: "ready",
        headOid: taskOid
      });
    }
    const ancestor = await executor.run(repository, ["merge-base", "--is-ancestor", targetOid, taskOid]);
    if (ancestor.status === 0) {
      if (finalize) throw new Error("MERGE_PLAN_INVALID");
      const scanned = await this.#scanCandidate(
        repository,
        input.guard,
        targetOid,
        taskOid
      );
      const plan = this.options.plans.create({
        taskWorktreeId: task.record.taskWorktreeId,
        repositoryId: repository.repositoryId,
        ownerFingerprint,
        targetRef: task.privateState.targetRef,
        taskRef: task.privateState.branchRef,
        candidateRef: null,
        targetOid,
        taskOid,
        candidateOid: taskOid,
        checksComplete: false,
        receiptIds: []
        ,
        affectedPathCount: scanned.changes.length,
        affectedByteCount: scanned.totalBytes,
        scanDigest: sha256Git(JSON.stringify(scanned))
      });
      this.options.manager.options.store.update(task.record.taskWorktreeId, {
        state: "merge_prepared",
        headOid: taskOid
      });
      return this.#result({
        action: "prepare",
        repositoryId: repository.repositoryId,
        taskWorktreeId: task.record.taskWorktreeId,
        planId: plan.mergePlanId,
        reviewToken: null,
        status: "checks_required",
        targetOid,
        taskOid,
        candidateOid: taskOid,
        changes: scanned.changes,
        expiresAt: plan.expiresAt
      });
    }

    const message = finalize?.review.message ?? input.message ?? "Merge CodexPro task worktree";
    if (!message.trim() || hasSecretValue(message) || Buffer.byteLength(message, "utf8") > 16 * 1024) {
      throw new Error("GIT_SECRET_BLOCKED");
    }
    const systemDate = finalize?.review.systemDate ?? new Date().toISOString();
    const quarantineRoot = await executor.createPrivateDirectory?.("git-merge");
    if (!quarantineRoot) throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
    try {
      if (!integrationReview && await hasCustomMergeDriver(this.options.manager, repository)) {
        throw new Error("GIT_INTEGRATION_REQUIRED");
      }
      const merged = integrationReview
        ? (await this.options.integrationGate!.execute({
            workspaceId: input.workspace.id,
            repository,
            reviewToken: input.integrationReviewToken!,
            authorization: input.authorization,
            semanticStateDigest: integrationReview.semanticStateDigest,
            expectedToolName: "merge_task_worktree",
            expectedCanonicalAction: finalize
              ? "task_merge_prepare_finalize"
              : "task_merge_prepare_review",
            request: {
              operation: "merge_tree",
              targetOid,
              taskOid,
              objectDirectoryPath: quarantineRoot
            }
          })).result
        : await executor.run(repository, [
            "merge-tree", "--write-tree", "-z", targetOid, taskOid
          ], { objectDirectoryPath: quarantineRoot, stdoutLimitBytes: 64 * 1024 });
      if (merged.status !== 0) {
        const conflicts = conflictPaths(merged.stdout, input.guard);
        if (conflicts.length === 0) throw new Error("MERGE_CONFLICT");
        return {
          action: "prepare" as const,
          repository_id: repository.repositoryId,
          task_worktree_id: task.record.taskWorktreeId,
          merge_plan_id: null,
          review_token: null,
          status: "conflicted" as const,
          target_oid: targetOid,
          task_oid: taskOid,
          candidate_oid: null,
          changes: [],
          conflicts: conflicts.map((item) => ({ path: item })),
          path_scan_complete: true as const,
          secret_scan_complete: true as const,
          history_scan_complete: true as const,
          checks_complete: false,
          integration_workspace_id: null,
          execution_isolation: "none" as const,
          repository_integrations: integrationReview ? "approved_full_access" as const : "disabled" as const,
          expires_at: null
        };
      }
      const treeOid = merged.stdout.toString("ascii").split("\0")[0].trim();
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(treeOid)) {
        throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
      }
      const identity = await localIdentity(this.options.manager, repository);
      const commit = await runGitRequired(executor, repository, [
        "commit-tree", treeOid, "-p", targetOid, "-p", taskOid
      ], {
        objectDirectoryPath: quarantineRoot,
        stdin: Buffer.from(`${message}\n`, "utf8"),
        identity: {
          authorName: identity.name,
          authorEmail: identity.email,
          committerName: identity.name,
          committerEmail: identity.email,
          systemAuthorDate: systemDate,
          systemCommitterDate: systemDate
        },
        stdoutLimitBytes: 256
      });
      const candidateOid = commit.stdout.toString("ascii").trim();
      const scanned = await this.#scanCandidate(
        repository,
        input.guard,
        targetOid,
        candidateOid,
        quarantineRoot
      );
      const scanDigest = sha256Git(JSON.stringify(scanned));
      if (!finalize) {
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
        const reviewToken = this.options.reviews.mint<DivergentMergeReviewV4>(
          "task_merge_finalize",
          {
            repositoryId: repository.repositoryId,
            taskWorktreeId: task.record.taskWorktreeId,
            ownerFingerprint,
            targetRef: task.privateState.targetRef,
            taskRef: task.privateState.branchRef,
            targetOid,
            taskOid,
            candidateOid,
            message,
            systemDate,
            scanDigest,
            expiresAt
          }
        );
        return this.#result({
          action: "prepare",
          repositoryId: repository.repositoryId,
          taskWorktreeId: task.record.taskWorktreeId,
          planId: null,
          reviewToken,
          status: "approval_required",
          targetOid,
          taskOid,
          candidateOid,
          changes: scanned.changes,
          expiresAt,
          repositoryIntegrations: integrationReview ? "approved_full_access" : "disabled"
        });
      }
      const review = finalize.review;
      if (
        review.repositoryId !== repository.repositoryId ||
        review.taskWorktreeId !== task.record.taskWorktreeId ||
        review.ownerFingerprint !== ownerFingerprint ||
        review.targetRef !== task.privateState.targetRef ||
        review.taskRef !== task.privateState.branchRef ||
        review.targetOid !== targetOid ||
        review.taskOid !== taskOid ||
        review.candidateOid !== candidateOid ||
        review.scanDigest !== scanDigest ||
        Date.parse(review.expiresAt) < Date.now()
      ) throw new Error("GIT_STATE_CHANGED");

      const objects = await looseObjectIds(
        quarantineRoot,
        repository.objectFormat === "sha1" ? 40 : 64
      );
      const candidateRef = `refs/codexpro/candidates/${input.taskWorktreeId.slice(5)}-${sha256Git(finalize.reviewToken).slice(0, 16)}`;
      await this.options.manager.options.journal.run({
        authorization: finalize.authorization,
        repository,
        toolName: "merge_task_worktree",
        canonicalAction: "task_merge_prepare_finalize",
        workspaceId: input.workspace.id,
        participants: ["object_quarantine", "ref_cas", "task_registry"],
        counts: {
          affectedObjectCount: objects.length,
          affectedPathCount: scanned.changes.length,
          affectedRefCount: 1
        },
        privateState: {
          taskWorktreeId: task.record.taskWorktreeId,
          targetOid,
          taskOid,
          candidateOid,
          candidateRef,
          reviewTokenDigest: sha256Git(finalize.reviewToken),
          scanDigest
        },
        effect: async () => {
          const quarantine = new GitObjectQuarantine({ journal: () => undefined });
          await quarantine.promote({
            repository,
            quarantineRoot,
            objects: objects.map((oid) => ({ oid }))
          });
          const zero = "0".repeat(candidateOid.length);
          const refResult = await executor.run(repository, [
            "update-ref", "--no-deref", candidateRef, candidateOid, zero
          ]);
          if (refResult.status !== 0) throw new Error("GIT_REF_CHANGED");
        }
      });
      const plan = this.options.plans.create({
        taskWorktreeId: task.record.taskWorktreeId,
        repositoryId: repository.repositoryId,
        ownerFingerprint,
        targetRef: task.privateState.targetRef,
        taskRef: task.privateState.branchRef,
        candidateRef,
        targetOid,
        taskOid,
        candidateOid,
        checksComplete: false,
        receiptIds: []
        ,
        affectedPathCount: scanned.changes.length,
        affectedByteCount: scanned.totalBytes,
        scanDigest
      });
      this.options.reviews.consume<DivergentMergeReviewV4>(
        finalize.reviewToken,
        "task_merge_finalize"
      );
      this.options.manager.options.store.update(task.record.taskWorktreeId, {
        state: "merge_prepared",
        headOid: taskOid
      });
      return this.#result({
        action: "finalize",
        repositoryId: repository.repositoryId,
        taskWorktreeId: task.record.taskWorktreeId,
        planId: plan.mergePlanId,
        reviewToken: null,
        status: "checks_required",
        targetOid,
        taskOid,
        candidateOid,
        changes: scanned.changes,
        expiresAt: plan.expiresAt,
        repositoryIntegrations: integrationReview ? "approved_full_access" : "disabled"
      });
    } finally {
      await executor.removePrivateDirectory?.(quarantineRoot).catch(() => {});
    }
  }

  async #scanCandidate(
    repository: GitRepositoryIdentity,
    guard: PathGuard,
    targetOid: string,
    candidateOid: string,
    objectDirectoryPath?: string
  ) {
    const executor = this.options.manager.options.context.options.executor;
    const manifest = await buildTaskTreeManifest({
      executor,
      repository,
      treeish: candidateOid,
      guard,
      maxFiles: this.options.manager.options.maxFiles,
      maxBytes: this.options.manager.options.maxBytes,
      objectDirectoryPath
    }).catch(() => {
      throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
    });
    for (const entry of manifest.entries) {
      if (entry.kind !== "blob") continue;
      const content = await runGitRequired(executor, repository, ["cat-file", "blob", entry.oid], {
        objectDirectoryPath,
        stdoutLimitBytes: entry.size + 1
      });
      if (hasSecretValue(content.stdout.toString("latin1"))) throw new Error("GIT_SECRET_BLOCKED");
    }
    const history = await runGitRequired(executor, repository, [
      "rev-list", "--max-count=4097", `${targetOid}..${candidateOid}`
    ], { objectDirectoryPath, stdoutLimitBytes: 512 * 1024 });
    const historyOids = history.stdout.toString("ascii").trim().split(/\r?\n/u).filter(Boolean);
    if (historyOids.length > 4096) throw new Error("GIT_SCAN_LIMIT");
    for (const oid of historyOids) {
      const commit = await runGitRequired(executor, repository, ["cat-file", "commit", oid], {
        objectDirectoryPath,
        stdoutLimitBytes: 1024 * 1024
      });
      if (hasSecretValue(commit.stdout.toString("utf8"))) throw new Error("GIT_SECRET_BLOCKED");
    }
    const raw = await runGitRequired(executor, repository, [
      "diff",
      "--raw",
      `--abbrev=${repository.objectFormat === "sha1" ? 40 : 64}`,
      "-z",
      "--no-renames",
      targetOid,
      candidateOid
    ], { objectDirectoryPath, stdoutLimitBytes: 4 * 1024 * 1024 });
    const changes = parseGitRawDiffZ(raw.stdout, repository.objectFormat).map((change) => ({
      path: change.path,
      change: change.change,
      old_path: change.oldPath,
      binary: false,
      additions: null,
      deletions: null
    }));
    return {
      treeOid: manifest.treeOid,
      totalBytes: manifest.totalBytes,
      historyOids,
      changes
    };
  }

  #result(input: {
    action: "prepare" | "finalize";
    repositoryId: string;
    taskWorktreeId: string;
    planId: string | null;
    reviewToken: string | null;
    status: "fast_forward" | "clean_merge" | "approval_required" | "checks_required";
    targetOid: string;
    taskOid: string;
    candidateOid: string;
    changes: Array<{
      path: string;
      change: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "unmerged" | "unknown";
      old_path: string | null;
      binary: boolean;
      additions: null;
      deletions: null;
    }>;
    expiresAt: string;
    repositoryIntegrations?: "disabled" | "approved_full_access";
  }) {
    return {
      action: input.action,
      repository_id: input.repositoryId,
      task_worktree_id: input.taskWorktreeId,
      merge_plan_id: input.planId,
      review_token: input.reviewToken,
      status: input.status,
      target_oid: input.targetOid,
      task_oid: input.taskOid,
      candidate_oid: input.candidateOid,
      changes: input.changes,
      conflicts: [],
      path_scan_complete: true as const,
      secret_scan_complete: true as const,
      history_scan_complete: true as const,
      checks_complete: false,
      integration_workspace_id: null,
      execution_isolation: "none" as const,
      repository_integrations: input.repositoryIntegrations ?? "disabled",
      expires_at: input.expiresAt
    };
  }
}

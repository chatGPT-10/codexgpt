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
import type { CandidateVerificationWorkspaceV4 } from "./candidateWorkspace.js";

interface DivergentMergeReviewV4 {
  repositoryId: string;
  taskWorktreeId: string;
  ownerFingerprint: string;
  targetRef: string;
  taskRef: string;
  targetOid: string;
  taskOid: string;
  candidateOid: string;
  candidateTreeOid: string;
  message: string;
  systemDate: string;
  scanDigest: string;
  artifactId: string;
  objectIdsDigest: string;
  repositoryIntegrations: "disabled" | "approved_full_access";
  integrationIdentitiesDigest: string | null;
  integrationConfigDigest: string | null;
  integrationSemanticStateDigest: string | null;
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

async function reachableCandidateObjectIds(input: {
  executor: TaskWorktreeManagerV4["options"]["context"]["options"]["executor"];
  repository: GitRepositoryIdentity;
  quarantineRoot: string;
  candidateOid: string;
  targetOid: string;
  taskOid: string;
}): Promise<string[]> {
  const width = input.repository.objectFormat === "sha1" ? 40 : 64;
  const listed = await runGitRequired(input.executor, input.repository, [
    "rev-list",
    "--objects",
    "--no-object-names",
    input.candidateOid,
    `^${input.targetOid}`,
    `^${input.taskOid}`,
    "--"
  ], {
    objectDirectoryPath: input.quarantineRoot,
    stdoutLimitBytes: 32 * 1024
  });
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(listed.stdout);
  } catch {
    throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
  }
  const pattern = new RegExp(`^[a-f0-9]{${width}}$`, "u");
  const objects = text.split(/\r?\n/u).filter(Boolean);
  if (
    objects.length < 1 ||
    objects.length > 256 ||
    objects.some((oid) => !pattern.test(oid)) ||
    new Set(objects).size !== objects.length ||
    !objects.includes(input.candidateOid)
  ) throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
  return objects.sort();
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
    candidateWorkspaces: CandidateVerificationWorkspaceV4;
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
    await this.options.candidateWorkspaces.cleanupExpiredReviewedCandidates();
    let review: DivergentMergeReviewV4;
    try {
      review = this.options.reviews.inspect<DivergentMergeReviewV4>(
        input.reviewToken,
        "task_merge_finalize"
      );
    } catch (error) {
      await this.options.candidateWorkspaces.cleanupReviewedCandidateForToken(input.reviewToken);
      throw error;
    }
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
    const reservation = this.options.plans.reserveTask(input.taskWorktreeId);
    try {
      return await this.#prepareReserved(input, finalize);
    } finally {
      reservation.release();
    }
  }

  async #prepareReserved(
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
    let task = await this.options.manager.revalidate(input.taskWorktreeId, ownerFingerprint);
    if (task.record.state !== "ready") throw new Error("MERGE_PLAN_INVALID");
    const repository = await this.options.manager.primaryRepository(input.workspace);
    if (repository.repositoryId !== task.record.repositoryId) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const executor = this.options.manager.options.context.options.executor;
    if (finalize && input.integrationReviewToken) throw new Error("GIT_INTEGRATION_REQUIRED");
    const integrationReview = !finalize && input.integrationReviewToken
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
      task = await this.options.manager.revalidate(input.taskWorktreeId, ownerFingerprint);
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
      const mergePlanId = this.options.plans.allocateId();
      const integrationWorkspaceId = this.options.candidateWorkspaces.allocateId();
      const plan = this.options.plans.create({
        mergePlanId,
        lifecycleState: "preparing",
        taskWorktreeId: task.record.taskWorktreeId,
        taskGeneration: task.record.generation + 1,
        repositoryId: repository.repositoryId,
        repositoryIdentityFingerprint: repository.stableIdentityFingerprint,
        capabilityRevision: repository.capabilityRevision,
        contextFingerprint: sha256Git(this.options.manager.options.context.options.contextFingerprint),
        policyRevision: input.authorization?.policyRevision ?? null,
        ownerFingerprint,
        primaryWorkspaceRoot: input.workspace.root,
        targetRef: task.privateState.targetRef,
        taskRef: task.privateState.branchRef,
        candidateRef: null,
        targetOid,
        taskOid,
        candidateOid: taskOid,
        candidateTreeOid: scanned.treeOid,
        manifestDigest: scanned.manifestDigest,
        diffDigest: scanned.diffDigest,
        historyDigest: scanned.historyDigest,
        checksComplete: false,
        receiptIds: [],
        integrationWorkspaceId,
        requiredCheckCategories: [...this.options.candidateWorkspaces.requiredCategories],
        affectedPathCount: scanned.changes.length,
        affectedByteCount: scanned.totalBytes,
        scanDigest: sha256Git(JSON.stringify(scanned)),
        repositoryIntegrations: integrationReview ? "approved_full_access" : "disabled",
        integrationIdentitiesDigest: integrationReview?.identitiesDigest ?? null,
        integrationConfigDigest: integrationReview?.configDigest ?? null,
        integrationSemanticStateDigest: integrationReview?.semanticStateDigest ?? null
      });
      try {
        const updatedTask = this.options.manager.options.store.update(task.record.taskWorktreeId, {
          state: "merge_prepared",
          headOid: taskOid
        });
        if (updatedTask.generation !== plan.taskGeneration) throw new Error("GIT_RECOVERY_REQUIRED");
        await this.options.candidateWorkspaces.create({
          workspace: input.workspace,
          repository,
          taskWorktreeId: task.record.taskWorktreeId,
          taskGeneration: updatedTask.generation,
          mergePlanId,
          candidateOid: taskOid,
          manifest: scanned.manifest,
          expiresAt: plan.expiresAt,
          aliasTaskRoot: task.privateState.worktreePath,
          integrationWorkspaceId
        });
        const preparedPlan = this.options.plans.transition(
          plan.mergePlanId,
          ownerFingerprint,
          "preparing",
          "prepared"
        );
        return this.#result({
          action: "prepare",
          repositoryId: repository.repositoryId,
          taskWorktreeId: task.record.taskWorktreeId,
          planId: preparedPlan.mergePlanId,
          reviewToken: null,
          status: "checks_required",
          targetOid,
          taskOid,
          candidateOid: taskOid,
          changes: scanned.changes,
          expiresAt: preparedPlan.expiresAt,
          repositoryIntegrations: preparedPlan.repositoryIntegrations,
          integrationWorkspaceId,
          requiredCheckCategories: preparedPlan.requiredCheckCategories
        });
      } catch (error) {
        try {
          await this.options.candidateWorkspaces.cleanup(integrationWorkspaceId);
          const current = this.options.manager.options.store.read(task.record.taskWorktreeId);
          if (current.record.state === "merge_prepared" && current.record.headOid === taskOid) {
            this.options.manager.options.store.update(task.record.taskWorktreeId, {
              state: "ready",
              headOid: taskOid
            });
          } else if (current.record.state !== "ready") {
            throw new Error("GIT_RECOVERY_REQUIRED");
          }
          this.options.plans.consumeForRecovery(plan.mergePlanId, ownerFingerprint);
        } catch {
          try {
            this.options.plans.transition(
              plan.mergePlanId,
              ownerFingerprint,
              "preparing",
              "recovery_required"
            );
          } catch { }
          try {
            this.options.manager.options.store.update(task.record.taskWorktreeId, {
              state: "recovery_required",
              headOid: taskOid
            });
          } catch { }
          throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
        }
        throw error;
      }
    }

    const message = finalize?.review.message ?? input.message ?? "Merge CodexPro task worktree";
    if (!message.trim() || hasSecretValue(message) || Buffer.byteLength(message, "utf8") > 16 * 1024) {
      throw new Error("GIT_SECRET_BLOCKED");
    }
    const systemDate = finalize?.review.systemDate ?? new Date().toISOString();
    const ephemeralQuarantineRoot = finalize
      ? null
      : await executor.createPrivateDirectory?.("git-merge") ?? null;
    if (!finalize && !ephemeralQuarantineRoot) throw new Error("GIT_MERGE_CAPABILITY_UNAVAILABLE");
    let quarantineRoot = ephemeralQuarantineRoot ?? "";
    try {
      let candidateOid: string;
      let scanned;
      let scanDigest: string;
      let objects: string[];
      if (finalize) {
        const review = finalize.review;
        if (
          review.repositoryId !== repository.repositoryId ||
          review.taskWorktreeId !== task.record.taskWorktreeId ||
          review.ownerFingerprint !== ownerFingerprint ||
          review.targetRef !== task.privateState.targetRef ||
          review.taskRef !== task.privateState.branchRef ||
          review.targetOid !== targetOid ||
          review.taskOid !== taskOid ||
          Date.parse(review.expiresAt) < Date.now()
        ) throw new Error("GIT_STATE_CHANGED");
        const artifact = await this.options.candidateWorkspaces.openReviewedCandidate({
          artifactId: review.artifactId,
          reviewToken: finalize.reviewToken,
          repository,
          taskWorktreeId: task.record.taskWorktreeId,
          targetOid,
          taskOid,
          candidateOid: review.candidateOid,
          candidateTreeOid: review.candidateTreeOid,
          scanDigest: review.scanDigest,
          objectIdsDigest: review.objectIdsDigest
        });
        quarantineRoot = artifact.objectDirectoryPath;
        candidateOid = review.candidateOid;
        scanned = await this.#scanCandidate(
          repository,
          input.guard,
          targetOid,
          candidateOid,
          quarantineRoot
        );
        scanDigest = sha256Git(JSON.stringify(scanned));
        if (
          scanned.treeOid !== review.candidateTreeOid ||
          scanDigest !== review.scanDigest
        ) throw new Error("GIT_STATE_CHANGED");
        objects = artifact.objectIds;
      } else {
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
              expectedCanonicalAction: "task_merge_prepare_review",
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
            required_check_categories: [],
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
        candidateOid = commit.stdout.toString("ascii").trim();
        scanned = await this.#scanCandidate(
          repository,
          input.guard,
          targetOid,
          candidateOid,
          quarantineRoot
        );
        scanDigest = sha256Git(JSON.stringify(scanned));
        objects = await reachableCandidateObjectIds({
          executor,
          repository,
          quarantineRoot,
          candidateOid,
          targetOid,
          taskOid
        });
        const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
        const retained = await this.options.candidateWorkspaces.retainReviewedCandidate({
          repository,
          taskWorktreeId: task.record.taskWorktreeId,
          targetOid,
          taskOid,
          candidateOid,
          candidateTreeOid: scanned.treeOid,
          scanDigest,
          objectIds: objects,
          quarantineRoot,
          expiresAt
        });
        let reviewToken: string | null = null;
        try {
          reviewToken = this.options.reviews.mint<DivergentMergeReviewV4>(
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
              candidateTreeOid: scanned.treeOid,
              message,
              systemDate,
              scanDigest,
              artifactId: retained.artifactId,
              objectIdsDigest: retained.objectIdsDigest,
              repositoryIntegrations: integrationReview ? "approved_full_access" : "disabled",
              integrationIdentitiesDigest: integrationReview?.identitiesDigest ?? null,
              integrationConfigDigest: integrationReview?.configDigest ?? null,
              integrationSemanticStateDigest: integrationReview?.semanticStateDigest ?? null,
              expiresAt
            }
          );
          this.options.candidateWorkspaces.bindReviewedCandidate(retained.artifactId, reviewToken);
        } catch (error) {
          if (reviewToken) this.options.reviews.revoke(reviewToken);
          await this.options.candidateWorkspaces.cleanupReviewedCandidate(retained.artifactId);
          throw error;
        }
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
      const candidateRef = `refs/codexpro/candidates/${input.taskWorktreeId.slice(5)}-${sha256Git(finalize.reviewToken).slice(0, 16)}`;
      const plan = this.options.plans.create({
        mergePlanId: this.options.plans.allocateId(),
        lifecycleState: "preparing",
        taskWorktreeId: task.record.taskWorktreeId,
        taskGeneration: task.record.generation + 1,
        repositoryId: repository.repositoryId,
        repositoryIdentityFingerprint: repository.stableIdentityFingerprint,
        capabilityRevision: repository.capabilityRevision,
        contextFingerprint: sha256Git(this.options.manager.options.context.options.contextFingerprint),
        policyRevision: input.authorization?.policyRevision ?? null,
        ownerFingerprint,
        primaryWorkspaceRoot: input.workspace.root,
        targetRef: task.privateState.targetRef,
        taskRef: task.privateState.branchRef,
        candidateRef,
        targetOid,
        taskOid,
        candidateOid,
        candidateTreeOid: scanned.treeOid,
        manifestDigest: scanned.manifestDigest,
        diffDigest: scanned.diffDigest,
        historyDigest: scanned.historyDigest,
        checksComplete: false,
        receiptIds: [],
        integrationWorkspaceId: this.options.candidateWorkspaces.allocateId(),
        requiredCheckCategories: [...this.options.candidateWorkspaces.requiredCategories],
        affectedPathCount: scanned.changes.length,
        affectedByteCount: scanned.totalBytes,
        scanDigest,
        repositoryIntegrations: review.repositoryIntegrations,
        integrationIdentitiesDigest: review.integrationIdentitiesDigest,
        integrationConfigDigest: review.integrationConfigDigest,
        integrationSemanticStateDigest: review.integrationSemanticStateDigest
      });
      try {
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
            mergePlanId: plan.mergePlanId,
            taskWorktreeId: task.record.taskWorktreeId,
            targetOid,
            taskOid,
            candidateOid,
            candidateRef,
            integrationWorkspaceId: plan.integrationWorkspaceId,
            reviewTokenDigest: sha256Git(finalize.reviewToken),
            scanDigest,
            reviewedArtifactDigest: sha256Git(review.artifactId)
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
        const updatedTask = this.options.manager.options.store.update(task.record.taskWorktreeId, {
          state: "merge_prepared",
          headOid: taskOid
        });
        if (updatedTask.generation !== plan.taskGeneration) throw new Error("GIT_RECOVERY_REQUIRED");
        await this.options.candidateWorkspaces.create({
          workspace: input.workspace,
          repository,
          taskWorktreeId: task.record.taskWorktreeId,
          taskGeneration: updatedTask.generation,
          mergePlanId: plan.mergePlanId,
          candidateOid,
          manifest: scanned.manifest,
          expiresAt: plan.expiresAt,
          integrationWorkspaceId: plan.integrationWorkspaceId
        });
        const preparedPlan = this.options.plans.transition(
          plan.mergePlanId,
          ownerFingerprint,
          "preparing",
          "prepared"
        );
        await this.options.candidateWorkspaces.cleanupReviewedCandidate(review.artifactId);
        this.options.reviews.consume<DivergentMergeReviewV4>(
          finalize.reviewToken,
          "task_merge_finalize"
        );
        return this.#result({
          action: "finalize",
          repositoryId: repository.repositoryId,
          taskWorktreeId: task.record.taskWorktreeId,
          planId: preparedPlan.mergePlanId,
          reviewToken: null,
          status: "checks_required",
          targetOid,
          taskOid,
          candidateOid,
          changes: scanned.changes,
          expiresAt: preparedPlan.expiresAt,
          repositoryIntegrations: preparedPlan.repositoryIntegrations,
          integrationWorkspaceId: preparedPlan.integrationWorkspaceId,
          requiredCheckCategories: preparedPlan.requiredCheckCategories
        });
      } catch (error) {
        try {
          await this.options.candidateWorkspaces.cleanup(plan.integrationWorkspaceId);
          await this.#deleteCandidateRef(repository, candidateRef, candidateOid);
          const current = this.options.manager.options.store.read(task.record.taskWorktreeId);
          if (current.record.state === "merge_prepared" && current.record.headOid === taskOid) {
            this.options.manager.options.store.update(task.record.taskWorktreeId, {
              state: "ready",
              headOid: taskOid
            });
          } else if (current.record.state !== "ready") {
            throw new Error("GIT_RECOVERY_REQUIRED");
          }
          this.options.plans.consumeForRecovery(plan.mergePlanId, ownerFingerprint);
        } catch {
          try {
            this.options.plans.transition(
              plan.mergePlanId,
              ownerFingerprint,
              "preparing",
              "recovery_required"
            );
          } catch { }
          try {
            this.options.manager.options.store.update(task.record.taskWorktreeId, {
              state: "recovery_required",
              headOid: taskOid
            });
          } catch { }
          throw new Error("GIT_RECOVERY_REQUIRED", { cause: error });
        }
        throw error;
      }
    } finally {
      if (ephemeralQuarantineRoot) {
        await executor.removePrivateDirectory?.(ephemeralQuarantineRoot).catch(() => {});
      }
    }
  }

  async #deleteCandidateRef(
    repository: GitRepositoryIdentity,
    candidateRef: string,
    candidateOid: string
  ): Promise<void> {
    const executor = this.options.manager.options.context.options.executor;
    const deleted = await executor.run(repository, [
      "update-ref", "--no-deref", "-d", candidateRef, candidateOid
    ]);
    if (deleted.status === 0) return;
    const probe = await executor.run(repository, [
      "show-ref", "--verify", "--quiet", candidateRef
    ]);
    if (probe.status === 1 && !probe.timedOut && !probe.stdoutTruncated && !probe.stderrTruncated) return;
    throw new Error("GIT_RECOVERY_REQUIRED");
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
      "rev-list", "--max-count=4097", `${targetOid}..${candidateOid}`, "--"
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
      candidateOid,
      "--"
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
      manifest,
      manifestDigest: sha256Git(JSON.stringify({
        treeOid: manifest.treeOid,
        totalBytes: manifest.totalBytes,
        entries: manifest.entries
      })),
      treeOid: manifest.treeOid,
      totalBytes: manifest.totalBytes,
      historyOids,
      historyDigest: sha256Git(JSON.stringify(historyOids)),
      changes,
      diffDigest: sha256Git(JSON.stringify(changes))
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
    integrationWorkspaceId?: string | null;
    requiredCheckCategories?: string[];
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
      integration_workspace_id: input.integrationWorkspaceId ?? null,
      required_check_categories: input.requiredCheckCategories ?? [],
      execution_isolation: "none" as const,
      repository_integrations: input.repositoryIntegrations ?? "disabled",
      expires_at: input.expiresAt
    };
  }
}

import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { TaskWorktreeWorkspaceAuthorityV4 } from "./workspaceAuthority.js";
import type { TaskWorktreeRecordV1 } from "./store.js";
import type { TaskWorktreeMergePrepareV4 } from "./mergePrepare.js";
import type { TaskWorktreeMergeExecuteV4 } from "./mergeExecute.js";
import type { TaskWorktreeRemoveV4 } from "./remove.js";
import { createGitResourceV4, gitV4PolicyDefinition } from "../git/resources.js";
import { semanticDigestV4 } from "../policy/authorizationFacts.js";
import { sha256Git } from "../git/mutationContext.js";
import type { ResourceResolutionResult } from "../policy/integration.js";
import type { GitIntegrationGateV4 } from "../git/integrations.js";
import type { PolicyScopeV4 } from "../policy/types.js";

function summary(record: TaskWorktreeRecordV1) {
  return {
    task_worktree_id: record.taskWorktreeId,
    branch_id: record.branchId,
    target_branch_id: record.targetBranchId,
    base_oid: record.baseOid,
    head_oid: record.headOid,
    state: record.state,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

export class TaskWorktreeServiceV4 {
  readonly gateRBound = true as const;

  constructor(readonly options: {
    manager: TaskWorktreeManagerV4;
    authority: TaskWorktreeWorkspaceAuthorityV4;
    ownerFingerprint: () => string;
    mergePrepare?: TaskWorktreeMergePrepareV4;
    mergeExecute?: TaskWorktreeMergeExecuteV4;
    remove?: TaskWorktreeRemoveV4;
    integrationGate?: GitIntegrationGateV4;
  }) {}

  async create(input:
    | {
        action: "prepare";
        workspace: Workspace;
        guard: PathGuard;
        stateToken: string;
        taskName: string;
        branchName?: string;
      }
    | {
        action: "execute";
        workspace: Workspace;
        guard: PathGuard;
        reviewToken: string;
        authorization?: AuthorizationAuditEventV4 | null;
      }
  ) {
    if (input.action === "prepare") {
      return this.options.manager.prepareCreate({
        ...input,
        ownerFingerprint: this.options.ownerFingerprint()
      });
    }
    const created = await this.options.manager.executeCreate({
      ...input,
      ownerFingerprint: this.options.ownerFingerprint(),
      authorization: input.authorization
    });
    const workspace = await this.options.authority.issue(created.record.taskWorktreeId);
    return {
      action: "execute" as const,
      repository_id: created.record.repositoryId,
      task: summary(created.record),
      workspace_id: workspace.id,
      materialization: "raw_git_blobs" as const,
      external_filters_hydrated: false as const,
      submodules_initialized: false as const,
      affected_entry_count: created.manifest.entries.length
    };
  }

  async list(input: { workspace: Workspace }) {
    const repository = await this.options.manager.primaryRepository(input.workspace);
    const records = this.options.manager.options.store
      .list(this.options.ownerFingerprint(), repository.repositoryId)
      .filter((record) => record.state !== "removed")
      .slice(0, 32);
    return {
      repository_id: repository.repositoryId,
      tasks: records.map(summary),
      truncated: records.length >= 32
    };
  }

  async get(input: { taskWorktreeId: string }) {
    const item = await this.options.manager.revalidate(
      input.taskWorktreeId,
      this.options.ownerFingerprint()
    );
    const workspace = await this.options.authority.issue(input.taskWorktreeId);
    return {
      repository_id: item.record.repositoryId,
      task: summary(item.record),
      workspace_id: workspace.id,
      access_class: "task_worktree" as const
    };
  }

  merge(input:
    | {
        action: "prepare";
        workspace: Workspace;
        guard: PathGuard;
        taskWorktreeId: string;
        message?: string;
        integrationReviewToken?: string;
        authorization?: AuthorizationAuditEventV4 | null;
      }
    | {
        action: "finalize";
        workspace: Workspace;
        guard: PathGuard;
        taskWorktreeId: string;
        reviewToken: string;
        integrationReviewToken?: string;
        authorization?: AuthorizationAuditEventV4 | null;
      }
    | {
        action: "execute";
        workspace: Workspace;
        guard: PathGuard;
        taskWorktreeId: string;
        mergePlanId: string;
        verificationReceipts?: readonly string[];
        skipChecks?: boolean;
        integrationReviewToken?: string;
        authorization?: AuthorizationAuditEventV4 | null;
      }
  ) {
    if (
      this.options.integrationGate?.enabled &&
      !input.integrationReviewToken &&
      input.action !== "finalize"
    ) {
      throw new Error("GIT_INTEGRATION_REQUIRED");
    }
    if (input.integrationReviewToken) {
      const args: Record<string, unknown> = {
        action: input.action,
        workspace_id: input.workspace.id,
        task_worktree_id: input.taskWorktreeId,
        integration_review_token: input.integrationReviewToken
      };
      if (input.action === "prepare") args.message = input.message;
      else if (input.action === "finalize") args.review_token = input.reviewToken;
      else {
        args.merge_plan_id = input.mergePlanId;
        args.verification_receipts = input.verificationReceipts ?? [];
        args.skip_checks = input.skipChecks === true;
      }
      const described = this.describe("merge_task_worktree", args);
      if (input.authorization?.resourceFingerprint !== described.resource.resourceFingerprint) {
        throw new Error("GIT_INTEGRATION_REQUIRED");
      }
    }
    if (input.action === "prepare") {
      if (!this.options.mergePrepare) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
      return this.options.mergePrepare.prepare(input);
    }
    if (input.action === "finalize") {
      if (!this.options.mergePrepare) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
      return this.options.mergePrepare.finalize(input);
    }
    if (!this.options.mergeExecute) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    return this.options.mergeExecute.execute(input);
  }

  remove(input:
    | { action: "prepare"; workspace: Workspace; taskWorktreeId: string }
    | {
        action: "execute";
        workspace: Workspace;
        taskWorktreeId: string;
        reviewToken: string;
        authorization?: AuthorizationAuditEventV4 | null;
      }
  ) {
    if (!this.options.remove) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    return input.action === "prepare"
      ? this.options.remove.prepare(input)
      : this.options.remove.execute(input);
  }

  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult {
    const owner = this.options.ownerFingerprint();
    let operation:
      | "task_create_review" | "task_create" | "task_list" | "task_get"
      | "task_merge_prepare_review" | "task_merge_prepare_finalize"
      | "task_merge_execute" | "task_remove";
    let repositoryId: string;
    let worktreeId: string | null = null;
    let stateTokenFingerprint: string | null = null;
    let pathDigests: string[] = [];
    let refDigests: string[] = [];
    let objectIds: string[] = [];
    let affectedPathCount = 0;
    let affectedByteCount = 0;
    let integrationMode: "off" | "approved_full_access" = "off";
    let approvalRevealArguments: string[] | undefined;
    if (toolName === "create_task_worktree") {
      if (args.action === "prepare") {
        operation = "task_create_review";
        const facts = this.options.manager.options.context.options.stateTokens.inspect(String(args.state_token));
        repositoryId = facts.repositoryId;
        stateTokenFingerprint = sha256Git(String(args.state_token));
      } else {
        operation = "task_create";
        const review = this.options.manager.options.reviews.inspect<Record<string, unknown>>(
          String(args.review_token),
          "task_create"
        );
        repositoryId = String(review.repositoryId);
        worktreeId = String(review.taskWorktreeId);
        stateTokenFingerprint = sha256Git(String(args.review_token));
      }
    } else if (toolName === "list_task_worktrees") {
      operation = "task_list";
      repositoryId = `repo_${sha256Git(String(args.workspace_id)).slice(0, 32)}`;
    } else {
      const taskId = String(args.task_worktree_id);
      const item = this.options.manager.options.store.read(taskId);
      if (item.privateState.ownerFingerprint !== owner) throw new Error("TASK_WORKTREE_NOT_FOUND");
      repositoryId = item.record.repositoryId;
      worktreeId = item.record.taskWorktreeId;
      if (toolName === "get_task_worktree") operation = "task_get";
      else if (toolName === "merge_task_worktree") {
        operation = args.action === "execute"
          ? "task_merge_execute"
          : args.action === "finalize"
            ? "task_merge_prepare_finalize"
            : "task_merge_prepare_review";
        stateTokenFingerprint = args.action === "execute"
          ? sha256Git(JSON.stringify({
              mergePlanId: String(args.merge_plan_id),
              verificationReceipts: args.verification_receipts ?? [],
              skipChecks: args.skip_checks === true
            }))
          : args.action === "finalize"
            ? sha256Git(String(args.review_token))
            : null;
        if (args.action === "execute" && this.options.mergeExecute) {
          const plan = this.options.mergeExecute.describePlan(String(args.merge_plan_id), owner);
          refDigests = [sha256Git(plan.targetRef), sha256Git(plan.taskRef)];
          objectIds = [...new Set([plan.targetOid, plan.taskOid, plan.candidateOid])];
          pathDigests = [plan.scanDigest];
          affectedPathCount = plan.affectedPathCount;
          affectedByteCount = plan.affectedByteCount;
        }
        if (typeof args.integration_review_token === "string") {
          const gate = this.options.integrationGate;
          if (!gate?.enabled) throw new Error("GIT_INTEGRATION_REQUIRED");
          const review = gate.inspect(args.integration_review_token);
          if (
            review.repositoryId !== repositoryId ||
            review.workspaceId !== String(args.workspace_id)
          ) throw new Error("GIT_STATE_TOKEN_INVALID");
          integrationMode = "approved_full_access";
          approvalRevealArguments = gate.approvalPreview(args.integration_review_token);
          refDigests = [
            ...refDigests,
            review.identitiesDigest,
            sha256Git(args.integration_review_token)
          ].sort();
          stateTokenFingerprint = sha256Git(JSON.stringify({
            previous: stateTokenFingerprint,
            integrationReviewToken: args.integration_review_token
          }));
        }
      } else if (toolName === "remove_task_worktree") {
        operation = "task_remove";
        stateTokenFingerprint = args.action === "execute"
          ? sha256Git(String(args.review_token))
          : null;
      } else throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    }
    const resource = createGitResourceV4({
      operation,
      repositoryId,
      worktreeId,
      branchId: null,
      pathDigests,
      refDigests,
      objectIds,
      affectedPathCount,
      affectedByteCount,
      stateTokenFingerprint,
      integrationMode,
      executionIsolation: "none"
    });
    const policy = gitV4PolicyDefinition(toolName, operation);
    const requiredScopes: PolicyScopeV4[] = [...policy.requiredScopes];
    if (integrationMode === "approved_full_access") {
      for (const scope of ["shell:execute", "host:full-access"] as const) {
        if (!requiredScopes.includes(scope)) requiredScopes.push(scope);
      }
    }
    return {
      resource,
      requiredCapabilities: [
        { name: "filesystemWriteBoundary", minimum: "brokered" },
        { name: "processTreeControl", minimum: "job_object" }
      ],
      requiredScopes,
      semanticFactsDigest: semanticDigestV4(resource),
      riskClass: integrationMode === "approved_full_access" ? "R3" : policy.riskClass,
      approvalRevealArguments
    };
  }
}

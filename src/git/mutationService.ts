import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import { semanticDigestV4 } from "../policy/authorizationFacts.js";
import type { ResourceResolutionResult } from "../policy/integration.js";
import { createGitResourceV4, gitV4PolicyDefinition } from "./resources.js";
import { sha256Git } from "./mutationContext.js";
import type { GitBranchServiceV4 } from "./branchService.js";
import type { GitIndexServiceV4 } from "./indexService.js";
import type { GitCommitServiceV4 } from "./commitService.js";
import type { GitRestoreServiceV4 } from "./restoreService.js";
import type { GitStashServiceV4 } from "./stashService.js";
import type { GitMutationJournalV4 } from "./mutationJournal.js";
import type { GitIntegrationGateV4 } from "./integrations.js";
import type { PolicyScopeV4 } from "../policy/types.js";
import path from "node:path";
import { gitIndexIdentityV4 } from "./privateIndex.js";

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

export class GitMutationServiceV4 {
  constructor(readonly services: {
    branch: GitBranchServiceV4;
    index: GitIndexServiceV4;
    commit: GitCommitServiceV4;
    restore?: GitRestoreServiceV4;
    stash?: GitStashServiceV4;
    journal?: GitMutationJournalV4;
    integrationGate?: GitIntegrationGateV4;
  }) {}

  get gateRBound(): boolean {
    return this.services.journal?.gateRBound === true;
  }

  async createBranch(input: Parameters<GitBranchServiceV4["create"]>[0] & {
    authorization?: AuthorizationAuditEventV4 | null;
  }) {
    return this.#runMutation(input, {
      toolName: "git_create_branch",
      canonicalAction: "create_branch",
      participants: ["ref_cas"],
      counts: { affectedRefCount: 1 }
    }, () => this.services.branch.create(input));
  }

  async stage(input: Parameters<GitIndexServiceV4["stage"]>[0] & {
    authorization?: AuthorizationAuditEventV4 | null;
    integrationReviewToken?: string;
  }) {
    if (this.services.integrationGate?.enabled && !input.integrationReviewToken) {
      throw new Error("GIT_INTEGRATION_REQUIRED");
    }
    if (input.integrationReviewToken) {
      const described = this.describe("git_stage", {
        state_token: input.stateToken,
        paths: [...input.paths],
        integration_review_token: input.integrationReviewToken
      });
      if (input.authorization?.resourceFingerprint !== described.resource.resourceFingerprint) {
        throw new Error("GIT_INTEGRATION_REQUIRED");
      }
    }
    const operation = {
      toolName: "git_stage",
      canonicalAction: "stage",
      participants: ["object_quarantine", "private_index"] as Array<"object_quarantine" | "private_index">,
      counts: { affectedPathCount: input.paths.length }
    };
    if (input.integrationReviewToken) {
      return this.#runMutation(input, operation, () => this.services.index.stageApproved({
        ...input,
        integrationReviewToken: input.integrationReviewToken!
      }));
    }
    return this.#runMutation(input, operation, () => this.services.index.stage(input));
  }

  async commit(input: Parameters<GitCommitServiceV4["commit"]>[0] & {
    authorization?: AuthorizationAuditEventV4 | null;
    integrationReviewToken?: string;
  }) {
    if (this.services.integrationGate?.enabled && !input.integrationReviewToken) {
      throw new Error("GIT_INTEGRATION_REQUIRED");
    }
    if (input.integrationReviewToken) {
      const described = this.describe("git_commit", {
        index_token: input.indexToken,
        integration_review_token: input.integrationReviewToken
      });
      if (input.authorization?.resourceFingerprint !== described.resource.resourceFingerprint) {
        throw new Error("GIT_INTEGRATION_REQUIRED");
      }
    }
    const operation = {
      toolName: "git_commit",
      canonicalAction: "commit",
      participants: ["object_quarantine", "ref_cas"] as Array<"object_quarantine" | "ref_cas">,
      counts: { affectedRefCount: 1 }
    };
    if (input.integrationReviewToken) {
      return this.#runMutation(input, operation, () => this.services.commit.commitApproved({
        ...input,
        integrationReviewToken: input.integrationReviewToken!
      }));
    }
    return this.#runMutation(input, operation, () => this.services.commit.commit(input));
  }

  restore(input:
    | ({ action: "prepare" } & Parameters<GitRestoreServiceV4["prepare"]>[0])
    | { action: "execute"; workspace: Workspace; guard: PathGuard; reviewToken: string; authorization?: AuthorizationAuditEventV4 | null }
  ) {
    if (!this.services.restore) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    if (input.action === "prepare") return this.services.restore.prepare(input);
    return this.#runMutation(input, {
      toolName: "git_restore",
      canonicalAction: "restore_execute",
      participants: ["private_index", "file_transaction"],
      counts: {}
    }, () => this.services.restore!.execute(input));
  }

  stash(input:
    | { action: "list"; workspace: Workspace }
    | ({ action: "prepare_create" } & Parameters<GitStashServiceV4["prepareCreate"]>[0])
    | { action: "execute_create"; workspace: Workspace; guard: PathGuard; reviewToken: string; authorization?: AuthorizationAuditEventV4 | null }
    | ({ action: "prepare_apply" } & Parameters<GitStashServiceV4["prepareApply"]>[0])
    | { action: "execute_apply"; workspace: Workspace; guard: PathGuard; reviewToken: string; authorization?: AuthorizationAuditEventV4 | null }
    | { action: "prepare_forget"; workspace: Workspace; stashId: string }
    | { action: "execute_forget"; workspace: Workspace; reviewToken: string; authorization?: AuthorizationAuditEventV4 | null }
  ) {
    const service = this.services.stash;
    if (!service) throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    switch (input.action) {
      case "list": return service.list(input);
      case "prepare_create": return service.prepareCreate(input);
      case "execute_create": return this.#runMutation(input, {
        toolName: "git_stash",
        canonicalAction: "stash_create",
        participants: ["object_quarantine", "private_index", "file_transaction", "ref_cas"],
        counts: {}
      }, () => service.executeCreate(input));
      case "prepare_apply": return service.prepareApply(input);
      case "execute_apply": return this.#runMutation(input, {
        toolName: "git_stash",
        canonicalAction: "stash_apply_execute",
        participants: ["private_index", "file_transaction"],
        counts: {}
      }, () => service.executeApply(input));
      case "prepare_forget": return service.prepareForget(input);
      case "execute_forget": return this.#runMutation(input, {
        toolName: "git_stash",
        canonicalAction: "stash_forget_execute",
        participants: ["ref_cas"],
        counts: { affectedRefCount: 1 }
      }, () => service.executeForget(input));
    }
  }

  async #runMutation<T>(
    input: { workspace: Workspace; authorization?: AuthorizationAuditEventV4 | null },
    operation: {
      toolName: string;
      canonicalAction: string;
      participants: Array<"object_quarantine" | "private_index" | "file_transaction" | "ref_cas" | "task_registry">;
      counts: Record<string, number>;
    },
    effect: () => Promise<T>
  ): Promise<T> {
    const journal = this.services.journal;
    if (!journal) return effect();
    const repository = await this.services.branch.context.admitWorkspace(input.workspace);
    const recoveryState: Record<string, unknown> = {
      publicRepositoryId: repository.repositoryId,
      workspaceId: input.workspace.id
    };
    if (operation.toolName === "git_stage") {
      recoveryState.indexIdentity = await gitIndexIdentityV4(path.join(repository.gitDir, "index"));
    } else if (operation.toolName === "git_commit") {
      const currentRef = await this.services.branch.context.options.executor.run(repository, [
        "symbolic-ref", "-q", "HEAD"
      ], { stdoutLimitBytes: 512 });
      const oldOid = await this.services.branch.context.options.executor.run(repository, [
        "rev-parse", "--verify", "HEAD"
      ], { stdoutLimitBytes: 256 });
      if (currentRef.status !== 0 || oldOid.status !== 0) throw new Error("GIT_STATE_CHANGED");
      recoveryState.targetRef = currentRef.stdout.toString("utf8").trim();
      recoveryState.oldOid = oldOid.stdout.toString("ascii").trim();
    }
    const reviewToken = (input as { reviewToken?: string }).reviewToken;
    if (reviewToken && operation.toolName === "git_restore" && this.services.restore) {
      const review = this.services.restore.reviews.inspect<Record<string, unknown>>(
        reviewToken,
        "restore"
      );
      recoveryState.reviewKind = "restore";
      recoveryState.reviewTokenDigest = sha256Git(reviewToken);
      recoveryState.reviewFactsDigest = sha256Git(JSON.stringify(review));
    } else if (reviewToken && operation.toolName === "git_stash" && this.services.stash) {
      const kind = operation.canonicalAction === "stash_create"
        ? "stash_create"
        : operation.canonicalAction === "stash_apply_execute"
          ? "stash_apply"
          : "stash_forget";
      const review = this.services.stash.reviews.inspect<Record<string, unknown>>(
        reviewToken,
        kind
      );
      recoveryState.reviewKind = kind;
      recoveryState.reviewTokenDigest = sha256Git(reviewToken);
      recoveryState.reviewFactsDigest = sha256Git(JSON.stringify(review));
    }
    return journal.run({
      authorization: input.authorization,
      repository,
      toolName: operation.toolName,
      canonicalAction: operation.canonicalAction,
      workspaceId: input.workspace.id,
      participants: operation.participants,
      counts: operation.counts,
      privateState: recoveryState,
      effect
    });
  }

  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult {
    let operation:
      | "create_branch" | "stage" | "commit"
      | "restore_review" | "restore_execute"
      | "stash_create" | "stash_apply_review" | "stash_apply_execute"
      | "stash_forget_review" | "stash_forget_execute";
    let repositoryId: string;
    let branchId: string | null = null;
    let pathDigests: string[] = [];
    let refDigests: string[] = [];
    let stateTokenFingerprint: string | null = null;
    let integrationMode: "off" | "approved_full_access" = "off";
    let approvalRevealArguments: string[] | undefined;
    if (toolName === "git_create_branch") {
      operation = "create_branch";
      const facts = this.services.branch["context"].options.stateTokens.inspect(String(args.state_token));
      repositoryId = facts.repositoryId;
      const base = args.base as { kind?: string; branch_id?: string } | undefined;
      branchId = base?.kind === "branch" && typeof base.branch_id === "string" ? base.branch_id : null;
      refDigests = [sha256Git(String(args.name))];
      stateTokenFingerprint = sha256Git(String(args.state_token));
    } else if (toolName === "git_stage") {
      operation = "stage";
      const facts = this.services.index["context"].options.stateTokens.inspect(String(args.state_token));
      repositoryId = facts.repositoryId;
      pathDigests = stringArray(args.paths).map(sha256Git).sort();
      const integrationToken = typeof args.integration_review_token === "string"
        ? args.integration_review_token
        : null;
      if (integrationToken) {
        const gate = this.services.integrationGate;
        if (!gate?.enabled) throw new Error("GIT_INTEGRATION_REQUIRED");
        const review = gate.inspect(integrationToken);
        if (review.repositoryId !== repositoryId || review.workspaceId !== facts.workspaceId) {
          throw new Error("GIT_STATE_TOKEN_INVALID");
        }
        integrationMode = "approved_full_access";
        approvalRevealArguments = gate.approvalPreview(integrationToken);
        refDigests = [review.identitiesDigest, sha256Git(integrationToken)].sort();
      }
      stateTokenFingerprint = sha256Git(JSON.stringify({
        stateToken: String(args.state_token),
        integrationReviewToken: integrationToken
      }));
    } else if (toolName === "git_commit") {
      operation = "commit";
      const facts = this.services.index.indexTokens.inspect(String(args.index_token));
      repositoryId = facts.repositoryId;
      refDigests = [sha256Git(facts.headOid), sha256Git(facts.indexTreeOid)].sort();
      const integrationToken = typeof args.integration_review_token === "string"
        ? args.integration_review_token
        : null;
      if (integrationToken) {
        const gate = this.services.integrationGate;
        if (!gate?.enabled) throw new Error("GIT_INTEGRATION_REQUIRED");
        const review = gate.inspect(integrationToken);
        if (review.repositoryId !== repositoryId || review.workspaceId !== facts.workspaceId) {
          throw new Error("GIT_STATE_TOKEN_INVALID");
        }
        integrationMode = "approved_full_access";
        approvalRevealArguments = gate.approvalPreview(integrationToken);
        refDigests = [
          ...refDigests,
          review.identitiesDigest,
          sha256Git(integrationToken)
        ].sort();
      }
      stateTokenFingerprint = sha256Git(JSON.stringify({
        indexToken: String(args.index_token),
        integrationReviewToken: integrationToken
      }));
    } else if (toolName === "git_restore" && this.services.restore) {
      const action = String(args.action);
      if (action === "prepare") {
        operation = "restore_review";
        const facts = this.services.restore.context.options.stateTokens.inspect(String(args.state_token));
        repositoryId = facts.repositoryId;
        pathDigests = stringArray(args.paths).map(sha256Git).sort();
        stateTokenFingerprint = sha256Git(String(args.state_token));
      } else if (action === "execute") {
        operation = "restore_execute";
        const review = this.services.restore.reviews.inspect<Record<string, unknown>>(String(args.review_token), "restore");
        repositoryId = String(review.repositoryId);
        pathDigests = stringArray(review.paths).map(sha256Git).sort();
        stateTokenFingerprint = sha256Git(String(args.review_token));
      } else throw new Error("GIT_STATE_TOKEN_INVALID");
    } else if (toolName === "git_stash" && this.services.stash) {
      const action = String(args.action);
      if (action === "prepare_create") {
        operation = "stash_create";
        const facts = this.services.stash.context.options.stateTokens.inspect(String(args.state_token));
        repositoryId = facts.repositoryId;
        pathDigests = stringArray(args.paths).map(sha256Git).sort();
        stateTokenFingerprint = sha256Git(String(args.state_token));
      } else if (action === "execute_create") {
        operation = "stash_create";
        const review = this.services.stash.reviews.inspect<Record<string, unknown>>(String(args.review_token), "stash_create");
        repositoryId = String(review.repositoryId);
        pathDigests = (review.entries as Array<{ path: string }>).map((entry) => sha256Git(entry.path)).sort();
        stateTokenFingerprint = sha256Git(String(args.review_token));
      } else if (action === "prepare_apply") {
        operation = "stash_apply_review";
        const facts = this.services.stash.context.options.stateTokens.inspect(String(args.state_token));
        repositoryId = facts.repositoryId;
        refDigests = [sha256Git(String(args.stash_id))];
        stateTokenFingerprint = sha256Git(String(args.state_token));
      } else if (action === "execute_apply") {
        operation = "stash_apply_execute";
        const review = this.services.stash.reviews.inspect<Record<string, unknown>>(String(args.review_token), "stash_apply");
        repositoryId = String(review.repositoryId);
        refDigests = [sha256Git(String(review.stashId))];
        stateTokenFingerprint = sha256Git(String(args.review_token));
      } else if (action === "prepare_forget") {
        operation = "stash_forget_review";
        const stash = this.services.stash.describeStash(String(args.workspace_id), String(args.stash_id));
        repositoryId = stash.repositoryId;
        refDigests = [sha256Git(stash.refOid)];
      } else if (action === "execute_forget") {
        operation = "stash_forget_execute";
        const review = this.services.stash.reviews.inspect<Record<string, unknown>>(String(args.review_token), "stash_forget");
        repositoryId = String(review.repositoryId);
        refDigests = [sha256Git(String(review.expectedOid))];
        stateTokenFingerprint = sha256Git(String(args.review_token));
      } else throw new Error("GIT_STATE_TOKEN_INVALID");
    } else {
      throw new Error("GIT_V4_HANDLER_UNAVAILABLE");
    }
    const resource = createGitResourceV4({
      operation,
      repositoryId,
      worktreeId: null,
      branchId,
      pathDigests,
      refDigests,
      objectIds: [],
      affectedPathCount: pathDigests.length,
      affectedByteCount: 0,
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

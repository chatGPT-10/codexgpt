import { createHash } from "node:crypto";
import type { PathGuard, Workspace } from "../guard.js";
import type { GitCommandExecutor, GitExecutionOptions, GitExecutionResult } from "./execution.js";
import {
  admitGitRepository,
  revalidateGitRepository,
  type GitRepositoryIdentity,
  type RepositoryIdentityRegistry
} from "./repositoryIdentity.js";
import type { GitReadServiceV4 } from "./readService.js";
import type { GitRepositoryAdmissionV4 } from "./admission.js";
import type { GitStateTokenFacts, GitStateTokenService } from "./stateToken.js";

export function gitMutationError(code: string): Error {
  return new Error(code);
}

export function sha256Git(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function runGitRequired(
  executor: GitCommandExecutor,
  repository: GitRepositoryIdentity,
  args: readonly string[],
  options: GitExecutionOptions = {}
): Promise<GitExecutionResult> {
  const result = await executor.run(repository, args, options).catch(() => {
    throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
  });
  if (result.timedOut || result.stdoutTruncated || result.stderrTruncated) {
    throw gitMutationError("GIT_SCAN_LIMIT");
  }
  if (result.status !== 0) throw gitMutationError("GIT_STATE_CHANGED");
  return result;
}

function sameState(left: GitStateTokenFacts, right: GitStateTokenFacts): boolean {
  return (
    left.repositoryId === right.repositoryId &&
    left.workspaceId === right.workspaceId &&
    left.contextFingerprint === right.contextFingerprint &&
    left.capabilityRevision === right.capabilityRevision &&
    left.repositoryFingerprint === right.repositoryFingerprint &&
    left.headDigest === right.headDigest &&
    left.indexDigest === right.indexDigest &&
    left.worktreeDigest === right.worktreeDigest &&
    left.ignoredDigest === right.ignoredDigest &&
    left.attributesDigest === right.attributesDigest &&
    left.scopeDigest === right.scopeDigest &&
    left.complete &&
    right.complete
  );
}

export interface VerifiedGitMutationContextV4 {
  repository: GitRepositoryIdentity;
  facts: GitStateTokenFacts;
}

export class GitMutationContextV4 {
  constructor(readonly options: {
    executor: GitCommandExecutor;
    registry: RepositoryIdentityRegistry;
    stateTokens: GitStateTokenService;
    readService: Pick<GitReadServiceV4, "status">;
    contextFingerprint: string;
    admission?: GitRepositoryAdmissionV4;
  }) {
    if (options.registry.contextFingerprint() !== options.contextFingerprint) {
      throw gitMutationError("GIT_REPOSITORY_UNSAFE");
    }
  }

  resolveBranch(repositoryId: string, branchId: string): string {
    return this.options.registry.resolveBranch(repositoryId, branchId);
  }

  branchId(repositoryId: string, ref: string): string {
    return this.options.registry.branchId(repositoryId, ref);
  }

  async admitWorkspace(workspace: Workspace): Promise<GitRepositoryIdentity> {
    return this.options.admission
      ? this.options.admission.admit(workspace)
      : admitGitRepository({
          workspaceRoot: workspace.root,
          executor: this.options.executor,
          registry: this.options.registry
        });
  }

  async verifyState(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    paths?: readonly string[];
  }): Promise<VerifiedGitMutationContextV4> {
    const supplied = this.options.stateTokens.inspect(input.stateToken);
    if (
      supplied.workspaceId !== input.workspace.id ||
      supplied.contextFingerprint !== this.options.contextFingerprint ||
      supplied.capabilityRevision !== this.options.executor.capabilityRevision ||
      !supplied.complete
    ) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const refreshed = await this.options.readService.status({
      workspace: input.workspace,
      guard: input.guard,
      paths: input.paths
    });
    if (!refreshed.state_token || refreshed.mutation_state !== "complete") {
      throw gitMutationError("GIT_STATE_INCOMPLETE");
    }
    const current = this.options.stateTokens.inspect(refreshed.state_token);
    this.options.stateTokens.revoke(refreshed.state_token);
    if (!sameState(supplied, current)) throw gitMutationError("GIT_STATE_CHANGED");
    const repository = await this.admitWorkspace(input.workspace);
    if (
      repository.repositoryId !== supplied.repositoryId ||
      repository.repositoryFingerprint !== supplied.repositoryFingerprint
    ) throw gitMutationError("GIT_STATE_CHANGED");
    await revalidateGitRepository(repository);
    return { repository, facts: supplied };
  }

  async refreshState(input: {
    workspace: Workspace;
    guard: PathGuard;
    paths?: readonly string[];
  }): Promise<string> {
    const refreshed = await this.options.readService.status(input);
    if (!refreshed.state_token || refreshed.mutation_state !== "complete") {
      throw gitMutationError("GIT_STATE_INCOMPLETE");
    }
    return refreshed.state_token;
  }
}

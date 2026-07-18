import type { PathGuard, Workspace } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import { revalidateGitRepository } from "./repositoryIdentity.js";
import { GitMutationContextV4, gitMutationError, runGitRequired } from "./mutationContext.js";

function oidPattern(format: "sha1" | "sha256"): RegExp {
  return new RegExp(`^[a-f0-9]{${format === "sha1" ? 40 : 64}}$`);
}

export class GitBranchServiceV4 {
  constructor(readonly context: GitMutationContextV4) {}

  async create(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    name: string;
    base: { kind: "current_head" } | { kind: "branch"; branch_id: string };
  }): Promise<{
    repository_id: string;
    branch_id: string;
    oid: string;
    created: true;
    state_token: string;
  }> {
    if (
      !/^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(input.name) ||
      hasSecretValue(input.name) ||
      /(?:token|secret|password)[._-][A-Za-z0-9_-]{16,}/i.test(input.name)
    ) {
      throw gitMutationError("GIT_SECRET_BLOCKED");
    }
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken
    });
    const repository = verified.repository;
    const ref = `refs/heads/${input.name}`;
    const baseRef = input.base.kind === "current_head"
      ? "HEAD"
      : this.context.resolveBranch(repository.repositoryId, input.base.branch_id);
    await revalidateGitRepository(repository);
    const baseResult = await runGitRequired(
      this.context.options.executor,
      repository,
      ["rev-parse", "--verify", `${baseRef}^{commit}`],
      { stdoutLimitBytes: 256 }
    );
    const oid = baseResult.stdout.toString("ascii").trim();
    if (!oidPattern(repository.objectFormat).test(oid)) throw gitMutationError("GIT_REF_CHANGED");
    const zeroOid = "0".repeat(oid.length);
    const update = await this.context.options.executor.run(
      repository,
      ["update-ref", "--no-deref", ref, oid, zeroOid]
    );
    if (
      update.status !== 0 || update.timedOut ||
      update.stdoutTruncated || update.stderrTruncated
    ) throw gitMutationError("GIT_REF_CHANGED");
    const stateToken = await this.context.refreshState({
      workspace: input.workspace,
      guard: input.guard
    });
    return {
      repository_id: repository.repositoryId,
      branch_id: this.context.branchId(repository.repositoryId, ref),
      oid,
      created: true,
      state_token: stateToken
    };
  }
}

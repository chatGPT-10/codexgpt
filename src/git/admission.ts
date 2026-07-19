import type { Workspace } from "../guard.js";
import type { GitCommandExecutor } from "./execution.js";
import {
  admitGitRepository,
  type GitRepositoryIdentity,
  type RepositoryIdentityRegistry
} from "./repositoryIdentity.js";

export type ManagedTaskGitAdmissionResolverV4 = (
  workspace: Workspace
) => Promise<GitRepositoryIdentity>;

export class GitRepositoryAdmissionV4 {
  #managedTaskResolver: ManagedTaskGitAdmissionResolverV4 | null = null;

  constructor(private readonly options: {
    executor: GitCommandExecutor;
    registry: RepositoryIdentityRegistry;
  }) {}

  setManagedTaskResolver(resolver: ManagedTaskGitAdmissionResolverV4): void {
    if (this.#managedTaskResolver) throw new Error("GIT_REPOSITORY_UNSAFE");
    this.#managedTaskResolver = resolver;
  }

  async admit(workspace: Workspace): Promise<GitRepositoryIdentity> {
    if (workspace.accessClass === "task_worktree") {
      if (!this.#managedTaskResolver) throw new Error("TASK_WORKTREE_NOT_FOUND");
      return this.#managedTaskResolver(workspace);
    }
    return admitGitRepository({
      workspaceRoot: workspace.root,
      executor: this.options.executor,
      registry: this.options.registry
    });
  }
}

import { randomBytes } from "node:crypto";
import type { ClosedWorkspace, Workspace } from "../guard.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import { admitManagedTaskGitRepository, type GitRepositoryIdentity } from "../git/repositoryIdentity.js";

interface IssuedTaskWorkspace {
  workspace: Workspace;
  taskWorktreeId: string;
}

export class TaskWorktreeWorkspaceAuthorityV4 {
  readonly #records = new Map<string, IssuedTaskWorkspace>();

  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    ownerFingerprint: () => string;
    now?: () => number;
  }) {}

  async issue(taskWorktreeId: string): Promise<Workspace> {
    const item = await this.options.manager.revalidate(taskWorktreeId, this.options.ownerFingerprint());
    const workspace: Workspace = {
      id: `ws_${randomBytes(16).toString("hex")}`,
      root: item.privateState.worktreePath,
      openedAt: new Date(this.options.now?.() ?? Date.now()).toISOString(),
      accessClass: "task_worktree",
      access: "read_write"
    };
    this.#records.set(workspace.id, { workspace, taskWorktreeId });
    return { ...workspace };
  }

  getWorkspace(id: string): Workspace {
    const record = this.#records.get(id);
    if (!record) throw new Error("TASK_WORKTREE_NOT_FOUND");
    return { ...record.workspace };
  }

  async admitGitWorkspace(workspace: Workspace): Promise<GitRepositoryIdentity> {
    const record = this.#records.get(workspace.id);
    if (
      !record ||
      record.workspace.root !== workspace.root ||
      workspace.accessClass !== "task_worktree" ||
      record.workspace.accessClass !== "task_worktree"
    ) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const task = await this.options.manager.revalidate(
      record.taskWorktreeId,
      this.options.ownerFingerprint()
    );
    if (!task.privateState.adminDir || task.privateState.worktreePath !== workspace.root) {
      throw new Error("TASK_WORKTREE_NOT_FOUND");
    }
    return admitManagedTaskGitRepository({
      workspaceRoot: workspace.root,
      expectedAdminDir: task.privateState.adminDir,
      expectedRepositoryId: task.record.repositoryId,
      executor: this.options.manager.options.context.options.executor
    });
  }

  listWorkspaces(): Workspace[] {
    return [...this.#records.values()].map((record) => ({ ...record.workspace }));
  }

  closeWorkspace(id: string): ClosedWorkspace | null {
    if (!this.#records.delete(id)) return null;
    return {
      workspaceId: id,
      closedAt: new Date(this.options.now?.() ?? Date.now()).toISOString(),
      state: "closed"
    };
  }

  revokeTask(taskWorktreeId: string): void {
    for (const [id, record] of this.#records) {
      if (record.taskWorktreeId === taskWorktreeId) this.#records.delete(id);
    }
  }
}

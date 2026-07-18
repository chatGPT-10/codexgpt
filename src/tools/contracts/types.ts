import type { ToolContractVersion, ToolMode } from "../../config.js";

export type CanonicalToolV1 =
  | "apply_patch"
  | "bash"
  | "codex_context"
  | "codexpro_inventory"
  | "codexpro_self_test"
  | "codex_sessions"
  | "edit"
  | "export_pro_context"
  | "git_diff"
  | "git_status"
  | "handoff_to_agent"
  | "handoff_to_codex"
  | "inspect_workspace"
  | "list_workspaces"
  | "close_workspace"
  | "load_skill"
  | "open_current_workspace"
  | "open_workspace"
  | "read"
  | "read_codex_session"
  | "read_handoff"
  | "search"
  | "server_config"
  | "show_changes"
  | "tree"
  | "wait_for_handoff"
  | "workspace_snapshot"
  | "write";

export type CanonicalToolV2 = CanonicalToolV1 | "query_audit_events" | "undo_change_set" | "move_paths";

export type CanonicalToolV3Addition =
  | "open_full_access_workspace"
  | "run_command"
  | "start_process"
  | "read_process_output"
  | "write_process_input"
  | "interrupt_process"
  | "terminate_process"
  | "resize_process_terminal"
  | "list_processes";

export type CanonicalToolV3 = Exclude<CanonicalToolV2, "bash"> | CanonicalToolV3Addition;

export type CanonicalToolV4Addition =
  | "git_log"
  | "git_branch"
  | "git_create_branch"
  | "git_stage"
  | "git_commit"
  | "git_restore"
  | "git_stash"
  | "create_task_worktree"
  | "list_task_worktrees"
  | "get_task_worktree"
  | "merge_task_worktree"
  | "remove_task_worktree";

export type CanonicalToolV4 = CanonicalToolV3 | CanonicalToolV4Addition;
export type CanonicalTool = CanonicalToolV2 | CanonicalToolV3 | CanonicalToolV4;

export interface ToolContractProjectionInput {
  version: ToolContractVersion;
  mode: ToolMode;
  connectionTest: boolean;
}

export interface ToolContractDescriptor {
  name: CanonicalTool;
  introducedIn: ToolContractVersion;
  modes: readonly ToolMode[];
  connectionTest: boolean;
}

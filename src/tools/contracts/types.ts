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

export interface ToolContractProjectionInput {
  version: ToolContractVersion;
  mode: ToolMode;
  connectionTest: boolean;
}

export interface ToolContractDescriptor {
  name: CanonicalToolV2;
  introducedIn: ToolContractVersion;
  modes: readonly ToolMode[];
  connectionTest: boolean;
}

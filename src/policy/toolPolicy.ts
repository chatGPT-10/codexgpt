import { CANONICAL_CODEXPRO_CHILD_TOOLS, type CanonicalCodexProChildTool } from "../tools/schemas/codexpro.js";
import type { PolicyScope, RiskClass } from "./types.js";

export type ToolPolicyResourceMode =
  | "context_only"
  | "workspace_read"
  | "exact_read"
  | "workspace_write"
  | "exact_write"
  | "bridge_write"
  | "git_read"
  | "shell"
  | "resolved";

export interface ToolPolicyDefinition {
  riskClass: RiskClass;
  requiredScope: PolicyScope | null;
  resourceMode: ToolPolicyResourceMode;
}

export const TOOL_POLICY_DEFINITIONS: Readonly<Record<CanonicalCodexProChildTool, ToolPolicyDefinition>> = Object.freeze({
  apply_patch: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "workspace_write" }),
  bash: Object.freeze({ riskClass: "R3", requiredScope: "shell:execute", resourceMode: "shell" }),
  close_workspace: Object.freeze({ riskClass: "R1", requiredScope: "workspace:open", resourceMode: "context_only" }),
  codex_context: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  codexpro_inventory: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "context_only" }),
  codexpro_self_test: Object.freeze({ riskClass: "R0", requiredScope: null, resourceMode: "context_only" }),
  codex_sessions: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "context_only" }),
  edit: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "exact_write" }),
  export_pro_context: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "bridge_write" }),
  git_diff: Object.freeze({ riskClass: "R0", requiredScope: "git:read", resourceMode: "git_read" }),
  git_status: Object.freeze({ riskClass: "R0", requiredScope: "git:read", resourceMode: "git_read" }),
  handoff_to_agent: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "bridge_write" }),
  handoff_to_codex: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "bridge_write" }),
  inspect_workspace: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  list_workspaces: Object.freeze({ riskClass: "R0", requiredScope: "workspace:open", resourceMode: "context_only" }),
  load_skill: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "context_only" }),
  open_current_workspace: Object.freeze({ riskClass: "R1", requiredScope: "workspace:open", resourceMode: "context_only" }),
  open_workspace: Object.freeze({ riskClass: "R1", requiredScope: "workspace:open", resourceMode: "context_only" }),
  read: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "exact_read" }),
  read_codex_session: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "context_only" }),
  read_handoff: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  search: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  server_config: Object.freeze({ riskClass: "R0", requiredScope: null, resourceMode: "context_only" }),
  show_changes: Object.freeze({ riskClass: "R0", requiredScope: "git:read", resourceMode: "git_read" }),
  tree: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  wait_for_handoff: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  workspace_snapshot: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  write: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "exact_write" })
});

const canonicalSet = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS);

export function toolPolicyDefinition(toolName: string): ToolPolicyDefinition {
  if (toolName === "undo_change_set") return UNDO_CHANGE_SET_TOOL_POLICY_V2;
  if (toolName === "move_paths") return MOVE_PATHS_TOOL_POLICY_V2;
  if (toolName === "query_audit_events") return AUDIT_QUERY_TOOL_POLICY_V2;
  if (!canonicalSet.has(toolName)) throw new Error("Registered tool is outside the closed Policy Kernel tool set.");
  return TOOL_POLICY_DEFINITIONS[toolName as CanonicalCodexProChildTool];
}

export const UNDO_CHANGE_SET_TOOL_POLICY_V2 = Object.freeze({
  riskClass: "R2" as const,
  requiredScope: "filesystem:write" as const,
  resourceMode: "resolved" as const
});

export const MOVE_PATHS_TOOL_POLICY_V2 = Object.freeze({
  riskClass: "R2" as const,
  requiredScope: "filesystem:write" as const,
  resourceMode: "resolved" as const
});

export const AUDIT_QUERY_TOOL_POLICY_V2 = Object.freeze({
  riskClass: "R1" as const,
  requiredScope: "audit:read" as const,
  resourceMode: "resolved" as const
});

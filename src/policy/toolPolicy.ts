import { CANONICAL_CODEXGPT_CHILD_TOOLS, type CanonicalCodexGPTChildTool } from "../tools/schemas/codexgpt.js";
import { gitV4PolicyDefinition, type GitV4PolicyDefinition } from "../git/resources.js";
import {
  CONTRACT_V3_ADDITIONS,
  CONTRACT_V4_ADDITIONS
} from "../tools/contracts/index.js";
import type { GitOperationV4, PolicyScope, PolicyScopeV3, RiskClass } from "./types.js";
export type { PolicyScopeV3 } from "./types.js";

export interface RequiredScopesInputV3 {
  contractVersion: 3;
  mode?: "full_access" | "workspace";
}

const V3_PROCESS_SCOPES = Object.freeze({
  open_full_access_workspace: Object.freeze(["workspace:full-access"] as const),
  read_process_output: Object.freeze(["process:manage"] as const),
  list_processes: Object.freeze(["process:manage"] as const),
  resize_process_terminal: Object.freeze(["process:manage"] as const),
  write_process_input: Object.freeze(["process:manage"] as const),
  interrupt_process: Object.freeze(["process:manage"] as const),
  terminate_process: Object.freeze(["process:manage"] as const)
});

export function requiredScopesForTool(toolName: string, input: RequiredScopesInputV3): readonly PolicyScopeV3[] {
  if (input.contractVersion !== 3) throw new Error("Composite scopes require contract 3.");
  if (toolName === "run_command") {
    return Object.freeze(input.mode === "full_access"
      ? ["shell:execute", "host:full-access"]
      : ["shell:execute"]);
  }
  if (toolName === "start_process") {
    return Object.freeze(input.mode === "full_access"
      ? ["shell:execute", "process:manage", "process:persistent", "host:full-access"]
      : ["shell:execute", "process:manage", "process:persistent"]);
  }
  const scopes = V3_PROCESS_SCOPES[toolName as keyof typeof V3_PROCESS_SCOPES];
  if (scopes) return scopes;
  const definition = toolPolicyDefinition(toolName);
  return definition.requiredScope ? Object.freeze([definition.requiredScope]) : Object.freeze([]);
}

export type ToolPolicyResourceMode =
  | "context_only"
  | "workspace_read"
  | "exact_read"
  | "workspace_write"
  | "exact_write"
  | "bridge_write"
  | "git_read"
  | "shell"
  | "disabled"
  | "resolved";

export interface ToolPolicyDefinition {
  riskClass: RiskClass;
  requiredScope: PolicyScope | null;
  resourceMode: ToolPolicyResourceMode;
}

export const TOOL_POLICY_DEFINITIONS: Readonly<Record<CanonicalCodexGPTChildTool, ToolPolicyDefinition>> = Object.freeze({
  apply_patch: Object.freeze({ riskClass: "R2", requiredScope: "filesystem:write", resourceMode: "workspace_write" }),
  bash: Object.freeze({ riskClass: "R3", requiredScope: "shell:execute", resourceMode: "shell" }),
  close_workspace: Object.freeze({ riskClass: "R1", requiredScope: "workspace:open", resourceMode: "context_only" }),
  codex_context: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "workspace_read" }),
  codexgpt_inventory: Object.freeze({ riskClass: "R0", requiredScope: "filesystem:read", resourceMode: "context_only" }),
  codexgpt_self_test: Object.freeze({ riskClass: "R0", requiredScope: null, resourceMode: "context_only" }),
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

const canonicalSet = new Set<string>(CANONICAL_CODEXGPT_CHILD_TOOLS);
const v3AdditionSet = new Set<string>(CONTRACT_V3_ADDITIONS);
const v4AdditionSet = new Set<string>(CONTRACT_V4_ADDITIONS);

export const DISABLED_V3_TOOL_POLICY: ToolPolicyDefinition = Object.freeze({
  riskClass: "R4",
  requiredScope: null,
  resourceMode: "disabled"
});

export const DISABLED_V4_TOOL_POLICY: ToolPolicyDefinition = Object.freeze({
  riskClass: "R4",
  requiredScope: null,
  resourceMode: "disabled"
});

const V3_TOOL_POLICY_DEFINITIONS: Readonly<Record<string, ToolPolicyDefinition>> = Object.freeze({
  open_full_access_workspace: Object.freeze({ riskClass: "R3", requiredScope: null, resourceMode: "resolved" }),
  run_command: Object.freeze({ riskClass: "R3", requiredScope: "shell:execute", resourceMode: "resolved" }),
  start_process: Object.freeze({ riskClass: "R3", requiredScope: "shell:execute", resourceMode: "resolved" }),
  read_process_output: Object.freeze({ riskClass: "R0", requiredScope: "process:manage", resourceMode: "resolved" }),
  write_process_input: Object.freeze({ riskClass: "R3", requiredScope: "process:manage", resourceMode: "resolved" }),
  interrupt_process: Object.freeze({ riskClass: "R2", requiredScope: "process:manage", resourceMode: "resolved" }),
  terminate_process: Object.freeze({ riskClass: "R2", requiredScope: "process:manage", resourceMode: "resolved" }),
  resize_process_terminal: Object.freeze({ riskClass: "R0", requiredScope: "process:manage", resourceMode: "resolved" }),
  list_processes: Object.freeze({ riskClass: "R0", requiredScope: "process:manage", resourceMode: "resolved" })
});

const V4_TOOL_POLICY_DEFINITIONS: Readonly<Record<string, ToolPolicyDefinition>> = Object.freeze({
  git_log: Object.freeze({ riskClass: "R0", requiredScope: "git:read", resourceMode: "git_read" }),
  git_branch: Object.freeze({ riskClass: "R0", requiredScope: "git:read", resourceMode: "git_read" }),
  git_create_branch: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  git_stage: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  git_commit: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  git_restore: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  git_stash: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  create_task_worktree: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  list_task_worktrees: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  get_task_worktree: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  merge_task_worktree: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" }),
  remove_task_worktree: Object.freeze({ riskClass: "R4", requiredScope: null, resourceMode: "resolved" })
});

export function gateRPolicyDefinition(
  toolName: string,
  operation?: GitOperationV4
): GitV4PolicyDefinition {
  if (!v4AdditionSet.has(toolName)) throw new Error("Tool is outside the closed V4 Gate R policy set.");
  return gitV4PolicyDefinition(toolName, operation);
}

export function toolPolicyDefinition(toolName: string): ToolPolicyDefinition {
  if (toolName === "undo_change_set") return UNDO_CHANGE_SET_TOOL_POLICY_V2;
  if (toolName === "move_paths") return MOVE_PATHS_TOOL_POLICY_V2;
  if (toolName === "query_audit_events") return AUDIT_QUERY_TOOL_POLICY_V2;
  if (v3AdditionSet.has(toolName)) return V3_TOOL_POLICY_DEFINITIONS[toolName];
  if (v4AdditionSet.has(toolName)) return V4_TOOL_POLICY_DEFINITIONS[toolName] ?? DISABLED_V4_TOOL_POLICY;
  if (!canonicalSet.has(toolName)) throw new Error("Registered tool is outside the closed Policy Kernel tool set.");
  return TOOL_POLICY_DEFINITIONS[toolName as CanonicalCodexGPTChildTool];
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

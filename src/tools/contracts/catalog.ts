import type { ToolContractVersion } from "../../config.js";
import type {
  CanonicalToolV1,
  CanonicalTool,
  CanonicalToolV2,
  CanonicalToolV3,
  CanonicalToolV4,
  ToolContractDescriptor,
  ToolContractProjectionInput
} from "./types.js";
import { CONTRACT_V3_ADDITIONS } from "./v3.js";
import { CONTRACT_V4_ADDITIONS } from "./v4.js";

export const CONTRACT_V1_CHILD_TOOLS = Object.freeze([
  "apply_patch",
  "bash",
  "codex_context",
  "codexgpt_inventory",
  "codexgpt_self_test",
  "codex_sessions",
  "edit",
  "export_pro_context",
  "git_diff",
  "git_status",
  "handoff_to_agent",
  "handoff_to_codex",
  "inspect_workspace",
  "list_workspaces",
  "close_workspace",
  "load_skill",
  "open_current_workspace",
  "open_workspace",
  "read",
  "read_codex_session",
  "read_handoff",
  "search",
  "server_config",
  "show_changes",
  "tree",
  "wait_for_handoff",
  "workspace_snapshot",
  "write"
] as const satisfies readonly CanonicalToolV1[]);

export const CONTRACT_V2_ADDITIONS = Object.freeze([
  "query_audit_events",
  "undo_change_set",
  "move_paths"
] as const);

export const CONTRACT_V2_CHILD_TOOLS = Object.freeze([
  ...CONTRACT_V1_CHILD_TOOLS,
  ...CONTRACT_V2_ADDITIONS
] as const satisfies readonly CanonicalToolV2[]);

export const CONTRACT_V3_CHILD_TOOLS = Object.freeze([
  ...CONTRACT_V2_CHILD_TOOLS.filter((name) => name !== "bash"),
  ...CONTRACT_V3_ADDITIONS
] as const satisfies readonly CanonicalToolV3[]);

export const CONTRACT_V4_CHILD_TOOLS = Object.freeze([
  ...CONTRACT_V3_CHILD_TOOLS,
  ...CONTRACT_V4_ADDITIONS
] as const satisfies readonly CanonicalToolV4[]);

const V2_DESCRIPTORS = Object.freeze({
  query_audit_events: Object.freeze({
    name: "query_audit_events",
    introducedIn: 2,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  undo_change_set: Object.freeze({
    name: "undo_change_set",
    introducedIn: 2,
    modes: Object.freeze(["standard", "full"] as const),
    connectionTest: false
  }),
  move_paths: Object.freeze({
    name: "move_paths",
    introducedIn: 2,
    modes: Object.freeze(["standard", "full"] as const),
    connectionTest: false
  })
} satisfies Record<(typeof CONTRACT_V2_ADDITIONS)[number], ToolContractDescriptor>);

export function contractIncludesV2(version: ToolContractVersion): version is 2 | 3 | 4 {
  return version === 2 || version === 3 || version === 4;
}

export function contractIncludesV3(version: ToolContractVersion): version is 3 | 4 {
  return version === 3 || version === 4;
}

export function contractIncludesV4(version: ToolContractVersion): version is 4 {
  return version === 4;
}

export function canonicalToolsForVersion(version: ToolContractVersion): readonly CanonicalTool[] {
  if (version === 1) return CONTRACT_V1_CHILD_TOOLS;
  if (version === 2) return CONTRACT_V2_CHILD_TOOLS;
  if (version === 3) return CONTRACT_V3_CHILD_TOOLS;
  if (version === 4) return CONTRACT_V4_CHILD_TOOLS;
  throw new Error("Unsupported tool contract version.");
}

export function v2ToolsForProjection(input: ToolContractProjectionInput): readonly CanonicalToolV2[] {
  if (!contractIncludesV2(input.version) || input.connectionTest) return Object.freeze([]);
  return Object.freeze(CONTRACT_V2_ADDITIONS.filter((name) =>
    (V2_DESCRIPTORS[name].modes as readonly string[]).includes(input.mode)
  ));
}

export function isCanonicalToolForVersion(
  version: ToolContractVersion,
  value: string
): value is CanonicalTool {
  return (canonicalToolsForVersion(version) as readonly string[]).includes(value);
}

export function contractDescriptor(name: (typeof CONTRACT_V2_ADDITIONS)[number]): ToolContractDescriptor {
  return V2_DESCRIPTORS[name];
}

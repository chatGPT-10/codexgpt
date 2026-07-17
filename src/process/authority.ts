export const FULL_ACCESS_PROCESS_AUTHORITY_V3 = Object.freeze({
  mode: "full_access" as const,
  workspace_boundary_enforced: false as const,
  filesystem_scope: "current_user_unrestricted" as const,
  filesystem_isolation: "none" as const,
  credential_isolation: "none" as const,
  registry_isolation: "none" as const,
  network_isolation: "none" as const,
  process_tree_control: "job_object_members_only" as const,
  broker_escape_resistance: "none" as const,
  host_writeback: "possible" as const,
  redaction: "best_effort_known_patterns" as const
});

export const FULL_ACCESS_PROCESS_WARNING_V3 =
  "Full access requires a fresh local decision record for each R3 action. " +
  "Only an initial start with no pre-existing unrestricted code may be described as following a human action; " +
  "later records are not unforgeable proof of human presence. " +
  "Control covers recorded Job members only and provides no broker-escape resistance.";

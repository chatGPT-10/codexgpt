import {
  computeGitResourceV4Fingerprint,
  gitResourceV4Schema
} from "../policy/schemas.js";
import type {
  GitOperationV4,
  GitResourceV4,
  PolicyScopeV4,
  RiskClass
} from "../policy/types.js";
import { gateRError } from "./durableState.js";

export interface GitResourceV4Input extends Omit<GitResourceV4, "schemaVersion" | "kind" | "resourceFingerprint"> {}

export interface GitV4PolicyDefinition {
  riskClass: RiskClass;
  requiredScopes: readonly PolicyScopeV4[];
  resourceMode: "resolved";
  handlerState: "enabled" | "disabled";
}

export interface LocalGitApprovalSummaryV4 {
  operation: GitOperationV4;
  repositoryId: string;
  worktreeId: string | null;
  branchId: string | null;
  affectedPathCount: number;
  affectedByteCount: number;
  pathDigestCount: number;
  refDigestCount: number;
  objectCount: number;
  integrationMode: "off" | "approved_full_access";
  executionIsolation: "none";
  resourceFingerprint: string;
}

function scopes(...values: PolicyScopeV4[]): readonly PolicyScopeV4[] {
  return Object.freeze(values);
}

function definition(
  riskClass: RiskClass,
  requiredScopes: readonly PolicyScopeV4[],
  handlerState: "enabled" | "disabled" = "disabled"
): GitV4PolicyDefinition {
  return Object.freeze({
    riskClass,
    requiredScopes,
    resourceMode: "resolved",
    handlerState
  });
}

const OPERATION_DEFINITIONS: Readonly<Record<GitOperationV4, GitV4PolicyDefinition>> = Object.freeze({
  read: definition("R0", scopes("git:read"), "enabled"),
  create_branch: definition("R3", scopes("git:refs:write"), "enabled"),
  stage: definition("R2", scopes("git:index:write", "filesystem:read"), "enabled"),
  commit: definition("R3", scopes("git:commit", "git:refs:write"), "enabled"),
  restore_review: definition("R1", scopes("git:read"), "enabled"),
  restore_execute: definition("R3", scopes("git:index:write", "filesystem:write"), "enabled"),
  stash_list: definition("R0", scopes("git:read"), "enabled"),
  stash_create: definition("R3", scopes("git:index:write", "git:refs:write", "filesystem:write"), "enabled"),
  stash_apply_review: definition("R1", scopes("git:read"), "enabled"),
  stash_apply_execute: definition("R3", scopes("git:index:write", "filesystem:write"), "enabled"),
  stash_forget_review: definition("R1", scopes("git:read"), "enabled"),
  stash_forget_execute: definition("R3", scopes("git:refs:write"), "enabled"),
  task_create_review: definition("R2", scopes("worktree:manage", "filesystem:read"), "enabled"),
  task_create: definition("R3", scopes("worktree:manage", "git:refs:write"), "enabled"),
  task_list: definition("R0", scopes("git:read"), "enabled"),
  task_get: definition("R0", scopes("git:read"), "enabled"),
  task_merge_prepare_review: definition("R2", scopes("git:merge"), "enabled"),
  task_merge_prepare_finalize: definition("R3", scopes("git:merge", "git:refs:write"), "enabled"),
  task_merge_execute: definition("R3", scopes("git:merge", "git:refs:write", "filesystem:write"), "enabled"),
  task_remove: definition("R3", scopes("worktree:manage"), "enabled")
});

function operations(...values: GitOperationV4[]): readonly GitOperationV4[] {
  return Object.freeze(values);
}

const TOOL_OPERATIONS: Readonly<Record<string, readonly GitOperationV4[]>> = Object.freeze({
  git_log: operations("read"),
  git_branch: operations("read"),
  git_create_branch: operations("create_branch"),
  git_stage: operations("stage"),
  git_commit: operations("commit"),
  git_restore: operations("restore_review", "restore_execute"),
  git_stash: operations(
    "stash_list",
    "stash_create",
    "stash_apply_review",
    "stash_apply_execute",
    "stash_forget_review",
    "stash_forget_execute"
  ),
  create_task_worktree: operations("task_create_review", "task_create"),
  list_task_worktrees: operations("task_list"),
  get_task_worktree: operations("task_get"),
  merge_task_worktree: operations(
    "task_merge_prepare_review",
    "task_merge_prepare_finalize",
    "task_merge_execute"
  ),
  remove_task_worktree: operations("task_remove")
});

export function gitV4PolicyDefinition(
  toolName: string,
  operation?: GitOperationV4
): GitV4PolicyDefinition {
  const allowed = TOOL_OPERATIONS[toolName];
  if (!allowed) throw gateRError();
  const resolved = operation ?? (allowed.length === 1 ? allowed[0] : undefined);
  if (!resolved || !allowed.includes(resolved)) throw gateRError();
  return OPERATION_DEFINITIONS[resolved];
}

export function requiredScopesForGitV4Tool(
  toolName: string,
  operation?: GitOperationV4
): readonly PolicyScopeV4[] {
  return gitV4PolicyDefinition(toolName, operation).requiredScopes;
}

export function localGitApprovalSummaryV4(resource: GitResourceV4): LocalGitApprovalSummaryV4 {
  let parsed: GitResourceV4;
  try {
    parsed = gitResourceV4Schema.parse(resource);
  } catch {
    throw gateRError();
  }
  return Object.freeze({
    operation: parsed.operation,
    repositoryId: parsed.repositoryId,
    worktreeId: parsed.worktreeId,
    branchId: parsed.branchId,
    affectedPathCount: parsed.affectedPathCount,
    affectedByteCount: parsed.affectedByteCount,
    pathDigestCount: parsed.pathDigests.length,
    refDigestCount: parsed.refDigests.length,
    objectCount: parsed.objectIds.length,
    integrationMode: parsed.integrationMode,
    executionIsolation: parsed.executionIsolation,
    resourceFingerprint: parsed.resourceFingerprint
  });
}

export function createGitResourceV4(input: GitResourceV4Input): GitResourceV4 {
  const semantic = {
    schemaVersion: 4 as const,
    kind: "git_v4" as const,
    operation: input.operation as GitOperationV4,
    repositoryId: input.repositoryId,
    worktreeId: input.worktreeId,
    branchId: input.branchId,
    pathDigests: [...input.pathDigests].sort(),
    refDigests: [...input.refDigests].sort(),
    objectIds: [...input.objectIds].sort(),
    affectedPathCount: input.affectedPathCount,
    affectedByteCount: input.affectedByteCount,
    stateTokenFingerprint: input.stateTokenFingerprint,
    integrationMode: input.integrationMode,
    executionIsolation: input.executionIsolation
  };
  const resourceFingerprint = computeGitResourceV4Fingerprint(semantic);
  try {
    return Object.freeze(gitResourceV4Schema.parse({ ...semantic, resourceFingerprint }));
  } catch {
    throw gateRError();
  }
}

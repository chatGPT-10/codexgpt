import { buildBearerChallenge } from "./challenges.js";
import type { OAuthRequestContext } from "./requestContext.js";
import { KNOWN_OAUTH_SCOPES, type OAuthDeploymentIdentity, type OAuthScope } from "./types.js";

const WRITE_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "move_paths",
  "undo_change_set",
  "export_pro_context",
  "handoff_to_agent",
  "handoff_to_codex",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "git_restore",
  "git_stash",
  "create_task_worktree",
  "merge_task_worktree",
  "remove_task_worktree"
]);

const EXECUTE_TOOLS = new Set([
  "bash",
  "open_full_access_workspace",
  "run_command",
  "start_process",
  "read_process_output",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "list_processes"
]);

export interface OAuthToolSecurityRuntime {
  identity: OAuthDeploymentIdentity;
  enabledScopes: readonly OAuthScope[];
}

export interface OAuthToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  _meta?: { "mcp/www_authenticate": string[] };
}

function orderedScopes(scopes: ReadonlySet<OAuthScope>): OAuthScope[] {
  return KNOWN_OAUTH_SCOPES.filter((scope) => scopes.has(scope));
}

export function oauthScopesForTool(toolName: string): readonly OAuthScope[] {
  if (toolName === "codexgpt_self_test") {
    return Object.freeze(["codexgpt:read", "codexgpt:write", "codexgpt:execute"] as const);
  }
  if (EXECUTE_TOOLS.has(toolName)) {
    return Object.freeze(["codexgpt:read", "codexgpt:execute"] as const);
  }
  if (WRITE_TOOLS.has(toolName)) {
    return Object.freeze(["codexgpt:read", "codexgpt:write"] as const);
  }
  return Object.freeze(["codexgpt:read"] as const);
}

export function oauthSecuritySchemesForTool(toolName: string): readonly [{
  type: "oauth2";
  scopes: readonly OAuthScope[];
}] {
  return Object.freeze([Object.freeze({
    type: "oauth2" as const,
    scopes: oauthScopesForTool(toolName)
  })]);
}

export function requestedOAuthScopesForTool(input: {
  grantedScopes: readonly OAuthScope[];
  toolName: string;
  enabledScopes: readonly OAuthScope[];
}): readonly OAuthScope[] {
  const enabled = new Set(input.enabledScopes);
  const requested = new Set<OAuthScope>();
  for (const scope of input.grantedScopes) if (enabled.has(scope)) requested.add(scope);
  for (const scope of oauthScopesForTool(input.toolName)) if (enabled.has(scope)) requested.add(scope);
  return Object.freeze(orderedScopes(requested));
}

function disabledScopeAction(scope: OAuthScope): string {
  if (scope === "codexgpt:write") {
    return "Enable writable filesystem or local Git capability in the local profile, then restart CodexGPT.";
  }
  if (scope === "codexgpt:execute") {
    return "Enable shell or process execution in the local profile, then restart CodexGPT.";
  }
  return "Enable read capability in the local profile, then restart CodexGPT.";
}

export function enforceOAuthToolScopes(input: {
  toolName: string;
  context: Readonly<OAuthRequestContext>;
  runtime: OAuthToolSecurityRuntime;
}): OAuthToolCallResult | null {
  const required = oauthScopesForTool(input.toolName);
  const enabled = new Set(input.runtime.enabledScopes);
  const disabled = required.find((scope) => !enabled.has(scope));
  if (disabled) {
    return {
      content: [{
        type: "text",
        text: `CodexGPT denied this capability because ${disabled} is disabled by the current local profile.\nNext: ${disabledScopeAction(disabled)}`
      }],
      isError: true
    };
  }

  const granted = new Set(input.context.scopes);
  if (required.every((scope) => granted.has(scope))) return null;
  const challengeScopes = requestedOAuthScopesForTool({
    grantedScopes: input.context.scopes,
    toolName: input.toolName,
    enabledScopes: input.runtime.enabledScopes
  });
  const challenge = buildBearerChallenge({
    identity: input.runtime.identity,
    scopes: challengeScopes,
    kind: "insufficient_scope"
  });
  return {
    content: [{ type: "text", text: "Reconnect to allow this capability." }],
    isError: true,
    _meta: {
      "mcp/www_authenticate": [challenge]
    }
  };
}

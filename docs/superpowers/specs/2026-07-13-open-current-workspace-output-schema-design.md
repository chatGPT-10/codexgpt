# `open_current_workspace` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, twelfth vertical slice
Status: Locally implemented and verified; not staged, committed, pushed, or CI-published

## 1. Goal

Migrate only the direct `open_current_workspace` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, focused contract tests, Tool Card compatibility, and `codexpro` wrapper compatibility.

The slice preserves the current configured-default-workspace workflow, deterministic workspace identifier, optional compact tree, optional workspace/global skill discovery, root AGENTS discovery, Git status and recent-commit human summary, current tool-mode registration, and existing Windows path and allowed-root policies.

This slice stabilizes the protocol around the existing workspace-opening implementation. It does not redesign workspace identity, add session ownership or expiry, require explicit `workspace_id`, migrate `open_workspace` or `workspace_snapshot`, or begin Phase 2.

## 2. Why `open_current_workspace` is the recommended next slice

The first eleven Phase 1 slices stabilize configuration plus the core inspect, search, edit, Git-review, patch, and verification path. `open_current_workspace` is now the highest-value unmigrated direct tool because the server instructions require it at the start of every normal CodexPro session, and it is exposed in minimal, standard, and full tool modes.

Stabilizing it now gives every new session a trustworthy entry contract before lower-frequency inventory, handoff, snapshot, or optional Codex-session tools are migrated.

Three approaches were considered.

### Approach A — Migrate direct `open_current_workspace` only

Add one exact schema module, one injectable summary-provider boundary around the existing `workspaceSummary`, safe failure classification, nested Tool Card consumption, wrapper compatibility, and contract tests.

Advantages:

- stabilizes the mandatory startup tool in all tool modes;
- follows the proven one-tool Phase 1 migration pattern;
- preserves current workspace behavior and permissions;
- remains independently reversible;
- avoids coupling protocol work to Phase 2 workspace lifecycle changes.

This is the selected approach.

### Approach B — Migrate `open_current_workspace` and `open_workspace` together

The two tools currently return nearly identical summaries, so they could share a schema and implementation changes.

This is rejected because `open_workspace` accepts an arbitrary root or path alias and therefore has a wider argument, path-policy, and error-classification surface. Combining both tools would double the slice boundary and make rollback less precise. A later slice may reuse or extract common schema components after both contracts are independently understood.

### Approach C — Migrate a smaller auxiliary tool first

`list_workspaces` or `read_handoff` would require fewer fields and less validation.

This is rejected because `list_workspaces` is full-mode only and `read_handoff` is auxiliary. Neither improves the mandatory session-start path as much as `open_current_workspace`.

## 3. Scope

### In scope

- Direct `open_current_workspace` tool only.
- Exact advertised `outputSchema`.
- Strict schema-v1 success and failure envelopes.
- Preservation of the current twelve public success fields under nested `data`.
- Normalization of absent `agents_path` and `tree` to explicit `null`.
- Normalization of absent skill descriptions to explicit `null`.
- One injectable `openCurrentWorkspaceSummaryProvider` for deterministic handler contract tests.
- Strict provider-result validation and cross-field consistency checks.
- Stable safe public failure codes and fixed messages.
- Existing human-readable workspace summary, including recent commits in MCP text only.
- Dedicated nested-envelope handling in the shared workspace Tool Card renderer without changing unmigrated workspace tools.
- `codexpro` supertool `open` alias compatibility.
- Focused `node:test` contract coverage.
- Smoke, HTTP Smoke, and Stress updates only where they inspect the old flat structured result.
- Documentation, changelog, project memory, and active Phase 1 archive updates during implementation.

### Out of scope

- Direct `open_workspace`, `list_workspaces`, `workspace_snapshot`, `inspect_workspace`, or any other tool.
- Random session-scoped workspace identifiers, `workspaceKey`, workspace ownership, expiration, close operations, persistence, or client isolation.
- Requiring explicit `workspace_id` on other tools.
- Changes to allowed roots, canonicalization, Windows path policy, symlink/junction handling, blocked globs, or workspace ID derivation.
- Changes to AGENTS precedence, instruction trust, nested AGENTS chains, or prompt-injection policy.
- Changes to skill discovery roots, trust levels, manifests, hashes, permissions, enablement, or maximum inventory size.
- Changes to Git commands, Git failure detection, recent-commit count, or non-Git-workspace behavior.
- Partial-success warnings for tree, skill, AGENTS, or Git suboperations.
- Authentication, dependencies, shell behavior, process management, atomic editing, audit logging, or Phase 2 implementation.

## 4. Result semantics

`ok` answers whether CodexPro opened the configured default root and produced a valid, internally consistent workspace summary.

- `ok: true`: the default workspace was opened and all structured fields passed strict validation.
- `ok: false`: the configured default root could not be opened safely, or the summary/provider result could not be trusted.

A workspace does not need to be a Git repository. Existing Git commands return bounded text diagnostics rather than throwing for a non-Git directory, so a non-Git workspace remains `ok: true` with that bounded text in `data.git_status` and in the human summary.

Optional tree and skill discovery are request-controlled data, not separate tool outcomes. Schema version 1 preserves the current all-or-nothing handler flow rather than introducing partial success or new warning semantics.

## 5. Public success contract

```json
{
  "codexpro_tool": "open_current_workspace",
  "codexpro_title": "Open Current Workspace",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "agents_loaded": true,
    "agents_path": "AGENTS.md",
    "skills": ["brainstorming"],
    "skill_inventory": [
      {
        "name": "brainstorming",
        "description": "Explore requirements before implementation.",
        "source": "workspace",
        "path": "$WORKSPACE/.codex/skills/brainstorming/SKILL.md"
      }
    ],
    "skill_counts": {
      "total": 1,
      "workspace": 1,
      "user": 0,
      "plugin": 0,
      "other": 0
    },
    "tree": null,
    "git_status": "## main...origin/main",
    "bash_mode": "full",
    "write_mode": "workspace",
    "tool_mode": "standard"
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 12,
    "warnings": []
  }
}
```

### Success data fields

1. `workspace_id`: non-empty identifier returned by the existing `WorkspaceManager`.
2. `root`: non-empty canonical default workspace root.
3. `agents_loaded`: whether a root AGENTS-style file was discovered.
4. `agents_path`: normalized workspace-relative AGENTS path, or `null`.
5. `skills`: skill names in the existing provider order. Duplicate names from different sources remain possible and are preserved.
6. `skill_inventory`: strict skill inventory records in the existing provider order.
7. `skill_counts`: exact counts for `total`, `workspace`, `user`, `plugin`, and `other`.
8. `tree`: compact tree text when requested, otherwise `null`.
9. `git_status`: bounded redacted Git status text returned by the current summary provider.
10. `bash_mode`: exactly `off`, `safe`, or `full`.
11. `write_mode`: exactly `off`, `handoff`, or `workspace`.
12. `tool_mode`: exactly `minimal`, `standard`, or `full`.

Unknown fields are rejected. All twelve fields live only under `data`.

The current human summary also contains recent Git commits. Recent commits remain MCP `content` only because the existing structured result does not expose them. This slice does not add a `git_log`, `recent_commits`, `opened_at`, `workspace_key`, `expires_at`, `capabilities`, or instruction-content field.

### Nullable normalization

- When no AGENTS file is found, `agents_loaded` is `false` and `agents_path` is `null`.
- When `include_tree=false`, `tree` is `null`.
- A skill inventory item without frontmatter description uses `description: null` rather than omitting the field.
- When `include_skills=false`, `skills` and `skill_inventory` are empty and every `skill_counts` value is zero.

## 6. Skill inventory contract

Each `skill_inventory` item is strict and contains exactly:

```ts
{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}
```

The slice preserves current display-path behavior such as `$WORKSPACE/...` and `~/...`. It does not expose the internal absolute `absPath` used during discovery.

The handler validates that:

- every name and path is non-empty;
- every source belongs to the fixed enum;
- `skills` exactly equals `skill_inventory.map((item) => item.name)` in length, order, and values;
- `skill_counts.total` equals the inventory length;
- each source count exactly equals the number of matching inventory records;
- the five count keys are present and no unknown count keys exist.

## 7. Internal provider contract

Add:

```ts
export interface OpenCurrentWorkspaceSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: {
    includeTree: boolean;
    maxDepth: number;
    includeSkills: boolean;
    includeGlobalSkills: boolean;
  };
}
```

Extend `CodexProServerDependencies` with:

```ts
openCurrentWorkspaceSummaryProvider?: (
  context: OpenCurrentWorkspaceSummaryProviderContext
) => WorkspaceSummary | Promise<WorkspaceSummary>;
```

The production provider calls the existing `workspaceSummary` with `bootstrapContext: false`. Contract tests inject deterministic providers. No production test mode, hidden MCP argument, environment switch, or global mutable override is allowed.

The strict provider result contains exactly the current `WorkspaceSummary` fields:

```ts
{
  text: string;
  workspaceId: string;
  root: string;
  agentsLoaded: boolean;
  agentsPath?: string;
  skills: string[];
  skillInventory: SkillInventoryItem[];
  skillCounts: Record<string, number>;
  tree?: string;
  gitStatus: string;
}
```

Provider validation requires non-empty `text`, `workspaceId`, `root`, and `gitStatus`; valid skill records; non-negative integer counts; optional non-empty `agentsPath` and `tree`; and no unknown fields.

After provider parsing, the handler must verify:

1. returned `workspaceId` exactly equals the workspace opened by `defaultWorkspace()`;
2. returned `root` exactly equals that workspace's canonical root;
3. `agentsLoaded` exactly matches the presence of `agentsPath`;
4. a returned `agentsPath` resolves safely inside the workspace and is already normalized to the same relative path;
5. `skills` exactly matches the inventory names in order;
6. all skill counts exactly match the inventory;
7. when `include_skills=false`, skills, inventory, and counts are all empty/zero;
8. when `include_tree=false`, the provider does not return tree data;
9. when `include_tree=true`, the provider returns non-empty tree text;
10. mode fields are taken from current server configuration rather than trusted from the provider.

Malformed provider results or any identity, path, count, inclusion, or cross-field mismatch become `INTERNAL_ERROR`.

## 8. Public failure contract

```json
{
  "codexpro_tool": "open_current_workspace",
  "codexpro_title": "Open Current Workspace",
  "ok": false,
  "data": null,
  "error": {
    "code": "DEFAULT_ROOT_NOT_FOUND",
    "message": "The configured default workspace root does not exist.",
    "retryable": false,
    "details": {
      "source": "configured_default_root"
    }
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 1,
    "warnings": []
  }
}
```

Approved schema-v1 errors:

1. `DEFAULT_ROOT_NOT_FOUND`
2. `DEFAULT_ROOT_NOT_DIRECTORY`
3. `ROOT_NOT_ALLOWED`
4. `WORKSPACE_OPEN_FAILED`
5. `INTERNAL_ERROR`

All are non-retryable in schema version 1. Each requires a configuration, filesystem, policy, or implementation change rather than an automatic replay of the same startup request.

There is no `WORKSPACE_NOT_FOUND` error because `open_current_workspace` accepts no workspace identifier.

There is no `INVALID_ARGUMENT` error because all request arguments are booleans or schema-bounded integers and require no additional semantic validation inside the handler.

There is no `GIT_NOT_REPOSITORY` error because non-Git directories remain valid workspaces.

### Fixed public messages

- `DEFAULT_ROOT_NOT_FOUND`: `The configured default workspace root does not exist.`
- `DEFAULT_ROOT_NOT_DIRECTORY`: `The configured default workspace root is not a directory.`
- `ROOT_NOT_ALLOWED`: `The configured default workspace root is outside the allowed roots.`
- `WORKSPACE_OPEN_FAILED`: `The configured default workspace could not be opened.`
- `INTERNAL_ERROR`: `The current workspace summary failed because of an internal error.`

### Error details

- The first four errors use exactly `{ source: "configured_default_root" }`.
- `INTERNAL_ERROR` uses a strict empty object.

The configured absolute root, allowed-root list, skill paths beyond already sanitized successful inventory paths, Git diagnostics, operating-system diagnostics, stack traces, exception names, and secret-looking values are never included in public failure fields or failure MCP text.

## 9. Failure classification

The direct handler catches every failure and maps it as follows:

- current `WorkspaceManager` missing-root diagnostic -> `DEFAULT_ROOT_NOT_FOUND`;
- current non-directory diagnostic -> `DEFAULT_ROOT_NOT_DIRECTORY`;
- current allowed-root rejection -> `ROOT_NOT_ALLOWED`;
- filesystem open/realpath failures with expected access or transient operating-system codes such as `EACCES`, `EPERM`, or `EBUSY`, when no more specific classification applies -> `WORKSPACE_OPEN_FAILED`;
- malformed provider data, workspace/root mismatch, unsafe or non-normalized AGENTS path, skill-name/count mismatch, request-inclusion mismatch, unexpected summary exception, and unclassified conditions -> `INTERNAL_ERROR`.

Classification may inspect current internal `CodexProError` prefixes and Node error codes, but only fixed public messages and strict details leave the handler. This slice does not create a project-wide typed workspace error hierarchy or modify `WorkspaceManager` and `workspaceSummary` algorithms.

## 10. Handler flow

The direct handler follows this order:

1. Record the handler start time.
2. Parse `include_tree`, `max_depth`, `include_skills`, and `include_global_skills` using current defaults and bounds.
3. Open or retrieve the configured default workspace through the existing `defaultWorkspace()`.
4. Call the injected or production summary provider with the exact normalized options and `bootstrapContext: false` in production.
5. Strictly parse the provider result.
6. Validate workspace identity, root identity, AGENTS consistency/path safety, skill names/counts, and requested inclusion behavior.
7. Normalize optional values to explicit `null` and skill descriptions to explicit `null`.
8. Construct strict `OpenCurrentWorkspaceData`, taking mode values from server configuration.
9. Preserve the provider's existing human-readable summary text.
10. Return `createOpenCurrentWorkspaceSuccess(data)`.
11. On failure, classify it, return `createOpenCurrentWorkspaceFailure(failure)`, and set `isError: true`.

The provider is called only after the configured default workspace is safely opened. No cache invalidation, file write, `.ai-bridge` bootstrap, shell command, or new workspace lifecycle action is introduced.

## 11. Human-readable MCP content

Successful MCP text remains the current workspace summary:

```text
# Workspace

Workspace: ws_...
Root: D:\Dev\codexpro
Bash mode: full
Write mode: workspace
Tool mode: standard

AGENTS.md: AGENTS.md (read this file before editing or making project decisions).
Skills: skipped. Pass include_skills=true if skill discovery is needed.

## Git status

## main...origin/main

## Recent commits

...
```

When requested, the existing `## Files` tree section remains present. The full AGENTS contents and full skill bodies are not added.

Failure text becomes fixed and safe:

```text
# Open Current Workspace Error

Code: DEFAULT_ROOT_NOT_FOUND
The configured default workspace root does not exist.
```

Raw internal diagnostics are not repeated.

## 12. Tool Card and wrapper consumers

The shared workspace Tool Card currently reads flat fields for `open_current_workspace`, `open_workspace`, and `workspace_snapshot`. Update it without breaking the two unmigrated tools:

- for migrated `open_current_workspace` success, read workspace fields from `data.data`;
- for migrated failure, show only the stable error code and fixed public message;
- for unmigrated `open_workspace` and `workspace_snapshot`, retain the current flat-field path;
- update the subtitle logic using the same compatibility normalization;
- preserve bounded tree, skill, root, workspace-id, mode, AGENTS, and Git-status rendering.

The `codexpro` supertool `open` alias continues to preserve the child structured result and adds only wrapper identity fields. It must not flatten `data`, overwrite `ok/error/meta`, or restore legacy top-level workspace fields.

## 13. Contract tests

Add `test/open-current-workspace-contract.test.mjs` covering at least:

1. registration advertises the exact `outputSchema` in minimal, standard, and full modes;
2. success constructor accepts the exact twelve-field nested data object;
3. strict top-level, data, skill-item, and count-object unknown-field rejection;
4. success requires non-null `data`, null `error`, and exact mode enums;
5. failure requires null `data` and one approved non-null error;
6. all five stable errors validate with fixed messages and exact details;
7. `agents_path` and `tree` are explicit nullable fields;
8. skill descriptions normalize to `null`;
9. `include_tree=false` returns `tree: null` and `include_tree=true` returns bounded tree text;
10. `include_skills=false` returns empty arrays and zero counts;
11. requested workspace-only skill discovery remains workspace-only;
12. `include_global_skills=true` preserves sanitized user/plugin inventory without exposing internal absolute paths beyond current display-path behavior;
13. provider workspace-id or root mismatch returns fixed `INTERNAL_ERROR`;
14. AGENTS loaded/path inconsistency or unsafe/non-normalized path returns fixed `INTERNAL_ERROR`;
15. skill names, order, source counts, or total-count mismatch returns fixed `INTERNAL_ERROR`;
16. tree inclusion mismatch returns fixed `INTERNAL_ERROR`;
17. missing default root returns `DEFAULT_ROOT_NOT_FOUND` without exposing the path;
18. default root that is a file returns `DEFAULT_ROOT_NOT_DIRECTORY`;
19. default root outside allowed roots returns `ROOT_NOT_ALLOWED`;
20. malformed provider data and unclassified rejection return fixed `INTERNAL_ERROR` without raw diagnostics;
21. human success content retains Git status/recent commits and optional tree behavior;
22. failure content contains only the fixed code and message;
23. Tool Card renders the nested direct result while unmigrated workspace cards remain compatible;
24. the `codexpro` `open` alias preserves the nested child envelope.

Update existing Smoke, HTTP Smoke, and Stress assertions from flat fields such as `structuredContent.root`, `tool_mode`, `skills`, and `skill_inventory` to `structuredContent.data.*` only for direct or wrapped `open_current_workspace` results.

Existing real coverage remains authoritative for:

- current default-root canonicalization;
- deterministic workspace identity;
- workspace skill discovery;
- rejection of a symlinked workspace skill root escaping the workspace;
- tool-mode availability;
- direct and supertool startup calls;
- native Windows and Ubuntu behavior.

## 14. Expected implementation boundary

Expected production/test files:

- `src/tools/schemas/openCurrentWorkspace.ts` — exact data, error, output, and constructor schemas.
- `src/server.ts` — imports, provider interface/dependency, classifier, strict handler flow, and exact descriptor schema.
- `src/toolCardWidget.ts` — nested migrated workspace result plus flat unmigrated compatibility.
- `test/open-current-workspace-contract.test.mjs` — focused TDD contracts.
- `scripts/smoke.mjs` — direct/wrapped startup consumer updates.
- `scripts/http-smoke.mjs` — HTTP startup consumer updates.
- `scripts/stress.mjs` — repeated direct/wrapped startup consumer updates.
- `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, active Phase 1 archive, design, and later implementation plan/record as required.

No dependency, profile, credential, CI workflow, package version, transport, `WorkspaceManager`, `workspaceOps.ts`, `guard.ts`, `gitOps.ts`, or Phase 2 file is expected to change unless implementation proves a narrowly documented contract blocker.

## 15. Verification strategy

Implementation must run, in order:

```text
node --test test/open-current-workspace-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Also verify:

- no secret-looking values were added;
- only intended files changed;
- no existing flat workspace-card path broke `open_workspace` or `workspace_snapshot`;
- exact-head Ubuntu/Windows Node 20/24 CI passes after explicit publication approval.

## 16. Rollback

The slice is independently reversible:

1. revert consumer changes;
2. revert direct handler/provider/classifier changes;
3. revert the new schema and focused contract test;
4. revert documentation and memory records;
5. rerun the complete local gates.

Rollback does not require changing user profiles, credentials, allowed roots, workspaces, dependencies, prior Phase 1 schema modules, or Git history outside normal revert commits.

## 17. Acceptance criteria

The slice is complete only when:

- direct `open_current_workspace` advertises an exact strict `outputSchema`;
- every successful structured result validates and contains only identity, `ok`, `data`, `error`, and `meta` at top level;
- the twelve success fields live only under `data`;
- absent AGENTS/tree/description values are explicit `null`;
- provider identity, path, skill, count, and inclusion mismatches fail closed;
- all five approved failures use fixed non-retryable safe contracts;
- raw filesystem, path-policy, Git, provider, and operating-system diagnostics do not escape failure results;
- human MCP content preserves current successful startup information;
- Tool Card and supertool consumers use the nested contract without breaking unmigrated workspace tools;
- focused, adjacent, full regression, Build, Smoke, Stress, diff, secret, and change-scope gates pass;
- project memory and active Phase 1 archive record exact evidence;
- Phase 2 remains closed.

## 18. Approved decisions

- The twelfth Phase 1 slice is direct `open_current_workspace` only.
- The current deterministic `workspace_id` remains unchanged.
- Success data has exactly twelve fields.
- `agents_path`, `tree`, and skill `description` use explicit `null` when absent.
- Recent commits remain human content only.
- Non-Git workspaces remain successful openings.
- Five fixed non-retryable errors cover default-root opening and internal validation failures.
- The provider boundary is tool-specific for this slice; no premature shared workspace-summary abstraction is introduced.
- Optional summary suboperations do not gain partial-success warnings in schema version 1.
- `open_workspace`, workspace lifecycle, authentication, dependencies, and Phase 2 remain out of scope.

## 19. Current stopping point

The design has been implemented locally with a strict schema module, tool-specific provider validation, fixed safe failures, nested Tool Card/supertool compatibility, and migrated Smoke/HTTP Smoke/Stress consumers. Final local evidence includes focused 13/13, complete regression 202/202, Build, Smoke 8/8, and native-Windows Stress. `neat-freak` reconciliation is complete, and the user has authorized staging, commit, and push. Exact-head cross-platform CI must be verified after publication; credential/access changes and Phase 2 remain closed.

# `open_workspace` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, thirteenth vertical slice
Status: Published and cross-platform CI-validated

## 1. Goal

Migrate only the direct `open_workspace` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public failures, focused contract tests, Tool Card compatibility, and `codexpro` wrapper compatibility.

The slice preserves the current ability to open an explicitly selected local directory or the configured default root, deterministic workspace identifiers, allowed-root and Windows path enforcement, existing-workspace reuse, optional compact tree generation, optional workspace/global skill discovery, root AGENTS discovery, Git status and recent-commit human summary, and registration in minimal, standard, and full tool modes.

This slice stabilizes the existing direct tool protocol. It does not redesign workspace identity, add ownership or expiry, add `close_workspace`, change allowed roots, migrate `list_workspaces` or `workspace_snapshot`, or begin Phase 2.

## 2. Why `open_workspace` is the recommended next slice

The first twelve Phase 1 slices now cover server configuration, core inspection and editing, Git review, Bash verification, and the preferred default-root entry point `open_current_workspace`.

`open_workspace` is the next highest-value unmigrated direct tool because it is the supported path for switching to another authorized root and is registered in every tool mode. It also shares the same twelve-field workspace summary shape as `open_current_workspace`, allowing the previous slice's lessons to be applied while keeping the wider input and path-policy surface independently reviewable.

Three approaches were considered.

### Approach A — Migrate direct `open_workspace` as one independent slice

Add one exact tool schema module, one dedicated injectable summary-provider boundary, deterministic root-alias normalization, stage-aware safe failure classification, nested Tool Card consumption, wrapper compatibility, and focused contract tests.

Advantages:

- stabilizes the authorized root-switching path in every tool mode;
- preserves the established one-tool Phase 1 migration pattern;
- keeps input/path failures separate from summary-provider failures;
- remains independently reversible;
- avoids changing the already published `open_current_workspace` contract;
- keeps Phase 2 workspace lifecycle work closed.

This is the selected approach.

### Approach B — Extract shared workspace-summary schemas before migration

Move the twelve-field data shape, skill records, provider parser, and cross-field validation into a new shared workspace schema module, then refactor `open_current_workspace` and implement `open_workspace` against it.

This is rejected for this slice because it would modify a published and CI-validated tool while migrating another tool. It would broaden rollback, make failures harder to attribute, and conflict with the current rule that each migrated tool owns one exact schema module plus the established shared `common.ts` primitives.

Some deliberate duplication is preferable to premature protocol coupling. A later explicitly reviewed refactor may extract common definitions after both direct contracts are published.

### Approach C — Migrate all workspace inventory tools together

Combine `open_workspace`, `list_workspaces`, and `workspace_snapshot` into one larger workspace-contract project.

This is rejected because those tools have different semantics and error surfaces. `list_workspaces` exposes process-local inventory, while `workspace_snapshot` adds AI handoff context. Combining them would cross multiple feature boundaries and make the slice unnecessarily large.

## 3. Current behavior being stabilized

The current direct tool:

1. accepts optional `root` and `path` aliases;
2. rejects two truthy aliases only when their raw strings differ;
3. opens the selected value through `WorkspaceManager.openWorkspace()`;
4. falls back to the configured default root when no effective value is supplied;
5. reuses an already opened workspace with the same canonical root;
6. returns a flat twelve-field structured result;
7. defaults `include_tree` to `true`, depth to `3`, and maximum entries to `500`;
8. defaults skill discovery and global skill discovery to `false`;
9. accepts deprecated `bootstrap_context` but ignores it;
10. has no exact advertised `outputSchema` and no stable tool-specific failure envelope.

One existing alias edge case is intentionally corrected: a blank `root` can currently shadow a non-empty `path` because nullish selection happens after a truthiness-based conflict check. The new resolver trims both aliases first and treats blank strings as absent.

## 4. Scope

### In scope

- Direct `open_workspace` tool only.
- Exact advertised `outputSchema` in minimal, standard, and full modes.
- Strict schema-v1 success and failure envelopes.
- Preservation of the current twelve public success fields under nested `data`.
- Explicit `null` normalization for absent `agents_path` and `tree`.
- Explicit `null` normalization for absent skill descriptions.
- Deterministic `root` / `path` alias normalization.
- Blank aliases treated as absent.
- One stable alias-conflict failure when both effective aliases differ.
- Stage-aware separation of root-opening failures from summary/provider failures.
- One injectable `openWorkspaceSummaryProvider` for deterministic contract tests.
- Strict provider-result validation and cross-field consistency checks.
- Existing human-readable workspace summary, including recent commits in MCP text only.
- Nested-envelope handling in the shared workspace Tool Card renderer while retaining flat-result fallback.
- Direct registered-name compatibility through the `codexpro` supertool.
- Focused `node:test` contract coverage.
- Smoke, HTTP Smoke, and Stress updates where they currently read the flat result.
- Documentation, changelog, project memory, and active Phase 1 archive updates during implementation.

### Out of scope

- Direct `open_current_workspace`, `list_workspaces`, `workspace_snapshot`, `inspect_workspace`, or any other tool.
- Extraction of shared workspace-summary schema modules.
- Random session-scoped workspace identifiers, `workspaceKey`, ownership, expiration, close operations, persistence, or client isolation.
- Changes to deterministic workspace ID derivation or existing-workspace reuse.
- Requiring explicit `workspace_id` on other tools.
- Changes to configured allowed roots, canonicalization, Windows path policy, symlink/junction handling, or blocked globs.
- Changes to AGENTS precedence, nested instruction chains, trust, or prompt-injection policy.
- Changes to skill discovery roots, trust levels, manifests, hashes, permissions, enablement, or inventory limits.
- Changes to Git commands, recent-commit count, or non-Git-workspace behavior.
- Creation of `.ai-bridge` content from `bootstrap_context`.
- Partial-success warnings for tree, skill, AGENTS, or Git suboperations.
- Authentication, dependencies, shell behavior, process management, atomic editing, audit logging, or Phase 2 implementation.

## 5. Input resolution contract

The public input schema remains compatible:

```ts
{
  root?: string;
  path?: string;
  include_tree?: boolean;
  max_depth?: number;       // 1..8
  max_files?: number;       // 1..3000
  include_skills?: boolean;
  include_global_skills?: boolean;
  bootstrap_context?: boolean; // deprecated and ignored
}
```

### Root alias normalization

The handler resolves the selected root before calling `WorkspaceManager`:

```ts
const normalizedRoot = args.root?.trim() || undefined;
const normalizedPath = args.path?.trim() || undefined;

if (normalizedRoot && normalizedPath && normalizedRoot !== normalizedPath) {
  // ROOT_ALIAS_CONFLICT
}

const requestedRoot = normalizedRoot ?? normalizedPath;
const source = normalizedRoot
  ? "root"
  : normalizedPath
    ? "path"
    : "configured_default_root";
```

Rules:

1. Leading and trailing whitespace is removed from each alias.
2. A blank or whitespace-only value is treated as absent.
3. When both effective aliases exist, they must be identical after trimming.
4. When both effective aliases match, `root` is the recorded source.
5. When only `path` is effective, it is selected even if `root` was supplied as blank.
6. When neither alias is effective, `WorkspaceManager` opens the configured default root.
7. The aliases are not independently canonicalized before conflict detection. Two different spellings such as `~/repo` and an expanded absolute path remain conflicting when both are sent. Clients should send one alias, not two separate claims.

This is the only deliberate user-visible input correction in the slice.

### Option defaults

- `include_tree`: `true`.
- `max_depth`: `3`, bounded to `1..8` by the public schema and existing internal limiter.
- `max_files`: `500`, bounded to `1..3000`.
- `include_skills`: `false`.
- `include_global_skills`: `false`.
- `bootstrap_context`: accepted and ignored regardless of value.

`bootstrap_context` must not create `.ai-bridge`, mutate the workspace, or alter the result.

## 6. Result semantics

`ok` answers whether CodexPro opened the selected authorized root and produced a valid, internally consistent workspace summary.

- `ok: true`: the selected root was opened or reused and every structured field passed strict validation.
- `ok: false`: aliases conflicted, the selected root was invalid or could not be opened safely, or the summary/provider result could not be trusted.

Opening a workspace changes process-local registry state, so the existing `SESSION_READ_ANNOTATIONS` remain correct: the tool is locally read-only but not declared idempotent.

A workspace does not need to be a Git repository. Existing Git helpers return bounded text diagnostics for a non-Git directory, so a non-Git workspace remains `ok: true` with that bounded text in `data.git_status` and the human summary.

Optional tree and skill discovery remain request-controlled data, not independent outcomes. Schema version 1 keeps the current all-or-nothing summary flow and does not introduce partial success.

## 7. Public success contract

```json
{
  "codexpro_tool": "open_workspace",
  "codexpro_title": "Open Workspace",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\project",
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
    "tree": ".\n├── package.json",
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

1. `workspace_id`: non-empty deterministic identifier returned by the existing `WorkspaceManager`.
2. `root`: non-empty canonical root returned by the existing manager.
3. `agents_loaded`: whether a root AGENTS-style file was discovered.
4. `agents_path`: normalized workspace-relative AGENTS path, or `null`.
5. `skills`: skill names in provider order. Duplicate names from different sources remain possible and are preserved.
6. `skill_inventory`: strict skill inventory records in provider order.
7. `skill_counts`: exact counts for `total`, `workspace`, `user`, `plugin`, and `other`.
8. `tree`: compact tree text when requested, otherwise `null`.
9. `git_status`: bounded redacted Git status text returned by the existing summary provider.
10. `bash_mode`: exactly `off`, `safe`, or `full`.
11. `write_mode`: exactly `off`, `handoff`, or `workspace`.
12. `tool_mode`: exactly `minimal`, `standard`, or `full`.

Unknown fields are rejected. All twelve fields live only under `data`.

The human summary continues to contain recent Git commits. Recent commits remain MCP `content` only because the current structured result does not expose them. This slice does not add `opened_at`, `git_log`, `recent_commits`, `workspace_key`, `expires_at`, `capabilities`, or instruction content.

### Nullable normalization

- No AGENTS file: `agents_loaded: false`, `agents_path: null`.
- `include_tree=false`: `tree: null`.
- Skill without frontmatter description: `description: null`.
- `include_skills=false`: empty `skills`, empty `skill_inventory`, and all five `skill_counts` values equal zero.

## 8. Skill inventory contract

Each `skill_inventory` item is strict and contains exactly:

```ts
{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}
```

The contract preserves current sanitized display paths such as `$WORKSPACE/...` and `~/...`. It does not expose discovery-time absolute paths.

The handler validates that:

- every name and path is non-empty;
- every source belongs to the fixed enum;
- `skills` exactly equals `skill_inventory.map((item) => item.name)` in length, order, and value;
- `skill_counts.total` equals inventory length;
- every source count equals the matching inventory count;
- the five count keys are present and no unknown keys exist.

## 9. Schema ownership

Create:

```text
src/tools/schemas/openWorkspace.ts
```

The module owns:

- `OPEN_WORKSPACE_ERROR_MESSAGES`;
- exact skill item and skill-count schemas for this tool;
- exact twelve-field data schema;
- exact discriminated failure schema;
- exact top-level output shape and strict envelope schema;
- success and failure constructors;
- exported input types needed by the handler and tests.

It imports only shared meta primitives from `src/tools/schemas/common.ts`.

It must not import its data or failure schema from `openCurrentWorkspace.ts`, and the published `open_current_workspace` module must not be changed merely to reduce duplication.

## 10. Internal provider contract

Add:

```ts
export interface OpenWorkspaceSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: {
    includeTree: boolean;
    maxDepth: number;
    maxEntries: number;
    includeSkills: boolean;
    includeGlobalSkills: boolean;
  };
}
```

Extend `CodexProServerDependencies` with:

```ts
openWorkspaceSummaryProvider?: (
  context: OpenWorkspaceSummaryProviderContext
) => WorkspaceSummary | Promise<WorkspaceSummary>;
```

The production provider calls the existing `workspaceSummary` with `bootstrapContext: false`. Contract tests inject deterministic providers. No production test mode, hidden MCP argument, environment switch, or global mutable override is allowed.

The provider result is parsed as the current strict `WorkspaceSummary` shape:

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

Provider parsing requires non-empty `text`, `workspaceId`, `root`, and `gitStatus`; valid strict skill records; non-negative integer counts; optional non-empty `agentsPath` and `tree`; and no unknown fields.

After parsing, the handler verifies:

1. returned `workspaceId` exactly equals the manager-opened workspace ID;
2. returned `root` exactly equals the manager-opened canonical root;
3. `agentsLoaded` exactly matches `Boolean(agentsPath)`;
4. returned `agentsPath` resolves safely inside the workspace and is already normalized;
5. `skills` exactly matches inventory names in order;
6. all five counts exactly match inventory contents;
7. when `include_skills=false`, skills, inventory, and counts are empty/zero;
8. when `include_tree=false`, no tree is returned;
9. when `include_tree=true`, non-empty tree text is returned;
10. mode fields are taken from current server configuration, never trusted from the provider.

Malformed provider output or any identity, path, count, inclusion, or cross-field mismatch becomes `INTERNAL_ERROR`.

## 11. Stage-aware failure handling

The handler separates two phases:

### Phase A — Resolve aliases and open the root

- normalize `root` and `path`;
- determine the safe source enum;
- reject an alias conflict;
- call `WorkspaceManager.openWorkspace()`;
- classify only errors thrown during this phase as root-input or root-opening failures.

### Phase B — Build and validate the summary

- invoke `openWorkspaceSummaryProvider`;
- parse the provider result;
- run identity and cross-field validation;
- build the exact success envelope.

Any failure in Phase B becomes `INTERNAL_ERROR`, even when an underlying provider exception happens to carry a filesystem code such as `ENOENT`. This prevents a disappearing tree entry, AGENTS file, skill file, or other summary-time race from being misreported as “workspace root not found.”

No raw exception text, stack, root path, allowed-root list, or provider diagnostic enters the public structured failure.

## 12. Public failure contract

All failures are non-retryable in schema version 1.

### 12.1 `ROOT_ALIAS_CONFLICT`

```json
{
  "code": "ROOT_ALIAS_CONFLICT",
  "message": "The root and path arguments identify different workspace roots.",
  "retryable": false,
  "details": {
    "fields": ["root", "path"]
  }
}
```

Used when both effective aliases remain non-empty after trimming and differ.

### 12.2 `ROOT_PATH_INVALID`

```json
{
  "code": "ROOT_PATH_INVALID",
  "message": "The requested workspace root is not a valid local workspace path.",
  "retryable": false,
  "details": {
    "source": "root"
  }
}
```

Used for the existing path-policy rejections, including null bytes and Windows device, UNC, drive-relative, alternate-data-stream, reserved-name, and trailing-dot/space forms.

### 12.3 `ROOT_NOT_FOUND`

Message: `The requested workspace root does not exist.`

### 12.4 `ROOT_NOT_DIRECTORY`

Message: `The requested workspace root is not a directory.`

### 12.5 `ROOT_NOT_ALLOWED`

Message: `The requested workspace root is outside the allowed roots.`

### 12.6 `WORKSPACE_OPEN_FAILED`

Message: `The requested workspace could not be opened.`

Used for bounded root-opening filesystem failures such as access denial, permission denial, or a busy/unavailable path after input validation.

### 12.7 `INTERNAL_ERROR`

```json
{
  "code": "INTERNAL_ERROR",
  "message": "The workspace summary failed because of an internal error.",
  "retryable": false,
  "details": {}
}
```

Used for malformed provider output, identity mismatch, unsafe or non-normalized provider paths, count mismatch, inclusion mismatch, unexpected summary failures, and unknown internal failures.

### Root-source detail schema

`ROOT_PATH_INVALID`, `ROOT_NOT_FOUND`, `ROOT_NOT_DIRECTORY`, `ROOT_NOT_ALLOWED`, and `WORKSPACE_OPEN_FAILED` use exactly:

```ts
{
  source: "root" | "path" | "configured_default_root";
}
```

The selected root string is never included in failure details. The source enum is sufficient for client correction without leaking a local absolute path.

## 13. Failure classification rules

The root-opening classifier uses only errors from Phase A.

Recommended mapping:

- alias conflict -> `ROOT_ALIAS_CONFLICT`;
- `assertSafePathInput` path-policy prefixes -> `ROOT_PATH_INVALID`;
- `Workspace root does not exist:` or root-stage `ENOENT` -> `ROOT_NOT_FOUND`;
- `Workspace root is not a directory:` or root-stage `ENOTDIR` -> `ROOT_NOT_DIRECTORY`;
- `Workspace root is outside allowed roots:` -> `ROOT_NOT_ALLOWED`;
- root-stage `EACCES`, `EPERM`, or `EBUSY` -> `WORKSPACE_OPEN_FAILED`;
- other root-stage failures -> `WORKSPACE_OPEN_FAILED` unless they demonstrably represent an internal invariant failure;
- every Phase B failure -> `INTERNAL_ERROR`.

Public messages come only from `OPEN_WORKSPACE_ERROR_MESSAGES`; raw `CodexProError`, Node, Git, AGENTS, skill, and provider messages remain private.

## 14. Envelope schema

The exact top-level output is:

```ts
{
  codexpro_tool: z.literal("open_workspace"),
  codexpro_title: z.literal("Open Workspace"),
  ok: z.boolean(),
  data: openWorkspaceDataSchema.nullable(),
  error: openWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
}
```

Strict consistency rules:

- `ok: true` requires non-null `data` and null `error`;
- `ok: false` requires null `data` and non-null `error`;
- unknown top-level, data, skill, count, error, detail, and meta fields are rejected;
- `meta` remains exactly `schemaVersion`, `durationMs`, and `warnings`;
- `warnings` is empty in this slice;
- `requestId` remains deferred.

## 15. Tool registration and annotations

The tool remains registered in minimal, standard, and full tool modes.

Registration adds:

```ts
outputSchema: openWorkspaceOutputShape
```

Existing input limits and `SESSION_READ_ANNOTATIONS` remain.

The direct handler always returns a structured schema-v1 failure with `isError: true` rather than allowing the generic legacy error wrapper to expose an unstable `{ error: string }` shape.

## 16. Tool Card compatibility

The shared workspace renderer currently unwraps nested `data` only for `open_current_workspace` and treats `open_workspace` as flat.

Update its helper so both direct migrated open tools use nested data when present while retaining flat fallback:

```js
function workspaceResultData(result) {
  const isDirectOpen =
    result?.codexpro_tool === "open_current_workspace" ||
    result?.codexpro_tool === "open_workspace";

  return isDirectOpen && result?.data && typeof result.data === "object"
    ? result.data
    : (result ?? {});
}
```

This supports:

- new nested `open_workspace` success;
- new nested `open_workspace` failure;
- existing nested `open_current_workspace`;
- historical/cached flat `open_workspace` data;
- unchanged flat `workspace_snapshot` and other workspace cards.

The renderer continues to display only safe bounded fields and fixed failure messages.

## 17. Supertool compatibility

The `codexpro` supertool must continue to call `open_workspace` by its registered action name and return the migrated nested result with the existing wrapper tags.

The short `open` alias remains mapped to `open_current_workspace`; this slice does not change alias routing.

Tests must verify that wrapper tagging does not flatten the tool data, overwrite `codexpro_tool`, duplicate legacy fields, or remove the strict failure envelope.

## 18. Consumer migration

Known flat-result consumers include:

- `scripts/smoke.mjs` root open and `path` alias checks;
- `scripts/http-smoke.mjs` skill-discovery and open-tool comparison checks;
- Stress or Tool Card paths that inspect workspace open results;
- any focused test helper that reads `structuredContent.workspace_id`, `skills`, or `tree` directly.

Migrate those consumers to `structuredContent.data.*` only for direct `open_workspace` results. Do not change unrelated unmigrated workspace tools.

## 19. Contract-test design

Create:

```text
test/open-workspace-contract.test.mjs
```

Focused coverage must include:

1. success constructor emits the exact nested schema-v1 envelope;
2. every approved failure constructor emits exact fixed fields;
3. schema rejects missing, malformed, extra, flat legacy, and inconsistent envelope fields;
4. skill item and count schemas reject mismatches and unknown fields;
5. tool advertises exact `outputSchema` in minimal, standard, and full modes;
6. default options return a tree and skip skills;
7. `include_tree=false` produces `tree: null`;
8. requested skill discovery returns strict inventory and counts;
9. global skill inclusion is passed exactly to the provider;
10. root-only input opens the requested root;
11. path-only input opens the requested root;
12. matching trimmed aliases succeed;
13. differing effective aliases return `ROOT_ALIAS_CONFLICT`;
14. blank `root` does not shadow a non-empty `path`;
15. two blank aliases fall back to the configured default root;
16. deprecated `bootstrap_context` is accepted and creates no `.ai-bridge` content;
17. missing root returns `ROOT_NOT_FOUND` without exposing the path;
18. file root returns `ROOT_NOT_DIRECTORY`;
19. disallowed root returns `ROOT_NOT_ALLOWED` without exposing allowed-root contents;
20. invalid root path returns `ROOT_PATH_INVALID` with only the source enum;
21. bounded root-open permission failures return `WORKSPACE_OPEN_FAILED`;
22. non-Git directory remains a success;
23. already opened canonical root reuses the same workspace ID;
24. provider workspace ID or root mismatch returns `INTERNAL_ERROR`;
25. provider AGENTS path mismatch or unsafe path returns `INTERNAL_ERROR`;
26. provider skill names/counts mismatch returns `INTERNAL_ERROR`;
27. provider tree/skill inclusion mismatch returns `INTERNAL_ERROR`;
28. provider-time `ENOENT` returns `INTERNAL_ERROR`, not `ROOT_NOT_FOUND`;
29. mode fields come from server configuration rather than provider data;
30. Tool Card consumes nested data and keeps historical flat fallback;
31. supertool direct action preserves the nested success and failure contracts;
32. no raw path, allowed-root list, exception, stack, secret, or provider diagnostic leaks through a failure.

Use temporary roots and test-only dependency injection. Do not add a production test mode.

## 20. Implementation boundaries

Expected source/test consumers:

- `src/tools/schemas/openWorkspace.ts` — new exact schema and constructors;
- `src/server.ts` — imports, root resolver, stage-aware classifier, provider dependency, registration, and handler migration;
- `src/toolCardWidget.ts` — nested direct-open unwrapping with flat fallback;
- `test/open-workspace-contract.test.mjs` — focused contracts;
- `scripts/smoke.mjs` — direct open nested-result migration;
- `scripts/http-smoke.mjs` — direct open nested-result migration;
- `scripts/stress.mjs` only if it reads the flat direct result;
- `CHANGELOG.md`, design/plan docs, `AGENTS.md`, `Memory.md`, and active archive.

Do not modify `src/guard.ts`, `src/workspaceOps.ts`, allowed-root configuration, path-policy rules, dependency versions, authentication, CLI behavior, or Phase 2 lifecycle code unless a verified implementation blocker requires a separately reviewed change.

## 21. Verification gates

Implementation is complete only after fresh evidence for:

1. focused `open_workspace` contract tests;
2. adjacent `open_workspace`, `open_current_workspace`, `server_config`, `tree`, and relevant Tool Card contracts;
3. complete `node --test test/*.test.mjs` regression;
4. `npm run build`;
5. `npm run smoke`;
6. `npm run http-smoke` when included in the established full gate or directly affected;
7. `npm run stress` on native Windows;
8. `git diff --check`;
9. no secret-looking values or unsafe paths introduced;
10. only intended files changed;
11. `neat-freak` reconciliation before staging;
12. exact-head Ubuntu/Windows Node 20/24 CI after publication.

Existing platform-capability skips remain acceptable only when they are already established and documented.

## 22. Compatibility and rollback

Compatibility:

- existing input field names and option limits remain;
- `root` and `path` remain aliases;
- blank alias handling becomes deterministic and safe;
- deterministic workspace IDs and existing-workspace reuse remain;
- direct success data moves from flat structured fields to nested `data`;
- human MCP content remains;
- Tool Card retains historical flat fallback;
- deprecated `bootstrap_context` remains accepted and ignored;
- minimal, standard, and full registration remains;
- no transport, credential, profile, allowed-root, or Phase 2 change occurs.

Rollback before publication:

- remove the new schema and focused test;
- revert only the `open_workspace` handler, dependency, Tool Card, consumer, and documentation changes;
- retain the already published `open_current_workspace` slice unchanged.

Rollback after publication uses a normal revert commit. Do not rewrite history or alter credentials, profiles, allowed roots, or unrelated Phase 1 work.

## 23. Acceptance criteria

The thirteenth slice is accepted when:

- direct `open_workspace` advertises an exact schema in every tool mode where registered;
- every success and failure validates against that schema;
- all twelve success fields exist only under `data`;
- all seven public failures are fixed, redacted, and non-retryable;
- root/path alias resolution is deterministic and blank root cannot shadow path;
- root-stage and provider-stage failures cannot be confused;
- non-Git directories remain successful;
- existing-workspace reuse remains intact;
- `bootstrap_context` remains ignored and non-mutating;
- Tool Card and supertool consumers understand the nested contract;
- all required local and cross-platform gates pass;
- no Phase 2 lifecycle behavior is introduced.

## 24. Current stopping point

The design is approved, implemented, publication-reviewed, published, and cross-platform CI-validated. Implementation commit `c31e8a1` passed exact-head CI run `29253838423` on Ubuntu/Windows with Node 20/24. Review fixed bounded `sourceURL` labels for transformed data-URL stacks and rejected non-workspace Skill sources when `include_global_skills=false`. The protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` files remain unchanged; their compatibility entries retain exact fail-closed substitutions and write no transformed source to disk. Final evidence is focused 18/18, adjacent 66/66, complete 220/220, Build, all eight Smoke sections, native-Windows Stress, package dry-run, and diff checking. No Critical or Important review findings remain. The next action is design review for the next remaining Phase 1 direct tool; Phase 2 remains closed.

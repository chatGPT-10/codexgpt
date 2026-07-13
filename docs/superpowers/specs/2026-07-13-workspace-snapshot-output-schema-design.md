# `workspace_snapshot` Exact Output Schema Design

**Date:** 2026-07-13
**Phase:** Phase 1
**Slice:** 14
**Status:** Published and exact-head cross-platform CI-validated

## 1. Goal

Migrate only the direct `workspace_snapshot` MCP tool to the established Phase 1 schema-v1 result envelope with:

- an exact advertised `outputSchema`;
- strict nested success data;
- stable redacted failures;
- explicit provider boundaries;
- focused contract tests;
- nested Tool Card compatibility;
- `codexpro` supertool compatibility;
- fail-closed in-memory migration for the protected Smoke consumers.

This slice stabilizes the existing snapshot protocol. It does not redesign workspace identity, add ownership or expiry, add `close_workspace`, change allowed roots, migrate `list_workspaces` or `inspect_workspace`, create `.ai-bridge` files, or begin Phase 2.

## 2. Why `workspace_snapshot` is the recommended next tool

Phase 1 has already stabilized the two workspace-opening tools:

1. `open_current_workspace` establishes the configured default workspace.
2. `open_workspace` opens or reuses an explicitly selected authorized root.

The next useful operation is to retrieve the richer context for an already opened workspace. `workspace_snapshot` is the existing direct tool for that purpose. It combines:

- workspace identity and root;
- AGENTS discovery state;
- optional Skill inventory;
- an always-included compact tree;
- Git status and recent-commit text;
- readable `.ai-bridge` handoff files;
- current Bash, write, and tool modes.

It is therefore the natural continuation of the workspace protocol without crossing into workspace lifecycle redesign.

### 2.1 Alternatives considered

#### Approach A — Migrate direct `workspace_snapshot` independently

Add one tool-owned schema, two injectable read-provider boundaries, strict validation, stable failures, focused tests, Tool Card migration, and protected-consumer compatibility.

**Advantages**

- One independently reversible feature.
- Reuses established workspace validation patterns.
- Stabilizes a high-value ChatGPT context operation.
- Removes the last flat result from the shared workspace Tool Card path.
- Does not begin Phase 2.

**Disadvantages**

- Some workspace validation remains duplicated until a separately reviewed extraction.

**Decision:** Recommended and approved.

#### Approach B — Migrate `list_workspaces` first

`list_workspaces` has a smaller output and fewer providers.

**Rejected because** it is a full-mode-only auxiliary inventory tool and does not improve the main open-then-inspect workflow as much as `workspace_snapshot`.

#### Approach C — Migrate `inspect_workspace` first

`inspect_workspace` exposes a large repository-analysis result.

**Rejected because** it introduces the analysis cache, files, symbols, relationships, coverage, truncation, path scoping, and provider-degradation behavior in one substantially wider error surface. It should be reviewed after the simpler workspace snapshot contract is stable.

#### Approach D — Combine `workspace_snapshot`, `list_workspaces`, and `inspect_workspace`

**Rejected because** these tools have different responsibilities and failure surfaces. Combining them would violate the one-feature-per-slice rule, weaken rollback precision, and make review unnecessarily broad.

## 3. First-principles model

A reliable tool contract must answer four questions independently:

1. **What was requested?**
   A bounded read-only snapshot of one already opened workspace.

2. **What data is guaranteed on success?**
   A complete, exact, validated snapshot object whose fields do not move between versions accidentally.

3. **How can it fail safely?**
   With a small fixed set of public error codes that do not expose local roots, raw exceptions, stack traces, handoff contents, or provider diagnostics.

4. **How is the result verified?**
   Through pure constructor tests, in-memory MCP contract tests, consumer tests, complete regression, Build, Smoke, Stress, package dry-run, and diff checking.

The implementation must preserve current behavior first. New lifecycle, persistence, authorization, or semantic-analysis behavior belongs to later phases.

## 4. Existing behavior to preserve

The direct tool currently:

- is registered only in `tool_mode=full`;
- accepts optional `workspace_id` and otherwise uses the current default workspace;
- accepts `max_depth` from 1 to 8, default 3;
- accepts `max_files` from 1 to 3000, default 500;
- accepts `include_skills`, default false;
- accepts `include_global_skills`, default false;
- always requests a compact tree;
- calls `workspaceSummary`;
- calls `readAiBridgeContext` without creating missing files;
- returns human-readable text containing the workspace summary and AI handoff context;
- returns flat structured fields;
- has no exact `outputSchema`;
- lets uncaught exceptions fall through the generic wrapper.

The migration preserves the inputs, defaults, full-mode-only availability, text content, non-Git success behavior, and no-create behavior. Only the public result protocol and error handling become exact.

## 5. Scope

### 5.1 In scope

- Direct `workspace_snapshot` only.
- Exact tool-owned schema-v1 envelope.
- Exact success data schema.
- Four fixed stable failures.
- Test-only dependency injection for summary and AI-context providers.
- Provider output validation and normalization.
- Nested Tool Card rendering plus historical flat fallback.
- `codexpro` supertool direct action and `snapshot` alias compatibility.
- Exact fail-closed in-memory migration of protected Smoke and HTTP Smoke consumers.
- Focused, adjacent, complete, build, smoke, stress, package, and diff verification.
- Design, plan, CHANGELOG, AGENTS map, `Memory.md`, and active Phase 1 archive records.

### 5.2 Out of scope

- `list_workspaces`.
- `inspect_workspace`.
- `codex_context`, `read_handoff`, or `export_pro_context` migration.
- Shared workspace-schema extraction or broad `src/server.ts` refactoring.
- Random session-scoped workspace IDs.
- Workspace ownership, client isolation, expiry, persistence, or close operations.
- Requiring explicit `workspace_id`.
- Creating or modifying `.ai-bridge` files.
- New Skill trust or instruction-precedence behavior.
- Authentication, OAuth, token, Cloudflare, credential, or profile changes.
- Atomic transactions, undo, or Phase 2/3 work.
- Dependency changes.
- Direct edits to `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.

## 6. Exact success contract

The top-level result is the established strict Phase 1 envelope:

```json
{
  "codexpro_tool": "workspace_snapshot",
  "codexpro_title": "Workspace Snapshot",
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### 6.1 Exact `data` fields

Success data contains exactly thirteen fields:

```json
{
  "workspace_id": "ws_...",
  "root": "D:\\Dev\\project",
  "agents_loaded": true,
  "agents_path": "AGENTS.md",
  "skills": ["example-skill"],
  "skill_inventory": [
    {
      "name": "example-skill",
      "description": null,
      "source": "workspace",
      "path": "$WORKSPACE/.codex/skills/example-skill/SKILL.md"
    }
  ],
  "skill_counts": {
    "total": 1,
    "workspace": 1,
    "user": 0,
    "plugin": 0,
    "other": 0
  },
  "tree": ".\n└── package.json",
  "git_status": "## main",
  "ai_context_files": [
    ".ai-bridge/current-plan.md"
  ],
  "bash_mode": "safe",
  "write_mode": "workspace",
  "tool_mode": "full"
}
```

### 6.2 Field rules

| Field | Rule |
|---|---|
| `workspace_id` | Non-empty and exactly equal to the resolved workspace ID. |
| `root` | Non-empty and exactly equal to the canonical workspace root. |
| `agents_loaded` | Boolean. |
| `agents_path` | Normalized workspace-relative path or `null`; must agree with `agents_loaded`. |
| `skills` | Ordered non-empty-name list matching `skill_inventory[].name` exactly. |
| `skill_inventory` | Strict records with `name`, nullable `description`, fixed `source`, and non-empty display path. |
| `skill_counts` | Strict non-negative counts; every source count and total must match the inventory. |
| `tree` | Required non-empty string. A snapshot always requests a tree, so `null` is not valid. |
| `git_status` | Required non-empty string. A non-Git diagnostic string remains a successful value. |
| `ai_context_files` | Ordered, unique, normalized workspace-relative paths drawn only from the approved `.ai-bridge` file set. |
| `bash_mode` | `off`, `safe`, or `full`. |
| `write_mode` | `off`, `handoff`, or `workspace`. |
| `tool_mode` | `minimal`, `standard`, or `full`; direct snapshot success will currently report `full`. |

### 6.3 Nullability decisions

- `agents_path` is always present and is `null` when no AGENTS file is loaded.
- `tree` is always a non-empty string because this tool always includes a tree.
- `ai_context_files` is always an array and is empty when no readable handoff files exist.
- Skill descriptions normalize provider `undefined` to public `null`.

### 6.4 No duplicated flat fields

The migrated result must not expose `workspace_id`, `root`, `tree`, `git_status`, or any other data field at the top level. All data lives under `structuredContent.data`.

## 7. Stable error contract

All public failures use:

```json
{
  "codexpro_tool": "workspace_snapshot",
  "codexpro_title": "Workspace Snapshot",
  "ok": false,
  "data": null,
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "The requested workspace is not open.",
    "retryable": false,
    "details": {}
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### 7.1 Approved error codes

| Code | Message | Details |
|---|---|---|
| `WORKSPACE_NOT_FOUND` | `The requested workspace is not open.` | `{ source: "workspace_id" | "default_workspace", workspace_id: string | null }` |
| `SNAPSHOT_SUMMARY_FAILED` | `The workspace summary could not be collected.` | `{}` |
| `AI_CONTEXT_FAILED` | `The AI handoff context could not be collected.` | `{}` |
| `INTERNAL_ERROR` | `The workspace snapshot failed because of an internal error.` | `{}` |

All four errors are non-retryable in schema version 1. A later protocol version may add an explicit transient category only with evidence and a reviewed compatibility path.

### 7.2 Failure-stage rules

1. Resolving an unknown explicit ID or unavailable default workspace returns `WORKSPACE_NOT_FOUND`.
2. A thrown summary-provider operation returns `SNAPSHOT_SUMMARY_FAILED`.
3. A thrown AI-context-provider operation returns `AI_CONTEXT_FAILED`.
4. A malformed provider value, identity mismatch, unsafe path, inconsistent counts, forbidden file path, constructor failure, or other invariant violation returns `INTERNAL_ERROR`.

Separating provider invocation from provider validation prevents a malformed injected result from being misreported as an ordinary local collection failure.

### 7.3 Redaction rules

Public failures must not contain:

- the workspace root;
- allowed-root values;
- raw exception messages;
- stack traces;
- filesystem diagnostics;
- AI handoff contents;
- rejected AI-context paths;
- Skill contents;
- tokens or secret-looking values.

An explicit workspace ID may be returned only after bounded one-line sanitization. An omitted ID is represented as `null` with source `default_workspace`.

## 8. Provider boundaries

Add two dependencies to `CodexProServerDependencies`.

```ts
export interface WorkspaceSnapshotSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: WorkspaceSnapshotSummaryOptions;
}

export interface WorkspaceSnapshotAiContextProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
}

export interface CodexProServerDependencies {
  workspaceSnapshotSummaryProvider?: (
    context: WorkspaceSnapshotSummaryProviderContext
  ) => WorkspaceSummary | Promise<WorkspaceSummary>;
  workspaceSnapshotAiContextProvider?: (
    context: WorkspaceSnapshotAiContextProviderContext
  ) => { text: string; files: string[] } | Promise<{ text: string; files: string[] }>;
}
```

The production defaults remain:

```ts
workspaceSummary(config, guard, workspace, options)
readAiBridgeContext(config, guard, workspace)
```

No production test mode, environment switch, hidden MCP argument, filesystem fixture hook, or global mutable test state is allowed.

## 9. Provider validation

### 9.1 Summary provider

Parse a strict provider shape before constructing public data. Validate:

- returned workspace ID equals `workspace.id`;
- returned root equals `workspace.root`;
- `agentsLoaded` equals `Boolean(agentsPath)`;
- `agentsPath`, when present, resolves inside the workspace and is already normalized;
- Skill names match the inventory in the same order;
- source counts and total match the inventory;
- no Skill data exists when `include_skills=false`;
- only workspace-source Skills exist when `include_skills=true` and `include_global_skills=false`;
- a non-empty tree exists because snapshot options always set `includeTree=true`;
- `gitStatus` is non-empty;
- no additional provider fields exist.

Normalize only Skill `description: undefined` to public `null`. Do not reorder Skill results.

### 9.2 AI-context provider

Parse a strict provider shape:

```ts
{
  text: string;
  files: string[];
}
```

For every returned file:

1. Resolve it with `PathGuard` against the current workspace.
2. Normalize to the guard-returned relative path.
3. Require it to belong to the approved fixed AI bridge set.
4. Reject duplicates after normalization.
5. Preserve provider order.

The approved normalized paths are derived from `config.contextDir` and the existing fixed names:

```text
current-plan.md
agent-status.md
implementation-diff.patch
codex-status.md
decisions.md
open-questions.md
execution-log.jsonl
```

The provider text is retained only for the redacted human-readable `content` response. It is not copied into structured data.

## 10. Handler data flow

```text
validate MCP input through the existing registration wrapper
  -> resolve workspace
     -> failure: WORKSPACE_NOT_FOUND
  -> build exact bounded options
  -> invoke summary provider
     -> thrown operation: SNAPSHOT_SUMMARY_FAILED
  -> strictly parse and validate summary
     -> invalid: INTERNAL_ERROR
  -> invoke AI-context provider
     -> thrown operation: AI_CONTEXT_FAILED
  -> strictly parse, normalize, and validate AI files
     -> invalid: INTERNAL_ERROR
  -> parse exact public data
  -> create strict success envelope
  -> return existing redacted human-readable text plus nested structured result
```

The handler must use separate `try` stages rather than one broad catch so the public code identifies the failing subsystem without revealing diagnostics.

## 11. Input behavior

The input schema remains unchanged:

```ts
{
  workspace_id?: string;
  max_depth?: number;   // 1..8, default 3
  max_files?: number;   // 1..3000, default 500
  include_skills?: boolean; // default false
  include_global_skills?: boolean; // default false
}
```

Additional rules:

- `include_global_skills=true` has no effect unless `include_skills=true`; this preserves current behavior.
- `max_files` remains the public alias used by this tool.
- `includeTree` is always `true` internally.
- Omitted `workspace_id` retains the existing default-workspace fallback for Phase 1 compatibility.

## 12. Tool availability and descriptor

`workspace_snapshot` remains full-mode only.

Contract tests must prove:

- absent in `minimal`;
- absent in `standard`;
- present in `full`;
- the full-mode descriptor advertises an object `outputSchema` requiring exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.

No tool-mode membership changes belong to this slice.

## 13. Tool Card compatibility

The shared workspace renderer currently unwraps nested data for `open_current_workspace` and `open_workspace`, while `workspace_snapshot` still uses flat fields.

Update the compatibility normalizer so it:

- unwraps `data` for new nested `workspace_snapshot` success;
- renders the fixed public error for new nested failure;
- retains historical or cached flat `workspace_snapshot` fallback;
- leaves the two migrated open tools unchanged;
- continues to render Skills, Git state, tree, modes, root, workspace ID, and AGENTS state;
- adds a compact AI handoff file list for `ai_context_files` without showing file contents.

The Tool Card must never display raw provider diagnostics.

## 14. Supertool compatibility

The `codexpro` wrapper already maps alias `snapshot` to `workspace_snapshot`.

Tests must prove, in full mode:

- `action: "workspace_snapshot"` returns the strict nested success/failure envelope;
- `action: "snapshot"` resolves to the same tool;
- wrapper tags remain:
  - `codexpro_tool: "workspace_snapshot"`;
  - `codexpro_super_action: "workspace_snapshot"`;
  - `wrapped_tool: "workspace_snapshot"`;
- no flat data fields are reintroduced.

The wrapper itself is not redesigned.

## 15. Protected Smoke compatibility

The protected source files remain unchanged:

- `scripts/smoke.mjs`;
- `scripts/http-smoke.mjs`.

Update only their in-memory compatibility loaders.

### 15.1 Main Smoke

In `scripts/smoke-platform-compat.mjs`, add an exact-count replacement:

```text
snapshotAlias.structuredContent.tree
-> snapshotAlias.structuredContent.data?.tree
expected count: 1
```

### 15.2 HTTP Smoke

In `scripts/http-smoke-compat.mjs`, add an exact-once replacement:

```text
snapshot.structuredContent.workspace_id
-> snapshot.structuredContent.data?.workspace_id
```

Both loaders must continue to:

- fail closed on source drift;
- transform only in memory;
- write no transformed source to disk;
- use bounded `sourceURL` labels;
- preserve credential-shaped fixtures without exposing them in documentation or logs.

## 16. Testing strategy

Create `test/workspace-snapshot-contract.test.mjs` with the following groups.

### 16.1 Pure schema tests

- module exists and imports;
- success constructor emits the exact six-field envelope;
- success data has exactly thirteen fields;
- all four approved failures parse exactly;
- flat fields are rejected;
- additional top-level, data, nested Skill, count, error, and meta fields are rejected;
- empty identity, root, tree, Git status, Skill names, and AI file paths are rejected;
- `agents_path: undefined`, `tree: null`, and missing `ai_context_files` are rejected;
- inconsistent success/failure combinations are rejected;
- error detail leakage is rejected.

### 16.2 Descriptor and mode tests

- absent in minimal and standard;
- present with exact output schema in full.

### 16.3 Handler success tests

- omitted arguments use defaults 3/500/false/false and `includeTree=true`;
- requested limits and Skill switches reach the summary provider exactly;
- success returns nested data and normalized nullable description/path fields;
- AI files are normalized, ordered, unique, and limited to the approved set;
- missing `.ai-bridge` returns `ai_context_files: []` and does not create the directory;
- non-Git roots remain successful;
- human-readable content includes recent commits and AI handoff section;
- root, ID, modes, counts, tree, and Git state match the validated providers.

### 16.4 Handler failure tests

- unknown explicit workspace ID returns redacted `WORKSPACE_NOT_FOUND`;
- unavailable default workspace returns the same code with `workspace_id: null`;
- thrown summary provider returns `SNAPSHOT_SUMMARY_FAILED`;
- thrown AI provider returns `AI_CONTEXT_FAILED`;
- summary identity, root, AGENTS state/path, Skills, counts, inclusion, tree, Git status, and additional-field mismatches return `INTERNAL_ERROR`;
- malformed AI shape, unknown file, outside path, duplicate normalized path, and additional field return `INTERNAL_ERROR`;
- no private diagnostic appears in serialized or text output.

### 16.5 Consumer tests

- Tool Card unwraps nested snapshot success and failure;
- Tool Card retains flat snapshot fallback;
- Tool Card exposes AI file names but not contents;
- supertool direct action and alias preserve the strict envelope;
- compatibility loaders contain exact fail-closed substitutions and bounded source labels.

## 17. File map

### Create

- `src/tools/schemas/workspaceSnapshot.ts` — exact schema, messages, types, and constructors.
- `test/workspace-snapshot-contract.test.mjs` — focused pure and in-memory MCP contracts.
- `docs/superpowers/specs/2026-07-13-workspace-snapshot-output-schema-design.md` — this design.
- `docs/superpowers/plans/2026-07-13-workspace-snapshot-output-schema.md` — executable TDD plan.

### Modify during implementation

- `src/server.ts` — imports, provider types/dependencies/defaults, validation helpers, classifier, descriptor, and handler.
- `src/toolCardWidget.ts` — nested snapshot normalization, failure subtitle, and AI file rendering.
- `scripts/smoke-platform-compat.mjs` — one exact in-memory nested-tree substitution.
- `scripts/http-smoke-compat.mjs` — one exact in-memory nested-workspace-ID substitution.
- `CHANGELOG.md` — unreleased Phase 1 contract record.
- `AGENTS.md` — documentation map and current stopping point.
- `Memory.md` — concise current state and next action.
- `docs/memory/archive/phase-1-part-3.md` — append-only detailed step records while below the rollover threshold.

### Must not modify

- `scripts/smoke.mjs`.
- `scripts/http-smoke.mjs`.
- authentication, profile, Cloudflare, or credential files.
- package dependencies or lockfiles.
- prior Phase 1 archive volumes.

## 18. Verification gates

Run in this order:

1. Focused RED/GREEN contract:
   ```text
   node --test test/workspace-snapshot-contract.test.mjs
   ```
2. Adjacent workspace contracts:
   ```text
   node --test test/workspace-snapshot-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/tree-contract.test.mjs test/server-config-contract.test.mjs
   ```
3. Complete regression:
   ```text
   node --test test/*.test.mjs
   ```
4. Build:
   ```text
   npm run build
   ```
5. Smoke:
   ```text
   npm run smoke
   ```
6. Native-Windows Stress:
   ```text
   npm run stress
   ```
7. Package dry-run:
   ```text
   npm pack --dry-run
   ```
8. Diff check:
   ```text
   git diff --check
   ```
9. Review current changes with CodexPro `show_changes`.
10. Run `neat-freak`, reconcile records, and repeat affected gates.
11. Stop before staging, commit, push, or Phase 2 until explicit approval.

## 19. Acceptance criteria

The slice is implementation-complete only when:

- direct `workspace_snapshot` remains full-mode only;
- its full-mode descriptor advertises the exact output schema;
- success has exactly thirteen nested data fields;
- `tree` is required and non-null;
- AI file paths are normalized, unique, ordered, and limited to the approved set;
- all four stable failures are exact, redacted, and non-retryable;
- provider invocation and provider validation failures are distinguished correctly;
- no raw exception, stack, root, forbidden path, handoff content, or secret enters public failures;
- no `.ai-bridge` file is created by the read-only tool;
- non-Git workspaces remain successful;
- Tool Card and supertool compatibility pass;
- protected Smoke sources remain byte-for-byte unchanged;
- focused, adjacent, complete, Build, Smoke, Stress, package, and diff gates pass;
- only intended files changed;
- `Memory.md` and the active Phase 1 archive are updated;
- implementation stops before staging, commit, push, or Phase 2.

## 20. Risks and mitigations

### Duplicated workspace validation

The two open tools already contain similar validation. This slice deliberately keeps tool-specific ownership to avoid a broad refactor. A later separately reviewed maintenance slice may extract shared workspace primitives after all three contracts are stable.

### `src/server.ts` size

The file exceeds the current direct-read ceiling. Use targeted source inspection, exact edits, contract tests, and GitHub committed-source lookup when necessary. Do not use this feature as justification for an unrelated server decomposition.

### Compatibility-loader drift

Exact substitutions intentionally fail when protected source text changes. Any intentional protected-source drift must update the corresponding loader in the same reviewed change.

### AI handoff sensitivity

The tool already returns handoff text. Continue using the existing redacting `textResult` boundary. Structured data includes only approved relative filenames, never file contents.

### Process-local workspace state

Workspace ownership, expiry, and client isolation remain Phase 2 concerns. The schema must describe current behavior without claiming stronger isolation.

## 21. Rollback

Before publication:

- remove `src/tools/schemas/workspaceSnapshot.ts` and its focused test;
- revert only the `workspace_snapshot` imports, provider types/dependencies/defaults, validation helpers, descriptor, and handler changes in `src/server.ts`;
- restore the previous Tool Card snapshot branch;
- remove only the two snapshot compatibility-loader substitutions;
- revert only this slice's CHANGELOG, AGENTS, Memory, spec, plan, and active archive additions.

After publication, use a normal revert commit. Do not rewrite `main`, alter credentials or profiles, delete user handoff data, modify protected Smoke sources, or disturb prior Phase 1 commits.

## 22. Approved next action

Translate this design into the detailed implementation plan in:

```text
docs/superpowers/plans/2026-07-13-workspace-snapshot-output-schema.md
```

Implementation, staging, commit, push, credentials, access changes, and Phase 2 remain closed until separately authorized.

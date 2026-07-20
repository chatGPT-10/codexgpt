# Phase 1 Second Slice Design: Exact `tree` Output Schema

**Date:** 2026-07-12
**Status:** Approved, fully implemented, published in commit `6aaeda4`, and cross-platform CI-validated; closeout records published in commits `2ecd4af` and `e7c1646`
**Scope:** One vertical slice for `tree` only

## 1. Purpose

Phase 1 establishes exact MCP output schemas and stable errors one tool at a time. The first `server_config` slice proved the strict result envelope, exact advertised schema, stable failure structure, readable MCP content, and tool-card migration pattern.

The second slice applies that pattern to `tree`, while adding the first narrowly scoped user-correctable error codes for workspace and path failures.

This slice must prove the full path:

1. an exact advertised `tree.outputSchema`;
2. actual success and failure results that validate against it;
3. the existing `tree` data preserved under `data`;
4. stable, safe error classification for expected workspace and path failures;
5. unchanged human-readable MCP `content`;
6. unchanged MCP `isError: true` behavior on failure;
7. a tool card that reads the nested `data` shape;
8. contract tests covering registration, success, all approved errors, redaction, and card compatibility.

## 2. Non-goals

This slice does not:

- migrate any tool other than `tree`;
- rename existing `tree` data fields;
- require explicit `workspace_id` when it is currently optional;
- alter workspace ID generation, default-workspace fallback, ownership, expiry, or close behavior;
- begin Phase 2 workspace lifecycle work;
- refactor the global `CodexGPTError` class or retrofit codes into other tools;
- create a global error-classification framework;
- migrate `read`, `search`, `inspect_workspace`, or any other file tool;
- change path-policy behavior in `PathGuard`;
- change the successful `root` value from its current absolute path representation;
- remove the existing human-readable directory-tree output;
- fix the unrelated native-Windows Stress fixture containing `visible:123:file.txt`;
- add dependencies, environment flags, CLI options, hidden MCP arguments, HTTP routes, or production failure switches;
- stage, commit, push, modify credentials, change profiles, or alter Cloudflare state.

## 3. Pre-implementation behavior

This section preserves the design baseline reviewed before implementation. At that point, `tree` was registered in `src/server.ts` through `registerCodexTool`.

Its handler then:

1. resolves the workspace through `WorkspaceManager.getWorkspace`;
2. normalizes the requested options;
3. calls `repoTree` from `src/fsOps.ts`;
4. returns readable text and a structured object containing:
   - `workspace_id`;
   - `root`;
   - `text`;
   - `entries`;
   - `truncated`.

`tagToolResult` adds `codexgpt_tool` and `codexgpt_title` at the structured-result top level.

At design time, the tool had no exact `outputSchema`. Failures were handled by the common wrapper and became `isError: true` with readable text plus the legacy structured shape `{ error: string }`.

The tool card then had no dedicated `tree` renderer and fell through to the generic renderer, which read fields from the structured-result top level.

## 4. Approved structured result contract

### 4.1 Top-level envelope

Direct `tree.structuredContent` contains exactly:

```text
codexgpt_tool
codexgpt_title
ok
data
error
meta
```

Tool identity remains at the top level because the CodexGPT card and generic result routing use it.

All tool-specific fields live only under `data`. They are not duplicated at the top level.

### 4.2 Successful result

A successful result has this shape:

```json
{
  "codexgpt_tool": "tree",
  "codexgpt_title": "File Tree",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexgpt",
    "text": ".\n├── src/\n└── test/",
    "entries": 2,
    "truncated": false
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 4,
    "warnings": []
  }
}
```

### 4.3 Exact `data` contract

The successful `data` object contains exactly:

- `workspace_id: string`;
- `root: string`;
- `text: string`;
- `entries: non-negative integer`;
- `truncated: boolean`.

Rules:

- Existing snake_case field names are retained.
- `text` remains available in structured output as well as readable MCP `content`.
- `root` preserves the existing successful value and compatibility behavior.
- `entries` reports the number of returned directory entries.
- `truncated` is `true` when traversal stops because `max_entries` is reached.
- No additional successful data fields are allowed without a later schema revision.

### 4.4 Failed result

A failed result has this shape:

```json
{
  "codexgpt_tool": "tree",
  "codexgpt_title": "File Tree",
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_A_DIRECTORY",
    "message": "The requested path is not a directory.",
    "retryable": false,
    "details": {
      "path": "src/server.ts"
    }
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 2,
    "warnings": []
  }
}
```

The enclosing MCP result also retains:

- `isError: true`;
- human-readable `content`;
- existing structured and text redaction.

## 5. Metadata contract

`tree.meta` reuses the Phase 1 shared contract from `src/tools/schemas/common.ts` and contains exactly:

- `schemaVersion`;
- `durationMs`;
- `warnings`.

Rules:

- `schemaVersion` is the integer `1`.
- `durationMs` is a non-negative number covering the complete direct `tree` handler attempt, including workspace lookup, path checks, and traversal.
- `warnings` is always an array of strings and is `[]` in this slice.
- `requestId` remains omitted until a trustworthy transport-aware identity is designed.

## 6. Approved stable errors

The second slice permits exactly these codes:

```text
WORKSPACE_NOT_FOUND
PATH_OUTSIDE_WORKSPACE
PATH_BLOCKED
FILE_NOT_FOUND
NOT_A_DIRECTORY
INTERNAL_ERROR
```

All six use:

```text
retryable: false
```

Automatic retry is not claimed safe or useful for any approved failure in this slice.

### 6.1 `WORKSPACE_NOT_FOUND`

Use when the caller supplies an explicit `workspace_id` that is not open in the current WorkspaceManager.

Stable message:

```text
The requested workspace is not available. Open the workspace before retrying.
```

Exact details:

```json
{
  "workspace_id": "ws_..."
}
```

This code does not change the current behavior when `workspace_id` is omitted; default-workspace fallback remains intact until Phase 2.

### 6.2 `PATH_OUTSIDE_WORKSPACE`

Use when the requested path is rejected because it escapes the workspace or violates a path-form safety boundary, including applicable device, UNC, drive-relative, alternate-data-stream, reserved-name, trailing-dot/space, or symlink/junction escape checks.

Stable message:

```text
The requested path is outside the permitted workspace boundary.
```

Exact details:

```json
{
  "path": "../outside"
}
```

The returned path detail must be safe. A simple relative input may be retained. Absolute, device, UNC, or otherwise sensitive path input must be replaced with a fixed placeholder such as `[unsafe path omitted]` rather than returned verbatim.

### 6.3 `PATH_BLOCKED`

Use when the requested path is inside the workspace boundary but blocked by configured safety globs.

Stable message:

```text
The requested path is blocked by safety rules.
```

Exact details:

```json
{
  "path": ".git"
}
```

Only a safe workspace-relative value may be returned.

### 6.4 `FILE_NOT_FOUND`

Use when the resolved target does not exist and the filesystem reports `ENOENT`.

Stable message:

```text
The requested path does not exist.
```

Exact details:

```json
{
  "path": "missing-directory"
}
```

### 6.5 `NOT_A_DIRECTORY`

Use when the target exists but is not a directory.

Stable message:

```text
The requested path is not a directory.
```

Exact details:

```json
{
  "path": "src/server.ts"
}
```

### 6.6 `INTERNAL_ERROR`

Use for failures that do not match one of the five expected user-correctable cases.

Stable message:

```text
The file tree could not be generated because of an internal error.
```

Exact details:

```json
{}
```

Raw exception names, messages, stack traces, absolute paths, tokens, secrets, environment values, and filesystem internals must not be returned.

## 7. Error schema design

`src/tools/schemas/tree.ts` owns a discriminated union for the six allowed error variants.

Each variant fixes:

- one literal `code`;
- the corresponding literal stable public `message` from Section 6;
- `retryable: false`;
- a strict code-specific `details` object.

Expected details schemas:

```text
WORKSPACE_NOT_FOUND    -> { workspace_id: string, length 1..160 }
PATH_OUTSIDE_WORKSPACE -> { path: string, length 1..240 }
PATH_BLOCKED           -> { path: string, length 1..240 }
FILE_NOT_FOUND         -> { path: string, length 1..240 }
NOT_A_DIRECTORY        -> { path: string, length 1..240 }
INTERNAL_ERROR         -> {}
```

The complete output schema must reject:

- unknown error codes;
- missing required detail fields;
- detail fields that belong to another code;
- additional top-level fields;
- additional `data` fields;
- inconsistent success/failure states.

## 8. Local error-classification boundary

The repository's current `CodexGPTError` contains only a message and has no stable internal code. Refactoring that global class would affect many tools and is outside this slice.

The approved implementation therefore adds a `tree`-local classification boundary.

Classification order:

1. If explicit workspace lookup reports the existing unknown-workspace condition, return `WORKSPACE_NOT_FOUND`.
2. If a Node filesystem error has code `ENOENT`, return `FILE_NOT_FOUND`.
3. If the existing path guard reports a blocked-path condition, return `PATH_BLOCKED`.
4. If `repoTree` reports the existing not-a-directory condition, return `NOT_A_DIRECTORY`.
5. If the path guard reports escape, unsafe path form, or symlink/junction boundary rejection, return `PATH_OUTSIDE_WORKSPACE`.
6. Otherwise return `INTERNAL_ERROR`.

The classifier may recognize the current known `CodexGPTError` message prefixes only inside this local adapter. Tests must lock those mappings. An unrecognized message must fail closed to `INTERNAL_ERROR`; it must never be guessed into a user-facing code.

This message-coupled adapter is an explicit temporary limitation. A future separately approved refactor may add typed internal errors and replace it without changing the advertised `tree` contract.

## 9. Safe error details

A small `tree`-local helper derives safe input context for `details`.

Rules:

- `workspace_id` may be returned because it is already an explicit MCP input and public workspace handle. Replace control characters with spaces, trim it, and cap it at 160 characters before schema validation.
- A simple relative `path` may be returned after replacing control characters with spaces, trimming it, and capping it at 240 characters.
- Empty sanitized values use a fixed placeholder rather than an empty string.
- Absolute Windows or POSIX paths are not returned in errors.
- Device paths, UNC paths, drive-relative paths, and other unsafe forms are replaced by `[unsafe path omitted]`.
- Internal resolved absolute paths are never copied into `details`.
- `INTERNAL_ERROR.details` is always exactly `{}`.
- Final output still passes through existing redaction.

## 10. Schema ownership

Implementation creates:

```text
src/tools/schemas/tree.ts
```

It owns:

- exact `tree` data schema;
- six exact error variants;
- complete success/failure output schema;
- inferred TypeScript types;
- success and failure construction helpers;
- stable public messages and exact detail validation.

`src/tools/schemas/common.ts` remains the owner of:

- schema version;
- shared metadata schema;
- generic stable-error base fields;
- shared metadata construction.

The slice should reuse existing common contracts without expanding them unless implementation proves a minimal shared helper is required. Any change to `common.ts` must remain tool-agnostic and must not alter the completed `server_config` contract.

The implementation must not add parallel handwritten result interfaces that can drift from Zod.

## 11. Handler data flow

Successful flow:

```text
tree MCP call
    ↓
start duration measurement
    ↓
resolve current or explicit workspace
    ↓
normalize tree options
    ↓
call existing repoTree implementation
    ↓
validate exact tree data
    ↓
construct strict success envelope
    ↓
return unchanged readable tree content
```

Failure flow:

```text
workspace lookup / path validation / traversal throws
    ↓
tree-local classifier
    ↓
safe code-specific details
    ↓
strict failure envelope
    ↓
MCP result with isError: true and readable safe content
```

The handler catches its own errors so the direct `tree` call returns the exact failure schema instead of falling through to the legacy common `{ error: string }` result.

## 12. Constructor-only test seam

To verify an unexpected failure through the real MCP handler, extend `CodexGPTServerDependencies` with one programmatic `treeResultProvider` seam.

Its intended shape is equivalent to:

```ts
treeResultProvider?: (context: {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: TreeOptions;
}) => Promise<TreeResult>;
```

The production default invokes the existing `repoTree` implementation with the current config, guard, workspace, and normalized options. The exact exported type may reuse existing `TreeOptions` and `TreeResult` definitions rather than duplicate them.

Tests may inject a provider that throws a synthetic internal exception.

The seam must not be reachable through:

- environment variables;
- CLI arguments;
- saved profiles;
- HTTP routes;
- MCP tool arguments;
- public configuration;
- Cloudflare configuration.

It exists only on the programmatic server constructor used by tests and trusted embedding code.

## 13. MCP registration

The `tree` descriptor must advertise its exact `outputSchema` from the same Zod source used to validate constructed results.

The descriptor must require exactly:

```text
codexgpt_tool
codexgpt_title
ok
data
error
meta
```

No descriptor for another tool changes in this slice.

The existing `registerToolCompat` and `tagToolResult` behavior remains in place. The constructed result already includes the correct identity fields; tagging must not add a conflicting or extra contract field.

## 14. Tool-card compatibility

Add dedicated `tree` handling rather than letting the migrated result fall through to the old generic top-level renderer.

The card must:

- keep top-level `codexgpt_tool` and `codexgpt_title` for routing and the header;
- read successful fields from `structuredContent.data`;
- show a bounded preview of `data.text`;
- show `data.entries`;
- show whether `data.truncated` is true;
- use `data.root` only as the existing successful workspace subtitle or supporting context;
- display the stable error code and safe message when `ok` is false;
- avoid rendering raw internal error data.

No unrelated card branch changes.

## 15. Human-readable content compatibility

Success retains the current readable directory-tree text produced by `repoTree`.

Failure returns concise safe text containing the stable code and stable public message. It must not contain raw internal exception text.

The slice does not require old structured top-level aliases. Direct structured consumers must use `structuredContent.data` after migration.

## 16. Test design

Create:

```text
test/tree-contract.test.mjs
```

Use Node's built-in `node:test`, the existing `tsx/esm/api` import pattern, and an in-memory MCP client/server pair.

### 16.1 Constructor and schema tests

Verify:

- the success constructor produces the exact schema-v1 envelope;
- all data fields are under `data`;
- the six failure variants validate;
- each code requires its exact details shape;
- the schema rejects unknown codes;
- the schema rejects additional top-level fields;
- the schema rejects additional `data` fields;
- the schema rejects `ok: true` with `data: null` or non-null `error`;
- the schema rejects `ok: false` with non-null `data` or null `error`.

### 16.2 Registration and real success test

Verify through the actual MCP client:

- `tree` is registered;
- it advertises `outputSchema`;
- required fields are exact;
- a real tree call returns `ok: true`;
- returned structured content validates;
- readable `content` remains present;
- `isError` is absent on success;
- `meta.durationMs` is non-negative;
- `meta.warnings` is `[]`.

### 16.3 Real expected-failure tests

Exercise actual MCP calls for:

- an unknown explicit workspace ID -> `WORKSPACE_NOT_FOUND`;
- a relative escape path -> `PATH_OUTSIDE_WORKSPACE`;
- a configured blocked path -> `PATH_BLOCKED`;
- a missing directory -> `FILE_NOT_FOUND`;
- an existing file -> `NOT_A_DIRECTORY`.

Each test verifies:

- `ok: false`;
- `data: null`;
- exact code;
- stable safe message;
- `retryable: false`;
- exact safe details;
- `isError: true`;
- readable content;
- full schema validation.

Platform-specific unsafe path forms may be covered in focused classifier/unit tests when a direct cross-platform MCP input cannot represent the same condition consistently.

### 16.4 Injected internal-failure test

Inject a provider that throws an error containing a synthetic secret assembled from harmless fragments.

Verify:

- `INTERNAL_ERROR`;
- fixed public message;
- `details: {}`;
- `retryable: false`;
- `isError: true`;
- no secret in serialized output;
- no stack trace;
- no raw exception message;
- schema validation passes.

### 16.5 Tool-card contract test

Verify the generated widget source contains a dedicated `tree` branch and reads successful tree fields from nested `data`.

The focused source assertion must also ensure the new `tree` renderer does not read `text`, `entries`, `truncated`, or `root` from the structured-result top level.

### 16.6 Internal-consumer search

Search the repository for direct structured consumers of `tree` output. Migrate only consumers that actually read the direct tool result.

The `codexgpt` supertool wrapper may continue wrapping the already-constructed child result because its own schema is not migrated in this slice.

## 17. Verification sequence

Implementation verification must run in this order:

1. new focused contract test;
2. complete Node test suite;
3. TypeScript build;
4. existing Smoke suite;
5. applicable package and documentation checks used by the first slice;
6. changed-file whitespace/conflict-marker validation;
7. targeted search for stale direct `tree` top-level structured reads;
8. secret-pattern review;
9. intended-file review.

`npm run stress` remains a separate known native-Windows limitation. This slice must not modify its invalid colon-containing fixture merely to make the schema work appear green. If Stress is attempted, record whether it is blocked before reaching the migrated path.

## 18. Expected implementation scope

Expected new files:

```text
src/tools/schemas/tree.ts
test/tree-contract.test.mjs
```

Expected modified files:

```text
src/server.ts
src/toolCardWidget.ts
Memory.md
docs/memory/archive/phase-1.md
```

`src/tools/schemas/common.ts` may change only if a minimal, tool-agnostic helper is demonstrably required and the completed `server_config` contract remains unchanged.

Other files require a documented reason and scope review before modification.

No dependency addition is expected.

## 19. Acceptance criteria

The slice is complete only when all of the following are true:

- `tree` advertises an exact output schema.
- Actual success and all approved failure outputs validate against it.
- Successful data contains exactly `workspace_id`, `root`, `text`, `entries`, and `truncated` under `data`.
- Successful fields are not duplicated at the top level.
- The six approved stable codes are the only possible errors.
- Error details are exact, minimal, and safe.
- Unknown internal failures use a fixed redacted `INTERNAL_ERROR` result.
- Existing readable success content remains available.
- Failure retains `isError: true` and safe readable content.
- The dedicated tool card reads nested `data` and renders failure safely.
- Default-workspace behavior is unchanged.
- No Phase 2 workspace lifecycle behavior is introduced.
- No other tool's structured result changes.
- No production failure backdoor exists.
- Focused tests, full tests, build, Smoke, and applicable checks pass.
- No secret-looking values or raw internal exceptions are introduced.
- `Memory.md` and the Phase 1 archive are updated.

## 20. Risks and limitations

- The local classifier temporarily depends on known current error-message prefixes because the global error class is untyped.
- A future typed internal-error refactor must preserve the advertised `tree` codes and details unless a separately versioned contract change is approved.
- Successful `root` remains an absolute path for compatibility; this slice only prohibits absolute paths in failure details.
- The tool-card test inspects generated widget source rather than running a full browser DOM test.
- Only `server_config` and `tree` will have exact Phase 1 contracts after this slice; the rest remain unmigrated.
- Native-Windows Stress remains blocked by the separate invalid filename fixture.

## 21. Rollback

The implementation must remain independently reversible.

Rollback restores together:

- the former `tree` handler result;
- removal of the advertised `tree.outputSchema`;
- removal of the local `tree` error classifier and constructor-only provider seam if unused;
- the former generic tool-card behavior for `tree`;
- removal of `src/tools/schemas/tree.ts`;
- removal of `test/tree-contract.test.mjs`;
- reversal of only the corresponding Memory state, followed by an append-only rollback record in the Phase 1 archive.

Rollback does not change user configuration, credentials, profiles, workspaces, dependencies, remote branches, or Cloudflare state.

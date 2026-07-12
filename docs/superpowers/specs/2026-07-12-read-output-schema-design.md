# Phase 1 Third Slice Design: Exact `read` Output Schema

**Date:** 2026-07-12
**Status:** Published in implementation commit `282dcfa` with publication record `c90246f`; CI runs `29199573321` and `29199802824` passed on Ubuntu/Windows with Node 20/24
**Scope:** One vertical slice for `read` only

## 1. Purpose

Phase 1 establishes exact MCP output schemas and stable errors one tool at a time. The completed `server_config` and `tree` slices proved the strict result envelope, exact advertised schema, stable failure structure, readable MCP content, tool-card migration, real MCP contract testing, and constructor-only failure injection pattern.

The third slice applies that pattern to `read`. It must preserve the current file-reading behavior while making the protocol exact and safe.

This slice must prove the full path:

1. an exact advertised `read.outputSchema`;
2. actual success and failure results that validate against it;
3. all existing successful `read` fields preserved under `data`;
4. stable, safe error classification for expected workspace, path, file-type, size, and line-range failures;
5. unchanged human-readable MCP `content` on success;
6. unchanged MCP `isError: true` behavior on failure;
7. a dedicated tool card that reads the nested `data` shape;
8. proven internal consumers migrated from old top-level structured fields;
9. contract tests covering registration, success, all approved errors, redaction, duration, provider failure, card compatibility, and consumer compatibility.

## 2. Considered approaches

### 2.1 Recommended: tool-local exact `read` contract

Create one `read`-specific schema module, one local error-classification boundary, one constructor-only provider seam, and one dedicated tool-card renderer.

Advantages:

- follows the proven `tree` pattern;
- limits behavior change to one tool;
- keeps Phase 2 workspace work closed;
- avoids changing global errors;
- provides a reversible and independently testable slice.

This is the approved approach.

### 2.2 Shared file-tool error framework

Create a shared classifier and common file-tool error union for `tree`, `read`, and later file tools.

This is deferred because it would reopen the published `tree` implementation and establish abstractions before enough migrated tools exist to prove the correct boundary.

### 2.3 Global typed `CodexProError` refactor

Add stable internal codes to the global error class and migrate all throw sites.

This is deferred because it affects many tools and would no longer be a single low-risk Phase 1 vertical slice.

## 3. Non-goals

This slice does not:

- migrate any tool other than `read`;
- rename existing successful `read` fields;
- change file decoding, line numbering, line clamping, byte limits, text scanning, hashing, or truncation behavior;
- add `read_many`, binary reading, encoding selection, streaming, pagination, or file metadata fields;
- require explicit `workspace_id` when it is currently optional;
- alter workspace ID generation, default-workspace fallback, ownership, expiry, close behavior, or session binding;
- begin Phase 2 workspace lifecycle work;
- refactor the global `CodexProError` class;
- create a shared global error-classification framework;
- change path-policy behavior in `PathGuard`;
- change the successful `root` value from its current absolute path representation;
- change the current `sha256` calculation;
- remove existing redaction or human-readable content;
- change `search`, `tree`, `write`, `edit`, `apply_patch`, or any other tool contract;
- change the `codexpro` supertool's own legacy invalid-argument behavior;
- fix the unrelated native-Windows Stress fixture containing `visible:123:file.txt`;
- add dependencies, environment flags, CLI options, hidden MCP arguments, HTTP routes, or production failure switches;
- stage, commit, push, modify credentials, change profiles, or alter Cloudflare state.

## 4. Current behavior

`read` is registered in `src/server.ts` through `registerCodexTool` and is available in minimal, standard, and full tool modes.

The current handler:

1. resolves the current or explicit workspace;
2. calls `readTextFile` with `path`, `start_line`, `end_line`, and `max_bytes`;
3. builds readable text containing the path, selected line range, total lines, bytes, SHA-256 value, and numbered text;
4. returns a structured object containing:
   - `workspace_id`;
   - `root`;
   - `path`;
   - `text`;
   - `startLine`;
   - `endLine`;
   - `totalLines`;
   - `bytes`;
   - `sha256`;
   - `truncated`.

`tagToolResult` adds `codexpro_tool` and `codexpro_title` at the structured-result top level.

Before this slice, `read` has no exact `outputSchema`. Handler failures fall through to the common wrapper and produce `isError: true`, readable error text, and the legacy structured shape `{ error: string }`.

The tool card currently routes `read` through the generic `renderFile` branch, which reads fields from the structured-result top level.

## 5. Approved structured result contract

### 5.1 Top-level envelope

Direct `read.structuredContent` contains exactly:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

Tool identity remains at the top level for CodexPro routing and card headers.

All `read`-specific successful fields live only under `data`. They are not duplicated at the top level.

### 5.2 Successful result

A successful result has this shape:

```json
{
  "codexpro_tool": "read",
  "codexpro_title": "Read File",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "path": "src/server.ts",
    "text": "1 | import ...",
    "startLine": 1,
    "endLine": 40,
    "totalLines": 2878,
    "bytes": 123524,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "truncated": true
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 4,
    "warnings": []
  }
}
```

### 5.3 Exact `data` contract

The successful `data` object contains exactly:

- `workspace_id: string, length >= 1`;
- `root: string`;
- `path: string, length >= 1`;
- `text: string`;
- `startLine: positive integer`;
- `endLine: positive integer`;
- `totalLines: positive integer`;
- `bytes: non-negative integer`;
- `sha256: exactly 64 lowercase hexadecimal characters`;
- `truncated: boolean`.

Rules:

- Existing field names and casing are retained exactly, including `workspace_id` plus camelCase line fields.
- `path` remains the existing normalized workspace-relative path returned by `readTextFile`.
- `text` remains the existing numbered selected text.
- `startLine <= endLine <= totalLines` must hold for every successful result.
- `truncated` preserves its existing meaning: it is `true` when the selected line interval does not cover the complete file.
- `bytes` remains the byte length of the complete source file, not the returned numbered selection.
- `sha256` preserves the current SHA-256 calculation over the complete decoded UTF-8 text string.
- Existing redaction remains after construction. Therefore the returned redacted `data.text` is not required to hash to the returned pre-redaction `sha256` value.
- When tool cards are enabled, the existing global structured-string compaction may bound `data.text`. This slice does not change global compaction. `truncated` continues to describe the line selection, not card compaction.
- No additional successful fields are allowed without a later schema revision.

### 5.4 Failed result

A failed result has this shape:

```json
{
  "codexpro_tool": "read",
  "codexpro_title": "Read File",
  "ok": false,
  "data": null,
  "error": {
    "code": "FILE_NOT_TEXT",
    "message": "The requested file is not supported as text.",
    "retryable": false,
    "details": {
      "path": "assets/image.bin"
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
- human-readable safe `content`;
- existing structured and text redaction.

## 6. Metadata contract

`read.meta` reuses the Phase 1 shared contract from `src/tools/schemas/common.ts` and contains exactly:

- `schemaVersion`;
- `durationMs`;
- `warnings`.

Rules:

- `schemaVersion` is the integer `1`.
- `durationMs` is a non-negative number covering the complete direct `read` handler attempt, including workspace lookup, path checks, file checks, file reading, line selection, and result construction.
- `warnings` is always an array of strings and is `[]` in this slice.
- `requestId` remains omitted until a trustworthy transport-aware identity is designed.

## 7. Approved stable errors

The third slice permits exactly these codes:

```text
WORKSPACE_NOT_FOUND
PATH_OUTSIDE_WORKSPACE
PATH_BLOCKED
FILE_NOT_FOUND
NOT_A_FILE
FILE_TOO_LARGE
FILE_NOT_TEXT
INVALID_LINE_RANGE
INTERNAL_ERROR
```

All nine use:

```text
retryable: false
```

The caller must correct the workspace, path, file, range, or limit, or investigate an internal failure. Automatic retry is not claimed safe or useful.

### 7.1 `WORKSPACE_NOT_FOUND`

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

### 7.2 `PATH_OUTSIDE_WORKSPACE`

Use when the requested path escapes the workspace or violates an applicable path-form safety boundary, including device, UNC, drive-relative, alternate-data-stream, reserved-name, trailing-dot/space, or symlink/junction escape checks.

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

Unsafe absolute or device-style inputs are replaced with `[unsafe path omitted]`.

### 7.3 `PATH_BLOCKED`

Use when the requested path is inside the workspace boundary but blocked by configured safety globs.

Stable message:

```text
The requested path is blocked by safety rules.
```

Exact details:

```json
{
  "path": ".git/config"
}
```

### 7.4 `FILE_NOT_FOUND`

Use when the resolved target does not exist and the filesystem reports `ENOENT`.

Stable message:

```text
The requested path does not exist.
```

Exact details:

```json
{
  "path": "missing.txt"
}
```

### 7.5 `NOT_A_FILE`

Use when the target is not a regular file, including the current `Not a file:` condition and applicable `EISDIR` or `ENOTDIR` filesystem failures.

Stable message:

```text
The requested path is not a regular file.
```

Exact details:

```json
{
  "path": "src"
}
```

### 7.6 `FILE_TOO_LARGE`

Use for either current size-limit condition:

- the complete source file exceeds the applicable full-file or bounded text-scan limit;
- the numbered selected line range exceeds the effective returned-output limit.

Stable message:

```text
The requested file or selected line range exceeds the configured read limit.
```

Exact details:

```json
{
  "path": "large.txt",
  "scope": "selection",
  "limit_bytes": 1000
}
```

`scope` is exactly `file` or `selection`.

`limit_bytes` is the actual applicable positive limit:

- full read: the effective `max_bytes` capped by `config.maxReadBytes`;
- ranged source scan: `textScanByteLimit(config)`;
- selected range output: the effective `max_bytes` capped by `config.maxReadBytes`.

The actual source file size is not added to the public contract in this slice.

### 7.7 `FILE_NOT_TEXT`

Use when the existing bounded binary detection finds a NUL byte and rejects the file as text.

Stable message:

```text
The requested file is not supported as text.
```

Exact details:

```json
{
  "path": "assets/image.bin"
}
```

This slice does not claim complete encoding validation. It preserves the current NUL-byte-based text guard.

### 7.8 `INVALID_LINE_RANGE`

Use when `readTextFile` determines that the effective end line is before the effective start line, including a start line beyond the file's total lines.

Stable message:

```text
The requested line range is invalid.
```

Exact details:

```json
{
  "path": "src/server.ts",
  "start_line": 200,
  "end_line": 100
}
```

Rules:

- `start_line` is the explicit input or the current default `1`;
- `end_line` is the explicit input when present, otherwise `null`;
- both numeric values, when present, are positive integers;
- the details report public request context, not internal stack or resolved paths.

The exact schema is therefore:

```text
{ path: string, start_line: positive integer, end_line: positive integer | null }
```

### 7.9 `INTERNAL_ERROR`

Use for failures that do not match one of the eight expected cases.

Stable message:

```text
The file could not be read because of an internal error.
```

Exact details:

```json
{}
```

Raw exception names, messages, stack traces, absolute paths, tokens, secrets, environment values, and filesystem internals must not be returned.

## 8. Error schema design

`src/tools/schemas/read.ts` owns a discriminated union for the nine allowed error variants.

Each variant fixes:

- one literal `code`;
- the corresponding literal stable public `message` from Section 7;
- `retryable: false`;
- a strict code-specific `details` object.

Expected details schemas:

```text
WORKSPACE_NOT_FOUND     -> { workspace_id: string, length 1..160 }
PATH_OUTSIDE_WORKSPACE  -> { path: string, length 1..240 }
PATH_BLOCKED            -> { path: string, length 1..240 }
FILE_NOT_FOUND          -> { path: string, length 1..240 }
NOT_A_FILE              -> { path: string, length 1..240 }
FILE_TOO_LARGE          -> { path: string, length 1..240, scope: "file" | "selection", limit_bytes: positive integer }
FILE_NOT_TEXT           -> { path: string, length 1..240 }
INVALID_LINE_RANGE      -> { path: string, length 1..240, start_line: positive integer, end_line: positive integer | null }
INTERNAL_ERROR          -> {}
```

The complete output schema must reject:

- unknown error codes;
- missing required detail fields;
- detail fields belonging to another code;
- additional top-level fields;
- additional `data` fields;
- malformed SHA-256 strings;
- impossible successful line relationships;
- inconsistent success/failure states.

## 9. Local error-classification boundary

The global `CodexProError` remains untyped. This slice adds a `read`-local classification boundary in `src/server.ts` and does not alter other tools.

Classification order:

1. explicit unknown workspace condition -> `WORKSPACE_NOT_FOUND`;
2. Node filesystem code `ENOENT` -> `FILE_NOT_FOUND`;
3. blocked-path condition -> `PATH_BLOCKED`;
4. current `Not a file:` condition or Node `EISDIR`/`ENOTDIR` -> `NOT_A_FILE`;
5. current complete-file size condition -> `FILE_TOO_LARGE` with `scope: file`;
6. current selected-range size condition -> `FILE_TOO_LARGE` with `scope: selection`;
7. current binary-file condition -> `FILE_NOT_TEXT`;
8. current invalid-line-range condition -> `INVALID_LINE_RANGE`;
9. path escape, unsafe path form, or symlink/junction boundary rejection -> `PATH_OUTSIDE_WORKSPACE`;
10. otherwise -> `INTERNAL_ERROR`.

The classifier may recognize current known `CodexProError` message prefixes only inside this local adapter. Tests lock those mappings. Any unrecognized message fails closed to `INTERNAL_ERROR`.

The existing safe workspace-ID and path-detail behavior used by `tree` may be reused internally. No unsafe input or resolved absolute path may enter error details.

This message-coupled adapter remains an explicit temporary limitation until a separately approved typed internal-error refactor.

## 10. Schema ownership

Implementation creates:

```text
src/tools/schemas/read.ts
```

It owns:

- exact `read` data schema;
- nine exact error variants;
- complete success/failure output schema;
- inferred TypeScript types;
- success and failure construction helpers;
- stable public messages and exact detail validation.

`src/tools/schemas/common.ts` remains the owner of:

- schema version;
- shared metadata schema;
- generic stable-error base fields;
- shared metadata construction.

The slice should reuse existing common contracts without expanding them unless implementation proves a minimal tool-agnostic correction is required. Any common change must preserve both published `server_config` and `tree` contracts.

Do not add parallel handwritten result interfaces that can drift from Zod.

## 11. Handler data flow

Successful flow:

```text
read MCP call
    ↓
start duration measurement
    ↓
resolve current or explicit workspace
    ↓
normalize read path and options
    ↓
call existing readTextFile implementation
    ↓
validate exact read data
    ↓
construct strict success envelope
    ↓
return existing readable read content
```

Failure flow:

```text
workspace lookup / path validation / file check / read / range selection throws
    ↓
read-local classifier
    ↓
safe code-specific details
    ↓
strict failure envelope
    ↓
MCP result with isError: true and readable safe content
```

The direct `read` handler catches its own expected and unexpected errors so valid tool inputs return the exact failure schema instead of the common legacy `{ error: string }` shape.

Input-schema validation remains outside this tool-local handler. The existing `codexpro` supertool malformed-argument behavior remains unchanged and is not advertised as a direct `read` result.

## 12. Constructor-only test seam

Extend `CodexProServerDependencies` with one programmatic `readResultProvider` seam.

Its intended shape is equivalent to:

```ts
export interface ReadProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  options: {
    startLine?: number;
    endLine?: number;
    maxBytes?: number;
  };
}

readResultProvider?: (context: ReadProviderContext) => Promise<ReadFileResult>;
```

The production default invokes the existing `readTextFile` implementation.

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

The `read` descriptor advertises its exact `outputSchema` from the same Zod source used to validate constructed results.

The descriptor requires exactly:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

No descriptor for another tool changes in this slice.

The existing `registerToolCompat`, `tagToolResult`, redaction, duration attachment, and readable content behavior remain in place.

## 14. Tool-card compatibility

Add dedicated `read` handling instead of routing the migrated result through the old generic `renderFile` branch.

The card must:

- keep top-level `codexpro_tool` and `codexpro_title` for routing and the header;
- read successful fields only from `structuredContent.data`;
- use `data.path` as the subtitle or supporting path;
- show a bounded preview of `data.text`;
- show `data.bytes`;
- show the selected line range and total line count;
- show whether `data.truncated` is true;
- display the stable error code and safe message when `ok` is false;
- avoid rendering raw internal error data.

The generic `renderFile` branch remains unchanged for write, edit, patch, Git diff, and Pro-context results.

## 15. Human-readable content compatibility

Success retains the existing readable output containing:

- path;
- selected line range;
- total line count;
- complete source-file byte count;
- SHA-256 value;
- numbered selected text.

Failure returns concise safe text containing the stable code and stable public message. It must not contain raw internal exception text.

Direct structured consumers must migrate to `structuredContent.data`. Old successful top-level aliases are not retained.

## 16. Proven consumer migration

Repository inspection found real `read` calls in:

```text
scripts/smoke.mjs
scripts/stress.mjs
```

Most Smoke assertions inspect readable `content`, `isError`, or the serialized complete result and therefore do not require field migration.

The implementation must update only proven old top-level structured-field consumers, including the current Stress checks for:

- both supertool `read` text checks;
- full-read `endLine`;
- ranged-read `text`;
- absolute-alias read `path`;
- `FILE_TOO_LARGE` error inspection;
- the late-NUL `read` expectation, whose legacy `/binary/i` text match must become a stable `FILE_NOT_TEXT` code check.

The migrated checks must read success fields from `structuredContent.data` and stable failures from `structuredContent.error`. Generic error helpers may remain unchanged when their serialized-result checks still match the new stable contract.

The separate invalid Windows Stress fixture remains untouched.

## 17. Test design

Create:

```text
test/read-contract.test.mjs
```

The focused test file covers:

1. strict success constructor;
2. all nine strict failure constructors;
3. rejection of unknown codes, wrong details, malformed hash, impossible line relationships, and extra fields;
4. rejection of inconsistent success/failure states;
5. exact advertised descriptor requirements;
6. real MCP success using a bounded source-file range;
7. `WORKSPACE_NOT_FOUND`;
8. `PATH_OUTSIDE_WORKSPACE`;
9. `PATH_BLOCKED`;
10. `FILE_NOT_FOUND`;
11. `NOT_A_FILE` using an existing directory;
12. `FILE_TOO_LARGE` for a complete-file limit;
13. `FILE_TOO_LARGE` for a selected-range limit;
14. `FILE_NOT_TEXT` using a temporary NUL-containing file;
15. `INVALID_LINE_RANGE` using a start line beyond the file;
16. fixed redacted `INTERNAL_ERROR` through the provider seam;
17. readable success content;
18. readable failure content and `isError: true`;
19. dedicated card routing and nested-data-only source contract.

Temporary fixtures must be created under a bounded temporary workspace and removed in `finally` or test cleanup.

Regression verification includes:

- existing `server_config` contract tests;
- existing `tree` contract tests;
- complete Node test suite;
- TypeScript build;
- Smoke;
- relevant Stress checks or the supported platform-compatible subset;
- package dry run;
- audit;
- documentation tests;
- whitespace, conflict-marker, NUL, credential-pattern, stale-consumer, and changed-scope checks.

## 18. File scope

Expected created files:

```text
src/tools/schemas/read.ts
test/read-contract.test.mjs
docs/superpowers/specs/2026-07-12-read-output-schema-design.md
docs/superpowers/plans/2026-07-12-read-output-schema.md
```

Expected modified files during implementation and closeout:

```text
src/server.ts
src/toolCardWidget.ts
scripts/stress.mjs
Memory.md
docs/memory/archive/phase-1.md
docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md
AGENTS.md
```

`scripts/smoke.mjs` changes only if a proven old top-level structured-field consumer is found during implementation. Current inspection found no required successful-field migration there.

No unrelated source, configuration, dependency, authentication, Cloudflare, shell, process, Git, or workspace file may change.

## 19. Acceptance criteria

The slice is complete only when:

1. `read` advertises an exact output schema;
2. real successful `read` output validates against the schema;
3. all ten existing successful fields are present only under `data`;
4. all nine approved errors validate against exact code-specific schemas;
5. expected real failures map to their approved stable codes;
6. unexpected failures become a fixed redacted `INTERNAL_ERROR`;
7. failures preserve `isError: true` and readable safe content;
8. success preserves readable numbered file content;
9. the dedicated card reads only nested `data` fields;
10. proven internal consumers use nested success data and structured stable errors;
11. published `server_config` and `tree` contract regressions pass;
12. full local verification passes except the separately documented native-Windows Stress fixture limitation;
13. Memory and Phase 1 archive records contain actual evidence;
14. implementation remains one independently reversible `read` slice.

## 20. Risks and limitations

- The local classifier remains coupled to current error-message prefixes.
- `root` remains an absolute successful path.
- `sha256` retains current decoded-text and pre-redaction semantics.
- NUL-byte detection is not complete text-encoding validation.
- Tool-card structured-string compaction can bound `data.text` without changing the line-selection `truncated` flag.
- Tool-card verification remains primarily a source-contract test unless a later separately approved browser-level test harness is added.
- The global `CodexProError` remains untyped.
- The `codexpro` supertool can add wrapper metadata fields around a child result and retains legacy handling for malformed child arguments.
- Native Windows `npm run stress` remains blocked by the unrelated invalid fixture filename.

## 21. Rollback

Before publication, rollback consists of restoring only the files changed by this slice.

After publication, rollback must use a normal revert commit. Do not rewrite history or force-push.

Rollback must not weaken path safety, redaction, authentication, or the published `server_config` and `tree` contracts.

## 22. Planning boundary

This design authorizes writing a detailed TDD implementation plan for `read`.

It does not authorize source implementation, staging, commit, push, credential changes, profile changes, Cloudflare changes, or Phase 2 work.

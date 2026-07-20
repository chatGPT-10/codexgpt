# Phase 1 Fourth Slice Design: Exact `git_status` Output Schema

**Date:** 2026-07-12
**Status:** Published in implementation commit `bc92970`; CI run `29202896685` passed on Ubuntu/Windows with Node 20/24
**Scope:** One vertical slice for `git_status` only

## 1. Purpose

Phase 1 establishes exact MCP output schemas and stable errors one tool at a time. The published `server_config`, `tree`, and `read` slices proved the strict result envelope, exact advertised schema, stable failure structure, readable MCP content, dedicated tool-card migration, real MCP contract testing, and constructor-only failure-injection pattern.

The fourth slice applies that pattern to `git_status`. It must preserve current Git-status behavior while replacing the legacy ambiguous result shape with a precise machine-readable contract.

This slice must prove the full path:

1. an exact advertised `git_status.outputSchema`;
2. actual success and failure results that validate against it;
3. all approved successful fields moved under `data` without changing their current meanings;
4. expected workspace, path-policy, Git-availability, repository, command, and internal failures mapped to stable public errors;
5. unchanged human-readable MCP `content` on success;
6. retained MCP `isError: true` behavior on failure;
7. a dedicated tool card that reads the nested `data` shape;
8. proven direct and supertool consumers migrated from old top-level structured fields;
9. contract tests covering registration, clean and changed repositories, path scoping, stable errors, redaction, duration, provider failure, card compatibility, and consumer compatibility.

## 2. Considered approaches

### 2.1 Recommended and approved: tool-local exact `git_status` contract

Create one `git_status`-specific schema module, one local error-classification boundary, one constructor-only provider seam, and one dedicated nested-data card path.

Advantages:

- follows the three published Phase 1 slices;
- limits behavior change to one full-mode tool;
- preserves the current Git implementation and its existing consumers outside this slice;
- avoids prematurely defining a repository-wide typed Git service;
- avoids reopening `git_diff` and `show_changes`;
- remains independently testable and reversible.

This is the approved approach.

### 2.2 Deferred: typed Git operation results in `src/gitOps.ts`

Change `runGit`, `gitStatus`, `gitDiff`, `gitDiffStatus`, and `gitLog` to return discriminated typed results instead of strings.

This would provide a stronger long-term boundary, but it would affect several tools and consumers at once. It is deferred until enough Git tools are ready for a shared service design.

### 2.3 Deferred: parsed porcelain file-entry objects

Replace `changed_files: string[]` with entries such as:

```text
index_status
worktree_status
path
original_path
```

This would improve machine readability but change the current field meaning, require a robust Git porcelain parser, expand rename/copy/quoting coverage, and force broader consumer migration. It is deferred to a later versioned Git-contract step.

## 3. Non-goals

This slice does not:

- migrate any tool other than `git_status`;
- change `git_diff`, `show_changes`, `git_log`, review checkpoints, or change analysis;
- add Git stage, commit, restore, stash, branch, push, remote, credential, or worktree operations;
- parse Git status into new structured file objects;
- rename `changed_files` or change it into a pure path array;
- add a second pure-path field;
- change `git status --short --branch` arguments;
- add a `staged` input to `git_status`;
- require explicit `workspace_id` when it is currently optional;
- alter workspace ID generation, default-workspace fallback, ownership, expiry, close behavior, or session binding;
- begin Phase 2 workspace lifecycle work;
- refactor the global `CodexGPTError` class;
- build a global Git error framework or typed Git service;
- change path-policy behavior in `PathGuard`;
- change the successful `root` value from its current absolute representation;
- change current Git output redaction;
- repair Git configuration, trust, safe-directory, repository ownership, or executable discovery automatically;
- fix the unrelated native-Windows Stress fixture containing `visible:123:file.txt`;
- add dependencies, environment flags, CLI options, hidden MCP arguments, HTTP routes, or production failure switches;
- stage, commit, push, modify credentials, change profiles, or alter Cloudflare state.

## 4. Current behavior

`git_status` is registered in `src/server.ts` through `registerCodexTool` and is exposed only in full tool mode.

Its current input is:

```text
workspace_id?: string
path?: string
```

The current handler:

1. resolves the current or explicit workspace;
2. passes an optional path to `gitStatus`;
3. runs `git status --short --branch` in the workspace;
4. when a non-blank path is supplied, validates it through `PathGuard` and appends `-- <relative-path>`;
5. receives one redacted string from `src/gitOps.ts` whether Git succeeded or failed;
6. detects apparent Git errors through text matching;
7. extracts non-branch status lines into `changed_files`;
8. returns readable text equal to the raw status string;
9. returns legacy structured fields at the top level.

The current successful structured fields are:

```text
workspace_id
root
path
status
changed_files
changed
```

The current handler also conditionally emits:

```text
status_error
```

That field is not a real success datum. It embeds command failure inside an otherwise successful MCP result and makes `changed=false` ambiguous between a clean repository and a failed Git operation.

`changed_files` is also named imprecisely. It currently contains cleaned Git status lines such as:

```text
 M src/server.ts
?? new-file.txt
R  old-name.txt -> new-name.txt
```

It is not a pure file-path array. This slice preserves that established meaning rather than introducing a parser inside a protocol-only migration.

Before this slice, `git_status` has no exact `outputSchema`. Handler exceptions fall through to the common wrapper and produce `isError: true`, readable error text, and the legacy structured shape `{ error: string }`.

## 5. Approved structured result contract

### 5.1 Top-level envelope

Direct `git_status.structuredContent` contains exactly:

```text
codexgpt_tool
codexgpt_title
ok
data
error
meta
```

Tool identity remains at the top level for CodexGPT routing and card headers.

All `git_status`-specific successful fields live only under `data`. They are not duplicated at the top level.

### 5.2 Successful result

A successful changed-worktree result has this shape:

```json
{
  "codexgpt_tool": "git_status",
  "codexgpt_title": "Git Status",
  "ok": true,
  "data": {
    "workspace_id": "ws_0123456789abcdef",
    "root": "D:\\Dev\\codexgpt",
    "path": "workspace status",
    "status": "## main...origin/main\n M src/server.ts\n?? new-file.txt",
    "changed_files": [
      "M src/server.ts",
      "?? new-file.txt"
    ],
    "changed": true
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 4,
    "warnings": []
  }
}
```

A clean result retains the same data shape:

```json
{
  "workspace_id": "ws_0123456789abcdef",
  "root": "D:\\Dev\\codexgpt",
  "path": "workspace status",
  "status": "## main...origin/main",
  "changed_files": [],
  "changed": false
}
```

### 5.3 Exact `data` contract

The successful `data` object contains exactly:

- `workspace_id: string, length >= 1`;
- `root: string`;
- `path: string`;
- `status: string`;
- `changed_files: array of non-empty strings`;
- `changed: boolean`.

Rules:

- Existing field names and casing are retained exactly.
- `root` remains the canonical absolute workspace root currently returned by `WorkspaceManager`.
- `path` preserves current output behavior:
  - when the argument is omitted, it is exactly `workspace status`;
  - when supplied, the original input string is retained in the result;
  - a blank or whitespace-only input remains an unscoped Git operation because `gitStatus` scopes only non-blank values.
- `status` remains the existing redacted human-readable output of `git status --short --branch`.
- `changed_files` remains the existing list of non-empty, non-branch status lines after current trimming.
- `changed_files` entries are status records, not guaranteed pure paths.
- `changed` must equal `changed_files.length > 0`.
- Branch header lines beginning with `##` are excluded from `changed_files`.
- No additional successful fields are allowed without a later schema revision.
- `status_error` is removed from successful data. Git execution failures use the failure envelope.

### 5.4 Pathspec behavior

The optional `path` is a Git pathspec after workspace safety validation.

A safe path that does not currently exist is not a file-read failure. Git may validly report no matching changes. Therefore:

- a nonexistent safe path returns success;
- `changed_files` is empty when Git reports no changes for it;
- `changed` is `false`;
- this slice does not define `FILE_NOT_FOUND` or `NOT_A_FILE`.

This preserves Git pathspec semantics and avoids incorrectly coupling status inspection to filesystem existence.

### 5.5 Failed result

A failed result has this shape:

```json
{
  "codexgpt_tool": "git_status",
  "codexgpt_title": "Git Status",
  "ok": false,
  "data": null,
  "error": {
    "code": "GIT_NOT_REPOSITORY",
    "message": "The workspace is not a Git repository.",
    "retryable": false,
    "details": {}
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

`git_status.meta` reuses the Phase 1 shared contract from `src/tools/schemas/common.ts` and contains exactly:

- `schemaVersion`;
- `durationMs`;
- `warnings`.

Rules:

- `schemaVersion` is the integer `1`.
- `durationMs` is a non-negative number covering the complete direct `git_status` handler attempt, including workspace lookup, optional path validation, Git execution, classification, and result construction.
- `warnings` is always an array of strings and is `[]` in this slice.
- `requestId` remains omitted until a trustworthy transport-aware identity is designed.

## 7. Approved stable errors

The fourth slice permits exactly these codes:

```text
WORKSPACE_NOT_FOUND
PATH_OUTSIDE_WORKSPACE
PATH_BLOCKED
GIT_NOT_REPOSITORY
GIT_UNAVAILABLE
GIT_COMMAND_FAILED
INTERNAL_ERROR
```

All seven use:

```text
retryable: false
```

Immediate automatic retry is not claimed useful. The caller must open the correct workspace, correct the path, install or repair Git, select a repository, fix the Git condition, or investigate an internal failure.

### 7.1 `WORKSPACE_NOT_FOUND`

Use when the caller supplies an explicit `workspace_id` that is not open in the current `WorkspaceManager`.

Stable message:

```text
The requested workspace is not available. Open the workspace before retrying.
```

Exact details:

```json
{
  "workspace_id": "ws_missing"
}
```

The value is cleaned, length-bounded, and redacted through the existing result pipeline.

### 7.2 `PATH_OUTSIDE_WORKSPACE`

Use when the requested path escapes the workspace or violates an applicable unsafe path-form boundary, including:

- null-byte paths;
- parent escape;
- symlink or junction escape;
- Windows device paths;
- UNC paths;
- drive-relative Windows paths;
- NTFS alternate data streams;
- reserved Windows device names;
- trailing-dot or trailing-space Windows segments.

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

Unsafe absolute or device-style input is replaced with `[unsafe path omitted]`.

### 7.3 `PATH_BLOCKED`

Use when the path is inside the workspace boundary but blocked by configured safety globs.

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

### 7.4 `GIT_NOT_REPOSITORY`

Use when Git reports that the workspace is not a Git repository.

Stable message:

```text
The workspace is not a Git repository.
```

Exact details:

```json
{}
```

Raw Git stderr, repository-discovery paths, and absolute directories are not exposed through `details`.

### 7.5 `GIT_UNAVAILABLE`

Use when the Git executable cannot be started because it is unavailable, including the current spawn-error representation containing an executable-not-found condition such as `ENOENT`.

Stable message:

```text
Git is not available to inspect this workspace.
```

Exact details:

```json
{}
```

This error does not install Git, change `PATH`, or expose the attempted executable search.

### 7.6 `GIT_COMMAND_FAILED`

Use when Git is available or a Git spawn was attempted but the status operation fails for an expected Git/process reason that is neither a non-repository condition nor executable absence.

Examples include current output forms beginning with:

```text
fatal:
error:
git exited with status
usage: git
```

It also covers non-`ENOENT` spawn failure text currently returned through the `git unavailable or failed:` prefix, such as output-buffer or process-launch failures.

Stable message:

```text
Git could not inspect the workspace status.
```

Exact details:

```json
{}
```

Raw stderr is retained only for internal classification and is not returned in the stable structured error.

### 7.7 `INTERNAL_ERROR`

Use for all unrecognized exceptions, provider failures, malformed provider output, schema-construction failures, and unclassified conditions.

Stable message:

```text
The Git status could not be read because of an internal error.
```

Exact details:

```json
{}
```

The response must not expose:

- stack traces;
- raw exception text;
- absolute internal paths;
- environment values;
- secret-looking values;
- raw Git stderr.

## 8. Error-classification boundary

The slice adds a local `classifyGitStatusFailure` adapter in `src/server.ts` rather than changing the global error model.

Classification order must be deterministic:

1. explicit unknown workspace ID -> `WORKSPACE_NOT_FOUND`;
2. blocked path prefix -> `PATH_BLOCKED`;
3. unsafe/outside path prefixes -> `PATH_OUTSIDE_WORKSPACE`;
4. output containing `not a git repository` -> `GIT_NOT_REPOSITORY`;
5. `git unavailable or failed:` output containing an executable-not-found marker such as `ENOENT` -> `GIT_UNAVAILABLE`;
6. other recognized Git/process failure text -> `GIT_COMMAND_FAILED`;
7. everything else -> `INTERNAL_ERROR`.

The classifier operates only at the `git_status` boundary. It does not alter global `looksLikeGitError`, `runGit`, `gitDiff`, `gitDiffStatus`, or `gitLog` behavior.

Because `gitStatus` currently returns command failures as strings instead of throwing typed errors, the handler must detect a recognized Git-failure string and deliberately construct a failed envelope. A recognized failure string must never be passed to the success constructor.

## 9. Schema ownership and constructors

Create:

```text
src/tools/schemas/gitStatus.ts
```

It owns:

- `GIT_STATUS_ERROR_MESSAGES`;
- strict `gitStatusDataSchema`;
- strict code-specific error schemas;
- discriminated `gitStatusErrorSchema`;
- `gitStatusOutputShape` for MCP registration;
- strict `gitStatusOutputSchema` for validation and tests;
- inferred `GitStatusData` and `GitStatusStructuredResult` types;
- `GitStatusFailureInput`;
- `createGitStatusSuccess`;
- `createGitStatusFailure`.

It reuses only the shared metadata contract and constructor from:

```text
src/tools/schemas/common.ts
```

Constructor rules:

- constructors parse before returning;
- unknown fields are rejected;
- success requires non-null data and null error;
- failure requires null data and non-null error;
- the error code determines the exact message, retryability, and details schema;
- `changed` consistency with `changed_files` is schema-enforced;
- direct handler output is created through these constructors rather than manually assembling the envelope.

## 10. Provider seam

Add the narrow context:

```ts
export interface GitStatusProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
}
```

Extend `CodexGPTServerDependencies` with:

```ts
gitStatusResultProvider?: (
  context: GitStatusProviderContext
) => string | Promise<string>;
```

The default provider calls the existing operation:

```ts
gitStatus(config, workspace, guard, path)
```

Rules:

- the seam exists only on `createCodexGPTServer` construction;
- it is used for deterministic contract tests, especially unavailable Git, command failure, malformed output, secret-bearing exceptions, and `INTERNAL_ERROR`;
- it is not reachable through environment variables, CLI flags, MCP arguments, HTTP routes, saved profiles, or production runtime controls;
- production behavior remains the current `gitStatus` implementation.

## 11. Handler flow

The direct `git_status` handler becomes:

1. resolve the workspace;
2. derive the optional string path exactly as in the pre-slice implementation;
3. call `gitStatusResultProvider`;
4. inspect the returned string for recognized Git failure forms;
5. if it is a failure, classify and return `createGitStatusFailure` with `isError: true`;
6. otherwise extract current status lines using the existing behavior;
7. parse exact successful data;
8. return the unchanged readable status text plus `createGitStatusSuccess(data)`.

Thrown workspace, path-policy, provider, and schema errors are caught locally, classified, and returned through the same failure envelope.

The common wrapper remains responsible for final duration attachment, tool identity tagging, redaction, logging, and card compaction.

## 12. Human-readable content

### 12.1 Success

Successful `content[0].text` remains the current redacted Git status string.

Examples:

```text
## main...origin/main
```

or:

```text
## main...origin/main
 M src/server.ts
?? new-file.txt
```

No new Markdown wrapper is required on success because preserving the concise command-style output is the compatibility target.

### 12.2 Failure

Failure text uses only stable public information:

```text
# Git Status Error

Code: GIT_NOT_REPOSITORY
The workspace is not a Git repository.
```

It must not include raw stderr or internal exception text.

## 13. Tool Card migration

`git_status` retains a dedicated `renderStatus` route, but the renderer reads the exact nested shape.

Subtitle behavior:

- failure -> `error.code` or `Git status unavailable`;
- changed success -> `<count> changed entries`;
- clean success -> `Working tree clean`.

Renderer behavior:

- on failure, display only `error.message` and a stable error-code pill;
- on success, read `data.changed_files`, `data.status`, and `data.changed`;
- render status codes and names using the current lightweight line presentation;
- retain a bounded, folded raw-status preview;
- do not read `status_error`;
- do not fall back to legacy top-level `changed_files`, `status`, or `changed` for `git_status`.

This migration must not change the legacy top-level field handling used by `show_changes`, because that is a separate future slice.

## 14. Supertool compatibility

The `codexgpt` supertool dispatches to the registered `git_status` handler and then adds its current wrapper metadata:

```text
codexgpt_super_action
wrapped_tool
```

The direct `git_status.outputSchema` describes only the direct tool result and remains strict.

The supertool result is not parsed as a direct `gitStatusOutputSchema` because the supertool intentionally adds wrapper fields. Nevertheless:

- nested `data`, `error`, `ok`, and `meta` from the child remain unchanged;
- `codexgpt_tool` remains `git_status` after wrapper merging;
- existing `codexgpt(action=git_status)` consumers must migrate to `structuredContent.data.changed_files` and related nested fields;
- malformed supertool child arguments remain outside this slice.

## 15. Consumer audit and migration

Confirmed direct legacy consumers for this slice are:

### 15.1 `scripts/stress.mjs`

Migrate:

```text
scopedStatus.structuredContent.changed_files
```

to:

```text
scopedStatus.structuredContent.data.changed_files
```

Migrate the corresponding supertool assertion in the same way.

The assertions must continue proving path-scoped status does not include unrelated files.

### 15.2 `src/toolCardWidget.ts`

Migrate only the `git_status` subtitle and `renderStatus` branches to nested `data` and stable `error`.

Do not change `show_changes` branches that use similarly named top-level fields.

### 15.3 No speculative migrations

Do not modify broad references merely because they contain the text `git_status` or `changed_files`. Tool inventory lists, descriptions, action names, CLI handoff fields, analysis CLI JSON, and `show_changes` consumers remain unchanged unless a real direct old-shape dependency is proven during implementation.

## 16. Contract tests

Create:

```text
test/git-status-contract.test.mjs
```

### 16.1 Constructor and schema tests

Cover:

1. success constructor produces exactly six top-level envelope fields;
2. success `data` contains exactly the six approved fields;
3. clean data validates with `changed_files=[]` and `changed=false`;
4. changed data validates with non-empty status lines and `changed=true`;
5. every approved failure constructor produces its exact code, message, `retryable=false`, and details shape;
6. unknown codes are rejected;
7. wrong details are rejected;
8. additional top-level, data, error, or metadata fields are rejected;
9. inconsistent `ok`, `data`, and `error` states are rejected;
10. inconsistent `changed` and `changed_files` are rejected.

### 16.2 Descriptor and real success tests

With an in-memory MCP client and temporary repositories, prove:

1. `git_status` is registered in full mode;
2. it advertises the exact `outputSchema`;
3. a clean committed repository returns a valid success envelope;
4. a modified tracked file returns one matching status line;
5. an untracked file is represented by the existing `??` status-line form;
6. branch headers stay in `status` but not `changed_files`;
7. a path-scoped call reports only matching changes;
8. a safe nonexistent pathspec returns success with no changed entries;
9. successful content remains readable Git status text;
10. `durationMs` is a real non-negative wrapper duration.

Tests must configure temporary Git user identity locally inside the fixture repository and must not depend on global Git identity.

### 16.3 Stable failure tests

Prove real or injected failures for:

- unknown explicit workspace -> `WORKSPACE_NOT_FOUND`;
- outside path -> `PATH_OUTSIDE_WORKSPACE`;
- blocked path -> `PATH_BLOCKED`;
- ordinary non-Git directory -> `GIT_NOT_REPOSITORY`;
- injected executable-not-found output -> `GIT_UNAVAILABLE`;
- injected recognized Git failure -> `GIT_COMMAND_FAILED`;
- injected thrown provider error -> `INTERNAL_ERROR`.

Each failure test must assert:

- `isError === true`;
- `ok === false`;
- `data === null`;
- exact stable message;
- exact strict details;
- non-negative duration;
- readable text exists;
- raw exception, raw stderr, stack, secrets, and unsafe absolute paths are absent.

### 16.4 Card source-contract tests

Prove that the `git_status` branches:

- read `data.changed_files`, `data.status`, and `data.changed`;
- read `error.code` and `error.message` on failure;
- do not use `status_error` for `git_status`;
- have a dedicated `renderStatus` route;
- do not disturb `show_changes` rendering.

### 16.5 Supertool and consumer tests

Prove:

- `codexgpt(action=git_status)` retains wrapper metadata;
- its child contract remains nested under `data`/`error`;
- the approved Stress assertions use the nested shape;
- no approved old top-level direct consumer remains.

## 17. Verification gates

The implementation plan must run the narrowest relevant checks first, then the complete project gates.

Minimum required evidence:

1. focused `git-status-contract` tests;
2. existing `server-config`, `tree`, and `read` contract tests;
3. complete Node test suite;
4. TypeScript build;
5. relevant Smoke sections and full Smoke suite;
6. Stress syntax plus the Git status/change section where supported;
7. `git diff --check`;
8. source/consumer search proving no stale approved `git_status` top-level access;
9. credential-pattern and NUL checks on changed text files;
10. `npm audit --audit-level=high`;
11. `npm pack --dry-run` confirming the compiled schema is included and internal tests, Memory, specs, and plans remain excluded;
12. documentation tests after updating active records.

Results must distinguish passed, failed, not run, environment-blocked, and platform-skipped states.

## 18. Files expected during implementation

The expected focused implementation set is:

```text
src/tools/schemas/gitStatus.ts
test/git-status-contract.test.mjs
src/server.ts
src/toolCardWidget.ts
scripts/stress.mjs
docs/superpowers/plans/2026-07-12-git-status-output-schema.md
docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md
docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md
AGENTS.md
Memory.md
docs/memory/archive/phase-1.md
```

This list is a planning boundary, not permission to modify every file automatically. Any additional source or test file requires a demonstrated direct dependency. Dependency files, generated lockfiles, authentication state, profiles, and Cloudflare configuration are not expected to change.

## 19. Risks and limitations

### 19.1 String-coupled Git classification

The current Git layer converts spawn and command failures into strings. The local classifier therefore depends on known prefixes and message fragments. This is less robust than typed internal results but keeps this slice bounded.

Mitigation:

- fixed classification order;
- focused tests for every recognized form;
- `INTERNAL_ERROR` fallback;
- no raw error returned publicly;
- future typed Git service remains possible without changing this public schema.

### 19.2 `changed_files` naming remains imperfect

The field contains status lines, not guaranteed paths. Preserving it avoids an unversioned semantic break but leaves naming debt.

Mitigation:

- document the exact meaning;
- enforce non-empty strings only;
- defer parsed entries to a later versioned contract.

### 19.3 Raw `status` is command-oriented text

`status` remains useful for humans but is not a stable parser interface across every Git version and repository state.

Mitigation:

- machine logic should rely only on the documented `changed` invariant and bounded `changed_files` semantics in schema version 1;
- future parsed status entries require a new approved contract.

### 19.4 Git output limits

The existing synchronous Git runner uses the configured output buffer. Very large repositories may produce a command failure rather than a partial status.

Mitigation:

- classify recognized buffer/process failure as `GIT_COMMAND_FAILED`;
- do not claim partial completeness;
- do not add pagination or truncation semantics in this slice.

### 19.5 Absolute root remains exposed

Successful `root` remains the current absolute workspace root for compatibility. This slice does not redesign path presentation.

### 19.6 Tool availability remains full-mode only

`git_status` remains absent from minimal and standard modes. The slice does not broaden tool exposure.

### 19.7 Native Windows Stress limitation remains separate

The full Stress script remains blocked on native Windows by its pre-existing invalid colon-containing fixture. The focused Git tests must be cross-platform and may not depend on that fixture.

## 20. Rollback

Before commit:

- remove `src/tools/schemas/gitStatus.ts` and `test/git-status-contract.test.mjs`;
- restore the localized `src/server.ts`, `src/toolCardWidget.ts`, and `scripts/stress.mjs` edits;
- restore documentation and Memory updates;
- no dependency, credential, profile, workspace, or Cloudflare rollback is required.

After publication:

- use a normal revert commit for the complete `git_status` slice;
- append a correction record to Phase 1 Memory;
- do not rewrite history or force-push.

The existing legacy handler shape can be restored independently because this slice does not change shared Git operation semantics.

## 21. Acceptance criteria

The design is implemented only when all of the following are true:

- direct `git_status` advertises an exact output schema;
- direct success and all seven failures validate against the same schema;
- successful business fields exist only under `data`;
- `status_error` is absent from direct success results;
- clean and changed states are unambiguous;
- `changed === (changed_files.length > 0)` is enforced;
- safe nonexistent pathspecs remain successful clean results;
- Git failures return `isError: true` and stable public messages;
- raw Git stderr, stack traces, unsafe absolute paths, and secrets are not exposed in structured errors;
- the dedicated card reads only the new direct `git_status` shape;
- `show_changes` behavior is unchanged;
- direct and supertool Stress consumers use nested `data`;
- all focused, regression, build, Smoke, packaging, documentation, and applicable cross-platform gates pass;
- Memory and the Phase 1 archive record exact evidence;
- no Phase 2, Git write, authentication, profile, dependency, or Cloudflare work is introduced.

## 22. Current stopping point

The approved design and four-task TDD plan are implemented and published. Local evidence is: focused contract 17/17, complete Node suite 89/89, TypeScript Build passed, all 8 Smoke sections passed, Stress syntax passed, audit found 0 vulnerabilities, package dry-run contained 107 files with the compiled `gitStatus` schema included, and documentation regression passed 5/5.

Implementation commit `bc92970` is on `origin/main`; CI run `29202896685` passed on Ubuntu/Windows with Node 20/24. No implementation task is active. The next permitted action is a separately reviewed Phase 1 design for one additional tool. Do not begin Phase 2 or another tool implementation without explicit approval.

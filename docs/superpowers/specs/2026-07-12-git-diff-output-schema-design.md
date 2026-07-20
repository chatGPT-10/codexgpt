# `git_diff` Exact Output Schema Design

Date: 2026-07-12  
Phase: Phase 1, fifth vertical slice  
Status: Approved for implementation

## 1. Goal

Migrate only the direct `git_diff` MCP tool to the Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public error codes, and contract tests.

The slice must preserve the current user-visible Git diff behavior while preventing Git failures, path-policy failures, or internal exceptions from appearing as successful structured results.

## 2. Chosen approach

Use the same local boundary pattern already established by `git_status`:

1. Add a dedicated schema module at `src/tools/schemas/gitDiff.ts`.
2. Keep `src/gitOps.ts` unchanged.
3. Add narrow `git_diff` failure classifiers in `src/server.ts`.
4. Register `git_diff` with an exact `outputSchema`.
5. Return schema-v1 success or failure envelopes from the direct handler.
6. Preserve legacy text `content` for human-readable compatibility.
7. Add focused contract tests for schema, runtime behavior, redaction, and wrapper compatibility.

This approach is preferred over either retaining a loose flat object or refactoring all Git operations into a typed service. It gives the required public contract with the smallest isolated change.

## 3. Scope

### In scope

- Direct `git_diff` tool only.
- Exact advertised `outputSchema`.
- Strict success data schema.
- Strict discriminated error schema.
- Stable public error messages.
- Success/failure constructors that validate before returning.
- Runtime classification for workspace, path-policy, Git, malformed provider output, and unexpected exceptions.
- Focused `node:test` contract coverage.
- Existing smoke and stress test compatibility updates where the old flat structured fields are asserted.
- Tool-card support only where required for the direct `git_diff` nested envelope.
- `Memory.md`, Phase 1 archive, architecture roadmap, and changelog records for this slice.

### Out of scope

- `show_changes` public contract or review checkpoints.
- `git_status` public contract.
- `git_log`.
- `src/gitOps.ts` refactoring.
- Parsed diff hunks, file lists, rename analysis, or binary-diff modeling.
- Untracked-file content in `git_diff`.
- Git write operations.
- Dependencies, authentication, profiles, Cloudflare, shell/process behavior, or Phase 2.

## 4. Public success contract

The direct tool returns this envelope in `structuredContent`:

```json
{
  "codexgpt_tool": "git_diff",
  "codexgpt_title": "Git Diff",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexgpt",
    "path": "workspace diff",
    "staged": false,
    "include_diff": true,
    "additions": 1,
    "deletions": 0,
    "changed": true,
    "diff": "diff --git ..."
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### Success data fields

- `workspace_id`: non-empty workspace identifier.
- `root`: workspace root display string.
- `path`: original requested path, or `workspace diff` when omitted.
- `staged`: effective staged selection; default `false`.
- `include_diff`: effective raw-diff inclusion; default `true`.
- `additions`: non-negative integer counted from unified diff body lines.
- `deletions`: non-negative integer counted from unified diff body lines.
- `changed`: whether the normalized raw diff is non-empty.
- `diff`: normalized raw diff when `include_diff=true`; otherwise the empty string.

### Success invariants

The schema must reject success data unless all of these hold:

1. `changed=false` requires `additions=0`, `deletions=0`, and `diff=""`.
2. `include_diff=false` requires `diff=""`.
3. A non-empty `diff` requires `include_diff=true` and `changed=true`.
4. Unknown data fields are rejected.
5. The legacy `diff_error` field is not allowed in success data.

`changed=true` is allowed with zero line additions and deletions because metadata-only or binary Git diffs may contain a non-empty diff without ordinary `+` or `-` body lines.

## 5. Public failure contract

Failures return:

```json
{
  "codexgpt_tool": "git_diff",
  "codexgpt_title": "Git Diff",
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
    "durationMs": 0,
    "warnings": []
  }
}
```

Approved error codes:

- `WORKSPACE_NOT_FOUND`
- `PATH_OUTSIDE_WORKSPACE`
- `PATH_BLOCKED`
- `GIT_NOT_REPOSITORY`
- `GIT_UNAVAILABLE`
- `GIT_COMMAND_FAILED`
- `INTERNAL_ERROR`

All errors are non-retryable in schema version 1.

### Error details

- `WORKSPACE_NOT_FOUND`: `{ "workspace_id": "..." }`
- `PATH_OUTSIDE_WORKSPACE`: `{ "path": "..." }`
- `PATH_BLOCKED`: `{ "path": "..." }`
- Git and internal failures: `{}`

Absolute or otherwise unsafe paths must be replaced with `[unsafe path omitted]`. Raw Git diagnostics, exception messages, stack traces, workspace roots, and secret-bearing strings must not enter structured failure output.

## 6. Runtime flow

The direct handler must perform this sequence:

1. Resolve the workspace.
2. Determine effective `staged` and `include_diff` booleans.
3. Call the injectable `gitDiffResultProvider` boundary.
4. Require a string provider result; non-string values become `INTERNAL_ERROR`.
5. Normalize `(no output)` to the empty string.
6. Classify recognized Git diagnostic text before calculating stats.
7. Return a fixed failure envelope with `isError: true` for classified failures.
8. Otherwise calculate diff stats.
9. Parse strict success data.
10. Return the validated success envelope and legacy text content.
11. Catch thrown failures, classify them, and return fixed failure output with `isError: true`.

## 7. Dependency seam

Add an optional server dependency:

```ts
gitDiffResultProvider?: (input: {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
  staged: boolean;
}) => string | Promise<string>;
```

The default provider delegates to the current `gitDiff(...)` function. This seam exists only to test unavailable Git, command failures, malformed output, and secret-bearing exceptions deterministically. It does not change the public MCP tool.

## 8. Text compatibility

- Successful `include_diff=true` calls keep returning the raw diff text.
- Successful `include_diff=false` calls keep returning the existing compact stats text ending with `Raw diff omitted by include_diff=false.`
- Clean `include_diff=true` calls keep returning an empty text payload as produced by the existing handler path.
- Failures return a concise fixed heading, public code, and fixed public message.
- Raw Git diagnostics are not repeated in text failure output.

## 9. Wrapper compatibility

The `codexgpt` supertool action `git_diff` must continue preserving its wrapper metadata while carrying the nested child contract:

- `codexgpt_tool: "git_diff"`
- `codexgpt_super_action: "git_diff"`
- `wrapped_tool: "git_diff"`
- nested `ok`, `data`, `error`, and `meta`

No legacy flat `diff`, `additions`, `deletions`, `changed`, or `diff_error` fields may remain at wrapper top level.

## 10. Tool-card compatibility

The direct `git_diff` renderer must read direct success values only from `data` and failure values only from `error`.

`show_changes` must retain its existing flat renderer and contract. The change must not make `renderChanges` depend on the new direct `git_diff` envelope.

## 11. Tests

Create `test/git-diff-contract.test.mjs` covering:

1. Success constructor for changed, clean, stats-only, and metadata-only examples.
2. Every approved failure constructor.
3. Strict rejection of unknown fields and invalid detail shapes.
4. Success/failure envelope consistency.
5. Diff-data invariants.
6. Advertised `outputSchema`.
7. Clean repository result.
8. Unstaged changed result and line statistics.
9. `include_diff=false` semantics.
10. Staged-only selection.
11. Safe path scoping, blank path behavior, and safe nonexistent pathspec behavior.
12. Unknown workspace mapping.
13. Outside and blocked path mapping with safe details.
14. Non-Git repository mapping.
15. Injected Git absence mapping.
16. Injected Git command failure mapping.
17. Malformed provider output mapping.
18. Secret-bearing thrown exception redaction.
19. Direct tool-card nested-field behavior while preserving `show_changes`.
20. `codexgpt` wrapper compatibility.

Update existing smoke/stress assertions only where they directly access the old flat `git_diff` structured fields.

## 12. Acceptance criteria

The slice is accepted when:

- `git_diff` advertises an exact `outputSchema`.
- Every direct success result validates against `gitDiffOutputSchema`.
- Every direct failure result validates against `gitDiffOutputSchema` and sets `isError: true`.
- No raw Git diagnostic or exception text appears in structured failures.
- Existing `path`, `staged`, and `include_diff` behavior remains intact.
- `show_changes` behavior remains unchanged.
- Focused contract tests, build, complete Node 20/24 test gates, smoke, stress, and `git diff --check` pass.
- Documentation and `Memory.md` record completion of only this vertical slice.

## 13. Rollback

Rollback is limited to removing:

- `src/tools/schemas/gitDiff.ts`;
- `git_diff` imports, dependency seam, classifiers, exact `outputSchema`, and envelope handler changes;
- focused contract tests and compatibility assertion updates;
- this slice's documentation records.

`src/gitOps.ts` and `show_changes` require no rollback because they remain unchanged.

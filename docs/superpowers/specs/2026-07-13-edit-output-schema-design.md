# `edit` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, ninth vertical slice
Status: Implemented and locally validated; publication pending

## 1. Goal

Migrate only the direct `edit` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, focused contract tests, Tool Card compatibility, and `codexpro` wrapper compatibility.

The slice preserves the current exact-text replacement algorithm, single-match default, `replace_all`, `expected_replacements`, text-file and size checks, secret-content blocking, path policy, unified diff generation, analysis-cache invalidation, human-readable content, Windows behavior, and existing smoke/stress coverage.

## 2. Chosen approach

Use the established local boundary pattern:

1. Add `src/tools/schemas/edit.ts`.
2. Keep the replacement and write algorithms in `src/fsOps.ts` unchanged.
3. Export the existing edit result shape as `EditFileResult` rather than duplicating it.
4. Add one narrow injectable `editResultProvider` used only by the direct handler and contract tests.
5. Register direct `edit` with an exact `outputSchema`.
6. Return strict schema-v1 success or failure envelopes.
7. Give empty input, zero matches, ambiguous matches, and expected-count mismatch separate stable public classifications.
8. Keep current human-readable edit text in MCP `content`.
9. Add a dedicated nested-envelope Tool Card renderer for direct `edit`.
10. Preserve the existing flat consumer only for `apply_patch` and `export_pro_context`.

This is preferred over migrating `edit` and `apply_patch` together, folding all replacement failures into `INTERNAL_ERROR`, or beginning the later atomic-edit subsystem.

## 3. Scope

### In scope

- Direct `edit` tool only.
- Exact advertised `outputSchema`.
- Strict success data and stable public errors.
- An edit provider dependency seam.
- Existing exact-match, `replace_all`, and `expected_replacements` behavior.
- Existing analysis-cache invalidation only when the validated result reports a changed diff.
- Direct Tool Card nested-envelope rendering.
- `codexpro` wrapper compatibility.
- Focused `node:test` contract coverage.
- Smoke/stress compatibility updates only where old flat fields are inspected.
- Documentation, changelog, project memory, and Phase 1 archive updates during implementation.

### Out of scope

- `write` or `apply_patch` changes.
- Replacement algorithm changes, fuzzy matching, regular-expression editing, line-based editing, or semantic editing.
- `expectedHash`, file locking, conflict detection, atomic replace, fsync, rollback, multi-file transactions, change sets, or undo.
- Changes to secret detection, path policy, diff algorithms, file-size limits, authentication, dependencies, workspace lifecycle, or Phase 2/3.

## 4. Public success contract

```json
{
  "codexpro_tool": "edit",
  "codexpro_title": "Edit File",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "path": "src/example.ts",
    "replacements": 1,
    "bytes": 123,
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "additions": 2,
    "deletions": 1,
    "diff": "--- a/src/example.ts\n+++ b/src/example.ts\n..."
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
- `path`: safe workspace-relative returned path.
- `replacements`: positive integer count of exact replacements performed.
- `bytes`: non-negative UTF-8 byte count of final content.
- `sha256`: lowercase 64-character SHA-256 digest of final content.
- `additions`: non-negative diff addition count.
- `deletions`: non-negative diff deletion count.
- `diff`: existing bounded unified-diff text, including the current `No changes in <path>.` representation when `old_text` and `new_text` are identical.

Unknown fields are rejected. No public `changed`, `old_text`, or `new_text` field is added.

A successful no-diff replacement remains valid because the replacement precondition was satisfied even when the replacement text is identical. In that case, `replacements` remains positive while `additions` and `deletions` are zero.

## 5. Public failure contract

```json
{
  "codexpro_tool": "edit",
  "codexpro_title": "Edit File",
  "ok": false,
  "data": null,
  "error": {
    "code": "OLD_TEXT_NOT_UNIQUE",
    "message": "The requested old_text matched more than once. Use a more specific old_text or enable replace_all.",
    "retryable": false,
    "details": {
      "path": "src/example.ts",
      "matches": 3
    }
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

Approved errors:

- `WORKSPACE_NOT_FOUND`
- `PATH_OUTSIDE_WORKSPACE`
- `PATH_BLOCKED`
- `FILE_NOT_FOUND`
- `NOT_A_FILE`
- `FILE_NOT_TEXT`
- `FILE_TOO_LARGE`
- `INVALID_ARGUMENT`
- `OLD_TEXT_NOT_FOUND`
- `OLD_TEXT_NOT_UNIQUE`
- `REPLACEMENT_COUNT_MISMATCH`
- `SECRET_CONTENT_BLOCKED`
- `EDIT_FAILED`
- `INTERNAL_ERROR`

All are non-retryable in schema version 1 because the server must not encourage automatic retries of a file-writing operation.

### Fixed public messages

- `WORKSPACE_NOT_FOUND`: `The requested workspace is not available. Open the workspace before retrying.`
- `PATH_OUTSIDE_WORKSPACE`: `The requested path is outside the permitted workspace boundary.`
- `PATH_BLOCKED`: `The requested path is blocked by safety rules, including unsafe symlink targets.`
- `FILE_NOT_FOUND`: `The requested file does not exist.`
- `NOT_A_FILE`: `The requested path is not a regular file.`
- `FILE_NOT_TEXT`: `The requested file is not supported as a text file.`
- `FILE_TOO_LARGE`: `The requested edit exceeds the configured file-size limit.`
- `INVALID_ARGUMENT`: `The requested edit contains an invalid argument.`
- `OLD_TEXT_NOT_FOUND`: `The requested old_text was not found in the file.`
- `OLD_TEXT_NOT_UNIQUE`: `The requested old_text matched more than once. Use a more specific old_text or enable replace_all.`
- `REPLACEMENT_COUNT_MISMATCH`: `The requested replacement count did not match the number of replacements that would be performed.`
- `SECRET_CONTENT_BLOCKED`: `Secret-looking content is blocked because the edited file appears to contain a secret value.`
- `EDIT_FAILED`: `The file could not be edited by the operating system.`
- `INTERNAL_ERROR`: `The file could not be edited because of an internal error.`

### Error details

- `WORKSPACE_NOT_FOUND`: `{ "workspace_id": "..." }`
- path and content-policy failures: `{ "path": "..." }`
- `FILE_TOO_LARGE`: `{ "path": "...", "scope": "existing_file | edited_file", "limit_bytes": 1000000 }`
- `INVALID_ARGUMENT`: `{ "argument": "old_text" }`
- `OLD_TEXT_NOT_UNIQUE`: `{ "path": "...", "matches": 3 }`
- `REPLACEMENT_COUNT_MISMATCH`: `{ "path": "...", "expected": 2, "actual": 3 }`
- backend and internal failures: `{}`

Unsafe path details become `[unsafe path omitted]`. Raw exceptions, stack traces, absolute paths, old or new file content, secret-looking values, and operating-system diagnostics are excluded from structured and text output.

### Classification rules

- Unknown explicit workspace identifiers map to `WORKSPACE_NOT_FOUND`.
- Device, UNC, ADS, traversal, cross-root symlink/junction, and outside-parent failures map to `PATH_OUTSIDE_WORKSPACE`.
- Configured blocked paths and write-through-symlink refusal map to `PATH_BLOCKED`.
- Missing edit targets map to `FILE_NOT_FOUND`.
- Directory targets and invalid non-file path components map to `NOT_A_FILE`.
- Binary targets map to `FILE_NOT_TEXT`.
- Existing targets above `max(maxWriteBytes, maxReadBytes)` map to `FILE_TOO_LARGE` with `scope=existing_file`.
- Final edited content above `maxWriteBytes` maps to `FILE_TOO_LARGE` with `scope=edited_file`.
- Empty `old_text` maps to `INVALID_ARGUMENT` with `argument=old_text`.
- Zero exact matches map to `OLD_TEXT_NOT_FOUND`.
- More than one match while `replace_all=false` maps to `OLD_TEXT_NOT_UNIQUE` and exposes only the match count.
- A mismatch between `expected_replacements` and the computed replacement count maps to `REPLACEMENT_COUNT_MISMATCH`.
- Secret-looking final content maps to `SECRET_CONTENT_BLOCKED`.
- Recognized edit-time operating-system failures such as access denial, read-only filesystem, unavailable storage, or busy files map to `EDIT_FAILED`.
- Malformed provider results, provider path mismatch, and unrecognized exceptions map to `INTERNAL_ERROR`.

## 6. Runtime flow

1. Resolve the workspace.
2. Convert `path`, `old_text`, and `new_text` to the current string representations without changing existing input semantics.
3. Resolve the requested path for write and enforce `assertWriteToolAllowed` before invoking the provider.
4. Normalize `replace_all` and pass through the validated optional `expected_replacements` value.
5. Call the injectable edit provider.
6. Strictly parse the provider result.
7. Require the provider-returned path to equal the already resolved workspace-relative target.
8. Build and strictly parse exact public success data.
9. Invalidate workspace analysis only when the validated provider result reports `diff.changed=true`.
10. Return the current human-readable content plus the strict success envelope.
11. Catch all failures, classify to one fixed public failure, and return `isError: true`.

No cache invalidation occurs for failed edits, malformed provider results, returned-path mismatches, or successful identical-text replacements with `diff.changed=false`.

## 7. Dependency seam

```ts
export interface EditProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  oldText: string;
  newText: string;
  options: {
    replaceAll: boolean;
    expectedReplacements?: number;
  };
}

editResultProvider?: (
  context: EditProviderContext
) => Promise<EditFileResult>;
```

`EditFileResult` is exported from `src/fsOps.ts` instead of duplicating the return shape. The default provider delegates to `editTextFile(...)`. No hidden MCP argument, production test mode, or global mutable test hook is added.

The provider result validator requires:

- a non-empty `path`;
- a positive integer `replacements`;
- non-negative integer `bytes`, `additions`, and `deletions`;
- a lowercase 64-character SHA-256 value;
- a strict diff object containing `diff`, `additions`, `deletions`, and `changed`;
- zero additions and deletions whenever `changed=false`.

It does not require `changed=true` when `replacements>0`, because identical replacement text is an allowed existing behavior.

## 8. Text compatibility

- Successful calls retain the current path, replacement count, bytes, SHA-256, diff stats, and unified-diff text.
- Failures use `# Edit File Error`, the fixed public code, and the fixed public message.
- Failure text never contains raw provider or operating-system diagnostics, absolute unsafe paths, `old_text`, `new_text`, or file content.

## 9. Wrapper and Tool Card compatibility

The `codexpro` supertool action `edit` preserves wrapper metadata and carries the child envelope. No legacy flat `path`, `replacements`, `bytes`, `sha256`, `additions`, `deletions`, or `diff` fields remain at wrapper top level.

Add a dedicated `renderEdit` consumer that:

- reads success values from `data`;
- reads failures from `error`;
- shows replacement, byte, and diff-stat pills;
- shows path and SHA-256 summary values;
- renders the returned diff on success;
- renders only the fixed public message on failure.

The shared legacy `renderFile` path remains only for `apply_patch` and `export_pro_context`.

## 10. Tests

Create `test/edit-contract.test.mjs` covering:

1. Strict success and every approved failure constructor.
2. Rejection of unknown fields, wrong details, malformed hashes, invalid counts, inconsistent envelope states, and inconsistent unchanged diff statistics.
3. Advertised exact `outputSchema`.
4. Real single replacement, `replace_all`, matching `expected_replacements`, Unicode text, and identical replacement text behavior.
5. Unknown workspace, outside path, blocked path, missing file, directory target, binary target, oversized existing file, and oversized edited result classification.
6. Empty `old_text`, zero matches, ambiguous matches, and expected-count mismatch classification.
7. Secret-content blocking without leaking edited content.
8. Recognized operating-system/provider edit failure, malformed provider result, and returned-path mismatch classification without raw diagnostic leakage.
9. Analysis-cache invalidation only for validated changed edits.
10. Human-readable content and `isError` behavior.
11. Dedicated Tool Card nested-field behavior.
12. `codexpro` wrapper compatibility.

Run focused contracts, adjacent `write` and `show_changes` contracts, the complete `node:test` suite, build, smoke, native-Windows stress, and diff check.

## 11. Acceptance criteria

- Direct `edit` advertises an exact `outputSchema`.
- Every direct success and failure validates against `editOutputSchema`.
- Edit fields exist only under `data`.
- Failures set `isError: true` and expose no raw diagnostic or edited content.
- Existing exact-replacement semantics and analysis invalidation remain intact.
- Tool Card and supertool consume the nested envelope.
- `apply_patch` remains behaviorally and structurally unchanged.
- Focused contracts, adjacent contracts, complete regression, build, smoke, stress, and diff check pass.
- Memory, Phase 1 archive, AGENTS documentation map, and changelog reflect the ninth slice before publication.

## 12. Rollback

Revert the slice commits. This removes `src/tools/schemas/edit.ts`, the provider seam, handler envelope, focused tests, dedicated Tool Card consumer, and documentation records while leaving the existing `src/fsOps.ts` edit algorithm unchanged.

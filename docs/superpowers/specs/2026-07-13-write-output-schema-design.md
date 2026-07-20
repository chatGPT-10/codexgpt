# `write` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, eighth vertical slice
Status: Published and cross-platform CI-validated

## 1. Goal

Migrate only the direct `write` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, focused contract tests, Tool Card compatibility, and `codexgpt` wrapper compatibility.

The slice preserves current file creation and overwrite behavior, write limits, secret-content blocking, path policy, diff generation, analysis-cache invalidation, human-readable content, Windows behavior, and existing smoke/stress coverage.

## 2. Chosen approach

Use the established local boundary pattern:

1. Add `src/tools/schemas/write.ts`.
2. Keep `src/fsOps.ts` write algorithms unchanged.
3. Add one narrow injectable `writeResultProvider` used only by the direct handler and contract tests.
4. Register direct `write` with an exact `outputSchema`.
5. Return strict schema-v1 success or failure envelopes.
6. Classify workspace, path, file type, size, secret, overwrite, parent-directory, operating-system write, malformed-provider, and unexpected failures into fixed public errors.
7. Keep current human-readable write text in MCP `content`.
8. Update only the direct `write` Tool Card consumer to nested `data` and `error` fields.
9. Preserve existing flat consumers for `edit`, `apply_patch`, and `export_pro_context`.

This is preferred over migrating all write tools together or beginning the later atomic-edit subsystem.

## 3. Scope

### In scope

- Direct `write` tool only.
- Exact advertised `outputSchema`.
- Strict success data and stable public errors.
- A write provider dependency seam.
- Existing `create_dirs` and `overwrite` behavior.
- Existing analysis-cache invalidation when the returned diff reports a change.
- Direct Tool Card nested-envelope rendering.
- `codexgpt` wrapper compatibility.
- Focused `node:test` contract coverage.
- Smoke/stress compatibility updates only where old flat fields are inspected.
- Documentation, changelog, project memory, and Phase 1 archive updates.

### Out of scope

- `edit` or `apply_patch` migration.
- `expectedHash`, file locking, conflict detection, atomic replace, fsync, rollback, multi-file transactions, or undo.
- Changes to secret detection, path policy, diff algorithms, write limits, authentication, dependencies, workspace lifecycle, or Phase 2/3.

## 4. Public success contract

```json
{
  "codexgpt_tool": "write",
  "codexgpt_title": "Write File",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexgpt",
    "path": "src/example.ts",
    "existed": true,
    "bytes": 123,
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "additions": 3,
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
- `existed`: whether the target existed before the call.
- `bytes`: UTF-8 byte count of final content.
- `sha256`: lowercase 64-character SHA-256 digest of final content.
- `additions`: non-negative diff addition count.
- `deletions`: non-negative diff deletion count.
- `diff`: existing bounded unified-diff text, including the current `No changes in <path>.` representation for an idempotent overwrite.

Unknown fields are rejected. No new public `changed` field is added.

## 5. Public failure contract

```json
{
  "codexgpt_tool": "write",
  "codexgpt_title": "Write File",
  "ok": false,
  "data": null,
  "error": {
    "code": "SECRET_CONTENT_BLOCKED",
    "message": "Secret-looking content is blocked because the requested content appears to contain a secret value.",
    "retryable": false,
    "details": {
      "path": "notes.md"
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
- `NOT_A_FILE`
- `FILE_NOT_TEXT`
- `FILE_TOO_LARGE`
- `SECRET_CONTENT_BLOCKED`
- `FILE_ALREADY_EXISTS`
- `PARENT_DIRECTORY_NOT_FOUND`
- `WRITE_FAILED`
- `INTERNAL_ERROR`

All are non-retryable in schema version 1 because the server must not encourage automatic retries of a write operation.

### Error details

- `WORKSPACE_NOT_FOUND`: `{ "workspace_id": "..." }`
- path and content-policy failures: `{ "path": "..." }`
- `FILE_TOO_LARGE`: `{ "path": "...", "scope": "content | existing_file", "limit_bytes": 1000000 }`
- backend and internal failures: `{}`

Unsafe path details become `[unsafe path omitted]`. Raw exceptions, stack traces, absolute paths, file content, secret-looking values, and operating-system diagnostics are excluded from structured and text output.

### Classification rules

- Device, UNC, ADS, traversal, cross-root symlink/junction, and outside-parent failures map to `PATH_OUTSIDE_WORKSPACE`.
- Configured blocked paths and write-through-symlink refusal map to `PATH_BLOCKED`.
- Directory targets map to `NOT_A_FILE`.
- Existing binary targets map to `FILE_NOT_TEXT`.
- New content above `maxWriteBytes` maps to `FILE_TOO_LARGE` with `scope=content`.
- Existing targets above the effective inspection limit map to `FILE_TOO_LARGE` with `scope=existing_file`.
- Secret-looking content maps to `SECRET_CONTENT_BLOCKED`.
- Existing targets with `overwrite=false` map to `FILE_ALREADY_EXISTS`.
- Missing parents with `create_dirs=false` map to `PARENT_DIRECTORY_NOT_FOUND`.
- Recognized write-time operating-system failures such as access denial, read-only filesystem, or unavailable storage map to `WRITE_FAILED`.
- Malformed provider results and unrecognized exceptions map to `INTERNAL_ERROR`.

## 6. Runtime flow

1. Resolve the workspace.
2. Resolve the requested path for write and enforce `assertWriteToolAllowed` before invoking the provider.
3. Call the injectable provider with config, guard, workspace, path, content, and normalized options.
4. Strictly parse the provider result into success data.
5. Invalidate workspace analysis only when the validated provider result reports `diff.changed=true`.
6. Return the current human-readable content plus the strict success envelope.
7. Catch all failures, classify to a fixed public failure, and return `isError: true`.

## 7. Dependency seam

```ts
export interface WriteProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  content: string;
  options: {
    createDirs: boolean;
    overwrite: boolean;
  };
}

writeResultProvider?: (
  context: WriteProviderContext
) => Promise<WriteFileResult>;
```

`WriteFileResult` is exported from `src/fsOps.ts` instead of duplicating the return shape. The default delegates to `writeTextFile(...)`. No hidden MCP argument or production test mode is added.

## 8. Text compatibility

- Successful calls retain the current path, existed, bytes, SHA-256, diff stats, and unified-diff text.
- Failures use `# Write File Error`, the fixed public code, and fixed public message.
- Failure text never contains raw provider or operating-system diagnostics.

## 9. Wrapper and Tool Card compatibility

The `codexgpt` supertool action `write` preserves wrapper metadata and carries the child envelope. No legacy flat `path`, `bytes`, `sha256`, `additions`, `deletions`, or `diff` fields remain at wrapper top level.

Add a dedicated `renderWrite` consumer that:

- reads success values from `data`;
- reads failures from `error`;
- shows byte and diff-stat pills;
- renders the returned diff on success;
- renders only the fixed public message on failure.

The shared legacy `renderFile` path remains for `edit`, `apply_patch`, and `export_pro_context`.

## 10. Tests

Create `test/write-contract.test.mjs` covering:

1. Strict success and every approved failure constructor.
2. Rejection of unknown fields, wrong details, malformed hashes/stats, and inconsistent envelope states.
3. Advertised exact `outputSchema`.
4. Real create, overwrite, no-change, `create_dirs`, and `overwrite=false` behavior.
5. Unknown workspace, outside path, blocked path, directory target, existing binary target, oversized content, oversized existing target, secret content, and missing parent classification.
6. Recognized operating-system/provider write failure and malformed provider-result classification without raw diagnostic leakage.
7. Analysis-cache invalidation only for changed writes.
8. Human-readable content and `isError` behavior.
9. Dedicated Tool Card nested-field behavior.
10. `codexgpt` wrapper compatibility.

Run focused contracts, the complete `node:test` suite, build, smoke, native-Windows stress, and diff check.

## 11. Acceptance criteria

- Direct `write` advertises an exact `outputSchema`.
- Every direct success and failure validates against `writeOutputSchema`.
- Write fields exist only under `data`.
- Failures set `isError: true` and expose no raw diagnostic.
- Existing write semantics and analysis invalidation remain intact.
- Tool Card and supertool consume the nested envelope.
- Focused contracts, complete regression, build, smoke, stress, and diff check pass.
- Memory, Phase 1 archive, AGENTS documentation map, and changelog reflect the eighth slice.

## 12. Rollback

Revert the slice commits. This removes `src/tools/schemas/write.ts`, the provider seam, handler envelope, focused tests, dedicated Tool Card consumer, and documentation records while leaving `src/fsOps.ts` write behavior unchanged.

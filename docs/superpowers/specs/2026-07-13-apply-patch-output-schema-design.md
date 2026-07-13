# `apply_patch` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, tenth vertical slice
Status: Published in commit `c761b4e`; CI run `29233787814` passed Ubuntu/Windows Node 20/24

## 1. Goal

Migrate only the direct `apply_patch` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, focused contract tests, Tool Card compatibility, and `codexpro` wrapper compatibility.

The slice preserves the current unified-diff workflow, workspace path validation, blocked-path policy, secret-content detection, symlink-patch rejection, patch-size limit, `git apply --check` preflight, `git apply` execution, bounded and redacted subprocess output, diff statistics, analysis-cache invalidation, human-readable MCP content, Windows behavior, and existing smoke/stress coverage.

## 2. Chosen approach

Use the established isolated direct-tool migration pattern:

1. Add `src/tools/schemas/applyPatch.ts`.
2. Keep the current unified-diff parsing and `git apply` algorithm local to `src/server.ts` for this slice.
3. Add one narrow injectable `applyPatchResultProvider` used only by the direct handler and contract tests.
4. Add a strict internal provider-result schema.
5. Register direct `apply_patch` with an exact advertised `outputSchema`.
6. Return strict schema-v1 success or failure envelopes.
7. Preserve all nine existing successful structured fields, nested only under `data`.
8. Validate the provider result and returned path set before invalidating analysis.
9. Convert raw Git, operating-system, path, and parser failures into fixed public messages without returning raw diagnostics.
10. Keep the current human-readable patch summary in MCP `content`.
11. Add a dedicated nested-envelope Tool Card renderer for direct `apply_patch`.
12. Leave the legacy flat file renderer only for `export_pro_context`.

This is preferred over three alternatives:

- migrating `apply_patch` together with Phase 3 atomic transactions, rollback, or undo, which would expand the slice beyond Phase 1 protocol stabilization;
- replacing the exact tool contract with a generic shared write-result object, which would lose multi-file patch semantics;
- postponing `apply_patch` and moving to `bash`, which would leave the direct write-tool family only partially migrated and introduce a much broader execution contract.

## 3. Scope

### In scope

- Direct `apply_patch` tool only.
- Exact advertised `outputSchema`.
- Strict success data and stable public errors.
- An `applyPatchResultProvider` dependency seam.
- Strict provider-result validation.
- Validation that returned paths are safe workspace-relative paths and exactly match the normalized paths declared by the submitted patch.
- Existing patch parsing, blocked paths, symlink rejection, secret-content rejection, size limit, `git apply --check`, and `git apply` behavior.
- Analysis-cache invalidation only after complete provider and path-set validation.
- Direct Tool Card nested-envelope rendering.
- `codexpro` wrapper compatibility.
- Focused `node:test` contract coverage.
- Smoke/stress compatibility updates only where old flat fields are inspected.
- Documentation, changelog, project memory, and Phase 1 archive updates during implementation.

### Out of scope

- Changes to `write`, `edit`, `bash`, Git read tools, workspace tools, handoff tools, or context-export tools.
- Atomic multi-file transactions, fsync, rollback, undo, change sets, expected hashes, version-conflict detection, file locking, or crash recovery.
- Fuzzy patching, automatic patch repair, three-way merge, conflict resolution, binary patch support, patch generation, or regex/semantic editing.
- Changes to the path policy, blocked globs, secret-detection algorithm, symlink policy, patch-size limits, Git executable selection, authentication, dependencies, workspace lifecycle, or Phase 2/3.
- Claims that the current patch operation is an operating-system transaction or sandbox.

## 4. Public success contract

```json
{
  "codexpro_tool": "apply_patch",
  "codexpro_title": "Apply Patch",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "paths": [
      "src/example.ts",
      "test/example.test.mjs"
    ],
    "stdout": "",
    "stderr": "",
    "additions": 12,
    "deletions": 4,
    "changed": true,
    "diff": "diff --git a/src/example.ts b/src/example.ts\n..."
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
- `paths`: non-empty array of unique, safe, normalized workspace-relative paths touched by the submitted patch.
- `stdout`: bounded and redacted `git apply` standard output; usually empty.
- `stderr`: bounded and redacted `git apply` standard error; usually empty on success.
- `additions`: non-negative unified-diff addition count.
- `deletions`: non-negative unified-diff deletion count.
- `changed`: literal `true` in schema version 1 because the current operation only succeeds after applying a non-empty supported patch.
- `diff`: non-empty, bounded, redacted unified-diff text for this submitted patch only; unrelated dirty workspace changes must not be included.

Unknown fields are rejected. All nine preserved fields live only under `data`; no success field remains at the top level.

No `path`, `bytes`, `sha256`, per-file hash list, change-set identifier, transaction identifier, or rollback token is added. A single patch can create, modify, delete, rename, or copy multiple paths, and the current implementation does not calculate trustworthy final per-file hashes for every operation.

## 5. Internal provider contract

Add:

```ts
export interface ApplyPatchProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  patch: string;
}
```

Extend `CodexProServerDependencies` with:

```ts
applyPatchResultProvider?: (
  context: ApplyPatchProviderContext
) => ApplyPatchProviderResult | Promise<ApplyPatchProviderResult>;
```

The production provider calls the existing `applyWorkspacePatch` operation. Contract tests inject deterministic providers; no production test mode, environment switch, hidden MCP argument, or global mutable override is allowed.

The strict internal provider result contains exactly:

```ts
{
  paths: string[];
  stdout: string;
  stderr: string;
  additions: number;
  deletions: number;
  changed: true;
  diff: string;
}
```

Provider-result validation requires:

- at least one path;
- no duplicate paths;
- non-empty relative path strings;
- non-negative integer diff statistics;
- `changed` equal to literal `true`;
- non-empty diff text;
- no unknown fields.

After strict schema parsing, the handler resolves every returned path through the existing `PathGuard` write boundary and compares the normalized returned path set with the normalized touched-path set derived from the submitted patch. The sets must match exactly. Order is not part of the public semantic contract, but the production implementation should preserve the current patch-discovery order.

A malformed provider result, unsafe returned path, missing path, extra path, duplicate path, or path-set mismatch becomes `INTERNAL_ERROR`. Analysis cache must remain untouched in all such cases.

## 6. Public failure contract

```json
{
  "codexpro_tool": "apply_patch",
  "codexpro_title": "Apply Patch",
  "ok": false,
  "data": null,
  "error": {
    "code": "PATCH_CHECK_FAILED",
    "message": "The patch could not be applied cleanly to the current workspace state.",
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

Approved schema-v1 errors:

1. `WORKSPACE_NOT_FOUND`
2. `PATH_OUTSIDE_WORKSPACE`
3. `PATH_BLOCKED`
4. `INVALID_ARGUMENT`
5. `PATCH_TOO_LARGE`
6. `SECRET_CONTENT_BLOCKED`
7. `SYMLINK_PATCH_BLOCKED`
8. `PATCH_INVALID`
9. `GIT_UNAVAILABLE`
10. `PATCH_CHECK_FAILED`
11. `PATCH_APPLY_FAILED`
12. `INTERNAL_ERROR`

All are non-retryable in schema version 1. The server must not encourage automatic retries of a multi-file write operation, especially after the apply stage has started.

### Fixed public messages

- `WORKSPACE_NOT_FOUND`: `The requested workspace is not available. Open the workspace before retrying.`
- `PATH_OUTSIDE_WORKSPACE`: `A patch target is outside the permitted workspace boundary.`
- `PATH_BLOCKED`: `A patch target is blocked by safety rules, including unsafe symlink targets.`
- `INVALID_ARGUMENT`: `The requested patch contains an invalid argument.`
- `PATCH_TOO_LARGE`: `The requested patch exceeds the configured patch-size limit.`
- `SECRET_CONTENT_BLOCKED`: `Secret-looking content is blocked from apply_patch.`
- `SYMLINK_PATCH_BLOCKED`: `Patches that create, delete, or change symbolic links are blocked.`
- `PATCH_INVALID`: `The requested patch is not a valid supported unified diff.`
- `GIT_UNAVAILABLE`: `Git is unavailable, so the patch cannot be checked or applied.`
- `PATCH_CHECK_FAILED`: `The patch could not be applied cleanly to the current workspace state.`
- `PATCH_APPLY_FAILED`: `The patch passed preflight but the apply operation failed. Review workspace changes before retrying.`
- `INTERNAL_ERROR`: `The patch could not be applied because of an internal error.`

### Error details

- `WORKSPACE_NOT_FOUND`: `{ workspace_id }`, sanitized and length-bounded.
- `PATH_OUTSIDE_WORKSPACE`: `{ path }`, containing only a safe normalized workspace-relative display path or `[unsafe path omitted]`.
- `PATH_BLOCKED`: `{ path }`, using the same safe path rule.
- `INVALID_ARGUMENT`: `{ argument: "patch", reason: "empty" }`.
- `PATCH_TOO_LARGE`: `{ limit_bytes }`.
- `PATCH_INVALID`: `{ reason }`, where `reason` is exactly `no_file_paths` or `invalid_path_encoding`.
- All other errors: strict empty details object.

Raw patch contents, file contents, absolute unsafe paths, secret-looking values, Git stderr/stdout, operating-system diagnostics, executable paths, stack traces, and exception names are never included in public error fields or MCP error text.

## 7. Failure classification

The direct handler catches every failure and maps it as follows:

- unknown explicit `workspace_id` -> `WORKSPACE_NOT_FOUND`;
- empty or whitespace-only patch -> `INVALID_ARGUMENT`;
- configured byte limit exceeded -> `PATCH_TOO_LARGE`;
- secret-content policy rejection -> `SECRET_CONTENT_BLOCKED`;
- symlink-mode patch rejection -> `SYMLINK_PATCH_BLOCKED`;
- no normalized touched paths -> `PATCH_INVALID` with `no_file_paths`;
- malformed Git quoted-path encoding -> `PATCH_INVALID` with `invalid_path_encoding`;
- blocked path or write-through-symlink policy -> `PATH_BLOCKED`;
- absolute, escaping, UNC, device, drive-relative, ADS, reserved-name, trailing-dot/space, or parent-symlink escape -> `PATH_OUTSIDE_WORKSPACE`;
- missing Git executable during check or apply -> `GIT_UNAVAILABLE`;
- non-zero `git apply --check` result -> `PATCH_CHECK_FAILED`;
- a patch that passed preflight but fails during `git apply` -> `PATCH_APPLY_FAILED`;
- malformed injected provider results, returned-path mismatches, unexpected exceptions, and unclassified conditions -> `INTERNAL_ERROR`.

Classification may inspect existing internal exception messages and operating-system error codes, but only the fixed public message and strictly bounded details leave the handler. This slice does not create a project-wide typed error hierarchy.

## 8. Handler flow

The direct handler follows this order:

1. Resolve the workspace.
2. Convert the MCP `patch` argument to a string.
3. Derive the normalized expected touched-path list using the existing parser.
4. Execute the injected or production provider.
5. Strictly parse the provider result.
6. Validate every returned path through the existing write boundary.
7. Compare returned and expected path sets exactly.
8. Construct strict `ApplyPatchData`.
9. Invalidate workspace analysis only after steps 5–8 succeed.
10. Return existing human-readable patch summary plus `createApplyPatchSuccess(data)`.
11. On any failure, classify it, return `createApplyPatchFailure(failure)`, and set `isError: true`.

No failure returns partial success data. No warning-based degraded success is introduced for a write operation.

## 9. Analysis-cache behavior

The current tool invalidates workspace analysis after a successful patch. Preserve that behavior with a stricter ordering rule:

- validation failure before provider execution: no invalidation;
- provider rejection: no invalidation;
- malformed provider output: no invalidation;
- unsafe or mismatched returned paths: no invalidation;
- fully validated success with `changed: true`: invalidate once.

Because `changed` is literal `true`, no schema-v1 successful no-op branch exists.

## 10. Human-readable MCP content

Preserve the current successful summary shape:

````text
# Apply Patch

Paths: src/example.ts, test/example.test.mjs
Diff stats: +12 -4
[optional successful stderr summary]

```diff
...
```
````

Failure text becomes fixed and safe:

```text
# Apply Patch Error

Code: PATCH_CHECK_FAILED
The patch could not be applied cleanly to the current workspace state.
```

The aggregate textual content remains for humans. Structured clients must use the exact nested envelope.

## 11. Tool Card and wrapper consumers

Add `renderApplyPatch(data)` to `src/toolCardWidget.ts`.

Successful cards show:

- touched-file count;
- additions and deletions;
- a bounded list of touched paths;
- the bounded rendered patch diff.

Failure cards show only the stable error code and fixed public message.

Route only direct `apply_patch` to this new renderer. Keep `export_pro_context` on the legacy `renderFile` path.

The `codexpro` supertool continues to preserve the child structured result and adds only wrapper identity fields. It must not flatten `data`, overwrite `ok/error/meta`, or restore legacy top-level patch fields.

## 12. Contract tests

Add `test/apply-patch-contract.test.mjs` covering at least:

1. tool registration advertises the exact `outputSchema`;
2. success constructor accepts the exact nine-field nested data object;
3. strict top-level and nested unknown-field rejection;
4. success requires `data`, null `error`, non-empty unique paths, literal `changed: true`, and non-empty diff;
5. failure requires null `data` and a non-null approved error;
6. all twelve stable errors validate with exact fixed messages and details;
7. empty patch classification;
8. patch-size classification;
9. no-file-path and invalid-path-encoding classifications;
10. secret-content and symlink-mode classifications;
11. blocked and escaping path classifications without unsafe detail leakage;
12. missing Git classification;
13. check-stage failure classification without raw stderr leakage;
14. apply-stage failure classification without raw stderr leakage;
15. injected provider receives the exact workspace, guard, config, and patch;
16. malformed provider result becomes `INTERNAL_ERROR`;
17. duplicate, missing, extra, unsafe, or mismatched returned paths become `INTERNAL_ERROR`;
18. cache invalidation occurs only after complete successful validation;
19. human-readable error content contains only fixed safe text;
20. Tool Card reads nested success and failure data;
21. `export_pro_context` retains its legacy renderer;
22. supertool wrapping preserves the nested direct contract.

Update `scripts/smoke.mjs` only where direct `apply_patch` fields are currently read from the top level. Existing real patch, unrelated-diff isolation, analysis invalidation, blocked `.env`, quoted path, copy target, and symlink-patch cases remain authoritative end-to-end coverage.

The adjacent regression group should include direct `write`, `edit`, `read`, `show_changes`, and `git_diff` contract tests because they share write output consumers, cache behavior, or review flow.

## 13. File-level implementation boundary

Expected files:

- Add `src/tools/schemas/applyPatch.ts`.
- Modify `src/server.ts` for imports, provider types, dependency injection, strict provider validation, failure classification, exact tool registration, cache ordering, and nested response construction.
- Modify `src/toolCardWidget.ts` for `renderApplyPatch` and routing.
- Add `test/apply-patch-contract.test.mjs`.
- Modify `scripts/smoke.mjs` only for nested result access and stable error assertions where required.
- Modify adjacent contract tests only when they intentionally assert renderer routing or wrapper behavior.
- Update `CHANGELOG.md`, `Memory.md`, `AGENTS.md`, and the active `docs/memory/archive/phase-1-part-2.md` when implementation is completed and verified.

No dependency or package-lock change is expected.

## 14. Compatibility and security

- Input arguments remain unchanged.
- Tool availability and annotations remain unchanged.
- Human-readable success behavior remains compatible.
- Structured success intentionally changes from flat fields to schema-v1 nesting.
- Existing safety checks remain fail-closed.
- The submitted patch remains subject to the existing maximum write byte limit.
- Git subprocess output remains bounded and redacted internally and is excluded from public failures.
- The schema does not claim transactionality, rollback, isolation, or conflict-free application.
- All path details are workspace-relative and sanitized before publication.
- All failure results set `isError: true`.

## 15. Verification gates for implementation

Run in this order:

1. focused `node --test test/apply-patch-contract.test.mjs`;
2. adjacent write/edit/read/review contract tests;
3. complete `node --test test/*.test.mjs`;
4. `npm run build`;
5. `npm run smoke`;
6. `npm run stress` on native Windows;
7. `git diff --check`;
8. review only intended files changed;
9. confirm no token, secret, private key, raw patch fixture secret, unsafe absolute path, or raw Git diagnostic was introduced;
10. update project memory with exact fresh results.

Cross-platform CI must pass on Ubuntu and Windows with Node 20 and 24 before publication is considered complete.

## 16. Rollback

The slice is independently reversible:

- remove `src/tools/schemas/applyPatch.ts`;
- remove the provider dependency and handler classification additions;
- restore the direct tool's previous flat structured result;
- restore `apply_patch` to the legacy `renderFile` route;
- revert focused tests and nested Smoke access.

Rollback does not require changing the underlying patch algorithm, user configuration, profiles, authentication, dependencies, workspace state, or other Phase 1 tool schemas.

## 17. Design self-review

- Placeholder scan: no `TBD`, `TODO`, or unresolved choice remains.
- Consistency: success fields match the current direct result and Phase 1 envelope rules.
- Error consistency: every approved code has one fixed message, exact details, and `retryable: false`.
- Security: raw Git/system diagnostics, patch contents, unsafe paths, file contents, and secrets are excluded from public failures.
- Scope: only direct `apply_patch` protocol stabilization and necessary consumers/tests are included.
- Phase boundary: atomic transactions, hashes, rollback, undo, authentication, workspace lifecycle, dependencies, and Phase 2/3 remain excluded.

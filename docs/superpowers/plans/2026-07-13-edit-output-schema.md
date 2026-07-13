# `edit` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only the direct `edit` MCP tool to the strict Phase 1 schema-v1 envelope while preserving current exact-text replacement behavior.

**Architecture:** Add one exact schema module and one injectable provider boundary around the existing `editTextFile` implementation. The direct handler validates the provider result and returned path, classifies failures into fixed public errors, and returns nested structured data. A dedicated Tool Card renderer consumes the new nested contract without changing `apply_patch` or `export_pro_context`.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, existing CodexPro file/path/redaction/diff/analysis-cache services.

**Status:** Completed, published in `89cf2e3`, and cross-platform CI-validated by run `29226366822`.

## Global Constraints

- Native Windows remains the primary platform; WSL is not required.
- Keep the exact replacement and write algorithms in `src/fsOps.ts` unchanged except exporting the existing edit result type.
- Migrate only direct `edit`; do not change direct `write`, `apply_patch`, or `export_pro_context` behavior.
- Preserve the existing single-match default, `replace_all`, `expected_replacements`, Unicode behavior, identical-text replacement success, text-file checks, size checks, secret-content blocking, path policy, unified diff generation, and human-readable MCP `content`.
- Do not add fuzzy matching, regular-expression editing, line-based editing, semantic editing, expected hashes, file locking, conflict detection, atomic replacement, fsync, transactions, rollback, change sets, undo, dependencies, authentication changes, workspace lifecycle changes, or Phase 2/3 behavior.
- Use the strict tool-specific schema-v1 envelope with exactly `schemaVersion`, `durationMs`, and `warnings` in `meta`.
- Do not expose `old_text`, `new_text`, raw exceptions, stack traces, absolute unsafe paths, operating-system diagnostics, file content, or secret-looking values in failures.
- Validate the provider result and returned path before analysis-cache invalidation.
- Successful identical-text replacement must keep `replacements > 0`, `diff.changed=false`, zero diff statistics, and no analysis-cache invalidation.
- All fourteen public errors are non-retryable in schema version 1.
- Follow TDD: every production behavior change must be preceded by a focused failing test.
- Keep every task independently reviewable; do not stage, commit, push, or begin Phase 2 without the approval required by project rules.

---

## File Structure

- Create `src/tools/schemas/edit.ts`: strict success data, exact error union, output envelope, fixed messages, and pure constructors.
- Create `test/edit-contract.test.mjs`: schema, direct-handler, failure-classification, cache, Tool Card, wrapper, and compatibility contracts.
- Modify `src/fsOps.ts`: export the existing direct-edit return type as `EditFileResult`; do not alter the algorithm.
- Modify `src/server.ts`: import the schema, add provider result validation, dependency injection, safe classifier, exact descriptor, and nested handler.
- Modify `src/toolCardWidget.ts`: add `renderEdit(data)` and leave the legacy renderer assigned only to `apply_patch` and `export_pro_context`.
- Modify `scripts/smoke.mjs` and `scripts/stress.mjs` only when existing direct-`edit` assertions inspect flat structured fields.
- Modify `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, the design/plan status, and append `docs/memory/archive/phase-1.md` after implementation verification.

---

### Task 1: Define and prove the strict `edit` schema contract

**Files:**
- Create: `test/edit-contract.test.mjs`
- Create: `src/tools/schemas/edit.ts`
- Modify: `src/fsOps.ts:289-335`

**Interfaces:**
- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`; the existing `DiffResult` shape from `src/fsOps.ts`.
- Produces: `editDataSchema`, `editOutputShape`, `editOutputSchema`, `createEditSuccess`, `createEditFailure`, `EDIT_ERROR_MESSAGES`, `EditData`, `EditFailureInput`, `EditStructuredResult`, and exported `EditFileResult`.

- [x] **Step 1: Create the focused test file with failing constructor and strictness tests**

Create `test/edit-contract.test.mjs` with imports matching the existing contract-test pattern:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  EDIT_ERROR_MESSAGES,
  createEditFailure,
  createEditSuccess,
  editOutputSchema
} = await tsImport("../src/tools/schemas/edit.ts", import.meta.url);
```

Add `sampleEditData()` with exactly these fields:

```js
function sampleEditData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "src/example.ts",
    replacements: 1,
    bytes: 24,
    sha256: "a".repeat(64),
    additions: 2,
    deletions: 1,
    diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@",
    ...overrides
  };
}
```

Add one constructor case for each approved error and exact details shape:

```js
const failureCases = [
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "../outside.txt" }],
  ["PATH_BLOCKED", { path: ".git/config" }],
  ["FILE_NOT_FOUND", { path: "missing.txt" }],
  ["NOT_A_FILE", { path: "src" }],
  ["FILE_NOT_TEXT", { path: "asset.bin" }],
  ["FILE_TOO_LARGE", { path: "large.txt", scope: "edited_file", limit_bytes: 1000 }],
  ["INVALID_ARGUMENT", { argument: "old_text" }],
  ["OLD_TEXT_NOT_FOUND", { path: "src/example.ts" }],
  ["OLD_TEXT_NOT_UNIQUE", { path: "src/example.ts", matches: 3 }],
  ["REPLACEMENT_COUNT_MISMATCH", { path: "src/example.ts", expected: 2, actual: 3 }],
  ["SECRET_CONTENT_BLOCKED", { path: "notes.md" }],
  ["EDIT_FAILED", {}],
  ["INTERNAL_ERROR", {}]
];
```

Assert success/failure state consistency, unknown-field rejection, strict per-code details, positive integer `replacements`, non-negative integer stats, lowercase 64-character SHA-256, and rejection of top-level legacy fields.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: FAIL with module-not-found for `src/tools/schemas/edit.ts`. No production source should have changed before this RED result.

- [x] **Step 3: Export the current edit result type without changing behavior**

In `src/fsOps.ts`, add this exported interface near `WriteFileResult`/`DiffResult` and use it as the `editTextFile` return type:

```ts
export interface EditFileResult {
  path: string;
  replacements: number;
  bytes: number;
  sha256: string;
  diff: DiffResult;
}
```

Change only the function signature:

```ts
export async function editTextFile(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  oldText: string,
  newText: string,
  options: { replaceAll?: boolean; expectedReplacements?: number } = {}
): Promise<EditFileResult> {
```

Do not change occurrence counting, replacement behavior, size checks, secret checks, diff construction, or file writing.

- [x] **Step 4: Implement `src/tools/schemas/edit.ts`**

Use strict Zod objects and the established common meta contract. Define:

```ts
export const EDIT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules, including unsafe symlink targets.",
  FILE_NOT_FOUND: "The requested file does not exist.",
  NOT_A_FILE: "The requested path is not a regular file.",
  FILE_NOT_TEXT: "The requested file is not supported as a text file.",
  FILE_TOO_LARGE: "The requested edit exceeds the configured file-size limit.",
  INVALID_ARGUMENT: "The requested edit contains an invalid argument.",
  OLD_TEXT_NOT_FOUND: "The requested old_text was not found in the file.",
  OLD_TEXT_NOT_UNIQUE: "The requested old_text matched more than once. Use a more specific old_text or enable replace_all.",
  REPLACEMENT_COUNT_MISMATCH: "The requested replacement count did not match the number of replacements that would be performed.",
  SECRET_CONTENT_BLOCKED: "Secret-looking content is blocked because the edited file appears to contain a secret value.",
  EDIT_FAILED: "The file could not be edited by the operating system.",
  INTERNAL_ERROR: "The file could not be edited because of an internal error."
} as const;
```

Define exact success data:

```ts
export const editDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string().min(1),
  replacements: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string()
}).strict();
```

Define strict details schemas for workspace, path, file size, invalid argument, ambiguous match count, replacement-count mismatch, and empty details. Build a discriminated union for all fourteen errors. Export `editOutputShape`, an `editOutputSchema` with the same `ok/data/error` consistency refinement used by `write`, and pure `createEditSuccess`/`createEditFailure` constructors using `createToolMeta(durationMs)`.

Use this exact failure input union:

```ts
export type EditFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "NOT_A_FILE"; details: { path: string } }
  | { code: "FILE_NOT_TEXT"; details: { path: string } }
  | { code: "FILE_TOO_LARGE"; details: { path: string; scope: "existing_file" | "edited_file"; limit_bytes: number } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "old_text" } }
  | { code: "OLD_TEXT_NOT_FOUND"; details: { path: string } }
  | { code: "OLD_TEXT_NOT_UNIQUE"; details: { path: string; matches: number } }
  | { code: "REPLACEMENT_COUNT_MISMATCH"; details: { path: string; expected: number; actual: number } }
  | { code: "SECRET_CONTENT_BLOCKED"; details: { path: string } }
  | { code: "EDIT_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };
```

- [x] **Step 5: Run focused constructor tests and confirm GREEN**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: constructor/schema tests PASS. Handler tests are not yet present.

- [x] **Step 6: Review Task 1 diff**

Use `show_changes` restricted to `src/fsOps.ts`, `src/tools/schemas/edit.ts`, and `test/edit-contract.test.mjs`. Confirm the `editTextFile` algorithm is byte-for-byte unchanged apart from the exported return type and function annotation.

---

### Task 2: Migrate the direct handler and classify failures safely

**Files:**
- Modify: `test/edit-contract.test.mjs`
- Modify: `src/server.ts:1-520,900-991,1771-1815,2860-2904`

**Interfaces:**
- Consumes: `EditFileResult`, `editDataSchema`, `editOutputShape`, `createEditSuccess`, `createEditFailure`, `EDIT_ERROR_MESSAGES`, and `EditFailureInput` from Task 1.
- Produces: `EditProviderContext`, optional `editResultProvider` in `CodexProServerDependencies`, strict `editProviderResultSchema`, `classifyEditFailure`, and the migrated direct handler.

- [x] **Step 1: Add shared test helpers and failing direct-handler contract tests**

Add `createTestConfig`, `withInMemoryClient`, `withTempWorkspace`, `parseEditResult`, and `assertEditFailure` following the existing `write-contract.test.mjs` structure. `assertEditFailure` must require `result.isError === true`, exact fixed message, `retryable:false`, exact details, empty warnings, and text content that excludes raw diagnostics.

Add tests for:

1. exact advertised `outputSchema` and a real single replacement;
2. `replace_all:true` and matching `expected_replacements`;
3. Unicode replacement and identical-text success with zero diff stats;
4. `WORKSPACE_NOT_FOUND`, outside path, blocked path, missing file, directory, and binary target;
5. oversized existing and edited files;
6. empty `old_text`, zero matches, ambiguous matches, and expected-count mismatch;
7. secret-content blocking;
8. recognized provider/operating-system edit failure;
9. malformed provider result and returned-path mismatch;
10. fixed failure text and absence of raw exception, absolute path, old/new text, and secret values.

Use dependency injection for provider-only cases; do not add hidden MCP arguments or production test flags.

- [x] **Step 2: Run focused tests and confirm RED**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: FAIL because direct `edit` still advertises no `outputSchema`, returns flat structured fields, throws unclassified failures, and has no provider seam.

- [x] **Step 3: Add imports and exact provider result validation**

Import the new schema exports and `EditFileResult`. Add this strict validator near `writeProviderResultSchema`:

```ts
const editProviderResultSchema = z.object({
  path: z.string().min(1),
  replacements: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  diff: z.object({
    diff: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    changed: z.boolean()
  }).strict()
}).strict().superRefine((value, context) => {
  if (!value.diff.changed && (value.diff.additions !== 0 || value.diff.deletions !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff", "changed"],
      message: "Unchanged edit results require zero diff statistics."
    });
  }
});
```

Do not require `diff.changed=true` when `replacements > 0`.

- [x] **Step 4: Add the provider interface and dependency seam**

Add:

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
```

Extend `CodexProServerDependencies`:

```ts
editResultProvider?: (context: EditProviderContext) => Promise<EditFileResult>;
```

Create the default provider immediately after `writeResultProvider`:

```ts
const editResultProvider =
  dependencies.editResultProvider ??
  ((context: EditProviderContext) =>
    editTextFile(
      context.config,
      context.guard,
      context.workspace,
      context.path,
      context.oldText,
      context.newText,
      context.options
    ));
```

- [x] **Step 5: Implement `classifyEditFailure` with fixed safe details**

Use existing `safeTreePathDetail`, `safeTreeWorkspaceIdDetail`, and `nodeErrorCode`. Classification order must be:

1. explicit unknown workspace → `WORKSPACE_NOT_FOUND`;
2. blocked path/write-through symlink → `PATH_BLOCKED`;
3. outside/device/UNC/drive-relative/ADS/trailing-dot/reserved-name/parent-escape → `PATH_OUTSIDE_WORKSPACE`;
4. `ENOENT` → `FILE_NOT_FOUND`;
5. `Not a file`, `EISDIR`, `ENOTDIR` → `NOT_A_FILE`;
6. binary refusal → `FILE_NOT_TEXT`;
7. existing-file size refusal → `FILE_TOO_LARGE`, `scope:"existing_file"`, limit `Math.max(config.maxWriteBytes, config.maxReadBytes)`;
8. edited-result size refusal → `FILE_TOO_LARGE`, `scope:"edited_file"`, limit `config.maxWriteBytes`;
9. `old_text must not be empty.` → `INVALID_ARGUMENT`, `argument:"old_text"`;
10. `old_text was not found in ...` → `OLD_TEXT_NOT_FOUND`;
11. parse `old_text matched (\d+) times.` → `OLD_TEXT_NOT_UNIQUE` with the safe integer count;
12. parse `Expected (\d+) replacements but would perform (\d+).` → `REPLACEMENT_COUNT_MISMATCH`;
13. secret-content refusal → `SECRET_CONTENT_BLOCKED`;
14. `EACCES`, `EPERM`, `EROFS`, `ENOSPC`, `EDQUOT`, `EIO`, `EMFILE`, `ENFILE`, or `EBUSY` → `EDIT_FAILED`;
15. everything else, including malformed provider output/path mismatch → `INTERNAL_ERROR`.

Never put the raw message, raw path, `old_text`, or `new_text` in public details.

- [x] **Step 6: Replace only the direct `edit` handler boundary**

Add `outputSchema: editOutputShape` to the descriptor. Wrap the handler in `try/catch` and use this flow:

```ts
const workspace = workspaces.getWorkspace(args.workspace_id);
const requestedPath = String(args.path ?? "");
const oldText = String(args.old_text ?? "");
const newText = String(args.new_text ?? "");
const resolved = guard.resolve(workspace, requestedPath, { forWrite: true });
assertWriteToolAllowed(config, resolved.relPath);
const result = editProviderResultSchema.parse(await editResultProvider({
  config,
  guard,
  workspace,
  path: requestedPath,
  oldText,
  newText,
  options: {
    replaceAll: parseBool(args.replace_all, false),
    expectedReplacements: args.expected_replacements
  }
}));
if (result.path !== resolved.relPath) {
  throw new CodexProError("Edit provider returned a path that does not match the resolved target.");
}
const data = editDataSchema.parse({
  workspace_id: workspace.id,
  root: workspace.root,
  path: result.path,
  replacements: result.replacements,
  bytes: result.bytes,
  sha256: result.sha256,
  additions: result.diff.additions,
  deletions: result.diff.deletions,
  diff: result.diff.diff
});
if (result.diff.changed) invalidateWorkspaceAnalysis(workspace.id);
return textResult(existingSuccessText, createEditSuccess(data));
```

The catch path must call `classifyEditFailure`, use `# Edit File Error`, fixed code/message only, return `createEditFailure(failure)`, and set `isError:true`.

- [x] **Step 7: Run focused tests and confirm GREEN**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: all schema and direct-handler tests PASS.

- [x] **Step 8: Review Task 2 diff**

Confirm only direct `edit` uses the new schema and provider. Verify direct `write`, `apply_patch`, the edit algorithm, authentication, and workspace lifecycle remain unchanged.

---

### Task 3: Prove cache behavior, migrate consumers, and preserve adjacent tools

**Files:**
- Modify: `test/edit-contract.test.mjs`
- Modify: `src/toolCardWidget.ts:600-645,1180-1215`
- Modify if required: `scripts/smoke.mjs`
- Modify if required: `scripts/stress.mjs`

**Interfaces:**
- Consumes: the direct nested `edit` envelope from Task 2.
- Produces: dedicated `renderEdit(data)`; keeps `renderFile(data)` for `apply_patch` and `export_pro_context`; proves wrapper and analysis-cache compatibility.

- [x] **Step 1: Add failing cache invalidation tests**

Use a temporary workspace and the existing structured-search cache behavior to prove:

- a validated changed edit invalidates cached workspace analysis;
- an identical-text edit with `diff.changed=false` does not invalidate it;
- a provider result with malformed shape does not invalidate it;
- a provider result with a different returned path does not invalidate it;
- any failed edit does not invalidate it.

Do not expose cache state through a production-only test hook. Use the same public search/analysis observation pattern established by `write-contract.test.mjs`.

- [x] **Step 2: Add failing Tool Card tests**

Assert generated widget source contains a dedicated `renderEdit(data)` that reads:

```js
const editData = data?.data ?? {};
const error = data?.error ?? {};
const failed = data?.ok === false;
```

Success rendering must use nested `path`, `replacements`, `bytes`, `sha256`, `additions`, `deletions`, and `diff`. Failure rendering must use only fixed `error.code` and `error.message`.

Assert routing is exactly:

```js
} else if (tool === "edit") {
  root.innerHTML = renderEdit(data);
} else if (tool === "apply_patch" || tool === "export_pro_context") {
  root.innerHTML = renderFile(data);
```

- [x] **Step 3: Add failing `codexpro` wrapper tests**

Call `codexpro` with `action:"edit"`. Assert wrapper metadata remains present, the child envelope remains strict, and none of these fields appear at wrapper top level:

```text
path replacements bytes sha256 additions deletions diff
```

Add a failure wrapper case and verify raw provider diagnostics and edit content are absent.

- [x] **Step 4: Run focused tests and confirm RED**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: FAIL because the Tool Card still routes `edit` through the flat legacy renderer; cache/wrapper assertions may also expose incomplete handler ordering.

- [x] **Step 5: Implement the dedicated nested Tool Card renderer**

Add `renderEdit(data)` beside `renderWrite(data)`. Its shape should mirror `renderWrite` while adding the replacement pill and omitting the `existed` summary:

```js
function renderEdit(data) {
  const editData = data?.data ?? {};
  const error = data?.error ?? {};
  const failed = data?.ok === false;
  const pills = failed
    ? pill(error.code || "error", "bad")
    : [
        editData.replacements !== undefined ? pill(editData.replacements + " replacements", "info") : "",
        editData.bytes !== undefined ? pill(editData.bytes + " bytes") : "",
        editData.additions !== undefined ? pill("+" + editData.additions, "good") : "",
        editData.deletions !== undefined ? pill("-" + editData.deletions, "bad") : ""
      ].join("");
  const body = failed
    ? '<div class="empty">' + esc(error.message || "Edit failed.") + '</div>'
    : '<div class="summary">' +
      summaryItem("Path", editData.path || "-") +
      summaryItem("SHA-256", editData.sha256 || "-") +
      '</div>' +
      (editData.diff
        ? codebox(basename(editData.path || "file"), renderDiff(editData.diff), "")
        : '<div class="empty">No diff returned.</div>');
  return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
}
```

Route only `edit` to `renderEdit`; retain `renderFile` only for `apply_patch` and `export_pro_context`.

- [x] **Step 6: Update optional smoke/stress assertions only if they inspect direct flat `edit` fields**

Search first. If no direct flat-field assertions exist, leave both scripts unchanged. If they exist, change only the field access from top-level fields to `structuredContent.data.<field>` and preserve all behavioral expectations.

- [x] **Step 7: Run focused and adjacent regressions**

Run:

```text
node --test test/edit-contract.test.mjs test/write-contract.test.mjs test/read-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: PASS. `write`, `read`, and `show_changes` contracts must remain unchanged.

- [x] **Step 8: Review Task 3 diff**

Confirm `apply_patch` and `export_pro_context` still use the legacy renderer; optional script edits are limited to direct `edit` nested-field access; no unrelated formatting or refactor is present.

---

### Task 4: Run complete gates, reconcile documentation, and prepare publication

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1.md`
- Modify: `docs/superpowers/specs/2026-07-13-edit-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-edit-output-schema.md`
- Include production/test/script files changed by Tasks 1-3.

**Interfaces:**
- Produces: verified ninth-slice implementation, exact evidence, rollback record, current project memory, and a reviewed publication change set.

- [x] **Step 1: Run the focused contract from a fresh process**

Run:

```text
node --test test/edit-contract.test.mjs
```

Expected: all focused tests PASS with no leaked raw diagnostics.

- [x] **Step 2: Run adjacent contract tests**

Run:

```text
node --test test/edit-contract.test.mjs test/write-contract.test.mjs test/read-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: PASS.

- [x] **Step 3: Run the complete Node regression suite**

Run:

```text
node --test test/*.test.mjs
```

Expected: all tests PASS. Record the exact passed/failed/skipped totals in `Memory.md` and the Phase 1 archive.

- [x] **Step 4: Run build and integration gates separately**

Run each command separately:

```text
npm run build
npm run smoke
npm run stress
```

Expected: all pass. Platform-capability skips must match established native-Windows behavior. If Smoke uses stale `dist`, rebuild and rerun before diagnosing source behavior.

- [x] **Step 5: Run whitespace and change-scope checks**

Run:

```text
git diff --check
```

Then use `show_changes` with the complete unstaged diff. Expected:

- no whitespace errors;
- no secret-looking values;
- no production files outside the approved list;
- no changes to `apply_patch`, authentication, dependencies, workspace lifecycle, or Phase 2;
- no raw exception text in public error paths.

- [x] **Step 6: Run `neat-freak` reconciliation**

Load and apply the `neat-freak` skill. Verify:

- `Memory.md` remains within its hard limits and describes the ninth slice as implemented but unpublished until Git publication occurs;
- `AGENTS.md` documentation map includes both the `edit` design and plan;
- the design and plan status reflect actual execution state;
- `CHANGELOG.md` records the direct `edit` exact schema and stable errors without claiming atomic editing;
- `docs/memory/archive/phase-1.md` receives an append-only implementation record with commands, exact results, risks, rollback, and next action;
- stale counts such as “first eight slices” are updated only after implementation evidence exists;
- no historical archive entries are rewritten.

- [x] **Step 7: Re-run focused verification after reconciliation**

Run:

```text
node --test test/edit-contract.test.mjs
git diff --check
```

Expected: PASS.

- [x] **Step 8: Review the final publication set before Git operations**

Use `show_changes` and confirm the final set contains only applicable paths from:

```text
AGENTS.md
CHANGELOG.md
Memory.md
docs/memory/archive/phase-1.md
docs/superpowers/specs/2026-07-13-edit-output-schema-design.md
docs/superpowers/plans/2026-07-13-edit-output-schema.md
src/fsOps.ts
src/server.ts
src/toolCardWidget.ts
src/tools/schemas/edit.ts
test/edit-contract.test.mjs
scripts/smoke.mjs
scripts/stress.mjs
```

Omit unchanged optional script files. Stop for the approval required by project rules before staging, committing, or pushing unless the user has explicitly authorized autonomous publication for this slice.

- [x] **Step 9: Stage, commit, push, and verify CI only after approval**

Use the exact applicable path list from Step 8:

```text
git add <approved applicable paths>
git commit -m "feat(schema): add exact edit result contract"
git push origin main
```

After push, verify the branch-head GitHub Actions run on Ubuntu and Windows with Node 20/24. Record the implementation commit, publication record, CI run ID, job results, local/remote synchronization, and final clean working tree in `Memory.md` and the append-only Phase 1 archive.

## Self-Review

- Spec coverage: all nine success fields, fourteen errors, exact details, provider boundary, returned-path validation, identical-text behavior, cache ordering, text compatibility, Tool Card, supertool wrapper, TDD, complete local gates, neat-freak reconciliation, memory, rollback, and conditional publication are assigned to explicit tasks.
- Placeholder scan passed: no prohibited marker, vague implementation instruction, or undefined interface remains.
- Type consistency: `EditFileResult`, `EditProviderContext`, `editResultProvider`, `editProviderResultSchema`, `EditFailureInput`, `editDataSchema`, `editOutputShape`, `editOutputSchema`, `createEditSuccess`, `createEditFailure`, and `renderEdit` use the same names and field shapes in every task.
- Scope consistency: direct `write`, `apply_patch`, `export_pro_context`, replacement algorithms, atomic editing, authentication, dependencies, workspace lifecycle, and Phase 2 remain outside the implementation boundary.
- Execution boundary: this plan does not itself authorize implementation, staging, commit, push, credential changes, or Phase 2 work.

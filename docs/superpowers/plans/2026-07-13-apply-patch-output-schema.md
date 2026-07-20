# `apply_patch` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only the direct `apply_patch` MCP tool to the strict Phase 1 schema-v1 envelope while preserving the current guarded unified-diff and `git apply` behavior.

**Architecture:** Add one exact schema module and one injectable provider boundary around the existing `applyWorkspacePatch` operation. The direct handler validates the provider result, validates and compares the complete returned path set, classifies internal patch/Git/path failures into fixed public errors, and invalidates analysis only after all success validation passes. A dedicated Tool Card renderer consumes the nested contract while `export_pro_context` remains on the legacy file renderer.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, synchronous Git subprocesses, existing CodexGPT path guard, write policy, redaction, diff statistics, Tool Card, and analysis-cache services.

**Status:** Complete and published; implementation commit `c761b4e`, CI run `29233787814` passed Ubuntu/Windows Node 20/24.

**Execution note:** Final review centralized the original size/secret/symlink/path validation order in `validateApplyPatchInput` and added `safeApplyPatchPathDetail` so relative escapes are omitted from public details. These verified corrections supersede the earlier illustrative Task 2 snippets where they differ.

## Global Constraints

- Native Windows remains the primary platform; WSL is not required.
- Migrate only direct `apply_patch`; do not change direct `write`, `edit`, `bash`, Git read tools, workspace tools, handoff tools, or `export_pro_context` behavior.
- Preserve the current unified-diff path parser, blocked-path policy, secret-content detection, symlink-mode rejection, patch-size limit, `git apply --check`, `git apply`, bounded subprocess output, diff statistics, unrelated-diff isolation, human-readable MCP `content`, and current Windows behavior.
- Preserve all nine current successful structured fields only under nested `data`: `workspace_id`, `root`, `paths`, `stdout`, `stderr`, `additions`, `deletions`, `changed`, and `diff`.
- Schema-v1 successful results require a non-empty unique path array, non-empty diff, non-negative integer statistics, and literal `changed:true`.
- Use exactly twelve fixed non-retryable errors: `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `INVALID_ARGUMENT`, `PATCH_TOO_LARGE`, `SECRET_CONTENT_BLOCKED`, `SYMLINK_PATCH_BLOCKED`, `PATCH_INVALID`, `GIT_UNAVAILABLE`, `PATCH_CHECK_FAILED`, `PATCH_APPLY_FAILED`, and `INTERNAL_ERROR`.
- Never expose raw patch contents, file contents, Git stdout/stderr, operating-system diagnostics, executable paths, stack traces, exception names, unsafe absolute paths, or secret-looking values in public failures.
- Validate the provider result and every returned path, then compare returned and expected normalized path sets exactly, before analysis-cache invalidation.
- Do not add atomic multi-file transactions, fsync, rollback, undo, change sets, expected hashes, conflict detection, file locking, crash recovery, fuzzy patching, automatic patch repair, three-way merge, binary patches, authentication changes, dependency changes, workspace lifecycle changes, or Phase 2/3 behavior.
- Do not introduce a production test mode, hidden MCP argument, environment switch, or global mutable provider override.
- Follow TDD: every production behavior change must be preceded by a focused failing test.
- Keep every task independently reviewable. This plan does not itself authorize implementation, staging, committing, pushing, credential changes, history rewriting, access expansion, or Phase 2.

---

## File Structure

- Create `src/tools/schemas/applyPatch.ts`: exact success data, exact error union, output envelope, fixed messages, and pure constructors.
- Create `test/apply-patch-contract.test.mjs`: schema, direct-handler, path-set, failure-classification, cache, Tool Card, wrapper, and compatibility contracts.
- Modify `src/server.ts`: import the schema, define the provider/result boundary, preserve the existing patch algorithm, add tool-local internal failure markers, add safe classification, validate returned paths, advertise the exact descriptor, and return the nested envelope.
- Modify `src/toolCardWidget.ts`: add `renderApplyPatch(data)` and leave `renderFile(data)` assigned only to `export_pro_context`.
- Modify `scripts/smoke.mjs`: read direct `apply_patch` success fields from `structuredContent.data` while preserving every existing end-to-end assertion.
- Modify `test/edit-contract.test.mjs` and `test/write-contract.test.mjs`: update only renderer-routing expectations affected by removing `apply_patch` from the legacy route.
- Modify `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, the design and plan status, and append the active `docs/memory/archive/phase-1-part-2.md` after implementation verification.
- Do not modify `src/fsOps.ts`, dependencies, package-lock files, authentication code, profile handling, workspace lifecycle, or closed archive Volume 1.

---

### Task 1: Define and prove the strict `apply_patch` schema contract

**Files:**
- Create: `test/apply-patch-contract.test.mjs`
- Create: `src/tools/schemas/applyPatch.ts`

**Interfaces:**
- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `APPLY_PATCH_ERROR_MESSAGES`, `applyPatchDataSchema`, `applyPatchErrorSchema`, `applyPatchOutputShape`, `applyPatchOutputSchema`, `createApplyPatchSuccess`, `createApplyPatchFailure`, `ApplyPatchData`, `ApplyPatchFailureInput`, and `ApplyPatchStructuredResult`.

- [x] **Step 1: Create the focused test file with failing constructor and strictness tests**

Create `test/apply-patch-contract.test.mjs` with these imports:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const {
  ApplyPatchOperationError,
  createCodexGPTServer
} = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  APPLY_PATCH_ERROR_MESSAGES,
  applyPatchOutputSchema,
  createApplyPatchFailure,
  createApplyPatchSuccess
} = await tsImport("../src/tools/schemas/applyPatch.ts", import.meta.url);
```

Add this exact success fixture:

```js
function sampleApplyPatchData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexgpt",
    paths: ["src/example.ts", "test/example.test.mjs"],
    stdout: "",
    stderr: "",
    additions: 12,
    deletions: 4,
    changed: true,
    diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@",
    ...overrides
  };
}
```

Add one constructor case for every approved error and exact details shape:

```js
const failureCases = [
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" }],
  ["PATH_BLOCKED", { path: ".git/config" }],
  ["INVALID_ARGUMENT", { argument: "patch", reason: "empty" }],
  ["PATCH_TOO_LARGE", { limit_bytes: 1000 }],
  ["SECRET_CONTENT_BLOCKED", {}],
  ["SYMLINK_PATCH_BLOCKED", {}],
  ["PATCH_INVALID", { reason: "no_file_paths" }],
  ["GIT_UNAVAILABLE", {}],
  ["PATCH_CHECK_FAILED", {}],
  ["PATCH_APPLY_FAILED", {}],
  ["INTERNAL_ERROR", {}]
];
```

Assert all of the following:

- success has exact top-level keys `codexgpt_tool`, `codexgpt_title`, `ok`, `data`, `error`, and `meta`;
- success rejects unknown top-level and nested fields;
- `paths` is non-empty, contains non-empty strings, and rejects duplicates;
- `additions` and `deletions` are non-negative integers;
- `changed` rejects `false`;
- `diff` rejects an empty string;
- failure requires `data:null`, one approved error, the exact fixed message, `retryable:false`, exact details, and empty warnings;
- `PATCH_INVALID` accepts only `no_file_paths` or `invalid_path_encoding`;
- public legacy top-level fields such as `paths`, `changed`, and `diff` are rejected.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```text
node --test test/apply-patch-contract.test.mjs
```

Expected: FAIL with module-not-found for `src/tools/schemas/applyPatch.ts`. No production source should have changed before this RED result.

- [x] **Step 3: Implement `src/tools/schemas/applyPatch.ts` with fixed public messages**

Define exactly:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const APPLY_PATCH_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "A patch target is outside the permitted workspace boundary.",
  PATH_BLOCKED: "A patch target is blocked by safety rules, including unsafe symlink targets.",
  INVALID_ARGUMENT: "The requested patch contains an invalid argument.",
  PATCH_TOO_LARGE: "The requested patch exceeds the configured patch-size limit.",
  SECRET_CONTENT_BLOCKED: "Secret-looking content is blocked from apply_patch.",
  SYMLINK_PATCH_BLOCKED: "Patches that create, delete, or change symbolic links are blocked.",
  PATCH_INVALID: "The requested patch is not a valid supported unified diff.",
  GIT_UNAVAILABLE: "Git is unavailable, so the patch cannot be checked or applied.",
  PATCH_CHECK_FAILED: "The patch could not be applied cleanly to the current workspace state.",
  PATCH_APPLY_FAILED: "The patch passed preflight but the apply operation failed. Review workspace changes before retrying.",
  INTERNAL_ERROR: "The patch could not be applied because of an internal error."
} as const;
```

Use one shared unique-path schema for public data:

```ts
const uniquePathsSchema = z.array(z.string().min(1)).min(1).superRefine((paths, context) => {
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Patch paths must be unique."
    });
  }
});

export const applyPatchDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  paths: uniquePathsSchema,
  stdout: z.string(),
  stderr: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.literal(true),
  diff: z.string().min(1)
}).strict();
```

Define strict details schemas:

```ts
const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.literal("patch"),
  reason: z.literal("empty")
}).strict();

const patchTooLargeDetailsSchema = z.object({
  limit_bytes: z.number().int().positive()
}).strict();

const patchInvalidDetailsSchema = z.object({
  reason: z.enum(["no_file_paths", "invalid_path_encoding"])
}).strict();

const emptyDetailsSchema = z.object({}).strict();
```

Create the complete strict error union with no generated or open-ended members:

```ts
function fixedErrorSchema<
  const Code extends keyof typeof APPLY_PATCH_ERROR_MESSAGES,
  Details extends z.ZodTypeAny
>(code: Code, details: Details) {
  return z.object({
    code: z.literal(code),
    message: z.literal(APPLY_PATCH_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

const workspaceNotFoundErrorSchema = fixedErrorSchema(
  "WORKSPACE_NOT_FOUND",
  workspaceDetailsSchema
);
const pathOutsideWorkspaceErrorSchema = fixedErrorSchema(
  "PATH_OUTSIDE_WORKSPACE",
  pathDetailsSchema
);
const pathBlockedErrorSchema = fixedErrorSchema(
  "PATH_BLOCKED",
  pathDetailsSchema
);
const invalidArgumentErrorSchema = fixedErrorSchema(
  "INVALID_ARGUMENT",
  invalidArgumentDetailsSchema
);
const patchTooLargeErrorSchema = fixedErrorSchema(
  "PATCH_TOO_LARGE",
  patchTooLargeDetailsSchema
);
const secretContentBlockedErrorSchema = fixedErrorSchema(
  "SECRET_CONTENT_BLOCKED",
  emptyDetailsSchema
);
const symlinkPatchBlockedErrorSchema = fixedErrorSchema(
  "SYMLINK_PATCH_BLOCKED",
  emptyDetailsSchema
);
const patchInvalidErrorSchema = fixedErrorSchema(
  "PATCH_INVALID",
  patchInvalidDetailsSchema
);
const gitUnavailableErrorSchema = fixedErrorSchema(
  "GIT_UNAVAILABLE",
  emptyDetailsSchema
);
const patchCheckFailedErrorSchema = fixedErrorSchema(
  "PATCH_CHECK_FAILED",
  emptyDetailsSchema
);
const patchApplyFailedErrorSchema = fixedErrorSchema(
  "PATCH_APPLY_FAILED",
  emptyDetailsSchema
);
const internalErrorSchema = fixedErrorSchema(
  "INTERNAL_ERROR",
  emptyDetailsSchema
);

export const applyPatchErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  invalidArgumentErrorSchema,
  patchTooLargeErrorSchema,
  secretContentBlockedErrorSchema,
  symlinkPatchBlockedErrorSchema,
  patchInvalidErrorSchema,
  gitUnavailableErrorSchema,
  patchCheckFailedErrorSchema,
  patchApplyFailedErrorSchema,
  internalErrorSchema
]);
```

Every member uses its literal fixed message, `retryable:z.literal(false)`, and only its approved strict details schema.

Use this exact failure-input type:

```ts
export type ApplyPatchFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "patch"; reason: "empty" } }
  | { code: "PATCH_TOO_LARGE"; details: { limit_bytes: number } }
  | { code: "SECRET_CONTENT_BLOCKED"; details: Record<string, never> }
  | { code: "SYMLINK_PATCH_BLOCKED"; details: Record<string, never> }
  | { code: "PATCH_INVALID"; details: { reason: "no_file_paths" | "invalid_path_encoding" } }
  | { code: "GIT_UNAVAILABLE"; details: Record<string, never> }
  | { code: "PATCH_CHECK_FAILED"; details: Record<string, never> }
  | { code: "PATCH_APPLY_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };
```

Define the exact envelope and consistency refinement:

```ts
export const applyPatchOutputShape = {
  codexgpt_tool: z.literal("apply_patch"),
  codexgpt_title: z.literal("Apply Patch"),
  ok: z.boolean(),
  data: applyPatchDataSchema.nullable(),
  error: applyPatchErrorSchema.nullable(),
  meta: toolMetaSchema
};
```

`applyPatchOutputSchema` must require non-null `data` and null `error` when `ok:true`, and null `data` plus non-null `error` when `ok:false`. Export pure constructors that parse through the schema and call `createToolMeta(durationMs)` exactly like `edit.ts`.

- [x] **Step 4: Run focused constructor tests and confirm GREEN**

Run:

```text
node --test test/apply-patch-contract.test.mjs
```

Expected: constructor/schema tests PASS. Direct-handler tests are not yet present.

- [x] **Step 5: Review Task 1 diff and checkpoint**

Use `show_changes` restricted to `src/tools/schemas/applyPatch.ts` and `test/apply-patch-contract.test.mjs`. Confirm no server, algorithm, Tool Card, authentication, dependency, or workspace-lifecycle change exists.

When implementation execution has the required Git approval, the Task 1 checkpoint commit is:

```text
git add src/tools/schemas/applyPatch.ts test/apply-patch-contract.test.mjs
git commit -m "test(schema): define apply_patch result contract"
```

---

### Task 2: Migrate the direct handler and classify failures safely

**Files:**
- Modify: `test/apply-patch-contract.test.mjs`
- Modify: `src/server.ts:1-620,1058-1163,1540-1661,3121-3164`

**Interfaces:**
- Consumes: all schema exports from Task 1; existing `patchTouchedPaths`, `patchHasSymlinkMode`, `applyWorkspacePatch`, `safeTreePathDetail`, `safeTreeWorkspaceIdDetail`, `nodeErrorCode`, `assertWriteToolAllowed`, and `invalidateWorkspaceAnalysis`.
- Produces: `ApplyPatchProviderResult`, `ApplyPatchProviderContext`, optional `applyPatchResultProvider`, strict `applyPatchProviderResultSchema`, tool-local `ApplyPatchOperationError`, tool-local `ApplyPatchTargetError`, `classifyApplyPatchFailure`, and the migrated direct handler.

- [x] **Step 1: Add shared helpers and failing direct-handler contract tests**

Following `test/edit-contract.test.mjs`, add `createTestConfig`, `withInMemoryClient`, `withTempWorkspace`, `parseApplyPatchResult`, and `assertApplyPatchFailure`.

`assertApplyPatchFailure` must require:

```js
assert.equal(result.isError, true);
assert.equal(result.structuredContent.ok, false);
assert.equal(result.structuredContent.data, null);
assert.equal(result.structuredContent.error.code, expectedCode);
assert.equal(
  result.structuredContent.error.message,
  APPLY_PATCH_ERROR_MESSAGES[expectedCode]
);
assert.equal(result.structuredContent.error.retryable, false);
assert.deepEqual(result.structuredContent.error.details, expectedDetails);
assert.deepEqual(result.structuredContent.meta.warnings, []);
```

Add tests for:

1. exact advertised `outputSchema` and one real successful patch;
2. a multi-file patch returning all unique paths in patch-discovery order;
3. exact preservation of empty successful stdout/stderr, diff statistics, literal `changed:true`, and submitted patch diff only;
4. explicit unknown workspace;
5. empty patch and whitespace-only patch;
6. configured patch-size overflow;
7. secret-looking patch content;
8. symlink creation, deletion, and mode-change rejection;
9. non-patch text with no file paths;
10. malformed quoted Git path encoding;
11. blocked `.env` and `.git` targets;
12. escaping, absolute, UNC, device, drive-relative, ADS, reserved-name, trailing-dot/space, and parent-symlink escape targets;
13. unavailable Git classification through an injected provider failure marker;
14. a real `git apply --check` mismatch producing `PATCH_CHECK_FAILED` without raw Git diagnostics;
15. injected apply-stage failure producing `PATCH_APPLY_FAILED` without raw diagnostics;
16. generic provider rejection producing `INTERNAL_ERROR`;
17. malformed provider objects: missing field, unknown field, negative stats, `changed:false`, empty diff, empty paths, and duplicate paths;
18. returned safe-path set missing one expected path, adding an extra path, or returning a different path;
19. returned unsafe or blocked path after provider execution;
20. fixed human-readable error text and absence of raw patch, Git stderr, exception name, executable path, absolute unsafe path, and secret value.

Use dependency injection only for provider-result and stage-marker cases. Real path, policy, parser, size, secret, symlink, and check-stage cases must exercise production behavior.

- [x] **Step 2: Run focused tests and confirm RED**

Run:

```text
node --test test/apply-patch-contract.test.mjs
```

Expected: FAIL because direct `apply_patch` has no `outputSchema`, returns flat fields, throws raw failures, has no provider seam, and does not validate provider-returned path sets at the handler boundary.

- [x] **Step 3: Add imports, exact provider types, and strict provider-result validation**

Import from the new schema module:

```ts
import {
  APPLY_PATCH_ERROR_MESSAGES,
  applyPatchDataSchema,
  applyPatchOutputShape,
  createApplyPatchFailure,
  createApplyPatchSuccess,
  type ApplyPatchFailureInput
} from "./tools/schemas/applyPatch.js";
```

Add these exact interfaces beside the other provider contexts:

```ts
export interface ApplyPatchProviderResult {
  paths: string[];
  stdout: string;
  stderr: string;
  additions: number;
  deletions: number;
  changed: true;
  diff: string;
}

export interface ApplyPatchProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  patch: string;
}
```

Extend `CodexGPTServerDependencies`:

```ts
applyPatchResultProvider?: (
  context: ApplyPatchProviderContext
) => ApplyPatchProviderResult | Promise<ApplyPatchProviderResult>;
```

Add one strict result schema near the write/edit provider schemas:

```ts
const applyPatchProviderResultSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  stdout: z.string(),
  stderr: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.literal(true),
  diff: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (new Set(value.paths).size !== value.paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paths"],
      message: "Patch provider paths must be unique."
    });
  }
});
```

Create the default provider near the write/edit providers:

```ts
const applyPatchResultProvider =
  dependencies.applyPatchResultProvider ??
  ((context: ApplyPatchProviderContext) =>
    applyWorkspacePatch(
      context.config,
      context.guard,
      context.workspace,
      context.patch
    ));
```

Change `applyWorkspacePatch` to return `ApplyPatchProviderResult`; do not change its input or successful operation sequence.

- [x] **Step 4: Add tool-local internal failure markers without creating a project-wide hierarchy**

Add these classes near the patch helpers:

```ts
type ApplyPatchOperationFailureKind =
  | "git_unavailable"
  | "check_failed"
  | "apply_failed";

export class ApplyPatchOperationError extends CodexGPTError {
  constructor(
    public readonly applyPatchFailureKind: ApplyPatchOperationFailureKind
  ) {
    super(`apply_patch ${applyPatchFailureKind}`);
  }
}

class ApplyPatchTargetError extends CodexGPTError {
  constructor(
    public readonly targetPath: string,
    public readonly targetCause: unknown
  ) {
    super(targetCause instanceof Error ? targetCause.message : String(targetCause));
  }
}
```

The exported operation class exists only so deterministic contract tests can inject check/apply/Git-unavailable stage failures through the internal dependency seam. It is not an MCP argument, result field, environment switch, or public error payload.

Wrap only the current per-path policy check:

```ts
for (const touchedPath of paths) {
  try {
    guard.resolve(workspace, touchedPath, { forWrite: true });
    assertWriteToolAllowed(config, touchedPath);
  } catch (error) {
    throw new ApplyPatchTargetError(touchedPath, error);
  }
}
```

Replace raw check/apply error wrapping with stage markers while preserving subprocess arguments, cwd, input, encoding, maxBuffer, environment, and success output:

```ts
if (check.error) {
  if (nodeErrorCode(check.error) === "ENOENT") {
    throw new ApplyPatchOperationError("git_unavailable");
  }
  throw new ApplyPatchOperationError("check_failed");
}
if (check.status !== 0) {
  throw new ApplyPatchOperationError("check_failed");
}
```

```ts
if (applied.error) {
  if (nodeErrorCode(applied.error) === "ENOENT") {
    throw new ApplyPatchOperationError("git_unavailable");
  }
  throw new ApplyPatchOperationError("apply_failed");
}
if (applied.status !== 0) {
  throw new ApplyPatchOperationError("apply_failed");
}
```

Do not include `check.stderr`, `check.stdout`, `applied.stderr`, `applied.stdout`, `error.message`, or executable paths in these internal marker messages.

- [x] **Step 5: Implement `classifyApplyPatchFailure` with fixed safe details**

Use this classification order:

1. explicit unknown workspace -> `WORKSPACE_NOT_FOUND` with sanitized `workspace_id`;
2. `ApplyPatchTargetError` whose cause begins `Path is blocked by safety rules:` or `Refusing to write through a symlink:` -> `PATH_BLOCKED` with `safeTreePathDetail(targetPath)`;
3. `ApplyPatchTargetError` whose cause begins any established outside/path-invalid prefix -> `PATH_OUTSIDE_WORKSPACE` with `safeTreePathDetail(targetPath)`;
4. exact `patch is required.` -> `INVALID_ARGUMENT` with `{ argument:"patch", reason:"empty" }`;
5. `Patch is too large.` prefix -> `PATCH_TOO_LARGE` with `{ limit_bytes:config.maxWriteBytes }`;
6. secret-content refusal -> `SECRET_CONTENT_BLOCKED` with `{}`;
7. symlink-patch refusal -> `SYMLINK_PATCH_BLOCKED` with `{}`;
8. `Patch must include at least one file path.` -> `PATCH_INVALID` with `no_file_paths`;
9. `Invalid quoted Git path:` -> `PATCH_INVALID` with `invalid_path_encoding`;
10. `ApplyPatchOperationError("git_unavailable")` -> `GIT_UNAVAILABLE`;
11. `ApplyPatchOperationError("check_failed")` -> `PATCH_CHECK_FAILED`;
12. `ApplyPatchOperationError("apply_failed")` -> `PATCH_APPLY_FAILED`;
13. malformed provider output, unsafe/mismatched provider-returned paths, generic provider errors, and everything else -> `INTERNAL_ERROR`.

Use the same established outside prefixes as write/edit:

```ts
const outsidePrefixes = [
  "Path contains a null byte.",
  "Path escapes workspace root:",
  "Path resolves outside workspace root through a symlink:",
  "Write path resolves through a parent outside the workspace:",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:"
];
```

Never place the raw exception message or submitted patch in `details`.

- [x] **Step 6: Replace only the direct `apply_patch` handler boundary**

Add `outputSchema: applyPatchOutputShape` to the descriptor. Use this exact sequence:

```ts
try {
  const workspace = workspaces.getWorkspace(args.workspace_id);
  const patch = String(args.patch ?? "");
  const expectedPaths = patchTouchedPaths(patch);
  if (!patch.trim()) throw new CodexGPTError("patch is required.");
  if (!expectedPaths.length) {
    throw new CodexGPTError("Patch must include at least one file path.");
  }

  const result = applyPatchProviderResultSchema.parse(
    await applyPatchResultProvider({ config, guard, workspace, patch })
  );

  let normalizedReturnedPaths: string[];
  try {
    normalizedReturnedPaths = result.paths.map((returnedPath) => {
      const resolved = guard.resolve(workspace, returnedPath, { forWrite: true });
      assertWriteToolAllowed(config, resolved.relPath);
      if (returnedPath !== resolved.relPath) {
        throw new CodexGPTError("Apply patch provider returned a non-normalized path.");
      }
      return resolved.relPath;
    });
  } catch {
    throw new CodexGPTError("Apply patch provider returned an unsafe or non-normalized path.");
  }

  const expectedSet = new Set(expectedPaths);
  const returnedSet = new Set(normalizedReturnedPaths);
  if (
    expectedSet.size !== returnedSet.size ||
    Array.from(expectedSet).some((value) => !returnedSet.has(value))
  ) {
    throw new CodexGPTError("Apply patch provider returned a mismatched path set.");
  }

  const data = applyPatchDataSchema.parse({
    workspace_id: workspace.id,
    root: workspace.root,
    paths: normalizedReturnedPaths,
    stdout: result.stdout,
    stderr: result.stderr,
    additions: result.additions,
    deletions: result.deletions,
    changed: result.changed,
    diff: result.diff
  });

  invalidateWorkspaceAnalysis(workspace.id);
  const text = [
    "# Apply Patch",
    "",
    `Paths: ${normalizedReturnedPaths.join(", ")}`,
    `Diff stats: +${result.additions} -${result.deletions}`,
    result.stderr ? `stderr: ${result.stderr}` : "",
    diffBlock(result.diff)
  ].filter(Boolean).join("\n");
  return textResult(text, createApplyPatchSuccess(data));
} catch (error) {
  const failure = classifyApplyPatchFailure(error, args, config);
  const structured = createApplyPatchFailure(failure);
  const text = [
    "# Apply Patch Error",
    "",
    `Code: ${failure.code}`,
    APPLY_PATCH_ERROR_MESSAGES[failure.code]
  ].join("\n");
  return {
    ...textResult(text, structured),
    isError: true
  };
}
```

Important ordering rules:

- malformed quoted-path decoding and no-path input fail before provider execution;
- production path/policy validation remains inside `applyWorkspacePatch` before either Git subprocess;
- provider-returned result validation and returned-path-set validation occur after provider completion but before cache invalidation;
- only a fully validated success invalidates analysis, exactly once;
- all failures return `isError:true`, `data:null`, fixed text, and no partial structured success.

- [x] **Step 7: Run focused tests and confirm GREEN**

Run:

```text
node --test test/apply-patch-contract.test.mjs
```

Expected: all schema and direct-handler tests PASS.

- [x] **Step 8: Review Task 2 diff and checkpoint**

Confirm:

- successful `applyWorkspacePatch` subprocess arguments and order are unchanged;
- only internal failure signaling changes, with no raw diagnostic publication;
- direct `write`, `edit`, `bash`, authentication, dependencies, and workspace lifecycle are unchanged;
- cache invalidation follows complete success validation;
- provider-result failures do not invalidate analysis.

When implementation execution has the required Git approval, the Task 2 checkpoint commit is:

```text
git add src/server.ts test/apply-patch-contract.test.mjs
git commit -m "feat(schema): migrate apply_patch handler"
```

---

### Task 3: Prove cache behavior, migrate consumers, and preserve adjacent tools

**Files:**
- Modify: `test/apply-patch-contract.test.mjs`
- Modify: `src/toolCardWidget.ts:600-670,1198-1245`
- Modify: `scripts/smoke.mjs:470-490`
- Modify: `test/edit-contract.test.mjs:660-690`
- Modify: `test/write-contract.test.mjs:550-580`

**Interfaces:**
- Consumes: the direct nested `apply_patch` envelope from Task 2.
- Produces: dedicated `renderApplyPatch(data)`; keeps `renderFile(data)` only for `export_pro_context`; proves nested Smoke, wrapper, adjacent-renderer, and analysis-cache compatibility.

- [x] **Step 1: Add failing analysis-cache ordering tests**

Using the existing public structured-search analysis observation pattern, prove:

- a fully validated successful patch invalidates cached workspace analysis;
- a provider rejection does not invalidate it;
- a malformed provider object does not invalidate it;
- a provider result with duplicate paths does not invalidate it;
- a provider result with an unsafe returned path does not invalidate it;
- a missing, extra, or different returned path set does not invalidate it;
- a check-stage failure and apply-stage failure do not invalidate it.

Do not add a production-only cache inspection hook.

- [x] **Step 2: Add failing Tool Card tests**

Assert widget source contains a dedicated renderer beginning with:

```js
function renderApplyPatch(data) {
  const patchData = data?.data ?? {};
  const error = data?.error ?? {};
  const failed = data?.ok === false;
```

Success rendering must use nested `paths`, `additions`, `deletions`, and `diff`. Failure rendering must use only fixed `error.code` and `error.message`.

Assert routing becomes exactly:

```js
} else if (tool === "apply_patch") {
  root.innerHTML = renderApplyPatch(data);
} else if (tool === "export_pro_context") {
  root.innerHTML = renderFile(data);
```

Update the existing edit/write contract routing assertions so they require this split and continue proving that `edit` and `write` use their dedicated nested renderers.

- [x] **Step 3: Add failing `codexgpt` wrapper tests**

Call `codexgpt` with `action:"apply_patch"`. Assert:

- wrapper identity fields remain present;
- child `ok/data/error/meta` remains unchanged;
- all nine successful fields stay only under child `data`;
- none of `workspace_id`, `root`, `paths`, `stdout`, `stderr`, `additions`, `deletions`, `changed`, or `diff` is restored at the wrapper top level;
- a wrapped failure remains fixed and excludes raw patch/Git/provider diagnostics.

- [x] **Step 4: Run focused tests and confirm RED**

Run:

```text
node --test test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs
```

Expected: FAIL because the Tool Card still routes `apply_patch` through `renderFile`, Smoke still reads flat direct fields, and existing adjacent routing assertions still describe the legacy grouping.

- [x] **Step 5: Implement the dedicated nested Tool Card renderer**

Add beside `renderEdit`:

```js
function renderApplyPatch(data) {
  const patchData = data?.data ?? {};
  const error = data?.error ?? {};
  const failed = data?.ok === false;
  const paths = Array.isArray(patchData.paths) ? patchData.paths : [];
  const visiblePaths = paths.slice(0, 8);
  const pathPreview = visiblePaths.join(", ") +
    (paths.length > visiblePaths.length ? `, … +${paths.length - visiblePaths.length}` : "");
  const pills = failed
    ? pill(error.code || "error", "bad")
    : [
        pill(paths.length + " files", "info"),
        patchData.additions !== undefined ? pill("+" + patchData.additions, "good") : "",
        patchData.deletions !== undefined ? pill("-" + patchData.deletions, "bad") : ""
      ].join("");
  const body = failed
    ? '<div class="empty">' + esc(error.message || "Apply patch failed.") + '</div>'
    : '<div class="summary">' +
      summaryItem("Paths", pathPreview || "-") +
      summaryItem("Changed", patchData.changed ? "yes" : "no") +
      '</div>' +
      (patchData.diff
        ? codebox("patch", renderDiff(patchData.diff), "")
        : '<div class="empty">No diff returned.</div>');
  return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
}
```

Route only `apply_patch` to this renderer. Keep `export_pro_context` alone on `renderFile(data)`.

- [x] **Step 6: Update only direct `apply_patch` Smoke field access**

Change the existing success assertions to:

```js
const patchData = patchResult.structuredContent.data;
if (!patchData?.changed || !patchData.paths?.includes?.('demo.txt')) {
  throw new Error(`apply_patch did not report the patched file: ${JSON.stringify(patchResult.structuredContent)}`);
}
if (patchData.diff?.includes?.('other.txt')) {
  throw new Error(`apply_patch leaked unrelated workspace diff: ${patchData.diff}`);
}
```

Preserve all existing real patch, file mutation, analysis invalidation, blocked `.env`, custom blocked-prefix, quoted octal path, blocked copy target, and symlink-mode rejection tests. Where those cases currently expect a thrown RPC error, update them to assert the strict failed envelope and stable code without weakening the behavioral check.

Do not alter unrelated Smoke setup, Codex session fixtures, Cloudflare checks, or other tools.

- [x] **Step 7: Run focused and adjacent regressions**

Run:

```text
node --test test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs test/read-contract.test.mjs test/git-diff-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: PASS. Adjacent tools retain their current exact contracts.

- [x] **Step 8: Review Task 3 diff and checkpoint**

Confirm:

- `renderFile` is used only for `export_pro_context`;
- direct `apply_patch` consumers read nested data;
- Smoke preserves every existing safety case;
- no unrelated Tool Card formatting or script refactor exists;
- no production behavior outside direct `apply_patch` changed.

When implementation execution has the required Git approval, the Task 3 checkpoint commit is:

```text
git add src/toolCardWidget.ts scripts/smoke.mjs test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs
git commit -m "feat(ui): render nested apply_patch results"
```

---

### Task 4: Run complete gates, reconcile documentation, and prepare conditional publication

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-2.md`
- Modify: `docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md`
- Include production, test, and Smoke files changed by Tasks 1-3.

**Interfaces:**
- Produces: verified tenth-slice implementation evidence, rollback record, synchronized memory, bounded active archive, and a reviewed publication change set.

- [x] **Step 1: Run the focused contract from a fresh process**

Run:

```text
node --test test/apply-patch-contract.test.mjs
```

Expected: all focused tests PASS with no raw diagnostics in public failures.

- [x] **Step 2: Run adjacent contract tests**

Run:

```text
node --test test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs test/read-contract.test.mjs test/git-diff-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: PASS.

- [x] **Step 3: Run the complete Node regression suite**

Run:

```text
node --test test/*.test.mjs
```

Expected: all tests PASS. Record exact pass/fail/skip totals in `Memory.md` and `docs/memory/archive/phase-1-part-2.md`.

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

Then use `show_changes` with the complete unstaged diff. Require:

- no whitespace errors;
- no secret-looking values or realistic credentials in fixtures;
- no raw patch/Git/system diagnostic in public failure paths;
- no modified production file outside `src/server.ts`, `src/toolCardWidget.ts`, and `src/tools/schemas/applyPatch.ts`;
- no changes to `write`, `edit`, `bash`, authentication, dependencies, workspace lifecycle, Phase 2/3, or closed archive Volume 1;
- no claim of atomicity, rollback, isolation, or conflict-free application.

- [x] **Step 6: Run `neat-freak` reconciliation**

Load and apply the `neat-freak` skill. Verify and update:

- `Memory.md` remains below 150 lines and 18 KB when practical, and below the hard 200-line/25-KB limit;
- `AGENTS.md` documentation map includes both the `apply_patch` design and plan;
- the design and plan status match actual implementation/publication state;
- `CHANGELOG.md` records the exact direct `apply_patch` schema and stable failures without claiming transactionality;
- `docs/memory/archive/phase-1-part-2.md` receives append-only implementation and verification records with exact commands, results, risks, rollback, and next action;
- the active archive volume size is checked after the completed STEP and a new volume is opened only if it is at or above 80% of the configured direct-read byte limit;
- stale “first nine slices” wording changes only after complete implementation evidence exists;
- no earlier archive volume or historical entry is rewritten.

- [x] **Step 7: Re-run focused verification after reconciliation**

Run separately:

```text
node --test test/apply-patch-contract.test.mjs
git diff --check
```

Expected: PASS.

- [x] **Step 8: Review the final publication set before Git operations**

Use `show_changes` and require the final set to contain only these exact paths:

```text
AGENTS.md
CHANGELOG.md
Memory.md
docs/memory/archive/phase-1-part-2.md
docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md
docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md
scripts/smoke.mjs
src/server.ts
src/toolCardWidget.ts
src/tools/schemas/applyPatch.ts
test/apply-patch-contract.test.mjs
test/edit-contract.test.mjs
test/write-contract.test.mjs
```

Stop for the Git/publication approval required by project rules unless the user has explicitly authorized autonomous publication for the implementation slice.

- [x] **Step 9: Stage, commit, push, and verify CI only after explicit publication approval**

Use exactly:

```text
git add AGENTS.md CHANGELOG.md Memory.md docs/memory/archive/phase-1-part-2.md docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md scripts/smoke.mjs src/server.ts src/toolCardWidget.ts src/tools/schemas/applyPatch.ts test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs
git commit -m "feat(schema): add exact apply_patch result contract"
git push origin main
```

After push, verify the branch-head GitHub Actions run on Ubuntu and Windows with Node 20 and 24. Record the implementation commit, CI run ID, each job result, local/remote synchronization, active archive size, and final clean working tree in `Memory.md` and the append-only active Phase 1 archive. If that final record changes tracked files after the implementation push, create one exact documentation commit and push it only with the separately approved publication workflow.

## Local Execution Evidence

- Focused direct `apply_patch` contract: 14/14 passed.
- Adjacent `apply_patch`/`edit`/`write`/`read`/`git_diff`/`show_changes` contracts: 89/89 passed.
- Complete `node:test` regression suite: 177/177 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed.
- `npm run stress`: passed on native Windows, including its internal build.
- `git diff --check`: passed before documentation reconciliation, with only established LF-to-CRLF working-copy warnings.
- Publication complete: implementation commit `c761b4e` was pushed to `origin/main`; CI run `29233787814` passed all Ubuntu/Windows Node 20/24 jobs.

## Self-Review

- Spec coverage: all nine success fields, twelve fixed errors, exact details, provider boundary, tool-local stage markers, path parser behavior, returned-path validation, exact path-set comparison, cache ordering, safe text, Tool Card, Smoke, supertool wrapper, adjacent consumers, TDD, complete local gates, neat-freak reconciliation, bounded memory archive, rollback, and conditional publication are assigned to explicit tasks.
- Placeholder scan passed: no `TBD`, `TODO`, “implement later”, undefined interface, or wildcard Git path remains.
- Type consistency: `ApplyPatchProviderResult`, `ApplyPatchProviderContext`, `applyPatchResultProvider`, `applyPatchProviderResultSchema`, `ApplyPatchOperationError`, `ApplyPatchFailureInput`, `applyPatchDataSchema`, `applyPatchOutputShape`, `applyPatchOutputSchema`, `createApplyPatchSuccess`, `createApplyPatchFailure`, and `renderApplyPatch` use the same names and field shapes in every task.
- Error consistency: every approved code has one fixed message, one exact details schema, and `retryable:false`; raw subprocess and exception diagnostics never cross the public boundary.
- Scope consistency: patch algorithms remain synchronous and non-atomic; `write`, `edit`, `bash`, Git read tools, authentication, dependencies, workspace lifecycle, rollback, undo, expected hashes, fuzzy patching, and Phase 2/3 remain outside the implementation boundary.
- Execution boundary: this plan does not itself authorize implementation, staging, committing, pushing, credentials, history rewriting, access expansion, or Phase 2.

# `write` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only the direct `write` MCP tool to the strict Phase 1 schema-v1 envelope while preserving current file-write behavior.

**Architecture:** Add one exact schema module and one injectable provider boundary around the existing `writeTextFile` implementation. The direct handler validates provider output, classifies failures into fixed public errors, and returns nested structured data. A dedicated Tool Card renderer consumes the new nested contract without changing adjacent write tools.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, existing CodexGPT file/path/redaction services.

## Global Constraints

- Native Windows remains the primary platform; WSL is not required.
- Keep `src/fsOps.ts` write algorithms unchanged except exporting the existing result type.
- Do not migrate `edit` or `apply_patch`.
- Do not add atomic writes, expected hashes, transactions, rollback, undo, dependencies, authentication changes, or Phase 2/3 behavior.
- Preserve legacy human-readable MCP `content`.
- Use strict tool-specific schema-v1 envelopes with exactly `schemaVersion`, `durationMs`, and `warnings` in `meta`.
- Never expose raw exceptions, absolute unsafe paths, stack traces, file content, or secrets in failures.
- Follow TDD: every production behavior change must be preceded by a focused failing test.

---

### Task 1: Define and prove the strict `write` contract

**Files:**
- Create: `test/write-contract.test.mjs`
- Create: `src/tools/schemas/write.ts`
- Modify: `src/fsOps.ts`

**Interfaces:**
- Produces: `writeDataSchema`, `writeOutputShape`, `writeOutputSchema`, `createWriteSuccess`, `createWriteFailure`, `WRITE_ERROR_MESSAGES`, `WriteFailureInput`, and exported `WriteFileResult`.

- [x] **Step 1: Write failing constructor/schema tests**

Add tests that import the not-yet-existing schema module and assert the exact success contract, all eleven approved failures, strict details, SHA-256/stat validation, unknown-field rejection, and success/failure state consistency.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/write-contract.test.mjs`

Expected: FAIL because `src/tools/schemas/write.ts` does not exist.

- [x] **Step 3: Export the existing write result type and implement the exact schema**

Export the current `writeTextFile` return shape as:

```ts
export interface WriteFileResult {
  path: string;
  bytes: number;
  sha256: string;
  existed: boolean;
  diff: DiffResult;
}
```

Create strict success data with the nine established public fields and discriminated error schemas for the eleven approved codes. Add pure success/failure constructors using `createToolMeta`.

- [x] **Step 4: Run the focused constructor tests and confirm GREEN**

Run: `node --test test/write-contract.test.mjs`

Expected: constructor/schema tests PASS while later handler tests remain absent.

---

### Task 2: Migrate the direct handler with safe failure classification

**Files:**
- Modify: `test/write-contract.test.mjs`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: schema exports from Task 1 and `WriteFileResult`.
- Produces: `WriteProviderContext` and optional `writeResultProvider` dependency.

- [x] **Step 1: Add failing handler contract tests**

Cover exact advertised `outputSchema`, real create/overwrite/no-change behavior, unknown workspace, outside/blocked paths, directory, binary target, oversized content/existing file, secret content, overwrite refusal, missing parent, recognized write failure, malformed provider result, safe text output, and no raw diagnostic leakage.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `node --test test/write-contract.test.mjs`

Expected: FAIL because direct `write` still returns flat structured fields and has no provider seam or stable errors.

- [x] **Step 3: Add the provider seam, classifier, exact descriptor, and envelope handler**

Add:

```ts
export interface WriteProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  content: string;
  options: { createDirs: boolean; overwrite: boolean };
}
```

Default `writeResultProvider` delegates to `writeTextFile`. The handler resolves policy first, validates the provider result, invalidates analysis only for `diff.changed`, and returns `createWriteSuccess`. Catch all errors, map to `WriteFailureInput`, and return fixed text plus `createWriteFailure` with `isError: true`.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run: `node --test test/write-contract.test.mjs`

Expected: all schema and direct-handler contract tests PASS.

---

### Task 3: Migrate consumers and preserve adjacent behavior

**Files:**
- Modify: `test/write-contract.test.mjs`
- Modify: `src/toolCardWidget.ts`
- Modify where necessary: `scripts/smoke.mjs`
- Modify where necessary: `scripts/stress.mjs`

**Interfaces:**
- Consumes: direct nested `write` envelope.
- Produces: dedicated `renderWrite(data)` while retaining `renderFile(data)` for `edit`, `apply_patch`, and `export_pro_context`.

- [x] **Step 1: Add failing Tool Card and supertool tests**

Assert `renderWrite` consumes `data.path`, `data.bytes`, `data.additions`, `data.deletions`, and `data.diff`; failures consume `error`; the generic legacy renderer remains assigned to adjacent tools; wrapper action `write` retains the child envelope and removes legacy top-level fields.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `node --test test/write-contract.test.mjs`

Expected: FAIL because the current card reads flat write fields.

- [x] **Step 3: Implement the dedicated nested renderer and adjust direct assertions**

Add `renderWrite`, route only `tool === "write"` to it, and leave the legacy group unchanged for adjacent tools. Update only smoke/stress assertions that inspect direct write structured fields.

- [x] **Step 4: Run focused and adjacent regressions**

Run: `node --test test/write-contract.test.mjs test/read-contract.test.mjs test/show-changes-contract.test.mjs`

Expected: PASS.

---

### Task 4: Verify, document, reconcile memory, and publish

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1.md`
- Modify plan/spec status as appropriate.

**Interfaces:**
- Produces: exact verification evidence, rollback record, next action, clean project knowledge, and published Git history.

- [x] **Step 1: Run complete local gates**

Run separately:

```text
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Expected: all pass. Platform-capability skips must match established behavior.

- [x] **Step 2: Run neat-freak reconciliation**

Verify AGENTS/Memory size limits, documentation references, schema map, archive links, current state, limitations, and absence of stale Phase 1 counts. Make only minimal documentation and memory changes.

- [x] **Step 3: Re-run focused tests and diff check after cleanup**

Run:

```text
node --test test/write-contract.test.mjs
git diff --check
```

Expected: PASS.

- [x] **Step 4: Stage, commit, and push the complete eighth slice**

```text
git add AGENTS.md CHANGELOG.md Memory.md docs/memory/archive/phase-1.md docs/superpowers/specs/2026-07-13-write-output-schema-design.md docs/superpowers/plans/2026-07-13-write-output-schema.md src/fsOps.ts src/server.ts src/toolCardWidget.ts src/tools/schemas/write.ts test/write-contract.test.mjs scripts/smoke.mjs scripts/stress.mjs
git commit -m "feat(schema): add exact write result contract"
git push origin main
```

Omit unchanged optional files from staging. Confirm local `main` and `origin/main` point to the same commit.

## Self-review

- Spec coverage: all success fields, all eleven errors, provider boundary, cache invalidation, nested Tool Card, wrapper, TDD, complete gates, memory, cleanup, and publication are assigned to tasks.
- Placeholder scan: no implementation placeholders remain.
- Type consistency: `WriteFileResult`, `WriteProviderContext`, schema export names, and dependency names are consistent across tasks.

# `show_changes` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the direct `show_changes` tool an exact schema-v1 output contract with strict Git failures, safe optional-analysis degradation, preserved review checkpoints, and nested Tool Card/supertool compatibility.

**Architecture:** Add one dedicated schema module and one focused contract test file. Keep `src/gitOps.ts` and `src/analysis/*` unchanged; adapt only the direct `show_changes` registration/handler, three injectable provider seams, dedicated card rendering, and assertions that consume its structured result.

**Tech Stack:** TypeScript, Zod, MCP SDK, Node.js `node:test`, `tsx`, Git CLI.

## Global Constraints

- Modify only the `show_changes` vertical slice and directly required tests/docs.
- Preserve legacy text content, staged/unstaged selection, path scoping, `include_diff`, `since`, `mark_reviewed`, checkpoint, untracked-file fingerprint, UTF-8 path, and successful analysis behavior.
- Git, workspace, path, or malformed Git-provider failures must return `ok: false` with `isError: true`.
- Optional analysis failure must preserve valid Git review data, return `analysis: null`, and add only the fixed safe warning.
- Do not modify `src/gitOps.ts` or `src/analysis/*`.
- Do not add dependencies or production test modes.
- Do not expose raw Git diagnostics, analysis diagnostics, exception messages, stack traces, unsafe absolute paths, workspace roots, or secrets in failures/warnings.
- Keep direct `git_status` and `git_diff` contracts unchanged.
- Record completion in `Memory.md` and the Phase 1 archive.

---

## File map

- Create `src/tools/schemas/showChanges.ts`: exact success data, nested analysis, errors, output shape/schema, constructors, and fixed degradation warning.
- Create `test/show-changes-contract.test.mjs`: schema, runtime, provider-failure, checkpoint, wrapper, and Tool Card contract tests.
- Modify `src/server.ts`: imports, provider contexts/dependencies/defaults, exact registration, runtime flow, analysis degradation, and failure mapping.
- Modify `src/toolCardWidget.ts`: direct `show_changes` nested-envelope subtitle and renderer.
- Modify `scripts/smoke.mjs`: migrate direct `show_changes` assertions to `structuredContent.data` and `meta`.
- Modify `scripts/stress.mjs`: migrate direct `show_changes` assertions to `structuredContent.data`.
- Modify `AGENTS.md`, `CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/memory/archive/phase-1.md`, and `Memory.md`: record the sixth slice and next stopping point.

---

### Task 1: Add the strict `show_changes` schema contract

**Files:**
- Create: `test/show-changes-contract.test.mjs`
- Create: `src/tools/schemas/showChanges.ts`

**Interfaces:**
- Produces `SHOW_CHANGES_ANALYSIS_WARNING`.
- Produces `SHOW_CHANGES_ERROR_MESSAGES`.
- Produces `showChangesAnalysisSchema`, `showChangesDataSchema`, `showChangesOutputShape`, and `showChangesOutputSchema`.
- Produces `createShowChangesSuccess(data, durationMs?, warnings?)` and `createShowChangesFailure(failure, durationMs?)`.
- Produces `ShowChangesData`, `ShowChangesAnalysis`, and `ShowChangesFailureInput`.

- [ ] **Step 1: Write failing constructor and invariant tests**

Create fixtures for changed, clean, checkpoint-hit, stats-only, untracked-only, metadata-only, analysis-present, and analysis-null results. Assert the exact six-key envelope:

```js
const parsed = showChangesOutputSchema.parse(
  createShowChangesSuccess(changedShowChangesData(), 7)
);
assert.equal(parsed.codexpro_tool, "show_changes");
assert.equal(parsed.codexpro_title, "Show Changes");
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.data, changedShowChangesData());
assert.equal(parsed.error, null);
assert.deepEqual(parsed.meta, {
  schemaVersion: 1,
  durationMs: 7,
  warnings: []
});
```

Add failure cases:

```js
[
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "../outside" }],
  ["PATH_BLOCKED", { path: ".git/config" }],
  ["GIT_NOT_REPOSITORY", {}],
  ["GIT_UNAVAILABLE", {}],
  ["GIT_COMMAND_FAILED", {}],
  ["INTERNAL_ERROR", {}]
]
```

Add rejection assertions for unknown fields, `status_error`, `diff_error`, negative counts, invalid confidence/risk ids, malformed coverage/cache, `changed=false` with files/stats/diff, `include_diff=false` with diff/checkpoint state, invalid checkpoint-hit state, non-null analysis on clean/checkpoint results, non-empty diff without changed state, and inconsistent success/failure envelopes.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/show-changes-contract.test.mjs
```

Expected: FAIL because `src/tools/schemas/showChanges.ts` does not exist.

- [ ] **Step 3: Implement the minimal schema module**

Use strict Zod schemas. Preserve current nested analysis public names and inner coverage camelCase. Core data refinement must enforce:

```ts
if (!value.changed && (
  value.changed_files.length !== 0 ||
  value.additions !== 0 ||
  value.deletions !== 0 ||
  value.diff !== ""
)) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["changed"],
    message: "Unchanged reviews require no changed files, zero stats, and an empty diff."
  });
}

if (!value.include_diff && (
  value.diff !== "" ||
  value.review_marked ||
  value.review_checkpoint_hit
)) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["include_diff"],
    message: "include_diff=false cannot return a diff or use review checkpoints."
  });
}

if (value.review_checkpoint_hit && (
  value.review_since !== "last_shown" ||
  !value.include_diff ||
  value.changed ||
  value.changed_files.length !== 0 ||
  value.additions !== 0 ||
  value.deletions !== 0 ||
  value.diff !== "" ||
  value.analysis !== null
)) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["review_checkpoint_hit"],
    message: "Checkpoint hits require a suppressed last_shown review."
  });
}
```

Also require non-empty diff to imply `include_diff=true`, `changed=true`, and no checkpoint hit; non-null analysis to imply changed/no checkpoint; and `review_marked=true` to imply `include_diff=true`.

Constructors must parse before returning and use `createToolMeta(durationMs, warnings)`.

- [ ] **Step 4: Run focused constructor tests and verify GREEN**

Run:

```bash
node --test test/show-changes-contract.test.mjs
```

Expected: constructor/schema tests PASS; runtime tests are not added yet.

- [ ] **Step 5: Commit the schema boundary**

```bash
git add src/tools/schemas/showChanges.ts test/show-changes-contract.test.mjs
git commit -m "feat(schema): add show_changes result contract"
```

---

### Task 2: Migrate the direct handler to the exact envelope

**Files:**
- Modify: `test/show-changes-contract.test.mjs`
- Modify: `src/server.ts`

**Interfaces:**
- Add `ShowChangesGitProviderContext` with `config`, `guard`, `workspace`, optional `path`, and `staged`.
- Add `ShowChangesAnalysisProviderContext` with `config`, `guard`, `workspace`, and `changedPaths`.
- Add optional `showChangesStatusProvider`, `showChangesDiffProvider`, and `showChangesAnalysisProvider` dependencies.
- Default providers delegate to `gitDiffStatus`, `gitDiff`, and `reviewWorkspaceChanges`.

- [ ] **Step 1: Add failing runtime and provider tests**

Build the same in-memory MCP fixture style used by `git-status-contract.test.mjs` and `git-diff-contract.test.mjs`. Assert exact descriptor requirements:

```js
const descriptor = (await client.listTools()).tools.find(
  (tool) => tool.name === "show_changes"
);
assert.ok(descriptor.outputSchema);
assert.deepEqual(
  new Set(descriptor.outputSchema.required),
  new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
);
```

Cover:

- clean repository;
- unstaged change with status/diff/stats;
- `include_diff=false` without checkpoint consumption;
- repeated `last_shown` checkpoint hit;
- `since=workspace` checkpoint bypass;
- `mark_reviewed=false`;
- staged-only selection;
- path scoping, blank path, safe nonexistent pathspec, and unrelated-file exclusion;
- untracked content fingerprint changes;
- analysis-disabled/no-changed-path behavior;
- exact successful analysis mapping;
- analysis throw, malformed result, and secret-bearing failure degradation;
- unknown workspace, outside path, blocked path, non-Git root;
- status-provider Git absence/command failure/non-string/secret throw;
- diff-provider Git absence/command failure/non-string/secret throw.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/show-changes-contract.test.mjs
```

Expected: FAIL because `show_changes` has no `outputSchema`, still returns flat fields, and has no injectable providers.

- [ ] **Step 3: Add imports, provider seams, defaults, and failure helpers**

Import the new schema API and `ChangeAnalysis` type. Add defaults inside `createCodexProServer`:

```ts
const showChangesStatusProvider = dependencies.showChangesStatusProvider ??
  (({ config, guard, workspace, path, staged }) =>
    gitDiffStatus(config, guard, workspace, path, staged));

const showChangesDiffProvider = dependencies.showChangesDiffProvider ??
  (({ config, guard, workspace, path, staged }) =>
    gitDiff(config, guard, workspace, path, staged));

const showChangesAnalysisProvider = dependencies.showChangesAnalysisProvider ??
  (({ config, guard, workspace, changedPaths }) =>
    reviewWorkspaceChanges(config, guard, workspace, { changedPaths }));
```

Add a `ShowChangesFailureInput` thrown classifier equivalent to the completed Git classifiers, using safe workspace/path details. Use existing status/diff output classifiers for recognized Git diagnostics. Add one fixed failure-text helper using `SHOW_CHANGES_ERROR_MESSAGES`.

- [ ] **Step 4: Replace the direct handler**

Register `outputSchema: showChangesOutputShape`. Inside `try`:

1. Resolve workspace and normalized path.
2. Await status provider and require string.
3. Normalize/classify status; return failure immediately if needed.
4. Await diff provider and require string.
5. Normalize/classify diff; return failure immediately if needed.
6. Run existing changed-file, untracked fingerprint, checkpoint, stats, and changed-path logic.
7. Compute `changed` from checkpoint state, changed files, and response stats.
8. Attempt analysis only when enabled, changed paths exist, and no checkpoint hit.
9. Map analysis to current snake_case public fields, parse it with `showChangesAnalysisSchema`, and catch only the analysis boundary.
10. On analysis failure, use `analysis=null` and `[SHOW_CHANGES_ANALYSIS_WARNING]`.
11. Parse `showChangesDataSchema` and return `createShowChangesSuccess(data, 0, warnings)`.
12. In the outer catch, classify and return `createShowChangesFailure(...)` with `isError: true`.

Do not return `status_error` or `diff_error` anywhere.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test test/show-changes-contract.test.mjs
```

Expected: all focused runtime and failure/degradation tests PASS.

- [ ] **Step 6: Build and run adjacent Git contracts**

Run:

```bash
npm run build
node --test test/git-status-contract.test.mjs test/git-diff-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: build and all three Git/review contract files PASS.

- [ ] **Step 7: Commit the direct handler migration**

```bash
git add src/server.ts test/show-changes-contract.test.mjs
git commit -m "feat(schema): migrate show_changes output"
```

---

### Task 3: Migrate card, smoke, stress, and supertool consumers

**Files:**
- Modify: `test/show-changes-contract.test.mjs`
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/stress.mjs`

**Interfaces:**
- Direct card reads `data`, `error`, and `meta` only.
- Supertool wrapper retains `codexpro_super_action` and `wrapped_tool` while child fields remain nested.
- Smoke/stress helpers unwrap direct `show_changes` data before assertions.

- [ ] **Step 1: Add failing card and wrapper tests**

Assert the card source contains nested-envelope reads for `show_changes` and no `status_error`/`diff_error` dependency in its dedicated branch. Exercise both:

```js
await client.callTool({
  name: "codexpro",
  arguments: { action: "show_changes", args: { workspace_id } }
});

await client.callTool({
  name: "codexpro",
  arguments: { action: "changes", args: { workspace_id } }
});
```

Assert wrapper metadata plus nested `ok`, `data`, `error`, and `meta`, with no legacy flat review fields.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test test/show-changes-contract.test.mjs
```

Expected: FAIL because the dedicated card still reads flat fields.

- [ ] **Step 3: Update the dedicated Tool Card**

For subtitle and render branches:

```js
const review = data?.data ?? {};
const error = data?.error ?? {};
const warnings = Array.isArray(data?.meta?.warnings) ? data.meta.warnings : [];
```

Render failures from `error`; render normal review fields from `review`; render analysis from `review.analysis`; show a bounded warning state when `warnings` contains the fixed analysis warning. Do not change direct `git_status` or `git_diff` rendering.

- [ ] **Step 4: Migrate smoke/stress assertions**

For every direct result, use:

```js
const changeData = changes.structuredContent.data;
```

Then replace old `changes.structuredContent.changed`, `.diff`, `.analysis`, checkpoint, stats, and file assertions with `changeData.*`. Check degradation warnings through `changes.structuredContent.meta.warnings` only where applicable.

Do not change the behavioral meaning of existing fixtures.

- [ ] **Step 5: Run focused and compatibility tests**

Run:

```bash
node --test test/show-changes-contract.test.mjs
npm run smoke
npm run stress
```

Expected: focused contract, all 8 Smoke sections, and the complete native-Windows Stress suite PASS, with only the existing POSIX-only fixture skip.

- [ ] **Step 6: Commit compatibility migration**

```bash
git add src/toolCardWidget.ts scripts/smoke.mjs scripts/stress.mjs test/show-changes-contract.test.mjs
git commit -m "test(schema): migrate show_changes consumers"
```

---

### Task 4: Verify, document, tidy, and publish the slice

**Files:**
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- Modify: `docs/memory/archive/phase-1.md`
- Modify: `Memory.md`
- Modify only if neat-freak finds an objective inconsistency: directly affected documentation/test files.

**Interfaces:**
- Documentation identifies `show_changes` as the published sixth Phase 1 slice.
- Memory records exact commits, verification counts, limitations, rollback, and the next permitted action.

- [ ] **Step 1: Run the complete fresh verification matrix**

Run separately and record exact output:

```bash
node --test test/show-changes-contract.test.mjs
node --test test/git-status-contract.test.mjs test/git-diff-contract.test.mjs test/show-changes-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Expected: all commands exit 0; native-Windows Stress skips only its established POSIX-only multi-colon fixture.

- [ ] **Step 2: Update project documentation and memory**

Record:

- exact schema-v1 success/failure contract;
- removed `status_error`/`diff_error` partial-success fields;
- fixed analysis warning and `analysis: null` degradation;
- preserved review/checkpoint behavior;
- files changed and test counts;
- implementation commits and rollback;
- next action: a separately reviewed Phase 1 design for one additional tool; Phase 2 remains closed.

Keep `Memory.md` below 150 lines/18 KB when practical and append the full record to `docs/memory/archive/phase-1.md`.

- [ ] **Step 3: Run neat-freak reconciliation**

Load and follow the `neat-freak` skill. Audit `AGENTS.md`, `Memory.md`, relevant docs/spec/plan, dead references, current code contract, and size limits. Apply only minimum objective corrections; do not mix unrelated cleanup.

- [ ] **Step 4: Re-run final verification after tidy changes**

Run:

```bash
node --test test/show-changes-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Expected: all gates remain PASS.

- [ ] **Step 5: Review intended changes and commit records**

Use `show_changes` rather than shell Git inspection. Stage only intended documentation/memory/tidy files, then commit:

```bash
git add AGENTS.md CHANGELOG.md docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md docs/memory/archive/phase-1.md Memory.md docs/superpowers/plans/2026-07-12-show-changes-output-schema.md
git commit -m "docs(memory): record show_changes schema slice"
```

If neat-freak changed another directly affected file, add it explicitly and name it in the record.

- [ ] **Step 6: Push and verify publication state**

Run:

```bash
git push origin main
```

Then verify local `main` matches `origin/main`. When GitHub Actions is available, inspect the new workflow run and record Ubuntu/Windows Node 20/24 results. If remote CI cannot be queried through the available environment, report that limitation without claiming it passed.

---

## Plan self-review

- Every design requirement maps to one of the four tasks.
- No production code is written before the corresponding focused RED test.
- Type and field names match the approved design.
- `src/gitOps.ts`, `src/analysis/*`, direct Git contracts, dependencies, authentication, and Phase 2 remain outside scope.
- No placeholders or unspecified implementation steps remain.

## Local execution record

Tasks 1–3 and the local portion of Task 4 completed on 2026-07-12.

Commits:

- design: `5108e8a`;
- plan: `8e885ef`;
- strict schema: `69c5fea`;
- direct handler: `2329160`;
- card and consumer migration: `9777f32`;
- adjacent historical card expectations: `c41365a`.

TDD evidence included missing-module RED, legacy-handler RED, legacy-card RED, Smoke consumer RED, and Stress consumer RED before each corresponding GREEN state.

Fresh local gates passed 14/14 focused contracts, 50/50 adjacent Git/review contracts, 122/122 complete tests, Build, all eight Smoke sections, native-Windows Stress, and `git diff --check`. The attempted `npm test` command failed only because the repository defines no such script; the plan now records the actual complete command, `node --test test/*.test.mjs`.

Documentation reconciliation and neat-freak review are complete. The documentation commit, publication, and remote CI evidence are the remaining Task 4 actions.

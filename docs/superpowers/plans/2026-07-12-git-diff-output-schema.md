# `git_diff` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the direct `git_diff` tool an exact schema-v1 output contract with strict success data, stable redacted failures, and preserved Git diff behavior.

**Architecture:** Add one dedicated schema module and one focused contract test file. Keep `src/gitOps.ts` and `show_changes` unchanged; adapt only the direct `git_diff` registration/handler, its injectable provider seam, and direct-card compatibility.

**Tech Stack:** TypeScript, Zod, MCP SDK, Node.js `node:test`, `tsx`, Git CLI.

## Global Constraints

- Modify only the `git_diff` vertical slice and directly required tests/docs.
- Preserve legacy text `content`, `path`, `staged`, and `include_diff` semantics.
- Do not modify `src/gitOps.ts` or the `show_changes` public contract.
- Do not add dependencies.
- Use strict schema-v1 envelopes with fixed non-retryable public messages.
- Do not expose raw Git diagnostics, exception messages, stack traces, unsafe absolute paths, workspace roots, or secrets in failure output.
- Record completion in `Memory.md` and the Phase 1 archive.

---

## File map

- Create `src/tools/schemas/gitDiff.ts`: exact success data, errors, output shape/schema, and constructors.
- Create `test/git-diff-contract.test.mjs`: schema and end-to-end direct-tool contract tests.
- Modify `src/server.ts`: imports, dependency seam, classifiers, exact registration, and envelope handler.
- Modify `src/toolCardWidget.ts`: direct `git_diff` nested-envelope renderer without changing `show_changes`.
- Modify `scripts/smoke.mjs`: update old flat direct `git_diff` assertions.
- Modify `scripts/stress.mjs`: update old flat direct `git_diff` assertions.
- Modify `CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/memory/archive/phase-1.md`, and `Memory.md`: record the completed slice.

---

### Task 1: Add the strict `git_diff` schema contract

**Files:**
- Create: `test/git-diff-contract.test.mjs`
- Create: `src/tools/schemas/gitDiff.ts`

**Interfaces:**
- Produces `GIT_DIFF_ERROR_MESSAGES`.
- Produces `gitDiffDataSchema`, `gitDiffOutputShape`, and `gitDiffOutputSchema`.
- Produces `createGitDiffSuccess(data, durationMs?)` and `createGitDiffFailure(failure, durationMs?)`.
- Produces `GitDiffFailureInput`.

- [ ] **Step 1: Write failing constructor and invariant tests**

Create the opening contract tests with fixtures for changed, clean, stats-only, and metadata-only data. Assert:

```js
const parsed = gitDiffOutputSchema.parse(createGitDiffSuccess(changedData(), 7));
assert.equal(parsed.codexpro_tool, "git_diff");
assert.equal(parsed.codexpro_title, "Git Diff");
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.data, changedData());
assert.equal(parsed.error, null);
assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
```

Add failure cases for:

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

Add rejection assertions for unknown fields, `diff_error`, negative counts, `include_diff=false` with non-empty `diff`, `changed=false` with counts/diff, non-empty `diff` with `changed=false`, and inconsistent envelope states.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/git-diff-contract.test.mjs
```

Expected: FAIL because `src/tools/schemas/gitDiff.ts` does not exist.

- [ ] **Step 3: Implement the minimal schema module**

Implement strict Zod schemas matching the design. Core data refinement:

```ts
export const gitDiffDataSchema = gitDiffDataBaseSchema.superRefine((value, context) => {
  if (!value.changed && (value.additions !== 0 || value.deletions !== 0 || value.diff !== "")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed"], message: "Unchanged diffs require zero stats and an empty diff." });
  }
  if (!value.include_diff && value.diff !== "") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff"], message: "include_diff=false requires an empty diff." });
  }
  if (value.diff !== "" && (!value.include_diff || !value.changed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff"], message: "A non-empty diff requires include_diff=true and changed=true." });
  }
});
```

Use `createToolMeta` and `toolMetaSchema` from `./common.js`. Constructors must parse before returning.

- [ ] **Step 4: Run the focused constructor tests and verify GREEN**

Run:

```bash
node --test test/git-diff-contract.test.mjs
```

Expected: constructor/schema tests PASS; runtime tests may not yet exist.

- [ ] **Step 5: Commit the schema boundary**

```bash
git add src/tools/schemas/gitDiff.ts test/git-diff-contract.test.mjs
git commit -m "feat(schema): add git_diff result contract"
```

---

### Task 2: Migrate the direct handler to the exact envelope

**Files:**
- Modify: `test/git-diff-contract.test.mjs`
- Modify: `src/server.ts`

**Interfaces:**
- Add `GitDiffProviderContext` with `config`, `guard`, `workspace`, optional `path`, and `staged`.
- Add optional `gitDiffResultProvider` to `CodexProServerDependencies`.
- Default provider delegates to `gitDiff(config, guard, workspace, path, staged)`.

- [ ] **Step 1: Add failing runtime tests**

Add in-memory MCP tests that assert:

```js
const descriptor = (await client.listTools()).tools.find((tool) => tool.name === "git_diff");
assert.ok(descriptor.outputSchema);
assert.deepEqual(new Set(descriptor.outputSchema.required), new Set([
  "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
]));
```

Cover clean, changed, stats-only, staged-only, scoped path, blank path, safe nonexistent pathspec, unknown workspace, outside path, blocked path, non-Git root, injected Git absence, injected Git command failure, non-string provider output, and secret-bearing thrown exceptions.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/git-diff-contract.test.mjs
```

Expected: FAIL because `git_diff` does not advertise `outputSchema` and still returns flat structured fields.

- [ ] **Step 3: Add imports, provider seam, and classifiers**

Import:

```ts
import {
  GIT_DIFF_ERROR_MESSAGES,
  createGitDiffFailure,
  createGitDiffSuccess,
  gitDiffDataSchema,
  gitDiffOutputShape,
  type GitDiffFailureInput
} from "./tools/schemas/gitDiff.js";
```

Add `GitDiffProviderContext` and `gitDiffResultProvider` beside the `git_status` equivalents. Add narrow classifiers mirroring `git_status` but returning `GitDiffFailureInput`.

Recognized output mapping:

```ts
if (lower.includes("not a git repository")) return { code: "GIT_NOT_REPOSITORY", details: {} };
if (trimmed.startsWith("git unavailable or failed:")) {
  return /\bENOENT\b|not found/i.test(trimmed)
    ? { code: "GIT_UNAVAILABLE", details: {} }
    : { code: "GIT_COMMAND_FAILED", details: {} };
}
if (/^(fatal:|error:|git exited with status|usage: git )/.test(trimmed)) {
  return { code: "GIT_COMMAND_FAILED", details: {} };
}
```

- [ ] **Step 4: Replace the direct handler**

Register `outputSchema: gitDiffOutputShape`. In the handler:

```ts
const gitDiffFailureText = (failure: GitDiffFailureInput) => [
  "# Git Diff Error",
  "",
  `Code: ${failure.code}`,
  GIT_DIFF_ERROR_MESSAGES[failure.code]
].join("\n");

try {
  const workspace = workspaces.getWorkspace(args.workspace_id);
  const staged = parseBool(args.staged, false);
  const includeDiff = parseBool(args.include_diff, true);
  const rawProviderResult = await gitDiffResultProvider({
    config,
    guard,
    workspace,
    path: typeof args.path === "string" ? args.path : undefined,
    staged
  });
  if (typeof rawProviderResult !== "string") {
    throw new CodexProError("git_diff provider returned a non-string result.");
  }
  const rawDiff = normalizeGitOutput(rawProviderResult);
  const outputFailure = classifyGitDiffOutputFailure(rawDiff);
  if (outputFailure) {
    const structured = createGitDiffFailure(outputFailure);
    return { ...textResult(gitDiffFailureText(outputFailure), structured), isError: true };
  }
  const stats = diffStats(rawDiff);
  const data = gitDiffDataSchema.parse({
    workspace_id: workspace.id,
    root: workspace.root,
    path: args.path ?? "workspace diff",
    staged,
    include_diff: includeDiff,
    additions: stats.additions,
    deletions: stats.deletions,
    changed: stats.changed,
    diff: includeDiff ? rawDiff : ""
  });
  const text = includeDiff
    ? rawDiff
    : [
        "# Git Diff",
        "",
        `Workspace: ${workspace.root}`,
        `Path: ${args.path ?? "workspace diff"}`,
        `Staged: ${staged}`,
        `Diff stats: +${stats.additions} -${stats.deletions}`,
        "",
        "Raw diff omitted by include_diff=false."
      ].join("\n");
  return textResult(text, createGitDiffSuccess(data));
} catch (error) {
  const failure = classifyGitDiffThrownFailure(error, args);
  return { ...textResult(gitDiffFailureText(failure), createGitDiffFailure(failure)), isError: true };
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test test/git-diff-contract.test.mjs
```

Expected: all focused runtime contract tests PASS.

- [ ] **Step 6: Build and run the adjacent `git_status` contract**

Run:

```bash
npm run build
node --test test/git-status-contract.test.mjs test/git-diff-contract.test.mjs
```

Expected: build and both Git contract files PASS.

- [ ] **Step 7: Commit the direct handler migration**

```bash
git add src/server.ts test/git-diff-contract.test.mjs
git commit -m "feat(schema): migrate git_diff output"
```

---

### Task 3: Preserve cards, smoke, stress, and supertool compatibility

**Files:**
- Modify: `test/git-diff-contract.test.mjs`
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/stress.mjs`

**Interfaces:**
- Add `renderGitDiff(data)` for the direct nested envelope.
- Keep `renderChanges(data)` and `show_changes` flat fields unchanged.

- [ ] **Step 1: Add failing direct-card and wrapper tests**

Assert the widget dispatches direct `git_diff` to a dedicated renderer and that the renderer reads:

```js
const diffData = data?.data ?? {};
const error = data?.error ?? {};
```

Assert it does not read direct `data.diff`, `data.additions`, `data.deletions`, `data.changed`, or `data.diff_error` as top-level fields. Also assert `renderChanges` still reads its existing flat `show_changes` fields.

Call the `codexpro` supertool with action `git_diff` and assert wrapper metadata plus nested `data`/`error` with no legacy top-level diff fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test test/git-diff-contract.test.mjs
```

Expected: direct-card test FAIL because `git_diff` still routes through `renderFile(data)`.

- [ ] **Step 3: Implement the dedicated renderer**

Add `renderGitDiff(data)` that:

- uses `data.data` on success;
- uses `data.error` on failure;
- displays path, staged state, additions, deletions, changed state, and optional diff preview;
- renders the fixed public error message/code for failures.

Change only the dispatch branch:

```js
} else if (tool === "git_diff") {
  root.innerHTML = renderGitDiff(data);
} else if (tool === "write" || tool === "edit" || tool === "apply_patch" || tool === "export_pro_context") {
  root.innerHTML = renderFile(data);
}
```

- [ ] **Step 4: Update smoke and stress field access**

Change direct `git_diff` assertions from:

```js
statsOnlyDiff.structuredContent.include_diff
```

to:

```js
statsOnlyDiff.structuredContent.data.include_diff
```

Apply the same nesting to `diff`, `additions`, `deletions`, and `changed`. Do not change `show_changes` assertions.

- [ ] **Step 5: Run focused and integration gates**

Run:

```bash
node --test test/git-diff-contract.test.mjs
npm run smoke
npm run stress
```

Expected: all PASS.

- [ ] **Step 6: Commit compatibility updates**

```bash
git add src/toolCardWidget.ts scripts/smoke.mjs scripts/stress.mjs test/git-diff-contract.test.mjs
git commit -m "test(schema): cover git_diff compatibility"
```

---

### Task 4: Record, clean, and verify the completed slice

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- Modify: `docs/memory/archive/phase-1.md`
- Modify: `Memory.md`
- Modify: `docs/superpowers/plans/2026-07-12-git-diff-output-schema.md`

**Interfaces:**
- No runtime interface changes.

- [ ] **Step 1: Record the slice**

Document that `git_diff` now has:

- exact advertised schema-v1 output;
- strict success invariants;
- stable redacted errors;
- preserved `path`, `staged`, and `include_diff` semantics;
- dedicated direct renderer;
- no change to `show_changes` or `src/gitOps.ts`.

Update `Memory.md` as the concise current-state index and append detailed implementation/verification history to `docs/memory/archive/phase-1.md`.

- [ ] **Step 2: Mark plan checkboxes complete**

Change every executed `- [ ]` in this plan to `- [x]` only after its command/result has been observed.

- [ ] **Step 3: Run the neat-freak skill**

Use the skill to inspect only files changed by this slice. Apply safe, behavior-preserving cleanup; do not broaden scope.

- [ ] **Step 4: Run final verification**

Run each command separately:

```bash
npm run build
node --test test/git-diff-contract.test.mjs test/git-status-contract.test.mjs
npm test
npm run smoke
npm run stress
git diff --check
```

Expected: all commands PASS with zero diff-check errors.

- [ ] **Step 5: Review the final diff**

Use `show_changes` and verify:

- only approved files changed;
- no token or secret is present;
- `src/gitOps.ts` and `show_changes` remain unchanged;
- no unrelated formatting churn exists.

- [ ] **Step 6: Commit implementation records**

```bash
git add CHANGELOG.md docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md docs/memory/archive/phase-1.md Memory.md docs/superpowers/plans/2026-07-12-git-diff-output-schema.md
git commit -m "docs(schema): record git_diff slice"
```

- [ ] **Step 7: Push and verify remote state**

```bash
git push origin main
```

Confirm local `main` and `origin/main` point to the same commit and the working tree is clean.

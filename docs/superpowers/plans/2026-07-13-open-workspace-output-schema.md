# `open_workspace` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only direct `open_workspace` to the Phase 1 schema-v1 envelope with exact output schema, deterministic alias handling, stable redacted failures, strict provider validation, and migrated consumers.

**Architecture:** Add a tool-owned schema module and focused contract suite first. Then migrate the `src/server.ts` handler through a dedicated provider boundary and two-stage error classification. Finally update the shared workspace Tool Card plus only the direct `open_workspace` Smoke/HTTP Smoke/Stress consumers, run all local gates, reconcile documentation and Memory, and stop before staging or publication.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, existing `WorkspaceManager`, `PathGuard`, `workspaceSummary`, Tool Card HTML, Smoke/HTTP Smoke/Stress suites, native Windows and Ubuntu CI.

**Status:** Published and cross-platform CI-validated. Implementation commit `c31e8a1` passed exact-head CI run `29253838423` on Ubuntu/Windows with Node 20/24. Focused 18/18, adjacent 66/66, complete 220/220, Build, all eight Smoke sections, Stress, package dry-run, and diff checking pass.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- Migrate one direct tool only: `open_workspace`.
- Do not change `open_current_workspace`, `list_workspaces`, `workspace_snapshot`, workspace identity, ownership, expiry, close behavior, persistence, allowed roots, path policy, authentication, dependencies, or Phase 2.
- Keep deterministic workspace IDs and canonical-root reuse.
- Preserve minimal, standard, and full tool registration.
- Preserve current input names, limits, defaults, and deprecated non-mutating `bootstrap_context` acceptance.
- Correct only blank alias shadowing: trim `root`/`path`, treat blanks as absent, accept equal effective aliases, and reject differing effective aliases.
- Use exactly twelve success fields under `data` and exactly seven fixed non-retryable failures.
- Never expose raw roots, allowed-root lists, exceptions, stacks, secrets, or provider diagnostics in structured failures.
- Keep schema ownership in `src/tools/schemas/common.ts` plus one exact `openWorkspace.ts` module; do not refactor the published `openCurrentWorkspace.ts` module.
- Use test-only dependency injection; no hidden MCP argument, environment switch, production test mode, or global mutable override.
- Follow TDD: RED evidence before production implementation and focused GREEN after each task.
- Do not stage, commit, push, rewrite history, modify credentials, or expand access without a separate approval.

---

## File Map

- Create `src/tools/schemas/openWorkspace.ts`: exact public data/error/envelope schemas and pure result constructors.
- Create `test/open-workspace-contract.test.mjs`: constructor, schema, registration, handler, alias, failure, provider, Tool Card, and wrapper contracts.
- Modify `src/server.ts`: imports, provider schema/types, alias resolver, stage-aware classifiers, dependency injection, registration output schema, and direct handler.
- Modify `src/toolCardWidget.ts`: nested direct-open unwrapping with historical flat fallback.
- Modify `scripts/smoke-platform-compat.mjs`: migrate the protected main-Smoke `open_current_workspace` and `open_workspace` workspace-ID reads in memory with exact-count guards.
- Modify `scripts/http-smoke-compat.mjs`: apply the three protected direct `open_workspace` consumer migrations in memory with exact fail-closed substitutions.
- Modify `scripts/stress.mjs` only when a targeted search confirms a flat direct-open consumer.
- Modify `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, `docs/memory/archive/phase-1-part-3.md`, this plan, and the approved design only for final implementation status/evidence.

---

### Task 1: Exact `open_workspace` schema and RED contracts

**Files:**
- Create: `src/tools/schemas/openWorkspace.ts`
- Create: `test/open-workspace-contract.test.mjs`
- Reference: `src/tools/schemas/common.ts`
- Reference: `src/tools/schemas/openCurrentWorkspace.ts`
- Reference: `test/open-current-workspace-contract.test.mjs`

**Interfaces:**
- Produces `OPEN_WORKSPACE_ERROR_MESSAGES`.
- Produces `openWorkspaceDataSchema`, `openWorkspaceOutputShape`, and `openWorkspaceOutputSchema`.
- Produces `createOpenWorkspaceSuccess(data, durationMs?)` and `createOpenWorkspaceFailure(failure, durationMs?)`.
- Produces `OpenWorkspaceFailureInput` and inferred public result/data types.

- [x] **Step 1: Write constructor and schema tests before the module exists**

Add imports expected from `../dist/tools/schemas/openWorkspace.js` and define a strict twelve-field success fixture:

```js
function successData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\project",
    agents_loaded: true,
    agents_path: "AGENTS.md",
    skills: ["workspace-skill"],
    skill_inventory: [{
      name: "workspace-skill",
      description: null,
      source: "workspace",
      path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
    }],
    skill_counts: { total: 1, workspace: 1, user: 0, plugin: 0, other: 0 },
    tree: ".\n└── package.json",
    git_status: "## main",
    bash_mode: "full",
    write_mode: "workspace",
    tool_mode: "standard",
    ...overrides
  };
}
```

Assert the success constructor emits exactly:

```js
{
  codexgpt_tool: "open_workspace",
  codexgpt_title: "Open Workspace",
  ok: true,
  data: successData(),
  error: null,
  meta: { schemaVersion: 1, durationMs: 7, warnings: [] }
}
```

Add table-driven failure tests for:

```js
[
  ["ROOT_ALIAS_CONFLICT", { fields: ["root", "path"] }],
  ["ROOT_PATH_INVALID", { source: "root" }],
  ["ROOT_NOT_FOUND", { source: "path" }],
  ["ROOT_NOT_DIRECTORY", { source: "root" }],
  ["ROOT_NOT_ALLOWED", { source: "configured_default_root" }],
  ["WORKSPACE_OPEN_FAILED", { source: "root" }],
  ["INTERNAL_ERROR", {}]
]
```

Assert exact fixed messages, `retryable: false`, and strict details.

- [x] **Step 2: Add strict rejection tests**

Cover:

```js
openWorkspaceOutputSchema.parse({ ...success, workspace_id: "legacy-flat" });
openWorkspaceOutputSchema.parse({ ...success, extra: true });
openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, agents_path: undefined } });
openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, tree: undefined } });
openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, skill_counts: { ...success.data.skill_counts, extra: 1 } } });
openWorkspaceOutputSchema.parse({ ...success, ok: false });
openWorkspaceOutputSchema.parse({ ...failure, data: successData() });
```

Also reject wrong tool identity/title, negative/non-integer counts, empty IDs/roots/status, unknown skill fields, wrong source enum, wrong error details, and non-empty warnings that were not explicitly supplied through the constructor.

- [x] **Step 3: Run RED verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs
```

Expected: build or focused test fails because `openWorkspace.ts` and its exports do not exist.

- [x] **Step 4: Implement the exact schema module**

Create `src/tools/schemas/openWorkspace.ts` with strict Zod objects. The public messages must be exactly:

```ts
export const OPEN_WORKSPACE_ERROR_MESSAGES = {
  ROOT_ALIAS_CONFLICT: "The root and path arguments identify different workspace roots.",
  ROOT_PATH_INVALID: "The requested workspace root is not a valid local workspace path.",
  ROOT_NOT_FOUND: "The requested workspace root does not exist.",
  ROOT_NOT_DIRECTORY: "The requested workspace root is not a directory.",
  ROOT_NOT_ALLOWED: "The requested workspace root is outside the allowed roots.",
  WORKSPACE_OPEN_FAILED: "The requested workspace could not be opened.",
  INTERNAL_ERROR: "The workspace summary failed because of an internal error."
} as const;
```

Use exact detail schemas:

```ts
const aliasConflictDetailsSchema = z.object({
  fields: z.tuple([z.literal("root"), z.literal("path")])
}).strict();

const rootSourceDetailsSchema = z.object({
  source: z.enum(["root", "path", "configured_default_root"])
}).strict();

const emptyDetailsSchema = z.object({}).strict();
```

Define the same twelve data fields and nullable normalization as the approved design. Add strict envelope consistency through `superRefine`, matching the established Phase 1 constructor pattern.

- [x] **Step 5: Run focused schema GREEN verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs
```

Expected: constructor/schema subset passes; handler/registration tests may remain RED until Task 2.

---

### Task 2: Migrate the direct handler with deterministic aliases and stage-aware failures

**Files:**
- Modify: `src/server.ts`
- Expand: `test/open-workspace-contract.test.mjs`

**Interfaces:**
- Consumes Task 1 schema exports.
- Produces `OpenWorkspaceSummaryProviderContext`.
- Extends `CodexGPTServerDependencies.openWorkspaceSummaryProvider`.
- Produces nested schema-v1 success/failure results for direct `open_workspace`.

- [x] **Step 1: Add failing descriptor and handler tests**

Create in-memory MCP helpers following `open-current-workspace-contract.test.mjs`. Assert `open_workspace` is registered in `minimal`, `standard`, and `full`, and each descriptor advertises `outputSchema`.

Inject a deterministic provider:

```js
openWorkspaceSummaryProvider: async (context) => ({
  text: "# Workspace",
  workspaceId: context.workspace.id,
  root: context.workspace.root,
  agentsLoaded: false,
  skills: [],
  skillInventory: [],
  skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
  tree: context.options.includeTree ? ".\n└── package.json" : undefined,
  gitStatus: "## main"
})
```

Assert default options passed to the provider are:

```js
{
  includeTree: true,
  maxDepth: 3,
  maxEntries: 500,
  includeSkills: false,
  includeGlobalSkills: false
}
```

Assert output has twelve nested fields and no legacy flat fields.

- [x] **Step 2: Add failing alias-resolution tests**

Use temporary allowed roots and assert:

```js
{ root: `  ${root}  `, include_tree: false }       // succeeds
{ path: `  ${root}  `, include_tree: false }       // succeeds
{ root: ` ${root} `, path: root }                  // succeeds
{ root: "   ", path: root }                       // succeeds using path
{ root: "   ", path: "   " }                    // uses default root
{ root, path: otherRoot }                          // ROOT_ALIAS_CONFLICT
```

For conflict, assert details exactly `{ fields: ["root", "path"] }` and verify neither root string appears anywhere in the serialized result.

- [x] **Step 3: Add failing root-stage error tests**

Cover:

- missing selected root -> `ROOT_NOT_FOUND`;
- selected file -> `ROOT_NOT_DIRECTORY`;
- existing directory outside allowed roots -> `ROOT_NOT_ALLOWED`;
- Windows invalid path form or injected path-policy error -> `ROOT_PATH_INVALID`;
- injected/controlled `EACCES`, `EPERM`, or `EBUSY` from the open stage -> `WORKSPACE_OPEN_FAILED`;
- no raw requested root, allowed-root list, error text, or stack in any structured result.

Where the existing manager is difficult to force into an OS error deterministically, introduce a narrowly scoped injectable root opener only if required by RED evidence:

```ts
openWorkspaceProvider?: (root?: string) => Workspace;
```

Prefer the existing manager directly when temporary filesystem fixtures can exercise the path safely. Do not add this dependency speculatively.

- [x] **Step 4: Add failing provider-validation tests**

Assert `INTERNAL_ERROR` for:

- mismatched provider `workspaceId`;
- mismatched provider `root`;
- inconsistent `agentsLoaded` / `agentsPath`;
- unsafe or non-normalized AGENTS path;
- skill-name mismatch;
- count mismatch;
- tree returned when disabled;
- tree omitted when enabled;
- skills returned when discovery disabled;
- provider-time thrown `ENOENT`;
- malformed extra provider fields.

Assert a non-Git directory still succeeds and reopening the same canonical root returns the same workspace ID.

- [x] **Step 5: Run handler RED verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs
```

Expected: descriptor/handler tests fail because direct `open_workspace` still has no output schema, flat output, and legacy error behavior.

- [x] **Step 6: Add imports and private provider schema/types**

In `src/server.ts`, import Task 1 exports and define a tool-local provider parser equivalent in strictness to the published `open_current_workspace` parser, but keep independent names:

```ts
type OpenWorkspaceSummaryOptions = {
  includeTree: boolean;
  maxDepth: number;
  maxEntries: number;
  includeSkills: boolean;
  includeGlobalSkills: boolean;
};

export interface OpenWorkspaceSummaryProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: OpenWorkspaceSummaryOptions;
}
```

Add:

```ts
openWorkspaceSummaryProvider?: (
  context: OpenWorkspaceSummaryProviderContext
) => WorkspaceSummary | Promise<WorkspaceSummary>;
```

The production provider calls `workspaceSummary` with `bootstrapContext: false`.

- [x] **Step 7: Implement deterministic alias resolution**

Add a small pure resolver near the workspace-specific helpers:

```ts
type OpenWorkspaceRootSource = "root" | "path" | "configured_default_root";

type OpenWorkspaceRootSelection = {
  requestedRoot?: string;
  source: OpenWorkspaceRootSource;
};

function resolveOpenWorkspaceRoot(args: Record<string, unknown>): OpenWorkspaceRootSelection {
  const root = typeof args.root === "string" ? args.root.trim() : "";
  const alias = typeof args.path === "string" ? args.path.trim() : "";
  if (root && alias && root !== alias) {
    throw new OpenWorkspaceAliasConflictError();
  }
  if (root) return { requestedRoot: root, source: "root" };
  if (alias) return { requestedRoot: alias, source: "path" };
  return { source: "configured_default_root" };
}
```

Use a local typed `OpenWorkspaceAliasConflictError` so the conflict does not depend on message-prefix parsing.

- [x] **Step 8: Implement stage-aware classification**

Create a root-stage classifier that receives the already determined source. Map safe-path prefixes to `ROOT_PATH_INVALID`, manager prefixes and root-stage Node codes to the approved root failures, and never return raw details.

Do not pass summary/provider exceptions through this classifier. The handler structure must be equivalent to:

```ts
const startedAt = Date.now();
let workspace;
let source;
try {
  const selection = resolveOpenWorkspaceRoot(args);
  source = selection.source;
  workspace = workspaces.openWorkspace(selection.requestedRoot);
} catch (error) {
  return openWorkspaceFailureResult(classifyOpenWorkspaceRootFailure(error, source), startedAt);
}

try {
  // provider, validation, data schema, success
} catch {
  return openWorkspaceFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
}
```

A provider-time `ENOENT` must therefore remain `INTERNAL_ERROR`.

- [x] **Step 9: Implement strict provider validation and exact result construction**

Parse the provider result, validate workspace/root identity, AGENTS path normalization, skills/counts, requested inclusions, and normalize nullable descriptions. Build data only through `openWorkspaceDataSchema.parse` and return through `createOpenWorkspaceSuccess`.

Add `outputSchema: openWorkspaceOutputShape` to registration. Every caught failure returns fixed text plus `createOpenWorkspaceFailure(...)` and `isError: true`.

- [x] **Step 10: Run focused handler GREEN verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs
```

Expected: all direct schema, descriptor, alias, root-stage, provider-stage, non-Git, and reuse tests pass.

---

### Task 3: Migrate Tool Card, supertool, and real consumers

**Files:**
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke-platform-compat.mjs`
- Modify: `scripts/http-smoke-compat.mjs`
- Modify: `scripts/stress.mjs` only if confirmed by search
- Expand: `test/open-workspace-contract.test.mjs`

**Interfaces:**
- Consumes Task 2 nested direct result.
- Preserves historical flat `open_workspace` Tool Card fallback.
- Preserves `codexgpt` direct action wrapper semantics.

- [x] **Step 1: Add failing Tool Card and supertool tests**

Assert the generated Tool Card source unwraps both migrated direct tools:

```js
assert.match(toolCardWidgetHtml, /open_current_workspace/);
assert.match(toolCardWidgetHtml, /open_workspace/);
assert.match(toolCardWidgetHtml, /data\?\.data/);
```

Test a direct `codexgpt` call with action `open_workspace` and verify:

```js
structured.codexgpt_tool === "open_workspace";
structured.codexgpt_super_action === "open_workspace";
structured.wrapped_tool === "open_workspace";
structured.data.workspace_id === expectedWorkspaceId;
!("workspace_id" in structured);
```

Add the equivalent wrapped failure assertion for `ROOT_ALIAS_CONFLICT`.

- [x] **Step 2: Run focused consumer RED verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs
```

Expected: Tool Card or wrapper/consumer assertions fail while the renderer and smoke consumers still assume flat direct data.

- [x] **Step 3: Update Tool Card unwrapping**

Replace the direct-open helper with nested-first, flat-fallback logic for both tools:

```js
function workspaceResultData(result) {
  const isDirectOpen =
    result?.codexgpt_tool === "open_current_workspace" ||
    result?.codexgpt_tool === "open_workspace";
  return isDirectOpen && result?.data && typeof result.data === "object"
    ? result.data
    : (result ?? {});
}
```

Do not alter `workspace_snapshot` or other unmigrated workspace result shapes.

- [x] **Step 4: Update protected main-Smoke consumers through the platform entry**

In `scripts/smoke-platform-compat.mjs`, read the protected source and migrate workspace-ID consumers before data-URL execution:

- replace four `cardOpened.structuredContent.workspace_id` reads with nested `data?.workspace_id`;
- replace one `opened.structuredContent.workspace_id` read with nested `data?.workspace_id`;
- replace two `openedByPath.structuredContent.workspace_id` reads with nested `data?.workspace_id`;
- require exact counts of `4`, `1`, and `2` so source drift fails explicitly;
- preserve the existing Windows `BASH_ENV`, `TEMP`, and `TMP` compatibility setup and cleanup;
- keep the protected source unchanged and write no transformed copy to disk.

- [x] **Step 5: Update protected HTTP Smoke consumers through the compatibility entry**

In `scripts/http-smoke-compat.mjs`, read the protected source and apply five exact fail-closed substitutions before data-URL execution:

- resolve the two package imports to absolute file URLs;
- move the default-skill check to `data.skill_inventory`;
- move the requested-skill check to `data.skill_inventory`;
- move the default-root comparison to `data.workspace_id`;
- require every old source string to occur exactly once;
- keep the protected source unchanged and write no transformed copy to disk.

- [x] **Step 6: Search and update any Stress consumer only when present**

Run a targeted source search for `open_workspace` plus flat structured fields. If `scripts/stress.mjs` reads direct flat fields, migrate those exact reads. If it only invokes the tool or consumes other tools, leave it unchanged and record that fact.

- [x] **Step 7: Run focused and real consumer GREEN verification**

Run:

```text
npm run build
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs
npm run smoke
```

Expected: all focused/adjacent tests pass and all eight Smoke sections pass.

---

### Task 4: Complete regression, documentation, Memory, and reconciliation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-open-workspace-output-schema.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-3.md`
- Review: every implementation file from Tasks 1–3

**Interfaces:**
- Produces the locally complete thirteenth slice and exact verification evidence.
- Stops before staging, commit, push, or CI publication.

- [x] **Step 1: Run adjacent contracts**

Run:

```text
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
```

Expected: all tests pass with no skipped contract caused by the migration.

- [x] **Step 2: Run complete Node regression**

Run:

```text
node --test test/*.test.mjs
```

Expected: all tests pass. Record exact passed/failed/skipped counts.

- [x] **Step 3: Run build, Smoke, and native-Windows Stress**

Run separately:

```text
npm run build
npm run smoke
npm run stress
```

Expected: build passes; all eight Smoke sections pass; Stress passes including its internal build, subject only to already documented platform fixtures.

- [x] **Step 4: Run focused whitespace and scope checks**

Run:

```text
git diff --check
```

Then use `show_changes(include_diff=true)` to confirm only intended files changed and no secret-looking values, raw private roots in failure fixtures, dependency changes, credential changes, or Phase 2 behavior were introduced.

- [x] **Step 5: Update user-facing and project records**

Add a concise changelog entry stating:

- direct `open_workspace` now has exact schema-v1 success/failure output;
- result data moved under `data`;
- blank alias shadowing was corrected;
- seven stable redacted failures were added;
- no workspace lifecycle or permission behavior changed.

Update design and plan status to “locally implemented and verified; publication pending.”

Append the next complete STEP to `docs/memory/archive/phase-1-part-3.md` with files, implementation, exact commands/results, decisions, limitations, rollback, and next step. Update `Memory.md` while keeping it within 150 lines / 18 KB when practical. Update `AGENTS.md` documentation map and stopping point.

- [x] **Step 6: Run `neat-freak` reconciliation**

Load and apply the `neat-freak` skill to the complete working diff. Limit cleanup to the current slice and prior uncommitted CI documentation reconciliation. Do not broaden formatting or refactor unrelated code.

- [x] **Step 7: Re-run final gates after reconciliation**

At minimum rerun:

```text
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Expected: all previously passing gates remain green.

- [x] **Step 8: Stop at the approval boundary**

Use `show_changes(include_diff=false)` and report:

- files changed;
- exact focused/adjacent/complete test counts;
- Build/Smoke/Stress/diff-check results;
- known limitations;
- current unstaged state.

Do not stage, commit, push, or query exact-head CI until separately authorized.

---

## Plan Self-Review

- Spec coverage: every approved design section maps to Tasks 1–4.
- Scope: one direct tool only; shared schema extraction and Phase 2 remain excluded.
- Type consistency: `OpenWorkspaceSummaryOptions`, `OpenWorkspaceSummaryProviderContext`, `openWorkspaceSummaryProvider`, schema exports, and seven error names are consistent across tasks.
- Placeholder scan: no `TBD`, `TODO`, “similar to,” or unspecified implementation step remains.
- Execution mode: the user authorized inline autonomous execution, so use `executing-plans` with TDD and verification skills; do not pause between non-destructive tasks unless a genuine blocker requires a design change.

## Current Stopping Point

Inline execution, publication review, publication, and exact-head cross-platform CI are complete. Implementation commit `c31e8a1` passed CI run `29253838423` on Ubuntu/Windows with Node 20/24. Review fixed bounded data-URL stack labels and global-Skill request-scope validation; no Critical or Important findings remain. Final evidence is focused 18/18, adjacent 66/66, complete 220/220, Build, all eight Smoke sections, native-Windows Stress, package dry-run, and diff checking. The next action is design review for the next remaining Phase 1 direct tool; Phase 2 remains closed.
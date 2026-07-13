# `open_current_workspace` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Migrate only direct `open_current_workspace` to the strict Phase 1 schema-v1 envelope while preserving the existing configured-default-workspace startup workflow.

**Architecture:** Add a tool-specific schema module and an injectable summary-provider boundary around the existing `workspaceSummary`. The handler opens the existing deterministic default workspace, validates provider identity, AGENTS path, skill inventory/counts and request-controlled inclusion, then emits exact nested data or one of five fixed public failures. The shared workspace Tool Card keeps a compatibility path for unmigrated flat `open_workspace` and `workspace_snapshot` results.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, existing `WorkspaceManager`, `PathGuard`, `workspaceSummary`, Tool Card HTML, Smoke/HTTP Smoke/Stress suites, native Windows and Ubuntu CI.

**Status:** Published as commit `d887849` on `origin/main`; exact-head CI verification is pending because GitHub Actions is inaccessible from the current environment.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- Migrate only direct `open_current_workspace`; do not migrate `open_workspace`, `workspace_snapshot`, `list_workspaces`, or workspace lifecycle.
- Preserve the current deterministic `workspace_id`, configured default root, AGENTS discovery, optional tree, optional skill discovery, Git status, recent-commit human text, modes and tool registration.
- Preserve exactly twelve public success fields only under nested `data`: `workspace_id`, `root`, `agents_loaded`, `agents_path`, `skills`, `skill_inventory`, `skill_counts`, `tree`, `git_status`, `bash_mode`, `write_mode`, and `tool_mode`.
- Normalize absent `agents_path`, `tree`, and skill `description` to `null`.
- Keep recent commits in human MCP `content` only; do not add structured Git-log fields.
- Use exactly five non-retryable public failures: `DEFAULT_ROOT_NOT_FOUND`, `DEFAULT_ROOT_NOT_DIRECTORY`, `ROOT_NOT_ALLOWED`, `WORKSPACE_OPEN_FAILED`, and `INTERNAL_ERROR`.
- Non-Git directories remain successful workspaces with bounded Git diagnostic text.
- Never expose configured absolute roots, allowed-root lists, raw filesystem/Git/provider diagnostics, stack traces, exception names, or secret-looking values in public failures.
- Do not modify `WorkspaceManager`, `workspaceSummary`, skill discovery, Git commands, path policy, authentication, dependencies, package manifests, profiles, or Phase 2 behavior.
- Do not introduce production test modes, hidden MCP arguments, environment switches, or global mutable provider overrides.
- Follow TDD: every production behavior change must be preceded by a focused failing test.
- Conditional commit commands are documentation checkpoints only; do not execute them without explicit publication approval.

---

## File Structure

- Create `src/tools/schemas/openCurrentWorkspace.ts`: strict data, skill inventory, count object, five-error union, envelope and pure constructors.
- Create `test/open-current-workspace-contract.test.mjs`: schema, handler, provider-validation, failure, Tool Card and wrapper contracts.
- Modify `src/server.ts`: schema imports, provider context/dependency, provider-result schema, failure classifier, strict direct handler and descriptor.
- Modify `src/toolCardWidget.ts`: normalize nested migrated `open_current_workspace` and retain flat compatibility for `open_workspace`/`workspace_snapshot`.
- Modify `scripts/smoke.mjs`, `scripts/http-smoke.mjs`, and `scripts/stress.mjs`: move only direct/wrapped `open_current_workspace` structured reads under `data`.
- Modify `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, the design, this plan, and `docs/memory/archive/phase-1-part-2.md` after verification.

---

### Task 1: Define and prove the strict schema contract

**Files:**
- Create: `test/open-current-workspace-contract.test.mjs`
- Create: `src/tools/schemas/openCurrentWorkspace.ts`

**Interfaces:**
- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES`, `openCurrentWorkspaceDataSchema`, `openCurrentWorkspaceOutputShape`, `openCurrentWorkspaceOutputSchema`, `createOpenCurrentWorkspaceSuccess`, `createOpenCurrentWorkspaceFailure`, `OpenCurrentWorkspaceData`, `OpenCurrentWorkspaceFailureInput`, and `OpenCurrentWorkspaceStructuredResult`.

- [x] **Step 1: Write failing constructor and strictness tests**

Create a focused test with fixtures containing all twelve success fields and skill records with explicit nullable descriptions. Assert exact top-level keys, exact data keys, strict skill/count objects, mode enums, nullable fields, envelope consistency, and all five fixed failures.

Use these exact public messages:

```ts
export const OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES = {
  DEFAULT_ROOT_NOT_FOUND: "The configured default workspace root does not exist.",
  DEFAULT_ROOT_NOT_DIRECTORY: "The configured default workspace root is not a directory.",
  ROOT_NOT_ALLOWED: "The configured default workspace root is outside the allowed roots.",
  WORKSPACE_OPEN_FAILED: "The configured default workspace could not be opened.",
  INTERNAL_ERROR: "The current workspace summary failed because of an internal error."
} as const;
```

The first four detail objects are exactly `{ source: "configured_default_root" }`; `INTERNAL_ERROR` details are exactly `{}`.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```text
node --test test/open-current-workspace-contract.test.mjs
```

Expected: FAIL because `src/tools/schemas/openCurrentWorkspace.ts` does not exist. No production source may be added before this failure is observed.

- [x] **Step 3: Implement the schema module minimally**

Define strict schemas equivalent to:

```ts
export const openCurrentWorkspaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

export const openCurrentWorkspaceSkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

export const openCurrentWorkspaceDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  agents_loaded: z.boolean(),
  agents_path: z.string().min(1).nullable(),
  skills: z.array(z.string().min(1)),
  skill_inventory: z.array(openCurrentWorkspaceSkillSchema),
  skill_counts: openCurrentWorkspaceSkillCountsSchema,
  tree: z.string().min(1).nullable(),
  git_status: z.string().min(1),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"])
}).strict();
```

Use a strict discriminated error union and a strict envelope with the same `ok/data/error` consistency refinement as existing Phase 1 tools.

- [x] **Step 4: Run the focused schema tests and confirm GREEN**

Run the same focused command. Expected: constructor/strictness tests pass while later handler tests may still fail because integration is not implemented.

- [x] **Step 5: Conditional checkpoint**

Do not stage or commit. Record Task 1 RED/GREEN evidence in the active Phase 1 archive after the full slice is verified.

---

### Task 2: Migrate the direct handler with provider validation and stable failures

**Files:**
- Modify: `test/open-current-workspace-contract.test.mjs`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: Task 1 schema exports plus existing `WorkspaceSummary` and `SkillInventoryItem` types.
- Produces:

```ts
export interface OpenCurrentWorkspaceSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: {
    includeTree: boolean;
    maxDepth: number;
    includeSkills: boolean;
    includeGlobalSkills: boolean;
  };
}
```

and optional dependency:

```ts
openCurrentWorkspaceSummaryProvider?: (
  context: OpenCurrentWorkspaceSummaryProviderContext
) => WorkspaceSummary | Promise<WorkspaceSummary>;
```

- [x] **Step 1: Add failing handler tests**

Add in-memory MCP tests proving:

- the descriptor advertises an output schema in minimal, standard, and full modes;
- a valid provider returns all twelve fields under `data` and no flat legacy fields;
- `include_tree=false` requires `tree:null`; `include_tree=true` requires non-empty tree text;
- `include_skills=false` requires empty names/inventory and zero counts;
- missing descriptions normalize to `null`;
- provider workspace/root mismatch, AGENTS loaded/path mismatch, unsafe/non-normalized AGENTS paths, skill-name/order/count mismatch, malformed data and request-inclusion mismatch return fixed `INTERNAL_ERROR`;
- post-start root disappearance, file root, outside-allowed root and access/open failures map to fixed failures without exposing paths;
- non-Git directories remain `ok:true`;
- success human text preserves recent commits/tree behavior and failures contain only fixed code/message.

Use deterministic dependency injection for summary behavior. Use temporary real paths to avoid Windows long/8.3 path mismatches.

- [x] **Step 2: Run focused tests and confirm RED**

Run:

```text
node --test test/open-current-workspace-contract.test.mjs
```

Expected: FAIL because direct `open_current_workspace` still has no descriptor schema, provider dependency, nested envelope or stable classifier.

- [x] **Step 3: Add imports, provider schema and dependency**

Import the new schema exports and `WorkspaceSummary`/`SkillInventoryItem` types. Add a strict internal provider-result schema with current camelCase fields only. Bind production provider to existing `workspaceSummary(context.config, context.guard, context.workspace, { ...context.options, bootstrapContext: false })`.

- [x] **Step 4: Add safe classifier**

Map current `WorkspaceManager` diagnostics and Node codes as specified. Ensure only fixed messages and strict details reach MCP output. Unclassified and provider-validation failures map to `INTERNAL_ERROR`.

- [x] **Step 5: Replace only the direct handler**

The handler must:

1. normalize request options;
2. call `workspaces.defaultWorkspace()`;
3. call and strictly parse the provider;
4. validate workspace/root identity;
5. require `agentsLoaded === Boolean(agentsPath)` and safely normalize any AGENTS path through `guard.resolve`;
6. normalize skill descriptions to `null`;
7. require names and counts to exactly match inventory;
8. require tree/skill inclusion to match request flags;
9. take mode fields from `config`;
10. return the existing provider text with `createOpenCurrentWorkspaceSuccess`;
11. classify every failure, return `createOpenCurrentWorkspaceFailure`, and set `isError:true`.

- [x] **Step 6: Run focused tests and confirm GREEN**

Run the focused command. Expected: all schema and direct handler tests pass.

- [x] **Step 7: Run adjacent contracts**

Run:

```text
node --test test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
```

Expected: all pass.

---

### Task 3: Migrate Tool Card, wrapper and real suite consumers

**Files:**
- Modify: `test/open-current-workspace-contract.test.mjs`
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/http-smoke.mjs`
- Modify: `scripts/stress.mjs`

**Interfaces:**
- Consumes: nested direct `open_current_workspace` envelope from Task 2.
- Produces: a compatibility normalizer that reads nested data only for migrated direct results and retains flat data for `open_workspace` and `workspace_snapshot`.

- [x] **Step 1: Add failing Tool Card and wrapper tests**

Assert the workspace renderer/subtitle code uses a compatibility helper equivalent to:

```js
function workspaceResultData(payload) {
  return payload?.codexpro_tool === "open_current_workspace"
    ? (payload?.data ?? {})
    : (payload ?? {});
}
```

Assert failures show only stable code/message and `codexpro` action `open` preserves nested `ok/data/error/meta` without restoring flat fields.

- [x] **Step 2: Run focused tests and confirm RED**

Run the focused command. Expected: fail because Tool Card still reads flat fields.

- [x] **Step 3: Update Tool Card compatibility path**

Use the normalizer in `subtitleFor` and `renderWorkspace`. Keep existing rendering for unmigrated workspace tools. Add a stable failure card branch for migrated direct failures.

- [x] **Step 4: Update Smoke/HTTP Smoke/Stress consumers**

Change only `open_current_workspace` direct/wrapped assertions from `structuredContent.<field>` to `structuredContent.data.<field>`. Do not alter `open_workspace` and `workspace_snapshot` flat assertions.

- [x] **Step 5: Run focused and real suites**

Run:

```text
node --test test/open-current-workspace-contract.test.mjs
npm run smoke
npm run stress
```

Expected: all pass. HTTP Smoke is exercised by the project Smoke command; if a dedicated script is available through an existing package command, retain its existing execution path rather than adding a dependency or script.

---

### Task 4: Complete verification and project records

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md`
- Modify: `docs/memory/archive/phase-1-part-2.md`

**Interfaces:**
- Consumes: verified implementation evidence from Tasks 1–3.
- Produces: exact local completion record and a clean publication stopping point.

- [x] **Step 1: Run complete fresh verification**

Run in order:

```text
node --test test/open-current-workspace-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

Read every exit code and test count. Distinguish code failure, environment blockage and platform skip.

- [x] **Step 2: Verify exact scope and secret hygiene**

Use `show_changes` and targeted search to confirm:

- only intended files changed;
- no token, private key, credential-bearing URL or raw private diagnostic was introduced;
- no flat direct `open_current_workspace` structured consumer remains;
- unmigrated `open_workspace` and `workspace_snapshot` compatibility remains.

- [x] **Step 3: Update documentation and memory**

Record exact commands, counts, failed attempts, decisions, limitations, rollback and next step. Mark the design and plan locally implemented only after all fresh gates pass. After `neat-freak` reconciliation, proceed to the separately authorized staging, commit, push, and exact-head CI verification workflow.

- [x] **Step 4: Final review**

Run `show_changes(include_diff=false)` after documentation updates and rerun `git diff --check`. Do not claim completion until the fresh evidence passes.

---

## Plan Self-Review

- Spec coverage: every success field, nullable normalization, five failures, provider validation, Tool Card compatibility, wrapper behavior, real suites, documentation and rollback have an owning task.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation instruction, or undefined interface remains.
- Type consistency: the provider context, schema export names and nested data field names match the approved design and existing server conventions.
- Scope: one direct tool only; no Phase 2, dependency, authentication or workspace lifecycle expansion.

## Execution Evidence

- Initial RED: focused test failed because `src/tools/schemas/openCurrentWorkspace.ts` did not exist.
- Schema-only GREEN/RED split: 4 constructor/strictness tests passed while 8 handler/consumer tests failed as expected.
- Handler GREEN: 11/12 focused tests passed; the remaining failure identified the flat Tool Card consumer.
- Tool Card GREEN: 12/12 focused tests passed.
- Real Smoke regression: the first Smoke run exposed one remaining flat lowercase-`agents.md` consumer; a focused regression test failed first, then passed after the nested read was applied.
- Final focused contracts: 13/13 passed.
- Adjacent contracts: 48/48 passed after final documentation reconciliation.
- Complete regression: 202/202 passed.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal Build.

## Current Stopping Point

Implementation and `neat-freak` reconciliation were published as commit `d887849` on `origin/main`. Exact-head cross-platform CI remains pending because the current environment cannot query GitHub Actions. Credential/access changes and Phase 2 remain closed.

# Direct `codexpro_inventory` Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

> **Execution status:** All six tasks and local verification gates are complete. Publication remains blocked on explicit staging/commit/push approval and exact-head CI.

**Goal:** Publish an exact, bounded, redacted schema-v1 contract for direct full-mode `codexpro_inventory` without introducing Phase 2 or Phase 6 behavior.

**Architecture:** Keep discovery in `src/capabilitiesOps.ts`, add one strict tool-owned schema module, inject the domain provider only for tests, and construct all public identity/options/counts/text inside the direct handler. Migrate only proven consumers to nested `data`; retain historical flat Tool Card fallback and leave protected Smoke sources unchanged unless exact current evidence requires a fail-closed compatibility substitution.

**Tech Stack:** TypeScript, Node.js 20/24, Zod, MCP TypeScript SDK, `node:test`, TSX runtime imports, native Windows and Ubuntu CI.

## Global Constraints

- Work in `D:\Dev\codexpro` and preserve all pre-existing user changes.
- Native Windows remains the primary platform; WSL must not become mandatory.
- Use TDD: focused test must fail for the expected missing-contract reason before production code is written.
- Direct `codexpro_inventory` remains read-only and full-mode only.
- Success uses exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta` at the top level.
- Success data has exactly the sixteen fields approved in `docs/superpowers/specs/2026-07-13-codexpro-inventory-output-schema-design.md`.
- Do not expose MCP URLs, commands, arguments, environment values, headers, tokens, credentials, or raw config paths.
- Do not introduce Skill trust, permission, version, hash, enabled state, Hook, Sandbox, OAuth, workspace lifecycle, or dependency changes.
- Do not edit protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs` unless a current exact flat consumer is proven; use an exact-count fail-closed compatibility loader if needed.
- `scripts/codexpro-entry.mjs` remains the supported public CLI entry.
- Staging, commit, push, deployment, and external-state changes require separate explicit user approval.
- After each meaningful STEP, update `Memory.md`, append the active Phase 1 archive, and enforce its 80% rollover rule.

---

### Task 1: Establish the focused RED contract

**Files:**

- Create: `test/codexpro-inventory-contract.test.mjs`
- Inspect: `src/server.ts`
- Inspect: `src/capabilitiesOps.ts`
- Inspect: `src/toolCardWidget.ts`
- Inspect: `scripts/stress.mjs`

**Interfaces:**

- Consumes: current `createCodexProServer(config, dependencies)` and MCP in-memory transport.
- Produces: an executable focused contract whose initial failures prove the schema, provider boundary, nested handler, failure classification, and consumers are absent.

- [x] **Step 1: Create common test helpers**

Use the established test shape:

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
const schemaModule = await tsImport(
  "../src/tools/schemas/codexproInventory.ts",
  import.meta.url
).catch(() => null);
```

Add `createTestConfig`, `withConfigClient`, `withTempWorkspace`, `callTool`, `resultText`, and a `sampleInventoryData` containing all sixteen approved data fields. Use `toolMode: "full"`, `bashMode: "off"`, `writeMode: "workspace"`, isolated allowed roots, and the current complete config shape.

- [x] **Step 2: Add pure schema and invariant tests**

Create tests with these exact names:

```text
codexpro_inventory schema exports exact constructors and creates empty and populated success
codexpro_inventory schema derives exact bounded warnings
codexpro_inventory schema creates all exact stable failures
codexpro_inventory schema rejects flat malformed inconsistent duplicate unsafe and additional fields
```

Assertions must cover:

```js
assert.deepEqual(Object.keys(success).sort(), [
  "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
]);
assert.deepEqual(Object.keys(success.data).sort(), [
  "bash_mode", "include_global_skills", "include_mcp_servers",
  "max_skills", "mcp_server_count", "mcp_server_limit",
  "mcp_servers", "mcp_servers_truncated", "root", "skill_count",
  "skill_counts", "skills", "skills_truncated", "tool_mode",
  "workspace_id", "write_mode"
]);
```

Reject top-level `skills`, `widget_uri`, extra fields, invalid counts, invalid warnings, unsafe absolute Skill paths, unknown MCP source labels, unsorted/duplicate items, invalid include/truncation combinations, and non-empty diagnostic error details.

- [x] **Step 3: Add descriptor, real discovery, provider, failure, card, supertool, and consumer tests**

Create separate tests for:

```text
full-mode-only descriptor advertises exact output schema
real bounded workspace discovery returns deterministic nested data and truncation
effective include flags and limits are echoed and enforced
provider success is normalized and exact
unknown workspace returns WORKSPACE_NOT_FOUND without a root leak
provider throw and rejection return INVENTORY_DISCOVERY_FAILED
malformed provider output returns INTERNAL_ERROR without diagnostics
Tool Card is nested-first handles failures and retains flat fallback
supertool preserves the nested inventory envelope
Stress consumers read nested data and protected Smoke sources remain unchanged
```

For real truncation, create three workspace Skills and call with `max_skills: 2`, globals/MCP disabled. Assert two returned items, `skills_truncated: true`, exact counts, fixed warning, `$WORKSPACE/` selectors, and no Skill body.

For provider privacy, inject values containing a private temp root and `private-diagnostic`, then assert neither appears in failure text or structured output.

- [x] **Step 4: Run the focused RED**

Run:

```powershell
node --test test/codexpro-inventory-contract.test.mjs
```

Expected: the test file executes, schema/provider/handler/consumer tests fail because `codexproInventory.ts`, the dependency boundary, exact nested handler, and nested consumers do not exist. Record exact pass/fail totals. A syntax/import harness error is not an acceptable RED; fix the test until failures are behavioral.

- [x] **Step 5: Review the RED scope**

Confirm the test does not demand:

- trust/version/hash/enabled fields;
- MCP connectivity or secret config values;
- workspace lifecycle;
- edits to protected Smoke sources;
- public `codexpro_self_test` changes.

Do not stage or commit.

---

### Task 2: Add the strict schema and constructors

**Files:**

- Create: `src/tools/schemas/codexproInventory.ts`
- Test: `test/codexpro-inventory-contract.test.mjs`

**Interfaces:**

- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `codexproInventoryOutputShape`, `codexproInventoryOutputSchema`, `codexproInventoryDataSchema`, `codexproInventoryProviderSchema`, exact constants, success/failure constructors, and public TypeScript types.

- [x] **Step 1: Define constants and exact item schemas**

Implement:

```ts
export const CODEXPRO_INVENTORY_MCP_SERVER_LIMIT = 120 as const;
export const CODEXPRO_INVENTORY_SKILLS_TRUNCATED_WARNING =
  "Skill inventory reached the requested max_skills limit.";
export const CODEXPRO_INVENTORY_MCP_SERVERS_TRUNCATED_WARNING =
  "MCP server inventory reached the fixed 120-server limit.";

export const CODEXPRO_INVENTORY_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  INVENTORY_DISCOVERY_FAILED: "The CodexPro capability inventory could not be collected.",
  INTERNAL_ERROR: "The CodexPro capability inventory failed because of an internal error."
} as const;
```

Define strict Skill, MCP, count, provider, data, error, meta, and output schemas. Skill description is `string.max(500).nullable()` publicly and optional in provider form. Enforce safe display prefixes and allowed MCP source labels.

- [x] **Step 2: Add cross-field validation**

Implement `superRefine` rules for:

```text
skill_count == skills.length == skill_counts.total
sum(source counts) == skill_count
skill_count <= max_skills
skills_truncated implies skill_count == max_skills
include_global_skills=false permits workspace source only
mcp_server_count == mcp_servers.length
mcp_server_count <= 120
mcp_servers_truncated implies count == 120
include_mcp_servers=false implies empty/zero/not-truncated
unique and deterministic Skill/MCP ordering
warning list exactly matches truncation flags
ok/data/error consistency
```

Use fixed details schemas:

```ts
type CodexProInventoryFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details: {
        source: "workspace_id" | "default_workspace";
        workspace_id: string | null;
      };
    }
  | { code: "INVENTORY_DISCOVERY_FAILED" | "INTERNAL_ERROR"; details: Record<string, never> };
```

- [x] **Step 3: Add exact constructors**

`createCodexProInventorySuccess(data, durationMs)` derives warnings from the two truncation booleans in fixed order and parses the entire result. `createCodexProInventoryFailure(failure, durationMs)` always emits empty warnings and fixed non-retryable errors.

- [x] **Step 4: Run schema-focused tests**

Run:

```powershell
node --test --test-name-pattern="schema" test/codexpro-inventory-contract.test.mjs
npm run build
```

Expected: pure schema tests pass; handler/consumer tests remain RED for their intended reasons; Build passes with the new isolated module.

Do not stage or commit.

---

### Task 3: Make domain discovery deterministic, sanitized, and truncation-aware

**Files:**

- Modify: `src/capabilitiesOps.ts`
- Test: `test/codexpro-inventory-contract.test.mjs`

**Interfaces:**

- Consumes: current fixed workspace/global Skill roots and four MCP config candidates.
- Produces:

```ts
export interface CodexProInventoryResult {
  skills: SkillInventoryItem[];
  skillsTruncated: boolean;
  mcpServers: McpServerInventoryItem[];
  mcpServersTruncated: boolean;
}
```

- [x] **Step 1: Normalize safe display metadata**

Import `createHash` and add a bounded one-line cleaner:

```ts
function cleanInventoryLabel(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
```

Make `safeReaddir` sort entries by name. Use `isSubpath` for workspace/home classification. For a path outside both display roots, return:

```ts
`$EXTERNAL/${createHash("sha256").update(absPath).digest("hex").slice(0, 12)}/SKILL.md`
```

Store the sanitized public selector on the private record so later `loadSkill` matching remains exact.

- [x] **Step 2: Detect bounded Skill truncation**

Refactor private discovery to return records plus a truncation boolean. In inventory mode, stop after the deterministic traversal has produced at most `maxSkills + 1` eligible unique records; sort the bounded set, return the first `maxSkills`, and set `skillsTruncated` when the extra record exists. Preserve the existing array-only `discoverSkillInventory` API and `loadSkill` behavior.

- [x] **Step 3: Detect bounded MCP truncation**

Export the domain limit as `120`. Deduplicate and sort names from the four fixed bounded config candidates, retain at most `121`, return `120`, and report the extra item through `mcpServersTruncated`. Preserve `discoverMcpServers(workspace): Promise<McpServerInventoryItem[]>` for existing callers by wrapping the richer private result.

- [x] **Step 4: Return the new domain result**

Change `codexproInventory` to return arrays and truncation booleans only. Remove provider-generated human text. Preserve existing arrays for `codexpro_self_test`.

- [x] **Step 5: Run domain-focused RED/GREEN**

Run:

```powershell
node --test --test-name-pattern="real bounded|effective include" test/codexpro-inventory-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs
npm run build
```

Expected: real discovery and adjacent Skill consumers pass; provider/handler/card tests remain RED until Task 4/5.

Do not stage or commit.

---

### Task 4: Implement the exact direct handler and stable failures

**Files:**

- Modify: `src/server.ts`
- Test: `test/codexpro-inventory-contract.test.mjs`

**Interfaces:**

- Consumes: `CodexProInventoryResult`, the schema exports, `WorkspaceManager`, active config, and existing `textResult` redaction.
- Produces: exact direct MCP success/failure behavior and `codexproInventoryProvider` dependency injection.

- [x] **Step 1: Import schema and domain types**

Add explicit imports for all schema constructors/constants/types and import `CodexProInventoryResult` as a type. Do not create a shared generic error refactor.

- [x] **Step 2: Add the dependency context**

Add:

```ts
export interface CodexProInventoryProviderContext {
  config: CodexProConfig;
  workspace: Workspace;
  options: {
    includeGlobalSkills: boolean;
    includeMcpServers: boolean;
    maxSkills: number;
  };
}
```

Extend `CodexProServerDependencies` with the approved provider and initialize its production default beside the other providers.

- [x] **Step 3: Add safe failure/text helpers**

Implement a bounded workspace-id helper, workspace failure classifier, fixed failure text, deterministic source-count builder, and human text builder. Text must consume validated `CodexProInventoryData`, not raw provider output.

- [x] **Step 4: Replace the direct handler in four stages**

Implement:

```text
resolve workspace
→ compute effective booleans/max
→ call provider
→ parse strict provider result
→ enforce include flags and identity-independent invariants
→ construct exact sixteen-field data
→ create success and human text
```

Add `outputSchema: codexproInventoryOutputShape` to the descriptor. Remove flat structured fields and `widget_uri`.

Catch stages exactly as the design specifies and attach `isError: true` for failures.

- [x] **Step 5: Run handler-focused tests**

Run:

```powershell
node --test --test-name-pattern="descriptor|provider|workspace|effective|supertool" test/codexpro-inventory-contract.test.mjs
npm run build
```

Expected: descriptor, direct success, request consistency, all failures, and supertool tests pass. Tool Card/Stress source assertions remain RED until Task 5.

Do not stage or commit.

---

### Task 5: Migrate Tool Card and Stress consumers

**Files:**

- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/stress.mjs`
- Test: `test/codexpro-inventory-contract.test.mjs`
- Verify unchanged: `scripts/smoke.mjs`
- Verify unchanged: `scripts/http-smoke.mjs`

**Interfaces:**

- Consumes: the new exact nested direct result.
- Produces: nested-first current rendering and historical flat compatibility.

- [x] **Step 1: Add one Tool Card normalizer**

Implement:

```js
function inventoryResultData(data) {
  const nested =
    data?.codexpro_tool === "codexpro_inventory" &&
    data?.data &&
    typeof data.data === "object";
  return nested ? data.data : (data ?? {});
}
```

Use it in `subtitleFor` and `renderInventory`. Render fixed nested failures before reading data. Add a compact limited pill/fold label when either truncation flag is true. Retain the flat fallback.

- [x] **Step 2: Migrate Stress exact reads**

Change only the four audited flat data reads to `structuredContent.data?.…`. Increase the workspace Skill fixture from `140` to `141` while retaining `max_skills: 140`, then assert `skills_truncated` is true and `stress-skill-139` remains selectable. Keep the existing `160` configured MCP names, assert `mcp_servers_truncated` is true, and retain all secret-leak assertions.

- [x] **Step 3: Prove protected sources did not need edits**

Use focused test assertions and Git diff to confirm protected main/HTTP Smoke only check `codexpro_tool` identity for inventory. Do not alter them.

- [x] **Step 4: Run focused and adjacent consumers**

Run:

```powershell
node --test test/codexpro-inventory-contract.test.mjs
node scripts/stress.mjs
node scripts/http-smoke-compat.mjs
node scripts/smoke-platform-compat.mjs
npm run build
```

Expected: focused contract fully passes; Stress, standalone HTTP Smoke compatibility, complete main Smoke compatibility, and Build pass.

Do not stage or commit.

---

### Task 6: Complete verification, review, memory, and publication gate

**Files:**

- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: active Phase 1 archive volume(s)
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Review all Slice 17 files

**Interfaces:**

- Consumes: the complete Slice 17 implementation.
- Produces: fresh local evidence, reconciled documentation, explicit rollback, and a clean approval gate for staging/commit/push.

- [x] **Step 1: Run narrow and adjacent tests**

```powershell
node --test test/codexpro-inventory-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/inspect-workspace-contract.test.mjs
```

Record exact counts.

- [x] **Step 2: Run complete code gates**

```powershell
npm run build
node scripts/analysis-smoke.mjs
node scripts/analysis-cli-smoke.mjs
node scripts/http-smoke-compat.mjs
node scripts/smoke-platform-compat.mjs
node scripts/stress.mjs
node --test test/*.test.mjs
npm pack --dry-run
```

Classify every failure as code, environment, not-run, or platform-skipped. Do not claim a gate passed without fresh output.

- [x] **Step 3: Run diff, scope, and secret gates**

```powershell
git diff --check
git status --short --branch
git diff --name-only
```

Run a targeted secret-pattern scan over only changed files. Confirm no credential value, MCP config value, private key, token, or unintended file entered the diff. Confirm protected Smoke source files are unchanged.

- [x] **Step 4: Self-review against the design**

Check every acceptance item in the design. Inspect:

- exact field counts and error messages;
- count/truncation/warning consistency;
- provider path/source validation;
- `include_*` enforcement;
- nested Tool Card and flat fallback;
- supertool shape;
- no Phase 2/6 behavior;
- no dependency or auth/profile/Cloudflare change.

Fix findings and rerun affected gates.

- [x] **Step 5: Update durable records**

Update the authoritative master plan current count to 17/28 and remaining count to 11 only after all local gates pass. Add the Slice 17 spec/plan to `AGENTS.md`, update `Memory.md`, and append exact RED/GREEN/final evidence to the active archive. If Volume 4 reaches 49,152 bytes after its completed design STEP, close it and begin Volume 5 for implementation evidence; never rewrite earlier archive entries.

- [x] **Step 6: Stop at the publication approval gate**

Do not stage, commit, push, or deploy. Present:

- changed-file list;
- exact verification results;
- risks and limitations;
- rollback;
- suggested English commit message;
- next Phase 1 Slice 18 design action (`load_skill`).

Wait for explicit publication approval.

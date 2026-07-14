# `codexpro` Supertool Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the final Phase 1 advertised tool, `codexpro`, an exact schema-v1 contract while preserving transparent child-tool semantics and every effective registration gate.

**Architecture:** Add one focused schema contract module for canonical actions, aliases, child output-schema lookup, constructors, and wrapped-child validation, plus one isolated runtime upgrader for the MCP SDK registration seam. Keep `src/server.ts` changes to one import and one post-registration upgrade call; derive `list_actions` and dispatch availability from the same live enabled direct-handler map.

**Tech Stack:** Node.js 20+, TypeScript 5.8, Zod 3.25, MCP SDK 1.17, native `node:test`, Windows-native verification with optional Git Bash backend.

## Global Constraints

- Primary platform is native Windows; WSL must not become mandatory.
- Do not add dependencies or change authentication, Cloudflare, workspace, path, write, Bash, or Codex Session policy.
- Do not add tools or aliases.
- Do not call child domain functions directly from the wrapper; invoke only the registered direct handler.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` byte-for-byte unchanged.
- Use RED before production edits for each behavior group.
- Do not stage, commit, push, publish, or run exact-head CI until the complete Slice 17–28 local batch gate passes.
- Run per-tool `neat-freak` after Slice 28 verification.

## File map

- Create `src/tools/schemas/codexpro.ts`: canonical tool/action identifiers, aliases, exact child schema map, wrapper schemas, constructors, and validation helpers.
- Create `test/codexpro-contract.test.mjs`: focused pure-schema, descriptor, routing, alias, gate, failure, Tool Card, compatibility, and source-integrity tests.
- Create `src/codexproSupertool.ts`: isolate the MCP SDK registered-tool seam, advertise the exact wrapper descriptor, derive enabled actions, validate child input/output, invoke the live registered target handler directly, and preserve child results.
- Modify `src/server.ts`: import and invoke the runtime upgrader only after all direct tools are registered.
- Modify `src/toolCardWidget.ts`: render wrapper-owned action inventory and stable wrapper failures while preserving child renderers.
- Modify `scripts/smoke-platform-compat.mjs`: exact count-locked in-memory migration of protected flat `actions` consumers.
- Create `scripts/stress-contract-compat.mjs` and modify `package.json`: migrate the protected secret-fixture Stress source in memory without weakening content protection.
- Modify `CHANGELOG.md`, `Memory.md`, `AGENTS.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, and `docs/memory/archive/phase-1-part-9.md`: reconcile Slice 28 and Phase 1 local completion.

---

### Task 1: Lock inventory and executable RED baseline

**Files:**
- Create: `test/codexpro-contract.test.mjs`
- Read: `src/server.ts`, child schema modules, current Smoke/Stress consumers

**Interfaces:**
- Consumes: `createCodexProServer(config, dependencies)` and MCP `tools/list`/`tools/call`.
- Produces: a focused failing suite whose groups map one-to-one to Tasks 2–5.

- [x] **Step 1: Add test helpers**

Create a native `node:test` file with `createTestConfig`, in-memory MCP client setup, temporary workspace cleanup, text extraction, and a schema-module import guarded with `.catch(() => null)`.

- [x] **Step 2: Add pure-contract tests**

Assert the future module exports:

```text
CODEXPRO_ACTION_ALIASES
CODEXPRO_ERROR_MESSAGES
CANONICAL_CODEXPRO_CHILD_TOOLS
codexproOutputSchema
codexproOutputShape
createCodexProListActionsSuccess
createCodexProFailure
resolveCodexProAction
wrapCodexProChildResult
```

Cover sorted/unique actions, count equality, no recursive target, fixed failure details, strict additional-field rejection, alias resolution, and malformed child rejection.

- [x] **Step 3: Add real MCP tests**

Cover exact descriptor fields, nested `list_actions`, actual registered-tool equality, canonical child success/failure, unknown/disabled/recursive action, malformed arguments, all aliases, and minimal/standard/full plus Bash/write/analysis/session gates.

- [x] **Step 4: Add consumer/source tests**

Cover Tool Card routing, protected Smoke source hashes/unchanged content, exact compatibility substitutions, and Stress source expectations.

- [x] **Step 5: Run RED**

Run:

```text
node --test test/codexpro-contract.test.mjs
```

Expected: failures caused by the missing schema module, flat `list_actions`, absent advertised output schema, legacy wrapper failures, and unmigrated consumers.

---

### Task 2: Implement the exact schema and pure wrapper helpers

**Files:**
- Create: `src/tools/schemas/codexpro.ts`
- Test: `test/codexpro-contract.test.mjs`

**Interfaces:**
- Consumes: every child module's exported `*OutputShape` and `*OutputSchema`, plus `createToolMeta`, `toolErrorSchema`, and `toolMetaSchema`.
- Produces:
  - `CanonicalCodexProChildTool`;
  - `CodexProAction`;
  - `CODEXPRO_ACTION_ALIASES`;
  - `CANONICAL_CODEXPRO_CHILD_TOOLS`;
  - `resolveCodexProAction(action)`;
  - `createCodexProListActionsSuccess(actions, durationMs)`;
  - `createCodexProFailure(failure, durationMs)`;
  - `wrapCodexProChildResult(action, wrappedTool, childStructuredContent)`;
  - `codexproOutputShape` and `codexproOutputSchema`.

- [x] **Step 1: Define canonical tools and aliases**

Use frozen literal data. Canonical tools are all Phase 1 direct tools except `codexpro`; aliases are exactly the eight approved mappings.

- [x] **Step 2: Define wrapper-owned data and error schemas**

Implement strict `list_actions` data, fixed errors, six-field envelope, and cross-field invariants.

- [x] **Step 3: Build exact wrapped-child variants**

For each canonical child, combine its exported exact output shape with:

```text
codexpro_super_action
wrapped_tool
```

Then re-parse the stripped child through the child's full output schema so every child-specific refinement remains active.

- [x] **Step 4: Implement pure constructors and normalization**

Normalize public action strings to bounded control-safe one-line values only for wrapper-owned errors. Sort and deduplicate action inventories before construction, but reject recursive and unknown canonical entries.

- [x] **Step 5: Run focused pure tests and Build**

Run:

```text
node --test --test-name-pattern="schema|constructor|alias|wrapped child" test/codexpro-contract.test.mjs
npm run build
```

Expected: pure-contract group and Build pass; MCP/consumer groups remain RED.

---

### Task 3: Migrate server registration and dispatch

**Files:**
- Create: `src/codexproSupertool.ts`
- Modify: `src/server.ts`
- Test: `test/codexpro-contract.test.mjs`

**Interfaces:**
- Consumes: Task 2 exports and the server's existing registered direct-handler/input-schema map.
- Produces: exact descriptor/runtime behavior through one isolated registered-tool upgrader that invokes the selected registered target handler directly, with focused fake-server tests for absent, disabled, corrupt, and legacy-wrapper-bypass states.

- [x] **Step 1: Add failing descriptor and runtime subset**

Run the descriptor/routing subset before source edits and confirm expected RED behavior.

- [x] **Step 2: Advertise `codexproOutputShape`**

Keep the existing input and annotations. Add the exact output shape to registration.

- [x] **Step 3: Derive `list_actions` from registered canonical handlers**

Exclude `codexpro` and any entry with `enabled=false`; sort canonical names; do not list aliases.

- [x] **Step 4: Resolve and gate canonical/alias dispatch**

Treat unknown, recursive, and disabled targets as `ACTION_NOT_AVAILABLE`. Invoke only the handler from the effective registered map.

- [x] **Step 5: Classify invalid child arguments**

Convert the direct-handler/MCP validation family into `ACTION_ARGUMENTS_INVALID` without returning raw input or diagnostics.

- [x] **Step 6: Validate and wrap child results**

Use `wrapCodexProChildResult`; preserve `content` and `isError`; map malformed child structured content to `CHILD_RESULT_INVALID`.

- [x] **Step 7: Run focused MCP tests and Build**

Run:

```text
node --test --test-name-pattern="descriptor|list_actions|canonical|alias|disabled|arguments|child result" test/codexpro-contract.test.mjs
npm run build
```

Expected: server behavior group passes; consumer/source group remains RED.

---

### Task 4: Migrate Tool Card, protected compatibility, and Stress

**Files:**
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke-platform-compat.mjs`
- Create: `scripts/stress-contract-compat.mjs`
- Modify: `package.json`
- Test: `test/codexpro-contract.test.mjs`

**Interfaces:**
- Consumes: wrapper-owned six-field envelope and transparent child result.
- Produces: bounded action/failure cards, exact protected-source substitutions, and native Stress assertions.

- [x] **Step 1: Add wrapper-owned Card renderer**

Render `data.action_count`, a bounded preview of `data.actions`, and fixed error code/message. Do not intercept child results because they retain the child's `codexpro_tool`.

- [x] **Step 2: Migrate protected main Smoke in memory**

Replace every exact flat `superActions.structuredContent.actions` access with `superActions.structuredContent.data.actions` using count-locked fail-closed substitutions. Leave protected source files unchanged.

- [x] **Step 3: Migrate native Stress**

Transform only the exact protected Stress consumers in memory to use `data.actions` and `data.action_count`, assert unknown/disabled/malformed wrapper failures by stable code, and retain all child-envelope assertions. Keep the secret-fixture source unchanged on disk.

- [x] **Step 4: Run focused consumer tests, protected Smoke, and Build**

Run:

```text
node --test test/codexpro-contract.test.mjs
npm run build
node scripts/smoke-platform-compat.mjs
node scripts/http-smoke-compat.mjs
npm run stress
```

Expected: focused suite, protected compatibility, native Stress, and Build pass.

---

### Task 5: Adversarial hardening

**Files:**
- Modify as required: `src/tools/schemas/codexpro.ts`, `src/codexproSupertool.ts`, `src/server.ts`, `test/codexpro-contract.test.mjs`

**Interfaces:**
- Consumes: complete focused implementation.
- Produces: fail-closed behavior for identity, mode, malformed-output, and leakage attacks.

- [x] **Step 1: Add deliberate RED cases**

Cover at least:

```text
alias target absent from registered map
child codexpro_tool differs from wrapped_tool
child output contains wrapper fields already
child output has extra or legacy flat fields
unsorted/duplicate/recursive list action input
control characters and very long unknown action
malformed child output containing private diagnostics
attempted action "codexpro"
legacy wrapper delegation instead of direct invocation of the registered target handler
```

- [x] **Step 2: Run RED and verify exact causes**

Run:

```text
node --test --test-name-pattern="hardening|drift|control|recursive|registered target handler" test/codexpro-contract.test.mjs
```

Expected: deliberate new tests fail for the intended missing safeguards.

- [x] **Step 3: Implement minimal fixes**

Keep fixes inside the wrapper schema/router boundary. Do not weaken child schemas or move policy into aliases.

- [x] **Step 4: Re-run focused and adjacent suites**

Run:

```text
node --test test/codexpro-contract.test.mjs
node --test test/server-config-contract.test.mjs test/codexpro-self-test-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/codex-sessions-contract.test.mjs test/read-codex-session-contract.test.mjs
npm run build
```

Expected: all pass.

---

### Task 6: Complete verification and review

**Files:**
- Review all Slice 17–28 changed files

**Interfaces:**
- Consumes: complete implementation.
- Produces: fresh local evidence for the complete unpublished batch.

- [x] **Step 1: Run complete regression**

```text
node --test test/*.test.mjs
```

- [x] **Step 2: Run Build and all eight Smoke sections**

```text
npm run build
npm run smoke
```

- [x] **Step 3: Run native-Windows Stress**

```text
npm run stress
```

- [x] **Step 4: Run package dry-run**

```text
npm pack --dry-run
```

- [x] **Step 5: Run static gates**

Run `git diff --check` through the approved verification path, scan changed files for secret-like values, confirm protected source hashes, confirm no unexpected dependency/package-lock changes, and confirm exact intended scope.

- [x] **Step 6: Review the result**

Use `show_changes` once for final review. Fix defects through a new failing regression test before changing production code.

---

### Task 7: Documentation, memory, and neat-freak reconciliation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `Memory.md`
- Modify: `AGENTS.md`
- Modify: `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Modify: `docs/memory/archive/phase-1-part-9.md`
- Modify: this plan checklist

**Interfaces:**
- Consumes: exact fresh verification counts/results.
- Produces: an accurate locally complete Phase 1 record and next action at the unified publication gate.

- [x] **Step 1: Record implementation and verification evidence**

Append one complete STEP entry to the active archive. Update the memory index in place and keep it within hard limits.

- [x] **Step 2: Mark Slice 28 and Phase 1 local implementation complete**

Do not claim publication or exact-head CI. State that Slices 17–28 remain unstaged, uncommitted, unpushed, and unpublished until the unified publication action.

- [x] **Step 3: Run `neat-freak`**

Load and follow the skill against the whole Slice 28 result. Apply only scoped reconciliations and re-run every affected gate.

- [x] **Step 4: Final verification-before-completion pass**

Re-run focused, complete, Build, Smoke, Stress, package, and static checks after any neat-freak edit.

- [x] **Step 5: Stop at the approved publication boundary**

Do not stage, commit, push, or run exact-head CI in this task. Report the exact local state and that the next authorized operation is the unified Slice 17–28 publication sequence.

## Final local evidence

- Focused `codexpro`: 13/13 pass.
- Adjacent aggregation: 87/87 pass.
- Complete regression: 456/456 pass.
- TypeScript Build: pass.
- All eight Smoke sections: pass.
- Native-Windows Stress through the exact in-memory compatibility loader: pass.
- Package dry-run: 162 files, approximately 465.3 kB packed and 2.5 MB unpacked.
- `git diff --check`: pass with only expected Windows LF-to-CRLF worktree warnings.
- Secret-shape review: only pre-existing intentional redaction patterns and test fixtures matched.
- Publication state: unstaged, uncommitted, unpushed, and unpublished.

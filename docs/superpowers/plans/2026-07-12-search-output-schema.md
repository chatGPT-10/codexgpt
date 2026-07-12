# `search` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the direct `search` MCP tool to the strict Phase 1 schema-v1 envelope while preserving lexical search behavior and safely degrading optional structured analysis.

**Architecture:** Add one exact schema module, one injectable provider seam, one direct-handler boundary, and consumer updates. Keep `src/searchOps.ts` and `src/analysis/*` algorithms unchanged; normalize provider output only at the public MCP boundary.

**Tech Stack:** TypeScript, Zod, MCP SDK, Node `node:test`, tsx.

## Global Constraints

- Native Windows remains the primary platform; WSL is not required.
- Do not modify search ranking, analysis algorithms, authentication, shell, writes, Git writes, or Phase 2.
- Preserve legacy human-readable MCP `content`.
- No production test mode or hidden MCP argument.
- Use strict tool-specific `ok/data/error/meta` envelopes.
- Do not expose raw exceptions, stack traces, unsafe paths, secrets, or provider diagnostics.
- Execute via TDD and keep every step reversible.

---

### Task 1: Contract tests and strict schema

**Files:**
- Create: `test/search-contract.test.mjs`
- Create: `src/tools/schemas/search.ts`

**Interfaces:**
- Produces: `searchOutputShape`, `searchOutputSchema`, `searchDataSchema`, `searchAnalysisSchema`, `createSearchSuccess`, `createSearchFailure`, warning constants, and `SearchFailureInput`.

- [ ] **Step 1: Write failing constructor and schema tests**

Cover exact success data, every approved error, unknown-field rejection, invalid line/backend/analysis values, envelope consistency, and fixed warning constraints.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test test/search-contract.test.mjs`

Expected: FAIL because `src/tools/schemas/search.ts` does not exist.

- [ ] **Step 3: Implement the minimal strict schema module**

Define strict lexical matches, strict structured analysis, discriminated errors, output envelope invariants, constructors, and the two fixed warning constants.

- [ ] **Step 4: Run focused constructor tests and confirm GREEN**

Run: `node --test test/search-contract.test.mjs`

Expected: schema-only tests pass; handler tests may still fail because direct `search` is not migrated.

### Task 2: Direct handler and safe degradation

**Files:**
- Modify: `src/server.ts`
- Test: `test/search-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 schema exports.
- Produces: `SearchProviderContext` and optional `searchResultProvider` dependency.

- [ ] **Step 1: Add failing direct-handler tests**

Cover advertised `outputSchema`, real success, no matches, nested fields, optional analysis success, not-requested normalization, disabled/unavailable/malformed analysis degradation, safe failures, `isError`, content, and wrapper metadata.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test test/search-contract.test.mjs`

Expected: FAIL because direct `search` still returns flat structured content and advertises no output schema.

- [ ] **Step 3: Implement the provider seam and handler boundary**

Import schema exports and search types, add `SearchProviderContext`, add `searchResultProvider`, register `outputSchema`, strictly parse lexical fields, normalize optional analysis, create fixed failures, and preserve text content.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run: `node --test test/search-contract.test.mjs`

Expected: all focused contract tests pass.

### Task 3: Tool Card and existing consumer compatibility

**Files:**
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/stress.mjs`
- Test: `test/search-contract.test.mjs`

**Interfaces:**
- Consumes: nested search envelope from Task 2.
- Produces: Tool Card and smoke/stress consumers that read only `data`.

- [ ] **Step 1: Add failing nested Tool Card and wrapper assertions**

Assert direct rendering uses `data.matches` and `data.analysis`, colon-containing paths stay intact, failures use `error`, and wrapper output has no legacy flat search fields.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test test/search-contract.test.mjs`

Expected: FAIL because the current renderer reads flat `matches`, `text`, and `analysis`.

- [ ] **Step 3: Update consumers minimally**

Render lexical hits from structured match objects, render structured groups from `data.analysis`, switch the dispatcher to nested data, and update only direct flat-field assertions in smoke/stress.

- [ ] **Step 4: Run focused and adjacent checks**

Run:
- `node --test test/search-contract.test.mjs`
- `npm run smoke`
- `npm run stress`

Expected: all pass.

### Task 4: Documentation, memory, cleanup, and complete verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`
- Review: all files changed by Tasks 1-3

**Interfaces:**
- Produces: current documentation and exact verification evidence for the seventh slice.

- [ ] **Step 1: Update project documentation and memory**

Record the strict `search` contract, fixed degradation warnings, provider seam, verification evidence, limitations, rollback, and next permitted action. Keep `Memory.md` concise and append the Phase 1 archive.

- [ ] **Step 2: Run neat-freak review**

Reconcile rules, documentation map, memory index, archive links, stale stopping-point language, and size limits. Make only minimum relevant corrections.

- [ ] **Step 3: Run complete verification**

Run:
- `node --test test/search-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`
- `npm run stress`
- `git diff --check`

Expected: zero failures; Build, Smoke, Stress, and diff check pass.

- [ ] **Step 4: Review final changes and publish**

Use `show_changes` to confirm intended scope and no secrets. Stage all intended files, commit with `feat(schema): add exact search output contract`, push `main`, and verify remote synchronization and CI when available.

## Self-review

- The plan covers every accepted design requirement.
- No search or analysis algorithm refactor is included.
- Test-first RED/GREEN checkpoints precede production changes.
- All public types and warnings have one defined owner.
- Consumer and documentation migration are explicit.
- No placeholder implementation steps remain.

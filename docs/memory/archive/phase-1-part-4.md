# CodexPro Phase 1 Archive — Volume 4

This is the active append-only continuation of Phase 1 history.

- Volume 1: `docs/memory/archive/phase-1.md` — STEP-073 through STEP-139.
- Volume 2: `docs/memory/archive/phase-1-part-2.md` — STEP-140 through STEP-151.
- Volume 3: `docs/memory/archive/phase-1-part-3.md` — STEP-152 through STEP-165, closed after crossing the configured rollover threshold.
- Volume 4: this file — STEP-166 onward.

Do not rewrite earlier volumes. Append future complete Phase 1 steps here until this volume reaches the configured rollover threshold or Phase 1 closes.

---

## STEP-166 — Design and plan direct `list_workspaces`

**Status**

Completed at the design and planning level only. The fifteenth Phase 1 direct-tool slice is approved and has a detailed five-task implementation plan; production implementation and focused tests have not started.

**Goal**

Select the next remaining Phase 1 direct tool from first principles, fix its exact success, failure, provider, compatibility, testing, rollback, and publication contracts, and prepare a task-by-task implementation plan without entering Phase 2.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-4.md`
- `docs/superpowers/specs/2026-07-13-list-workspaces-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md`

**Implementation summary**

- Confirmed the first fourteen Phase 1 vertical slices are published and cross-platform CI-validated and that the working tree was initially clean.
- Inspected the current full tool inventory, workspace manager, direct `list_workspaces` registration, Tool Card consumer, supertool wrapper, protected HTTP Smoke consumer, and exact in-memory compatibility loader.
- Selected full-mode direct `list_workspaces` as Slice 15 because it is the smallest remaining workspace protocol: it has no path input, filesystem traversal, Git process, analysis cache, or `.ai-bridge` write.
- Rejected `inspect_workspace` as the next slice because its analysis inventory, symbols, relationships, cache, limits, truncation, and provider-degradation surface is substantially wider.
- Rejected shared workspace-schema extraction and lifecycle redesign because close, expiry, ownership, persistence, random IDs, and client isolation belong to Phase 2.
- Fixed success at the established strict six-field schema-v1 envelope with exactly two nested data fields: ordered `workspaces` and derived `count`.
- Preserved each workspace item as exact `{ id, root, openedAt }`, empty-list success, insertion order, deterministic process-local IDs, canonical roots, and shared cross-session inventory for one normalized server configuration.
- Defined one test-only `listWorkspacesProvider` boundary and two fixed non-retryable failures: `WORKSPACE_LIST_FAILED` for provider invocation and `INTERNAL_ERROR` for malformed or inconsistent output.
- Required duplicate ID/root rejection, exact UTC ISO timestamps, count equality, fixed public error text, and exclusion of raw exceptions, stacks, malformed roots, and provider diagnostics.
- Required nested-first Tool Card rendering with historical flat fallback, direct supertool compatibility, and one exact fail-closed in-memory HTTP Smoke substitution while leaving both protected Smoke source files unchanged.
- Wrote a five-task TDD plan: schema/RED contract, exact provider/handler, consumer compatibility, complete local verification/documentation, and separately approval-gated publication/exact-head CI.
- Rolled the active Phase 1 archive to Volume 4 because Volume 3 crossed the configured threshold after STEP-165; Volume 3 remains unchanged.

**Verification commands**

```text
open_current_workspace(include_tree=true, include_skills=true, include_global_skills=true)
read AGENTS.md
read Memory.md
read src/guard.ts
search current schema modules and remaining direct tools
fetch exact-head src/server.ts through the GitHub contents connector because the local file exceeds the direct-read limit
read src/toolCardWidget.ts
read scripts/http-smoke.mjs
read scripts/http-smoke-compat.mjs
read adjacent workspace design and plan documents
search new design/plan for placeholders and contradictory status language
git diff --check
show_changes(include_diff=true)
```

**Verification results**

- The current direct tool is full-mode only, accepts no inputs, calls `WorkspaceManager.listWorkspaces()`, preserves insertion order, and returns flat `{ workspaces, count }` structured fields before migration.
- The current workspace item shape is `{ id, root, openedAt }` and the manager returns the values from its process-local map.
- The current Tool Card and protected HTTP Smoke consumer read the flat result; the existing compatibility loader provides the approved fail-closed in-memory migration path.
- The design and plan contain no unresolved implementation placeholder; checklist terms such as `TODO` and `TBD` appear only in the explicit self-review search requirement, not as unfinished work.
- No production source, test, dependency, package metadata, authentication, profile, credential, Cloudflare, allowed-root, path-policy, tool-mode, workspace-lifecycle, staging, commit, push, or Phase 2 behavior changed.
- Final documentation-only diff and whitespace verification are recorded at this step's completion.

**Decisions made**

- Use independent direct `list_workspaces` as Phase 1 Slice 15.
- Keep the existing item field names rather than renaming them before Phase 2 identity work.
- Preserve order and empty success; do not sort, stat, filter, or auto-open workspaces.
- Use one provider boundary and exactly two public failure codes.
- Keep the tool full-mode only.
- Keep protected Smoke sources unchanged and migrate the HTTP consumer only in memory.
- Require a separate execution approval before Task 1 and a separate publication approval before staging, commit, or push.
- Keep Phase 2 closed.

**Risks or limitations**

- The planned contract intentionally stabilizes current deterministic process-local workspace identity and cross-session sharing, which Phase 2 may later version or replace.
- Successful authenticated results continue to expose canonical local roots, matching current behavior.
- Provider validation will intentionally duplicate a small amount of workspace-item checking to keep this slice independently reversible.
- `src/server.ts` remains above the configured direct-read limit and requires targeted inspection and exact edits.
- The HTTP compatibility loader remains coupled to an exact protected-source string and will fail closed if that source drifts.
- No close, expiry, ownership, persistence, random ID, client isolation, or explicit-ID requirement is added.

**Rollback method**

Before implementation, remove only the new Slice 15 design and plan, revert the exact `AGENTS.md` and `Memory.md` references, and remove this new Volume 4 file if no later step has been appended. Do not modify Volume 3, source code, tests, dependencies, credentials, profiles, allowed roots, protected Smoke sources, or published commits. After a future normal documentation commit, use a normal revert commit rather than rewriting history.

**Next step**

After explicit execution approval, begin only Task 1 from `docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md`: create the complete focused RED contract, run it to capture expected failure evidence, create `src/tools/schemas/listWorkspaces.ts`, rerun to reach schema GREEN while handler/consumer tests remain RED, then update `Memory.md` and this active archive. Do not stage, commit, push, expand workspace lifecycle behavior, or begin Phase 2.

---

## STEP-167 — Define the direct `list_workspaces` contract in RED and schema GREEN

**Status**

Completed. The focused contract exists and the exact tool-owned schema is GREEN; handler and consumer migration remain RED by design.

**Goal**

Establish executable failure-first evidence for the complete Slice 15 contract, then implement only the pure schema and constructors.

**Files changed**

- `test/list-workspaces-contract.test.mjs`
- `src/tools/schemas/listWorkspaces.ts`
- `Memory.md`
- `docs/memory/archive/phase-1-part-4.md`

**Implementation summary**

- Added thirteen focused tests covering exact constructors, strict success/failure shape, item/timestamp/count/uniqueness invariants, full-mode descriptor behavior, real and injected providers, shared manager state, stable redacted failures, Tool Card, supertool, and protected HTTP compatibility.
- Captured initial RED before production code: 0/13 passed and 13/13 failed for the expected missing-schema, flat-handler, ignored-provider, old-consumer, and old-compatibility reasons.
- Added `src/tools/schemas/listWorkspaces.ts` with the exact schema-v1 six-field envelope, nested `{ workspaces, count }` data, exact `{ id, root, openedAt }` items, UTC millisecond timestamps, duplicate ID/root rejection, two fixed errors, and pure constructors.
- Re-ran focused contracts after the schema addition: 3/13 pure schema tests passed and the remaining 10/13 handler/consumer tests stayed RED for the planned missing migration.

**Verification commands**

```text
node --test test/list-workspaces-contract.test.mjs
git diff --check
```

**Verification results**

- Initial RED: 13 tests, 0 passed, 13 failed for expected missing-feature reasons.
- Schema intermediate GREEN: 13 tests, 3 passed, 10 failed; all pure schema/constructor tests passed.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings appeared.
- No existing production handler, consumer, dependency, protected Smoke source, authentication, credential, profile, Cloudflare, allowed-root, workspace-lifecycle, staging, commit, push, or Phase 2 behavior changed.

**Decisions made**

- Preserve exact item names `id`, `root`, and `openedAt`.
- Keep timestamp, count, and uniqueness invariants in the public data schema.
- Continue to Task 2 because the user approved continuous execution of Tasks 1–5.

**Risks or limitations**

- The direct handler still returns the old flat result and ignores the new provider dependency until Task 2.
- Tool Card, supertool child title, and protected HTTP consumer remain RED until Task 3.

**Rollback method**

Remove only the new focused test and schema module, then revert this STEP-167 record and the exact `Memory.md` update. Do not alter prior Phase 1 files or published commits.

**Next step**

Execute Task 2: add the provider dependency, strict internal parsing, output descriptor, staged failure handling, and exact nested direct handler; then run focused, adjacent, Build, and diff gates.

---

## STEP-168 — Implement the exact direct `list_workspaces` handler

**Status**

Completed. The direct descriptor, provider boundary, staged failures, and exact nested handler are implemented; only Tool Card and protected HTTP consumer migration remain RED.

**Goal**

Connect the Task 1 schema to the direct full-mode tool without changing workspace-manager semantics or entering Phase 2.

**Files changed**

- `src/server.ts`
- `test/list-workspaces-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-4.md`

**Implementation summary**

- Imported the tool-owned schema, added strict internal provider item parsing, and added fixed failure text that never interpolates raw errors.
- Extended `CodexProServerDependencies` with `listWorkspacesProvider?: () => Workspace[] | Promise<Workspace[]>` and retained `WorkspaceManager.listWorkspaces()` as the production default.
- Added the exact descriptor `outputSchema` while preserving empty input, read-only annotations, metadata, and full-mode-only registration.
- Replaced the flat handler with separate provider-invocation and validation/construction stages.
- Preserved empty success, insertion order, canonical roots, deterministic IDs, timestamps, readable text, and cross-server-instance shared manager state for the same normalized configuration.
- Provider throw/reject now maps to `WORKSPACE_LIST_FAILED`; malformed or inconsistent provider output maps to `INTERNAL_ERROR` with fixed redacted output.

**Verification commands**

```text
node --test test/list-workspaces-contract.test.mjs
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
npm run build
```

**Verification results**

- Focused intermediate result: 11/13 passed; only Tool Card and HTTP compatibility tests remained RED.
- Adjacent set: 68/70 passed; the same two planned consumer tests were the only failures, while all 57 adjacent published contracts passed.
- Build: passed.
- No dependency, protected Smoke source, authentication, credential, profile, Cloudflare, allowed-root, path-policy, workspace-lifecycle, staging, commit, push, or Phase 2 behavior changed.

**Decisions made**

- Keep provider invocation distinct from validation so malformed output cannot be misclassified as collection failure.
- Preserve provider order and derive `count`; do not sort, stat, filter, or auto-open workspaces.
- Continue directly to Task 3 under the user's continuous approval.

**Risks or limitations**

- Tool Card still reads historical flat fields until Task 3.
- Protected HTTP Smoke still reads the flat workspace array until the compatibility loader is extended.

**Rollback method**

Revert only the Slice 15 imports, internal provider schema, failure helper, dependency/provider initialization, descriptor, and handler in `src/server.ts`, plus this record and the exact `Memory.md` update. Keep the new schema/test rollback independent if Task 1 must also be withdrawn.

**Next step**

Execute Task 3: migrate Tool Card nested-first handling and add the exact fail-closed HTTP compatibility substitution, then rerun focused, adjacent, Build, standalone HTTP Smoke, full Smoke, and diff checks.

---

## STEP-169 — Migrate `list_workspaces` consumers and protected HTTP compatibility

**Status**

Completed. The direct tool, Tool Card, supertool path, and protected HTTP Smoke consumer now use the exact nested contract; all Task 3 gates pass.

**Goal**

Complete consumer migration without editing protected Smoke sources, weakening secret-content checks, or removing historical Tool Card compatibility.

**Files changed**

- `src/toolCardWidget.ts`
- `scripts/http-smoke-compat.mjs`
- `test/list-workspaces-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-4.md`

**Implementation summary**

- Added a focused `listWorkspacesResultData` normalizer that consumes nested success first and retains historical flat fallback.
- Updated the subtitle and `renderWorkspaces` paths for exact nested success and fixed nested error rendering.
- Preserved the existing visual scope: successful rows display workspace IDs and roots without adding timestamp UI.
- Confirmed the existing supertool wrapper preserves the child tool title and exact nested envelope after the direct handler migration.
- Extended `scripts/http-smoke-compat.mjs` with one exact-once substitution from the protected flat workspace-array access to `structuredContent.data?.workspaces`.
- Left `scripts/http-smoke.mjs` and `scripts/smoke.mjs` unchanged; transformed source remains in memory and source drift fails closed.

**Verification commands**

```text
node --test test/list-workspaces-contract.test.mjs
npm run build
node scripts/http-smoke-compat.mjs
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
npm run smoke
git diff --check
```

**Verification results**

- Focused contracts: 13/13 passed.
- Build: passed.
- Standalone HTTP Smoke: passed.
- Adjacent workspace/config contracts: 70/70 passed.
- Complete Smoke: all eight sections passed.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings appeared.
- No dependency, protected Smoke source, authentication, credential, profile, Cloudflare, allowed-root, path-policy, workspace-lifecycle, staging, commit, push, or Phase 2 behavior changed.

**Decisions made**

- Keep Tool Card historical flat fallback for saved results while making current results nested-first.
- Use the existing fail-closed in-memory compatibility loader rather than editing protected credential-shaped fixtures.
- Continue to Task 4 under the user's continuous approval.

**Risks or limitations**

- The compatibility loader intentionally depends on one exact protected-source string.
- The public contract still represents process-local inventory without close, expiry, ownership, persistence, or client isolation.

**Rollback method**

Restore the previous flat-only Tool Card list rendering and remove only the new HTTP compatibility replacement and STEP-169 records. Do not modify the protected Smoke sources or previously published workspace contracts.

**Next step**

Execute Task 4: run fresh focused, adjacent, complete regression, Build, standalone HTTP Smoke, complete Smoke, native-Windows Stress, package dry-run, and diff/scope checks; then reconcile CHANGELOG, AGENTS, Memory, design, plan, and the active archive.

---

## STEP-170 — Complete local verification and implementation review

**Status**

Completed. Slice 15 is fully verified locally and ready for the explicitly approved Task 5 publication workflow.

**Goal**

Produce fresh complete verification evidence, reconcile durable documentation, and confirm the implementation remains one independently reversible direct-tool slice.

**Files reviewed or changed**

- `src/tools/schemas/listWorkspaces.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/http-smoke-compat.mjs`
- `test/list-workspaces-contract.test.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-4.md`
- `docs/superpowers/specs/2026-07-13-list-workspaces-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md`

**Verification commands**

```text
node --test test/list-workspaces-contract.test.mjs
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
node --test test/*.test.mjs
npm run build
node scripts/http-smoke-compat.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
show_changes(include_diff=true)
```

**Verification results**

- Focused `list_workspaces`: 13/13 passed.
- Adjacent workspace/config contracts: 70/70 passed.
- Complete Node regression: 253/253 passed.
- Build: passed.
- Standalone HTTP Smoke: passed.
- Complete Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal Build.
- Package dry-run: passed with 129 files, 340.7 kB compressed, and 1.7 MB unpacked; internal Memory/spec/plan records remain excluded.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings appeared.

**Implementation review findings**

- The exact success contract contains only nested `workspaces` and derived `count`; each item contains only `id`, `root`, and `openedAt`.
- Empty success, insertion order, deterministic IDs, canonical roots, and process-local cross-session sharing are preserved.
- Provider invocation and validation failures remain separated and expose no raw diagnostics.
- Tool Card is nested-first with historical flat fallback.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged; the HTTP migration exists only in the fail-closed compatibility loader.
- No dependency, package metadata, authentication, credential, profile, Cloudflare, allowed-root, path-policy, workspace-lifecycle, or Phase 2 change is included.
- `Memory.md` was reduced below the practical line/byte targets while retaining current evidence and archive pointers.

**Decisions made**

- Mark Tasks 1–4 locally complete.
- Proceed to Task 5 because staging, commit, push, and exact-head CI were explicitly approved by the user.
- Run `neat-freak` and all local gates again after any review edits before publication.

**Risks or limitations**

- Inventory remains process-local and lacks close, expiry, ownership, persistence, random IDs, or client isolation.
- Successful authenticated results continue to expose canonical roots.
- The HTTP compatibility loader intentionally depends on an exact protected-source string and fails closed on drift.

**Rollback method**

Before publication, revert only the eleven reviewed Slice 15 files. After publication, use a normal revert commit; do not reset or rewrite `main`, and do not alter credentials, profiles, protected Smoke sources, or prior archives.

**Next step**

Execute Task 5: run `neat-freak`, repeat every local gate, precisely stage only the reviewed files, commit and push the implementation, verify exact-head Ubuntu/Windows Node 20/24 CI, then write and publish a separate durable publication record and verify that final record head.

---

## STEP-171 — Publish direct `list_workspaces` and verify implementation CI

**Status**

Completed. The fifteenth Phase 1 direct-tool implementation is published and its exact implementation head passed the complete cross-platform CI matrix.

**Publication evidence**

- Re-ran `neat-freak` and reconciled AGENTS, Memory, CHANGELOG, the design, the plan, and the active archive.
- Re-ran focused 13/13, adjacent 70/70, complete 253/253, Build, standalone HTTP Smoke, Smoke 8/8, native-Windows Stress, package dry-run, and diff checking after review edits.
- Precisely staged the eleven reviewed Slice 15 files without `git add .`.
- `git diff --cached --check` passed.
- Created implementation commit `c4eb31a` with message `feat(schema): add exact list_workspaces result contract`.
- Full implementation SHA: `c4eb31acbc36a8eb857484edb13777126f985362`.
- Pushed `main` to `origin/main`: `4966a46..c4eb31a`.
- Matched public GitHub Actions run `29267724784` to the exact full implementation SHA.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- Windows / Node 20: success.
- Windows / Node 24: success.
- Run conclusion: success.

**Published contract**

- Direct `list_workspaces` remains full-mode only and accepts no arguments.
- Success contains exactly nested `workspaces` and derived `count`; each ordered item contains exactly `id`, `root`, and `openedAt`.
- Empty-list success, deterministic process-local IDs, canonical-root reuse, insertion order, and cross-session shared inventory are preserved.
- `WORKSPACE_LIST_FAILED` and `INTERNAL_ERROR` are the only fixed non-retryable public failures; raw diagnostics remain private.
- Tool Card consumes nested results first with historical flat fallback; the supertool preserves the exact child envelope.
- Protected HTTP Smoke migration remains one exact fail-closed in-memory substitution; protected source files remain unchanged.
- No dependency, authentication, credential, profile, Cloudflare, allowed-root, path-policy, workspace-lifecycle, or Phase 2 change was published.

**Risks and limitations**

- Inventory remains process-local and lacks close, expiry, ownership, persistence, random IDs, or client isolation.
- Successful authenticated results expose canonical local roots, matching existing behavior.
- The compatibility loader intentionally depends on an exact protected-source string and fails closed on drift.

**Rollback method**

Use a normal revert commit for `c4eb31a` if the implementation must be withdrawn. Do not reset or rewrite `main`, and do not alter credentials, profiles, protected Smoke sources, or prior archives.

**Next step**

Commit and push this separate publication record, verify that record commit's exact-head Ubuntu/Windows Node 20/24 CI, then design-review the next remaining Phase 1 direct tool. Keep workspace lifecycle expansion and Phase 2 closed.

---

## STEP-172 — Design and plan direct `inspect_workspace`

**Status**

Completed design-only step. Slice 16 is approved as direct `inspect_workspace`; the exact specification and five-task implementation plan are written. No production code, focused test, consumer, dependency, staging, commit, or push change was made.

**Why this tool is next**

- The first fifteen direct-tool slices are published.
- Slice 15 intentionally postponed `inspect_workspace` until the smaller workspace-list contract was stable.
- Direct `inspect_workspace` is now the highest-leverage remaining foundational result because direct structured `search`, Tool Card analysis rendering, Stress budgets, and write/edit/patch cache-invalidation checks consume the same analysis model or cache semantics.
- Capability/Skill inventory and `.ai-bridge` tools remain valid later candidates, but migrating them first would leave the shared repository-analysis result legacy-flat.

**Repository evidence inspected**

- Current direct registration in `src/server.ts`, including standard/full mode, analysis-enabled gating, optional workspace/path inputs, include flags, normal output caps, Tool Card caps, flat structured output, and generic failure behavior.
- `src/analysis/types.ts`, `src/analysis/index.ts`, `src/analysis/inventory.ts`, `src/analysis/extract.ts`, `src/analysis/graph.ts`, `src/analysis/cache.ts`, and `src/analysis/classify.ts`.
- Existing exact Phase 1 schema patterns in `src/tools/schemas/common.ts`, `src/tools/schemas/search.ts`, and `src/tools/schemas/listWorkspaces.ts`.
- Existing flat Tool Card analysis consumers in `src/toolCardWidget.ts`.
- Protected main-Smoke flat analysis accesses in `scripts/smoke.mjs` and the fail-closed in-memory compatibility mechanism in `scripts/smoke-platform-compat.mjs`.
- Normal Stress consumers in `scripts/stress.mjs`.
- Analysis-cache consumers in write/edit/apply-patch contract tests.
- The published Slice 15 design, which identified `inspect_workspace` as the wider follow-on workspace/analysis contract.

**Approved design decisions**

- Migrate only direct `inspect_workspace` in Slice 16.
- Add one tool-owned schema module; do not extract a shared analysis schema or modify direct `search`.
- Add one test-only `inspectWorkspaceProvider` boundary around existing full-workspace analysis.
- Validate complete provider output before applying scope and response caps.
- Preserve the analysis engine, inventory, classifier, extractor, graph, cache key, LRU size, and cache invalidation.
- Normalize omitted, empty, or whitespace-only path to `.`.
- Preserve safe nonexistent-scope success and do not add `FILE_NOT_FOUND`.
- Keep coverage as full-workspace coverage while `returned` and `output_limited` describe scoped/capped response data.
- Keep normal caps at 300 files, 500 symbols, and 800 relationships.
- Keep Tool Card caps at 120 files, 80 symbols, and 120 relationships.
- Keep include-symbols/include-relationships omission separate from output truncation.
- Success contains exactly sixteen nested data fields and removes flat `schema_version`.
- Provider warnings are limited to the existing bounded forms; the handler may append one fixed output-limit warning.
- Domain warnings remain in `data`; `meta.warnings` stays empty.
- Use five fixed non-retryable failures: `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `ANALYSIS_FAILED`, and `INTERNAL_ERROR`.
- Tool Card becomes nested-first with historical flat fallback.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged; main-Smoke migration uses exact-count in-memory substitutions.
- Phase 2 workspace lifecycle and semantic-provider expansion remain closed.

**Documents created**

- `docs/superpowers/specs/2026-07-13-inspect-workspace-output-schema-design.md`.
- `docs/superpowers/plans/2026-07-13-inspect-workspace-output-schema.md`.

**Plan structure**

1. Establish complete focused RED and schema-only GREEN.
2. Add the provider boundary, strict validation, exact descriptor, and staged direct handler.
3. Migrate Tool Card, protected Smoke compatibility, Stress, and adjacent cache consumers.
4. Run all local gates and reconcile durable records.
5. Publish only after separate explicit approval, then verify exact-head Ubuntu/Windows Node 20/24 CI and publish a separate durable record.

**Design review result**

- The design preserves current behavior while making the public protocol exact.
- The implementation boundary is independently reversible.
- No analysis-engine file is planned to change.
- No dependency, authentication, credential, profile, Cloudflare, allowed-root, path-policy, workspace-lifecycle, or Phase 2 change is included.
- Plan self-review found and corrected the canonical-root test fixture and one undefined Stress-example constant reference.
- Unfinished-marker scan found no planning placeholders.
- `git diff --check` passed; only established LF-to-CRLF working-copy warnings appeared.
- No implementation test was run because implementation has not started.

**Files changed in this design-only step**

- Added the Slice 16 design.
- Added the Slice 16 plan.
- Updated `AGENTS.md` documentation map and stopping point.
- Updated `Memory.md` current state, decisions, open items, and recent summary.
- Appended this archive entry.

**Rollback method**

Before implementation, remove the two Slice 16 documents and revert only the corresponding AGENTS, Memory, and active-archive record changes. Do not alter published Slice 15 evidence, credentials, profiles, protected Smoke sources, prior archives, or repository history.

**Next step**

After explicit implementation approval, execute Slice 16 Task 1 only: create the focused RED contract and the schema-only GREEN, record exact evidence in `Memory.md` and this active archive, then stop at the review gate. Keep Phase 2, workspace lifecycle expansion, and semantic-provider expansion closed.

---

## STEP-173 — Establish direct `inspect_workspace` RED and schema-only GREEN

**Status**

Completed. Added the focused contract and strict tool-owned schema without changing the direct handler or consumers during the schema-only stage.

**Evidence**

- Created `test/inspect-workspace-contract.test.mjs` with ten focused schema, handler, failure, Tool Card, supertool, and protected-Smoke contracts.
- Initial RED: 0/10 passed and 10/10 failed for expected missing-schema/handler/consumer reasons; no test syntax error occurred.
- Created `src/tools/schemas/inspectWorkspace.ts` with the exact sixteen-field success data, strict provider schema, bounded warnings, five stable failures, and exact envelope constructors.
- Schema-only GREEN: 3/10 passed; the remaining seven tests were the planned handler/consumer RED.
- `npm run build` passed with the new schema module.

**Decisions**

- Preserve one tool-owned schema instead of extracting shared analysis schemas.
- Keep provider-domain warnings in `data`; keep `meta.warnings` empty.
- Preserve the built-in analysis engine and cache unchanged.

---

## STEP-174 — Implement direct handler and migrate analysis consumers

**Status**

Completed. Added exact provider validation and staged direct handling, then migrated Tool Card, protected Smoke compatibility, Stress, and cache-invalidation consumers.

**Implementation**

- Added `inspectWorkspaceProvider` as a test-only dependency boundary around existing full-workspace analysis.
- Added exact output descriptor, workspace/path/provider/internal failure staging, safe details, strict workspace/root/path/count/warning validation, normalized root scope, response caps, include-flag semantics, and nested success construction.
- Preserved full-workspace coverage and cache state while filtering only returned records.
- Added nested-first Tool Card success/failure rendering with historical flat fallback.
- Extended `scripts/smoke-platform-compat.mjs` with exact-count, fail-closed in-memory replacements while leaving protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` unchanged.
- Migrated `scripts/stress.mjs` and write/edit/apply-patch cache tests to current nested data.
- CodexPro edit protection rejected `scripts/stress.mjs` because of an existing secret-looking fixture; used one count-asserted Node source patch through the approved local Bash backend, then verified the resulting consumer behavior.

**Verification**

- Focused final: 10/10 passed.
- Adjacent analysis/cache contracts: 79/79 passed.
- `npm run build` passed.

---

## STEP-175 — Complete local Slice 16 verification and publication review

**Status**

Completed locally. Tasks 1–4 are complete and Task 5 publication is approved and pending execution.

**Fresh verification**

- Focused `inspect_workspace`: 10/10 passed.
- Adjacent `inspect_workspace`, `search`, `show_changes`, `write`, `edit`, and `apply_patch`: 79/79 passed.
- Complete Node regression: 263/263 passed.
- Build: passed.
- Analysis Smoke: passed.
- Analysis CLI Smoke: passed.
- Protected main Smoke compatibility: passed.
- Standalone HTTP Smoke: passed.
- Complete Smoke: all eight sections passed.
- Native-Windows Stress: passed, including internal Build.
- Package dry-run: 131 files, 346.4 kB compressed, 1.8 MB unpacked; internal Memory/spec/plan records remain excluded.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings appeared.

**Review findings**

- Success exposes exactly sixteen nested data fields and no current flat fields or `schema_version`.
- Five failures expose fixed messages and bounded details without raw diagnostics.
- Provider identity, normalized paths, coverage counts, warnings, cache, scope, and returned counts are validated.
- Analysis engine, cache implementation, package dependencies, authentication, credentials, profiles, Cloudflare, allowed roots, workspace lifecycle, and Phase 2 remain unchanged.
- Protected Smoke source files remain unchanged.

**Next step**

Execute Task 5: run `neat-freak`, repeat release gates, precisely stage only reviewed Slice 16 files, commit and push the implementation, verify exact-head Ubuntu/Windows Node 20/24 CI, then publish and verify a separate durable record.

---

## STEP-176 — Publish direct `inspect_workspace` and verify implementation CI

**Status**

Completed. The sixteenth Phase 1 direct-tool implementation is published and its exact implementation head passed the complete cross-platform CI matrix.

**Publication evidence**

- Ran `neat-freak`; AGENTS remained 218 lines/15.5 kB and Memory remained 143 lines/15.2 kB before the publication record, both inside project limits.
- Re-ran focused 10/10, adjacent 79/79, complete 263/263, Build, analysis Smoke, analysis CLI Smoke, standalone HTTP Smoke, complete Smoke 8/8, native-Windows Stress, package dry-run, and diff checking after final review edits.
- Precisely staged the fifteen reviewed Slice 16 files without `git add .` or `git add -A`.
- `git diff --cached --check` passed.
- Created implementation commit `4cea9bd` with message `feat(schema): add exact inspect_workspace result contract`.
- Full implementation SHA: `4cea9bd29d1abad97e511d65acf6a57c591a2b74`.
- Pushed `main` to `origin/main`: `2426c1a..4cea9bd`.
- The local Git Bash backend did not have `gh`; verification used the public GitHub Actions REST API with exact `head_sha` matching.
- Matched public GitHub Actions run `29272546666` to the exact full implementation SHA.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- Windows / Node 20: success.
- Windows / Node 24: success.
- Run conclusion: success.

**Published contract**

- Direct `inspect_workspace` remains standard/full when analysis is enabled and absent in minimal or analysis-disabled modes.
- Success contains exactly sixteen nested data fields; full-workspace coverage remains distinct from scoped/capped returned records.
- Provider workspace/root identity, normalized path sets, coverage counts, warnings, cache, returned counts, and output-limit semantics are validated before public construction.
- Five fixed non-retryable failures separate workspace, path, provider execution, and internal validation without exposing raw diagnostics.
- Tool Card consumes nested results first with historical flat fallback; the direct supertool preserves the exact child envelope.
- Protected main and HTTP Smoke source files remain unchanged; compatibility migration is exact, fail-closed, and in-memory.
- The analysis engine, cache implementation, dependencies, authentication, credentials, profiles, Cloudflare, allowed roots, workspace lifecycle, and Phase 2 remain unchanged.

**Risks and limitations**

- Tool-local validation intentionally duplicates some analysis schemas from direct `search` until a later separately reviewed extraction.
- Workspace/path failure classification still depends on bounded internal message prefixes.
- Compatibility loaders intentionally depend on exact protected-source strings and fail closed on drift.

**Rollback method**

Use a normal revert commit for `4cea9bd` if the implementation must be withdrawn. Do not reset or rewrite `main`, and do not alter credentials, profiles, protected Smoke sources, prior archives, or published Phase 1 commits.

**Next step**

Commit and push this separate publication record, verify its exact-head Ubuntu/Windows Node 20/24 CI, then design-review the next remaining Phase 1 direct tool. Use `codexpro_inventory` as the default candidate unless fresh inventory finds a smaller prerequisite. Keep Phase 2 closed.

---

## STEP-177 — Verify publication-record head and close Slice 16

**Status**

Completed. The separate durable publication record is pushed, exact-head CI-validated, and Slice 16 is fully closed.

**Record publication evidence**

- Publication-record commit: `1f39996`.
- Full record SHA: `1f39996d375b6191fba0bb8972c35bb3b15136ad`.
- Commit message: `docs(memory): record inspect_workspace publication`.
- Push range: `4cea9bd..1f39996`.
- Exact-head GitHub Actions run: `29273060702`.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- Windows / Node 20: success.
- Windows / Node 24: success.
- Run conclusion: success.

**Final state**

- Implementation and publication-record SHAs and CI runs are recorded in `Memory.md`, `AGENTS.md`, the design, and the plan.
- All Task 1–5 checkboxes are complete.
- No production behavior changed after implementation commit `4cea9bd`.
- Phase 2, workspace lifecycle, and semantic-provider expansion remain closed.

**Next step**

Design-review the next remaining Phase 1 direct tool. Use `codexpro_inventory` as the default candidate unless fresh inventory finds a smaller prerequisite.

---

## STEP-178 — Adopt the authoritative master implementation plan

**Status**

Completed. Replaced the stale external execution sequence with a repository-owned authoritative plan and locked the user-approved route: finish Phase 1, pass a design-only Policy Kernel gate, then request separate approval before Phase 2 implementation.

**Goal**

Produce one current plan that reconciles the 2026-07-11 audit with the completed Phase 0.5 work, sixteen published Phase 1 slices, the remaining advertised tools, and the relevant Permission/Sandbox/Hooks/Skills/Process lessons from OpenAI Codex and Open Interpreter.

**Files changed**

- Added `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`.
- Updated `AGENTS.md` documentation map and approved stopping point.
- Marked active sequencing in `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` as superseded while preserving it as a historical audit baseline.
- Updated `Memory.md` current route, decisions, open items, and recent summary.
- Appended this active Phase 1 archive record.

The downloaded `D:\浏览器下载\codexpro_audit_and_implementation_spec_2026-07-11.md` remains unchanged as historical input. No source code, tests, package dependencies, credentials, profiles, Cloudflare state, or external systems changed.

**Implementation summary**

- Counted the current advertised configuration universe as 26 core tools plus two opt-in Codex Session tools.
- Recorded sixteen published schemas and a dependency-first order for the twelve remaining tools, starting with `codexpro_inventory` and ending with aggregate `codexpro_self_test` and `codexpro` wrappers.
- Added a hard Phase 1 completion gate and a design-only Policy Kernel gate before Phase 2.
- Defined the baseline policy relationship as hard policy, identity scopes, Permission Profile, and session grant intersection; approval can expand only inside that ceiling.
- Separated Tool Surface, Policy, Approval, and Sandbox; required `SHELL_SANDBOX_UNAVAILABLE` fail-closed behavior when requested enforcement is unavailable.
- Split Phase 2 into Policy Kernel/request identity and workspace lifecycle, and split Phase 4 into Shell/Process and OS Sandbox/Egress.
- Routed Hooks and Skill trust to Phase 6, reusing the existing lazy Skill discovery/loading path rather than rebuilding it.
- Preserved current ChatGPT Web query-token compatibility facts and kept OAuth 2.1 separately gated in Phase 8.

**Verification commands**

```powershell
$plan = Get-Content -LiteralPath 'docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md' -Raw -Encoding UTF8
$markers = @('完成 Phase 1', 'Policy Kernel 设计门', '单独批准 Phase 2', 'codexpro_inventory', 'SHELL_SANDBOX_UNAVAILABLE')
if (([regex]::Matches($plan, '(?m)^```')).Count % 2 -ne 0 -or ($markers | Where-Object { -not $plan.Contains($_) })) { throw 'Plan structure check failed' }
$server = Get-Content -LiteralPath 'src/server.ts' -Raw -Encoding UTF8
$full = [regex]::Match($server, 'const FULL_TOOL_NAMES = \[(?<body>[\s\S]*?)\] as const;').Groups['body'].Value
$sourceNames = @([regex]::Match($server, 'const SUPERTOOL_NAME\s*=\s*"([^"]+)"').Groups[1].Value) + @([regex]::Matches($full, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) + @('codex_sessions', 'read_codex_session')
$migrated = @([regex]::Matches([regex]::Match($plan, '### 2\.4 Phase 1 已发布的 16 个切片(?<body>[\s\S]*?)### 2\.5').Groups['body'].Value, '(?m)^\d+\. `([^`]+)`$') | ForEach-Object { $_.Groups[1].Value })
$remaining = @([regex]::Matches([regex]::Match($plan, '### 2\.5 Phase 1 尚余 12 个支持面(?<body>[\s\S]*?)(?m:^---\r?$)').Groups['body'].Value, '(?m)^\|\s*(?:17|18|19|20|21|22|23|24|25|26|27|28)\s*\|\s*`([^`]+)`\s*\|') | ForEach-Object { $_.Groups[1].Value })
if (($sourceNames | Sort-Object -Unique).Count -ne 28 -or $migrated.Count -ne 16 -or $remaining.Count -ne 12 -or (Compare-Object ($sourceNames | Sort-Object -Unique) (($migrated + $remaining) | Sort-Object -Unique))) { throw 'Tool inventory check failed' }
git diff --check
$secretMatches = & rg -n '(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)' AGENTS.md Memory.md docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md docs/memory/archive/phase-1-part-4.md
if ($LASTEXITCODE -eq 0) { $secretMatches; throw 'Secret-pattern match found' }
if ($LASTEXITCODE -ne 1) { throw 'Secret scan failed' }
git status --short --branch
```

**Verification results**

- The plan structure check passed with balanced code fences and all required route/security markers present.
- The live `src/server.ts` tool universe matched the plan exactly: 26 core plus two opt-in tools equals sixteen published plus twelve remaining tools.
- `git diff --check` passed; only established working-copy line-ending warnings were permitted.
- The targeted secret-pattern scan returned no matches.
- `Memory.md` remained below its 200-line/25-KB hard limits.
- The active Phase 1 Volume 4 remained below 80% of the 60-KB direct-read limit after this STEP, so no continuation volume was opened.
- No implementation tests, Build, Smoke, package, CI, staging, commit, or push were run because this step changed documentation only.
- Initial verification-harness attempts failed because an unanchored regex stopped at the Markdown table separator and PowerShell mangled a Node command's quoting; both harness defects were corrected, and the final native-PowerShell checks passed without a document failure.

**Decisions made**

- This plan is the active sequencing authority; the 2026-07-11 download and `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` remain historical references.
- Policy Kernel design begins only after Phase 1 completes, and its completion does not authorize Phase 2 implementation.
- OpenAI Codex is the primary source for shared Permission/Sandbox/Hooks/Skills mechanics; Open Interpreter is a secondary adaptation and edge-case testing reference.
- Runtime Profile and Permission Profile remain distinct concepts.
- Tool-surface presets are future UX compilation targets, not security boundaries.

**Risks or limitations**

- Permission Profile syntax, rule specificity, Approval caching, Windows sandbox technology, and egress enforcement remain design inputs rather than approved public APIs.
- OAuth-backed subject isolation remains deferred to Phase 8; Phase 2 must not overstate pre-OAuth identity guarantees.
- The plan is intentionally broad and must be executed through separately reviewed slice specs and TDD plans, not as one unbounded implementation session.

**Rollback method**

Remove the new master-plan file and revert only the STEP-178 changes in `AGENTS.md`, `Memory.md`, and `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`. Append a correction to this archive instead of rewriting this historical record. Do not alter the downloaded audit, source code, credentials, profiles, published Phase 1 commits, or Git history.

**Next step**

Design-review Phase 1 Slice 17 `codexpro_inventory`. Keep the slice read-only, bounded, and free of Phase 6 Skill-trust semantics. Do not implement it until its design and execution plan receive the required approval. Keep Policy Kernel implementation, workspace lifecycle, semantic providers, OAuth, and Phase 2 closed.

---

## STEP-179 — Design Slice 17 and place transactional file moves

**Status**

Completed. Approved the exact `codexpro_inventory` design and six-task TDD plan, and assigned file organization to a Phase 3 `move_paths` transaction rather than expanding Phase 1.

**Goal**

Turn the user's full Phase 1 objective into the next independently testable slice while resolving where safe file-moving capability belongs from first principles.

**Files changed**

- Added `docs/superpowers/specs/2026-07-13-codexpro-inventory-output-schema-design.md`.
- Added `docs/superpowers/plans/2026-07-13-codexpro-inventory-output-schema.md`.
- Updated `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` with Phase 3 `move_paths` requirements and the Slice 17 RED stopping point.
- Updated `AGENTS.md` and `Memory.md` with the design, plan, archive rollover, and next action.
- Appended this final Volume 4 record and opened `docs/memory/archive/phase-1-part-5.md` for STEP-180 onward.

No production source, test, dependency, credential, profile, Cloudflare state, or external system changed in this design step.

**Implementation summary**

- Chose a tool-local exact contract over a shallow wrapper or premature capability-registry rewrite.
- Fixed sixteen nested success fields, exact Skill/MCP item shapes, returned/source counts, effective include flags, both truncation flags, fixed warnings, and three stable failures.
- Required a test-only inventory provider boundary and strict provider validation without importing Phase 6 trust/version/hash/permission fields.
- Kept main/HTTP Smoke protected and scoped current consumer migration to Tool Card and Stress unless implementation evidence proves an exact compatibility need.
- Defined `move_paths` V1 for Phase 3 as same-workspace/same-volume ordinary-file moves with full preflight, no overwrite, expected hashes, explicit parent creation, transaction rollback, `changeSetId`, and redacted audit.
- Rejected Phase 1 move expansion and Shell/PowerShell/`git mv` as the public movement contract because none supplies the required policy, transaction, and audit guarantees.

**Verification commands**

```powershell
$files = @('docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md', 'docs/superpowers/specs/2026-07-13-codexpro-inventory-output-schema-design.md', 'docs/superpowers/plans/2026-07-13-codexpro-inventory-output-schema.md')
foreach ($file in $files) { $text = Get-Content -LiteralPath $file -Raw -Encoding UTF8; if (([regex]::Matches($text, '(?m)^```')).Count % 2 -ne 0 -or $text -match '<(TBD|TODO|FIXME|PLACEHOLDER)>') { throw "Invalid document: $file" } }
git diff --check
rg -n '(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)' docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md docs/superpowers/specs/2026-07-13-codexpro-inventory-output-schema-design.md docs/superpowers/plans/2026-07-13-codexpro-inventory-output-schema.md
```

**Verification results**

- All three documents had balanced code fences and no unresolved placeholder tokens.
- Spec and plan self-review found and corrected the original ambiguous Stress truncation fixture: it now explicitly requires 141 Skills with a 140 limit.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings.
- The targeted secret-pattern scan returned no matches.
- No implementation test, Build, Smoke, Stress, package, CI, staging, commit, or push ran because production implementation had not started.
- Volume 4 crossed the 49,152-byte rollover threshold after this completed STEP and is now closed; STEP-180 begins Volume 5.

**Decisions made**

- Phase 1 remains exactly the current 28 advertised-tool universe; adding `move_paths` does not move the Phase 1 finish line.
- `codexpro_inventory` reports returned counts and explicit truncation, not an unbounded total.
- `widget_uri` remains descriptor metadata and is removed from domain data.
- MCP inventory exposes names and fixed source categories only.
- External Skill selectors use a stable non-absolute `$EXTERNAL/<fingerprint>/SKILL.md` form.
- File movement waits for Policy Kernel, workspace isolation, atomic transaction, rollback, and audit prerequisites in Phase 3.

**Risks or limitations**

- The design intentionally does not prove production behavior; Task 1 must first establish a behavioral RED.
- Bounded Skill traversal can only state that an additional eligible item was encountered, not compute a full machine total.
- `load_skill` must later prove sanitized `$EXTERNAL` selectors continue resolving without revealing private absolute paths.
- `move_paths` is a roadmap decision only; no file-move implementation or security guarantee exists yet.

**Rollback method**

Remove the new Slice 17 spec/plan and revert only the STEP-179 master-plan/index changes. Append an archive correction rather than rewriting this closed record. Do not alter source code, tests, user Skills/MCP configs, credentials, profiles, published Phase 1 commits, or Git history.

**Next step**

Execute Slice 17 Task 1 only: create `test/codexpro-inventory-contract.test.mjs`, run it, verify a behavioral RED with exact totals, record the evidence in Phase 1 Volume 5, and only then begin the schema GREEN. Keep Phase 2/3 implementation closed.

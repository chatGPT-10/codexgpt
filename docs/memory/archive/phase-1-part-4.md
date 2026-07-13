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

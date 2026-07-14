# Phase 1 Implementation Memory — Volume 8

This append-only volume continues Phase 1 implementation from STEP-220.

Volume 7 (`docs/memory/archive/phase-1-part-7.md`) is closed at STEP-219 after reaching 53,065 bytes, above the 52,428-byte rollover threshold. Do not rename, repartition, or silently rewrite the closed volume.

## STEP-220 — Add the exact direct `handoff_to_codex` schema

**Status:** Complete

**Goal:** Add the Slice 24 strict result envelope, fixed Codex success data contract, stable warnings/errors, and constructors before implementing server behavior.

**Files changed:**

- `src/tools/schemas/handoffToCodex.ts`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added the tool-local fixed-Codex schema by reusing the explicitly exported Slice 23 durable handoff data shape, then constraining `tool_mode=full`, `agent=codex`, `agent_name=Codex`, and `model=null`. Added the exact one-warning union, fifteen safe tool-specific failures, strict six-field output envelope, cross-field success/failure invariant, and pure success/failure constructors.

**Verification commands:**

- `node --test --test-name-pattern="schema exports|schema derives|schema rejects" test/handoff-to-codex-contract.test.mjs`
- `npm run build`

**Verification results:** Schema-focused tests passed 3/3. TypeScript Build passed.

**Decisions made:** Retain Slice 23's exact 36 durable facts as the shared structural base, but enforce Codex identity and full-only mode in the Slice 24 schema. Keep all warning and failure messages tool-local so neither direct tool can silently inherit the other's public wording.

**Risks or limitations:** The direct handler and consumer migrations are not yet implemented, so the full Slice 24 contract suite remains intentionally RED outside the schema subset. Provider/disk integrity enforcement still depends on the next shared-boundary step.

**Rollback method:** Remove `src/tools/schemas/handoffToCodex.ts` and revert the STEP-220 plan/index/status entries; Slice 23 remains unchanged.

**Next step:** Extract and TDD-verify the shared validated provider boundary, add independent Codex provider/clock seams, and preserve Slice 23 behavior.

## STEP-221 — Implement the direct `handoff_to_codex` handler and consumers

**Status:** Complete

**Goal:** Route both direct handoff tools through one fail-closed durable Provider boundary, implement the fixed Codex nested contract, and migrate all non-protected consumers.

**Files changed:**

- `src/server.ts`
- `src/handoffOps.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `test/handoff-to-agent-contract.test.mjs`
- `test/handoff-to-codex-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Extracted the Slice 23 Provider-result identity/integrity checks plus durable plan and two-log rereads into one internal validator. Added independent Codex Provider/clock seams and a full-only direct handler with fixed Codex identity, exact safe failures, bounded text, and nested structured content. Migrated the shared handoff Tool Card to nested-only data, added full-mode `codex_handoff` Stress coverage, updated the Slice 23 compatibility test, and deleted the now-unused flat `writeAgentHandoff` wrapper.

**Verification commands:**

- `node --test --test-name-pattern="MCP success|preserves defaults|stable request|existing-plan|provider identity|missing durable|mismatched durable|provider result" test/handoff-to-agent-contract.test.mjs test/handoff-to-codex-contract.test.mjs`
- `npm run build`
- `node --test test/handoff-to-codex-contract.test.mjs`
- `node --test test/handoff-to-agent-contract.test.mjs test/handoff-to-codex-contract.test.mjs`

**Verification results:** Shared write/integrity subset passed 10/10 and Build passed. The first complete Codex run passed 12/14, with only intentionally pending Tool Card/consumer migrations. After migration, the combined Slice 23/24 suites passed 30/31; the sole failure was an over-broad test regex that matched another tool's retained compatibility helper rather than handoff behavior. Scoping that audit to `handoffToAgentResultData` produced a final 31/31 pass. Protected main/HTTP Smoke sources remain unchanged.

**Decisions made:** Both direct handoff tools now use the exact same post-write trust boundary. Codex retains its fixed identity and full-only surface rather than calling a legacy convenience wrapper. The Tool Card accepts nested data only for both handoff tools; unrelated tools keep their own migration schedules.

**Risks or limitations:** Scaffold, plan, and two log writes remain non-transactional as documented; detected drift fails closed but does not roll back prior writes. Full regression, Smoke, native Stress, package, and static gates remain for the post-result review and completion steps.

**Rollback method:** Revert the STEP-221 source/test/consumer changes together and restore the previous `writeAgentHandoff` wrapper; Slice 23's pre-extraction logic can be restored from the same diff without touching protected Smoke sources.

**Next step:** Adversarially review fixed-target enforcement, normalization, all read/write boundaries, ordering, disk integrity, mode visibility, UI bounds, and compatibility; add deliberate RED for every material defect before full gates.

## STEP-222 — Review and harden the advertised fixed Codex identity

**Status:** Complete

**Goal:** Adversarially review the usable Slice 24 result and close any mismatch between runtime guarantees and the MCP-advertised contract.

**Files changed:**

- `src/tools/schemas/handoffToAgent.ts`
- `src/tools/schemas/handoffToCodex.ts`
- `test/handoff-to-codex-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Reviewed fixed target/mode enforcement, request normalization, read/write ceilings, preflight/write ordering, documented partial-write behavior, deterministic event identity, plan/two-log rereads, Provider drift, Tool Card bounds, mode visibility, protected compatibility, and JSON Schema advertisement. Found that `superRefine` enforced Codex identity only at runtime while the generated MCP `outputSchema` advertised broad agent/mode/model types. Added deliberate RED for the four advertised fields, extracted the common 36-field base and cross-field refinement once, and built the Codex schema with JSON-Schema-visible literals for `tool_mode=full`, `agent=codex`, `agent_name=Codex`, and `model=null`.

**Verification commands:**

- ad hoc in-memory MCP `tools/list` inspection of `handoff_to_codex.outputSchema.properties.data`
- `node --test --test-name-pattern="remains full-only" test/handoff-to-codex-contract.test.mjs` (deliberate RED, then GREEN)
- `npm run build`
- `node --test test/handoff-to-agent-contract.test.mjs test/handoff-to-codex-contract.test.mjs`

**Verification results:** Deliberate RED failed 0/1 because advertised `tool_mode` was the three-mode enum rather than the fixed literal. After the minimum schema refactor, the target test passed 1/1, Build passed, and both handoff suites passed 31/31.

**Decisions made:** Runtime-only refinements are insufficient for fixed values that form part of the client-visible MCP contract. Shared structural fields and cross-field validation remain single-source, while fixed Codex fields use literal Zod schemas so both runtime parsing and generated JSON Schema agree. No public design decision changed.

**Risks or limitations:** Zod cross-field refinements for path/count/byte relationships remain runtime guarantees that JSON Schema cannot fully express; their individual field bounds are still advertised. Non-transactional writes and filesystem races remain unchanged and fail closed when detected.

**Rollback method:** Remove the four advertised-field assertions and restore the previous runtime-only Codex refinement; this would reintroduce the documented advertisement mismatch and is not recommended.

**Next step:** Run the complete Slice 24 local verification matrix and static gates, then perform the required per-tool `neat-freak` reconciliation before Slice 25.

## STEP-223 — Complete Slice 24 gates and per-tool `neat-freak`

**Status:** Complete

**Goal:** Prove the complete unpublished Slice 24 result against its focused, adjacent, repository-wide, packaging, protected-compatibility, scope, and documentation gates, then reconcile durable project knowledge before continuing.

**Files changed:**

- `src/server.ts`
- `src/handoffOps.ts`
- `src/toolCardWidget.ts`
- `src/tools/schemas/handoffToAgent.ts`
- `src/tools/schemas/handoffToCodex.ts`
- `scripts/stress.mjs`
- `test/handoff-to-agent-contract.test.mjs`
- `test/handoff-to-codex-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-handoff-to-codex-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Completed the full local verification matrix after the advertised-schema hardening, audited the exact 55-path unpublished batch scope, protected Smoke sources, empty Git index, secret-shaped fixtures, output-schema design/plan pairs, repository instruction references, Markdown links and fences, required files, package contents, and current knowledge state. The per-tool `neat-freak` reconciliation marked Slice 24 locally complete but unpublished, corrected the stale flat-result and active-volume descriptions, advanced the next action to Slice 25, and compacted `Memory.md` to 128 lines and 15,161 bytes. No user-facing release document changed because the twelve-tool publication remains intentionally deferred.

**Verification commands:**

- `node --test test/handoff-to-codex-contract.test.mjs`
- adjacent Slice 17–24 contract command covering handoff, wait, export, and write suites
- complete direct-tool contract command
- `npm run build`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --cached --exit-code`
- `git diff --check`
- exact expected-versus-actual unified-scope comparison
- repository Markdown/link/fence, output-schema-pair, instruction-reference, required-file, and secret-shape audits

**Verification results:** Slice 24 focused tests passed 14/14; the adjacent matrix passed 93/93; the complete contract regression passed 388/388; Build passed; all eight Smoke sections passed; native-Windows Stress passed including `codex_handoff`; the package dry-run contained 149 files, 426,247 compressed bytes, and 2,284,162 unpacked bytes. Both protected Smoke sources were unchanged, the Git index was empty, the exact scope comparison reported expected 55 and actual 55 with no missing or unexpected paths, and the corrected all-project Markdown audit found 83 Markdown files, 20 relative links, zero broken links, and zero unbalanced fences. The only secret-shape match was the pre-existing intentional fake GitHub-token fixture in the Slice 23 test. `git diff --check` passed apart from established Windows line-ending warnings.

**Decisions made:** Slice 24 is locally complete, reviewed, per-tool reconciled, and remains part of the single unpublished Slice 17–28 batch. `README.md`, `README_ZH.md`, `CHANGELOG.md`, `SECURITY.md`, and `docs/FAQ.md` remain unchanged because Slice 24 adds no new input or visibility rule and publication is deferred. Continue directly with fresh Slice 25 inventory and design without staging, committing, pushing, or exact-head CI.

**Risks or limitations:** Both handoff tools still perform non-transactional multi-file writes; detected Provider or disk drift fails closed but cannot undo earlier writes. Exact-head cross-platform CI remains intentionally unavailable until the twelve-tool unified publication. Phase 2 production behavior remains closed until Phase 1 is published and the Policy Kernel design gate passes.

**Rollback method:** Revert only the Slice 24 schema, handler, shared validation extraction, Tool Card, Stress, focused tests, and active-document entries while preserving Slices 17–23. Restore the temporary flat Codex wrapper only if Slice 24 alone is rolled back; do not rewrite closed archive volumes.

**Next step:** Fresh-inventory and design Slice 25 `codex_sessions`, then implement it with TDD and finish its own per-tool `neat-freak` before Slice 26.

## STEP-224 — Design the direct `codex_sessions` exact contract

**Status:** Complete

**Goal:** Inventory the optional local Codex-session metadata index from first principles and approve a bounded, deterministic, safe contract before changing production behavior.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-codex-sessions-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Inventoried `src/codexSessions.ts`, conditional registration, tool-mode behavior, configuration/profile/docs, protected main-Smoke fixtures, the compatibility harness, Tool Card dispatch, and the Phase 1 schema patterns. The approved design keeps metadata/read opt-in and cross-tool-mode visibility, defines an exact eighteen-field result with nine-field records, makes scan and result truncation visible, validates one Provider boundary, restricts resumable identities to canonical UUIDs, deterministically traverses/sorts/de-duplicates histories, and leaves transcript reading for Slice 26. Wrote a seven-task uninterrupted TDD plan. A document self-review caught and corrected an inconsistent example array/count before archival.

**Verification commands:**

- repository-wide `rg` inventory for `codex_sessions`, `read_codex_session`, configuration, consumers, docs, and tests
- complete read of `src/codexSessions.ts`
- targeted reads of conditional registration/handlers, Tool Card routing, protected Smoke fixtures, compatibility loaders, changelog/FAQ, and prior exact-schema patterns
- required-term, design/plan-link, status-reference, Markdown-fence, line-count, and byte-count checks

**Verification results:** Both design files exist; the design contains every required contract/failure/limit/compatibility term; its nine code fences are balanced; the plan points to the existing design; master roadmap, historical roadmap, `AGENTS.md`, and `Memory.md` all identify the executable Slice 25 RED baseline as next. No source, protected Smoke, public release, staged, committed, pushed, or external state changed.

**Decisions made:** Adopt a tool-local exact index rather than a cosmetic envelope or a live session manager. Keep `codex_sessions` available in every tool mode only after explicit metadata/read opt-in. Treat unsafe payload ids as non-indexable unless a safe UUID can be recovered from the filename; never copy unsafe history text into a resume command. Expose fixed scan bounds and partial-result state. De-duplicate ids before filtering and limit application using deterministic recency/storage/id/path order.

**Risks or limitations:** The approved behavior is not implemented yet. Root reads and per-file parsing remain best-effort by design; excluded candidates are counted but not exposed with raw diagnostics. Metadata title extraction still intentionally reads the bounded head of opted-in local history. `read_codex_session` remains on its legacy flat contract until Slice 26.

**Rollback method:** Remove the two Slice 25 design files and revert only the STEP-224 status/index entries. No production behavior requires rollback.

**Next step:** Add the focused Slice 25 acceptance suite and preserve a deliberate all-RED baseline before implementing schema or domain behavior.

## STEP-225 — Establish the Slice 25 executable RED baseline

**Status:** Complete

**Goal:** Translate the approved metadata-index design into executable acceptance criteria and prove every new behavior is absent before implementation.

**Files changed:**

- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added fourteen focused tests covering the exact envelope/data/item schemas, two warnings/failures, cross-field invariants, off/metadata/read visibility across all tool modes, advertised input/output schemas, deterministic domain traversal/order/de-duplication/accounting, explicit scan truncation, UUID-safe resume commands, nested real-handler behavior, metadata-only filtering, one normalized Provider request, Provider exception/drift containment, bounded human text, nested-only Tool Card output, exact protected-Smoke substitutions, and legacy bounded read adjacency. Corrected one test that initially passed vacuously because an undefined constructor was invoked inside `assert.throws`, then reran the true baseline.

**Verification commands:**

- `node --test test/codex-sessions-contract.test.mjs`

**Verification results:** Final deliberate baseline failed 14/14 with exit code 1. Failures correspond to absent Slice 25 behavior: no schema module, no fixed warnings/errors, no query max in the descriptor, no scan constants/accounting, flat handler output, ignored Provider injection, no dedicated Tool Card, and no protected-Smoke compatibility substitutions. No test failed because of environment setup.

**Decisions made:** Keep all acceptance dimensions in one focused file so later GREEN evidence proves the complete slice rather than a cosmetic envelope. Treat the initial vacuous `assert.throws` pass as a test defect and require constructor existence before mutation assertions.

**Risks or limitations:** The suite is intentionally RED. Its Provider-result shape and text marker are executable commitments that implementation must either satisfy or explicitly revise in the approved design before changing tests.

**Rollback method:** Remove the focused test and revert only STEP-225 plan/status entries; production remains unchanged.

**Next step:** Add `src/tools/schemas/codexSessions.ts`, turn only the schema subset GREEN, and run Build before touching domain or handler behavior.

## STEP-226 — Add the Slice 25 exact schema

**Status:** Complete

**Goal:** Implement the public schema-v1 contract independently from filesystem discovery and handler behavior.

**Files changed:**

- `src/tools/schemas/codexSessions.ts`
- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added the exact six-field envelope, eighteen-field data schema, nine-field session record, canonical lowercase UUID and exact resume-command rules, fixed active/archived roots, native absolute source containment, deterministic recency/storage/id/path comparison, unique id/source enforcement, scan/index/exclusion/duplicate accounting, match/return/truncation invariants, two fixed warnings, two safe failures, and pure constructors. Corrected the test fixture so a result-truncated sample fills `max_sessions`, matching the approved slicing semantics.

**Verification commands:**

- `node --test --test-name-pattern="schema exports|schema derives|schema rejects" test/codex-sessions-contract.test.mjs`
- `npm run build`

**Verification results:** Schema-focused tests passed 3/3. TypeScript Build passed.

**Decisions made:** Keep the public scan limits literal at 3000 files and depth 6 in schema version 1. Accept the structural lowercase UUID form used by real existing Codex session ids without imposing version/variant bits that current histories do not consistently encode. Require result truncation to fill the requested return limit.

**Risks or limitations:** Filesystem discovery and handler Provider validation are still unimplemented, so eleven focused tests remain intentionally RED. Native path containment is schema-local and will receive adversarial Windows/symlink review after the usable result exists.

**Rollback method:** Remove the schema module and revert the schema-test fixture plus STEP-226 status entries; no production behavior changed.

**Next step:** Harden `src/codexSessions.ts` for deterministic bounded traversal, UUID-safe metadata, stable de-duplication, and exact accounting, then run its targeted tests and Build.

## STEP-227 — Harden deterministic bounded Codex-session indexing

**Status:** Complete

**Goal:** Make the existing filesystem Provider produce safe deterministic records and exact completeness/accounting facts before wiring it to the public handler.

**Files changed:**

- `src/codexSessions.ts`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Exported the fixed scan limits and configured roots, sorted directory entries, detected omitted candidate entries/subtrees, added internal lower-limit seams for fast boundary tests, restricted/resolved identities to canonical lowercase UUIDs, bounded absolute project/source paths and timestamps, derived active/archive storage, returned explicit nullable metadata, deterministically sorted and de-duplicated ids, and reported scanned/indexed/excluded/duplicate/matched/truncated facts. Read-by-id now reuses the same stable unique index; source-path reads derive storage from the canonical matched root.

**Verification commands:**

- `node --test --test-name-pattern="safely indexes|reports deliberate discovery" test/codex-sessions-contract.test.mjs`
- `npm run build`

**Verification results:** Domain-focused tests passed 2/2 twice. The first Build failed because TypeScript inferred the default `3000 as const` parameter as literal type `3000`; explicit internal `number` annotations corrected the type boundary without changing the public fixed limit. The final Build passed.

**Decisions made:** Count duplicate valid files separately from excluded malformed/subagent files so `scanned = indexed + excluded + duplicate` is exact. Prefer the newest deterministic record for duplicate ids. Permit a safe filename UUID fallback when payload identity is unsafe, but never expose the unsafe payload. Preserve best-effort unreadable-root/file behavior without raw diagnostics.

**Risks or limitations:** Discovery truncation is conservative for an omitted directory at the depth boundary because its contents are intentionally not inspected. Per-file metadata snapshots are not atomic and can race local Codex writes; malformed/racing files are excluded. Public Provider validation and nested error mapping remain unimplemented.

**Rollback method:** Revert the STEP-227 `src/codexSessions.ts` changes and status entries; the legacy flat handler can resume using the prior list interface while the schema file remains unused.

**Next step:** Add the injected Provider context, strict result validation, normalized request, exact handler output schema, and stable failure mapping.

## STEP-228 — Implement the Slice 25 Provider boundary and nested handler

**Status:** Complete

**Goal:** Route direct calls through one independently testable trust boundary and publish only the exact nested index or a fixed safe failure.

**Files changed:**

- `src/server.ts`
- `src/tools/schemas/codexSessions.ts`
- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added a strict injected Provider context/result schema, exact configured directory/root checks, returned-query validation, one-time whitespace/query normalization, bounded `query` advertisement, the exact output schema, nested data construction, fixed operational versus internal failures, and a bounded human summary capped at thirty records. Strengthened the public schema so an unfiltered result must match every indexed session. The handler validates domain results before constructing public output and never exposes raw Provider diagnostics.

**Verification commands:**

- `node --test --test-name-pattern="visibility remains|real handler|normalizes its request|maps Provider|rejects malformed Provider|human text" test/codex-sessions-contract.test.mjs`
- `npm run build`
- `node --test test/codex-sessions-contract.test.mjs`

**Verification results:** Provider/handler subset passed 6/6; Build passed; the complete focused suite reached 12/14. The only remaining failures are the intentionally pending dedicated Tool Card and protected main-Smoke compatibility-loader assertions. Real nested-list to legacy bounded-read adjacency passed.

**Decisions made:** Provider exceptions map to `SESSION_INDEX_FAILED`; any schema, configured identity, query, path, count, order, or extra-field drift maps to `INTERNAL_ERROR`. Keep empty normalized queries as `null` publicly and omit them from the Provider options. Human text shows at most thirty records while structured data stays within the requested maximum of 200.

**Risks or limitations:** The Provider validates returned records against the query but cannot prove the claimed count of omitted matching files without re-scanning independently; the trusted in-process Provider owns discovery while schema/count invariants constrain its public claims. Tool Card and protected-Smoke compatibility are not yet migrated.

**Rollback method:** Revert the handler/import/helper/dependency changes and the unfiltered-count refinement while retaining the domain and schema modules unused by the legacy flat handler.

**Next step:** Add the bounded nested-only `codex_sessions` Tool Card and exact fail-closed main-Smoke in-memory substitutions, then reach focused GREEN.

## STEP-229 — Migrate Slice 25 Tool Card and protected-Smoke consumers

**Status:** Complete

**Goal:** Move every proven in-repository `codex_sessions` consumer to nested data while keeping UI payloads bounded and protected fixture sources unchanged.

**Files changed:**

- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added explicit Tool Card identity/icon/subtitle handling, a nested-only extractor, a twelve-row renderer with bounded id/title/project/resume fields, and exact main-Smoke in-memory replacements for two totals and two session arrays. The first real protected Smoke run exposed a fixture-only conflict: the new exact result intentionally echoes the effective query, while the legacy leak assertion searched the whole envelope for that same string. Added a deliberate RED, then narrowed exactly two transformed assertions to inspect only `data.sessions`, retaining the intended transcript-leak check without hiding the request fact.

**Verification commands:**

- `node --test --test-name-pattern="Tool Card|protected-Smoke" test/codex-sessions-contract.test.mjs`
- `npm run build`
- `node --test test/codex-sessions-contract.test.mjs`
- `node --test --test-name-pattern="protected-Smoke" test/codex-sessions-contract.test.mjs` (deliberate heuristic RED, then GREEN)
- `node scripts/smoke-platform-compat.mjs` (failed on whole-envelope heuristic, then passed)

**Verification results:** Initial consumer subset passed 2/2 and Build passed; the focused suite passed 14/14. The first real Smoke failed only because the protected heuristic matched `data.query="Large tail summary"` while `sessions=[]` and `total_found=0`. The deliberate heuristic test failed 0/1, then passed 1/1 after two exact fail-closed substitutions. Final protected main Smoke passed.

**Decisions made:** Preserve `query` as an exact public request fact. The compatibility layer checks transcript leakage only where transcript-derived metadata could appear: returned session records. Tool Card supports no flat fallback for the migrated tool and never renders the complete raw result.

**Risks or limitations:** The compatibility loader remains coupled to exact protected-source strings and deliberately fails closed on drift. The Widget shows only twelve of up to 200 records; the remaining bounded records stay available in structured data.

**Rollback method:** Revert the `codex_sessions` Tool Card branches and six exact compatibility replacements together; do not edit protected Smoke sources.

**Next step:** Adversarially review the usable Slice 25 result across path/symlink/race/bound/order/advertisement/transcript boundaries and add deliberate RED for every material defect.

## STEP-230 — Review and harden the usable Slice 25 result

**Status:** Complete

**Goal:** Adversarially review the completed metadata index and correct every material boundary defect before running the full local completion gate.

**Files changed:**

- `src/codexSessions.ts`
- `src/server.ts`
- `src/tools/schemas/codexSessions.ts`
- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Reviewed configured-root behavior, symlink containment, Windows path identity, filesystem races, scan bounds, timestamps, duplicate selection, filtering, transcript leakage, text/Card bounds, and advertised/runtime agreement. Six deliberate REDs exposed material defects: locale-sensitive candidate order at the file limit, an unreadable configured root falsely claiming complete discovery, an uncapped project-basename fallback title, path-equivalent but noncanonical Provider identity, unsafe ASCII controls in history-derived titles, and unsafe ASCII controls in normalized queries. The minimal fixes use ordinal comparison, conservative incomplete discovery on non-`ENOENT` root errors, one shared title cap/sanitizer, lexical native-path normalization plus exact Provider identity, and control-to-space normalization before whitespace collapse. Protected Smoke sources remain unchanged.

**Verification commands:**

- targeted four-test hardening subset for ordinal order, unusable roots, fallback-title bounds, and noncanonical Provider identity (deliberate RED, then GREEN)
- `node --test --test-name-pattern="sanitizes control characters|normalizes non-whitespace control characters" test/codex-sessions-contract.test.mjs` (deliberate RED, then GREEN)
- `node --test test/codex-sessions-contract.test.mjs`
- `node --test test/server-config-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/codex-context-contract.test.mjs test/handoff-to-codex-contract.test.mjs`
- `npm run build`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`

**Verification results:** The first four-test hardening baseline failed 0/4 and passed 4/4 after correction. The two control-character tests failed 0/2 with the expected raw-control/query mismatch evidence and passed 2/2 after correction. The final focused suite passed 20/20, the adjacent suite passed 49/49, TypeScript Build passed, and both protected Smoke sources have no diff.

**Decisions made:** Treat non-`ENOENT` root enumeration failures as visible partial discovery rather than silently empty history. Keep configured roots lexical so an explicitly configured Codex directory may itself be a symlink, while discovery never follows child symlink entries and the legacy read surface still canonicalizes a selected source before reading. Require Provider directory/root strings to be exactly the normalized configured identities; path-equivalent spellings are drift, not aliases. No further material issue was found that required expanding the approved contract.

**Risks or limitations:** Metadata parsing remains a bounded non-atomic snapshot of files Codex may be writing; racing or malformed candidates are counted as excluded. The in-process Provider owns the exact count of omitted query matches because independently recomputing that count would duplicate the full scan. `read_codex_session` remains the legacy flat bounded-read tool until Slice 26.

**Rollback method:** Revert only the six hardening changes and their focused tests/status records, restoring the STEP-229 usable result without touching Slices 17–24 or protected Smoke sources.

**Next step:** Run the complete Slice 25 local gate, perform its required `neat-freak` reconciliation, record exact evidence, and continue directly to Slice 26 without staging, committing, pushing, publication, or exact-head CI.

## STEP-231 — Complete and reconcile Slice 25 `codex_sessions`

**Status:** Complete

**Goal:** Pass every local completion gate, reconcile the implementation and durable project knowledge with `neat-freak`, and mark Slice 25 locally complete without publishing the unified batch.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-codex-sessions-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-codex-sessions-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Ran the full local verification matrix after the six-defect hardening and then applied the required per-tool `neat-freak`. Reconciled the design state, completed all plan checkboxes, advanced master/roadmap/instruction/memory next-action records to Slice 26, corrected the design-pair count from twenty-four to twenty-five, and audited all current docs, memory limits, output-schema pairs, required files, protected sources, package contents, empty index, secrets, and exact unpublished-batch scope. Public release documents remain unchanged because Slice 25 neither changes its existing opt-in input surface nor authorizes publication before Slice 28.

**Verification commands:**

- `node --test test/codex-sessions-contract.test.mjs`
- `node --test test/server-config-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/codex-context-contract.test.mjs test/handoff-to-codex-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --cached --exit-code`
- `git diff --check`
- explicit 60-path expected-versus-actual unpublished-scope comparison
- changed-path secret-shape scan
- all-project Markdown relative-link and stateful balanced-fence audit
- exact output-schema spec/plan pair, active-pair `AGENTS.md` reference, required-file, public-doc-diff, memory-size, and archive-size audits

**Verification results:** Focused tests passed 20/20; adjacent optional-session/direct-tool tests passed 49/49; the complete contract regression passed 408/408; TypeScript Build passed; all eight Smoke sections passed; native-Windows Stress passed; the package dry-run contained 151 files, 433,653 compressed bytes, and 2,332,296 unpacked bytes. Both protected Smoke sources are unchanged, the Git index is empty, and the exact scope comparison reported expected 60 and actual 60 with zero missing or unexpected paths. `git diff --check` passed apart from established line-ending warnings. The Markdown audit found 85 Markdown files, 20 relative links, zero broken links, and zero unbalanced fences. All 25 schema design/plan pairs exist; all nine active unpublished pairs are explicitly referenced from `AGENTS.md`. The only secret-shape match is the one intentional fake GitHub-token fixture in `test/handoff-to-agent-contract.test.mjs`. `Memory.md` remained 127 lines and 15,237 bytes before this final record; Volume 8 remained below its rollover threshold.

**Decisions made:** Slice 25 is locally complete, post-result reviewed, per-tool reconciled, and remains unpublished with Slices 17–24. Do not change `README.md`, `README_ZH.md`, `CHANGELOG.md`, `SECURITY.md`, or the FAQs before the unified Slice 17–28 publication. The first output-pair audit incorrectly required every historical published pair to be individually named in the compact `AGENTS.md`; the corrected rule verifies all 25 pairs on disk, the generic published-pair map, and explicit references for the nine active unpublished pairs. A first Markdown-audit invocation also failed because PowerShell removed JavaScript quotes; rerunning the same read-only audit through an in-memory Base64 argument passed without writing a helper file.

**Risks or limitations:** Exact-head Ubuntu/Windows CI remains intentionally deferred until all twelve unpublished tools are jointly published. Session indexing remains a bounded, non-atomic metadata snapshot; legacy transcript output is not migrated until Slice 26. Compatibility loaders remain coupled to exact protected-source strings and fail closed on drift.

**Rollback method:** Revert the Slice 25 schema/domain/handler/Tool Card/compatibility/test/design/plan and STEP-224 through STEP-231 active records while preserving Slices 17–24 and both protected Smoke sources. Do not rewrite closed archive volumes.

**Next step:** Fresh-inventory and design Slice 26 `read_codex_session`, implement it with uninterrupted TDD, run its full local gate and required `neat-freak`, and continue to Slice 27 without staging, committing, pushing, publication, or exact-head CI.

## STEP-232 — Design the direct `read_codex_session` exact contract

**Status:** Complete

**Goal:** Inventory the opt-in transcript reader from first principles and approve an exact safe bounded-read contract before changing production behavior.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-read-codex-session-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Inventoried `src/codexSessions.ts`, conditional handler registration, input/visibility configuration, Slice 25 source-path adjacency, generic Tool Card behavior, redaction timing, protected Smoke transcript consumers, and the master sequencing authority. The approved design defines canonical id/path/both selectors, distinguishes a confirmed missing id from an incomplete bounded-index lookup, revalidates real-path containment, opens/stats one handle and bounds streaming to a fixed 20 MB snapshot, normalizes roles and controls, redacts before UTF-8 capping, returns one safe marked partial message when possible, and exposes an exact twenty-field result with eight-field messages, two warnings, eight failures, and one strict Provider seam. Wrote the seven-task uninterrupted TDD plan.

**Verification commands:**

- repository-wide `rg` inventory for `read_codex_session`, `readCodexSession`, selectors, configuration, Tool Card, protected Smoke, docs, and tests
- complete read of the current resolver, metadata parser, transcript stream, handler, redaction helper, result tagging/compaction, and relevant Smoke fixture
- cross-check against Slice 25 session/root/schema constraints and the authoritative master plan
- design self-review for field counts, selector invariants, warning order, error details, redaction/truncation order, protected-source compatibility, rollback, and phase exclusions

**Verification results:** Confirmed the tool is read-mode-only across all tool modes; existing inputs/defaults are `1..400` messages and `4000..400000` bytes; source paths from Slice 25 are directly consumed; id lookup scans beyond the visible list window but can be incomplete at 3000 files/depth 6; current domain accounting precedes output-layer redaction; one over-budget message is dropped; current path streaming is not handle-size bounded; the generic Tool Card would compact large exact data; protected Smoke reads human transcript text only. The design contains exactly twenty public data fields and eight message fields, and does not expand into process, policy, sandbox, or later-phase work.

**Decisions made:** Preserve the existing explicit transcript opt-in and input limits, but reject ambiguous noncanonical selectors. Redact before capping so published bytes describe published content. Treat bounded-index absence as a distinct non-retryable result that directs the caller to an exact source path. Keep known operational read failures retryable only where a later local retry can plausibly succeed. Preserve the complete requested structured transcript and bound only the Tool Card preview.

**Risks or limitations:** Native realpath plus a handle-bounded snapshot reduces path/growth races but is not an OS-level atomic security boundary. Transcript JSONL may contain malformed or concurrently incomplete lines, which remain ignored. Fixed redaction patterns are defense in depth, not proof that arbitrary secrets cannot exist in free-form history. Exact-head CI remains deferred until unified publication.

**Rollback method:** Remove the Slice 26 design/plan and revert only STEP-232 active status entries; production behavior remains unchanged.

**Next step:** Add the executable Slice 26 acceptance suite, preserve the all-RED baseline, then implement schema, domain, handler, consumers, review, and local completion gates without an intermediate publication stop.

## STEP-233 — Establish the Slice 26 executable RED baseline

**Status:** Complete

**Goal:** Convert the approved transcript-read design into executable acceptance criteria and prove every new behavior is absent before implementation.

**Files changed:**

- `test/read-codex-session-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added sixteen focused tests covering the exact envelope/data/message fields, warnings, all failures, cross-field rejection, off/metadata/read visibility across every tool mode, descriptor bounds, real event ordering, id/path/both selection, request rejection before Provider invocation, confirmed versus incomplete absence, path/symlink containment, id mismatch, fixed source ceiling, normalized roles/controls, redaction-before-byte accounting, Unicode-safe partial messages, exact-limit EOF, message-limit detection, typed Provider failures, malformed Provider drift, bounded human/Card consumers, Slice 25 source-path adjacency, and protected-source assumptions.

**Verification commands:**

- `node --test test/read-codex-session-contract.test.mjs`

**Verification results:** The fresh baseline failed 16/16 with exit code 1. Failures map to the intended missing behavior: absent schema/constants/constructors, no advertised bounds or output schema, legacy domain result shape, flat handler output, ignored Provider injection, untyped missing/path/mismatch/size errors, uncontrolled roles/controls, pre-redaction accounting, whole-message loss at the byte limit, absent truncation causes, no typed operation error, and no dedicated nested Tool Card. Every test executed; no environment, fixture, import-crash, or vacuous-assertion failure occurred.

**Decisions made:** Keep all acceptance dimensions in one focused file and require a real all-RED baseline before adding the schema module. Build test secrets dynamically so static secret-shape audits do not mistake acceptance fixtures for credentials. Use a lower internal scan-limit seam only for deterministic completeness testing; the public fixed Slice 25 limits remain unchanged.

**Risks or limitations:** The suite intentionally remains RED. The Provider result fields, partial-message marker, error details, and Widget caps are now executable commitments. A later review may strengthen them only through another deliberate RED and synchronized design update.

**Rollback method:** Remove the focused test and revert only STEP-233 plan/status entries; production remains unchanged.

**Next step:** Add `src/tools/schemas/readCodexSession.ts`, turn only the schema subset GREEN, and run Build before modifying transcript acquisition.

## STEP-234 — Add the Slice 26 exact schema

**Status:** Complete

**Goal:** Implement the public transcript result independently from filesystem resolution, reading, and handler behavior.

**Files changed:**

- `src/tools/schemas/readCodexSession.ts`
- `test/read-codex-session-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added the exact six-field envelope, twenty-field data schema, eight-field transcript record, Slice 25 nine-field session reuse, canonical native path/root/source containment, selector identity, exact UTF-8 message and aggregate bytes, contiguous ordinals, redaction/truncation counts, final-partial-message rules, output-limited invariants, two ordered warnings, eight safe errors with exact details/retryability, and pure success/failure constructors. Transcript content rejects unsafe controls and known unredacted secret shapes. A schema-test responsibility error initially asserted the future domain constant in the schema subset; the same assertion already exists in the source-ceiling test, so it was removed from only the schema case without weakening coverage.

**Verification commands:**

- `node --test --test-name-pattern="schema exports|schema derives|schema rejects" test/read-codex-session-contract.test.mjs`
- `npm run build`

**Verification results:** The first schema run passed 2/3; only the misplaced domain-constant assertion failed while the schema behavior and Build passed. After correcting test responsibility, schema tests passed 3/3 and TypeScript Build passed.

**Decisions made:** Reuse the strict Slice 25 session record instead of defining a divergent transcript-session identity. Allow tab and LF in transcript bodies but reject NUL, DEL, CR, and other unsafe C0 controls. Reject known secret shapes at the schema boundary in addition to domain redaction. Require message-limit truncation to fill the requested message count without a partial record; only byte-limit truncation may mark the final message partial.

**Risks or limitations:** Zod refinements enforce semantic byte/count/path relationships at runtime but JSON Schema advertisement cannot express every cross-field refinement. Domain acquisition and handler wiring are still absent, so thirteen focused tests remain RED.

**Rollback method:** Remove the schema module and revert the schema-test/status entries; production behavior remains the legacy flat reader.

**Next step:** Harden `src/codexSessions.ts` with typed selector resolution, honest incomplete-index failure, handle-bounded snapshots, control/role normalization, redaction-before-cap, and safe final prefixes, then run domain-focused tests and Build.

## STEP-235 — Harden bounded transcript acquisition

**Status:** Complete

**Goal:** Make the transcript domain produce safe deterministic Provider facts before wiring the exact public handler.

**Files changed:**

- `src/codexSessions.ts`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added the fixed 20 MB source ceiling, typed operation errors, internal scan-limit seams, confirmed-versus-incomplete id resolution, lexical configured-root checks followed by native realpath containment, source/id mismatch detection, and source-path storage identity. The reader now opens and stats one handle, rejects non-files/oversized snapshots, bounds the stream to the captured size, normalizes event kinds and fixed roles, removes unsafe controls, hides function arguments, redacts before counting, caps by exact UTF-8 bytes, and returns a Unicode-safe marked prefix for one final oversized message. Derived byte/redaction/truncation/text compatibility accessors live on an internal prototype so the Provider's own fields remain exact until the handler migration.

**Verification commands:**

- domain-focused seven-test command covering snapshot facts, absence completeness, containment/mismatch, source ceiling, role/control/redaction order, Unicode partial messages, and exact-limit EOF
- `npm run build`
- `node --test test/read-codex-session-contract.test.mjs`

**Verification results:** The first domain run passed 6/7; only the exact-own-field assertion failed because temporary compatibility getters were non-enumerable own properties. Moving those derived getters to an internal prototype corrected the Provider-field boundary. The final domain subset passed 7/7, TypeScript Build passed, and the complete focused file reached 10/16. The six remaining failures are exactly the pending descriptor, request/Provider handler, nested human/Card consumer, and adjacency migrations.

**Decisions made:** A missing id after incomplete fixed discovery returns `SESSION_RESOLUTION_INCOMPLETE`; a file that disappears after successful id indexing becomes retryable `SESSION_READ_FAILED`. Require a source selector to be lexically under its configured root and canonically under the matching real root, preventing alternate aliases and child symlink/junction escapes. Bound concurrent append by streaming only through the handle's captured final offset. Preserve current function-call semantics as a safe tool-name summary without arguments.

**Risks or limitations:** Metadata parsing and the subsequent transcript handle are separate observations, so a same-path replacement between them is not an OS-level atomic transaction. Fixed pattern redaction is defense in depth and cannot prove arbitrary free-form secrets are absent. The handler is still flat and does not yet expose the typed errors or Provider seam.

**Rollback method:** Revert the STEP-235 domain rewrite and status entries while retaining the unused schema/test/design artifacts; the legacy reader and flat handler can resume.

**Next step:** Add one normalized request and injected Provider boundary, advertise the exact schema, construct nested success and stable failures, preserve long structured content, and run handler/provider tests plus Build.

## STEP-236 — Wire the Slice 26 Provider boundary and direct handler

**Status:** Complete

**Goal:** Replace the legacy flat public handler with one normalized, injectable, strictly validated schema-v1 boundary while preserving the configuration gate and bounded transcript acquisition.

**Files changed:**

- `src/server.ts`
- `src/codexSessions.ts`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-8.md`

**Implementation summary:** Added a canonical semantic request with id/path/both selection, fixed defaults, an injectable transcript Provider context, exact Provider-result validation against configuration and request identity, derived public counts, the advertised output schema, long structured-content preservation, a bounded human transcript, and stable nested success/failure construction. Typed domain failures are mapped through exact safe details; unknown Provider exceptions become retryable `SESSION_READ_FAILED`, while malformed or drifting Provider data fails closed as `INTERNAL_ERROR`. A duplicate-module-class failure under the `tsx` test loader was corrected with a non-enumerable `Symbol.for` brand and exported type guard, preserving typed error identity across module instances without trusting arbitrary structural error fields.

**Verification commands:**

- `node --test --test-name-pattern="remains read-opt-in|returns exact request|normalizes id path|maps typed Provider" test/read-codex-session-contract.test.mjs`
- `npm run build`

**Verification results:** The first handler run passed 3/4. The typed-failure case exposed that the Provider test and server held separate `tsx` module instances, so `instanceof` downgraded a valid `SESSION_NOT_FOUND` to `SESSION_READ_FAILED`; this was a code defect, not an environment failure. After adding stable cross-instance branding, the handler/Provider subset passed 4/4 and TypeScript Build passed. The complete focused file now has fourteen implemented cases; only the two pending consumer/adjacency cases remain.

**Decisions made:** Normalize selectors before Provider invocation and reject noncanonical UUIDs or native absolute paths without invoking it. Treat the dependency seam as trusted in-process code but validate every returned public fact independently. Preserve full nested structured content from generic result compaction so the public contract and Tool Card can consume the same bounded transcript. Do not leak unknown exception text or typed-error detail drift.

**Risks or limitations:** The global symbol brand makes duplicate module instances interoperable; trusted in-process code could deliberately forge the brand, but untrusted MCP input cannot reach the dependency seam and exact code/detail validation still applies. The Tool Card and Slice 25 adjacency assertion remain on their legacy consumers until STEP-237.

**Rollback method:** Remove the Provider dependency/context and exact handler helpers, restore the legacy direct reader registration, and revert only STEP-236 documentation while retaining the completed schema/domain work.

**Next step:** Migrate the bounded human/Card and Slice 25 adjacency consumers, prove protected Smoke sources remain unchanged and compatible, then run the consumer subset and Build.

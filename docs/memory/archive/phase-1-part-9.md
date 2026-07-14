# CodexPro Phase 1 Implementation Archive — Volume 9

This append-only volume continues Phase 1 from STEP-237.

Volume 8 (`docs/memory/archive/phase-1-part-8.md`) is closed at STEP-236 after reaching 55,266 bytes, above the 52,428-byte rollover threshold. Do not rename, repartition, or silently rewrite the closed volume. Append any later correction here as a new entry.

## STEP-237 — Migrate bounded Slice 26 consumers

**Status:** Complete

**Goal:** Complete the usable public result by rendering only the nested transcript contract, migrating the Slice 25 adjacency consumer, and proving the protected Smoke source requires no edit.

**Files changed:**

- `src/toolCardWidget.ts`
- `test/read-codex-session-contract.test.mjs`
- `test/codex-sessions-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Added the dedicated transcript title, icon, subtitle, nested-only extractor, failure view, bounded summary, and renderer. The card exposes at most eight messages and truncates each visible body to 600 characters while preserving every bounded record in structured data. Migrated the Slice 25 source-path adjacency assertion from the legacy flat result to `structuredContent.data`. The protected main Smoke already consumes only human transcript text, so no compatibility source or protected source change was needed.

**Verification commands:**

- `node --test --test-name-pattern="human text and Tool Card|nests Slice 25 source-path adjacency" test/read-codex-session-contract.test.mjs`
- `node --test test/read-codex-session-contract.test.mjs`
- `npm run build`
- `node scripts/smoke-platform-compat.mjs`
- `git diff --numstat -- scripts/smoke.mjs scripts/http-smoke.mjs`

**Verification results:** The first consumer case passed immediately. The adjacency case exposed two incorrect test baselines: the unchanged protected main source contains nine exact tool-name occurrences rather than six, and the substring `.structuredContent.session` also matched two legitimate Slice 25 `.sessions` accesses. Each was replaced with an exact verified assertion rather than relaxed matching. The final consumer subset passed 2/2, the complete focused suite passed 16/16, TypeScript Build passed, and the protected main Smoke compatibility loader passed. Both protected Smoke sources have zero diff.

**Decisions made:** Keep the transcript card nested-only because Slice 26 has no compatibility obligation for its pre-schema flat result. Preserve full structured transcript data and cap only visible card previews. Treat exact protected-source counts as immutable baselines, but make tokens specific enough not to collide with adjacent plural fields.

**Risks or limitations:** The card intentionally displays only eight 600-character previews and is not a full transcript viewer. Human transcript text remains bounded by the public request limits but may be much larger than the card. The source-path adjacency depends on Slice 25 returning canonical paths under the same configured history roots.

**Rollback method:** Remove the dedicated transcript card/helper/dispatch, restore the Slice 25 test's legacy flat assertions only together with the legacy handler, and revert STEP-237 documentation. No protected source requires rollback.

**Next step:** Review the completed Slice 26 result adversarially, add deliberate RED tests for every material defect found, apply the smallest corrections, and rerun focused plus adjacent gates.

## STEP-238 — Harden the completed Slice 26 result

**Status:** Complete

**Goal:** Attack the usable transcript result for source-identity, rendering, truncation-provenance, and post-schema redaction drift before running full local gates.

**Files changed:**

- `src/codexSessions.ts`
- `src/server.ts`
- `src/tools/schemas/readCodexSession.ts`
- `test/read-codex-session-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-read-codex-session-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Added four deliberate hardening tests after reviewing Windows path semantics, configured-root/child symlinks, replacement and append races, malformed/large files, exact-limit EOF, Unicode/controls, redaction expansion, Provider identity/count drift, human/Card caps, and advertised/runtime agreement. The fixes now constrain message timestamps to the JavaScript Date range used by the human renderer, require every partial message to end with the shared fixed marker, reject any conflicting session identity encountered inside the opened file snapshot, and reject known secret shapes across all Provider facts before generic result redaction can silently rewrite an already-validated identity field.

**Verification commands:**

- `node --test --test-name-pattern="hardening" test/read-codex-session-contract.test.mjs`
- `node --test test/read-codex-session-contract.test.mjs`
- `node --test test/codex-sessions-contract.test.mjs test/read-codex-session-contract.test.mjs`
- `npm run build`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`

**Verification results:** The deliberate baseline failed 4/4 for the intended defects: schema accepted an out-of-Date-range timestamp and an unmarked partial message, domain accepted a conflicting second session identity, and the handler returned success after generic redaction changed a secret-shaped title. After the smallest corrections, the hardening subset passed 4/4, focused Slice 26 passed 20/20, adjacent Slice 25–26 passed 40/40, TypeScript Build passed, and both protected Smoke sources remained byte-for-byte unchanged in Git diff.

**Decisions made:** The public timestamp range must match the renderer's actual `Date` capability, not the wider JavaScript safe-integer range. A partial flag is provenance and therefore requires its visible fixed marker. Snapshot identity checks inspect every encountered session metadata record until output limits stop acquisition. Known secret shapes in metadata fail closed as `INTERNAL_ERROR`; they are not silently replaced after schema validation because that would make returned identity facts untrustworthy.

**Risks or limitations:** Metadata discovery and the later opened handle remain separate observations, so a replacement that preserves the same session id cannot be proven absent without a stronger transaction/sandbox primitive. Pattern redaction cannot recognize arbitrary free-form secrets. Snapshot identity checks only cover records actually streamed before a requested output limit terminates acquisition.

**Rollback method:** Revert the four focused tests and their minimal schema/domain/Provider checks together, restore the domain-local truncation marker, and revert STEP-238 documentation. Do not weaken the earlier containment, snapshot-size, or output-budget controls.

**Next step:** Run every Slice 26 local gate, perform the required per-tool `neat-freak` reconciliation, record exact final evidence, and continue directly to Slice 27 without publication actions.

## STEP-239 — Complete Slice 26 local gates and reconciliation

**Status:** Complete

**Goal:** Close the direct `read_codex_session` slice with fresh complete local evidence, exact unpublished-scope and documentation audits, and the required per-tool knowledge reconciliation before starting Slice 27.

**Files changed:**

- `docs/superpowers/plans/2026-07-13-read-codex-session-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** No production or test behavior changed. Completed every final Slice 26 gate, replaced the stale expected complete-regression count with the observed 428-test total, reconciled the design/plan/master/roadmap/rules/memory/archive state, and preserved the unified unpublished Slice 17–28 batch boundary.

**Verification commands:**

- `node --test test/read-codex-session-contract.test.mjs`
- `node --test test/codex-sessions-contract.test.mjs test/read-codex-session-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run`
- protected-source reviews for `scripts/smoke.mjs` and `scripts/http-smoke.mjs`
- staged-change review through `show_changes`
- exact 65-path expected-versus-actual unpublished-scope audit
- rule-aware changed-path whitespace and secret-shape audit
- all-project Markdown relative-link, balanced-fence, exact schema-pair, active-reference, required-file, and size audit

**Verification results:** Focused Slice 26 passed 20/20; adjacent Slice 25–26 passed 40/40; complete regression passed 428/428; TypeScript Build passed; all eight Smoke sections passed; native-Windows Stress passed; package dry-run contained 153 files, 445.6 kB compressed and 2.4 MB unpacked. Both protected Smoke sources remained unchanged. The staged diff was empty. Exact unpublished scope reported expected 65 and actual 65 with zero missing or unexpected paths. The rule-aware audit found no suspicious whitespace and no unexpected secret shape; the only match was the intentional fake GitHub-token fixture at `test/handoff-to-agent-contract.test.mjs:365`. The documentation audit found 88 Markdown files, 21 relative links, zero broken links, zero unbalanced fences, 26 design/plan pairs, and no missing active references or required files. Before this entry, `AGENTS.md` was 205 lines/14,963 bytes, `Memory.md` was 131 lines/15,881 bytes, and Volume 9 was 84 lines/7,443 bytes.

Two initial in-memory Markdown-audit invocations failed before performing checks because of a Windows/JavaScript backslash escape and then an invalid regular expression. A first generic trailing-whitespace audit also treated intentional two-space Markdown hard breaks as defects. None wrote files. The corrected equivalent in-memory audits passed and distinguished legitimate Markdown formatting from actual whitespace defects.

**Decisions made:** Treat 428 as the authoritative complete-regression count for the final Slice 26 state; the prior 412 estimate was stale. Keep the intentional secret fixture because it proves failure redaction. Do not edit public release documentation, stage, commit, push, publish, or run exact-head CI until Slice 28 completes. Use rule-aware static checks rather than weakening or deleting intentional Markdown hard breaks.

**Risks or limitations:** Exact-head Ubuntu/Windows CI remains intentionally deferred. Metadata discovery and the later opened transcript handle remain separate observations, fixed-pattern redaction cannot prove arbitrary free-form secrets absent, and compatibility loaders remain coupled to exact protected-source strings. The failed audit invocations demonstrate that ad hoc encoded checks are easy to mistype; their corrected outputs, not the failed invocations, are the completion evidence.

**Rollback method:** Revert only the STEP-239 plan/master/roadmap/AGENTS/Memory/archive reconciliation. Do not revert the already verified Slice 26 implementation, tests, or earlier append-only archive entries.

**Next step:** Inventory and design Slice 27 `codexpro_self_test`, then write its uninterrupted TDD plan without staging, committing, pushing, publication, or exact-head CI.

## STEP-240 — Design the Slice 27 self-test contract

**Status:** Complete

**Goal:** Inventory the real aggregate self-test boundary and define an exact executable schema-v1 design plus uninterrupted TDD plan before changing production behavior.

**Files changed:**

- `docs/superpowers/specs/2026-07-14-codexpro-self-test-output-schema-design.md`
- `docs/superpowers/plans/2026-07-14-codexpro-self-test-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Inventoried the live six-input self-test, its twelve fixed semantic checks, default and complete-probe results, fixed `.ai-bridge/codexpro-self-test.md` write/edit artifact, mode-dependent expected/registered tool-set consumers, Slice 17 inventory dependency, Slice 22 selected-only Pro-context dependency, dedicated Tool Card, protected main Smoke consumers, native Stress consumer, and Slice 28 supertool boundary. Chose structured Provider facts with handler-derived checks instead of nesting the legacy opaque flat object. The exact design uses a six-field envelope, twenty-one success-data fields, twelve ordered checks with explicit pass/warn/fail/skipped outcomes, three stable operational failures, independently observed tool sets, and fixed safe messages. Wrote the seven-task RED-first implementation plan.

**Verification commands and evidence:**

- live `codexpro_self_test` with all optional probes disabled and global discovery disabled
- live `codexpro_self_test` with write, Bash, Pro-context, and bounded global-Skill probes enabled
- live unknown-workspace failure probe
- targeted repository searches for self-test implementation surfaces and consumers
- bounded reads of Tool Card, protected Smoke, native Stress, compatibility loader, common schema, inventory schema, changelog, and generated probe artifact
- placeholder scan over the new design/plan pair
- all-project Markdown link/fence/spec-plan/reference/size audit

**Verification results:** The disabled-probe live run produced a coherent 12-check warning result with 7 pass, 5 warning, and 0 failure records. The complete-probe live run produced 8 pass, 4 warning, and 0 failure records and touched only `.ai-bridge/codexpro-self-test.md`. The unknown workspace currently throws a raw legacy `CodexProError`, confirming the stable failure migration requirement. The specification audit found no placeholder markers. The final documentation audit found 91 Markdown files, 21 relative links, zero broken links, zero unbalanced fences, 27 output-schema designs, 27 matching plans, no missing pair, and all required Slice 27 references present. The new design is 735 lines/21,816 bytes and the plan is 97 lines/6,520 bytes. Before this entry, `AGENTS.md` was 206 lines/15,301 bytes, `Memory.md` was 133 lines/16,321 bytes, and Volume 9 was 128 lines/11,745 bytes.

**Decisions made:** A completed diagnostic with failed checks remains `ok: true` and reports `data.status = "fail"`; only inability to produce a trustworthy diagnostic uses `ok: false`. The handler, not the Provider, owns public check order, status, counts, messages, and warnings. Optional unperformed probes use a distinct `skipped` outcome. Expected and registered tools must be independent observations with exact missing/unexpected derivation. The write/edit probe may touch only the recognized fixed context artifact and must not overwrite unrelated content. Full Bash is a supported cautionary warning; the actual Bash session identifier is not public. Protected Smoke sources remain unchanged and migrate through exact fail-closed compatibility substitutions.

**Risks or limitations:** The current direct-read/search limit prevents semantic inspection of the 298,329-byte `src/server.ts`; the design therefore relies on live runtime output, all readable dependency/consumer surfaces, and existing exact-contract patterns. Implementation must establish its acceptance RED before editing that large registration file and must validate runtime agreement rather than assuming undocumented internals. The current probe artifact includes a workspace root and timestamp; the design intentionally removes unnecessary environment data from the future owned scaffold. No production behavior changed in this step.

**Rollback method:** Delete only the new Slice 27 design and plan, then revert the STEP-240 master/roadmap/AGENTS/Memory/archive references. Do not alter the completed Slice 26 implementation or closure evidence.

**Next step:** Execute Task 1 of the approved Slice 27 plan by creating the complete executable acceptance contract and preserving its deliberate all-RED baseline. Do not stage, commit, push, publish, or run exact-head CI.

## STEP-241 — Implement Slice 27 before the user-reserved neat-freak

**Status:** Complete through every non-`neat-freak` local gate

**Goal:** Replace the direct flat `codexpro_self_test` result with the exact Slice 27 schema-v1 diagnostic contract, migrate maintained consumers without editing protected Smoke sources, harden the fixed write probe, and stop immediately before the per-tool `neat-freak` reserved by the user.

**Files changed:**

- `src/tools/schemas/codexproSelfTest.ts`
- `src/selfTestOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/stress.mjs`
- `test/codexpro-self-test-contract.test.mjs`
- generated `dist/` counterparts produced by Build
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Added the strict six-field envelope, twenty-one-field data contract, fixed twelve-check order, four diagnostic outcomes, three stable operational failures, ordered warning derivation, exact tool-set differences, bounded inventory/Git facts, fixed terms boundary, and pure constructors. Added one injectable facts-only Provider and handler-owned public check derivation. The write/edit probe is limited to `.ai-bridge/codexpro-self-test.md`, refuses unrelated content, verifies raw bytes through the path guard, and safely migrates only the exact recognized legacy scaffold. Provider identity, independent tool observations, canonical roots, request/mode/session/auth facts, truncation counts, status/reason-code combinations, fixed paths, check-code combinations, and terms constants all fail closed. The dedicated Tool Card is nested-only and failure-aware. Protected Smoke migration remains exact-count and in-memory; native Windows Stress consumes nested data.

**Deliberate RED and defects fixed:** The initial executable baseline produced one pass and twelve expected failures before implementation. A production-path RED exposed that `readTextFile` returns line-numbered display text rather than raw file bytes; the probe now performs a guarded raw reread. A second RED established strict migration of the recognized legacy timestamp/root scaffold while preserving conflict protection for arbitrary content. Final semantic REDs rejected impossible public check status/code pairs and Provider combinations such as pass-plus-truncated inventory, pass-plus-conflict write probes, and pass-plus-full-Bash warnings. The first post-fix Smoke rerun still used stale `dist`; rebuilding proved this was build-state drift rather than another source defect.

**Verification commands and exact results:**

- `node --test test/codexpro-self-test-contract.test.mjs` — final focused result 15/15 pass.
- `node --test test/codexpro-inventory-contract.test.mjs test/export-pro-context-contract.test.mjs test/server-config-contract.test.mjs test/bash-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/load-skill-contract.test.mjs test/show-changes-contract.test.mjs` — adjacent result 104/104 pass.
- `node --test test/*.test.mjs` — final complete result 443/443 pass.
- `npm run build` — pass.
- `npm run smoke` — all eight sections pass: analysis, analysis CLI, protected main Smoke through compatibility, HTTP Smoke through compatibility, Pro CLI, Doctor, Settings, and execute/watch/loop handoff.
- `npm run stress` — native Windows Stress pass after its internal Build.
- `npm pack --dry-run` — pass; 157 files, approximately 458.2 kB packed and 2.5 MB unpacked; new `selfTestOps` and `codexproSelfTest` build artifacts included.
- targeted static searches — no public `bash_session_id`, stdout/stderr, raw exception, command output, Skill-name, or MCP-server-name fields in the new Provider/schema surfaces; the inventory MCP truncation ceiling remains the existing fixed 120.

**Decisions made:** Keep diagnostic check failures as `ok: true` with `data.status = "fail"`; reserve `ok: false` for an untrusted or incomplete execution. Treat the handler as the sole owner of public checks and warnings. Validate semantic combinations rather than accepting shape-only Provider facts. Preserve existing protected Smoke files and the Slice 28 supertool boundary. Stop before `neat-freak` exactly as requested; do not begin Slice 28 or any publication operation.

**Risks or limitations:** The write/edit probe remains a non-transactional write followed by edit, but both recognized before/after scaffolds are retry-safe and unrelated content is never overwritten. Git-state classification still depends on the existing bounded `gitStatus` text contract. The running CodexPro MCP process must be restarted before this newly built server contract replaces the already loaded plugin implementation. Exact-head Ubuntu/Windows CI remains intentionally deferred until the unified Slice 17–28 publication.

**Rollback method:** Revert the Slice 27 source/schema/test/consumer changes and their generated `dist/` counterparts, then revert only this STEP-241 Memory/archive record. Leave the STEP-240 design/plan and all completed Slice 17–26 work intact. The fixed probe artifact may be left in its recognized managed scaffold or removed independently because it is not source code.

**Next step:** The user runs the per-tool `neat-freak` for Slice 27. After that reconciliation passes, begin Slice 28 `codexpro` supertool implementation without staging, committing, pushing, publication, or exact-head CI.

## STEP-242 — Reconcile and close Slice 27 locally

**Status:** Complete

**Goal:** Run the required per-tool `neat-freak` after the verified Slice 27 implementation, reconcile every active knowledge layer with the code and evidence, audit project rules and documentation integrity, and make Slice 28 the exact next action without any publication operation.

**Files changed:**

- `docs/superpowers/plans/2026-07-14-codexpro-self-test-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Marked all 53 Slice 27 plan acceptance items complete and corrected the tool-list task wording to match the implemented fail-closed sorted/unique validation rather than implying silent deduplication. Updated the authoritative master status, historical roadmap status note, documentation map, current stopping point, active decisions, verification evidence, limitation wording, open item, and recent summaries. Confirmed that README and CHANGELOG already describe the existing self-test accurately and should not receive unpublished internal schema details. No source, protected Smoke, public release, credential, staging, commit, push, or exact-head-CI state was changed.

**Verification commands and exact results:**

- targeted stale-state searches — no active authority still says Slice 27 acceptance RED or `neat-freak` is pending; the remaining Slices 17–26 line is the intentional historical Slice 26 checkpoint inside the master plan.
- Slice 27 plan placeholder scan — zero unchecked boxes, TODO, TBD, FIXME, or stale RED-next markers.
- rule-aware Markdown audit — 91 Markdown files, 21 relative links, zero broken links, zero unbalanced fences, zero invalid trailing whitespace, 27 output-schema designs, 27 matching plans, and zero missing pairs.
- the first audit invocation failed before inspection because shell command substitution interpreted Markdown backticks inside a double-quoted `node -e` command; no file changed. The corrected single-quoted invocation passed. A raw whitespace pass also identified 80 intentional two-space Markdown hard breaks, which were preserved under the existing project rule instead of being stripped.
- `node --test test/*.test.mjs` — 443/443 pass, zero failures, skips, cancellations, or todos.
- `npm run build` — pass.
- before this entry, `AGENTS.md` was 206 lines/15,333 bytes, `Memory.md` was 136 lines/17,270 bytes, and active Volume 9 was 208 lines/22,007 bytes. All remain below their hard limits; Volume 9 remains far below the 144,000-byte rotation threshold derived from the configured 180,000-byte direct-read limit.

**Decisions made:** Keep `AGENTS.md` as the project rule authority and do not create or require `CLAUDE.md`. Preserve exact historical next-step statements inside append-only archives while updating only active authority layers. Treat two-space Markdown hard breaks as intentional formatting, not generic trailing-whitespace defects. Keep Slice 27 unpublished inside the unified Slice 17–28 batch and make Slice 28 `codexpro` fresh inventory/design review the next action.

**Risks or limitations:** The global Codex instruction file outside the allowed workspace was not directly readable through this connector; current system/developer instructions and the project-root `AGENTS.md` governed this reconciliation. The active archive continues to grow but is well below its rotation threshold. Runtime Slice 27 limitations remain those recorded in STEP-241, including non-transactional probe writes and string-coupled Git-state classification.

**Rollback method:** Revert only the six STEP-242 documentation and memory edits listed above. Do not revert the verified Slice 27 implementation, STEP-240 design, STEP-241 implementation evidence, or any Slice 17–26 work.

**Next step:** Fresh-inventory and design Slice 28 `codexpro`, then implement and verify it without staging, committing, pushing, publication, or exact-head CI until the complete unified Slice 17–28 batch reaches its approved publication gate.

## STEP-243 — Design Slice 28 `codexpro` exact wrapper contract

**Status:** Complete

**Goal:** Inventory the final Phase 1 advertised tool, choose the smallest exact contract that cannot widen child capabilities, and write an executable TDD plan without opening Policy Kernel or publication work.

**Files changed:**

- `docs/superpowers/specs/2026-07-14-codexpro-output-schema-design.md`
- `docs/superpowers/plans/2026-07-14-codexpro-output-schema.md`
- `test/codexpro-contract.test.mjs`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Approved Approach C: wrapper-owned `list_actions` and routing failures use the normal six-field `codexpro` envelope, while successful or failed child calls preserve the exact child envelope and add only `codexpro_super_action` plus canonical `wrapped_tool`. Fixed the closed domain at 27 child tools and eight existing aliases. Required one live enabled registration map as the authority for `tools/list`, `list_actions`, canonical dispatch, and alias dispatch. Defined four stable redacted wrapper failures, exact child input/output revalidation, preserved child `content` and `isError`, dedicated wrapper-owned Tool Card rendering, protected-Smoke compatibility, native-Windows Stress coverage, and no Phase 2 behavior.

**Verification commands and exact results:**

- `node --test test/codexpro-contract.test.mjs` — initial executable baseline produced the expected missing-schema/runtime/consumer failures.
- schema-only checkpoint — 5/5 pure contract tests and Build passed before server migration.
- inventory confirmed that Phase 1 has 28 advertised tools total, so the non-recursive wrapper child set is exactly 27 rather than 28.

**Decisions made:** Preserve the actual requested canonical action or alias in `codexpro_super_action`; preserve the canonical direct tool in `wrapped_tool`. Keep aliases out of `list_actions` because aliases are names, not additional capabilities. Unknown, disabled, and recursive requests share `ACTION_NOT_AVAILABLE` so the wrapper does not create a second capability-probing surface. Do not add an outer `data.result` layer because that would require a versioned migration of every existing supertool consumer.

**Risks or limitations:** The closed child-schema map must be updated when a future phase intentionally advertises a new direct tool. The runtime upgrade depends on the MCP SDK's registered-tool entry shape and is therefore isolated in one module with focused tests. This slice does not provide policy, approval, sandbox, workspace-ownership, or authentication guarantees beyond those already enforced by registered direct tools.

**Rollback method:** Remove the new design, plan, and focused baseline test only. No production source or publication state existed at this design checkpoint.

**Next step:** Execute the seven-task RED/GREEN plan continuously, run per-tool `neat-freak`, and stop before staging, commit, push, publication, or exact-head CI.

## STEP-244 — Implement, harden, verify, and reconcile Slice 28

**Status:** Complete locally; unpublished

**Goal:** Complete the final Phase 1 exact output-contract slice, prove that the wrapper cannot bypass effective registration or damage any child contract, reconcile all active knowledge layers, and stop at the unified Slice 17–28 publication boundary.

**Files changed:**

- `src/tools/schemas/codexpro.ts`
- `src/codexproSupertool.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/stress-contract-compat.mjs`
- `package.json`
- `test/codexpro-contract.test.mjs`
- alias expectation updates in `test/codexpro-inventory-contract.test.mjs`, `test/export-pro-context-contract.test.mjs`, `test/handoff-to-agent-contract.test.mjs`, `test/handoff-to-codex-contract.test.mjs`, `test/open-current-workspace-contract.test.mjs`, `test/show-changes-contract.test.mjs`, `test/wait-for-handoff-contract.test.mjs`, and `test/workspace-snapshot-contract.test.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-14-codexpro-output-schema-design.md`
- `docs/superpowers/plans/2026-07-14-codexpro-output-schema.md`
- `docs/memory/archive/phase-1-part-9.md`
- generated `dist/` counterparts produced by Build

**Implementation summary:** Added the exact wrapper schema, frozen canonical tool and alias sets, sorted/unique action inventory, safe action normalization, four stable failures, child-schema map, and exact wrapper constructors. Added one isolated runtime upgrader that replaces only the registered `codexpro` descriptor and handler after all direct tools are registered. The handler derives availability from the live enabled registration map, validates target input, invokes only the registered target handler, validates the exact child structured result, preserves child `content` and `isError`, and adds only the two wrapper identity fields. The connection-test surface safely no-ops because it intentionally omits the supertool. Added a bounded wrapper-owned Tool Card. Kept protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` unchanged by using exact count-locked in-memory compatibility substitutions. Because the native Stress source contains intentional secret-shape fixtures that correctly trigger full-file edit protection, added a count-locked in-memory Stress compatibility entry and pointed `npm run stress` to it instead of weakening protection.

**Deliberate RED and defects fixed:** The initial RED covered missing schema, descriptor, runtime, aliases, stable failures, Tool Card, protected compatibility, and Stress. A focused comparison initially treated separate direct/wrapped `durationMs` observations as equal; the test was corrected to compare stable semantics while independently validating both nonnegative durations. HTTP debugging proved that the connection-test profile intentionally has no `codexpro` registration; the upgrader now safely skips absence while still rejecting a corrupt present registration. A deliberate RED proved that an SDK entry with `enabled=false` was incorrectly listed; live action inventory now excludes it. A final hardening RED proved dispatch still delegated through the legacy wrapper rather than invoking the selected registered child directly; dispatch now calls only the live target handler and remains covered by a dedicated regression. The adjacent suite exposed eight historical alias tests that expected a canonical action in `codexpro_super_action`; they now correctly assert the requested alias while retaining canonical `wrapped_tool`. The first Stress compatibility anchor was line-ending-sensitive; it was replaced by three independent exact single-line, count-locked substitutions.

**Verification commands and exact results:**

- `node --test test/codexpro-contract.test.mjs` — focused 13/13 pass.
- `node --test test/server-config-contract.test.mjs test/codexpro-self-test-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/codex-sessions-contract.test.mjs test/read-codex-session-contract.test.mjs test/codexpro-contract.test.mjs` — adjacent aggregation 87/87 pass.
- `node --test test/*.test.mjs` — complete regression 456/456 pass, zero failures, skips, cancellations, or todos.
- `npm run build` — pass.
- `npm run smoke` — all eight sections pass: analysis, analysis CLI, protected main Smoke through compatibility, HTTP Smoke through compatibility, Pro CLI, Doctor, Settings, and execute/watch/loop handoff.
- `npm run stress` — native Windows Stress pass through the exact in-memory compatibility entry.
- `npm pack --dry-run` — pass; 162 files, approximately 465.3 kB packed and 2.5 MB unpacked; new runtime/schema/compatibility build artifacts included; no archive remained in the workspace root.
- `git diff --check` — pass; only expected Windows LF-to-CRLF worktree warnings were emitted.
- targeted credential-shape searches across the new runtime, schema, test, and Stress compatibility files — no token, private-key, Bearer-secret, or credential URL shapes found.
- root tree inspection — no generated `.tgz` or unrelated artifact.
- `neat-freak` audit — `Memory.md` was reduced from 140 lines/18,899 bytes to 136 lines/17,666 bytes by graduating old Slice 23–27 evidence; `AGENTS.md` was reduced from 207 lines/15,728 bytes to 196 lines/12,187 bytes by replacing per-slice changelog detail with one authoritative pointer; the Markdown audit then found and fixed one missing closing code fence in the Slice 28 specification.

**Decisions made:** Treat the live enabled registered-tool map as the only availability authority. Keep wrapper input/output validation duplicated at the protocol boundary rather than trusting the legacy wrapper or weakening child schemas. Preserve exact aliases but do not list aliases as capabilities. Keep the Stress compatibility transformation fail-closed and in memory because bypassing the repository's secret-content protection would be a security regression. Mark Phase 1 implementation locally complete while leaving exact-head CI and archive closure open until publication.

**Risks or limitations:** The runtime upgrade uses the MCP SDK's internal `_registeredTools` entry shape; focused tests and all local gates lock the current SDK behavior, but a future SDK upgrade must revalidate this seam. The closed child map must be updated with any newly advertised direct tool. Compatibility loaders intentionally fail closed when protected source text drifts. Exact-head Ubuntu/Windows Node 20/24 CI, publication, and formal Phase 1 archive closure remain unperformed.

**Rollback method:** Before publication, revert the Slice 28 source/schema/test/compatibility/package/document edits and generated `dist/` outputs while leaving Slices 17–27 intact. After publication, use an ordinary revert of the Slice 28/unified implementation commit; do not reset or rewrite `main`, weaken secret protection, or restore prior security defects.

**Next step:** Run the conditionally approved unified Slice 17–28 stage/commit/push sequence, verify exact-head Ubuntu/Windows Node 20/24 CI, append the publication/closure record, close Phase 1, then perform the design-only Policy Kernel gate before any Phase 2 production behavior.

## STEP-245 — Correct and finalize Slice 28 direct-dispatch evidence

**Status:** Complete locally; unpublished

**Goal:** Correct the append-only Slice 28 evidence after a final first-principles review found that the post-registration adapter still delegated through the legacy supertool handler instead of invoking the selected registered target handler directly.

**Files changed:**

- `src/codexproSupertool.ts`
- `test/codexpro-contract.test.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-14-codexpro-output-schema-design.md`
- `docs/superpowers/plans/2026-07-14-codexpro-output-schema.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Added one deliberate regression proving that dispatch must call the live registered target handler and must not retain the legacy `codexpro` wrapper as a second router. The RED result observed one legacy-wrapper call and zero target-handler calls. The minimal fix removed the captured legacy handler and invokes `target.handler(parsedArgs.data, extra)` after exact target-input validation. Child output is still validated through its exact schema, then wrapped with only `codexpro_super_action` and canonical `wrapped_tool`; child `content` and `isError` remain unchanged. Reconciled the spec, plan, changelog, master route, project rules, and memory with the actual adapter and Stress compatibility architecture.

**Verification commands:**

- `node --test --test-name-pattern="registered target handler" test/codexpro-contract.test.mjs`
- `node --test test/codexpro-contract.test.mjs`
- `node --test test/codexpro-contract.test.mjs test/server-config-contract.test.mjs test/codexpro-self-test-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/codex-sessions-contract.test.mjs test/read-codex-session-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run`
- `git diff --check`
- targeted secret-shape and active-document stale-count searches

**Verification results:** The new regression first failed 0/1 for the intended routing defect, then passed 1/1 after the minimal fix. Final focused Slice 28 passed 13/13; adjacent aggregation passed 87/87; complete regression passed 456/456; TypeScript Build passed; all eight Smoke sections passed; native-Windows Stress passed through the exact in-memory compatibility loader; package dry-run contained 162 files, approximately 465.3 kB packed and 2.5 MB unpacked. `git diff --check` passed with only expected Windows LF-to-CRLF warnings. Secret-shape review found only pre-existing intentional redaction patterns and test fixtures, not a Slice 28 credential leak. The prior STEP-244 counts of 12/12, 86/86, and 455/455 remain historical pre-correction evidence and are superseded by this append-only entry.

**Decisions made:** The live enabled registration map is both the availability source and the dispatch source. Alias resolution may select only a currently registered canonical target. The wrapper validates protocol boundaries but does not implement a parallel domain router. Keep protected Smoke and Stress baselines unchanged on disk and migrate them only through exact count-locked in-memory compatibility loaders. Phase 1 is locally complete but not published.

**Risks or limitations:** The adapter still depends on the MCP SDK's private `_registeredTools` shape; a future SDK upgrade must revalidate this seam. Compatibility loaders intentionally fail closed on protected-source drift. Exact-head Ubuntu/Windows Node 20/24 CI, unified publication, and formal Phase 1 archive closure remain unperformed.

**Rollback method:** Revert the STEP-245 test and direct-dispatch fix together, then revert only the active documentation reconciliations. Do not rewrite STEP-244, reset `main`, weaken secret protection, or revert completed Slices 17–27.

**Next step:** Stop at the approved boundary. The next authorized operation is the unified Slice 17–28 stage/commit/push/exact-head-CI publication sequence; it remains unperformed in this task.

## STEP-246 — Repair Windows exact-head CI portability

**Status:** Complete locally; replacement exact-head run pending

**Goal:** Publish the unified Slice 17–28 implementation, diagnose the first exact-head CI failure without weakening protected-source checks, and make the assertions portable across Git checkout line endings.

**Files changed:**

- `test/codex-context-contract.test.mjs`
- `test/export-pro-context-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-9.md`

**Implementation summary:** Staged and committed the approved 81-file Slice 17–28 batch as `021ab90` (`Complete Phase 1 exact tool contracts`) and pushed it to remote `main`. Exact-head CI run `29314051423` matched full SHA `021ab90606ecd4c81266ed7c72bd73a6944a198f`: Ubuntu Node 20 and Node 24 passed Build, regression, Smoke, and package checks, while both Windows jobs failed only during regression. A clean `core.autocrlf=true` clone reproduced exactly two failures after Build. Both tests counted the expected compatibility tokens correctly but compared a six-line LF string directly with a CRLF checkout of `scripts/smoke-platform-compat.mjs`. The minimal fix normalizes only the inspected compatibility-source line endings before the multiline block check; exact token counts, expected replacement counts, protected-source counts, and fail-closed semantics remain unchanged.

**Verification commands:**

- `node --test test/codex-context-contract.test.mjs test/export-pro-context-contract.test.mjs`
- clean clone with `git clone -c core.autocrlf=true . ci-repro-temp`
- `npm ci` and `npm run build` inside the clean clone
- focused and complete regression inside the CRLF clone
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`

**Verification results:** Main-worktree focused compatibility suites passed 34/34. The CRLF clone first reproduced the intended two failures and then passed focused 34/34 and complete regression 456/456 after the same minimal patch. The temporary clone was deleted. The main worktree then passed complete regression 456/456, TypeScript Build, and all eight Smoke sections. No production source, protected Smoke source, compatibility loader, dependency, or package configuration changed.

**Decisions made:** Treat line-ending representation as checkout metadata rather than contract semantics. Normalize only the source string used by the multiline assertion, not production input or protected fixtures. Preserve exact occurrence and replacement-count checks so source drift still fails closed. Keep Phase 1 open until a replacement exact-head Ubuntu/Windows Node 20/24 run passes.

**Risks or limitations:** The first publication run remains a recorded failure and must not be described as successful. The fix is test-only, but formal Phase 1 closure still requires a new pushed head and a complete four-job exact-head pass.

**Rollback method:** Revert the two test normalizations and this STEP-246 active-memory reconciliation. Do not rewrite the failed run record, reset `main`, or alter protected Smoke sources.

**Next step:** Commit and push the CRLF-neutral test repair, monitor the new exact-head run to completion, then append the formal Phase 1 publication and closure record only if all four matrix jobs pass.

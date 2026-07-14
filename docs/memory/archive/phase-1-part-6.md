# CodexPro Phase 1 Implementation Archive — Volume 6

This append-only volume continues Phase 1 from STEP-194 after Volume 5 crossed the 80% rollover threshold at STEP-193.

Do not rewrite closed earlier volumes. Append corrections as new entries.

## STEP-194 — Verify, reconcile, and close local Slice 19

**Status:** Complete

**Goal:** Run every local Slice 19 completion gate, perform the required per-tool `neat-freak`, and leave the repository ready to begin Slice 20 without an intermediate publication.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1-part-6.md`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/superpowers/specs/2026-07-13-read-handoff-output-schema-design.md`

**Implementation summary:**

- Ran the complete focused, adjacent, repository, build, Smoke, Stress, and package gates against the hardened Slice 19 result.
- Reconciled the authoritative project instructions, concise memory index, master implementation plan, historical roadmap, Slice 19 design, and executed plan to the same locally-complete/unpublished state.
- Closed Phase 1 Volume 5 unchanged after STEP-193 crossed the 48,000-byte rollover threshold and opened this continuation volume at STEP-194.
- Enumerated repository rule files and documentation, checked active references and Markdown structure, and found no project requirement for a `CLAUDE.md` compatibility link.
- Preserved all Slice 17–19 work, the empty Git index, and both protected Smoke sources; no staging, commit, push, external CI, or publication occurred.

**Verification commands:**

- `node --test test/read-handoff-contract.test.mjs`
- `node --test test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- `npm run build`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --check`
- exact changed-path, empty-index, secret-pattern, Markdown link/fence, plan-checkbox, memory-size, and archive-size checks

**Verification results:**

- Focused Slice 19 passed 15/15; adjacent workspace/load-skill contracts passed 66/66; complete Node regression passed 306/306; TypeScript Build passed.
- All eight Smoke sections passed. Native-Windows Stress passed, with the established POSIX-only capability reported as skipped rather than failed.
- Package dry-run passed with 137 entries, 370,887 compressed bytes, and 1,921,420 unpacked bytes; the new compiled schema was included and internal planning documents remained excluded.
- The unified unpublished Slice 17–19 scope contained exactly 26 expected changed paths; the Git index was empty and protected `scripts/smoke.mjs` / `scripts/http-smoke.mjs` had no diff.
- Whitespace checking passed with only established LF-to-CRLF working-copy warnings. Secret-pattern and 64-document Markdown link/fence checks passed.
- Root memory remained within its 150-line and practical 18 KB targets. Closed Volume 5 measured 50,662 bytes; active Volume 6 began below the rollover threshold.

**Decisions made:**

- Slice 19 is locally complete and remains unpublished. Its complete exact-envelope result is the baseline for the remaining nine Slice 20–28 tools.
- Closed archive volumes are not rewritten after rollover; later corrections, if needed, will be appended to the active volume.
- The next action is Slice 20 design and TDD, not a publication checkpoint.

**Risks or limitations:**

- Cross-platform CI has not run for Slice 17–19 because the user-approved publication boundary is after all twelve tools.
- The shared working tree intentionally contains all unpublished Slice 17–19 changes, increasing the importance of exact-scope and protected-source checks after each later tool.
- `read_handoff` remains bounded policy enforcement rather than operating-system sandboxing; that distinction is unchanged.

**Rollback method:**

- Apply a reviewed reverse patch limited to Slice 19 code, tests, compatibility adapters, and documentation, then append a correction here. Do not reset the shared tree or discard Slice 17–18 work.

**Next step:**

- Design, implement with TDD, verify, and `neat-freak` Slice 20 `wait_for_handoff`, continuing without staging, committing, pushing, or external CI publication.

## STEP-195 — Approve direct `wait_for_handoff` exact-contract design

**Status:** Complete

**Goal:** Derive the smallest truthful exact contract for Slice 20 from the live lifecycle writer, direct handler, protected consumers, and security boundaries before changing runtime behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/memory/archive/phase-1-part-6.md`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/superpowers/specs/2026-07-13-wait-for-handoff-output-schema-design.md`

**Implementation summary:**

- Audited the existing poll loop, state writer, main Smoke, Stress, supertool alias, Tool Card routing, mode tables, handoff domain reader, and exact-envelope patterns from Slice 19.
- Froze a strict six-field envelope with thirty exact data fields that separate the observed canonical run from the outcome of this wait request while retaining nested compatibility meanings.
- Defined a version-1 lifecycle schema and distinct public outcomes for missing, invalid, unreadable, running, hash-mismatched, iteration-stale, completed, failed, and timed-out state.
- Rejected state-file-supplied artifact paths as untrusted. The reader will use only four fixed status/diff/log/tests paths, fixed ordering, include-derived coverage, UTF-8 byte excerpt caps, aggregate bounds, and post-redaction accounting.
- Defined stable warnings, five failures, exact domain/provider seams, deadline-aware injectable sleep/clock behavior, dedicated bounded Tool Card behavior, protected-Smoke substitutions, Stress migration, and supertool preservation.
- Added a seven-task TDD plan with 37 initially unchecked evidence gates; no production or protected Smoke source changed in this design step.

**Verification commands:**

- targeted `rg` and UTF-8 source reads across `src/server.ts`, `src/workspaceOps.ts`, `src/toolCardWidget.ts`, `scripts/codexpro.mjs`, protected Smoke, Stress, existing tests, and the master plan
- design/plan existence, byte, line, code-fence, and checkbox-state checks
- `git diff --check`
- Git index and unified changed-path counts

**Verification results:**

- Live evidence confirmed the writer's four states, version, timestamps, iteration/hash identity, terminal result fields, and fixed artifact filenames.
- The design measured 304 lines / 14,858 bytes with 18 balanced fences; the plan measured 75 lines / 4,247 bytes with zero fences.
- The plan had exactly 37 unchecked and zero checked items, matching a not-yet-implemented design checkpoint.
- Whitespace checking passed with only established LF-to-CRLF working-copy warnings; the Git index remained empty.
- Unified unpublished scope increased only by the two intended Slice 20 design/plan files, from 26 to 28 changed paths.

**Decisions made:**

- A state file that exists but is invalid or unreadable is not equivalent to no executor state and must not silently become `unknown`.
- `run.state` preserves the observed executor state; top-level `data.state` remains wait-facing and reports `running` for unmatched terminal runs.
- Source-provided `status_file`, `diff_file`, `log_file`, and `tests_file` values are never authority. Fixed configured-context paths are the only readable targets.
- Missing optional artifacts remain safe classified data; unsafe read failures, limits, redaction, and wait-deadline outcomes derive ordered warnings.
- Slice 20 stays within Phase 1 exact-contract migration and does not start processes, write handoff state, or implement Policy Kernel behavior.

**Risks or limitations:**

- Lifecycle validation is stricter than the prior permissive object pass-through; undocumented third-party state writers may receive `HANDOFF_STATE_INVALID` until they emit the documented version-1 fields.
- Artifact snapshots are not atomic with the state-file snapshot; byte/race checks constrain the read but do not provide OS-level isolation.
- The exact public shape is intentionally larger than the prior sparse flat object so absence, matching, and output bounds remain machine-verifiable rather than implicit.

**Rollback method:**

- Remove only the two Slice 20 design/plan files and reverse their index references with a reviewed patch, then append a correction. Do not rewrite STEP-194 or closed volumes, and do not reset Slices 17–19.

**Next step:**

- Add the focused Slice 20 RED suite before production behavior, then implement schema, domain readers, exact polling handler, consumers, hardening, full gates, and per-tool `neat-freak` without publication.

## STEP-196 — Establish focused RED for direct `wait_for_handoff`

**Status:** Complete

**Goal:** Freeze Slice 20 behavior as executable failing evidence before changing schema, domain, runtime, or consumers.

**Files changed:**

- `Memory.md`
- `test/wait-for-handoff-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/superpowers/specs/2026-07-13-wait-for-handoff-output-schema-design.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Added 15 focused tests with exact-schema helpers, canonical source/public runs, fixed artifact identities, provider framing, fake clock/sleep, MCP clients, and temporary workspaces.
- Froze matched and deadline successes, ordered warnings, all five failure families plus explicit/default workspace variants, strict lifecycle/match/path/coverage/byte/redaction drift rejection, and exact mode/descriptor annotations.
- Covered real forged artifact paths, fixed-path reads, terminal completed/failed/timed-out states, missing/running-to-terminal polling, plan mismatch, stale iteration, deadline-clamped sleep, state/provider failures, domain classification, UTF-8 aggregate output, secret redaction, and log tail behavior.
- Covered dedicated Tool Card requirements, structured preservation, supertool child-envelope behavior, nineteen protected-main compatibility substitutions, and protected main/HTTP source immutability.
- Added the nested `run.redacted` invariant to the design before production implementation so top-level redaction remains machine-derivable without changing the thirty-field data count.

**Verification commands:**

- `node --test test/wait-for-handoff-contract.test.mjs`

**Verification results:**

- Expected RED passed as evidence: 0/15 tests passed and 15/15 failed.
- Failures were attributable to absent Slice 20 schema/constructors/domain providers, missing advertised output schema and dedicated Tool Card, old flat runtime/supertool behavior, and absent compatibility substitutions.
- The suite parsed and executed without harness, import, syntax, or temporary-workspace cleanup failures; the pre-existing handler's real waits accounted for the approximately 7.8-second run.

**Decisions made:**

- The RED suite tests both source state and normalized public run objects so undocumented state fields cannot leak through permissive object copying.
- Fake clock/sleep seams are required for deterministic transition/deadline tests and to prevent the focused suite from inheriting production wait latency after implementation.
- Fixed-path trust is tested with source state values deliberately pointing at another readable file under `.ai-bridge`, not only traversal paths.

**Risks or limitations:**

- Until the runtime seam is implemented, several RED cases exercise the old real one-second wait and therefore run slower than their eventual deterministic form.
- Exact compatibility assertions intentionally fail until all protected flat accesses receive fail-closed exact-count substitutions.

**Rollback method:**

- Remove only the Slice 20 focused test and reverse its plan/memory references with a reviewed patch, then append a correction. Do not change protected Smoke or reset Slices 17–19.

**Next step:**

- Create `src/tools/schemas/waitForHandoff.ts`, make the schema/constructor checkpoint green, and run Build before implementing domain or handler behavior.

## STEP-197 — Implement exact Slice 20 schema and constructors

**Status:** Complete

**Goal:** Make the pure exact-contract checkpoint green without changing the legacy wait runtime or consumers.

**Files changed:**

- `Memory.md`
- `src/tools/schemas/waitForHandoff.ts`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Added fixed four-artifact definitions with kind, filename, excerpt-byte target, and log-tail metadata.
- Added safe workspace/context/path/identifier/timestamp primitives, exact canonical run lifecycle validation, artifact/unavailable schemas, fixed artifact-path object, thirty-field data schema, five failure families, and the strict six-field output envelope.
- Enforced state/run presence, hash and iteration match derivation, wait-facing state, terminal/completion flags, next-poll hint, requested fixed-order subset, terminal coverage, array order/count, fixed path identity, source/per-kind/aggregate byte bounds, line counts, truncation, and redaction.
- Added four exact ordered warning derivations and strict success/failure constructors, including retryable-only invalid-state behavior.
- Kept the old handler, domain, Tool Card, Stress, and protected compatibility behavior unchanged at this checkpoint.

**Verification commands:**

- `node --test --test-name-pattern="wait_for_handoff schema" test/wait-for-handoff-contract.test.mjs`
- `npm run build`

**Verification results:**

- Pure schema/constructor checkpoint passed 3/3.
- TypeScript Build passed.
- The remaining focused runtime/domain/consumer cases are intentionally still RED until their respective tasks are implemented.

**Decisions made:**

- Public `run.redacted` makes aggregate redaction derivable without inspecting replacement marker text.
- `requested_artifacts` must begin with status and remain a unique fixed-order subset; a matching terminal success must cover every requested kind exactly once.
- `HANDOFF_STATE_INVALID` is the only retryable failure because a concurrent writer can replace malformed state; boundary/provider failures do not claim that retry guarantee.

**Risks or limitations:**

- The schema permits a null exit code for a failed process to represent signal termination, but completed and timed-out states remain strict.
- Per-kind byte bounds constrain returned excerpt bodies; source read safety still depends on the next domain step.

**Rollback method:**

- Remove only `src/tools/schemas/waitForHandoff.ts` and reverse this plan/memory checkpoint with a reviewed patch, then append a correction. Preserve the focused RED suite and Slices 17–19.

**Next step:**

- Implement bounded fixed state/artifact domain readers in `src/workspaceOps.ts`, make direct domain tests green, and run Build before replacing the public handler.

## STEP-198 — Implement bounded Slice 20 state and artifact domain readers

**Status:** Complete

**Goal:** Establish fixed-path filesystem boundaries and safe raw provider results before replacing the direct polling handler.

**Files changed:**

- `Memory.md`
- `src/tools/schemas/waitForHandoff.ts`
- `src/workspaceOps.ts`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Added effective `maxStateBytes`, `maxArtifactBytes`, and `maxTotalBytes` calculation with 64,000 / 80,000 / 40,000 hard ceilings and configured-limit minima.
- Added typed state-read and raw artifact/unavailable results shared by the server provider boundary.
- Added a non-creating fixed `handoff-run-state.json` reader that distinguishes ENOENT absence, rejects non-file/oversized/non-text state, revalidates the guarded path, and rechecks actual buffer bytes and NUL content.
- Added a fixed-definition artifact reader that canonicalizes the requested subset in allowlist order and never reads a state-file-provided path.
- Classified blocked, missing, too-large, non-text, and other read failures without retaining raw diagnostics; revalidated each path immediately before reading and rechecked buffer size and binary content.

**Verification commands:**

- `node --test --test-name-pattern="domain readers" test/wait-for-handoff-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused domain checkpoint passed 1/1, including missing-state non-creation and fixed status/diff/tests classifications for binary, blocked, and missing files.
- TypeScript Build passed.

**Decisions made:**

- State-read failures remain exceptional so the handler can distinguish them from a normal missing state rather than silently returning `unknown`.
- The artifact domain reader bounds each complete source file but leaves returned excerpt and aggregate output budgeting to the server, where redaction expansion is known.
- Requested kinds are canonicalized through the fixed definition table, which eliminates duplicate, reordered, and unknown path influence at the filesystem boundary.

**Risks or limitations:**

- State and artifact reads remain ordinary filesystem snapshots; revalidation narrows path races but does not make them atomic or OS-sandboxed.
- The domain layer does not parse state JSON by design; strict lifecycle parsing and stable invalid-state mapping belong to the exact handler boundary.

**Rollback method:**

- Remove only the new wait-domain exports/imports and reverse this checkpoint with a reviewed patch, then append a correction. Preserve the exact schema, RED suite, and prior slices.

**Next step:**

- Replace the direct handler with strict provider framing, canonical lifecycle parsing, deadline-aware injected polling, bounded excerpts, stable failures, and exact advertised output.

## STEP-199 — Implement exact Slice 20 runtime and migrate consumers

**Status:** Complete

**Goal:** Produce a usable exact `wait_for_handoff` result before beginning the required post-result adversarial review.

**Files changed:**

- `Memory.md`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/stress.mjs`
- `test/wait-for-handoff-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Added strict source-provider framing and version-1 lifecycle parsing, state/artifact dependency seams, injectable clock/sleep functions, immediate polling, plan/iteration matching, and deadline-clamped waits.
- Added stable workspace/state/artifact/internal failure mapping without raw diagnostics or unsafe paths.
- Added fixed-path terminal artifact loading, UTF-8-safe excerpt budgeting, log tailing, secret redaction, exact counters, ordered warnings, and strict final-envelope construction.
- Advertised the exact output schema while preserving structured content through direct and supertool calls.
- Added a nested-first bounded Tool Card with historical flat fallback, migrated Stress reads, and added nineteen exact fail-closed in-memory protected-main compatibility substitutions.
- Corrected the focused long-output fixture so its requested status/diff terminal coverage is itself contract-valid.

**Verification commands:**

- `npm run build`
- `node --test test/wait-for-handoff-contract.test.mjs`
- `node --test test/read-handoff-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --check`

**Verification results:**

- TypeScript Build passed.
- Focused Slice 20 contract passed 15/15.
- Adjacent handoff/workspace/load/open contracts passed 81/81.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained byte-for-byte unchanged in the worktree.
- Whitespace checking passed; output contained only the established LF-to-CRLF working-copy warnings.

**Decisions made:**

- The first usable result retains observed executor state separately from wait outcome so an unmatched terminal run cannot be mistaken for the requested completion.
- Only fixed configured-context artifact paths are consumed, regardless of source-file path values.
- Compatibility for protected Smoke sources remains an exact-count in-memory transform and fails closed on source drift.

**Risks or limitations:**

- Provider-array order and non-advancing injected clocks still require deliberate adversarial review before final local completion.
- State and artifact snapshots remain ordinary filesystem reads rather than an atomic OS-sandboxed transaction.
- This checkpoint is usable but not yet the per-tool completion point; full regression, packaging, reconciliation, and `neat-freak` remain pending.

**Rollback method:**

- Reverse only the Slice 20 handler/consumer changes and this checkpoint with a reviewed patch, retaining its design, focused tests, domain boundary, and Slices 17–19. Append a correction rather than rewriting this record.

**Next step:**

- Record the newly authorized Phase 1-to-Phase 5 route, then adversarially review the completed Slice 20 result, add deliberate RED cases for material findings, harden minimally, run all local gates, and perform `neat-freak` before Slice 21.

## STEP-200 — Record continuous gated execution through Phase 5

**Status:** Complete

**Goal:** Update the authority chain before future implementation so the user's expanded execution scope is unambiguous and does not weaken any prerequisite gate.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Advanced the master plan to version 2.1 and recorded the authorized route as: finish and jointly publish Phase 1, pass the design-only Policy Kernel gate, then continuously implement Phase 2A, 2B, 3, 4A, 4B, and 5.
- Replaced the obsolete future Phase 2 approval pause with a recorded conditional authorization: the design gate must first satisfy every substantive acceptance item, after which implementation continues without asking the same phase-entry question again.
- Preserved independent boundaries for Phase 6–9, OAuth 2.1, credential migration, destructive actions, product-level Git remote mutations, and any other explicitly high-privilege operation not covered by this route.
- Required every phase to retain its own design, TDD, verification, rollback, and acceptance gates; a failed gate must be repaired and cannot be bypassed through silent degradation.
- Reconciled the current project instructions, concise memory, and historical-roadmap status note with the new authority.
- Confirmed from first principles that file organization belongs in Phase 3 as `move_paths`, after Policy Kernel and workspace isolation, with atomic same-workspace/same-volume batches, no overwrite, full preflight, source-hash verification, and rollback.

**Verification commands:**

- `rg -n "单独批准 Phase 2|separate explicit approval|Phase 2 remains separately|Phase 2 及以后 \| 未批准|Policy Kernel、workspace lifecycle、semantic provider 和 Phase 2 保持关闭" AGENTS.md Memory.md docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `rg -n "Phase 2A–Phase 5|Phase 2–5|move_paths|四个硬门禁" AGENTS.md Memory.md docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `(Get-Content -LiteralPath 'Memory.md').Count`
- `(Get-Item -LiteralPath 'Memory.md').Length`

**Verification results:**

- Obsolete separate-Phase-2-approval wording was removed from the current authority documents.
- New conditional route and `move_paths` placement were present in the master plan, project instructions, concise memory, and historical-roadmap status note.
- The exact document count/size checks are run immediately after this append and recorded as the next checkpoint if correction is required.

**Decisions made:**

- Continuous execution authorizes normal in-scope implementation after prerequisites; it does not convert conditional safety properties into assumptions or authorize unrelated high-risk external actions.
- The Policy Kernel remains a real design gate, not a ceremonial delay: Phase 2 stays closed until its threat model, deterministic rule composition, error semantics, migration, and reversible slices are complete.
- Moving files is not merely another write primitive. Its irreversibility and namespace/race behavior require the Phase 3 transaction and audit foundations.

**Risks or limitations:**

- Phase 2–5 work has not started; this step changes authority and sequencing documentation only.
- Phase-local designs may discover additional hard prerequisites. They may refine ordering inside the authorized scope but cannot skip the preceding phase gate or expand into Phase 6–9.
- The separate Phase 1 unified publication authorization remains the only currently scheduled push; later external publication must follow the repository's active authorization rules.

**Rollback method:**

- Append a new route correction and update the four current authority/index documents together. Do not rewrite this archive entry or silently restore obsolete wording.

**Next step:**

- Complete the post-result adversarial review of Slice 20, add focused RED cases for material provider-order and bounded-clock findings, harden minimally, run all local gates, and perform `neat-freak` before Slice 21.

## STEP-201 — Harden Slice 20 provider ordering and polling bounds

**Status:** Complete

**Goal:** Review the already usable result adversarially and repair every material issue before final local gates.

**Files changed:**

- `Memory.md`
- `src/server.ts`
- `test/wait-for-handoff-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-wait-for-handoff-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Reviewed lifecycle consistency, state failure separation, hash/iteration boundaries, wall-clock deadline math, fixed-path trust, provider drift, UTF-8 and aggregate bounds, redaction expansion, and Tool Card limits.
- Found that a frozen or backward-moving wall clock could keep a zero-latency injected sleeper polling forever because the deadline was measured only from wall time.
- Found that malformed provider artifact arrays could violate their fixed relative order and still be silently normalized by map-based artifact construction.
- Clarified the design before production hardening: polling now has an independent scheduled-sleep budget, and both provider artifact/unavailable arrays must retain fixed relative order.
- Added two deliberate regression cases. The frozen clock fails closed after a fifth attempted sleep in the old implementation, preventing the RED run itself from hanging.
- Added a decreasing scheduled-sleep budget capped with wall-clock remaining time and strict fixed-relative-order provider validation.

**Verification commands:**

- `node --test --test-name-pattern="wall clock|fixed relative order" test/wait-for-handoff-contract.test.mjs` (before fix)
- `node --test --test-name-pattern="wall clock|fixed relative order" test/wait-for-handoff-contract.test.mjs` (after fix)
- `npm run build`
- `node --test test/wait-for-handoff-contract.test.mjs`
- `node --test test/read-handoff-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`

**Verification results:**

- Deliberate pre-fix RED passed as evidence: 0/2, with the stalled clock returning `INTERNAL_ERROR` after the bounded test guard and reversed provider artifacts incorrectly succeeding.
- Post-fix targeted cases passed 2/2.
- TypeScript Build passed.
- Complete Slice 20 focused contract passed 17/17.
- Adjacent handoff/workspace/load/open contracts passed 81/81.
- Protected main and HTTP Smoke sources remained unchanged.

**Decisions made:**

- Deadline safety cannot depend solely on adjustable wall time. A scheduled-sleep budget provides a deterministic upper bound while the wall clock still permits earlier termination after forward jumps.
- Strict provider seams reject malformed order rather than silently normalize it; the domain provider already emits the required fixed order.
- The hardening changes no public fields, error families, artifact order, or success semantics, so the exact output schema remains version 1.

**Risks or limitations:**

- Scheduled budget measures requested sleep durations, not a monotonic high-resolution elapsed clock; this is intentionally conservative and ensures an upper bound even for injected no-op sleepers.
- Ordinary state/artifact filesystem snapshots remain non-atomic and rely on the documented pre/post boundary checks.

**Rollback method:**

- Revert only the two regression cases, scheduled-budget/order validation, and design clarification with a reviewed patch, then append a correction. Retain the usable Slice 20 implementation and prior route records.

**Next step:**

- Run the complete Slice 20 local verification matrix, then perform the user-required `neat-freak` reconciliation and continue directly to Slice 21 without publication.

## STEP-202 — Complete Slice 20 local gates and per-tool `neat-freak`

**Status:** Complete

**Goal:** Close Slice 20 locally with fresh end-to-end evidence and reconcile every current authority layer before continuing to Slice 21.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-13-wait-for-handoff-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-wait-for-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Ran the complete regression, all eight Smoke commands, native-Windows Stress, package dry-run, protected-source, exact-scope, secret-pattern, whitespace, reference, Markdown, memory, archive, and Git-index checks.
- Reconciled the Slice 20 design/plan, master plan, historical roadmap, project instructions, concise memory, and active archive to locally complete/unpublished status and made Slice 21 `codex_context` the active action.
- Applied the user-required `neat-freak` skill after the implementation result existed, including project/root inventory, rule-layer inspection, required-file checks, all-Markdown link/fence audit, spec/plan pairing, Git/package fact verification, and knowledge-size checks.
- Compacted the repetitive per-slice documentation map in `AGENTS.md` into one published-pair index plus exact local Slice 17–20 pointers, reducing permanent prompt load without losing active routing information.
- Kept README, CHANGELOG, SECURITY, FAQ, deployment, and public integration documents unchanged because Slice 20 is unpublished, its input/tool availability did not change, and none of those documents describe the migrated wait-result field layout.
- Confirmed `CLAUDE.md` is absent and no same-source link is required because this repository's explicit local rule makes `AGENTS.md` authoritative.

**Verification commands:**

- `npm run build`
- `node --test test/wait-for-handoff-contract.test.mjs`
- `node --test test/read-handoff-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run`
- exact expected-vs-actual `git status --short` comparison for the unified batch
- `git diff --check`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- secret-pattern `rg` across all changed paths
- Markdown relative-link and balanced-fence audit across all project Markdown files
- spec/plan pair and orphan-plan audit
- project/global rule reference, package, branch, remote, required-path, memory-size, archive-size, and index checks

**Verification results:**

- Slice 20 focused contract passed 17/17; adjacent contracts passed 81/81.
- Complete Node regression passed 323/323.
- TypeScript Build passed.
- All eight Smoke commands passed.
- Native-Windows Stress passed, including its Build prerequisite.
- Package dry-run passed with 139 files, approximately 384.2 kB compressed and 2.0 MB unpacked; internal memory/spec/plan files stayed excluded.
- Exact unified unpublished scope passed at 30 changed paths; Git index remained empty.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained unchanged.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings; secret scan returned no matches.
- Markdown audit passed for 73 files; all 20 spec/plan pairs existed, no orphan plans existed, and all `AGENTS.md` file references resolved.
- Before compaction, `AGENTS.md` measured 227 lines / 18,124 bytes; final measurements are verified immediately after this append.
- `Memory.md` remained within its 150-line / practical 18-KiB target, and the active archive remained below its 80% rollover threshold.
- Docs remained materially larger than project memory, so no knowledge-volume inversion exists.

**Decisions made:**

- Published slice history belongs in paired design/plan files and append-only archives; `AGENTS.md` needs only the routing rule and exact current unpublished pointers.
- No user-facing release note is written before the unified Slice 17–28 publication, preventing documentation from claiming locally implemented behavior is already released.
- Slice 20's fixed ordering and scheduled-sleep-budget lessons remain in its exact design and archive; root memory carries only the current limitation-sized summary.

**Risks or limitations:**

- Slice 20 remains unpublished and has no exact-head CI evidence yet; that is intentionally deferred to the unified twelve-tool publication.
- Main/HTTP Smoke compatibility still relies on exact protected-source substitutions and fails closed on source drift.
- State and artifact snapshots remain non-atomic; later Policy Kernel, workspace isolation, transaction, and sandbox phases must not infer stronger guarantees from this slice.

**Rollback method:**

- Reverse only Slice 20 production/test/schema/docs changes from the eventual unified batch commit if required. Restore expanded documentation-map entries only if compact routing proves insufficient; do not rewrite this archive entry or earlier volumes.

**Next step:**

- Begin Slice 21 `codex_context` with fresh inventory, exact-contract design, and TDD; continue without staging, commit, push, CI publication, or a user-interruption stop.

## STEP-203 — Approve Slice 21 exact-context design and TDD plan

**Status:** Complete

**Goal:** Freeze a first-principles `codex_context` contract before changing production behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-13-codex-context-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-codex-context-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Inventoried the full-only direct handler, workspace domain, AGENTS discovery, fixed handoff reader, Git helpers, protected main/HTTP Smoke consumers, Tool Card, supertool path, README/CHANGELOG references, modes, inputs, and configured bounds.
- Defined one strict six-field envelope with exactly twenty-eight success fields, ordered source classifications, exact include/presence/count/byte/preview/limit/redaction invariants, and six stable failure families.
- Preserved all existing inputs and independent Git status/diff switches; derived the total output ceiling from existing `config.maxOutputBytes` rather than adding another public knob.
- Replaced filename-dot target inference in the design with canonical file/directory/missing kinds and write-strength parent containment for missing future files.
- Required AGENTS and handoff reads to expose only canonical loaded paths or fixed safe unavailable reasons, never raw exceptions.
- Required redaction before UTF-8 output capping, full context preservation in structured data/direct MCP text, and a bounded-preview-only Tool Card.
- Wrote a seven-task TDD plan covering focused RED, exact schema, domain hardening, handler/provider boundary, consumers, post-result review, full gates, and per-tool `neat-freak`.

**Verification commands:**

- repository-wide `rg` inventory for `codex_context`, `readCodexContext`, Tool Card, Smoke/HTTP/Stress, supertool, docs, and configured byte bounds
- focused source reads of `src/server.ts`, `src/workspaceOps.ts`, `src/guard.ts`, `src/gitOps.ts`, protected compatibility loaders, Tool Card, README, and active authority docs
- design/plan line, byte, fence, and checkbox counts
- `git diff --check -- docs/superpowers/specs/2026-07-13-codex-context-output-schema-design.md docs/superpowers/plans/2026-07-13-codex-context-output-schema.md`

**Verification results:**

- The current tool was confirmed full-only, read-only, Tool-Card-enabled, and flat with eight structured metadata fields plus complete context only in MCP text.
- Protected main Smoke has five flat `agents_files` reads across two variables; protected HTTP Smoke has two flat `workspace_id` reads. No Stress field consumer exists.
- The existing domain can include raw AGENTS read errors and uses a filename-dot heuristic for target type; both are explicitly removed by the approved design.
- Design measured 286 lines / 13,601 bytes with 18 balanced fences.
- Plan measured 76 lines / 4,669 bytes with 38 unchecked and zero checked items, matching a not-yet-implemented checkpoint.
- Whitespace check passed for both new documents.

**Decisions made:**

- The semantic payload is the context itself, so exact structured output must carry it; a metadata-only preview would make direct and supertool calls semantically unequal.
- Output duplication is accepted only under the existing configured output ceiling and is never rendered in full by the Tool Card.
- Missing future targets remain supported, but their closest existing parent must satisfy containment before instruction discovery.
- Optional missing handoff files are normal data; unsafe reads and actual output limits remain warnings.

**Risks or limitations:**

- Git helper failure strings remain legacy bounded/redacted context text in this slice rather than new structured Git failures.
- Context filesystem reads remain snapshots and do not imply atomicity or OS sandboxing.
- The exact domain/provider validation adds stricter normalization that may reject undocumented injected providers; production has one internal provider.

**Rollback method:**

- Remove only the Slice 21 design/plan and their live index references with a reviewed patch, then append a correction. Preserve completed Slices 17–20 and STEP-203 history.

**Next step:**

- Add the focused Slice 21 RED suite, prove failures are missing exact behavior, then implement schema, domain, handler, consumers, hardening, full gates, and `neat-freak` without publication.

## STEP-204 — Complete Slice 21 `codex_context` local gates and neat-freak

**Status:** locally complete, post-result reviewed, reconciled, and unpublished

**Goal:**

- Migrate direct `codex_context` to its approved exact schema-v1 contract, harden the completed result, pass every local gate, run the required per-tool `neat-freak`, and continue to Slice 22 without an intermediate publication action.

**Files changed:**

- `src/tools/schemas/codexContext.ts`
- `src/workspaceOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- `test/codex-context-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-codex-context-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-codex-context-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Added the exact six-field envelope, twenty-eight-field data contract, fixed warning order, six stable failures, strict cross-field invariants, configured-context allowlist validation, and bounded preview/truncation helpers.
- Replaced filename-dot inference with canonical file/directory/missing target resolution. Missing targets now require a directory ancestor, validate write-strength parent containment, and canonicalize safe internal junction parents.
- Added guarded root-to-target AGENTS discovery with native-realpath de-duplication and fixed safe unavailable reasons; raw read errors no longer enter returned context.
- Reused the seven fixed handoff artifact definitions without creating context, preserved independent Git status/diff switches, and added a strict test-only provider seam with identity, configured path, coverage, presence, and text-frame validation.
- Redacted the complete provider text before UTF-8 capping, preserved exact structured context under Tool Cards, and returned byte/preview/limit/redaction facts that the schema revalidates.
- Added a dedicated nested-first bounded Tool Card with historical flat fallback and exact-count protected main/HTTP Smoke compatibility substitutions; protected Smoke source files remained unchanged.
- Post-result review found two material gaps: custom `contextDir` incorrectly failed a static `.ai-bridge` assumption, and missing targets below file or junction parents were not canonical enough. Deliberate tests failed 0/2 before the fixes and passed 2/2 after them. Provider framing was also tightened during the same review.
- Reconciled the design, completed plan, master plan, historical roadmap, project instructions, concise memory, and active archive; public release notes remained unchanged because the unified Slice 17–28 batch is still unpublished.

**Verification commands:**

- `node --test --test-reporter=spec test/codex-context-contract.test.mjs` (initial RED and final)
- targeted schema, target, provider, redaction, consumer, and deliberate hardening patterns
- `node --test --test-reporter=spec test/read-handoff-contract.test.mjs test/wait-for-handoff-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs`
- `npm run build`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- exact expected-vs-actual `git status --short` comparison for the unified batch
- `git diff --check`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- secret-pattern `rg` across every changed path
- all-Markdown relative-link and balanced-fence audit
- spec/plan pair, `AGENTS.md` reference, required-file, package, branch, remote, memory-size, archive-size, and Git-index checks

**Verification results:**

- Initial focused RED passed as evidence: 0/14 tests passed and all fourteen failed for absent Slice 21 behavior. Final focused contract passed 16/16.
- Deliberate post-result hardening RED passed as evidence: 0/2 before fixes, then 2/2 after fixes.
- Adjacent workspace/handoff contracts passed 83/83; complete Node regression passed 339/339.
- TypeScript Build passed. One initial `npm run Build` invocation failed only because the repository script name is lowercase; the correct `npm run build` command passed repeatedly.
- All eight Smoke sections passed. Native-Windows Stress passed, including its Build prerequisite.
- Package dry-run passed with 141 files, 395,842 bytes compressed, and 2,088,067 bytes unpacked; internal memory/spec/plan files remained excluded.
- Exact unified unpublished scope passed at 34 changed paths; the Git index remained empty.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained unchanged.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings; secret scan returned zero matches.
- Markdown audit passed for 68 files with zero broken relative links and zero unbalanced fences; all 21 spec/plan pairs existed with no orphans, and all 28 documentation-map references in `AGENTS.md` resolved.
- Root `Memory.md` measured 138 lines / 16,287 bytes before this archive append, within its practical limits. `AGENTS.md` measured 196 lines / 12,831 bytes.
- No `CLAUDE.md` exists and none is required because the repository explicitly makes local `AGENTS.md` authoritative.

**Decisions made:**

- The fixed AI source allowlist means seven fixed filenames under the configured safe `contextDir`, not a hardcoded `.ai-bridge` prefix; the default remains `.ai-bridge`.
- A missing future target below an existing non-directory is invalid. A safe internal junction parent is canonicalized to its real workspace-relative path before instruction discovery.
- Context provider framing includes exact workspace/target/mode headers and required source sections; malformed injected providers fail with `INTERNAL_ERROR` rather than producing a semantically inconsistent envelope.
- Slice 21 remains part of the single Slice 17–28 publication batch. README, CHANGELOG, SECURITY, FAQ, and deployment docs must not claim it is published yet.

**Risks or limitations:**

- Filesystem, handoff, and Git reads are bounded snapshots, not one atomic transaction or an OS sandbox guarantee.
- Git helper failure strings remain legacy bounded/redacted text inside the context rather than structured Git failures.
- Target failure classification still depends on bounded `PathGuard` message prefixes and Node filesystem error behavior.
- The context body intentionally appears in MCP text and structured data; `config.maxOutputBytes` bounds each copy, and the Tool Card renders only the preview.

**Rollback method:**

- Reverse only Slice 21 schema/domain/handler/consumer/test/document changes from the eventual unified batch commit, preserve Slices 17–20, and append a correction rather than rewriting STEP-203 or STEP-204.

**Next step:**

- Begin Slice 22 `export_pro_context` with fresh inventory and exact-contract design, then continue through Slice 28 without staging, commit, push, exact-head CI, or a user-interruption stop.

## STEP-205 — Approve Slice 22 exact export design and TDD plan

**Status:** Complete

**Goal:** Freeze a first-principles `export_pro_context` write-result contract before changing production behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-13-export-pro-context-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`
- `docs/memory/archive/phase-1-part-6.md`

**Implementation summary:**

- Inventoried the standard/full direct handler, twelve inputs, `src/proContext.ts` builder/exporter, `ensureAiBridge`, fixed handoff reader, write result, CLI `pro-bundle`, self-test builder, protected main/HTTP Smoke, native Stress, Tool Card, supertool alias, configured bounds, and adjacent contract assumptions.
- Defined one strict six-field envelope with exactly forty-two success fields, deterministic candidate equations, safe skip records, fixed AI-context coverage, scaffold creation effects, exact output existence/bytes/hash, and independent diff/bundle truncation facts.
- Preserved the fixed `${contextDir}/pro-context.md` overwrite purpose and existing selection defaults while bounding title/path/glob inputs and making effective configured ceilings visible.
- Required immutable request preparation and explicit selection/output preflight before any scaffold write, including safe missing-parent containment and Windows case-aware canonical de-duplication.
- Replaced raw skip diagnostics and character-count truncation in the design with fixed safe reasons, redaction before UTF-8 caps, fixed markers, and strict source/final byte equations.
- Required a prepared-request provider seam, ten stable failures, nested bounded Tool Card, protected-source compatibility substitutions, native Stress migration, CLI/self-test compatibility, and direct-supertool child-envelope preservation.
- Wrote a seven-task TDD plan covering focused RED, schema, domain hardening, handler/provider validation, consumers, post-result review, full gates, and the required per-tool `neat-freak`.

**Verification commands:**

- repository-wide `rg` inventory for `export_pro_context`, `pro_export`, `buildProContext`, `exportProContext`, `files_included`, protected Smoke/HTTP, Stress, Tool Card, CLI, and self-test consumers
- focused source reads of `src/server.ts`, `src/proContext.ts`, `src/fsOps.ts`, `src/workspaceOps.ts`, `src/guard.ts`, `src/redact.ts`, protected compatibility loaders, Tool Card, active authority docs, and Slice 21 contract patterns
- design/plan line, byte, fence, and checkbox counts
- `git diff --check -- docs/superpowers/specs/2026-07-13-export-pro-context-output-schema-design.md docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`

**Verification results:**

- Current direct output was confirmed flat with seven fields and no exact output schema; the generic Tool Card is the last legacy renderer.
- Protected main Smoke has one flat `path` assertion and five flat `files_included` reads; protected HTTP Smoke has two flat `path` reads. Native Stress has direct and wrapped flat `files_included` consumers.
- Existing domain evidence confirmed raw skipped-file exception strings, character-count diff/final truncation under byte-named limits, redaction after final capping, silent `max_files` omissions, discarded write SHA/existence, and scaffold creation before selection validation.
- Design measured 324 lines / 17,175 bytes with 20 balanced fences.
- Plan measured 79 lines / 5,264 bytes with 43 unchecked and zero checked items, matching a not-yet-implemented checkpoint.
- Whitespace check passed for both new documents.

**Decisions made:**

- The generated Markdown is a durable file artifact, so the public result returns integrity and provenance metadata rather than duplicating up to two megabytes of body content.
- Explicit selection and configured output authorization must be proven before the first write; approval of the tool call does not authorize an unsafe path.
- `files_included` retains source-bundle semantics for compatibility, while independent `bundle_truncated` and exact source/final bytes make possible tail loss explicit.
- Multi-file scaffold plus output atomicity remains Phase 3 work; this slice preflights deterministic failures but does not claim rollback.

**Risks or limitations:**

- Filesystem and Git reads remain bounded snapshots and can change during export.
- Operating-system failure during scaffold creation can still leave a partial scaffold before the final artifact succeeds.
- Git helper failure text remains legacy content inside the redacted bounded artifact.
- The exact domain/provider validation is stricter than the prior undocumented internal result shape; the production provider and maintained CLI/self-test consumers are migrated together.

**Rollback method:**

- Remove only the Slice 22 design/plan and live index references with a reviewed patch, then append a correction. Preserve completed Slices 17–21 and STEP-205 history.

**Next step:**

- Add the focused Slice 22 RED suite, prove failures are missing exact behavior, then implement schema, domain, handler, consumers, hardening, full gates, and `neat-freak` without publication or interruption.

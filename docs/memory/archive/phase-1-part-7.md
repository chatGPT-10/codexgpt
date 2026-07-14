# CodexPro Phase 1 Implementation Archive — Volume 7

This append-only volume continues Phase 1 from STEP-206 after Volume 6 crossed the 80% rollover threshold at STEP-205.

Do not rewrite closed earlier volumes. Append corrections as new entries.

## Correction to STEP-205 — Consumer and plan counts

**Status:** Complete

The STEP-205 verification narrative used two incorrect manual counts. The protected main Smoke source contains eight flat `files_included` expression occurrences across `exported`, `oneFileExport`, and `exactExport`, not five. The Slice 22 implementation plan contains forty unchecked checklist items, not forty-three. The one protected main `path` occurrence, two protected HTTP `path` occurrences, zero checked items, and all other STEP-205 facts remain unchanged.

The corrected counts were verified with exact escaped-string occurrence counts over `scripts/smoke.mjs` and `scripts/http-smoke.mjs`, plus anchored checkbox counts over `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`.

## STEP-206 — Establish Slice 22 focused RED

**Status:** Complete

**Goal:** Freeze executable Slice 22 acceptance behavior and prove the current implementation does not accidentally satisfy the new contract.

**Files changed:**

- `test/export-pro-context-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added sixteen focused tests covering the exact six-field envelope and forty-two data fields, warning/failure derivation, cross-field rejection, modes/descriptor, immutable preparation, no-write path/glob preflight, candidate/skip accounting, fixed AI/scaffold effects, redaction-before-UTF-8-cap integrity, stable failures, strict provider behavior, independent truncation flags, nested Tool Card, domain/CLI/self-test compatibility, supertool wrapping, protected compatibility, and native Stress migration.
- Kept missing schema imports nullable only so the complete suite could execute and report the intended RED surface rather than aborting at module load.
- Marked only Task 1 of the implementation plan complete from fresh evidence.

**Verification commands:**

- `node --test --test-reporter=spec test/export-pro-context-contract.test.mjs`

**Verification results:**

- Focused RED passed as evidence: 0/16 tests passed and all sixteen failed.
- Failures mapped to missing exact constructors/schema, missing output descriptor, absent request preparation/preflight, legacy flat/raw-skip output, character-based/redaction-late integrity, absent provider seam, legacy Tool Card, missing SHA compatibility field, legacy supertool child shape, and unmigrated compatibility consumers.
- Existing production behavior still wrote `.ai-bridge` for a blocked explicit selection, proving the no-write preflight test detects a real boundary issue rather than only a type mismatch.

**Decisions made:**

- RED evidence is complete enough to begin production code; no expectation was weakened to make legacy behavior pass.
- Provider tests use internal source and final Markdown solely to validate exact byte/hash/cap framing; public structured data continues to exclude the artifact body.

**Risks or limitations:**

- The suite currently fails noisily by design and is not a completion signal.
- Test helper provider shape is an executable contract that production must validate strictly; it must not become a hidden public argument or production test mode.

**Rollback method:**

- Remove only the new focused test and revert its plan/live-index records if Slice 22 is explicitly abandoned; preserve STEP-206 as append-only evidence via a later correction.

**Next step:**

- Implement the exact Slice 22 schema and constructors, then proceed through request/domain hardening before wiring the handler and consumers.

## STEP-207 — Implement Slice 22 exact schema

**Status:** Complete

**Goal:** Establish the strict public schema, constructors, warnings, failures, and cross-field invariants before changing the export domain or handler.

**Files changed:**

- `src/tools/schemas/exportProContext.ts`
- `test/export-pro-context-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added fixed diff/bundle truncation markers, three exact warnings, ten stable error messages, fixed seven-file AI and nine-file scaffold definitions, and safe workspace/path/glob/title schemas.
- Added typed skipped-source and AI-unavailable records with reason-specific byte semantics.
- Added the exact forty-two-field data schema with strict selected/glob/count equations, deterministic attempted/omitted accounting, unique/disjoint file identities, fixed configured-directory AI coverage, ordered scaffold subset validation, exact byte/truncation/limit equations, and SHA-256 syntax.
- Added the strict six-field success/failure envelope and constructors with derived warning order and empty failure warnings.
- Corrected the warning fixture to use `max_files:2`, making its candidate/omitted equation internally exact rather than weakening production validation.

**Verification commands:**

- `node --test --test-reporter=spec --test-name-pattern="schema exports|schema derives|schema rejects" test/export-pro-context-contract.test.mjs`
- `npm run build`

**Verification results:**

- Exact schema checkpoints passed 3/3.
- TypeScript Build passed.
- All Task 2 checkboxes were marked only after these fresh results.

**Decisions made:**

- Public context paths must end in one safe configured directory plus `/pro-context.md`; fixed AI/scaffold identities are derived from that directory rather than hardcoded to `.ai-bridge`.
- `attempted_count` remains derived rather than public: `file_count + skipped_count = min(candidate_count, max_files)`.
- Missing, blocked, not-file, and read-failed records expose no bytes; too-large and not-text records require observed bytes.

**Risks or limitations:**

- The public schema can prove arithmetic and identity consistency but final Markdown byte/hash equivalence requires the internal provider validation added in Task 4.
- Windows path uniqueness follows the running platform; cross-platform exact-head CI remains deferred until the unified batch publication.

**Rollback method:**

- Remove the Slice 22 schema module and revert only its focused schema assertions/plan/live-index records; preserve RED evidence through a later append-only correction.

**Next step:**

- Implement immutable request preparation, output preflight, safe source accounting, fixed AI/scaffold facts, UTF-8 truncation, redaction-before-cap, and compatibility wrappers in `src/proContext.ts`.

## STEP-208 — Implement, integrate, and harden Slice 22

**Status:** Complete

**Goal:** Produce a usable strict `export_pro_context` result, migrate every in-scope consumer, then review and harden the completed behavior before broad verification.

**Files changed:**

- `src/proContext.ts`
- `src/gitOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- `scripts/stress.mjs`
- `test/export-pro-context-contract.test.mjs`
- `test/write-contract.test.mjs`
- `test/edit-contract.test.mjs`
- `test/apply-patch-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-export-pro-context-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Replaced the legacy export domain with immutable request preparation, canonical explicit selections, safe bounded globs, fixed output/scaffold preflight, deterministic candidate/skip accounting, fixed handoff coverage, redaction-before-cap, UTF-8 markers, exact bytes/SHA-256, and compatible build/export wrappers.
- Added the strict prepared-request provider seam and handler classification for workspace, request, selection, output, build, write, provider, and internal failures; success now validates all forty-two fields and reopens the actual artifact through `PathGuard` to verify exact content, bytes, and SHA-256 before returning.
- Added a dedicated bounded nested-first Tool Card, exact fail-closed protected main/HTTP Smoke substitutions, and native Stress nested-data migration while leaving both protected Smoke sources unchanged.
- Post-result review found and fixed two material defects with deliberate RED: a self-consistent provider could report success without a matching disk artifact, and Git `core.quotepath=true` could hide a Unicode rename destination from changed-file inclusion. Git status now requests literal Unicode paths and the handler verifies the durable artifact.
- Clarified that user glob discovery is intentionally bounded to `max_files + 1` matches per glob; candidate/omission counts are exact for that bounded set and broader match totals are not claimed.

**Verification commands:**

- `node --test --test-name-pattern "verifies the provider artifact|quoted Unicode" test/export-pro-context-contract.test.mjs`
- `node --test test/export-pro-context-contract.test.mjs`
- `node --test test/export-pro-context-contract.test.mjs test/git-status-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs`
- `npm run build`

**Verification results:**

- Deliberate hardening RED passed as evidence at 0/2: the missing artifact was incorrectly accepted and the quoted Unicode rename produced no included file.
- The same targeted checkpoints passed 2/2 after the minimum fixes.
- Final focused Slice 22 contract passed 18/18.
- Final focused-plus-adjacent contracts passed 75/75.
- TypeScript Build passed after domain, handler, consumer, and hardening changes.
- An earlier adjacent rerun exposed one obsolete injected-provider fixture that no longer wrote its claimed artifact; updating that test helper to honor the strengthened provider contract restored the final 75/75 result without weakening production validation.

**Decisions made:**

- Provider success means a matching durable artifact exists, not merely that returned metadata is internally consistent.
- `git status` uses command-local `core.quotepath=false` so Unicode path identities are usable without changing repository or user configuration.
- Broad glob totals remain bounded in Phase 1; the tool visibly reports limitation but does not perform an unbounded workspace crawl or claim a full-machine total.

**Risks or limitations:**

- Scaffold creation and the final artifact remain a non-transactional multi-file sequence; an operating-system failure may leave a partial scaffold even though no success is returned.
- Path preflight plus final reread reduce but cannot eliminate filesystem time-of-check/time-of-use races without the later transaction engine and OS sandbox.
- `omitted_count` is a conservative lower bound when one user glob has more than `max_files + 1` matches; a future versioned contract can expose a distinct glob-discovery truncation fact.

**Rollback method:**

- Revert the Slice 22 schema/domain/handler/Tool Card/test/compatibility changes plus the command-local Git quoting option; keep Slices 17–21 and protected Smoke sources unchanged. Because the unified batch is unstaged and uncommitted, rollback remains file-local.

**Next step:**

- Run complete regression, Smoke, native-Windows Stress, package and static gates, then perform the required per-tool `neat-freak` reconciliation before continuing directly to Slice 23.

## STEP-209 — Complete Slice 22 local gates and per-tool `neat-freak`

**Status:** Locally complete, post-result reviewed, reconciled, and unpublished

**Goal:** Close direct `export_pro_context` locally with fresh end-to-end evidence, reconcile every current authority layer, and continue to Slice 23 without an intermediate publication action.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-13-export-pro-context-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-export-pro-context-output-schema.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Ran the complete regression, all eight Smoke commands, native-Windows Stress, package dry-run, protected-source, exact-scope, secret-pattern, whitespace, Markdown, reference, memory, archive, package, branch, remote, and Git-index checks.
- Applied the user-required `neat-freak` after the usable result and post-result hardening existed: reconciled project instructions, concise memory, master plan, historical roadmap, exact design/plan, and active archive to locally complete/unpublished Slice 22 status.
- Advanced the next active action to fresh inventory and exact-contract design for Slice 23 `handoff_to_agent`; no Slice 23 implementation was started during reconciliation.
- Kept README, README_ZH, CHANGELOG, SECURITY, FAQ, public setup, and deployment documents unchanged because Slice 22 remains unpublished, does not change tool availability or inputs, and those documents do not describe its legacy flat result fields.
- Confirmed `CLAUDE.md` is absent and no same-source link is required because this repository explicitly makes local `AGENTS.md` authoritative.

**Verification commands:**

- `npm run build`
- `node --test test/export-pro-context-contract.test.mjs`
- `node --test test/export-pro-context-contract.test.mjs test/git-status-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- explicit 44-path expected-versus-actual unpublished-scope comparison
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --check`
- secret-pattern scan across every changed and untracked path
- all-Markdown relative-link and stateful balanced-fence audit
- exact spec/plan pair, `AGENTS.md` documentation-map reference, required-file, plan-checkbox, package, branch, remote, memory-size, archive-size, knowledge-volume, `CLAUDE.md`, and Git-index checks

**Verification results:**

- Focused Slice 22 passed 18/18; focused-plus-adjacent contracts passed 75/75; complete Node regression passed 357/357; TypeScript Build passed.
- All eight Smoke commands completed successfully. Native-Windows Stress completed successfully, including its Build prerequisite.
- Package dry-run passed with 143 files, 412,423 bytes compressed, and 2,183,694 bytes unpacked; internal memory/spec/plan files remained excluded.
- Exact unified unpublished scope passed at 44 paths; the Git index remained empty. Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained unchanged. Secret-pattern scanning returned zero files.
- Markdown audit passed for 71 files with zero broken relative links and zero unbalanced fences. All 22 spec/plan pairs existed with no orphans, and all 31 repository references in the `AGENTS.md` documentation map resolved.
- Before this archive append, `Memory.md` measured 142 lines / 17,181 bytes and `AGENTS.md` measured 198 lines / 13,355 bytes. The active archive measured 11,846 bytes, below its 52,428-byte rollover threshold; project documentation measured 1,802,395 bytes, so no knowledge-volume inversion exists.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings.
- The first exact-scope audit command incorrectly constructed nested PowerShell arrays and failed without changing files; flattening the two Git path lists made the explicit 44-path comparison pass. The first Markdown audit also mishandled root-level parents and counted fences naively; the corrected stateful parser passed all 71 files. These were audit-script defects, not product failures.

**Decisions made:**

- Slice 22 is locally complete but not published; its cross-platform exact-head CI remains deliberately deferred to the unified Slice 17–28 publication.
- The strict artifact reread, bounded glob meaning, partial-scaffold limitation, and command-local Unicode Git path behavior remain documented in the exact design and concise memory rather than duplicated into public setup guides.
- Slice 23 begins with a fresh design/inventory step; the continuous authorization removes an approval pause but does not remove per-slice TDD, review, rollback, verification, or neat-freak gates.

**Risks or limitations:**

- Six unpublished slices now share one 44-path working tree, increasing the importance of exact-scope checks and file-local rollback for later slices.
- Slice 22 has no exact-head Ubuntu/Windows CI evidence yet by design.
- Multi-file scaffold/export behavior remains non-transactional, and glob totals remain bounded discovery facts; later phases must not infer transaction or sandbox guarantees from this tool.

**Rollback method:**

- Reverse only Slice 22 production/schema/test/consumer/docs changes with a reviewed patch while preserving Slices 17–21. Do not reset the shared tree, rewrite archive history, or modify protected Smoke sources.

**Next step:**

- Inventory, design, TDD-implement, verify, post-result review, and `neat-freak` Slice 23 `handoff_to_agent`, continuing without staging, committing, pushing, exact-head CI, publication, or a user-interruption stop.

## STEP-210 — Approve Slice 23 `handoff_to_agent` exact contract

**Status:** Complete

**Goal:** Convert the legacy planning write into one exact, durable, machine-verifiable contract before changing production behavior.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-handoff-to-agent-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Inventoried the direct handler, fixed AI-bridge scaffold, CLI plan-hash consumer, Tool Card, direct supertool alias, protected Smoke reads, native Stress, mode visibility, and Slice 24 compatibility boundary.
- Approved a strict six-field envelope with exactly thirty-six data fields, one fixed append warning, and fifteen stable safe failures.
- Bound success to the exact on-disk plan bytes/SHA-256 plus identical deterministic event tails in both fixed logs; the plan hash is deliberately identical to the CLI hash consumed by `wait_for_handoff`.
- Defined meaningful append semantics so a missing or canonical scaffold placeholder becomes a new plan instead of receiving an appended task below `No plan written yet.`.
- Kept `handoff_to_codex` flat until its own Slice 24 migration and kept execution, processes, transactions, Policy Kernel behavior, publication, and remote Git actions outside this slice.

**Verification commands:**

- exact CLI `planHash` and current handler/scaffold/consumer inventory with `rg`
- direct UTF-8 reads of the new design, plan, master status, AGENTS documentation map, and concise memory
- file existence and byte-size checks for the new spec/plan pair

**Verification results:**

- The CLI hashes the complete decoded plan text with SHA-256, matching the approved public `plan_sha256` definition.
- Both new documents exist and the design/plan responsibilities are paired without opening production behavior.
- Protected Smoke sources remain unchanged; no staging, commit, push, publication, CI, dependency, source, or external-state mutation occurred.

**Decisions made:**

- Public append state distinguishes physical plan-file existence from a meaningful prior plan and exposes requested versus applied append separately.
- Diff facts compare the pre-call plan with the final plan, not the temporary scaffold created during the operation.
- A successful planning write requires durable plan and two-log verification but does not claim an agent started or completed work.

**Risks or limitations:**

- The scaffold, plan, and two logs remain a non-transactional sequence in Phase 1; a failed call can leave partial writes but cannot return success.
- Strict final verification reduces but cannot eliminate filesystem time-of-check/time-of-use races without later transaction and sandbox work.

**Rollback method:**

- Remove only the Slice 23 design/plan and revert these live-index updates with a reviewed patch; preserve this append-only record via a later correction if the design is superseded.

**Next step:**

- Establish focused RED for the approved Slice 23 contract, then implement schema, domain, strict handler, consumers, review hardening, complete gates, and the required per-tool `neat-freak` without an approval pause.

## STEP-211 — Establish Slice 23 focused RED

**Status:** Complete

**Goal:** Freeze executable acceptance behavior and prove the legacy direct handoff does not accidentally satisfy the new exact contract.

**Files changed:**

- `test/handoff-to-agent-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added fourteen focused tests covering the exact six-field/thirty-six-data-field schema, warning/failure constructors, cross-field rejection, mode/descriptor behavior, immutable preparation, no-write validation, meaningful append preflight, durable plan/two-log writing, handler artifact integrity, safe failures, provider drift, log-tail drift, Tool Card bounds, direct supertool preservation, protected compatibility, and Slice 24 flat isolation.
- Kept absent module imports nullable only so the entire RED surface could execute instead of aborting at module load.
- Corrected one initially vacuous schema-drift checkpoint by requiring the missing constructor before mutation assertions, then reran the complete suite.

**Verification commands:**

- `node --test --test-reporter=spec test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=dot test/handoff-to-agent-contract.test.mjs`

**Verification results:**

- First run: 1/14 passed only because the absent constructor made all negative mutation assertions throw; 13/14 failed on absent Slice 23 behavior.
- Corrected fresh RED: 0/14 passed and all fourteen failed.
- Failures mapped to missing schema/constructors, output descriptor, preparation/preflight/domain modules, nested MCP envelope, stable failures, provider/disk/log integrity, dedicated Tool Card, supertool title/envelope, protected compatibility, and native Stress migration.

**Decisions made:**

- Vacuous negative tests are not acceptable RED evidence; each such checkpoint must first prove the target constructor exists.
- The complete focused suite now forms the executable minimum for production work; expectations were not weakened to match legacy behavior.

**Risks or limitations:**

- The suite is deliberately red and is not a completion signal.
- Injected providers used by integrity tests may write a partial artifact before the handler rejects their drift, matching the documented non-transactional limitation.

**Rollback method:**

- Remove only the focused Slice 23 test and revert its live plan/index records if the slice is explicitly abandoned; preserve this append-only RED record through a correction.

**Next step:**

- Implement the exact Slice 23 schema, warning/failure constructors, fixed path definitions, and cross-field invariants, then run the focused schema checkpoints and Build.

## STEP-212 — Implement Slice 23 exact schema

**Status:** Complete

**Goal:** Establish the strict public shape and every invariant that can be proven without trusting provider or filesystem state.

**Files changed:**

- `src/tools/schemas/handoffToAgent.ts`
- `test/handoff-to-agent-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added the fixed append warning, exact diff-truncation suffix, fifteen safe error messages, nine ordered scaffold names, two ordered log names, and safe workspace/path/one-line schemas.
- Added the strict thirty-six-field data schema with configured-context path derivation, ordered scaffold subset, exact log identities, append equations, prior-file byte rule, plan write ceiling, diff UTF-8 byte/marker/change equations, prompt UTF-8 bytes, and hash syntax.
- Added the strict six-field envelope, discriminated stable errors, exact success/failure exclusivity, warning derivation, and constructors.
- Corrected the negative plan-byte fixture to exceed `max_write_bytes`; public metadata alone cannot prove final plan bytes against private plan content, so exact content/byte/hash agreement remains a provider and disk-integrity responsibility.

**Verification commands:**

- `node --test --test-reporter=spec --test-name-pattern="schema exports|schema derives|schema rejects" test/handoff-to-agent-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused schema checkpoints passed 3/3.
- TypeScript Build passed.

**Decisions made:**

- The schema proves public self-consistency; it does not pretend to recompute a hash from plan/event bodies that are deliberately absent from public data.
- Exact plan and event bytes/hashes must be proven twice later: against strict internal provider bodies and against durable disk artifacts.

**Risks or limitations:**

- The direct handler still returns its legacy flat result until Tasks 3–4 are implemented.
- Schema path derivation proves the reported paths agree but `PathGuard` remains responsible for native filesystem containment.

**Rollback method:**

- Remove the new schema and revert only its focused fixture/plan/live-index changes; preserve prior RED and design history.

**Next step:**

- Implement immutable request preparation, all-fixed-path no-write preflight, meaningful append semantics, deterministic plan/prompt/event construction, durable writes, and the Slice 24 compatibility wrapper in `src/handoffOps.ts`.

## STEP-213 — Implement Slice 23 durable-write domain

**Status:** Complete

**Goal:** Make every request, append, plan, diff, event, and fixed-path fact deterministic before wiring the public handler.

**Files changed:**

- `src/handoffOps.ts`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added typed immutable preparation with bounded normalized agent/name/model/title, exact ISO timestamp reuse, shell-safe model/path hints, deterministic Markdown and prompt construction, and pre-write oversize/secret rejection.
- Added write-strength preflight across all nine fixed scaffold targets, regular-file validation, bounded existing-plan text reads, canonical placeholder detection, requested-versus-applied append calculation, and final plan revalidation before any write.
- Added exact pre-call diff facts, final plan bytes/SHA-256, deterministic JSONL event bytes/SHA-256 containing the same plan hash, ordered dual-log identities, scaffold creation, plan write, and identical event append to both logs.
- Added a compatibility wrapper that maps the strengthened domain back to the legacy `writeAgentHandoff` shape for `handoff_to_codex` until Slice 24.
- Fixed optional-model normalization after the first domain run showed a missing model was incorrectly treated as an invalid empty required value.

**Verification commands:**

- `node --test --test-reporter=spec --test-name-pattern="request preparation|preflight distinguishes|domain writes" test/handoff-to-agent-contract.test.mjs`
- `npm run build`

**Verification results:**

- First focused domain run passed preparation and durable-write checkpoints but failed placeholder preflight because an absent optional model was rejected.
- After the minimal normalization fix, all focused domain checkpoints passed 3/3.
- TypeScript Build passed.

**Decisions made:**

- Blank optional model input normalizes to absent; it is not a request error.
- The public diff is computed against pre-call plan content even when `ensureAiBridge` temporarily creates the canonical placeholder.
- The same event line, including the final plan hash and append outcome, is appended to both logs.

**Risks or limitations:**

- Writes remain non-transactional; a second-log failure can leave the plan and first log updated while returning failure.
- Fixed paths are re-resolved during writes, so filesystem races remain possible until later transaction/sandbox phases.

**Rollback method:**

- Remove `src/handoffOps.ts` and revert only its plan/live-index records; the public legacy handler remains untouched at this step.

**Next step:**

- Replace only direct `handoff_to_agent` with the strict provider boundary, failure classifier, exact nested output, durable plan/log-tail verification, and bounded human result while routing Slice 24 through the compatibility wrapper.

## STEP-214 — Integrate Slice 23 strict handler and artifact boundary

**Status:** Complete

**Goal:** Make direct MCP success mean that one exact plan and the same exact event in both logs are durably observable.

**Files changed:**

- `src/server.ts`
- `src/handoffOps.ts`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added strict handoff provider-result parsing, `handoffToAgentProvider` and deterministic ISO clock dependencies, stable workspace/request/path/read/size/secret/scaffold/plan/log/provider failure classification, exact output descriptor, and structured-content preservation.
- Replaced only direct `handoff_to_agent` with prepared request/output handling, strict provider echo/integrity validation, exact thirty-six-field data construction, warning derivation, bounded human text, and safe MCP error semantics.
- Reopened `current-plan.md` through `PathGuard` and verified exact bytes/content/SHA-256; read exactly one event-sized tail from each fixed log and verified byte-for-byte content plus SHA-256 before returning success.
- Strengthened preflight/provider agreement by recording the exact ordered paths absent before the call and requiring `ensureAiBridge` to create exactly that set; unexpected filesystem races now fail closed.
- Removed the legacy in-server handoff implementation and routed the still-flat Slice 24 handler through the domain compatibility wrapper.

**Verification commands:**

- `npm run build`
- `node --test --test-reporter=spec --test-name-pattern="descriptor and mode|MCP success|stable safe failures|provider identity|mismatched durable" test/handoff-to-agent-contract.test.mjs`

**Verification results:**

- TypeScript Build passed.
- Focused descriptor/handler/provider/disk/log checkpoints passed 5/5.
- Provider identity drift, a removed plan artifact, and an appended mismatching log tail all returned exact safe `INTERNAL_ERROR` failures.

**Decisions made:**

- Created scaffold identities are exact preflight-to-provider facts, not an unverified provider claim.
- Final log verification reads only the exact event-sized tails, so existing append-only history is neither returned nor loaded wholesale.
- Provider schema/integrity drift is internal failure; recognized operating failures retain their stable specific code.

**Risks or limitations:**

- Integrity checks occur after writes and therefore detect but do not roll back partial mutation.
- A filesystem actor can still race between preflight, writes, and final reads; detected drift fails closed but later sandbox/transaction work is required for stronger isolation.

**Rollback method:**

- Revert the direct handler/provider imports and the preflight expected-created-path check while retaining `handoff_to_codex` compatibility; do not reset unrelated unpublished slices.

**Next step:**

- Migrate the dedicated Tool Card, exact protected-Smoke loader substitution, and native Stress supertool assertion; prove protected sources and Slice 24 flat output remain unchanged.

## STEP-215 — Migrate Slice 23 consumers

**Status:** Complete

**Goal:** Move every in-scope direct consumer to nested data without altering protected Smoke sources or prematurely migrating Slice 24.

**Files changed:**

- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/stress.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added a dedicated nested-first `handoffToAgentResultData` path and bounded failure/success Tool Card rendering for target/model, append outcome, plan hash/bytes, both logs, prompt, and diff.
- Retained flat fallback for `handoff_to_codex` and split the render routes explicitly so Slice 24 remains independently migratable.
- Added one exact fail-closed main-Smoke compatibility substitution for the only protected flat direct-agent read; protected main and HTTP Smoke sources remain unchanged.
- Strengthened native minimal-handoff Stress to require the exact nested direct supertool success and target agent.

**Verification commands:**

- `node --test --test-reporter=spec test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=spec test/handoff-to-agent-contract.test.mjs test/read-handoff-contract.test.mjs test/wait-for-handoff-contract.test.mjs test/export-pro-context-contract.test.mjs test/write-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused Slice 23 contract passed 14/14.
- Focused-plus-adjacent handoff/read/wait/export/write contracts passed 76/76.
- TypeScript Build passed.
- The focused consumer checkpoint proved the exact compatibility strings/count, unchanged protected-source read, nested supertool child, and legacy flat Slice 24 result.

**Decisions made:**

- Exact structured prompt/diff remain preserved for machine consumers; only MCP human text and Tool Card previews are bounded separately.
- HTTP Smoke needs no Slice 23 field substitution because it advertises but does not consume the handoff result.

**Risks or limitations:**

- The compatibility loader intentionally depends on one exact protected-source expression and fails closed when it drifts.
- The Tool Card flat fallback remains until Slice 24 and must be removed or narrowed only from that slice's own evidence.

**Rollback method:**

- Revert only the Tool Card helper/render changes, one compatibility substitution, and Stress assertion; protected sources require no rollback.

**Next step:**

- Perform the required post-result adversarial review of preflight/write ordering, placeholder/append meaning, limits/secrets, path races, diff/event/log integrity, shell quoting, provider drift, and UI bounds; add deliberate RED for material defects before broad gates.

## STEP-216 — Review and harden Slice 23

**Status:** Complete

**Goal:** Challenge the usable result at Windows/path/append boundaries and fix material defects before broad completion gates.

**Files changed:**

- `src/handoffOps.ts`
- `test/handoff-to-agent-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-handoff-to-agent-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Reviewed request normalization, all preflight/write ordering, canonical placeholder meaning, UTF-8 and secret limits, fixed path/ancestor containment, symlink/junction and TOCTOU behavior, pre-call diff semantics, partial scaffold/plan/two-log failure, deterministic JSONL/event/hash framing, exact tail reads, shell quoting, provider drift, and human/Tool Card bounds.
- Deliberate RED found that the canonical placeholder with Windows CRLF was treated as a meaningful prior plan and that a file occupying the context directory was not rejected until scaffold creation.
- Extended the path case to a nested configured directory whose existing ancestor was a file; the first direct-directory fix deliberately failed that deeper checkpoint, preventing a narrow patch.
- Normalized CRLF/CR only for placeholder identity and now walks every existing context-directory component, requiring directory semantics before checking fixed artifact targets.

**Verification commands:**

- `node --test --test-reporter=spec --test-name-pattern="Windows CRLF|context directory that is a file" test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=spec --test-name-pattern="context directory or existing ancestor" test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=spec --test-name-pattern="Windows CRLF|context directory or existing ancestor" test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=spec test/handoff-to-agent-contract.test.mjs`
- `node --test --test-reporter=dot test/handoff-to-agent-contract.test.mjs test/read-handoff-contract.test.mjs test/wait-for-handoff-contract.test.mjs test/export-pro-context-contract.test.mjs test/write-contract.test.mjs`
- `npm run build`

**Verification results:**

- Initial deliberate hardening RED passed as evidence at 0/2: CRLF placeholder append state was wrong and a file-shaped context directory was not rejected in preflight.
- After fixing the direct-directory case, the nested file-shaped ancestor extension deliberately failed 0/1; the generalized ancestor walk then made both targeted checkpoints pass 2/2.
- Final focused Slice 23 contract passed 16/16.
- Final focused-plus-adjacent contracts passed 78/78.
- TypeScript Build passed.

**Decisions made:**

- Canonical scaffold identity is line-ending-insensitive so Windows checkout/editor conventions do not create a false prior plan.
- Every existing component of a nested configured context directory must be directory-shaped before provider execution; failure is exact `OUTPUT_PATH_INVALID` and occurs without writes.
- Internal symlinks that remain inside the workspace are evaluated through `stat`, while `PathGuard` continues to reject blocked or escaping targets.

**Risks or limitations:**

- File type can still change after preflight; later mismatches fail but are not rolled back.
- Only canonical placeholder line endings are normalized; arbitrary edited text remains a meaningful plan by design.

**Rollback method:**

- Revert only the two focused tests, line-ending normalization, context-component walk, and design clarification; retain the usable Slice 23 result and earlier records.

**Next step:**

- Run complete regression, all Smoke commands, native-Windows Stress, package and static gates, then apply the required per-tool `neat-freak` reconciliation and continue directly to Slice 24.

## STEP-217 — Complete Slice 23 gates and per-tool `neat-freak`

**Status:** Complete

**Goal:** Close the locally usable Slice 23 result with fresh broad evidence, fix every gate defect at its source, reconcile durable project knowledge, and leave the unified Slice 17–28 batch unpublished for uninterrupted Slice 24 work.

**Files changed:**

- `src/handoffOps.ts`
- `scripts/smoke-platform-compat.mjs`
- `test/handoff-to-agent-contract.test.mjs`
- `test/tree-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-handoff-to-agent-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-handoff-to-agent-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Fixed a stale bounded `tree` contract fixture that assumed `tree.ts` would remain inside the first twenty sorted schema entries; the test now verifies the exact twenty-entry boundary, truncation marker, and a stable in-bound Slice 23 file without weakening production truncation.
- Added deliberate RED proving an existing plan above `maxReadBytes` but below `maxWriteBytes` was incorrectly read. Restored the independent read ceiling to `maxReadBytes`, retained the final-plan `maxWriteBytes` ceiling, and proved failure leaves the existing plan and logs untouched.
- Migrated the one protected-Smoke legacy free-text oversize assertion to stable `EXISTING_PLAN_TOO_LARGE` matching through an exact-count fail-closed in-memory substitution; both protected Smoke sources remain unchanged.
- Ran complete regression, all eight Smoke commands, native-Windows Stress, package dry-run, exact-scope, protected-source, Git-index, secret-pattern, whitespace, Markdown, reference, spec/plan pairing, memory, archive, package, branch, remote, and required-file checks.
- Applied the user-required `neat-freak`: reconciled the Slice 23 design/plan, master plan, historical roadmap, project instructions, concise memory, and active archive; kept README, README_ZH, CHANGELOG, SECURITY, FAQ, public setup, and deployment content unchanged because the slice remains unpublished and does not change advertised inputs or availability.

**Verification commands:**

- `node --test --test-name-pattern="above the read limit" test/handoff-to-agent-contract.test.mjs`
- `node --test --test-name-pattern="compatibility is exact" test/handoff-to-agent-contract.test.mjs`
- `node --test test/handoff-to-agent-contract.test.mjs`
- `node --test test/handoff-to-agent-contract.test.mjs test/read-handoff-contract.test.mjs test/wait-for-handoff-contract.test.mjs test/export-pro-context-contract.test.mjs test/write-contract.test.mjs`
- `node --test test/tree-contract.test.mjs`
- `node --test test/*.test.mjs`
- `npm run build`
- `npm run smoke`, with the last three long-running sections also rerun individually for explicit exit codes
- `npm run stress`
- `npm pack --dry-run --json`
- explicit 50-path expected-versus-actual unpublished-scope comparison
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- `git diff --check`
- secret-pattern scan across every changed and untracked path
- all-Markdown relative-link and mixed-newline stateful balanced-fence audit
- exact spec/plan pair, `AGENTS.md` reference, required-file, package, branch, remote, memory-size, archive-size, knowledge-volume, `CLAUDE.md`, and Git-index checks

**Verification results:**

- Focused Slice 23 passed 17/17; focused-plus-adjacent contracts passed 79/79; complete Node regression passed 374/374; TypeScript Build passed.
- All eight Smoke commands passed. Native-Windows Stress passed, including its Build prerequisite.
- Package dry-run passed with 147 files, 425,072 bytes compressed, and 2,263,335 bytes unpacked; the compiled handoff domain/schema were included and internal memory/spec/plan files remained excluded.
- Exact unified unpublished scope passed at 50 paths; the Git index remained empty. Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained unchanged. Secret scanning found zero unapproved secret-shaped values across all 50 paths; the single exact fake GitHub-token fixture remains an intentional secret-blocking test input.
- Markdown audit passed for 80 files and 19 relative links with zero broken links or unbalanced fences after correctly handling CRLF, LF, and CR-only line boundaries. All 23 spec/plan pairs existed with no orphans, and all 35 repository references in the `AGENTS.md` documentation map resolved.
- Before this archive append, `Memory.md` measured 143 lines / 17,072 bytes, `AGENTS.md` measured 200 lines / 13,598 bytes, and the active archive measured 39,445 bytes, below its 52,428-byte rollover threshold. Project Markdown measured 1,908,059 bytes, so no knowledge-volume inversion exists.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings.

**Decisions made:**

- Read and write ceilings remain separate authority boundaries: existing plan reads use `maxReadBytes`; only the generated final plan uses `maxWriteBytes`.
- Protected-Smoke compatibility follows the new stable error code through one exact substitution rather than reintroducing legacy free-text error wording into the public contract.
- Bounded directory tests assert boundary behavior and stable in-bound content, not an alphabetically late filename whose position changes as schemas are added.
- Slice 23 is locally complete, reviewed, reconciled, and still unpublished; Slice 24 remains the next direct tool and receives its own design/TDD evidence.

**Risks or limitations:**

- Scaffold, plan, and two-log writes remain non-transactional; a late failure can leave partial durable changes while still failing closed.
- Filesystem races remain possible between preflight, provider writes, and final integrity reads; detected drift does not return success and is not rolled back.
- The exact compatibility loader intentionally fails closed when either protected legacy expression drifts.
- `handoff_to_codex` remains flat until Slice 24; no exact-head cross-platform CI runs before the unified Slice 17–28 publication.

**Rollback method:**

- Revert only the Slice 23 schema/domain/test, its direct handler/Tool Card/compatibility/Stress changes, the bounded tree-fixture adjustment, and STEP-210 through STEP-217 live-document records. Do not reset or rewrite the shared unpublished Slices 17–22 tree or closed archive history.

**Next step:**

- Start fresh inventory and exact-contract design for Slice 24 `handoff_to_codex`; continue without staging, committing, pushing, publication, or exact-head CI.

## STEP-218 — Design Slice 24 `handoff_to_codex` exact contract

**Status:** Complete

**Goal:** Freeze the smallest exact contract for the fixed Codex handoff adapter before changing production behavior.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-handoff-to-codex-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Inventoried the legacy flat handler, temporary `writeAgentHandoff` wrapper, shared hardened domain, tool-mode registration, `codex_handoff` alias, Tool Card fallback, protected Smoke calls, native Stress coverage, and CLI plan-hash consumers.
- Approved a distinct six-field Slice 24 envelope with the same thirty-six durable handoff facts, fixed `agent=codex`, `agent_name=Codex`, `model=null`, `tool_mode=full`, and one Codex-specific append warning.
- Preserved the four inputs, full-only visibility, planning-only write exception, fixed artifacts, Codex prompt, and connection-test hiding; standard/minimal handoff surfaces remain unchanged.
- Kept independent `maxReadBytes` and `maxWriteBytes` authority boundaries and required exact provider/preflight identity plus final plan and two-log-tail rereads before success.
- Defined fifteen safe fixed failures, an independent provider/clock seam, nested Tool Card migration, protected-source zero-change behavior, full-mode native Stress coverage, and `codexpro` child-envelope preservation.
- Wrote a seven-task TDD plan covering focused RED, exact schema, shared validated provider extraction, direct handler, consumers, post-result review, complete gates, and per-tool `neat-freak`.

**Verification commands:**

- fresh `rg`/targeted source inventory across handler, domain, tool modes, aliases, Tool Card, protected Smoke, Stress, tests, CLI handoff execution, and roadmap
- exact design/plan review against current Slice 23 contracts and the authoritative master plan
- `git diff --check`
- spec/plan pairing and required-path checks
- memory and active-archive size checks

**Verification results:**

- Current production behavior is confirmed as a four-input, full-only, fixed-Codex compatibility wrapper over the hardened handoff domain.
- Protected main Smoke calls the tool but reads no result fields; protected HTTP Smoke checks only advertisement, so Slice 24 requires no new protected-source substitution.
- No dedicated Slice 24 schema or test existed before this step; the new design/plan pair is the twenty-fourth exact-contract pair.
- No source, runtime behavior, dependency, credential, Git index, or external state changed.

**Decisions made:**

- Slice 24 returns the same machine-useful durable facts as Slice 23 rather than a smaller flat compatibility subset; this makes plan hash, append outcome, and log integrity equally observable.
- Fixed Codex identity is enforced in both schema and provider validation, not inferred only from the tool name.
- Full-only visibility is compatibility behavior and remains unchanged; `writeMode=handoff` does not implicitly add this tool to minimal or standard surfaces.
- The temporary flat wrapper is removed only after the direct handler and every consumer migrate.

**Risks or limitations:**

- The shared handoff writer remains non-transactional and subject to detected but non-rolled-back filesystem races.
- Extracting shared provider validation can regress Slice 23 if not guarded by its full focused contract.
- Exact error/result migration is a schema-breaking output change and therefore remains unpublished until the unified Slice 17–28 batch.

**Rollback method:**

- Remove only the new Slice 24 design/plan pair and revert this step's live-index status lines. Do not alter Slice 23 implementation or STEP-217.

**Next step:**

- Add the focused Slice 24 contract suite and run deliberate RED before creating the schema or changing the handler.

## STEP-219 — Establish Slice 24 focused RED

**Status:** Complete

**Goal:** Convert the approved Slice 24 design into executable failing acceptance evidence before production implementation.

**Files changed:**

- `test/handoff-to-codex-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-handoff-to-codex-output-schema.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-7.md`

**Implementation summary:**

- Added fourteen focused tests with optional schema loading, in-memory MCP clients, canonical temp workspaces, deterministic provider/clock seams, exact result/failure helpers, Tool Card/source inspection, and native-Stress expectations.
- Froze the strict six-field envelope, exact thirty-six data keys, fixed Codex identity, full-only tool surface, one warning, fifteen safe failures, four inputs/defaults, meaningful append behavior, independent read/write ceilings, plan/event/diff/prompt integrity, and ordered scaffold/log paths.
- Added real MCP success/append/failure expectations, provider identity drift, removed plan, mismatched log-tail rejection, nested Tool Card, `codex_handoff` supertool preservation, protected-source zero-change, removal of the flat wrapper, and Slice 23 consumer migration checks.

**Verification commands:**

- `node --test test/handoff-to-codex-contract.test.mjs`

**Verification results:**

- Deliberate RED passed as evidence at 0/14: every test failed on missing Slice 24 schema/constructors/output descriptor/nested result, ignored Slice 24 provider seam, still-flat Tool Card/supertool/consumer behavior, or the retained temporary wrapper.
- All fourteen tests executed; none failed because of test syntax, module bootstrap, fixture setup, or an unrelated product regression.

**Decisions made:**

- The RED suite expects explicit `REQUEST_INVALID` for normalized titles over 120 characters instead of preserving the legacy wrapper's silent truncation.
- Protected Smoke sources remain direct evidence inputs and are not edited by the Slice 24 test.
- Shared Slice 23 domain behavior is treated as an implementation prerequisite, while the RED specifically targets the missing public Slice 24 contract.

**Risks or limitations:**

- Provider and durable-integrity tests cannot exercise their injected seams until the handler accepts independent Slice 24 dependencies.
- Static consumer assertions intentionally fail until the flat Slice 23 compatibility expectation and wrapper are removed in the same migration.

**Rollback method:**

- Remove only `test/handoff-to-codex-contract.test.mjs` and revert this step's plan/live-index records; no production behavior changed.

**Next step:**

- Implement only `src/tools/schemas/handoffToCodex.ts`, run the three schema-focused tests and Build, then proceed to the shared validated provider boundary.

# CodexPro Phase 1 Implementation Archive — Volume 5

This append-only volume continues Phase 1 from STEP-180 after Volume 4 crossed the 80% rollover threshold at STEP-179.

Do not rewrite closed earlier volumes. Append corrections as new entries.

## STEP-180 — Establish the Slice 17 `codexpro_inventory` focused RED

**Status:** Complete

**Goal:** Freeze the approved direct `codexpro_inventory` contract as executable tests and prove that the current flat implementation does not already satisfy it.

**Files changed:**

- `test/codexpro-inventory-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added thirteen focused contract tests covering the exact schema constructors, bounded warnings, stable failures, strict malformed-output rejection, full-mode descriptor, real bounded Skill discovery, provider injection, redacted failure stages, Tool Card migration, supertool preservation, Stress migration, and protected Smoke invariants.
- Kept production source unchanged so the first run is a genuine TDD RED.

**Verification commands:**

- `node --test test/codexpro-inventory-contract.test.mjs`

**Verification results:**

- RED passed as a development gate: 13 tests executed, 0 passed, and 13 failed for the expected missing schema, provider, nested-envelope, Tool Card, supertool, and Stress behavior.
- The Node test runner, TypeScript loader, temporary-workspace setup, MCP client fixture, and existing server all loaded and executed; no test syntax or harness failure blocked the behavioral signal.

**Decisions made:**

- Treat 0/13 as the authoritative Slice 17 baseline.
- Implement the pure exact schema before changing discovery, handler, or consumer behavior.

**Risks or limitations:**

- The focused suite remains red until the planned production tasks are completed.
- No complete regression, build, Smoke, Stress, package, or publication gate was run at this RED-only step.

**Rollback method:**

- Remove `test/codexpro-inventory-contract.test.mjs` and append a correction entry; do not rewrite this archive record.

**Next step:**

- Add `src/tools/schemas/codexproInventory.ts`, rerun the focused contract, and record the schema-only intermediate result.

## STEP-181 — Implement the Slice 17 exact schema

**Status:** Complete

**Goal:** Implement the pure public `codexpro_inventory` contract before changing discovery or handler behavior.

**Files changed:**

- `src/tools/schemas/codexproInventory.ts`
- `Memory.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added the exact six-field envelope and sixteen-field success data schema.
- Added strict Skill/MCP item schemas, sanitized selector rules, deterministic ordering, duplicate rejection, mathematical count checks, include-flag enforcement, and exact truncation invariants.
- Added fixed Skill/MCP truncation warnings and three exact non-retryable failure variants with redacted details.
- Added pure success/failure constructors that derive warnings from validated data.

**Verification commands:**

- `node --test test/codexpro-inventory-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused intermediate: 13 executed, 4 passed, and 9 failed only in the not-yet-migrated descriptor, handler, Tool Card, supertool, and Stress groups.
- All four pure schema groups passed.
- TypeScript build passed.

**Decisions made:**

- Schema v1 accepts only fixed MCP source labels and source-appropriate Skill selectors.
- Success warnings are derived, ordered, and exact rather than provider-controlled.

**Risks or limitations:**

- Production discovery still silently truncates and can expose an absolute external display path until Task 3 is complete.
- Direct public results remain flat until the handler task.

**Rollback method:**

- Remove `src/tools/schemas/codexproInventory.ts` together with its focused test imports and append a correction record.

**Next step:**

- Implement bounded domain discovery, explicit truncation booleans, deterministic sorting, and `$EXTERNAL/<fingerprint>/SKILL.md` selectors.

## STEP-182 — Implement and post-review Slice 17 production behavior

**Status:** Complete

**Goal:** Complete the direct `codexpro_inventory` production migration and correct issues found by reviewing the usable result.

**Files changed:**

- `src/capabilitiesOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `test/codexpro-inventory-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added deterministic bounded Skill discovery with one-item truncation probing, fixed-source MCP discovery with explicit cap metadata, and hashed `$EXTERNAL` selectors instead of raw outside paths.
- Added strict provider dependency injection and validation, exact output descriptor, effective option echoing, mathematical counts, handler-built safe text, and three redacted failure stages.
- Migrated Tool Card rendering to nested-first data with failure UI and historical flat fallback.
- Migrated Stress reads to nested data and added explicit Skill/MCP truncation assertions.
- Post-result review tightened whitespace rejection, sanitized fallback Skill names, deduplicated overlapping discovery roots, and made workspace/home classification use native relative-path semantics for Windows case handling.

**Verification commands:**

- `node --test test/codexpro-inventory-contract.test.mjs`
- `node --test test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/list-workspaces-contract.test.mjs test/inspect-workspace-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused contract passed 13/13 after a deliberate post-review RED for whitespace-only inventory identities was corrected.
- Adjacent workspace contracts passed 74/74.
- TypeScript build passed.

**Decisions made:**

- Public provider output never supplies workspace identity, modes, limits, counts, warnings, or human-readable text; the handler derives them.
- Invalid provider output fails as `INTERNAL_ERROR`; provider execution failure remains distinct as `INVENTORY_DISCOVERY_FAILED`.
- Historical Tool Card payloads stay readable, but current output is never flattened for compatibility.

**Risks or limitations:**

- Skill discovery returns a deterministic bounded subset rather than computing a complete-machine total.
- Twelve-hex external selectors are identifiers, not permissions; `load_skill` still rediscovers and exact-matches a private record before reading.
- Complete Smoke, Stress, package, diff, and secret gates remain pending.

**Rollback method:**

- Revert the schema, discovery result changes, handler, Tool Card, Stress, and focused test together; do not weaken path or secret guards and do not delete user Skill/MCP files.

**Next step:**

- Run the complete local verification matrix and reconcile all Slice 17 status documents without staging or publishing.

## STEP-183 — Complete Slice 17 local verification and stop at publication approval

**Status:** Complete

**Goal:** Prove the reviewed Slice 17 result across the complete local matrix, reconcile durable status, and stop before any publication state change.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1-part-5.md`
- `docs/superpowers/plans/2026-07-13-codexpro-inventory-output-schema.md`
- all Slice 17 implementation/test files from STEP-180 through STEP-182 were reviewed

**Implementation summary:**

- Ran the complete regression, project-defined eight-section Smoke suite, native-Windows Stress, and package dry-run after focused and adjacent GREEN.
- Reconciled the authoritative plan to 17/28 locally complete, 16/28 published, and eleven locally unmigrated tools.
- Marked all six implementation-plan tasks complete and changed the active stopping point to the explicit publication approval gate.
- Confirmed the two protected Smoke source files stayed unchanged and the exact changed-file set contains only fourteen intended Slice 17/plan files.

**Verification commands:**

- `node --test test/codexpro-inventory-contract.test.mjs`
- `node --test test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/list-workspaces-contract.test.mjs test/inspect-workspace-contract.test.mjs`
- `npm run build`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run`
- exact expected-versus-actual changed-file comparison using `git diff --name-only` plus untracked files
- `git diff --check`
- `git diff --quiet -- scripts/smoke.mjs scripts/http-smoke.mjs`
- targeted private-key/OpenAI/GitHub-token pattern scan over all changed files
- balanced-code-fence and unresolved-placeholder scan over the master plan, design, and execution plan

**Verification results:**

- Focused: 13/13 passed after initial RED 0/13 and schema-only 4/13.
- Adjacent workspace contracts: 74/74 passed.
- Complete regression: 276/276 passed.
- TypeScript Build passed, including the Build repeated by Stress and package prepack.
- All eight Smoke sections passed: analysis, analysis CLI, protected main compatibility, HTTP compatibility, Pro, Doctor, Settings, and execute/watch/loop handoff.
- Native-Windows Stress passed with 141 Skills, a 140 return limit, 160 configured MCP names, a 120 return limit, both truncation flags, high-index Skill loading, and retained secret-leak assertions.
- Package dry-run passed with 133 files, 353.4 kB compressed, and 1.8 MB unpacked; internal project Memory/spec/plan files stayed excluded.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings.
- Actual changes matched the fourteen-file allowlist; protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` were unchanged.
- Targeted secret-pattern scan returned no matches; document fence/placeholder checks passed.

**Decisions made:**

- Count Slice 17 as locally complete but not published until its implementation is committed, pushed, and verified by exact-head Ubuntu/Windows Node 20/24 CI.
- Do not stack Slice 18 implementation on this uncommitted slice; preserve the small, reviewable, independently reversible publication boundary.

**Risks or limitations:**

- Skill inventory is deliberately bounded and does not claim a full-machine total.
- `$EXTERNAL/<12-hex>/SKILL.md` is a non-secret selector, not a permission grant; later loading still requires private rediscovery and exact matching.
- Exact-head cross-platform CI has not run because no publication action is authorized yet.

**Rollback method:**

- Before publication, revert only the fourteen intended working-tree files with a reviewed normal reverse patch; never use destructive reset or delete user Skill/MCP configuration.
- After publication, use a normal Git revert of the Slice 17 commit and preserve append-only archive corrections.

**Next step:**

- Ask for explicit approval to stage, commit with suggested message `feat: add exact codexpro inventory contract`, push, and verify exact-head CI. After publication succeeds, begin Slice 18 `load_skill` design review.

## STEP-184 — Adopt one unified publication batch for the remaining Phase 1 tools

**Status:** Complete

**Goal:** Replace the per-slice publication stop with the user's approved continuous implementation rule while preserving all local quality gates.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Recorded Slice 17–28 as one twelve-tool local implementation batch.
- Prohibited staging, commit, push, and exact-head CI until all twelve tools are locally complete.
- Required every completed tool to run focused and relevant wider verification followed by `neat-freak` reconciliation before the next tool begins.
- Activated Slice 18 `load_skill` without publishing Slice 17 first.

**Verification commands:**

- targeted status-text searches across `AGENTS.md`, `Memory.md`, and the authoritative master plan
- `git diff --check`

**Verification results:**

- The three active control documents now agree on the continuous implementation and end-of-goal publication rule.
- `git diff --check` remains a pending post-edit check for this STEP and must be run before Slice 18 production changes are claimed complete.

**Decisions made:**

- The user's instruction is conditional authorization for one unified stage/commit/push/exact-head-CI publication after all twelve tools complete; it is not authorization for intermediate publication.
- Per-tool design, TDD, local verification, append-only records, and rollback reasoning remain mandatory even though Git publication is batched.

**Risks or limitations:**

- A single unpublished working tree grows across slices, so exact per-tool tests, file inventories, plans, archive entries, and `neat-freak` checks become the primary local review boundaries.
- Git-level per-slice rollback is unavailable before the final publication; rollback must use reviewed normal reverse patches scoped by each slice's documented file set.

**Rollback method:**

- Append a correction entry and restore the former per-slice publication wording with a normal reviewed patch; do not rewrite STEP-183 or this entry.

**Next step:**

- Complete the Slice 18 `load_skill` design, TDD implementation, verification, and `neat-freak` reconciliation, then continue directly to Slice 19.

## Correction to STEP-184 — Record the completed post-edit verification

**Status:** Complete

**Goal:** Correct the provisional verification wording in STEP-184 after the named check completed.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Reconciled the remaining active roadmap and documentation-map wording with the unified publication decision.
- Preserved STEP-184 unchanged and appended this correction instead of rewriting its provisional result.

**Verification commands:**

- `git diff --check`
- targeted `rg` status checks across the five active control documents
- `Get-Item` and `Get-Content` size checks for `AGENTS.md`, `Memory.md`, and the active archive

**Verification results:**

- `git diff --check` passed with only the established LF-to-CRLF working-copy warnings.
- Active control documents agree that Slice 17–28 are implemented continuously and published only after all twelve complete.
- `Memory.md` is 150 lines and remains below its byte limit after consolidation.

**Decisions made:**

- The correction is append-only; STEP-184 remains historical evidence of the order in which verification occurred.

**Risks or limitations:**

- Exact file sizes continue to grow as later slices are recorded and must be rechecked by every per-tool `neat-freak` pass.

**Rollback method:**

- Append a later correction if the unified publication decision changes; do not rewrite this record.

**Next step:**

- Continue Slice 18 `load_skill` design and TDD.

## STEP-185 — Establish the Slice 18 `load_skill` focused RED

**Status:** Complete

**Goal:** Freeze the reviewed direct `load_skill` contract as executable behavior before changing production code.

**Files changed:**

- `docs/superpowers/specs/2026-07-13-load-skill-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-load-skill-output-schema.md`
- `test/load-skill-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added the full Slice 18 design and seven-task TDD plan.
- Added fifteen focused tests covering exact schema construction, warnings, eight failure families, strict invariants, mode/descriptor behavior, real loading, partial discovery, redaction, byte semantics, provider validation, Tool Card preservation, supertool behavior, Stress migration, and protected compatibility loaders.
- Left production behavior unchanged for a genuine RED.

**Verification commands:**

- `node --test test/load-skill-contract.test.mjs`

**Verification results:**

- RED passed as a development gate: 15 tests executed, 0 passed, and 15 failed for the expected missing Schema, output descriptor, nested runtime, provider seam, resolver, Tool Card, supertool-title, Stress, and compatibility-loader behavior.
- The Node runner, TypeScript loader, MCP in-memory transport, temporary workspaces, real current loader, and fixture cleanup all executed successfully.

**Decisions made:**

- Public success uses fourteen exact data fields, including the normalized selector, source/read limits, source and returned byte counts, partial-resolution state, and redaction state.
- Partial discovery may succeed only with an exact matched path; otherwise it fails closed instead of claiming uniqueness or absence.
- The public boundary/read failure details use the already sanitized resolved Skill item.

**Risks or limitations:**

- All focused tests remain red until the schema, domain resolver, handler, and consumers are migrated.
- The protected Smoke source files remain intentionally unchanged; only their compatibility loaders will be edited.

**Rollback method:**

- Remove the two Slice 18 documents and focused test with a reviewed reverse patch, then append a correction; do not rewrite this entry.

**Next step:**

- Implement only `src/tools/schemas/loadSkill.ts`, run the schema checkpoint, and keep runtime/consumer behavior untouched.

## STEP-186 — Implement the Slice 18 exact schema

**Status:** Complete

**Goal:** Add the pure public `load_skill` protocol before changing resolver, handler, or consumers.

**Files changed:**

- `src/tools/schemas/loadSkill.ts`
- `docs/superpowers/plans/2026-07-13-load-skill-output-schema.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added the strict six-field envelope and fourteen-field success data schema.
- Added source-aware selector and Skill validation, request/result identity checks, effective global-source constraints, raw/returned/total byte relationships, exact truncation rules, zero-byte behavior, and partial-resolution invariants.
- Added exact truncation and redaction warnings derived from validated data.
- Added eight stable failure families with bounded sanitized details and pure success/failure constructors.

**Verification commands:**

- `node --test test/load-skill-contract.test.mjs`
- `npm run build`

**Verification results:**

- Focused schema checkpoint: 15 executed, 4 passed, and 11 failed only in not-yet-migrated descriptor/runtime/provider/Tool Card/supertool/consumer behavior.
- All four pure schema groups passed.
- TypeScript Build passed.

**Decisions made:**

- Boundary and read failures expose only the sanitized resolved Skill item, not the raw filesystem error or private absolute path.
- `bytes` describes raw source bytes read while `returned_bytes` exactly describes the post-redaction public text.
- Partial discovery success is schema-valid only when an exact path selector was supplied.

**Risks or limitations:**

- Runtime output remains flat until the handler migration.
- The new domain resolver changes are not yet represented by the direct public handler.

**Rollback method:**

- Remove `src/tools/schemas/loadSkill.ts` with its focused imports using a reviewed reverse patch and append a correction.

**Next step:**

- Complete the typed bounded resolver and exact direct handler, then rerun the focused suite.

## STEP-187 — Implement and harden the Slice 18 `load_skill` runtime

**Status:** Complete

**Goal:** Replace the flat direct `load_skill` response with the approved strict contract while making bounded Skill resolution fail closed and preserving current tool visibility and capability boundaries.

**Files changed:**

- `src/tools/schemas/loadSkill.ts`
- `src/capabilitiesOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- `test/load-skill-contract.test.mjs`
- `docs/superpowers/specs/2026-07-13-load-skill-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-load-skill-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added explicit discovery truncation state and typed expected domain failures for not-found, ambiguity, resolution-limit, boundary, and read outcomes.
- Made name-only resolution fail closed when the 500-item discovery bound prevents a uniqueness or absence proof; exact matched selectors may succeed while reporting partial resolution.
- Revalidated the selected native realpath immediately before reading and stopped exposing raw filesystem errors or absolute private paths.
- Added the exact direct handler, dependency seam, strict provider validation, effective-option echoing, pre-construction redaction, post-redaction returned-byte accounting, fixed failures, and exact `outputSchema`.
- Added tool-local structured-content preservation so a Tool Card cannot compact a validated long body and invalidate its byte contract.
- Migrated the bounded Tool Card, Stress, main-Smoke compatibility loader, HTTP-Smoke compatibility loader, and supertool consumers to nested `data`; protected Smoke sources remained unchanged.
- Post-result review added deliberate RED cases and minimum fixes for ambiguous-candidate selector drift, impossible provider body/source-byte expansion, truthful cross-source boundary wording, and typed errors crossing duplicated module-loader identities.

**Verification commands:**

- `node --test test/load-skill-contract.test.mjs`
- `node --test test/load-skill-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/list-workspaces-contract.test.mjs test/inspect-workspace-contract.test.mjs`
- `node --test test/codexpro-inventory-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs`
- `npm run build`

**Verification results:**

- First runtime/consumer GREEN: focused 15/15 and Build passed.
- Broad adjacent workspace/inventory run: 102/102 passed.
- The deliberate hardening RED reproduced two failures: candidate identity was not selector-bound and a 1-byte provider record could return a 1,000-byte unredacted body.
- After the minimum fixes, focused 15/15, Build, and the post-hardening adjacent run 64/64 passed.
- The later typed-error classification test first exposed the duplicated-loader `instanceof` weakness, then passed after recognition required an `Error`, exact class name, one of five allowed codes, and an object context before strict public reconstruction.

**Decisions made:**

- Ambiguous candidates must match every non-null selector component; injected provider or domain details cannot drift from the request.
- Pre-redaction decoded text may use at most the worst-case three UTF-8 replacement bytes per raw source byte; redaction expansion remains described separately by `returned_bytes`.
- Expected typed domain errors may cross module-loader identity boundaries only through a narrow structural check; all public data remains rebuilt through strict schemas.
- `SKILL_BOUNDARY_VIOLATION` uses source-neutral wording and exposes only the sanitized resolved Skill item because the identity check applies to workspace, user, plugin, and external selectors.

**Risks or limitations:**

- Discovery remains bounded at 500 records. A name-only request may therefore receive `SKILL_RESOLUTION_LIMIT_REACHED` and must retry with an exact sanitized inventory selector.
- Native realpath revalidation narrows filesystem races but does not create OS-level atomic containment. Skill trust, hashes, permissions, and sandbox enforcement remain deferred to their approved later phases.
- Protected Smoke compatibility substitutions intentionally depend on exact source strings and fail closed on source drift.

**Rollback method:**

- Apply a reviewed normal reverse patch limited to the Slice 18 production, consumer, test, spec, and plan files, then append a correction. Do not weaken redaction, remove the Slice 17 sanitized selector boundary, reset the working tree, or rewrite prior archive entries.

**Next step:**

- Run the full local verification matrix and the user-required per-tool `neat-freak` reconciliation without publishing the unified batch.

## STEP-188 — Complete Slice 18 local gates and per-tool `neat-freak`

**Status:** Complete

**Goal:** Prove the final Slice 18 implementation against all local gates, reconcile every active authority document, and move the continuous batch to Slice 19 without staging or publication.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-13-load-skill-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-load-skill-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Marked the seven-task Slice 18 plan complete only after fresh final evidence.
- Reconciled the master plan, historical roadmap status, project instructions, concise Memory index, Slice 18 design, and active archive with the exact implemented behavior and next Slice 19 action.
- Enumerated 61 repository Markdown documents and both applicable rule layers, checked local Markdown links and code-fence balance, confirmed authority paths, and scanned active documents for placeholders and stale active-slice statements.
- Kept `Memory.md` at 150 lines and below its practical 18-KB limit. The active archive was 19,778 bytes before this entry, below the 48,000-byte rollover threshold derived from the 60-KB direct-read limit.
- Left the Git index, commit history, remote, CI, protected Smoke sources, credentials, Phase 2, and later-phase capabilities unchanged.

**Verification commands:**

- `node --test test/load-skill-contract.test.mjs`
- adjacent workspace/inventory contract commands recorded in STEP-187
- `npm run build`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm run stress`
- `npm pack --dry-run --json`
- `git diff --check`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- exact expected-versus-actual changed-file comparison
- changed-file credential-pattern scan
- 61-document local-link and code-fence audit
- placeholder, status-drift, authority-path, line-count, byte-size, and archive-rollover checks

**Verification results:**

- Final focused contract: 15/15 passed.
- Final complete regression after all hardening: 291/291 passed.
- TypeScript Build passed, including the Build executed by final Stress and package prepack.
- The complete eight-section Smoke command chain exited successfully.
- Native-Windows Stress exited successfully with the established POSIX-only multi-colon fixture skip unchanged.
- Package dry-run passed with 135 entries, 361,135 compressed bytes, and 1,858,878 unpacked bytes; internal Memory, specs, plans, and archives remained excluded.
- `git diff --check` passed with only established LF-to-CRLF working-copy warnings.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` had no diff.
- Exact unified-batch scope comparison passed for 20 intended changed/untracked files, and the credential-pattern scan found no secret-looking value.
- All 61 Markdown files passed local-link and code-fence checks. Active placeholder and Slice-status checks passed after excluding the master plan's explicit “no TBD/TODO” acceptance sentence and treating the completed Slice 18 evidence block as history rather than active-state drift.
- `Memory.md` measured 150 lines and 17,563 bytes; `AGENTS.md` measured 224 lines and 16,913 bytes before this archive append.

**Material failed attempts:**

- The first PowerShell document-audit command failed before reading conclusions because `"$file:"` is ambiguous interpolation. The corrected command used the format operator, consistent with the Windows project guidance.
- The first placeholder scan correctly found the literal words `TBD` and `TODO` inside a “no placeholders” acceptance sentence; the check was refined to exclude only that exact semantic assertion.
- The first stale-status scan matched the completed Slice 18 evidence block; the corrected check separately validated that the authoritative active-batch block names Slice 19.

**Decisions made:**

- Slice 18 is locally complete but unpublished. Slice 19 `read_handoff` is now the active local implementation slice.
- The existing `AGENTS.md` is above the neat-freak soft size preference but below its project line limits and contains active security/governance rules; only one compact Slice 18 map entry was added instead of deleting active instructions or moving rules into history.
- No `CLAUDE.md` symlink was created because this Windows Codex repository does not require one and `AGENTS.md` is the declared authority.

**Risks or limitations:**

- The unpublished working tree now contains both Slice 17 and Slice 18. Per-slice rollback remains a reviewed reverse patch until the user-approved unified publication after Slice 28.
- Full local verification is repeated per tool by explicit user requirement; exact-head cross-platform CI remains intentionally deferred until all twelve tools are complete.

**Rollback method:**

- Reverse only the Slice 18 files with a reviewed normal patch and append a correction. Preserve Slice 17 work, all archive history, the Git index, and the no-publication boundary.

**Next step:**

- Continue immediately with Slice 19 `read_handoff` design, focused RED, implementation, verification, and `neat-freak`; do not stage, commit, push, or run exact-head CI before all twelve tools are locally complete.

## Correction to STEP-188 — Reconcile the master-plan remaining-tool count

**Status:** Complete

**Goal:** Correct two stale active-status lines found while beginning the Slice 19 source audit.

**Files changed:**

- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Changed the active completed-slice sentence from only `codexpro_inventory` to both locally complete Slices 17 and 18.
- Changed the remaining supported surface count from eleven to ten before any Slice 19 contract decision was made.
- Preserved STEP-188 unchanged and appended this correction rather than rewriting history.

**Verification commands:**

- targeted `rg` checks for the completed-slice sentence, remaining-tool heading, and active Slice 19 block
- `git diff --check`
- active archive size check

**Verification results:**

- The master plan now agrees internally with `AGENTS.md`, `Memory.md`, and the historical roadmap: Slices 17–18 are locally complete, ten tools remain, and Slice 19 is active.
- The post-correction diff and archive-size checks are run immediately after this append.

**Decisions made:**

- This is a documentation correction only; it does not change implementation order, publication authorization, or phase boundaries.

**Risks or limitations:**

- Per-tool status scans must check both the master-plan header/tail and its earlier remaining-tool summary.

**Rollback method:**

- Append a later correction if the batch count changes; do not restore the known-stale count or rewrite STEP-188.

**Next step:**

- Continue Slice 19 `read_handoff` design and focused RED.

## STEP-189 — Freeze direct `read_handoff` output-schema design

**Status:** Complete

**Goal:** Define the exact bounded public contract for Slice 19 before changing runtime behavior, while preserving the continuous Slice 17–28 batch and unified-publication boundary.

**Files changed:**

- `Memory.md`
- `docs/superpowers/specs/2026-07-13-read-handoff-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Audited the current direct handler, `readAiBridgeContext` reader, fixed `.ai-bridge` artifact allowlist, mode registration, Tool Card path, supertool wrapper, protected main-Smoke consumer, and configured read/output bounds.
- Froze a strict six-field envelope with fifteen exact data fields, seven fixed path-to-kind mappings, complete readable artifacts, safe unavailable records, truthful raw/returned byte accounting, and derived warnings.
- Defined effective per-file and aggregate bounds, missing-directory success, optional-file absence, full-or-unavailable output, pre-construction redaction, a strict provider seam, a rich domain reader with a compatibility wrapper, nested consumer migration, and dedicated bounded Tool Card rendering.
- Kept `wait_for_handoff`, context export/write tools, arbitrary paths, partial-file prefixes, trust, Policy Kernel, Phase 2, staging, publication, and protected Smoke-source edits out of scope.

**Verification commands:**

- targeted `rg` audit of current handler, reader, consumer, mode, and active-status references
- UTF-8 byte, code-fence, placeholder, and design/plan path checks
- `git status --short`
- active archive and `Memory.md` size/line checks

**Verification results:**

- The design and plan exist at their documented paths, contain no placeholder markers, and the design's fourteen code-fence markers are balanced.
- The plan has seven implementation/review/verification tasks and preserves focused RED before production behavior.
- The existing working tree remains unstaged and unpublished; Slice 17 and Slice 18 changes were preserved.
- `Memory.md` remained at 150 lines after replacing the oldest recent summary. The active archive measured 31,847 bytes before this entry, below the 48,000-byte rollover threshold.

**Decisions made:**

- A missing handoff directory is an empty non-warning success; when the directory exists, every fixed artifact is represented exactly once as readable or unavailable.
- Individual artifacts are never partially returned. Files that exceed the per-file bound and later files that exceed the aggregate bound become stable `too_large` or `output_limit` records.
- Dynamic filesystem/provider diagnostics never enter the public contract. Expected provider execution failures map to `HANDOFF_READ_FAILED`; structurally malformed provider output maps to `INTERNAL_ERROR`.
- The existing `readAiBridgeContext` remains as a safe compatibility wrapper so later public context tools are not migrated implicitly in Slice 19.

**Risks or limitations:**

- Fixed priority order means an earlier large readable artifact can consume the aggregate budget and make later present artifacts unavailable.
- Native realpath and post-read size rechecks reduce path and file-size races but are not an operating-system sandbox or atomic snapshot.
- The exact protected-source compatibility substitution will fail closed if the upstream Smoke consumer changes before unified publication.

**Rollback method:**

- Apply a reviewed normal reverse patch limited to the Slice 19 design/plan and append a correction. Do not rewrite archived history, reset the shared working tree, or alter `.ai-bridge` user data.

**Next step:**

- Add and run the focused `read_handoff` contract suite to establish intentional RED before production changes.

## STEP-190 — Establish direct `read_handoff` focused RED

**Status:** Complete

**Goal:** Freeze the Slice 19 contract as executable tests and prove the current implementation fails for the intended missing behavior before production changes.

**Files changed:**

- `Memory.md`
- `test/read-handoff-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added reusable MCP, temporary-workspace, exact-result, failure, artifact, unavailable-record, provider-result, byte, and line-count helpers.
- Added fourteen tests covering exact populated/absent constructors, fixed definitions, warning order, all stable failures, strict cross-field rejection, mode/descriptor metadata, real absence, readable/missing/empty/redacted artifacts, per-file and aggregate limits, blocked/non-text outcomes, provider staging, dedicated Tool Card behavior, long structured-content preservation, supertool wrapping, and protected-source compatibility migration.
- Kept the schema import intentionally nullable so the suite loads and exposes behavioral RED instead of failing during module bootstrap.

**Verification commands:**

- `node --test test/read-handoff-contract.test.mjs`
- `git diff --check -- Memory.md docs/memory/archive/phase-1-part-5.md docs/superpowers/specs/2026-07-13-read-handoff-output-schema-design.md docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md test/read-handoff-contract.test.mjs`
- active archive and `Memory.md` size/line checks

**Verification results:**

- Intentional RED: 0/14 passed and 14/14 failed.
- Failures were attributable to the missing schema/constructors and advertised output schema, old flat handler, ignored provider dependency, generic Tool Card, compacted long body, old supertool child payload, and absent exact compatibility substitution.
- MCP server/client connection, temporary workspaces, filesystem setup/cleanup, existing direct-tool discovery, protected-source reads, and test-runner bootstrap all remained healthy.
- The pre-entry archive measured 35,691 bytes, below the 48,000-byte rollover threshold; `Memory.md` remained exactly 150 lines.
- The targeted diff check passed with only the established LF-to-CRLF working-copy warning for `Memory.md`.

**Decisions made:**

- The focused suite contains fourteen deliberately broad contract cases rather than inflating the test count with single-assertion duplicates.
- Real behavior tests verify complete artifact inclusion only; no partial-prefix compatibility is accepted.
- Provider exceptions and malformed provider structures are tested independently so public failure staging cannot collapse into leaked generic errors.

**Risks or limitations:**

- The blocked-file real test depends on the existing `PathGuard` blocked-glob semantics; if implementation evidence differs, the public contract remains fixed while the fixture must be corrected rather than weakening policy.
- OS-specific permission-denied reproduction is not portable, so `read_failed` remains covered by schema/provider classification and later implementation review instead of a brittle filesystem-permission fixture.

**Rollback method:**

- Remove only the new focused test with a reviewed normal patch and append a correction. Preserve the design, prior Slice 17–18 work, Git index, and archive history.

**Next step:**

- Implement the exact `read_handoff` schema and constructors, then run the schema checkpoint and Build before domain/runtime behavior.

## STEP-191 — Implement direct `read_handoff` exact schema

**Status:** Complete

**Goal:** Implement the strict public schema and constructors independently of the domain reader and direct handler.

**Files changed:**

- `Memory.md`
- `src/tools/schemas/readHandoff.ts`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added the seven immutable artifact filename/kind definitions, safe context/path schemas, six unavailable reasons, stable warnings, and stable error messages.
- Added strict artifact, unavailable, fifteen-field data, discriminated error, and six-field output schemas plus success/failure constructors.
- Enforced absent-context emptiness; fixed allowlist coverage and mapping; per-array ordering and uniqueness; exact file/count/byte/line/flag relationships; individual and aggregate limits; numeric reason semantics; aggregate `output_limit` plausibility; exact warning order; and empty failure warnings.
- Exported the fixed definitions, line counter, schemas, types, messages, warnings, output shape, and constructors required by the domain, handler, descriptor, and tests.

**Verification commands:**

- `node --test test/read-handoff-contract.test.mjs`
- `npm run build`
- targeted `git diff --check`
- active archive and `Memory.md` size/line checks

**Verification results:**

- Schema checkpoint: 4/14 focused tests passed; the remaining ten failures were the expected not-yet-implemented descriptor, domain, handler, provider, Tool Card, supertool, and compatibility behavior.
- TypeScript Build passed with the new schema included.
- The targeted diff check passed with only the established LF-to-CRLF working-copy warning for `Memory.md`.
- The archive measured 39,241 bytes before this entry, below the 48,000-byte rollover threshold; `Memory.md` stayed at 150 lines.

**Decisions made:**

- Context-present results require exact coverage of all seven fixed identities across readable and unavailable arrays; context-absent results expose neither synthetic missing rows nor warnings.
- `too_large` must exceed the effective file bound; `output_limit` must fit the file bound but exceed the remaining aggregate budget at its fixed-order position.
- Unredacted decoded bodies may not exceed the worst-case three UTF-8 replacement bytes per raw byte; redacted returned-byte expansion remains represented explicitly.

**Risks or limitations:**

- Schema validation can prove structural and arithmetic consistency, not that provider bytes came from a specific filesystem snapshot. The runtime must revalidate paths and buffers before construction.
- The public line count is checked against returned text; current redaction preserves line boundaries, which the runtime review must confirm rather than assume as a general property of future redactors.

**Rollback method:**

- Reverse only `src/tools/schemas/readHandoff.ts` and matching plan/index edits with a reviewed patch, then append a correction. Preserve focused tests, prior slices, and archive history.

**Next step:**

- Implement the rich bounded `readHandoffContext` domain reader and safe `readAiBridgeContext` compatibility wrapper.

## STEP-192 — Implement bounded handoff domain reader

**Status:** Complete

**Goal:** Replace the dynamic unbounded handoff concatenation core with a rich fixed-artifact reader while preserving later public-tool compatibility through a safe wrapper.

**Files changed:**

- `Memory.md`
- `src/workspaceOps.ts`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added effective handoff limit calculation, raw artifact/unavailable result types, fixed-definition reuse, stable line counts, and `readHandoffContext`.
- Made an absent context directory a non-creating empty result; rejected a non-directory context root as a provider failure.
- For each fixed artifact, resolved the workspace boundary, captured a safe stat, classified missing/blocked/read-failed states, applied per-file and remaining aggregate bounds, verified text content, re-resolved before reading, and rechecked actual buffer bytes and NUL content afterward.
- Returned only complete decoded files and stable reason/byte records; no partial body, raw exception, or absolute path is retained in the domain result.
- Reimplemented `readAiBridgeContext` as a compatibility wrapper with fixed `[unavailable: reason]` markers and readable-file paths, removing its previous raw error interpolation without migrating later public context schemas.

**Verification commands:**

- `npm run build`
- `node --test test/workspace-snapshot-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- targeted `git diff --check`
- active archive and `Memory.md` size/line checks

**Verification results:**

- TypeScript Build passed.
- Adjacent workspace/open/snapshot contracts passed 51/51, including missing AI context, readable AI-file normalization, and protected compatibility consumers.
- The targeted diff check passed with only the established LF-to-CRLF working-copy warning for `src/workspaceOps.ts`.
- The archive measured 42,460 bytes before this entry, below the 48,000-byte rollover threshold; `Memory.md` remained exactly 150 lines.

**Decisions made:**

- File-size and aggregate checks occur both before and after the read. A file that grows across either boundary is unavailable, never partially returned.
- A boundary resolution failure is `blocked`; absent filesystem entries are `missing`; a NUL-bearing complete buffer is `not_text`; other fixed-file failures use `read_failed` without their diagnostic.
- If native resolution changes between the first check and immediate pre-read revalidation, the artifact fails closed as `blocked` rather than following the changed target.

**Risks or limitations:**

- The read remains a sequence of bounded snapshots, not one atomic snapshot of all seven files. Later artifacts can legitimately reflect a later filesystem moment.
- A same-path file can still change after revalidation and before/during `readFile`; post-read byte and NUL checks bound the result, while OS sandboxing and stronger atomic handles remain later-phase work.

**Rollback method:**

- Restore only the prior `readAiBridgeContext` implementation and remove the new domain exports with a reviewed reverse patch, then append a correction. Do not alter handoff files, reset the shared tree, or weaken PathGuard.

**Next step:**

- Implement the exact direct handler, strict provider boundary, pre-construction redaction, stable failures, advertised schema, and structured-content preservation.

## STEP-193 — Complete direct `read_handoff` runtime, consumers, and hardening

**Status:** Complete

**Goal:** Produce a usable exact direct tool, migrate every known consumer, review the completed result adversarially, and fix material boundary issues before full local gates.

**Files changed:**

- `Memory.md`
- `src/server.ts`
- `src/workspaceOps.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `test/read-handoff-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-read-handoff-output-schema.md`
- `docs/memory/archive/phase-1-part-5.md`

**Implementation summary:**

- Added the read-handoff provider context/dependency, strict raw provider schemas, exact workspace/provider/construction failure stages, effective limit echoing, pre-construction secret redaction, truthful returned-byte and aggregate calculations, exact output descriptor, and structured-content preservation.
- Added bounded actionable human output and exact stable failures without provider, path, credential, or operating-system diagnostics.
- Replaced the generic handoff card with a nested-first dedicated renderer that preserves historical flat input, renders only fixed failure code/message, lists safe unavailable reasons, and caps each artifact preview at 20 lines and 4,000 characters.
- Added the exact-once fail-closed main-Smoke compatibility substitution. Protected main and HTTP Smoke sources remained unchanged; HTTP Smoke required no handoff substitution.
- Confirmed the supertool preserves the exact child envelope plus its existing wrapper tags and that Tool Cards preserve long exact artifact bodies.
- Result review found and reproduced two material issues: pre-read boundary revalidation exceptions were classified as `read_failed` instead of fail-closed `blocked`, and an injected provider could claim nonzero source bytes while omitting the complete body. The minimum fixes split boundary revalidation from `readFile` and enforce source-byte/empty-body equivalence.
- Simplified the Tool Card readable-count fallback while retaining nested-first and historical behavior. No public design decision changed.

**Verification commands:**

- `npm run build`
- `node --test test/read-handoff-contract.test.mjs`
- `node --test test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs`
- `git diff --exit-code -- scripts/smoke.mjs scripts/http-smoke.mjs`
- targeted `git diff --check`

**Verification results:**

- First runtime/consumer GREEN: focused 14/14 and Build passed.
- Post-result deliberate RED: 13/15 passed; the two new cases failed exactly on boundary reclassification and omitted provider body.
- After minimum fixes, focused 15/15 and Build passed.
- Final adjacent workspace/load-skill regression passed 66/66.
- Protected Smoke sources had no diff. The targeted whitespace check passed with only established LF-to-CRLF working-copy warnings.

**Decisions made:**

- Provider execution exceptions are `HANDOFF_READ_FAILED`; a provider result that is structurally, arithmetically, or identity-inconsistent is `INTERNAL_ERROR`.
- Immediate pre-read resolution failure or changed native target is a policy boundary outcome and therefore `blocked` with a null byte count, not an ordinary read failure.
- A complete decoded provider artifact is empty iff its observed source byte count is zero; nonzero bytes cannot silently collapse to an empty returned body.
- Tool Card size is bounded independently from MCP structured content so UI safety cannot invalidate the exact public artifact byte contract.

**Risks or limitations:**

- The provider seam is test-only infrastructure, but strict validation is still required because duplicated loaders and future internal adapters can cross module identity or type boundaries.
- Human MCP content contains the same complete redacted artifacts as structured output and is bounded by source-byte limits; exceptionally dense secret replacement can expand returned bytes, which remain explicitly reported.
- Filesystem checks narrow races but do not provide OS-level containment or an atomic seven-file snapshot.

**Rollback method:**

- Apply a reviewed reverse patch limited to Slice 19 handler/domain/card/compatibility/test changes, append a correction, and preserve prior Slice 17–18 work. Do not modify protected Smoke sources, delete `.ai-bridge` data, or reset the shared working tree.

**Next step:**

- Run complete local regression, Smoke, Stress, package, diff, protected-source, unified-scope, secret, and document gates, then perform the required per-tool `neat-freak` without publishing.

# Phase 7 Archive — Volume 3

This append-only volume continues Phase 7 from STEP-426 after Volume 2 crossed the 48 KB rollover threshold at STEP-425. Earlier Phase 7 volumes remain unchanged except for their append-only closure markers.

## 2026-07-25 — STEP-426: Reconcile Phase 7 memory and roll over the active archive

**Status:** Completed. Root memory, the active Phase 7 plan, and the archive map now reflect accepted real App U2/U3, pending U4–U6, and the correct active continuation volume. No source, test, runtime configuration, workflow, package, credential, approval, transaction, or Git history state changed.

**Goal:** Apply the `neat-freak` maintenance workflow after STEP-425: remove stale or duplicated process detail from the root index, restore its practical size margin, correct the over-limit archive volume, and align the Phase 7 plan with the actual live acceptance state.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/memory/archive/phase-7-part-3.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`

**Reconciliation:**

- Compacted `Memory.md` from a process-heavy 21 KB index into a current-state index below the practical 18 KB target while preserving closure heads, active security/runtime decisions, final U2/U3 evidence, limitations, open items, and every archive link.
- Reclassified Phase 7 Volume 2 as closed because it exceeded 48 KB, appended an immutable closure marker, and opened this numbered continuation without renaming or repartitioning earlier records.
- Updated the Phase 7 plan status and current-next-action section from the obsolete STEP-419/backend-only state to STEP-425: real App U2/U3 accepted; U4 worker failure/fallback, U5 boundaries, U6 migration, publication, and replacement exact-head CI remain.
- Confirmed `AGENTS.md` remains the authoritative project rule file. The project does not require a `CLAUDE.md` mirror or symlink, so none was created.
- Reviewed the root documentation inventory. README, security, domain/tunnel, and public-launch documents do not describe per-STEP G7-U acceptance state and therefore required no change.

**Rule audit:**

- Required root `AGENTS.md` and `Memory.md` exist. `AGENTS.md` is 210 lines / 19,727 bytes: above the generic neat-freak byte guideline but below its 300-line soft limit, with active rules rather than historical narration, so it was not rewritten during a memory-only maintenance step.
- Windows-native, self-hosted, Cloudflare-only network-entry, credential, Git, and publication boundaries remain unchanged.
- Both untracked Phase 8 OAuth records remain outside the authorized Phase 7 implementation scope.
- No destructive cleanup was performed. Ignored U3 fixture backup/replacement objects remain available for auditability and require explicit cleanup authorization.

**Verification:**

- `Memory.md`: 118 lines / 13,488 bytes, reduced from 126 lines / 21,115 bytes and below the practical 150-line / 18 KB target.
- Closed Volume 2: 568 lines / 71,170 bytes. New active Volume 3: 48 lines / 4,639 bytes after the final evidence update.
- Phase 7 plan: 1,108 lines / 54,298 bytes, below its 1,500-line soft limit.
- All 32 archive links in `Memory.md` resolve. Relative Markdown links in the three modified current-state documents resolve with zero missing targets.
- `git diff --check` passed. `npm run policy:check` reported `Repository operational policy: PASS`.
- No stale U3-pending language or relative-time wording remains in the current root index, active Phase 7 plan status, or Volume 3 record.

**Adversarial review:** A second pass checked for accidental loss of current decisions, historical details incorrectly retained in the root index, stale U3-pending language, archive-link breakage, unauthorized source changes, and Phase 8 scope expansion. No independent agent runtime was available in the workspace, so the review was performed as two separate manual passes.

**Risk and limitation:** This maintenance step changes documentation and project memory only. It does not resolve the observed ordinary non-semantic `apply_patch` HTTP transport issue and does not count as G7-U U4–U6 evidence.

**Rollback:** Revert the four documentation/memory files from this step. Do not merge Volume 3 back into the closed Volume 2 or rewrite earlier append-only entries.

**Next action:** Run real ChatGPT App U4 against the supported named-tunnel environment, then U5 and U6. After all live journeys pass, stage only the reviewed Phase 7 scope, create one English commit, push normally, and require the complete replacement exact-head matrix.

## 2026-07-25 — STEP-427: Accept real ChatGPT App U4 worker failure and lexical fallback

**Status:** Completed. Real ChatGPT App U4 is accepted through the supported public named tunnel. Controlled builtin-worker crashes now survive HTTP transport rotation into one authority-bound cooldown; ordinary search/read remain available; unsupported Python requests report honest lexical quality instead of TypeScript certainty.

**Goal:** Prove the G7-U U4 failure path under actual ChatGPT HTTP transport behavior: bounded worker failure, stable cooldown and recovery guidance, ordinary-tool continuity, and truthful unsupported-language degradation.

**Defects found and repaired:**

1. Worker health was transport-local. ChatGPT rotated HTTP transports between calls, so three crashes were each counted as a first failure and a subsequent `server_config` incorrectly reported `ready`.
2. Symbol lookup with a non-JS/TS `path_hint` resolved TypeScript candidates first. A missing Python symbol therefore returned `builtin-typescript`, `result_quality: semantic`, and `language: typescript` instead of unsupported lexical output.
3. `.py` and `.pyi` files were classified as `unknown`, preventing a precise public language label.

**Implementation:**

- Added a process-lifecycle `SemanticWorkerHealthRegistry` injected into every HTTP session server.
- Bound shared failure/cooldown state to stable workspace authority while keeping worker instances, workspace handles, project caches, cancellation, and transport disposal local.
- Counted non-zero worker exits as infrastructure failures when requests remain pending.
- Preserved a single decreasing `retry_after_ms` and one recovery action across transport rotation; successful requests clear only their exact health scope.
- Routed non-JS/TS symbol `path_hint` requests directly to lexical fallback and added Python extension detection.

**Files changed for U4:**

- `src/http.ts`
- `src/productionRuntime.ts`
- `src/server.ts`
- `src/semantic/builtin/typescriptProvider.ts`
- `src/semantic/manager.ts`
- `src/semantic/sourceSnapshot.ts`
- `test/phase-7-typescript-worker.test.mjs`
- `test/phase-7-semantic-manager.test.mjs`
- `test/phase-7-http-reconnect-preview.test.mjs`

**Real App evidence:**

- First semantic definition failure: `state: unavailable`, `reason_code: WORKER_UNAVAILABLE`, empty locations, and the single action to inspect `server_config` then retry once while ordinary tools remain available.
- Second semantic references failure: the same bounded unavailable result.
- Third semantic diagnostics call: `state: cooldown`, `reason_code: WORKER_COOLDOWN`, `retry_after_ms: 30000`, and no claim that empty diagnostics were a successful analysis.
- Immediately rotated `server_config`: `semanticState: cooldown`, `semanticRetryAfterMs: 21053`, and the same one-step retry guidance rather than the former false `ready` state.
- Ordinary `search` remained successful with seven matches; ordinary `read` returned the exact four-line `src/lease.mjs` content without mutation.
- Unsupported Python lookup returned `state: fallback`, `reason_code: SEMANTIC_UNSUPPORTED`, `actual_provider: builtin-lexical`, `result_quality: lexical`, `language: python`, and the instruction to verify lexical candidates before editing.
- The requested `python_only_value` symbol was absent from `src/sample.py`; that fixture contains `calculate_total`, so `locations: []` was correct and did not invalidate the degradation proof.

**Verification:**

- Initial health/reconnect focused set: 26/26 passed.
- Cross-layer server/runtime/policy/workspace set: 61/61 passed.
- Final combined affected set after lexical routing: 88/88 passed.
- `npm run build` passed.
- `npm run policy:check` reported `Repository operational policy: PASS`.
- `git diff --check` passed with only existing CRLF conversion warnings.
- Public unauthenticated `/healthz` remained `401`.
- The temporary crashing compiled worker artifact was restored by build; production source is the only persistent implementation change.

**Adversarial review:** Separate manual passes checked cross-workspace contamination, transport-close cleanup, success reset, V1–V4 behavior, non-HTTP construction, false semantic certainty, and accidental sharing of workspace handles or workers. The shared object contains only bounded health/cooldown facts. No independent agent runtime was available.

**Risk and limitation:** Core still has no Python semantic provider. Python results are intentionally lexical. A zero-match lexical result means only that the requested text was not present in the authorized snapshots; it is not a semantic nonexistence proof.

**Rollback:** Revert the nine U4 implementation/test files above and rebuild. Do not retain the ignored crash-injection worker artifact. Reverting the shared registry restores the known transport-rotation inconsistency and should not be published.

**Next action:** Run real ChatGPT App U5 boundary rejection/redaction/audit evidence, then U6 migration evidence. After both pass, execute final managed Node 20/24 and publication gates.

## 2026-07-25 — STEP-428: Accept real App U5 boundaries

**Status:** Completed. The controlled boundary cases failed closed without disclosure or mutation. Post-response source revalidation now rejects analysis-time replacement. The live run was stopped and the normal worker artifact was restored by build.

**Next action:** Run U6 migration evidence, then the final verification and publication gates.

## 2026-07-25 — STEP-429: Reconcile Phase 7 memory after U5

**Status:** Completed. This append-only correction supplies the complete U5 record required by the project memory protocol, compacts the root index, and aligns the active plan with U6 as the sole remaining live App journey.

**Goal:** Preserve the accepted U5 security evidence without expanding the root index into a change log, correct stale current-state wording, and leave a clean handoff for U6 and final publication gates.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-3.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`

**U5 record completion:**

- Controlled provider outputs for outside, blocked, linked, and replaced paths all failed closed with bounded public errors.
- Public responses disclosed none of the controlled hostile paths, environment-file content, or fixture markers.
- The real App journey invoked four semantic calls only; it used no writer, shell, command-execution, or tool-selection authority.
- U5 exposed an analysis-time replacement gap: a worker result could be accepted after a source path had been replaced. The repair revalidates the exact workspace snapshots sent to the worker before publishing locations, diagnostics, or rename output.
- The required persistence path returned the original semantic tool errors. Under required persistence, that return is possible only after the matching failed execution terminal is committed; persistence failure would instead return `AUDIT_UNAVAILABLE`.
- The controlled run `2026-07-25T16-11-49-124Z-phase7-u5-boundaries-v5-5ebde6a5` was stopped by exact run ID, and `npm run build` restored the normal compiled worker artifact.

**Implementation and verification evidence:**

- U5 implementation scope: `src/semantic/manager.ts`, `src/semantic/projectResolver.ts`, and `test/phase-7-semantic-manager.test.mjs`.
- Focused U5 set passed 25/25: semantic manager, source boundary, preview lifecycle, and rename/apply tests.
- `npm run build` passed after stopping the controlled run.
- `npm run policy:check` reported `Repository operational policy: PASS`.
- `git diff --check` passed with only existing LF/CRLF conversion warnings.

**Knowledge cleanup:**

- Compressed intermediate STEP-421 through STEP-423 evidence into one current-state line; complete details remain in the closed archive.
- Removed stale wording that implied the original named-tunnel run was still active.
- Reduced recent summaries to current handoff value and added STEP-429 without rewriting prior append-only entries.
- `Memory.md` is 119 lines / 14,434 bytes, below the practical 150-line / 18 KB target; all 32 archive links resolve and the modified current-state documents contain no relative-time wording.
- Confirmed U5 changes do not alter installation, public setup, authentication, or user-facing commands, so README, security, domain, tunnel, and launch documents require no update.
- Kept both untracked Phase 8 records outside the authorized Phase 7 scope.

**Rule audit:** Required root `AGENTS.md` and `Memory.md` exist. `AGENTS.md` is 210 lines / 19,727 bytes: above the generic neat-freak byte guideline but below the project 300-line soft limit, and its content is active policy rather than historical narration, so it was not rewritten. The project makes `AGENTS.md` authoritative and does not require a `CLAUDE.md` mirror. Key referenced Phase 7 documents and operational scripts exist, `.gitignore` covers `.env` and `.env.*`, and no destructive or out-of-scope repair is required.

**Decisions:** U5 is accepted. Direct audit-query display was blocked by the App platform, but required-persistence fail-closed behavior plus the original returned tool errors provides the terminal-persistence proof. This does not generalize into a claim that every client can directly query the audit store.

**Risks and limitations:** A genuine old 51-tool App fixture remains unavailable, so U6 must retain the explicit **Scan Tools** or recreate contract and must not claim transparent refresh. The ordinary non-semantic `apply_patch` transport issue remains separate and unresolved.

**Rollback:** Revert only the three documentation/memory files from STEP-429. Do not rewrite or remove the earlier STEP-428 entry; append a correction if later evidence changes its interpretation.

**Next action:** Complete U6 cached-App migration evidence, then run final managed Node 20/24, policy, package, diff, link, secret, intended-scope, publication, and replacement exact-head CI gates.

## 2026-07-25 — STEP-430: Accept real App U6 cached-App migration

**Status:** Completed. A recreated V4 51-tool ChatGPT App was migrated through the supported one-time **Scan Tools** action after the same public endpoint switched to V5. The refreshed App exposed semantic capability and completed the full U1 definition, references/read, diagnostics, and ambiguity journey. No transparent refresh is claimed.

**Goal:** Produce actual user-observable evidence for the final G7-U journey: old App snapshot, explicit migration guidance, one supported refresh, and successful semantic use without Provider setup, path pre-search, external processes, or mutation.

**Baseline and migration path:**

- Started the supported public named-tunnel entry with V4, `tool_mode=full`, and `codex_sessions=metadata`. Public MCP enumeration returned exactly 51 tools, including `codexgpt` and `codex_sessions`, with no `semantic` tool.
- Created the temporary ChatGPT App from that V4 endpoint before any refresh. The exact V4 baseline run was `2026-07-25T16-53-32-768Z-phase7-u6-v4-cached-app-51-daf10f55`.
- The supported V5 entry and doctor output each supplied one explicit action: choose **Scan Tools** once or recreate the App. Neither claimed that an existing App refreshes transparently.
- Switched the same hostname and authentication configuration to V5. Direct public MCP enumeration returned 52 tools and included `semantic`.
- Performed **Scan Tools** once on the existing App. ChatGPT reported 51 actions because its action count excludes the `codexgpt` aggregate entry; the underlying MCP count remained 52. The refreshed action list included `semantic`.

**Live defect 1 — inventory collapse from installed Skill metadata:**

- RED: the refreshed App called `codexgpt_inventory` and received `INTERNAL_ERROR`. Real local replay found six installed Skills whose valid descriptions exceeded the inventory contract's 500-character public summary limit.
- Root cause: standard guidance projected the full discovered description into the stricter inventory schema. One long summary therefore failed the complete inventory instead of degrading only that optional field.
- Repair: exported the existing 500-character public limit as one schema constant and changed only the standard inventory projection to omit an overlong description. The resulting public value is `null`; Skill files and the output bound remain unchanged.
- Regression: a test with one description at exactly 500 characters and one at 501 proves the boundary is preserved and only the overlong summary is omitted.
- User-visible result after restart: `ok: true`, `error.code: null`, `skill_count: 29`, counts `{ workspace: 0, user: 26, plugin: 3, other: 0 }`, and `mcp_server_count: 2`.

**Live defect 2 — partial-project ambiguity returned INTERNAL_ERROR:**

- RED: the App requested `rename_preview` for the intentionally ambiguous symbol `main`. It returned `INTERNAL_ERROR`, no candidates, no preview, and no mutation.
- Root cause: `SemanticProviderManager.execute` applied the complete-project rename gate before symbol resolution. Large repositories marked partial therefore failed before the safe, read-only disambiguation branch could return candidates.
- Repair: resolve the symbol first. Missing and ambiguous symbols return their bounded read-only result before rename completeness enforcement; only a unique target that could create a preview must satisfy complete project coverage.
- Regression: a forced-partial project with two definitions now returns `NEEDS_DISAMBIGUATION`, two candidates, and no `preview_id`. The existing complete-project ambiguity test remains green.
- User-visible result after restart: `reason_code: NEEDS_DISAMBIGUATION`, `needs_disambiguation: true`, 22 bounded `main` candidates, no `preview_id`, and no file modification.

**U1 evidence in the migrated App:**

- Definition without path or pre-search: `actual_provider: builtin-typescript`, `result_quality: semantic`, `scripts/long-task-runner.mjs`, range `38:17–38:40`.
- References: four locations — the declaration, the call at `scripts/long-task-runner.mjs:739:28–739:51`, and two test references. The App then opened `scripts/long-task-runner.mjs:30–745` successfully.
- Diagnostics: `scripts/long-task-runner.mjs` completed successfully with zero error, warning, information, or hint diagnostics.
- Ambiguity: 22 `main` candidates were returned without guessing, including script, source, test, and dependency declaration locations. No preview was created and no file changed.
- The App did not ask the user to select or configure a Provider and did not invoke search or an external process for the required semantic steps.

**Operational correction during U1:** The first semantic attempt used a fixture default root and tried to open `D:\Dev\codexpro` as an additional root. Policy correctly returned `APPROVAL_REQUIRED`; semantic itself had not executed. No approval was granted and no boundary was bypassed. The same public endpoint was restarted with `D:\Dev\codexpro` as its default root, after which the R0 semantic read succeeded. Public unauthenticated `/healthz` remained `401`.

**Files changed for the two U6 repairs:**

- `src/server.ts`
- `src/tools/schemas/codexgptInventory.ts`
- `src/semantic/manager.ts`
- `test/codexgpt-inventory-contract.test.mjs`
- `test/phase-7-semantic-manager.test.mjs`

**Verification:**

- Inventory contract after the first repair: 14/14 passed.
- Combined inventory, Phase 6 projection/load, cached-App migration, and V5 inheritance set: 40/40 passed.
- Real local inventory replay: 29 Skills, 2 MCP servers, six overlong summaries represented as `null`, no error.
- Semantic manager after the second repair: 14/14 passed.
- Final related repository acceptance, semantic CLI, cached-App migration, manager, and V5 inheritance set: 22/22 passed.
- `npm run build` passed after each repair.
- `npm run policy:check` reported `Repository operational policy: PASS`.
- Public MCP enumeration before refresh proved V4 51/no semantic and V5 52/semantic. Local and public unauthenticated health checks returned `401`.

**Adversarial review:** Separate passes challenged count semantics, optional-field degradation, exact boundary preservation, partial-project rename safety, preview-store side effects, policy approval handling, provider honesty, mutation absence, and whether the evidence depended on backend-only tests. The final acceptance depends on actual App output for migration, inventory, definition, references/read, diagnostics, and ambiguity. No independent subagent runtime was available.

**Decisions:** U6 and all real App U2–U6 journeys are accepted. The supported migration contract remains one explicit **Scan Tools** refresh or App recreation. A ChatGPT display of 51 actions after V5 refresh is correct only when direct MCP enumeration proves 52 tools and the omitted displayed item is the `codexgpt` aggregate tool.

**Risks and limitations:** The final successful service restart was performed directly in native PowerShell after the Devspace shell channel began rejecting all commands; it reused the saved profile token without printing it and retained the same hostname. This step does not publish the changes and does not replace the required managed Node 20/24 final closure and exact-head CI matrix.

**Rollback:** Revert the five U6 repair/test files listed above and rebuild. That rollback restores both known failures: installed overlong Skill descriptions can collapse `codexgpt_inventory`, and an ambiguous rename request in a partial repository can return `INTERNAL_ERROR` before disambiguation.

**Next action:** Run final managed Node 20/24 build, detached ordinary, protected Smoke, package, policy, diff, link, secret, and intended-scope gates. Then stage only the reviewed Phase 7 scope, create one concise English commit, push normally, and bind that exact head to the complete replacement CI matrix.

## 2026-07-25 — STEP-431: Reconcile active knowledge after U6

**Status:** Completed locally. Active rules, current memory, changelog, master plan, and historical roadmap now agree that real ChatGPT G7-U U2–U6 is accepted through STEP-430 and that final local G7-X, reviewed publication, and replacement exact-head CI remain. No source implementation, dependency, credential, approval, runtime configuration, Git index, commit, push, release, or deployment action was performed by this reconciliation.

**Goal:** Apply the project `neat-freak` workflow after U6: remove obsolete current-state claims, preserve append-only historical facts, verify active document integrity, and leave one unambiguous Phase 7 closure sequence.

**Files changed:**

- `AGENTS.md`
- `CHANGELOG.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-7-part-3.md`

**Implementation:**

- Updated the active execution boundary to remove the completed G7-U task and retain only final local G7-X, reviewed staging/commit/push, and bounded replacement exact-head diagnosis/repair.
- Synchronized the master plan header, Phase 7 status table, authorization history, current decision registry, detailed Phase 7 acceptance section, and final status summary with STEP-430.
- Updated the historical roadmap's current Phase 7 paragraph without rewriting historical phase records.
- Added the two U6 acceptance repairs to `CHANGELOG.md`: optional projection of overlong installed Skill descriptions and disambiguation before partial-project rename completeness gating.
- Compacted recent root-memory summaries by removing the obsolete process-only STEP-429 summary while retaining current evidence and archive links.
- Audited the active Phase 7 plan, public READMEs, design, and security guidance; their current user-facing semantic and Scan Tools contracts were already aligned and required no change.
- Left all earlier append-only archive statements unchanged, including point-in-time claims that G7-U or U6 was pending.

**Verification:**

- Focused documentation/operational suite passed 18/18: authentication documentation, supported public CLI help, Phase 7 documentation, package contents, and operational reliability.
- Relative Markdown link audit scanned 128 tracked Markdown files and 82 relative links with zero missing targets.
- All active-rule paths checked from `AGENTS.md` exist.
- Added-line high-confidence secret scan passed. The first invocation was invalid because a pattern beginning with hyphens was parsed as a `grep` option; the corrected `grep -E --` command passed and is the counted result.
- Active-state scan found no remaining current document that treats G7-U or U6 as pending; matches in closed/append-only archives remain preserved historical facts.
- Before this entry, `AGENTS.md` was 210 lines / 19,742 bytes, `Memory.md` 120 / 15,197, active Phase 7 Volume 3 232 / 22,653, the master plan 1,366 / 78,119, and the historical roadmap 513 / 20,704.

**Adversarial review:** A separate read-only pass challenged authorization drift, current-versus-historical wording, accidental Phase 8 inclusion, user-facing migration parity, archive rewriting, and whether soft size targets justified deleting active security rules. No blocking inconsistency remained. No independent subagent runtime was available, so the review was performed as two deliberate manual passes.

**Decisions, risks, and limitations:**

- `AGENTS.md` remains above the approximate 15 KB neat-freak soft target but below 300 lines and contains active fail-closed rules; broad compression would trade correctness for a soft size preference, so it remains unchanged except for the two current-boundary sentences.
- The master plan is a large single file; it remains below its established 1,500-line soft limit and must continue to be read by explicit ranges.
- The two untracked Phase 8 OAuth records remain outside the Phase 7 scope and were not modified.
- This documentation reconciliation is not final local G7-X and is not publication closure.

**Rollback:** Revert only the six STEP-431 documentation/memory files. Do not rewrite earlier Phase 7 archive entries or roll back the accepted U6 implementation fixes.

**Next action:** Run final managed Node 20/24 build, detached ordinary, protected Smoke, package, policy, diff, link, secret, and intended-scope gates; then use the already authorized reviewed Phase 7 stage/commit/push and replacement exact-head CI sequence.

## 2026-07-25 — STEP-432: Pass final local G7-X

**Status:** Completed locally. The reviewed Phase 7 Core checkout passes final managed Node 20/24 build, authoritative ordinary, protected Smoke, package, policy, diff, link, secret, dependency/license, and intended-scope gates. Publication and the replacement exact-head matrix remain required before formal Core closure.

**Goal:** Close the complete local G7-X boundary after accepted real App U2–U6, repair any newly exposed deterministic failure at its root cause, and leave one reviewed publication scope without expanding into Phase 7B/7C, Phase 8, release, deployment, credential, or destructive Git work.

**Defect found and repaired:**

- The first Node 20 authoritative ordinary run reached `test/policy-transport.test.mjs` and then consumed one CPU continuously for more than 12 minutes even though the file contains only seven lightweight tests.
- A 30-second file-level timeout proved the stall occurred during module initialization before any selected test completed. Isolated import sequences showed that Node 20 plus `tsx/esm/api.tsImport` spins when `server.ts` is loaded first and the test then directly re-imports policy leaf modules already loaded through that graph. Each module imported alone, and the same imports in leaf-first order, completed normally.
- The minimal repair changes test import order only: `policy/runtime.ts` and `policy/toolPolicy.ts` load before `server.ts`. Production runtime, authority, schemas, timeouts, and behavior are unchanged.
- Focused Node 20 and Node 24 verification passed 7/7 on each major. Node 20 completed the formerly hanging file in about 28 seconds; Node 24 completed it in about 2.3 seconds.
- The invalid first run `2026-07-25T18-05-08-079Z-phase7-final-ordinary-node20-0c95a382` was stopped by its exact owned run ID and is not acceptance evidence.

**Files changed in STEP-432:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-7-part-3.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `test/policy-transport.test.mjs`

**Authoritative dynamic verification:**

- Managed build passed under Node `20.20.2` and `24.15.0` after the import-order repair.
- Node 20 ordinary `2026-07-25T18-36-13-525Z-phase7-final-ordinary-node20-r2-24a24096`: 1,248 tests, 1,246 passed, 2 established skips, 0 failed; exit 0, zero stderr, successful temporary-state cleanup, zero retention failures.
- Node 24 ordinary `2026-07-25T18-50-50-143Z-phase7-final-ordinary-node24-6b3844b6`: 1,248 tests, 1,246 passed, 2 established skips, 0 failed; exit 0, zero stderr, successful temporary-state cleanup, zero retention failures.
- Node 20 protected Smoke `2026-07-25T18-59-16-467Z-phase7-final-smoke-node20-dbbcc9e5`: analysis, analysis CLI, base, HTTP, Pro CLI, doctor, settings, and handoff domains all passed; exit 0 and zero stderr.
- Node 24 protected Smoke `2026-07-25T19-06-50-382Z-phase7-final-smoke-node24-f6a0530d`: the same eight domains all passed; exit 0 and zero stderr.

**Static and integrity verification:**

- `npm run policy:check` passed and `git diff --check` reported no whitespace error.
- Package dry-run produced 579 files, 1,264,458 compressed bytes and 7,013,984 unpacked bytes. It includes the semantic worker/schema and excludes tests, memory archives, `.ai-bridge`, `.hallmark`, and Phase 8 records.
- Relative-link audit checked 128 tracked Markdown files and 82 relative links with zero missing targets.
- High-confidence secret scan checked 2,461 added lines with zero matches.
- Production audit reported 99 dependencies, two accepted moderate transitive advisories, and zero high/critical findings. All 98 production package entries declare a license from the reviewed MIT/ISC/BSD/Apache/BlueOak set.
- The reviewed scope is 35 modified tracked files plus the new Phase 7 archive and HTTP reconnect regression, for 37 intended files. The two untracked Phase 8 OAuth records remain excluded.

**Adversarial review:** Two deliberate read-only passes challenged the authority boundary and the publication boundary. The first checked reconnect-stable approval binding, stale-preview refusal, transaction-only mutation, source revalidation, worker-health sharing, V1–V4 exactness, and whether the import-order repair could affect production; no blocking issue remained. The second checked package leakage, credentials, relative links, dependency/license risk, historical-versus-current documentation, exact run ownership, and accidental Phase 8 inclusion. No independent subagent provider is available in this workspace, so no multi-agent claim is made.

**Decisions, risks, and limitations:** Local G7-X is accepted. The import-order issue is a Node 20/`tsx` test-loader interaction, not a product runtime defect. The two moderate transitive advisories remain in the accepted MCP SDK compatibility line. Formal Phase 7 Core closure still requires one published exact head to pass Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.

**Rollback:** Revert the seven STEP-432 files listed above. Reverting only the test import order restores the confirmed Node 20 CPU spin and is not a safe test-harness rollback. The product-level compatibility rollback remains explicit `CODEXGPT_GUIDANCE_MODE=legacy`; no state, credential, audit evidence, or toolchain deletion is part of rollback.

**Next action:** Stage only the 37 reviewed Phase 7 files, run staged-boundary policy and secret checks, create one concise English commit, push normally, and bind the exact 40-character head to the complete replacement CI matrix.

## 2026-07-25 — STEP-433: Close Phase 7 Core on exact-head CI

**Status:** Phase 7 Core is formally closed.

**Publication:** The exact reviewed 37-file Phase 7 scope was committed once as `a0b9f46e2297297959527f7570c9cb7942cc8fb3` with message `Complete Phase 7 semantic provider closure` and pushed normally to `origin/main`. The two untracked Phase 8 OAuth records were not staged, committed, or pushed.

**Exact-head verification:** CI run `30171313296` completed successfully for the exact 40-character head. Change classification, Repository policy, Windows Node 20, Ubuntu Node 20, Ubuntu Node 24, and Windows Node 24 all reached terminal success. Each platform job therefore completed its required Build, Regression, Smoke, and Package path under the workflow dependency structure.

**Closure basis:** Phase 7 Core now has all three required evidence classes: implemented and adversarially reviewed backend behavior; real user-observable ChatGPT App G7-U U2–U6 through STEP-430; and final local G7-X plus the replacement exact-head matrix through STEP-432/STEP-433. V1–V4 compatibility, explicit `legacy` rollback, Policy Kernel enforcement, Phase 3 transaction ownership, audit persistence, and package boundaries remain intact.

**Repository state decision:** This STEP-433 evidence is recorded locally but is intentionally not followed by an evidence-only commit. The active rules explicitly prohibit creating another commit solely to record a CI run ID. The published closure head remains the exact code/documentation candidate that CI evaluated.

**Deferred scope:** Phase 7B Serena, Phase 7C direct LSP, Tasks 4B1–4B6, `workspace`, Phase 8, release/deployment, credential migration, toolchain-root migration, force push, destructive history, and unrelated work remain unauthorized or deferred.

**Rollback:** Revert closure commit `a0b9f46e2297297959527f7570c9cb7942cc8fb3` through the normal reviewed Git path if the complete Phase 7 candidate must be withdrawn. For connector compatibility, one restart with explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the supported product rollback. Do not delete credentials, audit evidence, transaction state, approvals, toolchains, or user workspaces as rollback.

**Next action:** None within the completed Phase 7 Core authorization. Any new implementation phase or release action requires separate authorization.

## Volume closure

Phase 7 Volume 3 is closed at STEP-433. Do not append later interphase maintenance or future-phase work to this file; record between-phase work in the active interphase maintenance archive.

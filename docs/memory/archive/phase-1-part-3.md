# CodexPro Phase 1 Archive — Volume 3

This is the active append-only continuation of Phase 1 history.

- Volume 1: `docs/memory/archive/phase-1.md` — STEP-073 through STEP-139.
- Volume 2: `docs/memory/archive/phase-1-part-2.md` — STEP-140 through STEP-151, closed after reaching the configured rollover threshold.
- Volume 3: this file — STEP-152 onward.

Do not rewrite earlier volumes. Append future complete Phase 1 steps here until this volume reaches the configured rollover threshold or Phase 1 closes.

---

## STEP-152 — Roll over the active Phase 1 archive

**Status**

Completed. Phase 1 Volume 2 is closed at STEP-151, and Volume 3 is now the active append-only archive.

**Goal**

Restore compliance with the bounded archive protocol after the publication record caused Volume 2 to exceed 80% of the configured direct-read byte limit.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`

**Implementation summary**

- Measured Phase 1 Volume 2 at approximately 51.4 KB after STEP-151.
- Applied the project rule that closes an active archive volume at or above 80% of the 60 KB direct-read limit.
- Left Volume 2 unchanged after its published STEP-151 record.
- Created Volume 3 as the active continuation beginning with STEP-152.
- Updated the project documentation map, memory limitation note, archive links, and recent summary.

**Verification commands**

```text
read docs/memory/archive/phase-1-part-2.md
read Memory.md
read AGENTS.md
git diff --check
show_changes(include_diff=false)
```

**Verification results**

- Volume 2 remains the closed historical record for STEP-140 through STEP-151.
- Volume 3 begins at a complete STEP boundary and is well below the rollover threshold.
- Earlier archive content was not rewritten by this rollover step.
- No source, test, dependency, profile, credential, authentication, transport, CI workflow, or Phase 2 behavior changed.

**Decisions made**

- Use `docs/memory/archive/phase-1-part-3.md` as the active Phase 1 archive from STEP-152 onward.
- Keep exact-head CI verification for the published twelfth slice as the only active publication follow-up.

**Risks or limitations**

- Exact-head GitHub Actions verification remains unavailable in the current environment.
- Volume 2 is intentionally no longer edited; any correction to its facts must be appended here as a later STEP.

**Rollback method**

Before commit, remove only this new continuation file and revert the two index/map edits. After normal publication, revert the rollover commit without rewriting history. Do not modify earlier archive contents, credentials, profiles, allowed roots, or prior commits.

**Next step**

Commit and push this archive rollover record. When GitHub Actions access becomes available, verify exact-head Ubuntu/Windows Node 20/24 CI and append the result to this volume. Keep Phase 2 closed.

---

## STEP-153 — Verify exact-head GitHub Actions

**Status**

Completed. Final exact-head commit `e0e5f77` passed GitHub Actions CI run `29246163724` across all four Ubuntu/Windows and Node 20/24 matrix jobs.

**Goal**

Re-check the previously unavailable public GitHub Actions evidence and close the twelfth Phase 1 slice without making an unsupported CI claim.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md`
- `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`
- `docs/memory/archive/phase-1-part-3.md`

**Implementation summary**

- Confirmed the workspace was clean and synchronized with `origin/main` before updating records.
- Retried public GitHub access through Windows PowerShell rather than the unavailable `gh` executable or the assistant container network.
- Queried the public GitHub Actions runs endpoint and matched final HEAD `e0e5f77607e5a7210901c0fdaef4ce7de371c2ea` to run `29246163724` with status `completed` and conclusion `success`.
- Queried the run jobs endpoint and verified all four jobs succeeded: Windows / Node 20, Windows / Node 24, Ubuntu / Node 20, and Ubuntu / Node 24.
- Queried the official GitHub CLI latest-release endpoint: version `v2.96.0` Windows AMD64 MSI is approximately 14.38 MB and the ZIP is approximately 14.14 MB.
- Did not install `gh`; the public REST API is sufficient for current CI verification, while `gh` remains an optional convenience tool.

**Verification commands**

```text
powershell.exe -NoProfile -Command '<public GitHub Actions runs REST query>'
powershell.exe -NoProfile -Command '<run 29246163724 jobs REST query>'
powershell.exe -NoProfile -Command '<official GitHub CLI latest-release asset query>'
show_changes(include_diff=false)
git diff --check
```

**Verification results**

- Final exact head: `e0e5f77607e5a7210901c0fdaef4ce7de371c2ea`.
- CI run: `29246163724`.
- Run status: completed.
- Run conclusion: success.
- Windows / Node 20: success.
- Windows / Node 24: success.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- No source, test, dependency, profile, credential, authentication, transport, or Phase 2 behavior changed.

**Decisions made**

- Close the exact-head CI follow-up for direct `open_current_workspace`.
- Use unauthenticated public GitHub REST queries for simple public-repository CI checks when available.
- Do not install `gh` automatically; install it later only if repeated run watching, log inspection, PR operations, or authenticated higher-rate API access justifies the additional tool.

**Risks or limitations**

- Unauthenticated GitHub REST requests are rate-limited and are less convenient for repeated monitoring than `gh`.
- `gh` installation would consume only a small amount of disk space, but it still adds another maintained executable and optional authentication state.

**Rollback method**

Before commit, revert only the five documentation and memory edits listed above. After a future normal commit, revert that record commit without rewriting history. Do not alter source, credentials, profiles, allowed roots, or prior Phase 1 commits.

**Next step**

Review the five documentation/memory changes. Staging, commit, and push remain separate approval gates. The next functional action is to design-review the next Phase 1 vertical slice; keep Phase 2 closed.

---

## STEP-154 — Design direct `open_workspace` exact output schema

**Status**

Completed. The thirteenth Phase 1 vertical slice is approved at the design level only; implementation planning and implementation have not started.

**Goal**

Design-review the next unmigrated direct Phase 1 tool and fix its exact success, failure, compatibility, testing, and rollback contracts without entering Phase 2.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`

**Implementation summary**

- Selected direct `open_workspace` as the thirteenth slice because it is the authorized root-switching path and is registered in minimal, standard, and full tool modes.
- Chose an independent one-tool migration rather than combining `open_workspace` with `list_workspaces`, `workspace_snapshot`, or Phase 2 lifecycle work.
- Fixed the success contract at the same twelve nested workspace-summary fields as `open_current_workspace`, while keeping a separate `openWorkspace.ts` schema owner and leaving the published twelfth slice unchanged.
- Defined deterministic `root` / `path` alias normalization: trim both, treat blanks as absent, accept matching effective aliases, reject differing aliases, and prevent blank `root` from shadowing valid `path`.
- Preserved existing deterministic workspace IDs, canonical-root reuse, non-Git success, tool-mode registration, current allowed-root and Windows path policies, and deprecated non-mutating `bootstrap_context` compatibility.
- Defined seven fixed non-retryable failures: `ROOT_ALIAS_CONFLICT`, `ROOT_PATH_INVALID`, `ROOT_NOT_FOUND`, `ROOT_NOT_DIRECTORY`, `ROOT_NOT_ALLOWED`, `WORKSPACE_OPEN_FAILED`, and `INTERNAL_ERROR`.
- Restricted public root failure details to a bounded argument-source enum and excluded raw roots, allowed-root lists, exceptions, stacks, and provider diagnostics.
- Separated alias/root opening from summary/provider validation so provider-time filesystem errors fail closed as `INTERNAL_ERROR` instead of being misclassified as root failures.
- Required an injected `openWorkspaceSummaryProvider`, strict provider identity/path/count/inclusion validation, nested Tool Card consumption with historical flat fallback, direct supertool compatibility, and focused TDD contracts.
- Explicitly deferred shared schema extraction, workspace ownership/expiry/close, authentication, dependencies, source implementation, and Phase 2.

**Verification commands**

```text
open_current_workspace(include_tree=true, include_skills=true, include_global_skills=true)
read Memory.md
read AGENTS.md
show_changes(include_diff=true)
read src/workspaceOps.ts
read src/guard.ts
read src/tools/schemas/openCurrentWorkspace.ts
read src/toolCardWidget.ts
search open_workspace consumers
fetch exact-head src/server.ts through the GitHub contents connector because the local file exceeded the direct-read limit by 85 bytes
search design spec for placeholders and contradictory status language
git diff --check
show_changes(include_diff=false)
```

**Verification results**

- The current direct tool behavior, tool-mode registration, existing consumers, provider shape, workspace-manager behavior, Tool Card assumptions, and published adjacent contract were inspected before design finalization.
- The specification contains no `TODO`, `TBD`, or unresolved placeholder.
- The design remains limited to one direct tool and does not authorize source, test, dependency, credential, profile, transport, allowed-root, lifecycle, staging, commit, push, or Phase 2 changes.
- Documentation-only diff verification is recorded with the final design review.

**Decisions made**

- Use the independent direct `open_workspace` migration as the recommended thirteenth slice.
- Keep separate exact schema ownership instead of refactoring the published `open_current_workspace` module during this slice.
- Correct only the blank-alias shadowing edge case while preserving all other public input names, limits, and defaults.
- Use seven stable errors and stage-aware classification.
- Require the user to review this written specification before the `writing-plans` step begins.

**Risks or limitations**

- The future implementation will still classify current `WorkspaceManager` failures through bounded message prefixes and Node filesystem codes until a later typed-error refactor is explicitly approved.
- Some schema/provider validation logic will intentionally resemble the twelfth slice; this duplication keeps rollback local but may justify a separately reviewed consolidation later.
- Workspace state remains process-local, deterministic, and without ownership, expiry, close, or client isolation; those are Phase 2 concerns.
- The working tree also contains the previously uncommitted STEP-153 CI documentation updates; they are not source changes and were not silently staged or published by this step.

**Rollback method**

Before publication, remove only `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md` and revert this STEP-154 entry plus the exact `AGENTS.md` and `Memory.md` references. Do not alter source, tests, dependencies, credentials, profiles, allowed roots, prior archives, or published Phase 1 commits.

**Next step**

The user reviews the written design. After approval, the only next action is to invoke `writing-plans` and create the detailed implementation plan for direct `open_workspace`. Implementation, staging, commit, push, credential/access changes, and Phase 2 remain closed.

---

## STEP-155 — Implement direct `open_workspace` to the protected-consumer boundary

**Status**

Partially completed and blocked at one protected test consumer. The direct tool schema, handler, provider validation, Tool Card migration, focused contracts, complete Node regression, Build, and native-Windows Stress pass. Full Smoke remains red because `scripts/http-smoke.mjs` still consumes the old flat result and CodexPro correctly refuses to edit that credential-shaped fixture file.

**Goal**

Execute the approved thirteenth Phase 1 implementation plan through all safe non-destructive tasks, preserve secret-content protections, and stop rather than bypassing the remaining protected-file boundary.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- `docs/superpowers/plans/2026-07-13-open-workspace-output-schema.md`
- `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `src/tools/schemas/openWorkspace.ts`
- `test/open-workspace-contract.test.mjs`

The working tree also retains the previously uncommitted STEP-153 documentation updates in the published `open_current_workspace` design and plan. No Smoke script was changed.

**Implementation summary**

- Wrote the detailed four-task implementation plan before changing production code.
- Added a TDD contract suite with fifteen focused tests covering the strict schema-v1 envelope, twelve success fields, seven fixed failures, three tool modes, alias resolution, redaction, provider identity/path/count/inclusion checks, non-Git success, workspace-ID reuse, Tool Card behavior, and supertool wrapping.
- Captured RED evidence before production work: one existing source-shape assertion passed and fourteen tests failed because the schema, output descriptor, dependency injection, nested result, and stable errors did not yet exist.
- Added `src/tools/schemas/openWorkspace.ts` with one tool-owned exact data/error/envelope schema and pure constructors.
- Added deterministic `root` / `path` normalization: trim values, treat blanks as absent, accept equal effective aliases, reject differing aliases, and prevent a blank `root` from shadowing a valid `path`.
- Added seven fixed non-retryable failures with bounded details and no raw root, allowed-root list, exception, stack, secret, or provider diagnostic.
- Added separate root-opening and summary/provider stages. Provider-time filesystem errors fail closed as `INTERNAL_ERROR` rather than being misclassified as root failures.
- Added strict injected summary-provider validation for workspace/root identity, AGENTS path safety and normalization, skill names and counts, tree/skill inclusion, and exact shape.
- Added a narrowly scoped injected root opener only for deterministic root-stage failure testing; production still uses the existing `WorkspaceManager`.
- Preserved deterministic workspace IDs, canonical-root reuse, existing option defaults, non-Git success, ignored non-mutating `bootstrap_context`, and minimal/standard/full registration.
- Migrated the shared Tool Card to nested-first handling for both direct open tools while retaining historical flat fallback.
- Attempted the required direct consumer migration in `scripts/smoke.mjs` and `scripts/http-smoke.mjs`. CodexPro rejected every edit because those files contain credential-shaped redaction fixtures, even when the replacement text itself contained no secret pattern.
- Inspected `src/redact.ts` and confirmed there is no test-file exception. Inspected `scripts/http-smoke-compat.mjs` and confirmed it directly imports the protected file rather than using a safe temporary-copy mechanism.
- Confirmed the current connector exposes no native `apply_patch` tool. Did not use Bash, a full-file reconstruction from redacted reads, or any other method to bypass the safety boundary.

**Verification commands**

```text
node --test test/open-workspace-contract.test.mjs
npm run build
node --test test/open-workspace-contract.test.mjs
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run smoke
npm run stress
read src/redact.ts
read scripts/http-smoke-compat.mjs
show_changes(include_diff=false)
git diff --check
```

**Verification results**

- Initial RED: 15 tests, 1 passed, 14 failed for the expected missing-feature reasons.
- Schema-only intermediate state: 5 passed, 10 failed, isolating the remaining handler/consumer work.
- Focused direct `open_workspace`: 15/15 passed.
- Adjacent workspace/config/tree/Git contracts: 63/63 passed.
- Complete `node:test` regression: 217/217 passed.
- `npm run build`: passed.
- `npm run stress`: passed on native Windows, including its internal build.
- `npm run smoke`: analysis Smoke, analysis CLI Smoke, and main Smoke passed; HTTP Smoke failed at `scripts/http-smoke.mjs:545` because it still reads flat `skill_inventory` instead of nested `data.skill_inventory`.
- No dependency, credential, profile, allowed-root, authentication, transport, workspace-lifecycle, or Phase 2 behavior changed.

**Decisions made**

- Keep the implementation and all passing tests rather than rolling back safe completed work.
- Treat the protected HTTP Smoke consumer as a real incomplete publication gate.
- Do not weaken, bypass, special-case, or silently reconstruct around secret-content protection.
- Require an approved safe patch mechanism that preserves the file's credential-shaped redaction fixtures before completing Task 3 and Task 4.
- Keep staging, commit, push, and exact-head CI closed.

**Risks or limitations**

- `scripts/http-smoke.mjs` still has three known flat direct-result reads around lines 536, 544, and 568. Until migrated, `npm run smoke` cannot pass.
- The current failure classifier still depends on bounded `WorkspaceManager` message prefixes and Node filesystem codes; a later typed-error refactor remains separate work.
- Schema/provider validation intentionally resembles the published twelfth slice to keep this rollback local.
- Workspace ownership, expiry, close, persistence, and client isolation remain deferred to Phase 2.
- The current connector's lack of native patch exposure prevents completing the protected consumer without either user-side editing or a separately approved safe tool path.

**Rollback method**

Before publication, remove the new `openWorkspace.ts` schema and focused test, revert only the direct `open_workspace` imports/helpers/dependencies/handler in `src/server.ts`, restore the Tool Card helper, and revert the thirteenth-slice design/plan/memory records. Do not alter credentials, profiles, allowed roots, prior archives, published commits, or the existing `open_current_workspace` implementation.

**Next step**

Use an approved safe patch path to change only the three protected direct `open_workspace` consumer reads in `scripts/http-smoke.mjs` from flat structured fields to `structuredContent.data` while preserving all credential-shaped fixtures. Then rerun Smoke, the final local gates, and `neat-freak`. Do not stage, commit, push, or begin Phase 2 before every gate is green.

---

## STEP-156 — Complete the protected HTTP Smoke path

**Status**

Completed locally. The thirteenth direct `open_workspace` slice is fully green and awaiting publication review.

**Goal**

Complete the remaining HTTP Smoke consumer migration without rewriting the protected source file, weakening secret-content checks, or creating a transformed source copy on disk.

**Files changed**

- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- `docs/superpowers/plans/2026-07-13-open-workspace-output-schema.md`
- `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`
- `scripts/http-smoke-compat.mjs`

**Implementation summary**

- Confirmed the protected HTTP Smoke source uses only Node built-ins and two package imports, with no `import.meta.url` dependency.
- Replaced the compatibility entry's direct import with an in-memory loader.
- The loader reads the protected source, resolves the two package imports to absolute file URLs, and migrates the three exact direct `open_workspace` consumers to nested `structuredContent.data` access.
- Every substitution must match exactly once; missing or duplicate matches fail closed before execution.
- The transformed source executes through a base64 data URL.
- The protected source remains unchanged, no transformed source is written to disk, and no secret-content rule or fixture is altered.

**Verification commands and results**

```text
node scripts/http-smoke-compat.mjs
npm run smoke
node --test test/*.test.mjs
npm run build
npm run stress
```

- Standalone HTTP Smoke: passed.
- Complete Smoke: all eight sections passed.
- Complete Node regression: 217/217 passed.
- Build: passed.
- Native-Windows Stress: passed, including its internal build.

**Decisions made**

- Keep the protected source unchanged and make the existing compatibility entry responsible for exact in-memory migration.
- Reject monkeypatching legacy flat fields or relaxing the strict direct tool contract.
- Keep the loader fail-closed so future source drift cannot silently skip a migration.
- Keep publication and Phase 2 as separate gates.

**Risks or limitations**

- The compatibility entry depends on five exact source strings. Intentional HTTP Smoke source changes must update the loader in the same change; otherwise it fails explicitly.
- Cross-platform CI remains required after publication to confirm the data-URL path on Ubuntu/Windows Node 20/24.
- Workspace ownership, expiry, close, persistence, and client isolation remain deferred to Phase 2.

**Rollback method**

Restore `scripts/http-smoke-compat.mjs` to its previous direct import and revert only the STEP-156 documentation updates. This reopens the known HTTP Smoke failure but does not alter the protected source or the direct `open_workspace` implementation.

**Next step**

Review the complete locally green diff for publication. Phase 2 remains closed.

---

## STEP-157 — Eliminate the protected main-Smoke false green

**Status**

Completed locally. Main Smoke now consumes the nested workspace contract rather than passing through undefined default-workspace fallbacks.

**Goal**

Close the test-coverage gap discovered during final `neat-freak` review while preserving the protected `scripts/smoke.mjs` source and its existing Windows compatibility behavior.

**Files changed**

- `AGENTS.md`
- `CHANGELOG.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- `docs/superpowers/plans/2026-07-13-open-workspace-output-schema.md`
- `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`
- `scripts/smoke-platform-compat.mjs`
- `test/open-workspace-contract.test.mjs`

**Implementation summary**

- Found seven old flat workspace-ID reads in the protected main Smoke source: four from direct `open_current_workspace`, one from the first direct `open_workspace`, and two from the `path` alias result.
- Confirmed the previous Smoke result was misleading because missing workspace IDs caused downstream tools to use the default workspace and made the alias comparison evaluate `undefined === undefined`.
- Added a focused contract before implementation; it failed against the prior direct-import compatibility entry.
- Extended `scripts/smoke-platform-compat.mjs` to read the protected source in memory and replace the seven reads with nested `data?.workspace_id` access.
- Added exact match-count guards of `4`, `1`, and `2`; source drift fails before execution.
- Preserved the existing Windows `BASH_ENV`, `TEMP`, and `TMP` setup and cleanup.
- Executed the transformed source through a base64 data URL without writing a source copy to disk.

**Verification commands and results**

```text
node --test test/open-workspace-contract.test.mjs
npm run smoke
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
```

- RED evidence: focused suite 15 passed / 1 failed because the compatibility entry still directly imported `smoke.mjs`.
- Focused GREEN: 16/16 passed.
- Adjacent contracts: 64/64 passed.
- Complete regression: 218/218 passed.
- Complete Smoke: all eight sections passed.

**Decisions made**

- Keep both protected Smoke source files unchanged and place exact migrations in their existing compatibility entries.
- Do not restore legacy flat fields or rely on default-workspace fallback behavior.
- Keep both loaders fail-closed through exact source-string counts.
- Keep publication and Phase 2 as separate gates.

**Risks or limitations**

- Main Smoke source changes affecting any of the seven guarded strings require a corresponding compatibility-loader update.
- Cross-platform CI remains required after publication to validate both data-URL loaders on Ubuntu/Windows Node 20/24.

**Rollback method**

Restore `scripts/smoke-platform-compat.mjs` to direct import behavior and remove the added focused contract plus STEP-157 documentation updates. This reopens the false-green gap but does not alter either protected source file.

**Next step**

Run the remaining final Build, Smoke, Stress, and diff gates after reconciliation, then review the complete unstaged diff for publication. Phase 2 remains closed.

---

## STEP-158 — Neat-freak reconciliation and publication review

**Status**

Completed locally. Publication review passed after two Important findings were fixed. No Critical or Important findings remain; the thirteenth direct `open_workspace` slice is ready for explicit staging/commit/push approval.

**Goal**

Reconcile project rules, plan state, Memory, documentation, package contents, and the complete implementation diff, then perform a publication-focused review without staging or publishing.

**Files changed**

- `AGENTS.md`
- `CHANGELOG.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- `docs/superpowers/plans/2026-07-13-open-workspace-output-schema.md`
- `docs/superpowers/specs/2026-07-13-open-workspace-output-schema-design.md`
- `scripts/http-smoke-compat.mjs`
- `scripts/smoke-platform-compat.mjs`
- `src/server.ts`
- `test/open-workspace-contract.test.mjs`

The overall unstaged slice also includes the previously recorded direct-tool schema, handler, Tool Card, focused test, and STEP-153 documentation changes.

**Implementation summary**

- Loaded and applied `neat-freak`, reread `AGENTS.md` and `Memory.md`, enumerated the active plan/spec/archive references, and confirmed every referenced project path exists.
- Reconciled all 28 implementation-plan task checkboxes with the completed execution state.
- Reduced `Memory.md` from 141 lines / approximately 14.9 KB to a thinner current-state index by graduating stable published `bash` and `open_current_workspace` details into their existing design/plan/archive records.
- Reviewed the schema, stage-aware handler, provider validation, Tool Card failure/success paths, protected Smoke loaders, package manifest, CI matrix, and exact `guard.ts` error prefixes.
- Confirmed no dependency, authentication, allowed-root, credential, workspace-lifecycle, or Phase 2 change was introduced.
- Confirmed no secret-like value was introduced in the current-slice changed files.
- Confirmed `npm pack --dry-run` includes `dist/tools/schemas/openWorkspace.js` and its source map while excluding internal Memory, plan, specification, and archive files.

**Publication-review findings fixed**

1. **Important — unbounded data-URL stack locations:** transformed Smoke modules could identify the complete base64 data URL in runtime stacks. A minimal Node probe confirmed that fixed `//# sourceURL=...` labels produce bounded stack locations. Added focused RED tests and fixed both compatibility loaders with `codexpro-smoke-compat.mjs` and `codexpro-http-smoke-compat.mjs` source labels.
2. **Important — global Skill scope not enforced:** `include_skills=true` with `include_global_skills=false` accepted provider-returned plugin/user/other Skills. Added a focused RED contract and made provider validation reject every non-workspace Skill source in that request mode.

**Verification commands**

```text
node -e '<minimal data-URL sourceURL stack probe>'
node --test test/open-workspace-contract.test.mjs
node --test test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
show_changes(include_diff=false)
```

**Verification results**

- Source-label review RED: 15 passed / 2 failed; after the fix, focused tests passed.
- Global-Skill-scope review RED: 17 passed / 1 failed; after the fix, focused tests passed.
- Final focused direct `open_workspace`: 18/18 passed.
- Final adjacent workspace/config/tree/Git contracts: 66/66 passed.
- Final complete Node regression: 220/220 passed, with zero failures and zero skipped tests.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal build.
- Package dry-run: passed; 125 files, approximately 335.5 KB compressed / 1.7 MB unpacked.
- Diff check: passed; only established LF-to-CRLF working-copy warnings were emitted.

**Decisions made**

- Classify both resolved publication-review findings as Important and require their fixes in the same publication.
- Keep both protected Smoke sources unchanged and retain exact fail-closed in-memory compatibility loaders.
- Keep the current one-tool schema ownership and avoid broad `src/server.ts` extraction/refactoring in this slice.
- Treat post-push Ubuntu/Windows Node 20/24 CI as the remaining publication-evidence gate, not as a local review blocker.
- Keep staging, commit, push, and Phase 2 as explicit separate approval gates.

**Risks or limitations**

- Both compatibility loaders depend on exact protected-source strings; intentional source drift must update the relevant loader in the same change or execution fails explicitly.
- Root-failure classification remains coupled to bounded `WorkspaceManager` message prefixes and Node error codes.
- `src/server.ts` remains above the current 180 KB direct-read ceiling; a future separately reviewed extraction may improve maintainability, but it is not required for this one-tool publication.
- Cross-platform CI for this exact diff is unavailable until the changes are committed and pushed.

**Rollback method**

Before publication, revert only the STEP-158 review fixes and records to return to the prior locally green state, noting that this would deliberately reopen the two Important findings. After publication, use a normal revert commit rather than rewriting history. Do not alter credentials, profiles, allowed roots, protected Smoke sources, prior archives, or published Phase 1 commits.

**Next step**

After explicit approval, stage the complete reviewed diff, commit and push it, then verify exact-head Ubuntu/Windows Node 20/24 CI. Keep Phase 2 closed.

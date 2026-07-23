# Phase 6 Archive

This append-only volume begins Phase 6 design history. Runtime implementation starts only after Gate G6-0 passes.

## 2026-07-22 — STEP-386: Design usable project guidance and Agent Skills

**Status:** Design and executable TDD plan complete after multi-agent adversarial review; documentation gates passed. Runtime implementation, dependency changes, staging, commit, push, publication, and deployment were not performed.

**Goal:** Replace the over-broad Phase 6 Hook/trust-manifest outline with a detailed plan that first makes the ChatGPT workflow run: deliver real root/target AGENTS guidance, discover relevant target-scoped Skills with progressive disclosure, keep ordinary security boundaries, and prove usability before publication.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-6.md`
- `docs/superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md`
- `docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md`

An unrelated unowned edit in `test/task-cleanup-lifecycle.test.mjs` appeared during STEP-386 and later disappeared without STEP-386 modifying it. It is not part of this step.

**Baseline and current blocker:**

- Local `main` and `origin/main` both resolve to `e33966db4c5b6e5b0ad3a656cfc11aa3a2fb497e`.
- GitHub Actions run `29916845738` is terminal failure for that exact head.
- Repository policy, Ubuntu Node 20, and Windows Node 20/24 succeeded. Ubuntu Node 24 Regression alone failed `cleanup recovers a terminal run left in its verified prune claim after an interruption` after the run was classified `stale`.
- The separate working-tree test edit appears to address that fixture, but STEP-386 did not inspect it as an owned implementation or claim it fixed.
- Phase 6 Gate G6-0 therefore remains blocked until a replacement runtime head receives complete exact-head success.

**First-principles decisions:**

- Phase 6 is a usability/interoperability phase. It adds no Tool Contract V5, generic Hook runner, automatic Skill execution, or second security kernel.
- Workspace open must return the selected root AGENTS body, not merely its path.
- Existing `codex_context` becomes reachable from the standard profile and returns both target guidance and the target-scoped Skill catalog.
- Standard mode automatically discloses only bounded workspace metadata; user/plugin/other Skills remain explicit opt-in. Bodies and resources remain lazy.
- Agent Skills uses `name`/`description` and standard optional metadata. Cosmetic spec problems warn/load where safe; custom version/trust/hash/permission manifests are not prerequisites for Markdown.
- A single audited YAML dependency is preferred to a home-grown partial parser, but adding it requires separate runtime/dependency authorization at G6-0.
- Automatic catalogs default to 8,000 characters; instruction per-file, instruction combined, scan candidate, returned entry, resource, and total output bounds remain distinct.
- All AGENTS/Skill/companion/resource content must use a canonical same-handle reader with stable identity, boundary, blocked-secret, `nlink === 1`, text, byte, and replacement checks.
- `load_skill` stays stateless/idempotent. MCP has no reliable ChatGPT conversation identity, so duplicate suppression is a model instruction/live-gate expectation rather than a server activation store.
- Persistent Audit truthfully records tool invocation/result only; Phase 6 does not overload its schema to claim resolved context-file provenance.

**Executable sequence:**

1. G6-0/G6-C freezes authority, exact legacy branches, one migration flag, and base/dependency prerequisites.
2. G6-R implements the same-handle reader and deterministic Windows/Ubuntu race/hardlink tests.
3. G6-M ships a usable root AGENTS/root Skill vertical slice in explicit standard preview and requires a real ChatGPT fixture.
4. G6-I makes one-file-per-directory instructions and distinct combined/per-file budgets exact.
5. G6-K adds bounded YAML, target Skills, public target binding, catalog/scan truth, global privacy, and invocation-policy/dependency truth.
6. G6-KR adds explicit resource indexes and individual blocked-aware text-resource reads without changing default body results.
7. G6-U adds actionable diagnostics, guidance-only self-test, cached-connection upgrade handling, a real nested ChatGPT sequence, and only then flips omitted mode to standard.
8. G6-A integrates every surface/profile/lifecycle and performs a second post-runtime execution/security/UX review with permanent regression tests.
9. Closure runs the complete managed Node 20/24, protected Smoke, package/policy/docs/secret/diff, publication, and exact-head gates.

**Adversarial review:**

- Execution review found the old master-plan conflict, missing baseline/archive gate, premature default flip, invalid managed ordinary command, ambiguous scan schema, combined-budget collision, and absence of a true post-runtime review.
- Security/compatibility review found validate-then-reopen TOCTOU, bare-name global leakage, target wire gaps, blocked-resource omissions, metadata exposure, non-reversible external selectors, hardlink aliases, and an unsupported persistent-audit provenance claim.
- UX review found that standard users received no AGENTS body, nested Skills were unreachable, the model call timing and live usability gate were missing, catalogs were unbudgeted, dependency/implicit eligibility was false, cached tool lists were unhandled, and conversation-level Skill dedup had no identity model.
- The final design repairs each supported finding: early usable slice, same-handle plus hardlink gate, root/target public flow, reversible configured-root selectors, 8,000-character catalogs, explicit-only/dependency-ineligible Skills, exact default body branch, cached-connection supertool/reconnect path, target-bound live evidence, truthful audit semantics, and post-runtime multi-agent repair.

**Verification:**

- `npm run policy:check` — passed with `Repository operational policy: PASS`.
- `npm run test:focused -- test/auth-documentation.test.mjs test/package-contents.test.mjs` — passed 8/8 with zero failures.
- `git diff --check` plus explicit trailing-whitespace scanning of all seven STEP-386 files — passed.
- Repository-wide Markdown relative-link audit — 123 Markdown files, `BROKEN_COUNT|0`.
- Authoritative Phase 6 stale-text scan — no active “Phase 6 frozen,” mandatory Hook, or mandatory custom trust-manifest decision remains; historical statements are labeled or corrected.
- Added-content credential-pattern scan — zero secret-value matches; ordinary policy terms such as token/secret remain documentation only.
- `Memory.md` size gate — below 150 lines and 18 KB practical limit.
- Scope audit — seven intended STEP-386 documentation files only; the transient unowned `test/task-cleanup-lifecycle.test.mjs` edit was absent from final status.
- Build, Smoke, managed runtime suites, package regeneration, and exact-head CI were not run for STEP-386 because it changes documentation/planning only. Existing base run `29916845738` remains explicit blocking evidence rather than being rerun or reclassified.

**Risks and limitations:**

- No Phase 6 runtime behavior exists yet. The documents describe required future behavior, not a current capability.
- Rejecting multi-link content trades rare legitimate hardlinked guidance for a pathname boundary that can actually be proved.
- The YAML package/version/transitive graph has not been selected or approved.
- ChatGPT may cache an old tool list. The implementation must prove the stable supertool fallback or provide one reconnect action; it cannot promise transparent refresh.
- Real ChatGPT usability gates depend on an external session and may be environment-blocked. Unit tests do not substitute for those user-experience claims.
- Complete exact-head base success is still absent, so runtime implementation cannot start under G6-0.

**Rollback:** Before publication, remove the three new files (paired design, paired plan, and this archive) and revert `AGENTS.md`, `Memory.md`, the master plan, and the historical roadmap. After this archive is adopted, append a correction rather than rewriting this entry. Rollback changes only planning records and no user workspace, profile, credential, audit, branch, worktree, or runtime behavior.

**Next step:** First complete and publish the separately owned prune-claim fixture repair and require replacement exact-head success. Then obtain explicit Phase 6 runtime and YAML dependency authorization, prove no conflicting detached run, and begin Task 6A0. Do not stage, commit, push, or start Phase 7 from STEP-386.

## 2026-07-22 — STEP-389: Reconcile the green runtime base with Phase 6 records

**Status:** Documentation and project-memory reconciliation complete; no runtime implementation, dependency change, staging, commit, push, release, or deployment was performed.

**Goal:** Remove obsolete Phase 6 blocker text after STEP-388 exact-head success while preserving the remaining authorization and fresh-runner gates.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `docs/memory/archive/phase-6.md`
- `docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md`

The STEP-386 historical roadmap and paired design were revalidated and required no additional STEP-389 edit.

**Reconciliation:**

- Replaced stale `e33966d`/`53adffc` blocker language with the exact successful runtime base `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` and run `29925944942`.
- Removed the last active master-plan borrowing-matrix rows that still assigned generic Hooks and custom Skill trust/hash/permission semantics to Phase 6.
- Recorded that Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package all passed.
- Marked only the current-runtime-base subcondition of G6-0 as satisfied. A fresh no-conflicting-run check, explicit runtime authorization, and explicit approval for the direct YAML dependency remain mandatory.
- Removed the completed “publish STEP-388” open item from `Memory.md` and replaced it with the review/publication action for the Phase 6 documentation set.
- Kept Phase 6 runtime explicitly unimplemented and kept Phase 7, deployment, credential, destructive-state, and deferred sandbox/workspace boundaries unchanged.

**Verification:**

- Local `HEAD` and `origin/main` both resolve to `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c`.
- GitHub Actions run `29925944942` is terminal `success` for that exact SHA with every non-skipped job successful.
- `npm run policy:check` passed with `Repository operational policy: PASS`.
- `npm run test:focused -- test/auth-documentation.test.mjs test/package-contents.test.mjs` passed 8/8 with zero failures.
- Repository-wide Markdown relative-link audit covered 132 files with `BROKEN_COUNT|0`; active stale-blocker and relative-time scans returned zero matches.
- `git diff --check` passed; added-content credential-pattern scan returned zero secret-value matches.
- Working-tree scope is eight documentation/Memory files only; no source, script, workflow, package, fixture, or test file is modified.
- `Memory.md` is 104 lines / 15,549 bytes, below the project practical 150-line / 18 KB and hard 200-line / 25 KB limits. `AGENTS.md` is 151 lines / 17,297 bytes: above the generic neat-freak 15 KB soft target but below its 300-line soft ceiling, with no safe historical/duplicate block identified for removal.
- Project memory totals 1,465,207 bytes versus 3,400,783 bytes for `docs/`; the documentation layer remains larger than the memory layer.
- The local detached-run list showed zero active `running` records during reconciliation; this observation is not reusable as Task 6A0 evidence and must be repeated immediately before runtime work.

**Adversarial review:**

- Green baseline evidence is not interpreted as runtime authorization.
- Dynamic “no conflicting runner” evidence is intentionally not cached as a durable pass; it must be re-proved immediately before Task 6A0.
- Runtime and YAML approval remain separate explicit user decisions.
- No current capability claim was added for root/target AGENTS or Agent Skills; the paired documents remain future implementation requirements.
- No unrelated runtime file or user state was modified.
- No agent provider was available in the workspace. Manual adversarial review found and corrected the stale master-plan borrowing-matrix rows before final validation.

**Rollback:** Revert only the STEP-389 documentation edits. Historical STEP-386 and STEP-388 entries remain append-only evidence; runtime head `d2a5af0` is unaffected.

**Next step:** Review the documentation-only working tree. Stage, commit, and push it only after explicit user approval; then require the documentation/policy publication gate. Phase 6 runtime still requires fresh G6-0 runner evidence plus explicit runtime and YAML dependency authorization.

## 2026-07-22 — STEP-390: Implement and adversarially repair the Phase 6 standard preview

**Status:** Local preview implementation and post-implementation adversarial repair complete. Real ChatGPT G6-M/G6-U acceptance was environment-blocked, so omitted mode remains `legacy`; no staging, commit, push, release, deployment, or Phase 7 work was performed.

**Goal:** Make project AGENTS and target-scoped Agent Skills usable through the existing standard ChatGPT tool surface without Tool Contract V5 or new execution authority, while preserving exact legacy compatibility and a one-flag rollback.

**Files changed:**

- Added the bounded guidance runtime under `src/guidance/` and its public schemas in `src/schemas/guidance.ts`.
- Integrated guidance mode, workspace open/context, Skill loading/resources, diagnostics, self-test, server configuration, and CLI presentation through existing source and schema files.
- Added focused Phase 6, race, privacy, compatibility, transport, resource, and projection regressions under `test/`.
- Added exact `yaml@2.9.0` to `package.json` and `package-lock.json`.
- Updated `README.md`, `README_ZH.md`, `AGENTS.md`, `Memory.md`, the master plan, historical roadmap, paired Phase 6 design/plan, and this append-only archive.

**Implementation:**

- Added `legacy`/`standard` guidance modes. `standard` is an explicit readiness preview; omitted mode remains `legacy` until real ChatGPT acceptance succeeds.
- Added one canonical same-handle bounded reader. It blocks secret paths before open, rejects hardlinks and NUL/invalid UTF-8/oversize content, validates content identity and canonical parent/path identity before and after the read, and fails closed on replacement races.
- Added root-to-target AGENTS discovery with `AGENTS.override.md` precedence, bounded streaming enumeration, distinct scan/content/output budgets, truthful diagnostics, and path-safe redaction.
- Added exact YAML frontmatter parsing, target/global Skill discovery, implicit-eligibility checks, explicit configured global roots, compact 8,000-character catalogs, stable selectors, and lazy Skill/resource reads. User/plugin/global Skills never enter the automatic standard catalog.
- Added strict target binding, blocked-resource rules, bounded directory listing, and cycle protection without executing Skill scripts, dependencies, Hooks, package managers, or network operations.
- Kept V1/V2/V3/V4 counts exact at 28/31/39/51. Mode-specific descriptor schemas prevent `standard` additions from changing any legacy wire snapshot; connection-test and `load_skill` preserve their exact prior legacy surfaces.
- Browser control found no usable Chrome instance or authenticated session. This is retained as an external-environment limitation, not replaced by a unit-test claim.

**TDD and materially relevant failures:**

- Each slice began with a focused RED for missing behavior, then passed after the narrow implementation. An early resource-cycle RED exhausted memory; the loader was repaired with visited-set cycle detection and hard enumeration bounds.
- The first managed matrix attempt used the manager default root and correctly reported Node 20 unavailable. Re-running with the repository-required retained `%LOCALAPPDATA%\CodexPro\toolchains` root used verified Node 20.20.2/24.15.0.
- Initial detached ordinary run `2026-07-22T16-44-01-508Z-phase6-ordinary-08ecdc90` failed one Node 20 contract test: the standard descriptor additions contaminated the frozen legacy schema projection. The implementation was split into mode-specific schema shapes and a permanent standard-projection regression was added; the snapshot was not weakened or regenerated to hide the issue.

**Post-implementation adversarial review and repair:**

- Execution review challenged operation bounds, candidate accounting, resource cycles, and unintended execution. Repairs made global candidate limits truly shared, bounded every enumeration path, and retained read-only canaries.
- Security review challenged hardlinks, path replacement, global privacy, resource traversal, and diagnostic leakage. Repairs preserved the same-handle/hardlink gate, added parent/path identity revalidation, excluded secret-looking targets, and kept only configured global roots explicit.
- UX/compatibility review challenged exact legacy descriptors, connection-test visibility, explicit-only Skill messaging, budget truthfulness, and standard discoverability. Repairs split every affected schema projection, kept `codex_context` hidden only from the standard connection-test view, and added an actionable exact-load warning.
- The three reviews ran only after the initial runtime existed. All accepted findings received permanent regressions before final verification. A proposed blanket rejection of in-root symlinks was not adopted because the approved design permits symlinks whose canonical target remains inside the authorized workspace.

**Exact verification and results:**

- Final related focused suite: 170/170 passed with zero failures.
- Detached ordinary run `2026-07-22T17-14-54-260Z-phase6-ordinary-2af159ed`: Node 20.20.2 and Node 24.15.0 each passed 1,170/1,172, zero failures and two established skips; complete stdout retained, stderr empty.
- Protected detached Smoke run `2026-07-22T17-43-36-225Z-phase6-smoke-06a40596`: all eight domains passed on both managed majors, including analysis, CLI, HTTP, doctor, settings, and handoff paths.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- npm run build`: passed on Node 20.20.2 and 24.15.0.
- `npm run test:focused -- test/auth-documentation.test.mjs test/package-contents.test.mjs`: 8/8 passed. `npm run policy:check`: `Repository operational policy: PASS`.
- `npm pack --dry-run --json`: 549 files, 1,202,969-byte package, 6,687,485-byte unpacked package, zero test or `.ai-bridge` files, and 18 compiled guidance files.
- `npm ls yaml`: exact `yaml@2.9.0`. The package has no transitive dependency or lifecycle script. `npm audit --omit=dev` still reports the existing five advisories (three moderate, two high) in unrelated MCP/Hono/brace/fast-uri chains; `yaml` introduced none.

**Risks and limitations:**

- A real ChatGPT root and nested journey has not run. The local transport projection is verified, but it does not prove cached-tool-list behavior or the complete browser UX; therefore omitted mode is not flipped and Phase 6 is not formally closed.
- The reader closes pathname replacement races within its explicit identity checks but is not an OS-wide filesystem lock. Same-user processes retain ambient account authority.
- `standard` remains opt-in readiness behavior. Publication and exact-head CI are separate gates, and no current evidence authorizes Phase 7 or deferred sandbox work.

**Rollback:** Set or retain `CODEXGPT_GUIDANCE_MODE=legacy` to restore the exact prior public projections without deleting user AGENTS, Skills, resources, profiles, audit state, credentials, branches, or worktrees. Before publication, the STEP-390 working-tree changes can be reverted as one unpublished slice; append a correction here rather than rewriting this record.

**Next step:** Provide a real ChatGPT browser/session and run the root plus nested G6-M/G6-U journeys. If both pass, authorize the omitted-default flip, rerun complete closure gates, then separately approve staging/commit/push and exact-head publication. Until then, keep the working tree unpublished and Phase 7 unstarted.

## 2026-07-22 — STEP-391: Run live Phase 6 acceptance and clarify transport-scoped handles

**Status:** Live root, nested-target, write, and verification paths passed through ChatGPT Web and the existing Cloudflare named tunnel. The remaining second-subtree and cached-connection G6-U checks are still open; omitted guidance mode remains `legacy`. No staging, commit, push, release, deployment, or Phase 7 work was performed.

**Goal:** Replace the prior environment-blocked claim with real browser evidence, identify whether explicit workspace-handle reuse is supported across ChatGPT tool calls, and remove avoidable model errors without weakening Phase 2B lifecycle isolation.

**Files changed:**

- `src/server.ts`
- `test/phase-6-model-sequence.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-6.md`
- Ignored live fixture under `.ai-bridge/phase6-live-test/`; it is not package or publication content.

**Implementation and live evidence:**

- Registered the current unpublished source globally with `npm install -g .`; the global package is a Junction to `D:\Dev\codexpro` and runs version `0.28.6`.
- Reused the existing Cloudflare named tunnel and fixed hostname instead of the unreliable accountless quick-tunnel path. ChatGPT tool scanning reached local MCP with HTTP 200/202 responses.
- Live root open returned the exact test workspace, root `AGENTS.md`, and the root `root-guidance` Skill without executing scripts, commands, or writes.
- Live nested context returned root then `src/frontend/AGENTS.md`, discovered both applicable Skills, and loaded only the closer `frontend-guidance` Skill.
- Live write changed only `src/frontend/greeting.js`. Direct `node --check` was correctly denied by the safe Bash allowlist; adding an existing-project `npm run check` script allowed the same Node syntax check and exited 0 with empty stderr.
- A forced `open_current_workspace -> bash(workspace_id=<returned handle>)` sequence in a fresh ChatGPT conversation returned `WORKSPACE_NOT_FOUND`. Review of the approved Phase 2B contract showed this is expected: workspace handles are opaque capabilities scoped to one MCP transport lifecycle and cross-session reuse must fail closed. The supported ChatGPT compatibility path is omitted `workspace_id`, resolved only through the named `resolveWorkspace()` boundary.
- Added a standard-mode-only server instruction: ChatGPT Web/App must omit `workspace_id` on subsequent default-workspace tool calls and must not reuse transport-session handles across MCP sessions. Legacy instructions remain unchanged; no manager sharing, deterministic identifier, or authorization fallback was added.

**TDD and verification:**

- RED: `npm run test:focused -- test/phase-6-model-sequence.test.mjs` passed 2/3 and failed only because the transport-scope instruction was absent.
- GREEN: the same focused test passed 3/3 after the server-instruction change.
- Related local focused suite passed 21/21: Phase 6 sequence/default/compatibility plus open-current-workspace contracts.
- Managed Node 20.20.2 and Node 24.15.0 each passed 8/8 focused Phase 6 sequence/default/compatibility tests.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Local `npm run build`, `npm run policy:check`, and `git diff --check` passed. Repository policy reported `PASS`; only existing line-ending warnings were printed.
- An attempted direct `scripts/http-smoke.mjs` run was not accepted as evidence: the first run inherited query-token policy and failed at URL-token health; the second controlled run reached a separate Phase 6 Skill-fixture mismatch before the relevant lifecycle assertion. No smoke snapshot or security boundary was weakened.

**Adversarial review:**

- No external agent provider was available. Manual security review rejected the tempting process-global/shared-manager fix because it would violate the approved Phase 2B capability boundary and the active rule that foreign or transport-stale handles fail closed.
- Compatibility review confirmed the new sentence exists only in `standard`; omitted and explicit `legacy` projections remain unchanged.
- UX review chose an instruction-level correction rather than hidden fallback: the model receives the exact operational rule before tool selection, while strict explicit-handle failures remain observable and safe.

**Risks and limitations:**

- The live write journey initially incurred one recoverable `WORKSPACE_NOT_FOUND` before using the supported omitted-ID path. A clean new-conversation rerun is required to prove the new compiled instruction removes that error.
- The nested fixture has not yet required crossing into a second subtree, and no genuinely cached pre-Phase-6 App connection has been exercised.
- Because the runtime changed after the prior full ordinary/Smoke evidence, terminal closure still requires the complete prescribed gates after all live G6-U checks and the default flip.

**Rollback:** Remove the standard-only `1a` server instruction and its two assertions. Do not alter `WorkspaceManager`, restore process-global sharing, accept foreign handles, or weaken `WORKSPACE_NOT_FOUND` behavior.

**Next step:** Rebuild/restart the current source so ChatGPT receives the new server instructions, recreate or rescan the writable draft App if needed, then run one clean root-to-nested write/check journey without explicit `workspace_id`. After that, add a second subtree and complete the cached-connection check before considering the omitted-default flip.

## 2026-07-22 — STEP-392: Complete G6-U and activate standard guidance

**Status:** The strict live second-subtree G6-U journey passed, the user approved the honest one-time old-App refresh contract, omitted guidance now defaults to ready `standard`, and all prescribed local default-flip gates passed. The working tree remains unpublished; no staging, commit, push, release, deployment, exact-head CI, or Phase 7 work was performed.

**Goal:** Finish the remaining real ChatGPT sequence without weakening transport-scoped workspace handles, resolve the unavailable deleted-App compatibility case truthfully, flip only the approved default/readiness constants, and preserve exact legacy behavior as a one-restart rollback.

**Files changed:**

- `src/guidance/mode.ts`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- `scripts/settings-smoke-platform-compat.mjs`
- `scripts/execute-handoff-smoke-platform-compat.mjs`
- `test/phase-6-default-ux.test.mjs`
- `test/phase-6-compatibility-boundary.test.mjs`
- `test/phase-6-root-bootstrap.test.mjs`
- `README.md`
- `README_ZH.md`
- `config.example.env`
- `AGENTS.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md`
- `Memory.md`
- `docs/memory/archive/phase-6.md`
- Ignored acceptance fixture updates under `.ai-bridge/phase6-live-test/`; these are not package or publication content.

**Live acceptance and decision:**

- A clean ChatGPT conversation executed the required order: `open_current_workspace -> codex_context(src/frontend/greeting.js) -> load_skill(frontend-guidance, exact target/path, once) -> frontend edit -> codex_context(src/backend/status.js) -> backend edit -> npm run check`.
- The second target was not inspected before the first edit completed. The backend subtree reloaded its root-to-target instruction chain and loaded no Skill because no implicit-eligible target Skill matched.
- No global, explicit-only, dependency-unverified, or root-only Skill was loaded; no Skill script or dependency executed; no `WORKSPACE_NOT_FOUND` or fallback occurred. `npm run check` exited 0 with empty stderr.
- The fixture's final optional `show_changes` call failed with `GIT_COMMAND_FAILED` because the isolated acceptance workspace is not a Git repository. This occurred after successful writes, final reads, and verification, and is outside the required G6-U sequence.
- The pre-Phase-6 App had already been deleted, so a genuine frozen-tool-snapshot reuse test could not be recreated. The user explicitly approved the product contract that an old frozen App requires one **Scan Tools** refresh or App recreation. Documentation now states this precisely and does not claim transparent refresh.

**Implementation:**

- Changed only `DEFAULT_GUIDANCE_MODE` from `legacy` to `standard` and `STANDARD_GUIDANCE_READINESS` from `preview` to `ready`.
- Kept explicit `CODEXGPT_GUIDANCE_MODE=legacy` unchanged as the exact rollback path.
- Updated current user/project documentation to describe the standard default, transport-scoped handle rule, old-App refresh action, and remaining publication boundary.
- The protected legacy Smoke programs intentionally validate frozen prior projections. After the default flip exposed omitted-mode assumptions, each compatibility wrapper was changed to set explicit `legacy`; protected source assertions and snapshots were not weakened or regenerated. A permanent focused test requires all four wrappers to pin rollback mode.

**TDD, failures, and verification:**

- RED: `npm run test:focused -- test/phase-6-default-ux.test.mjs` passed 1/2 and failed only because the omitted default was still `legacy`.
- GREEN: after the two-constant flip, the prescribed related contract suite passed; the final expanded local suite passed 99/99.
- Managed Node 20.20.2 and Node 24.15.0 each passed 24/24 focused default/compatibility/root/diagnostic/model/config tests.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Initial Smoke attempts correctly exposed three legacy-wrapper assumptions in main, HTTP, and settings paths. They were repaired by explicit rollback-mode selection rather than snapshot changes. One long connector request returned HTTP 502 while its child process continued; it was not treated as a test result.
- Authoritative detached Smoke run `2026-07-22T20-22-52-703Z-phase6-default-flip-smoke-c3c1f405` completed with exit code 0, empty stderr, cleaned temporary state, and all eight Smoke sections passing under both Node 20.20.2 and Node 24.15.0.
- `npm run policy:check` reported `Repository operational policy: PASS`.
- `git diff --check` passed; output contained only existing LF-to-CRLF working-copy warnings.

**Adversarial review:**

- No external agent provider was available. Manual execution review confirmed the production change is limited to two constants; compatibility wrappers affect only Smoke processes and do not alter production tool registration, authority, or transport behavior.
- Manual security review confirmed no shared workspace manager, cross-session handle acceptance, hidden fallback, global Skill auto-discovery, script execution, permission expansion, token value, or credential-bearing URL was introduced.
- Manual compatibility review confirmed explicit legacy remains available and the frozen old projections are tested under explicit rollback mode. The default flip does not change V1/V2/V3/V4 tool counts.
- Manual UX review rejected a fabricated cached-App pass and chose one precise user action: **Scan Tools** once or recreate the App.

**Risks and limitations:**

- A deleted App cannot provide empirical cached-snapshot evidence. The product therefore documents a one-time refresh/recreation requirement rather than promising transparent migration.
- Phase 6 is locally accepted but not published or formally closed. The eventual publication SHA still requires the complete exact-head Ubuntu/Windows Node 20/24 matrix.
- Existing ambient-authority and deferred-sandbox limitations remain unchanged.

**Rollback:** Restart the same binary with `CODEXGPT_GUIDANCE_MODE=legacy`. Before publication, the two default/readiness constants and current-state documentation can be reverted as one narrow slice; do not delete user AGENTS/Skills, change workspace lifecycle isolation, or weaken the explicit legacy compatibility tests.

**Next step:** Review the unpublished Phase 6 working tree. Stage, commit, push, and request exact-head publication CI only after explicit user authorization. Keep Phase 7 and deferred sandbox work closed.

## 2026-07-22 — STEP-393: Align doctor with the activated guidance default

**Status:** Completed locally. The supported `doctor` command now reports omitted guidance as ready `standard` and identifies explicit `legacy` as rollback. Dual-major focused, build, and full Smoke verification passed. No staging, commit, push, publication, deployment, or Phase 7 work was performed.

**Goal:** Remove the last user-visible pre-activation statement after the Phase 6 default flip and prove the supported launcher, not only runtime unit tests, resolves the same activated default.

**Files changed:**

- `scripts/codexgpt.mjs`
- `test/phase-6-default-ux.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-6.md`

**Implementation:**

- Changed the doctor-only environment fallback from `legacy` to `standard`.
- Replaced the obsolete preview/gate-blocked messages with `standard is ready and enabled by default` and `explicit legacy rollback mode`.
- Kept invalid-value failure text and every authorization, workspace, Skill, process, tunnel, and sandbox diagnostic unchanged.
- Added a source-level regression that binds the launcher fallback and both truthful messages and rejects the obsolete blocked-gate text.

**TDD and verification:**

- RED: `test/phase-6-default-ux.test.mjs` passed 2/3 and failed because the launcher still contained the legacy fallback and blocked-gate message.
- GREEN: the focused test passed 3/3.
- Managed Node 20.20.2 and Node 24.15.0 each passed 25/25 Phase 6 default/compatibility/root/diagnostic/model/config tests.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- With `CODEXGPT_GUIDANCE_MODE` removed, the supported entry command `node scripts/codexgpt-entry.mjs doctor --root D:/Dev/codexpro/.ai-bridge/phase6-live-test --no-bash --write off --no-profile` reported `OK Guidance mode standard is ready and enabled by default`, one project instruction file, the explicit-only root Skill, and no guidance diagnostic.
- Authoritative detached Smoke run `2026-07-22T20-40-39-820Z-phase6-doctor-default-smoke-1d042126` completed with exit code 0, empty stderr, cleaned temporary state, and all eight Smoke sections passing under Node 20.20.2 and Node 24.15.0.
- Final repository policy and diff-integrity gates are rerun after this record update.

**Adversarial review:**

- No external agent provider was available. Manual consistency review compared the runtime constant, config loader, doctor launcher, README guidance, and explicit rollback path.
- The repair changes presentation and omitted-value selection only inside doctor; it does not widen authority or alter server tool behavior.
- The old blocked-gate phrase is permanently rejected by the focused regression.

**Risks and limitations:**

- The launcher and runtime each encode the same two-value default. The regression detects future drift, but this is still duplicated presentation logic rather than a shared import because the public launcher must remain operable before compiled runtime imports succeed.
- Publication and exact-head CI remain separate gates.

**Rollback:** Revert the doctor fallback/messages and their focused assertions only together with a rollback of the Phase 6 default activation. Explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the supported operational rollback without code changes.

**Next step:** Review the unpublished working tree. Do not stage, commit, push, publish, deploy, or begin Phase 7 without explicit authorization.

**Final verification addendum:** After the memory update, the complete related local contract suite passed 100/100. A repository-wide search found the obsolete blocked-gate phrase only in the regression that rejects it.

## 2026-07-23 — STEP-394: Complete local closure and authorize one publication attempt

**Status:** Complete locally. Final managed Node 20/24 ordinary, build, protected Smoke, package, policy, documentation, dependency, whitespace, secret, and consistency gates passed. The user explicitly authorized one Phase 6 staging, concise English commit, push, and exact-head closure attempt. No deployment, release publication, destructive history operation, credential migration, or Phase 7 work was authorized.

**Goal:** Close every local Phase 6 gate against the final activated runtime, repair compatibility failures exposed only by the complete ordinary matrix, reconcile all active user/project documentation, and leave one exact reviewed staging boundary for publication.

**Files changed:**

- Phase 6 runtime and schemas under `src/guidance/`, `src/server.ts`, `src/config.ts`, `src/workspaceOps.ts`, and `src/tools/schemas/`.
- Supported launcher and protected-Smoke compatibility wrappers under `scripts/`.
- Phase 6, guidance, Skill, resource, compatibility, and inherited-contract tests under `test/`.
- `package.json` and `package-lock.json` for exact `yaml@2.9.0`.
- Active English/Chinese user, security, design, changelog, example, project-rule, master-plan, roadmap, memory, specification, and implementation-plan documents.

**Implementation and compatibility repair:**

- The first final ordinary run `2026-07-23T04-52-52-331Z-phase6-closure-ordinary-1fd57dc7` exited 1 with 11 failures. The common cause was the new omitted `standard` default entering old `minimal` and frozen-contract fixtures that cannot expose `codex_context`.
- Added a RED compatibility assertion that omitted guidance with `tool-mode=minimal` resolves to exact `legacy`, while explicit `CODEXGPT_GUIDANCE_MODE=standard` with minimal continues to fail closed.
- Updated `loadConfig` to compute tool mode first and select legacy only for the omitted-minimal compatibility case. Standard and full omitted modes remain ready `standard`; no minimal tool or authority was added.
- Bound inherited V1/V3/V4 wire and Git-read fixtures to explicit legacy because those tests intentionally freeze pre-Phase-6 projections. The affected focused sets then passed 4/4, 28/28, and 43/45 followed by the repaired 28/28 rerun.
- Manual UX review found that `doctor` still reported standard for omitted minimal. Added a failing regression, aligned doctor with the config rule, and proved the supported command reports `minimal mode uses legacy compatibility because codex_context is unavailable`. Explicit legacy still reports the rollback mode.
- Reconciled README, FAQ, design, changelog, example AGENTS, active rules, paired design/plan, master plan, historical roadmap, and memory. They now describe root-to-target context, lazy target Skills, no guidance-derived authority, one Scan Tools/App recreation upgrade action, omitted minimal compatibility, and the exact remaining CI gate.

**Verification:**

- Final detached ordinary run `2026-07-23T07-09-16-184Z-phase6-closure-ordinary-r2-b6e4a32b` completed with exit code 0, empty stderr, cleaned temporary state, and complete retained output:
  - Node 20.20.2: 1,174 tests, 1,172 passed, zero failed, two established skips.
  - Node 24.15.0: 1,174 tests, 1,172 passed, zero failed, two established skips.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Final detached protected Smoke run `2026-07-23T07-47-04-068Z-phase6-closure-smoke-final-9653d6a4` completed with exit code 0, empty stderr, cleaned temporary state, and all eight analysis, CLI, MCP, HTTP, Pro, doctor, settings, and handoff sections passing on both majors.
- Focused documentation/package tests passed 8/8; final documentation/mutation/compatibility set passed 17/17; doctor/default/minimal compatibility passed 8/8; all affected inherited contract tests passed.
- Package dry-run produced 549 files, 1,202,951 bytes packed and 6,688,748 bytes unpacked, with 18 compiled guidance files and no test, `.ai-bridge`, or memory-archive payload.
- `yaml@2.9.0` is exact ISC-licensed, has no dependencies or lifecycle scripts, and is not affected by the existing production audit advisories. `npm audit --omit=dev` still reports the unrelated existing three moderate and two high advisories in MCP/Hono/brace/fast-uri chains.
- `npm run policy:check` passed. `git diff --check` passed with only established LF-to-CRLF notices. All 34 untracked text files passed explicit trailing-whitespace/final-newline checks.
- Added-line and untracked high-confidence credential scan returned zero locations. Relative-time scan returned zero locations.
- Repository-wide relative Markdown audit covered 123 files with `BROKEN_COUNT|0`.
- Mutation inventory passed and protected `scripts/smoke.mjs` plus `scripts/http-smoke.mjs` remained byte-for-byte unmodified.

**Adversarial review:**

- No external agent provider was available. Manual execution review confirmed the omitted-minimal branch removes guidance rather than adding a tool or fallback authority.
- Manual security review confirmed explicit standard+minimal still fails, foreign workspace handles still fail closed, global Skills/scripts/dependencies remain inactive, and no Policy/Approval/Audit/path/transport boundary changed.
- Manual compatibility review required old frozen fixtures and Smoke wrappers to opt into explicit legacy instead of accepting new snapshots. V1/V2/V3/V4 counts remain exact.
- Manual UX review repaired doctor/minimal drift and synchronized English/Chinese docs. The upgrade path remains one precise Scan Tools refresh or App recreation; transparent refresh is not claimed.

**Risks and limitations:**

- The deleted old App prevents empirical frozen-snapshot reuse evidence; the documented one-time refresh/recreation contract remains the approved substitute.
- Existing five unrelated production dependency advisories remain open and are not introduced by YAML.
- Local closure is not formal phase closure. The published SHA must pass terminal exact-head Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, and Package jobs.
- Existing ambient-authority, safe-Bash, and deferred-sandbox limitations remain unchanged.

**Rollback:** Before publication, revert the Phase 6 slice as one unpublished change set. After publication, restart the same binary with explicit `CODEXGPT_GUIDANCE_MODE=legacy` for operational rollback. Never weaken workspace lifecycle isolation, add minimal context tools, delete user AGENTS/Skills, or rewrite history.

**Next step:** Stage only the reviewed Phase 6 scope, create one concise English commit, push once to `main`, and verify the exact 40-character HEAD through the complete CI matrix. Do not create an evidence-only follow-up commit and do not start Phase 7.

## 2026-07-23 — STEP-395: Repair Phase 6 exact-head CI gaps

**Status:** Complete locally. The first Phase 6 publication head `efb53118331868686703d28b5ddea55611836b54` matched exact-head run `29990618309`, but Ubuntu Node 20/24 and Windows Node 24 exposed three bounded defects. The user authorized one concise CI-repair commit and a second ordinary push. Force push, deployment, release publication, and Phase 7 remain excluded.

**Observed failures:**

- Ubuntu treated `nested\\AGENTS.md` and `pkg\\src\\file.ts` as literal POSIX names, so safe reads failed and instruction discovery omitted `pkg/AGENTS.md`.
- Windows Node 24 accepted a same-size in-place guidance edit because NTFS did not provide a distinguishable stat transition in that run.
- Windows Node 24 retention observed an active detached run as `stale` after approximately 68 seconds. The existing periodic lease writer silently waited a full 15-second interval after each transient publication failure, so consecutive failures could consume the fixed 60-second lease.

**Implementation:**

- Added one host-independent guidance path boundary. It validates every target with Windows path rules, rejects drive-relative/absolute, UNC/device, and NTFS ADS forms without echoing the raw target, converts backslashes to `/`, and then delegates to the existing workspace/path guard.
- Applied that boundary consistently to direct guidance reads, root-to-target instruction discovery, and target-scoped Skill discovery.
- After the bounded first read and test hook, reread the exact byte range from the same open file handle and compare bytes before accepting the existing stat/canonical-parent identity proof. A short or different second read fails as `READ_IDENTITY_CHANGED`.
- Replaced the fixed renewal interval with a single scheduled lease renewal. Successful writes retain the 15-second cadence; a failed observational write retries after one second. Stop cancels the next timer, authority and the 60-second lease duration are unchanged, and terminal result publication remains authoritative.

**TDD and adversarial review:**

- The new host-independent path test first failed because no normalizer existed. The existing same-size mutation test reproduced the Windows failure before byte verification. The injected scheduler test first failed because no retry-aware renewal helper existed.
- No external agent provider was available. Manual adversarial review found and removed raw target-path disclosure from validation errors and increased the transient retry from 250 ms to one second to avoid unnecessary event-loop pressure during a persistent observational-write fault.
- Review confirmed no new path authority, no lease authorization, no lease-duration extension, no Policy/Approval/Audit change, and no widening of global Skill or script execution.

**Verification:**

- The final affected suite passed 35/35 on managed Node 20.20.2 and 35/35 on managed Node 24.15.0. Both managed builds passed.
- Mutation/operational verification passed 13/13; repository policy and `git diff --check` passed.
- Detached ordinary run `2026-07-23T09-14-03-949Z-phase6-ci-fix-ordinary-8d8b57a4` completed with exit code 0, empty stderr, cleaned temporary state, and retention with zero failures:
  - Node 20.20.2: 1,177 tests, 1,175 passed, zero failed, two established skips.
  - Node 24.15.0: 1,177 tests, 1,175 passed, zero failed, two established skips.
- Detached protected Smoke run `2026-07-23T09-39-22-115Z-phase6-ci-fix-smoke-ca19c622` completed with exit code 0, empty stderr, cleaned temporary state, zero retention failures, and all eight analysis, CLI, MCP, HTTP, Pro, doctor, settings, and handoff sections passing on both majors.
- Focused package/authentication/mutation checks passed. Package dry-run contains 549 files, 1,205,315 packed bytes and 6,696,420 unpacked bytes, with 18 compiled guidance files and no tests, `.ai-bridge`, or memory archive.

**Risks and limitations:**

- Same-handle byte verification doubles bounded guidance-file read I/O. The per-file limits remain unchanged, so the cost is fixed and small relative to stronger mutation detection.
- A permanently failing observational lease write still cannot block task execution or authoritative terminal publication. The worker may become stale after the unchanged lease expires, which is the intended fail-closed behavior.
- Local closure is not formal Phase 6 closure. The replacement published SHA must pass the complete exact-head Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, and Package matrix.

**Rollback:** Revert the STEP-395 runtime and tests together. Operational guidance rollback remains explicit `CODEXGPT_GUIDANCE_MODE=legacy`; do not weaken path checks, extend lease authority, force push, or rewrite history.

**Next step:** Review and stage only the STEP-395 repair, create one concise English commit, perform the authorized second ordinary push, and verify the replacement exact head through terminal CI. Do not create an evidence-only follow-up commit and do not start Phase 7.

## 2026-07-23 — STEP-396: Align the final runner oracle and publish the closure candidate

**Status:** Complete locally. Exact-head run `29997207747` proved the three STEP-395 repairs on Ubuntu Node 20/24 and Windows Node 20, but Windows Node 24 exposed one independent test-oracle defect. The user authorized the bounded additional fixes, commits, ordinary pushes, and exact-head attempts required to reach formal Phase 6 closure. Deployment, release publication, Phase 7, force push, destructive history changes, credential operations, and unrelated scope remain excluded.

**Observed failure and root cause:**

- Repository policy, Ubuntu Node 20/24, and Windows Node 20 all completed successfully for `22f0f4152fb33c6a8bfa26a472f7c57332f183c0`.
- Windows Node 24 failed only `detached runner retains a bounded tail and records dropped stdout/stderr bytes` after approximately 16.6 seconds.
- The test polled a runner with an exact active lease and never observed `stale`; it nevertheless declared failure at a fixed 15-second deadline. Production liveness uses a renewable 60-second lease and a bounded terminal-publication grace, so the test could fail a still-observable worker before the production stale boundary was reachable.
- The Ubuntu path failures, same-size guidance mutation, and retention stale race from run `29990618309` did not recur.

**Implementation:**

- `runner-log-bounds.test.mjs` now imports the production `WORKER_LEASE_MS` constant and defaults its terminal deadline to `WORKER_LEASE_MS + 30_000`.
- The poll still fails immediately on `stale`, still requires authoritative `completed` state, and remains bounded. No production runner, lease, retention, process identity, stop, or result-publication code changed.
- Updated the project execution boundary to reflect the user's closure authorization without widening deployment, release, credential, history, or Phase 7 authority.
- Performed neat-freak reconciliation: compacted `Memory.md` from 139 lines / 22,697 bytes to 119 lines / 16,162 bytes, removed duplicated historical verification detail already preserved in archives, and retained current decisions, active constraints, evidence, and pointers.

**TDD and verification:**

- The CI failure supplied the RED state: a valid running lease was rejected by the unrelated 15-second fixture deadline.
- Managed Node 20.20.2 and Node 24.15.0 each passed the runner/log lifecycle set at 19/19.
- Managed Node 24.15.0 passed `runner-log-bounds.test.mjs` in ten consecutive rounds.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Authoritative detached ordinary run `2026-07-23T12-46-34-421Z-phase6-final-ordinary-03b98fb5` completed with exit code 0, empty stderr, cleaned temporary state, and zero retention failures:
  - Node 20.20.2: 1,177 tests, 1,175 passed, zero failed, two established skips.
  - Node 24.15.0: 1,177 tests, 1,175 passed, zero failed, two established skips.
- Authoritative detached Smoke run `2026-07-23T13-10-44-132Z-phase6-final-smoke-c2b26ef0` completed with exit code 0, empty stderr, cleaned temporary state, zero retention failures, and all eight analysis, CLI, MCP, HTTP, Pro, doctor, settings, and handoff sections passing on both majors.
- Final documentation/package/mutation/operational tests passed 21/21. Repository policy and `git diff --check` passed.
- Package dry-run contains 549 files, 1,205,521 packed bytes and 6,696,921 unpacked bytes, with 18 compiled guidance files and no tests, `.ai-bridge`, or memory archive.
- Repository-wide Markdown audit covered 123 tracked Markdown files with `BROKEN_COUNT=0`; added-line secret and relative-time scans passed; protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged.

**Adversarial review:**

- No external agent provider was available. Manual failure-mode review confirmed the change references the exported production lease constant instead of duplicating 60 seconds, preserves fail-fast stale detection, adds only finite publication grace, and cannot convert an invalid run into success.
- Manual authority review confirmed no production code, permission, Policy, Approval, Audit, path, transport, process-stop, cleanup, retention, or credential boundary changed.
- Manual compatibility review confirmed the test remains ordinary-domain, both managed majors execute it, and Linux behavior is unchanged.
- Knowledge-base review confirmed `AGENTS.md`, `Memory.md`, the Phase 6 archive, and `CHANGELOG.md` agree on the remaining exact-head closure condition and excluded work.

**Risks and limitations:**

- A genuinely non-terminal worker that keeps renewing an exact lease can now consume up to 90 seconds in this fixture before timeout. The wait is bounded and correctly reflects the production liveness contract; `stale` still fails immediately.
- Formal closure still depends on one exact published head passing Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package gates.
- Existing ambient-authority, safe-Bash, deleted-old-App, dependency-advisory, and deferred-sandbox limitations remain unchanged.

**Rollback:** Revert the STEP-396 test deadline and documentation changes together. Do not restore a deadline shorter than the production stale boundary, weaken stale detection, extend production lease authority, force push, or rewrite history.

**Next step:** Stage the reviewed STEP-396 scope, create one concise English commit, push normally to `main`, and require terminal exact-head success across the complete matrix. On success this published head is the Phase 6 closure head; do not create an evidence-only follow-up commit or begin Phase 7.

## 2026-07-23 — STEP-397: Align finalization observation with the production lease boundary

**Status:** Complete locally. Exact-head run `30011123344` for `a55e279ea63794c0d5ddb649e5689cdbeb58c0a4` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24. Windows Node 20 exposed one remaining test-only deadline mismatch. The user authorization continues through formal Phase 6 closure under the existing exclusions.

**Observed failure and root cause:**

- Windows Node 20 failed only `worker finalization remains observable through an exact lease or authoritative result` after approximately 65.7 seconds.
- The helper began a fixed 60-second wait after startup and required either an exact active `finalizing` lease or an authoritative successful result. A lease published after the helper began could remain valid beyond that fixed deadline, so the helper could time out before the exact lease was eligible to expire.
- The run did not show a production stale transition, nonzero result, stop record, identity mismatch, or authority failure. Windows Node 24 and every Ubuntu job completed successfully.

**Implementation:**

- Changed only `waitForFinalizationObservation` in `task-cleanup-lifecycle.test.mjs`.
- Its default deadline now uses `WORKER_LEASE_MS + 30_000`, matching the bounded lease-plus-publication-grace rule already used by the flood fixture and terminal helpers.
- The helper still requires an exact matching active `finalizing` lease or authoritative zero-exit result, still fails immediately on a stop record or mismatched/nonzero result, and remains bounded.
- No production source, runner implementation, lease duration, renewal cadence, process identity, cleanup, retention, stop, Policy, Approval, Audit, path, transport, or credential behavior changed.

**TDD and verification:**

- Exact-head run `30011123344` supplied the RED state: the helper rejected a still-observable lifecycle before the post-call lease could expire.
- Managed Node 20.20.2 and Node 24.15.0 each passed the combined runner/log lifecycle suite at 19/19.
- Managed Node 20.20.2 passed the affected finalization test in five consecutive isolated rounds; each round retained the exact lease/result assertions and skipped only unrelated tests through `--test-name-pattern`.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Authoritative detached ordinary run `2026-07-23T13-48-27-430Z-phase6-final-ordinary-r2-21db5147` completed with exit code 0, empty stderr, cleaned temporary state, and zero retention failures:
  - Node 20.20.2: 1,177 tests, 1,175 passed, zero failed, two established skips.
  - Node 24.15.0: 1,177 tests, 1,175 passed, zero failed, two established skips.
- The packaged production tree is unchanged from STEP-396, whose dual-major Smoke run `2026-07-23T13-10-44-132Z-phase6-final-smoke-c2b26ef0` passed all eight sections per major with empty stderr and zero retention failures. Exact-head CI will rerun Smoke and Package for the new candidate.

**Adversarial review:**

- No external agent provider was available. Manual timing review confirmed the new deadline is derived from the exported production lease constant, adds finite grace only, and does not allow a stale, stopped, mismatched, or nonzero run to pass.
- Manual scope review confirmed the change is test-only and cannot alter runtime authority or user behavior.
- Manual compatibility review confirmed both managed majors execute the helper and the ordinary-domain classification remains unchanged.

**Risks and limitations:**

- Under severe CI pressure, this specific helper may now wait up to 90 seconds. The wait is bounded and correctly starts after the caller begins observation; exact failure conditions remain immediate.
- Formal closure still requires one exact published head to pass Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package gates.
- Existing Phase 6 and platform limitations remain unchanged.

**Rollback:** Revert the STEP-397 helper deadline and its documentation together. Do not restore a deadline shorter than the post-call lease-expiry boundary, weaken exact lease/result validation, change production lease authority, force push, or rewrite history.

**Next step:** Complete final static/package/document gates, stage the reviewed STEP-397 scope, create one concise English commit, push normally, and require terminal exact-head success across the complete matrix. On success that exact published head closes Phase 6; do not create an evidence-only follow-up commit or begin Phase 7.

## 2026-07-23 — STEP-398: Keep detached workers alive through authoritative publication

**Status:** Complete locally. Exact-head run `30015004010` for `63732355657e0e426d7c29dd21e52ac216be28f0` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24. Windows Node 20 exposed one production detached-worker lifecycle defect. The user's Phase 6 closure authorization remains active under the existing exclusions.

**Goal:** Prevent a detached runner from exiting after its child task completes but before `result.json` and retention evidence are authoritatively published, without widening lease authority, stop authority, or timeout bounds.

**Files changed:**

- `scripts/long-task-runner.mjs`
- `test/task-cleanup-lifecycle.test.mjs`
- `CHANGELOG.md`
- `Memory.md`
- `docs/memory/archive/phase-6.md`

**Observed failure and root cause:**

- Windows Node 20 failed only `terminal detached-run evidence is automatically pruned to the configured retention count` after approximately 66.7 seconds. `waitForTerminal` observed `stale` instead of an authoritative completed result.
- The test command itself was a short successful Node process. The worker had no remaining referenced event-loop handle after the child emitted `close`, because `startWorkerLeaseRenewal` called `unref()` on its renewal timer.
- An unreferenced timer can run while another handle keeps the process alive, but cannot keep the detached worker alive by itself. Under Windows Node 20 CI pressure the worker could therefore terminate between child completion and asynchronous TEMP cleanup, log writes, retention, and `result.json` publication.
- The last valid lease then expired after 60 seconds, producing a genuine stale state. This was not another test-oracle deadline mismatch.

**Implementation:**

- Removed `timer?.unref?.()` from `startWorkerLeaseRenewal`.
- The renewal timer is now the worker's explicit lifecycle handle from startup through authoritative terminal publication.
- Existing `stopLeaseRenewal()` remains unchanged and is called in the `result.json` publication `finally` block, so successful or failed result publication still clears the timer deterministically.
- Added a deterministic regression assertion proving the renewal scheduler never calls a supplied timer's `unref()` method while preserving the existing 15-second success cadence, one-second retry cadence, and exact stop behavior.
- No lease duration, renewal interval, retry interval, lease schema, process identity, stop authorization, retention selection, path policy, credential handling, Policy, Approval, Audit, or external interface changed.

**TDD and verification:**

- Exact-head run `30015004010` supplied the integration RED state: Windows Node 20 produced a genuine stale run before terminal evidence publication.
- The deterministic timer test also reproduced the direct cause before the production edit: the injected timer's `unref()` counter was one instead of zero.
- Managed Node 20.20.2 and Node 24.15.0 each passed the affected lifecycle, runner-log, mutation, and operational set at 32/32.
- Managed Node 20.20.2 passed the exact failed retention test in ten consecutive isolated rounds.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Authoritative detached ordinary run `2026-07-23T14-41-41-946Z-phase6-final-ordinary-r3-bcb87de9` completed with exit code 0, empty stderr, cleaned temporary state, and zero retention failures:
  - Node 20.20.2: 1,177 tests, 1,175 passed, zero failed, two established skips.
  - Node 24.15.0: 1,177 tests, 1,175 passed, zero failed, two established skips.
- During that run, the exact lease continued renewing after the child command transitioned between managed majors, directly confirming the referenced timer kept the detached worker observable.
- Authoritative detached Smoke run `2026-07-23T15-55-33-034Z-phase6-final-smoke-r3-c52297e7` completed with exit code 0, empty stderr, cleaned temporary state, zero retention failures, and all eight analysis, CLI, MCP, HTTP, Pro, doctor, settings, and handoff sections passing on both majors.
- Final authentication/package/mutation/operational tests passed 21/21. Repository policy and `git diff --check` passed.
- Package dry-run contains 549 files, 1,205,505 packed bytes and 6,696,902 unpacked bytes, with 18 compiled guidance files and no tests, `.ai-bridge`, or memory archive.

**Adversarial review:**

- No external agent provider was available. Manual lifecycle review confirmed the timer now holds only process liveness, not execution or stop authority; the exact lease remains observational and expires normally after a crash.
- Manual terminal-path review confirmed `stopLeaseRenewal()` still runs only after the result write attempt completes, including publication failure through the existing `finally` block.
- Manual failure-mode review confirmed a permanently failing lease write still retries on the bounded one-second cadence and cannot suppress child execution, cleanup, retention, or result publication.
- Manual compatibility review confirmed the fix uses standard Node timer reference semantics and applies identically to Windows, Linux, Node 20, and Node 24.

**Risks and limitations:**

- A worker blocked forever before result publication now remains alive rather than exiting when only the renewal timer remains. This is intentional: it preserves observable liveness and exact stop eligibility instead of manufacturing stale evidence. Existing external stop and process-identity rules remain the recovery path.
- A process crash or forced termination still stops renewal; the unchanged 60-second lease expiry then transitions the run to stale.
- Formal Phase 6 closure still requires one exact published head to pass Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package gates.
- Existing Phase 6 and platform limitations remain unchanged.

**Rollback:** Revert the referenced-timer change, deterministic regression, and STEP-398 documentation together. Rollback reintroduces the proven terminal-publication race and must not be used as a reliability fix. Do not widen lease authority, weaken stale detection, force push, or rewrite history.

**Next step:** Complete final Markdown, secret, relative-time, protected-Smoke, and staged-boundary checks; create one concise English commit; push normally to `main`; and require terminal exact-head success across the complete matrix. On success that exact published head closes Phase 6; do not create an evidence-only follow-up commit or begin Phase 7.

## 2026-07-23 — STEP-400: Stabilize Windows runner completion observation

**Status:** Complete locally. Exact-head run `30023834082` for `0cb612f8c05353fb421aff37792967b5a4298e9b` passed Repository policy and Ubuntu Node 20/24 but failed Windows Node 20/24 Regression in two test observation helpers. The bounded repair and final local Node 20/24 gates pass; formal Phase 6 closure still requires a replacement published exact head to pass the complete matrix.

**Goal:** Remove test-observer deadlines and process-spawn overhead that can reject a valid detached worker before the production lease boundary, without weakening stale, stopped, failed-result, process-identity, cleanup, or lease-authority checks.

**Files changed:**

- `test/runner-process-identity.test.mjs`
- `test/task-cleanup-lifecycle.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-6.md`

**Observed failures and implementation:**

- Windows Node 24 failed `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry` after its helper repeatedly spawned the public `status` CLI while waiting for terminal state. The helper now calls the same production `runState(directory)` state machine directly, requires a state on every poll, and fails immediately if it observes `stale`; the final assertion still requires an authoritative zero-exit result.
- Windows Node 20 failed `terminal result publication survives a failed observational lease refresh` because that test overrode the shared wait helper with a fixed ten-second deadline. The override was removed, restoring the shared `WORKER_LEASE_MS` bound. The test still accepts only a matching authoritative result and requires exit code zero.
- The first complete rerun, ordinary r4, reached an unrelated Gate X `GIT_RECOVERY_REQUIRED` after approximately 30 minutes. No Gate X code or assertion was changed. The identical complete ordinary r5 rerun passed that test and the entire matrix, so r4 is retained as a materially relevant failed attempt rather than treated as evidence for these two fixes.

**Verification:**

- Exact-head run `30023834082`: Repository policy and Ubuntu Node 20/24 passed; Windows Node 20/24 failed only the two observation helpers described above.
- Managed Node 20.20.2 and Node 24.15.0 focused lifecycle tests passed 23/23 on each major.
- Authoritative detached ordinary run `2026-07-23T17-19-46-820Z-phase6-final-ordinary-r5-ecacf4e4` completed with exit code zero, empty stderr, cleaned temporary state, and zero retention failures:
  - Node 20.20.2: 1,177 tests, 1,175 passed, zero failed, two established skips.
  - Node 24.15.0: 1,177 tests, 1,175 passed, zero failed, two established skips.
- Managed Node 20.20.2 and Node 24.15.0 builds passed.
- Detached Smoke run `2026-07-23T18-08-44-935Z-phase6-final-smoke-r4-13954d38` completed with exit code zero, empty stderr, cleaned temporary state, zero retention failures, and all eight Smoke sections passing on both managed majors.
- Mutation, package-content, and operational-policy focused checks passed 7/7. `npm run policy:check`, `git diff --check`, the added-line high-confidence secret scan, and production-file scope check passed.

**Adversarial review:**

- Three independent reviews found no production authority, lease, stop, cleanup, path, credential, Policy, Approval, or Audit expansion; the production and package trees are unchanged.
- Review confirmed the Node 20 change matches the production lease boundary and cannot accept stale, stopped, mismatched, or nonzero results.
- Review classified the Node 24 change as reducing observer-created Windows process pressure rather than a deterministic production lifecycle change. Managed Node 24 focused and complete ordinary runs pass, but replacement exact-head CI remains the required proof and no closure claim is allowed before it succeeds.
- Review required Phase 7 documents and mixed project-record edits to remain outside the Phase 6 staging boundary.

**Decisions, risks, and limitations:**

- The public `status` CLI remains covered by dedicated status and replacement-boundary tests; this lifecycle helper tests the underlying production state machine without creating a new process for every poll.
- A valid run may now consume the existing bounded lease-aware wait instead of an unrelated ten-second fixture SLA. Neither production timeouts nor external interfaces changed.
- The worktree contains separately owned Phase 7 design and record edits. They must remain unstaged and uncommitted in the Phase 6 repair.

**Rollback:** Revert the two test-helper changes and this STEP together. Rollback restores the exact Windows CI false-failure conditions and must not be used to weaken production lease or stale-state behavior.

**Next step:** Stage only the two repaired tests and this Phase 6 archive entry, create the authorized concise English commit, push normally to `main`, and require the replacement exact head to pass Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package. Do not stage Phase 7 records or create a later evidence-only commit.

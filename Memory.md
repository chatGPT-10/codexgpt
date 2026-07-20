# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-20.
- Workspace checkout path is operator-managed; publication target: `main`; package: `codexgpt@0.28.6`.
- GitHub repository and `origin`: `chatGPT-10/codexgpt` over HTTPS.
- Canonical project identity is CodexGPT: package, CLI, environment variables, state directories, MCP tools, source paths, tests, and active documentation use the CodexGPT name.
- Primary platform: native Windows; WSL remains optional.
- Phase 0 through complete Phase 3 are closed; exact historical commits, runs, and rollback evidence remain in the linked archives.
- Reduced Phase 4 is closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf`; exact-head run `29603060944` passed policy and Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, and Package. `full_access` remains trusted-code authority; 4B0 is blocked and `workspace`/Tasks 4B1–4B6 remain deferred.
- Phase 5 is closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e`; exact-head run `29698209894` passed the complete policy and Ubuntu/Windows Node 20/24 matrix. STEP-367 closes the remaining Gate X post-review `write-tree` escape. STEP-368 through STEP-372 repair detached-run terminal observation: bounded publication tolerance, no retention self-observation, live-unavailable identity separation, an exact bounded finalization lease, and observation of a lease published during the bounded terminal wait. The combined repairs are locally verified and pending a new exact-head matrix plus post-merge `main` CI.

## Approved execution boundary

Implementation through Phase 8 remains authorized with recommended defaults. Keep the current interphase work unstaged and unpushed until the user explicitly requests publication; do not start Phase 6. Tasks 4B1–4B6 and `workspace` remain deferred. Destructive data/history changes, production deployment, credential handling, and silent scope expansion remain excluded.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary. Git Bash is the temporary execution backend; native PowerShell remains required future work.
- Preserve the verified managed Node `v20.20.2` and `v24.15.0` runtimes under `%LOCALAPPDATA%\CodexGPT\toolchains\`; cleanup requires explicit user approval.
- Node test-loader rules: use one test-only integration barrel, load leaf implementations before shared servers, and keep executable TypeScript import barrels under package-excluded `fixtures/ts-imports/`; these avoid Node 20 loader deadlocks and Node 24 recursive test discovery.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry; direct `scripts/codexgpt.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXGPT_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 remains reserved for Phase 8 and requires its dedicated identity, migration, rollback, and security gates.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate; grants cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXGPT_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. V1/V2 never create approvals; V3 composite scopes keep `process:manage` from starting code.
- Public `workspace_id` values are random session-scoped handles. Core lookup requires an explicit ID; omitted-ID compatibility exists only at the named session-local resolver.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders use exact fail-closed in-memory substitutions.
- `CODEXGPT_FILE_TRANSACTIONS=legacy` remains the compatibility default. Selecting `atomic` routes supported workspace writers through the transaction runtime with no direct-write fallback; writable atomic V1 requires terminal persistent audit.
- Phase 3 state stays outside workspaces and Git; its participant recovery, V1/V2 readers, stable file identity, move undo, hard-link fail-closed behavior, and recovery freeze remain Phase 4 compatibility gates.
- Phase 4 V3 is exact 39: V2 minus `bash`, plus eight typed execution/process tools and `open_full_access_workspace`; V1/V2 wire and pending-approval behavior remain frozen.
- Phase 4 separates brokered `confirmed_roots`, ambient **Full access (ask first)**, and unavailable `workspace`. Full access is trusted-code authority, not filesystem, credential, registry, network, or broker isolation.
- V3 confirmed-root files require hard-link count 1 and never mutate `allowedRoots`. Generic V3 mutation records remain schema 1/contract 3; move records remain schema 2/contract 3; same-binary V2 rollback retains both readers.
- V3 lifecycle uses strict `AuditEventV3` inside the existing MAC-chained envelope. V2 audit wire stays exact and filters V3 before V2 paging; V3 has a separate V2/V3 projection and cursor, while V2-compatible authorization/execution evidence remains queryable after rollback.
- Phase 5 V4 is opt-in exact 51 and preserves V1=28/V2=31/V3=39. Gate R binds expected-old mutations and durable approval; Gate X exposes only four typed local Git operations, with bounded verified object promotion before private-index installation. It accepts no caller-selected command or remote/credential/force/config mutation and remains ambient current-user `full_access`, not isolation.
- Phase 4 authority defaults to configured roots with execution/dependencies off; nondefault values are V3-only and capability changes revoke dependent state. Gate S remains blocked diagnostic evidence, and `workspace` stays unavailable with no `full_access` fallback.
- With `inheritEnv=false`, Windows Bash preserves or derives only bounded user/configuration paths required for normal CLI and keyring discovery. Do not copy `GH_TOKEN` or arbitrary API variables into the child; `CODEXGPT_INHERIT_ENV=1` is explicit full-environment opt-in for trusted repositories only.
- Mutation inventory binds each direct primitive to path, syscall, semantic digest, and reviewed purpose; atomic production paths cannot fall back to legacy writers.
- CI evidence is exact-HEAD-bound, compact, and stored only below ignored `.ai-bridge/`. Manifest assets stay LF-pinned; Windows paths use `path.win32`; POSIX lookup passes candidates only as quoted positional data and never uses `shell: true` with argv.
- `scripts/test-domains.mjs` is authoritative: isolated complete regression uses `all`, connector-backed local work uses `ordinary`, and Windows control runs serialize. Long runs use the identity-bound detached runner; destructive stop oracles remain control-domain only.
- Verification is impact-scoped, not ritualized: during repair loops run the failing reproducer, new regression, and directly affected gates; rerun complete local ordinary/control/Smoke only when the change invalidates that evidence or touches shared runtime/security boundaries. Documentation or evidence-only edits do not invalidate unrelated runtime results. Every final runtime-relevant pushed SHA still requires terminal exact-head CI.
- Focused tests and local tasks use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>`. Supported launchers create sibling marked roots under one canonical TEMP base and clean them after completion. Detached evidence defaults to 20 terminal runs/14 days; `npm run task:cleanup` deletes only verified dead-owner roots and terminal evidence, fails nonzero when incomplete, and never removes unmarked or persistent project state.
- Gate N uses the manifest-bound PowerShell/C# `CXP4` host with creation-time Job/handle-list ownership, clean environment, exact image identity, bounded output and deadlines. Capability remains `job_object_members_only`; broker escape resistance remains `none`; ConPTY success accepts exit 0 or exact `STATUS_CONTROL_C_EXIT` only with all required evidence.
- `SystemDrive`, `SystemRoot`, `WINDIR`, `ProgramData`, `ComSpec`, minimal `PATH=System32;Windows`, and `PATHEXT` are fixed system values in clean native child environments; caller values cannot override them.
- The master implementation plan is the sequencing authority. Complete isolated regression uses `node scripts/test-domains.mjs run --domain all`; connector-backed local regression uses `--domain ordinary`. There is no `npm test` script.

## Verification evidence

- Phase 3 closure heads passed exact-head runs `29441752493` and `29443158835`; reduced Phase 4 closed at `d19e65b` with run `29603060944`. Both covered policy plus Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, and Package.
- Phase 5 design, Gate G0/R/X implementation, portability repairs, failed closure diagnostics, and final local closure are retained in STEP-323 and STEP-344 through STEP-362. Closure head `9aa76b9` passed exact-head run `29698209894` across the complete matrix.
- STEP-363 adversarial focused run `2026-07-19T19-49-04-795Z-interphase-cleanup-adversarial-focused-38f5ac3f` passed 61/61 on each managed Node major. Ordinary run `2026-07-19T19-18-17-116Z-interphase-cleanup-ordinary-final-2-d1a614a7` passed 1,096 tests per major with zero failures and two established skips.
- STEP-363 cleanup removed 157 obsolete terminal runs with zero failures; the final explicit scan retained 20 runs and found zero owned-temp candidates, invalid paths, failed deletions, or interrupted claims. Build, policy, diff, mutation inventory, and the 521-entry package dry-run passed.
- STEP-365 local adversarial verification passed active-name residual scanning, TypeScript build, repository policy, 63/63 focused naming/security/native-host/mutation/package contracts, isolated settings Smoke, diff integrity, and the 521-entry `codexgpt@0.28.6` package dry-run. One combined local Smoke attempt reached six successful components before a settings-status timeout; the isolated settings rerun passed, while the complete Ubuntu/Windows Node 20/24 exact-head matrix remains the publication authority.
- STEP-365 first exact-head regression identified only frozen V1 descriptor/call and protected Smoke source hashes from the previous namespace; reviewed CodexGPT hashes were updated without changing tool sets, envelopes, counts, or runtime behavior.
- Post-merge CI run 113 initially failed only Ubuntu Node 20 because an immutable Gate X integration test observed both reviewed and drifted filter execution. STEP-366 removed the original executable keys from the copied private config, but post-merge CI #115 reproduced the drift. Process ancestry proved the remaining source was an ordinary original-repository `git write-tree` after the review window. STEP-367 moves old-tree calculation, private add, and new-tree calculation into the same private materialized snapshot bundle, returns object-format-validated tree OIDs, and removes ordinary write-tree from the Gate X stage path. Build, policy, diff integrity, the 521-entry package dry-run, 25/25 affected tests, and five consecutive exact regression runs passed.
- PR CI #119, #122, #124, and #125 progressively exposed terminal-publication, retention self-observation, live identity-lookup ambiguity, and post-child finalization visibility. STEP-371 added an exact metadata/evidence-bound 60-second finalization lease. Exact-head run `29758033578` then passed policy and both Ubuntu matrices but Windows Node 24 proved that a status call entering the five-second terminal wait just before `finalizing.json` publication ignored the lease when it appeared during that wait. STEP-372 makes the bounded wait observe only an exact active lease, preserving result/stop precedence and non-authorizing `terminal_publication_in_progress`. Affected cleanup, process-identity, operational, and mutation suites passed 33/33 on native Windows Node 20 and Node 24; cleanup/process-identity passed five consecutive Node 24 runs at 20/20.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A adds a V3-only exact local approval path for eligible ambient-authority execution; it is not OS isolation.
- Workspace lifecycle state is intentionally process-local. OAuth owner identity and lifecycle persistence remain out of scope.
- Operational rollback must retain V2 readers, participant reconciliation, and recovery evidence.
- External processes remain outside CodexGPT's workspace lock. Open-handle identity checks reduce path-replacement TOCTOU but cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary readers, or absolute power-loss durability when directory sync is unsupported.
- Environment narrowing is defense in depth, not credential isolation; same-user child processes may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- Confirmed-root modules retain an injected identity oracle. `full_access` and ConPTY are ambient-authority features; only owned Job members are lifecycle-controlled. Task 4B0 remains blocked evidence and activates no sandbox behavior.
- Protected main/HTTP Smoke compatibility depends on exact source strings; drift fails closed and requires a same-change compatibility update.
- V2 remains explicit rather than default. Rolling configuration back to V1 hides V2 tools but must retain V2 readers and recovery.
- Atomic `apply_patch` is bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish STEP-372 on the existing Gate X repair pull request, require the complete runtime matrix on the exact new head, then verify the resulting `main` push CI.
2. Keep Tasks 4B1–4B6 and `workspace` deferred; do not reinterpret blocked 4B0 evidence or any Git/worktree mechanism as a sandbox.
3. Do not enter Phase 6 as part of this CI repair.

## Recent summaries

- **STEP-372 - Observe finalization during bounded terminal wait:** notice an exact lease that appears after status begins waiting, without extending time or granting ownership.
- **STEP-371 - Exact bounded finalization lease:** publish a metadata/evidence-bound lease after child completion so cleanup and retention cannot be misclassified as stale before `result.json`.
- **STEP-370 - Separate live identity unavailability from stale identity:** keep exact-evidence live workers observable as unowned-running while preserving fail-closed stop authorization.
- **STEP-369 - Exclude preserved run before retention scan:** prevent a detached worker from evaluating its own nonterminal state while preparing its terminal retention report.
- **STEP-368 - Detached-run terminal publication grace:** add bounded tolerance for exact worker evidence awaiting terminal state publication; superseded in root-cause completeness by STEP-369.
- **STEP-367 - Gate X private tree derivation:** compute both old and new approved stage trees inside the same private immutable integration bundle and reject ordinary write-tree execution in the Gate X stage path.
- **STEP-366 - Gate X private-config isolation:** remove original executable integration commands from the copied private Git config, verify their absence, and execute only reviewed materialized snapshots.
- **STEP-365 - Canonical CodexGPT rename:** replace the previous project name across active package, CLI, environment, state, tool, source, test, and documentation surfaces; preserve append-only historical archives and record the correction here.

- **STEP-364 - Neat-freak reconciliation:** align rules, contributor/security guidance, Chinese developer docs, changelog, archive labels, and concise project memory with STEP-363.
- **STEP-363 - Automatic owned temporary cleanup:** add cleanup-backed focused/task launchers, detached TEMP isolation, bounded terminal-run retention, legacy/claim recovery, and safe dead-owner cleanup.
- **STEP-362 - Bound transient Windows fixture cleanup:** add finite `EPERM` retries and establish impact-scoped verification.
- **STEP-361 - Promote the complete Gate X object closure:** promote every verified loose object before private-index installation and prove the live tree.
- **STEP-360 - Repair failed Phase 5 exact-head closure:** restore authoritative `all`, repair portability, and close the runner publication race.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Active interphase maintenance Part 3 — STEP-368 onward](docs/memory/archive/interphase-maintenance-part-3.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Closed Phase 1 Volume 3 — STEP-152 through STEP-165](docs/memory/archive/phase-1-part-3.md)
- [Closed Phase 1 Volume 4 — STEP-166 through STEP-179](docs/memory/archive/phase-1-part-4.md)
- [Closed Phase 1 Volume 5 — STEP-180 through STEP-193](docs/memory/archive/phase-1-part-5.md)
- [Closed Phase 1 Volume 6 — STEP-194 through STEP-205](docs/memory/archive/phase-1-part-6.md)
- [Closed Phase 1 Volume 7 — STEP-206 through STEP-219](docs/memory/archive/phase-1-part-7.md)
- [Closed Phase 1 Volume 8 — STEP-220 through STEP-236](docs/memory/archive/phase-1-part-8.md)
- [Closed Phase 1 Volume 9 — STEP-237 through STEP-247](docs/memory/archive/phase-1-part-9.md)
- [Policy Kernel Gate — STEP-248 through STEP-253](docs/memory/archive/policy-kernel-gate.md)
- [Closed Phase 2B Workspace Lifecycle — STEP-254 through STEP-262](docs/memory/archive/phase-2b-workspace-lifecycle.md)
- [Closed Phase 3 Volume 1 — STEP-263 through STEP-277](docs/memory/archive/phase-3.md)
- [Closed Phase 3 Volume 2 — STEP-278 through STEP-285](docs/memory/archive/phase-3-part-2.md)
- [Closed Phase 3 Volume 3 — STEP-286 through STEP-291](docs/memory/archive/phase-3-part-3.md)
- [Closed Phase 3 Volume 4 — STEP-292 through STEP-306](docs/memory/archive/phase-3-part-4.md)
- [Post-Phase 3 operational hardening — STEP-307 through STEP-308](docs/memory/archive/post-phase-3-operational-hardening.md)
- [Closed Phase 4 Volume 1 — STEP-309 through STEP-318](docs/memory/archive/phase-4.md)
- [Closed Phase 4 Volume 2 — STEP-319 through STEP-325](docs/memory/archive/phase-4-part-2.md)
- [Closed Phase 4 Volume 3 — STEP-326 through STEP-343](docs/memory/archive/phase-4-part-3.md)
- [Closed Phase 5 Volume 1 — STEP-344 through STEP-355](docs/memory/archive/phase-5.md)
- [Closed Phase 5 Volume 2 — STEP-356 through STEP-362](docs/memory/archive/phase-5-part-2.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.

# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-19.
- Workspace: `D:\Dev\codexpro`; branch: `main`; package: `codexpro@0.28.6`.
- GitHub repository and `origin`: `chatGPT-10/codexgpt` over HTTPS.
- Primary platform: native Windows; WSL remains optional.
- Phase 0, Phase 0.5, Phase 1, the Policy Kernel Gate, Phase 2A, Phase 2B, and complete Phase 3 are closed. Exact historical commit/run evidence is retained in the linked archives.
- Phase 3 runtime and closure heads passed exact-head Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package; exact SHAs and run IDs remain in the Phase 3 archive.
- Reduced Phase 4 is formally closed at head `d19e65ba75938c35afa472d23d91d1724fe7fabf`. Exact-head run `29603060944` completed successfully across repository policy and Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, and Package.
- Phase 4 retains truthful trusted-code `full_access`; diagnostic 4B0 remains blocked/non-production, while `workspace` and Tasks 4B1–4B6 remain deferred with no fallback.
- Phase 5 is locally complete and is the closure candidate. V4 provides typed local Git, owner-bound managed task worktrees, raw-blob materialization, immutable merge plans, checked-out target CAS, clean reviewed removal, and Gate X. Gate X accepts only private stage, shadow commit, quarantined object merge, and private checkout after exact identity binding and R3 approval; default integrations remain off. One publication and closure-SHA exact-head success remain before Phase 6.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped staging, English commits, and one push after each verified phase. Complete the final Phase 5 gates, publish once, and require terminal exact-head success before Phase 6. Tasks 4B1–4B6 and `workspace` remain deferred. Destructive user-data/history operations, production deployment, credential disclosure or migration, and silent specification expansion remain excluded.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary. Git Bash is the temporary execution backend; native PowerShell remains required future work.
- Preserve the verified managed Node `v20.20.2` and `v24.15.0` runtimes under `%LOCALAPPDATA%\CodexPro\toolchains\`; cleanup requires explicit user approval.
- Node test-loader rules: use one test-only integration barrel, load leaf implementations before shared servers, and keep executable TypeScript import barrels under package-excluded `fixtures/ts-imports/`; these avoid Node 20 loader deadlocks and Node 24 recursive test discovery.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 remains reserved for Phase 8 and requires its dedicated identity, migration, rollback, and security gates.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate; grants cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXPRO_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. V1/V2 never create approvals; V3 composite scopes keep `process:manage` from starting code.
- Public `workspace_id` values are random session-scoped handles. Core lookup requires an explicit ID; omitted-ID compatibility exists only at the named session-local resolver.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders use exact fail-closed in-memory substitutions.
- `CODEXPRO_FILE_TRANSACTIONS=legacy` remains the compatibility default. Selecting `atomic` routes supported workspace writers through the transaction runtime with no direct-write fallback; writable atomic V1 requires terminal persistent audit.
- Phase 3 state stays outside workspaces and Git; its participant recovery, V1/V2 readers, stable file identity, move undo, hard-link fail-closed behavior, and recovery freeze remain Phase 4 compatibility gates.
- Phase 4 V3 is exact 39: V2 minus `bash`, plus eight typed execution/process tools and `open_full_access_workspace`; V1/V2 wire and pending-approval behavior remain frozen.
- Phase 4 separates brokered `confirmed_roots`, ambient **Full access (ask first)**, and unavailable `workspace`. Full access is trusted-code authority, not filesystem, credential, registry, network, or broker isolation.
- V3 confirmed-root files require hard-link count 1 and never mutate `allowedRoots`. Generic V3 mutation records remain schema 1/contract 3; move records remain schema 2/contract 3; same-binary V2 rollback retains both readers.
- V3 lifecycle uses strict `AuditEventV3` inside the existing MAC-chained envelope. V2 audit wire stays exact and filters V3 before V2 paging; V3 has a separate V2/V3 projection and cursor, while V2-compatible authorization/execution evidence remains queryable after rollback.
- Phase 5 V4 is opt-in exact 51 and preserves V1=28/V2=31/V3=39. It binds fixed Git identity, typed reads, Gate R, expected-old local mutations, repeated scans, bounded restore/private stash, disjoint managed roots, persistent owner-bound task records, quarantined candidates, clean target CAS, and reviewed clean removal. Gate X exposes exactly four typed local operations, never caller-selected Git commands or remote/credential/force/config mutation; its child remains ambient current-user `full_access`, and both approval and result state that filesystem, credential, registry, network, and broker isolation are absent.
- Phase 4 authority config defaults to `configured_roots`, execution `off`, and dependencies `off`; nondefault values are V3-only. Windows effective-environment identity is case-insensitive and digest-bound. Per-server capability evidence changes revoke dependent state in order, block new requests during replacement, and change the live policy revision.
- Gate S remains a truthful blocked diagnostic for the former AppContainer/LPAC design. Its exact denial rules are preserved only to prevent future overclaiming; it is no longer a current Phase 4 publication dependency. `workspace` stays unavailable with no `full_access` fallback.
- With `inheritEnv=false`, Windows Bash preserves or derives only bounded user/configuration paths required for normal CLI and keyring discovery. Do not copy `GH_TOKEN` or arbitrary API variables into the child; `CODEXPRO_INHERIT_ENV=1` is explicit full-environment opt-in for trusted repositories only.
- Mutation inventory binds each direct primitive to path, syscall, semantic digest, and reviewed purpose; atomic production paths cannot fall back to legacy writers.
- CI evidence is exact-HEAD-bound, compact, and stored only below ignored `.ai-bridge/`. Manifest assets stay LF-pinned; Windows paths use `path.win32`; POSIX lookup passes candidates only as quoted positional data and never uses `shell: true` with argv.
- `scripts/test-domains.mjs` is authoritative: isolated complete regression uses `all`, connector-backed local work uses `ordinary`, and Windows control runs serialize. Long runs use the identity-bound detached runner; destructive stop oracles remain control-domain only.
- Gate N uses the manifest-bound PowerShell/C# `CXP4` host with creation-time Job/handle-list ownership, clean environment, exact image identity, bounded output and deadlines. Capability remains `job_object_members_only`; broker escape resistance remains `none`; ConPTY success accepts exit 0 or exact `STATUS_CONTROL_C_EXIT` only with all required evidence.
- `SystemDrive`, `SystemRoot`, `WINDIR`, `ProgramData`, `ComSpec`, minimal `PATH=System32;Windows`, and `PATHEXT` are fixed system values in clean native child environments; caller values cannot override them.
- The master implementation plan is the sequencing authority. Complete isolated regression uses `node scripts/test-domains.mjs run --domain all`; connector-backed local regression uses `--domain ordinary`. There is no `npm test` script.

## Verification evidence

- Closed Phase 3 runtime and documentation heads passed exact-head runs `29441752493` and `29443158835` across Ubuntu/Windows Node 20/24 Build, complete Regression, all protected Smoke sections, and Package.
- STEP-307 through STEP-336 retain post-Phase 3 hardening, reduced Phase 4 design/local evidence, and the blocked sandbox diagnostic; exact commands remain in the linked archives.
- STEP-323 retains the adversarially repaired Phase 5 design/TDD plan; STEP-344 records the initial Gate G0 implementation, and STEP-345 records its adversarial hardening and final capability evidence.
- STEP-337 through STEP-342 retain the Phase 4 portability, Windows scheduling, ConPTY, and exact-head repairs. Closure head `d19e65b` passed run `29603060944` across policy and Ubuntu/Windows Node 20/24.
- STEP-345 Gate G0 implementation revision `80456ec9` and capability revision `7e9f95bf` passed final managed ordinary run `2026-07-17T21-03-15-107Z-phase5a0-adversarial-final-746beff5`: Node 20/24 each 896 tests, 895 pass, 0 fail, one established skip; exit 0, stderr 0, and no truncation.
- STEP-347 Gate C4 final managed ordinary run `2026-07-18T06-51-25-686Z-phase5a1-c4-final-4-96ce13f0` passed Node 20.20.2 and Node 24.15.0: each 913 tests, 912 pass, 0 fail, one established skip; exit 0, stderr 0, and no truncation.
- STEP-349 Task 5A2 final managed ordinary run `2026-07-18T12-41-24-298Z-phase5a2-ordinary-final-2-ddcc623b` passed Node 20.20.2 and Node 24.15.0: each 944 tests, 943 pass, 0 fail, one established skip; exit 0, stderr 0, and no truncation. The preceding six-failure candidate was repaired and is not completion evidence.
- STEP-351 Gate R final managed ordinary run `2026-07-18T15-29-43-345Z-phase5a3-final3-535183ed` passed Node 20.20.2 and Node 24.15.0: each 969 tests, 968 pass, 0 fail, one established skip; exit 0, stderr 0, and no truncation. Earlier runs exposed and repaired a Node 20 tsx loader alias deadlock and Git-directory leakage into the Phase 3 transaction module.
- STEP-357 Phase 5 final ordinary run `2026-07-18T22-25-18-928Z-phase5c-ordinary-final-7783f2dd` passed both pinned majors: each 1,015 tests, 1,014 pass, 0 fail, one established skip. Windows control and protected Smoke also passed both/complete domains; build, policy, diff, focused 30/30, and 509-entry package dry-run passed.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A adds a V3-only exact local approval path for eligible ambient-authority execution; it is not OS isolation.
- Workspace lifecycle state is intentionally process-local. OAuth owner identity and lifecycle persistence remain out of scope.
- Operational rollback must retain V2 readers, participant reconciliation, and recovery evidence.
- External processes remain outside CodexPro's workspace lock. Open-handle identity checks reduce path-replacement TOCTOU but cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary readers, or absolute power-loss durability when directory sync is unsupported.
- Environment narrowing is defense in depth, not credential isolation; same-user child processes may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- Confirmed-root modules retain an injected identity oracle. `full_access` and ConPTY are ambient-authority features; only owned Job members are lifecycle-controlled. Task 4B0 remains blocked evidence and activates no sandbox behavior.
- Protected main/HTTP Smoke compatibility depends on exact source strings; drift fails closed and requires a same-change compatibility update.
- V2 remains explicit rather than default. Rolling configuration back to V1 hides V2 tools but must retain V2 readers and recovery.
- Atomic `apply_patch` is bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish the complete Phase 5 closure candidate once and require closure-SHA exact-head success before Phase 6.
2. Keep Tasks 4B1–4B6 and `workspace` deferred; do not reinterpret blocked 4B0 evidence or any Git/worktree mechanism as a sandbox.
3. Do not publish a task-level Phase 5 slice or create an evidence-only follow-up commit.

## Recent summaries

- **STEP-357 - Complete Phase 5 local closure:** final Node 20/24 ordinary, Windows control, protected Smoke, build, policy, diff, focused Gate X, and 509-entry package dry-run passed; one publication and exact-head CI remain.
- **STEP-356 - Gate X adversarial closure:** rejected unknown typed operations and missing private object/index state, made approval cards disclose ambient full access with no isolation, reconciled public/security/design docs, and passed focused plus managed Windows control gates.
- **STEP-355 - Reconcile Phase 5B knowledge:** neat-freak aligned rules, plan, memory, package/mutation/domain inventories, limits, and the Phase 5C handoff.
- **STEP-354 - Complete Phase 5B:** added managed task roots/records/handles, raw tree materialization, fast-forward and quarantined divergent candidates, clean target CAS, reviewed removal, and default-off integration approval.
- **STEP-350 - Reconcile Task 5A2 knowledge:** audited current-state handoffs, archive history, package boundaries, workspace changes, and memory size; no runtime or public-doc drift was found.
- **STEP-349 - Complete typed V4 Git reads:** machine-format status/diff/log/branch providers, repository identity/revalidation, secret-safe projections, opaque state tokens, and final Node 20/24 ordinary regression passed.
- **STEP-348 - Reconcile Gate C4 knowledge:** compacted `AGENTS.md` below its soft size ceiling, audited plans/archive pointers/package boundaries/handoff text, and kept public docs unchanged because all V4 handlers remained inactive at that checkpoint.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
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
- [Phase 5 Volume 1 — STEP-344 through STEP-355](docs/memory/archive/phase-5.md)
- [Active Phase 5 Volume 2 — STEP-356 onward](docs/memory/archive/phase-5-part-2.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.

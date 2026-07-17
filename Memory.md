# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-17.
- Workspace: `D:\Dev\codexpro`; branch: `main`; package: `codexpro@0.28.6`.
- GitHub repository and `origin`: `chatGPT-10/codexgpt` over HTTPS.
- Primary platform: native Windows; WSL remains optional.
- Phase 0, Phase 0.5, Phase 1, the Policy Kernel Gate, Phase 2A, Phase 2B, and complete Phase 3 are closed. Exact historical commit/run evidence is retained in the linked archives.
- Phase 3 runtime and closure heads passed exact-head Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package; exact SHAs and run IDs remain in the Phase 3 archive.
- Reduced Phase 4 is published through exact-head domain-repair head `2d5429b1d9e26a576ec2ee27dd6f9eadc32332ac`. Run `29592584591` passed repository policy and Ubuntu Node 20/24; Windows Node 20/24 failed only the same ConPTY probe completion defect after all earlier portability, scheduling, and startup-cleanup defects were eliminated.
- STEP-340's bounded native-host repair is complete locally and becomes the sole Phase 4 closure candidate after publication. Successful exact-head evidence stays below ignored `.ai-bridge/` and must not create an evidence-only follow-up commit. Tasks 4B1–4B6 and every `workspace` activation path remain deferred.
- Phase 5's paired exact design/TDD plan is adversarially reviewed. No Phase 5 runtime work has started; Task 5A0/Gate G0 remains blocked on complete Phase 4 exact-head closure.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped staging, English commits, and pushes after each verified phase. Task 4C2 published the approved Phase 4 boundary; failed exact-head runs authorize only the bounded repairs recorded in STEP-337 through STEP-340. Publish STEP-340 once and require exact-head Ubuntu/Windows Node 20/24 CI. Task 4B1–4B6 and `workspace` remain deferred; Phase 5 waits only for terminal success of the next repair SHA. Destructive user-data/history operations, production deployment, credential disclosure or migration, and silent specification expansion remain excluded.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary. Git Bash is the temporary execution backend; native PowerShell remains required future work.
- Use the verified managed Node runtimes under `%LOCALAPPDATA%\CodexPro\toolchains\`: Node `v20.20.2` and `v24.15.0` are installed from the official distribution, verified against `SHASUMS256.txt`, and recorded in the local toolchain manifest. Cleanup must not remove this managed root without explicit user approval.
- Node test-loader rules: repeated Node 20 `tsx/esm/api` `tsImport` calls can deadlock/cache-spin when a test loads a shared TS graph twice. Use one test-only integration barrel, load leaf implementations before shared servers, and do not use `Promise.all` where it exposes untranspiled `import type`. Node 24.18 recursively discovers TypeScript below `test/`; keep executable/import barrels under package-excluded `fixtures/ts-imports/`, with only inert sentinels under `test/fixtures/`.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 remains reserved for Phase 8 and requires its dedicated identity, migration, rollback, and security gates.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate; grants cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXPRO_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. V1/V2 never create pending approvals. Eligible explicit V3 `enforce` profiles use versioned composite scopes so `process:manage` cannot start code and unresolved execution facts fail before approval.
- Public `workspace_id` values are random session-scoped handles. Core lookup requires an explicit ID; omitted-ID compatibility exists only at the named session-local resolver.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders use exact fail-closed in-memory substitutions.
- `CODEXPRO_FILE_TRANSACTIONS=legacy` remains the compatibility default. Selecting `atomic` routes supported workspace writers through the transaction runtime with no direct-write fallback; writable atomic V1 requires terminal persistent audit.
- Phase 3 state stays outside workspaces and Git; its participant recovery, V1/V2 readers, stable file identity, move undo, hard-link fail-closed behavior, and recovery freeze remain Phase 4 compatibility gates.
- Phase 4 V3 is exact 39: V2 minus `bash`, plus eight typed execution/process tools and `open_full_access_workspace`; V1/V2 wire and pending-approval behavior remain frozen.
- Phase 4 separates `confirmed_roots` brokered access, ambient current-user `full_access`, and reserved unavailable `workspace`. Full access is labeled **Full access (ask first)**, is intended only for trusted repositories, and has no filesystem/credential/registry/network/broker-escape isolation; local decision records are not secure human-presence proof after unrestricted same-user code runs.
- V3 confirmed-root files require hard-link count 1 and never mutate `allowedRoots`. Generic V3 mutation records remain schema 1/contract 3; move records remain schema 2/contract 3; same-binary V2 rollback retains both readers.
- V3 lifecycle uses strict `AuditEventV3` inside the existing MAC-chained envelope. V2 audit wire stays exact and filters V3 before V2 paging; V3 has a separate V2/V3 projection and cursor, while V2-compatible authorization/execution evidence remains queryable after rollback.
- Phase 5 V4 is opt-in exact 51 and keeps V1=28/V2=31/V3=39 exact. Safe Git writes use raw blobs, private indexes, quarantined object-only merge, complete mutation tokens, R3 for ref/history mutation, and journaled object/file/index/ref/audit participants; managed task worktrees never widen `allowedRoots` or imply isolation, and typed remote/credential/force operations remain absent.
- Phase 4 authority config defaults to `configured_roots`, execution `off`, and dependencies `off`; nondefault values are V3-only. Windows effective-environment identity is case-insensitive and digest-bound. Per-server capability evidence changes revoke dependent state in order, block new requests during replacement, and change the live policy revision.
- Gate S remains a truthful blocked diagnostic for the former AppContainer/LPAC design. Its exact denial rules are preserved only to prevent future overclaiming; it is no longer a current Phase 4 publication dependency. `workspace` stays unavailable with no `full_access` fallback.
- With `inheritEnv=false`, Windows Bash preserves or derives only bounded user/configuration paths required for normal CLI and keyring discovery. Do not copy `GH_TOKEN` or arbitrary API variables into the child; `CODEXPRO_INHERIT_ENV=1` is explicit full-environment opt-in for trusted repositories only.
- Mutation inventory binds each direct primitive to path, syscall, semantic digest, and reviewed purpose; atomic production paths cannot fall back to legacy writers.
- CI debugging binds the exact HEAD SHA, uses bounded Windows `gh` environment, emits compact summaries, and stores evidence only below ignored `.ai-bridge/`. Manifest-bound `scripts/windows-*.cs|ps1|json` assets are pinned to LF by `.gitattributes`; exact raw-byte hashes remain fail-closed. Windows host compilation uses `path.win32` semantics on every controller platform. POSIX command lookup uses fixed `/bin/sh -c` scripts with candidate commands passed only as quoted positional data; never use `shell: true` with argv.
- Complete Regression is the authoritative `all` domain from `scripts/test-domains.mjs`; Ubuntu keeps runtime-default concurrency and Windows uses concurrency 1 so native host/control tests do not cold-start concurrently. Ordinary local Regression and Smoke run through detached runner schema 2. Gate O binds PID creation time, 256-bit nonce, command identities, stable run-directory identity, and independently capped stdout/stderr tails; exact stop revalidates ownership before `taskkill`, and its destructive oracle remains control-domain only.
- Gate N uses the source-shipped PowerShell/C# host with exact `CXP4` framing, creation-time Job/handle-list ownership, fixed clean Windows environment, executable identity, bounded output, native deadlines, and an isolated Job-owned ConPTY worker. Capability is `job_object_members_only`; WMI broker escape resistance remains `none`. The ConPTY probe normalizes `cmd.exe` exit to 0 only after the explicit ETX acknowledgement; ready/input/ETX markers, timeout, Job, handle, image, output, and close evidence remain mandatory.
- `SystemDrive`, `SystemRoot`, `WINDIR`, `ProgramData`, `ComSpec`, minimal `PATH=System32;Windows`, and `PATHEXT` are fixed system values in clean native child environments; caller values cannot override them.
- The master implementation plan is the sequencing authority. Complete isolated regression uses `node scripts/test-domains.mjs run --domain all`; connector-backed local regression uses `--domain ordinary`. There is no `npm test` script.

## Verification evidence

- Closed Phase 3 runtime and documentation heads passed exact-head runs `29441752493` and `29443158835` across Ubuntu/Windows Node 20/24 Build, complete Regression, all protected Smoke sections, and Package.
- Post-Phase 3 operational hardening and the Windows `npm-cli.js` launch repair are published through current head `ae0575d`; full command and run evidence is in STEP-307/308.
- STEP-309 through STEP-331 retain the exact Phase 4 design and complete Phase 4A evidence. The final pre-publication ordinary Node 20/24 run passed 873 tests with one platform skip per runtime; independent native control passed 99/99 per runtime. Exact task-level runs, repairs, and skips remain in the Phase 4 archives.
- STEP-323 retains the adversarially repaired Phase 5 exact design/TDD plan; runtime remains blocked on complete Phase 4 closure.
- STEP-332/333 implement and adversarially re-verify diagnostic 4B0. Its final evidence remains `blocked` with successful UDP sends and incomplete broker/network isolation; cleanup passed and no production sandbox is activated.
- STEP-335/336 close 4C0/4C1: focused 115/115 passed; managed Node 20.20.2 and 24.15.0 ordinary each passed 880/881 with one established skip, control each passed 100/100, both eight-part Smoke suites passed, and the 394-file package dry-run plus build, policy, inventory, links, secrets, and diff gates passed.
- STEP-337 records initial publication `60f62da`, failed exact-head run `29586912907`, all three first-pass portability root causes, and the local repair gate: affected 59/59, focused 6/6, Build, policy, diff, 394-file package, managed Node 20 at 983/984 and Node 24 at 989/990, each with one established skip.
- STEP-338 records first portability head `87d6101`, exact-head run `29589048926`, the remaining POSIX `shell: true` deprecation and Windows-contract fixture defects, focused 7/7, Build/diff, and managed Node 20/24 full-matrix exit 0 with zero stderr or truncation.
- STEP-339 records second portability head `89f0dcf`, exact-head run `29590793061`, the corrected non-Windows doctor blocker, authoritative all-domain CI routing, Windows serialization, handshake-timeout host cleanup, focused 16/16, and managed Node 20/24 ordinary 884/885 with one established skip each.
- STEP-340 records domain-repair head `2d5429b`, exact-head run `29592584591`, full policy/Ubuntu success, the isolated Windows `cmd.exe` Ctrl+C error-level residue, and the local bounded repair gate: focused 18/18, Build, policy, diff, and 394-file package dry-run.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A adds a V3-only exact local approval path for eligible ambient-authority execution; it is not OS isolation.
- Workspace lifecycle state is intentionally process-local. OAuth owner identity and lifecycle persistence remain out of scope.
- Operational rollback must retain V2 readers, participant reconciliation, and recovery evidence.
- External processes remain outside CodexPro's workspace lock. Open-handle identity checks reduce path-replacement TOCTOU but cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary readers, or absolute power-loss durability when directory sync is unsupported.
- Environment narrowing is defense in depth, not credential isolation; same-user child processes may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- Confirmed-root modules still rely on an injected identity oracle. One-shot/persistent `full_access`, including ConPTY, are ambient-authority features, not isolation; only owned Job members are lifetime-controlled. Task 4B0 does not activate sandbox behavior: the current host allows outbound UDP across all tested address classes, exposes service-manager and unauthorized COM surfaces, lacks exact policy denial on several network paths, reports LPAC backend-incompatible, and was probed from an elevated host process.
- Protected main/HTTP Smoke compatibility depends on exact source strings; drift fails closed and requires a same-change compatibility update.
- V2 remains explicit rather than default. Rolling configuration back to V1 hides V2 tools but must retain V2 readers and recovery.
- Atomic `apply_patch` is bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish the single STEP-340 bounded native-host repair commit and require exact-head Ubuntu/Windows Node 20/24 CI for that exact 40-character SHA.
2. Do not create an evidence-only follow-up commit; keep successful replacement-run evidence below ignored `.ai-bridge/`.
3. Do not start Task 4B1–4B6 or activate `workspace`; begin Phase 5 Task 5A0/Gate G0 only after the repair SHA reaches terminal exact-head success.

## Recent summaries

- **STEP-340 - Normalize ConPTY completion:** run `29592584591` passed policy and Ubuntu but exposed Ctrl+C `ERRORLEVEL` residue on Windows; the probe now exits 0 only after explicit ETX acknowledgement while all native evidence remains strict.
- **STEP-339 - Align exact-head regression domains:** run `29590793061` exposed a wrong Ubuntu doctor assertion plus raw-discovery Windows control contention; CI now uses the complete authoritative domain, Windows is serialized, and pre-session timeout cleanup is exact.
- **STEP-338 - Repair remaining Ubuntu regressions:** run `29589048926` exposed unsafe POSIX shell lookup and a POSIX fixture for a Windows-host contract; fixed lookup uses positional `/bin/sh`, the fixture is Windows-semantic, and focused/full local gates pass.
- **STEP-337 - Repair first exact-head CI:** initial Phase 4 publication and run `29586912907` exposed CRLF manifest drift, POSIX resolution of Windows paths, and Node 24 TypeScript fixture discovery; the bounded repair and complete local matrix passed.
- **STEP-336 - Pass 4C1 and neat-freak:** complete Node 20/24 ordinary/control, Smoke, package, policy, inventory, link, secret, scope, and diff gates passed before publication.

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
- [Active Phase 4 Volume 3 — STEP-326 onward; ConPTY completion repair complete locally at STEP-340](docs/memory/archive/phase-4-part-3.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.

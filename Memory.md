# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-23.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Phase 6 was first published at `efb53118331868686703d28b5ddea55611836b54`; exact-head run `29990618309` exposed Ubuntu guidance-path compatibility and Windows Node 24 guidance-mutation/runner-retention failures.
- STEP-395 published the three bounded repairs at `22f0f4152fb33c6a8bfa26a472f7c57332f183c0`. Exact-head run `29997207747` proved Repository policy, Ubuntu Node 20/24, and Windows Node 20; Windows Node 24 failed only because `runner-log-bounds` declared timeout after 15 seconds while the exact worker lease remained active.
- STEP-396 aligns that test oracle with the 60-second production lease plus bounded terminal-publication grace and has completed all local closure gates. The user authorized the additional fixes, commits, pushes, and exact-head attempts required to reach formal Phase 6 closure; deployment, release publication, Phase 7, force push, destructive history changes, credentials, and unrelated scope remain excluded.
- STEP-390 implements and adversarially repairs the local Phase 6 `standard` preview: root/target AGENTS, target-bound Skill discovery/loading, lazy resources, bounded diagnostics, and exact legacy compatibility.
- STEP-391 obtained live ChatGPT evidence through the existing Cloudflare named tunnel: root guidance/root Skill, nested root-to-target guidance, target-scoped `frontend-guidance`, one bounded edit, and `npm run check` all succeeded. A forced cross-session reuse of the returned workspace handle correctly failed closed under the Phase 2B transport boundary; standard server instructions now tell ChatGPT Web/App to omit `workspace_id` on subsequent default-workspace calls.
- STEP-392 completed the strict second-subtree G6-U sequence in a clean ChatGPT conversation: frontend context, exact nested Skill load once, frontend edit, backend subtree switch and context reload, backend edit, and workspace verification all succeeded without `WORKSPACE_NOT_FOUND` or fallback. The old pre-Phase-6 App had already been deleted; the user approved one **Scan Tools** refresh or App recreation as the documented upgrade path instead of claiming transparent frozen-snapshot compatibility.
- Omitted mode defaults to `standard` with readiness `ready`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Omitted `minimal` mode preserves the exact legacy projection because it has no `codex_context`; explicit `standard + minimal` fails closed. Formal Phase 6 closure requires one exact published head to pass Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package gates.

## Approved execution boundary

Phase 6 runtime, exact `yaml@2.9.0`, live G6-M/G6-U acceptance, omitted-default activation, and the bounded additional fixes, English commits, ordinary pushes, and exact-head attempts required for formal closure are authorized. This authority ends when one exact published head passes Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package gates. Tasks 4B1–4B6 and `workspace` remain deferred. Force push, destructive history changes, deployment, release publication, credential handling, Phase 7, and unrelated scope expansion remain excluded.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness is represented by exact renewable `worker-lease.json` evidence for `running` and `finalizing`. Every lease publication, including the first, is observational and cannot suppress task execution or authoritative result publication. A lease is non-authorizing: stop still requires exact live process identity, and a crashed worker becomes stale after lease expiry. Lease persistence is synchronous and atomic; synchronous and asynchronous atomic JSON replacement share one bounded retry policy for transient Windows replacement-sharing failures. A failed periodic lease publication retries after one second instead of waiting a full 15-second renewal interval.
- `scripts/test-domains.mjs` is authoritative. Connector-backed local regression uses `ordinary`; destructive control/all execution requires CI or a proven independent native terminal. There is no `npm test` script.
- Focused tests and tasks use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>`. Cleanup deletes only exact verified dead-owner temporary roots and terminal run evidence.
- Mutation inventory is fail-closed and binds direct filesystem primitives to repository path, syscall type, and semantic call identity. Atomic production paths cannot fall back to legacy writers.
- With `inheritEnv=false`, Windows child environments preserve only bounded required user/system paths; do not copy `GH_TOKEN` or arbitrary API variables. `CODEXGPT_INHERIT_ENV=1` is trusted-repository opt-in.
- `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain protected; compatibility loaders use exact fail-closed in-memory substitutions.
- Runtime-relevant pushed SHAs require the complete exact-head matrix. Documentation-only changes require repository policy and document integrity checks.
- Phase 6 is usability-first: workspace open must return real root AGENTS text, standard `codex_context(target_path)` must return target guidance plus target Skill metadata, and bodies/resources stay lazy.
- Phase 6 adds no Tool Contract V5, generic Hooks, automatic Skill scripts/dependencies, custom trust/hash/permission manifest, or guidance-derived authority. Standard user/plugin Skills remain explicit opt-in.
- Every Phase 6 AGENTS/Skill/resource read must use one canonical same-handle bounded reader; automatic Skill catalogs default to an 8,000-character total budget.
- Omitted `CODEXGPT_GUIDANCE_MODE` now selects `standard` with readiness `ready`; explicit `legacy` preserves the exact prior V1/V2/V3/V4 projections as a one-restart rollback. In ChatGPT Web/App, subsequent default-workspace calls omit `workspace_id` because opaque handles are transport-session scoped and cross-session reuse must fail closed. Apps with frozen pre-Phase-6 tool snapshots require one **Scan Tools** refresh or recreation; transparent refresh is not claimed. `yaml@2.9.0` is the only new production dependency and has no transitive dependencies or lifecycle scripts.

## Verification evidence

- Phase 3 closure heads passed runs `29441752493` and `29443158835`; reduced Phase 4 passed `29603060944`; Phase 5 passed `29698209894`.
- Gate X follow-up head passed exact-head run `29780813295`; the post-Phase-5 runtime base `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` passed run `29925944942`.
- Phase 6 implementation, live ChatGPT G6-M/G6-U acceptance, default activation, doctor alignment, compatibility repair, and complete local closure are recorded in STEP-390 through STEP-394 of `docs/memory/archive/phase-6.md`.
- STEP-395 managed Node 20.20.2 and 24.15.0 each passed 35 affected tests and build. Detached ordinary passed 1,175/1,177 per major with zero failures and two established skips; dual-major eight-part Smoke, policy, package, Markdown, secret, and mutation gates passed.
- Exact-head run `29997207747` for `22f0f4152fb33c6a8bfa26a472f7c57332f183c0` passed Repository policy, Ubuntu Node 20/24, and Windows Node 20. Windows Node 24 failed only in `runner-log-bounds` after its fixed 15-second deadline while the exact lease remained active; all three STEP-395 failure classes stayed closed.
- STEP-396 passed the runner/log lifecycle suite 19/19 on each managed major and the Node 24 flood test in ten consecutive rounds. Detached ordinary run `2026-07-23T12-46-34-421Z-phase6-final-ordinary-03b98fb5` passed 1,175/1,177 per major with zero failures and two established skips; detached Smoke run `2026-07-23T13-10-44-132Z-phase6-final-smoke-c2b26ef0` passed all eight sections per major. Both runs had empty stderr, cleaned temporary state, and zero retention failures; dual-major build, 21/21 static/package/mutation/operational tests, policy, package, Markdown, secret, and protected-Smoke gates passed.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state is process-local; OAuth owner identity and lifecycle persistence remain out of scope.
- External processes remain outside CodexGPT's workspace lock. Open-handle checks reduce path-replacement races but do not create an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, and ConPTY remain ambient-authority features; only owned Job members are lifecycle-controlled.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.
- The deleted pre-Phase-6 App made a genuine frozen-tool-snapshot reuse test impossible. The approved product contract is one explicit **Scan Tools** refresh or App recreation; transparent cache refresh is not claimed.

## Open items

1. Stage and publish the final reviewed STEP-396 candidate, then require terminal exact-head Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package success. Do not create an evidence-only follow-up commit after success.
2. Keep Tasks 4B1–4B6 and `workspace` deferred; do not reinterpret Git/worktree mechanisms, ConPTY, or lifecycle leases as a sandbox.
3. Treat migration from `%LOCALAPPDATA%\CodexPro\toolchains` to the default `CodexGPT` toolchain root as separate unplanned maintenance requiring approval.

## Recent summaries

- **STEP-396 - Align the final runner oracle:** bind flood-fixture failure to the production lease plus bounded terminal grace, preserving immediate stale failure and bounded CI completion.
- **STEP-395 - Repair Phase 6 exact-head CI gaps:** normalize cross-host guidance paths, detect same-size same-handle mutation by byte verification, and promptly retry failed observational lease renewals.
- **STEP-394 - Complete Phase 6 local closure:** repair omitted-minimal and frozen-contract compatibility, reconcile user documentation, and pass complete dual-major local gates.
- **STEP-393 - Align doctor with activated guidance:** report ready default `standard` while preserving explicit legacy rollback.
- **STEP-392 - Complete G6-U and activate standard guidance:** pass the strict second-subtree journey, flip the omitted default, and preserve exact legacy compatibility.
- **STEP-391 - Run live Phase 6 acceptance:** verify named-tunnel root/nested/write/check behavior while preserving transport-scoped workspace isolation.
- **STEP-390 - Implement the Phase 6 preview:** add bounded AGENTS context, target Skills, lazy resources, diagnostics, and exact legacy projection.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Closed interphase maintenance Part 4 — STEP-376 through STEP-384](docs/memory/archive/interphase-maintenance-part-4.md)
- [Active interphase maintenance Part 5 — STEP-385 onward](docs/memory/archive/interphase-maintenance-part-5.md)
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
- [Active Phase 6 — STEP-386 onward](docs/memory/archive/phase-6.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.

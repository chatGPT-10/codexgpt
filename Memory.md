# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-23.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Post-Phase 5 maintenance through STEP-388 is published; local `main` and `origin/main` are synchronized at `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c`.
- Exact-head run `29925944942` for `d2a5af0` completed successfully: Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package all passed. The current-runtime-base success prerequisite of Gate G6-0 is satisfied.
- STEP-390 implements and adversarially repairs the local Phase 6 `standard` preview: root/target AGENTS, target-bound Skill discovery/loading, lazy resources, bounded diagnostics, and exact legacy compatibility.
- STEP-391 obtained live ChatGPT evidence through the existing Cloudflare named tunnel: root guidance/root Skill, nested root-to-target guidance, target-scoped `frontend-guidance`, one bounded edit, and `npm run check` all succeeded. A forced cross-session reuse of the returned workspace handle correctly failed closed under the Phase 2B transport boundary; standard server instructions now tell ChatGPT Web/App to omit `workspace_id` on subsequent default-workspace calls.
- STEP-392 completed the strict second-subtree G6-U sequence in a clean ChatGPT conversation: frontend context, exact nested Skill load once, frontend edit, backend subtree switch and context reload, backend edit, and workspace verification all succeeded without `WORKSPACE_NOT_FOUND` or fallback. The old pre-Phase-6 App had already been deleted; the user approved one **Scan Tools** refresh or App recreation as the documented upgrade path instead of claiming transparent frozen-snapshot compatibility.
- Omitted mode defaults to `standard` with readiness `ready`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Omitted `minimal` mode preserves the exact legacy projection because it has no `codex_context`; explicit `standard + minimal` fails closed. STEP-394 completed the final local closure gates and the user authorized one Phase 6 staging, English commit, push, and exact-head closure attempt. No deployment, release publication, or Phase 7 work is authorized.

## Approved execution boundary

Phase 6 runtime, exact `yaml@2.9.0`, live G6-M/G6-U acceptance, omitted-default activation, full local closure, and one staging/commit/push attempt are authorized. The remaining gate is terminal exact-head Ubuntu/Windows Node 20/24 CI for the published SHA. Tasks 4B1–4B6 and `workspace` remain deferred. Destructive history changes, deployment, release publication, credential handling, Phase 7, and silent scope expansion remain excluded.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness is represented by exact renewable `worker-lease.json` evidence for `running` and `finalizing`. Every lease publication, including the first, is observational and cannot suppress task execution or authoritative result publication. A lease is non-authorizing: stop still requires exact live process identity, and a crashed worker becomes stale after lease expiry. Lease persistence is synchronous and atomic; synchronous and asynchronous atomic JSON replacement share one bounded retry policy for transient Windows replacement-sharing failures.
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
- Gate X repair PR run `29773470293` and follow-up exact-head run `29780813295` passed the complete required matrices.
- STEP-382 through STEP-385 each passed managed Node 20/24 affected suites, builds, policy, and complete detached ordinary matrices; STEP-385 ordinary passed 1,109/1,111 per major with zero failures and two established skips.
- STEP-387/388 diagnosed and closed the prior prune-claim and Windows terminal-publication failures; complete failed-run details remain in `docs/memory/archive/interphase-maintenance-part-5.md`.
- STEP-388 verified Node 20.20.2 and Node 24.15.0 at 28/28 affected tests plus 5/5 mutation tests per major; the two Windows Node 20 failures passed five consecutive stress rounds. Exact detached ordinary run `2026-07-22T13-08-28-930Z-step388-async-atomic-retry-b2665083` passed 1,110/1,112 per major with zero failures and two established skips, followed by successful dual-major build, policy, 529-file package dry-run, and scoped diff integrity checks.
- Published head `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` passed exact-head CI run `29925944942`; every non-skipped job completed successfully.
- STEP-386 documentation verification passed repository policy, focused authentication/package tests 8/8, diff/explicit whitespace checks, and a 123-file Markdown audit with `BROKEN_COUNT|0`; build/Smoke/runtime suites were not run because no runtime file was changed by STEP-386.
- STEP-390 final related focused suite passed 170/170. Detached ordinary run `2026-07-22T17-14-54-260Z-phase6-ordinary-2af159ed` passed Node 20.20.2 and Node 24.15.0 at 1,170/1,172 each, with zero failures and two established skips per major. The preceding run exposed and permanently regressed a legacy wire-schema contamination instead of accepting a snapshot change.
- Protected Smoke run `2026-07-22T17-43-36-225Z-phase6-smoke-06a40596` passed all eight domains on both managed majors; dual-major build, repository policy, authentication/package tests 8/8, and package dry-run also passed. The package contains 549 files, no tests or `.ai-bridge` evidence, and 18 compiled guidance files.
- STEP-391 live acceptance used the supported global CLI and existing named tunnel. Tool scan reached local MCP with HTTP 200/202; root and nested read journeys were correct; the target edit was written; `npm run check` exited 0. The transport-scope instruction regression passed its RED/GREEN cycle, the related local suite passed 21/21, managed Node 20.20.2 and 24.15.0 each passed 8/8 focused tests and build, and repository policy plus `git diff --check` passed.
- STEP-392 default-flip verification passed the 99-test related contract suite; managed Node 20.20.2 and 24.15.0 each passed 24/24 focused tests and build. Detached Smoke run `2026-07-22T20-22-52-703Z-phase6-default-flip-smoke-c3c1f405` exited 0 with empty stderr and all eight Smoke sections passing on both majors. The flip exposed legacy Smoke wrappers that relied on omitted mode; each compatibility wrapper now pins explicit `legacy`, with a permanent regression.
- STEP-393 doctor alignment passed its RED/GREEN cycle; the final related local contract suite passed 100/100, and managed Node 20.20.2 and 24.15.0 each passed 25/25 focused tests and build. The supported doctor entry with the guidance variable omitted reported `standard is ready and enabled by default`. Detached Smoke run `2026-07-22T20-40-39-820Z-phase6-doctor-default-smoke-1d042126` exited 0 with empty stderr and all eight sections passing on both majors.
- STEP-394 first exposed 11 compatibility failures after default activation, then repaired omitted-minimal selection and explicitly pinned frozen legacy fixtures without widening the minimal surface. Final ordinary run `2026-07-23T07-09-16-184Z-phase6-closure-ordinary-r2-b6e4a32b` passed 1,172/1,174 with zero failures and two established skips on each managed major. Final Smoke run `2026-07-23T07-47-04-068Z-phase6-closure-smoke-final-9653d6a4` passed all eight sections on both majors with empty stderr. Dual-major build, 17/17 docs/mutation/compatibility tests, 549-file package dry-run, policy, whitespace, secret, 123-file Markdown, dependency, and doctor/minimal gates passed; `yaml@2.9.0` introduced no advisory.

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

1. Stage the reviewed Phase 6 scope, create one concise English commit, push once, and require terminal exact-head Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package success before formal closure.
2. Keep Tasks 4B1–4B6 and `workspace` deferred; do not reinterpret Git/worktree mechanisms, ConPTY, or lifecycle leases as a sandbox.
3. Treat migration from `%LOCALAPPDATA%\CodexPro\toolchains` to the default `CodexGPT` toolchain root as separate unplanned maintenance requiring approval.

## Recent summaries

- **STEP-394 - Complete Phase 6 local closure:** repair omitted-minimal and frozen-contract compatibility, reconcile user documentation, pass final dual-major ordinary/build/Smoke and static/package gates, and record one authorized publication attempt with exact-head CI still pending.
- **STEP-393 - Align doctor with activated guidance:** make the supported launcher report ready default `standard`, preserve explicit legacy rollback, and verify the final script through dual-major focused/build/Smoke gates.
- **STEP-392 - Complete G6-U and activate standard guidance:** pass the strict second-subtree ChatGPT sequence, document the one-time old-App refresh path, flip omitted mode to ready `standard`, and preserve exact legacy Smoke through explicit rollback-mode wrappers.
- **STEP-391 - Run live Phase 6 acceptance and clarify transport-scoped handles:** verify named-tunnel root/nested/write/check behavior in ChatGPT, preserve fail-closed cross-session handle isolation, and instruct standard ChatGPT flows to omit `workspace_id` on default-workspace calls.
- **STEP-390 - Implement and adversarially repair Phase 6 preview:** add bounded same-handle project guidance, target Skills and lazy resources to `standard`, preserve exact legacy projections, repair three independent reviews, and keep activation blocked on real ChatGPT evidence.
- **STEP-389 - Reconcile the green runtime base with Phase 6 records:** replace obsolete blocker text with exact successful head/run evidence while preserving the remaining runtime/YAML authorization gates.
- **STEP-388 - Retry transient asynchronous atomic replacements:** protect authoritative detached-run JSON publication with the same bounded sharing-conflict retry policy already used by synchronous leases.
- **STEP-387 - Isolate prune-claim recovery:** replace unrelated detached-run setup with a complete terminal fixture so the test directly exercises verified claimed-directory recovery.
- **STEP-386 - Design usable project guidance and Skills:** replace the over-broad Hook/trust-manifest outline with a reviewed root/target AGENTS and progressive Skill plan, including an early usable slice, same-handle reads, global privacy, real ChatGPT gates, and exact rollback/closure steps.
- **STEP-385 - Keep the initial lease observational:** a permanently blocked first lease write no longer aborts the worker before task execution and authoritative terminal publication.
- **STEP-384 - Retry transient Windows lease replacement:** retain the synchronous atomic lease path and add a bounded retry window for Windows sharing violations without extending lease duration or weakening stale detection.
- **STEP-383 - Preserve Node 24 runner leases under CI pressure:** move the small observational lease to synchronous atomic replacement so cleanup/retention filesystem congestion cannot create false stale runs.
- **STEP-382 - Ubuntu install hardening:** execute the public CLI through npm symlinks, keep managed Cloudflared immutable during tunnel runs, hide public credential URLs from automatic logs, and preserve explicit local reveal/copy actions.
- **STEP-381 - Neat-freak closure reconciliation:** record successful follow-up head/run, remove completed release work from open items, align the master plan and project rules with closed Phase 5 and frozen Phase 6, and preserve the clean single-worktree boundary.
- **STEP-380 - Publication and deadline follow-up:** publish the STEP-379 oracle correction, diagnose the Windows Node 24 ConPTY deadline race without blind rerun, and close replacement head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4` with successful run `29780813295`.
- **STEP-379 - Align finalization test oracle:** accept either an exact optional `finalizing` lease or the authoritative result that supersedes it, while retaining stale and nonzero-exit failures.
- **STEP-378 - Preserve terminal publication after lease-refresh failure:** keep lifecycle lease writes observational, add a deterministic pre-fix failure regression, and replace a fixed path-replacement cleanup delay with exact worker-exit observation.
- **STEP-373–377 - Lifecycle lease hardening:** add renewable non-authorizing leases, lease-bound observation, deterministic process identity proof, and aligned project records.
- **STEP-367 - Gate X private tree derivation:** compute both old and new approved stage trees inside one private immutable integration bundle and reject ordinary post-review `write-tree`.

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

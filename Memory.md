# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-24.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Phase 6 is formally closed at `31631676fe254962a9a4f14d6e025e3edba82b8d`; exact-head run `30033293444` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package. Explicit `legacy` remains rollback and old Apps require one **Scan Tools** refresh or recreation.
- STEP-400 repaired the two Windows test observers and passed local ordinary, Build, and Smoke on managed Node 20/24. STEP-401 records the exact published closure without creating an evidence-only repository commit.
- STEP-408 completes the Phase 7 Core local implementation candidate through Gate G7-X: zero-setup owned-worker JS/TS, symbol-or-position `semantic`, exact inherited V5=52, quality-labeled fallback, and approval/identity-bound atomic rename. STEP-409 repairs Linux parent-directory object reuse; STEP-410 isolates detached-runner lifecycle tests from non-Windows suite-wide concurrency; STEP-411 makes unsafe lease-path replacement fail immediately; STEP-412 defers retention deletion while the exact terminal worker is still alive. Formal closure still requires a successful replacement exact-head run plus real ChatGPT G7-U.
- Omitted mode defaults to `standard` with readiness `ready`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Omitted `minimal` mode preserves the exact legacy projection because it has no `codex_context`; explicit `standard + minimal` fails closed.

## Approved execution boundary

Phase 6 closure authority ended with exact-head run `30033293444`. The 2026-07-24 follow-up instruction authorizes completing the remaining Phase 7 Core path: real G7-U where the connected ChatGPT surface is available, staging only the reviewed Phase 7 scope, one concise English commit, ordinary push, and bounded exact-head CI diagnosis/repair cycles. It does not authorize Phase 7B/7C dependencies or installs, npm release, deployment, npm registry credentials, Tasks 4B1–4B6, `workspace`, force push, destructive history, credential migration, Phase 8+, or unrelated scope.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness is represented by exact renewable `worker-lease.json` evidence for `running` and `finalizing`. Every lease publication, including the first, is observational and cannot suppress task execution or authoritative result publication. The renewal timer remains referenced so it keeps the worker alive until `result.json` is published, then `stopLeaseRenewal()` clears it. A lease is non-authorizing: stop still requires exact live process identity, and a crashed worker becomes stale after lease expiry. Lease persistence is synchronous and atomic; synchronous and asynchronous atomic JSON replacement share one bounded retry policy for transient Windows replacement-sharing failures. A failed periodic lease publication retries after one second instead of waiting a full 15-second renewal interval.
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
- Phase 7 Core is implemented locally behind explicit `standard` Contract V5=52: owned-worker builtin JS/TS, symbol-or-position `semantic`, honest lexical quality labels, and server-owned rename plans applied only through the Policy Kernel/Phase 3 transaction. Approval binds `semanticFactsDigest`; stable identity/path/hash reaches the lock-held second inspection.
- Every Core workspace semantic read uses canonical same-handle access with `nlink === 1`; cached results revalidate exact source inventory, identity, and SHA-256 before reuse. Serena is Phase 7B; direct LSP is Phase 7C only for a named unmet language need. External same-user Providers have no execution, filesystem, or network isolation guarantee.

## Verification evidence

- Phase 3 closure heads passed runs `29441752493` and `29443158835`; reduced Phase 4 passed `29603060944`; Phase 5 passed `29698209894`.
- Gate X follow-up head passed exact-head run `29780813295`; the post-Phase-5 runtime base `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` passed run `29925944942`.
- Phase 6 implementation, live ChatGPT G6-M/G6-U acceptance, default activation, doctor alignment, compatibility repair, and complete local closure are recorded in STEP-390 through STEP-394 of `docs/memory/archive/phase-6.md`.
- STEP-395 through STEP-400 repair evidence and failed exact-head progression are preserved in `docs/memory/archive/phase-6.md`; STEP-401 and exact closure run `30033293444` are recorded in `docs/memory/archive/phase-6-part-2.md`.
- STEP-399 documentation gates: repository policy passed; auth/package focused tests passed 8/8; repository-wide Markdown link audit passed 125 files with zero broken links before final archive reconciliation.
- STEP-403 routes source-checkout help through the public entry and binds the npm `codexgpt` bin to that entry. Managed Node 20/24 focused tests passed 14/14 per major, build passed on both, and detached Smoke passed all eight domains on both.
- STEP-405 repairs the only failed gate from publication run `30040766710`: the Windows Node 20 lease-refresh fixture now proves its child reached the release branch, explicitly exits that fixture, and observes the terminal result through the lease boundary plus grace. Managed Node 20/24 focused lifecycle tests passed 17/17 per major.
- STEP-406 repairs the only failed gate from exact-head run `30042788160`: the finalization-observation integration test no longer manufactures a stale worker identity that makes retention wait before result publication. The real detached worker still proves an exact finalizing lease or authoritative successful result, then its terminal state. Managed Node 20/24 focused lifecycle tests passed 17/17 per major.
- STEP-407 repairs the only failed gate from publication run `30044475015`: Windows Node 20 timed out while that integration test concurrently polled the lease/result replacement window, then later detached checks cascaded behind the stuck worker. The lifecycle test now proves the authoritative result without racing those replacements; the exact bounded finalizing-lease contract remains deterministically covered in `runner-process-identity`. Managed Node 20/24 focused lifecycle plus identity tests passed 23/23 per major.
- STEP-408 Gate G7-X evidence: the affected Phase 7/transaction suite passed 80/80 per managed Node major; strict repository latency passed; build passed on Node 20/24; ordinary run `2026-07-24T07-24-01-829Z-phase7-core-ordinary-final-r2-34f8955d` passed 1,218/1,220 with 2 established skips per major; Smoke run `2026-07-24T07-47-39-512Z-phase7-core-smoke-final-b56c3f08` passed all eight domains per major; policy, package dry-run, high/critical advisory, link, secret-pattern, and diff checks passed.
- STEP-409 publication head `2fe59314dde9300fe08a59776e96bbaf9408cb7b` triggered run `30077724891`; Ubuntu Node 20/24 exposed inode reuse in the replaced-parent semantic race. Parent identity now includes object generation (`birthtimeNs`, fail-closed `ctimeNs` fallback); managed Node 20/24 build and 25 affected tests pass.
- STEP-410 repair head `0a0b495be8a846fe3ad81090bfd71172c411c9e1` triggered run `30078316551`: Ubuntu Node 20 passed completely, while Ubuntu Node 24 timed out three detached-runner lifecycle fixtures under runtime-default cross-file concurrency. The authoritative launcher now keeps the main non-Windows suite concurrent but runs the five process-owning lifecycle files afterward with `--test-concurrency=1`; managed Node 20/24 lifecycle verification passed 51/51 per major without changing product timeouts.
- STEP-411 head `65084e71568f046d9d299d4a41a0d63c70d96f10` reached run `30079058827`: Ubuntu 20/24 and Windows 20 passed, but Windows Node 24 twice timed out the deliberately sabotaged lease-refresh fixture. The lease publisher now rejects a non-ordinary or linked target as `WORKER_LEASE_PATH_UNSAFE` before atomic rename retries; managed Node 20/24 lifecycle verification passed 52/52 per major and Node 24 repeated the affected pair 12/12.
- STEP-412 head `677107d61c4aa430e83a0241b2fdb8bacfc85a67` reached run `30081603749`: Repository policy, Ubuntu 20/24, and Windows 24 passed; Windows Node 20 timed out retention while deleting a terminal run whose exact worker was still exiting. Retention now verifies worker identity and defers deletion while that worker remains alive; managed Node 20/24 lifecycle verification passed 53/53 per major.

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
- Phase 7 Core is not formally closed or published: real ChatGPT G7-U, clean-install/exact-head CI, stage/commit/push, and release were not performed. Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings but retains two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Publish the reviewed Phase 7 Core candidate and bind its exact head to the complete CI matrix. Run real ChatGPT Gate G7-U after one **Scan Tools** refresh or App recreation when that UI surface is available; retain the old 51-tool migration check, and do not mark formal closure without it.
2. Keep Serena/LSP, Tasks 4B1–4B6, `workspace`, Phase 8, release/deployment, and toolchain-root migration deferred; never reinterpret ambient process/worktree/Provider mechanisms as a sandbox.

## Recent summaries

- **STEP-412 - Defer pruning live terminal workers:** distinguish terminal evidence from worker exit and retain/defer deletion until exact process identity is gone, preventing Windows open-handle stalls from blocking a newer result.
- **STEP-411 - Fail closed before unsafe lease replacement:** preflight the observational lease target as an absent or single-link ordinary file so directory/symlink replacement cannot delay authoritative result publication through Windows rename retries.
- **STEP-410 - Isolate detached-runner lifecycle tests:** keep the main non-Windows suite concurrent while serializing only five process-owning test files, eliminating Node 24 CI starvation without widening any timeout.
- **STEP-409 - Bind parent directory object generation:** publish the first Phase 7 candidate, diagnose Ubuntu inode reuse in the lock-held replaced-parent race, and bind parent identity to canonical path, device, inode/file ID, and creation generation with a fail-closed fallback.
- **STEP-408 - Complete Phase 7 Core local G7-X:** finish docs and integration, repair cross-workspace cancellation, user-error classification, exact project caching/revalidation, worker reuse, dependency inventory drift, latency, and mutation-writer inventory; pass managed Node 20/24 ordinary and Smoke.
- **STEP-407 - Separate finalizing-lease identity from result publication:** remove the timing-race observer from the integration test, retain its real detached-result assertion, and keep lease semantics in the deterministic identity suite.
- **STEP-406 - Remove synthetic finalization timing:** keep the real detached-run observation and terminal assertions, but remove the impossible stale-run fixture that caused the Windows Node 20 CI timeout.
- **STEP-405 - Stabilize the Windows lease-refresh test:** prove the fixture child completes, preserve the final-result assertion, and wait through the lease boundary plus grace before reporting a test failure.
- **STEP-403 - Keep public help on the supported entry:** replace the direct inner-CLI example, bind the runtime output and npm bin through a permanent regression, and pass managed Node 20/24 focused, build, and Smoke gates.
- **STEP-402 - Reconcile Phase 6 closure knowledge:** remove stale open-gate claims from active plans, align Phase 7's compatibility baseline, verify rules/links/size boundaries, and leave runtime help drift for explicit authorization.
- **STEP-401 - Close Phase 6 on the exact published head:** bind `31631676fe254962a9a4f14d6e025e3edba82b8d` to successful run `30033293444` and end the Phase 6 closure authority.
- **STEP-400 - Stabilize Windows runner completion observation:** align test observers with the production state machine and lease boundary and pass complete local Node 20/24 gates.

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
- [Closed Phase 6 Volume 1 — STEP-386 through STEP-400](docs/memory/archive/phase-6.md)
- [Closed Phase 6 Volume 2 — STEP-401](docs/memory/archive/phase-6-part-2.md)
- [Active Phase 7 design and Core implementation — STEP-399 onward](docs/memory/archive/phase-7.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.

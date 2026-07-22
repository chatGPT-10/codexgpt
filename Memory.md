# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-22.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Pull request #4 passed exact-head run `29773470293` at `b85286def95592cf5fa7ce552adcc1043106e5af` and was squash-merged to `main` as `afed823dc8a8cca187d7678cb4e33895de158c57`.
- STEP-379/380 was published as `d8edadc4eb8fca917b06d669e8fa0e3627d237cb`; failed run `29778608848` is retained only as diagnosed evidence for the invalid equal ConPTY worker/RPC deadline.
- Follow-up head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4` preserves the 60-second worker deadline, hard-bounds shutdown/drain cleanup, and passed exact-head CI run `29780813295` across Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package.
- `D:\Dev\codexpro` has one registered worktree. Before the STEP-381 documentation reconciliation, local `main` and `origin/main` were synchronized at runtime closure head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4`; `.ai-bridge` contained only ignored local evidence.
- STEP-382 was committed and pushed as `19bf635f32cc84eabd6eac91892e01fd3d9d515f`; exact-head run `29906441541` exposed Node 24 detached-run lease starvation on Ubuntu and Windows while Node 20 passed.
- STEP-383 was committed and pushed as `3f2c962f8aa6754490e6b3393e5ca60a5451cc0e`. Exact-head run `29910197587` proved the synchronous lease path fixed Ubuntu Node 24, but Windows Node 20/24 still produced false stale state when transient replacement sharing conflicts exhausted a lease refresh.
- STEP-384 adds a bounded 500 ms retry window only for `EACCES`, `EBUSY`, and `EPERM` during synchronous lease replacement. The repair is verified locally and awaits publication/exact-head CI.

## Approved execution boundary

STEP-379/380 publication and exact-head closure are complete. Phase 6 remains frozen by the current user instruction; do not begin it until explicitly resumed. Tasks 4B1–4B6 and `workspace` remain deferred. Destructive data/history changes, production deployment, credential handling, and silent scope expansion remain excluded.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness is represented by exact renewable `worker-lease.json` evidence for `running` and `finalizing`. A lease is non-authorizing: stop still requires exact live process identity, and a crashed worker becomes stale after lease expiry. Lease persistence is synchronous and atomic, with bounded retries only for transient Windows replacement-sharing failures, so cleanup/retention pressure cannot manufacture stale state.
- `scripts/test-domains.mjs` is authoritative. Connector-backed local regression uses `ordinary`; destructive control/all execution requires CI or a proven independent native terminal. There is no `npm test` script.
- Focused tests and tasks use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>`. Cleanup deletes only exact verified dead-owner temporary roots and terminal run evidence.
- Mutation inventory is fail-closed and binds direct filesystem primitives to repository path, syscall type, and semantic call identity. Atomic production paths cannot fall back to legacy writers.
- With `inheritEnv=false`, Windows child environments preserve only bounded required user/system paths; do not copy `GH_TOKEN` or arbitrary API variables. `CODEXGPT_INHERIT_ENV=1` is trusted-repository opt-in.
- `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain protected; compatibility loaders use exact fail-closed in-memory substitutions.
- Runtime-relevant pushed SHAs require the complete exact-head matrix. Documentation-only changes require repository policy and document integrity checks.

## Verification evidence

- Phase 3 closure heads passed runs `29441752493` and `29443158835`; reduced Phase 4 passed `29603060944`; Phase 5 passed `29698209894`.
- STEP-363 local ordinary regression passed 1,096 tests per managed Node major with zero failures and two established skips; cleanup removed 157 obsolete terminal runs without invalid paths or deletion failures.
- STEP-367 local verification passed build, policy, diff integrity, the 521-entry package dry-run, 25/25 affected tests, and five consecutive immutable-snapshot reproducer runs.
- STEP-373 through STEP-376 local verification passed runner suites 33/33 and Windows process-host control 10/10 on both managed Node majors; cleanup/process-identity passed five consecutive Node 24 runs at 20/20.
- STEP-378 deterministic regression failed before the fix and passed afterward; affected cleanup, identity, operational, mutation, and atomic suites passed 36/36 on native Node 20 and Node 24.
- STEP-378 complete ordinary regression passed on both Node majors: 1,104 tests, 1,102 passed, zero failed, and two established skips per major. Workspace-contained TEMP required `GIT_CEILING_DIRECTORIES` at the repository root to preserve non-repository test semantics.
- Exact-head PR run `29773470293` passed the complete matrix and authorized the unchanged squash merge.
- Main push run `29774932378` is diagnosed failure evidence: its sole failure was the Windows Node 20 test waiting exclusively for optional `finalizing` lease publication; production behavior remained covered by the adjacent forced lease-failure regression.
- STEP-379 lifecycle verification passed 15/15 on managed Node 20 and Node 24; Node 20 also passed three earlier consecutive 15/15 stress runs, and the final exact-evidence publication rerun passed 15/15 on both majors.
- STEP-379 initial publication gates passed: diff integrity, TypeScript build, repository policy, 529-entry package dry-run, 119-file Markdown link audit with `BROKEN_COUNT|0`, exact three-file scope, and added-line secret review.
- Run `29778608848` bounded evidence proved the first failure was `HOST_REQUEST_TIMEOUT` in the cold ConPTY close-fatal control path. The inner worker remained bounded at 60 seconds but the outer RPC had no budget for up to 20 seconds of Job/output cleanup. The follow-up keeps the 60-second worker limit, hard-bounds termination and output drain at 10 seconds each, assigns an 85-second outer RPC budget, and rejects real worker timeout as `CONPTY_WORKER_TIMED_OUT` instead of false close-fatal success.
- Follow-up local regression passed 21/21 affected manifest/protocol/package/domain tests and 15/15 lifecycle tests on each verified Node major.
- Exact-head run `29780813295` verified head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4` with status `completed`, conclusion `success`, and every non-skipped job successful; bounded failure-evidence uploads were correctly skipped in successful jobs.
- Final synchronization confirmed a clean checkout, exact local/remote head equality, one registered worktree, and ignored-only `.ai-bridge` evidence.
- STEP-382 TDD regressions passed 19/19 on verified Node 20.20.2 and 19/19 on Node 24.15.0; builds passed on both. Exact detached ordinary run `2026-07-22T08-29-16-832Z-step382-ubuntu-install-regression-ordinary-76566a78` passed 1,105/1,107 with zero failures and two established skips per major, with complete untruncated stdout and zero stderr. Package dry-run retained 529 files.
- STEP-383 affected lifecycle/atomic/mutation tests passed 30/30 on each verified Node major. Exact detached ordinary run `2026-07-22T09-33-21-984Z-step383-node24-ci-repair-ordinary-55fdc886` passed 1,107/1,109 with zero failures and two established skips per major, cleaned temporary state, retained complete stdout, and produced zero stderr.
- STEP-384 affected tests passed 31/31 on each verified Node major. Exact detached ordinary run `2026-07-22T10-21-21-141Z-step384-windows-lease-retry-ordinary-bc0425da` passed 1,108/1,110 with zero failures and two established skips per major, cleaned temporary state, retained complete stdout, and produced zero stderr.

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

## Open items

1. Keep Phase 6 frozen until the user explicitly resumes it; the prior conditional Phase 6–8 authorization does not override the current pause.
2. Keep Tasks 4B1–4B6 and `workspace` deferred; do not reinterpret Git/worktree mechanisms, ConPTY, or lifecycle leases as a sandbox.
3. Treat migration from `%LOCALAPPDATA%\CodexPro\toolchains` to the default `CodexGPT` toolchain root as separate unplanned maintenance requiring approval.
4. For any future runtime-relevant head, require the complete exact-head Ubuntu/Windows Node 20/24 matrix before closure.

## Recent summaries

- **STEP-384 - Retry transient Windows lease replacement:** retain the synchronous atomic lease path and add a bounded retry window for Windows sharing violations without extending lease duration or weakening stale detection.
- **STEP-383 - Preserve Node 24 runner leases under CI pressure:** move the small observational lease to synchronous atomic replacement so cleanup/retention filesystem congestion cannot create false stale runs.
- **STEP-382 - Ubuntu install hardening:** execute the public CLI through npm symlinks, keep managed Cloudflared immutable during tunnel runs, hide public credential URLs from automatic logs, and preserve explicit local reveal/copy actions.
- **STEP-381 - Neat-freak closure reconciliation:** record successful follow-up head/run, remove completed release work from open items, align the master plan and project rules with closed Phase 5 and frozen Phase 6, and preserve the clean single-worktree boundary.
- **STEP-380 - Publication and deadline follow-up:** publish the STEP-379 oracle correction, diagnose the Windows Node 24 ConPTY deadline race without blind rerun, and close replacement head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4` with successful run `29780813295`.
- **STEP-379 - Align finalization test oracle:** accept either an exact optional `finalizing` lease or the authoritative result that supersedes it, while retaining stale and nonzero-exit failures.
- **STEP-378 - Preserve terminal publication after lease-refresh failure:** keep lifecycle lease writes observational, add a deterministic pre-fix failure regression, and replace a fixed path-replacement cleanup delay with exact worker-exit observation.
- **STEP-377 - Neat-freak reconciliation:** compress the project-memory index below its practical size target, record exact PR/CI state, add the lifecycle-lease invariant to project rules, and remove relative-time wording from active specifications.
- **STEP-376 - Remove fixed terminal override:** route the final lifecycle integration call through the common lease-bound observation helper.
- **STEP-375 - Lease-bound test observation:** use lease expiry, not a shorter arbitrary deadline, as the test oracle for a lost detached worker.
- **STEP-374 - Deterministic private-stdin command-line proof:** query the current PowerShell command line in-process instead of through timing-sensitive CIM.
- **STEP-373 - Renewable worker lifecycle lease:** persist exact non-authorizing running/finalizing state so temporary OS-process observation gaps cannot create false stale runs.
- **STEP-367 - Gate X private tree derivation:** compute both old and new approved stage trees inside one private immutable integration bundle and reject ordinary post-review `write-tree`.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Active interphase maintenance Part 4 — STEP-376 onward](docs/memory/archive/interphase-maintenance-part-4.md)
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

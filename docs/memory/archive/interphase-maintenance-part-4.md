# Interphase Maintenance Archive — Part 4

This append-only volume continues interphase maintenance after the closed Part 3 volume.

## 2026-07-20 — STEP-376: Remove the remaining fixed terminal-wait override

**Status:** Implemented during final branch verification; pending exact-head and post-merge CI.

**Goal:** Ensure every detached-run terminal observation in the lifecycle-lease regression uses the lease-bound test oracle introduced by STEP-375.

**Failure evidence:**

- The final PR worktree verification still failed `worker advances its exact lifecycle lease before delayed retention completes` after approximately 26 seconds.
- The shared helper had been corrected to use `WORKER_LEASE_MS + 30_000`, but this one call site still passed an explicit `20_000`, bypassing the new contract.
- The worker had already published phase `finalizing`; only the test's local terminal deadline expired.

**Implementation summary:**

- Removed the explicit 20-second override so the integration regression uses the common lease-bound terminal deadline.
- Production runner code, lease duration, renewal interval, process ownership, stop authorization, and retention behavior are unchanged.

**Verification:**

- Native Windows Node 24 complete task-cleanup lifecycle file: 14/14 passed.
- Native Windows Node 20 complete task-cleanup lifecycle file: 14/14 passed.

**Adversarial review:**

- The test still fails immediately on `stale`; it does not convert a lost worker into success.
- Successful runs return as soon as terminal state appears, so the larger upper bound adds no normal-case delay.
- No skip, retry loop, or production timeout was added.

**Rollback:** Revert STEP-376 to restore the obsolete local 20-second override and scheduler-dependent failure.

**Next step:** Run final repository gates, publish the exact correction head, require the complete matrix, squash-merge only on unchanged head, then require the resulting `main` push matrix to pass.

## 2026-07-20 — STEP-377: Neat-freak knowledge and rules reconciliation

**Status:** Completed as an uncommitted documentation/rules cleanup in an isolated worktree based on pull request head `956f54e13e402dea89ce64dbb39eafc73f3e31f9`.

**Goal:** Reconcile project memory and rules with the actual open pull request, reduce the memory index below its practical loading target, remove relative-time wording from active specifications, and leave a clean handoff for the remaining CI repair.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md`
- `docs/memory/archive/interphase-maintenance-part-4.md`

**Findings and implementation:**

- `Memory.md` was 142 lines / 21,675 bytes: below the hard 200-line/25-KB ceiling but above the practical 18-KB target. Stable mechanisms already enforced by `AGENTS.md` and phase documents were graduated out of the index; the result is 109 lines / 11,322 bytes.
- Pull request #4 remains open and unmerged at exact head `956f54e13e402dea89ce64dbb39eafc73f3e31f9`.
- Exact-head CI run `29762977209` completed with failure. Repository policy, Ubuntu Node 20/24, and Windows Node 20 passed; Windows Node 24 failed Regression, so that job skipped Smoke and Package. No merge or Phase 6 claim is permitted.
- The pull-request description still names an obsolete exact head and earlier detached-run model. This external GitHub state was recorded as an open item rather than modified without an explicit request.
- Added the durable rule that `worker-lease.json` is exact, renewable, observational only, and cannot authorize stop or deletion; tests must not declare worker loss before lease expiry.
- Replaced two relative-time phrases in active specifications with absolute or implementation-relative wording.
- Active Markdown contains no broken relative links and no active-project `CodexPro` namespace residue outside append-only historical archives.

**Verification:**

- `git diff --check`: passed; only the expected LF-to-CRLF working-copy warning for `Memory.md` was emitted.
- Repository-wide tracked Markdown relative-link audit: `BROKEN_COUNT|0`.
- Active Markdown relative-time scan outside append-only archives: zero matches after correction.
- `npm run policy:check`: `Repository operational policy: PASS`.
- No runtime source, test, workflow, package metadata, credential, or external GitHub state was changed.

**Adversarial review:**

- The cleanup does not convert the failed CI run into success or hide the Windows Node 24 blocker.
- The lifecycle-lease rule narrows future changes: it records non-authorizing observation semantics and keeps stop authority bound to exact live process identity.
- The memory reduction removes duplicated stable detail, not active constraints, open blockers, archive links, or rollback-critical evidence.
- Work occurred in an isolated managed worktree; the operator checkout, branch history, staging area, pull request, and remote refs were not modified.

**Rollback:** Revert STEP-377 documentation changes. Runtime behavior is unaffected.

**Next step:** Inspect the bounded Windows Node 24 failure evidence from run `29762977209`, fix the first underlying error without blind reruns, then publish one reviewed correction head and require the full exact-head and post-merge `main` matrices.

## 2026-07-20 — STEP-378: Preserve terminal publication after observational lease-refresh failure

**Status:** Implemented and locally verified; pending one scoped publication commit, exact-head CI, squash merge, and post-merge `main` CI.

**Goal:** Fix the first underlying Windows Node 24 failure from exact-head run `29762977209` without extending leases, adding retries, or weakening process ownership.

**Files changed:**

- `scripts/long-task-runner.mjs`
- `test/task-cleanup-lifecycle.test.mjs`
- `test/runner-process-identity.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-4.md`

**Failure evidence and root cause:**

- Run `29762977209` passed Repository policy, Ubuntu Node 20/24, and Windows Node 20. Windows Node 24 failed `detached tasks use an owned TEMP tree and remove it before terminal completion` after 65.95 seconds and `terminal detached-run evidence is automatically pruned to the configured retention count` after 67.55 seconds; both observed `status: stale`.
- The worker awaited two `finalizing` updates to the renewable `worker-lease.json`. That file is observation-only, but any atomic replacement failure propagated out of `worker()` before `result.json` was written.
- The previous valid lease then expired after 60 seconds, producing the delayed false-stale signature. Terminal result publication, not lease renewal, is authoritative.

**Implementation:**

- Finalizing-phase lease refreshes are best-effort. A failed observational write no longer suppresses cleanup, log publication, retention, or authoritative `result.json`.
- Initial running-lease publication remains mandatory before child setup. Lease schema, 60-second bound, 15-second renewal, exact evidence matching, process identity, stop authorization, directory validation, retention, and result/stopped precedence are unchanged.
- Added a deterministic worker regression that replaces the lease target after the initial running lease and then releases the child. Before the fix, no result appeared within 10 seconds; after the fix, the exact result publishes with exit code zero.
- Replaced the path-identity regression's fixed 1.6-second cleanup delay with exact worker-process exit observation and bounded filesystem cleanup retries. This removes an independent Node 24 teardown race without changing production behavior.

**Verification:**

- Deterministic regression: failed before the production fix, then the complete cleanup lifecycle file passed 15/15.
- Native Windows Node 20 and Node 24 affected suites (`task-cleanup-lifecycle`, `runner-process-identity`, `operational-reliability`, `mutation-architecture`, and `atomic-file`): 36/36 per major.
- Complete ordinary Node 20: 1,104 tests, 1,102 passed, zero failed, two established skips; duration 860,506 ms.
- Complete ordinary Node 24: 1,104 tests, 1,102 passed, zero failed, two established skips; duration 417,529 ms.
- The first detached ordinary attempt did not execute tests because the selected workspace-local TEMP base did not exist. The next attempt exposed six non-repository contract failures because TEMP was inside the repository and Git discovered the parent worktree. The successful runs kept TEMP under ignored `.ai-bridge/` and set `GIT_CEILING_DIRECTORIES` to the repository root boundary, preserving non-repository test semantics without writing outside `D:\Dev\codexpro`.

**Adversarial review:**

- Lease write failure does not set success; it only stops an observation-only record from blocking the later authoritative result. Any result, log, directory, cleanup, or retention failure still follows its existing failure path.
- Stop remains impossible without re-reading exact worker evidence and proving current OS process identity. A lease still grants no stop, deletion, filesystem, command, or child-process authority.
- A crashed worker still becomes stale after its last authentic lease expires. No lease duration, timer, test skip, production timeout, blind retry, or fallback was added.
- Directory replacement remains rejected before replacement metadata is trusted; the test now waits for the exact worker to exit instead of guessing a wall-clock delay.

**Rollback:** Revert the STEP-378 production and test changes. This restores the known condition where a finalizing lease-refresh failure can suppress `result.json` and become stale after lease expiry.

**Next step:** Complete final build, policy, package, and diff gates; publish one scoped correction head; update pull request #4; require the exact-head matrix; squash-merge only on unchanged head; require the resulting `main` push matrix; then synchronize `D:\Dev\codexpro` to `main`.

## 2026-07-20 — STEP-379: Align delayed-finalization test observation with authoritative result precedence

**Status:** Implemented and locally verified on `main`; pending one direct main correction push and the resulting exact-head matrix.

**Goal:** Correct the sole failure from post-merge main CI run `29774932378` without changing production lifecycle behavior or weakening stale detection.

**Files changed:**

- `test/task-cleanup-lifecycle.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-4.md`

**Failure evidence and root cause:**

- Pull request head `b85286def95592cf5fa7ce552adcc1043106e5af` passed exact-head run `29773470293` across Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package.
- Pull request #4 was squash-merged unchanged as `afed823dc8a8cca187d7678cb4e33895de158c57`.
- Main push run `29774932378` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24. Windows Node 20 failed only `worker advances its exact lifecycle lease before delayed retention completes` after 66.68 seconds while waiting for `worker-lease.json` phase `finalizing`.
- STEP-378 intentionally made finalizing lease refresh best-effort because the lease is observational and `result.json` is authoritative. The test retained the obsolete assumption that every valid completion must expose the optional finalizing lease before result publication.

**Implementation:**

- Added one bounded finalization observer that accepts only an active `finalizing` lease proven by the production `workerLeaseActive(...)` evidence binding, or authoritative `result.json` for the current run with `exitCode = 0`.
- Renamed the regression to state the actual invariant: worker finalization remains observable through an exact lease or authoritative result.
- A stopped record, mismatched result ID, or nonzero result fails immediately. Missing or temporarily malformed JSON is retried only inside the lease-bound window; all other I/O errors remain visible.
- When a finalizing lease is observed, status must remain `terminal_publication_in_progress` or already be a successful completed result. When result wins the race, its run ID and zero exit code are verified.
- The existing forced lease-refresh-failure regression remains adjacent and proves that result publication succeeds when the lease path cannot be updated.
- Production code, lease duration, renewal cadence, stop authority, directory identity, retention behavior, and terminal precedence are unchanged.

**Verification:**

- Native Windows Node 20 complete lifecycle file: 15/15 passed, followed by three consecutive additional passes at 15/15 each.
- Native Windows Node 24 complete lifecycle file: 15/15 passed.
- After final review tightened lease evidence matching, the exact retained toolchain matrix at explicit legacy root `%LOCALAPPDATA%\CodexPro\toolchains\` passed 15/15 on Node 20.20.2 and 15/15 on Node 24.15.0.
- Final publication gates passed: `git diff --check`; `npm run build`; `npm run policy:check` with `Repository operational policy: PASS`; `npm pack --dry-run --json` with 529 entries and no test, `.ai-bridge`, credential, or local-path payload; and a 119-file Markdown audit with `BROKEN_COUNT|0`.
- Final scope remained exactly `Memory.md`, `docs/memory/archive/interphase-maintenance-part-4.md`, and `test/task-cleanup-lifecycle.test.mjs`; the added-line secret scan found only descriptive words, not authentication material.
- The corrected delayed-finalization regression completed in approximately 10.6–10.9 seconds rather than waiting for the 60-second lease bound.

**Adversarial review:**

- The correction does not accept `stale`, stopped, malformed, foreign, mismatched, expired, or nonzero terminal states.
- It does not turn a timeout into success; the observer remains bounded by `WORKER_LEASE_MS` and throws if neither valid lease nor result appears.
- Foreign, mismatched, expired, or structurally incomplete leases cannot satisfy `workerLeaseActive(...)`; malformed JSON can only delay observation until timeout or valid replacement.
- Result-first acceptance follows the production authority order introduced by STEP-378 rather than weakening the lifecycle contract.
- A normal finalizing lease receives the same schema, run, worker identity, timestamp, expiry, and phase checks as production state evaluation.

**Rollback:** Revert STEP-379 test and memory changes. This restores the obsolete lease-only oracle and can reproduce the Windows Node 20 CI failure even when authoritative completion is valid.

**Next step:** Publish the resulting atomic closure commit to `main` without force, bind its exact CI run, and require the complete matrix before final synchronization.

## 2026-07-20 — STEP-380: Neat-freak reconciliation after STEP-379 local verification

**Status:** Completed locally as a documentation and handoff cleanup; STEP-379 remains uncommitted and unpushed.

**Goal:** Reconcile project memory and rules with the actual post-merge repair state without widening the three-file correction scope or changing runtime behavior.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-4.md`

**Implementation:**

- Corrected the open-item list so completed Node 20/24 lifecycle verification is no longer presented as pending.
- Recorded the exact local boundary: `main` remains at `afed823dc8a8cca187d7678cb4e33895de158c57`, and the STEP-379 test plus memory/archive changes are uncommitted and unpushed.
- Added the completed STEP-379 verification evidence to the concise index and retained final build, policy, package, diff, scope, and secret checks as the next gate.
- Audited user-facing README/security/network documentation and made no changes because STEP-379 modifies only a test oracle; authentication, Cloudflare Tunnel, Host/Origin enforcement, CLI behavior, and package usage are unchanged.
- Preserved all pre-existing user changes and did not stage, commit, push, delete, rename, or modify external state.

**Verification:**

- Tracked Markdown inventory: 119 files; relative-link audit reported `BROKEN_COUNT|0`.
- Active Markdown relative-time scan outside append-only archives returned zero matches.
- Active old-name review found the intentional checkout path `D:\Dev\codexpro` and the separately retained verified toolchain root `%LOCALAPPDATA%\CodexPro\toolchains\`; no user-facing product namespace or package payload was changed.
- Required rule references for the public entry, toolchain manager, test-domain runner, master plan, and Phase 4/5 design documents all exist.
- `npm run policy:check` passed with `Repository operational policy: PASS`; `git diff --check` passed.
- Secret-looking added-line scan returned no matches.
- Before this cleanup, `AGENTS.md` was 149 lines / 15,788 bytes, `Memory.md` was 94 lines / 12,585 bytes, and this active archive was 111 lines / 13,715 bytes. After cleanup, `Memory.md` is 96 lines / 13,081 bytes and the active archive is 136 lines / 16,682 bytes; both remain below project limits.

**Adversarial review:**

- No completed CI gate was promoted to success: main run `29774932378` remains failed until a new STEP-379 main push matrix passes.
- The cleanup does not reinterpret the optional finalizing lease as authority; `result.json` and `stopped.json` remain terminal truth, while stop still requires exact live process identity.
- `AGENTS.md` is slightly above the neat-freak skill's approximate 15-KB soft target but contains active project rules rather than historical narrative; automatic trimming would risk removing enforced constraints, so it was left unchanged.
- The append-only archive was extended rather than rewriting historical STEP-376 through STEP-379 status text.

**Rollback:** Revert only the STEP-380 memory/archive edits. The STEP-379 test correction and all runtime behavior remain unchanged.

**Next step:** Publish the resulting atomic closure commit to `main` without force and bind its exact CI run.

## 2026-07-20 — STEP-379/380 publication follow-up: separate ConPTY worker and RPC deadlines

**Status:** Diagnosed and locally verified after failed exact-head run `29778608848`; pending one new linear main commit and replacement exact-head matrix.

**Goal:** Fix the first shared Windows Node 24 failure without rerunning a failed head, extending the 60-second ConPTY worker business deadline, or accepting a timed-out worker as successful close-fatal evidence.

**Failure evidence:**

- Commit `d8edadc4eb8fca917b06d669e8fa0e3627d237cb` was pushed directly to `main` and bound to CI run `29778608848`.
- Repository policy, Ubuntu Node 20/24, and Windows Node 20 passed. Windows Node 24 Regression failed; Smoke and Package were correctly skipped.
- The first `not ok` was `persistent ConPTY keeps close fatality isolated and supports UTF-8 input, resize, ETX, and exact cleanup` with `HOST_REQUEST_TIMEOUT` after approximately 78.5 seconds.
- The later `detached tasks use an owned TEMP tree and remove it before terminal completion` failure observed `stale` after approximately 66 seconds. The STEP-379 regression `worker finalization remains observable through an exact lease or authoritative result` passed in the same job in approximately 11.1 seconds.
- The bounded artifact `ci-failure-windows-node-24` contained 1,217 tests: 1,213 passed, two failed, and two established skips. A second comprehensive ClosePseudoConsole control test later in the same serialized job passed in approximately 12.0 seconds.

**Root cause:**

- `RunConPtyProbe(...)` gives its isolated worker a strict 60-second `RunOwnedProcess(...)` deadline.
- A timeout path may then spend up to 10 seconds closing the Job-owned process and up to 10 seconds draining bounded output before the host can emit the RPC response.
- The production control test, the comprehensive control test, and `windows-process-host-spike.mjs` also used exactly 60 seconds as the outer request deadline. The outer transport could therefore kill the host before the inner bounded operation returned its terminal evidence.
- The close-hang classifier also mapped any failed worker with zero stdout to `HOST_FATAL_CONPTY_CLOSE`, including a true worker timeout. That could convert an exceeded business deadline into false expected evidence once the outer race was removed.

**Implementation:**

- Kept the isolated ConPTY worker deadline at 60 seconds.
- Hard-bounded post-timeout Job termination and output drain at 10 seconds each; ignored wait results can no longer fall through to unbounded `.Result` waits.
- Set the outer ConPTY control RPC budget to 85 seconds: 60 seconds for the worker, 10 seconds for Job shutdown, 10 seconds for output drain, and five seconds for response framing/scheduling.
- Added exact assertions that the close-hang worker did not time out and completed between the 5-second close watchdog and the unchanged 60-second worker deadline.
- Changed native failure classification so a real worker timeout returns `CONPTY_WORKER_TIMED_OUT`; only a non-timeout zero-output worker failure may represent `HOST_FATAL_CONPTY_CLOSE`.
- Updated the manifest-bound C# digest and the protocol source contract. Production process lifetimes, close watchdog, worker deadline, Job ownership, output caps, and lifecycle leases are unchanged.

**Files changed:**

- `scripts/windows-process-host.cs`
- `scripts/windows-process-host-manifest.json`
- `scripts/windows-process-host-spike.mjs`
- `test/conpty-close-order-windows-control.test.mjs`
- `test/windows-process-host-control.test.mjs`
- `test/windows-process-host-protocol.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-4.md`

**Local verification:**

- `git diff --check`, TypeScript build, and repository policy passed; policy reported `Repository operational policy: PASS`.
- Package dry-run retained 529 entries and contained no test tree, `.ai-bridge`, credential, secret, or `node_modules` path.
- Verified Node 20.20.2 and Node 24.15.0 each passed 21/21 affected manifest, native architecture, protocol, ConPTY contract, backend discovery, package, and test-domain checks.
- Verified Node 20.20.2 and Node 24.15.0 each passed the complete lifecycle file at 15/15, including the detached owned-TEMP test and the STEP-379 exact finalization observer.
- Tracked Markdown audit covered 119 files with `BROKEN_COUNT|0`; added-line authentication-material scan reported zero hits.
- `Memory.md` remained at 119 lines / 14,347 bytes. This archive remained below the 48,000-byte rollover threshold derived from the configured 60-KB direct-read limit.
- Real control/all-domain execution remains reserved for isolated CI under the repository control-domain rule.

**Adversarial review:**

- The 85-second value is an outer transport budget, not a longer worker business deadline. `workerTimedOut === false` remains mandatory.
- A cold worker that exceeds 60 seconds now fails with explicit `CONPTY_WORKER_TIMED_OUT`; it cannot pass as close-fatal evidence.
- No retry, rerun, lease extension, lifecycle success fallback, skipped control assertion, or production timeout relaxation was added.
- The later lifecycle stale failure is treated as a possible cascade from the first host/control failure until replacement CI proves otherwise; no unrelated lifecycle change was made because its modified oracle passed and both local Node majors passed 15/15.

**Rollback:** Revert this follow-up commit. That restores the equal 60-second inner/outer deadline race and the ambiguous timeout classification.

**Next step:** Run final diff/build/policy/package/document/scope checks, create a new linear commit, push `main` without force, bind the replacement exact-head CI, and require the complete matrix before synchronization.

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

# Interphase Maintenance Archive — Part 3

This append-only continuation starts at STEP-368. Earlier interphase records remain unchanged in `interphase-maintenance-part-2.md`.

## 2026-07-20 — STEP-368: Bound detached-run terminal publication observation

**Status:** Implemented on the Gate X repair branch; pending a new exact-head pull-request matrix and post-merge `main` CI.

**Goal:** Repair the independent Windows Node 24 regression failure in PR CI #119 without masking the Gate X result or weakening detached-run process identity checks.

**Files changed:** `scripts/long-task-runner.mjs`, `test/task-cleanup-lifecycle.test.mjs`, `Memory.md`, and this archive.

**Failure evidence and root cause:**

- PR CI run `29741254477` passed Repository policy, Ubuntu Node 20/24, and Windows Node 20. Windows Node 24 failed only two cleanup lifecycle tests: terminal retention and interrupted prune-claim recovery.
- Both failures observed `status: stale` immediately after an exact worker had exited but before its terminal `result.json` became visible. The runner already waits only when the persisted worker evidence exactly matches the authenticated metadata; mismatched or foreign evidence remains immediately stale.
- The one-second terminal-publication grace was shorter than the Windows Server 2025/Node 24 finalization and filesystem visibility window under the complete regression load. This was an observation race, not a failed task, unsafe process ownership, or Gate X regression.

**Implementation summary:**

- Increased the bounded terminal-publication grace from one second to five seconds, and exported the existing internal helper for direct regression coverage.
- The grace still applies only after exact worker evidence matches metadata and live process identity is no longer observed. Foreign, malformed, or mismatched worker evidence does not receive the grace and cannot block a same-kind retry.
- Added a deterministic regression that atomically publishes a terminal result after two seconds. The pre-fix one-second deadline cannot pass this test; the new bounded grace does.

**Verification:**

- Downloaded and inspected the Windows Node 24 failure artifact; it contained the same two false-`stale` assertions as the job log and no Gate X failure.
- `npm run test:focused -- test/task-cleanup-lifecycle.test.mjs test/runner-process-identity.test.mjs test/operational-reliability.test.mjs test/mutation-architecture.test.mjs` passed 28/28 on Node `v24.15.0`.
- The same four suites passed 28/28 on the preserved native Windows Node `v20.20.2` runtime.
- The complete cleanup lifecycle file passed five consecutive Node 24 runs, 12/12 each run.
- `npm run build`, `npm run policy:check`, and `git diff --check` passed.
- `npm pack --dry-run --json` passed with 521 package entries.
- One initial expanded focused invocation failed before test execution because the fresh worktree had neither `node_modules` nor `dist`; `npm ci` and `npm run build` restored the required generated and dependency state, after which the same suites passed. This was an environment-preparation failure, not a code failure.

**Risks and limitations:**

- A genuinely crashed exact worker can remain in the terminal-publication observation path for up to five seconds before being reported stale. This is a bounded diagnostic delay and does not authorize termination, mutation, or process-tree widening.
- The change does not alter task execution, cleanup ordering, retention semantics, worker identity binding, or Gate X behavior.
- The complete Ubuntu/Windows Node 20/24 matrix remains the publication authority because the failure appeared only under full Windows Node 24 CI load.

**Rollback:** Revert STEP-368 as one unit. Restoring the one-second grace also requires removing the delayed-publication regression.

**Next step:** Push the updated exact PR head, require Repository policy plus all Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package jobs, squash-merge only if the head remains unchanged, then require the resulting `main` push matrix to pass.

## 2026-07-20 — STEP-369: Exclude the preserved run before retention state evaluation

**Status:** Implemented after adversarial CI invalidated the completeness of STEP-368; pending a new exact-head pull-request matrix and post-merge `main` CI.

**Goal:** Remove the underlying detached-run self-observation cycle rather than extending its timing window.

**Files changed:** `scripts/long-task-runner.mjs`, `test/task-cleanup-lifecycle.test.mjs`, `Memory.md`, and this archive.

**Correction to STEP-368:**

- Exact-head PR CI run `29746909721` passed Repository policy but failed Ubuntu Node 20 regression. The delayed-publication regression passed, yet the same retention test still observed `stale`, and the same-kind retry test timed out.
- The five-second grace exposed the structural cause: a worker calls `pruneTerminalRuns` before writing its own `result.json`; the retention scan evaluated every run and filtered `preserveRunId` only after state evaluation. When process identity was temporarily unavailable, the worker waited for its own result publication, which could not occur until that same retention scan returned. External status polling entered the same bounded wait.
- STEP-368 remains a valid bounded terminal-publication tolerance, but it was not a complete root-cause repair by itself.

**Implementation summary:**

- `listStates` now accepts one exact excluded run ID and skips that direct child before reading metadata, verifying process identity, or waiting for terminal publication.
- `pruneTerminalRuns` passes only its existing `preserveRunId` into that exclusion. Normal list/status/clean behavior remains unchanged; no caller-selected path or wildcard is introduced.
- The retention allowance remains unchanged: the preserved current run still consumes one configured retention slot, but it cannot deadlock or delay its own finalization.
- Exported the existing retention helper for a deterministic regression. The test creates an exact-evidence nonterminal preserved run with a dead PID; the pre-fix implementation enters the five-second wait, while the fixed implementation excludes it before state evaluation and leaves the directory untouched.

**Verification:**

- Node `v24.15.0`: affected cleanup, process-identity, operational-reliability, and mutation suites passed 29/29.
- Native Windows Node `v20.20.2`: the same suites passed 29/29.
- The combined cleanup and process-identity files passed five consecutive Node 24 runs, 16/16 each.
- The preserved-run regression completed in 22 ms or less in the recorded Node 20/24 runs, proving it did not enter the five-second publication path.
- Adversarial review confirmed the exclusion is exact-name-only, applies only to the internally generated current run ID, performs no deletion or authority expansion, and leaves external cleanup scans unchanged.

**Risks and limitations:**

- The five-second exact-evidence publication grace from STEP-368 remains as bounded tolerance for genuine post-exit publication visibility. A crashed exact worker may therefore take up to five seconds to become stale.
- The preserved run is intentionally not included in invalid-state diagnostics during its own retention pass; it is not eligible for deletion in that pass and remains visible to ordinary status/list calls.
- Full Ubuntu/Windows Node 20/24 CI remains mandatory because the self-observation manifested differently under Windows Node 24 and Ubuntu Node 20 load.

**Rollback:** Revert STEP-369 to restore the previous scan order. Doing so reintroduces self-observation and must not be paired with a longer terminal-publication grace.

**Next step:** Push the corrected exact PR head, require the complete matrix, squash-merge only on the unchanged reviewed head, then require the resulting `main` push CI to pass.

## 2026-07-20 — STEP-370: Separate live identity unavailability from stale identity

**Status:** Implemented after CI #124 exposed the remaining process-observation ambiguity; pending a new exact-head matrix and post-merge `main` CI.

**Goal:** Keep a live, exact-evidence detached worker observable during transient process creation-time lookup failure without granting termination authority to an unverified PID.

**Failure evidence and root cause:**

- Exact-head run `29747796375` passed Repository policy and Ubuntu Node 20 regression, but Ubuntu Node 24 failed `detached tasks use an owned TEMP tree and remove it before terminal completion` after one five-second status wait.
- STEP-369 removed retention self-observation; the remaining path was a live worker whose exact persisted metadata/evidence matched while the platform creation-time lookup temporarily returned unavailable under full regression load.
- The previous identity function collapsed both unavailable lookup and dead/reused PID into `process_identity_mismatch`, so `runState` entered terminal publication waiting and eventually returned stale even though the PID remained alive.

**Implementation summary:**

- Exact evidence is still required first. If creation time is unavailable, the runner now performs a non-authorizing liveness probe.
- An exact-evidence live PID is reported as `running` with `identity.owned=false` and reason `process_identity_unavailable`.
- A dead PID, a readable creation-time mismatch, malformed evidence, or mismatched evidence remains stale.
- The stop path is unchanged in authority: it re-reads evidence and requires `verifyWorkerIdentity(...).owned === true` before sending any signal. The unowned-running state therefore cannot authorize termination.
- Added deterministic injected-observation coverage for live-unavailable versus dead identity outcomes.

**Verification:**

- Node `v24.15.0`: affected cleanup, process-identity, operational-reliability, and mutation suites passed 30/30.
- Native Windows Node `v20.20.2`: the same suites passed 30/30.
- Cleanup plus process-identity files passed five consecutive Node 24 runs, 17/17 each.
- The new identity regression proves an unavailable creation-time lookup plus live PID yields only unowned-running evidence, while the same unavailable lookup plus dead PID remains mismatch.

**Adversarial review:**

- The fallback executes only after schema-valid exact worker evidence matches metadata, so tampered evidence still fails immediately and does not block same-kind retry.
- PID liveness alone never sets `owned=true`; it can delay a same-kind retry but cannot authorize stop, deletion, or process-tree widening.
- A readable different creation time remains a reuse/mismatch and never receives the live-unavailable state.

**Rollback:** Revert STEP-370 to collapse unavailable and mismatched identity again. That restores the false-stale behavior under transient lookup failure.

**Next step:** Push the exact corrected head, require the complete Ubuntu/Windows Node 20/24 matrix, squash-merge only if the PR head remains unchanged, then require the resulting `main` push CI to pass.

## 2026-07-20 — STEP-371: Publish an exact bounded finalization lease

**Status:** Implemented after CI #125 exposed a post-child/pre-result window not covered by external process observation; pending exact-head and post-merge CI.

**Goal:** Represent terminal publication as durable bounded state instead of inferring it only from process visibility.

**Failure evidence:**

- Run `29748908778` passed Repository policy and both Ubuntu matrices. Windows Node 24 failed terminal retention and interrupted prune-claim recovery after 6–7 second false-stale observations.
- The worker had completed its child but had not yet published `result.json`; external PID and creation-time observation was insufficient to represent cleanup, log publication, and retention finalization reliably under full Windows load.

**Implementation summary:**

- After child completion, the worker atomically writes `finalizing.json`, bound to the same run ID, PID, nonce, creation time, command digest, and worker-command digest as exact metadata and worker evidence.
- The record carries a fixed maximum 60-second lease and is renewed after temporary cleanup/log publication immediately before retention.
- `runState` checks the exact lease before process observation and reports `running` with `owned=false` and reason `terminal_publication_in_progress` until `result.json`, `stopped.json`, or lease expiry.
- Validation rejects future-skewed, expired, non-positive, overlong, mismatched, malformed, or foreign finalization records. Result and stop records retain precedence.
- Added direct state coverage proving a dead/unobservable PID with a valid exact lease remains non-authorizing running state, while an overlong lease is rejected.
- Added a deterministic worker integration regression that installs an exact-evidence dead run to hold retention in the five-second terminal-publication path, then proves the real worker publishes `finalizing.json` before retention completes, exposes only unowned `terminal_publication_in_progress`, and eventually publishes a successful result.

**Verification:**

- Node 24 affected cleanup, process-identity, operational, and mutation suites passed 32/32.
- Native Windows Node 20 passed the same 32/32.
- Cleanup plus process-identity passed five consecutive Node 24 runs, 19/19 each.
- The direct finalization-state regression completes without process lookup and records `identity.owned=false`.
- The worker integration regression deterministically observed `finalizing.json` while `result.json` was absent during delayed retention, then observed terminal completion with exit code 0 on both managed Node majors.

**Adversarial review:**

- The lease cannot authorize stop: it never sets ownership, and the stop path independently re-verifies exact process identity before signaling.
- A crashed worker can block a same-kind retry only until the fixed lease expires; arbitrary expiry extension is rejected.
- Mismatched worker evidence prevents lease activation, so tampered evidence remains immediately stale.
- The record is written only after child completion and therefore does not weaken task execution identity or allow a foreign running task to masquerade as the reviewed worker.

**Rollback:** Revert STEP-371 to remove `finalizing.json` handling. That restores dependence on externally observable process identity during post-child finalization.

**Next step:** Push the exact head, require the complete matrix, squash-merge only on unchanged head, then require the resulting `main` push CI to pass.

## 2026-07-20 — STEP-372: Observe finalization published during the bounded terminal wait

**Status:** Implemented after exact-head CI #134 invalidated the completeness of STEP-371; pending a new exact-head and post-merge matrix.

**Goal:** Ensure a status observation that begins immediately before `finalizing.json` publication notices the exact lease when it appears, rather than returning stale after the existing bounded wait.

**Failure evidence:**

- Exact-head run `29758033578` on `2adcb6f3a3100c0cf09d879cf932e132b29557bb` passed Repository policy and complete Ubuntu Node 20/24 jobs. Windows Node 24 failed only `cleanup recovers a terminal run left in its verified prune claim after an interruption` after 6.8 seconds; the bounded artifact recorded `actual: stale`.
- `runState` read no lease, transient process observation led it into `waitForTerminalPublication`, and the worker then published a valid lease. The wait polled only `result.json` and `stopped.json`, so it ignored the newly durable finalization state and returned stale when the five-second window ended.

**Implementation summary:**

- `waitForTerminalPublication` now also reads `finalizing.json`, but accepts it only when caller-supplied metadata and worker evidence exactly activate the existing bounded lease validator.
- `runState` supplies the already authenticated exact metadata/evidence and returns unowned `terminal_publication_in_progress` when the lease appears during the wait.
- Result and stop records retain precedence. Invalid, overlong, expired, malformed, or mismatched finalization records do not end the wait and cannot authorize ownership or stop.
- Added a deterministic regression that begins the bounded observation with no terminal record, publishes an exact lease after 200 ms, and requires observation in under one second. The pre-fix helper waits to its deadline and returns no lease.

**Verification:**

- Native Windows Node 24 affected cleanup, process-identity, operational, and mutation suites passed 33/33.
- Native Windows Node 20 passed the same 33/33.
- Cleanup plus process-identity passed five consecutive Node 24 runs, 20/20 each.
- The exact regression observed the delayed lease in approximately 221 ms on both managed Node majors.

**Adversarial review:**

- The new path uses the same schema, run ID, PID, nonce, creation-time, command-digest, worker-command-digest, timestamp, and maximum-duration checks as STEP-371.
- No new persisted field, environment switch, retry, timeout extension, process authority, deletion authority, or stop authority was added.
- Result and stopped records are checked before finalization, so terminal truth cannot be downgraded to running.

**Rollback:** Revert STEP-372 only to restore the observation gap while retaining the STEP-371 lease format.

**Next step:** Re-run the affected suites and repository gates, publish one ordinary correction commit, require the complete exact-head matrix, then squash-merge only if that head remains unchanged and the resulting `main` push matrix passes.

## 2026-07-20 — STEP-373: Replace finalization timing inference with a renewable worker lifecycle lease

**Status:** Implemented after exact-head CI #135 proved that finalization-only persistence left a pre-finalization observation gap; pending a new exact-head and post-merge matrix.

**Goal:** Represent the worker's complete nonterminal lifecycle durably and with a fixed bound, instead of relying on a succession of process-observation and terminal-publication timing windows.

**Failure evidence:**

- Exact-head run `29759707664` on `d1a93691d52f075e60a3102a0ba16265b7bfb6e1` passed Repository policy and complete Ubuntu Node 24. Ubuntu Node 20 failed two detached-run tests: one same-kind retry did not publish terminal state within the 15-second test bound, and one ordinary detached task was classified stale after the five-second terminal wait.
- Both failures occurred before a finalization lease could serve as durable evidence. The underlying model still represented `running` only through instantaneous OS process observation, while `finalizing` alone had a durable lease.

**Implementation summary:**

- Replaced branch-local `finalizing.json` with one `worker-lease.json` containing exact worker evidence plus phase `running` or `finalizing`.
- The worker publishes phase `running` immediately after exact `worker-evidence.json`, before child setup, then advances to `finalizing` immediately after child completion and again before retention.
- The lease has a fixed maximum duration of 60 seconds and renews every 15 seconds through long-running child execution and finalization. Serialized atomic writes prevent an older queued heartbeat from downgrading a newer phase.
- `runState` and the bounded terminal wait accept the lease only when metadata, persisted worker evidence, run ID, PID, nonce, creation time, command digest, worker-command digest, phase, timestamps, and maximum duration all validate.
- Active lease state is always non-authorizing: phase `running` reports `worker_lease_active`; phase `finalizing` reports `terminal_publication_in_progress`. Stop still re-reads evidence and requires exact current OS process identity before signaling.
- Result and stop records retain precedence. A crashed worker can delay a same-kind retry only until the fixed lease expires.
- Increased test observation deadlines from 15 to 30 seconds to retain a finite bound while allowing full-suite scheduler contention; no production deadline was extended.

**Verification:**

- Native Windows Node 24 cleanup and process-identity suites passed 20/20.
- Native Windows Node 20 passed the same 20/20.
- Cleanup plus process identity passed five consecutive Node 24 runs, 20/20 each.
- Direct state coverage proves both running and finalizing lease phases remain unowned and that overlong records are rejected.

**Adversarial review:**

- A forged or stale lease cannot activate without the separately persisted exact worker evidence and metadata.
- The lease never widens stop, deletion, child-process, filesystem, or command authority; it only delays stale classification for at most 60 seconds after the last authentic renewal.
- Evidence tampering remains immediately stale because heartbeat records do not overwrite `worker-evidence.json`.
- Result and stopped files remain authoritative even if a heartbeat write completes after terminal publication.
- The design uses one lifecycle record rather than accumulating separate startup, running, and finalization files.

**Rollback:** Revert STEP-373 to restore the branch-local finalization-only lease and its known pre-finalization false-stale window.

**Next step:** Complete affected Node 20/24 gates, publish the exact correction head, require the complete matrix, squash-merge only on unchanged head, then require the resulting `main` push matrix to pass.

## 2026-07-20 — STEP-374: Make the private-stdin command-line proof independent of WMI timing

**Status:** Implemented after exact-head CI #135 exposed an independent Windows control-test oracle failure; pending a new exact-head and post-merge matrix.

**Goal:** Preserve the proof that PowerShell receives only the fixed encoded bootstrap on its command line while removing an unrelated, timing-sensitive CIM dependency.

**Failure evidence:**

- Windows Node 24 in run `29759707664` failed only `PowerShell execution uses script-over-private-stdin with Unicode and exact Win32 exit mapping`.
- The executed PowerShell request succeeded, but `Get-CimInstance Win32_Process -Filter "ProcessId=$PID"` intermittently returned an empty `CommandLine`, so the test could not observe `-EncodedCommand`. This was an oracle failure, not evidence that the script entered the command line.

**Implementation summary:**

- Replaced the WMI/CIM self-query with `[Environment]::CommandLine` inside the same PowerShell process.
- The assertion remains unchanged: the private script marker must be absent and the fixed encoded bootstrap flag must be present.
- Production host code, protocol, process creation, environment construction, and authority boundaries are unchanged.

**Verification:**

- Native Windows Node 24 complete `windows-process-host-control.test.mjs`: 10/10 passed.
- Native Windows Node 20 complete `windows-process-host-control.test.mjs`: 10/10 passed.

**Adversarial review:**

- The replacement observes the exact current process rather than a separately queried process table row, so there is no PID-selection or process-enumeration widening.
- The proof remains meaningful because `[Environment]::CommandLine` exposes the actual invocation string seen by the PowerShell process.
- No production fallback or test skip was added.

**Rollback:** Revert STEP-374 to restore the intermittent empty-CIM oracle.

**Next step:** Run final repository gates, publish the exact combined correction head, require the complete matrix, squash-merge only on unchanged head, then require the resulting `main` push matrix to pass.

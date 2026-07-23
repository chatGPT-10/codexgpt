# Interphase Maintenance Archive — Part 5

This append-only volume continues interphase maintenance after the closed Part 4 volume.

## 2026-07-22 — STEP-385: Keep the initial worker lease observational

**Status:** Implementation and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 remains frozen.

**Goal:** Prevent a persistent failure to publish the first `running` worker lease from aborting the detached worker after identity evidence is available but before the real task, cleanup, retention, and authoritative `result.json` publication can complete.

**Files changed:**

- `CHANGELOG.md`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `scripts/long-task-runner.mjs`
- `test/task-cleanup-lifecycle.test.mjs`

**Failure evidence:**

- STEP-384 was published as `c917a6bdb1c0dceddf62ba23bbf01d4bae9cfd53` and exact-head run `29913227391` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24.
- Windows Node 20 alone failed `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry` and `worker finalization remains observable through an exact lease or authoritative result`.
- The worker published `worker-evidence.json`, then still awaited the first `publishWorkerLease("running")` as a mandatory operation. A persistent Windows replacement-sharing conflict could therefore terminate the worker before spawning the child or publishing `result.json`.
- Later renewable and `finalizing` lease writes were already observational. The first write was the sole remaining semantic inconsistency.

**Implementation:**

- Changed the initial `running` lease publication to swallow its write failure exactly like later observational lease writes.
- The real child task still starts, owned temporary state still cleans up, logs and retention still complete, and `result.json` remains the authoritative terminal evidence.
- The 60-second lease duration, 15-second renewal interval, bounded Windows rename retry set and budget, stale classification, worker identity verification, stop authority, cleanup order, retention order, and result publication order are unchanged.
- No Node-version branch, CI-only path, timeout extension, test skip, early `completed` publication, or stale-as-running behavior was introduced.

**Deterministic regression:**

- Added a direct worker integration test that pre-creates `worker-lease.json` as a directory, permanently blocking every atomic lease replacement rather than relying on CI timing.
- The test proves `worker-evidence.json` is published first, then waits for a child-created marker to prove the child task actually started while the worker remains alive.
- The child is released with exit code `7`; the worker must publish `result.json` with that exact task exit code, `signal: null`, `error: null`, and cleaned temporary state.
- The test also proves the blocked lease path remains a directory, so success cannot come from a later lease write unexpectedly recovering.
- Before the production fix, the regression failed because the evidence existed but the child marker never appeared. After the fix, it passed.

**Verification:**

- Pre-fix TDD run: `npm run test:focused -- test/task-cleanup-lifecycle.test.mjs` produced 15 passes and the new deterministic failure.
- Current-runtime affected suites: `npm run test:focused -- test/task-cleanup-lifecycle.test.mjs test/runner-process-identity.test.mjs test/atomic-file.test.mjs` passed 27/27.
- Verified Node `v20.20.2` and Node `v24.15.0` each passed those same 27 tests and the five-test mutation inventory, for 32/32 affected tests per major.
- TypeScript build passed on both verified Node majors.
- `npm run policy:check` passed.
- `npm pack --dry-run --json` retained 529 package entries.
- `git diff --check` passed.
- Exact detached ordinary run `2026-07-22T11-19-34-671Z-step385-initial-lease-observational-ordinary-34b24faa` completed with exit code 0, cleaned temporary state, no retention failures, complete untruncated stdout, and zero stderr.
- Node 20 passed 1,109 of 1,111 tests with zero failures and two established skips. Node 24 produced the same counts.
- During terminal publication, exact status moved from `worker_lease_active` to `terminal_publication_in_progress` and then to authoritative `result_recorded`, preserving the intended ordering.

**Adversarial review:**

- A lease remains non-authorizing. Suppressing its write error cannot grant stop, deletion, workspace, or process authority.
- A missing lease does not change exact identity checks or stale classification; it only prevents an observational write failure from becoming the task outcome.
- The permanent directory blocker exercises initial, renewal, and finalizing lease failures. The exact task exit code proves no lease error is misreported as task failure or success.
- `result.json` remains after child completion, owned-TEMP cleanup, log persistence, and retention. No terminal state is published early.
- The change is the minimum semantic correction: one existing awaited observational operation now uses the same failure policy as every later lease publication.

**Risks and limitations:**

- If every lease write is persistently blocked and exact process identity is temporarily unavailable, observers may still classify an in-progress run as stale. This repair intentionally does not weaken that fail-closed status rule.
- Persistent lease failure reduces observability but cannot suppress the real task or terminal result once the worker continues running.
- Complete Ubuntu/Windows Node 20/24 exact-head CI remains the publication authority; local verification cannot close the runtime change.

**Rollback:** Revert STEP-385. This restores mandatory first-lease publication and the Windows Node 20 path where a persistent observational write failure can abort the worker before task execution and terminal result publication.

**Next step:** After explicit user approval, commit and push the five-file STEP-385 change, bind the new exact 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed. Do not rerun the failed job from run `29913227391` against the old head.

## 2026-07-22 — STEP-387: Isolate verified prune-claim recovery from detached-run setup

**Status:** Test correction and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 runtime remains blocked on a green current-base Gate G6-0.

**Goal:** Make the prune-claim interruption recovery test exercise only its claimed-directory recovery contract instead of depending on an unrelated detached worker reaching terminal state under full-suite scheduler pressure.

**Failure evidence:**

- STEP-385 was published as `e33966db4c5b6e5b0ad3a656cfc11aa3a2fb497e`.
- Exact-head run `29916845738` passed Repository policy, Ubuntu Node 20, and Windows Node 20/24. Ubuntu Node 24 failed only `cleanup recovers a terminal run left in its verified prune claim after an interruption`.
- The failure occurred after approximately 65.17 seconds in `waitForTerminal`: the setup run became `stale` after lease expiry and the bounded terminal-publication wait. The test had not yet renamed the run directory into a prune claim or invoked cleanup, so the claimed-directory recovery behavior was never exercised.
- Dedicated lifecycle tests immediately preceding this test passed in the same job, including persistent initial/refresh lease-failure coverage, finalization observation, owned-TEMP cleanup, and retention.

**Implementation:**

- Replaced the real detached-run setup with a complete direct-child schema-v2 terminal fixture containing exact directory identity, bounded worker identity fields, command metadata, stdout/stderr files, and authoritative `result.json`.
- The test then atomically renames that verified terminal directory to the exact `.codexgpt-run-prune-<32 hex>` shape and invokes the real cleanup command.
- Assertions remain fail-closed: exactly one claimed directory must be removed, no claim recovery may fail, the claimed path must be absent, and the run root must be empty.
- No production source, lease duration, stale classification, timeout, retry, skip, platform branch, or cleanup authority changed.

**Verification:**

- Verified Node `v20.20.2` and Node `v24.15.0` each passed 27/27 affected lifecycle, process-identity, and atomic-file tests.
- Both managed Node majors passed the five-test mutation architecture inventory.
- Exact detached ordinary run `2026-07-22T12-16-49-660Z-step386-claim-recovery-fixture-3d030141` completed with exit code 0, cleaned temporary state, zero retention failures, complete untruncated stdout, and zero stderr.
- Node 20 and Node 24 each passed 1,109 of 1,111 ordinary tests with zero failures and two established skips.
- TypeScript build passed on both managed Node majors, repository policy passed, the package dry-run retained 529 files, and `git diff --check` passed.

**Adversarial review:**

- The fixture still traverses the production claim-recovery path and its direct-child, canonical-path, directory-identity, terminal-record, and exact claim-name checks.
- Directory identity is captured before rename and must remain valid after the claim transition, preserving the interruption model under test.
- Removing the detached worker does not reduce lifecycle coverage because dedicated integration tests retain exact worker startup, running/finalizing lease, task execution, cleanup, retention, and result-publication assertions.
- The correction removes one unrelated failure source rather than accepting `stale`, extending a deadline, skipping a platform, or weakening cleanup validation.
- Concurrent Phase 6 edits in `AGENTS.md`, `Memory.md`, the master plan, roadmap, and two new design/plan files are separately owned and intentionally excluded from this change.

**Rollback:** Revert STEP-387 to restore the scheduler-dependent detached-run setup before prune-claim recovery. Production runtime behavior is unaffected either way.

**Next step:** Commit and push only the lifecycle test and this archive entry, bind the replacement 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed before Gate G6-0 can pass.

## 2026-07-22 — STEP-388: Retry transient asynchronous atomic replacements

**Status:** Implementation and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 runtime remains blocked on a green current-base Gate G6-0.

**Goal:** Prevent transient Windows replacement-sharing conflicts during asynchronous atomic JSON publication from terminating a detached worker before authoritative `result.json` becomes durable.

**Files changed:**

- `CHANGELOG.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `scripts/atomic-file.mjs`
- `test/atomic-file.test.mjs`

**Failure evidence:**

- STEP-387 was published as `53adffc5b8c78704abece8da0bb888a35beab4ab`.
- Exact-head run `29920749402` passed Repository policy and complete Ubuntu Node 20/24 jobs. Windows Node 20 failed `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry` after approximately 93.57 seconds and `terminal detached-run evidence is automatically pruned to the configured retention count` after approximately 67.59 seconds.
- Both failures started real detached workers successfully, then observed no authoritative terminal record before the authentic lease expired. The claim-recovery fixture introduced by STEP-387 passed on Windows Node 20 in approximately 91 ms.
- The shared unprotected boundary was asynchronous atomic JSON replacement: unlike synchronous lease replacement, `writeJsonAtomicFile` attempted one rename only. A transient `EPERM`, `EACCES`, or `EBUSY` while replacing `result.json` could therefore reject the worker's top-level async path; detached stderr is intentionally ignored, so observers later saw only stale state.

**Implementation:**

- Added one bounded asynchronous rename helper and reused the existing fixed retry policy: `EPERM`, `EACCES`, and `EBUSY`; 20 retries; 25 ms delay.
- Synchronous and asynchronous atomic replacements now share the same retry code set, retry count, and delay constants.
- Non-retryable errors still fail immediately. Exhausted transient failures still fail closed, and the exact adjacent temporary file is still identity-checked and removed.
- No lease duration, stale classification, process identity, terminal ordering, cleanup authority, test skip, platform branch, or CI-only path changed.

**Deterministic regression:**

- Added an async atomic replacement test whose injected rename returns `EPERM` twice and succeeds on the third attempt.
- Before the production change, the test rejected on the first `EPERM`. After the change, it proves three attempts, exact final JSON bytes, and no adjacent temporary residue.
- Existing permanent async rename-failure coverage still proves bounded exhaustion preserves the old target and removes the exact temporary file.

**Verification:**

- Verified Node `v20.20.2` and Node `v24.15.0` each passed 28/28 atomic-file, process-identity, and cleanup-lifecycle tests.
- Both managed Node majors passed the five-test mutation architecture inventory.
- The two Windows Node 20 CI failures passed five consecutive focused stress runs after the repair.
- Exact detached ordinary run `2026-07-22T13-08-28-930Z-step388-async-atomic-retry-b2665083` completed with exit code 0, cleaned temporary state, zero retention failures, complete untruncated stdout, and zero stderr.
- Node 20 and Node 24 each passed 1,110 of 1,112 ordinary tests with zero failures and two established skips.
- TypeScript build passed on both managed Node majors, repository policy passed, the package dry-run retained 529 files, and scoped `git diff --check` passed.

**Adversarial review:**

- The retry does not convert failure into success: only the same atomic rename is repeated, and the new target is accepted only when rename completes.
- The retry budget is fixed at at most 21 total attempts and approximately 500 ms of delay, so permanent sharing conflicts remain bounded and fail closed.
- The temporary file remains the same identity-verified object across retries; no new file, fallback copy, direct overwrite, or target clobber path is introduced.
- Applying the same bounded policy to all async atomic JSON publications also protects `worker-evidence.json`, `child.json`, `metadata.json`, and `stopped.json` without adding separate per-file mechanisms.
- No multi-agent provider was available in the workspace; the completed diff received a manual adversarial review against retry exhaustion, non-retryable errors, temporary identity drift, cleanup behavior, terminal authority, and scope isolation.

**Risks and limitations:**

- The CI artifact cannot expose the detached worker's discarded stderr, so the exact failing rename is inferred from the common terminal boundary and deterministic injected reproduction rather than directly logged from the failed hosted worker.
- A conflict lasting beyond the fixed retry budget still prevents publication and eventually produces stale state; extending the budget further would require new evidence.

**Rollback:** Revert STEP-388. This restores single-attempt asynchronous rename behavior while leaving the STEP-387 fixture isolation unchanged.

**Next step:** Commit and push only the four STEP-388 files, bind the new exact 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed before Gate G6-0 can pass.

### STEP-388 publication correction — recorded during STEP-389

- STEP-388 was committed and pushed as `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` with commit message `fix: retry transient atomic replacements`.
- Exact-head CI run `29925944942` completed with conclusion `success`; Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package all passed, and bounded failure-evidence uploads were correctly skipped.
- Local `main`, `origin/main`, and the GitHub run head resolve to the same 40-character SHA.
- This closes the runtime-base exact-head prerequisite of Phase 6 Gate G6-0. It does not authorize Phase 6 runtime implementation or the YAML production dependency, and a fresh no-conflicting-run check remains mandatory immediately before Task 6A0.

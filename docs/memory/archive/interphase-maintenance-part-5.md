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

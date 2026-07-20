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

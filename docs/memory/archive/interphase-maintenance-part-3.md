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

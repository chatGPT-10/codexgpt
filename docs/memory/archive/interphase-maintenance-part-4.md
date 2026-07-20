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

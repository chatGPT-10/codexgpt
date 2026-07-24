# Phase 7 Design and Core Implementation — Part 2

This append-only volume continues [Phase 7 Volume 1](phase-7.md) from STEP-415 so the prior volume remains below the configured direct-read rollover threshold.

## 2026-07-24 — STEP-415: Observe detached child completion before metadata I/O

**Status:** The cross-platform detached-worker terminal-event race exposed by the first STEP-414 exact-head run is repaired locally. Managed Node 20/24 focused lifecycle suites, complete ordinary, and protected Smoke pass. A replacement exact-head publication remains required.

**Goal:** Guarantee that a detached worker cannot miss a fast child `error` or `close` event while awaiting `child.json` persistence, which previously left the lease renewing but prevented authoritative `result.json` publication.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `scripts/long-task-runner.mjs`
- `test/runner-process-identity.test.mjs`

**Exact-head failure evidence:** Commit `6ec5f5ab8ccd03868954e642a557c2a1e55957a6` triggered CI run `30097613996`. Repository policy, Ubuntu Node 20, and Windows Node 24 passed. Ubuntu Node 24 timed out `detached runner retains a bounded tail and records dropped stdout/stderr bytes` and `worker finalization publishes an authoritative successful result`; Windows Node 20 timed out `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry`. Each waited 90 seconds for a terminal result while the worker process remained alive. No V5 functional test failed.

**Root cause:** In `worker()`, the task child was spawned and its stdout/stderr listeners were attached, but the worker then awaited atomic `child.json` persistence before constructing the Promise that subscribed to the child's `error` and `close` events. A fast no-output exit, a completed output flood, or an identity-probe child could close during that await. Node does not replay the terminal event to a listener added later, so the worker remained blocked on a Promise that could never settle while its observational lease continued to refresh.

**RED evidence:** Added a source-order contract proving the worker's `close` observer must occur after spawn and before the first asynchronous child-metadata write. Before implementation, `npm run test:focused -- test/runner-process-identity.test.mjs` passed 6/7 and failed only the new assertion: `worker must observe fast child termination before awaiting child metadata persistence`.

**Implementation:**

- Create the child outcome Promise immediately after spawn and stream-listener registration, before any `await`.
- Attach both `error` and `close` listeners inside that Promise and preserve the existing one-settlement guard and public outcome shape.
- Persist `child.json` only after terminal observation is already armed.
- Await the pre-created outcome Promise after metadata persistence.
- Do not change lease duration, retry interval, test deadline, log bound, process authority, retention behavior, or child command semantics.
- Reconcile `AGENTS.md` with the active 2026-07-24 Phase 7 closure authorization and encode listener-before-await as a mandatory operational rule.
- Close the first Phase 7 archive volume at STEP-414, continue in `phase-7-part-2.md`, and update the root archive index without rewriting prior history.

**Verification:**

- Current runtime focused lifecycle suite (`runner-process-identity`, `runner-log-bounds`, `task-cleanup-lifecycle`, `operational-reliability`) — 36/36 passed. The prior 90-second flood and finalization failures completed in approximately 1.16 seconds and 0.78 seconds.
- Managed Node `20.20.2` — same lifecycle suite 36/36 passed.
- Managed Node `24.15.0` — same lifecycle suite 36/36 passed.
- Ordinary run `2026-07-24T13-52-39-279Z-phase7-worker-observer-ordinary-dcfd2455` — exit 0; 1,226 tests per major, 1,224 passed and 2 established skips; zero stderr; temporary state cleaned; zero retention failures.
- Protected Smoke run `2026-07-24T14-16-31-900Z-phase7-worker-observer-smoke-50bfd1b6` — exit 0; all eight domains passed on both managed majors; zero stderr; temporary state cleaned; zero retention failures.
- Neat-freak reconciliation — current authorization, operational rules, active plan, memory index, and archive rollover now agree; no user-facing API, environment variable, setup, or runbook behavior changed, so README/security/integration documents require no update.

**Adversarial review:** The failure was evaluated against three independent surfaces: fast zero-output exit, bounded stdout/stderr flood, and identity-probe completion. All converge on the same missing-listener ordering defect. Moving observation before the first await closes all three without widening timeouts or treating leases as authorization. The outcome listener is installed once, retains the existing duplicate-event guard, and introduces no new subprocess or state writer.

**Risk and limitation:** The regression binds the required source ordering because the race depends on an event-listener-before-await invariant that is difficult to force deterministically on every scheduler. Future refactors may change syntax and must update the contract test while preserving the same ordering. The replacement exact head has not yet passed remote CI, and real ChatGPT G7-U remains unperformed.

**Rollback:** Revert the pre-created child outcome Promise and its source-order regression together. Doing so restores a scheduler-dependent permanent hang for fast detached children and is not a safe operational rollback; the supported functional rollback remains the pre-Phase-7 semantic `legacy` mode, not removal of runner correctness fixes.

**Next action:** Run final build, policy, diff, package, link, secret, scope, and size checks; stage only these six STEP-415 files; create one concise English repair commit; push normally; bind the replacement exact head to the complete CI matrix. Keep both Phase 8 files untracked and excluded. Formal Phase 7 closure still requires real ChatGPT G7-U.

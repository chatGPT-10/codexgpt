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

## 2026-07-24 — STEP-416: Repair live V5 backend acceptance blockers

**Status:** The STEP-416 code, backend HTTP MCP journeys, managed Node 20/24 focused matrix, isolated repository acceptance, authoritative ordinary, protected Smoke, and local build gates pass. Publication and exact-head CI remain required. Real ChatGPT App UI G7-U remains externally blocked and is not inferred from backend evidence.

**Goal:** Close the defects exposed by the first real V5 HTTP MCP journey without weakening strict validation, approval binding, workspace identity, atomic recovery, Git authority, or semantic resource budgets.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `scripts/codexgpt.mjs`
- `src/control/localApprovalServer.ts`
- `src/guard.ts`
- `src/policy/authorizationFacts.ts`
- `src/policy/runtime.ts`
- `src/semantic/budgets.ts`
- `src/semantic/builtin/typescriptProvider.ts`
- `src/server.ts`
- `src/tools/schemas/applyPatch.ts`
- `src/tools/schemas/semantic.ts`
- `src/transactions/recovery.ts`
- `src/transactions/workspaceLock.ts`
- `test/cli-approvals.test.mjs`
- `test/phase-7-repository-acceptance.test.mjs`
- `test/phase-7-v5-runtime-inheritance.test.mjs`
- `test/policy-resources.test.mjs`
- `test/policy-v3-approval-integration.test.mjs`
- `test/transaction-recovery.test.mjs`

**Root causes and implementation:**

- MCP SDK descriptor publication received Zod unions for `semantic` and V5 `apply_patch`, so live `tools/list` emitted empty `inputSchema` objects and wire arguments were stripped. Both tools now publish explicit raw Zod property shapes, while `semanticInputSchema` and `applyPatchInputSchemaV5` remain the exact strict operation/form validators used by the server before dispatch.
- The approval CLI resolved a legacy control directory while production approval state lives under the transaction state root. `scripts/codexgpt.mjs` now uses `resolveTransactionStateRoot()` so terminal approval targets the running production instance.
- V3 approval facts hard-coded `toolContractVersion="3"`, while V4/V5 consumption required the actual active contract. The approval protocol still has `schemaVersion=3` and `contractVersion=3`; only the inherited authorization fact and issued grant now bind the actual Tool Contract `3`, `4`, or `5`.
- `PathGuard.resolvePolicyFacts(".")` treated the parent of the workspace root as the bounded existing parent. The root object itself is now the parent identity when the target is the canonical workspace root.
- Repository-scale TypeScript references needed more old-generation heap than the prior worker ceiling, and diagnostics loaded standard libraries after references. The owned worker ceiling is 448 MB; the 64 MB workspace input budget, 2 MB response budget, and 5-second request deadline remain unchanged. Repository acceptance runs independently from the strict warm-latency suite to avoid competing CPU load; the `<= 2000 ms` warm assertion is unchanged.
- Auxiliary V4 Git status/history used for workspace summaries could fail for a valid sub-workspace that is not the repository root and previously aborted `open_workspace`. Summary-only Git failures now produce stable unavailable text. Typed Git tools and all mutation authority remain fail-closed and unchanged.
- Background transaction recovery could contend with a legitimate atomic mutation lock and propagate `TRANSACTION_BUSY` from an asynchronous path, terminating the server. Recovery now defers only when the lock layer supplies an exact `liveOwnerVerified=true` fact. The first implementation returned on every `TRANSACTION_BUSY`; adversarial review added a RED regression proving that an unverifiable live owner must still reject, then narrowed the implementation. Quarantine failure, unverifiable ownership, retry exhaustion, and every non-live-lock recovery error remain fail-closed. No permanent readiness cache exists.

**RED/GREEN evidence:**

- Live wire publication regressions verify the descriptor contains operation fields and that strict invalid combinations are still rejected.
- Approval integration proves approve-and-retry succeeds under inherited Tool Contracts 3, 4, and 5 without changing the V3 protocol version.
- Workspace-root Policy facts and sub-workspace summary regressions reproduce the prior failures and pass after the bounded fixes.
- Repository acceptance covers the actual project source inventory and sequential references plus diagnostics under the owned worker.
- Recovery contention initially passed a valid live-owner deferral test but failed the new `unverifiable live mutation ownership remains fail-closed` assertion at 6/7. After the verified-owner detail was added, build and recovery tests passed 7/7.

**Live backend acceptance:**

- U1 passed through the live HTTP MCP backend: workspace open, approval request, CLI approval, exact retry, builtin TypeScript definition, precise references, actual read, diagnostics, and ambiguous-symbol candidates. The provider reported `builtin-typescript` and semantic quality.
- U2 passed in an ignored `.hallmark/` Git fixture: preview-only rename across two files and three edits, stable pre/post-preview hashes, approval, atomic apply, TypeScript build, replay rejection, exact undo, and post-undo build.
- U3 content drift passed: an independent instance changed target content after preview, and the stale preview was rejected with `FILE_VERSION_CONFLICT` after approval.
- Same-content replacement with a distinct file object, and replaced-parent identity, are covered by deterministic lock-held regressions. They are not claimed as live ChatGPT App UI evidence.
- The available tool surface cannot operate or observe ChatGPT App **Scan Tools**, recreate the App, compare the old 51-tool snapshot, or retain user-visible UI conversation evidence. Backend HTTP MCP acceptance must not be reported as formal G7-U UI acceptance.

**Audit state:** Shared production state during an abandoned dual-instance experiment set the audit index to sticky `integrity_failed`. No evidence, segment, key, approval, transaction, or credential state was deleted or reset. A read-only diagnostic copy reverified the complete MAC chain, sequence, and segment evidence; only the original index status was atomically restored to `healthy` with `failureCode=null`. Before closure work, the live index was read-only checked as healthy at sequence 396 with one active segment. Future `integrity_failed` state must again stop execution for evidence verification rather than trigger deletion or blind index rewriting.

**Verification:**

- Managed functional matrix `2026-07-24T19-20-52-160Z-phase7-step416-managed-functional-r2-c01bac11` — Node `20.20.2` and `24.15.0` each passed 60/60; exit 0; zero stderr.
- Isolated managed repository acceptance `2026-07-24T19-23-36-411Z-phase7-step416-managed-repository-r2-0f097adb` — each major passed 1/1 with the existing warm-latency assertion unchanged; exit 0; zero stderr.
- Final current-runtime focused run `2026-07-24T19-26-14-696Z-phase7-step416-current-focused-final-62249001` — functional 60/60 followed sequentially by repository acceptance 1/1; exit 0; zero stderr.
- Managed build `2026-07-24T19-27-57-319Z-phase7-step416-managed-build-final-efe701ac` — both majors passed; exit 0; zero stderr.
- Authoritative ordinary `2026-07-24T19-29-42-826Z-phase7-step416-ordinary-final-5ee89b91` — each major ran 1,229 tests, with 1,227 passed, 2 established skips, and 0 failed; exit 0; zero stderr.
- Protected Smoke `2026-07-24T19-54-59-950Z-phase7-step416-smoke-final-2daab671` — all eight domains passed on both majors; exit 0; zero stderr.
- Every detached run reported successful temporary-state cleanup and zero retention failures.

**Adversarial review:** No independent agent runtime was available. Two independent manual review passes were used instead. The first found and repaired the over-broad `TRANSACTION_BUSY` deferral. The second checked that descriptor publication does not replace strict parsing, protocol V3 is distinct from inherited Tool Contract facts, only a verified live owner can defer recovery, the 448 MB heap does not expand input/output/deadline budgets, summary degradation grants no Git authority, audit evidence remains untouched, and both Phase 8 records remain outside the tracked scope.

**Risk and limitation:** The worker heap increase reflects the accepted TypeScript project scale and does not make partial or oversized dependency graphs writable. Summary Git failures intentionally reduce orientation detail for sub-workspaces but do not change typed Git behavior. Formal Phase 7 closure cannot be claimed until the reviewed commit passes exact-head CI and real ChatGPT App UI G7-U is observed.

**Rollback:** Revert the STEP-416 source and regressions as one unit. Partial rollback is unsafe: removing only descriptor shapes restores argument stripping; removing inherited contract binding restores unusable grants; lowering only the worker heap restores OOM on the accepted project; or broadening recovery deferral restores fail-open behavior. The supported product rollback remains explicit `CODEXGPT_GUIDANCE_MODE=legacy` with the prior Tool Contract projection.

**Next action:** Complete policy, diff, package, Markdown-link, secret-pattern, size, and exact-scope checks; stage only these 22 STEP-416 files; commit once in English; push normally; and require terminal success from the exact-head Repository policy, Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package matrix. Keep the two Phase 8 records untracked and excluded. Phase 7 code and backend gates may complete here, but formal G7-U UI acceptance remains externally blocked.

**Final local closure checks:** `npm run policy:check` reported `Repository operational policy: PASS`; `git diff --check` passed; `npm pack --dry-run --json` produced 579 entries with the required semantic and recovery runtime files and no test, archive, `.ai-bridge`, or `.hallmark` payload; the corrected repository-wide audit checked 128 tracked Markdown files with zero broken relative targets; and 420 added lines produced zero authentication-material pattern hits. `Memory.md` remains within the hard 200-line/25 KB budget at 108 lines and 19,024 bytes. The plan remains below its 1,500-line soft limit, and this archive part remains below its split threshold.

**Final scope:** Exactly 22 tracked STEP-416 files are modified. The only untracked files are the two Phase 8 OAuth records, and neither is in the tracked diff. No run log, fixture, package tarball, audit evidence, transaction state, approval state, credential state, or toolchain state is included.

**Revised next action:** Stage the exact 22-file reviewed scope, create one concise English commit, push normally to `origin/main`, and bind the resulting 40-character head to terminal exact-head CI success. After code and backend publication gates complete, real ChatGPT App G7-U remains a separate externally observable requirement.

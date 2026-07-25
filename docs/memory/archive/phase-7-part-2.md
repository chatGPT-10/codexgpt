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

## 2026-07-25 — STEP-417: Preserve dual local-control state roots after exact-head CI

**Status:** The first STEP-416 publication exposed a real Windows regression in the local process-control fallback. The replacement implementation and all relevant local Node 20/24 gates pass. A replacement commit, push, and exact-head CI run remain required; formal ChatGPT App UI G7-U remains externally blocked.

**Goal:** Keep production approvals and unified production process control on the transaction state root without breaking the legacy owned-process fallback used when the remote approval path is unavailable.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `scripts/codexgpt.mjs`

**Failure evidence:** Commit `691168ebf88024896d755067656b438217356ed0` was pushed normally and bound to exact-head CI run `30123081050`. Repository policy and Ubuntu Node 24 passed, but Windows Node 20 failed first in `test/process-local-control-cli.test.mjs`: `processes terminate` looked only under `CodexGPT/state/v1/<server-id>` and raised `ENOENT` while the valid owned-process fallback server was under `CodexGPT/control/<server-id>`. Windows Node 24 and Ubuntu Node 20 also ended non-success, so the exact head was rejected rather than treated as flaky.

**Root cause:** STEP-416 correctly moved approval CLI discovery to `resolveTransactionStateRoot()`, but `runLocalControlCli()` serves both `approvals` and `processes`. Applying the production approval root unconditionally erased the existing dual topology: the production unified server uses the transaction root, while the standalone owned-process fallback intentionally retains the legacy local-control root.

**Implementation:**

- `approvals` always selects the transaction state root.
- `processes` selects the transaction root when the exact requested server directory exists there, preserving production unified control.
- Otherwise `processes` leaves `stateBaseRoot` unset so `LocalApprovalClient` uses its established legacy `CodexGPT/control` default, preserving the standalone fallback.
- Selection is exact-server based. If a production server directory exists but contains missing, replaced, symlinked, or corrupt state, the client remains on that root and fails closed; it does not silently fall back to a different server under the legacy root.
- No "latest" server selection, directory enumeration, credential migration, or state mutation was introduced.

**RED/GREEN evidence:** The published exact head is the RED evidence. Its Windows Node 20 regression deterministically failed the legacy fallback journey. After the bounded routing repair, `test/process-local-control-cli.test.mjs` and `test/cli-approvals.test.mjs` pass together, proving both the legacy fallback and production transaction-root topology.

**Verification:**

- Current-runtime build plus focused dual-topology tests: 2/2 passed.
- Managed dual-topology matrix `2026-07-24T20-32-39-683Z-phase7-step416-ci-cli-managed-35a5a5cf` — Node `20.20.2` and `24.15.0` each passed 2/2; exit 0; zero stderr.
- Replacement authoritative ordinary `2026-07-24T20-35-11-700Z-phase7-step416-ci-repair-ordinary-8ab133f4` — both managed majors passed; exit 0; zero stderr; temporary state cleanup succeeded.
- Replacement protected Smoke `2026-07-24T20-57-18-972Z-phase7-step416-ci-repair-smoke-29898681` — all eight domains passed on both managed majors; exit 0; zero stderr; temporary state cleanup succeeded.
- Replacement managed build `2026-07-25T03-50-56-919Z-phase7-step416-ci-repair-build-72f42491` — both managed majors passed; exit 0; zero stderr; temporary state cleanup succeeded.

**Adversarial review:** No independent agent runtime is available. Manual review checked four failure modes: production processes must not regress to the legacy root; legacy fallback must remain usable; exact production state corruption must not be hidden by cross-root fallback; and approval discovery must never return to the legacy root. The exact-directory predicate plus the existing `LocalApprovalClient` lstat/identity checks satisfy those boundaries without adding a new state abstraction.

**Risk and limitation:** Root selection is intentionally based only on the exact server directory's existence, not state validity. That preserves fail-closed behavior but means an abandoned corrupt production directory blocks same-ID legacy fallback until an operator diagnoses state; this is safer than silently connecting to a different authority domain. Exact-head CI for the replacement commit is still pending.

**Rollback:** Reverting only this correction restores the confirmed Windows process-control regression. A complete product rollback remains explicit legacy guidance/contract mode; deleting local-control or transaction state is not an authorized rollback.

**Next action:** Re-run policy, diff, package, Markdown-link, secret-pattern, size, and exact-scope checks; stage only these four reviewed STEP-417 files; commit once in English; push normally; and require terminal success from a new exact-head Repository policy, Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package matrix. Keep both Phase 8 records untracked and excluded. Real ChatGPT App UI G7-U remains a separate externally observable requirement.

**Final verification addendum:** Manual security review replaced `existsSync` with exact `lstatSync` probing so only `ENOENT` authorizes legacy fallback; access, type, symlink, and other state-root errors remain on the production authority path and fail closed. The first combined orchestration attempt `2026-07-25T03-55-26-727Z-phase7-step417-final-local-gates-cbb7ac45` did not execute tests because Git Bash rewrote `cmd.exe /d /s /c` flags as paths; it exited 1 with zero stdout and is not acceptance evidence. The corrected PowerShell-wrapped exact run `2026-07-25T03-57-05-983Z-phase7-step417-final-local-gates-r2-46cbb590` passed Node 20/24 dual-topology tests 2/2 per major, authoritative ordinary 1,227/1,229 with 2 established skips and 0 failures per major, and all eight protected Smoke domains per major; exit 0, zero stderr, successful temporary-state cleanup, and zero retention failures.

## 2026-07-25 — STEP-418: Bound Windows local-control cold startup

**Status:** Implemented and locally verified. Publication and replacement exact-head CI remain required. Real ChatGPT App UI G7-U remains externally blocked.

**Goal:** Accommodate measured GitHub Windows cold PowerShell `Add-Type` compilation latency without widening local-control request authority, process lifetime, output, ownership, or close behavior.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `scripts/windows-local-control-spike.mjs`
- `src/control/windowsLocalControl.ts`
- `test/approval-multi-server.test.mjs`

**Failure evidence:** STEP-417 published as `9f8a593e52b5ed57bd6beb4885617dc85e44f6a3`. Exact-head run `30144166480` passed change classification, Repository policy, Ubuntu Node 20/24, and Windows Node 24. Windows Node 20 failed first in `production local-control factory routes exact servers and performs real approval decisions` with `CONTROL_READY_TIMEOUT` after 60,061 ms. Its Build passed; Smoke and Package were skipped only because Regression failed.

**Root cause and implementation:** The production and diagnostic local-control launchers compile the fixed C# host through Windows PowerShell `Add-Type` on a fresh private state root. The existing 60-second startup ceiling was itself reached under serialized GitHub Windows Node 20 load. Both production and diagnostic cold-start defaults are now 120 seconds. The change does not modify message size, pipe identity, remote-client rejection, process/request deadlines, lifecycle ownership, output caps, dispatch validation, shutdown, or cleanup.

**RED/GREEN evidence:** The startup-bound contract was first changed to require `120_000`; it failed while both implementations still declared `60_000`. After changing only the two startup constants, current-runtime build and the four affected local-control/CLI files passed 10/10.

**Verification:**

- Managed Node 20/24 build and affected tests passed inside `2026-07-25T04-54-46-291Z-phase7-step418-final-local-gates-e8ed7c24`; affected tests passed 10/10 per major.
- The same run passed authoritative ordinary at 1,227/1,229 with 2 established skips and 0 failures per major.
- Its immediately following Node 20 HTTP Smoke timed out waiting for a dynamically selected loopback health endpoint after the long ordinary sequence. That unrelated resource-tail failure is recorded, not used as acceptance, and did not recur in the independent protected run.
- Isolated protected Smoke `2026-07-25T05-24-21-474Z-phase7-step418-smoke-isolated-594818f3` passed all eight domains on both Node 20/24 majors; exit 0, zero stderr, successful temporary-state cleanup, and zero retention failures.

**Documentation review:** This is an internal bounded startup reliability change. README, public launch, Cloudflare, authentication, and user-facing CLI behavior are unchanged. `AGENTS.md` already states the operational gate rules; only the durable 120-second local-control cold-start constraint belongs in the project memory and Phase 7 execution record.

**Risk and limitation:** A genuinely hung compiler is now detected after 120 seconds instead of 60 seconds. This is limited to startup and does not relax runtime operations. The replacement exact head has not yet passed CI, and backend evidence still does not satisfy real ChatGPT App UI G7-U.

**Rollback:** Reverting the two constants and their contract restores the exact Windows Node 20 timeout observed in run `30144166480`. No state deletion, credential migration, or audit reset is part of rollback.

**Next action:** Complete policy, diff, package, Markdown-link, secret-pattern, size, and exact-scope checks; stage only these six STEP-418 files; commit once in English; push normally; and require terminal success from a new exact-head Repository policy, Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package matrix. Keep both Phase 8 records untracked and excluded. Formal Phase 7 closure still requires real user-observable G7-U.

**Neat-freak closure:** Repository policy and `git diff --check` pass. Package dry-run contains 579 entries and no test, memory archive, `.ai-bridge`, or `.hallmark` payload. The corrected audit checks 128 tracked Markdown files with zero broken relative links; 36 added lines contain zero credential-pattern hits and no relative-time wording. `Memory.md` was reduced from 109 lines/19,458 bytes to 101 lines/17,802 bytes, below the practical 150-line/18 KB target. Required project files and operational npm scripts exist. The exact tracked scope is the six files listed above; the two Phase 8 OAuth records remain untracked and excluded.

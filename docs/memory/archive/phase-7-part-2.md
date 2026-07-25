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

## 2026-07-25 — STEP-419: Isolate repository-scale semantic acceptance

**Status:** The exact-head Ubuntu Node 20 regression is repaired locally. TDD, fixed Node 20/24 focused acceptance, fixed Node 20/24 ordinary, and protected Smoke pass. Replacement publication and exact-head CI remain required. Real ChatGPT App UI G7-U remains externally blocked.

**Goal:** Preserve the production 5-second semantic worker deadline while ensuring the repository-scale acceptance test runs under the independent resource envelope already required by the Phase 7 design.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `scripts/test-domains.mjs`
- `test/test-domain-classification.test.mjs`

**Exact-head failure evidence:** STEP-418 published as `62c8df0526cbd17bcd44592435b9fdb1650e99be`. Exact-head run `30147030377` passed change classification, Repository policy, Ubuntu Node 24, and Windows Node 20/24. Ubuntu Node 20 failed only `builtin resolves the Phase 7 live journey and repository-scale diagnostics`: the first semantic result returned `state="unavailable"` instead of `ready` after 14,652 ms. Build passed; Smoke and Package were skipped only because Regression failed.

**Root cause:** Linux CI uses the Node test runner's runtime-default concurrency. The resource-bounded repository acceptance remained in the main parallel set even though STEP-416's accepted design and evidence require it to run independently from competing CPU load. Under Ubuntu Node 20 contention, project discovery plus the worker request exhausted the unchanged 5-second worker deadline. Node 24 and both Windows jobs passed because Node 24 completed faster and Windows already forces test concurrency 1. This was orchestration drift, not a semantic-provider functional defect.

**RED/GREEN evidence:** The classification contract first added `phase-7-repository-acceptance.test.mjs` to the expected isolated set. Before implementation, `test/test-domain-classification.test.mjs` passed 2/3 and failed only because `scripts/test-domains.mjs` did not contain the required file. Adding the file to the existing serial isolation set produced 4/4 when classification and repository acceptance were run together. The production worker timeout, heap, input/output, queue, and cooldown values were not changed.

**Implementation:**

- Add `phase-7-repository-acceptance.test.mjs` to `SERIAL_PROCESS_TESTS`.
- On non-Windows runtime-default concurrency, the main suite runs first and the existing isolated pass then runs process-owning tests plus repository-scale semantic acceptance with `--test-concurrency=1`.
- Explicit `--test-concurrency=1` remains a single serial suite, and native Windows behavior remains unchanged.
- Do not add retries, loosen assertions, widen semantic deadlines, or classify the test as control-domain.

**Verification:**

- Current runtime focused classification plus repository acceptance: 4/4 passed.
- Managed Node `20.20.2` and `24.15.0`: each passed the same 4/4 focused set; the repository journey took approximately 17.5 seconds and 13.2 seconds respectively while the worker operation retained its 5-second deadline.
- Managed Node 20 build passed.
- Node 24 ordinary `2026-07-25T06-37-21-602Z-phase7-step419-ordinary-r2-883b6a49`: 1,229 tests, 1,227 passed, 2 established skips, 0 failed; exit 0, zero stderr, temporary-state cleanup succeeded.
- Node 24 protected Smoke `2026-07-25T06-48-29-614Z-phase7-step419-smoke-12593c1c`: all eight domains passed; exit 0, zero stderr, temporary-state cleanup succeeded.
- Managed Node 20 ordinary `2026-07-25T06-55-36-485Z-phase7-step419-node20-ordinary-f354277c`: 1,229 tests, 1,227 passed, 2 established skips, 0 failed; exit 0, zero stderr, temporary-state cleanup succeeded.
- Managed Node 20 protected Smoke `2026-07-25T07-13-23-088Z-phase7-step419-node20-smoke-541b73e3`: all eight domains passed; exit 0, zero stderr, temporary-state cleanup succeeded.

**Failed attempts retained:** The first managed-matrix command used the toolchain manager's default `%LOCALAPPDATA%\CodexGPT\toolchains` root and correctly reported the pinned runtimes unavailable; the accepted rerun used the repository's retained `%LOCALAPPDATA%\CodexPro\toolchains` root. The first detached ordinary command attempted `npm run test:ordinary`; the narrowed runner environment correctly returned `spawn npm ENOENT` without executing tests. The accepted retry invoked `node scripts/test-domains.mjs run --domain ordinary` directly. Long polling produced two connector 502 responses; exact runner state remained healthy and later published authoritative results.

**Adversarial review:** No independent agent provider is available in this workspace. Manual adversarial review checked four boundaries: the production 5-second deadline is untouched; Windows remains serial without a second pass; Linux explicit concurrency 1 does not duplicate tests; and the isolated file remains ordinary-domain so control authority is unchanged. The regression freezes the required classification and fails if the resource-bounded test drifts back into the parallel set.

**Risk and limitation:** Linux CI duration increases by one isolated repository acceptance after the parallel set. That cost is intentional because the test validates an accepted repository-scale workload under a deterministic resource envelope. This change does not prove real ChatGPT App UI behavior and does not close G7-U.

**Rollback:** Remove the file from the serial isolation set and its classification expectation together. Doing so restores the confirmed Ubuntu Node 20 contention failure and is not a safe test-orchestration rollback. Product rollback remains explicit `CODEXGPT_GUIDANCE_MODE=legacy`.

**Next action:** Complete build, policy, diff, package, Markdown-link, secret-pattern, size, and exact-scope checks; stage only these five STEP-419 files; commit once in English; push normally; and bind the replacement exact head to terminal Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package success. Keep both Phase 8 records untracked and excluded. Formal Phase 7 closure still requires real user-observable G7-U.

## 2026-07-25 — STEP-420: Repair live ChatGPT schema compatibility and default-root entry

**Status:** Implemented and locally verified. The real ChatGPT connector now accepts the V5 tool set and completed definition, references, file-open, and diagnostics portions of U1. A fresh supported-entry restart is still required to confirm approval-free default-root opening and finish the ambiguous-symbol journey. Publication and replacement exact-head CI remain pending.

**Goal:** Remove two live-only blockers without weakening the strict semantic runtime, arbitrary-root approval, transport-session isolation, or Phase 3 mutation boundary.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `src/policy/toolPolicy.ts`
- `src/server.ts`
- `src/tools/schemas/semantic.ts`
- `test/phase-7-v5-runtime-inheritance.test.mjs`
- `test/policy-transport.test.mjs`

**Live evidence and root causes:**

- ChatGPT initially rejected the connector with `Invalid MCP tool schema for tool 'semantic'`. The input descriptor advertised nested union and Unicode-regex constructs, and the optional output descriptor advertised union/const/pattern/reference constructs that the live connector rejected before any tool call.
- After replacing only the advertised semantic locator/new-name shape with a flat descriptor and omitting the optional advertised semantic output schema, connector creation succeeded. The strict discriminated input parser and strict success/failure output parsing remain server-side.
- Real U1 then returned the correct `startWorkerLeaseRenewal` definition, production reference, test references, source excerpt, and zero diagnostics without a Provider/setup question.
- The ambiguous-symbol attempt exposed a second blocker: `open_current_workspace` was classified R1 even though it can open only the configured default root. ChatGPT creates a fresh Streamable HTTP transport session during retries, so each retry correctly had a new session-local approval domain and could not consume the prior grant. Repeated approval was therefore unavoidable under that classification.

**Implementation:**

- Publish a flat semantic locator descriptor with optional position/symbol fields; keep exact operation/locator combinations in the existing strict runtime schema.
- Publish `new_name` as a bounded trimmed string without the wire-level Unicode pattern; retain strict runtime identifier validation.
- Stop advertising optional `outputSchema` for `semantic`; keep internal strict output construction and parsing unchanged.
- Reclassify only `open_current_workspace` from R1 to R0. It still requires the existing `workspace:open` identity scope and opens only the startup-configured root under the existing workspace/path policy.
- Keep arbitrary `open_workspace` at R1. Do not share grants across transport sessions, stabilize random local-control server IDs across sessions, or weaken workspace-handle/session binding.

**TDD and verification:**

- Semantic schema repair: `npm run build` passed; `npm run test:focused -- test/phase-7-v5-runtime-inheritance.test.mjs test/phase-7-repository-acceptance.test.mjs` passed 4/4; `npm run policy:check` passed; `git diff --check` passed.
- Default-root RED: the new policy transport regression passed 5/6 and failed only because `open_current_workspace` returned an approval-required error.
- Default-root GREEN: `npm run test:focused -- test/policy-transport.test.mjs` passed 7/7. The test proves configured `open_current_workspace` succeeds and audits as allow while an explicit `open_workspace` call for the same path still returns `APPROVAL_REQUIRED` and audits as approval-required.
- Combined affected suite: `npm run test:focused -- test/policy-transport.test.mjs test/open-current-workspace-contract.test.mjs test/phase-6-root-bootstrap.test.mjs test/phase-6-transport-parity.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs` passed 30/30.
- Final local `npm run build` and `npm run policy:check` passed. `git diff --check` reported only the repository's existing LF-to-CRLF working-copy warnings and no diff errors.

**Adversarial review:** No independent agent provider is available in this workspace. Manual review challenged four boundaries: the semantic wire descriptor is compatibility-only and cannot bypass the strict parser; omission of the optional output descriptor does not remove server output validation; only the already configured default root becomes R0; and arbitrary roots, foreign transport sessions, stale workspace handles, writes, rename application, and all higher-risk operations retain their existing approval and fail-closed behavior.

**Risk and limitation:** R0 default-root opening removes a redundant consent prompt for a root already selected by the local startup operator. It does not authorize another path. The live App must be restarted against the rebuilt server before this behavior can be accepted. U1 ambiguous-symbol handling and U2-U6 remain incomplete.

**Rollback:** Restore `open_current_workspace` to R1 and restore the previous semantic descriptors. That rollback also restores the observed connector rejection and per-session approval loop. No state deletion, credential migration, grant migration, or history rewrite is required.

**Next action:** Stop the old server, restart the supported public entry from the rebuilt checkout with the existing atomic/enforce/standard/builtin environment, and repeat the U1 ambiguous `delay` request in a fresh ChatGPT conversation. No approval should be requested for `open_current_workspace`; `open_workspace` must still require approval. Keep both untracked Phase 8 records excluded.

## 2026-07-25 — STEP-421: Preserve semantic preview authority across HTTP reconnect and pass the public named-tunnel U2 journey

**Status:** Implemented and locally verified. Build, affected regression, repository policy, diff, and native-Windows ordinary pass. The supported named-tunnel production path completes cross-session semantic preview, exact R2 apply approval, atomic apply, same-preview replay rejection, exact R2 undo, and post-undo baseline verification. Real ChatGPT App UI U2–U6, publication, and replacement exact-head CI remain pending.

**Goal:** Prevent a valid server-owned semantic rename preview from disappearing when ChatGPT rotates its Streamable HTTP transport, while preserving transport-local workspace handles, exact credential/root/policy binding, single-use semantics, Phase 3 approval, and lock-held atomic preconditions.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `src/guard.ts`
- `src/http.ts`
- `src/policy/integration.ts`
- `src/policy/toolPolicy.ts`
- `src/productionRuntime.ts`
- `src/semantic/manager.ts`
- `src/semantic/previewStore.ts`
- `src/server.ts`
- `src/tools/schemas/applyPatch.ts`
- `src/tools/schemas/semantic.ts`
- `test/phase-7-http-reconnect-preview.test.mjs`
- `test/phase-7-preview-lifecycle.test.mjs`
- `test/phase-7-rename-apply.test.mjs`
- `test/phase-7-semantic-audit.test.mjs`
- `test/phase-7-v5-runtime-inheritance.test.mjs`
- `test/policy-transport.test.mjs`
- `test/workspace-lifecycle.test.mjs`

**Confirmed root cause:** `src/http.ts` created and disposed one complete production server per MCP transport. `SemanticPreviewStore` therefore died with session A, while session B correctly received a fresh `WorkspaceManager` and semantic manager. `apply_patch(semantic_preview_id)` in session B reached the Policy resource resolver before approval, could not resolve the old preview, and the Policy wrapper collapsed the exception into `POLICY_CONFIG_INVALID / policy-unavailable`. A normal `open_workspace` approval could not restore the missing preview.

**Implementation:**

- HTTP now owns one bounded `SemanticPreviewStore` for the process lifetime and injects it into each per-transport production server. Semantic managers, workers, workspace managers, public handles, and transport revocation remain session-local.
- `WorkspaceManager.workspaceAuthorityDigest()` binds canonical root key, access class/mode, lease, identity binding, and policy revision, while deliberately excluding transport session ID, public workspace handle, and open timestamp.
- A ready preview may be adopted by a new session only when its immutable authority digest matches. The store then binds the current holder workspace ID for reservation, path invalidation, and exact single-use consumption.
- Transport close cancels the old manager/worker and revokes its public workspace handles but does not invalidate a ready process-lifecycle preview. Explicit workspace revocation, policy change, TTL expiry, reserve/consume, burn, changed-path invalidation, and quota eviction remain authoritative.
- The manifest now binds the reconnect authority digest plus the original provider generation/facts, source canonical paths, stable identities, hashes, edits, and resulting hashes. Apply consumes the immutable plan and does not depend on the new session worker epoch.
- Missing, expired, foreign-authority, reserved, consumed, or burned previews return typed `SEMANTIC_PREVIEW_STALE` with one fresh-preview action. They no longer become `POLICY_CONFIG_INVALID`.
- The stale error extends only the V5 `apply_patch` output. V1–V4 frozen descriptors and behavior remain unchanged.
- R2 approval, exact semantic facts digest, source hash/stable identity/parent identity, transaction lock, lock-held second inspection, atomic commit, audit, replay refusal, and undo remain unchanged.

**TDD and adversarial corrections:**

- The HTTP reconnect RED reproduced session A preview followed by session B apply and failed before the repair.
- The first implementation compared the old provider generation with the new session worker generation. Manual adversarial review rejected that design because a harmless semantic read in session B could rotate the local worker epoch even though apply uses only the immutable preview plan. The new session worker epoch is therefore not an adoption condition.
- The first stale-output implementation extended the shared V2 schema and changed V1–V4 frozen descriptors. The production snapshot suite failed; the correction introduced a V5-only output extension.
- Regressions cover foreign credential/identity, different canonical root, different policy revision, manifest/provider-fact changes, TTL, single-use adoption, concurrent reserve, changed path, source replacement, parent replacement, replay, and process-lifecycle HTTP wiring.

**Final local verification:**

- `npm run build` — passed.
- `npm run test:focused -- test/phase-7-http-reconnect-preview.test.mjs test/phase-7-preview-lifecycle.test.mjs test/workspace-lifecycle.test.mjs test/phase-7-semantic-manager.test.mjs test/phase-7-rename-apply.test.mjs test/phase-7-rename-races.test.mjs test/phase-7-semantic-audit.test.mjs test/policy-transport.test.mjs test/production-runtime-integration.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs` — 64/64 passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed with only existing LF-to-CRLF working-copy warnings.
- Authoritative native-Windows ordinary run `2026-07-25T11-53-20-033Z-phase7-u2-ordinary-r2-57089d52` — exit 0; 113,628 retained stdout bytes, zero stderr, no truncation, temporary state cleaned, zero retention failures.
- The first ordinary wrapper run `2026-07-25T11-52-08-470Z-phase7-u2-ordinary-cdd1e117` did not execute tests because Windows `spawn npm.cmd` returned `EINVAL`; the accepted retry used the authoritative direct Node entry `node scripts/test-domains.mjs run --domain ordinary`.

**Named-tunnel production U2 evidence:**

- Supported entry run `2026-07-25T12-05-55-426Z-phase7-u2-named-tunnel-r3-ed5b6586` remains active with a renewable worker lease.
- Environment: atomic transactions, Policy enforce, semantic standard/builtin, and explicit `CODEXGPT_PUBLIC_HOSTNAME=codexpro.drliang.uk` for the child fixture Host allowlist.
- Local and public unauthenticated `/healthz` returned 401. A credential-safe public MCP probe connected through `https://codexpro.drliang.uk/mcp`, exposed semantic/apply/undo, and never printed the saved token or complete credential URL.
- Session A created a rename preview for `computeApplyDelayLive` to `calculateApplyDelayLive`: manifest `6457b98e5e52160c7f4b5bef333efe8be6441dac91c23a3474e9f239ed8521e3`, 3 files, 5 edits.
- Session A closed. Session B submitted the same opaque preview, received exact R2 `APPROVAL_REQUIRED`, obtained local approval `approval_9a4635ef693171c5eb9a52233c68e59f`, and atomically committed change set `cs_f865fe620dc66847e9b1fcb341fe5f3b`.
- Modified fixture syntax checks and Node tests passed; all five symbol occurrences were renamed and no old occurrence remained.
- Reusing the exact same preview ID returned `SEMANTIC_PREVIEW_STALE`; no second mutation occurred.
- Exact R2 undo approval `approval_1f4ab0d124d6af422883ac0950462ac2` committed reverse change set `cs_48238274a26faa8e886c7028814721ad`, reverting `cs_f865fe620dc66847e9b1fcb341fe5f3b`.
- Post-undo syntax checks and Node tests passed; the fixture returned to five old-name occurrences and zero renamed occurrences.
- An earlier diagnostic journey applied and undid `cs_ab5fc652b4406bd9efa989661baea287`; it was not used as final replay evidence because the caller did not retain the opaque preview ID. Its cleanup undo succeeded; the later complete single-process journey above is the accepted evidence.

**Security review:** A wrong identity/root/policy digest cannot adopt, reserve, consume, or burn another authority's preview. The public preview ID remains opaque and the public result still omits per-file hashes and internal tokens. The shared object is only the bounded preview store; no workspace manager, worker, grant store, local-control authority, credential, or public workspace handle became process-global. Phase 3 transaction and audit boundaries are unchanged.

**Risk and limitation:** This journey uses the real public domain, Cloudflare named tunnel, production HTTP server, saved query-token compatibility credential, local approval runtime, Policy Kernel, and atomic transaction backend. It is stronger than an in-memory/backend regression, but it is still an SDK-driven MCP client journey. It does not substitute for user-observable ChatGPT App UI evidence or cached-App **Scan Tools** migration evidence.

**Rollback:** Revert the shared HTTP preview-store injection, authority digest, V5 stale classification, and corresponding regressions as one unit. That restores the confirmed reconnect loss and misleading Policy error. Do not restore preview continuity by sharing `WorkspaceManager`, grants, workers, or transport handles globally.

**Next action:** Use the still-running named-tunnel fixture to complete real ChatGPT App UI U2–U6. Then run managed Node 20/24 build/ordinary/Smoke and package gates, perform final adversarial scope review, stage only the reviewed Phase 7 files, commit once in English, push normally, and require terminal exact-head Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package success. Keep both Phase 8 OAuth files untracked and excluded.

## 2026-07-25 — STEP-422: Preserve exact V5 approval grants across ChatGPT HTTP reconnect

**Status:** Implemented and locally verified. Build, 87 affected regressions, repository policy, diff, and authoritative native-Windows ordinary pass. The repaired supported named-tunnel runtime is active and publicly reachable with authentication enforced. Real ChatGPT App UI U2 retry remains the next acceptance action.

**Goal:** Stop the ChatGPT App approval loop in which a locally granted semantic apply or undo request immediately returned a different `approval_id` and `server_id` after the App rotated its Streamable HTTP transport.

**Files changed in this step:**

- `Memory.md`
- `docs/memory/archive/phase-7-part-2.md`
- `src/http.ts`
- `src/policy/integration.ts`
- `src/policy/runtime.ts`
- `src/productionRuntime.ts`
- `src/server.ts`
- `src/tools/phase3dServer.ts`
- `test/phase-7-http-reconnect-preview.test.mjs`
- `test/production-runtime-integration.test.mjs`

**Confirmed root cause:** STEP-421 preserved the semantic preview across transport reconnect, but each HTTP transport still constructed a separate `LocalApprovalRuntimeV3`. Local approval granted a session-local store, and closing that transport closed the runtime and erased the grant. Even if the store survived, the V3 grant matched the old `transportSessionId`, opaque `workspaceId`, resource fingerprint, and request input digest. ChatGPT's retry therefore could not consume the approved grant and created another pending request on a new server.

**Implementation:**

- `src/http.ts` now creates one process-lifecycle local approval runtime only for the bounded HTTP V5 path: Contract V5, Policy enforce, audit enabled, execution profile off, and no confirmed-root admission. Full-access execution, process control, confirmed roots, and older contracts retain their existing lifecycle boundaries.
- Every per-transport production server receives that injected runtime. `src/productionRuntime.ts` records whether it owns an automatically created runtime; session close disposes only owned runtimes, while HTTP process shutdown closes the injected runtime exactly once.
- The Policy resource contract accepts an internal `approvalBindingV3` only from a trusted resource resolver. It may substitute stable approval-only transport/workspace/resource/input facts while the execution decision and audit retain the real current resource fingerprint.
- Semantic apply binds the grant to the authenticated credential, policy/evidence revisions, risk and operation, exact semantic facts, canonical workspace authority, immutable manifest, and exact opaque preview ID. A second preview ID cannot consume a grant even when its rename content and manifest-equivalent source state match.
- V5 undo binds the grant to the authenticated credential, policy/evidence revisions, risk and operation, canonical workspace authority, exact change-set ID, undo mode, and exact described reverse resource.
- The execution handler still resolves the current session-local workspace and runs all existing lock-held source identity/hash/parent checks, Phase 3 atomic transaction, required audit, single-use preview consumption, and change-set ownership checks. The stable approval binding grants no new path or operation authority.

**TDD and adversarial review:**

- The live App reproduced the defect: the first apply request was granted locally, but the retry returned a new approval/server pair instead of consuming the grant.
- The reconnect regression now proves preview creation in session A, approval request in session B, local grant, session B close, and grant consumption in session C.
- The undo reconnect regression proves a new opaque workspace handle and transport can consume only the exact approved change set under the same credential-derived owner binding.
- An adversarial sibling-preview assertion proves a distinct preview ID cannot reuse the approved grant and receives a separate approval requirement.
- A production lifecycle regression proves closing one production session does not close an injected process-lifecycle approval runtime.
- Existing frozen V1–V4 wire/transaction tests remain unchanged and pass.

**Verification:**

- `npm run build` — passed.
- Narrow affected suite — 58/58 passed.
- Final affected suite: `npm run test:focused -- test/phase-7-http-reconnect-preview.test.mjs test/phase-7-preview-lifecycle.test.mjs test/workspace-lifecycle.test.mjs test/phase-7-semantic-manager.test.mjs test/phase-7-rename-apply.test.mjs test/phase-7-rename-races.test.mjs test/phase-7-semantic-audit.test.mjs test/policy-transport.test.mjs test/production-runtime-integration.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs test/policy-v3-approval-integration.test.mjs test/undo-change-set.test.mjs test/transaction-contract-version.test.mjs` — 87/87 passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed with only existing LF-to-CRLF working-copy warnings.
- Authoritative native-Windows ordinary run `2026-07-25T13-04-29-128Z-phase7-u2-ordinary-r3-f8392ddb` — exit 0; 113,956 retained stdout bytes, zero stderr, no truncation, temporary state cleaned, zero retention failures.

**Named-tunnel restart and public probe:**

- Exact old run `2026-07-25T12-05-55-426Z-phase7-u2-named-tunnel-r3-ed5b6586` was stopped through the detached runner after exact ownership verification.
- Repaired run `2026-07-25T13-13-17-909Z-phase7-u2-named-tunnel-r4-bd51dfa7` is active with a renewable worker lease, the supported public entry, atomic transactions, Policy enforce, semantic standard/builtin, and the existing `codexpro.drliang.uk` named-tunnel hostname.
- Local and public unauthenticated `/healthz` each return 401.
- A credential-safe public MCP SDK probe used the saved query-token credential internally without printing it or the complete URL. It connected successfully, listed 35 tools, and confirmed `semantic`, `apply_patch`, `undo_change_set`, and `open_current_workspace`.
- Two initial inline probe attempts failed only because Windows PowerShell stripped nested Node `-e` quotes; they did not reach the credentialed MCP call or modify state. The final environment-passed probe succeeded.

**Risk and limitation:** Process-lifecycle grants remain in memory only and disappear on CodexGPT restart, which is the intended fail-closed behavior. The new stable binding is restricted to exact V5 semantic apply and undo resolver facts; it does not make arbitrary V3/V4 grants reconnectable and does not share workspace managers, public handles, workers, process managers, root admission, or Git authority. Real ChatGPT App UI evidence is still required because SDK and regression evidence cannot prove the App's user-observable retry behavior.

**Rollback:** Remove the process-lifecycle HTTP approval runtime injection, restore per-server runtime ownership, and remove the two V5 stable approval bindings and regressions as one unit. That restores the confirmed infinite approval loop but requires no credential migration, state deletion, or history rewrite.

**Next action:** In the existing ChatGPT App, create a fresh rename preview because the old preview and grant belonged to the stopped process. Apply it, approve the first R2 request locally, and retry after any App transport rotation. The retry must consume the same grant instead of returning another approval. Then verify exact-preview replay refusal and reconnect-safe undo. No stage, commit, or push has been performed; both Phase 8 OAuth records remain untracked and excluded.

## 2026-07-25 — STEP-423: Make V5 undo independent of session-local workspace handles

**Status:** Implemented and locally verified. The exact live failure is reproduced by a production regression, the V5-only fix passes 88 affected regressions, repository policy, diff validation, and authoritative native-Windows ordinary. The repaired named-tunnel runtime is active; real ChatGPT App undo retry remains pending after one explicit **Scan Tools** refresh.

**Confirmed root cause:** ChatGPT may rotate Streamable HTTP transports between two tool calls in one conversation. `open_current_workspace` therefore returned a workspace handle owned by session A, while `undo_change_set` executed in session B. Workspace handles are intentionally session-local and must not be adopted across transports. V5 nevertheless required `workspace_id`, so the stale handle failed in the Policy resource resolver before R2 approval and was projected as `POLICY_CONFIG_INVALID / policy-unavailable`.

**Implementation:**

- Added a V5-only strict undo input schema in which `workspace_id` is optional while `change_set_id` remains mandatory and exact.
- When V5 omits `workspace_id`, both the Policy resource resolver and execution handler resolve only the server's already configured default root through `WorkspaceManager.resolveWorkspace()`.
- An explicitly supplied stale, foreign, or invalid workspace handle is still rejected; there is no fallback from a bad explicit handle.
- V2, V3, and V4 retain the existing required `workspace_id` schema and behavior.
- Change-set owner binding, canonical workspace authority, exact change-set ID, undo mode, reverse resource fingerprint, R2 approval, conflict checks, atomic transaction, and required audit remain unchanged.
- The internal Phase 3D registration path uses the same contract-selected schema so direct and composed registrations cannot drift.

**TDD and adversarial evidence:**

- RED: a real production V5 test created a semantic preview in session A, requested and granted apply in session B, committed the change set in session C, opened the default workspace in session D, then attempted undo in session E without a workspace handle. Before the fix it reproduced the live `POLICY_CONFIG_INVALID / policy-unavailable` result.
- GREEN: the same session-E undo now reaches exact `APPROVAL_REQUIRED`.
- The regression separately sends the stale session-D handle from another session and proves it is rejected without creating an approval.
- Schema assertions prove V2 still rejects omitted `workspace_id`, V5 accepts omission, and V5 remains strict against extra force-like arguments.

**Verification:**

- `npm run build` — passed.
- Final affected suite — 88/88 passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed with only existing LF-to-CRLF working-copy warnings.
- Authoritative ordinary run `2026-07-25T13-46-37-029Z-phase7-u2-undo-reconnect-ordinary-r5-9ced8ff0` — exit 0; 114,107 retained stdout bytes, zero stderr, no truncation, temporary state cleaned, zero retention failures.

**Named-tunnel evidence:**

- The first restart `2026-07-25T13-56-11-488Z-phase7-u2-named-tunnel-r5-4dd01498` inherited no explicit V5 environment and correctly exposed only the legacy 21-tool projection. It was stopped and is not acceptance evidence.
- Corrected run `2026-07-25T13-58-50-191Z-phase7-u2-named-tunnel-r6-85202e85` was started with explicit atomic, required-audit, Policy enforce, Contract V5, semantic standard/builtin, and public-hostname environment.
- Local and public unauthenticated `/healthz` each return 401.
- A credential-safe public SDK probe lists 35 tools, confirms `undo_change_set` and `semantic`, confirms `workspace_id` is not required for V5 undo, confirms `change_set_id` remains required, and reports Policy enforce with workspace writes.

**Security review:** Omission selects only the startup-configured root that `open_current_workspace` already exposes as R0. It does not accept caller-selected paths or foreign handles. Undo remains owner-bound and R2-approved, and all complete-state conflict checks occur before atomic mutation. Explicit stale handles fail closed rather than silently retargeting the configured root.

**Next action:** Refresh the existing App's tool snapshot once, then call `undo_change_set` for `cs_e9d32dd9fc2e78f372de4c1572911b68` with `preview=false` and omit `workspace_id` entirely. The first call must return one R2 approval; after local grant, a retry from any App transport must consume it and restore the three fixture files. No stage, commit, or push has been performed; both Phase 8 OAuth records remain untracked and excluded.

## 2026-07-25 — STEP-424: Accept real ChatGPT App U2 preview, apply, replay refusal, and reconnect-safe undo

**Status:** Accepted through the real ChatGPT App and the supported public named tunnel. U2 is complete. U3–U6, publication, and replacement exact-head CI remain pending.

**User-observable journey:**

- The App generated semantic rename preview `sp_MqGKudARZUhrOuAjEveMN3pFg2FOCl9k` with manifest `2e62a42247756dd9cd83c17798e7ccaced0f906ff109d4d5b697c08a478c0b85`.
- The preview covered exactly three files and five edits: one in `src/lease.mjs`, two in `src/use.mjs`, and two in `test/lease.test.mjs`.
- The first apply request returned one exact R2 approval. Local approval was granted, and the App retry consumed it without issuing a second approval.
- Atomic apply committed `cs_e9d32dd9fc2e78f372de4c1572911b68` and changed all five occurrences from `computeApplyDelayLive` to `calculateApplyDelayLive`.
- Reusing the exact preview returned `SEMANTIC_PREVIEW_STALE` with no approval and no second mutation.
- The first undo attempt reproduced the stale workspace-handle defect as `POLICY_CONFIG_INVALID / policy-unavailable`, leading to STEP-423.
- After one explicit **Scan Tools** refresh against named-tunnel run `2026-07-25T13-58-50-191Z-phase7-u2-named-tunnel-r6-85202e85`, V5 undo omitted `workspace_id`, returned one exact R2 approval, and the retry consumed that grant across App transport rotation.
- Undo committed reverse change set `cs_f91913f2ba913b45a68b43ddbc7713ef`, with `reverts_change_set_id` equal to `cs_e9d32dd9fc2e78f372de4c1572911b68`, restoring the same three files.

**Independent local verification:**

- The undo approval record is `consumed`, not pending or reusable.
- `computeApplyDelayLive` is present exactly five times across the fixture and `calculateApplyDelayLive` is absent.
- `npm run build` in `.ai-bridge/g7u-u2-apply` passes syntax checks for all three files.
- `npm test` passes 1/1.
- The failed pre-fix undo and the exact-preview replay caused no extra mutation.

**Adversarial review:** The accepted path demonstrates exact-preview single use, one approval per apply/undo operation, reconnect-safe grant consumption, exact change-set lineage, and restoration of the original bytes. Explicit stale handles remain fail-closed, omitted workspace authority remains limited to the configured default root, and V2–V4 contracts remain unchanged. No shared workspace manager, arbitrary path authority, wildcard approval, force undo, or credential migration was introduced.

**Remaining boundary:** U2 proves JavaScript/TypeScript semantic rename through the real App, public tunnel, authentication, Policy Kernel, local R2 approval, atomic transaction, replay refusal, and undo. It does not close U3–U6, publication, exact-head CI, or the documented frozen-tool-snapshot limitation.

**Next action:** Continue U3–U6 against the running r6 named-tunnel fixture. No stage, commit, or push has been performed; both Phase 8 OAuth records remain untracked and excluded.

## 2026-07-25 — STEP-425: Accept real ChatGPT App U3 content and stable-identity drift rejection

**Status:** Accepted through the real ChatGPT App and the supported public named tunnel. U3 is complete. U4–U6, publication, and replacement exact-head CI remain pending.

**Goal:** Prove that a semantic rename preview cannot mutate a target after either ordinary content drift or a same-content replacement with a distinct stable file object, and that rejection occurs without partial mutation, a change set, or a reusable approval.

**Files changed:** `Memory.md`; `docs/memory/archive/phase-7-part-2.md`. The ignored `.ai-bridge/g7u-u2-apply` fixture contains temporary replacement/backup objects used only for live acceptance. No source, test, configuration, workflow, package, credential, approval-state, transaction-state, or tracked fixture file changed in this step.

**Real App content-drift journey:**

- Preview `sp_VHVntp6h8ZquwFJOzTNcZ93SxYMRwFee` with manifest `a0d48b0d71cbf8677d41d6dc9388090571260bd71cc6a8623b8a6c027bea267d` covered three files and five edits.
- An independent authorized edit appended a non-semantic comment to `src/use.mjs`; build and the 1/1 fixture test still passed, with five old-name occurrences and zero new-name occurrences.
- The first apply request returned exact R2 approval `approval_f78ac933263c876645b3ef94f622dcea`. After local grant, the identical retry returned `FILE_VERSION_CONFLICT` for `src/use.mjs`.
- No second approval, change set, partial mutation, or semantic rename occurred. The grant became `consumed`, and recovery guidance required rereading the changed file and creating a fresh preview.

**Real App same-content distinct-object journey:**

- A distinct candidate object was pre-created with the exact same 204 bytes and SHA-256 `33b71962534a496e81ccf7eac069762fed62e3c4fd37373577aacd1920f2d0a9` as `src/use.mjs`, but a different NTFS identity.
- `System.IO.File.Replace` installed the candidate while preserving the old object as a backup. The target SHA-256 and size remained unchanged while `ino` changed from `4222124650858905` at preview creation to `562949953427317` before apply. The replaced object remained separately observable as `4222124650858905`.
- Preview `sp_Px7LaWkiQYw6iS9FRBfyfbwm8HfeVMIp` with manifest `bf65740ab67e507ffc3bc65e53409230c2bdce2cb18e7a47fec8ae202fa11fd3` covered the same three files and five edits.
- The first apply request returned exact R2 approval `approval_d63b996e2da1a4c64934b84a3d76281b`. After local grant, the identical retry returned `FILE_VERSION_CONFLICT` for `src/use.mjs` despite unchanged content and hash.
- No new approval, change set, partial mutation, or semantic rename occurred. The grant became `consumed`, and recovery guidance required a fresh read and preview.

**Failed attempts retained as evidence:**

- One identity attempt expired before apply and correctly returned `SEMANTIC_PREVIEW_STALE` with one-step fresh-preview guidance; it was not counted as identity acceptance.
- Devspace `write`/`edit` preserved the existing NTFS object and changed only metadata, so those attempts were rejected as invalid identity evidence.
- Ordinary non-semantic `apply_patch` returned `POLICY_CONFIG_INVALID / policy-unavailable` across ChatGPT HTTP tool rotation, including after an App-requested `open_current_workspace`; it made no mutation and was not used as U3 evidence. The bounded V5 semantic apply path remained reconnect-stable and passed the intended gate.

**Independent terminal verification:**

- Final `src/use.mjs` SHA-256 is `33b71962534a496e81ccf7eac069762fed62e3c4fd37373577aacd1920f2d0a9`; the fixture contains exactly five `computeApplyDelayLive` occurrences and zero `calculateApplyDelayLive` occurrences.
- `npm --prefix .ai-bridge/g7u-u2-apply run build` passed all syntax checks.
- `npm --prefix .ai-bridge/g7u-u2-apply test` passed 1/1.
- Both U3 apply approvals are `consumed`; no pending or reusable grant remains.
- `git diff --check` passed before the documentation update. The tracked working scope remains the previously reviewed Phase 7 repair set plus these memory records; both Phase 8 OAuth records remain untracked and excluded.

**Adversarial review:** Content hash alone cannot prove object continuity, and timestamp changes cannot prove object replacement. The accepted identity journey therefore used a pre-created equal-byte object, captured both identities, installed it with NTFS replacement semantics, and verified the target identity changed while hash and size stayed exact. The final App rejection names the affected relative path but does not disclose an absolute path. Approval was required before the lock-held second inspection, then consumed on failure; this preserves Policy Kernel ordering without making the grant replayable. No direct semantic writer, bypassed transaction, wildcard approval, shared workspace manager, or weakened path rule was introduced.

**Risk and limitation:** The ordinary non-semantic patch path remains session-local and was not made reconnect-stable by this step. The ignored fixture retains backup/replaced files for auditability; they are outside tracked scope and should be removed only under an explicit cleanup action. U3 does not prove worker failure/fallback, boundary redaction, or cached-App migration.

**Rollback:** Documentation-only rollback is to revert this STEP-425 entry and the matching `Memory.md` updates. The live fixture can be restored from its equal-byte replacement objects without affecting repository source; no tracked source rollback is required.

**Next action:** Continue real ChatGPT App Gate G7-U with U4 worker failure and lexical fallback, then U5 boundaries and U6 cached-App migration. Do not stage, commit, push, install Providers, or expand into Phase 8 during those journeys.

**Volume closure:** STEP-425 leaves this append-only volume above the 48 KB rollover threshold (80% of the 60 KB direct-read limit). Phase 7 Volume 2 is closed. Begin STEP-426 and every later Phase 7 record in `docs/memory/archive/phase-7-part-3.md`; do not rewrite or repartition this volume.

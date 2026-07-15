# Phase 3 Implementation Archive - Volume 3

This append-only volume continues Phase 3 after the closed `phase-3-part-2.md` volume. It begins with STEP-286.

## STEP-286 - Repair the Windows atomic-visibility CI hang

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and replacement exact-head CI.

**Goal:** Preserve deterministic byte-visibility coverage for transaction-backed `write` and `edit` without allowing the test reader to deny Windows rename progress indefinitely.

**Files changed:** `test/write-edit-transaction.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Task 4 was published as commit `ac06b2c`. Exact-head run `29377484728` completed both Ubuntu Node 20/24 jobs, but both Windows jobs remained in Regression Tests for more than eight minutes compared with 45-106 seconds on the preceding verified head. The new visibility test continuously reopened the replacement target with no bound or scheduling gap. POSIX rename tolerates an open reader, while native Windows rename can fail when a reader owns a conflicting handle; the test therefore became an unbounded denial of the install operation. The run was canceled instead of waiting for the workflow timeout. An attempted bounded 1 ms sampling loop still reproduced a real `TRANSACTION_FAILED` on repetition 7 because timing-based sampling can collide with the single guarded rename. The final test uses the transaction fault injector to pause exactly after the visible install: it proves complete old bytes before install, complete new bytes while the transaction remains pending, and complete new bytes after finalization, without probabilistic handle contention.

**Verification commands:** `npm run build`; attempted ten repeated `node --test test/write-edit-transaction.test.mjs`; twenty repeated `node --test test/write-edit-transaction.test.mjs`; `node --test test/*.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run`; `git diff --check`; neat-freak scope, documentation, archive, link, secret-signature, protected-Smoke, and size checks.

**Verification results:** The intermediate 1 ms sampling design passed six repetitions and then correctly exposed `TRANSACTION_FAILED` on repetition 7, so it was rejected. The deterministic visible-install design passed 20/20 repeated suites, totaling 220/220 tests. The complete regression ran 673 tests with 672 pass, 0 fail, and 1 established platform skip. Build, all eight Smoke sections, native-Windows Stress, and the 257-file package dry-run passed; the package remained 621,304 bytes with 3,306,547 unpacked bytes. `git diff --check` passed. Neat-freak found `Memory.md` at 123 lines and 17,974 bytes, this archive at 25 lines and 3,919 bytes before this final evidence sentence, no stale Task 4 publication wording, no secret signatures, no protected-Smoke changes, and only the intended test, index, and new archive volume in scope.

**Decisions made:** Test byte atomicity at exact transaction visibility boundaries rather than trying to prove availability under adversarial external file-handle contention. Keep Windows handle contention fail-closed: a conflicting external reader may make the install return `TRANSACTION_FAILED` and roll back, but CodexPro must not acknowledge a partial commit. Do not add hidden infinite retries or weaken the transaction failure contract to make the test pass.

**Risks or limitations:** External processes remain outside the workspace lock. This test proves complete bytes at the before, installed-pending, and finalized states; it does not promise successful forward progress while another process continuously holds a conflicting Windows file handle.

**Rollback method:** Revert the repair commit with a new commit if necessary. Do not restore the unbounded reader loop because it can hang native-Windows CI. Existing workspace files, audit evidence, and change sets are unaffected.

**Next step:** Publish this correction, require the replacement exact-head Ubuntu/Windows Node 20/24 run to complete Build, Regression, Smoke, and Package, then close Task 4 and begin Task 5 multi-file `apply_patch` RED tests.

## STEP-287 - Add transaction-backed multi-file apply_patch

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Preflight an entire supported UTF-8 unified diff before mutation, then commit all create, replace, and delete targets through one audited transaction and one encrypted change set while preserving exact V1 behavior.

**Files changed:** `AGENTS.md`; `Memory.md`; `src/mutations/index.ts`; `src/mutations/writers.ts`; `src/patchOps.ts`; `src/server.ts`; `src/tools/schemas/applyPatch.ts`; `test/apply-patch-transaction.test.mjs`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive.

**Implementation summary:** Added a pure bounded patch planner that parses every file and hunk, reads and hashes every before-state, validates optional V2 `expected_files`, rejects duplicate comparison keys, calculates exact UTF-8 after-bytes with CRLF and no-final-newline preservation, and produces no mutation until the whole plan succeeds. Zero-count unified-diff ranges use the range coordinate itself rather than `start - 1`, so insertions after an existing line are applied at the correct position. Rename, copy, binary, symlink, executable, and other mode-changing patches fail closed because the atomic operation model cannot represent those semantics. The server-owned mutation adapter builds one create/replace/delete transaction plus one authenticated encrypted change set, retains caller path order in V2 output while the engine installs by deterministic comparison key, invalidates analysis only after commit, rolls back on required-audit failure, and projects the exact unchanged V1 envelope or strict dormant V2 transaction and per-file facts.

**Verification commands:** initial and repaired `npm run build && node --test test/apply-patch-transaction.test.mjs test/apply-patch-contract.test.mjs`; `node --test`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; neat-freak scope, rule-state, archive-size, protected-Smoke, secret-signature, and documentation-link checks.

**Verification results:** The deliberate RED run passed 26 tests and failed exactly three new assertions for the zero-count insertion coordinate, ignored unsupported metadata, and case-folded duplicate `expected_files`; no implementation test failed unexpectedly. After repair, focused and legacy apply-patch coverage passed 29/29. The complete regression ran 688 tests with 687 pass, 0 fail, and 1 established platform skip. Build, all eight Smoke sections, native-Windows Stress, and package dry-run passed; the package contained 259 files, 630,785 packed bytes, and 3,369,692 unpacked bytes. `git diff --check` passed. Neat-freak corrected stale Phase 3 active-volume and stopping-point rules, reconciled Task 4 CI evidence, kept protected Smoke sources unchanged, and found no secret signatures in the change scope.

**Decisions made:** Implement supported patch semantics directly from exact complete-file facts rather than invoke Git after preflight, because only the transaction engine may perform visible atomic-mode workspace writes. Keep V1 byte-for-byte exact and expose `expected_files`, transaction identity, and per-file hashes only in dormant V2. Reject semantics the transaction model cannot faithfully encode instead of silently degrading them. Preserve caller path order only in the result; rely on the transaction kernel's comparison-key sorting for lock and install determinism.

**Risks or limitations:** Only bounded UTF-8 text create/replace/delete patches with existing parent directories are supported in atomic mode. Binary, symlink, rename/copy, and mode-changing patches are rejected. The 1,000-target and per-file limits are finite but can still admit a large aggregate batch; a shared aggregate transaction-byte ceiling remains an explicit activation blocker for the later writer-closure gate. External processes remain outside the workspace lock, so final version revalidation may return a conflict even after successful preflight. Public V2 and writable atomic construction remain fail-closed until later Phase 3C/3D gates complete.

**Rollback method:** Revert the Task 5 commit with a new commit. Legacy `fileTransactions=legacy` continues using the prior Git apply provider, V1 schemas remain unchanged, and no user workspace or application-state data is migrated by this source change.

**Next step:** Publish the scoped Task 5 commit, require its exact-head Ubuntu/Windows Node 20/24 workflow to pass Build, Regression, Smoke, and Package, then begin Task 6 with RED all-or-nothing tests for bridge, handoff, Pro-context, self-test probe, and CLI writers.

## STEP-288 - Migrate bridge, handoff, Pro-context, self-test, and CLI workspace writers

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Route every Task 6 workspace artifact through one bounded, audited transaction path, including empty-workspace scaffold creation, without changing the exact public V1 contract.

**Files changed:** `src/fsOps.ts`; `src/handoffOps.ts`; `src/proContext.ts`; `src/selfTestOps.ts`; `src/server.ts`; `src/mutations/index.ts`; `src/mutations/writers.ts`; new `src/mutations/localService.ts`; transaction types, schemas, filesystem engine, recovery; `scripts/pro-apply.mjs`; supported workspace-writer sections of `scripts/codexpro.mjs`; new bridge and pro-apply transaction tests; transaction engine/recovery tests; `AGENTS.md`; `Memory.md`; the Phase 3C plan; this archive.

**Implementation summary:** Added one text-batch preflight that reads every before-state, constructs complete UTF-8 after-bytes for replace, append, and create-if-missing operations, rejects duplicate paths and secrets, and enforces both per-file and aggregate byte limits before transaction state. Extended the transaction kernel to stage nested creates beside the closest existing parent, record each transaction-owned directory, create directories in deterministic parent-first order, and remove only its still-empty directories during rollback/recovery. Handoff now commits the complete scaffold, plan, and both JSONL files together; Pro-context uses a bounded virtual view so new scaffold data is included before visibility and then commits scaffold plus export together; atomic self-test validates Pro-context against a virtual fixed probe and retains no rollback blob. Added a reusable local mutation service that composes recovery, transactions, encrypted change sets, and persistent authorization/execution audit for `pro-apply` and execute/watch/loop CLI workspace artifacts. Corrected committed-manifest recovery so historical targets may be changed by later valid transactions while leftover artifacts remain hash-proven. Legacy direct providers and exact V1 schemas remain unchanged; writable atomic production server construction remains gated.

**Verification commands:** deliberate RED and repaired `npm run build && node --test test/transaction-engine.test.mjs`; focused Task 6 tests; recovery regression; existing handoff, Pro-context, and self-test contracts; `node scripts/execute-handoff-smoke-platform-compat.mjs`; `node --test test/*.test.mjs`; `npm run build`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; neat-freak scope, rule, archive, protected-Smoke, direct-writer, and secret-signature checks.

**Verification results:** Nested-directory RED failed at atomic preparation as expected, then passed after the kernel change. Task 6 plus legacy focused coverage passed 94/94. The real `pro-apply` child-process test passed overwrite and append, and injected durable-audit failure left no `.ai-bridge`. The complete regression ran 702 tests with 701 pass, 0 fail, and 1 established platform skip. Build passed. All eight Smoke sections, including execute-handoff platform compatibility, passed. Native-Windows Stress passed. Package dry-run passed with 261 files, 640,709 packed bytes, and 3,434,434 unpacked bytes.

**Material failed attempts and fixes:** The first CLI smoke failed because recovery required every historical committed target to remain equal to its old after-state. That rule makes a second valid transaction on the same file impossible. A focused RED test proved the defect. Recovery now treats committed manifests as irreversible history and authenticates/removes only referenced leftover artifacts; it does not freeze a target legitimately changed later. No corruption retry or target overwrite was introduced.

**Decisions made:** Use complete-file JSONL replacement within the transaction rather than direct append. Treat transaction-owned directory creation as an explicit reversible operation and never recursively delete it. Keep application profiles, credential references, installer destinations, transaction/audit state, and process control files outside the workspace-mutation classification. Require the local CLI service to persist audit and fail closed when audit is disabled or unavailable. Keep Task 6 adapters dormant until the later production runtime gate.

**Risks or limitations:** Multi-file installation remains sequential with complete rollback/recovery rather than database-style simultaneous visibility. External processes can contend or mutate files and cause a safe version conflict. A crash in the narrow interval between creating a directory and persisting its manifest transition may leave an empty directory; recovery never deletes an unproven directory. Task 7 must still statically classify every shipped direct mutation primitive before writable atomic activation.

**Rollback method:** Revert the Task 6 commit with a new commit. Legacy server providers remain available under `fileTransactions=legacy`; do not delete user workspaces, audit segments, change sets, or transaction history during source rollback.

**Next step:** Publish the scoped Task 6 commit, require exact-head Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package, then begin Task 7 static mutation-closure RED inventory.

## STEP-289 - Bound CLI diff failure artifacts after the Task 6 CI finding

**Status:** Locally complete and verified; ready for the authorized scoped repair commit, push, and replacement exact-head CI.

**Goal:** Preserve Task 6's bounded transactional CLI writes when Git cannot produce a diff, including a platform-specific output-buffer overflow, without weakening the existing failure artifact or edit limits.

**Files changed:** `scripts/codexpro.mjs`; new `scripts/output-bounds.mjs`; new `test/output-bounds.test.mjs`; `AGENTS.md`; `Memory.md`; this archive.

**Implementation summary:** Task 6 was published as commit `918d55d`. Exact-head run `29381264649` passed Build and Regression but failed Ubuntu Node 20/24 Smoke in the real large-dirty loop-handoff fixture: Git's captured overflow text was copied unbounded into `implementation-diff.patch`, so the transaction preflight correctly rejected the 1,048,604-byte write against its 1,000,000-byte ceiling. Added one shared UTF-8 byte limiter whose final result, including its truncation marker, stays within the caller limit and never splits a multibyte character. The unavailable-diff fallback now uses that limiter after redaction. Protected Smoke sources remain unchanged.

**Verification commands:** deliberate RED `node --test test/output-bounds.test.mjs`; repaired focused test plus `node --check` and execute-handoff smoke; `npm run build`; `node --test test/*.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; neat-freak scope, archive, protected-Smoke, secret-signature, output-bound, and documentation-state checks.

**Verification results:** RED failed only because the new bounded-output module did not yet exist. After implementation, the three ASCII, UTF-8, and oversized-failure-artifact tests passed. Complete regression ran 705 tests with 704 pass, 0 fail, and 1 established platform skip. Build and all eight Smoke sections passed; the unchanged real large-dirty fixture crossed the original Ubuntu failure boundary successfully. Native-Windows Stress passed. Package dry-run passed with 262 files, 641,140 packed bytes, and 3,435,319 unpacked bytes.

**Decisions made:** Bound the final serialized artifact rather than only its body. Keep the unavailable marker and a bounded redacted detail so operators retain actionable context. Do not raise the workspace write ceiling, bypass transaction preflight, special-case Ubuntu, or modify the protected acceptance fixture.

**Risks or limitations:** Oversized failure detail is intentionally truncated and may omit late diagnostic text. The marker itself is shortened only for unrealistically tiny limits that cannot contain it; normal CLI limits preserve the complete marker. Git and external processes remain outside the transaction engine.

**Rollback method:** Revert the repair commit with a new commit. Do not revert to the unbounded fallback while Task 6 transactional CLI writers remain active. No user workspace, audit, change-set, or transaction state requires migration.

**Next step:** Publish the repair, require replacement exact-head Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package, then mark Task 6 closed and begin Task 7 static mutation-closure RED inventory.

## STEP-290 - Close Phase 3C Task 6 publication

**Status:** Complete and published.

**Goal:** Record the exact replacement-CI evidence and formally open Task 7 only after Task 6's implementation and repair passed every required matrix.

**Files changed:** `AGENTS.md`; `Memory.md`; the Phase 3C plan; this archive.

**Implementation summary:** Bounded-output repair `124f555` was pushed on top of Task 6 implementation `918d55d`. Exact-head run `29382183625` completed Ubuntu and Windows on Node 20 and Node 24. Every job passed Build, the complete Regression suite, all Smoke sections including the original large-dirty failure fixture, and package-content validation. Marked Task 6 verification/publication complete and advanced the approved boundary to Task 7 only.

**Verification commands:** `gh run watch 29382183625 --exit-status`; `gh run view 29382183625 --json status,conclusion,headSha,url`; documentation-state, archive-link, size, protected-Smoke, secret-signature, scope, and `git diff --check` neat-freak checks.

**Verification results:** Run `29382183625` completed with conclusion `success` for exact head `124f55582adc598f63f43c64be3468a25671eb60`. Ubuntu Node 20/24, Windows Node 20/24, and every required job step passed. The repository was clean before this documentation-only closure update.

**Decisions made:** Treat exact-head CI as the completion fact, not a locally inferred success. Keep Task 7 separate so its inventory RED result cannot blur Task 6's acceptance evidence.

**Risks or limitations:** This closure changes no runtime behavior. Writable atomic production activation remains blocked behind Tasks 7-9 and Phase 3D.

**Rollback method:** Revert this documentation-only closure commit with a new commit if its recorded evidence is wrong; do not rewrite the append-only archive. Runtime implementation and user data are unaffected.

**Next step:** Execute Task 7's fail-closed static mutation inventory, remove or narrowly classify every bypass, and require its independent local and exact-head CI gates.

## STEP-291 - Close the Phase 3C static mutation inventory locally

**Status:** Locally complete and verified; ready for the authorized scoped Task 7 commit, push, and exact-head CI.

**Goal:** Make every direct filesystem mutation in production TypeScript and shipped runtime scripts explicit, reviewable, and fail-closed before writable atomic production wiring can be considered.

**Files changed:** new `test/mutation-architecture.test.mjs`; `AGENTS.md`; `SECURITY.md`; `Memory.md`; the Phase 3C plan; this archive.

**Implementation summary:** Added a TypeScript-AST inventory over every `src/**/*.ts` file plus shipped `.mjs`/`.cjs` runtime scripts, with one exact fixture-file exclusion set. Every allowed occurrence is bound to its canonical repository path, line, column, call digest, and reviewed purpose. The scanner covers ESM and CommonJS filesystem aliases, writable or dynamic `open`, file-handle writes, atomic state-writer wrappers, copy variants, fd-level writes/truncation/metadata changes, and the complete reviewed primitive vocabulary while excluding literal read-only `open(..., "r")`. The first deliberate empty-allowlist RED exposed 135 occurrences across 15 files, including the legacy direct workspace writers in `fsOps.ts` and `handoffOps.ts`; neat-freak vocabulary review then exposed two `writeSync` calls plus one `ftruncateSync` audit repair, and call-layer consistency review exposed the atomic audit-index writer. The final exact inventory contains 139 occurrences. The legacy calls are classified as one-cycle `fileTransactions=legacy` compatibility only, and a separate static call-path assertion proves the default atomic server prepares transaction-backed write, edit, patch, export, handoff, and self-test operations before any legacy provider can be selected. No source writer or protected Smoke fixture changed.

**Verification commands:** deliberate RED `node --test test/mutation-architecture.test.mjs`; CommonJS/alias RED and repair; `npm run build`; focused `node --test` over mutation runtime, write/edit, apply-patch, bridge, and pro-apply suites; `node --test test/*.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; neat-freak scope, documentation, archive, protected-Smoke, secret-signature, and size checks.

**Verification results:** The initial inventory failed with 135 unreviewed occurrences, including every known legacy workspace primitive. The CommonJS/alias test then failed until require bindings, writable alias opens, and four-argument file-handle writes were covered. Neat-freak's equivalent-primitive RED correctly failed on three previously unrecognized fd-level audit mutations, and its atomic-writer consistency RED then failed on the audit-index wrapper. After exact classification, the final inventory contains 139 occurrences and passes 3/3. The complete focused writer set passed 91/91. Complete regression ran 708 tests with 707 pass, 0 fail, and 1 established platform skip, including a fresh rerun after the vocabulary corrections. Build passed. All eight Smoke sections passed, including the unchanged native-Windows execute/watch/loop large-dirty fixture; native-Windows Stress passed. Package dry-run passed with 262 files, 641,417 packed bytes, and 3,436,130 unpacked bytes. `git diff --check` passed before documentation reconciliation.

**Decisions made:** Bind the allowlist to individual calls rather than filenames or directories. Treat non-literal/dynamic open flags as mutation-capable and accept narrow false positives over an evasion path. Preserve reviewed legacy behavior for one migration cycle, but prove its non-reachability from atomic defaults instead of misrepresenting it as atomic. Keep fixture exclusion exact so a new or renamed shipped writer fails closed.

**Risks or limitations:** This is a static source gate, not an operating-system sandbox or whole-program proof. It detects direct Node filesystem primitives and reviewed wrappers; shell tools and external processes remain governed by their separate policies and transaction adapters. Dependency injection exists for tests, while the non-reachability assertion covers the production default server path. Moving or editing an allowed call intentionally breaks the digest/line binding and requires review.

**Rollback method:** Revert the Task 7 commit with a new commit. Removing the inventory removes a CI guard only and requires no user-data migration; do not delete workspace, transaction, audit, profile, or change-set state. Keep writable atomic production construction disabled if the inventory is absent.

**Next step:** Publish Task 7 as `test: close workspace mutation inventory`, require exact-head Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package, then open Phase 3 Volume 4 with Task 8 owner binding, Policy resource resolution, and bounded `undo_change_set`.

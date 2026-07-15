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

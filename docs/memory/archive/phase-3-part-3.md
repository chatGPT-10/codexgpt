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

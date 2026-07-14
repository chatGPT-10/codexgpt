# Phase 3 — Atomic Transactions, Persistent Audit, Mutator Migration, and Move Acceptance — Volume 2

This archive is append-only. It continues Phase 3 after Volume 1 crossed its direct-read threshold at STEP-277. Do not store secrets, file bodies, complete tokens, private keys, credential-bearing URLs, or sensitive absolute paths.

## STEP-278 — Close the Phase 3A/3B CI repair gate

**Status:** Complete as a closure reconciliation step; this documentation head is ready for the authorized scoped commit and exact-head CI.

**Goal:** Record immutable replacement CI evidence for the Phase 3A/3B repair, open the required continuation archive volume, and establish the verified baseline for Phase 3C planning.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; this new continuation archive. Production source changed: none.

**Implementation summary:** Confirmed local `main`, `origin/main`, and GitHub Actions run `29369658101` all point to STEP-277 implementation commit `88bd4b9`. The repair closes all three observed Phase 3A/3B CI causes: child fixture discovery, platform-dependent protected-source hashes, and partial first-open installation-state visibility. Volume 1 is left unchanged after STEP-277 and this file becomes the active Phase 3 archive.

**Verification commands:** `gh run watch 29369658101 -R chatGPT-10/codexgpt --exit-status --interval 10`; `gh run view 29369658101 -R chatGPT-10/codexgpt --json conclusion,status,headSha,url,jobs`; `git status --short --branch`; `git rev-parse HEAD`; `git rev-parse origin/main`; documentation link, stale-state, size, whitespace, secret-signature, and scope checks.

**Verification results:** Run `29369658101` completed successfully for Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, and Windows Node 24. Every job passed Checkout, Install, Build, Regression Tests, Smoke Test, and Check Package Contents. Both local and remote `main` resolved to `88bd4b9ff5f8ccec21abcd1ddf78d879302ddd8a`, and the working tree was clean before this closure reconciliation.

**Decisions made:** Treat Phase 3A/3B CI as closed only at the passing replacement head, not at any earlier failing publication. Keep contract V1, public legacy writers, and dormant persistent-audit registration unchanged until Phase 3C enables one coherent V2 snapshot. Start Phase 3C with a written TDD plan derived from the already-approved design rather than editing production code directly.

**Risks or limitations:** The closure documentation commit will create a new exact head and must itself pass CI before Phase 3C implementation begins. Phase 3C and Phase 3D remain unimplemented. No production deployment, credential operation, system policy, user workspace, or audit evidence was changed by this closure step.

**Rollback method:** Revert only the STEP-278 documentation, rule, memory, and plan reconciliation. Do not revert the passing STEP-277 implementation or rewrite Volume 1.

**Next step:** Commit and push the STEP-278 documentation closure, require its exact-head CI to pass, then read the approved Phase 3C specification in full and write the detailed RED/GREEN implementation plan before production changes.

## STEP-279 — Plan Phase 3C mutator migration and undo

**Status:** Complete; ready for the authorized scoped documentation commit and exact-head CI.

**Goal:** Verify the Phase 3A/3B closure head, resolve the cross-slice contract V2 sequencing conflict, inventory current workspace writers, and produce an executable TDD plan for Phase 3C.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive.

**Implementation summary:** Confirmed closure commit `953e080` passed exact-head GitHub Actions run `29370073046` on Ubuntu/Windows Node 20/24. Read the approved Phase 3C and 3D designs together and found a real ordering conflict: Phase 3C defines exact V2 as 31 tools including `move_paths`, while Phase 3D owns `move_paths`. Chose the fail-closed correction: Phase 3C migrates all writers and prepares runtime/query/undo/versioned schemas, but public contract 2 remains unavailable until Phase 3D implements `move_paths` and activates the coherent 31-tool snapshot. Inventoried direct workspace primitives in `src/fsOps.ts`, `src/handoffOps.ts`, `src/proContext.ts`, `scripts/pro-apply.mjs`, and supported `.ai-bridge` paths in `scripts/codexpro.mjs`; separated transaction/audit/app-state/installer primitives. Wrote a ten-task RED/GREEN plan with per-part review, neat-freak, publication, and exact-head CI gates.

**Verification commands:** `gh run view 29370073046 -R chatGPT-10/codexgpt --json conclusion,status,headSha,jobs,url`; `rg` searches over the Phase 3C/3D designs, master plan, schemas, registration, and every low-level filesystem primitive in `src/` and shipped scripts; plan placeholder/checkbox/path scan; Markdown relative-link audit; `git diff --check`; secret-signature scan; intended-file review.

**Verification results:** Closure run `29370073046` succeeded for all four OS/Node jobs and every Build, Regression, Smoke, and Package step. The writer inventory found the expected legacy workspace write sites and the separately classified application-state/audit/transaction/installer sites. The plan covers version selection, encrypted change sets, the commit handshake, write/edit, patch, bridge/handoff/Pro-context/probe/CLI writers, the static closure gate, undo, production runtime injection, and Phase 3C acceptance. No production source changed in this planning step.

**Decisions made:** Do not advertise a partial V2 and do not use a placeholder `move_paths` handler. Keep V1 as the only constructible public contract after Phase 3C; make V2 construction fail with a bounded incomplete-capability error until Phase 3D. Preserve the user-authorized per-part scoped stage, English commit, push, and exact-head CI flow.

**Risks or limitations:** Phase 3C remains unimplemented. The plan introduces a deliberate clarification to the approved rollout sequence but does not weaken either design's final 31-tool acceptance. The exact implementation may discover additional supported workspace writers; the static closure gate treats each as a blocker rather than silently excluding it.

**Rollback method:** Revert only the STEP-279 plan and documentation reconciliation. Do not rewrite the approved specifications, closed archives, or passing Phase 3A/3B implementation history.

**Next step:** Publish this planning step, require exact-head CI, then execute Phase 3C Task 1 with a focused RED test before production code.

## STEP-280 — Add the Phase 3C contract-version gate

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Establish strict server-lifecycle tool-contract selection while preserving the exact public V1 contract and preventing an incomplete V2 from reaching registration.

**Files changed:** `src/config.ts`; `src/server.ts`; `src/tools/schemas/codexpro.ts`; `config.example.env`; `test/transaction-contract-version.test.mjs`; `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive.

**Implementation summary:** Added strict `CODEXPRO_TOOL_CONTRACT_VERSION=1|2` and `--tool-contract-version`, with V1 default and a missing-value CLI error. Existing programmatic configuration objects that omit the new field map to V1 for one migration cycle. Split the canonical names into frozen exact V1 and V2 sets, retained `CANONICAL_CODEXPRO_CHILD_TOOLS` as the identical V1 compatibility object, and added a fail-closed selector. V2 reserves the exact 31 names but server construction rejects it before manager/tool creation until atomic mode, persistent audit, Phase 3 state, and especially Phase 3D `move_paths` capability are complete. No placeholder tool or partial public registration was added.

**Verification commands:** initial `npm run build; node --test test/transaction-contract-version.test.mjs` RED; repeated `npm run build`; focused/adjacent `node --test test/transaction-contract-version.test.mjs test/transaction-config-and-path-policy.test.mjs test/audit-config.test.mjs test/audit-architecture.test.mjs test/codexpro-contract.test.mjs test/server-config-contract.test.mjs test/config-realpath.test.mjs`; final focused contract rerun; `git diff --check`; secret-signature, relative-link, stale-state, Memory/archive-size, and intended-file checks.

**Verification results:** The deliberate RED failed because the V1/V2 exports did not exist. The first GREEN run exposed that existing hand-built configurations omit new fields; the compatibility fix treats omission as V1 rather than weakening V2 checks. Final Build passed and the combined focused/adjacent gate passed 37/37 with 0 failures; the last contract rerun passed 17/17. V1 direct/supertool contracts stayed exact.

**Decisions made:** Missing `toolContractVersion` is V1 only for the compatibility cycle; invalid explicit values fail. Keep the complete V2 name reservation separate from operational schema/registration maps until Phase 3D. Check the `move_paths` capability before audit/state readiness in the temporary production gate so the bounded failure reports the actual cross-slice blocker.

**Risks or limitations:** Contract V2 remains intentionally unusable. The V2 name set does not imply a registered handler or output schema. Writable atomic mode is still blocked because writer migration has not begun. Exact-head CI remains required before Task 2.

**Rollback method:** Revert the Task 1 commit. Configuration then returns to implicit V1-only behavior; no workspace, application state, audit evidence, or credentials require migration.

**Next step:** Commit and push Task 1, require exact-head Ubuntu/Windows Node 20/24 CI, then begin Task 2 with failing change-set schema and encryption tests.

## STEP-281 — Harden transient Windows audit-lock release

**Status:** Locally complete and included in the Phase 3C Task 1 publication gate; exact-head CI remains required.

**Goal:** Fix the real Windows concurrency defect exposed by the complete Task 1 regression without weakening persistent-audit ownership or fail-closed behavior.

**Files changed:** `src/audit/lock.ts`; `test/audit-lock-release.test.mjs`; `Memory.md`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive. The Task 1 files listed in STEP-280 remain part of the same unpublished phase-part boundary.

**Implementation summary:** The first complete regression failed when one audit writer had verified ownership but Windows returned a transient `EPERM` while renaming `writer.lock` to its private release directory. Release previously attempted that rename once even though acquisition already treats Windows directory rename conflicts as transient contention. Added injected release primitives and a fixed 1/2/4 ms retry schedule for only `EPERM`, `EACCES`, and `EBUSY`. Every attempt rereads and validates the exact token, instance, and PID before the atomic rename. Unknown failures still fail immediately, and exhausted retries preserve the active lock.

**Verification commands:** deliberate RED `npm run build; node --test test/audit-lock-release.test.mjs`; GREEN `npm run build; node --test test/audit-lock-release.test.mjs test/audit-store.test.mjs`; twenty repeated runs of the two-process audit append test; replacement `npm run build; node --test test/*.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`.

**Verification results:** RED produced 0/2 pass because production ignored the injected release operations. GREEN passed 6/6 including three release classifications and the original cross-process append test. The additional concurrency loop passed 20/20. Replacement Build passed; complete regression passed 637/638 with 0 failures and 1 established platform skip; all eight Smoke sections, native-Windows Stress, and the 237-file package dry-run passed. The earlier complete run had failed 1/635 specifically at audit lock release and is superseded by this root-cause repair, not ignored.

**Decisions made:** Retry only errors known to be transient directory-sharing conflicts on supported Windows filesystems. Keep the retry budget synchronous and below 8 ms total because release is a short critical section. Revalidate ownership before each attempt so a retry can never release a changed or foreign lock. Treat this as a Task 1 publication-gate repair rather than stacking later Phase 3C work on a failing baseline.

**Risks or limitations:** This is a filesystem coordination mechanism, not an operating-system sandbox or database lock. Persistent contention still returns `AUDIT_BUSY` after four rename attempts. Exact-head Ubuntu/Windows Node 20/24 CI is still required before Task 2 begins.

**Rollback method:** Revert the Task 1 phase-part commit. The previous one-shot release behavior returns; no audit records, workspace files, credentials, or user configuration require migration.

**Next step:** Complete neat-freak scope and secret checks, publish the combined Task 1 plus gate repair, require exact-head CI, then begin Task 2 with RED change-set schema and encrypted-store tests.

**Post-review correction:** The result-first adversarial review found that a JavaScript caller could supply numeric contract version `3` directly to the configuration assertion despite the strict environment and CLI parser. A new RED reproduced the misclassification as V2; the assertion now accepts only omitted/`1`/`2` and rejects every other runtime value before capability checks. The replacement focused/adjacent gate passed 43/43, and the fresh complete Build/regression/Smoke/Stress/package gate retained the results recorded above.

## STEP-282 — Close Phase 3C Task 1 publication

**Status:** Complete; Task 1 is published and its exact-head CI passed.

**Goal:** Verify the published contract-version and audit-lock repair head before any Task 2 work is stacked on it.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive. Production source changed: none in this closure record.

**Implementation summary:** Published the reviewed Task 1 boundary as commit `a9acc14` and observed its exact GitHub Actions head through completion. Marked the Task 1 plan gate complete and advanced the active boundary to Task 2 encrypted change-set storage.

**Verification commands:** `git push origin main`; `gh run watch 29372615528 -R chatGPT-10/codexgpt --exit-status --interval 10`; exact-head run/job inspection.

**Verification results:** Run `29372615528` succeeded. Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, and Windows Node 24 each passed Checkout, Install, Build, Regression Tests, Smoke Test, and Check Package Contents.

**Decisions made:** Treat Task 1 as closed only after its exact published head passed all four matrices. Keep public V2 fail-closed and start Task 2 from this verified baseline.

**Risks or limitations:** Task 2 and later Phase 3C writers remain unimplemented. This closure does not activate V2 or writable atomic mode.

**Rollback method:** Revert `a9acc14` with a new commit if Task 1 must be removed; do not rewrite published history or delete audit/change-set state.

**Next step:** Write and confirm RED tests for strict change-set schemas, HKDF-separated AES-256-GCM blobs, and bounded persistent storage.

## STEP-283 — Add authenticated encrypted change-set storage

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Persist bounded undo before-state outside workspaces without plaintext disclosure, metadata substitution, path escape, or silent retention drift, while keeping public contract V1 unchanged.

**Files changed:** `src/changesets/types.ts`; `src/changesets/schemas.ts`; `src/changesets/crypto.ts`; `src/changesets/store.ts`; `src/changesets/index.ts`; `src/tools/schemas/transactionResult.ts`; `src/config.ts`; `config.example.env`; `test/change-set-schema-and-crypto.test.mjs`; `test/change-set-store.test.mjs`; Phase 3 plan, rules, master plan, Memory, and this archive. The existing generic HKDF primitive and transaction barrel were sufficient, so no unnecessary `src/transactions/installation.ts` or `src/transactions/index.ts` edit was made.

**Implementation summary:** Added strict change-set draft/persisted manifest, operation, state, retention, error, and shared V2 transaction-result schemas. Derived separate HKDF subkeys for manifest HMAC and rollback encryption. Each rollback blob uses AES-256-GCM with an independent 12-byte nonce and AAD binding schema version, change-set ID, blob ID, operation ID, and before SHA-256. Persisted manifests carry an HMAC over canonical facts, so structurally valid metadata substitution fails. The store validates plaintext hashes in memory, publishes synced ciphertext before the signed manifest, uses exclusive IDs, rejects linked/escaped state directories, authenticates before reads or deletion, enforces stale-safe state transitions, and keeps only small tombstones after expiry. Capacity is made available before publication; inspection failure produces an explicit non-undoable `retention_unavailable` result instead of throwing after success. Added strict bounded configuration with defaults of 8 MiB/change set, 128 MiB/installation, 20 active/workspace, 24-hour active retention, and 30-day tombstones.

**Verification commands:** deliberate schema/crypto import RED; focused schema/crypto GREEN; deliberate store import RED; focused store GREEN; strict-config RED/GREEN; manifest-substitution RED/GREEN; retention-publication and directory-durability RED/GREEN; symlinked-state RED/GREEN; `npm run build`; focused/adjacent transaction, audit, installation, manifest-store, and contract tests; `node --test test/*.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; dependency, write-primitive, whitespace, secret/plaintext, link, size, and scope scans.

**Verification results:** Final change-set focused tests passed 13/13. The adjacent transaction/audit group passed 39/39. Complete regression passed 650/651 with 0 failures and 1 established platform skip. Build, all eight Smoke sections, native-Windows Stress, and the 249-file package dry-run passed. RED runs separately proved missing modules, silent numeric clamping, unauthenticated valid-JSON substitution, post-publication retention failure, missing blob-directory durability enforcement, and state-directory symlink escape before each root cause was repaired.

**Decisions made:** Authenticate manifest metadata separately from encrypted bytes because create/move operations may have no rollback blob. Reject invalid new retention settings instead of silently clamping them. Permit configuration above the 8 MiB default within a fixed 64 MiB per-change-set ceiling. Run capacity enforcement before manifest publication. Keep all changeset primitives application-state-only with no shell, Git, network, database, or background-worker dependency.

**Risks or limitations:** The store is not yet wired to public writers; Task 3 owns the server-lifecycle runtime and commit handshake. Encryption protects against casual disclosure and unintended indexing, not an attacker controlling the same OS account and installation key. External processes remain outside the workspace lock. Contract V2 and writable atomic mode remain unavailable.

**Rollback method:** Revert the Task 2 commit before any runtime integration. Existing V1 requests and workspace files are unaffected. Never delete already-created audit or change-set evidence as part of configuration rollback.

**Next step:** Publish Task 2, require exact-head Ubuntu/Windows Node 20/24 CI, then write Task 3 handshake RED tests.

## STEP-284 — Add the server-owned audited mutation commit runtime

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Make one server-lifecycle runtime own every prepared workspace mutation until required terminal audit, authenticated change-set publication, transaction finalization, or proven rollback completes, without changing the public V1 writer surface.

**Files changed:** `src/mutations/types.ts`; `src/mutations/runtime.ts`; `src/mutations/writers.ts`; `src/mutations/index.ts`; `src/server.ts`; `src/audit/transactionParticipant.ts`; `src/audit/index.ts`; `src/policy/integration.ts`; `test/mutation-runtime.test.mjs`; `fixtures/mutation-audit-failure-child.mjs`; `AGENTS.md`; `SECURITY.md`; `CHANGELOG.md`; the Phase 3C plan; the master plan; `Memory.md`; this archive.

**Implementation summary:** First confirmed Task 2 commit `c01a698` and exact-head run `29374274230` as the verified base. Added a private non-enumerable pending-mutation handle and server-local registration binding. Providers may prepare exact create/replace/delete byte operations but cannot install or finalize them. `WorkspaceMutationRuntime` tracks every handle in an async invocation scope, rolls back provider exceptions, rejects missing, foreign, or ambiguous handles, and keeps public serialization free of transaction metadata. Before visible installation it correlates transaction and change-set IDs, workspace keys, operation IDs/kinds/paths, after hashes and byte counts, expected before hashes, rollback blob hashes, and ciphertext accounting. The commit path installs visible operations, persists required terminal audit inside the audit participant, publishes the authenticated change set inside its participant, proves the committed transaction manifest, then applies the version-specific public projection. Audit failure, change-set failure, participant-proof failure, or provider contract drift rolls back the complete operation set; a change set published without participant proof is marked `recovery_required`. Policy Kernel consumes the private handle, while the legacy transaction-audit helper retains compatibility through a separated `commitAuditParticipant` function. No public tool is configured as an atomic mutator yet, so V1 remains exact and writable atomic startup remains blocked.

**Verification commands:** RED `npm run build; node --test test/mutation-runtime.test.mjs`; repeated GREEN `npm run build; node --test test/mutation-runtime.test.mjs`; adjacent `node --test test/mutation-runtime.test.mjs test/audit-transaction-participant.test.mjs test/audit-runtime-integration.test.mjs`; attempted `node --test test`; complete `node --test test/*.test.mjs`; `npm run build`; `npm run smoke`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; neat-freak documentation, rule, link, secret-signature, size, stale-state, and intended-scope checks.

**Verification results:** Task 2 run `29374274230` passed Ubuntu Node 20/24 and Windows Node 20/24; every job completed Build, Regression, Smoke, and Package. The Task 3 initial RED failed because `dist/mutations/index.js` did not exist. The focused runtime suite passed 11/11, including real three-operation create/replace/delete, exact transaction/change-set correlation, required-audit rollback, change-set rollback, missing handle, provider throw, double finalize, recovery-required reconciliation, committed cleanup-pending proof, V1 metadata hiding, Policy wrapper finalization, single-terminal post-audit failure handling, and an independent-process audit failure. The adjacent audit/transaction group passed 22/22. The complete regression ran 662 tests with 661 pass, 0 fail, and 1 established platform skip. Build, all eight Smoke sections, native-Windows Stress, and the 257-file package dry-run passed. `node --test test` was a non-code command-shape failure because Node treated the directory as a module; the documented wildcard command passed and remains authoritative.

**Decisions made:** Keep the private symbol module-scoped and non-enumerable. Force the required participant set inside the runtime instead of trusting each writer. Validate change-set semantic correlation before visible install, not only schema validity during persistence. If change-set bytes were published but participant proof failed, retain bounded authenticated evidence as `recovery_required` rather than deleting it. Keep runtime injection dormant until Task 4 migrates the first writers, preserving exact V1 behavior and the Phase 3D complete-V2 activation gate.

**Risks or limitations:** Public writers still use reviewed legacy behavior. The current server accepts an injected runtime and exact atomic-mutator name set, but default writable runtime construction remains intentionally blocked until writer migration. External processes remain outside the workspace lock. The runtime guarantees rollback/recovery evidence, not database-style simultaneous visibility. A post-commit public-projection programming defect would be a recovery-class implementation error; all selected projections must remain deterministic and covered before activation.

**Rollback method:** Revert the Task 3 commit before enabling any atomic writer. Existing V1 requests, user workspace files, audit records, and already-published change-set state require no migration or deletion. Do not rewrite prior archive entries.

**Next step:** Publish Task 3, require exact-head Ubuntu/Windows Node 20/24 CI, then begin Task 4 with failing transaction-backed `write` and `edit` contract/behavior tests.

## STEP-285 — Add transaction-backed `write` and `edit` adapters

**Status:** Locally complete and verified; ready for the authorized scoped commit, push, and exact-head CI.

**Goal:** Prepare `write` and `edit` as exact-byte server-owned transactions with strict V2 concurrency contracts while leaving public V1 and writable atomic startup unchanged until the complete writer inventory closes.

**Files changed:** `src/fsOps.ts`; `src/mutations/types.ts`; `src/mutations/runtime.ts`; `src/mutations/writers.ts`; `src/mutations/index.ts`; `src/policy/integration.ts`; `src/server.ts`; `src/tools/schemas/write.ts`; `src/tools/schemas/edit.ts`; `test/write-edit-transaction.test.mjs`; the Phase 3C plan; `CHANGELOG.md`; `SECURITY.md`; `AGENTS.md`; the master plan; `Memory.md`; this archive.

**Implementation summary:** Confirmed Task 3 commit `68036e8` and exact-head run `29375830950` as the clean baseline. Split legacy direct writes from dormant atomic preparation. Atomic `write`/`edit` now resolve through `PathGuard`, enforce secret and size policy before transaction preparation, validate optional lowercase caller hashes, capture observed before hashes and metadata, create exact UTF-8 buffers without BOM/newline conversion, and submit create/replace operations whose observed hashes are revalidated by the transaction kernel. Added one-file authenticated change-set construction with encrypted before-state, deterministic post-commit V1/V2 projection, and tool-specific failure projection after proven rollback. Added strict V2 success and eight-code transaction/audit failure schemas without widening V1. The server selects V1/V2 input/output definitions by contract version, but the existing production capability gates still reject writable atomic mode and all V2 construction before registration.

**Verification commands:** deliberate missing-export RED; repeated `npm run build`; focused `node --test test/write-edit-transaction.test.mjs`; adjacent write/edit/mutation/Policy tests; `node --test test/*.test.mjs`; five repeated `npx --yes node@20 --test test/write-edit-transaction.test.mjs`; `npm run smoke`; `npm run stress`; `npm pack --dry-run`; `git diff --check`; neat-freak rule, documentation, link, size, secret-signature, protected-Smoke, dependency, and intended-scope checks.

**Verification results:** RED failed only because the new adapter export did not exist. Final focused transaction tests passed 11/11, including strict V1/V2 shapes, all eight V2 failure codes, absent/present hashes, no-clobber create, exact UTF-8, BOM/CRLF preservation, pre-transaction snippet failures, stale-version conflict, required-audit rollback, recovery-class post-commit projection failure, and successful-read old/new byte visibility. Node 20.20.2 passed the final suite after five earlier repeated GREEN runs. Complete regression ran 673 tests with 672 pass, 0 fail, and 1 established platform skip. Build, all eight Smoke sections, native-Windows Stress, and the 257-file package dry-run passed. A first full run exposed a transient Windows `ENOENT` while opening across atomic rename; the corrected test distinguishes retryable open availability from byte atomicity and proves every successful read is exactly complete old or complete new content. Adversarial review then found that a committed result projection defect could look retryable; it now maps to `TRANSACTION_RECOVERY_REQUIRED`, and a failure-projector defect returns the generic fail-closed result without attempting duplicate terminal audit.

**Decisions made:** Keep caller hash optional but always revalidate the internally observed before hash. Treat invalid UTF-8 as non-text rather than accepting replacement characters. Expose only normalized relative conflict paths, never current hashes. Keep atomic adapters dormant and preserve exact V1 direct/supertool output until the complete production gate is enabled. Do not create missing parent directories outside the transaction.

**Risks or limitations:** Atomic `write` currently requires an existing parent directory; missing-parent `create_dirs=true` remains a named activation blocker for the later writer/static closure gate. Windows readers may receive a transient retryable open error during replacement, but successful reads are never partial. Public writers remain legacy, V2 remains unavailable, and external editors remain outside the lock. Task 5 and later writers are not yet migrated.

**Rollback method:** Revert the Task 4 commit before production atomic activation. Existing V1 requests and workspace files remain unaffected; do not delete audit, transaction, or change-set evidence.

**Next step:** Publish Task 4, require exact-head Ubuntu/Windows Node 20/24 CI, then begin Task 5 with failing multi-file `apply_patch` all-or-nothing tests. This volume is now closed after crossing the direct-read threshold; begin STEP-286 in `docs/memory/archive/phase-3-part-3.md`.

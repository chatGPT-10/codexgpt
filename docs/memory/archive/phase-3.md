# Phase 3 — Atomic Transactions and Persistent Audit

This archive is append-only. It records Phase 3 design, implementation, verification, reconciliation, publication, and closure steps. Do not store secrets, file bodies, complete tokens, private keys, credential-bearing URLs, or sensitive absolute paths.

## STEP-263 — Approve and write the Phase 3A–3D design package

**Status:** Complete as a design step. Implementation, staging, commit, push, and publication have not started.

**Goal:** Decompose Phase 3 into independently reviewable security boundaries and write exact approved specifications for atomic workspace transactions, persistent audit, complete mutator migration with bounded undo, and transactional file movement.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/superpowers/specs/2026-07-14-phase-3a-atomic-transaction-design.md`; `docs/superpowers/specs/2026-07-14-phase-3b-persistent-audit-design.md`; `docs/superpowers/specs/2026-07-14-phase-3c-mutator-migration-and-undo-design.md`; `docs/superpowers/specs/2026-07-14-phase-3d-move-paths-and-acceptance-design.md`; `docs/memory/archive/phase-3.md`.

**Implementation summary:** Approved the recommended four-slice design. Phase 3A defines a Node-native, hard-link-backed transaction kernel with external control journals, reserved same-volume artifacts, SHA-256 preconditions, conservative cross-process workspace locks, normal-failure rollback, and deterministic recovery before workspace reuse. Phase 3B defines authorization/execution audit events, canonical JSONL HMAC chaining, bounded rotation/retention, corruption behavior, required mutation participation, and a full-only bounded query surface. Phase 3C defines tool contract V1/V2 coexistence, migration of every supported workspace writer, encrypted and bounded change-set before-state, and conflict-checked `undo_change_set`. Phase 3D defines required-hash `move_paths`, stage-all/install-all handling for chains, cycles, and Windows case-only rename, plus the complete Phase 3 acceptance gate. The design explicitly does not claim database-style instantaneous multi-file atomicity or protection from an attacker controlling the same OS account and installation key.

**Verification commands:**

- `npm run build`
- `git diff --check`
- placeholder scan for `TBD|TODO|FIXME|placeholder|to be decided` across the four Phase 3 specifications
- `show_changes` for exact modified/untracked scope

**Verification results:** TypeScript Build passed. `git diff --check` passed with only the existing Windows LF-to-CRLF working-copy warnings for two modified Markdown files. The placeholder scan returned no matches. Scope review showed only the approved design specifications, authoritative master plan, project instructions, memory index, and this Phase 3 archive; no production source, tests, package configuration, protected Smoke source, credentials, system policy, staged files, commits, or remote state were changed.

**Decisions made:** Use one approved four-slice sequence: 3A transaction kernel, 3B persistent audit, 3C all-mutator migration and bounded undo, and 3D `move_paths` plus phase acceptance. Keep native Windows primary and WSL optional. Use Node native file APIs and hard links; fail closed when the atomic backend is unavailable rather than adding a PowerShell, Git, copy/delete, or direct-write fallback. Keep contract V1 and its 28-tool exact surface unchanged for one migration cycle; contract V2 contains 31 tools and requires atomic transactions plus valid audit configuration. Keep state outside the workspace and Git. Do not cross OAuth, sandbox, credential migration, destructive Git, system-policy, or Phase 6–9 gates.

**Risks or limitations:** The hard-link V1 backend excludes filesystems or volumes that cannot provide the required capability. Ordinary filesystems do not provide database-style instantaneous visibility for a multi-file commit; external applications may observe an intermediate state during an abrupt process failure until recovery runs. Directory-sync support and metadata preservation vary by platform/filesystem and must be reported honestly. Static shared-secret identity is not strong per-human ownership; Phase 8 remains responsible for OAuth subject identity. The written package is large and implementation must remain split into the four approved slices rather than becoming one broad change.

**Rollback method:** Revert only the uncommitted STEP-263 documentation and rule changes. No production behavior, user workspace data, transaction state, audit evidence, change-set data, credentials, Git history, or system configuration exists from this design step.

**Next step:** Review the written specifications. After explicit approval of the written package and any applicable Git write, invoke the `writing-plans` workflow and create a detailed TDD implementation plan for Phase 3A only. Do not begin Phase 3B–3D implementation, stage, commit, push, install system components, or alter policy defaults as part of that plan.

## STEP-264 — Write the Phase 3A TDD implementation plan

**Status:** Complete as a planning step. Production implementation, staging, commit, push, and publication have not started.

**Goal:** Convert the approved Phase 3A design into an executable test-driven plan with exact file boundaries, interfaces, failure expectations, verification commands, and per-task stopping points.

**Files changed:** `docs/superpowers/plans/2026-07-14-phase-3a-atomic-transaction.md`; `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/memory/archive/phase-3.md`. The previously uncommitted Phase 3 design package remains in the same working tree.

**Implementation summary:** Used the `writing-plans` workflow to produce a nine-task plan covering configuration and reserved paths, strict transaction schemas, state-root and installation keys, atomic manifest persistence, conservative cross-process locks, hard-link filesystem primitives, the transaction/participant state machine, crash recovery and workspace readiness, and the complete Phase 3A acceptance gate. The plan uses synchronous control-plane persistence and recovery with asynchronous file-data operations. Self-review added a critical fail-closed boundary: before Phase 3C migrates every public workspace writer, `CODEXPRO_FILE_TRANSACTIONS=atomic` is valid only with `CODEXPRO_WRITE_MODE=off`; server construction rejects writable atomic mode before registering tools. The allowed read-only atomic configuration wires recovery before workspace handle issue or refresh. Implementation tasks are reserved as STEP-265 through STEP-273.

**Verification commands:**

- `npm run build`
- `git diff --check`
- plan placeholder scan for `TBD`, `TODO`, `FIXME`, deferred-detail phrases, and unspecified error handling
- STEP sequence search for every task checkpoint
- `show_changes` for exact unstaged scope

**Verification results:** TypeScript Build passed. `git diff --check` passed with only Windows LF-to-CRLF working-copy warnings for existing modified Markdown files. The placeholder scan returned no matches. Task checkpoints are sequential from STEP-265 through STEP-273. Scope review showed nine unstaged documentation/rule/memory files: the four approved specifications, the Phase 3A implementation plan, the authoritative master plan, `AGENTS.md`, `Memory.md`, and this archive. No production source, test, package configuration, protected Smoke source, credential, system policy, staged file, commit, or remote state changed.

**Decisions made:** Keep Phase 3A as an internal kernel slice with no public tool schema or canonical tool-count change. Use Node-native APIs and same-volume hard links, fail closed on unsupported backends, keep native Windows primary and WSL optional, and preserve the existing self-hosted Cloudflare boundary. Require exact test-created fixture roots for crash-process arguments and prohibit real user state paths or sensitive contents. Do not allow configuration to claim atomic public writes before Phase 3C's complete mutation-closure gate.

**Risks or limitations:** The plan is intentionally detailed and large. Hard-link capability, directory-sync support, metadata preservation, and process-liveness classification must be proven on native Windows and Linux rather than assumed. Phase 3A read-only atomic mode can validate startup recovery, but existing public mutators remain legacy and cannot be enabled together with atomic mode. Persistent audit remains Phase 3B and transaction-backed public writers remain Phase 3C.

**Rollback method:** Revert the uncommitted plan and STEP-264 memory/archive edits. No production behavior, transaction state, workspace data, credentials, Git history, or system configuration depends on this planning step.

**Next step:** Execute the Phase 3A plan task-by-task using `superpowers:subagent-driven-development` as the recommended workflow, or `superpowers:executing-plans` inline. Stop after local Phase 3A verification and before staging, commit, push, publication, or Phase 3B.

## STEP-265 — Add the Phase 3A configuration and reserved-artifact boundary

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Introduce the inactive-by-default transaction mode, reject writable atomic configuration before tool registration, and hard-block every `.codexpro-txn-*` path segment independently of configured globs.

**Files changed:** `src/config.ts`; `src/server.ts`; `src/guard.ts`; `config.example.env`; `test/transaction-config-and-path-policy.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added strict `legacy|atomic` parsing through environment or CLI, a capability-aware startup assertion, and a first-line server construction guard with `workspaceMutatorsAtomic: false`. Added an unconditional platform-aware reserved-segment predicate to `PathGuard`. The exact V1 `server_config` output and existing writer implementations remain unchanged.

**Verification commands:** `npm run build`; `node --test test/transaction-config-and-path-policy.test.mjs` before implementation; `npm run build`; `node --test test/transaction-config-and-path-policy.test.mjs test/path-policy.test.mjs test/config-realpath.test.mjs`.

**Verification results:** The new test first failed because the configuration export did not exist. After the minimal implementation, TypeScript Build passed and all 13 focused/adjacent tests passed with 0 failures and 0 skips.

**Decisions made:** Keep the default `legacy`. Permit `atomic` only with `writeMode: off` until Phase 3C proves complete mutator migration. Reserved artifact blocking is not configurable.

**Risks or limitations:** No public writer is transaction-backed in Phase 3A. Atomic mode is intentionally read-only until Phase 3C. The flag is not added to the exact V1 public configuration output.

**Rollback method:** Remove the new config field/assertion, server startup call, reserved predicate, example flag, and focused test. No workspace data or transaction state has been created.

**Next step:** Implement STEP-266 stable transaction types and strict manifests without staging or committing.

## STEP-266 — Define stable transaction types and strict manifests

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Establish the closed internal error/type surface and ensure persistent transaction records contain only bounded safe facts.

**Files changed:** `src/transactions/types.ts`; `src/transactions/schemas.ts`; `src/transactions/index.ts`; `test/transaction-schema.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added eight stable error codes, byte-oriented request types, explicit manifest/operation states, participant and fault interfaces, and strict Zod schemas for manifests, operations, installation state, process instances, and lock owners. Cross-field validation enforces unique operation/comparison keys, coherent operation kinds, sibling reserved artifacts, and participant consistency.

**Verification commands:** `npm run build`; RED `node --test test/transaction-schema.test.mjs`; `npm run build`; GREEN `node --test test/transaction-schema.test.mjs`.

**Verification results:** RED failed because `dist/transactions/index.js` did not exist. Build then passed and all 5 schema tests passed with 0 failures and 0 skips.

**Decisions made:** Persist no file bodies or absolute workspace roots. Keep the barrel limited to stable types and strict parsers; unsafe filesystem helpers remain private to later modules.

**Risks or limitations:** These are internal Phase 3A contracts; no public MCP schema or tool count changes.

**Rollback method:** Remove the three transaction contract modules and the focused schema test.

**Next step:** Implement STEP-267 application-state root, installation state, and domain-separated keys.

## STEP-267 — Add application-state root and installation key separation

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Create deterministic platform state paths, exclusive installation state, HKDF-separated subkeys, and opaque persistent workspace references without touching real profile paths in tests.

**Files changed:** `src/transactions/stateRoot.ts`; `src/transactions/installation.ts`; `src/transactions/index.ts`; `test/transaction-installation-state.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added explicit `CODEXPRO_HOME`, Windows `LOCALAPPDATA`, and XDG/fallback resolution; safe state-directory helpers; exclusive `installation.json` creation with file sync and best-effort directory sync; strict reread; canonical platform root normalization; HKDF domain separation; and HMAC workspace-state keys.

**Verification commands:** RED focused installation test; `npm run build`; `node --test test/transaction-installation-state.test.mjs test/policy-identity-context.test.mjs`.

**Verification results:** RED failed on the absent export. Build passed and all 13 installation/identity tests passed with 0 failures and 0 skips.

**Decisions made:** Keep Phase 2 identity keys unchanged. Use a distinct 256-bit Phase 3 installation master key and opaque `wsk_` references. Test only injected temporary state roots.

**Risks or limitations:** Portable mode bits do not represent Windows ACL guarantees. Directory sync remains best-effort and is not claimed as universal power-loss durability.

**Rollback method:** Remove the state-root and installation modules, their barrel exports, and focused test; no real user state was created.

**Next step:** Implement STEP-268 the root-confined atomic manifest store.

## STEP-268 — Add the root-confined atomic manifest store

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Persist strict transaction manifests without exposing partial JSON or deleting the last valid generation before replacement.

**Files changed:** `src/transactions/atomicStateFile.ts`; `src/transactions/index.ts`; `test/transaction-manifest-store.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added a generic root-confined atomic JSON store, same-directory exclusive temporary files, file sync before rename, directory-sync capability reporting, exact temporary cleanup, opaque manifest paths, generation-1 initial writes, monotonic next writes, stale-write detection, and strict manifest enumeration.

**Verification commands:** RED focused test; `npm run build`; `node --test test/transaction-manifest-store.test.mjs test/transaction-schema.test.mjs`.

**Verification results:** Build passed and all 9 manifest/schema tests passed. Recorded operation order matched the approved durability sequence. Injected rename failure preserved the last valid record and removed only the owned temporary file.

**Decisions made:** Never unlink a valid target before replacement. Ignore non-committed temporary filenames during enumeration, but fail closed on malformed committed `.json` records.

**Risks or limitations:** Directory sync support is reported honestly and may be unsupported on Windows/filesystems. Atomic replacement is per state file, not a multi-file database transaction.

**Rollback method:** Remove the atomic state module, barrel exports, and focused test; temporary fixture state is deleted by tests.

**Next step:** Implement STEP-269 the conservative cross-process workspace lock.

## STEP-269 — Add the conservative cross-process workspace lock

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Serialize CodexPro mutations per opaque workspace key without deleting locks whose ownership cannot be proved dead.

**Files changed:** `src/transactions/workspaceLock.ts`; `src/transactions/index.ts`; `test/transaction-workspace-lock.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added exclusive process-instance registration, conservative PID liveness classification, atomic lock-directory acquisition, strict owner records, dead-owner quarantine by rename, bounded contention retries, and random-ownership-verified release through an owned release directory.

**Verification commands:** RED focused lock test; `npm run build`; `node --test test/transaction-workspace-lock.test.mjs`.

**Verification results:** Build passed and all 6 lock tests passed. Live, EPERM/unknown, and unverifiable PID-reuse cases remained busy; malformed owners were retained; dead owners were quarantined before a new claim; exact ownership was required for release.

**Decisions made:** Treat uncertainty as busy. Keep quarantined stale directories for recovery rather than recursively deleting them during acquisition.

**Risks or limitations:** OS process liveness cannot prove human identity or defeat an attacker controlling the same account. External applications do not participate in this lock.

**Rollback method:** Remove the lock module, barrel exports, and focused test; all test locks exist only under temporary roots.

**Next step:** Implement STEP-270 the hard-link atomic workspace filesystem primitives.

## STEP-270 — Add hard-link atomic workspace filesystem primitives

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Provide exact-byte inspection, staging, installation, rollback, finalization, and backend capability failure without any direct-write fallback.

**Files changed:** `src/transactions/atomicFs.ts`; `src/transactions/index.ts`; `test/transaction-atomic-fs.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added `PathGuard`-backed ordinary-file inspection, bigint identity facts, exact SHA-256 bytes, absent-parent facts, synced exclusive sibling stages, verified same-volume hard links, replacement/delete backups, no-clobber create/delete behavior, hash/identity checked install and rollback, and validated artifact cleanup.

**Verification commands:** RED focused atomic-FS test; `npm run build`; repeated `node --test test/transaction-atomic-fs.test.mjs` after canonicalizing the Windows short-path fixture root.

**Verification results:** Build passed and all 5 real-filesystem tests passed. BOM/CRLF bytes were hashed exactly; unsafe target kinds were rejected; create, replace, and delete rollback restored the required state; injected `EXDEV` produced `ATOMIC_BACKEND_UNAVAILABLE` without creating a logical target.

**Decisions made:** Treat WorkspaceManager-style canonical roots as an invariant. Use hard links for no-clobber creation and before-state backups, and rename only synced staged replacements.

**Risks or limitations:** The V1 backend excludes volumes lacking hard-link support. Ordinary filesystems still do not provide database-style simultaneous visibility across multiple logical paths.

**Rollback method:** Remove the atomic filesystem module, barrel exports, and focused test; all fixture artifacts are temporary.

**Next step:** Implement STEP-271 the transaction state machine and participant gate.

## STEP-271 — Add the transaction engine and participant gate

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Orchestrate strict manifests, deterministic staging/install, participant acknowledgment, complete rollback, and stable redacted errors under one workspace lock.

**Files changed:** `src/transactions/engine.ts`; `src/transactions/schemas.ts`; `src/transactions/index.ts`; `test/transaction-engine.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added request validation, opaque IDs, comparison-key sorting, initial planned manifests, generation-by-generation stage/install facts, the prepared and pending commit interfaces, required-participant persistence, durable committed transition before cleanup, reverse-order rollback, recovery-required escalation, and safe deterministic fault points.

**Verification commands:** RED focused engine test; `npm run build`; `node --test test/transaction-engine.test.mjs test/transaction-atomic-fs.test.mjs test/transaction-workspace-lock.test.mjs`.

**Verification results:** Build passed and all 18 focused engine/filesystem/lock tests passed. Three-operation transactions remained invisible during preparation, installed deterministically, rejected premature finalization, restored complete before-state after failures following install 1 or 2, and redacted absolute roots from public failures.

**Decisions made:** Persist every rollback-critical operation fact before advancing. Participant failure rolls back while backups remain available. Cleanup after durable commit may be pending, but never reverses an acknowledged commit.

**Risks or limitations:** The engine remains internal and is not yet wired to public write tools. Recovery of process interruption is handled by STEP-272.

**Rollback method:** Remove the engine module, planned-state schema allowance, barrel exports, and focused test.

**Next step:** Implement STEP-272 crash recovery and the workspace-readiness hook.

## STEP-272 — Add crash recovery and workspace readiness

**Status:** Complete locally; unstaged and unpublished.

**Goal:** Recover or freeze each canonical workspace before a handle is issued or refreshed, using only strict persisted facts and conservative lock ownership.

**Files changed:** `src/transactions/recovery.ts`; `src/transactions/index.ts`; `src/guard.ts`; `src/server.ts`; `test/transaction-recovery.test.mjs`; `test/transaction-crash-recovery.test.mjs`; `test/fixtures/transaction-crash-child.mjs`; `test/workspace-lifecycle.test.mjs`; `Memory.md`; this archive.

**Implementation summary:** Added a closed recovery-state policy, lazy application-state initialization, per-workspace recovery locking, oldest-first manifest processing, synchronous exact-byte/identity restoration, committed-only cleanup, rollback-directory cleanup, fail-closed workspace freezing, and a `beforeWorkspaceUse` lifecycle gate. Atomic read-only servers wire recovery; legacy servers ignore it.

**Verification commands:** RED recovery/lifecycle tests; `npm run build`; `node --test test/transaction-recovery.test.mjs test/workspace-lifecycle.test.mjs`; `npm run build`; `node --test test/transaction-crash-recovery.test.mjs test/transaction-recovery.test.mjs test/workspace-lifecycle.test.mjs`.

**Verification results:** Build passed. All 19 recovery, crash, and lifecycle tests passed. A child process exited immediately after the first visible install; a new process quarantined the dead lock owner, restored all three logical paths from persisted evidence, marked the manifest rolled back, and repeated recovery idempotently. Unprovable occupants froze the workspace and retained evidence.

**Decisions made:** Recovery is synchronous because workspace handle issuance is synchronous. Committed manifests can only finish cleanup; they can never be reversed. Unknown or malformed evidence maps to `TRANSACTION_RECOVERY_REQUIRED`.

**Risks or limitations:** Recovery relies on the same-account filesystem trust boundary and cannot coordinate external applications. Frozen workspaces require evidence repair or manual review before reuse.

**Rollback method:** Remove the recovery module, readiness hook, server dependency/wiring, and focused crash/lifecycle tests. No real user profile state is used by tests.

**Next step:** Execute STEP-273 full Phase 3A regression, Windows stress, package, static architecture review, and documentation reconciliation without staging.

## STEP-273 — Locally accept and reconcile Phase 3A

**Status:** Complete locally; unstaged, uncommitted, unpushed, and unpublished.

**Goal:** Prove the full Phase 3A implementation against focused, adjacent, complete, platform, package, protected-source, architecture, whitespace, and scope gates, then align project knowledge without beginning Phase 3B.

**Files changed:** Phase 3A production modules under `src/transactions/`; narrow configuration, guard, server, and lifecycle integration; Phase 3A tests and crash fixture; `config.example.env`; `CHANGELOG.md`; `SECURITY.md`; `AGENTS.md`; the master plan; `Memory.md`; this archive. Existing public writer modules and protected Smoke sources remain unchanged.

**Implementation summary:** Reconciled the internal transaction kernel as locally complete. Added an exact closed runtime-export architecture test, protected source hashes, dependency exclusions, manifest sensitive-field checks, and a fail-closed recovery-lock release boundary. Documented that `legacy` remains the default, `atomic` remains read-only until Phase 3C, public writers are not migrated, hard-link support is mandatory, external processes remain outside the lock, and multi-file behavior is rollback/recovery rather than database-style instantaneous atomicity.

**Verification commands:** `npm run build`; focused Phase 3A suite; adjacent security/lifecycle suite; `node --test test/*.test.mjs`; `npm run build`; `npm run smoke`; `npm run stress`; `npm pack --dry-run`; dedicated Node whitespace/conflict/final-newline scan over the exact changed scope; static searches and `show_changes` scope review.

**Verification results:** Phase 3A focused tests passed 44/44. Adjacent regression passed 38/38. Complete regression ran 590 tests with 589 pass, 0 fail, and 1 established platform capability skip. TypeScript Build passed. All eight Smoke sections passed. Native-Windows Stress passed, including the established Windows short-path environment. Package dry-run passed with 217 files, a 558.1 kB tarball, and 3.0 MB unpacked size. Static architecture checks proved the exact 28-tool public contract, unchanged protected Smoke hashes, no Shell/Git/network/worktree dependency in transaction modules, unconditional reserved-artifact blocking, and no absolute root, file body, diff, or credential fields in transaction manifests. The final change set remained entirely unstaged.

**Decisions made:** Accept Phase 3A locally but do not publish it yet. Keep every public writer on reviewed legacy behavior until Phase 3C migrates it explicitly. Treat inability to release a recovery lock safely as `TRANSACTION_RECOVERY_REQUIRED` and freeze the workspace.

**Risks or limitations:** No exact-head CI evidence exists because Git staging, commit, push, and publication were deliberately not performed. Phase 3B persistent audit, Phase 3C writer migration/undo, and Phase 3D move/total acceptance remain separate incomplete slices.

**Rollback method:** Before publication, discard the Phase 3A implementation and reconciliation changes together while preserving the previously approved design package if desired. No user workspace, profile, token, system policy, service, registry, firewall, tunnel, or remote Git state was modified.

**Next step:** Stop before Git staging. Await explicit approval for staging/publication or a separately authorized Phase 3B implementation session.

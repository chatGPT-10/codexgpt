# Phase 3 Implementation Archive - Volume 4

This append-only volume continues active Phase 3 implementation records after closed Volume 3 reached its direct-read threshold at STEP-291.

## STEP-292 - Close Phase 3C Task 7 publication

**Status:** Complete and published.

**Goal:** Record exact-head CI evidence for the fail-closed static mutation inventory before any owner-binding or undo implementation is stacked on it.

**Files changed:** `AGENTS.md`; `Memory.md`; the Phase 3C plan; this new continuation archive.

**Implementation summary:** Published Task 7 as commit `b9864e4`. Its TypeScript-AST gate binds 139 direct mutation occurrences across 15 production source/runtime files to exact path, line, column, call digest, and reviewed purpose. The gate includes the equivalent Node primitive and atomic state-writer coverage found during neat-freak review, exact fixture selection, and a separate production-default assertion that atomic mode cannot reach the one-cycle legacy direct writers. Exact-head CI run `29384188481` completed all Ubuntu and Windows Node 20/24 jobs successfully. Marked Task 7 publication complete and advanced the approved boundary to Task 8 only.

**Verification commands:** `gh run watch 29384188481 --exit-status`; `gh run view 29384188481 --json status,conclusion,headSha,url,jobs`; clean-worktree, documentation-state, archive-link, size, protected-Smoke, secret-signature, and `git diff --check` neat-freak checks.

**Verification results:** Run `29384188481` concluded `success` for exact head `b9864e41f7b1ee6dcd6a6342e5fd7c2899bf50e2`. Ubuntu Node 20/24 and Windows Node 20/24 all passed Build, complete Regression, all Smoke sections, and Package contents. The repository was clean before this documentation-only closure update.

**Decisions made:** Treat the exact-head four-matrix result as the Task 7 completion fact. Keep owner-binding and undo changes in Task 8 so they cannot weaken or obscure the published static baseline.

**Risks or limitations:** This closure changes no runtime behavior. The inventory is a source-level guard rather than an operating-system sandbox, and writable atomic production construction remains blocked behind Tasks 8-9. Public contract V2 remains fail-closed until Phase 3D adds `move_paths` and the coherent exact 31-tool snapshot.

**Rollback method:** Revert this documentation-only closure commit with a new commit if its evidence is incorrect; do not rewrite closed Volume 3. Runtime code and user workspace, audit, change-set, transaction, and profile state are unaffected.

**Next step:** Execute Task 8 RED tests for owner-binding priority, injected Policy batch-resource resolution, full undo preflight, audited reverse transaction, strict direct/supertool V2 adapters, and incomplete-V2 startup rejection.

## STEP-293 - Complete Phase 3C Task 8 locally

**Status:** Complete locally; intentionally uncommitted and unpublished pending the complete Phase 3C gate.

**Goal:** Add keyed owner binding, authenticated Policy resource resolution, and bounded audited `undo_change_set` behavior without activating incomplete public contract V2.

**Files changed:** `src/changesets/undo.ts`; `src/changesets/index.ts`; `src/tools/schemas/undoChangeSet.ts`; `src/tools/schemas/codexpro.ts`; `src/policy/types.ts`; `src/policy/schemas.ts`; `src/policy/resources.ts`; `src/policy/toolPolicy.ts`; `src/policy/approval.ts`; `src/policy/audit.ts`; `src/policy/evaluator.ts`; `src/policy/hardPolicy.ts`; `src/policy/integration.ts`; `src/policy/runtime.ts`; `src/audit/types.ts`; `src/audit/schemas.ts`; `src/audit/runtime.ts`; `src/mutations/types.ts`; `src/server.ts`; `test/undo-change-set.test.mjs`; the Phase 3C plan; `Memory.md`; this archive.

**Implementation summary:** Added HMAC owner binding with the approved priority of OAuth subject, credential reference, then transport session ID. Added a bounded deterministic `filesystem_batch` Policy descriptor and injected `ToolResourceResolver` path for authenticated undo metadata. Added strict V2 input/output schemas, direct/supertool adapters, complete current-state and rollback-blob preflight, preview-with-zero-mutation behavior, reverse transaction construction, audit/change-set participant ordering, original-manifest `undone` transition after audited commit, non-undoable reverse change sets, stable non-disclosing failures, and execution audit correlation through `revertsChangeSetId`. Contract V2 remains rejected before production registration because Phase 3D has not supplied `move_paths`.

**Verification commands:** `npm run build`; `node --test test/undo-change-set.test.mjs`; `node --test test/policy-*.test.mjs test/audit-*.test.mjs test/change-set-*.test.mjs test/undo-change-set.test.mjs`; `node --test test/transaction-*.test.mjs test/mutation-*.test.mjs test/write-edit-transaction.test.mjs test/apply-patch-transaction.test.mjs test/bridge-writer-transaction.test.mjs test/pro-apply-transaction.test.mjs test/transaction-contract-version.test.mjs test/codexpro-contract.test.mjs test/codexpro-self-test-contract.test.mjs`; `node --test test/workspace-lifecycle.test.mjs test/open-workspace-contract.test.mjs test/open-current-workspace-contract.test.mjs test/close-workspace-contract.test.mjs test/list-workspaces-contract.test.mjs test/transaction-config-and-path-policy.test.mjs test/transaction-contract-version.test.mjs test/server-config-contract.test.mjs`; `git diff --check`.

**Verification results:** Build passed. Undo focused tests passed 13/13. Policy/Audit/Change-set/Undo tests passed 135 with 0 failures and 1 established platform skip. Transaction/Mutator/Contract tests passed 132/132. Lifecycle/configuration tests passed 77/77. `git diff --check` exited 0 with only expected Windows LF-to-CRLF working-copy warnings.

**Decisions made:** Follow the user's 2026-07-15 instruction to stop publishing and running remote CI after individual tasks. Task 8 remains in the Phase 3C worktree; Task 9 proceeds on top of it, and commit/push/exact-head CI occur only after the complete Phase 3C local acceptance and reconciliation gate.

**Risks or limitations:** Public V2 remains unavailable until Phase 3D closes the exact 31-tool surface. Phase 3C owner binding is local/shared-credential binding rather than strong per-human identity. Undo refuses drift, unsupported metadata, unavailable authenticated blobs, blocked paths, expired/non-active manifests, and move operations; it provides no force, overwrite, redo, or cross-workspace mode.

**Rollback method:** Before publication, discard only the Task 8 paths listed above or restore them from `HEAD`; do not remove existing transaction, audit, or change-set state. After publication, revert with a new commit rather than rewriting history.

**Next step:** Execute Phase 3C Task 9 production runtime injection and the writable atomic V1 migration gate, retaining the complete Phase 3C batch uncommitted until Task 10.

## STEP-294 - Complete Phase 3C Task 9 locally

**Status:** Complete locally; intentionally uncommitted and unpublished pending Task 10 acceptance.

**Goal:** Compose the persistent Phase 3 runtime at the real STDIO/HTTP production boundary and safely activate writable atomic contract V1 without enabling incomplete public V2.

**Files changed:** `src/productionRuntime.ts`; `src/server.ts`; `src/http.ts`; `src/stdio.ts`; `src/transactions/recovery.ts`; `test/production-runtime-integration.test.mjs`; `test/mutation-architecture.test.mjs`; the Phase 3C plan; `Memory.md`; this archive.

**Implementation summary:** Added a production composition boundary that creates one state root, installation identity, process registry, recovery coordinator, persistent audit store/runtime, change-set store, transaction engine, mutation runtime, owner-binding subkey, and undo service per MCP server lifecycle. Independent servers share only the persisted installation domain and never share runtime objects or process-instance identities. Legacy transaction mode with legacy Policy and audit off creates no Phase 3 state. Writable atomic V1 now requires complete injected mutation, owner-binding, and persistent-audit capabilities; a legacy Policy configuration receives an internal shadow-only authorization/audit wrapper so behavior is not denied while required terminal audit still controls commit. HTTP and STDIO now use the production wrapper, and HTTP transport closure disposes the session runtime. Recovery accepts the shared registry without taking ownership, preventing duplicate process registries. Required audit integrity failure rejects construction before a server is returned. Public contract V2 still rejects startup because `move_paths` is unavailable.

**Verification commands:** `npm run build`; `node --test test/production-runtime-integration.test.mjs`; `node --test test/production-runtime-integration.test.mjs test/transaction-config-and-path-policy.test.mjs test/transaction-contract-version.test.mjs test/audit-runtime-integration.test.mjs`; `node --test test/mutation-architecture.test.mjs`; `node --test test/transaction-*.test.mjs test/audit-*.test.mjs test/change-set-*.test.mjs test/mutation-*.test.mjs test/write-edit-transaction.test.mjs test/apply-patch-transaction.test.mjs test/bridge-writer-transaction.test.mjs test/pro-apply-transaction.test.mjs test/undo-change-set.test.mjs test/production-runtime-integration.test.mjs`; first complete `node --test test/*.test.mjs` diagnostic run.

**Verification results:** Build passed. Production runtime RED became 5/5 GREEN. Production/config/audit focused tests passed 19/19. The exact static mutation inventory passed after updating six unchanged recovery primitive line coordinates whose call digests and reviewed purposes remained identical. The complete Phase 3 focused gate passed 175/175. The first complete regression run passed 724 tests with one established platform skip and exposed only that static-coordinate drift; no behavioral test failed.

**Decisions made:** Keep `createCodexProServer` as the low-level injectable registrar and make `createProductionCodexProServer` the only transport entrypoint. Capability gates depend on actual injected runtime completeness rather than a phase-name flag. Continue honoring the user's phase-level publication rule: no Task 9 commit, push, or CI.

**Risks or limitations:** The compatibility wrapper uses Policy shadow evaluation solely to obtain bounded authorization facts and required persistent audit when the configured Policy mode is legacy; it does not enforce denials. HTTP runtime disposal follows transport closure, while abrupt process termination relies on persisted registry/liveness recovery. V2 remains intentionally unavailable until Phase 3D implements `move_paths` and exact 31-tool parity.

**Rollback method:** Before publication, restore the listed Task 9 files from `HEAD` while retaining Task 8 only if a narrower rollback is required. After publication, revert the Phase 3C commit; never delete persisted audit, change-set, transaction, or installation evidence.

**Next step:** Execute Task 10 public-document reconciliation and the complete local acceptance gate, then publish Phase 3C once and require exact-head CI before beginning Phase 3D.

## STEP-295 - Complete Phase 3C local acceptance and reconciliation

**Status:** Complete locally; publication and exact-head CI are the only remaining Phase 3C gate.

**Goal:** Reconcile the complete Task 8–10 batch, close production lifecycle/resource gaps, update public documentation to the actual V1/V2 boundary, and obtain fresh phase-level verification before one publication.

**Files changed:** The complete Task 8–10 implementation, tests, Smoke wrappers, public documentation, active plan, root memory index, and this archive. The final intended worktree contains only Phase 3C owner-bound undo, production runtime injection, writable atomic V1 activation, resource-cleanup hardening, Windows Smoke state isolation, and their documentation/tests.

**Implementation summary:** Neat-freak review removed stale claims that atomic writers or persistent audit were dormant. It also found and repaired three fail-closed/resource issues: rollback plaintext is rechecked against authenticated manifest hash/length before transaction preparation; observation-hook failure disposes the composed runtime; and Transport startup failure disposes registry, stores, and derived keys through a shared production connect helper. `pro-smoke` and execute-handoff Smoke now use isolated temporary `CODEXPRO_HOME` state. The complete lifecycle Smoke is intentionally reserved for an independent process because its process-tree cleanup can terminate the CodexPro process carrying the current control channel.

**Verification commands:** `npm run build`; complete Phase 3 focused test command; `node --test test/*.test.mjs`; seven safe individual Smoke commands; `node --check scripts/execute-handoff-smoke.mjs`; `node --test test/transaction-architecture.test.mjs`; `npm run stress`; `npm pack --dry-run --json`; `git diff --check`; exact intended-file review through `show_changes`.

**Verification results:** Build passed. The Phase 3 focused gate passed 178/178. The final fresh complete regression passed 729/730 with zero failures and one established platform-capability skip, including the stateful-Smoke isolation architecture assertion. Analysis, Analysis CLI, main, HTTP, Pro CLI, Doctor, and Settings Smoke sections passed. Native-Windows Stress passed. Package dry-run passed with 268 files and includes production runtime, undo, schemas, and maps while excluding internal archives. `git diff --check` passed with only expected Windows LF-to-CRLF working-copy warnings.

**Decisions made:** Keep task-level changes uncommitted and run remote CI only at the complete Phase 3C boundary. Keep `legacy` as the compatibility default; writable atomic V1 is available only when explicitly selected and requires terminal persistent audit. Keep V2 public startup fail-closed until Phase 3D supplies `move_paths`. Treat control-channel lifecycle termination as an execution-environment boundary, not as permission to weaken or skip the independent CI Smoke gate.

**Risks or limitations:** The full execute/watch/loop Smoke cannot safely return through the same CodexPro process whose descendants it manages; GitHub Actions must provide the final independent-process result. Node 20 local execution is not available in the active native Node 24 tool process, so exact-head Ubuntu/Windows Node 20/24 CI remains mandatory. Public V2 query/undo is still unavailable.

**Rollback method:** Before publication, restore the complete Task 8–10 file set from `HEAD`. After publication, revert the single Phase 3C commit with a new commit; never delete persisted installation, transaction, audit, change-set, or recovery evidence.

**Next step:** Run the final fresh complete regression, stage the reviewed Phase 3C batch, commit `feat: enable audited atomic workspace mutations`, push `main`, and require exact-head Ubuntu/Windows Node 20/24 CI before any Phase 3D work.

## STEP-296 - Close Phase 3C publication

**Status:** Complete and published.

**Goal:** Replace the final pre-publication state with exact commit and CI evidence before any Phase 3D work begins.

**Files changed:** `AGENTS.md`; `Memory.md`; the master implementation plan; the Phase 3C plan; this archive.

**Implementation summary:** Published the complete Tasks 8–10 batch as commit `50ec99b` (`feat: enable audited atomic workspace mutations`). The commit contains owner-bound undo internals, production runtime composition, writable atomic V1, lifecycle/resource cleanup, Windows Smoke state isolation, public documentation, and exact tests. No Task 8 or Task 9 publication or remote CI was performed separately.

**Verification commands:** Public GitHub REST queries for commit `50ec99b97f7ec3e4d689b5306f0caa0f60afdc45`, workflow run `29390317879`, and its jobs; final local `show_changes` after push.

**Verification results:** Exact-head run `29390317879` concluded `success`. Ubuntu Node 20/24 and Windows Node 20/24 all completed Build, Regression, complete Smoke, and Package successfully. Local `main` matched `origin/main` and the worktree was clean after publication.

**Decisions made:** Phase 3C is formally closed. Keep V1 at the exact 28-tool public surface and keep V2 startup fail-closed until Phase 3D supplies `move_paths` and validates the coherent exact 31-tool snapshot.

**Risks or limitations:** This closure does not activate public V2 query or undo tools. The atomic backend remains subject to the documented same-volume filesystem and external-process limitations.

**Rollback method:** Revert commit `50ec99b` with a new commit if the whole Phase 3C batch must be withdrawn. Never delete persisted installation, transaction, audit, change-set, or recovery evidence.

**Next step:** Resolve the Windows isolated-Bash GitHub CLI configuration-discovery maintenance without inheriting token variables, then write the Phase 3D TDD plan.

## STEP-297 - Preserve GitHub CLI keyring discovery in isolated Windows Bash

**Status:** Complete locally; publication approved under Gate 0.

**Goal:** Let `gh` reuse its normal Windows configuration and OS keyring when `inheritEnv=false`, while continuing to exclude `GH_TOKEN` and unrelated parent credentials from Bash child processes.

**Files changed:** `src/bashOps.ts`; `test/bash-contract.test.mjs`; `README.md`; `README_ZH.md`; `SECURITY.md`; `config.example.env`; `CHANGELOG.md`; `AGENTS.md`; `Memory.md`; the master implementation plan; this archive.

**Implementation summary:** Extracted `createBashEnvironment` as a testable boundary. The narrowed Windows environment preserves explicit `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and `GH_CONFIG_DIR`; when the app-data variables are absent, it derives the standard roaming/local paths from `USERPROFILE` and derives the default GitHub CLI config directory. Arbitrary parent variables, `GH_TOKEN`, and unrelated API credentials remain excluded. Documentation now distinguishes this defense-in-depth narrowing from OS-level credential isolation and warns that `CODEXPRO_INHERIT_ENV=1` exposes the complete parent environment.

**Verification commands:** `node --test test/bash-contract.test.mjs`; `npm run build`; a real `gh auth status` child launched with `createBashEnvironment({ inheritEnv: false })`; `node --test test/bash-contract.test.mjs test/doctor-shell.test.mjs test/codexpro-self-test-contract.test.mjs test/auth-documentation.test.mjs`; `node scripts/smoke-platform-compat.mjs`; `git diff --check`; exact intended-file review.

**Verification results:** Bash contract tests passed 15/15. Build passed. The real narrowed child returned `gh auth status` exit 0 for account `chatGPT-10` using the Windows keyring; output contained only GitHub CLI's masked token display, and the child environment did not inherit `GH_TOKEN`. The combined Bash/Doctor/Self-test/documentation gate passed 40/40. Main Smoke passed. `git diff --check` passed with only expected Windows LF-to-CRLF warnings; the final credential-shape scan returned no matches; exact review confirmed only the intended maintenance, tests, documentation, and memory files changed.

**Decisions made:** Solve CLI discovery through bounded path compatibility, never by copying token variables. Keep full environment inheritance explicit and opt-in only.

**Risks or limitations:** Environment narrowing is not an OS sandbox; a same-user child may still access account-readable files and system keyrings. The currently running CodexPro process must be restarted after publication to load the new runtime code.

**Rollback method:** Restore the listed STEP-297 files from commit `50ec99b` before publication, or revert the later maintenance commit with a new commit. Do not modify the user's GitHub CLI configuration or keyring.

**Next step:** Publish this maintenance batch under Gate 0, require exact-head CI, restart CodexPro, then promote and execute the reviewed Phase 3D TDD plan.

## STEP-298 - Remove obsolete CI reproduction artifacts

**Status:** Complete locally.

**Goal:** Remove explicitly approved, ignored CI reproduction checkouts, temporary runtimes, logs, HTML captures, and anonymous cookies without touching active bridge handoff state or the current uncommitted maintenance batch.

**Files changed:** `Memory.md`; this archive. Deleted ignored paths: `.ai-bridge/ci-repro/`; `.ai-bridge/node20/`; `.ai-bridge/node20.zip`; `.ai-bridge/ci-job.html`; `.ai-bridge/node20-test.log`; `.ai-bridge/win20-job.html`; `.ai-bridge/win20-regression.log`; `.ai-bridge/github-anon.cookies`; `.ai-bridge/audit-lock-repro-*.log`; `.worktrees/ci-phase3a-repro/`; the now-empty `.worktrees/` directory.

**Implementation summary:** Confirmed the Phase 3A reproduction worktree was a clean detached checkout at `c5b0226`, removed it through `git worktree remove`, and then deleted only the enumerated CI reproduction artifacts. Preserved all normal `.ai-bridge` coordination files, including current plan/status, decisions, execution/session logs, implementation diff, self-test, open questions, Pro context, and bridge README.

**Verification commands:** `git worktree list --porcelain`; bounded `.ai-bridge` and `.worktrees` trees before deletion; alternate-worktree open/status check; `git worktree remove .worktrees/ci-phase3a-repro`; bounded post-delete trees; root workspace reopen/status check.

**Verification results:** Git now lists only `D:/Dev/codexpro` on branch `main`. `.ai-bridge/` contains exactly eleven normal bridge files and no CI reproduction artifacts. `.worktrees/` was empty after worktree removal and was deleted. The original twelve unstaged maintenance files remain the only Git-visible changes; no source, test, documentation, branch, commit, or user credential state was altered by the cleanup itself.

**Decisions made:** Treat CI reproduction directories, downloaded runtimes, captured workflow pages, logs, and anonymous cookies as disposable ignored diagnostics after their issue is closed. Preserve active `.ai-bridge` handoff and session state unless separately approved.

**Risks or limitations:** Deleted diagnostic artifacts cannot be inspected locally again; they can be recreated from Git history, GitHub Actions, and fresh reproduction commands if needed. No tracked source history was removed.

**Rollback method:** Recreate a detached worktree from commit `c5b0226` and rerun the relevant CI reproduction/download commands. Do not restore stale anonymous cookies.

**Next step:** Publish the verified maintenance batch under Gate 0 and require exact-head CI before starting Phase 3D.

## STEP-299 - Adversarially correct the Phase 3D implementation plan

**Status:** Complete as design and planning work; implementation has not started.

**Goal:** Attack the approved Phase 3D `move_paths` plan from transaction consistency, crash recovery, filesystem identity, contract, lifecycle, platform, and rollback perspectives; correct any design claims or sequencing gaps before tracked implementation begins.

**Files changed:** `.ai-bridge/current-plan.md` (ignored coordination plan); `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; this archive. Source and test implementation files changed: none.

**Implementation summary:** Replaced the initial 13-task plan with a corrected Gate 0 plus 16-task fail-closed sequence. The review found that current Manifest V1 recovery maps `committed_pending_participants` to rollback even when audit and change-set participant effects may already be durable, creating a participant-complete crash window between participant persistence and the final committed-manifest transition. The corrected plan makes durable commit decision and participant-aware reconciliation a Phase 3 closure blocker for both existing V1 writers and new V2 moves. It also separates non-mutating preview eligibility from execution-time hard-link proof; replaces path-only `lstat`/`readFile` reasoning with open-handle stable object identity and streamed hash checks; introduces `ChangeSetManifestV2` alongside `TransactionManifestV2`; narrows atomicity claims to process-crash recovery, no-clobber mapping, and complete bytes; defines cancellation, disconnect, shutdown, workspace-close, and Windows state-aware retry behavior; freezes the actual MCP V1 wire contract before refactoring; and makes native Windows and Ubuntu invariants mandatory rather than broadly skippable. V1 remains the default exact 28-tool public contract, and V2 remains fail-closed until the coherent exact 31-tool wire surface and total Phase 3 acceptance pass.

**Verification commands:** CodexPro targeted `read` and `search` inspection of `.ai-bridge/current-plan.md`, `src/transactions/engine.ts`, `src/transactions/recovery.ts`, `src/transactions/atomicFs.ts`, `src/transactions/atomicStateFile.ts`, `src/mutations/runtime.ts`, `src/changesets/undo.ts`, `src/audit/store.ts`, `src/policy/resources.ts`, `src/server.ts`, `src/codexproSupertool.ts`, and self-test schemas; searches for `committed_pending_participants`, file identity construction, Manifest/Change Set version fields, reserved artifacts, audit-query cursors, and stale Phase 3D next-action wording; post-rewrite plan reads and key-term searches; `AGENTS.md`, root `Memory.md`, master-plan authority header/next-action, and active archive size/state review; final `show_changes` scope review.

**Verification results:** The participant recovery mismatch was confirmed in current code and tests: `committed_pending_participants` is currently classified as `restore_before_state`, while participant effects are persisted before the final committed transition. Current file identity construction includes mutable size/mtime facts, move recovery and undo still use whole-file reads, Change Set V1 lacks an authenticated created-directory list, the supertool and self-test retain V1-specific tool-set limits, and the initial plan overclaimed preview hard-link proof. The corrected coordination plan is 570 lines and contains explicit tasks and final acceptance invariants for every finding. `Memory.md` remains below its 150-line/18-KB practical limit. No implementation test or build was run because no runtime source changed.

**Decisions made:** Publish the current Bash/keyring maintenance separately and require exact-head CI before creating the tracked Phase 3D plan. Phase 3D Task 1 freezes the actual V1 MCP wire contract and proves native Windows feasibility before refactoring. Existing create/replace/delete writers continue persisting Manifest/Change Set V1; move and move undo use V2 formats. Participant-complete recovery must finish commit, participant-empty recovery must roll back, partial effects must be reconciled with correlated evidence, and unverifiable state must freeze the workspace. Preview never promises future link success. Task-level work remains local and unpublished; Phase 3 publishes once after the complete local gate and neat-freak reconciliation.

**Risks or limitations:** The discovered participant commit-decision window exists in the currently published Phase 3C implementation and must be repaired before public V2 activation. This planning step does not change runtime behavior. The corrected move design still cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary external readers during an in-progress batch, guaranteed progress under external Windows contention, or absolute sudden-power-loss durability where directory sync is unsupported.

**Rollback method:** Restore only `.ai-bridge/current-plan.md`, `Memory.md`, and this appended archive entry to their prior planning state if the review conclusions are rejected. Do not alter published Phase 3C code, persisted transaction/audit/change-set evidence, Git history, or the current STEP-297 maintenance batch. Because the archive is append-only after publication, correct this entry later through a new correction entry rather than rewriting it.

**Next step:** Publish the independently verified maintenance batch under Gate 0. After exact-head CI is green and the running CodexPro process is restarted, copy the corrected coordination plan to `docs/superpowers/plans/2026-07-15-phase-3d-move-paths-and-acceptance.md`, reconcile the approved Phase 3D design errata, and execute Task 1 wire-contract and native-Windows feasibility probes.

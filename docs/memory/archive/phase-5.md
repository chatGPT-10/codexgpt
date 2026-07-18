# Phase 5 Local Git and Task Worktrees Archive

Append-only implementation history for Phase 5. Do not store secrets, complete tokens, private keys, repository source contents, or raw retained diagnostics here.

## STEP-344 — Task 5A0 / Gate G0: prove the private Git execution capsule

**Date:** 2026-07-17
**Status:** locally complete; not staged, committed, pushed, or published
**Next:** Task 5A1 / Gate C4

### Scope

- Added the private, package-excluded Gate G0 capability manifest, typed command builder, native-host probe, malicious-integration fixtures, and focused ordinary/control tests.
- Added no public tool, config variable, wire contract, repository mutation handler, remote operation, credential operation, force operation, or fallback process host.
- Reused the manifest-verified Phase 4 `CXP4` Windows native host and its exact executable-image, Job, handle-list, timeout, output, and cleanup facts.

### Proven capability

- Selected exact `C:\Program Files\Git\cmd\git.exe`, not PATH order.
- Git version: `2.55.0.windows.2`.
- Git executable SHA-256: `22fead8244ef3a7225fb800099a4e43eca8bcec0466774917669599c2f19a05a`.
- Gate G0 capability revision: `561fa55ab30151c7e5028ae871ac41004da408836b4545014f23280a919a7e10`.
- Proved object format, `worktree list --porcelain -z`, status porcelain V2, raw `hash-object --no-filters`, private-index plumbing, `commit-tree`, expected-old `update-ref`, object-only `merge-tree --write-tree --stdin -z`, machine-safe conflict status, and rejected-quarantine zero promotion.
- Positive control executed one filter canary; safe mode executed zero repository, global, system, hook, reference-transaction, fsmonitor, LFS/custom filter, external diff/textconv, merge-driver, signer, editor, pager, credential-helper, askpass, alias, and include canaries.
- Safe invocation metadata remains truthful: `executionIsolation=none`, `repositoryIntegrations=disabled`, `processTreeControl=job_object_members_only`, and `brokerEscapeResistance=none`.

### Fail-closed boundaries

- Typed direct argv only; caller PATH, `GIT_*`, `SSH_*`, askpass, proxy, trace, pager/editor, credential, config, index, object, alternate, namespace, and replacement state is not inherited.
- Service private-index and quarantine paths require a deterministic identity bound to the admitted Git directory and exact override paths.
- `push`, `pull`, `fetch`, `clone`, remote URLs, config mutation, force, arbitrary flags, and non-full revisions fail before spawn.
- Executable replacement is detected before native-host request dispatch.
- Missing or non-machine-safe object-only merge maps to `GIT_MERGE_CAPABILITY_UNAVAILABLE`; there is no checkout, reset, porcelain merge, worktree-updating `read-tree`, shell, or raw-spawn fallback.
- Output/time limits and diagnostic redaction are fixed; private Gate G0 files and fixtures remain excluded from the published package.

### Verification

- Final direct Gate G0 probe: passed with positive-control canaries `1`, safe-mode canaries `0`, and quarantined objects promoted `0`.
- Focused Build, repository policy, syntax, package, mutation inventory, domain classification, diff check, and managed Node 20/24 Gate G0 tests passed.
- Final managed complete ordinary regression run `2026-07-17T20-38-09-507Z-phase5a0-ordinary-final-e53a3471` passed on Node 20 and Node 24: each reported 894 tests, 893 pass, 0 fail, and the one established platform skip; exit 0, stderr 0, and no stdout/stderr truncation.

## STEP-345 — Adversarially harden and revalidate Gate G0

**Date:** 2026-07-17
**Status:** locally complete; not staged, committed, pushed, or published
**Next:** Task 5A1 / Gate C4

### Goal

Close security and contract gaps found by a fresh adversarial review of the completed Gate G0 result, then replace the superseded STEP-344 evidence with a new exact capability revision and complete regression run.

### Files changed

- `scripts/git-capability-spike.mjs`
- `scripts/git-execution-manifest-v1.json`
- `test/git-execution-capsule.test.mjs`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md`
- `docs/superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-5.md`

### Implementation and adversarial findings

- Conflict-stage OIDs are now exact for the admitted `sha1` or `sha256` object format; 41–63-character pseudo-OIDs can no longer pass a SHA-1 parser.
- Service private-index and quarantine overrides now require a per-probe 256-bit HMAC authority with a module-private brand. Cross-authority identities and forged `verify()` objects fail before spawn; the authority key is zeroed at probe shutdown.
- Capability revision now binds the exact Gate G0 script, manifest, four canary fixtures, and the verified CXP4 host manifest. Start/end implementation digests detect mid-probe drift.
- Automatic Git discovery no longer trusts caller-controlled `ProgramFiles`, `LOCALAPPDATA`, or PATH. It probes only fixed system `Program Files\\Git\\cmd` then `bin`; another installation requires an explicit reviewed path.
- The clean Windows system environment derives from the Node host drive rather than the Git executable drive, so an explicitly reviewed Git on another volume cannot redirect `SystemRoot`.
- Object-only merge input is one exact OID pair per invocation, matching the single-record parser instead of exposing an unsupported batch shape.
- Manifest validation now freezes candidate order, operations, fixed config overrides, environment deny lists, and every limit exactly; removing one critical control fails `GIT_MANIFEST_INVALID`.

### Verification

- TDD RED was retained for missing implementation exports and for permissive manifest validation.
- Managed Node 20.20.2 and Node 24.15.0 focused matrices each passed 20/20 across Gate G0 unit/control, mutation inventory, package contents, and domain classification.
- Final direct probe passed with Git `2.55.0.windows.2`, Git SHA-256 `22fead8244ef3a7225fb800099a4e43eca8bcec0466774917669599c2f19a05a`, implementation revision `80456ec9c7e35f37bc618cbecc498d364268c473fa8ce700069cd894366aec25`, host-manifest revision `8530a5c6d4c768d5e854719db2c4b447753a1a2a1d7e9b74b5b3218e79154e5b`, and capability revision `7e9f95bf7188bdd6035970eb38c5e3dfa5840996e7838273dc2757aa9b5d94f2`.
- Probe facts remained positive-control canaries `1`, safe-mode canaries `0`, rejected quarantine promotions `0`, exact Job/handle/image identity true, `executionIsolation=none`, and `brokerEscapeResistance=none`.
- Superseded run `2026-07-17T20-57-47-923Z-phase5a0-adversarial-ordinary-13e869cf` was stopped through its exact owned run ID after review found another source change; its output is not completion evidence.
- Final complete ordinary run `2026-07-17T21-03-15-107Z-phase5a0-adversarial-final-746beff5` passed on Node 20 and Node 24: each reported 896 tests, 895 pass, 0 fail, one established skip; exit 0, stderr 0, and no stdout/stderr truncation.

### Decisions, risks, and rollback

- Gate G0 remains private and package-excluded. No V4 tool, public config, production Git handler, remote operation, credential operation, or force operation was added.
- The capsule remains current-user execution control, not an OS sandbox. HMAC path authority proves service issuance within this probe; later production repository admission must still bind stable path/object identities and lifecycle ownership.
- Rollback is deletion/reversion of the Gate G0 private script, manifest, fixtures/tests, domain/package entries, and these Phase 5 records. No user repository, ref, index, credential, or remote state was changed.

## STEP-346 — Neat-freak Phase 5A0 knowledge reconciliation

**Date:** 2026-07-18
**Status:** complete; no staging, commit, push, or publication
**Goal:** reconcile the locally complete Gate G0 implementation with the project rule, plan, design, memory, and package boundaries without advancing Task 5A1.

**Files changed:** `Memory.md`, `docs/memory/archive/phase-5.md`, `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`, and `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`.

### Implementation

- Removed the remaining Phase 4 handoff statements that incorrectly named Task 5A0 as the next action; both now identify locally complete Gate G0 and Task 5A1 / Gate C4 as next.
- Compacted `Memory.md` from 126 lines / 18,427 bytes to 120 lines / 15,243 bytes by graduating repeated Phase 4 execution and CI detail to the existing archives while retaining current rules, limitations, final Gate G0 revisions, and exact next action.
- Preserved STEP-344's original revision and run as append-only historical evidence; STEP-345 remains the correcting final authority.
- Confirmed that Gate G0 is private and package-excluded, so README, public setup, security, and operator documentation require no user-facing feature instructions.

### Verification, decisions, risks, rollback, and next

- Relevant Markdown local links passed `MARKDOWN_LOCAL_LINKS_PASS`; stale Phase 5A0-next/blocked phrases returned no matches.
- `npm run policy:check` passed; package/domain focused tests passed 5/5; `git diff --check` passed with only the established Windows LF-to-CRLF working-copy warnings.
- No runtime file changed after STEP-345's final Node 20/24 complete ordinary run, so its 896/895/0/1 per-major result remains the runtime authority.
- Risk is limited to documentation drift; rollback is reverting this STEP's four documentation edits. Task 5A1 / Gate C4 remains next, and task-level staging, commit, push, or publication remains prohibited.

## STEP-347 — Task 5A1 / Gate C4: freeze exact Tool Contract V4

**Date:** 2026-07-18
**Status:** locally complete; not staged, committed, pushed, or published
**Next:** Task 5A2 — migrate V4 Git reads to typed, bounded, secret-safe providers

### Goal and changed files

Freeze opt-in Tool Contract V4=51 without changing V1=28, V2=31, V3=39, their public wire behavior, or their persisted readers. The implementation added `src/tools/contracts/v4.ts`, the twelve strict V4 schema modules plus `gitV4Common.ts`, and the three focused Phase 5A1 test files. It updated configuration, contract catalogs/projections, direct and `codexpro` registration, V4 status/diff/audit projections, Policy Kernel definitions, production startup gates, inherited transaction mapping, adjacent contract/static tests, `scripts/codexpro.mjs`, `AGENTS.md`, `Memory.md`, the Phase 4/5 paired plan and design handoffs, the master implementation plan, and the historical roadmap checkpoint.

### Implementation

- Froze the exact canonical chain V1=28, V2=31, V3=39, V4=51. V4 inherits V3 and adds exactly twelve local-Git/task-worktree names; `bash` and rejected `git_apply_patch` remain absent.
- Froze profile projection: standard exposes ten V4 additions, full exposes all twelve, and minimal/connection-test expose none.
- Added strict input/output schemas for every new tool and V4 variants of `git_status`, `git_diff`, `query_audit_events`, and `codexpro`. Every input rejects unknown fields and raw revisions, flags, remotes, config, environment, executable, command, and other Git escape hatches.
- Hardened Windows/ref/text boundaries against reserved devices, ADS, trailing dot/space, illegal Windows characters, `.lock`, `@{`, case-fold ambiguity, ANSI/C0/C1 controls, and bidirectional override/isolate characters. Output schemas bind omission flags, action-specific stash/restore facts, merge-plan states, uniqueness, and count/path invariants.
- Registered every V4 addition as an unconditional fail-closed unavailable slot with no injectable handler path. Policy definitions reserve the names but grant no runtime authority. V4 `git_status` and `git_diff` cannot fall back to legacy human-output providers.
- Separated public contract version from persisted transaction versions. V4 inherited file mutations map explicitly to persisted contract 3; V1–V3 transaction/change-set schemas and readers were not widened.
- Added a V4 audit query projection that can normalize verified V2/V3/V4 chain records while retaining `sourceSchemaVersion` and `sourceContractVersion`. V4 cursors use the `v4:` grammar so V2/V3 readers reject them and V4 rejects legacy cursors.
- Extended startup/config/supertool behavior for exact V4 while keeping V1 default. V4 requires enforce policy, required durable audit, stable session, native-host identity, local approval, Gate-G0 Git capability, and migration evidence before registration.

### Adversarial review and corrections

- Removed an unnecessary V4 handler dependency-injection seam so Gate C4 cannot activate production behavior indirectly.
- Corrected MCP annotations so index-only `git_stage` and read/handle-only `get_task_worktree` are not mislabeled destructive, while ref/history/file/worktree mutations remain destructive.
- Rejected several initially permissive Windows/ref/text shapes and added collection-level uniqueness/current-branch invariants.
- The first complete candidate run `2026-07-18T06-39-39-649Z-phase5a1-c4-final-3-f9c521f4` correctly failed two stale tests, not runtime behavior: one expected the public contract to be passed directly instead of the required persisted-version mapping; one depended on `handoffToAgent.ts` remaining inside the first twenty alphabetic tree entries after new schema files were added. Both assertions were made semantic and the related tests passed 16/16.

### Verification

- Focused Gate C4 suite passed 17/17.
- Managed Node 20.20.2 and Node 24.15.0 focused compatibility matrices each passed 45/45.
- Adjacent legacy contract, production, Policy Kernel, package, mutation-inventory, domain, and static regressions passed 89/89 before the final complete run.
- After documentation reconciliation, `npm run policy:check`, `npm run build`, the focused C4/package/domain set passed 22/22, and `git diff --check` passed; diff check emitted only the established Windows LF-to-CRLF working-copy warnings.
- Final managed ordinary run `2026-07-18T06-51-25-686Z-phase5a1-c4-final-4-96ce13f0` completed with exit 0. Node 20.20.2 and Node 24.15.0 each reported 913 tests, 912 pass, 0 fail, and one established skip. Stderr was empty; stdout/stderr were not truncated.

### Decisions, risks, rollback, and next

- Gate C4 freezes contracts only. No V4 Git provider, subprocess, repository read/write, task-worktree mutation, remote operation, credential operation, or force operation is active.
- Same-binary rollback to V3 hides all V4 tools while retaining V4 state/audit reader and cleanup schemas. This does not claim compatibility with an older binary lacking those readers.
- Rollback is reverting the Gate C4 contract/schema/registration/config/test changes and this STEP's current-state documentation updates; no user repository, ref, index, worktree, credential, or remote state was modified.
- Task-level staging, commit, push, and publication remain prohibited. Task 5A2 is the next approved action.

## STEP-348 — Reconcile Gate C4 knowledge and rules

**Date:** 2026-07-18
**Status:** complete; documentation/memory maintenance only; not staged, committed, pushed, or published
**Next:** Task 5A2 — migrate V4 Git reads to typed, bounded, secret-safe providers

### Goal and changed files

Run the project neat-freak protocol after Gate C4 closure evidence, remove any current-state drift, and leave a clean handoff without changing runtime or public behavior. Files changed by this maintenance step: `AGENTS.md`, `Memory.md`, and `docs/memory/archive/phase-5.md`.

### Audit and result

- Re-read project and global rules, the active memory index, the Phase 5 plan/design, the master plan, the historical roadmap checkpoint, and the active Phase 5 archive.
- Confirmed every current handoff names Tasks 5A0/G0 and 5A1/C4 as locally complete and Task 5A2 as next. Historical STEP text was preserved append-only.
- Confirmed V4 remains opt-in exact 51 with fixed unavailable handlers. No public Git provider, repository effect, task-worktree effect, remote operation, credential operation, or force operation is active.
- Confirmed README, README_ZH, SECURITY, setup, and operator documentation require no V4 instructions yet; adding them now would falsely advertise inactive behavior.
- Confirmed package tests still exclude internal memory and Gate-G0 implementation assets as intended. No rule-file path, archive pointer, or active Phase 5 sequencing conflict was found.
- Compactly merged redundant external-reference and execution-boundary wording in `AGENTS.md` without changing authority, safety, publication, or approval semantics; the rule file returned below the neat-freak 15 KB soft ceiling.
- `Memory.md` remained below its practical limit and retained only current state, active decisions, final evidence, open items, recent summaries, and archive pointers.

### Verification, risks, rollback, and next

- `npm run policy:check` passed.
- `npm run build` passed.
- Focused Gate C4 plus package/domain tests passed 22/22.
- `git diff --check` passed with only established Windows LF-to-CRLF working-copy warnings.
- The full runtime authority remains STEP-347 run `2026-07-18T06-51-25-686Z-phase5a1-c4-final-4-96ce13f0`; this maintenance step changed no runtime file.
- Risk is limited to documentation drift. Rollback is reverting only this STEP's `AGENTS.md` compaction, `Memory.md` update, and appended archive entry.
- Task-level staging, commit, push, and publication remain prohibited. Task 5A2 remains the next approved action.

## STEP-349 — Task 5A2: typed, bounded, secret-safe V4 Git reads

**Date:** 2026-07-18
**Status:** locally complete; not staged, committed, pushed, or published
**Next:** Task 5A3 / Gate R

### Goal and changed files

Replace V4 human-output/PATH Git reads with typed machine-format providers while preserving exact V1/V2/V3 wire and keeping every V4 mutation disabled. Added `src/git/{capabilities,execution,repositoryIdentity,parsers,readService,stateToken}.ts` and four focused Git-read test files. Updated `src/gitOps.ts`, `src/server.ts`, `src/workspaceOps.ts`, `src/proContext.ts`, `src/productionRuntime.ts`, `src/redact.ts`, the V4 status/diff/log/branch schema constructors, and the paired Phase 5/current-state documentation.

### Implementation

- Promoted the Gate-G0 boundary into a production-shaped direct-argv executor with exact executable identity, clean bounded environment, fixed config overrides, branded capability evidence, output/time limits, and truthful `execution_isolation: none` / `repository_integrations: disabled` facts.
- Added primary-repository admission and repeated revalidation for canonical worktree/gitdir ownership, mutable metadata identities, recursive refs/object-resolution metadata, SHA-1/SHA-256, alternates/replacement/promisor/partial-clone rejection, arbitrary linked-worktree rejection, and readable-but-tokenless reftable/sparse/split states.
- Added strict NUL-machine parsers for status porcelain v2, raw diff, numstat, batched `cat-file` checks/content, and bounded commit display extraction. Invalid UTF-8 path/state is rejected; invalid display-only commit subject/name is omitted.
- Added process-local same-worktree read serialization, bounded attribute/integration inventory, pre-content object size/type checks, hard-link/symlink/outside-root rejection, blocked/secret omission, safe patch/control/bidi redaction, and opaque context-bound repository/branch IDs.
- Added process-local opaque state tokens that embed no repository facts and bind repository/worktree/head/index/worktree/ignored/attribute/scope/result digests, context, capability revision, and expiry. Incomplete, omitted, truncated, unsupported-format, or raced state receives no token.
- Activated only V4 `git_status`, `git_diff`, `git_log`, and `git_branch`, plus typed projections for `show_changes`, workspace snapshots, Codex context, and Pro-context export. Missing typed V4 service fails closed through each inherited tool's frozen error schema. V1/V2/V3 continue using their exact legacy providers.

### Adversarial review and repairs

- Replaced decodable signed payload tokens with nonce-plus-MAC process-local handles and canonical Base64URL validation.
- Replaced per-object 3×N reads with bounded two-stage `cat-file --batch-check` then `--batch` processing.
- Prevented secret-bearing files from appearing in diff metadata or patch output and treated unsafe hard links/symlinks as blocked without reading their targets.
- Branded capability evidence with module-private issuance state and bound production startup to the exact read-service capability revision.
- Extended revalidation over newly created refs, alternates, object-pack/promisor metadata, and replacement state.
- Preserved safe current branch display for inherited text consumers through the service-owned opaque branch map; no `branch_id` leaks into legacy text.
- The first complete candidate run `2026-07-18T12-19-14-420Z-phase5a2-ordinary-final-62b46a7f` correctly exposed six failures across revalidation, full token expectation matching, hard-link classification, invalid UTF-8 display handling, branch projection, and missing-service fallback. It completed Node 20 with 944 tests, 937 pass, 6 fail, one skip, empty stderr, and untruncated logs; all six root causes were repaired before the final run.

### Verification, risks, rollback, and next

- Managed Node 20.20.2 and Node 24.15.0 focused repair matrices each passed 26/26; the broader adjacent Git/show-changes/workspace/context/export/contract/production/package/domain set passed 144/144.
- `npm run policy:check`, `npm run build`, and `git diff --check` passed; diff check emitted only established Windows LF-to-CRLF working-copy warnings.
- Final complete ordinary run `2026-07-18T12-41-24-298Z-phase5a2-ordinary-final-2-ddcc623b` passed Node 20.20.2 and Node 24.15.0: each 944 tests, 943 pass, 0 fail, and one established skip. Exit code was 0, stderr was empty, and stdout/stderr were not truncated.
- No ref, index, object, worktree, remote, credential, force, or user-history mutation handler is active. Process-local coordination is not an OS-wide Git lock; Gate R remains mandatory before any mutation.
- Rollback is reverting the Task 5A2 Git-read modules, projections/handler wiring/tests, and this current-state documentation. Task-level staging, commit, push, and publication remain prohibited. Task 5A3 / Gate R is next.

## STEP-350 — Reconcile Task 5A2 knowledge and handoff

**Date:** 2026-07-18
**Status:** complete; documentation/memory maintenance only; not staged, committed, pushed, or published
**Next:** Task 5A3 / Gate R

### Goal and changed files

Run the neat-freak protocol after Task 5A2, verify that current-state documentation matches the implemented and tested workspace, and leave an exact handoff without changing runtime or public behavior. Files changed by this maintenance step: `Memory.md` and `docs/memory/archive/phase-5.md`.

### Audit and result

- Re-read the project/global rules, active memory index, active Phase 5 archive, and the repository-wide Markdown inventory; inspected the complete uncommitted Phase 5 workspace status without altering unrelated changes.
- Confirmed all current-state authorities identify Tasks 5A0 / Gate G0, 5A1 / Gate C4, and 5A2 as locally complete and Task 5A3 / Gate R as next. Earlier “Task 5A2 next” wording is confined to append-only historical STEP-348 and remains intentionally unchanged.
- Confirmed `Memory.md` retains the final Task 5A2 managed Node 20/24 evidence, the no-task-level-publication rule, the deferred Phase 4 sandbox boundary, and the requirement that Gate R precede every V4 mutation.
- Confirmed README/operator/security documents require no Task 5A2 instructions: V4 remains opt-in, mutation handlers remain absent, and typed reads do not change the supported public launch or authentication flow.
- Confirmed no dead archive pointer, conflicting current handoff, relative-time claim, or new secret-looking documentation value was introduced.

### Verification, risks, rollback, and next

- Before editing, `AGENTS.md` measured 202 lines / 15,013 bytes, `Memory.md` 122 lines / 16,593 bytes, and the active Phase 5 archive 219 lines / 22,592 bytes; all remained within project hard limits, with `Memory.md` below its practical 150-line / 18-KB target.
- Final verification command `npm run policy:check && git diff --check && wc -lc AGENTS.md Memory.md docs/memory/archive/phase-5.md` passed: repository policy reported `PASS`; diff check emitted only established Windows LF-to-CRLF working-copy warnings; the final size check remained within the configured hard limits.
- This step changes no source, schema, package boundary, test, Git state, repository data, or public documentation. Risk is limited to documentation drift; rollback is reverting only the STEP-350 index summary and this appended archive entry.
- Task-level staging, commit, push, and publication remain prohibited. Task 5A3 / Gate R remains the next approved action.

## STEP-351 — Task 5A3: Gate R durable Git coordination and recovery

**Date:** 2026-07-18
**Status:** locally complete; not staged, committed, pushed, or published
**Next:** Task 5A4 / Gate I

### Goal and changed files

Establish the durable coordination, audit, and recovery boundary required before any V4 index, ref, object, file, or task-worktree mutation. Added the Gate R modules under `src/git/`, `src/audit/lifecycleV4.ts`, focused Gate R tests, and the package-excluded `fixtures/ts-imports/local-approval-integration-imports.ts`. Updated V4 audit, policy, production composition, state/package/mutation inventories, the Node 20 loader-sensitive approval test, and current Phase 5 handoff documentation. Existing uncommitted Phase 5A0–5A2 changes were preserved as one continuous workspace batch.

### Implementation

- Added exact repository → lexical worktree → Phase 3 file-lock acquisition with reverse release, process-instance/PID/creation-time/token ownership, bounded diagnosis, and no deletion of stale, foreign, invalid, or unprovable locks.
- Added installation-key-derived Gate R subkeys, AES-256-GCM private state, HMAC-authenticated repository and operation records, strict size/count schemas, stable opaque repository IDs, atomic state files, and a closed operation transition graph.
- Added journaled immutable loose-object promotion for SHA-1 and SHA-256 repositories. Existing destinations are verified by object identity/content, mismatches are never overwritten, symlink/junction directory escapes are rejected, and restart recovery remains idempotent after quarantine cleanup.
- Added strict `AuditEventV4` authorization, terminal, Git-operation, task-worktree, merge-plan, verification, and recovery records inside the existing MAC chain. V2/V3 readers verify the mixed chain but filter V4 before pagination; V4 owns its domain-separated union projection and cursor.
- Bound terminal evidence to the exact persisted authorization and operation facts. Request, decision, tool/action, repository/task, subject/context, policy, resource, issue/expiry, capability, configuration, path, and secret-policy revisions cannot be replayed across contexts.
- Added startup reconciliation under Gate R locks. No-effect operations roll back, proven terminal audit plus reconciled durable effect commits, immutable orphan-only objects remain unreachable, and unknown participants, unproved terminal evidence, frozen repositories, or unproved lock release produce a persistent `GIT_RECOVERY_REQUIRED` freeze rather than guessed cleanup.
- Kept Git directory layout in `src/git/durableState.ts`; ordinary Phase 3 transaction modules remain free of Git, shell, network, and worktree dependencies. All V4 mutation handlers remain disabled.

### Adversarial review and repaired failures

- Replaced process-local/random repository identifiers in durable records with installation-keyed stable opaque IDs so restart recovery resolves the same repository without exposing canonical paths.
- Tightened authorization-to-operation equality, exact terminal event identity, V3/V4 query schema separation, self-verifying resource fingerprints, canonical V4 semantic digests, control-text rejection, and operation-specific risk/scope mappings.
- Added file-lock ordering, lock-acquisition rollback, lock-protected startup recovery, persistent frozen-state startup refusal, symlink object-directory escape tests, and destination-first object idempotency when the quarantine source is gone.
- Final candidate run `2026-07-18T14-44-30-365Z-phase5a3-ordinary-final-f1485956` was stopped after Node 20 spent sustained CPU in `approval-multi-server.test.mjs`. The root cause was a `tsx` loader graph that mixed direct `.ts` imports with transitive `.js` specifiers. One package-excluded integration barrel now loads policy leaves before shared control servers through one canonical `.js` graph; Node 20 then passed the test 3/3 instead of hanging.
- The next complete run `2026-07-18T15-14-09-767Z-phase5a3-ordinary-final-2-376acd99` completed with one real failure: Git-specific `worktree` state-directory names had leaked into `src/transactions/stateRoot.ts`, violating the Phase 3 architecture boundary. The layout was moved into `src/git/durableState.ts`; the architecture and Gate R regression set then passed 20/20 without weakening the test.

### Verification, risks, rollback, and next

- Gate R focused tests passed 24/24. Adjacent audit/policy/recovery/production checks passed 74/74; the managed Node 20/24 local-control repair set passed 7/7 per matrix; transaction architecture plus Gate R lock/store/recovery tests passed 20/20; mutation/package checks passed 7/7.
- `npm run policy:check`, `npm run build`, package/domain checks, mutation inventory, and `git diff --check` passed. Diff check emitted only established Windows LF-to-CRLF working-copy warnings.
- Final managed ordinary run `2026-07-18T15-29-43-345Z-phase5a3-final3-535183ed` passed Node 20.20.2 and Node 24.15.0: each reported 969 tests, 968 pass, 0 fail, and one established skip. Exit code was 0, stderr was empty, and stdout/stderr were not truncated.
- Gate R coordinates CodexPro-owned mutations but cannot serialize arbitrary external Git processes or claim simultaneous database-style visibility. Immutable unreachable objects may remain after a failed preparation; absolute power-loss durability still depends on platform directory-sync behavior. These limits are reported rather than hidden.
- Rollback is reverting the Gate R Git/audit/policy/production modules, focused tests, loader barrel, and current-state documentation. Any rollback after newer Gate R state exists must retain compatible readers and recovery/freeze handling; it must not delete refs, objects, repositories, locks, audit evidence, or user data.
- No ref, index, worktree, remote, credential, branch, stage, commit, push, or publication action was performed. Task 5A4 / Gate I is the next approved action.

## STEP-352 — Complete Phase 5A Gates I and D

**Date:** 2026-07-18
**Status:** locally complete; complete-phase matrix and publication remain pending
**Next:** neat-freak reconciliation, then Task 5B0 / Gate W0

### Goal and changed files

Finish the typed local Git mutation slice after Gate R without introducing remote, credential, force, shared-stash-stack, or repository-integration escape hatches. Added `src/git/{branchService,indexService,commitService,mutationContext,mutationJournal,mutationService,privateIndex,restoreService,reviewToken,stashService}.ts`, the focused Gate-I/Gate-D tests and package-excluded Git fixture helper, and updated V4 schemas, configuration, server/policy/production wiring, package/domain/mutation inventories, and current Phase 5 documentation.

### Implementation

- Added expected-absent `codex/*` branch creation without checkout/upstream/delete/rename/overwrite and bound opaque branch/state facts to repeated repository admission.
- Added exact 1–256 literal-path staging through a private index. Paths, types, hard links, sizes, blocked/secret content, sparse/split indexes, effective EOL settings, attributes, and current state are checked before raw `hash-object --stdin --no-filters`; `git add` is absent.
- Added commit-tree/ref-CAS commit from an exact index token. Identity comes only from repository-local no-include keys; message and staged blobs are independently rescanned; hooks, signing, amend, caller dates, inherited identity, and stage-on-commit are absent.
- Added two-step `index_from_head` and `worktree_from_index` restore plus owner/workspace-bound private stash create/list/apply/forget under `refs/codexpro/stash/*`. Shared `refs/stash`, pop/drop/clear, reset/clean, GC, and caller-selected refs are unrepresentable.
- Added V4 authorization binding through Policy Kernel and mandatory production `gateRBound` enforcement. Mutation preparation persists exact authorization and an encrypted operation record before locks/effects; terminal audit is persisted before commit, and unproved audit/lock completion freezes the repository for recovery.
- Added explicit `CODEXPRO_GIT_MODE=read|local` and `CODEXPRO_GIT_INTEGRATIONS=off|approved_full_access`; defaults remain read/off and approved integrations are not implemented in Phase 5A.

### Verification, limitations, rollback, and next

- `npm run build` passed. Focused Gate I/D/Gate R/policy/production/contract/package/domain/mutation suites passed with no failures; the broad command included branch, stage, commit, races, restore, stash, mutation journal, recovery, policy resources, V4 contract, production integration, package contents, domain classification, and mutation inventory.
- `npm run policy:check` and `git diff --check` passed during the implementation loop; the final complete Node 20/24 ordinary/control matrix remains a Phase 5C closure requirement and is not claimed here.
- Exact private-index and worktree writes cannot exclude arbitrary external Git processes or provide simultaneous database visibility. Immutable orphan objects can remain after a rejected ref CAS. Repository integrations remain disabled; raw-byte safe paths fail closed when normalization or external programs are required.
- Review handles remain process/session scoped; durable execute rollback evidence is sealed in Gate R operation state. A recovery uncertainty freezes the repository rather than deleting refs, objects, stashes, or user bytes.
- Rollback is reverting the Phase 5A4/A5 services, schemas, policy/config/server wiring, tests, and these current-state entries while retaining readers for any already-created Gate R audit/operation state. No staging, commit, push, remote, credential, force, branch deletion, or publication action occurred.

## STEP-353 — Reconcile Phase 5A knowledge with neat-freak

**Date:** 2026-07-18
**Status:** complete; documentation/memory maintenance only
**Next:** Task 5B0 / Gate W0

### Audit and result

- Re-read project/global rules, the complete neat-freak skill and its sync/governance references, the Phase 5 design/plan, current memory, archive tail, Git status, package/mutation/domain inventories, and all current-state references to the Phase 5 handoff.
- Updated `AGENTS.md`, the master plan, mandatory Phase 5 plan status, and `Memory.md` from Gate R/Task 5A4 to locally complete Phase 5A and Gate W0 next. Append-only earlier step history remains unchanged.
- Kept public README/security/operator text unchanged at this boundary because V4 local Git is still opt-in/unpublished and the complete Phase 5 workflow, managed worktrees, closure matrix, and exact-head publication are not yet complete.
- Confirmed `.gitignore` retains credential, build, package, local evidence, and managed-worktree exclusions; new test fixtures remain package-excluded and the exact mutation inventory classifies every shipped direct filesystem primitive.
- `Memory.md` remains below its 150-line/18-KB practical target, the active Phase 5 archive remains below the hard direct-read rollover boundary, and no dead archive link, relative-time handoff, or secret value was introduced.

### Risks, rollback, and next

- This reconciliation changes current-state documentation only; it does not widen authority or mark Phase 5 published. The complete Phase 5C evidence remains mandatory.
- Rollback is reverting the current-state handoff edits and appending a correction rather than rewriting this archive history. Task 5B0 / Gate W0 is next.

## STEP-354 — Complete Phase 5B managed task worktrees

**Date:** 2026-07-18
**Status:** locally complete as a usable first implementation; Phase 5C adversarial acceptance and publication remain pending
**Next:** neat-freak reconciliation, then Phase 5C

### Goal and changed files

Add owner-bound managed task worktrees without widening `allowedRoots`, running checkout-oriented porcelain for materialization, deleting branches/history, or enabling repository integrations by default. Added `src/worktrees/`, `src/git/integrations.ts`, task-worktree V4 schemas, focused lifecycle/materialization/merge/removal/receipt/integration tests, the package-excluded task helper, and the Windows deletion control oracle. Updated configuration, workspace authority, server/policy/production composition inputs, package/domain/mutation inventories, and current Phase 5 documentation.

### Implementation

- Added startup-configured disjoint managed-root admission, bounded full-tree manifests, raw batch blob materialization, inert gitlink directories, and identity-aware removal that rejects reparse points, hard links, nested repositories, and unexpected entries.
- Added authenticated persistent owner-bound task records plus session-local task workspace handles. Restart does not revive old workspace handles; foreign-owner list/get operations remain opaque.
- Added generated `codex/*` task branches, locked `--no-checkout` administrative worktrees, raw materialization, task registration, lifecycle listing/get, and fail-closed recovery state.
- Added fast-forward preparation and divergent object-only merge in a private object directory, complete candidate tree/diff scanning, immutable candidate identity, checked-out-target file/index/ref CAS, and a separate reviewed clean-removal action that retains task branches, commits, and private stashes.
- Added verification-receipt and merge-plan services, explicit task quotas, a default-off integration discovery/approval gate, policy resources, V4 tool handlers, production dependency checks, and exact mutation/package/domain classification for the new runtime paths.

### Verification, limitations, rollback, and next

- `npm run build` passed. The focused Phase 5B/Gate R/policy/production/contract/package/domain/mutation suite passed 61/61, including fast-forward, divergent, conflict, checked-out-target execute, clean removal, task lifecycle, raw materialization, workspace authority, receipts, and Windows deletion canaries.
- This is not final closure evidence. Phase 5C must still challenge restart recovery, durable receipt/plan state, two-stage R2/R3 divergent finalization, unchecked-out target execution, integration execution, production composition, crash participants, hostile Git/environment/config inputs, and the complete Node 20/24 ordinary/control matrix. Any unsupported optional integration path must remain disabled and be documented truthfully.
- CodexPro coordination does not exclude arbitrary external Git processes or provide simultaneous database visibility. A failed preparation may retain unreachable immutable objects or an app-owned candidate ref for recovery; it never runs Git GC or guesses at user-history deletion.
- Rollback is reverting the Phase 5B worktree modules, task schemas/wiring/tests/inventories, and these current-state entries while retaining compatible readers for any persisted Gate R/task/audit state. No branch deletion, remote, credential, force, production deployment, stage, commit, push, or publication action occurred.

## STEP-355 — Reconcile Phase 5B knowledge with neat-freak

**Date:** 2026-07-18
**Status:** complete; documentation/memory maintenance only
**Next:** Phase 5C adversarial acceptance and closure

### Audit and result

- Re-read the project/global rules, complete neat-freak skill and required references, Phase 5 design/plan, current memory, archive, Git status, package/mutation/domain inventories, and current-state Phase 5 handoffs.
- Updated `AGENTS.md`, the master plan, mandatory Phase 5 plan, and `Memory.md` to record locally complete Phase 5A/5B and Phase 5C as the only next action. Historical STEP handoffs remain append-only.
- Confirmed all new runtime fixtures and control scripts are package-excluded, every shipped direct filesystem primitive is bound by the mutation inventory, and the Windows control test is registered only in the control domain.
- Deferred public README/security/operator changes until Phase 5C because the complete runtime matrix, adversarial review, single publication, and exact-head CI are still mandatory.

### Risks, rollback, and next

- The focused 61/61 result proves the implemented happy and selected failure paths only; it does not satisfy the full adversarial matrix or authorize publication.
- `Memory.md` remains below its 150-line/18-KB practical target. The active archive remains below its rollover threshold.
- Rollback is reverting only the current-state documentation handoff and appending any correction rather than rewriting this archive. Phase 5C is next.

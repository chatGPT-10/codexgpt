# Phase 3D Move Paths and Complete Phase 3 Acceptance Plan

Date: 2026-07-15
Status: published, adversarially accepted, and exact-head cross-platform CI validated; Phase 3 complete
Primary platform: native Windows

## Goal and release boundary

Implement production-grade `move_paths`, repair the remaining transaction participant/recovery consistency gap, and activate contract V2 exactly once after the complete Phase 3 acceptance gate passes.

Contract V1 remains the default exact 28-tool wire surface. Contract V2 remains fail-closed until move execution, crash recovery, participant reconciliation, move undo, policy, audit query, registration, supertool routing, inventory, self-test, Tool Card, documentation, and complete V1 compatibility all pass. The exact V2 universe is V1 plus `query_audit_events`, `undo_change_set`, and `move_paths`, for 31 child tools.

No task-level stage, commit, push, or remote CI is allowed. Tasks use local RED/GREEN/refactor gates. Publish the complete Phase 3D batch once after neat-freak and the full local gate, then require exact-head Ubuntu/Windows Node 20/24 CI.

## Gate 0 evidence

The independent Windows Bash/GitHub CLI maintenance batch was published as commit `77b1e9069798235d674342a2c33a234a4266b564` (`fix: preserve Windows CLI config discovery`). Exact-head run `29402504990` passed Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package. The tracked worktree was clean and `main` matched `origin/main` before Phase 3D implementation began.

## Local implementation and acceptance evidence

The published Phase 3D line consists of implementation commit `3000aa6d88190f31c6b93c35ae59e7889317aae4`, cross-platform test stabilization commit `e5d9d27f37f6fd2b7c1b76c8db38755da32c6ab5`, and Windows Node 20 handle-compatibility commit `2df4a1f50c692ef414f1b913dabdaf7b198c97a2`. It implements the exact 28/31 versioned catalog, direct and `codexpro` supertool V2 routing, `move_paths`, authenticated Manifest/Change Set V2 state, syscall-boundary write-ahead recovery, parent-identity/reparse-point revalidation, participant-aware V1/V2 recovery, recoverable move/non-move undo, service-level mutation quiesce/drain, bounded audit query, and Policy resource composition. Exact-head run `29441752493` completed successfully on Ubuntu/Windows Node 20/24; every matrix passed Build, the complete Regression suite, all protected Smoke sections, and Package. The Windows Node 20 fix preserves continuous verified object ownership by handing the open handle from the removed source name to its authenticated stage hard link rather than weakening `EPERM` handling. Phase 3 is formally complete.

## Mandatory corrections from adversarial review

### Preview capability boundary

Preview proves implementation availability, path safety, ordinary-file facts, hashes, destination conflicts, parent plans, same-device eligibility, and policy facts without mutation. It cannot prove that a later hard-link call will succeed. Actual link permission is proven only inside the locked execution transaction, after the manifest exists and before a source name is removed. A failed execution probe must leave no logical mutation or reserved artifact.

### Stable source proof

Path-only `lstat -> readFile` inspection is insufficient. Move operations use `FileObjectIdentityV2`, based on stable device and file-index facts, separate from content/version facts. A zero, ambiguous, or unavailable object identity fails closed with `ATOMIC_BACKEND_UNAVAILABLE`.

Open each source handle; compare path `lstat` with handle `fstat`; stream SHA-256 from the handle; `fstat` again; require stable object ID, size, timestamps, and exact byte count. Keep the source handle open through stage-link creation and source-name removal. Verify every stage/destination link identifies the same object. Re-hash after final installation. Move preview, execution, recovery, and undo must not buffer complete files in memory.

### Durable participant decision

The published V1 implementation can persist audit/change-set participant effects before the final committed manifest transition. Recovery currently maps `committed_pending_participants` to rollback, which can split durable success evidence from filesystem state.

Repair this for existing Manifest V1 writers and new Manifest V2 moves:

- preassign stable participant references;
- participant effects are idempotent and probeable by transaction/change-set identity;
- all required participant effects present means recovery completes commit;
- no participant effects means recovery restores before-state;
- partial effects mean recovery restores before-state, preserves/correlates success evidence, appends recovery evidence, and transitions any published change set out of active state;
- unverifiable participant or filesystem evidence freezes the workspace;
- Manifest V2 persists an explicit `commit_decided` state;
- historical Manifest V1 derives the same decision from participant probes without changing schema version 1.

### Versioned move state

Existing create/replace/delete writers continue persisting Transaction Manifest V1 and Change Set Manifest V1. Move and move undo use authenticated Transaction Manifest V2 and Change Set Manifest V2. Change Set V2 records move pairs, stable identities, before/after hashes and bytes, exact transaction-created directories, owner/policy/retention facts, participant correlation, and a MAC. Pure moves store no content blobs.

### Guarantee boundary

Guaranteed: CodexPro root-keyed serialization; no unrelated overwrite; complete final mapping or proven rollback; process-crash recovery before workspace reuse; complete bytes at every visible file; reconciled transaction/audit/change-set outcome before public success.

Not guaranteed: serializable namespace visibility to arbitrary external readers during an in-progress batch; prevention of writes through external handles; absolute sudden-power-loss durability when directory sync is unsupported; execution success merely because preview succeeded.

### Lifecycle and retry

Before a preparing manifest exists, cancellation yields zero mutation. After transaction state or workspace artifacts exist, cancellation/disconnect becomes a transaction failure that must prove rollback or retain durable recovery evidence before settling. Transport closure does not abandon the transaction. Graceful shutdown stops new mutations, settles or hands off pending transactions, and only then closes audit/state resources. Workspace close does not invalidate a canonical root already captured by an active transaction.

Windows transient retries are bounded and state-aware for `EPERM`, `EACCES`, `EBUSY`, and sharing violations. Every retry re-inspects exact source, stage, and destination facts. `EEXIST` is never retried as transient.

## Core invariants

- Ordinary files only. Reject directories, symlinks, junction/reparse escapes, devices, sockets, ADS syntax, Windows device namespaces, UNC/drive-relative aliases, trailing-dot/space aliases, reserved device names, blocked paths, reserved transaction artifacts, and outside-workspace paths.
- One canonical workspace and one device/volume. Hard links are mandatory. No replacing rename for move installation, Shell, PowerShell, Git, Worktree, copy/delete fallback, overwrite, force, recursive move, glob, merge, or trash behavior.
- Every source requires a lowercase caller-supplied SHA-256.
- Existing destinations are allowed only when they are another source in the same validated batch.
- Independent moves, chains, cycles, duplicate-object hard-link sources, and Windows case-only renames use one deterministic stage-all/install-all algorithm.
- A preflight failure leaves zero transaction, change-set, directory, link, or mutation completion state.
- An execution failure restores all logical source mappings and removes only authenticated transaction-created names/directories, or freezes the workspace.
- Success requires durable authorization, authenticated change-set publication, participant reconciliation, durable commit decision, terminal audit evidence, and transaction finalization.
- Move undo is owner-bound, retention-bound, complete-preflight, no-clobber, and all-or-nothing.
- Configuration rollback to V1 hides V2 tools but retains V2 readers and recovery.

## Execution algorithm

### Non-mutating validation

1. Parse strict input and canonicalize paths.
2. Resolve the complete policy batch resource.
3. Build the move graph and reject duplicates, exact no-ops, aliases, conflicts, invalid parents, and cross-device eligibility.
4. Open source handles, prove path/handle identity, and stream expected hashes under limits.
5. Calculate exact missing parents and deterministic operation order.
6. Preview returns the plan and explicitly does not promise later link success.

### Locked execution

1. Complete recovery for the canonical root.
2. Acquire the root-keyed cross-process mutation lock.
3. Repeat every mutable path, parent, destination, object-ID, size/version, and hash precondition under lock.
4. Allocate transaction/change-set IDs and participant references.
5. Persist authenticated Manifest V2 generation 1 before workspace mutation.
6. Create missing parents shallowest-first, verifying and journaling each.
7. For each source in comparison-key order, create a no-clobber `.move` hard link, verify object identity, persist `staged_link_ready`, revalidate the original source name, unlink it, and persist `source_name_removed`.
8. After all sources are staged, revalidate destinations and parent identities. Link each stage to its exact destination, verify object identity and exact Windows entry spelling, persist `destination_link_ready`, stream-verify final content, unlink stage, and persist `installed`.
9. Persist `committed_pending_participants`; commit and probe idempotent change-set/audit effects; persist participant facts; persist `commit_decided`; persist `committed`; perform authenticated cleanup; release the lock; return success.

## Task sequence

### Task 1 — Freeze V1 wire contract and native feasibility

Add actual in-memory MCP `tools/list` snapshots and direct/supertool `tools/call` fingerprints for selected V1 minimal/standard/full and optional-feature fixtures. Freeze exact V1 names, descriptors, schemas, results, and errors before refactoring.

Add mandatory native-Windows probes for no-clobber hard links, exact case-only destination spelling, stable `dev/ino` identity, junction escape behavior, ADS rejection, transient sharing errors, and directory-sync capability. Add mandatory Ubuntu case-sensitive behavior and deterministic injected `EXDEV` coverage. V2 remains unavailable if stable object identity or path/handle containment cannot be proven.

### Task 2 — Versioned contract catalog and projection

Create `src/tools/contracts/{types,catalog,schemas,registration,index}.ts` and focused tests. Define immutable exact V1/V2 canonical sets, mode/connection-test/optional-feature projection, schema completeness, child registration totals of 28/31, direct/supertool/list parity, and Task 1 V1 fingerprints. Remove global V1-only captures. Keep production V2 fail-closed.

### Task 3 — Move configuration, schemas, and errors

Add strict `move_paths` input/output schemas, one closed error mapper, and configuration:

- per-file default 64 MiB, hard ceiling 1 GiB;
- per-batch default 256 MiB, hard ceiling 4 GiB;
- maximum 64 items;
- bounded hash concurrency, default no more than four.

Test unknown fields, bounds, lowercase hashes, defaults, caller-order output, preview transaction null, committed transaction non-null, safe details, and exact retryable flags. Map `EXDEV`, `EEXIST`, `ENOENT`, permissions/sharing, unsupported links, integrity mismatch, rollback failure, and recovery-required outcomes without leaking absolute paths, current hashes, artifact names, state paths, or foreign workspace facts.

### Task 4 — Transaction Manifest V2 and Change Set Manifest V2

Add strict authenticated schemas, key separation, union readers/listers, no cross-version transitions, move operation states, transaction states including `commit_decided`, stable object identities, created directories, participant references, generations, and directory-sync capability. Add V2 change-set move pairs, zero blobs, owner/policy/retention facts, correlation, and MAC. Preserve complete V1 compatibility.

### Task 5 — Handle facts and pure graph planning

Create move planning/inspection modules and tests for canonical grammar, Windows aliases, duplicates, exact no-op versus case-only rename, independent/chained/cyclic moves, duplicate-object hard links, source-as-destination, unrelated target conflicts, parent conflicts, realpath containment, nearest-parent identity, symlink/junction/path-handle mismatch/ADS/blocked/outside-root rejection, stable object identity, streaming hash, same-device eligibility, missing-parent planning, limits, bounded concurrency, and preview zero mutation.

### Task 6 — Extend the single engine with move execution

Extend `AtomicTransactionEngine`; do not create a second lock or transaction engine. Implement the execution algorithm and fault points before/after every manifest write, mkdir, link, verification, unlink, participant write, commit decision, cleanup, and lock release. Add state-aware Windows retries.

### Task 7 — Repair participant-aware recovery for every writer

Add idempotent participant probes and crash fixtures. Test before/after audit append, change-set publication, participant fact persistence, all participants before commit decision, commit decision before committed, and cleanup. Cover existing V1 write/edit/apply_patch/handoff writers. Assert no split-brain success/rollback state and idempotent repeated recovery. This is a Phase 3 closure blocker independent of `move_paths`.

### Task 8 — Move rollback and crash recovery

Dispatch recovery by manifest version. Preserve V1 behavior except the participant decision repair. Use streamed V2 verification and no-clobber hard-link restoration for every source/stage/destination crash combination. Remove only authenticated artifacts and transaction-created empty parents. Freeze on ambiguity. Run repeated native-Windows crash/reopen loops for independent moves, chains, cycles, case-only rename, duplicate-object links, transient errors, and cleanup interruption.

### Task 9 — Mutation runtime and move change sets

Use a version-neutral prepared transaction boundary. Existing writers retain V1. Validate move transaction/change-set IDs, operations, ordering, identities, hashes, bytes, directories, participant references, and zero blobs. Publication failures follow the participant reconciliation matrix.

### Task 10 — Conflict-checked move undo

Preflight owner binding, retention, exact destination hash/object facts, original source absence, reverse policy, same-device readiness, no-clobber, and created-directory emptiness before mutation. Reverse chains/cycles/duplicate objects/case-only names through the same V2 engine. Any conflict returns `UNDO_CONFLICT` with zero mutation. Undo is non-redo and records `revertsChangeSetId`.

### Task 11 — Policy and audit query

`move_paths` is R2, `filesystem:write`, `filesystem_batch operation=move`; authorize every source and destination, deny the complete batch on one denial, normalize the resource fingerprint independently of caller order, preserve caller order in output, and omit raw path lists from audit summaries.

`query_audit_events` is full-only, R1, installation-level `audit:read`. Audit the query. Bind authenticated cursors to all filters and a stable descending sequence boundary. Exclude installation keys, state paths, canonical roots, credentials, owner-binding values, and quarantined bytes.

### Task 12 — Atomic V2 activation

Register query in full only; undo and move in standard/full; hide all three in minimal and connection-test. Remove the incomplete gate only when schemas, registration, policy, participant recovery, inventory, self-test, Tool Card, direct/supertool parity, and V1 fingerprints are complete. V2 fails closed for non-atomic mode, unavailable/integrity-failed audit, unavailable state root, missing participant reconciler, missing move runtime, or inconsistent projection. V1 remains exact and default.

### Task 13 — Lifecycle, concurrency, aliases, and resources

Test abort/disconnect boundaries, graceful shutdown/forced termination, two servers on one root/state root, aliases resolving to one canonical root, workspace close during mutation, concurrent writers/external target creation/source replacement, bounded hashing and I/O passes, handle closure, zero plaintext retention, link-count/backend failures, and unsupported directory-sync diagnostics.

### Task 14 — Inventory, self-test, Tool Card, and documentation

Update capabilities/inventory, self-test, Tool Card, README/README_ZH, SECURITY, CHANGELOG, configuration, AGENTS, master plan, Memory, archive, this plan, and design errata. Document exact projections, limits, same-device requirement, preview limitation, undo, participant decision, audit scope, cancellation, isolation boundary, process-crash guarantee, directory-sync limitation, rollback, and non-goals in English and Chinese.

### Task 15 — Model-based fault, security, and platform acceptance

Add a deterministic state oracle over every fault point. After recovery, require exactly committed or exactly before-state; no unrelated path change; no artifact unless frozen with evidence; participant/audit/change-set agreement; correct directory decision; idempotent recovery; no secret/content/raw path-list leakage.

Stress 1/64 items, byte boundaries, long chains/cycles, duplicate-object hard links, Windows case-only rename, preview/execution conflicts, every journal/link/unlink/participant/cleanup boundary, rollback conflict/freeze, undo, Git/non-Git equivalence, concurrent processes, and bounded retry. Run static gates against direct-mutation bypass, reserved artifacts, Shell/PowerShell/Git/copy-delete/replacing-rename fallback, unbounded move reads, secret leakage, and protected Smoke drift.

### Task 16 — Complete Phase 3 acceptance and publish once

Fresh final order:

1. TypeScript Build.
2. All Phase 3 focused tests, including participant recovery.
3. Complete `node --test test/*.test.mjs` regression.
4. All eight protected Smoke sections.
5. Native-Windows Stress with V2 crash/recovery, case-only rename, junction/ADS defenses, transient sharing failures, and multi-process locks.
6. Ubuntu case-sensitive/exact-contract verification.
7. Package dry-run and exact contents.
8. Diff/static/protected-source/reserved-artifact/bypass/streaming/secret/document gates.
9. neat-freak over the complete Phase 3D batch.
10. Repeat every affected gate.
11. Confirm exact intended scope, V1 default, and explicit V2 startup.

Publication completed through implementation commit `3000aa6`, test-stabilization commit `e5d9d27`, and Windows Node 20 compatibility commit `2df4a1f`. Exact-head run `29441752493` passed Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package. Any CI failure remains inside Phase 3 and is fixed without weakening security, recovery, rollback, audit, or contract gates.

## Final acceptance invariants

Phase 3 closes only when fresh evidence proves old-version conflicts, no-clobber create, complete replacement bytes, zero-mutation move preflight, complete move mapping or rollback, recovery at every crash boundary, participant-complete commit recovery, partial-participant compensation, no atomic writer bypass, authorization-before-mutation, terminal/recovery audit agreement, complete correlation, conflict-checked undo, Git/non-Git equivalence, exact V1 28-tool wire compatibility, coherent exact V2 31-tool wire behavior, direct/supertool parity, migration compatibility, no atomic fallback, and accurate documentation of preview, namespace, external-writer, and power-loss limits.

## Rollback

Operational rollback is configuration-first: select contract V1 and, if necessary, legacy transaction mode without deleting evidence. A code rollback release must retain Manifest V2 and Change Set V2 readers, participant reconciliation, and recovery while hiding V2 registration.

Never delete transaction/audit/change-set/freeze evidence outside retention; interpret participant-complete state as rollback solely because the final manifest state is absent; bypass recovery-required workspaces; restore direct writes while claiming atomic mode; overwrite conflicts; or introduce Git, Shell, PowerShell, replacing rename, or copy/delete fallback.

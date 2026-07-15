# Phase 3C Mutator Migration and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every repository-supported workspace writer onto the Phase 3 transaction kernel, make required persistent audit part of mutation commit, retain bounded encrypted before-state, expose conflict-checked change-set undo, and prepare one version-selected contract surface without publishing an incomplete V2.

**Architecture:** A server-owned `WorkspaceMutationRuntime` composes the existing `AtomicTransactionEngine`, Phase 3B persistent audit runtime, and a new encrypted change-set store. Mutator providers prepare exact byte operations and return a private pending commit handle; the registered-tool wrapper durably records terminal audit evidence, commits the audit and change-set participants, finalizes the transaction, and only then emits public success. Contract schemas and tool sets are explicitly versioned. Contract V1 remains byte-for-byte unchanged and is the default. Because the approved V2 set is V1 plus `query_audit_events`, `undo_change_set`, and Phase 3D's `move_paths`, Phase 3C prepares V2 and tests its 30 implemented members but server construction for contract 2 remains fail-closed until Phase 3D registers `move_paths`; Phase 3D then enables the complete 31-tool snapshot once.

**Tech Stack:** TypeScript 5.8, Node.js 20/24 built-in `crypto`, `fs`, and `fs/promises`, Zod 3.25, Node test runner, native Windows NTFS verification, Ubuntu CI compatibility.

## Global Constraints

- Native Windows is primary; WSL, Git, PowerShell, Shell, and external services are not transaction dependencies.
- Contract V1 remains the exact current 28-child-tool surface and exact current schemas for one migration release.
- Contract V2 is never advertised or constructible as a partial public contract. Its final 31-tool activation is a Phase 3D gate.
- `CODEXPRO_TOOL_CONTRACT_VERSION` defaults to `1`, is selected once at server construction, and accepts only `1|2`.
- Writable contract V2 requires `CODEXPRO_FILE_TRANSACTIONS=atomic`, a usable Phase 3 state root, and valid persistent audit configuration for the selected policy mode.
- Atomic mode never uses direct workspace `writeFile`, `appendFile`, replacing `rename`, destructive `unlink`, or a legacy fallback.
- Every visible mutation has one transaction ID and one change-set ID internally, including contract V1 mutations whose output hides them.
- Required audit authorization is durable before mutation. Required terminal execution evidence, the audit participant, and the change-set participant commit before public success.
- A normal success without the private pending commit handle is an atomic-mode contract violation and fails closed.
- Immediate rollback never depends on retained undo material. Retention failure may set `undo_supported: false` but cannot weaken transaction rollback.
- Retained before-state is AES-256-GCM encrypted with an installation-derived key, independent nonces, authenticated metadata, and no plaintext application-state copy.
- Undo is a new no-clobber transaction with complete preflight. It has no force, overwrite, redo, arbitrary path, or cross-workspace option.
- Foreign or unverifiable change-set identifiers return `CHANGE_SET_NOT_FOUND` without confirming existence.
- Application-state writers, audit segments, transaction artifacts, profiles, and installer/runtime files are classified separately from authorized workspace writers.
- Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged unless an independently justified exact compatibility migration is recorded in the same change.
- Each task uses TDD: focused RED, minimal GREEN, adjacent regression, review, neat-freak reconciliation, scoped stage/English commit/push, and exact-head CI before the next published part.

## Phase-boundary correction

The approved Phase 3C design says both that V2 is an exact 31-tool set containing `move_paths` and that `move_paths` is implemented only in Phase 3D. The direct consequence is that Phase 3C cannot truthfully complete the design's rollout step "enable contract V2" by itself. This plan therefore applies the smallest fail-closed correction:

1. Phase 3C implements version selection, all migrated V2 schemas, `query_audit_events`, and `undo_change_set`.
2. Phase 3C tests the implemented V2 prefix and asserts that production contract-2 construction fails with `CONTRACT_V2_INCOMPLETE` while `move_paths` is absent.
3. Contract V1 remains the only constructible public contract after Phase 3C, including writable atomic V1.
4. Phase 3D adds `move_paths`, removes the incomplete gate, and runs the exact 31-tool V2 Smoke/Stress/CI acceptance once.

This preserves both phase ownership and the stronger invariant that every advertised contract is complete and executable.

## File Structure

### New mutation and change-set modules

- `src/mutations/types.ts` — private pending-result symbol, version-neutral mutation request/result facts, owner binding, and runtime interfaces.
- `src/mutations/runtime.ts` — transaction preparation, participant handshake, result finalization, and V1/V2 public projection.
- `src/mutations/writers.ts` — exact create/replace/delete operation builders shared by public tools, handoff writers, Pro-context, probes, and scripts.
- `src/mutations/index.ts` — closed mutation-runtime export surface.
- `src/changesets/types.ts` — manifest, operation, retention, owner, state, tombstone, and stable undo error types.
- `src/changesets/schemas.ts` — strict persisted and public Zod schemas, including `TransactionResultV2`.
- `src/changesets/crypto.ts` — HKDF key separation and AES-256-GCM blob envelope encode/decode.
- `src/changesets/store.ts` — authenticated manifest/blob persistence, retention, pruning, tombstones, and state transitions.
- `src/changesets/undo.ts` — authenticated load, complete current-state preflight, reverse-operation construction, preview, and audited undo execution.
- `src/changesets/index.ts` — closed change-set export surface.
- `src/tools/schemas/transactionResult.ts` — one strict public `TransactionResultV2` schema.
- `src/tools/schemas/undoChangeSet.ts` — strict input, output, failure, and renderer data contracts.

### Existing modules modified

- `src/config.ts` — tool-contract version and bounded change-set retention configuration.
- `src/server.ts` — server-owned mutation runtime, provider injection, pending-commit wrapper, V1/V2 registration, undo/query handlers, and exact mode visibility.
- `src/codexproSupertool.ts` and `src/tools/schemas/codexpro.ts` — one selected canonical set and version-specific child schema map.
- `src/policy/toolPolicy.ts`, `src/policy/resources.ts`, `src/policy/integration.ts`, and related policy types/schemas — injected resource resolver and undo batch descriptor without storage logic in the pure evaluator.
- `src/fsOps.ts`, `src/handoffOps.ts`, `src/proContext.ts`, and the patch path in `src/server.ts` — prepare exact complete-file transaction operations rather than mutate directly in atomic mode.
- `scripts/pro-apply.mjs` and `scripts/codexpro.mjs` — use the built mutation service for supported workspace writers; leave app-state and external installer/runtime writes explicitly classified.
- `src/tools/schemas/write.ts`, `edit.ts`, `applyPatch.ts`, `exportProContext.ts`, `handoffToAgent.ts`, `handoffToCodex.ts`, and `codexproSelfTest.ts` — version-specific V2 schemas while retaining exported V1 aliases.
- `config.example.env`, `README.md`, `README_ZH.md`, `SECURITY.md`, `CHANGELOG.md`, `AGENTS.md`, the master plan, `Memory.md`, and the active Phase 3 archive — exact configuration, security, migration, evidence, rollback, and next action.

### New focused tests and fixtures

- `test/transaction-contract-version.test.mjs`
- `test/change-set-schema-and-crypto.test.mjs`
- `test/change-set-store.test.mjs`
- `test/mutation-runtime.test.mjs`
- `test/write-edit-transaction.test.mjs`
- `test/apply-patch-transaction.test.mjs`
- `test/bridge-writer-transaction.test.mjs`
- `test/pro-apply-transaction.test.mjs`
- `test/undo-change-set.test.mjs`
- `test/mutation-architecture.test.mjs`
- `fixtures/mutation-audit-failure-child.mjs`

---

### Task 1: Versioned Contract Configuration and Fail-closed Phase Boundary

**Files:**
- Modify: `src/config.ts`
- Modify: `src/tools/schemas/codexpro.ts`
- Modify: `src/codexproSupertool.ts`
- Modify: `src/server.ts`
- Modify: `src/audit/lock.ts` (publication-gate repair discovered during Task 1)
- Create: `test/transaction-contract-version.test.mjs`
- Create: `test/audit-lock-release.test.mjs` (publication-gate repair regression)
- Modify: `config.example.env`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3-part-2.md`

**Interfaces:**
- Produces `ToolContractVersion = 1 | 2`, `CodexProConfig.toolContractVersion`, `CANONICAL_CODEXPRO_CHILD_TOOLS_V1`, `CANONICAL_CODEXPRO_CHILD_TOOLS_V2`, `canonicalCodexProChildTools(version)`, and `assertToolContractConfiguration(...)`.
- Keeps `CANONICAL_CODEXPRO_CHILD_TOOLS` as an exact V1 compatibility alias.
- V2 constant contains all 31 names, but `createCodexProServer()` rejects V2 with `CONTRACT_V2_INCOMPLETE` until the injected capability says `movePaths: true`.

- [x] **Step 1: Write RED tests**

Assert default/explicit/invalid parsing, exact V1 28 names, exact V2 31 names, V2 superset ordering, immutability, and V2 rejection when atomic/audit/state-root/move capability is absent. Also assert V1 supertool and child schema behavior is byte-for-byte unchanged.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/transaction-contract-version.test.mjs test/codexpro-contract.test.mjs`

Expected: focused test fails because versioned configuration and canonical sets do not exist; existing V1 contract test passes.

- [x] **Step 3: Implement the minimal versioned selector**

Use numeric internal values and strict parsing:

```ts
export type ToolContractVersion = 1 | 2;

function toolContractVersionFrom(value: string | undefined): ToolContractVersion {
  const normalized = value?.trim();
  if (!normalized || normalized === "1") return 1;
  if (normalized === "2") return 2;
  throw new Error("CODEXPRO_TOOL_CONTRACT_VERSION must be 1 or 2.");
}
```

Derive all selected arrays and maps from `config.toolContractVersion`. Do not add an operational `move_paths` placeholder.

- [x] **Step 4: Confirm GREEN and V1 compatibility**

Run: `npm run build && node --test test/transaction-contract-version.test.mjs test/codexpro-contract.test.mjs test/transaction-config-and-path-policy.test.mjs test/audit-architecture.test.mjs`

Expected: all pass; V2 is defined but cannot start; V1 remains exact.

- [x] **Step 5: Review, reconcile, publish, and wait for exact-head CI**

Run the phase-part neat-freak checks, update the archive/Memory, stage only listed files, commit `feat: add versioned tool contract gate`, push `main`, and require Ubuntu/Windows Node 20/24 exact-head CI.

Execution note: the first complete-regression gate exposed a transient Windows `EPERM` while releasing the persistent-audit writer lock. The same task therefore includes the minimal TDD repair: retry only `EPERM`, `EACCES`, and `EBUSY` with bounded delays, revalidate ownership before every attempt, and keep all other failures fail-closed.

---

### Task 2: Change-set Schemas, Key Separation, and Encrypted Blob Store

**Files:**
- Create: `src/changesets/types.ts`
- Create: `src/changesets/schemas.ts`
- Create: `src/changesets/crypto.ts`
- Create: `src/changesets/store.ts`
- Create: `src/changesets/index.ts`
- Create: `src/tools/schemas/transactionResult.ts`
- Modify: `src/transactions/installation.ts`
- Modify: `src/transactions/index.ts`
- Modify: `src/config.ts`
- Create: `test/change-set-schema-and-crypto.test.mjs`
- Create: `test/change-set-store.test.mjs`

**Interfaces:**
- Produces strict `ChangeSetManifestV1`, `ChangeSetOperationV1`, `ChangeSetState`, `ChangeSetRetentionConfig`, and `TransactionResultV2` schemas.
- Produces `deriveChangeSetBlobKey(masterKey)`, `encryptChangeSetBlob(...)`, `decryptChangeSetBlob(...)`, and `ChangeSetStore`.
- Default limits: 8 MiB plaintext/change set, 128 MiB installation ciphertext, 20 active/workspace, 24-hour active retention, 30-day tombstones.

- [x] **Step 1: Write schema and crypto RED tests**

Cover strict unknown-field rejection, IDs, timestamps, no canonical roots, no plaintext body field, independent 12-byte nonces, AES-GCM authentication failure, wrong AAD/operation/change-set rejection, and HKDF separation from audit keys.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/change-set-schema-and-crypto.test.mjs`

Expected: module import failure.

- [x] **Step 3: Implement strict types and crypto**

Use an envelope with fixed magic/version/nonce/tag/ciphertext lengths and AAD containing schema version, change-set ID, blob ID, operation ID, and before SHA-256. Never serialize the derived key or plaintext.

- [x] **Step 4: Write store RED tests**

Cover manifest/blob creation, exclusive IDs, authenticated read, active/undone/expired/recovery-required transitions, size/count/total pruning, expiry tombstones, corrupt manifest/blob fail-closed, Windows-safe state paths, and concurrent store mutation under the existing state lock discipline.

- [x] **Step 5: Implement store GREEN**

Persist manifests with `AtomicJsonFileStore`; write ciphertext exclusively, sync before manifest reference, and remove only authenticated unreferenced artifacts. Retention failure returns an explicit non-undoable reason without throwing after the caller has chosen non-retained commit.

- [x] **Step 6: Verify and publish**

Run focused tests, adjacent installation/audit/transaction tests, Build, `git diff --check`, secret/plaintext signature scans, neat-freak, scoped commit `feat: add encrypted change set store`, push, and exact-head CI.

---

### Task 3: Server-owned Mutation Runtime and Commit Handshake

**Files:**
- Create: `src/mutations/types.ts`
- Create: `src/mutations/runtime.ts`
- Create: `src/mutations/writers.ts`
- Create: `src/mutations/index.ts`
- Modify: `src/server.ts`
- Modify: `src/audit/transactionParticipant.ts`
- Modify: `src/policy/integration.ts`
- Create: `test/mutation-runtime.test.mjs`
- Create: `fixtures/mutation-audit-failure-child.mjs`

**Interfaces:**
- Produces `WorkspaceMutationRuntime.prepare(...)`, `PendingWorkspaceMutation`, the private `PENDING_WORKSPACE_MUTATION` symbol, `attachPendingWorkspaceMutation(...)`, and `pendingWorkspaceMutation(...)`.
- One server lifecycle owns one engine/runtime; no process-global sharing.
- The wrapper sequence is visible install, durable terminal event, audit participant, change-set participant, transaction finalization, public projection.

- [x] **Step 1: Write handshake RED tests**

Cover successful create/replace/delete, transaction and change-set correlation, required audit append failure rollback, change-set participant failure rollback, missing handle fail-closed, double finalize rejection, provider throw rollback, cleanup-pending success only after committed manifest proof, and V1 result projection hiding transaction metadata.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/mutation-runtime.test.mjs`

- [x] **Step 3: Implement the private handle and runtime**

The handle must be non-enumerable and unavailable through structured output serialization. It owns rollback until the wrapper finalizes or rolls back; ordinary provider results cannot finalize themselves.

- [x] **Step 4: Integrate the wrapper**

Extend `registerToolCompat` with server-local mutation dependencies. In atomic mode, only configured mutator names require a handle; preview/read/failure results do not. Map internal failures to exact V2 errors and existing generic V1 families without changing V1 schemas.

- [x] **Step 5: Verify and publish**

Run focused, policy audit, transaction participant, full wrapper regression, Build, neat-freak, commit `feat: add audited mutation commit runtime`, push, and exact-head CI.

---

### Task 4: Transaction-backed `write` and `edit`

**Files:**
- Modify: `src/fsOps.ts`
- Modify: `src/server.ts`
- Modify: `src/tools/schemas/write.ts`
- Modify: `src/tools/schemas/edit.ts`
- Create: `test/write-edit-transaction.test.mjs`
- Modify: `test/write-contract.test.mjs`
- Modify: `test/edit-contract.test.mjs`

**Interfaces:**
- V2 input adds optional lowercase 64-hex `expected_sha256`.
- V2 success adds `transaction` and `before_sha256`; V1 input/output remain exact.
- Internal write/edit providers return prepared complete bytes plus observed before facts; mutation runtime performs final revalidation.

- [x] **Step 1: Write RED contract and behavior tests**

Cover absent/present hash semantics, `overwrite:false` no-clobber, concurrent create, exact UTF-8 bytes, BOM/newline preservation for edit, snippet count errors before transaction, old-version conflicts, complete-reader visibility, required audit rollback, V1 atomic output compatibility, and direct/supertool parity.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/write-edit-transaction.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs`

- [x] **Step 3: Split preparation from mutation**

Make legacy functions remain available only to `fileTransactions=legacy`. Atomic providers produce exact `Buffer` operations and never call direct write APIs. Preserve current secret-content and `PathGuard` checks before transaction preparation.

- [x] **Step 4: Add strict V2 schemas and version-selected registration**

Use shared `transactionResultV2Schema`; do not widen V1 unions. Conflict detail returns only normalized relative path, never current hash.

- [x] **Step 5: Verify and publish**

Run focused and adjacent path/security/contract tests, Build, repeat concurrency on Node 20, neat-freak, commit `feat: migrate write and edit transactions`, push, and exact-head CI.

---

### Task 5: Transaction-backed Multi-file `apply_patch`

**Files:**
- Modify: `src/server.ts`
- Modify: `src/tools/schemas/applyPatch.ts`
- Create: `test/apply-patch-transaction.test.mjs`
- Modify: existing apply-patch tests and compatibility loader only if exact source changes require it

**Interfaces:**
- Patch parsing returns a complete deterministic create/replace/delete operation plan before mutation.
- V2 optionally accepts bounded `expected_files` and returns per-file before/after hashes plus one transaction object.

- [x] **Step 1: Write RED tests**

Cover invalid later hunk causing zero change, duplicate/case-folded target rejection, create/replace/delete, expected-files mismatch, fault after each visible install rolling back the complete set, audit failure rollback, one change set, V1 exact output, and direct/supertool parity.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/apply-patch-transaction.test.mjs test/apply-patch-contract.test.mjs`

- [x] **Step 3: Implement preflight plan and atomic provider**

Parse all hunks and read all before bytes before calling the runtime. Sort transaction operations by comparison key while preserving caller file order in output.

- [x] **Step 4: Verify and publish**

Run focused tests, patch smoke compatibility, Build, neat-freak, commit `feat: migrate patch transactions`, push, and exact-head CI.

---

### Task 6: Transaction-backed Bridge, Handoff, Pro-context, Probe, and CLI Writers

**Files:**
- Modify: `src/fsOps.ts`
- Modify: `src/handoffOps.ts`
- Modify: `src/proContext.ts`
- Modify: `src/server.ts`
- Modify: `scripts/pro-apply.mjs`
- Modify: supported workspace-writer sections of `scripts/codexpro.mjs`
- Modify: affected V2 tool schemas
- Create: `test/bridge-writer-transaction.test.mjs`
- Create: `test/pro-apply-transaction.test.mjs`

**Interfaces:**
- `ensureAiBridge` produces one bounded scaffold operation plan.
- Handoff plan/status/diff/state/log files are one multi-file transaction; JSONL updates are complete-file replacements.
- Pro-context export is one transaction.
- Self-test mutates only `.ai-bridge/codexpro-self-test.md` and requests non-retained change-set material.
- `pro-apply` imports the built mutation service and performs plan plus both logs in one transaction.

- [x] **Step 1: Write RED all-or-nothing tests**

Cover empty scaffold, partial pre-existing scaffold, append replacement, later-file fault rollback, audit failure rollback for every writer, size bounds before mutation, no orphan plan/state/log, Pro-context overwrite, self-test restricted path/non-retention, CLI success/rollback, and V1 compatibility.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/bridge-writer-transaction.test.mjs test/pro-apply-transaction.test.mjs`

- [x] **Step 3: Implement one shared operation builder**

Read bounded existing logs, construct complete after bytes, and send all operations through `WorkspaceMutationRuntime`. Classify app-state writes in `scripts/codexpro.mjs` separately; do not route profile, credential reference, process state, installer, or transaction state through workspace mutations.

- [x] **Step 4: Verify and publish**

Run focused tests, existing handoff/Pro-context/self-test suites, CLI smoke, Build, neat-freak, commit `feat: migrate bridge workspace writers`, push, and exact-head CI.

---

### Task 7: Static Mutation Closure Gate

**Files:**
- Create: `test/mutation-architecture.test.mjs`
- Modify: source only for unclassified workspace bypasses found by the test
- Modify: `AGENTS.md` and `SECURITY.md` with the allowed direct-writer classification

**Interfaces:**
- Produces a fail-closed inventory of `writeFile`, `appendFile`, `rename`, `unlink`, `rm`, `copyFile`, `link`, and equivalent primitives in `src/` and shipped runtime scripts.
- Allows only transaction backend, atomic app-state writer, audit segment maintenance, and documented installer/runtime/app-state locations outside authorized workspaces.

- [x] **Step 1: Write the inventory test and confirm RED**

The test must enumerate source files directly, normalize line endings, bind every allowlisted occurrence to a canonical path plus reviewed purpose, and fail on new primitives or line drift. It must initially fail on remaining direct workspace writers.

- [x] **Step 2: Remove or classify every bypass**

No broad directory or regex exemption. Each allowed primitive gets one narrow classification; test/fixture writers are excluded by source-root selection, not wildcard permission.

- [x] **Step 3: Verify and publish**

Run the inventory test, full writer tests, Build, `git diff --check`, secret/audit-redaction scans, neat-freak, commit `test: close workspace mutation inventory`, push, and exact-head CI.

---

### Task 8: Owner Binding, Policy Resource Resolver, and `undo_change_set`

**Files:**
- Create: `src/changesets/undo.ts`
- Create: `src/tools/schemas/undoChangeSet.ts`
- Modify: `src/policy/types.ts`
- Modify: `src/policy/schemas.ts`
- Modify: `src/policy/resources.ts`
- Modify: `src/policy/toolPolicy.ts`
- Modify: `src/policy/integration.ts`
- Modify: `src/server.ts`
- Modify: `src/tools/schemas/codexpro.ts`
- Create: `test/undo-change-set.test.mjs`

**Interfaces:**
- Owner binding priority: OAuth subject, then credential reference, then transport session ID; stores only keyed binding material.
- Produces injected `ToolResourceResolver` and bounded `filesystem_batch` descriptor for undo.
- Tool input is strict `{ workspace_id, change_set_id, preview? }`; standard/full only, connection-test hidden, R2, `filesystem:write`.

- [x] **Step 1: Write RED identity/policy/undo tests**

Cover create/replace/delete/append-replacement/patch restoration, foreign/unverifiable non-disclosure, state/expiry/unsupported/already-applied errors, any current-state drift causing zero-change `UNDO_CONFLICT`, blocked reverse path, bad blob authentication, preview zero mutation, audit failure rollback, original marked undone only after audited reverse commit, and non-undoable reverse change set.

- [x] **Step 2: Confirm RED**

Run: `npm run build && node --test test/undo-change-set.test.mjs`

- [x] **Step 3: Implement complete preflight and reverse transaction**

Load authenticated metadata only through the resolver, verify workspace/owner/state/retention/current after-state/policy/blob/backend/audit before transaction prepare, and preserve non-disclosure error mapping. Decrypt only required bounded blobs after metadata authorization.

- [x] **Step 4: Implement direct/supertool V2 adapters without enabling public V2**

Add the version-specific schemas and handler map. Assert the current Phase 3C incomplete gate still prevents production contract-2 construction until Phase 3D.

- [x] **Step 5: Verify locally; defer publication to the Phase 3C gate**

Run focused, policy, lifecycle, transaction, audit, and contract tests plus Build and diff checks. Per the user's 2026-07-15 instruction, do not commit, push, or run exact-head CI for this individual task; preserve the verified Task 8 worktree and publish only after all Phase 3C tasks and the complete local phase gate pass.

---

### Task 9: Persistent Runtime Injection and Writable Atomic V1 Migration Gate

**Files:**
- Create: `src/productionRuntime.ts`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/stdio.ts`
- Modify: `src/transactions/recovery.ts`
- Create: `test/production-runtime-integration.test.mjs`
- Modify: `test/mutation-architecture.test.mjs`

**Interfaces:**
- Production server constructs one state-root/installation/registry/audit/change-set/mutation runtime per lifecycle domain.
- `workspaceMutatorsAtomic` becomes true only after the static closure inventory passes.
- Writable atomic contract V1 becomes valid and keeps exact V1 public schemas; V2 remains fail-closed only because `move_paths` is not implemented.

- [x] **Step 1: Write RED production-wiring tests**

Cover runtime singleton per server, independent runtimes between servers, writable atomic V1 success, required audit initialization/corruption failure before tools register, no runtime injection in legacy mode, and V2 incomplete rejection.

- [x] **Step 2: Implement production composition**

Use explicit dependency injection for tests. Do not restore process-global `WorkspaceManager`, transaction engine, audit store, or change-set store sharing.

- [x] **Step 3: Verify locally and preserve the Phase 3C batch**

Run all Phase 3A–3C focused tests and the relevant production-wiring checks. Do not commit, push, or run exact-head CI at the Task 9 boundary; the complete Build/regression/Smoke/Stress/package/static/neat-freak gate and publication occur once in Task 10 after all Phase 3C work is complete.

---

### Task 10: Phase 3C Acceptance and Phase 3D Handoff

**Files:**
- Modify: `README.md`
- Modify: `README_ZH.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Modify: `config.example.env`
- Modify: `AGENTS.md`
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3-part-4.md`

- [x] **Step 1: Run the complete safe local acceptance gate**

Run:

```powershell
npm run build
node --test test/transaction-*.test.mjs test/audit-*.test.mjs test/change-set-*.test.mjs test/mutation-*.test.mjs test/write-edit-transaction.test.mjs test/apply-patch-transaction.test.mjs test/bridge-writer-transaction.test.mjs test/pro-apply-transaction.test.mjs test/undo-change-set.test.mjs
node --test test/*.test.mjs
npm run smoke
npm run stress
npm pack --dry-run --json
git diff --check
```

Also run Node 20 focused concurrency/crash loops, static mutation/reserved-artifact/secret/audit-redaction/protected-source gates, and exact intended-file review. The complete execute/watch/loop lifecycle Smoke must run in an independent process such as GitHub Actions rather than through the CodexPro process carrying the control channel; local acceptance uses its syntax, environment-isolation architecture gate, complete regression coverage, and the other seven Smoke sections.

- [x] **Step 2: Perform Phase 3C neat-freak reconciliation**

Reconcile code, both READMEs, security, changelog, configuration, AGENTS, master plan, Memory, archive, relative links, archive-volume size, stale claims, naming, and rollback. State explicitly: writable atomic V1 is active; V2 internals exist; V2 public startup remains unavailable until Phase 3D supplies `move_paths`.

- [x] **Step 3: Publish and require exact-head CI**

Published the complete reviewed Phase 3C batch as commit `50ec99b` (`feat: enable audited atomic workspace mutations`). Exact-head run `29390317879` passed Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package.

- [ ] **Step 4: Write the Phase 3D TDD plan**

Derive the separate `move_paths` and total Phase 3 acceptance plan from the approved Phase 3D design. Its first production task implements the missing V2 member; its activation task removes `CONTRACT_V2_INCOMPLETE` only after exact 31-tool direct/supertool/policy/inventory/self-test/Tool Card parity is green.

---

## Plan self-review checklist

- [x] Every Phase 3C required writer has an explicit migration task.
- [x] Every behavior task begins with observable RED and names the exact GREEN command.
- [x] V1 compatibility and incomplete-V2 fail-closed behavior are tested at every relevant boundary.
- [x] Change-set confidentiality, integrity, retention, identity, and non-disclosure have focused tests.
- [x] Audit ordering and participant rollback are tested for every mutator family.
- [x] Static writer classification has no broad exemption.
- [x] No placeholder handler or unavailable public tool is used to fake the 31-tool contract.
- [x] Every task includes local review and verification; publication, neat-freak closure, and exact-head CI are consolidated at the complete Phase 3C boundary per the 2026-07-15 execution rule.
- [x] Phase 3C closure cannot claim Phase 3 completion; Phase 3D remains an immediate gate.

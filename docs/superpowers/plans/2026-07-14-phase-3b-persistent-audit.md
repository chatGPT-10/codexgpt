# Phase 3B Persistent Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-first persistent local audit subsystem with two immutable authorization/execution events, canonical authenticated JSONL storage, conservative locking, tail recovery, rotation, retention, bounded queries, policy-runtime integration, and transaction participation without changing the public contract V1 surface.

**Architecture:** New focused modules under `src/audit/` own event schemas, canonical encoding, the installation-wide writer lock, append/query storage, maintenance, runtime orchestration, and transaction participation. The subsystem reuses the Phase 3 installation master key, state root, process-instance registry, and transaction participant gate; it does not store file bodies, diffs, command output, credentials, or canonical workspace roots. Phase 3B prepares the dormant `query_audit_events` V2 handler and policy resource, while exact public contract V2 selection and registration remain Phase 3C work.

**Tech Stack:** TypeScript 5.8, Node.js 20/24 built-in `crypto`, `fs`, `fs/promises`, Zod 3.25, Node test runner, native Windows filesystem verification, Ubuntu CI compatibility.

## Global Constraints

- Native Windows is the primary platform; WSL must not become mandatory.
- Use Node-native APIs only; add no database, native addon, logging service, background worker, PowerShell, Git, or remote dependency.
- Audit state stays under the Phase 3 application state root, outside authorized workspaces and Git.
- `AuditEventV1` remains readable and unchanged for one migration cycle; Phase 3B introduces strict `AuditEventV2` and `AuditEnvelopeV1` types.
- Authorization and terminal execution are separate immutable events linked by opaque IDs.
- Required R2+ mutation authorization must be durable before execution, and terminal execution must be durable before transaction finalization.
- Required audit failure must fail closed; best-effort failure may degrade diagnostics but must never turn a denied operation into an allowed operation.
- The HMAC chain is integrity evidence, not tamper-proof storage against the same OS account.
- Store no file bodies, complete diffs, raw command output, Authorization/Cookie values, credential-bearing URLs, private keys, `.env` contents, or canonical workspace roots.
- Rotation occurs at UTC date change or before a record would exceed 10 MiB.
- Default retention is 30 days and 100 MiB of closed segments; never prune the active segment or unresolved evidence.
- Query defaults: latest 24 hours, maximum 7 days, default 50 records, maximum 100 records, authenticated opaque cursor, no regex/full-text/raw-segment export.
- Keep the exact contract V1 28-tool surface, current Phase 1 output envelopes, protected `scripts/smoke.mjs`, and protected `scripts/http-smoke.mjs` unchanged.
- Do not stage, commit, push, publish, modify system policy, install services, migrate credentials, or begin Phase 3C/3D without later approval.

## File Structure

### New audit modules

- `src/audit/types.ts` — closed error codes, V2 event union, envelope/index/retention types, query types, diagnostics, execution facts, and runtime interfaces.
- `src/audit/schemas.ts` — strict Zod schemas and cross-field validation for all persisted and query structures.
- `src/audit/canonicalJson.ts` — project-owned deterministic JSON encoder and HMAC helpers.
- `src/audit/lock.ts` — installation-wide conservative writer lock reusing Phase 3 process-instance evidence.
- `src/audit/store.ts` — append, verification, tail recovery, rotation, retention, bounded query, and cursor authentication.
- `src/audit/runtime.ts` — authorization/execution event construction, mode resolution, safe classification, and durable persistence orchestration.
- `src/audit/transactionParticipant.ts` — adapter that commits the `audit` participant before transaction finalization and rolls back on append failure.
- `src/audit/queryTool.ts` — strict dormant V2 query handler shared by future direct and supertool registration.
- `src/audit/index.ts` — closed Phase 3B export surface.

### Existing modules modified

- `src/config.ts` — strict `AuditMode`, retention limits, and fail-closed audit configuration validation.
- `src/policy/types.ts`, `src/policy/schemas.ts`, `src/policy/resources.ts`, `src/policy/audit.ts`, `src/policy/runtime.ts`, `src/policy/integration.ts`, `src/policy/toolPolicy.ts` — add the V2 audit context/resource and wrap handler completion without changing V1 outputs.
- `src/transactions/engine.ts`, `src/transactions/types.ts`, `src/transactions/index.ts` — expose only the safe pending-commit facts required by the audit participant and recovery correlation.
- `src/server.ts` and transport construction modules only if required to inject one audit runtime; no contract V1 tool registration changes.
- `config.example.env`, `CHANGELOG.md`, `SECURITY.md`, `AGENTS.md`, `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `Memory.md`, and `docs/memory/archive/phase-3.md` — configuration, security boundary, evidence, and current-state reconciliation.

### New tests and fixtures

- `test/audit-config.test.mjs`
- `test/audit-schema.test.mjs`
- `test/audit-store.test.mjs`
- `test/audit-recovery-retention.test.mjs`
- `test/audit-runtime-integration.test.mjs`
- `test/audit-transaction-participant.test.mjs`
- `test/audit-query.test.mjs`
- `test/audit-architecture.test.mjs`
- `test/fixtures/audit-writer-child.mjs`

---

### Task 1: Published Baseline Reconciliation and Audit Configuration

**Files:**
- Modify: `src/config.ts`
- Modify: `config.example.env`
- Create: `test/audit-config.test.mjs`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: `CodexProConfig`, `PolicyEngineMode`, `FileTransactionMode`, `WriteMode`, and published Phase 3A HEAD `75b8d54`.
- Produces: `AuditMode = "auto" | "off" | "best_effort" | "required"`, `AuditRetentionConfig`, `CodexProConfig.auditMode`, `CodexProConfig.auditRetention`, `resolveAuditRequirement(config, riskClass, mutating)`, and `assertAuditConfiguration(config, capabilities)`.

- [x] **Step 1: Write failing configuration tests**

Create `test/audit-config.test.mjs` that restores environment variables after each case and asserts:

```js
assert.equal(loadConfig(["--bash", "off"]).auditMode, "auto");
assert.equal(withEnv("CODEXPRO_AUDIT_MODE", "required", () => loadConfig(["--bash", "off"]).auditMode), "required");
assert.throws(
  () => withEnv("CODEXPRO_AUDIT_MODE", "unsafe", () => loadConfig(["--bash", "off"])),
  /auto, off, best_effort, or required/
);
assert.deepEqual(loadConfig(["--bash", "off"]).auditRetention, {
  maxAgeDays: 30,
  maxClosedBytes: 100 * 1024 * 1024
});
```

Also assert `enforce` plus required R2 mutation rejects `off`, while legacy/shadow resolve `auto` to best-effort.

- [x] **Step 2: Build and run the focused test to confirm RED**

Run: `npm run build`

Expected: PASS before new imports are added.

Run: `node --test test/audit-config.test.mjs`

Expected: FAIL because audit configuration fields and helpers do not exist.

- [x] **Step 3: Add strict configuration parsing**

Add:

```ts
export type AuditMode = "auto" | "off" | "best_effort" | "required";

export interface AuditRetentionConfig {
  maxAgeDays: number;
  maxClosedBytes: number;
}
```

Parse `CODEXPRO_AUDIT_MODE`, `CODEXPRO_AUDIT_RETENTION_DAYS`, and `CODEXPRO_AUDIT_RETENTION_BYTES`. Clamp retention to 1–365 days and 1 MiB–2 GiB. Unknown audit mode values throw rather than falling back.

Add:

```ts
export function resolveAuditRequirement(
  config: Pick<CodexProConfig, "auditMode" | "policyEngineMode">,
  riskClass: RiskClass,
  mutating: boolean
): "disabled" | "best_effort" | "required";
```

Rules: explicit `required` is always required, explicit `best_effort` is best-effort, explicit `off` is disabled unless enforce requires durable R2+ mutation audit, and `auto` maps legacy/shadow to best-effort and enforce R2+ mutation to required.

- [x] **Step 4: Reconcile the actual Phase 3A publication baseline**

Update `AGENTS.md`, `Memory.md`, and the Phase 3 archive with a new append-only publication reconciliation entry stating that HEAD/origin `75b8d54` contains Phase 3A and the working tree was clean at Phase 3B start. Do not rewrite STEP-273; append a correction/publication entry.

- [x] **Step 5: Document configuration without overclaiming**

Add to `config.example.env`:

```dotenv
# Persistent local audit. auto is best-effort for legacy/shadow and required
# for enforce-mode R2+ mutations. Audit data remains outside workspaces.
CODEXPRO_AUDIT_MODE=auto
CODEXPRO_AUDIT_RETENTION_DAYS=30
CODEXPRO_AUDIT_RETENTION_BYTES=104857600
```

- [x] **Step 6: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-config.test.mjs test/transaction-config-and-path-policy.test.mjs test/policy-integration.test.mjs`

Expected: PASS with no contract V1 surface change.

---

### Task 2: Exact V2 Events, Persisted Schemas, and Canonical JSON

**Files:**
- Create: `src/audit/types.ts`
- Create: `src/audit/schemas.ts`
- Create: `src/audit/canonicalJson.ts`
- Create: `src/audit/index.ts`
- Create: `test/audit-schema.test.mjs`
- Modify: `src/policy/types.ts`
- Modify: `src/policy/schemas.ts`
- Modify: `src/policy/audit.ts`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: `AuditEventV1`, `PolicyDecisionV1`, `RequestContextV1`, `RiskClass`, `PolicyOutcome`, `PolicyReasonCode`, and `deriveTransactionSubkey()`.
- Produces: `AuditEventV2`, `AuthorizationAuditEventV2`, `ExecutionAuditEventV2`, `RecoveryAuditEventV2`, `AdministrativeAuditEventV2`, `AuditEnvelopeV1`, `AuditIndexV1`, `AuditRetentionStateV1`, strict schemas, `canonicalJson(value)`, `auditRecordMac(key, envelopeWithoutMac)`, and `workspaceAuditRef(...)`.

- [x] **Step 1: Write strict-schema and deterministic-encoding tests**

Use a valid authorization event and assert exact parse equality. Reject unknown fields, absolute paths, non-finite numbers, overlong strings, invalid timestamps, duplicate mutation kinds, event IDs outside the closed pattern, and credential-shaped additions.

Assert:

```js
assert.equal(
  canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
  '{"a":{"x":3,"y":2},"z":1}'
);
assert.throws(() => canonicalJson({ value: Number.NaN }), /finite/i);
assert.throws(() => canonicalJson({ value: undefined }), /unsupported/i);
```

Build two logically equal envelopes with different insertion order and assert identical HMAC values.

- [x] **Step 2: Confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-schema.test.mjs`

Expected: FAIL because `dist/audit/*` does not exist.

- [x] **Step 3: Define closed types and stable errors**

Define `AuditErrorCode` as:

```ts
export type AuditErrorCode =
  | "AUDIT_ACCESS_DENIED"
  | "AUDIT_RANGE_INVALID"
  | "AUDIT_CURSOR_INVALID"
  | "AUDIT_BUSY"
  | "AUDIT_UNAVAILABLE"
  | "AUDIT_INTEGRITY_FAILURE"
  | "AUDIT_RECORD_INVALID"
  | "INTERNAL_ERROR";
```

Define `AuditError` with bounded safe details only. Define all V2 event interfaces exactly from the approved design, with nullable request/authorization/decision/session/tool/workspace fields for recovery and administrative events. `workspaceRef` is opaque and never the state-directory name.

- [x] **Step 4: Implement strict Zod schemas**

Use `.strict()` throughout. Bound strings and arrays, require nonnegative integer byte counts, require unique mutation kinds, and require cross-field relations:

- authorization events have `authorizationEventId: null`;
- execution events have a non-null authorization event ID;
- `not_executed` has `operationCount: 0`, empty mutation kinds, and no change set;
- `recovery_required` sets `recoveryRequired: true`;
- envelope sequence is a positive safe integer and MAC fields are 64 lowercase hex characters.

- [x] **Step 5: Implement canonical JSON and key separation**

The encoder recursively sorts object keys, preserves array order, rejects prototypes other than plain object/null, rejects duplicate-key input by accepting only already-parsed JS objects, and rejects undefined, functions, symbols, bigint, non-finite numbers, and cycles.

Derive the record key using label `audit-record` and workspace reference key using label `audit-workspace-ref`. Zero temporary key buffers in `finally` blocks.

- [x] **Step 6: Keep V1 compatibility explicit**

Leave `AuditEventV1` and `auditEventV1Schema` unchanged. Extend `safePolicySummary()` for the later audit resource without changing existing summaries.

- [x] **Step 7: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-schema.test.mjs test/policy-schema.test.mjs test/policy-enforcement-audit.test.mjs`

Expected: PASS.

---

### Task 3: Conservative Audit Writer Lock and Append Store

**Files:**
- Create: `src/audit/lock.ts`
- Create: `src/audit/store.ts`
- Modify: `src/audit/index.ts`
- Create: `test/audit-store.test.mjs`
- Create: `test/fixtures/audit-writer-child.mjs`
- Modify: `src/transactions/workspaceLock.ts` only if a generic safe liveness helper must be exported
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: `ProcessInstanceRegistry`, `classifyProcessLiveness`, Phase 3 state directories, installation key, audit schemas, canonical JSON, and atomic state-file conventions.
- Produces: `AuditWriterLock`, `AuditWriterLockHandle`, `PersistentAuditStore.open(options)`, `append(event)`, `verify()`, `diagnostics()`, and monotonic sequence allocation.

- [x] **Step 1: Write append and concurrency tests**

Create a temporary `CODEXPRO_HOME`/state root. Append authorization and execution events, reopen the store, verify sequence 1/2, `previousMac` continuity, canonical line encoding, synced index metadata, and no event-body duplication in `index.json`.

Spawn two child processes, each appending 25 administrative events through the real lock. Assert exactly 50 unique contiguous sequences, no interleaved partial lines, and a valid chain.

- [x] **Step 2: Confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-store.test.mjs`

Expected: FAIL because the store and writer lock do not exist.

- [x] **Step 3: Implement the installation-wide lock**

Use `state/v1/locks/audit/writer.lock/owner.json`. Owner fields are strict: schema version, lock token, process instance ID, PID, and creation time. Acquire with exclusive directory creation. A live or unverifiable owner returns `AUDIT_BUSY`; only a proven dead owner may be renamed to a unique quarantine directory before retry. Release verifies token and instance identity before atomic rename/removal.

- [x] **Step 4: Implement exact append ordering**

Append sequence:

```text
acquire lock
→ verify active segment tail and index relation
→ assign sequence and previous MAC
→ append one canonical UTF-8 JSON line
→ fsync segment
→ atomically persist active/index metadata when required
→ release lock
```

Use `fs.openSync(..., "a")`, a single complete line buffer, `fs.writeSync`, and `fs.fsyncSync`. Do not use `appendFile` without an explicit descriptor/sync boundary.

- [x] **Step 5: Implement safe diagnostics**

Return only mode-independent store facts: `disabled|healthy|degraded|integrity_failed`, active segment ID, last sequence, last append time, retention settings, and bounded failure code. Do not return state paths, keys, event bodies, or quarantine bytes.

- [x] **Step 6: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-store.test.mjs test/transaction-workspace-lock.test.mjs test/transaction-installation-state.test.mjs`

Expected: PASS.

---

### Task 4: Tail Recovery, Rotation, Retention, and Integrity Failure

**Files:**
- Modify: `src/audit/store.ts`
- Modify: `src/audit/types.ts`
- Modify: `src/audit/schemas.ts`
- Create: `test/audit-recovery-retention.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Task 3 store/index/lock and Task 2 recovery/administrative events.
- Produces: recoverable final-line quarantine, cross-segment chain verification, date/size rotation, retention tombstone-before-delete, and `integrity_failed` state.

- [x] **Step 1: Write recovery, corruption, rotation, and retention tests**

Assert:

- an invalid final line after the last newline is copied under `audit/quarantine/`, truncated only when prior records verify and index does not claim it, then followed by `tail_quarantined`;
- a middle-record MAC change, sequence gap, conflicting index, or missing closed segment sets integrity failure and blocks required append;
- UTC date change rotates before the next ordinary event;
- a configured small test segment limit rotates before exceeding the limit while production default remains 10 MiB;
- retention appends `retention_prune` containing segment metadata before deleting whole oldest closed segments;
- active and unresolved segments are never deleted.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-recovery-retention.test.mjs`

Expected: FAIL because maintenance behavior is absent.

- [x] **Step 3: Implement recoverable tail handling**

Only truncate bytes after the last valid newline when every preceding envelope verifies and index metadata ends at the last valid record. Copy invalid bytes to a uniquely created quarantine file and sync it before truncation. Append the recovery event after truncation and before normal traffic resumes.

- [x] **Step 4: Implement fail-closed integrity state**

Any non-tail break throws `AUDIT_INTEGRITY_FAILURE`, persists only safe degraded metadata if possible, leaves original evidence unchanged, and prevents required mutation audit. No automatic chain reset or segment rewrite.

- [x] **Step 5: Implement rotation and retention**

Rotation appends `segment_rotation`, closes/syncs current metadata, creates the next segment exclusively, and carries `previousMac` across the boundary. Retention is synchronous and bounded; it selects only closed eligible segments, appends the tombstone event, then deletes oldest-first. Failed deletion remains in index diagnostics for retry.

- [x] **Step 6: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-recovery-retention.test.mjs test/audit-store.test.mjs`

Expected: PASS.

---

### Task 5: Bounded Query Engine and Authenticated Cursor

**Files:**
- Create: `src/audit/queryTool.ts`
- Modify: `src/audit/store.ts`
- Modify: `src/audit/types.ts`
- Modify: `src/audit/schemas.ts`
- Modify: `src/audit/index.ts`
- Create: `test/audit-query.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: verified envelopes, audit record key, strict event schemas, and future policy scope `audit:read`.
- Produces: `QueryAuditEventsInputV2`, `QueryAuditEventsResultV2`, `queryAuditEventsInputV2Schema`, `PersistentAuditStore.query(input)`, `createAuditQueryHandler(runtime)`, and authenticated cursor encode/decode.

- [x] **Step 1: Write bounds, filter, pagination, and cursor tests**

Assert latest-24-hour default, 7-day maximum range, 50/100 default/maximum limit, exact event/tool/request/change-set/workspace/status filters, reverse chronological result ordering with deterministic tie-break, and a next cursor that resumes without duplicate/skip.

Tampering with cursor payload or MAC returns `AUDIT_CURSOR_INVALID`. Unknown filter fields, regex-like fields, raw segment requests, oversized output, and range inversion return stable failures.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-query.test.mjs`

Expected: FAIL because the query engine does not exist.

- [x] **Step 3: Implement authenticated cursor**

Cursor payload contains only version, filter digest, last sequence, and expiry. Encode canonical JSON as base64url plus HMAC-SHA-256 using a dedicated `audit-cursor` subkey. Verify with timing-safe comparison and require the current filter digest to match.

- [x] **Step 4: Implement bounded query**

Read only indexed segments whose time range intersects the query. Verify every visited envelope before exposing its event. Stop when the byte/result budget is reached. Return safe event payloads, page metadata, integrity state, and optional cursor—never store paths, record keys, raw lines, or quarantine bytes.

- [x] **Step 5: Add query self-audit hook**

The handler computes a canonical filter digest and, after the query completes, appends an administrative query event containing only digest and result count. Query event bodies are not copied into the self-audit event.

- [x] **Step 6: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-query.test.mjs test/audit-schema.test.mjs test/audit-store.test.mjs`

Expected: PASS.

---

### Task 6: Policy Resource and Two-Event Runtime Integration

**Files:**
- Modify: `src/policy/types.ts`
- Modify: `src/policy/schemas.ts`
- Modify: `src/policy/resources.ts`
- Modify: `src/policy/audit.ts`
- Modify: `src/policy/runtime.ts`
- Modify: `src/policy/integration.ts`
- Modify: `src/policy/toolPolicy.ts`
- Create: `src/audit/runtime.ts`
- Modify: `src/audit/index.ts`
- Create: `test/audit-runtime-integration.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: current Policy Kernel registered-tool wrapper, policy decision/resource description, request context, audit store, and audit mode resolution.
- Produces: `AuditResourceV1`, `PolicyAuthorizationResultV2 { decision, auditContext }`, `AuditRuntimeV2.persistAuthorization()`, `persistExecution()`, real duration/result classification, and one terminal event per authorization.

- [x] **Step 1: Write wrapper-order and terminal-classification tests**

Use a fake registered tool and recording runtime. Assert:

```text
authorize
→ persist authorization
→ handler starts
→ handler completes or throws
→ persist execution
→ return original result/failure
```

Assert denied/approval/unavailable decisions emit authorization plus `not_executed`, never call the handler in enforce mode, and audit failure never changes deny to allow. Assert handler success, returned `isError`, and thrown exception map to stable statuses/result codes with nonnegative real duration.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-runtime-integration.test.mjs`

Expected: FAIL because the policy wrapper still emits speculative V1 events before execution.

- [x] **Step 3: Add `AuditResourceV1`**

Extend `ResourceDescriptorV1` with kind `audit`, operation `query`, nullable workspace ID, filter digest, and resource fingerprint. Add strict schema, safe summary `audit:query:<digest-prefix>`, and resource description support used only by the dormant V2 query handler.

- [x] **Step 4: Replace speculative V2 behavior with audit context**

Keep the V1 compatibility creator available, but make the default runtime return decision plus a bounded audit authorization context. The context includes safe summaries and opaque references only. The wrapper owns `startedAt`, handler result classification, duration, and terminal event construction.

- [x] **Step 5: Implement mode-specific failure behavior**

- required authorization append failure: do not execute; return `AUDIT_UNAVAILABLE` through the existing policy-failure boundary;
- best-effort append failure: record degraded diagnostics and continue only when policy decision itself permits;
- required completion append failure for non-transactional operations: return `AUDIT_UNAVAILABLE` after the already-completed read/non-mutating action, without claiming audited success;
- deny/approval/enforcement-unavailable remain denied regardless of audit state.

- [x] **Step 6: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-runtime-integration.test.mjs test/policy-integration.test.mjs test/policy-enforcement-audit.test.mjs test/policy-resources.test.mjs`

Expected: PASS.

---

### Task 7: Execution Facts and Transaction Audit Participant

**Files:**
- Create: `src/audit/transactionParticipant.ts`
- Modify: `src/audit/types.ts`
- Modify: `src/audit/runtime.ts`
- Modify: `src/audit/index.ts`
- Modify: `src/transactions/types.ts`
- Modify: `src/transactions/engine.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/audit-transaction-participant.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: `PendingTransactionCommit.commitParticipant(name, action)`, `finalize()`, `rollback()`, and V2 execution append.
- Produces: non-enumerable `EXECUTION_AUDIT_FACTS` symbol helpers, `ExecutionAuditFacts`, safe pending-commit operation facts, and `commitTransactionWithAudit(input)`.

- [x] **Step 1: Write participant-order, rollback, and recovery tests**

Assert a transaction with required participant `audit` installs visible files, then:

- persists execution event;
- marks participant committed;
- finalizes and cleans up;
- returns success only after all three steps.

Inject execution append failure and assert rollback restores exact before-state. Inject rollback failure and assert `TRANSACTION_RECOVERY_REQUIRED` plus retained evidence. Simulate an already persisted execution event and assert retry/recovery recognizes the event ID/change-set pair idempotently.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-transaction-participant.test.mjs`

Expected: FAIL because no audit participant adapter exists.

- [x] **Step 3: Add non-enumerable execution facts**

Define:

```ts
export interface ExecutionAuditFacts {
  resultCode: string | null;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  operationCount: number;
  mutationKinds: Array<"create" | "replace" | "append" | "move" | "delete">;
  pendingMutationCommit: PendingTransactionCommit | null;
}
```

Attach/extract with a module-private symbol via `Object.defineProperty(..., enumerable: false)`. Tests must prove neither MCP content nor `structuredContent` serialization includes the facts.

- [x] **Step 4: Expose safe pending transaction facts**

Add readonly operation count and mutation-kind accessors to `PendingTransactionCommit`; do not expose workspace root, logical paths, stage paths, backup paths, file bodies, or manifest location.

- [x] **Step 5: Implement the audit participant adapter**

Call:

```ts
await pending.commitParticipant("audit", async () => {
  await runtime.persistExecution(executionInput);
});
return pending.finalize();
```

On append failure call `pending.rollback("audit_completion_failed")`; translate proven rollback to `AUDIT_UNAVAILABLE`, and translate unproven rollback to `TRANSACTION_RECOVERY_REQUIRED`. Best-effort mode must not be used as the required participant for an enforce R2+ mutation.

- [x] **Step 6: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-transaction-participant.test.mjs test/transaction-engine.test.mjs test/transaction-recovery.test.mjs test/transaction-crash-recovery.test.mjs`

Expected: PASS.

---

### Task 8: Dormant Contract V2 Query Handler and Direct/Supertool Parity

**Files:**
- Modify: `src/audit/queryTool.ts`
- Modify: `src/policy/toolPolicy.ts`
- Modify: `src/policy/resources.ts`
- Modify: `src/tools/schemas/codexpro.ts` only to export a future V2 query schema/helper without changing V1 canonical arrays
- Modify: `src/codexproSupertool.ts` only if a non-registered V2 child adapter can be shared safely
- Modify: `test/audit-query.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Task 5 query handler and Task 6 audit policy resource.
- Produces: one shared `queryAuditEventsV2()` handler callable by future direct registration and future supertool dispatch, with exact input/output schemas and policy definition.

- [x] **Step 1: Add parity tests without changing production V1 registration**

Instantiate the direct adapter and supertool child adapter explicitly in the test harness. Feed the same authorized query and assert deep-equal results and stable failures. Assert the real default server still registers exactly the existing 28 canonical child tools and no `query_audit_events` entry.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-query.test.mjs test/codexpro-contract.test.mjs`

Expected: FAIL only for missing V2 adapters; V1 contract test remains green.

- [x] **Step 3: Add the dormant V2 schema and policy definition**

Export the strict input/output schemas under V2-specific names. Keep `CANONICAL_CODEXPRO_CHILD_TOOLS` and all V1 enums/unions unchanged. Add a separately exported future policy definition for `query_audit_events` with R1, `audit:read`, and `audit_read`.

- [x] **Step 4: Share one implementation**

Both adapters call the same `queryAuditEventsV2()` function and receive the same runtime. Do not duplicate filtering, cursor, authorization, or output shaping.

- [x] **Step 5: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-query.test.mjs test/codexpro-contract.test.mjs test/codexpro-inventory-contract.test.mjs test/policy-integration.test.mjs`

Expected: PASS with exact V1 surface unchanged.

---

### Task 9: Diagnostics, Self-Test Probes, Documentation, and Static Architecture Gate

**Files:**
- Modify: `src/audit/runtime.ts`
- Modify: `src/selfTestOps.ts`
- Modify: `src/server.ts` or configuration diagnostics module only as needed for bounded audit diagnostics
- Create: `test/audit-architecture.test.mjs`
- Modify: `test/codexpro-self-test-contract.test.mjs`
- Modify: `config.example.env`
- Modify: `CHANGELOG.md`
- Modify: `SECURITY.md`
- Modify: `AGENTS.md`
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: store/runtime diagnostics and existing self-test fixed-check conventions.
- Produces: bounded audit diagnostics and fixed probes for state directory, installation key, non-mutating lock acquisition, tail verification, and retention validity.

- [x] **Step 1: Write failing diagnostics and architecture tests**

Assert diagnostics never include `stateRoot`, `masterKey`, `recordKey`, canonical roots, event bodies, or quarantine bytes. Assert self-test adds fixed audit checks with deterministic IDs and does not mutate active audit evidence.

Static scans must prove:

- `src/audit/**` imports no Git, network, shell, child-process, or third-party persistence package;
- persisted schemas expose no `path`, `root`, `content`, `body`, `diff`, `authorization`, `cookie`, `token`, `privateKey`, or command-output fields;
- protected Smoke source hashes and exact V1 28-tool set remain unchanged;
- no background timer/worker performs retention.

- [x] **Step 2: Confirm RED**

Run: `node --test test/audit-architecture.test.mjs test/codexpro-self-test-contract.test.mjs`

Expected: FAIL for missing audit probes/architecture module.

- [x] **Step 3: Add bounded diagnostics and probes**

Use only safe state enum, active segment ID, last sequence, last append timestamp, retention policy, and bounded failure code. Lock probe acquires/releases an isolated probe lock name or uses a dry-run path; it must never alter the live writer lock or active segment.

- [x] **Step 4: Reconcile user and maintainer documentation**

Document local persistence, HMAC limitations, query bounds, audit modes, fail-closed mutation behavior, and the fact that contract V2 exposure still waits for Phase 3C. State explicitly that no raw file content/diff/command output is logged and audit is not legal WORM storage.

- [x] **Step 5: Build and confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/audit-architecture.test.mjs test/codexpro-self-test-contract.test.mjs test/server-config-contract.test.mjs test/package-contents.test.mjs`

Expected: PASS.

---

### Task 10: Full Phase 3B Local Acceptance and Reconciliation

**Files:**
- Modify only if verification exposes a Phase 3B defect: files already in this plan
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Tasks 1–9.
- Produces: locally accepted Phase 3B evidence, exact known limitations, rollback boundary, and a stop before Git staging.

- [x] **Step 1: Run the focused Phase 3B suite**

Run:

```text
node --test test/audit-config.test.mjs test/audit-schema.test.mjs test/audit-store.test.mjs test/audit-recovery-retention.test.mjs test/audit-runtime-integration.test.mjs test/audit-transaction-participant.test.mjs test/audit-query.test.mjs test/audit-architecture.test.mjs
```

Expected: all pass, zero failures.

- [x] **Step 2: Run adjacent security, policy, transaction, lifecycle, and contract regression**

Run the relevant policy, HTTP security, transaction, workspace lifecycle, self-test, supertool, inventory, and exact-contract tests.

Expected: all pass except established platform-conditional skips.

- [x] **Step 3: Run complete project verification**

Run:

```text
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
npm pack --dry-run
```

Expected: zero failures; only established capability skips are allowed and must be identified exactly.

- [x] **Step 4: Run static and scope gates**

Verify protected Smoke hashes, exact V1 28-tool set, no secret-looking persisted fields, no audit dependency on Git/network/shell/process execution, no staged files, no whitespace/conflict markers, and only intended Phase 3B files changed.

- [x] **Step 5: Reconcile project memory**

Append the final Phase 3B acceptance entry with exact commands/results, decisions, limitations, rollback, and next step. Update `Memory.md`, `AGENTS.md`, and the master plan so they state Phase 3A is published, Phase 3B is locally implemented/verified, contract V2 remains dormant until Phase 3C, and all Phase 3B changes remain unstaged/unpublished.

- [x] **Step 6: Stop before Git staging**

Use `show_changes` once with the complete diff. Do not stage, commit, push, publish, alter credentials, change system policy, install services, or begin Phase 3C.

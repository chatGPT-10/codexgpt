# Phase 3B Persistent Audit Design

Date: 2026-07-14
Status: approved design; implementation not started
Primary platform: native Windows

## 1. Purpose and phase boundary

Phase 2A defined a safe `AuditEventV1` fact shape, but the current runtime creates it before the tool handler runs and sends it only to an optional in-memory sink. As a result, `durationMs`, `resultCode`, `exitCode`, and byte counts do not describe the completed operation, and there is no durable store, integrity chain, rotation, retention, or controlled query surface.

Phase 3B introduces:

- a two-event authorization/execution lifecycle;
- an append-only persistent local audit store;
- durable participation in Phase 3 transactions;
- bounded rotation and retention;
- integrity evidence without claiming tamper-proof storage;
- one administrator-scoped query tool in contract V2.

Phase 3B does not store file contents, diffs, raw command output, credentials, or absolute sensitive paths.

## 2. Audit invariants

1. Policy authorization and execution completion are separate immutable events linked by safe opaque identifiers.
2. Every authorized tool invocation receives one terminal execution event, including `not_executed` for policy denial, approval requirements, or enforcement unavailability.
3. A required mutating operation does not execute unless its authorization event is durably appended first.
4. A mutating transaction is not finalized as successful until its terminal execution event is durably appended.
5. If the required completion append fails after visible file installation, the transaction rolls back while its rollback artifacts are still available.
6. Audit failure never causes a denied operation to become allowed.
7. Store corruption, uncertain lock ownership, or an unverifiable integrity break fails closed for required mutations.
8. Retention removes only closed segments according to explicit policy and appends a retention record before deletion.
9. Audit queries are themselves audited and cannot request unbounded content.
10. The integrity chain detects many accidental or unauthorized changes, but it is not described as protection against an attacker with the same OS account and access to the installation key.

## 3. Event model

### 3.1 Versioning

`AuditEventV1` remains available as the Phase 2A compatibility type. Phase 3B introduces `AuditEventV2` as a discriminated union. V1 events are not silently reinterpreted or rewritten.

```ts
type AuditEventV2 =
  | AuthorizationAuditEventV2
  | ExecutionAuditEventV2
  | RecoveryAuditEventV2
  | AdministrativeAuditEventV2;
```

Every event contains:

```ts
interface AuditEventCommonV2 {
  schemaVersion: 2;
  eventId: string;
  eventType:
    | "authorization"
    | "execution"
    | "recovery"
    | "administrative";
  timestamp: string;
  requestId: string | null;
  authorizationEventId: string | null;
  decisionId: string | null;
  credentialRef: string | null;
  transportSessionId: string | null;
  toolName: string | null;
  canonicalAction: string;
  workspaceId: string | null;
  workspaceRef: string | null;
  policyRevision: string | null;
}
```

`workspaceRef` is a safe opaque HMAC-derived persistent reference. It is not the application-state directory name itself and does not reveal the canonical root.

### 3.2 Authorization event

```ts
interface AuthorizationAuditEventV2 extends AuditEventCommonV2 {
  eventType: "authorization";
  resourceSummary: string;
  resourceFingerprint: string;
  outcome: PolicyOutcome;
  reasonCode: PolicyReasonCode | null;
  safeRuleIds: string[];
  approvalState: "not_required" | "required" | "granted" | "denied";
  grantId: string | null;
  sandboxBackend: string;
  riskClass: RiskClass;
}
```

The authorization event is created after policy evaluation and before handler execution. It contains no speculative duration or result facts.

### 3.3 Execution event

```ts
interface ExecutionAuditEventV2 extends AuditEventCommonV2 {
  eventType: "execution";
  status:
    | "not_executed"
    | "succeeded"
    | "failed"
    | "rolled_back"
    | "recovery_required";
  resultCode: string | null;
  durationMs: number;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  operationCount: number;
  mutationKinds: Array<"create" | "replace" | "append" | "move" | "delete">;
  recoveryRequired: boolean;
}
```

`changeSetId` is an opaque correlation identifier. The event does not contain old or new file bodies, a patch, a complete diff, or the rollback vault location.

### 3.4 Recovery event

Recovery events record only safe facts:

- transaction/change-set correlation;
- recovery action such as `rollback_completed`, `cleanup_completed`, `workspace_frozen`, or `tail_quarantined`;
- operation count;
- stable result code;
- no file bodies or absolute paths.

### 3.5 Administrative event

Administrative events cover:

- audit query;
- segment rotation;
- retention pruning;
- integrity verification;
- explicit repair or quarantine actions.

Administrative query events store the filter digest and result count, not the returned event bodies.

## 4. Storage envelope and canonical encoding

Audit event payloads are wrapped in a store envelope:

```ts
interface AuditEnvelopeV1 {
  storeVersion: 1;
  sequence: number;
  segmentId: string;
  previousMac: string;
  event: AuditEventV2;
  recordMac: string;
}
```

Rules:

- Event payloads are serialized with one project-owned canonical JSON encoder that sorts object keys and rejects unsupported values.
- `recordMac` is HMAC-SHA-256 over the canonical envelope fields excluding `recordMac`.
- The key is derived from the Phase 3 installation master key with a dedicated HKDF label.
- `previousMac` links the record to the preceding valid envelope, including across segment boundaries.
- Sequence numbers are monotonically increasing within one installation audit stream.
- Validation rejects duplicate keys, non-finite numbers, overlong strings, unknown schema fields, and events exceeding the configured record limit.

The HMAC chain is integrity evidence, not a substitute for OS account security or external immutable logging.

## 5. Store layout and writer lock

```text
state/v1/audit/
├── index.json
├── active.json
├── segments/
│   ├── audit-<UTC-date>-<sequence>.jsonl
│   └── ...
├── quarantine/
└── retention.json
```

`index.json` contains only segment metadata, counts, first/last sequence, first/last timestamp, first/last MAC, byte size, and state. It does not duplicate event bodies.

All appends use one installation-wide audit writer lock under `state/v1/locks/audit/`. Lock ownership uses the same conservative process-instance protocol as Phase 3A. An uncertain owner returns `AUDIT_BUSY` or `AUDIT_UNAVAILABLE`; it is not forcibly removed.

Append sequence:

1. acquire audit lock;
2. verify the active segment tail and index relation;
3. assign sequence and previous MAC;
4. append one complete UTF-8 JSON line;
5. sync the active segment file;
6. atomically update and sync active/index metadata when required;
7. release lock.

## 6. Tail recovery and corruption handling

### 6.1 Recoverable partial tail

A process can terminate during the final line append. If and only if:

- the invalid bytes occur after the last newline;
- all preceding envelopes and MACs verify;
- the index does not claim the partial sequence as committed;

then the invalid tail is copied to a quarantine file, the active segment is truncated to the last valid newline, and a `tail_quarantined` recovery event is appended before normal writes resume.

The bytes are not silently discarded.

### 6.2 Non-tail integrity failure

A MAC mismatch, sequence discontinuity, invalid middle record, conflicting index, or unexpected segment replacement marks the store `integrity_failed`.

- Required mutations fail with `AUDIT_INTEGRITY_FAILURE`.
- Read-only tools may continue according to policy but diagnostics report the degraded state.
- No automatic rewrite or deletion of the affected segment occurs.
- Starting a new chain requires an explicit later administrator repair design; Phase 3B does not silently reset the chain.

## 7. Authorization and handler integration

### 7.1 Runtime API

The policy runtime changes from returning a speculative event to returning an audit context:

```ts
interface PolicyAuthorizationResultV2 {
  decision: PolicyDecisionV1;
  auditContext: AuditAuthorizationContextV2;
}

interface AuditRuntimeV2 {
  persistAuthorization(context: AuditAuthorizationContextV2): Promise<AuthorizationAuditEventV2>;
  persistExecution(input: ExecutionAuditInputV2): Promise<ExecutionAuditEventV2>;
}
```

The registered-tool wrapper owns the wall-clock duration and terminal result classification.

### 7.2 Internal execution facts

Handlers may attach bounded internal facts to a result through a non-enumerable symbol:

```ts
interface ExecutionAuditFacts {
  resultCode: string | null;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  operationCount: number;
  mutationKinds: ExecutionAuditEventV2["mutationKinds"];
  pendingMutationCommit: PendingMutationCommit | null;
}
```

The symbol is not serialized into MCP content or structured output. No hidden input argument or production test mode is added.

### 7.3 Required mutating transaction sequence

For an R2 or higher workspace mutation when audit is required:

```text
policy decision
→ durable authorization event
→ handler prepares and installs transaction
→ handler returns a pending mutation commit
→ durable execution event
→ mark audit participant committed
→ finalize transaction and cleanup
→ return success
```

If durable execution append fails:

```text
append failure
→ pending transaction rollback
→ best-effort recovery event
→ return AUDIT_UNAVAILABLE
```

If rollback cannot be proven, the workspace remains frozen and the public result is `TRANSACTION_RECOVERY_REQUIRED`.

A completion record that was persisted before a process crash is idempotently recognized by event ID and transaction participant facts during recovery.

## 8. Audit modes

`CODEXPRO_AUDIT_MODE` accepts:

- `auto`;
- `off`;
- `best_effort`;
- `required`.

`auto` resolves to:

- Policy Engine `legacy`: `best_effort`;
- Policy Engine `shadow`: `best_effort`;
- Policy Engine `enforce`: required for R2+ mutations and best-effort for non-mutating calls.

Configuration rules:

- Policy Engine `enforce` requires durable audit for every R2+ mutation, regardless of tool contract version;
- Policy Engine `legacy` or `shadow` may use `best_effort`, including during contract V2 compatibility rollout, but diagnostics must identify that mutation audit is not a commit requirement;
- `off` is invalid whenever active policy requires durable mutation audit and fails configuration validation;
- no mode silently reports that persistence is active when the store cannot be opened or verified.

## 9. Rotation and retention

### 9.1 Rotation

The active segment rotates when either condition is met:

- UTC date changes;
- the next record would exceed 10 MiB.

Rotation appends an administrative `segment_rotation` event, syncs and closes the current segment, atomically updates the index, creates the next segment exclusively, and continues the MAC chain.

### 9.2 Retention

Defaults:

- retain 30 days;
- retain at most 100 MiB of closed segments;
- never prune the active segment;
- never prune a segment needed for an unresolved transaction or integrity investigation.

Retention operates synchronously during startup and bounded append maintenance; it is not an uncontrolled background worker.

Before deleting eligible closed segments, the store appends a `retention_prune` event containing:

- segment IDs;
- sequence and time ranges;
- record counts;
- first/last MACs;
- policy reason.

Deletion is oldest-first and whole-segment only. A failed deletion remains visible in diagnostics and is retried later.

## 10. Query tool

Contract V2 adds `query_audit_events`, available only in the full tool surface and hidden from connection-test mode.

Required scope and policy:

- scope: `audit:read`;
- risk: R1;
- resource mode: `audit_read`;
- query itself must be audited.

Input:

```ts
interface QueryAuditEventsInputV2 {
  from?: string;
  to?: string;
  event_types?: Array<"authorization" | "execution" | "recovery" | "administrative">;
  tool_name?: string;
  request_id?: string;
  change_set_id?: string;
  workspace_id?: string;
  status?: ExecutionAuditEventV2["status"];
  cursor?: string;
  limit?: number;
}
```

Bounds:

- default range: latest 24 hours;
- maximum range: 7 days per query;
- default limit: 50;
- maximum limit: 100;
- opaque authenticated cursor;
- no arbitrary regular expression or full-text search;
- no raw segment download;
- output remains below normal MCP output limits.

The output contains validated safe event payloads, page metadata, integrity status, and an opaque next cursor. It never includes the installation key, record key, state path, canonical workspace root, raw credentials, or quarantined bytes.

Stable failures include:

- `AUDIT_ACCESS_DENIED`;
- `AUDIT_RANGE_INVALID`;
- `AUDIT_CURSOR_INVALID`;
- `AUDIT_UNAVAILABLE`;
- `AUDIT_INTEGRITY_FAILURE`;
- `INTERNAL_ERROR`.

## 11. Policy resource extension

Phase 3B adds an `AuditResourceV1` descriptor:

```ts
interface AuditResourceV1 {
  schemaVersion: 1;
  kind: "audit";
  operation: "query";
  workspaceId: string | null;
  filterDigest: string;
  resourceFingerprint: string;
}
```

The Permission Profile schema does not gain raw audit paths. Authorization is determined through identity scope, hard policy, tool surface, and risk policy.

## 12. Diagnostics and self-test

Server diagnostics expose only:

- audit mode;
- store state: `disabled`, `healthy`, `degraded`, or `integrity_failed`;
- active segment ID;
- last committed sequence;
- last successful append time;
- retention policy;
- bounded failure code.

`codexpro_self_test` gains fixed checks for:

- state directory availability;
- installation key availability;
- audit lock acquisition probe without altering active evidence;
- active tail verification;
- retention configuration validity.

No diagnostic returns complete event bodies or filesystem paths to the audit store.

## 13. Required tests

Phase 3B implementation must include:

- exact V2 authorization, execution, recovery, and administrative schemas;
- canonical JSON determinism and unknown-field rejection;
- HMAC chain continuity within and across segments;
- two concurrent writer processes without interleaved or duplicated sequence numbers;
- required authorization append before handler execution;
- real completion duration and result classification after handler execution;
- pending transaction finalization only after completion append;
- completion append failure causing transaction rollback;
- rollback failure causing workspace freeze;
- idempotent recovery when completion was already persisted;
- safe redaction against Authorization, Cookie, credential URL, `.env`, private key, file body, diff, command output, and absolute-path fixtures;
- partial final-line quarantine and recovery event;
- non-tail corruption fail-closed behavior;
- date and size rotation;
- retention tombstone before whole-segment deletion;
- query scope, range, pagination, cursor authentication, output bounds, and self-audit;
- legacy/best-effort and enforce/required mode matrix;
- direct/supertool parity for the V2 query tool;
- full regression, Build, Smoke, native-Windows Stress, package dry-run, static scope, and secret-shape gates.

## 14. Compatibility and rollback

- `AuditEventV1` and its validator remain available for one migration cycle.
- Contract V1 does not expose `query_audit_events`.
- Existing policy output envelopes remain unchanged.
- Rolling back Phase 3B may disable the V2 store and query tool, but it must not delete durable audit segments or rewrite history.
- Corrections are represented as appended events.
- A rollback must not convert required audit failure into silent mutation permission.

## 15. Non-goals

Phase 3B does not implement remote log shipping, SIEM integration, Windows Event Log, cloud storage, external notarization, legal WORM retention, raw event export, OAuth administrator identity, user-facing repair of corrupted chains, or full-text indexing.

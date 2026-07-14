# Phase 3C Mutator Migration and Undo Design

Date: 2026-07-14
Status: approved design; implementation not started
Primary platform: native Windows

## 1. Purpose and phase boundary

Phase 3C moves every supported workspace mutation onto the Phase 3A transaction kernel, binds successful mutation finalization to Phase 3B persistent audit, introduces an exact contract V2, and adds bounded change-set undo.

The reference public migrations are `write` and `edit`, but Phase 3 cannot close while adjacent workspace writers still bypass the transaction boundary. This slice therefore also migrates:

- `apply_patch`;
- `export_pro_context`;
- `handoff_to_agent`;
- `handoff_to_codex`;
- `.ai-bridge` scaffold creation;
- handoff log updates;
- `codexpro_self_test` write/edit probe;
- `scripts/pro-apply.mjs`;
- any other repository-supported workspace writer found by the final static mutation inventory.

Application-state writers such as profiles, identity keys, transaction journals, change-set metadata, and audit segments use their own atomic application-state writer and are not treated as workspace mutations.

## 2. Migration invariants

1. In atomic mode, no supported workspace writer may call direct `writeFile`, `appendFile`, replacing `rename`, or destructive unlink outside the transaction kernel.
2. Every visible successful mutation has a `changeSetId` internally, even when contract V1 hides it.
3. Contract V1 remains exact and unchanged for one migration cycle.
4. Contract V2 is a coherent server-start snapshot; direct tools and the `codexpro` supertool use the same active version.
5. Contract V2 cannot start unless file transactions are `atomic` and the audit configuration satisfies its policy mode.
6. Undo is a new guarded transaction, never a blind restoration or history rewrite.
7. Undo cannot overwrite modifications made after the original change set.
8. Change-set rollback data is local, bounded, authenticated, encrypted at rest, and never stored in audit events or project files.
9. A change set whose rollback material cannot be retained may commit with `undo_supported: false`; transaction rollback on immediate failure remains mandatory.
10. Git is not required for commit, rollback, or undo. Git only observes the resulting working-tree changes.

## 3. Tool contract versioning

### 3.1 Configuration

`CODEXPRO_TOOL_CONTRACT_VERSION` accepts:

- `1` — the exact Phase 1 tool contracts and 28-tool canonical set;
- `2` — transaction-aware mutator contracts plus Phase 3 tools.

The initial default remains `1`. Contract selection occurs once at server construction and is immutable for that server lifecycle.

Configuration validation requires:

```text
contract 2
→ CODEXPRO_FILE_TRANSACTIONS=atomic
→ persistent audit configuration valid for the selected policy mode
→ Phase 3 state root available
```

A SessionGrant continues to bind the exact active tool contract version. No grant issued for contract V1 authorizes a contract V2 input or resource fingerprint.

### 3.2 Canonical tool sets

The schemas expose explicit versioned sets:

```ts
CANONICAL_CODEXPRO_CHILD_TOOLS_V1
CANONICAL_CODEXPRO_CHILD_TOOLS_V2
```

V2 contains the V1 tools plus:

- `query_audit_events` from Phase 3B;
- `undo_change_set` from Phase 3C;
- `move_paths` from Phase 3D.

The active direct registration map, supertool action enum, output union, policy definitions, inventory, self-test, Tool Cards, and Smoke expectations derive from one selected set. No component maintains a second hand-written count.

## 4. Standard transaction result

Every contract V2 mutator success embeds:

```ts
interface TransactionResultV2 {
  change_set_id: string;
  transaction_id: string;
  before_state: "absent" | "present" | "mixed";
  operation_count: number;
  undo_supported: boolean;
  committed_at: string;
}
```

`transaction_id` is useful for support and recovery correlation but does not expose a state path. Tool-specific data remains outside this object.

The standardized object is parsed by one shared strict Zod schema. Contract V1 outputs contain no extra field.

## 5. `write` contract V2

### 5.1 Input

Contract V2 retains all existing arguments and adds:

```ts
expected_sha256?: string
```

Semantics:

- If `expected_sha256` is present, the target must exist and its exact bytes must match.
- If the target is absent, an expected hash produces `FILE_VERSION_CONFLICT`.
- `overwrite: false` remains the absence precondition for safe creation.
- Even without a caller hash, the transaction kernel captures and revalidates its internally observed before hash immediately before installation.
- The content is encoded as exact UTF-8 bytes. `write` does not infer or silently add a BOM or convert newline style.

### 5.2 Success data

Existing V1 fields remain, followed by:

```ts
transaction: TransactionResultV2
before_sha256: string | null
```

`sha256` remains the after hash.

### 5.3 Stable V2 failures

V2 retains existing failures and adds:

- `FILE_VERSION_CONFLICT`;
- `TRANSACTION_BUSY`;
- `ATOMIC_BACKEND_UNAVAILABLE`;
- `AUDIT_UNAVAILABLE`;
- `AUDIT_INTEGRITY_FAILURE`;
- `TRANSACTION_FAILED`;
- `ROLLBACK_FAILED`;
- `TRANSACTION_RECOVERY_REQUIRED`.

Conflict details contain the relative path but not the actual current hash. The caller must reread the file before retrying.

## 6. `edit` contract V2

### 6.1 Input

Contract V2 retains exact snippet replacement semantics and adds:

```ts
expected_sha256?: string
```

Processing order:

1. read and validate exact UTF-8 bytes;
2. calculate the before hash;
3. validate caller expected hash;
4. perform old-text occurrence and replacement-count checks;
5. preserve untouched BOM and newline bytes through the existing string transformation;
6. create exact after bytes;
7. transactionally replace the file with final hash revalidation.

`edit` does not claim support for arbitrary non-UTF-8 encodings.

### 6.2 Success data and failures

Existing V1 data remains and adds:

```ts
transaction: TransactionResultV2
before_sha256: string
```

It uses the same transaction/audit failure family as `write` in addition to its existing edit-specific failures.

## 7. Other mutator migrations

### 7.1 `apply_patch`

- All files in one patch are fully parsed and prevalidated before mutation.
- Every existing file receives an observed before hash; contract V2 may accept an optional bounded `expected_files` map for stronger caller concurrency control.
- All creates, replacements, and supported deletes enter one transaction and one change set.
- A failure in any hunk or target produces zero final changes or a verified rollback.
- Contract V2 adds the shared transaction result and per-file before/after hashes without embedding file bodies beyond the existing bounded diff contract.

### 7.2 Handoff and Pro-context writers

- Scaffold creation is one multi-file create transaction.
- Plan, status, diff, state, and log changes for one handoff operation form one transaction.
- Append-like JSONL updates are implemented as prepared complete-file replacements under existing size limits; direct `appendFile` is removed from atomic mode.
- `export_pro_context` uses one atomic replacement and can be undoable when rollback retention limits permit.
- A failed handoff never leaves a new plan without its required companion state/log updates.

### 7.3 Internal scripts and probes

- `scripts/pro-apply.mjs` calls the same transaction service used by the server.
- `codexpro_self_test` limits its transaction to `.ai-bridge/codexpro-self-test.md` and marks the resulting change set non-retained unless the caller's public tool contract requires otherwise.
- Internal probes do not bypass PathPolicy, audit mode, or reserved-artifact rules.

### 7.4 Static closure gate

A final static scan must classify every remaining `writeFile`, `appendFile`, `rename`, `unlink`, `rm`, and equivalent write primitive.

Allowed direct uses are limited to:

- the transaction filesystem backend;
- the atomic application-state writer;
- audit segment append implementation;
- explicitly documented installer/runtime files outside authorized workspaces.

Any other workspace mutation is a Phase 3 blocker.

## 8. Change-set store

### 8.1 Layout

```text
state/v1/changesets/<workspaceStateKey>/<changeSetId>/
├── manifest.json
└── blobs/
    └── <blobId>.bin
```

The manifest contains:

- schema version;
- change-set and transaction IDs;
- creation and expiry timestamps;
- tool name and request correlation;
- safe identity owner binding hash;
- policy and contract revisions;
- relative operation paths;
- operation kinds;
- before/after existence, SHA-256, byte counts, and restorable metadata;
- encrypted blob references;
- state: `active`, `undone`, `undo_expired`, or `recovery_required`;
- `undoSupported` and reason code.

It never contains plaintext file bodies, complete diffs, credentials, or canonical workspace roots.

### 8.2 Rollback blob encryption

Rollback file bytes are encrypted with AES-256-GCM using a key derived from the installation master key with a dedicated HKDF label.

- Every blob uses an independent random nonce.
- Authenticated additional data binds schema version, change-set ID, blob ID, operation ID, and before SHA-256.
- Ciphertext and authentication tag are stored together in a strict binary envelope.
- Plaintext is never written to the application-state directory.
- Temporary plaintext staging remains only in the validated target volume and follows Phase 3A cleanup/recovery rules.

This protects against casual disclosure and unintended indexing or backup inspection. It is not claimed to resist an attacker who controls the same OS account and can read both the key and ciphertext.

### 8.3 Default limits

- maximum retained plaintext before-state per change set: 8 MiB;
- maximum retained rollback ciphertext across the installation: 128 MiB;
- maximum active undoable change sets per workspace: 20;
- default undo retention: 24 hours;
- expired small tombstone metadata retention: 30 days.

Limits are configuration-validated and bounded. Exceeding a retention limit does not weaken immediate rollback. The successful result sets `undo_supported: false` with a safe internal reason.

### 8.4 Undo support by operation

- create: supported without a content blob by deleting the exact unchanged created file;
- replace/edit: supported when the authenticated before blob is retained;
- delete used by patch/undo internals: supported when the before blob is retained;
- move: supported through reverse mappings without content blobs;
- append represented as replacement: supported when the before blob is retained;
- operations involving unsupported metadata or over-limit content may be non-undoable.

## 9. Owner binding

A change set stores an HMAC owner binding derived from safe identity fields:

1. OAuth subject when available;
2. otherwise `credentialRef` when available;
3. otherwise the issuing transport session ID.

`undo_change_set` first validates the current workspace and identity binding. A foreign or unverifiable change-set ID returns `CHANGE_SET_NOT_FOUND` rather than revealing that the identifier exists.

Phase 3C provides local/shared-credential binding, not strong per-human ownership. Phase 8 attaches OAuth subject and formal scopes to the same interface.

## 10. `undo_change_set` tool

### 10.1 Surface and policy

- Contract V2 only.
- Standard and full tool surfaces; hidden from connection-test mode.
- Required scope: `filesystem:write`.
- Risk class: R2.
- Resource description is the exact bounded operation set loaded from authenticated change-set metadata.

### 10.2 Input

```ts
interface UndoChangeSetInputV2 {
  workspace_id: string;
  change_set_id: string;
  preview?: boolean;
}
```

There is no `force`, overwrite, conflict-ignore, or arbitrary path override in V1.

### 10.3 Preflight

Undo requires:

- change set belongs to the selected canonical workspace;
- owner binding matches;
- state is `active`;
- retention has not expired;
- every current file exactly matches the original change set's after existence, identity constraints, and after SHA-256;
- all reverse target paths remain inside policy and are not blocked;
- required encrypted blobs authenticate and match their recorded before SHA-256;
- the atomic backend and required audit store are available.

Any current-state mismatch returns `UNDO_CONFLICT` and performs zero changes.

### 10.4 Execution and result

Undo builds a new reverse transaction:

- original create → guarded internal delete;
- original replace/edit/delete → guarded restore from decrypted before bytes;
- original move → guarded reverse move;
- original created parent directories → remove only when empty and created solely by that transaction.

A successful undo:

- receives a new change-set ID;
- records `reverts_change_set_id` in the result and audit event;
- marks the original change set `undone` only after audit-backed commit;
- leaves the new undo change set `undo_supported: false` in V1, so redo is not implied.

Preview performs full validation and returns the bounded reverse operation summary without decrypting more content than necessary and without changing state.

### 10.5 Stable failures

- `WORKSPACE_NOT_FOUND`;
- `CHANGE_SET_NOT_FOUND`;
- `UNDO_EXPIRED`;
- `UNDO_NOT_SUPPORTED`;
- `UNDO_ALREADY_APPLIED`;
- `UNDO_CONFLICT`;
- `TRANSACTION_BUSY`;
- `ATOMIC_BACKEND_UNAVAILABLE`;
- `AUDIT_UNAVAILABLE`;
- `AUDIT_INTEGRITY_FAILURE`;
- `TRANSACTION_FAILED`;
- `ROLLBACK_FAILED`;
- `TRANSACTION_RECOVERY_REQUIRED`;
- `INTERNAL_ERROR`.

Failure details are bounded and do not expose rollback blob paths, encryption metadata, foreign identity facts, or current file hashes.

## 11. Policy resource resolution

The policy boundary gains injected safe resource resolvers instead of teaching the generic evaluator about change-set storage internals.

```ts
interface ToolResourceResolver {
  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult;
}
```

- Static definitions continue to declare risk and scope.
- `undo_change_set` resolver authenticates metadata and returns a batch filesystem descriptor.
- Resolver failure occurs before policy allow and maps to a stable safe policy/tool failure.
- The pure policy evaluator remains deterministic over the resolved descriptor and immutable policy snapshot.

## 12. Transaction/audit commit handshake

Every migrated mutator returns an internal non-enumerable pending commit handle to the registered-tool wrapper.

```text
handler installs visible transaction
→ wrapper persists terminal execution event
→ wrapper commits audit participant
→ wrapper finalizes transaction artifacts and change-set manifest
→ public success returned
```

If the handler returns a normal success without the required pending handle while atomic mode is active, the wrapper treats it as an internal contract violation and fails closed.

If final cleanup fails after the execution event and audit participant are durable, the transaction is considered committed and recovery performs idempotent cleanup before the next mutation. The public result may succeed only when the manifest proves the committed state; diagnostics report cleanup pending.

## 13. Compatibility and rollout

Recommended rollout:

1. implement Phase 3A/3B with contract V1 and transactions disabled;
2. enable atomic mode in focused tests while retaining V1 outputs;
3. migrate `write` and `edit` first;
4. migrate patch, handoff, Pro-context, scaffold, script, and probe writers;
5. run the static mutation closure gate;
6. enable contract V2 in dedicated Smoke and Stress matrices;
7. keep contract V1 as the default for one migration release;
8. treat a future default flip as a separate reviewed release decision.

Contract V1 atomic mode maps new internal transaction failures to the existing generic tool failure families because its exact error unions cannot expand. Contract V2 exposes the precise stable codes.

Rollback may return the default to contract V1 or transaction legacy mode, but it must not delete change-set or audit evidence. Atomic mode never silently falls back within a request.

## 14. Required tests

Phase 3C implementation must include:

- exact V1 contracts byte-for-byte unchanged;
- exact V2 active tool set, schemas, supertool union, inventory, Tool Cards, and policy map;
- configuration rejection for contract V2 without atomic transactions;
- `write` expected hash, absent target, concurrent target creation, and exact UTF-8 semantics;
- `edit` expected hash, snippet checks, BOM/newline preservation, and byte hashes;
- transaction metadata on every V2 mutator success;
- no required mutation success without a pending commit handle;
- audit append failure rolling back each migrated mutator;
- multi-file patch zero-change preflight failure and execution rollback;
- all-or-nothing handoff/scaffold/log updates;
- Pro-context and script migration;
- static classification of every low-level write primitive;
- encrypted blob confidentiality shape, authentication failure, nonce uniqueness, and key separation;
- owner binding and foreign-ID non-disclosure;
- undo create, replace, delete, append-replacement, patch, and move metadata paths;
- undo conflict after any later modification;
- undo expiry, size limits, count limits, total-byte pruning, and tombstones;
- preview zero mutation;
- original change set marked undone only after successful audited reverse commit;
- no redo implication in V1;
- Windows and Linux compatibility;
- full regression, Build, eight-section Smoke, native-Windows Stress, package dry-run, exact tool counts, protected-source, diff scope, and secret-shape gates.

## 15. Non-goals

Phase 3C does not add arbitrary historical checkout, redo, force undo, cross-workspace undo, user-selected rollback file export, Git reset/stash, binary editing tools, arbitrary encoding conversion, permanent backup archives, cloud backup, DPAPI integration, or OAuth owner identity.

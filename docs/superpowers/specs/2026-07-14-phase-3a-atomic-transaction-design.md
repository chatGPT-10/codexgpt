# Phase 3A Atomic Transaction Kernel Design

Date: 2026-07-14
Status: approved design; implementation not started
Primary platform: native Windows

## 1. Purpose and phase boundary

Phase 3A establishes one internal transaction kernel for workspace file mutations. It does not add a public MCP tool and does not migrate existing write handlers yet. Phase 3B adds durable audit participation, Phase 3C migrates existing mutators and adds change-set undo, and Phase 3D adds `move_paths` and closes Phase 3.

The kernel must provide:

- optimistic version checks;
- one-file atomic visibility;
- multi-file failure rollback;
- deterministic process-crash recovery before a workspace becomes usable again;
- stable internal change-set identity;
- no dependency on Git, Shell, PowerShell, WSL, Worktree, or a project-operated cloud service.

It does not claim database-style instantaneous atomic visibility across several files. During an external process crash, other applications may temporarily observe an intermediate multi-file state. CodexPro must restore or finish cleanup before reopening that workspace.

## 2. Security invariants

1. Every source, target, temporary path, backup path, and created directory is validated through the existing canonical `PathGuard` and blocked-path policy.
2. Transaction artifacts use reserved unpredictable names and are inaccessible through public CodexPro file tools.
3. No manifest stores file contents, complete diffs, credentials, raw tokens, or workspace absolute paths.
4. A transaction belongs to exactly one canonical workspace and one local volume.
5. Only ordinary files are supported by the V1 backend. Directories, symlinks, junctions, reparse-point escapes, devices, sockets, and alternate data streams are rejected.
6. A visible mutation is never attempted until the durable journal describes how to restore the previous state.
7. An incomplete transaction is rolled back during recovery. Recovery does not silently convert an unacknowledged transaction into success.
8. Recovery failure freezes mutation access for the workspace and returns a stable fail-closed error.
9. Filesystem TOCTOU is reduced through last-practical-moment identity and hash revalidation, but external processes remain outside CodexPro's locking boundary.

## 3. State roots and identifiers

### 3.1 Application-state root

Transaction control state is outside every workspace and outside Git.

Resolution order:

1. If `CODEXPRO_HOME` is explicitly configured, use `<CODEXPRO_HOME>/state/v1`.
2. On Windows, use `%LOCALAPPDATA%/CodexPro/state/v1`.
3. On non-Windows systems, use `$XDG_STATE_HOME/codexpro/v1` when available, otherwise `~/.local/state/codexpro/v1`.

Existing profile and runtime paths are not migrated in Phase 3A.

The layout is:

```text
state/v1/
├── installation.json
├── instances/
├── locks/
│   ├── workspaces/
│   └── audit/
├── transactions/
│   └── <workspaceStateKey>/
├── changesets/
│   └── <workspaceStateKey>/
└── audit/
```

### 3.2 Installation key and persistent workspace reference

`installation.json` contains:

- `schemaVersion: 1`;
- a random installation ID;
- one random 256-bit master key;
- creation timestamp.

The file is created exclusively and restricted to the current user as far as the host filesystem permits. Subkeys are derived with HKDF labels instead of storing several independent keys.

The existing Phase 2B `workspaceKey` remains unchanged and process-internal. Phase 3 introduces a distinct `workspaceStateKey`:

```text
wsk_<HMAC-SHA256(installation workspace key, normalized canonical root) prefix>
```

`workspaceStateKey` is used only below the application-state root. It is never accepted as an MCP argument, returned to a caller, written into workspace files, or included in public logs.

### 3.3 Transaction and change-set identifiers

- `transactionId`: `tx_<32 lowercase hexadecimal characters>`.
- `changeSetId`: `cs_<32 lowercase hexadecimal characters>`.
- Lock ownership tokens and temporary suffixes use independent cryptographically secure random values.

Identifiers are opaque and do not encode a path, process ID, timestamp, credential, or policy revision.

## 4. Reserved workspace artifacts

The V1 backend creates only sibling artifacts on the same volume as the affected file:

```text
.codexpro-txn-<random>.stage
.codexpro-txn-<random>.backup
.codexpro-txn-<random>.move
```

Rules:

- all `.codexpro-txn-*` names are hard-blocked by `PathGuard` for public reads, writes, search, tree, patch, move, and Git-facing path selectors;
- names do not contain the original file name;
- creation uses exclusive semantics;
- artifacts are listed in the durable manifest before they become rollback-critical;
- normal finalization deletes them immediately;
- recovery validates every artifact before using or deleting it.

## 5. Filesystem backend

### 5.1 Why the V1 backend requires hard links

The kernel uses Node's native `fsPromises.link`, `rename`, `open`, `unlink`, and `FileHandle.sync` operations.

Hard links provide two properties required by the V1 contract:

- an existing file can receive a complete rollback name without copying its bytes;
- a fully written staged file can be installed at a previously absent target without overwriting a concurrently created target.

On Windows this backend is expected to operate on NTFS. A volume or filesystem that cannot create the required hard links returns `ATOMIC_BACKEND_UNAVAILABLE`; the kernel does not silently fall back to direct `writeFile`.

### 5.2 Atomic replacement of an existing file

For each replacement:

1. Resolve and validate the target.
2. Read bytes and metadata, calculate the current SHA-256, and validate caller expectations.
3. Create the staged sibling with exclusive creation.
4. Write all bytes, verify the staged SHA-256, call `FileHandle.sync()`, and close it.
5. Create a hard-link backup from the current target to the reserved backup name.
6. Persist and sync the manifest state `backup_ready`.
7. Revalidate target identity and SHA-256.
8. Rename the staged file over the target.
9. Persist and sync the operation state `installed`.

The backup hard link retains the exact previous file object for synchronous rollback. Finalization removes the backup after the transaction and required audit record are durable.

### 5.3 Atomic creation of a new file

For a previously absent target:

1. Write and sync a staged sibling.
2. Revalidate that the target is absent.
3. Create a hard link from the staged file to the target.
4. Persist the state `installed`.
5. Unlink the staged name during finalization.

Hard-link creation must fail if the target appeared concurrently. The kernel must never use a replacing rename for the final installation of a new target.

### 5.4 Guarded internal deletion

The kernel supports guarded deletion only as an internal transaction primitive used by patch, undo, and rollback adapters. Phase 3A does not expose a public delete tool.

For an existing ordinary file:

1. resolve and validate the target and its expected identity/hash;
2. create and verify a reserved hard-link backup;
3. persist and sync `backup_ready`;
4. revalidate the target immediately before visibility;
5. unlink the target name;
6. persist and sync `deleted`.

Rollback restores the target through a no-clobber hard link from the verified backup. If another entry occupies the original path, rollback must not overwrite it and the workspace enters `recovery_required`.

The generic operation model also reserves move-stage states used by Phase 3D. The public move graph, validation, and stage-all/install-all algorithm remain defined only in the Phase 3D specification.

### 5.5 Directory and journal durability

Required durability operations:

- staged file content is synced before installation;
- backup readiness and every visible operation transition are written through the atomic manifest writer;
- the manifest file is synced before its replacement;
- directory syncing is attempted through a platform adapter and recorded as `supported`, `unsupported`, or `failed`.

A required file or journal sync failure aborts or rolls back. Unsupported directory syncing limits power-loss durability claims but does not weaken the simulated process-crash recovery contract.

## 6. Metadata and byte semantics

The transaction kernel operates on bytes.

- SHA-256 is calculated over exact file bytes.
- Text encoding decisions belong to Phase 3C adapters.
- Existing-file replacement attempts to preserve mode and supported attributes by applying captured metadata to the staged file before installation.
- A successful content change receives a normal new modification time. The kernel does not falsify `mtime` to make an edit appear unchanged.
- Rollback and later undo restore captured access/modification times and supported mode information on a best-effort basis.
- Ownership, ACL, birth time, alternate streams, and filesystem-specific metadata are never claimed as universally preserved. Unsupported metadata is reported in internal capability facts and tests.

## 7. Optimistic concurrency and preconditions

Every operation contains a precondition:

```ts
interface FilePreconditionV1 {
  exists: boolean;
  expectedSha256: string | null;
  observedSha256: string | null;
  observedIdentity: string | null;
}
```

- A caller-supplied expected hash is authoritative.
- The kernel always captures an observed hash and identity during preparation, even when the caller did not supply a hash.
- Immediately before the visible step, the kernel repeats `lstat`, containment, ordinary-file, identity, and SHA-256 checks.
- Any mismatch returns `FILE_VERSION_CONFLICT` and leaves the workspace unchanged.
- Absence is a real precondition. A target created after preparation causes a conflict rather than an overwrite.

## 8. Workspace mutation lock

### 8.1 Scope

Only one transaction or recovery operation may mutate a canonical workspace at a time. The lock is coarse by design because a multi-file operation can touch unrelated directories and because rollback must have a total order.

### 8.2 Cross-process lock protocol

Lock acquisition uses atomic directory creation below:

```text
state/v1/locks/workspaces/<workspaceStateKey>.lock/
```

The owner record contains only:

- schema version;
- random lock token;
- random process instance ID;
- process ID;
- transaction ID;
- creation time.

Each CodexPro process creates an instance record under `instances/`. A contender:

1. attempts atomic lock-directory creation;
2. if the lock exists, validates the owner record and process liveness;
3. treats a live or uncertain owner as active and returns `TRANSACTION_BUSY`;
4. claims a dead owner's lock only through an atomic rename to a recovery name;
5. performs recovery before granting mutation access.

PID reuse or unverifiable process state must fail closed rather than delete a possibly live lock.

### 8.3 In-process gate

A server-local gate prevents its own read and mutation handlers from entering an affected workspace while a commit or recovery is in the visible-change phase. Reads return a stable busy/recovery error rather than observing a CodexPro-generated partial state. External applications are outside this gate.

## 9. Manifest and state machine

The durable manifest contains no file bodies:

```ts
interface TransactionManifestV1 {
  schemaVersion: 1;
  transactionId: string;
  changeSetId: string;
  workspaceStateKey: string;
  createdAt: string;
  updatedAt: string;
  state:
    | "preparing"
    | "prepared"
    | "committing"
    | "committed_pending_participants"
    | "committed"
    | "rolling_back"
    | "rolled_back"
    | "recovery_required";
  operations: TransactionOperationV1[];
  createdDirectories: string[];
  participantFacts: Record<string, "pending" | "committed" | "failed">;
}
```

Operation states are explicit and idempotent:

```text
planned
→ staged
→ backup_ready or target_absent_confirmed
→ installed
→ finalized
```

The transaction sequence is:

```text
acquire workspace lock
→ complete pending recovery
→ validate all operations
→ persist preparing manifest
→ stage and sync every operation
→ persist prepared
→ persist committing
→ install operations in deterministic order
→ persist committed_pending_participants
→ commit required participants
→ persist committed
→ finalize artifacts
→ release lock
```

A future Phase 3B audit participant commits between `committed_pending_participants` and `committed`.

## 10. Rollback and crash recovery

### 10.1 Synchronous failure

If any operation or required participant fails:

1. persist `rolling_back` when possible;
2. restore installed replacements from backup hard links;
3. remove newly created targets only when their exact installed hash and identity still match;
4. restore staged moves;
5. remove only directories created by this transaction and only when empty;
6. verify every restored precondition;
7. persist `rolled_back` and retain a bounded diagnostic manifest until reconciliation.

A rollback conflict or failure sets `recovery_required`, freezes workspace mutations, and returns `TRANSACTION_RECOVERY_REQUIRED` or `ROLLBACK_FAILED` without exposing absolute paths.

### 10.2 Startup and workspace-open recovery

Recovery runs before a workspace handle becomes usable for file operations.

- `preparing` or `prepared`: remove validated staged artifacts; no visible changes are expected.
- `committing`, `committed_pending_participants`, or `rolling_back`: restore the before-state.
- `committed`: finish idempotent cleanup without reversing the committed change.
- `recovery_required`: retry safe recovery; if proof is insufficient, remain frozen.

Recovery never trusts a manifest path without rerunning path containment, reserved-name, ordinary-file, identity, and hash validation.

## 11. Internal interfaces

Phase 3A introduces focused modules under `src/transactions/`:

```text
src/transactions/
├── types.ts
├── schemas.ts
├── stateRoot.ts
├── installation.ts
├── workspaceLock.ts
├── atomicManifest.ts
├── atomicFs.ts
├── engine.ts
└── recovery.ts
```

Core interfaces:

```ts
interface PreparedTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;
  commit(): Promise<PendingTransactionCommit>;
  rollback(reason: string): Promise<void>;
}

interface PendingTransactionCommit {
  readonly transactionId: string;
  readonly changeSetId: string;
  commitParticipant(name: string, action: () => Promise<void>): Promise<void>;
  finalize(): Promise<CommittedTransaction>;
  rollback(reason: string): Promise<void>;
}
```

Dependencies such as clocks, random ID generation, filesystem primitives, and fault injection are constructor-injected for tests. No hidden MCP arguments or process-global mutable test hooks are added.

## 12. Stable internal errors

The kernel defines stable codes for adapters:

- `FILE_VERSION_CONFLICT`;
- `TRANSACTION_BUSY`;
- `ATOMIC_BACKEND_UNAVAILABLE`;
- `TRANSACTION_PRECONDITION_FAILED`;
- `TRANSACTION_FAILED`;
- `ROLLBACK_FAILED`;
- `TRANSACTION_RECOVERY_REQUIRED`;
- `TRANSACTION_STATE_CORRUPT`.

Messages and details contain only bounded workspace IDs, relative paths, counts, and safe opaque identifiers.

## 13. Feature flag and compatibility

`CODEXPRO_FILE_TRANSACTIONS` accepts:

- `legacy` — existing mutators remain on their current implementation;
- `atomic` — migrated mutators must use the Phase 3 kernel.

The initial default remains `legacy`. Contract V2 introduced in Phase 3C requires `atomic`. An unavailable atomic backend never falls back silently when atomic mode is selected.

## 14. Required tests

Phase 3A implementation must include:

- installation-state creation, permissions, and deterministic HMAC workspace reference;
- no absolute path or file content in manifests;
- reserved artifact blocking across every public path surface;
- same-workspace cross-process lock exclusion and dead-owner recovery;
- stage sync before visibility;
- existing-file backup hard link and exact rollback;
- no-clobber new-file installation;
- expected-hash and internally observed-hash conflicts;
- symlink, junction, reparse point, ADS, device, directory, outside-root, and blocked-path rejection;
- fault injection at every journal and visible filesystem boundary;
- child-process crash tests followed by reopen recovery;
- rollback of partially installed multi-file changes;
- created-directory rollback only when empty;
- metadata preservation and explicit unsupported-capability reporting;
- Windows case-insensitive path comparison;
- Linux CI compatibility;
- complete regression, Build, Smoke, native-Windows Stress, package dry-run, diff scope, protected-source, and secret-shape gates.

## 15. Non-goals

Phase 3A does not add public tools, persistent audit, persistent undo blobs, directory-tree transactions, cross-volume copy/delete, overwrite-capable moves, network filesystem guarantees, Windows TxF, native addons, Git rollback, or OS sandboxing.

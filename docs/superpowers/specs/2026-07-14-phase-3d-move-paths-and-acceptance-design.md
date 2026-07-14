# Phase 3D Move Paths and Phase Acceptance Design

Date: 2026-07-14
Status: approved design; implementation not started
Primary platform: native Windows

## 1. Purpose and phase boundary

Phase 3D adds `move_paths` as the first public batch file-organization tool built directly on the Phase 3 transaction, audit, contract V2, and change-set foundations. It then runs the complete Phase 3 acceptance gate.

`move_paths` V1 is intentionally not a general file manager. It supports bounded organization of ordinary files inside one authorized workspace and one hard-link-capable volume. It does not use Shell, PowerShell, `git mv`, Worktree, copy/delete fallback, or directory-tree movement.

## 2. Security and behavior invariants

1. Every source and destination is workspace-relative, canonicalized, and validated through `PathGuard`.
2. Every source must be an existing ordinary file and must match a required caller-supplied SHA-256.
3. Every destination must be absent at final installation time unless it is another source in the same fully prevalidated batch.
4. V1 never overwrites an unrelated destination.
5. All items are prevalidated before any source name is removed.
6. Source/destination duplicates use platform comparison semantics; Windows comparison is case-insensitive.
7. The batch is limited to one canonical workspace and one volume.
8. Cycles and chains are supported through reserved hard-link staging, not by ordering guesses.
9. A preflight failure performs zero changes.
10. An execution failure restores every source or freezes the workspace if restoration cannot be proven.
11. Created parent directories are removed on rollback only when they were created by this transaction and remain empty.
12. A successful move receives a change set, durable audit completion, and guarded undo metadata.

## 3. Tool surface and policy

`move_paths` exists only in tool contract V2.

- Available in standard and full surfaces.
- Hidden from connection-test mode.
- Required scope: `filesystem:write`.
- Risk class: R2.
- Maximum items: 64.
- Direct tool and `codexpro` supertool use the same registered handler.

R2 is justified by the hard V1 limits: no overwrite, required source hashes, ordinary files only, one workspace/volume, bounded count, transaction rollback, persistent audit, and conflict-checked undo.

## 4. Exact input contract

```ts
interface MovePathItemV1 {
  source: string;
  destination: string;
  expected_sha256: string;
}

interface MovePathsInputV1 {
  workspace_id: string;
  moves: MovePathItemV1[];
  create_parents?: boolean;
  preview?: boolean;
}
```

Validation:

- `moves` contains 1–64 items;
- source and destination are non-empty bounded relative paths;
- hashes are lowercase 64-character hexadecimal SHA-256 values;
- unknown fields are rejected;
- `create_parents` defaults to `false`;
- `preview` defaults to `false`;
- there is no overwrite, force, copy fallback, cross-volume, directory, glob, or recursive option.

## 5. Path graph validation

The complete move graph is built before mutation.

### 5.1 Duplicate and no-op rules

Reject:

- one comparison-equivalent source appearing more than once;
- one comparison-equivalent destination appearing more than once;
- an exact source-to-identical-destination no-op;
- a destination parent that is or lies below an ordinary source file in the same batch;
- any path that resolves to a blocked or reserved transaction artifact.

A Windows case-only rename such as `File.ts` to `file.ts` is not an exact no-op and is explicitly supported.

### 5.2 Existing destinations

- If a destination exists and is not a source in the same batch, return `TARGET_EXISTS`.
- If a destination is another source in the same batch, it is allowed because all sources are staged before any destination is installed.
- An existing destination directory is never treated as an implicit basename target; destinations are exact file paths.

### 5.3 Cycles and chains

The graph may contain:

- independent moves;
- chains such as A → B and B → C;
- cycles such as A → B and B → A;
- Windows case-only renames.

All are handled through the same stage-all/install-all algorithm. No topological ordering is relied upon for correctness.

## 6. Source and volume validation

For every source:

- resolve through native realpath and workspace containment;
- use `lstat` and reject symlinks, junctions, reparse-point escapes, directories, devices, sockets, and non-ordinary entries;
- verify blocked-path policy;
- read exact bytes under configured limits required for hashing;
- calculate SHA-256 and match `expected_sha256`;
- capture safe file identity and metadata.

For every destination:

- resolve the destination or nearest existing ancestor through the write-safe guard;
- verify every existing ancestor is a real directory inside the workspace;
- reject symlink/junction ancestors;
- compare source `stat.dev` with the destination's nearest existing ancestor;
- require the same volume and hard-link backend capability.

Any mismatch returns before the transaction enters its visible phase.

## 7. Missing parent directories

When `create_parents` is `false`, every destination parent must already exist.

When `create_parents` is `true`:

- compute the exact missing directory set during preflight;
- reject any parent path collision with a file or blocked entry;
- create directories shallowest-first inside the transaction;
- record each created relative directory in the manifest and change set;
- on rollback or undo, remove deepest-first only if still empty;
- never remove a pre-existing directory.

Directory creation does not make directory-tree movement a supported operation.

## 8. Transaction algorithm

### 8.1 Preparation

1. Acquire the workspace transaction lock and complete pending recovery.
2. Resolve and validate the full graph.
3. Revalidate required source hashes and identities.
4. Persist the preparing manifest with every source, destination, reserved stage name, and planned parent directory.
5. Create required parent directories and journal each creation.

### 8.2 Stage every source

For each source in deterministic comparison-key order:

1. create a hard link from the source to its reserved `.move` sibling;
2. persist `staged_link_ready`;
3. revalidate that source and stage refer to the expected file identity and hash;
4. unlink the original source name;
5. persist `source_name_removed`.

If a crash occurs between link and unlink, recovery sees both names and can safely remove or continue according to the manifest. If it occurs after unlink, the reserved stage name retains the complete file object.

### 8.3 Install every destination

After every source name is staged and removed:

1. revalidate that all unrelated destinations remain absent;
2. create a hard link from each stage file to its destination;
3. persist `destination_link_ready`;
4. verify destination identity and SHA-256;
5. unlink the reserved stage name;
6. persist `installed`.

Hard-link creation is the no-clobber installation primitive. The implementation must not use a replacing rename for destination installation.

### 8.4 Commit

After all destinations verify:

1. persist `committed_pending_participants`;
2. retain reverse mapping in the change-set manifest;
3. persist the required execution audit event;
4. commit the audit participant;
5. mark the transaction committed;
6. clean remaining validated artifacts;
7. release the workspace lock;
8. return success.

## 9. Rollback and recovery

Rollback uses identities and hashes, not path names alone.

For each operation in reverse deterministic order:

- if the destination exists with the exact installed identity/hash, link it back to the original source if necessary and unlink the destination;
- if the reserved stage exists, restore the original source through a no-clobber hard link and remove the stage;
- if both source and destination exist because of a crash boundary, verify identity before removing the transaction-created name;
- never overwrite a path created or changed by an external actor;
- remove transaction-created empty parents deepest-first.

If an original source path is no longer safely restorable because an external entry occupies it, rollback stops, records `recovery_required`, and freezes the workspace. It does not overwrite the external entry.

Recovery before workspace reuse applies the same idempotent rules.

## 10. Preview

`preview: true` performs:

- full policy resource resolution;
- complete path graph validation;
- source identity and hash validation;
- destination conflict and same-volume checks;
- parent-directory plan calculation;
- backend capability validation.

It does not create directories, lock beyond the bounded validation period, create stage links, write a transaction/change-set manifest, or mutate audit evidence beyond the normal audited preview invocation.

Because another process can change the workspace after preview, execution repeats every precondition.

## 11. Exact output contract

Success data is a strict discriminated shape.

```ts
interface MovePathsDataV2 {
  workspace_id: string;
  root: string;
  preview: boolean;
  moves: Array<{
    source: string;
    destination: string;
    sha256: string;
    bytes: number;
  }>;
  created_directories: string[];
  total_files: number;
  total_bytes: number;
  transaction: TransactionResultV2 | null;
}
```

Invariants:

- preview success requires `transaction: null` and reports planned directories;
- committed success requires `transaction` to be non-null;
- returned paths are normalized workspace-relative paths;
- move order matches the caller's validated input order;
- no temporary path, backup path, workspace state key, canonical state directory, or owner binding is returned.

## 12. Stable failures

`move_paths` defines:

- `WORKSPACE_NOT_FOUND`;
- `INVALID_ARGUMENT`;
- `DUPLICATE_SOURCE`;
- `DUPLICATE_DESTINATION`;
- `MOVE_NO_OP`;
- `SOURCE_NOT_FOUND`;
- `NOT_A_FILE`;
- `PATH_OUTSIDE_WORKSPACE`;
- `PATH_BLOCKED`;
- `SYMLINK_NOT_ALLOWED`;
- `TARGET_EXISTS`;
- `PARENT_DIRECTORY_NOT_FOUND`;
- `PARENT_PATH_CONFLICT`;
- `CROSS_VOLUME_MOVE`;
- `FILE_VERSION_CONFLICT`;
- `TRANSACTION_BUSY`;
- `ATOMIC_BACKEND_UNAVAILABLE`;
- `AUDIT_UNAVAILABLE`;
- `AUDIT_INTEGRITY_FAILURE`;
- `TRANSACTION_FAILED`;
- `ROLLBACK_FAILED`;
- `TRANSACTION_RECOVERY_REQUIRED`;
- `INTERNAL_ERROR`.

Retryable flags are true only for bounded contention or temporary audit availability failures. Error details contain relative paths or bounded counts and never disclose external roots, foreign workspace facts, temporary names, or current file hashes.

## 13. Batch policy resource

Phase 3D adds a bounded batch filesystem descriptor:

```ts
interface FilesystemBatchResourceV1 {
  schemaVersion: 1;
  kind: "filesystem_batch";
  operation: "move" | "undo" | "patch";
  workspaceId: string;
  entries: Array<{
    sourceRelativePath: string | null;
    destinationRelativePath: string | null;
    sourceComparisonKey: string | null;
    destinationComparisonKey: string | null;
  }>;
  resourceFingerprint: string;
}
```

Rules:

- maximum 64 entries;
- each present source and destination is independently checked against hard policy and the compiled Permission Profile;
- fingerprint input is deterministic and order-normalized while public result ordering remains caller order;
- safe audit summary records operation type, count, and bounded relative summaries, not an unbounded path list;
- a single denied path denies the complete batch.

The pure evaluator remains unchanged except for recognizing the new validated descriptor kind.

## 14. Undo integration

A successful move change set stores:

- original source/destination pairs;
- exact moved file hashes and safe identities;
- created parent directories;
- no content blobs unless another operation in a combined future transaction requires them.

`undo_change_set` reverses the complete move only when:

- every destination still exists with its recorded after hash;
- every original source is absent;
- reverse destinations remain policy-allowed and no-clobber;
- owner binding and retention are valid.

Any mismatch returns `UNDO_CONFLICT` with zero mutation.

## 15. Tool registration and presentation

Contract V2 updates:

- canonical tool set and exact count;
- direct MCP registration;
- `codexpro` action enum, input routing, and output union;
- policy definition and batch resource resolver;
- inventory and self-test expected tools;
- Tool Card title, icon, success/failure renderer, and preview distinction;
- standard/full mode surfaces;
- connection-test exclusion;
- README, README_ZH, SECURITY, CHANGELOG, and master-plan documentation.

No contract V1 registration or schema changes.

## 16. Required focused tests

`move_paths` tests must cover:

- strict input/output schema and unknown-field rejection;
- 1 and 64 item bounds;
- duplicate sources/destinations under Windows case folding;
- exact no-op rejection and case-only rename success;
- source-not-found, non-file, symlink, junction, reparse point, ADS, blocked, and outside-root failures;
- required expected hash and conflict after preview;
- unrelated target exists rejection;
- source-as-destination chains and two-way/longer cycles;
- same-volume verification and cross-volume rejection;
- hard-link backend unavailable failure;
- missing parent rejection and transactional parent creation;
- preflight failure with zero changes;
- fault injection after every stage link, source unlink, destination link, stage unlink, journal update, audit append, and cleanup boundary;
- exact rollback of partial cycles and chains;
- rollback conflict causing workspace freeze rather than overwrite;
- crash/reopen recovery on native Windows;
- preview zero filesystem/change-set mutation;
- durable audit correlation and no path/content leakage;
- move undo success and post-move modification conflict;
- direct/supertool parity, Tool Card, mode visibility, and connection-test hiding;
- Git and non-Git workspace equivalence.

## 17. Phase 3 complete acceptance gate

Phase 3 closes only when all of the following pass with fresh evidence:

### 17.1 Functional and security acceptance

- old-version writes and edits return `FILE_VERSION_CONFLICT` in contract V2;
- atomic create never overwrites a concurrently created target;
- one-file replacements expose only complete old or complete new bytes to readers;
- any normal multi-file failure restores the complete before-state;
- child-process crash injection at every transaction boundary is recovered before workspace reuse;
- no supported workspace writer bypasses the transaction inventory gate in atomic mode;
- required audit authorization occurs before mutation and required completion occurs before final success;
- audit records correlate request, decision, change set, result, and bounded mutation summary without file bodies or credentials;
- undo restores every explicitly supported unchanged change set and refuses conflicts;
- move preflight produces zero changes; move execution rollback restores all sources and transaction-created empty parents;
- Git and non-Git workspaces use the same file transaction path.

### 17.2 Compatibility acceptance

- contract V1 exact schemas and 28-tool set remain unchanged;
- contract V2 exact schemas and 31-tool set are internally consistent;
- direct and supertool handlers share one authorization, transaction, audit, and output path;
- existing configuration remains readable for one migration period;
- legacy transaction mode never claims atomic guarantees;
- atomic mode never silently falls back.

### 17.3 Verification gate

- all Phase 3 focused tests;
- complete `node --test test/*.test.mjs` regression;
- TypeScript Build;
- all eight protected Smoke sections through compatibility loaders where required;
- native-Windows Stress, including transaction crash/recovery and case-only rename;
- package dry-run and exact package contents;
- `git diff --check` equivalent;
- protected Smoke source unchanged unless an independently approved same-change migration is required;
- static transaction bypass scan;
- static reserved-artifact exclusion scan;
- static secret-shape and audit-redaction scan;
- documentation and configuration parity in English and Chinese;
- exact-head Ubuntu/Windows Node 20/24 CI.

A failed gate is fixed within Phase 3. Security checks, atomic backend requirements, audit requirements, or rollback verification are not weakened to proceed to Phase 4A.

## 18. Rollback and non-goals

Rollback may hide contract V2 tools and return the default to contract V1/legacy transaction mode. It must not:

- delete audit evidence;
- delete active change-set evidence without retention policy;
- silently bypass recovery-required workspaces;
- restore direct workspace writes while configuration still claims atomic mode;
- use Git or Shell as an undocumented fallback.

Phase 3D does not implement directory moves, recursive moves, cross-volume moves, copy/delete, overwrite, merge, trash/recycle-bin behavior, glob expansion, remote filesystem guarantees, force undo, Git staging/commit, or remote Git operations.

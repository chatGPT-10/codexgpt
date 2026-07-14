# Phase 3A Atomic Transaction Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal, Windows-first workspace file transaction kernel with exact SHA-256 preconditions, same-volume staging and hard-link rollback, conservative cross-process locking, durable manifests, synchronous normal-failure rollback, and deterministic crash recovery before workspace reuse.

**Architecture:** Control-plane operations—installation state, manifest transitions, lock ownership, and crash recovery—use synchronous Node filesystem calls so persistence order is explicit and recovery can run from the existing synchronous `WorkspaceManager` boundary. File-data operations—reading, hashing, staging bytes, and metadata application—use asynchronous Node APIs behind an injected adapter. Phase 3A adds no public MCP tool and does not migrate existing workspace writers. Until Phase 3C marks every supported workspace mutator as transaction-backed, server construction fails closed when `CODEXPRO_FILE_TRANSACTIONS=atomic` is combined with any enabled public write mode; atomic mode is usable only with `CODEXPRO_WRITE_MODE=off` for kernel and recovery verification.

**Tech Stack:** TypeScript 5.8, Node.js 20/24 built-in `crypto`, `fs`, and `fs/promises`, Zod 3.25, Node test runner, native Windows NTFS verification, Ubuntu CI compatibility.

## Global Constraints

- Native Windows is the primary platform; WSL must not become mandatory.
- Use Node-native filesystem APIs only. Do not introduce PowerShell, Git, Worktree, copy/delete, Windows TxF, native addons, or third-party transaction dependencies.
- Transaction control state stays outside authorized workspaces and Git.
- Workspace artifacts use reserved unpredictable `.codexpro-txn-*` sibling names on the same volume as the affected file.
- Public path surfaces must hard-block every path segment beginning with `.codexpro-txn-`, regardless of user-supplied blocked-glob configuration.
- The V1 atomic backend requires hard-link support. An unsupported volume returns `ATOMIC_BACKEND_UNAVAILABLE`; no direct-write fallback is allowed.
- Before Phase 3C completes mutator migration, `atomic` plus any enabled public write mode is an invalid server configuration; the server must fail before registering tools.
- Exact file SHA-256 is calculated over bytes, not decoded text.
- A caller precondition and the kernel's observed precondition are both revalidated immediately before visible mutation.
- Single-file replacement exposes either complete old bytes or complete new bytes. Multi-file failure is synchronously rolled back, but no database-style instantaneous cross-file visibility claim is made.
- Manifests must not contain canonical workspace roots, file bodies, complete diffs, credentials, tokens, cookies, environment-file contents, or private keys.
- External processes remain outside the CodexPro workspace lock. Unverifiable lock ownership and uncertain rollback fail closed.
- Existing Phase 1 tool schemas, the 28-tool contract V1 surface, protected `scripts/smoke.mjs`, and protected `scripts/http-smoke.mjs` remain unchanged.
- Do not stage, commit, push, publish, alter system policy, install system components, or begin Phase 3B–3D implementation without the applicable later approval.

## File Structure

### New transaction modules

- `src/transactions/types.ts` — stable transaction codes, request/manifest types, fault points, metadata, and public internal interfaces.
- `src/transactions/schemas.ts` — strict Zod schemas for installation state, manifests, operation records, lock owner records, and bounded safe details.
- `src/transactions/stateRoot.ts` — platform-aware state-root resolution, canonical-root normalization, HKDF subkey derivation, and opaque persistent workspace-state keys.
- `src/transactions/installation.ts` — exclusive load/create and validation of `installation.json`.
- `src/transactions/atomicStateFile.ts` — synced temporary-file plus atomic-rename JSON persistence restricted to the Phase 3 state root.
- `src/transactions/workspaceLock.ts` — process-instance registration, conservative liveness classification, atomic lock-directory ownership, and dead-owner claim.
- `src/transactions/atomicFs.ts` — byte Hash, ordinary-file identity, same-volume backend probe, stage/backup/install/delete/finalize primitives, and metadata handling.
- `src/transactions/engine.ts` — prepare, visible commit, participant gate, finalize, and synchronous-failure rollback orchestration.
- `src/transactions/recovery.ts` — idempotent manifest recovery and workspace readiness guard.
- `src/transactions/index.ts` — the closed internal export surface consumed by later phases.

### Existing modules modified

- `src/config.ts` — strict `FileTransactionMode`, `fileTransactions`, and capability-aware configuration validation.
- `src/server.ts` — fail closed before tool registration when atomic mode is requested while public workspace mutators remain unmigrated; later wire the recovery hook for the allowed read-only atomic configuration.
- `src/guard.ts` — unconditional reserved-artifact blocking and optional synchronous workspace-readiness hook.
- `config.example.env` — document the inactive-by-default Phase 3A flag without claiming public mutators are migrated.
- `Memory.md` and `docs/memory/archive/phase-3.md` — record each completed implementation task and exact evidence.

### New tests and fixtures

- `test/transaction-config-and-path-policy.test.mjs`
- `test/transaction-schema.test.mjs`
- `test/transaction-installation-state.test.mjs`
- `test/transaction-manifest-store.test.mjs`
- `test/transaction-workspace-lock.test.mjs`
- `test/transaction-atomic-fs.test.mjs`
- `test/transaction-engine.test.mjs`
- `test/transaction-recovery.test.mjs`
- `test/transaction-crash-recovery.test.mjs`
- `test/fixtures/transaction-crash-child.mjs`

---

### Task 1: Configuration and Reserved Artifact Boundary

**Files:**
- Modify: `src/config.ts:6-49, 192-207, 314-429`
- Modify: `src/server.ts` at the beginning of `createCodexProServer(...)`, before manager or tool registration
- Modify: `src/guard.ts:33-78, 347-423`
- Modify: `config.example.env`
- Create: `test/transaction-config-and-path-policy.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: existing `CodexProConfig`, `loadConfig()`, `createCodexProServer()`, `PathGuard.isBlockedRelativePath()`, and Windows case-insensitive path comparison.
- Produces: `FileTransactionMode`, `CodexProConfig.fileTransactions`, `FileTransactionCapabilities`, `assertFileTransactionConfiguration(config, capabilities)`, `isReservedTransactionRelativePath(relPath, platform)`, and the invariant that every `.codexpro-txn-*` path segment is blocked independently of configured globs.

- [ ] **Step 1: Write failing configuration and path-policy tests**

Create `test/transaction-config-and-path-policy.test.mjs` with isolated environment restoration and these assertions:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFileTransactionConfiguration,
  loadConfig
} from "../dist/config.js";
import { isReservedTransactionRelativePath, PathGuard } from "../dist/guard.js";
import { createCodexProServer } from "../dist/server.js";

function withEnv(name, value, action) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("file transactions default to legacy and reject unknown modes", () => {
  withEnv("CODEXPRO_FILE_TRANSACTIONS", undefined, () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "legacy");
  });
  withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "atomic");
  });
  withEnv("CODEXPRO_FILE_TRANSACTIONS", "unsafe", () => {
    assert.throws(() => loadConfig(["--bash", "off"]), /legacy or atomic/);
  });
});

test("Phase 3A refuses atomic mode while public workspace writers are enabled", () => {
  const atomicWritable = withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "workspace"])
  );
  assert.throws(
    () => assertFileTransactionConfiguration(atomicWritable, { workspaceMutatorsAtomic: false }),
    /requires transaction-backed workspace mutators/i
  );
  assert.throws(
    () => createCodexProServer(atomicWritable),
    /requires transaction-backed workspace mutators/i
  );

  const atomicReadOnly = withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "off"])
  );
  assert.doesNotThrow(() =>
    assertFileTransactionConfiguration(atomicReadOnly, { workspaceMutatorsAtomic: false })
  );
});

test("reserved transaction artifacts are blocked by path segment", () => {
  const guard = new PathGuard({ blockedGlobs: [] }, "win32");
  for (const candidate of [
    ".codexpro-txn-a.stage",
    "src/.codexpro-txn-a.backup",
    "SRC/.CODEXPRO-TXN-A.MOVE",
    "nested/.codexpro-txn-dir/child"
  ]) {
    assert.equal(isReservedTransactionRelativePath(candidate, "win32"), true);
    assert.equal(guard.isBlockedRelativePath(candidate), true);
  }
  assert.equal(guard.isBlockedRelativePath("src/codexpro-txn-normal.ts"), false);
});
```

- [ ] **Step 2: Build and run the focused test to confirm RED**

Run: `npm run build`

Expected: PASS because production types have not yet referenced the new fields.

Run: `node --test test/transaction-config-and-path-policy.test.mjs`

Expected: FAIL because `fileTransactions` and `isReservedTransactionRelativePath` do not exist.

- [ ] **Step 3: Add strict configuration parsing**

Add to `src/config.ts`:

```ts
export type FileTransactionMode = "legacy" | "atomic";

function fileTransactionModeFrom(value: string | undefined): FileTransactionMode {
  const normalized = value?.trim();
  if (!normalized) return "legacy";
  if (normalized === "legacy" || normalized === "atomic") return normalized;
  throw new Error("CODEXPRO_FILE_TRANSACTIONS must be legacy or atomic.");
}
```

Add `fileTransactions: FileTransactionMode` to `CodexProConfig`, parse optional `--file-transactions`, and populate:

```ts
fileTransactions: fileTransactionModeFrom(
  fileTransactionsArg ?? process.env.CODEXPRO_FILE_TRANSACTIONS
),
```

Do not expose the new field through the exact contract V1 `server_config` output in Phase 3A.

- [ ] **Step 4: Fail closed before registering unmigrated public writers**

Add to `src/config.ts`:

```ts
export interface FileTransactionCapabilities {
  workspaceMutatorsAtomic: boolean;
}

export function assertFileTransactionConfiguration(
  config: Pick<CodexProConfig, "fileTransactions" | "writeMode">,
  capabilities: FileTransactionCapabilities
): void {
  if (
    config.fileTransactions === "atomic" &&
    config.writeMode !== "off" &&
    !capabilities.workspaceMutatorsAtomic
  ) {
    throw new Error(
      "CODEXPRO_FILE_TRANSACTIONS=atomic requires transaction-backed workspace mutators; keep CODEXPRO_WRITE_MODE=off until Phase 3C migration is complete."
    );
  }
}
```

At the first executable line of `createCodexProServer(...)`, before constructing a workspace manager or registering any tool, call:

```ts
assertFileTransactionConfiguration(config, {
  workspaceMutatorsAtomic: false
});
```

Phase 3C changes this capability to `true` only after the static mutation-closure gate proves that every supported workspace writer uses the transaction kernel. Phase 3A must not accept an atomic writable server that would silently execute legacy direct writes.

- [ ] **Step 5: Add unconditional reserved-name blocking**

Add to `src/guard.ts`:

```ts
const RESERVED_TRANSACTION_PREFIX = ".codexpro-txn-";

export function isReservedTransactionRelativePath(
  relPath: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const segments = normalizeRelPath(relPath)
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);
  return segments.some((segment) => {
    const compared = platform === "win32" ? segment.toLocaleLowerCase("en-US") : segment;
    return compared.startsWith(RESERVED_TRANSACTION_PREFIX);
  });
}
```

Make `PathGuard.isBlockedRelativePath()` return `true` before glob evaluation when this predicate matches. This rule is not configurable and cannot be removed by an empty `blockedGlobs` fixture.

- [ ] **Step 6: Document the feature flag without claiming migration**

Add to `config.example.env`:

```dotenv
# Phase 3A internal kernel. Keep legacy until every supported workspace writer
# is migrated in Phase 3C; atomic mode never falls back to direct writes.
CODEXPRO_FILE_TRANSACTIONS=legacy
```

- [ ] **Step 7: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-config-and-path-policy.test.mjs test/path-policy.test.mjs test/config-realpath.test.mjs`

Expected: PASS, including existing Windows path-policy behavior and fail-closed server construction for atomic writable mode.

- [ ] **Step 8: Record STEP-265 and review scope**

Append STEP-265 to `docs/memory/archive/phase-3.md` with exact files, commands, results, limitations, rollback, and next step. Update `Memory.md` current state without expanding its historical narrative.

Use `show_changes` restricted to the files in Task 1. Confirm no tool schema, protected Smoke source, credential, staged file, or low-level writer behavior changed. Do not stage or commit.

---

### Task 2: Stable Transaction Types and Strict Manifests

**Files:**
- Create: `src/transactions/types.ts`
- Create: `src/transactions/schemas.ts`
- Create: `src/transactions/index.ts`
- Create: `test/transaction-schema.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Zod strict-object conventions and existing safe opaque identifier patterns.
- Produces: `TransactionError`, `TransactionErrorCode`, `TransactionManifestV1`, `TransactionOperationV1`, `TransactionRequestV1`, `PreparedTransaction`, `PendingTransactionCommit`, `CommittedTransaction`, `TransactionFaultInjector`, and strict parsers.

- [ ] **Step 1: Write failing strict-schema tests**

Create fixtures that parse a minimal valid manifest and reject unknown fields, absolute paths, invalid IDs, unsafe artifact names, negative generations, duplicate operation IDs, file bodies, and credential-shaped extra fields.

Use this valid baseline:

```js
const validManifest = {
  schemaVersion: 1,
  transactionId: "tx_11111111111111111111111111111111",
  changeSetId: "cs_22222222222222222222222222222222",
  workspaceStateKey: "wsk_33333333333333333333333333333333",
  generation: 1,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  state: "prepared",
  operations: [{
    operationId: "op_4444444444444444",
    kind: "replace",
    state: "staged",
    relativePath: "src/example.ts",
    comparisonKey: "src/example.ts",
    stageRelativePath: "src/.codexpro-txn-5555555555555555.stage",
    backupRelativePath: null,
    before: {
      exists: true,
      sha256: "a".repeat(64),
      identity: "fid_666666666666666666666666",
      bytes: 3,
      metadata: { mode: 420, atimeMs: 1, mtimeMs: 2 }
    },
    after: {
      exists: true,
      sha256: "b".repeat(64),
      bytes: 4
    }
  }],
  createdDirectories: [],
  requiredParticipants: [],
  participantFacts: {}
};

assert.deepEqual(transactionManifestV1Schema.parse(validManifest), validManifest);
assert.throws(
  () => transactionManifestV1Schema.parse({ ...validManifest, workspaceRoot: "C:\\secret" }),
  /unrecognized/i
);
```

Also recursively scan `JSON.stringify(parsed)` and assert it contains no `C:\\`, `/home/`, `Authorization`, `Cookie`, `private key`, or content field.

- [ ] **Step 2: Build and run the schema test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-schema.test.mjs`

Expected: FAIL because `dist/transactions/schemas.js` does not exist.

- [ ] **Step 3: Define stable errors and internal API types**

In `src/transactions/types.ts`, define the closed code set:

```ts
export type TransactionErrorCode =
  | "FILE_VERSION_CONFLICT"
  | "TRANSACTION_BUSY"
  | "ATOMIC_BACKEND_UNAVAILABLE"
  | "TRANSACTION_PRECONDITION_FAILED"
  | "TRANSACTION_FAILED"
  | "ROLLBACK_FAILED"
  | "TRANSACTION_RECOVERY_REQUIRED"
  | "TRANSACTION_STATE_CORRUPT";

export class TransactionError extends Error {
  constructor(
    readonly code: TransactionErrorCode,
    message: string,
    readonly safeDetails: Readonly<Record<string, string | number | boolean | null>> = {}
  ) {
    super(message);
    this.name = "TransactionError";
  }
}
```

Define exact byte-oriented requests:

```ts
export type TransactionRequestOperationV1 =
  | {
      operationId: string;
      kind: "create";
      relativePath: string;
      bytes: Buffer;
      expectedAbsent: true;
    }
  | {
      operationId: string;
      kind: "replace";
      relativePath: string;
      bytes: Buffer;
      expectedSha256: string | null;
    }
  | {
      operationId: string;
      kind: "delete";
      relativePath: string;
      expectedSha256: string | null;
    };

export interface TransactionRequestV1 {
  workspace: { id: string; root: string; openedAt: string };
  operations: TransactionRequestOperationV1[];
  requiredParticipants: string[];
}
```

Define all manifest states and operation states explicitly. Use `readonly` return properties and opaque IDs. `PreparedTransaction`, `PendingTransactionCommit`, and `CommittedTransaction` must use the exact method names approved in the Phase 3A specification.

- [ ] **Step 4: Add strict Zod schemas with cross-field validation**

Implement strict schemas for IDs, relative paths, SHA-256, metadata, before/after facts, operations, manifests, installation state, process-instance records, and workspace-lock owner records.

The manifest refinement must enforce:

```ts
const operationIds = value.operations.map((operation) => operation.operationId);
if (new Set(operationIds).size !== operationIds.length) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["operations"],
    message: "Transaction operation IDs must be unique."
  });
}
```

Artifact paths must be relative, remain in the same parent as their logical path, and contain a basename beginning with `.codexpro-txn-`. Schemas must reject `bytes`, `content`, `diff`, `workspaceRoot`, `authorization`, `cookie`, and any unknown field by using `.strict()` throughout.

- [ ] **Step 5: Export only the closed Phase 3A surface**

Create `src/transactions/index.ts` that exports the stable types and schemas needed by tests and later modules. Do not export state-root paths, installation master keys, or unsafe filesystem helpers from this barrel.

- [ ] **Step 6: Build and run the schema tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-schema.test.mjs`

Expected: PASS.

- [ ] **Step 7: Record STEP-266 and review scope**

Append STEP-266 to the Phase 3 archive and update `Memory.md`. Review the three new source files and one test. Confirm the schema accepts no absolute path or file body. Do not stage or commit.

---

### Task 3: State Root, Installation State, and Key Separation

**Files:**
- Create: `src/transactions/stateRoot.ts`
- Create: `src/transactions/installation.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/transaction-installation-state.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Task 2 installation schema and Node `hkdfSync`, `createHmac`, and `randomBytes`.
- Produces: `resolveTransactionStateRoot(options)`, `loadOrCreateInstallationState(options)`, `deriveTransactionSubkey(masterKey, label)`, `workspaceStateKeyForRoot(root, masterKey, platform)`, and safe state-directory helpers.

- [ ] **Step 1: Write failing platform and key tests**

Test state-root resolution without mutating the real user profile:

```js
assert.equal(
  resolveTransactionStateRoot({
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\Noah\\AppData\\Local" },
    homeDir: "C:\\Users\\Noah"
  }),
  path.resolve("C:\\Users\\Noah\\AppData\\Local", "CodexPro", "state", "v1")
);

assert.equal(
  resolveTransactionStateRoot({
    platform: "linux",
    env: { XDG_STATE_HOME: "/tmp/state" },
    homeDir: "/home/noah"
  }),
  path.resolve("/tmp/state", "codexpro", "v1")
);
```

Also assert:

- explicit `CODEXPRO_HOME` resolves to `<home>/state/v1` on every platform;
- two equivalent Windows roots produce the same `wsk_` value;
- a case-distinct Linux path produces a different value;
- different installation keys produce different workspace-state keys;
- `audit`, `workspace-state`, and future `changeset` subkeys differ;
- concurrent exclusive creation yields one valid installation state;
- an invalid master-key length, unknown field, bad installation ID, or malformed JSON fails closed.

- [ ] **Step 2: Build and run the installation test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-installation-state.test.mjs`

Expected: FAIL because state-root and installation modules do not exist.

- [ ] **Step 3: Implement deterministic state-root resolution**

In `stateRoot.ts`, use injected values rather than reading globals inside tests:

```ts
export interface TransactionStateRootOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export function resolveTransactionStateRoot(
  options: TransactionStateRootOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  if (env.CODEXPRO_HOME?.trim()) {
    return path.resolve(expandHomeWith(homeDir, env.CODEXPRO_HOME.trim()), "state", "v1");
  }
  if (platform === "win32") {
    const local = env.LOCALAPPDATA?.trim();
    if (!local) throw new TransactionError(
      "TRANSACTION_PRECONDITION_FAILED",
      "Windows transaction state requires LOCALAPPDATA or CODEXPRO_HOME."
    );
    return path.resolve(local, "CodexPro", "state", "v1");
  }
  const base = env.XDG_STATE_HOME?.trim() || path.join(homeDir, ".local", "state");
  return path.resolve(base, "codexpro", "v1");
}
```

Do not reuse `profileIdForRoot()`: it is an unhashed path-derived identifier and does not meet the Phase 3 state-key requirement.

- [ ] **Step 4: Implement exclusive installation-state creation**

Use an injected synchronous dependency object containing `randomBytes`, `now`, and the required `fs` primitives. The persisted payload is:

```ts
{
  schemaVersion: 1,
  installationId: `install_${randomBytes(16).toString("hex")}`,
  masterKeyBase64: randomBytes(32).toString("base64"),
  createdAt: new Date(now()).toISOString()
}
```

Create the state directory with mode `0o700`, write `installation.json` with `flag: "wx"` and mode `0o600`, call `fsyncSync` on the file, best-effort sync the parent directory, and then validate by rereading through the strict schema. On `EEXIST`, read and validate the winner. Never log or return `masterKeyBase64` through diagnostics.

- [ ] **Step 5: Implement HKDF subkeys and opaque workspace-state keys**

Use exact domain separation:

```ts
export function deriveTransactionSubkey(masterKey: Buffer, label: string): Buffer {
  if (masterKey.length !== 32) throw new TransactionError(
    "TRANSACTION_STATE_CORRUPT",
    "Installation master key has an invalid length."
  );
  return Buffer.from(hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0),
    Buffer.from(`codexpro/phase3/${label}/v1`, "utf8"),
    32
  ));
}

export function workspaceStateKeyForRoot(
  canonicalRoot: string,
  masterKey: Buffer,
  platform: NodeJS.Platform = process.platform
): string {
  const key = deriveTransactionSubkey(masterKey, "workspace-state");
  const normalized = normalizeCanonicalWorkspaceRoot(canonicalRoot, platform);
  const digest = createHmac("sha256", key).update(normalized, "utf8").digest("hex");
  return `wsk_${digest.slice(0, 32)}`;
}
```

Zero temporary derived-key buffers in `finally` blocks where practical. Do not claim this prevents access by an attacker controlling the same OS account.

- [ ] **Step 6: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-installation-state.test.mjs test/policy-identity-context.test.mjs`

Expected: PASS; existing identity-key behavior remains unchanged.

- [ ] **Step 7: Record STEP-267 and review secret shape**

Append STEP-267 and update `Memory.md`. Search the changed source/tests for raw fixture tokens, canonical private roots, and accidental logging of `masterKeyBase64`. Review scope without staging or committing.

---

### Task 4: Atomic Manifest Store

**Files:**
- Create: `src/transactions/atomicStateFile.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/transaction-manifest-store.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Task 2 strict manifest schema and Task 3 state-root helpers.
- Produces: `AtomicJsonFileStore<T>`, `TransactionManifestStore`, `manifestPathFor(workspaceStateKey, transactionId)`, generation-monotonic writes, and safe manifest enumeration.

- [ ] **Step 1: Write failing manifest durability tests**

Test an injected filesystem wrapper that records operation order. Require this sequence for a replacement write:

```js
assert.deepEqual(recordedOperations, [
  "mkdir-parent",
  "open-temp-wx",
  "write-temp",
  "fsync-temp",
  "close-temp",
  "rename-temp-over-target",
  "sync-parent-attempt"
]);
```

Also test:

- temporary names are random siblings below the state root;
- writes outside the configured state root are rejected;
- a generation must increase by exactly one;
- invalid existing JSON or a schema mismatch returns `TRANSACTION_STATE_CORRUPT`;
- write/rename/fsync failures leave the last valid manifest readable;
- stale temporary files are never interpreted as committed manifests;
- enumeration returns only strict `.json` transaction manifests for the selected opaque workspace-state key.

- [ ] **Step 2: Build and run the manifest test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-manifest-store.test.mjs`

Expected: FAIL because the atomic state writer does not exist.

- [ ] **Step 3: Implement a root-confined atomic JSON writer**

Define:

```ts
export class AtomicJsonFileStore<T> {
  constructor(
    private readonly stateRoot: string,
    private readonly schema: z.ZodType<T>,
    private readonly dependencies: AtomicStateDependencies = defaultAtomicStateDependencies
  ) {}

  read(filePath: string): T;
  write(filePath: string, value: T): void;
}
```

`write()` must:

1. parse the payload through the strict schema;
2. verify `filePath` remains below `stateRoot` by native `path.relative` containment;
3. serialize as UTF-8 JSON with one trailing newline;
4. create a random sibling with `wx` and mode `0o600`;
5. write all bytes and call `fsyncSync`;
6. close before rename;
7. call `renameSync(temp, filePath)`;
8. attempt parent-directory sync and return its capability fact;
9. remove only its own validated temporary file on failure.

Do not unlink the current valid target before rename. If atomic replacement is unavailable, map the failure to `TRANSACTION_STATE_CORRUPT` or `TRANSACTION_FAILED` according to whether a valid previous manifest remains.

- [ ] **Step 4: Implement transaction-specific generation checks**

`TransactionManifestStore.writeNext(previous, next)` must verify:

```ts
if (next.transactionId !== previous.transactionId ||
    next.changeSetId !== previous.changeSetId ||
    next.workspaceStateKey !== previous.workspaceStateKey ||
    next.generation !== previous.generation + 1) {
  throw new TransactionError(
    "TRANSACTION_STATE_CORRUPT",
    "Transaction manifest transition is not monotonic."
  );
}
```

For initial writes require `generation === 1` and `state === "preparing"`. Enumerate by opaque workspace-state-key directory and validate every candidate before returning it.

- [ ] **Step 5: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-manifest-store.test.mjs test/transaction-schema.test.mjs`

Expected: PASS.

- [ ] **Step 6: Record STEP-268 and review state confinement**

Append STEP-268 and update `Memory.md`. Confirm all application-state writes are confined below the injected state root, use exclusive temporary creation, and preserve the last valid manifest on injected failure. Do not stage or commit.

---

### Task 5: Conservative Cross-process Workspace Lock

**Files:**
- Create: `src/transactions/workspaceLock.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/transaction-workspace-lock.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Task 2 lock/process schemas, Task 3 state-root paths, Task 4 atomic state writer.
- Produces: `ProcessInstanceRegistry`, `WorkspaceMutationLock.acquire(input)`, `WorkspaceLockHandle.release()`, and `ProcessLiveness = "alive" | "dead" | "unknown"`.

- [ ] **Step 1: Write failing lock protocol tests**

Use injected `mkdirSync`, `renameSync`, `kill`, clock, and random bytes. Assert:

```js
const first = lock.acquire({
  workspaceStateKey: "wsk_" + "1".repeat(32),
  transactionId: "tx_" + "2".repeat(32)
});
assert.throws(
  () => secondLock.acquire({
    workspaceStateKey: "wsk_" + "1".repeat(32),
    transactionId: "tx_" + "3".repeat(32)
  }),
  (error) => error.code === "TRANSACTION_BUSY"
);
first.release();
```

Cover:

- distinct workspaces can lock concurrently;
- a live owner returns `TRANSACTION_BUSY`;
- `EPERM` or other uncertain liveness is `unknown` and remains busy;
- a dead owner lock is atomically renamed to a random recovery directory before claim;
- malformed owner data returns `TRANSACTION_STATE_CORRUPT` and is not deleted;
- PID reuse conservatively remains busy when the current PID is alive but the old instance token cannot be verified;
- release requires the exact random ownership token and never removes another owner's directory;
- process-instance records contain no workspace root or credential.

- [ ] **Step 2: Build and run the lock test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-workspace-lock.test.mjs`

Expected: FAIL because the lock module does not exist.

- [ ] **Step 3: Implement process-instance registration**

Create one process-local registry record:

```ts
interface ProcessInstanceRecordV1 {
  schemaVersion: 1;
  instanceId: string;
  pid: number;
  createdAt: string;
}
```

Use `instance_<32 hex>` and write it exclusively below `state/v1/instances/`. Register best-effort cleanup on normal disposal, but correctness must not depend on exit handlers.

Implement liveness:

```ts
export function classifyProcessLiveness(pid: number): ProcessLiveness {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (isNodeError(error, "ESRCH")) return "dead";
    return "unknown";
  }
}
```

- [ ] **Step 4: Implement atomic lock-directory ownership**

Acquire by `mkdirSync(lockDir)` without `recursive`. Write a strict owner record containing schema version, random token, instance ID, PID, transaction ID, and creation time. If `EEXIST`, read the owner and classify it.

For a dead owner, claim with:

```ts
const recoveryDir = `${lockDir}.recovery-${randomBytes(8).toString("hex")}`;
fs.renameSync(lockDir, recoveryDir);
```

Only the process that successfully renamed the stale directory may inspect/recover it and retry acquisition. A competing rename failure restarts bounded acquisition or returns busy; it never recursively deletes a path it did not claim.

- [ ] **Step 5: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-workspace-lock.test.mjs`

Expected: PASS.

- [ ] **Step 6: Record STEP-269 and review contention behavior**

Append STEP-269 and update `Memory.md`. Confirm uncertain liveness never deletes a lock, ownership tokens are required for release, and no raw path appears in owner records. Do not stage or commit.

---

### Task 6: Atomic Filesystem Primitives

**Files:**
- Create: `src/transactions/atomicFs.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/transaction-atomic-fs.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: `PathGuard`, Task 2 operation facts, reserved-name rule, and Node async filesystem APIs.
- Produces: `AtomicWorkspaceFs.inspect()`, `stageCreate()`, `stageReplace()`, `stageDelete()`, `install()`, `rollback()`, `finalize()`, `verifyHardLinkBackend()`, and exact byte/identity/metadata facts.

- [ ] **Step 1: Write failing byte, backend, and primitive tests**

Use real temporary directories plus an injected fault adapter. Cover:

- SHA-256 is over exact bytes, including UTF-8 BOM and CRLF;
- ordinary files pass; directories, symbolic links, junction escapes, reserved artifacts, blocked files, and outside-root targets fail;
- Windows comparison accepts canonical case equivalence but rejects realpath redirection;
- stage files are unpredictable siblings with exclusive creation;
- stage bytes are fully written, reread/hashed, and synced before `staged` is returned;
- replacement creates a verified hard-link backup before replacing the target;
- new-file install uses hard-link creation and fails if a target appeared concurrently;
- guarded delete creates a hard-link backup before unlink;
- replacement rollback restores exact old bytes;
- creation rollback removes only the exact installed identity/hash;
- delete rollback no-clobber restores from backup;
- finalize removes only validated transaction artifacts;
- source and destination `stat.dev` mismatch returns `ATOMIC_BACKEND_UNAVAILABLE`;
- injected `link` unsupported errors map to `ATOMIC_BACKEND_UNAVAILABLE` rather than direct write.

A core assertion for no-clobber create is:

```js
await fs.writeFile(target, "external", "utf8");
await assert.rejects(
  atomicFs.install(preparedCreate),
  (error) => error.code === "FILE_VERSION_CONFLICT"
);
assert.equal(await fs.readFile(target, "utf8"), "external");
```

- [ ] **Step 2: Build and run the atomic-fs test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-atomic-fs.test.mjs`

Expected: FAIL because `AtomicWorkspaceFs` does not exist.

- [ ] **Step 3: Implement exact inspection and identity facts**

Use `lstat` with bigint support and exact bytes:

```ts
function fileIdentity(stat: BigIntStats): string {
  const payload = `${stat.dev.toString()}\0${stat.ino.toString()}\0${stat.size.toString()}\0${stat.mtimeNs.toString()}`;
  return `fid_${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24)}`;
}
```

`inspect(relativePath)` must:

1. resolve with `PathGuard.resolvePolicyFacts(..., { forWrite: true })`;
2. reject reserved paths and blocked paths;
3. compare native `realpath` with the resolved logical path using platform semantics;
4. require `lstat.isFile()` and reject symbolic links;
5. read bounded exact bytes and calculate SHA-256;
6. capture `mode`, `atimeMs`, and `mtimeMs`.

For an absent target, return the existing-parent identity and volume device number without inventing file facts.

- [ ] **Step 4: Implement stage and backup primitives**

Generate sibling paths using independent 8-byte random suffixes:

```ts
function reservedSibling(targetAbsPath: string, kind: "stage" | "backup" | "move", random: Buffer): string {
  return path.join(
    path.dirname(targetAbsPath),
    `.codexpro-txn-${random.toString("hex")}.${kind}`
  );
}
```

For create/replace staging:

- open stage with `wx` and mode `0o600`;
- write all bytes in a loop;
- apply captured replacement mode when supported;
- `FileHandle.sync()` and close;
- reread and verify the after SHA-256.

For replace/delete backup:

- create a hard link from target to backup;
- verify target and backup identity/hash match;
- do not copy bytes to the application-state directory.

- [ ] **Step 5: Implement visible install, rollback, and finalize**

Visible operations:

```text
create  → link(stage, target)
replace → rename(stage, target)
delete  → unlink(target)
```

Immediately before each visible operation rerun path containment, target existence, identity, and SHA-256 checks. Map any mismatch to `FILE_VERSION_CONFLICT`.

Rollback rules:

- create: unlink target only when its identity/hash equals the installed facts;
- replace: rename or relink the verified backup over the exact installed target, then restore supported metadata;
- delete: hard-link backup to absent target; never replace an external occupant;
- any uncertain occupant or identity mismatch returns `ROLLBACK_FAILED` and leaves evidence intact.

Finalize removes only stage/backup names whose reserved path, expected identity, and manifest operation match. Attempt directory sync and record `supported`, `unsupported`, or `failed`; required file sync failure aborts, while unsupported directory sync limits the durability claim.

- [ ] **Step 6: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-atomic-fs.test.mjs test/path-policy.test.mjs`

Expected: PASS, with platform-conditional junction tests retaining their established skip behavior.

- [ ] **Step 7: Record STEP-270 and review low-level primitives**

Append STEP-270 and update `Memory.md`. Inspect every new low-level `write`, `link`, `rename`, and `unlink` call and confirm it belongs to the transaction backend, uses reserved paths where applicable, and has a matching failure test. Do not stage or commit.

---

### Task 7: Transaction Engine and Participant Gate

**Files:**
- Create: `src/transactions/engine.ts`
- Modify: `src/transactions/index.ts`
- Create: `test/transaction-engine.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: Tasks 3–6 installation/state key, manifest store, lock, and atomic filesystem primitives.
- Produces: `AtomicTransactionEngine.prepare(request)`, `PreparedTransaction.commit()`, `PendingTransactionCommit.commitParticipant()`, `finalize()`, `rollback()`, and deterministic fault points.

- [ ] **Step 1: Write failing state-machine and rollback tests**

Create a three-operation transaction: replace `a.txt`, create `b.txt`, and delete `c.txt`. Assert:

```js
const prepared = await engine.prepare({
  workspace,
  requiredParticipants: ["audit"],
  operations: [
    { operationId: "op_replace_a", kind: "replace", relativePath: "a.txt", bytes: Buffer.from("new-a"), expectedSha256: sha256("old-a") },
    { operationId: "op_create_b", kind: "create", relativePath: "b.txt", bytes: Buffer.from("new-b"), expectedAbsent: true },
    { operationId: "op_delete_c", kind: "delete", relativePath: "c.txt", expectedSha256: sha256("old-c") }
  ]
});
const pending = await prepared.commit();
await assert.rejects(() => pending.finalize(), /participant/i);
await pending.commitParticipant("audit", async () => {});
const committed = await pending.finalize();
assert.match(committed.changeSetId, /^cs_[a-f0-9]{32}$/);
```

Cover every transition:

```text
preparing → prepared → committing → committed_pending_participants → committed
preparing/prepared/committing/participant failure → rolling_back → rolled_back
rollback uncertainty → recovery_required
```

Also test:

- duplicate comparison-equivalent paths reject before manifest creation;
- operations are installed in deterministic comparison-key order;
- all operations stage before any visible mutation;
- expected-hash drift before installation returns `FILE_VERSION_CONFLICT` and restores/cleans all artifacts;
- failure after operation 1 or 2 restores the complete before-state;
- participant failure triggers rollback while backups remain available;
- unknown, duplicate, or late participant commits reject;
- finalize before all participants rejects;
- committed cleanup failure leaves a committed manifest for later idempotent cleanup rather than rolling back an acknowledged commit;
- all public errors contain only relative paths, counts, and opaque IDs.

- [ ] **Step 2: Build and run the engine test to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-engine.test.mjs`

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement injected IDs, clock, and fault points**

Define the closed fault-point union in `types.ts`:

```ts
export type TransactionFaultPoint =
  | "after_manifest_preparing"
  | "after_each_stage"
  | "after_manifest_prepared"
  | "after_manifest_committing"
  | "after_each_install"
  | "after_manifest_pending_participants"
  | "after_each_participant"
  | "after_manifest_committed"
  | "during_each_rollback"
  | "during_each_finalize";

export interface TransactionFaultInjector {
  hit(point: TransactionFaultPoint, facts: Readonly<Record<string, string | number>>): void | Promise<void>;
}
```

The production default is a no-op object passed through the constructor. Do not add hidden MCP inputs or process-global mutable test hooks.

- [ ] **Step 4: Implement preparation**

`prepare()` must:

1. validate request bounds and unique operation IDs/paths;
2. load installation state and derive `workspaceStateKey`;
3. acquire the workspace lock;
4. invoke recovery for that workspace before a new manifest;
5. allocate opaque transaction/change-set IDs;
6. inspect every operation and validate caller preconditions;
7. write generation 1 `preparing` manifest;
8. stage every operation and write a new generation after each rollback-critical fact;
9. write `prepared` and return a `PreparedTransaction` that owns the lock.

Any preparation failure must clean validated stage artifacts, persist `rolled_back` when a manifest exists, release the lock, and preserve evidence if cleanup is uncertain.

- [ ] **Step 5: Implement visible commit and participant gate**

`PreparedTransaction.commit()` writes `committing`, installs operations in deterministic order, persists every `installed` transition, then writes `committed_pending_participants` and returns a `PendingTransactionCommit` while retaining the lock and backup artifacts.

`commitParticipant(name, action)` must:

- require the name in `requiredParticipants`;
- reject repeated commit;
- await the action;
- persist `participantFacts[name] = "committed"` only after success;
- on action failure persist `failed`, synchronously roll back, and throw `TRANSACTION_FAILED` or `ROLLBACK_FAILED`.

- [ ] **Step 6: Implement finalize and rollback**

`finalize()` verifies every required participant is committed, persists `committed`, finalizes all artifacts, releases the lock, and returns:

```ts
{
  transactionId,
  changeSetId,
  committedAt,
  operationCount,
  cleanupPending
}
```

If cleanup fails after durable `committed`, set `cleanupPending: true`, retain the manifest, release only when ownership is still proven, and let recovery finish cleanup. Do not reverse a durable committed transaction.

Rollback must reverse installed operations in reverse deterministic order, verify the complete before-state, remove only transaction-created empty directories, persist `rolled_back`, and release. A failed proof persists `recovery_required`, retains the lock/recovery evidence when safe, and throws `ROLLBACK_FAILED`.

- [ ] **Step 7: Build and run focused tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-engine.test.mjs test/transaction-atomic-fs.test.mjs test/transaction-workspace-lock.test.mjs`

Expected: PASS.

- [ ] **Step 8: Record STEP-271 and review state coverage**

Append STEP-271 and update `Memory.md`. Verify every state and fault point has a test and every returned failure is stable and redacted. Do not stage or commit.

---

### Task 8: Crash Recovery and Workspace Readiness Hook

**Files:**
- Create: `src/transactions/recovery.ts`
- Modify: `src/transactions/engine.ts`
- Modify: `src/transactions/index.ts`
- Modify: `src/guard.ts:133-175, 177-287`
- Modify: `src/server.ts` at the server dependency type and session-local `WorkspaceManager` construction
- Create: `test/transaction-recovery.test.mjs`
- Create: `test/transaction-crash-recovery.test.mjs`
- Create: `test/fixtures/transaction-crash-child.mjs`
- Modify: `test/workspace-lifecycle.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-3.md`

**Interfaces:**
- Consumes: strict manifests, state root/key, lock protocol, atomic filesystem rollback/finalize primitives, and the Task 1 atomic/read-only startup guard.
- Produces: `TransactionRecoveryCoordinator.ensureWorkspaceReady(root)`, `createDefaultTransactionRecoveryCoordinator(config)`, `recoverManifest()`, `WorkspaceManagerOptions.beforeWorkspaceUse`, optional `CodexProServerDependencies.transactionRecoveryCoordinator`, and fail-closed workspace freezing.

- [ ] **Step 1: Write failing deterministic recovery tests**

Build manifests and real file states for:

- `preparing` with no visible change;
- `prepared` with stage/backup artifacts only;
- `committing` after one of three installs;
- `committed_pending_participants` after all installs;
- `rolling_back` after partial restoration;
- `committed` with cleanup artifacts;
- `recovery_required` with a safely recoverable state;
- invalid manifest, missing backup, unexpected occupant, and identity/hash mismatch.

Expected recovery rules:

```js
assert.equal(recover("prepared").action, "rollback_cleanup");
assert.equal(recover("committing").action, "restore_before_state");
assert.equal(recover("committed_pending_participants").action, "restore_before_state");
assert.equal(recover("committed").action, "finish_cleanup");
```

Assert invalid or unprovable states throw `TRANSACTION_RECOVERY_REQUIRED` and mark the workspace frozen without deleting evidence.

- [ ] **Step 2: Add failing workspace-lifecycle hook tests**

Extend `test/workspace-lifecycle.test.mjs`:

```js
const uses = [];
const manager = new WorkspaceManager(config, {
  beforeWorkspaceUse: (root) => uses.push(root)
});
const opened = manager.openWorkspace(root);
manager.getWorkspace(opened.id);
assert.deepEqual(uses, [root, root]);
```

Also inject a hook that throws `TRANSACTION_RECOVERY_REQUIRED` and assert `openWorkspace()` does not issue a handle and `getWorkspace()` does not refresh an existing handle.

Extend the existing in-memory helper so server dependencies can be injected:

```js
async function createServerClient(config, dependencies = {}) {
  const server = createCodexProServer(config, dependencies);
  const client = new Client({ name: "workspace-lifecycle-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => Promise.allSettled([client.close(), server.close()])
  };
}
```

Add an actual production-wiring test:

```js
test("atomic read-only server recovers before issuing a workspace handle", async () => {
  await withTempWorkspace(async (root) => {
    const recovered = [];
    const connection = await createServerClient(
      serverConfigFor(root, { writeMode: "off", fileTransactions: "atomic" }),
      {
        transactionRecoveryCoordinator: {
          ensureWorkspaceReady(canonicalRoot) {
            recovered.push(canonicalRoot);
          }
        }
      }
    );
    try {
      const opened = structured(await connection.client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }));
      assert.equal(opened.ok, true);
      assert.deepEqual(recovered, [root]);
    } finally {
      await connection.close();
    }
  });
});
```

Add a companion legacy-mode assertion that an injected coordinator is not called when `fileTransactions: "legacy"`, preserving existing behavior.

- [ ] **Step 3: Build and run recovery tests to confirm RED**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-recovery.test.mjs test/workspace-lifecycle.test.mjs`

Expected: FAIL because recovery and the readiness hook do not exist.

- [ ] **Step 4: Implement synchronous idempotent recovery**

`TransactionRecoveryCoordinator.ensureWorkspaceReady(canonicalRoot)` must:

1. load/validate installation state;
2. derive the opaque workspace-state key;
3. acquire or conservatively claim the workspace lock;
4. enumerate and validate manifests for that key;
5. process manifests oldest-first by creation time and transaction ID;
6. restore before-state for `preparing`, `prepared`, `committing`, `committed_pending_participants`, and `rolling_back`;
7. finish cleanup only for `committed`;
8. retry `recovery_required` only when every required artifact/identity/hash can be proven;
9. persist terminal recovery state and retain bounded diagnostic evidence;
10. release the lock only when ownership remains proven.

Use synchronous control-plane and recovery filesystem operations so it can run from `WorkspaceManager` without changing the public synchronous lifecycle API. Reuse the same manifest validation and identity/hash rules as the async backend; do not implement looser recovery-only path rules.

Export `createDefaultTransactionRecoveryCoordinator(config)` to resolve the state root, load the installation state, construct the manifest/lock/filesystem dependencies, and return one coordinator. It must not open or mutate a workspace during construction; recovery begins only when `ensureWorkspaceReady(canonicalRoot)` is called.

- [ ] **Step 5: Add the readiness hook to WorkspaceManager**

Extend options:

```ts
export interface WorkspaceManagerOptions {
  transportSessionId?: () => string;
  identityBinding?: string;
  policyRevision?: () => string | null | undefined;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  maxTombstones?: number;
  beforeWorkspaceUse?: (canonicalRoot: string) => void;
}
```

Store a no-op default. Call it:

- after canonicalization and allowed-root validation but before issuing/reusing a workspace handle in `openWorkspace()`;
- after record/session/policy validation but before `touch()` in `getWorkspace()`.

A thrown recovery error propagates without creating or refreshing a handle. Existing behavior remains unchanged when no hook is injected.

- [ ] **Step 6: Wire recovery into the allowed production atomic configuration**

Extend the internal server dependency type:

```ts
export interface CodexProServerDependencies {
  policySessionContextSource?: PolicySessionContextSource;
  transactionRecoveryCoordinator?: Pick<
    TransactionRecoveryCoordinator,
    "ensureWorkspaceReady"
  >;
}
```

After the Task 1 configuration assertion and before `WorkspaceManager` construction, select the coordinator only for atomic mode:

```ts
const transactionRecovery = config.fileTransactions === "atomic"
  ? dependencies.transactionRecoveryCoordinator ??
    createDefaultTransactionRecoveryCoordinator(config)
  : undefined;
```

Pass the hook into the existing session-local manager binding:

```ts
const workspaces = new WorkspaceManager(config, {
  ...workspaceBindingForServer(dependencies.policySessionContextSource),
  beforeWorkspaceUse: transactionRecovery
    ? (canonicalRoot) => transactionRecovery.ensureWorkspaceReady(canonicalRoot)
    : undefined
});
```

The Task 1 guard means this production path is read-only in Phase 3A: `atomic` can start only with `writeMode: "off"`. Legacy mode does not construct or invoke the coordinator. Phase 3C changes the mutator capability to true after all writers migrate; it does not need to redesign the readiness boundary.

- [ ] **Step 7: Add child-process crash fixtures**

`test/fixtures/transaction-crash-child.mjs` accepts only temporary paths and a closed fault-point name from environment variables created by the parent test. It:

1. creates a transaction engine with the selected fault injector;
2. performs a three-file transaction;
3. calls `process.exit(91)` at the selected fault point without cleanup.

The parent `test/transaction-crash-recovery.test.mjs` spawns a fresh Node process for each visible boundary, asserts exit code 91, creates a recovery coordinator, calls `ensureWorkspaceReady(root)`, and verifies the complete before-state with no visible `.codexpro-txn-*` artifacts.

Pass only paths created by the parent test inside its disposable fixture root. Do not pass file contents, credentials, real user state directories, or unrelated user-profile paths through child arguments or environment.

- [ ] **Step 8: Build and run recovery and crash tests to confirm GREEN**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-recovery.test.mjs test/transaction-crash-recovery.test.mjs test/workspace-lifecycle.test.mjs`

Expected: PASS. Platform-specific symbolic-link/junction setup may use only the established capability skips; transaction state/rollback assertions must not be skipped on native Windows.

- [ ] **Step 9: Record STEP-272 and review freeze behavior**

Append STEP-272 and update `Memory.md`. Confirm recovery runs before handle issue/refresh when injected, invalid state freezes the workspace, and no test cleanup erases failed recovery evidence before assertions. Do not stage or commit.

---

### Task 9: Phase 3A Reconciliation and Acceptance Gate

**Files:**
- Modify: `src/transactions/index.ts`
- Modify: `config.example.env`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Modify: `docs/memory/archive/phase-3.md`
- Modify: `CHANGELOG.md`
- Modify: `SECURITY.md` only for accurate internal-kernel limitations; do not claim public atomic mutators yet.
- Test: all Phase 3A tests and existing repository suites.

**Interfaces:**
- Consumes: Tasks 1–8 complete internal kernel.
- Produces: one reviewed Phase 3A implementation boundary ready for the separate Phase 3B design-to-plan transition, with no public mutator migration and no misleading atomic-mode claim.

- [ ] **Step 1: Add a static transaction-boundary contract test**

Create or extend `test/transaction-architecture.test.mjs` to assert:

- `src/transactions/index.ts` exports the intended closed internal API;
- no transaction module imports `gitOps`, `bashOps`, PowerShell, Worktree, or network modules;
- reserved artifact prefix appears in the unconditional `PathGuard` rule;
- transaction manifests contain no `workspaceRoot`, `content`, `diff`, `authorization`, `cookie`, or key-material field;
- `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged by checking the established protected-source contract;
- no public tool schema or canonical V1 tool count changed.

Use exact file names and AST-safe bounded source checks rather than searching the entire user filesystem.

- [ ] **Step 2: Run all Phase 3A focused tests**

Run: `npm run build`

Expected: PASS.

Run: `node --test test/transaction-config-and-path-policy.test.mjs test/transaction-schema.test.mjs test/transaction-installation-state.test.mjs test/transaction-manifest-store.test.mjs test/transaction-workspace-lock.test.mjs test/transaction-atomic-fs.test.mjs test/transaction-engine.test.mjs test/transaction-recovery.test.mjs test/transaction-crash-recovery.test.mjs test/transaction-architecture.test.mjs`

Expected: PASS with zero failure and only explicit pre-existing platform capability skips.

- [ ] **Step 3: Run adjacent security and lifecycle regression**

Run: `node --test test/path-policy.test.mjs test/config-realpath.test.mjs test/workspace-lifecycle.test.mjs test/policy-resources.test.mjs test/policy-enforcement-audit.test.mjs test/package-contents.test.mjs`

Expected: PASS with exact existing public contracts and package exclusions preserved.

- [ ] **Step 4: Run the complete local gate**

Run: `node --test test/*.test.mjs`

Expected: all tests pass except established platform-conditional skips.

Run: `npm run build`

Expected: PASS.

Run: `npm run smoke`

Expected: all eight Smoke sections pass; protected source remains unchanged.

Run: `npm run stress`

Expected: native-Windows Stress passes, including the existing established POSIX-only filename skip.

Run: `npm pack --dry-run`

Expected: PASS; internal specs, plans, memory archives, test fixtures, installation keys, manifests, and transaction state are not packaged as user state.

Run: `git diff --check`

Expected: PASS; Windows LF/CRLF working-copy warnings may be recorded separately but no whitespace error is permitted.

- [ ] **Step 5: Perform static security and scope review**

Use targeted `search` and `show_changes` to verify:

- every `.codexpro-txn-*` path is blocked publicly;
- no canonical workspace root is persisted in transaction state;
- no file body, complete diff, credential, token, Cookie, private key, or `.env` content appears in manifests/log fixtures;
- all hard-link-unavailable branches fail closed;
- all rollback uncertainty branches produce `ROLLBACK_FAILED` or `TRANSACTION_RECOVERY_REQUIRED`;
- no production workspace writer has been silently migrated or claimed atomic in Phase 3A;
- only intended Phase 3A source, tests, configuration example, documentation, Memory, and archive files changed;
- nothing is staged.

- [ ] **Step 6: Reconcile active documentation accurately**

Update `AGENTS.md`, the master plan, `CHANGELOG.md`, and `SECURITY.md` with these exact facts:

- Phase 3A internal kernel exists and has passed its local gate;
- default file transaction mode remains `legacy`;
- existing public mutators are not yet migrated and must not be described as atomic;
- hard-link backend availability is a requirement, not a fallback trigger;
- multi-file crash recovery occurs before workspace reuse when the readiness guard is connected;
- external processes remain outside the lock;
- Phase 3B persistent audit is still the next independent implementation slice.

Keep `Memory.md` below 150 lines and 18 KB when practical.

- [ ] **Step 7: Record STEP-273 and stop before Git writes**

Append STEP-273 with exact focused/full test counts, Build, Smoke, Stress, package contents, scope, limitations, and rollback. Update `Memory.md` stopping point to “Phase 3A locally implemented and verified; publication and Phase 3B remain pending.”

Run a final `show_changes` with diff stats. Do not stage, commit, push, create a release, change policy defaults, or start Phase 3B.

## Plan Self-review Checklist

Before execution begins, verify:

- Every Phase 3A specification requirement maps to Tasks 1–9.
- The transaction IDs, state names, operation states, method signatures, and error codes are consistent across tasks.
- The synchronous readiness hook does not change existing workspace behavior unless injected.
- Contract V1 remains exact and the canonical public tool set remains 28.
- Atomic mode cannot be represented as connected to public mutators in Phase 3A documentation.
- Every low-level filesystem operation has a focused fault or conflict test.
- Every task ends with a local review and memory/archive update, not a Git write.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathGuard } from "../dist/guard.js";
import {
  ChangeSetStore,
  changeSetBlobPathFor,
  changeSetDirectoryFor
} from "../dist/changesets/index.js";
import {
  createDirectUndoChangeSetAdapterV2,
  createSupertoolUndoChangeSetAdapterV2,
  deriveChangeSetOwnerBinding,
  UndoChangeSetError,
  UndoChangeSetService
} from "../dist/changesets/undo.js";
import {
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation
} from "../dist/mutations/index.js";
import { ApprovalPolicyV1 } from "../dist/policy/approval.js";
import { evaluateHardPolicy } from "../dist/policy/hardPolicy.js";
import { installPolicyKernel } from "../dist/policy/integration.js";
import {
  describeFilesystemBatchResource
} from "../dist/policy/resources.js";
import {
  resourceDescriptorV1Schema
} from "../dist/policy/schemas.js";
import { toolPolicyDefinition } from "../dist/policy/toolPolicy.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry,
  TransactionManifestStore
} from "../dist/transactions/index.js";
import {
  undoChangeSetInputV2Schema,
  undoChangeSetOutputSchema
} from "../dist/tools/schemas/undoChangeSet.js";
import {
  undoChangeSetInputSchemaV2,
  undoChangeSetOutputSchemaV2
} from "../dist/tools/schemas/codexgpt.js";

const OWNER_KEY = Buffer.alloc(32, 0x41);
const OWNER = `owner_${"5".repeat(64)}`;
const FOREIGN_OWNER = `owner_${"6".repeat(64)}`;
const NOW = Date.parse("2026-07-15T03:00:00.000Z");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function identity(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "shared_secret_bearer",
    authenticationMode: "bearer",
    credentialRef: "cred_fixture",
    subject: null,
    scopes: ["filesystem:write"],
    assuranceLevel: "shared_secret",
    ...overrides
  };
}

function source(overrides = {}) {
  return {
    transportKind: "streamable_http",
    transportSessionId: () => "session_fixture",
    identity: identity(),
    ...overrides
  };
}

test("owner binding is keyed and prioritizes subject then credential then transport session", () => {
  const subjectA = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_a",
    identity: identity({ subject: "subject_one", credentialRef: "cred_a" })
  }), OWNER_KEY);
  const subjectB = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_b",
    identity: identity({ subject: "subject_one", credentialRef: "cred_b" })
  }), OWNER_KEY);
  assert.equal(subjectA, subjectB);

  const credentialA = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_a",
    identity: identity({ subject: null, credentialRef: "cred_same" })
  }), OWNER_KEY);
  const credentialB = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_b",
    identity: identity({ subject: null, credentialRef: "cred_same" })
  }), OWNER_KEY);
  assert.equal(credentialA, credentialB);
  assert.notEqual(subjectA, credentialA);

  const sessionA = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_only_a",
    identity: identity({ subject: null, credentialRef: null })
  }), OWNER_KEY);
  const sessionB = deriveChangeSetOwnerBinding(source({
    transportSessionId: () => "session_only_b",
    identity: identity({ subject: null, credentialRef: null })
  }), OWNER_KEY);
  assert.notEqual(sessionA, sessionB);
  for (const binding of [subjectA, credentialA, sessionA]) {
    assert.match(binding, /^owner_[a-f0-9]{64}$/);
    assert.equal(binding.includes("subject_one"), false);
    assert.equal(binding.includes("cred_same"), false);
    assert.equal(binding.includes("session_only_a"), false);
  }
  assert.throws(
    () => deriveChangeSetOwnerBinding(source({
      transportSessionId: () => "pending",
      identity: identity({ subject: null, credentialRef: null })
    }), OWNER_KEY),
    /owner identity.*unavailable/i
  );
});

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-undo-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = {
    id: "ws_undo_fixture",
    root: workspaceRoot,
    openedAt: "2026-07-15T02:00:00.000Z"
  };
  const config = {
    blockedGlobs: options.blockedGlobs ?? [],
    maxWriteBytes: 1024 * 1024
  };
  const guard = new PathGuard(config);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, options.engine ?? {});
  const masterKey = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
  const store = new ChangeSetStore({ stateRoot, masterKey, now: () => NOW });
  const service = new UndoChangeSetService({
    engine,
    changeSetStore: store,
    guard,
    now: () => NOW
  });
  try {
    return await action({
      root,
      stateRoot,
      workspaceRoot,
      workspace,
      guard,
      registry,
      engine,
      store,
      service
    });
  } finally {
    store.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function originalManifest(engine, workspace, overrides = {}) {
  const changeSetId = overrides.changeSetId ?? `cs_${"1".repeat(32)}`;
  const transactionId = overrides.transactionId ?? `tx_${"2".repeat(32)}`;
  const createdAt = overrides.createdAt ?? "2026-07-15T02:00:00.000Z";
  const operations = overrides.operations ?? [
    {
      operationId: "op_create_a",
      kind: "create",
      relativePath: "created.txt",
      destinationRelativePath: null,
      before: { exists: false, sha256: null, bytes: 0, metadata: null },
      after: { exists: true, sha256: digest("created-new"), bytes: 11 },
      blobId: null
    },
    {
      operationId: "op_replace_b",
      kind: "replace",
      relativePath: "replaced.txt",
      destinationRelativePath: null,
      before: {
        exists: true,
        sha256: digest("replace-old"),
        bytes: 11,
        metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
      },
      after: { exists: true, sha256: digest("replace-new"), bytes: 11 },
      blobId: `blob_${"3".repeat(32)}`
    },
    {
      operationId: "op_delete_c",
      kind: "delete",
      relativePath: "deleted.txt",
      destinationRelativePath: null,
      before: {
        exists: true,
        sha256: digest("delete-old"),
        bytes: 10,
        metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
      },
      after: { exists: false, sha256: null, bytes: 0 },
      blobId: `blob_${"4".repeat(32)}`
    },
    {
      operationId: "op_append_d",
      kind: "replace",
      relativePath: "appended.txt",
      destinationRelativePath: null,
      before: {
        exists: true,
        sha256: digest("append-old"),
        bytes: 10,
        metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
      },
      after: { exists: true, sha256: digest("append-old+new"), bytes: 14 },
      blobId: `blob_${"7".repeat(32)}`
    }
  ];
  const blobBytes = new Map([
    [`blob_${"3".repeat(32)}`, Buffer.from("replace-old")],
    [`blob_${"4".repeat(32)}`, Buffer.from("delete-old")],
    [`blob_${"7".repeat(32)}`, Buffer.from("append-old")]
  ]);
  const blobs = operations.flatMap((operation) => {
    if (!operation.blobId) return [];
    const plaintext = blobBytes.get(operation.blobId);
    return [{
      blobId: operation.blobId,
      operationId: operation.operationId,
      beforeSha256: operation.before.sha256,
      plaintext: Buffer.from(plaintext)
    }];
  });
  const plaintextBytes = blobs.reduce((total, blob) => total + blob.plaintext.length, 0);
  return {
    manifest: {
      schemaVersion: 1,
      changeSetId,
      transactionId,
      workspaceStateKey: engine.workspaceStateKey(workspace.root),
      generation: 1,
      createdAt,
      updatedAt: createdAt,
      expiresAt: overrides.expiresAt ?? "2026-07-16T02:00:00.000Z",
      toolName: overrides.toolName ?? "apply_patch",
      requestId: "request_undo_fixture",
      ownerBinding: overrides.ownerBinding ?? OWNER,
      policyRevision: "policy-fixture",
      contractVersion: overrides.contractVersion ?? 2,
      state: overrides.state ?? "active",
      undoSupported: overrides.undoSupported ?? true,
      undoReason: overrides.undoReason ?? null,
      operations,
      plaintextBytes,
      ciphertextBytes: plaintextBytes + blobs.length * 37,
      revertsChangeSetId: overrides.revertsChangeSetId ?? null
    },
    blobs
  };
}

async function seedAfterState(workspaceRoot) {
  await fsp.writeFile(path.join(workspaceRoot, "created.txt"), "created-new");
  await fsp.writeFile(path.join(workspaceRoot, "replaced.txt"), "replace-new");
  await fsp.writeFile(path.join(workspaceRoot, "appended.txt"), "append-old+new");
}

async function assertAfterState(workspaceRoot) {
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "created.txt"), "utf8"), "created-new");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replaced.txt"), "utf8"), "replace-new");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "appended.txt"), "utf8"), "append-old+new");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "deleted.txt")), { code: "ENOENT" });
}

async function assertBeforeState(workspaceRoot) {
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "created.txt")), { code: "ENOENT" });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replaced.txt"), "utf8"), "replace-old");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "deleted.txt"), "utf8"), "delete-old");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "appended.txt"), "utf8"), "append-old");
}

async function prepareDefault(context, overrides = {}) {
  return context.service.prepare({
    workspace: context.workspace,
    changeSetId: `cs_${"1".repeat(32)}`,
    ownerBinding: OWNER,
    policyRevision: "policy-fixture",
    requestId: "request_undo",
    preview: false,
    contractVersion: 2,
    ...overrides
  });
}

test("bounded filesystem_batch descriptions are deterministic and enforce every path", () => fixture(async ({ workspace, guard }) => {
  const left = describeFilesystemBatchResource({
    workspace,
    guard,
    operation: "undo",
    entries: [
      { sourcePath: "z.txt", destinationPath: null },
      { sourcePath: "a.txt", destinationPath: null }
    ]
  });
  const right = describeFilesystemBatchResource({
    workspace,
    guard,
    operation: "undo",
    entries: [
      { sourcePath: "a.txt", destinationPath: null },
      { sourcePath: "z.txt", destinationPath: null }
    ]
  });
  assert.deepEqual(left, right);
  assert.equal(left.kind, "filesystem_batch");
  assert.equal(left.entries.length, 2);
  assert.deepEqual(resourceDescriptorV1Schema.parse(left), left);
  assert.throws(() => describeFilesystemBatchResource({
    workspace,
    guard,
    operation: "undo",
    entries: Array.from({ length: 65 }, (_, index) => ({ sourcePath: `f-${index}.txt`, destinationPath: null }))
  }), /between 1 and 64/i);
  assert.equal(toolPolicyDefinition("undo_change_set").riskClass, "R2");
  assert.equal(toolPolicyDefinition("undo_change_set").requiredScope, "filesystem:write");
  assert.equal(new ApprovalPolicyV1().classify(left), "R2");

  const blocked = describeFilesystemBatchResource({
    workspace,
    guard,
    operation: "undo",
    entries: [{ sourcePath: ".env", destinationPath: null }]
  });
  assert.deepEqual(evaluateHardPolicy(blocked, { capabilityDisabled: false }), [
    { id: "hard.fs.secret.env" }
  ]);
}));

test("undo restores create replace delete append-replacement and patch members only after audited commit", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace, { contractVersion: 3 }));
  const prepared = await prepareDefault(context);
  assert.equal(prepared.preview, false);
  assert.equal(prepared.revertsChangeSetId, original.changeSetId);
  assert.match(prepared.changeSetId, /^cs_[a-f0-9]{32}$/);
  assert.equal(prepared.operationCount, 4);
  await assertAfterState(context.workspaceRoot);

  const pending = prepared.pending;
  assert.ok(pending);
  const events = [];
  const result = { structuredContent: { ok: true } };
  await pending.commit({
    result,
    persistAudit: async () => {
      events.push("audit");
      assert.equal(context.store.read(original.workspaceStateKey, original.changeSetId).state, "active");
    }
  });

  assert.deepEqual(events, ["audit"]);
  await assertBeforeState(context.workspaceRoot);
  const undone = context.store.read(original.workspaceStateKey, original.changeSetId);
  assert.equal(undone.state, "undone");
  assert.equal(undone.undoSupported, false);
  const reverse = context.store.read(original.workspaceStateKey, pending.changeSetId);
  assert.equal(original.contractVersion, 3);
  assert.equal(reverse.contractVersion, 2);
  assert.equal(reverse.revertsChangeSetId, original.changeSetId);
  assert.equal(reverse.undoSupported, false);
  assert.equal(reverse.undoReason, "reverted_change_set");
  assert.equal(pending.revertsChangeSetId, original.changeSetId);
}));

test("a V3 undo writes the caller contract while retaining lineage to a V3 source", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace, { contractVersion: 3 }));
  const prepared = await prepareDefault(context, { contractVersion: 3 });
  await prepared.pending.commit({ result: { ok: true }, async persistAudit() {} });
  const reverse = context.store.read(original.workspaceStateKey, prepared.pending.changeSetId);
  assert.equal(reverse.contractVersion, 3);
  assert.equal(reverse.revertsChangeSetId, original.changeSetId);
}));

test("preview performs full validation without filesystem transaction or change-set mutation", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  const beforeTransactions = new TransactionManifestStore(context.stateRoot)
    .list(original.workspaceStateKey).length;
  const preview = await prepareDefault(context, { preview: true });
  assert.equal(preview.preview, true);
  assert.equal(preview.changeSetId, null);
  assert.equal(preview.pending, null);
  assert.equal(context.store.list(original.workspaceStateKey).length, 1);
  assert.equal(new TransactionManifestStore(context.stateRoot).list(original.workspaceStateKey).length, beforeTransactions);
  await assertAfterState(context.workspaceRoot);
}));

test("any after-state drift causes zero-change UNDO_CONFLICT", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  await fsp.writeFile(path.join(context.workspaceRoot, "replaced.txt"), "drifted-now");
  await assert.rejects(
    () => prepareDefault(context),
    (error) => error instanceof UndoChangeSetError && error.code === "UNDO_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(context.workspaceRoot, "created.txt"), "utf8"), "created-new");
  assert.equal(await fsp.readFile(path.join(context.workspaceRoot, "replaced.txt"), "utf8"), "drifted-now");
  assert.equal(context.store.list(original.workspaceStateKey).length, 1);
  assert.equal(new TransactionManifestStore(context.stateRoot).list(original.workspaceStateKey).length, 0);
}));

test("foreign and unverifiable change sets are non-disclosing while state failures remain stable", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  context.store.create(originalManifest(context.engine, context.workspace));
  await assert.rejects(
    () => prepareDefault(context, { ownerBinding: FOREIGN_OWNER }),
    (error) => error instanceof UndoChangeSetError && error.code === "CHANGE_SET_NOT_FOUND"
  );
  await assert.rejects(
    () => prepareDefault(context, { changeSetId: `cs_${"9".repeat(32)}` }),
    (error) => error instanceof UndoChangeSetError && error.code === "CHANGE_SET_NOT_FOUND"
  );

  const manifestPath = path.join(
    changeSetDirectoryFor(context.stateRoot, context.engine.workspaceStateKey(context.workspace.root), `cs_${"1".repeat(32)}`),
    "manifest.json"
  );
  const raw = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  raw.policyRevision = "policy_tampered";
  await fsp.writeFile(manifestPath, JSON.stringify(raw));
  await assert.rejects(
    () => prepareDefault(context),
    (error) => error instanceof UndoChangeSetError && error.code === "CHANGE_SET_NOT_FOUND"
  );
}));

test("expired unsupported already-applied and recovery-required states map to stable failures", () => fixture(async (context) => {
  const createOperation = [{
    operationId: "op_create_state",
    kind: "create",
    relativePath: "state.txt",
    destinationRelativePath: null,
    before: { exists: false, sha256: null, bytes: 0, metadata: null },
    after: { exists: true, sha256: digest("state-new"), bytes: 9 },
    blobId: null
  }];

  const already = context.store.create(originalManifest(context.engine, context.workspace, {
    changeSetId: `cs_${"a".repeat(32)}`,
    transactionId: `tx_${"a".repeat(32)}`,
    operations: createOperation
  }));
  context.store.transition(already.workspaceStateKey, already.changeSetId, {
    expectedGeneration: already.generation,
    state: "undone",
    updatedAt: "2026-07-15T03:00:00.000Z"
  });
  await assert.rejects(
    () => prepareDefault(context, { changeSetId: already.changeSetId }),
    (error) => error instanceof UndoChangeSetError && error.code === "UNDO_ALREADY_APPLIED"
  );

  const expired = context.store.create(originalManifest(context.engine, context.workspace, {
    changeSetId: `cs_${"b".repeat(32)}`,
    transactionId: `tx_${"b".repeat(32)}`,
    createdAt: "2026-07-13T02:00:00.000Z",
    expiresAt: "2026-07-14T02:00:00.000Z",
    operations: createOperation
  }));
  await assert.rejects(
    () => prepareDefault(context, { changeSetId: expired.changeSetId }),
    (error) => error instanceof UndoChangeSetError && error.code === "UNDO_EXPIRED"
  );

  const unsupported = context.store.create(originalManifest(context.engine, context.workspace, {
    changeSetId: `cs_${"c".repeat(32)}`,
    transactionId: `tx_${"c".repeat(32)}`,
    operations: createOperation,
    undoSupported: false,
    undoReason: "retention_disabled"
  }));
  await assert.rejects(
    () => prepareDefault(context, { changeSetId: unsupported.changeSetId }),
    (error) => error instanceof UndoChangeSetError && error.code === "UNDO_NOT_SUPPORTED"
  );

  const recovery = context.store.create(originalManifest(context.engine, context.workspace, {
    changeSetId: `cs_${"d".repeat(32)}`,
    transactionId: `tx_${"d".repeat(32)}`,
    operations: createOperation
  }));
  context.store.transition(recovery.workspaceStateKey, recovery.changeSetId, {
    expectedGeneration: recovery.generation,
    state: "recovery_required",
    updatedAt: "2026-07-15T03:00:00.000Z"
  });
  await assert.rejects(
    () => prepareDefault(context, { changeSetId: recovery.changeSetId }),
    (error) => error instanceof UndoChangeSetError && error.code === "TRANSACTION_RECOVERY_REQUIRED"
  );
}));

test("a blocked reverse path causes zero-change UNDO_CONFLICT", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  await assert.rejects(
    () => prepareDefault(context),
    (error) => error instanceof UndoChangeSetError && error.code === "UNDO_CONFLICT"
  );
  await assertAfterState(context.workspaceRoot);
  assert.equal(new TransactionManifestStore(context.stateRoot).list(original.workspaceStateKey).length, 0);
}, { blockedGlobs: ["replaced.txt"] }));

test("blocked reverse paths and bad rollback blob authentication fail before transaction prepare", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  const blobPath = changeSetBlobPathFor(
    context.stateRoot,
    original.workspaceStateKey,
    original.changeSetId,
    `blob_${"3".repeat(32)}`
  );
  const envelope = await fsp.readFile(blobPath);
  envelope[envelope.length - 1] ^= 0xff;
  await fsp.writeFile(blobPath, envelope);
  await assert.rejects(
    () => prepareDefault(context),
    (error) => error instanceof UndoChangeSetError && error.code === "INTERNAL_ERROR"
  );
  await assertAfterState(context.workspaceRoot);
  assert.equal(new TransactionManifestStore(context.stateRoot).list(original.workspaceStateKey).length, 0);
}));

test("authenticated rollback plaintext must still match the manifest before-state", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  const mismatchedStore = {
    read: context.store.read.bind(context.store),
    readBlob: () => Buffer.from("wrong-before-state"),
    create: context.store.create.bind(context.store),
    transition: context.store.transition.bind(context.store)
  };
  const service = new UndoChangeSetService({
    engine: context.engine,
    changeSetStore: mismatchedStore,
    guard: context.guard,
    now: () => NOW
  });
  await assert.rejects(
    () => service.prepare({
      workspace: context.workspace,
      changeSetId: original.changeSetId,
      ownerBinding: OWNER,
      policyRevision: "policy-fixture",
      requestId: "request-blob-mismatch",
      preview: false,
      contractVersion: 2
    }),
    (error) => error instanceof UndoChangeSetError && error.code === "INTERNAL_ERROR"
  );
  await assertAfterState(context.workspaceRoot);
}));

test("required audit failure rolls back the reverse transaction and leaves the original active", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  const prepared = await prepareDefault(context);
  const pending = prepared.pending;
  await assert.rejects(
    () => pending.commit({
      result: { structuredContent: { ok: true } },
      persistAudit: async () => { throw new Error("audit unavailable"); }
    }),
    (error) => error?.code === "AUDIT_UNAVAILABLE"
  );
  await assertAfterState(context.workspaceRoot);
  assert.equal(context.store.read(original.workspaceStateKey, original.changeSetId).state, "active");
  assert.equal(context.store.list(original.workspaceStateKey).length, 1);
}));

test("Policy wrapper persists the reverse and original change-set ids in one execution fact", () => fixture(async (context) => {
  await seedAfterState(context.workspaceRoot);
  const original = context.store.create(originalManifest(context.engine, context.workspace));
  const prepared = await prepareDefault(context);
  const result = attachPendingWorkspaceMutation({
    content: [{ type: "text", text: "undo prepared" }],
    structuredContent: { ok: true }
  }, prepared.pending);
  const server = {
    _registeredTools: {
      undo_change_set: {
        inputSchema: undoChangeSetInputV2Schema,
        handler: async () => result
      }
    }
  };
  const executions = [];
  installPolicyKernel(server, {
    mode: "enforce",
    async authorize() {
      return {
        decision: {
          schemaVersion: 1,
          decisionId: "decision_111111111111111111111111",
          outcome: "allow",
          reasonCode: null,
          policyRevision: "policy-fixture",
          resourceFingerprint: `sha256:${"2".repeat(64)}`,
          requiredApproval: null,
          requiredEnforcement: [],
          provenance: []
        },
        auditEvent: null,
        auditContext: {
          authorizationEvent: {
            schemaVersion: 2,
            eventId: `event_${"3".repeat(32)}`,
            eventType: "authorization",
            timestamp: "2026-07-15T03:00:00.000Z",
            requestId: `request_${"4".repeat(32)}`,
            authorizationEventId: null,
            decisionId: "decision_111111111111111111111111",
            credentialRef: "cred_fixture",
            transportSessionId: "session_fixture",
            toolName: "undo_change_set",
            canonicalAction: "undo_change_set",
            workspaceId: context.workspace.id,
            workspaceRef: null,
            policyRevision: "policy-fixture",
            resourceSummary: "filesystem_batch:undo:4",
            resourceFingerprint: "2".repeat(64),
            outcome: "allow",
            reasonCode: null,
            safeRuleIds: [],
            approvalState: "granted",
            grantId: "grant_fixture",
            sandboxBackend: "node-baseline",
            riskClass: "R2"
          },
          requirement: "required",
          riskClass: "R2",
          mutating: true
        }
      };
    },
    async audit() {},
    async persistAuthorization() {},
    async persistExecution(_context, execution) {
      executions.push(execution);
    }
  });

  const committed = await server._registeredTools.undo_change_set.handler({});
  assert.equal(committed.isError, undefined);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].changeSetId, prepared.changeSetId);
  assert.equal(executions[0].revertsChangeSetId, original.changeSetId);
  assert.equal(context.store.read(original.workspaceStateKey, original.changeSetId).state, "undone");
}));

test("undo V2 schemas are strict and exported through the dormant contract adapter", () => {
  assert.strictEqual(undoChangeSetInputSchemaV2, undoChangeSetInputV2Schema);
  assert.strictEqual(undoChangeSetOutputSchemaV2, undoChangeSetOutputSchema);
  assert.deepEqual(undoChangeSetInputV2Schema.parse({
    workspace_id: "ws_fixture",
    change_set_id: `cs_${"1".repeat(32)}`,
    preview: true
  }), {
    workspace_id: "ws_fixture",
    change_set_id: `cs_${"1".repeat(32)}`,
    preview: true
  });
  assert.equal(undoChangeSetInputV2Schema.safeParse({
    workspace_id: "ws_fixture",
    change_set_id: `cs_${"1".repeat(32)}`,
    force: true
  }).success, false);
});

test("dormant direct and supertool undo V2 adapters share one strict handler", async () => {
  const calls = [];
  const shared = async (input) => {
    calls.push(input);
    return undoChangeSetOutputSchema.parse({
      codexgpt_tool: "undo_change_set",
      codexgpt_title: "Undo Change Set",
      ok: true,
      data: {
        workspace_id: input.workspace_id,
        preview: true,
        change_set_id: null,
        reverts_change_set_id: input.change_set_id,
        operation_count: 1,
        operations: [{ kind: "restore", path: "a.txt" }],
        undo_supported: false
      },
      error: null,
      meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
    });
  };
  const direct = createDirectUndoChangeSetAdapterV2(shared);
  const supertool = createSupertoolUndoChangeSetAdapterV2(shared);
  const input = {
    workspace_id: "ws_fixture",
    change_set_id: `cs_${"1".repeat(32)}`,
    preview: true
  };
  assert.deepEqual(await direct(input), await supertool(input));
  assert.deepEqual(calls, [input, input]);
  await assert.rejects(() => direct({ ...input, force: true }), /input is invalid/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { deriveAuditRecordKey } from "../dist/audit/canonicalJson.js";
import { loadConfig } from "../dist/config.js";
import {
  changeSetManifestV1Schema,
  changeSetOperationV1Schema
} from "../dist/changesets/schemas.js";
import {
  decryptChangeSetBlob,
  deriveChangeSetBlobKey,
  deriveChangeSetManifestKey,
  encryptChangeSetBlob
} from "../dist/changesets/crypto.js";
import { transactionResultV2Schema } from "../dist/tools/schemas/transactionResult.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const RETENTION_ENV = [
  "CODEXGPT_CHANGE_SET_MAX_PLAINTEXT_BYTES",
  "CODEXGPT_CHANGE_SET_MAX_INSTALLATION_BYTES",
  "CODEXGPT_CHANGE_SET_MAX_ACTIVE_PER_WORKSPACE",
  "CODEXGPT_CHANGE_SET_RETENTION_MS",
  "CODEXGPT_CHANGE_SET_TOMBSTONE_RETENTION_MS"
];

function withRetentionEnv(changes, action) {
  const previous = new Map();
  for (const name of RETENTION_ENV) {
    previous.set(name, process.env[name]);
    const value = changes[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function operation(overrides = {}) {
  return {
    operationId: "op_write",
    kind: "replace",
    relativePath: "src/example.txt",
    destinationRelativePath: null,
    before: {
      exists: true,
      sha256: SHA_A,
      bytes: 5,
      metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
    },
    after: { exists: true, sha256: SHA_B, bytes: 6 },
    blobId: `blob_${"1".repeat(32)}`,
    ...overrides
  };
}

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    changeSetId: `cs_${"2".repeat(32)}`,
    transactionId: `tx_${"3".repeat(32)}`,
    workspaceStateKey: `wsk_${"4".repeat(32)}`,
    generation: 1,
    createdAt: "2026-07-14T12:00:00.000Z",
    updatedAt: "2026-07-14T12:00:00.000Z",
    expiresAt: "2026-07-15T12:00:00.000Z",
    toolName: "write",
    requestId: "request-1",
    ownerBinding: `owner_${"5".repeat(64)}`,
    policyRevision: "policy-1",
    contractVersion: 2,
    state: "active",
    undoSupported: true,
    undoReason: null,
    operations: [operation()],
    plaintextBytes: 5,
    ciphertextBytes: 42,
    revertsChangeSetId: null,
    manifestMac: "f".repeat(64),
    ...overrides
  };
}

test("change-set schemas are strict bounded path-safe and contain no plaintext", () => {
  assert.equal(changeSetOperationV1Schema.parse(operation()).kind, "replace");
  assert.equal(changeSetManifestV1Schema.parse(manifest()).state, "active");
  assert.equal(changeSetOperationV1Schema.safeParse({ ...operation(), body: "secret" }).success, false);
  assert.equal(changeSetManifestV1Schema.safeParse({ ...manifest(), canonicalRoot: "C:\\private" }).success, false);
  assert.equal(changeSetManifestV1Schema.safeParse({ ...manifest(), plaintext: "secret" }).success, false);
  assert.equal(changeSetManifestV1Schema.safeParse({ ...manifest(), manifestMac: "f" }).success, false);
  assert.equal(changeSetOperationV1Schema.safeParse({
    ...operation(),
    relativePath: "../escape.txt"
  }).success, false);
  assert.equal(changeSetOperationV1Schema.safeParse({
    ...operation(),
    blobId: `blob_${"9".repeat(32)}`,
    before: { exists: false, sha256: null, bytes: 0, metadata: null }
  }).success, false);
  assert.equal(changeSetManifestV1Schema.safeParse({
    ...manifest(),
    operations: [operation(), operation({ operationId: "op_other" })]
  }).success, false);
});

test("change-set retention defaults are bounded and configuration is strict", () => {
  const defaults = withRetentionEnv({}, () => loadConfig(["--bash", "off"]).changeSetRetention);
  assert.deepEqual(defaults, {
    maxPlaintextBytesPerChangeSet: 8 * 1024 * 1024,
    maxInstallationCiphertextBytes: 128 * 1024 * 1024,
    maxActivePerWorkspace: 20,
    activeRetentionMs: 24 * 60 * 60_000,
    tombstoneRetentionMs: 30 * 24 * 60 * 60_000
  });
  assert.throws(
    () => withRetentionEnv({ CODEXGPT_CHANGE_SET_MAX_PLAINTEXT_BYTES: "10" }, () =>
      loadConfig(["--bash", "off"])
    ),
    /integer between 1024 and 67108864/
  );
});

test("transaction result V2 is one exact strict shared object", () => {
  const value = {
    change_set_id: `cs_${"2".repeat(32)}`,
    transaction_id: `tx_${"3".repeat(32)}`,
    before_state: "present",
    operation_count: 1,
    undo_supported: true,
    committed_at: "2026-07-14T12:00:00.000Z"
  };
  assert.deepEqual(transactionResultV2Schema.parse(value), value);
  assert.equal(transactionResultV2Schema.safeParse({ ...value, state_path: "private" }).success, false);
});

test("change-set blob keys are domain-separated from audit keys", () => {
  const master = Buffer.alloc(32, 7);
  const changeSetKey = deriveChangeSetBlobKey(master);
  const manifestKey = deriveChangeSetManifestKey(master);
  const auditKey = deriveAuditRecordKey(master);
  try {
    assert.equal(changeSetKey.length, 32);
    assert.notDeepEqual(changeSetKey, master);
    assert.notDeepEqual(changeSetKey, auditKey);
    assert.notDeepEqual(manifestKey, master);
    assert.notDeepEqual(manifestKey, changeSetKey);
    assert.notDeepEqual(manifestKey, auditKey);
  } finally {
    changeSetKey.fill(0);
    manifestKey.fill(0);
    auditKey.fill(0);
    master.fill(0);
  }
});

test("AES-GCM blobs use independent nonces and authenticate every bound identity", () => {
  const key = Buffer.alloc(32, 8);
  const context = {
    changeSetId: `cs_${"2".repeat(32)}`,
    blobId: `blob_${"1".repeat(32)}`,
    operationId: "op_write",
    beforeSha256: SHA_A
  };
  const nonces = [Buffer.alloc(12, 1), Buffer.alloc(12, 2)];
  const first = encryptChangeSetBlob(key, Buffer.from("before"), context, {
    randomBytes: () => nonces.shift()
  });
  const second = encryptChangeSetBlob(key, Buffer.from("before"), context, {
    randomBytes: () => nonces.shift()
  });
  assert.notDeepEqual(first, second);
  assert.deepEqual(decryptChangeSetBlob(key, first, context), Buffer.from("before"));

  for (const changed of [
    { changeSetId: `cs_${"6".repeat(32)}` },
    { blobId: `blob_${"7".repeat(32)}` },
    { operationId: "op_other" },
    { beforeSha256: SHA_B }
  ]) {
    assert.throws(
      () => decryptChangeSetBlob(key, first, { ...context, ...changed }),
      (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
    );
  }
  const tampered = Buffer.from(first);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(
    () => decryptChangeSetBlob(key, tampered, context),
    (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
  );
  assert.throws(
    () => decryptChangeSetBlob(Buffer.alloc(32, 9), first, context),
    (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
  );
  key.fill(0);
});

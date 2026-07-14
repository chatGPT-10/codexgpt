import assert from "node:assert/strict";
import test from "node:test";
import {
  TransactionError,
  installationStateV1Schema,
  processInstanceRecordV1Schema,
  transactionManifestV1Schema,
  workspaceLockOwnerV1Schema
} from "../dist/transactions/index.js";

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

function clone(value) {
  return structuredClone(value);
}

test("strict transaction manifest accepts only bounded safe facts", () => {
  assert.deepEqual(transactionManifestV1Schema.parse(validManifest), validManifest);
  const serialized = JSON.stringify(transactionManifestV1Schema.parse(validManifest));
  for (const forbidden of ["C:\\\\", "/home/", "Authorization", "Cookie", "private key", "content"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("transaction manifest rejects unknown, absolute, unsafe, and duplicate facts", () => {
  assert.throws(
    () => transactionManifestV1Schema.parse({ ...validManifest, workspaceRoot: "C:\\secret" }),
    /unrecognized/i
  );
  for (const relativePath of ["C:\\secret.txt", "/home/noah/file", "../escape", "src/../../escape"]) {
    const candidate = clone(validManifest);
    candidate.operations[0].relativePath = relativePath;
    assert.throws(() => transactionManifestV1Schema.parse(candidate));
  }
  for (const stageRelativePath of [
    "src/example.stage",
    "other/.codexpro-txn-5555555555555555.stage",
    "src/.codexpro-txn-short.stage",
    "src/.codexpro-txn-5555555555555555.txt"
  ]) {
    const candidate = clone(validManifest);
    candidate.operations[0].stageRelativePath = stageRelativePath;
    assert.throws(() => transactionManifestV1Schema.parse(candidate));
  }
  const duplicate = clone(validManifest);
  duplicate.operations.push(clone(duplicate.operations[0]));
  assert.throws(() => transactionManifestV1Schema.parse(duplicate), /unique/i);
  for (const field of ["bytes", "content", "diff", "authorization", "cookie", "privateKey"]) {
    const candidate = clone(validManifest);
    candidate[field] = "forbidden";
    assert.throws(() => transactionManifestV1Schema.parse(candidate), /unrecognized/i);
  }
});

test("transaction manifest rejects malformed identifiers and cross-field states", () => {
  for (const [field, value] of [
    ["transactionId", "tx_bad"],
    ["changeSetId", "cs_bad"],
    ["workspaceStateKey", "wsk_bad"],
    ["generation", -1]
  ]) {
    const candidate = clone(validManifest);
    candidate[field] = value;
    assert.throws(() => transactionManifestV1Schema.parse(candidate));
  }
  const badCreate = clone(validManifest);
  badCreate.operations[0].kind = "create";
  assert.throws(() => transactionManifestV1Schema.parse(badCreate));
  const badDelete = clone(validManifest);
  badDelete.operations[0].kind = "delete";
  assert.throws(() => transactionManifestV1Schema.parse(badDelete));
});

test("installation, process, and lock schemas are strict", () => {
  const installation = {
    schemaVersion: 1,
    installationId: "install_" + "1".repeat(32),
    masterKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    createdAt: "2026-07-14T00:00:00.000Z"
  };
  assert.deepEqual(installationStateV1Schema.parse(installation), installation);
  assert.throws(() => installationStateV1Schema.parse({ ...installation, token: "secret" }), /unrecognized/i);
  assert.throws(() => installationStateV1Schema.parse({ ...installation, masterKeyBase64: "short" }));

  const instance = {
    schemaVersion: 1,
    instanceId: "instance_" + "2".repeat(32),
    pid: 123,
    createdAt: "2026-07-14T00:00:00.000Z"
  };
  assert.deepEqual(processInstanceRecordV1Schema.parse(instance), instance);
  const owner = {
    schemaVersion: 1,
    lockToken: "lock_" + "3".repeat(32),
    instanceId: instance.instanceId,
    pid: instance.pid,
    transactionId: validManifest.transactionId,
    createdAt: instance.createdAt
  };
  assert.deepEqual(workspaceLockOwnerV1Schema.parse(owner), owner);
  assert.throws(() => workspaceLockOwnerV1Schema.parse({ ...owner, workspaceRoot: "D:\\private" }), /unrecognized/i);
});

test("TransactionError exposes only the stable code and bounded safe details", () => {
  const error = new TransactionError("FILE_VERSION_CONFLICT", "File changed.", {
    relativePath: "src/example.ts",
    attempt: 2,
    retryable: false,
    current: null
  });
  assert.equal(error.name, "TransactionError");
  assert.equal(error.code, "FILE_VERSION_CONFLICT");
  assert.deepEqual(error.safeDetails, {
    relativePath: "src/example.ts",
    attempt: 2,
    retryable: false,
    current: null
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ChangeSetStore,
  MoveChangeSetStore,
  changeSetDirectoryFor
} from "../dist/changesets/index.js";
import {
  installationMasterKey,
  loadOrCreateInstallationState
} from "../dist/transactions/index.js";

function draft(overrides = {}) {
  return {
    schemaVersion: 2,
    changeSetId: "cs_" + "1".repeat(32),
    transactionId: "tx_" + "2".repeat(32),
    workspaceStateKey: "wsk_" + "3".repeat(32),
    generation: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    expiresAt: "2026-07-16T00:00:00.000Z",
    toolName: "move_paths",
    requestId: null,
    ownerBinding: "owner_" + "4".repeat(64),
    policyRevision: "phase3d",
    contractVersion: 2,
    state: "active",
    undoSupported: true,
    undoReason: null,
    operations: [{
      operationId: "op_move_001",
      kind: "move",
      sourceRelativePath: "a.txt",
      destinationRelativePath: "b.txt",
      sourceComparisonKey: "a.txt",
      destinationComparisonKey: "b.txt",
      objectIdentity: { device: "1", fileId: "2" },
      sha256: "a".repeat(64),
      bytes: 7
    }],
    createdDirectories: [],
    createdDirectoryIdentities: {},
    plaintextBytes: 0,
    ciphertextBytes: 0,
    revertsChangeSetId: null,
    ...overrides
  };
}

test("Move Change Set V2 is authenticated, zero-blob, monotonic, and isolated from V1 readers", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-move-changeset-"));
  const installation = loadOrCreateInstallationState({ stateRoot });
  const key = installationMasterKey(installation);
  const moveStore = new MoveChangeSetStore({ stateRoot, masterKey: key, now: () => Date.parse("2026-07-15T00:05:00.000Z") });
  const v1Store = new ChangeSetStore({ stateRoot, masterKey: key });
  try {
    const created = moveStore.create(draft());
    assert.equal(created.schemaVersion, 2);
    assert.equal(created.plaintextBytes, 0);
    assert.equal(created.ciphertextBytes, 0);
    assert.match(created.manifestMac, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(changeSetDirectoryFor(stateRoot, created.workspaceStateKey, created.changeSetId), "blobs")), false);
    assert.deepEqual(v1Store.list(created.workspaceStateKey), []);
    assert.equal(moveStore.list(created.workspaceStateKey).length, 1);

    const transitioned = moveStore.transition(created.workspaceStateKey, created.changeSetId, {
      expectedGeneration: created.generation,
      state: "undone",
      updatedAt: "2026-07-15T00:04:00.000Z"
    });
    assert.equal(transitioned.state, "undone");
    assert.equal(transitioned.undoSupported, false);
    assert.equal(transitioned.undoReason, "already_undone");
    assert.equal(moveStore.transition(created.workspaceStateKey, created.changeSetId, {
      expectedGeneration: created.generation,
      state: "undone",
      updatedAt: "2026-07-15T00:04:00.000Z"
    }).generation, transitioned.generation);
  } finally {
    moveStore.dispose();
    v1Store.dispose();
    key.fill(0);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("Move Change Set V2 rejects malformed move facts and detects tampering", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-move-changeset-"));
  const key = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
  const store = new MoveChangeSetStore({ stateRoot, masterKey: key });
  try {
    assert.throws(() => store.create(draft({ plaintextBytes: 1 })), /invalid/i);
    assert.throws(() => store.create(draft({
      operations: [{ ...draft().operations[0], destinationRelativePath: "a.txt" }]
    })), /invalid/i);
    const created = store.create(draft({ contractVersion: 3 }));
    assert.equal(created.contractVersion, 3);
    const file = path.join(changeSetDirectoryFor(stateRoot, created.workspaceStateKey, created.changeSetId), "manifest.json");
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.contractVersion = 2;
    fs.writeFileSync(file, JSON.stringify(tampered));
    assert.equal(store.probe(created.workspaceStateKey, created.changeSetId), "unknown");
    assert.throws(() => store.read(created.workspaceStateKey, created.changeSetId), /authentication|invalid/i);
  } finally {
    store.dispose();
    key.fill(0);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

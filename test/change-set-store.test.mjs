import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ChangeSetStore,
  changeSetBlobPathFor,
  changeSetDirectoryFor
} from "../dist/changesets/store.js";
import {
  ProcessInstanceRegistry,
  WorkspaceMutationLock
} from "../dist/transactions/workspaceLock.js";

const SHA_A = createHash("sha256").update("before", "utf8").digest("hex");
const SHA_B = "b".repeat(64);
const WORKSPACE = `wsk_${"4".repeat(32)}`;

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-changeset-store-"));
}

function ids(seed) {
  return {
    changeSetId: `cs_${seed.repeat(32)}`,
    transactionId: `tx_${seed.repeat(32)}`,
    blobId: `blob_${seed.repeat(32)}`
  };
}

function input(seed, createdAt = "2026-07-14T12:00:00.000Z", plaintext = Buffer.from("before")) {
  const identity = ids(seed);
  const expiresAt = new Date(Date.parse(createdAt) + 24 * 60 * 60_000).toISOString();
  return {
    manifest: {
      schemaVersion: 1,
      changeSetId: identity.changeSetId,
      transactionId: identity.transactionId,
      workspaceStateKey: WORKSPACE,
      generation: 1,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      toolName: "write",
      requestId: "request-1",
      ownerBinding: `owner_${"5".repeat(64)}`,
      policyRevision: "policy-1",
      contractVersion: 2,
      state: "active",
      undoSupported: true,
      undoReason: null,
      operations: [{
        operationId: `op_write_${seed}`,
        kind: "replace",
        relativePath: `src/${seed}.txt`,
        destinationRelativePath: null,
        before: {
          exists: true,
          sha256: SHA_A,
          bytes: plaintext.length,
          metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
        },
        after: { exists: true, sha256: SHA_B, bytes: 6 },
        blobId: identity.blobId
      }],
      plaintextBytes: plaintext.length,
      ciphertextBytes: plaintext.length + 37,
      revertsChangeSetId: null
    },
    blobs: [{
      blobId: identity.blobId,
      operationId: `op_write_${seed}`,
      beforeSha256: SHA_A,
      plaintext
    }]
  };
}

function store(stateRoot, overrides = {}) {
  return new ChangeSetStore({
    stateRoot,
    masterKey: Buffer.alloc(32, 7),
    now: () => Date.parse("2026-07-14T12:00:00.000Z"),
    retention: {
      maxPlaintextBytesPerChangeSet: 8 * 1024 * 1024,
      maxInstallationCiphertextBytes: 128 * 1024 * 1024,
      maxActivePerWorkspace: 20,
      activeRetentionMs: 24 * 60 * 60_000,
      tombstoneRetentionMs: 30 * 24 * 60 * 60_000,
      ...overrides
    }
  });
}

test("store publishes ciphertext before a strict manifest and reads authenticated bytes", () => {
  const stateRoot = root();
  const changeSet = input("1");
  try {
    const subject = store(stateRoot);
    const created = subject.create(changeSet);
    assert.equal(created.changeSetId, changeSet.manifest.changeSetId);
    assert.deepEqual(
      subject.readBlob(WORKSPACE, created.changeSetId, changeSet.blobs[0].blobId),
      Buffer.from("before")
    );
    const blobPath = changeSetBlobPathFor(
      stateRoot,
      WORKSPACE,
      created.changeSetId,
      changeSet.blobs[0].blobId
    );
    assert.equal(fs.readFileSync(blobPath).includes(Buffer.from("before")), false);
    const manifestText = fs.readFileSync(path.join(path.dirname(blobPath), "..", "manifest.json"), "utf8");
    assert.equal(manifestText.includes('"plaintext"'), false);
    assert.equal(manifestText.includes(Buffer.from("before").toString("base64")), false);
    assert.throws(
      () => subject.create(changeSet),
      (error) => error?.code === "CHANGE_SET_STATE_CONFLICT"
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("state transitions are monotonic stale-safe and remove only authenticated blobs", () => {
  const stateRoot = root();
  const changeSet = input("2");
  try {
    const subject = store(stateRoot);
    subject.create(changeSet);
    const undone = subject.transition(WORKSPACE, changeSet.manifest.changeSetId, {
      expectedGeneration: 1,
      state: "undone",
      updatedAt: "2026-07-14T13:00:00.000Z"
    });
    assert.equal(undone.generation, 2);
    assert.equal(undone.undoSupported, false);
    assert.equal(undone.undoReason, "already_undone");
    assert.equal(fs.existsSync(changeSetBlobPathFor(
      stateRoot,
      WORKSPACE,
      undone.changeSetId,
      changeSet.blobs[0].blobId
    )), false);
    assert.throws(
      () => subject.transition(WORKSPACE, undone.changeSetId, {
        expectedGeneration: 1,
        state: "recovery_required",
        updatedAt: "2026-07-14T14:00:00.000Z"
      }),
      (error) => error?.code === "CHANGE_SET_STATE_CONFLICT"
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("retention applies plaintext count total expiry and tombstone limits", () => {
  const stateRoot = root();
  try {
    const plaintextLimited = store(stateRoot, { maxPlaintextBytesPerChangeSet: 3 });
    const tooLarge = plaintextLimited.create(input("3"));
    assert.equal(tooLarge.undoSupported, false);
    assert.equal(tooLarge.undoReason, "plaintext_limit");
    assert.equal(tooLarge.ciphertextBytes, 0);

    const countRoot = root();
    try {
      const countLimited = store(countRoot, { maxActivePerWorkspace: 1 });
      const first = countLimited.create(input("4", "2026-07-14T10:00:00.000Z"));
      countLimited.create(input("5", "2026-07-14T11:00:00.000Z"));
      const pruned = countLimited.read(WORKSPACE, first.changeSetId);
      assert.equal(pruned.undoSupported, false);
      assert.equal(pruned.undoReason, "workspace_count_limit");
    } finally {
      fs.rmSync(countRoot, { recursive: true, force: true });
    }

    const totalRoot = root();
    try {
      const totalLimited = store(totalRoot, { maxInstallationCiphertextBytes: 50 });
      const first = totalLimited.create(input("6", "2026-07-14T10:00:00.000Z"));
      totalLimited.create(input("7", "2026-07-14T11:00:00.000Z"));
      assert.equal(totalLimited.read(WORKSPACE, first.changeSetId).undoReason, "installation_limit");
    } finally {
      fs.rmSync(totalRoot, { recursive: true, force: true });
    }

    const expiryRoot = root();
    try {
      const expiring = store(expiryRoot, {
        activeRetentionMs: 60_000,
        tombstoneRetentionMs: 60_000
      });
      const created = expiring.create(input("8"));
      const firstMaintenance = expiring.maintain(Date.parse("2026-07-14T12:02:00.000Z"));
      assert.deepEqual(firstMaintenance.expired, [created.changeSetId]);
      assert.equal(expiring.read(WORKSPACE, created.changeSetId).state, "undo_expired");
      const secondMaintenance = expiring.maintain(Date.parse("2026-07-14T12:04:00.000Z"));
      assert.deepEqual(secondMaintenance.deletedTombstones, [created.changeSetId]);
      assert.throws(
        () => expiring.read(WORKSPACE, created.changeSetId),
        (error) => error?.code === "CHANGE_SET_NOT_FOUND"
      );
    } finally {
      fs.rmSync(expiryRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("retention inspection failure makes a new change set explicitly non-undoable", () => {
  const stateRoot = root();
  try {
    const subject = store(stateRoot);
    const existing = subject.create(input("b"));
    const existingManifestPath = path.join(changeSetDirectoryFor(
      stateRoot,
      WORKSPACE,
      existing.changeSetId
    ), "manifest.json");
    const tampered = JSON.parse(fs.readFileSync(existingManifestPath, "utf8"));
    tampered.toolName = "edit";
    fs.writeFileSync(existingManifestPath, `${JSON.stringify(tampered)}\n`, "utf8");

    const created = subject.create(input("c"));
    assert.equal(created.undoSupported, false);
    assert.equal(created.undoReason, "retention_unavailable");
    assert.equal(created.ciphertextBytes, 0);
    assert.equal(fs.existsSync(changeSetBlobPathFor(
      stateRoot,
      WORKSPACE,
      created.changeSetId,
      ids("c").blobId
    )), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("blob directory durability failure aborts before manifest publication", () => {
  const stateRoot = root();
  const changeSet = input("d");
  try {
    const subject = new ChangeSetStore({
      stateRoot,
      masterKey: Buffer.alloc(32, 7),
      syncDirectory() {
        return "failed";
      }
    });
    assert.throws(
      () => subject.create(changeSet),
      (error) => error?.code === "CHANGE_SET_UNAVAILABLE"
    );
    assert.equal(fs.existsSync(changeSetDirectoryFor(
      stateRoot,
      WORKSPACE,
      changeSet.manifest.changeSetId
    )), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("corrupt manifests and blobs fail closed and remain on disk", () => {
  const stateRoot = root();
  try {
    const subject = store(stateRoot);
    const corrupt = input("9");
    subject.create(corrupt);
    const blobPath = changeSetBlobPathFor(
      stateRoot,
      WORKSPACE,
      corrupt.manifest.changeSetId,
      corrupt.blobs[0].blobId
    );
    const bytes = fs.readFileSync(blobPath);
    bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(blobPath, bytes);
    assert.throws(
      () => subject.readBlob(WORKSPACE, corrupt.manifest.changeSetId, corrupt.blobs[0].blobId),
      (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
    );
    assert.equal(fs.existsSync(blobPath), true);

    const valid = input("a");
    subject.create(valid);
    const validManifestPath = path.join(changeSetDirectoryFor(
      stateRoot,
      WORKSPACE,
      valid.manifest.changeSetId
    ), "manifest.json");
    const tamperedManifest = JSON.parse(fs.readFileSync(validManifestPath, "utf8"));
    tamperedManifest.toolName = "edit";
    fs.writeFileSync(validManifestPath, `${JSON.stringify(tamperedManifest)}\n`, "utf8");
    assert.throws(
      () => subject.read(WORKSPACE, valid.manifest.changeSetId),
      (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
    );
    assert.equal(fs.existsSync(validManifestPath), true);

    const invalidDirectory = changeSetDirectoryFor(
      stateRoot,
      WORKSPACE,
      `cs_${"a".repeat(32)}`
    );
    fs.mkdirSync(invalidDirectory, { recursive: true });
    fs.writeFileSync(path.join(invalidDirectory, "manifest.json"), "{}\n", "utf8");
    assert.throws(
      () => subject.read(WORKSPACE, `cs_${"a".repeat(32)}`),
      (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("paths are Windows-safe and existing workspace locks serialize store mutations", () => {
  const winRoot = "C:\\CodexPro\\state\\v1";
  const directory = changeSetDirectoryFor(
    winRoot,
    WORKSPACE,
    `cs_${"b".repeat(32)}`,
    "win32"
  );
  assert.equal(directory, `${winRoot}\\changesets\\${WORKSPACE}\\cs_${"b".repeat(32)}`);
  assert.throws(() => changeSetDirectoryFor(winRoot, "../escape", `cs_${"b".repeat(32)}`, "win32"));

  const stateRoot = root();
  const firstRegistry = new ProcessInstanceRegistry(stateRoot);
  const secondRegistry = new ProcessInstanceRegistry(stateRoot);
  const firstLock = new WorkspaceMutationLock(stateRoot, firstRegistry);
  const secondLock = new WorkspaceMutationLock(stateRoot, secondRegistry);
  try {
    const handle = firstLock.acquire({
      workspaceStateKey: WORKSPACE,
      transactionId: `tx_${"c".repeat(32)}`
    });
    assert.throws(
      () => secondLock.acquire({
        workspaceStateKey: WORKSPACE,
        transactionId: `tx_${"d".repeat(32)}`
      }),
      (error) => error?.code === "TRANSACTION_BUSY"
    );
    handle.release();
    assert.doesNotThrow(() => secondLock.acquire({
      workspaceStateKey: WORKSPACE,
      transactionId: `tx_${"d".repeat(32)}`
    }).release());
  } finally {
    firstRegistry.dispose();
    secondRegistry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("store refuses a symlinked change-set state directory", (t) => {
  const stateRoot = root();
  const external = root();
  const changesets = path.join(stateRoot, "changesets");
  try {
    try {
      fs.symlinkSync(external, changesets, process.platform === "win32" ? "junction" : "dir");
    } catch {
      t.skip("directory link creation is unavailable on this platform");
      return;
    }
    const subject = store(stateRoot);
    assert.throws(
      () => subject.create(input("e")),
      (error) => error?.code === "CHANGE_SET_INTEGRITY_FAILURE"
    );
    assert.deepEqual(fs.readdirSync(external), []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

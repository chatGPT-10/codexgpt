import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MovePlanner } from "../dist/moves/index.js";
import {
  TransactionManifestStore,
  TransactionManifestV2Store,
  manifestPathFor,
  transactionManifestV2Schema
} from "../dist/transactions/index.js";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function withTempWorkspace(action) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-phase3d-move-")));
  const workspace = { id: "ws_phase3d", root, openedAt: new Date(0).toISOString() };
  try {
    return await action({ root, workspace });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function planner(overrides = {}) {
  return new MovePlanner({
    blockedGlobs: [".git/**", ".codexpro-txn-**"],
    moveMaxFileBytes: 64 * 1024 * 1024,
    moveMaxTotalBytes: 256 * 1024 * 1024,
    moveHashConcurrency: 4,
    ...overrides
  });
}

function filesUnder(root) {
  const result = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      result.push({ path: path.relative(root, absolute).replaceAll("\\", "/"), type: stat.isDirectory() ? "dir" : "file" });
      if (stat.isDirectory()) visit(absolute);
    }
  };
  visit(root);
  return result;
}

test("move planner proves stable handle facts and leaves preview state unchanged", async () => {
  await withTempWorkspace(async ({ root, workspace }) => {
    fs.writeFileSync(path.join(root, "a.txt"), "alpha");
    const before = filesUnder(root);
    const batch = await planner().inspect(workspace, [{
      source: "a.txt",
      destination: "nested/b.txt",
      expectedSha256: sha("alpha")
    }], true);
    try {
      assert.equal(batch.operations.length, 1);
      assert.equal(batch.totalBytes, 5);
      assert.deepEqual(batch.createdDirectories, ["nested"]);
      assert.match(batch.operations[0].objectIdentity.device, /^[1-9][0-9]*$/);
      assert.match(batch.operations[0].objectIdentity.fileId, /^[1-9][0-9]*$/);
      assert.equal(batch.operations[0].version.sha256, sha("alpha"));
      assert.equal(batch.operations[0].version.bytes, 5);
      assert.equal(fs.readFileSync(path.join(root, "a.txt"), "utf8"), "alpha");
      assert.equal(fs.existsSync(path.join(root, "nested")), false);
      assert.deepEqual(filesUnder(root), before);
    } finally {
      await batch.close();
    }
  });
});

test("move planner accepts chains cycles and duplicate-object hard-link sources", async () => {
  await withTempWorkspace(async ({ root, workspace }) => {
    fs.writeFileSync(path.join(root, "a.txt"), "A");
    fs.writeFileSync(path.join(root, "b.txt"), "B");
    fs.linkSync(path.join(root, "a.txt"), path.join(root, "alias.txt"));
    const batch = await planner().inspect(workspace, [
      { source: "a.txt", destination: "b.txt", expectedSha256: sha("A") },
      { source: "b.txt", destination: "a.txt", expectedSha256: sha("B") },
      { source: "alias.txt", destination: "alias-moved.txt", expectedSha256: sha("A") }
    ], false);
    try {
      assert.equal(batch.operations.length, 3);
      assert.equal(batch.operations[0].objectIdentity.fileId, batch.operations[2].objectIdentity.fileId);
      assert.notEqual(batch.operations[0].sourceComparisonKey, batch.operations[2].sourceComparisonKey);
    } finally {
      await batch.close();
    }
  });
});

test("move planner rejects wrong hashes duplicates unrelated targets and missing parents with zero mutation", async () => {
  await withTempWorkspace(async ({ root, workspace }) => {
    fs.writeFileSync(path.join(root, "a.txt"), "A");
    fs.writeFileSync(path.join(root, "occupied.txt"), "X");
    const before = filesUnder(root);
    await assert.rejects(
      planner().inspect(workspace, [{ source: "a.txt", destination: "b.txt", expectedSha256: sha("wrong") }], false),
      (error) => error.code === "FILE_VERSION_CONFLICT"
    );
    await assert.rejects(
      planner().inspect(workspace, [
        { source: "a.txt", destination: "b.txt", expectedSha256: sha("A") },
        { source: "a.txt", destination: "c.txt", expectedSha256: sha("A") }
      ], false),
      (error) => error.code === "DUPLICATE_SOURCE"
    );
    await assert.rejects(
      planner().inspect(workspace, [{ source: "a.txt", destination: "occupied.txt", expectedSha256: sha("A") }], false),
      (error) => error.code === "TARGET_EXISTS"
    );
    await assert.rejects(
      planner().inspect(workspace, [{ source: "a.txt", destination: "missing/b.txt", expectedSha256: sha("A") }], false),
      (error) => error.code === "PARENT_DIRECTORY_NOT_FOUND"
    );
    assert.deepEqual(filesUnder(root), before);
  });
});

test("native Windows case-only move is distinguished from exact no-op", { skip: process.platform !== "win32" }, async () => {
  await withTempWorkspace(async ({ root, workspace }) => {
    fs.writeFileSync(path.join(root, "Case.txt"), "case");
    await assert.rejects(
      planner().inspect(workspace, [{ source: "Case.txt", destination: "Case.txt", expectedSha256: sha("case") }], false),
      (error) => error.code === "MOVE_NO_OP"
    );
    const batch = await planner().inspect(workspace, [{
      source: "Case.txt",
      destination: "case.txt",
      expectedSha256: sha("case")
    }], false);
    try {
      assert.equal(batch.operations[0].sourceComparisonKey, batch.operations[0].destinationComparisonKey);
      assert.equal(batch.operations[0].destinationRelativePath, "case.txt");
    } finally {
      await batch.close();
    }
  });
});

function manifestV2(overrides = {}) {
  return {
    schemaVersion: 2,
    transactionId: "tx_" + "1".repeat(32),
    changeSetId: "cs_" + "2".repeat(32),
    workspaceStateKey: "wsk_" + "3".repeat(32),
    generation: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    state: "preparing",
    operations: [{
      operationId: "op_move_001",
      kind: "move",
      state: "planned",
      sourceRelativePath: "a.txt",
      destinationRelativePath: "b.txt",
      sourceComparisonKey: "a.txt",
      destinationComparisonKey: "b.txt",
      sourceExistingParentRelativePath: ".",
      sourceExistingParentIdentity: "parent_" + "4".repeat(24),
      destinationExistingParentRelativePath: ".",
      destinationExistingParentIdentity: "parent_" + "4".repeat(24),
      stageRelativePath: ".codexpro-txn-1234567890abcdef.move",
      objectIdentity: { device: "1", fileId: "2" },
      version: { sha256: "a".repeat(64), bytes: 1, mode: 420, atimeMs: 1, mtimeMs: 1, ctimeMs: 1 }
    }],
    plannedCreatedDirectories: [],
    createdDirectories: [],
    createdDirectoryIdentities: {},
    plannedRemovedDirectories: [],
    plannedRemovedDirectoryIdentities: {},
    removedDirectories: [],
    requiredParticipants: ["audit", "change_set"],
    participantReferences: { audit: "audit:tx_111", change_set: "change_set:cs_222" },
    participantFacts: { audit: "pending", change_set: "pending" },
    ...overrides
  };
}

test("Manifest V2 is strict authenticated monotonic and coexists with V1 enumeration", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-phase3d-manifest-"));
  const key = Buffer.alloc(32, 7);
  const v2 = new TransactionManifestV2Store(stateRoot, key);
  try {
    const initial = manifestV2();
    assert.equal(transactionManifestV2Schema.safeParse({ ...initial, extra: true, manifestMac: "0".repeat(64) }).success, false);
    v2.writeInitial(initial);
    const persisted = v2.read(initial.workspaceStateKey, initial.transactionId);
    assert.equal(persisted.schemaVersion, 2);
    assert.match(persisted.manifestMac, /^[a-f0-9]{64}$/);
    const next = {
      ...persisted,
      generation: 2,
      updatedAt: "2026-07-15T00:00:01.000Z",
      state: "prepared"
    };
    v2.writeNext(persisted, next);
    const persistedNext = v2.read(initial.workspaceStateKey, initial.transactionId);
    assert.equal(persistedNext.generation, 2);
    assert.throws(() => v2.writeNext(persistedNext, { ...persistedNext, generation: 4 }), /monotonic/i);

    const v1 = new TransactionManifestStore(stateRoot);
    assert.deepEqual(v1.list(initial.workspaceStateKey), []);
    assert.equal(v2.list(initial.workspaceStateKey).length, 1);

    const file = manifestPathFor(stateRoot, initial.workspaceStateKey, initial.transactionId);
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.state = "committed";
    fs.writeFileSync(file, JSON.stringify(tampered));
    assert.throws(() => v2.read(initial.workspaceStateKey, initial.transactionId), /authentication/i);
  } finally {
    v2.dispose();
    key.fill(0);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

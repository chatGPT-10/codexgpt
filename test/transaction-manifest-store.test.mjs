import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { z } from "zod";
import {
  AtomicJsonFileStore,
  TransactionManifestStore,
  manifestPathFor
} from "../dist/transactions/index.js";

function withTempDirectory(action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-manifest-store-"));
  try {
    return action(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function manifest(generation = 1, state = "preparing") {
  return {
    schemaVersion: 1,
    transactionId: "tx_" + "1".repeat(32),
    changeSetId: "cs_" + "2".repeat(32),
    workspaceStateKey: "wsk_" + "3".repeat(32),
    generation,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    state,
    operations: [{
      operationId: "op_replace_a",
      kind: "replace",
      state: "staged",
      relativePath: "src/a.txt",
      comparisonKey: "src/a.txt",
      stageRelativePath: "src/.codexgpt-txn-aaaaaaaaaaaaaaaa.stage",
      backupRelativePath: null,
      before: {
        exists: true,
        sha256: "a".repeat(64),
        identity: "fid_" + "4".repeat(24),
        bytes: 1,
        metadata: { mode: 420, atimeMs: 1, mtimeMs: 1 }
      },
      after: { exists: true, sha256: "b".repeat(64), bytes: 1 }
    }],
    createdDirectories: [],
    requiredParticipants: [],
    participantFacts: {}
  };
}

test("atomic JSON replacement uses exclusive sibling temporary and durable ordering", () => withTempDirectory((stateRoot) => {
  const operations = [];
  const store = new AtomicJsonFileStore(stateRoot, z.object({ generation: z.number().int() }).strict(), {
    randomBytes: (size) => Buffer.alloc(size, 7),
    mkdirSync(directory, options) {
      operations.push("mkdir-parent");
      return fs.mkdirSync(directory, options);
    },
    openSync(file, flags, mode) {
      if (flags === "wx") operations.push("open-temp-wx");
      return fs.openSync(file, flags, mode);
    },
    writeFileSync(fd, data, encoding) {
      operations.push("write-temp");
      fs.writeFileSync(fd, data, encoding);
    },
    fsyncSync(fd) {
      operations.push("fsync-temp");
      fs.fsyncSync(fd);
    },
    closeSync(fd) {
      operations.push("close-temp");
      fs.closeSync(fd);
    },
    renameSync(from, to) {
      operations.push("rename-temp-over-target");
      fs.renameSync(from, to);
    },
    unlinkSync: fs.unlinkSync,
    readFileSync: fs.readFileSync,
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    syncDirectory() {
      operations.push("sync-parent-attempt");
      return "supported";
    }
  });
  const file = path.join(stateRoot, "nested", "record.json");
  assert.equal(store.write(file, { generation: 1 }), "supported");
  assert.deepEqual(store.read(file), { generation: 1 });
  assert.deepEqual(operations, [
    "mkdir-parent",
    "open-temp-wx",
    "write-temp",
    "fsync-temp",
    "close-temp",
    "rename-temp-over-target",
    "sync-parent-attempt"
  ]);
  const siblings = fs.readdirSync(path.dirname(file));
  assert.deepEqual(siblings, ["record.json"]);
}));

test("atomic JSON store confines paths and preserves last valid value on failure", () => withTempDirectory((stateRoot) => {
  const schema = z.object({ generation: z.number().int().positive() }).strict();
  const file = path.join(stateRoot, "record.json");
  const store = new AtomicJsonFileStore(stateRoot, schema);
  store.write(file, { generation: 1 });
  assert.throws(() => store.write(path.join(stateRoot, "..", "outside.json"), { generation: 2 }));

  const failing = new AtomicJsonFileStore(stateRoot, schema, {
    ...AtomicJsonFileStore.defaultDependencies(),
    renameSync() {
      const error = new Error("injected rename failure");
      error.code = "EIO";
      throw error;
    }
  });
  assert.throws(() => failing.write(file, { generation: 2 }));
  assert.deepEqual(store.read(file), { generation: 1 });
  assert.deepEqual(fs.readdirSync(stateRoot), ["record.json"]);
}));

test("manifest store enforces initial and exactly monotonic transitions", () => withTempDirectory((stateRoot) => {
  const store = new TransactionManifestStore(stateRoot);
  const initial = manifest();
  store.writeInitial(initial);
  assert.deepEqual(store.read(initial.workspaceStateKey, initial.transactionId), initial);
  const next = { ...initial, generation: 2, state: "prepared" };
  store.writeNext(initial, next);
  assert.equal(store.read(initial.workspaceStateKey, initial.transactionId).generation, 2);
  assert.throws(() => store.writeNext(next, { ...next, generation: 4 }), /monotonic/i);
  assert.throws(() => store.writeInitial({ ...initial, generation: 2 }), /initial/i);
}));

test("manifest enumeration ignores temporary files and fails closed on invalid committed JSON", () => withTempDirectory((stateRoot) => {
  const store = new TransactionManifestStore(stateRoot);
  const initial = manifest();
  store.writeInitial(initial);
  const directory = path.dirname(manifestPathFor(stateRoot, initial.workspaceStateKey, initial.transactionId));
  fs.writeFileSync(path.join(directory, "ignored.json.tmp-deadbeef"), "{}", "utf8");
  assert.equal(store.list(initial.workspaceStateKey).length, 1);
  fs.writeFileSync(path.join(directory, "tx_" + "9".repeat(32) + ".json"), "{", "utf8");
  assert.throws(() => store.list(initial.workspaceStateKey), (error) => error.code === "TRANSACTION_STATE_CORRUPT");
}));

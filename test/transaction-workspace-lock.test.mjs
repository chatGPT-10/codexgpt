import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ProcessInstanceRegistry,
  WorkspaceMutationLock,
  classifyProcessLiveness
} from "../dist/transactions/index.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-lock-"));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

const wskA = "wsk_" + "1".repeat(32);
const wskB = "wsk_" + "2".repeat(32);
const txA = "tx_" + "3".repeat(32);
const txB = "tx_" + "4".repeat(32);

test("process liveness is conservative", () => {
  assert.equal(classifyProcessLiveness(process.pid), "alive");
  assert.equal(classifyProcessLiveness(987654321, () => {
    const error = new Error("missing");
    error.code = "ESRCH";
    throw error;
  }), "dead");
  assert.equal(classifyProcessLiveness(1, () => {
    const error = new Error("denied");
    error.code = "EPERM";
    throw error;
  }), "unknown");
});

test("workspace locks serialize one workspace but allow distinct workspaces", () => {
  const root = tempRoot();
  try {
    const registry = new ProcessInstanceRegistry(root);
    const firstLock = new WorkspaceMutationLock(root, registry);
    const secondLock = new WorkspaceMutationLock(root, registry);
    const first = firstLock.acquire({ workspaceStateKey: wskA, transactionId: txA });
    const other = secondLock.acquire({ workspaceStateKey: wskB, transactionId: txB });
    assert.throws(
      () => secondLock.acquire({ workspaceStateKey: wskA, transactionId: txB }),
      (error) => error.code === "TRANSACTION_BUSY"
    );
    first.release();
    const replacement = secondLock.acquire({ workspaceStateKey: wskA, transactionId: txB });
    replacement.release();
    other.release();
    registry.dispose();
  } finally {
    cleanup(root);
  }
});

test("unknown liveness and unverifiable PID reuse remain busy", () => {
  const root = tempRoot();
  try {
    const ownerRegistry = new ProcessInstanceRegistry(root);
    const owner = new WorkspaceMutationLock(root, ownerRegistry).acquire({ workspaceStateKey: wskA, transactionId: txA });
    const contenderRegistry = new ProcessInstanceRegistry(root);
    const unknown = new WorkspaceMutationLock(root, contenderRegistry, {
      kill() {
        const error = new Error("denied");
        error.code = "EPERM";
        throw error;
      }
    });
    assert.throws(() => unknown.acquire({ workspaceStateKey: wskA, transactionId: txB }), (error) => error.code === "TRANSACTION_BUSY");
    fs.rmSync(ownerRegistry.recordPath, { force: true });
    const alive = new WorkspaceMutationLock(root, contenderRegistry, { kill() {} });
    assert.throws(() => alive.acquire({ workspaceStateKey: wskA, transactionId: txB }), (error) => error.code === "TRANSACTION_BUSY");
    owner.release();
    contenderRegistry.dispose();
    ownerRegistry.dispose();
  } finally {
    cleanup(root);
  }
});

test("dead owner directory is atomically quarantined before a new claim", () => {
  const root = tempRoot();
  try {
    const ownerRegistry = new ProcessInstanceRegistry(root);
    const ownerLock = new WorkspaceMutationLock(root, ownerRegistry);
    ownerLock.acquire({ workspaceStateKey: wskA, transactionId: txA });
    const contenderRegistry = new ProcessInstanceRegistry(root);
    const contender = new WorkspaceMutationLock(root, contenderRegistry, {
      kill() {
        const error = new Error("dead");
        error.code = "ESRCH";
        throw error;
      },
      randomBytes(size) {
        return Buffer.alloc(size, 9);
      }
    });
    const claimed = contender.acquire({ workspaceStateKey: wskA, transactionId: txB });
    assert.equal(claimed.recoveryDirectories.length, 1);
    assert.match(path.basename(claimed.recoveryDirectories[0]), /\.recovery-[a-f0-9]{16}$/);
    claimed.release();
    contenderRegistry.dispose();
    ownerRegistry.dispose();
  } finally {
    cleanup(root);
  }
});

test("malformed owner data is never deleted and release requires exact ownership", () => {
  const root = tempRoot();
  try {
    const registry = new ProcessInstanceRegistry(root);
    const lock = new WorkspaceMutationLock(root, registry);
    const handle = lock.acquire({ workspaceStateKey: wskA, transactionId: txA });
    const ownerPath = path.join(handle.lockDirectory, "owner.json");
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    fs.writeFileSync(ownerPath, JSON.stringify({ ...owner, lockToken: "lock_" + "f".repeat(32) }), "utf8");
    assert.throws(() => handle.release(), (error) => error.code === "TRANSACTION_BUSY");
    assert.equal(fs.existsSync(handle.lockDirectory), true);
    fs.writeFileSync(ownerPath, "{", "utf8");
    assert.throws(() => lock.acquire({ workspaceStateKey: wskA, transactionId: txB }), (error) => error.code === "TRANSACTION_STATE_CORRUPT");
    assert.equal(fs.existsSync(handle.lockDirectory), true);
    registry.dispose();
  } finally {
    cleanup(root);
  }
});

test("process instance record contains no workspace or credential facts", () => {
  const root = tempRoot();
  try {
    const registry = new ProcessInstanceRegistry(root);
    const text = fs.readFileSync(registry.recordPath, "utf8");
    assert.equal(text.includes("workspace"), false);
    assert.equal(text.includes("token"), false);
    assert.equal(text.includes(root), false);
    registry.dispose();
  } finally {
    cleanup(root);
  }
});

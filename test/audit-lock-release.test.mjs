import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuditWriterLock } from "../dist/audit/lock.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function stateRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-audit-release-"));
}

function errno(code) {
  return Object.assign(new Error(code), { code });
}

test("audit writer release retries a transient Windows rename conflict", () => {
  const root = stateRoot();
  const registry = new ProcessInstanceRegistry(root);
  let renameCalls = 0;
  try {
    const lock = new AuditWriterLock(root, registry, {
      releaseRenameSync(source, destination) {
        renameCalls += 1;
        if (renameCalls === 1) throw errno("EPERM");
        fs.renameSync(source, destination);
      },
      releaseRetryDelay() {}
    });
    const handle = lock.acquire();
    handle.release();
    assert.equal(renameCalls, 2);
    assert.equal(fs.existsSync(handle.lockDirectory), false);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("audit writer release does not retry an unclassified rename failure", () => {
  const root = stateRoot();
  const registry = new ProcessInstanceRegistry(root);
  let renameCalls = 0;
  try {
    const lock = new AuditWriterLock(root, registry, {
      releaseRenameSync() {
        renameCalls += 1;
        throw errno("EIO");
      },
      releaseRetryDelay() {
        throw new Error("non-transient failure must not sleep");
      }
    });
    const handle = lock.acquire();
    assert.throws(
      () => handle.release(),
      (error) => error?.code === "AUDIT_BUSY" && /released safely/.test(error.message)
    );
    assert.equal(renameCalls, 1);
    assert.equal(fs.existsSync(handle.lockDirectory), true);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("audit writer release bounds retries and preserves an active lock", () => {
  const root = stateRoot();
  const registry = new ProcessInstanceRegistry(root);
  let renameCalls = 0;
  const delays = [];
  try {
    const lock = new AuditWriterLock(root, registry, {
      releaseRenameSync() {
        renameCalls += 1;
        throw errno("EBUSY");
      },
      releaseRetryDelay(milliseconds) {
        delays.push(milliseconds);
      }
    });
    const handle = lock.acquire();
    assert.throws(
      () => handle.release(),
      (error) => error?.code === "AUDIT_BUSY" && /released safely/.test(error.message)
    );
    assert.equal(renameCalls, 4);
    assert.deepEqual(delays, [1, 2, 4]);
    assert.equal(fs.existsSync(handle.lockDirectory), true);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { AuthProcessInstanceRegistry, AuthStateLock } = await tsImport("../src/auth/index.ts", import.meta.url);

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-auth-lock-"));
}

test("second live deployment owner fails with exact pid and run identifier", () => {
  const stateRoot = root();
  const firstRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 1001 });
  const secondRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 1002 });
  const liveKill = () => {};
  const first = new AuthStateLock(stateRoot, firstRegistry, { kill: liveKill });
  const second = new AuthStateLock(stateRoot, secondRegistry, { kill: liveKill });
  const handle = first.acquire("deployment_binding_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  try {
    assert.throws(
      () => second.acquire("deployment_binding_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      (error) => error?.code === "OAUTH_STATE_BUSY" && /pid 1001, run authrun_[a-f0-9]{32}/.test(error.message)
    );
  } finally {
    handle.release();
    firstRegistry.dispose();
    secondRegistry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("verified dead owner is quarantined and never broadly deleted", () => {
  const stateRoot = root();
  const firstRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 2001 });
  const secondRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 2002 });
  const first = new AuthStateLock(stateRoot, firstRegistry, { kill: () => {} });
  const old = first.acquire("registry");
  const second = new AuthStateLock(stateRoot, secondRegistry, {
    kill(pid) {
      if (pid === 2001) {
        const error = new Error("dead");
        error.code = "ESRCH";
        throw error;
      }
    }
  });
  const replacement = second.acquire("registry");
  try {
    assert.equal(replacement.recoveryDirectories.length, 1);
    assert.equal(fs.existsSync(replacement.recoveryDirectories[0]), true);
    assert.equal(fs.existsSync(path.join(replacement.recoveryDirectories[0], "owner.json")), true);
    assert.throws(() => old.release(), (error) => error?.code === "OAUTH_STATE_BUSY");
  } finally {
    replacement.release();
    firstRegistry.dispose();
    secondRegistry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("dead-looking lock without exact instance evidence remains untouched", () => {
  const stateRoot = root();
  const firstRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 3001 });
  const secondRegistry = new AuthProcessInstanceRegistry(stateRoot, { pid: 3002 });
  const first = new AuthStateLock(stateRoot, firstRegistry, { kill: () => {} });
  const handle = first.acquire("installation");
  fs.unlinkSync(firstRegistry.recordPath);
  const second = new AuthStateLock(stateRoot, secondRegistry, {
    kill(pid) {
      if (pid === 3001) {
        const error = new Error("dead");
        error.code = "ESRCH";
        throw error;
      }
    }
  });
  try {
    assert.throws(
      () => second.acquire("installation"),
      (error) => error?.code === "OAUTH_STATE_BUSY" && /lacks exact instance evidence/.test(error.message)
    );
    assert.equal(fs.existsSync(handle.lockDirectory), true);
  } finally {
    secondRegistry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

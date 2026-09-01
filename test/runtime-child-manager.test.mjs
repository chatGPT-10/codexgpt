import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRuntimeChildManager } from "../dist/control/runtimeChildManager.js";
import { createRuntimeOwnershipSupervisor } from "../dist/control/runtimeOwnership.js";

test("child manager records an exact owned starting process and follows its exit", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-runtime-child-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const creation = async (pid) => pid === 4242 ? "proc-4242" : null;
  const ownership = createRuntimeOwnershipSupervisor({
    workspaceRoot: "D:\\Dev\\target",
    stateRoot,
    controllerId: `lch_${"a".repeat(32)}`,
    processCreationTime: creation
  });
  const child = new EventEmitter();
  child.pid = 4242;
  const manager = createRuntimeChildManager({
    ownership,
    launch: () => child,
    processCreationTime: creation,
    terminate: async () => true
  });
  assert.deepEqual(await manager.start(), { state: "owned_starting", pid: 4242 });
  child.emit("exit", 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await ownership.snapshot(), { state: "exited", pid: 4242 });
});

test("child manager reports running only after its local health gate succeeds", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-runtime-ready-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const creation = async (pid) => pid === 4343 ? "proc-4343" : null;
  const ownership = createRuntimeOwnershipSupervisor({
    workspaceRoot: "D:\\Dev\\target",
    stateRoot,
    controllerId: `lch_${"b".repeat(32)}`,
    processCreationTime: creation
  });
  const child = new EventEmitter();
  child.pid = 4343;
  const manager = createRuntimeChildManager({
    ownership,
    launch: () => child,
    processCreationTime: creation,
    waitForReady: async () => true,
    terminate: async () => true
  });
  assert.deepEqual(await manager.start(), { state: "owned_running", pid: 4343 });
});

test("child manager stops only its own exact child", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-runtime-stop-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  let live = true;
  const creation = async (pid) => pid === 4444 && live ? "proc-4444" : null;
  const ownership = createRuntimeOwnershipSupervisor({ workspaceRoot: "D:\\Dev\\target", stateRoot, controllerId: `lch_${"c".repeat(32)}`, processCreationTime: creation });
  const child = new EventEmitter();
  child.pid = 4444;
  let terminated = 0;
  const manager = createRuntimeChildManager({ ownership, launch: () => child, processCreationTime: creation, terminate: async () => { terminated += 1; live = false; return true; } });
  await manager.start();
  assert.deepEqual(await manager.stop(), { state: "exited", pid: 4444 });
  assert.equal(terminated, 1);
});

test("child manager restarts only after exact stop and fresh health", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-runtime-restart-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const live = new Set();
  let launches = 0;
  let terminated = 0;
  const creation = async (pid) => live.has(pid) ? `proc-${pid}` : null;
  const ownership = createRuntimeOwnershipSupervisor({ workspaceRoot: "D:\\Dev\\target", stateRoot, controllerId: `lch_${"d".repeat(32)}`, processCreationTime: creation });
  const manager = createRuntimeChildManager({
    ownership,
    launch: () => {
      const child = new EventEmitter();
      child.pid = 5000 + launches;
      launches += 1;
      live.add(child.pid);
      return child;
    },
    processCreationTime: creation,
    waitForReady: async () => true,
    terminate: async (pid) => { terminated += 1; live.delete(pid); return true; }
  });
  assert.deepEqual(await manager.start(), { state: "owned_running", pid: 5000 });
  assert.deepEqual(await manager.restart(), { state: "owned_running", pid: 5001 });
  assert.equal(terminated, 1);
  assert.equal(launches, 2);
});

test("child manager rejects a conflicting lifecycle action while start is in progress", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-runtime-serial-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const creation = async (pid) => pid === 6000 ? "proc-6000" : null;
  const ownership = createRuntimeOwnershipSupervisor({ workspaceRoot: "D:\\Dev\\target", stateRoot, controllerId: `lch_${"e".repeat(32)}`, processCreationTime: creation });
  const child = new EventEmitter();
  child.pid = 6000;
  let releaseHealth;
  let enteredHealth;
  const healthEntered = new Promise((resolve) => { enteredHealth = resolve; });
  const manager = createRuntimeChildManager({
    ownership,
    launch: () => child,
    processCreationTime: creation,
    waitForReady: () => new Promise((resolve) => { releaseHealth = () => resolve(true); enteredHealth(); }),
    terminate: async () => true
  });
  const starting = manager.start();
  await healthEntered;
  await assert.rejects(manager.stop(), { code: "CONTROL_RUNTIME_OPERATION_IN_PROGRESS" });
  releaseHealth();
  assert.deepEqual(await starting, { state: "owned_running", pid: 6000 });
});

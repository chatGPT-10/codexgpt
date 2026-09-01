import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRuntimeOwnershipSupervisor } from "../dist/control/runtimeOwnership.js";

test("runtime ownership requires the same controller and exact process creation time", async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-lifecycle-owner-"));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  const creationTimes = new Map([[4242, "proc-4242"]]);
  const options = {
    workspaceRoot: "D:\\Dev\\target",
    stateRoot,
    processCreationTime: async (pid) => creationTimes.get(pid) ?? null,
    now: () => Date.parse("2026-09-01T12:00:00.000Z")
  };
  const owner = createRuntimeOwnershipSupervisor({ ...options, controllerId: `lch_${"a".repeat(32)}` });
  assert.deepEqual(await owner.snapshot(), { state: "none", pid: null });
  assert.deepEqual(await owner.recordOwnedRuntime({ pid: 4242, processCreationTime: "proc-4242" }), {
    state: "owned_starting", pid: 4242
  });
  assert.deepEqual(await owner.markRunning(), { state: "owned_running", pid: 4242 });

  const restartedHost = createRuntimeOwnershipSupervisor({ ...options, controllerId: `lch_${"b".repeat(32)}` });
  assert.deepEqual(await restartedHost.snapshot(), { state: "foreign_or_stale", pid: 4242 });
  creationTimes.set(4242, "reused-pid");
  assert.deepEqual(await owner.snapshot(), { state: "foreign_or_stale", pid: 4242 });
  await assert.rejects(
    () => owner.recordOwnedRuntime({ pid: 4242, processCreationTime: "proc-4242" }),
    /CONTROL_RUNTIME_IDENTITY_STALE/
  );
});

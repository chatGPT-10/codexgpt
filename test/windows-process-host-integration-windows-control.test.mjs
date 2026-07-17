import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { WindowsProcessHostClient } = await tsImport("../fixtures/ts-imports/process-host-imports.ts", import.meta.url);
const windowsOnly = process.platform === "win32" ? test : test.skip;

windowsOnly("production client starts the manifest-verified host and owns an independent lifecycle", async (t) => {
  const first = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  const second = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(async () => Promise.allSettled([first.close(), second.close()]));

  assert.notEqual(first.hostId, second.hostId);
  assert.notEqual(first.childProcessId, second.childProcessId);
  const [firstCapabilities, secondCapabilities] = await Promise.all([
    first.request("capabilities", {}),
    second.request("capabilities", {})
  ]);
  assert.equal(firstCapabilities.body.ok, true);
  assert.equal(secondCapabilities.body.ok, true);

  await first.close();
  const stillAlive = await second.request("capabilities", {});
  assert.equal(stillAlive.body.ok, true);
});

windowsOnly("production host enforces its native monotonic deadline while Node remains responsive", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: [path.resolve("fixtures/native-host-process-tree-child.mjs"), "5000"],
    stdinBase64: "",
    timeoutMs: 250,
    stdoutLimitBytes: 65536,
    stderrLimitBytes: 65536,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 10_000 });
  assert.equal(result.body.timedOut, true);
  assert.equal(result.body.jobAssignedAtCreation, true);
});

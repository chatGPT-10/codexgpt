import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { ProcessManagerV3 } = await tsImport("../src/process/processManager.ts", import.meta.url);
const { RunCommandRuntimeV3 } = await tsImport("../src/process/runCommand.ts", import.meta.url);
const { WindowsProcessHostRuntime } = await tsImport("../src/process/windowsHostClient.ts", import.meta.url);
const { WindowsPersistentProcessBackendV3 } = await tsImport("../src/process/windowsPersistentBackend.ts", import.meta.url);

const profile = {
  ambientFilesystem: true,
  ambientCredentials: true,
  ambientRegistry: true,
  unrestrictedNetwork: true,
  requireBlockedPathEnforcement: false,
  requireCredentialIsolation: false,
  requireRegistryIsolation: false,
  requireDeviceIsolation: false,
  requireNetworkEnforcement: false,
  requireSandbox: false
};

function binding(file, kind, backendId) {
  const realPath = fs.realpathSync.native(file);
  const stat = fs.statSync(realPath, { bigint: true });
  const sha256 = createHash("sha256").update(fs.readFileSync(realPath)).digest("hex");
  return { schemaVersion: 1, backendId, backendVersion: kind === "powershell" ? "5.1" : process.versions.node, kind, source: "reviewed_explicit", path: realPath, realPath, sha256, identity: `sha256:${sha256}:dev:${stat.dev}:ino:${stat.ino}` };
}

test("persistent ConPTY keeps close fatality isolated and supports UTF-8 input, resize, ETX, and exact cleanup", { skip: process.platform !== "win32" }, async (t) => {
  const host = new WindowsProcessHostRuntime();
  const powerShell = binding("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell", "windows-powershell");
  const execution = new RunCommandRuntimeV3({
    config: { executionProfile: "full_access", defaultRoot: process.cwd() },
    fullAccessProfile: profile,
    hostRuntime: host,
    contextFingerprint: () => "conpty-control-owner",
    policyRevision: () => "policy_conpty",
    evidenceRevision: () => "evidence_conpty",
    backendResolver: () => powerShell,
    cwdIdentity: () => `sha256:${"d".repeat(64)}`
  });
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "conpty-control-owner",
    startResourceResolver: execution,
    backend: new WindowsPersistentProcessBackendV3({ hostRuntime: host, executionRuntime: execution })
  });
  try {
    const client = await host.get();
    const hung = (await client.request("conpty_close_hang_probe", {}, { timeoutMs: 20_000 })).body;
    assert.equal(hung.code, "HOST_FATAL_CONPTY_CLOSE");

    const started = await manager.start({
      command: { kind: "powershell", script: "Write-Output 'CXP4_INTERACTIVE_INITIAL_你好'", edition: "windows" },
      cwd: { kind: "absolute_local", path: process.cwd() },
      mode: "full_access",
      terminal: "conpty",
      lifetime_ms: 60_000,
      timeout_ms: 30_000
    });
    const id = started.data.process_id;
    let output = "";
    let observed;
    for (let attempt = 0; attempt < 120 && !output.includes("CXP4_INTERACTIVE_INITIAL_你好"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      observed = manager.read(id);
      output = observed.data.output.chunks.map((chunk) => chunk.text).join("");
    }
    assert.match(output, /CXP4_INTERACTIVE_INITIAL_你好/, JSON.stringify(observed));
    assert.equal(started.data.backend.terminal, "conpty");

    await manager.write(id, "Write-Output 'CXP4_INTERACTIVE_NEXT_🙂'\r\n");
    await manager.resize(id, 100, 30);
    for (let attempt = 0; attempt < 120 && !output.includes("CXP4_INTERACTIVE_NEXT_🙂"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      output = manager.read(id).data.output.chunks.map((chunk) => chunk.text).join("");
    }
    assert.match(output, /CXP4_INTERACTIVE_NEXT_🙂/);
    assert.equal(await manager.interrupt(id), "delivered");
    assert.deepEqual([...new Set(manager.read(id).data.output.chunks.map((chunk) => chunk.stream))], ["terminal"]);

    const race = await Promise.allSettled([
      manager.write(id, "Write-Output 'race'\r\n"),
      manager.resize(id, 120, 40),
      manager.terminate(id)
    ]);
    assert.equal(race.some((entry) => entry.status === "fulfilled"), true);
    assert.match(manager.read(id).data.status, /^(terminated|failed|exited)$/);
  } finally {
    await manager.close();
    execution.close();
    await host.close();
  }
});

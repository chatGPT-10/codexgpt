import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { ProcessManagerV3 } = await tsImport("../src/process/processManager.ts", import.meta.url);
const { RunCommandRuntimeV3 } = await tsImport("../src/process/runCommand.ts", import.meta.url);
const { WindowsProcessHostRuntime } = await tsImport("../src/process/windowsHostClient.ts", import.meta.url);
const { WindowsPersistentProcessBackendV3 } = await tsImport("../src/process/windowsPersistentBackend.ts", import.meta.url);

const profile = { ambientFilesystem: true, ambientCredentials: true, ambientRegistry: true, unrestrictedNetwork: true, requireBlockedPathEnforcement: false, requireCredentialIsolation: false, requireRegistryIsolation: false, requireDeviceIsolation: false, requireNetworkEnforcement: false, requireSandbox: false };

test("native persistent process keeps exact ownership, pipes, and idempotent Job termination", { skip: process.platform !== "win32" }, async () => {
  const host = new WindowsProcessHostRuntime();
  const realPath = fs.realpathSync.native(process.execPath);
  const stat = fs.statSync(realPath, { bigint: true });
  const sha256 = createHash("sha256").update(fs.readFileSync(realPath)).digest("hex");
  const binding = { schemaVersion: 1, backendId: "managed-node", backendVersion: process.versions.node, kind: "argv", source: "reviewed_explicit", path: realPath, realPath, sha256, identity: `sha256:${sha256}:dev:${stat.dev}:ino:${stat.ino}` };
  const powerShellPath = fs.realpathSync.native("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  const powerShellStat = fs.statSync(powerShellPath, { bigint: true });
  const powerShellSha256 = createHash("sha256").update(fs.readFileSync(powerShellPath)).digest("hex");
  const powerShellBinding = { schemaVersion: 1, backendId: "windows-powershell", backendVersion: "5.1", kind: "powershell", source: "windows_builtin", path: powerShellPath, realPath: powerShellPath, sha256: powerShellSha256, identity: `sha256:${powerShellSha256}:dev:${powerShellStat.dev}:ino:${powerShellStat.ino}` };
  let context = "native-session";
  const execution = new RunCommandRuntimeV3({ config: { executionProfile: "full_access", defaultRoot: process.cwd() }, fullAccessProfile: profile, hostRuntime: host, contextFingerprint: () => context, policyRevision: () => "policy_native", evidenceRevision: () => "evidence_native", backendResolver: (command) => command.kind === "powershell" ? powerShellBinding : binding, cwdIdentity: () => `sha256:${"a".repeat(64)}` });
  const manager = new ProcessManagerV3({ contextFingerprint: () => context, startResourceResolver: execution, backend: new WindowsPersistentProcessBackendV3({ hostRuntime: host, executionRuntime: execution }) });
  try {
    const started = await manager.start({ command: { kind: "argv", executable: realPath, args: ["-e", "process.stdin.on('data',d=>process.stdout.write(d.toString()+'\\n'));setInterval(()=>{},1000)"] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", terminal: "pipes", lifetime_ms: 60_000 });
    const id = started.data.process_id;
    await manager.write(id, "native-pipe-ok", false);
    let text = "";
    for (let attempt = 0; attempt < 50 && !text.includes("native-pipe-ok"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      text = manager.read(id).data.output.chunks.map((chunk) => chunk.text).join("");
    }
    assert.match(text, /native-pipe-ok/);
    context = "foreign-session";
    assert.throws(() => manager.read(id), /PROCESS_NOT_FOUND/);
    context = "native-session";
    await manager.terminate(id);
    await manager.terminate(id);
    assert.equal(manager.read(id).data.status, "terminated");

    const powerShell = await manager.start({ command: { kind: "powershell", script: "Write-Output 'persistent-powershell-ok'", edition: "windows" }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", terminal: "pipes", lifetime_ms: 60_000 });
    let powerShellText = "";
    for (let attempt = 0; attempt < 100 && !powerShellText.includes("persistent-powershell-ok"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      powerShellText = manager.read(powerShell.data.process_id).data.output.chunks.map((chunk) => chunk.text).join("");
    }
    assert.match(powerShellText, /persistent-powershell-ok/, "PowerShell initial script runs after the private stdin bootstrap is closed");
  } finally {
    await manager.close();
    execution.close();
    await host.close();
  }
});

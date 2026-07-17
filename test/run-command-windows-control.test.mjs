import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { RunCommandRuntimeV3 } = await tsImport("../src/process/runCommand.ts", import.meta.url);
const { WindowsProcessHostRuntime } = await tsImport("../src/process/windowsHostClient.ts", import.meta.url);
const fullAccessProfile = { ambientFilesystem: true, ambientCredentials: true, ambientRegistry: true, unrestrictedNetwork: true, requireBlockedPathEnforcement: false, requireCredentialIsolation: false, requireRegistryIsolation: false, requireDeviceIsolation: false, requireNetworkEnforcement: false, requireSandbox: false };

test("native Windows host executes exact argv without shell parsing and reports nonzero as a completed result", { skip: process.platform !== "win32" }, async () => {
  const host = new WindowsProcessHostRuntime();
  const realPath = fs.realpathSync.native(process.execPath);
  const stat = fs.statSync(realPath, { bigint: true });
  const sha256 = createHash("sha256").update(fs.readFileSync(realPath)).digest("hex");
  const binding = { schemaVersion: 1, backendId: "managed-node", backendVersion: process.versions.node, kind: "argv", source: "reviewed_explicit", path: realPath, realPath, sha256, identity: `sha256:${sha256}:dev:${stat.dev}:ino:${stat.ino}` };
  const runtime = new RunCommandRuntimeV3({ config: { executionProfile: "full_access", defaultRoot: process.cwd() }, fullAccessProfile, hostRuntime: host, contextFingerprint: () => "windows-control", policyRevision: () => "policy_control", evidenceRevision: () => "evidence_control", backendResolver: () => binding, cwdIdentity: () => `sha256:${"c".repeat(64)}` });
  try {
    const result = await runtime.runCommand({ command: { kind: "argv", executable: realPath, args: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1))); process.exitCode=9", "a b", "&", "quoted\""] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", timeout_ms: 30_000 });
    assert.equal(result.data.status, "exited");
    assert.equal(result.data.exit_code, 9);
    assert.deepEqual(JSON.parse(result.data.output.chunks.map((chunk) => chunk.text).join("")), ["a b", "&", "quoted\""]);
    assert.equal(result.data.authority.workspace_boundary_enforced, false);
  } finally {
    runtime.close();
    await host.close();
  }
});

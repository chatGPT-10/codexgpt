import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { RunCommandRuntimeV3 } = await tsImport("../src/process/runCommand.ts", import.meta.url);
const { withAuthorizedResourceBinding } = await tsImport("../src/policy/integration.ts", import.meta.url);

const fullAccessProfile = { ambientFilesystem: true, ambientCredentials: true, ambientRegistry: true, unrestrictedNetwork: true, requireBlockedPathEnforcement: false, requireCredentialIsolation: false, requireRegistryIsolation: false, requireDeviceIsolation: false, requireNetworkEnforcement: false, requireSandbox: false };

test("run_command preserves argv, reports truthful ambient authority, redacts known patterns, and retains terminal output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codexgpt-run-command-"));
  const executable = "C:\\Tools\\fake.exe";
  const requests = [];
  const runtime = new RunCommandRuntimeV3({
    config: { executionProfile: "full_access", defaultRoot: root }, fullAccessProfile,
    contextFingerprint: () => "context-v1", policyRevision: () => "policy_v1", evidenceRevision: () => "evidence_v1",
    backendResolver: () => ({ schemaVersion: 1, backendId: "fake", backendVersion: "1", kind: "argv", source: "reviewed_explicit", path: executable, realPath: executable, sha256: "a".repeat(64), identity: `sha256:${"a".repeat(64)}:dev:1:ino:1` }),
    cwdIdentity: () => `sha256:${"b".repeat(64)}`,
    hostRuntime: { get: async () => ({ request: async (operation, input) => { requests.push({ operation, input }); return { body: { ok: true, exitCode: 7, timedOut: false, stdoutBase64: Buffer.from("sk-abcdefghijklmnop encoded=c2stYWJjZGVmZ2hpamtsbW5vcA==").toString("base64"), stderrBase64: "" } }; } }) }
  });
  const args = { command: { kind: "argv", executable, args: ["a b", "&", "\"quoted\""] }, cwd: { kind: "absolute_local", path: root }, environment: { SAMPLE: "value" }, mode: "full_access", timeout_ms: 5000 };
  const described = runtime.describe("run_command", args);
  assert.equal(described.riskClass, "R3");
  const persistent = runtime.describe("start_process", { ...args, terminal: "pipes", lifetime_ms: 60_000 });
  assert.deepEqual(persistent.requiredScopes, ["shell:execute", "process:manage", "process:persistent", "host:full-access"]);
  const result = await runtime.runCommand(args);
  assert.deepEqual(requests[0].input.arguments, ["a b", "&", "\"quoted\""]);
  assert.equal(result.data.status, "exited");
  assert.equal(result.data.exit_code, 7);
  assert.deepEqual(result.data.authority, { mode: "full_access", workspace_boundary_enforced: false, filesystem_scope: "current_user_unrestricted", filesystem_isolation: "none", credential_isolation: "none", registry_isolation: "none", network_isolation: "none", process_tree_control: "job_object_members_only", broker_escape_resistance: "none", host_writeback: "possible", redaction: "best_effort_known_patterns" });
  assert.equal(result.meta.warnings.length, 1);
  assert.match(result.meta.warnings[0], /fresh local decision record/);
  assert.match(result.meta.warnings[0], /initial start with no pre-existing unrestricted code/);
  assert.match(result.meta.warnings[0], /not unforgeable proof of human presence/);
  assert.match(result.meta.warnings[0], /Job members only/);
  assert.match(result.meta.warnings[0], /no broker-escape resistance/);
  const output = result.data.output.chunks.map((chunk) => chunk.text).join("");
  assert.match(output, /\[REDACTED_SECRET\]/);
  assert.match(output, /encoded=c2stYWJjZGVmZ2hpamtsbW5vcA==/);
  assert.equal(result.data.output.eof, true);
  const reread = runtime.readProcessOutput({ process_id: result.data.process_id, max_bytes: 1024 });
  assert.equal(reread.data.output.eof, true);
  runtime.close();
  await rm(root, { recursive: true, force: true });
});

test("run_command refuses profiles that do not explicitly accept ambient authority", () => {
  assert.throws(() => new RunCommandRuntimeV3({ config: { executionProfile: "full_access", defaultRoot: process.cwd() }, fullAccessProfile: { ...fullAccessProfile, unrestrictedNetwork: false }, contextFingerprint: () => "c", policyRevision: () => "p", evidenceRevision: () => "e", hostRuntime: { get: async () => { throw new Error(); } } }), /PROCESS_POLICY_UNENFORCEABLE/);
});

test("backend identity drift after approval consumes no host spawn", async () => {
  let identity = "d".repeat(64);
  let spawns = 0;
  const args = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" };
  const runtime = new RunCommandRuntimeV3({
    config: { executionProfile: "full_access", defaultRoot: process.cwd() }, fullAccessProfile,
    contextFingerprint: () => "context-drift", policyRevision: () => "policy_drift", evidenceRevision: () => "evidence_drift", cwdIdentity: () => `sha256:${"e".repeat(64)}`,
    backendResolver: () => ({ schemaVersion: 1, backendId: "fake", backendVersion: "1", kind: "argv", source: "reviewed_explicit", path: args.command.executable, realPath: args.command.executable, sha256: identity, identity: `sha256:${identity}:dev:1:ino:1` }),
    hostRuntime: { get: async () => { spawns += 1; throw new Error("must not spawn"); } }
  });
  const approvedFingerprint = runtime.describe("run_command", args).resource.resourceFingerprint;
  identity = "f".repeat(64);
  await assert.rejects(() => withAuthorizedResourceBinding(args, approvedFingerprint, () => runtime.runCommand(args)), /BACKEND_STALE/);
  assert.equal(spawns, 0);
  runtime.close();
});

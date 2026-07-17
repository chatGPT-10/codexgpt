import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const policy = await tsImport("../fixtures/ts-imports/phase-4-policy-imports.ts", import.meta.url);
const {
  describeExecutionResourceV3,
  describeProcessActionResourceV3,
  resolveEffectiveEnvironmentV3
} = policy;
const { requiredScopesForTool } = policy;
const {
  requestIdentityV1Schema,
  requestIdentityV3Schema
} = policy;

const backend = {
  backendId: "powershell-core",
  backendVersion: "7.5.2",
  executableIdentity: "sha256:" + "a".repeat(64)
};

function execution(overrides = {}) {
  return {
    operation: "run_command",
    command: { kind: "powershell", script: "Write-Output synthetic-secret" },
    effectiveEnvironmentDigest: "sha256:" + "b".repeat(64),
    logicalCwd: "workspace:src",
    absoluteCwdIdentity: "sha256:" + "c".repeat(64),
    backend,
    terminal: "none",
    deadlineMs: 30_000,
    lifetimeMs: 30_000,
    networkPosture: "unrestricted_host",
    accessMode: "full_access",
    workspaceId: "workspace-test",
    leaseId: "lease-test",
    snapshotId: null,
    contractVersion: 3,
    policyRevision: "policy-test",
    evidenceRevision: "evidence-test",
    identityRevision: "identity-test",
    transportRevision: "transport-test",
    ...overrides
  };
}

test("V3 composite scopes never let process:manage start code", () => {
  assert.deepEqual(requiredScopesForTool("run_command", { contractVersion: 3, mode: "workspace" }), [
    "shell:execute"
  ]);
  assert.deepEqual(requiredScopesForTool("run_command", { contractVersion: 3, mode: "full_access" }), [
    "shell:execute",
    "host:full-access"
  ]);
  assert.deepEqual(requiredScopesForTool("start_process", { contractVersion: 3, mode: "workspace" }), [
    "shell:execute",
    "process:manage",
    "process:persistent"
  ]);
  assert.deepEqual(requiredScopesForTool("start_process", { contractVersion: 3, mode: "full_access" }), [
    "shell:execute",
    "process:manage",
    "process:persistent",
    "host:full-access"
  ]);
  assert.deepEqual(requiredScopesForTool("write_process_input", { contractVersion: 3 }), ["process:manage"]);
});

test("V1 identity scopes remain frozen while V3 accepts only the versioned scope universe", () => {
  const identity = {
    kind: "local_process",
    authenticationMode: "stdio",
    credentialRef: null,
    subject: null,
    scopes: ["shell:execute", "process:manage", "process:persistent", "host:full-access"],
    assuranceLevel: "local"
  };
  assert.equal(requestIdentityV1Schema.safeParse({ schemaVersion: 1, ...identity }).success, false);
  assert.equal(requestIdentityV3Schema.safeParse({ schemaVersion: 3, ...identity }).success, true);
  assert.equal(requestIdentityV3Schema.safeParse({ schemaVersion: 3, ...identity, scopes: [...identity.scopes, "host:unknown"] }).success, false);
});

test("Windows effective environment is case-insensitive, deterministic, and duplicate-safe", () => {
  const first = resolveEffectiveEnvironmentV3({
    platform: "win32",
    base: { Path: "C:\\Windows", TEMP: "C:\\Temp" },
    overrides: { PATH: "C:\\Tools", UserName: "Noah" }
  });
  const second = resolveEffectiveEnvironmentV3({
    platform: "win32",
    base: { TEMP: "C:\\Temp", Path: "C:\\Windows" },
    overrides: { UserName: "Noah", PATH: "C:\\Tools" }
  });
  assert.deepEqual(first.entries, second.entries);
  assert.deepEqual(first.entries, [
    ["PATH", "C:\\Tools"],
    ["TEMP", "C:\\Temp"],
    ["USERNAME", "Noah"]
  ]);
  assert.equal(first.digest, second.digest);
  assert.throws(() => resolveEffectiveEnvironmentV3({
    platform: "win32",
    base: {},
    overrides: { Path: "one", PATH: "two" }
  }), /duplicate/i);
});

test("execution resources bind exact semantic facts without retaining raw private values", () => {
  const base = describeExecutionResourceV3(execution());
  const argvChanged = describeExecutionResourceV3(execution({
    command: { kind: "argv", executable: "node.exe", args: ["-e", "Write-Output synthetic-secret"] }
  }));
  const environmentChanged = describeExecutionResourceV3(execution({
    effectiveEnvironmentDigest: "sha256:" + "d".repeat(64)
  }));
  assert.notEqual(base.resourceFingerprint, argvChanged.resourceFingerprint);
  assert.notEqual(base.resourceFingerprint, environmentChanged.resourceFingerprint);
  assert.match(base.semanticFactsDigest, /^sha256:[a-f0-9]{64}$/);
  const serialized = JSON.stringify(base);
  assert.doesNotMatch(serialized, /synthetic-secret|Write-Output|C:\\\\Users/i);
  assert.equal(base.argumentCount, 0);
  assert.equal(base.scriptBytes > 0, true);
});

test("owned-handle process actions are R0 only after exact context checks", () => {
  const read = describeProcessActionResourceV3({
    operation: "read_process_output",
    processId: "process_" + "1".repeat(32),
    generation: 7,
    owned: true,
    contextMatches: true,
    terminal: "pipes"
  });
  assert.equal(read.riskClass, "R0");
  const resize = describeProcessActionResourceV3({
    operation: "resize_process_terminal",
    processId: "process_" + "1".repeat(32),
    generation: 7,
    owned: true,
    contextMatches: true,
    terminal: "conpty"
  });
  assert.equal(resize.riskClass, "R0");
  assert.throws(() => describeProcessActionResourceV3({
    operation: "read_process_output",
    processId: "process_" + "2".repeat(32),
    generation: 1,
    owned: false,
    contextMatches: true,
    terminal: "pipes"
  }), /PROCESS_NOT_FOUND/);
});

test("process input authorization binds generation and exact bytes", () => {
  const input = {
    operation: "write_process_input",
    processId: "process_" + "3".repeat(32),
    generation: 2,
    owned: true,
    contextMatches: true,
    terminal: "conpty",
    close: false
  };
  const one = describeProcessActionResourceV3({ ...input, input: Buffer.from("alpha") });
  const two = describeProcessActionResourceV3({ ...input, input: Buffer.from("alphb") });
  const nextGeneration = describeProcessActionResourceV3({ ...input, generation: 3, input: Buffer.from("alpha") });
  assert.notEqual(one.semanticFactsDigest, two.semanticFactsDigest);
  assert.notEqual(one.semanticFactsDigest, nextGeneration.semanticFactsDigest);
  assert.doesNotMatch(JSON.stringify(one), /alpha/);
});

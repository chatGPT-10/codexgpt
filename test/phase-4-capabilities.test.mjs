import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const policy = await tsImport("../fixtures/ts-imports/phase-4-policy-imports.ts", import.meta.url);
const {
  CapabilityEvidenceStoreV3,
  fullAccessCapabilityReportV3,
  requiredExecutionCapabilitiesV3
} = policy;
const { assertFullAccessProfileEligibleV3 } = policy;
const {
  compiledPermissionProfileV3Schema,
  permissionProfileDocumentV1Schema,
  permissionProfileDocumentV3Schema
} = policy;
const { compilePermissionProfileV3, loadConfig } = policy;
const {
  createDefaultPolicyRuntime,
  createStdioPolicySessionSource,
  PathGuard,
  policyIdentityScopes,
  WorkspaceManager
} = policy;

const eligibleProfile = {
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

test("Permission Profile V1 stays frozen while V3 adds explicit full-access eligibility", () => {
  const v3 = {
    schemaVersion: 3,
    id: "full-access-test",
    fullAccess: eligibleProfile
  };
  assert.equal(permissionProfileDocumentV1Schema.safeParse(v3).success, false);
  assert.equal(permissionProfileDocumentV3Schema.safeParse(v3).success, true);
  const compiled = compiledPermissionProfileV3Schema.parse({
    schemaVersion: 3,
    id: "full-access-test",
    sourceProfileIds: ["full-access-test"],
    workspaceRoots: [],
    filesystem: { default: "deny", rules: [] },
    git: { read: false, write: false, remoteWrite: false },
    shell: { mode: "execute", requireSandbox: false },
    process: { manage: true, persistent: true, requireSandbox: false },
    network: {
      enabled: true,
      rules: [],
      allowLoopback: true,
      allowPrivate: true,
      allowLinkLocal: true,
      requireEnforcement: false
    },
    fullAccess: eligibleProfile
  });
  assert.equal(compiled.fullAccess.unrestrictedNetwork, true);
  const inherited = compilePermissionProfileV3({
    id: "full-access-test",
    order: [
      { schemaVersion: 1, id: "base", shell: { mode: "execute", requireSandbox: false } },
      { schemaVersion: 3, id: "full-access-test", extends: "base", fullAccess: eligibleProfile }
    ],
    sourceHashes: [
      { id: "base", sha256: "a".repeat(64) },
      { id: "full-access-test", sha256: "b".repeat(64) }
    ]
  });
  assert.equal(inherited.schemaVersion, 3);
  assert.equal(inherited.shell.mode, "execute");
  assert.equal(inherited.fullAccess.ambientCredentials, true);
});

test("full access requires explicit ambient authority eligibility", () => {
  assert.equal(assertFullAccessProfileEligibleV3(eligibleProfile), true);
  for (const key of ["ambientFilesystem", "ambientCredentials", "ambientRegistry", "unrestrictedNetwork"]) {
    assert.throws(() => assertFullAccessProfileEligibleV3({ ...eligibleProfile, [key]: false }), /PROCESS_POLICY_UNENFORCEABLE/);
  }
});

test("unenforceable child isolation is rejected before approval", () => {
  for (const key of [
    "requireBlockedPathEnforcement",
    "requireCredentialIsolation",
    "requireRegistryIsolation",
    "requireDeviceIsolation",
    "requireNetworkEnforcement",
    "requireSandbox"
  ]) {
    assert.throws(() => requiredExecutionCapabilitiesV3({
      mode: "full_access",
      profile: { ...eligibleProfile, [key]: true },
      requestedNetworkDestinations: []
    }), /PROCESS_POLICY_UNENFORCEABLE/);
  }
});

test("full access with an empty network request still reports unrestricted host network", () => {
  const report = fullAccessCapabilityReportV3({
    backendId: "windows-host-v1",
    backendVersion: "1",
    evidenceRevision: "evidence-one"
  });
  assert.equal(report.networkPosture, "unrestricted_host");
  assert.equal(report.networkEgressControl, "none");
  assert.equal(report.filesystemBoundary, "none");
  assert.equal(report.credentialIsolation, "none");
  assert.equal(report.registryIsolation, "none");
  assert.equal(report.brokerEscapeResistance, "none");
});

test("capability evidence revision revokes all dependent state through ordered callbacks", async () => {
  const calls = [];
  const store = new CapabilityEvidenceStoreV3({
    report: fullAccessCapabilityReportV3({
      backendId: "windows-host-v1",
      backendVersion: "1",
      evidenceRevision: "evidence-one"
    }),
    callbacks: {
      revokePendingAndGrants: async () => calls.push("approvals"),
      quarantineProcessInput: async () => calls.push("quarantine"),
      terminateProcesses: async () => calls.push("processes"),
      revokeWorkspaces: async () => calls.push("workspaces"),
      cleanupAuthenticatedState: async () => calls.push("cleanup")
    }
  });
  await store.replace(fullAccessCapabilityReportV3({
    backendId: "windows-host-v1",
    backendVersion: "1",
    evidenceRevision: "evidence-two"
  }));
  assert.deepEqual(calls, ["approvals", "quarantine", "processes", "workspaces", "cleanup"]);
  assert.equal(store.snapshot().evidenceRevision, "evidence-two");
});

test("new requests fail closed while an evidence revision is being replaced", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const store = new CapabilityEvidenceStoreV3({
    report: fullAccessCapabilityReportV3({ backendId: "race", backendVersion: "1", evidenceRevision: "race-1" }),
    callbacks: {
      revokePendingAndGrants: async () => {
        entered();
        await blocked;
      }
    }
  });
  const replacing = store.replace(fullAccessCapabilityReportV3({ backendId: "race", backendVersion: "1", evidenceRevision: "race-2" }));
  await started;
  assert.throws(() => store.snapshot(), /update is active/i);
  release();
  await replacing;
  assert.equal(store.snapshot().evidenceRevision, "race-2");
});

test("capability evidence stores are server-local and reject revision rollback", async () => {
  const one = new CapabilityEvidenceStoreV3({ report: fullAccessCapabilityReportV3({ backendId: "one", backendVersion: "1", evidenceRevision: "revision-1" }) });
  const two = new CapabilityEvidenceStoreV3({ report: fullAccessCapabilityReportV3({ backendId: "two", backendVersion: "1", evidenceRevision: "revision-1" }) });
  await one.replace(fullAccessCapabilityReportV3({ backendId: "one", backendVersion: "1", evidenceRevision: "revision-2" }));
  assert.equal(one.snapshot().evidenceRevision, "revision-2");
  assert.equal(two.snapshot().evidenceRevision, "revision-1");
  await assert.rejects(() => one.replace(fullAccessCapabilityReportV3({ backendId: "one", backendVersion: "1", evidenceRevision: "revision-1" })), /rollback|stale/i);
});

test("default policy runtime reads the live per-server evidence revision", async () => {
  const activeConfig = {
    ...loadConfig(["--root", process.cwd()]),
    toolContractVersion: 3,
    policyEngineMode: "enforce"
  };
  const store = new CapabilityEvidenceStoreV3({
    report: fullAccessCapabilityReportV3({ backendId: "runtime", backendVersion: "1", evidenceRevision: "runtime-evidence-1" })
  });
  const workspaces = new WorkspaceManager(activeConfig, {
    transportSessionId: () => "runtime-session",
    identityBinding: "runtime-identity",
    policyRevision: () => "runtime-policy"
  });
  const runtime = createDefaultPolicyRuntime({
    config: activeConfig,
    workspaces,
    guard: new PathGuard(activeConfig),
    sessionSource: createStdioPolicySessionSource({
      sessionId: "runtime-session",
      scopes: policyIdentityScopes(activeConfig)
    }),
    capabilityEvidenceStoreV3: store
  });
  const before = runtime.policyRevision;
  assert.equal(runtime.diagnostics().enforcement.evidenceRevision, "runtime-evidence-1");
  await store.replace(fullAccessCapabilityReportV3({ backendId: "runtime", backendVersion: "1", evidenceRevision: "runtime-evidence-2" }));
  assert.notEqual(runtime.policyRevision, before);
  assert.equal(runtime.diagnostics().enforcement.evidenceRevision, "runtime-evidence-2");
});

test("Phase 4 authority configuration is exact, V3-only, and defaults off", () => {
  const names = [
    "CODEXGPT_TOOL_CONTRACT_VERSION",
    "CODEXGPT_LOCAL_FILE_ACCESS",
    "CODEXGPT_EXECUTION_PROFILE",
    "CODEXGPT_EXECUTION_DEPENDENCIES"
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const defaults = loadConfig(["--root", process.cwd()]);
    assert.equal(defaults.localFileAccess, "configured_roots");
    assert.equal(defaults.executionProfile, "off");
    assert.equal(defaults.executionDependencies, "off");

    process.env.CODEXGPT_TOOL_CONTRACT_VERSION = "3";
    process.env.CODEXGPT_LOCAL_FILE_ACCESS = "confirmed_roots";
    process.env.CODEXGPT_EXECUTION_PROFILE = "full_access";
    process.env.CODEXGPT_EXECUTION_DEPENDENCIES = "node_modules";
    const enabled = loadConfig(["--root", process.cwd()]);
    assert.equal(enabled.localFileAccess, "confirmed_roots");
    assert.equal(enabled.executionProfile, "full_access");
    assert.equal(enabled.executionDependencies, "node_modules");

    process.env.CODEXGPT_TOOL_CONTRACT_VERSION = "2";
    assert.throws(() => loadConfig(["--root", process.cwd()]), /Contract V3/);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

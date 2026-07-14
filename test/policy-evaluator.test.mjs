import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { evaluatePolicy, evaluateProfile, compareSpecificity } = await tsImport("../src/policy/evaluator.ts", import.meta.url);
const { HARD_POLICY_REVISION, evaluateHardPolicy } = await tsImport("../src/policy/hardPolicy.ts", import.meta.url);

const fingerprint = (character) => `sha256:${character.repeat(64)}`;

function identity(scopes) {
  return {
    schemaVersion: 1,
    kind: "local_process",
    authenticationMode: "stdio",
    credentialRef: null,
    subject: null,
    scopes,
    assuranceLevel: "local"
  };
}

function context(scopes, policyRevision = "policy_test") {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    transportKind: "stdio",
    transportSessionId: "session-1",
    identity: identity(scopes),
    workspaceId: "ws_test",
    runtimeProfileId: "runtime-default",
    permissionProfileId: "test",
    policyRevision,
    sessionGrantRevision: "grant-revision-1",
    receivedAt: "2026-07-14T10:00:00.000Z"
  };
}

function profile(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "test",
    sourceProfileIds: ["test"],
    workspaceRoots: [process.cwd()],
    filesystem: { default: "deny", rules: [] },
    git: { read: false, write: false, remoteWrite: false },
    shell: { mode: "disabled", requireSandbox: true },
    process: { manage: false, persistent: false, requireSandbox: true },
    network: {
      enabled: false,
      rules: [],
      allowLoopback: false,
      allowPrivate: false,
      allowLinkLocal: false,
      requireEnforcement: true
    },
    ...overrides
  };
}

function filesystem(path, operation = "read", character = "a") {
  const comparisonKey = path.toLowerCase();
  return {
    schemaVersion: 1,
    kind: "filesystem",
    operation,
    workspaceId: "ws_test",
    relativePath: path,
    comparisonKey,
    targetExists: true,
    containment: "inside",
    existingParentIdentity: "parent_test",
    unresolvedSuffix: [],
    resourceFingerprint: fingerprint(character)
  };
}

function shell(character = "b") {
  return {
    schemaVersion: 1,
    kind: "shell",
    operation: "execute",
    workspaceId: "ws_test",
    backend: "bash",
    cwd: ".",
    commandKind: "opaque",
    executable: "npm",
    argumentCount: 2,
    commandDigest: fingerprint("c"),
    persistence: false,
    requestedNetwork: false,
    resourceFingerprint: fingerprint(character)
  };
}

function network(addressClass = "public", character = "d") {
  return {
    schemaVersion: 1,
    kind: "network",
    operation: "connect",
    workspaceId: "ws_test",
    scheme: "https",
    host: "example.com",
    port: 443,
    hostKind: "dns",
    resolvedAddresses: [addressClass === "private" ? "10.0.0.1" : "93.184.216.34"],
    addressClasses: [addressClass],
    resourceFingerprint: fingerprint(character)
  };
}

function capabilityReport(overrides = {}) {
  return {
    schemaVersion: 1,
    backendId: "test-backend",
    backendVersion: "1",
    platform: process.platform,
    filesystemReadBoundary: "brokered",
    filesystemWriteBoundary: "brokered",
    processTreeControl: "none",
    networkEgressControl: "none",
    environmentIsolation: "filtered",
    credentialIsolation: "none",
    registryIsolation: "none",
    supportsPeerAddressVerification: false,
    supportsRedirectReauthorization: false,
    supportsRevocation: false,
    evidenceRevision: "cap-v1",
    ...overrides
  };
}

function evaluate(overrides) {
  const resource = overrides.resource ?? filesystem("src/index.ts");
  return evaluatePolicy({
    context: overrides.context ?? context(["filesystem:read"]),
    activePolicyRevision: overrides.activePolicyRevision ?? "policy_test",
    profile: overrides.profile ?? profile({ filesystem: { default: "read", rules: [] } }),
    resource,
    riskClass: overrides.riskClass ?? "R0",
    grants: overrides.grants ?? [],
    requiredCapabilities: overrides.requiredCapabilities ?? [],
    capabilities: overrides.capabilities ?? capabilityReport(),
    deploymentDisabled: overrides.deploymentDisabled ?? false,
    now: overrides.now ?? "2026-07-14T10:00:10.000Z",
    platform: overrides.platform ?? process.platform,
    toolContractVersion: "1",
    inputDigest: overrides.inputDigest ?? fingerprint("e")
  });
}

test("hard deny wins over profile allow and approval grant", () => {
  const resource = filesystem(".env", "read");
  const grant = {
    schemaVersion: 1,
    grantId: "grant-1",
    credentialRef: null,
    transportSessionId: "session-1",
    workspaceId: "ws_test",
    policyRevision: "policy_test",
    toolContractVersion: "1",
    operation: "filesystem.read",
    resourceFingerprint: resource.resourceFingerprint,
    inputDigest: fingerprint("e"),
    riskClass: "R2",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:04:00.000Z",
    usesRemaining: null
  };
  const decision = evaluate({
    resource,
    context: context(["filesystem:read", "filesystem:write"]),
    profile: profile({ filesystem: { default: "read", rules: [{ id: "allow.env", selector: { kind: "exact", path: ".env" }, access: "read" }] } }),
    riskClass: "R2",
    grants: [grant]
  });
  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reasonCode, "POLICY_DENIED");
  assert.equal(decision.provenance[0].sourceKind, "hard_policy");
  assert.equal(HARD_POLICY_REVISION, "hard-policy-v1");
  assert.equal(evaluateHardPolicy(resource, { capabilityDisabled: false })[0].id, "hard.fs.secret.env");
});

test("same normalized input produces byte-identical decision facts", () => {
  const input = { resource: filesystem("src/index.ts") };
  assert.deepEqual(evaluate(input), evaluate(input));
});

test("stale policy context fails before profile or grant evaluation", () => {
  const decision = evaluate({
    context: context(["filesystem:read"], "policy_old"),
    activePolicyRevision: "policy_new"
  });
  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reasonCode, "POLICY_CONTEXT_STALE");
});

test("missing enforcement capability fails closed before grant evaluation", () => {
  const decision = evaluate({
    resource: shell(),
    context: context(["shell:execute"]),
    profile: profile({ shell: { mode: "execute", requireSandbox: true } }),
    riskClass: "R3",
    requiredCapabilities: [
      { name: "processTreeControl", minimum: "job_object" },
      { name: "networkEgressControl", minimum: "platform_enforced" }
    ],
    capabilities: capabilityReport({ processTreeControl: "job_object", networkEgressControl: "none" })
  });
  assert.equal(decision.outcome, "enforcement_unavailable");
  assert.equal(decision.reasonCode, "SHELL_SANDBOX_UNAVAILABLE");
  assert.deepEqual(decision.requiredEnforcement.map((item) => item.name), ["networkEgressControl"]);
});

test("identity scope and profile ceilings both deny independently", () => {
  const noScope = evaluate({
    context: context([]),
    profile: profile({ filesystem: { default: "read", rules: [] } })
  });
  assert.equal(noScope.provenance[0].sourceKind, "identity_scope");

  const noProfile = evaluate({
    context: context(["filesystem:read"]),
    profile: profile({ filesystem: { default: "deny", rules: [] } })
  });
  assert.equal(noProfile.provenance[0].sourceKind, "permission_profile");
});

test("filesystem specificity is mechanical and equal specificity chooses least privilege", () => {
  assert.equal(compareSpecificity([3, 2, 12], [2, 5, 40]) > 0, true);
  const access = evaluateProfile(profile({
    filesystem: {
      default: "deny",
      rules: [
        { id: "write.exact", selector: { kind: "exact", path: "src/index.ts" }, access: "write" },
        { id: "deny.exact", selector: { kind: "exact", path: "src/index.ts" }, access: "deny" }
      ]
    }
  }), filesystem("src/index.ts", "write"), "win32");
  assert.equal(access.allowed, false);
  assert.equal(access.safeRuleId, "deny.exact");
});

test("bounded exact grant changes approval-required to allow", () => {
  const resource = filesystem("src/generated.ts", "write", "f");
  const base = {
    resource,
    context: context(["filesystem:write"]),
    profile: profile({ filesystem: { default: "deny", rules: [{ id: "write.src", selector: { kind: "subtree", path: "src" }, access: "write" }] } }),
    riskClass: "R2",
    requiredCapabilities: [{ name: "filesystemWriteBoundary", minimum: "brokered" }]
  };
  const required = evaluate(base);
  assert.equal(required.outcome, "approval_required");
  assert.equal(required.requiredApproval.riskClass, "R2");

  const grant = {
    schemaVersion: 1,
    grantId: "grant-exact",
    credentialRef: null,
    transportSessionId: "session-1",
    workspaceId: "ws_test",
    policyRevision: "policy_test",
    toolContractVersion: "1",
    operation: "filesystem.write",
    resourceFingerprint: resource.resourceFingerprint,
    inputDigest: fingerprint("e"),
    riskClass: "R2",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:04:00.000Z",
    usesRemaining: null
  };
  const allowed = evaluate({ ...base, grants: [grant] });
  assert.equal(allowed.outcome, "allow");
  assert.equal(allowed.provenance.at(-1).grantId, "grant-exact");
});

test("R4 is unapprovable and private network classes require explicit profile enablement", () => {
  const r4 = evaluate({ riskClass: "R4" });
  assert.equal(r4.outcome, "deny");
  assert.equal(r4.requiredApproval, null);

  const privateNetwork = evaluate({
    resource: network("private"),
    context: context(["network:connect"]),
    profile: profile({
      network: {
        enabled: true,
        rules: [{ id: "allow.example", host: "example.com", ports: [443], access: "allow" }],
        allowLoopback: false,
        allowPrivate: false,
        allowLinkLocal: false,
        requireEnforcement: true
      }
    })
  });
  assert.equal(privateNetwork.outcome, "deny");
  assert.equal(privateNetwork.provenance[0].sourceKind, "permission_profile");
});

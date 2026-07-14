import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  ApprovalPolicyV1,
  SessionGrantStore,
  createApprovalRequest,
  riskLimits
} = await tsImport("../src/policy/approval.ts", import.meta.url);

const fingerprint = (character) => `sha256:${character.repeat(64)}`;

const context = {
  schemaVersion: 1,
  requestId: "request-1",
  transportKind: "stdio",
  transportSessionId: "session-1",
  identity: {
    schemaVersion: 1,
    kind: "local_process",
    authenticationMode: "stdio",
    credentialRef: null,
    subject: null,
    scopes: ["shell:execute"],
    assuranceLevel: "local"
  },
  workspaceId: "ws_test",
  runtimeProfileId: "runtime-default",
  permissionProfileId: "test",
  policyRevision: "policy-1",
  sessionGrantRevision: "grant-revision-1",
  receivedAt: "2026-07-14T10:00:00.000Z"
};

const shellResource = {
  schemaVersion: 1,
  kind: "shell",
  operation: "execute",
  workspaceId: "ws_test",
  backend: "bash",
  cwd: ".",
  commandKind: "opaque",
  executable: "npm",
  argumentCount: 2,
  commandDigest: fingerprint("a"),
  persistence: false,
  requestedNetwork: false,
  resourceFingerprint: fingerprint("b")
};

function issueInput(overrides = {}) {
  return {
    context,
    operation: "shell.execute",
    resourceFingerprint: shellResource.resourceFingerprint,
    inputDigest: fingerprint("c"),
    riskClass: "R3",
    toolContractVersion: "1",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:02:00.000Z",
    usesRemaining: 1,
    ...overrides
  };
}

function matchInput(overrides = {}) {
  return {
    context,
    operation: "shell.execute",
    resourceFingerprint: shellResource.resourceFingerprint,
    inputDigest: fingerprint("c"),
    riskClass: "R3",
    toolContractVersion: "1",
    now: "2026-07-14T10:01:00.000Z",
    ...overrides
  };
}

test("risk limits are fixed and R4 cannot create approval requests", () => {
  assert.deepEqual(riskLimits("R1"), { maxTtlMs: 30 * 60_000, uses: null });
  assert.deepEqual(riskLimits("R2"), { maxTtlMs: 5 * 60_000, uses: null });
  assert.deepEqual(riskLimits("R3"), { maxTtlMs: 2 * 60_000, uses: 1 });
  assert.throws(() => riskLimits("R4"), /unapprovable/i);
  assert.throws(() => createApprovalRequest({
    context,
    resource: shellResource,
    riskClass: "R4",
    inputDigest: fingerprint("c"),
    toolContractVersion: "1",
    createdAt: "2026-07-14T10:00:00.000Z"
  }), /unapprovable/i);
});

test("approval request contains only exact safe bindings and no raw input", () => {
  const request = createApprovalRequest({
    context,
    resource: shellResource,
    riskClass: "R3",
    inputDigest: fingerprint("c"),
    toolContractVersion: "1",
    createdAt: "2026-07-14T10:00:00.000Z"
  });
  assert.equal(request.riskClass, "R3");
  assert.equal(request.resourceFingerprint, shellResource.resourceFingerprint);
  assert.equal(request.operation, "shell.execute");
  assert.equal("command" in request, false);
  assert.match(request.approvalId, /^approval_[a-f0-9]{24}$/);
});

test("R3 grant is exact one-use and bound to policy revision", () => {
  const store = new SessionGrantStore();
  const grant = store.issue(issueInput());
  assert.equal(store.revision(), "grant-revision-1");
  assert.equal(store.findMatching(matchInput()).grantId, grant.grantId);
  store.consume(grant.grantId);
  assert.equal(store.findMatching(matchInput()), null);
  assert.equal(store.revision(), "grant-revision-2");
});

test("changed resource input session profile or policy revision invalidates a match", () => {
  const store = new SessionGrantStore();
  store.issue(issueInput({ riskClass: "R2", expiresAt: "2026-07-14T10:05:00.000Z", usesRemaining: null }));
  assert.equal(store.findMatching(matchInput({ riskClass: "R2" }))?.riskClass, "R2");
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", resourceFingerprint: fingerprint("d") })), null);
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", inputDigest: fingerprint("e") })), null);
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", context: { ...context, transportSessionId: "session-2" } })), null);
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", context: { ...context, policyRevision: "policy-2" } })), null);
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", toolContractVersion: "2" })), null);
});

test("expired grants are removed and revoke operations invalidate exact scopes", () => {
  const store = new SessionGrantStore();
  store.issue(issueInput({ riskClass: "R2", expiresAt: "2026-07-14T10:05:00.000Z", usesRemaining: null }));
  assert.equal(store.findMatching(matchInput({ riskClass: "R2", now: "2026-07-14T10:05:00.000Z" })), null);
  assert.equal(store.size(), 0);

  store.issue(issueInput({ riskClass: "R2", expiresAt: "2026-07-14T10:05:00.000Z", usesRemaining: null }));
  store.revokeTransportSession("session-1");
  assert.equal(store.size(), 0);

  store.issue(issueInput({ riskClass: "R2", expiresAt: "2026-07-14T10:05:00.000Z", usesRemaining: null }));
  store.revokeForActivePolicyRevision("policy-2");
  assert.equal(store.size(), 0);
});

test("grant issuance rejects TTL and use counts above the fixed ceiling", () => {
  const store = new SessionGrantStore();
  assert.throws(() => store.issue(issueInput({ expiresAt: "2026-07-14T10:02:01.000Z" })), /ceiling|expiry/i);
  assert.throws(() => store.issue(issueInput({ usesRemaining: 2 })), /one-use|uses/i);
});

test("default approval policy classifies exact high-risk families", () => {
  const policy = new ApprovalPolicyV1();
  assert.equal(policy.classify(shellResource), "R3");
  assert.equal(policy.classify({ ...shellResource, operation: "verify", commandKind: "verification" }), "R1");
  assert.equal(policy.classify({ ...shellResource, kind: "filesystem", operation: "read", relativePath: "src/index.ts", comparisonKey: "src/index.ts", targetExists: true, containment: "inside", existingParentIdentity: "parent", unresolvedSuffix: [] }), "R0");
});

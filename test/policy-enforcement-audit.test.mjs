import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  baselineNodeCapabilityReport,
  capabilitySatisfies,
  missingCapabilities
} = await tsImport("../src/policy/enforcement.ts", import.meta.url);
const { createAuditEvent, safePolicySummary } = await tsImport("../src/policy/audit.ts", import.meta.url);

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
    scopes: ["filesystem:read"],
    assuranceLevel: "local"
  },
  workspaceId: "ws_test",
  runtimeProfileId: "runtime-default",
  permissionProfileId: "compat-v1",
  policyRevision: "policy-1",
  sessionGrantRevision: "grant-revision-0",
  receivedAt: "2026-07-14T10:00:00.000Z"
};

const resource = {
  schemaVersion: 1,
  kind: "filesystem",
  operation: "read",
  workspaceId: "ws_test",
  relativePath: "src/index.ts",
  comparisonKey: "src/index.ts",
  targetExists: true,
  containment: "inside",
  existingParentIdentity: "parent_test",
  unresolvedSuffix: [],
  resourceFingerprint: fingerprint("a")
};

const decision = {
  schemaVersion: 1,
  decisionId: "decision-1",
  outcome: "allow",
  reasonCode: null,
  policyRevision: "policy-1",
  resourceFingerprint: resource.resourceFingerprint,
  requiredApproval: null,
  requiredEnforcement: [],
  provenance: [{
    sourceKind: "permission_profile",
    safeRuleId: "profile.fs.default.read",
    specificity: [0, 0, 0],
    grantId: null,
    approvalId: null,
    enforcementBackend: null
  }]
};

test("baseline Node report claims brokered file operations but no process network credential or registry isolation", () => {
  const report = baselineNodeCapabilityReport("win32");
  assert.equal(report.filesystemReadBoundary, "brokered");
  assert.equal(report.filesystemWriteBoundary, "brokered");
  assert.equal(report.processTreeControl, "none");
  assert.equal(report.networkEgressControl, "none");
  assert.equal(report.credentialIsolation, "none");
  assert.equal(report.registryIsolation, "none");
  assert.equal(report.supportsPeerAddressVerification, false);
});

test("Job Object process control does not imply filesystem or network isolation", () => {
  const report = {
    ...baselineNodeCapabilityReport("win32"),
    processTreeControl: "job_object"
  };
  assert.equal(capabilitySatisfies(report, { name: "processTreeControl", minimum: "job_object" }), true);
  assert.equal(capabilitySatisfies(report, { name: "networkEgressControl", minimum: "platform_enforced" }), false);
  assert.equal(capabilitySatisfies(report, { name: "credentialIsolation", minimum: "isolated" }), false);
});

test("missing capability comparison is deterministic and preserves requested order", () => {
  const report = baselineNodeCapabilityReport("win32");
  const required = [
    { name: "filesystemReadBoundary", minimum: "brokered" },
    { name: "processTreeControl", minimum: "job_object" },
    { name: "supportsRevocation", minimum: true }
  ];
  assert.deepEqual(missingCapabilities(required, report), [required[1], required[2]]);
});

test("audit events contain bounded safe facts and omit supplied raw secrets commands and absolute paths", () => {
  const event = createAuditEvent({
    eventId: "event-1",
    timestamp: "2026-07-14T10:00:01.000Z",
    context,
    decision,
    resource,
    toolName: "read",
    canonicalAction: "read",
    capabilities: baselineNodeCapabilityReport("win32"),
    approvalState: "not_required",
    grantId: null,
    durationMs: 4,
    resultCode: null,
    exitCode: null,
    boundedByteCounts: { output: 120 },
    unsafe: {
      rawCredential: "synthetic-secret",
      command: "curl https://user:pass@example.invalid",
      absolutePath: "C:\\Users\\Example\\.ssh\\id_ed25519",
      content: "PRIVATE CONTENT"
    }
  });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("synthetic-secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("id_ed25519"), false);
  assert.equal(serialized.includes("PRIVATE CONTENT"), false);
  assert.equal(event.relativeResourceSummary, "filesystem:read:src/index.ts");
  assert.deepEqual(event.safeRuleIds, ["profile.fs.default.read"]);
});

test("audit summaries redact unsafe path and control characters", () => {
  const unsafeResource = {
    ...resource,
    relativePath: "../secret\nvalue",
    comparisonKey: "../secret\nvalue",
    resourceFingerprint: fingerprint("b")
  };
  const summary = safePolicySummary(unsafeResource);
  assert.equal(summary.includes(".."), false);
  assert.equal(summary.includes("\n"), false);
  assert.match(summary, /omitted|filesystem/);
});

test("audit event schema rejects mismatched decision and resource fingerprints", () => {
  assert.throws(() => createAuditEvent({
    eventId: "event-2",
    timestamp: "2026-07-14T10:00:01.000Z",
    context,
    decision,
    resource: { ...resource, resourceFingerprint: fingerprint("c") },
    toolName: "read",
    canonicalAction: "read",
    capabilities: baselineNodeCapabilityReport("win32"),
    approvalState: "not_required",
    grantId: null,
    durationMs: 0,
    resultCode: null,
    exitCode: null,
    boundedByteCounts: {}
  }), /fingerprint/i);
});

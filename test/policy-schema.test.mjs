import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  permissionProfileDocumentV1Schema,
  requestIdentityV1Schema,
  policyDecisionV1Schema,
  sandboxCapabilityReportV1Schema,
  sessionGrantV1Schema
} = await tsImport("../src/policy/schemas.ts", import.meta.url);

test("Permission Profile V1 rejects unknown fields and invalid versions", () => {
  assert.throws(() => permissionProfileDocumentV1Schema.parse({
    schemaVersion: 1,
    id: "review",
    unknown: true
  }));
  assert.throws(() => permissionProfileDocumentV1Schema.parse({
    schemaVersion: 2,
    id: "review"
  }));
});

test("Permission Profile V1 allows sparse inheritance documents but rejects unsafe profile ids", () => {
  const parsed = permissionProfileDocumentV1Schema.parse({
    schemaVersion: 1,
    id: "review.child",
    extends: "review-base",
    git: { read: true }
  });
  assert.equal(parsed.id, "review.child");
  assert.throws(() => permissionProfileDocumentV1Schema.parse({ schemaVersion: 1, id: "../escape" }));
});

test("shared-secret identity cannot invent a subject", () => {
  assert.throws(() => requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "shared_secret_bearer",
    authenticationMode: "bearer",
    credentialRef: "cred_abcdefghijklmnop",
    subject: "user-1",
    scopes: ["filesystem:read"],
    assuranceLevel: "shared_secret"
  }));
});

test("OAuth identity requires a subject and known scopes", () => {
  assert.throws(() => requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "oauth_subject",
    authenticationMode: "oauth2",
    credentialRef: "cred_abcdefghijklmnop",
    subject: null,
    scopes: ["filesystem:read"],
    assuranceLevel: "strong"
  }));
  assert.throws(() => requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "oauth_subject",
    authenticationMode: "oauth2",
    credentialRef: "cred_abcdefghijklmnop",
    subject: "subject-1",
    scopes: ["unknown:scope"],
    assuranceLevel: "strong"
  }));
});

test("policy decisions use the closed outcome vocabulary and consistent approval fields", () => {
  const base = {
    schemaVersion: 1,
    decisionId: "decision-1",
    reasonCode: "POLICY_DENIED",
    policyRevision: "policy-1",
    resourceFingerprint: "sha256:" + "a".repeat(64),
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: []
  };
  assert.throws(() => policyDecisionV1Schema.parse({ ...base, outcome: "maybe" }));
  assert.throws(() => policyDecisionV1Schema.parse({
    ...base,
    outcome: "approval_required",
    reasonCode: "APPROVAL_REQUIRED",
    requiredApproval: null
  }));
});

test("sandbox capability report rejects unsupported platform and capability values", () => {
  assert.throws(() => sandboxCapabilityReportV1Schema.parse({
    schemaVersion: 1,
    backendId: "test",
    backendVersion: "1",
    platform: "plan9",
    filesystemReadBoundary: "root",
    filesystemWriteBoundary: "none",
    processTreeControl: "none",
    networkEgressControl: "none",
    environmentIsolation: "none",
    credentialIsolation: "none",
    registryIsolation: "none",
    supportsPeerAddressVerification: false,
    supportsRedirectReauthorization: false,
    supportsRevocation: false,
    evidenceRevision: "test-1"
  }));
});

test("R3 grants are one-use and all grants use bounded exact bindings", () => {
  const grant = sessionGrantV1Schema.parse({
    schemaVersion: 1,
    grantId: "grant-1",
    credentialRef: "cred_abcdefghijklmnop",
    transportSessionId: "session-1",
    workspaceId: "workspace-1",
    policyRevision: "policy-1",
    toolContractVersion: "1",
    operation: "shell.execute",
    resourceFingerprint: "sha256:" + "b".repeat(64),
    inputDigest: "sha256:" + "c".repeat(64),
    riskClass: "R3",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:02:00.000Z",
    usesRemaining: 1
  });
  assert.equal(grant.usesRemaining, 1);
  assert.throws(() => sessionGrantV1Schema.parse({ ...grant, usesRemaining: 2 }));
});

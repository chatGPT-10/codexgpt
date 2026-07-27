import assert from "node:assert/strict";
import test from "node:test";
import {
  createOAuthPolicyIdentity,
  createOAuthPolicySessionSource,
  credentialRevisionForIdentity,
  effectivePolicyScopes,
  ownerIdForPolicyIdentity
} from "../dist/auth/policyIdentity.js";
import { runWithOAuthRequestContext } from "../dist/auth/requestContext.js";
import { SessionGrantStore } from "../dist/policy/approval.js";

function requestContext(overrides = {}) {
  return Object.freeze({
    ownerSubject: "oauth-owner-subject",
    ownerRef: "ownerref_0123456789abcdef",
    clientId: "client_raw_value_must_not_escape",
    clientRef: "clientref_0123456789abcdef",
    resource: "https://mcp.example.com/mcp",
    bindingId: "binding_0123456789abcdef",
    incarnationId: "incarnation_0123456789abcdef",
    grantId: "grant_0123456789abcdef",
    grantRevision: 7,
    scopes: Object.freeze(["codexgpt:read", "codexgpt:write", "codexgpt:execute"]),
    tokenId: "token_0123456789abcdef",
    tokenFingerprint: "raw_token_fingerprint_must_not_escape",
    expiresAt: 2_000_000_000,
    ...overrides
  });
}

function config(overrides = {}) {
  return {
    writeMode: "workspace",
    gitMode: "local",
    bashMode: "full",
    executionProfile: "full_access",
    ...overrides
  };
}

test("OAuth policy identity is request-local, strong, redacted, and owner-stable", () => {
  let sessionId = "session_0123456789abcdef";
  const source = createOAuthPolicySessionSource({ transportSessionId: () => sessionId });
  assert.throws(() => source.currentIdentity(), /OAuth request identity is unavailable/);

  const first = runWithOAuthRequestContext(requestContext(), () => source.currentIdentity());
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.kind, "oauth_subject");
  assert.equal(first.authenticationMode, "oauth2");
  assert.equal(first.subject, "oauth-owner-subject");
  assert.match(first.ownerId, /^owner_[a-f0-9]{32}$/);
  assert.match(first.credentialRef, /^cred_[a-z2-7]{26}$/);
  assert.equal(first.credentialRevision, "oauth_grant_revision_7");
  assert.equal(first.tokenId, "token_0123456789abcdef");
  assert.equal(first.clientRef, "clientref_0123456789abcdef");
  assert.equal(first.assuranceLevel, "strong");
  assert.equal(first.scopes.includes("git:index:write"), true);
  assert.equal(first.scopes.includes("host:full-access"), true);

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes("client_raw_value_must_not_escape"), false);
  assert.equal(serialized.includes("raw_token_fingerprint_must_not_escape"), false);

  const rotated = runWithOAuthRequestContext(requestContext({
    tokenId: "token_rotated_0123456789",
    tokenFingerprint: "rotated_fingerprint"
  }), () => source.identity);
  assert.equal(rotated.ownerId, first.ownerId);
  assert.equal(rotated.credentialRef, first.credentialRef);
  assert.notEqual(rotated.tokenId, first.tokenId);

  const revised = createOAuthPolicyIdentity(requestContext({ grantRevision: 8 }));
  assert.equal(ownerIdForPolicyIdentity(revised), ownerIdForPolicyIdentity(first));
  assert.equal(revised.credentialRef, first.credentialRef);
  assert.notEqual(credentialRevisionForIdentity(revised), credentialRevisionForIdentity(first));

  sessionId = "session_rotated_0123456789";
  assert.equal(source.transportSessionId(), sessionId);
});

test("OAuth grant revision invalidates credential-bound approval grants without changing owner identity", () => {
  const firstIdentity = createOAuthPolicyIdentity(requestContext({ grantRevision: 7 }));
  const revisedIdentity = createOAuthPolicyIdentity(requestContext({ grantRevision: 8 }));
  const contextFor = (identity) => ({
    schemaVersion: 1,
    requestId: "request_0123456789abcdef",
    transportKind: "streamable_http",
    transportSessionId: "session_0123456789abcdef",
    identity,
    workspaceId: "workspace_0123456789abcdef",
    runtimeProfileId: "runtime-default",
    permissionProfileId: "permission-default",
    policyRevision: "policy-revision-1",
    sessionGrantRevision: "grant-revision-0",
    receivedAt: "2026-07-26T10:00:00.000Z"
  });
  const store = new SessionGrantStore();
  const issued = store.issue({
    context: contextFor(firstIdentity),
    operation: "filesystem.write",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    inputDigest: `sha256:${"b".repeat(64)}`,
    riskClass: "R2",
    toolContractVersion: "4",
    issuedAt: "2026-07-26T10:00:00.000Z",
    expiresAt: "2026-07-26T10:04:00.000Z"
  });
  assert.equal(issued.credentialRevision, "oauth_grant_revision_7");
  assert.equal(ownerIdForPolicyIdentity(firstIdentity), ownerIdForPolicyIdentity(revisedIdentity));
  assert.equal(store.findMatching({
    context: contextFor(revisedIdentity),
    operation: "filesystem.write",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    inputDigest: `sha256:${"b".repeat(64)}`,
    riskClass: "R2",
    toolContractVersion: "4",
    now: "2026-07-26T10:01:00.000Z"
  }), null);
});

test("effective OAuth policy scopes are the token mapping intersected with current deployment capability", () => {
  const identity = createOAuthPolicyIdentity(requestContext());
  const full = effectivePolicyScopes(config(), identity);
  assert.equal(full.includes("filesystem:write"), true);
  assert.equal(full.includes("git:index:write"), true);
  assert.equal(full.includes("shell:execute"), true);
  assert.equal(full.includes("host:full-access"), true);

  const reduced = effectivePolicyScopes(config({
    writeMode: "off",
    gitMode: "read",
    bashMode: "off",
    executionProfile: "off"
  }), identity);
  assert.deepEqual(reduced, ["workspace:open", "filesystem:read", "git:read", "audit:read"]);

  const readOnlyToken = createOAuthPolicyIdentity(requestContext({ scopes: Object.freeze(["codexgpt:read"]) }));
  const expandedDeployment = effectivePolicyScopes(config(), readOnlyToken);
  assert.deepEqual(expandedDeployment, ["workspace:open", "filesystem:read", "git:read", "audit:read"]);
});

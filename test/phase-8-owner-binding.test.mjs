import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createOAuthPolicyIdentity,
  createOAuthPolicySessionSource,
  ownerIdForPolicyIdentity,
  policyIdentityOwnershipFacts
} from "../dist/auth/policyIdentity.js";
import { runWithOAuthRequestContext } from "../dist/auth/requestContext.js";
import { deriveChangeSetOwnerBinding } from "../dist/changesets/undo.js";
import { createHttpPolicySessionSource } from "../dist/policy/identity.js";

function oauthContext(overrides = {}) {
  return Object.freeze({
    ownerSubject: "oauth-owner-subject",
    ownerRef: "ownerref_0123456789abcdef",
    clientId: "client_raw",
    clientRef: "clientref_0123456789abcdef",
    resource: "https://mcp.example.com/mcp",
    bindingId: "binding_0123456789abcdef",
    incarnationId: "incarnation_0123456789abcdef",
    grantId: "grant_0123456789abcdef",
    grantRevision: 1,
    scopes: Object.freeze(["codexgpt:read", "codexgpt:write"]),
    tokenId: "token_0123456789abcdef",
    tokenFingerprint: "fingerprint",
    expiresAt: 2_000_000_000,
    ...overrides
  });
}

const bindingKey = Buffer.alloc(32, 0x41);

test("OAuth ownership is subject-stable across access, refresh, signing-key, and grant revision changes", () => {
  const first = createOAuthPolicyIdentity(oauthContext());
  const accessRotated = createOAuthPolicyIdentity(oauthContext({
    tokenId: "token_rotated_0123456789",
    tokenFingerprint: "rotated"
  }));
  const signingRotated = createOAuthPolicyIdentity(oauthContext({
    incarnationId: "incarnation_rotated_012345",
    tokenId: "token_signing_rotated_1234"
  }));
  const grantRevised = createOAuthPolicyIdentity(oauthContext({ grantRevision: 2 }));

  assert.deepEqual(policyIdentityOwnershipFacts(accessRotated), policyIdentityOwnershipFacts(first));
  assert.deepEqual(policyIdentityOwnershipFacts(signingRotated), policyIdentityOwnershipFacts(first));
  assert.deepEqual(policyIdentityOwnershipFacts(grantRevised), policyIdentityOwnershipFacts(first));
  assert.equal(ownerIdForPolicyIdentity(accessRotated), ownerIdForPolicyIdentity(first));
  assert.equal(ownerIdForPolicyIdentity(signingRotated), ownerIdForPolicyIdentity(first));
  assert.equal(ownerIdForPolicyIdentity(grantRevised), ownerIdForPolicyIdentity(first));
  assert.equal(accessRotated.credentialRef, first.credentialRef);
  assert.equal(grantRevised.credentialRef, first.credentialRef);
  assert.notEqual(grantRevised.credentialRevision, first.credentialRevision);
});

test("change-set ownership follows the stable OAuth subject and fails closed across subjects or auth domains", () => {
  const source = createOAuthPolicySessionSource({ transportSessionId: () => "session_0123456789abcdef" });
  const first = runWithOAuthRequestContext(oauthContext(), () => deriveChangeSetOwnerBinding(source, bindingKey));
  const refreshed = runWithOAuthRequestContext(oauthContext({
    tokenId: "token_refreshed_01234567",
    grantRevision: 2
  }), () => deriveChangeSetOwnerBinding(source, bindingKey));
  const otherSubject = runWithOAuthRequestContext(oauthContext({
    ownerSubject: "different-oauth-owner",
    ownerRef: "ownerref_different_012345"
  }), () => deriveChangeSetOwnerBinding(source, bindingKey));

  const legacy = createHttpPolicySessionSource({
    authenticationMode: "bearer",
    configuredCredential: "legacy-static-secret",
    key: Buffer.alloc(32, 0x42),
    transportSessionId: () => "session_0123456789abcdef",
    scopes: ["workspace:open", "filesystem:read"]
  });
  const legacyBinding = deriveChangeSetOwnerBinding(legacy, bindingKey);

  assert.equal(refreshed, first);
  assert.notEqual(otherSubject, first);
  assert.notEqual(legacyBinding, first);
});

test("legacy and OAuth owner identifiers remain separate while each legacy credential stays stable", () => {
  const oauth = createOAuthPolicyIdentity(oauthContext());
  const legacyA = createHttpPolicySessionSource({
    authenticationMode: "query_token",
    configuredCredential: "legacy-secret",
    key: Buffer.alloc(32, 0x43),
    transportSessionId: () => "session_a_0123456789",
    scopes: ["workspace:open", "filesystem:read"]
  });
  const legacyB = createHttpPolicySessionSource({
    authenticationMode: "query_token",
    configuredCredential: "legacy-secret",
    key: Buffer.alloc(32, 0x43),
    transportSessionId: () => "session_b_0123456789",
    scopes: ["workspace:open", "filesystem:read"]
  });

  const legacyIdentity = legacyA.currentIdentity();
  const expectedLegacyOwner = `owner_${createHash("sha256")
    .update(`${legacyIdentity.kind}\0${legacyIdentity.subject ?? ""}\0${legacyIdentity.credentialRef ?? ""}`)
    .digest("hex")
    .slice(0, 32)}`;
  assert.equal(policyIdentityOwnershipFacts(legacyIdentity), legacyIdentity);
  assert.equal(ownerIdForPolicyIdentity(legacyIdentity), expectedLegacyOwner);
  assert.equal(ownerIdForPolicyIdentity(legacyIdentity), ownerIdForPolicyIdentity(legacyB.currentIdentity()));
  assert.notEqual(ownerIdForPolicyIdentity(legacyIdentity), ownerIdForPolicyIdentity(oauth));
});

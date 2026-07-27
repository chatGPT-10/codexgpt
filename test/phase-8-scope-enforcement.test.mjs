import assert from "node:assert/strict";
import test from "node:test";
import { buildBearerChallenge } from "../dist/auth/challenges.js";
import { oauthScopesForDeployment } from "../dist/auth/policyIdentity.js";
import {
  enforceOAuthToolScopes,
  requestedOAuthScopesForTool
} from "../dist/auth/toolSecurity.js";

const identity = Object.freeze({
  issuer: "https://mcp.example.com",
  resource: "https://mcp.example.com/mcp",
  hostname: "mcp.example.com",
  profileId: "0123456789abcdef01234567",
  bindingId: "binding_0123456789abcdef",
  incarnationId: "incarnation_0123456789abcdef",
  recoveryEpoch: "recovery_0123456789abcdef"
});

function context(scopes) {
  return Object.freeze({
    ownerSubject: "oauth-owner-subject",
    ownerRef: "ownerref_0123456789abcdef",
    clientId: "client_raw",
    clientRef: "clientref_0123456789abcdef",
    resource: identity.resource,
    bindingId: identity.bindingId,
    incarnationId: identity.incarnationId,
    grantId: "grant_0123456789abcdef",
    grantRevision: 1,
    scopes: Object.freeze([...scopes]),
    tokenId: "token_0123456789abcdef",
    tokenFingerprint: "fingerprint",
    expiresAt: 2_000_000_000
  });
}

test("deployment OAuth scopes reflect filesystem, Git, shell, and process configuration", () => {
  assert.deepEqual(oauthScopesForDeployment({
    writeMode: "off",
    gitMode: "read",
    bashMode: "off",
    executionProfile: "off"
  }), ["codexgpt:read"]);
  assert.deepEqual(oauthScopesForDeployment({
    writeMode: "off",
    gitMode: "local",
    bashMode: "off",
    executionProfile: "off"
  }), ["codexgpt:read", "codexgpt:write"]);
  assert.deepEqual(oauthScopesForDeployment({
    writeMode: "off",
    gitMode: "read",
    bashMode: "off",
    executionProfile: "workspace"
  }), ["codexgpt:read", "codexgpt:execute"]);
});

test("tool scope decision distinguishes disabled deployment, token step-up, and allowed capability", () => {
  const disabled = enforceOAuthToolScopes({
    toolName: "write",
    context: context(["codexgpt:read"]),
    runtime: { identity, enabledScopes: ["codexgpt:read"] }
  });
  assert.equal(disabled.isError, true);
  assert.equal(disabled._meta, undefined);
  assert.match(disabled.content[0].text, /local profile/);

  const stepUp = enforceOAuthToolScopes({
    toolName: "write",
    context: context(["codexgpt:read"]),
    runtime: { identity, enabledScopes: ["codexgpt:read", "codexgpt:write"] }
  });
  assert.equal(stepUp.isError, true);
  assert.equal(stepUp.content[0].text, "Reconnect to allow this capability.");
  const challenge = stepUp._meta["mcp/www_authenticate"][0];
  assert.match(challenge, /^Bearer /);
  assert.match(challenge, /error="insufficient_scope"/);
  assert.match(challenge, /scope="codexgpt:read codexgpt:write"/);
  assert.equal(challenge.includes("oauth-owner-subject"), false);
  assert.equal(challenge.includes("client_raw"), false);

  const allowed = enforceOAuthToolScopes({
    toolName: "write",
    context: context(["codexgpt:read", "codexgpt:write"]),
    runtime: { identity, enabledScopes: ["codexgpt:read", "codexgpt:write"] }
  });
  assert.equal(allowed, null);
});

test("challenge serialization rejects injected metadata and emits no internal identifiers", () => {
  assert.throws(() => buildBearerChallenge({
    identity: { ...identity, issuer: "https://mcp.example.com\r\nX-Injected: yes" },
    scopes: ["codexgpt:read"],
    kind: "missing"
  }), /unsafe/);
  const challenge = buildBearerChallenge({
    identity,
    scopes: ["codexgpt:read", "codexgpt:write"],
    kind: "insufficient_scope"
  });
  assert.equal(challenge.includes(identity.bindingId), false);
  assert.equal(challenge.includes(identity.incarnationId), false);
  assert.equal(challenge.includes(identity.profileId), false);
});

test("step-up scope union preserves existing read and write when execute is added", () => {
  assert.deepEqual(requestedOAuthScopesForTool({
    grantedScopes: ["codexgpt:read", "codexgpt:write"],
    toolName: "run_command",
    enabledScopes: ["codexgpt:read", "codexgpt:write", "codexgpt:execute"]
  }), ["codexgpt:read", "codexgpt:write", "codexgpt:execute"]);
});

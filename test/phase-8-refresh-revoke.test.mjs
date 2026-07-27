import assert from "node:assert/strict";
import test from "node:test";
import {
  form,
  issueAuthorizationCode,
  registerApprovedClient,
  request,
  setupTokenRuntime
} from "./phase-8-token-test-helpers.mjs";

async function codeExchange(runtime, client) {
  const grant = await issueAuthorizationCode(runtime, client);
  const response = await request(runtime, "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code: grant.code,
      code_verifier: grant.verifier,
      redirect_uri: grant.redirectUri,
      resource: runtime.identity.resource
    })
  });
  assert.equal(response.status, 200, response.text);
  return JSON.parse(response.text);
}

async function refresh(runtime, client, refreshToken, overrides = {}) {
  return await request(runtime, "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: refreshToken,
      resource: runtime.identity.resource,
      ...overrides
    })
  });
}

function nonCanonicalBase64Url(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const finalIndex = alphabet.indexOf(value.at(-1));
  assert.notEqual(finalIndex, -1);
  const equivalentGroup = finalIndex & 0b111100;
  const replacementIndex = equivalentGroup === finalIndex ? equivalentGroup + 1 : equivalentGroup;
  const candidate = `${value.slice(0, -1)}${alphabet[replacementIndex]}`;
  assert.notEqual(candidate, value);
  assert.deepEqual(Buffer.from(candidate, "base64url"), Buffer.from(value, "base64url"));
  return candidate;
}

test("refresh rotates once, preserves grant authority, and replay revokes the complete family", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const first = await codeExchange(runtime, client);
    const firstVerified = await runtime.tokens.verifyAccessToken(first.access_token);

    const rotatedResponse = await refresh(runtime, client, first.refresh_token);
    assert.equal(rotatedResponse.status, 200, rotatedResponse.text);
    const rotated = JSON.parse(rotatedResponse.text);
    assert.notEqual(rotated.refresh_token, first.refresh_token);
    const secondVerified = await runtime.tokens.verifyAccessToken(rotated.access_token);
    assert.equal(secondVerified.grantId, firstVerified.grantId);
    assert.equal(secondVerified.grantRevision, firstVerified.grantRevision);
    assert.notEqual(secondVerified.tokenId, firstVerified.tokenId);
    await runtime.tokens.verifyAccessToken(first.access_token);

    const replay = await refresh(runtime, client, first.refresh_token);
    assert.equal(replay.status, 400);
    assert.equal(JSON.parse(replay.text).error, "invalid_grant");
    await assert.rejects(() => runtime.tokens.verifyAccessToken(first.access_token));
    await assert.rejects(() => runtime.tokens.verifyAccessToken(rotated.access_token));
    const grant = runtime.grants.getByGrantId(firstVerified.grantId);
    assert.equal(grant.status, "revoked");
    assert.equal(grant.revokeReason, "replay");
    assert.equal(grant.grantRevision, firstVerified.grantRevision + 1);
  } finally {
    await runtime.close();
  }
});

test("refresh rejects a non-canonical base64url representation without consuming the canonical token", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await codeExchange(runtime, client);
    const nonCanonical = nonCanonicalBase64Url(issued.refresh_token);
    const rejected = await refresh(runtime, client, nonCanonical);
    assert.equal(rejected.status, 400);
    assert.equal(JSON.parse(rejected.text).error, "invalid_grant");

    const canonical = await refresh(runtime, client, issued.refresh_token);
    assert.equal(canonical.status, 200, canonical.text);
  } finally {
    await runtime.close();
  }
});

test("concurrent double refresh is linearizable: at most one success and the replay revokes the family", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await codeExchange(runtime, client);
    const verified = await runtime.tokens.verifyAccessToken(issued.access_token);
    const [first, second] = await Promise.all([
      refresh(runtime, client, issued.refresh_token),
      refresh(runtime, client, issued.refresh_token)
    ]);
    const successes = [first, second].filter((response) => response.status === 200);
    const failures = [first, second].filter((response) => response.status === 400);
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(JSON.parse(failures[0].text).error, "invalid_grant");
    const grant = runtime.grants.getByGrantId(verified.grantId);
    assert.equal(grant.status, "revoked");
    assert.equal(grant.revokeReason, "replay");
    const successor = JSON.parse(successes[0].text);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(successor.access_token));
  } finally {
    await runtime.close();
  }
});

test("refresh rejects scope mutation, wrong resource, and cross-client use without changing the family", async () => {
  const runtime = await setupTokenRuntime({
    enabledScopes: ["codexgpt:read", "codexgpt:write"]
  });
  try {
    const client = await registerApprovedClient(runtime);
    const otherClient = await registerApprovedClient(runtime, {
      redirectUri: "https://chatgpt.com/connector/oauth/callback_87654321"
    });
    const first = await codeExchange(runtime, client);
    for (const [actor, overrides, expected] of [
      [client, { scope: "codexgpt:read" }, "invalid_scope"],
      [client, { scope: "codexgpt:write codexgpt:read" }, "invalid_scope"],
      [client, { resource: "https://mcp.example.com/other" }, "invalid_target"],
      [otherClient, {}, "invalid_grant"]
    ]) {
      const response = await request(runtime, "/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({
          grant_type: "refresh_token",
          client_id: actor.client_id,
          refresh_token: first.refresh_token,
          resource: runtime.identity.resource,
          ...overrides
        })
      });
      assert.equal(response.status, 400, response.text);
      assert.equal(JSON.parse(response.text).error, expected);
    }
    const success = await refresh(runtime, client, first.refresh_token, {
      scope: "codexgpt:read codexgpt:write"
    });
    assert.equal(success.status, 200, success.text);
  } finally {
    await runtime.close();
  }
});

test("public revocation is non-oracular and durable access revocation is immediate", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const otherClient = await registerApprovedClient(runtime, {
      redirectUri: "https://chatgpt.com/connector/oauth/callback_87654321"
    });
    const issued = await codeExchange(runtime, client);
    const verified = await runtime.tokens.verifyAccessToken(issued.access_token);

    const crossClient = await request(runtime, "/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        client_id: otherClient.client_id,
        token: issued.refresh_token,
        token_type_hint: "refresh_token"
      })
    });
    assert.equal(crossClient.status, 200, crossClient.text);
    await runtime.tokens.verifyAccessToken(issued.access_token);

    const revoked = await request(runtime, "/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        client_id: client.client_id,
        token: issued.access_token,
        token_type_hint: "access_token"
      })
    });
    assert.equal(revoked.status, 200, revoked.text);
    assert.equal(revoked.headers["cache-control"], "no-store");
    await assert.rejects(() => runtime.tokens.verifyAccessToken(issued.access_token));
    const grant = runtime.grants.getByGrantId(verified.grantId);
    assert.equal(grant.status, "revoked");
    assert.equal(grant.revokeReason, "public");

    for (const token of [issued.access_token, "unknown-token"]) {
      const repeated = await request(runtime, "/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ client_id: client.client_id, token })
      });
      assert.equal(repeated.status, 200, repeated.text);
    }
  } finally {
    await runtime.close();
  }
});

test("client and owner local revocation invalidate current access before returning success", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await codeExchange(runtime, client);
    const verified = await runtime.tokens.verifyAccessToken(issued.access_token);
    const ownerClients = new runtime.foundation.auth.OAuthOwnerClientService(runtime.clients, runtime.grants);
    assert.equal(await ownerClients.revoke(client.client_id), true);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(issued.access_token));
    assert.equal(runtime.grants.getByGrantId(verified.grantId).revokeReason, "client");

    const secondClient = await registerApprovedClient(runtime, {
      redirectUri: "https://chatgpt.com/connector/oauth/callback_87654321"
    });
    const second = await codeExchange(runtime, secondClient);
    const secondVerified = await runtime.tokens.verifyAccessToken(second.access_token);
    assert.equal(await runtime.grants.revokeOwner(), 1);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(second.access_token));
    assert.equal(runtime.grants.getByGrantId(secondVerified.grantId).revokeReason, "owner");
  } finally {
    await runtime.close();
  }
});

test("active refresh state survives process restart without changing authority", async () => {
  const runtime = await setupTokenRuntime();
  let restarted;
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await codeExchange(runtime, client);
    runtime.tokens.dispose();
    const state = runtime.foundation.store.readDeployment(runtime.identity.bindingId, runtime.identity.incarnationId);
    const grants = new runtime.foundation.auth.OAuthGrantStore({
      store: runtime.foundation.store,
      locks: runtime.foundation.locks,
      bindingId: state.bindingId,
      incarnationId: state.incarnationId,
      ownerRef: state.ownerRef,
      resource: state.resource
    });
    restarted = await runtime.foundation.auth.OAuthTokenService.create({
      identity: runtime.identity,
      ownerSubject: runtime.initialized.ownerSubject,
      ownerRef: state.ownerRef,
      state,
      store: runtime.foundation.store,
      keyManager: runtime.foundation.keyManager,
      grants
    });
    const rotated = await restarted.exchangeRefreshToken({
      clientId: client.client_id,
      refreshToken: issued.refresh_token,
      resource: runtime.identity.resource
    });
    assert.notEqual(rotated.refresh_token, issued.refresh_token);
    const verified = await restarted.verifyAccessToken(rotated.access_token);
    assert.equal(verified.clientId, client.client_id);
    assert.equal(verified.ownerSubject, runtime.initialized.ownerSubject);
  } finally {
    restarted?.dispose();
    await runtime.close();
  }
});

test("one refresh family remains valid beyond 1024 single-use rotations", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    let issued = await codeExchange(runtime, client);
    const initial = await runtime.tokens.verifyAccessToken(issued.access_token);
    for (let generation = 0; generation < 1025; generation += 1) {
      issued = await runtime.tokens.exchangeRefreshToken({
        clientId: client.client_id,
        refreshToken: issued.refresh_token,
        resource: runtime.identity.resource
      });
    }
    const final = await runtime.tokens.verifyAccessToken(issued.access_token);
    assert.equal(final.grantId, initial.grantId);
    assert.equal(final.clientId, client.client_id);
    assert.equal(runtime.grants.getByGrantId(final.grantId).status, "active");
  } finally {
    await runtime.close();
  }
});

test("refresh family idle expiry is durable and cannot be revived", async () => {
  let now = Date.parse("2026-07-26T12:00:00.000Z");
  const runtime = await setupTokenRuntime({ now: () => now });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await codeExchange(runtime, client);
    const verified = await runtime.tokens.verifyAccessToken(issued.access_token);
    now += runtime.foundation.auth.OAUTH_REFRESH_IDLE_LIFETIME_MS + 1;
    const expired = await refresh(runtime, client, issued.refresh_token);
    assert.equal(expired.status, 400);
    assert.equal(JSON.parse(expired.text).error, "invalid_grant");
    const grant = runtime.grants.getByGrantId(verified.grantId);
    assert.equal(grant.status, "expired");
    assert.equal(grant.revokeReason, "expired");
  } finally {
    await runtime.close();
  }
});

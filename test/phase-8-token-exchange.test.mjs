import assert from "node:assert/strict";
import test from "node:test";
import {
  form,
  issueAuthorizationCode,
  registerApprovedClient,
  request,
  setupTokenRuntime
} from "./phase-8-token-test-helpers.mjs";

function tokenForm(runtime, client, grant, overrides = {}) {
  return form({
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: grant.code,
    code_verifier: grant.verifier,
    redirect_uri: grant.redirectUri,
    resource: runtime.identity.resource,
    ...overrides
  });
}

test("authorization code exchange returns one ES256 access token and one opaque refresh token", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const grant = await issueAuthorizationCode(runtime, client);
    const response = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: `${tokenForm(runtime, client, grant)}&unknown_extension=bounded`
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers.pragma, "no-cache");
    assert.equal(response.headers["access-control-allow-origin"], "*");
    const body = JSON.parse(response.text);
    assert.equal(body.token_type, "Bearer");
    assert.equal(body.expires_in, 600);
    assert.equal(body.scope, "codexgpt:read");
    assert.match(body.refresh_token, /^[A-Za-z0-9_-]+$/);
    assert.ok(body.refresh_token.length < 512);
    const [headerPart] = body.access_token.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")), {
      alg: "ES256",
      typ: "at+jwt",
      kid: runtime.initialized.state.activePublicJwk.kid
    });
    const verified = await runtime.tokens.verifyAccessToken(body.access_token);
    assert.equal(verified.clientId, client.client_id);
    assert.equal(verified.ownerSubject, runtime.initialized.ownerSubject);
    assert.equal(verified.resource, runtime.identity.resource);
    assert.deepEqual(verified.scopes, ["codexgpt:read"]);
    const state = runtime.foundation.store.readDeployment(
      runtime.identity.bindingId,
      runtime.identity.incarnationId
    );
    const durable = state.grants.find((entry) => entry.grantId === verified.grantId);
    assert.ok(durable);
    assert.equal("refreshTokenHash" in durable, true);
    assert.equal(JSON.stringify(state).includes(body.refresh_token), false);
    assert.equal(JSON.stringify(state).includes(body.access_token), false);

    const reused = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm(runtime, client, grant)
    });
    assert.equal(reused.status, 400);
    assert.equal(JSON.parse(reused.text).error, "invalid_grant");
  } finally {
    await runtime.close();
  }
});

test("code exchange validates PKCE, redirect, resource, and public client authentication before mutation", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const grant = await issueAuthorizationCode(runtime, client);
    const wrongVerifier = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm(runtime, client, grant, { code_verifier: "x".repeat(64) })
    });
    assert.equal(wrongVerifier.status, 400);
    assert.equal(JSON.parse(wrongVerifier.text).error, "invalid_grant");

    const wrongResource = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm(runtime, client, grant, { resource: "https://mcp.example.com/other" })
    });
    assert.equal(wrongResource.status, 400);
    assert.equal(JSON.parse(wrongResource.text).error, "invalid_target");

    const clientSecret = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `${tokenForm(runtime, client, grant)}&client_secret=forbidden`
    });
    assert.equal(clientSecret.status, 400);
    assert.equal(JSON.parse(clientSecret.text).error, "invalid_client");

    const success = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm(runtime, client, grant)
    });
    assert.equal(success.status, 200, success.text);
  } finally {
    await runtime.close();
  }
});

test("signing authority failure publishes no active grant before code exchange returns", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const grant = await issueAuthorizationCode(runtime, client);
    const current = runtime.foundation.store.readDeployment(
      runtime.identity.bindingId,
      runtime.identity.incarnationId
    );
    await runtime.foundation.keyManager.rotateSigningKey(runtime.foundation.store, current);
    const failed = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm(runtime, client, grant)
    });
    assert.equal(failed.status, 503, failed.text);
    const afterFailure = runtime.foundation.store.readDeployment(
      runtime.identity.bindingId,
      runtime.identity.incarnationId
    );
    assert.equal(afterFailure.grants.length, 0);
  } finally {
    await runtime.close();
  }
});

test("audit failure publishes neither a grant nor code consumption and the exact retry succeeds once", async () => {
  let failExchangeAudit = true;
  const runtime = await setupTokenRuntime({
    foundationOptions: {
      audit: {
        append(event) {
          if (failExchangeAudit && event.transition === "authorization_code_exchanged") {
            throw new Error("audit-offline");
          }
        }
      }
    }
  });
  try {
    const client = await registerApprovedClient(runtime);
    const grant = await issueAuthorizationCode(runtime, client);
    const body = tokenForm(runtime, client, grant);
    const failed = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    assert.equal(failed.status, 503, failed.text);
    const afterFailure = runtime.foundation.store.readDeployment(
      runtime.identity.bindingId,
      runtime.identity.incarnationId
    );
    assert.equal(afterFailure.grants.length, 0);

    failExchangeAudit = false;
    const success = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    assert.equal(success.status, 200, success.text);
    const afterSuccess = runtime.foundation.store.readDeployment(
      runtime.identity.bindingId,
      runtime.identity.incarnationId
    );
    assert.equal(afterSuccess.grants.length, 1);
  } finally {
    await runtime.close();
  }
});

test("token endpoint rejects duplicate, forbidden, alternate content type, and unsupported standard parameters", async () => {
  const runtime = await setupTokenRuntime();
  try {
    const client = await registerApprovedClient(runtime);
    const grant = await issueAuthorizationCode(runtime, client);
    const base = tokenForm(runtime, client, grant);
    for (const [body, contentType, expected] of [
      [`${base}&client_id=${encodeURIComponent(client.client_id)}`, "application/x-www-form-urlencoded", "invalid_request"],
      [`${base}&state=forbidden`, "application/x-www-form-urlencoded", "invalid_request"],
      [base, "application/json", "invalid_request"],
      [`${base}&refresh_token=forbidden`, "application/x-www-form-urlencoded", "invalid_request"]
    ]) {
      const response = await request(runtime, "/token", {
        method: "POST",
        headers: { "content-type": contentType },
        body
      });
      assert.equal(response.status, 400, response.text);
      assert.equal(JSON.parse(response.text).error, expected);
      assert.equal(response.headers["cache-control"], "no-store");
    }
  } finally {
    await runtime.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { CompactSign, SignJWT } from "jose";
import {
  OAUTH_ES256_ACTIVE_LIMIT,
  OAUTH_ES256_QUEUE_LIMIT,
  OAUTH_ES256_RESERVED_ACTIVE,
  OAUTH_ES256_RESERVED_QUEUE,
  OAuthEs256Admission
} from "../dist/auth/tokenService.js";
import {
  form,
  issueAuthorizationCode,
  registerApprovedClient,
  request,
  setupTokenRuntime
} from "./phase-8-token-test-helpers.mjs";

async function exchange(runtime, client) {
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

test("access-token verification is strict for signature, header, issuer, audience, claims, and time", async () => {
  let now = Date.parse("2026-07-26T12:00:00.000Z");
  const runtime = await setupTokenRuntime({ now: () => now });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client);
    const valid = await runtime.tokens.verifyAccessToken(issued.access_token);
    assert.equal(valid.clientId, client.client_id);

    const parts = issued.access_token.split(".");
    const tamperedSignature = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${parts[2].endsWith("A") ? "B" : "A"}`;
    await assert.rejects(() => runtime.tokens.verifyAccessToken(tamperedSignature));
    await assert.rejects(() => runtime.tokens.verifyAccessToken("not.a.jwt"));
    await assert.rejects(() => runtime.tokens.verifyAccessToken(` ${issued.access_token}`));
    await assert.rejects(() => runtime.tokens.verifyAccessToken("a".repeat(8193)));

    const privateKey = await runtime.foundation.keyManager.loadPrivateKey(runtime.initialized.state);
    const issuedAt = Math.floor(now / 1000);
    const wrongAudience = await new SignJWT({
      client_id: client.client_id,
      scope: "codexgpt:read",
      grant_id: valid.grantId,
      grant_rev: valid.grantRevision
    })
      .setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid: runtime.initialized.state.activePublicJwk.kid })
      .setIssuer(runtime.identity.issuer)
      .setAudience("https://mcp.example.com/other")
      .setSubject(runtime.initialized.ownerSubject)
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 600)
      .setJti(`token_${"A".repeat(43)}`)
      .sign(privateKey);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(wrongAudience));

    const duplicatePayload = `{"iss":${JSON.stringify(runtime.identity.issuer)},"aud":${JSON.stringify(runtime.identity.resource)},"sub":${JSON.stringify(runtime.initialized.ownerSubject)},"sub":${JSON.stringify(runtime.initialized.ownerSubject)},"client_id":${JSON.stringify(client.client_id)},"scope":"codexgpt:read","grant_id":${JSON.stringify(valid.grantId)},"grant_rev":${valid.grantRevision},"iat":${issuedAt},"nbf":${issuedAt},"exp":${issuedAt + 600},"jti":"token_${"C".repeat(43)}"}`;
    const duplicateSigned = await new CompactSign(Buffer.from(duplicatePayload, "utf8"))
      .setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid: runtime.initialized.state.activePublicJwk.kid })
      .sign(privateKey);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(duplicateSigned));

    const wrongType = await new SignJWT({
      client_id: client.client_id,
      scope: "codexgpt:read",
      grant_id: valid.grantId,
      grant_rev: valid.grantRevision
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: runtime.initialized.state.activePublicJwk.kid })
      .setIssuer(runtime.identity.issuer)
      .setAudience(runtime.identity.resource)
      .setSubject(runtime.initialized.ownerSubject)
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 600)
      .setJti(`token_${"B".repeat(43)}`)
      .sign(privateKey);
    await assert.rejects(() => runtime.tokens.verifyAccessToken(wrongType));

    now += 661_000;
    await assert.rejects(() => runtime.tokens.verifyAccessToken(issued.access_token));
  } finally {
    await runtime.close();
  }
});

test("ES256 admission preserves exact active and queue capacity for established traffic", async () => {
  const admission = new OAuthEs256Admission();
  const blockers = [];
  const started = [];
  const hold = (label) => admission.run(label.startsWith("reserved"), () => new Promise((resolve) => {
    started.push(label);
    blockers.push(resolve);
  }));
  const active = [];
  for (let index = 0; index < OAUTH_ES256_ACTIVE_LIMIT - OAUTH_ES256_RESERVED_ACTIVE; index += 1) {
    active.push(hold(`ordinary-active-${index}`));
  }
  for (let index = 0; index < OAUTH_ES256_RESERVED_ACTIVE; index += 1) {
    active.push(hold(`reserved-active-${index}`));
  }
  assert.equal(started.length, OAUTH_ES256_ACTIVE_LIMIT);

  const queued = [];
  for (let index = 0; index < OAUTH_ES256_QUEUE_LIMIT - OAUTH_ES256_RESERVED_QUEUE; index += 1) {
    queued.push(admission.run(false, async () => { started.push(`ordinary-queued-${index}`); }));
  }
  assert.throws(() => admission.run(false, async () => undefined), { name: "OAuthBearerCapacityError" });
  for (let index = 0; index < OAUTH_ES256_RESERVED_QUEUE; index += 1) {
    queued.push(admission.run(true, async () => { started.push(`reserved-queued-${index}`); }));
  }
  assert.throws(() => admission.run(true, async () => undefined), { name: "OAuthBearerCapacityError" });
  for (const resolve of blockers) resolve();
  await Promise.all([...active, ...queued]);
  assert.equal(started.length, OAUTH_ES256_ACTIVE_LIMIT + OAUTH_ES256_QUEUE_LIMIT);
});

test("failed-new-token budget bounds invalid signature work while a cached valid token remains usable", async () => {
  let now = Date.parse("2026-07-26T12:00:00.000Z");
  const runtime = await setupTokenRuntime({ now: () => now });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client);
    await runtime.tokens.verifyAccessToken(issued.access_token);
    const header = Buffer.from(JSON.stringify({
      alg: "ES256",
      typ: "at+jwt",
      kid: runtime.initialized.state.activePublicJwk.kid
    })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ value: "invalid" })).toString("base64url");
    const invalid = (index) => `${header}.${payload}.${Buffer.alloc(64, index + 1).toString("base64url")}`;
    for (let index = 0; index < 30; index += 1) {
      await assert.rejects(() => runtime.tokens.verifyAccessToken(invalid(index)), (error) => error?.name === "OAuthProtocolError");
    }
    await assert.rejects(
      () => runtime.tokens.verifyAccessToken(invalid(30)),
      (error) => error?.name === "OAuthBearerCapacityError"
    );
    const cached = await runtime.tokens.verifyAccessToken(issued.access_token);
    assert.equal(cached.clientId, client.client_id);
    now += 500;
    await assert.rejects(() => runtime.tokens.verifyAccessToken(invalid(30)), (error) => error?.name === "OAuthProtocolError");
  } finally {
    await runtime.close();
  }
});

test("every MCP request requires one bearer source and exposes safe discovery challenges", async () => {
  const seen = [];
  const mcp = {
    async handlePost(_req, res, context) {
      seen.push(context);
      res.status(200).json({ ok: true, tokenId: context.tokenId });
    },
    async handleSession(_req, res, context) {
      seen.push(context);
      res.status(200).json({ ok: true, tokenId: context.tokenId });
    }
  };
  const runtime = await setupTokenRuntime({ mcp, allowedOrigins: ["https://chatgpt.com"] });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client);

    const missing = await request(runtime, "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 })
    });
    assert.equal(missing.status, 401);
    assert.match(missing.headers["www-authenticate"], /^Bearer resource_metadata=/);
    assert.equal(missing.headers["www-authenticate"].includes("error="), false);

    const malformed = await request(runtime, "/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer malformed",
        "content-type": "application/json"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 })
    });
    assert.equal(malformed.status, 401);
    assert.match(malformed.headers["www-authenticate"], /error="invalid_token"/);

    const query = await request(runtime, `/mcp?access_token=${encodeURIComponent(issued.access_token)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${issued.access_token}` }
    });
    assert.equal(query.status, 401);

    const bodyCredential = await request(runtime, "/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.access_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ access_token: issued.access_token })
    });
    assert.equal(bodyCredential.status, 401);

    const wrongOrigin = await request(runtime, "/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.access_token}`,
        "content-type": "application/json",
        origin: "https://evil.example"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 })
    });
    assert.equal(wrongOrigin.status, 403);

    for (const origin of [
      "https://mcp.example.com/path",
      "https://mcp.example.com?query=1",
      "https://chatgpt.com/path"
    ]) {
      const malformedOrigin = await request(runtime, "/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${issued.access_token}`,
          "content-type": "application/json",
          origin
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 })
      });
      assert.equal(malformedOrigin.status, 403, origin);
    }

    const valid = await request(runtime, "/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.access_token}`,
        "content-type": "application/json",
        origin: "https://chatgpt.com"
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 })
    });
    assert.equal(valid.status, 200, valid.text);
    assert.equal(valid.headers["access-control-allow-origin"], "https://chatgpt.com");
    assert.equal(valid.headers["access-control-expose-headers"], "Mcp-Session-Id");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].clientId, client.client_id);
    assert.equal(seen[0].tokenFingerprint.length, 64);
    assert.equal(JSON.stringify(seen[0]).includes(issued.access_token), false);
  } finally {
    await runtime.close();
  }
});

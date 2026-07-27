import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { once } from "node:events";
import { createPublicOAuthApp } from "../dist/http/publicApp.js";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

async function setup(options = {}) {
  const foundation = createFoundation();
  const initialized = await foundation.coordinator.initialize(foundation.configuration);
  const identity = foundation.auth.createOAuthDeploymentIdentity({
    issuer: initialized.state.issuer,
    resource: initialized.state.resource,
    hostname: initialized.state.hostname,
    profileId: initialized.state.profileId,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    recoveryEpoch: initialized.state.recoveryEpoch
  });
  const clients = new foundation.auth.OAuthClientStore({
    store: foundation.store,
    locks: foundation.locks,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    now: options.now
  });
  const authorizations = new foundation.auth.AuthorizationStore({
    identity,
    canonicalRoot: initialized.state.canonicalRoot,
    enabledScopes: ["codexgpt:read"],
    clients,
    audit: { append(event) { foundation.events.push(structuredClone(event)); } },
    now: options.now
  });
  const grants = new foundation.auth.OAuthGrantStore({
    store: foundation.store,
    locks: foundation.locks,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    ownerRef: initialized.state.ownerRef,
    resource: initialized.state.resource,
    now: options.now
  });
  const tokens = await foundation.auth.OAuthTokenService.create({
    identity,
    ownerSubject: initialized.ownerSubject,
    ownerRef: initialized.state.ownerRef,
    state: initialized.state,
    store: foundation.store,
    keyManager: foundation.keyManager,
    grants,
    now: options.now
  });
  const app = createPublicOAuthApp({
    identity,
    enabledScopes: ["codexgpt:read"],
    publicJwks: [initialized.state.activePublicJwk],
    now: options.now,
    oauthRuntime: { clients, authorizations, tokens }
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  return {
    foundation,
    identity,
    clients,
    authorizations,
    grants,
    tokens,
    port,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      tokens.dispose();
      foundation.cleanup();
    }
  };
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ?? "";
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: {
        Host: "mcp.example.com",
        ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
        ...(options.headers ?? {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function register(runtime) {
  const response = await request(runtime.port, "/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: ["https://chatgpt.com/connector/oauth/callback_12345678"],
      client_name: "ChatGPT"
    })
  });
  assert.equal(response.status, 201, response.text);
  return JSON.parse(response.text);
}

function authorizePath(runtime, client, overrides = {}) {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    state: "state_12345678",
    resource: runtime.identity.resource,
    scope: "codexgpt:read",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    ...overrides
  });
  return `/authorize?${query}`;
}

function cookieFrom(response) {
  const setCookie = response.headers["set-cookie"];
  assert.ok(Array.isArray(setCookie) && setCookie.length === 1);
  return setCookie[0].split(";", 1)[0];
}

test("authorization requires exact client, resource, scopes, state, and PKCE S256", async () => {
  const runtime = await setup();
  try {
    const client = await register(runtime);
    const success = await request(runtime.port, authorizePath(runtime, client));
    assert.equal(success.status, 200, success.text);
    assert.match(success.text, /Authorization pending/);
    assert.match(success.headers["content-security-policy"], /frame-ancestors 'none'/);
    assert.equal(success.headers["cache-control"], "no-store");
    assert.equal(success.headers["referrer-policy"], "no-referrer");
    assert.match(success.headers["set-cookie"][0], /Secure; HttpOnly; SameSite=Lax/);
    for (const forbidden of ["D:\\Dev\\codexpro", client.client_id, "state_12345678", "A".repeat(43)]) {
      assert.equal(success.text.includes(forbidden), false, forbidden);
    }

    for (const overrides of [
      { response_type: "token" },
      { state: "short" },
      { resource: "https://mcp.example.com/other" },
      { scope: "codexgpt:write" },
      { code_challenge: "A".repeat(42) },
      { code_challenge_method: "plain" }
    ]) {
      const response = await request(runtime.port, authorizePath(runtime, client, overrides));
      assert.equal(response.status, 302, JSON.stringify(overrides));
      assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
      assert.equal(response.headers["cache-control"], "no-store");
      const location = new URL(response.headers.location);
      assert.ok(["invalid_request", "invalid_target", "invalid_scope"].includes(location.searchParams.get("error")));
      assert.equal(location.searchParams.get("state"), overrides.state ?? "state_12345678");
      assert.equal(location.searchParams.get("iss"), runtime.identity.issuer);
    }
  } finally {
    await runtime.close();
  }
});

test("authorization narrows the fixed known-scope ceiling to the currently enabled deployment scopes", async () => {
  const runtime = await setup();
  try {
    const client = await register(runtime);
    const response = await request(runtime.port, authorizePath(runtime, client, {
      scope: "codexgpt:read codexgpt:write codexgpt:execute"
    }));
    assert.equal(response.status, 200, response.text);
    assert.match(response.text, /Requested scopes: codexgpt:read/);
    assert.equal(response.text.includes("codexgpt:write"), false);
    assert.equal(response.text.includes("codexgpt:execute"), false);
    const [pending] = await runtime.authorizations.listSafe();
    assert.ok(pending);
    assert.deepEqual(pending.scopes, ["codexgpt:read"]);
    assert.equal(pending.scopesMatchCurrentConfiguration, true);
  } finally {
    await runtime.close();
  }
});

test("authorization freezes direct-versus-redirect errors and ignores only bounded unknown extensions", async () => {
  const runtime = await setup();
  try {
    const client = await register(runtime);
    const unknownClient = await request(runtime.port, authorizePath(runtime, client, {
      client_id: `client_${"B".repeat(43)}`
    }));
    assert.equal(unknownClient.status, 400);
    assert.equal(unknownClient.headers.location, undefined);
    assert.equal(JSON.parse(unknownClient.text).error, "invalid_client");

    const wrongRedirect = await request(runtime.port, authorizePath(runtime, client, {
      redirect_uri: "https://chatgpt.com/connector/oauth/callback_87654321"
    }));
    assert.equal(wrongRedirect.status, 400);
    assert.equal(wrongRedirect.headers.location, undefined);

    const duplicate = await request(
      runtime.port,
      `${authorizePath(runtime, client)}&client_id=${encodeURIComponent(client.client_id)}`
    );
    assert.equal(duplicate.status, 400);
    assert.equal(JSON.parse(duplicate.text).error, "invalid_request");

    const basic = await request(runtime.port, authorizePath(runtime, client), {
      headers: { Authorization: "Basic Zm9vOmJhcg==" }
    });
    assert.equal(basic.status, 400);
    assert.equal(JSON.parse(basic.text).error, "invalid_request");

    const unknownExtension = await request(runtime.port, authorizePath(runtime, client, {
      scope: "",
      unknown_extension: "bounded"
    }));
    assert.equal(unknownExtension.status, 200, unknownExtension.text);
    assert.equal(unknownExtension.text.includes("bounded"), false);

    const forbiddenGrant = await request(runtime.port, authorizePath(runtime, client, {
      grant_type: "authorization_code"
    }));
    assert.equal(forbiddenGrant.status, 302);
    assert.equal(new URL(forbiddenGrant.headers.location).searchParams.get("error"), "invalid_request");

    const wrongContentType = await request(runtime.port, "/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: client.client_id })
    });
    assert.equal(wrongContentType.status, 400);
    assert.equal(JSON.parse(wrongContentType.text).error, "invalid_request");
  } finally {
    await runtime.close();
  }
});

test("cookie-bound status and one-use continue deliver one code with state and issuer", async () => {
  const runtime = await setup();
  try {
    const client = await register(runtime);
    const started = await request(runtime.port, authorizePath(runtime, client));
    const cookie = cookieFrom(started);
    const [pending] = await runtime.authorizations.listSafe();
    assert.ok(pending);

    const crossCookie = await request(runtime.port, `/authorize/status/${pending.pendingId}`, {
      headers: { Cookie: "__Host-codexgpt_oauth=wrong" }
    });
    assert.equal(crossCookie.status, 404);
    const pendingStatus = await request(runtime.port, `/authorize/status/${pending.pendingId}`, {
      headers: { Cookie: cookie }
    });
    assert.deepEqual(JSON.parse(pendingStatus.text), { status: "pending" });
    assert.equal(pendingStatus.headers["access-control-allow-origin"], undefined);
    assert.match(pendingStatus.headers["content-security-policy"], /frame-ancestors 'none'/);

    assert.equal(await runtime.authorizations.approve(pending.pendingId), true);
    const approvedStatus = await request(runtime.port, `/authorize/status/${pending.pendingId}`, {
      headers: { Cookie: cookie }
    });
    assert.deepEqual(JSON.parse(approvedStatus.text), { status: "approved" });

    const continued = await request(runtime.port, `/authorize/continue/${pending.pendingId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(continued.status, 302);
    const callback = new URL(continued.headers.location);
    assert.equal(callback.origin, "https://chatgpt.com");
    const authorizationCode = callback.searchParams.get("code");
    assert.match(authorizationCode, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(callback.searchParams.get("state"), "state_12345678");
    assert.equal(callback.searchParams.get("iss"), runtime.identity.issuer);
    assert.match(continued.headers["set-cookie"][0], /Max-Age=0/);

    const second = await request(runtime.port, `/authorize/continue/${pending.pendingId}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(second.status, 404);
    assert.equal(runtime.authorizations.codeCount(), 1);
    await assert.rejects(() => runtime.authorizations.consumeAuthorizationCode({
      clientId: client.client_id,
      authorizationCode,
      redirectUri: client.redirect_uris[0],
      resource: runtime.identity.resource,
      codeChallenge: "B".repeat(43)
    }));
    const consumed = await runtime.authorizations.consumeAuthorizationCode({
      clientId: client.client_id,
      authorizationCode,
      redirectUri: client.redirect_uris[0],
      resource: runtime.identity.resource,
      codeChallenge: "A".repeat(43)
    });
    assert.deepEqual(consumed.scopes, ["codexgpt:read"]);
    await assert.rejects(() => runtime.authorizations.consumeAuthorizationCode({
      clientId: client.client_id,
      authorizationCode,
      redirectUri: client.redirect_uris[0],
      resource: runtime.identity.resource,
      codeChallenge: "A".repeat(43)
    }));
  } finally {
    await runtime.close();
  }
});

test("denial and expiry return code-free terminal callbacks", async () => {
  let now = Date.parse("2026-07-26T12:00:00.000Z");
  const runtime = await setup({ now: () => now });
  try {
    const client = await register(runtime);
    let started = await request(runtime.port, authorizePath(runtime, client));
    let cookie = cookieFrom(started);
    let [pending] = await runtime.authorizations.listSafe();
    await runtime.authorizations.deny(pending.pendingId);
    let continued = await request(runtime.port, `/authorize/continue/${pending.pendingId}`, { headers: { Cookie: cookie } });
    let callback = new URL(continued.headers.location);
    assert.equal(callback.searchParams.get("error"), "access_denied");
    assert.equal(callback.searchParams.get("code"), null);

    started = await request(runtime.port, authorizePath(runtime, client, { state: "state_87654321" }));
    cookie = cookieFrom(started);
    pending = (await runtime.authorizations.listSafe()).find((entry) => entry.status === "pending");
    now += runtime.foundation.auth.OAUTH_PENDING_LIFETIME_MS + 1;
    const status = await request(runtime.port, `/authorize/status/${pending.pendingId}`, { headers: { Cookie: cookie } });
    assert.deepEqual(JSON.parse(status.text), { status: "expired" });
    continued = await request(runtime.port, `/authorize/continue/${pending.pendingId}`, { headers: { Cookie: cookie } });
    callback = new URL(continued.headers.location);
    assert.equal(callback.searchParams.get("error"), "temporarily_unavailable");
    assert.equal(callback.searchParams.get("code"), null);
  } finally {
    await runtime.close();
  }
});

test("DCR and authorization route tables are exact and POST authorization uses the same guard", async () => {
  const runtime = await setup();
  try {
    const wrongMethod = await request(runtime.port, "/register");
    assert.equal(wrongMethod.status, 405);
    for (const path of ["/oauth/register", "/register/", "/Register"]) {
      const alias = await request(runtime.port, path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      assert.equal(alias.status, 404, path);
    }
    const badCharset = await request(runtime.port, "/register", {
      method: "POST",
      headers: { "content-type": "application/json; charset=iso-8859-1" },
      body: "{}"
    });
    assert.equal(badCharset.status, 400);

    const client = await register(runtime);
    const query = authorizePath(runtime, client).split("?", 2)[1];
    const posted = await request(runtime.port, "/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: query
    });
    assert.equal(posted.status, 200, posted.text);

    for (const [path, method] of [
      ["/oauth/authorize", "GET"],
      ["/authorize/", "GET"],
      ["/Authorize", "GET"],
      ["/authorize/other", "GET"],
      ["/authorize/status/latest", "POST"],
      ["/authorize/continue/latest", "POST"]
    ]) {
      const response = await request(runtime.port, path, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
    const alternateMethod = await request(runtime.port, "/authorize", { method: "PUT" });
    assert.equal(alternateMethod.status, 405);
  } finally {
    await runtime.close();
  }
});

test("DCR applies open machine CORS, no-store, and the exact deployment rate limit", async () => {
  const runtime = await setup({ now: () => Date.parse("2026-07-26T12:00:00.000Z") });
  try {
    const body = JSON.stringify({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      client_name: "ChatGPT"
    });
    for (let index = 0; index < 20; index += 1) {
      const response = await request(runtime.port, "/register", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body
      });
      assert.equal(response.status, 201, `registration ${index}: ${response.text}`);
      assert.equal(response.headers["access-control-allow-origin"], "*");
      assert.equal(response.headers["cache-control"], "no-store");
    }
    const limited = await request(runtime.port, "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["access-control-allow-origin"], "*");
    assert.equal(limited.headers["cache-control"], "no-store");
    assert.equal(limited.headers["retry-after"], "3600");
    assert.deepEqual(JSON.parse(limited.text), { error: "temporarily_unavailable" });
  } finally {
    await runtime.close();
  }
});

test("token and revoke routes are mounted exactly and reject invalid clients without an oracle", async () => {
  const runtime = await setup();
  try {
    for (const path of ["/token", "/revoke"]) {
      const response = await request(runtime.port, path, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=unknown"
      });
      assert.equal(response.status, 400);
      assert.equal(JSON.parse(response.text).error, "invalid_client");
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.headers["access-control-allow-origin"], "*");
    }
    for (const path of ["/oauth/token", "/token/", "/Token", "/oauth/revoke", "/revoke/", "/Revoke"]) {
      const response = await request(runtime.port, path, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=unknown"
      });
      assert.equal(response.status, 404, path);
    }
  } finally {
    await runtime.close();
  }
});

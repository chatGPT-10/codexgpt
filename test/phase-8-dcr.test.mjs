import assert from "node:assert/strict";
import test from "node:test";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

async function createClientStore(options = {}) {
  const foundation = createFoundation(options);
  const initialized = await foundation.coordinator.initialize(foundation.configuration);
  const clients = new foundation.auth.OAuthClientStore({
    store: foundation.store,
    locks: foundation.locks,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    now: options.now,
    randomBytes: options.randomBytes
  });
  return { foundation, initialized, clients };
}

function registration(overrides = {}) {
  return {
    redirect_uris: ["https://chatgpt.com/connector/oauth/callback_12345678"],
    client_name: "ChatGPT",
    ...overrides
  };
}

test("constrained DCR accepts only the current and legacy ChatGPT callbacks", () => {
  const foundation = createFoundation();
  try {
    const { parseDynamicClientRegistration } = foundation.auth;
    const current = parseDynamicClientRegistration(JSON.stringify(registration()));
    assert.equal(current.redirectUri, "https://chatgpt.com/connector/oauth/callback_12345678");
    const legacy = parseDynamicClientRegistration(JSON.stringify(registration({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"]
    })));
    assert.equal(legacy.redirectUri, "https://chatgpt.com/connector_platform_oauth_redirect");
    for (const redirectUri of [
    "http://localhost/callback",
    "https://example.com/callback",
    "https://chatgpt.com/connector/oauth/x",
    "https://user@chatgpt.com/connector/oauth/callback_12345678",
    "https://chatgpt.com/connector/oauth/callback_12345678?x=1",
    "custom://callback"
  ]) {
      assert.throws(
        () => parseDynamicClientRegistration(JSON.stringify(registration({ redirect_uris: [redirectUri] }))),
        (error) => error.oauthCode === "invalid_redirect_uri"
      );
    }
  } finally {
    foundation.cleanup();
  }
});

test("DCR rejects duplicate and security-sensitive metadata before storage", () => {
  const foundation = createFoundation();
  const { parseDynamicClientRegistration } = foundation.auth;
  assert.throws(
    () => parseDynamicClientRegistration('{"redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"],"redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]}'),
    (error) => error.oauthCode === "invalid_client_metadata"
  );
  for (const body of [
    registration({ redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect", "https://chatgpt.com/connector_platform_oauth_redirect"] }),
    registration({ grant_types: ["authorization_code"] }),
    registration({ response_types: ["token"] }),
    registration({ token_endpoint_auth_method: "client_secret_post" }),
    registration({ client_secret: "secret" }),
    registration({ jwks: {} }),
    registration({ software_statement: "statement" }),
    registration({ scope: "codexgpt:read codexgpt:read" }),
    registration({ scope: "unknown" })
  ]) {
    assert.throws(() => parseDynamicClientRegistration(JSON.stringify(body)));
  }
  foundation.cleanup();
});

test("DCR unknown extensions cannot inject inherited client metadata", () => {
  const foundation = createFoundation();
  try {
    const parsed = foundation.auth.parseDynamicClientRegistration(
      '{"redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"],"__proto__":{"client_name":"Injected client","token_endpoint_auth_method":"client_secret_post"}}'
    );
    assert.equal(parsed.clientName, null);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, "clientName"), true);
  } finally {
    foundation.cleanup();
  }
});

test("DCR persists a random public client with fixed protocol ceiling and no secret", async () => {
  const { foundation, initialized, clients } = await createClientStore();
  try {
    const parsed = foundation.auth.parseDynamicClientRegistration(JSON.stringify(registration({
      scope: "codexgpt:read",
      unknown_extension: { ignored: true }
    })));
    const result = await clients.register(parsed);
    assert.match(result.client_id, /^client_[A-Za-z0-9_-]{43}$/);
    assert.equal(result.client_secret, undefined);
    assert.equal(result.registration_access_token, undefined);
    assert.equal(result.registration_client_uri, undefined);
    assert.deepEqual(result.redirect_uris, [parsed.redirectUri]);
    assert.deepEqual(result.response_types, ["code"]);
    assert.deepEqual(result.grant_types, ["authorization_code", "refresh_token"]);
    assert.equal(result.token_endpoint_auth_method, "none");
    assert.equal(result.scope, "codexgpt:read codexgpt:write codexgpt:execute");
    assert.equal(result.unknown_extension, undefined);

    const durable = foundation.store.readDeployment(initialized.state.bindingId, initialized.state.incarnationId);
    assert.equal(durable.clients.length, 1);
    assert.equal(durable.clients[0].clientId, result.client_id);
    assert.equal(JSON.stringify(durable).includes("secret"), false);
    assert.equal(foundation.events.at(-1).transition, "client_registered");
  } finally {
    foundation.cleanup();
  }
});

test("local client revocation frees durable DCR capacity without deleting evidence", async () => {
  const { foundation, initialized, clients } = await createClientStore();
  try {
    const parsed = foundation.auth.parseDynamicClientRegistration(JSON.stringify(registration()));
    const client = await clients.register(parsed);
    await clients.markApproved(client.client_id);
    assert.equal(await clients.revoke(client.client_id), true);
    assert.equal(await clients.getClient(client.client_id), undefined);
    assert.equal(await clients.revoke(client.client_id), false);
    const durable = foundation.store.readDeployment(initialized.state.bindingId, initialized.state.incarnationId);
    assert.equal(durable.clients[0].status, "revoked");
    assert.equal(foundation.events.at(-1).transition, "client_revoked");
  } finally {
    foundation.cleanup();
  }
});

test("DCR enforces exact approved and unapproved caps and local revocation frees capacity", async () => {
  const unapprovedFixture = await createClientStore();
  try {
    const parsed = unapprovedFixture.foundation.auth.parseDynamicClientRegistration(JSON.stringify(registration()));
    const clients = [];
    for (let index = 0; index < unapprovedFixture.foundation.auth.DCR_UNAPPROVED_LIMIT; index += 1) {
      clients.push(await unapprovedFixture.clients.register(parsed));
    }
    await assert.rejects(
      () => unapprovedFixture.clients.register(parsed),
      (error) => error.oauthCode === "temporarily_unavailable" && /oauth-clients/.test(error.localAction)
    );
    assert.equal(await unapprovedFixture.clients.revoke(clients[0].client_id), true);
    assert.match((await unapprovedFixture.clients.register(parsed)).client_id, /^client_/);
  } finally {
    unapprovedFixture.foundation.cleanup();
  }

  const approvedFixture = await createClientStore();
  try {
    const parsed = approvedFixture.foundation.auth.parseDynamicClientRegistration(JSON.stringify(registration()));
    const approved = [];
    for (let index = 0; index < approvedFixture.foundation.auth.DCR_APPROVED_LIMIT; index += 1) {
      const client = await approvedFixture.clients.register(parsed);
      await approvedFixture.clients.markApproved(client.client_id);
      approved.push(client);
    }
    const overflow = await approvedFixture.clients.register(parsed);
    await assert.rejects(
      () => approvedFixture.clients.markApproved(overflow.client_id),
      (error) => error.oauthCode === "temporarily_unavailable" && /oauth-clients/.test(error.localAction)
    );
    assert.equal(await approvedFixture.clients.revoke(approved[0].client_id), true);
    assert.equal((await approvedFixture.clients.markApproved(overflow.client_id)).status, "approved");
  } finally {
    approvedFixture.foundation.cleanup();
  }
});

test("DCR expires only unapproved clients and preserves approved clients", async () => {
  let now = Date.parse("2026-07-26T12:00:00.000Z");
  const { foundation, clients } = await createClientStore({ now: () => now });
  try {
    const parsed = foundation.auth.parseDynamicClientRegistration(JSON.stringify(registration()));
    const first = await clients.register(parsed);
    const second = await clients.register(parsed);
    await clients.markApproved(second.client_id);
    now += foundation.auth.DCR_UNAPPROVED_LIFETIME_MS + 1;
    assert.equal(await clients.getClient(first.client_id), undefined);
    assert.equal((await clients.getClient(second.client_id)).client_id, second.client_id);
    assert.equal(clients.listSafe().length, 1);
  } finally {
    foundation.cleanup();
  }
});

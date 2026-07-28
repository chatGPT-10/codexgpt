import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const auth = await tsImport("../src/auth/index.ts", import.meta.url);

function registrationBody(extra = "") {
  return `{"redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]${extra}}`;
}

test("DCR enforces exact byte, property, depth, and UTF-8 bounds", () => {
  const valid = auth.parseDynamicClientRegistration(registrationBody());
  assert.equal(valid.redirectUri, "https://chatgpt.com/connector_platform_oauth_redirect");

  assert.throws(() => auth.parseDynamicClientRegistration(Buffer.alloc(auth.DCR_BODY_MAX_BYTES + 1, 0x20)));
  assert.throws(() => auth.parseDynamicClientRegistration(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d])));

  const tooDeep = JSON.stringify({
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    extension: { a: { b: { c: { d: true } } } }
  });
  assert.throws(() => auth.parseDynamicClientRegistration(tooDeep));

  const properties = Object.fromEntries(Array.from({ length: auth.DCR_MAX_PROPERTIES }, (_, index) => [`x${index}`, index]));
  const tooMany = JSON.stringify({
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    ...properties
  });
  assert.throws(() => auth.parseDynamicClientRegistration(tooMany));
});

test("OAuth query/form parser rejects duplicate, malformed, oversized, and over-count inputs", () => {
  assert.deepEqual(auth.parseBoundedOAuthParameters("a=1&b=two"), { a: "1", b: "two" });
  assert.throws(() => auth.parseBoundedOAuthParameters("a=1&a=2"), (error) => error.oauthCode === "invalid_request");
  assert.throws(() => auth.parseBoundedOAuthParameters("a=%ZZ"));
  assert.throws(() => auth.parseBoundedOAuthParameters(`${"k".repeat(auth.OAUTH_QUERY_KEY_MAX_BYTES + 1)}=x`));
  assert.throws(() => auth.parseBoundedOAuthParameters(`a=${"x".repeat(auth.OAUTH_QUERY_VALUE_MAX_BYTES + 1)}`));
  assert.throws(() => auth.parseBoundedOAuthParameters(Array.from({ length: auth.OAUTH_QUERY_FORM_MAX_PARAMETERS + 1 }, (_, index) => `k${index}=v`).join("&")));
  assert.throws(() => auth.parseBoundedOAuthParameters(`a=${"x".repeat(auth.OAUTH_QUERY_FORM_MAX_BYTES)}`));
});

test("fixed-window limiter is bounded and resets exactly at the window boundary", () => {
  let now = 1000;
  const limiter = new auth.FixedWindowRateLimiter(
    { windowMs: 100, maximum: 2 },
    { now: () => now, maximumKeys: 2 }
  );
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, false);
  assert.equal(limiter.consume("b").allowed, true);
  assert.equal(limiter.consume("c").allowed, true);
  assert.ok(limiter.size() <= 2);
  now += 100;
  assert.equal(limiter.consume("a").allowed, true);
});

test("OAuth token endpoint diagnostics stay bounded and contain only fixed safe dimensions", () => {
  let now = Date.parse("2026-07-28T12:00:00.000Z");
  const diagnostics = new auth.OAuthTokenEndpointDiagnostics({ now: () => now });
  diagnostics.record({ grantType: "authorization_code", status: 200, reason: "success" });
  now += 12_500;
  diagnostics.record({ grantType: "refresh_token", status: 200, reason: "success" });
  diagnostics.record({ grantType: "refresh_token", status: 429, reason: "token_client_limit" });

  assert.deepEqual(diagnostics.snapshot(), {
    startedAt: "2026-07-28T12:00:00.000Z",
    totalRequests: 3,
    entries: [
      {
        endpoint: "/token",
        grantType: "authorization_code",
        status: 200,
        reason: "success",
        count: 1,
        firstSeenAt: "2026-07-28T12:00:00.000Z",
        lastSeenAt: "2026-07-28T12:00:00.000Z"
      },
      {
        endpoint: "/token",
        grantType: "refresh_token",
        status: 200,
        reason: "success",
        count: 1,
        firstSeenAt: "2026-07-28T12:00:12.500Z",
        lastSeenAt: "2026-07-28T12:00:12.500Z"
      },
      {
        endpoint: "/token",
        grantType: "refresh_token",
        status: 429,
        reason: "token_client_limit",
        count: 1,
        firstSeenAt: "2026-07-28T12:00:12.500Z",
        lastSeenAt: "2026-07-28T12:00:12.500Z"
      }
    ]
  });
  const serialized = JSON.stringify(diagnostics.snapshot());
  for (const forbidden of [
    "clientId",
    "familyHandle",
    "refreshToken",
    "accessToken",
    "client_AAAAA",
    "family_deadbeef",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  const grantTypes = ["authorization_code", "refresh_token", "unknown"];
  const statuses = [200, 400, 429, 503];
  const reasons = [
    "success",
    "token_deployment_limit",
    "token_client_limit",
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "invalid_scope",
    "invalid_target",
    "temporarily_unavailable"
  ];
  for (const grantType of grantTypes) {
    for (const status of statuses) {
      for (const reason of reasons) diagnostics.record({ grantType, status, reason });
    }
  }
  assert.ok(diagnostics.snapshot().entries.length <= 32);
  assert.equal(diagnostics.snapshot().totalRequests, 111);
});

test("all frozen OAuth Core limits remain exact", () => {
  assert.equal(auth.DCR_BODY_MAX_BYTES, 16 * 1024);
  assert.equal(auth.DCR_MAX_PROPERTIES, 32);
  assert.equal(auth.DCR_MAX_DEPTH, 4);
  assert.equal(auth.DCR_APPROVED_LIMIT, 16);
  assert.equal(auth.DCR_UNAPPROVED_LIMIT, 32);
  assert.equal(auth.DCR_UNAPPROVED_LIFETIME_MS, 24 * 60 * 60 * 1000);
  assert.equal(auth.OAUTH_PENDING_DEPLOYMENT_LIMIT, 32);
  assert.equal(auth.OAUTH_PENDING_CLIENT_LIMIT, 4);
  assert.equal(auth.OAUTH_PENDING_LIFETIME_MS, 5 * 60 * 1000);
  assert.equal(auth.OAUTH_TERMINAL_LIFETIME_MS, 60 * 1000);
  assert.equal(auth.OAUTH_CODE_LIFETIME_MS, 60 * 1000);
  assert.equal(auth.OAUTH_QUERY_FORM_MAX_BYTES, 8 * 1024);
  assert.equal(auth.OAUTH_QUERY_FORM_MAX_PARAMETERS, 24);
  assert.deepEqual(auth.CORE_OAUTH_RATE_LIMITS.tokenClient, {
    windowMs: 15 * 60 * 1000,
    maximum: 120
  });
  assert.deepEqual(auth.CORE_OAUTH_RATE_LIMITS.tokenDeployment, {
    windowMs: 15 * 60 * 1000,
    maximum: 240
  });
});

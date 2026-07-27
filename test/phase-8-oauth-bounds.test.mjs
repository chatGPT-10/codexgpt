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
});

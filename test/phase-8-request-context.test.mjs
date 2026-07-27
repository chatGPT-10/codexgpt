import assert from "node:assert/strict";
import test from "node:test";
import {
  createOAuthRequestContext,
  currentOAuthRequestContext,
  maybeOAuthRequestContext,
  runWithOAuthRequestContext
} from "../dist/auth/requestContext.js";

function verified(label) {
  return {
    authInfo: { token: `secret-${label}`, clientId: `client-${label}`, scopes: ["codexgpt:read"] },
    ownerSubject: `subject-${label}`,
    ownerRef: `ownerref_${label.repeat(32).slice(0, 32)}`,
    clientId: `client_${label.repeat(43).slice(0, 43)}`,
    clientRef: `clientref_${label.repeat(32).slice(0, 32)}`,
    resource: "https://mcp.example.com/mcp",
    bindingId: `binding_${label.repeat(32).slice(0, 32)}`,
    incarnationId: `incarnation_${label.repeat(32).slice(0, 32)}`,
    grantId: `grant_${label.repeat(32).slice(0, 32)}`,
    grantRevision: 0,
    scopes: ["codexgpt:read"],
    tokenId: `token_${label.repeat(43).slice(0, 43)}`,
    expiresAt: 2_000_000_000,
    fingerprint: label.repeat(64).slice(0, 64)
  };
}

test("OAuth request context is explicit, immutable, and unavailable outside its request", async () => {
  assert.equal(maybeOAuthRequestContext(), undefined);
  assert.throws(() => currentOAuthRequestContext(), /unavailable/);
  const context = createOAuthRequestContext(verified("a"));
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.scopes), true);
  assert.equal(JSON.stringify(context).includes("secret-a"), false);

  await runWithOAuthRequestContext(context, async () => {
    assert.equal(currentOAuthRequestContext(), context);
    await Promise.resolve();
    assert.equal(currentOAuthRequestContext().clientId, context.clientId);
  });
  assert.equal(maybeOAuthRequestContext(), undefined);
});

test("concurrent OAuth request contexts do not bleed across asynchronous work", async () => {
  const first = createOAuthRequestContext(verified("b"));
  const second = createOAuthRequestContext(verified("c"));
  const seen = await Promise.all([
    runWithOAuthRequestContext(first, async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const before = currentOAuthRequestContext();
      await new Promise((resolve) => setTimeout(resolve, 15));
      const after = currentOAuthRequestContext();
      return [before.clientRef, after.grantId];
    }),
    runWithOAuthRequestContext(second, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const before = currentOAuthRequestContext();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const after = currentOAuthRequestContext();
      return [before.clientRef, after.grantId];
    })
  ]);
  assert.deepEqual(seen, [
    [first.clientRef, first.grantId],
    [second.clientRef, second.grantId]
  ]);
  assert.equal(maybeOAuthRequestContext(), undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  AUTHORIZATION_SERVER_METADATA_PATH,
  PROTECTED_RESOURCE_METADATA_COMPATIBILITY_PATH,
  PROTECTED_RESOURCE_METADATA_PATH,
  PUBLIC_OAUTH_ENDPOINTS,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  metadataResponse,
  oauthCorsHeaders
} = await tsImport("../src/auth/metadata.ts", import.meta.url);
const { createOAuthDeploymentIdentity } = await tsImport("../src/auth/schemas.ts", import.meta.url);

function identity() {
  return createOAuthDeploymentIdentity({
    issuer: "https://mcp.example.com",
    resource: "https://mcp.example.com/mcp",
    hostname: "mcp.example.com",
    profileId: "a".repeat(24),
    bindingId: "binding_A234567890abcdef",
    incarnationId: "incarnation_A234567890abcdef",
    recoveryEpoch: "epoch_A234567890abcdef"
  });
}

const variants = [
  ["codexgpt:read"],
  ["codexgpt:read", "codexgpt:write"],
  ["codexgpt:read", "codexgpt:write", "codexgpt:execute"]
];

test("metadata paths and public endpoint inventory are exact", () => {
  assert.equal(PROTECTED_RESOURCE_METADATA_PATH, "/.well-known/oauth-protected-resource/mcp");
  assert.equal(PROTECTED_RESOURCE_METADATA_COMPATIBILITY_PATH, "/.well-known/oauth-protected-resource");
  assert.equal(AUTHORIZATION_SERVER_METADATA_PATH, "/.well-known/oauth-authorization-server");
  assert.deepEqual(PUBLIC_OAUTH_ENDPOINTS, [
    "/",
    "/authorize",
    "/authorize/status/*",
    "/authorize/continue/*",
    "/token",
    "/register",
    "/revoke",
    "/jwks",
    "/healthz",
    "/mcp"
  ]);
  assert.ok(Object.isFrozen(PUBLIC_OAUTH_ENDPOINTS));
});

for (const scopes of variants) {
  test(`protected-resource metadata is exact for ${scopes.join(" ")}`, () => {
    const document = buildProtectedResourceMetadata(identity(), scopes);
    assert.deepEqual(document, {
      resource: "https://mcp.example.com/mcp",
      authorization_servers: ["https://mcp.example.com"],
      scopes_supported: scopes,
      bearer_methods_supported: ["header"],
      resource_documentation: "https://mcp.example.com/"
    });
    assert.ok(Object.isFrozen(document));
    assert.ok(Object.isFrozen(document.scopes_supported));
  });

  test(`authorization-server metadata is exact for ${scopes.join(" ")}`, () => {
    const document = buildAuthorizationServerMetadata(identity(), scopes);
    assert.deepEqual(document, {
      issuer: "https://mcp.example.com",
      authorization_endpoint: "https://mcp.example.com/authorize",
      token_endpoint: "https://mcp.example.com/token",
      registration_endpoint: "https://mcp.example.com/register",
      revocation_endpoint: "https://mcp.example.com/revoke",
      jwks_uri: "https://mcp.example.com/jwks",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: scopes
    });
    for (const unsupported of [
      "client_id_metadata_document_supported",
      "id_token_signing_alg_values_supported",
      "subject_types_supported",
      "userinfo_endpoint",
      "introspection_endpoint"
    ]) {
      assert.equal(Object.hasOwn(document, unsupported), false, unsupported);
    }
    assert.equal(document.response_types_supported.includes("token"), false);
    assert.equal(document.token_endpoint_auth_methods_supported.includes("client_secret_post"), false);
  });
}

test("both metadata documents publish the same exact ordered scope object", () => {
  const scopes = Object.freeze(["codexgpt:read", "codexgpt:write"]);
  const protectedDocument = buildProtectedResourceMetadata(identity(), scopes);
  const authorizationDocument = buildAuthorizationServerMetadata(identity(), scopes);
  assert.strictEqual(protectedDocument.scopes_supported, scopes);
  assert.strictEqual(authorizationDocument.scopes_supported, scopes);
});

test("metadata response uses exact JSON, cache, security, and credential-free CORS headers", () => {
  const document = buildProtectedResourceMetadata(identity(), ["codexgpt:read"]);
  const response = metadataResponse(document);
  assert.equal(response.body, JSON.stringify(document));
  assert.deepEqual(response.headers, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*"
  });
  assert.equal(Object.hasOwn(response.headers, "Access-Control-Allow-Credentials"), false);
  assert.ok(Object.isFrozen(response.headers));
});

test("open CORS is limited to reviewed metadata and machine endpoints", () => {
  assert.deepEqual(oauthCorsHeaders("metadata"), { "Access-Control-Allow-Origin": "*" });
  assert.deepEqual(oauthCorsHeaders("machine"), { "Access-Control-Allow-Origin": "*" });
  for (const kind of ["authorization", "mcp", "local-admin"]) {
    assert.deepEqual(oauthCorsHeaders(kind), {}, kind);
  }
});

test("metadata builders reject unordered, duplicate, or unknown scopes and identity drift", () => {
  assert.throws(() => buildProtectedResourceMetadata(identity(), ["codexgpt:write", "codexgpt:read"]));
  assert.throws(() => buildProtectedResourceMetadata(identity(), ["codexgpt:read", "codexgpt:read"]));
  assert.throws(() => buildProtectedResourceMetadata(identity(), ["openid"]));
  assert.throws(() => createOAuthDeploymentIdentity({
    ...identity(),
    resource: "https://other.example.com/mcp"
  }));
});

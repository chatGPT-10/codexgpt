import { assertEnabledOAuthScopes, createOAuthDeploymentIdentity } from "./schemas.js";
import type { OAuthDeploymentIdentity, OAuthScope } from "./types.js";

export const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
export const PROTECTED_RESOURCE_METADATA_COMPATIBILITY_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

export const PUBLIC_OAUTH_ENDPOINTS = Object.freeze([
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
] as const);

export type OAuthCorsKind = "metadata" | "machine" | "authorization" | "mcp" | "local-admin";

const OPEN_MACHINE_CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*"
});
const NO_CORS_HEADERS = Object.freeze({});
const METADATA_HEADERS = Object.freeze({
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*"
});

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: readonly string[];
  scopes_supported: readonly OAuthScope[];
  bearer_methods_supported: readonly ["header"];
  resource_documentation: string;
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  response_types_supported: readonly ["code"];
  grant_types_supported: readonly ["authorization_code", "refresh_token"];
  code_challenge_methods_supported: readonly ["S256"];
  authorization_response_iss_parameter_supported: true;
  token_endpoint_auth_methods_supported: readonly ["none"];
  revocation_endpoint_auth_methods_supported: readonly ["none"];
  scopes_supported: readonly OAuthScope[];
}

function validatedIdentity(input: OAuthDeploymentIdentity): Readonly<OAuthDeploymentIdentity> {
  return createOAuthDeploymentIdentity(input);
}

export function buildProtectedResourceMetadata(
  identityInput: OAuthDeploymentIdentity,
  enabledScopesInput: readonly string[]
): Readonly<ProtectedResourceMetadata> {
  const identity = validatedIdentity(identityInput);
  const enabledScopes = assertEnabledOAuthScopes(enabledScopesInput);
  return Object.freeze({
    resource: identity.resource,
    authorization_servers: Object.freeze([identity.issuer]),
    scopes_supported: enabledScopes,
    bearer_methods_supported: Object.freeze(["header"] as const),
    resource_documentation: `${identity.issuer}/`
  });
}

export function buildAuthorizationServerMetadata(
  identityInput: OAuthDeploymentIdentity,
  enabledScopesInput: readonly string[]
): Readonly<AuthorizationServerMetadata> {
  const identity = validatedIdentity(identityInput);
  const enabledScopes = assertEnabledOAuthScopes(enabledScopesInput);
  return Object.freeze({
    issuer: identity.issuer,
    authorization_endpoint: `${identity.issuer}/authorize`,
    token_endpoint: `${identity.issuer}/token`,
    registration_endpoint: `${identity.issuer}/register`,
    revocation_endpoint: `${identity.issuer}/revoke`,
    jwks_uri: `${identity.issuer}/jwks`,
    response_types_supported: Object.freeze(["code"] as const),
    grant_types_supported: Object.freeze(["authorization_code", "refresh_token"] as const),
    code_challenge_methods_supported: Object.freeze(["S256"] as const),
    authorization_response_iss_parameter_supported: true,
    token_endpoint_auth_methods_supported: Object.freeze(["none"] as const),
    revocation_endpoint_auth_methods_supported: Object.freeze(["none"] as const),
    scopes_supported: enabledScopes
  });
}

export function oauthCorsHeaders(kind: OAuthCorsKind): Readonly<Record<string, string>> {
  return kind === "metadata" || kind === "machine" ? OPEN_MACHINE_CORS_HEADERS : NO_CORS_HEADERS;
}

export function metadataResponse<T extends object>(document: T): Readonly<{
  body: string;
  headers: Readonly<Record<string, string>>;
}> {
  return Object.freeze({
    body: JSON.stringify(document),
    headers: METADATA_HEADERS
  });
}

import type { OAuthDeploymentIdentity, OAuthScope } from "./types.js";

export type BearerChallengeKind = "missing" | "invalid_token" | "insufficient_scope";

function quoted(value: string): string {
  if (/[^\x20-\x21\x23-\x5b\x5d-\x7e]/.test(value)) {
    throw new Error("OAuth challenge value is unsafe.");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function protectedResourceMetadataUrl(identity: OAuthDeploymentIdentity): string {
  return `${identity.issuer}/.well-known/oauth-protected-resource/mcp`;
}

export function buildBearerChallenge(input: {
  identity: OAuthDeploymentIdentity;
  scopes: readonly OAuthScope[];
  kind: BearerChallengeKind;
}): string {
  const values = [
    `resource_metadata=${quoted(protectedResourceMetadataUrl(input.identity))}`
  ];
  if (input.kind === "invalid_token") {
    values.push('error="invalid_token"');
    values.push('error_description="Reconnect because this access token is invalid or expired"');
  } else if (input.kind === "insufficient_scope") {
    values.push('error="insufficient_scope"');
    values.push('error_description="Reconnect to allow this capability"');
  }
  values.push(`scope=${quoted(input.scopes.join(" "))}`);
  return `Bearer ${values.join(", ")}`;
}

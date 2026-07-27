import { createHash } from "node:crypto";
import type { CodexGPTConfig } from "../config.js";
import type { PolicySessionContextSource } from "../policy/identity.js";
import { semanticDigest } from "../policy/authorizationFacts.js";
import { oauthRequestIdentityV2Schema } from "../policy/schemas.js";
import {
  POLICY_SCOPES_V4,
  type OAuthRequestIdentityV2,
  type PolicyScopeV4,
  type RequestIdentity
} from "../policy/types.js";
import { currentOAuthRequestContext, type OAuthRequestContext } from "./requestContext.js";
import { KNOWN_OAUTH_SCOPES, type OAuthScope } from "./types.js";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32Lower(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function orderedPolicyScopes(scopes: ReadonlySet<PolicyScopeV4>): PolicyScopeV4[] {
  return POLICY_SCOPES_V4.filter((scope) => scopes.has(scope));
}

export function knownOAuthScopes(): readonly OAuthScope[] {
  return KNOWN_OAUTH_SCOPES;
}

export function oauthScopesForDeployment(config: CodexGPTConfig): readonly OAuthScope[] {
  const scopes: OAuthScope[] = ["codexgpt:read"];
  if (config.writeMode !== "off" || config.gitMode === "local") scopes.push("codexgpt:write");
  if (config.bashMode !== "off" || config.executionProfile !== "off") scopes.push("codexgpt:execute");
  return Object.freeze(scopes);
}

export function internalScopesForOAuth(scopes: readonly OAuthScope[]): readonly PolicyScopeV4[] {
  const mapped = new Set<PolicyScopeV4>();
  if (scopes.includes("codexgpt:read")) {
    mapped.add("workspace:open");
    mapped.add("filesystem:read");
    mapped.add("git:read");
    mapped.add("audit:read");
  }
  if (scopes.includes("codexgpt:write")) {
    mapped.add("filesystem:write");
    mapped.add("git:write");
    mapped.add("git:index:write");
    mapped.add("git:refs:write");
    mapped.add("git:commit");
    mapped.add("git:merge");
    mapped.add("worktree:manage");
  }
  if (scopes.includes("codexgpt:execute")) {
    mapped.add("shell:verify");
    mapped.add("shell:execute");
    mapped.add("process:manage");
    mapped.add("process:persistent");
    mapped.add("network:connect");
    mapped.add("workspace:full-access");
    mapped.add("host:full-access");
  }
  return Object.freeze(orderedPolicyScopes(mapped));
}

export function deploymentPolicyScopes(config: CodexGPTConfig): readonly PolicyScopeV4[] {
  const scopes = new Set<PolicyScopeV4>([
    "workspace:open",
    "filesystem:read",
    "git:read",
    "audit:read"
  ]);
  if (config.writeMode !== "off") scopes.add("filesystem:write");
  if (config.gitMode === "local") {
    scopes.add("git:write");
    scopes.add("git:index:write");
    scopes.add("git:refs:write");
    scopes.add("git:commit");
    scopes.add("git:merge");
    scopes.add("worktree:manage");
  }
  if (config.bashMode === "safe" || config.bashMode === "full") scopes.add("shell:verify");
  if (config.bashMode === "full") scopes.add("shell:execute");
  if (config.executionProfile !== "off") {
    scopes.add("shell:execute");
    scopes.add("process:manage");
    scopes.add("process:persistent");
  }
  if (config.executionProfile === "full_access") {
    scopes.add("workspace:full-access");
    scopes.add("host:full-access");
    scopes.add("network:connect");
  }
  return Object.freeze(orderedPolicyScopes(scopes));
}

export function effectivePolicyScopes(
  config: CodexGPTConfig,
  identity: RequestIdentity
): readonly PolicyScopeV4[] {
  const deployment = new Set(deploymentPolicyScopes(config));
  const requested = new Set<PolicyScopeV4>(identity.scopes as PolicyScopeV4[]);
  if (!(identity.schemaVersion === 2 && identity.kind === "oauth_subject")) {
    if (config.toolContractVersion >= 3 && config.executionProfile !== "off") {
      requested.add("shell:execute");
      requested.add("process:manage");
      requested.add("process:persistent");
    }
    if (config.toolContractVersion >= 3 && config.executionProfile === "full_access") {
      requested.add("workspace:full-access");
      requested.add("host:full-access");
      requested.add("network:connect");
    }
    if (config.toolContractVersion >= 4 && config.gitMode === "local") {
      requested.add("git:index:write");
      requested.add("git:refs:write");
      requested.add("git:commit");
      requested.add("git:merge");
      requested.add("worktree:manage");
    }
  }
  return Object.freeze(POLICY_SCOPES_V4.filter((scope) => deployment.has(scope) && requested.has(scope)));
}

export function ownerIdForOAuthSubject(subject: string): string {
  const digest = createHash("sha256")
    .update("codexgpt/oauth-owner/v1\0", "utf8")
    .update(subject, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `owner_${digest}`;
}

function oauthCredentialRef(grantId: string): string {
  const digest = createHash("sha256")
    .update("codexgpt/oauth-grant/v1\0", "utf8")
    .update(grantId, "utf8")
    .digest();
  return `cred_${base32Lower(digest).slice(0, 26)}`;
}

export function createOAuthPolicyIdentity(
  context: Readonly<OAuthRequestContext>
): Readonly<OAuthRequestIdentityV2> {
  return Object.freeze(oauthRequestIdentityV2Schema.parse({
    schemaVersion: 2,
    kind: "oauth_subject",
    authenticationMode: "oauth2",
    credentialRef: oauthCredentialRef(context.grantId),
    credentialRevision: `oauth_grant_revision_${context.grantRevision}`,
    subject: context.ownerSubject,
    ownerId: ownerIdForOAuthSubject(context.ownerSubject),
    tokenId: context.tokenId,
    clientRef: context.clientRef,
    scopes: internalScopesForOAuth(context.scopes),
    assuranceLevel: "strong"
  }));
}

export function createOAuthPolicySessionSource(input: {
  transportSessionId: () => string;
}): PolicySessionContextSource {
  const currentIdentity = (): RequestIdentity => createOAuthPolicyIdentity(currentOAuthRequestContext());
  return Object.freeze({
    transportKind: "streamable_http" as const,
    transportSessionId: input.transportSessionId,
    get identity() {
      return currentIdentity();
    },
    currentIdentity
  });
}

export function ownerIdForPolicyIdentity(identity: RequestIdentity): string {
  if (identity.schemaVersion === 2 && identity.kind === "oauth_subject") return identity.ownerId;
  const legacySeed = `${identity.kind}\0${identity.subject ?? ""}\0${identity.credentialRef ?? ""}`;
  return `owner_${createHash("sha256").update(legacySeed).digest("hex").slice(0, 32)}`;
}

export function policyIdentityOwnershipFacts(identity: RequestIdentity): RequestIdentity | Readonly<{
  schemaVersion: 2;
  kind: "oauth_subject";
  ownerId: string;
}> {
  if (!(identity.schemaVersion === 2 && identity.kind === "oauth_subject")) return identity;
  return Object.freeze({
    schemaVersion: 2 as const,
    kind: "oauth_subject" as const,
    ownerId: identity.ownerId
  });
}

export function credentialRevisionForCredentialRef(credentialRef: string | null): string {
  if (!credentialRef) return "credential-none";
  return semanticDigest({ credentialRef });
}

export function credentialRevisionForIdentity(identity: RequestIdentity): string {
  if (identity.schemaVersion === 2 && identity.kind === "oauth_subject") return identity.credentialRevision;
  return credentialRevisionForCredentialRef(identity.credentialRef);
}

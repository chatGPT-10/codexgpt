import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthServerProvider,
  OAuthTokenVerifier
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export type HttpAuthMode = "legacy" | "oauth";
export type AuthModeSource = "current-process" | "persisted-user" | "profile" | "default";
export type OAuthScope = "codexgpt:read" | "codexgpt:write" | "codexgpt:execute";
export type OAuthCredentialProvider = "windows-dpapi-current-user";

export const KNOWN_OAUTH_SCOPES = Object.freeze([
  "codexgpt:read",
  "codexgpt:write",
  "codexgpt:execute"
] as const);

export interface ResolvedHttpAuthMode {
  mode: HttpAuthMode;
  source: AuthModeSource;
}

export interface OAuthDeploymentIdentity {
  issuer: string;
  resource: string;
  hostname: string;
  profileId: string;
  bindingId: string;
  incarnationId: string;
  recoveryEpoch: string;
}

export interface OAuthListenerConfig {
  publicHost: "127.0.0.1";
  publicPort: number;
  localAdminHost: "127.0.0.1";
  localAdminPort: number;
}

export interface OAuthDeploymentConfiguration {
  canonicalRoot: string;
  profileId: string;
  hostname: string;
  issuer: string;
  resource: string;
  identityKey: string;
  tunnel: "cloudflare-named";
  tunnelName: string;
  tunnelOwner: "codexgpt";
  listeners: OAuthListenerConfig;
}

export interface OAuthCapabilitySelection {
  writeEnabled?: boolean;
  executeEnabled?: boolean;
}

export type SdkOAuthServerProvider = OAuthServerProvider;
export type SdkOAuthTokenVerifier = OAuthTokenVerifier;
export type SdkOAuthRegisteredClientsStore = OAuthRegisteredClientsStore;
export type SdkOAuthClientInformation = OAuthClientInformationFull;

export type LookupOAuthClient = (
  clientId: string
) => OAuthClientInformationFull | undefined | Promise<OAuthClientInformationFull | undefined>;

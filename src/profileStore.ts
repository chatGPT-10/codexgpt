import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  BashMode,
  BashTranscriptMode,
  CodexSessionsMode,
  PolicyEngineMode,
  SemanticProviderSelection,
  ToolMode,
  WriteMode
} from "./config.js";
import { normalizeOAuthHostname } from "./auth/configuration.js";
import { authConfigurationError } from "./auth/errors.js";
import type { HttpAuthMode, OAuthCredentialProvider } from "./auth/types.js";

export type TunnelMode = "none" | "cloudflare" | "cloudflare-named" | "ngrok" | "tailscale";
export type ConnectorMode = "agent" | "handoff" | "pro";

export interface WorkspaceAuthRoute {
  port?: string;
  tunnel?: TunnelMode | string;
  hostname?: string;
  tunnelName?: string;
  tunnelOwner?: "codexgpt" | string;
  localAdminPort?: string;
  ngrokConfig?: string;
  cloudflareConfig?: string;
  cloudflareTokenFile?: string;
  noInstallCloudflared?: boolean;
}

export interface WorkspaceAuthRoutes {
  legacy?: WorkspaceAuthRoute;
  oauth?: WorkspaceAuthRoute;
}

export interface WorkspaceProfile {
  version?: number;
  root?: string;
  updatedAt?: string;
  profilePath?: string;
  port?: string;
  mode?: ConnectorMode | string;
  tunnel?: TunnelMode | string;
  hostname?: string;
  tunnelName?: string;
  tunnelOwner?: "codexgpt" | string;
  localAdminPort?: string;
  authMode?: HttpAuthMode | string;
  authRoutes?: WorkspaceAuthRoutes;
  oauthIssuer?: string;
  oauthResource?: string;
  oauthCredentialProvider?: OAuthCredentialProvider | string;
  oauthStateRef?: string;
  ngrokConfig?: string;
  cloudflareConfig?: string;
  cloudflareTokenFile?: string;
  cloudflareToken?: string;
  token?: string;
  bash?: BashMode | string;
  bashTranscript?: BashTranscriptMode | string;
  codexSessions?: CodexSessionsMode | string;
  codexDir?: string;
  bashSession?: string;
  requireBashSession?: boolean;
  write?: WriteMode | string;
  toolMode?: ToolMode | string;
  toolCards?: boolean;
  policyEngine?: PolicyEngineMode | string;
  permissionProfile?: string;
  semanticProvider?: SemanticProviderSelection | string;
  widgetDomain?: string;
  noInstallCloudflared?: boolean;
}

export interface RuntimeConnection {
  version?: number;
  root?: string;
  updatedAt?: string;
  endpoint?: string;
  localBase?: string;
  localStatusUrl?: string;
  tunnel?: TunnelMode | string;
  mode?: ConnectorMode | string;
  bash?: BashMode | string;
  bashTranscript?: BashTranscriptMode | string;
  codexSessions?: CodexSessionsMode | string;
  bashSession?: string;
  requireBashSession?: boolean;
  write?: WriteMode | string;
  toolMode?: ToolMode | string;
  toolCards?: boolean;
  policyEngine?: PolicyEngineMode | string;
  permissionProfile?: string;
  semanticProvider?: SemanticProviderSelection | string;
}

// Runtime connection records keep only safe policy selectors, never policy bodies or credentials.

function expandProfileHome(input: string): string {
  if (!input || input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function CodexGPTHome(): string {
  const customHome = process.env.CODEXGPT_HOME;
  return customHome ? path.resolve(expandProfileHome(customHome)) : path.join(os.homedir(), ".codexgpt");
}

export function profileDir(): string {
  return path.join(CodexGPTHome(), "profiles");
}

export function profileIdForRoot(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 24);
}

export function profilePathForRoot(root: string): string {
  return path.join(profileDir(), `${profileIdForRoot(root)}.json`);
}

export function runtimeDir(): string {
  return path.join(CodexGPTHome(), "runtime");
}

export function runtimeStatusPathForRoot(root: string): string {
  return path.join(runtimeDir(), `${profileIdForRoot(root)}.json`);
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export function readWorkspaceProfile(root: string): WorkspaceProfile {
  const profilePath = profilePathForRoot(root);
  if (!fs.existsSync(profilePath)) return {};
  const profile = readJsonFile(profilePath);
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  const typed = profile as WorkspaceProfile;
  if (typed.root && typed.root !== root) return {};
  validateWorkspaceProfileAuthSelectors(typed);
  return { ...typed, profilePath };
}

const WORKSPACE_AUTH_ROUTE_FIELDS = [
  "port",
  "tunnel",
  "hostname",
  "tunnelName",
  "tunnelOwner",
  "localAdminPort",
  "ngrokConfig",
  "cloudflareConfig",
  "cloudflareTokenFile",
  "noInstallCloudflared"
] as const;

const REVIEWED_OAUTH_PROFILE_FIELDS = new Set([
  "oauthIssuer",
  "oauthResource",
  "oauthCredentialProvider",
  "oauthStateRef"
]);

export function workspaceAuthRouteFromProfile(profile: WorkspaceProfile): WorkspaceAuthRoute {
  const route: WorkspaceAuthRoute = {};
  for (const key of WORKSPACE_AUTH_ROUTE_FIELDS) {
    const value = profile[key];
    if (value !== undefined) (route as Record<string, unknown>)[key] = value;
  }
  return route;
}

export function applyWorkspaceAuthRoute(profile: WorkspaceProfile, route: WorkspaceAuthRoute): WorkspaceProfile {
  const next: WorkspaceProfile = { ...profile };
  for (const key of WORKSPACE_AUTH_ROUTE_FIELDS) delete next[key];
  return { ...next, ...route };
}

function validateWorkspaceAuthRoute(route: WorkspaceAuthRoute, mode: HttpAuthMode): void {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", `Workspace ${mode} auth route must be one object.`);
  }
  for (const key of Object.keys(route)) {
    if (!WORKSPACE_AUTH_ROUTE_FIELDS.includes(key as typeof WORKSPACE_AUTH_ROUTE_FIELDS[number])) {
      throw authConfigurationError("OAUTH_PROFILE_FIELD_FORBIDDEN", `Workspace auth routes cannot persist field ${key}.`);
    }
  }
  if (route.tunnel !== undefined && !["none", "cloudflare", "cloudflare-named", "ngrok", "tailscale"].includes(route.tunnel)) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", `Workspace ${mode} auth route has an invalid tunnel mode.`);
  }
  for (const [field, value] of [["port", route.port], ["localAdminPort", route.localAdminPort]] as const) {
    if (value === undefined) continue;
    const parsed = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", `Workspace ${mode} auth route ${field} must be an integer from 1 to 65535.`);
    }
  }
  if (route.tunnelOwner !== undefined && route.tunnelOwner !== "codexgpt") {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", `Workspace ${mode} auth route tunnel owner must be codexgpt.`);
  }
  if (route.hostname !== undefined) normalizeOAuthHostname(route.hostname);
  if (mode === "oauth" && (
    route.tunnel !== "cloudflare-named" ||
    route.tunnelOwner !== "codexgpt" ||
    !route.hostname ||
    !route.tunnelName ||
    !route.port ||
    !route.localAdminPort
  )) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "Saved OAuth auth route is incomplete.");
  }
}

function validateWorkspaceProfileAuthSelectors(profile: WorkspaceProfile): void {
  for (const key of Object.keys(profile)) {
    if (key.startsWith("oauth") && !REVIEWED_OAUTH_PROFILE_FIELDS.has(key)) {
      throw authConfigurationError(
        "OAUTH_PROFILE_FIELD_FORBIDDEN",
        `Workspace profiles cannot persist OAuth field ${key}.`
      );
    }
  }
  if (profile.authRoutes !== undefined) {
    if (!profile.authRoutes || typeof profile.authRoutes !== "object" || Array.isArray(profile.authRoutes)) {
      throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "Workspace authRoutes must be one object.");
    }
    for (const key of Object.keys(profile.authRoutes)) {
      if (key !== "legacy" && key !== "oauth") {
        throw authConfigurationError("OAUTH_PROFILE_FIELD_FORBIDDEN", `Workspace authRoutes cannot persist mode ${key}.`);
      }
    }
    if (profile.authRoutes.legacy) validateWorkspaceAuthRoute(profile.authRoutes.legacy, "legacy");
    if (profile.authRoutes.oauth) validateWorkspaceAuthRoute(profile.authRoutes.oauth, "oauth");
  }
  if (profile.authMode !== undefined && profile.authMode !== "legacy" && profile.authMode !== "oauth") {
    throw authConfigurationError("AUTH_MODE_INVALID", "Workspace profile authMode must be exactly legacy or oauth.");
  }
  if (profile.tunnelOwner !== undefined && profile.tunnelOwner !== "codexgpt") {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth tunnel owner marker must be codexgpt.");
  }
  if (profile.localAdminPort !== undefined) {
    const parsed = Number(profile.localAdminPort);
    if (!/^\d+$/.test(profile.localAdminPort) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth local-admin port must be an integer from 1 to 65535.");
    }
  }
  if (profile.oauthCredentialProvider !== undefined && profile.oauthCredentialProvider !== "windows-dpapi-current-user") {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth credential provider is unsupported.");
  }
  if (profile.oauthStateRef !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{15,159}$/.test(profile.oauthStateRef)) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth state reference must be one bounded opaque local reference.");
  }
  const hasOAuthUrl = profile.oauthIssuer !== undefined || profile.oauthResource !== undefined;
  if (hasOAuthUrl) {
    const oauthHostname = profile.authRoutes?.oauth?.hostname ?? profile.hostname;
    if (!profile.oauthIssuer || !profile.oauthResource || !oauthHostname) {
      throw authConfigurationError(
        "OAUTH_DEPLOYMENT_INVALID",
        "OAuth issuer, resource, and hostname must be persisted together."
      );
    }
    const hostname = normalizeOAuthHostname(oauthHostname);
    const expectedIssuer = `https://${hostname}`;
    const expectedResource = `${expectedIssuer}/mcp`;
    if (profile.oauthIssuer !== expectedIssuer || profile.oauthResource !== expectedResource) {
      throw authConfigurationError(
        "OAUTH_DEPLOYMENT_INVALID",
        "OAuth issuer and resource must derive exactly from the saved hostname."
      );
    }
  }
  if (profile.authMode === "oauth") {
    if (
      profile.tunnel !== "cloudflare-named" ||
      profile.tunnelOwner !== "codexgpt" ||
      !profile.tunnelName ||
      !profile.localAdminPort ||
      profile.oauthCredentialProvider !== "windows-dpapi-current-user" ||
      !profile.oauthStateRef ||
      !profile.oauthIssuer ||
      !profile.oauthResource
    ) {
      throw authConfigurationError(
        "OAUTH_DEPLOYMENT_INVALID",
        "OAuth profiles must contain the complete reviewed safe selector set."
      );
    }
  }
}

export function saveWorkspaceProfile(root: string, profile: WorkspaceProfile): string {
  validateWorkspaceProfileAuthSelectors(profile);
  const dir = profileDir();
  const filePath = profilePathForRoot(root);
  const { profilePath: _profilePath, ...rest } = profile;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const payload: WorkspaceProfile = {
    version: 2,
    updatedAt: new Date().toISOString(),
    ...rest,
    root
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort permission repair for filesystems that support chmod.
  }
  return filePath;
}

export function sanitizeWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  if (!profile || !Object.keys(profile).length) return {};
  const { token, cloudflareToken, ...rest } = profile;
  return {
    ...rest,
    ...(token ? { token: "<saved>" } : {}),
    ...(cloudflareToken ? { cloudflareToken: "<saved>" } : {})
  };
}

export function readRuntimeConnection(root: string): RuntimeConnection {
  const runtimePath = runtimeStatusPathForRoot(root);
  if (!fs.existsSync(runtimePath)) return {};
  const runtime = readJsonFile(runtimePath);
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) return {};
  const typed = runtime as RuntimeConnection;
  if (typed.root && typed.root !== root) return {};
  return typed;
}

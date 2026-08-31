import { isIP } from "node:net";
import path from "node:path";
import { domainToASCII } from "node:url";
import { authConfigurationError } from "./errors.js";
import {
  ConfigResolutionError,
  resolveConfigValue,
  type ResolvedValue
} from "../configResolver.js";
import { createOAuthListenerConfig, parseHttpAuthMode } from "./schemas.js";
import type {
  AuthModeSource,
  HttpAuthMode,
  OAuthCapabilitySelection,
  OAuthDeploymentConfiguration,
  OAuthListenerConfig,
  OAuthScope,
  ResolvedHttpAuthMode
} from "./types.js";

export interface AuthModeResolutionInput {
  currentProcess?: string;
  persistedUser?: string;
  profile?: string;
  profileFile?: string;
}

export interface OAuthRootSelectionInput {
  explicitRoot?: string;
  currentDirectory: string;
  matchingProfileRoot?: string;
  platform?: NodeJS.Platform;
}

export interface OAuthDeploymentConfigurationInput {
  canonicalRoot: string;
  profileId: string;
  hostname: string;
  issuer?: string;
  resource?: string;
  platform?: NodeJS.Platform;
  tunnel: string;
  tunnelName: string;
  tunnelOwner: string;
  publicHost?: string;
  publicPort?: number;
  localAdminHost?: string;
  localAdminPort?: number;
  listeners?: OAuthListenerConfig;
}

function normalized(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim();
}

export function resolveHttpAuthModeValue(
  input: AuthModeResolutionInput
): Readonly<ResolvedValue<HttpAuthMode>> {
  const currentProcess = normalized(input.currentProcess);
  const persistedUser = normalized(input.persistedUser);
  const profile = normalized(input.profile);
  return resolveConfigValue({
    key: "auth.mode",
    currentProcess: currentProcess === undefined
      ? []
      : [{
          value: currentProcess,
          origin: {
            kind: "environment",
            variable: "CODEXGPT_AUTH_MODE",
            scope: "current-process"
          }
        }],
    persistedUser: persistedUser === undefined
      ? []
      : [{
          value: persistedUser,
          origin: {
            kind: "environment",
            variable: "CODEXGPT_AUTH_MODE",
            scope: "persisted-user"
          }
        }],
    profile: profile === undefined
      ? []
      : [{
          value: profile,
          origin: {
            kind: "profile",
            file: input.profileFile ?? "<canonical-root-profile>",
            jsonPath: "$.authMode"
          }
        }],
    defaultValue: "legacy",
    defaultRule: "legacy remains the compatibility default",
    parse: (value, origin) => parseHttpAuthMode(
      String(value),
      origin.kind === "environment"
        ? `${origin.scope === "persisted-user" ? "Persisted user " : ""}${origin.variable}`
        : origin.kind === "profile"
          ? "Workspace profile authMode"
          : "auth.mode"
    ),
    restartRequired: true,
    remediation: "Set auth.mode to exactly legacy or oauth at the reported source."
  });
}

function authModeSourceFromOrigin(origin: ResolvedValue<HttpAuthMode>["origin"]): AuthModeSource {
  if (origin.kind === "environment") return origin.scope;
  if (origin.kind === "profile") return "profile";
  return "default";
}

export function resolveHttpAuthMode(input: AuthModeResolutionInput): Readonly<ResolvedHttpAuthMode> {
  try {
    const resolved = resolveHttpAuthModeValue(input);
    return Object.freeze({
      mode: resolved.value,
      source: authModeSourceFromOrigin(resolved.origin)
    });
  } catch (error) {
    if (
      error instanceof ConfigResolutionError &&
      error.code === "CONFIG_VALUE_INVALID" &&
      error.cause instanceof Error &&
      "code" in error.cause &&
      error.cause.code === "AUTH_MODE_INVALID"
    ) {
      throw error.cause;
    }
    throw error;
  }
}

export function assertHttpAuthModeCompatibility(input: {
  mode: HttpAuthMode;
  allowQueryToken: boolean;
  allowNoHttpToken: boolean;
  legacyTokenPresent: boolean;
}): void {
  if (
    input.mode === "oauth" &&
    (input.allowQueryToken || input.allowNoHttpToken || input.legacyTokenPresent)
  ) {
    throw authConfigurationError(
      "AUTH_MODE_CONFLICT",
      "OAuth mode cannot be combined with query-token, no-token, or legacy static-token configuration.",
      "$env:CODEXGPT_ALLOW_QUERY_TOKEN='0'; Remove-Item Env:CODEXGPT_ALLOW_NO_HTTP_TOKEN,Env:CODEXGPT_HTTP_TOKEN,Env:CODEBASE_BRIDGE_HTTP_TOKEN -ErrorAction SilentlyContinue"
    );
  }
}

function canonicalPathKey(value: string, platform: NodeJS.Platform): string {
  const normalized = platform === "win32" ? path.win32.normalize(value) : path.posix.normalize(value);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function resolveOAuthRootSelection(input: OAuthRootSelectionInput): string {
  const platform = input.platform ?? process.platform;
  if (input.explicitRoot) {
    assertAbsoluteCanonicalRoot(input.explicitRoot);
    return input.explicitRoot;
  }
  if (input.matchingProfileRoot) {
    assertAbsoluteCanonicalRoot(input.currentDirectory);
    assertAbsoluteCanonicalRoot(input.matchingProfileRoot);
  }
  if (
    input.matchingProfileRoot &&
    canonicalPathKey(input.currentDirectory, platform) === canonicalPathKey(input.matchingProfileRoot, platform)
  ) {
    return input.matchingProfileRoot;
  }
  throw authConfigurationError(
    "OAUTH_ROOT_REQUIRED",
    "OAuth mode requires an explicit canonical --root unless the current directory has one exact matching profile."
  );
}

export function normalizeOAuthHostname(input: string): string {
  const raw = input.trim();
  if (
    !raw ||
    raw.includes("*") ||
    raw.includes("\\") ||
    raw.includes("%") ||
    /\.$/.test(raw) ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    throw authConfigurationError("OAUTH_HOSTNAME_INVALID", "OAuth hostname is empty or ambiguous.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw authConfigurationError("OAUTH_HOSTNAME_INVALID", "OAuth hostname must be one stable HTTPS DNS hostname.");
  }

  try {
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "/mcp") ||
      (parsed.port && parsed.port !== "443")
    ) {
      throw new Error("unsupported URL component");
    }
    const ascii = domainToASCII(parsed.hostname).toLocaleLowerCase("en-US");
    if (
      !ascii ||
      ascii.endsWith(".") ||
      ascii.includes("_") ||
      ascii === "localhost" ||
      isIP(ascii) !== 0 ||
      !ascii.includes(".") ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(ascii)
    ) {
      throw new Error("invalid DNS hostname");
    }
    return ascii;
  } catch (cause) {
    throw authConfigurationError("OAUTH_HOSTNAME_INVALID", "OAuth hostname must be one stable HTTPS DNS hostname.");
  }
}

export function resolveEnabledOAuthScopes(
  input: OAuthCapabilitySelection
): readonly OAuthScope[] {
  const scopes: OAuthScope[] = ["codexgpt:read"];
  if (input.writeEnabled) scopes.push("codexgpt:write");
  if (input.executeEnabled) scopes.push("codexgpt:execute");
  return Object.freeze(scopes);
}

function assertAbsoluteCanonicalRoot(root: string): void {
  const pathApi = process.platform !== "win32" && path.posix.isAbsolute(root)
    ? path.posix
    : path.win32.isAbsolute(root)
      ? path.win32
      : undefined;
  if (!pathApi || pathApi.normalize(root) !== root) {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_INVALID",
      "OAuth deployment root must already be an absolute canonical path."
    );
  }
}

export function resolveOAuthDeploymentConfiguration(
  input: OAuthDeploymentConfigurationInput
): Readonly<OAuthDeploymentConfiguration> {
  const platform = input.platform ?? process.platform;
  if (platform !== "win32") {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_INVALID",
      "Phase 8 Core OAuth production requires native Windows capability."
    );
  }
  assertAbsoluteCanonicalRoot(input.canonicalRoot);
  if (!/^[a-f0-9]{24}$/.test(input.profileId)) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth profile id is invalid.");
  }
  if (
    input.tunnel !== "cloudflare-named" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.tunnelName) ||
    input.tunnelOwner !== "codexgpt"
  ) {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_INVALID",
      "OAuth requires one dedicated owner-marked Cloudflare named tunnel."
    );
  }

  const hostname = normalizeOAuthHostname(input.hostname);
  const issuer = `https://${hostname}`;
  const resource = `${issuer}/mcp`;
  if ((input.issuer && input.issuer !== issuer) || (input.resource && input.resource !== resource)) {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_INVALID",
      "Saved OAuth issuer/resource must match the normalized hostname exactly."
    );
  }

  const listeners = createOAuthListenerConfig({
    publicHost: (input.publicHost ?? input.listeners?.publicHost) as "127.0.0.1",
    publicPort: input.publicPort ?? input.listeners?.publicPort ?? Number.NaN,
    localAdminHost: (input.localAdminHost ?? input.listeners?.localAdminHost) as "127.0.0.1",
    localAdminPort: input.localAdminPort ?? input.listeners?.localAdminPort ?? Number.NaN
  });
  const identityKey = `${issuer}\n${resource}\n${hostname}`;

  return Object.freeze({
    canonicalRoot: input.canonicalRoot,
    profileId: input.profileId,
    hostname,
    issuer,
    resource,
    identityKey,
    tunnel: "cloudflare-named",
    tunnelName: input.tunnelName,
    tunnelOwner: "codexgpt",
    listeners
  });
}

export function assertDeploymentBindingCompatible(
  existing: OAuthDeploymentConfiguration,
  candidate: OAuthDeploymentConfiguration,
  platform: NodeJS.Platform = process.platform
): void {
  if (existing.identityKey !== candidate.identityKey) return;
  if (
    canonicalPathKey(existing.canonicalRoot, platform) !== canonicalPathKey(candidate.canonicalRoot, platform) ||
    existing.profileId !== candidate.profileId
  ) {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_CONFLICT",
      "The OAuth issuer/resource/hostname is already bound to a different canonical profile/root."
    );
  }
}

export function throwOAuthRuntimeUnavailable(): never {
  throw authConfigurationError(
    "OAUTH_RUNTIME_UNAVAILABLE",
    "OAuth configuration is valid, but the Phase 8 runtime is not available yet."
  );
}

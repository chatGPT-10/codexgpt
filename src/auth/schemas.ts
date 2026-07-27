import { z } from "zod";
import { authConfigurationError } from "./errors.js";
import {
  KNOWN_OAUTH_SCOPES,
  type HttpAuthMode,
  type OAuthDeploymentIdentity,
  type OAuthListenerConfig,
  type OAuthScope
} from "./types.js";

export const HttpAuthModeSchema = z.enum(["legacy", "oauth"]);
export const OAuthScopeSchema = z.enum(KNOWN_OAUTH_SCOPES);

const hostnameSchema = z.string()
  .min(1)
  .max(253)
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/);
const profileIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
const opaqueIdSchema = z.string().min(16).max(160).regex(/^[A-Za-z][A-Za-z0-9_-]+$/);

export const OAuthDeploymentIdentitySchema = z.object({
  issuer: z.string().url(),
  resource: z.string().url(),
  hostname: hostnameSchema,
  profileId: profileIdSchema,
  bindingId: opaqueIdSchema,
  incarnationId: opaqueIdSchema,
  recoveryEpoch: opaqueIdSchema
}).strict();

export const OAuthListenerConfigSchema = z.object({
  publicHost: z.literal("127.0.0.1"),
  publicPort: z.number().int().min(1).max(65535),
  localAdminHost: z.literal("127.0.0.1"),
  localAdminPort: z.number().int().min(1).max(65535)
}).strict().superRefine((value, context) => {
  if (value.publicPort === value.localAdminPort) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["localAdminPort"],
      message: "The public and local-admin ports must be distinct."
    });
  }
});

export function parseHttpAuthMode(value: string, source: string): HttpAuthMode {
  const parsed = HttpAuthModeSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw authConfigurationError(
      "AUTH_MODE_INVALID",
      `${source} must be exactly legacy or oauth.`
    );
  }
  return parsed.data;
}

export function assertEnabledOAuthScopes(
  input: readonly string[]
): readonly OAuthScope[] {
  if (input.length < 1 || input.length > KNOWN_OAUTH_SCOPES.length) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth scopes are outside the supported Core vocabulary.");
  }
  const seen = new Set<string>();
  let previousIndex = -1;
  for (const raw of input) {
    const parsed = OAuthScopeSchema.safeParse(raw);
    if (!parsed.success || seen.has(raw)) {
      throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth scopes must be known and duplicate-free.");
    }
    const index = KNOWN_OAUTH_SCOPES.indexOf(parsed.data);
    if (index <= previousIndex) {
      throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth scopes must use read, write, execute order.");
    }
    seen.add(raw);
    previousIndex = index;
  }
  if (input[0] !== "codexgpt:read") {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth scope sets must begin with codexgpt:read.");
  }
  return Object.isFrozen(input) ? input as readonly OAuthScope[] : Object.freeze([...input]) as readonly OAuthScope[];
}

export function createOAuthDeploymentIdentity(input: OAuthDeploymentIdentity): Readonly<OAuthDeploymentIdentity> {
  const parsed = OAuthDeploymentIdentitySchema.safeParse(input);
  if (!parsed.success) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth deployment identity is invalid.");
  }
  const expectedIssuer = `https://${parsed.data.hostname}`;
  const expectedResource = `${expectedIssuer}/mcp`;
  if (parsed.data.issuer !== expectedIssuer || parsed.data.resource !== expectedResource) {
    throw authConfigurationError(
      "OAUTH_DEPLOYMENT_INVALID",
      "OAuth issuer and resource must derive exactly from the saved hostname."
    );
  }
  return Object.freeze({ ...parsed.data });
}

export function createOAuthListenerConfig(input: OAuthListenerConfig): Readonly<OAuthListenerConfig> {
  const parsed = OAuthListenerConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw authConfigurationError("OAUTH_DEPLOYMENT_INVALID", "OAuth listener configuration is invalid.");
  }
  return Object.freeze({ ...parsed.data });
}

import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { LookupOAuthClient, SdkOAuthRegisteredClientsStore } from "./types.js";

export const SDK_AUTH_CONTRACT_VERSION = "1.29.0" as const;

export {
  authorizationHandler,
  mcpAuthRouter,
  requireBearerAuth,
  revocationHandler,
  tokenHandler
};

export function createLookupOnlyClientStore(
  getClient: LookupOAuthClient
): Readonly<SdkOAuthRegisteredClientsStore> {
  return Object.freeze({ getClient });
}

export * from "./audit.js";
export * from "./authorizationStore.js";
export * from "./clientStore.js";
export * from "./cloudflareConfig.js";
export * from "./configuration.js";
export * from "./credentialStore.js";
export * from "./deploymentLock.js";
export * from "./deploymentRegistry.js";
export * from "./errors.js";
export * from "./grantStore.js";
export * from "./keyManager.js";
export * from "./localAdminSession.js";
export * from "./metadata.js";
export * from "./oauthProvider.js";
export * from "./ownerApproval.js";
export * from "./policyIdentity.js";
export * from "./rateLimits.js";
export * from "./requestContext.js";
export * from "./resourceMiddleware.js";
export * from "./runtimeStatus.js";
export * from "./challenges.js";
export * from "./recovery.js";
export * from "./schemas.js";
export * from "./stateStore.js";
export * from "./tokenService.js";
export * from "./toolSecurity.js";
export * from "./types.js";
export * from "./windowsDpapi.js";

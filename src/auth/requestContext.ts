import { AsyncLocalStorage } from "node:async_hooks";
import { authConfigurationError } from "./errors.js";
import type { VerifiedAccessToken } from "./tokenService.js";
import type { OAuthScope } from "./types.js";

export interface OAuthRequestContext {
  ownerSubject: string;
  ownerRef: string;
  clientId: string;
  clientRef: string;
  resource: string;
  bindingId: string;
  incarnationId: string;
  grantId: string;
  grantRevision: number;
  scopes: readonly OAuthScope[];
  tokenId: string;
  tokenFingerprint: string;
  expiresAt: number;
}

const requestContext = new AsyncLocalStorage<Readonly<OAuthRequestContext>>();

export function createOAuthRequestContext(verified: VerifiedAccessToken): Readonly<OAuthRequestContext> {
  return Object.freeze({
    ownerSubject: verified.ownerSubject,
    ownerRef: verified.ownerRef,
    clientId: verified.clientId,
    clientRef: verified.clientRef,
    resource: verified.resource,
    bindingId: verified.bindingId,
    incarnationId: verified.incarnationId,
    grantId: verified.grantId,
    grantRevision: verified.grantRevision,
    scopes: Object.freeze([...verified.scopes]),
    tokenId: verified.tokenId,
    tokenFingerprint: verified.fingerprint,
    expiresAt: verified.expiresAt
  });
}

export function runWithOAuthRequestContext<T>(context: Readonly<OAuthRequestContext>, action: () => T): T {
  return requestContext.run(context, action);
}

export function currentOAuthRequestContext(): Readonly<OAuthRequestContext> {
  const context = requestContext.getStore();
  if (!context) {
    throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth request identity is unavailable.");
  }
  return context;
}

export function maybeOAuthRequestContext(): Readonly<OAuthRequestContext> | undefined {
  return requestContext.getStore();
}

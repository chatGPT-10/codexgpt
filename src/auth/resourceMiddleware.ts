import type { NextFunction, Request, RequestHandler, Response } from "express";
import { applyNoStore } from "../http/securityHeaders.js";
import { buildBearerChallenge } from "./challenges.js";
import { AuthConfigurationError } from "./errors.js";
import {
  createOAuthRequestContext,
  runWithOAuthRequestContext,
  type OAuthRequestContext
} from "./requestContext.js";
import { OAuthBearerCapacityError, type OAuthTokenService } from "./tokenService.js";
import type { OAuthDeploymentIdentity, OAuthScope } from "./types.js";

const CONTEXT_LOCAL = "codexgptOAuthRequestContext";
const ALTERNATE_QUERY_KEYS = new Set(["access_token", "token", "codexgpt_token"]);
const ALTERNATE_BODY_KEYS = new Set(["access_token", "token", "authorization", "bearer"]);

export interface OAuthResourceMiddlewareOptions {
  identity: OAuthDeploymentIdentity;
  enabledScopes: readonly OAuthScope[];
  requiredScopes: readonly OAuthScope[];
  tokens: OAuthTokenService;
  isEstablishedSession?: (req: Request, tokenFingerprint: string) => boolean;
}

export interface OAuthResourceMiddleware {
  authenticate: RequestHandler;
  rejectBodyCredentials: RequestHandler;
  context(res: Response): Readonly<OAuthRequestContext>;
}

function authorizationHeaderCount(req: Request): number {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLocaleLowerCase("en-US") === "authorization") count += 1;
  }
  return count;
}

function hasQueryCredential(req: Request): boolean {
  const queryIndex = req.originalUrl.indexOf("?");
  if (queryIndex < 0) return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(req.originalUrl.slice(queryIndex + 1));
  } catch {
    return true;
  }
  for (const key of ALTERNATE_QUERY_KEYS) if (params.has(key)) return true;
  return false;
}

function hasCookieCredential(req: Request): boolean {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return false;
  if (Buffer.byteLength(raw, "utf8") > 4096) return true;
  return raw.split(";").some((part) => {
    const key = part.trim().split("=", 1)[0]?.toLocaleLowerCase("en-US");
    return key !== undefined && ALTERNATE_QUERY_KEYS.has(key);
  });
}

function hasBodyCredential(body: unknown): boolean {
  if (!body || Array.isArray(body) || typeof body !== "object") return false;
  return Object.keys(body as Record<string, unknown>)
    .some((key) => ALTERNATE_BODY_KEYS.has(key.toLocaleLowerCase("en-US")));
}

function challenge(res: Response, status: 401 | 403, value: string): void {
  applyNoStore(res);
  res.setHeader("WWW-Authenticate", value);
  res.status(status).json({
    error: status === 401 ? "unauthorized" : "insufficient_scope"
  });
}

function unavailable(res: Response): void {
  applyNoStore(res);
  res.status(503).json({ error: "temporarily_unavailable" });
}

export function createOAuthResourceMiddleware(options: OAuthResourceMiddlewareOptions): OAuthResourceMiddleware {
  const missingChallenge = buildBearerChallenge({
    identity: options.identity,
    scopes: options.enabledScopes,
    kind: "missing"
  });
  const invalidChallenge = buildBearerChallenge({
    identity: options.identity,
    scopes: options.enabledScopes,
    kind: "invalid_token"
  });
  const scopeChallenge = buildBearerChallenge({
    identity: options.identity,
    scopes: options.requiredScopes,
    kind: "insufficient_scope"
  });

  const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (hasQueryCredential(req) || hasCookieCredential(req) || authorizationHeaderCount(req) > 1) {
      challenge(res, 401, invalidChallenge);
      return;
    }
    const raw = req.headers.authorization;
    if (raw === undefined) {
      challenge(res, 401, missingChallenge);
      return;
    }
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 8192) {
      challenge(res, 401, invalidChallenge);
      return;
    }
    const match = /^Bearer ([\x21-\x7e]+)$/i.exec(raw);
    if (!match) {
      challenge(res, 401, invalidChallenge);
      return;
    }
    try {
      const verified = await options.tokens.verifyAccessToken(match[1], {
        isEstablishedSession: options.isEstablishedSession
          ? (tokenFingerprint) => options.isEstablishedSession!(req, tokenFingerprint)
          : undefined
      });
      if (options.requiredScopes.some((scope) => !verified.scopes.includes(scope))) {
        challenge(res, 403, scopeChallenge);
        return;
      }
      const context = createOAuthRequestContext(verified);
      res.locals[CONTEXT_LOCAL] = context;
      runWithOAuthRequestContext(context, next);
    } catch (error) {
      if (
        error instanceof OAuthBearerCapacityError ||
        (error && typeof error === "object" && (error as { name?: unknown }).name === "OAuthBearerCapacityError")
      ) {
        applyNoStore(res);
        const retryAfter = error && typeof error === "object" &&
          Number.isInteger((error as { retryAfterSeconds?: unknown }).retryAfterSeconds)
          ? Number((error as { retryAfterSeconds: number }).retryAfterSeconds)
          : 1;
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({ error: "temporarily_unavailable" });
        return;
      }
      if (error instanceof AuthConfigurationError) {
        unavailable(res);
        return;
      }
      challenge(res, 401, invalidChallenge);
    }
  };

  const rejectBodyCredentials = (req: Request, res: Response, next: NextFunction): void => {
    if (hasBodyCredential(req.body)) {
      challenge(res, 401, invalidChallenge);
      return;
    }
    next();
  };

  return Object.freeze({
    authenticate,
    rejectBodyCredentials,
    context(res: Response): Readonly<OAuthRequestContext> {
      const context = res.locals[CONTEXT_LOCAL] as Readonly<OAuthRequestContext> | undefined;
      if (!context) throw new Error("OAuth request context is unavailable.");
      return context;
    }
  });
}

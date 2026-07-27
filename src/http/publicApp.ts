import express, { type NextFunction, type Request, type Response } from "express";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import type { OAuthDeploymentIdentity, OAuthScope } from "../auth/types.js";
import { OAuthClientStore, parseDynamicClientRegistration } from "../auth/clientStore.js";
import { AuthorizationStore } from "../auth/authorizationStore.js";
import { AuthConfigurationError, OAuthProtocolError } from "../auth/errors.js";
import { CORE_OAUTH_RATE_LIMITS, FixedWindowRateLimiter } from "../auth/rateLimits.js";
import {
  CodexOAuthProvider,
  createAuthorizationContinueHandler,
  createAuthorizationGuard,
  createAuthorizationStatusHandler,
  createRevocationEndpointHandler,
  createTokenEndpointHandler
} from "../auth/oauthProvider.js";
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  PROTECTED_RESOURCE_METADATA_COMPATIBILITY_PATH,
  PROTECTED_RESOURCE_METADATA_PATH,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  metadataResponse
} from "../auth/metadata.js";
import { createOAuthResourceMiddleware } from "../auth/resourceMiddleware.js";
import type { OAuthTokenService } from "../auth/tokenService.js";
import type { OAuthRequestContext } from "../auth/requestContext.js";
import { applyBaseSecurityHeaders, applyNoStore } from "./securityHeaders.js";

export interface OAuthPublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
}

export interface PublicOAuthMcpRuntime {
  isEstablishedSession?(req: Request, tokenFingerprint: string): boolean;
  handlePost(req: Request, res: Response, context: Readonly<OAuthRequestContext>): Promise<void>;
  handleSession(req: Request, res: Response, context: Readonly<OAuthRequestContext>): Promise<void>;
}

export interface PublicOAuthRuntime {
  clients: OAuthClientStore;
  authorizations: AuthorizationStore;
  tokens: OAuthTokenService;
  mcp?: PublicOAuthMcpRuntime;
}

export interface PublicOAuthAppOptions {
  identity: OAuthDeploymentIdentity;
  enabledScopes: readonly OAuthScope[];
  publicJwks: readonly OAuthPublicJwk[];
  allowedOrigins?: readonly string[];
  admission?: Partial<PublicAdmissionLimits>;
  now?: () => number;
  oauthRuntime?: PublicOAuthRuntime;
}

export interface PublicAdmissionLimits {
  active: number;
  queued: number;
  reservedMcpActive: number;
  reservedMcpQueued: number;
  perMinute: number;
  now: () => number;
}

const DEFAULT_ADMISSION_LIMITS: PublicAdmissionLimits = Object.freeze({
  active: 64,
  queued: 128,
  reservedMcpActive: 16,
  reservedMcpQueued: 32,
  perMinute: 600,
  now: Date.now
});

function requestHost(req: Request): string | null {
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLocaleLowerCase("en-US") === "host") {
      values.push(req.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length !== 1) return null;
  const value = values[0].trim().toLocaleLowerCase("en-US");
  return value.length > 0 && value === req.headers.host?.trim().toLocaleLowerCase("en-US")
    ? value
    : null;
}

function sendSerialized(res: Response, response: ReturnType<typeof metadataResponse>): void {
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  res.status(200).send(response.body);
}

function rejectBusy(res: Response): void {
  res.setHeader("Retry-After", "1");
  applyNoStore(res);
  res.status(429).json({ error: "temporarily_unavailable" });
}

export function createPublicAdmissionMiddleware(
  overrides: Partial<PublicAdmissionLimits> = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const limits: PublicAdmissionLimits = {
    ...DEFAULT_ADMISSION_LIMITS,
    ...overrides,
    reservedMcpActive: overrides.reservedMcpActive ?? (overrides.active === undefined ? DEFAULT_ADMISSION_LIMITS.reservedMcpActive : 0),
    reservedMcpQueued: overrides.reservedMcpQueued ?? (overrides.queued === undefined ? DEFAULT_ADMISSION_LIMITS.reservedMcpQueued : 0)
  };
  if (
    !Number.isInteger(limits.active) || limits.active < 1 ||
    !Number.isInteger(limits.queued) || limits.queued < 0 ||
    !Number.isInteger(limits.reservedMcpActive) || limits.reservedMcpActive < 0 || limits.reservedMcpActive > limits.active ||
    !Number.isInteger(limits.reservedMcpQueued) || limits.reservedMcpQueued < 0 || limits.reservedMcpQueued > limits.queued ||
    !Number.isInteger(limits.perMinute) || limits.perMinute < 1
  ) {
    throw new Error("Public admission limits are invalid.");
  }

  type AdmissionEntry = { req: Request; res: Response; next: NextFunction; mcp: boolean };
  let active = 0;
  let activeNonMcp = 0;
  let windowStartedAt = limits.now();
  let windowCount = 0;
  const mcpQueue: AdmissionEntry[] = [];
  const generalQueue: AdmissionEntry[] = [];

  const canAdmit = (entry: AdmissionEntry): boolean => entry.mcp
    ? active < limits.active
    : active < limits.active && activeNonMcp < limits.active - limits.reservedMcpActive;

  const drain = (): void => {
    while (mcpQueue.length > 0 && canAdmit(mcpQueue[0])) admit(mcpQueue.shift()!);
    while (generalQueue.length > 0 && canAdmit(generalQueue[0])) admit(generalQueue.shift()!);
  };

  const admit = (entry: AdmissionEntry): void => {
    if (entry.res.destroyed || entry.res.writableEnded) return;
    active += 1;
    if (!entry.mcp) activeNonMcp += 1;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      active -= 1;
      if (!entry.mcp) activeNonMcp -= 1;
      drain();
    };
    entry.res.once("finish", release);
    entry.res.once("close", release);
    entry.next();
  };

  return (req, res, next) => {
    const now = limits.now();
    if (now - windowStartedAt >= 60_000) {
      windowStartedAt = now;
      windowCount = 0;
    }
    const mcp = req.path === "/mcp";
    if (!mcp) {
      windowCount += 1;
      if (windowCount > limits.perMinute) {
        rejectBusy(res);
        return;
      }
    }
    const entry = { req, res, next, mcp };
    if (canAdmit(entry)) {
      admit(entry);
      return;
    }
    const totalQueued = mcpQueue.length + generalQueue.length;
    const generalCapacity = limits.queued - limits.reservedMcpQueued;
    if (totalQueued >= limits.queued || (!mcp && generalQueue.length >= generalCapacity)) {
      rejectBusy(res);
      return;
    }
    const queue = mcp ? mcpQueue : generalQueue;
    queue.push(entry);
    req.once("aborted", () => {
      const index = queue.indexOf(entry);
      if (index >= 0) queue.splice(index, 1);
    });
  };
}

export function createPublicOAuthApp(options: PublicOAuthAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.enable("case sensitive routing");
  app.enable("strict routing");
  app.set("trust proxy", false);
  app.use(applyBaseSecurityHeaders);
  app.use((req, res, next) => {
    if (requestHost(req) !== options.identity.hostname) {
      res.status(403).send("Forbidden: Host is not allowed");
      return;
    }
    next();
  });
  app.use(createPublicAdmissionMiddleware(options.admission));

  const protectedResource = metadataResponse(
    buildProtectedResourceMetadata(options.identity, options.enabledScopes)
  );
  const authorizationServer = metadataResponse(
    buildAuthorizationServerMetadata(options.identity, options.enabledScopes)
  );
  const jwks = metadataResponse({ keys: options.publicJwks });
  const mcpAvailable = Boolean(options.oauthRuntime?.mcp);
  const rootBody = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodexGPT OAuth resource</title></head><body><main><h1>CodexGPT OAuth resource</h1><p>This self-hosted endpoint exposes OAuth discovery, constrained public-client registration, owner authorization, token exchange, revocation, and ${mcpAvailable ? "authenticated MCP access" : "no MCP transport"}.</p><h2>Discovery</h2><ul><li><code>/.well-known/oauth-protected-resource/mcp</code></li><li><code>/.well-known/oauth-authorization-server</code></li><li><code>/jwks</code></li></ul><h2>Protocol</h2><p>Authorization Code with PKCE S256 is required. Authorization responses include RFC 9207 issuer binding. Access tokens are accepted only in the Authorization header. Dynamic registration accepts only the supported ChatGPT redirect patterns, ignores unknown extension fields, and never issues a client secret.</p><h2>Public work limits</h2><p>Registration, authorization polling, token, revocation, invalid Bearer, and concurrent request paths are bounded. Established MCP traffic retains reserved admission capacity.</p><h2>Errors</h2><dl><dt><code>invalid_request</code></dt><dd>Malformed method, media type, duplicated parameter, or unsupported request shape.</dd><dt><code>invalid_client</code></dt><dd>Unknown, unapproved, revoked, or mismatched public client.</dd><dt><code>invalid_grant</code></dt><dd>Expired, consumed, replayed, revoked, or mismatched authorization/refresh credential.</dd><dt><code>invalid_scope</code></dt><dd>Unknown, reordered, duplicated, or unavailable scope request.</dd><dt><code>invalid_target</code></dt><dd>Resource does not exactly match this MCP endpoint.</dd><dt><code>temporarily_unavailable</code></dt><dd>Bounded admission, audit, or local owner service is unavailable; retry only after the local operator repairs the reported condition.</dd></dl><p>Owner approval and administration are available only on the separate loopback local-admin listener.</p></main></body></html>`;
  const healthBody = JSON.stringify({ ok: true, name: "CodexGPT", authMode: "oauth", mcpAvailable });

  app.get(PROTECTED_RESOURCE_METADATA_PATH, (_req, res) => sendSerialized(res, protectedResource));
  app.get(PROTECTED_RESOURCE_METADATA_COMPATIBILITY_PATH, (_req, res) => sendSerialized(res, protectedResource));
  app.get(AUTHORIZATION_SERVER_METADATA_PATH, (_req, res) => sendSerialized(res, authorizationServer));
  app.get("/jwks", (_req, res) => sendSerialized(res, jwks));

  app.get("/", (_req, res) => {
    applyNoStore(res);
    res.type("html").send(rootBody);
  });
  app.get("/healthz", (_req, res) => {
    applyNoStore(res);
    res.type("application/json").send(healthBody);
  });

  if (options.oauthRuntime) {
    const registrationLimit = new FixedWindowRateLimiter(
      CORE_OAUTH_RATE_LIMITS.registration,
      { now: options.now }
    );
    const registrationBody = express.raw({ type: "application/json", limit: "16kb" });
    app.all("/register", (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      next();
    });
    const requireRegistrationContentType = (req: Request, res: Response, next: NextFunction): void => {
      const raw = req.headers["content-type"];
      if (typeof raw !== "string") {
        applyNoStore(res);
        res.status(400).json({ error: "invalid_request", error_description: "Registration requires application/json." });
        return;
      }
      const parts = raw.split(";").map((part) => part.trim().toLocaleLowerCase("en-US"));
      if (parts[0] !== "application/json" || parts.slice(1).some((part) => part !== "charset=utf-8")) {
        applyNoStore(res);
        res.status(400).json({ error: "invalid_request", error_description: "Registration requires application/json with UTF-8." });
        return;
      }
      next();
    };
    app.post("/register", requireRegistrationContentType, registrationBody, async (req, res) => {
      applyNoStore(res);
      const decision = registrationLimit.consume("deployment");
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(decision.retryAfterSeconds));
        res.status(429).json({ error: "temporarily_unavailable" });
        return;
      }
      try {
        if (!Buffer.isBuffer(req.body)) {
          throw new OAuthProtocolError("invalid_request", "Registration requires application/json.");
        }
        const registration = parseDynamicClientRegistration(req.body);
        const client = await options.oauthRuntime!.clients.register(registration);
        res.status(201).json(client);
      } catch (error) {
        if (error instanceof OAuthProtocolError) {
          const description = error.localAction ? `${error.message} ${error.localAction}` : error.message;
          res.status(error.statusCode).json({ error: error.oauthCode, error_description: description });
          return;
        }
        if (error instanceof AuthConfigurationError && error.code === "OAUTH_AUDIT_FAILURE") {
          res.status(503).json({
            error: "temporarily_unavailable",
            recovery_action: "Run `codexgpt doctor` locally, repair the audit store, and retry."
          });
          return;
        }
        res.status(503).json({ error: "temporarily_unavailable", error_description: "OAuth registration is unavailable." });
      }
    });
    app.all("/register", (_req, res) => {
      applyNoStore(res);
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "invalid_request" });
    });

    const routeOptions = {
      identity: options.identity,
      enabledScopes: options.enabledScopes,
      clients: options.oauthRuntime.clients,
      authorizations: options.oauthRuntime.authorizations
    };
    const provider = new CodexOAuthProvider(
      options.identity,
      options.oauthRuntime.clients,
      options.oauthRuntime.authorizations,
      options.oauthRuntime.tokens
    );
    const guard = createAuthorizationGuard(routeOptions);
    app.get("/authorize/status/:pendingId", createAuthorizationStatusHandler(routeOptions));
    app.get("/authorize/continue/:pendingId", createAuthorizationContinueHandler(routeOptions));
    app.all("/authorize/", (_req, res) => {
      applyNoStore(res);
      res.status(404).json({ error: "authorization_unavailable" });
    });
    app.use("/authorize", (req, res, next) => {
      if (req.path !== "/") {
        applyNoStore(res);
        res.status(404).json({ error: "authorization_unavailable" });
        return;
      }
      if (req.method !== "GET" && req.method !== "POST") {
        applyNoStore(res);
        res.setHeader("Allow", "GET, POST");
        res.status(405).json({ error: "invalid_request" });
        return;
      }
      next();
    });
    app.post("/authorize", express.raw({ type: "application/x-www-form-urlencoded", limit: "8kb" }), guard);
    app.get("/authorize", guard);
    app.use("/authorize", authorizationHandler({ provider, rateLimit: false }));

    const machineBody = express.raw({ type: "application/x-www-form-urlencoded", limit: "8kb" });
    app.post("/token", machineBody, createTokenEndpointHandler(options.identity, {
      provider,
      now: options.now
    }));
    app.all("/token", (_req, res) => {
      applyNoStore(res);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "invalid_request" });
    });
    app.post("/revoke", machineBody, createRevocationEndpointHandler({
      provider,
      now: options.now
    }));
    app.all("/revoke", (_req, res) => {
      applyNoStore(res);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "invalid_request" });
    });

    const resource = createOAuthResourceMiddleware({
      identity: options.identity,
      enabledScopes: options.enabledScopes,
      requiredScopes: ["codexgpt:read"],
      tokens: options.oauthRuntime.tokens,
      isEstablishedSession: typeof options.oauthRuntime.mcp?.isEstablishedSession === "function"
        ? (req, tokenFingerprint) => options.oauthRuntime!.mcp!.isEstablishedSession!(req, tokenFingerprint)
        : undefined
    });
    const mcpOriginGuard = (req: Request, res: Response, next: NextFunction): void => {
      const origin = req.headers.origin;
      if (origin === undefined) {
        next();
        return;
      }
      if (typeof origin !== "string" || origin.length > 2048) {
        res.status(403).send("Forbidden: Origin is not allowed");
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        res.status(403).send("Forbidden: Origin is not allowed");
        return;
      }
      const canonical = parsed.origin === origin;
      const sameHost = canonical && parsed.protocol === "https:" &&
        parsed.host.toLocaleLowerCase("en-US") === options.identity.hostname;
      const configured = canonical && (options.allowedOrigins ?? []).includes(parsed.origin);
      if (!sameHost && !configured) {
        res.status(403).send("Forbidden: Origin is not allowed");
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", parsed.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
      next();
    };
    const unavailableMcp = (_req: Request, res: Response): void => {
      applyNoStore(res);
      res.status(503).json({ error: "OAUTH_RUNTIME_UNAVAILABLE" });
    };
    const postHandler = options.oauthRuntime.mcp
      ? async (req: Request, res: Response): Promise<void> => {
          await options.oauthRuntime!.mcp!.handlePost(req, res, resource.context(res));
        }
      : unavailableMcp;
    const sessionHandler = options.oauthRuntime.mcp
      ? async (req: Request, res: Response): Promise<void> => {
          await options.oauthRuntime!.mcp!.handleSession(req, res, resource.context(res));
        }
      : unavailableMcp;
    app.post(
      "/mcp",
      mcpOriginGuard,
      resource.authenticate,
      express.json({ limit: "20mb" }),
      resource.rejectBodyCredentials,
      postHandler
    );
    app.get("/mcp", mcpOriginGuard, resource.authenticate, sessionHandler);
    app.delete("/mcp", mcpOriginGuard, resource.authenticate, sessionHandler);
    app.all("/mcp", (_req, res) => {
      applyNoStore(res);
      res.setHeader("Allow", "GET, POST, DELETE");
      res.status(405).json({ error: "method_not_allowed" });
    });
  } else {
    app.all("/mcp", (_req, res) => {
      applyNoStore(res);
      res.status(503).json({ error: "OAUTH_RUNTIME_UNAVAILABLE" });
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    applyNoStore(res);
    const code = (error as { type?: string }).type;
    if (code === "entity.too.large") {
      res.status(413).json({ error: "invalid_request" });
      return;
    }
    res.status(400).json({ error: "invalid_request" });
  });

  return app;
}

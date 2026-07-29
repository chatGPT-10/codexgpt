import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  AuthorizationStore,
  OAUTH_BROWSER_COOKIE,
  type CanonicalAuthorizationRequest
} from "./authorizationStore.js";
import { OAuthClientStore } from "./clientStore.js";
import { AuthConfigurationError, OAuthProtocolError } from "./errors.js";
import {
  CORE_OAUTH_RATE_LIMITS,
  FixedWindowRateLimiter,
  type OAuthTokenEndpointDiagnostics,
  type OAuthTokenDiagnosticGrantType,
  type OAuthTokenDiagnosticReason,
  type RateLimitDecision
} from "./rateLimits.js";
import type { OAuthTokenService } from "./tokenService.js";
import { KNOWN_OAUTH_SCOPES, type OAuthDeploymentIdentity, type OAuthScope } from "./types.js";

export const OAUTH_QUERY_FORM_MAX_BYTES = 8 * 1024;
export const OAUTH_QUERY_FORM_MAX_PARAMETERS = 24;
export const OAUTH_QUERY_KEY_MAX_BYTES = 64;
export const OAUTH_QUERY_VALUE_MAX_BYTES = 4096;

const AUTHORIZATION_LOCALS = "codexgptAuthorization";
const UNKNOWN_SAFE_ERROR = Object.freeze({ error: "authorization_unavailable" });
const TOKEN_DIAGNOSTIC_ERROR_REASONS = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "invalid_scope",
  "invalid_target",
  "temporarily_unavailable"
]);

export interface AuthorizationRouteOptions {
  identity: OAuthDeploymentIdentity;
  enabledScopes: readonly OAuthScope[];
  clients: OAuthClientStore;
  authorizations: AuthorizationStore;
  now?: () => number;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function parseComponent(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    throw new OAuthProtocolError("invalid_request", "OAuth parameters are malformed.");
  }
}

export function parseBoundedOAuthParameters(raw: string): Readonly<Record<string, string>> {
  if (utf8Bytes(raw) > OAUTH_QUERY_FORM_MAX_BYTES) {
    throw new OAuthProtocolError("invalid_request", "OAuth parameters are too large.");
  }
  const output: Record<string, string> = {};
  if (raw.length === 0) return Object.freeze(output);
  const pairs = raw.split("&");
  if (pairs.length > OAUTH_QUERY_FORM_MAX_PARAMETERS) {
    throw new OAuthProtocolError("invalid_request", "OAuth parameter count is invalid.");
  }
  for (const pair of pairs) {
    if (pair.length === 0) throw new OAuthProtocolError("invalid_request", "OAuth parameters are malformed.");
    const separator = pair.indexOf("=");
    const rawKey = separator < 0 ? pair : pair.slice(0, separator);
    const rawValue = separator < 0 ? "" : pair.slice(separator + 1);
    const key = parseComponent(rawKey);
    const value = parseComponent(rawValue);
    if (!key || utf8Bytes(key) > OAUTH_QUERY_KEY_MAX_BYTES || utf8Bytes(value) > OAUTH_QUERY_VALUE_MAX_BYTES) {
      throw new OAuthProtocolError("invalid_request", "OAuth parameter size is invalid.");
    }
    if (Object.hasOwn(output, key)) {
      throw new OAuthProtocolError("invalid_request", "OAuth parameters contain duplicates.");
    }
    output[key] = value;
  }
  return Object.freeze(output);
}

function authorizeErrorCode(error: unknown): string {
  return error instanceof OAuthProtocolError ? error.oauthCode : "invalid_request";
}

function authorizeErrorMessage(error: unknown): string {
  return error instanceof OAuthProtocolError ? error.message : "The authorization request is invalid.";
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function applyAuthorizationSecurityHeaders(res: Response): void {
  noStore(res);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
}

function sendDirectError(res: Response, error: unknown): void {
  applyAuthorizationSecurityHeaders(res);
  const status = error instanceof OAuthProtocolError ? error.statusCode : 400;
  res.status(status).json({ error: authorizeErrorCode(error), error_description: authorizeErrorMessage(error) });
}

function redirectError(res: Response, redirectUri: string, identity: OAuthDeploymentIdentity, error: unknown, state?: string): void {
  const target = new URL(redirectUri);
  target.searchParams.set("error", authorizeErrorCode(error));
  target.searchParams.set("error_description", authorizeErrorMessage(error));
  if (state) target.searchParams.set("state", state);
  target.searchParams.set("iss", identity.issuer);
  applyAuthorizationSecurityHeaders(res);
  res.redirect(302, target.href);
}

function exactContentType(req: Request): boolean {
  const raw = req.headers["content-type"];
  if (typeof raw !== "string") return false;
  const parts = raw.split(";").map((part) => part.trim().toLocaleLowerCase("en-US"));
  return parts[0] === "application/x-www-form-urlencoded" && parts.slice(1).every((part) => part === "charset=utf-8");
}

function parseAuthorizationInput(req: Request): Readonly<Record<string, string>> {
  if (req.method === "GET") {
    const queryIndex = req.originalUrl.indexOf("?");
    return parseBoundedOAuthParameters(queryIndex < 0 ? "" : req.originalUrl.slice(queryIndex + 1));
  }
  if (!exactContentType(req) || !Buffer.isBuffer(req.body)) {
    throw new OAuthProtocolError("invalid_request", "Authorization POST requires application/x-www-form-urlencoded.");
  }
  return parseBoundedOAuthParameters(req.body.toString("utf8"));
}

function parseScope(input: string | undefined, enabledScopes: readonly OAuthScope[]): readonly OAuthScope[] {
  if (input === undefined || input === "") return Object.freeze([...enabledScopes]);
  if (utf8Bytes(input) > 256 || /\s{2,}|[^\x20-\x7e]/.test(input)) {
    throw new OAuthProtocolError("invalid_scope", "Requested OAuth scope is invalid.");
  }
  const values = input.split(" ");
  const unique = new Set(values);
  const known = new Set<string>(KNOWN_OAUTH_SCOPES);
  if (unique.size !== values.length || values.some((value) => !known.has(value))) {
    throw new OAuthProtocolError("invalid_scope", "Requested OAuth scope is invalid.");
  }
  const effective = enabledScopes.filter((scope) => unique.has(scope));
  if (effective.length === 0) {
    throw new OAuthProtocolError("invalid_scope", "Requested OAuth scope is not enabled.");
  }
  return Object.freeze(effective);
}

function canonicalSdkParameters(input: CanonicalAuthorizationRequest): Record<string, string> {
  return {
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    resource: input.resource,
    scope: input.scopes.join(" "),
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256"
  };
}

function rejectLimited(res: Response, decision: RateLimitDecision): void {
  applyAuthorizationSecurityHeaders(res);
  res.setHeader("Retry-After", String(decision.retryAfterSeconds));
  res.status(429).json({ error: "temporarily_unavailable" });
}

function isAuditUnavailable(error: unknown): boolean {
  return error instanceof AuthConfigurationError && error.code === "OAUTH_AUDIT_FAILURE";
}

function sendAuditUnavailable(res: Response): void {
  applyAuthorizationSecurityHeaders(res);
  res.status(503).json({
    error: "temporarily_unavailable",
    recovery_action: "Run `codexgpt doctor` locally, repair the audit store, and retry."
  });
}

export function createAuthorizationGuard(options: AuthorizationRouteOptions): RequestHandler {
  const deploymentLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.authorizeDeployment, { now: options.now });
  const clientLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.authorizeClient, { now: options.now });
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "POST") {
      next();
      return;
    }
    const deploymentDecision = deploymentLimit.consume("deployment");
    if (!deploymentDecision.allowed) {
      rejectLimited(res, deploymentDecision);
      return;
    }
    let parameters: Readonly<Record<string, string>>;
    try {
      if (req.headers.authorization !== undefined) {
        throw new OAuthProtocolError("invalid_request", "Client authentication is not accepted on authorization requests.");
      }
      parameters = parseAuthorizationInput(req);
    } catch (error) {
      sendDirectError(res, error);
      return;
    }
    const clientId = parameters.client_id;
    const redirectUri = parameters.redirect_uri;
    try {
      if (!clientId || !/^client_[A-Za-z0-9_-]{43}$/.test(clientId)) {
        throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
      }
      const client = await options.clients.getClient(clientId);
      if (!client) throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
      if (!redirectUri || client.redirect_uris.length !== 1 || redirectUri !== client.redirect_uris[0]) {
        throw new OAuthProtocolError("invalid_request", "The redirect URI is invalid.");
      }
    } catch (error) {
      sendDirectError(res, error);
      return;
    }
    const clientDecision = clientLimit.consume(clientId);
    if (!clientDecision.allowed) {
      rejectLimited(res, clientDecision);
      return;
    }
    try {
      if (parameters.response_type !== "code") throw new OAuthProtocolError("invalid_request", "response_type must be code.");
      const state = parameters.state;
      if (!state || utf8Bytes(state) < 8 || utf8Bytes(state) > 1024 || /[\u0000-\u001f\u007f]/u.test(state)) {
        throw new OAuthProtocolError("invalid_request", "OAuth state is invalid.");
      }
      if (parameters.resource !== options.identity.resource) throw new OAuthProtocolError("invalid_target", "The OAuth resource is invalid.");
      if (parameters.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(parameters.code_challenge ?? "")) {
        throw new OAuthProtocolError("invalid_request", "PKCE S256 is required.");
      }
      const forbidden = ["client_secret", "client_assertion", "client_assertion_type", "grant_type", "request", "request_uri"];
      if (forbidden.some((key) => parameters[key] !== undefined)) throw new OAuthProtocolError("invalid_request", "Forbidden authorization parameters were supplied.");
      const scopes = parseScope(parameters.scope, options.enabledScopes);
      const canonical: CanonicalAuthorizationRequest = Object.freeze({
        clientId,
        redirectUri,
        state,
        resource: options.identity.resource,
        scopes,
        codeChallenge: parameters.code_challenge
      });
      res.locals[AUTHORIZATION_LOCALS] = canonical;
      const sdk = canonicalSdkParameters(canonical);
      if (req.method === "POST") req.body = sdk;
      else req.url = `/authorize?${new URLSearchParams(sdk).toString()}`;
      next();
    } catch (error) {
      redirectError(res, redirectUri, options.identity, error, parameters.state);
    }
  };
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new OAuthProtocolError("invalid_grant", "Authorization code is invalid.");
  }
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function normalizeRefreshScopes(scopes: readonly string[]): readonly OAuthScope[] {
  if (scopes.length < 1 || scopes.length > 3 || new Set(scopes).size !== scopes.length) {
    throw new OAuthProtocolError("invalid_scope", "Refresh scope is invalid.");
  }
  if (scopes.some((scope) => !["codexgpt:read", "codexgpt:write", "codexgpt:execute"].includes(scope))) {
    throw new OAuthProtocolError("invalid_scope", "Refresh scope is invalid.");
  }
  const normalized = ["codexgpt:read", "codexgpt:write", "codexgpt:execute"]
    .filter((scope) => scopes.includes(scope)) as OAuthScope[];
  if (normalized.some((scope, index) => scope !== scopes[index])) {
    throw new OAuthProtocolError("invalid_scope", "Refresh scope is invalid.");
  }
  return Object.freeze(normalized);
}

function waitingPage(input: {
  pendingId: string;
  correlationCode: string;
  clientLabel: string;
  scopes: readonly OAuthScope[];
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodexGPT authorization</title></head><body><main><h1>Authorization pending</h1><p>Client: ${htmlEscape(input.clientLabel)}</p><p>Correlation code: <strong>${htmlEscape(input.correlationCode)}</strong></p><p>Requested scopes: ${htmlEscape(input.scopes.join(" "))}</p><p>Approve or deny this request from the current-user CodexGPT CLI.</p><p id="status">Waiting for local approval...</p></main><script>const id=${JSON.stringify(input.pendingId)};const status=document.getElementById('status');async function poll(){try{const response=await fetch('/authorize/status/'+encodeURIComponent(id),{cache:'no-store',credentials:'same-origin'});if(!response.ok){status.textContent='Authorization is unavailable. Start a new connection.';return;}const body=await response.json();if(body.status==='pending'){setTimeout(poll,2500);return;}window.location.assign('/authorize/continue/'+encodeURIComponent(id));}catch{setTimeout(poll,2500);}}setTimeout(poll,2500);</script></body></html>`;
}

export class CodexOAuthProvider implements OAuthServerProvider {
  readonly clientsStore;
  readonly skipLocalPkceValidation = true;
  readonly #clients: OAuthClientStore;
  readonly #authorizations: AuthorizationStore;
  readonly #tokens: OAuthTokenService;
  readonly #identity: OAuthDeploymentIdentity;

  constructor(
    identity: OAuthDeploymentIdentity,
    clients: OAuthClientStore,
    authorizations: AuthorizationStore,
    tokens: OAuthTokenService
  ) {
    this.clientsStore = Object.freeze({ getClient: (clientId: string) => clients.getClient(clientId) });
    this.#clients = clients;
    this.#authorizations = authorizations;
    this.#tokens = tokens;
    this.#identity = Object.freeze({ ...identity });
  }

  async authorize(_client: OAuthClientInformationFull, _params: AuthorizationParams, res: Response): Promise<void> {
    const canonical = res.locals[AUTHORIZATION_LOCALS] as CanonicalAuthorizationRequest | undefined;
    if (!canonical) throw new OAuthProtocolError("invalid_request", "Canonical authorization input is unavailable.");
    let created;
    try {
      created = await this.#authorizations.create(canonical);
    } catch (error) {
      if (isAuditUnavailable(error)) {
        redirectError(
          res,
          canonical.redirectUri,
          this.#identity,
          new OAuthProtocolError(
            "temporarily_unavailable",
            "OAuth audit is unavailable. Run `codexgpt doctor` locally and retry.",
            503
          ),
          canonical.state
        );
        return;
      }
      throw error;
    }
    applyAuthorizationSecurityHeaders(res);
    res.setHeader(
      "Set-Cookie",
      `${OAUTH_BROWSER_COOKIE}=${created.browserBinding}; Path=/; Max-Age=300; Secure; HttpOnly; SameSite=Lax`
    );
    res.status(200).type("html").send(waitingPage({
      pendingId: created.pendingId,
      correlationCode: created.correlationCode,
      clientLabel: created.clientLabel,
      scopes: created.scopes
    }));
  }

  challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.#authorizations.challengeForAuthorizationCode(client.client_id, authorizationCode);
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    if (!codeVerifier || !redirectUri || !resource) throw new OAuthProtocolError("invalid_request", "Authorization code exchange is incomplete.");
    const challenge = pkceChallenge(codeVerifier);
    return await this.#authorizations.exchangeAuthorizationCode({
      clientId: client.client_id,
      authorizationCode,
      redirectUri,
      resource: resource.href,
      codeChallenge: challenge
    }, async (consumed) => await this.#tokens.exchangeAuthorizationCode({
      authorizationCode,
      clientId: consumed.clientId,
      resource: consumed.resource,
      scopes: consumed.scopes
    }));
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    if (!resource) throw new OAuthProtocolError("invalid_target", "The OAuth resource is required.");
    return await this.#tokens.exchangeRefreshToken({
      clientId: client.client_id,
      refreshToken,
      resource: resource.href,
      scopes: scopes === undefined ? undefined : normalizeRefreshScopes(scopes)
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return (await this.#tokens.verifyAccessToken(token)).authInfo;
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await this.#tokens.revoke({ token: request.token, clientId: client.client_id });
  }

  async approvedClient(clientId: string): Promise<OAuthClientInformationFull> {
    const record = this.#clients.getRecord(clientId);
    const client = await this.#clients.getClient(clientId);
    if (!record || record.status !== "approved" || !client) {
      throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
    }
    return client;
  }
}

function cookieBinding(req: Request): string | null {
  const raw = req.headers.cookie;
  if (typeof raw !== "string" || utf8Bytes(raw) > 4096) return null;
  const matches = raw.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${OAUTH_BROWSER_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(OAUTH_BROWSER_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function createAuthorizationStatusHandler(options: AuthorizationRouteOptions): RequestHandler {
  const deploymentLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.statusDeployment, { now: options.now });
  const bindingLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.statusBinding, { now: options.now });
  return async (req, res) => {
    applyAuthorizationSecurityHeaders(res);
    const binding = cookieBinding(req);
    const deploymentDecision = deploymentLimit.consume("deployment");
    const bindingDecision = bindingLimit.consume(binding ?? "invalid");
    if (!deploymentDecision.allowed || !bindingDecision.allowed) {
      rejectLimited(res, !deploymentDecision.allowed ? deploymentDecision : bindingDecision);
      return;
    }
    try {
      if (!binding) throw new OAuthProtocolError("invalid_request", "Authorization result is unavailable.", 404);
      const pendingId = Array.isArray(req.params.pendingId) ? "" : req.params.pendingId ?? "";
      const status = await options.authorizations.status(pendingId, binding);
      res.status(200).json({ status });
    } catch (error) {
      if (isAuditUnavailable(error)) {
        sendAuditUnavailable(res);
        return;
      }
      res.status(404).json(UNKNOWN_SAFE_ERROR);
    }
  };
}

export function createAuthorizationContinueHandler(options: AuthorizationRouteOptions): RequestHandler {
  const deploymentLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.continueDeployment, { now: options.now });
  const bindingLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.continueBinding, { now: options.now });
  return async (req, res) => {
    applyAuthorizationSecurityHeaders(res);
    const binding = cookieBinding(req);
    const deploymentDecision = deploymentLimit.consume("deployment");
    const bindingDecision = bindingLimit.consume(binding ?? "invalid");
    if (!deploymentDecision.allowed || !bindingDecision.allowed) {
      rejectLimited(res, !deploymentDecision.allowed ? deploymentDecision : bindingDecision);
      return;
    }
    try {
      if (!binding) throw new OAuthProtocolError("invalid_request", "Authorization result is unavailable.", 404);
      const pendingId = Array.isArray(req.params.pendingId) ? "" : req.params.pendingId ?? "";
      const result = await options.authorizations.continue(pendingId, binding);
      res.setHeader("Set-Cookie", result.clearCookie);
      res.redirect(302, result.location);
    } catch (error) {
      if (isAuditUnavailable(error)) {
        sendAuditUnavailable(res);
        return;
      }
      res.status(404).json(UNKNOWN_SAFE_ERROR);
    }
  };
}

export interface TokenRouteOptions {
  provider: CodexOAuthProvider;
  now?: () => number;
  diagnostics?: OAuthTokenEndpointDiagnostics;
}

const TOKEN_STANDARD_PARAMETERS = new Set([
  "grant_type",
  "client_id",
  "client_secret",
  "client_assertion",
  "client_assertion_type",
  "code",
  "code_verifier",
  "redirect_uri",
  "refresh_token",
  "scope",
  "resource",
  "state"
]);

const REVOKE_STANDARD_PARAMETERS = new Set([
  "token",
  "token_type_hint",
  "client_id",
  "client_secret",
  "client_assertion",
  "client_assertion_type"
]);

function applyMachineSecurityHeaders(res: Response): void {
  noStore(res);
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function parseMachineForm(req: Request): Readonly<Record<string, string>> {
  if (!exactContentType(req) || !Buffer.isBuffer(req.body)) {
    throw new OAuthProtocolError("invalid_request", "OAuth machine requests require application/x-www-form-urlencoded.");
  }
  if (req.headers.authorization !== undefined) {
    throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
  }
  return parseBoundedOAuthParameters(req.body.toString("utf8"));
}

function rejectForbiddenClientAuthentication(parameters: Readonly<Record<string, string>>): void {
  if (
    parameters.client_secret !== undefined ||
    parameters.client_assertion !== undefined ||
    parameters.client_assertion_type !== undefined
  ) {
    throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
  }
}

function requireClientId(parameters: Readonly<Record<string, string>>): string {
  const clientId = parameters.client_id;
  if (!clientId || !/^client_[A-Za-z0-9_-]{43}$/.test(clientId)) {
    throw new OAuthProtocolError("invalid_client", "The OAuth client is invalid.");
  }
  return clientId;
}

function requireExactResource(parameters: Readonly<Record<string, string>>, identity: OAuthDeploymentIdentity): URL {
  if (!parameters.resource || parameters.resource !== identity.resource) {
    throw new OAuthProtocolError("invalid_target", "The OAuth resource is invalid.");
  }
  return new URL(parameters.resource);
}

function rejectUnexpectedStandardParameters(
  parameters: Readonly<Record<string, string>>,
  allowed: ReadonlySet<string>,
  standard: ReadonlySet<string>
): void {
  for (const key of Object.keys(parameters)) {
    if (standard.has(key) && !allowed.has(key)) {
      throw new OAuthProtocolError("invalid_request", "OAuth request parameters are invalid.");
    }
  }
}

function protocolErrorShape(error: unknown): {
  oauthCode: string;
  statusCode: number;
  message: string;
} | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { oauthCode?: unknown; statusCode?: unknown; message?: unknown };
  if (
    typeof value.oauthCode !== "string" ||
    typeof value.statusCode !== "number" ||
    !Number.isInteger(value.statusCode) || value.statusCode < 400 || value.statusCode > 599 ||
    typeof value.message !== "string"
  ) {
    return null;
  }
  return { oauthCode: value.oauthCode, statusCode: value.statusCode, message: value.message };
}

function machineError(
  res: Response,
  error: unknown
): { status: number; reason: OAuthTokenDiagnosticReason } {
  applyMachineSecurityHeaders(res);
  const protocol = protocolErrorShape(error);
  if (protocol) {
    res.status(protocol.statusCode).json({ error: protocol.oauthCode, error_description: protocol.message });
    const reason = TOKEN_DIAGNOSTIC_ERROR_REASONS.has(protocol.oauthCode)
      ? protocol.oauthCode as OAuthTokenDiagnosticReason
      : "temporarily_unavailable";
    return { status: protocol.statusCode, reason };
  }
  res.status(503).json({ error: "temporarily_unavailable" });
  return { status: 503, reason: "temporarily_unavailable" };
}

export function createTokenEndpointHandler(
  identity: OAuthDeploymentIdentity,
  options: TokenRouteOptions
): RequestHandler {
  const deploymentLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.tokenDeployment, { now: options.now });
  const clientLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.tokenClient, { now: options.now });
  return async (req, res) => {
    applyMachineSecurityHeaders(res);
    let grantType: OAuthTokenDiagnosticGrantType = "unknown";
    const deploymentDecision = deploymentLimit.consume("deployment");
    if (!deploymentDecision.allowed) {
      res.setHeader("Retry-After", String(deploymentDecision.retryAfterSeconds));
      res.status(429).json({ error: "temporarily_unavailable" });
      options.diagnostics?.record({
        grantType,
        status: 429,
        reason: "token_deployment_limit"
      });
      return;
    }
    try {
      const parameters = parseMachineForm(req);
      grantType = parameters.grant_type === "authorization_code" ||
        parameters.grant_type === "refresh_token"
        ? parameters.grant_type
        : "unknown";
      rejectForbiddenClientAuthentication(parameters);
      const clientId = requireClientId(parameters);
      const clientDecision = clientLimit.consume(clientId);
      if (!clientDecision.allowed) {
        res.setHeader("Retry-After", String(clientDecision.retryAfterSeconds));
        res.status(429).json({ error: "temporarily_unavailable" });
        options.diagnostics?.record({
          grantType,
          status: 429,
          reason: "token_client_limit"
        });
        return;
      }
      const client = await options.provider.approvedClient(clientId);
      const resource = requireExactResource(parameters, identity);
      let tokens: OAuthTokens;
      if (parameters.grant_type === "authorization_code") {
        rejectUnexpectedStandardParameters(
          parameters,
          new Set(["grant_type", "client_id", "code", "code_verifier", "redirect_uri", "resource"]),
          TOKEN_STANDARD_PARAMETERS
        );
        if (
          !parameters.code || !/^[A-Za-z0-9_-]{43}$/.test(parameters.code) ||
          !parameters.code_verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(parameters.code_verifier) ||
          !parameters.redirect_uri || parameters.redirect_uri.length > 2048
        ) {
          throw new OAuthProtocolError("invalid_request", "Authorization code exchange parameters are invalid.");
        }
        tokens = await options.provider.exchangeAuthorizationCode(
          client,
          parameters.code,
          parameters.code_verifier,
          parameters.redirect_uri,
          resource
        );
      } else if (parameters.grant_type === "refresh_token") {
        rejectUnexpectedStandardParameters(
          parameters,
          new Set(["grant_type", "client_id", "refresh_token", "scope", "resource"]),
          TOKEN_STANDARD_PARAMETERS
        );
        if (!parameters.refresh_token || utf8Bytes(parameters.refresh_token) > 512) {
          throw new OAuthProtocolError("invalid_request", "Refresh token is invalid.");
        }
        const scopes = parameters.scope === undefined || parameters.scope === ""
          ? undefined
          : normalizeRefreshScopes(parameters.scope.split(" "));
        tokens = await options.provider.exchangeRefreshToken(
          client,
          parameters.refresh_token,
          scopes ? [...scopes] : undefined,
          resource
        );
      } else {
        throw new OAuthProtocolError("invalid_request", "The OAuth grant type is invalid.");
      }
      res.status(200).json(tokens);
      options.diagnostics?.record({ grantType, status: 200, reason: "success" });
    } catch (error) {
      const diagnostic = machineError(res, error);
      options.diagnostics?.record({ grantType, ...diagnostic });
    }
  };
}

export function createRevocationEndpointHandler(
  options: TokenRouteOptions
): RequestHandler {
  const deploymentLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.revokeDeployment, { now: options.now });
  const clientLimit = new FixedWindowRateLimiter(CORE_OAUTH_RATE_LIMITS.revokeClient, { now: options.now });
  return async (req, res) => {
    applyMachineSecurityHeaders(res);
    const deploymentDecision = deploymentLimit.consume("deployment");
    if (!deploymentDecision.allowed) {
      res.setHeader("Retry-After", String(deploymentDecision.retryAfterSeconds));
      res.status(429).json({ error: "temporarily_unavailable" });
      return;
    }
    try {
      const parameters = parseMachineForm(req);
      rejectForbiddenClientAuthentication(parameters);
      rejectUnexpectedStandardParameters(
        parameters,
        new Set(["token", "token_type_hint", "client_id"]),
        REVOKE_STANDARD_PARAMETERS
      );
      const clientId = requireClientId(parameters);
      const clientDecision = clientLimit.consume(clientId);
      if (!clientDecision.allowed) {
        res.setHeader("Retry-After", String(clientDecision.retryAfterSeconds));
        res.status(429).json({ error: "temporarily_unavailable" });
        return;
      }
      const client = await options.provider.approvedClient(clientId);
      if (!parameters.token || utf8Bytes(parameters.token) > 8192) {
        throw new OAuthProtocolError("invalid_request", "Revocation token is invalid.");
      }
      if (
        parameters.token_type_hint !== undefined &&
        parameters.token_type_hint !== "access_token" &&
        parameters.token_type_hint !== "refresh_token"
      ) {
        throw new OAuthProtocolError("invalid_request", "Revocation token type hint is invalid.");
      }
      await options.provider.revokeToken(client, {
        token: parameters.token,
        ...(parameters.token_type_hint ? { token_type_hint: parameters.token_type_hint } : {})
      });
      res.status(200).send("");
    } catch (error) {
      machineError(res, error);
    }
  };
}

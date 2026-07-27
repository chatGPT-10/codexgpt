import {
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";
import type { AuthStateAuditAppender, AuthStateAuditEvent } from "./stateStore.js";
import { authStateIntegrity } from "./stateStore.js";
import { OAuthProtocolError, authConfigurationError } from "./errors.js";
import { OAuthClientStore } from "./clientStore.js";
import type { OAuthDeploymentIdentity, OAuthScope } from "./types.js";

export const OAUTH_PENDING_LIFETIME_MS = 5 * 60 * 1000;
export const OAUTH_TERMINAL_LIFETIME_MS = 60 * 1000;
export const OAUTH_CODE_LIFETIME_MS = 60 * 1000;
export const OAUTH_PENDING_DEPLOYMENT_LIMIT = 32;
export const OAUTH_PENDING_CLIENT_LIMIT = 4;
export const OAUTH_BROWSER_COOKIE = "__Host-codexgpt_oauth";

export type PublicAuthorizationStatus = "pending" | "approved" | "denied" | "expired";

export interface CanonicalAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  resource: string;
  scopes: readonly OAuthScope[];
  codeChallenge: string;
}

export interface CreatedAuthorizationRequest {
  pendingId: string;
  browserBinding: string;
  correlationCode: string;
  expiresAt: string;
  clientLabel: string;
  scopes: readonly OAuthScope[];
}

export interface SafePendingAuthorization {
  pendingId: string;
  correlationCode: string;
  canonicalRoot: string;
  clientLabel: string;
  clientRef: string;
  redirectHost: string;
  redirectPath: string;
  scopes: readonly OAuthScope[];
  scopesMatchCurrentConfiguration: boolean;
  status: PublicAuthorizationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface AuthorizationContinueResult {
  location: string;
  clearCookie: string;
}

export interface ConsumedAuthorizationCode {
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: readonly OAuthScope[];
  codeChallenge: string;
}

interface PendingAuthorizationRecord {
  pendingId: string;
  browserBinding: string;
  correlationCode: string;
  clientId: string;
  clientRef: string;
  clientLabel: string;
  redirectUri: string;
  state: string;
  resource: string;
  scopes: readonly OAuthScope[];
  codeChallenge: string;
  status: PublicAuthorizationStatus;
  createdAtMs: number;
  expiresAtMs: number;
  decidedAtMs: number | null;
  terminalUntilMs: number | null;
}

interface AuthorizationCodeRecord {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: readonly OAuthScope[];
  codeChallenge: string;
  expiresAtMs: number;
  used: boolean;
}

export interface AuthorizationStoreOptions {
  identity: OAuthDeploymentIdentity;
  canonicalRoot: string;
  enabledScopes: readonly OAuthScope[];
  clients: OAuthClientStore;
  audit: AuthStateAuditAppender;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

function equalSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function safeError(message: string): OAuthProtocolError {
  return new OAuthProtocolError("invalid_request", message, 404);
}

function correlationCode(bytes: Buffer): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let index = 0; index < 8; index += 1) output += alphabet[bytes[index % bytes.length] % alphabet.length];
  return `${output.slice(0, 4)}-${output.slice(4)}`;
}

export class AuthorizationStore {
  readonly #identity: OAuthDeploymentIdentity;
  readonly #canonicalRoot: string;
  readonly #enabledScopes: readonly OAuthScope[];
  readonly #clients: OAuthClientStore;
  readonly #audit: AuthStateAuditAppender;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #codeHashKey: Buffer;
  readonly #pending = new Map<string, PendingAuthorizationRecord>();
  readonly #codes = new Map<string, AuthorizationCodeRecord>();
  #mutationTail: Promise<void> = Promise.resolve();

  constructor(options: AuthorizationStoreOptions) {
    this.#identity = Object.freeze({ ...options.identity });
    this.#canonicalRoot = options.canonicalRoot;
    this.#enabledScopes = Object.freeze([...options.enabledScopes]);
    this.#clients = options.clients;
    this.#audit = options.audit;
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#codeHashKey = this.#random(32);
  }

  async create(input: CanonicalAuthorizationRequest): Promise<CreatedAuthorizationRequest> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      const client = this.#clients.getRecord(input.clientId);
      if (!client || client.redirectUri !== input.redirectUri) {
        throw new OAuthProtocolError("invalid_client", "The OAuth client is unavailable.");
      }
      const active = [...this.#pending.values()];
      if (active.length >= OAUTH_PENDING_DEPLOYMENT_LIMIT || active.filter((entry) => entry.clientId === input.clientId).length >= OAUTH_PENDING_CLIENT_LIMIT) {
        throw new OAuthProtocolError(
          "temporarily_unavailable",
          "Authorization capacity is temporarily full.",
          503,
          "Wait for an existing authorization request to expire, then retry."
        );
      }
      const now = this.#now();
      const pendingId = `pending_${this.#random(16).toString("base64url")}`;
      const browserBinding = this.#random(32).toString("base64url");
      const code = correlationCode(this.#random(8));
      const redirect = new URL(input.redirectUri);
      const record: PendingAuthorizationRecord = {
        pendingId,
        browserBinding,
        correlationCode: code,
        clientId: input.clientId,
        clientRef: client.clientRef,
        clientLabel: client.clientName ?? "ChatGPT",
        redirectUri: input.redirectUri,
        state: input.state,
        resource: input.resource,
        scopes: Object.freeze([...input.scopes]),
        codeChallenge: input.codeChallenge,
        status: "pending",
        createdAtMs: now,
        expiresAtMs: now + OAUTH_PENDING_LIFETIME_MS,
        decidedAtMs: null,
        terminalUntilMs: null
      };
      await this.#appendAudit("authorization_requested", {
        pendingId,
        clientRef: client.clientRef,
        redirectHost: redirect.host,
        redirectPath: redirect.pathname,
        scopes: input.scopes
      });
      this.#pending.set(pendingId, record);
      return Object.freeze({
        pendingId,
        browserBinding,
        correlationCode: code,
        expiresAt: new Date(record.expiresAtMs).toISOString(),
        clientLabel: record.clientLabel,
        scopes: record.scopes
      });
    });
  }

  async status(pendingId: string, browserBinding: string): Promise<PublicAuthorizationStatus> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      const record = this.#requireBound(pendingId, browserBinding);
      return record.status;
    });
  }

  async listSafe(): Promise<SafePendingAuthorization[]> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      return this.snapshotSafe();
    });
  }

  snapshotSafe(): SafePendingAuthorization[] {
    const enabled = new Set(this.#enabledScopes);
    return [...this.#pending.values()]
      .sort((left, right) => left.createdAtMs - right.createdAtMs)
      .map((record) => {
        const redirect = new URL(record.redirectUri);
        return {
          pendingId: record.pendingId,
          correlationCode: record.correlationCode,
          canonicalRoot: this.#canonicalRoot,
          clientLabel: record.clientLabel,
          clientRef: record.clientRef,
          redirectHost: redirect.host,
          redirectPath: redirect.pathname,
          scopes: record.scopes,
          scopesMatchCurrentConfiguration: record.scopes.every((scope) => enabled.has(scope)),
          status: record.status,
          createdAt: new Date(record.createdAtMs).toISOString(),
          expiresAt: new Date(record.expiresAtMs).toISOString()
        };
      });
  }

  async approve(pendingId: string): Promise<boolean> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      const record = this.#pending.get(pendingId);
      if (!record) return false;
      if (record.status === "approved") return true;
      if (record.status !== "pending") return false;
      await this.#clients.markApproved(record.clientId);
      await this.#appendAudit("authorization_approved", {
        pendingId: record.pendingId,
        clientRef: record.clientRef,
        scopes: record.scopes
      });
      const now = this.#now();
      record.status = "approved";
      record.decidedAtMs = now;
      record.terminalUntilMs = now + OAUTH_TERMINAL_LIFETIME_MS;
      return true;
    });
  }

  async deny(pendingId: string): Promise<boolean> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      const record = this.#pending.get(pendingId);
      if (!record) return false;
      if (record.status === "denied") return true;
      if (record.status !== "pending") return false;
      await this.#appendAudit("authorization_denied", {
        pendingId: record.pendingId,
        clientRef: record.clientRef,
        scopes: record.scopes
      });
      const now = this.#now();
      record.status = "denied";
      record.decidedAtMs = now;
      record.terminalUntilMs = now + OAUTH_TERMINAL_LIFETIME_MS;
      return true;
    });
  }

  async continue(pendingId: string, browserBinding: string): Promise<AuthorizationContinueResult> {
    return await this.#mutate(async () => {
      await this.#expireInternal();
      const record = this.#requireBound(pendingId, browserBinding);
      if (record.status === "pending" || record.terminalUntilMs === null || record.terminalUntilMs <= this.#now()) {
        throw safeError("Authorization result is unavailable.");
      }
      const redirect = new URL(record.redirectUri);
      if (record.status === "approved") {
        const code = this.#random(32).toString("base64url");
        const codeHash = this.#hashCode(code);
        await this.#appendAudit("authorization_code_created", {
          pendingId: record.pendingId,
          clientRef: record.clientRef,
          scopes: record.scopes
        });
        this.#codes.set(codeHash, {
          codeHash,
          clientId: record.clientId,
          redirectUri: record.redirectUri,
          resource: record.resource,
          scopes: record.scopes,
          codeChallenge: record.codeChallenge,
          expiresAtMs: this.#now() + OAUTH_CODE_LIFETIME_MS,
          used: false
        });
        redirect.searchParams.set("code", code);
      } else if (record.status === "denied") {
        redirect.searchParams.set("error", "access_denied");
        redirect.searchParams.set("error_description", "The local owner denied this authorization request.");
      } else {
        redirect.searchParams.set("error", "temporarily_unavailable");
        redirect.searchParams.set("error_description", "The authorization request expired. Start a new connection.");
      }
      redirect.searchParams.set("state", record.state);
      redirect.searchParams.set("iss", this.#identity.issuer);
      this.#pending.delete(record.pendingId);
      return {
        location: redirect.href,
        clearCookie: `${OAUTH_BROWSER_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
      };
    });
  }

  async challengeForAuthorizationCode(clientId: string, authorizationCode: string): Promise<string> {
    return await this.#mutate(async () => {
      this.#expireCodes();
      const record = this.#codes.get(this.#hashCode(authorizationCode));
      if (!record || record.used || record.clientId !== clientId || record.expiresAtMs <= this.#now()) {
        throw new OAuthProtocolError("invalid_grant", "Authorization code is invalid.");
      }
      return record.codeChallenge;
    });
  }

  async consumeAuthorizationCode(input: {
    clientId: string;
    authorizationCode: string;
    redirectUri: string;
    resource: string;
    codeChallenge: string;
  }): Promise<ConsumedAuthorizationCode> {
    return await this.exchangeAuthorizationCode(input, async (consumed) => consumed);
  }

  async exchangeAuthorizationCode<T>(input: {
    clientId: string;
    authorizationCode: string;
    redirectUri: string;
    resource: string;
    codeChallenge: string;
  }, action: (consumed: ConsumedAuthorizationCode) => Promise<T>): Promise<T> {
    return await this.#mutate(async () => {
      this.#expireCodes();
      const codeHash = this.#hashCode(input.authorizationCode);
      const record = this.#codes.get(codeHash);
      if (
        !record || record.used || record.expiresAtMs <= this.#now() ||
        record.clientId !== input.clientId || record.redirectUri !== input.redirectUri ||
        record.resource !== input.resource || record.codeChallenge !== input.codeChallenge
      ) {
        throw new OAuthProtocolError("invalid_grant", "Authorization code is invalid.");
      }
      const consumed = Object.freeze({
        clientId: record.clientId,
        redirectUri: record.redirectUri,
        resource: record.resource,
        scopes: record.scopes,
        codeChallenge: record.codeChallenge
      });
      const result = await action(consumed);
      record.used = true;
      this.#codes.delete(codeHash);
      return result;
    });
  }

  pendingCount(): number {
    return this.#pending.size;
  }

  codeCount(): number {
    this.#expireCodes();
    return this.#codes.size;
  }

  async #expireInternal(): Promise<void> {
    const now = this.#now();
    for (const record of [...this.#pending.values()]) {
      if (record.status === "pending" && record.expiresAtMs <= now) {
        await this.#appendAudit("authorization_expired", {
          pendingId: record.pendingId,
          clientRef: record.clientRef,
          scopes: record.scopes
        });
        record.status = "expired";
        record.decidedAtMs = now;
        record.terminalUntilMs = now + OAUTH_TERMINAL_LIFETIME_MS;
      } else if (record.status !== "pending" && record.terminalUntilMs !== null && record.terminalUntilMs <= now) {
        this.#pending.delete(record.pendingId);
      }
    }
    this.#expireCodes();
  }

  #expireCodes(): void {
    const now = this.#now();
    for (const [hash, record] of this.#codes) {
      if (record.expiresAtMs <= now || record.used) this.#codes.delete(hash);
    }
  }

  #requireBound(pendingId: string, browserBinding: string): PendingAuthorizationRecord {
    if (!/^pending_[A-Za-z0-9_-]{22}$/.test(pendingId) || !/^[A-Za-z0-9_-]{43}$/.test(browserBinding)) {
      throw safeError("Authorization result is unavailable.");
    }
    const record = this.#pending.get(pendingId);
    if (!record || !equalSecret(record.browserBinding, browserBinding)) {
      throw safeError("Authorization result is unavailable.");
    }
    return record;
  }

  async #appendAudit(
    transition: Extract<AuthStateAuditEvent["transition"],
      | "authorization_requested"
      | "authorization_approved"
      | "authorization_denied"
      | "authorization_expired"
      | "authorization_code_created">,
    safeFacts: unknown
  ): Promise<void> {
    try {
      await this.#audit.append({
        transition,
        bindingId: this.#identity.bindingId,
        incarnationId: this.#identity.incarnationId,
        generation: this.#clients.generation(),
        stateDigest: authStateIntegrity({ transition, safeFacts })
      });
    } catch {
      throw authConfigurationError("OAUTH_AUDIT_FAILURE", "OAuth authorization transition could not be durably audited.");
    }
  }

  #hashCode(code: string): string {
    return createHmac("sha256", this.#codeHashKey).update(code, "utf8").digest("hex");
  }

  #random(size: number): Buffer {
    const value = this.#randomBytes(size);
    if (!Buffer.isBuffer(value) || value.length !== size) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth authorization random source is invalid.");
    }
    return value;
  }

  #mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#mutationTail.then(action, action);
    this.#mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

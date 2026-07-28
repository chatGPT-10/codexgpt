export interface FixedWindowLimit {
  windowMs: number;
  maximum: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export type OAuthTokenDiagnosticGrantType =
  | "authorization_code"
  | "refresh_token"
  | "unknown";

export type OAuthTokenDiagnosticReason =
  | "success"
  | "public_admission_limit"
  | "token_deployment_limit"
  | "token_client_limit"
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_scope"
  | "invalid_target"
  | "temporarily_unavailable";

export interface OAuthTokenDiagnosticInput {
  grantType: OAuthTokenDiagnosticGrantType;
  status: number;
  reason: OAuthTokenDiagnosticReason;
}

export interface OAuthTokenDiagnosticEntry extends OAuthTokenDiagnosticInput {
  endpoint: "/token";
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface OAuthTokenDiagnosticsSnapshot {
  startedAt: string;
  totalRequests: number;
  entries: OAuthTokenDiagnosticEntry[];
}

interface OAuthTokenDiagnosticCounter {
  input: OAuthTokenDiagnosticInput;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

const TOKEN_DIAGNOSTIC_GRANT_TYPES = new Set<OAuthTokenDiagnosticGrantType>([
  "authorization_code",
  "refresh_token",
  "unknown"
]);
const TOKEN_DIAGNOSTIC_REASONS = new Set<OAuthTokenDiagnosticReason>([
  "success",
  "public_admission_limit",
  "token_deployment_limit",
  "token_client_limit",
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "invalid_scope",
  "invalid_target",
  "temporarily_unavailable"
]);
const TOKEN_DIAGNOSTIC_STATUSES = new Set([200, 400, 429, 503]);
const TOKEN_DIAGNOSTIC_MAXIMUM_ENTRIES = 32;

export class OAuthTokenEndpointDiagnostics {
  readonly #now: () => number;
  readonly #startedAt: string;
  readonly #entries = new Map<string, OAuthTokenDiagnosticCounter>();
  #totalRequests = 0;

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#startedAt = new Date(this.#now()).toISOString();
  }

  record(input: OAuthTokenDiagnosticInput): void {
    const normalized: OAuthTokenDiagnosticInput = {
      grantType: TOKEN_DIAGNOSTIC_GRANT_TYPES.has(input.grantType)
        ? input.grantType
        : "unknown",
      status: TOKEN_DIAGNOSTIC_STATUSES.has(input.status) ? input.status : 503,
      reason: TOKEN_DIAGNOSTIC_REASONS.has(input.reason)
        ? input.reason
        : "temporarily_unavailable"
    };
    let key = `${normalized.grantType}:${normalized.status}:${normalized.reason}`;
    const overflowKey = "unknown:503:temporarily_unavailable";
    const reserveOverflowSlot =
      key !== overflowKey &&
      !this.#entries.has(overflowKey) &&
      this.#entries.size >= TOKEN_DIAGNOSTIC_MAXIMUM_ENTRIES - 1;
    if (
      !this.#entries.has(key) &&
      (this.#entries.size >= TOKEN_DIAGNOSTIC_MAXIMUM_ENTRIES || reserveOverflowSlot)
    ) {
      normalized.grantType = "unknown";
      normalized.status = 503;
      normalized.reason = "temporarily_unavailable";
      key = overflowKey;
    }
    const observedAt = new Date(this.#now()).toISOString();
    const existing = this.#entries.get(key);
    if (existing) {
      existing.count = Math.min(Number.MAX_SAFE_INTEGER, existing.count + 1);
      existing.lastSeenAt = observedAt;
    } else {
      this.#entries.set(key, {
        input: normalized,
        count: 1,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt
      });
    }
    this.#totalRequests = Math.min(Number.MAX_SAFE_INTEGER, this.#totalRequests + 1);
  }

  snapshot(): OAuthTokenDiagnosticsSnapshot {
    return {
      startedAt: this.#startedAt,
      totalRequests: this.#totalRequests,
      entries: [...this.#entries.values()].map((entry) => ({
        endpoint: "/token",
        ...entry.input,
        count: entry.count,
        firstSeenAt: entry.firstSeenAt,
        lastSeenAt: entry.lastSeenAt
      }))
    };
  }
}

interface Counter {
  windowStartedAt: number;
  count: number;
  lastSeenAt: number;
}

export class FixedWindowRateLimiter {
  readonly #limit: FixedWindowLimit;
  readonly #now: () => number;
  readonly #maximumKeys: number;
  readonly #counters = new Map<string, Counter>();

  constructor(
    limit: FixedWindowLimit,
    options: { now?: () => number; maximumKeys?: number } = {}
  ) {
    if (!Number.isInteger(limit.windowMs) || limit.windowMs < 1) {
      throw new Error("OAuth rate-limit window is invalid.");
    }
    if (!Number.isInteger(limit.maximum) || limit.maximum < 1) {
      throw new Error("OAuth rate-limit maximum is invalid.");
    }
    this.#limit = Object.freeze({ ...limit });
    this.#now = options.now ?? Date.now;
    this.#maximumKeys = options.maximumKeys ?? 256;
    if (!Number.isInteger(this.#maximumKeys) || this.#maximumKeys < 1) {
      throw new Error("OAuth rate-limit key capacity is invalid.");
    }
  }

  consume(key: string): RateLimitDecision {
    const now = this.#now();
    this.#prune(now);
    let counter = this.#counters.get(key);
    if (!counter || now - counter.windowStartedAt >= this.#limit.windowMs) {
      counter = { windowStartedAt: now, count: 0, lastSeenAt: now };
      this.#counters.set(key, counter);
    }
    counter.count += 1;
    counter.lastSeenAt = now;
    const remainingMs = Math.max(1, this.#limit.windowMs - (now - counter.windowStartedAt));
    return Object.freeze({
      allowed: counter.count <= this.#limit.maximum,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000))
    });
  }

  size(): number {
    return this.#counters.size;
  }

  #prune(now: number): void {
    for (const [key, counter] of this.#counters) {
      if (now - counter.windowStartedAt >= this.#limit.windowMs) this.#counters.delete(key);
    }
    if (this.#counters.size < this.#maximumKeys) return;
    const oldest = [...this.#counters.entries()]
      .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)
      .slice(0, Math.max(1, this.#counters.size - this.#maximumKeys + 1));
    for (const [key] of oldest) this.#counters.delete(key);
  }
}

export const CORE_OAUTH_RATE_LIMITS = Object.freeze({
  registration: Object.freeze({ windowMs: 60 * 60 * 1000, maximum: 20 }),
  authorizeDeployment: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 120 }),
  authorizeClient: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 20 }),
  statusBinding: Object.freeze({ windowMs: 5 * 60 * 1000, maximum: 180 }),
  statusDeployment: Object.freeze({ windowMs: 5 * 60 * 1000, maximum: 4096 }),
  continueBinding: Object.freeze({ windowMs: 5 * 60 * 1000, maximum: 4 }),
  continueDeployment: Object.freeze({ windowMs: 5 * 60 * 1000, maximum: 256 }),
  tokenDeployment: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 240 }),
  tokenClient: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 120 }),
  revokeDeployment: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 60 }),
  revokeClient: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 20 })
} as const);

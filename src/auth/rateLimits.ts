export interface FixedWindowLimit {
  windowMs: number;
  maximum: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
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
  tokenDeployment: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 120 }),
  tokenClient: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 30 }),
  revokeDeployment: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 60 }),
  revokeClient: Object.freeze({ windowMs: 15 * 60 * 1000, maximum: 20 })
} as const);

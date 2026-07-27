import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_BOOTSTRAP_TTL_MS = 2 * 60 * 1000;
const DEFAULT_IDLE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 4;

export const LOCAL_ADMIN_COOKIE_NAME = "codexgpt_admin" as const;

interface BootstrapRecord {
  digest: string;
  origin: string;
  expiresAt: number;
}

interface SessionRecord {
  cookieValue: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
}

export interface LocalAdminSessionManagerOptions {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  bootstrapTtlMs?: number;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  maxSessions?: number;
}

export interface LocalAdminBootstrap {
  token: string;
  url: string;
  expiresAt: string;
}

export interface LocalAdminSession {
  cookieValue: string;
  csrfToken: string;
  expiresAt: string;
}

function localAdminError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function boundedInteger(value: number, min: number, max: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw localAdminError(code, "Local admin session configuration is invalid.");
  }
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactLoopbackOrigin(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw localAdminError("AUTH_ADMIN_ORIGIN_INVALID", "Local admin origin is invalid.");
  }
  if (
    parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" ||
    !parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/"
  ) {
    throw localAdminError("AUTH_ADMIN_ORIGIN_INVALID", "Local admin origin must be exact HTTP loopback with an explicit port.");
  }
  return parsed.origin;
}

function equalToken(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class LocalAdminSessionManager {
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #bootstrapTtlMs: number;
  readonly #idleTtlMs: number;
  readonly #absoluteTtlMs: number;
  readonly #maxSessions: number;
  readonly #bootstraps = new Map<string, BootstrapRecord>();
  readonly #sessions = new Map<string, SessionRecord>();

  constructor(options: LocalAdminSessionManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#bootstrapTtlMs = boundedInteger(options.bootstrapTtlMs ?? DEFAULT_BOOTSTRAP_TTL_MS, 1_000, 15 * 60 * 1000, "AUTH_ADMIN_BOOTSTRAP_TTL_INVALID");
    this.#idleTtlMs = boundedInteger(options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS, 1_000, 60 * 60 * 1000, "AUTH_ADMIN_IDLE_TTL_INVALID");
    this.#absoluteTtlMs = boundedInteger(options.absoluteTtlMs ?? DEFAULT_ABSOLUTE_TTL_MS, this.#idleTtlMs, 24 * 60 * 60 * 1000, "AUTH_ADMIN_ABSOLUTE_TTL_INVALID");
    this.#maxSessions = boundedInteger(options.maxSessions ?? DEFAULT_MAX_SESSIONS, 1, 16, "AUTH_ADMIN_SESSION_CAPACITY_INVALID");
  }

  issueBootstrap(input: { origin: string }): LocalAdminBootstrap {
    this.#prune();
    const origin = exactLoopbackOrigin(input.origin);
    const token = this.#randomToken();
    const expiresAt = this.#now() + this.#bootstrapTtlMs;
    this.#bootstraps.set(digest(token), { digest: digest(token), origin, expiresAt });
    return Object.freeze({
      token,
      url: `${origin}/#bootstrap=${token}`,
      expiresAt: new Date(expiresAt).toISOString()
    });
  }

  exchangeBootstrap(token: string, origin: string): LocalAdminSession {
    this.#prune();
    const expectedOrigin = exactLoopbackOrigin(origin);
    if (!TOKEN_PATTERN.test(token)) {
      throw localAdminError("AUTH_ADMIN_BOOTSTRAP_INVALID", "Local admin bootstrap is invalid or expired.");
    }
    const key = digest(token);
    const record = this.#bootstraps.get(key);
    if (!record || record.expiresAt <= this.#now() || record.origin !== expectedOrigin) {
      this.#bootstraps.delete(key);
      throw localAdminError("AUTH_ADMIN_BOOTSTRAP_INVALID", "Local admin bootstrap is invalid or expired.");
    }
    if (this.#sessions.size >= this.#maxSessions) {
      throw localAdminError("AUTH_ADMIN_SESSION_CAPACITY", "Local admin session capacity is full.");
    }
    this.#bootstraps.delete(key);
    const cookieValue = this.#randomToken();
    const csrfToken = this.#randomToken();
    const now = this.#now();
    const absoluteExpiresAt = now + this.#absoluteTtlMs;
    this.#sessions.set(digest(cookieValue), {
      cookieValue,
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt
    });
    return Object.freeze({
      cookieValue,
      csrfToken,
      expiresAt: new Date(Math.min(absoluteExpiresAt, now + this.#idleTtlMs)).toISOString()
    });
  }

  validateSession(cookieValue: string): LocalAdminSession {
    this.#prune();
    if (!TOKEN_PATTERN.test(cookieValue)) {
      throw localAdminError("AUTH_ADMIN_SESSION_INVALID", "Local admin session is invalid.");
    }
    const key = digest(cookieValue);
    const record = this.#sessions.get(key);
    if (!record) {
      throw localAdminError("AUTH_ADMIN_SESSION_EXPIRED", "Local admin session has expired.");
    }
    const now = this.#now();
    if (record.absoluteExpiresAt <= now || record.lastSeenAt + this.#idleTtlMs <= now) {
      this.#sessions.delete(key);
      throw localAdminError("AUTH_ADMIN_SESSION_EXPIRED", "Local admin session has expired.");
    }
    record.lastSeenAt = now;
    return Object.freeze({
      cookieValue: record.cookieValue,
      csrfToken: record.csrfToken,
      expiresAt: new Date(Math.min(record.absoluteExpiresAt, now + this.#idleTtlMs)).toISOString()
    });
  }

  assertCsrf(cookieValue: string, csrfToken: string): void {
    const session = this.validateSession(cookieValue);
    if (!TOKEN_PATTERN.test(csrfToken) || !equalToken(session.csrfToken, csrfToken)) {
      throw localAdminError("AUTH_ADMIN_CSRF_INVALID", "Local admin CSRF token is invalid.");
    }
  }

  revoke(cookieValue: string): void {
    if (TOKEN_PATTERN.test(cookieValue)) this.#sessions.delete(digest(cookieValue));
  }

  sessionCount(): number {
    this.#prune();
    return this.#sessions.size;
  }

  #randomToken(): string {
    const value = this.#randomBytes(32);
    if (!Buffer.isBuffer(value) || value.length !== 32) {
      throw localAdminError("AUTH_ADMIN_RANDOM_INVALID", "Local admin random source is invalid.");
    }
    return value.toString("base64url");
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, bootstrap] of this.#bootstraps) {
      if (bootstrap.expiresAt <= now) this.#bootstraps.delete(key);
    }
    for (const [key, session] of this.#sessions) {
      if (session.absoluteExpiresAt <= now || session.lastSeenAt + this.#idleTtlMs <= now) {
        this.#sessions.delete(key);
      }
    }
  }
}

export function parseLocalAdminCookie(header: string | undefined): string {
  if (!header) return "";
  let value = "";
  let seen = false;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== LOCAL_ADMIN_COOKIE_NAME) continue;
    if (seen) return "";
    seen = true;
    value = rest.join("=");
  }
  return value;
}

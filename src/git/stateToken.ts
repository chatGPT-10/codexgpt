import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface GitStateTokenFacts {
  schemaVersion: 1;
  repositoryId: string;
  workspaceId: string;
  contextFingerprint: string;
  capabilityRevision: string;
  repositoryFingerprint: string;
  headDigest: string;
  indexDigest: string;
  worktreeDigest: string;
  ignoredDigest: string;
  attributesDigest: string;
  scopeDigest: string;
  resultDigest: string;
  complete: boolean;
}

interface StoredGitStateToken {
  facts: GitStateTokenFacts;
  issuedAt: number;
  expiresAt: number;
}

export interface GitStateTokenExpectation {
  repositoryId: string;
  workspaceId: string;
  contextFingerprint: string;
  capabilityRevision: string;
  repositoryFingerprint: string;
  headDigest: string;
  indexDigest: string;
  worktreeDigest: string;
  ignoredDigest: string;
  attributesDigest: string;
  scopeDigest: string;
  resultDigest: string;
}

function stateError(code: "GIT_STATE_INCOMPLETE" | "GIT_STATE_TOKEN_INVALID"): Error {
  return new Error(code);
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validateFacts(value: unknown): GitStateTokenFacts {
  const facts = value as Partial<GitStateTokenFacts>;
  if (
    !facts || typeof facts !== "object" || facts.schemaVersion !== 1 ||
    typeof facts.repositoryId !== "string" || !/^repo_[a-f0-9]{32}$/.test(facts.repositoryId) ||
    typeof facts.workspaceId !== "string" || facts.workspaceId.length < 1 || facts.workspaceId.length > 160 ||
    typeof facts.contextFingerprint !== "string" || facts.contextFingerprint.length < 1 || facts.contextFingerprint.length > 512 ||
    !validDigest(facts.capabilityRevision) || !validDigest(facts.repositoryFingerprint) ||
    !validDigest(facts.headDigest) || !validDigest(facts.indexDigest) || !validDigest(facts.worktreeDigest) ||
    !validDigest(facts.ignoredDigest) || !validDigest(facts.attributesDigest) ||
    !validDigest(facts.scopeDigest) || !validDigest(facts.resultDigest) ||
    typeof facts.complete !== "boolean"
  ) throw stateError("GIT_STATE_TOKEN_INVALID");
  return Object.freeze({ ...facts }) as GitStateTokenFacts;
}

export class GitStateTokenService {
  readonly #key: Buffer;
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #maxTokens: number;
  readonly #tokens = new Map<string, StoredGitStateToken>();
  #disposed = false;

  constructor(options: { key: Buffer; now?: () => number; ttlMs?: number; maxTokens?: number }) {
    if (!Buffer.isBuffer(options.key) || options.key.length < 32) throw stateError("GIT_STATE_TOKEN_INVALID");
    const ttlMs = options.ttlMs ?? 5 * 60_000;
    const maxTokens = options.maxTokens ?? 4096;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 30 * 60_000) throw stateError("GIT_STATE_TOKEN_INVALID");
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 65_536) throw stateError("GIT_STATE_TOKEN_INVALID");
    this.#key = Buffer.from(options.key);
    this.#now = options.now ?? Date.now;
    this.#ttlMs = ttlMs;
    this.#maxTokens = maxTokens;
  }

  mint(input: GitStateTokenFacts): string {
    this.#assertOpen();
    const facts = validateFacts(input);
    if (!facts.complete) throw stateError("GIT_STATE_INCOMPLETE");
    const now = this.#now();
    this.#prune(now);
    while (this.#tokens.size >= this.#maxTokens) {
      const oldest = this.#tokens.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#tokens.delete(oldest);
    }
    const nonce = randomBytes(32);
    const mac = createHmac("sha256", this.#key)
      .update("codexpro.git.state.v1\0")
      .update(nonce)
      .digest();
    const token = `gst_${Buffer.concat([nonce, mac]).toString("base64url")}`;
    this.#tokens.set(token, {
      facts,
      issuedAt: now,
      expiresAt: now + this.#ttlMs
    });
    return token;
  }

  verify(token: string, expected: GitStateTokenExpectation): GitStateTokenFacts {
    const facts = this.inspect(token);
    if (
      !facts.complete ||
      facts.repositoryId !== expected.repositoryId ||
      facts.workspaceId !== expected.workspaceId ||
      facts.contextFingerprint !== expected.contextFingerprint ||
      facts.capabilityRevision !== expected.capabilityRevision ||
      facts.repositoryFingerprint !== expected.repositoryFingerprint ||
      facts.headDigest !== expected.headDigest ||
      facts.indexDigest !== expected.indexDigest ||
      facts.worktreeDigest !== expected.worktreeDigest ||
      facts.ignoredDigest !== expected.ignoredDigest ||
      facts.attributesDigest !== expected.attributesDigest ||
      facts.scopeDigest !== expected.scopeDigest ||
      facts.resultDigest !== expected.resultDigest
    ) throw stateError("GIT_STATE_TOKEN_INVALID");
    return facts;
  }

  inspect(token: string): GitStateTokenFacts {
    this.#assertOpen();
    if (typeof token !== "string" || !/^gst_[A-Za-z0-9_-]+$/.test(token) || token.length > 256) {
      throw stateError("GIT_STATE_TOKEN_INVALID");
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(token.slice(4), "base64url");
    } catch {
      throw stateError("GIT_STATE_TOKEN_INVALID");
    }
    if (decoded.length !== 64 || decoded.toString("base64url") !== token.slice(4)) {
      throw stateError("GIT_STATE_TOKEN_INVALID");
    }
    const nonce = decoded.subarray(0, 32);
    const actualMac = decoded.subarray(32);
    const expectedMac = createHmac("sha256", this.#key)
      .update("codexpro.git.state.v1\0")
      .update(nonce)
      .digest();
    if (!timingSafeEqual(actualMac, expectedMac)) throw stateError("GIT_STATE_TOKEN_INVALID");
    const now = this.#now();
    this.#prune(now);
    const stored = this.#tokens.get(token);
    if (!stored || stored.expiresAt < now || stored.issuedAt > now) throw stateError("GIT_STATE_TOKEN_INVALID");
    return stored.facts;
  }

  revoke(token: string): void {
    this.#assertOpen();
    this.#tokens.delete(token);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#tokens.clear();
    this.#key.fill(0);
  }

  #prune(now: number): void {
    for (const [token, stored] of this.#tokens) {
      if (stored.expiresAt < now) this.#tokens.delete(token);
    }
  }

  #assertOpen(): void {
    if (this.#disposed) throw stateError("GIT_STATE_TOKEN_INVALID");
  }
}

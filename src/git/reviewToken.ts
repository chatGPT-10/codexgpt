import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gitMutationError } from "./mutationContext.js";
import { DurableOpaqueRecordStoreV4 } from "./opaqueRecordStore.js";

interface StoredReview<T> {
  kind: string;
  value: T;
  issuedAt: number;
  expiresAt: number;
}

export class GitReviewTokenServiceV4 {
  readonly #key: Buffer;
  readonly #records = new Map<string, StoredReview<unknown>>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(options: {
    key: Buffer;
    now?: () => number;
    ttlMs?: number;
    stateRoot?: string;
    masterKey?: Buffer;
    maxCiphertextCharacters?: number;
    maxPlaintextBytes?: number;
  }) {
    if (!Buffer.isBuffer(options.key) || options.key.length < 32) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    this.#key = Buffer.from(options.key);
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    this.#durable = options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "review-records",
          now: this.#now,
          maxCiphertextCharacters: options.maxCiphertextCharacters ?? 64_000_000,
          maxPlaintextBytes: options.maxPlaintextBytes ?? 48_000_000
        })
      : null;
  }

  mint<T>(kind: string, value: T): string {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(kind)) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const nonce = randomBytes(32);
    const mac = createHmac("sha256", this.#key).update("codexpro.git.review.v1\0").update(nonce).digest();
    const token = `review_${Buffer.concat([nonce, mac]).toString("base64url")}`;
    const now = this.#now();
    const stored = { kind, value, issuedAt: now, expiresAt: now + this.#ttlMs };
    if (this.#durable) {
      this.#durable.put({ recordId: token, kind, value: stored, expiresAt: stored.expiresAt });
    } else {
      this.#records.set(token, stored);
    }
    return token;
  }

  inspect<T>(token: string, kind: string): T {
    if (typeof token !== "string" || !/^review_[A-Za-z0-9_-]+$/.test(token)) {
      throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    }
    const decoded = Buffer.from(token.slice(7), "base64url");
    if (decoded.length !== 64 || decoded.toString("base64url") !== token.slice(7)) {
      throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    }
    const expected = createHmac("sha256", this.#key)
      .update("codexpro.git.review.v1\0")
      .update(decoded.subarray(0, 32))
      .digest();
    if (!timingSafeEqual(expected, decoded.subarray(32))) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const stored = this.#durable
      ? this.#durable.get<StoredReview<T>>(token, kind)
      : this.#records.get(token);
    const now = this.#now();
    if (!stored || stored.kind !== kind || stored.issuedAt > now || stored.expiresAt < now) {
      throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    }
    return stored.value as T;
  }

  consume<T>(token: string, kind: string): T {
    const value = this.inspect<T>(token, kind);
    if (this.#durable) this.#durable.consume<StoredReview<T>>(token, kind);
    else this.#records.delete(token);
    return value;
  }

  revoke(token: string): void {
    if (this.#durable) this.#durable.revoke(token);
    else this.#records.delete(token);
  }

  dispose(): void {
    this.#records.clear();
    this.#durable?.dispose();
    this.#key.fill(0);
  }
}

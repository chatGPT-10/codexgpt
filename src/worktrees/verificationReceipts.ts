import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DurableOpaqueRecordStoreV4 } from "../git/opaqueRecordStore.js";

export interface VerificationReceiptFactsV4 {
  taskWorktreeId: string;
  candidateOid: string;
  ownerFingerprint: string;
  policyRevision: string;
  capabilityRevision: string;
  commandDigest: string;
  terminalAuditEventId: string;
  issuedAt: string;
  expiresAt: string;
}

export class VerificationReceiptServiceV4 {
  readonly #records = new Map<string, VerificationReceiptFactsV4>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;

  constructor(
    private readonly key: Buffer,
    private readonly now: () => number = Date.now,
    options: { stateRoot?: string; masterKey?: Buffer } = {}
  ) {
    if (key.length < 32) throw new Error("VERIFICATION_RECEIPT_INVALID");
    this.#durable = options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "verification-receipts",
          now
        })
      : null;
  }

  issue(facts: VerificationReceiptFactsV4): string {
    if (
      !/^task_[a-f0-9]{32}$/u.test(facts.taskWorktreeId) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(facts.candidateOid) ||
      !/^event_[a-f0-9]{32}$/u.test(facts.terminalAuditEventId) ||
      Date.parse(facts.expiresAt) <= this.now()
    ) throw new Error("VERIFICATION_RECEIPT_INVALID");
    const nonce = randomBytes(32);
    const mac = createHmac("sha256", this.key)
      .update("codexpro.verification.v4\0")
      .update(nonce)
      .digest();
    const token = `verify_${Buffer.concat([nonce, mac]).toString("base64url")}`;
    if (this.#durable) {
      this.#durable.put({
        recordId: token,
        kind: "verification_receipt",
        value: facts,
        expiresAt: Date.parse(facts.expiresAt)
      });
    } else {
      this.#records.set(token, Object.freeze({ ...facts }));
    }
    return token;
  }

  verify(token: string, expected: Partial<VerificationReceiptFactsV4>): VerificationReceiptFactsV4 {
    if (!/^verify_[A-Za-z0-9_-]+$/u.test(token)) throw new Error("VERIFICATION_RECEIPT_INVALID");
    const bytes = Buffer.from(token.slice(7), "base64url");
    if (bytes.length !== 64) throw new Error("VERIFICATION_RECEIPT_INVALID");
    const mac = createHmac("sha256", this.key)
      .update("codexpro.verification.v4\0")
      .update(bytes.subarray(0, 32))
      .digest();
    if (!timingSafeEqual(mac, bytes.subarray(32))) throw new Error("VERIFICATION_RECEIPT_INVALID");
    const facts = this.#durable
      ? this.#durable.get<VerificationReceiptFactsV4>(token, "verification_receipt")
      : this.#records.get(token);
    if (!facts || Date.parse(facts.expiresAt) < this.now()) throw new Error("VERIFICATION_RECEIPT_INVALID");
    for (const [key, value] of Object.entries(expected)) {
      if (facts[key as keyof VerificationReceiptFactsV4] !== value) {
        throw new Error("VERIFICATION_RECEIPT_INVALID");
      }
    }
    return facts;
  }

  dispose(): void {
    this.#records.clear();
    this.#durable?.dispose();
    this.key.fill(0);
  }
}

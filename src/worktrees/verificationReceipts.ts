import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DurableOpaqueRecordStoreV4 } from "../git/opaqueRecordStore.js";

export interface VerificationReceiptFactsV4 {
  mergePlanId: string;
  category: string;
  repositoryId: string;
  repositoryIdentityFingerprint: string;
  taskWorktreeId: string;
  taskGeneration: number;
  candidateOid: string;
  candidateTreeOid: string;
  integrationWorkspaceId: string;
  workspaceRootIdentity: string;
  cleanStateDigest: string;
  ownerFingerprint: string;
  contextFingerprint: string;
  commandDigest: string;
  commandResourceFingerprint: string;
  backendId: string;
  backendVersion: string;
  executableIdentity: string;
  effectiveEnvironmentDigest: string;
  cwdIdentity: string;
  policyRevision: string;
  capabilityRevision: string;
  terminalAuditEventId: string;
  exitCode: 0;
  issuedAt: string;
  expiresAt: string;
}

export interface VerificationTerminalEvidenceV4 extends Omit<
  VerificationReceiptFactsV4,
  "issuedAt" | "exitCode"
> {
  exitCode: number;
}

export interface VerificationReceiptReservationV4 {
  facts: readonly VerificationReceiptFactsV4[];
  consume(): void;
  release(): void;
}

function receiptError(): Error {
  return new Error("VERIFICATION_RECEIPT_INVALID");
}

function digest(value: string): boolean {
  return /^(?:sha256:)?[a-f0-9]{64}$/u.test(value);
}

function validateFacts(facts: VerificationReceiptFactsV4, now: number): VerificationReceiptFactsV4 {
  if (
    !/^merge_[a-f0-9]{32}$/u.test(facts.mergePlanId) ||
    !/^[a-z][a-z0-9_-]{0,31}$/u.test(facts.category) ||
    !/^repo_[a-f0-9]{32}$/u.test(facts.repositoryId) ||
    !digest(facts.repositoryIdentityFingerprint) ||
    !/^task_[a-f0-9]{32}$/u.test(facts.taskWorktreeId) ||
    !Number.isSafeInteger(facts.taskGeneration) ||
    facts.taskGeneration < 1 ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(facts.candidateOid) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(facts.candidateTreeOid) ||
    !/^ws_[a-f0-9]{32}$/u.test(facts.integrationWorkspaceId) ||
    !digest(facts.workspaceRootIdentity) ||
    !digest(facts.cleanStateDigest) ||
    !digest(facts.ownerFingerprint) ||
    !digest(facts.contextFingerprint) ||
    !digest(facts.commandDigest) ||
    !digest(facts.commandResourceFingerprint) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(facts.backendId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(facts.backendVersion) ||
    !digest(facts.executableIdentity) ||
    !digest(facts.effectiveEnvironmentDigest) ||
    !digest(facts.cwdIdentity) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(facts.policyRevision) ||
    !digest(facts.capabilityRevision) ||
    !/^event_[a-f0-9]{32}$/u.test(facts.terminalAuditEventId) ||
    facts.exitCode !== 0 ||
    !Number.isFinite(Date.parse(facts.issuedAt)) ||
    !Number.isFinite(Date.parse(facts.expiresAt)) ||
    Date.parse(facts.issuedAt) > now ||
    Date.parse(facts.expiresAt) <= now ||
    Date.parse(facts.expiresAt) > now + 30 * 60_000
  ) throw receiptError();
  return Object.freeze({ ...facts });
}

export class VerificationReceiptServiceV4 {
  readonly #records = new Map<string, VerificationReceiptFactsV4>();
  readonly #reservations = new Map<string, string>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;

  constructor(
    private readonly key: Buffer,
    private readonly now: () => number = Date.now,
    options: { stateRoot?: string; masterKey?: Buffer } = {}
  ) {
    if (key.length < 32) throw receiptError();
    this.#durable = options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "verification-receipts",
          now
        })
      : null;
  }

  issueFromTerminalEvidence(evidence: VerificationTerminalEvidenceV4): string {
    const now = this.now();
    if (evidence.exitCode !== 0) throw receiptError();
    const facts = validateFacts({
      ...evidence,
      exitCode: 0,
      issuedAt: new Date(now).toISOString()
    }, now);
    if (this.#activeCount(now) >= 256) throw new Error("GIT_SCAN_LIMIT");
    const nonce = randomBytes(32);
    const mac = createHmac("sha256", this.key)
      .update("codexgpt.verification.v4\0")
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
      this.#records.set(token, facts);
    }
    return token;
  }

  verify(token: string, expected: Partial<VerificationReceiptFactsV4>): VerificationReceiptFactsV4 {
    this.#verifyTokenMac(token);
    const facts = this.#durable
      ? this.#durable.get<VerificationReceiptFactsV4>(token, "verification_receipt")
      : this.#records.get(token);
    if (!facts) throw receiptError();
    const validated = validateFacts(facts, this.now());
    for (const [key, value] of Object.entries(expected)) {
      if (validated[key as keyof VerificationReceiptFactsV4] !== value) throw receiptError();
    }
    return validated;
  }

  reserveForMerge(input: {
    tokens: readonly string[];
    expected: Partial<VerificationReceiptFactsV4>;
    requiredCategories: readonly string[];
  }): VerificationReceiptReservationV4 {
    if (
      input.tokens.length !== input.requiredCategories.length ||
      new Set(input.tokens).size !== input.tokens.length ||
      new Set(input.requiredCategories).size !== input.requiredCategories.length
    ) throw new Error("MERGE_CHECKS_REQUIRED");
    const required = [...input.requiredCategories].sort();
    const reservationId = randomBytes(16).toString("hex");
    const reserved: string[] = [];
    try {
      const facts = input.tokens.map((token) => {
        if (this.#reservations.has(token)) throw receiptError();
        const value = this.verify(token, input.expected);
        this.#reservations.set(token, reservationId);
        reserved.push(token);
        return value;
      });
      if (JSON.stringify(facts.map((item) => item.category).sort()) !== JSON.stringify(required)) {
        throw new Error("MERGE_CHECKS_REQUIRED");
      }
      let state: "active" | "consumed" | "released" = "active";
      return Object.freeze({
        facts: Object.freeze(facts),
        consume: () => {
          if (state !== "active") throw receiptError();
          for (const token of reserved) {
            if (this.#reservations.get(token) !== reservationId) throw receiptError();
          }
          for (const token of reserved) {
            if (this.#durable) this.#durable.consume<VerificationReceiptFactsV4>(token, "verification_receipt");
            else this.#records.delete(token);
            this.#reservations.delete(token);
          }
          state = "consumed";
        },
        release: () => {
          if (state !== "active") return;
          for (const token of reserved) {
            if (this.#reservations.get(token) === reservationId) this.#reservations.delete(token);
          }
          state = "released";
        }
      });
    } catch (error) {
      for (const token of reserved) {
        if (this.#reservations.get(token) === reservationId) this.#reservations.delete(token);
      }
      throw error;
    }
  }

  revokeForPlan(mergePlanId: string): void {
    if (!/^merge_[a-f0-9]{32}$/u.test(mergePlanId)) throw receiptError();
    if (this.#durable) {
      for (const item of this.#durable.list<VerificationReceiptFactsV4>(
        "verification_receipt",
        { includeExpired: true }
      )) {
        if (item.value.mergePlanId !== mergePlanId) continue;
        this.#reservations.delete(item.recordId);
        this.#durable.revoke(item.recordId);
      }
      return;
    }
    for (const [token, facts] of this.#records) {
      if (facts.mergePlanId !== mergePlanId) continue;
      this.#records.delete(token);
      this.#reservations.delete(token);
    }
  }

  dispose(): void {
    this.#records.clear();
    this.#reservations.clear();
    this.#durable?.dispose();
    this.key.fill(0);
  }

  #verifyTokenMac(token: string): void {
    if (!/^verify_[A-Za-z0-9_-]+$/u.test(token)) throw receiptError();
    const bytes = Buffer.from(token.slice(7), "base64url");
    if (bytes.length !== 64) throw receiptError();
    const mac = createHmac("sha256", this.key)
      .update("codexgpt.verification.v4\0")
      .update(bytes.subarray(0, 32))
      .digest();
    if (!timingSafeEqual(mac, bytes.subarray(32))) throw receiptError();
  }

  #activeCount(now: number): number {
    if (this.#durable) return this.#durable.list<VerificationReceiptFactsV4>("verification_receipt").length;
    for (const [token, facts] of this.#records) {
      if (Date.parse(facts.expiresAt) <= now) {
        this.#records.delete(token);
        this.#reservations.delete(token);
      }
    }
    return this.#records.size;
  }
}

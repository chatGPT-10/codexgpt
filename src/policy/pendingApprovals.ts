import { randomBytes as nodeRandomBytes } from "node:crypto";
import { riskLimits } from "./approval.js";
import type { AuthorizationFactsV3 } from "./authorizationFacts.js";

export type ApprovalLifecycleState =
  | "pending"
  | "prepared"
  | "granted"
  | "denied"
  | "expired"
  | "reserved"
  | "consumed"
  | "burned";

export interface ApprovalDisplaySummaryV3 {
  backend: string;
  actionKind: string;
  argumentCount: number;
  logicalScope: string;
  identityLabel: string;
  authoritySummary: string;
  digestPrefix: string;
  revealArguments?: string[];
}

export interface PendingApprovalV3 {
  schemaVersion: 3;
  contractVersion: 3;
  approvalId: string;
  state: ApprovalLifecycleState;
  facts: AuthorizationFactsV3;
  summary: ApprovalDisplaySummaryV3;
  createdAt: string;
  expiresAt: string;
  preparedAt: string | null;
  decidedAt: string | null;
  reservationId: string | null;
  grantId: string | null;
  terminalAt: string | null;
  transitionSequence: number;
}

export interface ApprovalTransitionV3 {
  approval: PendingApprovalV3;
  from: ApprovalLifecycleState | null;
  to: ApprovalLifecycleState;
  at: string;
  resultCode: string | null;
}

export interface PendingApprovalStoreOptions {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  maxServerPending?: number;
  maxSessionPending?: number;
  maxNewPerSessionPerMinute?: number;
  lifecycleSink?: (transition: ApprovalTransitionV3) => void | Promise<void>;
}

export class ApprovalQueueError extends Error {
  constructor(
    readonly code: "APPROVAL_QUEUE_FULL" | "APPROVAL_NOT_FOUND" | "APPROVAL_STATE_CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "ApprovalQueueError";
  }
}

const ACTIVE_STATES = new Set<ApprovalLifecycleState>(["pending", "prepared", "granted", "reserved"]);
const TERMINAL_STATES = new Set<ApprovalLifecycleState>(["denied", "expired", "consumed", "burned"]);

function timestamp(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) throw new Error("Approval timestamp is invalid.");
  return new Date(milliseconds).toISOString();
}

function safeText(name: string, value: string, maximum = 160): string {
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} is not safe for approval display.`);
  }
  return value;
}

function normalizeSummary(summary: ApprovalDisplaySummaryV3): ApprovalDisplaySummaryV3 {
  if (!Number.isSafeInteger(summary.argumentCount) || summary.argumentCount < 0 || summary.argumentCount > 100_000) {
    throw new Error("Approval argument count is invalid.");
  }
  if (!/^[a-f0-9]{8,32}$/.test(summary.digestPrefix)) throw new Error("Approval digest prefix is invalid.");
  const revealInput = summary.revealArguments ?? [];
  if (!Array.isArray(revealInput) || revealInput.length > 32) {
    throw new Error("Approval reveal arguments are invalid.");
  }
  const revealArguments = revealInput.map((value) => {
    if (typeof value !== "string" || value.length > 4096) throw new Error("Approval reveal argument is invalid.");
    return value;
  });
  return Object.freeze({
    backend: safeText("backend", summary.backend, 80),
    actionKind: safeText("actionKind", summary.actionKind, 80),
    argumentCount: summary.argumentCount,
    logicalScope: safeText("logicalScope", summary.logicalScope, 160),
    identityLabel: safeText("identityLabel", summary.identityLabel, 120),
    authoritySummary: safeText("authoritySummary", summary.authoritySummary, 200),
    digestPrefix: summary.digestPrefix,
    revealArguments: Object.freeze(revealArguments) as unknown as string[]
  });
}

export class PendingApprovalStore {
  readonly #records = new Map<string, PendingApprovalV3>();
  readonly #dedupe = new Map<string, string>();
  readonly #newRequestTimes = new Map<string, number[]>();
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #maxServerPending: number;
  readonly #maxSessionPending: number;
  readonly #maxNewPerSessionPerMinute: number;
  readonly #lifecycleSink?: PendingApprovalStoreOptions["lifecycleSink"];
  #tail: Promise<void> = Promise.resolve();
  #sequence = 0;

  constructor(options: PendingApprovalStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#maxServerPending = options.maxServerPending ?? 32;
    this.#maxSessionPending = options.maxSessionPending ?? 8;
    this.#maxNewPerSessionPerMinute = options.maxNewPerSessionPerMinute ?? 10;
  this.#lifecycleSink = options.lifecycleSink;
  }

  size(): number {
    return this.#records.size;
  }

  snapshot(): PendingApprovalV3[] {
    return [...this.#records.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.approvalId.localeCompare(right.approvalId))
      .map((record) => structuredClone(record));
  }

  get(approvalId: string): PendingApprovalV3 | null {
    const record = this.#records.get(approvalId);
    return record ? structuredClone(record) : null;
  }

  getByGrantId(grantId: string): PendingApprovalV3 | null {
    const record = [...this.#records.values()].find((candidate) => candidate.grantId === grantId);
    return record ? structuredClone(record) : null;
  }

  expire(at?: string): Promise<number> {
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      const before = [...this.#records.values()].filter((record) => ACTIVE_STATES.has(record.state)).length;
      await this.#expire(nowMs);
      const after = [...this.#records.values()].filter((record) => ACTIVE_STATES.has(record.state)).length;
      return before - after;
    });
  }

  request(input: {
    facts: AuthorizationFactsV3;
    summary: ApprovalDisplaySummaryV3;
    createdAt?: string;
  }): Promise<{ approval: PendingApprovalV3; deduplicated: boolean }> {
    return this.#serialized(async () => {
      const createdMs = input.createdAt === undefined ? this.#now() : Date.parse(input.createdAt);
      if (!Number.isFinite(createdMs)) throw new Error("Approval creation time is invalid.");
      await this.#expire(createdMs);
      const existingId = this.#dedupe.get(input.facts.bindingFingerprint);
      const existing = existingId ? this.#records.get(existingId) : undefined;
      if (existing && ACTIVE_STATES.has(existing.state) && Date.parse(existing.expiresAt) > createdMs) {
        return { approval: structuredClone(existing), deduplicated: true };
      }

      this.#enforceLimits(input.facts.transportSessionId, createdMs);
      const random = this.#randomBytes(16);
      if (!Buffer.isBuffer(random) || random.length !== 16) throw new Error("Approval random source returned an invalid value.");
      const limits = riskLimits(input.facts.riskClass);
      this.#sequence += 1;
      const approval: PendingApprovalV3 = Object.freeze({
        schemaVersion: 3,
        contractVersion: 3,
        approvalId: `approval_${random.toString("hex")}`,
        state: "pending",
        facts: structuredClone(input.facts),
        summary: normalizeSummary(input.summary),
        createdAt: timestamp(createdMs),
        expiresAt: timestamp(createdMs + limits.maxTtlMs),
        preparedAt: null,
        decidedAt: null,
        reservationId: null,
        grantId: null,
        terminalAt: null,
        transitionSequence: this.#sequence
      });
      await this.#persist({ approval, from: null, to: "pending", at: approval.createdAt, resultCode: null });
      this.#records.set(approval.approvalId, approval);
      this.#dedupe.set(approval.facts.bindingFingerprint, approval.approvalId);
      const times = this.#newRequestTimes.get(approval.facts.transportSessionId) ?? [];
      times.push(createdMs);
      this.#newRequestTimes.set(approval.facts.transportSessionId, times);
      return { approval: structuredClone(approval), deduplicated: false };
    });
  }

  prepare(approvalId: string, at?: string): Promise<PendingApprovalV3> {
    return this.#transitionDecision(approvalId, "prepared", at, null);
  }

  approve(approvalId: string, grantId: string, at?: string): Promise<PendingApprovalV3> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(grantId)) throw new Error("Grant ID is invalid.");
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      await this.#expire(nowMs);
      const current = this.#required(approvalId);
      if (current.state === "granted" || current.state === "reserved" || current.state === "consumed" || current.state === "burned") {
        return structuredClone(current);
      }
      if (current.state === "denied" || current.state === "expired") {
        throw new ApprovalQueueError("APPROVAL_STATE_CONFLICT", "A terminal approval cannot be granted.");
      }
      return this.#apply(current, "granted", nowMs, {
        grantId,
        decidedAt: timestamp(nowMs)
      }, null);
    });
  }

  deny(approvalId: string, at?: string): Promise<PendingApprovalV3> {
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      await this.#expire(nowMs);
      const current = this.#required(approvalId);
      if (current.state === "denied") return structuredClone(current);
      if (current.state === "granted" || current.state === "reserved" || current.state === "consumed" || current.state === "burned") {
        throw new ApprovalQueueError("APPROVAL_STATE_CONFLICT", "A granted approval cannot be denied.");
      }
      if (current.state === "expired") return structuredClone(current);
      return this.#apply(current, "denied", nowMs, {
        decidedAt: timestamp(nowMs),
        terminalAt: timestamp(nowMs)
      }, "DENIED");
    });
  }

  markReserved(grantId: string, reservationId: string, at?: string): Promise<PendingApprovalV3 | null> {
    return this.#markGrantTransition(grantId, "reserved", reservationId, at, null);
  }

  markConsumed(grantId: string, reservationId: string, at?: string): Promise<PendingApprovalV3 | null> {
    return this.#markGrantTransition(grantId, "consumed", reservationId, at, "CONSUMED");
  }

  markBurned(grantId: string, reservationId: string, at?: string, resultCode = "BURNED"): Promise<PendingApprovalV3 | null> {
    return this.#markGrantTransition(grantId, "burned", reservationId, at, resultCode);
  }

  revokeTransportSession(transportSessionId: string, at?: string): Promise<number> {
    return this.#revokeWhere((record) => record.facts.transportSessionId === transportSessionId, at, "TRANSPORT_REVOKED");
  }

  revokePolicyRevision(activeRevision: string, at?: string): Promise<number> {
    return this.#revokeWhere((record) => record.facts.policyRevision !== activeRevision, at, "POLICY_REVOKED");
  }

  revokeEvidenceRevision(activeRevision: string, at?: string): Promise<number> {
    return this.#revokeWhere((record) => record.facts.evidenceRevision !== activeRevision, at, "EVIDENCE_REVOKED");
  }

  closeServer(serverId: string, at?: string): Promise<number> {
    return this.#revokeWhere((record) => record.facts.serverId === serverId, at, "SERVER_CLOSED");
  }

  async #transitionDecision(approvalId: string, target: "prepared", at: string | undefined, resultCode: string | null): Promise<PendingApprovalV3> {
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      await this.#expire(nowMs);
      const current = this.#required(approvalId);
      if (current.state === target) return structuredClone(current);
      if (current.state !== "pending") throw new ApprovalQueueError("APPROVAL_STATE_CONFLICT", "Approval cannot be prepared from its current state.");
      return this.#apply(current, target, nowMs, { preparedAt: timestamp(nowMs) }, resultCode);
    });
  }

  async #markGrantTransition(
    grantId: string,
    target: "reserved" | "consumed" | "burned",
    reservationId: string,
    at: string | undefined,
    resultCode: string | null
  ): Promise<PendingApprovalV3 | null> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(reservationId)) throw new Error("Reservation ID is invalid.");
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      const current = [...this.#records.values()].find((record) => record.grantId === grantId);
      if (!current) return null;
      if (current.state === target && current.reservationId === reservationId) return structuredClone(current);
      if (target === "reserved" && current.state !== "granted") {
        throw new ApprovalQueueError("APPROVAL_STATE_CONFLICT", "Grant cannot be reserved from its current state.");
      }
      if ((target === "consumed" || target === "burned") && (current.state !== "reserved" || current.reservationId !== reservationId)) {
        throw new ApprovalQueueError("APPROVAL_STATE_CONFLICT", "Reservation does not match the approval state.");
      }
      return this.#apply(current, target, nowMs, {
        reservationId,
        terminalAt: target === "consumed" || target === "burned" ? timestamp(nowMs) : null
      }, resultCode);
    });
  }

  async #revokeWhere(predicate: (record: PendingApprovalV3) => boolean, at: string | undefined, resultCode: string): Promise<number> {
    return this.#serialized(async () => {
      const nowMs = at === undefined ? this.#now() : Date.parse(at);
      let count = 0;
      for (const current of [...this.#records.values()]) {
        if (!predicate(current) || !ACTIVE_STATES.has(current.state)) continue;
        const target = current.state === "reserved" ? "burned" : "expired";
        await this.#apply(current, target, nowMs, { terminalAt: timestamp(nowMs) }, resultCode);
        count += 1;
      }
      return count;
    });
  }

  #enforceLimits(sessionId: string, nowMs: number): void {
    const active = [...this.#records.values()].filter((record) => ACTIVE_STATES.has(record.state) && Date.parse(record.expiresAt) > nowMs);
    if (active.length >= this.#maxServerPending) throw new ApprovalQueueError("APPROVAL_QUEUE_FULL", "Server approval queue is full.");
    if (active.filter((record) => record.facts.transportSessionId === sessionId).length >= this.#maxSessionPending) {
      throw new ApprovalQueueError("APPROVAL_QUEUE_FULL", "Session approval queue is full.");
    }
    const cutoff = nowMs - 60_000;
    const times = (this.#newRequestTimes.get(sessionId) ?? []).filter((value) => value > cutoff);
    this.#newRequestTimes.set(sessionId, times);
    if (times.length >= this.#maxNewPerSessionPerMinute) {
      throw new ApprovalQueueError("APPROVAL_QUEUE_FULL", "Session approval request rate is exceeded.");
    }
  }

  #required(approvalId: string): PendingApprovalV3 {
    const current = this.#records.get(approvalId);
    if (!current) throw new ApprovalQueueError("APPROVAL_NOT_FOUND", "Approval was not found.");
    return current;
  }

  async #apply(
    current: PendingApprovalV3,
    target: ApprovalLifecycleState,
    nowMs: number,
    patch: Partial<PendingApprovalV3>,
    resultCode: string | null
  ): Promise<PendingApprovalV3> {
    if (!Number.isFinite(nowMs)) throw new Error("Approval transition time is invalid.");
    this.#sequence += 1;
    const next: PendingApprovalV3 = Object.freeze({
      ...current,
      ...patch,
      state: target,
      transitionSequence: this.#sequence
    });
    await this.#persist({ approval: next, from: current.state, to: target, at: timestamp(nowMs), resultCode });
    this.#records.set(next.approvalId, next);
    if (TERMINAL_STATES.has(target)) this.#dedupe.delete(next.facts.bindingFingerprint);
    return structuredClone(next);
  }

  async #expire(nowMs: number): Promise<void> {
    if (!Number.isFinite(nowMs)) throw new Error("Approval expiry time is invalid.");
    for (const current of [...this.#records.values()]) {
      if (!ACTIVE_STATES.has(current.state) || Date.parse(current.expiresAt) > nowMs) continue;
      const target = current.state === "reserved" ? "burned" : "expired";
      await this.#apply(current, target, nowMs, { terminalAt: timestamp(nowMs) }, "EXPIRED");
    }
  }

  async #persist(transition: ApprovalTransitionV3): Promise<void> {
    await this.#lifecycleSink?.(structuredClone(transition));
  }

  #serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(action, action);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import {
  credentialRevisionForCredentialRef,
  credentialRevisionForIdentity
} from "../auth/policyIdentity.js";
import { sessionGrantV1Schema } from "./schemas.js";
import type {
  RequestContextV1,
  ResourceDescriptorV1,
  RiskClass,
  SessionGrantV1
} from "./types.js";

export interface ApprovalLimits {
  maxTtlMs: number;
  uses: number | null;
}

const RISK_LIMITS: Readonly<Record<"R1" | "R2" | "R3", ApprovalLimits>> = Object.freeze({
  R1: Object.freeze({ maxTtlMs: 30 * 60_000, uses: null }),
  R2: Object.freeze({ maxTtlMs: 5 * 60_000, uses: null }),
  R3: Object.freeze({ maxTtlMs: 2 * 60_000, uses: 1 })
});

export function riskLimits(riskClass: RiskClass): ApprovalLimits {
  if (riskClass === "R0" || riskClass === "R4") {
    throw new Error(`${riskClass} is unapprovable.`);
  }
  return { ...RISK_LIMITS[riskClass] };
}

export interface ApprovalRequestV1 {
  schemaVersion: 1;
  approvalId: string;
  credentialRef: string | null;
  credentialRevision: string;
  transportSessionId: string;
  workspaceId: string | null;
  policyRevision: string;
  toolContractVersion: string;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  riskClass: "R1" | "R2" | "R3";
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
}

export interface CreateApprovalRequestInput {
  context: RequestContextV1;
  resource: ResourceDescriptorV1;
  riskClass: RiskClass;
  inputDigest: string;
  toolContractVersion: string;
  createdAt: string;
}

function operationFor(resource: ResourceDescriptorV1): string {
  return `${resource.kind}.${resource.operation}`;
}

function safeHash(prefix: string, value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequestV1 {
  const limits = riskLimits(input.riskClass);
  const riskClass = input.riskClass as "R1" | "R2" | "R3";
  const createdMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdMs)) throw new Error("Approval creation time is invalid.");
  const facts = {
    credentialRef: input.context.identity.credentialRef,
    credentialRevision: credentialRevisionForIdentity(input.context.identity),
    transportSessionId: input.context.transportSessionId,
    workspaceId: input.context.workspaceId,
    policyRevision: input.context.policyRevision,
    toolContractVersion: input.toolContractVersion,
    operation: operationFor(input.resource),
    resourceFingerprint: input.resource.resourceFingerprint,
    inputDigest: input.inputDigest,
    riskClass,
    createdAt: new Date(createdMs).toISOString()
  };
  return Object.freeze({
    schemaVersion: 1,
    approvalId: safeHash("approval", facts),
    ...facts,
    expiresAt: new Date(createdMs + limits.maxTtlMs).toISOString(),
    maxUses: limits.uses
  });
}

export interface IssueGrantInput {
  context: RequestContextV1;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  riskClass: RiskClass;
  toolContractVersion: string;
  issuedAt: string;
  expiresAt: string;
  usesRemaining?: number | null;
}

export interface MatchGrantInput {
  context: RequestContextV1;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  riskClass: RiskClass;
  toolContractVersion: string;
  now: string;
}

export interface GrantReservationV3 {
  schemaVersion: 3;
  contractVersion: 3;
  reservationId: string;
  grantId: string;
  grant: SessionGrantV1;
  reservedAt: string;
  expiresAt: string;
}

export interface SessionGrantStoreOptions {
  randomBytes?: (size: number) => Buffer;
}

export class SessionGrantStore {
  readonly #grants = new Map<string, SessionGrantV1>();
  readonly #reservations = new Map<string, GrantReservationV3>();
  readonly #reservedGrantIds = new Map<string, string>();
  readonly #terminalReservations = new Map<string, "consumed" | "burned">();
  readonly #randomBytes: (size: number) => Buffer;
  #revision = 0;
  #sequence = 0;

  constructor(options: SessionGrantStoreOptions = {}) {
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  revision(): string {
    return `grant-revision-${this.#revision}`;
  }

  size(): number {
    return this.#grants.size;
  }

  reservationCount(): number {
    return this.#reservations.size;
  }

  snapshot(): SessionGrantV1[] {
    return [...this.#grants.values()]
      .filter((grant) => !this.#reservedGrantIds.has(grant.grantId))
      .map((grant) => structuredClone(grant));
  }

  reservationSnapshot(): GrantReservationV3[] {
    return [...this.#reservations.values()].map((reservation) => structuredClone(reservation));
  }

  issue(input: IssueGrantInput): SessionGrantV1 {
    const limits = riskLimits(input.riskClass);
    const riskClass = input.riskClass as "R1" | "R2" | "R3";
    const issuedMs = Date.parse(input.issuedAt);
    const expiresMs = Date.parse(input.expiresAt);
    if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs <= issuedMs || expiresMs - issuedMs > limits.maxTtlMs) {
      throw new Error("Grant expiry exceeds the risk-class ceiling.");
    }
    const usesRemaining = input.usesRemaining === undefined ? limits.uses : input.usesRemaining;
    if (riskClass === "R3" && usesRemaining !== 1) {
      throw new Error("R3 grants are exactly one-use.");
    }
    if (usesRemaining !== null && (!Number.isInteger(usesRemaining) || usesRemaining < 1)) {
      throw new Error("Grant uses must be a positive integer or null.");
    }

    this.#sequence += 1;
    const binding = {
      credentialRef: input.context.identity.credentialRef,
      credentialRevision: credentialRevisionForIdentity(input.context.identity),
      transportSessionId: input.context.transportSessionId,
      workspaceId: input.context.workspaceId,
      policyRevision: input.context.policyRevision,
      toolContractVersion: input.toolContractVersion,
      operation: input.operation,
      resourceFingerprint: input.resourceFingerprint,
      inputDigest: input.inputDigest,
      riskClass,
      issuedAt: new Date(issuedMs).toISOString(),
      sequence: this.#sequence
    };
    const grant = sessionGrantV1Schema.parse({
      schemaVersion: 1,
      grantId: safeHash("grant", binding),
      credentialRef: binding.credentialRef,
      credentialRevision: binding.credentialRevision,
      transportSessionId: binding.transportSessionId,
      workspaceId: binding.workspaceId,
      policyRevision: binding.policyRevision,
      toolContractVersion: binding.toolContractVersion,
      operation: binding.operation,
      resourceFingerprint: binding.resourceFingerprint,
      inputDigest: binding.inputDigest,
      riskClass,
      issuedAt: binding.issuedAt,
      expiresAt: new Date(expiresMs).toISOString(),
      usesRemaining
    });
    this.#grants.set(grant.grantId, grant);
    this.#revision += 1;
    return structuredClone(grant);
  }

  findMatching(input: MatchGrantInput): SessionGrantV1 | null {
    const now = this.#validatedMatchTime(input);
    this.#removeExpired(now);
    for (const grant of this.#grants.values()) {
      if (this.#reservedGrantIds.has(grant.grantId)) continue;
      if (this.#matches(input, grant, now)) return structuredClone(grant);
    }
    return null;
  }

  reserveMatching(input: MatchGrantInput): GrantReservationV3 | null {
    const now = this.#validatedMatchTime(input);
    this.#removeExpired(now);
    for (const grant of this.#grants.values()) {
      if (this.#reservedGrantIds.has(grant.grantId) || !this.#matches(input, grant, now)) continue;
      const random = this.#randomBytes(16);
      if (!Buffer.isBuffer(random) || random.length !== 16) throw new Error("Grant reservation random source returned an invalid value.");
      const reservation: GrantReservationV3 = Object.freeze({
        schemaVersion: 3,
        contractVersion: 3,
        reservationId: `reservation_${random.toString("hex")}`,
        grantId: grant.grantId,
        grant: structuredClone(grant),
        reservedAt: new Date(now).toISOString(),
        expiresAt: grant.expiresAt
      });
      if (this.#reservations.has(reservation.reservationId)) throw new Error("Grant reservation identity collision.");
      this.#reservations.set(reservation.reservationId, reservation);
      this.#reservedGrantIds.set(grant.grantId, reservation.reservationId);
      this.#revision += 1;
      return structuredClone(reservation);
    }
    return null;
  }

  commitConsume(reservationId: string): boolean {
    return this.#finalizeReservation(reservationId, "consumed");
  }

  burnReservation(reservationId: string): boolean {
    return this.#finalizeReservation(reservationId, "burned");
  }

  reservationResult(reservationId: string): "active" | "consumed" | "burned" | null {
    if (this.#reservations.has(reservationId)) return "active";
    return this.#terminalReservations.get(reservationId) ?? null;
  }

  consume(grantId: string): void {
    if (this.#reservedGrantIds.has(grantId)) return;
    const grant = this.#grants.get(grantId);
    if (!grant || grant.usesRemaining === null) return;
    this.#consumeGrant(grant);
    this.#revision += 1;
  }

  revokeGrant(grantId: string): void {
    this.#deleteWhere((grant) => grant.grantId === grantId);
  }

  revokeTransportSession(transportSessionId: string): void {
    this.#deleteWhere((grant) => grant.transportSessionId === transportSessionId);
  }

  revokeForActivePolicyRevision(activePolicyRevision: string): void {
    this.#deleteWhere((grant) => grant.policyRevision !== activePolicyRevision);
  }

  clear(): void {
    if (this.#grants.size === 0 && this.#reservations.size === 0) return;
    for (const reservationId of this.#reservations.keys()) this.#terminalReservations.set(reservationId, "burned");
    this.#grants.clear();
    this.#reservations.clear();
    this.#reservedGrantIds.clear();
    this.#revision += 1;
  }

  #validatedMatchTime(input: MatchGrantInput): number {
    if (input.riskClass === "R0" || input.riskClass === "R4") return Number.NaN;
    const now = Date.parse(input.now);
    if (!Number.isFinite(now)) throw new Error("Grant match time is invalid.");
    return now;
  }

  #matches(input: MatchGrantInput, grant: SessionGrantV1, now: number): boolean {
    if (!Number.isFinite(now)) return false;
    return grant.credentialRef === input.context.identity.credentialRef &&
      (grant.credentialRevision ?? credentialRevisionForCredentialRef(grant.credentialRef)) === credentialRevisionForIdentity(input.context.identity) &&
      grant.transportSessionId === input.context.transportSessionId &&
      grant.workspaceId === input.context.workspaceId &&
      grant.policyRevision === input.context.policyRevision &&
      grant.toolContractVersion === input.toolContractVersion &&
      grant.operation === input.operation &&
      grant.resourceFingerprint === input.resourceFingerprint &&
      grant.inputDigest === input.inputDigest &&
      grant.riskClass === input.riskClass &&
      Date.parse(grant.issuedAt) <= now &&
      Date.parse(grant.expiresAt) > now &&
      (grant.usesRemaining === null || grant.usesRemaining > 0);
  }

  #finalizeReservation(reservationId: string, outcome: "consumed" | "burned"): boolean {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) return false;
    const grant = this.#grants.get(reservation.grantId);
    this.#reservations.delete(reservationId);
    this.#reservedGrantIds.delete(reservation.grantId);
    this.#terminalReservations.set(reservationId, outcome);
    if (grant && grant.usesRemaining !== null) this.#consumeGrant(grant);
    this.#revision += 1;
    return true;
  }

  #consumeGrant(grant: SessionGrantV1): void {
    if (grant.usesRemaining === null) return;
    if (grant.usesRemaining <= 1) this.#grants.delete(grant.grantId);
    else this.#grants.set(grant.grantId, { ...grant, usesRemaining: grant.usesRemaining - 1 });
  }

  #removeExpired(now: number): void {
    if (!Number.isFinite(now)) return;
    this.#deleteWhere((grant) => Date.parse(grant.expiresAt) <= now);
  }

  #deleteWhere(predicate: (grant: SessionGrantV1) => boolean): void {
    let changed = false;
    for (const [id, grant] of this.#grants) {
      if (!predicate(grant)) continue;
      const reservationId = this.#reservedGrantIds.get(id);
      if (reservationId) {
        this.#reservations.delete(reservationId);
        this.#reservedGrantIds.delete(id);
        this.#terminalReservations.set(reservationId, "burned");
      }
      this.#grants.delete(id);
      changed = true;
    }
    if (changed) this.#revision += 1;
  }
}

export class ApprovalPolicyV1 {
  classify(resource: ResourceDescriptorV1): RiskClass {
    switch (resource.kind) {
      case "filesystem":
        if (resource.operation === "read" || resource.operation === "list" || resource.operation === "search") return "R0";
        if (resource.operation === "write") return "R2";
        return "R3";
      case "filesystem_batch":
        return "R2";
      case "git":
        if (resource.operation === "read") return "R0";
        if (resource.operation === "write") return "R2";
        return "R3";
      case "shell":
        return resource.operation === "verify" && resource.commandKind === "verification" ? "R1" : "R3";
      case "process":
        return resource.operation === "inspect" && !resource.persistence ? "R1" : "R3";
      case "network":
        if (resource.addressClasses.some((value) => value === "multicast" || value === "unspecified" || value === "reserved")) return "R4";
        if (resource.addressClasses.some((value) => value === "loopback" || value === "private" || value === "link_local")) return "R3";
        return "R2";
      case "audit":
        return "R1";
    }
  }
}

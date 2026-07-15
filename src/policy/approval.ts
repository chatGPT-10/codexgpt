import { createHash } from "node:crypto";
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

export class SessionGrantStore {
  readonly #grants = new Map<string, SessionGrantV1>();
  #revision = 0;
  #sequence = 0;

  revision(): string {
    return `grant-revision-${this.#revision}`;
  }

  size(): number {
    return this.#grants.size;
  }

  snapshot(): SessionGrantV1[] {
    return [...this.#grants.values()].map((grant) => structuredClone(grant));
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
    if (input.riskClass === "R0" || input.riskClass === "R4") return null;
    const now = Date.parse(input.now);
    if (!Number.isFinite(now)) throw new Error("Grant match time is invalid.");
    this.#removeExpired(now);
    for (const grant of this.#grants.values()) {
      if (
        grant.credentialRef === input.context.identity.credentialRef &&
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
        (grant.usesRemaining === null || grant.usesRemaining > 0)
      ) return structuredClone(grant);
    }
    return null;
  }

  consume(grantId: string): void {
    const grant = this.#grants.get(grantId);
    if (!grant || grant.usesRemaining === null) return;
    if (grant.usesRemaining <= 1) {
      this.#grants.delete(grantId);
    } else {
      this.#grants.set(grantId, { ...grant, usesRemaining: grant.usesRemaining - 1 });
    }
    this.#revision += 1;
  }

  revokeTransportSession(transportSessionId: string): void {
    this.#deleteWhere((grant) => grant.transportSessionId === transportSessionId);
  }

  revokeForActivePolicyRevision(activePolicyRevision: string): void {
    this.#deleteWhere((grant) => grant.policyRevision !== activePolicyRevision);
  }

  clear(): void {
    if (this.#grants.size === 0) return;
    this.#grants.clear();
    this.#revision += 1;
  }

  #removeExpired(now: number): void {
    this.#deleteWhere((grant) => Date.parse(grant.expiresAt) <= now);
  }

  #deleteWhere(predicate: (grant: SessionGrantV1) => boolean): void {
    let changed = false;
    for (const [id, grant] of this.#grants) {
      if (!predicate(grant)) continue;
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

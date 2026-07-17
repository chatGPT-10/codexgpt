import { createHash } from "node:crypto";
import type { RiskClass } from "./types.js";

export type ApprovableRiskClass = Exclude<RiskClass, "R0" | "R4">;

export interface AuthorizationFactsV3Input {
  serverId: string;
  credentialRef: string | null;
  credentialRevision: string;
  transportKind: string;
  transportSessionId: string;
  identityKind: string;
  identitySubject: string | null;
  workspaceId: string | null;
  leaseId: string | null;
  policyRevision: string;
  evidenceRevision: string;
  toolContractVersion: "3";
  toolName: string;
  canonicalAction: string;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  semanticFactsDigest: string;
  riskClass: ApprovableRiskClass;
}

export interface AuthorizationFactsV3 extends AuthorizationFactsV3Input {
  schemaVersion: 3;
  contractVersion: 3;
  subjectFingerprint: string;
  contextFingerprint: string;
  bindingFingerprint: string;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function requireSafeText(name: string, value: string, maximum = 240): string {
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} is not a bounded one-line value.`);
  }
  return value;
}

function requireFingerprint(name: string, value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 fingerprint.`);
  return value;
}

function requireSafeId(name: string, value: string | null): string | null {
  if (value === null) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

export function createAuthorizationFactsV3(input: AuthorizationFactsV3Input): AuthorizationFactsV3 {
  if (input.toolContractVersion !== "3") throw new Error("V3 authorization facts require contract 3.");
  const normalized: AuthorizationFactsV3Input = {
    serverId: requireSafeId("serverId", input.serverId)!,
    credentialRef: requireSafeId("credentialRef", input.credentialRef),
    credentialRevision: requireSafeId("credentialRevision", input.credentialRevision)!,
    transportKind: requireSafeId("transportKind", input.transportKind)!,
    transportSessionId: requireSafeId("transportSessionId", input.transportSessionId)!,
    identityKind: requireSafeId("identityKind", input.identityKind)!,
    identitySubject: requireSafeId("identitySubject", input.identitySubject),
    workspaceId: requireSafeId("workspaceId", input.workspaceId),
    leaseId: requireSafeId("leaseId", input.leaseId),
    policyRevision: requireSafeId("policyRevision", input.policyRevision)!,
    evidenceRevision: requireSafeId("evidenceRevision", input.evidenceRevision)!,
    toolContractVersion: "3",
    toolName: requireSafeText("toolName", input.toolName, 160),
    canonicalAction: requireSafeText("canonicalAction", input.canonicalAction),
    operation: requireSafeText("operation", input.operation, 160),
    resourceFingerprint: requireFingerprint("resourceFingerprint", input.resourceFingerprint),
    inputDigest: requireFingerprint("inputDigest", input.inputDigest),
    semanticFactsDigest: requireFingerprint("semanticFactsDigest", input.semanticFactsDigest),
    riskClass: input.riskClass
  };
  const subject = {
    credentialRef: normalized.credentialRef,
    credentialRevision: normalized.credentialRevision,
    transportKind: normalized.transportKind,
    transportSessionId: normalized.transportSessionId,
    identityKind: normalized.identityKind,
    identitySubject: normalized.identitySubject
  };
  const context = {
    serverId: normalized.serverId,
    workspaceId: normalized.workspaceId,
    leaseId: normalized.leaseId,
    policyRevision: normalized.policyRevision,
    evidenceRevision: normalized.evidenceRevision,
    toolContractVersion: normalized.toolContractVersion,
    // The public tool path is descriptive evidence, not authorization identity.
    // Direct and supertool routes may share a grant only when they resolve to
    // the same canonical action and every other binding fact remains exact.
    canonicalAction: normalized.canonicalAction,
    operation: normalized.operation,
    resourceFingerprint: normalized.resourceFingerprint,
    inputDigest: normalized.inputDigest,
    semanticFactsDigest: normalized.semanticFactsDigest,
    riskClass: normalized.riskClass
  };
  return Object.freeze({
    schemaVersion: 3,
    contractVersion: 3,
    ...normalized,
    subjectFingerprint: digest(subject),
    contextFingerprint: digest(context),
    bindingFingerprint: digest({ subject, context })
  });
}

export function authorizationFactsMatch(left: AuthorizationFactsV3, right: AuthorizationFactsV3): boolean {
  return left.bindingFingerprint === right.bindingFingerprint;
}

export function semanticDigest(value: unknown): string {
  return `sha256:${digest(value)}`;
}

import { createHash } from "node:crypto";
import { canonicalJson } from "../audit/canonicalJson.js";
import type { RiskClass } from "./types.js";

export type ApprovableRiskClass = Exclude<RiskClass, "R0" | "R4">;
export type InheritedToolContractVersionV3 = "3" | "4" | "5";

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
  toolContractVersion: InheritedToolContractVersionV3;
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

function requireStrictSafeText(name: string, value: string, maximum = 240): string {
  const safe = requireSafeText(name, value, maximum);
  if (/[\u0080-\u009f\u202a-\u202e\u2066-\u2069]/u.test(safe)) {
    throw new Error(`${name} contains disallowed V4 control text.`);
  }
  return safe;
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
  if (!["3", "4", "5"].includes(input.toolContractVersion)) {
    throw new Error("V3 authorization facts require inherited contract 3, 4, or 5.");
  }
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
    toolContractVersion: input.toolContractVersion,
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

export interface AuthorizationFactsV4Input {
  serverId: string;
  ownerId: string;
  credentialRef: string | null;
  credentialRevision: string;
  transportKind: string;
  transportSessionId: string;
  repositoryId: string;
  worktreeId: string | null;
  policyRevision: string;
  configurationRevision: string;
  capabilityRevision: string;
  pathPolicyRevision: string;
  secretPolicyRevision: string;
  toolContractVersion: "4";
  toolName: string;
  canonicalAction: string;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  semanticFactsDigest: string;
  riskClass: ApprovableRiskClass;
  issuedAt: string;
  expiresAt: string;
}

export interface AuthorizationFactsV4 extends AuthorizationFactsV4Input {
  schemaVersion: 4;
  contractVersion: 4;
  subjectFingerprint: string;
  contextFingerprint: string;
  bindingFingerprint: string;
}

export function createAuthorizationFactsV4(input: AuthorizationFactsV4Input): AuthorizationFactsV4 {
  if (input.toolContractVersion !== "4") throw new Error("V4 authorization facts require contract 4.");
  if (!/^repo_[a-f0-9]{32}$/.test(input.repositoryId)) throw new Error("repositoryId is invalid.");
  if (input.worktreeId !== null && !/^task_[a-f0-9]{32}$/.test(input.worktreeId)) throw new Error("worktreeId is invalid.");
  if (!["R1", "R2", "R3"].includes(input.riskClass)) throw new Error("riskClass is invalid for V4 authorization facts.");
  const issuedAtMs = Date.parse(input.issuedAt);
  const expiresAtMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || issuedAtMs > expiresAtMs) {
    throw new Error("V4 authorization fact timestamps are invalid.");
  }
  const normalized: AuthorizationFactsV4Input = {
    serverId: requireSafeId("serverId", input.serverId)!,
    ownerId: requireSafeId("ownerId", input.ownerId)!,
    credentialRef: requireSafeId("credentialRef", input.credentialRef),
    credentialRevision: requireSafeId("credentialRevision", input.credentialRevision)!,
    transportKind: requireSafeId("transportKind", input.transportKind)!,
    transportSessionId: requireSafeId("transportSessionId", input.transportSessionId)!,
    repositoryId: input.repositoryId,
    worktreeId: input.worktreeId,
    policyRevision: requireSafeId("policyRevision", input.policyRevision)!,
    configurationRevision: requireSafeId("configurationRevision", input.configurationRevision)!,
    capabilityRevision: requireSafeId("capabilityRevision", input.capabilityRevision)!,
    pathPolicyRevision: requireSafeId("pathPolicyRevision", input.pathPolicyRevision)!,
    secretPolicyRevision: requireSafeId("secretPolicyRevision", input.secretPolicyRevision)!,
    toolContractVersion: "4",
    toolName: requireStrictSafeText("toolName", input.toolName, 160),
    canonicalAction: requireStrictSafeText("canonicalAction", input.canonicalAction),
    operation: requireStrictSafeText("operation", input.operation, 160),
    resourceFingerprint: requireFingerprint("resourceFingerprint", input.resourceFingerprint),
    inputDigest: requireFingerprint("inputDigest", input.inputDigest),
    semanticFactsDigest: requireFingerprint("semanticFactsDigest", input.semanticFactsDigest),
    riskClass: input.riskClass,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  };
  const subject = {
    ownerId: normalized.ownerId,
    credentialRef: normalized.credentialRef,
    credentialRevision: normalized.credentialRevision,
    transportKind: normalized.transportKind,
    transportSessionId: normalized.transportSessionId
  };
  const context = {
    serverId: normalized.serverId,
    repositoryId: normalized.repositoryId,
    worktreeId: normalized.worktreeId,
    policyRevision: normalized.policyRevision,
    configurationRevision: normalized.configurationRevision,
    capabilityRevision: normalized.capabilityRevision,
    pathPolicyRevision: normalized.pathPolicyRevision,
    secretPolicyRevision: normalized.secretPolicyRevision,
    toolContractVersion: normalized.toolContractVersion,
    canonicalAction: normalized.canonicalAction,
    operation: normalized.operation,
    resourceFingerprint: normalized.resourceFingerprint,
    inputDigest: normalized.inputDigest,
    semanticFactsDigest: normalized.semanticFactsDigest,
    riskClass: normalized.riskClass,
    issuedAt: normalized.issuedAt,
    expiresAt: normalized.expiresAt
  };
  return Object.freeze({
    schemaVersion: 4,
    contractVersion: 4,
    ...normalized,
    subjectFingerprint: digest(subject),
    contextFingerprint: digest(context),
    bindingFingerprint: digest({ subject, context })
  });
}

export function authorizationFactsMatchV4(left: AuthorizationFactsV4, right: AuthorizationFactsV4): boolean {
  return left.bindingFingerprint === right.bindingFingerprint;
}

export function semanticDigest(value: unknown): string {
  return `sha256:${digest(value)}`;
}

export function semanticDigestV4(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update("authorization-semantic-v4\0", "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex")}`;
}

import { auditEventV1Schema } from "./schemas.js";
import type {
  AuditEventV1,
  PolicyDecisionV1,
  RequestContextV1,
  ResourceDescriptorV1,
  SandboxCapabilityReportV1
} from "./types.js";

function safeOneLine(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeRelativePath(value: string): string | null {
  const normalized = value.replaceAll("\\", "/").normalize("NFC");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..") ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) return null;
  return safeOneLine(normalized, 180);
}

export function safePolicySummary(resource: ResourceDescriptorV1): string {
  switch (resource.kind) {
    case "filesystem": {
      const relative = safeRelativePath(resource.relativePath);
      return relative ? `filesystem:${resource.operation}:${relative}` : `filesystem:${resource.operation}:[resource omitted]`;
    }
    case "git":
      return `git:${resource.operation}:${safeOneLine(resource.repositoryKey, 80) || "[repository omitted]"}`;
    case "shell":
      return `shell:${resource.operation}:${resource.backend}`;
    case "process":
      return `process:${resource.operation}:${resource.persistence ? "persistent" : "transient"}`;
    case "network":
      return `network:${resource.operation}:${safeOneLine(resource.host, 120) || "[host omitted]"}:${resource.port}`;
    case "audit":
      return `audit:${resource.operation}:${resource.filterDigest.slice(0, 16)}`;
  }
}

export interface CreateAuditEventInput {
  eventId: string;
  timestamp: string;
  context: RequestContextV1;
  decision: PolicyDecisionV1;
  resource: ResourceDescriptorV1;
  toolName: string;
  canonicalAction: string;
  capabilities: SandboxCapabilityReportV1;
  approvalState: AuditEventV1["approvalState"];
  grantId: string | null;
  durationMs: number;
  resultCode: string | null;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  unsafe?: unknown;
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEventV1 {
  if (input.decision.resourceFingerprint !== input.resource.resourceFingerprint) {
    throw new Error("Audit decision and resource fingerprints do not match.");
  }
  if (input.decision.policyRevision !== input.context.policyRevision) {
    throw new Error("Audit decision and request policy revisions do not match.");
  }
  const safeRuleIds = [...new Set(
    input.decision.provenance
      .map((item) => item.safeRuleId)
      .filter((value): value is string => Boolean(value))
  )].slice(0, 16);

  return auditEventV1Schema.parse({
    schemaVersion: 1,
    eventId: input.eventId,
    timestamp: input.timestamp,
    requestId: input.context.requestId,
    decisionId: input.decision.decisionId,
    credentialRef: input.context.identity.credentialRef,
    transportSessionId: input.context.transportSessionId,
    toolName: safeOneLine(input.toolName, 80),
    canonicalAction: safeOneLine(input.canonicalAction, 80),
    workspaceId: input.context.workspaceId,
    relativeResourceSummary: safePolicySummary(input.resource),
    resourceFingerprint: input.resource.resourceFingerprint,
    policyRevision: input.context.policyRevision,
    outcome: input.decision.outcome,
    reasonCode: input.decision.reasonCode,
    safeRuleIds,
    approvalState: input.approvalState,
    grantId: input.grantId,
    sandboxBackend: input.capabilities.backendId,
    durationMs: Math.max(0, input.durationMs),
    resultCode: input.resultCode ? safeOneLine(input.resultCode, 160) : null,
    exitCode: input.exitCode,
    boundedByteCounts: Object.fromEntries(
      Object.entries(input.boundedByteCounts)
        .slice(0, 16)
        .map(([key, value]) => [safeOneLine(key, 80), Math.max(0, Math.trunc(value))])
    )
  });
}

import { createHash } from "node:crypto";
import { auditEventV4Schema } from "./schemas.js";
import type {
  AuditEnvelopeV1,
  AuditEventV4,
  GitOperationAuditEventV4,
  RecoveryAuditEventV4,
  TerminalAuditEventV4
} from "./types.js";

export interface AuditLifecycleAppenderV4 {
  append(event: AuditEventV4): Promise<AuditEnvelopeV1>;
}

function deterministicEventId(parts: readonly string[]): string {
  return `event_${createHash("sha256")
    .update("audit-lifecycle-v4\0", "utf8")
    .update(parts.join("\0"), "utf8")
    .digest("hex").slice(0, 32)}`;
}

export interface GitLifecycleAuditEventV4Input {
  eventId?: string;
  timestamp: string;
  transition: GitOperationAuditEventV4["transition"];
  operationId: string;
  requestId: string | null;
  authorizationEventId: string | null;
  toolName: string;
  canonicalAction: string;
  repositoryId: string;
  taskWorktreeId: string | null;
  policyRevision: string;
  subjectFingerprint: string;
  contextFingerprint: string;
  resultCode: string | null;
  counts: Record<string, number>;
  decisionId?: string | null;
  workspaceId?: string | null;
}

export function createGitLifecycleAuditEventV4(
  input: GitLifecycleAuditEventV4Input
): GitOperationAuditEventV4 {
  return auditEventV4Schema.parse({
    schemaVersion: 4,
    contractVersion: 4,
    eventId: input.eventId ?? deterministicEventId([
      input.operationId,
      input.transition,
      input.timestamp,
      input.resultCode ?? ""
    ]),
    eventType: "git_operation",
    timestamp: input.timestamp,
    requestId: input.requestId,
    authorizationEventId: input.authorizationEventId,
    decisionId: input.decisionId ?? null,
    toolName: input.toolName,
    canonicalAction: input.canonicalAction,
    workspaceId: input.workspaceId ?? null,
    policyRevision: input.policyRevision,
    subjectFingerprint: input.subjectFingerprint,
    contextFingerprint: input.contextFingerprint,
    resultCode: input.resultCode,
    counts: input.counts,
    repositoryId: input.repositoryId,
    taskWorktreeId: input.taskWorktreeId,
    operationId: input.operationId,
    transition: input.transition
  }) as GitOperationAuditEventV4;
}

export function createTerminalAuditEventV4(input: Omit<TerminalAuditEventV4, "schemaVersion" | "contractVersion" | "eventType" | "eventId"> & {
  eventId?: string;
}): TerminalAuditEventV4 {
  return auditEventV4Schema.parse({
    schemaVersion: 4,
    contractVersion: 4,
    eventType: "terminal",
    eventId: input.eventId ?? deterministicEventId([
      input.operationId,
      input.authorizationEventId,
      input.status,
      input.resultCode ?? ""
    ]),
    ...input
  }) as TerminalAuditEventV4;
}

export function createRecoveryAuditEventV4(input: Omit<RecoveryAuditEventV4, "schemaVersion" | "contractVersion" | "eventType" | "eventId"> & {
  eventId?: string;
}): RecoveryAuditEventV4 {
  return auditEventV4Schema.parse({
    schemaVersion: 4,
    contractVersion: 4,
    eventType: "recovery",
    eventId: input.eventId ?? deterministicEventId([
      input.operationId,
      input.recoveryAction,
      input.resultCode ?? ""
    ]),
    ...input
  }) as RecoveryAuditEventV4;
}

export function createAuditLifecycleSinkV4(
  appender: AuditLifecycleAppenderV4
): (event: AuditEventV4) => Promise<void> {
  return async (event) => {
    await appender.append(auditEventV4Schema.parse(event));
  };
}

import { randomUUID } from "node:crypto";
import type {
  AuditAuthorizationContextV2,
  AuditExecutionInputV2
} from "../policy/integration.js";
import { executionAuditEventV2Schema } from "./schemas.js";
import type { PersistentAuditStore } from "./store.js";
import type { ExecutionAuditEventV2 } from "./types.js";

export interface PersistentAuditRuntimeOptions {
  now?: () => number;
  eventId?: () => string;
}

export interface PersistedExecutionAuditEvidenceV2 {
  eventId: string;
  timestamp: string;
}

export class PersistentAuditRuntimeV2 {
  private readonly now: () => number;
  private readonly eventId: () => string;

  constructor(
    private readonly store: PersistentAuditStore,
    options: PersistentAuditRuntimeOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.eventId = options.eventId ?? (() => `event_${randomUUID().replaceAll("-", "")}`);
  }

  async persistAuthorization(context: AuditAuthorizationContextV2): Promise<void> {
    await this.store.append(context.authorizationEvent);
  }

  async persistExecution(
    context: AuditAuthorizationContextV2,
    input: AuditExecutionInputV2
  ): Promise<PersistedExecutionAuditEvidenceV2> {
    const authorization = context.authorizationEvent;
    const event: ExecutionAuditEventV2 = executionAuditEventV2Schema.parse({
      schemaVersion: 2,
      eventId: this.eventId(),
      eventType: "execution",
      timestamp: new Date(this.now()).toISOString(),
      requestId: authorization.requestId,
      authorizationEventId: authorization.eventId,
      decisionId: authorization.decisionId,
      credentialRef: authorization.credentialRef,
      transportSessionId: authorization.transportSessionId,
      toolName: authorization.toolName,
      canonicalAction: authorization.canonicalAction,
      workspaceId: authorization.workspaceId,
      workspaceRef: authorization.workspaceRef,
      policyRevision: authorization.policyRevision,
      status: input.status,
      resultCode: input.resultCode,
      durationMs: input.durationMs,
      exitCode: input.exitCode,
      boundedByteCounts: input.boundedByteCounts,
      changeSetId: input.changeSetId,
      revertsChangeSetId: input.revertsChangeSetId ?? null,
      operationCount: input.operationCount,
      mutationKinds: input.mutationKinds,
      recoveryRequired: input.recoveryRequired
    });
    await this.store.append(event);
    return { eventId: event.eventId, timestamp: event.timestamp };
  }
}

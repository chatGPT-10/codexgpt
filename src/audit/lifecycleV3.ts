import { createHash } from "node:crypto";
import { approvalLifecycleAuditEventV3Schema } from "./schemas.js";
import type { ApprovalLifecycleAuditEventV3, AuditEnvelopeV1 } from "./types.js";
import type { ApprovalTransitionV3 } from "../policy/pendingApprovals.js";

export interface AuditLifecycleAppenderV3 {
  append(event: ApprovalLifecycleAuditEventV3): Promise<AuditEnvelopeV1>;
}

function eventIdFor(transition: ApprovalTransitionV3): string {
  const digest = createHash("sha256").update(JSON.stringify({
    approvalId: transition.approval.approvalId,
    transitionSequence: transition.approval.transitionSequence,
    from: transition.from,
    to: transition.to,
    at: transition.at,
    resultCode: transition.resultCode
  }), "utf8").digest("hex").slice(0, 32);
  return `event_${digest}`;
}

function auditTransition(transition: ApprovalTransitionV3): ApprovalLifecycleAuditEventV3["transition"] {
  return transition.to === "pending" ? "requested" : transition.to;
}

export function createApprovalLifecycleAuditEventV3(
  transition: ApprovalTransitionV3
): ApprovalLifecycleAuditEventV3 {
  const { approval } = transition;
  return approvalLifecycleAuditEventV3Schema.parse({
    schemaVersion: 3,
    contractVersion: 3,
    eventId: eventIdFor(transition),
    eventType: "approval_lifecycle",
    transition: auditTransition(transition),
    timestamp: transition.at,
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: approval.facts.credentialRef,
    transportSessionId: approval.facts.transportSessionId,
    toolName: approval.facts.toolName,
    canonicalAction: approval.facts.canonicalAction,
    workspaceId: approval.facts.workspaceId,
    workspaceRef: null,
    policyRevision: approval.facts.policyRevision,
    subjectFingerprint: approval.facts.subjectFingerprint,
    contextFingerprint: approval.facts.contextFingerprint,
    resultCode: transition.resultCode,
    counts: {
      transitionSequence: approval.transitionSequence,
      argumentCount: approval.summary.argumentCount
    },
    approvalId: approval.approvalId,
    grantId: approval.grantId,
    reservationId: approval.reservationId
  });
}

export function createApprovalLifecycleSinkV3(
  appender: AuditLifecycleAppenderV3
): (transition: ApprovalTransitionV3) => Promise<void> {
  return async (transition) => {
    await appender.append(createApprovalLifecycleAuditEventV3(transition));
  };
}

import type {
  PolicyOutcome,
  PolicyReasonCode,
  RiskClass
} from "../policy/types.js";

export type AuditErrorCode =
  | "AUDIT_ACCESS_DENIED"
  | "AUDIT_RANGE_INVALID"
  | "AUDIT_CURSOR_INVALID"
  | "AUDIT_BUSY"
  | "AUDIT_UNAVAILABLE"
  | "AUDIT_INTEGRITY_FAILURE"
  | "AUDIT_RECORD_INVALID"
  | "INTERNAL_ERROR";

export type SafeAuditDetail = string | number | boolean | null;

export class AuditError extends Error {
  constructor(
    readonly code: AuditErrorCode,
    message: string,
    readonly safeDetails: Readonly<Record<string, SafeAuditDetail>> = {}
  ) {
    super(message);
    this.name = "AuditError";
  }
}

export type AuditEventType =
  | "authorization"
  | "execution"
  | "recovery"
  | "administrative";

export interface AuditEventCommonV2 {
  schemaVersion: 2;
  eventId: string;
  eventType: AuditEventType;
  timestamp: string;
  requestId: string | null;
  authorizationEventId: string | null;
  decisionId: string | null;
  credentialRef: string | null;
  transportSessionId: string | null;
  toolName: string | null;
  canonicalAction: string;
  workspaceId: string | null;
  workspaceRef: string | null;
  policyRevision: string | null;
}

export interface AuthorizationAuditEventV2 extends AuditEventCommonV2 {
  eventType: "authorization";
  authorizationEventId: null;
  resourceSummary: string;
  resourceFingerprint: string;
  outcome: PolicyOutcome;
  reasonCode: PolicyReasonCode | null;
  safeRuleIds: string[];
  approvalState: "not_required" | "required" | "granted" | "denied";
  grantId: string | null;
  sandboxBackend: string;
  riskClass: RiskClass;
}

export type ExecutionAuditStatus =
  | "not_executed"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "recovery_required";

export type AuditMutationKind =
  | "create"
  | "replace"
  | "append"
  | "move"
  | "delete";

export interface ExecutionAuditEventV2 extends AuditEventCommonV2 {
  eventType: "execution";
  authorizationEventId: string;
  status: ExecutionAuditStatus;
  resultCode: string | null;
  durationMs: number;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  revertsChangeSetId?: string | null;
  operationCount: number;
  mutationKinds: AuditMutationKind[];
  recoveryRequired: boolean;
}

export type RecoveryAuditAction =
  | "rollback_completed"
  | "cleanup_completed"
  | "workspace_frozen"
  | "tail_quarantined";

export interface RecoveryAuditEventV2 extends AuditEventCommonV2 {
  eventType: "recovery";
  recoveryAction: RecoveryAuditAction;
  transactionId: string | null;
  changeSetId: string | null;
  operationCount: number;
  resultCode: string;
}

export type AdministrativeAuditAction =
  | "audit_query"
  | "segment_rotation"
  | "retention_prune"
  | "integrity_verification"
  | "repair"
  | "quarantine";

export interface AdministrativeAuditEventV2 extends AuditEventCommonV2 {
  eventType: "administrative";
  administrativeAction: AdministrativeAuditAction;
  filterDigest: string | null;
  resultCount: number | null;
  segmentIds: string[];
  firstSequence: number | null;
  lastSequence: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  recordCount: number | null;
  firstMac: string | null;
  lastMac: string | null;
  policyReason: string | null;
  resultCode: string | null;
}

export type AuditEventV2 =
  | AuthorizationAuditEventV2
  | ExecutionAuditEventV2
  | RecoveryAuditEventV2
  | AdministrativeAuditEventV2;

export interface AuditEnvelopeV1 {
  storeVersion: 1;
  sequence: number;
  segmentId: string;
  previousMac: string;
  event: AuditEventV2;
  recordMac: string;
}

export interface AuditSegmentMetadataV1 {
  segmentId: string;
  fileName: string;
  state: "active" | "closed" | "delete_pending";
  firstSequence: number;
  lastSequence: number;
  firstTimestamp: string;
  lastTimestamp: string;
  firstMac: string;
  lastMac: string;
  recordCount: number;
  byteSize: number;
}

export interface AuditIndexV1 {
  storeVersion: 1;
  state: "healthy" | "degraded" | "integrity_failed";
  activeSegmentId: string | null;
  chainAnchorSequence: number;
  chainAnchorMac: string;
  lastSequence: number;
  lastMac: string;
  lastAppendAt: string | null;
  failureCode: AuditErrorCode | null;
  segments: AuditSegmentMetadataV1[];
}

export interface AuditRetentionStateV1 {
  storeVersion: 1;
  maxAgeDays: number;
  maxClosedBytes: number;
  lastRunAt: string | null;
  deletePendingSegmentIds: string[];
}

export interface AuditStoreDiagnostics {
  state: "disabled" | "healthy" | "degraded" | "integrity_failed";
  activeSegmentId: string | null;
  lastCommittedSequence: number;
  lastSuccessfulAppendTime: string | null;
  retention: {
    maxAgeDays: number;
    maxClosedBytes: number;
  };
  failureCode: AuditErrorCode | null;
}

export interface QueryAuditEventsInputV2 {
  startTime?: string;
  endTime?: string;
  limit?: number;
  cursor?: string;
  eventTypes?: AuditEventType[];
  toolNames?: string[];
  requestIds?: string[];
  changeSetIds?: string[];
  workspaceRefs?: string[];
  statuses?: ExecutionAuditStatus[];
}

export interface AuditQueryRecordV2 {
  sequence: number;
  event: AuditEventV2;
}

export interface QueryAuditEventsResultV2 {
  schemaVersion: 2;
  records: AuditQueryRecordV2[];
  nextCursor: string | null;
  filterDigest: string;
  startTime: string;
  endTime: string;
  limit: number;
  integrityState: "healthy" | "degraded" | "integrity_failed";
}

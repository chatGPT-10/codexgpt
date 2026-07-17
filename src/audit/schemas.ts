import { z } from "zod";
import type {
  AdministrativeAuditEventV2,
  ApprovalLifecycleAuditEventV3,
  AuditEnvelopeV1,
  AuditEventV2,
  AuditEventV3,
  AuditIndexV1,
  AuditRetentionStateV1,
  AuditSegmentMetadataV1,
  AuthorizationAuditEventV2,
  ExecutionAuditEventV2,
  QueryAuditEventsResultV3,
  QueryAuditEventsResultV2,
  RecoveryAuditEventV2
} from "./types.js";

const eventIdSchema = z.string().regex(/^event_[a-f0-9]{32}$/);
const safeIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const nullableSafeIdSchema = safeIdSchema.nullable();
const workspaceRefSchema = z.string().regex(/^awr_[a-f0-9]{32}$/).nullable();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });
const safeOneLineSchema = z.string().min(1).max(240).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  "Audit strings must be one line without control characters."
);
const nonnegativeIntegerSchema = z.number().int().nonnegative().finite();
const safeRuleIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const safeRuleIdsSchema = z.array(safeRuleIdSchema).max(16).refine(
  (values) => new Set(values).size === values.length,
  "Audit rule IDs must be unique."
);
const mutationKindSchema = z.enum(["create", "replace", "append", "move", "delete"]);
const mutationKindsSchema = z.array(mutationKindSchema).max(16).refine(
  (values) => new Set(values).size === values.length,
  "Audit mutation kinds must be unique."
);
const boundedByteCountsSchema = z.record(
  z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  nonnegativeIntegerSchema
).refine(
  (value) => Object.keys(value).length <= 16,
  "Audit byte-count maps are bounded to sixteen entries."
);

const commonShape = {
  schemaVersion: z.literal(2),
  eventId: eventIdSchema,
  timestamp: timestampSchema,
  requestId: nullableSafeIdSchema,
  authorizationEventId: eventIdSchema.nullable(),
  decisionId: nullableSafeIdSchema,
  credentialRef: nullableSafeIdSchema,
  transportSessionId: nullableSafeIdSchema,
  toolName: safeOneLineSchema.nullable(),
  canonicalAction: safeOneLineSchema,
  workspaceId: nullableSafeIdSchema,
  workspaceRef: workspaceRefSchema,
  policyRevision: nullableSafeIdSchema
};

const rawAuthorizationAuditEventV2Schema = z.object({
  ...commonShape,
  eventType: z.literal("authorization"),
  authorizationEventId: z.null(),
  resourceSummary: safeOneLineSchema,
  resourceFingerprint: sha256Schema,
  outcome: z.enum(["allow", "deny", "approval_required", "enforcement_unavailable"]),
  reasonCode: z.enum([
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "POLICY_CONTEXT_STALE",
    "POLICY_RESOURCE_INVALID",
    "POLICY_CONFIG_INVALID",
    "SHELL_SANDBOX_UNAVAILABLE",
    "PROCESS_SANDBOX_UNAVAILABLE",
    "NETWORK_ENFORCEMENT_UNAVAILABLE"
  ]).nullable(),
  safeRuleIds: safeRuleIdsSchema,
  approvalState: z.enum(["not_required", "required", "granted", "denied"]),
  grantId: nullableSafeIdSchema,
  sandboxBackend: safeOneLineSchema,
  riskClass: z.enum(["R0", "R1", "R2", "R3", "R4"])
}).strict();

export const authorizationAuditEventV2Schema: z.ZodType<AuthorizationAuditEventV2> =
  rawAuthorizationAuditEventV2Schema;

const rawExecutionAuditEventV2Schema = z.object({
  ...commonShape,
  eventType: z.literal("execution"),
  authorizationEventId: eventIdSchema,
  status: z.enum(["not_executed", "succeeded", "failed", "rolled_back", "recovery_required"]),
  resultCode: safeOneLineSchema.nullable(),
  durationMs: nonnegativeIntegerSchema,
  exitCode: z.number().int().finite().nullable(),
  boundedByteCounts: boundedByteCountsSchema,
  changeSetId: z.string().regex(/^cs_[a-f0-9]{32}$/).nullable(),
  revertsChangeSetId: z.string().regex(/^cs_[a-f0-9]{32}$/).nullable().optional(),
  operationCount: nonnegativeIntegerSchema,
  mutationKinds: mutationKindsSchema,
  recoveryRequired: z.boolean()
}).strict();

function validateExecutionEvent(value: ExecutionAuditEventV2, context: z.RefinementCtx): void {
  if (value.status === "not_executed" && (
    value.changeSetId !== null ||
    value.revertsChangeSetId != null ||
    value.operationCount !== 0 ||
    value.mutationKinds.length !== 0 ||
    value.recoveryRequired
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "not_executed events cannot contain mutation or recovery facts."
    });
  }
  if (value.status === "recovery_required" && !value.recoveryRequired) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recoveryRequired"],
      message: "recovery_required status requires recoveryRequired=true."
    });
  }
  if (value.status !== "recovery_required" && value.recoveryRequired) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recoveryRequired"],
      message: "Only recovery_required status may set recoveryRequired=true."
    });
  }
}

export const executionAuditEventV2Schema: z.ZodType<ExecutionAuditEventV2> =
  rawExecutionAuditEventV2Schema.superRefine(validateExecutionEvent);

const rawRecoveryAuditEventV2Schema = z.object({
  ...commonShape,
  eventType: z.literal("recovery"),
  recoveryAction: z.enum(["rollback_completed", "cleanup_completed", "workspace_frozen", "tail_quarantined"]),
  transactionId: z.string().regex(/^tx_[a-f0-9]{32}$/).nullable(),
  changeSetId: z.string().regex(/^cs_[a-f0-9]{32}$/).nullable(),
  operationCount: nonnegativeIntegerSchema,
  resultCode: safeOneLineSchema
}).strict();

export const recoveryAuditEventV2Schema: z.ZodType<RecoveryAuditEventV2> =
  rawRecoveryAuditEventV2Schema;

const rawAdministrativeAuditEventV2Schema = z.object({
  ...commonShape,
  eventType: z.literal("administrative"),
  administrativeAction: z.enum([
    "audit_query",
    "segment_rotation",
    "retention_prune",
    "integrity_verification",
    "repair",
    "quarantine"
  ]),
  filterDigest: sha256Schema.nullable(),
  resultCount: nonnegativeIntegerSchema.nullable(),
  segmentIds: z.array(z.string().min(1).max(80).regex(/^audit-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}$/)).max(128),
  firstSequence: nonnegativeIntegerSchema.nullable(),
  lastSequence: nonnegativeIntegerSchema.nullable(),
  firstTimestamp: timestampSchema.nullable(),
  lastTimestamp: timestampSchema.nullable(),
  recordCount: nonnegativeIntegerSchema.nullable(),
  firstMac: sha256Schema.nullable(),
  lastMac: sha256Schema.nullable(),
  policyReason: safeOneLineSchema.nullable(),
  resultCode: safeOneLineSchema.nullable()
}).strict();

export const administrativeAuditEventV2Schema: z.ZodType<AdministrativeAuditEventV2> =
  rawAdministrativeAuditEventV2Schema;

const rawAuditEventV2Schema = z.discriminatedUnion("eventType", [
  rawAuthorizationAuditEventV2Schema,
  rawExecutionAuditEventV2Schema,
  rawRecoveryAuditEventV2Schema,
  rawAdministrativeAuditEventV2Schema
]);

export const auditEventV2Schema: z.ZodType<AuditEventV2> = rawAuditEventV2Schema.superRefine(
  (value, context) => {
    if (value.eventType === "execution") validateExecutionEvent(value, context);
  }
);

const commonV3Shape = {
  schemaVersion: z.literal(3),
  contractVersion: z.literal(3),
  eventId: eventIdSchema,
  timestamp: timestampSchema,
  requestId: nullableSafeIdSchema,
  authorizationEventId: eventIdSchema.nullable(),
  decisionId: nullableSafeIdSchema,
  credentialRef: nullableSafeIdSchema,
  transportSessionId: nullableSafeIdSchema,
  toolName: safeOneLineSchema.nullable(),
  canonicalAction: safeOneLineSchema,
  workspaceId: nullableSafeIdSchema,
  workspaceRef: workspaceRefSchema,
  policyRevision: nullableSafeIdSchema,
  subjectFingerprint: sha256Schema,
  contextFingerprint: sha256Schema,
  resultCode: safeOneLineSchema.nullable(),
  counts: boundedByteCountsSchema
};

const rawApprovalLifecycleAuditEventV3Schema = z.object({
  ...commonV3Shape,
  eventType: z.literal("approval_lifecycle"),
  transition: z.enum(["requested", "prepared", "granted", "denied", "expired", "reserved", "consumed", "burned"]),
  approvalId: z.string().regex(/^approval_[a-f0-9]{32}$/),
  grantId: safeIdSchema.nullable(),
  reservationId: z.string().regex(/^reservation_[a-f0-9]{32}$/).nullable()
}).strict();

const rawRootLeaseLifecycleAuditEventV3Schema = z.object({
  ...commonV3Shape,
  eventType: z.literal("root_lease_lifecycle"),
  transition: z.enum(["created", "revoked", "expired"]),
  rootLeaseId: safeIdSchema
}).strict();

const rawProcessLifecycleAuditEventV3Schema = z.object({
  ...commonV3Shape,
  eventType: z.literal("process_lifecycle"),
  transition: z.enum([
    "started", "exited", "user_terminated", "timed_out", "expired", "policy_revoked",
    "evidence_revoked", "transport_closed", "lease_revoked", "output_limit_exceeded",
    "host_crashed", "cleanup_completed"
  ]),
  processId: safeIdSchema,
  processGeneration: nonnegativeIntegerSchema.nullable()
}).strict();

const rawSnapshotLifecycleAuditEventV3Schema = z.object({
  ...commonV3Shape,
  eventType: z.literal("snapshot_lifecycle"),
  transition: z.enum(["prepare_requested", "prepared", "validated", "attached", "cleanup_pending", "cleaned", "recovered", "failed"]),
  snapshotId: safeIdSchema
}).strict();

export const approvalLifecycleAuditEventV3Schema: z.ZodType<ApprovalLifecycleAuditEventV3> =
  rawApprovalLifecycleAuditEventV3Schema;

export const auditEventV3Schema: z.ZodType<AuditEventV3> = z.discriminatedUnion("eventType", [
  rawApprovalLifecycleAuditEventV3Schema,
  rawRootLeaseLifecycleAuditEventV3Schema,
  rawProcessLifecycleAuditEventV3Schema,
  rawSnapshotLifecycleAuditEventV3Schema
]);

export const persistedAuditEventSchema = z.union([auditEventV2Schema, auditEventV3Schema]);

const segmentIdSchema = z.string().regex(/^audit-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}$/);

export const auditEnvelopeV1Schema: z.ZodType<AuditEnvelopeV1> = z.object({
  storeVersion: z.literal(1),
  sequence: z.number().int().positive().safe(),
  segmentId: segmentIdSchema,
  previousMac: sha256Schema,
  event: persistedAuditEventSchema,
  recordMac: sha256Schema
}).strict();

export const auditSegmentMetadataV1Schema: z.ZodType<AuditSegmentMetadataV1> = z.object({
  segmentId: segmentIdSchema,
  fileName: z.string().regex(/^audit-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.jsonl$/),
  state: z.enum(["active", "closed", "delete_pending"]),
  firstSequence: z.number().int().positive().safe(),
  lastSequence: z.number().int().positive().safe(),
  firstTimestamp: timestampSchema,
  lastTimestamp: timestampSchema,
  firstMac: sha256Schema,
  lastMac: sha256Schema,
  recordCount: z.number().int().positive().safe(),
  byteSize: z.number().int().positive().safe()
}).strict().superRefine((value, context) => {
  if (value.lastSequence < value.firstSequence) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lastSequence"], message: "Segment sequence range is invalid." });
  }
});

export const auditIndexV1Schema: z.ZodType<AuditIndexV1> = z.object({
  storeVersion: z.literal(1),
  state: z.enum(["healthy", "degraded", "integrity_failed"]),
  activeSegmentId: segmentIdSchema.nullable(),
  chainAnchorSequence: z.number().int().nonnegative().safe(),
  chainAnchorMac: sha256Schema,
  lastSequence: z.number().int().nonnegative().safe(),
  lastMac: sha256Schema,
  lastAppendAt: timestampSchema.nullable(),
  failureCode: z.enum([
    "AUDIT_ACCESS_DENIED",
    "AUDIT_RANGE_INVALID",
    "AUDIT_CURSOR_INVALID",
    "AUDIT_BUSY",
    "AUDIT_UNAVAILABLE",
    "AUDIT_INTEGRITY_FAILURE",
    "AUDIT_RECORD_INVALID",
    "INTERNAL_ERROR"
  ]).nullable(),
  segments: z.array(auditSegmentMetadataV1Schema).max(4096)
}).strict();

export const auditRetentionStateV1Schema: z.ZodType<AuditRetentionStateV1> = z.object({
  storeVersion: z.literal(1),
  maxAgeDays: z.number().int().min(1).max(365),
  maxClosedBytes: z.number().int().min(1024 * 1024).max(2 * 1024 * 1024 * 1024),
  lastRunAt: timestampSchema.nullable(),
  deletePendingSegmentIds: z.array(segmentIdSchema).max(4096)
}).strict();

function uniqueValues<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

export const queryAuditEventsInputV2Schema = z.object({
  startTime: timestampSchema.optional(),
  endTime: timestampSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(16).max(2048).regex(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/).optional(),
  eventTypes: z.array(z.enum(["authorization", "execution", "recovery", "administrative"]))
    .min(1).max(4).refine(uniqueValues, "Audit event types must be unique.").optional(),
  toolNames: z.array(safeOneLineSchema)
    .min(1).max(32).refine(uniqueValues, "Audit tool names must be unique.").optional(),
  requestIds: z.array(safeIdSchema)
    .min(1).max(32).refine(uniqueValues, "Audit request IDs must be unique.").optional(),
  changeSetIds: z.array(z.string().regex(/^cs_[a-f0-9]{32}$/))
    .min(1).max(32).refine(uniqueValues, "Audit change-set IDs must be unique.").optional(),
  workspaceRefs: z.array(z.string().regex(/^awr_[a-f0-9]{32}$/))
    .min(1).max(32).refine(uniqueValues, "Audit workspace references must be unique.").optional(),
  statuses: z.array(z.enum(["not_executed", "succeeded", "failed", "rolled_back", "recovery_required"]))
    .min(1).max(5).refine(uniqueValues, "Audit execution statuses must be unique.").optional()
}).strict();

export const queryAuditEventsResultV2Schema: z.ZodType<QueryAuditEventsResultV2> = z.object({
  schemaVersion: z.literal(2),
  records: z.array(z.object({
    sequence: z.number().int().positive().safe(),
    event: auditEventV2Schema
  }).strict()).max(100),
  nextCursor: z.string().min(16).max(2048).regex(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/).nullable(),
  filterDigest: sha256Schema,
  startTime: timestampSchema,
  endTime: timestampSchema,
  limit: z.number().int().min(1).max(100),
  integrityState: z.enum(["healthy", "degraded", "integrity_failed"])
}).strict();

export const queryAuditEventsInputV3Schema = z.object({
  startTime: timestampSchema.optional(),
  endTime: timestampSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(16).max(2048).regex(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/).optional(),
  eventTypes: z.array(z.enum([
    "authorization",
    "execution",
    "recovery",
    "administrative",
    "approval_lifecycle",
    "root_lease_lifecycle",
    "process_lifecycle",
    "snapshot_lifecycle"
  ])).min(1).max(8).refine(uniqueValues, "Audit event types must be unique.").optional(),
  toolNames: z.array(safeOneLineSchema)
    .min(1).max(32).refine(uniqueValues, "Audit tool names must be unique.").optional(),
  requestIds: z.array(safeIdSchema)
    .min(1).max(32).refine(uniqueValues, "Audit request IDs must be unique.").optional(),
  changeSetIds: z.array(z.string().regex(/^cs_[a-f0-9]{32}$/))
    .min(1).max(32).refine(uniqueValues, "Audit change-set IDs must be unique.").optional(),
  workspaceRefs: z.array(z.string().regex(/^awr_[a-f0-9]{32}$/))
    .min(1).max(32).refine(uniqueValues, "Audit workspace references must be unique.").optional(),
  statuses: z.array(z.enum(["not_executed", "succeeded", "failed", "rolled_back", "recovery_required"]))
    .min(1).max(5).refine(uniqueValues, "Audit execution statuses must be unique.").optional()
}).strict();

export const queryAuditEventsResultV3Schema: z.ZodType<QueryAuditEventsResultV3> = z.object({
  schemaVersion: z.literal(3),
  records: z.array(z.object({
    sequence: z.number().int().positive().safe(),
    event: persistedAuditEventSchema
  }).strict()).max(100),
  nextCursor: z.string().min(16).max(2048).regex(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/).nullable(),
  filterDigest: sha256Schema,
  startTime: timestampSchema,
  endTime: timestampSchema,
  limit: z.number().int().min(1).max(100),
  integrityState: z.enum(["healthy", "degraded", "integrity_failed"])
}).strict();

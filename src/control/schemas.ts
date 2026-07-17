import { z } from "zod";

export const localServerIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const approvalIdV3Schema = z.string().regex(/^approval_[a-f0-9]{32}$/);
export const processIdV3Schema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const common = {
  schemaVersion: z.literal(3),
  contractVersion: z.literal(3),
  serverId: localServerIdSchema
};

export const localApprovalListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.list")
}).strict();

export const localApprovalWatchRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.watch"),
  afterSequence: z.number().int().nonnegative().safe(),
  timeoutMs: z.number().int().min(1).max(30_000)
}).strict();

export const localApprovalApproveRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.approve"),
  approvalId: approvalIdV3Schema
}).strict();

export const localApprovalDenyRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.deny"),
  approvalId: approvalIdV3Schema
}).strict();

export const localProcessListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("processes.list")
}).strict();

export const localProcessTerminateRequestV3Schema = z.object({
  ...common,
  operation: z.literal("processes.terminate"),
  processId: processIdV3Schema
}).strict();

export const localControlRequestV3Schema = z.discriminatedUnion("operation", [
  localApprovalListRequestV3Schema,
  localApprovalWatchRequestV3Schema,
  localApprovalApproveRequestV3Schema,
  localApprovalDenyRequestV3Schema,
  localProcessListRequestV3Schema,
  localProcessTerminateRequestV3Schema
]);

export type LocalControlRequestV3 = z.infer<typeof localControlRequestV3Schema>;

export const localControlResponseV3Schema = z.object({
  schemaVersion: z.literal(3),
  contractVersion: z.literal(3),
  serverId: localServerIdSchema,
  ok: z.boolean(),
  code: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/),
  sequence: z.number().int().nonnegative().safe(),
  approvals: z.array(z.object({
    approvalId: approvalIdV3Schema,
    state: z.enum(["pending", "prepared", "granted", "denied", "expired", "reserved", "consumed", "burned"]),
    riskClass: z.enum(["R1", "R2", "R3"]),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    grantId: z.string().min(1).max(160).nullable(),
    reservationId: z.string().min(1).max(160).nullable(),
    summary: z.object({
      backend: z.string().min(1).max(80),
      actionKind: z.string().min(1).max(80),
      argumentCount: z.number().int().nonnegative(),
      logicalScope: z.string().min(1).max(160),
      identityLabel: z.string().min(1).max(120),
      authoritySummary: z.string().min(1).max(200),
      digestPrefix: z.string().regex(/^[a-f0-9]{8,32}$/),
      revealArguments: z.array(z.string().max(4096)).max(32).default([])
    }).strict()
  }).strict()).max(32),
  processes: z.array(z.object({
    processId: processIdV3Schema,
    state: z.string().min(1).max(80),
    summary: z.string().min(1).max(240)
  }).strict()).max(128),
  grantId: z.string().min(1).max(160).nullable(),
  changed: z.boolean()
}).strict();

export type LocalControlResponseV3 = z.infer<typeof localControlResponseV3Schema>;

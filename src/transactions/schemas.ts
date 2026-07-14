import path from "node:path";
import { z } from "zod";
import type {
  InstallationStateV1,
  ProcessInstanceRecordV1,
  TransactionManifestV1,
  WorkspaceLockOwnerV1
} from "./types.js";

const ISO_TIMESTAMP = z.string().datetime({ offset: true });
const SAFE_ID_PART = /^[a-z0-9][a-z0-9_-]*$/;

export const transactionIdSchema = z.string().regex(/^tx_[a-f0-9]{32}$/);
export const changeSetIdSchema = z.string().regex(/^cs_[a-f0-9]{32}$/);
export const workspaceStateKeySchema = z.string().regex(/^wsk_[a-f0-9]{32}$/);
export const operationIdSchema = z.string().min(4).max(80).refine(
  (value) => value.startsWith("op_") && SAFE_ID_PART.test(value.slice(3)),
  "Invalid transaction operation ID."
);
export const installationIdSchema = z.string().regex(/^install_[a-f0-9]{32}$/);
export const processInstanceIdSchema = z.string().regex(/^instance_[a-f0-9]{32}$/);
export const lockTokenSchema = z.string().regex(/^lock_[a-f0-9]{32}$/);
export const fileIdentitySchema = z.string().regex(/^fid_[a-f0-9]{24}$/);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

function isSafeRelativePath(value: string): boolean {
  if (!value || value === ".") return false;
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("\0")) return false;
  const segments = normalized.split("/");
  return segments.every((segment) =>
    Boolean(segment) && segment !== "." && segment !== ".." && !/^[A-Za-z]:$/.test(segment)
  );
}

export const transactionRelativePathSchema = z.string().min(1).max(4_096).refine(
  isSafeRelativePath,
  "Transaction paths must be safe workspace-relative paths."
);

const transactionArtifactPathSchema = transactionRelativePathSchema.refine((value) => {
  const basename = path.posix.basename(value.replace(/\\/g, "/"));
  return /^\.codexpro-txn-[a-f0-9]{16}\.(?:stage|backup|move)$/.test(basename);
}, "Transaction artifact path has an invalid reserved basename.");

export const fileMetadataV1Schema = z.object({
  mode: z.number().int().min(0).max(0xffff),
  atimeMs: z.number().finite().min(0),
  mtimeMs: z.number().finite().min(0)
}).strict();

const existingFileFactV1Schema = z.object({
  exists: z.literal(true),
  sha256: sha256Schema,
  identity: fileIdentitySchema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  metadata: fileMetadataV1Schema
}).strict();

const absentFileFactV1Schema = z.object({
  exists: z.literal(false),
  sha256: z.null(),
  identity: z.null(),
  bytes: z.literal(0),
  metadata: z.null(),
  existingParentIdentity: z.string().regex(/^parent_[a-f0-9]{24}$/).optional(),
  volumeDevice: z.string().min(1).max(80).optional()
}).strict();

const afterPresentFileFactV1Schema = z.object({
  exists: z.literal(true),
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  identity: fileIdentitySchema.optional()
}).strict();

const afterAbsentFileFactV1Schema = z.object({
  exists: z.literal(false),
  sha256: z.null(),
  bytes: z.literal(0),
  identity: z.null().optional()
}).strict();

export const transactionOperationV1Schema = z.object({
  operationId: operationIdSchema,
  kind: z.enum(["create", "replace", "delete"]),
  state: z.enum([
    "planned",
    "staged",
    "backup_ready",
    "target_absent_confirmed",
    "installed",
    "finalized",
    "rolled_back"
  ]),
  relativePath: transactionRelativePathSchema,
  comparisonKey: transactionRelativePathSchema,
  stageRelativePath: transactionArtifactPathSchema.nullable(),
  backupRelativePath: transactionArtifactPathSchema.nullable(),
  before: z.discriminatedUnion("exists", [existingFileFactV1Schema, absentFileFactV1Schema]),
  after: z.discriminatedUnion("exists", [afterPresentFileFactV1Schema, afterAbsentFileFactV1Schema])
}).strict().superRefine((value, context) => {
  const logical = value.relativePath.replace(/\\/g, "/");
  const logicalParent = path.posix.dirname(logical);
  for (const [field, artifact] of [
    ["stageRelativePath", value.stageRelativePath],
    ["backupRelativePath", value.backupRelativePath]
  ] as const) {
    if (artifact && path.posix.dirname(artifact.replace(/\\/g, "/")) !== logicalParent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Transaction artifacts must be siblings of their logical path."
      });
    }
  }

  const planned = value.state === "planned";
  if (value.kind === "create") {
    if (
      value.before.exists ||
      !value.after.exists ||
      value.backupRelativePath ||
      (planned ? value.stageRelativePath !== null : value.stageRelativePath === null)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Create operation facts are inconsistent." });
    }
  } else if (value.kind === "replace") {
    if (
      !value.before.exists ||
      !value.after.exists ||
      (planned ? value.stageRelativePath !== null || value.backupRelativePath !== null : value.stageRelativePath === null)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Replace operation facts are inconsistent." });
    }
  } else if (
    !value.before.exists ||
    value.after.exists ||
    value.stageRelativePath ||
    (planned ? value.backupRelativePath !== null : value.backupRelativePath === null)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Delete operation facts are inconsistent." });
  }
});

const transactionErrorCodeSchema = z.enum([
  "FILE_VERSION_CONFLICT",
  "TRANSACTION_BUSY",
  "ATOMIC_BACKEND_UNAVAILABLE",
  "TRANSACTION_PRECONDITION_FAILED",
  "TRANSACTION_FAILED",
  "ROLLBACK_FAILED",
  "TRANSACTION_RECOVERY_REQUIRED",
  "TRANSACTION_STATE_CORRUPT"
]);

const participantNameSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9._-]*$/);

export const transactionManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  transactionId: transactionIdSchema,
  changeSetId: changeSetIdSchema,
  workspaceStateKey: workspaceStateKeySchema,
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: ISO_TIMESTAMP,
  updatedAt: ISO_TIMESTAMP,
  state: z.enum([
    "preparing",
    "prepared",
    "committing",
    "committed_pending_participants",
    "committed",
    "rolling_back",
    "rolled_back",
    "recovery_required"
  ]),
  operations: z.array(transactionOperationV1Schema).min(1).max(1_000),
  createdDirectories: z.array(transactionRelativePathSchema).max(1_000),
  requiredParticipants: z.array(participantNameSchema).max(32),
  participantFacts: z.record(participantNameSchema, z.enum(["pending", "committed", "failed"])),
  failureCode: transactionErrorCodeSchema.optional(),
  failureMessage: z.string().min(1).max(500).refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Failure message must be one safe line."
  ).optional(),
  directorySync: z.enum(["supported", "unsupported", "failed"]).optional()
}).strict().superRefine((value, context) => {
  const operationIds = value.operations.map((operation) => operation.operationId);
  if (new Set(operationIds).size !== operationIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operations"],
      message: "Transaction operation IDs must be unique."
    });
  }
  const comparisonKeys = value.operations.map((operation) => operation.comparisonKey);
  if (new Set(comparisonKeys).size !== comparisonKeys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operations"],
      message: "Transaction comparison keys must be unique."
    });
  }
  if (new Set(value.requiredParticipants).size !== value.requiredParticipants.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiredParticipants"],
      message: "Transaction participants must be unique."
    });
  }
  const required = new Set(value.requiredParticipants);
  for (const name of Object.keys(value.participantFacts)) {
    if (!required.has(name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantFacts", name],
        message: "Participant facts must refer to a required participant."
      });
    }
  }
}) as z.ZodType<TransactionManifestV1>;

export const installationStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  installationId: installationIdSchema,
  masterKeyBase64: z.string().refine((value) => {
    try {
      return Buffer.from(value, "base64").length === 32 && Buffer.from(value, "base64").toString("base64") === value;
    } catch {
      return false;
    }
  }, "Installation master key must be exactly 32 bytes of canonical base64."),
  createdAt: ISO_TIMESTAMP
}).strict() as z.ZodType<InstallationStateV1>;

export const processInstanceRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  instanceId: processInstanceIdSchema,
  pid: z.number().int().positive().max(0x7fffffff),
  createdAt: ISO_TIMESTAMP
}).strict() as z.ZodType<ProcessInstanceRecordV1>;

export const workspaceLockOwnerV1Schema = z.object({
  schemaVersion: z.literal(1),
  lockToken: lockTokenSchema,
  instanceId: processInstanceIdSchema,
  pid: z.number().int().positive().max(0x7fffffff),
  transactionId: transactionIdSchema,
  createdAt: ISO_TIMESTAMP
}).strict() as z.ZodType<WorkspaceLockOwnerV1>;

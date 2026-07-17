import { z } from "zod";
import {
  changeSetIdSchema,
  fileMetadataV1Schema,
  fileObjectIdentityV2Schema,
  operationIdSchema,
  sha256Schema,
  transactionIdSchema,
  transactionRelativePathSchema,
  workspaceStateKeySchema
} from "../transactions/schemas.js";
import type {
  ChangeSetManifestDraftV1,
  ChangeSetManifestV1,
  ChangeSetOperationV1,
  MoveChangeSetManifestDraftV2,
  MoveChangeSetManifestV2,
  MoveChangeSetOperationV2
} from "./types.js";

const ISO_TIMESTAMP = z.string().datetime({ offset: true });
const SAFE_ID = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/);
export const changeSetBlobIdSchema = z.string().regex(/^blob_[a-f0-9]{32}$/);
export const changeSetOwnerBindingSchema = z.string().regex(/^owner_[a-f0-9]{64}$/);

const presentBeforeFactSchema = z.object({
  exists: z.literal(true),
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  metadata: fileMetadataV1Schema
}).strict();

const absentBeforeFactSchema = z.object({
  exists: z.literal(false),
  sha256: z.null(),
  bytes: z.literal(0),
  metadata: z.null()
}).strict();

const presentAfterFactSchema = z.object({
  exists: z.literal(true),
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
}).strict();

const absentAfterFactSchema = z.object({
  exists: z.literal(false),
  sha256: z.null(),
  bytes: z.literal(0)
}).strict();

export const changeSetOperationV1Schema = z.object({
  operationId: operationIdSchema,
  kind: z.enum(["create", "replace", "delete", "move"]),
  relativePath: transactionRelativePathSchema,
  destinationRelativePath: transactionRelativePathSchema.nullable(),
  before: z.discriminatedUnion("exists", [presentBeforeFactSchema, absentBeforeFactSchema]),
  after: z.discriminatedUnion("exists", [presentAfterFactSchema, absentAfterFactSchema]),
  blobId: changeSetBlobIdSchema.nullable()
}).strict().superRefine((value, context) => {
  const invalid =
    value.kind === "create"
      ? value.before.exists || !value.after.exists || value.blobId !== null || value.destinationRelativePath !== null
      : value.kind === "replace"
        ? !value.before.exists || !value.after.exists || value.destinationRelativePath !== null
        : value.kind === "delete"
          ? !value.before.exists || value.after.exists || value.destinationRelativePath !== null
          : !value.before.exists || !value.after.exists || value.blobId !== null || value.destinationRelativePath === null;
  if (invalid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Change-set operation facts are inconsistent."
    });
  }
  if (value.destinationRelativePath === value.relativePath) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationRelativePath"],
      message: "Move destination must differ from its source."
    });
  }
}) as z.ZodType<ChangeSetOperationV1>;

export const changeSetStateSchema = z.enum([
  "active",
  "undone",
  "undo_expired",
  "recovery_required"
]);

export const changeSetUndoReasonSchema = z.enum([
  "retention_disabled",
  "plaintext_limit",
  "installation_limit",
  "workspace_count_limit",
  "retention_unavailable",
  "operation_unsupported",
  "reverted_change_set",
  "expired",
  "already_undone",
  "recovery_required"
]);

const changeSetManifestShape = {
  schemaVersion: z.literal(1),
  changeSetId: changeSetIdSchema,
  transactionId: transactionIdSchema,
  workspaceStateKey: workspaceStateKeySchema,
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: ISO_TIMESTAMP,
  updatedAt: ISO_TIMESTAMP,
  expiresAt: ISO_TIMESTAMP,
  toolName: SAFE_ID,
  requestId: SAFE_ID.nullable(),
  ownerBinding: changeSetOwnerBindingSchema,
  policyRevision: SAFE_ID,
  contractVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  state: changeSetStateSchema,
  undoSupported: z.boolean(),
  undoReason: changeSetUndoReasonSchema.nullable(),
  operations: z.array(changeSetOperationV1Schema).min(1).max(1_000),
  plaintextBytes: z.number().int().nonnegative().max(64 * 1024 * 1024),
  ciphertextBytes: z.number().int().nonnegative().max(64 * 1024 * 1024 + 37 * 1_000),
  revertsChangeSetId: changeSetIdSchema.nullable()
} as const;

function refineChangeSetManifest(
  value: ChangeSetManifestDraftV1 | ChangeSetManifestV1,
  context: z.RefinementCtx
): void {
  const created = Date.parse(value.createdAt);
  const updated = Date.parse(value.updatedAt);
  const expires = Date.parse(value.expiresAt);
  if (updated < created || expires <= created) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Change-set timestamps are inconsistent." });
  }
  if (value.undoSupported !== (value.undoReason === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Undo support and reason are inconsistent." });
  }
  if (value.undoSupported && value.operations.some((operation) =>
    (operation.kind === "replace" || operation.kind === "delete") && operation.blobId === null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Undoable content changes require rollback blobs." });
  }
  if (value.state === "undo_expired" && value.undoReason !== "expired") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Expired change sets require the expired reason." });
  }
  if (value.state === "undone" && value.undoReason !== "already_undone") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Undone change sets require the already-undone reason." });
  }
  if (value.state === "recovery_required" && value.undoReason !== "recovery_required") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Recovery-required change sets require a matching reason." });
  }
  const operationIds = value.operations.map((operation) => operation.operationId);
  const sourcePaths = value.operations.map((operation) => operation.relativePath.replace(/\\/g, "/"));
  const blobIds = value.operations.flatMap((operation) => operation.blobId ? [operation.blobId] : []);
  if (new Set(operationIds).size !== operationIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Operation IDs must be unique." });
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Operation paths must be unique." });
  }
  if (new Set(blobIds).size !== blobIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Blob IDs must be unique." });
  }
}

const changeSetManifestDraftObjectV1Schema = z.object(changeSetManifestShape).strict();

export const changeSetManifestDraftV1Schema = changeSetManifestDraftObjectV1Schema
  .superRefine(refineChangeSetManifest) as z.ZodType<ChangeSetManifestDraftV1>;

export const changeSetManifestV1Schema = changeSetManifestDraftObjectV1Schema.extend({
  manifestMac: sha256Schema
}).strict().superRefine(refineChangeSetManifest) as z.ZodType<ChangeSetManifestV1>;

export const moveChangeSetOperationV2Schema = z.object({
  operationId: operationIdSchema,
  kind: z.literal("move"),
  sourceRelativePath: transactionRelativePathSchema,
  destinationRelativePath: transactionRelativePathSchema,
  sourceComparisonKey: transactionRelativePathSchema,
  destinationComparisonKey: transactionRelativePathSchema,
  objectIdentity: fileObjectIdentityV2Schema,
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
}).strict().superRefine((value, context) => {
  if (
    value.sourceRelativePath === value.destinationRelativePath ||
    (value.sourceComparisonKey === value.destinationComparisonKey &&
      value.sourceRelativePath === value.destinationRelativePath)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Move change-set operation cannot be an exact no-op." });
  }
}) as z.ZodType<MoveChangeSetOperationV2>;

const moveChangeSetManifestShapeV2 = {
  schemaVersion: z.literal(2),
  changeSetId: changeSetIdSchema,
  transactionId: transactionIdSchema,
  workspaceStateKey: workspaceStateKeySchema,
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: ISO_TIMESTAMP,
  updatedAt: ISO_TIMESTAMP,
  expiresAt: ISO_TIMESTAMP,
  toolName: z.enum(["move_paths", "undo_change_set"]),
  requestId: SAFE_ID.nullable(),
  ownerBinding: changeSetOwnerBindingSchema,
  policyRevision: SAFE_ID,
  contractVersion: z.union([z.literal(2), z.literal(3)]),
  state: changeSetStateSchema,
  undoSupported: z.boolean(),
  undoReason: changeSetUndoReasonSchema.nullable(),
  operations: z.array(moveChangeSetOperationV2Schema).min(1).max(64),
  createdDirectories: z.array(transactionRelativePathSchema).max(1_024),
  createdDirectoryIdentities: z.record(transactionRelativePathSchema, fileObjectIdentityV2Schema),
  plaintextBytes: z.literal(0),
  ciphertextBytes: z.literal(0),
  revertsChangeSetId: changeSetIdSchema.nullable()
} as const;

function refineMoveChangeSetManifest(
  value: MoveChangeSetManifestDraftV2 | MoveChangeSetManifestV2,
  context: z.RefinementCtx
): void {
  const created = Date.parse(value.createdAt);
  const updated = Date.parse(value.updatedAt);
  const expires = Date.parse(value.expiresAt);
  if (updated < created || expires <= created) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Move change-set timestamps are inconsistent." });
  }
  if (value.undoSupported !== (value.undoReason === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Move undo support and reason are inconsistent." });
  }
  if (value.state === "undo_expired" && value.undoReason !== "expired") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Expired move change sets require the expired reason." });
  }
  if (value.state === "undone" && value.undoReason !== "already_undone") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Undone move change sets require the already-undone reason." });
  }
  if (value.state === "recovery_required" && value.undoReason !== "recovery_required") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Recovery-required move change sets require a matching reason." });
  }
  if (value.revertsChangeSetId !== null && (value.undoSupported || value.undoReason !== "reverted_change_set")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Reverse move change sets are non-redo evidence." });
  }
  const operationIds = value.operations.map((operation) => operation.operationId);
  const sourceKeys = value.operations.map((operation) => operation.sourceComparisonKey);
  const destinationKeys = value.operations.map((operation) => operation.destinationComparisonKey);
  if (new Set(operationIds).size !== operationIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Move operation IDs must be unique." });
  }
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Move source paths must be unique." });
  }
  if (new Set(destinationKeys).size !== destinationKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "Move destination paths must be unique." });
  }
  if (new Set(value.createdDirectories).size !== value.createdDirectories.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["createdDirectories"], message: "Move-created directories must be unique." });
  }
  const identityNames = Object.keys(value.createdDirectoryIdentities);
  if (identityNames.length !== value.createdDirectories.length ||
      identityNames.some((directory) => !value.createdDirectories.includes(directory))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["createdDirectoryIdentities"], message: "Every move-created directory requires one authenticated identity." });
  }
}

const moveChangeSetManifestDraftObjectV2Schema = z.object(moveChangeSetManifestShapeV2).strict();

export const moveChangeSetManifestDraftV2Schema = moveChangeSetManifestDraftObjectV2Schema
  .superRefine(refineMoveChangeSetManifest) as z.ZodType<MoveChangeSetManifestDraftV2>;

export const moveChangeSetManifestV2Schema = moveChangeSetManifestDraftObjectV2Schema.extend({
  manifestMac: sha256Schema
}).strict().superRefine(refineMoveChangeSetManifest) as z.ZodType<MoveChangeSetManifestV2>;

export const changeSetManifestSchema = z.union([
  changeSetManifestV1Schema,
  moveChangeSetManifestV2Schema
]);

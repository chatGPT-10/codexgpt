import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

const workspaceIdSchema = z.string().min(1).max(160);
const safeRelativePathSchema = z.string().min(1).max(4_096).refine((value) => {
  if (value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.includes(":")) return false;
  return normalized.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}, "Move paths must be safe workspace-relative paths.");
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const transactionIdSchema = z.string().regex(/^tx_[a-f0-9]{32}$/);
const changeSetIdSchema = z.string().regex(/^cs_[a-f0-9]{32}$/);

export const movePathItemV1Schema = z.object({
  source: safeRelativePathSchema,
  destination: safeRelativePathSchema,
  expected_sha256: sha256Schema
}).strict();

export const movePathsInputV1Schema = z.object({
  workspace_id: workspaceIdSchema,
  moves: z.array(movePathItemV1Schema).min(1).max(64),
  create_parents: z.boolean().optional(),
  preview: z.boolean().optional()
}).strict();

export const movePathsTransactionSchema = z.object({
  change_set_id: changeSetIdSchema,
  transaction_id: transactionIdSchema,
  before_state: z.literal("present"),
  operation_count: z.number().int().positive().max(64),
  undo_supported: z.boolean(),
  committed_at: z.string().datetime({ offset: true })
}).strict();

export const movePathsDataSchema = z.object({
  workspace_id: workspaceIdSchema,
  root: z.string().min(1).max(32_768),
  preview: z.boolean(),
  moves: z.array(z.object({
    source: safeRelativePathSchema,
    destination: safeRelativePathSchema,
    sha256: sha256Schema,
    bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  }).strict()).min(1).max(64),
  created_directories: z.array(safeRelativePathSchema).max(1_024),
  total_files: z.number().int().positive().max(64),
  total_bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  transaction: movePathsTransactionSchema.nullable()
}).strict().superRefine((value, context) => {
  if (value.total_files !== value.moves.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["total_files"], message: "total_files must equal moves.length." });
  }
  if (value.total_bytes !== value.moves.reduce((sum, move) => sum + move.bytes, 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["total_bytes"], message: "total_bytes must equal the move byte total." });
  }
  if (value.preview !== (value.transaction === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["transaction"], message: "Preview results cannot claim a committed transaction." });
  }
  if (value.transaction && value.transaction.operation_count !== value.moves.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["transaction", "operation_count"], message: "Transaction operation count must equal moves.length." });
  }
});

export const MOVE_PATHS_ERROR_MESSAGES = Object.freeze({
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open it before retrying.",
  INVALID_ARGUMENT: "The move request is invalid.",
  DUPLICATE_SOURCE: "A move source appears more than once.",
  DUPLICATE_DESTINATION: "A move destination appears more than once.",
  MOVE_NO_OP: "A move source and destination are identical.",
  SOURCE_NOT_FOUND: "A required move source was not found.",
  NOT_A_FILE: "Move paths support ordinary files only.",
  PATH_OUTSIDE_WORKSPACE: "A move path is outside the authorized workspace.",
  PATH_BLOCKED: "A move path is blocked by workspace policy.",
  SYMLINK_NOT_ALLOWED: "Symbolic links, junctions, and reparse-point paths are not allowed.",
  TARGET_EXISTS: "An unrelated destination already exists.",
  PARENT_DIRECTORY_NOT_FOUND: "A destination parent directory does not exist.",
  PARENT_PATH_CONFLICT: "A destination parent path conflicts with an existing non-directory entry.",
  CROSS_VOLUME_MOVE: "Move sources and destinations must be on the same volume.",
  FILE_VERSION_CONFLICT: "A move source or destination changed after validation.",
  TRANSACTION_BUSY: "Another workspace transaction is active. Retry after it completes.",
  ATOMIC_BACKEND_UNAVAILABLE: "The filesystem cannot provide the required stable identity and hard-link guarantees.",
  AUDIT_UNAVAILABLE: "The required persistent audit record could not be completed, so the move was rolled back.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  TRANSACTION_FAILED: "The atomic move failed and no successful commit was acknowledged.",
  ROLLBACK_FAILED: "The move failed and rollback could not be proven complete.",
  TRANSACTION_RECOVERY_REQUIRED: "The workspace requires transaction recovery before another mutation.",
  INTERNAL_ERROR: "The move could not be completed because of an internal integrity or runtime error."
} as const);

export type MovePathsErrorCode = keyof typeof MOVE_PATHS_ERROR_MESSAGES;

const retryableByCode: Readonly<Record<MovePathsErrorCode, boolean>> = Object.freeze({
  WORKSPACE_NOT_FOUND: false,
  INVALID_ARGUMENT: false,
  DUPLICATE_SOURCE: false,
  DUPLICATE_DESTINATION: false,
  MOVE_NO_OP: false,
  SOURCE_NOT_FOUND: false,
  NOT_A_FILE: false,
  PATH_OUTSIDE_WORKSPACE: false,
  PATH_BLOCKED: false,
  SYMLINK_NOT_ALLOWED: false,
  TARGET_EXISTS: false,
  PARENT_DIRECTORY_NOT_FOUND: false,
  PARENT_PATH_CONFLICT: false,
  CROSS_VOLUME_MOVE: false,
  FILE_VERSION_CONFLICT: false,
  TRANSACTION_BUSY: true,
  ATOMIC_BACKEND_UNAVAILABLE: false,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  TRANSACTION_FAILED: true,
  ROLLBACK_FAILED: false,
  TRANSACTION_RECOVERY_REQUIRED: false,
  INTERNAL_ERROR: false
});

const errorCodeSchema = z.enum(Object.keys(MOVE_PATHS_ERROR_MESSAGES) as [MovePathsErrorCode, ...MovePathsErrorCode[]]);
const safeDetailsSchema = z.object({
  workspace_id: workspaceIdSchema.optional(),
  source: safeRelativePathSchema.optional(),
  destination: safeRelativePathSchema.optional(),
  move_count: z.number().int().nonnegative().max(64).optional()
}).strict();

export const movePathsErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: safeDetailsSchema
}).strict().superRefine((value, context) => {
  if (value.message !== MOVE_PATHS_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Move error message is not canonical." });
  }
  if (value.retryable !== retryableByCode[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryable"], message: "Move retryability is not canonical." });
  }
});

export const movePathsOutputShape = {
  codexpro_tool: z.literal("move_paths"),
  codexpro_title: z.literal("Move Paths"),
  ok: z.boolean(),
  data: movePathsDataSchema.nullable(),
  error: movePathsErrorSchema.nullable(),
  meta: toolMetaSchema
};

const movePathsOutputBaseSchema = z.object(movePathsOutputShape).strict();

export const movePathsOutputSchema = movePathsOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful move requires data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful move requires no error." });
  } else {
    if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed move cannot return data." });
    if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed move requires an error." });
  }
});

export type MovePathsData = z.infer<typeof movePathsDataSchema>;
export type MovePathsStructuredResult = z.infer<typeof movePathsOutputBaseSchema>;

export function createMovePathsSuccess(data: MovePathsData, durationMs = 0): MovePathsStructuredResult {
  return movePathsOutputSchema.parse({
    codexpro_tool: "move_paths",
    codexpro_title: "Move Paths",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createMovePathsFailure(
  code: MovePathsErrorCode,
  details: z.infer<typeof safeDetailsSchema> = {},
  durationMs = 0
): MovePathsStructuredResult {
  return movePathsOutputSchema.parse({
    codexpro_tool: "move_paths",
    codexpro_title: "Move Paths",
    ok: false,
    data: null,
    error: { code, message: MOVE_PATHS_ERROR_MESSAGES[code], retryable: retryableByCode[code], details },
    meta: createToolMeta(durationMs)
  });
}

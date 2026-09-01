import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import { transactionResultV2Schema } from "./transactionResult.js";
import { changeWorkflowStateSchema } from "./changeWorkflow.js";

export const WRITE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules, including unsafe symlink targets.",
  NOT_A_FILE: "The requested path is not a regular file.",
  FILE_NOT_TEXT: "The existing target is not supported as a text file.",
  FILE_TOO_LARGE: "The requested write exceeds the configured file-size limit.",
  SECRET_CONTENT_BLOCKED: "Secret-looking content is blocked because the requested content appears to contain a secret value.",
  FILE_ALREADY_EXISTS: "The target already exists and overwrite was disabled.",
  PARENT_DIRECTORY_NOT_FOUND: "The target parent directory does not exist and create_dirs was disabled.",
  WRITE_FAILED: "The file could not be written by the operating system.",
  INTERNAL_ERROR: "The file could not be written because of an internal error."
} as const;

export const writeDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string().min(1),
  existed: z.boolean(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string()
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const fileTooLargeDetailsSchema = z.object({
  path: z.string().min(1).max(240),
  scope: z.enum(["content", "existing_file"]),
  limit_bytes: z.number().int().positive()
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(WRITE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(WRITE_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(WRITE_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const notAFileErrorSchema = z.object({
  code: z.literal("NOT_A_FILE"),
  message: z.literal(WRITE_ERROR_MESSAGES.NOT_A_FILE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotTextErrorSchema = z.object({
  code: z.literal("FILE_NOT_TEXT"),
  message: z.literal(WRITE_ERROR_MESSAGES.FILE_NOT_TEXT),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileTooLargeErrorSchema = z.object({
  code: z.literal("FILE_TOO_LARGE"),
  message: z.literal(WRITE_ERROR_MESSAGES.FILE_TOO_LARGE),
  retryable: z.literal(false),
  details: fileTooLargeDetailsSchema
}).strict();

const secretContentBlockedErrorSchema = z.object({
  code: z.literal("SECRET_CONTENT_BLOCKED"),
  message: z.literal(WRITE_ERROR_MESSAGES.SECRET_CONTENT_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileAlreadyExistsErrorSchema = z.object({
  code: z.literal("FILE_ALREADY_EXISTS"),
  message: z.literal(WRITE_ERROR_MESSAGES.FILE_ALREADY_EXISTS),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const parentDirectoryNotFoundErrorSchema = z.object({
  code: z.literal("PARENT_DIRECTORY_NOT_FOUND"),
  message: z.literal(WRITE_ERROR_MESSAGES.PARENT_DIRECTORY_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const writeFailedErrorSchema = z.object({
  code: z.literal("WRITE_FAILED"),
  message: z.literal(WRITE_ERROR_MESSAGES.WRITE_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(WRITE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const writeErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  notAFileErrorSchema,
  fileNotTextErrorSchema,
  fileTooLargeErrorSchema,
  secretContentBlockedErrorSchema,
  fileAlreadyExistsErrorSchema,
  parentDirectoryNotFoundErrorSchema,
  writeFailedErrorSchema,
  internalErrorSchema
]);

export const writeOutputShape = {
  codexgpt_tool: z.literal("write"),
  codexgpt_title: z.literal("Write File"),
  ok: z.boolean(),
  data: writeDataSchema.nullable(),
  error: writeErrorSchema.nullable(),
  meta: toolMetaSchema
};

const writeOutputBaseSchema = z.object(writeOutputShape).strict();

export const writeOutputSchema = writeOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful write results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful write results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed write results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed write results require an error object."
    });
  }
});

export type WriteData = z.infer<typeof writeDataSchema>;
export type WriteStructuredResult = z.infer<typeof writeOutputBaseSchema>;

export type WriteFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "NOT_A_FILE"; details: { path: string } }
  | { code: "FILE_NOT_TEXT"; details: { path: string } }
  | { code: "FILE_TOO_LARGE"; details: { path: string; scope: "content" | "existing_file"; limit_bytes: number } }
  | { code: "SECRET_CONTENT_BLOCKED"; details: { path: string } }
  | { code: "FILE_ALREADY_EXISTS"; details: { path: string } }
  | { code: "PARENT_DIRECTORY_NOT_FOUND"; details: { path: string } }
  | { code: "WRITE_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createWriteSuccess(
  data: WriteData,
  durationMs = 0
): WriteStructuredResult {
  return writeOutputSchema.parse({
    codexgpt_tool: "write",
    codexgpt_title: "Write File",
    ok: true,
    data: writeDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createWriteFailure(
  failure: WriteFailureInput,
  durationMs = 0
): WriteStructuredResult {
  return writeOutputSchema.parse({
    codexgpt_tool: "write",
    codexgpt_title: "Write File",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: WRITE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export const WRITE_TRANSACTION_ERROR_MESSAGES = {
  FILE_VERSION_CONFLICT: "The target changed since the expected version was read. Read the file again before retrying.",
  TRANSACTION_BUSY: "Another workspace transaction is active. Retry after it completes.",
  ATOMIC_BACKEND_UNAVAILABLE: "The filesystem cannot provide the required atomic mutation guarantees.",
  AUDIT_UNAVAILABLE: "The required persistent audit record could not be completed, so the write was rolled back.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  TRANSACTION_FAILED: "The atomic write failed and no successful commit was acknowledged.",
  ROLLBACK_FAILED: "The write failed and rollback could not be proven complete.",
  TRANSACTION_RECOVERY_REQUIRED: "The workspace requires transaction recovery before another write."
} as const;

const writeTransactionRetryable = {
  FILE_VERSION_CONFLICT: false,
  TRANSACTION_BUSY: true,
  ATOMIC_BACKEND_UNAVAILABLE: false,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  TRANSACTION_FAILED: true,
  ROLLBACK_FAILED: false,
  TRANSACTION_RECOVERY_REQUIRED: false
} as const;

const writeTransactionErrorCodeSchema = z.enum([
  "FILE_VERSION_CONFLICT",
  "TRANSACTION_BUSY",
  "ATOMIC_BACKEND_UNAVAILABLE",
  "AUDIT_UNAVAILABLE",
  "AUDIT_INTEGRITY_FAILURE",
  "TRANSACTION_FAILED",
  "ROLLBACK_FAILED",
  "TRANSACTION_RECOVERY_REQUIRED"
]);

const writeTransactionErrorSchema = z.object({
  code: writeTransactionErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.union([pathDetailsSchema, emptyDetailsSchema])
}).strict().superRefine((value, context) => {
  if (value.message !== WRITE_TRANSACTION_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Unexpected transaction error message." });
  }
  if (value.retryable !== writeTransactionRetryable[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryable"], message: "Unexpected transaction retryability." });
  }
  const hasPath = Object.prototype.hasOwnProperty.call(value.details, "path");
  if ((value.code === "FILE_VERSION_CONFLICT") !== hasPath) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Unexpected transaction error details." });
  }
});

export const writeDataSchemaV2 = writeDataSchema.extend({
  transaction: transactionResultV2Schema,
  before_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable()
}).strict();

export const writeErrorSchemaV2 = z.union([writeErrorSchema, writeTransactionErrorSchema]);

export const writeOutputShapeV2 = {
  codexgpt_tool: z.literal("write"),
  codexgpt_title: z.literal("Write File"),
  ok: z.boolean(),
  data: writeDataSchemaV2.nullable(),
  error: writeErrorSchemaV2.nullable(),
  meta: toolMetaSchema
};

const writeOutputBaseSchemaV2 = z.object(writeOutputShapeV2).strict();

export const writeOutputSchemaV2 = writeOutputBaseSchemaV2.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful write results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful write results require error to be null." });
    return;
  }
  if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed write results require data to be null." });
  if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed write results require an error object." });
});

export type WriteDataV2 = z.infer<typeof writeDataSchemaV2>;
export type WriteStructuredResultV2 = z.infer<typeof writeOutputBaseSchemaV2>;
export type WriteTransactionErrorCode = z.infer<typeof writeTransactionErrorCodeSchema>;

export const writeDataSchemaV5 = writeDataSchemaV2.extend({
  workflow: changeWorkflowStateSchema.optional()
}).strict();

export const writeOutputShapeV5 = {
  ...writeOutputShapeV2,
  data: writeDataSchemaV5.nullable()
};

const writeOutputBaseSchemaV5 = z.object(writeOutputShapeV5).strict();

export const writeOutputSchemaV5 = writeOutputBaseSchemaV5.superRefine((value, context) => {
  if (value.ok && (value.data === null || value.error !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful V5 write results require data and no error." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed V5 write results require an error and no data." });
  }
});

export function createWriteSuccessV2(
  data: WriteDataV2,
  durationMs = 0
): WriteStructuredResultV2 {
  return writeOutputSchemaV2.parse({
    codexgpt_tool: "write",
    codexgpt_title: "Write File",
    ok: true,
    data: writeDataSchemaV2.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createWriteTransactionFailureV2(
  failure: {
    code: WriteTransactionErrorCode;
    details: { path: string } | Record<string, never>;
  },
  durationMs = 0
): WriteStructuredResultV2 {
  return writeOutputSchemaV2.parse({
    codexgpt_tool: "write",
    codexgpt_title: "Write File",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: WRITE_TRANSACTION_ERROR_MESSAGES[failure.code],
      retryable: writeTransactionRetryable[failure.code],
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

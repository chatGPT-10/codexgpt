import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import { transactionResultV2Schema } from "./transactionResult.js";

export const EDIT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules, including unsafe symlink targets.",
  FILE_NOT_FOUND: "The requested file does not exist.",
  NOT_A_FILE: "The requested path is not a regular file.",
  FILE_NOT_TEXT: "The requested file is not supported as a text file.",
  FILE_TOO_LARGE: "The requested edit exceeds the configured file-size limit.",
  INVALID_ARGUMENT: "The requested edit contains an invalid argument.",
  OLD_TEXT_NOT_FOUND: "The requested old_text was not found in the file.",
  OLD_TEXT_NOT_UNIQUE: "The requested old_text matched more than once. Use a more specific old_text or enable replace_all.",
  REPLACEMENT_COUNT_MISMATCH: "The requested replacement count did not match the number of replacements that would be performed.",
  SECRET_CONTENT_BLOCKED: "Secret-looking content is blocked because the edited file appears to contain a secret value.",
  EDIT_FAILED: "The file could not be edited by the operating system.",
  INTERNAL_ERROR: "The file could not be edited because of an internal error."
} as const;

export const editDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string().min(1),
  replacements: z.number().int().positive(),
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
  scope: z.enum(["existing_file", "edited_file"]),
  limit_bytes: z.number().int().positive()
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.literal("old_text")
}).strict();

const textNotUniqueDetailsSchema = z.object({
  path: z.string().min(1).max(240),
  matches: z.number().int().positive()
}).strict();

const replacementCountMismatchDetailsSchema = z.object({
  path: z.string().min(1).max(240),
  expected: z.number().int().nonnegative(),
  actual: z.number().int().positive()
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(EDIT_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(EDIT_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(EDIT_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotFoundErrorSchema = z.object({
  code: z.literal("FILE_NOT_FOUND"),
  message: z.literal(EDIT_ERROR_MESSAGES.FILE_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const notAFileErrorSchema = z.object({
  code: z.literal("NOT_A_FILE"),
  message: z.literal(EDIT_ERROR_MESSAGES.NOT_A_FILE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotTextErrorSchema = z.object({
  code: z.literal("FILE_NOT_TEXT"),
  message: z.literal(EDIT_ERROR_MESSAGES.FILE_NOT_TEXT),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileTooLargeErrorSchema = z.object({
  code: z.literal("FILE_TOO_LARGE"),
  message: z.literal(EDIT_ERROR_MESSAGES.FILE_TOO_LARGE),
  retryable: z.literal(false),
  details: fileTooLargeDetailsSchema
}).strict();

const invalidArgumentErrorSchema = z.object({
  code: z.literal("INVALID_ARGUMENT"),
  message: z.literal(EDIT_ERROR_MESSAGES.INVALID_ARGUMENT),
  retryable: z.literal(false),
  details: invalidArgumentDetailsSchema
}).strict();

const oldTextNotFoundErrorSchema = z.object({
  code: z.literal("OLD_TEXT_NOT_FOUND"),
  message: z.literal(EDIT_ERROR_MESSAGES.OLD_TEXT_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const oldTextNotUniqueErrorSchema = z.object({
  code: z.literal("OLD_TEXT_NOT_UNIQUE"),
  message: z.literal(EDIT_ERROR_MESSAGES.OLD_TEXT_NOT_UNIQUE),
  retryable: z.literal(false),
  details: textNotUniqueDetailsSchema
}).strict();

const replacementCountMismatchErrorSchema = z.object({
  code: z.literal("REPLACEMENT_COUNT_MISMATCH"),
  message: z.literal(EDIT_ERROR_MESSAGES.REPLACEMENT_COUNT_MISMATCH),
  retryable: z.literal(false),
  details: replacementCountMismatchDetailsSchema
}).strict();

const secretContentBlockedErrorSchema = z.object({
  code: z.literal("SECRET_CONTENT_BLOCKED"),
  message: z.literal(EDIT_ERROR_MESSAGES.SECRET_CONTENT_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const editFailedErrorSchema = z.object({
  code: z.literal("EDIT_FAILED"),
  message: z.literal(EDIT_ERROR_MESSAGES.EDIT_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(EDIT_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const editErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  fileNotFoundErrorSchema,
  notAFileErrorSchema,
  fileNotTextErrorSchema,
  fileTooLargeErrorSchema,
  invalidArgumentErrorSchema,
  oldTextNotFoundErrorSchema,
  oldTextNotUniqueErrorSchema,
  replacementCountMismatchErrorSchema,
  secretContentBlockedErrorSchema,
  editFailedErrorSchema,
  internalErrorSchema
]);

export const editOutputShape = {
  codexgpt_tool: z.literal("edit"),
  codexgpt_title: z.literal("Edit File"),
  ok: z.boolean(),
  data: editDataSchema.nullable(),
  error: editErrorSchema.nullable(),
  meta: toolMetaSchema
};

const editOutputBaseSchema = z.object(editOutputShape).strict();

export const editOutputSchema = editOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful edit results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful edit results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed edit results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed edit results require an error object."
    });
  }
});

export type EditData = z.infer<typeof editDataSchema>;
export type EditStructuredResult = z.infer<typeof editOutputBaseSchema>;

export type EditFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "NOT_A_FILE"; details: { path: string } }
  | { code: "FILE_NOT_TEXT"; details: { path: string } }
  | { code: "FILE_TOO_LARGE"; details: { path: string; scope: "existing_file" | "edited_file"; limit_bytes: number } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "old_text" } }
  | { code: "OLD_TEXT_NOT_FOUND"; details: { path: string } }
  | { code: "OLD_TEXT_NOT_UNIQUE"; details: { path: string; matches: number } }
  | { code: "REPLACEMENT_COUNT_MISMATCH"; details: { path: string; expected: number; actual: number } }
  | { code: "SECRET_CONTENT_BLOCKED"; details: { path: string } }
  | { code: "EDIT_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createEditSuccess(
  data: EditData,
  durationMs = 0
): EditStructuredResult {
  return editOutputSchema.parse({
    codexgpt_tool: "edit",
    codexgpt_title: "Edit File",
    ok: true,
    data: editDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createEditFailure(
  failure: EditFailureInput,
  durationMs = 0
): EditStructuredResult {
  return editOutputSchema.parse({
    codexgpt_tool: "edit",
    codexgpt_title: "Edit File",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: EDIT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export const EDIT_TRANSACTION_ERROR_MESSAGES = {
  FILE_VERSION_CONFLICT: "The target changed since the expected version was read. Read the file again before retrying.",
  TRANSACTION_BUSY: "Another workspace transaction is active. Retry after it completes.",
  ATOMIC_BACKEND_UNAVAILABLE: "The filesystem cannot provide the required atomic mutation guarantees.",
  AUDIT_UNAVAILABLE: "The required persistent audit record could not be completed, so the edit was rolled back.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  TRANSACTION_FAILED: "The atomic edit failed and no successful commit was acknowledged.",
  ROLLBACK_FAILED: "The edit failed and rollback could not be proven complete.",
  TRANSACTION_RECOVERY_REQUIRED: "The workspace requires transaction recovery before another edit."
} as const;

const editTransactionRetryable = {
  FILE_VERSION_CONFLICT: false,
  TRANSACTION_BUSY: true,
  ATOMIC_BACKEND_UNAVAILABLE: false,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  TRANSACTION_FAILED: true,
  ROLLBACK_FAILED: false,
  TRANSACTION_RECOVERY_REQUIRED: false
} as const;

const editTransactionErrorCodeSchema = z.enum([
  "FILE_VERSION_CONFLICT",
  "TRANSACTION_BUSY",
  "ATOMIC_BACKEND_UNAVAILABLE",
  "AUDIT_UNAVAILABLE",
  "AUDIT_INTEGRITY_FAILURE",
  "TRANSACTION_FAILED",
  "ROLLBACK_FAILED",
  "TRANSACTION_RECOVERY_REQUIRED"
]);

const editTransactionErrorSchema = z.object({
  code: editTransactionErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.union([pathDetailsSchema, emptyDetailsSchema])
}).strict().superRefine((value, context) => {
  if (value.message !== EDIT_TRANSACTION_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Unexpected transaction error message." });
  }
  if (value.retryable !== editTransactionRetryable[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryable"], message: "Unexpected transaction retryability." });
  }
  const hasPath = Object.prototype.hasOwnProperty.call(value.details, "path");
  if ((value.code === "FILE_VERSION_CONFLICT") !== hasPath) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Unexpected transaction error details." });
  }
});

export const editDataSchemaV2 = editDataSchema.extend({
  transaction: transactionResultV2Schema,
  before_sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export const editErrorSchemaV2 = z.union([editErrorSchema, editTransactionErrorSchema]);

export const editOutputShapeV2 = {
  codexgpt_tool: z.literal("edit"),
  codexgpt_title: z.literal("Edit File"),
  ok: z.boolean(),
  data: editDataSchemaV2.nullable(),
  error: editErrorSchemaV2.nullable(),
  meta: toolMetaSchema
};

const editOutputBaseSchemaV2 = z.object(editOutputShapeV2).strict();

export const editOutputSchemaV2 = editOutputBaseSchemaV2.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful edit results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful edit results require error to be null." });
    return;
  }
  if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed edit results require data to be null." });
  if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed edit results require an error object." });
});

export type EditDataV2 = z.infer<typeof editDataSchemaV2>;
export type EditStructuredResultV2 = z.infer<typeof editOutputBaseSchemaV2>;
export type EditTransactionErrorCode = z.infer<typeof editTransactionErrorCodeSchema>;

export function createEditSuccessV2(
  data: EditDataV2,
  durationMs = 0
): EditStructuredResultV2 {
  return editOutputSchemaV2.parse({
    codexgpt_tool: "edit",
    codexgpt_title: "Edit File",
    ok: true,
    data: editDataSchemaV2.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createEditTransactionFailureV2(
  failure: {
    code: EditTransactionErrorCode;
    details: { path: string } | Record<string, never>;
  },
  durationMs = 0
): EditStructuredResultV2 {
  return editOutputSchemaV2.parse({
    codexgpt_tool: "edit",
    codexgpt_title: "Edit File",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: EDIT_TRANSACTION_ERROR_MESSAGES[failure.code],
      retryable: editTransactionRetryable[failure.code],
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

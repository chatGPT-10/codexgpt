import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

const workspaceIdSchema = z.string().min(1).max(160);
const changeSetIdSchema = z.string().regex(/^cs_[a-f0-9]{32}$/);
const safeRelativePathSchema = z.string().min(1).max(4_096).refine((value) =>
  !value.startsWith("/") &&
  !/^[A-Za-z]:/.test(value) &&
  !value.includes("\0") &&
  value.replaceAll("\\", "/").split("/").every((segment) => segment && segment !== "." && segment !== ".."),
"Undo paths must be safe workspace-relative paths."
);

export const undoChangeSetInputV2Schema = z.object({
  workspace_id: workspaceIdSchema,
  change_set_id: changeSetIdSchema,
  preview: z.boolean().optional()
}).strict();

export const undoChangeSetOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["delete", "restore"]),
    path: safeRelativePathSchema
  }).strict(),
  z.object({
    kind: z.literal("move"),
    source: safeRelativePathSchema,
    destination: safeRelativePathSchema
  }).strict()
]);

export const undoChangeSetDataSchema = z.object({
  workspace_id: workspaceIdSchema,
  preview: z.boolean(),
  change_set_id: changeSetIdSchema.nullable(),
  reverts_change_set_id: changeSetIdSchema,
  operation_count: z.number().int().positive().max(64),
  operations: z.array(undoChangeSetOperationSchema).min(1).max(64),
  undo_supported: z.literal(false)
}).strict().superRefine((value, context) => {
  if (value.operation_count !== value.operations.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operation_count"],
      message: "operation_count must equal operations.length."
    });
  }
  if (value.preview !== (value.change_set_id === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["change_set_id"],
      message: "Preview results cannot claim a committed reverse change set."
    });
  }
});

export const UNDO_CHANGE_SET_ERROR_MESSAGES = Object.freeze({
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open it before retrying.",
  CHANGE_SET_NOT_FOUND: "The requested change set is unavailable for this workspace and identity.",
  UNDO_EXPIRED: "The change set undo window has expired.",
  UNDO_NOT_SUPPORTED: "This change set cannot be undone.",
  UNDO_ALREADY_APPLIED: "This change set was already undone.",
  UNDO_CONFLICT: "The complete current state no longer matches the change set, so nothing was changed.",
  TRANSACTION_BUSY: "Another workspace transaction is active. Retry after it completes.",
  ATOMIC_BACKEND_UNAVAILABLE: "The filesystem cannot provide the required atomic undo guarantees.",
  AUDIT_UNAVAILABLE: "The required persistent audit record could not be completed, so undo was rolled back.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  TRANSACTION_FAILED: "The atomic undo failed and no successful commit was acknowledged.",
  ROLLBACK_FAILED: "Undo failed and rollback could not be proven complete.",
  TRANSACTION_RECOVERY_REQUIRED: "The workspace requires transaction recovery before another mutation.",
  INTERNAL_ERROR: "Undo could not be completed because of an internal integrity or runtime error."
} as const);

export type UndoChangeSetErrorCode = keyof typeof UNDO_CHANGE_SET_ERROR_MESSAGES;

const retryableByCode: Readonly<Record<UndoChangeSetErrorCode, boolean>> = Object.freeze({
  WORKSPACE_NOT_FOUND: false,
  CHANGE_SET_NOT_FOUND: false,
  UNDO_EXPIRED: false,
  UNDO_NOT_SUPPORTED: false,
  UNDO_ALREADY_APPLIED: false,
  UNDO_CONFLICT: false,
  TRANSACTION_BUSY: true,
  ATOMIC_BACKEND_UNAVAILABLE: false,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  TRANSACTION_FAILED: true,
  ROLLBACK_FAILED: false,
  TRANSACTION_RECOVERY_REQUIRED: false,
  INTERNAL_ERROR: false
});

const undoCodeSchema = z.enum(Object.keys(UNDO_CHANGE_SET_ERROR_MESSAGES) as [UndoChangeSetErrorCode, ...UndoChangeSetErrorCode[]]);
const undoDetailsSchema = z.object({
  workspace_id: workspaceIdSchema.optional(),
  change_set_id: changeSetIdSchema.optional()
}).strict();

export const undoChangeSetErrorSchema = z.object({
  code: undoCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: undoDetailsSchema
}).strict().superRefine((value, context) => {
  if (value.message !== UNDO_CHANGE_SET_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Undo error message is not canonical." });
  }
  if (value.retryable !== retryableByCode[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryable"], message: "Undo retryability is not canonical." });
  }
});

export const undoChangeSetOutputShape = {
  codexpro_tool: z.literal("undo_change_set"),
  codexpro_title: z.literal("Undo Change Set"),
  ok: z.boolean(),
  data: undoChangeSetDataSchema.nullable(),
  error: undoChangeSetErrorSchema.nullable(),
  meta: toolMetaSchema
};

const undoChangeSetOutputBaseSchema = z.object(undoChangeSetOutputShape).strict();

export const undoChangeSetOutputSchema = undoChangeSetOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful undo requires data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful undo requires no error." });
  } else {
    if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed undo cannot return data." });
    if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed undo requires an error." });
  }
});

export type UndoChangeSetData = z.infer<typeof undoChangeSetDataSchema>;
export type UndoChangeSetStructuredResult = z.infer<typeof undoChangeSetOutputBaseSchema>;

export function createUndoChangeSetSuccess(
  data: UndoChangeSetData,
  durationMs = 0
): UndoChangeSetStructuredResult {
  return undoChangeSetOutputSchema.parse({
    codexpro_tool: "undo_change_set",
    codexpro_title: "Undo Change Set",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createUndoChangeSetFailure(
  code: UndoChangeSetErrorCode,
  details: { workspace_id?: string; change_set_id?: string } = {},
  durationMs = 0
): UndoChangeSetStructuredResult {
  return undoChangeSetOutputSchema.parse({
    codexpro_tool: "undo_change_set",
    codexpro_title: "Undo Change Set",
    ok: false,
    data: null,
    error: {
      code,
      message: UNDO_CHANGE_SET_ERROR_MESSAGES[code],
      retryable: retryableByCode[code],
      details
    },
    meta: createToolMeta(durationMs)
  });
}

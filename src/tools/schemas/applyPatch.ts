import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import { transactionResultV2Schema } from "./transactionResult.js";
import { changeWorkflowStateSchema } from "./changeWorkflow.js";

const applyPatchExpectedFilesSchemaV5 = z.record(
  z.string().min(1).max(240),
  z.string().regex(/^[a-f0-9]{64}$/).nullable()
).refine((value) => Object.keys(value).length <= 1_000, "expected_files exceeds the file limit.");

export const applyPatchInputDescriptorShapeV5 = {
  workspace_id: z.string().min(1).max(160).optional(),
  patch: z.string().min(1).optional(),
  expected_files: applyPatchExpectedFilesSchemaV5.optional(),
  semantic_preview_id: z.string().min(20).max(200).optional()
};

export const applyPatchInputSchemaV5 = z.union([
  z.object({
    workspace_id: z.string().min(1).max(160).optional(),
    patch: z.string().min(1),
    expected_files: applyPatchExpectedFilesSchemaV5.optional()
  }).strict(),
  z.object({
    workspace_id: z.string().min(1).max(160).optional(),
    semantic_preview_id: z.string().min(20).max(200)
  }).strict()
]);

export const APPLY_PATCH_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "A patch target is outside the permitted workspace boundary.",
  PATH_BLOCKED: "A patch target is blocked by safety rules, including unsafe symlink targets.",
  INVALID_ARGUMENT: "The requested patch contains an invalid argument.",
  PATCH_TOO_LARGE: "The requested patch exceeds the configured patch-size limit.",
  SECRET_CONTENT_BLOCKED: "Secret-looking content is blocked from apply_patch.",
  SYMLINK_PATCH_BLOCKED: "Patches that create, delete, or change symbolic links are blocked.",
  PATCH_INVALID: "The requested patch is not a valid supported unified diff.",
  GIT_UNAVAILABLE: "Git is unavailable, so the patch cannot be checked or applied.",
  PATCH_CHECK_FAILED: "The patch could not be applied cleanly to the current workspace state.",
  PATCH_APPLY_FAILED: "The patch passed preflight but the apply operation failed. Review workspace changes before retrying.",
  SEMANTIC_PREVIEW_STALE: "The semantic preview is unavailable or stale. Create a fresh rename preview, then retry apply_patch once.",
  INTERNAL_ERROR: "The patch could not be applied because of an internal error."
} as const;

const uniquePathsSchema = z.array(z.string().min(1)).min(1).superRefine((paths, context) => {
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Patch paths must be unique."
    });
  }
});

export const applyPatchDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  paths: uniquePathsSchema,
  stdout: z.string(),
  stderr: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.literal(true),
  diff: z.string().min(1)
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.literal("patch"),
  reason: z.literal("empty")
}).strict();

const patchTooLargeDetailsSchema = z.object({
  limit_bytes: z.number().int().positive()
}).strict();

const patchInvalidDetailsSchema = z.object({
  reason: z.enum(["no_file_paths", "invalid_path_encoding"])
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const invalidArgumentErrorSchema = z.object({
  code: z.literal("INVALID_ARGUMENT"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.INVALID_ARGUMENT),
  retryable: z.literal(false),
  details: invalidArgumentDetailsSchema
}).strict();

const patchTooLargeErrorSchema = z.object({
  code: z.literal("PATCH_TOO_LARGE"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATCH_TOO_LARGE),
  retryable: z.literal(false),
  details: patchTooLargeDetailsSchema
}).strict();

const secretContentBlockedErrorSchema = z.object({
  code: z.literal("SECRET_CONTENT_BLOCKED"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.SECRET_CONTENT_BLOCKED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const symlinkPatchBlockedErrorSchema = z.object({
  code: z.literal("SYMLINK_PATCH_BLOCKED"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.SYMLINK_PATCH_BLOCKED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const patchInvalidErrorSchema = z.object({
  code: z.literal("PATCH_INVALID"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATCH_INVALID),
  retryable: z.literal(false),
  details: patchInvalidDetailsSchema
}).strict();

const gitUnavailableErrorSchema = z.object({
  code: z.literal("GIT_UNAVAILABLE"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.GIT_UNAVAILABLE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const patchCheckFailedErrorSchema = z.object({
  code: z.literal("PATCH_CHECK_FAILED"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATCH_CHECK_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const patchApplyFailedErrorSchema = z.object({
  code: z.literal("PATCH_APPLY_FAILED"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.PATCH_APPLY_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const semanticPreviewStaleErrorSchema = z.object({
  code: z.literal("SEMANTIC_PREVIEW_STALE"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.SEMANTIC_PREVIEW_STALE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(APPLY_PATCH_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const applyPatchErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  invalidArgumentErrorSchema,
  patchTooLargeErrorSchema,
  secretContentBlockedErrorSchema,
  symlinkPatchBlockedErrorSchema,
  patchInvalidErrorSchema,
  gitUnavailableErrorSchema,
  patchCheckFailedErrorSchema,
  patchApplyFailedErrorSchema,
  internalErrorSchema
]);

export const applyPatchOutputShape = {
  codexgpt_tool: z.literal("apply_patch"),
  codexgpt_title: z.literal("Apply Patch"),
  ok: z.boolean(),
  data: applyPatchDataSchema.nullable(),
  error: applyPatchErrorSchema.nullable(),
  meta: toolMetaSchema
};

const applyPatchOutputBaseSchema = z.object(applyPatchOutputShape).strict();

export const applyPatchOutputSchema = applyPatchOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful apply_patch results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful apply_patch results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed apply_patch results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed apply_patch results require an error object."
    });
  }
});

export type ApplyPatchData = z.infer<typeof applyPatchDataSchema>;
export type ApplyPatchStructuredResult = z.infer<typeof applyPatchOutputBaseSchema>;

export type ApplyPatchFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "patch"; reason: "empty" } }
  | { code: "PATCH_TOO_LARGE"; details: { limit_bytes: number } }
  | { code: "SECRET_CONTENT_BLOCKED"; details: Record<string, never> }
  | { code: "SYMLINK_PATCH_BLOCKED"; details: Record<string, never> }
  | { code: "PATCH_INVALID"; details: { reason: "no_file_paths" | "invalid_path_encoding" } }
  | { code: "GIT_UNAVAILABLE"; details: Record<string, never> }
  | { code: "PATCH_CHECK_FAILED"; details: Record<string, never> }
  | { code: "PATCH_APPLY_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export type ApplyPatchFailureInputV5 =
  | ApplyPatchFailureInput
  | { code: "SEMANTIC_PREVIEW_STALE"; details: Record<string, never> };

export function createApplyPatchSuccess(
  data: ApplyPatchData,
  durationMs = 0
): ApplyPatchStructuredResult {
  return applyPatchOutputSchema.parse({
    codexgpt_tool: "apply_patch",
    codexgpt_title: "Apply Patch",
    ok: true,
    data: applyPatchDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createApplyPatchFailure(
  failure: ApplyPatchFailureInput,
  durationMs = 0
): ApplyPatchStructuredResult {
  return applyPatchOutputSchema.parse({
    codexgpt_tool: "apply_patch",
    codexgpt_title: "Apply Patch",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: APPLY_PATCH_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export const APPLY_PATCH_TRANSACTION_ERROR_MESSAGES = {
  FILE_VERSION_CONFLICT: "A patch target changed since the expected version was read. Read the affected file again before retrying.",
  TRANSACTION_BUSY: "Another workspace transaction is active. Retry after it completes.",
  ATOMIC_BACKEND_UNAVAILABLE: "The filesystem cannot provide the required atomic patch guarantees.",
  AUDIT_UNAVAILABLE: "The required persistent audit record could not be completed, so the patch was rolled back.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  TRANSACTION_FAILED: "The atomic patch failed and no successful commit was acknowledged.",
  ROLLBACK_FAILED: "The patch failed and rollback could not be proven complete.",
  TRANSACTION_RECOVERY_REQUIRED: "The workspace requires transaction recovery before another patch."
} as const;

const applyPatchTransactionRetryable = {
  FILE_VERSION_CONFLICT: false,
  TRANSACTION_BUSY: true,
  ATOMIC_BACKEND_UNAVAILABLE: false,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  TRANSACTION_FAILED: true,
  ROLLBACK_FAILED: false,
  TRANSACTION_RECOVERY_REQUIRED: false
} as const;

const applyPatchTransactionErrorCodeSchema = z.enum([
  "FILE_VERSION_CONFLICT",
  "TRANSACTION_BUSY",
  "ATOMIC_BACKEND_UNAVAILABLE",
  "AUDIT_UNAVAILABLE",
  "AUDIT_INTEGRITY_FAILURE",
  "TRANSACTION_FAILED",
  "ROLLBACK_FAILED",
  "TRANSACTION_RECOVERY_REQUIRED"
]);

const applyPatchTransactionErrorSchema = z.object({
  code: applyPatchTransactionErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.union([pathDetailsSchema, emptyDetailsSchema])
}).strict().superRefine((value, context) => {
  if (value.message !== APPLY_PATCH_TRANSACTION_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Unexpected transaction error message." });
  }
  if (value.retryable !== applyPatchTransactionRetryable[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retryable"], message: "Unexpected transaction retryability." });
  }
  const hasPath = Object.prototype.hasOwnProperty.call(value.details, "path");
  if ((value.code === "FILE_VERSION_CONFLICT") !== hasPath) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Unexpected transaction error details." });
  }
});

export const applyPatchFileFactSchemaV2 = z.object({
  path: z.string().min(1).max(240),
  before_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  after_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable()
}).strict();

const applyPatchFilesSchemaV2 = z.array(applyPatchFileFactSchemaV2).min(1).max(1_000)
  .superRefine((files, context) => {
    if (new Set(files.map((file) => file.path)).size !== files.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Patch file facts must have unique paths." });
    }
  });

export const applyPatchDataSchemaV2 = applyPatchDataSchema.extend({
  transaction: transactionResultV2Schema,
  files: applyPatchFilesSchemaV2
}).strict().superRefine((value, context) => {
  if (value.transaction.operation_count !== value.files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["transaction", "operation_count"], message: "Patch operation count must match file facts." });
  }
  if (
    value.paths.length !== value.files.length ||
    value.paths.some((path, index) => path !== value.files[index]?.path)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Patch file facts must preserve path order." });
  }
});

export const applyPatchErrorSchemaV2 = z.union([applyPatchErrorSchema, applyPatchTransactionErrorSchema]);

export const applyPatchOutputShapeV2 = {
  codexgpt_tool: z.literal("apply_patch"),
  codexgpt_title: z.literal("Apply Patch"),
  ok: z.boolean(),
  data: applyPatchDataSchemaV2.nullable(),
  error: applyPatchErrorSchemaV2.nullable(),
  meta: toolMetaSchema
};

const applyPatchOutputBaseSchemaV2 = z.object(applyPatchOutputShapeV2).strict();

export const applyPatchOutputSchemaV2 = applyPatchOutputBaseSchemaV2.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful apply_patch results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful apply_patch results require error to be null." });
    return;
  }
  if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed apply_patch results require data to be null." });
  if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed apply_patch results require an error object." });
});

export const applyPatchErrorSchemaV5 = z.union([
  applyPatchErrorSchemaV2,
  semanticPreviewStaleErrorSchema
]);

const applyPatchDataBaseSchemaV5 = applyPatchDataSchema.extend({
  transaction: transactionResultV2Schema,
  files: applyPatchFilesSchemaV2,
  workflow: changeWorkflowStateSchema.optional()
}).strict();

export const applyPatchDataSchemaV5 = applyPatchDataBaseSchemaV5.superRefine((value, context) => {
  const { workflow: _workflow, ...legacy } = value;
  const parsed = applyPatchDataSchemaV2.safeParse(legacy);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue(issue);
  }
});

export const applyPatchOutputShapeV5 = {
  ...applyPatchOutputShapeV2,
  data: applyPatchDataSchemaV5.nullable(),
  error: applyPatchErrorSchemaV5.nullable()
};

const applyPatchOutputBaseSchemaV5 = z.object(applyPatchOutputShapeV5).strict();

export const applyPatchOutputSchemaV5 = applyPatchOutputBaseSchemaV5.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful apply_patch results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful apply_patch results require error to be null." });
    return;
  }
  if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed apply_patch results require data to be null." });
  if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed apply_patch results require an error object." });
});

export type ApplyPatchDataV2 = z.infer<typeof applyPatchDataSchemaV2>;
export type ApplyPatchStructuredResultV2 = z.infer<typeof applyPatchOutputBaseSchemaV2>;
export type ApplyPatchStructuredResultV5 = z.infer<typeof applyPatchOutputBaseSchemaV5>;
export type ApplyPatchTransactionFailureInputV2 = {
  code: keyof typeof APPLY_PATCH_TRANSACTION_ERROR_MESSAGES;
  details: { path: string } | Record<string, never>;
};

export function createApplyPatchSuccessV2(
  data: ApplyPatchDataV2,
  durationMs = 0
): ApplyPatchStructuredResultV2 {
  return applyPatchOutputSchemaV2.parse({
    codexgpt_tool: "apply_patch",
    codexgpt_title: "Apply Patch",
    ok: true,
    data: applyPatchDataSchemaV2.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createApplyPatchFailureV5(
  failure: ApplyPatchFailureInputV5,
  durationMs = 0
): ApplyPatchStructuredResultV5 {
  return applyPatchOutputSchemaV5.parse({
    codexgpt_tool: "apply_patch",
    codexgpt_title: "Apply Patch",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: APPLY_PATCH_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export function createApplyPatchTransactionFailureV2(
  failure: ApplyPatchTransactionFailureInputV2,
  durationMs = 0
): ApplyPatchStructuredResultV2 {
  const code = applyPatchTransactionErrorCodeSchema.parse(failure.code);
  return applyPatchOutputSchemaV2.parse({
    codexgpt_tool: "apply_patch",
    codexgpt_title: "Apply Patch",
    ok: false,
    data: null,
    error: {
      code,
      message: APPLY_PATCH_TRANSACTION_ERROR_MESSAGES[code],
      retryable: applyPatchTransactionRetryable[code],
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

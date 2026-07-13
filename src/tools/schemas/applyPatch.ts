import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

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
  codexpro_tool: z.literal("apply_patch"),
  codexpro_title: z.literal("Apply Patch"),
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

export function createApplyPatchSuccess(
  data: ApplyPatchData,
  durationMs = 0
): ApplyPatchStructuredResult {
  return applyPatchOutputSchema.parse({
    codexpro_tool: "apply_patch",
    codexpro_title: "Apply Patch",
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
    codexpro_tool: "apply_patch",
    codexpro_title: "Apply Patch",
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

import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

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
  codexpro_tool: z.literal("write"),
  codexpro_title: z.literal("Write File"),
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
    codexpro_tool: "write",
    codexpro_title: "Write File",
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
    codexpro_tool: "write",
    codexpro_title: "Write File",
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

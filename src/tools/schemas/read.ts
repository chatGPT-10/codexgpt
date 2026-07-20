import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const READ_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  FILE_NOT_FOUND: "The requested path does not exist.",
  NOT_A_FILE: "The requested path is not a regular file.",
  FILE_TOO_LARGE: "The requested file or selected line range exceeds the configured read limit.",
  FILE_NOT_TEXT: "The requested file is not supported as text.",
  INVALID_LINE_RANGE: "The requested line range is invalid.",
  INTERNAL_ERROR: "The file could not be read because of an internal error."
} as const;

const readDataBaseSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string().min(1),
  text: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  totalLines: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  truncated: z.boolean()
}).strict();

export const readDataSchema = readDataBaseSchema.superRefine((value, context) => {
  if (value.startLine > value.endLine) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startLine"],
      message: "startLine must be less than or equal to endLine."
    });
  }
  if (value.endLine > value.totalLines) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endLine"],
      message: "endLine must be less than or equal to totalLines."
    });
  }
  const expectedTruncated = value.startLine > 1 || value.endLine < value.totalLines;
  if (value.truncated !== expectedTruncated) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncated"],
      message: "truncated must match the selected line interval."
    });
  }
});

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const fileTooLargeDetailsSchema = z.object({
  path: z.string().min(1).max(240),
  scope: z.enum(["file", "selection"]),
  limit_bytes: z.number().int().positive()
}).strict();

const invalidLineRangeDetailsSchema = z.object({
  path: z.string().min(1).max(240),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive().nullable()
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(READ_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(READ_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(READ_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotFoundErrorSchema = z.object({
  code: z.literal("FILE_NOT_FOUND"),
  message: z.literal(READ_ERROR_MESSAGES.FILE_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const notAFileErrorSchema = z.object({
  code: z.literal("NOT_A_FILE"),
  message: z.literal(READ_ERROR_MESSAGES.NOT_A_FILE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileTooLargeErrorSchema = z.object({
  code: z.literal("FILE_TOO_LARGE"),
  message: z.literal(READ_ERROR_MESSAGES.FILE_TOO_LARGE),
  retryable: z.literal(false),
  details: fileTooLargeDetailsSchema
}).strict();

const fileNotTextErrorSchema = z.object({
  code: z.literal("FILE_NOT_TEXT"),
  message: z.literal(READ_ERROR_MESSAGES.FILE_NOT_TEXT),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const invalidLineRangeErrorSchema = z.object({
  code: z.literal("INVALID_LINE_RANGE"),
  message: z.literal(READ_ERROR_MESSAGES.INVALID_LINE_RANGE),
  retryable: z.literal(false),
  details: invalidLineRangeDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(READ_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const readErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  fileNotFoundErrorSchema,
  notAFileErrorSchema,
  fileTooLargeErrorSchema,
  fileNotTextErrorSchema,
  invalidLineRangeErrorSchema,
  internalErrorSchema
]);

export const readOutputShape = {
  codexgpt_tool: z.literal("read"),
  codexgpt_title: z.literal("Read File"),
  ok: z.boolean(),
  data: readDataSchema.nullable(),
  error: readErrorSchema.nullable(),
  meta: toolMetaSchema
};

const readOutputBaseSchema = z.object(readOutputShape).strict();

export const readOutputSchema = readOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful read results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful read results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed read results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed read results require an error object."
    });
  }
});

export type ReadData = z.infer<typeof readDataSchema>;
export type ReadStructuredResult = z.infer<typeof readOutputBaseSchema>;

export type ReadFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "NOT_A_FILE"; details: { path: string } }
  | { code: "FILE_TOO_LARGE"; details: { path: string; scope: "file" | "selection"; limit_bytes: number } }
  | { code: "FILE_NOT_TEXT"; details: { path: string } }
  | { code: "INVALID_LINE_RANGE"; details: { path: string; start_line: number; end_line: number | null } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createReadSuccess(
  data: ReadData,
  durationMs = 0
): ReadStructuredResult {
  return readOutputSchema.parse({
    codexgpt_tool: "read",
    codexgpt_title: "Read File",
    ok: true,
    data: readDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createReadFailure(
  failure: ReadFailureInput,
  durationMs = 0
): ReadStructuredResult {
  return readOutputSchema.parse({
    codexgpt_tool: "read",
    codexgpt_title: "Read File",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: READ_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

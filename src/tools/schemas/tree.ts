import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const TREE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  FILE_NOT_FOUND: "The requested path does not exist.",
  NOT_A_DIRECTORY: "The requested path is not a directory.",
  INTERNAL_ERROR: "The file tree could not be generated because of an internal error."
} as const;

export const treeDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  text: z.string(),
  entries: z.number().int().nonnegative(),
  truncated: z.boolean()
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(TREE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(TREE_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(TREE_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotFoundErrorSchema = z.object({
  code: z.literal("FILE_NOT_FOUND"),
  message: z.literal(TREE_ERROR_MESSAGES.FILE_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const notADirectoryErrorSchema = z.object({
  code: z.literal("NOT_A_DIRECTORY"),
  message: z.literal(TREE_ERROR_MESSAGES.NOT_A_DIRECTORY),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(TREE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const treeErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  fileNotFoundErrorSchema,
  notADirectoryErrorSchema,
  internalErrorSchema
]);

export const treeOutputShape = {
  codexpro_tool: z.literal("tree"),
  codexpro_title: z.literal("File Tree"),
  ok: z.boolean(),
  data: treeDataSchema.nullable(),
  error: treeErrorSchema.nullable(),
  meta: toolMetaSchema
};

const treeOutputBaseSchema = z.object(treeOutputShape).strict();

export const treeOutputSchema = treeOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful tree results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful tree results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed tree results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed tree results require an error object."
    });
  }
});

export type TreeData = z.infer<typeof treeDataSchema>;
export type TreeStructuredResult = z.infer<typeof treeOutputBaseSchema>;

export type TreeFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "NOT_A_DIRECTORY"; details: { path: string } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createTreeSuccess(
  data: TreeData,
  durationMs = 0
): TreeStructuredResult {
  return treeOutputSchema.parse({
    codexpro_tool: "tree",
    codexpro_title: "File Tree",
    ok: true,
    data: treeDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createTreeFailure(
  failure: TreeFailureInput,
  durationMs = 0
): TreeStructuredResult {
  return treeOutputSchema.parse({
    codexpro_tool: "tree",
    codexpro_title: "File Tree",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: TREE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

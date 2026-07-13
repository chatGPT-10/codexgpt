import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const OPEN_WORKSPACE_ERROR_MESSAGES = {
  ROOT_ALIAS_CONFLICT: "The root and path arguments identify different workspace roots.",
  ROOT_PATH_INVALID: "The requested workspace root is not a valid local workspace path.",
  ROOT_NOT_FOUND: "The requested workspace root does not exist.",
  ROOT_NOT_DIRECTORY: "The requested workspace root is not a directory.",
  ROOT_NOT_ALLOWED: "The requested workspace root is outside the allowed roots.",
  WORKSPACE_OPEN_FAILED: "The requested workspace could not be opened.",
  INTERNAL_ERROR: "The workspace summary failed because of an internal error."
} as const;

export const openWorkspaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

export const openWorkspaceSkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

export const openWorkspaceDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  agents_loaded: z.boolean(),
  agents_path: z.string().min(1).nullable(),
  skills: z.array(z.string().min(1)),
  skill_inventory: z.array(openWorkspaceSkillSchema),
  skill_counts: openWorkspaceSkillCountsSchema,
  tree: z.string().min(1).nullable(),
  git_status: z.string().min(1),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"])
}).strict();

const aliasConflictDetailsSchema = z.object({
  fields: z.tuple([z.literal("root"), z.literal("path")])
}).strict();

const rootSourceDetailsSchema = z.object({
  source: z.enum(["root", "path", "configured_default_root"])
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const rootAliasConflictErrorSchema = z.object({
  code: z.literal("ROOT_ALIAS_CONFLICT"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.ROOT_ALIAS_CONFLICT),
  retryable: z.literal(false),
  details: aliasConflictDetailsSchema
}).strict();

const rootPathInvalidErrorSchema = z.object({
  code: z.literal("ROOT_PATH_INVALID"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.ROOT_PATH_INVALID),
  retryable: z.literal(false),
  details: rootSourceDetailsSchema
}).strict();

const rootNotFoundErrorSchema = z.object({
  code: z.literal("ROOT_NOT_FOUND"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.ROOT_NOT_FOUND),
  retryable: z.literal(false),
  details: rootSourceDetailsSchema
}).strict();

const rootNotDirectoryErrorSchema = z.object({
  code: z.literal("ROOT_NOT_DIRECTORY"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.ROOT_NOT_DIRECTORY),
  retryable: z.literal(false),
  details: rootSourceDetailsSchema
}).strict();

const rootNotAllowedErrorSchema = z.object({
  code: z.literal("ROOT_NOT_ALLOWED"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.ROOT_NOT_ALLOWED),
  retryable: z.literal(false),
  details: rootSourceDetailsSchema
}).strict();

const workspaceOpenFailedErrorSchema = z.object({
  code: z.literal("WORKSPACE_OPEN_FAILED"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.WORKSPACE_OPEN_FAILED),
  retryable: z.literal(false),
  details: rootSourceDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(OPEN_WORKSPACE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const openWorkspaceErrorSchema = z.discriminatedUnion("code", [
  rootAliasConflictErrorSchema,
  rootPathInvalidErrorSchema,
  rootNotFoundErrorSchema,
  rootNotDirectoryErrorSchema,
  rootNotAllowedErrorSchema,
  workspaceOpenFailedErrorSchema,
  internalErrorSchema
]);

export const openWorkspaceOutputShape = {
  codexpro_tool: z.literal("open_workspace"),
  codexpro_title: z.literal("Open Workspace"),
  ok: z.boolean(),
  data: openWorkspaceDataSchema.nullable(),
  error: openWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const openWorkspaceOutputBaseSchema = z.object(openWorkspaceOutputShape).strict();

export const openWorkspaceOutputSchema = openWorkspaceOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful open_workspace results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful open_workspace results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed open_workspace results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed open_workspace results require an error object."
    });
  }
});

export type OpenWorkspaceData = z.infer<typeof openWorkspaceDataSchema>;
export type OpenWorkspaceStructuredResult = z.infer<typeof openWorkspaceOutputBaseSchema>;
export type OpenWorkspaceRootSource = "root" | "path" | "configured_default_root";

export type OpenWorkspaceFailureInput =
  | { code: "ROOT_ALIAS_CONFLICT"; details: { fields: ["root", "path"] } }
  | { code: "ROOT_PATH_INVALID"; details: { source: OpenWorkspaceRootSource } }
  | { code: "ROOT_NOT_FOUND"; details: { source: OpenWorkspaceRootSource } }
  | { code: "ROOT_NOT_DIRECTORY"; details: { source: OpenWorkspaceRootSource } }
  | { code: "ROOT_NOT_ALLOWED"; details: { source: OpenWorkspaceRootSource } }
  | { code: "WORKSPACE_OPEN_FAILED"; details: { source: OpenWorkspaceRootSource } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createOpenWorkspaceSuccess(
  data: OpenWorkspaceData,
  durationMs = 0
): OpenWorkspaceStructuredResult {
  return openWorkspaceOutputSchema.parse({
    codexpro_tool: "open_workspace",
    codexpro_title: "Open Workspace",
    ok: true,
    data: openWorkspaceDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createOpenWorkspaceFailure(
  failure: OpenWorkspaceFailureInput,
  durationMs = 0
): OpenWorkspaceStructuredResult {
  return openWorkspaceOutputSchema.parse({
    codexpro_tool: "open_workspace",
    codexpro_title: "Open Workspace",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: OPEN_WORKSPACE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

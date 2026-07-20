import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES = {
  DEFAULT_ROOT_NOT_FOUND: "The configured default workspace root does not exist.",
  DEFAULT_ROOT_NOT_DIRECTORY: "The configured default workspace root is not a directory.",
  ROOT_NOT_ALLOWED: "The configured default workspace root is outside the allowed roots.",
  WORKSPACE_OPEN_FAILED: "The configured default workspace could not be opened.",
  INTERNAL_ERROR: "The current workspace summary failed because of an internal error."
} as const;

export const openCurrentWorkspaceSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

export const openCurrentWorkspaceSkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

export const openCurrentWorkspaceDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  agents_loaded: z.boolean(),
  agents_path: z.string().min(1).nullable(),
  skills: z.array(z.string().min(1)),
  skill_inventory: z.array(openCurrentWorkspaceSkillSchema),
  skill_counts: openCurrentWorkspaceSkillCountsSchema,
  tree: z.string().min(1).nullable(),
  git_status: z.string().min(1),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"])
}).strict();

const configuredDefaultRootDetailsSchema = z.object({
  source: z.literal("configured_default_root")
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const defaultRootNotFoundErrorSchema = z.object({
  code: z.literal("DEFAULT_ROOT_NOT_FOUND"),
  message: z.literal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES.DEFAULT_ROOT_NOT_FOUND),
  retryable: z.literal(false),
  details: configuredDefaultRootDetailsSchema
}).strict();

const defaultRootNotDirectoryErrorSchema = z.object({
  code: z.literal("DEFAULT_ROOT_NOT_DIRECTORY"),
  message: z.literal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES.DEFAULT_ROOT_NOT_DIRECTORY),
  retryable: z.literal(false),
  details: configuredDefaultRootDetailsSchema
}).strict();

const rootNotAllowedErrorSchema = z.object({
  code: z.literal("ROOT_NOT_ALLOWED"),
  message: z.literal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES.ROOT_NOT_ALLOWED),
  retryable: z.literal(false),
  details: configuredDefaultRootDetailsSchema
}).strict();

const workspaceOpenFailedErrorSchema = z.object({
  code: z.literal("WORKSPACE_OPEN_FAILED"),
  message: z.literal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES.WORKSPACE_OPEN_FAILED),
  retryable: z.literal(false),
  details: configuredDefaultRootDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const openCurrentWorkspaceErrorSchema = z.discriminatedUnion("code", [
  defaultRootNotFoundErrorSchema,
  defaultRootNotDirectoryErrorSchema,
  rootNotAllowedErrorSchema,
  workspaceOpenFailedErrorSchema,
  internalErrorSchema
]);

export const openCurrentWorkspaceOutputShape = {
  codexgpt_tool: z.literal("open_current_workspace"),
  codexgpt_title: z.literal("Open Current Workspace"),
  ok: z.boolean(),
  data: openCurrentWorkspaceDataSchema.nullable(),
  error: openCurrentWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const openCurrentWorkspaceOutputBaseSchema = z.object(openCurrentWorkspaceOutputShape).strict();

export const openCurrentWorkspaceOutputSchema = openCurrentWorkspaceOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful open_current_workspace results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful open_current_workspace results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed open_current_workspace results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed open_current_workspace results require an error object."
    });
  }
});

export type OpenCurrentWorkspaceData = z.infer<typeof openCurrentWorkspaceDataSchema>;
export type OpenCurrentWorkspaceStructuredResult = z.infer<typeof openCurrentWorkspaceOutputBaseSchema>;

export type OpenCurrentWorkspaceFailureInput =
  | { code: "DEFAULT_ROOT_NOT_FOUND"; details: { source: "configured_default_root" } }
  | { code: "DEFAULT_ROOT_NOT_DIRECTORY"; details: { source: "configured_default_root" } }
  | { code: "ROOT_NOT_ALLOWED"; details: { source: "configured_default_root" } }
  | { code: "WORKSPACE_OPEN_FAILED"; details: { source: "configured_default_root" } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createOpenCurrentWorkspaceSuccess(
  data: OpenCurrentWorkspaceData,
  durationMs = 0
): OpenCurrentWorkspaceStructuredResult {
  return openCurrentWorkspaceOutputSchema.parse({
    codexgpt_tool: "open_current_workspace",
    codexgpt_title: "Open Current Workspace",
    ok: true,
    data: openCurrentWorkspaceDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createOpenCurrentWorkspaceFailure(
  failure: OpenCurrentWorkspaceFailureInput,
  durationMs = 0
): OpenCurrentWorkspaceStructuredResult {
  return openCurrentWorkspaceOutputSchema.parse({
    codexgpt_tool: "open_current_workspace",
    codexgpt_title: "Open Current Workspace",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

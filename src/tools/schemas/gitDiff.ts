import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import {
  defineGitV4Tool,
  gitV4FileChangeSchema,
  gitV4OptionalPathsSchema,
  gitV4RepositoryIdSchema,
  gitV4SafeMultilineTextSchema,
  gitV4StateTokenSchema,
  gitV4TaskWorktreeIdSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const GIT_DIFF_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  GIT_NOT_REPOSITORY: "The workspace is not a Git repository.",
  GIT_UNAVAILABLE: "Git is not available to inspect this workspace.",
  GIT_COMMAND_FAILED: "Git could not inspect the workspace diff.",
  INTERNAL_ERROR: "The Git diff could not be read because of an internal error."
} as const;

const gitDiffDataBaseSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string(),
  staged: z.boolean(),
  include_diff: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.boolean(),
  diff: z.string()
}).strict();

export const gitDiffDataSchema = gitDiffDataBaseSchema.superRefine((value, context) => {
  if (!value.changed && (value.additions !== 0 || value.deletions !== 0 || value.diff !== "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed"],
      message: "Unchanged diffs require zero stats and an empty diff."
    });
  }

  if (!value.include_diff && value.diff !== "") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff"],
      message: "include_diff=false requires an empty diff."
    });
  }

  if (value.diff !== "" && (!value.include_diff || !value.changed)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff"],
      message: "A non-empty diff requires include_diff=true and changed=true."
    });
  }
});

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const gitNotRepositoryErrorSchema = z.object({
  code: z.literal("GIT_NOT_REPOSITORY"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.GIT_NOT_REPOSITORY),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitUnavailableErrorSchema = z.object({
  code: z.literal("GIT_UNAVAILABLE"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.GIT_UNAVAILABLE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitCommandFailedErrorSchema = z.object({
  code: z.literal("GIT_COMMAND_FAILED"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.GIT_COMMAND_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(GIT_DIFF_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const gitDiffErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  gitNotRepositoryErrorSchema,
  gitUnavailableErrorSchema,
  gitCommandFailedErrorSchema,
  internalErrorSchema
]);

export const gitDiffOutputShape = {
  codexgpt_tool: z.literal("git_diff"),
  codexgpt_title: z.literal("Git Diff"),
  ok: z.boolean(),
  data: gitDiffDataSchema.nullable(),
  error: gitDiffErrorSchema.nullable(),
  meta: toolMetaSchema
};

const gitDiffOutputBaseSchema = z.object(gitDiffOutputShape).strict();

export const gitDiffOutputSchema = gitDiffOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful git_diff results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful git_diff results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed git_diff results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed git_diff results require an error object."
    });
  }
});

export type GitDiffData = z.infer<typeof gitDiffDataSchema>;
export type GitDiffStructuredResult = z.infer<typeof gitDiffOutputBaseSchema>;

export type GitDiffFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "GIT_NOT_REPOSITORY"; details: Record<string, never> }
  | { code: "GIT_UNAVAILABLE"; details: Record<string, never> }
  | { code: "GIT_COMMAND_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createGitDiffSuccess(
  data: GitDiffData,
  durationMs = 0
): GitDiffStructuredResult {
  return gitDiffOutputSchema.parse({
    codexgpt_tool: "git_diff",
    codexgpt_title: "Git Diff",
    ok: true,
    data: gitDiffDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createGitDiffFailure(
  failure: GitDiffFailureInput,
  durationMs = 0
): GitDiffStructuredResult {
  return gitDiffOutputSchema.parse({
    codexgpt_tool: "git_diff",
    codexgpt_title: "Git Diff",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: GIT_DIFF_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export const gitDiffComparisonV4Schema = z.enum([
  "worktree_to_index",
  "index_to_head",
  "head_to_base"
]);

export const gitDiffInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  comparison: gitDiffComparisonV4Schema,
  paths: gitV4OptionalPathsSchema,
  include_patch: z.boolean().optional(),
  task_worktree_id: gitV4TaskWorktreeIdSchema.optional()
}).strict().superRefine((value, context) => {
  if ((value.comparison === "head_to_base") !== (value.task_worktree_id !== undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["task_worktree_id"],
      message: "head_to_base requires exactly one owned task_worktree_id."
    });
  }
});

export const gitDiffDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  comparison: gitDiffComparisonV4Schema,
  changes: z.array(gitV4FileChangeSchema).max(4096),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binary_count: z.number().int().nonnegative(),
  patch: gitV4SafeMultilineTextSchema(2_000_000, true),
  patch_included: z.boolean(),
  truncated: z.boolean(),
  omitted_blocked_count: z.number().int().nonnegative(),
  omitted_secret_count: z.number().int().nonnegative(),
  state_token: gitV4StateTokenSchema.nullable()
}).strict().superRefine((value, context) => {
  if (!value.patch_included && value.patch !== "") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["patch"], message: "Omitted patches must be empty." });
  }
  if ((value.truncated || value.omitted_blocked_count > 0 || value.omitted_secret_count > 0) && value.state_token !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state_token"], message: "Incomplete diffs cannot carry a mutation token." });
  }
  if (new Set(value.changes.map((entry) => entry.path)).size !== value.changes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changes"], message: "Changed paths must be unique." });
  }
});

const gitDiffV4Tool = defineGitV4Tool("git_diff", "Git Diff", gitDiffDataV4Schema);
export const gitDiffOutputShapeV4 = gitDiffV4Tool.outputShape;
export const gitDiffOutputSchemaV4 = gitDiffV4Tool.outputSchema;
export const createGitDiffSuccessV4 = gitDiffV4Tool.success;
export const createGitDiffFailureV4 = gitDiffV4Tool.failure;
export const createGitDiffUnavailableV4 = gitDiffV4Tool.unavailable;

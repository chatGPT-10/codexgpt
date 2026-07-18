import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import {
  defineGitV4Tool,
  gitV4BranchIdSchema,
  gitV4ExecutionIsolationSchema,
  gitV4IntegrationsSchema,
  gitV4LiteralPathSchema,
  gitV4OidSchema,
  gitV4OptionalPathsSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4StateTokenSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const GIT_STATUS_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  GIT_NOT_REPOSITORY: "The workspace is not a Git repository.",
  GIT_UNAVAILABLE: "Git is not available to inspect this workspace.",
  GIT_COMMAND_FAILED: "Git could not inspect the workspace status.",
  INTERNAL_ERROR: "The Git status could not be read because of an internal error."
} as const;

const statusLineSchema = z.string().refine(
  (value) => value.trim().length > 0 && !value.trimStart().startsWith("##"),
  "changed_files entries must be non-empty non-branch Git status lines."
);

const gitStatusDataBaseSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string(),
  status: z.string(),
  changed_files: z.array(statusLineSchema),
  changed: z.boolean()
}).strict();

export const gitStatusDataSchema = gitStatusDataBaseSchema.superRefine(
  (value, context) => {
    const expectedChanged = value.changed_files.length > 0;
    if (value.changed !== expectedChanged) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changed"],
        message: "changed must equal changed_files.length > 0."
      });
    }
  }
);

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const gitNotRepositoryErrorSchema = z.object({
  code: z.literal("GIT_NOT_REPOSITORY"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.GIT_NOT_REPOSITORY),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitUnavailableErrorSchema = z.object({
  code: z.literal("GIT_UNAVAILABLE"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.GIT_UNAVAILABLE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitCommandFailedErrorSchema = z.object({
  code: z.literal("GIT_COMMAND_FAILED"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.GIT_COMMAND_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(GIT_STATUS_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const gitStatusErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  gitNotRepositoryErrorSchema,
  gitUnavailableErrorSchema,
  gitCommandFailedErrorSchema,
  internalErrorSchema
]);

export const gitStatusOutputShape = {
  codexpro_tool: z.literal("git_status"),
  codexpro_title: z.literal("Git Status"),
  ok: z.boolean(),
  data: gitStatusDataSchema.nullable(),
  error: gitStatusErrorSchema.nullable(),
  meta: toolMetaSchema
};

const gitStatusOutputBaseSchema = z.object(gitStatusOutputShape).strict();

export const gitStatusOutputSchema = gitStatusOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful git_status results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful git_status results require error to be null."
        });
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed git_status results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed git_status results require an error object."
      });
    }
  }
);

export type GitStatusData = z.infer<typeof gitStatusDataSchema>;
export type GitStatusStructuredResult = z.infer<typeof gitStatusOutputBaseSchema>;

export type GitStatusFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "GIT_NOT_REPOSITORY"; details: Record<string, never> }
  | { code: "GIT_UNAVAILABLE"; details: Record<string, never> }
  | { code: "GIT_COMMAND_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createGitStatusSuccess(
  data: GitStatusData,
  durationMs = 0
): GitStatusStructuredResult {
  return gitStatusOutputSchema.parse({
    codexpro_tool: "git_status",
    codexpro_title: "Git Status",
    ok: true,
    data: gitStatusDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createGitStatusFailure(
  failure: GitStatusFailureInput,
  durationMs = 0
): GitStatusStructuredResult {
  return gitStatusOutputSchema.parse({
    codexpro_tool: "git_status",
    codexpro_title: "Git Status",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: GIT_STATUS_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

export const gitStatusInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  paths: gitV4OptionalPathsSchema
}).strict();

const gitStatusHeadV4Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("branch"), branch_id: gitV4BranchIdSchema, oid: gitV4OidSchema }).strict(),
  z.object({ kind: z.literal("detached"), branch_id: z.null(), oid: gitV4OidSchema }).strict(),
  z.object({ kind: z.literal("unborn"), branch_id: gitV4BranchIdSchema, oid: z.null() }).strict()
]);

const gitStatusEntryV4Schema = z.object({
  path: gitV4LiteralPathSchema,
  old_path: gitV4LiteralPathSchema.nullable(),
  index: z.enum(["unmodified", "added", "modified", "deleted", "renamed", "copied", "type_changed", "unmerged"]),
  worktree: z.enum(["unmodified", "added", "modified", "deleted", "renamed", "copied", "type_changed", "unmerged", "untracked"]),
  submodule: z.boolean()
}).strict();

export const gitStatusDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  head: gitStatusHeadV4Schema,
  entries: z.array(gitStatusEntryV4Schema).max(4096),
  changed_count: z.number().int().nonnegative(),
  untracked_count: z.number().int().nonnegative(),
  ignored_count: z.number().int().nonnegative(),
  omitted_blocked_count: z.number().int().nonnegative(),
  omitted_secret_count: z.number().int().nonnegative(),
  scan_complete: z.boolean(),
  mutation_state: z.enum(["complete", "incomplete"]),
  state_token: gitV4StateTokenSchema.nullable(),
  integration_review_token: gitV4ReviewTokenSchema.nullable(),
  integration_identity_count: z.number().int().nonnegative().max(128),
  integration_identity_digest: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  integration_identities: z.array(z.object({
    kind: z.enum(["hook", "filter", "merge_driver", "fsmonitor", "signing", "identity"]),
    config_key_digest: z.string().regex(/^[a-f0-9]{64}$/u),
    executable_digest: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    content_digest: z.string().regex(/^[a-f0-9]{64}$/u)
  }).strict()).max(128),
  execution_isolation: gitV4ExecutionIsolationSchema,
  repository_integrations: gitV4IntegrationsSchema
}).strict().superRefine((value, context) => {
  if ((value.scan_complete && value.mutation_state !== "complete") ||
      (!value.scan_complete && value.mutation_state !== "incomplete")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mutation_state"], message: "mutation_state must match scan completeness." });
  }
  if ((value.mutation_state === "complete") !== (value.state_token !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state_token"], message: "Only complete state may carry a token." });
  }
  if (value.integration_identity_count !== value.integration_identities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["integration_identity_count"], message: "Integration identity count must match the preview." });
  }
  if (value.repository_integrations === "disabled") {
    if (
      value.integration_review_token !== null ||
      value.integration_identity_count !== 0 ||
      value.integration_identity_digest !== null
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["repository_integrations"], message: "Disabled integrations cannot carry review facts." });
    }
  } else if (value.mutation_state === "complete") {
    if (value.integration_review_token === null || value.integration_identity_digest === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["integration_review_token"], message: "Complete approved integrations require exact review facts." });
    }
  }
});

const gitStatusV4Tool = defineGitV4Tool("git_status", "Git Status", gitStatusDataV4Schema);
export const gitStatusOutputShapeV4 = gitStatusV4Tool.outputShape;
export const gitStatusOutputSchemaV4 = gitStatusV4Tool.outputSchema;
export const createGitStatusSuccessV4 = gitStatusV4Tool.success;
export const createGitStatusFailureV4 = gitStatusV4Tool.failure;
export const createGitStatusUnavailableV4 = gitStatusV4Tool.unavailable;

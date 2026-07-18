import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4FileChangeSchema,
  gitV4IndexTokenSchema,
  gitV4OidSchema,
  gitV4PathsSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4StateTokenSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitStageInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  state_token: gitV4StateTokenSchema,
  paths: gitV4PathsSchema,
  integration_review_token: gitV4ReviewTokenSchema.optional()
}).strict();

export const gitStageDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  old_index_tree_oid: gitV4OidSchema,
  new_index_tree_oid: gitV4OidSchema,
  staged: z.array(gitV4FileChangeSchema).min(1).max(256),
  index_token: gitV4IndexTokenSchema,
  normalization: z.enum(["raw_git_blobs", "approved_full_access"]),
  repository_integrations: z.enum(["disabled", "approved_full_access"]),
  execution_isolation: z.literal("none")
}).strict().superRefine((value, context) => {
  if (new Set(value.staged.map((entry) => entry.path)).size !== value.staged.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["staged"], message: "Staged paths must be unique." });
  }
  if (
    (value.normalization === "approved_full_access") !==
    (value.repository_integrations === "approved_full_access")
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["repository_integrations"], message: "Normalization and integration mode must match." });
  }
});

const tool = defineGitV4Tool("git_stage", "Git Stage", gitStageDataV4Schema);
export const gitStageOutputShapeV4 = tool.outputShape;
export const gitStageOutputSchemaV4 = tool.outputSchema;
export const createGitStageSuccessV4 = tool.success;
export const createGitStageFailureV4 = tool.failure;
export const createGitStageUnavailableV4 = tool.unavailable;

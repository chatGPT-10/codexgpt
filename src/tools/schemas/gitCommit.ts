import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4IndexTokenSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4SafeMultilineTextSchema,
  gitV4StateTokenSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitCommitInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  index_token: gitV4IndexTokenSchema,
  message: gitV4SafeMultilineTextSchema(16 * 1024),
  integration_review_token: gitV4ReviewTokenSchema.optional()
}).strict();

export const gitCommitFileCountsV4Schema = z.object({
  added: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  renamed: z.number().int().nonnegative()
}).strict().refine(
  (value) => value.added + value.modified + value.deleted + value.renamed > 0,
  "A commit must contain at least one staged file change."
);

export const gitCommitDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  commit_oid: gitV4OidSchema,
  tree_oid: gitV4OidSchema,
  parent_oids: z.array(gitV4OidSchema).min(1).max(2),
  file_counts: gitCommitFileCountsV4Schema,
  hooks_executed: z.boolean(),
  signature: z.enum(["none", "repository_config"]),
  state_token: gitV4StateTokenSchema,
  repository_integrations: z.enum(["disabled", "approved_full_access"]),
  execution_isolation: z.literal("none")
}).strict().superRefine((value, context) => {
  if (value.repository_integrations === "disabled" && (value.hooks_executed || value.signature !== "none")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["repository_integrations"], message: "Disabled integrations cannot execute hooks or signing." });
  }
  if (value.repository_integrations === "approved_full_access" && value.signature === "repository_config" && !value.hooks_executed) {
    // Signing and hooks are independent. This branch deliberately remains valid.
  }
});

const tool = defineGitV4Tool("git_commit", "Git Commit", gitCommitDataV4Schema);
export const gitCommitOutputShapeV4 = tool.outputShape;
export const gitCommitOutputSchemaV4 = tool.outputSchema;
export const createGitCommitSuccessV4 = tool.success;
export const createGitCommitFailureV4 = tool.failure;
export const createGitCommitUnavailableV4 = tool.unavailable;

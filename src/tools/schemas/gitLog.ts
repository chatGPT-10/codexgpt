import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4BranchIdSchema,
  gitV4ExecutionIsolationSchema,
  gitV4IntegrationsSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4SafeOneLineTextSchema,
  gitV4TimestampSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitLogInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  branch_id: gitV4BranchIdSchema.optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();

export const gitLogCommitV4Schema = z.object({
  oid: gitV4OidSchema,
  parent_oids: z.array(gitV4OidSchema).max(16),
  subject: gitV4SafeOneLineTextSchema(240, true).nullable(),
  subject_omitted: z.boolean(),
  author_name: gitV4SafeOneLineTextSchema(160, true).nullable(),
  author_name_omitted: z.boolean(),
  timestamp: gitV4TimestampSchema
}).strict().superRefine((value, context) => {
  if (value.subject_omitted !== (value.subject === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["subject_omitted"], message: "subject_omitted must exactly match a null subject." });
  }
  if (value.author_name_omitted !== (value.author_name === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["author_name_omitted"], message: "author_name_omitted must exactly match a null author_name." });
  }
});

export const gitLogDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  commits: z.array(gitLogCommitV4Schema).max(100),
  truncated: z.boolean(),
  execution_isolation: gitV4ExecutionIsolationSchema,
  repository_integrations: gitV4IntegrationsSchema
}).strict().superRefine((value, context) => {
  if (new Set(value.commits.map((commit) => commit.oid)).size !== value.commits.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["commits"], message: "Commit OIDs must be unique within one page." });
  }
});

const tool = defineGitV4Tool("git_log", "Git Log", gitLogDataV4Schema);
export const gitLogOutputShapeV4 = tool.outputShape;
export const gitLogOutputSchemaV4 = tool.outputSchema;
export const createGitLogSuccessV4 = tool.success;
export const createGitLogFailureV4 = tool.failure;
export const createGitLogUnavailableV4 = tool.unavailable;

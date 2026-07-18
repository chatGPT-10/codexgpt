import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4BranchIdSchema,
  gitV4ExecutionIsolationSchema,
  gitV4IntegrationsSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4SafeOneLineTextSchema,
  gitV4TaskWorktreeIdSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitBranchInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema
}).strict();

export const gitBranchEntryV4Schema = z.object({
  branch_id: gitV4BranchIdSchema,
  oid: gitV4OidSchema,
  current: z.boolean(),
  checked_out: z.boolean(),
  owned_task_worktree_id: gitV4TaskWorktreeIdSchema.nullable(),
  name: gitV4SafeOneLineTextSchema(240).nullable(),
  name_omitted: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.name_omitted !== (value.name === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["name_omitted"], message: "name_omitted must exactly match a null name." });
  }
});

export const gitBranchDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  branches: z.array(gitBranchEntryV4Schema).max(512),
  truncated: z.boolean(),
  execution_isolation: gitV4ExecutionIsolationSchema,
  repository_integrations: gitV4IntegrationsSchema
}).strict().superRefine((value, context) => {
  if (new Set(value.branches.map((branch) => branch.branch_id)).size !== value.branches.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["branches"], message: "Branch IDs must be unique." });
  }
  if (value.branches.filter((branch) => branch.current).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["branches"], message: "At most one branch may be current." });
  }
  if (value.branches.some((branch) => branch.current && !branch.checked_out)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["branches"], message: "The current branch must be checked out." });
  }
});

const tool = defineGitV4Tool("git_branch", "Git Branch", gitBranchDataV4Schema);
export const gitBranchOutputShapeV4 = tool.outputShape;
export const gitBranchOutputSchemaV4 = tool.outputSchema;
export const createGitBranchSuccessV4 = tool.success;
export const createGitBranchFailureV4 = tool.failure;
export const createGitBranchUnavailableV4 = tool.unavailable;

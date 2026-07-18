import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4RepositoryIdSchema,
  gitV4TaskSummarySchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const listTaskWorktreesInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema
}).strict();

export const listTaskWorktreesDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  tasks: z.array(gitV4TaskSummarySchema).max(32),
  truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (new Set(value.tasks.map((task) => task.task_worktree_id)).size !== value.tasks.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks"], message: "Task worktree IDs must be unique." });
  }
});

const tool = defineGitV4Tool("list_task_worktrees", "List Task Worktrees", listTaskWorktreesDataV4Schema);
export const listTaskWorktreesOutputShapeV4 = tool.outputShape;
export const listTaskWorktreesOutputSchemaV4 = tool.outputSchema;
export const createListTaskWorktreesUnavailableV4 = tool.unavailable;
export const createListTaskWorktreesSuccessV4 = tool.success;
export const createListTaskWorktreesFailureV4 = tool.failure;

import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4RepositoryIdSchema,
  gitV4TaskSummarySchema,
  gitV4TaskWorktreeIdSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const getTaskWorktreeInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema
}).strict();

export const getTaskWorktreeDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  task: gitV4TaskSummarySchema,
  workspace_id: gitV4WorkspaceIdSchema,
  access_class: z.literal("task_worktree")
}).strict();

const tool = defineGitV4Tool("get_task_worktree", "Get Task Worktree", getTaskWorktreeDataV4Schema);
export const getTaskWorktreeOutputShapeV4 = tool.outputShape;
export const getTaskWorktreeOutputSchemaV4 = tool.outputSchema;
export const createGetTaskWorktreeUnavailableV4 = tool.unavailable;
export const createGetTaskWorktreeSuccessV4 = tool.success;
export const createGetTaskWorktreeFailureV4 = tool.failure;

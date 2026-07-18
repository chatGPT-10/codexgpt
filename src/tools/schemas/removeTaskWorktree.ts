import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4TaskWorktreeIdSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const removeTaskWorktreeInputV4Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    workspace_id: gitV4WorkspaceIdSchema,
    task_worktree_id: gitV4TaskWorktreeIdSchema
  }).strict(),
  z.object({
    action: z.literal("execute"),
    workspace_id: gitV4WorkspaceIdSchema,
    task_worktree_id: gitV4TaskWorktreeIdSchema,
    review_token: gitV4ReviewTokenSchema
  }).strict()
]);

const prepareDataSchema = z.object({
  action: z.literal("prepare"),
  repository_id: gitV4RepositoryIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  review_token: gitV4ReviewTokenSchema,
  clean: z.literal(true),
  branch_retained: z.literal(true),
  commits_retained: z.literal(true),
  private_stashes_retained: z.literal(true)
}).strict();

const executeDataSchema = z.object({
  action: z.literal("execute"),
  repository_id: gitV4RepositoryIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  removed: z.literal(true),
  branch_retained: z.literal(true)
}).strict();

export const removeTaskWorktreeDataV4Schema = z.discriminatedUnion("action", [prepareDataSchema, executeDataSchema]);

const tool = defineGitV4Tool("remove_task_worktree", "Remove Task Worktree", removeTaskWorktreeDataV4Schema);
export const removeTaskWorktreeOutputShapeV4 = tool.outputShape;
export const removeTaskWorktreeOutputSchemaV4 = tool.outputSchema;
export const createRemoveTaskWorktreeUnavailableV4 = tool.unavailable;
export const createRemoveTaskWorktreeSuccessV4 = tool.success;
export const createRemoveTaskWorktreeFailureV4 = tool.failure;

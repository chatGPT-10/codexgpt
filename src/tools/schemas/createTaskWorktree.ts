import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4BranchIdSchema,
  gitV4CodexBranchNameSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4SafeOneLineTextSchema,
  gitV4StateTokenSchema,
  gitV4TaskSummarySchema,
  gitV4TaskWorktreeIdSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const createTaskWorktreeInputV4Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    workspace_id: gitV4WorkspaceIdSchema,
    state_token: gitV4StateTokenSchema,
    task_name: gitV4SafeOneLineTextSchema(120),
    branch_name: gitV4CodexBranchNameSchema.optional()
  }).strict(),
  z.object({
    action: z.literal("execute"),
    workspace_id: gitV4WorkspaceIdSchema,
    review_token: gitV4ReviewTokenSchema
  }).strict()
]);

const prepareDataSchema = z.object({
  action: z.literal("prepare"),
  repository_id: gitV4RepositoryIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  branch_id: gitV4BranchIdSchema,
  target_branch_id: gitV4BranchIdSchema,
  base_oid: gitV4OidSchema,
  review_token: gitV4ReviewTokenSchema,
  affected_entry_count: z.number().int().nonnegative(),
  affected_byte_count: z.number().int().nonnegative(),
  materialization: z.literal("raw_git_blobs"),
  external_filters_hydrated: z.literal(false),
  submodules_initialized: z.literal(false)
}).strict();

const executeDataSchema = z.object({
  action: z.literal("execute"),
  repository_id: gitV4RepositoryIdSchema,
  task: gitV4TaskSummarySchema,
  workspace_id: gitV4WorkspaceIdSchema,
  materialization: z.literal("raw_git_blobs"),
  external_filters_hydrated: z.literal(false),
  submodules_initialized: z.literal(false),
  affected_entry_count: z.number().int().nonnegative()
}).strict();

export const createTaskWorktreeDataV4Schema = z.discriminatedUnion("action", [
  prepareDataSchema,
  executeDataSchema
]);

const tool = defineGitV4Tool("create_task_worktree", "Create Task Worktree", createTaskWorktreeDataV4Schema);
export const createTaskWorktreeOutputShapeV4 = tool.outputShape;
export const createTaskWorktreeOutputSchemaV4 = tool.outputSchema;
export const createTaskWorktreeUnavailableV4 = tool.unavailable;
export const createTaskWorktreeSuccessV4 = tool.success;
export const createTaskWorktreeFailureV4 = tool.failure;

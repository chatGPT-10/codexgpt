import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4OidSchema,
  gitV4PathsSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4StashIdSchema,
  gitV4StateTokenSchema,
  gitV4TaskWorktreeIdSchema,
  gitV4TimestampSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitStashInputV4Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), workspace_id: gitV4WorkspaceIdSchema }).strict(),
  z.object({
    action: z.literal("prepare_create"),
    workspace_id: gitV4WorkspaceIdSchema,
    state_token: gitV4StateTokenSchema,
    paths: gitV4PathsSchema
  }).strict(),
  z.object({ action: z.literal("execute_create"), workspace_id: gitV4WorkspaceIdSchema, review_token: gitV4ReviewTokenSchema }).strict(),
  z.object({ action: z.literal("prepare_apply"), workspace_id: gitV4WorkspaceIdSchema, stash_id: gitV4StashIdSchema, state_token: gitV4StateTokenSchema }).strict(),
  z.object({ action: z.literal("execute_apply"), workspace_id: gitV4WorkspaceIdSchema, review_token: gitV4ReviewTokenSchema }).strict(),
  z.object({ action: z.literal("prepare_forget"), workspace_id: gitV4WorkspaceIdSchema, stash_id: gitV4StashIdSchema }).strict(),
  z.object({ action: z.literal("execute_forget"), workspace_id: gitV4WorkspaceIdSchema, review_token: gitV4ReviewTokenSchema }).strict()
]);

const stashSummarySchema = z.object({
  stash_id: gitV4StashIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema.nullable(),
  path_count: z.number().int().positive().max(256),
  byte_count: z.number().int().nonnegative(),
  created_at: gitV4TimestampSchema
}).strict();

const listDataSchema = z.object({
  action: z.literal("list"),
  repository_id: gitV4RepositoryIdSchema,
  stashes: z.array(stashSummarySchema).max(128),
  truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (new Set(value.stashes.map((stash) => stash.stash_id)).size !== value.stashes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stashes"], message: "Stash IDs must be unique." });
  }
});

const prepareCreateDataSchema = z.object({
  action: z.literal("prepare_create"),
  repository_id: gitV4RepositoryIdSchema,
  review_token: gitV4ReviewTokenSchema,
  path_count: z.number().int().positive().max(256),
  byte_count: z.number().int().nonnegative(),
  complete_rollback_retained: z.literal(true),
  normalization: z.literal("raw_git_blobs")
}).strict();

const executeCreateDataSchema = z.object({
  action: z.literal("execute_create"),
  repository_id: gitV4RepositoryIdSchema,
  stash_id: gitV4StashIdSchema,
  state_token: gitV4StateTokenSchema,
  retained: z.literal(true)
}).strict();

const prepareApplyDataSchema = z.object({
  action: z.literal("prepare_apply"),
  repository_id: gitV4RepositoryIdSchema,
  review_token: gitV4ReviewTokenSchema,
  stash_id: gitV4StashIdSchema,
  path_count: z.number().int().positive().max(256),
  byte_count: z.number().int().nonnegative(),
  complete_rollback_retained: z.literal(true),
  conflict_free: z.literal(true),
  normalization: z.literal("raw_git_blobs")
}).strict();

const executeApplyDataSchema = z.object({
  action: z.literal("execute_apply"),
  repository_id: gitV4RepositoryIdSchema,
  stash_id: gitV4StashIdSchema,
  state_token: gitV4StateTokenSchema,
  retained: z.literal(true)
}).strict();

const prepareForgetDataSchema = z.object({
  action: z.literal("prepare_forget"),
  repository_id: gitV4RepositoryIdSchema,
  review_token: gitV4ReviewTokenSchema,
  stash_id: gitV4StashIdSchema,
  expected_oid: gitV4OidSchema,
  created_at: gitV4TimestampSchema,
  age_seconds: z.number().int().nonnegative(),
  path_count: z.number().int().positive().max(256),
  byte_count: z.number().int().nonnegative(),
  rollback_cas_retained: z.literal(true)
}).strict();

const executeForgetDataSchema = z.object({
  action: z.literal("execute_forget"),
  repository_id: gitV4RepositoryIdSchema,
  stash_id: gitV4StashIdSchema,
  retained: z.literal(false),
  gc_executed: z.literal(false)
}).strict();

export const gitStashDataV4Schema = z.union([
  listDataSchema,
  prepareCreateDataSchema,
  executeCreateDataSchema,
  prepareApplyDataSchema,
  executeApplyDataSchema,
  prepareForgetDataSchema,
  executeForgetDataSchema
]);

const tool = defineGitV4Tool("git_stash", "Git Stash", gitStashDataV4Schema);
export const gitStashOutputShapeV4 = tool.outputShape;
export const gitStashOutputSchemaV4 = tool.outputSchema;
export const createGitStashSuccessV4 = tool.success;
export const createGitStashFailureV4 = tool.failure;
export const createGitStashUnavailableV4 = tool.unavailable;

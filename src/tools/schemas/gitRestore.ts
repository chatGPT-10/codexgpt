import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4PathsSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4SafeOneLineTextSchema,
  gitV4StateTokenSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

const restoreModeSchema = z.enum(["index_from_head", "worktree_from_index"]);

export const gitRestoreInputV4Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    workspace_id: gitV4WorkspaceIdSchema,
    state_token: gitV4StateTokenSchema,
    mode: restoreModeSchema,
    paths: gitV4PathsSchema
  }).strict(),
  z.object({
    action: z.literal("execute"),
    workspace_id: gitV4WorkspaceIdSchema,
    review_token: gitV4ReviewTokenSchema
  }).strict()
]);

const preparedDataSchema = z.object({
  action: z.literal("prepare"),
  repository_id: gitV4RepositoryIdSchema,
  review_token: gitV4ReviewTokenSchema,
  mode: restoreModeSchema,
  paths: gitV4PathsSchema,
  affected_path_count: z.number().int().positive().max(256),
  affected_bytes: z.number().int().nonnegative(),
  complete_undo_retained: z.boolean(),
  loss_summary: gitV4SafeOneLineTextSchema(240)
}).strict().superRefine((value, context) => {
  if (value.affected_path_count !== value.paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["affected_path_count"], message: "affected_path_count must equal paths.length." });
  }
});

const executedDataSchema = z.object({
  action: z.literal("execute"),
  repository_id: gitV4RepositoryIdSchema,
  mode: restoreModeSchema,
  restored_paths: gitV4PathsSchema,
  state_token: gitV4StateTokenSchema
}).strict();

export const gitRestoreDataV4Schema = z.union([preparedDataSchema, executedDataSchema]);

const tool = defineGitV4Tool("git_restore", "Git Restore", gitRestoreDataV4Schema);
export const gitRestoreOutputShapeV4 = tool.outputShape;
export const gitRestoreOutputSchemaV4 = tool.outputSchema;
export const createGitRestoreSuccessV4 = tool.success;
export const createGitRestoreFailureV4 = tool.failure;
export const createGitRestoreUnavailableV4 = tool.unavailable;

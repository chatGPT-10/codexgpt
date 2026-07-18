import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4BaseSelectorSchema,
  gitV4BranchIdSchema,
  gitV4CodexBranchNameSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4StateTokenSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const gitCreateBranchInputV4Schema = z.object({
  workspace_id: gitV4WorkspaceIdSchema,
  state_token: gitV4StateTokenSchema,
  name: gitV4CodexBranchNameSchema,
  base: gitV4BaseSelectorSchema
}).strict();

export const gitCreateBranchDataV4Schema = z.object({
  repository_id: gitV4RepositoryIdSchema,
  branch_id: gitV4BranchIdSchema,
  oid: gitV4OidSchema,
  created: z.literal(true),
  state_token: gitV4StateTokenSchema
}).strict();

const tool = defineGitV4Tool("git_create_branch", "Git Create Branch", gitCreateBranchDataV4Schema);
export const gitCreateBranchOutputShapeV4 = tool.outputShape;
export const gitCreateBranchOutputSchemaV4 = tool.outputSchema;
export const createGitCreateBranchSuccessV4 = tool.success;
export const createGitCreateBranchFailureV4 = tool.failure;
export const createGitCreateBranchUnavailableV4 = tool.unavailable;

import { z } from "zod";
import {
  defineGitV4Tool,
  gitV4FileChangeSchema,
  gitV4LiteralPathSchema,
  gitV4MergePlanIdSchema,
  gitV4OidSchema,
  gitV4RepositoryIdSchema,
  gitV4ReviewTokenSchema,
  gitV4SafeMultilineTextSchema,
  gitV4TaskWorktreeIdSchema,
  gitV4TimestampSchema,
  gitV4WorkspaceIdSchema
} from "./gitV4Common.js";

export const mergeTaskWorktreeInputV4Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("finalize"),
    workspace_id: gitV4WorkspaceIdSchema,
    task_worktree_id: gitV4TaskWorktreeIdSchema,
    review_token: gitV4ReviewTokenSchema,
    integration_review_token: gitV4ReviewTokenSchema.optional()
  }).strict(),
  z.object({
    action: z.literal("prepare"),
    workspace_id: gitV4WorkspaceIdSchema,
    task_worktree_id: gitV4TaskWorktreeIdSchema,
    message: gitV4SafeMultilineTextSchema(16 * 1024).optional(),
    integration_review_token: gitV4ReviewTokenSchema.optional()
  }).strict(),
  z.object({
    action: z.literal("execute"),
    workspace_id: gitV4WorkspaceIdSchema,
    task_worktree_id: gitV4TaskWorktreeIdSchema,
    merge_plan_id: gitV4MergePlanIdSchema,
    verification_receipts: z.array(z.string().regex(/^verify_[A-Za-z0-9_-]+$/u)).max(32).default([]),
    skip_checks: z.boolean().default(false),
    integration_review_token: gitV4ReviewTokenSchema.optional()
  }).strict()
]);

const preparationDataSchema = z.object({
  action: z.enum(["prepare", "finalize"]),
  repository_id: gitV4RepositoryIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  merge_plan_id: gitV4MergePlanIdSchema.nullable(),
  review_token: gitV4ReviewTokenSchema.nullable(),
  status: z.enum(["fast_forward", "clean_merge", "approval_required", "conflicted", "checks_required"]),
  target_oid: gitV4OidSchema,
  task_oid: gitV4OidSchema,
  candidate_oid: gitV4OidSchema.nullable(),
  changes: z.array(gitV4FileChangeSchema).max(4096),
  conflicts: z.array(z.object({ path: gitV4LiteralPathSchema }).strict()).max(256),
  path_scan_complete: z.literal(true),
  secret_scan_complete: z.literal(true),
  history_scan_complete: z.literal(true),
  checks_complete: z.boolean(),
  integration_workspace_id: gitV4WorkspaceIdSchema.nullable(),
  execution_isolation: z.literal("none"),
  repository_integrations: z.enum(["disabled", "approved_full_access"]),
  expires_at: gitV4TimestampSchema.nullable()
}).strict().superRefine((value, context) => {
  const conflicted = value.status === "conflicted";
  if (conflicted !== (value.candidate_oid === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidate_oid"], message: "Only conflicted preparation may omit the candidate OID." });
  }
  if (conflicted !== (value.merge_plan_id === null)) {
    const awaitingApproval = value.status === "approval_required";
    if (!awaitingApproval) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["merge_plan_id"], message: "Only conflict or approval review may omit a merge plan." });
    }
  }
  if ((value.status === "approval_required") !== (value.review_token !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["review_token"], message: "Only divergent approval review carries a review token." });
  }
  if (conflicted !== (value.conflicts.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["conflicts"], message: "Conflicts must be present exactly for conflicted preparation." });
  }
  if (new Set(value.changes.map((entry) => entry.path)).size !== value.changes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changes"], message: "Merge change paths must be unique." });
  }
  if (new Set(value.conflicts.map((entry) => entry.path)).size !== value.conflicts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["conflicts"], message: "Merge conflict paths must be unique." });
  }
  if (conflicted && value.checks_complete) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["checks_complete"], message: "Conflicted preparation cannot have complete checks." });
  }
  if (!conflicted && value.status !== "approval_required" && ((value.status === "checks_required") !== !value.checks_complete)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["checks_complete"], message: "checks_required must exactly represent incomplete required checks." });
  }
});

const executeDataSchema = z.object({
  action: z.literal("execute"),
  repository_id: gitV4RepositoryIdSchema,
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  merge_plan_id: gitV4MergePlanIdSchema,
  target_old_oid: gitV4OidSchema,
  target_new_oid: gitV4OidSchema,
  integrated: z.literal(true),
  task_retained: z.literal(true),
  execution_isolation: z.literal("none"),
  repository_integrations: z.enum(["disabled", "approved_full_access"])
}).strict();

export const mergeTaskWorktreeDataV4Schema = z.union([preparationDataSchema, executeDataSchema]);

const tool = defineGitV4Tool("merge_task_worktree", "Merge Task Worktree", mergeTaskWorktreeDataV4Schema);
export const mergeTaskWorktreeOutputShapeV4 = tool.outputShape;
export const mergeTaskWorktreeOutputSchemaV4 = tool.outputSchema;
export const createMergeTaskWorktreeUnavailableV4 = tool.unavailable;
export const createMergeTaskWorktreeSuccessV4 = tool.success;
export const createMergeTaskWorktreeFailureV4 = tool.failure;

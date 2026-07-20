import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const WORKSPACE_SNAPSHOT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  SNAPSHOT_SUMMARY_FAILED: "The workspace summary could not be collected.",
  AI_CONTEXT_FAILED: "The AI handoff context could not be collected.",
  INTERNAL_ERROR: "The workspace snapshot failed because of an internal error."
} as const;

export const workspaceSnapshotSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

export const workspaceSnapshotSkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

export const workspaceSnapshotDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  agents_loaded: z.boolean(),
  agents_path: z.string().min(1).nullable(),
  skills: z.array(z.string().min(1)),
  skill_inventory: z.array(workspaceSnapshotSkillSchema),
  skill_counts: workspaceSnapshotSkillCountsSchema,
  tree: z.string().min(1),
  git_status: z.string().min(1),
  ai_context_files: z.array(z.string().min(1)),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"])
}).strict();

const workspaceNotFoundDetailsSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("workspace_id"),
    workspace_id: z.string().min(1)
  }).strict(),
  z.object({
    source: z.literal("default_workspace"),
    workspace_id: z.null()
  }).strict()
]);

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(WORKSPACE_SNAPSHOT_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceNotFoundDetailsSchema
}).strict();

const snapshotSummaryFailedErrorSchema = z.object({
  code: z.literal("SNAPSHOT_SUMMARY_FAILED"),
  message: z.literal(WORKSPACE_SNAPSHOT_ERROR_MESSAGES.SNAPSHOT_SUMMARY_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const aiContextFailedErrorSchema = z.object({
  code: z.literal("AI_CONTEXT_FAILED"),
  message: z.literal(WORKSPACE_SNAPSHOT_ERROR_MESSAGES.AI_CONTEXT_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(WORKSPACE_SNAPSHOT_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const workspaceSnapshotErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  snapshotSummaryFailedErrorSchema,
  aiContextFailedErrorSchema,
  internalErrorSchema
]);

export const workspaceSnapshotOutputShape = {
  codexgpt_tool: z.literal("workspace_snapshot"),
  codexgpt_title: z.literal("Workspace Snapshot"),
  ok: z.boolean(),
  data: workspaceSnapshotDataSchema.nullable(),
  error: workspaceSnapshotErrorSchema.nullable(),
  meta: toolMetaSchema
};

const workspaceSnapshotOutputBaseSchema = z.object(workspaceSnapshotOutputShape).strict();

export const workspaceSnapshotOutputSchema = workspaceSnapshotOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful workspace_snapshot results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful workspace_snapshot results require error to be null."
        });
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed workspace_snapshot results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed workspace_snapshot results require an error object."
      });
    }
  }
);

export type WorkspaceSnapshotData = z.infer<typeof workspaceSnapshotDataSchema>;
export type WorkspaceSnapshotStructuredResult = z.infer<typeof workspaceSnapshotOutputBaseSchema>;

export type WorkspaceSnapshotFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details:
        | { source: "workspace_id"; workspace_id: string }
        | { source: "default_workspace"; workspace_id: null };
    }
  | { code: "SNAPSHOT_SUMMARY_FAILED"; details: Record<string, never> }
  | { code: "AI_CONTEXT_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createWorkspaceSnapshotSuccess(
  data: WorkspaceSnapshotData,
  durationMs = 0
): WorkspaceSnapshotStructuredResult {
  return workspaceSnapshotOutputSchema.parse({
    codexgpt_tool: "workspace_snapshot",
    codexgpt_title: "Workspace Snapshot",
    ok: true,
    data: workspaceSnapshotDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createWorkspaceSnapshotFailure(
  failure: WorkspaceSnapshotFailureInput,
  durationMs = 0
): WorkspaceSnapshotStructuredResult {
  return workspaceSnapshotOutputSchema.parse({
    codexgpt_tool: "workspace_snapshot",
    codexgpt_title: "Workspace Snapshot",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: WORKSPACE_SNAPSHOT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

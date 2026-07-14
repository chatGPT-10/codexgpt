import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const CLOSE_WORKSPACE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The workspace handle is unavailable. Open the workspace again and use the new workspace_id.",
  INTERNAL_ERROR: "The workspace could not be closed because of an internal error."
} as const;

const workspaceIdSchema = z.string()
  .regex(/^ws_[0-9a-f]{32}$/, "workspace_id must be an opaque CodexPro workspace handle.");

const utcTimestampSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}, "closed_at must be an exact UTC ISO-8601 timestamp.");

export const closeWorkspaceDataSchema = z.object({
  workspace_id: workspaceIdSchema,
  closed_at: utcTimestampSchema,
  state: z.literal("closed")
}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(CLOSE_WORKSPACE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: z.object({
    workspace_id: z.string().min(1).max(160)
  }).strict()
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(CLOSE_WORKSPACE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: z.object({}).strict()
}).strict();

export const closeWorkspaceErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  internalErrorSchema
]);

export const closeWorkspaceOutputShape = {
  codexpro_tool: z.literal("close_workspace"),
  codexpro_title: z.literal("Close Workspace"),
  ok: z.boolean(),
  data: closeWorkspaceDataSchema.nullable(),
  error: closeWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const closeWorkspaceOutputBaseSchema = z.object(closeWorkspaceOutputShape).strict();

export const closeWorkspaceOutputSchema = closeWorkspaceOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful close_workspace results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful close_workspace results require error to be null."
      });
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed close_workspace results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed close_workspace results require an error object."
    });
  }
});

export type CloseWorkspaceData = z.infer<typeof closeWorkspaceDataSchema>;
export type CloseWorkspaceStructuredResult = z.infer<typeof closeWorkspaceOutputBaseSchema>;

export type CloseWorkspaceFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createCloseWorkspaceSuccess(
  data: CloseWorkspaceData,
  durationMs = 0
): CloseWorkspaceStructuredResult {
  return closeWorkspaceOutputSchema.parse({
    codexpro_tool: "close_workspace",
    codexpro_title: "Close Workspace",
    ok: true,
    data: closeWorkspaceDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createCloseWorkspaceFailure(
  failure: CloseWorkspaceFailureInput,
  durationMs = 0
): CloseWorkspaceStructuredResult {
  return closeWorkspaceOutputSchema.parse({
    codexpro_tool: "close_workspace",
    codexpro_title: "Close Workspace",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CLOSE_WORKSPACE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

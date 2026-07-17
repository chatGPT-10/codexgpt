import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const openFullAccessWorkspaceInputV1Schema = z.object({
  root: z.string().min(1).max(32_767),
  access: z.enum(["read_only", "read_write"]),
  lease_ms: z.number().int().min(60_000).max(30 * 60_000).optional()
}).strict();

export type OpenFullAccessWorkspaceInputV1 = z.infer<typeof openFullAccessWorkspaceInputV1Schema>;

export const fullAccessWorkspaceDataV1Schema = z.object({
  workspace_id: z.string().min(1).max(160),
  root: z.string().min(1).max(32_767),
  access_class: z.literal("confirmed_root"),
  access: z.enum(["read_only", "read_write"]),
  lease_id: z.string().min(1).max(160),
  idle_expires_at: z.string().datetime({ offset: true }),
  absolute_expires_at: z.string().datetime({ offset: true })
}).strict();

export const OPEN_FULL_ACCESS_WORKSPACE_ERROR_MESSAGES = Object.freeze({
  LOCAL_ROOT_APPROVAL_REQUIRED: "Local approval is required before this root can be inspected or opened.",
  LOCAL_ROOT_ADMISSION_STALE: "The approved root admission is stale. Request local approval again.",
  WORKSPACE_POLICY_STALE: "The workspace policy context changed. Open the root again.",
  APPROVAL_QUEUE_FULL: "The local approval queue is full. Retry later.",
  INTERNAL_ERROR: "The confirmed-root workspace could not be opened because of an internal error."
});

export type OpenFullAccessWorkspaceErrorCode = keyof typeof OPEN_FULL_ACCESS_WORKSPACE_ERROR_MESSAGES;

const errorCodeSchema = z.enum(
  Object.keys(OPEN_FULL_ACCESS_WORKSPACE_ERROR_MESSAGES) as [
    OpenFullAccessWorkspaceErrorCode,
    ...OpenFullAccessWorkspaceErrorCode[]
  ]
);

const openFullAccessWorkspaceErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.object({
    approval_id: z.string().min(1).max(160).optional(),
    server_id: z.string().min(1).max(160).optional(),
    next_action: z.string().min(1).max(240).optional()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.message !== OPEN_FULL_ACCESS_WORKSPACE_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Root-admission error message is not canonical." });
  }
});

export const openFullAccessWorkspaceOutputShape = {
  codexpro_tool: z.literal("open_full_access_workspace"),
  codexpro_title: z.literal("Open Full Access Workspace"),
  ok: z.boolean(),
  data: fullAccessWorkspaceDataV1Schema.nullable(),
  error: openFullAccessWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const outputBaseSchema = z.object(openFullAccessWorkspaceOutputShape).strict();

export const openFullAccessWorkspaceOutputSchema = outputBaseSchema.superRefine((value, context) => {
  if (value.ok !== (value.data !== null && value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Root-admission result success fields are inconsistent." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Root-admission failure fields are inconsistent." });
  }
});

export type OpenFullAccessWorkspaceStructuredResult = z.infer<typeof outputBaseSchema>;

export function createOpenFullAccessWorkspaceSuccess(
  data: z.infer<typeof fullAccessWorkspaceDataV1Schema>,
  durationMs = 0
): OpenFullAccessWorkspaceStructuredResult {
  return openFullAccessWorkspaceOutputSchema.parse({
    codexpro_tool: "open_full_access_workspace",
    codexpro_title: "Open Full Access Workspace",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createOpenFullAccessWorkspaceFailure(
  code: OpenFullAccessWorkspaceErrorCode,
  details: { approval_id?: string; server_id?: string; next_action?: string } = {},
  durationMs = 0
): OpenFullAccessWorkspaceStructuredResult {
  return openFullAccessWorkspaceOutputSchema.parse({
    codexpro_tool: "open_full_access_workspace",
    codexpro_title: "Open Full Access Workspace",
    ok: false,
    data: null,
    error: {
      code,
      message: OPEN_FULL_ACCESS_WORKSPACE_ERROR_MESSAGES[code],
      retryable: code === "APPROVAL_QUEUE_FULL",
      details
    },
    meta: createToolMeta(durationMs)
  });
}

import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const LIST_WORKSPACES_ERROR_MESSAGES = {
  WORKSPACE_LIST_FAILED: "The open workspace list could not be collected.",
  INTERNAL_ERROR: "The workspace list failed because of an internal error."
} as const;

const openedAtSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}, "openedAt must be an exact UTC ISO-8601 timestamp.");

export const listWorkspaceItemSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  openedAt: openedAtSchema
}).strict();

export const listWorkspacesDataSchema = z.object({
  workspaces: z.array(listWorkspaceItemSchema),
  count: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.count !== value.workspaces.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message: "count must equal workspaces.length."
    });
  }

  const ids = new Set<string>();
  const roots = new Set<string>();
  value.workspaces.forEach((workspace, index) => {
    if (ids.has(workspace.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaces", index, "id"],
        message: "Workspace ids must be unique."
      });
    }
    ids.add(workspace.id);

    if (roots.has(workspace.root)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaces", index, "root"],
        message: "Workspace roots must be unique."
      });
    }
    roots.add(workspace.root);
  });
});

const emptyDetailsSchema = z.object({}).strict();

const workspaceListFailedErrorSchema = z.object({
  code: z.literal("WORKSPACE_LIST_FAILED"),
  message: z.literal(LIST_WORKSPACES_ERROR_MESSAGES.WORKSPACE_LIST_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(LIST_WORKSPACES_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const listWorkspacesErrorSchema = z.discriminatedUnion("code", [
  workspaceListFailedErrorSchema,
  internalErrorSchema
]);

export const listWorkspacesOutputShape = {
  codexpro_tool: z.literal("list_workspaces"),
  codexpro_title: z.literal("List Workspaces"),
  ok: z.boolean(),
  data: listWorkspacesDataSchema.nullable(),
  error: listWorkspacesErrorSchema.nullable(),
  meta: toolMetaSchema
};

const listWorkspacesOutputBaseSchema = z.object(listWorkspacesOutputShape).strict();

export const listWorkspacesOutputSchema = listWorkspacesOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful list_workspaces results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful list_workspaces results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed list_workspaces results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed list_workspaces results require an error object."
    });
  }
});

export type ListWorkspacesData = z.infer<typeof listWorkspacesDataSchema>;
export type ListWorkspacesStructuredResult = z.infer<typeof listWorkspacesOutputBaseSchema>;

export type ListWorkspacesFailureInput =
  | { code: "WORKSPACE_LIST_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createListWorkspacesSuccess(
  data: ListWorkspacesData,
  durationMs = 0
): ListWorkspacesStructuredResult {
  return listWorkspacesOutputSchema.parse({
    codexpro_tool: "list_workspaces",
    codexpro_title: "List Workspaces",
    ok: true,
    data: listWorkspacesDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createListWorkspacesFailure(
  failure: ListWorkspacesFailureInput,
  durationMs = 0
): ListWorkspacesStructuredResult {
  return listWorkspacesOutputSchema.parse({
    codexpro_tool: "list_workspaces",
    codexpro_title: "List Workspaces",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: LIST_WORKSPACES_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

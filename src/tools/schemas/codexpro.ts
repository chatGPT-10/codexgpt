import { z } from "zod";
import { applyPatchOutputSchema } from "./applyPatch.js";
import { bashOutputSchema } from "./bash.js";
import { closeWorkspaceOutputSchema } from "./closeWorkspace.js";
import { codexContextOutputSchema } from "./codexContext.js";
import { codexproInventoryOutputSchema } from "./codexproInventory.js";
import { codexproSelfTestOutputSchema } from "./codexproSelfTest.js";
import { codexSessionsOutputSchema } from "./codexSessions.js";
import { createToolMeta, toolErrorSchema, toolMetaSchema } from "./common.js";
import { editOutputSchema } from "./edit.js";
import { exportProContextOutputSchema } from "./exportProContext.js";
import { gitDiffOutputSchema } from "./gitDiff.js";
import { gitStatusOutputSchema } from "./gitStatus.js";
import { handoffToAgentOutputSchema } from "./handoffToAgent.js";
import { handoffToCodexOutputSchema } from "./handoffToCodex.js";
import { inspectWorkspaceOutputSchema } from "./inspectWorkspace.js";
import { listWorkspacesOutputSchema } from "./listWorkspaces.js";
import { loadSkillOutputSchema } from "./loadSkill.js";
import { openCurrentWorkspaceOutputSchema } from "./openCurrentWorkspace.js";
import { openWorkspaceOutputSchema } from "./openWorkspace.js";
import { readOutputSchema } from "./read.js";
import { readCodexSessionOutputSchema } from "./readCodexSession.js";
import { readHandoffOutputSchema } from "./readHandoff.js";
import { searchOutputSchema } from "./search.js";
import { serverConfigOutputSchema } from "./serverConfig.js";
import { showChangesOutputSchema } from "./showChanges.js";
import { treeOutputSchema } from "./tree.js";
import { waitForHandoffOutputSchema } from "./waitForHandoff.js";
import { workspaceSnapshotOutputSchema } from "./workspaceSnapshot.js";
import { writeOutputSchema } from "./write.js";

export const CANONICAL_CODEXPRO_CHILD_TOOLS = [
  "apply_patch",
  "bash",
  "codex_context",
  "codexpro_inventory",
  "codexpro_self_test",
  "codex_sessions",
  "edit",
  "export_pro_context",
  "git_diff",
  "git_status",
  "handoff_to_agent",
  "handoff_to_codex",
  "inspect_workspace",
  "list_workspaces",
  "close_workspace",
  "load_skill",
  "open_current_workspace",
  "open_workspace",
  "read",
  "read_codex_session",
  "read_handoff",
  "search",
  "server_config",
  "show_changes",
  "tree",
  "wait_for_handoff",
  "workspace_snapshot",
  "write"
] as const;

export type CanonicalCodexProChildTool = typeof CANONICAL_CODEXPRO_CHILD_TOOLS[number];

export const CODEXPRO_ACTION_ALIASES = Object.freeze({
  open: "open_current_workspace",
  snapshot: "workspace_snapshot",
  changes: "show_changes",
  inventory: "codexpro_inventory",
  handoff_poll: "wait_for_handoff",
  pro_export: "export_pro_context",
  agent_handoff: "handoff_to_agent",
  codex_handoff: "handoff_to_codex"
} satisfies Record<string, CanonicalCodexProChildTool>);

export type CodexProAlias = keyof typeof CODEXPRO_ACTION_ALIASES;
export type CodexProAction = CanonicalCodexProChildTool | CodexProAlias;

const canonicalToolSchema = z.enum(CANONICAL_CODEXPRO_CHILD_TOOLS);
const canonicalToolSet = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS);

export const CODEXPRO_ERROR_MESSAGES = Object.freeze({
  ACTION_NOT_AVAILABLE: "The requested CodexPro action is not available.",
  ACTION_ARGUMENTS_INVALID: "The requested CodexPro action arguments are invalid.",
  CHILD_RESULT_INVALID: "The wrapped tool returned an invalid structured result.",
  INTERNAL_ERROR: "CodexPro could not complete the requested action."
});

export type CodexProErrorCode = keyof typeof CODEXPRO_ERROR_MESSAGES;

const safeActionSchema = z.string().min(1).max(160).refine(
  (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
  "Action must be one control-safe line."
);

const actionNotAvailableErrorSchema = toolErrorSchema.extend({
  code: z.literal("ACTION_NOT_AVAILABLE"),
  message: z.literal(CODEXPRO_ERROR_MESSAGES.ACTION_NOT_AVAILABLE),
  retryable: z.literal(false),
  details: z.object({ action: safeActionSchema }).strict()
}).strict();

const actionArgumentsInvalidErrorSchema = toolErrorSchema.extend({
  code: z.literal("ACTION_ARGUMENTS_INVALID"),
  message: z.literal(CODEXPRO_ERROR_MESSAGES.ACTION_ARGUMENTS_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchema
  }).strict()
}).strict();

const childResultInvalidErrorSchema = toolErrorSchema.extend({
  code: z.literal("CHILD_RESULT_INVALID"),
  message: z.literal(CODEXPRO_ERROR_MESSAGES.CHILD_RESULT_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchema
  }).strict()
}).strict();

const internalErrorSchema = toolErrorSchema.extend({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(CODEXPRO_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: z.object({}).strict()
}).strict();

const codexproErrorSchema = z.union([
  actionNotAvailableErrorSchema,
  actionArgumentsInvalidErrorSchema,
  childResultInvalidErrorSchema,
  internalErrorSchema
]);

export const codexproListActionsDataSchema = z.object({
  actions: z.array(canonicalToolSchema),
  action_count: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.action_count !== value.actions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["action_count"],
      message: "action_count must equal actions.length."
    });
  }
  if (new Set(value.actions).size !== value.actions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["actions"],
      message: "actions must be unique."
    });
  }
  const sorted = [...value.actions].sort();
  if (sorted.some((action, index) => action !== value.actions[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["actions"],
      message: "actions must be sorted."
    });
  }
});

const codexproOwnedDataSchema = codexproListActionsDataSchema;

export const codexproOutputShape = {
  codexpro_tool: z.union([z.literal("codexpro"), canonicalToolSchema]),
  codexpro_title: z.string().min(1),
  ok: z.boolean(),
  data: z.record(z.unknown()).nullable(),
  error: z.union([codexproErrorSchema, toolErrorSchema]).nullable(),
  meta: toolMetaSchema,
  codexpro_super_action: safeActionSchema.optional(),
  wrapped_tool: canonicalToolSchema.optional()
};

const codexproOutputBaseSchema = z.object(codexproOutputShape).strict();

const codexproOwnedOutputSchema = z.object({
  codexpro_tool: z.literal("codexpro"),
  codexpro_title: z.literal("CodexPro"),
  ok: z.boolean(),
  data: codexproOwnedDataSchema.nullable(),
  error: codexproErrorSchema.nullable(),
  meta: toolMetaSchema
}).strict().superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful codexpro results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful codexpro results require error to be null."
      });
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed codexpro results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed codexpro results require an error object."
    });
  }
});

const childOutputSchemas: Record<CanonicalCodexProChildTool, z.ZodTypeAny> = {
  apply_patch: applyPatchOutputSchema,
  bash: bashOutputSchema,
  codex_context: codexContextOutputSchema,
  codexpro_inventory: codexproInventoryOutputSchema,
  codexpro_self_test: codexproSelfTestOutputSchema,
  codex_sessions: codexSessionsOutputSchema,
  edit: editOutputSchema,
  export_pro_context: exportProContextOutputSchema,
  git_diff: gitDiffOutputSchema,
  git_status: gitStatusOutputSchema,
  handoff_to_agent: handoffToAgentOutputSchema,
  handoff_to_codex: handoffToCodexOutputSchema,
  inspect_workspace: inspectWorkspaceOutputSchema,
  list_workspaces: listWorkspacesOutputSchema,
  close_workspace: closeWorkspaceOutputSchema,
  load_skill: loadSkillOutputSchema,
  open_current_workspace: openCurrentWorkspaceOutputSchema,
  open_workspace: openWorkspaceOutputSchema,
  read: readOutputSchema,
  read_codex_session: readCodexSessionOutputSchema,
  read_handoff: readHandoffOutputSchema,
  search: searchOutputSchema,
  server_config: serverConfigOutputSchema,
  show_changes: showChangesOutputSchema,
  tree: treeOutputSchema,
  wait_for_handoff: waitForHandoffOutputSchema,
  workspace_snapshot: workspaceSnapshotOutputSchema,
  write: writeOutputSchema
};

export const CODEXPRO_CHILD_OUTPUT_SCHEMAS = Object.freeze(childOutputSchemas);

function stripWrapperFields(value: Record<string, unknown>): Record<string, unknown> {
  const {
    codexpro_super_action: _action,
    wrapped_tool: _wrappedTool,
    ...child
  } = value;
  return child;
}

export function resolveCodexProAction(action: string): CanonicalCodexProChildTool | null {
  if (canonicalToolSet.has(action)) return action as CanonicalCodexProChildTool;
  return CODEXPRO_ACTION_ALIASES[action as CodexProAlias] ?? null;
}

export const codexproOutputSchema = codexproOutputBaseSchema.superRefine((value, context) => {
  if (value.codexpro_tool === "codexpro") {
    const owned = codexproOwnedOutputSchema.safeParse(value);
    if (!owned.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid wrapper-owned codexpro result."
      });
    }
    return;
  }

  if (!value.codexpro_super_action || !value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wrapped child results require wrapper identity fields."
    });
    return;
  }
  if (value.codexpro_tool !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wrapped_tool"],
      message: "wrapped_tool must equal codexpro_tool."
    });
    return;
  }
  if (resolveCodexProAction(value.codexpro_super_action) !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["codexpro_super_action"],
      message: "codexpro_super_action must resolve to wrapped_tool."
    });
    return;
  }
  const childSchema = childOutputSchemas[value.wrapped_tool];
  if (!childSchema.safeParse(stripWrapperFields(value)).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wrapped child result does not match its exact child schema."
    });
  }
});

export type CodexProStructuredResult = z.infer<typeof codexproOutputBaseSchema>;

function safePublicAction(value: unknown): string {
  const normalized = String(value ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return normalized || "invalid-action";
}

export function createCodexProListActionsSuccess(
  actions: readonly string[],
  durationMs = 0
): CodexProStructuredResult {
  const uniqueActions = [...new Set(actions)];
  for (const action of uniqueActions) {
    if (!canonicalToolSet.has(action)) {
      throw new Error("Invalid canonical CodexPro child action.");
    }
  }
  uniqueActions.sort();
  return codexproOutputSchema.parse({
    codexpro_tool: "codexpro",
    codexpro_title: "CodexPro",
    ok: true,
    data: {
      actions: uniqueActions,
      action_count: uniqueActions.length
    },
    error: null,
    meta: createToolMeta(durationMs)
  });
}

type CodexProFailureInput =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | {
      code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID";
      details: { action: unknown; wrapped_tool: CanonicalCodexProChildTool };
    }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

export function createCodexProFailure(
  failure: CodexProFailureInput,
  durationMs = 0
): CodexProStructuredResult {
  const details = failure.code === "ACTION_NOT_AVAILABLE"
    ? { action: safePublicAction(failure.details.action) }
    : failure.code === "INTERNAL_ERROR"
      ? {}
      : {
          action: safePublicAction(failure.details.action),
          wrapped_tool: failure.details.wrapped_tool
        };
  return codexproOutputSchema.parse({
    codexpro_tool: "codexpro",
    codexpro_title: "CodexPro",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXPRO_ERROR_MESSAGES[failure.code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs)
  });
}

export function wrapCodexProChildResult(
  action: string,
  wrappedTool: CanonicalCodexProChildTool,
  childStructuredContent: unknown
): CodexProStructuredResult {
  if (resolveCodexProAction(action) !== wrappedTool) {
    throw new Error("CodexPro action and wrapped tool do not match.");
  }
  if (!childStructuredContent || typeof childStructuredContent !== "object" || Array.isArray(childStructuredContent)) {
    throw new Error("CodexPro child structured result must be an object.");
  }
  const child = childStructuredContent as Record<string, unknown>;
  if ("codexpro_super_action" in child || "wrapped_tool" in child) {
    throw new Error("CodexPro child structured result already contains wrapper fields.");
  }
  const childSchema = childOutputSchemas[wrappedTool];
  const parsedChild = childSchema.parse(child);
  return codexproOutputSchema.parse({
    ...parsedChild,
    codexpro_super_action: safePublicAction(action),
    wrapped_tool: wrappedTool
  });
}

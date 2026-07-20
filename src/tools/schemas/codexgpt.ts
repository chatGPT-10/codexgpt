import { z } from "zod";
import type { ToolContractVersion } from "../../config.js";
import {
  CONTRACT_V1_CHILD_TOOLS,
  CONTRACT_V2_CHILD_TOOLS,
  CONTRACT_V3_CHILD_TOOLS,
  CONTRACT_V4_CHILD_TOOLS,
  canonicalToolsForVersion
} from "../contracts/catalog.js";
import {
  queryAuditEventsInputV2Schema,
  queryAuditEventsResultV2Schema,
  queryAuditEventsInputV3Schema,
  queryAuditEventsResultV3Schema
} from "../../audit/schemas.js";
import { applyPatchOutputSchema, applyPatchOutputSchemaV2 } from "./applyPatch.js";
import { bashOutputSchema } from "./bash.js";
import { closeWorkspaceOutputSchema } from "./closeWorkspace.js";
import { codexContextOutputSchema } from "./codexContext.js";
import { codexgptInventoryOutputSchema } from "./codexgptInventory.js";
import { codexgptSelfTestOutputSchema } from "./codexgptSelfTest.js";
import { codexSessionsOutputSchema } from "./codexSessions.js";
import { createToolMeta, toolErrorSchema, toolMetaSchema } from "./common.js";
import { editOutputSchema, editOutputSchemaV2 } from "./edit.js";
import { exportProContextOutputSchema } from "./exportProContext.js";
import { gitDiffOutputSchema, gitDiffOutputSchemaV4 } from "./gitDiff.js";
import { gitStatusOutputSchema, gitStatusOutputSchemaV4 } from "./gitStatus.js";
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
import { writeOutputSchema, writeOutputSchemaV2 } from "./write.js";
import {
  undoChangeSetInputV2Schema,
  undoChangeSetOutputSchema
} from "./undoChangeSet.js";
import { movePathsOutputSchema } from "./movePaths.js";
import {
  queryAuditEventsOutputSchema,
  queryAuditEventsOutputSchemaV3 as queryAuditEventsToolOutputSchemaV3,
  queryAuditEventsOutputSchemaV4 as queryAuditEventsToolOutputSchemaV4
} from "./queryAuditEvents.js";
import { openFullAccessWorkspaceOutputSchema } from "./openFullAccessWorkspace.js";
import { EXECUTION_OUTPUT_SCHEMAS, EXECUTION_OUTPUT_SCHEMAS_V4 } from "./execution.js";
import { gitLogOutputSchemaV4 } from "./gitLog.js";
import { gitBranchOutputSchemaV4 } from "./gitBranch.js";
import { gitCreateBranchOutputSchemaV4 } from "./gitCreateBranch.js";
import { gitStageOutputSchemaV4 } from "./gitStage.js";
import { gitCommitOutputSchemaV4 } from "./gitCommit.js";
import { gitRestoreOutputSchemaV4 } from "./gitRestore.js";
import { gitStashOutputSchemaV4 } from "./gitStash.js";
import { createTaskWorktreeOutputSchemaV4 } from "./createTaskWorktree.js";
import { listTaskWorktreesOutputSchemaV4 } from "./listTaskWorktrees.js";
import { getTaskWorktreeOutputSchemaV4 } from "./getTaskWorktree.js";
import { mergeTaskWorktreeOutputSchemaV4 } from "./mergeTaskWorktree.js";
import { removeTaskWorktreeOutputSchemaV4 } from "./removeTaskWorktree.js";

export const CANONICAL_CODEXGPT_CHILD_TOOLS_V1 = CONTRACT_V1_CHILD_TOOLS;
export const CANONICAL_CODEXGPT_CHILD_TOOLS_V2 = CONTRACT_V2_CHILD_TOOLS;
export const CANONICAL_CODEXGPT_CHILD_TOOLS_V3 = CONTRACT_V3_CHILD_TOOLS;
export const CANONICAL_CODEXGPT_CHILD_TOOLS_V4 = CONTRACT_V4_CHILD_TOOLS;
export const CANONICAL_CODEXGPT_CHILD_TOOLS = CANONICAL_CODEXGPT_CHILD_TOOLS_V1;

export type CanonicalCodexGPTChildTool = typeof CANONICAL_CODEXGPT_CHILD_TOOLS[number];
export type CanonicalCodexGPTChildToolV2 = typeof CANONICAL_CODEXGPT_CHILD_TOOLS_V2[number];
export type CanonicalCodexGPTChildToolV3 = typeof CANONICAL_CODEXGPT_CHILD_TOOLS_V3[number];
export type CanonicalCodexGPTChildToolV4 = typeof CANONICAL_CODEXGPT_CHILD_TOOLS_V4[number];

export function canonicalCodexGPTChildTools(version: ToolContractVersion) {
  return canonicalToolsForVersion(version);
}

// Versioned contract helpers. The server contract selector remains the sole
// authority for which exact V1/V2/V3 child universe is publicly registered.
export const queryAuditEventsInputSchemaV2 = queryAuditEventsInputV2Schema;
export const queryAuditEventsOutputSchemaV2 = queryAuditEventsResultV2Schema;
export const undoChangeSetInputSchemaV2 = undoChangeSetInputV2Schema;
export const undoChangeSetOutputSchemaV2 = undoChangeSetOutputSchema;
export const queryAuditEventsInputSchemaV3 = queryAuditEventsInputV3Schema;
export const queryAuditEventsOutputSchemaV3 = queryAuditEventsResultV3Schema;

export const CODEXGPT_ADDITIONAL_OUTPUT_SCHEMAS_V2 = Object.freeze({
  query_audit_events: queryAuditEventsOutputSchema,
  undo_change_set: undoChangeSetOutputSchema,
  move_paths: movePathsOutputSchema
});

export const CODEXGPT_ACTION_ALIASES = Object.freeze({
  open: "open_current_workspace",
  snapshot: "workspace_snapshot",
  changes: "show_changes",
  inventory: "codexgpt_inventory",
  handoff_poll: "wait_for_handoff",
  pro_export: "export_pro_context",
  agent_handoff: "handoff_to_agent",
  codex_handoff: "handoff_to_codex"
} satisfies Record<string, CanonicalCodexGPTChildTool>);

export type CodexGPTAlias = keyof typeof CODEXGPT_ACTION_ALIASES;
export type CodexGPTAction = CanonicalCodexGPTChildTool | CodexGPTAlias;

const canonicalToolSchema = z.enum(CANONICAL_CODEXGPT_CHILD_TOOLS);
const canonicalToolSet = new Set<string>(CANONICAL_CODEXGPT_CHILD_TOOLS);

export const CODEXGPT_ERROR_MESSAGES = Object.freeze({
  ACTION_NOT_AVAILABLE: "The requested CodexGPT action is not available.",
  ACTION_ARGUMENTS_INVALID: "The requested CodexGPT action arguments are invalid.",
  CHILD_RESULT_INVALID: "The wrapped tool returned an invalid structured result.",
  INTERNAL_ERROR: "CodexGPT could not complete the requested action."
});

export type CodexGPTErrorCode = keyof typeof CODEXGPT_ERROR_MESSAGES;

const safeActionSchema = z.string().min(1).max(160).refine(
  (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
  "Action must be one control-safe line."
);

const actionNotAvailableErrorSchema = toolErrorSchema.extend({
  code: z.literal("ACTION_NOT_AVAILABLE"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_NOT_AVAILABLE),
  retryable: z.literal(false),
  details: z.object({ action: safeActionSchema }).strict()
}).strict();

const actionArgumentsInvalidErrorSchema = toolErrorSchema.extend({
  code: z.literal("ACTION_ARGUMENTS_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_ARGUMENTS_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchema
  }).strict()
}).strict();

const childResultInvalidErrorSchema = toolErrorSchema.extend({
  code: z.literal("CHILD_RESULT_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.CHILD_RESULT_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchema
  }).strict()
}).strict();

const internalErrorSchema = toolErrorSchema.extend({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: z.object({}).strict()
}).strict();

const codexgptErrorSchema = z.union([
  actionNotAvailableErrorSchema,
  actionArgumentsInvalidErrorSchema,
  childResultInvalidErrorSchema,
  internalErrorSchema
]);

export const codexgptListActionsDataSchema = z.object({
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

const codexgptOwnedDataSchema = codexgptListActionsDataSchema;

export const codexgptOutputShape = {
  codexgpt_tool: z.union([z.literal("codexgpt"), canonicalToolSchema]),
  codexgpt_title: z.string().min(1),
  ok: z.boolean(),
  data: z.record(z.unknown()).nullable(),
  error: z.union([codexgptErrorSchema, toolErrorSchema]).nullable(),
  meta: toolMetaSchema,
  codexgpt_super_action: safeActionSchema.optional(),
  wrapped_tool: canonicalToolSchema.optional()
};

const codexgptOutputBaseSchema = z.object(codexgptOutputShape).strict();

const codexgptOwnedOutputSchema = z.object({
  codexgpt_tool: z.literal("codexgpt"),
  codexgpt_title: z.literal("CodexGPT"),
  ok: z.boolean(),
  data: codexgptOwnedDataSchema.nullable(),
  error: codexgptErrorSchema.nullable(),
  meta: toolMetaSchema
}).strict().superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful codexgpt results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful codexgpt results require error to be null."
      });
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed codexgpt results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed codexgpt results require an error object."
    });
  }
});

const childOutputSchemas: Record<CanonicalCodexGPTChildTool, z.ZodTypeAny> = {
  apply_patch: applyPatchOutputSchema,
  bash: bashOutputSchema,
  codex_context: codexContextOutputSchema,
  codexgpt_inventory: codexgptInventoryOutputSchema,
  codexgpt_self_test: codexgptSelfTestOutputSchema,
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

export const CODEXGPT_CHILD_OUTPUT_SCHEMAS = Object.freeze(childOutputSchemas);

function stripWrapperFields(value: Record<string, unknown>): Record<string, unknown> {
  const {
    codexgpt_super_action: _action,
    wrapped_tool: _wrappedTool,
    ...child
  } = value;
  return child;
}

export function resolveCodexGPTAction(action: string): CanonicalCodexGPTChildTool | null {
  if (canonicalToolSet.has(action)) return action as CanonicalCodexGPTChildTool;
  return CODEXGPT_ACTION_ALIASES[action as CodexGPTAlias] ?? null;
}

export const codexgptOutputSchema = codexgptOutputBaseSchema.superRefine((value, context) => {
  if (value.codexgpt_tool === "codexgpt") {
    const owned = codexgptOwnedOutputSchema.safeParse(value);
    if (!owned.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid wrapper-owned codexgpt result."
      });
    }
    return;
  }

  if (!value.codexgpt_super_action || !value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wrapped child results require wrapper identity fields."
    });
    return;
  }
  if (value.codexgpt_tool !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wrapped_tool"],
      message: "wrapped_tool must equal codexgpt_tool."
    });
    return;
  }
  if (resolveCodexGPTAction(value.codexgpt_super_action) !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["codexgpt_super_action"],
      message: "codexgpt_super_action must resolve to wrapped_tool."
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

export type CodexGPTStructuredResult = z.infer<typeof codexgptOutputBaseSchema>;

function safePublicAction(value: unknown): string {
  const normalized = String(value ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return normalized || "invalid-action";
}

export function createCodexGPTListActionsSuccess(
  actions: readonly string[],
  durationMs = 0
): CodexGPTStructuredResult {
  const uniqueActions = [...new Set(actions)];
  for (const action of uniqueActions) {
    if (!canonicalToolSet.has(action)) {
      throw new Error("Invalid canonical CodexGPT child action.");
    }
  }
  uniqueActions.sort();
  return codexgptOutputSchema.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: true,
    data: {
      actions: uniqueActions,
      action_count: uniqueActions.length
    },
    error: null,
    meta: createToolMeta(durationMs)
  });
}

type CodexGPTFailureInput =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | {
      code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID";
      details: { action: unknown; wrapped_tool: CanonicalCodexGPTChildTool };
    }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

export function createCodexGPTFailure(
  failure: CodexGPTFailureInput,
  durationMs = 0
): CodexGPTStructuredResult {
  const details = failure.code === "ACTION_NOT_AVAILABLE"
    ? { action: safePublicAction(failure.details.action) }
    : failure.code === "INTERNAL_ERROR"
      ? {}
      : {
          action: safePublicAction(failure.details.action),
          wrapped_tool: failure.details.wrapped_tool
        };
  return codexgptOutputSchema.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs)
  });
}

export function wrapCodexGPTChildResult(
  action: string,
  wrappedTool: CanonicalCodexGPTChildTool,
  childStructuredContent: unknown
): CodexGPTStructuredResult {
  if (resolveCodexGPTAction(action) !== wrappedTool) {
    throw new Error("CodexGPT action and wrapped tool do not match.");
  }
  if (!childStructuredContent || typeof childStructuredContent !== "object" || Array.isArray(childStructuredContent)) {
    throw new Error("CodexGPT child structured result must be an object.");
  }
  const child = childStructuredContent as Record<string, unknown>;
  if ("codexgpt_super_action" in child || "wrapped_tool" in child) {
    throw new Error("CodexGPT child structured result already contains wrapper fields.");
  }
  const childSchema = childOutputSchemas[wrappedTool];
  const parsedChild = childSchema.parse(child);
  return codexgptOutputSchema.parse({
    ...parsedChild,
    codexgpt_super_action: safePublicAction(action),
    wrapped_tool: wrappedTool
  });
}

const canonicalToolSchemaV2 = z.enum(CANONICAL_CODEXGPT_CHILD_TOOLS_V2);
const canonicalToolSetV2 = new Set<string>(CANONICAL_CODEXGPT_CHILD_TOOLS_V2);

const actionNotAvailableErrorSchemaV2 = toolErrorSchema.extend({
  code: z.literal("ACTION_NOT_AVAILABLE"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_NOT_AVAILABLE),
  retryable: z.literal(false),
  details: z.object({ action: safeActionSchema }).strict()
}).strict();

const actionArgumentsInvalidErrorSchemaV2 = toolErrorSchema.extend({
  code: z.literal("ACTION_ARGUMENTS_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_ARGUMENTS_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV2
  }).strict()
}).strict();

const childResultInvalidErrorSchemaV2 = toolErrorSchema.extend({
  code: z.literal("CHILD_RESULT_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.CHILD_RESULT_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV2
  }).strict()
}).strict();

const codexgptErrorSchemaV2 = z.union([
  actionNotAvailableErrorSchemaV2,
  actionArgumentsInvalidErrorSchemaV2,
  childResultInvalidErrorSchemaV2,
  internalErrorSchema
]);

const codexgptListActionsDataSchemaV2 = z.object({
  actions: z.array(canonicalToolSchemaV2),
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

const codexgptOwnedOutputSchemaV2 = z.object({
  codexgpt_tool: z.literal("codexgpt"),
  codexgpt_title: z.literal("CodexGPT"),
  ok: z.boolean(),
  data: codexgptListActionsDataSchemaV2.nullable(),
  error: codexgptErrorSchemaV2.nullable(),
  meta: toolMetaSchema
}).strict().superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful codexgpt results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful codexgpt results require error to be null."
      });
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed codexgpt results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed codexgpt results require an error object."
    });
  }
});

const childOutputSchemasV2: Record<CanonicalCodexGPTChildToolV2, z.ZodTypeAny> = {
  ...childOutputSchemas,
  write: writeOutputSchemaV2,
  edit: editOutputSchemaV2,
  apply_patch: applyPatchOutputSchemaV2,
  ...CODEXGPT_ADDITIONAL_OUTPUT_SCHEMAS_V2
};

export const CODEXGPT_CHILD_OUTPUT_SCHEMAS_V2 = Object.freeze(childOutputSchemasV2);

export function resolveCodexGPTActionV2(action: string): CanonicalCodexGPTChildToolV2 | null {
  if (canonicalToolSetV2.has(action)) return action as CanonicalCodexGPTChildToolV2;
  return CODEXGPT_ACTION_ALIASES[action as CodexGPTAlias] ?? null;
}

export const codexgptOutputShapeV2 = {
  codexgpt_tool: z.union([z.literal("codexgpt"), canonicalToolSchemaV2]),
  codexgpt_title: z.string().min(1),
  ok: z.boolean(),
  data: z.record(z.unknown()).nullable(),
  error: z.union([codexgptErrorSchemaV2, toolErrorSchema]).nullable(),
  meta: toolMetaSchema,
  codexgpt_super_action: safeActionSchema.optional(),
  wrapped_tool: canonicalToolSchemaV2.optional()
};

const codexgptOutputBaseSchemaV2 = z.object(codexgptOutputShapeV2).strict();

export const codexgptOutputSchemaV2 = codexgptOutputBaseSchemaV2.superRefine((value, context) => {
  if (value.codexgpt_tool === "codexgpt") {
    if (!codexgptOwnedOutputSchemaV2.safeParse(value).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid wrapper-owned codexgpt V2 result."
      });
    }
    return;
  }
  if (!value.codexgpt_super_action || !value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wrapped V2 child results require wrapper identity fields."
    });
    return;
  }
  if (value.codexgpt_tool !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wrapped_tool"],
      message: "wrapped_tool must equal codexgpt_tool."
    });
    return;
  }
  if (resolveCodexGPTActionV2(value.codexgpt_super_action) !== value.wrapped_tool) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["codexgpt_super_action"],
      message: "codexgpt_super_action must resolve to wrapped_tool."
    });
    return;
  }
  const child = stripWrapperFields(value);
  const schema = childOutputSchemasV2[value.wrapped_tool];
  if (!schema.safeParse(child).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wrapped child result does not match its exact child schema."
    });
  }
});

export type CodexGPTStructuredResultV2 = z.infer<typeof codexgptOutputBaseSchemaV2>;

export function createCodexGPTListActionsSuccessV2(
  actions: readonly string[],
  durationMs = 0
): CodexGPTStructuredResultV2 {
  const uniqueActions = [...new Set(actions)];
  for (const action of uniqueActions) {
    if (!canonicalToolSetV2.has(action)) {
      throw new Error("Invalid canonical CodexGPT V2 child action.");
    }
  }
  uniqueActions.sort();
  return codexgptOwnedOutputSchemaV2.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: true,
    data: {
      actions: uniqueActions,
      action_count: uniqueActions.length
    },
    error: null,
    meta: createToolMeta(durationMs)
  });
}

type CodexGPTFailureInputV2 =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | {
      code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID";
      details: { action: unknown; wrapped_tool: CanonicalCodexGPTChildToolV2 };
    }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

export function createCodexGPTFailureV2(
  failure: CodexGPTFailureInputV2,
  durationMs = 0
): CodexGPTStructuredResultV2 {
  const details = failure.code === "ACTION_NOT_AVAILABLE"
    ? { action: safePublicAction(failure.details.action) }
    : failure.code === "INTERNAL_ERROR"
      ? {}
      : {
          action: safePublicAction(failure.details.action),
          wrapped_tool: failure.details.wrapped_tool
        };
  return codexgptOwnedOutputSchemaV2.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs)
  });
}

export function wrapCodexGPTChildResultV2(
  action: string,
  wrappedTool: CanonicalCodexGPTChildToolV2,
  childStructuredContent: unknown
): CodexGPTStructuredResultV2 {
  if (resolveCodexGPTActionV2(action) !== wrappedTool) {
    throw new Error("CodexGPT V2 action and wrapped tool do not match.");
  }
  if (!childStructuredContent || typeof childStructuredContent !== "object" || Array.isArray(childStructuredContent)) {
    throw new Error("CodexGPT V2 child structured result must be an object.");
  }
  const child = childStructuredContent as Record<string, unknown>;
  if ("codexgpt_super_action" in child || "wrapped_tool" in child) {
    throw new Error("CodexGPT V2 child structured result already contains wrapper fields.");
  }
  const parsedChild = childOutputSchemasV2[wrappedTool].parse(child);
  return codexgptOutputSchemaV2.parse({
    ...parsedChild,
    codexgpt_super_action: safePublicAction(action),
    wrapped_tool: wrappedTool
  });
}

const canonicalToolSchemaV3 = z.enum(
  [...CANONICAL_CODEXGPT_CHILD_TOOLS_V3] as unknown as [
    CanonicalCodexGPTChildToolV3,
    ...CanonicalCodexGPTChildToolV3[]
  ]
);
const canonicalToolSetV3 = new Set<string>(CANONICAL_CODEXGPT_CHILD_TOOLS_V3);

const childOutputSchemasV3 = Object.fromEntries([
  ...Object.entries(childOutputSchemasV2).filter(([name]) => name !== "bash"),
  ["query_audit_events", queryAuditEventsToolOutputSchemaV3],
  ["open_full_access_workspace", openFullAccessWorkspaceOutputSchema],
  ...Object.entries(EXECUTION_OUTPUT_SCHEMAS)
]) as Record<CanonicalCodexGPTChildToolV3, z.ZodTypeAny>;

export const CODEXGPT_CHILD_OUTPUT_SCHEMAS_V3 = Object.freeze(childOutputSchemasV3);

export function resolveCodexGPTActionV3(action: string): CanonicalCodexGPTChildToolV3 | null {
  if (canonicalToolSetV3.has(action)) return action as CanonicalCodexGPTChildToolV3;
  const alias = CODEXGPT_ACTION_ALIASES[action as CodexGPTAlias];
  return alias && canonicalToolSetV3.has(alias) ? alias : null;
}

const actionNotAvailableErrorSchemaV3 = toolErrorSchema.extend({
  code: z.literal("ACTION_NOT_AVAILABLE"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_NOT_AVAILABLE),
  retryable: z.literal(false),
  details: z.object({ action: safeActionSchema }).strict()
}).strict();

const actionArgumentsInvalidErrorSchemaV3 = toolErrorSchema.extend({
  code: z.literal("ACTION_ARGUMENTS_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_ARGUMENTS_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV3
  }).strict()
}).strict();

const childResultInvalidErrorSchemaV3 = toolErrorSchema.extend({
  code: z.literal("CHILD_RESULT_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.CHILD_RESULT_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV3
  }).strict()
}).strict();

const codexgptErrorSchemaV3 = z.union([
  actionNotAvailableErrorSchemaV3,
  actionArgumentsInvalidErrorSchemaV3,
  childResultInvalidErrorSchemaV3,
  internalErrorSchema
]);

const codexgptListActionsDataSchemaV3 = z.object({
  actions: z.array(canonicalToolSchemaV3),
  action_count: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.action_count !== value.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["action_count"], message: "action_count must equal actions.length." });
  }
  if (new Set(value.actions).size !== value.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actions"], message: "actions must be unique." });
  }
  const sorted = [...value.actions].sort();
  if (sorted.some((action, index) => action !== value.actions[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actions"], message: "actions must be sorted." });
  }
});

const codexgptOwnedOutputSchemaV3 = z.object({
  codexgpt_tool: z.literal("codexgpt"),
  codexgpt_title: z.literal("CodexGPT"),
  ok: z.boolean(),
  data: codexgptListActionsDataSchemaV3.nullable(),
  error: codexgptErrorSchemaV3.nullable(),
  meta: toolMetaSchema
}).strict().superRefine((value, context) => {
  if (value.ok && (value.data === null || value.error !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful CodexGPT V3 results require data and no error." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed CodexGPT V3 results require an error and no data." });
  }
});

export const codexgptOutputShapeV3 = {
  codexgpt_tool: z.union([z.literal("codexgpt"), canonicalToolSchemaV3]),
  codexgpt_title: z.string().min(1),
  ok: z.boolean(),
  data: z.record(z.unknown()).nullable(),
  error: z.union([codexgptErrorSchemaV3, toolErrorSchema]).nullable(),
  meta: toolMetaSchema,
  codexgpt_super_action: safeActionSchema.optional(),
  wrapped_tool: canonicalToolSchemaV3.optional()
};

const codexgptOutputBaseSchemaV3 = z.object(codexgptOutputShapeV3).strict();

export const codexgptOutputSchemaV3 = codexgptOutputBaseSchemaV3.superRefine((value, context) => {
  if (value.codexgpt_tool === "codexgpt") {
    if (!codexgptOwnedOutputSchemaV3.safeParse(value).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid wrapper-owned CodexGPT V3 result." });
    }
    return;
  }
  if (!value.codexgpt_super_action || !value.wrapped_tool) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Wrapped V3 child results require wrapper identity fields." });
    return;
  }
  if (value.codexgpt_tool !== value.wrapped_tool ||
      resolveCodexGPTActionV3(value.codexgpt_super_action) !== value.wrapped_tool) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CodexGPT V3 action and wrapped tool do not match." });
    return;
  }
  if (!childOutputSchemasV3[value.wrapped_tool].safeParse(stripWrapperFields(value)).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Wrapped V3 child result does not match its exact child schema." });
  }
});

export type CodexGPTStructuredResultV3 = z.infer<typeof codexgptOutputBaseSchemaV3>;

export function createCodexGPTListActionsSuccessV3(
  actions: readonly string[],
  durationMs = 0
): CodexGPTStructuredResultV3 {
  const uniqueActions = [...new Set(actions)];
  for (const action of uniqueActions) {
    if (!canonicalToolSetV3.has(action)) throw new Error("Invalid canonical CodexGPT V3 child action.");
  }
  uniqueActions.sort();
  return codexgptOwnedOutputSchemaV3.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: true,
    data: { actions: uniqueActions, action_count: uniqueActions.length },
    error: null,
    meta: createToolMeta(durationMs)
  });
}

type CodexGPTFailureInputV3 =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | { code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID"; details: { action: unknown; wrapped_tool: CanonicalCodexGPTChildToolV3 } }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

export function createCodexGPTFailureV3(
  failure: CodexGPTFailureInputV3,
  durationMs = 0
): CodexGPTStructuredResultV3 {
  const details = failure.code === "ACTION_NOT_AVAILABLE"
    ? { action: safePublicAction(failure.details.action) }
    : failure.code === "INTERNAL_ERROR"
      ? {}
      : { action: safePublicAction(failure.details.action), wrapped_tool: failure.details.wrapped_tool };
  return codexgptOwnedOutputSchemaV3.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs)
  });
}

export function wrapCodexGPTChildResultV3(
  action: string,
  wrappedTool: CanonicalCodexGPTChildToolV3,
  childStructuredContent: unknown
): CodexGPTStructuredResultV3 {
  if (resolveCodexGPTActionV3(action) !== wrappedTool) {
    throw new Error("CodexGPT V3 action and wrapped tool do not match.");
  }
  if (!childStructuredContent || typeof childStructuredContent !== "object" || Array.isArray(childStructuredContent)) {
    throw new Error("CodexGPT V3 child structured result must be an object.");
  }
  const child = childStructuredContent as Record<string, unknown>;
  if ("codexgpt_super_action" in child || "wrapped_tool" in child) {
    throw new Error("CodexGPT V3 child structured result already contains wrapper fields.");
  }
  const parsedChild = childOutputSchemasV3[wrappedTool].parse(child);
  return codexgptOutputSchemaV3.parse({
    ...parsedChild,
    codexgpt_super_action: safePublicAction(action),
    wrapped_tool: wrappedTool
  });
}

const canonicalToolSchemaV4 = z.enum(
  [...CANONICAL_CODEXGPT_CHILD_TOOLS_V4] as unknown as [
    CanonicalCodexGPTChildToolV4,
    ...CanonicalCodexGPTChildToolV4[]
  ]
);
const canonicalToolSetV4 = new Set<string>(CANONICAL_CODEXGPT_CHILD_TOOLS_V4);

const childOutputSchemasV4 = Object.freeze({
  ...childOutputSchemasV3,
  run_command: EXECUTION_OUTPUT_SCHEMAS_V4.run_command,
  read_process_output: EXECUTION_OUTPUT_SCHEMAS_V4.read_process_output,
  git_status: gitStatusOutputSchemaV4,
  git_diff: gitDiffOutputSchemaV4,
  query_audit_events: queryAuditEventsToolOutputSchemaV4,
  git_log: gitLogOutputSchemaV4,
  git_branch: gitBranchOutputSchemaV4,
  git_create_branch: gitCreateBranchOutputSchemaV4,
  git_stage: gitStageOutputSchemaV4,
  git_commit: gitCommitOutputSchemaV4,
  git_restore: gitRestoreOutputSchemaV4,
  git_stash: gitStashOutputSchemaV4,
  create_task_worktree: createTaskWorktreeOutputSchemaV4,
  list_task_worktrees: listTaskWorktreesOutputSchemaV4,
  get_task_worktree: getTaskWorktreeOutputSchemaV4,
  merge_task_worktree: mergeTaskWorktreeOutputSchemaV4,
  remove_task_worktree: removeTaskWorktreeOutputSchemaV4
} satisfies Record<CanonicalCodexGPTChildToolV4, z.ZodTypeAny>);

export const CODEXGPT_CHILD_OUTPUT_SCHEMAS_V4 = childOutputSchemasV4;

export function resolveCodexGPTActionV4(action: string): CanonicalCodexGPTChildToolV4 | null {
  if (canonicalToolSetV4.has(action)) return action as CanonicalCodexGPTChildToolV4;
  const alias = CODEXGPT_ACTION_ALIASES[action as CodexGPTAlias];
  return alias && canonicalToolSetV4.has(alias) ? alias : null;
}

const actionNotAvailableErrorSchemaV4 = toolErrorSchema.extend({
  code: z.literal("ACTION_NOT_AVAILABLE"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_NOT_AVAILABLE),
  retryable: z.literal(false),
  details: z.object({ action: safeActionSchema }).strict()
}).strict();

const actionArgumentsInvalidErrorSchemaV4 = toolErrorSchema.extend({
  code: z.literal("ACTION_ARGUMENTS_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.ACTION_ARGUMENTS_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV4
  }).strict()
}).strict();

const childResultInvalidErrorSchemaV4 = toolErrorSchema.extend({
  code: z.literal("CHILD_RESULT_INVALID"),
  message: z.literal(CODEXGPT_ERROR_MESSAGES.CHILD_RESULT_INVALID),
  retryable: z.literal(false),
  details: z.object({
    action: safeActionSchema,
    wrapped_tool: canonicalToolSchemaV4
  }).strict()
}).strict();

const codexgptErrorSchemaV4 = z.union([
  actionNotAvailableErrorSchemaV4,
  actionArgumentsInvalidErrorSchemaV4,
  childResultInvalidErrorSchemaV4,
  internalErrorSchema
]);

const codexgptListActionsDataSchemaV4 = z.object({
  actions: z.array(canonicalToolSchemaV4),
  action_count: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.action_count !== value.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["action_count"], message: "action_count must equal actions.length." });
  }
  if (new Set(value.actions).size !== value.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actions"], message: "actions must be unique." });
  }
  const sorted = [...value.actions].sort();
  if (sorted.some((action, index) => action !== value.actions[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actions"], message: "actions must be sorted." });
  }
});

const codexgptOwnedOutputSchemaV4 = z.object({
  codexgpt_tool: z.literal("codexgpt"),
  codexgpt_title: z.literal("CodexGPT"),
  ok: z.boolean(),
  data: codexgptListActionsDataSchemaV4.nullable(),
  error: codexgptErrorSchemaV4.nullable(),
  meta: toolMetaSchema
}).strict().superRefine((value, context) => {
  if (value.ok && (value.data === null || value.error !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful CodexGPT V4 results require data and no error." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed CodexGPT V4 results require an error and no data." });
  }
});

export const codexgptOutputShapeV4 = {
  codexgpt_tool: z.union([z.literal("codexgpt"), canonicalToolSchemaV4]),
  codexgpt_title: z.string().min(1),
  ok: z.boolean(),
  data: z.record(z.unknown()).nullable(),
  error: z.union([codexgptErrorSchemaV4, toolErrorSchema]).nullable(),
  meta: toolMetaSchema,
  codexgpt_super_action: safeActionSchema.optional(),
  wrapped_tool: canonicalToolSchemaV4.optional()
};

const codexgptOutputBaseSchemaV4 = z.object(codexgptOutputShapeV4).strict();

export const codexgptOutputSchemaV4 = codexgptOutputBaseSchemaV4.superRefine((value, context) => {
  if (value.codexgpt_tool === "codexgpt") {
    if (!codexgptOwnedOutputSchemaV4.safeParse(value).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid wrapper-owned CodexGPT V4 result." });
    }
    return;
  }
  if (!value.codexgpt_super_action || !value.wrapped_tool) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Wrapped V4 child results require wrapper identity fields." });
    return;
  }
  if (value.codexgpt_tool !== value.wrapped_tool ||
      resolveCodexGPTActionV4(value.codexgpt_super_action) !== value.wrapped_tool) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CodexGPT V4 action and wrapped tool do not match." });
    return;
  }
  if (!childOutputSchemasV4[value.wrapped_tool].safeParse(stripWrapperFields(value)).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Wrapped V4 child result does not match its exact child schema." });
  }
});

export type CodexGPTStructuredResultV4 = z.infer<typeof codexgptOutputBaseSchemaV4>;

export function createCodexGPTListActionsSuccessV4(
  actions: readonly string[],
  durationMs = 0
): CodexGPTStructuredResultV4 {
  const uniqueActions = [...new Set(actions)];
  for (const action of uniqueActions) {
    if (!canonicalToolSetV4.has(action)) throw new Error("Invalid canonical CodexGPT V4 child action.");
  }
  uniqueActions.sort();
  return codexgptOwnedOutputSchemaV4.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: true,
    data: { actions: uniqueActions, action_count: uniqueActions.length },
    error: null,
    meta: createToolMeta(durationMs)
  });
}

type CodexGPTFailureInputV4 =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | { code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID"; details: { action: unknown; wrapped_tool: CanonicalCodexGPTChildToolV4 } }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

export function createCodexGPTFailureV4(
  failure: CodexGPTFailureInputV4,
  durationMs = 0
): CodexGPTStructuredResultV4 {
  const details = failure.code === "ACTION_NOT_AVAILABLE"
    ? { action: safePublicAction(failure.details.action) }
    : failure.code === "INTERNAL_ERROR"
      ? {}
      : { action: safePublicAction(failure.details.action), wrapped_tool: failure.details.wrapped_tool };
  return codexgptOwnedOutputSchemaV4.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "CodexGPT",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs)
  });
}

export function wrapCodexGPTChildResultV4(
  action: string,
  wrappedTool: CanonicalCodexGPTChildToolV4,
  childStructuredContent: unknown
): CodexGPTStructuredResultV4 {
  if (resolveCodexGPTActionV4(action) !== wrappedTool) {
    throw new Error("CodexGPT V4 action and wrapped tool do not match.");
  }
  if (!childStructuredContent || typeof childStructuredContent !== "object" || Array.isArray(childStructuredContent)) {
    throw new Error("CodexGPT V4 child structured result must be an object.");
  }
  const child = childStructuredContent as Record<string, unknown>;
  if ("codexgpt_super_action" in child || "wrapped_tool" in child) {
    throw new Error("CodexGPT V4 child structured result already contains wrapper fields.");
  }
  const parsedChild = childOutputSchemasV4[wrappedTool].parse(child);
  return codexgptOutputSchemaV4.parse({
    ...parsedChild,
    codexgpt_super_action: safePublicAction(action),
    wrapped_tool: wrappedTool
  });
}

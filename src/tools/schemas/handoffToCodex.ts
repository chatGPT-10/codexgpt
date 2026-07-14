import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import {
  HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX,
  HANDOFF_TO_AGENT_LOG_NAMES,
  HANDOFF_TO_AGENT_SCAFFOLD_NAMES,
  handoffDataBaseSchema,
  refineHandoffData
} from "./handoffToAgent.js";

export const HANDOFF_TO_CODEX_APPEND_WARNING =
  "Append was requested but no meaningful prior plan existed; a new Codex plan was written." as const;

export const HANDOFF_TO_CODEX_DIFF_TRUNCATION_SUFFIX =
  HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX;

export const HANDOFF_TO_CODEX_SCAFFOLD_NAMES =
  HANDOFF_TO_AGENT_SCAFFOLD_NAMES;

export const HANDOFF_TO_CODEX_LOG_NAMES =
  HANDOFF_TO_AGENT_LOG_NAMES;

export const HANDOFF_TO_CODEX_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  REQUEST_INVALID: "The Codex handoff request is not valid.",
  OUTPUT_PATH_BLOCKED: "A configured handoff output path is blocked by safety rules.",
  OUTPUT_PATH_OUTSIDE_WORKSPACE: "A configured handoff output path is outside the permitted workspace boundary.",
  OUTPUT_PATH_INVALID: "A configured handoff output path is not a usable regular file.",
  EXISTING_PLAN_TOO_LARGE: "The existing handoff plan exceeds the safe read limit.",
  EXISTING_PLAN_NOT_TEXT: "The existing handoff plan is not a supported text file.",
  EXISTING_PLAN_READ_FAILED: "The existing handoff plan could not be read safely.",
  PLAN_TOO_LARGE: "The generated Codex handoff plan exceeds the configured write limit.",
  PLAN_SECRET_BLOCKED: "Secret-looking content is blocked from the generated Codex handoff plan.",
  SCAFFOLD_WRITE_FAILED: "The fixed handoff scaffold could not be created safely.",
  PLAN_WRITE_FAILED: "The Codex handoff plan could not be written safely.",
  LOG_WRITE_FAILED: "The fixed handoff logs could not both be updated safely.",
  HANDOFF_WRITE_FAILED: "The Codex handoff could not be completed safely.",
  INTERNAL_ERROR: "The Codex handoff failed because of an internal error."
} as const;

const safeWorkspaceIdSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "Workspace id cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Workspace id must be one line.");

export const handoffToCodexDataSchema = handoffDataBaseSchema.extend({
  tool_mode: z.literal("full"),
  agent: z.literal("codex"),
  agent_name: z.literal("Codex"),
  model: z.null()
}).superRefine(refineHandoffData);

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({ source: z.literal("workspace_id"), workspace_id: safeWorkspaceIdSchema }).strict(),
  z.object({ source: z.literal("default_workspace"), workspace_id: z.null() }).strict()
]);
const requestInvalidDetailsSchema = z.object({
  source: z.enum(["title", "plan", "append"])
}).strict();
const outputPathDetailsSchema = z.object({ source: z.literal("context_dir") }).strict();

function fixedErrorSchema<Code extends keyof typeof HANDOFF_TO_CODEX_ERROR_MESSAGES>(
  code: Code,
  details: z.ZodTypeAny
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(HANDOFF_TO_CODEX_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

export const handoffToCodexErrorSchema = z.discriminatedUnion("code", [
  fixedErrorSchema("WORKSPACE_NOT_FOUND", workspaceNotFoundDetailsSchema),
  fixedErrorSchema("REQUEST_INVALID", requestInvalidDetailsSchema),
  fixedErrorSchema("OUTPUT_PATH_BLOCKED", outputPathDetailsSchema),
  fixedErrorSchema("OUTPUT_PATH_OUTSIDE_WORKSPACE", outputPathDetailsSchema),
  fixedErrorSchema("OUTPUT_PATH_INVALID", outputPathDetailsSchema),
  fixedErrorSchema("EXISTING_PLAN_TOO_LARGE", emptyDetailsSchema),
  fixedErrorSchema("EXISTING_PLAN_NOT_TEXT", emptyDetailsSchema),
  fixedErrorSchema("EXISTING_PLAN_READ_FAILED", emptyDetailsSchema),
  fixedErrorSchema("PLAN_TOO_LARGE", emptyDetailsSchema),
  fixedErrorSchema("PLAN_SECRET_BLOCKED", emptyDetailsSchema),
  fixedErrorSchema("SCAFFOLD_WRITE_FAILED", emptyDetailsSchema),
  fixedErrorSchema("PLAN_WRITE_FAILED", emptyDetailsSchema),
  fixedErrorSchema("LOG_WRITE_FAILED", emptyDetailsSchema),
  fixedErrorSchema("HANDOFF_WRITE_FAILED", emptyDetailsSchema),
  fixedErrorSchema("INTERNAL_ERROR", emptyDetailsSchema)
]);

export const handoffToCodexOutputShape = {
  codexpro_tool: z.literal("handoff_to_codex"),
  codexpro_title: z.literal("Handoff To Codex"),
  ok: z.boolean(),
  data: handoffToCodexDataSchema.nullable(),
  error: handoffToCodexErrorSchema.nullable(),
  meta: toolMetaSchema
};

const handoffToCodexOutputBaseSchema = z.object(handoffToCodexOutputShape).strict();

function handoffToCodexWarnings(data: HandoffToCodexData): string[] {
  return data.append_requested && !data.append_applied
    ? [HANDOFF_TO_CODEX_APPEND_WARNING]
    : [];
}

export const handoffToCodexOutputSchema = handoffToCodexOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful Codex handoff results require data." });
    }
    if (value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful Codex handoff results require error to be null." });
    }
    if (value.data !== null) {
      const warnings = handoffToCodexWarnings(value.data);
      if (
        warnings.length !== value.meta.warnings.length ||
        warnings.some((warning, index) => warning !== value.meta.warnings[index])
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Codex handoff warnings must exactly match append state." });
      }
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed Codex handoff results require data to be null." });
  }
  if (value.error === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed Codex handoff results require an error." });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Failed Codex handoff results cannot contain warnings." });
  }
});

export type HandoffToCodexData = z.infer<typeof handoffToCodexDataSchema>;
export type HandoffToCodexStructuredResult = z.infer<typeof handoffToCodexOutputBaseSchema>;

export type HandoffToCodexFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { source: "workspace_id"; workspace_id: string } | { source: "default_workspace"; workspace_id: null } }
  | { code: "REQUEST_INVALID"; details: { source: "title" | "plan" | "append" } }
  | { code: "OUTPUT_PATH_BLOCKED" | "OUTPUT_PATH_OUTSIDE_WORKSPACE" | "OUTPUT_PATH_INVALID"; details: { source: "context_dir" } }
  | { code: "EXISTING_PLAN_TOO_LARGE" | "EXISTING_PLAN_NOT_TEXT" | "EXISTING_PLAN_READ_FAILED" | "PLAN_TOO_LARGE" | "PLAN_SECRET_BLOCKED" | "SCAFFOLD_WRITE_FAILED" | "PLAN_WRITE_FAILED" | "LOG_WRITE_FAILED" | "HANDOFF_WRITE_FAILED" | "INTERNAL_ERROR"; details: Record<string, never> };

export function createHandoffToCodexSuccess(
  data: HandoffToCodexData,
  durationMs = 0
): HandoffToCodexStructuredResult {
  const parsedData = handoffToCodexDataSchema.parse(data);
  return handoffToCodexOutputSchema.parse({
    codexpro_tool: "handoff_to_codex",
    codexpro_title: "Handoff To Codex",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, handoffToCodexWarnings(parsedData))
  });
}

export function createHandoffToCodexFailure(
  failure: HandoffToCodexFailureInput,
  durationMs = 0
): HandoffToCodexStructuredResult {
  return handoffToCodexOutputSchema.parse({
    codexpro_tool: "handoff_to_codex",
    codexpro_title: "Handoff To Codex",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: HANDOFF_TO_CODEX_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

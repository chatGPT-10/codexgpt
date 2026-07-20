import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const HANDOFF_TO_AGENT_APPEND_WARNING =
  "No prior handoff plan existed, so a new plan was created." as const;

export const HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX =
  "\n...[diff truncated to 60000 chars]" as const;

export const HANDOFF_TO_AGENT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  REQUEST_INVALID: "The handoff request is not valid.",
  OUTPUT_PATH_BLOCKED: "A configured handoff output path is blocked by safety rules.",
  OUTPUT_PATH_OUTSIDE_WORKSPACE: "A configured handoff output path is outside the permitted workspace boundary.",
  OUTPUT_PATH_INVALID: "A configured handoff output path is not a usable regular file.",
  EXISTING_PLAN_TOO_LARGE: "The existing handoff plan exceeds the safe read limit.",
  EXISTING_PLAN_NOT_TEXT: "The existing handoff plan is not a supported text file.",
  EXISTING_PLAN_READ_FAILED: "The existing handoff plan could not be read safely.",
  PLAN_TOO_LARGE: "The generated handoff plan exceeds the configured write limit.",
  PLAN_SECRET_BLOCKED: "Secret-looking content is blocked from the generated handoff plan.",
  SCAFFOLD_WRITE_FAILED: "The fixed handoff scaffold could not be created safely.",
  PLAN_WRITE_FAILED: "The handoff plan could not be written safely.",
  LOG_WRITE_FAILED: "The fixed handoff logs could not both be updated safely.",
  HANDOFF_WRITE_FAILED: "The handoff could not be completed safely.",
  INTERNAL_ERROR: "The handoff failed because of an internal error."
} as const;

export const HANDOFF_TO_AGENT_SCAFFOLD_NAMES = [
  "README.md",
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl",
  "session-log.jsonl"
] as const;

export const HANDOFF_TO_AGENT_LOG_NAMES = [
  "session-log.jsonl",
  "execution-log.jsonl"
] as const;

const safeWorkspaceIdSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "Workspace id cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Workspace id must be one line.");

function isSafeRelativePath(value: string): boolean {
  if (value.trim() !== value || value.length === 0 || value.length > 512) return false;
  if (value.includes("\\") || value.includes(":")) return false;
  if (value.startsWith("/") || value.endsWith("/") || /[\r\n\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.endsWith(".") &&
    !segment.endsWith(" ")
  );
}

export const handoffToAgentPathSchema = z.string().refine(
  isSafeRelativePath,
  "Path must use safe workspace-relative POSIX syntax."
);

const agentSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);

const oneLineSchema = (max: number) => z.string()
  .min(1)
  .max(max)
  .refine((value) => value.trim() === value, "Value cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Value must be one line.");

function orderedSubset(values: string[], expected: string[]): boolean {
  let previousIndex = -1;
  for (const value of values) {
    const index = expected.indexOf(value);
    if (index < 0 || index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

export const handoffDataBaseSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1).max(32_000),
  tool_mode: z.enum(["minimal", "standard", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  agent: agentSchema,
  agent_name: oneLineSchema(80),
  model: oneLineSchema(120).nullable(),
  title: oneLineSchema(120),
  updated_at: z.string().datetime({ offset: true }),
  append_requested: z.boolean(),
  append_applied: z.boolean(),
  max_write_bytes: z.number().int().min(1).max(32_000_000),
  plan_path: handoffToAgentPathSchema,
  status_path: handoffToAgentPathSchema,
  diff_path: handoffToAgentPathSchema,
  log_path: handoffToAgentPathSchema,
  execution_log_path: handoffToAgentPathSchema,
  created_context_files: z.array(handoffToAgentPathSchema).max(HANDOFF_TO_AGENT_SCAFFOLD_NAMES.length),
  created_context_file_count: z.number().int().min(0).max(HANDOFF_TO_AGENT_SCAFFOLD_NAMES.length),
  plan_file_existed_before: z.boolean(),
  prior_plan_available: z.boolean(),
  previous_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  plan_bytes: z.number().int().min(1).max(32_000_000),
  plan_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  additions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  deletions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  changed: z.boolean(),
  diff: z.string().min(1).max(60_100),
  diff_bytes: z.number().int().min(1).max(240_400),
  diff_truncated: z.boolean(),
  logged_paths: z.array(handoffToAgentPathSchema).length(HANDOFF_TO_AGENT_LOG_NAMES.length),
  logged_count: z.literal(HANDOFF_TO_AGENT_LOG_NAMES.length),
  event_bytes: z.number().int().min(1).max(100_000),
  event_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  prompt: z.string().min(1).max(20_000),
  prompt_bytes: z.number().int().min(1).max(80_000)
}).strict();

export type HandoffDataBase = z.infer<typeof handoffDataBaseSchema>;

export function refineHandoffData(value: HandoffDataBase, context: z.RefinementCtx): void {
  if (!value.plan_path.endsWith("/current-plan.md")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["plan_path"], message: "Plan path must use the fixed artifact name." });
    return;
  }
  const contextDir = value.plan_path.slice(0, -"/current-plan.md".length);
  if (!isSafeRelativePath(contextDir)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["plan_path"], message: "Plan path requires one safe context directory." });
    return;
  }

  const expectedPaths = {
    status_path: `${contextDir}/agent-status.md`,
    diff_path: `${contextDir}/implementation-diff.patch`,
    log_path: `${contextDir}/session-log.jsonl`,
    execution_log_path: `${contextDir}/execution-log.jsonl`
  } as const;
  for (const [field, expected] of Object.entries(expectedPaths)) {
    if (value[field as keyof typeof expectedPaths] !== expected) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Handoff paths must share the configured fixed context directory." });
    }
  }

  const expectedScaffoldPaths = HANDOFF_TO_AGENT_SCAFFOLD_NAMES.map((name) => `${contextDir}/${name}`);
  if (
    value.created_context_file_count !== value.created_context_files.length ||
    !orderedSubset(value.created_context_files, expectedScaffoldPaths)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["created_context_files"], message: "Created paths must be one exact ordered scaffold subset." });
  }

  const expectedLoggedPaths = HANDOFF_TO_AGENT_LOG_NAMES.map((name) => `${contextDir}/${name}`);
  if (
    value.logged_count !== value.logged_paths.length ||
    value.logged_paths.some((item, index) => item !== expectedLoggedPaths[index])
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["logged_paths"], message: "Both fixed logs must be reported in canonical order." });
  }

  if (value.prior_plan_available && !value.plan_file_existed_before) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["prior_plan_available"], message: "A prior plan requires a pre-existing plan file." });
  }
  if (!value.plan_file_existed_before && value.previous_bytes !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["previous_bytes"], message: "An absent prior plan file has zero bytes." });
  }
  if (value.append_applied !== (value.append_requested && value.prior_plan_available)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["append_applied"], message: "Applied append state must match the request and meaningful prior plan." });
  }
  if (value.plan_bytes > value.max_write_bytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["plan_bytes"], message: "Plan bytes cannot exceed the configured write limit." });
  }

  if (value.diff_bytes !== Buffer.byteLength(value.diff, "utf8")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff_bytes"], message: "Diff bytes must match the returned UTF-8 diff." });
  }
  if (value.diff_truncated !== value.diff.endsWith(HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff_truncated"], message: "Diff truncation state must match the fixed suffix." });
  }
  if (!value.changed) {
    if (value.additions !== 0 || value.deletions !== 0 || value.diff !== `No changes in ${value.plan_path}.`) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed"], message: "Unchanged results require zero counts and the fixed no-change diff." });
    }
  } else if (value.additions + value.deletions === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed"], message: "Changed results require a non-zero diff count." });
  }

  if (value.prompt_bytes !== Buffer.byteLength(value.prompt, "utf8")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["prompt_bytes"], message: "Prompt bytes must match the returned UTF-8 prompt." });
  }
}

export const handoffToAgentDataSchema = handoffDataBaseSchema.superRefine(refineHandoffData);

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({ source: z.literal("workspace_id"), workspace_id: safeWorkspaceIdSchema }).strict(),
  z.object({ source: z.literal("default_workspace"), workspace_id: z.null() }).strict()
]);
const requestInvalidDetailsSchema = z.object({
  source: z.enum(["agent", "agent_name", "model", "title", "plan", "append"])
}).strict();
const outputPathDetailsSchema = z.object({ source: z.literal("context_dir") }).strict();

function fixedErrorSchema<Code extends keyof typeof HANDOFF_TO_AGENT_ERROR_MESSAGES>(
  code: Code,
  details: z.ZodTypeAny
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(HANDOFF_TO_AGENT_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

export const handoffToAgentErrorSchema = z.discriminatedUnion("code", [
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

export const handoffToAgentOutputShape = {
  codexgpt_tool: z.literal("handoff_to_agent"),
  codexgpt_title: z.literal("Handoff To Agent"),
  ok: z.boolean(),
  data: handoffToAgentDataSchema.nullable(),
  error: handoffToAgentErrorSchema.nullable(),
  meta: toolMetaSchema
};

const handoffToAgentOutputBaseSchema = z.object(handoffToAgentOutputShape).strict();

function handoffToAgentWarnings(data: HandoffToAgentData): string[] {
  return data.append_requested && !data.append_applied
    ? [HANDOFF_TO_AGENT_APPEND_WARNING]
    : [];
}

export const handoffToAgentOutputSchema = handoffToAgentOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful handoff results require data." });
    }
    if (value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful handoff results require error to be null." });
    }
    if (value.data !== null) {
      const warnings = handoffToAgentWarnings(value.data);
      if (
        warnings.length !== value.meta.warnings.length ||
        warnings.some((warning, index) => warning !== value.meta.warnings[index])
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Handoff warnings must exactly match append state." });
      }
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed handoff results require data to be null." });
  }
  if (value.error === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed handoff results require an error." });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Failed handoff results cannot contain warnings." });
  }
});

export type HandoffToAgentData = z.infer<typeof handoffToAgentDataSchema>;
export type HandoffToAgentStructuredResult = z.infer<typeof handoffToAgentOutputBaseSchema>;

export type HandoffToAgentFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { source: "workspace_id"; workspace_id: string } | { source: "default_workspace"; workspace_id: null } }
  | { code: "REQUEST_INVALID"; details: { source: "agent" | "agent_name" | "model" | "title" | "plan" | "append" } }
  | { code: "OUTPUT_PATH_BLOCKED" | "OUTPUT_PATH_OUTSIDE_WORKSPACE" | "OUTPUT_PATH_INVALID"; details: { source: "context_dir" } }
  | { code: "EXISTING_PLAN_TOO_LARGE" | "EXISTING_PLAN_NOT_TEXT" | "EXISTING_PLAN_READ_FAILED" | "PLAN_TOO_LARGE" | "PLAN_SECRET_BLOCKED" | "SCAFFOLD_WRITE_FAILED" | "PLAN_WRITE_FAILED" | "LOG_WRITE_FAILED" | "HANDOFF_WRITE_FAILED" | "INTERNAL_ERROR"; details: Record<string, never> };

export function createHandoffToAgentSuccess(
  data: HandoffToAgentData,
  durationMs = 0
): HandoffToAgentStructuredResult {
  const parsedData = handoffToAgentDataSchema.parse(data);
  return handoffToAgentOutputSchema.parse({
    codexgpt_tool: "handoff_to_agent",
    codexgpt_title: "Handoff To Agent",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, handoffToAgentWarnings(parsedData))
  });
}

export function createHandoffToAgentFailure(
  failure: HandoffToAgentFailureInput,
  durationMs = 0
): HandoffToAgentStructuredResult {
  return handoffToAgentOutputSchema.parse({
    codexgpt_tool: "handoff_to_agent",
    codexgpt_title: "Handoff To Agent",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: HANDOFF_TO_AGENT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

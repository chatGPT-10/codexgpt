import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER = "\n...[diff truncated]" as const;
export const EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER = "\n...[context bundle truncated]" as const;

export const EXPORT_PRO_CONTEXT_UNAVAILABLE_WARNING =
  "Some context sources could not be included safely." as const;
export const EXPORT_PRO_CONTEXT_LIMITED_WARNING =
  "The exported context was limited by configured bounds." as const;
export const EXPORT_PRO_CONTEXT_REDACTED_WARNING =
  "Secret-looking content was redacted from the exported context." as const;

export const EXPORT_PRO_CONTEXT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  REQUEST_INVALID: "The context export request is not valid.",
  SELECTION_PATH_BLOCKED: "An explicitly selected path is blocked by safety rules.",
  SELECTION_PATH_OUTSIDE_WORKSPACE: "An explicitly selected path is outside the permitted workspace boundary.",
  OUTPUT_PATH_BLOCKED: "The configured context output path is blocked by safety rules.",
  OUTPUT_PATH_OUTSIDE_WORKSPACE: "The configured context output path is outside the permitted workspace boundary.",
  CONTEXT_BUILD_FAILED: "The context bundle could not be built safely.",
  CONTEXT_WRITE_FAILED: "The context bundle could not be written safely.",
  CONTEXT_EXPORT_FAILED: "The context export could not be completed safely.",
  INTERNAL_ERROR: "The context export failed because of an internal error."
} as const;

export const EXPORT_PRO_CONTEXT_AI_NAMES = [
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl"
] as const;

export const EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES = [
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

const safeWorkspaceIdSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "Workspace id cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Workspace id must be one line.");

function isSafeRelativePath(value: string): boolean {
  if (value === ".") return true;
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

export const exportProContextPathSchema = z.string().refine(
  isSafeRelativePath,
  "Path must use safe workspace-relative POSIX syntax."
);

export const exportProContextGlobSchema = z.string()
  .min(1)
  .max(240)
  .refine((value) => value.trim() === value, "Glob cannot have surrounding whitespace.")
  .refine((value) => !value.includes("\\") && !value.includes(":"), "Glob must use relative POSIX syntax.")
  .refine((value) => !value.startsWith("/") && !value.startsWith("~"), "Glob must be workspace-relative.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Glob must be one line.")
  .refine((value) => value.split("/").every((segment) => segment !== ".."), "Glob cannot traverse.");

const titleSchema = z.string()
  .min(1)
  .max(200)
  .refine((value) => value.trim() === value, "Title cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Title must be one line.");

export const exportProContextSkippedReasonSchema = z.enum([
  "missing",
  "blocked",
  "not_file",
  "too_large",
  "not_text",
  "read_failed"
]);

export const exportProContextAiUnavailableReasonSchema = z.enum([
  "missing",
  "blocked",
  "too_large",
  "not_text",
  "output_limit",
  "read_failed"
]);

export const exportProContextSkippedSchema = z.object({
  path: exportProContextPathSchema.nullable(),
  reason: exportProContextSkippedReasonSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
}).strict().superRefine((value, context) => {
  if ((value.reason === "too_large" || value.reason === "not_text") && value.bytes === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} sources require observed bytes.`
    });
  }
  if (
    (value.reason === "missing" || value.reason === "blocked" || value.reason === "not_file" || value.reason === "read_failed") &&
    value.bytes !== null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} sources cannot expose bytes.`
    });
  }
});

export const exportProContextAiUnavailableSchema = z.object({
  path: exportProContextPathSchema,
  reason: exportProContextAiUnavailableReasonSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
}).strict().superRefine((value, context) => {
  if ((value.reason === "missing" || value.reason === "blocked") && value.bytes !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} AI sources cannot expose bytes.`
    });
  }
  if ((value.reason === "too_large" || value.reason === "output_limit") && value.bytes === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} AI sources require observed bytes.`
    });
  }
});

function uniquePaths(values: string[]): boolean {
  const normalized = values.map((value) => process.platform === "win32" ? value.toLowerCase() : value);
  return new Set(normalized).size === normalized.length;
}

function orderedSubset(values: string[], expected: string[]): boolean {
  let previous = -1;
  for (const value of values) {
    const index = expected.indexOf(value);
    if (index < 0 || index <= previous) return false;
    previous = index;
  }
  return true;
}

export const exportProContextDataSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1),
  path: exportProContextPathSchema,
  tool_mode: z.enum(["standard", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  bash_mode: z.enum(["off", "safe", "full"]),
  title: titleSchema,
  include_important_files: z.boolean(),
  include_changed_files: z.boolean(),
  include_diff: z.boolean(),
  include_ai_bridge: z.boolean(),
  max_depth: z.number().int().min(1).max(6),
  max_files: z.number().int().min(1).max(80),
  max_file_bytes: z.number().int().min(1_000).max(250_000),
  max_diff_bytes: z.number().int().min(1_000).max(2_000_000),
  max_total_bytes: z.number().int().min(1_000).max(2_000_000),
  selected_paths: z.array(exportProContextPathSchema).max(80),
  selected_count: z.number().int().min(0).max(80),
  extra_globs: z.array(exportProContextGlobSchema).max(32),
  extra_glob_count: z.number().int().min(0).max(32),
  changed_file_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  candidate_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  omitted_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  files_included: z.array(exportProContextPathSchema).max(80),
  file_count: z.number().int().min(0).max(80),
  files_skipped: z.array(exportProContextSkippedSchema).max(80),
  skipped_count: z.number().int().min(0).max(80),
  ai_context_files: z.array(exportProContextPathSchema).max(EXPORT_PRO_CONTEXT_AI_NAMES.length),
  ai_context_file_count: z.number().int().min(0).max(EXPORT_PRO_CONTEXT_AI_NAMES.length),
  ai_context_unavailable: z.array(exportProContextAiUnavailableSchema).max(EXPORT_PRO_CONTEXT_AI_NAMES.length),
  ai_context_unavailable_count: z.number().int().min(0).max(EXPORT_PRO_CONTEXT_AI_NAMES.length),
  created_context_files: z.array(exportProContextPathSchema).max(EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES.length),
  created_context_file_count: z.number().int().min(0).max(EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES.length),
  existed: z.boolean(),
  source_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  bytes: z.number().int().min(0).max(2_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  diff_truncated: z.boolean(),
  bundle_truncated: z.boolean(),
  truncated: z.boolean(),
  output_limited: z.boolean(),
  redacted: z.boolean()
}).strict().superRefine((value, context) => {
  if (!value.path.endsWith("/pro-context.md")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["path"], message: "Output path must be the configured pro-context artifact." });
    return;
  }
  const contextDir = value.path.slice(0, -"/pro-context.md".length);
  if (!isSafeRelativePath(contextDir) || contextDir === ".") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["path"], message: "Output path requires one safe context directory." });
  }

  if (value.selected_count !== value.selected_paths.length || !uniquePaths(value.selected_paths)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selected_count"], message: "Selected count and path identities must be exact." });
  }
  if (value.extra_glob_count !== value.extra_globs.length || !uniquePaths(value.extra_globs)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["extra_glob_count"], message: "Glob count and identities must be exact." });
  }

  const attempted = Math.min(value.candidate_count, value.max_files);
  if (
    value.omitted_count !== value.candidate_count - attempted ||
    value.file_count !== value.files_included.length ||
    value.skipped_count !== value.files_skipped.length ||
    value.file_count + value.skipped_count !== attempted
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidate_count"], message: "Candidate, attempted, omitted, included, and skipped counts must agree." });
  }
  const skippedPaths = value.files_skipped.flatMap((item) => item.path === null ? [] : [item.path]);
  if (!uniquePaths(value.files_included) || !uniquePaths(skippedPaths) || !uniquePaths([...value.files_included, ...skippedPaths])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["files_included"], message: "Included and safely identified skipped paths must be unique and disjoint." });
  }
  for (const [index, skipped] of value.files_skipped.entries()) {
    if (skipped.reason === "too_large" && skipped.bytes !== null && skipped.bytes <= value.max_file_bytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["files_skipped", index, "bytes"], message: "too_large bytes must exceed max_file_bytes." });
    }
  }

  if (
    value.ai_context_file_count !== value.ai_context_files.length ||
    value.ai_context_unavailable_count !== value.ai_context_unavailable.length ||
    value.created_context_file_count !== value.created_context_files.length
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_file_count"], message: "AI and created context counts must match their arrays." });
  }

  const expectedAiPaths = EXPORT_PRO_CONTEXT_AI_NAMES.map((name) => `${contextDir}/${name}`);
  const expectedScaffoldPaths = EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES.map((name) => `${contextDir}/${name}`);
  const unavailablePaths = value.ai_context_unavailable.map((item) => item.path);
  if (!value.include_ai_bridge) {
    if (
      value.ai_context_files.length !== 0 ||
      value.ai_context_unavailable.length !== 0 ||
      value.created_context_files.length !== 0
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["include_ai_bridge"], message: "Excluded AI context requires exact empty arrays." });
    }
  } else {
    const covered = [...value.ai_context_files, ...unavailablePaths];
    if (
      covered.length !== expectedAiPaths.length ||
      !uniquePaths(covered) ||
      expectedAiPaths.some((expected) => !covered.includes(expected)) ||
      !orderedSubset(value.ai_context_files, expectedAiPaths) ||
      !orderedSubset(unavailablePaths, expectedAiPaths)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_files"], message: "AI context must cover the fixed allowlist exactly once in order." });
    }
    if (!uniquePaths(value.created_context_files) || !orderedSubset(value.created_context_files, expectedScaffoldPaths)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["created_context_files"], message: "Created context files must be an ordered fixed-scaffold subset." });
    }
  }

  if (value.bytes > value.max_total_bytes || value.source_bytes < value.bytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bytes"], message: "Final bytes must fit max_total_bytes and cannot exceed source bytes." });
  }
  if (value.bundle_truncated !== (value.source_bytes > value.bytes)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bundle_truncated"], message: "Bundle truncation must exactly match source and final bytes." });
  }
  if (!value.include_diff && value.diff_truncated) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff_truncated"], message: "An excluded diff cannot be truncated." });
  }
  if (value.truncated !== (value.diff_truncated || value.bundle_truncated)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["truncated"], message: "Aggregate truncation must match diff or bundle truncation." });
  }
  const expectedLimited =
    value.truncated ||
    value.omitted_count > 0 ||
    value.files_skipped.some((item) => item.reason === "too_large") ||
    value.ai_context_unavailable.some((item) => item.reason === "too_large" || item.reason === "output_limit");
  if (value.output_limited !== expectedLimited) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["output_limited"], message: "output_limited must match every configured limit outcome." });
  }
});

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({ source: z.literal("workspace_id"), workspace_id: safeWorkspaceIdSchema }).strict(),
  z.object({ source: z.literal("default_workspace"), workspace_id: z.null() }).strict()
]);
const requestInvalidDetailsSchema = z.object({
  source: z.enum(["title", "selected_paths", "extra_globs"])
}).strict();
const selectedPathDetailsSchema = z.object({ source: z.literal("selected_paths") }).strict();
const outputPathDetailsSchema = z.object({ source: z.literal("context_dir") }).strict();

function fixedErrorSchema<Code extends keyof typeof EXPORT_PRO_CONTEXT_ERROR_MESSAGES>(
  code: Code,
  details: z.ZodTypeAny
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(EXPORT_PRO_CONTEXT_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

export const exportProContextErrorSchema = z.discriminatedUnion("code", [
  fixedErrorSchema("WORKSPACE_NOT_FOUND", workspaceNotFoundDetailsSchema),
  fixedErrorSchema("REQUEST_INVALID", requestInvalidDetailsSchema),
  fixedErrorSchema("SELECTION_PATH_BLOCKED", selectedPathDetailsSchema),
  fixedErrorSchema("SELECTION_PATH_OUTSIDE_WORKSPACE", selectedPathDetailsSchema),
  fixedErrorSchema("OUTPUT_PATH_BLOCKED", outputPathDetailsSchema),
  fixedErrorSchema("OUTPUT_PATH_OUTSIDE_WORKSPACE", outputPathDetailsSchema),
  fixedErrorSchema("CONTEXT_BUILD_FAILED", emptyDetailsSchema),
  fixedErrorSchema("CONTEXT_WRITE_FAILED", emptyDetailsSchema),
  fixedErrorSchema("CONTEXT_EXPORT_FAILED", emptyDetailsSchema),
  fixedErrorSchema("INTERNAL_ERROR", emptyDetailsSchema)
]);

export const exportProContextOutputShape = {
  codexgpt_tool: z.literal("export_pro_context"),
  codexgpt_title: z.literal("Export Pro Context"),
  ok: z.boolean(),
  data: exportProContextDataSchema.nullable(),
  error: exportProContextErrorSchema.nullable(),
  meta: toolMetaSchema
};

const exportProContextOutputBaseSchema = z.object(exportProContextOutputShape).strict();

function exportProContextWarnings(data: ExportProContextData): string[] {
  const warnings: string[] = [];
  if (data.files_skipped.length > 0 || data.ai_context_unavailable.length > 0) {
    warnings.push(EXPORT_PRO_CONTEXT_UNAVAILABLE_WARNING);
  }
  if (data.output_limited) warnings.push(EXPORT_PRO_CONTEXT_LIMITED_WARNING);
  if (data.redacted) warnings.push(EXPORT_PRO_CONTEXT_REDACTED_WARNING);
  return warnings;
}

export const exportProContextOutputSchema = exportProContextOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful export results require data." });
    }
    if (value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful export results require error to be null." });
    }
    if (value.data !== null) {
      const warnings = exportProContextWarnings(value.data);
      if (
        warnings.length !== value.meta.warnings.length ||
        warnings.some((warning, index) => warning !== value.meta.warnings[index])
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Export warnings must exactly match result state." });
      }
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed export results require data to be null." });
  }
  if (value.error === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed export results require an error." });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Failed export results cannot contain warnings." });
  }
});

export type ExportProContextSkipped = z.infer<typeof exportProContextSkippedSchema>;
export type ExportProContextAiUnavailable = z.infer<typeof exportProContextAiUnavailableSchema>;
export type ExportProContextData = z.infer<typeof exportProContextDataSchema>;
export type ExportProContextStructuredResult = z.infer<typeof exportProContextOutputBaseSchema>;

export type ExportProContextFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { source: "workspace_id"; workspace_id: string } | { source: "default_workspace"; workspace_id: null } }
  | { code: "REQUEST_INVALID"; details: { source: "title" | "selected_paths" | "extra_globs" } }
  | { code: "SELECTION_PATH_BLOCKED" | "SELECTION_PATH_OUTSIDE_WORKSPACE"; details: { source: "selected_paths" } }
  | { code: "OUTPUT_PATH_BLOCKED" | "OUTPUT_PATH_OUTSIDE_WORKSPACE"; details: { source: "context_dir" } }
  | { code: "CONTEXT_BUILD_FAILED" | "CONTEXT_WRITE_FAILED" | "CONTEXT_EXPORT_FAILED" | "INTERNAL_ERROR"; details: Record<string, never> };

export function createExportProContextSuccess(
  data: ExportProContextData,
  durationMs = 0
): ExportProContextStructuredResult {
  const parsedData = exportProContextDataSchema.parse(data);
  return exportProContextOutputSchema.parse({
    codexgpt_tool: "export_pro_context",
    codexgpt_title: "Export Pro Context",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, exportProContextWarnings(parsedData))
  });
}

export function createExportProContextFailure(
  failure: ExportProContextFailureInput,
  durationMs = 0
): ExportProContextStructuredResult {
  return exportProContextOutputSchema.parse({
    codexgpt_tool: "export_pro_context",
    codexgpt_title: "Export Pro Context",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: EXPORT_PRO_CONTEXT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

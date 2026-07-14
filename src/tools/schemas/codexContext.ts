import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const CODEX_CONTEXT_UNAVAILABLE_WARNING =
  "Some Codex context sources could not be read safely." as const;
export const CODEX_CONTEXT_LIMITED_WARNING =
  "Codex context output was limited by the configured byte bounds." as const;
export const CODEX_CONTEXT_REDACTED_WARNING =
  "Secret-looking content was redacted from the returned Codex context." as const;
export const CODEX_CONTEXT_TRUNCATION_MARKER = "\n...[context truncated]" as const;

export const CODEX_CONTEXT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  TARGET_PATH_BLOCKED: "The requested target path is blocked by workspace policy.",
  TARGET_PATH_OUTSIDE_WORKSPACE: "The requested target path is outside the authorized workspace.",
  TARGET_PATH_INVALID: "The requested target path is not a valid file, directory, or future workspace path.",
  CONTEXT_READ_FAILED: "The Codex context could not be read safely.",
  INTERNAL_ERROR: "The Codex context reader failed because of an internal error."
} as const;

export const CODEX_CONTEXT_AI_NAMES = [
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl"
] as const;

const agentNames = ["AGENTS.override.md", "AGENTS.md", "agents.md", ".agents.md"] as const;
const unavailableReasonSchema = z.enum([
  "missing",
  "blocked",
  "too_large",
  "not_text",
  "output_limit",
  "read_failed"
]);

const safeWorkspaceIdSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "Workspace id cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Workspace id must be one line.");

function isSafeRelativePath(value: string, allowRoot = false): boolean {
  if (allowRoot && value === ".") return true;
  if (value.length === 0 || value.length > 1024 || value.trim() !== value) return false;
  if (value.includes("\\") || value.includes(":") || value.startsWith("/") || value.endsWith("/")) return false;
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.endsWith(".") &&
    !segment.endsWith(" ")
  );
}

export const codexContextTargetPathSchema = z.string().refine(
  (value) => isSafeRelativePath(value, true),
  "Target path must be canonical workspace-relative POSIX syntax."
);

export const codexContextSourcePathSchema = z.string().refine(
  (value) => isSafeRelativePath(value),
  "Source path must be safe workspace-relative POSIX syntax."
);

function normalizedSegments(value: string): string[] {
  return value.split("/").map((segment) => segment.toLowerCase());
}

function agentPathOrder(pathValue: string): { dirs: string[]; rank: number } | null {
  const segments = pathValue.split("/");
  const basename = segments.at(-1)?.toLowerCase();
  const rank = agentNames.findIndex((name) => name.toLowerCase() === basename);
  if (rank < 0) return null;
  return { dirs: segments.slice(0, -1).map((segment) => segment.toLowerCase()), rank };
}

function isOrderedAgentPaths(values: string[]): boolean {
  let previous: { dirs: string[]; rank: number } | null = null;
  for (const value of values) {
    const current = agentPathOrder(value);
    if (!current) return false;
    if (previous) {
      const sameDir = current.dirs.length === previous.dirs.length &&
        current.dirs.every((segment, index) => segment === previous?.dirs[index]);
      if (sameDir && current.rank <= previous.rank) return false;
      if (!sameDir) {
        if (current.dirs.length <= previous.dirs.length) return false;
        if (!previous.dirs.every((segment, index) => current.dirs[index] === segment)) return false;
      }
    }
    previous = current;
  }
  return true;
}

function uniquePaths(values: string[]): boolean {
  const keys = values.map((value) => normalizedSegments(value).join("/"));
  return new Set(keys).size === keys.length;
}

export function codexContextPreview(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n").slice(0, 40).join("\n");
  return lines.length > 12_000 ? `${lines.slice(0, 12_000)}\n...[preview truncated]` : lines;
}

export const codexContextUnavailableSchema = z.object({
  source: z.enum(["agents", "ai_bridge"]),
  path: codexContextSourcePathSchema,
  reason: unavailableReasonSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
}).strict().superRefine((value, context) => {
  if ((value.reason === "missing" || value.reason === "blocked") && value.bytes !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} sources cannot expose a byte count.`
    });
  }
  if ((value.reason === "too_large" || value.reason === "output_limit") && value.bytes === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} sources require an observed byte count.`
    });
  }
});

export const codexContextDataSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1),
  target_path: codexContextTargetPathSchema,
  target_kind: z.enum(["file", "directory", "missing"]),
  tool_mode: z.literal("full"),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  bash_mode: z.enum(["off", "safe", "full"]),
  include_ai_bridge: z.boolean(),
  include_git_status: z.boolean(),
  include_git_diff: z.boolean(),
  max_agent_bytes: z.number().int().min(1).max(200_000),
  max_total_bytes: z.number().int().min(1).max(2_000_000),
  agents_files: z.array(codexContextSourcePathSchema).max(256),
  agents_count: z.number().int().min(0).max(256),
  ai_context_exists: z.boolean().nullable(),
  ai_context_files: z.array(codexContextSourcePathSchema).max(CODEX_CONTEXT_AI_NAMES.length),
  ai_context_count: z.number().int().min(0).max(CODEX_CONTEXT_AI_NAMES.length),
  unavailable_sources: z.array(codexContextUnavailableSchema).max(263),
  unavailable_count: z.number().int().min(0).max(263),
  included_git_status: z.boolean(),
  included_git_diff: z.boolean(),
  context: z.string().max(2_000_000),
  context_source_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  context_bytes: z.number().int().min(0).max(2_000_000),
  preview: z.string().max(12_024),
  truncated: z.boolean(),
  output_limited: z.boolean(),
  redacted: z.boolean()
}).strict().superRefine((value, context) => {
  if (!uniquePaths(value.agents_files) || !isOrderedAgentPaths(value.agents_files)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["agents_files"],
      message: "AGENTS files must be unique and preserve root-to-target candidate order."
    });
  }
  if (value.agents_count !== value.agents_files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["agents_count"], message: "agents_count must match agents_files length." });
  }
  if (!uniquePaths(value.ai_context_files)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_files"], message: "AI context files must be unique." });
  }
  if (value.ai_context_count !== value.ai_context_files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_count"], message: "ai_context_count must match ai_context_files length." });
  }
  if (value.unavailable_count !== value.unavailable_sources.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable_count"], message: "unavailable_count must match unavailable_sources length." });
  }

  const unavailablePaths = value.unavailable_sources.map((item) => item.path);
  if (!uniquePaths([...value.agents_files, ...value.ai_context_files, ...unavailablePaths])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable_sources"], message: "Loaded and unavailable source paths cannot overlap or repeat." });
  }
  const unavailableAgents = value.unavailable_sources.filter((item) => item.source === "agents");
  if (!isOrderedAgentPaths(unavailableAgents.map((item) => item.path))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable_sources"], message: "Unavailable AGENTS files must preserve root-to-target candidate order." });
  }

  const aiIndexes = new Map<string, number>(CODEX_CONTEXT_AI_NAMES.map((item, index) => [item, index]));
  const aiUnavailable = value.unavailable_sources.filter((item) => item.source === "ai_bridge");
  const aiIdentity = (sourcePath: string): { contextDir: string; name: string; index: number } | null => {
    const segments = sourcePath.split("/");
    const name = segments.pop();
    const index = name === undefined ? undefined : aiIndexes.get(name);
    if (name === undefined || index === undefined || segments.length === 0) return null;
    return { contextDir: segments.join("/"), name, index };
  };
  const orderedAi = (paths: string[]) => paths.every((item, index) => {
    const current = aiIdentity(item)?.index;
    if (current === undefined) return false;
    if (index === 0) return true;
    const previous = aiIdentity(paths[index - 1])?.index;
    return previous !== undefined && current > previous;
  });
  if (!orderedAi(value.ai_context_files) || !orderedAi(aiUnavailable.map((item) => item.path))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_files"], message: "AI context paths must preserve the fixed allowlist order." });
  }
  const aiCoveredPaths = [...value.ai_context_files, ...aiUnavailable.map((item) => item.path)];
  const aiIdentities = aiCoveredPaths.map(aiIdentity);
  const aiContextDirs = new Set(aiIdentities.filter((item) => item !== null).map((item) => item.contextDir));
  if (aiIdentities.some((item) => item === null) || aiContextDirs.size > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_files"], message: "AI context paths must use one safe context directory and the fixed filenames." });
  }

  if (!value.include_ai_bridge) {
    if (value.ai_context_exists !== null || value.ai_context_files.length !== 0 || aiUnavailable.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["include_ai_bridge"], message: "Excluded AI context requires exact null and empty semantics." });
    }
  } else if (value.ai_context_exists === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_exists"], message: "Included AI context requires an existence value." });
  } else if (!value.ai_context_exists) {
    if (value.ai_context_files.length !== 0 || aiUnavailable.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_exists"], message: "Absent AI context requires empty source coverage." });
    }
  } else {
    const coveredNames = aiIdentities.filter((item) => item !== null).map((item) => item.name);
    if (
      coveredNames.length !== CODEX_CONTEXT_AI_NAMES.length ||
      new Set(coveredNames).size !== CODEX_CONTEXT_AI_NAMES.length ||
      CODEX_CONTEXT_AI_NAMES.some((item) => !coveredNames.includes(item))
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai_context_files"], message: "Existing AI context must cover every fixed allowlist path exactly once." });
    }
  }

  if (value.included_git_status !== value.include_git_status) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["included_git_status"], message: "Git status inclusion must match the request." });
  }
  if (value.included_git_diff !== value.include_git_diff) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["included_git_diff"], message: "Git diff inclusion must match the request." });
  }

  const actualBytes = Buffer.byteLength(value.context, "utf8");
  if (value.context_bytes !== actualBytes || value.context_bytes > value.max_total_bytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["context_bytes"], message: "context_bytes must match returned UTF-8 text within max_total_bytes." });
  }
  if (value.context_source_bytes < value.context_bytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["context_source_bytes"], message: "Source bytes cannot be smaller than returned context bytes." });
  }
  if (value.truncated !== (value.context_source_bytes > value.context_bytes)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["truncated"], message: "truncated must exactly match source and returned byte counts." });
  }
  if (value.truncated && !value.context.endsWith(CODEX_CONTEXT_TRUNCATION_MARKER)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["context"], message: "Truncated context must end with the fixed marker." });
  }
  if (value.preview !== codexContextPreview(value.context)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preview"], message: "preview must be the exact bounded context preview." });
  }
  const limitedBySource = value.unavailable_sources.some((item) => item.reason === "too_large" || item.reason === "output_limit");
  if (value.output_limited !== (value.truncated || limitedBySource)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["output_limited"], message: "output_limited must exactly match truncation or bounded unavailable sources." });
  }
});

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({ source: z.literal("workspace_id"), workspace_id: safeWorkspaceIdSchema }).strict(),
  z.object({ source: z.literal("default_workspace"), workspace_id: z.null() }).strict()
]);
const targetDetailsSchema = z.object({ source: z.literal("target_path") }).strict();
const contextReadFailedDetailsSchema = z.object({ target_path: codexContextTargetPathSchema }).strict();

function fixedErrorSchema<Code extends keyof typeof CODEX_CONTEXT_ERROR_MESSAGES>(
  code: Code,
  details: z.ZodTypeAny
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(CODEX_CONTEXT_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

export const codexContextErrorSchema = z.discriminatedUnion("code", [
  fixedErrorSchema("WORKSPACE_NOT_FOUND", workspaceNotFoundDetailsSchema),
  fixedErrorSchema("TARGET_PATH_BLOCKED", targetDetailsSchema),
  fixedErrorSchema("TARGET_PATH_OUTSIDE_WORKSPACE", targetDetailsSchema),
  fixedErrorSchema("TARGET_PATH_INVALID", targetDetailsSchema),
  fixedErrorSchema("CONTEXT_READ_FAILED", contextReadFailedDetailsSchema),
  fixedErrorSchema("INTERNAL_ERROR", emptyDetailsSchema)
]);

export const codexContextOutputShape = {
  codexpro_tool: z.literal("codex_context"),
  codexpro_title: z.literal("Codex Context"),
  ok: z.boolean(),
  data: codexContextDataSchema.nullable(),
  error: codexContextErrorSchema.nullable(),
  meta: toolMetaSchema
};

const codexContextOutputBaseSchema = z.object(codexContextOutputShape).strict();

function codexContextWarnings(data: CodexContextData): string[] {
  const warnings: string[] = [];
  if (data.unavailable_sources.some((item) =>
    item.reason === "blocked" || item.reason === "not_text" || item.reason === "read_failed"
  )) warnings.push(CODEX_CONTEXT_UNAVAILABLE_WARNING);
  if (data.output_limited) warnings.push(CODEX_CONTEXT_LIMITED_WARNING);
  if (data.redacted) warnings.push(CODEX_CONTEXT_REDACTED_WARNING);
  return warnings;
}

export const codexContextOutputSchema = codexContextOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful codex_context results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful codex_context results require error to be null." });
    if (value.data !== null) {
      const warnings = codexContextWarnings(value.data);
      if (warnings.length !== value.meta.warnings.length || warnings.some((warning, index) => warning !== value.meta.warnings[index])) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "codex_context warnings must exactly match unavailable, limit, and redaction state." });
      }
    }
    return;
  }
  if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed codex_context results require data to be null." });
  if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed codex_context results require an error object." });
  if (value.meta.warnings.length !== 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Failed codex_context results cannot include warnings." });
});

export type CodexContextUnavailable = z.infer<typeof codexContextUnavailableSchema>;
export type CodexContextData = z.infer<typeof codexContextDataSchema>;
export type CodexContextStructuredResult = z.infer<typeof codexContextOutputBaseSchema>;
export type CodexContextFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { source: "workspace_id"; workspace_id: string } | { source: "default_workspace"; workspace_id: null } }
  | { code: "TARGET_PATH_BLOCKED" | "TARGET_PATH_OUTSIDE_WORKSPACE" | "TARGET_PATH_INVALID"; details: { source: "target_path" } }
  | { code: "CONTEXT_READ_FAILED"; details: { target_path: string } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createCodexContextSuccess(
  data: CodexContextData,
  durationMs = 0
): CodexContextStructuredResult {
  const parsedData = codexContextDataSchema.parse(data);
  return codexContextOutputSchema.parse({
    codexpro_tool: "codex_context",
    codexpro_title: "Codex Context",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, codexContextWarnings(parsedData))
  });
}

export function createCodexContextFailure(
  failure: CodexContextFailureInput,
  durationMs = 0
): CodexContextStructuredResult {
  return codexContextOutputSchema.parse({
    codexpro_tool: "codex_context",
    codexpro_title: "Codex Context",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEX_CONTEXT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

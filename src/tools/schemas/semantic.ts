import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

const publicPositionLocatorSchema = z.object({
  kind: z.literal("position"),
  path: z.string().min(1).max(240),
  line: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  column: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
}).strict();

const publicSymbolLocatorSchema = z.object({
  kind: z.literal("symbol"),
  symbol: z.string().trim().min(1).max(200),
  path_hint: z.string().min(1).max(240).optional()
}).strict();

export const semanticLocatorSchema = z.discriminatedUnion("kind", [
  publicPositionLocatorSchema,
  publicSymbolLocatorSchema
]);

const commonWorkspace = {
  workspace_id: z.string().min(1).max(160).optional()
};

const definitionSchema = z.object({
  operation: z.literal("definition"),
  locator: semanticLocatorSchema,
  max_results: z.number().int().min(1).max(200).optional(),
  ...commonWorkspace
}).strict();

const referencesSchema = z.object({
  operation: z.literal("references"),
  locator: semanticLocatorSchema,
  include_declaration: z.boolean().optional(),
  max_results: z.number().int().min(1).max(200).optional(),
  ...commonWorkspace
}).strict();

const diagnosticsSchema = z.object({
  operation: z.literal("diagnostics"),
  path: z.string().min(1).max(240),
  severity: z.enum(["error", "warning", "information", "hint"]).optional(),
  max_results: z.number().int().min(1).max(200).optional(),
  ...commonWorkspace
}).strict();

const safeIdentifierSchema = z.string().trim().min(1).max(128)
  .regex(/^[\p{L}_$][\p{L}\p{N}_$]*$/u, "new_name must be a safe identifier.");

const renamePreviewSchema = z.object({
  operation: z.literal("rename_preview"),
  locator: semanticLocatorSchema,
  new_name: safeIdentifierSchema,
  max_preview_chars: z.number().int().min(1_000).max(100_000).optional(),
  ...commonWorkspace
}).strict();

export const semanticInputSchema = z.discriminatedUnion("operation", [
  definitionSchema,
  referencesSchema,
  diagnosticsSchema,
  renamePreviewSchema
]);

const semanticLocatorDescriptorSchema = z.object({
  kind: z.enum(["position", "symbol"]),
  path: z.string().min(1).max(240).optional(),
  line: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  column: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  symbol: z.string().trim().min(1).max(200).optional(),
  path_hint: z.string().min(1).max(240).optional()
}).strict();

// McpServer.registerTool expects a raw Zod shape at the descriptor boundary.
// The live ChatGPT connector rejected the prior descriptor containing nested
// unions and a Unicode-regex pattern, so this wire shape is deliberately flat
// and permissive. Exact operation/locator combinations and identifier grammar
// remain enforced by semanticInputSchema before dispatch.
export const semanticInputDescriptorShape = {
  operation: z.enum(["definition", "references", "diagnostics", "rename_preview"]),
  locator: semanticLocatorDescriptorSchema.optional(),
  path: z.string().min(1).max(240).optional(),
  severity: z.enum(["error", "warning", "information", "hint"]).optional(),
  include_declaration: z.boolean().optional(),
  max_results: z.number().int().min(1).max(200).optional(),
  new_name: z.string().trim().min(1).max(128).optional(),
  max_preview_chars: z.number().int().min(1_000).max(100_000).optional(),
  workspace_id: commonWorkspace.workspace_id
};

const positionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive()
}).strict();

const rangeSchema = z.object({
  start: positionSchema,
  end: positionSchema
}).strict();

const locationSchema = z.object({
  path: z.string().min(1).max(240),
  range: rangeSchema,
  preview: z.string().max(400),
  declaration: z.boolean().optional()
}).strict();

const diagnosticSchema = z.object({
  path: z.string().min(1).max(240),
  range: rangeSchema,
  severity: z.enum(["error", "warning", "information", "hint"]),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(1_000)
}).strict();

const renameFileSchema = z.object({
  path: z.string().min(1).max(240),
  edit_count: z.number().int().positive()
}).strict();

const renamePreviewResultSchema = z.object({
  preview_id: z.string().min(20).max(200),
  expires_in_seconds: z.number().int().positive(),
  old_name: z.string().min(1).max(200),
  new_name: z.string().min(1).max(128),
  manifest_digest: z.string().regex(/^[a-f0-9]{64}$/),
  affected_file_count: z.number().int().positive(),
  edit_count: z.number().int().positive(),
  files: z.array(renameFileSchema).min(1).max(1_000),
  diff_preview: z.string(),
  preview_truncated: z.boolean(),
  omitted_preview_chars: z.number().int().nonnegative()
}).strict();

const resultSchema = z.union([
  z.object({ locations: z.array(locationSchema).max(200) }).strict(),
  z.object({ diagnostics: z.array(diagnosticSchema).max(200) }).strict(),
  z.object({
    candidates: z.array(locationSchema).max(50),
    needs_disambiguation: z.literal(true)
  }).strict(),
  renamePreviewResultSchema
]);

export const semanticDataSchema = z.object({
  requested_provider: z.enum(["builtin", "none"]),
  actual_provider: z.enum(["builtin-typescript", "builtin-lexical", "none"]),
  state: z.enum(["ready", "fallback", "unsupported", "cooldown", "unavailable"]),
  capability: z.enum(["definition", "references", "diagnostics", "rename_preview"]),
  language: z.string().min(1).max(80),
  partial: z.boolean(),
  omitted_count: z.number().int().nonnegative(),
  returned_count: z.number().int().nonnegative(),
  result_quality: z.enum(["semantic", "lexical"]),
  next_action: z.string().min(1).max(240),
  reason_code: z.string().min(1).max(80).optional(),
  retry_after_ms: z.number().int().positive().optional(),
  result: resultSchema
}).strict();

const semanticErrorSchema = z.object({
  code: z.enum([
    "WORKSPACE_NOT_FOUND",
    "INVALID_ARGUMENT",
    "UNSUPPORTED",
    "UNAVAILABLE",
    "NEEDS_DISAMBIGUATION",
    "SOURCE_CHANGED",
    "TOO_LARGE",
    "INTERNAL_ERROR"
  ]),
  message: z.string().min(1).max(400),
  retryable: z.boolean(),
  details: z.record(z.union([z.string(), z.number(), z.boolean()]))
}).strict();

export const semanticOutputShape = {
  codexgpt_tool: z.literal("semantic"),
  codexgpt_title: z.literal("Semantic Code"),
  ok: z.boolean(),
  data: semanticDataSchema.nullable(),
  error: semanticErrorSchema.nullable(),
  meta: toolMetaSchema
};

export const semanticOutputSchema = z.object(semanticOutputShape).strict().superRefine((value, context) => {
  if (value.ok && value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Semantic success requires data." });
  if (value.ok && value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Semantic success cannot include error." });
  if (!value.ok && value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Semantic failure cannot include data." });
  if (!value.ok && value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Semantic failure requires error." });
});

export function createSemanticSuccess(data: z.infer<typeof semanticDataSchema>, durationMs = 0) {
  return semanticOutputSchema.parse({
    codexgpt_tool: "semantic",
    codexgpt_title: "Semantic Code",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createSemanticFailure(
  input: z.infer<typeof semanticErrorSchema>,
  durationMs = 0
) {
  return semanticOutputSchema.parse({
    codexgpt_tool: "semantic",
    codexgpt_title: "Semantic Code",
    ok: false,
    data: null,
    error: input,
    meta: createToolMeta(durationMs)
  });
}

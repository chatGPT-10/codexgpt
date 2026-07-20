import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING =
  "Structured output was limited. Use path or max_* arguments to request a narrower or larger result." as const;

export const INSPECT_WORKSPACE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested analysis path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested analysis path is blocked by safety rules.",
  ANALYSIS_FAILED: "The workspace analysis could not be completed.",
  INTERNAL_ERROR: "The workspace analysis failed because of an internal error."
} as const;

export const inspectAnalysisLanguageSchema = z.enum([
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "swift",
  "java",
  "csharp",
  "c",
  "cpp",
  "json",
  "yaml",
  "toml",
  "markdown",
  "shell",
  "unknown"
]);

export const inspectFileRoleSchema = z.enum([
  "source",
  "test",
  "config",
  "docs",
  "generated",
  "infrastructure",
  "other"
]);

export const inspectSymbolKindSchema = z.enum([
  "function",
  "class",
  "interface",
  "enum",
  "struct",
  "trait",
  "protocol",
  "type",
  "variable"
]);

export const inspectRelationshipKindSchema = z.enum([
  "imports",
  "references",
  "tests",
  "package"
]);

export const inspectConfidenceSchema = z.enum(["exact", "strong", "inferred"]);

function isKnownProviderWarning(value: string): boolean {
  return value === "Source analysis reached its file or byte limit." ||
    value === "Symbol extraction reached its configured limit." ||
    /^Inventory truncated at [1-9]\d* files\.$/.test(value) ||
    /^Skipped [1-9]\d* source file(?:s)? that changed or became unreadable during analysis\.$/.test(value);
}

export const inspectWorkspaceProviderWarningSchema = z.string()
  .max(240)
  .refine(isKnownProviderWarning, "Unknown workspace analysis warning.");

export const inspectInventoryFileSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  modifiedMs: z.number().finite().nonnegative(),
  language: inspectAnalysisLanguageSchema,
  role: inspectFileRoleSchema,
  generated: z.boolean(),
  entrypoint: z.boolean()
}).strict();

export const inspectAreaSchema = z.object({
  path: z.string().min(1),
  role: inspectFileRoleSchema,
  files: z.number().int().positive()
}).strict();

export const inspectSymbolSchema = z.object({
  name: z.string().min(1).max(240),
  kind: inspectSymbolKindSchema,
  path: z.string().min(1),
  line: z.number().int().positive(),
  exported: z.boolean(),
  confidence: inspectConfidenceSchema
}).strict();

export const inspectRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: inspectRelationshipKindSchema,
  confidence: inspectConfidenceSchema,
  source: z.string().min(1).max(160).refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Relationship source must be one bounded line."
  )
}).strict();

export const inspectCoverageSchema = z.object({
  inventoryFiles: z.number().int().nonnegative(),
  analyzedFiles: z.number().int().nonnegative(),
  scannedBytes: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(inspectWorkspaceProviderWarningSchema)
}).strict();

export const inspectCacheSchema = z.object({
  hit: z.boolean(),
  key: z.string().min(1).max(2_000)
}).strict();

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function duplicateIndexes(values: readonly string[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) duplicates.push(index);
    seen.add(value);
  });
  return duplicates;
}

export const inspectWorkspaceProviderSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  languages: z.array(inspectAnalysisLanguageSchema),
  projectTypes: z.array(z.string().min(1).max(64)),
  entrypoints: z.array(z.string().min(1)),
  importantFiles: z.array(z.string().min(1)),
  areas: z.array(inspectAreaSchema),
  files: z.array(inspectInventoryFileSchema),
  symbols: z.array(inspectSymbolSchema),
  relationships: z.array(inspectRelationshipSchema),
  coverage: inspectCoverageSchema,
  warnings: z.array(inspectWorkspaceProviderWarningSchema),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  cache: inspectCacheSchema
}).strict().superRefine((value, context) => {
  duplicateIndexes(value.languages).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["languages", index],
    message: "Languages must be unique."
  }));
  duplicateIndexes(value.projectTypes).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["projectTypes", index],
    message: "Project types must be unique."
  }));
  duplicateIndexes(value.files.map((file) => file.path)).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["files", index, "path"],
    message: "Inventory paths must be unique."
  }));
  duplicateIndexes(value.areas.map((area) => area.path)).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["areas", index, "path"],
    message: "Area paths must be unique."
  }));
  if (value.coverage.analyzedFiles > value.coverage.inventoryFiles) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "analyzedFiles"],
      message: "analyzedFiles cannot exceed inventoryFiles."
    });
  }
  if (value.coverage.inventoryFiles !== value.files.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "inventoryFiles"],
      message: "inventoryFiles must equal files.length."
    });
  }
  if (value.coverage.symbolCount !== value.symbols.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "symbolCount"],
      message: "symbolCount must equal symbols.length."
    });
  }
  if (value.coverage.relationshipCount !== value.relationships.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "relationshipCount"],
      message: "relationshipCount must equal relationships.length."
    });
  }
  if (!sameStrings(value.coverage.warnings, value.warnings)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "warnings"],
      message: "Coverage warnings must equal provider warnings."
    });
  }
  const areaFiles = value.areas.reduce((total, area) => total + area.files, 0);
  if (areaFiles !== value.coverage.inventoryFiles) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["areas"],
      message: "Area file counts must cover the full inventory."
    });
  }
});

export const inspectReturnedSchema = z.object({
  files: z.number().int().nonnegative(),
  symbols: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative()
}).strict();

const inspectPublicWarningSchema = z.union([
  inspectWorkspaceProviderWarningSchema,
  z.literal(INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING)
]);

export const inspectWorkspaceDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  path: z.string().min(1),
  languages: z.array(inspectAnalysisLanguageSchema),
  project_types: z.array(z.string().min(1).max(64)),
  entrypoints: z.array(z.string().min(1)),
  important_files: z.array(z.string().min(1)),
  areas: z.array(inspectAreaSchema),
  files: z.array(inspectInventoryFileSchema),
  symbols: z.array(inspectSymbolSchema),
  relationships: z.array(inspectRelationshipSchema),
  coverage: inspectCoverageSchema,
  warnings: z.array(inspectPublicWarningSchema),
  output_limited: z.boolean(),
  returned: inspectReturnedSchema,
  cache: inspectCacheSchema
}).strict().superRefine((value, context) => {
  if (value.returned.files !== value.files.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned", "files"],
      message: "Returned file count must equal files.length."
    });
  }
  if (value.returned.symbols !== value.symbols.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned", "symbols"],
      message: "Returned symbol count must equal symbols.length."
    });
  }
  if (value.returned.relationships !== value.relationships.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned", "relationships"],
      message: "Returned relationship count must equal relationships.length."
    });
  }
  const expectedWarnings = value.output_limited
    ? [...value.coverage.warnings, INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING]
    : [...value.coverage.warnings];
  if (!sameStrings(value.warnings, expectedWarnings)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["warnings"],
      message: "Data warnings must equal coverage warnings plus the optional output-limit warning."
    });
  }
});

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const analysisFailedErrorSchema = z.object({
  code: z.literal("ANALYSIS_FAILED"),
  message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES.ANALYSIS_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const inspectWorkspaceErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  analysisFailedErrorSchema,
  internalErrorSchema
]);

export const inspectWorkspaceOutputShape = {
  codexgpt_tool: z.literal("inspect_workspace"),
  codexgpt_title: z.literal("Inspect Workspace"),
  ok: z.boolean(),
  data: inspectWorkspaceDataSchema.nullable(),
  error: inspectWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const inspectWorkspaceOutputBaseSchema = z.object(inspectWorkspaceOutputShape).strict();

export const inspectWorkspaceOutputSchema = inspectWorkspaceOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful inspect_workspace results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful inspect_workspace results require error to be null."
      });
    }
  } else {
    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed inspect_workspace results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed inspect_workspace results require an error object."
      });
    }
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "warnings"],
      message: "inspect_workspace meta warnings must remain empty."
    });
  }
});

export type InspectWorkspaceProviderResult = z.infer<typeof inspectWorkspaceProviderSchema>;
export type InspectWorkspaceData = z.infer<typeof inspectWorkspaceDataSchema>;
export type InspectWorkspaceStructuredResult = z.infer<typeof inspectWorkspaceOutputBaseSchema>;

export type InspectWorkspaceFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "ANALYSIS_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createInspectWorkspaceSuccess(
  data: InspectWorkspaceData,
  durationMs = 0
): InspectWorkspaceStructuredResult {
  return inspectWorkspaceOutputSchema.parse({
    codexgpt_tool: "inspect_workspace",
    codexgpt_title: "Inspect Workspace",
    ok: true,
    data: inspectWorkspaceDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createInspectWorkspaceFailure(
  failure: InspectWorkspaceFailureInput,
  durationMs = 0
): InspectWorkspaceStructuredResult {
  return inspectWorkspaceOutputSchema.parse({
    codexgpt_tool: "inspect_workspace",
    codexgpt_title: "Inspect Workspace",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: INSPECT_WORKSPACE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

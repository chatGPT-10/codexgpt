import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const SEARCH_ANALYSIS_DISABLED_WARNING =
  "Structured search analysis is disabled; lexical search results are complete." as const;

export const SEARCH_ANALYSIS_UNAVAILABLE_WARNING =
  "Structured search analysis was unavailable; lexical search results are complete." as const;

export const SEARCH_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  FILE_NOT_FOUND: "The requested search path does not exist.",
  INVALID_ARGUMENT: "The requested search argument is invalid.",
  SEARCH_BACKEND_UNAVAILABLE: "The requested search requires an unavailable search backend.",
  SEARCH_COMMAND_FAILED: "The search backend could not complete the request.",
  INTERNAL_ERROR: "The workspace search could not be completed because of an internal error."
} as const;

export const searchMatchSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  text: z.string()
}).strict();

const analysisConfidenceSchema = z.enum(["exact", "strong", "inferred"]);
const analysisIntentSchema = z.enum(["text", "symbol", "references", "impact"]);
const analysisGroupSchema = z.enum([
  "definitions",
  "references",
  "tests",
  "configuration",
  "documentation",
  "other"
]);

export const searchAnalysisMatchSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  text: z.string(),
  group: analysisGroupSchema,
  score: z.number().finite(),
  reasons: z.array(z.string()),
  confidence: analysisConfidenceSchema,
  source: z.string()
}).strict();

const searchAnalysisGroupsSchema = z.object({
  definitions: z.array(searchAnalysisMatchSchema),
  references: z.array(searchAnalysisMatchSchema),
  tests: z.array(searchAnalysisMatchSchema),
  configuration: z.array(searchAnalysisMatchSchema),
  documentation: z.array(searchAnalysisMatchSchema),
  other: z.array(searchAnalysisMatchSchema)
}).strict();

const searchAnalysisCoverageSchema = z.object({
  inventoryFiles: z.number().int().nonnegative(),
  analyzedFiles: z.number().int().nonnegative(),
  scannedBytes: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(z.string())
}).strict();

const searchAnalysisCacheSchema = z.object({
  hit: z.boolean(),
  key: z.string()
}).strict();

export const searchAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  query: z.string(),
  intent: analysisIntentSchema,
  groups: searchAnalysisGroupsSchema,
  matches: z.array(searchAnalysisMatchSchema),
  coverage: searchAnalysisCoverageSchema,
  warnings: z.array(z.string()),
  cache: searchAnalysisCacheSchema
}).strict();

export const searchDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  matches: z.array(searchMatchSchema),
  truncated: z.boolean(),
  used: z.enum(["ripgrep", "node"]),
  analysis: searchAnalysisSchema.nullable()
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.enum(["query", "regex", "glob"])
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(SEARCH_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(SEARCH_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(SEARCH_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotFoundErrorSchema = z.object({
  code: z.literal("FILE_NOT_FOUND"),
  message: z.literal(SEARCH_ERROR_MESSAGES.FILE_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const invalidArgumentErrorSchema = z.object({
  code: z.literal("INVALID_ARGUMENT"),
  message: z.literal(SEARCH_ERROR_MESSAGES.INVALID_ARGUMENT),
  retryable: z.literal(false),
  details: invalidArgumentDetailsSchema
}).strict();

const searchBackendUnavailableErrorSchema = z.object({
  code: z.literal("SEARCH_BACKEND_UNAVAILABLE"),
  message: z.literal(SEARCH_ERROR_MESSAGES.SEARCH_BACKEND_UNAVAILABLE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const searchCommandFailedErrorSchema = z.object({
  code: z.literal("SEARCH_COMMAND_FAILED"),
  message: z.literal(SEARCH_ERROR_MESSAGES.SEARCH_COMMAND_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(SEARCH_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const searchErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  fileNotFoundErrorSchema,
  invalidArgumentErrorSchema,
  searchBackendUnavailableErrorSchema,
  searchCommandFailedErrorSchema,
  internalErrorSchema
]);

const searchWarningSchema = z.enum([
  SEARCH_ANALYSIS_DISABLED_WARNING,
  SEARCH_ANALYSIS_UNAVAILABLE_WARNING
]);

const searchMetaSchema = toolMetaSchema.extend({
  warnings: z.array(searchWarningSchema).max(1)
}).strict();

export const searchOutputShape = {
  codexpro_tool: z.literal("search"),
  codexpro_title: z.literal("Search Files"),
  ok: z.boolean(),
  data: searchDataSchema.nullable(),
  error: searchErrorSchema.nullable(),
  meta: searchMetaSchema
};

const searchOutputBaseSchema = z.object(searchOutputShape).strict();

export const searchOutputSchema = searchOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful search results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful search results require error to be null."
      });
    }
    if (value.data?.analysis !== null && value.meta.warnings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meta", "warnings"],
        message: "Successful search analysis cannot include a degradation warning."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed search results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed search results require an error object."
    });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "warnings"],
      message: "Failed search results cannot include analysis warnings."
    });
  }
});

export type SearchAnalysis = z.infer<typeof searchAnalysisSchema>;
export type SearchData = z.infer<typeof searchDataSchema>;
export type SearchStructuredResult = z.infer<typeof searchOutputBaseSchema>;
export type SearchWarning = z.infer<typeof searchWarningSchema>;

export type SearchFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "query" | "regex" | "glob" } }
  | { code: "SEARCH_BACKEND_UNAVAILABLE"; details: Record<string, never> }
  | { code: "SEARCH_COMMAND_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createSearchSuccess(
  data: SearchData,
  durationMs = 0,
  warnings: SearchWarning[] = []
): SearchStructuredResult {
  return searchOutputSchema.parse({
    codexpro_tool: "search",
    codexpro_title: "Search Files",
    ok: true,
    data: searchDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs, warnings)
  });
}

export function createSearchFailure(
  failure: SearchFailureInput,
  durationMs = 0
): SearchStructuredResult {
  return searchOutputSchema.parse({
    codexpro_tool: "search",
    codexpro_title: "Search Files",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: SEARCH_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

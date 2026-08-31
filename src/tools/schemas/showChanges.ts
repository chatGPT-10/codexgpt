import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import { changeWorkflowStateSchema } from "./changeWorkflow.js";

export const SHOW_CHANGES_ANALYSIS_WARNING =
  "Change analysis was unavailable; Git review data is still complete." as const;

export const SHOW_CHANGES_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  GIT_NOT_REPOSITORY: "The workspace is not a Git repository.",
  GIT_UNAVAILABLE: "Git is not available to review this workspace.",
  GIT_COMMAND_FAILED: "Git could not review the workspace changes.",
  INTERNAL_ERROR: "The workspace changes could not be reviewed because of an internal error."
} as const;

const analysisConfidenceSchema = z.enum(["exact", "strong", "inferred"]);

const analysisFileSchema = z.object({
  path: z.string(),
  confidence: analysisConfidenceSchema,
  reasons: z.array(z.string())
}).strict();

const analysisRiskSignalSchema = z.object({
  id: z.enum([
    "public-api",
    "authentication",
    "storage",
    "migration",
    "build",
    "configuration"
  ]),
  label: z.string(),
  confidence: analysisConfidenceSchema,
  paths: z.array(z.string()),
  reasons: z.array(z.string())
}).strict();

const analysisCommandSchema = z.object({
  command: z.string(),
  source: z.string(),
  reasons: z.array(z.string())
}).strict();

const analysisCoverageSchema = z.object({
  inventoryFiles: z.number().int().nonnegative(),
  analyzedFiles: z.number().int().nonnegative(),
  scannedBytes: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(z.string())
}).strict();

const analysisCacheSchema = z.object({
  hit: z.boolean(),
  key: z.string()
}).strict();

export const showChangesAnalysisSchema = z.object({
  schema_version: z.literal(1),
  changed_paths: z.array(z.string()),
  affected_areas: z.array(z.string()),
  dependent_files: z.array(analysisFileSchema),
  related_tests: z.array(analysisFileSchema),
  risk_signals: z.array(analysisRiskSignalSchema),
  recommended_commands: z.array(analysisCommandSchema),
  coverage: analysisCoverageSchema,
  warnings: z.array(z.string()),
  cache: analysisCacheSchema
}).strict();

const showChangesDataBaseSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  path: z.string(),
  status: z.string(),
  changed_files: z.array(z.string()),
  staged: z.boolean(),
  include_diff: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.boolean(),
  diff: z.string(),
  review_since: z.enum(["last_shown", "workspace"]),
  review_marked: z.boolean(),
  review_checkpoint_hit: z.boolean(),
  analysis: showChangesAnalysisSchema.nullable()
}).strict();

export const showChangesDataSchema = showChangesDataBaseSchema.superRefine((value, context) => {
  if (!value.changed && (
    value.changed_files.length !== 0 ||
    value.additions !== 0 ||
    value.deletions !== 0 ||
    value.diff !== ""
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed"],
      message: "Unchanged reviews require no changed files, zero stats, and an empty diff."
    });
  }

  if (value.changed && (
    value.changed_files.length === 0 &&
    value.additions === 0 &&
    value.deletions === 0 &&
    value.diff === ""
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed"],
      message: "Changed reviews require a changed file, diff statistic, or raw diff."
    });
  }

  if (!value.include_diff && (
    value.diff !== "" ||
    value.review_marked ||
    value.review_checkpoint_hit
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["include_diff"],
      message: "include_diff=false cannot return a diff or use review checkpoints."
    });
  }

  if (value.review_checkpoint_hit && (
    value.review_since !== "last_shown" ||
    !value.include_diff ||
    value.changed ||
    value.changed_files.length !== 0 ||
    value.additions !== 0 ||
    value.deletions !== 0 ||
    value.diff !== "" ||
    value.analysis !== null
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["review_checkpoint_hit"],
      message: "Checkpoint hits require a suppressed last_shown review."
    });
  }

  if (value.diff !== "" && (
    !value.include_diff ||
    !value.changed ||
    value.review_checkpoint_hit
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff"],
      message: "A non-empty diff requires an included, changed, non-checkpoint review."
    });
  }

  if (value.analysis !== null && (!value.changed || value.review_checkpoint_hit)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["analysis"],
      message: "Analysis requires a changed review that was not checkpoint-suppressed."
    });
  }

  if (value.review_marked && !value.include_diff) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["review_marked"],
      message: "Review checkpoints can be marked only when the diff is included."
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
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const gitNotRepositoryErrorSchema = z.object({
  code: z.literal("GIT_NOT_REPOSITORY"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.GIT_NOT_REPOSITORY),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitUnavailableErrorSchema = z.object({
  code: z.literal("GIT_UNAVAILABLE"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.GIT_UNAVAILABLE),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const gitCommandFailedErrorSchema = z.object({
  code: z.literal("GIT_COMMAND_FAILED"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.GIT_COMMAND_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(SHOW_CHANGES_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const showChangesErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  gitNotRepositoryErrorSchema,
  gitUnavailableErrorSchema,
  gitCommandFailedErrorSchema,
  internalErrorSchema
]);

const showChangesMetaSchema = toolMetaSchema.extend({
  warnings: z.array(z.literal(SHOW_CHANGES_ANALYSIS_WARNING))
}).strict();

export const showChangesOutputShape = {
  codexgpt_tool: z.literal("show_changes"),
  codexgpt_title: z.literal("Show Changes"),
  ok: z.boolean(),
  data: showChangesDataSchema.nullable(),
  error: showChangesErrorSchema.nullable(),
  meta: showChangesMetaSchema
};

const showChangesOutputBaseSchema = z.object(showChangesOutputShape).strict();

export const showChangesOutputSchema = showChangesOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful show_changes results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful show_changes results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed show_changes results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed show_changes results require an error object."
    });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "warnings"],
      message: "Failed show_changes results cannot include analysis warnings."
    });
  }
});

export type ShowChangesAnalysis = z.infer<typeof showChangesAnalysisSchema>;
export type ShowChangesData = z.infer<typeof showChangesDataSchema>;
export type ShowChangesStructuredResult = z.infer<typeof showChangesOutputBaseSchema>;

const showChangesDataBaseSchemaV5 = showChangesDataBaseSchema.extend({
  workflow: changeWorkflowStateSchema.optional()
}).strict();

export const showChangesDataSchemaV5 = showChangesDataBaseSchemaV5.superRefine((value, context) => {
  const { workflow: _workflow, ...legacy } = value;
  const parsed = showChangesDataSchema.safeParse(legacy);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue(issue);
  }
});

export const showChangesOutputShapeV5 = {
  ...showChangesOutputShape,
  data: showChangesDataSchemaV5.nullable()
};

const showChangesOutputBaseSchemaV5 = z.object(showChangesOutputShapeV5).strict();

export const showChangesOutputSchemaV5 = showChangesOutputBaseSchemaV5.superRefine((value, context) => {
  if (value.ok && (value.data === null || value.error !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful V5 show_changes requires data and no error." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed V5 show_changes requires an error and no data." });
  }
});

export type ShowChangesFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "GIT_NOT_REPOSITORY"; details: Record<string, never> }
  | { code: "GIT_UNAVAILABLE"; details: Record<string, never> }
  | { code: "GIT_COMMAND_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createShowChangesSuccess(
  data: ShowChangesData,
  durationMs = 0,
  warnings: Array<typeof SHOW_CHANGES_ANALYSIS_WARNING> = []
): ShowChangesStructuredResult {
  return showChangesOutputSchema.parse({
    codexgpt_tool: "show_changes",
    codexgpt_title: "Show Changes",
    ok: true,
    data: showChangesDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs, warnings)
  });
}

export function createShowChangesFailure(
  failure: ShowChangesFailureInput,
  durationMs = 0
): ShowChangesStructuredResult {
  return showChangesOutputSchema.parse({
    codexgpt_tool: "show_changes",
    codexgpt_title: "Show Changes",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: SHOW_CHANGES_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

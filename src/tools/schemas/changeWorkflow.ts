import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const changeWorkflowCheckSchema = z.enum(["build", "test", "lint", "typecheck"]);
export type ChangeWorkflowCheck = z.infer<typeof changeWorkflowCheckSchema>;

const changeSetIdSchema = z.string().regex(/^cs_[a-f0-9]{32}$/u);
const workspaceIdSchema = z.string().min(1).max(160);
const processIdSchema = z.string().regex(/^process_[a-f0-9]{32}$/u).nullable();

export const workflowChangedPathSchema = z.string().min(1).max(240).refine((value) => {
  if (value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.includes(":")) return false;
  return normalized.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}, "Workflow paths must be safe workspace-relative paths.");

export const changeWorkflowRecommendationSchema = z.object({
  check: changeWorkflowCheckSchema,
  command: z.string().min(1).max(512),
  source: z.string().min(1).max(240),
  confidence: z.literal("confirmed")
}).strict();

export const CHANGE_WORKFLOW_REVIEW_CHECKLIST = Object.freeze([
  "unexpected_files",
  "formatting",
  "generated_artifacts",
  "dependency_changes",
  "accidental_deletion"
] as const);

const verificationStateSchema = z.object({
  status: z.enum(["pending", "passed", "failed", "unavailable"]),
  available: z.boolean(),
  auto_run: z.literal(false),
  recommended: z.array(changeWorkflowRecommendationSchema).max(4),
  action: z.literal("verify_change"),
  completed_at: z.string().datetime({ offset: true }).nullable()
}).strict().superRefine((value, context) => {
  if (value.available !== (value.status !== "unavailable")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["available"], message: "Verification availability and status disagree." });
  }
  if ((value.status === "passed" || value.status === "failed") !== (value.completed_at !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completed_at"], message: "Terminal verification requires a completion timestamp." });
  }
});

const reviewStateSchema = z.object({
  status: z.enum(["pending", "incomplete", "completed"]),
  required: z.literal(true),
  action: z.literal("show_changes"),
  git_diff_available: z.boolean(),
  inspection_checklist: z.tuple([
    z.literal("unexpected_files"),
    z.literal("formatting"),
    z.literal("generated_artifacts"),
    z.literal("dependency_changes"),
    z.literal("accidental_deletion")
  ]),
  completed_at: z.string().datetime({ offset: true }).nullable()
}).strict().superRefine((value, context) => {
  if ((value.status === "completed") !== (value.completed_at !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completed_at"], message: "Completed review requires a completion timestamp." });
  }
});

export const changeWorkflowStateSchema = z.object({
  schema_version: z.literal(1),
  change_set_id: changeSetIdSchema,
  changed_files: z.array(workflowChangedPathSchema).min(1).max(1_000),
  stage: z.enum(["applied", "verified", "reviewed"]),
  verification: verificationStateSchema,
  review: reviewStateSchema,
  complete: z.boolean(),
  ready: z.boolean()
}).strict().superRefine((value, context) => {
  const verificationTerminal = value.verification.status === "passed" || value.verification.status === "failed";
  const reviewComplete = value.review.status === "completed";
  const expectedComplete = verificationTerminal && reviewComplete;
  const expectedReady = expectedComplete && value.verification.status === "passed";
  const expectedStage = expectedComplete
    ? "reviewed"
    : verificationTerminal
      ? "verified"
      : "applied";
  if (value.complete !== expectedComplete) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["complete"], message: "Workflow completion state is inconsistent." });
  }
  if (value.ready !== expectedReady) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ready"], message: "Workflow readiness state is inconsistent." });
  }
  if (value.stage !== expectedStage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stage"], message: "Workflow stage is inconsistent." });
  }
  if (new Set(value.changed_files).size !== value.changed_files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed_files"], message: "Workflow paths must be unique." });
  }
  const checks = value.verification.recommended.map((item) => item.check);
  if (new Set(checks).size !== checks.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["verification", "recommended"], message: "Workflow recommendations must use unique check categories." });
  }
});

export type ChangeWorkflowState = z.infer<typeof changeWorkflowStateSchema>;

export const verifyChangeInputV1Schema = z.object({
  workspace_id: workspaceIdSchema,
  change_set_id: changeSetIdSchema,
  checks: z.array(changeWorkflowCheckSchema).min(1).max(4),
  timeout_ms: z.number().int().min(1).max(10 * 60_000).optional()
}).strict().superRefine((value, context) => {
  if (new Set(value.checks).size !== value.checks.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["checks"], message: "Verification checks must be unique." });
  }
});

export type VerifyChangeInputV1 = z.infer<typeof verifyChangeInputV1Schema>;

export const verifyChangeCheckResultSchema = z.object({
  check: changeWorkflowCheckSchema,
  command: z.string().min(1).max(512),
  source: z.string().min(1).max(240),
  status: z.enum(["passed", "failed"]),
  exit_code: z.number().int().nullable(),
  process_id: processIdSchema,
  summary: z.string().max(2_000)
}).strict().superRefine((value, context) => {
  if (value.status === "passed" && value.exit_code !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exit_code"], message: "Passing verification requires exit code zero." });
  }
  if (value.status === "failed" && value.exit_code === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exit_code"], message: "Failed verification cannot report exit code zero." });
  }
});

const verifyChangeNextActionSchema = z.object({
  tool: z.literal("show_changes"),
  args: z.object({
    workspace_id: workspaceIdSchema,
    change_set_id: changeSetIdSchema,
    include_diff: z.literal(true),
    mark_reviewed: z.literal(true)
  }).strict()
}).strict();

export const verifyChangeDataSchema = z.object({
  workspace_id: workspaceIdSchema,
  change_set_id: changeSetIdSchema,
  workflow: changeWorkflowStateSchema,
  checks: z.array(verifyChangeCheckResultSchema).min(1).max(4),
  overall_status: z.enum(["passed", "failed"]),
  next_action: verifyChangeNextActionSchema
}).strict().superRefine((value, context) => {
  if (value.workflow.change_set_id !== value.change_set_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workflow", "change_set_id"], message: "Workflow and verification change-set ids differ." });
  }
  const expected = value.checks.every((check) => check.status === "passed") ? "passed" : "failed";
  if (value.overall_status !== expected || value.workflow.verification.status !== expected) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["overall_status"], message: "Verification aggregate status is inconsistent." });
  }
});

export const VERIFY_CHANGE_ERROR_MESSAGES = Object.freeze({
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open it before retrying.",
  WORKFLOW_NOT_FOUND: "The requested change workflow is unavailable in this server runtime.",
  WORKFLOW_OWNER_MISMATCH: "The requested change workflow is unavailable for this identity.",
  INVALID_CHECK_SELECTION: "The verification check selection is invalid.",
  CHECK_NOT_CONFIRMED: "A requested check has no current confirmed project command.",
  VERIFICATION_UNAVAILABLE: "The current execution profile cannot run change verification.",
  CHILD_RESULT_INVALID: "A verification child returned an invalid bounded result.",
  INTERNAL_ERROR: "Change verification could not be completed because of an internal error."
} as const);

export type VerifyChangeErrorCode = keyof typeof VERIFY_CHANGE_ERROR_MESSAGES;

const verifyChangeErrorSchema = z.object({
  code: z.enum(Object.keys(VERIFY_CHANGE_ERROR_MESSAGES) as [VerifyChangeErrorCode, ...VerifyChangeErrorCode[]]),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.object({
    workspace_id: workspaceIdSchema.optional(),
    change_set_id: changeSetIdSchema.optional(),
    check: changeWorkflowCheckSchema.optional()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.message !== VERIFY_CHANGE_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Verification error message is not canonical." });
  }
});

export const verifyChangeOutputShape = {
  codexgpt_tool: z.literal("codexgpt"),
  codexgpt_title: z.literal("Verify Change"),
  ok: z.boolean(),
  data: verifyChangeDataSchema.nullable(),
  error: verifyChangeErrorSchema.nullable(),
  meta: toolMetaSchema,
  codexgpt_super_action: z.literal("verify_change")
};

const verifyChangeOutputBaseSchema = z.object(verifyChangeOutputShape).strict();

export const verifyChangeOutputSchema = verifyChangeOutputBaseSchema.superRefine((value, context) => {
  if (value.ok && (value.data === null || value.error !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful change verification requires data and no error." });
  }
  if (!value.ok && (value.data !== null || value.error === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed change verification requires an error and no data." });
  }
});

export type VerifyChangeData = z.infer<typeof verifyChangeDataSchema>;
export type VerifyChangeStructuredResult = z.infer<typeof verifyChangeOutputBaseSchema>;

export function createVerifyChangeSuccess(data: VerifyChangeData, durationMs = 0): VerifyChangeStructuredResult {
  return verifyChangeOutputSchema.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "Verify Change",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs),
    codexgpt_super_action: "verify_change"
  });
}

export function createVerifyChangeFailure(
  code: VerifyChangeErrorCode,
  details: { workspace_id?: string; change_set_id?: string; check?: ChangeWorkflowCheck } = {},
  durationMs = 0
): VerifyChangeStructuredResult {
  return verifyChangeOutputSchema.parse({
    codexgpt_tool: "codexgpt",
    codexgpt_title: "Verify Change",
    ok: false,
    data: null,
    error: {
      code,
      message: VERIFY_CHANGE_ERROR_MESSAGES[code],
      retryable: false,
      details
    },
    meta: createToolMeta(durationMs),
    codexgpt_super_action: "verify_change"
  });
}

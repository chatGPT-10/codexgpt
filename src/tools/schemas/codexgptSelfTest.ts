import path from "node:path";
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import { guidanceDiagnosticSchema, standardSkillScanSchema } from "./guidance.js";

export const CODEXGPT_SELF_TEST_ARTIFACT = ".ai-bridge/codexgpt-self-test.md" as const;

export const CODEXGPT_SELF_TEST_CHECK_NAMES = [
  "workspace",
  "tool_mode",
  "write_mode",
  "bash_mode",
  "http_auth",
  "registered_tool_set",
  "inventory",
  "git_status",
  "write_edit_probe",
  "selected_only_pro_context",
  "bash_policy",
  "policy_schema",
  "policy_profile",
  "policy_revision",
  "policy_identity",
  "policy_enforcement",
  "persistent_audit",
  "terms_boundary"
] as const;

export const CODEXGPT_SELF_TEST_FAILED_WARNING =
  "One or more self-test checks failed." as const;
export const CODEXGPT_SELF_TEST_WARNED_WARNING =
  "One or more self-test checks returned warnings." as const;
export const CODEXGPT_SELF_TEST_SKIPPED_WARNING =
  "One or more optional self-test probes were skipped." as const;

export const CODEXGPT_SELF_TEST_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  SELF_TEST_EXECUTION_FAILED: "The CodexGPT self-test could not be completed.",
  INTERNAL_ERROR: "The CodexGPT self-test failed because of an internal error."
} as const;

export const CODEXGPT_SELF_TEST_DIAGNOSTIC_CODES = [
  "WORKSPACE_READY",
  "TOOL_MODE_VALID",
  "WRITE_MODE_VALID",
  "WRITE_MODE_RESTRICTED",
  "BASH_MODE_VALID",
  "BASH_MODE_FULL",
  "HTTP_AUTH_ENABLED",
  "HTTP_AUTH_LOCAL_ONLY",
  "TOOL_SET_MATCH",
  "TOOL_SET_MISMATCH",
  "INVENTORY_READY",
  "INVENTORY_TRUNCATED",
  "INVENTORY_FAILED",
  "GIT_CLEAN",
  "GIT_CHANGED",
  "NOT_GIT",
  "GIT_UNAVAILABLE",
  "WRITE_EDIT_PROBE_PASSED",
  "WRITE_EDIT_PROBE_DISABLED",
  "WRITE_EDIT_PROBE_UNAVAILABLE",
  "WRITE_EDIT_PROBE_CONFLICT",
  "WRITE_EDIT_PROBE_FAILED",
  "PRO_CONTEXT_PROBE_PASSED",
  "PRO_CONTEXT_PROBE_DISABLED",
  "PRO_CONTEXT_PROBE_UNAVAILABLE",
  "PRO_CONTEXT_PROBE_FAILED",
  "BASH_POLICY_PASSED",
  "BASH_POLICY_DISABLED",
  "BASH_POLICY_UNAVAILABLE",
  "BASH_POLICY_FULL",
  "BASH_POLICY_FAILED",
  "POLICY_SCHEMA_VALID",
  "POLICY_SCHEMA_INVALID",
  "POLICY_PROFILE_VALID",
  "POLICY_PROFILE_INVALID",
  "POLICY_REVISION_VALID",
  "POLICY_REVISION_INVALID",
  "POLICY_IDENTITY_VALID",
  "POLICY_IDENTITY_INVALID",
  "POLICY_ENFORCEMENT_DECLARED",
  "POLICY_ENFORCEMENT_INVALID",
  "AUDIT_READY",
  "AUDIT_DISABLED",
  "AUDIT_UNINITIALIZED",
  "AUDIT_BUSY",
  "AUDIT_RETENTION_INVALID",
  "AUDIT_INTEGRITY_FAILURE",
  "AUDIT_UNAVAILABLE",
  "TERMS_BOUNDARY_VALID"
] as const;

const secretShape = /(?:\bbearer\b|\bauthorization\b|\bapi[_-]?key\b|\baccess[_-]?token\b|\bprivate[_-]?key\b|\bpassword\b|\bsecret\b|\bsk-[A-Za-z0-9_-]{8,})/i;

function safeOneLine(maxLength = 240) {
  return z.string()
    .min(1)
    .max(maxLength)
    .refine((value) => value.trim() === value, "Value cannot have surrounding whitespace.")
    .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Value must be one line.");
}

const safeIdentifierSchema = safeOneLine(160)
  .refine((value) => !secretShape.test(value), "Identifier cannot contain secret-shaped text.");

const safeToolNameSchema = safeOneLine(120)
  .refine((value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value), "Tool name is not safe.")
  .refine((value) => !secretShape.test(value), "Tool name cannot contain secret-shaped text.");

const safeMessageSchema = safeOneLine(240)
  .refine((value) => !secretShape.test(value), "Message cannot contain secret-shaped text.");

const canonicalAbsolutePathSchema = z.string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Path must be one line.")
  .refine((value) => path.isAbsolute(value) || path.win32.isAbsolute(value), "Path must be absolute.")
  .refine((value) => path.resolve(value) === value, "Path must be canonical.");

function compareStrings(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function checkSortedUnique(
  values: string[],
  context: z.RefinementCtx,
  field: string
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index],
        message: `${field} must not contain duplicates.`
      });
    }
    seen.add(value);
    if (index > 0 && compareStrings(values[index - 1]!, value) >= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index],
        message: `${field} must be sorted and unique.`
      });
    }
  });
}

export const codexgptSelfTestRequestSchema = z.object({
  write_probe: z.boolean(),
  bash_probe: z.boolean(),
  pro_context_probe: z.boolean(),
  include_global_skills: z.boolean(),
  max_skills: z.number().int().min(1).max(120)
}).strict();

export const codexgptSelfTestCountsSchema = z.object({
  total: z.literal(18),
  passed: z.number().int().min(0).max(18),
  warned: z.number().int().min(0).max(18),
  failed: z.number().int().min(0).max(18),
  skipped: z.number().int().min(0).max(18)
}).strict();

export const codexgptSelfTestInventorySchema = z.object({
  skill_count: z.number().int().min(0).max(120),
  mcp_server_count: z.number().int().min(0).max(120),
  skills_truncated: z.boolean(),
  mcp_servers_truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.skills_truncated && value.skill_count === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skills_truncated"],
      message: "A truncated Skill inventory cannot be empty."
    });
  }
  if (value.mcp_servers_truncated && value.mcp_server_count !== 120) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mcp_servers_truncated"],
      message: "A truncated MCP server inventory must reach the fixed limit."
    });
  }
});

export const codexgptSelfTestGitSchema = z.object({
  repository_state: z.enum(["clean", "changed", "not_git", "unavailable"]),
  changed_entries: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.repository_state === "clean" && value.changed_entries !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed_entries"],
      message: "A clean repository cannot have changed entries."
    });
  }
  if (value.repository_state === "changed" && value.changed_entries === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed_entries"],
      message: "A changed repository must have changed entries."
    });
  }
  if ((value.repository_state === "not_git" || value.repository_state === "unavailable") && value.changed_entries !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["changed_entries"],
      message: "Unavailable Git states cannot expose changed entries."
    });
  }
});

export const codexgptSelfTestPolicySchema = z.object({
  engine_mode: z.enum(["legacy", "shadow", "enforce"]),
  profile_id: safeIdentifierSchema,
  schema_valid: z.boolean(),
  profile_valid: z.boolean(),
  revision_valid: z.boolean(),
  identity_valid: z.boolean(),
  enforcement_declared: z.boolean(),
  policy_revision: safeIdentifierSchema,
  hard_policy_revision: safeIdentifierSchema,
  backend_id: safeIdentifierSchema,
  evidence_revision: safeIdentifierSchema,
  missing_capabilities: z.array(safeIdentifierSchema).max(16)
}).strict();

export const codexgptSelfTestTermsBoundarySchema = z.object({
  local_workspace_bridge: z.literal(true),
  provides_models: z.literal(false),
  proxies_model_access: z.literal(false),
  bypasses_quotas: z.literal(false),
  remote_agent_execution: z.literal(false)
}).strict();

export const codexgptSelfTestCheckSchema = z.object({
  name: z.enum(CODEXGPT_SELF_TEST_CHECK_NAMES),
  status: z.enum(["pass", "warn", "fail", "skipped"]),
  code: z.enum(CODEXGPT_SELF_TEST_DIAGNOSTIC_CODES),
  message: safeMessageSchema
}).strict();

const toolArraySchema = z.array(safeToolNameSchema).max(28);
const fixedTouchedFilesSchema = z.union([
  z.tuple([]),
  z.tuple([z.literal(CODEXGPT_SELF_TEST_ARTIFACT)])
]);

const allowedCheckOutcomes = new Set([
  "workspace:pass:WORKSPACE_READY",
  "tool_mode:pass:TOOL_MODE_VALID",
  "write_mode:pass:WRITE_MODE_VALID",
  "write_mode:warn:WRITE_MODE_RESTRICTED",
  "bash_mode:pass:BASH_MODE_VALID",
  "bash_mode:warn:BASH_MODE_FULL",
  "http_auth:pass:HTTP_AUTH_ENABLED",
  "http_auth:warn:HTTP_AUTH_LOCAL_ONLY",
  "registered_tool_set:pass:TOOL_SET_MATCH",
  "registered_tool_set:fail:TOOL_SET_MISMATCH",
  "inventory:pass:INVENTORY_READY",
  "inventory:warn:INVENTORY_TRUNCATED",
  "inventory:fail:INVENTORY_FAILED",
  "git_status:pass:GIT_CLEAN",
  "git_status:warn:GIT_CHANGED",
  "git_status:warn:NOT_GIT",
  "git_status:warn:GIT_UNAVAILABLE",
  "write_edit_probe:pass:WRITE_EDIT_PROBE_PASSED",
  "write_edit_probe:skipped:WRITE_EDIT_PROBE_DISABLED",
  "write_edit_probe:skipped:WRITE_EDIT_PROBE_UNAVAILABLE",
  "write_edit_probe:fail:WRITE_EDIT_PROBE_CONFLICT",
  "write_edit_probe:fail:WRITE_EDIT_PROBE_FAILED",
  "selected_only_pro_context:pass:PRO_CONTEXT_PROBE_PASSED",
  "selected_only_pro_context:skipped:PRO_CONTEXT_PROBE_DISABLED",
  "selected_only_pro_context:skipped:PRO_CONTEXT_PROBE_UNAVAILABLE",
  "selected_only_pro_context:fail:PRO_CONTEXT_PROBE_FAILED",
  "bash_policy:pass:BASH_POLICY_PASSED",
  "bash_policy:skipped:BASH_POLICY_DISABLED",
  "bash_policy:skipped:BASH_POLICY_UNAVAILABLE",
  "bash_policy:warn:BASH_POLICY_FULL",
  "bash_policy:fail:BASH_POLICY_FAILED",
  "policy_schema:pass:POLICY_SCHEMA_VALID",
  "policy_schema:fail:POLICY_SCHEMA_INVALID",
  "policy_profile:pass:POLICY_PROFILE_VALID",
  "policy_profile:fail:POLICY_PROFILE_INVALID",
  "policy_revision:pass:POLICY_REVISION_VALID",
  "policy_revision:fail:POLICY_REVISION_INVALID",
  "policy_identity:pass:POLICY_IDENTITY_VALID",
  "policy_identity:fail:POLICY_IDENTITY_INVALID",
  "policy_enforcement:pass:POLICY_ENFORCEMENT_DECLARED",
  "policy_enforcement:fail:POLICY_ENFORCEMENT_INVALID",
  "persistent_audit:pass:AUDIT_READY",
  "persistent_audit:skipped:AUDIT_DISABLED",
  "persistent_audit:warn:AUDIT_UNINITIALIZED",
  "persistent_audit:warn:AUDIT_BUSY",
  "persistent_audit:fail:AUDIT_RETENTION_INVALID",
  "persistent_audit:fail:AUDIT_INTEGRITY_FAILURE",
  "persistent_audit:fail:AUDIT_UNAVAILABLE",
  "terms_boundary:pass:TERMS_BOUNDARY_VALID"
]);

const codexgptSelfTestLegacyDataObjectSchema = z.object({
  workspace_id: safeIdentifierSchema,
  root: canonicalAbsolutePathSchema,
  status: z.enum(["pass", "warn", "fail"]),
  counts: codexgptSelfTestCountsSchema,
  tool_mode: z.enum(["minimal", "standard", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  bash_mode: z.enum(["off", "safe", "full"]),
  bash_session_guard: z.object({
    required: z.boolean(),
    configured: z.boolean()
  }).strict(),
  http_auth: z.object({
    enabled: z.boolean(),
    required_for_public_access: z.boolean()
  }).strict(),
  request: codexgptSelfTestRequestSchema,
  expected_tools: toolArraySchema,
  registered_tools: toolArraySchema,
  missing_tools: toolArraySchema,
  unexpected_tools: toolArraySchema,
  tool_set_matches: z.boolean(),
  inventory: codexgptSelfTestInventorySchema,
  git: codexgptSelfTestGitSchema,
  policy: codexgptSelfTestPolicySchema,
  probe_artifact: z.literal(CODEXGPT_SELF_TEST_ARTIFACT).nullable(),
  files_touched: fixedTouchedFilesSchema,
  checks: z.array(codexgptSelfTestCheckSchema).length(18),
  terms_boundary: codexgptSelfTestTermsBoundarySchema
}).strict();

type CodexGPTSelfTestLegacyData = z.infer<typeof codexgptSelfTestLegacyDataObjectSchema>;

function refineCodexGPTSelfTestData(value: CodexGPTSelfTestLegacyData, context: z.RefinementCtx): void {
  for (const field of ["expected_tools", "registered_tools", "missing_tools", "unexpected_tools"] as const) {
    checkSortedUnique(value[field], context, field);
  }

  const expectedMissing = value.expected_tools.filter((name) => !value.registered_tools.includes(name));
  const expectedUnexpected = value.registered_tools.filter((name) => !value.expected_tools.includes(name));
  if (JSON.stringify(value.missing_tools) !== JSON.stringify(expectedMissing)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["missing_tools"],
      message: "missing_tools must equal expected_tools minus registered_tools."
    });
  }
  if (JSON.stringify(value.unexpected_tools) !== JSON.stringify(expectedUnexpected)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unexpected_tools"],
      message: "unexpected_tools must equal registered_tools minus expected_tools."
    });
  }
  const setsMatch = expectedMissing.length === 0 && expectedUnexpected.length === 0;
  if (value.tool_set_matches !== setsMatch) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tool_set_matches"],
      message: "tool_set_matches must reflect the exact tool-set difference."
    });
  }

  const actualCounts = {
    passed: value.checks.filter((check) => check.status === "pass").length,
    warned: value.checks.filter((check) => check.status === "warn").length,
    failed: value.checks.filter((check) => check.status === "fail").length,
    skipped: value.checks.filter((check) => check.status === "skipped").length
  };
  if (
    value.counts.total !== value.checks.length ||
    value.counts.passed !== actualCounts.passed ||
    value.counts.warned !== actualCounts.warned ||
    value.counts.failed !== actualCounts.failed ||
    value.counts.skipped !== actualCounts.skipped ||
    value.counts.passed + value.counts.warned + value.counts.failed + value.counts.skipped !== 18
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["counts"],
      message: "Outcome counts must exactly match the eighteen checks."
    });
  }

  const expectedStatus = actualCounts.failed > 0
    ? "fail"
    : actualCounts.warned > 0 || actualCounts.skipped > 0
      ? "warn"
      : "pass";
  if (value.status !== expectedStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Overall status must be derived from check outcomes."
    });
  }

  if (
    value.inventory.skills_truncated &&
    value.inventory.skill_count !== value.request.max_skills
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inventory", "skill_count"],
      message: "A truncated Skill inventory must reach the effective request limit."
    });
  }

  value.checks.forEach((check, index) => {
    if (check.name !== CODEXGPT_SELF_TEST_CHECK_NAMES[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checks", index, "name"],
        message: "Checks must use the fixed eighteen-check order."
      });
    }
    if (!allowedCheckOutcomes.has(`${check.name}:${check.status}:${check.code}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checks", index],
        message: "Check status and diagnostic code must form an approved outcome."
      });
    }
  });

  if (value.bash_mode === "off" && (value.bash_session_guard.required || value.bash_session_guard.configured)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bash_session_guard"],
      message: "Bash-off mode cannot use a session guard."
    });
  }
  if (value.bash_session_guard.required && !value.bash_session_guard.configured) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bash_session_guard", "configured"],
      message: "A required Bash session guard must be configured."
    });
  }

  if (!value.request.write_probe && (value.probe_artifact !== null || value.files_touched.length !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["probe_artifact"],
      message: "A disabled write probe cannot touch an artifact."
    });
  }
  if (value.probe_artifact === null && value.files_touched.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["files_touched"],
      message: "Touched files require the fixed probe artifact."
    });
  }
  if (value.probe_artifact !== null && (
    value.files_touched.length !== 1 || value.files_touched[0] !== CODEXGPT_SELF_TEST_ARTIFACT
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["files_touched"],
      message: "The probe artifact and touched-file set must agree."
    });
  }
}

export const codexgptSelfTestLegacyDataSchema = codexgptSelfTestLegacyDataObjectSchema.superRefine(refineCodexGPTSelfTestData);

const codexgptSelfTestGuidanceDataSchema = codexgptSelfTestLegacyDataObjectSchema.extend({
  guidance_mode: z.literal("standard"),
  guidance_status: z.enum(["ok", "warning", "unavailable"]),
  guidance_diagnostics: z.array(guidanceDiagnosticSchema).max(256),
  skill_scan: standardSkillScanSchema
}).strict().superRefine(refineCodexGPTSelfTestData);

export const codexgptSelfTestDataSchema = z.union([
  codexgptSelfTestLegacyDataSchema,
  codexgptSelfTestGuidanceDataSchema
]);

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({
    source: z.literal("workspace_id"),
    workspace_id: safeIdentifierSchema
  }).strict(),
  z.object({
    source: z.literal("default_workspace"),
    workspace_id: z.null()
  }).strict()
]);

export const codexgptSelfTestErrorSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("WORKSPACE_NOT_FOUND"),
    message: z.literal(CODEXGPT_SELF_TEST_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
    retryable: z.literal(false),
    details: workspaceNotFoundDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("SELF_TEST_EXECUTION_FAILED"),
    message: z.literal(CODEXGPT_SELF_TEST_ERROR_MESSAGES.SELF_TEST_EXECUTION_FAILED),
    retryable: z.literal(true),
    details: emptyDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("INTERNAL_ERROR"),
    message: z.literal(CODEXGPT_SELF_TEST_ERROR_MESSAGES.INTERNAL_ERROR),
    retryable: z.literal(false),
    details: emptyDetailsSchema
  }).strict()
]);

export const codexgptSelfTestOutputShape = {
  codexgpt_tool: z.literal("codexgpt_self_test"),
  codexgpt_title: z.literal("CodexGPT Self Test"),
  ok: z.boolean(),
  data: codexgptSelfTestDataSchema.nullable(),
  error: codexgptSelfTestErrorSchema.nullable(),
  meta: toolMetaSchema
};

export const codexgptSelfTestLegacyOutputShape = {
  ...codexgptSelfTestOutputShape,
  data: codexgptSelfTestLegacyDataSchema.nullable()
};

const codexgptSelfTestOutputBaseSchema = z.object(codexgptSelfTestOutputShape).strict();

export const codexgptSelfTestOutputSchema = codexgptSelfTestOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful self-test results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful self-test results require error to be null."
        });
      }
      if (value.data !== null) {
        const expectedWarnings = selfTestWarnings(value.data);
        if (
          expectedWarnings.length !== value.meta.warnings.length ||
          expectedWarnings.some((warning, index) => warning !== value.meta.warnings[index])
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["meta", "warnings"],
            message: "Self-test warnings must exactly match check outcomes."
          });
        }
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed self-test results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed self-test results require an error object."
      });
    }
    if (value.meta.warnings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meta", "warnings"],
        message: "Failed self-test results cannot include warnings."
      });
    }
  }
);

export type CodexGPTSelfTestRequest = z.infer<typeof codexgptSelfTestRequestSchema>;
export type CodexGPTSelfTestData = z.infer<typeof codexgptSelfTestDataSchema>;
export type CodexGPTSelfTestCheck = z.infer<typeof codexgptSelfTestCheckSchema>;
export type CodexGPTSelfTestStructuredResult = z.infer<typeof codexgptSelfTestOutputBaseSchema>;
export type CodexGPTSelfTestFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details:
        | { source: "workspace_id"; workspace_id: string }
        | { source: "default_workspace"; workspace_id: null };
    }
  | { code: "SELF_TEST_EXECUTION_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

function selfTestWarnings(data: CodexGPTSelfTestData): string[] {
  const warnings: string[] = [];
  if (data.counts.failed > 0) warnings.push(CODEXGPT_SELF_TEST_FAILED_WARNING);
  if (data.counts.warned > 0) warnings.push(CODEXGPT_SELF_TEST_WARNED_WARNING);
  if (data.counts.skipped > 0) warnings.push(CODEXGPT_SELF_TEST_SKIPPED_WARNING);
  return warnings;
}

export function createCodexGPTSelfTestSuccess(
  data: CodexGPTSelfTestData,
  durationMs = 0
): CodexGPTSelfTestStructuredResult {
  const parsedData = codexgptSelfTestDataSchema.parse(data);
  return codexgptSelfTestOutputSchema.parse({
    codexgpt_tool: "codexgpt_self_test",
    codexgpt_title: "CodexGPT Self Test",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, selfTestWarnings(parsedData))
  });
}

export function createCodexGPTSelfTestFailure(
  failure: CodexGPTSelfTestFailureInput,
  durationMs = 0
): CodexGPTSelfTestStructuredResult {
  return codexgptSelfTestOutputSchema.parse({
    codexgpt_tool: "codexgpt_self_test",
    codexgpt_title: "CodexGPT Self Test",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_SELF_TEST_ERROR_MESSAGES[failure.code],
      retryable: failure.code === "SELF_TEST_EXECUTION_FAILED",
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

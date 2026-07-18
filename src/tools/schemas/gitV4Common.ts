import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const gitV4StateReaderVersions = Object.freeze([1, 2, 3, 4] as const);

export const gitV4PersistentRecordHeaderSchema = z.object({
  schema_version: z.literal(4),
  contract_version: z.literal(4)
}).strict();

export const gitV4SafeIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const gitV4WorkspaceIdSchema = gitV4SafeIdSchema;
export const gitV4RepositoryIdSchema = z.string().regex(/^repo_[a-f0-9]{32}$/);
export const gitV4BranchIdSchema = z.string().regex(/^branch_[a-f0-9]{32}$/);
export const gitV4TaskWorktreeIdSchema = z.string().regex(/^task_[a-f0-9]{32}$/);
export const gitV4StashIdSchema = z.string().regex(/^stash_[a-f0-9]{32}$/);
export const gitV4ReviewTokenSchema = z.string().min(28).max(4096).regex(/^review_[A-Za-z0-9_-]+$/);
export const gitV4StateTokenSchema = z.string().min(28).max(4096).regex(/^gst_[A-Za-z0-9_-]+$/);
export const gitV4IndexTokenSchema = z.string().min(28).max(4096).regex(/^gitx_[A-Za-z0-9_-]+$/);
export const gitV4MergePlanIdSchema = z.string().regex(/^merge_[a-f0-9]{32}$/);
export const gitV4OidSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const gitV4DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const gitV4TimestampSchema = z.string().datetime({ offset: true });
export const gitV4ExecutionIsolationSchema = z.literal("none");
export const gitV4IntegrationsSchema = z.enum(["disabled", "approved_full_access"]);

const WINDOWS_RESERVED_PATH_SEGMENT = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const PUBLIC_GIT_TEXT_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const PUBLIC_GIT_MULTILINE_TEXT_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export function gitV4SafeOneLineTextSchema(maxLength: number, allowEmpty = false) {
  const schema = allowEmpty ? z.string().max(maxLength) : z.string().min(1).max(maxLength);
  return schema.refine(
    (value) => !PUBLIC_GIT_TEXT_FORBIDDEN.test(value),
    "Text must be control-safe, bidi-safe, and single-line."
  );
}

export function gitV4SafeMultilineTextSchema(maxLength: number, allowEmpty = false) {
  const schema = allowEmpty ? z.string().max(maxLength) : z.string().min(1).max(maxLength);
  return schema.refine(
    (value) => !PUBLIC_GIT_MULTILINE_TEXT_FORBIDDEN.test(value),
    "Text may contain CR, LF, and TAB but no other control or bidi characters."
  );
}

export const gitV4LiteralPathSchema = z.string().min(1).max(4096).superRefine((value, context) => {
  if (PUBLIC_GIT_TEXT_FORBIDDEN.test(value) || value.includes("\\")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Path must be control-safe, bidi-safe, and repository-relative POSIX text." });
  }
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.startsWith("//") || value.startsWith(":(")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Absolute, device, drive-relative, UNC, and pathspec-magic paths are forbidden." });
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Path segments must be literal and normalized." });
  }
  if (segments.some((segment) => segment.length > 255)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Path segments must fit the bounded cross-platform representation." });
  }
  if (segments.some((segment) =>
    segment.endsWith(".") ||
    segment.endsWith(" ") ||
    /[<>:"|?*]/.test(segment) ||
    WINDOWS_RESERVED_PATH_SEGMENT.test(segment)
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Windows-ambiguous, reserved, and ADS path segments are forbidden." });
  }
});

export const gitV4PathsSchema = z.array(gitV4LiteralPathSchema).min(1).max(256).refine(
  (paths) => new Set(paths).size === paths.length,
  "Paths must be unique."
);

export const gitV4OptionalPathsSchema = z.array(gitV4LiteralPathSchema).min(1).max(256).refine(
  (paths) => new Set(paths).size === paths.length,
  "Paths must be unique."
).optional();

export const gitV4CodexBranchNameSchema = z.string().min(7).max(126).regex(/^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/).superRefine(
  (value, context) => {
    const components = value.split("/");
    if (
      value === "@" ||
      value.includes("..") ||
      value.includes("@{") ||
      value.includes("//") ||
      value.endsWith("/") ||
      value.endsWith(".") ||
      components.some((component) =>
        component.startsWith(".") ||
        component.endsWith(".") ||
        component.toLowerCase().endsWith(".lock") ||
        component.length > 255 ||
        WINDOWS_RESERVED_PATH_SEGMENT.test(component)
      )
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Branch name must satisfy the normalized Git ref-format subset." });
    }
    if (PUBLIC_GIT_TEXT_FORBIDDEN.test(value) || /[ <>"|~^:?*\[\\]/.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Branch name contains a forbidden or display-ambiguous character." });
    }
  }
);

export const gitV4BaseSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current_head") }).strict(),
  z.object({ kind: z.literal("branch"), branch_id: gitV4BranchIdSchema }).strict()
]);

export const gitV4ErrorCodeSchema = z.enum([
  "GIT_V4_HANDLER_UNAVAILABLE",
  "GIT_CAPABILITY_UNAVAILABLE",
  "GIT_EXECUTABLE_CHANGED",
  "GIT_NOT_REPOSITORY",
  "GIT_REPOSITORY_UNSAFE",
  "GIT_METADATA_OUTSIDE_AUTHORITY",
  "GIT_UNSUPPORTED_REPOSITORY_FORMAT",
  "GIT_OBJECT_MISSING",
  "GIT_SCAN_LIMIT",
  "GIT_STATE_INCOMPLETE",
  "GIT_STATE_TOKEN_INVALID",
  "GIT_STATE_CHANGED",
  "GIT_REF_CHANGED",
  "GIT_INDEX_CHANGED",
  "GIT_UNMERGED",
  "GIT_IDENTITY_REQUIRED",
  "GIT_NORMALIZATION_REQUIRED",
  "GIT_PATH_BLOCKED",
  "GIT_SECRET_BLOCKED",
  "GIT_INTEGRATION_REQUIRED",
  "GIT_MERGE_CAPABILITY_UNAVAILABLE",
  "GIT_SPARSE_CHECKOUT_UNSUPPORTED",
  "GIT_SPLIT_INDEX_UNSUPPORTED",
  "GIT_RECOVERY_REQUIRED",
  "TASK_WORKTREE_NOT_FOUND",
  "TASK_WORKTREE_DIRTY",
  "TASK_WORKTREE_IN_USE",
  "TASK_WORKTREE_UNSAFE_ENTRY",
  "TASK_WORKTREE_PATH_TOO_LONG",
  "MERGE_CONFLICT",
  "MERGE_PLAN_INVALID",
  "MERGE_PLAN_STALE",
  "MERGE_CHECKS_REQUIRED",
  "INTERNAL_ERROR"
]);

export const gitV4NextActionSchema = z.enum([
  "refresh_status",
  "reduce_scope",
  "close_worktree_handles",
  "resolve_conflicts_locally",
  "use_approved_integrations",
  "upgrade_git_capability",
  "run_manual_git_recovery",
  "retry",
  "none"
]);

export const gitV4ErrorSchema = z.object({
  code: gitV4ErrorCodeSchema,
  message: gitV4SafeOneLineTextSchema(240),
  retryable: z.boolean(),
  details: z.object({ next_action: gitV4NextActionSchema }).strict()
}).strict();

export const gitV4FileChangeSchema = z.object({
  path: gitV4LiteralPathSchema,
  change: z.enum(["added", "modified", "deleted", "renamed", "copied", "type_changed", "unmerged"]),
  old_path: gitV4LiteralPathSchema.nullable(),
  binary: z.boolean(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable()
}).strict();

export const gitV4TaskSummarySchema = z.object({
  task_worktree_id: gitV4TaskWorktreeIdSchema,
  branch_id: gitV4BranchIdSchema,
  target_branch_id: gitV4BranchIdSchema,
  base_oid: gitV4OidSchema,
  head_oid: gitV4OidSchema,
  state: z.enum(["preparing", "ready", "merge_prepared", "recovery_required", "removed"]),
  created_at: gitV4TimestampSchema,
  updated_at: gitV4TimestampSchema
}).strict();

export function defineGitV4Tool<Name extends string, Data extends z.ZodTypeAny>(
  name: Name,
  title: string,
  dataSchema: Data
) {
  const outputShape = {
    codexpro_tool: z.literal(name),
    codexpro_title: z.literal(title),
    ok: z.boolean(),
    data: dataSchema.nullable(),
    error: gitV4ErrorSchema.nullable(),
    meta: toolMetaSchema
  };
  const outputSchema = z.object(outputShape).strict().superRefine((value, context) => {
    if (value.ok && (value.data === null || value.error !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Successful ${name} results require data and no error.` });
    }
    if (!value.ok && (value.data !== null || value.error === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Failed ${name} results require an error and no data.` });
    }
  });
  const failure = (input: {
    code: z.infer<typeof gitV4ErrorCodeSchema>;
    message: string;
    retryable: boolean;
    nextAction: z.infer<typeof gitV4NextActionSchema>;
  }, durationMs = 0) => outputSchema.parse({
    codexpro_tool: name,
    codexpro_title: title,
    ok: false,
    data: null,
    error: {
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      details: { next_action: input.nextAction }
    },
    meta: createToolMeta(durationMs)
  });
  return Object.freeze({
    outputShape,
    outputSchema,
    success(data: z.infer<Data>, durationMs = 0) {
      return outputSchema.parse({
        codexpro_tool: name,
        codexpro_title: title,
        ok: true,
        data,
        error: null,
        meta: createToolMeta(durationMs)
      });
    },
    failure,
    unavailable(durationMs = 0) {
      return failure({
        code: "GIT_V4_HANDLER_UNAVAILABLE",
        message: "This Contract V4 handler is reserved but not active until its implementation gate passes.",
        retryable: false,
        nextAction: "upgrade_git_capability"
      }, durationMs);
    }
  });
}

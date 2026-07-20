import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const BASH_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  INVALID_ARGUMENT: "The Bash request contains an invalid argument.",
  BASH_SESSION_CONFIGURATION_INVALID: "The Bash session guard is enabled but the server session configuration is invalid.",
  BASH_SESSION_REQUIRED: "A Bash session id is required for this server.",
  BASH_SESSION_MISMATCH: "The provided Bash session id does not match this server.",
  COMMAND_POLICY_DENIED: "The command is not allowed by the current Bash policy.",
  SHELL_BACKEND_UNAVAILABLE: "The Bash backend is unavailable on this server.",
  PATH_OUTSIDE_WORKSPACE: "The requested working directory is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested working directory is blocked by workspace safety rules.",
  COMMAND_START_FAILED: "The Bash process could not be started.",
  INTERNAL_ERROR: "The Bash request failed because of an internal error."
} as const;

const bashSessionIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const bashDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  command: z.string().min(1),
  cwd: z.string().min(1),
  exitCode: z.number().int().nonnegative().nullable(),
  signal: z.string().min(1).max(64).nullable(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  bash_session_id: bashSessionIdSchema.nullable()
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.literal("command"),
  reason: z.literal("empty")
}).strict();

const sessionConfigurationDetailsSchema = z.object({
  reason: z.literal("missing_server_session_id")
}).strict();

const expectedSessionDetailsSchema = z.object({
  expected_session_id: bashSessionIdSchema
}).strict();

const commandPolicyDetailsSchema = z.object({
  reason: z.enum(["blocked_pattern", "not_allowlisted"])
}).strict();

const backendDetailsSchema = z.object({
  backend: z.literal("bash")
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(BASH_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const invalidArgumentErrorSchema = z.object({
  code: z.literal("INVALID_ARGUMENT"),
  message: z.literal(BASH_ERROR_MESSAGES.INVALID_ARGUMENT),
  retryable: z.literal(false),
  details: invalidArgumentDetailsSchema
}).strict();

const bashSessionConfigurationInvalidErrorSchema = z.object({
  code: z.literal("BASH_SESSION_CONFIGURATION_INVALID"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_CONFIGURATION_INVALID),
  retryable: z.literal(false),
  details: sessionConfigurationDetailsSchema
}).strict();

const bashSessionRequiredErrorSchema = z.object({
  code: z.literal("BASH_SESSION_REQUIRED"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_REQUIRED),
  retryable: z.literal(false),
  details: expectedSessionDetailsSchema
}).strict();

const bashSessionMismatchErrorSchema = z.object({
  code: z.literal("BASH_SESSION_MISMATCH"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_MISMATCH),
  retryable: z.literal(false),
  details: expectedSessionDetailsSchema
}).strict();

const commandPolicyDeniedErrorSchema = z.object({
  code: z.literal("COMMAND_POLICY_DENIED"),
  message: z.literal(BASH_ERROR_MESSAGES.COMMAND_POLICY_DENIED),
  retryable: z.literal(false),
  details: commandPolicyDetailsSchema
}).strict();

const shellBackendUnavailableErrorSchema = z.object({
  code: z.literal("SHELL_BACKEND_UNAVAILABLE"),
  message: z.literal(BASH_ERROR_MESSAGES.SHELL_BACKEND_UNAVAILABLE),
  retryable: z.literal(false),
  details: backendDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(BASH_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(BASH_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const commandStartFailedErrorSchema = z.object({
  code: z.literal("COMMAND_START_FAILED"),
  message: z.literal(BASH_ERROR_MESSAGES.COMMAND_START_FAILED),
  retryable: z.literal(false),
  details: backendDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(BASH_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const bashErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  invalidArgumentErrorSchema,
  bashSessionConfigurationInvalidErrorSchema,
  bashSessionRequiredErrorSchema,
  bashSessionMismatchErrorSchema,
  commandPolicyDeniedErrorSchema,
  shellBackendUnavailableErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  commandStartFailedErrorSchema,
  internalErrorSchema
]);

export const bashOutputShape = {
  codexgpt_tool: z.literal("bash"),
  codexgpt_title: z.literal("Bash"),
  ok: z.boolean(),
  data: bashDataSchema.nullable(),
  error: bashErrorSchema.nullable(),
  meta: toolMetaSchema
};

const bashOutputBaseSchema = z.object(bashOutputShape).strict();

export const bashOutputSchema = bashOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful bash results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful bash results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed bash results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed bash results require an error object."
    });
  }
});

export type BashData = z.infer<typeof bashDataSchema>;
export type BashStructuredResult = z.infer<typeof bashOutputBaseSchema>;

export type BashFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "command"; reason: "empty" } }
  | { code: "BASH_SESSION_CONFIGURATION_INVALID"; details: { reason: "missing_server_session_id" } }
  | { code: "BASH_SESSION_REQUIRED"; details: { expected_session_id: string } }
  | { code: "BASH_SESSION_MISMATCH"; details: { expected_session_id: string } }
  | { code: "COMMAND_POLICY_DENIED"; details: { reason: "blocked_pattern" | "not_allowlisted" } }
  | { code: "SHELL_BACKEND_UNAVAILABLE"; details: { backend: "bash" } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "COMMAND_START_FAILED"; details: { backend: "bash" } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createBashSuccess(
  data: BashData,
  durationMs = 0
): BashStructuredResult {
  return bashOutputSchema.parse({
    codexgpt_tool: "bash",
    codexgpt_title: "Bash",
    ok: true,
    data: bashDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createBashFailure(
  failure: BashFailureInput,
  durationMs = 0
): BashStructuredResult {
  return bashOutputSchema.parse({
    codexgpt_tool: "bash",
    codexgpt_title: "Bash",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: BASH_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

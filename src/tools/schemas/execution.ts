import { z } from "zod";
import path from "node:path";
import { createToolMeta, toolMetaSchema } from "./common.js";

const safeOpaqueIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const processIdV1Schema = z.string().regex(/^process_[a-f0-9]{32}$/);
export const outputCursorV1Schema = z.string().min(16).max(2048);
export const PROCESS_STATES_V5 = [
  "starting",
  "running",
  "exited",
  "failed",
  "terminated"
] as const;
export const processStateV5Schema = z.enum(PROCESS_STATES_V5);
export type ProcessState = z.infer<typeof processStateV5Schema>;

const argumentSchema = z.string().max(8 * 1024);
const argumentListSchema = z.array(argumentSchema).max(512).superRefine((values, context) => {
  const total = values.reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  if (total > 64 * 1024) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Aggregate argument bytes exceed 64 KiB." });
  }
});

const argvCommandSchema = z.object({
  kind: z.literal("argv"),
  executable: z.string().min(1).max(32_767).refine(
    (value) => !/[\\/]/.test(value) || path.win32.isAbsolute(value),
    "Relative executable paths containing separators are not allowed."
  ),
  args: argumentListSchema.optional()
}).strict();

const powershellCommandSchema = z.object({
  kind: z.literal("powershell"),
  script: z.string().max(32 * 1024),
  edition: z.enum(["auto", "core", "windows"]).optional()
}).strict();

const bashCommandSchema = z.object({
  kind: z.literal("bash"),
  script: z.string().max(32 * 1024)
}).strict();

export const commandSpecV1Schema = z.discriminatedUnion("kind", [
  argvCommandSchema,
  powershellCommandSchema,
  bashCommandSchema
]);

export const executionCwdV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("workspace"),
    path: z.string().max(32_767).optional()
  }).strict(),
  z.object({
    kind: z.literal("absolute_local"),
    path: z.string().min(1).max(32_767)
  }).strict()
]);

const environmentSchema = z.record(z.string().min(1).max(32767), z.string().max(16 * 1024))
  .superRefine((value, context) => {
    const keys = Object.keys(value);
    if (keys.length > 64) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Environment entry limit exceeded." });
    }
    const folded = keys.map((key) => key.toLocaleUpperCase("en-US"));
    if (new Set(folded).size !== folded.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Windows environment keys must be unique case-insensitively." });
    }
    const total = Object.values(value).reduce((sum, item) => sum + Buffer.byteLength(item, "utf8"), 0);
    if (total > 16 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Aggregate environment value bytes exceed 16 KiB." });
    }
  });

const authorityModeSchema = z.enum(["full_access", "workspace"]);

const executionBaseInputShape = {
  command: commandSpecV1Schema,
  cwd: executionCwdV1Schema,
  environment: environmentSchema.optional(),
  mode: authorityModeSchema,
  timeout_ms: z.number().int().min(1).max(10 * 60_000).optional()
};

export const runCommandInputV1Schema = z.object(executionBaseInputShape).strict();

export const candidateVerificationInputV4Schema = z.object({
  merge_plan_id: z.string().regex(/^merge_[a-f0-9]{32}$/u),
  integration_workspace_id: z.string().regex(/^ws_[a-f0-9]{32}$/u),
  category: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/u)
}).strict();

export const runCommandInputV4Schema = z.object({
  ...executionBaseInputShape,
  verification: candidateVerificationInputV4Schema.optional()
}).strict();

export const startProcessInputV1Schema = z.object({
  ...executionBaseInputShape,
  terminal: z.enum(["pipes", "conpty"]).optional(),
  lifetime_ms: z.number().int().min(1).max(2 * 60 * 60_000).optional()
}).strict();

export const startProcessInputV4Schema = z.object({
  ...executionBaseInputShape,
  terminal: z.enum(["pipes", "conpty"]).optional(),
  lifetime_ms: z.number().int().min(1).max(2 * 60 * 60_000).optional(),
  verification: candidateVerificationInputV4Schema.optional()
}).strict();

export const readProcessOutputInputV1Schema = z.object({
  process_id: processIdV1Schema,
  cursor: outputCursorV1Schema.optional(),
  max_bytes: z.number().int().min(1).max(262_144).optional(),
  wait_ms: z.number().int().min(0).max(30_000).optional()
}).strict();

export const writeProcessInputV1Schema = z.object({
  process_id: processIdV1Schema,
  data: z.string().max(64 * 1024),
  close: z.boolean().optional()
}).strict();

export const interruptProcessInputV1Schema = z.object({
  process_id: processIdV1Schema
}).strict();

export const terminateProcessInputV1Schema = z.object({
  process_id: processIdV1Schema
}).strict();

export const resizeProcessTerminalInputV1Schema = z.object({
  process_id: processIdV1Schema,
  columns: z.number().int().min(1).max(500),
  rows: z.number().int().min(1).max(500)
}).strict();

export const listProcessesInputV1Schema = z.object({}).strict();

export const backendSummaryV1Schema = z.object({
  backend_id: safeOpaqueIdSchema,
  command_kind: z.enum(["argv", "powershell", "bash"]),
  executable_identity: z.string().regex(/^[a-f0-9]{64}$/),
  terminal: z.enum(["pipes", "conpty", "none"])
}).strict();

const fullAccessAuthoritySummaryV1Schema = z.object({
  mode: z.literal("full_access"),
  workspace_boundary_enforced: z.literal(false),
  filesystem_scope: z.literal("current_user_unrestricted"),
  filesystem_isolation: z.literal("none"),
  credential_isolation: z.literal("none"),
  registry_isolation: z.literal("none"),
  network_isolation: z.literal("none"),
  process_tree_control: z.literal("job_object_members_only"),
  broker_escape_resistance: z.literal("none"),
  host_writeback: z.literal("possible"),
  redaction: z.literal("best_effort_known_patterns")
}).strict();

const workspaceAuthoritySummaryV1Schema = z.object({
  mode: z.literal("workspace"),
  workspace_boundary_enforced: z.literal(true),
  filesystem_scope: z.literal("filtered_snapshot"),
  filesystem_isolation: z.literal("snapshot_private"),
  credential_isolation: z.literal("isolated"),
  registry_isolation: z.literal("protected_registry"),
  network_isolation: z.literal("deny_all"),
  process_tree_control: z.literal("sandbox_job"),
  broker_escape_resistance: z.literal("sandbox_proved"),
  host_writeback: z.literal("none"),
  redaction: z.literal("best_effort_known_patterns")
}).strict();

export const authoritySummaryV1Schema = z.discriminatedUnion("mode", [
  fullAccessAuthoritySummaryV1Schema,
  workspaceAuthoritySummaryV1Schema
]);

export const outputChunkV1Schema = z.object({
  stream: z.enum(["stdout", "stderr", "terminal"]),
  text: z.string(),
  bytes: z.number().int().nonnegative()
}).strict();

export const outputPageV1Schema = z.object({
  chunks: z.array(outputChunkV1Schema).max(4096),
  next_cursor: outputCursorV1Schema.nullable(),
  truncated: z.boolean(),
  eof: z.boolean(),
  returned_bytes: z.number().int().nonnegative().max(262_144)
}).strict();

export const terminationReasonV1Schema = z.enum([
  "timeout",
  "user_terminated",
  "output_limit_exceeded",
  "policy_revoked",
  "evidence_revoked",
  "transport_closed",
  "lease_revoked",
  "host_crashed"
]);

export const runCommandDataV1Schema = z.object({
  process_id: processIdV1Schema,
  status: z.enum(["exited", "failed", "terminated"]),
  exit_code: z.number().int().nullable(),
  termination_reason: terminationReasonV1Schema.nullable(),
  backend: backendSummaryV1Schema,
  authority: authoritySummaryV1Schema,
  output: outputPageV1Schema,
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true })
}).strict();

export const runCommandDataV4Schema = runCommandDataV1Schema.extend({
  verification_receipt: z.string().regex(/^verify_[A-Za-z0-9_-]+$/u).nullable()
}).strict();

function requireEqualProcessStateAliases<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: { state?: unknown; status?: unknown }, context) => {
    if (value.state !== value.status) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "V5 process state must equal the status compatibility alias."
      });
    }
  });
}

export const runCommandDataV5Schema = requireEqualProcessStateAliases(
  runCommandDataV4Schema.extend({ state: processStateV5Schema }).strict()
).superRefine((value, context) => {
  if (value.state === "starting" || value.state === "running") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["state"],
      message: "A bounded command result must be terminal."
    });
  }
});

export const startProcessDataV1Schema = z.object({
  process_id: processIdV1Schema,
  status: z.enum(["running", "exited", "failed"]),
  backend: backendSummaryV1Schema,
  authority: authoritySummaryV1Schema,
  started_at: z.string().datetime({ offset: true }),
  absolute_expires_at: z.string().datetime({ offset: true })
}).strict();

export const startProcessDataV5Schema = requireEqualProcessStateAliases(
  startProcessDataV1Schema.extend({
    state: z.literal("running"),
    status: z.literal("running")
  }).strict()
);

const processStateDataV1Schema = z.object({
  process_id: processIdV1Schema,
  status: z.enum(["running", "exited", "failed", "terminated"])
}).strict();

export const readProcessOutputDataV1Schema = processStateDataV1Schema.extend({
  output: outputPageV1Schema
}).strict();

export const readProcessOutputDataV4Schema = readProcessOutputDataV1Schema.extend({
  exit_code: z.number().int().nullable(),
  verification_receipt: z.string().regex(/^verify_[A-Za-z0-9_-]+$/u).nullable()
}).strict();

export const readProcessOutputDataV5Schema = requireEqualProcessStateAliases(
  readProcessOutputDataV4Schema.extend({ state: processStateV5Schema }).strict()
);

export const processActionDataV5Schema = requireEqualProcessStateAliases(
  processStateDataV1Schema.extend({ state: processStateV5Schema }).strict()
);

export const listProcessesDataV1Schema = z.object({
  processes: z.array(z.object({
    process_id: processIdV1Schema,
    status: z.enum(["running", "exited", "failed", "terminated"]),
    mode: authorityModeSchema,
    terminal: z.enum(["pipes", "conpty", "none"]),
    started_at: z.string().datetime({ offset: true }),
    absolute_expires_at: z.string().datetime({ offset: true }).nullable()
  }).strict()).max(32),
  process_count: z.number().int().nonnegative().max(32)
}).strict().superRefine((value, context) => {
  if (value.process_count !== value.processes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["process_count"], message: "Process count is inconsistent." });
  }
});

const listProcessItemV5Schema = requireEqualProcessStateAliases(z.object({
  process_id: processIdV1Schema,
  state: processStateV5Schema,
  status: processStateV5Schema,
  mode: authorityModeSchema,
  terminal: z.enum(["pipes", "conpty", "none"]),
  started_at: z.string().datetime({ offset: true }),
  absolute_expires_at: z.string().datetime({ offset: true }).nullable()
}).strict());

export const listProcessesDataV5Schema = z.object({
  processes: z.array(listProcessItemV5Schema).max(32),
  process_count: z.number().int().nonnegative().max(32)
}).strict().superRefine((value, context) => {
  if (value.process_count !== value.processes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["process_count"], message: "Process count is inconsistent." });
  }
});

export const EXECUTION_ERROR_MESSAGES = Object.freeze({
  APPROVAL_REQUIRED: "Local approval is required before this action can run.",
  APPROVAL_QUEUE_FULL: "The local approval queue is full. Retry later.",
  BACKEND_STALE: "The approved execution backend changed before use.",
  BACKEND_UNAVAILABLE: "The requested execution backend is unavailable.",
  EXECUTION_PROFILE_DISABLED: "The requested execution profile is disabled.",
  EXECUTION_QUOTA_EXCEEDED: "The execution quota is exhausted.",
  HOST_PROTOCOL_ERROR: "The native execution host rejected the protocol exchange.",
  HOST_UNAVAILABLE: "The native execution host is unavailable.",
  INTERRUPT_UNSUPPORTED: "The requested interrupt is unsupported for this process.",
  NETWORK_ENFORCEMENT_UNAVAILABLE: "The requested network policy cannot be enforced.",
  OUTPUT_LIMIT_EXCEEDED: "The process exceeded its bounded output allowance.",
  PROCESS_NOT_FOUND: "The process was not found in this context.",
  PROCESS_POLICY_UNENFORCEABLE: "The requested process policy cannot be enforced.",
  PROCESS_SANDBOX_UNAVAILABLE: "The requested process sandbox is unavailable.",
  SHELL_SANDBOX_UNAVAILABLE: "The requested shell sandbox is unavailable.",
  TERMINAL_NOT_AVAILABLE: "The requested terminal backend is unavailable.",
  INTERNAL_ERROR: "The execution action failed because of an internal error."
});

export type ExecutionErrorCode = keyof typeof EXECUTION_ERROR_MESSAGES;

const executionErrorCodeSchema = z.enum(
  Object.keys(EXECUTION_ERROR_MESSAGES) as [ExecutionErrorCode, ...ExecutionErrorCode[]]
);

export const executionErrorV1Schema = z.object({
  code: executionErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.object({
    approval_id: safeOpaqueIdSchema.optional(),
    server_id: safeOpaqueIdSchema.optional(),
    next_action: z.string().min(1).max(240).optional()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.message !== EXECUTION_ERROR_MESSAGES[value.code]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Execution error message is not canonical." });
  }
});

const EXECUTION_TITLES = Object.freeze({
  run_command: "Run Command",
  start_process: "Start Process",
  read_process_output: "Read Process Output",
  write_process_input: "Write Process Input",
  interrupt_process: "Interrupt Process",
  terminate_process: "Terminate Process",
  resize_process_terminal: "Resize Process Terminal",
  list_processes: "List Processes"
} as const);

export type ExecutionToolName = keyof typeof EXECUTION_TITLES;

function executionOutputShape<Name extends ExecutionToolName, Data extends z.ZodTypeAny>(
  name: Name,
  data: Data
) {
  return {
    codexgpt_tool: z.literal(name),
    codexgpt_title: z.literal(EXECUTION_TITLES[name]),
    ok: z.boolean(),
    data: data.nullable(),
    error: executionErrorV1Schema.nullable(),
    meta: toolMetaSchema
  };
}

function outputSchema(shape: ReturnType<typeof executionOutputShape>) {
  return z.object(shape).strict().superRefine((value, context) => {
    if (value.ok && (value.data === null || value.error !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Execution success fields are inconsistent." });
    }
    if (!value.ok && (value.data !== null || value.error === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Execution failure fields are inconsistent." });
    }
  });
}

export const runCommandOutputShape = executionOutputShape("run_command", runCommandDataV1Schema);
export const runCommandOutputShapeV4 = executionOutputShape("run_command", runCommandDataV4Schema);
export const startProcessOutputShape = executionOutputShape("start_process", startProcessDataV1Schema);
export const readProcessOutputOutputShape = executionOutputShape("read_process_output", readProcessOutputDataV1Schema);
export const readProcessOutputOutputShapeV4 = executionOutputShape("read_process_output", readProcessOutputDataV4Schema);
export const writeProcessInputOutputShape = executionOutputShape("write_process_input", processStateDataV1Schema);
export const interruptProcessOutputShape = executionOutputShape("interrupt_process", processStateDataV1Schema);
export const terminateProcessOutputShape = executionOutputShape("terminate_process", processStateDataV1Schema);
export const resizeProcessTerminalOutputShape = executionOutputShape("resize_process_terminal", processStateDataV1Schema);
export const listProcessesOutputShape = executionOutputShape("list_processes", listProcessesDataV1Schema);
export const runCommandOutputShapeV5 = executionOutputShape("run_command", runCommandDataV5Schema);
export const startProcessOutputShapeV5 = executionOutputShape("start_process", startProcessDataV5Schema);
export const readProcessOutputOutputShapeV5 = executionOutputShape("read_process_output", readProcessOutputDataV5Schema);
export const writeProcessInputOutputShapeV5 = executionOutputShape("write_process_input", processActionDataV5Schema);
export const interruptProcessOutputShapeV5 = executionOutputShape("interrupt_process", processActionDataV5Schema);
export const terminateProcessOutputShapeV5 = executionOutputShape("terminate_process", processActionDataV5Schema);
export const resizeProcessTerminalOutputShapeV5 = executionOutputShape("resize_process_terminal", processActionDataV5Schema);
export const listProcessesOutputShapeV5 = executionOutputShape("list_processes", listProcessesDataV5Schema);

export const runCommandOutputSchema = outputSchema(runCommandOutputShape);
export const runCommandOutputSchemaV4 = outputSchema(runCommandOutputShapeV4);
export const startProcessOutputSchema = outputSchema(startProcessOutputShape);
export const readProcessOutputOutputSchema = outputSchema(readProcessOutputOutputShape);
export const readProcessOutputOutputSchemaV4 = outputSchema(readProcessOutputOutputShapeV4);
export const writeProcessInputOutputSchema = outputSchema(writeProcessInputOutputShape);
export const interruptProcessOutputSchema = outputSchema(interruptProcessOutputShape);
export const terminateProcessOutputSchema = outputSchema(terminateProcessOutputShape);
export const resizeProcessTerminalOutputSchema = outputSchema(resizeProcessTerminalOutputShape);
export const listProcessesOutputSchema = outputSchema(listProcessesOutputShape);
export const runCommandOutputSchemaV5 = outputSchema(runCommandOutputShapeV5);
export const startProcessOutputSchemaV5 = outputSchema(startProcessOutputShapeV5);
export const readProcessOutputOutputSchemaV5 = outputSchema(readProcessOutputOutputShapeV5);
export const writeProcessInputOutputSchemaV5 = outputSchema(writeProcessInputOutputShapeV5);
export const interruptProcessOutputSchemaV5 = outputSchema(interruptProcessOutputShapeV5);
export const terminateProcessOutputSchemaV5 = outputSchema(terminateProcessOutputShapeV5);
export const resizeProcessTerminalOutputSchemaV5 = outputSchema(resizeProcessTerminalOutputShapeV5);
export const listProcessesOutputSchemaV5 = outputSchema(listProcessesOutputShapeV5);

export const EXECUTION_OUTPUT_SCHEMAS = Object.freeze({
  run_command: runCommandOutputSchema,
  start_process: startProcessOutputSchema,
  read_process_output: readProcessOutputOutputSchema,
  write_process_input: writeProcessInputOutputSchema,
  interrupt_process: interruptProcessOutputSchema,
  terminate_process: terminateProcessOutputSchema,
  resize_process_terminal: resizeProcessTerminalOutputSchema,
  list_processes: listProcessesOutputSchema
});

export const EXECUTION_OUTPUT_SCHEMAS_V4 = Object.freeze({
  ...EXECUTION_OUTPUT_SCHEMAS,
  run_command: runCommandOutputSchemaV4,
  read_process_output: readProcessOutputOutputSchemaV4
});

export const EXECUTION_OUTPUT_SCHEMAS_V5 = Object.freeze({
  ...EXECUTION_OUTPUT_SCHEMAS_V4,
  run_command: runCommandOutputSchemaV5,
  start_process: startProcessOutputSchemaV5,
  read_process_output: readProcessOutputOutputSchemaV5,
  write_process_input: writeProcessInputOutputSchemaV5,
  interrupt_process: interruptProcessOutputSchemaV5,
  terminate_process: terminateProcessOutputSchemaV5,
  resize_process_terminal: resizeProcessTerminalOutputSchemaV5,
  list_processes: listProcessesOutputSchemaV5
});

export function createExecutionFailure(
  toolName: ExecutionToolName,
  code: ExecutionErrorCode,
  details: { approval_id?: string; server_id?: string; next_action?: string } = {},
  durationMs = 0
): Record<string, unknown> {
  return EXECUTION_OUTPUT_SCHEMAS[toolName].parse({
    codexgpt_tool: toolName,
    codexgpt_title: EXECUTION_TITLES[toolName],
    ok: false,
    data: null,
    error: {
      code,
      message: EXECUTION_ERROR_MESSAGES[code],
      retryable: code === "APPROVAL_QUEUE_FULL" || code === "HOST_UNAVAILABLE",
      details
    },
    meta: createToolMeta(durationMs)
  }) as Record<string, unknown>;
}

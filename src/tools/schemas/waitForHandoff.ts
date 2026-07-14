import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const WAIT_FOR_HANDOFF_DEADLINE_WARNING =
  "No matching terminal handoff state was observed before the wait deadline." as const;
export const WAIT_FOR_HANDOFF_ARTIFACT_UNAVAILABLE_WARNING =
  "Some requested handoff artifacts could not be read safely." as const;
export const WAIT_FOR_HANDOFF_LIMITED_WARNING =
  "Handoff excerpts were limited by the configured byte bounds." as const;
export const WAIT_FOR_HANDOFF_REDACTED_WARNING =
  "Secret-looking content was redacted from the returned handoff result." as const;

export const WAIT_FOR_HANDOFF_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  HANDOFF_STATE_READ_FAILED: "The handoff run state could not be read safely.",
  HANDOFF_STATE_INVALID: "The handoff run state is not a valid version-1 lifecycle record.",
  HANDOFF_ARTIFACT_READ_FAILED: "The handoff result artifacts could not be read safely.",
  INTERNAL_ERROR: "The handoff wait failed because of an internal error."
} as const;

export const WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS = [
  { name: "agent-status.md", kind: "status", excerptBytes: 6_000, tailLines: null },
  { name: "implementation-diff.patch", kind: "diff", excerptBytes: 12_000, tailLines: null },
  { name: "execution-log.jsonl", kind: "log", excerptBytes: 6_000, tailLines: 20 },
  { name: "loop-tests.txt", kind: "tests", excerptBytes: 4_000, tailLines: null }
] as const;

const artifactKindValues = WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS.map((item) => item.kind) as [
  (typeof WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS)[number]["kind"],
  ...(typeof WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS)[number]["kind"][]
];

export const waitForHandoffArtifactKindSchema = z.enum(artifactKindValues);
export const waitForHandoffRunStateSchema = z.enum(["running", "completed", "failed", "timed_out"]);
export const waitForHandoffUnavailableReasonSchema = z.enum([
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

function isSafeRelativeDirectory(value: string): boolean {
  if (value.trim() !== value || value.length === 0 || value.length > 240) return false;
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

export const waitForHandoffContextDirSchema = z.string().refine(
  isSafeRelativeDirectory,
  "Context directory must be a safe workspace-relative directory."
);

const safeRelativePathSchema = z.string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value, "Path cannot have surrounding whitespace.")
  .refine((value) => !value.includes("\\") && !value.includes(":"), "Path must use safe relative POSIX syntax.")
  .refine((value) => !value.startsWith("/") && !/[\r\n\u0000-\u001f\u007f]/.test(value), "Path must be safe and relative.")
  .refine((value) => value.split("/").every((segment) => segment && segment !== "." && segment !== ".."), "Path cannot traverse.");

const safeIdentifierSchema = z.string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, "Identifier cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Identifier must be one line.");

const safeExecutorSchema = safeIdentifierSchema;
const safeModelSchema = z.string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value, "Model cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Model must be one line.");
const isoDateTimeSchema = z.string().datetime({ offset: true });

export function waitForHandoffLineCount(text: string): number {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
  return breaks + (/\r\n$|[\n\r]$/.test(text) ? 0 : 1);
}

export const waitForHandoffRunSchema = z.object({
  version: z.literal(1),
  state: waitForHandoffRunStateSchema,
  iteration: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  plan_hash: safeIdentifierSchema,
  started_at: isoDateTimeSchema,
  finished_at: isoDateTimeSchema.nullable(),
  updated_at: isoDateTimeSchema.nullable(),
  executor: safeExecutorSchema,
  model: safeModelSchema.nullable(),
  exit_code: z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable(),
  timed_out: z.boolean(),
  duration_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  redacted: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.state === "running") {
    if (value.finished_at !== null || value.exit_code !== null || value.duration_ms !== null || value.timed_out) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "Running state cannot contain terminal result fields."
      });
    }
    return;
  }
  if (value.finished_at === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finished_at"],
      message: "Terminal state requires a finish time."
    });
  }
  if (value.state === "completed" && (value.exit_code !== 0 || value.timed_out)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exit_code"],
      message: "Completed state requires exit code zero and timed_out=false."
    });
  }
  if (value.state === "failed" && (value.exit_code === 0 || value.timed_out)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exit_code"],
      message: "Failed state cannot claim success or timeout."
    });
  }
  if (value.state === "timed_out" && (value.exit_code !== null || !value.timed_out)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timed_out"],
      message: "Timed-out state requires a null exit code and timed_out=true."
    });
  }
});

export const waitForHandoffArtifactSchema = z.object({
  path: safeRelativePathSchema,
  kind: waitForHandoffArtifactKindSchema,
  source_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  line_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  returned_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  truncated: z.boolean(),
  redacted: z.boolean(),
  text: z.string().max(200_000)
}).strict().superRefine((value, context) => {
  if (value.returned_bytes !== Buffer.byteLength(value.text, "utf8")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "returned_bytes must match the returned UTF-8 text."
    });
  }
  if (value.line_count !== waitForHandoffLineCount(value.text)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["line_count"],
      message: "line_count must match the returned text."
    });
  }
  if (!value.truncated && !value.redacted && value.returned_bytes > value.source_bytes * 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "Complete unredacted decoded text exceeds the maximum UTF-8 replacement expansion."
    });
  }
});

export const waitForHandoffUnavailableSchema = z.object({
  path: safeRelativePathSchema,
  kind: waitForHandoffArtifactKindSchema,
  reason: waitForHandoffUnavailableReasonSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
}).strict().superRefine((value, context) => {
  if ((value.reason === "missing" || value.reason === "blocked") && value.bytes !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} artifacts cannot expose a byte count.`
    });
  }
  if ((value.reason === "too_large" || value.reason === "output_limit") && value.bytes === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: `${value.reason} artifacts require an observed byte count.`
    });
  }
});

export const waitForHandoffArtifactPathsSchema = z.object({
  status: safeRelativePathSchema,
  diff: safeRelativePathSchema,
  log: safeRelativePathSchema,
  tests: safeRelativePathSchema
}).strict();

export const waitForHandoffDataSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1),
  context_dir: waitForHandoffContextDirSchema,
  state_file: safeRelativePathSchema,
  artifact_paths: waitForHandoffArtifactPathsSchema,
  state_present: z.boolean(),
  state: z.enum(["unknown", "running", "completed", "failed", "timed_out"]),
  wait_outcome: z.enum(["matched_terminal", "deadline"]),
  awaited_terminal: z.boolean(),
  awaited_completed: z.boolean(),
  succeeded: z.boolean(),
  expected_plan_hash: safeIdentifierSchema.nullable(),
  since_iteration: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  plan_hash_mismatch: z.boolean(),
  iteration_stale: z.boolean(),
  max_wait_seconds: z.number().int().min(1).max(60),
  poll_ms: z.number().int().min(250).max(5_000),
  next_poll_after_seconds: z.number().int().min(1).max(5).nullable(),
  max_state_bytes: z.number().int().min(1).max(64_000),
  max_artifact_bytes: z.number().int().min(1).max(80_000),
  max_total_bytes: z.number().int().min(1).max(40_000),
  run: waitForHandoffRunSchema.nullable(),
  requested_artifacts: z.array(waitForHandoffArtifactKindSchema).min(1).max(4),
  artifacts: z.array(waitForHandoffArtifactSchema).max(4),
  artifact_count: z.number().int().min(0).max(4),
  unavailable: z.array(waitForHandoffUnavailableSchema).max(4),
  unavailable_count: z.number().int().min(0).max(4),
  returned_bytes: z.number().int().min(0).max(40_000),
  output_limited: z.boolean(),
  redacted: z.boolean()
}).strict().superRefine((value, context) => {
  const definitions = WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS.map((definition, index) => ({
    ...definition,
    index,
    path: `${value.context_dir}/${definition.name}`
  }));
  const byKind = new Map(definitions.map((definition) => [definition.kind, definition]));
  const expectedStateFile = `${value.context_dir}/handoff-run-state.json`;
  const expectedPaths = {
    status: definitions[0].path,
    diff: definitions[1].path,
    log: definitions[2].path,
    tests: definitions[3].path
  };
  if (value.state_file !== expectedStateFile) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state_file"], message: "state_file must be the fixed handoff run-state path." });
  }
  for (const kind of artifactKindValues) {
    if (value.artifact_paths[kind] !== expectedPaths[kind]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact_paths", kind], message: "Artifact path must match the fixed allowlist." });
    }
  }

  const requestedIndices = value.requested_artifacts.map((kind) => byKind.get(kind)?.index ?? -1);
  if (
    value.requested_artifacts[0] !== "status" ||
    new Set(value.requested_artifacts).size !== value.requested_artifacts.length ||
    requestedIndices.some((item, index) => index > 0 && item <= requestedIndices[index - 1])
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requested_artifacts"],
      message: "Requested artifacts must be the fixed-order subset beginning with status."
    });
  }

  if (value.state_present !== (value.run !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state_present"], message: "state_present must match run presence." });
  }
  const expectedHashMismatch = Boolean(value.expected_plan_hash && value.run && value.run.plan_hash !== value.expected_plan_hash);
  const expectedIterationStale = Boolean(value.since_iteration !== null && value.run && value.run.iteration <= value.since_iteration);
  if (value.plan_hash_mismatch !== expectedHashMismatch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["plan_hash_mismatch"], message: "plan_hash_mismatch must match the observed run." });
  }
  if (value.iteration_stale !== expectedIterationStale) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["iteration_stale"], message: "iteration_stale must match the observed run." });
  }
  const runTerminal = Boolean(value.run && value.run.state !== "running");
  const expectedMatched = runTerminal && !expectedHashMismatch && !expectedIterationStale;
  const expectedOutcome = expectedMatched ? "matched_terminal" : "deadline";
  if (value.wait_outcome !== expectedOutcome) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["wait_outcome"], message: "wait_outcome must match lifecycle and filters." });
  }
  const expectedAwaitedTerminal = expectedMatched;
  const expectedCompleted = expectedMatched && value.run?.state === "completed";
  if (value.awaited_terminal !== expectedAwaitedTerminal) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["awaited_terminal"], message: "awaited_terminal must match wait_outcome." });
  }
  if (value.awaited_completed !== expectedCompleted || value.succeeded !== expectedCompleted) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["awaited_completed"], message: "Completion flags must match a completed awaited run." });
  }
  const expectedPublicState = expectedMatched
    ? value.run?.state ?? "unknown"
    : value.run
      ? "running"
      : "unknown";
  if (value.state !== expectedPublicState) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "state must be the exact wait-facing state." });
  }
  const expectedNextPoll = expectedMatched ? null : Math.max(1, Math.ceil(value.poll_ms / 1_000));
  if (value.next_poll_after_seconds !== expectedNextPoll) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["next_poll_after_seconds"], message: "next poll hint must match poll_ms and wait outcome." });
  }

  const identities: string[] = [];
  let priorArtifactIndex = -1;
  for (const [index, artifact] of value.artifacts.entries()) {
    const definition = byKind.get(artifact.kind);
    if (!definition || definition.path !== artifact.path || !value.requested_artifacts.includes(artifact.kind)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index], message: "Artifact must match a requested fixed path and kind." });
      continue;
    }
    if (definition.index <= priorArtifactIndex) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index], message: "Artifacts must preserve fixed order." });
    }
    priorArtifactIndex = definition.index;
    if (artifact.source_bytes > value.max_artifact_bytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "source_bytes"], message: "Readable source exceeds max_artifact_bytes." });
    }
    if (artifact.returned_bytes > definition.excerptBytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "returned_bytes"], message: "Returned excerpt exceeds its kind bound." });
    }
    identities.push(artifact.kind);
  }

  let priorUnavailableIndex = -1;
  for (const [index, unavailable] of value.unavailable.entries()) {
    const definition = byKind.get(unavailable.kind);
    if (!definition || definition.path !== unavailable.path || !value.requested_artifacts.includes(unavailable.kind)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable", index], message: "Unavailable item must match a requested fixed path and kind." });
      continue;
    }
    if (definition.index <= priorUnavailableIndex) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable", index], message: "Unavailable items must preserve fixed order." });
    }
    priorUnavailableIndex = definition.index;
    if (unavailable.reason === "too_large" && unavailable.bytes !== null && unavailable.bytes <= value.max_artifact_bytes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable", index, "bytes"], message: "too_large bytes must exceed max_artifact_bytes." });
    }
    identities.push(unavailable.kind);
  }

  if (expectedMatched) {
    if (
      identities.length !== value.requested_artifacts.length ||
      new Set(identities).size !== identities.length ||
      value.requested_artifacts.some((kind) => !identities.includes(kind))
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "Every requested terminal artifact must have exactly one outcome." });
    }
  } else if (value.artifacts.length || value.unavailable.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "Pending waits cannot return terminal artifacts." });
  }

  if (value.artifact_count !== value.artifacts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact_count"], message: "artifact_count must match artifacts length." });
  }
  if (value.unavailable_count !== value.unavailable.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unavailable_count"], message: "unavailable_count must match unavailable length." });
  }
  const expectedReturnedBytes = value.artifacts.reduce((sum, artifact) => sum + artifact.returned_bytes, 0);
  if (value.returned_bytes !== expectedReturnedBytes || value.returned_bytes > value.max_total_bytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["returned_bytes"], message: "returned_bytes must match artifact bytes within max_total_bytes." });
  }
  const expectedLimited = value.artifacts.some((artifact) => artifact.truncated) || value.unavailable.some((item) =>
    item.reason === "too_large" || item.reason === "output_limit"
  );
  if (value.output_limited !== expectedLimited) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["output_limited"], message: "output_limited must match truncation and unavailable reasons." });
  }
  const expectedRedacted = Boolean(value.run?.redacted) || value.artifacts.some((artifact) => artifact.redacted);
  if (value.redacted !== expectedRedacted) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["redacted"], message: "redacted must match run and artifact redaction." });
  }
});

const emptyDetailsSchema = z.object({}).strict();
const workspaceNotFoundDetailsSchema = z.union([
  z.object({ source: z.literal("workspace_id"), workspace_id: safeWorkspaceIdSchema }).strict(),
  z.object({ source: z.literal("default_workspace"), workspace_id: z.null() }).strict()
]);
const stateReadFailedDetailsSchema = z.object({
  context_dir: waitForHandoffContextDirSchema,
  state_file: safeRelativePathSchema
}).strict();
const stateInvalidDetailsSchema = z.object({ state_file: safeRelativePathSchema }).strict();
const artifactReadFailedDetailsSchema = z.object({ context_dir: waitForHandoffContextDirSchema }).strict();

export const waitForHandoffErrorSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("WORKSPACE_NOT_FOUND"),
    message: z.literal(WAIT_FOR_HANDOFF_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
    retryable: z.literal(false),
    details: workspaceNotFoundDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("HANDOFF_STATE_READ_FAILED"),
    message: z.literal(WAIT_FOR_HANDOFF_ERROR_MESSAGES.HANDOFF_STATE_READ_FAILED),
    retryable: z.literal(false),
    details: stateReadFailedDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("HANDOFF_STATE_INVALID"),
    message: z.literal(WAIT_FOR_HANDOFF_ERROR_MESSAGES.HANDOFF_STATE_INVALID),
    retryable: z.literal(true),
    details: stateInvalidDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("HANDOFF_ARTIFACT_READ_FAILED"),
    message: z.literal(WAIT_FOR_HANDOFF_ERROR_MESSAGES.HANDOFF_ARTIFACT_READ_FAILED),
    retryable: z.literal(false),
    details: artifactReadFailedDetailsSchema
  }).strict(),
  z.object({
    code: z.literal("INTERNAL_ERROR"),
    message: z.literal(WAIT_FOR_HANDOFF_ERROR_MESSAGES.INTERNAL_ERROR),
    retryable: z.literal(false),
    details: emptyDetailsSchema
  }).strict()
]);

export const waitForHandoffOutputShape = {
  codexpro_tool: z.literal("wait_for_handoff"),
  codexpro_title: z.literal("Wait For Handoff"),
  ok: z.boolean(),
  data: waitForHandoffDataSchema.nullable(),
  error: waitForHandoffErrorSchema.nullable(),
  meta: toolMetaSchema
};

const waitForHandoffOutputBaseSchema = z.object(waitForHandoffOutputShape).strict();

function waitForHandoffWarnings(data: WaitForHandoffData): string[] {
  const warnings: string[] = [];
  if (data.wait_outcome === "deadline") warnings.push(WAIT_FOR_HANDOFF_DEADLINE_WARNING);
  if (data.unavailable.some((item) =>
    item.reason === "blocked" || item.reason === "not_text" || item.reason === "read_failed"
  )) {
    warnings.push(WAIT_FOR_HANDOFF_ARTIFACT_UNAVAILABLE_WARNING);
  }
  if (data.output_limited) warnings.push(WAIT_FOR_HANDOFF_LIMITED_WARNING);
  if (data.redacted) warnings.push(WAIT_FOR_HANDOFF_REDACTED_WARNING);
  return warnings;
}

export const waitForHandoffOutputSchema = waitForHandoffOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null || value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ok"], message: "Successful results require data and no error." });
      return;
    }
    const expectedWarnings = waitForHandoffWarnings(value.data);
    if (
      value.meta.warnings.length !== expectedWarnings.length ||
      value.meta.warnings.some((warning, index) => warning !== expectedWarnings[index])
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "Warnings must match derived wait state." });
    }
    return;
  }
  if (value.data !== null || value.error === null || value.meta.warnings.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ok"], message: "Failure results require only an error and no warnings." });
  }
});

export type WaitForHandoffArtifactKind = z.infer<typeof waitForHandoffArtifactKindSchema>;
export type WaitForHandoffRunState = z.infer<typeof waitForHandoffRunStateSchema>;
export type WaitForHandoffUnavailableReason = z.infer<typeof waitForHandoffUnavailableReasonSchema>;
export type WaitForHandoffRun = z.infer<typeof waitForHandoffRunSchema>;
export type WaitForHandoffArtifact = z.infer<typeof waitForHandoffArtifactSchema>;
export type WaitForHandoffUnavailable = z.infer<typeof waitForHandoffUnavailableSchema>;
export type WaitForHandoffData = z.infer<typeof waitForHandoffDataSchema>;
export type WaitForHandoffOutput = z.infer<typeof waitForHandoffOutputSchema>;

export type WaitForHandoffFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: z.infer<typeof workspaceNotFoundDetailsSchema> }
  | { code: "HANDOFF_STATE_READ_FAILED"; details: z.infer<typeof stateReadFailedDetailsSchema> }
  | { code: "HANDOFF_STATE_INVALID"; details: z.infer<typeof stateInvalidDetailsSchema> }
  | { code: "HANDOFF_ARTIFACT_READ_FAILED"; details: z.infer<typeof artifactReadFailedDetailsSchema> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createWaitForHandoffSuccess(
  data: WaitForHandoffData,
  durationMs = 0
): WaitForHandoffOutput {
  const parsedData = waitForHandoffDataSchema.parse(data);
  return waitForHandoffOutputSchema.parse({
    codexpro_tool: "wait_for_handoff",
    codexpro_title: "Wait For Handoff",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, waitForHandoffWarnings(parsedData))
  });
}

export function createWaitForHandoffFailure(
  failure: WaitForHandoffFailureInput,
  durationMs = 0
): WaitForHandoffOutput {
  const retryable = failure.code === "HANDOFF_STATE_INVALID";
  return waitForHandoffOutputSchema.parse({
    codexpro_tool: "wait_for_handoff",
    codexpro_title: "Wait For Handoff",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: WAIT_FOR_HANDOFF_ERROR_MESSAGES[failure.code],
      retryable,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const READ_HANDOFF_UNAVAILABLE_WARNING =
  "Some handoff artifacts could not be read safely." as const;
export const READ_HANDOFF_LIMITED_WARNING =
  "Handoff output was limited by the configured byte bounds." as const;
export const READ_HANDOFF_REDACTED_WARNING =
  "Secret-looking content was redacted from returned handoff artifacts." as const;

export const READ_HANDOFF_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  HANDOFF_READ_FAILED: "The handoff context could not be read safely.",
  INTERNAL_ERROR: "The handoff reader failed because of an internal error."
} as const;

export const READ_HANDOFF_ARTIFACT_DEFINITIONS = [
  { name: "current-plan.md", kind: "plan" },
  { name: "agent-status.md", kind: "agent_status" },
  { name: "implementation-diff.patch", kind: "implementation_diff" },
  { name: "codex-status.md", kind: "codex_status" },
  { name: "decisions.md", kind: "decisions" },
  { name: "open-questions.md", kind: "open_questions" },
  { name: "execution-log.jsonl", kind: "execution_log" }
] as const;

const artifactKindValues = READ_HANDOFF_ARTIFACT_DEFINITIONS.map((item) => item.kind) as [
  (typeof READ_HANDOFF_ARTIFACT_DEFINITIONS)[number]["kind"],
  ...(typeof READ_HANDOFF_ARTIFACT_DEFINITIONS)[number]["kind"][]
];

export const readHandoffArtifactKindSchema = z.enum(artifactKindValues);
export const readHandoffUnavailableReasonSchema = z.enum([
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

export const readHandoffContextDirSchema = z.string().refine(
  isSafeRelativeDirectory,
  "Context directory must be a safe workspace-relative directory."
);

const safeArtifactPathSchema = z.string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes("\\") && !value.includes(":"), "Artifact path must use safe relative POSIX syntax.")
  .refine((value) => !value.startsWith("/") && !/[\r\n\u0000-\u001f\u007f]/.test(value), "Artifact path must be safe and relative.");

export function readHandoffLineCount(text: string): number {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
  return breaks + (/\r\n$|[\n\r]$/.test(text) ? 0 : 1);
}

export const readHandoffArtifactSchema = z.object({
  path: safeArtifactPathSchema,
  kind: readHandoffArtifactKindSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  line_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  returned_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  redacted: z.boolean(),
  text: z.string().max(2_000_000)
}).strict().superRefine((value, context) => {
  const expectedReturnedBytes = Buffer.byteLength(value.text, "utf8");
  if (value.returned_bytes !== expectedReturnedBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "returned_bytes must match the returned UTF-8 text."
    });
  }
  const expectedLines = readHandoffLineCount(value.text);
  if (value.line_count !== expectedLines) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["line_count"],
      message: "line_count must match the complete returned text."
    });
  }
  if (value.bytes === 0 && (value.text !== "" || value.returned_bytes !== 0 || value.line_count !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Zero-byte artifacts must return an empty body."
    });
  }
  if (!value.redacted && value.returned_bytes > value.bytes * 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "Unredacted decoded text exceeds the maximum UTF-8 replacement expansion."
    });
  }
});

export const readHandoffUnavailableSchema = z.object({
  path: safeArtifactPathSchema,
  kind: readHandoffArtifactKindSchema,
  reason: readHandoffUnavailableReasonSchema,
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

export const readHandoffDataSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1),
  context_dir: readHandoffContextDirSchema,
  context_exists: z.boolean(),
  max_file_bytes: z.number().int().min(1).max(80_000),
  max_total_bytes: z.number().int().min(1).max(240_000),
  artifacts: z.array(readHandoffArtifactSchema).max(READ_HANDOFF_ARTIFACT_DEFINITIONS.length),
  files: z.array(safeArtifactPathSchema).max(READ_HANDOFF_ARTIFACT_DEFINITIONS.length),
  file_count: z.number().int().min(0).max(READ_HANDOFF_ARTIFACT_DEFINITIONS.length),
  unavailable: z.array(readHandoffUnavailableSchema).max(READ_HANDOFF_ARTIFACT_DEFINITIONS.length),
  unavailable_count: z.number().int().min(0).max(READ_HANDOFF_ARTIFACT_DEFINITIONS.length),
  loaded_bytes: z.number().int().min(0).max(240_000),
  returned_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  output_limited: z.boolean(),
  redacted: z.boolean()
}).strict().superRefine((value, context) => {
  const expected = READ_HANDOFF_ARTIFACT_DEFINITIONS.map((definition) => ({
    path: `${value.context_dir}/${definition.name}`,
    kind: definition.kind
  }));
  const expectedByPath = new Map(expected.map((item, index) => [item.path, { ...item, index }]));

  if (!value.context_exists) {
    if (
      value.artifacts.length !== 0 ||
      value.files.length !== 0 ||
      value.file_count !== 0 ||
      value.unavailable.length !== 0 ||
      value.unavailable_count !== 0 ||
      value.loaded_bytes !== 0 ||
      value.returned_bytes !== 0 ||
      value.output_limited ||
      value.redacted
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["context_exists"],
        message: "Absent handoff contexts must have exact empty-state semantics."
      });
    }
    return;
  }

  const identities: string[] = [];
  const artifactByPath = new Map<string, z.infer<typeof readHandoffArtifactSchema>>();
  let previousArtifactIndex = -1;
  for (const [index, artifact] of value.artifacts.entries()) {
    const definition = expectedByPath.get(artifact.path);
    if (!definition || definition.kind !== artifact.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts", index],
        message: "Artifact path and kind must match the fixed allowlist."
      });
      continue;
    }
    if (definition.index <= previousArtifactIndex) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts", index, "path"],
        message: "Readable artifacts must preserve fixed allowlist order."
      });
    }
    previousArtifactIndex = definition.index;
    if (artifact.bytes > value.max_file_bytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts", index, "bytes"],
        message: "Readable artifact bytes cannot exceed max_file_bytes."
      });
    }
    identities.push(artifact.path);
    artifactByPath.set(artifact.path, artifact);
  }

  let previousUnavailableIndex = -1;
  const unavailableByPath = new Map<string, z.infer<typeof readHandoffUnavailableSchema>>();
  for (const [index, unavailable] of value.unavailable.entries()) {
    const definition = expectedByPath.get(unavailable.path);
    if (!definition || definition.kind !== unavailable.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unavailable", index],
        message: "Unavailable path and kind must match the fixed allowlist."
      });
      continue;
    }
    if (definition.index <= previousUnavailableIndex) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unavailable", index, "path"],
        message: "Unavailable artifacts must preserve fixed allowlist order."
      });
    }
    previousUnavailableIndex = definition.index;
    if (unavailable.reason === "too_large" && unavailable.bytes !== null && unavailable.bytes <= value.max_file_bytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unavailable", index, "bytes"],
        message: "too_large bytes must exceed max_file_bytes."
      });
    }
    if (unavailable.reason === "output_limit" && unavailable.bytes !== null && unavailable.bytes > value.max_file_bytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unavailable", index, "bytes"],
        message: "output_limit bytes must fit max_file_bytes."
      });
    }
    identities.push(unavailable.path);
    unavailableByPath.set(unavailable.path, unavailable);
  }

  if (
    identities.length !== expected.length ||
    new Set(identities).size !== expected.length ||
    expected.some((item) => !identities.includes(item.path))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["artifacts"],
      message: "Every fixed handoff artifact must appear exactly once."
    });
  }

  const expectedFiles = value.artifacts.map((artifact) => artifact.path);
  if (
    value.files.length !== expectedFiles.length ||
    value.files.some((file, index) => file !== expectedFiles[index])
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["files"],
      message: "files must exactly match the readable artifact path sequence."
    });
  }
  if (value.file_count !== value.artifacts.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file_count"],
      message: "file_count must match artifacts length."
    });
  }
  if (value.unavailable_count !== value.unavailable.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unavailable_count"],
      message: "unavailable_count must match unavailable length."
    });
  }

  const expectedLoadedBytes = value.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  if (value.loaded_bytes !== expectedLoadedBytes || value.loaded_bytes > value.max_total_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["loaded_bytes"],
      message: "loaded_bytes must match readable bytes within max_total_bytes."
    });
  }
  const expectedReturnedBytes = value.artifacts.reduce((sum, artifact) => sum + artifact.returned_bytes, 0);
  if (value.returned_bytes !== expectedReturnedBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "returned_bytes must match readable returned bytes."
    });
  }
  const expectedRedacted = value.artifacts.some((artifact) => artifact.redacted);
  if (value.redacted !== expectedRedacted) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["redacted"],
      message: "redacted must exactly match artifact redaction state."
    });
  }
  const expectedOutputLimited = value.unavailable.some((item) =>
    item.reason === "too_large" || item.reason === "output_limit"
  );
  if (value.output_limited !== expectedOutputLimited) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["output_limited"],
      message: "output_limited must exactly match bounded unavailable reasons."
    });
  }

  let priorLoadedBytes = 0;
  for (const definition of expected) {
    const artifact = artifactByPath.get(definition.path);
    if (artifact) {
      priorLoadedBytes += artifact.bytes;
      continue;
    }
    const unavailable = unavailableByPath.get(definition.path);
    if (
      unavailable?.reason === "output_limit" &&
      unavailable.bytes !== null &&
      priorLoadedBytes + unavailable.bytes <= value.max_total_bytes
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unavailable"],
        message: "output_limit must reflect aggregate bytes consumed by earlier artifacts."
      });
    }
  }
});

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundDetailsSchema = z.union([
  z.object({
    source: z.literal("workspace_id"),
    workspace_id: safeWorkspaceIdSchema
  }).strict(),
  z.object({
    source: z.literal("default_workspace"),
    workspace_id: z.null()
  }).strict()
]);

const handoffReadFailedDetailsSchema = z.object({
  context_dir: readHandoffContextDirSchema
}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(READ_HANDOFF_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceNotFoundDetailsSchema
}).strict();

const handoffReadFailedErrorSchema = z.object({
  code: z.literal("HANDOFF_READ_FAILED"),
  message: z.literal(READ_HANDOFF_ERROR_MESSAGES.HANDOFF_READ_FAILED),
  retryable: z.literal(false),
  details: handoffReadFailedDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(READ_HANDOFF_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const readHandoffErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  handoffReadFailedErrorSchema,
  internalErrorSchema
]);

export const readHandoffOutputShape = {
  codexgpt_tool: z.literal("read_handoff"),
  codexgpt_title: z.literal("Read Handoff"),
  ok: z.boolean(),
  data: readHandoffDataSchema.nullable(),
  error: readHandoffErrorSchema.nullable(),
  meta: toolMetaSchema
};

const readHandoffOutputBaseSchema = z.object(readHandoffOutputShape).strict();

function readHandoffWarnings(data: ReadHandoffData): string[] {
  const warnings: string[] = [];
  if (data.unavailable.some((item) =>
    item.reason === "blocked" || item.reason === "not_text" || item.reason === "read_failed"
  )) {
    warnings.push(READ_HANDOFF_UNAVAILABLE_WARNING);
  }
  if (data.output_limited) warnings.push(READ_HANDOFF_LIMITED_WARNING);
  if (data.redacted) warnings.push(READ_HANDOFF_REDACTED_WARNING);
  return warnings;
}

export const readHandoffOutputSchema = readHandoffOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful read_handoff results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful read_handoff results require error to be null."
      });
    }
    if (value.data !== null) {
      const expected = readHandoffWarnings(value.data);
      if (
        value.meta.warnings.length !== expected.length ||
        value.meta.warnings.some((warning, index) => warning !== expected[index])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["meta", "warnings"],
          message: "read_handoff warnings must exactly match unavailable, limit, and redaction state."
        });
      }
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed read_handoff results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed read_handoff results require an error object."
    });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "warnings"],
      message: "Failed read_handoff results cannot include warnings."
    });
  }
});

export type ReadHandoffArtifactKind = z.infer<typeof readHandoffArtifactKindSchema>;
export type ReadHandoffUnavailableReason = z.infer<typeof readHandoffUnavailableReasonSchema>;
export type ReadHandoffArtifact = z.infer<typeof readHandoffArtifactSchema>;
export type ReadHandoffUnavailable = z.infer<typeof readHandoffUnavailableSchema>;
export type ReadHandoffData = z.infer<typeof readHandoffDataSchema>;
export type ReadHandoffStructuredResult = z.infer<typeof readHandoffOutputBaseSchema>;

export type ReadHandoffFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details:
        | { source: "workspace_id"; workspace_id: string }
        | { source: "default_workspace"; workspace_id: null };
    }
  | { code: "HANDOFF_READ_FAILED"; details: { context_dir: string } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createReadHandoffSuccess(
  data: ReadHandoffData,
  durationMs = 0
): ReadHandoffStructuredResult {
  const parsedData = readHandoffDataSchema.parse(data);
  return readHandoffOutputSchema.parse({
    codexgpt_tool: "read_handoff",
    codexgpt_title: "Read Handoff",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, readHandoffWarnings(parsedData))
  });
}

export function createReadHandoffFailure(
  failure: ReadHandoffFailureInput,
  durationMs = 0
): ReadHandoffStructuredResult {
  return readHandoffOutputSchema.parse({
    codexgpt_tool: "read_handoff",
    codexgpt_title: "Read Handoff",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: READ_HANDOFF_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

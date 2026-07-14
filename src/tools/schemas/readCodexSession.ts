import path from "node:path";
import { z } from "zod";
import { hasSecretValue } from "../../redact.js";
import { codexSessionsSessionSchema } from "./codexSessions.js";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const READ_CODEX_SESSION_TRUNCATED_WARNING =
  "Transcript output reached the requested message or byte limit." as const;
export const READ_CODEX_SESSION_REDACTED_WARNING =
  "Sensitive-looking transcript content was redacted before return." as const;
export const READ_CODEX_SESSION_MESSAGE_TRUNCATION_MARKER =
  "\n...[message truncated]" as const;

export const READ_CODEX_SESSION_ERROR_MESSAGES = {
  REQUEST_INVALID: "A canonical Codex session id or source path is required.",
  SESSION_NOT_FOUND: "The requested Codex session was not found.",
  SESSION_RESOLUTION_INCOMPLETE:
    "The bounded Codex session index could not prove that this session is absent.",
  SOURCE_PATH_OUTSIDE_ROOTS:
    "The Codex session source is outside the configured history roots.",
  SESSION_ID_MISMATCH:
    "The requested session id does not match the selected source.",
  SESSION_FILE_TOO_LARGE:
    "The Codex session file exceeds the fixed read ceiling.",
  SESSION_READ_FAILED:
    "The Codex session transcript could not be read safely.",
  INTERNAL_ERROR:
    "The Codex session reader failed because of an internal error."
} as const;

const canonicalSessionIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  "Session id must be a canonical lowercase UUID."
);

const safePathSchema = z.string()
  .min(1)
  .max(4096)
  .refine((value) => value.trim() === value, "Path cannot have surrounding whitespace.")
  .refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Path must be one safe line."
  )
  .refine((value) => path.isAbsolute(value), "Path must be absolute.")
  .refine(
    (value) => path.resolve(value) === value,
    "Path must use canonical native syntax."
  );

const timestampSchema = z.number()
  .int()
  .min(0)
  .max(8_640_000_000_000_000)
  .nullable();

const safeTranscriptContentSchema = z.string()
  .min(1)
  .max(400_000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value),
    "Transcript content contains an unsafe control character."
  )
  .refine(
    (value) => !hasSecretValue(value),
    "Transcript content contains an unredacted secret shape."
  );

export const readCodexSessionMessageSchema = z.object({
  ordinal: z.number().int().min(1).max(400),
  kind: z.enum(["message", "function_call", "function_call_output"]),
  role: z.enum(["user", "assistant", "developer", "system", "tool", "unknown"]),
  timestamp: timestampSchema,
  content: safeTranscriptContentSchema,
  bytes: z.number().int().min(1).max(400_000),
  redacted: z.boolean(),
  truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.bytes !== Buffer.byteLength(value.content, "utf8")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Message bytes must match the exact UTF-8 content size."
    });
  }
  if (
    value.truncated &&
    !value.content.endsWith(READ_CODEX_SESSION_MESSAGE_TRUNCATION_MARKER)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: "A partial message must end with the fixed truncation marker."
    });
  }
});

export type ReadCodexSessionMessage = z.infer<
  typeof readCodexSessionMessageSchema
>;

function pathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right);
}

function isStrictSubpath(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) return false;
  if (process.platform !== "win32") return true;
  return pathKey(child).startsWith(pathKey(parent) + path.sep.toLowerCase());
}

export const readCodexSessionDataSchema = z.object({
  codex_dir: safePathSchema,
  roots: z.array(safePathSchema).length(2),
  codex_sessions_mode: z.literal("read"),
  tool_mode: z.enum(["minimal", "standard", "full"]),
  selection: z.enum(["session_id", "source_path", "both"]),
  requested_session_id: canonicalSessionIdSchema.nullable(),
  requested_source_path: safePathSchema.nullable(),
  max_messages: z.number().int().min(1).max(400),
  max_total_bytes: z.number().int().min(4_000).max(400_000),
  max_source_file_bytes: z.literal(20_000_000),
  source_file_bytes: z.number().int().min(0).max(20_000_000),
  session: codexSessionsSessionSchema,
  messages: z.array(readCodexSessionMessageSchema).max(400),
  message_count: z.number().int().min(0).max(400),
  content_bytes: z.number().int().min(0).max(400_000),
  redacted_message_count: z.number().int().min(0).max(400),
  truncated_message_count: z.number().int().min(0).max(1),
  truncated: z.boolean(),
  truncation_reason: z.enum(["message_limit", "byte_limit"]).nullable(),
  output_limited: z.boolean()
}).strict().superRefine((value, context) => {
  const expectedRoots = [
    path.join(value.codex_dir, "sessions"),
    path.join(value.codex_dir, "archived_sessions")
  ];
  if (
    value.roots.some((root, index) => !samePath(root, expectedRoots[index]!))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roots"],
      message: "Roots must match the configured active and archived history directories."
    });
  }

  const expectedRoot = value.session.storage === "active"
    ? value.roots[0]!
    : value.roots[1]!;
  if (!isStrictSubpath(value.session.source_path, expectedRoot)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["session", "source_path"],
      message: "Session source must remain under the root matching storage."
    });
  }

  const selectorValid =
    (value.selection === "session_id" &&
      value.requested_session_id === value.session.session_id &&
      value.requested_source_path === null) ||
    (value.selection === "source_path" &&
      value.requested_session_id === null &&
      value.requested_source_path !== null &&
      samePath(value.requested_source_path, value.session.source_path)) ||
    (value.selection === "both" &&
      value.requested_session_id === value.session.session_id &&
      value.requested_source_path !== null &&
      samePath(value.requested_source_path, value.session.source_path));
  if (!selectorValid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selection"],
      message: "Selection and requested identities must match the resolved session."
    });
  }

  if (
    value.message_count !== value.messages.length ||
    value.message_count > value.max_messages
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["message_count"],
      message: "Message count must match the bounded returned message array."
    });
  }

  let contentBytes = 0;
  let redactedCount = 0;
  let truncatedCount = 0;
  value.messages.forEach((message, index) => {
    contentBytes += message.bytes;
    if (message.redacted) redactedCount += 1;
    if (message.truncated) truncatedCount += 1;
    if (message.ordinal !== index + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages", index, "ordinal"],
        message: "Message ordinals must be contiguous and one-based."
      });
    }
    if (message.truncated && index !== value.messages.length - 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages", index, "truncated"],
        message: "Only the last returned message may be truncated."
      });
    }
  });

  if (value.content_bytes !== contentBytes || contentBytes > value.max_total_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content_bytes"],
      message: "Content bytes must equal the bounded sum of message bytes."
    });
  }
  if (value.redacted_message_count !== redactedCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["redacted_message_count"],
      message: "Redacted count must match returned message flags."
    });
  }
  if (value.truncated_message_count !== truncatedCount || truncatedCount > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncated_message_count"],
      message: "Truncated message count must match the optional final partial message."
    });
  }

  const expectedTruncated = value.truncation_reason !== null;
  if (
    value.truncated !== expectedTruncated ||
    value.output_limited !== expectedTruncated
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncated"],
      message: "Truncation flags must exactly match the truncation reason."
    });
  }
  if (value.truncation_reason === null && truncatedCount !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncated_message_count"],
      message: "Complete output cannot contain a truncated message."
    });
  }
  if (
    value.truncation_reason === "message_limit" &&
    (value.message_count !== value.max_messages || truncatedCount !== 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncation_reason"],
      message: "Message-limit truncation must fill the message limit without a partial message."
    });
  }
  if (truncatedCount === 1 && value.truncation_reason !== "byte_limit") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncation_reason"],
      message: "A partial final message requires byte-limit truncation."
    });
  }
});

export type ReadCodexSessionData = z.infer<
  typeof readCodexSessionDataSchema
>;

const emptyDetailsSchema = z.object({}).strict();
const requestDetailsSchema = z.object({
  reason: z.enum(["selector_required", "session_id_invalid", "source_path_invalid"])
}).strict();
const selectorDetailsSchema = z.object({
  selector: z.enum(["session_id", "source_path"])
}).strict();
const incompleteDetailsSchema = z.object({
  selector: z.literal("session_id")
}).strict();
const fileTooLargeDetailsSchema = z.object({
  max_source_file_bytes: z.literal(20_000_000)
}).strict();

function errorSchema<
  Code extends keyof typeof READ_CODEX_SESSION_ERROR_MESSAGES
>(
  code: Code,
  details: z.ZodTypeAny,
  retryable: boolean
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(READ_CODEX_SESSION_ERROR_MESSAGES[code]),
    retryable: z.literal(retryable),
    details
  }).strict();
}

export const readCodexSessionErrorSchema = z.discriminatedUnion("code", [
  errorSchema("REQUEST_INVALID", requestDetailsSchema, false),
  errorSchema("SESSION_NOT_FOUND", selectorDetailsSchema, false),
  errorSchema("SESSION_RESOLUTION_INCOMPLETE", incompleteDetailsSchema, false),
  errorSchema("SOURCE_PATH_OUTSIDE_ROOTS", emptyDetailsSchema, false),
  errorSchema("SESSION_ID_MISMATCH", emptyDetailsSchema, false),
  errorSchema("SESSION_FILE_TOO_LARGE", fileTooLargeDetailsSchema, false),
  errorSchema("SESSION_READ_FAILED", emptyDetailsSchema, true),
  errorSchema("INTERNAL_ERROR", emptyDetailsSchema, false)
]);

export const readCodexSessionOutputShape = {
  codexpro_tool: z.literal("read_codex_session"),
  codexpro_title: z.literal("Read Codex Session"),
  ok: z.boolean(),
  data: readCodexSessionDataSchema.nullable(),
  error: readCodexSessionErrorSchema.nullable(),
  meta: toolMetaSchema
};

const readCodexSessionOutputBaseSchema = z.object(
  readCodexSessionOutputShape
).strict();

function warningsFor(data: ReadCodexSessionData): string[] {
  const warnings: string[] = [];
  if (data.truncated) warnings.push(READ_CODEX_SESSION_TRUNCATED_WARNING);
  if (data.redacted_message_count > 0) {
    warnings.push(READ_CODEX_SESSION_REDACTED_WARNING);
  }
  return warnings;
}

export const readCodexSessionOutputSchema =
  readCodexSessionOutputBaseSchema.superRefine((value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful transcript reads require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful transcript reads require error to be null."
        });
      }
      if (value.data !== null) {
        const expected = warningsFor(value.data);
        if (
          value.meta.warnings.length !== expected.length ||
          value.meta.warnings.some((warning, index) => warning !== expected[index])
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["meta", "warnings"],
            message: "Warnings must match transcript truncation and redaction state."
          });
        }
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed transcript reads require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed transcript reads require an error object."
      });
    }
    if (value.meta.warnings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meta", "warnings"],
        message: "Failed transcript reads cannot include warnings."
      });
    }
  });

export type ReadCodexSessionStructuredResult = z.infer<
  typeof readCodexSessionOutputBaseSchema
>;

export type ReadCodexSessionFailureInput =
  | {
      code: "REQUEST_INVALID";
      details: { reason: "selector_required" | "session_id_invalid" | "source_path_invalid" };
    }
  | {
      code: "SESSION_NOT_FOUND";
      details: { selector: "session_id" | "source_path" };
    }
  | {
      code: "SESSION_RESOLUTION_INCOMPLETE";
      details: { selector: "session_id" };
    }
  | { code: "SOURCE_PATH_OUTSIDE_ROOTS"; details: Record<string, never> }
  | { code: "SESSION_ID_MISMATCH"; details: Record<string, never> }
  | {
      code: "SESSION_FILE_TOO_LARGE";
      details: { max_source_file_bytes: 20_000_000 };
    }
  | { code: "SESSION_READ_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createReadCodexSessionSuccess(
  data: ReadCodexSessionData,
  durationMs = 0
): ReadCodexSessionStructuredResult {
  const parsedData = readCodexSessionDataSchema.parse(data);
  return readCodexSessionOutputSchema.parse({
    codexpro_tool: "read_codex_session",
    codexpro_title: "Read Codex Session",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, warningsFor(parsedData))
  });
}

export function createReadCodexSessionFailure(
  failure: ReadCodexSessionFailureInput,
  durationMs = 0
): ReadCodexSessionStructuredResult {
  return readCodexSessionOutputSchema.parse({
    codexpro_tool: "read_codex_session",
    codexpro_title: "Read Codex Session",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: READ_CODEX_SESSION_ERROR_MESSAGES[failure.code],
      retryable: failure.code === "SESSION_READ_FAILED",
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

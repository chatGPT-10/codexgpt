import path from "node:path";
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const CODEX_SESSIONS_DISCOVERY_TRUNCATED_WARNING =
  "Codex session discovery reached its fixed filesystem limits." as const;
export const CODEX_SESSIONS_RESULTS_TRUNCATED_WARNING =
  "More matching Codex sessions exist than max_sessions returned." as const;

export const CODEX_SESSIONS_ERROR_MESSAGES = {
  SESSION_INDEX_FAILED: "Local Codex session metadata could not be indexed safely.",
  INTERNAL_ERROR: "The Codex session index failed because of an internal error."
} as const;

const canonicalSessionIdSchema = z.string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Session id must be a canonical lowercase UUID."
  );

const safeTitleSchema = z.string()
  .min(1)
  .max(96)
  .refine((value) => value.trim() === value, "Title cannot have surrounding whitespace.")
  .refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Title must be one safe line."
  );

const safeMetadataPathSchema = z.string()
  .min(1)
  .max(4096)
  .refine((value) => value.trim() === value, "Path cannot have surrounding whitespace.")
  .refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Path must be one safe line."
  );

const absoluteMetadataPathSchema = safeMetadataPathSchema.refine(
  (value) => path.isAbsolute(value),
  "Path must be absolute."
).refine(
  (value) => path.resolve(value) === value,
  "Path must use canonical native syntax."
);

const safeQuerySchema = z.string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, "Query cannot have surrounding whitespace.")
  .refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Query must be one safe line."
  );

const timestampSchema = z.number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();

function pathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right);
}

function isStrictSubpath(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || path.isAbsolute(relative) || relative.startsWith("..")) return false;
  if (process.platform !== "win32") return true;
  const childKey = pathKey(child);
  const parentKey = pathKey(parent);
  return childKey.startsWith(parentKey + path.sep.toLowerCase());
}

export const codexSessionsSessionSchema = z.object({
  provider_id: z.literal("codex"),
  session_id: canonicalSessionIdSchema,
  storage: z.enum(["active", "archived"]),
  title: safeTitleSchema.nullable(),
  project_dir: absoluteMetadataPathSchema.nullable(),
  created_at: timestampSchema,
  last_active_at: timestampSchema,
  source_path: absoluteMetadataPathSchema,
  resume_command: z.string().min(1).max(64)
}).strict().superRefine((value, context) => {
  if (value.resume_command !== "codex resume " + value.session_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resume_command"],
      message: "Resume command must exactly match the safe session id."
    });
  }
});

export type CodexSessionsSession = z.infer<typeof codexSessionsSessionSchema>;

export function compareCodexSessions(
  left: CodexSessionsSession,
  right: CodexSessionsSession
): number {
  const leftActivity = left.last_active_at ?? left.created_at ?? 0;
  const rightActivity = right.last_active_at ?? right.created_at ?? 0;
  if (leftActivity !== rightActivity) return rightActivity - leftActivity;

  const leftCreated = left.created_at ?? 0;
  const rightCreated = right.created_at ?? 0;
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;

  const storageOrder =
    (left.storage === "active" ? 0 : 1) - (right.storage === "active" ? 0 : 1);
  if (storageOrder !== 0) return storageOrder;
  if (left.session_id !== right.session_id) {
    return left.session_id < right.session_id ? -1 : 1;
  }
  if (left.source_path !== right.source_path) {
    return left.source_path < right.source_path ? -1 : 1;
  }
  return 0;
}

export const codexSessionsDataSchema = z.object({
  codex_dir: absoluteMetadataPathSchema,
  roots: z.array(absoluteMetadataPathSchema).length(2),
  codex_sessions_mode: z.enum(["metadata", "read"]),
  tool_mode: z.enum(["minimal", "standard", "full"]),
  query: safeQuerySchema.nullable(),
  max_sessions: z.number().int().min(1).max(200),
  scan_file_limit: z.literal(3000),
  scan_depth_limit: z.literal(6),
  scanned_file_count: z.number().int().min(0).max(3000),
  indexed_session_count: z.number().int().min(0).max(3000),
  excluded_file_count: z.number().int().min(0).max(3000),
  duplicate_file_count: z.number().int().min(0).max(3000),
  sessions: z.array(codexSessionsSessionSchema).max(200),
  session_count: z.number().int().min(0).max(200),
  total_found: z.number().int().min(0).max(3000),
  discovery_truncated: z.boolean(),
  results_truncated: z.boolean(),
  output_limited: z.boolean()
}).strict().superRefine((value, context) => {
  const expectedRoots = [
    path.join(value.codex_dir, "sessions"),
    path.join(value.codex_dir, "archived_sessions")
  ];
  if (
    value.roots.length !== expectedRoots.length ||
    value.roots.some((root, index) => !samePath(root, expectedRoots[index]!))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roots"],
      message: "Roots must exactly match the active and archived Codex history directories."
    });
  }

  if (
    value.scanned_file_count !==
      value.indexed_session_count + value.excluded_file_count + value.duplicate_file_count
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scanned_file_count"],
      message: "Scanned files must equal indexed, excluded, and duplicate accounting."
    });
  }

  if (value.session_count !== value.sessions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["session_count"],
      message: "session_count must match sessions length."
    });
  }
  if (value.session_count > value.max_sessions) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["session_count"],
      message: "Returned sessions cannot exceed max_sessions."
    });
  }
  if (
    value.session_count > value.total_found ||
    value.total_found > value.indexed_session_count
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_found"],
      message: "Matched sessions must be between returned and indexed counts."
    });
  }
  if (value.query === null && value.total_found !== value.indexed_session_count) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_found"],
      message: "Unfiltered results must match every indexed session."
    });
  }

  const expectedResultsTruncated = value.total_found > value.session_count;
  if (value.results_truncated !== expectedResultsTruncated) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["results_truncated"],
      message: "results_truncated must exactly match matched and returned counts."
    });
  }
  if (value.results_truncated && value.session_count !== value.max_sessions) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["session_count"],
      message: "Truncated results must fill max_sessions."
    });
  }
  if (
    value.output_limited !== (value.discovery_truncated || value.results_truncated)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["output_limited"],
      message: "output_limited must exactly match discovery or result truncation."
    });
  }

  const seenIds = new Set<string>();
  const seenSources = new Set<string>();
  value.sessions.forEach((session, index) => {
    if (seenIds.has(session.session_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessions", index, "session_id"],
        message: "Session ids must be unique."
      });
    }
    seenIds.add(session.session_id);

    const sourceKey = pathKey(session.source_path);
    if (seenSources.has(sourceKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessions", index, "source_path"],
        message: "Session source paths must be unique."
      });
    }
    seenSources.add(sourceKey);

    const expectedRoot = session.storage === "active"
      ? value.roots[0]!
      : value.roots[1]!;
    if (!isStrictSubpath(session.source_path, expectedRoot)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessions", index, "source_path"],
        message: "Session source path must stay under the root matching storage."
      });
    }

    if (index > 0 && compareCodexSessions(value.sessions[index - 1]!, session) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessions", index],
        message: "Sessions must preserve deterministic recency-storage-id-path order."
      });
    }
  });
});

const emptyDetailsSchema = z.object({}).strict();

function fixedErrorSchema<Code extends keyof typeof CODEX_SESSIONS_ERROR_MESSAGES>(
  code: Code
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(CODEX_SESSIONS_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details: emptyDetailsSchema
  }).strict();
}

export const codexSessionsErrorSchema = z.discriminatedUnion("code", [
  fixedErrorSchema("SESSION_INDEX_FAILED"),
  fixedErrorSchema("INTERNAL_ERROR")
]);

export const codexSessionsOutputShape = {
  codexpro_tool: z.literal("codex_sessions"),
  codexpro_title: z.literal("Codex Sessions"),
  ok: z.boolean(),
  data: codexSessionsDataSchema.nullable(),
  error: codexSessionsErrorSchema.nullable(),
  meta: toolMetaSchema
};

const codexSessionsOutputBaseSchema = z.object(codexSessionsOutputShape).strict();

function warningsFor(data: CodexSessionsData): string[] {
  const warnings: string[] = [];
  if (data.discovery_truncated) {
    warnings.push(CODEX_SESSIONS_DISCOVERY_TRUNCATED_WARNING);
  }
  if (data.results_truncated) {
    warnings.push(CODEX_SESSIONS_RESULTS_TRUNCATED_WARNING);
  }
  return warnings;
}

export const codexSessionsOutputSchema = codexSessionsOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful codex_sessions results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful codex_sessions results require error to be null."
        });
      }
      if (value.data !== null) {
        const expectedWarnings = warningsFor(value.data);
        if (
          value.meta.warnings.length !== expectedWarnings.length ||
          value.meta.warnings.some(
            (warning, index) => warning !== expectedWarnings[index]
          )
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["meta", "warnings"],
            message: "Warnings must exactly match session-index truncation state."
          });
        }
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed codex_sessions results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed codex_sessions results require an error object."
      });
    }
    if (value.meta.warnings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meta", "warnings"],
        message: "Failed codex_sessions results cannot include warnings."
      });
    }
  }
);

export type CodexSessionsData = z.infer<typeof codexSessionsDataSchema>;
export type CodexSessionsStructuredResult = z.infer<
  typeof codexSessionsOutputBaseSchema
>;
export type CodexSessionsFailureInput =
  | { code: "SESSION_INDEX_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createCodexSessionsSuccess(
  data: CodexSessionsData,
  durationMs = 0
): CodexSessionsStructuredResult {
  const parsedData = codexSessionsDataSchema.parse(data);
  return codexSessionsOutputSchema.parse({
    codexpro_tool: "codex_sessions",
    codexpro_title: "Codex Sessions",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, warningsFor(parsedData))
  });
}

export function createCodexSessionsFailure(
  failure: CodexSessionsFailureInput,
  durationMs = 0
): CodexSessionsStructuredResult {
  return codexSessionsOutputSchema.parse({
    codexpro_tool: "codex_sessions",
    codexpro_title: "Codex Sessions",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEX_SESSIONS_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

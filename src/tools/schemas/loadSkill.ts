import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";
import {
  codexproInventorySkillSchema,
  codexproInventorySkillSourceSchema,
  type CodexProInventorySkill
} from "./codexproInventory.js";

export const LOAD_SKILL_TRUNCATED_WARNING =
  "Skill instructions were truncated at the effective max_bytes limit." as const;
export const LOAD_SKILL_REDACTED_WARNING =
  "Secret-looking content was redacted from the returned Skill instructions." as const;

export const LOAD_SKILL_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  INVALID_SKILL_SELECTOR: "The Skill selector is invalid or unsafe.",
  SKILL_NOT_FOUND: "No discovered Skill matches the requested selector.",
  SKILL_AMBIGUOUS: "Multiple discovered Skills match the requested selector; provide an exact path.",
  SKILL_RESOLUTION_LIMIT_REACHED: "Skill discovery reached max_skills before the selector could be resolved safely.",
  SKILL_BOUNDARY_VIOLATION: "The resolved Skill no longer matches its discovered filesystem boundary.",
  SKILL_READ_FAILED: "The resolved Skill instructions could not be read.",
  INTERNAL_ERROR: "The Skill loader failed because of an internal error."
} as const;

const safeOneLineSchema = z.string()
  .min(1)
  .max(240)
  .refine((value) => value.trim() === value, "Value cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Value must be a safe one-line string.");

const safeWorkspaceIdSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "Workspace id cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Workspace id must be one line.");

function hasSafeSelectorSegments(value: string): boolean {
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function loadSkillSelectorPathSource(
  selector: string
): z.infer<typeof codexproInventorySkillSourceSchema> | undefined {
  if (selector.includes("\\") || !selector.endsWith("/SKILL.md")) return undefined;

  if (selector.startsWith("$WORKSPACE/")) {
    return hasSafeSelectorSegments(selector.slice("$WORKSPACE/".length))
      ? "workspace"
      : undefined;
  }

  if (selector.startsWith("~/")) {
    return hasSafeSelectorSegments(selector.slice(2)) ? "user" : undefined;
  }

  return /^\$EXTERNAL\/[0-9a-f]{12}\/SKILL\.md$/.test(selector)
    ? "other"
    : undefined;
}

export const loadSkillSelectorSchema = z.object({
  name: safeOneLineSchema,
  source: codexproInventorySkillSourceSchema.nullable(),
  path: z.string().min(1).max(1024).nullable()
}).strict().superRefine((value, context) => {
  if (value.path === null) return;
  const pathSource = loadSkillSelectorPathSource(value.path);
  if (!pathSource) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["path"],
      message: "Path must be a sanitized Skill selector."
    });
    return;
  }

  if (value.source === null) return;
  const sourceMatches =
    value.source === pathSource ||
    ((value.source === "user" || value.source === "plugin") && pathSource === "user");
  if (!sourceMatches) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["path"],
      message: "Selector source and path do not agree."
    });
  }
});

export type LoadSkillSelector = z.infer<typeof loadSkillSelectorSchema>;

export const loadSkillSkillSchema = codexproInventorySkillSchema;

export const loadSkillDataSchema = z.object({
  workspace_id: safeWorkspaceIdSchema,
  root: z.string().min(1),
  selector: loadSkillSelectorSchema,
  skill: loadSkillSkillSchema,
  include_global_skills: z.boolean(),
  max_skills: z.number().int().min(1).max(500),
  max_bytes: z.number().int().min(1_000).max(100_000),
  bytes: z.number().int().min(0).max(100_000),
  returned_bytes: z.number().int().min(0).max(400_000),
  total_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  truncated: z.boolean(),
  resolution_truncated: z.boolean(),
  redacted: z.boolean(),
  text: z.string().max(200_000)
}).strict().superRefine((value, context) => {
  if (value.skill.name !== value.selector.name) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill", "name"],
      message: "Resolved Skill name must match the request selector."
    });
  }
  if (value.selector.source !== null && value.skill.source !== value.selector.source) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill", "source"],
      message: "Resolved Skill source must match the request selector."
    });
  }
  if (value.selector.path !== null && value.skill.path !== value.selector.path) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill", "path"],
      message: "Resolved Skill path must match the request selector."
    });
  }
  if (!value.include_global_skills && value.skill.source !== "workspace") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill", "source"],
      message: "Global discovery disabled results must resolve a workspace Skill."
    });
  }
  if (value.bytes > value.max_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Source bytes cannot exceed max_bytes."
    });
  }
  if (value.bytes > value.total_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Source bytes cannot exceed total_bytes."
    });
  }
  const expectedTruncated = value.total_bytes > value.bytes;
  if (value.truncated !== expectedTruncated) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["truncated"],
      message: "truncated must exactly match the source byte relationship."
    });
  }
  if (value.truncated && value.bytes !== value.max_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Truncated reads must consume the effective max_bytes limit."
    });
  }
  if (!value.truncated && value.bytes !== value.total_bytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Complete reads must consume the complete source."
    });
  }
  const expectedReturnedBytes = Buffer.byteLength(value.text, "utf8");
  if (value.returned_bytes !== expectedReturnedBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returned_bytes"],
      message: "returned_bytes must match the UTF-8 byte length of text."
    });
  }
  if (value.bytes === 0 && (value.text !== "" || value.returned_bytes !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Zero-byte reads must return an empty body."
    });
  }
  if (value.resolution_truncated && value.selector.path === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolution_truncated"],
      message: "Partial discovery success requires an exact path selector."
    });
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

const invalidSelectorDetailsSchema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("name"),
    reason: z.literal("unsafe_name")
  }).strict(),
  z.object({
    field: z.literal("path"),
    reason: z.enum(["unsafe_path", "source_path_mismatch"])
  }).strict()
]);

const selectorLookupDetailsSchema = z.object({
  selector: loadSkillSelectorSchema,
  include_global_skills: z.boolean(),
  max_skills: z.number().int().min(1).max(500)
}).strict();

const ambiguousDetailsSchema = z.object({
  selector: loadSkillSelectorSchema,
  candidates: z.array(loadSkillSkillSchema).min(2).max(8),
  candidates_truncated: z.boolean(),
  resolution_truncated: z.boolean()
}).strict().superRefine((value, context) => {
  value.candidates.forEach((candidate, index) => {
    if (candidate.name !== value.selector.name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates", index, "name"],
        message: "Ambiguous candidates must match the selector name."
      });
    }
    if (value.selector.source !== null && candidate.source !== value.selector.source) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates", index, "source"],
        message: "Ambiguous candidates must match the selector source."
      });
    }
    if (value.selector.path !== null && candidate.path !== value.selector.path) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates", index, "path"],
        message: "Ambiguous candidates must match the selector path."
      });
    }
  });
  const identities = value.candidates.map((candidate) =>
    `${candidate.source}\u0000${candidate.name}\u0000${candidate.path}`
  );
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidates"],
      message: "Ambiguous candidates must be unique."
    });
  }
  if (value.candidates_truncated && value.candidates.length !== 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidates_truncated"],
      message: "Truncated candidate previews must fill the eight-item bound."
    });
  }
});

const resolvedSkillDetailsSchema = z.object({
  skill: loadSkillSkillSchema
}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceNotFoundDetailsSchema
}).strict();

const invalidSelectorErrorSchema = z.object({
  code: z.literal("INVALID_SKILL_SELECTOR"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.INVALID_SKILL_SELECTOR),
  retryable: z.literal(false),
  details: invalidSelectorDetailsSchema
}).strict();

const skillNotFoundErrorSchema = z.object({
  code: z.literal("SKILL_NOT_FOUND"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.SKILL_NOT_FOUND),
  retryable: z.literal(false),
  details: selectorLookupDetailsSchema
}).strict();

const skillAmbiguousErrorSchema = z.object({
  code: z.literal("SKILL_AMBIGUOUS"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.SKILL_AMBIGUOUS),
  retryable: z.literal(false),
  details: ambiguousDetailsSchema
}).strict();

const skillResolutionLimitErrorSchema = z.object({
  code: z.literal("SKILL_RESOLUTION_LIMIT_REACHED"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.SKILL_RESOLUTION_LIMIT_REACHED),
  retryable: z.literal(false),
  details: selectorLookupDetailsSchema
}).strict();

const skillBoundaryErrorSchema = z.object({
  code: z.literal("SKILL_BOUNDARY_VIOLATION"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.SKILL_BOUNDARY_VIOLATION),
  retryable: z.literal(false),
  details: resolvedSkillDetailsSchema
}).strict();

const skillReadErrorSchema = z.object({
  code: z.literal("SKILL_READ_FAILED"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.SKILL_READ_FAILED),
  retryable: z.literal(false),
  details: resolvedSkillDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(LOAD_SKILL_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const loadSkillErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  invalidSelectorErrorSchema,
  skillNotFoundErrorSchema,
  skillAmbiguousErrorSchema,
  skillResolutionLimitErrorSchema,
  skillBoundaryErrorSchema,
  skillReadErrorSchema,
  internalErrorSchema
]);

export const loadSkillOutputShape = {
  codexpro_tool: z.literal("load_skill"),
  codexpro_title: z.literal("Load Skill"),
  ok: z.boolean(),
  data: loadSkillDataSchema.nullable(),
  error: loadSkillErrorSchema.nullable(),
  meta: toolMetaSchema
};

const loadSkillOutputBaseSchema = z.object(loadSkillOutputShape).strict();

function loadSkillWarnings(data: LoadSkillData): string[] {
  const warnings: string[] = [];
  if (data.truncated) warnings.push(LOAD_SKILL_TRUNCATED_WARNING);
  if (data.redacted) warnings.push(LOAD_SKILL_REDACTED_WARNING);
  return warnings;
}

export const loadSkillOutputSchema = loadSkillOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful load_skill results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful load_skill results require error to be null."
      });
    }
    if (value.data !== null) {
      const expected = loadSkillWarnings(value.data);
      if (
        value.meta.warnings.length !== expected.length ||
        value.meta.warnings.some((warning, index) => warning !== expected[index])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["meta", "warnings"],
          message: "load_skill warnings must exactly match truncation and redaction state."
        });
      }
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed load_skill results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed load_skill results require an error object."
    });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "warnings"],
      message: "Failed load_skill results cannot include warnings."
    });
  }
});

export type LoadSkillData = z.infer<typeof loadSkillDataSchema>;
export type LoadSkillStructuredResult = z.infer<typeof loadSkillOutputBaseSchema>;

export type LoadSkillFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details:
        | { source: "workspace_id"; workspace_id: string }
        | { source: "default_workspace"; workspace_id: null };
    }
  | {
      code: "INVALID_SKILL_SELECTOR";
      details:
        | { field: "name"; reason: "unsafe_name" }
        | { field: "path"; reason: "unsafe_path" | "source_path_mismatch" };
    }
  | {
      code: "SKILL_NOT_FOUND" | "SKILL_RESOLUTION_LIMIT_REACHED";
      details: {
        selector: LoadSkillSelector;
        include_global_skills: boolean;
        max_skills: number;
      };
    }
  | {
      code: "SKILL_AMBIGUOUS";
      details: {
        selector: LoadSkillSelector;
        candidates: CodexProInventorySkill[];
        candidates_truncated: boolean;
        resolution_truncated: boolean;
      };
    }
  | {
      code: "SKILL_BOUNDARY_VIOLATION" | "SKILL_READ_FAILED";
      details: { skill: CodexProInventorySkill };
    }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createLoadSkillSuccess(
  data: LoadSkillData,
  durationMs = 0
): LoadSkillStructuredResult {
  const parsedData = loadSkillDataSchema.parse(data);
  return loadSkillOutputSchema.parse({
    codexpro_tool: "load_skill",
    codexpro_title: "Load Skill",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, loadSkillWarnings(parsedData))
  });
}

export function createLoadSkillFailure(
  failure: LoadSkillFailureInput,
  durationMs = 0
): LoadSkillStructuredResult {
  return loadSkillOutputSchema.parse({
    codexpro_tool: "load_skill",
    codexpro_title: "Load Skill",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: LOAD_SKILL_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

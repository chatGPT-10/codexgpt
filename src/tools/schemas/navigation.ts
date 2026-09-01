import { z } from "zod";

export const navigationIntentSchema = z.enum([
  "definition",
  "references",
  "implementation",
  "text",
  "file",
  "diagnostics"
]);

export const navigationRequestShape = {
  intent: navigationIntentSchema,
  query: z.string().trim().min(1).max(500).optional(),
  path: z.string().min(1).max(240).optional(),
  severity: z.enum(["error", "warning", "information", "hint"]).optional(),
  include_declaration: z.boolean().optional(),
  max_results: z.number().int().min(1).max(200).optional(),
  workspace_id: z.string().min(1).max(160).optional()
};

export function refineNavigationRequest(
  value: z.infer<z.ZodObject<typeof navigationRequestShape>>,
  context: z.RefinementCtx
): void {
  if (value.intent === "diagnostics") {
    if (!value.path) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: "diagnostics navigation requires path."
      });
    }
    if (value.include_declaration !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["include_declaration"],
        message: "include_declaration is valid only for references navigation."
      });
    }
    return;
  }
  if (!value.query) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["query"],
      message: `${value.intent} navigation requires query.`
    });
  }
  if (
    value.query &&
    value.query.length > 200 &&
    (value.intent === "definition" || value.intent === "references" || value.intent === "implementation")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["query"],
      message: `${value.intent} navigation query must be at most 200 characters.`
    });
  }
  if (value.severity !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["severity"],
      message: "severity is valid only for diagnostics navigation."
    });
  }
  if (value.include_declaration !== undefined && value.intent !== "references") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["include_declaration"],
      message: "include_declaration is valid only for references navigation."
    });
  }
}

export const navigationRequestSchema = z.object(navigationRequestShape).strict()
  .superRefine(refineNavigationRequest);

export const navigationProviderSchema = z.enum([
  "builtin-typescript",
  "builtin-lexical",
  "ripgrep",
  "node",
  "builtin-file-index",
  "none"
]);

export const navigationQualitySchema = z.enum([
  "semantic",
  "lexical",
  "lexical_fallback",
  "unavailable"
]);

export const navigationMatchSchema = z.object({
  path: z.string().min(1).max(240),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  kind: z.enum([
    "definition",
    "references",
    "implementation",
    "text",
    "file",
    "diagnostics",
    "candidate"
  ]),
  symbol: z.string().trim().min(1).max(200).optional(),
  preview: z.string().max(400),
  declaration: z.boolean().optional(),
  severity: z.enum(["error", "warning", "information", "hint"]).optional(),
  code: z.string().min(1).max(80).optional()
}).strict();

export const navigationResultSchema = z.object({
  intent: navigationIntentSchema,
  query: z.string().max(500),
  matches: z.array(navigationMatchSchema).max(200),
  provider: navigationProviderSchema,
  quality: navigationQualitySchema,
  fallback: z.boolean(),
  truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.fallback !== (value.quality === "lexical_fallback")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fallback"],
      message: "fallback must be true exactly for lexical_fallback quality."
    });
  }
  if (value.quality === "semantic" && value.provider !== "builtin-typescript") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["provider"],
      message: "semantic quality requires the owned TypeScript provider."
    });
  }
});

export type NavigationRequestInput = z.infer<typeof navigationRequestSchema>;
export type NavigationResultOutput = z.infer<typeof navigationResultSchema>;

import { z } from "zod";

export const TOOL_SCHEMA_VERSION = 1 as const;

export const toolMetaSchema = z.object({
  schemaVersion: z.literal(TOOL_SCHEMA_VERSION),
  durationMs: z.number().nonnegative(),
  warnings: z.array(z.string())
}).strict();

export const toolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown())
}).strict();

export type ToolMeta = z.infer<typeof toolMetaSchema>;
export type ToolError = z.infer<typeof toolErrorSchema>;

export function createToolMeta(durationMs = 0, warnings: string[] = []): ToolMeta {
  return toolMetaSchema.parse({
    schemaVersion: TOOL_SCHEMA_VERSION,
    durationMs: Math.max(0, durationMs),
    warnings
  });
}

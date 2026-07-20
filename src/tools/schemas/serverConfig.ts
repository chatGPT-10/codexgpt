import { z } from "zod";
import { createToolMeta, toolErrorSchema, toolMetaSchema } from "./common.js";

const bashAvailabilitySchema = z.object({
  available: z.boolean(),
  executable: z.string(),
  detail: z.string()
}).strict();

const policyEnforcementSummarySchema = z.object({
  active: z.boolean(),
  backendId: z.string().min(1).max(160),
  evidenceRevision: z.string().min(1).max(160),
  missingCapabilities: z.array(z.string().min(1).max(160)).max(16)
}).strict();

const analysisLimitsSchema = z.object({
  maxInventoryFiles: z.number().int().nonnegative(),
  maxAnalyzedFiles: z.number().int().nonnegative(),
  maxScannedBytes: z.number().int().nonnegative(),
  maxSymbols: z.number().int().nonnegative(),
  maxRelationships: z.number().int().nonnegative()
}).strict();

export const serverConfigDataSchema = z.object({
  defaultRoot: z.string(),
  allowedRoots: z.array(z.string()),
  host: z.string(),
  port: z.number().int().min(1).max(65_535),
  widgetDomain: z.string(),
  authEnabled: z.boolean(),
  allowedHosts: z.array(z.string()),
  allowedOrigins: z.array(z.string()),
  allowQueryToken: z.boolean(),
  bashMode: z.enum(["off", "safe", "full"]),
  bashAvailability: bashAvailabilitySchema.nullable(),
  bashTranscript: z.enum(["compact", "full"]),
  bashSessionId: z.string().nullable(),
  requireBashSession: z.boolean(),
  codexSessions: z.enum(["off", "metadata", "read"]),
  codexDir: z.string(),
  writeMode: z.enum(["off", "handoff", "workspace"]),
  toolMode: z.enum(["minimal", "standard", "full"]),
  policyEngineMode: z.enum(["legacy", "shadow", "enforce"]),
  permissionProfileId: z.string().min(1).max(64).nullable(),
  policyRevision: z.string().min(1).max(160).nullable(),
  hardPolicyRevision: z.string().min(1).max(160),
  grantRevision: z.string().min(1).max(160).nullable(),
  enforcement: policyEnforcementSummarySchema,
  toolCards: z.boolean(),
  connectionTest: z.boolean(),
  analysisEnabled: z.boolean(),
  analysisLimits: analysisLimitsSchema,
  inheritEnv: z.boolean(),
  contextDir: z.string(),
  maxReadBytes: z.number().int().nonnegative(),
  maxWriteBytes: z.number().int().nonnegative(),
  maxOutputBytes: z.number().int().nonnegative(),
  maxSearchResults: z.number().int().nonnegative(),
  blockedGlobs: z.array(z.string()),
  registeredTools: z.array(z.string()),
  registeredToolCount: z.number().int().nonnegative()
}).strict();

const internalErrorSchema = toolErrorSchema.extend({
  code: z.literal("INTERNAL_ERROR")
}).strict();

export const serverConfigOutputShape = {
  codexgpt_tool: z.literal("server_config"),
  codexgpt_title: z.literal("Server Config"),
  ok: z.boolean(),
  data: serverConfigDataSchema.nullable(),
  error: internalErrorSchema.nullable(),
  meta: toolMetaSchema
};

const serverConfigOutputBaseSchema = z.object(serverConfigOutputShape).strict();

export const serverConfigOutputSchema = serverConfigOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful server_config results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful server_config results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed server_config results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed server_config results require an error object."
    });
  }
});

export type ServerConfigData = z.infer<typeof serverConfigDataSchema>;
export type ServerConfigStructuredResult = z.infer<typeof serverConfigOutputBaseSchema>;

export function createServerConfigSuccess(
  data: ServerConfigData,
  durationMs = 0
): ServerConfigStructuredResult {
  return serverConfigOutputSchema.parse({
    codexgpt_tool: "server_config",
    codexgpt_title: "Server Config",
    ok: true,
    data: serverConfigDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createServerConfigFailure(
  message: string,
  durationMs = 0
): ServerConfigStructuredResult {
  return serverConfigOutputSchema.parse({
    codexgpt_tool: "server_config",
    codexgpt_title: "Server Config",
    ok: false,
    data: null,
    error: {
      code: "INTERNAL_ERROR",
      message,
      retryable: false,
      details: {}
    },
    meta: createToolMeta(durationMs)
  });
}

import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const CODEXGPT_INVENTORY_MCP_SERVER_LIMIT = 120 as const;

export const CODEXGPT_INVENTORY_SKILLS_TRUNCATED_WARNING =
  "Skill inventory reached the requested max_skills limit." as const;

export const CODEXGPT_INVENTORY_MCP_SERVERS_TRUNCATED_WARNING =
  "MCP server inventory reached the fixed 120-server limit." as const;

export const CODEXGPT_INVENTORY_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  INVENTORY_DISCOVERY_FAILED: "The CodexGPT capability inventory could not be collected.",
  INTERNAL_ERROR: "The CodexGPT capability inventory failed because of an internal error."
} as const;

const safeOneLineSchema = z.string()
  .min(1)
  .max(240)
  .refine((value) => value.trim() === value, "Value cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Value must be a safe one-line string.");

const skillDescriptionSchema = z.string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, "Description cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Description must be one line.");

export const codexgptInventorySkillSourceSchema = z.enum([
  "workspace",
  "user",
  "plugin",
  "other"
]);

export const codexgptInventoryMcpSourceSchema = z.enum([
  "user codex config",
  "workspace config",
  "workspace cursor config",
  "user cursor config"
]);

function hasSafeSelectorSegments(value: string): boolean {
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isSkillSelectorForSource(
  source: z.infer<typeof codexgptInventorySkillSourceSchema>,
  selector: string
): boolean {
  if (selector.includes("\\") || !selector.endsWith("/SKILL.md")) return false;

  if (source === "workspace") {
    if (!selector.startsWith("$WORKSPACE/")) return false;
    return hasSafeSelectorSegments(selector.slice("$WORKSPACE/".length));
  }

  if (source === "user" || source === "plugin") {
    if (!selector.startsWith("~/")) return false;
    return hasSafeSelectorSegments(selector.slice(2));
  }

  return /^\$EXTERNAL\/[0-9a-f]{12}\/SKILL\.md$/.test(selector);
}

export const codexgptInventorySkillSchema = z.object({
  name: safeOneLineSchema,
  description: skillDescriptionSchema.nullable(),
  source: codexgptInventorySkillSourceSchema,
  path: z.string().min(1).max(1024)
}).strict().superRefine((value, context) => {
  if (!isSkillSelectorForSource(value.source, value.path)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["path"],
      message: "Skill path must be a sanitized selector for its source."
    });
  }
});

export const codexgptInventoryMcpServerSchema = z.object({
  name: safeOneLineSchema,
  source: codexgptInventoryMcpSourceSchema
}).strict();

export const codexgptInventorySkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

const skillSourceRank = {
  workspace: 0,
  user: 1,
  plugin: 2,
  other: 3
} as const;

export type CodexGPTInventorySkill = z.infer<typeof codexgptInventorySkillSchema>;
export type CodexGPTInventoryMcpServer = z.infer<typeof codexgptInventoryMcpServerSchema>;

export function compareCodexGPTInventorySkills(
  left: CodexGPTInventorySkill,
  right: CodexGPTInventorySkill
): number {
  const sourceOrder = skillSourceRank[left.source] - skillSourceRank[right.source];
  if (sourceOrder !== 0) return sourceOrder;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  return 0;
}

export function compareCodexGPTInventoryMcpServers(
  left: CodexGPTInventoryMcpServer,
  right: CodexGPTInventoryMcpServer
): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.source !== right.source) return left.source < right.source ? -1 : 1;
  return 0;
}

export const codexgptInventoryDataSchema = z.object({
  workspace_id: safeOneLineSchema,
  root: z.string().min(1),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"]),
  include_global_skills: z.boolean(),
  include_mcp_servers: z.boolean(),
  max_skills: z.number().int().min(1).max(500),
  mcp_server_limit: z.literal(CODEXGPT_INVENTORY_MCP_SERVER_LIMIT),
  skills: z.array(codexgptInventorySkillSchema).max(500),
  skill_count: z.number().int().nonnegative().max(500),
  skill_counts: codexgptInventorySkillCountsSchema,
  skills_truncated: z.boolean(),
  mcp_servers: z.array(codexgptInventoryMcpServerSchema).max(CODEXGPT_INVENTORY_MCP_SERVER_LIMIT),
  mcp_server_count: z.number().int().nonnegative().max(CODEXGPT_INVENTORY_MCP_SERVER_LIMIT),
  mcp_servers_truncated: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.skill_count !== value.skills.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill_count"],
      message: "skill_count must equal skills.length."
    });
  }

  const computedCounts = { workspace: 0, user: 0, plugin: 0, other: 0 };
  const seenSkills = new Set<string>();
  value.skills.forEach((skill, index) => {
    computedCounts[skill.source] += 1;
    const identity = `${skill.source}\u0000${skill.name}\u0000${skill.path}`;
    if (seenSkills.has(identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skills", index],
        message: "Skill identities must be unique."
      });
    }
    seenSkills.add(identity);

    if (index > 0 && compareCodexGPTInventorySkills(value.skills[index - 1]!, skill) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skills", index],
        message: "Skills must use deterministic source-name-path ordering."
      });
    }

    if (!value.include_global_skills && skill.source !== "workspace") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skills", index, "source"],
        message: "Global Skill sources require include_global_skills."
      });
    }
  });

  const sourceTotal = computedCounts.workspace + computedCounts.user +
    computedCounts.plugin + computedCounts.other;
  if (
    value.skill_counts.total !== value.skill_count ||
    value.skill_counts.total !== sourceTotal ||
    value.skill_counts.workspace !== computedCounts.workspace ||
    value.skill_counts.user !== computedCounts.user ||
    value.skill_counts.plugin !== computedCounts.plugin ||
    value.skill_counts.other !== computedCounts.other
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill_counts"],
      message: "Skill source counts must match the returned Skills."
    });
  }

  if (value.skill_count > value.max_skills) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skill_count"],
      message: "skill_count cannot exceed max_skills."
    });
  }
  if (value.skills_truncated && value.skill_count !== value.max_skills) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skills_truncated"],
      message: "Truncated Skill results must fill max_skills."
    });
  }

  if (value.mcp_server_count !== value.mcp_servers.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mcp_server_count"],
      message: "mcp_server_count must equal mcp_servers.length."
    });
  }

  const seenServers = new Set<string>();
  value.mcp_servers.forEach((server, index) => {
    const identity = `${server.source}\u0000${server.name}`;
    if (seenServers.has(identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mcp_servers", index],
        message: "MCP server identities must be unique."
      });
    }
    seenServers.add(identity);

    if (index > 0 && compareCodexGPTInventoryMcpServers(value.mcp_servers[index - 1]!, server) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mcp_servers", index],
        message: "MCP servers must use deterministic name-source ordering."
      });
    }
  });

  if (value.mcp_servers_truncated && value.mcp_server_count !== value.mcp_server_limit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mcp_servers_truncated"],
      message: "Truncated MCP results must fill mcp_server_limit."
    });
  }
  if (!value.include_mcp_servers && (
    value.mcp_servers.length !== 0 ||
    value.mcp_server_count !== 0 ||
    value.mcp_servers_truncated
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["include_mcp_servers"],
      message: "Disabled MCP discovery requires an empty non-truncated result."
    });
  }
});

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundDetailsSchema = z.union([
  z.object({
    source: z.literal("workspace_id"),
    workspace_id: safeOneLineSchema
  }).strict(),
  z.object({
    source: z.literal("default_workspace"),
    workspace_id: z.null()
  }).strict()
]);

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(CODEXGPT_INVENTORY_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceNotFoundDetailsSchema
}).strict();

const inventoryDiscoveryFailedErrorSchema = z.object({
  code: z.literal("INVENTORY_DISCOVERY_FAILED"),
  message: z.literal(CODEXGPT_INVENTORY_ERROR_MESSAGES.INVENTORY_DISCOVERY_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(CODEXGPT_INVENTORY_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const codexgptInventoryErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  inventoryDiscoveryFailedErrorSchema,
  internalErrorSchema
]);

export const codexgptInventoryOutputShape = {
  codexgpt_tool: z.literal("codexgpt_inventory"),
  codexgpt_title: z.literal("CodexGPT Inventory"),
  ok: z.boolean(),
  data: codexgptInventoryDataSchema.nullable(),
  error: codexgptInventoryErrorSchema.nullable(),
  meta: toolMetaSchema
};

const codexgptInventoryOutputBaseSchema = z.object(codexgptInventoryOutputShape).strict();

export const codexgptInventoryOutputSchema = codexgptInventoryOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful codexgpt_inventory results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful codexgpt_inventory results require error to be null."
        });
      }

      if (value.data !== null) {
        const expectedWarnings = inventoryWarnings(value.data);
        if (
          value.meta.warnings.length !== expectedWarnings.length ||
          value.meta.warnings.some((warning, index) => warning !== expectedWarnings[index])
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["meta", "warnings"],
            message: "Inventory warnings must exactly match truncation state."
          });
        }
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed codexgpt_inventory results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed codexgpt_inventory results require an error object."
      });
    }
    if (value.meta.warnings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meta", "warnings"],
        message: "Failed codexgpt_inventory results cannot include warnings."
      });
    }
  }
);

export type CodexGPTInventoryData = z.infer<typeof codexgptInventoryDataSchema>;
export type CodexGPTInventoryStructuredResult = z.infer<typeof codexgptInventoryOutputBaseSchema>;

export type CodexGPTInventoryFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details:
        | { source: "workspace_id"; workspace_id: string }
        | { source: "default_workspace"; workspace_id: null };
    }
  | { code: "INVENTORY_DISCOVERY_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

function inventoryWarnings(data: CodexGPTInventoryData): string[] {
  const warnings: string[] = [];
  if (data.skills_truncated) warnings.push(CODEXGPT_INVENTORY_SKILLS_TRUNCATED_WARNING);
  if (data.mcp_servers_truncated) warnings.push(CODEXGPT_INVENTORY_MCP_SERVERS_TRUNCATED_WARNING);
  return warnings;
}

export function createCodexGPTInventorySuccess(
  data: CodexGPTInventoryData,
  durationMs = 0
): CodexGPTInventoryStructuredResult {
  const parsedData = codexgptInventoryDataSchema.parse(data);
  return codexgptInventoryOutputSchema.parse({
    codexgpt_tool: "codexgpt_inventory",
    codexgpt_title: "CodexGPT Inventory",
    ok: true,
    data: parsedData,
    error: null,
    meta: createToolMeta(durationMs, inventoryWarnings(parsedData))
  });
}

export function createCodexGPTInventoryFailure(
  failure: CodexGPTInventoryFailureInput,
  durationMs = 0
): CodexGPTInventoryStructuredResult {
  return codexgptInventoryOutputSchema.parse({
    codexgpt_tool: "codexgpt_inventory",
    codexgpt_title: "CodexGPT Inventory",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: CODEXGPT_INVENTORY_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}

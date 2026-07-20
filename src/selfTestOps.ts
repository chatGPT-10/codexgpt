import fsp from "node:fs/promises";
import { z } from "zod";
import type { CodexGPTConfig } from "./config.js";
import { probeAuditReadiness } from "./audit/diagnostics.js";
import { probeBashAvailability, runBash } from "./bashOps.js";
import { codexgptInventory } from "./capabilitiesOps.js";
import {
  editTextFile,
  prepareWorkspaceTextBatch,
  writeTextFile,
  type PreparedWorkspaceTextBatch
} from "./fsOps.js";
import { gitStatus } from "./gitOps.js";
import type { PathGuard, Workspace } from "./guard.js";
import {
  buildPreparedProContext,
  buildProContext,
  prepareProContextRequest
} from "./proContext.js";
import { identityForStdio } from "./policy/identity.js";
import { inspectPolicyConfiguration, policyIdentityScopes } from "./policy/runtime.js";
import {
  CODEXGPT_SELF_TEST_ARTIFACT,
  codexgptSelfTestDataSchema,
  codexgptSelfTestPolicySchema,
  codexgptSelfTestRequestSchema,
  codexgptSelfTestTermsBoundarySchema,
  type CodexGPTSelfTestCheck,
  type CodexGPTSelfTestData,
  type CodexGPTSelfTestRequest
} from "./tools/schemas/codexgptSelfTest.js";

const SELF_TEST_SCAFFOLD_BEFORE = [
  "# CodexGPT Self Test",
  "",
  "This file is managed by CodexGPT's local self-test.",
  "marker: before",
  ""
].join("\n");

const SELF_TEST_SCAFFOLD_AFTER = SELF_TEST_SCAFFOLD_BEFORE.replace(
  "marker: before",
  "marker: after"
);

const safeToolNameSchema = z.string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .refine((value) => !/(?:bearer|authorization|api[_-]?key|access[_-]?token|password|secret|sk-)/i.test(value));

const providerRequestSchema = codexgptSelfTestRequestSchema;
const providerOutcomeSchema = z.enum(["pass", "warn", "fail", "skipped"]);

const providerResultSchema = z.object({
  workspace_id: z.string().min(1).max(160),
  root: z.string().min(1).max(4096),
  tool_mode: z.enum(["minimal", "standard", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  bash_mode: z.enum(["off", "safe", "full"]),
  bash_session_guard: z.object({
    required: z.boolean(),
    configured: z.boolean()
  }).strict(),
  http_auth: z.object({
    enabled: z.boolean(),
    required_for_public_access: z.boolean()
  }).strict(),
  request: providerRequestSchema,
  expected_tools: z.array(safeToolNameSchema).max(28),
  registered_tools: z.array(safeToolNameSchema).max(28),
  inventory: z.object({
    outcome: providerOutcomeSchema,
    reason_code: z.enum(["INVENTORY_TRUNCATED", "INVENTORY_FAILED"]).nullable(),
    skill_count: z.number().int().min(0).max(120),
    mcp_server_count: z.number().int().min(0).max(120),
    skills_truncated: z.boolean(),
    mcp_servers_truncated: z.boolean()
  }).strict(),
  git: z.object({
    repository_state: z.enum(["clean", "changed", "not_git", "unavailable"]),
    changed_entries: z.number().int().nonnegative()
  }).strict(),
  write_probe: z.object({
    outcome: providerOutcomeSchema,
    reason_code: z.enum([
      "WRITE_EDIT_PROBE_PASSED",
      "WRITE_EDIT_PROBE_DISABLED",
      "WRITE_EDIT_PROBE_UNAVAILABLE",
      "WRITE_EDIT_PROBE_CONFLICT",
      "WRITE_EDIT_PROBE_FAILED"
    ]),
    probe_artifact: z.literal(CODEXGPT_SELF_TEST_ARTIFACT).nullable(),
    files_touched: z.union([
      z.tuple([]),
      z.tuple([z.literal(CODEXGPT_SELF_TEST_ARTIFACT)])
    ])
  }).strict(),
  pro_context_probe: z.object({
    outcome: providerOutcomeSchema,
    reason_code: z.enum([
      "PRO_CONTEXT_PROBE_PASSED",
      "PRO_CONTEXT_PROBE_DISABLED",
      "PRO_CONTEXT_PROBE_UNAVAILABLE",
      "PRO_CONTEXT_PROBE_FAILED"
    ])
  }).strict(),
  bash_policy_probe: z.object({
    outcome: providerOutcomeSchema,
    reason_code: z.enum([
      "BASH_POLICY_PASSED",
      "BASH_POLICY_DISABLED",
      "BASH_POLICY_UNAVAILABLE",
      "BASH_POLICY_FULL",
      "BASH_POLICY_FAILED"
    ])
  }).strict(),
  audit_probe: z.object({
    outcome: providerOutcomeSchema,
    reason_code: z.enum([
      "AUDIT_READY",
      "AUDIT_DISABLED",
      "AUDIT_UNINITIALIZED",
      "AUDIT_BUSY",
      "AUDIT_RETENTION_INVALID",
      "AUDIT_INTEGRITY_FAILURE",
      "AUDIT_UNAVAILABLE"
    ]),
    checks: z.object({
      stateDirectoryValid: z.boolean(),
      installationKeyValid: z.boolean(),
      writerLockValid: z.boolean(),
      tailValid: z.boolean(),
      retentionValid: z.boolean()
    }).strict()
  }).strict(),
  policy: codexgptSelfTestPolicySchema,
  terms_boundary: codexgptSelfTestTermsBoundarySchema
}).strict();

export type CodexGPTSelfTestProviderResult = z.infer<typeof providerResultSchema>;

export interface CodexGPTSelfTestProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  request: CodexGPTSelfTestRequest;
  expectedTools: string[];
  registeredTools: string[];
}

export type CodexGPTSelfTestProvider = (
  context: CodexGPTSelfTestProviderContext
) => CodexGPTSelfTestProviderResult | Promise<CodexGPTSelfTestProviderResult>;

export interface PreparedCodexGPTSelfTestMutation {
  result: CodexGPTSelfTestProviderResult;
  prepared: PreparedWorkspaceTextBatch | null;
}

export class CodexGPTSelfTestInternalError extends Error {
  constructor() {
    super("codexgpt_self_test provider contract drift");
    this.name = "CodexGPTSelfTestInternalError";
  }
}

function sortedCopy(values: string[]): string[] {
  return [...values].sort((left, right) => left === right ? 0 : left < right ? -1 : 1);
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function exactRequest(left: CodexGPTSelfTestRequest, right: CodexGPTSelfTestRequest): boolean {
  return (
    left.write_probe === right.write_probe &&
    left.bash_probe === right.bash_probe &&
    left.pro_context_probe === right.pro_context_probe &&
    left.include_global_skills === right.include_global_skills &&
    left.max_skills === right.max_skills
  );
}

function samePath(left: string, right: string): boolean {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function gitState(status: string): CodexGPTSelfTestProviderResult["git"] {
  const trimmed = status.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes("not a git repository")) {
    return { repository_state: "not_git", changed_entries: 0 };
  }
  if (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git unavailable or failed:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ")
  ) {
    return { repository_state: "unavailable", changed_entries: 0 };
  }
  const changedEntries = status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "(no output)" && !line.startsWith("##"))
    .length;
  return changedEntries
    ? { repository_state: "changed", changed_entries: changedEntries }
    : { repository_state: "clean", changed_entries: 0 };
}

async function readExistingProbe(
  guard: PathGuard,
  workspace: Workspace
): Promise<string | null> {
  const resolved = guard.resolve(workspace, CODEXGPT_SELF_TEST_ARTIFACT, { forWrite: true });
  try {
    return await fsp.readFile(resolved.absPath, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    if (code === "ENOENT") return null;
    throw error;
  }
}

function isRecognizedLegacyProbe(content: string, workspace: Workspace): boolean {
  const lines = content.split("\n");
  if (
    lines.length !== 6 ||
    lines[0] !== "# CodexGPT Self Test" ||
    lines[1] !== "" ||
    (lines[4] !== "marker: before" && lines[4] !== "marker: after") ||
    lines[5] !== ""
  ) {
    return false;
  }
  const updatedPrefix = "Updated: ";
  const workspacePrefix = "Workspace: ";
  if (!lines[2]?.startsWith(updatedPrefix) || !lines[3]?.startsWith(workspacePrefix)) {
    return false;
  }
  const timestamp = lines[2].slice(updatedPrefix.length);
  const workspaceRoot = lines[3].slice(workspacePrefix.length);
  const parsedTimestamp = Date.parse(timestamp);
  return (
    Number.isFinite(parsedTimestamp) &&
    new Date(parsedTimestamp).toISOString() === timestamp &&
    workspaceRoot === workspace.root
  );
}

async function runWriteProbe(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: CodexGPTSelfTestRequest
): Promise<CodexGPTSelfTestProviderResult["write_probe"]> {
  if (!request.write_probe) {
    return {
      outcome: "skipped",
      reason_code: "WRITE_EDIT_PROBE_DISABLED",
      probe_artifact: null,
      files_touched: []
    };
  }
  if (config.writeMode === "off") {
    return {
      outcome: "skipped",
      reason_code: "WRITE_EDIT_PROBE_UNAVAILABLE",
      probe_artifact: null,
      files_touched: []
    };
  }

  let existing: string | null;
  try {
    existing = await readExistingProbe(guard, workspace);
  } catch {
    return {
      outcome: "fail",
      reason_code: "WRITE_EDIT_PROBE_FAILED",
      probe_artifact: null,
      files_touched: []
    };
  }
  if (
    existing !== null &&
    existing !== SELF_TEST_SCAFFOLD_BEFORE &&
    existing !== SELF_TEST_SCAFFOLD_AFTER &&
    !isRecognizedLegacyProbe(existing, workspace)
  ) {
    return {
      outcome: "fail",
      reason_code: "WRITE_EDIT_PROBE_CONFLICT",
      probe_artifact: null,
      files_touched: []
    };
  }

  try {
    await writeTextFile(
      config,
      guard,
      workspace,
      CODEXGPT_SELF_TEST_ARTIFACT,
      SELF_TEST_SCAFFOLD_BEFORE,
      { createDirs: true, overwrite: true }
    );
    await editTextFile(
      config,
      guard,
      workspace,
      CODEXGPT_SELF_TEST_ARTIFACT,
      "marker: before",
      "marker: after",
      { expectedReplacements: 1 }
    );
    const readBack = await readExistingProbe(guard, workspace);
    if (readBack !== SELF_TEST_SCAFFOLD_AFTER) {
      throw new Error("probe verification failed");
    }
    return {
      outcome: "pass",
      reason_code: "WRITE_EDIT_PROBE_PASSED",
      probe_artifact: CODEXGPT_SELF_TEST_ARTIFACT,
      files_touched: [CODEXGPT_SELF_TEST_ARTIFACT]
    };
  } catch {
    return {
      outcome: "fail",
      reason_code: "WRITE_EDIT_PROBE_FAILED",
      probe_artifact: null,
      files_touched: []
    };
  }
}

async function runProContextProbe(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: CodexGPTSelfTestRequest,
  writeProbe: CodexGPTSelfTestProviderResult["write_probe"]
): Promise<CodexGPTSelfTestProviderResult["pro_context_probe"]> {
  if (!request.pro_context_probe) {
    return { outcome: "skipped", reason_code: "PRO_CONTEXT_PROBE_DISABLED" };
  }
  if (writeProbe.probe_artifact !== CODEXGPT_SELF_TEST_ARTIFACT) {
    return { outcome: "skipped", reason_code: "PRO_CONTEXT_PROBE_UNAVAILABLE" };
  }
  try {
    const built = await buildProContext(config, guard, workspace, {
      title: "CodexGPT Self Test Context",
      selectedPaths: [CODEXGPT_SELF_TEST_ARTIFACT],
      includeImportantFiles: false,
      includeChangedFiles: false,
      includeDiff: false,
      includeAiBridge: false,
      maxFiles: 4,
      maxTotalBytes: 80_000
    });
    const exactOnly =
      built.filesIncluded.length === 1 &&
      built.filesIncluded[0] === CODEXGPT_SELF_TEST_ARTIFACT;
    return exactOnly
      ? { outcome: "pass", reason_code: "PRO_CONTEXT_PROBE_PASSED" }
      : { outcome: "fail", reason_code: "PRO_CONTEXT_PROBE_FAILED" };
  } catch {
    return { outcome: "fail", reason_code: "PRO_CONTEXT_PROBE_FAILED" };
  }
}

async function runBashPolicyProbe(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: CodexGPTSelfTestRequest
): Promise<CodexGPTSelfTestProviderResult["bash_policy_probe"]> {
  if (!request.bash_probe) {
    return { outcome: "skipped", reason_code: "BASH_POLICY_DISABLED" };
  }
  if (config.bashMode === "off") {
    return { outcome: "skipped", reason_code: "BASH_POLICY_UNAVAILABLE" };
  }
  const availability = probeBashAvailability();
  if (!availability.available) {
    return { outcome: "fail", reason_code: "BASH_POLICY_FAILED" };
  }

  const options = { timeoutMs: 10_000, sessionId: config.bashSessionId };
  try {
    const pwd = await runBash(config, guard, workspace, "pwd", options);
    if (pwd.exitCode !== 0) {
      return { outcome: "fail", reason_code: "BASH_POLICY_FAILED" };
    }
    if (config.bashMode === "full") {
      return { outcome: "warn", reason_code: "BASH_POLICY_FULL" };
    }
    try {
      await runBash(config, guard, workspace, "ls $HOME", options);
      return { outcome: "fail", reason_code: "BASH_POLICY_FAILED" };
    } catch {
      return { outcome: "pass", reason_code: "BASH_POLICY_PASSED" };
    }
  } catch {
    return { outcome: "fail", reason_code: "BASH_POLICY_FAILED" };
  }
}

export function normalizeCodexGPTSelfTestRequest(args: Record<string, unknown>): CodexGPTSelfTestRequest {
  return codexgptSelfTestRequestSchema.parse({
    write_probe: args.write_probe === undefined ? true : args.write_probe,
    bash_probe: args.bash_probe === undefined ? true : args.bash_probe,
    pro_context_probe: args.pro_context_probe === undefined ? true : args.pro_context_probe,
    include_global_skills: args.include_global_skills === undefined ? true : args.include_global_skills,
    max_skills: args.max_skills === undefined ? 40 : args.max_skills
  });
}

export function safeCodexGPTSelfTestWorkspaceId(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(text)
    ? text
    : "workspace-id-omitted";
}

function policyFacts(config: CodexGPTConfig): CodexGPTSelfTestProviderResult["policy"] {
  let identityValid = false;
  try {
    identityForStdio(policyIdentityScopes(config));
    identityValid = true;
  } catch {
    identityValid = false;
  }

  try {
    const inspection = inspectPolicyConfiguration(config);
    return {
      engine_mode: config.policyEngineMode ?? "legacy",
      profile_id: inspection.profileId,
      schema_valid: true,
      profile_valid: true,
      revision_valid: /^policy_[a-f0-9]{24}$/.test(inspection.policyRevision),
      identity_valid: identityValid,
      enforcement_declared: Boolean(inspection.backendId && inspection.evidenceRevision),
      policy_revision: inspection.policyRevision,
      hard_policy_revision: inspection.hardPolicyRevision,
      backend_id: inspection.backendId,
      evidence_revision: inspection.evidenceRevision,
      missing_capabilities: [...inspection.missingCapabilities]
    };
  } catch {
    return {
      engine_mode: config.policyEngineMode ?? "legacy",
      profile_id: config.permissionProfileId ?? "compat-v1",
      schema_valid: true,
      profile_valid: false,
      revision_valid: false,
      identity_valid: identityValid,
      enforcement_declared: true,
      policy_revision: "policy-unavailable",
      hard_policy_revision: "hard-policy-v1",
      backend_id: "codexgpt-node-broker",
      evidence_revision: "node-broker-v1",
      missing_capabilities: []
    };
  }
}

export const defaultCodexGPTSelfTestProvider: CodexGPTSelfTestProvider = async (context) => {
  let inventory: CodexGPTSelfTestProviderResult["inventory"];
  try {
    const result = await codexgptInventory(context.config, context.workspace, {
      includeGlobalSkills: context.request.include_global_skills,
      includeMcpServers: true,
      maxSkills: context.request.max_skills
    });
    const truncated = result.skillsTruncated || result.mcpServersTruncated;
    inventory = {
      outcome: truncated ? "warn" : "pass",
      reason_code: truncated ? "INVENTORY_TRUNCATED" : null,
      skill_count: result.skills.length,
      mcp_server_count: result.mcpServers.length,
      skills_truncated: result.skillsTruncated,
      mcp_servers_truncated: result.mcpServersTruncated
    };
  } catch {
    inventory = {
      outcome: "fail",
      reason_code: "INVENTORY_FAILED",
      skill_count: 0,
      mcp_server_count: 0,
      skills_truncated: false,
      mcp_servers_truncated: false
    };
  }

  let git: CodexGPTSelfTestProviderResult["git"];
  try {
    git = gitState(gitStatus(context.config, context.workspace));
  } catch {
    git = { repository_state: "unavailable", changed_entries: 0 };
  }

  const writeProbe = await runWriteProbe(
    context.config,
    context.guard,
    context.workspace,
    context.request
  );
  const proContextProbe = await runProContextProbe(
    context.config,
    context.guard,
    context.workspace,
    context.request,
    writeProbe
  );
  const bashPolicyProbe = await runBashPolicyProbe(
    context.config,
    context.guard,
    context.workspace,
    context.request
  );
  const auditProbe = await probeAuditReadiness({
    auditMode: context.config.auditMode ?? "auto",
    auditRetention: context.config.auditRetention ?? {
      maxAgeDays: 30,
      maxClosedBytes: 100 * 1024 * 1024
    }
  });

  return {
    workspace_id: context.workspace.id,
    root: context.workspace.root,
    tool_mode: context.config.toolMode,
    write_mode: context.config.writeMode,
    bash_mode: context.config.bashMode,
    bash_session_guard: {
      required: context.config.requireBashSession,
      configured: Boolean(context.config.bashSessionId)
    },
    http_auth: {
      enabled: Boolean(context.config.authToken),
      required_for_public_access: context.config.requireHttpToken
    },
    request: { ...context.request },
    expected_tools: [...context.expectedTools],
    registered_tools: [...context.registeredTools],
    inventory,
    git,
    write_probe: writeProbe,
    pro_context_probe: proContextProbe,
    bash_policy_probe: bashPolicyProbe,
    audit_probe: {
      outcome: auditProbe.outcome,
      reason_code: auditProbe.reasonCode,
      checks: auditProbe.checks
    },
    policy: policyFacts(context.config),
    terms_boundary: {
      local_workspace_bridge: true,
      provides_models: false,
      proxies_model_access: false,
      bypasses_quotas: false,
      remote_agent_execution: false
    }
  };
};

async function runAtomicProContextProbe(
  context: CodexGPTSelfTestProviderContext
): Promise<CodexGPTSelfTestProviderResult["pro_context_probe"]> {
  if (!context.request.pro_context_probe) {
    return { outcome: "skipped", reason_code: "PRO_CONTEXT_PROBE_DISABLED" };
  }
  try {
    const request = await prepareProContextRequest(context.config, context.guard, context.workspace, {
      title: "CodexGPT Self Test Context",
      selectedPaths: [CODEXGPT_SELF_TEST_ARTIFACT],
      includeImportantFiles: false,
      includeChangedFiles: false,
      includeDiff: false,
      includeAiBridge: false,
      maxFiles: 4,
      maxTotalBytes: 80_000
    });
    const built = await buildPreparedProContext(
      context.config,
      context.guard,
      context.workspace,
      request,
      [],
      {},
      { [CODEXGPT_SELF_TEST_ARTIFACT]: SELF_TEST_SCAFFOLD_AFTER }
    );
    return built.filesIncluded.length === 1 && built.filesIncluded[0] === CODEXGPT_SELF_TEST_ARTIFACT
      ? { outcome: "pass", reason_code: "PRO_CONTEXT_PROBE_PASSED" }
      : { outcome: "fail", reason_code: "PRO_CONTEXT_PROBE_FAILED" };
  } catch {
    return { outcome: "fail", reason_code: "PRO_CONTEXT_PROBE_FAILED" };
  }
}

export async function prepareAtomicCodexGPTSelfTest(
  context: CodexGPTSelfTestProviderContext
): Promise<PreparedCodexGPTSelfTestMutation> {
  if (!context.request.write_probe || context.config.writeMode === "off") {
    return { result: await defaultCodexGPTSelfTestProvider(context), prepared: null };
  }
  let existing: string | null;
  try {
    existing = await readExistingProbe(context.guard, context.workspace);
  } catch {
    existing = null;
  }
  if (
    existing !== null &&
    existing !== SELF_TEST_SCAFFOLD_BEFORE &&
    existing !== SELF_TEST_SCAFFOLD_AFTER &&
    !isRecognizedLegacyProbe(existing, context.workspace)
  ) {
    const baseline = await defaultCodexGPTSelfTestProvider({
      ...context,
      request: { ...context.request, write_probe: false, pro_context_probe: false }
    });
    return {
      result: {
        ...baseline,
        request: { ...context.request },
        write_probe: {
          outcome: "fail",
          reason_code: "WRITE_EDIT_PROBE_CONFLICT",
          probe_artifact: null,
          files_touched: []
        },
        pro_context_probe: { outcome: "skipped", reason_code: "PRO_CONTEXT_PROBE_UNAVAILABLE" }
      },
      prepared: null
    };
  }

  const baseline = await defaultCodexGPTSelfTestProvider({
    ...context,
    request: { ...context.request, write_probe: false, pro_context_probe: false }
  });
  const prepared = await prepareWorkspaceTextBatch(
    context.config,
    context.guard,
    context.workspace,
    [{ path: CODEXGPT_SELF_TEST_ARTIFACT, content: SELF_TEST_SCAFFOLD_AFTER, mode: "replace" }]
  );
  return {
    result: {
      ...baseline,
      request: { ...context.request },
      write_probe: {
        outcome: "pass",
        reason_code: "WRITE_EDIT_PROBE_PASSED",
        probe_artifact: CODEXGPT_SELF_TEST_ARTIFACT,
        files_touched: [CODEXGPT_SELF_TEST_ARTIFACT]
      },
      pro_context_probe: await runAtomicProContextProbe(context)
    },
    prepared
  };
}

function check(
  name: CodexGPTSelfTestCheck["name"],
  status: CodexGPTSelfTestCheck["status"],
  code: CodexGPTSelfTestCheck["code"],
  message: string
): CodexGPTSelfTestCheck {
  return { name, status, code, message };
}

function deriveChecks(
  facts: CodexGPTSelfTestProviderResult,
  missingTools: string[],
  unexpectedTools: string[]
): CodexGPTSelfTestCheck[] {
  const toolSetMatches = missingTools.length === 0 && unexpectedTools.length === 0;
  const writeModeCheck = facts.write_mode === "workspace"
    ? check("write_mode", "pass", "WRITE_MODE_VALID", "Write mode is workspace.")
    : check("write_mode", "warn", "WRITE_MODE_RESTRICTED", `Write mode is ${facts.write_mode}.`);
  const bashModeCheck = facts.bash_mode === "full"
    ? check("bash_mode", "warn", "BASH_MODE_FULL", "Bash mode is full.")
    : check("bash_mode", "pass", "BASH_MODE_VALID", `Bash mode is ${facts.bash_mode}.`);
  const authCheck = facts.http_auth.enabled
    ? check("http_auth", "pass", "HTTP_AUTH_ENABLED", "HTTP authentication is enabled.")
    : check("http_auth", "warn", "HTTP_AUTH_LOCAL_ONLY", "HTTP authentication is disabled for local-only use.");
  const toolSetCheck = toolSetMatches
    ? check("registered_tool_set", "pass", "TOOL_SET_MATCH", "Expected and registered tool sets match.")
    : check("registered_tool_set", "fail", "TOOL_SET_MISMATCH", "Expected and registered tool sets differ.");

  let inventoryCheck: CodexGPTSelfTestCheck;
  if (facts.inventory.outcome === "fail") {
    inventoryCheck = check("inventory", "fail", "INVENTORY_FAILED", "The capability inventory could not be collected.");
  } else if (facts.inventory.outcome === "warn") {
    inventoryCheck = check("inventory", "warn", "INVENTORY_TRUNCATED", "Inventory results reached a configured limit.");
  } else {
    inventoryCheck = check(
      "inventory",
      "pass",
      "INVENTORY_READY",
      `Inventory inspected ${facts.inventory.skill_count} Skills and ${facts.inventory.mcp_server_count} MCP servers.`
    );
  }

  const gitCheck = facts.git.repository_state === "clean"
    ? check("git_status", "pass", "GIT_CLEAN", "The workspace Git state is clean.")
    : facts.git.repository_state === "changed"
      ? check("git_status", "warn", "GIT_CHANGED", `The workspace Git state has ${facts.git.changed_entries} changed entries.`)
      : facts.git.repository_state === "not_git"
        ? check("git_status", "warn", "NOT_GIT", "The workspace is not a Git repository.")
        : check("git_status", "warn", "GIT_UNAVAILABLE", "The workspace Git state is unavailable.");

  const writeMessages: Record<CodexGPTSelfTestProviderResult["write_probe"]["reason_code"], string> = {
    WRITE_EDIT_PROBE_PASSED: "The fixed write/edit probe passed.",
    WRITE_EDIT_PROBE_DISABLED: "The write/edit probe was disabled by request.",
    WRITE_EDIT_PROBE_UNAVAILABLE: "The write/edit probe was unavailable in the current write mode.",
    WRITE_EDIT_PROBE_CONFLICT: "The fixed probe artifact contains unrecognized content and was not modified.",
    WRITE_EDIT_PROBE_FAILED: "The fixed write/edit probe failed."
  };
  const writeCheck = check(
    "write_edit_probe",
    facts.write_probe.outcome,
    facts.write_probe.reason_code,
    writeMessages[facts.write_probe.reason_code]
  );

  const proMessages: Record<CodexGPTSelfTestProviderResult["pro_context_probe"]["reason_code"], string> = {
    PRO_CONTEXT_PROBE_PASSED: "The selected-only Pro context probe passed.",
    PRO_CONTEXT_PROBE_DISABLED: "The selected-only Pro context probe was disabled by request.",
    PRO_CONTEXT_PROBE_UNAVAILABLE: "The selected-only Pro context probe was unavailable without the fixed artifact.",
    PRO_CONTEXT_PROBE_FAILED: "The selected-only Pro context probe failed."
  };
  const proCheck = check(
    "selected_only_pro_context",
    facts.pro_context_probe.outcome,
    facts.pro_context_probe.reason_code,
    proMessages[facts.pro_context_probe.reason_code]
  );

  const bashMessages: Record<CodexGPTSelfTestProviderResult["bash_policy_probe"]["reason_code"], string> = {
    BASH_POLICY_PASSED: "The safe Bash policy probe passed.",
    BASH_POLICY_DISABLED: "The Bash policy probe was disabled by request.",
    BASH_POLICY_UNAVAILABLE: "The Bash policy probe was unavailable in Bash-off mode.",
    BASH_POLICY_FULL: "Full Bash is enabled for this trusted local workspace.",
    BASH_POLICY_FAILED: "The Bash policy probe failed."
  };
  const bashCheck = check(
    "bash_policy",
    facts.bash_policy_probe.outcome,
    facts.bash_policy_probe.reason_code,
    bashMessages[facts.bash_policy_probe.reason_code]
  );
  const policySchemaCheck = facts.policy.schema_valid
    ? check("policy_schema", "pass", "POLICY_SCHEMA_VALID", "The Policy V1 schema is valid.")
    : check("policy_schema", "fail", "POLICY_SCHEMA_INVALID", "The Policy V1 schema is invalid.");
  const policyProfileCheck = facts.policy.profile_valid
    ? check("policy_profile", "pass", "POLICY_PROFILE_VALID", "The Permission Profile compiled successfully.")
    : check("policy_profile", "fail", "POLICY_PROFILE_INVALID", "The Permission Profile could not be compiled.");
  const policyRevisionCheck = facts.policy.revision_valid
    ? check("policy_revision", "pass", "POLICY_REVISION_VALID", "The policy revision is deterministic and available.")
    : check("policy_revision", "fail", "POLICY_REVISION_INVALID", "The policy revision is unavailable or invalid.");
  const policyIdentityCheck = facts.policy.identity_valid
    ? check("policy_identity", "pass", "POLICY_IDENTITY_VALID", "The request identity mapping is valid.")
    : check("policy_identity", "fail", "POLICY_IDENTITY_INVALID", "The request identity mapping is invalid.");
  const policyEnforcementCheck = facts.policy.enforcement_declared
    ? check("policy_enforcement", "pass", "POLICY_ENFORCEMENT_DECLARED", "The enforcement capability limits are declared.")
    : check("policy_enforcement", "fail", "POLICY_ENFORCEMENT_INVALID", "The enforcement capability limits are unavailable.");
  const auditMessages: Record<CodexGPTSelfTestProviderResult["audit_probe"]["reason_code"], string> = {
    AUDIT_READY: "Persistent audit state, key, writer lock, tail, and retention are ready.",
    AUDIT_DISABLED: "Persistent audit is explicitly disabled.",
    AUDIT_UNINITIALIZED: "Persistent audit is configured but its installation state is not initialized yet.",
    AUDIT_BUSY: "Persistent audit is healthy enough to inspect, but the writer lock is currently busy.",
    AUDIT_RETENTION_INVALID: "Persistent audit retention settings are invalid.",
    AUDIT_INTEGRITY_FAILURE: "Persistent audit evidence failed integrity verification.",
    AUDIT_UNAVAILABLE: "Persistent audit readiness could not be verified."
  };
  const auditCheck = check(
    "persistent_audit",
    facts.audit_probe.outcome,
    facts.audit_probe.reason_code,
    auditMessages[facts.audit_probe.reason_code]
  );

  return [
    check("workspace", "pass", "WORKSPACE_READY", "Workspace access is available."),
    check("tool_mode", "pass", "TOOL_MODE_VALID", `Tool mode is ${facts.tool_mode}.`),
    writeModeCheck,
    bashModeCheck,
    authCheck,
    toolSetCheck,
    inventoryCheck,
    gitCheck,
    writeCheck,
    proCheck,
    bashCheck,
    policySchemaCheck,
    policyProfileCheck,
    policyRevisionCheck,
    policyIdentityCheck,
    policyEnforcementCheck,
    auditCheck,
    check("terms_boundary", "pass", "TERMS_BOUNDARY_VALID", "The local workspace bridge terms boundary is intact.")
  ];
}

export function buildCodexGPTSelfTestData(
  rawFacts: unknown,
  context: CodexGPTSelfTestProviderContext
): CodexGPTSelfTestData {
  if (
    rawFacts &&
    typeof rawFacts === "object" &&
    "expected_tools" in rawFacts &&
    "registered_tools" in rawFacts &&
    (rawFacts as { expected_tools?: unknown }).expected_tools ===
      (rawFacts as { registered_tools?: unknown }).registered_tools
  ) {
    throw new CodexGPTSelfTestInternalError();
  }

  const parsed = providerResultSchema.safeParse(rawFacts);
  if (!parsed.success) throw new CodexGPTSelfTestInternalError();
  const facts = parsed.data;

  const inventoryValid =
    facts.inventory.outcome === "pass"
      ? facts.inventory.reason_code === null &&
        !facts.inventory.skills_truncated &&
        !facts.inventory.mcp_servers_truncated
      : facts.inventory.outcome === "warn"
        ? facts.inventory.reason_code === "INVENTORY_TRUNCATED" &&
          (facts.inventory.skills_truncated || facts.inventory.mcp_servers_truncated) &&
          (!facts.inventory.skills_truncated || facts.inventory.skill_count === context.request.max_skills) &&
          (!facts.inventory.mcp_servers_truncated || facts.inventory.mcp_server_count === 120)
        : facts.inventory.outcome === "fail"
          ? facts.inventory.reason_code === "INVENTORY_FAILED" &&
            facts.inventory.skill_count === 0 &&
            facts.inventory.mcp_server_count === 0 &&
            !facts.inventory.skills_truncated &&
            !facts.inventory.mcp_servers_truncated
          : false;
  const writeProbeValid =
    (facts.write_probe.outcome === "pass" && facts.write_probe.reason_code === "WRITE_EDIT_PROBE_PASSED") ||
    (facts.write_probe.outcome === "skipped" && (
      facts.write_probe.reason_code === "WRITE_EDIT_PROBE_DISABLED" ||
      facts.write_probe.reason_code === "WRITE_EDIT_PROBE_UNAVAILABLE"
    )) ||
    (facts.write_probe.outcome === "fail" && (
      facts.write_probe.reason_code === "WRITE_EDIT_PROBE_CONFLICT" ||
      facts.write_probe.reason_code === "WRITE_EDIT_PROBE_FAILED"
    ));
  const proContextProbeValid =
    (facts.pro_context_probe.outcome === "pass" && facts.pro_context_probe.reason_code === "PRO_CONTEXT_PROBE_PASSED") ||
    (facts.pro_context_probe.outcome === "skipped" && (
      facts.pro_context_probe.reason_code === "PRO_CONTEXT_PROBE_DISABLED" ||
      facts.pro_context_probe.reason_code === "PRO_CONTEXT_PROBE_UNAVAILABLE"
    )) ||
    (facts.pro_context_probe.outcome === "fail" && facts.pro_context_probe.reason_code === "PRO_CONTEXT_PROBE_FAILED");
  const bashPolicyProbeValid =
    (facts.bash_policy_probe.outcome === "pass" && facts.bash_policy_probe.reason_code === "BASH_POLICY_PASSED") ||
    (facts.bash_policy_probe.outcome === "skipped" && (
      facts.bash_policy_probe.reason_code === "BASH_POLICY_DISABLED" ||
      facts.bash_policy_probe.reason_code === "BASH_POLICY_UNAVAILABLE"
    )) ||
    (facts.bash_policy_probe.outcome === "warn" && facts.bash_policy_probe.reason_code === "BASH_POLICY_FULL") ||
    (facts.bash_policy_probe.outcome === "fail" && facts.bash_policy_probe.reason_code === "BASH_POLICY_FAILED");
  const auditProbeValid =
    (facts.audit_probe.outcome === "pass" && facts.audit_probe.reason_code === "AUDIT_READY") ||
    (facts.audit_probe.outcome === "skipped" && facts.audit_probe.reason_code === "AUDIT_DISABLED") ||
    (facts.audit_probe.outcome === "warn" && (
      facts.audit_probe.reason_code === "AUDIT_UNINITIALIZED" ||
      facts.audit_probe.reason_code === "AUDIT_BUSY"
    )) ||
    (facts.audit_probe.outcome === "fail" && (
      facts.audit_probe.reason_code === "AUDIT_RETENTION_INVALID" ||
      facts.audit_probe.reason_code === "AUDIT_INTEGRITY_FAILURE" ||
      facts.audit_probe.reason_code === "AUDIT_UNAVAILABLE"
    ));
  if (!inventoryValid || !writeProbeValid || !proContextProbeValid || !bashPolicyProbeValid || !auditProbeValid) {
    throw new CodexGPTSelfTestInternalError();
  }

  if (
    facts.workspace_id !== context.workspace.id ||
    facts.root !== context.workspace.root ||
    facts.tool_mode !== context.config.toolMode ||
    facts.write_mode !== context.config.writeMode ||
    facts.bash_mode !== context.config.bashMode ||
    facts.bash_session_guard.required !== context.config.requireBashSession ||
    facts.bash_session_guard.configured !== Boolean(context.config.bashSessionId) ||
    facts.http_auth.enabled !== Boolean(context.config.authToken) ||
    facts.http_auth.required_for_public_access !== context.config.requireHttpToken ||
    facts.policy.engine_mode !== (context.config.policyEngineMode ?? "legacy") ||
    facts.policy.profile_id !== (context.config.permissionProfileId ?? "compat-v1") ||
    !exactRequest(facts.request, context.request)
  ) {
    throw new CodexGPTSelfTestInternalError();
  }
  if (
    hasDuplicates(facts.expected_tools) ||
    hasDuplicates(facts.registered_tools) ||
    JSON.stringify(facts.expected_tools) !== JSON.stringify(sortedCopy(facts.expected_tools)) ||
    JSON.stringify(facts.registered_tools) !== JSON.stringify(sortedCopy(facts.registered_tools)) ||
    !samePath(facts.root, context.workspace.root)
  ) {
    throw new CodexGPTSelfTestInternalError();
  }

  const expectedTools = [...facts.expected_tools];
  const registeredTools = [...facts.registered_tools];
  const missingTools = expectedTools.filter((name) => !registeredTools.includes(name));
  const unexpectedTools = registeredTools.filter((name) => !expectedTools.includes(name));
  const checks = deriveChecks(facts, missingTools, unexpectedTools);
  const counts = {
    total: 18 as const,
    passed: checks.filter((item) => item.status === "pass").length,
    warned: checks.filter((item) => item.status === "warn").length,
    failed: checks.filter((item) => item.status === "fail").length,
    skipped: checks.filter((item) => item.status === "skipped").length
  };
  const status = counts.failed > 0
    ? "fail" as const
    : counts.warned > 0 || counts.skipped > 0
      ? "warn" as const
      : "pass" as const;

  const data = {
    workspace_id: facts.workspace_id,
    root: facts.root,
    status,
    counts,
    tool_mode: facts.tool_mode,
    write_mode: facts.write_mode,
    bash_mode: facts.bash_mode,
    bash_session_guard: facts.bash_session_guard,
    http_auth: facts.http_auth,
    request: facts.request,
    expected_tools: expectedTools,
    registered_tools: registeredTools,
    missing_tools: missingTools,
    unexpected_tools: unexpectedTools,
    tool_set_matches: missingTools.length === 0 && unexpectedTools.length === 0,
    inventory: {
      skill_count: facts.inventory.skill_count,
      mcp_server_count: facts.inventory.mcp_server_count,
      skills_truncated: facts.inventory.skills_truncated,
      mcp_servers_truncated: facts.inventory.mcp_servers_truncated
    },
    git: facts.git,
    policy: facts.policy,
    probe_artifact: facts.write_probe.probe_artifact,
    files_touched: facts.write_probe.files_touched,
    checks,
    terms_boundary: facts.terms_boundary
  };

  const validated = codexgptSelfTestDataSchema.safeParse(data);
  if (!validated.success) throw new CodexGPTSelfTestInternalError();
  return validated.data;
}

export function codexgptSelfTestHumanText(data: CodexGPTSelfTestData): string {
  return [
    "# CodexGPT Self Test",
    "",
    `Status: ${data.status}`,
    `Checks: ${data.counts.passed} pass, ${data.counts.warned} warn, ${data.counts.failed} fail, ${data.counts.skipped} skipped`,
    `Tool set: ${data.tool_set_matches ? "match" : "mismatch"}`,
    `Probe artifact: ${data.probe_artifact ?? "none"}`,
    "",
    "## Checks",
    "",
    ...data.checks.map((item) => `- ${item.status.toUpperCase()} ${item.name} [${item.code}]: ${item.message}`),
    "",
    "CodexGPT is a local workspace bridge. It does not provide models, proxy model access, bypass quotas, or execute agents."
  ].join("\n");
}

export function codexgptSelfTestFailureText(code: string, message: string): string {
  return [
    "# CodexGPT Self Test Error",
    "",
    `Code: ${code}`,
    message
  ].join("\n");
}

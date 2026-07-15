import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import {
  aiBridgeScaffoldWrites,
  ensureAiBridge,
  makeUnifiedDiff,
  prepareWorkspaceTextBatch,
  writeTextFile,
  type DiffResult,
  type PreparedWorkspaceTextBatch
} from "./fsOps.js";
import { PathGuard, type Workspace } from "./guard.js";
import { hasSecretValue } from "./redact.js";
import {
  HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX,
  HANDOFF_TO_AGENT_LOG_NAMES,
  HANDOFF_TO_AGENT_SCAFFOLD_NAMES
} from "./tools/schemas/handoffToAgent.js";

export type HandoffOperationCode =
  | "REQUEST_INVALID"
  | "OUTPUT_PATH_BLOCKED"
  | "OUTPUT_PATH_OUTSIDE_WORKSPACE"
  | "OUTPUT_PATH_INVALID"
  | "EXISTING_PLAN_TOO_LARGE"
  | "EXISTING_PLAN_NOT_TEXT"
  | "EXISTING_PLAN_READ_FAILED"
  | "PLAN_TOO_LARGE"
  | "PLAN_SECRET_BLOCKED"
  | "SCAFFOLD_WRITE_FAILED"
  | "PLAN_WRITE_FAILED"
  | "LOG_WRITE_FAILED"
  | "HANDOFF_WRITE_FAILED";

export type HandoffRequestSource = "agent" | "agent_name" | "model" | "title" | "plan" | "append";

export class HandoffOperationError extends Error {
  constructor(
    readonly code: HandoffOperationCode,
    readonly source?: HandoffRequestSource
  ) {
    super(code);
    this.name = "HandoffOperationError";
  }
}

export interface AgentHandoffRequestOptions {
  agent?: unknown;
  agentName?: unknown;
  model?: unknown;
  title?: unknown;
  plan?: unknown;
  append: unknown;
  eventName: "handoff_to_agent" | "handoff_to_codex";
  updatedAt: string;
}

export interface PreparedAgentHandoffRequest {
  agent: string;
  agentName: string;
  model?: string;
  title: string;
  plan: string;
  appendRequested: boolean;
  eventName: "handoff_to_agent" | "handoff_to_codex";
  updatedAt: string;
  planPath: string;
  statusPath: string;
  legacyCodexStatusPath: string;
  diffPath: string;
  logPath: string;
  executionLogPath: string;
  scaffoldPaths: readonly string[];
  body: string;
  prompt: string;
}

export interface PreparedAgentHandoffOutput {
  expectedCreatedContextFiles: readonly string[];
  planFileExistedBefore: boolean;
  priorPlanAvailable: boolean;
  appendApplied: boolean;
  previousText: string;
  previousBytes: number;
  finalPlan: string;
  planBytes: number;
  planSha256: string;
  diff: DiffResult;
  diffBytes: number;
  diffTruncated: boolean;
  event: string;
  eventBytes: number;
  eventSha256: string;
}

export interface HandoffWriteResult {
  workspaceId: string;
  root: string;
  agent: string;
  agentName: string;
  model?: string;
  title: string;
  updatedAt: string;
  appendRequested: boolean;
  appendApplied: boolean;
  maxWriteBytes: number;
  planPath: string;
  statusPath: string;
  legacyCodexStatusPath: string;
  diffPath: string;
  logPath: string;
  executionLogPath: string;
  createdContextFiles: string[];
  planFileExistedBefore: boolean;
  priorPlanAvailable: boolean;
  previousText: string;
  previousBytes: number;
  finalPlan: string;
  planBytes: number;
  planSha256: string;
  additions: number;
  deletions: number;
  changed: boolean;
  diff: string;
  diffBytes: number;
  diffTruncated: boolean;
  loggedPaths: string[];
  event: string;
  eventBytes: number;
  eventSha256: string;
  prompt: string;
  promptBytes: number;
}

export interface AgentHandoffProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  request: PreparedAgentHandoffRequest;
  output: PreparedAgentHandoffOutput;
}

export interface PreparedAgentHandoffMutation {
  result: HandoffWriteResult;
  prepared: PreparedWorkspaceTextBatch;
}

const EMPTY_SCAFFOLD_PLAN = "# Current Plan\n\nNo plan written yet.";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestError(source: HandoffRequestSource): never {
  throw new HandoffOperationError("REQUEST_INVALID", source);
}

function collapseOneLine(
  value: unknown,
  source: Exclude<HandoffRequestSource, "agent" | "plan" | "append">,
  fallback: string,
  maxLength: number
): string {
  if (value !== undefined && value !== null && typeof value !== "string") requestError(source);
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) requestError(source);
  return text;
}

function optionalOneLine(value: unknown, source: "model", maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") requestError(source);
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) requestError(source);
  return text;
}

function normalizeAgent(value: unknown): string {
  if (value !== undefined && value !== null && typeof value !== "string") requestError("agent");
  const agent = String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase() || "custom";
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(agent)) requestError("agent");
  return agent;
}

function defaultAgentName(agent: string): string {
  if (agent === "codex") return "Codex";
  if (agent === "opencode") return "OpenCode";
  if (agent === "pi") return "Pi";
  return agent;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function agentCommandHint(agent: string, planPath: string, model?: string): string {
  const modelArg = model ? ` --model ${shellQuote(model)}` : " --model '<provider/model>'";
  const quotedPlanPath = shellQuote(planPath);
  if (agent === "opencode") return `opencode run${modelArg} "$(cat ${quotedPlanPath})"`;
  if (agent === "pi") return `pi run${modelArg} "$(cat ${quotedPlanPath})"`;
  if (agent === "codex") return `Read ${planPath} and execute it in small, reviewable steps.`;
  return `Run your local implementation agent manually with ${planPath} as the task input.`;
}

function buildPlanBody(options: {
  title: string;
  updatedAt: string;
  plan: string;
  workspace: Workspace;
  agent: string;
  agentName: string;
  model?: string;
  statusPath: string;
  diffPath: string;
  executionLogPath: string;
}): string {
  const modelLine = options.model ? `Model: ${options.model}\n` : "";
  return `# ${options.title}

Updated: ${options.updatedAt}
Workspace: ${options.workspace.root}
Target agent: ${options.agentName} (${options.agent})
${modelLine}
## Plan

${options.plan}

## Implementation contract

- Work from this plan in small, reviewable steps.
- Keep edits scoped to the requested task and existing project conventions.
- Run focused verification before handing work back.
- Update ${options.statusPath} with files touched, checks run, results, blockers, and review notes.
- Save the final review diff to ${options.diffPath} when practical.
- Append notable execution events to ${options.executionLogPath} when the implementation agent supports logging.
`;
}

function buildPrompt(options: {
  agent: string;
  model?: string;
  planPath: string;
  statusPath: string;
  legacyCodexStatusPath: string;
  diffPath: string;
}): string {
  const lines = [
    `Read ${options.planPath} and execute it in small, reviewable steps.`,
    `After each meaningful change, update ${options.statusPath} with files touched, checks run, results, blockers, and the next review focus.`,
    `Before review, write the final diff to ${options.diffPath} when practical.`,
    agentCommandHint(options.agent, options.planPath, options.model)
  ];
  if (options.agent === "codex") {
    lines.splice(2, 0, `For legacy Codex handoffs, mirror key status notes to ${options.legacyCodexStatusPath} if your workflow expects that file.`);
  }
  return lines.join("\n");
}

function isExactIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function prepareAgentHandoffRequest(
  config: CodexProConfig,
  workspace: Workspace,
  options: AgentHandoffRequestOptions
): PreparedAgentHandoffRequest {
  const agent = normalizeAgent(options.agent);
  const agentName = collapseOneLine(options.agentName, "agent_name", defaultAgentName(agent), 80);
  const model = optionalOneLine(options.model, "model", 120);
  const title = collapseOneLine(options.title, "title", "Agent implementation plan", 120);
  if (typeof options.plan !== "string") requestError("plan");
  const plan = options.plan.trim();
  if (!plan) requestError("plan");
  if (typeof options.append !== "boolean") requestError("append");
  if (!isExactIsoTimestamp(options.updatedAt)) throw new HandoffOperationError("HANDOFF_WRITE_FAILED");

  const planPath = `${config.contextDir}/current-plan.md`;
  const statusPath = `${config.contextDir}/agent-status.md`;
  const legacyCodexStatusPath = `${config.contextDir}/codex-status.md`;
  const diffPath = `${config.contextDir}/implementation-diff.patch`;
  const logPath = `${config.contextDir}/session-log.jsonl`;
  const executionLogPath = `${config.contextDir}/execution-log.jsonl`;
  const scaffoldPaths = HANDOFF_TO_AGENT_SCAFFOLD_NAMES.map((name) => `${config.contextDir}/${name}`);
  const body = buildPlanBody({
    title,
    updatedAt: options.updatedAt,
    plan,
    workspace,
    agent,
    agentName,
    model,
    statusPath,
    diffPath,
    executionLogPath
  });
  if (Buffer.byteLength(body, "utf8") > config.maxWriteBytes) {
    throw new HandoffOperationError("PLAN_TOO_LARGE");
  }
  if (hasSecretValue(body)) throw new HandoffOperationError("PLAN_SECRET_BLOCKED");

  const prompt = buildPrompt({
    agent,
    model,
    planPath,
    statusPath,
    legacyCodexStatusPath,
    diffPath
  });

  return Object.freeze({
    agent,
    agentName,
    model,
    title,
    plan,
    appendRequested: options.append,
    eventName: options.eventName,
    updatedAt: options.updatedAt,
    planPath,
    statusPath,
    legacyCodexStatusPath,
    diffPath,
    logPath,
    executionLogPath,
    scaffoldPaths: Object.freeze([...scaffoldPaths]),
    body,
    prompt
  });
}

const OUTSIDE_PATH_PREFIXES = [
  "Path escapes workspace root:",
  "Path resolves outside workspace root through a symlink:",
  "Write path resolves through a parent outside the workspace:",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:",
  "Refusing to write through a symlink:"
] as const;

function classifyOutputPathError(error: unknown): HandoffOperationError {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Path is blocked by safety rules:")) {
    return new HandoffOperationError("OUTPUT_PATH_BLOCKED");
  }
  if (OUTSIDE_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return new HandoffOperationError("OUTPUT_PATH_OUTSIDE_WORKSPACE");
  }
  return new HandoffOperationError("OUTPUT_PATH_INVALID");
}

async function readExistingPlan(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  planPath: string
): Promise<{ existed: boolean; text: string }> {
  let resolved: { absPath: string; relPath: string };
  try {
    resolved = guard.resolve(workspace, planPath, { forWrite: true });
  } catch (error) {
    throw classifyOutputPathError(error);
  }
  if (!fs.existsSync(resolved.absPath)) return { existed: false, text: "" };

  try {
    const stat = await fsp.lstat(resolved.absPath);
    if (!stat.isFile()) throw new HandoffOperationError("OUTPUT_PATH_INVALID");
    const maxBytes = config.maxReadBytes;
    if (stat.size > maxBytes) throw new HandoffOperationError("EXISTING_PLAN_TOO_LARGE");
    await guard.assertTextFile(resolved.absPath, maxBytes);
    return { existed: true, text: await fsp.readFile(resolved.absPath, "utf8") };
  } catch (error) {
    if (error instanceof HandoffOperationError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("File is too large")) throw new HandoffOperationError("EXISTING_PLAN_TOO_LARGE");
    if (message === "Refusing to read binary file.") throw new HandoffOperationError("EXISTING_PLAN_NOT_TEXT");
    if (message.startsWith("Not a file:")) throw new HandoffOperationError("OUTPUT_PATH_INVALID");
    throw new HandoffOperationError("EXISTING_PLAN_READ_FAILED");
  }
}

export async function preflightAgentHandoffOutput(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: PreparedAgentHandoffRequest
): Promise<PreparedAgentHandoffOutput> {
  try {
    const contextDirectory = guard.resolve(workspace, config.contextDir, { forWrite: true });
    const relativeContext = path.relative(workspace.root, contextDirectory.absPath);
    let current = workspace.root;
    for (const segment of relativeContext.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (fs.existsSync(current) && !(await fsp.stat(current)).isDirectory()) {
        throw new HandoffOperationError("OUTPUT_PATH_INVALID");
      }
    }
  } catch (error) {
    if (error instanceof HandoffOperationError) throw error;
    throw classifyOutputPathError(error);
  }

  const expectedCreatedContextFiles: string[] = [];
  for (const targetPath of request.scaffoldPaths) {
    let resolved: { absPath: string; relPath: string };
    try {
      resolved = guard.resolve(workspace, targetPath, { forWrite: true });
    } catch (error) {
      throw classifyOutputPathError(error);
    }
    if (fs.existsSync(resolved.absPath)) {
      try {
        if (!(await fsp.lstat(resolved.absPath)).isFile()) {
          throw new HandoffOperationError("OUTPUT_PATH_INVALID");
        }
      } catch (error) {
        if (error instanceof HandoffOperationError) throw error;
        throw new HandoffOperationError("OUTPUT_PATH_INVALID");
      }
    } else {
      expectedCreatedContextFiles.push(targetPath);
    }
  }

  const existing = await readExistingPlan(config, guard, workspace, request.planPath);
  const previousText = existing.text;
  const normalizedPrevious = previousText.replace(/\r\n?/g, "\n").trim();
  const priorPlanAvailable = existing.existed && normalizedPrevious.length > 0 && normalizedPrevious !== EMPTY_SCAFFOLD_PLAN;
  const appendApplied = request.appendRequested && priorPlanAvailable;
  const finalPlan = appendApplied
    ? `${previousText.trimEnd()}\n\n---\n\n${request.body}`
    : request.body;
  const planBytes = Buffer.byteLength(finalPlan, "utf8");
  if (planBytes > config.maxWriteBytes) throw new HandoffOperationError("PLAN_TOO_LARGE");
  if (hasSecretValue(finalPlan)) throw new HandoffOperationError("PLAN_SECRET_BLOCKED");

  const planSha256 = sha256(finalPlan);
  const diff = makeUnifiedDiff(previousText, finalPlan, request.planPath);
  const event = JSON.stringify({
    ts: request.updatedAt,
    event: request.eventName,
    agent: request.agent,
    agent_name: request.agentName,
    model: request.model ?? null,
    title: request.title,
    plan_path: request.planPath,
    status_path: request.statusPath,
    diff_path: request.diffPath,
    append_requested: request.appendRequested,
    append_applied: appendApplied,
    plan_hash: planSha256
  }) + "\n";

  return Object.freeze({
    expectedCreatedContextFiles: Object.freeze(expectedCreatedContextFiles),
    planFileExistedBefore: existing.existed,
    priorPlanAvailable,
    appendApplied,
    previousText,
    previousBytes: Buffer.byteLength(previousText, "utf8"),
    finalPlan,
    planBytes,
    planSha256,
    diff: Object.freeze({ ...diff }),
    diffBytes: Buffer.byteLength(diff.diff, "utf8"),
    diffTruncated: diff.diff.endsWith(HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX),
    event,
    eventBytes: Buffer.byteLength(event, "utf8"),
    eventSha256: sha256(event)
  });
}

function recognizedHandoffError(error: unknown): HandoffOperationError | undefined {
  if (error instanceof HandoffOperationError) return error;
  if (!(error instanceof Error) || error.name !== "HandoffOperationError") return undefined;
  const candidate = error as Error & { code?: unknown; source?: unknown };
  if (typeof candidate.code !== "string") return undefined;
  return candidate as HandoffOperationError;
}

export async function writePreparedAgentHandoff(
  context: AgentHandoffProviderContext
): Promise<HandoffWriteResult> {
  const { config, guard, workspace, request, output } = context;
  let createdContextFiles: string[];
  try {
    createdContextFiles = await ensureAiBridge(config, guard, workspace);
  } catch (error) {
    const recognized = recognizedHandoffError(error);
    if (recognized) throw recognized;
    throw new HandoffOperationError("SCAFFOLD_WRITE_FAILED");
  }
  if (
    createdContextFiles.length !== output.expectedCreatedContextFiles.length ||
    createdContextFiles.some((value, index) => value !== output.expectedCreatedContextFiles[index])
  ) {
    throw new HandoffOperationError("HANDOFF_WRITE_FAILED");
  }

  try {
    await writeTextFile(config, guard, workspace, request.planPath, output.finalPlan, {
      createDirs: true,
      overwrite: true
    });
  } catch (error) {
    const recognized = recognizedHandoffError(error);
    if (recognized) throw recognized;
    throw new HandoffOperationError("PLAN_WRITE_FAILED");
  }

  try {
    const logResolved = guard.resolve(workspace, request.logPath, { forWrite: true });
    const executionLogResolved = guard.resolve(workspace, request.executionLogPath, { forWrite: true });
    await fsp.appendFile(logResolved.absPath, output.event, "utf8");
    await fsp.appendFile(executionLogResolved.absPath, output.event, "utf8");
  } catch (error) {
    const recognized = recognizedHandoffError(error);
    if (recognized) throw recognized;
    throw new HandoffOperationError("LOG_WRITE_FAILED");
  }

  return buildHandoffWriteResult(context, createdContextFiles);
}

function buildHandoffWriteResult(
  context: AgentHandoffProviderContext,
  createdContextFiles: string[]
): HandoffWriteResult {
  const { config, workspace, request, output } = context;
  return {
    workspaceId: workspace.id,
    root: workspace.root,
    agent: request.agent,
    agentName: request.agentName,
    model: request.model,
    title: request.title,
    updatedAt: request.updatedAt,
    appendRequested: request.appendRequested,
    appendApplied: output.appendApplied,
    maxWriteBytes: config.maxWriteBytes,
    planPath: request.planPath,
    statusPath: request.statusPath,
    legacyCodexStatusPath: request.legacyCodexStatusPath,
    diffPath: request.diffPath,
    logPath: request.logPath,
    executionLogPath: request.executionLogPath,
    createdContextFiles,
    planFileExistedBefore: output.planFileExistedBefore,
    priorPlanAvailable: output.priorPlanAvailable,
    previousText: output.previousText,
    previousBytes: output.previousBytes,
    finalPlan: output.finalPlan,
    planBytes: output.planBytes,
    planSha256: output.planSha256,
    additions: output.diff.additions,
    deletions: output.diff.deletions,
    changed: output.diff.changed,
    diff: output.diff.diff,
    diffBytes: output.diffBytes,
    diffTruncated: output.diffTruncated,
    loggedPaths: HANDOFF_TO_AGENT_LOG_NAMES.map((name) => `${config.contextDir}/${name}`),
    event: output.event,
    eventBytes: output.eventBytes,
    eventSha256: output.eventSha256,
    prompt: request.prompt,
    promptBytes: Buffer.byteLength(request.prompt, "utf8")
  };
}

export async function prepareAgentHandoffMutation(
  context: AgentHandoffProviderContext
): Promise<PreparedAgentHandoffMutation> {
  const { config, guard, workspace, request, output } = context;
  try {
    const replacedPaths = new Set([request.planPath, request.logPath, request.executionLogPath]);
    const writes = [
      ...aiBridgeScaffoldWrites(config).filter((write) => !replacedPaths.has(write.path)),
      { path: request.planPath, content: output.finalPlan, mode: "replace" as const },
      { path: request.logPath, content: output.event, mode: "append" as const },
      { path: request.executionLogPath, content: output.event, mode: "append" as const }
    ];
    const prepared = await prepareWorkspaceTextBatch(config, guard, workspace, writes);
    const actualCreated = new Set(prepared.createdPaths);
    if (
      actualCreated.size !== output.expectedCreatedContextFiles.length ||
      output.expectedCreatedContextFiles.some((value) => !actualCreated.has(value))
    ) {
      throw new HandoffOperationError("HANDOFF_WRITE_FAILED");
    }
    return {
      result: buildHandoffWriteResult(context, [...output.expectedCreatedContextFiles]),
      prepared
    };
  } catch (error) {
    const recognized = recognizedHandoffError(error);
    if (recognized) throw recognized;
    throw new HandoffOperationError("HANDOFF_WRITE_FAILED");
  }
}

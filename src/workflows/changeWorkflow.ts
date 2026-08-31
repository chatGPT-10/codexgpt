import path from "node:path";
import type { DetectedCommands } from "../context/commandDetector.js";
import {
  CHANGE_WORKFLOW_REVIEW_CHECKLIST,
  changeWorkflowStateSchema,
  verifyChangeCheckResultSchema,
  workflowChangedPathSchema,
  type ChangeWorkflowCheck,
  type ChangeWorkflowState
} from "../tools/schemas/changeWorkflow.js";

export interface ChangeWorkflowWorkspace {
  id: string;
  root: string;
}

export interface ChangeWorkflowRunRequest {
  check: ChangeWorkflowCheck;
  command: string;
  source: string;
  commandSpec: Readonly<{ kind: "powershell"; script: string; edition: "auto" }>;
  cwd: string;
  timeoutMs: number;
}

export interface ChangeWorkflowRunResult {
  status: "passed" | "failed";
  exitCode: number | null;
  processId: string | null;
  summary: string;
}

export type ChangeWorkflowErrorCode =
  | "WORKFLOW_NOT_FOUND"
  | "WORKFLOW_OWNER_MISMATCH"
  | "INVALID_CHECK_SELECTION"
  | "CHECK_NOT_CONFIRMED"
  | "VERIFICATION_UNAVAILABLE"
  | "CHILD_RESULT_INVALID"
  | "WORKFLOW_RESULT_INVALID";

export class ChangeWorkflowError extends Error {
  constructor(readonly code: ChangeWorkflowErrorCode, message: string, readonly check?: ChangeWorkflowCheck) {
    super(message);
    this.name = "ChangeWorkflowError";
  }
}

interface WorkflowRecord {
  workspaceId: string;
  workspaceRoot: string;
  ownerBinding: string;
  state: ChangeWorkflowState;
}

export interface ChangeWorkflowServiceOptions {
  commandProvider(workspace: ChangeWorkflowWorkspace): Promise<DetectedCommands>;
  now?: () => number;
}

const CHECK_ORDER: readonly ChangeWorkflowCheck[] = ["test", "typecheck", "lint", "build"];
const SAFE_CONFIRMED_COMMAND = /^[A-Za-z0-9._:\\/-]+(?: [A-Za-z0-9._:\\/-]+)*$/u;

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (!Number.isFinite(Date.parse(value))) throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Workflow clock is invalid.");
  return value;
}

function key(workspace: ChangeWorkflowWorkspace, changeSetId: string): string {
  return `${workspace.id}\0${changeSetId}`;
}

function cloneState(state: ChangeWorkflowState): ChangeWorkflowState {
  return changeWorkflowStateSchema.parse(state);
}

function safeChangedFiles(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of values) {
    const normalized = raw.replaceAll("\\", "/");
    const parsed = workflowChangedPathSchema.safeParse(normalized);
    if (!parsed.success) throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Mutation returned an invalid workflow path.");
    if (!result.includes(parsed.data)) result.push(parsed.data);
    if (result.length > 1_000) throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Mutation returned too many workflow paths.");
  }
  if (!result.length) throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Mutation returned no workflow paths.");
  return result;
}

function confirmedRecommendations(commands: DetectedCommands) {
  return CHECK_ORDER.flatMap((check) => {
    const candidate = commands[check].find((item) => item.confidence === "confirmed");
    if (!candidate) return [];
    if (!SAFE_CONFIRMED_COMMAND.test(candidate.value) || candidate.value.length > 512 || candidate.source.length > 240) {
      throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Confirmed project command is outside the workflow command grammar.");
    }
    return [{
      check,
      command: candidate.value,
      source: candidate.source,
      confidence: "confirmed" as const
    }];
  });
}

function deriveState(state: ChangeWorkflowState): ChangeWorkflowState {
  const verificationTerminal = state.verification.status === "passed" || state.verification.status === "failed";
  const reviewComplete = state.review.status === "completed";
  const complete = verificationTerminal && reviewComplete;
  return changeWorkflowStateSchema.parse({
    ...state,
    stage: complete ? "reviewed" : verificationTerminal ? "verified" : "applied",
    complete,
    ready: complete && state.verification.status === "passed"
  });
}

function powershellSpec(command: string) {
  if (!SAFE_CONFIRMED_COMMAND.test(command)) {
    throw new ChangeWorkflowError("WORKFLOW_RESULT_INVALID", "Confirmed project command cannot be compiled safely.");
  }
  return Object.freeze({
    kind: "powershell" as const,
    script: `& ${command}\nexit $LASTEXITCODE`,
    edition: "auto" as const
  });
}

export class ChangeWorkflowService {
  private readonly records = new Map<string, WorkflowRecord>();
  private readonly now: () => number;

  constructor(private readonly options: ChangeWorkflowServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  private requireRecord(
    workspace: ChangeWorkflowWorkspace,
    ownerBinding: string,
    changeSetId: string
  ): WorkflowRecord {
    const record = this.records.get(key(workspace, changeSetId));
    if (!record || path.resolve(record.workspaceRoot) !== path.resolve(workspace.root)) {
      throw new ChangeWorkflowError("WORKFLOW_NOT_FOUND", "Change workflow was not found.");
    }
    if (record.ownerBinding !== ownerBinding) {
      throw new ChangeWorkflowError("WORKFLOW_OWNER_MISMATCH", "Change workflow owner does not match.");
    }
    return record;
  }

  async recordApplied(input: {
    workspace: ChangeWorkflowWorkspace;
    ownerBinding: string;
    changeSetId: string;
    changedFiles: readonly string[];
    verificationAvailable: boolean;
  }): Promise<ChangeWorkflowState> {
    let detected: DetectedCommands;
    try {
      detected = await this.options.commandProvider(input.workspace);
    } catch {
      detected = { build: [], test: [], lint: [], typecheck: [] };
    }
    const recommendations = confirmedRecommendations(detected);
    const state = changeWorkflowStateSchema.parse({
      schema_version: 1,
      change_set_id: input.changeSetId,
      changed_files: safeChangedFiles(input.changedFiles),
      stage: "applied",
      verification: {
        status: input.verificationAvailable && recommendations.length ? "pending" : "unavailable",
        available: input.verificationAvailable && recommendations.length > 0,
        auto_run: false,
        recommended: recommendations,
        action: "verify_change",
        completed_at: null
      },
      review: {
        status: "pending",
        required: true,
        action: "show_changes",
        git_diff_available: true,
        inspection_checklist: CHANGE_WORKFLOW_REVIEW_CHECKLIST,
        completed_at: null
      },
      complete: false,
      ready: false
    });
    this.records.set(key(input.workspace, input.changeSetId), {
      workspaceId: input.workspace.id,
      workspaceRoot: input.workspace.root,
      ownerBinding: input.ownerBinding,
      state
    });
    return cloneState(state);
  }

  snapshot(input: {
    workspace: ChangeWorkflowWorkspace;
    ownerBinding: string;
    changeSetId: string;
  }): ChangeWorkflowState {
    return cloneState(this.requireRecord(input.workspace, input.ownerBinding, input.changeSetId).state);
  }

  async verify(input: {
    workspace: ChangeWorkflowWorkspace;
    ownerBinding: string;
    changeSetId: string;
    checks: readonly ChangeWorkflowCheck[];
    timeoutMs?: number;
    runCheck(request: ChangeWorkflowRunRequest): Promise<ChangeWorkflowRunResult>;
  }): Promise<{ workflow: ChangeWorkflowState; checks: Array<ReturnType<typeof verifyChangeCheckResultSchema.parse>> }> {
    const record = this.requireRecord(input.workspace, input.ownerBinding, input.changeSetId);
    if (!record.state.verification.available) {
      throw new ChangeWorkflowError("VERIFICATION_UNAVAILABLE", "Verification is unavailable.");
    }
    if (!input.checks.length || input.checks.length > 4 || new Set(input.checks).size !== input.checks.length) {
      throw new ChangeWorkflowError("INVALID_CHECK_SELECTION", "Verification checks must be unique and bounded.");
    }
    const current = confirmedRecommendations(await this.options.commandProvider(input.workspace));
    const byCheck = new Map(current.map((item) => [item.check, item]));
    const timeoutMs = input.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10 * 60_000) {
      throw new ChangeWorkflowError("INVALID_CHECK_SELECTION", "Verification timeout is invalid.");
    }
    const results: Array<ReturnType<typeof verifyChangeCheckResultSchema.parse>> = [];
    for (const check of input.checks) {
      const recommendation = byCheck.get(check);
      if (!recommendation) {
        throw new ChangeWorkflowError("CHECK_NOT_CONFIRMED", "Requested check is not confirmed.", check);
      }
      const execution = await input.runCheck({
        check,
        command: recommendation.command,
        source: recommendation.source,
        commandSpec: powershellSpec(recommendation.command),
        cwd: input.workspace.root,
        timeoutMs
      });
      const parsed = verifyChangeCheckResultSchema.safeParse({
        check,
        command: recommendation.command,
        source: recommendation.source,
        status: execution.status,
        exit_code: execution.exitCode,
        process_id: execution.processId,
        summary: execution.summary
      });
      if (!parsed.success) throw new ChangeWorkflowError("CHILD_RESULT_INVALID", "Verification child result is invalid.", check);
      results.push(parsed.data);
    }
    const status = results.every((result) => result.status === "passed") ? "passed" as const : "failed" as const;
    record.state = deriveState({
      ...record.state,
      verification: {
        ...record.state.verification,
        status,
        completed_at: timestamp(this.now)
      }
    } as ChangeWorkflowState);
    return { workflow: cloneState(record.state), checks: results };
  }

  markReviewed(input: {
    workspace: ChangeWorkflowWorkspace;
    ownerBinding: string;
    changeSetId: string;
    includeDiff: boolean;
    markReviewed: boolean;
    checkpointHit: boolean;
    scopePath: string | null;
    reviewedPaths: readonly string[];
  }): ChangeWorkflowState {
    const record = this.requireRecord(input.workspace, input.ownerBinding, input.changeSetId);
    const reviewedPaths = new Set(input.reviewedPaths.map((value) => value.replaceAll("\\", "/")));
    const includesWorkflowPaths = record.state.changed_files.every((value) => reviewedPaths.has(value));
    const qualified = input.includeDiff && input.markReviewed && !input.checkpointHit &&
      input.scopePath === null && includesWorkflowPaths;
    record.state = deriveState({
      ...record.state,
      review: {
        ...record.state.review,
        status: qualified ? "completed" : "incomplete",
        completed_at: qualified ? timestamp(this.now) : null
      }
    } as ChangeWorkflowState);
    return cloneState(record.state);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strings(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

export function mutationWorkflowFacts(
  toolName: string,
  structuredContent: unknown
): { changeSetId: string; changedFiles: string[] } | null {
  const structured = object(structuredContent);
  const data = object(structured?.data);
  if (!structured || structured.ok !== true || !data) return null;

  const transaction = object(data.transaction);
  let changeSetId = typeof transaction?.change_set_id === "string" ? transaction.change_set_id : null;
  let changedFiles: string[] = [];

  if (toolName === "write" || toolName === "edit") {
    if (typeof data.path === "string") changedFiles = [data.path];
  } else if (toolName === "apply_patch") {
    if (Array.isArray(data.paths)) changedFiles = strings(data.paths);
  } else if (toolName === "move_paths") {
    if (data.preview === true || !transaction || !Array.isArray(data.moves)) return null;
    changedFiles = data.moves.flatMap((raw) => {
      const move = object(raw);
      return move ? strings([move.source, move.destination]) : [];
    });
  } else if (toolName === "undo_change_set") {
    if (data.preview === true || typeof data.change_set_id !== "string" || !Array.isArray(data.operations)) return null;
    changeSetId = data.change_set_id;
    changedFiles = data.operations.flatMap((raw) => {
      const operation = object(raw);
      if (!operation) return [];
      return strings([operation.path, operation.source, operation.destination]);
    });
  } else {
    return null;
  }

  if (!changeSetId || !/^cs_[a-f0-9]{32}$/u.test(changeSetId)) return null;
  try {
    return { changeSetId, changedFiles: safeChangedFiles(changedFiles) };
  } catch {
    return null;
  }
}

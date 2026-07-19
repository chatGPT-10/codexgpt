import { semanticDigest } from "./authorizationFacts.js";
import type { RiskClass } from "./types.js";

export type ExecutionAccessModeV3 = "full_access" | "workspace";
export type ExecutionNetworkPostureV3 = "unrestricted_host" | "deny_all";
export type ExecutionTerminalV3 = "none" | "pipes" | "conpty";
export type ExecutionOperationV3 = "run_command" | "start_process";

export type ExecutionCommandV3 =
  | { kind: "argv"; executable: string; args?: string[] }
  | { kind: "powershell"; script: string; edition?: "auto" | "core" | "windows" }
  | { kind: "bash"; script: string };

export interface ResolvedEnvironmentV3 {
  entries: Array<[string, string]>;
  digest: string;
}

function normalizedEnvironmentMap(
  input: Readonly<Record<string, string>>,
  platform: NodeJS.Platform,
  label: string
): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(input)) {
    if (!key || /[=\0]/.test(key) || /\0/.test(value)) {
      throw new Error(`${label} contains an invalid environment entry.`);
    }
    const effectiveKey = platform === "win32" ? key.toLocaleUpperCase("en-US") : key;
    if (normalized.has(effectiveKey)) {
      throw new Error(`${label} contains a duplicate environment key.`);
    }
    normalized.set(effectiveKey, value);
  }
  return normalized;
}

export function resolveEffectiveEnvironmentV3(input: {
  base: Readonly<Record<string, string>>;
  overrides: Readonly<Record<string, string>>;
  platform?: NodeJS.Platform;
}): ResolvedEnvironmentV3 {
  const platform = input.platform ?? process.platform;
  const effective = normalizedEnvironmentMap(input.base, platform, "Base environment");
  const overrides = normalizedEnvironmentMap(input.overrides, platform, "Environment overrides");
  for (const [key, value] of overrides) effective.set(key, value);
  const entries = [...effective.entries()].sort(([left], [right]) => left.localeCompare(right, "en-US"));
  return Object.freeze({
    entries,
    digest: semanticDigest({ schemaVersion: 3, domain: "effective-environment", entries })
  });
}

function requireDigest(name: string, value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 digest.`);
  return value;
}

function requireSafeId(name: string, value: string | null): string | null {
  if (value === null) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function commandFacts(command: ExecutionCommandV3): {
  commandKind: ExecutionCommandV3["kind"];
  argumentCount: number;
  scriptBytes: number;
  commandDigest: string;
} {
  if (command.kind === "argv") {
    const args = command.args ?? [];
    return {
      commandKind: "argv",
      argumentCount: args.length,
      scriptBytes: 0,
      commandDigest: semanticDigest({ domain: "argv", executable: command.executable, args })
    };
  }
  return {
    commandKind: command.kind,
    argumentCount: 0,
    scriptBytes: Buffer.byteLength(command.script, "utf8"),
    commandDigest: semanticDigest({
      domain: command.kind,
      edition: command.kind === "powershell" ? command.edition ?? "auto" : null,
      scriptBytes: Buffer.from(command.script, "utf8").toString("base64")
    })
  };
}

export interface DescribeExecutionResourceV3Input {
  operation: ExecutionOperationV3;
  command: ExecutionCommandV3;
  effectiveEnvironmentDigest: string;
  logicalCwd: string;
  absoluteCwdIdentity: string;
  backend: {
    backendId: string;
    backendVersion: string;
    executableIdentity: string;
  };
  terminal: ExecutionTerminalV3;
  deadlineMs: number;
  lifetimeMs: number;
  networkPosture: ExecutionNetworkPostureV3;
  accessMode: ExecutionAccessModeV3;
  workspaceId: string | null;
  leaseId: string | null;
  snapshotId: string | null;
  contractVersion: 3;
  policyRevision: string;
  evidenceRevision: string;
  identityRevision: string;
  transportRevision: string;
  verification?: {
    mergePlanId: string;
    integrationWorkspaceId: string;
    category: string;
    taskWorktreeId: string;
    taskGeneration: number;
    repositoryId: string;
    candidateOid: string;
    candidateTreeOid: string;
    manifestDigest: string;
    rootIdentity: string;
  };
}

export function describeExecutionResourceV3(input: DescribeExecutionResourceV3Input) {
  if (input.contractVersion !== 3) throw new Error("Execution resources require contract 3.");
  if (!Number.isInteger(input.deadlineMs) || input.deadlineMs < 1) throw new Error("Execution deadline is invalid.");
  if (!Number.isInteger(input.lifetimeMs) || input.lifetimeMs < 1) throw new Error("Execution lifetime is invalid.");
  const command = commandFacts(input.command);
  const verification = input.verification
    ? {
        mergePlanId: requireSafeId("mergePlanId", input.verification.mergePlanId),
        integrationWorkspaceId: requireSafeId("integrationWorkspaceId", input.verification.integrationWorkspaceId),
        category: requireSafeId("verificationCategory", input.verification.category),
        taskWorktreeId: requireSafeId("taskWorktreeId", input.verification.taskWorktreeId),
        taskGeneration: input.verification.taskGeneration,
        repositoryId: requireSafeId("repositoryId", input.verification.repositoryId),
        candidateOid: input.verification.candidateOid,
        candidateTreeOid: input.verification.candidateTreeOid,
        manifestDigest: requireDigest("manifestDigest", input.verification.manifestDigest),
        rootIdentity: requireDigest("rootIdentity", input.verification.rootIdentity)
      }
    : null;
  if (verification && (!Number.isSafeInteger(verification.taskGeneration) || verification.taskGeneration < 1)) {
    throw new Error("Verification task generation is invalid.");
  }
  const semanticFacts = {
    schemaVersion: 3,
    domain: "codexpro.execution.authorization",
    operation: input.operation,
    ...command,
    effectiveEnvironmentDigest: requireDigest("effectiveEnvironmentDigest", input.effectiveEnvironmentDigest),
    logicalCwdDigest: semanticDigest({ logicalCwd: input.logicalCwd }),
    absoluteCwdIdentity: requireDigest("absoluteCwdIdentity", input.absoluteCwdIdentity),
    backendId: requireSafeId("backendId", input.backend.backendId),
    backendVersion: requireSafeId("backendVersion", input.backend.backendVersion),
    executableIdentity: requireDigest("executableIdentity", input.backend.executableIdentity),
    terminal: input.terminal,
    deadlineMs: input.deadlineMs,
    lifetimeMs: input.lifetimeMs,
    networkPosture: input.networkPosture,
    accessMode: input.accessMode,
    workspaceId: requireSafeId("workspaceId", input.workspaceId),
    leaseId: requireSafeId("leaseId", input.leaseId),
    snapshotId: requireSafeId("snapshotId", input.snapshotId),
    contractVersion: 3,
    policyRevision: requireSafeId("policyRevision", input.policyRevision),
    evidenceRevision: requireSafeId("evidenceRevision", input.evidenceRevision),
    identityRevision: requireSafeId("identityRevision", input.identityRevision),
    transportRevision: requireSafeId("transportRevision", input.transportRevision),
    ...(verification ? { verification } : {})
  } as const;
  const semanticFactsDigest = semanticDigest(semanticFacts);
  return Object.freeze({
    schemaVersion: 3 as const,
    kind: "execution" as const,
    operation: input.operation,
    commandKind: command.commandKind,
    argumentCount: command.argumentCount,
    scriptBytes: command.scriptBytes,
    commandDigest: command.commandDigest,
    effectiveEnvironmentDigest: semanticFacts.effectiveEnvironmentDigest,
    logicalCwdDigest: semanticFacts.logicalCwdDigest,
    absoluteCwdIdentity: semanticFacts.absoluteCwdIdentity,
    backendId: semanticFacts.backendId,
    backendVersion: semanticFacts.backendVersion,
    executableIdentity: semanticFacts.executableIdentity,
    terminal: input.terminal,
    deadlineMs: input.deadlineMs,
    lifetimeMs: input.lifetimeMs,
    networkPosture: input.networkPosture,
    accessMode: input.accessMode,
    workspaceId: semanticFacts.workspaceId,
    leaseId: semanticFacts.leaseId,
    snapshotId: semanticFacts.snapshotId,
    contractVersion: 3 as const,
    policyRevision: semanticFacts.policyRevision,
    evidenceRevision: semanticFacts.evidenceRevision,
    identityRevision: semanticFacts.identityRevision,
    transportRevision: semanticFacts.transportRevision,
    ...(verification ? { verification } : {}),
    semanticFactsDigest,
    resourceFingerprint: semanticDigest({ domain: "codexpro.execution.resource", semanticFactsDigest })
  });
}

export type ProcessActionOperationV3 =
  | "read_process_output"
  | "list_processes"
  | "write_process_input"
  | "interrupt_process"
  | "terminate_process"
  | "resize_process_terminal";

export interface DescribeProcessActionResourceV3Input {
  operation: ProcessActionOperationV3;
  processId?: string;
  generation?: number;
  owned?: boolean;
  contextMatches: boolean;
  terminal?: ExecutionTerminalV3;
  input?: Uint8Array;
  close?: boolean;
}

export function describeProcessActionResourceV3(input: DescribeProcessActionResourceV3Input) {
  const list = input.operation === "list_processes";
  if (!input.contextMatches || (!list && input.owned !== true)) throw new Error("PROCESS_NOT_FOUND");
  if (!list && !/^process_[a-f0-9]{32}$/.test(input.processId ?? "")) throw new Error("PROCESS_NOT_FOUND");
  if (!list && (!Number.isInteger(input.generation) || (input.generation ?? -1) < 0)) throw new Error("PROCESS_NOT_FOUND");
  if (input.operation === "resize_process_terminal" && input.terminal !== "conpty") {
    throw new Error("TERMINAL_NOT_AVAILABLE");
  }
  const riskClass: RiskClass = input.operation === "write_process_input"
    ? "R3"
    : input.operation === "interrupt_process" || input.operation === "terminate_process"
      ? "R2"
      : "R0";
  const inputDigest = input.operation === "write_process_input"
    ? semanticDigest({
        domain: "process-input",
        generation: input.generation,
        bytes: Buffer.from(input.input ?? []).toString("base64"),
        close: input.close === true
      })
    : null;
  const semanticFactsDigest = semanticDigest({
    schemaVersion: 3,
    domain: "codexpro.process.action",
    operation: input.operation,
    processId: input.processId ?? null,
    generation: input.generation ?? null,
    terminal: input.terminal ?? "none",
    inputDigest
  });
  return Object.freeze({
    schemaVersion: 3 as const,
    kind: "process_action" as const,
    operation: input.operation,
    processId: input.processId ?? null,
    generation: input.generation ?? null,
    terminal: input.terminal ?? "none",
    inputBytes: input.input?.byteLength ?? 0,
    inputDigest,
    riskClass,
    semanticFactsDigest,
    resourceFingerprint: semanticDigest({ domain: "codexpro.process.resource", semanticFactsDigest })
  });
}

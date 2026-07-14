import type { z } from "zod";
import type { AuditRequirement } from "../config.js";
import {
  commitTransactionWithAudit,
  executionAuditFacts
} from "../audit/transactionParticipant.js";
import { type AuditMutationKind, type AuthorizationAuditEventV2, type ExecutionAuditStatus } from "../audit/types.js";
import { TransactionError } from "../transactions/types.js";
import { toolPolicyDefinition } from "./toolPolicy.js";
import type {
  AuditEventV1,
  PolicyDecisionV1,
  PolicyEngineMode,
  RiskClass
} from "./types.js";

interface ToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

interface RegisteredToolEntry {
  inputSchema: z.ZodTypeAny;
  handler: (args: Record<string, unknown>, extra?: unknown) => ToolCallResult | Promise<ToolCallResult>;
  enabled?: boolean;
}

interface ServerWithRegisteredTools {
  _registeredTools: Record<string, RegisteredToolEntry>;
}

export interface AuditAuthorizationContextV2 {
  authorizationEvent: AuthorizationAuditEventV2;
  requirement: AuditRequirement;
  riskClass: RiskClass;
  mutating: boolean;
}

export interface AuditExecutionInputV2 {
  status: ExecutionAuditStatus;
  resultCode: string | null;
  durationMs: number;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  operationCount: number;
  mutationKinds: AuditMutationKind[];
  recoveryRequired: boolean;
}

export interface PolicyAuthorizationResult {
  decision: PolicyDecisionV1;
  auditEvent: AuditEventV1 | null;
  auditContext?: AuditAuthorizationContextV2;
}

export interface PolicyRuntimeDiagnostics {
  policyRevision: string | null;
  permissionProfileId: string | null;
  hardPolicyRevision: string;
  grantRevision: string | null;
  enforcement: {
    active: boolean;
    backendId: string;
    evidenceRevision: string;
    missingCapabilities: string[];
  };
}

export interface PolicyRuntime {
  mode: PolicyEngineMode;
  diagnostics?(): PolicyRuntimeDiagnostics;
  authorize(toolName: string, args: Record<string, unknown>, extra?: unknown): PolicyAuthorizationResult | Promise<PolicyAuthorizationResult>;
  audit(event: AuditEventV1): void | Promise<void>;
  persistAuthorization?(context: AuditAuthorizationContextV2): void | Promise<void>;
  persistExecution?(context: AuditAuthorizationContextV2, execution: AuditExecutionInputV2): void | Promise<void>;
}

const POLICY_FAILURE = Symbol("codexpro.policy.failure");
const installedServers = new WeakSet<object>();

function safeId(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)
    ? value
    : fallback;
}

function safeReason(value: unknown): string {
  const allowed = new Set([
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "POLICY_CONTEXT_STALE",
    "POLICY_RESOURCE_INVALID",
    "POLICY_CONFIG_INVALID",
    "SHELL_SANDBOX_UNAVAILABLE",
    "PROCESS_SANDBOX_UNAVAILABLE",
    "NETWORK_ENFORCEMENT_UNAVAILABLE"
  ]);
  return typeof value === "string" && allowed.has(value) ? value : "POLICY_CONFIG_INVALID";
}

export function createPolicyToolFailure(decision: Pick<PolicyDecisionV1, "reasonCode" | "policyRevision">): ToolCallResult {
  const reasonCode = safeReason(decision.reasonCode);
  const policyRevision = safeId(decision.policyRevision, "policy-unavailable");
  const result: ToolCallResult = {
    content: [{
      type: "text",
      text: `CodexPro policy refused this operation.\nCode: ${reasonCode}\nPolicy revision: ${policyRevision}`
    }],
    isError: true
  };
  Object.defineProperty(result, POLICY_FAILURE, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return result;
}

export function isPolicyToolFailure(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as Record<symbol, unknown>)[POLICY_FAILURE] === true);
}

function unavailableFailure(): ToolCallResult {
  return createPolicyToolFailure({
    reasonCode: "POLICY_CONFIG_INVALID",
    policyRevision: "policy-unavailable"
  });
}

export function installPolicyKernel(server: unknown, runtime: PolicyRuntime): void {
  if (runtime.mode === "legacy") return;
  const candidate = server as Partial<ServerWithRegisteredTools>;
  const tools = candidate._registeredTools;
  if (!tools || typeof tools !== "object") {
    throw new Error("CodexPro server does not expose a registered-tool map for Policy Kernel installation.");
  }
  if (installedServers.has(server as object)) {
    throw new Error("Policy Kernel is already installed on this server.");
  }

  for (const [toolName, entry] of Object.entries(tools)) {
    if (toolName === "codexpro" || entry.enabled === false) continue;
    toolPolicyDefinition(toolName);
    const original = entry.handler;
    entry.handler = async (args, extra) => {
      let authorization: PolicyAuthorizationResult;
      try {
        authorization = await runtime.authorize(toolName, args, extra);
        if (authorization.auditEvent) await runtime.audit(authorization.auditEvent);
      } catch {
        if (runtime.mode === "enforce") return unavailableFailure();
        return original(args, extra);
      }

      const auditContext = authorization.auditContext;
      if (auditContext) {
        try {
          if (!runtime.persistAuthorization) throw new Error("Persistent audit runtime is unavailable.");
          await runtime.persistAuthorization(auditContext);
        } catch {
          if (auditContext.requirement === "required") return unavailableFailure();
        }
      }

      if (runtime.mode === "enforce" && authorization.decision.outcome !== "allow") {
        if (auditContext) {
          const notExecuted: AuditExecutionInputV2 = {
            status: "not_executed",
            resultCode: authorization.decision.reasonCode,
            durationMs: 0,
            exitCode: null,
            boundedByteCounts: {},
            changeSetId: null,
            operationCount: 0,
            mutationKinds: [],
            recoveryRequired: false
          };
          try {
            if (!runtime.persistExecution) throw new Error("Persistent audit runtime is unavailable.");
            await runtime.persistExecution(auditContext, notExecuted);
          } catch {
            // A denied operation remains denied even when terminal audit persistence is degraded.
          }
        }
        return createPolicyToolFailure(authorization.decision);
      }

      const startedAt = Date.now();
      try {
        const result = await original(args, extra);
        if (auditContext) {
          const facts = executionAuditFacts(result);
          const execution: AuditExecutionInputV2 = {
            status: result.isError === true ? "failed" : "succeeded",
            resultCode: result.isError === true ? "TOOL_ERROR" : facts?.resultCode ?? "OK",
            durationMs: Math.max(0, Date.now() - startedAt),
            exitCode: facts?.exitCode ?? null,
            boundedByteCounts: facts?.boundedByteCounts ?? {},
            changeSetId: facts?.changeSetId ?? null,
            operationCount: facts?.operationCount ?? 0,
            mutationKinds: facts?.mutationKinds ?? [],
            recoveryRequired: false
          };
          try {
            if (!runtime.persistExecution) throw new Error("Persistent audit runtime is unavailable.");
            if (facts?.pendingMutationCommit && auditContext.requirement === "required") {
              await commitTransactionWithAudit({
                pending: facts.pendingMutationCommit,
                runtime: { persistExecution: runtime.persistExecution.bind(runtime) },
                context: auditContext,
                execution
              });
            } else {
              await runtime.persistExecution(auditContext, execution);
            }
          } catch (error) {
            if (error instanceof TransactionError) throw error;
            if (auditContext.requirement === "required") return unavailableFailure();
          }
        }
        return result;
      } catch (error) {
        if (auditContext) {
          const execution: AuditExecutionInputV2 = {
            status: "failed",
            resultCode: "HANDLER_EXCEPTION",
            durationMs: Math.max(0, Date.now() - startedAt),
            exitCode: null,
            boundedByteCounts: {},
            changeSetId: null,
            operationCount: 0,
            mutationKinds: [],
            recoveryRequired: false
          };
          try {
            if (!runtime.persistExecution) throw new Error("Persistent audit runtime is unavailable.");
            await runtime.persistExecution(auditContext, execution);
          } catch {
            if (auditContext.requirement === "required") {
              throw new Error("AUDIT_UNAVAILABLE", { cause: error });
            }
          }
        }
        throw error;
      }
    };
  }

  installedServers.add(server as object);
}

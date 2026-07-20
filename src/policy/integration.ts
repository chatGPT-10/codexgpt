import type { z } from "zod";
import type { AuditRequirement } from "../config.js";
import {
  commitTransactionWithAudit,
  executionAuditFacts
} from "../audit/transactionParticipant.js";
import { type AuditMutationKind, type AuthorizationAuditEventV2, type ExecutionAuditStatus } from "../audit/types.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { PersistedExecutionAuditEvidenceV2 } from "../audit/runtime.js";
import { pendingVerificationReceipt } from "../worktrees/verificationTerminal.js";
import { TransactionError } from "../transactions/types.js";
import { pendingWorkspaceMutation } from "../mutations/index.js";
import { toolPolicyDefinition } from "./toolPolicy.js";
import type {
  AuditEventV1,
  PolicyDecisionV1,
  PolicyEngineMode,
  RequiredCapabilityV1,
  ResourceDescriptorV4,
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
  revertsChangeSetId?: string | null;
  operationCount: number;
  mutationKinds: AuditMutationKind[];
  recoveryRequired: boolean;
}

export interface PolicyAuthorizationResult {
  decision: PolicyDecisionV1;
  auditEvent: AuditEventV1 | null;
  auditContext?: AuditAuthorizationContextV2;
  localApproval?: {
    schemaVersion: 3;
    approvalId: string;
    serverId: string;
  };
  v4Authorization?: AuthorizationAuditEventV4;
  reservation?: {
    schemaVersion: 3;
    commit(): void | Promise<void>;
    burn(resultCode: string): void | Promise<void>;
  };
}

export interface ResourceResolutionResult {
  resource: ResourceDescriptorV4;
  requiredCapabilities?: RequiredCapabilityV1[];
  requiredScopes?: readonly string[];
  semanticFactsDigest?: string;
  riskClass?: "R0" | "R1" | "R2" | "R3" | "R4";
  approvalRevealArguments?: readonly string[];
}

export interface ToolResourceResolver {
  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult;
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
  persistExecution?(context: AuditAuthorizationContextV2, execution: AuditExecutionInputV2):
    | PersistedExecutionAuditEvidenceV2
    | void
    | Promise<PersistedExecutionAuditEvidenceV2 | void>;
}

const POLICY_FAILURE = Symbol("codexgpt.policy.failure");
const POLICY_WRAPPED_HANDLER = Symbol("codexgpt.policy.wrapped-handler");
const installedServers = new WeakSet<object>();
const AUTHORIZED_RESOURCE = Symbol.for("codexgpt.policy.authorized-resource");
const AUTHORIZATION_V4 = Symbol.for("codexgpt.policy.authorization-v4");

export function authorizedResourceFingerprint(args: object): string | null {
  return (args as Record<symbol, unknown>)[AUTHORIZED_RESOURCE] as string ?? null;
}

export function authorizedGitEventV4(args: object): AuthorizationAuditEventV4 | null {
  return (args as Record<symbol, unknown>)[AUTHORIZATION_V4] as AuthorizationAuditEventV4 ?? null;
}

export async function withAuthorizedResourceBinding<T>(args: object, fingerprint: string, operation: () => T | Promise<T>): Promise<T> {
  Object.defineProperty(args, AUTHORIZED_RESOURCE, { value: fingerprint, configurable: true, enumerable: false });
  try {
    return await operation();
  } finally {
    delete (args as Record<symbol, unknown>)[AUTHORIZED_RESOURCE];
  }
}

async function withAuthorizationV4Binding<T>(
  args: object,
  authorization: AuthorizationAuditEventV4 | undefined,
  operation: () => T | Promise<T>
): Promise<T> {
  if (!authorization) return operation();
  Object.defineProperty(args, AUTHORIZATION_V4, { value: authorization, configurable: true, enumerable: false });
  try {
    return await operation();
  } finally {
    delete (args as Record<symbol, unknown>)[AUTHORIZATION_V4];
  }
}

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

export function createPolicyToolFailure(
  decision: Pick<PolicyDecisionV1, "reasonCode" | "policyRevision">,
  localApproval?: PolicyAuthorizationResult["localApproval"]
): ToolCallResult {
  const reasonCode = safeReason(decision.reasonCode);
  const policyRevision = safeId(decision.policyRevision, "policy-unavailable");
  const approvalLines = localApproval && reasonCode === "APPROVAL_REQUIRED"
    ? [
        `Approval ID: ${safeId(localApproval.approvalId, "approval-unavailable")}`,
        `Server: ${safeId(localApproval.serverId, "server-unavailable")}`,
        `Next: codexgpt approvals list --server ${safeId(localApproval.serverId, "server-unavailable")}`,
        "After a local decision, retry the identical operation."
      ]
    : [];
  const result: ToolCallResult = {
    content: [{
      type: "text",
      text: [
        "CodexGPT policy refused this operation.",
        `Code: ${reasonCode}`,
        `Policy revision: ${policyRevision}`,
        ...approvalLines
      ].join("\n")
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
    throw new Error("CodexGPT server does not expose a registered-tool map for Policy Kernel installation.");
  }
  if (installedServers.has(server as object)) {
    throw new Error("Policy Kernel is already installed on this server.");
  }

  for (const [toolName, entry] of Object.entries(tools)) {
    const registered = entry.handler as RegisteredToolEntry["handler"] & {
      [POLICY_WRAPPED_HANDLER]?: true;
    };
    if (
      toolName === "codexgpt" ||
      entry.enabled === false ||
      registered[POLICY_WRAPPED_HANDLER] === true
    ) continue;
    toolPolicyDefinition(toolName);
    const original = registered;
    entry.handler = async (args, extra) => {
      let authorization: PolicyAuthorizationResult | undefined;
      try {
        authorization = await runtime.authorize(toolName, args, extra);
        if (authorization.auditEvent) await runtime.audit(authorization.auditEvent);
      } catch {
        if (authorization?.reservation) {
          try { await authorization.reservation.burn("AUTHORIZATION_AUDIT_FAILED"); } catch { }
        }
        if (runtime.mode === "enforce") return unavailableFailure();
        return original(args, extra);
      }

      const auditContext = authorization.auditContext;
      if (auditContext) {
        try {
          if (!runtime.persistAuthorization) throw new Error("Persistent audit runtime is unavailable.");
          await runtime.persistAuthorization(auditContext);
        } catch {
          if (authorization.reservation) {
            try { await authorization.reservation.burn("AUTHORIZATION_AUDIT_FAILED"); } catch { }
          }
          if (auditContext.requirement === "required") return unavailableFailure();
        }
      }

      if (runtime.mode === "enforce" && authorization.decision.outcome !== "allow") {
        if (authorization.reservation) {
          try { await authorization.reservation.burn("POLICY_NOT_ALLOWED"); } catch { }
        }
        if (auditContext) {
          const notExecuted: AuditExecutionInputV2 = {
            status: "not_executed",
            resultCode: authorization.decision.reasonCode,
            durationMs: 0,
            exitCode: null,
            boundedByteCounts: {},
            changeSetId: null,
            revertsChangeSetId: null,
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
        return createPolicyToolFailure(authorization.decision, authorization.localApproval);
      }

      if (authorization.reservation) {
        try {
          await authorization.reservation.commit();
        } catch {
          return unavailableFailure();
        }
      }

      const startedAt = Date.now();
      try {
        let result = await withAuthorizedResourceBinding(
          args,
          authorization.decision.resourceFingerprint,
          () => withAuthorizationV4Binding(args, authorization.v4Authorization, () => original(args, extra))
        );
        const workspaceMutation = pendingWorkspaceMutation(result);
        if (workspaceMutation && (
          !auditContext ||
          auditContext.requirement !== "required" ||
          !runtime.persistExecution
        )) {
          await workspaceMutation.rollback("required_audit_unavailable");
          return unavailableFailure();
        }
        if (auditContext) {
          const facts = executionAuditFacts(result);
          const execution: AuditExecutionInputV2 = {
            status: result.isError === true ? "failed" : "succeeded",
            resultCode: result.isError === true ? "TOOL_ERROR" : facts?.resultCode ?? "OK",
            durationMs: Math.max(0, Date.now() - startedAt),
            exitCode: facts?.exitCode ?? null,
            boundedByteCounts: facts?.boundedByteCounts ?? {},
            changeSetId: facts?.changeSetId ?? workspaceMutation?.changeSetId ?? null,
            revertsChangeSetId: workspaceMutation?.revertsChangeSetId ?? null,
            operationCount: facts?.operationCount ?? workspaceMutation?.operationCount ?? 0,
            mutationKinds: facts?.mutationKinds ?? [...(workspaceMutation?.mutationKinds ?? [])],
            recoveryRequired: false
          };
          try {
            if (!runtime.persistExecution) throw new Error("Persistent audit runtime is unavailable.");
            if (workspaceMutation) {
              result = await workspaceMutation.commit({
                result,
                persistAudit: async () => {
                  await runtime.persistExecution!(auditContext, execution);
                }
              });
            } else if (facts?.pendingMutationCommit && auditContext.requirement === "required") {
              await commitTransactionWithAudit({
                pending: facts.pendingMutationCommit,
                runtime: {
                  persistExecution: async (context, input) => {
                    await runtime.persistExecution!(context, input);
                  }
                },
                context: auditContext,
                execution
              });
            } else {
              const auditEvidence = await runtime.persistExecution(auditContext, execution);
              const pendingVerification = pendingVerificationReceipt(result);
              if (pendingVerification) {
                if (!auditEvidence) return unavailableFailure();
                const receipt = pendingVerification.finalize(auditEvidence);
                pendingVerification.attach(receipt);
              }
            }
          } catch (error) {
            let projectedFailure: ToolCallResult | null = null;
            try {
              projectedFailure = workspaceMutation?.projectFailure(error, result) ?? null;
            } catch {
              return unavailableFailure();
            }
            if (projectedFailure) return projectedFailure;
            if (error instanceof TransactionError) {
              if (workspaceMutation) return unavailableFailure();
              throw error;
            }
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
            revertsChangeSetId: null,
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
    Object.defineProperty(entry.handler, POLICY_WRAPPED_HANDLER, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }

  installedServers.add(server as object);
}

import type { z } from "zod";
import { toolPolicyDefinition } from "./toolPolicy.js";
import type { AuditEventV1, PolicyDecisionV1, PolicyEngineMode } from "./types.js";

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

export interface PolicyAuthorizationResult {
  decision: PolicyDecisionV1;
  auditEvent: AuditEventV1 | null;
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

      if (runtime.mode === "enforce" && authorization.decision.outcome !== "allow") {
        return createPolicyToolFailure(authorization.decision);
      }
      return original(args, extra);
    };
  }

  installedServers.add(server as object);
}

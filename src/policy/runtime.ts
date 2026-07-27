import { createHash, randomUUID } from "node:crypto";
import { resolveAuditRequirement, type CodexGPTConfig } from "../config.js";
import {
  credentialRevisionForIdentity,
  effectivePolicyScopes,
  ownerIdForPolicyIdentity
} from "../auth/policyIdentity.js";
import {
  CONTRACT_V3_ADDITIONS,
  CONTRACT_V4_ADDITIONS,
  contractIncludesV3,
  contractIncludesV4
} from "../tools/contracts/index.js";
import { authorizationAuditEventV2Schema, auditEventV4Schema } from "../audit/schemas.js";
import type { AuthorizationAuditEventV4, SemanticAuditFactsV1 } from "../audit/types.js";
import type { LocalApprovalRuntimeV3 } from "../control/runtime.js";
import type { RootAdmissionRuntimeV3 } from "../access/rootAdmission.js";
import type { PathGuard, Workspace, WorkspaceManager } from "../guard.js";
import { SessionGrantStore } from "./approval.js";
import {
  createAuthorizationFactsV3,
  createAuthorizationFactsV4,
  semanticDigest,
  type InheritedToolContractVersionV3
} from "./authorizationFacts.js";
import { createAuditEvent } from "./audit.js";
import { compileCompatibilityProfile } from "./compat.js";
import { createRequestContext } from "./context.js";
import { baselineNodeCapabilityReport } from "./enforcement.js";
import type { CapabilityEvidenceStoreV3 } from "./executionCapabilities.js";
import { evaluatePolicy } from "./evaluator.js";
import { HARD_POLICY_REVISION } from "./hardPolicy.js";
import type {
  PolicyRuntime,
  PolicyAuthorizationResult,
  ToolResourceResolver
} from "./integration.js";
import type { PolicySessionContextSource } from "./identity.js";
import {
  compilePermissionProfile,
  compilePermissionProfileV3,
  loadPermissionProfileGraph,
  loadPermissionProfileGraphV3,
  policyRevisionForSources,
  type LoadedPermissionProfileGraph
} from "./profileStore.js";
import {
  describeFilesystemResource,
  describeGitResource,
  describeProcessResource,
  describeShellResource,
  fingerprintResource
} from "./resources.js";
import { policyDecisionV1Schema } from "./schemas.js";
import { requiredScopesForTool, toolPolicyDefinition } from "./toolPolicy.js";
import type {
  AuditEventV1,
  CompiledPermissionProfileV1,
  PolicyDecisionProvenanceV1,
  PolicyDecisionV1,
  PolicyScope,
  PolicyScopeV4,
  RequiredCapabilityV1,
  ResourceDescriptorV1,
  ResourceDescriptorV4,
  RiskClass
} from "./types.js";

export function policyIdentityScopes(config: CodexGPTConfig): PolicyScope[] {
  const scopes: PolicyScope[] = [
    "workspace:open",
    "filesystem:read",
    "git:read",
    "audit:read"
  ];
  if (config.writeMode !== "off") scopes.push("filesystem:write");
  if (config.bashMode === "safe" || config.bashMode === "full") scopes.push("shell:verify");
  if (config.bashMode === "full") scopes.push("shell:execute");
  return scopes;
}

function sourceHash(id: string, value: unknown): { id: string; sha256: string } {
  return {
    id,
    sha256: createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
  };
}

function compiledProfile(config: CodexGPTConfig): {
  profile: CompiledPermissionProfileV1;
  sourceHashes: Array<{ id: string; sha256: string }>;
} {
  let graph: LoadedPermissionProfileGraph;
  if (config.permissionProfileId) {
    if (contractIncludesV3(config.toolContractVersion)) {
      const graphV3 = loadPermissionProfileGraphV3(config.permissionProfileId);
      const compiledV3 = compilePermissionProfileV3(graphV3, process.platform);
      const { fullAccess: _fullAccess, schemaVersion: _schemaVersion, ...base } = compiledV3;
      return { profile: { ...base, schemaVersion: 1 }, sourceHashes: graphV3.sourceHashes };
    }
    graph = loadPermissionProfileGraph(config.permissionProfileId);
  } else {
    const document = compileCompatibilityProfile(config);
    graph = {
      id: document.id,
      order: [document],
      sourceHashes: [sourceHash(document.id, document)]
    };
  }
  return {
    profile: compilePermissionProfile(graph, process.platform),
    sourceHashes: graph.sourceHashes
  };
}

function inputDigest(args: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(args), "utf8").digest("hex")}`;
}

function operationForApproval(resource: ResourceDescriptorV4): string {
  return `${resource.kind}.${resource.operation}`;
}

function approvalArgumentCount(args: Record<string, unknown>): number {
  if (args.command && typeof args.command === "object") {
    const command = args.command as Record<string, unknown>;
    return command.kind === "argv" && Array.isArray(command.args) ? Math.min(command.args.length, 100_000) : 0;
  }
  if (Array.isArray(args.argv)) return Math.min(args.argv.length, 100_000);
  if (typeof args.command === "string") {
    const value = args.command.trim();
    return value ? Math.min(value.split(/\s+/).length, 100_000) : 0;
  }
  return Math.min(Object.keys(args).filter((key) => key !== "environment" && key !== "env").length, 100_000);
}

function approvalRevealArguments(args: Record<string, unknown>): string[] {
  if (args.command && typeof args.command === "object") {
    const command = args.command as Record<string, unknown>;
    return command.kind === "argv" && Array.isArray(command.args)
      ? [typeof command.executable === "string" ? command.executable : "[executable omitted]", ...command.args.filter((value): value is string => typeof value === "string")].slice(0, 32)
      : [];
  }
  if (Array.isArray(args.argv)) {
    return args.argv.filter((value): value is string => typeof value === "string").slice(0, 32);
  }
  if (typeof args.command === "string") return [args.command];
  return [];
}

function describedApprovalRevealArguments(
  described: { approvalRevealArguments?: readonly string[] },
  args: Record<string, unknown>
): string[] {
  if (!described.approvalRevealArguments) return approvalRevealArguments(args);
  if (
    described.approvalRevealArguments.length > 32 ||
    described.approvalRevealArguments.some((value) =>
      typeof value !== "string" || value.length < 1 || value.length > 4096 || /[\u0000\r\n]/u.test(value)
    )
  ) throw new Error("Approval display arguments are invalid.");
  return [...described.approvalRevealArguments];
}

function decisionWithApprovalId(decision: PolicyDecisionV1, approvalId: string): PolicyDecisionV1 {
  return policyDecisionV1Schema.parse({
    ...decision,
    provenance: decision.provenance.map((item) => item.sourceKind === "approval_policy"
      ? { ...item, approvalId }
      : item)
  });
}

function decisionWithResourceFingerprint(
  decision: PolicyDecisionV1,
  resourceFingerprint: string
): PolicyDecisionV1 {
  if (decision.resourceFingerprint === resourceFingerprint) return decision;
  const facts = {
    outcome: decision.outcome,
    reasonCode: decision.reasonCode,
    policyRevision: decision.policyRevision,
    resourceFingerprint,
    requiredApproval: decision.requiredApproval,
    requiredEnforcement: decision.requiredEnforcement,
    provenance: decision.provenance
  };
  return policyDecisionV1Schema.parse({
    schemaVersion: 1,
    decisionId: `decision_${createHash("sha256").update(JSON.stringify(facts), "utf8").digest("hex").slice(0, 24)}`,
    ...facts
  });
}

function repositoryKey(workspace: Workspace): string {
  return `repo_${createHash("sha256").update(workspace.root, "utf8").digest("hex").slice(0, 24)}`;
}

function stringArg(args: Record<string, unknown>, key: string, fallback: string): string {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function workspaceFor(
  definitionMode: string,
  args: Record<string, unknown>,
  workspaces: WorkspaceManager
): Workspace | null {
  const workspaceId = typeof args.workspace_id === "string" && args.workspace_id.trim()
    ? args.workspace_id.trim()
    : undefined;
  if (definitionMode === "context_only") {
    return workspaceId ? workspaces.getWorkspace(workspaceId) : null;
  }
  return workspaceId ? workspaces.getWorkspace(workspaceId) : workspaces.resolveWorkspace();
}

function toolMayMutate(toolName: string, config: CodexGPTConfig): boolean {
  if (toolName === "query_audit_events") return false;
  const mode = toolPolicyDefinition(toolName).resourceMode;
  if (mode === "shell") return config.bashMode === "full";
  return mode === "workspace_write" || mode === "exact_write" || mode === "bridge_write" || mode === "resolved";
}

interface DescribedPolicyResource {
  resource: ResourceDescriptorV4;
  requiredCapabilities: RequiredCapabilityV1[];
  riskClass: RiskClass;
  requiredScope: PolicyScope | null;
  requiredScopes: readonly PolicyScopeV4[];
  approvalBindingV3?: {
    transportSessionId: string;
    workspaceId: string;
    resourceFingerprint: string;
    inputDigest: string;
  };
  semanticFactsDigest: string | null;
  semanticAuditFacts?: SemanticAuditFactsV1;
  approvalRevealArguments?: readonly string[];
}

function describeResource(
  toolName: string,
  args: Record<string, unknown>,
  config: CodexGPTConfig,
  workspaces: WorkspaceManager,
  guard: PathGuard,
  resourceResolver?: ToolResourceResolver
): DescribedPolicyResource {
  const definition = toolPolicyDefinition(toolName);
  const semanticPreviewApply = toolName === "apply_patch" && typeof args.semantic_preview_id === "string";
  if (definition.resourceMode === "resolved" || semanticPreviewApply) {
    if (!resourceResolver) throw new Error("Policy resource resolver is unavailable.");
    const described = resourceResolver.describe(toolName, args);
    const v3Addition = (CONTRACT_V3_ADDITIONS as readonly string[]).includes(toolName);
    const requiredScopes = described.requiredScopes
      ? [...described.requiredScopes] as PolicyScopeV4[]
      : v3Addition
        ? [...requiredScopesForTool(toolName, {
            contractVersion: 3,
            mode: args.mode === "full_access" ? "full_access" : "workspace"
          })]
        : definition.requiredScope
          ? [definition.requiredScope]
          : [];
    if (v3Addition && !described.semanticFactsDigest) {
      throw new Error("V3 policy resource resolver did not provide semantic authorization facts.");
    }
    return {
      resource: described.resource,
      requiredCapabilities: described.requiredCapabilities ?? [{ name: "filesystemWriteBoundary", minimum: "brokered" }],
      riskClass: described.riskClass ?? definition.riskClass,
      requiredScope: definition.requiredScope,
      requiredScopes,
      approvalBindingV3: described.approvalBindingV3,
      semanticFactsDigest: described.semanticFactsDigest ?? null,
      semanticAuditFacts: described.semanticAuditFacts,
      approvalRevealArguments: described.approvalRevealArguments
    };
  }
  const workspace = workspaceFor(definition.resourceMode, args, workspaces);
  const requiredCapabilities: RequiredCapabilityV1[] = [];

  if (definition.resourceMode === "context_only") {
    const resource = describeProcessResource({
      operation: "inspect",
      workspaceId: workspace?.id ?? null,
      processId: `policy-${toolName}`,
      persistence: false,
      executable: null
    });
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope, requiredScopes: definition.requiredScope ? [definition.requiredScope] : [], semanticFactsDigest: null };
  }

  if (!workspace) throw new Error("Policy resource requires a workspace.");

  if (definition.resourceMode === "exact_read" || definition.resourceMode === "workspace_read") {
    requiredCapabilities.push({ name: "filesystemReadBoundary", minimum: "brokered" });
    const resource = describeFilesystemResource({
      workspace,
      guard,
      operation: definition.resourceMode === "exact_read" ? "read" : "list",
      inputPath: definition.resourceMode === "exact_read" ? stringArg(args, "path", ".") : stringArg(args, "path", ".")
    });
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope, requiredScopes: definition.requiredScope ? [definition.requiredScope] : [], semanticFactsDigest: null };
  }

  if (definition.resourceMode === "exact_write" || definition.resourceMode === "workspace_write" || definition.resourceMode === "bridge_write") {
    requiredCapabilities.push({ name: "filesystemWriteBoundary", minimum: "brokered" });
    const inputPath = definition.resourceMode === "exact_write"
      ? stringArg(args, "path", ".")
      : definition.resourceMode === "bridge_write"
        ? config.contextDir
        : ".";
    const resource = describeFilesystemResource({ workspace, guard, operation: "write", inputPath });
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope, requiredScopes: definition.requiredScope ? [definition.requiredScope] : [], semanticFactsDigest: null };
  }

  if (definition.resourceMode === "git_read") {
    const pathArg = typeof args.path === "string" && args.path.trim() ? [args.path] : [];
    const resource = describeGitResource({
      workspaceId: workspace.id,
      operation: "read",
      repositoryKey: repositoryKey(workspace),
      relativePaths: pathArg,
      refs: [],
      remoteName: null,
      remoteHost: null
    });
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope, requiredScopes: definition.requiredScope ? [definition.requiredScope] : [], semanticFactsDigest: null };
  }

  const command = stringArg(args, "command", "");
  const verification = config.bashMode === "safe";
  requiredCapabilities.push(
    { name: "processTreeControl", minimum: "job_object" },
    { name: "environmentIsolation", minimum: "isolated" },
    { name: "credentialIsolation", minimum: "isolated" }
  );
  const resource = describeShellResource({
    workspaceId: workspace.id,
    operation: verification ? "verify" : "execute",
    backend: "bash",
    cwd: stringArg(args, "cwd", "."),
    commandKind: verification ? "verification" : "opaque",
    command,
    executable: command.trim().split(/\s+/)[0] || null,
    argumentCount: command.trim() ? command.trim().split(/\s+/).length : 0,
    persistence: false,
    requestedNetwork: false
  });
  return {
    resource,
    requiredCapabilities,
    riskClass: verification ? "R1" : definition.riskClass,
    requiredScope: verification ? "shell:verify" : definition.requiredScope,
    requiredScopes: [verification ? "shell:verify" : definition.requiredScope ?? "shell:execute"],
    semanticFactsDigest: null
  };
}

function contextDecision(input: {
  contextPolicyRevision: string;
  resource: ResourceDescriptorV4;
  requiredScopes: readonly PolicyScopeV4[];
  scopes: readonly string[];
  riskClass: RiskClass;
  granted?: { grantId: string; approvalId: string };
}): PolicyDecisionV1 {
  const missingScopes = input.requiredScopes.filter((scope) => !input.scopes.includes(scope));
  const allowedScope = missingScopes.length === 0;
  let outcome: PolicyDecisionV1["outcome"];
  let reasonCode: PolicyDecisionV1["reasonCode"];
  let requiredApproval: PolicyDecisionV1["requiredApproval"] = null;
  let provenance: PolicyDecisionProvenanceV1[];

  if (!allowedScope || input.riskClass === "R4") {
    outcome = "deny";
    reasonCode = "POLICY_DENIED";
    provenance = [{
      sourceKind: allowedScope ? "approval_policy" : "identity_scope",
      safeRuleId: allowedScope ? "approval.r4.unapprovable" : `scope.${missingScopes[0]}`,
      specificity: [],
      grantId: null,
      approvalId: null,
      enforcementBackend: null
    }];
  } else if (input.riskClass === "R0" || input.granted) {
    outcome = "allow";
    reasonCode = null;
    provenance = [{
      sourceKind: input.granted ? "session_grant" : "identity_scope",
      safeRuleId: input.granted ? "approval.grant.consume" : input.requiredScopes.length ? `scope.${input.requiredScopes.join("+")}` : "scope.not-required",
      specificity: [],
      grantId: input.granted?.grantId ?? null,
      approvalId: input.granted?.approvalId ?? null,
      enforcementBackend: null
    }];
  } else {
    outcome = "approval_required";
    reasonCode = "APPROVAL_REQUIRED";
    requiredApproval = {
      riskClass: input.riskClass as "R1" | "R2" | "R3",
      maxTtlMs: input.riskClass === "R1" ? 30 * 60_000 : input.riskClass === "R2" ? 5 * 60_000 : 2 * 60_000,
      uses: input.riskClass === "R3" ? 1 : null
    };
    provenance = [{
      sourceKind: "approval_policy",
      safeRuleId: `approval.${input.riskClass.toLocaleLowerCase("en-US")}`,
      specificity: [],
      grantId: null,
      approvalId: null,
      enforcementBackend: null
    }];
  }

  const facts = {
    outcome,
    reasonCode,
    policyRevision: input.contextPolicyRevision,
    resourceFingerprint: input.resource.resourceFingerprint,
    requiredApproval,
    requiredEnforcement: [],
    provenance
  };
  const decisionId = `decision_${createHash("sha256").update(JSON.stringify(facts), "utf8").digest("hex").slice(0, 24)}`;
  return policyDecisionV1Schema.parse({ schemaVersion: 1, decisionId, ...facts });
}

export interface PolicyConfigurationInspection {
  profileId: string;
  policyRevision: string;
  hardPolicyRevision: string;
  backendId: string;
  evidenceRevision: string;
  missingCapabilities: string[];
}

export function inspectPolicyConfiguration(config: CodexGPTConfig): PolicyConfigurationInspection {
  const capabilities = baselineNodeCapabilityReport(process.platform);
  const compiled = compiledProfile(config);
  return {
    profileId: compiled.profile.id,
    policyRevision: policyRevisionForSources(
      compiled.sourceHashes,
      HARD_POLICY_REVISION,
      capabilities.evidenceRevision
    ),
    hardPolicyRevision: HARD_POLICY_REVISION,
    backendId: capabilities.backendId,
    evidenceRevision: capabilities.evidenceRevision,
    missingCapabilities: [
      "processTreeControl",
      "networkEgressControl",
      "credentialIsolation",
      "registryIsolation",
      "supportsPeerAddressVerification",
      "supportsRedirectReauthorization",
      "supportsRevocation"
    ]
  };
}

export interface CreateDefaultPolicyRuntimeInput {
  config: CodexGPTConfig;
  workspaces: WorkspaceManager;
  guard: PathGuard;
  sessionSource: PolicySessionContextSource;
  auditSink?: (event: AuditEventV1) => void | Promise<void>;
  persistentAudit?: Required<Pick<PolicyRuntime, "persistAuthorization" | "persistExecution">>;
  grants?: SessionGrantStore;
  localApprovalRuntimeV3?: LocalApprovalRuntimeV3;
  resourceResolver?: ToolResourceResolver;
  capabilityEvidenceStoreV3?: CapabilityEvidenceStoreV3;
  rootAdmissionRuntimeV3?: RootAdmissionRuntimeV3;
}

function inheritedToolContractVersionV3(version: number): InheritedToolContractVersionV3 {
  if (version === 3) return "3";
  if (version === 4) return "4";
  if (version === 5) return "5";
  throw new Error("Inherited local approval requires tool contract 3, 4, or 5.");
}

export function createDefaultPolicyRuntime(input: CreateDefaultPolicyRuntimeInput): PolicyRuntime & {
  policyRevision: string;
  permissionProfileId: string;
  grants: SessionGrantStore;
} {
  const capabilities = baselineNodeCapabilityReport(process.platform);
  const compiled = compiledProfile(input.config);
  const currentEvidenceRevision = () => input.capabilityEvidenceStoreV3?.snapshot().evidenceRevision
    ?? capabilities.evidenceRevision;
  const currentPolicyRevision = () => policyRevisionForSources(
    compiled.sourceHashes,
    HARD_POLICY_REVISION,
    currentEvidenceRevision()
  );
  const grants = input.localApprovalRuntimeV3?.grants ?? input.grants ?? new SessionGrantStore();
  const contractV3 = contractIncludesV3(input.config.toolContractVersion);
  const contractV4 = contractIncludesV4(input.config.toolContractVersion);

  return {
    mode: input.config.policyEngineMode ?? "legacy",
    diagnostics() {
      return {
        policyRevision: currentPolicyRevision(),
        permissionProfileId: compiled.profile.id,
        hardPolicyRevision: HARD_POLICY_REVISION,
        grantRevision: grants.revision(),
        enforcement: {
          active: (input.config.policyEngineMode ?? "legacy") !== "legacy",
          backendId: capabilities.backendId,
          evidenceRevision: currentEvidenceRevision(),
          missingCapabilities: [
            "processTreeControl",
            "networkEgressControl",
            "credentialIsolation",
            "registryIsolation",
            "supportsPeerAddressVerification",
            "supportsRedirectReauthorization",
            "supportsRevocation"
          ]
        }
      };
    },
    get policyRevision() {
      return currentPolicyRevision();
    },
    permissionProfileId: compiled.profile.id,
    grants,
    async authorize(toolName, args): Promise<PolicyAuthorizationResult> {
      const started = Date.now();
      const policyRevision = currentPolicyRevision();
      const described = describeResource(
        toolName,
        args,
        input.config,
        input.workspaces,
        input.guard,
        input.resourceResolver
      );
      const now = new Date().toISOString();
      const workspaceId = "workspaceId" in described.resource ? described.resource.workspaceId ?? null : null;
      const context = createRequestContext(input.sessionSource, {
        requestId: `request_${randomUUID().replaceAll("-", "")}`,
        workspaceId,
        runtimeProfileId: "runtime-default",
        permissionProfileId: compiled.profile.id,
        policyRevision,
        sessionGrantRevision: grants.revision(),
        receivedAt: now
      });
      const effectiveScopes: PolicyScopeV4[] = [...effectivePolicyScopes(input.config, context.identity)];

      const digest = inputDigest(args);
      const reconnectBoundApproval = contractV3 && (
        (toolName === "apply_patch" && typeof args.semantic_preview_id === "string") ||
        toolName === "undo_change_set"
      );
      if (described.approvalBindingV3 && !reconnectBoundApproval) {
        throw new Error("Reconnect-stable approval binding is unavailable for this tool.");
      }
      const approvalBinding = reconnectBoundApproval
        ? described.approvalBindingV3
        : undefined;
      const authorizationContext = approvalBinding
        ? {
            ...context,
            transportSessionId: approvalBinding.transportSessionId,
            workspaceId: approvalBinding.workspaceId
          }
        : context;
      const authorizationResource = approvalBinding
        ? {
            ...described.resource,
            workspaceId: approvalBinding.workspaceId,
            resourceFingerprint: approvalBinding.resourceFingerprint
          } as ResourceDescriptorV4
        : described.resource;
      const authorizationDigest = approvalBinding?.inputDigest ?? digest;
      const approvalToolContractVersion = contractV3
        ? inheritedToolContractVersionV3(input.config.toolContractVersion)
        : String(input.config.toolContractVersion);
      const matchInput = {
        context: authorizationContext,
        operation: operationForApproval(authorizationResource),
        resourceFingerprint: authorizationResource.resourceFingerprint,
        inputDigest: authorizationDigest,
        riskClass: described.riskClass,
        toolContractVersion: approvalToolContractVersion,
        now
      };
      const reserved = contractV3 && input.localApprovalRuntimeV3 && described.riskClass !== "R0" && described.riskClass !== "R4"
        ? await input.localApprovalRuntimeV3.reserveMatching(matchInput)
        : null;
      const v3Addition = contractV3 && (CONTRACT_V3_ADDITIONS as readonly string[]).includes(toolName);
      const v4Addition = contractV4 &&
        (CONTRACT_V4_ADDITIONS as readonly string[]).includes(toolName);
      let decision = toolPolicyDefinition(toolName).resourceMode === "context_only" || v3Addition || v4Addition
        ? contextDecision({
            contextPolicyRevision: policyRevision,
            resource: authorizationResource as ResourceDescriptorV1,
            requiredScopes: described.requiredScopes,
            scopes: effectiveScopes,
            riskClass: described.riskClass,
            granted: reserved ? { grantId: reserved.reservation.grantId, approvalId: reserved.approval.approvalId } : undefined
          })
        : evaluatePolicy({
            context: authorizationContext,
            activePolicyRevision: policyRevision,
            profile: compiled.profile,
            resource: authorizationResource as ResourceDescriptorV1,
            riskClass: described.riskClass,
            grants: reserved ? [reserved.reservation.grant] : contractV3 ? [] : grants.snapshot(),
            requiredCapabilities: described.requiredCapabilities,
            capabilities,
            deploymentDisabled: false,
            now,
            platform: process.platform,
            toolContractVersion: String(input.config.toolContractVersion),
            inputDigest: authorizationDigest
          });

      if (reserved && decision.outcome !== "allow") {
        await input.localApprovalRuntimeV3!.burn(reserved, "POLICY_NOT_ALLOWED", now);
      }

      let localApproval: PolicyAuthorizationResult["localApproval"];
      if (contractV3 && decision.outcome === "approval_required") {
        if (!input.localApprovalRuntimeV3) throw new Error("V3 local approval runtime is unavailable.");
        const canonicalAction = operationForApproval(authorizationResource);
        const semanticFacts = described.semanticFactsDigest ?? semanticDigest({
          canonicalAction,
          operation: operationForApproval(authorizationResource),
          resourceFingerprint: authorizationResource.resourceFingerprint,
          inputDigest: authorizationDigest,
          args
        });
        const executionDisplay = described.resource as unknown as {
          kind?: string;
          backendId?: unknown;
          argumentCount?: unknown;
          accessMode?: unknown;
          integrationMode?: unknown;
        };
        const facts = createAuthorizationFactsV3({
          serverId: input.localApprovalRuntimeV3.serverId,
          credentialRef: authorizationContext.identity.credentialRef,
          credentialRevision: credentialRevisionForIdentity(authorizationContext.identity),
          transportKind: authorizationContext.transportKind,
          transportSessionId: authorizationContext.transportSessionId,
          identityKind: authorizationContext.identity.kind,
          identitySubject: authorizationContext.identity.subject,
          workspaceId: authorizationContext.workspaceId,
          leaseId: null,
          policyRevision,
          evidenceRevision: currentEvidenceRevision(),
          toolContractVersion: inheritedToolContractVersionV3(input.config.toolContractVersion),
          toolName,
          canonicalAction,
          operation: operationForApproval(authorizationResource),
          resourceFingerprint: authorizationResource.resourceFingerprint,
          inputDigest: authorizationDigest,
          semanticFactsDigest: semanticFacts,
          riskClass: described.riskClass as "R1" | "R2" | "R3"
        });
        const requested = await input.localApprovalRuntimeV3.request({
          facts,
          summary: {
            backend: executionDisplay.kind === "execution" && typeof executionDisplay.backendId === "string"
              ? executionDisplay.backendId
              : capabilities.backendId,
            actionKind: operationForApproval(authorizationResource),
            argumentCount: described.approvalRevealArguments
              ? described.approvalRevealArguments.length
              : executionDisplay.kind === "execution" && typeof executionDisplay.argumentCount === "number"
                ? executionDisplay.argumentCount
                : approvalArgumentCount(args),
            logicalScope: context.workspaceId ?? "server",
            identityLabel: context.identity.subject ?? context.identity.kind,
            authoritySummary: executionDisplay.kind === "git_v4" &&
              executionDisplay.integrationMode === "approved_full_access"
              ? "approved Git integration: ambient current-user full_access; no filesystem, credential, registry, network, or broker isolation; typed operation only"
              : executionDisplay.kind === "execution" && executionDisplay.accessMode === "full_access"
                ? "full_access: current-user unrestricted filesystem, credentials, registry, and network; no sandbox; host writeback possible; job-object members only; broker escape resistance none"
                : described.riskClass === "R3"
                  ? "ambient or destructive authority; local decision required"
                  : "bounded local authority; local decision required",
            digestPrefix: semanticFacts.replace(/^sha256:/, "").slice(0, 16),
            revealArguments: describedApprovalRevealArguments(described, args)
          },
          createdAt: now
        });
        if (toolName === "open_full_access_workspace") {
          if (!input.rootAdmissionRuntimeV3) throw new Error("Confirmed-root admission runtime is unavailable.");
          input.rootAdmissionRuntimeV3.registerPendingApproval(requested.approval.approvalId, args, {
            serverId: input.localApprovalRuntimeV3.serverId,
            credentialRef: context.identity.credentialRef,
            credentialRevision: credentialRevisionForIdentity(context.identity),
            transportKind: context.transportKind,
            transportSessionId: context.transportSessionId,
            identityKind: context.identity.kind,
            identitySubject: context.identity.subject,
            policyRevision,
            contractVersion: 3,
            evidenceRevision: currentEvidenceRevision()
          });
        }
        decision = decisionWithApprovalId(decision, requested.approval.approvalId);
        localApproval = {
          schemaVersion: 3,
          approvalId: requested.approval.approvalId,
          serverId: input.localApprovalRuntimeV3.serverId
        };
      }

      decision = decisionWithResourceFingerprint(
        decision,
        described.resource.resourceFingerprint
      );

      const grantId = decision.provenance.find((item) => item.grantId)?.grantId ?? null;
      const approvalId = decision.provenance.find((item) => item.approvalId)?.approvalId ?? null;
      const approvalState: AuditEventV1["approvalState"] = decision.outcome === "approval_required"
        ? "required"
        : grantId
          ? "granted"
          : decision.outcome === "allow"
            ? "not_required"
            : "denied";
      const auditEvent = v4Addition ? null : createAuditEvent({
        eventId: `event_${randomUUID().replaceAll("-", "")}`,
        timestamp: new Date().toISOString(),
        context,
        decision,
        resource: described.resource as ResourceDescriptorV1,
        toolName,
        canonicalAction: toolName,
        capabilities,
        approvalState,
        grantId,
        durationMs: Date.now() - started,
        resultCode: null,
        exitCode: null,
        boundedByteCounts: {}
      });
      const mutating = toolMayMutate(toolName, input.config);
      const requirement = resolveAuditRequirement({
        auditMode: input.config.auditMode ?? "auto",
        policyEngineMode: input.config.policyEngineMode ?? "legacy"
      }, described.riskClass, mutating);
      const auditContext = !auditEvent || requirement === "disabled" || !input.persistentAudit
        ? undefined
        : {
            authorizationEvent: authorizationAuditEventV2Schema.parse({
              schemaVersion: 2,
              eventId: auditEvent.eventId,
              eventType: "authorization",
              timestamp: auditEvent.timestamp,
              requestId: auditEvent.requestId,
              authorizationEventId: null,
              decisionId: auditEvent.decisionId,
              credentialRef: auditEvent.credentialRef,
              transportSessionId: auditEvent.transportSessionId,
              toolName: auditEvent.toolName,
              canonicalAction: auditEvent.canonicalAction,
              workspaceId: auditEvent.workspaceId,
              workspaceRef: null,
              policyRevision: auditEvent.policyRevision,
              resourceSummary: auditEvent.relativeResourceSummary,
              resourceFingerprint: auditEvent.resourceFingerprint.replace(/^sha256:/, ""),
              outcome: auditEvent.outcome,
              reasonCode: auditEvent.reasonCode,
              safeRuleIds: auditEvent.safeRuleIds,
              approvalState: auditEvent.approvalState,
              grantId: auditEvent.grantId,
              sandboxBackend: auditEvent.sandboxBackend,
              riskClass: described.riskClass,
              ...(described.semanticAuditFacts ? { semanticFacts: described.semanticAuditFacts } : {})
            }),
            requirement,
            riskClass: described.riskClass,
            mutating,
            ...(described.semanticAuditFacts ? { semanticFacts: described.semanticAuditFacts } : {})
          };
      let v4Authorization: PolicyAuthorizationResult["v4Authorization"];
      if (
        v4Addition &&
        described.resource.kind === "git_v4" &&
        (["R1", "R2", "R3"] as const).includes(described.riskClass as "R1" | "R2" | "R3")
      ) {
        const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
        const facts = createAuthorizationFactsV4({
          serverId: input.localApprovalRuntimeV3?.serverId ?? "server-v4",
          ownerId: ownerIdForPolicyIdentity(context.identity),
          credentialRef: context.identity.credentialRef,
          credentialRevision: credentialRevisionForIdentity(context.identity),
          transportKind: context.transportKind,
          transportSessionId: context.transportSessionId,
          repositoryId: described.resource.repositoryId,
          worktreeId: described.resource.worktreeId,
          policyRevision,
          configurationRevision: semanticDigest({
            gitMode: input.config.gitMode,
            gitIntegrations: input.config.gitIntegrations,
            contract: input.config.toolContractVersion
          }),
          capabilityRevision: currentEvidenceRevision(),
          pathPolicyRevision: semanticDigest({ blockedGlobs: input.config.blockedGlobs }),
          secretPolicyRevision: HARD_POLICY_REVISION,
          toolContractVersion: "4",
          toolName,
          canonicalAction: described.resource.operation,
          operation: described.resource.operation,
          resourceFingerprint: described.resource.resourceFingerprint,
          inputDigest: digest,
          semanticFactsDigest: described.semanticFactsDigest ?? semanticDigest(described.resource),
          riskClass: described.riskClass as "R1" | "R2" | "R3",
          issuedAt: now,
          expiresAt
        });
        v4Authorization = auditEventV4Schema.parse({
          schemaVersion: 4,
          contractVersion: 4,
          eventId: `event_${randomUUID().replaceAll("-", "")}`,
          eventType: "authorization",
          timestamp: now,
          requestId: context.requestId,
          authorizationEventId: null,
          decisionId: decision.decisionId,
          toolName,
          canonicalAction: described.resource.operation,
          workspaceId,
          policyRevision,
          subjectFingerprint: facts.subjectFingerprint,
          contextFingerprint: facts.contextFingerprint,
          resultCode: decision.reasonCode,
          counts: {
            affectedPathCount: described.resource.affectedPathCount,
            affectedByteCount: described.resource.affectedByteCount
          },
          repositoryId: described.resource.repositoryId,
          taskWorktreeId: described.resource.worktreeId,
          operationId: null,
          outcome: decision.outcome,
          riskClass: described.riskClass,
          resourceFingerprint: described.resource.resourceFingerprint,
          approvalId,
          grantId
        }) as AuthorizationAuditEventV4;
      }
      return {
        decision,
        auditEvent,
        auditContext,
        localApproval,
        v4Authorization,
        reservation: reserved && decision.outcome === "allow"
          ? {
              schemaVersion: 3,
              commit: () => input.localApprovalRuntimeV3!.commitConsume(reserved, new Date().toISOString()),
              burn: (resultCode: string) => input.localApprovalRuntimeV3!.burn(reserved, resultCode, new Date().toISOString())
            }
          : undefined
      };
    },
    async audit(event): Promise<void> {
      await input.auditSink?.(event);
    },
    async persistAuthorization(context): Promise<void> {
      if (!input.persistentAudit) throw new Error("Persistent audit runtime is unavailable.");
      await input.persistentAudit.persistAuthorization(context);
    },
    async persistExecution(context, execution) {
      if (!input.persistentAudit) throw new Error("Persistent audit runtime is unavailable.");
      return input.persistentAudit.persistExecution(context, execution);
    }
  };
}

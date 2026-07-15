import { createHash, randomUUID } from "node:crypto";
import { resolveAuditRequirement, type CodexProConfig } from "../config.js";
import { authorizationAuditEventV2Schema } from "../audit/schemas.js";
import type { PathGuard, Workspace, WorkspaceManager } from "../guard.js";
import { SessionGrantStore } from "./approval.js";
import { createAuditEvent } from "./audit.js";
import { compileCompatibilityProfile } from "./compat.js";
import { createRequestContext } from "./context.js";
import { baselineNodeCapabilityReport } from "./enforcement.js";
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
  loadPermissionProfileGraph,
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
import { toolPolicyDefinition } from "./toolPolicy.js";
import type {
  AuditEventV1,
  CompiledPermissionProfileV1,
  PolicyDecisionProvenanceV1,
  PolicyDecisionV1,
  PolicyScope,
  RequiredCapabilityV1,
  ResourceDescriptorV1,
  RiskClass
} from "./types.js";

export function policyIdentityScopes(config: CodexProConfig): PolicyScope[] {
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

function compiledProfile(config: CodexProConfig): {
  profile: CompiledPermissionProfileV1;
  sourceHashes: Array<{ id: string; sha256: string }>;
} {
  let graph: LoadedPermissionProfileGraph;
  if (config.permissionProfileId) {
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

function toolMayMutate(toolName: string, config: CodexProConfig): boolean {
  const mode = toolPolicyDefinition(toolName).resourceMode;
  if (mode === "shell") return config.bashMode === "full";
  return mode === "workspace_write" || mode === "exact_write" || mode === "bridge_write" || mode === "resolved";
}

function describeResource(
  toolName: string,
  args: Record<string, unknown>,
  config: CodexProConfig,
  workspaces: WorkspaceManager,
  guard: PathGuard,
  resourceResolver?: ToolResourceResolver
): { resource: ResourceDescriptorV1; requiredCapabilities: RequiredCapabilityV1[]; riskClass: RiskClass; requiredScope: PolicyScope | null } {
  const definition = toolPolicyDefinition(toolName);
  if (definition.resourceMode === "resolved") {
    if (!resourceResolver) throw new Error("Policy resource resolver is unavailable.");
    const described = resourceResolver.describe(toolName, args);
    return {
      resource: described.resource,
      requiredCapabilities: described.requiredCapabilities ?? [{ name: "filesystemWriteBoundary", minimum: "brokered" }],
      riskClass: definition.riskClass,
      requiredScope: definition.requiredScope
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
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope };
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
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope };
  }

  if (definition.resourceMode === "exact_write" || definition.resourceMode === "workspace_write" || definition.resourceMode === "bridge_write") {
    requiredCapabilities.push({ name: "filesystemWriteBoundary", minimum: "brokered" });
    const inputPath = definition.resourceMode === "exact_write"
      ? stringArg(args, "path", ".")
      : definition.resourceMode === "bridge_write"
        ? config.contextDir
        : ".";
    const resource = describeFilesystemResource({ workspace, guard, operation: "write", inputPath });
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope };
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
    return { resource, requiredCapabilities, riskClass: definition.riskClass, requiredScope: definition.requiredScope };
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
    requiredScope: verification ? "shell:verify" : definition.requiredScope
  };
}

function contextDecision(input: {
  contextPolicyRevision: string;
  resource: ResourceDescriptorV1;
  requiredScope: PolicyScope | null;
  scopes: readonly PolicyScope[];
  riskClass: RiskClass;
}): PolicyDecisionV1 {
  const allowedScope = !input.requiredScope || input.scopes.includes(input.requiredScope);
  let outcome: PolicyDecisionV1["outcome"];
  let reasonCode: PolicyDecisionV1["reasonCode"];
  let requiredApproval: PolicyDecisionV1["requiredApproval"] = null;
  let provenance: PolicyDecisionProvenanceV1[];

  if (!allowedScope || input.riskClass === "R4") {
    outcome = "deny";
    reasonCode = "POLICY_DENIED";
    provenance = [{
      sourceKind: allowedScope ? "approval_policy" : "identity_scope",
      safeRuleId: allowedScope ? "approval.r4.unapprovable" : `scope.${input.requiredScope}`,
      specificity: [],
      grantId: null,
      approvalId: null,
      enforcementBackend: null
    }];
  } else if (input.riskClass === "R0") {
    outcome = "allow";
    reasonCode = null;
    provenance = [{
      sourceKind: "identity_scope",
      safeRuleId: input.requiredScope ? `scope.${input.requiredScope}` : "scope.not-required",
      specificity: [],
      grantId: null,
      approvalId: null,
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

export function inspectPolicyConfiguration(config: CodexProConfig): PolicyConfigurationInspection {
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
  config: CodexProConfig;
  workspaces: WorkspaceManager;
  guard: PathGuard;
  sessionSource: PolicySessionContextSource;
  auditSink?: (event: AuditEventV1) => void | Promise<void>;
  persistentAudit?: Required<Pick<PolicyRuntime, "persistAuthorization" | "persistExecution">>;
  grants?: SessionGrantStore;
  resourceResolver?: ToolResourceResolver;
}

export function createDefaultPolicyRuntime(input: CreateDefaultPolicyRuntimeInput): PolicyRuntime & {
  policyRevision: string;
  permissionProfileId: string;
  grants: SessionGrantStore;
} {
  const capabilities = baselineNodeCapabilityReport(process.platform);
  const compiled = compiledProfile(input.config);
  const policyRevision = policyRevisionForSources(
    compiled.sourceHashes,
    HARD_POLICY_REVISION,
    capabilities.evidenceRevision
  );
  const grants = input.grants ?? new SessionGrantStore();

  return {
    mode: input.config.policyEngineMode ?? "legacy",
    diagnostics() {
      return {
        policyRevision,
        permissionProfileId: compiled.profile.id,
        hardPolicyRevision: HARD_POLICY_REVISION,
        grantRevision: grants.revision(),
        enforcement: {
          active: (input.config.policyEngineMode ?? "legacy") !== "legacy",
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
        }
      };
    },
    policyRevision,
    permissionProfileId: compiled.profile.id,
    grants,
    async authorize(toolName, args): Promise<PolicyAuthorizationResult> {
      const started = Date.now();
      const described = describeResource(
        toolName,
        args,
        input.config,
        input.workspaces,
        input.guard,
        input.resourceResolver
      );
      const now = new Date().toISOString();
      const workspaceId = described.resource.workspaceId ?? null;
      const context = createRequestContext(input.sessionSource, {
        requestId: `request_${randomUUID().replaceAll("-", "")}`,
        workspaceId,
        runtimeProfileId: "runtime-default",
        permissionProfileId: compiled.profile.id,
        policyRevision,
        sessionGrantRevision: grants.revision(),
        receivedAt: now
      });

      const digest = inputDigest(args);
      const decision = toolPolicyDefinition(toolName).resourceMode === "context_only"
        ? contextDecision({
            contextPolicyRevision: policyRevision,
            resource: described.resource,
            requiredScope: described.requiredScope,
            scopes: context.identity.scopes,
            riskClass: described.riskClass
          })
        : evaluatePolicy({
            context,
            activePolicyRevision: policyRevision,
            profile: compiled.profile,
            resource: described.resource,
            riskClass: described.riskClass,
            grants: grants.snapshot(),
            requiredCapabilities: described.requiredCapabilities,
            capabilities,
            deploymentDisabled: false,
            now,
            platform: process.platform,
            toolContractVersion: String(input.config.toolContractVersion),
            inputDigest: digest
          });

      const grantId = decision.provenance.find((item) => item.grantId)?.grantId ?? null;
      const approvalState: AuditEventV1["approvalState"] = decision.outcome === "approval_required"
        ? "required"
        : grantId
          ? "granted"
          : decision.outcome === "allow"
            ? "not_required"
            : "denied";
      const auditEvent = createAuditEvent({
        eventId: `event_${randomUUID().replaceAll("-", "")}`,
        timestamp: new Date().toISOString(),
        context,
        decision,
        resource: described.resource,
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
      const auditContext = requirement === "disabled" || !input.persistentAudit
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
              riskClass: described.riskClass
            }),
            requirement,
            riskClass: described.riskClass,
            mutating
          };
      return { decision, auditEvent, auditContext };
    },
    async audit(event): Promise<void> {
      await input.auditSink?.(event);
    },
    async persistAuthorization(context): Promise<void> {
      if (!input.persistentAudit) throw new Error("Persistent audit runtime is unavailable.");
      await input.persistentAudit.persistAuthorization(context);
    },
    async persistExecution(context, execution): Promise<void> {
      if (!input.persistentAudit) throw new Error("Persistent audit runtime is unavailable.");
      await input.persistentAudit.persistExecution(context, execution);
    }
  };
}

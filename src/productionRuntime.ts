import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertAuditConfiguration,
  assertFileTransactionConfiguration,
  assertToolContractConfiguration,
  type CodexGPTConfig
} from "./config.js";
import { PathGuard } from "./guard.js";
import { LocalApprovalRuntimeV3 } from "./control/runtime.js";
import type { RootAdmissionRuntimeV3 } from "./access/rootAdmission.js";
import { WindowsProcessHostRuntime } from "./process/windowsHostClient.js";
import { RunCommandRuntimeV3 } from "./process/runCommand.js";
import { ProcessManagerV3 } from "./process/processManager.js";
import { ProcessAuditCoordinatorV3 } from "./process/processAuditCoordinator.js";
import { WindowsPersistentProcessBackendV3 } from "./process/windowsPersistentBackend.js";
import { compilePermissionProfileV3, loadPermissionProfileGraphV3 } from "./policy/profileStore.js";
import { inspectPolicyConfiguration } from "./policy/runtime.js";
import { semanticDigest } from "./policy/authorizationFacts.js";
import {
  PersistentAuditRuntimeV2,
  PersistentAuditStore,
  createAuditQueryHandler,
  createAuditQueryHandlerV3
} from "./audit/index.js";
import { ChangeSetStore } from "./changesets/store.js";
import { MoveChangeSetStore } from "./changesets/moveStore.js";
import { UndoChangeSetService } from "./changesets/undo.js";
import { MoveUndoChangeSetService } from "./changesets/moveUndo.js";
import { UnifiedUndoChangeSetService } from "./changesets/unifiedUndo.js";
import { MovePathsService } from "./moves/service.js";
import { WorkspaceMutationRuntime } from "./mutations/runtime.js";
import {
  ServerMutationLifecycle,
  installServerMutationLifecycle
} from "./mutations/lifecycle.js";
import { upgradeCodexGPTSupertool } from "./codexgptSupertool.js";
import type { PolicySessionContextSource } from "./policy/identity.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  WorkspaceMutationLock,
  createDefaultTransactionRecoveryCoordinator,
  createDurableParticipantRecoveryAdapter,
  deriveTransactionSubkey,
  installationMasterKey,
  loadOrCreateInstallationState,
  resolveTransactionStateRoot,
  type TransactionStateRootOptions
} from "./transactions/index.js";
import {
  createCodexGPTServer,
  type CodexGPTServerDependencies
} from "./server.js";
import { contractIncludesV3, contractIncludesV4 } from "./tools/contracts/index.js";
import {
  assertGitCapabilityEvidence,
  type GitCapabilityEvidence
} from "./git/capabilities.js";
import type { GitReadServiceV4 } from "./git/readService.js";
import type { GitGateRRuntimeV4 } from "./git/recovery.js";
import type { ProductionGitBootstrapV4 } from "./git/productionBootstrap.js";
import { RepositoryIdentityRegistry } from "./git/repositoryIdentity.js";
import { GitStateTokenService } from "./git/stateToken.js";
import { GitReadServiceV4 as ConcreteGitReadServiceV4 } from "./git/readService.js";
import { GitMutationContextV4 } from "./git/mutationContext.js";
import { GitIndexServiceV4, GitIndexTokenServiceV4 } from "./git/indexService.js";
import { GitBranchServiceV4 } from "./git/branchService.js";
import { GitCommitServiceV4 } from "./git/commitService.js";
import { GitReviewTokenServiceV4 } from "./git/reviewToken.js";
import { GitIntegrationGateV4 } from "./git/integrations.js";
import { GitRestoreServiceV4 } from "./git/restoreService.js";
import { GitRepositoryAdmissionV4 } from "./git/admission.js";
import { GitStashServiceV4 } from "./git/stashService.js";
import { GitFileTransactionV4 } from "./git/fileTransaction.js";
import { GitMutationServiceV4 } from "./git/mutationService.js";
import { GitMutationJournalV4 } from "./git/mutationJournal.js";
import { GitOperationStore } from "./git/operationStore.js";
import { GitRepositoryStore } from "./git/repositoryStore.js";
import { GitLockManager } from "./git/locks.js";
import { GitGateRRuntimeV4 as ConcreteGitGateRRuntimeV4, GitRecoveryCoordinator } from "./git/recovery.js";
import { createRecoveryAuditEventV4 } from "./audit/lifecycleV4.js";
import { TaskWorktreeStoreV1 } from "./worktrees/store.js";
import { TaskWorktreeManagerV4 } from "./worktrees/manager.js";
import { TaskWorktreeWorkspaceAuthorityV4 } from "./worktrees/workspaceAuthority.js";
import { TaskWorktreeServiceV4 } from "./worktrees/service.js";
import { MergePlanStoreV4 } from "./worktrees/mergePlanStore.js";
import { TaskWorktreeMergePrepareV4 } from "./worktrees/mergePrepare.js";
import { TaskWorktreeMergeExecuteV4 } from "./worktrees/mergeExecute.js";
import { TaskWorktreeRemoveV4 } from "./worktrees/remove.js";
import { TaskWorktreeRecoveryV4 } from "./worktrees/recovery.js";
import { VerificationReceiptServiceV4 } from "./worktrees/verificationReceipts.js";
import { CandidateVerificationWorkspaceV4 } from "./worktrees/candidateWorkspace.js";

const ATOMIC_MUTATION_TOOL_NAMES = new Set([
  "apply_patch",
  "codexgpt_self_test",
  "edit",
  "export_pro_context",
  "handoff_to_agent",
  "handoff_to_codex",
  "write"
]);

export interface ProductionRuntimeObservation {
  atomic: boolean;
  durableAudit: boolean;
  stateRoot: string | null;
  registryInstanceId: string | null;
  mutationRuntime: WorkspaceMutationRuntime | null;
  auditRuntime: PersistentAuditRuntimeV2 | null;
  localApprovalServerId: string | null;
  processHostConfigured: boolean;
  gitGateRReady: boolean;
}

export interface ProductionCodexGPTServerOptions {
  policySessionContextSource?: PolicySessionContextSource;
  stateRootOptions?: TransactionStateRootOptions;
  observeRuntime?: (value: ProductionRuntimeObservation) => void;
  localApprovalRuntimeV3?: LocalApprovalRuntimeV3;
  rootAdmissionRuntimeV3?: RootAdmissionRuntimeV3;
  gitReadServiceV4?: Pick<GitReadServiceV4, "status" | "diff" | "log" | "branches" | "currentBranchName" | "capabilityRevision">;
  gitMutationServiceV4?: NonNullable<CodexGPTServerDependencies["gitMutationServiceV4"]>;
  gitCapabilityEvidenceV4?: GitCapabilityEvidence;
  gitGateRRuntimeV4?: Pick<GitGateRRuntimeV4, "isReady">;
  taskWorktreeServiceV4?: NonNullable<CodexGPTServerDependencies["taskWorktreeServiceV4"]>;
  taskWorktreeAuthorityV4?: NonNullable<CodexGPTServerDependencies["taskWorktreeAuthorityV4"]>;
  gitBootstrapV4?: ProductionGitBootstrapV4;
}

interface RuntimeResources {
  dependencies: CodexGPTServerDependencies;
  observation: ProductionRuntimeObservation;
  lifecycle: ServerMutationLifecycle;
  startup(): Promise<void>;
  dispose(): Promise<void>;
}

function noRuntime(
  policySessionContextSource: PolicySessionContextSource | undefined,
  lifecycle: ServerMutationLifecycle
): RuntimeResources {
  return {
    dependencies: { policySessionContextSource },
    observation: {
      atomic: false,
      durableAudit: false,
      stateRoot: null,
      registryInstanceId: null,
      mutationRuntime: null,
      auditRuntime: null,
      localApprovalServerId: null,
      processHostConfigured: false,
      gitGateRReady: false
    },
    lifecycle,
    async startup() {},
    async dispose() {
      lifecycle.quiesce();
      await lifecycle.drain();
      if (lifecycle.state() !== "disposed") lifecycle.markDisposed();
    }
  };
}

function requireAuditReady(store: PersistentAuditStore): void {
  const diagnostics = store.diagnostics();
  if (diagnostics.state === "integrity_failed") {
    throw new Error("Persistent audit integrity verification failed during production startup.");
  }
}

function composeRuntime(
  config: CodexGPTConfig,
  options: ProductionCodexGPTServerOptions
): RuntimeResources {
  const lifecycle = new ServerMutationLifecycle();
  let localApprovalRuntimeV3 = options.localApprovalRuntimeV3;
  const automaticLocalApproval = contractIncludesV4(config.toolContractVersion) && Boolean(options.gitBootstrapV4);
  const atomic = config.fileTransactions === "atomic";
  const writableAtomic = atomic && config.writeMode !== "off";
  const durableAudit = config.auditMode !== "off" && (
    config.policyEngineMode !== "legacy" || atomic
  );
  if (localApprovalRuntimeV3 && (
    !contractIncludesV3(config.toolContractVersion) ||
    config.policyEngineMode !== "enforce" ||
    !durableAudit
  )) {
    throw new Error("V3 local approval requires contract 3 or 4, Policy Kernel enforce, and durable audit.");
  }
  if (options.rootAdmissionRuntimeV3 && (
    !contractIncludesV3(config.toolContractVersion) ||
    config.localFileAccess !== "confirmed_roots" ||
    !localApprovalRuntimeV3
  )) {
    throw new Error("Confirmed-root admission requires contract 3 or 4, confirmed_roots mode, and the local approval runtime.");
  }
  const automaticGitConfigured = Boolean(options.gitBootstrapV4);
  const gitReadConfigured = Boolean(options.gitReadServiceV4) || automaticGitConfigured;
  const gitEvidenceConfigured = Boolean(options.gitCapabilityEvidenceV4) || automaticGitConfigured;
  if (options.gitBootstrapV4 && (
    options.gitReadServiceV4 ||
    options.gitMutationServiceV4 ||
    options.gitCapabilityEvidenceV4 ||
    options.gitGateRRuntimeV4 ||
    options.taskWorktreeServiceV4 ||
    options.taskWorktreeAuthorityV4
  )) {
    throw new Error("Automatic Contract V4 Git composition cannot be mixed with injected Git services.");
  }
  if (options.gitBootstrapV4) {
    try {
      const evidence = assertGitCapabilityEvidence(options.gitBootstrapV4.executor.capability);
      if (evidence.capabilityRevision !== options.gitBootstrapV4.executor.capabilityRevision) {
        throw new Error("GIT_CAPABILITY_UNAVAILABLE");
      }
    } catch {
      throw new Error("Automatic Contract V4 Git bootstrap did not provide valid capability evidence.");
    }
  }
  if (config.gitIntegrations === "approved_full_access" && (
    !automaticGitConfigured ||
    config.executionProfile !== "full_access" ||
    !options.gitBootstrapV4?.executor.runApprovedIntegration
  )) {
    throw new Error("Approved repository integrations require the automatic Git bootstrap and full_access host.");
  }
  if (gitReadConfigured !== gitEvidenceConfigured) {
    throw new Error("Contract V4 Git reads require both the typed read service and verified capability evidence.");
  }
  if (options.gitCapabilityEvidenceV4) {
    try {
      const evidence = assertGitCapabilityEvidence(options.gitCapabilityEvidenceV4);
      if (options.gitReadServiceV4?.capabilityRevision !== evidence.capabilityRevision) {
        throw new Error("GIT_CAPABILITY_UNAVAILABLE");
      }
    } catch {
      throw new Error("Contract V4 Git capability evidence is invalid or does not match the typed read service.");
    }
  }
  if (options.gitMutationServiceV4 && !options.gitGateRRuntimeV4?.isReady()) {
    throw new Error("Contract V4 Git mutations require a ready Gate R recovery runtime.");
  }
  if (
    options.gitMutationServiceV4 &&
    (options.gitMutationServiceV4 as typeof options.gitMutationServiceV4 & { gateRBound?: boolean }).gateRBound !== true
  ) {
    throw new Error("Contract V4 Git mutations must execute through the Gate R journal.");
  }
  if (config.gitMode === "local" && !automaticGitConfigured && (!options.gitMutationServiceV4 || !options.gitGateRRuntimeV4?.isReady())) {
    throw new Error("Local Contract V4 Git mode requires Gate I handlers and a ready Gate R recovery runtime.");
  }
  if (config.gitMode !== "local" && (options.gitMutationServiceV4 || (automaticGitConfigured && options.gitBootstrapV4?.managedRoot))) {
    throw new Error("Contract V4 Git mutation handlers require gitMode=local.");
  }
  if (Boolean(options.taskWorktreeServiceV4) !== Boolean(options.taskWorktreeAuthorityV4)) {
    throw new Error("Contract V4 task worktrees require both the owner-bound service and workspace authority.");
  }
  if (
    options.taskWorktreeServiceV4 &&
    (!contractIncludesV4(config.toolContractVersion) || config.gitMode !== "local" || !options.gitGateRRuntimeV4?.isReady())
  ) {
    throw new Error("Contract V4 task worktrees require local Git mode and a ready Gate R runtime.");
  }

  if (options.gitGateRRuntimeV4) {
    if (!contractIncludesV4(config.toolContractVersion) || !durableAudit || !options.gitGateRRuntimeV4.isReady()) {
      throw new Error("Gate R requires contract 4, durable audit, and completed startup recovery before production wiring.");
    }
  }

  assertFileTransactionConfiguration(config, {
    workspaceMutatorsAtomic: atomic
  });
  assertAuditConfiguration(config, {
    durableStoreAvailable: durableAudit
  });
  assertToolContractConfiguration(config, {
    durableAuditAvailable: durableAudit,
    stateRootAvailable: atomic || durableAudit,
    movePathsAvailable: atomic,
    stableSessionAvailable: Boolean(options.policySessionContextSource),
    atomicStateReadersAvailable: atomic && durableAudit,
    contractV3MigrationAvailable: true,
    nativeHostIdentityAvailable: gitEvidenceConfigured,
    localApprovalAvailable: Boolean(localApprovalRuntimeV3) || automaticLocalApproval,
    gitCapabilityAvailable: gitReadConfigured && gitEvidenceConfigured,
    contractV4MigrationAvailable: true
  });

  if (!atomic && !durableAudit) {
    return noRuntime(options.policySessionContextSource, lifecycle);
  }
  if (writableAtomic && config.auditMode === "off") {
    throw new Error("Writable atomic transactions require persistent audit; CODEXGPT_AUDIT_MODE cannot be off.");
  }
  if ((config.policyEngineMode !== "legacy" || writableAtomic) && !options.policySessionContextSource) {
    throw new Error("Production Policy and atomic audit wiring require a stable session context source.");
  }

  const stateRoot = resolveTransactionStateRoot(options.stateRootOptions);
  const installation = loadOrCreateInstallationState({ stateRoot });
  const masterKey = installationMasterKey(installation);
  let ownerBindingKey: Buffer | null = null;
  let registry: ProcessInstanceRegistry | null = null;
  let recovery: ReturnType<typeof createDefaultTransactionRecoveryCoordinator> | null = null;
  let changeSetStore: ChangeSetStore | null = null;
  let moveChangeSetStore: MoveChangeSetStore | null = null;
  let auditStore: PersistentAuditStore | null = null;
  let auditRuntime: PersistentAuditRuntimeV2 | null = null;
  let mutationRuntime: WorkspaceMutationRuntime | null = null;
  let windowsProcessHostRuntime: WindowsProcessHostRuntime | null = null;
  let runCommandRuntime: RunCommandRuntimeV3 | null = null;
  let processManager: ProcessManagerV3 | null = null;
  let executionContextFingerprint: (() => string) | null = null;
  let executionInspection: ReturnType<typeof inspectPolicyConfiguration> | null = null;
  let automaticGitStartup: Promise<void> = Promise.resolve();
  let automaticGitRegistry: RepositoryIdentityRegistry | null = null;
  let automaticGitStateTokens: GitStateTokenService | null = null;
  let automaticGitIndexTokens: GitIndexTokenServiceV4 | null = null;
  let automaticGitReviews: GitReviewTokenServiceV4 | null = null;
  let automaticGitPlans: MergePlanStoreV4 | null = null;
  let automaticGitRepositoryStore: GitRepositoryStore | null = null;
  let automaticGitOperationStore: GitOperationStore | null = null;
  let automaticGitGateR: ConcreteGitGateRRuntimeV4 | null = null;
  let automaticGitStash: GitStashServiceV4 | null = null;
  let automaticVerificationReceipts: VerificationReceiptServiceV4 | null = null;
  let automaticCandidateWorkspaces: CandidateVerificationWorkspaceV4 | null = null;
  let atomicEngine: AtomicTransactionEngine | null = null;

  try {
    registry = new ProcessInstanceRegistry(stateRoot);
    recovery = createDefaultTransactionRecoveryCoordinator(config, {
      stateRoot,
      registry
    });

    const guard = new PathGuard(config);
    if (atomic) {
      atomicEngine = new AtomicTransactionEngine(
        config,
        guard,
        stateRoot,
        registry,
        { recoveryCoordinator: recovery }
      );
    }
    const dependencies: CodexGPTServerDependencies = {
      policySessionContextSource: options.policySessionContextSource,
      transactionRecoveryCoordinator: recovery,
      localApprovalRuntimeV3,
      rootAdmissionRuntimeV3: options.rootAdmissionRuntimeV3,
      gitReadServiceV4: options.gitReadServiceV4,
      gitMutationServiceV4: options.gitMutationServiceV4,
      taskWorktreeServiceV4: options.taskWorktreeServiceV4,
      taskWorktreeAuthorityV4: options.taskWorktreeAuthorityV4,
      ...(contractIncludesV4(config.toolContractVersion) ? {
        v4ContractCapabilities: {
          nativeHostIdentityAvailable: gitEvidenceConfigured,
          localApprovalAvailable: Boolean(localApprovalRuntimeV3) || automaticLocalApproval,
          gitCapabilityAvailable: gitReadConfigured && gitEvidenceConfigured,
          contractV4MigrationAvailable: true
        }
      } : {})
    };
    if (config.executionProfile === "full_access") {
      if (!config.permissionProfileId || !options.policySessionContextSource) {
        throw new Error("Full-access execution requires an explicit Permission Profile V3 and stable session context.");
      }
      windowsProcessHostRuntime = new WindowsProcessHostRuntime();
      dependencies.windowsProcessHostRuntimeV3 = windowsProcessHostRuntime;
      const fullAccessProfile = compilePermissionProfileV3(loadPermissionProfileGraphV3(config.permissionProfileId)).fullAccess;
      const inspection = inspectPolicyConfiguration(config);
      executionInspection = inspection;
      const contextFingerprint = () => semanticDigest({
        serverId: localApprovalRuntimeV3?.serverId ?? "local-server-unavailable",
        contractVersion: 3,
        policyRevision: inspection.policyRevision,
        evidenceRevision: inspection.evidenceRevision,
        transportKind: options.policySessionContextSource!.transportKind,
        transportSessionId: options.policySessionContextSource!.transportSessionId(),
        identity: options.policySessionContextSource!.identity
      });
      executionContextFingerprint = contextFingerprint;
      runCommandRuntime = new RunCommandRuntimeV3({
        config,
        fullAccessProfile,
        hostRuntime: windowsProcessHostRuntime,
        contextFingerprint,
        policyRevision: () => inspection.policyRevision,
        evidenceRevision: () => inspection.evidenceRevision
      });
      dependencies.toolResourceResolver = runCommandRuntime;
      const result = (structured: Record<string, unknown>) => ({
        content: [{ type: "text" as const, text: structured.ok === true ? "Command completed." : "Command failed." }],
        structuredContent: structured,
        ...(structured.ok === false ? { isError: true } : {})
      });
      dependencies.v3ToolHandlers = {
        run_command: async (args) => result(await runCommandRuntime!.runCommand(args)),
        read_process_output: async (args) => result(runCommandRuntime!.readProcessOutput(args))
      };
    }
    if (options.rootAdmissionRuntimeV3) {
      localApprovalRuntimeV3!.setApprovalPreparation(
        (record) => options.rootAdmissionRuntimeV3!.prepareApproval(record),
        (record) => options.rootAdmissionRuntimeV3!.approvalDisplay(record)
      );
    }

    if (durableAudit) {
      auditStore = PersistentAuditStore.open({
        stateRoot,
        registry,
        retention: config.auditRetention
      });
      requireAuditReady(auditStore);
      if (automaticLocalApproval && !localApprovalRuntimeV3) {
        localApprovalRuntimeV3 = LocalApprovalRuntimeV3.create({
          auditStore,
          stateBaseRoot: stateRoot,
          startNativeControl: false
        });
        dependencies.localApprovalRuntimeV3 = localApprovalRuntimeV3;
        automaticGitStartup = localApprovalRuntimeV3.activateNativeControl(stateRoot);
      }
      auditRuntime = new PersistentAuditRuntimeV2(auditStore);
      dependencies.persistentAuditRuntime = auditRuntime;
      dependencies.auditQueryHandler = createAuditQueryHandler(auditStore);
      dependencies.auditQueryHandlerV3 = createAuditQueryHandlerV3(auditStore);
      if (runCommandRuntime && windowsProcessHostRuntime && executionContextFingerprint && executionInspection) {
        const digest = (value: unknown) => semanticDigest(value).replace(/^sha256:/, "");
        processManager = new ProcessManagerV3({
          contextFingerprint: executionContextFingerprint,
          startResourceResolver: runCommandRuntime,
          executionRuntime: runCommandRuntime,
          backend: new WindowsPersistentProcessBackendV3({
            hostRuntime: windowsProcessHostRuntime,
            executionRuntime: runCommandRuntime
          }),
          audit: new ProcessAuditCoordinatorV3({
            sink: async (event) => {
              await auditStore!.append(event);
              return { eventId: event.eventId, timestamp: event.timestamp };
            },
            context: () => ({
              credentialRef: options.policySessionContextSource!.identity.credentialRef,
              transportSessionId: options.policySessionContextSource!.transportSessionId(),
              policyRevision: executionInspection!.policyRevision,
              subjectFingerprint: digest(options.policySessionContextSource!.identity),
              contextFingerprint: digest({
                serverId: localApprovalRuntimeV3?.serverId ?? "local-server-unavailable",
                contractVersion: 3,
                policyRevision: executionInspection!.policyRevision,
                evidenceRevision: executionInspection!.evidenceRevision,
                transportKind: options.policySessionContextSource!.transportKind,
                transportSessionId: options.policySessionContextSource!.transportSessionId(),
                identity: options.policySessionContextSource!.identity
              })
            })
          })
        });
        const manager = processManager;
        dependencies.toolResourceResolver = {
          describe(toolName, args) {
            if (toolName === "run_command") return runCommandRuntime!.describe(toolName, args);
            if (toolName === "start_process") return manager.describe(toolName, args);
            if (toolName === "read_process_output" && !manager.owns(String(args.process_id ?? ""))) return runCommandRuntime!.describe(toolName, args);
            return manager.describe(toolName, args);
          }
        };
        const result = (structured: Record<string, unknown>) => ({
          content: [{ type: "text" as const, text: structured.ok === true ? "Process action completed." : "Process action failed." }],
          structuredContent: structured,
          ...(structured.ok === false ? { isError: true } : {})
        });
        dependencies.v3ToolHandlers = {
          ...dependencies.v3ToolHandlers,
          start_process: async (args) => result(await manager.start(args)),
          read_process_output: async (args) => {
            const processId = String(args.process_id ?? "");
            if (manager.owns(processId)) return result(manager.read(processId, typeof args.cursor === "string" ? args.cursor : undefined, typeof args.max_bytes === "number" ? args.max_bytes : undefined));
            return result(runCommandRuntime!.readProcessOutput(args));
          },
          write_process_input: async (args) => result(await manager.writeResult(args)),
          interrupt_process: async (args) => result(await manager.interruptResult(args)),
          terminate_process: async (args) => result(await manager.terminateResult(args)),
          resize_process_terminal: async (args) => result(await manager.resizeResult(args)),
          list_processes: async () => result(manager.list())
        };
        localApprovalRuntimeV3?.setProcessControl(manager.localControl());
      }
    }

    if (options.gitBootstrapV4) {
      if (!auditStore || !options.policySessionContextSource) {
        throw new Error("Automatic Contract V4 Git composition requires durable audit and stable session identity.");
      }
      const bootstrap = options.gitBootstrapV4;
      const contextFingerprint = semanticDigest({
        serverId: localApprovalRuntimeV3?.serverId ?? "local-server-unavailable",
        contractVersion: 4,
        transportKind: options.policySessionContextSource.transportKind,
        transportSessionId: options.policySessionContextSource.transportSessionId(),
        identity: options.policySessionContextSource.identity
      }).replace(/^sha256:/u, "");
      const ownerFingerprint = semanticDigest({
        ownerBindingVersion: 1,
        credentialRef: options.policySessionContextSource.identity.credentialRef
      }).replace(/^sha256:/u, "");
      automaticGitRegistry = new RepositoryIdentityRegistry({ contextFingerprint });
      automaticGitStateTokens = new GitStateTokenService({
        key: deriveTransactionSubkey(masterKey, "git-v4-state-token"),
        ttlMs: 5 * 60_000
      });
      if (config.gitMode === "local") {
        automaticGitReviews = new GitReviewTokenServiceV4({
          key: deriveTransactionSubkey(masterKey, "git-v4-review-token"),
          stateRoot,
          masterKey
        });
      }
      const integrationGate = automaticGitReviews
        ? new GitIntegrationGateV4({
            executor: bootstrap.executor,
            reviews: automaticGitReviews,
            enabled: config.gitIntegrations === "approved_full_access"
          })
        : undefined;
      const gitAdmission = new GitRepositoryAdmissionV4({
        executor: bootstrap.executor,
        registry: automaticGitRegistry
      });
      const readService = new ConcreteGitReadServiceV4({
        executor: bootstrap.executor,
        registry: automaticGitRegistry,
        stateTokens: automaticGitStateTokens,
        contextFingerprint,
        integrationGate,
        admission: gitAdmission
      });
      dependencies.gitReadServiceV4 = readService;
      dependencies.v4ContractCapabilities = {
        nativeHostIdentityAvailable: true,
        localApprovalAvailable: Boolean(localApprovalRuntimeV3) || automaticLocalApproval,
        gitCapabilityAvailable: true,
        contractV4MigrationAvailable: true
      };

      if (config.gitMode === "local") {
        if (!bootstrap.managedRoot) throw new Error("Local Contract V4 Git mode requires an admitted managed task root.");
        automaticGitRepositoryStore = new GitRepositoryStore({ stateRoot, masterKey });
        automaticGitOperationStore = new GitOperationStore({ stateRoot, masterKey });
        const gitLocks = new GitLockManager({ stateRoot, registry });
        const mergeLifecycleLock = new WorkspaceMutationLock(stateRoot, registry);
        const gitRecovery = new GitRecoveryCoordinator({
          operationStore: automaticGitOperationStore,
          repositoryStore: automaticGitRepositoryStore,
          locks: gitLocks,
          async probeParticipant(operation, participant) {
            if (participant === "audit") {
              return await auditStore!.findTerminalEventV4(operation.operationId)
                ? "present"
                : "absent";
            }
            // Unknown effects are never guessed away. The repository remains frozen
            // until an exact participant-specific recovery adapter proves state.
            return "unknown";
          },
          resolveTerminalAuditEventId(operation) {
            return auditStore!.findTerminalEventV4(operation.operationId);
          },
          async recordRecovery({ operation, outcome, resultCode }) {
            await auditStore!.append(createRecoveryAuditEventV4({
              timestamp: new Date().toISOString(),
              requestId: operation.requestId,
              authorizationEventId: operation.authorizationEventId,
              decisionId: null,
              toolName: operation.toolName,
              canonicalAction: operation.canonicalAction,
              workspaceId: null,
              policyRevision: operation.policyRevision,
              subjectFingerprint: operation.subjectFingerprint,
              contextFingerprint: operation.contextFingerprint,
              resultCode,
              counts: operation.counts,
              repositoryId: operation.repositoryId,
              taskWorktreeId: null,
              operationId: operation.operationId,
              recoveryAction: outcome === "committed"
                ? "committed"
                : outcome === "rolled_back"
                  ? "rolled_back"
                  : "repository_frozen"
            }));
          }
        });
        const gateR = new ConcreteGitGateRRuntimeV4({
          recovery: gitRecovery,
          operationStore: automaticGitOperationStore,
          repositoryStore: automaticGitRepositoryStore,
          locks: gitLocks,
          appendAuthorization: (event) => auditStore!.append(event),
          appendTerminal: (event) => auditStore!.append(event)
        });
        automaticGitGateR = gateR;
        const mutationContext = new GitMutationContextV4({
          executor: bootstrap.executor,
          registry: automaticGitRegistry,
          stateTokens: automaticGitStateTokens,
          readService,
          contextFingerprint,
          admission: gitAdmission
        });
        automaticGitIndexTokens = new GitIndexTokenServiceV4({
          key: deriveTransactionSubkey(masterKey, "git-v4-index-token"),
          ttlMs: 5 * 60_000
        });
        if (!automaticGitReviews) throw new Error("Local Contract V4 Git mode requires review tokens.");
        const branch = new GitBranchServiceV4(mutationContext);
        const index = new GitIndexServiceV4(mutationContext, automaticGitIndexTokens, {
          integrationGate
        });
        const commit = new GitCommitServiceV4(mutationContext, automaticGitIndexTokens, {
          integrationGate
        });
        if (!atomicEngine) throw new Error("Contract V4 Git mutations require atomic file transactions.");
        const gitFileTransactions = new GitFileTransactionV4(atomicEngine);
        const restore = new GitRestoreServiceV4(mutationContext, automaticGitReviews, gitFileTransactions);
        const stash = new GitStashServiceV4(
          mutationContext,
          automaticGitReviews,
          gitFileTransactions,
          Date.now,
          {
            stateRoot,
            masterKey,
            ownerFingerprint: () => ownerFingerprint
          }
        );
        automaticGitStash = stash;
        const journal = new GitMutationJournalV4(
          gateR,
          GitMutationJournalV4.configurationRevision({
            contractVersion: 4,
            gitMode: config.gitMode,
            integrations: config.gitIntegrations,
            capabilityRevision: bootstrap.executor.capabilityRevision
          })
        );
        const mutationService = new GitMutationServiceV4({
          branch,
          index,
          commit,
          restore,
          stash,
          journal,
          integrationGate
        });
        const taskStore = new TaskWorktreeStoreV1({ stateRoot, masterKey });
        const manager = new TaskWorktreeManagerV4({
          context: mutationContext,
          journal,
          reviews: automaticGitReviews,
          root: bootstrap.managedRoot,
          store: taskStore,
          maxTasks: config.taskWorktreeMaxCount,
          maxFiles: config.taskWorktreeMaxFiles,
          maxBytes: config.taskWorktreeMaxBytes
        });
        const owner = () => ownerFingerprint;
        const authority = new TaskWorktreeWorkspaceAuthorityV4({
          manager,
          ownerFingerprint: owner
        });
        gitAdmission.setManagedTaskResolver((workspace) => authority.admitGitWorkspace(workspace));
        automaticGitPlans = new MergePlanStoreV4({
          stateRoot,
          masterKey,
          lifecycleLock: mergeLifecycleLock
        });
        automaticVerificationReceipts = new VerificationReceiptServiceV4(
          deriveTransactionSubkey(masterKey, "git-v4-verification-receipt"),
          Date.now,
          { stateRoot, masterKey }
        );
        automaticCandidateWorkspaces = new CandidateVerificationWorkspaceV4({
          manager,
          guard,
          ownerFingerprint: owner,
          contextFingerprint: () => contextFingerprint,
          verificationReceipts: automaticVerificationReceipts,
          stateRoot,
          masterKey
        });
        runCommandRuntime?.setCandidateVerificationWorkspace(automaticCandidateWorkspaces);
        const mergePrepare = new TaskWorktreeMergePrepareV4({
          manager,
          plans: automaticGitPlans,
          reviews: automaticGitReviews,
          ownerFingerprint: owner,
          integrationGate,
          candidateWorkspaces: automaticCandidateWorkspaces
        });
        const mergeExecute = new TaskWorktreeMergeExecuteV4({
          manager,
          plans: automaticGitPlans,
          ownerFingerprint: owner,
          verificationReceipts: automaticVerificationReceipts,
          fileTransactions: gitFileTransactions,
          integrationGate,
          candidateWorkspaces: automaticCandidateWorkspaces
        });
        const remove = new TaskWorktreeRemoveV4({
          manager,
          authority,
          reviews: automaticGitReviews,
          ownerFingerprint: owner,
          hasActiveProcesses: processManager
            ? (root) => processManager!.hasActiveProcessInRoot(root)
            : undefined,
          drainActiveProcesses: processManager
            ? (root) => processManager!.drainActiveProcessesInRoot(root)
            : undefined
        });
        const taskService = new TaskWorktreeServiceV4({
          manager,
          authority,
          ownerFingerprint: owner,
          mergePrepare,
          mergeExecute,
          remove,
          integrationGate
        });
        dependencies.gitMutationServiceV4 = mutationService;
        dependencies.taskWorktreeServiceV4 = taskService;
        dependencies.taskWorktreeAuthorityV4 = authority;
        const mergeRecovery = new TaskWorktreeRecoveryV4({
          manager,
          plans: automaticGitPlans,
          candidateWorkspaces: automaticCandidateWorkspaces,
          verificationReceipts: automaticVerificationReceipts,
          ownerFingerprint: owner,
          async recordRecovery(plan, outcome) {
            const operationDigest = semanticDigest({
              kind: "task_worktree_merge_recovery",
              mergePlanId: plan.mergePlanId
            }).replace(/^sha256:/u, "");
            await auditStore!.append(createRecoveryAuditEventV4({
              timestamp: new Date().toISOString(),
              requestId: null,
              authorizationEventId: null,
              decisionId: null,
              toolName: "merge_task_worktree",
              canonicalAction: "task_merge_recovery",
              workspaceId: null,
              policyRevision: plan.policyRevision,
              subjectFingerprint: plan.ownerFingerprint,
              contextFingerprint: plan.contextFingerprint,
              resultCode: outcome === "cleanup_completed"
                ? "MERGE_CLEANUP_COMPLETED"
                : outcome === "rolled_back"
                  ? "MERGE_ROLLED_BACK"
                  : "GIT_RECOVERY_REQUIRED",
              counts: {
                affectedPathCount: plan.affectedPathCount,
                affectedByteCount: plan.affectedByteCount
              },
              repositoryId: plan.repositoryId,
              taskWorktreeId: plan.taskWorktreeId,
              operationId: `gop_${operationDigest.slice(0, 32)}`,
              recoveryAction: outcome === "cleanup_completed"
                ? "committed"
                : outcome === "rolled_back"
                  ? "rolled_back"
                  : "repository_frozen"
            }));
          }
        });
        automaticGitStartup = automaticGitStartup.then(() => gateR.startupRecovery()).then(async () => {
          if (!gateR.isReady()) throw new Error("GIT_RECOVERY_REQUIRED");
          const recovered = await mergeRecovery.recover();
          if (recovered.some((result) => result.outcome === "recovery_required")) {
            throw new Error("GIT_RECOVERY_REQUIRED");
          }
        });
      }
    }

    if (atomic) {
      const engine = atomicEngine!;
      changeSetStore = new ChangeSetStore({
        stateRoot,
        masterKey,
        retention: config.changeSetRetention
      });
      moveChangeSetStore = new MoveChangeSetStore({
        stateRoot,
        masterKey,
        activeRetentionMs: config.changeSetRetention.activeRetentionMs
      });
      dependencies.movePathsService = new MovePathsService({
        engine,
        changeSetStore: moveChangeSetStore,
        retentionMs: config.changeSetRetention.activeRetentionMs
      });
      if (auditStore) {
        recovery.setParticipantAdapter(createDurableParticipantRecoveryAdapter({
          auditStore,
          changeSetStore,
          moveChangeSetStore
        }));
      }
      mutationRuntime = new WorkspaceMutationRuntime({
        engine,
        changeSetStore
      });
      ownerBindingKey = deriveTransactionSubkey(masterKey, "change-set-owner");
      dependencies.workspaceMutationRuntime = mutationRuntime;
      dependencies.atomicMutationToolNames = ATOMIC_MUTATION_TOOL_NAMES;
      dependencies.changeSetOwnerBindingKey = ownerBindingKey;
      const v1Undo = new UndoChangeSetService({
        engine,
        changeSetStore,
        guard,
        retentionMs: config.changeSetRetention.activeRetentionMs
      });
      const v2Undo = new MoveUndoChangeSetService({
        engine,
        moveChangeSetStore,
        guard,
        retentionMs: config.changeSetRetention.activeRetentionMs
      });
      dependencies.undoChangeSetService = new UnifiedUndoChangeSetService({
        engine,
        changeSetStore,
        v1: v1Undo,
        v2: v2Undo
      });
    }

    const observation: ProductionRuntimeObservation = {
      atomic,
      durableAudit,
      stateRoot,
      registryInstanceId: registry.record.instanceId,
      mutationRuntime,
      auditRuntime,
      localApprovalServerId: localApprovalRuntimeV3?.serverId ?? null,
      processHostConfigured: windowsProcessHostRuntime !== null,
      gitGateRReady: options.gitGateRRuntimeV4?.isReady() ?? automaticGitGateR?.isReady() ?? false
    };
    let disposePromise: Promise<void> | null = null;
    const disposeResources = async () => {
      let failure: unknown;
      try {
        await processManager?.close();
        await options.rootAdmissionRuntimeV3?.close();
        await localApprovalRuntimeV3?.close();
        runCommandRuntime?.close();
        await Promise.all([
          windowsProcessHostRuntime?.close()
        ]);
        await options.gitBootstrapV4?.dispose();
      } catch (error) {
        failure = error;
      } finally {
        automaticGitPlans?.dispose();
        automaticCandidateWorkspaces?.dispose();
        automaticVerificationReceipts?.dispose();
        automaticGitStash?.dispose();
        automaticGitReviews?.dispose();
        automaticGitIndexTokens?.dispose();
        automaticGitStateTokens?.dispose();
        automaticGitRegistry?.dispose();
        automaticGitOperationStore?.dispose();
        automaticGitRepositoryStore?.dispose();
        auditStore?.dispose();
        changeSetStore?.dispose();
        moveChangeSetStore?.dispose();
        ownerBindingKey?.fill(0);
        recovery?.dispose();
        registry?.dispose();
        if (lifecycle.state() !== "disposed") lifecycle.markDisposed();
      }
      if (failure) throw failure;
    };
    return {
      dependencies,
      observation,
      lifecycle,
      async startup() {
        await automaticGitStartup;
        await automaticCandidateWorkspaces?.cleanupExpiredReviewedCandidates();
      },
      dispose() {
        if (disposePromise) return disposePromise;
        lifecycle.quiesce();
        if (lifecycle.isDrained()) {
          disposePromise = disposeResources();
          return disposePromise;
        }
        disposePromise = lifecycle.drain().then(disposeResources);
        return disposePromise;
      }
    };
  } catch (error) {
    auditStore?.dispose();
    changeSetStore?.dispose();
    moveChangeSetStore?.dispose();
    ownerBindingKey?.fill(0);
    recovery?.dispose();
    registry?.dispose();
    void processManager?.close();
    void options.rootAdmissionRuntimeV3?.close();
    void localApprovalRuntimeV3?.close();
    runCommandRuntime?.close();
    void windowsProcessHostRuntime?.close();
    void options.gitBootstrapV4?.dispose();
    automaticGitPlans?.dispose();
    automaticCandidateWorkspaces?.dispose();
    automaticVerificationReceipts?.dispose();
    automaticGitStash?.dispose();
    automaticGitReviews?.dispose();
    automaticGitIndexTokens?.dispose();
    automaticGitStateTokens?.dispose();
    automaticGitRegistry?.dispose();
    automaticGitOperationStore?.dispose();
    automaticGitRepositoryStore?.dispose();
    throw error;
  } finally {
    masterKey.fill(0);
  }
}

const productionDisposers = new WeakMap<McpServer, () => Promise<void>>();
const productionRuntimes = new WeakMap<McpServer, RuntimeResources>();

function installRuntimeDisposal(server: McpServer, runtime: RuntimeResources): void {
  const originalClose = server.close.bind(server);
  let closePromise: Promise<void> | null = null;
  const disposeOnce = () => {
    if (closePromise) return closePromise;
    runtime.lifecycle.quiesce();
    productionDisposers.delete(server);
    productionRuntimes.delete(server);
    closePromise = runtime.dispose();
    return closePromise;
  };
  productionDisposers.set(server, disposeOnce);
  productionRuntimes.set(server, runtime);
  server.close = async () => {
    runtime.lifecycle.quiesce();
    try {
      await originalClose();
    } finally {
      await disposeOnce();
    }
  };
}

export async function disposeProductionCodexGPTServer(server: McpServer): Promise<void> {
  await productionDisposers.get(server)?.();
}

export async function connectProductionCodexGPTServer(
  server: McpServer,
  transport: Parameters<McpServer["connect"]>[0]
): Promise<void> {
  try {
    await productionRuntimes.get(server)?.startup();
    await server.connect(transport);
  } catch (error) {
    await disposeProductionCodexGPTServer(server);
    throw error;
  }
}

export function createProductionCodexGPTServer(
  config: CodexGPTConfig,
  options: ProductionCodexGPTServerOptions = {}
): McpServer {
  const runtime = composeRuntime(config, options);
  try {
    options.observeRuntime?.(runtime.observation);
    const server = createCodexGPTServer(config, runtime.dependencies);
    upgradeCodexGPTSupertool(server, config.toolContractVersion);
    installServerMutationLifecycle(server, runtime.lifecycle);
    installRuntimeDisposal(server, runtime);
    return server;
  } catch (error) {
    void runtime.dispose();
    throw error;
  }
}

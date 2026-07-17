import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertAuditConfiguration,
  assertFileTransactionConfiguration,
  assertToolContractConfiguration,
  type CodexProConfig
} from "./config.js";
import { PathGuard } from "./guard.js";
import type { LocalApprovalRuntimeV3 } from "./control/runtime.js";
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
import { upgradeCodexProSupertool } from "./codexproSupertool.js";
import type { PolicySessionContextSource } from "./policy/identity.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  createDefaultTransactionRecoveryCoordinator,
  createDurableParticipantRecoveryAdapter,
  deriveTransactionSubkey,
  installationMasterKey,
  loadOrCreateInstallationState,
  resolveTransactionStateRoot,
  type TransactionStateRootOptions
} from "./transactions/index.js";
import {
  createCodexProServer,
  type CodexProServerDependencies
} from "./server.js";

const ATOMIC_MUTATION_TOOL_NAMES = new Set([
  "apply_patch",
  "codexpro_self_test",
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
}

export interface ProductionCodexProServerOptions {
  policySessionContextSource?: PolicySessionContextSource;
  stateRootOptions?: TransactionStateRootOptions;
  observeRuntime?: (value: ProductionRuntimeObservation) => void;
  localApprovalRuntimeV3?: LocalApprovalRuntimeV3;
  rootAdmissionRuntimeV3?: RootAdmissionRuntimeV3;
}

interface RuntimeResources {
  dependencies: CodexProServerDependencies;
  observation: ProductionRuntimeObservation;
  lifecycle: ServerMutationLifecycle;
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
      processHostConfigured: false
    },
    lifecycle,
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
  config: CodexProConfig,
  options: ProductionCodexProServerOptions
): RuntimeResources {
  const lifecycle = new ServerMutationLifecycle();
  const atomic = config.fileTransactions === "atomic";
  const writableAtomic = atomic && config.writeMode !== "off";
  const durableAudit = config.auditMode !== "off" && (
    config.policyEngineMode !== "legacy" || atomic
  );
  if (options.localApprovalRuntimeV3 && (
    Number(config.toolContractVersion) !== 3 ||
    config.policyEngineMode !== "enforce" ||
    !durableAudit
  )) {
    throw new Error("V3 local approval requires contract 3, Policy Kernel enforce, and durable audit.");
  }
  if (options.rootAdmissionRuntimeV3 && (
    Number(config.toolContractVersion) !== 3 ||
    config.localFileAccess !== "confirmed_roots" ||
    !options.localApprovalRuntimeV3
  )) {
    throw new Error("Confirmed-root admission requires contract 3, confirmed_roots mode, and the local approval runtime.");
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
    contractV3MigrationAvailable: true
  });

  if (!atomic && !durableAudit) {
    return noRuntime(options.policySessionContextSource, lifecycle);
  }
  if (writableAtomic && config.auditMode === "off") {
    throw new Error("Writable atomic transactions require persistent audit; CODEXPRO_AUDIT_MODE cannot be off.");
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

  try {
    registry = new ProcessInstanceRegistry(stateRoot);
    recovery = createDefaultTransactionRecoveryCoordinator(config, {
      stateRoot,
      registry
    });

    const guard = new PathGuard(config);
    const dependencies: CodexProServerDependencies = {
      policySessionContextSource: options.policySessionContextSource,
      transactionRecoveryCoordinator: recovery,
      localApprovalRuntimeV3: options.localApprovalRuntimeV3,
      rootAdmissionRuntimeV3: options.rootAdmissionRuntimeV3
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
        serverId: options.localApprovalRuntimeV3?.serverId ?? "local-server-unavailable",
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
      options.localApprovalRuntimeV3!.setApprovalPreparation(
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
      auditRuntime = new PersistentAuditRuntimeV2(auditStore);
      dependencies.persistentAuditRuntime = auditRuntime;
      dependencies.auditQueryHandler = createAuditQueryHandler(auditStore);
      dependencies.auditQueryHandlerV3 = createAuditQueryHandlerV3(auditStore);
      if (runCommandRuntime && windowsProcessHostRuntime && executionContextFingerprint && executionInspection) {
        const digest = (value: unknown) => semanticDigest(value).replace(/^sha256:/, "");
        processManager = new ProcessManagerV3({
          contextFingerprint: executionContextFingerprint,
          startResourceResolver: runCommandRuntime,
          backend: new WindowsPersistentProcessBackendV3({
            hostRuntime: windowsProcessHostRuntime,
            executionRuntime: runCommandRuntime
          }),
          audit: new ProcessAuditCoordinatorV3({
            sink: (event) => auditStore!.append(event).then(() => {}),
            context: () => ({
              credentialRef: options.policySessionContextSource!.identity.credentialRef,
              transportSessionId: options.policySessionContextSource!.transportSessionId(),
              policyRevision: executionInspection!.policyRevision,
              subjectFingerprint: digest(options.policySessionContextSource!.identity),
              contextFingerprint: digest({
                serverId: options.localApprovalRuntimeV3?.serverId ?? "local-server-unavailable",
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
        options.localApprovalRuntimeV3?.setProcessControl(manager.localControl());
      }
    }

    if (atomic) {
      const engine = new AtomicTransactionEngine(
        config,
        guard,
        stateRoot,
        registry,
        { recoveryCoordinator: recovery }
      );
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
      localApprovalServerId: options.localApprovalRuntimeV3?.serverId ?? null,
      processHostConfigured: windowsProcessHostRuntime !== null
    };
    let disposePromise: Promise<void> | null = null;
    const disposeResources = async () => {
      let failure: unknown;
      try {
        await processManager?.close();
        await options.rootAdmissionRuntimeV3?.close();
        await options.localApprovalRuntimeV3?.close();
        runCommandRuntime?.close();
        await windowsProcessHostRuntime?.close();
      } catch (error) {
        failure = error;
      } finally {
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
    void options.localApprovalRuntimeV3?.close();
    runCommandRuntime?.close();
    void windowsProcessHostRuntime?.close();
    throw error;
  } finally {
    masterKey.fill(0);
  }
}

const productionDisposers = new WeakMap<McpServer, () => Promise<void>>();

function installRuntimeDisposal(server: McpServer, runtime: RuntimeResources): void {
  const originalClose = server.close.bind(server);
  let closePromise: Promise<void> | null = null;
  const disposeOnce = () => {
    if (closePromise) return closePromise;
    runtime.lifecycle.quiesce();
    productionDisposers.delete(server);
    closePromise = runtime.dispose();
    return closePromise;
  };
  productionDisposers.set(server, disposeOnce);
  server.close = async () => {
    runtime.lifecycle.quiesce();
    try {
      await originalClose();
    } finally {
      await disposeOnce();
    }
  };
}

export async function disposeProductionCodexProServer(server: McpServer): Promise<void> {
  await productionDisposers.get(server)?.();
}

export async function connectProductionCodexProServer(
  server: McpServer,
  transport: Parameters<McpServer["connect"]>[0]
): Promise<void> {
  try {
    await server.connect(transport);
  } catch (error) {
    await disposeProductionCodexProServer(server);
    throw error;
  }
}

export function createProductionCodexProServer(
  config: CodexProConfig,
  options: ProductionCodexProServerOptions = {}
): McpServer {
  const runtime = composeRuntime(config, options);
  try {
    options.observeRuntime?.(runtime.observation);
    const server = createCodexProServer(config, runtime.dependencies);
    upgradeCodexProSupertool(server, config.toolContractVersion);
    installServerMutationLifecycle(server, runtime.lifecycle);
    installRuntimeDisposal(server, runtime);
    return server;
  } catch (error) {
    void runtime.dispose();
    throw error;
  }
}

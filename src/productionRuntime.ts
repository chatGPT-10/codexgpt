import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertAuditConfiguration,
  assertFileTransactionConfiguration,
  assertToolContractConfiguration,
  type CodexProConfig
} from "./config.js";
import { PathGuard } from "./guard.js";
import {
  PersistentAuditRuntimeV2,
  PersistentAuditStore,
  createAuditQueryHandler
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
}

export interface ProductionCodexProServerOptions {
  policySessionContextSource?: PolicySessionContextSource;
  stateRootOptions?: TransactionStateRootOptions;
  observeRuntime?: (value: ProductionRuntimeObservation) => void;
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
      auditRuntime: null
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

  assertFileTransactionConfiguration(config, {
    workspaceMutatorsAtomic: atomic
  });
  assertAuditConfiguration(config, {
    durableStoreAvailable: durableAudit
  });
  assertToolContractConfiguration(config, {
    durableAuditAvailable: durableAudit,
    stateRootAvailable: atomic || durableAudit,
    movePathsAvailable: atomic
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

  try {
    registry = new ProcessInstanceRegistry(stateRoot);
    recovery = createDefaultTransactionRecoveryCoordinator(config, {
      stateRoot,
      registry
    });

    const guard = new PathGuard(config);
    const dependencies: CodexProServerDependencies = {
      policySessionContextSource: options.policySessionContextSource,
      transactionRecoveryCoordinator: recovery
    };

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
      auditRuntime
    };
    let disposePromise: Promise<void> | null = null;
    const disposeResources = () => {
      auditStore?.dispose();
      changeSetStore?.dispose();
      moveChangeSetStore?.dispose();
      ownerBindingKey?.fill(0);
      recovery?.dispose();
      registry?.dispose();
      if (lifecycle.state() !== "disposed") lifecycle.markDisposed();
    };
    return {
      dependencies,
      observation,
      lifecycle,
      dispose() {
        if (disposePromise) return disposePromise;
        lifecycle.quiesce();
        if (lifecycle.isDrained()) {
          disposeResources();
          disposePromise = Promise.resolve();
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

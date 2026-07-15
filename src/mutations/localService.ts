import { createHash, randomBytes } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import { PersistentAuditStore, workspaceAuditRef } from "../audit/index.js";
import {
  authorizationAuditEventV2Schema,
  executionAuditEventV2Schema
} from "../audit/schemas.js";
import { ChangeSetStore } from "../changesets/index.js";
import type { PreparedWorkspaceTextBatch } from "../fsOps.js";
import type { PathGuard, Workspace } from "../guard.js";
import {
  AtomicTransactionEngine,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry,
  resolveTransactionStateRoot,
  TransactionError,
  type TransactionFaultInjector
} from "../transactions/index.js";
import { attachPreparedBatchMutation } from "./writers.js";
import { pendingWorkspaceMutation, WorkspaceMutationRuntime } from "./runtime.js";

export interface LocalMutationServiceOptions {
  stateRoot?: string;
  now?: () => number;
  faultInjector?: TransactionFaultInjector;
  persistAudit?: () => void | Promise<void>;
}

export interface ExecuteLocalBatchOptions {
  toolName: string;
  retainChangeSet?: boolean;
  requestId?: string | null;
}

function eventId(): string {
  return `event_${randomBytes(16).toString("hex")}`;
}

function ownerBinding(workspace: Workspace): string {
  return `owner_${createHash("sha256").update(`local-cli\0${workspace.root}`, "utf8").digest("hex")}`;
}

export class LocalMutationService {
  private readonly registry: ProcessInstanceRegistry;
  private readonly recovery: ReturnType<typeof createDefaultTransactionRecoveryCoordinator>;
  private readonly changeSetStore: ChangeSetStore;
  private readonly auditStore: PersistentAuditStore;
  private readonly runtime: WorkspaceMutationRuntime;
  private readonly now: () => number;
  private readonly workspaceRefKey: Buffer;

  constructor(
    private readonly config: CodexProConfig,
    guard: PathGuard,
    private readonly options: LocalMutationServiceOptions = {}
  ) {
    if (config.auditMode === "off") {
      throw new TransactionError(
        "ATOMIC_BACKEND_UNAVAILABLE",
        "Local atomic mutations require persistent audit."
      );
    }
    this.now = options.now ?? Date.now;
    const stateRoot = options.stateRoot ?? resolveTransactionStateRoot();
    this.registry = new ProcessInstanceRegistry(stateRoot, { now: this.now });
    this.recovery = createDefaultTransactionRecoveryCoordinator(config, {
      stateRoot,
      now: this.now
    });
    const engine = new AtomicTransactionEngine(config, guard, stateRoot, this.registry, {
      now: this.now,
      faultInjector: options.faultInjector,
      recoveryCoordinator: this.recovery
    });
    const installation = loadOrCreateInstallationState({ stateRoot, now: this.now });
    const masterKey = installationMasterKey(installation);
    this.workspaceRefKey = Buffer.from(masterKey);
    this.changeSetStore = new ChangeSetStore({
      stateRoot,
      masterKey,
      retention: config.changeSetRetention,
      now: this.now
    });
    masterKey.fill(0);
    this.auditStore = PersistentAuditStore.open({
      stateRoot,
      registry: this.registry,
      retention: config.auditRetention,
      now: this.now
    });
    this.runtime = new WorkspaceMutationRuntime({
      engine,
      changeSetStore: this.changeSetStore,
      now: this.now
    });
  }

  async executeBatch<T extends object>(
    workspace: Workspace,
    prepared: PreparedWorkspaceTextBatch,
    result: T,
    options: ExecuteLocalBatchOptions
  ): Promise<T> {
    const attached = await this.runtime.invokeProvider({
      requiresMutation: true,
      provider: () => attachPreparedBatchMutation({
        runtime: this.runtime,
        workspace,
        prepared,
        context: {
          toolName: options.toolName,
          requestId: options.requestId ?? null,
          ownerBinding: ownerBinding(workspace),
          policyRevision: "policy_local_cli_v1",
          contractVersion: this.config.toolContractVersion,
          retentionMs: this.config.changeSetRetention.activeRetentionMs,
          retainChangeSet: options.retainChangeSet
        },
        result
      })
    });
    const pending = pendingWorkspaceMutation(attached);
    if (!pending) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Local mutation handle is missing.");
    }
    const startedAt = this.now();
    const authorizationEventId = eventId();
    const workspaceRef = workspaceAuditRef(workspace.root, this.workspaceRefKey);
    const resourceFingerprint = createHash("sha256")
      .update(prepared.operations.map((operation) => operation.path).sort().join("\0"), "utf8")
      .digest("hex");
    return pending.commit({
      result: attached,
      persistAudit: async () => {
        if (this.options.persistAudit) {
          await this.options.persistAudit();
          return;
        }
        const timestamp = new Date(this.now()).toISOString();
        await this.auditStore.append(authorizationAuditEventV2Schema.parse({
          schemaVersion: 2,
          eventId: authorizationEventId,
          eventType: "authorization",
          timestamp,
          requestId: options.requestId ?? null,
          authorizationEventId: null,
          decisionId: "decision_local_cli",
          credentialRef: null,
          transportSessionId: "local-cli",
          toolName: options.toolName,
          canonicalAction: "filesystem.write.batch",
          workspaceId: workspace.id,
          workspaceRef,
          policyRevision: "policy_local_cli_v1",
          resourceSummary: "Explicit local CLI workspace mutation",
          resourceFingerprint,
          outcome: "allow",
          reasonCode: null,
          safeRuleIds: ["local-cli-explicit"],
          approvalState: "not_required",
          grantId: null,
          sandboxBackend: "native-local-cli",
          riskClass: "R2"
        }));
        await this.auditStore.append(executionAuditEventV2Schema.parse({
          schemaVersion: 2,
          eventId: eventId(),
          eventType: "execution",
          timestamp: new Date(this.now()).toISOString(),
          requestId: options.requestId ?? null,
          authorizationEventId,
          decisionId: "decision_local_cli",
          credentialRef: null,
          transportSessionId: "local-cli",
          toolName: options.toolName,
          canonicalAction: "filesystem.write.batch",
          workspaceId: workspace.id,
          workspaceRef,
          policyRevision: "policy_local_cli_v1",
          status: "succeeded",
          resultCode: null,
          durationMs: Math.max(0, this.now() - startedAt),
          exitCode: null,
          boundedByteCounts: { after_bytes: prepared.totalAfterBytes },
          changeSetId: pending.changeSetId,
          operationCount: pending.operationCount,
          mutationKinds: [...pending.mutationKinds],
          recoveryRequired: false
        }));
      }
    });
  }

  dispose(): void {
    this.workspaceRefKey.fill(0);
    this.auditStore.dispose();
    this.changeSetStore.dispose();
    this.recovery.dispose();
    this.registry.dispose();
  }
}

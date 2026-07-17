import type { Workspace } from "../guard.js";
import { AuditError } from "../audit/types.js";
import {
  ChangeSetError,
  type MoveChangeSetManifestDraftV2,
  type MoveChangeSetManifestV2,
  type MoveChangeSetStore
} from "../changesets/index.js";
import {
  attachPendingWorkspaceMutation
} from "../mutations/runtime.js";
import type {
  MutationCommitInput,
  MutationToolResult,
  PendingWorkspaceMutation
} from "../mutations/types.js";
import {
  TransactionError,
  type AtomicTransactionEngine
} from "../transactions/index.js";
import {
  createMovePathsFailure,
  createMovePathsSuccess,
  type MovePathsData,
  type MovePathsErrorCode,
  type MovePathsStructuredResult
} from "../tools/schemas/movePaths.js";
import type {
  InspectedMovePath,
  MoveCommittedTransaction,
  MovePathRequest,
  PendingMoveTransactionCommit,
  PreparedMoveTransaction
} from "./types.js";
import { MovePathsError } from "./types.js";

export interface MovePathsServiceOptions {
  engine: Pick<AtomicTransactionEngine, "previewMove" | "prepareMove" | "workspaceStateKey">;
  changeSetStore: Pick<MoveChangeSetStore, "create" | "transition">;
  now?: () => number;
  retentionMs?: number;
}

export interface PrepareMovePathsInput {
  workspace: Workspace;
  moves: readonly MovePathRequest[];
  createParents: boolean;
  preview: boolean;
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 2 | 3;
}

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (value === "Invalid Date") throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move clock is invalid.");
  return value;
}

function toolResult(structuredContent: MovePathsStructuredResult, isError = false): MutationToolResult {
  const message = structuredContent.ok
    ? structuredContent.data?.preview
      ? `Move preview validated ${structuredContent.data.total_files} file(s).`
      : `Moved ${structuredContent.data?.total_files ?? 0} file(s) atomically.`
    : structuredContent.error?.message ?? "The move could not be completed.";
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: message }],
    structuredContent: structuredContent as unknown as Record<string, unknown>
  };
}

function mapErrorCode(error: unknown): MovePathsErrorCode {
  if (error instanceof MovePathsError) return error.code;
  if (error instanceof AuditError) {
    return error.code === "AUDIT_INTEGRITY_FAILURE" ? "AUDIT_INTEGRITY_FAILURE" : "AUDIT_UNAVAILABLE";
  }
  if (error instanceof ChangeSetError) {
    if (error.code === "CHANGE_SET_INTEGRITY_FAILURE") return "TRANSACTION_RECOVERY_REQUIRED";
    if (error.code === "CHANGE_SET_UNAVAILABLE") return "TRANSACTION_FAILED";
    return "TRANSACTION_FAILED";
  }
  if (error instanceof TransactionError) {
    const direct = new Set<MovePathsErrorCode>([
      "TRANSACTION_BUSY",
      "ATOMIC_BACKEND_UNAVAILABLE",
      "FILE_VERSION_CONFLICT",
      "TRANSACTION_FAILED",
      "ROLLBACK_FAILED",
      "TRANSACTION_RECOVERY_REQUIRED"
    ]);
    if (direct.has(error.code as MovePathsErrorCode)) return error.code as MovePathsErrorCode;
    return error.code === "TRANSACTION_PRECONDITION_FAILED" ? "FILE_VERSION_CONFLICT" : "TRANSACTION_FAILED";
  }
  return "INTERNAL_ERROR";
}

function safeFailure(error: unknown, workspaceId: string, moveCount: number): MutationToolResult {
  const code = mapErrorCode(error);
  return toolResult(createMovePathsFailure(code, { workspace_id: workspaceId, move_count: moveCount }), true);
}

function moveData(
  workspace: Workspace,
  operations: readonly InspectedMovePath[],
  createdDirectories: readonly string[],
  transaction: MoveCommittedTransaction | null,
  preview: boolean
): MovePathsData {
  const callerOrder = [...operations].sort((left, right) => left.callerIndex - right.callerIndex);
  return {
    workspace_id: workspace.id,
    root: workspace.root,
    preview,
    moves: callerOrder.map((operation) => ({
      source: operation.sourceRelativePath,
      destination: operation.destinationRelativePath,
      sha256: operation.version.sha256,
      bytes: operation.version.bytes
    })),
    created_directories: [...createdDirectories],
    total_files: callerOrder.length,
    total_bytes: callerOrder.reduce((sum, operation) => sum + operation.version.bytes, 0),
    transaction: transaction === null ? null : {
      change_set_id: transaction.changeSetId,
      transaction_id: transaction.transactionId,
      before_state: "present",
      operation_count: transaction.operationCount,
      undo_supported: true,
      committed_at: transaction.committedAt
    }
  };
}

class PendingMoveWorkspaceMutation implements PendingWorkspaceMutation {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds = ["move"] as const;
  readonly revertsChangeSetId: string | null;
  private state: "prepared" | "committing" | "finalized" | "rolled_back" = "prepared";
  private pendingCommit: PendingMoveTransactionCommit | null = null;
  private createdChangeSet: MoveChangeSetManifestV2 | null = null;

  constructor(
    private readonly prepared: PreparedMoveTransaction,
    private readonly workspace: Workspace,
    private readonly draft: MoveChangeSetManifestDraftV2,
    private readonly store: MovePathsServiceOptions["changeSetStore"],
    private readonly now: () => number,
    revertsChangeSetId: string | null = null
  ) {
    this.transactionId = prepared.transactionId;
    this.changeSetId = prepared.changeSetId;
    this.operationCount = prepared.operations.length;
    this.revertsChangeSetId = revertsChangeSetId;
  }

  private async proveRollback(reason: string): Promise<void> {
    try {
      await (this.pendingCommit ?? this.prepared).rollback(reason);
      this.state = "rolled_back";
    } catch {
      this.state = "rolled_back";
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback could not be proven complete.");
    }
  }

  async commit<T extends object>(input: MutationCommitInput<T>): Promise<T> {
    if (this.state !== "prepared") {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Pending move is already finalized.");
    }
    this.state = "committing";
    let phase: "install" | "change_set" | "audit" | "finalize" = "install";
    try {
      this.pendingCommit = await this.prepared.commit();
      phase = "change_set";
      await this.pendingCommit.commitParticipant("change_set", async () => {
        const createdDirectoryFacts = this.prepared.createdDirectoryFacts();
        this.createdChangeSet = this.store.create({
          ...this.draft,
          createdDirectories: createdDirectoryFacts.map((fact) => fact.relativePath),
          createdDirectoryIdentities: Object.fromEntries(
            createdDirectoryFacts.map((fact) => [fact.relativePath, fact.objectIdentity])
          )
        });
      });
      phase = "audit";
      await this.pendingCommit.commitParticipant("audit", async () => input.persistAudit());
      phase = "finalize";
      const committed = await this.pendingCommit.finalize();
      if (!this.createdChangeSet) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Committed move is missing its authenticated change set.");
      }
      this.state = "finalized";
      const final = toolResult(createMovePathsSuccess(moveData(
        this.workspace,
        this.prepared.operations,
        this.prepared.createdDirectories,
        committed,
        false
      ))) as T;
      return attachPendingWorkspaceMutation(final, this);
    } catch (error) {
      if (this.state === "finalized") throw error;
      if (phase === "finalize") {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Move participants are durable but final commit acknowledgement requires recovery."
        );
      }
      if (this.createdChangeSet) {
        try {
          this.store.transition(
            this.createdChangeSet.workspaceStateKey,
            this.createdChangeSet.changeSetId,
            {
              expectedGeneration: this.createdChangeSet.generation,
              state: "recovery_required",
              updatedAt: timestamp(this.now)
            }
          );
        } catch {
          try {
            await this.proveRollback("change_set_reconciliation_failed");
          } catch {
            // The recovery-required result remains authoritative.
          }
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "Move change-set publication could not be reconciled with rollback."
          );
        }
      }
      await this.proveRollback(`${phase}_failed`);
      if (phase === "audit") {
        throw new AuditError("AUDIT_UNAVAILABLE", "Audit completion failed and the move was rolled back.");
      }
      if (error instanceof TransactionError || error instanceof ChangeSetError) throw error;
      throw new TransactionError("TRANSACTION_FAILED", "Move commit failed.");
    }
  }

  projectFailure<T extends object>(error: unknown, _result: T): T | null {
    return safeFailure(error, this.workspace.id, this.operationCount) as T;
  }

  async rollback(reason: string): Promise<void> {
    if (this.state === "finalized") {
      throw new TransactionError("ROLLBACK_FAILED", "A finalized move cannot be rolled back.");
    }
    if (this.state === "rolled_back") return;
    await this.proveRollback(reason);
  }
}

export class MovePathsService {
  private readonly engine: MovePathsServiceOptions["engine"];
  private readonly store: MovePathsServiceOptions["changeSetStore"];
  private readonly now: () => number;
  private readonly retentionMs: number;

  constructor(options: MovePathsServiceOptions) {
    this.engine = options.engine;
    this.store = options.changeSetStore;
    this.now = options.now ?? Date.now;
    this.retentionMs = options.retentionMs ?? 24 * 60 * 60_000;
    if (!Number.isSafeInteger(this.retentionMs) || this.retentionMs <= 0) {
      throw new Error("Move change-set retention is invalid.");
    }
  }

  async prepare(input: PrepareMovePathsInput): Promise<MutationToolResult> {
    if (input.preview) {
      try {
        const batch = await this.engine.previewMove(input.workspace, input.moves, input.createParents);
        try {
          return toolResult(createMovePathsSuccess(moveData(
            input.workspace,
            batch.operations,
            batch.createdDirectories,
            null,
            true
          )));
        } finally {
          await batch.close();
        }
      } catch (error) {
        return safeFailure(error, input.workspace.id, input.moves.length);
      }
    }

    let prepared: PreparedMoveTransaction;
    try {
      prepared = await this.engine.prepareMove({
        workspace: input.workspace,
        moves: input.moves,
        createParents: input.createParents,
        requiredParticipants: ["audit", "change_set"]
      });
    } catch (error) {
      return safeFailure(error, input.workspace.id, input.moves.length);
    }
    const createdAtMs = this.now();
    const createdAt = timestamp(this.now);
    const draft: MoveChangeSetManifestDraftV2 = {
      schemaVersion: 2,
      changeSetId: prepared.changeSetId,
      transactionId: prepared.transactionId,
      workspaceStateKey: this.engine.workspaceStateKey(input.workspace.root),
      generation: 1,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAtMs + this.retentionMs).toISOString(),
      toolName: "move_paths",
      requestId: input.requestId,
      ownerBinding: input.ownerBinding,
      policyRevision: input.policyRevision,
      contractVersion: input.contractVersion,
      state: "active",
      undoSupported: true,
      undoReason: null,
      operations: [...prepared.operations]
        .sort((left, right) => left.callerIndex - right.callerIndex)
        .map((operation) => ({
          operationId: operation.operationId,
          kind: "move" as const,
          sourceRelativePath: operation.sourceRelativePath,
          destinationRelativePath: operation.destinationRelativePath,
          sourceComparisonKey: operation.sourceComparisonKey,
          destinationComparisonKey: operation.destinationComparisonKey,
          objectIdentity: operation.objectIdentity,
          sha256: operation.version.sha256,
          bytes: operation.version.bytes
        })),
      createdDirectories: [],
      createdDirectoryIdentities: {},
      plaintextBytes: 0,
      ciphertextBytes: 0,
      revertsChangeSetId: null
    };
    const pending = new PendingMoveWorkspaceMutation(
      prepared,
      input.workspace,
      draft,
      this.store,
      this.now
    );
    const providerResult: MutationToolResult = {
      content: [{ type: "text", text: `Prepared atomic move of ${prepared.operations.length} file(s).` }],
      structuredContent: {
        codexpro_tool: "move_paths",
        codexpro_title: "Move Paths",
        ok: true,
        data: {
          workspace_id: input.workspace.id,
          root: input.workspace.root,
          preview: false,
          moves: [...prepared.operations]
            .sort((left, right) => left.callerIndex - right.callerIndex)
            .map((operation) => ({
              source: operation.sourceRelativePath,
              destination: operation.destinationRelativePath,
              sha256: operation.version.sha256,
              bytes: operation.version.bytes
            })),
          created_directories: [...prepared.createdDirectories],
          total_files: prepared.operations.length,
          total_bytes: prepared.totalBytes,
          transaction: null
        },
        error: null,
        meta: { duration_ms: 0 }
      }
    };
    return attachPendingWorkspaceMutation(providerResult, pending);
  }
}

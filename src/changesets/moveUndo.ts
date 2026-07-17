import type { PathGuard, Workspace } from "../guard.js";
import type { MutationCommitInput, PendingWorkspaceMutation } from "../mutations/types.js";
import { AuditError } from "../audit/types.js";
import {
  TransactionError,
  type AtomicTransactionEngine
} from "../transactions/index.js";
import type {
  InspectedMoveBatch,
  InspectedMovePath,
  MovePathRequest,
  PendingMoveTransactionCommit,
  PreparedMoveTransaction
} from "../moves/types.js";
import { describeFilesystemBatchResource } from "../policy/resources.js";
import type { FilesystemBatchResourceV1 } from "../policy/types.js";
import type {
  MoveChangeSetManifestDraftV2,
  MoveChangeSetManifestV2
} from "./types.js";
import { ChangeSetError } from "./types.js";
import type { MoveChangeSetStore } from "./moveStore.js";
import {
  UndoChangeSetError,
  type PreparedUndoChangeSet,
  type UndoOperationSummary
} from "./undo.js";

export interface MoveUndoChangeSetServiceOptions {
  engine: Pick<AtomicTransactionEngine, "previewMove" | "prepareMove" | "workspaceStateKey">;
  moveChangeSetStore: Pick<MoveChangeSetStore, "probe" | "read" | "create" | "transition">;
  guard: PathGuard;
  now?: () => number;
  retentionMs?: number;
}

export interface PrepareMoveUndoChangeSetInput<T extends object = Record<string, unknown>> {
  workspace: Workspace;
  changeSetId: string;
  ownerBinding: string;
  policyRevision: string;
  requestId: string | null;
  preview: boolean;
  contractVersion: 2 | 3;
  projectFailure?: (input: { error: unknown; result: T }) => T | null;
}

const DEFAULT_RETENTION_MS = 24 * 60 * 60_000;

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (value === "Invalid Date") {
    throw new UndoChangeSetError("INTERNAL_ERROR", "Move undo clock is invalid.");
  }
  return value;
}

function conflict(): UndoChangeSetError {
  return new UndoChangeSetError(
    "UNDO_CONFLICT",
    "The move change set no longer matches the complete current state."
  );
}

function sameIdentity(
  left: { device: string; fileId: string },
  right: { device: string; fileId: string }
): boolean {
  return left.device === right.device && left.fileId === right.fileId;
}

function mapError(error: unknown): UndoChangeSetError {
  if (error instanceof UndoChangeSetError) return error;
  if (error instanceof AuditError) {
    return new UndoChangeSetError(
      error.code === "AUDIT_INTEGRITY_FAILURE"
        ? "AUDIT_INTEGRITY_FAILURE"
        : "AUDIT_UNAVAILABLE",
      "Required audit completion failed."
    );
  }
  if (error instanceof ChangeSetError) {
    if (error.code === "CHANGE_SET_NOT_FOUND") {
      return new UndoChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    if (error.code === "CHANGE_SET_INTEGRITY_FAILURE") {
      return new UndoChangeSetError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Move change-set integrity requires recovery."
      );
    }
    return new UndoChangeSetError("TRANSACTION_FAILED", "Move undo state could not be persisted.");
  }
  if (error instanceof TransactionError) {
    const direct = new Set([
      "TRANSACTION_BUSY",
      "ATOMIC_BACKEND_UNAVAILABLE",
      "TRANSACTION_FAILED",
      "ROLLBACK_FAILED",
      "TRANSACTION_RECOVERY_REQUIRED"
    ]);
    if (direct.has(error.code)) {
      return new UndoChangeSetError(
        error.code as
          | "TRANSACTION_BUSY"
          | "ATOMIC_BACKEND_UNAVAILABLE"
          | "TRANSACTION_FAILED"
          | "ROLLBACK_FAILED"
          | "TRANSACTION_RECOVERY_REQUIRED",
        "The reverse move transaction could not be completed."
      );
    }
    if (
      error.code === "FILE_VERSION_CONFLICT" ||
      error.code === "TRANSACTION_PRECONDITION_FAILED"
    ) return conflict();
  }
  return new UndoChangeSetError("INTERNAL_ERROR", "Move undo could not be completed.");
}

function reverseMoves(manifest: MoveChangeSetManifestV2): MovePathRequest[] {
  return manifest.operations.map((operation) => ({
    source: operation.destinationRelativePath,
    destination: operation.sourceRelativePath,
    expectedSha256: operation.sha256
  }));
}

function summaries(manifest: MoveChangeSetManifestV2): UndoOperationSummary[] {
  return manifest.operations.map((operation) => ({
    kind: "move" as const,
    source: operation.destinationRelativePath,
    destination: operation.sourceRelativePath
  }));
}

function orderedOperations(operations: readonly InspectedMovePath[]): InspectedMovePath[] {
  return [...operations].sort((left, right) => left.callerIndex - right.callerIndex);
}

function verifyReverseFacts(
  manifest: MoveChangeSetManifestV2,
  operations: readonly InspectedMovePath[]
): void {
  const ordered = [...operations].sort((left, right) => left.callerIndex - right.callerIndex);
  if (ordered.length !== manifest.operations.length) throw conflict();
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const original = manifest.operations[index];
    if (
      current.sourceRelativePath !== original.destinationRelativePath ||
      current.destinationRelativePath !== original.sourceRelativePath ||
      current.sourceComparisonKey !== original.destinationComparisonKey ||
      current.destinationComparisonKey !== original.sourceComparisonKey ||
      current.version.sha256 !== original.sha256 ||
      current.version.bytes !== original.bytes ||
      !sameIdentity(current.objectIdentity, original.objectIdentity)
    ) throw conflict();
  }
}

class PendingMoveUndoChangeSet<T extends object> implements PendingWorkspaceMutation {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds = ["move"] as const;
  readonly revertsChangeSetId: string;
  private pendingCommit: PendingMoveTransactionCommit | null = null;
  private reverseManifest: MoveChangeSetManifestV2 | null = null;
  private state: "prepared" | "committing" | "committed" | "rolled_back" = "prepared";

  constructor(
    private readonly prepared: PreparedMoveTransaction,
    private readonly original: MoveChangeSetManifestV2,
    private readonly reverseDraft: MoveChangeSetManifestDraftV2,
    private readonly store: MoveUndoChangeSetServiceOptions["moveChangeSetStore"],
    private readonly now: () => number,
    private readonly failureProjector?: (input: { error: unknown; result: T }) => T | null
  ) {
    this.transactionId = prepared.transactionId;
    this.changeSetId = prepared.changeSetId;
    this.operationCount = prepared.operations.length;
    this.revertsChangeSetId = original.changeSetId;
  }

  private markReverseRecoveryRequired(): void {
    if (!this.reverseManifest) return;
    try {
      const current = this.store.read(
        this.reverseManifest.workspaceStateKey,
        this.reverseManifest.changeSetId
      );
      if (current.state === "recovery_required") return;
      if (current.state !== "active") return;
      this.reverseManifest = this.store.transition(
        current.workspaceStateKey,
        current.changeSetId,
        {
          expectedGeneration: current.generation,
          state: "recovery_required",
          updatedAt: timestamp(this.now)
        }
      );
    } catch {
      // The last authenticated reverse manifest remains recovery evidence.
    }
  }

  private async rollbackPrepared(reason: string): Promise<void> {
    try {
      await (this.pendingCommit ?? this.prepared).rollback(reason);
      this.state = "rolled_back";
    } catch {
      this.state = "rolled_back";
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Move undo rollback could not be proven complete."
      );
    }
  }

  private transitionOriginalUndone(): void {
    const current = this.store.read(
      this.original.workspaceStateKey,
      this.original.changeSetId
    );
    if (current.state === "undone") return;
    if (current.state !== "active") {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "The original move change set is no longer active after reverse commit."
      );
    }
    this.store.transition(current.workspaceStateKey, current.changeSetId, {
      expectedGeneration: current.generation,
      state: "undone",
      updatedAt: timestamp(this.now)
    });
  }

  async commit<R extends object>(input: MutationCommitInput<R>): Promise<R> {
    if (this.state !== "prepared") {
      throw new TransactionError(
        "TRANSACTION_PRECONDITION_FAILED",
        "Pending move undo is already finalized."
      );
    }
    this.state = "committing";
    let phase: "install" | "change_set" | "audit" | "original_change_set" | "finalize" = "install";
    let originalTransitionCompleted = false;
    try {
      this.pendingCommit = await this.prepared.commit();
      phase = "change_set";
      await this.pendingCommit.commitParticipant("change_set", async () => {
        const createdDirectoryFacts = this.prepared.createdDirectoryFacts();
        this.reverseManifest = this.store.create({
          ...this.reverseDraft,
          createdDirectories: createdDirectoryFacts.map((fact) => fact.relativePath),
          createdDirectoryIdentities: Object.fromEntries(
            createdDirectoryFacts.map((fact) => [fact.relativePath, fact.objectIdentity])
          )
        });
      });
      phase = "audit";
      await this.pendingCommit.commitParticipant("audit", async () => input.persistAudit());
      phase = "original_change_set";
      await this.pendingCommit.commitParticipant("original_change_set", async () => {
        this.transitionOriginalUndone();
        originalTransitionCompleted = true;
      });
      phase = "finalize";
      await this.pendingCommit.finalize();
      this.state = "committed";
      return input.result;
    } catch (error) {
      if (this.state === "committed") throw error;
      if (phase === "finalize" || originalTransitionCompleted) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "The durable reverse move requires change-set reconciliation."
        );
      }
      if (this.reverseManifest) this.markReverseRecoveryRequired();
      await this.rollbackPrepared(`${phase}_failed`);
      if (phase === "audit") {
        throw new AuditError(
          "AUDIT_UNAVAILABLE",
          "Audit completion failed and move undo was rolled back."
        );
      }
      throw error instanceof TransactionError || error instanceof ChangeSetError
        ? error
        : new TransactionError("TRANSACTION_FAILED", "Move undo transaction failed.");
    }
  }

  projectFailure<R extends object>(error: unknown, result: R): R | null {
    if (!this.failureProjector) return null;
    return this.failureProjector({
      error: mapError(error),
      result: result as unknown as T
    }) as unknown as R | null;
  }

  async rollback(reason: string): Promise<void> {
    if (this.state === "committed") {
      throw new TransactionError("ROLLBACK_FAILED", "A committed move undo cannot be rolled back.");
    }
    if (this.state === "rolled_back") return;
    await this.rollbackPrepared(reason);
  }
}

export class MoveUndoChangeSetService {
  private readonly now: () => number;
  private readonly retentionMs: number;

  constructor(private readonly options: MoveUndoChangeSetServiceOptions) {
    this.now = options.now ?? Date.now;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    if (!Number.isSafeInteger(this.retentionMs) || this.retentionMs <= 0) {
      throw new Error("Move undo retention is invalid.");
    }
  }

  probe(workspace: Workspace, changeSetId: string): "present" | "absent" | "unknown" {
    return this.options.moveChangeSetStore.probe(
      this.options.engine.workspaceStateKey(workspace.root),
      changeSetId
    );
  }

  private authorizedManifest(
    workspace: Workspace,
    changeSetId: string,
    ownerBinding: string
  ): MoveChangeSetManifestV2 {
    let manifest: MoveChangeSetManifestV2;
    try {
      manifest = this.options.moveChangeSetStore.read(
        this.options.engine.workspaceStateKey(workspace.root),
        changeSetId
      );
    } catch {
      throw new UndoChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    if (manifest.ownerBinding !== ownerBinding) {
      throw new UndoChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    if (manifest.state === "undone") {
      throw new UndoChangeSetError("UNDO_ALREADY_APPLIED", "The change set was already undone.");
    }
    if (manifest.state === "undo_expired" || Date.parse(manifest.expiresAt) <= this.now()) {
      throw new UndoChangeSetError("UNDO_EXPIRED", "The change set undo window expired.");
    }
    if (manifest.state === "recovery_required") {
      throw new UndoChangeSetError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "The move change set requires recovery."
      );
    }
    if (
      manifest.state !== "active" ||
      !manifest.undoSupported ||
      manifest.toolName !== "move_paths" ||
      manifest.operations.length < 1 ||
      manifest.operations.length > 64
    ) {
      throw new UndoChangeSetError("UNDO_NOT_SUPPORTED", "This move change set is not undoable.");
    }
    return manifest;
  }

  describeResource(input: {
    workspace: Workspace;
    changeSetId: string;
    ownerBinding: string;
  }): FilesystemBatchResourceV1 {
    const manifest = this.authorizedManifest(
      input.workspace,
      input.changeSetId,
      input.ownerBinding
    );
    try {
      return describeFilesystemBatchResource({
        workspace: input.workspace,
        guard: this.options.guard,
        operation: "undo",
        entries: manifest.operations.map((operation) => ({
          sourcePath: operation.destinationRelativePath,
          destinationPath: operation.sourceRelativePath
        }))
      });
    } catch {
      throw conflict();
    }
  }

  async prepare<T extends object = Record<string, unknown>>(
    input: PrepareMoveUndoChangeSetInput<T>
  ): Promise<PreparedUndoChangeSet> {
    const manifest = this.authorizedManifest(
      input.workspace,
      input.changeSetId,
      input.ownerBinding
    );
    this.describeResource({
      workspace: input.workspace,
      changeSetId: input.changeSetId,
      ownerBinding: input.ownerBinding
    });
    const moves = reverseMoves(manifest);
    const operationSummaries = summaries(manifest);

    if (input.preview) {
      let batch: InspectedMoveBatch;
      try {
        batch = await this.options.engine.previewMove(
          input.workspace,
          moves,
          false,
          manifest.createdDirectories.map((relativePath) => ({
            relativePath,
            objectIdentity: manifest.createdDirectoryIdentities[relativePath]
          }))
        );
      } catch (error) {
        throw mapError(error);
      }
      try {
        verifyReverseFacts(manifest, batch.operations);
      } finally {
        await batch.close();
      }
      return {
        preview: true,
        workspaceId: input.workspace.id,
        changeSetId: null,
        revertsChangeSetId: manifest.changeSetId,
        operationCount: operationSummaries.length,
        operations: operationSummaries,
        pending: null
      };
    }

    let prepared: PreparedMoveTransaction;
    try {
      prepared = await this.options.engine.prepareMove({
        workspace: input.workspace,
        moves,
        createParents: false,
        removeEmptyDirectoriesAfterInstall: manifest.createdDirectories.map((relativePath) => ({
          relativePath,
          objectIdentity: manifest.createdDirectoryIdentities[relativePath]
        })),
        requiredParticipants: ["audit", "change_set", "original_change_set"],
        participantReferences: {
          original_change_set: `original_change_set:${manifest.changeSetId}`
        }
      });
      verifyReverseFacts(manifest, prepared.operations);
    } catch (error) {
      throw mapError(error);
    }

    const createdAtMs = this.now();
    const createdAt = timestamp(this.now);
    const reverseDraft: MoveChangeSetManifestDraftV2 = {
      schemaVersion: 2,
      changeSetId: prepared.changeSetId,
      transactionId: prepared.transactionId,
      workspaceStateKey: this.options.engine.workspaceStateKey(input.workspace.root),
      generation: 1,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAtMs + this.retentionMs).toISOString(),
      toolName: "undo_change_set",
      requestId: input.requestId,
      ownerBinding: input.ownerBinding,
      policyRevision: input.policyRevision,
      contractVersion: input.contractVersion,
      state: "active",
      undoSupported: false,
      undoReason: "reverted_change_set",
      operations: orderedOperations(prepared.operations).map((operation) => ({
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
      revertsChangeSetId: manifest.changeSetId
    };
    const pending = new PendingMoveUndoChangeSet(
      prepared,
      manifest,
      reverseDraft,
      this.options.moveChangeSetStore,
      this.now,
      input.projectFailure
    );
    return {
      preview: false,
      workspaceId: input.workspace.id,
      changeSetId: prepared.changeSetId,
      revertsChangeSetId: manifest.changeSetId,
      operationCount: operationSummaries.length,
      operations: operationSummaries,
      pending
    };
  }
}

import { createHash, createHmac } from "node:crypto";
import fsp from "node:fs/promises";
import type { PathGuard, Workspace } from "../guard.js";
import { currentPolicyIdentity, type PolicySessionContextSource } from "../policy/identity.js";
import { describeFilesystemBatchResource } from "../policy/resources.js";
import type { FilesystemBatchResourceV1 } from "../policy/types.js";
import {
  TransactionError,
  type AtomicTransactionEngine,
  type CommittedTransaction,
  type PendingTransactionCommit,
  type PreparedTransaction,
  type TransactionOperationKind,
  type TransactionRequestOperationV1
} from "../transactions/index.js";
import { AuditError } from "../audit/types.js";
import type {
  MutationCommitInput,
  PendingWorkspaceMutation
} from "../mutations/types.js";
import {
  undoChangeSetInputV2Schema,
  undoChangeSetOutputSchema,
  type UndoChangeSetStructuredResult
} from "../tools/schemas/undoChangeSet.js";
import type { ChangeSetStore, CreateChangeSetInput } from "./store.js";
import {
  ChangeSetError,
  type ChangeSetManifestV1,
  type ChangeSetOperationV1
} from "./types.js";

const OWNER_BINDING_LABEL = "codexgpt/change-set-owner/v1\0";
const DEFAULT_MAX_UNDO_FILE_BYTES = 64 * 1024 * 1024;
const DEFAULT_UNDO_RETENTION_MS = 24 * 60 * 60_000;

export type UndoChangeSetErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "CHANGE_SET_NOT_FOUND"
  | "UNDO_EXPIRED"
  | "UNDO_NOT_SUPPORTED"
  | "UNDO_ALREADY_APPLIED"
  | "UNDO_CONFLICT"
  | "TRANSACTION_BUSY"
  | "ATOMIC_BACKEND_UNAVAILABLE"
  | "AUDIT_UNAVAILABLE"
  | "AUDIT_INTEGRITY_FAILURE"
  | "TRANSACTION_FAILED"
  | "ROLLBACK_FAILED"
  | "TRANSACTION_RECOVERY_REQUIRED"
  | "INTERNAL_ERROR";

export class UndoChangeSetError extends Error {
  constructor(readonly code: UndoChangeSetErrorCode, message: string) {
    super(message);
    this.name = "UndoChangeSetError";
  }
}

export type UndoChangeSetHandlerV2 = (
  input: { workspace_id: string; change_set_id: string; preview?: boolean }
) => Promise<UndoChangeSetStructuredResult>;

export async function undoChangeSetV2(
  handler: UndoChangeSetHandlerV2,
  input: unknown
): Promise<UndoChangeSetStructuredResult> {
  const parsed = undoChangeSetInputV2Schema.safeParse(input);
  if (!parsed.success) {
    throw new UndoChangeSetError("INTERNAL_ERROR", "Undo change-set input is invalid.");
  }
  return undoChangeSetOutputSchema.parse(await handler(parsed.data));
}

export function createDirectUndoChangeSetAdapterV2(
  handler: UndoChangeSetHandlerV2
): (input: unknown) => Promise<UndoChangeSetStructuredResult> {
  return (input) => undoChangeSetV2(handler, input);
}

export function createSupertoolUndoChangeSetAdapterV2(
  handler: UndoChangeSetHandlerV2
): (input: unknown) => Promise<UndoChangeSetStructuredResult> {
  return (input) => undoChangeSetV2(handler, input);
}

function ownerMaterial(source: PolicySessionContextSource): { kind: string; value: string } {
  const identity = currentPolicyIdentity(source);
  const subject = identity.subject?.trim();
  if (subject) return { kind: "subject", value: subject };
  const credentialRef = identity.credentialRef?.trim();
  if (credentialRef) return { kind: "credential", value: credentialRef };
  let transportSessionId = "";
  try {
    transportSessionId = source.transportSessionId().trim();
  } catch {
    // The stable error below is intentionally non-disclosing.
  }
  if (!transportSessionId || transportSessionId === "pending") {
    throw new Error("Change-set owner identity is unavailable.");
  }
  return { kind: "transport_session", value: transportSessionId };
}

export function deriveChangeSetOwnerBinding(
  source: PolicySessionContextSource,
  key: Buffer
): string {
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new Error("Change-set owner binding key is invalid.");
  }
  const material = ownerMaterial(source);
  const digest = createHmac("sha256", key)
    .update(OWNER_BINDING_LABEL, "utf8")
    .update(material.kind, "utf8")
    .update("\0", "utf8")
    .update(material.value, "utf8")
    .digest("hex");
  return `owner_${digest}`;
}

export type UndoOperationSummary =
  | {
      kind: "delete" | "restore";
      path: string;
    }
  | {
      kind: "move";
      source: string;
      destination: string;
    };

export interface PreparedUndoChangeSet {
  preview: boolean;
  workspaceId: string;
  changeSetId: string | null;
  revertsChangeSetId: string;
  operationCount: number;
  operations: UndoOperationSummary[];
  pending: PendingWorkspaceMutation | null;
}

export interface PrepareUndoChangeSetInput<T extends object = Record<string, unknown>> {
  workspace: Workspace;
  changeSetId: string;
  ownerBinding: string;
  policyRevision: string;
  requestId: string | null;
  preview: boolean;
  contractVersion: 2 | 3;
  projectFailure?: (input: { error: unknown; result: T }) => T | null;
}

export interface UndoChangeSetServiceOptions {
  engine: Pick<AtomicTransactionEngine, "prepare" | "workspaceStateKey">;
  changeSetStore: Pick<ChangeSetStore, "read" | "readBlob" | "create" | "transition">;
  guard: PathGuard;
  now?: () => number;
  maxFileBytes?: number;
  retentionMs?: number;
}

interface CurrentPresentFact {
  exists: true;
  sha256: string;
  bytes: number;
  metadata: { mode: number; atimeMs: number; mtimeMs: number };
}

interface CurrentAbsentFact {
  exists: false;
  sha256: null;
  bytes: 0;
  metadata: null;
}

type CurrentFact = CurrentPresentFact | CurrentAbsentFact;

interface ReversePreparation {
  requests: TransactionRequestOperationV1[];
  manifestOperations: ChangeSetOperationV1[];
  summaries: UndoOperationSummary[];
  plaintext: Buffer[];
}

function timestamp(value: number, label: string): string {
  const result = new Date(value).toISOString();
  if (result === "Invalid Date") throw new UndoChangeSetError("INTERNAL_ERROR", `${label} is invalid.`);
  return result;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wipe(buffers: readonly Buffer[]): void {
  for (const buffer of buffers) buffer.fill(0);
}

function conflict(): UndoChangeSetError {
  return new UndoChangeSetError("UNDO_CONFLICT", "The change set no longer matches the complete current state.");
}

function requireMatchingRollbackBytes(
  operation: ChangeSetOperationV1,
  bytes: Buffer
): Buffer {
  if (
    !operation.before.exists ||
    bytes.length !== operation.before.bytes ||
    sha256(bytes) !== operation.before.sha256
  ) {
    bytes.fill(0);
    throw new UndoChangeSetError("INTERNAL_ERROR", "Rollback content does not match authenticated change-set facts.");
  }
  return bytes;
}

function mapTransactionError(error: unknown): UndoChangeSetError {
  if (error instanceof UndoChangeSetError) return error;
  if (error instanceof AuditError) {
    return new UndoChangeSetError(
      error.code === "AUDIT_INTEGRITY_FAILURE" ? "AUDIT_INTEGRITY_FAILURE" : "AUDIT_UNAVAILABLE",
      "Required audit completion failed."
    );
  }
  if (error instanceof TransactionError) {
    const allowed = new Set<UndoChangeSetErrorCode>([
      "TRANSACTION_BUSY",
      "ATOMIC_BACKEND_UNAVAILABLE",
      "TRANSACTION_FAILED",
      "ROLLBACK_FAILED",
      "TRANSACTION_RECOVERY_REQUIRED"
    ]);
    const code = allowed.has(error.code as UndoChangeSetErrorCode)
      ? error.code as UndoChangeSetErrorCode
      : error.code === "FILE_VERSION_CONFLICT" || error.code === "TRANSACTION_PRECONDITION_FAILED"
        ? "UNDO_CONFLICT"
        : "TRANSACTION_FAILED";
    return new UndoChangeSetError(code, "The reverse transaction could not be completed.");
  }
  return new UndoChangeSetError("INTERNAL_ERROR", "Undo could not be completed.");
}

class PendingUndoChangeSet<T extends object> implements PendingWorkspaceMutation {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds: readonly TransactionOperationKind[];
  readonly revertsChangeSetId: string;
  private pendingCommit: PendingTransactionCommit | null = null;
  private state: "prepared" | "committing" | "committed" | "rolled_back" = "prepared";
  private reverseManifest: ChangeSetManifestV1 | null = null;

  constructor(
    private readonly prepared: PreparedTransaction,
    private readonly original: ChangeSetManifestV1,
    private readonly reverse: CreateChangeSetInput,
    private readonly store: UndoChangeSetServiceOptions["changeSetStore"],
    private readonly now: () => number,
    operations: readonly TransactionRequestOperationV1[],
    private readonly failureProjector?: (input: { error: unknown; result: T }) => T | null
  ) {
    this.transactionId = prepared.transactionId;
    this.changeSetId = prepared.changeSetId;
    this.operationCount = operations.length;
    this.mutationKinds = [...new Set(operations.map((operation) => operation.kind))];
    this.revertsChangeSetId = original.changeSetId;
  }

  private async rollbackPrepared(reason: string): Promise<void> {
    try {
      await (this.pendingCommit ?? this.prepared).rollback(reason);
      this.state = "rolled_back";
    } catch {
      this.state = "rolled_back";
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Undo rollback could not be proven complete."
      );
    }
  }

  private markReverseRecoveryRequired(): void {
    if (!this.reverseManifest) return;
    try {
      this.store.transition(
        this.reverseManifest.workspaceStateKey,
        this.reverseManifest.changeSetId,
        {
          expectedGeneration: this.reverseManifest.generation,
          state: "recovery_required",
          updatedAt: timestamp(this.now(), "Recovery timestamp")
        }
      );
    } catch {
      // The authenticated reverse manifest remains evidence for recovery.
    }
  }

  async commit<R extends object>(input: MutationCommitInput<R>): Promise<R> {
    if (this.state !== "prepared") {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Pending undo is already finalized.");
    }
    this.state = "committing";
    let phase: "install" | "audit" | "change_set" | "finalize" | "original" = "install";
    try {
      this.pendingCommit = await this.prepared.commit();
      phase = "audit";
      await this.pendingCommit.commitParticipant("audit", async () => input.persistAudit());
      phase = "change_set";
      await this.pendingCommit.commitParticipant("change_set", async () => {
        this.reverseManifest = this.store.create(this.reverse);
      });
      phase = "finalize";
      await this.pendingCommit.finalize();
      phase = "original";
      try {
        this.store.transition(
          this.original.workspaceStateKey,
          this.original.changeSetId,
          {
            expectedGeneration: this.original.generation,
            state: "undone",
            updatedAt: timestamp(this.now(), "Undo timestamp")
          }
        );
      } catch {
        try {
          if (this.store.read(this.original.workspaceStateKey, this.original.changeSetId).state !== "undone") {
            throw new Error("original state is not undone");
          }
        } catch {
          this.markReverseRecoveryRequired();
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "The audited reverse commit could not be reconciled with its original change set."
          );
        }
      }
      this.state = "committed";
      return input.result;
    } catch (error) {
      if (this.state === "committed") throw error;
      if (this.reverseManifest) this.markReverseRecoveryRequired();
      if (phase !== "original") {
        try {
          await this.rollbackPrepared(`${phase}_failed`);
        } catch (rollbackError) {
          throw rollbackError;
        }
      }
      if (phase === "audit") {
        throw new AuditError("AUDIT_UNAVAILABLE", "Audit completion failed and undo was rolled back.");
      }
      throw error instanceof TransactionError
        ? error
        : new TransactionError("TRANSACTION_FAILED", "Undo transaction failed.");
    }
  }

  projectFailure<R extends object>(error: unknown, result: R): R | null {
    if (!this.failureProjector) return null;
    return this.failureProjector({ error: mapTransactionError(error), result: result as unknown as T }) as unknown as R | null;
  }

  async rollback(reason: string): Promise<void> {
    if (this.state === "committed") {
      throw new TransactionError("ROLLBACK_FAILED", "A committed undo cannot be rolled back.");
    }
    if (this.state === "rolled_back") return;
    await this.rollbackPrepared(reason);
  }
}

export class UndoChangeSetService {
  private readonly engine: UndoChangeSetServiceOptions["engine"];
  private readonly store: UndoChangeSetServiceOptions["changeSetStore"];
  private readonly guard: PathGuard;
  private readonly now: () => number;
  private readonly maxFileBytes: number;
  private readonly retentionMs: number;

  constructor(options: UndoChangeSetServiceOptions) {
    this.engine = options.engine;
    this.store = options.changeSetStore;
    this.guard = options.guard;
    this.now = options.now ?? Date.now;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_UNDO_FILE_BYTES;
    this.retentionMs = options.retentionMs ?? DEFAULT_UNDO_RETENTION_MS;
    if (!Number.isSafeInteger(this.maxFileBytes) || this.maxFileBytes <= 0) {
      throw new Error("Undo file byte limit is invalid.");
    }
    if (!Number.isSafeInteger(this.retentionMs) || this.retentionMs <= 0) {
      throw new Error("Undo retention is invalid.");
    }
  }

  private authorizedManifest(
    workspace: Workspace,
    changeSetId: string,
    ownerBinding: string
  ): ChangeSetManifestV1 {
    let manifest: ChangeSetManifestV1;
    try {
      manifest = this.store.read(this.engine.workspaceStateKey(workspace.root), changeSetId);
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
      throw new UndoChangeSetError("TRANSACTION_RECOVERY_REQUIRED", "The change set requires recovery.");
    }
    if (!manifest.undoSupported || manifest.operations.some((operation) => operation.kind === "move") || manifest.operations.length > 64) {
      throw new UndoChangeSetError("UNDO_NOT_SUPPORTED", "This change set is not undoable.");
    }
    return manifest;
  }

  describeResource(input: {
    workspace: Workspace;
    changeSetId: string;
    ownerBinding: string;
  }): FilesystemBatchResourceV1 {
    const manifest = this.authorizedManifest(input.workspace, input.changeSetId, input.ownerBinding);
    try {
      return describeFilesystemBatchResource({
        workspace: input.workspace,
        guard: this.guard,
        operation: "undo",
        entries: manifest.operations.map((operation) => ({
          sourcePath: operation.kind === "delete" ? null : operation.relativePath,
          destinationPath: operation.kind === "delete" ? operation.relativePath : null
        }))
      });
    } catch {
      throw conflict();
    }
  }

  private async currentFact(
    workspace: Workspace,
    operation: ChangeSetOperationV1
  ): Promise<CurrentFact> {
    let absPath: string;
    try {
      absPath = this.guard.resolve(workspace, operation.relativePath, { forWrite: true }).absPath;
    } catch {
      throw conflict();
    }
    let stat;
    try {
      stat = await fsp.lstat(absPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (operation.after.exists) throw conflict();
        return { exists: false, sha256: null, bytes: 0, metadata: null };
      }
      throw conflict();
    }
    if (!operation.after.exists || !stat.isFile() || stat.isSymbolicLink() || stat.size > this.maxFileBytes) {
      throw conflict();
    }
    let bytes: Buffer;
    try {
      bytes = await fsp.readFile(absPath);
    } catch {
      throw conflict();
    }
    const actual = sha256(bytes);
    if (bytes.length !== operation.after.bytes || actual !== operation.after.sha256) {
      bytes.fill(0);
      throw conflict();
    }
    bytes.fill(0);
    return {
      exists: true,
      sha256: actual,
      bytes: stat.size,
      metadata: { mode: stat.mode, atimeMs: stat.atimeMs, mtimeMs: stat.mtimeMs }
    };
  }

  private async reversePreparation(
    workspace: Workspace,
    manifest: ChangeSetManifestV1
  ): Promise<ReversePreparation> {
    const currentFacts = await Promise.all(
      manifest.operations.map((operation) => this.currentFact(workspace, operation))
    );
    const plaintext: Buffer[] = [];
    try {
      const requests: TransactionRequestOperationV1[] = [];
      const manifestOperations: ChangeSetOperationV1[] = [];
      const summaries: UndoOperationSummary[] = [];
      for (let index = 0; index < manifest.operations.length; index += 1) {
        const operation = manifest.operations[index];
        const current = currentFacts[index];
        const operationId = `op_undo_${String(index + 1).padStart(4, "0")}`;
        if (operation.kind === "create") {
          if (!current.exists || current.sha256 !== operation.after.sha256) throw conflict();
          requests.push({
            operationId,
            kind: "delete",
            relativePath: operation.relativePath,
            expectedSha256: operation.after.sha256
          });
          manifestOperations.push({
            operationId,
            kind: "delete",
            relativePath: operation.relativePath,
            destinationRelativePath: null,
            before: current,
            after: { exists: false, sha256: null, bytes: 0 },
            blobId: null
          });
          summaries.push({ kind: "delete", path: operation.relativePath });
          continue;
        }
        if (operation.kind === "replace") {
          if (!current.exists || !operation.blobId) throw conflict();
          let before: Buffer;
          try {
            before = requireMatchingRollbackBytes(
              operation,
              this.store.readBlob(manifest.workspaceStateKey, manifest.changeSetId, operation.blobId)
            );
          } catch {
            throw new UndoChangeSetError("INTERNAL_ERROR", "Rollback content authentication failed.");
          }
          plaintext.push(before);
          requests.push({
            operationId,
            kind: "replace",
            relativePath: operation.relativePath,
            bytes: before,
            expectedSha256: operation.after.sha256
          });
          manifestOperations.push({
            operationId,
            kind: "replace",
            relativePath: operation.relativePath,
            destinationRelativePath: null,
            before: current,
            after: {
              exists: true,
              sha256: operation.before.sha256,
              bytes: operation.before.bytes
            },
            blobId: null
          });
          summaries.push({ kind: "restore", path: operation.relativePath });
          continue;
        }
        if (operation.kind === "delete") {
          if (current.exists || !operation.blobId) throw conflict();
          let before: Buffer;
          try {
            before = requireMatchingRollbackBytes(
              operation,
              this.store.readBlob(manifest.workspaceStateKey, manifest.changeSetId, operation.blobId)
            );
          } catch {
            throw new UndoChangeSetError("INTERNAL_ERROR", "Rollback content authentication failed.");
          }
          plaintext.push(before);
          requests.push({
            operationId,
            kind: "create",
            relativePath: operation.relativePath,
            bytes: before,
            expectedAbsent: true
          });
          manifestOperations.push({
            operationId,
            kind: "create",
            relativePath: operation.relativePath,
            destinationRelativePath: null,
            before: { exists: false, sha256: null, bytes: 0, metadata: null },
            after: {
              exists: true,
              sha256: operation.before.sha256,
              bytes: operation.before.bytes
            },
            blobId: null
          });
          summaries.push({ kind: "restore", path: operation.relativePath });
          continue;
        }
        throw new UndoChangeSetError("UNDO_NOT_SUPPORTED", "Move undo is not available before Phase 3D.");
      }
      return { requests, manifestOperations, summaries, plaintext };
    } catch (error) {
      wipe(plaintext);
      throw error;
    }
  }

  async prepare<T extends object = Record<string, unknown>>(
    input: PrepareUndoChangeSetInput<T>
  ): Promise<PreparedUndoChangeSet> {
    const manifest = this.authorizedManifest(input.workspace, input.changeSetId, input.ownerBinding);
    this.describeResource({
      workspace: input.workspace,
      changeSetId: input.changeSetId,
      ownerBinding: input.ownerBinding
    });
    const reverse = await this.reversePreparation(input.workspace, manifest);
    if (input.preview) {
      wipe(reverse.plaintext);
      return {
        preview: true,
        workspaceId: input.workspace.id,
        changeSetId: null,
        revertsChangeSetId: manifest.changeSetId,
        operationCount: reverse.requests.length,
        operations: reverse.summaries,
        pending: null
      };
    }

    let prepared: PreparedTransaction;
    try {
      prepared = await this.engine.prepare({
        workspace: input.workspace,
        operations: reverse.requests,
        requiredParticipants: ["audit", "change_set"]
      });
    } catch (error) {
      wipe(reverse.plaintext);
      throw mapTransactionError(error);
    }
    wipe(reverse.plaintext);
    const createdAtMs = this.now();
    const createdAt = timestamp(createdAtMs, "Undo creation timestamp");
    const reverseInput: CreateChangeSetInput = {
      manifest: {
        schemaVersion: 1,
        changeSetId: prepared.changeSetId,
        transactionId: prepared.transactionId,
        workspaceStateKey: manifest.workspaceStateKey,
        generation: 1,
        createdAt,
        updatedAt: createdAt,
        expiresAt: timestamp(createdAtMs + this.retentionMs, "Undo expiry timestamp"),
        toolName: "undo_change_set",
        requestId: input.requestId,
        ownerBinding: input.ownerBinding,
        policyRevision: input.policyRevision,
        contractVersion: input.contractVersion,
        state: "active",
        undoSupported: false,
        undoReason: "reverted_change_set",
        operations: reverse.manifestOperations,
        plaintextBytes: 0,
        ciphertextBytes: 0,
        revertsChangeSetId: manifest.changeSetId
      },
      blobs: []
    };
    const pending = new PendingUndoChangeSet(
      prepared,
      manifest,
      reverseInput,
      this.store,
      this.now,
      reverse.requests,
      input.projectFailure
    );
    return {
      preview: false,
      workspaceId: input.workspace.id,
      changeSetId: prepared.changeSetId,
      revertsChangeSetId: manifest.changeSetId,
      operationCount: reverse.requests.length,
      operations: reverse.summaries,
      pending
    };
  }
}

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import {
  AuditError
} from "../audit/types.js";
import {
  changeSetManifestDraftV1Schema,
  type ChangeSetManifestV1,
  type ChangeSetStore,
  type CreateChangeSetInput
} from "../changesets/index.js";
import {
  TransactionError,
  type AtomicTransactionEngine,
  type PendingTransactionCommit,
  type PreparedTransaction,
  type TransactionRequestOperationV1
} from "../transactions/index.js";
import {
  preserveMutationResult
} from "./writers.js";
import type {
  MutationCommitInput,
  MutationProviderInvocation,
  MutationProjectionInput,
  PendingWorkspaceMutation,
  WorkspaceMutationPreparation
} from "./types.js";

const PENDING_WORKSPACE_MUTATION = Symbol("codexpro.pending.workspace.mutation");

interface InvocationContext {
  pending: Set<PendingWorkspaceMutationImpl>;
}

export interface WorkspaceMutationRuntimeOptions {
  engine: Pick<AtomicTransactionEngine, "prepare" | "workspaceStateKey">;
  changeSetStore: Pick<ChangeSetStore, "create" | "transition">;
  now?: () => number;
}

function transactionFailure(message: string): TransactionError {
  return new TransactionError("TRANSACTION_PRECONDITION_FAILED", message);
}

function validTimestamp(now: () => number): string {
  try {
    return new Date(now()).toISOString();
  } catch {
    throw transactionFailure("Mutation runtime clock is invalid.");
  }
}

function exactSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function validateChangeSet(
  input: CreateChangeSetInput,
  identity: { transactionId: string; changeSetId: string; workspaceStateKey: string },
  transactionOperations: readonly TransactionRequestOperationV1[]
): void {
  const parsed = changeSetManifestDraftV1Schema.safeParse(input.manifest);
  if (!parsed.success) throw transactionFailure("Prepared change-set facts are invalid.");
  const manifest = parsed.data;
  if (
    manifest.transactionId !== identity.transactionId ||
    manifest.changeSetId !== identity.changeSetId ||
    manifest.workspaceStateKey !== identity.workspaceStateKey
  ) {
    throw transactionFailure("Prepared transaction and change-set identities do not match.");
  }
  if (manifest.operations.length !== transactionOperations.length) {
    throw transactionFailure("Prepared transaction and change-set operation counts do not match.");
  }
  if (!Array.isArray(input.blobs)) {
    throw transactionFailure("Prepared change-set rollback blobs are invalid.");
  }
  const manifestOperations = new Map(
    manifest.operations.map((operation) => [operation.operationId, operation])
  );
  for (const transactionOperation of transactionOperations) {
    const operation = manifestOperations.get(transactionOperation.operationId);
    if (
      !operation ||
      operation.kind !== transactionOperation.kind ||
      normalizedRelativePath(operation.relativePath) !== normalizedRelativePath(transactionOperation.relativePath)
    ) {
      throw transactionFailure("Prepared transaction and change-set operations do not match.");
    }
    if (transactionOperation.kind === "create" || transactionOperation.kind === "replace") {
      if (
        !operation.after.exists ||
        operation.after.bytes !== transactionOperation.bytes.length ||
        operation.after.sha256 !== exactSha256(transactionOperation.bytes)
      ) {
        throw transactionFailure("Prepared change-set after-state does not match transaction bytes.");
      }
    } else if (operation.after.exists) {
      throw transactionFailure("Prepared delete after-state is invalid.");
    }
    if (
      transactionOperation.kind !== "create" &&
      transactionOperation.expectedSha256 !== null &&
      operation.before.sha256 !== transactionOperation.expectedSha256
    ) {
      throw transactionFailure("Prepared change-set before-state does not match the expected file version.");
    }
  }
  const blobs = new Map(input.blobs.map((blob) => [blob.blobId, blob]));
  if (blobs.size !== input.blobs.length) {
    throw transactionFailure("Prepared change-set rollback blob identities are duplicate.");
  }
  let plaintextBytes = 0;
  for (const operation of manifest.operations) {
    if (!operation.blobId) continue;
    const blob = blobs.get(operation.blobId);
    if (
      !blob ||
      !operation.before.exists ||
      blob.operationId !== operation.operationId ||
      blob.beforeSha256 !== operation.before.sha256 ||
      blob.plaintext.length !== operation.before.bytes ||
      exactSha256(blob.plaintext) !== operation.before.sha256
    ) {
      throw transactionFailure("Prepared change-set rollback blob facts do not match.");
    }
    plaintextBytes += blob.plaintext.length;
  }
  const referencedBlobCount = manifest.operations.filter((operation) => operation.blobId).length;
  if (
    referencedBlobCount !== input.blobs.length ||
    manifest.plaintextBytes !== plaintextBytes ||
    manifest.ciphertextBytes !== plaintextBytes + referencedBlobCount * 37
  ) {
    throw transactionFailure("Prepared change-set rollback byte accounting is invalid.");
  }
}

function wipeRollbackBlobs(input: CreateChangeSetInput): void {
  for (const blob of input.blobs) blob.plaintext.fill(0);
}

class PendingWorkspaceMutationImpl implements PendingWorkspaceMutation {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds: readonly ("create" | "replace" | "delete")[];
  private state: "prepared" | "committing" | "finalized" | "rolled_back" = "prepared";
  private pendingCommit: PendingTransactionCommit | null = null;

  constructor(
    private readonly prepared: PreparedTransaction,
    private readonly changeSetInput: CreateChangeSetInput,
    private readonly changeSetStore: WorkspaceMutationRuntimeOptions["changeSetStore"],
    private readonly project: (input: MutationProjectionInput<object>) => object,
    private readonly now: () => number,
    operations: readonly { kind: "create" | "replace" | "delete" }[],
    private readonly onSettled: (pending: PendingWorkspaceMutationImpl) => void
  ) {
    this.transactionId = prepared.transactionId;
    this.changeSetId = prepared.changeSetId;
    this.operationCount = operations.length;
    this.mutationKinds = [...new Set(operations.map((operation) => operation.kind))];
  }

  private assertPrepared(): void {
    if (this.state !== "prepared") {
      throw transactionFailure("Pending workspace mutation is already finalized or is not in the prepared state.");
    }
  }

  private async proveRollback(reason: string): Promise<void> {
    try {
      await (this.pendingCommit ?? this.prepared).rollback(reason);
      this.state = "rolled_back";
    } catch {
      this.state = "rolled_back";
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Workspace mutation rollback could not be proven complete."
      );
    } finally {
      wipeRollbackBlobs(this.changeSetInput);
      this.onSettled(this);
    }
  }

  async commit<T extends object>(input: MutationCommitInput<T>): Promise<T> {
    this.assertPrepared();
    this.state = "committing";
    let phase: "install" | "audit" | "change_set" | "finalize" = "install";
    const createdChangeSet: { value: ChangeSetManifestV1 | null } = { value: null };
    try {
      this.pendingCommit = await this.prepared.commit();
      phase = "audit";
      await this.pendingCommit.commitParticipant("audit", async () => {
        await input.persistAudit();
      });
      phase = "change_set";
      await this.pendingCommit.commitParticipant("change_set", async () => {
        createdChangeSet.value = this.changeSetStore.create(this.changeSetInput);
      });
      phase = "finalize";
      const committed = await this.pendingCommit.finalize();
      if (!createdChangeSet.value) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Committed mutation is missing its authenticated change set."
        );
      }
      this.state = "finalized";
      try {
        const projected = this.project({ result: input.result, committed, changeSet: createdChangeSet.value }) as T;
        return attachPendingWorkspaceMutation(projected, this);
      } finally {
        wipeRollbackBlobs(this.changeSetInput);
        this.onSettled(this);
      }
    } catch (error) {
      if (this.state === "finalized") throw error;
      if (createdChangeSet.value) {
        try {
          this.changeSetStore.transition(
            createdChangeSet.value.workspaceStateKey,
            createdChangeSet.value.changeSetId,
            {
              expectedGeneration: createdChangeSet.value.generation,
              state: "recovery_required",
              updatedAt: validTimestamp(this.now)
            }
          );
        } catch {
          try {
            await this.proveRollback("change_set_reconciliation_failed");
          } catch {
            // The recovery-required result below is authoritative.
          }
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "Change-set publication could not be reconciled with transaction rollback."
          );
        }
      }
      await this.proveRollback(`${phase}_failed`);
      if (phase === "audit") {
        throw new AuditError(
          "AUDIT_UNAVAILABLE",
          "Audit completion failed and the transaction was rolled back."
        );
      }
      if (error instanceof TransactionError) throw error;
      throw new TransactionError("TRANSACTION_FAILED", "Workspace mutation commit failed.");
    }
  }

  async rollback(reason: string): Promise<void> {
    if (this.state === "finalized") {
      throw transactionFailure("A finalized workspace mutation cannot be rolled back.");
    }
    if (this.state === "rolled_back") return;
    await this.proveRollback(reason);
  }
}

export function attachPendingWorkspaceMutation<T extends object>(
  result: T,
  pending: PendingWorkspaceMutation
): T {
  Object.defineProperty(result, PENDING_WORKSPACE_MUTATION, {
    value: pending,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return result;
}

export function pendingWorkspaceMutation(value: unknown): PendingWorkspaceMutation | null {
  if (!value || typeof value !== "object") return null;
  const pending = (value as Record<symbol, unknown>)[PENDING_WORKSPACE_MUTATION];
  return pending && typeof pending === "object"
    ? pending as PendingWorkspaceMutation
    : null;
}

export class WorkspaceMutationRuntime {
  private readonly engine: WorkspaceMutationRuntimeOptions["engine"];
  private readonly changeSetStore: WorkspaceMutationRuntimeOptions["changeSetStore"];
  private readonly now: () => number;
  private readonly invocations = new AsyncLocalStorage<InvocationContext>();

  constructor(options: WorkspaceMutationRuntimeOptions) {
    this.engine = options.engine;
    this.changeSetStore = options.changeSetStore;
    this.now = options.now ?? Date.now;
  }

  async prepare<T extends object = Record<string, unknown>>(
    input: WorkspaceMutationPreparation<T>
  ): Promise<PendingWorkspaceMutation> {
    const prepared = await this.engine.prepare({
      ...input.transaction,
      requiredParticipants: ["audit", "change_set"]
    });
    let changeSetInput: CreateChangeSetInput | null = null;
    try {
      const identity = {
        transactionId: prepared.transactionId,
        changeSetId: prepared.changeSetId,
        workspaceStateKey: this.engine.workspaceStateKey(input.transaction.workspace.root)
      };
      changeSetInput = input.changeSet(identity);
      validateChangeSet(changeSetInput, identity, input.transaction.operations);
    } catch (error) {
      await prepared.rollback("change_set_preflight_failed");
      if (changeSetInput) wipeRollbackBlobs(changeSetInput);
      if (error instanceof TransactionError) throw error;
      throw transactionFailure("Change-set preparation failed.");
    }

    const context = this.invocations.getStore();
    const pending = new PendingWorkspaceMutationImpl(
      prepared,
      changeSetInput,
      this.changeSetStore,
      (input.project ?? preserveMutationResult) as unknown as (
        projection: MutationProjectionInput<object>
      ) => object,
      this.now,
      input.transaction.operations,
      (settled) => context?.pending.delete(settled)
    );
    context?.pending.add(pending);
    return pending;
  }

  async invokeProvider<T extends object>(input: MutationProviderInvocation<T>): Promise<T> {
    const context: InvocationContext = { pending: new Set() };
    return this.invocations.run(context, async () => {
      try {
        const result = await input.provider();
        const attached = pendingWorkspaceMutation(result);
        const requiresHandle = input.requiresMutation && (result as { isError?: boolean }).isError !== true;
        if (requiresHandle && (!attached || !context.pending.has(attached as PendingWorkspaceMutationImpl))) {
          await Promise.all([...context.pending].map((pending) => pending.rollback("missing_pending_handle")));
          throw transactionFailure("Atomic mutator returned without its server-owned pending handle.");
        }
        if (attached && !context.pending.has(attached as PendingWorkspaceMutationImpl)) {
          await Promise.all([...context.pending].map((pending) => pending.rollback("foreign_pending_handle")));
          throw transactionFailure("Atomic mutator returned a foreign pending handle.");
        }
        if (context.pending.size > (attached ? 1 : 0)) {
          await Promise.all([...context.pending].map((pending) => pending.rollback("ambiguous_pending_handles")));
          throw transactionFailure("Atomic mutator prepared an ambiguous mutation set.");
        }
        return result;
      } catch (error) {
        await Promise.all([...context.pending].map((pending) => pending.rollback("provider_failed")));
        throw error;
      }
    });
  }
}

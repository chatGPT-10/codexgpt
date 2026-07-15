import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import type { CodexProConfig } from "../config.js";
import type { PathGuard } from "../guard.js";
import { AtomicWorkspaceFs } from "./atomicFs.js";
import { TransactionManifestStore } from "./atomicStateFile.js";
import {
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot
} from "./installation.js";
import {
  ProcessInstanceRegistry,
  WorkspaceMutationLock,
  type WorkspaceLockHandle
} from "./workspaceLock.js";
import {
  TransactionError,
  type CommittedTransaction,
  type PendingTransactionCommit,
  type PreparedAtomicOperation,
  type PreparedTransaction,
  type TransactionFaultInjector,
  type TransactionManifestV1,
  type TransactionOperationKind,
  type TransactionOperationV1,
  type TransactionRequestOperationV1,
  type TransactionRequestV1
} from "./types.js";

const NO_FAULTS: TransactionFaultInjector = { hit() {} };

export interface TransactionRecoveryHook {
  ensureWorkspaceReady(canonicalRoot: string): void;
}

export interface AtomicTransactionEngineOptions {
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
  faultInjector?: TransactionFaultInjector;
  recoveryCoordinator?: TransactionRecoveryHook;
}

interface TransactionContext {
  manifest: TransactionManifestV1;
  prepared: PreparedAtomicOperation[];
  atomicFs: AtomicWorkspaceFs;
  lock: WorkspaceLockHandle;
  released: boolean;
  lifecycle: "prepared" | "pending" | "committed" | "rolled_back" | "recovery_required";
}

function exactSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toTransactionFailure(error: unknown, message: string): TransactionError {
  if (error instanceof TransactionError) return error;
  return new TransactionError("TRANSACTION_FAILED", message);
}

function participantFacts(names: readonly string[]): Record<string, "pending"> {
  return Object.fromEntries(names.map((name) => [name, "pending"])) as Record<string, "pending">;
}

function operationWithPlannedFacts(
  request: TransactionRequestOperationV1,
  inspected: Awaited<ReturnType<AtomicWorkspaceFs["inspect"]>>
): TransactionOperationV1 {
  if (request.kind === "create") {
    if (inspected.before.exists) {
      throw new TransactionError(
        "FILE_VERSION_CONFLICT",
        "A create target already exists.",
        { relativePath: inspected.relativePath }
      );
    }
    return {
      operationId: request.operationId,
      kind: "create",
      state: "planned",
      relativePath: inspected.relativePath,
      comparisonKey: inspected.comparisonKey,
      stageRelativePath: null,
      backupRelativePath: null,
      before: inspected.before,
      after: {
        exists: true,
        sha256: exactSha256(request.bytes),
        bytes: request.bytes.length
      }
    };
  }

  if (!inspected.before.exists) {
    throw new TransactionError(
      "FILE_VERSION_CONFLICT",
      "A required transaction target is absent.",
      { relativePath: inspected.relativePath }
    );
  }
  if (request.expectedSha256 !== null && request.expectedSha256 !== inspected.before.sha256) {
    throw new TransactionError(
      "FILE_VERSION_CONFLICT",
      "The expected file version does not match.",
      { relativePath: inspected.relativePath }
    );
  }
  if (request.kind === "replace") {
    return {
      operationId: request.operationId,
      kind: "replace",
      state: "planned",
      relativePath: inspected.relativePath,
      comparisonKey: inspected.comparisonKey,
      stageRelativePath: null,
      backupRelativePath: null,
      before: inspected.before,
      after: {
        exists: true,
        sha256: exactSha256(request.bytes),
        bytes: request.bytes.length
      }
    };
  }
  return {
    operationId: request.operationId,
    kind: "delete",
    state: "planned",
    relativePath: inspected.relativePath,
    comparisonKey: inspected.comparisonKey,
    stageRelativePath: null,
    backupRelativePath: null,
    before: inspected.before,
    after: { exists: false, sha256: null, bytes: 0, identity: null }
  };
}

export class AtomicTransactionEngine {
  private readonly store: TransactionManifestStore;
  private readonly locks: WorkspaceMutationLock;
  private readonly masterKey: Buffer;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly now: () => number;
  private readonly faults: TransactionFaultInjector;
  private readonly recovery?: TransactionRecoveryHook;

  constructor(
    private readonly config: Pick<CodexProConfig, "blockedGlobs" | "maxWriteBytes">,
    private readonly guard: PathGuard,
    private readonly stateRoot: string,
    registry: ProcessInstanceRegistry,
    options: AtomicTransactionEngineOptions = {}
  ) {
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.now = options.now ?? Date.now;
    this.faults = options.faultInjector ?? NO_FAULTS;
    this.recovery = options.recoveryCoordinator;
    this.store = new TransactionManifestStore(stateRoot);
    this.locks = new WorkspaceMutationLock(stateRoot, registry, {
      randomBytes: this.randomBytes,
      now: this.now
    });
    const installation = loadOrCreateInstallationState({ stateRoot });
    this.masterKey = installationMasterKey(installation);
  }

  workspaceStateKey(canonicalRoot: string): string {
    return workspaceStateKeyForRoot(canonicalRoot, this.masterKey);
  }

  private opaqueId(prefix: "tx" | "cs"): string {
    const bytes = this.randomBytes(16);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction ID source is invalid.");
    }
    return `${prefix}_${bytes.toString("hex")}`;
  }

  private timestamp(): string {
    const value = new Date(this.now()).toISOString();
    if (value === "Invalid Date") {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction clock is invalid.");
    }
    return value;
  }

  private validateRequest(request: TransactionRequestV1): void {
    if (!request.workspace?.root || !request.workspace?.id || !request.workspace?.openedAt) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction workspace is invalid.");
    }
    if (!Array.isArray(request.operations) || request.operations.length < 1 || request.operations.length > 1_000) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction operation count is invalid.");
    }
    const ids = request.operations.map((operation) => operation.operationId);
    if (new Set(ids).size !== ids.length) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction operation IDs are duplicate.");
    }
    for (const operation of request.operations) {
      if (!/^op_[a-z0-9][a-z0-9_-]{0,76}$/.test(operation.operationId)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction operation ID is invalid.");
      }
      if ((operation.kind === "create" || operation.kind === "replace") && !Buffer.isBuffer(operation.bytes)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction payload must be exact bytes.");
      }
      if ((operation.kind === "create" || operation.kind === "replace") && operation.bytes.length > this.config.maxWriteBytes) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction payload exceeds the byte limit.");
      }
    }
    if (!Array.isArray(request.requiredParticipants) || request.requiredParticipants.length > 32) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction participants are invalid.");
    }
    if (new Set(request.requiredParticipants).size !== request.requiredParticipants.length) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction participants are duplicate.");
    }
    for (const name of request.requiredParticipants) {
      if (!/^[a-z][a-z0-9._-]{0,63}$/.test(name)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction participant name is invalid.");
      }
    }
  }

  async prepare(request: TransactionRequestV1): Promise<PreparedTransaction> {
    this.validateRequest(request);
    this.recovery?.ensureWorkspaceReady(request.workspace.root);
    const atomicFs = new AtomicWorkspaceFs(this.config, this.guard, request.workspace);
    const inspected = await Promise.all(
      request.operations.map(async (operation) => ({
        request: operation,
        inspected: await atomicFs.inspect(operation.relativePath)
      }))
    );
    const planned = inspected.map(({ request: operation, inspected: facts }) => ({
      request: operation,
      operation: operationWithPlannedFacts(operation, facts)
    }));
    planned.sort((left, right) =>
      left.operation.comparisonKey.localeCompare(right.operation.comparisonKey) ||
      left.operation.operationId.localeCompare(right.operation.operationId)
    );
    const comparisonKeys = planned.map(({ operation }) => operation.comparisonKey);
    if (new Set(comparisonKeys).size !== comparisonKeys.length) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction paths are duplicate.");
    }

    const workspaceStateKey = this.workspaceStateKey(request.workspace.root);
    const transactionId = this.opaqueId("tx");
    const changeSetId = this.opaqueId("cs");
    const lock = this.locks.acquire({ workspaceStateKey, transactionId });
    const createdAt = this.timestamp();
    let manifest: TransactionManifestV1 | undefined;
    const prepared: PreparedAtomicOperation[] = [];
    let released = false;

    try {
      manifest = {
        schemaVersion: 1,
        transactionId,
        changeSetId,
        workspaceStateKey,
        generation: 1,
        createdAt,
        updatedAt: createdAt,
        state: "preparing",
        operations: planned.map(({ operation }) => operation),
        createdDirectories: [],
        requiredParticipants: [...request.requiredParticipants],
        participantFacts: participantFacts(request.requiredParticipants)
      };
      this.store.writeInitial(manifest);
      await this.faults.hit("after_manifest_preparing", { operationCount: planned.length });

      for (let index = 0; index < planned.length; index += 1) {
        const item = planned[index];
        let staged: PreparedAtomicOperation;
        if (item.request.kind === "create") {
          staged = await atomicFs.stageCreate(
            item.request.operationId,
            item.request.relativePath,
            item.request.bytes
          );
        } else if (item.request.kind === "replace") {
          staged = await atomicFs.stageReplace(
            item.request.operationId,
            item.request.relativePath,
            item.request.bytes,
            item.request.expectedSha256
          );
        } else {
          staged = await atomicFs.stageDelete(
            item.request.operationId,
            item.request.relativePath,
            item.request.expectedSha256
          );
        }
        prepared.push(staged);
        manifest = this.transition(manifest, {
          operations: this.replaceOperation(manifest.operations, staged.operation)
        });
        await this.faults.hit("after_each_stage", {
          operationId: staged.operation.operationId,
          index,
          operationCount: planned.length
        });
      }
      manifest = this.transition(manifest, { state: "prepared" });
      await this.faults.hit("after_manifest_prepared", { operationCount: prepared.length });
      const context: TransactionContext = {
        manifest,
        prepared,
        atomicFs,
        lock,
        released,
        lifecycle: "prepared"
      };
      return new PreparedTransactionImpl(this, context);
    } catch (error) {
      if (manifest) {
        const context: TransactionContext = {
          manifest,
          prepared,
          atomicFs,
          lock,
          released,
          lifecycle: "prepared"
        };
        try {
          await this.rollbackContext(context, "prepare_failed");
          released = context.released;
        } catch (rollbackError) {
          throw rollbackError;
        }
      }
      if (!released) {
        try {
          lock.release();
        } catch {
          // The original failure remains authoritative; lock evidence is retained.
        }
      }
      throw toTransactionFailure(error, "Transaction preparation failed.");
    }
  }

  private replaceOperation(
    operations: readonly TransactionOperationV1[],
    replacement: TransactionOperationV1
  ): TransactionOperationV1[] {
    return operations.map((operation) =>
      operation.operationId === replacement.operationId ? replacement : operation
    );
  }

  private transition(
    previous: TransactionManifestV1,
    patch: Partial<Omit<TransactionManifestV1, "schemaVersion" | "transactionId" | "changeSetId" | "workspaceStateKey" | "generation" | "createdAt">>
  ): TransactionManifestV1 {
    const next: TransactionManifestV1 = {
      ...previous,
      ...patch,
      generation: previous.generation + 1,
      updatedAt: this.timestamp()
    };
    this.store.writeNext(previous, next);
    return next;
  }

  private async commitContext(context: TransactionContext): Promise<PendingTransactionCommit> {
    if (context.lifecycle !== "prepared") {
      throw new TransactionError("TRANSACTION_FAILED", "Transaction is not in the prepared state.");
    }
    try {
      context.manifest = this.transition(context.manifest, { state: "committing" });
      await this.faults.hit("after_manifest_committing", {
        operationCount: context.prepared.length
      });
      const directories = new Map<string, string>();
      for (const prepared of context.prepared) {
        for (const directory of prepared.missingDirectories) {
          directories.set(directory.relativePath, directory.absPath);
        }
      }
      const orderedDirectories = [...directories.entries()].sort(([left], [right]) =>
        left.split("/").length - right.split("/").length || left.localeCompare(right)
      );
      for (let index = 0; index < orderedDirectories.length; index += 1) {
        const [relativePath, absPath] = orderedDirectories[index];
        try {
          await fsp.mkdir(absPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new TransactionError(
              "FILE_VERSION_CONFLICT",
              "A transaction directory appeared concurrently.",
              { relativePath }
            );
          }
          throw error;
        }
        context.manifest = this.transition(context.manifest, {
          createdDirectories: [...context.manifest.createdDirectories, relativePath]
        });
        await this.faults.hit("after_each_directory_create", {
          index,
          directoryCount: orderedDirectories.length
        });
      }
      for (let index = 0; index < context.prepared.length; index += 1) {
        const installed = await context.atomicFs.install(context.prepared[index]);
        context.prepared[index] = installed;
        context.manifest = this.transition(context.manifest, {
          operations: this.replaceOperation(context.manifest.operations, installed.operation)
        });
        await this.faults.hit("after_each_install", {
          operationId: installed.operation.operationId,
          index,
          operationCount: context.prepared.length
        });
      }
      context.manifest = this.transition(context.manifest, {
        state: "committed_pending_participants"
      });
      await this.faults.hit("after_manifest_pending_participants", {
        participantCount: context.manifest.requiredParticipants.length
      });
      context.lifecycle = "pending";
      return new PendingTransactionCommitImpl(this, context);
    } catch (error) {
      try {
        await this.rollbackContext(context, "commit_failed");
      } catch (rollbackError) {
        throw rollbackError;
      }
      throw toTransactionFailure(error, "Transaction commit failed.");
    }
  }

  private async participantContext(
    context: TransactionContext,
    name: string,
    action: () => Promise<void>
  ): Promise<void> {
    if (context.lifecycle !== "pending") {
      throw new TransactionError("TRANSACTION_FAILED", "Transaction is not awaiting participants.");
    }
    if (!context.manifest.requiredParticipants.includes(name)) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Unknown transaction participant.");
    }
    if (context.manifest.participantFacts[name] !== "pending") {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction participant already committed.");
    }
    try {
      await action();
      context.manifest = this.transition(context.manifest, {
        participantFacts: { ...context.manifest.participantFacts, [name]: "committed" }
      });
      await this.faults.hit("after_each_participant", {
        participantIndex: context.manifest.requiredParticipants.indexOf(name),
        participantCount: context.manifest.requiredParticipants.length
      });
    } catch (error) {
      context.manifest = this.transition(context.manifest, {
        participantFacts: { ...context.manifest.participantFacts, [name]: "failed" },
        failureCode: "TRANSACTION_FAILED",
        failureMessage: "A required transaction participant failed."
      });
      try {
        await this.rollbackContext(context, "participant_failed");
      } catch (rollbackError) {
        throw rollbackError;
      }
      throw toTransactionFailure(error, "A required transaction participant failed.");
    }
  }

  private async finalizeContext(context: TransactionContext): Promise<CommittedTransaction> {
    if (context.lifecycle !== "pending") {
      throw new TransactionError("TRANSACTION_FAILED", "Transaction state does not allow finalization.");
    }
    const pendingParticipant = context.manifest.requiredParticipants.find(
      (name) => context.manifest.participantFacts[name] !== "committed"
    );
    if (pendingParticipant) {
      throw new TransactionError(
        "TRANSACTION_PRECONDITION_FAILED",
        "A required transaction participant has not committed."
      );
    }

    context.manifest = this.transition(context.manifest, { state: "committed" });
    await this.faults.hit("after_manifest_committed", {
      operationCount: context.prepared.length
    });
    context.lifecycle = "committed";
    let cleanupPending = false;
    for (let index = 0; index < context.prepared.length; index += 1) {
      try {
        await this.faults.hit("during_each_finalize", {
          operationId: context.prepared[index].operation.operationId,
          index,
          operationCount: context.prepared.length
        });
        context.prepared[index] = await context.atomicFs.finalize(context.prepared[index]);
      } catch {
        cleanupPending = true;
      }
    }
    this.releaseContext(context);
    return {
      transactionId: context.manifest.transactionId,
      changeSetId: context.manifest.changeSetId,
      committedAt: context.manifest.updatedAt,
      operationCount: context.prepared.length,
      cleanupPending
    };
  }

  private async rollbackContext(context: TransactionContext, reason: string): Promise<void> {
    if (context.lifecycle === "committed") {
      throw new TransactionError("ROLLBACK_FAILED", "A committed transaction cannot be rolled back.");
    }
    if (context.lifecycle === "rolled_back") return;
    try {
      if (context.manifest.state !== "rolling_back") {
        context.manifest = this.transition(context.manifest, {
          state: "rolling_back",
          failureCode: context.manifest.failureCode ?? "TRANSACTION_FAILED",
          failureMessage: context.manifest.failureMessage ?? `Transaction rollback requested: ${reason}`
        });
      }
      for (let index = context.prepared.length - 1; index >= 0; index -= 1) {
        await this.faults.hit("during_each_rollback", {
          operationId: context.prepared[index].operation.operationId,
          index,
          operationCount: context.prepared.length
        });
        let current = await context.atomicFs.rollback(context.prepared[index]);
        context.prepared[index] = current;
        context.manifest = this.transition(context.manifest, {
          operations: this.replaceOperation(context.manifest.operations, current.operation)
        });
        current = await context.atomicFs.finalize(current);
        context.prepared[index] = current;
        context.manifest = this.transition(context.manifest, {
          operations: this.replaceOperation(context.manifest.operations, current.operation)
        });
      }
      for (let index = context.manifest.createdDirectories.length - 1; index >= 0; index -= 1) {
        const relativePath = context.manifest.createdDirectories[index];
        const expectedAbsPath = context.prepared
          .flatMap((prepared) => prepared.missingDirectories)
          .find((directory) => directory.relativePath === relativePath)?.absPath;
        if (!expectedAbsPath) {
          throw new TransactionError("ROLLBACK_FAILED", "Created-directory rollback evidence is invalid.");
        }
        try {
          await fsp.rmdir(expectedAbsPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      context.manifest = this.transition(context.manifest, { state: "rolled_back" });
      context.lifecycle = "rolled_back";
      this.releaseContext(context);
    } catch (error) {
      context.lifecycle = "recovery_required";
      try {
        context.manifest = this.transition(context.manifest, {
          state: "recovery_required",
          failureCode: "ROLLBACK_FAILED",
          failureMessage: "Transaction rollback could not be proven complete."
        });
      } catch {
        // Preserve the last valid manifest and all remaining evidence.
      }
      throw new TransactionError(
        "ROLLBACK_FAILED",
        "Transaction rollback could not be proven complete.",
        { transactionId: context.manifest.transactionId }
      );
    }
  }

  private releaseContext(context: TransactionContext): void {
    if (context.released) return;
    context.lock.release();
    context.released = true;
  }

  preparedCommit(context: TransactionContext): Promise<PendingTransactionCommit> {
    return this.commitContext(context);
  }

  preparedRollback(context: TransactionContext, reason: string): Promise<void> {
    return this.rollbackContext(context, reason);
  }

  participantCommit(
    context: TransactionContext,
    name: string,
    action: () => Promise<void>
  ): Promise<void> {
    return this.participantContext(context, name, action);
  }

  pendingFinalize(context: TransactionContext): Promise<CommittedTransaction> {
    return this.finalizeContext(context);
  }

  pendingRollback(context: TransactionContext, reason: string): Promise<void> {
    return this.rollbackContext(context, reason);
  }
}

class PreparedTransactionImpl implements PreparedTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;

  constructor(
    private readonly engine: AtomicTransactionEngine,
    private readonly context: TransactionContext
  ) {
    this.transactionId = context.manifest.transactionId;
    this.changeSetId = context.manifest.changeSetId;
  }

  commit(): Promise<PendingTransactionCommit> {
    return this.engine.preparedCommit(this.context);
  }

  rollback(reason: string): Promise<void> {
    return this.engine.preparedRollback(this.context, reason);
  }
}

class PendingTransactionCommitImpl implements PendingTransactionCommit {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds: readonly TransactionOperationKind[];

  constructor(
    private readonly engine: AtomicTransactionEngine,
    private readonly context: TransactionContext
  ) {
    this.transactionId = context.manifest.transactionId;
    this.changeSetId = context.manifest.changeSetId;
    this.operationCount = context.manifest.operations.length;
    this.mutationKinds = [...new Set(context.manifest.operations.map((operation) => operation.kind))];
  }

  commitParticipant(name: string, action: () => Promise<void>): Promise<void> {
    return this.engine.participantCommit(this.context, name, action);
  }

  finalize(): Promise<CommittedTransaction> {
    return this.engine.pendingFinalize(this.context);
  }

  rollback(reason: string): Promise<void> {
    return this.engine.pendingRollback(this.context, reason);
  }
}

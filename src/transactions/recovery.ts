import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import { PathGuard, type Workspace } from "../guard.js";
import { MoveRecoveryCoordinator } from "../moves/recovery.js";
import { TransactionManifestStore } from "./atomicStateFile.js";
import {
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot
} from "./installation.js";
import { resolveTransactionStateRoot } from "./stateRoot.js";
import {
  ProcessInstanceRegistry,
  WorkspaceMutationLock
} from "./workspaceLock.js";
import {
  TransactionError,
  type AfterFileFactV1,
  type BeforeFileFactV1,
  type ParticipantRecoveryAdapter,
  type ParticipantRecoveryProbeResult,
  type TransactionManifestState,
  type TransactionManifestV1,
  type TransactionOperationV1
} from "./types.js";

export type TransactionRecoveryAction =
  | "rollback_cleanup"
  | "restore_before_state"
  | "reconcile_participants"
  | "finish_cleanup"
  | "finish_rollback_cleanup";

export function recoveryActionForState(
  state: TransactionManifestState
): TransactionRecoveryAction {
  switch (state) {
    case "preparing":
    case "prepared":
      return "rollback_cleanup";
    case "committing":
    case "rolling_back":
    case "recovery_required":
      return "restore_before_state";
    case "committed_pending_participants":
      return "reconcile_participants";
    case "committed":
      return "finish_cleanup";
    case "rolled_back":
      return "finish_rollback_cleanup";
  }
}

export interface TransactionRecoveryCoordinatorOptions {
  stateRoot?: string;
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
  registry?: ProcessInstanceRegistry;
  participantAdapter?: ParticipantRecoveryAdapter;
}

interface CurrentFileFact {
  exists: boolean;
  sha256: string | null;
  identity: string | null;
  bytes: number;
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function identityForStat(stat: fs.BigIntStats): string {
  const payload = `${stat.dev.toString()}\0${stat.ino.toString()}\0${stat.size.toString()}\0${stat.mtimeNs.toString()}`;
  return `fid_${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24)}`;
}

function currentFileFact(file: string, maxBytes: number): CurrentFileFact {
  try {
    const stat = fs.lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovery encountered a non-ordinary file."
      );
    }
    if (stat.size > BigInt(maxBytes)) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovery evidence exceeds the configured byte limit."
      );
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== Number(stat.size)) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovery evidence changed during inspection."
      );
    }
    return {
      exists: true,
      sha256: hashBytes(bytes),
      identity: identityForStat(stat),
      bytes: bytes.length
    };
  } catch (error) {
    if (error instanceof TransactionError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, sha256: null, identity: null, bytes: 0 };
    }
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Recovery could not inspect workspace evidence."
    );
  }
}

function matchesBefore(current: CurrentFileFact, expected: BeforeFileFactV1): boolean {
  if (current.exists !== expected.exists) return false;
  if (!expected.exists) return true;
  return current.sha256 === expected.sha256 && current.identity === expected.identity;
}

function matchesAfter(current: CurrentFileFact, expected: AfterFileFactV1): boolean {
  if (current.exists !== expected.exists) return false;
  if (!expected.exists) return true;
  if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) return false;
  return !expected.identity || current.identity === expected.identity;
}

function isContainedPath(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateArtifactPath(
  workspaceRoot: string,
  targetAbsPath: string,
  relativePath: string | null,
  kind: "stage" | "backup",
  allowAncestor = false
): string | null {
  if (!relativePath) return null;
  const artifact = path.resolve(workspaceRoot, relativePath);
  const expected = kind === "stage"
    ? /^\.codexpro-txn-[a-f0-9]{16}\.stage$/
    : /^\.codexpro-txn-[a-f0-9]{16}\.backup$/;
  if (
    !isContainedPath(artifact, workspaceRoot) ||
    (path.dirname(artifact) !== path.dirname(targetAbsPath) &&
      !(allowAncestor && isContainedPath(path.dirname(targetAbsPath), path.dirname(artifact)))) ||
    !expected.test(path.basename(artifact))
  ) {
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Transaction artifact path cannot be proven safe."
    );
  }
  return artifact;
}

function requireArtifact(
  artifact: string | null,
  expected: BeforeFileFactV1 | AfterFileFactV1,
  maxBytes: number
): string {
  if (!artifact) {
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Required transaction recovery evidence is missing."
    );
  }
  const current = currentFileFact(artifact, maxBytes);
  const matches = "metadata" in expected
    ? matchesBefore(current, expected)
    : matchesAfter(current, expected);
  if (!matches) {
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Transaction recovery evidence does not match the manifest."
    );
  }
  return artifact;
}

function removeArtifactIfProven(
  artifact: string | null,
  expected: BeforeFileFactV1 | AfterFileFactV1,
  maxBytes: number
): void {
  if (!artifact) return;
  const current = currentFileFact(artifact, maxBytes);
  if (!current.exists) return;
  const matches = "metadata" in expected
    ? matchesBefore(current, expected)
    : matchesAfter(current, expected);
  if (!matches) {
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Transaction artifact cleanup cannot be proven safe."
    );
  }
  fs.unlinkSync(artifact);
}

function workspaceForRecovery(root: string): Workspace {
  return {
    id: "ws_recovery",
    root,
    openedAt: new Date(0).toISOString()
  };
}

export class TransactionRecoveryCoordinator {
  private readonly stateRoot: string;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly now: () => number;
  private readonly guard: PathGuard;
  private readonly frozen = new Map<string, TransactionError>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private registry?: ProcessInstanceRegistry;
  private ownsRegistry = false;
  private locks?: WorkspaceMutationLock;
  private store?: TransactionManifestStore;
  private moveRecovery?: MoveRecoveryCoordinator;
  private masterKey?: Buffer;
  private participantAdapter?: ParticipantRecoveryAdapter;

  constructor(
    private readonly config: Pick<CodexProConfig, "blockedGlobs" | "maxWriteBytes"> &
      Partial<Pick<CodexProConfig, "moveMaxFileBytes">>,
    options: TransactionRecoveryCoordinatorOptions = {}
  ) {
    this.stateRoot = options.stateRoot ?? resolveTransactionStateRoot();
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.now = options.now ?? Date.now;
    this.registry = options.registry;
    this.participantAdapter = options.participantAdapter;
    this.guard = new PathGuard(config);
  }

  setParticipantAdapter(adapter: ParticipantRecoveryAdapter): void {
    this.participantAdapter = adapter;
    this.moveRecovery?.setParticipantAdapter(adapter);
  }

  private initialize(): void {
    if (this.registry && this.locks && this.store && this.moveRecovery && this.masterKey) return;
    const installation = loadOrCreateInstallationState({ stateRoot: this.stateRoot });
    this.masterKey = installationMasterKey(installation);
    if (!this.registry) {
      this.registry = new ProcessInstanceRegistry(this.stateRoot, {
        randomBytes: this.randomBytes,
        now: this.now
      });
      this.ownsRegistry = true;
    }
    this.locks = new WorkspaceMutationLock(this.stateRoot, this.registry, {
      randomBytes: this.randomBytes,
      now: this.now
    });
    this.store = new TransactionManifestStore(this.stateRoot);
    this.moveRecovery?.dispose();
    this.moveRecovery = new MoveRecoveryCoordinator({
      blockedGlobs: this.config.blockedGlobs,
      moveMaxFileBytes: this.config.moveMaxFileBytes ?? 64 * 1024 * 1024
    }, {
      stateRoot: this.stateRoot,
      masterKey: this.masterKey,
      participantAdapter: this.participantAdapter,
      now: this.now
    });
  }

  ensureWorkspaceReady(canonicalRoot: string): Promise<void> {
    const root = path.resolve(canonicalRoot);
    const existingFailure = this.frozen.get(root);
    if (existingFailure) return Promise.reject(existingFailure);
    const existing = this.inFlight.get(root);
    if (existing) return existing;

    let pending!: Promise<void>;
    pending = Promise.resolve()
      .then(() => this.recoverWorkspace(root))
      .finally(() => {
        if (this.inFlight.get(root) === pending) this.inFlight.delete(root);
      });
    this.inFlight.set(root, pending);
    return pending;
  }

  private async recoverWorkspace(root: string): Promise<void> {
    const existingFailure = this.frozen.get(root);
    if (existingFailure) throw existingFailure;
    this.initialize();
    const actualRoot = fs.realpathSync.native(root);
    if (actualRoot !== root) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Workspace root is not canonical for transaction recovery."
      );
    }
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Transaction recovery requires an ordinary workspace directory."
      );
    }
    const workspaceStateKey = workspaceStateKeyForRoot(root, this.masterKey!);
    const recoveryIdBytes = this.randomBytes(16);
    if (recoveryIdBytes.length !== 16) {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Recovery transaction ID source is invalid."
      );
    }
    const lock = this.locks!.acquire({
      workspaceStateKey,
      transactionId: `tx_${recoveryIdBytes.toString("hex")}`
    });
    try {
      const manifests = this.store!.list(workspaceStateKey).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.transactionId.localeCompare(right.transactionId)
      );
      for (const manifest of manifests) {
        await this.recoverManifest(root, manifest);
      }
      await this.moveRecovery!.recoverWorkspace(root, workspaceStateKey);
    } catch (error) {
      const failure = error instanceof TransactionError && error.code === "TRANSACTION_RECOVERY_REQUIRED"
        ? error
        : new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "Workspace transaction recovery could not be proven complete."
          );
      this.frozen.set(root, failure);
      throw failure;
    } finally {
      try {
        lock.release();
      } catch {
        const failure = new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Workspace recovery lock ownership could not be released safely."
        );
        this.frozen.set(root, failure);
        throw failure;
      }
    }
  }

  private targetAndArtifacts(
    workspaceRoot: string,
    operation: TransactionOperationV1
  ): { target: string; stage: string | null; backup: string | null } {
    let resolved;
    try {
      resolved = this.guard.resolvePolicyFacts(
        workspaceForRecovery(workspaceRoot),
        operation.relativePath,
        { forWrite: true }
      );
    } catch {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovery path no longer satisfies workspace policy."
      );
    }
    if (resolved.comparisonKey !== operation.comparisonKey) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovery path comparison facts no longer match."
      );
    }
    return {
      target: resolved.absPath,
      stage: validateArtifactPath(
        workspaceRoot,
        resolved.absPath,
        operation.stageRelativePath,
        "stage",
        operation.kind === "create"
      ),
      backup: validateArtifactPath(
        workspaceRoot,
        resolved.absPath,
        operation.backupRelativePath,
        "backup"
      )
    };
  }

  private restoreOperation(workspaceRoot: string, operation: TransactionOperationV1): void {
    const { target, stage, backup } = this.targetAndArtifacts(workspaceRoot, operation);
    const current = currentFileFact(target, this.config.maxWriteBytes);
    if (operation.kind === "create") {
      if (matchesBefore(current, operation.before)) {
        // The create was never installed.
      } else if (matchesAfter(current, operation.after)) {
        fs.unlinkSync(target);
      } else {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Create rollback found an unexpected target occupant."
        );
      }
      removeArtifactIfProven(stage, operation.after, this.config.maxWriteBytes);
      return;
    }

    if (operation.kind === "replace") {
      if (!matchesBefore(current, operation.before)) {
        const oldArtifact = requireArtifact(backup, operation.before, this.config.maxWriteBytes);
        if (matchesAfter(current, operation.after)) {
          fs.renameSync(oldArtifact, target);
        } else if (!current.exists) {
          fs.linkSync(oldArtifact, target);
        } else {
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "Replacement rollback found an unexpected target occupant."
          );
        }
      }
      removeArtifactIfProven(stage, operation.after, this.config.maxWriteBytes);
      removeArtifactIfProven(backup, operation.before, this.config.maxWriteBytes);
      return;
    }

    if (!matchesBefore(current, operation.before)) {
      if (current.exists) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Delete rollback found an unexpected target occupant."
        );
      }
      const oldArtifact = requireArtifact(backup, operation.before, this.config.maxWriteBytes);
      try {
        fs.linkSync(oldArtifact, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "Delete rollback refused to replace an external occupant."
          );
        }
        throw error;
      }
    }
    removeArtifactIfProven(backup, operation.before, this.config.maxWriteBytes);
  }

  private verifyBeforeState(workspaceRoot: string, operation: TransactionOperationV1): void {
    const { target } = this.targetAndArtifacts(workspaceRoot, operation);
    if (!matchesBefore(currentFileFact(target, this.config.maxWriteBytes), operation.before)) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Recovered before-state could not be verified."
      );
    }
  }

  private verifyCommittedState(workspaceRoot: string, operation: TransactionOperationV1): void {
    const { stage, backup } = this.targetAndArtifacts(workspaceRoot, operation);
    // A committed transaction is historical and cannot be rolled back. Its target may
    // legitimately have been changed by a later transaction; only leftover artifacts
    // remain in this recovery domain and each is authenticated against signed facts.
    removeArtifactIfProven(stage, operation.after, this.config.maxWriteBytes);
    removeArtifactIfProven(backup, operation.before, this.config.maxWriteBytes);
  }

  private removeCreatedDirectories(workspaceRoot: string, directories: readonly string[]): void {
    const ordered = [...directories].sort((left, right) => right.length - left.length);
    for (const relative of ordered) {
      const directory = path.resolve(workspaceRoot, relative);
      if (!isContainedPath(directory, workspaceRoot) || directory === workspaceRoot) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Created-directory recovery path is invalid."
        );
      }
      try {
        fs.rmdirSync(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY") {
          throw new TransactionError(
            "TRANSACTION_RECOVERY_REQUIRED",
            "A transaction-created directory is no longer empty."
          );
        }
        throw error;
      }
    }
  }

  private transition(
    previous: TransactionManifestV1,
    patch: Partial<TransactionManifestV1>
  ): TransactionManifestV1 {
    const next: TransactionManifestV1 = {
      ...previous,
      ...patch,
      generation: previous.generation + 1,
      updatedAt: new Date(this.now()).toISOString()
    };
    this.store!.writeNext(previous, next);
    return next;
  }

  private async reconcileParticipants(
    manifest: TransactionManifestV1
  ): Promise<{ manifest: TransactionManifestV1; decision: "commit" | "rollback" }> {
    if (manifest.requiredParticipants.length === 0) {
      const committed = this.transition(manifest, { state: "committed" });
      return { manifest: committed, decision: "commit" };
    }
    if (!this.participantAdapter) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Participant recovery evidence is unavailable."
      );
    }
    const results = new Map<string, ParticipantRecoveryProbeResult>();
    for (const participant of manifest.requiredParticipants) {
      const result = manifest.participantFacts[participant] === "committed"
        ? "present"
        : await this.participantAdapter.probe(manifest, participant);
      if (result === "unknown") {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Participant recovery evidence is ambiguous."
        );
      }
      results.set(participant, result);
    }
    const present = manifest.requiredParticipants.filter((name) => results.get(name) === "present");
    if (present.length === manifest.requiredParticipants.length) {
      const committed = this.transition(manifest, {
        state: "committed",
        participantFacts: Object.fromEntries(
          manifest.requiredParticipants.map((name) => [name, "committed"])
        )
      });
      return { manifest: committed, decision: "commit" };
    }
    if (present.length > 0) {
      if (!this.participantAdapter.compensatePartial) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Partial participant effects cannot be compensated."
        );
      }
      await this.participantAdapter.compensatePartial(manifest, present);
    }
    const reconciled = this.transition(manifest, {
      participantFacts: Object.fromEntries(
        manifest.requiredParticipants.map((name) => [
          name,
          results.get(name) === "present" ? "committed" : "failed"
        ])
      ),
      failureCode: "TRANSACTION_FAILED",
      failureMessage: present.length > 0
        ? "Partial participant effects were compensated during recovery."
        : "No required participant effect was durable during recovery."
    });
    return { manifest: reconciled, decision: "rollback" };
  }

  private async recoverManifest(workspaceRoot: string, initial: TransactionManifestV1): Promise<void> {
    let manifest = initial;
    const action = recoveryActionForState(manifest.state);
    try {
      if (action === "reconcile_participants") {
        const reconciled = await this.reconcileParticipants(manifest);
        manifest = reconciled.manifest;
        if (reconciled.decision === "commit") {
          for (const operation of manifest.operations) {
            this.verifyCommittedState(workspaceRoot, operation);
          }
          await this.participantAdapter?.recordRecovery?.(
            manifest,
            "cleanup_completed",
            "COMMIT_RECOVERY_COMPLETED"
          );
          return;
        }
      }
      if (action === "finish_cleanup") {
        for (const operation of manifest.operations) {
          this.verifyCommittedState(workspaceRoot, operation);
        }
        await this.participantAdapter?.recordRecovery?.(
          manifest,
          "cleanup_completed",
          "COMMIT_CLEANUP_COMPLETED"
        );
        return;
      }
      if (action === "finish_rollback_cleanup") {
        for (const operation of manifest.operations) {
          this.verifyBeforeState(workspaceRoot, operation);
          const { stage, backup } = this.targetAndArtifacts(workspaceRoot, operation);
          removeArtifactIfProven(stage, operation.after, this.config.maxWriteBytes);
          removeArtifactIfProven(backup, operation.before, this.config.maxWriteBytes);
        }
        this.removeCreatedDirectories(workspaceRoot, manifest.createdDirectories);
        await this.participantAdapter?.recordRecovery?.(
          manifest,
          "rollback_completed",
          "ROLLBACK_CLEANUP_COMPLETED"
        );
        return;
      }

      if (manifest.state !== "rolling_back") {
        manifest = this.transition(manifest, {
          state: "rolling_back",
          failureCode: manifest.failureCode ?? "TRANSACTION_FAILED",
          failureMessage: manifest.failureMessage ?? "Transaction interrupted before completion."
        });
      }
      for (let index = manifest.operations.length - 1; index >= 0; index -= 1) {
        this.restoreOperation(workspaceRoot, manifest.operations[index]);
      }
      for (const operation of manifest.operations) {
        this.verifyBeforeState(workspaceRoot, operation);
      }
      this.removeCreatedDirectories(workspaceRoot, manifest.createdDirectories);
      manifest = this.transition(manifest, { state: "rolled_back" });
      await this.participantAdapter?.recordRecovery?.(
        manifest,
        "rollback_completed",
        "ROLLBACK_RECOVERY_COMPLETED"
      );
    } catch (error) {
      if (initial.state !== "committed") {
        try {
          manifest = this.transition(manifest, {
            state: "recovery_required",
            failureCode: "TRANSACTION_RECOVERY_REQUIRED",
            failureMessage: "Workspace transaction recovery requires manual evidence review."
          });
          try {
            await this.participantAdapter?.recordRecovery?.(
              manifest,
              "workspace_frozen",
              "RECOVERY_EVIDENCE_AMBIGUOUS"
            );
          } catch {
            // The authenticated manifest remains the primary freeze evidence.
          }
        } catch {
          // Keep the last valid manifest and every remaining artifact.
        }
      }
      if (error instanceof TransactionError && error.code === "TRANSACTION_RECOVERY_REQUIRED") {
        throw error;
      }
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Workspace transaction recovery could not be proven complete.",
        { transactionId: initial.transactionId }
      );
    }
  }

  dispose(): void {
    if (this.ownsRegistry) this.registry?.dispose();
    this.moveRecovery?.dispose();
    this.masterKey?.fill(0);
    this.registry = undefined;
    this.ownsRegistry = false;
    this.locks = undefined;
    this.store = undefined;
    this.moveRecovery = undefined;
    this.masterKey = undefined;
  }
}

export function createDefaultTransactionRecoveryCoordinator(
  config: Pick<CodexProConfig, "blockedGlobs" | "maxWriteBytes"> &
    Partial<Pick<CodexProConfig, "moveMaxFileBytes">>,
  options: TransactionRecoveryCoordinatorOptions = {}
): TransactionRecoveryCoordinator {
  return new TransactionRecoveryCoordinator(config, options);
}

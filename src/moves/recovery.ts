import path from "node:path";
import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import fsp from "node:fs/promises";
import { PathGuard, type Workspace } from "../guard.js";
import { TransactionManifestV2Store } from "../transactions/manifestV2Store.js";
import {
  TransactionError,
  type FileObjectIdentityV2,
  type MoveTransactionOperationV2,
  type ParticipantRecoveryAdapter,
  type ParticipantRecoveryProbeResult,
  type TransactionManifestV2
} from "../transactions/types.js";

export interface MoveRecoveryConfig {
  blockedGlobs: string[];
  moveMaxFileBytes: number;
}

export interface MoveRecoveryOptions {
  stateRoot: string;
  masterKey: Buffer;
  participantAdapter?: ParticipantRecoveryAdapter;
  now?: () => number;
}

function contained(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWorkspacePath(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery path evidence is invalid.");
  }
  const absolute = path.resolve(root, relativePath);
  if (!contained(absolute, root) || absolute === root) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery path escaped the workspace.");
  }
  return absolute;
}

function resolveWorkspaceParent(root: string, relativePath: string): string {
  if (relativePath === ".") return root;
  return resolveWorkspacePath(root, relativePath);
}

function workspaceForRecovery(root: string): Workspace {
  return { id: "ws_move_recovery", root, openedAt: new Date(0).toISOString() };
}

function stagePath(root: string, operation: MoveTransactionOperationV2): string {
  const absolute = resolveWorkspacePath(root, operation.stageRelativePath);
  const source = resolveWorkspacePath(root, operation.sourceRelativePath);
  if (
    path.dirname(absolute) !== path.dirname(source) ||
    !/^\.codexgpt-txn-[a-f0-9]{16}\.move$/.test(path.basename(absolute))
  ) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery artifact path is invalid.");
  }
  return absolute;
}

function identityFromStat(stat: BigIntStats): FileObjectIdentityV2 {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev <= 0n || stat.ino <= 0n) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery found an unsupported file object.");
  }
  return { device: String(stat.dev), fileId: String(stat.ino) };
}

function directoryIdentityFromStat(stat: BigIntStats): FileObjectIdentityV2 {
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev <= 0n || stat.ino <= 0n) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery found an unsupported directory object.");
  }
  return { device: String(stat.dev), fileId: String(stat.ino) };
}

function sameIdentity(left: FileObjectIdentityV2, right: FileObjectIdentityV2): boolean {
  return left.device === right.device && left.fileId === right.fileId;
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fsp.lstat(file, { bigint: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery could not inspect a path.");
  }
}

async function currentIdentity(file: string): Promise<FileObjectIdentityV2 | null> {
  try {
    return identityFromStat(await fsp.lstat(file, { bigint: true }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof TransactionError) throw error;
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery could not inspect a file object.");
  }
}

async function requireIdentity(file: string, expected: FileObjectIdentityV2): Promise<void> {
  const actual = await currentIdentity(file);
  if (!actual || !sameIdentity(actual, expected)) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery object identity did not match.");
  }
}

async function hashFile(file: string, expectedBytes: number, maxBytes: number): Promise<string> {
  if (expectedBytes > maxBytes) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery evidence exceeds the configured limit.");
  }
  const handle = await fsp.open(file, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(expectedBytes)) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery size evidence did not match.");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < expectedBytes) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, expectedBytes - position),
        position
      );
      if (bytesRead <= 0) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery content changed during inspection.");
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const extra = await handle.read(Buffer.allocUnsafe(1), 0, 1, position);
    const after = await handle.stat({ bigint: true });
    if (
      extra.bytesRead !== 0 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery content was not stable.");
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function requireContent(
  file: string,
  operation: MoveTransactionOperationV2,
  maxBytes: number
): Promise<void> {
  await requireIdentity(file, operation.objectIdentity);
  if (await hashFile(file, operation.version.bytes, maxBytes) !== operation.version.sha256) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery content hash did not match.");
  }
}

async function exactWindowsSpelling(file: string): Promise<void> {
  if (process.platform !== "win32") return;
  const names = await fsp.readdir(path.dirname(file));
  if (!names.includes(path.basename(file))) {
    throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery entry spelling was not exact.");
  }
}

export class MoveRecoveryCoordinator {
  private readonly store: TransactionManifestV2Store;
  private readonly guard: PathGuard;
  private readonly now: () => number;

  constructor(
    private readonly config: MoveRecoveryConfig,
    private readonly options: MoveRecoveryOptions
  ) {
    this.store = new TransactionManifestV2Store(options.stateRoot, options.masterKey);
    this.guard = new PathGuard(config);
    this.now = options.now ?? Date.now;
  }

  dispose(): void {
    this.store.dispose();
  }

  setParticipantAdapter(adapter: ParticipantRecoveryAdapter): void {
    this.options.participantAdapter = adapter;
  }

  private transition(
    previous: TransactionManifestV2,
    patch: Partial<Omit<TransactionManifestV2,
      "schemaVersion" | "transactionId" | "changeSetId" | "workspaceStateKey" |
      "generation" | "createdAt" | "manifestMac">>
  ): TransactionManifestV2 {
    const { manifestMac: _ignored, ...facts } = previous;
    const next = {
      ...facts,
      ...patch,
      generation: previous.generation + 1,
      updatedAt: new Date(this.now()).toISOString()
    };
    this.store.writeNext(previous, next);
    return this.store.read(previous.workspaceStateKey, previous.transactionId);
  }

  private source(root: string, operation: MoveTransactionOperationV2): string {
    return resolveWorkspacePath(root, operation.sourceRelativePath);
  }

  private destination(root: string, operation: MoveTransactionOperationV2): string {
    return resolveWorkspacePath(root, operation.destinationRelativePath);
  }

  private policyFacts(root: string, relativePath: string) {
    try {
      return this.guard.resolvePolicyFacts(workspaceForRecovery(root), relativePath, { forWrite: true });
    } catch {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery path no longer satisfies workspace policy.");
    }
  }

  private async requireCanonicalDirectory(
    root: string,
    absolute: string,
    expectedIdentity?: FileObjectIdentityV2
  ): Promise<void> {
    const stat = await fsp.lstat(absolute, { bigint: true }).catch(() => {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery directory evidence is unavailable.");
    });
    const actualIdentity = directoryIdentityFromStat(stat);
    if (expectedIdentity && !sameIdentity(actualIdentity, expectedIdentity)) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery directory identity changed.");
    }
    const real = await fsp.realpath(absolute).catch(() => {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery directory canonical path is unavailable.");
    });
    if (path.resolve(real) !== path.resolve(absolute) || !contained(real, root)) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery directory resolves through a link or reparse point.");
    }
  }

  private async assertSourceNamespace(
    root: string,
    operation: MoveTransactionOperationV2,
    relativePath: string,
    comparisonKey?: string
  ): Promise<void> {
    const expectedAbsolute = resolveWorkspacePath(root, relativePath);
    const facts = this.policyFacts(root, relativePath);
    const expectedParent = resolveWorkspaceParent(root, operation.sourceExistingParentRelativePath);
    if (
      path.resolve(facts.absPath) !== expectedAbsolute ||
      (comparisonKey !== undefined && facts.comparisonKey !== comparisonKey) ||
      path.resolve(facts.existingParent) !== expectedParent ||
      facts.existingParentIdentity !== operation.sourceExistingParentIdentity
    ) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery source namespace changed.");
    }
    await this.requireCanonicalDirectory(root, expectedParent);
  }

  private async assertStageNamespace(root: string, operation: MoveTransactionOperationV2): Promise<boolean> {
    const stage = stagePath(root, operation);
    const expectedParent = resolveWorkspaceParent(root, operation.sourceExistingParentRelativePath);
    if (path.dirname(stage) !== expectedParent) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery stage parent changed.");
    }
    if (operation.sourceExistingParentRelativePath !== ".") {
      const facts = this.policyFacts(root, operation.sourceExistingParentRelativePath);
      if (path.resolve(facts.absPath) !== expectedParent) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery stage parent path changed.");
      }
      if (!facts.targetExists) return false;
    }
    await this.requireCanonicalDirectory(root, expectedParent);
    return true;
  }

  private async assertDestinationNamespace(
    root: string,
    manifest: TransactionManifestV2,
    operation: MoveTransactionOperationV2
  ): Promise<void> {
    const expectedAbsolute = this.destination(root, operation);
    const facts = this.policyFacts(root, operation.destinationRelativePath);
    if (path.resolve(facts.absPath) !== expectedAbsolute || facts.comparisonKey !== operation.destinationComparisonKey) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery destination namespace changed.");
    }
    const existingParentRelative = path.relative(root, facts.existingParent).replaceAll("\\", "/") || ".";
    const createdIdentity = manifest.createdDirectoryIdentities[existingParentRelative];
    if (createdIdentity) {
      await this.requireCanonicalDirectory(root, facts.existingParent, createdIdentity);
      return;
    }
    if (manifest.plannedCreatedDirectories.includes(existingParentRelative)) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery found an unjournaled destination parent.");
    }
    const expectedParent = resolveWorkspaceParent(root, operation.destinationExistingParentRelativePath);
    if (
      path.resolve(facts.existingParent) !== expectedParent ||
      facts.existingParentIdentity !== operation.destinationExistingParentIdentity
    ) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery destination existing parent changed.");
    }
    await this.requireCanonicalDirectory(root, expectedParent);
  }

  private async cleanupStage(root: string, operation: MoveTransactionOperationV2): Promise<void> {
    const stage = stagePath(root, operation);
    if (!await this.assertStageNamespace(root, operation)) return;
    const actual = await currentIdentity(stage);
    if (!actual) return;
    if (!sameIdentity(actual, operation.objectIdentity)) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move recovery stage identity was ambiguous.");
    }
    await fsp.unlink(stage);
  }

  private async completePlannedDirectoryRemovals(
    root: string,
    initial: TransactionManifestV2
  ): Promise<TransactionManifestV2> {
    let manifest = initial;
    for (const relativePath of manifest.plannedRemovedDirectories) {
      const expectedIdentity = manifest.plannedRemovedDirectoryIdentities[relativePath];
      if (!expectedIdentity) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move cleanup directory identity evidence is missing.");
      }
      const directory = resolveWorkspacePath(root, relativePath);
      const facts = this.policyFacts(root, relativePath);
      if (path.resolve(facts.absPath) !== directory) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move cleanup directory path identity changed.");
      }
      if (facts.targetExists) {
        await this.requireCanonicalDirectory(root, directory, expectedIdentity);
        if ((await fsp.readdir(directory)).length !== 0) {
          throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move cleanup directory is no longer empty.");
        }
        await fsp.rmdir(directory);
      }
      if (!manifest.removedDirectories.includes(relativePath)) {
        manifest = this.transition(manifest, {
          removedDirectories: [...manifest.removedDirectories, relativePath]
        });
      }
    }
    return manifest;
  }

  private async requirePlannedDirectoriesAbsent(root: string, manifest: TransactionManifestV2): Promise<void> {
    for (const relativePath of manifest.plannedRemovedDirectories) {
      if (await pathExists(resolveWorkspacePath(root, relativePath))) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Committed move cleanup directory still exists.");
      }
    }
  }

  private async finishCommitted(root: string, initial: TransactionManifestV2): Promise<TransactionManifestV2> {
    let manifest = initial;
    if (manifest.state !== "committed") {
      for (const operation of manifest.operations) {
        await this.assertDestinationNamespace(root, manifest, operation);
        await requireContent(this.destination(root, operation), operation, this.config.moveMaxFileBytes);
        await exactWindowsSpelling(this.destination(root, operation));
      }
      if (manifest.state !== "commit_decided") {
        manifest = this.transition(manifest, { state: "commit_decided" });
      }
      manifest = await this.completePlannedDirectoryRemovals(root, manifest);
      manifest = this.transition(manifest, {
        state: "committed",
        operations: manifest.operations.map((operation) => ({ ...operation, state: "finalized" }))
      });
    } else {
      await this.requirePlannedDirectoriesAbsent(root, manifest);
    }
    for (const operation of manifest.operations) await this.cleanupStage(root, operation);
    return manifest;
  }

  private async reconcileParticipants(
    manifest: TransactionManifestV2
  ): Promise<{ manifest: TransactionManifestV2; decision: "commit" | "rollback" }> {
    if (manifest.requiredParticipants.length === 0) {
      return { manifest, decision: "commit" };
    }
    const adapter = this.options.participantAdapter;
    if (!adapter) {
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move participant recovery evidence is unavailable.");
    }
    const results = new Map<string, ParticipantRecoveryProbeResult>();
    for (const participant of manifest.requiredParticipants) {
      const result = manifest.participantFacts[participant] === "committed"
        ? "present"
        : await adapter.probe(manifest, participant);
      if (result === "unknown") {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move participant recovery evidence is ambiguous.");
      }
      results.set(participant, result);
    }
    const present = manifest.requiredParticipants.filter((name) => results.get(name) === "present");
    if (present.length === manifest.requiredParticipants.length) {
      manifest = this.transition(manifest, {
        participantFacts: Object.fromEntries(manifest.requiredParticipants.map((name) => [name, "committed"]))
      });
      return { manifest, decision: "commit" };
    }
    if (present.length > 0) {
      if (!adapter.compensatePartial) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move participant effects cannot be compensated.");
      }
      await adapter.compensatePartial(manifest, present);
    }
    manifest = this.transition(manifest, {
      participantFacts: Object.fromEntries(manifest.requiredParticipants.map((name) => [
        name,
        results.get(name) === "present" ? "committed" : "failed"
      ])),
      failureCode: "TRANSACTION_FAILED",
      failureMessage: present.length > 0
        ? "Partial move participant effects were compensated during recovery."
        : "No move participant effect was durable during recovery."
    });
    return { manifest, decision: "rollback" };
  }

  private async ensureRollbackStages(root: string, manifest: TransactionManifestV2): Promise<void> {
    for (const operation of manifest.operations) {
      const stage = stagePath(root, operation);
      if (!await this.assertStageNamespace(root, operation)) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback stage parent is missing.");
      }
      const stageIdentity = await currentIdentity(stage);
      if (stageIdentity) {
        if (!sameIdentity(stageIdentity, operation.objectIdentity)) {
          throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback stage contains an unrelated object.");
        }
        continue;
      }
      const source = this.source(root, operation);
      await this.assertSourceNamespace(root, operation, operation.sourceRelativePath, operation.sourceComparisonKey);
      const sourceIdentity = await currentIdentity(source);
      if (sourceIdentity && sameIdentity(sourceIdentity, operation.objectIdentity)) {
        continue;
      }
      const destination = this.destination(root, operation);
      await this.assertDestinationNamespace(root, manifest, operation);
      const destinationIdentity = await currentIdentity(destination);
      if (!destinationIdentity || !sameIdentity(destinationIdentity, operation.objectIdentity)) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback has no authenticated object link.");
      }
      await fsp.link(destination, stage);
      await requireIdentity(stage, operation.objectIdentity);
    }
  }

  private async removeInstalledDestinations(root: string, manifest: TransactionManifestV2): Promise<void> {
    const sourceIdentities = new Map(
      manifest.operations.map((operation) => [operation.sourceComparisonKey, operation.objectIdentity])
    );
    for (const operation of manifest.operations) {
      const destination = this.destination(root, operation);
      await this.assertDestinationNamespace(root, manifest, operation);
      const actual = await currentIdentity(destination);
      if (!actual) continue;
      if (sameIdentity(actual, operation.objectIdentity)) {
        await fsp.unlink(destination);
        continue;
      }
      const sourceIdentity = sourceIdentities.get(operation.destinationComparisonKey);
      if (sourceIdentity && sameIdentity(actual, sourceIdentity)) continue;
      if (["planned", "staged_link_ready", "source_name_removed"].includes(operation.state)) {
        continue;
      }
      throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback destination contains an unrelated object.");
    }
  }

  private async restoreSources(root: string, manifest: TransactionManifestV2): Promise<void> {
    for (const operation of manifest.operations) {
      const source = this.source(root, operation);
      await this.assertSourceNamespace(root, operation, operation.sourceRelativePath, operation.sourceComparisonKey);
      const actual = await currentIdentity(source);
      if (actual) {
        if (!sameIdentity(actual, operation.objectIdentity)) {
          throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback source contains an unrelated object.");
        }
      } else {
        const stage = stagePath(root, operation);
        if (!await this.assertStageNamespace(root, operation)) {
          throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move rollback stage parent is missing.");
        }
        await requireIdentity(stage, operation.objectIdentity);
        await fsp.link(stage, source);
        await exactWindowsSpelling(source);
      }
      await requireContent(source, operation, this.config.moveMaxFileBytes);
    }
  }

  private async removeCreatedDirectories(root: string, manifest: TransactionManifestV2): Promise<void> {
    const directories = [...manifest.createdDirectories].sort((left, right) =>
      right.split("/").length - left.split("/").length || right.localeCompare(left)
    );
    for (const relative of directories) {
      const expectedIdentity = manifest.createdDirectoryIdentities[relative];
      if (!expectedIdentity) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move-created directory identity evidence is missing.");
      }
      const directory = resolveWorkspacePath(root, relative);
      const facts = this.policyFacts(root, relative);
      if (path.resolve(facts.absPath) !== directory) {
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move-created directory path identity changed.");
      }
      if (!facts.targetExists) continue;
      try {
        await this.requireCanonicalDirectory(root, directory, expectedIdentity);
        if ((await fsp.readdir(directory)).length !== 0) {
          throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move-created directory is no longer empty.");
        }
        await fsp.rmdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        if (error instanceof TransactionError) throw error;
        throw new TransactionError("TRANSACTION_RECOVERY_REQUIRED", "Move-created directory could not be safely removed.");
      }
    }
    for (const relative of manifest.plannedCreatedDirectories) {
      if (manifest.createdDirectories.includes(relative)) continue;
      if (await pathExists(resolveWorkspacePath(root, relative))) {
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "An unjournaled planned move directory requires evidence review."
        );
      }
    }
  }

  private async rollback(root: string, initial: TransactionManifestV2): Promise<TransactionManifestV2> {
    let manifest = initial;
    if (manifest.state !== "rolling_back") {
      manifest = this.transition(manifest, {
        state: "rolling_back",
        failureCode: manifest.failureCode ?? "TRANSACTION_FAILED",
        failureMessage: manifest.failureMessage ?? "Move transaction was interrupted before completion."
      });
    }
    if (manifest.removedDirectories.length > 0) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "A rollback cannot safely recreate directories removed after commit decision."
      );
    }
    await this.ensureRollbackStages(root, manifest);
    await this.removeInstalledDestinations(root, manifest);
    await this.restoreSources(root, manifest);
    for (const operation of manifest.operations) await this.cleanupStage(root, operation);
    await this.removeCreatedDirectories(root, manifest);
    return this.transition(manifest, {
      state: "rolled_back",
      operations: manifest.operations.map((operation) => ({ ...operation, state: "rolled_back" }))
    });
  }

  private async verifyRolledBack(root: string, manifest: TransactionManifestV2): Promise<void> {
    if (manifest.removedDirectories.length > 0) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Rolled-back move contains post-decision directory removal evidence."
      );
    }
    for (const operation of manifest.operations) {
      await requireContent(this.source(root, operation), operation, this.config.moveMaxFileBytes);
      await this.cleanupStage(root, operation);
    }
    await this.removeCreatedDirectories(root, manifest);
  }

  async recoverWorkspace(root: string, workspaceStateKey: string): Promise<void> {
    const manifests = this.store.list(workspaceStateKey).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.transactionId.localeCompare(right.transactionId)
    );
    for (const initial of manifests) {
      let manifest = initial;
      try {
        if (manifest.state === "committed") {
          manifest = await this.finishCommitted(root, manifest);
          await this.options.participantAdapter?.recordRecovery?.(
            manifest,
            "cleanup_completed",
            "MOVE_COMMIT_CLEANUP_COMPLETED"
          );
          continue;
        }
        if (manifest.state === "rolled_back") {
          await this.verifyRolledBack(root, manifest);
          await this.options.participantAdapter?.recordRecovery?.(
            manifest,
            "rollback_completed",
            "MOVE_ROLLBACK_CLEANUP_COMPLETED"
          );
          continue;
        }
        if (manifest.state === "commit_decided") {
          manifest = await this.finishCommitted(root, manifest);
          await this.options.participantAdapter?.recordRecovery?.(
            manifest,
            "cleanup_completed",
            "MOVE_COMMIT_RECOVERY_COMPLETED"
          );
          continue;
        }
        if (manifest.state === "committed_pending_participants") {
          const reconciled = await this.reconcileParticipants(manifest);
          manifest = reconciled.manifest;
          if (reconciled.decision === "commit") {
            manifest = await this.finishCommitted(root, manifest);
            await this.options.participantAdapter?.recordRecovery?.(
              manifest,
              "cleanup_completed",
              "MOVE_PARTICIPANT_RECOVERY_COMPLETED"
            );
            continue;
          }
        }
        manifest = await this.rollback(root, manifest);
        await this.options.participantAdapter?.recordRecovery?.(
          manifest,
          "rollback_completed",
          "MOVE_ROLLBACK_RECOVERY_COMPLETED"
        );
      } catch (error) {
        try {
          manifest = this.store.read(initial.workspaceStateKey, initial.transactionId);
          if (manifest.state !== "committed" && manifest.state !== "rolled_back") {
            manifest = this.transition(manifest, {
              state: "recovery_required",
              failureCode: "TRANSACTION_RECOVERY_REQUIRED",
              failureMessage: "Move recovery requires manual evidence review."
            });
            try {
              await this.options.participantAdapter?.recordRecovery?.(
                manifest,
                "workspace_frozen",
                "MOVE_RECOVERY_EVIDENCE_AMBIGUOUS"
              );
            } catch {
              // The authenticated manifest remains the primary freeze evidence.
            }
          }
        } catch {
          // Preserve the last authenticated generation.
        }
        if (error instanceof TransactionError && error.code === "TRANSACTION_RECOVERY_REQUIRED") throw error;
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "Move transaction recovery could not be proven complete.",
          { transactionId: initial.transactionId }
        );
      }
    }
  }
}

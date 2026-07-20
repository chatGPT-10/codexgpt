import path from "node:path";
import type { BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import fsp, { type FileHandle } from "node:fs/promises";
import { PathGuard, type Workspace } from "../guard.js";
import { TransactionManifestV2Store } from "../transactions/manifestV2Store.js";
import { workspaceStateKeyForRoot } from "../transactions/installation.js";
import {
  TransactionError,
  type MoveTransactionOperationV2,
  type TransactionFaultInjector,
  type TransactionManifestV2
} from "../transactions/types.js";
import {
  WorkspaceMutationLock,
  type WorkspaceLockHandle
} from "../transactions/workspaceLock.js";
import { MovePlanner } from "./planner.js";
import {
  MovePathsError,
  type InspectedMoveBatch,
  type InspectedMovePath,
  type MoveCommittedTransaction,
  type MoveDirectoryFact,
  type MovePlannerConfig,
  type MovePrepareRequest,
  type PendingMoveTransactionCommit,
  type PreparedMoveTransaction
} from "./types.js";

const TRANSIENT_WINDOWS_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const NO_FAULTS: TransactionFaultInjector = { hit() {} };

export interface MoveTransactionRecoveryHook {
  ensureWorkspaceReady(canonicalRoot: string): void | Promise<void>;
}

export interface MoveFilesystemOperations {
  mkdir: typeof fsp.mkdir;
  link: typeof fsp.link;
  unlink: typeof fsp.unlink;
  rmdir: typeof fsp.rmdir;
}

export interface MoveTransactionCoordinatorOptions {
  randomBytes: (size: number) => Buffer;
  now: () => number;
  faultInjector?: TransactionFaultInjector;
  recoveryCoordinator?: MoveTransactionRecoveryHook;
  filesystem?: Partial<MoveFilesystemOperations>;
}

interface MoveContext {
  manifest: TransactionManifestV2;
  batch: InspectedMoveBatch;
  lock: WorkspaceLockHandle;
  released: boolean;
  lifecycle: "prepared" | "pending" | "committed" | "rolled_back" | "recovery_required";
}

function identity(stat: BigIntStats): { device: string; fileId: string } {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev <= 0n || stat.ino <= 0n) {
    throw new TransactionError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "Stable ordinary-file identity is unavailable."
    );
  }
  return { device: stat.dev.toString(), fileId: stat.ino.toString() };
}

function directoryIdentity(stat: BigIntStats): { device: string; fileId: string } {
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev <= 0n || stat.ino <= 0n) {
    throw new TransactionError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "Stable ordinary-directory identity is unavailable."
    );
  }
  return { device: stat.dev.toString(), fileId: stat.ino.toString() };
}

function identityEquals(
  expected: { device: string; fileId: string },
  actual: { device: string; fileId: string }
): boolean {
  return expected.device === actual.device && expected.fileId === actual.fileId;
}

function contained(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathIdentity(absPath: string): Promise<{ device: string; fileId: string } | null> {
  try {
    return identity(await fsp.lstat(absPath, { bigint: true }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathEntryExists(absPath: string): Promise<boolean> {
  try {
    await fsp.lstat(absPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function handleIdentity(handle: FileHandle): Promise<{ device: string; fileId: string }> {
  return identity(await handle.stat({ bigint: true }));
}

async function hashHandle(handle: FileHandle, expectedBytes: number): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  while (position < expectedBytes) {
    const length = Math.min(buffer.length, expectedBytes - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead <= 0) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move content changed during verification.");
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  const extra = await handle.read(Buffer.allocUnsafe(1), 0, 1, position);
  if (extra.bytesRead !== 0) {
    throw new TransactionError("FILE_VERSION_CONFLICT", "Move content size changed during verification.");
  }
  return hash.digest("hex");
}

async function assertExpectedPath(
  absPath: string,
  expected: { device: string; fileId: string }
): Promise<void> {
  const actual = await pathIdentity(absPath);
  if (!actual || !identityEquals(expected, actual)) {
    throw new TransactionError("FILE_VERSION_CONFLICT", "A move path no longer identifies the expected file object.");
  }
}

async function assertExpectedHandle(operation: InspectedMovePath): Promise<void> {
  const actual = await handleIdentity(operation.handle);
  if (!identityEquals(operation.objectIdentity, actual)) {
    throw new TransactionError("FILE_VERSION_CONFLICT", "A move source handle no longer identifies the expected file object.");
  }
}

async function openExpectedHandle(
  absPath: string,
  expected: { device: string; fileId: string }
): Promise<FileHandle> {
  const handle = await fsp.open(absPath, "r");
  try {
    const actual = await handleIdentity(handle);
    if (!identityEquals(expected, actual)) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "A move handoff handle identifies an unexpected file object.");
    }
    return handle;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function assertDestinationSpelling(absPath: string): Promise<void> {
  if (process.platform !== "win32") return;
  const parent = path.dirname(absPath);
  const expected = path.basename(absPath);
  const names = await fsp.readdir(parent);
  if (!names.includes(expected)) {
    throw new TransactionError("FILE_VERSION_CONFLICT", "Windows destination entry spelling is not exact.");
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTransientRetry<T>(
  action: () => Promise<T>,
  revalidate: () => Promise<void>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (code === "EEXIST" || !TRANSIENT_WINDOWS_CODES.has(code) || process.platform !== "win32" || attempt === 3) {
        throw error;
      }
      await revalidate();
      await delay(5 * (attempt + 1));
    }
  }
  throw lastError;
}

function operationFromInspection(
  operation: InspectedMovePath,
  stageRelativePath: string
): MoveTransactionOperationV2 {
  return {
    operationId: operation.operationId,
    kind: "move",
    state: "planned",
    sourceRelativePath: operation.sourceRelativePath,
    destinationRelativePath: operation.destinationRelativePath,
    sourceComparisonKey: operation.sourceComparisonKey,
    destinationComparisonKey: operation.destinationComparisonKey,
    sourceExistingParentRelativePath: operation.sourceExistingParentRelativePath,
    sourceExistingParentIdentity: operation.sourceExistingParentIdentity,
    destinationExistingParentRelativePath: operation.destinationExistingParentRelativePath,
    destinationExistingParentIdentity: operation.destinationExistingParentIdentity,
    stageRelativePath,
    objectIdentity: operation.objectIdentity,
    version: operation.version
  };
}

function participantFacts(names: readonly string[]): Record<string, "pending"> {
  return Object.fromEntries(names.map((name) => [name, "pending"])) as Record<string, "pending">;
}

function toTransactionError(error: unknown, fallback: string): TransactionError {
  if (error instanceof TransactionError) return error;
  if (error instanceof MovePathsError) {
    if (error.code === "FILE_VERSION_CONFLICT") {
      return new TransactionError("FILE_VERSION_CONFLICT", error.message);
    }
    if (error.code === "CROSS_VOLUME_MOVE" || error.code === "ATOMIC_BACKEND_UNAVAILABLE") {
      return new TransactionError("ATOMIC_BACKEND_UNAVAILABLE", error.message);
    }
    return new TransactionError("TRANSACTION_PRECONDITION_FAILED", error.message);
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "";
  if (["EXDEV", "EMLINK", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(code)) {
    return new TransactionError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "The filesystem cannot provide the required same-volume hard-link transaction backend."
    );
  }
  return new TransactionError("TRANSACTION_FAILED", fallback);
}

export class MoveTransactionCoordinator {
  private readonly planner: MovePlanner;
  private readonly store: TransactionManifestV2Store;
  private readonly faults: TransactionFaultInjector;
  private readonly filesystem: MoveFilesystemOperations;

  constructor(
    config: MovePlannerConfig,
    private readonly guard: PathGuard,
    private readonly stateRoot: string,
    private readonly masterKey: Buffer,
    private readonly locks: WorkspaceMutationLock,
    private readonly options: MoveTransactionCoordinatorOptions
  ) {
    this.planner = new MovePlanner(config);
    this.store = new TransactionManifestV2Store(stateRoot, masterKey);
    this.faults = options.faultInjector ?? NO_FAULTS;
    this.filesystem = {
      mkdir: options.filesystem?.mkdir ?? fsp.mkdir,
      link: options.filesystem?.link ?? fsp.link,
      unlink: options.filesystem?.unlink ?? fsp.unlink,
      rmdir: options.filesystem?.rmdir ?? fsp.rmdir
    };
  }

  dispose(): void {
    this.store.dispose();
  }

  private opaqueId(prefix: "tx" | "cs"): string {
    const bytes = this.options.randomBytes(16);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Move transaction ID source is invalid.");
    }
    return `${prefix}_${bytes.toString("hex")}`;
  }

  private artifactToken(): string {
    const bytes = this.options.randomBytes(8);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 8) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Move artifact ID source is invalid.");
    }
    return bytes.toString("hex");
  }

  private async allocateOperations(
    batch: InspectedMoveBatch,
    operations: readonly InspectedMovePath[]
  ): Promise<MoveTransactionOperationV2[]> {
    const used = new Set<string>();
    const result: MoveTransactionOperationV2[] = [];
    for (const operation of operations) {
      let stageRelativePath: string | null = null;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const stageAbsPath = path.join(
          path.dirname(operation.sourceAbsPath),
          `.codexgpt-txn-${this.artifactToken()}.move`
        );
        const relative = path.relative(batch.workspace.root, stageAbsPath).replaceAll("\\", "/");
        if (used.has(relative) || await pathEntryExists(stageAbsPath)) continue;
        used.add(relative);
        stageRelativePath = relative;
        break;
      }
      if (!stageRelativePath) {
        throw new TransactionError(
          "TRANSACTION_BUSY",
          "A unique move stage name could not be reserved."
        );
      }
      result.push(operationFromInspection(operation, stageRelativePath));
    }
    return result;
  }

  private timestamp(): string {
    const value = new Date(this.options.now()).toISOString();
    if (value === "Invalid Date") {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Move transaction clock is invalid.");
    }
    return value;
  }

  private validateRequest(request: MovePrepareRequest): void {
    if (!request.workspace?.root || !request.workspace.id || !request.workspace.openedAt) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move workspace is invalid.");
    }
    if (!Array.isArray(request.requiredParticipants) || request.requiredParticipants.length > 32) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participants are invalid.");
    }
    if (new Set(request.requiredParticipants).size !== request.requiredParticipants.length) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participants are duplicate.");
    }
    const suppliedReferences = request.participantReferences ?? {};
    for (const name of request.requiredParticipants) {
      if (!/^[a-z][a-z0-9._-]{0,63}$/.test(name)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participant name is invalid.");
      }
      const reference = suppliedReferences[name];
      if (reference !== undefined && !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(reference)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participant reference is invalid.");
      }
    }
    if (Object.keys(suppliedReferences).some((name) => !request.requiredParticipants.includes(name))) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participant references contain an unknown participant.");
    }
  }

  private async validateDirectoryRemovalPlan(
    batch: InspectedMoveBatch,
    requested: readonly MoveDirectoryFact[]
  ): Promise<MoveDirectoryFact[]> {
    const root = batch.workspace.root;
    const normalized = requested.map((value) => ({
      relativePath: value.relativePath.replace(/\\/g, "/").normalize("NFC"),
      objectIdentity: value.objectIdentity
    }));
    const relativePaths = normalized.map((value) => value.relativePath);
    if (new Set(relativePaths).size !== relativePaths.length) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move directory-removal plan contains duplicates.");
    }
    const absoluteByRelative = new Map<string, string>();
    for (const fact of normalized) {
      const relative = fact.relativePath;
      if (!relative || path.isAbsolute(relative) || relative.includes("\0")) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move directory-removal path is invalid.");
      }
      const absolute = path.resolve(root, relative);
      if (absolute === root || !contained(absolute, root)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move directory-removal path escaped the workspace.");
      }
      let facts;
      try {
        facts = this.guard.resolvePolicyFacts(batch.workspace, relative, { forWrite: true });
      } catch {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory no longer satisfies workspace policy.");
      }
      if (!facts.targetExists || path.resolve(facts.absPath) !== absolute) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory path identity changed.");
      }
      const stat = await fsp.lstat(absolute, { bigint: true }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new TransactionError("FILE_VERSION_CONFLICT", "A directory selected for undo cleanup no longer exists.");
        }
        throw error;
      });
      const actualIdentity = directoryIdentity(stat);
      if (!identityEquals(fact.objectIdentity, actualIdentity)) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory object identity changed.");
      }
      absoluteByRelative.set(relative, absolute);
    }
    const plannedAbs = new Set(absoluteByRelative.values());
    const sourceAbs = new Set(batch.operations.map((operation) => path.resolve(operation.sourceAbsPath)));
    for (const [relative, absolute] of absoluteByRelative) {
      const entries = await fsp.readdir(absolute, { withFileTypes: true });
      for (const entry of entries) {
        const child = path.resolve(absolute, entry.name);
        if (entry.isSymbolicLink()) {
          throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory contains a symbolic link.");
        }
        if (entry.isDirectory()) {
          if (!plannedAbs.has(child)) {
            throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory contains an unrelated directory.");
          }
          continue;
        }
        if (!entry.isFile() || !sourceAbs.has(child)) {
          throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory contains an unrelated entry.");
        }
      }
      if (batch.createdDirectories.includes(relative)) {
        throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "A move cannot create and remove the same directory.");
      }
    }
    return normalized.sort((left, right) =>
      right.relativePath.split("/").length - left.relativePath.split("/").length ||
      right.relativePath.localeCompare(left.relativePath)
    );
  }

  async preview(
    workspace: Workspace,
    moves: MovePrepareRequest["moves"],
    createParents: boolean,
    removeEmptyDirectoriesAfterInstall: readonly MoveDirectoryFact[] = []
  ): Promise<InspectedMoveBatch> {
    const batch = await this.planner.inspect(workspace, moves, createParents);
    try {
      await this.validateDirectoryRemovalPlan(batch, removeEmptyDirectoriesAfterInstall);
      return batch;
    } catch (error) {
      await batch.close();
      throw error;
    }
  }

  async prepare(request: MovePrepareRequest): Promise<PreparedMoveTransaction> {
    this.validateRequest(request);
    await this.options.recoveryCoordinator?.ensureWorkspaceReady(request.workspace.root);
    const workspaceStateKey = workspaceStateKeyForRoot(request.workspace.root, this.masterKey);
    const transactionId = this.opaqueId("tx");
    const changeSetId = this.opaqueId("cs");
    const lock = this.locks.acquire({ workspaceStateKey, transactionId });
    let batch: InspectedMoveBatch | undefined;
    let released = false;
    try {
      batch = await this.planner.inspect(request.workspace, request.moves, request.createParents);
      const plannedRemovedDirectoryFacts = await this.validateDirectoryRemovalPlan(
        batch,
        request.removeEmptyDirectoriesAfterInstall ?? []
      );
      const createdAt = this.timestamp();
      const orderedInspections = [...batch.operations]
        .sort((left, right) =>
          left.sourceComparisonKey.localeCompare(right.sourceComparisonKey) ||
          left.operationId.localeCompare(right.operationId)
        );
      const orderedOperations = await this.allocateOperations(batch, orderedInspections);
      const suppliedReferences = request.participantReferences ?? {};
      const resolvedReferences = Object.fromEntries(request.requiredParticipants.map((name) => [
        name,
        suppliedReferences[name] ?? `${name}:${name === "change_set" ? changeSetId : transactionId}`
      ]));
      const initial = {
        schemaVersion: 2 as const,
        transactionId,
        changeSetId,
        workspaceStateKey,
        generation: 1,
        createdAt,
        updatedAt: createdAt,
        state: "preparing" as const,
        operations: orderedOperations,
        plannedCreatedDirectories: [...batch.createdDirectories],
        createdDirectories: [],
        createdDirectoryIdentities: {},
        plannedRemovedDirectories: plannedRemovedDirectoryFacts.map((fact) => fact.relativePath),
        plannedRemovedDirectoryIdentities: Object.fromEntries(
          plannedRemovedDirectoryFacts.map((fact) => [fact.relativePath, fact.objectIdentity])
        ),
        removedDirectories: [],
        requiredParticipants: [...request.requiredParticipants],
        participantReferences: resolvedReferences,
        participantFacts: participantFacts(request.requiredParticipants)
      };
      this.store.writeInitial(initial);
      let manifest = this.store.read(workspaceStateKey, transactionId);
      await this.faults.hit("after_manifest_preparing", { operationCount: orderedOperations.length });
      manifest = this.transition(manifest, { state: "prepared" });
      await this.faults.hit("after_manifest_prepared", { operationCount: orderedOperations.length });
      const context: MoveContext = {
        manifest,
        batch,
        lock,
        released,
        lifecycle: "prepared"
      };
      return new PreparedMoveTransactionImpl(this, context);
    } catch (error) {
      await batch?.close();
      if (!released) {
        try {
          lock.release();
          released = true;
        } catch {
          // Preserve lock evidence if release cannot be proven.
        }
      }
      throw toTransactionError(error, "Move preparation failed.");
    }
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
      updatedAt: this.timestamp()
    };
    this.store.writeNext(previous, next);
    return this.store.read(previous.workspaceStateKey, previous.transactionId);
  }

  private replaceOperation(
    operations: readonly MoveTransactionOperationV2[],
    replacement: MoveTransactionOperationV2
  ): MoveTransactionOperationV2[] {
    return operations.map((operation) =>
      operation.operationId === replacement.operationId ? replacement : operation
    );
  }

  private inspected(context: MoveContext, operationId: string): InspectedMovePath {
    const operation = context.batch.operations.find((value) => value.operationId === operationId);
    if (!operation) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Move operation inspection evidence is missing.");
    }
    return operation;
  }

  private stageAbs(context: MoveContext, operation: MoveTransactionOperationV2): string {
    return path.resolve(context.batch.workspace.root, operation.stageRelativePath);
  }

  private async assertDirectoryIdentity(
    absolute: string,
    expected?: { device: string; fileId: string }
  ): Promise<void> {
    const actual = directoryIdentity(await fsp.lstat(absolute, { bigint: true }));
    if (expected && !identityEquals(expected, actual)) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move directory object identity changed.");
    }
    const real = await fsp.realpath(absolute);
    if (path.resolve(real) !== path.resolve(absolute)) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move directory resolves through a link or reparse point.");
    }
  }

  private policyFacts(context: MoveContext, relativePath: string) {
    try {
      return this.guard.resolvePolicyFacts(context.batch.workspace, relativePath, { forWrite: true });
    } catch {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move path no longer satisfies workspace policy.");
    }
  }

  private async assertSourcePolicy(context: MoveContext, operation: InspectedMovePath): Promise<void> {
    const facts = this.policyFacts(context, operation.sourceRelativePath);
    if (
      !facts.targetExists ||
      path.resolve(facts.absPath) !== path.resolve(operation.sourceAbsPath) ||
      facts.comparisonKey !== operation.sourceComparisonKey ||
      path.resolve(facts.existingParent) !== path.resolve(operation.sourceExistingParent) ||
      facts.existingParentIdentity !== operation.sourceExistingParentIdentity
    ) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move source path or parent identity changed.");
    }
    await this.assertDirectoryIdentity(operation.sourceExistingParent);
  }

  private async assertCreationPathReady(context: MoveContext, relativePath: string): Promise<void> {
    const absolute = path.resolve(context.batch.workspace.root, relativePath);
    const facts = this.policyFacts(context, relativePath);
    const parent = path.dirname(absolute);
    if (
      facts.targetExists ||
      path.resolve(facts.absPath) !== absolute ||
      path.resolve(facts.existingParent) !== parent
    ) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move-created directory path or parent identity changed.");
    }
    const parentRelative = path.relative(context.batch.workspace.root, parent).replaceAll("\\", "/") || ".";
    const expectedIdentity = context.manifest.createdDirectoryIdentities[parentRelative];
    if (expectedIdentity) {
      await this.assertDirectoryIdentity(parent, expectedIdentity);
      return;
    }
    const original = context.batch.operations.find((operation) =>
      path.resolve(operation.destinationExistingParent) === parent
    );
    if (!original || facts.existingParentIdentity !== original.destinationExistingParentIdentity) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move-created directory existing parent changed.");
    }
    await this.assertDirectoryIdentity(parent);
  }

  private async assertDestinationAbsent(context: MoveContext, operation: InspectedMovePath): Promise<void> {
    const facts = this.policyFacts(context, operation.destinationRelativePath);
    const parent = path.dirname(operation.destinationAbsPath);
    if (
      facts.targetExists ||
      path.resolve(facts.absPath) !== path.resolve(operation.destinationAbsPath) ||
      facts.comparisonKey !== operation.destinationComparisonKey ||
      path.resolve(facts.existingParent) !== parent
    ) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move destination path or parent identity changed.");
    }
    const parentRelative = path.relative(context.batch.workspace.root, parent).replaceAll("\\", "/") || ".";
    const expectedIdentity = context.manifest.createdDirectoryIdentities[parentRelative];
    if (expectedIdentity) {
      await this.assertDirectoryIdentity(parent, expectedIdentity);
      return;
    }
    if (
      path.resolve(operation.destinationExistingParent) !== parent ||
      facts.existingParentIdentity !== operation.destinationExistingParentIdentity
    ) {
      throw new TransactionError("FILE_VERSION_CONFLICT", "Move destination existing parent changed.");
    }
    await this.assertDirectoryIdentity(parent);
  }

  private async createDirectories(context: MoveContext): Promise<void> {
    for (let index = 0; index < context.manifest.plannedCreatedDirectories.length; index += 1) {
      const relativePath = context.manifest.plannedCreatedDirectories[index];
      const absPath = path.resolve(context.batch.workspace.root, relativePath);
      await this.assertCreationPathReady(context, relativePath);
      await this.faults.hit("before_each_directory_create", {
        index,
        directoryCount: context.manifest.plannedCreatedDirectories.length
      });
      try {
        await this.filesystem.mkdir(absPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new TransactionError("FILE_VERSION_CONFLICT", "A move destination directory appeared concurrently.");
        }
        throw error;
      }
      await this.faults.hit("after_each_directory_create_before_manifest", {
        index,
        directoryCount: context.manifest.plannedCreatedDirectories.length
      });
      const createdIdentity = directoryIdentity(await fsp.lstat(absPath, { bigint: true }));
      context.manifest = this.transition(context.manifest, {
        createdDirectories: [...context.manifest.createdDirectories, relativePath],
        createdDirectoryIdentities: {
          ...context.manifest.createdDirectoryIdentities,
          [relativePath]: createdIdentity
        }
      });
      await this.faults.hit("after_each_directory_create", {
        index,
        directoryCount: context.manifest.plannedCreatedDirectories.length
      });
    }
  }

  private async stageAll(context: MoveContext): Promise<void> {
    const ordered = [...context.manifest.operations].sort((left, right) =>
      left.sourceComparisonKey.localeCompare(right.sourceComparisonKey) ||
      left.operationId.localeCompare(right.operationId)
    );
    for (let index = 0; index < ordered.length; index += 1) {
      let operation = context.manifest.operations.find((value) => value.operationId === ordered[index].operationId)!;
      const inspected = this.inspected(context, operation.operationId);
      const stageAbsPath = this.stageAbs(context, operation);
      await this.assertSourcePolicy(context, inspected);
      await assertExpectedHandle(inspected);
      await assertExpectedPath(inspected.sourceAbsPath, operation.objectIdentity);
      if (await pathEntryExists(stageAbsPath)) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Move stage name appeared concurrently.");
      }
      await this.faults.hit("before_each_stage_link", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      await withTransientRetry(
        () => this.filesystem.link(inspected.sourceAbsPath, stageAbsPath),
        async () => {
          await this.assertSourcePolicy(context, inspected);
          await assertExpectedHandle(inspected);
          await assertExpectedPath(inspected.sourceAbsPath, operation.objectIdentity);
          if (await pathEntryExists(stageAbsPath)) {
            throw new TransactionError("FILE_VERSION_CONFLICT", "Move stage name appeared concurrently.");
          }
        }
      );
      await assertExpectedPath(stageAbsPath, operation.objectIdentity);
      await this.faults.hit("after_each_stage_link_before_manifest", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      operation = { ...operation, state: "staged_link_ready" };
      context.manifest = this.transition(context.manifest, {
        operations: this.replaceOperation(context.manifest.operations, operation)
      });
      await this.faults.hit("after_each_stage", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      await this.assertSourcePolicy(context, inspected);
      await assertExpectedHandle(inspected);
      await assertExpectedPath(inspected.sourceAbsPath, operation.objectIdentity);
      const sourceHandle = inspected.handle;
      const stageHandle = await openExpectedHandle(stageAbsPath, operation.objectIdentity);
      let stageHandleTransferred = false;
      try {
        await this.faults.hit("before_each_source_unlink", {
          operationId: operation.operationId,
          index,
          operationCount: ordered.length
        });
        await withTransientRetry(
          () => this.filesystem.unlink(inspected.sourceAbsPath),
          async () => {
            await this.assertSourcePolicy(context, inspected);
            await assertExpectedHandle(inspected);
            await assertExpectedPath(inspected.sourceAbsPath, operation.objectIdentity);
            await assertExpectedPath(stageAbsPath, operation.objectIdentity);
          }
        );
        await sourceHandle.close();
        inspected.handle = stageHandle;
        stageHandleTransferred = true;
        await this.faults.hit("after_each_source_unlink_before_manifest", {
          operationId: operation.operationId,
          index,
          operationCount: ordered.length
        });
        operation = { ...operation, state: "source_name_removed" };
        context.manifest = this.transition(context.manifest, {
          operations: this.replaceOperation(context.manifest.operations, operation)
        });
      } finally {
        if (!stageHandleTransferred) await stageHandle.close().catch(() => undefined);
      }
    }
  }

  private async installAll(context: MoveContext): Promise<void> {
    const ordered = [...context.manifest.operations].sort((left, right) =>
      left.destinationComparisonKey.localeCompare(right.destinationComparisonKey) ||
      left.operationId.localeCompare(right.operationId)
    );
    for (let index = 0; index < ordered.length; index += 1) {
      let operation = context.manifest.operations.find((value) => value.operationId === ordered[index].operationId)!;
      const inspected = this.inspected(context, operation.operationId);
      const stageAbsPath = this.stageAbs(context, operation);
      await this.assertDestinationAbsent(context, inspected);
      await assertExpectedHandle(inspected);
      await assertExpectedPath(stageAbsPath, operation.objectIdentity);
      if (await pathEntryExists(inspected.destinationAbsPath)) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "A move destination appeared concurrently.");
      }
      await this.faults.hit("before_each_destination_link", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      await withTransientRetry(
        () => this.filesystem.link(stageAbsPath, inspected.destinationAbsPath),
        async () => {
          await this.assertDestinationAbsent(context, inspected);
          await assertExpectedHandle(inspected);
          await assertExpectedPath(stageAbsPath, operation.objectIdentity);
          if (await pathEntryExists(inspected.destinationAbsPath)) {
            throw new TransactionError("FILE_VERSION_CONFLICT", "A move destination appeared concurrently.");
          }
        }
      );
      await assertExpectedPath(inspected.destinationAbsPath, operation.objectIdentity);
      await assertDestinationSpelling(inspected.destinationAbsPath);
      await this.faults.hit("after_each_destination_link_before_manifest", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      operation = { ...operation, state: "destination_link_ready" };
      context.manifest = this.transition(context.manifest, {
        operations: this.replaceOperation(context.manifest.operations, operation)
      });
      const digest = await hashHandle(inspected.handle, operation.version.bytes);
      if (digest !== operation.version.sha256) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Move destination content verification failed.");
      }
      await this.faults.hit("before_each_stage_unlink", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      await withTransientRetry(
        () => this.filesystem.unlink(stageAbsPath),
        async () => {
          await assertExpectedHandle(inspected);
          await assertExpectedPath(stageAbsPath, operation.objectIdentity);
          await assertExpectedPath(inspected.destinationAbsPath, operation.objectIdentity);
        }
      );
      await inspected.handle.close();
      await this.faults.hit("after_each_stage_unlink_before_manifest", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
      operation = { ...operation, state: "installed" };
      context.manifest = this.transition(context.manifest, {
        operations: this.replaceOperation(context.manifest.operations, operation)
      });
      await this.faults.hit("after_each_install", {
        operationId: operation.operationId,
        index,
        operationCount: ordered.length
      });
    }
  }

  private async removePlannedDirectories(context: MoveContext): Promise<void> {
    for (let index = 0; index < context.manifest.plannedRemovedDirectories.length; index += 1) {
      const relativePath = context.manifest.plannedRemovedDirectories[index];
      const absPath = path.resolve(context.batch.workspace.root, relativePath);
      const expectedIdentity = context.manifest.plannedRemovedDirectoryIdentities[relativePath];
      if (!expectedIdentity) {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Undo cleanup directory identity is missing.");
      }
      const facts = this.policyFacts(context, relativePath);
      if (!facts.targetExists || path.resolve(facts.absPath) !== absPath) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory path identity changed.");
      }
      await this.assertDirectoryIdentity(absPath, expectedIdentity);
      if ((await fsp.readdir(absPath)).length !== 0) {
        throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory is no longer empty.");
      }
      await this.faults.hit("before_each_directory_remove", {
        index,
        directoryCount: context.manifest.plannedRemovedDirectories.length
      });
      await withTransientRetry(
        () => this.filesystem.rmdir(absPath),
        async () => {
          await this.assertDirectoryIdentity(absPath, expectedIdentity);
          if ((await fsp.readdir(absPath)).length !== 0) {
            throw new TransactionError("FILE_VERSION_CONFLICT", "Undo cleanup directory is no longer empty.");
          }
        }
      );
      await this.faults.hit("after_each_directory_remove_before_manifest", {
        index,
        directoryCount: context.manifest.plannedRemovedDirectories.length
      });
      context.manifest = this.transition(context.manifest, {
        removedDirectories: [...context.manifest.removedDirectories, relativePath]
      });
      await this.faults.hit("after_each_directory_remove", {
        index,
        directoryCount: context.manifest.plannedRemovedDirectories.length
      });
    }
  }

  private async commitContext(context: MoveContext): Promise<PendingMoveTransactionCommit> {
    if (context.lifecycle !== "prepared") {
      throw new TransactionError("TRANSACTION_FAILED", "Move transaction is not prepared.");
    }
    try {
      context.manifest = this.transition(context.manifest, { state: "committing" });
      await this.faults.hit("after_manifest_committing", {
        operationCount: context.manifest.operations.length
      });
      await this.createDirectories(context);
      await this.stageAll(context);
      await this.installAll(context);
      context.manifest = this.transition(context.manifest, { state: "committed_pending_participants" });
      await this.faults.hit("after_manifest_pending_participants", {
        participantCount: context.manifest.requiredParticipants.length
      });
      context.lifecycle = "pending";
      return new PendingMoveTransactionCommitImpl(this, context);
    } catch (error) {
      try {
        await this.rollbackContext(context, "commit_failed");
      } catch (rollbackError) {
        throw rollbackError;
      }
      throw toTransactionError(error, "Atomic move failed.");
    }
  }

  private async ensureRollbackStages(context: MoveContext): Promise<void> {
    for (const operation of context.manifest.operations) {
      const inspected = this.inspected(context, operation.operationId);
      const stageAbsPath = this.stageAbs(context, operation)!;
      const stageIdentity = await pathIdentity(stageAbsPath);
      if (stageIdentity) {
        if (!identityEquals(operation.objectIdentity, stageIdentity)) {
          throw new TransactionError("ROLLBACK_FAILED", "Move stage object identity is ambiguous.");
        }
        continue;
      }
      const sourceIdentity = await pathIdentity(inspected.sourceAbsPath);
      if (sourceIdentity && identityEquals(operation.objectIdentity, sourceIdentity)) continue;
      const destinationIdentity = await pathIdentity(inspected.destinationAbsPath);
      if (!destinationIdentity || !identityEquals(operation.objectIdentity, destinationIdentity)) {
        throw new TransactionError("ROLLBACK_FAILED", "Move rollback has no authenticated object link.");
      }
      await this.filesystem.link(inspected.destinationAbsPath, stageAbsPath);
      await assertExpectedPath(stageAbsPath, operation.objectIdentity);
    }
  }

  private async removeInstalledDestinations(context: MoveContext): Promise<void> {
    const expectedSources = new Map(
      context.manifest.operations.map((operation) => [operation.sourceComparisonKey, operation.objectIdentity])
    );
    for (const operation of context.manifest.operations) {
      const inspected = this.inspected(context, operation.operationId);
      const actual = await pathIdentity(inspected.destinationAbsPath);
      if (!actual) continue;
      if (identityEquals(operation.objectIdentity, actual)) {
        await this.filesystem.unlink(inspected.destinationAbsPath);
        continue;
      }
      const originalSource = expectedSources.get(operation.destinationComparisonKey);
      if (originalSource && identityEquals(originalSource, actual)) continue;
      if (["planned", "staged_link_ready", "source_name_removed"].includes(operation.state)) {
        continue;
      }
      throw new TransactionError("ROLLBACK_FAILED", "A move destination contains an unrelated file object.");
    }
  }

  private async restoreOriginalSources(context: MoveContext): Promise<void> {
    for (const operation of context.manifest.operations) {
      const inspected = this.inspected(context, operation.operationId);
      const current = await pathIdentity(inspected.sourceAbsPath);
      if (current) {
        if (!identityEquals(operation.objectIdentity, current)) {
          throw new TransactionError("ROLLBACK_FAILED", "A move source contains an unrelated file object.");
        }
      } else {
        const stageAbsPath = this.stageAbs(context, operation);
        await assertExpectedPath(stageAbsPath, operation.objectIdentity);
        await this.filesystem.link(stageAbsPath, inspected.sourceAbsPath);
        await assertExpectedPath(inspected.sourceAbsPath, operation.objectIdentity);
        if (process.platform === "win32") await assertDestinationSpelling(inspected.sourceAbsPath);
      }
    }
  }

  private async cleanupRollbackStages(context: MoveContext): Promise<void> {
    for (const operation of context.manifest.operations) {
      const stageAbsPath = this.stageAbs(context, operation);
      const actual = await pathIdentity(stageAbsPath);
      if (!actual) continue;
      if (!identityEquals(operation.objectIdentity, actual)) {
        throw new TransactionError("ROLLBACK_FAILED", "Move rollback stage identity changed.");
      }
      await this.filesystem.unlink(stageAbsPath);
    }
  }

  private async rollbackContext(context: MoveContext, reason: string): Promise<void> {
    if (context.lifecycle === "committed") {
      throw new TransactionError("ROLLBACK_FAILED", "A committed move transaction cannot be rolled back.");
    }
    if (context.lifecycle === "rolled_back") return;
    try {
      if (context.manifest.state !== "rolling_back") {
        context.manifest = this.transition(context.manifest, {
          state: "rolling_back",
          failureCode: context.manifest.failureCode ?? "TRANSACTION_FAILED",
          failureMessage: context.manifest.failureMessage ?? `Move rollback requested: ${reason}`
        });
      }
      await this.ensureRollbackStages(context);
      await this.removeInstalledDestinations(context);
      await this.restoreOriginalSources(context);
      await this.cleanupRollbackStages(context);
      for (let index = context.manifest.createdDirectories.length - 1; index >= 0; index -= 1) {
        const relativePath = context.manifest.createdDirectories[index];
        const absPath = path.resolve(context.batch.workspace.root, relativePath);
        const expectedIdentity = context.manifest.createdDirectoryIdentities[relativePath];
        if (!expectedIdentity) {
          throw new TransactionError("ROLLBACK_FAILED", "Move-created directory identity evidence is missing.");
        }
        try {
          await this.assertDirectoryIdentity(absPath, expectedIdentity);
          await this.filesystem.rmdir(absPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      for (const relativePath of context.manifest.plannedCreatedDirectories) {
        if (context.manifest.createdDirectories.includes(relativePath)) continue;
        if (await pathEntryExists(path.resolve(context.batch.workspace.root, relativePath))) {
          throw new TransactionError(
            "ROLLBACK_FAILED",
            "An unjournaled planned move directory requires recovery review."
          );
        }
      }
      context.manifest = this.transition(context.manifest, {
        state: "rolled_back",
        operations: context.manifest.operations.map((operation) => ({
          ...operation,
          state: "rolled_back"
        }))
      });
      context.lifecycle = "rolled_back";
      await context.batch.close();
      this.releaseContext(context);
    } catch {
      context.lifecycle = "recovery_required";
      try {
        context.manifest = this.transition(context.manifest, {
          state: "recovery_required",
          failureCode: "ROLLBACK_FAILED",
          failureMessage: "Move rollback could not be proven complete."
        });
      } catch {
        // Preserve the last authenticated manifest and workspace evidence.
      }
      await context.batch.close();
      this.releaseContextBestEffort(context);
      throw new TransactionError(
        "ROLLBACK_FAILED",
        "Move rollback could not be proven complete.",
        { transactionId: context.manifest.transactionId }
      );
    }
  }

  private async participantContext(
    context: MoveContext,
    name: string,
    action: () => Promise<void>
  ): Promise<void> {
    if (context.lifecycle !== "pending") {
      throw new TransactionError("TRANSACTION_FAILED", "Move transaction is not awaiting participants.");
    }
    if (!context.manifest.requiredParticipants.includes(name)) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Unknown move participant.");
    }
    if (context.manifest.participantFacts[name] !== "pending") {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Move participant is not pending.");
    }
    let effectCompleted = false;
    try {
      await action();
      effectCompleted = true;
      await this.faults.hit("after_each_participant_effect_before_manifest", {
        participantIndex: context.manifest.requiredParticipants.indexOf(name),
        participantCount: context.manifest.requiredParticipants.length
      });
      context.manifest = this.transition(context.manifest, {
        participantFacts: { ...context.manifest.participantFacts, [name]: "committed" }
      });
      await this.faults.hit("after_each_participant", {
        participantIndex: context.manifest.requiredParticipants.indexOf(name),
        participantCount: context.manifest.requiredParticipants.length
      });
    } catch (error) {
      if (effectCompleted) {
        context.lifecycle = "recovery_required";
        await context.batch.close();
        this.releaseContextBestEffort(context);
        throw new TransactionError(
          "TRANSACTION_RECOVERY_REQUIRED",
          "A durable move participant requires recovery reconciliation.",
          { transactionId: context.manifest.transactionId }
        );
      }
      context.manifest = this.transition(context.manifest, {
        participantFacts: { ...context.manifest.participantFacts, [name]: "failed" },
        failureCode: "TRANSACTION_FAILED",
        failureMessage: "A required move participant failed."
      });
      await this.rollbackContext(context, "participant_failed");
      throw toTransactionError(error, "A required move participant failed.");
    }
  }

  private async finalizeContext(context: MoveContext): Promise<MoveCommittedTransaction> {
    if (context.lifecycle !== "pending") {
      throw new TransactionError("TRANSACTION_FAILED", "Move transaction cannot be finalized.");
    }
    const incomplete = context.manifest.requiredParticipants.find(
      (name) => context.manifest.participantFacts[name] !== "committed"
    );
    if (incomplete) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "A required move participant is incomplete.");
    }
    try {
      context.manifest = this.transition(context.manifest, { state: "commit_decided" });
      await this.faults.hit("after_manifest_commit_decided", {
        operationCount: context.manifest.operations.length,
        directoryCount: context.manifest.plannedRemovedDirectories.length
      });
      await this.removePlannedDirectories(context);
      context.manifest = this.transition(context.manifest, {
        state: "committed",
        operations: context.manifest.operations.map((operation) => ({
          ...operation,
          state: "finalized"
        }))
      });
      await this.faults.hit("after_manifest_committed", {
        operationCount: context.manifest.operations.length
      });
      context.lifecycle = "committed";
      let cleanupPending = false;
      for (const operation of context.manifest.operations) {
        const stageAbsPath = this.stageAbs(context, operation);
        try {
          await this.filesystem.unlink(stageAbsPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") cleanupPending = true;
        }
      }
      await context.batch.close();
      this.releaseContext(context);
      return {
        transactionId: context.manifest.transactionId,
        changeSetId: context.manifest.changeSetId,
        committedAt: context.manifest.updatedAt,
        operationCount: context.manifest.operations.length,
        cleanupPending
      };
    } catch {
      context.lifecycle = "recovery_required";
      await context.batch.close();
      this.releaseContextBestEffort(context);
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Move commit decision requires recovery before another mutation.",
        { transactionId: context.manifest.transactionId }
      );
    }
  }

  private releaseContext(context: MoveContext): void {
    if (context.released) return;
    context.lock.release();
    context.released = true;
  }

  private releaseContextBestEffort(context: MoveContext): void {
    try {
      this.releaseContext(context);
    } catch {
      // Recovery evidence remains authoritative.
    }
  }

  preparedCommit(context: MoveContext): Promise<PendingMoveTransactionCommit> {
    return this.commitContext(context);
  }

  preparedRollback(context: MoveContext, reason: string): Promise<void> {
    return this.rollbackContext(context, reason);
  }

  participantCommit(context: MoveContext, name: string, action: () => Promise<void>): Promise<void> {
    return this.participantContext(context, name, action);
  }

  pendingFinalize(context: MoveContext): Promise<MoveCommittedTransaction> {
    return this.finalizeContext(context);
  }

  pendingRollback(context: MoveContext, reason: string): Promise<void> {
    return this.rollbackContext(context, reason);
  }
}

class PreparedMoveTransactionImpl implements PreparedMoveTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operations: readonly InspectedMovePath[];
  readonly createdDirectories: readonly string[];
  readonly totalBytes: number;

  constructor(
    private readonly coordinator: MoveTransactionCoordinator,
    private readonly context: MoveContext
  ) {
    this.transactionId = context.manifest.transactionId;
    this.changeSetId = context.manifest.changeSetId;
    this.operations = context.batch.operations;
    this.createdDirectories = context.batch.createdDirectories;
    this.totalBytes = context.batch.totalBytes;
  }

  createdDirectoryFacts(): readonly MoveDirectoryFact[] {
    return this.context.manifest.createdDirectories.map((relativePath) => ({
      relativePath,
      objectIdentity: this.context.manifest.createdDirectoryIdentities[relativePath]
    }));
  }

  commit(): Promise<PendingMoveTransactionCommit> {
    return this.coordinator.preparedCommit(this.context);
  }

  rollback(reason: string): Promise<void> {
    return this.coordinator.preparedRollback(this.context, reason);
  }
}

class PendingMoveTransactionCommitImpl implements PendingMoveTransactionCommit {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;

  constructor(
    private readonly coordinator: MoveTransactionCoordinator,
    private readonly context: MoveContext
  ) {
    this.transactionId = context.manifest.transactionId;
    this.changeSetId = context.manifest.changeSetId;
    this.operationCount = context.manifest.operations.length;
  }

  commitParticipant(name: string, action: () => Promise<void>): Promise<void> {
    return this.coordinator.participantCommit(this.context, name, action);
  }

  finalize(): Promise<MoveCommittedTransaction> {
    return this.coordinator.pendingFinalize(this.context);
  }

  rollback(reason: string): Promise<void> {
    return this.coordinator.pendingRollback(this.context, reason);
  }
}

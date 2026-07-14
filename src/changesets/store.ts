import fs from "node:fs";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";
import { canonicalJson } from "../audit/canonicalJson.js";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import type { DirectorySyncCapability } from "../transactions/types.js";
import {
  changeSetIdSchema,
  operationIdSchema,
  sha256Schema,
  workspaceStateKeySchema
} from "../transactions/schemas.js";
import { transactionStateDirectories } from "../transactions/stateRoot.js";
import {
  decryptChangeSetBlob,
  deriveChangeSetBlobKey,
  deriveChangeSetManifestKey,
  encryptChangeSetBlob
} from "./crypto.js";
import {
  changeSetBlobIdSchema,
  changeSetManifestDraftV1Schema,
  changeSetManifestV1Schema
} from "./schemas.js";
import {
  ChangeSetError,
  type ChangeSetManifestDraftV1,
  type ChangeSetManifestV1,
  type ChangeSetRetentionConfig,
  type ChangeSetState,
  type ChangeSetUndoReason
} from "./types.js";

const ENVELOPE_OVERHEAD_BYTES = 37;

export const DEFAULT_CHANGE_SET_RETENTION: Readonly<ChangeSetRetentionConfig> = Object.freeze({
  maxPlaintextBytesPerChangeSet: 8 * 1024 * 1024,
  maxInstallationCiphertextBytes: 128 * 1024 * 1024,
  maxActivePerWorkspace: 20,
  activeRetentionMs: 24 * 60 * 60_000,
  tombstoneRetentionMs: 30 * 24 * 60 * 60_000
});

export interface ChangeSetBlobInput {
  blobId: string;
  operationId: string;
  beforeSha256: string;
  plaintext: Buffer;
}

export interface CreateChangeSetInput {
  manifest: ChangeSetManifestDraftV1;
  blobs: ChangeSetBlobInput[];
}

export interface ChangeSetTransitionInput {
  expectedGeneration: number;
  state: Exclude<ChangeSetState, "active">;
  updatedAt: string;
}

export interface ChangeSetMaintenanceResult {
  expired: string[];
  pruned: string[];
  deletedTombstones: string[];
}

export interface ChangeSetStoreOptions {
  stateRoot: string;
  masterKey: Buffer;
  retention?: Partial<ChangeSetRetentionConfig>;
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
  syncDirectory?: (directory: string) => DirectorySyncCapability;
}

function pathApiFor(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

function requireId(schema: { safeParse(value: unknown): { success: boolean } }, value: string): void {
  if (!schema.safeParse(value).success) {
    throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set state identifier is invalid.");
  }
}

export function changeSetDirectoryFor(
  stateRoot: string,
  workspaceStateKey: string,
  changeSetId: string,
  platform: NodeJS.Platform = process.platform
): string {
  requireId(workspaceStateKeySchema, workspaceStateKey);
  requireId(changeSetIdSchema, changeSetId);
  const api = pathApiFor(platform);
  return api.join(api.resolve(stateRoot), "changesets", workspaceStateKey, changeSetId);
}

export function changeSetBlobPathFor(
  stateRoot: string,
  workspaceStateKey: string,
  changeSetId: string,
  blobId: string,
  platform: NodeJS.Platform = process.platform
): string {
  requireId(changeSetBlobIdSchema, blobId);
  return pathApiFor(platform).join(
    changeSetDirectoryFor(stateRoot, workspaceStateKey, changeSetId, platform),
    "blobs",
    `${blobId}.bin`
  );
}

function validateRetention(
  input: Partial<ChangeSetRetentionConfig> | undefined
): ChangeSetRetentionConfig {
  const value = { ...DEFAULT_CHANGE_SET_RETENTION, ...input };
  for (const [name, amount] of Object.entries(value)) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new ChangeSetError("CHANGE_SET_INVALID", `Change-set retention ${name} is invalid.`);
    }
  }
  return value;
}

function transitionReason(state: Exclude<ChangeSetState, "active">): ChangeSetUndoReason {
  if (state === "undone") return "already_undone";
  if (state === "undo_expired") return "expired";
  return "recovery_required";
}

function isContainedNativePath(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class ChangeSetStore {
  private readonly stateRoot: string;
  private readonly key: Buffer;
  private readonly manifestKey: Buffer;
  private readonly retention: ChangeSetRetentionConfig;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly now: () => number;
  private readonly syncDirectory: (directory: string) => DirectorySyncCapability;
  private readonly atomic: AtomicJsonFileStore<ChangeSetManifestV1>;

  constructor(options: ChangeSetStoreOptions) {
    this.stateRoot = path.resolve(options.stateRoot);
    this.retention = validateRetention(options.retention);
    this.key = deriveChangeSetBlobKey(options.masterKey);
    this.manifestKey = deriveChangeSetManifestKey(options.masterKey);
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.now = options.now ?? Date.now;
    this.syncDirectory = options.syncDirectory ?? AtomicJsonFileStore.defaultDependencies().syncDirectory;
    this.atomic = new AtomicJsonFileStore(this.stateRoot, changeSetManifestV1Schema);
  }

  dispose(): void {
    this.key.fill(0);
    this.manifestKey.fill(0);
  }

  private manifestPath(workspaceStateKey: string, changeSetId: string): string {
    return path.join(changeSetDirectoryFor(this.stateRoot, workspaceStateKey, changeSetId), "manifest.json");
  }

  private assertSafeStateDirectory(directory: string, parent: string): void {
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe directory");
      const realDirectory = fs.realpathSync.native(directory);
      const realParent = fs.realpathSync.native(parent);
      if (!isContainedNativePath(realDirectory, realParent)) throw new Error("escaped directory");
    } catch {
      throw new ChangeSetError(
        "CHANGE_SET_INTEGRITY_FAILURE",
        "Change-set state directory is unsafe."
      );
    }
  }

  private workspaceDirectory(workspaceStateKey: string, create: boolean): string | null {
    requireId(workspaceStateKeySchema, workspaceStateKey);
    const root = transactionStateDirectories(this.stateRoot).changesets;
    if (create) {
      fs.mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    } else if (!fs.existsSync(root)) {
      return null;
    }
    this.assertSafeStateDirectory(root, this.stateRoot);
    const workspace = path.join(root, workspaceStateKey);
    if (create) {
      try {
        fs.mkdirSync(workspace, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set workspace directory is unavailable.");
        }
      }
    } else if (!fs.existsSync(workspace)) {
      return null;
    }
    this.assertSafeStateDirectory(workspace, root);
    return workspace;
  }

  private signManifest(
    manifest: ChangeSetManifestDraftV1 | ChangeSetManifestV1
  ): ChangeSetManifestV1 {
    const { manifestMac: _ignored, ...facts } = manifest as ChangeSetManifestV1;
    const manifestMac = createHmac("sha256", this.manifestKey)
      .update(canonicalJson(facts), "utf8")
      .digest("hex");
    return changeSetManifestV1Schema.parse({ ...facts, manifestMac });
  }

  private verifyManifest(manifest: ChangeSetManifestV1): ChangeSetManifestV1 {
    const expected = this.signManifest(manifest).manifestMac;
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(manifest.manifestMac, "hex"))) {
      throw new ChangeSetError(
        "CHANGE_SET_INTEGRITY_FAILURE",
        "Change-set manifest authentication failed."
      );
    }
    return manifest;
  }

  private writeManifest(
    manifest: ChangeSetManifestDraftV1 | ChangeSetManifestV1
  ): ChangeSetManifestV1 {
    const signed = this.signManifest(manifest);
    try {
      this.atomic.write(
        this.manifestPath(signed.workspaceStateKey, signed.changeSetId),
        signed
      );
      return signed;
    } catch {
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set manifest could not be persisted.");
    }
  }

  read(workspaceStateKey: string, changeSetId: string): ChangeSetManifestV1 {
    const workspace = this.workspaceDirectory(workspaceStateKey, false);
    if (!workspace) {
      throw new ChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    const directory = changeSetDirectoryFor(this.stateRoot, workspaceStateKey, changeSetId);
    if (!fs.existsSync(directory)) {
      throw new ChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    try {
      this.assertSafeStateDirectory(directory, workspace);
      const manifestStat = fs.lstatSync(this.manifestPath(workspaceStateKey, changeSetId));
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("unsafe manifest");
      return this.verifyManifest(
        this.atomic.read(this.manifestPath(workspaceStateKey, changeSetId))
      );
    } catch {
      throw new ChangeSetError(
        "CHANGE_SET_INTEGRITY_FAILURE",
        "Change-set manifest is missing or invalid."
      );
    }
  }

  list(workspaceStateKey: string): ChangeSetManifestV1[] {
    const directory = this.workspaceDirectory(workspaceStateKey, false);
    if (!directory) return [];
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set workspace index is unavailable.");
    }
    return names
      .filter((name) => changeSetIdSchema.safeParse(name).success)
      .sort()
      .map((changeSetId) => this.read(workspaceStateKey, changeSetId));
  }

  private validateBlobInput(manifest: ChangeSetManifestV1, blob: ChangeSetBlobInput): void {
    requireId(changeSetBlobIdSchema, blob.blobId);
    requireId(operationIdSchema, blob.operationId);
    requireId(sha256Schema, blob.beforeSha256);
    if (!Buffer.isBuffer(blob.plaintext)) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set rollback plaintext is invalid.");
    }
    const operation = manifest.operations.find((candidate) => candidate.operationId === blob.operationId);
    const digest = createHash("sha256").update(blob.plaintext).digest("hex");
    if (
      !operation ||
      operation.blobId !== blob.blobId ||
      !operation.before.exists ||
      operation.before.sha256 !== blob.beforeSha256 ||
      operation.before.bytes !== blob.plaintext.length ||
      digest !== blob.beforeSha256
    ) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set rollback blob facts do not match.");
    }
  }

  private writeBlob(
    workspaceStateKey: string,
    changeSetId: string,
    blob: ChangeSetBlobInput
  ): number {
    const envelope = encryptChangeSetBlob(this.key, blob.plaintext, {
      changeSetId,
      blobId: blob.blobId,
      operationId: blob.operationId,
      beforeSha256: blob.beforeSha256
    }, { randomBytes: this.randomBytes });
    const file = changeSetBlobPathFor(this.stateRoot, workspaceStateKey, changeSetId, blob.blobId);
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(fd, envelope);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      return envelope.length;
    } catch {
      if (fd !== undefined) fs.closeSync(fd);
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Encrypted rollback blob could not be persisted.");
    }
  }

  private nonRetainedManifest(
    manifest: ChangeSetManifestV1,
    reason: ChangeSetUndoReason
  ): ChangeSetManifestV1 {
    return changeSetManifestV1Schema.parse({
      ...manifest,
      undoSupported: false,
      undoReason: reason,
      operations: manifest.operations.map((operation) => ({ ...operation, blobId: null })),
      plaintextBytes: 0,
      ciphertextBytes: 0
    });
  }

  private reserveCapacity(
    workspaceStateKey: string,
    incomingCiphertextBytes: number,
    now: number
  ): void {
    const oldestFirst = (left: ChangeSetManifestV1, right: ChangeSetManifestV1) =>
      left.createdAt.localeCompare(right.createdAt) || left.changeSetId.localeCompare(right.changeSetId);
    const workspaceActive = this.list(workspaceStateKey)
      .filter((manifest) => manifest.state === "active" && manifest.undoSupported)
      .sort(oldestFirst);
    while (workspaceActive.length >= this.retention.maxActivePerWorkspace) {
      const oldest = workspaceActive.shift();
      if (!oldest) break;
      this.prune(oldest, "workspace_count_limit", now);
    }

    const installationActive = this.all()
      .filter((manifest) => manifest.state === "active" && manifest.undoSupported)
      .sort(oldestFirst);
    let total = installationActive.reduce((sum, manifest) => sum + manifest.ciphertextBytes, 0);
    while (total + incomingCiphertextBytes > this.retention.maxInstallationCiphertextBytes) {
      const oldest = installationActive.shift();
      if (!oldest) {
        throw new ChangeSetError("CHANGE_SET_LIMIT_EXCEEDED", "Change-set retention capacity is unavailable.");
      }
      total -= oldest.ciphertextBytes;
      this.prune(oldest, "installation_limit", now);
    }
  }

  create(input: CreateChangeSetInput): ChangeSetManifestV1 {
    let draft: ChangeSetManifestDraftV1;
    try {
      draft = changeSetManifestDraftV1Schema.parse(input.manifest);
    } catch {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Initial change-set manifest is invalid.");
    }
    if (draft.generation !== 1 || draft.state !== "active") {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Initial change set must be active at generation 1.");
    }
    const initialManifest = this.signManifest(draft);
    const blobIds = input.blobs.map((blob) => blob.blobId);
    if (new Set(blobIds).size !== blobIds.length) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set rollback blob IDs must be unique.");
    }
    for (const blob of input.blobs) this.validateBlobInput(initialManifest, blob);
    const referenced = initialManifest.operations.flatMap((operation) => operation.blobId ? [operation.blobId] : []);
    if (referenced.length !== input.blobs.length || referenced.some((blobId) => !blobIds.includes(blobId))) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set rollback blob coverage is incomplete.");
    }
    const plaintextBytes = input.blobs.reduce((sum, blob) => sum + blob.plaintext.length, 0);
    const ciphertextBytes = plaintextBytes + input.blobs.length * ENVELOPE_OVERHEAD_BYTES;
    if (
      initialManifest.plaintextBytes !== plaintextBytes ||
      initialManifest.ciphertextBytes !== ciphertextBytes
    ) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set rollback byte counts are inconsistent.");
    }
    let manifest = this.signManifest(changeSetManifestDraftV1Schema.parse({
      ...draft,
      expiresAt: new Date(Date.parse(draft.createdAt) + this.retention.activeRetentionMs).toISOString()
    }));
    if (plaintextBytes > this.retention.maxPlaintextBytesPerChangeSet) {
      manifest = this.nonRetainedManifest(manifest, "plaintext_limit");
    } else if (ciphertextBytes > this.retention.maxInstallationCiphertextBytes) {
      manifest = this.nonRetainedManifest(manifest, "installation_limit");
    }
    if (manifest.undoSupported) {
      const maintenanceTime = this.now();
      try {
        this.maintain(maintenanceTime);
        this.reserveCapacity(
          manifest.workspaceStateKey,
          manifest.ciphertextBytes,
          maintenanceTime
        );
      } catch {
        manifest = this.nonRetainedManifest(manifest, "retention_unavailable");
      }
    }

    const workspaceDirectory = this.workspaceDirectory(manifest.workspaceStateKey, true);
    if (!workspaceDirectory) {
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set workspace directory is unavailable.");
    }
    const directory = changeSetDirectoryFor(
      this.stateRoot,
      manifest.workspaceStateKey,
      manifest.changeSetId
    );
    let directoryCreated = false;
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      directoryCreated = true;
      fs.mkdirSync(path.join(directory, "blobs"), { mode: 0o700 });
    } catch (error) {
      if (directoryCreated) {
        try {
          fs.rmSync(directory, { recursive: true, force: true });
        } catch {
          // The incomplete exclusive directory remains fail-closed.
        }
      }
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ChangeSetError("CHANGE_SET_STATE_CONFLICT", "Change-set ID already exists.");
      }
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set directory could not be created.");
    }

    try {
      if (manifest.undoSupported) {
        let writtenCiphertextBytes = 0;
        for (const blob of input.blobs) {
          writtenCiphertextBytes += this.writeBlob(
            manifest.workspaceStateKey,
            manifest.changeSetId,
            blob
          );
        }
        if (writtenCiphertextBytes !== manifest.ciphertextBytes) {
          throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Encrypted rollback byte count drifted.");
        }
        if (this.syncDirectory(path.join(directory, "blobs")) === "failed") {
          throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Rollback blob directory could not be synchronized.");
        }
      }
      manifest = this.writeManifest(manifest);
    } catch (error) {
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch {
        // The exclusive change-set directory remains fail-closed if cleanup fails.
      }
      throw error;
    }

    return this.read(manifest.workspaceStateKey, manifest.changeSetId);
  }

  readBlob(
    workspaceStateKey: string,
    changeSetId: string,
    blobId: string
  ): Buffer {
    requireId(changeSetBlobIdSchema, blobId);
    const manifest = this.read(workspaceStateKey, changeSetId);
    const operation = manifest.operations.find((candidate) => candidate.blobId === blobId);
    if (!operation || !operation.before.exists || operation.before.sha256 === null) {
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Rollback blob is not referenced.");
    }
    const file = changeSetBlobPathFor(this.stateRoot, workspaceStateKey, changeSetId, blobId);
    let envelope: Buffer;
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024 + ENVELOPE_OVERHEAD_BYTES) {
        throw new Error("unsafe blob");
      }
      envelope = fs.readFileSync(file);
    } catch {
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Rollback blob is missing or invalid.");
    }
    const plaintext = decryptChangeSetBlob(this.key, envelope, {
      changeSetId,
      blobId,
      operationId: operation.operationId,
      beforeSha256: operation.before.sha256
    });
    const digest = createHash("sha256").update(plaintext).digest("hex");
    if (digest !== operation.before.sha256 || plaintext.length !== operation.before.bytes) {
      plaintext.fill(0);
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Rollback plaintext facts do not match.");
    }
    return plaintext;
  }

  private authenticateReferencedBlobs(manifest: ChangeSetManifestV1): void {
    for (const operation of manifest.operations) {
      if (operation.blobId) {
        const plaintext = this.readBlob(
          manifest.workspaceStateKey,
          manifest.changeSetId,
          operation.blobId
        );
        plaintext.fill(0);
      }
    }
  }

  private removeReferencedBlobs(manifest: ChangeSetManifestV1): void {
    for (const operation of manifest.operations) {
      if (!operation.blobId) continue;
      try {
        fs.unlinkSync(changeSetBlobPathFor(
          this.stateRoot,
          manifest.workspaceStateKey,
          manifest.changeSetId,
          operation.blobId
        ));
      } catch {
        throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Unreferenced rollback blob cleanup failed.");
      }
    }
  }

  private replaceWithNonRetained(
    manifest: ChangeSetManifestV1,
    state: ChangeSetState,
    reason: ChangeSetUndoReason,
    updatedAt: string
  ): ChangeSetManifestV1 {
    this.authenticateReferencedBlobs(manifest);
    const next = changeSetManifestV1Schema.parse({
      ...this.nonRetainedManifest(manifest, reason),
      generation: manifest.generation + 1,
      updatedAt,
      state
    });
    const persisted = this.writeManifest(next);
    this.removeReferencedBlobs(manifest);
    return persisted;
  }

  transition(
    workspaceStateKey: string,
    changeSetId: string,
    input: ChangeSetTransitionInput
  ): ChangeSetManifestV1 {
    const manifest = this.read(workspaceStateKey, changeSetId);
    if (
      manifest.generation !== input.expectedGeneration ||
      manifest.state !== "active" ||
      !Number.isSafeInteger(input.expectedGeneration)
    ) {
      throw new ChangeSetError("CHANGE_SET_STATE_CONFLICT", "Change-set transition is stale or invalid.");
    }
    if (!Number.isFinite(Date.parse(input.updatedAt)) || Date.parse(input.updatedAt) < Date.parse(manifest.updatedAt)) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set transition timestamp is invalid.");
    }
    return this.replaceWithNonRetained(
      manifest,
      input.state,
      transitionReason(input.state),
      input.updatedAt
    );
  }

  private all(): ChangeSetManifestV1[] {
    const root = transactionStateDirectories(this.stateRoot).changesets;
    let workspaceKeys: string[];
    try {
      if (!fs.existsSync(root)) return [];
      this.assertSafeStateDirectory(root, this.stateRoot);
      workspaceKeys = fs.readdirSync(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set index is unavailable.");
    }
    return workspaceKeys
      .filter((key) => workspaceStateKeySchema.safeParse(key).success)
      .sort()
      .flatMap((key) => this.list(key));
  }

  private prune(manifest: ChangeSetManifestV1, reason: ChangeSetUndoReason, now: number): void {
    if (!manifest.undoSupported || manifest.state !== "active") return;
    this.replaceWithNonRetained(manifest, "active", reason, new Date(now).toISOString());
  }

  private deleteTombstone(manifest: ChangeSetManifestV1): void {
    const directory = changeSetDirectoryFor(
      this.stateRoot,
      manifest.workspaceStateKey,
      manifest.changeSetId
    );
    const blobs = path.join(directory, "blobs");
    try {
      const names = fs.readdirSync(directory).sort();
      const blobNames = fs.readdirSync(blobs);
      if (names.join("\0") !== "blobs\0manifest.json" || blobNames.length !== 0) {
        throw new Error("unexpected tombstone artifacts");
      }
      fs.rmdirSync(blobs);
      fs.unlinkSync(path.join(directory, "manifest.json"));
      fs.rmdirSync(directory);
    } catch {
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Change-set tombstone cleanup was unsafe.");
    }
  }

  maintain(now: number = this.now()): ChangeSetMaintenanceResult {
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set maintenance time is invalid.");
    }
    const result: ChangeSetMaintenanceResult = { expired: [], pruned: [], deletedTombstones: [] };
    let manifests = this.all();
    for (const manifest of manifests) {
      if (
        manifest.state === "active" &&
        manifest.undoSupported &&
        Date.parse(manifest.expiresAt) <= now
      ) {
        this.replaceWithNonRetained(
          manifest,
          "undo_expired",
          "expired",
          new Date(now).toISOString()
        );
        result.expired.push(manifest.changeSetId);
      }
    }

    manifests = this.all();
    const workspaceGroups = new Map<string, ChangeSetManifestV1[]>();
    for (const manifest of manifests) {
      const group = workspaceGroups.get(manifest.workspaceStateKey) ?? [];
      group.push(manifest);
      workspaceGroups.set(manifest.workspaceStateKey, group);
    }
    for (const group of workspaceGroups.values()) {
      const active = group
        .filter((manifest) => manifest.state === "active" && manifest.undoSupported)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.changeSetId.localeCompare(right.changeSetId));
      while (active.length > this.retention.maxActivePerWorkspace) {
        const oldest = active.shift();
        if (!oldest) break;
        this.prune(oldest, "workspace_count_limit", now);
        result.pruned.push(oldest.changeSetId);
      }
    }

    manifests = this.all();
    const active = manifests
      .filter((manifest) => manifest.state === "active" && manifest.undoSupported)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.changeSetId.localeCompare(right.changeSetId));
    let total = active.reduce((sum, manifest) => sum + manifest.ciphertextBytes, 0);
    while (total > this.retention.maxInstallationCiphertextBytes) {
      const oldest = active.shift();
      if (!oldest) break;
      total -= oldest.ciphertextBytes;
      this.prune(oldest, "installation_limit", now);
      result.pruned.push(oldest.changeSetId);
    }

    manifests = this.all();
    for (const manifest of manifests) {
      if (
        (manifest.state === "undo_expired" || manifest.state === "undone") &&
        Date.parse(manifest.updatedAt) + this.retention.tombstoneRetentionMs <= now
      ) {
        this.deleteTombstone(manifest);
        result.deletedTombstones.push(manifest.changeSetId);
      }
    }
    result.expired.sort();
    result.pruned = [...new Set(result.pruned)].sort();
    result.deletedTombstones.sort();
    return result;
  }
}

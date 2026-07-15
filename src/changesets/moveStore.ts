import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../audit/canonicalJson.js";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import { deriveTransactionSubkey } from "../transactions/installation.js";
import { changeSetIdSchema, workspaceStateKeySchema } from "../transactions/schemas.js";
import { transactionStateDirectories } from "../transactions/stateRoot.js";
import { changeSetDirectoryFor } from "./store.js";
import {
  moveChangeSetManifestDraftV2Schema,
  moveChangeSetManifestV2Schema
} from "./schemas.js";
import {
  ChangeSetError,
  type ChangeSetState,
  type MoveChangeSetManifestDraftV2,
  type MoveChangeSetManifestV2
} from "./types.js";

export interface MoveChangeSetStoreOptions {
  stateRoot: string;
  masterKey: Buffer;
  activeRetentionMs?: number;
  now?: () => number;
}

export interface MoveChangeSetTransitionInput {
  expectedGeneration: number;
  state: Exclude<ChangeSetState, "active">;
  updatedAt: string;
}

function transitionReason(state: Exclude<ChangeSetState, "active">) {
  if (state === "undone") return "already_undone" as const;
  if (state === "undo_expired") return "expired" as const;
  return "recovery_required" as const;
}

function contained(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class MoveChangeSetStore {
  private readonly stateRoot: string;
  private readonly key: Buffer;
  private readonly atomic: AtomicJsonFileStore<MoveChangeSetManifestV2>;
  private readonly activeRetentionMs: number;
  private readonly now: () => number;

  constructor(options: MoveChangeSetStoreOptions) {
    this.stateRoot = path.resolve(options.stateRoot);
    this.key = deriveTransactionSubkey(options.masterKey, "change-set-manifest-v2");
    this.atomic = new AtomicJsonFileStore(this.stateRoot, moveChangeSetManifestV2Schema);
    this.activeRetentionMs = options.activeRetentionMs ?? 24 * 60 * 60_000;
    this.now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.activeRetentionMs) || this.activeRetentionMs <= 0) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Move change-set retention is invalid.");
    }
  }

  dispose(): void {
    this.key.fill(0);
  }

  private workspaceDirectory(workspaceStateKey: string, create: boolean): string | null {
    if (!workspaceStateKeySchema.safeParse(workspaceStateKey).success) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Move change-set workspace key is invalid.");
    }
    const directories = transactionStateDirectories(this.stateRoot);
    const directory = path.join(directories.changesets, workspaceStateKey);
    if (!fs.existsSync(directory)) {
      if (!create) return null;
      try {
        fs.mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Move change-set workspace directory is unavailable.");
        }
      }
    }
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe directory");
      const real = fs.realpathSync.native(directory);
      const parent = fs.realpathSync.native(directories.changesets);
      if (!contained(real, parent)) throw new Error("escaped directory");
    } catch {
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Move change-set workspace directory is unsafe.");
    }
    return directory;
  }

  private manifestPath(workspaceStateKey: string, changeSetId: string): string {
    if (!changeSetIdSchema.safeParse(changeSetId).success) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Move change-set ID is invalid.");
    }
    return path.join(changeSetDirectoryFor(this.stateRoot, workspaceStateKey, changeSetId), "manifest.json");
  }

  private sign(
    manifest: MoveChangeSetManifestDraftV2 | MoveChangeSetManifestV2
  ): MoveChangeSetManifestV2 {
    const { manifestMac: _ignored, ...facts } = manifest as MoveChangeSetManifestV2;
    const manifestMac = createHmac("sha256", this.key)
      .update(canonicalJson(facts), "utf8")
      .digest("hex");
    return moveChangeSetManifestV2Schema.parse({ ...facts, manifestMac });
  }

  private verify(manifest: MoveChangeSetManifestV2): MoveChangeSetManifestV2 {
    const expected = Buffer.from(this.sign(manifest).manifestMac, "hex");
    const actual = Buffer.from(manifest.manifestMac, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Move change-set authentication failed.");
    }
    return manifest;
  }

  create(input: MoveChangeSetManifestDraftV2): MoveChangeSetManifestV2 {
    let draft: MoveChangeSetManifestDraftV2;
    try {
      draft = moveChangeSetManifestDraftV2Schema.parse(input);
    } catch {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Initial move change-set manifest is invalid.");
    }
    if (draft.generation !== 1 || draft.state !== "active") {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Initial move change set must be active at generation 1.");
    }
    const createdMs = Date.parse(draft.createdAt);
    const signed = this.sign(moveChangeSetManifestDraftV2Schema.parse({
      ...draft,
      expiresAt: new Date(createdMs + this.activeRetentionMs).toISOString(),
      plaintextBytes: 0,
      ciphertextBytes: 0
    }));
    const workspace = this.workspaceDirectory(signed.workspaceStateKey, true);
    if (!workspace) throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Move change-set workspace directory is unavailable.");
    const directory = changeSetDirectoryFor(this.stateRoot, signed.workspaceStateKey, signed.changeSetId);
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ChangeSetError("CHANGE_SET_STATE_CONFLICT", "Move change-set ID already exists.");
      }
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Move change-set directory could not be created.");
    }
    try {
      this.atomic.write(this.manifestPath(signed.workspaceStateKey, signed.changeSetId), signed);
      return this.read(signed.workspaceStateKey, signed.changeSetId);
    } catch (error) {
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch {
        // Exclusive incomplete directory remains fail-closed.
      }
      if (error instanceof ChangeSetError) throw error;
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Move change-set manifest could not be persisted.");
    }
  }

  read(workspaceStateKey: string, changeSetId: string): MoveChangeSetManifestV2 {
    const workspace = this.workspaceDirectory(workspaceStateKey, false);
    if (!workspace) throw new ChangeSetError("CHANGE_SET_NOT_FOUND", "Move change set was not found.");
    const directory = changeSetDirectoryFor(this.stateRoot, workspaceStateKey, changeSetId);
    if (!fs.existsSync(directory)) throw new ChangeSetError("CHANGE_SET_NOT_FOUND", "Move change set was not found.");
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe directory");
      const real = fs.realpathSync.native(directory);
      const parent = fs.realpathSync.native(workspace);
      if (!contained(real, parent)) throw new Error("escaped directory");
      const manifestFile = this.manifestPath(workspaceStateKey, changeSetId);
      const schemaVersion = JSON.parse(fs.readFileSync(manifestFile, "utf8")).schemaVersion;
      if (schemaVersion === 1) {
        throw new ChangeSetError("CHANGE_SET_NOT_FOUND", "Move change set was not found.");
      }
      if (schemaVersion !== 2) throw new Error("invalid manifest version");
      const fileStat = fs.lstatSync(manifestFile);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("unsafe manifest");
      return this.verify(this.atomic.read(manifestFile));
    } catch (error) {
      if (error instanceof ChangeSetError) throw error;
      throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Move change-set manifest is missing or invalid.");
    }
  }

  list(workspaceStateKey: string): MoveChangeSetManifestV2[] {
    const workspace = this.workspaceDirectory(workspaceStateKey, false);
    if (!workspace) return [];
    let names: string[];
    try {
      names = fs.readdirSync(workspace);
    } catch {
      throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Move change-set workspace index is unavailable.");
    }
    const result: MoveChangeSetManifestV2[] = [];
    for (const changeSetId of names.filter((name) => changeSetIdSchema.safeParse(name).success).sort()) {
      const manifestFile = this.manifestPath(workspaceStateKey, changeSetId);
      let version: unknown;
      try {
        version = JSON.parse(fs.readFileSync(manifestFile, "utf8")).schemaVersion;
      } catch {
        throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Move change-set manifest is missing or invalid.");
      }
      if (version !== 2) continue;
      result.push(this.read(workspaceStateKey, changeSetId));
    }
    return result;
  }

  transition(
    workspaceStateKey: string,
    changeSetId: string,
    input: MoveChangeSetTransitionInput
  ): MoveChangeSetManifestV2 {
    const current = this.read(workspaceStateKey, changeSetId);
    if (current.generation !== input.expectedGeneration || current.state !== "active") {
      if (current.state === input.state) return current;
      throw new ChangeSetError("CHANGE_SET_STATE_CONFLICT", "Move change-set transition is stale or invalid.");
    }
    const updatedMs = Date.parse(input.updatedAt);
    if (!Number.isFinite(updatedMs) || updatedMs < Date.parse(current.updatedAt) || updatedMs > this.now() + 5 * 60_000) {
      throw new ChangeSetError("CHANGE_SET_INVALID", "Move change-set transition timestamp is invalid.");
    }
    const { manifestMac: _ignored, ...currentFacts } = current;
    const next = this.sign(moveChangeSetManifestDraftV2Schema.parse({
      ...currentFacts,
      generation: current.generation + 1,
      updatedAt: input.updatedAt,
      state: input.state,
      undoSupported: false,
      undoReason: transitionReason(input.state)
    }));
    this.atomic.write(this.manifestPath(workspaceStateKey, changeSetId), next);
    return this.read(workspaceStateKey, changeSetId);
  }

  probe(workspaceStateKey: string, changeSetId: string): "present" | "absent" | "unknown" {
    try {
      this.read(workspaceStateKey, changeSetId);
      return "present";
    } catch (error) {
      if (error instanceof ChangeSetError && error.code === "CHANGE_SET_NOT_FOUND") return "absent";
      return "unknown";
    }
  }
}

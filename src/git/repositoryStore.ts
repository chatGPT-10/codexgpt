import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import {
  deriveGateRSubkey,
  gateRError,
  gateRRecordMac,
  gitStateDirectories,
  openGitState,
  sealGitState,
  verifyGateRRecordMac,
  type SealedGitStateV1
} from "./durableState.js";

const timestampSchema = z.string().datetime({ offset: true });
const sealedSchema: z.ZodType<SealedGitStateV1> = z.object({
  schemaVersion: z.literal(1),
  iv: z.string().min(16).max(32),
  ciphertext: z.string().min(4).max(400_000),
  tag: z.string().min(20).max(32)
}).strict();

export interface GitRepositoryPrivateStateV1 {
  worktreeRoot: string;
  gitDir: string;
  commonDir: string;
}

export interface GitRepositoryRecordV1 {
  schemaVersion: 1;
  repositoryStateKey: string;
  repositoryId: string;
  generation: number;
  state: "active" | "recovery_required";
  stableIdentityFingerprint: string;
  repositoryFingerprint: string;
  capabilityRevision: string;
  objectFormat: "sha1" | "sha256";
  refStorage: "files" | "reftable";
  worktreeStateKeys: string[];
  recoveryCode: string | null;
  privateState: SealedGitStateV1;
  createdAt: string;
  updatedAt: string;
  recordMac: string;
}

const recordSchema: z.ZodType<GitRepositoryRecordV1> = z.object({
  schemaVersion: z.literal(1),
  repositoryStateKey: z.string().regex(/^grs_[a-f0-9]{32}$/),
  repositoryId: z.string().regex(/^repo_[a-f0-9]{32}$/),
  generation: z.number().int().positive().safe(),
  state: z.enum(["active", "recovery_required"]),
  stableIdentityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  repositoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  capabilityRevision: z.string().regex(/^[a-f0-9]{64}$/),
  objectFormat: z.enum(["sha1", "sha256"]),
  refStorage: z.enum(["files", "reftable"]),
  worktreeStateKeys: z.array(z.string().regex(/^gws_[a-f0-9]{32}$/)).max(64)
    .refine((values) => new Set(values).size === values.length),
  recoveryCode: z.string().min(1).max(160).regex(/^[A-Z][A-Z0-9_]*$/).nullable(),
  privateState: sealedSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  recordMac: z.string().regex(/^[a-f0-9]{64}$/)
}).strict().superRefine((value, context) => {
  if ((value.state === "recovery_required") !== (value.recoveryCode !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recoveryCode"], message: "Repository recovery state is inconsistent." });
  }
});

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (value === "Invalid Date") throw gateRError();
  return value;
}

function withoutMac(record: GitRepositoryRecordV1): Omit<GitRepositoryRecordV1, "recordMac"> {
  const { recordMac: _recordMac, ...rest } = record;
  return rest;
}

function privateStateSchema(value: unknown): GitRepositoryPrivateStateV1 {
  try {
    return z.object({
      worktreeRoot: z.string().min(1).max(32_768),
      gitDir: z.string().min(1).max(32_768),
      commonDir: z.string().min(1).max(32_768)
    }).strict().parse(value);
  } catch {
    throw gateRError();
  }
}

export function repositoryStateKeyForIdentity(
  stableIdentityFingerprint: string,
  key: Buffer
): string {
  if (!/^[a-f0-9]{64}$/.test(stableIdentityFingerprint) || key.length !== 32) throw gateRError();
  return `grs_${createHmac("sha256", key)
    .update("repository-state\0", "utf8")
    .update(stableIdentityFingerprint, "utf8")
    .digest("hex").slice(0, 32)}`;
}

export function durableRepositoryIdForIdentity(
  stableIdentityFingerprint: string,
  key: Buffer
): string {
  if (!/^[a-f0-9]{64}$/.test(stableIdentityFingerprint) || key.length !== 32) throw gateRError();
  return `repo_${createHmac("sha256", key)
    .update("repository-public-id\0", "utf8")
    .update(stableIdentityFingerprint, "utf8")
    .digest("hex").slice(0, 32)}`;
}

export class GitRepositoryStore {
  readonly #stateRoot: string;
  readonly #directory: string;
  readonly #atomic: AtomicJsonFileStore<GitRepositoryRecordV1>;
  readonly #stateKey: Buffer;
  readonly #publicIdKey: Buffer;
  readonly #encryptionKey: Buffer;
  readonly #recordKey: Buffer;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  #disposed = false;

  constructor(options: {
    stateRoot: string;
    masterKey: Buffer;
    now?: () => number;
    randomBytes?: (size: number) => Buffer;
  }) {
    this.#stateRoot = path.resolve(options.stateRoot);
    this.#directory = gitStateDirectories(this.#stateRoot).repositories;
    this.#atomic = new AtomicJsonFileStore(this.#stateRoot, recordSchema);
    this.#stateKey = deriveGateRSubkey(options.masterKey, "repository-state-key");
    this.#publicIdKey = deriveGateRSubkey(options.masterKey, "repository-public-id");
    this.#encryptionKey = deriveGateRSubkey(options.masterKey, "repository-private-state");
    this.#recordKey = deriveGateRSubkey(options.masterKey, "repository-record-mac");
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  recordPath(repositoryStateKey: string): string {
    this.#assertOpen();
    if (!/^grs_[a-f0-9]{32}$/.test(repositoryStateKey)) throw gateRError();
    return path.join(this.#directory, `${repositoryStateKey}.json`);
  }

  register(identity: GitRepositoryIdentity): GitRepositoryRecordV1 {
    this.#assertOpen();
    const repositoryStateKey = repositoryStateKeyForIdentity(identity.stableIdentityFingerprint, this.#stateKey);
    const repositoryId = durableRepositoryIdForIdentity(identity.stableIdentityFingerprint, this.#publicIdKey);
    const file = this.recordPath(repositoryStateKey);
    if (fs.existsSync(file)) {
      const existing = this.read(repositoryStateKey).record;
      if (
        existing.repositoryId !== repositoryId ||
        existing.stableIdentityFingerprint !== identity.stableIdentityFingerprint ||
        existing.capabilityRevision !== identity.capabilityRevision ||
        existing.objectFormat !== identity.objectFormat ||
        existing.refStorage !== identity.refStorage
      ) throw gateRError();
      return existing;
    }
    const at = timestamp(this.#now);
    const privateState = sealGitState(
      this.#encryptionKey,
      `git-repository-v1:${repositoryStateKey}`,
      privateStateSchema({
        worktreeRoot: identity.worktreeRoot,
        gitDir: identity.gitDir,
        commonDir: identity.commonDir
      }),
      this.#randomBytes
    );
    const unsigned: Omit<GitRepositoryRecordV1, "recordMac"> = {
      schemaVersion: 1,
      repositoryStateKey,
      repositoryId,
      generation: 1,
      state: "active",
      stableIdentityFingerprint: identity.stableIdentityFingerprint,
      repositoryFingerprint: identity.repositoryFingerprint,
      capabilityRevision: identity.capabilityRevision,
      objectFormat: identity.objectFormat,
      refStorage: identity.refStorage,
      worktreeStateKeys: [],
      recoveryCode: null,
      privateState,
      createdAt: at,
      updatedAt: at
    };
    let record: GitRepositoryRecordV1;
    try {
      record = recordSchema.parse({
        ...unsigned,
        recordMac: gateRRecordMac(this.#recordKey, unsigned)
      });
    } catch {
      throw gateRError();
    }
    try {
      this.#atomic.write(file, record);
    } catch {
      throw gateRError();
    }
    return Object.freeze(record);
  }

  read(repositoryStateKey: string): {
    record: GitRepositoryRecordV1;
    privateState: GitRepositoryPrivateStateV1;
  } {
    this.#assertOpen();
    try {
      const record = recordSchema.parse(this.#atomic.read(this.recordPath(repositoryStateKey)));
      verifyGateRRecordMac(this.#recordKey, withoutMac(record), record.recordMac);
      const privateState = privateStateSchema(openGitState(
        this.#encryptionKey,
        `git-repository-v1:${repositoryStateKey}`,
        record.privateState
      ));
      return { record: Object.freeze(record), privateState: Object.freeze(privateState) };
    } catch {
      throw gateRError();
    }
  }

  list(): GitRepositoryRecordV1[] {
    this.#assertOpen();
    let names: string[];
    try {
      names = fs.readdirSync(this.#directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw gateRError();
    }
    return names.filter((name) => /^grs_[a-f0-9]{32}\.json$/.test(name)).sort()
      .map((name) => this.read(name.slice(0, -5)).record);
  }

  markRecoveryRequired(repositoryStateKey: string, recoveryCode: string): GitRepositoryRecordV1 {
    this.#assertOpen();
    if (!/^[A-Z][A-Z0-9_]{0,159}$/.test(recoveryCode)) throw gateRError();
    const current = this.read(repositoryStateKey).record;
    if (current.state === "recovery_required") return current;
    const unsigned: Omit<GitRepositoryRecordV1, "recordMac"> = {
      ...withoutMac(current),
      generation: current.generation + 1,
      state: "recovery_required",
      recoveryCode,
      updatedAt: timestamp(this.#now)
    };
    let next: GitRepositoryRecordV1;
    try {
      next = recordSchema.parse({ ...unsigned, recordMac: gateRRecordMac(this.#recordKey, unsigned) });
    } catch {
      throw gateRError();
    }
    try {
      const persisted = this.read(repositoryStateKey).record;
      if (persisted.generation !== current.generation || persisted.recordMac !== current.recordMac) throw gateRError();
      this.#atomic.write(this.recordPath(repositoryStateKey), next);
      return Object.freeze(next);
    } catch {
      throw gateRError();
    }
  }

  activate(repositoryStateKey: string): GitRepositoryRecordV1 {
    const current = this.read(repositoryStateKey).record;
    if (current.state !== "active") throw gateRError();
    return current;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stateKey.fill(0);
    this.#publicIdKey.fill(0);
    this.#encryptionKey.fill(0);
    this.#recordKey.fill(0);
  }

  #assertOpen(): void {
    if (this.#disposed) throw gateRError();
  }
}

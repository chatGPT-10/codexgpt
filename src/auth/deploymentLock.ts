import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";
import { classifyProcessLiveness } from "../transactions/workspaceLock.js";
import { authConfigurationError } from "./errors.js";
import { authStatePaths } from "./stateStore.js";

const instanceSchema = z.object({
  schemaVersion: z.literal(1),
  instanceId: z.string().regex(/^authinstance_[a-f0-9]{32}$/),
  pid: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true })
}).strict();

const ownerSchema = z.object({
  schemaVersion: z.literal(1),
  lockToken: z.string().regex(/^authlock_[a-f0-9]{32}$/),
  runId: z.string().regex(/^authrun_[a-f0-9]{32}$/),
  instanceId: z.string().regex(/^authinstance_[a-f0-9]{32}$/),
  pid: z.number().int().positive(),
  lockName: z.string().regex(/^(?:installation|registry|deployment_binding_[a-f0-9]{32})$/),
  createdAt: z.string().datetime({ offset: true })
}).strict();

type AuthLockOwnerV1 = z.infer<typeof ownerSchema>;

function writeExclusive(file: string, value: unknown): void {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } catch {
    throw authConfigurationError("OAUTH_STATE_BUSY", "OAuth lock ownership could not be persisted.");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function isExists(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM" || code === "EACCES";
}

export interface AuthLockDependencies {
  pid?: number;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  kill?: (pid: number, signal: 0) => void;
}

export class AuthProcessInstanceRegistry {
  readonly record: z.infer<typeof instanceSchema>;
  readonly recordPath: string;
  readonly #instancesDirectory: string;
  #disposed = false;

  constructor(stateRoot: string, dependencies: AuthLockDependencies = {}) {
    const runtime = authStatePaths(stateRoot).runtimeDirectory;
    this.#instancesDirectory = path.join(runtime, "instances");
    fs.mkdirSync(this.#instancesDirectory, { recursive: true, mode: 0o700 });
    const random = (dependencies.randomBytes ?? nodeRandomBytes)(16);
    if (!Buffer.isBuffer(random) || random.length !== 16) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth process instance random source is invalid.");
    }
    this.record = instanceSchema.parse({
      schemaVersion: 1,
      instanceId: `authinstance_${random.toString("hex")}`,
      pid: dependencies.pid ?? process.pid,
      createdAt: new Date((dependencies.now ?? Date.now)()).toISOString()
    });
    this.recordPath = path.join(this.#instancesDirectory, `${this.record.instanceId}.json`);
    writeExclusive(this.recordPath, this.record);
  }

  isVerifiable(instanceId: string, pid: number): boolean {
    if (!/^authinstance_[a-f0-9]{32}$/.test(instanceId)) return false;
    try {
      const record = instanceSchema.parse(JSON.parse(fs.readFileSync(path.join(this.#instancesDirectory, `${instanceId}.json`), "utf8")));
      return record.instanceId === instanceId && record.pid === pid;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      const current = instanceSchema.parse(JSON.parse(fs.readFileSync(this.recordPath, "utf8")));
      if (current.instanceId === this.record.instanceId && current.pid === this.record.pid) fs.unlinkSync(this.recordPath);
    } catch {
      // Exact-instance cleanup is best effort and never affects lock correctness.
    }
  }
}

export class AuthStateLockHandle {
  #released = false;

  constructor(
    readonly lockDirectory: string,
    readonly recoveryDirectories: readonly string[],
    readonly owner: AuthLockOwnerV1
  ) {}

  release(): void {
    if (this.#released) return;
    let current: AuthLockOwnerV1;
    try {
      current = ownerSchema.parse(JSON.parse(fs.readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")));
    } catch {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth lock owner record is invalid.");
    }
    if (
      current.lockToken !== this.owner.lockToken ||
      current.runId !== this.owner.runId ||
      current.instanceId !== this.owner.instanceId ||
      current.pid !== this.owner.pid
    ) {
      throw authConfigurationError("OAUTH_STATE_BUSY", "OAuth lock ownership changed before release.");
    }
    const released = `${this.lockDirectory}.release-${this.owner.lockToken.slice(9, 25)}`;
    try {
      fs.renameSync(this.lockDirectory, released);
      fs.rmSync(released, { recursive: true, force: true });
      this.#released = true;
    } catch {
      throw authConfigurationError("OAUTH_STATE_BUSY", "OAuth lock could not be released safely.");
    }
  }
}

export class AuthStateLock {
  readonly #lockRoot: string;
  readonly #registry: AuthProcessInstanceRegistry;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #now: () => number;
  readonly #kill: (pid: number, signal: 0) => void;

  constructor(stateRoot: string, registry: AuthProcessInstanceRegistry, dependencies: AuthLockDependencies = {}) {
    this.#lockRoot = path.join(authStatePaths(stateRoot).runtimeDirectory, "locks");
    this.#registry = registry;
    this.#randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
    this.#now = dependencies.now ?? Date.now;
    this.#kill = dependencies.kill ?? process.kill.bind(process);
  }

  acquire(lockName: "installation" | "registry" | `deployment_binding_${string}`): AuthStateLockHandle {
    if (!/^(?:installation|registry|deployment_binding_[a-f0-9]{32})$/.test(lockName)) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth lock name is invalid.");
    }
    fs.mkdirSync(this.#lockRoot, { recursive: true, mode: 0o700 });
    const lockDirectory = path.join(this.#lockRoot, `${lockName}.lock`);
    const recoveryDirectories: string[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const claim = this.#claim(lockDirectory, lockName, recoveryDirectories);
      if (claim) return claim;
      let owner: AuthLockOwnerV1;
      try {
        owner = ownerSchema.parse(JSON.parse(fs.readFileSync(path.join(lockDirectory, "owner.json"), "utf8")));
      } catch {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth lock owner cannot be verified.");
      }
      const liveness = classifyProcessLiveness(owner.pid, this.#kill);
      if (liveness !== "dead") {
        throw authConfigurationError(
          "OAUTH_STATE_BUSY",
          `OAuth state is owned by pid ${owner.pid}, run ${owner.runId}.`
        );
      }
      if (!this.#registry.isVerifiable(owner.instanceId, owner.pid)) {
        throw authConfigurationError("OAUTH_STATE_BUSY", "Dead OAuth lock owner lacks exact instance evidence.");
      }
      const suffix = this.#random(8).toString("hex");
      const recovery = `${lockDirectory}.recovery-${suffix}`;
      try {
        fs.renameSync(lockDirectory, recovery);
        recoveryDirectories.push(recovery);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || isExists(error)) continue;
        throw authConfigurationError("OAUTH_STATE_BUSY", "Dead OAuth lock could not be quarantined safely.");
      }
    }
    throw authConfigurationError("OAUTH_STATE_BUSY", "OAuth state lock remained contended.");
  }

  #claim(lockDirectory: string, lockName: string, recoveryDirectories: readonly string[]): AuthStateLockHandle | null {
    const claimDirectory = `${lockDirectory}.claim-${this.#random(8).toString("hex")}`;
    const owner = ownerSchema.parse({
      schemaVersion: 1,
      lockToken: `authlock_${this.#random(16).toString("hex")}`,
      runId: `authrun_${this.#random(16).toString("hex")}`,
      instanceId: this.#registry.record.instanceId,
      pid: this.#registry.record.pid,
      lockName,
      createdAt: new Date(this.#now()).toISOString()
    });
    try {
      fs.mkdirSync(claimDirectory, { mode: 0o700 });
      writeExclusive(path.join(claimDirectory, "owner.json"), owner);
      try {
        fs.renameSync(claimDirectory, lockDirectory);
        return new AuthStateLockHandle(lockDirectory, recoveryDirectories, owner);
      } catch (error) {
        if (!isExists(error)) {
          throw authConfigurationError("OAUTH_STATE_BUSY", "OAuth lock claim could not be published.");
        }
        return null;
      }
    } finally {
      try {
        fs.rmSync(claimDirectory, { recursive: true, force: true });
      } catch {
        // Private claim cleanup cannot alter a published lock.
      }
    }
  }

  #random(size: number): Buffer {
    const value = this.#randomBytes(size);
    if (!Buffer.isBuffer(value) || value.length !== size) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth lock random source is invalid.");
    }
    return value;
  }
}

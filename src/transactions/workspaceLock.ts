import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import {
  processInstanceRecordV1Schema,
  workspaceLockOwnerV1Schema
} from "./schemas.js";
import { transactionStateDirectories } from "./stateRoot.js";
import {
  TransactionError,
  type ProcessInstanceRecordV1,
  type WorkspaceLockOwnerV1
} from "./types.js";

export type ProcessLiveness = "alive" | "dead" | "unknown";

export function classifyProcessLiveness(
  pid: number,
  kill: (pid: number, signal: 0) => void = process.kill.bind(process)
): ProcessLiveness {
  try {
    kill(pid, 0);
    return "alive";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown";
  }
}

export interface ProcessInstanceRegistryOptions {
  pid?: number;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

function writeExclusiveJson(file: string, value: unknown): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8");
    fs.fsyncSync(fd);
  } catch {
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Process or lock ownership state could not be created."
    );
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export class ProcessInstanceRegistry {
  readonly record: ProcessInstanceRecordV1;
  readonly recordPath: string;
  private disposed = false;

  constructor(
    readonly stateRoot: string,
    options: ProcessInstanceRegistryOptions = {}
  ) {
    const directories = transactionStateDirectories(stateRoot);
    fs.mkdirSync(directories.instances, { recursive: true, mode: 0o700 });
    const random = (options.randomBytes ?? nodeRandomBytes)(16);
    if (random.length !== 16) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Process instance random source is invalid.");
    }
    this.record = processInstanceRecordV1Schema.parse({
      schemaVersion: 1,
      instanceId: `instance_${random.toString("hex")}`,
      pid: options.pid ?? process.pid,
      createdAt: new Date((options.now ?? Date.now)()).toISOString()
    });
    this.recordPath = path.join(directories.instances, `${this.record.instanceId}.json`);
    writeExclusiveJson(this.recordPath, this.record);
  }

  isVerifiable(instanceId: string, pid: number): boolean {
    if (!/^instance_[a-f0-9]{32}$/.test(instanceId)) return false;
    const file = path.join(
      transactionStateDirectories(this.stateRoot).instances,
      `${instanceId}.json`
    );
    try {
      const record = processInstanceRecordV1Schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
      return record.instanceId === instanceId && record.pid === pid;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      const record = processInstanceRecordV1Schema.parse(
        JSON.parse(fs.readFileSync(this.recordPath, "utf8"))
      );
      if (record.instanceId === this.record.instanceId && record.pid === this.record.pid) {
        fs.unlinkSync(this.recordPath);
      }
    } catch {
      // Best-effort disposal; lock correctness does not depend on this cleanup.
    }
  }
}

export interface WorkspaceLockDependencies {
  kill?: (pid: number, signal: 0) => void;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

export interface WorkspaceLockInput {
  workspaceStateKey: string;
  transactionId: string;
}

export class WorkspaceLockHandle {
  private released = false;

  constructor(
    readonly lockDirectory: string,
    readonly recoveryDirectories: readonly string[],
    private readonly owner: WorkspaceLockOwnerV1
  ) {}

  release(): void {
    if (this.released) return;
    const ownerFile = path.join(this.lockDirectory, "owner.json");
    let current: WorkspaceLockOwnerV1;
    try {
      current = workspaceLockOwnerV1Schema.parse(JSON.parse(fs.readFileSync(ownerFile, "utf8")));
    } catch {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Workspace lock owner record is invalid.");
    }
    if (
      current.lockToken !== this.owner.lockToken ||
      current.instanceId !== this.owner.instanceId ||
      current.transactionId !== this.owner.transactionId
    ) {
      throw new TransactionError("TRANSACTION_BUSY", "Workspace lock ownership changed before release.");
    }
    const releaseDirectory = `${this.lockDirectory}.release-${this.owner.lockToken.slice(5, 21)}`;
    try {
      fs.renameSync(this.lockDirectory, releaseDirectory);
    } catch {
      throw new TransactionError("TRANSACTION_BUSY", "Workspace lock could not be released safely.");
    }
    fs.rmSync(releaseDirectory, { recursive: true, force: true });
    this.released = true;
  }
}

export class WorkspaceMutationLock {
  private readonly dependencies: Required<WorkspaceLockDependencies>;

  constructor(
    private readonly stateRoot: string,
    private readonly registry: ProcessInstanceRegistry,
    dependencies: WorkspaceLockDependencies = {}
  ) {
    this.dependencies = {
      kill: dependencies.kill ?? process.kill.bind(process),
      now: dependencies.now ?? Date.now,
      randomBytes: dependencies.randomBytes ?? nodeRandomBytes
    };
  }

  acquire(input: WorkspaceLockInput): WorkspaceLockHandle {
    if (!/^wsk_[a-f0-9]{32}$/.test(input.workspaceStateKey) || !/^tx_[a-f0-9]{32}$/.test(input.transactionId)) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Workspace lock input is invalid.");
    }
    const lockRoot = transactionStateDirectories(this.stateRoot).workspaceLocks;
    fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
    const lockDirectory = path.join(lockRoot, `${input.workspaceStateKey}.lock`);
    const recoveryDirectories: string[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        fs.mkdirSync(lockDirectory, { mode: 0o700 });
        const ownershipBytes = this.dependencies.randomBytes(16);
        if (ownershipBytes.length !== 16) {
          throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Workspace lock random source is invalid.");
        }
        const owner = workspaceLockOwnerV1Schema.parse({
          schemaVersion: 1,
          lockToken: `lock_${ownershipBytes.toString("hex")}`,
          instanceId: this.registry.record.instanceId,
          pid: this.registry.record.pid,
          transactionId: input.transactionId,
          createdAt: new Date(this.dependencies.now()).toISOString()
        });
        try {
          writeExclusiveJson(path.join(lockDirectory, "owner.json"), owner);
        } catch (error) {
          fs.rmSync(lockDirectory, { recursive: true, force: true });
          throw error;
        }
        return new WorkspaceLockHandle(lockDirectory, recoveryDirectories, owner);
      } catch (error) {
        if (error instanceof TransactionError) throw error;
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw new TransactionError("TRANSACTION_FAILED", "Workspace lock acquisition failed.");
        }
      }

      const ownerFile = path.join(lockDirectory, "owner.json");
      let owner: WorkspaceLockOwnerV1;
      try {
        owner = workspaceLockOwnerV1Schema.parse(JSON.parse(fs.readFileSync(ownerFile, "utf8")));
      } catch {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Workspace lock owner record is invalid.");
      }
      const liveness = classifyProcessLiveness(owner.pid, this.dependencies.kill);
      if (liveness !== "dead") {
        const verified = this.registry.isVerifiable(owner.instanceId, owner.pid);
        throw new TransactionError(
          "TRANSACTION_BUSY",
          verified ? "Workspace mutation is already locked." : "Workspace lock owner cannot be verified safely.",
          verified ? { liveOwnerVerified: true } : {}
        );
      }
      const recoveryRandom = this.dependencies.randomBytes(8);
      if (recoveryRandom.length !== 8) {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Workspace lock recovery random source is invalid.");
      }
      const recoveryDirectory = `${lockDirectory}.recovery-${recoveryRandom.toString("hex")}`;
      try {
        fs.renameSync(lockDirectory, recoveryDirectory);
        recoveryDirectories.push(recoveryDirectory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EEXIST") {
          continue;
        }
        throw new TransactionError("TRANSACTION_BUSY", "Workspace lock could not be quarantined safely.");
      }
    }
    throw new TransactionError("TRANSACTION_BUSY", "Workspace mutation lock remained contended.");
  }
}

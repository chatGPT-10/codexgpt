import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";
import { transactionStateDirectories } from "../transactions/stateRoot.js";
import {
  ProcessInstanceRegistry,
  classifyProcessLiveness
} from "../transactions/workspaceLock.js";
import { AuditError } from "./types.js";

const auditLockOwnerV1Schema = z.object({
  schemaVersion: z.literal(1),
  lockToken: z.string().regex(/^auditlock_[a-f0-9]{32}$/),
  instanceId: z.string().regex(/^instance_[a-f0-9]{32}$/),
  pid: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true })
}).strict();

type AuditLockOwnerV1 = z.infer<typeof auditLockOwnerV1Schema>;

export interface AuditWriterLockDependencies {
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
  kill?: (pid: number, signal: 0) => void;
  releaseRenameSync?: (source: string, destination: string) => void;
  releaseRetryDelay?: (milliseconds: number) => void;
}

const RELEASE_RETRY_DELAYS_MS = [1, 2, 4] as const;
const releaseRetrySignal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function defaultReleaseRetryDelay(milliseconds: number): void {
  Atomics.wait(releaseRetrySignal, 0, 0, milliseconds);
}

function isTransientReleaseConflict(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

function writeOwner(file: string, owner: AuditLockOwnerV1): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(owner)}\n`, "utf8");
    fs.fsyncSync(fd);
  } catch {
    throw new AuditError("AUDIT_UNAVAILABLE", "Audit writer ownership could not be persisted.");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function isDestinationExists(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM" || code === "EACCES";
}

export class AuditWriterLockHandle {
  private released = false;

  constructor(
    readonly lockDirectory: string,
    private readonly owner: AuditLockOwnerV1,
    private readonly releaseRenameSync: (source: string, destination: string) => void,
    private readonly releaseRetryDelay: (milliseconds: number) => void
  ) {}

  private assertOwnership(): void {
    const ownerFile = path.join(this.lockDirectory, "owner.json");
    let current: AuditLockOwnerV1;
    try {
      current = auditLockOwnerV1Schema.parse(JSON.parse(fs.readFileSync(ownerFile, "utf8")));
    } catch {
      throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit writer ownership is invalid.");
    }
    if (
      current.lockToken !== this.owner.lockToken ||
      current.instanceId !== this.owner.instanceId ||
      current.pid !== this.owner.pid
    ) {
      throw new AuditError("AUDIT_BUSY", "Audit writer lock ownership changed before release.");
    }
  }

  release(): void {
    if (this.released) return;
    const released = `${this.lockDirectory}.release-${this.owner.lockToken.slice(10, 26)}`;
    for (let attempt = 0; ; attempt += 1) {
      this.assertOwnership();
      try {
        this.releaseRenameSync(this.lockDirectory, released);
        break;
      } catch (error) {
        const retryDelay = RELEASE_RETRY_DELAYS_MS[attempt];
        if (!isTransientReleaseConflict(error) || retryDelay === undefined) {
          throw new AuditError("AUDIT_BUSY", "Audit writer lock could not be released safely.");
        }
        this.releaseRetryDelay(retryDelay);
      }
    }
    fs.rmSync(released, { recursive: true, force: true });
    this.released = true;
  }
}

export class AuditWriterLock {
  private readonly randomBytes: (size: number) => Buffer;
  private readonly now: () => number;
  private readonly kill: (pid: number, signal: 0) => void;
  private readonly releaseRenameSync: (source: string, destination: string) => void;
  private readonly releaseRetryDelay: (milliseconds: number) => void;

  constructor(
    private readonly stateRoot: string,
    private readonly registry: ProcessInstanceRegistry,
    dependencies: AuditWriterLockDependencies = {}
  ) {
    this.randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
    this.now = dependencies.now ?? Date.now;
    this.kill = dependencies.kill ?? process.kill.bind(process);
    this.releaseRenameSync = dependencies.releaseRenameSync ?? fs.renameSync;
    this.releaseRetryDelay = dependencies.releaseRetryDelay ?? defaultReleaseRetryDelay;
  }

  private newOwner(): AuditLockOwnerV1 {
    const bytes = this.randomBytes(16);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit writer random source is invalid.");
    }
    return auditLockOwnerV1Schema.parse({
      schemaVersion: 1,
      lockToken: `auditlock_${bytes.toString("hex")}`,
      instanceId: this.registry.record.instanceId,
      pid: this.registry.record.pid,
      createdAt: new Date(this.now()).toISOString()
    });
  }

  private publishClaim(lockRoot: string, lockDirectory: string): AuditWriterLockHandle | null {
    const claimBytes = this.randomBytes(8);
    if (!Buffer.isBuffer(claimBytes) || claimBytes.length !== 8) {
      throw new AuditError("AUDIT_UNAVAILABLE", "Audit claim random source is invalid.");
    }
    const claimDirectory = path.join(lockRoot, `.writer.claim-${claimBytes.toString("hex")}`);
    const owner = this.newOwner();
    try {
      fs.mkdirSync(claimDirectory, { mode: 0o700 });
      writeOwner(path.join(claimDirectory, "owner.json"), owner);
      try {
        fs.renameSync(claimDirectory, lockDirectory);
        return new AuditWriterLockHandle(
          lockDirectory,
          owner,
          this.releaseRenameSync,
          this.releaseRetryDelay
        );
      } catch (error) {
        if (!isDestinationExists(error)) {
          throw new AuditError("AUDIT_UNAVAILABLE", "Audit writer claim could not be published.");
        }
        return null;
      }
    } finally {
      try {
        fs.rmSync(claimDirectory, { recursive: true, force: true });
      } catch {
        // A failed private-claim cleanup cannot change published lock ownership.
      }
    }
  }

  acquire(): AuditWriterLockHandle {
    const lockRoot = transactionStateDirectories(this.stateRoot).auditLocks;
    fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
    const lockDirectory = path.join(lockRoot, "writer.lock");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const handle = this.publishClaim(lockRoot, lockDirectory);
      if (handle) return handle;

      let owner: AuditLockOwnerV1;
      try {
        owner = auditLockOwnerV1Schema.parse(
          JSON.parse(fs.readFileSync(path.join(lockDirectory, "owner.json"), "utf8"))
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new AuditError("AUDIT_BUSY", "Audit writer ownership changed during acquisition.");
        }
        throw new AuditError("AUDIT_INTEGRITY_FAILURE", "Audit writer owner cannot be verified.");
      }
      const liveness = classifyProcessLiveness(owner.pid, this.kill);
      if (liveness !== "dead") {
        throw new AuditError("AUDIT_BUSY", "Audit writer is already active.");
      }
      if (!this.registry.isVerifiable(owner.instanceId, owner.pid)) {
        throw new AuditError("AUDIT_BUSY", "Dead audit writer ownership cannot be verified.");
      }
      const quarantineBytes = this.randomBytes(8);
      if (!Buffer.isBuffer(quarantineBytes) || quarantineBytes.length !== 8) {
        throw new AuditError("AUDIT_UNAVAILABLE", "Audit lock recovery random source is invalid.");
      }
      const quarantine = `${lockDirectory}.recovery-${quarantineBytes.toString("hex")}`;
      try {
        fs.renameSync(lockDirectory, quarantine);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || isDestinationExists(error)) continue;
        throw new AuditError("AUDIT_BUSY", "Dead audit writer lock could not be quarantined safely.");
      }
    }
    throw new AuditError("AUDIT_BUSY", "Audit writer lock remained contended.");
  }
}

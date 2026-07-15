import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import type { z } from "zod";
import { transactionManifestV1Schema } from "./schemas.js";
import { transactionWorkspaceStateDirectory } from "./stateRoot.js";
import {
  TransactionError,
  type DirectorySyncCapability,
  type TransactionManifestV1
} from "./types.js";

export interface AtomicStateDependencies {
  randomBytes(size: number): Buffer;
  mkdirSync(directory: string, options: { recursive: true; mode: number }): string | undefined;
  openSync(file: string, flags: string, mode?: number): number;
  writeFileSync(fd: number, data: string, encoding: BufferEncoding): void;
  fsyncSync(fd: number): void;
  closeSync(fd: number): void;
  renameSync(from: string, to: string): void;
  unlinkSync(file: string): void;
  readFileSync(file: string, encoding: BufferEncoding): string;
  readdirSync(directory: string): string[];
  statSync(file: string): fs.Stats;
  syncDirectory(directory: string): DirectorySyncCapability;
}

function defaultSyncDirectory(directory: string): DirectorySyncCapability {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, "r");
    fs.fsyncSync(fd);
    return "supported";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EINVAL" || code === "ENOTSUP" || code === "EISDIR" || code === "EPERM" || code === "EACCES") {
      return "unsupported";
    }
    return "failed";
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const DEFAULT_ATOMIC_STATE_DEPENDENCIES: AtomicStateDependencies = {
  randomBytes: nodeRandomBytes,
  mkdirSync: (directory, options) => fs.mkdirSync(directory, options),
  openSync: (file, flags, mode) => fs.openSync(file, flags, mode),
  writeFileSync: (fd, data, encoding) => fs.writeFileSync(fd, data, encoding),
  fsyncSync: (fd) => fs.fsyncSync(fd),
  closeSync: (fd) => fs.closeSync(fd),
  renameSync: (from, to) => fs.renameSync(from, to),
  unlinkSync: (file) => fs.unlinkSync(file),
  readFileSync: (file, encoding) => fs.readFileSync(file, encoding),
  readdirSync: (directory) => fs.readdirSync(directory),
  statSync: (file) => fs.statSync(file),
  syncDirectory: defaultSyncDirectory
};

function isContainedPath(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class AtomicJsonFileStore<T> {
  private readonly resolvedStateRoot: string;

  constructor(
    stateRoot: string,
    private readonly schema: z.ZodType<T>,
    private readonly dependencies: AtomicStateDependencies = DEFAULT_ATOMIC_STATE_DEPENDENCIES
  ) {
    this.resolvedStateRoot = path.resolve(stateRoot);
  }

  static defaultDependencies(): AtomicStateDependencies {
    return { ...DEFAULT_ATOMIC_STATE_DEPENDENCIES };
  }

  private resolveFile(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (!isContainedPath(resolved, this.resolvedStateRoot) || resolved === this.resolvedStateRoot) {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Atomic state file path is outside the configured state root."
      );
    }
    return resolved;
  }

  read(filePath: string): T {
    const resolved = this.resolveFile(filePath);
    try {
      const stat = this.dependencies.statSync(resolved);
      if (!stat.isFile()) throw new Error("not a file");
      return this.schema.parse(JSON.parse(this.dependencies.readFileSync(resolved, "utf8")));
    } catch {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Atomic state file is missing, malformed, or violates its schema."
      );
    }
  }

  write(filePath: string, value: T): DirectorySyncCapability {
    const parsed = this.schema.parse(value);
    const resolved = this.resolveFile(filePath);
    const parent = path.dirname(resolved);
    this.dependencies.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const text = `${JSON.stringify(parsed)}\n`;
    const random = this.dependencies.randomBytes(8);
    if (!Buffer.isBuffer(random) || random.length !== 8) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Atomic state random source is invalid.");
    }
    const temp = path.join(parent, `.${path.basename(resolved)}.tmp-${random.toString("hex")}`);
    if (!isContainedPath(temp, this.resolvedStateRoot) || path.dirname(temp) !== parent) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Atomic state temporary path is invalid.");
    }

    let fd: number | undefined;
    try {
      fd = this.dependencies.openSync(temp, "wx", 0o600);
      this.dependencies.writeFileSync(fd, text, "utf8");
      this.dependencies.fsyncSync(fd);
      this.dependencies.closeSync(fd);
      fd = undefined;
      this.dependencies.renameSync(temp, resolved);
      return this.dependencies.syncDirectory(parent);
    } catch (error) {
      if (fd !== undefined) {
        try {
          this.dependencies.closeSync(fd);
        } catch {
          // Continue cleanup of the exact temporary path.
        }
      }
      try {
        this.dependencies.unlinkSync(temp);
      } catch {
        // The rename may have succeeded, or creation may have failed.
      }
      if (error instanceof TransactionError) throw error;
      throw new TransactionError(
        "TRANSACTION_FAILED",
        "Atomic state file replacement failed."
      );
    }
  }
}

export function manifestPathFor(
  stateRoot: string,
  workspaceStateKey: string,
  transactionId: string
): string {
  if (!/^tx_[a-f0-9]{32}$/.test(transactionId)) {
    throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction ID is invalid.");
  }
  return path.join(
    transactionWorkspaceStateDirectory(stateRoot, "transactions", workspaceStateKey),
    `${transactionId}.json`
  );
}

export class TransactionManifestStore {
  private readonly atomic: AtomicJsonFileStore<TransactionManifestV1>;

  constructor(
    private readonly stateRoot: string,
    dependencies: AtomicStateDependencies = DEFAULT_ATOMIC_STATE_DEPENDENCIES
  ) {
    this.atomic = new AtomicJsonFileStore(
      stateRoot,
      transactionManifestV1Schema,
      dependencies
    );
  }

  read(workspaceStateKey: string, transactionId: string): TransactionManifestV1 {
    return this.atomic.read(manifestPathFor(this.stateRoot, workspaceStateKey, transactionId));
  }

  writeInitial(manifest: TransactionManifestV1): DirectorySyncCapability {
    const parsed = transactionManifestV1Schema.parse(manifest);
    if (parsed.generation !== 1 || parsed.state !== "preparing") {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Initial transaction manifest must use generation 1 and preparing state."
      );
    }
    const file = manifestPathFor(this.stateRoot, parsed.workspaceStateKey, parsed.transactionId);
    if (fs.existsSync(file)) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Initial transaction manifest already exists.");
    }
    return this.atomic.write(file, parsed);
  }

  writeNext(
    previous: TransactionManifestV1,
    next: TransactionManifestV1
  ): DirectorySyncCapability {
    const parsedPrevious = transactionManifestV1Schema.parse(previous);
    const parsedNext = transactionManifestV1Schema.parse(next);
    if (
      parsedNext.transactionId !== parsedPrevious.transactionId ||
      parsedNext.changeSetId !== parsedPrevious.changeSetId ||
      parsedNext.workspaceStateKey !== parsedPrevious.workspaceStateKey ||
      parsedNext.generation !== parsedPrevious.generation + 1
    ) {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Transaction manifest transition is not monotonic."
      );
    }
    const persisted = this.read(parsedPrevious.workspaceStateKey, parsedPrevious.transactionId);
    if (persisted.generation !== parsedPrevious.generation) {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Transaction manifest transition is stale."
      );
    }
    return this.atomic.write(
      manifestPathFor(this.stateRoot, parsedNext.workspaceStateKey, parsedNext.transactionId),
      parsedNext
    );
  }

  list(workspaceStateKey: string): TransactionManifestV1[] {
    const directory = transactionWorkspaceStateDirectory(
      this.stateRoot,
      "transactions",
      workspaceStateKey
    );
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction manifest directory is unreadable.");
    }
    const manifests: TransactionManifestV1[] = [];
    for (const name of names.filter((value) => /^tx_[a-f0-9]{32}\.json$/.test(value)).sort()) {
      const file = path.join(directory, name);
      let version: unknown;
      try {
        version = JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion;
      } catch {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction manifest is unreadable.");
      }
      if (version !== 1) continue;
      manifests.push(this.atomic.read(file));
    }
    return manifests;
  }
}

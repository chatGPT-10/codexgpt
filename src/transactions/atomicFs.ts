import path from "node:path";
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import type { CodexProConfig } from "../config.js";
import type { PathGuard, Workspace } from "../guard.js";
import {
  TransactionError,
  type AbsentFileFactV1,
  type BeforeFileFactV1,
  type ExistingFileFactV1,
  type PreparedAtomicOperation,
  type TransactionOperationV1
} from "./types.js";

export interface InspectedWorkspacePath {
  relativePath: string;
  comparisonKey: string;
  targetAbsPath: string;
  before: BeforeFileFactV1;
}

export interface AtomicWorkspaceFsDependencies {
  randomBytes(size: number): Buffer;
  link(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(file: string): Promise<void>;
}

const DEFAULT_ATOMIC_FS_DEPENDENCIES: AtomicWorkspaceFsDependencies = {
  randomBytes: nodeRandomBytes,
  link: (source, destination) => fsp.link(source, destination),
  rename: (source, destination) => fsp.rename(source, destination),
  unlink: (file) => fsp.unlink(file)
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileIdentity(stat: Awaited<ReturnType<typeof fsp.lstat>>): string {
  const bigintStat = stat as unknown as {
    dev: bigint | number;
    ino: bigint | number;
    size: bigint | number;
    mtimeNs?: bigint;
    mtimeMs: number;
  };
  const mtime = bigintStat.mtimeNs?.toString() ?? String(bigintStat.mtimeMs);
  const payload = `${bigintStat.dev.toString()}\0${bigintStat.ino.toString()}\0${bigintStat.size.toString()}\0${mtime}`;
  return `fid_${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24)}`;
}

function reservedSibling(
  targetAbsPath: string,
  kind: "stage" | "backup" | "move",
  random: Buffer
): string {
  if (random.length !== 8) {
    throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction artifact random source is invalid.");
  }
  return path.join(
    path.dirname(targetAbsPath),
    `.codexpro-txn-${random.toString("hex")}.${kind}`
  );
}

function artifactRelativePath(workspaceRoot: string, artifactAbsPath: string): string {
  return path.relative(workspaceRoot, artifactAbsPath).replace(/\\/g, "/");
}

function isUnsupportedLinkError(error: unknown): boolean {
  return ["EXDEV", "EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EINVAL"].includes(
    (error as NodeJS.ErrnoException).code ?? ""
  );
}

function mapLinkError(error: unknown): never {
  if (isUnsupportedLinkError(error)) {
    throw new TransactionError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "The workspace filesystem does not provide the required hard-link capability."
    );
  }
  if ((error as NodeJS.ErrnoException).code === "EEXIST") {
    throw new TransactionError("FILE_VERSION_CONFLICT", "A workspace target appeared concurrently.");
  }
  throw new TransactionError("TRANSACTION_FAILED", "A required hard-link operation failed.");
}

function conflict(relativePath: string): TransactionError {
  return new TransactionError(
    "FILE_VERSION_CONFLICT",
    "Workspace file facts changed before the transaction step.",
    { relativePath }
  );
}

export class AtomicWorkspaceFs {
  private readonly dependencies: AtomicWorkspaceFsDependencies;
  private readonly maxBytes: number;

  constructor(
    config: Pick<CodexProConfig, "blockedGlobs" | "maxWriteBytes">,
    private readonly guard: PathGuard,
    private readonly workspace: Workspace,
    dependencies: Partial<AtomicWorkspaceFsDependencies> = {}
  ) {
    this.maxBytes = config.maxWriteBytes;
    this.dependencies = { ...DEFAULT_ATOMIC_FS_DEPENDENCIES, ...dependencies };
  }

  async inspect(relativePath: string): Promise<InspectedWorkspacePath> {
    let facts;
    try {
      facts = this.guard.resolvePolicyFacts(this.workspace, relativePath, { forWrite: true });
    } catch {
      throw new TransactionError(
        "TRANSACTION_PRECONDITION_FAILED",
        "Workspace path is outside the atomic transaction policy."
      );
    }

    try {
      const stat = await fsp.lstat(facts.absPath, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new TransactionError(
          "TRANSACTION_PRECONDITION_FAILED",
          "Atomic transactions support ordinary files only."
        );
      }
      if (stat.size > BigInt(this.maxBytes)) {
        throw new TransactionError(
          "TRANSACTION_PRECONDITION_FAILED",
          "Workspace file exceeds the transaction byte limit."
        );
      }
      const bytes = await fsp.readFile(facts.absPath);
      if (bytes.length !== Number(stat.size)) throw conflict(facts.relPath);
      const before: ExistingFileFactV1 = {
        exists: true,
        sha256: sha256(bytes),
        identity: fileIdentity(stat as never),
        bytes: bytes.length,
        metadata: {
          mode: Number(stat.mode),
          atimeMs: Number(stat.atimeNs) / 1_000_000,
          mtimeMs: Number(stat.mtimeNs) / 1_000_000
        }
      };
      return {
        relativePath: facts.relPath,
        comparisonKey: facts.comparisonKey,
        targetAbsPath: facts.absPath,
        before
      };
    } catch (error) {
      if (error instanceof TransactionError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new TransactionError("TRANSACTION_FAILED", "Workspace file inspection failed.");
      }
      const parentStat = await fsp.stat(facts.existingParent, { bigint: true });
      const before: AbsentFileFactV1 = {
        exists: false,
        sha256: null,
        identity: null,
        bytes: 0,
        metadata: null,
        existingParentIdentity: facts.existingParentIdentity,
        volumeDevice: parentStat.dev.toString()
      };
      return {
        relativePath: facts.relPath,
        comparisonKey: facts.comparisonKey,
        targetAbsPath: facts.absPath,
        before
      };
    }
  }

  private async writeStage(targetAbsPath: string, bytes: Buffer, mode?: number): Promise<string> {
    if (bytes.length > this.maxBytes) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Transaction payload exceeds the byte limit.");
    }
    const stage = reservedSibling(targetAbsPath, "stage", this.dependencies.randomBytes(8));
    const handle = await fsp.open(stage, "wx", 0o600);
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.write(bytes, offset, bytes.length - offset, offset);
        if (result.bytesWritten <= 0) throw new Error("short write");
        offset += result.bytesWritten;
      }
      if (mode !== undefined) {
        try {
          await handle.chmod(mode);
        } catch {
          // Windows metadata support is limited; content durability remains mandatory.
        }
      }
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await fsp.unlink(stage).catch(() => undefined);
      throw new TransactionError("TRANSACTION_FAILED", "Transaction staging failed.");
    }
    await handle.close();
    const stagedBytes = await fsp.readFile(stage);
    if (!stagedBytes.equals(bytes)) {
      await fsp.unlink(stage).catch(() => undefined);
      throw new TransactionError("TRANSACTION_FAILED", "Staged bytes failed verification.");
    }
    return stage;
  }

  private async verifySameVolume(source: string, destinationParent: string): Promise<void> {
    const [sourceStat, parentStat] = await Promise.all([
      fsp.stat(source, { bigint: true }),
      fsp.stat(destinationParent, { bigint: true })
    ]);
    if (sourceStat.dev !== parentStat.dev) {
      throw new TransactionError(
        "ATOMIC_BACKEND_UNAVAILABLE",
        "Transaction source and destination are on different volumes."
      );
    }
  }

  private async linkVerified(source: string, destination: string): Promise<void> {
    await this.verifySameVolume(source, path.dirname(destination));
    try {
      await this.dependencies.link(source, destination);
    } catch (error) {
      mapLinkError(error);
    }
    const [sourceStat, destinationStat] = await Promise.all([
      fsp.stat(source, { bigint: true }),
      fsp.stat(destination, { bigint: true })
    ]);
    if (sourceStat.dev !== destinationStat.dev || sourceStat.ino !== destinationStat.ino) {
      await fsp.unlink(destination).catch(() => undefined);
      throw new TransactionError("ATOMIC_BACKEND_UNAVAILABLE", "Hard-link identity verification failed.");
    }
  }

  async verifyHardLinkBackend(targetAbsPath = path.join(this.workspace.root, "probe.txt")): Promise<void> {
    const stage = reservedSibling(targetAbsPath, "stage", this.dependencies.randomBytes(8));
    const probe = reservedSibling(targetAbsPath, "move", this.dependencies.randomBytes(8));
    await fsp.writeFile(stage, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    try {
      const handle = await fsp.open(stage, "r+");
      await handle.sync();
      await handle.close();
      await this.linkVerified(stage, probe);
    } finally {
      await fsp.unlink(probe).catch(() => undefined);
      await fsp.unlink(stage).catch(() => undefined);
    }
  }

  async stageCreate(
    operationId: string,
    relativePath: string,
    bytes: Buffer
  ): Promise<PreparedAtomicOperation> {
    const inspected = await this.inspect(relativePath);
    if (inspected.before.exists) throw conflict(inspected.relativePath);
    const stageAbsPath = await this.writeStage(inspected.targetAbsPath, bytes);
    const probe = reservedSibling(inspected.targetAbsPath, "move", this.dependencies.randomBytes(8));
    try {
      await this.linkVerified(stageAbsPath, probe);
    } finally {
      await fsp.unlink(probe).catch(() => undefined);
    }
    const operation: TransactionOperationV1 = {
      operationId,
      kind: "create",
      state: "staged",
      relativePath: inspected.relativePath,
      comparisonKey: inspected.comparisonKey,
      stageRelativePath: artifactRelativePath(this.workspace.root, stageAbsPath),
      backupRelativePath: null,
      before: inspected.before,
      after: { exists: true, sha256: sha256(bytes), bytes: bytes.length }
    };
    return { operation, targetAbsPath: inspected.targetAbsPath, stageAbsPath, backupAbsPath: null };
  }

  async stageReplace(
    operationId: string,
    relativePath: string,
    bytes: Buffer,
    expectedSha256: string | null
  ): Promise<PreparedAtomicOperation> {
    const inspected = await this.inspect(relativePath);
    if (!inspected.before.exists || (expectedSha256 !== null && inspected.before.sha256 !== expectedSha256)) {
      throw conflict(inspected.relativePath);
    }
    const stageAbsPath = await this.writeStage(inspected.targetAbsPath, bytes, inspected.before.metadata.mode);
    const backupAbsPath = reservedSibling(inspected.targetAbsPath, "backup", this.dependencies.randomBytes(8));
    try {
      await this.linkVerified(inspected.targetAbsPath, backupAbsPath);
      const backup = await fsp.readFile(backupAbsPath);
      if (sha256(backup) !== inspected.before.sha256) throw conflict(inspected.relativePath);
    } catch (error) {
      await fsp.unlink(stageAbsPath).catch(() => undefined);
      await fsp.unlink(backupAbsPath).catch(() => undefined);
      throw error;
    }
    const operation: TransactionOperationV1 = {
      operationId,
      kind: "replace",
      state: "backup_ready",
      relativePath: inspected.relativePath,
      comparisonKey: inspected.comparisonKey,
      stageRelativePath: artifactRelativePath(this.workspace.root, stageAbsPath),
      backupRelativePath: artifactRelativePath(this.workspace.root, backupAbsPath),
      before: inspected.before,
      after: { exists: true, sha256: sha256(bytes), bytes: bytes.length }
    };
    return { operation, targetAbsPath: inspected.targetAbsPath, stageAbsPath, backupAbsPath };
  }

  async stageDelete(
    operationId: string,
    relativePath: string,
    expectedSha256: string | null
  ): Promise<PreparedAtomicOperation> {
    const inspected = await this.inspect(relativePath);
    if (!inspected.before.exists || (expectedSha256 !== null && inspected.before.sha256 !== expectedSha256)) {
      throw conflict(inspected.relativePath);
    }
    const backupAbsPath = reservedSibling(inspected.targetAbsPath, "backup", this.dependencies.randomBytes(8));
    await this.linkVerified(inspected.targetAbsPath, backupAbsPath);
    const operation: TransactionOperationV1 = {
      operationId,
      kind: "delete",
      state: "backup_ready",
      relativePath: inspected.relativePath,
      comparisonKey: inspected.comparisonKey,
      stageRelativePath: null,
      backupRelativePath: artifactRelativePath(this.workspace.root, backupAbsPath),
      before: inspected.before,
      after: { exists: false, sha256: null, bytes: 0, identity: null }
    };
    return { operation, targetAbsPath: inspected.targetAbsPath, stageAbsPath: null, backupAbsPath };
  }

  private async assertCurrentMatches(
    prepared: PreparedAtomicOperation,
    expected: "before" | "after"
  ): Promise<void> {
    const expectedFact = expected === "before" ? prepared.operation.before : prepared.operation.after;
    try {
      const stat = await fsp.lstat(prepared.targetAbsPath, { bigint: true });
      if (!stat.isFile() || !expectedFact.exists) throw conflict(prepared.operation.relativePath);
      const bytes = await fsp.readFile(prepared.targetAbsPath);
      if (sha256(bytes) !== expectedFact.sha256) throw conflict(prepared.operation.relativePath);
      if ("identity" in expectedFact && expectedFact.identity && fileIdentity(stat as never) !== expectedFact.identity) {
        throw conflict(prepared.operation.relativePath);
      }
    } catch (error) {
      if (error instanceof TransactionError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !expectedFact.exists) return;
      throw conflict(prepared.operation.relativePath);
    }
  }

  async install(prepared: PreparedAtomicOperation): Promise<PreparedAtomicOperation> {
    const operation = prepared.operation;
    if (operation.kind === "create") {
      await this.assertCurrentMatches(prepared, "before");
      if (!prepared.stageAbsPath) throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Create stage is missing.");
      await this.linkVerified(prepared.stageAbsPath, prepared.targetAbsPath);
    } else if (operation.kind === "replace") {
      await this.assertCurrentMatches(prepared, "before");
      if (!prepared.stageAbsPath || !prepared.backupAbsPath) {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Replace artifacts are missing.");
      }
      try {
        await this.dependencies.rename(prepared.stageAbsPath, prepared.targetAbsPath);
      } catch {
        throw new TransactionError("TRANSACTION_FAILED", "Atomic replacement install failed.");
      }
    } else {
      await this.assertCurrentMatches(prepared, "before");
      try {
        await this.dependencies.unlink(prepared.targetAbsPath);
      } catch {
        throw new TransactionError("TRANSACTION_FAILED", "Guarded delete install failed.");
      }
    }

    let after = operation.after;
    if (after.exists) {
      const stat = await fsp.lstat(prepared.targetAbsPath, { bigint: true });
      const bytes = await fsp.readFile(prepared.targetAbsPath);
      if (sha256(bytes) !== after.sha256) {
        throw new TransactionError("TRANSACTION_FAILED", "Installed bytes failed verification.");
      }
      after = { ...after, identity: fileIdentity(stat as never) };
    }
    return {
      ...prepared,
      operation: { ...operation, state: "installed", after }
    };
  }

  async rollback(prepared: PreparedAtomicOperation): Promise<PreparedAtomicOperation> {
    const operation = prepared.operation;
    if (operation.state === "installed") {
      if (operation.kind === "create") {
        await this.assertCurrentMatches(prepared, "after");
        await this.dependencies.unlink(prepared.targetAbsPath);
      } else if (operation.kind === "replace") {
        await this.assertCurrentMatches(prepared, "after");
        if (!prepared.backupAbsPath) throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Replace backup is missing.");
        try {
          await this.dependencies.rename(prepared.backupAbsPath, prepared.targetAbsPath);
        } catch {
          throw new TransactionError("ROLLBACK_FAILED", "Replacement rollback failed.");
        }
      } else {
        await this.assertCurrentMatches(prepared, "after");
        if (!prepared.backupAbsPath) throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Delete backup is missing.");
        try {
          await this.linkVerified(prepared.backupAbsPath, prepared.targetAbsPath);
        } catch (error) {
          if (error instanceof TransactionError && error.code === "FILE_VERSION_CONFLICT") {
            throw new TransactionError("ROLLBACK_FAILED", "Delete rollback refused to clobber an existing file.");
          }
          throw error;
        }
      }
    }
    return { ...prepared, operation: { ...operation, state: "rolled_back" } };
  }

  async finalize(prepared: PreparedAtomicOperation): Promise<PreparedAtomicOperation> {
    for (const artifact of [prepared.stageAbsPath, prepared.backupAbsPath]) {
      if (!artifact) continue;
      const basename = path.basename(artifact);
      if (!/^\.codexpro-txn-[a-f0-9]{16}\.(?:stage|backup|move)$/.test(basename)) {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction artifact name is invalid.");
      }
      if (path.dirname(artifact) !== path.dirname(prepared.targetAbsPath)) {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction artifact parent is invalid.");
      }
      try {
        const stat = await fsp.lstat(artifact);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction artifact type is invalid.");
        }
        await fsp.unlink(artifact);
      } catch (error) {
        if (error instanceof TransactionError) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new TransactionError("TRANSACTION_FAILED", "Transaction artifact cleanup failed.");
        }
      }
    }
    return { ...prepared, operation: { ...prepared.operation, state: "finalized" } };
  }
}

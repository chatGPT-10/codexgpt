import path from "node:path";
import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import fsp, { type FileHandle } from "node:fs/promises";
import { PathGuard, type Workspace } from "../guard.js";
import type { FileObjectIdentityV2, MoveFileVersionV2 } from "../transactions/types.js";
import {
  MovePathsError,
  type InspectedMoveBatch,
  type InspectedMovePath,
  type MovePathRequest,
  type MovePlannerConfig
} from "./types.js";

const RESERVED_ARTIFACT = /^\.codexpro-txn-[a-f0-9]{16}\.(?:stage|backup|move)$/i;

function normalizedRequestedRelativePath(workspace: Workspace, input: string): string {
  return path.relative(workspace.root, path.resolve(workspace.root, input)).replace(/\\/g, "/").normalize("NFC");
}

function publicPathError(error: unknown, pathRole: "source" | "destination"): MovePathsError {
  const text = error instanceof Error ? error.message : "";
  if (/blocked/i.test(text)) return new MovePathsError("PATH_BLOCKED", "Move path is blocked.");
  if (/symlink|junction|reparse/i.test(text)) return new MovePathsError("SYMLINK_NOT_ALLOWED", "Move path uses a link or reparse point.");
  if (/outside|escapes/i.test(text)) return new MovePathsError("PATH_OUTSIDE_WORKSPACE", "Move path is outside the workspace.");
  return new MovePathsError("INVALID_ARGUMENT", `Move ${pathRole} is invalid.`);
}

function identityFrom(stat: BigIntStats): FileObjectIdentityV2 {
  if (stat.dev <= 0n || stat.ino <= 0n) {
    throw new MovePathsError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "Stable file-object identity is unavailable."
    );
  }
  return { device: stat.dev.toString(), fileId: stat.ino.toString() };
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameVersion(left: BigIntStats, right: BigIntStats): boolean {
  return sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

async function streamHash(handle: FileHandle, expectedBytes: bigint): Promise<{ sha256: string; bytes: number }> {
  if (expectedBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MovePathsError("ATOMIC_BACKEND_UNAVAILABLE", "File size cannot be represented safely.");
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  while (position < Number(expectedBytes)) {
    const length = Math.min(buffer.length, Number(expectedBytes) - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead <= 0) {
      throw new MovePathsError("FILE_VERSION_CONFLICT", "Source changed while hashing.");
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  const trailing = Buffer.allocUnsafe(1);
  const extra = await handle.read(trailing, 0, 1, position);
  if (extra.bytesRead !== 0) {
    throw new MovePathsError("FILE_VERSION_CONFLICT", "Source grew while hashing.");
  }
  return { sha256: hash.digest("hex"), bytes: position };
}

function versionFrom(stat: BigIntStats, digest: { sha256: string; bytes: number }): MoveFileVersionV2 {
  return {
    sha256: digest.sha256,
    bytes: digest.bytes,
    mode: Number(stat.mode),
    atimeMs: Number(stat.atimeNs) / 1_000_000,
    mtimeMs: Number(stat.mtimeNs) / 1_000_000,
    ctimeMs: Number(stat.ctimeNs) / 1_000_000
  };
}

async function inspectSource(
  workspace: Workspace,
  sourceAbsPath: string,
  expectedSha256: string,
  maxFileBytes: number
): Promise<{ handle: FileHandle; objectIdentity: FileObjectIdentityV2; version: MoveFileVersionV2 }> {
  let handle: FileHandle;
  try {
    handle = await fsp.open(sourceAbsPath, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new MovePathsError("SOURCE_NOT_FOUND", "Move source does not exist.");
    }
    throw new MovePathsError("TRANSACTION_FAILED", "Move source could not be opened.");
  }
  try {
    const [pathStat, before] = await Promise.all([
      fsp.lstat(sourceAbsPath, { bigint: true }),
      handle.stat({ bigint: true })
    ]);
    if (pathStat.isSymbolicLink() || !pathStat.isFile() || !before.isFile()) {
      throw new MovePathsError("NOT_A_FILE", "Move source is not an ordinary file.");
    }
    if (!sameIdentity(pathStat, before)) {
      throw new MovePathsError("FILE_VERSION_CONFLICT", "Move source path and handle identities differ.");
    }
    if (before.size > BigInt(maxFileBytes)) {
      throw new MovePathsError("INVALID_ARGUMENT", "Move source exceeds the configured file limit.");
    }
    const digest = await streamHash(handle, before.size);
    const after = await handle.stat({ bigint: true });
    if (!sameVersion(before, after)) {
      throw new MovePathsError("FILE_VERSION_CONFLICT", "Move source changed while hashing.");
    }
    if (digest.sha256 !== expectedSha256) {
      throw new MovePathsError("FILE_VERSION_CONFLICT", "Move source hash does not match the caller expectation.");
    }
    return {
      handle,
      objectIdentity: identityFrom(after),
      version: versionFrom(after, digest)
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  action: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (failure === undefined) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      try {
        result[index] = await action(values[index], index);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  if (failure !== undefined) throw failure;
  return result;
}

function missingDirectories(
  workspace: Workspace,
  existingParent: string,
  unresolvedSuffix: readonly string[]
): readonly { relativePath: string; absPath: string }[] {
  return unresolvedSuffix.slice(0, -1).map((_, index) => {
    const absPath = path.join(existingParent, ...unresolvedSuffix.slice(0, index + 1));
    return {
      relativePath: path.relative(workspace.root, absPath).replace(/\\/g, "/"),
      absPath
    };
  });
}

export class MovePlanner {
  private readonly guard: PathGuard;

  constructor(private readonly config: MovePlannerConfig) {
    this.guard = new PathGuard(config);
  }

  async inspect(
    workspace: Workspace,
    requests: readonly MovePathRequest[],
    createParents: boolean
  ): Promise<InspectedMoveBatch> {
    if (!Array.isArray(requests) || requests.length < 1 || requests.length > 64) {
      throw new MovePathsError("INVALID_ARGUMENT", "Move count is invalid.");
    }

    const pathFacts = requests.map((request, callerIndex) => {
      if (!/^[a-f0-9]{64}$/.test(request.expectedSha256)) {
        throw new MovePathsError("INVALID_ARGUMENT", "Expected SHA-256 is invalid.");
      }
      if (RESERVED_ARTIFACT.test(path.basename(request.source)) || RESERVED_ARTIFACT.test(path.basename(request.destination))) {
        throw new MovePathsError("PATH_BLOCKED", "Reserved transaction artifacts cannot be moved.");
      }
      let source;
      let destination;
      try {
        source = this.guard.resolvePolicyFacts(workspace, request.source, { forWrite: true });
      } catch (error) {
        throw publicPathError(error, "source");
      }
      try {
        destination = this.guard.resolvePolicyFacts(workspace, request.destination, { forWrite: true });
      } catch (error) {
        throw publicPathError(error, "destination");
      }
      const requestedDestination = normalizedRequestedRelativePath(workspace, request.destination);
      const destinationRelativePath = source.comparisonKey === destination.comparisonKey
        ? requestedDestination
        : destination.relPath;
      if (source.comparisonKey === destination.comparisonKey && source.relPath === destinationRelativePath) {
        throw new MovePathsError("MOVE_NO_OP", "Move is an exact no-op.", { source: source.relPath, destination: destinationRelativePath });
      }
      return { request, callerIndex, source, destination, destinationRelativePath };
    });

    const sourceKeys = pathFacts.map((value) => value.source.comparisonKey);
    const destinationKeys = pathFacts.map((value) => value.destination.comparisonKey);
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      throw new MovePathsError("DUPLICATE_SOURCE", "Move sources are duplicate.");
    }
    if (new Set(destinationKeys).size !== destinationKeys.length) {
      throw new MovePathsError("DUPLICATE_DESTINATION", "Move destinations are duplicate.");
    }
    const sourceKeySet = new Set(sourceKeys);
    for (const value of pathFacts) {
      if (value.destination.targetExists && !sourceKeySet.has(value.destination.comparisonKey)) {
        throw new MovePathsError("TARGET_EXISTS", "An unrelated move destination exists.", {
          destination: value.destinationRelativePath
        });
      }
      if (value.destination.unresolvedSuffix.length > 1 && !createParents) {
        throw new MovePathsError("PARENT_DIRECTORY_NOT_FOUND", "Destination parent is absent.", {
          destination: value.destinationRelativePath
        });
      }
    }

    const opened: FileHandle[] = [];
    try {
      const operations = await mapBounded(pathFacts, this.config.moveHashConcurrency, async (value, index) => {
        const source = await inspectSource(
          workspace,
          value.source.absPath,
          value.request.expectedSha256,
          this.config.moveMaxFileBytes
        );
        opened.push(source.handle);
        const parentStat = await fsp.stat(value.destination.existingParent, { bigint: true });
        if (!parentStat.isDirectory()) {
          throw new MovePathsError("PARENT_PATH_CONFLICT", "Destination parent is not a directory.");
        }
        if (BigInt(source.objectIdentity.device) !== parentStat.dev) {
          throw new MovePathsError("CROSS_VOLUME_MOVE", "Move crosses filesystem volumes.");
        }
        const operation: InspectedMovePath = {
          callerIndex: value.callerIndex,
          operationId: `op_move_${String(index + 1).padStart(3, "0")}`,
          sourceRelativePath: value.source.relPath,
          destinationRelativePath: value.destinationRelativePath,
          sourceComparisonKey: value.source.comparisonKey,
          destinationComparisonKey: value.destination.comparisonKey,
          sourceAbsPath: value.source.absPath,
          sourceExistingParent: value.source.existingParent,
          sourceExistingParentRelativePath: path.relative(workspace.root, value.source.existingParent).replaceAll("\\", "/") || ".",
          sourceExistingParentIdentity: value.source.existingParentIdentity,
          destinationAbsPath: path.resolve(workspace.root, value.destinationRelativePath),
          destinationExistingParent: value.destination.existingParent,
          destinationExistingParentRelativePath: path.relative(workspace.root, value.destination.existingParent).replaceAll("\\", "/") || ".",
          destinationExistingParentIdentity: value.destination.existingParentIdentity,
          missingDirectories: missingDirectories(workspace, value.destination.existingParent, value.destination.unresolvedSuffix),
          objectIdentity: source.objectIdentity,
          version: source.version,
          handle: source.handle
        };
        return operation;
      });
      const totalBytes = operations.reduce((sum, operation) => sum + operation.version.bytes, 0);
      if (totalBytes > this.config.moveMaxTotalBytes) {
        throw new MovePathsError("INVALID_ARGUMENT", "Move batch exceeds the configured byte limit.");
      }
      const directories = new Map<string, string>();
      for (const operation of operations) {
        for (const directory of operation.missingDirectories) directories.set(directory.relativePath, directory.absPath);
      }
      const createdDirectories = [...directories.keys()].sort((left, right) =>
        left.split("/").length - right.split("/").length || left.localeCompare(right)
      );
      let closed = false;
      return {
        workspace,
        operations,
        createdDirectories,
        totalBytes,
        async close() {
          if (closed) return;
          closed = true;
          await Promise.all(operations.map((operation) => operation.handle.close().catch(() => undefined)));
        }
      };
    } catch (error) {
      await Promise.all(opened.map((handle) => handle.close().catch(() => undefined)));
      throw error;
    }
  }
}

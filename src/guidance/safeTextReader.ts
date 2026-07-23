import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PathGuard, assertSafePathInput, displayPath, isSubpath, normalizeRelPath, type Workspace } from "../guard.js";

export type GuidanceReadFailureReason =
  | "READ_BLOCKED"
  | "READ_BOUNDARY_VIOLATION"
  | "READ_MISSING"
  | "READ_NOT_REGULAR"
  | "READ_HARDLINK_UNSAFE"
  | "READ_TOO_LARGE"
  | "READ_NOT_TEXT"
  | "READ_IDENTITY_CHANGED"
  | "READ_FAILED";

export interface GuidanceReadSuccess {
  ok: true;
  path: string;
  text: string;
  sourceBytes: number;
  returnedBytes: number;
  bom: boolean;
  identity: { dev: string; ino: string; nlink: number };
}

export interface GuidanceReadFailure {
  ok: false;
  path: string | null;
  reason: GuidanceReadFailureReason;
}

export interface GuidanceReadOptions {
  root: string;
  relativePath: string;
  maxBytes: number;
  blockedGlobs: string[];
  testHooks?: {
    afterOpen?: () => void | Promise<void>;
    afterRead?: () => void | Promise<void>;
  };
}

export function normalizeGuidancePathInput(inputPath: string): string {
  const value = inputPath || ".";
  if (/^[A-Za-z]:/u.test(value)) {
    throw new Error("Windows drive paths are not allowed for guidance reads.");
  }
  try {
    assertSafePathInput(value, "win32");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("alternate data stream")) {
      throw new Error("NTFS alternate data stream paths are not allowed for guidance reads.");
    }
    if (message.includes("UNC") || message.includes("device")) {
      throw new Error("Windows UNC and device paths are not allowed for guidance reads.");
    }
    throw new Error("Windows-unsafe paths are not allowed for guidance reads.");
  }
  return value.replace(/\\/g, "/");
}

function identity(stat: fs.BigIntStats): { dev: string; ino: string; nlink: number } {
  return { dev: stat.dev.toString(), ino: stat.ino.toString(), nlink: Number(stat.nlink) };
}

function sameIdentity(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function failure(pathValue: string | null, reason: GuidanceReadFailureReason): GuidanceReadFailure {
  return { ok: false, path: pathValue, reason };
}

function sameNativePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

function classifyPreOpenError(error: unknown): GuidanceReadFailureReason {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : "";
  if (code === "ENOENT") return "READ_MISSING";
  const message = error instanceof Error ? error.message : "";
  if (message.includes("blocked by safety rules")) return "READ_BLOCKED";
  if (message.includes("outside") || message.includes("escapes") || message.includes("drive paths") || message.includes("UNC") || message.includes("device") || message.includes("alternate data stream")) {
    return "READ_BOUNDARY_VIOLATION";
  }
  return "READ_FAILED";
}

export async function readGuidanceText(options: GuidanceReadOptions): Promise<GuidanceReadSuccess | GuidanceReadFailure> {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const workspace: Workspace = { id: "guidance-reader", root, openedAt: "1970-01-01T00:00:00.000Z" };
  const guard = new PathGuard({ blockedGlobs: options.blockedGlobs });
  let resolved: { absPath: string; relPath: string };
  try {
    resolved = guard.resolve(workspace, normalizeGuidancePathInput(options.relativePath));
  } catch (error) {
    return failure(null, classifyPreOpenError(error));
  }

  const safePath = normalizeRelPath(resolved.relPath);
  const maxBytes = Math.max(0, Math.floor(options.maxBytes));
  let handle: fsp.FileHandle | undefined;
  try {
    const canonicalParentBefore = await fsp.realpath(path.dirname(resolved.absPath));
    if (!isSubpath(canonicalParentBefore, root)) return failure(safePath, "READ_BOUNDARY_VIOLATION");
    handle = await fsp.open(resolved.absPath, "r");
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) return failure(safePath, "READ_NOT_REGULAR");
    if (before.nlink !== 1n) return failure(safePath, "READ_HARDLINK_UNSAFE");
    if (before.size > BigInt(maxBytes)) return failure(safePath, "READ_TOO_LARGE");
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) return failure(safePath, "READ_TOO_LARGE");

    await options.testHooks?.afterOpen?.();
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.length) {
      const read = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    if (offset !== buffer.length) return failure(safePath, "READ_IDENTITY_CHANGED");
    await options.testHooks?.afterRead?.();

    const verification = Buffer.alloc(buffer.length);
    let verificationOffset = 0;
    while (verificationOffset < verification.length) {
      const read = await handle.read(verification, verificationOffset, verification.length - verificationOffset, verificationOffset);
      if (read.bytesRead === 0) break;
      verificationOffset += read.bytesRead;
    }
    if (verificationOffset !== verification.length || !verification.equals(buffer)) {
      return failure(safePath, "READ_IDENTITY_CHANGED");
    }

    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after) || !after.isFile() || after.nlink !== 1n || after.size !== before.size) {
      return failure(safePath, "READ_IDENTITY_CHANGED");
    }

    let currentReal: string;
    let currentStat: fs.BigIntStats;
    try {
      currentReal = await fsp.realpath(resolved.absPath);
      currentStat = await fsp.stat(currentReal, { bigint: true });
    } catch {
      return failure(safePath, "READ_IDENTITY_CHANGED");
    }
    const currentParent = await fsp.realpath(path.dirname(resolved.absPath)).catch(() => "");
    if (!currentParent || !sameNativePath(currentParent, canonicalParentBefore) || !isSubpath(currentParent, root) || !isSubpath(currentReal, root) || !sameIdentity(before, currentStat)) {
      return failure(safePath, "READ_IDENTITY_CHANGED");
    }
    const canonicalPath = displayPath(currentReal, root);
    if (guard.isBlockedRelativePath(canonicalPath)) return failure(safePath, "READ_BLOCKED");
    if (buffer.includes(0)) return failure(safePath, "READ_NOT_TEXT");

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return failure(safePath, "READ_NOT_TEXT");
    }
    return {
      ok: true,
      path: safePath,
      text,
      sourceBytes: buffer.length,
      returnedBytes: buffer.length,
      bom: buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf,
      identity: identity(before)
    };
  } catch (error) {
    return failure(safePath, classifyPreOpenError(error));
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

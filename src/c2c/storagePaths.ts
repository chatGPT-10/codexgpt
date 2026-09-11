import fs from "node:fs";
import path from "node:path";
import { assertSafePathInput } from "../guard.js";
import { sessionError } from "./sessionSchema.js";

export function objectIdentity(stat: fs.BigIntStats): string { return `${stat.dev}:${stat.ino}`; }
export function safeAbsolute(input: string): string {
  try {
    if (typeof input !== "string" || !input || input.length > 32767 || !path.isAbsolute(input) || /[\u0000-\u001f]/u.test(input)) return sessionError("STATE_PATH_UNSAFE");
    assertSafePathInput(input, "win32");
    return path.resolve(input);
  } catch { return sessionError("STATE_PATH_UNSAFE"); }
}
/** Walk every ancestor; no reparse/symlink directory is accepted. */
export function ensureDirectory(directory: string, create: boolean): boolean {
  const absolute = safeAbsolute(directory);
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat: fs.BigIntStats;
    try { stat = fs.lstatSync(current, { bigint: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return sessionError("STATE_PATH_UNSAFE");
      if (!create) return false;
      try { fs.mkdirSync(current, { mode: 0o700 }); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") return sessionError("STATE_PATH_UNSAFE"); }
      stat = fs.lstatSync(current, { bigint: true });
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return sessionError("STATE_PATH_UNSAFE");
  }
  return true;
}
export function canonicalDirectory(directory: string): string {
  if (!ensureDirectory(directory, false)) return sessionError("STATE_PATH_UNSAFE");
  return fs.realpathSync.native(directory);
}
export function pathKey(value: string): string { return process.platform === "win32" ? value.toLowerCase() : value; }
function sameFile(a: fs.BigIntStats, b: fs.BigIntStats): boolean {
  return a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n &&
    a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
/** Bounded same-handle read, returning null only for an absent final file. */
export function readStateBytes(file: string, maxBytes: number): Buffer | null {
  let before: fs.BigIntStats;
  try { before = fs.lstatSync(file, { bigint: true }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; return sessionError("STATE_PATH_UNSAFE"); }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) return sessionError("STATE_PATH_UNSAFE");
  if (before.size > BigInt(maxBytes)) return sessionError("SESSION_INVALID");
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) return sessionError("STATE_PATH_UNSAFE");
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!read) return sessionError("STATE_PATH_UNSAFE");
      offset += read;
    }
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true })) || !sameFile(before, fs.lstatSync(file, { bigint: true }))) return sessionError("STATE_PATH_UNSAFE");
    return bytes;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

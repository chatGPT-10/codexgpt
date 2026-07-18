import { hasSecretValue } from "../redact.js";

export type GitObjectFormat = "sha1" | "sha256";
export type GitChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "unmerged";
export type GitIndexStatusKind = "unmodified" | GitChangeKind;
export type GitStatusKind = GitIndexStatusKind | "untracked";

export interface ParsedGitHead {
  kind: "branch" | "detached" | "unborn";
  oid: string | null;
  ref: string | null;
}

export interface ParsedGitStatusEntry {
  path: string;
  oldPath: string | null;
  index: GitIndexStatusKind;
  worktree: GitStatusKind;
  submodule: boolean;
  ignored: boolean;
}

export interface ParsedGitStatus {
  head: ParsedGitHead;
  entries: ParsedGitStatusEntry[];
  ignoredPaths: string[];
}

export interface ParsedGitRawChange {
  path: string;
  oldPath: string | null;
  change: GitChangeKind;
  oldMode: string;
  newMode: string;
  oldOid: string;
  newOid: string;
}

export interface ParsedGitNumstat {
  path: string;
  oldPath: string | null;
  binary: boolean;
  additions: number | null;
  deletions: number | null;
}

export interface ParsedGitBatchCheck {
  oid: string;
  type: "blob" | "commit" | "tree" | "tag";
  size: number;
}

export interface ParsedGitBatchObject extends ParsedGitBatchCheck {
  content: Buffer;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const FORBIDDEN_ONE_LINE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

function outputError(): Error {
  return new Error("GIT_OUTPUT_INVALID");
}

function decodeUtf8(value: Buffer): string {
  try {
    return decoder.decode(value);
  } catch {
    throw outputError();
  }
}

function nulRecords(value: Buffer): string[] {
  const records: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    records.push(decodeUtf8(value.subarray(start, index)));
    start = index + 1;
  }
  if (start !== value.length) throw outputError();
  if (records.at(-1) === "") records.pop();
  return records;
}

function oidPattern(objectFormat: GitObjectFormat): RegExp {
  return objectFormat === "sha1" ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/;
}

function requireOid(value: string, objectFormat: GitObjectFormat): string {
  if (!oidPattern(objectFormat).test(value)) throw outputError();
  return value;
}

function splitFixed(record: string, fieldsBeforePath: number): { fields: string[]; path: string } {
  const fields: string[] = [];
  let cursor = 0;
  for (let index = 0; index < fieldsBeforePath; index += 1) {
    const separator = record.indexOf(" ", cursor);
    if (separator < 0) throw outputError();
    fields.push(record.slice(cursor, separator));
    cursor = separator + 1;
  }
  const path = record.slice(cursor);
  if (!path) throw outputError();
  return { fields, path };
}

function requirePath(value: string): string {
  if (!value || value.includes("\0")) throw outputError();
  return value;
}

function statusCode(code: string, unmerged = false): GitIndexStatusKind {
  if (unmerged) return "unmerged";
  switch (code) {
    case ".": return "unmodified";
    case "A": return "added";
    case "M": return "modified";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "T": return "type_changed";
    case "U": return "unmerged";
    default: throw outputError();
  }
}

function submoduleFlag(value: string): boolean {
  if (!/^[NS][.SCU]{3}$/.test(value)) throw outputError();
  return value[0] === "S";
}

export function parseGitStatusPorcelainV2(value: Buffer, objectFormat: GitObjectFormat): ParsedGitStatus {
  const records = nulRecords(value);
  let headOid: string | null | undefined;
  let headName: string | undefined;
  const entries: ParsedGitStatusEntry[] = [];
  const ignoredPaths: string[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.startsWith("# ")) {
      if (record.startsWith("# branch.oid ")) {
        const oid = record.slice("# branch.oid ".length);
        headOid = oid === "(initial)" ? null : requireOid(oid, objectFormat);
      } else if (record.startsWith("# branch.head ")) {
        headName = record.slice("# branch.head ".length);
        if (!headName) throw outputError();
      }
      continue;
    }
    if (record.startsWith("1 ")) {
      const parsed = splitFixed(record, 8);
      const [, xy, sub, oldMode, indexMode, worktreeMode, oldOid, indexOid] = parsed.fields;
      if (!/^[.AMDRCTU]{2}$/.test(xy) || !/^\d{6}$/.test(oldMode) || !/^\d{6}$/.test(indexMode) || !/^\d{6}$/.test(worktreeMode)) throw outputError();
      requireOid(oldOid, objectFormat);
      requireOid(indexOid, objectFormat);
      entries.push({
        path: requirePath(parsed.path),
        oldPath: null,
        index: statusCode(xy[0]),
        worktree: statusCode(xy[1]),
        submodule: submoduleFlag(sub),
        ignored: false
      });
      continue;
    }
    if (record.startsWith("2 ")) {
      const parsed = splitFixed(record, 9);
      const [, xy, sub, oldMode, indexMode, worktreeMode, oldOid, indexOid, score] = parsed.fields;
      if (!/^[.AMDRCTU]{2}$/.test(xy) || !/^[RC]\d{1,3}$/.test(score) || !/^\d{6}$/.test(oldMode) || !/^\d{6}$/.test(indexMode) || !/^\d{6}$/.test(worktreeMode)) throw outputError();
      requireOid(oldOid, objectFormat);
      requireOid(indexOid, objectFormat);
      const oldPath = records[++index];
      if (oldPath === undefined) throw outputError();
      entries.push({
        path: requirePath(parsed.path),
        oldPath: requirePath(oldPath),
        index: statusCode(xy[0]),
        worktree: statusCode(xy[1]),
        submodule: submoduleFlag(sub),
        ignored: false
      });
      continue;
    }
    if (record.startsWith("u ")) {
      const parsed = splitFixed(record, 10);
      const [, xy, sub, stage1Mode, stage2Mode, stage3Mode, worktreeMode, stage1Oid, stage2Oid, stage3Oid] = parsed.fields;
      if (!/^[ADU]{2}$/.test(xy) || ![stage1Mode, stage2Mode, stage3Mode, worktreeMode].every((mode) => /^\d{6}$/.test(mode))) throw outputError();
      requireOid(stage1Oid, objectFormat);
      requireOid(stage2Oid, objectFormat);
      requireOid(stage3Oid, objectFormat);
      entries.push({
        path: requirePath(parsed.path),
        oldPath: null,
        index: "unmerged",
        worktree: "unmerged",
        submodule: submoduleFlag(sub),
        ignored: false
      });
      continue;
    }
    if (record.startsWith("? ")) {
      entries.push({ path: requirePath(record.slice(2)), oldPath: null, index: "unmodified", worktree: "untracked", submodule: false, ignored: false });
      continue;
    }
    if (record.startsWith("! ")) {
      ignoredPaths.push(requirePath(record.slice(2)));
      continue;
    }
    throw outputError();
  }

  if (headOid === undefined || headName === undefined) throw outputError();
  const head: ParsedGitHead = headName === "(detached)"
    ? { kind: "detached", oid: headOid, ref: null }
    : headOid === null
      ? { kind: "unborn", oid: null, ref: `refs/heads/${headName}` }
      : { kind: "branch", oid: headOid, ref: `refs/heads/${headName}` };
  return { head, entries, ignoredPaths };
}

function rawChange(code: string): GitChangeKind {
  switch (code) {
    case "A": return "added";
    case "M": return "modified";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "T": return "type_changed";
    case "U": return "unmerged";
    default: throw outputError();
  }
}

export function parseGitRawDiffZ(value: Buffer, objectFormat: GitObjectFormat): ParsedGitRawChange[] {
  const records = nulRecords(value);
  const output: ParsedGitRawChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const metadata = records[index];
    const match = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z])(\d{0,3})$/.exec(metadata);
    if (!match) throw outputError();
    const [, oldMode, newMode, oldOid, newOid, code] = match;
    requireOid(oldOid, objectFormat);
    requireOid(newOid, objectFormat);
    const firstPath = records[++index];
    if (firstPath === undefined) throw outputError();
    let oldPath: string | null = null;
    let currentPath = requirePath(firstPath);
    if (code === "R" || code === "C") {
      const secondPath = records[++index];
      if (secondPath === undefined) throw outputError();
      oldPath = currentPath;
      currentPath = requirePath(secondPath);
    }
    output.push({ path: currentPath, oldPath, change: rawChange(code), oldMode, newMode, oldOid, newOid });
  }
  return output;
}

function parseCount(value: string): number | null {
  if (value === "-") return null;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw outputError();
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw outputError();
  return count;
}

export function parseGitNumstatZ(value: Buffer): ParsedGitNumstat[] {
  const records = nulRecords(value);
  const output: ParsedGitNumstat[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const firstTab = record.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) throw outputError();
    const additions = parseCount(record.slice(0, firstTab));
    const deletions = parseCount(record.slice(firstTab + 1, secondTab));
    if ((additions === null) !== (deletions === null)) throw outputError();
    const pathField = record.slice(secondTab + 1);
    let oldPath: string | null = null;
    let currentPath: string;
    if (pathField === "") {
      const oldRecord = records[++index];
      const newRecord = records[++index];
      if (oldRecord === undefined || newRecord === undefined) throw outputError();
      oldPath = requirePath(oldRecord);
      currentPath = requirePath(newRecord);
    } else {
      currentPath = requirePath(pathField);
    }
    output.push({
      path: currentPath,
      oldPath,
      binary: additions === null,
      additions,
      deletions
    });
  }
  return output;
}

export function parseGitBatchCheck(value: Buffer, objectFormat: GitObjectFormat): ParsedGitBatchCheck[] {
  const text = decodeUtf8(value);
  if (text && !text.endsWith("\n")) throw outputError();
  const output: ParsedGitBatchCheck[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const match = /^([a-f0-9]+) (blob|commit|tree|tag) (0|[1-9]\d*)$/.exec(line);
    if (!match) throw outputError();
    const oid = requireOid(match[1], objectFormat);
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size)) throw outputError();
    output.push({ oid, type: match[2] as ParsedGitBatchCheck["type"], size });
  }
  return output;
}

export function parseGitBatchObjects(
  value: Buffer,
  expected: readonly ParsedGitBatchCheck[],
  objectFormat: GitObjectFormat
): ParsedGitBatchObject[] {
  const output: ParsedGitBatchObject[] = [];
  let cursor = 0;
  for (const expectedObject of expected) {
    const headerEnd = value.indexOf(0x0a, cursor);
    if (headerEnd < 0) throw outputError();
    const header = decodeUtf8(value.subarray(cursor, headerEnd));
    const match = /^([a-f0-9]+) (blob|commit|tree|tag) (0|[1-9]\d*)$/.exec(header);
    if (!match) throw outputError();
    const oid = requireOid(match[1], objectFormat);
    const type = match[2] as ParsedGitBatchCheck["type"];
    const size = Number(match[3]);
    if (
      !Number.isSafeInteger(size) || oid !== expectedObject.oid ||
      type !== expectedObject.type || size !== expectedObject.size
    ) throw outputError();
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= value.length || value[contentEnd] !== 0x0a) throw outputError();
    output.push({ oid, type, size, content: Buffer.from(value.subarray(contentStart, contentEnd)) });
    cursor = contentEnd + 1;
  }
  if (cursor !== value.length) throw outputError();
  return output;
}

export function sanitizeGitPublicOneLine(value: string, maxLength: number): string | null {
  const normalized = value.normalize("NFC");
  if (normalized.length > maxLength || FORBIDDEN_ONE_LINE.test(normalized) || hasSecretValue(normalized)) return null;
  return normalized;
}

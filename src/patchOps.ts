import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexGPTConfig } from "./config.js";
import type { PreparedFileBefore } from "./fsOps.js";
import { CodexGPTError, type PathGuard, type Workspace } from "./guard.js";
import { hasSecretValue, redactSensitiveText } from "./redact.js";
import {
  TransactionError,
  type TransactionRequestOperationV1
} from "./transactions/index.js";

interface ExactLine {
  content: string;
  ending: "\r\n" | "\n" | "";
}

interface PatchBodyLine {
  kind: "context" | "remove" | "add";
  content: string;
  noNewline: boolean;
}

interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  body: PatchBodyLine[];
}

interface ParsedFilePatch {
  oldPath: string | null;
  newPath: string | null;
  hunks: ParsedHunk[];
}

export interface PreparedPatchOperation {
  path: string;
  comparisonKey: string;
  before: PreparedFileBefore;
  afterSha256: string | null;
  operation: TransactionRequestOperationV1;
}

export interface PreparedPatchResult {
  paths: string[];
  stdout: string;
  stderr: string;
  additions: number;
  deletions: number;
  changed: true;
  diff: string;
}

export interface PreparedWorkspacePatch {
  result: PreparedPatchResult;
  operations: PreparedPatchOperation[];
}

export class PatchPlanError extends CodexGPTError {
  constructor(public readonly patchPlanFailureKind: "invalid" | "check_failed") {
    super(
      patchPlanFailureKind === "invalid"
        ? "The patch is not a supported unified diff."
        : "The patch could not be applied cleanly to the current workspace state."
    );
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeGitQuotedPath(input: string): string {
  let decoded = "";
  const escapedBytes: number[] = [];
  const flushEscapedBytes = () => {
    if (!escapedBytes.length) return;
    const bytes = Buffer.from(escapedBytes.splice(0));
    const value = bytes.toString("utf8");
    if (!Buffer.from(value, "utf8").equals(bytes)) throw new PatchPlanError("invalid");
    decoded += value;
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char !== "\\") {
      flushEscapedBytes();
      decoded += char;
      continue;
    }
    index += 1;
    const escaped = input[index];
    if (escaped === undefined) throw new PatchPlanError("invalid");
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      for (let count = 0; count < 2 && index + 1 < input.length && /[0-7]/.test(input[index + 1]); count += 1) {
        index += 1;
        octal += input[index];
      }
      escapedBytes.push(Number.parseInt(octal, 8));
    } else {
      flushEscapedBytes();
      decoded += ({ a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" } as Record<string, string>)[escaped] ?? escaped;
    }
  }
  flushEscapedBytes();
  return decoded;
}

function normalizePatchPath(rawPath: string): string | null {
  const raw = rawPath.trim().split("\t")[0]?.trim();
  if (!raw) throw new PatchPlanError("invalid");
  if (raw === "/dev/null") return null;
  const unquoted = raw.startsWith('"') && raw.endsWith('"')
    ? decodeGitQuotedPath(raw.slice(1, -1))
    : raw;
  if (path.isAbsolute(unquoted) || path.win32.isAbsolute(unquoted)) return unquoted;
  const slash = unquoted.indexOf("/");
  return slash < 0 ? unquoted : unquoted.slice(slash + 1);
}

function parseRange(value: string): { start: number; count: number } {
  const match = /^(\d+)(?:,(\d+))?$/.exec(value);
  if (!match) throw new PatchPlanError("invalid");
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count)) throw new PatchPlanError("invalid");
  return { start, count };
}

function parseHunk(lines: string[], startIndex: number): { hunk: ParsedHunk; nextIndex: number } {
  const header = /^@@ -(\d+(?:,\d+)?) \+(\d+(?:,\d+)?) @@(?: .*)?$/.exec(lines[startIndex] ?? "");
  if (!header) throw new PatchPlanError("invalid");
  const oldRange = parseRange(header[1]);
  const newRange = parseRange(header[2]);
  if ((oldRange.count > 0 && oldRange.start === 0) || (newRange.count > 0 && newRange.start === 0)) {
    throw new PatchPlanError("invalid");
  }
  const body: PatchBodyLine[] = [];
  let oldSeen = 0;
  let newSeen = 0;
  let index = startIndex + 1;
  while (oldSeen < oldRange.count || newSeen < newRange.count) {
    const line = lines[index];
    if (line === undefined) throw new PatchPlanError("invalid");
    const prefix = line[0];
    if (prefix === "\\") {
      const previous = body.at(-1);
      if (line !== "\\ No newline at end of file" || !previous || previous.noNewline) {
        throw new PatchPlanError("invalid");
      }
      previous.noNewline = true;
      index += 1;
      continue;
    }
    if (prefix !== " " && prefix !== "-" && prefix !== "+") throw new PatchPlanError("invalid");
    const kind = prefix === " " ? "context" : prefix === "-" ? "remove" : "add";
    if (kind !== "add") oldSeen += 1;
    if (kind !== "remove") newSeen += 1;
    if (oldSeen > oldRange.count || newSeen > newRange.count) throw new PatchPlanError("invalid");
    body.push({ kind, content: line.slice(1), noNewline: false });
    index += 1;
  }
  if (lines[index] === "\\ No newline at end of file") {
    const previous = body.at(-1);
    if (!previous || previous.noNewline) throw new PatchPlanError("invalid");
    previous.noNewline = true;
    index += 1;
  }
  return {
    hunk: {
      oldStart: oldRange.start,
      oldCount: oldRange.count,
      newStart: newRange.start,
      newCount: newRange.count,
      body
    },
    nextIndex: index
  };
}

function parseUnifiedDiff(patch: string): ParsedFilePatch[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (
      /^(?:rename|copy) (?:from|to) /.test(line)
      || /^(?:similarity|dissimilarity) index /.test(line)
      || /^(?:old|new) mode /.test(line)
      || (/^(?:new|deleted) file mode /.test(line) && !/^(?:new|deleted) file mode 100644$/.test(line))
    ) {
      throw new PatchPlanError("invalid");
    }
  }
  const files: ParsedFilePatch[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index] === "GIT binary patch" || lines[index]?.startsWith("Binary files ")) {
      throw new PatchPlanError("check_failed");
    }
    if (!lines[index]?.startsWith("--- ")) {
      index += 1;
      continue;
    }
    const oldPath = normalizePatchPath(lines[index].slice(4));
    index += 1;
    if (!lines[index]?.startsWith("+++ ")) throw new PatchPlanError("invalid");
    const newPath = normalizePatchPath(lines[index].slice(4));
    index += 1;
    if (oldPath === null && newPath === null) throw new PatchPlanError("invalid");
    if (oldPath !== null && newPath !== null && oldPath !== newPath) {
      throw new PatchPlanError("check_failed");
    }
    const hunks: ParsedHunk[] = [];
    while (lines[index]?.startsWith("@@ ")) {
      const parsed = parseHunk(lines, index);
      hunks.push(parsed.hunk);
      index = parsed.nextIndex;
    }
    if (!hunks.length) throw new PatchPlanError("check_failed");
    files.push({ oldPath, newPath, hunks });
  }
  if (!files.length) throw new PatchPlanError("invalid");
  return files;
}

function exactLines(text: string): ExactLine[] {
  const lines: ExactLine[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    const hasCarriageReturn = index > start && text[index - 1] === "\r";
    lines.push({
      content: text.slice(start, hasCarriageReturn ? index - 1 : index),
      ending: hasCarriageReturn ? "\r\n" : "\n"
    });
    start = index + 1;
  }
  if (start < text.length) lines.push({ content: text.slice(start), ending: "" });
  return lines;
}

function preferredEnding(lines: readonly ExactLine[]): "\r\n" | "\n" {
  const crlf = lines.filter((line) => line.ending === "\r\n").length;
  const lf = lines.filter((line) => line.ending === "\n").length;
  return crlf > lf ? "\r\n" : "\n";
}

function applyHunks(beforeText: string, filePatch: ParsedFilePatch): Buffer {
  const original = exactLines(beforeText);
  const current = original.map((line) => ({ ...line }));
  const addedEnding = preferredEnding(original);
  let offset = 0;
  let previousOriginalEnd = 0;
  for (const hunk of filePatch.hunks) {
    const originalStart = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    const expectedTargetStart = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
    if (originalStart < previousOriginalEnd || originalStart > original.length) {
      throw new PatchPlanError("check_failed");
    }
    const targetStart = originalStart + offset;
    if (targetStart !== expectedTargetStart) throw new PatchPlanError("check_failed");
    let cursor = targetStart;
    const replacement: ExactLine[] = [];
    for (const bodyLine of hunk.body) {
      if (bodyLine.kind === "add") {
        replacement.push({ content: bodyLine.content, ending: bodyLine.noNewline ? "" : addedEnding });
        continue;
      }
      const actual = current[cursor];
      if (!actual || actual.content !== bodyLine.content) throw new PatchPlanError("check_failed");
      if (bodyLine.noNewline ? actual.ending !== "" : actual.ending === "") {
        throw new PatchPlanError("check_failed");
      }
      if (bodyLine.kind === "context") replacement.push({ ...actual });
      cursor += 1;
    }
    const consumed = cursor - targetStart;
    if (consumed !== hunk.oldCount || replacement.length !== hunk.newCount) {
      throw new PatchPlanError("invalid");
    }
    current.splice(targetStart, consumed, ...replacement);
    offset += hunk.newCount - hunk.oldCount;
    previousOriginalEnd = originalStart + hunk.oldCount;
  }
  return Buffer.from(current.map((line) => `${line.content}${line.ending}`).join(""), "utf8");
}

async function inspectTarget(
  config: Pick<CodexGPTConfig, "maxReadBytes" | "maxWriteBytes">,
  guard: PathGuard,
  workspace: Workspace,
  targetPath: string
): Promise<{
  absPath: string;
  path: string;
  comparisonKey: string;
  before: PreparedFileBefore;
  text: string;
}> {
  const facts = guard.resolvePolicyFacts(workspace, targetPath, { forWrite: true });
  try {
    await guard.assertTextFile(facts.absPath, Math.max(config.maxReadBytes, config.maxWriteBytes));
    const [stat, bytes] = await Promise.all([
      fsp.lstat(facts.absPath, { bigint: true }),
      fsp.readFile(facts.absPath)
    ]);
    if (stat.isSymbolicLink() || !stat.isFile() || bytes.length !== Number(stat.size)) {
      throw new PatchPlanError("check_failed");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) throw new PatchPlanError("check_failed");
    return {
      absPath: facts.absPath,
      path: facts.relPath,
      comparisonKey: facts.comparisonKey,
      before: {
        exists: true,
        bytes,
        sha256: sha256(bytes),
        metadata: {
          mode: Number(stat.mode),
          atimeMs: Number(stat.atimeNs) / 1_000_000,
          mtimeMs: Number(stat.mtimeNs) / 1_000_000
        }
      },
      text
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      absPath: facts.absPath,
      path: facts.relPath,
      comparisonKey: facts.comparisonKey,
      before: { exists: false, bytes: null, sha256: null, metadata: null },
      text: ""
    };
  }
}

function versionConflict(relativePath: string): TransactionError {
  return new TransactionError(
    "FILE_VERSION_CONFLICT",
    "Workspace file facts do not match the caller's expected version.",
    { relativePath }
  );
}

export async function prepareWorkspacePatch(
  config: Pick<CodexGPTConfig, "maxReadBytes" | "maxWriteBytes" | "maxOutputBytes">,
  guard: PathGuard,
  workspace: Workspace,
  patch: string,
  options: { expectedFiles?: Readonly<Record<string, string | null>> } = {}
): Promise<PreparedWorkspacePatch> {
  if (!patch.trim()) throw new PatchPlanError("invalid");
  if (Buffer.byteLength(patch, "utf8") > config.maxWriteBytes) {
    throw new CodexGPTError(`Patch is too large. Limit: ${config.maxWriteBytes} bytes.`);
  }
  if (hasSecretValue(patch)) {
    throw new CodexGPTError("Secret-looking content is blocked from apply_patch. Use placeholders such as [REDACTED_SECRET].");
  }
  const parsedFiles = parseUnifiedDiff(patch);
  if (parsedFiles.length > 1_000) throw new PatchPlanError("invalid");
  const inspected = await Promise.all(parsedFiles.map(async (filePatch) => {
    const targetPath = filePatch.newPath ?? filePatch.oldPath;
    if (!targetPath) throw new PatchPlanError("invalid");
    return { filePatch, inspected: await inspectTarget(config, guard, workspace, targetPath) };
  }));
  const comparisonKeys = inspected.map(({ inspected: target }) => target.comparisonKey);
  if (new Set(comparisonKeys).size !== comparisonKeys.length) {
    throw new PatchPlanError("invalid");
  }

  const byComparisonKey = new Map(inspected.map((entry) => [entry.inspected.comparisonKey, entry]));
  const expectedEntries = Object.entries(options.expectedFiles ?? {});
  if (expectedEntries.length > 1_000) throw new PatchPlanError("invalid");
  const expectedComparisonKeys = new Set<string>();
  for (const [expectedPath, expectedSha256] of expectedEntries) {
    if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Expected file SHA-256 is invalid.");
    }
    const expectedFacts = guard.resolvePolicyFacts(workspace, expectedPath, { forWrite: true });
    if (expectedComparisonKeys.has(expectedFacts.comparisonKey)) throw new PatchPlanError("invalid");
    expectedComparisonKeys.add(expectedFacts.comparisonKey);
    const matched = byComparisonKey.get(expectedFacts.comparisonKey);
    if (!matched) throw new PatchPlanError("invalid");
    if (matched.inspected.before.sha256 !== expectedSha256) throw versionConflict(matched.inspected.path);
  }

  let additions = 0;
  let deletions = 0;
  const operations: PreparedPatchOperation[] = [];
  for (let index = 0; index < inspected.length; index += 1) {
    const { filePatch, inspected: target } = inspected[index];
    const isCreate = filePatch.oldPath === null;
    const isDelete = filePatch.newPath === null;
    if (isCreate && target.before.exists) throw new PatchPlanError("check_failed");
    if (!isCreate && !target.before.exists) throw new PatchPlanError("check_failed");
    const afterBytes = applyHunks(target.text, filePatch);
    if (afterBytes.length > config.maxWriteBytes) throw new PatchPlanError("check_failed");
    const afterText = afterBytes.toString("utf8");
    if (hasSecretValue(afterText)) {
      throw new CodexGPTError("Secret-looking content is blocked from apply_patch. Use placeholders such as [REDACTED_SECRET].");
    }
    for (const hunk of filePatch.hunks) {
      additions += hunk.body.filter((line) => line.kind === "add").length;
      deletions += hunk.body.filter((line) => line.kind === "remove").length;
    }
    const operationId = `op_patch_${String(index + 1).padStart(4, "0")}`;
    let operation: TransactionRequestOperationV1;
    let afterSha256: string | null;
    if (isDelete) {
      if (afterBytes.length !== 0) throw new PatchPlanError("check_failed");
      operation = {
        operationId,
        kind: "delete",
        relativePath: target.path,
        expectedSha256: target.before.sha256
      };
      afterSha256 = null;
    } else if (isCreate) {
      const parent = await fsp.stat(path.dirname(target.absPath)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          throw new TransactionError(
            "ATOMIC_BACKEND_UNAVAILABLE",
            "Atomic parent-directory creation is not available for this target."
          );
        }
        throw error;
      });
      if (!parent.isDirectory()) throw new PatchPlanError("check_failed");
      operation = {
        operationId,
        kind: "create",
        relativePath: target.path,
        bytes: afterBytes,
        expectedAbsent: true
      };
      afterSha256 = sha256(afterBytes);
    } else {
      operation = {
        operationId,
        kind: "replace",
        relativePath: target.path,
        bytes: afterBytes,
        expectedSha256: target.before.sha256
      };
      afterSha256 = sha256(afterBytes);
    }
    operations.push({
      path: target.path,
      comparisonKey: target.comparisonKey,
      before: target.before,
      afterSha256,
      operation
    });
  }

  return {
    result: {
      paths: operations.map((operation) => operation.path),
      stdout: "",
      stderr: "",
      additions,
      deletions,
      changed: true,
      diff: redactSensitiveText(patch.trimEnd())
    },
    operations
  };
}

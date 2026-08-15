import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { minimatch } from "minimatch";
import type { CodexGPTConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexGPTError, displayPath, normalizeRelPath, PathGuard } from "./guard.js";
import { hasSecretValue, redactSensitiveText } from "./redact.js";
import {
  TransactionError,
  type FileMetadataV1,
  type TransactionRequestOperationV1
} from "./transactions/index.js";
import { toolExecutionPipelineForGuard } from "./tools/executionPipelineScope.js";

export interface TreeOptions {
  path?: string;
  maxDepth: number;
  includeHidden: boolean;
  maxEntries: number;
}

export interface TreeResult {
  text: string;
  entries: number;
  truncated: boolean;
}

export interface ReadFileResult {
  path: string;
  text: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  bytes: number;
  sha256: string;
  truncated: boolean;
}

export interface DiffResult {
  diff: string;
  additions: number;
  deletions: number;
  changed: boolean;
}

export interface WriteFileResult {
  path: string;
  bytes: number;
  sha256: string;
  existed: boolean;
  diff: DiffResult;
}

export interface EditFileResult {
  path: string;
  replacements: number;
  bytes: number;
  sha256: string;
  diff: DiffResult;
}

export interface PreparedFileBefore {
  exists: boolean;
  bytes: Buffer | null;
  sha256: string | null;
  metadata: FileMetadataV1 | null;
}

export interface PreparedFileMutation<TResult extends WriteFileResult | EditFileResult> {
  result: TResult;
  before: PreparedFileBefore;
  operation: Extract<TransactionRequestOperationV1, { kind: "create" | "replace" }>;
}

export type WorkspaceTextBatchMode = "replace" | "append" | "create_if_missing";

export interface WorkspaceTextBatchWrite {
  path: string;
  content: string;
  mode: WorkspaceTextBatchMode;
  expectedSha256?: string;
  expectedStableIdentity?: { dev: string; ino: string };
  expectedParentIdentity?: string;
  missingContent?: string;
}

export interface PreparedWorkspaceTextBatchOperation {
  path: string;
  before: PreparedFileBefore;
  afterSha256: string;
  operation: Extract<TransactionRequestOperationV1, { kind: "create" | "replace" }>;
}

export interface PreparedWorkspaceTextBatch {
  operations: PreparedWorkspaceTextBatchOperation[];
  createdPaths: string[];
  totalAfterBytes: number;
}

export const AI_BRIDGE_SCAFFOLD_FILES: Readonly<Record<string, string>> = Object.freeze({
  "README.md": `# AI Bridge\n\nShared planning context for ChatGPT, other planning models, Codex, OpenCode, Pi, or another local implementation agent.\n\n- current-plan.md: plan produced by ChatGPT or another planning model for the implementation agent.\n- agent-status.md: generic implementation notes, touched files, test results, blockers, and review notes.\n- implementation-diff.patch: final review diff from the implementation agent when practical.\n- codex-status.md: legacy Codex-specific status file, kept for existing workflows.\n- decisions.md: architectural decisions that should remain stable.\n- open-questions.md: unresolved questions.\n- execution-log.jsonl: append-only generic agent handoff and execution events.\n- handoff-run-state.json: machine-readable run lifecycle (running/completed/failed/timed_out) written by execute-handoff/watch-handoff/loop-handoff and polled by the read-only wait_for_handoff tool.\n- session-log.jsonl: append-only legacy session events.\n`,
  "current-plan.md": "# Current Plan\n\nNo plan written yet.\n",
  "agent-status.md": "# Agent Status\n\nNo implementation agent status written yet.\n",
  "implementation-diff.patch": "",
  "codex-status.md": "# Codex Status\n\nNo Codex status written yet.\n",
  "decisions.md": "# Decisions\n\n",
  "open-questions.md": "# Open Questions\n\n",
  "execution-log.jsonl": "",
  "session-log.jsonl": ""
});

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function versionConflict(relativePath: string): TransactionError {
  return new TransactionError(
    "FILE_VERSION_CONFLICT",
    "Workspace file facts do not match the caller's expected version.",
    { relativePath }
  );
}

function assertExpectedSha256(value: string | undefined): void {
  if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
    throw new TransactionError(
      "TRANSACTION_PRECONDITION_FAILED",
      "Expected SHA-256 must be lowercase hexadecimal."
    );
  }
}

async function inspectPreparedTextTarget(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string
): Promise<{
  absPath: string;
  relPath: string;
  before: PreparedFileBefore;
  text: string;
}> {
  const resolved = guard.resolve(workspace, filePath, { forWrite: true });
  try {
    await guard.assertTextFile(
      resolved.absPath,
      Math.max(config.maxWriteBytes, config.maxReadBytes)
    );
    const [stat, bytes] = await Promise.all([
      fsp.lstat(resolved.absPath, { bigint: true }),
      fsp.readFile(resolved.absPath)
    ]);
    if (stat.isSymbolicLink() || !stat.isFile() || bytes.length !== Number(stat.size)) {
      throw new CodexGPTError(`Not a file: ${resolved.relPath}`);
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      throw new CodexGPTError("Refusing to read binary file.");
    }
    return {
      absPath: resolved.absPath,
      relPath: resolved.relPath,
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
      absPath: resolved.absPath,
      relPath: resolved.relPath,
      before: {
        exists: false,
        bytes: null,
        sha256: null,
        metadata: null
      },
      text: ""
    };
  }
}

export async function prepareWorkspaceTextBatch(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  writes: readonly WorkspaceTextBatchWrite[],
  options: { maxBatchBytes?: number } = {}
): Promise<PreparedWorkspaceTextBatch> {
  if (writes.length < 1 || writes.length > 1_000) {
    throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Workspace batch operation count is invalid.");
  }
  const maxBatchBytes = options.maxBatchBytes ?? config.maxWriteBytes;
  if (!Number.isSafeInteger(maxBatchBytes) || maxBatchBytes < 1 || maxBatchBytes > 64 * 1024 * 1024) {
    throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Workspace batch byte limit is invalid.");
  }
  const operations: PreparedWorkspaceTextBatchOperation[] = [];
  const createdPaths: string[] = [];
  const comparisonKeys = new Set<string>();
  let totalAfterBytes = 0;

  for (let index = 0; index < writes.length; index += 1) {
    const write = writes[index];
    assertExpectedSha256(write.expectedSha256);
    const inspected = await inspectPreparedTextTarget(config, guard, workspace, write.path);
    const comparisonKey = process.platform === "win32"
      ? inspected.relPath.toLocaleLowerCase("en-US")
      : inspected.relPath;
    if (comparisonKeys.has(comparisonKey)) {
      throw new TransactionError("TRANSACTION_PRECONDITION_FAILED", "Workspace batch paths are duplicate.");
    }
    comparisonKeys.add(comparisonKey);
    if (write.expectedSha256 !== undefined && inspected.before.sha256 !== write.expectedSha256) {
      throw versionConflict(inspected.relPath);
    }
    if (write.mode === "create_if_missing" && inspected.before.exists) continue;

    const after = write.mode === "append"
      ? inspected.before.exists
        ? `${inspected.text}${write.content}`
        : write.missingContent ?? write.content
      : write.content;
    if (hasSecretValue(after)) {
      throw new CodexGPTError(
        "Secret-looking content is blocked from write. Use placeholders such as [REDACTED_SECRET] in handoff files."
      );
    }
    const bytes = Buffer.from(after, "utf8");
    if (bytes.length > config.maxWriteBytes) {
      throw new CodexGPTError(
        `Write content is too large (${bytes.length} bytes). Limit: ${config.maxWriteBytes} bytes.`
      );
    }
    totalAfterBytes += bytes.length;
    if (totalAfterBytes > maxBatchBytes) {
      throw new TransactionError(
        "TRANSACTION_PRECONDITION_FAILED",
        "Workspace batch payload exceeds the aggregate byte limit."
      );
    }
    const operationId = `op_batch_${String(index).padStart(4, "0")}`;
    const operation: PreparedWorkspaceTextBatchOperation["operation"] = inspected.before.exists
      ? {
          operationId,
          kind: "replace",
          relativePath: inspected.relPath,
          bytes,
          expectedSha256: inspected.before.sha256,
          ...(write.expectedStableIdentity
            ? { expectedStableIdentity: { ...write.expectedStableIdentity } }
            : {}),
          ...(write.expectedParentIdentity
            ? { expectedParentIdentity: write.expectedParentIdentity }
            : {})
        }
      : {
          operationId,
          kind: "create",
          relativePath: inspected.relPath,
          bytes,
          expectedAbsent: true
        };
    operations.push({
      path: inspected.relPath,
      before: inspected.before,
      afterSha256: sha256(bytes),
      operation
    });
    if (!inspected.before.exists) createdPaths.push(inspected.relPath);
  }
  return { operations, createdPaths, totalAfterBytes };
}

export function aiBridgeScaffoldWrites(config: Pick<CodexGPTConfig, "contextDir">): WorkspaceTextBatchWrite[] {
  return Object.entries(AI_BRIDGE_SCAFFOLD_FILES).map(([name, content]) => ({
    path: `${config.contextDir}/${name}`,
    content,
    mode: "create_if_missing"
  }));
}

export async function prepareWriteTextFile(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  content: string,
  options: {
    createDirs?: boolean;
    overwrite?: boolean;
    expectedSha256?: string;
  } = {}
): Promise<PreparedFileMutation<WriteFileResult>> {
  assertExpectedSha256(options.expectedSha256);
  const contentBytes = Buffer.from(content, "utf8");
  if (contentBytes.length > config.maxWriteBytes) {
    throw new CodexGPTError(
      `Write content is too large (${contentBytes.length} bytes). Limit: ${config.maxWriteBytes} bytes.`
    );
  }
  if (hasSecretValue(content)) {
    throw new CodexGPTError(
      "Secret-looking content is blocked from write. Use placeholders such as [REDACTED_SECRET] in handoff files."
    );
  }

  const inspected = await inspectPreparedTextTarget(config, guard, workspace, filePath);
  if (options.expectedSha256 !== undefined && inspected.before.sha256 !== options.expectedSha256) {
    throw versionConflict(inspected.relPath);
  }
  if (inspected.before.exists && options.overwrite === false) {
    throw new CodexGPTError(`File already exists and overwrite=false: ${inspected.relPath}`);
  }
  if (!inspected.before.exists) {
    try {
      const parent = await fsp.stat(path.dirname(inspected.absPath));
      if (!parent.isDirectory()) throw new CodexGPTError(`Not a directory: ${path.dirname(inspected.relPath)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (options.createDirs) {
        throw new TransactionError(
          "ATOMIC_BACKEND_UNAVAILABLE",
          "Atomic parent-directory creation is not available for this target."
        );
      }
      throw error;
    }
  }

  const diff = makeUnifiedDiff(inspected.text, content, inspected.relPath);
  const result: WriteFileResult = {
    path: inspected.relPath,
    bytes: contentBytes.length,
    sha256: sha256(contentBytes),
    existed: inspected.before.exists,
    diff
  };
  const operation: PreparedFileMutation<WriteFileResult>["operation"] = inspected.before.exists
    ? {
        operationId: "op_write",
        kind: "replace",
        relativePath: inspected.relPath,
        bytes: contentBytes,
        expectedSha256: inspected.before.sha256
      }
    : {
        operationId: "op_write",
        kind: "create",
        relativePath: inspected.relPath,
        bytes: contentBytes,
        expectedAbsent: true
      };
  return { result, before: inspected.before, operation };
}

export async function prepareEditTextFile(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  oldText: string,
  newText: string,
  options: {
    replaceAll?: boolean;
    expectedReplacements?: number;
    expectedSha256?: string;
  } = {}
): Promise<PreparedFileMutation<EditFileResult>> {
  if (!oldText) throw new CodexGPTError("old_text must not be empty.");
  assertExpectedSha256(options.expectedSha256);
  const inspected = await inspectPreparedTextTarget(config, guard, workspace, filePath);
  if (!inspected.before.exists || !inspected.before.bytes || !inspected.before.sha256) {
    const missing = new Error(`File not found: ${inspected.relPath}`) as NodeJS.ErrnoException;
    missing.code = "ENOENT";
    throw missing;
  }
  if (options.expectedSha256 !== undefined && inspected.before.sha256 !== options.expectedSha256) {
    throw versionConflict(inspected.relPath);
  }

  const occurrences = inspected.text.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new CodexGPTError(
      `old_text was not found in ${inspected.relPath}. Read the file and retry with an exact snippet.`
    );
  }
  let replacements: number;
  let after: string;
  if (options.replaceAll) {
    after = inspected.text.split(oldText).join(newText);
    replacements = occurrences;
  } else {
    if (occurrences !== 1) {
      throw new CodexGPTError(
        `old_text matched ${occurrences} times. Provide a more specific old_text or set replace_all=true.`
      );
    }
    after = inspected.text.replace(oldText, newText);
    replacements = 1;
  }
  if (typeof options.expectedReplacements === "number" && replacements !== options.expectedReplacements) {
    throw new CodexGPTError(
      `Expected ${options.expectedReplacements} replacements but would perform ${replacements}.`
    );
  }

  const afterBytes = Buffer.from(after, "utf8");
  if (afterBytes.length > config.maxWriteBytes) {
    throw new CodexGPTError(
      `Edited file would be too large (${afterBytes.length} bytes). Limit: ${config.maxWriteBytes} bytes.`
    );
  }
  if (hasSecretValue(after)) {
    throw new CodexGPTError(
      "Secret-looking content is blocked from edit. Use placeholders such as [REDACTED_SECRET] in handoff files."
    );
  }

  return {
    result: {
      path: inspected.relPath,
      replacements,
      bytes: afterBytes.length,
      sha256: sha256(afterBytes),
      diff: makeUnifiedDiff(inspected.text, after, inspected.relPath)
    },
    before: inspected.before,
    operation: {
      operationId: "op_edit",
      kind: "replace",
      relativePath: inspected.relPath,
      bytes: afterBytes,
      expectedSha256: inspected.before.sha256
    }
  };
}

// Ranged reads may scan larger text files, but each returned range remains capped by maxReadBytes.
// Separating scan capacity from response capacity prevents multi-megabyte connector payloads and 502 truncation.
export function textScanByteLimit(config: CodexGPTConfig): number {
  return Math.max(config.maxReadBytes, 8 * 1024 * 1024);
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function withLineNumbers(lines: string[], startLine: number): string {
  const width = String(startLine + lines.length - 1).length;
  return lines.map((line, idx) => `${String(startLine + idx).padStart(width, " ")} | ${line}`).join("\n");
}

export function makeUnifiedDiff(oldText: string, newText: string, relPath: string, maxChars = 60_000): DiffResult {
  if (oldText === newText) {
    return { diff: `No changes in ${relPath}.`, additions: 0, deletions: 0, changed: false };
  }

  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const coreOldStart = prefix;
  const coreOldEnd = oldLines.length - suffix;
  const coreNewStart = prefix;
  const coreNewEnd = newLines.length - suffix;
  const context = 3;
  const oldStart = Math.max(0, coreOldStart - context);
  const oldEnd = Math.min(oldLines.length, coreOldEnd + context);
  const newStart = Math.max(0, coreNewStart - context);
  const newEnd = Math.min(newLines.length, coreNewEnd + context);

  const additions = Math.max(0, coreNewEnd - coreNewStart);
  const deletions = Math.max(0, coreOldEnd - coreOldStart);

  const out: string[] = [`--- a/${relPath}`, `+++ b/${relPath}`, `@@ -${oldStart + 1},${oldEnd - oldStart} +${newStart + 1},${newEnd - newStart} @@`];

  for (let i = oldStart; i < coreOldStart; i += 1) out.push(` ${oldLines[i]}`);
  for (let i = coreOldStart; i < coreOldEnd; i += 1) out.push(`-${oldLines[i]}`);
  for (let i = coreNewStart; i < coreNewEnd; i += 1) out.push(`+${newLines[i]}`);
  for (let i = coreOldEnd; i < oldEnd; i += 1) out.push(` ${oldLines[i]}`);

  let diff = out.join("\n");
  if (diff.length > maxChars) {
    diff = diff.slice(0, maxChars) + `\n...[diff truncated to ${maxChars} chars]`;
  }
  return { diff: redactSensitiveText(diff), additions, deletions, changed: true };
}

function isHiddenName(name: string): boolean {
  return name.startsWith(".") && name !== "." && name !== "..";
}

async function repoTreeBody(config: CodexGPTConfig, guard: PathGuard, workspace: Workspace, options: TreeOptions): Promise<TreeResult> {
  const target = guard.resolve(workspace, options.path ?? ".");
  const stat = await fsp.stat(target.absPath);
  if (!stat.isDirectory()) {
    throw new CodexGPTError(`Not a directory: ${target.relPath}`);
  }

  const lines: string[] = [target.relPath === "." ? "." : `${target.relPath}/`];
  let entries = 0;
  let truncated = false;

  async function walk(absDir: string, relDir: string, depth: number, prefix: string): Promise<void> {
    if (depth >= options.maxDepth || truncated) return;
    let dirents = await fsp.readdir(absDir, { withFileTypes: true });
    dirents = dirents
      .filter((entry) => options.includeHidden || !isHiddenName(entry.name))
      .filter((entry) => !guard.isBlockedRelativePath(normalizeRelPath(path.join(relDir, entry.name))))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < dirents.length; i += 1) {
      if (entries >= options.maxEntries) {
        truncated = true;
        return;
      }
      const entry = dirents[i];
      const isLast = i === dirents.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      const childAbs = path.join(absDir, entry.name);
      const childRel = normalizeRelPath(path.join(relDir, entry.name));
      const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;
      lines.push(`${prefix}${branch}${displayName}`);
      entries += 1;
      if (entry.isDirectory()) {
        await walk(childAbs, childRel, depth + 1, childPrefix);
      }
      if (truncated) return;
    }
  }

  await walk(target.absPath, target.relPath === "." ? "" : target.relPath, 0, "");
  if (truncated) lines.push(`...[tree truncated after ${entries} entries]`);
  return { text: lines.join("\n"), entries, truncated };
}

export async function repoTree(config: CodexGPTConfig, guard: PathGuard, workspace: Workspace, options: TreeOptions): Promise<TreeResult> {
  return toolExecutionPipelineForGuard(guard).execute<TreeResult>({
    toolName: "tree",
    arguments: Object.freeze({
      workspace_id: workspace.id,
      path: options.path ?? ".",
      max_depth: options.maxDepth,
      include_hidden: options.includeHidden,
      max_entries: options.maxEntries
    }),
    body: () => repoTreeBody(config, guard, workspace, options)
  });
}

export async function listFiles(
  guard: PathGuard,
  workspace: Workspace,
  options: { root?: string; glob?: string; includeHidden?: boolean; maxFiles: number }
): Promise<string[]> {
  const target = guard.resolve(workspace, options.root ?? ".");
  const stat = await fsp.stat(target.absPath);
  const files: string[] = [];

  async function addFile(absFile: string): Promise<void> {
    const rel = displayPath(absFile, workspace.root);
    if (guard.isBlockedRelativePath(rel)) return;
    if (!options.includeHidden && rel.split("/").some(isHiddenName)) return;
    if (options.glob && !minimatch(rel, options.glob, { dot: true })) return;
    files.push(rel);
  }

  async function walk(absDir: string): Promise<void> {
    if (files.length >= options.maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= options.maxFiles) return;
      const abs = path.join(absDir, entry.name);
      const rel = displayPath(abs, workspace.root);
      if (guard.isBlockedRelativePath(rel)) continue;
      if (!options.includeHidden && rel.split("/").some(isHiddenName)) continue;
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) await addFile(abs);
    }
  }

  if (stat.isFile()) await addFile(target.absPath);
  else await walk(target.absPath);
  return files;
}

async function readTextFileBody(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  options: { startLine?: number; endLine?: number; maxBytes?: number } = {}
): Promise<ReadFileResult> {
  const resolved = guard.resolve(workspace, filePath);
  const maxBytes = Math.min(options.maxBytes ?? config.maxReadBytes, config.maxReadBytes);
  const hasRange = options.startLine !== undefined || options.endLine !== undefined;
  await guard.assertTextFile(resolved.absPath, hasRange ? textScanByteLimit(config) : maxBytes);
  const buffer = await fsp.readFile(resolved.absPath);
  const text = buffer.toString("utf8");
  const allLines = splitLines(text);
  const totalLines = allLines.length;
  const startLine = Math.max(1, Math.floor(options.startLine ?? 1));
  const endLine = Math.min(totalLines, Math.floor(options.endLine ?? totalLines));
  if (endLine < startLine) {
    throw new CodexGPTError(`end_line (${endLine}) must be >= start_line (${startLine}).`);
  }
  const selected = allLines.slice(startLine - 1, endLine);
  const numbered = withLineNumbers(selected, startLine);
  if (hasRange && Buffer.byteLength(numbered, "utf8") > maxBytes) {
    throw new CodexGPTError(`Selected line range is too large. Limit: ${maxBytes} bytes.`);
  }
  const truncated = startLine > 1 || endLine < totalLines;
  return {
    path: resolved.relPath,
    text: numbered,
    startLine,
    endLine,
    totalLines,
    bytes: buffer.byteLength,
    sha256: sha256(text),
    truncated
  };
}

export async function readTextFile(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  options: { startLine?: number; endLine?: number; maxBytes?: number } = {}
): Promise<ReadFileResult> {
  return toolExecutionPipelineForGuard(guard).execute<ReadFileResult>({
    toolName: "read",
    arguments: Object.freeze({
      workspace_id: workspace.id,
      path: filePath,
      ...(options.startLine !== undefined ? { start_line: options.startLine } : {}),
      ...(options.endLine !== undefined ? { end_line: options.endLine } : {}),
      ...(options.maxBytes !== undefined ? { max_bytes: options.maxBytes } : {})
    }),
    body: () => readTextFileBody(config, guard, workspace, filePath, options)
  });
}

export async function writeTextFile(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  content: string,
  options: { createDirs?: boolean; overwrite?: boolean } = {}
): Promise<WriteFileResult> {
  const resolved = guard.resolve(workspace, filePath, { forWrite: true });
  const contentBytes = Buffer.byteLength(content, "utf8");
  if (contentBytes > config.maxWriteBytes) {
    throw new CodexGPTError(`Write content is too large (${contentBytes} bytes). Limit: ${config.maxWriteBytes} bytes.`);
  }
  if (hasSecretValue(content)) {
    throw new CodexGPTError("Secret-looking content is blocked from write. Use placeholders such as [REDACTED_SECRET] in handoff files.");
  }

  let oldText = "";
  let existed = false;
  try {
    await guard.assertTextFile(resolved.absPath, Math.max(config.maxWriteBytes, config.maxReadBytes));
    oldText = await fsp.readFile(resolved.absPath, "utf8");
    existed = true;
  } catch (error) {
    if (error instanceof CodexGPTError && error.message.startsWith("Not a file")) throw error;
    if (fs.existsSync(resolved.absPath)) throw error;
  }

  if (existed && options.overwrite === false) {
    throw new CodexGPTError(`File already exists and overwrite=false: ${resolved.relPath}`);
  }
  if (options.createDirs) {
    await fsp.mkdir(path.dirname(resolved.absPath), { recursive: true });
  }

  const diff = makeUnifiedDiff(oldText, content, resolved.relPath);
  await fsp.writeFile(resolved.absPath, content, "utf8");
  return { path: resolved.relPath, bytes: contentBytes, sha256: sha256(content), existed, diff };
}

export async function editTextFile(
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath: string,
  oldText: string,
  newText: string,
  options: { replaceAll?: boolean; expectedReplacements?: number } = {}
): Promise<EditFileResult> {
  if (!oldText) throw new CodexGPTError("old_text must not be empty.");
  const resolved = guard.resolve(workspace, filePath, { forWrite: true });
  await guard.assertTextFile(resolved.absPath, Math.max(config.maxWriteBytes, config.maxReadBytes));
  const before = await fsp.readFile(resolved.absPath, "utf8");
  const occurrences = before.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new CodexGPTError(`old_text was not found in ${resolved.relPath}. Read the file and retry with an exact snippet.`);
  }

  let replacements: number;
  let after: string;
  if (options.replaceAll) {
    after = before.split(oldText).join(newText);
    replacements = occurrences;
  } else {
    if (occurrences !== 1) {
      throw new CodexGPTError(`old_text matched ${occurrences} times. Provide a more specific old_text or set replace_all=true.`);
    }
    after = before.replace(oldText, newText);
    replacements = 1;
  }

  if (typeof options.expectedReplacements === "number" && replacements !== options.expectedReplacements) {
    throw new CodexGPTError(`Expected ${options.expectedReplacements} replacements but would perform ${replacements}.`);
  }

  const afterBytes = Buffer.byteLength(after, "utf8");
  if (afterBytes > config.maxWriteBytes) {
    throw new CodexGPTError(`Edited file would be too large (${afterBytes} bytes). Limit: ${config.maxWriteBytes} bytes.`);
  }
  if (hasSecretValue(after)) {
    throw new CodexGPTError("Secret-looking content is blocked from edit. Use placeholders such as [REDACTED_SECRET] in handoff files.");
  }

  const diff = makeUnifiedDiff(before, after, resolved.relPath);
  await fsp.writeFile(resolved.absPath, after, "utf8");
  return { path: resolved.relPath, replacements, bytes: afterBytes, sha256: sha256(after), diff };
}

export async function ensureAiBridge(config: CodexGPTConfig, guard: PathGuard, workspace: Workspace): Promise<string[]> {
  const created: string[] = [];
  for (const [name, content] of Object.entries(AI_BRIDGE_SCAFFOLD_FILES)) {
    const rel = `${config.contextDir}/${name}`;
    const resolved = guard.resolve(workspace, rel, { forWrite: true });
    if (!fs.existsSync(resolved.absPath)) {
      await fsp.mkdir(path.dirname(resolved.absPath), { recursive: true });
      await fsp.writeFile(resolved.absPath, content, "utf8");
      created.push(rel);
    }
  }
  return created;
}

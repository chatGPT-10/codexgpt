import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { assertSafePathInput, displayPath, isSubpath, normalizeRelPath } from "../guard.js";
import { readGuidanceText, type GuidanceReadFailureReason } from "./safeTextReader.js";
import { redactSensitiveText } from "../redact.js";

const FIXED_NAMES = ["AGENTS.override.md", "AGENTS.md"] as const;
const DEFAULT_FALLBACKS = ["agents.md", ".agents.md"] as const;
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export type InstructionTargetKind = "file" | "directory" | "missing";
export type InstructionDiagnosticCode =
  | "INSTRUCTION_NAME_COLLISION"
  | "INSTRUCTION_FILE_TOO_LARGE"
  | "INSTRUCTION_TOTAL_BUDGET_EXCEEDED"
  | "INSTRUCTION_READ_IDENTITY_CHANGED"
  | "INSTRUCTION_HARDLINK_UNSAFE"
  | "INSTRUCTION_NOT_TEXT"
  | "INSTRUCTION_READ_FAILED";

export interface InstructionFile {
  path: string;
  text: string;
  sourceBytes: number;
  returnedBytes: number;
  redacted: boolean;
}

export interface InstructionDiagnostic {
  status: "warning" | "unavailable";
  code: InstructionDiagnosticCode;
  path: string | null;
  count: number;
  action: string;
}

export interface InstructionDiscoveryResult {
  targetPath: string;
  targetKind: InstructionTargetKind;
  files: InstructionFile[];
  diagnostics: InstructionDiagnostic[];
  totalSourceBytes: number;
  complete: boolean;
}

export function validateInstructionFallbacks(values: string[] | undefined): string[] {
  const candidates = values ?? [...DEFAULT_FALLBACKS];
  if (candidates.length > 8) throw new Error("At most eight instruction fallback basenames are allowed.");
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || candidate.trim() !== candidate || candidate === "." || candidate === ".." || candidate.includes("/") || candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate) || candidate.endsWith(".") || candidate.endsWith(" ") || RESERVED.test(candidate)) {
      throw new Error(`Unsafe instruction fallback basename: ${candidate}`);
    }
    assertSafePathInput(candidate, "win32");
    const key = candidate.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new Error(`Duplicate instruction fallback basename: ${candidate}`);
    seen.add(key);
  }
  return [...candidates];
}

function mapReadReason(reason: GuidanceReadFailureReason): InstructionDiagnosticCode {
  if (reason === "READ_TOO_LARGE") return "INSTRUCTION_FILE_TOO_LARGE";
  if (reason === "READ_IDENTITY_CHANGED" || reason === "READ_BOUNDARY_VIOLATION") return "INSTRUCTION_READ_IDENTITY_CHANGED";
  if (reason === "READ_HARDLINK_UNSAFE") return "INSTRUCTION_HARDLINK_UNSAFE";
  if (reason === "READ_NOT_TEXT" || reason === "READ_NOT_REGULAR") return "INSTRUCTION_NOT_TEXT";
  return "INSTRUCTION_READ_FAILED";
}

function diagnostic(code: InstructionDiagnosticCode, filePath: string | null): InstructionDiagnostic {
  const actions: Record<InstructionDiagnosticCode, string> = {
    INSTRUCTION_NAME_COLLISION: "Keep only one case-insensitive match for this instruction filename.",
    INSTRUCTION_FILE_TOO_LARGE: "Reduce the instruction file size or raise the bounded per-file limit.",
    INSTRUCTION_TOTAL_BUDGET_EXCEEDED: "Reduce closer instruction files or raise the bounded combined limit.",
    INSTRUCTION_READ_IDENTITY_CHANGED: "Retry after filesystem changes stop.",
    INSTRUCTION_HARDLINK_UNSAFE: "Replace the hard link with a single-link instruction file.",
    INSTRUCTION_NOT_TEXT: "Replace the instruction candidate with regular UTF-8 text.",
    INSTRUCTION_READ_FAILED: "Fix the instruction file and retry context loading."
  };
  return { status: "warning", code, path: filePath, count: 1, action: actions[code] };
}

async function targetDirectory(root: string, targetPath: string): Promise<{ targetPath: string; targetKind: InstructionTargetKind; directory: string }> {
  if (redactSensitiveText(targetPath || ".") !== (targetPath || ".")) throw new Error("Target path is blocked by safety rules.");
  assertSafePathInput(targetPath || ".");
  const requested = path.resolve(root, targetPath || ".");
  if (!isSubpath(requested, root)) throw new Error("Target path escapes workspace root.");
  try {
    const real = await fsp.realpath(requested);
    if (!isSubpath(real, root)) throw new Error("Target path resolves outside workspace root.");
    const stat = await fsp.stat(real);
    if (stat.isDirectory()) return { targetPath: displayPath(real, root), targetKind: "directory", directory: real };
    if (stat.isFile()) return { targetPath: displayPath(real, root), targetKind: "file", directory: path.dirname(real) };
    throw new Error("Target path is not a regular file or directory.");
  } catch (error) {
    if (error instanceof Error && (error.message.includes("outside") || error.message.includes("not a regular"))) throw error;
    let parent = path.dirname(requested);
    while (!fs.existsSync(parent)) {
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    const realParent = await fsp.realpath(parent);
    const stat = await fsp.stat(realParent);
    const directory = stat.isDirectory() ? realParent : path.dirname(realParent);
    if (!isSubpath(directory, root)) throw new Error("Target parent resolves outside workspace root.");
    return { targetPath: normalizeRelPath(path.relative(root, requested)) || ".", targetKind: "missing", directory };
  }
}

function directoryChain(root: string, targetDir: string): string[] {
  const relative = path.relative(root, targetDir);
  if (!relative) return [root];
  const out = [root];
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    out.push(current);
  }
  return out;
}

export async function discoverInstructions(options: {
  root: string;
  targetPath: string;
  fallbackNames?: string[];
  maxFileBytes: number;
  maxTotalBytes: number;
  blockedGlobs: string[];
}): Promise<InstructionDiscoveryResult> {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const target = await targetDirectory(root, options.targetPath);
  const names = [...FIXED_NAMES, ...validateInstructionFallbacks(options.fallbackNames)];
  const files: InstructionFile[] = [];
  const diagnostics: InstructionDiagnostic[] = [];
  let totalSourceBytes = 0;

  for (const directory of directoryChain(root, target.directory)) {
    const entries: fs.Dirent[] = [];
    let handle: fs.Dir | undefined;
    try {
      handle = await fsp.opendir(directory);
      for await (const entry of handle) {
        if (names.some((name) => process.platform === "win32"
          ? entry.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")
          : entry.name === name)) entries.push(entry);
      }
    } catch { continue; } finally { await handle?.close().catch(() => undefined); }
    for (const name of names) {
      const matches = process.platform === "win32"
        ? entries.filter((entry) => entry.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))
        : entries.filter((entry) => entry.name === name);
      if (matches.length === 0) continue;
      const rel = normalizeRelPath(path.relative(root, path.join(directory, matches[0]!.name)));
      if (matches.length > 1) {
        diagnostics.push(diagnostic("INSTRUCTION_NAME_COLLISION", redactSensitiveText(rel)));
        break;
      }
      const loaded = await readGuidanceText({ root, relativePath: rel, maxBytes: options.maxFileBytes, blockedGlobs: options.blockedGlobs });
      if (!loaded.ok) {
        diagnostics.push(diagnostic(mapReadReason(loaded.reason), redactSensitiveText(loaded.path ?? rel)));
        break;
      }
      if (loaded.text.trim().length === 0) continue;
      if (totalSourceBytes + loaded.sourceBytes > options.maxTotalBytes) {
        diagnostics.push(diagnostic("INSTRUCTION_TOTAL_BUDGET_EXCEEDED", redactSensitiveText(loaded.path)));
        break;
      }
      const safeText = redactSensitiveText(loaded.text);
      files.push({
        path: redactSensitiveText(loaded.path),
        text: safeText,
        sourceBytes: loaded.sourceBytes,
        returnedBytes: Buffer.byteLength(safeText, "utf8"),
        redacted: safeText !== loaded.text
      });
      totalSourceBytes += loaded.sourceBytes;
      break;
    }
  }

  return {
    targetPath: target.targetPath,
    targetKind: target.targetKind,
    files,
    diagnostics,
    totalSourceBytes,
    complete: diagnostics.length === 0
  };
}

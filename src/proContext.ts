import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { minimatch } from "minimatch";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard, normalizeRelPath } from "./guard.js";
import {
  aiBridgeScaffoldWrites,
  listFiles,
  readTextFile,
  repoTree,
  writeTextFile,
  ensureAiBridge,
  prepareWorkspaceTextBatch,
  type PreparedWorkspaceTextBatch
} from "./fsOps.js";
import { gitDiff, gitLog, gitStatus } from "./gitOps.js";
import { readHandoffContext, resolveCodexContextTarget } from "./workspaceOps.js";
import { redactSensitiveText } from "./redact.js";
import { READ_HANDOFF_ARTIFACT_DEFINITIONS } from "./tools/schemas/readHandoff.js";
import {
  EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES,
  exportProContextGlobSchema,
  exportProContextPathSchema,
  type ExportProContextAiUnavailable,
  type ExportProContextSkipped
} from "./tools/schemas/exportProContext.js";

export interface ProContextOptions {
  title?: string;
  selectedPaths?: string[];
  extraGlobs?: string[];
  includeImportantFiles?: boolean;
  includeChangedFiles?: boolean;
  includeDiff?: boolean;
  includeAiBridge?: boolean;
  maxDepth?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxDiffBytes?: number;
  maxTotalBytes?: number;
}

export interface PreparedProContextRequest {
  readonly title: string;
  readonly selectedPaths: readonly string[];
  readonly extraGlobs: readonly string[];
  readonly includeImportantFiles: boolean;
  readonly includeChangedFiles: boolean;
  readonly includeDiff: boolean;
  readonly includeAiBridge: boolean;
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxDiffBytes: number;
  readonly maxTotalBytes: number;
}

export interface PreparedProContextOutput {
  readonly contextDir: string;
  readonly path: string;
}

export interface ProContextBuildResult {
  workspaceId: string;
  root: string;
  title: string;
  selectedPaths: string[];
  extraGlobs: string[];
  includeImportantFiles: boolean;
  includeChangedFiles: boolean;
  includeDiff: boolean;
  includeAiBridge: boolean;
  maxDepth: number;
  maxFiles: number;
  maxFileBytes: number;
  maxDiffBytes: number;
  maxTotalBytes: number;
  changedFileCount: number;
  candidateCount: number;
  omittedCount: number;
  filesIncluded: string[];
  filesSkipped: ExportProContextSkipped[];
  aiContextFiles: string[];
  aiContextUnavailable: ExportProContextAiUnavailable[];
  createdContextFiles: string[];
  sourceMarkdown: string;
  markdown: string;
  sourceBytes: number;
  bytes: number;
  sha256: string;
  diffTruncated: boolean;
  bundleTruncated: boolean;
  truncated: boolean;
  outputLimited: boolean;
  redacted: boolean;
}

export interface ProContextExportResult extends ProContextBuildResult {
  path: string;
  existed: boolean;
}

export interface PreparedProContextMutation {
  result: ProContextExportResult;
  prepared: PreparedWorkspaceTextBatch;
}

export type ProContextResult = ProContextBuildResult | ProContextExportResult;

export type ProContextOperationCode =
  | "REQUEST_INVALID"
  | "SELECTION_PATH_BLOCKED"
  | "SELECTION_PATH_OUTSIDE_WORKSPACE"
  | "OUTPUT_PATH_BLOCKED"
  | "OUTPUT_PATH_OUTSIDE_WORKSPACE"
  | "CONTEXT_BUILD_FAILED"
  | "CONTEXT_WRITE_FAILED";

export type ProContextOperationSource = "title" | "selected_paths" | "extra_globs" | "context_dir";

export class ProContextOperationError extends Error {
  constructor(
    readonly code: ProContextOperationCode,
    readonly source?: ProContextOperationSource
  ) {
    super(code);
    this.name = "ProContextOperationError";
  }
}

const IMPORTANT_ROOT_FILES = [
  "AGENTS.md",
  "README.md",
  "CLAUDE.md",
  "package.json",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.ts",
  "next.config.js",
  "svelte.config.js",
  "astro.config.mjs",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "eslint.config.js",
  ".eslintrc.json",
  "biome.json",
  "turbo.json",
  "deno.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod"
] as const;

function nodeErrorHasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function pathIdentity(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function unique(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRelPath(value).replace(/^\.\//, "");
    if (!normalized) continue;
    const key = pathIdentity(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function normalizeTitle(value: unknown): string {
  if (value !== undefined && typeof value !== "string") {
    throw new ProContextOperationError("REQUEST_INVALID", "title");
  }
  const title = (value as string | undefined)?.trim().replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ") ||
    "CodexPro Context Bundle";
  if (title.length > 200 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new ProContextOperationError("REQUEST_INVALID", "title");
  }
  return title;
}

function classifyExplicitSelectionError(error: unknown): ProContextOperationError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("blocked by safety rules")) {
    return new ProContextOperationError("SELECTION_PATH_BLOCKED", "selected_paths");
  }
  if (
    message.includes("escapes workspace") ||
    message.includes("outside workspace") ||
    message.includes("outside the workspace") ||
    message.includes("through a symlink")
  ) {
    return new ProContextOperationError("SELECTION_PATH_OUTSIDE_WORKSPACE", "selected_paths");
  }
  return new ProContextOperationError("REQUEST_INVALID", "selected_paths");
}

function classifyOutputPathError(error: unknown): ProContextOperationError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("blocked by safety rules")) {
    return new ProContextOperationError("OUTPUT_PATH_BLOCKED", "context_dir");
  }
  if (
    message.includes("escapes workspace") ||
    message.includes("outside workspace") ||
    message.includes("outside the workspace") ||
    message.includes("through a symlink")
  ) {
    return new ProContextOperationError("OUTPUT_PATH_OUTSIDE_WORKSPACE", "context_dir");
  }
  return new ProContextOperationError("OUTPUT_PATH_BLOCKED", "context_dir");
}

export async function prepareProContextRequest(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: ProContextOptions = {}
): Promise<PreparedProContextRequest> {
  const title = normalizeTitle(options.title);

  if (!Array.isArray(options.selectedPaths ?? []) || (options.selectedPaths?.length ?? 0) > 80) {
    throw new ProContextOperationError("REQUEST_INVALID", "selected_paths");
  }
  const selectedPaths: string[] = [];
  const selectedSeen = new Set<string>();
  for (const raw of options.selectedPaths ?? []) {
    if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 240) {
      throw new ProContextOperationError("REQUEST_INVALID", "selected_paths");
    }
    try {
      const target = await resolveCodexContextTarget(guard, workspace, raw.trim());
      if (!exportProContextPathSchema.safeParse(target.targetPath).success) {
        throw new ProContextOperationError("REQUEST_INVALID", "selected_paths");
      }
      const key = pathIdentity(target.targetPath);
      if (!selectedSeen.has(key)) {
        selectedSeen.add(key);
        selectedPaths.push(target.targetPath);
      }
    } catch (error) {
      if (error instanceof ProContextOperationError) throw error;
      throw classifyExplicitSelectionError(error);
    }
  }

  if (!Array.isArray(options.extraGlobs ?? []) || (options.extraGlobs?.length ?? 0) > 32) {
    throw new ProContextOperationError("REQUEST_INVALID", "extra_globs");
  }
  const extraGlobs: string[] = [];
  const globSeen = new Set<string>();
  for (const raw of options.extraGlobs ?? []) {
    if (typeof raw !== "string") throw new ProContextOperationError("REQUEST_INVALID", "extra_globs");
    const normalized = raw.trim().replace(/\\/g, "/");
    if (!exportProContextGlobSchema.safeParse(normalized).success) {
      throw new ProContextOperationError("REQUEST_INVALID", "extra_globs");
    }
    const key = pathIdentity(normalized);
    if (!globSeen.has(key)) {
      globSeen.add(key);
      extraGlobs.push(normalized);
    }
  }

  const maxFileCeiling = Math.min(config.maxReadBytes, 250_000);
  const maxDiffCeiling = config.maxOutputBytes;
  const maxTotalCeiling = Math.min(config.maxWriteBytes, 2_000_000);
  const maxTotalMinimum = Math.min(20_000, maxTotalCeiling);
  const prepared: PreparedProContextRequest = {
    title,
    selectedPaths: Object.freeze(selectedPaths),
    extraGlobs: Object.freeze(extraGlobs),
    includeImportantFiles: options.includeImportantFiles !== false,
    includeChangedFiles: options.includeChangedFiles !== false,
    includeDiff: options.includeDiff !== false,
    includeAiBridge: options.includeAiBridge !== false,
    maxDepth: clamp(options.maxDepth, 3, 1, 6),
    maxFiles: clamp(options.maxFiles, 24, 1, 80),
    maxFileBytes: clamp(options.maxFileBytes, Math.min(maxFileCeiling, 60_000), 1_000, maxFileCeiling),
    maxDiffBytes: clamp(options.maxDiffBytes, Math.min(maxDiffCeiling, 80_000), 1_000, maxDiffCeiling),
    maxTotalBytes: clamp(options.maxTotalBytes, Math.min(maxTotalCeiling, 700_000), maxTotalMinimum, maxTotalCeiling)
  };
  return Object.freeze(prepared);
}

export async function preflightProContextOutput(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: PreparedProContextRequest
): Promise<PreparedProContextOutput> {
  try {
    const context = guard.resolve(workspace, config.contextDir, { forWrite: true });
    if (context.relPath === "." || config.contextDir !== context.relPath || !exportProContextPathSchema.safeParse(context.relPath).success) {
      throw new ProContextOperationError("OUTPUT_PATH_BLOCKED", "context_dir");
    }
    try {
      const stat = await fsp.stat(context.absPath);
      if (!stat.isDirectory()) throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
    } catch (error) {
      if (!nodeErrorHasCode(error, "ENOENT")) throw error;
    }

    const expectedPath = `${context.relPath}/pro-context.md`;
    const output = guard.resolve(workspace, expectedPath, { forWrite: true });
    if (output.relPath !== expectedPath || !exportProContextPathSchema.safeParse(output.relPath).success) {
      throw new ProContextOperationError("OUTPUT_PATH_BLOCKED", "context_dir");
    }
    try {
      const stat = await fsp.stat(output.absPath);
      if (!stat.isFile()) throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
      await guard.assertTextFile(output.absPath, Math.max(config.maxWriteBytes, config.maxReadBytes));
    } catch (error) {
      if (!nodeErrorHasCode(error, "ENOENT")) throw error;
    }

    if (request.includeAiBridge) {
      for (const name of EXPORT_PRO_CONTEXT_SCAFFOLD_NAMES) {
        guard.resolve(workspace, `${context.relPath}/${name}`, { forWrite: true });
      }
    }
    return Object.freeze({ contextDir: context.relPath, path: output.relPath });
  } catch (error) {
    if (error instanceof ProContextOperationError) throw error;
    throw classifyOutputPathError(error);
  }
}

export function capProContextUtf8(
  text: string,
  maxBytes: number,
  marker: string
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (markerBytes > maxBytes) throw new ProContextOperationError("CONTEXT_BUILD_FAILED");
  const budget = maxBytes - markerBytes;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    let end = middle;
    if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    if (Buffer.byteLength(text.slice(0, end), "utf8") <= budget) low = middle;
    else high = middle - 1;
  }
  let end = low;
  if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > budget) {
    end -= 1;
    if (end > 0 && /[\uDC00-\uDFFF]/.test(text[end])) end -= 1;
  }
  return { text: `${text.slice(0, end)}${marker}`, truncated: true };
}

function parseChangedFiles(status: string): string[] {
  const files: string[] = [];
  for (const rawLine of status.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("##") || line.startsWith("git unavailable") || line.startsWith("fatal:")) continue;
    if (line.length < 4) continue;
    let rel = line.slice(3).trim();
    if (!rel) continue;
    if (rel.includes(" -> ")) rel = rel.split(" -> ").pop() ?? rel;
    if (rel.startsWith('"') && rel.endsWith('"')) rel = rel.slice(1, -1);
    files.push(rel);
  }
  return unique(files);
}

function languageForPath(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".css") return "css";
  if (ext === ".html") return "html";
  if (ext === ".py") return "python";
  if (ext === ".rs") return "rust";
  if (ext === ".go") return "go";
  if (ext === ".toml") return "toml";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return "text";
}

function isLikelyImportantConfig(relPath: string): boolean {
  const basename = path.basename(relPath);
  return IMPORTANT_ROOT_FILES.includes(relPath as (typeof IMPORTANT_ROOT_FILES)[number]) ||
    IMPORTANT_ROOT_FILES.includes(basename as (typeof IMPORTANT_ROOT_FILES)[number]);
}

async function existingImportantFiles(guard: PathGuard, workspace: Workspace): Promise<string[]> {
  const found: string[] = [];
  for (const rel of IMPORTANT_ROOT_FILES) {
    try {
      const resolved = guard.resolve(workspace, rel);
      if (fs.existsSync(resolved.absPath) && fs.statSync(resolved.absPath).isFile()) found.push(resolved.relPath);
    } catch {
      // Optional auto-discovered configuration never broadens path authority.
    }
  }
  return unique(found);
}

async function filesForGlobs(
  guard: PathGuard,
  workspace: Workspace,
  globs: readonly string[],
  maxFiles: number
): Promise<string[]> {
  const out: string[] = [];
  for (const glob of globs) {
    const matches = await listFiles(guard, workspace, {
      root: ".",
      glob,
      includeHidden: /(^|\/)\./.test(glob),
      maxFiles: maxFiles + 1
    });
    out.push(...matches);
  }
  return unique(out);
}

function appendSection(parts: string[], heading: string, body: string): void {
  parts.push(`## ${heading}\n\n${body.trimEnd()}`);
}

function publicSkippedPath(value: string): string | null {
  const normalized = normalizeRelPath(value).replace(/^\.\//, "");
  return exportProContextPathSchema.safeParse(normalized).success ? normalized : null;
}

function autoSkip(error: unknown, relPath: string, observedBytes: number | null): ExportProContextSkipped {
  const safePath = publicSkippedPath(relPath);
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (nodeErrorHasCode(error, "ENOENT")) return { path: safePath, reason: "missing", bytes: null };
  if (nodeErrorHasCode(error, "ENOTDIR")) return { path: safePath, reason: "not_file", bytes: null };
  if (
    message.includes("blocked by safety rules") ||
    message.includes("outside workspace") ||
    message.includes("escapes workspace") ||
    message.includes("through a symlink")
  ) return { path: safePath, reason: "blocked", bytes: null };
  if (message.includes("binary file")) return { path: safePath, reason: "not_text", bytes: observedBytes ?? 0 };
  if (message.includes("too large")) return { path: safePath, reason: "too_large", bytes: observedBytes ?? 0 };
  return { path: safePath, reason: "read_failed", bytes: null };
}

function formatAiContext(
  contextDir: string,
  artifacts: Awaited<ReturnType<typeof readHandoffContext>>["artifacts"],
  unavailable: Awaited<ReturnType<typeof readHandoffContext>>["unavailable"]
): string {
  const artifactByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const unavailableByPath = new Map(unavailable.map((item) => [item.path, item]));
  return READ_HANDOFF_ARTIFACT_DEFINITIONS.map((definition) => {
    const relPath = `${contextDir}/${definition.name}`;
    const artifact = artifactByPath.get(relPath);
    if (artifact) return `--- ${relPath} ---\n${artifact.text}`;
    const missing = unavailableByPath.get(relPath);
    return `--- ${relPath} ---\n[unavailable: ${missing?.reason ?? "read_failed"}]`;
  }).join("\n\n");
}

export async function buildPreparedProContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: PreparedProContextRequest,
  createdContextFiles: readonly string[] = [],
  virtualAiBridge: Readonly<Record<string, string>> = {},
  virtualFiles: Readonly<Record<string, string>> = {}
): Promise<ProContextBuildResult> {
  try {
    const status = gitStatus(config, workspace);
    const changedFiles = parseChangedFiles(status);
    const importantFiles = request.includeImportantFiles ? await existingImportantFiles(guard, workspace) : [];
    const changedFileCandidates = request.includeChangedFiles ? changedFiles : [];
    const extraGlobFiles = await filesForGlobs(guard, workspace, request.extraGlobs, request.maxFiles);
    const selectedSet = new Set(request.selectedPaths.map(pathIdentity));
    const importantSet = new Set(importantFiles.map(pathIdentity));
    const outputPath = normalizeRelPath(`${config.contextDir}/pro-context.md`);
    const candidates = unique([
      ...request.selectedPaths,
      ...changedFileCandidates,
      ...importantFiles,
      ...extraGlobFiles
    ]).filter((rel) => pathIdentity(rel) !== pathIdentity(outputPath)).sort((a, b) => {
      const priority = (value: string): number => {
        if (selectedSet.has(pathIdentity(value))) return 0;
        if (importantSet.has(pathIdentity(value)) || isLikelyImportantConfig(value)) return 1;
        return 2;
      };
      const difference = priority(a) - priority(b);
      return difference || a.localeCompare(b);
    });
    const attempted = candidates.slice(0, request.maxFiles);

    const filesIncluded: string[] = [];
    const filesSkipped: ExportProContextSkipped[] = [];
    const fileChunks: string[] = [];
    for (const rel of attempted) {
      const virtualText = virtualFiles[rel];
      if (virtualText !== undefined) {
        const virtualBytes = Buffer.byteLength(virtualText, "utf8");
        if (virtualBytes > request.maxFileBytes) {
          filesSkipped.push({ path: rel, reason: "too_large", bytes: virtualBytes });
          continue;
        }
        filesIncluded.push(rel);
        fileChunks.push([
          `### ${rel}`,
          "",
          `Bytes: ${virtualBytes}`,
          `SHA-256: ${createHash("sha256").update(virtualText).digest("hex")}`,
          `Lines: 1-${virtualText.length === 0 ? 0 : virtualText.split(/\r?\n/).length}`,
          "",
          `\`\`\`${languageForPath(rel)}`,
          virtualText,
          "```"
        ].join("\n"));
        continue;
      }
      let observedBytes: number | null = null;
      try {
        const resolved = guard.resolve(workspace, rel);
        let stat: fs.Stats;
        try {
          stat = await fsp.stat(resolved.absPath);
        } catch (error) {
          if (nodeErrorHasCode(error, "ENOENT")) {
            filesSkipped.push({ path: publicSkippedPath(resolved.relPath), reason: "missing", bytes: null });
            continue;
          }
          throw error;
        }
        if (!stat.isFile()) {
          filesSkipped.push({ path: publicSkippedPath(resolved.relPath), reason: "not_file", bytes: null });
          continue;
        }
        observedBytes = stat.size;
        if (stat.size > request.maxFileBytes) {
          filesSkipped.push({ path: publicSkippedPath(resolved.relPath), reason: "too_large", bytes: stat.size });
          continue;
        }
        const read = await readTextFile(config, guard, workspace, rel, { maxBytes: request.maxFileBytes });
        filesIncluded.push(read.path);
        fileChunks.push([
          `### ${read.path}`,
          "",
          `Bytes: ${read.bytes}`,
          `SHA-256: ${read.sha256}`,
          `Lines: ${read.startLine}-${read.endLine} of ${read.totalLines}`,
          "",
          `\`\`\`${languageForPath(read.path)}`,
          read.text,
          "```"
        ].join("\n"));
      } catch (error) {
        filesSkipped.push(autoSkip(error, rel, observedBytes));
      }
    }

    let aiContextFiles: string[] = [];
    let aiContextUnavailable: ExportProContextAiUnavailable[] = [];
    let aiText = `No ${config.contextDir} handoff context exists yet. Use handoff_to_agent or handoff_to_codex to create it when a plan is ready.`;
    if (request.includeAiBridge) {
      const handoff = await readHandoffContext(config, guard, workspace);
      const artifacts = [...handoff.artifacts];
      const unavailable = [...handoff.unavailable];
      for (const definition of READ_HANDOFF_ARTIFACT_DEFINITIONS) {
        const relPath = `${config.contextDir}/${definition.name}`;
        const text = virtualAiBridge[relPath];
        if (text === undefined || artifacts.some((artifact) => artifact.path === relPath)) continue;
        const bytes = Buffer.byteLength(text, "utf8");
        artifacts.push({
          path: relPath,
          kind: definition.kind,
          bytes,
          lineCount: text.length === 0 ? 0 : text.split(/\r?\n/).length,
          text
        });
        const unavailableIndex = unavailable.findIndex((item) => item.path === relPath);
        if (unavailableIndex >= 0) unavailable.splice(unavailableIndex, 1);
      }
      artifacts.sort((left, right) =>
        READ_HANDOFF_ARTIFACT_DEFINITIONS.findIndex((definition) => `${config.contextDir}/${definition.name}` === left.path) -
        READ_HANDOFF_ARTIFACT_DEFINITIONS.findIndex((definition) => `${config.contextDir}/${definition.name}` === right.path)
      );
      if (handoff.contextExists || artifacts.length > 0) {
        aiContextFiles = artifacts.map((artifact) => artifact.path);
        aiContextUnavailable = unavailable.map((item) => ({
          path: item.path,
          reason: item.reason,
          bytes: item.bytes
        }));
        aiText = formatAiContext(handoff.contextDir, artifacts, unavailable);
      }
    }

    const parts: string[] = [];
    parts.push(`# ${request.title}`);
    parts.push([
      `Generated: ${new Date().toISOString()}`,
      `Workspace: ${workspace.root}`,
      `Workspace ID: ${workspace.id}`,
      `Write mode: ${config.writeMode}`,
      `Bash mode: ${config.bashMode}`,
      `Tool mode: ${config.toolMode}`,
      "",
      "Purpose: paste this bundle into a high-context ChatGPT model when that model cannot call the CodexPro MCP tools directly.",
      "Instruction for ChatGPT: use this as repository context, produce a narrow Codex execution plan, and avoid inventing files or runtime facts not shown here."
    ].join("\n"));

    appendSection(parts, "Repository Tree", (await repoTree(config, guard, workspace, {
      path: ".",
      maxDepth: request.maxDepth,
      includeHidden: false,
      maxEntries: 700
    })).text);
    appendSection(parts, "Git Status", `\`\`\`text\n${status}\n\`\`\``);
    appendSection(parts, "Recent Commits", `\`\`\`text\n${gitLog(config, workspace, 8)}\n\`\`\``);

    let diffTruncated = false;
    if (request.includeDiff) {
      const diff = capProContextUtf8(gitDiff(config, guard, workspace), request.maxDiffBytes, EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER);
      diffTruncated = diff.truncated;
      appendSection(parts, "Git Diff", `\`\`\`diff\n${diff.text}\n\`\`\``);
    }

    if (request.includeAiBridge) appendSection(parts, "Existing AI Bridge Context", aiText);
    appendSection(parts, "Selected Files", [
      `Changed files detected: ${changedFiles.length ? changedFiles.join(", ") : "none"}`,
      `Auto-include important root files: ${request.includeImportantFiles ? "yes" : "no"}`,
      `Auto-include changed files: ${request.includeChangedFiles ? "yes" : "no"}`,
      `Explicit selected paths: ${request.selectedPaths.length ? request.selectedPaths.join(", ") : "none"}`,
      `Extra globs: ${request.extraGlobs.length ? request.extraGlobs.join(", ") : "none"}`,
      `Candidates discovered: ${candidates.length}`,
      `Candidates omitted by max_files: ${Math.max(0, candidates.length - attempted.length)}`,
      `Files attempted below: ${attempted.length ? attempted.join(", ") : "none"}`
    ].join("\n"));
    appendSection(parts, "File Contents", fileChunks.length ? fileChunks.join("\n\n") : "No file contents selected.");
    appendSection(parts, "Skipped Files", filesSkipped.length
      ? filesSkipped.map((file) => `- ${file.path ?? "[hidden unsafe identity]"} [${file.reason}]`).join("\n")
      : "None.");

    const rawSourceMarkdown = `${parts.join("\n\n")}\n`;
    const sourceMarkdown = redactSensitiveText(rawSourceMarkdown);
    const redacted = sourceMarkdown !== rawSourceMarkdown;
    const bounded = capProContextUtf8(
      sourceMarkdown,
      request.maxTotalBytes,
      EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER
    );
    const markdown = bounded.text;
    const sourceBytes = Buffer.byteLength(sourceMarkdown, "utf8");
    const bytes = Buffer.byteLength(markdown, "utf8");
    const omittedCount = Math.max(0, candidates.length - attempted.length);
    const outputLimited =
      diffTruncated ||
      bounded.truncated ||
      omittedCount > 0 ||
      filesSkipped.some((item) => item.reason === "too_large") ||
      aiContextUnavailable.some((item) => item.reason === "too_large" || item.reason === "output_limit");

    return {
      workspaceId: workspace.id,
      root: workspace.root,
      title: redactSensitiveText(request.title),
      selectedPaths: [...request.selectedPaths],
      extraGlobs: [...request.extraGlobs],
      includeImportantFiles: request.includeImportantFiles,
      includeChangedFiles: request.includeChangedFiles,
      includeDiff: request.includeDiff,
      includeAiBridge: request.includeAiBridge,
      maxDepth: request.maxDepth,
      maxFiles: request.maxFiles,
      maxFileBytes: request.maxFileBytes,
      maxDiffBytes: request.maxDiffBytes,
      maxTotalBytes: request.maxTotalBytes,
      changedFileCount: changedFiles.length,
      candidateCount: candidates.length,
      omittedCount,
      filesIncluded,
      filesSkipped,
      aiContextFiles,
      aiContextUnavailable,
      createdContextFiles: [...createdContextFiles],
      sourceMarkdown,
      markdown,
      sourceBytes,
      bytes,
      sha256: createHash("sha256").update(markdown).digest("hex"),
      diffTruncated,
      bundleTruncated: bounded.truncated,
      truncated: diffTruncated || bounded.truncated,
      outputLimited,
      redacted
    };
  } catch (error) {
    if (error instanceof ProContextOperationError) throw error;
    throw new ProContextOperationError("CONTEXT_BUILD_FAILED");
  }
}

export async function exportPreparedProContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: PreparedProContextRequest,
  preparedOutput?: PreparedProContextOutput
): Promise<ProContextExportResult> {
  const output = preparedOutput ?? await preflightProContextOutput(config, guard, workspace, request);
  let createdContextFiles: string[] = [];
  if (request.includeAiBridge) {
    try {
      createdContextFiles = await ensureAiBridge(config, guard, workspace);
    } catch {
      throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
    }
  }

  const built = await buildPreparedProContext(config, guard, workspace, request, createdContextFiles);
  try {
    const write = await writeTextFile(config, guard, workspace, output.path, built.markdown, {
      createDirs: true,
      overwrite: true
    });
    if (write.path !== output.path || write.bytes !== built.bytes || write.sha256 !== built.sha256) {
      throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
    }
    return {
      ...built,
      path: write.path,
      existed: write.existed,
      bytes: write.bytes,
      sha256: write.sha256
    };
  } catch (error) {
    if (error instanceof ProContextOperationError) throw error;
    throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
  }
}

export async function prepareProContextMutation(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  request: PreparedProContextRequest,
  preparedOutput?: PreparedProContextOutput
): Promise<PreparedProContextMutation> {
  const output = preparedOutput ?? await preflightProContextOutput(config, guard, workspace, request);
  try {
    const scaffoldWrites = request.includeAiBridge ? aiBridgeScaffoldWrites(config) : [];
    const virtualAiBridge: Record<string, string> = {};
    for (const write of scaffoldWrites) {
      const resolved = guard.resolve(workspace, write.path, { forWrite: true });
      if (!fs.existsSync(resolved.absPath)) virtualAiBridge[write.path] = write.content;
    }
    const createdContextFiles = Object.keys(virtualAiBridge);
    const built = await buildPreparedProContext(
      config,
      guard,
      workspace,
      request,
      createdContextFiles,
      virtualAiBridge
    );
    const prepared = await prepareWorkspaceTextBatch(config, guard, workspace, [
      ...scaffoldWrites,
      { path: output.path, content: built.markdown, mode: "replace" }
    ]);
    const outputOperation = prepared.operations.find((operation) => operation.path === output.path);
    if (!outputOperation || outputOperation.afterSha256 !== built.sha256) {
      throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
    }
    return {
      result: {
        ...built,
        path: output.path,
        existed: outputOperation.before.exists,
        bytes: outputOperation.operation.bytes.length,
        sha256: outputOperation.afterSha256
      },
      prepared
    };
  } catch (error) {
    if (error instanceof ProContextOperationError) throw error;
    throw new ProContextOperationError("CONTEXT_WRITE_FAILED");
  }
}

export async function buildProContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: ProContextOptions = {}
): Promise<ProContextBuildResult> {
  const request = await prepareProContextRequest(config, guard, workspace, options);
  return buildPreparedProContext(config, guard, workspace, request);
}

export async function exportProContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: ProContextOptions = {}
): Promise<ProContextExportResult> {
  const request = await prepareProContextRequest(config, guard, workspace, options);
  const output = await preflightProContextOutput(config, guard, workspace, request);
  return exportPreparedProContext(config, guard, workspace, request, output);
}

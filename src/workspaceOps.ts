import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { PathGuard } from "./guard.js";
import { readTextFile, repoTree, ensureAiBridge } from "./fsOps.js";
import { gitDiff, gitLog, gitStatus } from "./gitOps.js";
import { discoverSkillInventory } from "./capabilitiesOps.js";
import type { SkillInventoryItem } from "./capabilitiesOps.js";
import {
  READ_HANDOFF_ARTIFACT_DEFINITIONS,
  readHandoffLineCount,
  type ReadHandoffArtifactKind,
  type ReadHandoffUnavailableReason
} from "./tools/schemas/readHandoff.js";
import {
  WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS,
  waitForHandoffLineCount,
  type WaitForHandoffArtifactKind,
  type WaitForHandoffUnavailableReason
} from "./tools/schemas/waitForHandoff.js";
import type { CodexContextUnavailable } from "./tools/schemas/codexContext.js";

export interface WorkspaceSummary {
  text: string;
  workspaceId: string;
  root: string;
  agentsLoaded: boolean;
  agentsPath?: string;
  skills: string[];
  skillInventory: SkillInventoryItem[];
  skillCounts: Record<string, number>;
  tree?: string;
  gitStatus: string;
}

export interface CodexContext {
  text: string;
  workspaceId: string;
  root: string;
  targetPath: string;
  targetKind: CodexContextTargetKind;
  agentsFiles: string[];
  aiContextExists: boolean | null;
  aiContextFiles: string[];
  unavailableSources: CodexContextUnavailable[];
  gitStatus?: string;
  gitDiff?: string;
}

export type CodexContextTargetKind = "file" | "directory" | "missing";

export interface CodexContextTarget {
  targetPath: string;
  targetKind: CodexContextTargetKind;
}

export interface ReadHandoffLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
}

export interface ReadHandoffContextArtifact {
  path: string;
  kind: ReadHandoffArtifactKind;
  bytes: number;
  lineCount: number;
  text: string;
}

export interface ReadHandoffContextUnavailable {
  path: string;
  kind: ReadHandoffArtifactKind;
  reason: ReadHandoffUnavailableReason;
  bytes: number | null;
}

export interface ReadHandoffContextResult {
  contextDir: string;
  contextExists: boolean;
  artifacts: ReadHandoffContextArtifact[];
  unavailable: ReadHandoffContextUnavailable[];
}

export interface WaitForHandoffLimits {
  maxStateBytes: number;
  maxArtifactBytes: number;
  maxTotalBytes: number;
}

export interface HandoffRunStateReadResult {
  stateFile: string;
  present: boolean;
  bytes: number | null;
  text: string | null;
}

export interface WaitForHandoffRawArtifact {
  path: string;
  kind: WaitForHandoffArtifactKind;
  bytes: number;
  lineCount: number;
  text: string;
}

export interface WaitForHandoffRawUnavailable {
  path: string;
  kind: WaitForHandoffArtifactKind;
  reason: WaitForHandoffUnavailableReason;
  bytes: number | null;
}

export interface WaitForHandoffArtifactReadResult {
  contextDir: string;
  requestedKinds: WaitForHandoffArtifactKind[];
  artifacts: WaitForHandoffRawArtifact[];
  unavailable: WaitForHandoffRawUnavailable[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function safeReaddir(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function discoverSkills(workspace: Workspace, options: { includeGlobal?: boolean } = {}): Promise<string[]> {
  const candidateDirs = unique([
    path.join(workspace.root, ".codex", "skills"),
    path.join(workspace.root, "skills"),
    ...(options.includeGlobal
      ? [path.join(os.homedir(), ".codex", "skills"), path.join(os.homedir(), ".chatgpt", "skills")]
      : [])
  ]);
  const skills: string[] = [];
  for (const dir of candidateDirs) {
    const entries = await safeReaddir(dir);
    for (const entry of entries) {
      if (entry.isDirectory()) skills.push(entry.name);
      else if (entry.isFile() && entry.name.endsWith(".md")) skills.push(entry.name.replace(/\.md$/, ""));
    }
  }
  return unique(skills).sort((a, b) => a.localeCompare(b));
}

function skillCounts(skills: Array<{ source?: string }>): Record<string, number> {
  const counts: Record<string, number> = { total: skills.length, workspace: 0, user: 0, plugin: 0, other: 0 };
  for (const skill of skills) {
    const source = skill.source ?? "other";
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}

async function findAgentsFile(workspace: Workspace): Promise<string | undefined> {
  const [first] = await findAgentsFilesInDir(workspace, ".");
  return first;
}

function candidateAgentDirs(targetPath: string): string[] {
  const normalized = targetPath.split(path.sep).join("/").replace(/^\.\//, "");
  const parts = normalized && normalized !== "." ? normalized.split("/").filter(Boolean) : [];
  const dirs = [""];
  const directoryParts = parts.length > 0 && parts.at(-1)?.includes(".") ? parts.slice(0, -1) : parts;
  for (let i = 0; i < directoryParts.length; i += 1) {
    dirs.push(directoryParts.slice(0, i + 1).join("/"));
  }
  return [...new Set(dirs)];
}

async function findAgentsFilesInDir(workspace: Workspace, dir: string): Promise<string[]> {
  const names = ["AGENTS.override.md", "AGENTS.md", "agents.md", ".agents.md"];
  const absDir = path.join(workspace.root, dir);
  const entries = await safeReaddir(absDir);
  const files = entries.filter((entry) => entry.isFile());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const entry =
      files.find((item) => item.name === name) ??
      files.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!entry) continue;
    const rel = dir && dir !== "." ? `${dir}/${entry.name}` : entry.name;
    const real = fs.realpathSync(path.join(workspace.root, rel)).toLowerCase();
    if (seen.has(real)) continue;
    seen.add(real);
    out.push(rel);
  }
  return out;
}

async function readAgentsChain(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  targetPath: string,
  maxBytes: number
): Promise<{ text: string; files: string[] }> {
  const chunks: string[] = [];
  const files: string[] = [];
  const seenRealPaths = new Set<string>();
  const candidates = (
    await Promise.all(candidateAgentDirs(targetPath).map((dir) => findAgentsFilesInDir(workspace, dir || ".")))
  ).flat();
  for (const rel of candidates) {
    try {
      const resolved = guard.resolve(workspace, rel);
      if (!fs.existsSync(resolved.absPath)) continue;
      const real = fs.realpathSync(resolved.absPath).toLowerCase();
      if (seenRealPaths.has(real)) continue;
      seenRealPaths.add(real);
      const agents = await readTextFile(config, guard, workspace, rel, { maxBytes });
      chunks.push(`--- ${rel} ---\n${agents.text}`);
      files.push(rel);
    } catch (error) {
      chunks.push(`--- ${rel} ---\n[unreadable: ${error instanceof Error ? error.message : String(error)}]`);
      files.push(rel);
    }
  }
  return {
    text: chunks.length ? chunks.join("\n\n") : "No AGENTS.md-style instruction files found for this target path.",
    files
  };
}

export async function workspaceSummary(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: { includeTree?: boolean; maxDepth?: number; maxEntries?: number; bootstrapContext?: boolean; includeSkills?: boolean; includeGlobalSkills?: boolean } = {}
): Promise<WorkspaceSummary> {
  if (options.bootstrapContext) {
    await ensureAiBridge(config, guard, workspace);
  }
  const skillInventory = options.includeSkills
    ? await discoverSkillInventory(workspace, { includeGlobal: options.includeGlobalSkills !== false, maxSkills: 120 })
    : [];
  const skills = skillInventory.map((skill) => skill.name);
  const counts = skillCounts(skillInventory);
  const agentsPath = await findAgentsFile(workspace);
  let agentsText = "AGENTS.md: none loaded";
  if (agentsPath) {
    agentsText = `AGENTS.md: ${agentsPath} (read this file before editing or making project decisions).`;
  }

  let treeText: string | undefined;
  if (options.includeTree !== false) {
    const tree = await repoTree(config, guard, workspace, {
      path: ".",
      maxDepth: Math.max(1, Math.min(options.maxDepth ?? 3, 8)),
      includeHidden: false,
      maxEntries: Math.max(1, Math.min(options.maxEntries ?? 500, 3000))
    });
    treeText = tree.text;
  }

  const status = gitStatus(config, workspace);
  const log = gitLog(config, workspace, 5);
  const skillText = options.includeSkills
    ? `Skills: ${counts.total} total (${counts.workspace ?? 0} workspace, ${counts.user ?? 0} user, ${counts.plugin ?? 0} plugin, ${counts.other ?? 0} other).`
    : "Skills: skipped. Pass include_skills=true if skill discovery is needed.";
  const text = `# Workspace\n\nWorkspace: ${workspace.id}\nRoot: ${workspace.root}\nBash mode: ${config.bashMode}\nWrite mode: ${config.writeMode}\nTool mode: ${config.toolMode}\n\n${agentsText}\n${skillText}\n\n## Git status\n\n${status}\n\n## Recent commits\n\n${log}\n${treeText ? `\n## Files\n\n${treeText}` : ""}`;

  return {
    text,
    workspaceId: workspace.id,
    root: workspace.root,
    agentsLoaded: Boolean(agentsPath),
    agentsPath,
    skills,
    skillInventory,
    skillCounts: counts,
    tree: treeText,
    gitStatus: status
  };
}

export function readHandoffLimits(config: CodexProConfig): ReadHandoffLimits {
  const maxTotalBytes = Math.max(1, Math.min(Math.floor(config.maxOutputBytes), 240_000));
  const maxFileBytes = Math.max(
    1,
    Math.min(Math.floor(config.maxReadBytes), 80_000, maxTotalBytes)
  );
  return { maxFileBytes, maxTotalBytes };
}

function codexAgentDirs(targetPath: string, targetKind: CodexContextTargetKind): string[] {
  const normalized = targetPath === "." ? "" : targetPath;
  const targetDirectory = targetKind === "directory"
    ? normalized
    : path.posix.dirname(normalized || ".") === "."
      ? ""
      : path.posix.dirname(normalized);
  const parts = targetDirectory.split("/").filter(Boolean);
  return ["", ...parts.map((_, index) => parts.slice(0, index + 1).join("/"))];
}

function codexRealPathKey(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function codexAgentCandidatesInDir(
  guard: PathGuard,
  workspace: Workspace,
  directory: string
): Promise<string[]> {
  const dirPath = directory || ".";
  const resolved = guard.resolve(workspace, dirPath);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolved.absPath);
  } catch (error) {
    if (nodeErrorHasCode(error, "ENOENT")) return [];
    throw error;
  }
  if (!stat.isDirectory()) return [];

  const entries = await fsp.readdir(resolved.absPath, { withFileTypes: true });
  const names = ["AGENTS.override.md", "AGENTS.md", "agents.md", ".agents.md"];
  const selected = new Set<string>();
  const candidates: string[] = [];
  for (const name of names) {
    const entry = entries.find((item) => item.name === name) ??
      entries.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!entry || selected.has(entry.name)) continue;
    selected.add(entry.name);
    candidates.push(directory ? `${directory}/${entry.name}` : entry.name);
  }
  return candidates;
}

async function readCodexAgentsChain(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  target: CodexContextTarget,
  maxBytes: number
): Promise<{ text: string; files: string[]; unavailable: CodexContextUnavailable[] }> {
  const chunks: string[] = [];
  const files: string[] = [];
  const unavailable: CodexContextUnavailable[] = [];
  const seenRealPaths = new Set<string>();
  const candidateGroups = await Promise.all(
    codexAgentDirs(target.targetPath, target.targetKind).map((directory) =>
      codexAgentCandidatesInDir(guard, workspace, directory)
    )
  );

  for (const relPath of candidateGroups.flat()) {
    const base = { source: "agents" as const, path: relPath };
    let resolved: { absPath: string; relPath: string };
    try {
      resolved = guard.resolve(workspace, relPath);
    } catch {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      chunks.push(`--- ${relPath} ---\n[unavailable: blocked]`);
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(resolved.absPath);
    } catch (error) {
      const reason = nodeErrorHasCode(error, "ENOENT") ? "missing" : "read_failed";
      unavailable.push({ ...base, reason, bytes: null });
      chunks.push(`--- ${relPath} ---\n[unavailable: ${reason}]`);
      continue;
    }

    let realPath: string;
    try {
      realPath = await fsp.realpath(resolved.absPath);
    } catch {
      unavailable.push({ ...base, reason: "read_failed", bytes: stat.size });
      chunks.push(`--- ${relPath} ---\n[unavailable: read_failed]`);
      continue;
    }
    const realKey = codexRealPathKey(realPath);
    if (seenRealPaths.has(realKey)) continue;
    seenRealPaths.add(realKey);

    if (!stat.isFile()) {
      unavailable.push({ ...base, reason: "read_failed", bytes: stat.size });
      chunks.push(`--- ${relPath} ---\n[unavailable: read_failed]`);
      continue;
    }
    if (stat.size > maxBytes) {
      unavailable.push({ ...base, reason: "too_large", bytes: stat.size });
      chunks.push(`--- ${relPath} ---\n[unavailable: too_large]`);
      continue;
    }

    try {
      await guard.assertTextFile(resolved.absPath, maxBytes);
    } catch (error) {
      const bytes = await observedFileSize(resolved.absPath);
      const reason = bytes !== null && bytes > maxBytes
        ? "too_large"
        : error instanceof Error && error.message === "Refusing to read binary file."
          ? "not_text"
          : "read_failed";
      unavailable.push({ ...base, reason, bytes });
      chunks.push(`--- ${relPath} ---\n[unavailable: ${reason}]`);
      continue;
    }

    try {
      const revalidated = guard.resolve(workspace, relPath);
      const revalidatedReal = await fsp.realpath(revalidated.absPath);
      if (codexRealPathKey(revalidatedReal) !== realKey) {
        unavailable.push({ ...base, reason: "blocked", bytes: null });
        chunks.push(`--- ${relPath} ---\n[unavailable: blocked]`);
        continue;
      }
      const agents = await readTextFile(config, guard, workspace, relPath, { maxBytes });
      chunks.push(`--- ${relPath} ---\n${agents.text}`);
      files.push(relPath);
    } catch {
      unavailable.push({
        ...base,
        reason: "read_failed",
        bytes: await observedFileSize(resolved.absPath)
      });
      chunks.push(`--- ${relPath} ---\n[unavailable: read_failed]`);
    }
  }

  return {
    text: chunks.length ? chunks.join("\n\n") : "No AGENTS.md-style instruction files found for this target path.",
    files,
    unavailable
  };
}

export function waitForHandoffLimits(config: CodexProConfig): WaitForHandoffLimits {
  return {
    maxStateBytes: Math.max(1, Math.min(Math.floor(config.maxReadBytes), 64_000)),
    maxArtifactBytes: Math.max(1, Math.min(Math.floor(config.maxReadBytes), 80_000)),
    maxTotalBytes: Math.max(1, Math.min(Math.floor(config.maxOutputBytes), 40_000))
  };
}

function nodeErrorHasCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function observedFileSize(absPath: string): Promise<number | null> {
  try {
    const stat = await fsp.stat(absPath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

export async function readHandoffRunState(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  maxStateBytes = waitForHandoffLimits(config).maxStateBytes
): Promise<HandoffRunStateReadResult> {
  const stateFile = `${config.contextDir}/handoff-run-state.json`;
  const resolved = guard.resolve(workspace, stateFile);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolved.absPath);
  } catch (error) {
    if (nodeErrorHasCode(error, "ENOENT")) {
      return { stateFile, present: false, bytes: null, text: null };
    }
    throw error;
  }
  if (!stat.isFile() || stat.size > maxStateBytes) {
    throw new Error("Handoff run state is not a bounded regular file.");
  }
  await guard.assertTextFile(resolved.absPath, maxStateBytes);
  const revalidated = guard.resolve(workspace, stateFile);
  if (revalidated.absPath !== resolved.absPath) {
    throw new Error("Handoff run state boundary changed during read.");
  }
  const buffer = await fsp.readFile(revalidated.absPath);
  if (buffer.byteLength > maxStateBytes || buffer.includes(0)) {
    throw new Error("Handoff run state is not bounded text.");
  }
  return {
    stateFile,
    present: true,
    bytes: buffer.byteLength,
    text: buffer.toString("utf8")
  };
}

export async function readWaitForHandoffArtifacts(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  requestedKinds: WaitForHandoffArtifactKind[],
  maxArtifactBytes = waitForHandoffLimits(config).maxArtifactBytes
): Promise<WaitForHandoffArtifactReadResult> {
  const requested = WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS
    .filter((definition) => requestedKinds.includes(definition.kind))
    .map((definition) => definition.kind);
  const artifacts: WaitForHandoffRawArtifact[] = [];
  const unavailable: WaitForHandoffRawUnavailable[] = [];

  for (const definition of WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS) {
    if (!requested.includes(definition.kind)) continue;
    const relPath = `${config.contextDir}/${definition.name}`;
    const base = { path: relPath, kind: definition.kind };
    let resolved: { absPath: string; relPath: string };
    try {
      resolved = guard.resolve(workspace, relPath);
    } catch {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(resolved.absPath);
    } catch (error) {
      unavailable.push({
        ...base,
        reason: nodeErrorHasCode(error, "ENOENT") ? "missing" : "read_failed",
        bytes: null
      });
      continue;
    }
    if (!stat.isFile()) {
      unavailable.push({ ...base, reason: "read_failed", bytes: stat.size });
      continue;
    }
    if (stat.size > maxArtifactBytes) {
      unavailable.push({ ...base, reason: "too_large", bytes: stat.size });
      continue;
    }

    try {
      await guard.assertTextFile(resolved.absPath, maxArtifactBytes);
    } catch (error) {
      const latestSize = await observedFileSize(resolved.absPath);
      if (latestSize !== null && latestSize > maxArtifactBytes) {
        unavailable.push({ ...base, reason: "too_large", bytes: latestSize });
      } else if (error instanceof Error && error.message === "Refusing to read binary file.") {
        unavailable.push({ ...base, reason: "not_text", bytes: latestSize });
      } else {
        unavailable.push({ ...base, reason: "read_failed", bytes: latestSize });
      }
      continue;
    }

    let revalidated: { absPath: string; relPath: string };
    try {
      revalidated = guard.resolve(workspace, relPath);
    } catch {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }
    if (revalidated.absPath !== resolved.absPath) {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await fsp.readFile(revalidated.absPath);
    } catch {
      unavailable.push({
        ...base,
        reason: "read_failed",
        bytes: await observedFileSize(resolved.absPath)
      });
      continue;
    }
    if (buffer.byteLength > maxArtifactBytes) {
      unavailable.push({ ...base, reason: "too_large", bytes: buffer.byteLength });
      continue;
    }
    if (buffer.includes(0)) {
      unavailable.push({ ...base, reason: "not_text", bytes: buffer.byteLength });
      continue;
    }
    const text = buffer.toString("utf8");
    artifacts.push({
      ...base,
      bytes: buffer.byteLength,
      lineCount: waitForHandoffLineCount(text),
      text
    });
  }

  return {
    contextDir: config.contextDir,
    requestedKinds: requested,
    artifacts,
    unavailable
  };
}

export async function readHandoffContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  limits: ReadHandoffLimits = readHandoffLimits(config)
): Promise<ReadHandoffContextResult> {
  const bridgeDir = guard.resolve(workspace, config.contextDir);
  let bridgeStat: fs.Stats;
  try {
    bridgeStat = await fsp.stat(bridgeDir.absPath);
  } catch (error) {
    if (nodeErrorHasCode(error, "ENOENT")) {
      return {
        contextDir: config.contextDir,
        contextExists: false,
        artifacts: [],
        unavailable: []
      };
    }
    throw error;
  }
  if (!bridgeStat.isDirectory()) {
    throw new Error("Configured handoff context is not a directory.");
  }

  const artifacts: ReadHandoffContextArtifact[] = [];
  const unavailable: ReadHandoffContextUnavailable[] = [];
  let loadedBytes = 0;

  for (const definition of READ_HANDOFF_ARTIFACT_DEFINITIONS) {
    const relPath = `${config.contextDir}/${definition.name}`;
    const base = { path: relPath, kind: definition.kind };
    let resolved: { absPath: string; relPath: string };
    try {
      resolved = guard.resolve(workspace, relPath);
    } catch {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(resolved.absPath);
    } catch (error) {
      unavailable.push({
        ...base,
        reason: nodeErrorHasCode(error, "ENOENT") ? "missing" : "read_failed",
        bytes: null
      });
      continue;
    }

    if (!stat.isFile()) {
      unavailable.push({ ...base, reason: "read_failed", bytes: stat.size });
      continue;
    }
    if (stat.size > limits.maxFileBytes) {
      unavailable.push({ ...base, reason: "too_large", bytes: stat.size });
      continue;
    }
    if (loadedBytes + stat.size > limits.maxTotalBytes) {
      unavailable.push({ ...base, reason: "output_limit", bytes: stat.size });
      continue;
    }

    try {
      await guard.assertTextFile(resolved.absPath, limits.maxFileBytes);
    } catch (error) {
      const latestSize = await observedFileSize(resolved.absPath);
      if (latestSize !== null && latestSize > limits.maxFileBytes) {
        unavailable.push({ ...base, reason: "too_large", bytes: latestSize });
      } else if (error instanceof Error && error.message === "Refusing to read binary file.") {
        unavailable.push({ ...base, reason: "not_text", bytes: latestSize });
      } else {
        unavailable.push({ ...base, reason: "read_failed", bytes: latestSize });
      }
      continue;
    }

    let revalidated: { absPath: string; relPath: string };
    try {
      revalidated = guard.resolve(workspace, relPath);
    } catch {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }
    if (revalidated.absPath !== resolved.absPath) {
      unavailable.push({ ...base, reason: "blocked", bytes: null });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await fsp.readFile(revalidated.absPath);
    } catch {
      unavailable.push({
        ...base,
        reason: "read_failed",
        bytes: await observedFileSize(resolved.absPath)
      });
      continue;
    }

    if (buffer.byteLength > limits.maxFileBytes) {
      unavailable.push({ ...base, reason: "too_large", bytes: buffer.byteLength });
      continue;
    }
    if (loadedBytes + buffer.byteLength > limits.maxTotalBytes) {
      unavailable.push({ ...base, reason: "output_limit", bytes: buffer.byteLength });
      continue;
    }
    if (buffer.includes(0)) {
      unavailable.push({ ...base, reason: "not_text", bytes: buffer.byteLength });
      continue;
    }

    const text = buffer.toString("utf8");
    artifacts.push({
      ...base,
      bytes: buffer.byteLength,
      lineCount: readHandoffLineCount(text),
      text
    });
    loadedBytes += buffer.byteLength;
  }

  return {
    contextDir: config.contextDir,
    contextExists: true,
    artifacts,
    unavailable
  };
}

export async function readAiBridgeContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: { createIfMissing?: boolean } = {}
): Promise<{ text: string; files: string[] }> {
  if (options.createIfMissing) {
    await ensureAiBridge(config, guard, workspace);
  }

  const result = await readHandoffContext(config, guard, workspace);
  if (!result.contextExists) {
    return {
      text: `No ${config.contextDir} handoff context exists yet. Use handoff_to_agent or handoff_to_codex to create it when a plan is ready.`,
      files: []
    };
  }

  const artifactByPath = new Map(result.artifacts.map((artifact) => [artifact.path, artifact]));
  const unavailableByPath = new Map(result.unavailable.map((item) => [item.path, item]));
  const chunks = READ_HANDOFF_ARTIFACT_DEFINITIONS.map((definition) => {
    const relPath = `${config.contextDir}/${definition.name}`;
    const artifact = artifactByPath.get(relPath);
    if (artifact) return `--- ${relPath} ---\n${artifact.text}`;
    const unavailable = unavailableByPath.get(relPath);
    return `--- ${relPath} ---\n[unavailable: ${unavailable?.reason ?? "read_failed"}]`;
  });
  return {
    text: chunks.join("\n\n"),
    files: result.artifacts.map((artifact) => artifact.path)
  };
}

export async function resolveCodexContextTarget(
  guard: PathGuard,
  workspace: Workspace,
  inputPath = "."
): Promise<CodexContextTarget> {
  const requested = inputPath.trim() || ".";
  let resolved = guard.resolve(workspace, requested);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(resolved.absPath);
  } catch (error) {
    if (!nodeErrorHasCode(error, "ENOENT")) throw error;
    resolved = guard.resolve(workspace, requested, { forWrite: true });
    let existingParent = path.dirname(resolved.absPath);
    let parentStat: fs.Stats;
    while (true) {
      try {
        parentStat = await fsp.stat(existingParent);
        break;
      } catch (parentError) {
        if (!nodeErrorHasCode(parentError, "ENOENT")) throw parentError;
        const next = path.dirname(existingParent);
        if (next === existingParent) throw parentError;
        existingParent = next;
      }
    }
    if (!parentStat.isDirectory()) {
      throw new Error("Codex context target parent is not a directory.");
    }
    const realParent = await fsp.realpath(existingParent);
    const suffix = path.relative(existingParent, resolved.absPath);
    const canonical = guard.resolve(workspace, path.resolve(realParent, suffix), { forWrite: true });
    return { targetPath: canonical.relPath, targetKind: "missing" };
  }

  if (!stat.isFile() && !stat.isDirectory()) {
    throw new Error("Codex context target is not a regular file or directory.");
  }
  const realPath = await fsp.realpath(resolved.absPath);
  const canonical = guard.resolve(workspace, realPath);
  return {
    targetPath: canonical.relPath,
    targetKind: stat.isFile() ? "file" : "directory"
  };
}

export async function readCodexContext(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: {
    targetPath?: string;
    includeAiBridge?: boolean;
    includeGit?: boolean;
    includeDiff?: boolean;
    maxAgentBytes?: number;
    targetKind?: CodexContextTargetKind;
  } = {}
): Promise<CodexContext> {
  const target = options.targetKind
    ? { targetPath: options.targetPath ?? ".", targetKind: options.targetKind }
    : await resolveCodexContextTarget(guard, workspace, options.targetPath);
  const maxAgentBytes = Math.min(options.maxAgentBytes ?? 60_000, config.maxReadBytes);
  const agents = await readCodexAgentsChain(config, guard, workspace, target, maxAgentBytes);
  const handoff = options.includeAiBridge === false
    ? null
    : await readHandoffContext(config, guard, workspace);
  const ai = handoff === null
    ? { text: "Skipped by request.", contextExists: null, files: [], unavailable: [] }
    : !handoff.contextExists
      ? {
          text: `No ${config.contextDir} handoff context exists yet. Use handoff_to_agent or handoff_to_codex to create it when a plan is ready.`,
          contextExists: false,
          files: [],
          unavailable: []
        }
      : (() => {
          const artifactByPath = new Map(handoff.artifacts.map((artifact) => [artifact.path, artifact]));
          const unavailableByPath = new Map(handoff.unavailable.map((item) => [item.path, item]));
          const chunks = READ_HANDOFF_ARTIFACT_DEFINITIONS.map((definition) => {
            const relPath = `${config.contextDir}/${definition.name}`;
            const artifact = artifactByPath.get(relPath);
            if (artifact) return `--- ${relPath} ---\n${artifact.text}`;
            return `--- ${relPath} ---\n[unavailable: ${unavailableByPath.get(relPath)?.reason ?? "read_failed"}]`;
          });
          return {
            text: chunks.join("\n\n"),
            contextExists: true,
            files: handoff.artifacts.map((artifact) => artifact.path),
            unavailable: handoff.unavailable.map((item) => ({
              source: "ai_bridge" as const,
              path: item.path,
              reason: item.reason,
              bytes: item.bytes
            }))
          };
        })();
  const status = options.includeGit === false ? undefined : gitStatus(config, workspace);
  const diff = options.includeDiff ? gitDiff(config, guard, workspace) : undefined;

  const text = [
    "# Codex Context",
    "",
    `Workspace: ${workspace.id}`,
    `Root: ${workspace.root}`,
    `Target path: ${target.targetPath}`,
    `Bash mode: ${config.bashMode}`,
    `Write mode: ${config.writeMode}`,
    `Tool mode: ${config.toolMode}`,
    "",
    "## AGENTS Instructions",
    "",
    agents.text,
    "",
    "## AI Bridge Context",
    "",
    ai.text,
    ...(status !== undefined ? ["", "## Git Status", "", status] : []),
    ...(diff !== undefined ? ["", "## Git Diff", "", diff] : [])
  ].join("\n");

  return {
    text,
    workspaceId: workspace.id,
    root: workspace.root,
    targetPath: target.targetPath,
    targetKind: target.targetKind,
    agentsFiles: agents.files,
    aiContextExists: ai.contextExists,
    aiContextFiles: ai.files,
    unavailableSources: [...agents.unavailable, ...ai.unavailable],
    gitStatus: status,
    gitDiff: diff
  };
}

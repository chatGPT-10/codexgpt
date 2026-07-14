import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import { isSubpath, type Workspace } from "./guard.js";

export interface SkillInventoryItem {
  name: string;
  description?: string;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}

interface SkillInventoryRecord extends SkillInventoryItem {
  absPath: string;
}

export interface LoadedSkill {
  skill: SkillInventoryItem;
  text: string;
  bytes: number;
  totalBytes: number;
  truncated: boolean;
  discoveryTruncated: boolean;
}

export type LoadSkillErrorCode =
  | "SKILL_NOT_FOUND"
  | "SKILL_AMBIGUOUS"
  | "SKILL_RESOLUTION_LIMIT_REACHED"
  | "SKILL_BOUNDARY_VIOLATION"
  | "SKILL_READ_FAILED";

export interface LoadSkillErrorContext {
  selector: {
    name: string;
    source?: SkillInventoryItem["source"];
    path?: string;
  };
  includeGlobal?: boolean;
  maxSkills?: number;
  candidates?: SkillInventoryItem[];
  candidatesTruncated?: boolean;
  discoveryTruncated?: boolean;
  skill?: SkillInventoryItem;
}

export class LoadSkillError extends Error {
  readonly code: LoadSkillErrorCode;
  readonly context: LoadSkillErrorContext;

  constructor(code: LoadSkillErrorCode, context: LoadSkillErrorContext, options?: ErrorOptions) {
    super(code, options);
    this.name = "LoadSkillError";
    this.code = code;
    this.context = context;
  }
}

export interface McpServerInventoryItem {
  name: string;
  source:
    | "user codex config"
    | "workspace config"
    | "workspace cursor config"
    | "user cursor config";
}

const MAX_MCP_SERVER_INVENTORY = 120;

export interface CodexProInventoryResult {
  skills: SkillInventoryItem[];
  skillsTruncated: boolean;
  mcpServers: McpServerInventoryItem[];
  mcpServersTruncated: boolean;
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

async function safeReadText(file: string, maxBytes = 16_000): Promise<string> {
  const stat = await fsp.stat(file);
  const handle = await fsp.open(file, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readTextWithStats(file: string, maxBytes: number): Promise<{ text: string; bytes: number; totalBytes: number; truncated: boolean }> {
  const stat = await fsp.stat(file);
  const handle = await fsp.open(file, "r");
  try {
    const limit = Math.max(1, Math.min(maxBytes, stat.size));
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      bytes: bytesRead,
      totalBytes: stat.size,
      truncated: stat.size > bytesRead
    };
  } finally {
    await handle.close();
  }
}

async function safeReaddir(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function realpathOrUndefined(filePath: string): string | undefined {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return undefined;
  }
}

function externalSkillSelector(absPath: string): string {
  const fingerprint = createHash("sha256").update(absPath).digest("hex").slice(0, 12);
  return `$EXTERNAL/${fingerprint}/SKILL.md`;
}

function sameNativePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function displayPath(
  absPath: string,
  workspaceRoot: string,
  source: SkillInventoryItem["source"]
): string {
  const home = realpathOrUndefined(os.homedir()) ?? path.resolve(os.homedir());
  if (source === "workspace" && isSubpath(absPath, workspaceRoot)) {
    if (absPath === workspaceRoot) return "$WORKSPACE";
    return `$WORKSPACE/${path.relative(workspaceRoot, absPath).split(path.sep).join("/")}`;
  }
  if ((source === "user" || source === "plugin") && isSubpath(absPath, home)) {
    if (absPath === home) return "~";
    return `~/${path.relative(home, absPath).split(path.sep).join("/")}`;
  }
  return externalSkillSelector(absPath);
}

function skillSource(skillPath: string, workspaceRoot: string): SkillInventoryItem["source"] {
  if (isSubpath(skillPath, workspaceRoot)) return "workspace";
  const home = realpathOrUndefined(os.homedir()) ?? path.resolve(os.homedir());
  if (isSubpath(skillPath, home)) {
    const relative = path.relative(home, skillPath);
    if (relative.includes(`${path.sep}.codex${path.sep}plugins${path.sep}`) ||
        relative.startsWith(`.codex${path.sep}plugins${path.sep}`)) {
      return "plugin";
    }
    return "user";
  }
  return "other";
}

function skillSourceRank(source: SkillInventoryItem["source"]): number {
  if (source === "workspace") return 0;
  if (source === "user") return 1;
  if (source === "plugin") return 2;
  return 3;
}

function compareSkills(a: SkillInventoryItem, b: SkillInventoryItem): number {
  const sourceOrder = skillSourceRank(a.source) - skillSourceRank(b.source);
  if (sourceOrder !== 0) return sourceOrder;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return 0;
}

function publicSkill(record: SkillInventoryRecord): SkillInventoryItem {
  return {
    name: record.name,
    description: record.description,
    source: record.source,
    path: record.path
  };
}

function frontmatterValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

async function findSkillFiles(root: string, maxDepth: number, out: string[], maxItems: number): Promise<void> {
  if (out.length >= maxItems || maxDepth < 0) return;
  const entries = (await safeReaddir(root)).sort((left, right) =>
    left.name === right.name ? 0 : left.name < right.name ? -1 : 1
  );
  for (const entry of entries) {
    if (out.length >= maxItems) return;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      out.push(abs);
      continue;
    }
    if (entry.isDirectory()) {
      await findSkillFiles(abs, maxDepth - 1, out, maxItems);
    }
  }
}

function safeSkillName(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  const safeFallback = fallback
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, "-")
    .trim()
    .slice(0, 240) || "unnamed-skill";
  if (!candidate || candidate.length > 240 || /[\r\n\u0000-\u001f\u007f]/.test(candidate)) {
    return safeFallback;
  }
  return candidate;
}

function safeSkillDescription(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 500 || /[\r\n\u0000-\u001f\u007f]/.test(candidate)) {
    return undefined;
  }
  return candidate;
}

async function discoverSkillRecords(
  workspace: Workspace,
  options: { includeGlobal?: boolean; maxSkills?: number } = {}
): Promise<{ records: SkillInventoryRecord[]; truncated: boolean }> {
  const maxSkills = Math.max(1, Math.min(options.maxSkills ?? 120, 500));
  const probeLimit = maxSkills + 1;
  const workspaceRoots = [
    path.join(workspace.root, ".codex", "skills"),
    path.join(workspace.root, ".agents", "skills"),
    path.join(workspace.root, "skills")
  ].flatMap((dir) => {
    const real = realpathOrUndefined(dir);
    return real && isSubpath(real, workspace.root) ? [real] : [];
  });
  const roots = unique([
    ...workspaceRoots,
    ...(options.includeGlobal
      ? [
          path.join(os.homedir(), ".codex", "skills"),
          path.join(os.homedir(), ".agents", "skills"),
          path.join(os.homedir(), ".codex", "plugins", "cache")
        ]
      : [])
  ].filter((dir) => fs.existsSync(dir)), (dir) => {
    const resolved = path.resolve(dir);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  });

  const skillFiles: string[] = [];
  for (const root of roots) {
    await findSkillFiles(root, root.includes(`${path.sep}plugins${path.sep}cache`) ? 9 : 3, skillFiles, probeLimit);
    if (skillFiles.length >= probeLimit) break;
  }

  const items: SkillInventoryRecord[] = [];
  for (const file of skillFiles.slice(0, probeLimit)) {
    const realFile = realpathOrUndefined(file) ?? file;
    if (isSubpath(file, workspace.root) && !isSubpath(realFile, workspace.root)) continue;
    let text = "";
    try {
      text = await safeReadText(realFile);
    } catch {
      // Keep the skill visible even if the file cannot be read.
    }
    const source = skillSource(realFile, workspace.root);
    const fallbackName = path.basename(path.dirname(realFile)) || "unnamed-skill";
    const name = safeSkillName(frontmatterValue(text, "name"), fallbackName);
    const description = safeSkillDescription(frontmatterValue(text, "description"));
    items.push({
      name,
      description,
      source,
      path: displayPath(realFile, workspace.root, source),
      absPath: realFile
    });
  }

  const records = unique(items, (item) => `${item.source}:${item.name}:${item.path}`).sort(compareSkills);
  return {
    records: records.slice(0, maxSkills),
    truncated: records.length > maxSkills
  };
}

export async function discoverSkillInventory(
  workspace: Workspace,
  options: { includeGlobal?: boolean; maxSkills?: number } = {}
): Promise<SkillInventoryItem[]> {
  const result = await discoverSkillRecords(workspace, options);
  return result.records.map(publicSkill);
}

export async function loadSkill(
  workspace: Workspace,
  options: {
    name: string;
    source?: SkillInventoryItem["source"];
    path?: string;
    includeGlobal?: boolean;
    maxSkills?: number;
    maxBytes?: number;
  }
): Promise<LoadedSkill> {
  const name = options.name.trim();
  if (!name) throw new Error("Skill name is required.");
  const requestedPath = options.path?.trim();
  const includeGlobal = options.includeGlobal !== false;
  const maxSkills = Math.max(1, Math.min(options.maxSkills ?? 500, 500));
  const selector = {
    name,
    source: options.source,
    path: requestedPath
  };

  const discovery = await discoverSkillRecords(workspace, {
    includeGlobal,
    maxSkills
  });
  const records = discovery.records;
  const matches = records.filter(
    (skill) =>
      skill.name === name &&
      (!options.source || skill.source === options.source) &&
      (!requestedPath || skill.path === requestedPath)
  );
  if (matches.length > 1) {
    throw new LoadSkillError("SKILL_AMBIGUOUS", {
      selector,
      candidates: matches.slice(0, 8).map(publicSkill),
      candidatesTruncated: matches.length > 8,
      discoveryTruncated: discovery.truncated
    });
  }
  if (!matches.length) {
    throw new LoadSkillError(
      discovery.truncated ? "SKILL_RESOLUTION_LIMIT_REACHED" : "SKILL_NOT_FOUND",
      {
        selector,
        includeGlobal,
        maxSkills,
        discoveryTruncated: discovery.truncated
      }
    );
  }
  if (discovery.truncated && !requestedPath) {
    throw new LoadSkillError("SKILL_RESOLUTION_LIMIT_REACHED", {
      selector,
      includeGlobal,
      maxSkills,
      discoveryTruncated: true
    });
  }

  const [skill] = matches;
  const publicResolvedSkill = publicSkill(skill);
  const realSkillPath = realpathOrUndefined(skill.absPath);
  if (!realSkillPath) {
    throw new LoadSkillError("SKILL_READ_FAILED", {
      selector,
      skill: publicResolvedSkill
    });
  }
  if (
    path.basename(realSkillPath) !== "SKILL.md" ||
    !sameNativePath(realSkillPath, skill.absPath) ||
    (skill.source === "workspace" && !isSubpath(realSkillPath, workspace.root))
  ) {
    throw new LoadSkillError("SKILL_BOUNDARY_VIOLATION", {
      selector,
      skill: publicResolvedSkill
    });
  }
  const maxBytes = Math.max(1_000, Math.min(options.maxBytes ?? 40_000, 100_000));
  let loaded: Awaited<ReturnType<typeof readTextWithStats>>;
  try {
    loaded = await readTextWithStats(realSkillPath, maxBytes);
  } catch (error) {
    throw new LoadSkillError("SKILL_READ_FAILED", {
      selector,
      skill: publicResolvedSkill
    }, { cause: error });
  }
  return {
    skill: publicResolvedSkill,
    text: loaded.text,
    bytes: loaded.bytes,
    totalBytes: loaded.totalBytes,
    truncated: loaded.truncated,
    discoveryTruncated: discovery.truncated
  };
}

function safeMcpServerName(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 240 || /[\r\n\u0000-\u001f\u007f]/.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function parseTomlMcpServers(
  text: string,
  source: McpServerInventoryItem["source"]
): McpServerInventoryItem[] {
  const out: McpServerInventoryItem[] = [];
  const re = /^\s*\[(?:mcp_servers|mcpServers)\.("?)([^"\].]+)\1\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = safeMcpServerName(match[2]);
    if (name) out.push({ name, source });
  }
  return out;
}

function parseJsonMcpServers(
  text: string,
  source: McpServerInventoryItem["source"]
): McpServerInventoryItem[] {
  try {
    const parsed = JSON.parse(text);
    const servers = parsed?.mcpServers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
    return Object.keys(servers).flatMap((value) => {
      const name = safeMcpServerName(value);
      return name ? [{ name, source }] : [];
    });
  } catch {
    return [];
  }
}

async function discoverMcpServerResult(
  workspace: Workspace
): Promise<{ servers: McpServerInventoryItem[]; truncated: boolean }> {
  const candidates: Array<{
    file: string;
    kind: "toml" | "json";
    source: McpServerInventoryItem["source"];
  }> = [
    { file: path.join(os.homedir(), ".codex", "config.toml"), kind: "toml", source: "user codex config" },
    { file: path.join(workspace.root, ".mcp.json"), kind: "json", source: "workspace config" },
    { file: path.join(workspace.root, ".cursor", "mcp.json"), kind: "json", source: "workspace cursor config" },
    { file: path.join(os.homedir(), ".cursor", "mcp.json"), kind: "json", source: "user cursor config" }
  ];

  const servers: McpServerInventoryItem[] = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.file)) continue;
    let text = "";
    try {
      text = await safeReadText(candidate.file, 200_000);
    } catch {
      continue;
    }
    servers.push(...(candidate.kind === "toml" ? parseTomlMcpServers(text, candidate.source) : parseJsonMcpServers(text, candidate.source)));
  }

  const sorted = unique(servers, (server) => `${server.source}:${server.name}`)
    .sort((left, right) => {
      if (left.name !== right.name) return left.name < right.name ? -1 : 1;
      if (left.source !== right.source) return left.source < right.source ? -1 : 1;
      return 0;
    });
  return {
    servers: sorted.slice(0, MAX_MCP_SERVER_INVENTORY),
    truncated: sorted.length > MAX_MCP_SERVER_INVENTORY
  };
}

export async function discoverMcpServers(workspace: Workspace): Promise<McpServerInventoryItem[]> {
  return (await discoverMcpServerResult(workspace)).servers;
}

export async function codexproInventory(
  config: CodexProConfig,
  workspace: Workspace,
  options: { includeGlobalSkills?: boolean; includeMcpServers?: boolean; maxSkills?: number } = {}
): Promise<CodexProInventoryResult> {
  const skillResult = await discoverSkillRecords(workspace, {
    includeGlobal: options.includeGlobalSkills !== false,
    maxSkills: options.maxSkills
  });
  const mcpResult = options.includeMcpServers === false
    ? { servers: [], truncated: false }
    : await discoverMcpServerResult(workspace);

  return {
    skills: skillResult.records.map(publicSkill),
    skillsTruncated: skillResult.truncated,
    mcpServers: mcpResult.servers,
    mcpServersTruncated: mcpResult.truncated
  };
}

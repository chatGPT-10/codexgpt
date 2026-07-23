import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { assertSafePathInput, isSubpath, normalizeRelPath } from "../guard.js";
import { readGuidanceText } from "./safeTextReader.js";
import { parseSkillMetadata } from "./skillMetadata.js";
import { parseOpenAISkillMetadata } from "./openaiSkillMetadata.js";
import type { OpenAISkillMetadata } from "./openaiSkillMetadata.js";
import { redactSensitiveText } from "../redact.js";

export interface StandardSkillRecord {
  name: string;
  description: string;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
  compatibility: string | null;
  loadable: boolean;
  implicitInvocation: boolean;
  requirementsState: "none" | "declared_unverified";
  implicitEligible: boolean;
  specCompliant: boolean;
  legacyParse: boolean;
  metadataRedacted: boolean;
  proximity: number;
  warnings: string[];
  absPath: string;
  root: string;
}

export interface SkillDiscoveryResult {
  skills: StandardSkillRecord[];
  candidateCount: number;
  validCount: number;
  invalidCount: number;
  scanComplete: boolean;
  scanTruncated: boolean;
  returnedTruncated: boolean;
  diagnostics: SkillDiscoveryDiagnostic[];
}

export interface SkillDiscoveryDiagnostic {
  status: "warning" | "unavailable";
  code: "SKILL_METADATA_INVALID" | "SKILL_SCAN_TRUNCATED" | "SKILL_RESULTS_TRUNCATED" | "SKILL_PATH_REDACTED";
  path: string | null;
  count: number;
  action: string;
}

function skillDiagnostic(code: SkillDiscoveryDiagnostic["code"], candidatePath: string | null, count = 1): SkillDiscoveryDiagnostic {
  const actions: Record<SkillDiscoveryDiagnostic["code"], string> = {
    SKILL_METADATA_INVALID: "Fix the Skill frontmatter or remove the invalid candidate.",
    SKILL_SCAN_TRUNCATED: "Reduce Skill candidates or raise the bounded candidate limit.",
    SKILL_RESULTS_TRUNCATED: "Use a narrower target or raise the bounded returned-Skill limit.",
    SKILL_PATH_REDACTED: "Rename the Skill path so it does not resemble a credential."
  };
  return {
    status: "warning",
    code,
    path: candidatePath === null ? null : redactSensitiveText(candidatePath),
    count,
    action: actions[code]
  };
}

async function targetDirectory(root: string, targetPath: string): Promise<string> {
  if (redactSensitiveText(targetPath || ".") !== (targetPath || ".")) throw new Error("Target is blocked by safety rules.");
  assertSafePathInput(targetPath || ".");
  const requested = path.resolve(root, targetPath || ".");
  if (!isSubpath(requested, root)) throw new Error("Target escapes workspace.");
  try {
    const real = await fsp.realpath(requested);
    if (!isSubpath(real, root)) throw new Error("Target resolves outside workspace.");
    const stat = await fsp.stat(real);
    return stat.isDirectory() ? real : path.dirname(real);
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside")) throw error;
    let current = path.dirname(requested);
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const real = await fsp.realpath(current);
    if (!isSubpath(real, root)) throw new Error("Target parent resolves outside workspace.");
    return (await fsp.stat(real)).isDirectory() ? real : path.dirname(real);
  }
}

function ancestors(root: string, targetDir: string): string[] {
  const result: string[] = [];
  let current = targetDir;
  while (isSubpath(current, root)) {
    result.push(current);
    if (current === root) break;
    current = path.dirname(current);
  }
  return result;
}

function selector(root: string, absPath: string): string {
  return `$WORKSPACE/${normalizeRelPath(path.relative(root, absPath))}`;
}

async function boundedDirents(directory: string, limit: number): Promise<{ entries: fs.Dirent[]; truncated: boolean }> {
  const entries: fs.Dirent[] = [];
  let handle: fs.Dir | undefined;
  try {
    handle = await fsp.opendir(directory);
    for await (const entry of handle) {
      if (entries.length >= Math.max(1, limit)) return { entries, truncated: true };
      entries.push(entry);
    }
    return { entries, truncated: false };
  } catch {
    return { entries: [], truncated: false };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readRecord(
  root: string,
  skillFile: string,
  proximity: number,
  blockedGlobs: string[],
  identity?: { source: StandardSkillRecord["source"]; path: string }
): Promise<StandardSkillRecord | null> {
  const loaded = await readGuidanceText({ root, relativePath: path.relative(root, skillFile), maxBytes: 100_000, blockedGlobs });
  if (!loaded.ok) return null;
  const parsed = parseSkillMetadata(loaded.text, { directoryName: path.basename(path.dirname(skillFile)) });
  if (!parsed.ok) return null;
  let companion: OpenAISkillMetadata = { implicitInvocation: true, requirementsState: "none" };
  const companionPath = path.join(path.dirname(skillFile), "agents", "openai.yaml");
  if (fs.existsSync(companionPath)) {
    const companionLoaded = await readGuidanceText({ root, relativePath: path.relative(root, companionPath), maxBytes: 16_384, blockedGlobs });
    if (!companionLoaded.ok) return null;
    const parsedCompanion = parseOpenAISkillMetadata(companionLoaded.text);
    if (!parsedCompanion) return null;
    companion = parsedCompanion;
  }
  return {
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    source: identity?.source ?? "workspace",
    path: identity?.path ?? selector(root, skillFile),
    compatibility: parsed.metadata.compatibility ?? null,
    loadable: true,
    implicitInvocation: companion.implicitInvocation,
    requirementsState: companion.requirementsState,
    implicitEligible: companion.implicitInvocation && companion.requirementsState === "none",
    specCompliant: parsed.specCompliant,
    legacyParse: parsed.legacyParse,
    metadataRedacted: parsed.metadataRedacted,
    proximity,
    warnings: parsed.warnings,
    absPath: skillFile,
    root
  };
}

async function collectSkillFiles(root: string, maxCandidates: number, maxDepth: number): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;
  let inspected = 0;
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth < 0 || truncated) return;
    const remaining = Math.max(1, maxCandidates - inspected);
    const bounded = await boundedDirents(directory, remaining);
    const entries = bounded.entries;
    if (bounded.truncated) truncated = true;
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (inspected >= maxCandidates) { truncated = true; return; }
      inspected += 1;
      const abs = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") files.push(abs);
      else if (entry.isDirectory() || entry.isSymbolicLink()) await walk(abs, depth - 1);
      if (truncated) return;
    }
  }
  await walk(root, maxDepth);
  return { files, truncated };
}

function rootId(root: string): string {
  return `root_${createHash("sha256").update(root).digest("hex").slice(0, 16)}`;
}

const SOURCE_RANK: Record<StandardSkillRecord["source"], number> = {
  workspace: 0,
  user: 1,
  plugin: 2,
  other: 3
};

export async function discoverExplicitGlobalSkills(options: {
  codexDir: string;
  maxCandidates: number;
  maxSkills: number;
  blockedGlobs: string[];
}): Promise<SkillDiscoveryResult> {
  const configuredCodexDir = fs.existsSync(options.codexDir)
    ? fs.realpathSync.native(options.codexDir)
    : path.resolve(options.codexDir);
  const candidates: Array<{ file: string; root: string; source: "user" | "plugin"; publicPath: string }> = [];
  let scanTruncated = false;
  const roots = [
    { root: path.join(configuredCodexDir, "skills"), source: "user" as const, prefix: "$CODEX_DIR/skills", depth: 4 },
    { root: path.join(os.homedir(), ".agents", "skills"), source: "user" as const, prefix: "$USER_SKILLS", depth: 2 },
    { root: path.join(configuredCodexDir, "plugins", "cache"), source: "plugin" as const, prefix: "", depth: 10 }
  ];
  for (const item of roots) {
    if (!fs.existsSync(item.root)) continue;
    const realRoot = fs.realpathSync.native(item.root);
    const remaining = Math.max(1, options.maxCandidates - candidates.length);
    const found = await collectSkillFiles(realRoot, remaining, item.depth);
    for (const file of found.files) {
      const relative = normalizeRelPath(path.relative(realRoot, file));
      candidates.push({
        file,
        root: realRoot,
        source: item.source,
        publicPath: item.source === "plugin"
          ? `$PLUGIN_ROOT/${rootId(realRoot)}/${relative}`
          : `${item.prefix}/${relative}`
      });
    }
    scanTruncated ||= found.truncated;
    if (candidates.length >= options.maxCandidates) { scanTruncated = true; break; }
  }
  const valid: StandardSkillRecord[] = [];
  let invalidCount = 0;
  const diagnostics: SkillDiscoveryDiagnostic[] = [];
  for (const candidate of candidates) {
    if (redactSensitiveText(candidate.publicPath) !== candidate.publicPath) {
      invalidCount += 1;
      diagnostics.push(skillDiagnostic("SKILL_PATH_REDACTED", candidate.publicPath));
      continue;
    }
    const record = await readRecord(candidate.root, candidate.file, 0, options.blockedGlobs, { source: candidate.source, path: candidate.publicPath });
    if (record) valid.push(record); else {
      invalidCount += 1;
      diagnostics.push(skillDiagnostic("SKILL_METADATA_INVALID", candidate.publicPath));
    }
  }
  valid.sort((left, right) => SOURCE_RANK[left.source] - SOURCE_RANK[right.source] || left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  const returnedTruncated = valid.length > options.maxSkills;
  if (scanTruncated) diagnostics.push(skillDiagnostic("SKILL_SCAN_TRUNCATED", null));
  if (returnedTruncated) diagnostics.push(skillDiagnostic("SKILL_RESULTS_TRUNCATED", null, valid.length - options.maxSkills));
  return {
    skills: valid.slice(0, options.maxSkills),
    candidateCount: candidates.length,
    validCount: valid.length,
    invalidCount,
    scanComplete: !scanTruncated,
    scanTruncated,
    returnedTruncated,
    diagnostics
  };
}

export async function resolveExactGlobalSkill(options: {
  codexDir: string;
  selector: string;
  blockedGlobs: string[];
}): Promise<StandardSkillRecord> {
  if (redactSensitiveText(options.selector) !== options.selector) throw new Error("Unsafe global Skill selector.");
  const configuredCodexDir = fs.existsSync(options.codexDir) ? fs.realpathSync.native(options.codexDir) : path.resolve(options.codexDir);
  let root: string;
  let relative: string;
  let source: "user" | "plugin";
  if (options.selector.startsWith("$CODEX_DIR/skills/")) {
    root = fs.realpathSync.native(path.join(configuredCodexDir, "skills"));
    relative = options.selector.slice("$CODEX_DIR/skills/".length);
    source = "user";
  } else if (options.selector.startsWith("$USER_SKILLS/")) {
    root = fs.realpathSync.native(path.join(os.homedir(), ".agents", "skills"));
    relative = options.selector.slice("$USER_SKILLS/".length);
    source = "user";
  } else {
    const pluginRoot = fs.realpathSync.native(path.join(configuredCodexDir, "plugins", "cache"));
    const prefix = `$PLUGIN_ROOT/${rootId(pluginRoot)}/`;
    if (!options.selector.startsWith(prefix)) throw new Error("Unknown configured global Skill root.");
    root = pluginRoot;
    relative = options.selector.slice(prefix.length);
    source = "plugin";
  }
  const normalized = relative.replace(/\\/g, "/");
  if (!normalized || path.posix.normalize(normalized) !== normalized || normalized.startsWith("../") || !normalized.endsWith("/SKILL.md")) throw new Error("Unsafe global Skill selector.");
  const abs = path.resolve(root, ...normalized.split("/"));
  if (!isSubpath(abs, root)) throw new Error("Global Skill boundary violation.");
  const record = await readRecord(root, abs, 0, options.blockedGlobs, { source, path: options.selector });
  if (!record) throw new Error("Global Skill unavailable.");
  return record;
}

export async function discoverTargetSkills(options: {
  root: string;
  targetPath: string;
  maxCandidates: number;
  maxSkills: number;
  blockedGlobs: string[];
}): Promise<SkillDiscoveryResult> {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const targetDir = await targetDirectory(root, options.targetPath);
  const candidates: Array<{ file: string; proximity: number }> = [];
  let scanTruncated = false;
  for (const [proximity, directory] of ancestors(root, targetDir).entries()) {
    const skillsDir = path.join(directory, ".agents", "skills");
    const remaining = Math.max(1, options.maxCandidates - candidates.length);
    const bounded = await boundedDirents(skillsDir, remaining);
    const entries = bounded.entries;
    scanTruncated ||= bounded.truncated;
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (candidates.length >= Math.max(1, options.maxCandidates)) { scanTruncated = true; break; }
      const possible = path.join(skillsDir, entry.name, "SKILL.md");
      candidates.push({ file: possible, proximity });
    }
    if (scanTruncated) break;
  }
  const valid: StandardSkillRecord[] = [];
  let invalidCount = 0;
  const diagnostics: SkillDiscoveryDiagnostic[] = [];
  for (const candidate of candidates) {
    const publicPath = selector(root, candidate.file);
    if (redactSensitiveText(publicPath) !== publicPath) {
      invalidCount += 1;
      diagnostics.push(skillDiagnostic("SKILL_PATH_REDACTED", publicPath));
      continue;
    }
    const record = await readRecord(root, candidate.file, candidate.proximity, options.blockedGlobs);
    if (record) valid.push(record); else {
      invalidCount += 1;
      diagnostics.push(skillDiagnostic("SKILL_METADATA_INVALID", publicPath));
    }
  }
  valid.sort((left, right) => left.proximity - right.proximity || left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  const maxSkills = Math.max(1, options.maxSkills);
  const returnedTruncated = valid.length > maxSkills;
  if (scanTruncated) diagnostics.push(skillDiagnostic("SKILL_SCAN_TRUNCATED", null));
  if (returnedTruncated) diagnostics.push(skillDiagnostic("SKILL_RESULTS_TRUNCATED", null, valid.length - maxSkills));
  return {
    skills: valid.slice(0, maxSkills),
    candidateCount: candidates.length,
    validCount: valid.length,
    invalidCount,
    scanComplete: !scanTruncated,
    scanTruncated,
    returnedTruncated,
    diagnostics
  };
}

export async function resolveExactWorkspaceSkill(options: {
  root: string;
  targetPath: string;
  selector: string;
  blockedGlobs: string[];
}): Promise<StandardSkillRecord> {
  if (redactSensitiveText(options.selector) !== options.selector) throw new Error("Unsafe Skill selector.");
  if (!options.selector.startsWith("$WORKSPACE/")) throw new Error("Standard workspace selector required.");
  const relative = options.selector.slice("$WORKSPACE/".length).replace(/\\/g, "/");
  if (!relative || path.posix.normalize(relative) !== relative || path.posix.isAbsolute(relative) || relative.startsWith("../")) throw new Error("Unsafe Skill selector.");
  const root = fs.realpathSync.native(path.resolve(options.root));
  const targetDir = await targetDirectory(root, options.targetPath);
  const abs = path.resolve(root, relative);
  if (path.basename(abs) !== "SKILL.md" || !isSubpath(abs, root)) throw new Error("Skill selector boundary violation.");
  const scopeRoots = ancestors(root, targetDir).map((directory) => path.join(directory, ".agents", "skills"));
  if (!scopeRoots.some((scopeRoot) => isSubpath(abs, scopeRoot))) throw new Error("Skill is outside the target scope.");
  const proximity = scopeRoots.findIndex((scopeRoot) => isSubpath(abs, scopeRoot));
  const record = await readRecord(root, abs, proximity, options.blockedGlobs);
  if (!record) throw new Error("Skill metadata is unavailable.");
  return record;
}

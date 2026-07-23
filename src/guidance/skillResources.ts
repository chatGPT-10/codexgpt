import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isSubpath, normalizeRelPath, PathGuard } from "../guard.js";
import { readGuidanceText } from "./safeTextReader.js";
import { redactSensitiveText } from "../redact.js";

const RESOURCE_DIRS = ["references", "scripts", "assets"] as const;

export function normalizeSkillResourcePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(?:\.\/)+/, "");
  if (!normalized || normalized.trim() !== normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.includes(":") || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("SKILL_RESOURCE_BOUNDARY_VIOLATION");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.endsWith(".") || segment.endsWith(" "))) {
    throw new Error("SKILL_RESOURCE_BOUNDARY_VIOLATION");
  }
  return segments.join("/");
}

function validatedRoots(rootInput: string, skillRootInput: string): { root: string; skillRoot: string } {
  const root = fs.realpathSync.native(path.resolve(rootInput));
  const skillRoot = fs.realpathSync.native(path.resolve(skillRootInput));
  if (!isSubpath(skillRoot, root)) throw new Error("SKILL_RESOURCE_BOUNDARY_VIOLATION");
  return { root, skillRoot };
}

export async function loadSkillResource(options: {
  root: string;
  skillRoot: string;
  resourcePath: string;
  maxBytes: number;
  blockedGlobs: string[];
}): Promise<{ path: string; text: string; sourceBytes: number; returnedBytes: number }> {
  const { root, skillRoot } = validatedRoots(options.root, options.skillRoot);
  const resourcePath = normalizeSkillResourcePath(options.resourcePath);
  if (redactSensitiveText(resourcePath) !== resourcePath) throw new Error("SKILL_RESOURCE_BLOCKED");
  const abs = path.resolve(skillRoot, ...resourcePath.split("/"));
  if (!isSubpath(abs, skillRoot)) throw new Error("SKILL_RESOURCE_BOUNDARY_VIOLATION");
  const relativeRootPath = normalizeRelPath(path.relative(root, abs));
  const guard = new PathGuard({ blockedGlobs: options.blockedGlobs });
  if (guard.isBlockedRelativePath(relativeRootPath) || guard.isBlockedRelativePath(resourcePath)) {
    throw new Error("SKILL_RESOURCE_BLOCKED");
  }
  const loaded = await readGuidanceText({ root, relativePath: relativeRootPath, maxBytes: options.maxBytes, blockedGlobs: options.blockedGlobs });
  if (!loaded.ok) {
    const code = loaded.reason === "READ_BLOCKED"
      ? "SKILL_RESOURCE_BLOCKED"
      : loaded.reason === "READ_BOUNDARY_VIOLATION" || loaded.reason === "READ_IDENTITY_CHANGED"
        ? "SKILL_RESOURCE_BOUNDARY_VIOLATION"
        : loaded.reason === "READ_NOT_TEXT" || loaded.reason === "READ_NOT_REGULAR"
          ? "SKILL_RESOURCE_NOT_TEXT"
          : loaded.reason === "READ_HARDLINK_UNSAFE"
            ? "SKILL_RESOURCE_HARDLINK_UNSAFE"
            : "SKILL_RESOURCE_READ_FAILED";
    throw new Error(code);
  }
  const currentReal = await fsp.realpath(abs);
  if (!isSubpath(currentReal, skillRoot)) throw new Error("SKILL_RESOURCE_BOUNDARY_VIOLATION");
  return { path: resourcePath, text: loaded.text, sourceBytes: loaded.sourceBytes, returnedBytes: loaded.returnedBytes };
}

export async function indexSkillResources(options: {
  root: string;
  skillRoot: string;
  maxEntries: number;
  blockedGlobs: string[];
}): Promise<{ paths: string[]; truncated: boolean }> {
  const { root, skillRoot } = validatedRoots(options.root, options.skillRoot);
  const guard = new PathGuard({ blockedGlobs: options.blockedGlobs });
  const limit = Math.max(1, Math.floor(options.maxEntries));
  const paths: string[] = [];
  let truncated = false;
  const visitedDirectories = new Set<string>();
  let inspectedDirectories = 0;
  let inspectedEntries = 0;
  const maxDirectories = Math.max(16, limit * 8);
  const maxEntriesInspected = Math.max(32, limit * 16);

  async function walk(directory: string, prefix: string): Promise<void> {
    let canonicalDirectory: string;
    try { canonicalDirectory = await fsp.realpath(directory); } catch { return; }
    const directoryKey = process.platform === "win32" ? canonicalDirectory.toLocaleLowerCase("en-US") : canonicalDirectory;
    if (visitedDirectories.has(directoryKey)) return;
    if (inspectedDirectories >= maxDirectories) { truncated = true; return; }
    visitedDirectories.add(directoryKey);
    inspectedDirectories += 1;
    const entries: fs.Dirent[] = [];
    let handle: fs.Dir | undefined;
    try {
      handle = await fsp.opendir(canonicalDirectory);
      for await (const entry of handle) {
        if (inspectedEntries >= maxEntriesInspected) { truncated = true; break; }
        inspectedEntries += 1;
        entries.push(entry);
      }
    } catch { return; } finally { await handle?.close().catch(() => undefined); }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (paths.length >= limit) { truncated = true; return; }
      const relative = `${prefix}/${entry.name}`;
      if (guard.isBlockedRelativePath(relative)) continue;
      if (redactSensitiveText(relative) !== relative) continue;
      const abs = path.join(canonicalDirectory, entry.name);
      let real: string;
      try { real = await fsp.realpath(abs); } catch { continue; }
      if (!isSubpath(real, skillRoot) || !isSubpath(real, root)) continue;
      const workspaceRelative = normalizeRelPath(path.relative(root, real));
      if (guard.isBlockedRelativePath(workspaceRelative)) continue;
      const stat = await fsp.stat(real).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) await walk(real, relative);
      else if (stat.isFile()) paths.push(relative);
      if (truncated) return;
    }
  }

  for (const name of RESOURCE_DIRS) {
    await walk(path.join(skillRoot, name), name);
    if (truncated) break;
  }
  return { paths, truncated };
}

import fs from "node:fs";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { minimatch } from "minimatch";
import type { CodexProConfig } from "./config.js";
import { expandHome } from "./config.js";

export interface Workspace {
  id: string;
  root: string;
  openedAt: string;
}

export interface PolicyPathFacts {
  absPath: string;
  relPath: string;
  comparisonKey: string;
  targetExists: boolean;
  existingParent: string;
  existingParentIdentity: string;
  unresolvedSuffix: string[];
}

export class CodexProError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexProError";
  }
}

export function isSubpath(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function normalizeRelPath(relPath: string): string {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === "") return ".";
  return normalized;
}

const WINDOWS_RESERVED_BASENAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function assertSafePathInput(inputPath: string, platform: NodeJS.Platform = process.platform): void {
  if (inputPath.includes("\0")) {
    throw new CodexProError("Path contains a null byte.");
  }
  if (platform !== "win32") return;

  const normalized = inputPath.replace(/\//g, "\\");
  if (/^\\\\[?.]\\/.test(normalized)) {
    throw new CodexProError(`Windows device paths are not allowed: ${inputPath}`);
  }
  if (/^\\\\/.test(normalized)) {
    throw new CodexProError(`UNC paths are not allowed: ${inputPath}`);
  }
  if (/^[A-Za-z]:(?!\\)/.test(normalized)) {
    throw new CodexProError(`Drive-relative Windows paths are not allowed: ${inputPath}`);
  }

  const withoutDrive = /^[A-Za-z]:/.test(normalized) ? normalized.slice(2) : normalized;
  if (withoutDrive.includes(":")) {
    throw new CodexProError(`NTFS alternate data stream paths are not allowed: ${inputPath}`);
  }

  for (const segment of withoutDrive.split(/\\+/).filter(Boolean)) {
    if (segment === "." || segment === "..") continue;
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new CodexProError(`Windows path segments may not end with a dot or space: ${inputPath}`);
    }
    const basename = segment.split(".", 1)[0];
    if (WINDOWS_RESERVED_BASENAME.test(basename)) {
      throw new CodexProError(`Windows reserved device name is not allowed: ${inputPath}`);
    }
  }
}

export function displayPath(absPath: string, root: string): string {
  const rel = path.relative(root, absPath) || ".";
  return normalizeRelPath(rel);
}

function workspaceIdForRoot(realRoot: string): string {
  return `ws_${createHash("sha256").update(realRoot).digest("hex").slice(0, 24)}`;
}

function maybeRealpath(existingPath: string): string | undefined {
  try {
    return fs.realpathSync.native(existingPath);
  } catch {
    return undefined;
  }
}

function closestExistingParent(absPath: string): string {
  let current = path.resolve(absPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export class WorkspaceManager {
  private readonly workspaces = new Map<string, Workspace>();

  constructor(private readonly config: CodexProConfig) {}

  defaultWorkspace(): Workspace {
    const existing = [...this.workspaces.values()].find((workspace) => workspace.root === this.config.defaultRoot);
    return existing ?? this.openWorkspace(this.config.defaultRoot);
  }

  openWorkspace(rootInput?: string): Workspace {
    const requested = rootInput?.trim() ? expandHome(rootInput.trim()) : this.config.defaultRoot;
    assertSafePathInput(requested);
    const resolved = path.resolve(requested);
    if (!fs.existsSync(resolved)) {
      throw new CodexProError(`Workspace root does not exist: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new CodexProError(`Workspace root is not a directory: ${resolved}`);
    }
    const realRoot = fs.realpathSync.native(resolved);
    const allowed = this.config.allowedRoots.some((allowedRoot) => isSubpath(realRoot, allowedRoot));
    if (!allowed) {
      throw new CodexProError(
        `Workspace root is outside allowed roots: ${realRoot}\nAllowed roots:\n${this.config.allowedRoots.map((r) => `- ${r}`).join("\n")}`
      );
    }

    const existing = [...this.workspaces.values()].find((workspace) => workspace.root === realRoot);
    if (existing) return existing;

    const id = workspaceIdForRoot(realRoot);
    const workspace = { id, root: realRoot, openedAt: new Date().toISOString() };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  getWorkspace(id?: string): Workspace {
    if (!id) return this.defaultWorkspace();
    const workspace = this.workspaces.get(id);
    if (!workspace) {
      throw new CodexProError(`Unknown workspace_id: ${id}. Call open_workspace first.`);
    }
    return workspace;
  }

  listWorkspaces(): Workspace[] {
    return [...this.workspaces.values()];
  }
}

export class PathGuard {
  constructor(
    private readonly config: CodexProConfig,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  isBlockedRelativePath(relPath: string): boolean {
    const rel = normalizeRelPath(relPath).replace(/^\.\//, "");
    if (!rel || rel === ".") return false;
    return this.config.blockedGlobs.some((glob) =>
      minimatch(rel, glob, { dot: true, nocase: this.platform === "win32", matchBase: false }) ||
      minimatch(path.basename(rel), glob, { dot: true, nocase: this.platform === "win32", matchBase: true })
    );
  }

  assertNotBlocked(relPath: string): void {
    if (this.isBlockedRelativePath(relPath)) {
      throw new CodexProError(`Path is blocked by safety rules: ${relPath}`);
    }
  }

  resolve(workspace: Workspace, inputPath = ".", options: { forWrite?: boolean } = {}): { absPath: string; relPath: string } {
    assertSafePathInput(inputPath || ".", this.platform);
    const expanded = expandHome(inputPath || ".");
    const candidate = path.isAbsolute(expanded) ? expanded : path.join(workspace.root, expanded);
    let absPath = path.resolve(candidate);
    const realTarget = maybeRealpath(absPath);
    let relPath = displayPath(absPath, workspace.root);

    if (!isSubpath(absPath, workspace.root)) {
      if (realTarget && isSubpath(realTarget, workspace.root)) {
        absPath = realTarget;
        relPath = displayPath(realTarget, workspace.root);
      } else if (options.forWrite) {
        const parent = closestExistingParent(path.dirname(absPath));
        const realParent = maybeRealpath(parent);
        if (!realParent || !isSubpath(realParent, workspace.root)) {
          throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
        }
        absPath = path.resolve(realParent, path.relative(parent, absPath));
        relPath = displayPath(absPath, workspace.root);
      } else {
        throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
      }
    }

    this.assertNotBlocked(relPath);

    if (realTarget) {
      if (!isSubpath(realTarget, workspace.root)) {
        throw new CodexProError(`Path resolves outside workspace root through a symlink: ${inputPath}`);
      }
      const realRel = displayPath(realTarget, workspace.root);
      this.assertNotBlocked(realRel);
    }

    if (options.forWrite) {
      try {
        if (fs.lstatSync(absPath).isSymbolicLink()) {
          throw new CodexProError(`Refusing to write through a symlink: ${inputPath}`);
        }
      } catch (error) {
        if (error instanceof CodexProError) throw error;
      }
      const parent = closestExistingParent(path.dirname(absPath));
      const realParent = maybeRealpath(parent);
      if (realParent && !isSubpath(realParent, workspace.root)) {
        throw new CodexProError(`Write path resolves through a parent outside the workspace: ${inputPath}`);
      }
      if (realParent) {
        const realParentRel = displayPath(realParent, workspace.root);
        this.assertNotBlocked(realParentRel);
      }
    }

    return { absPath, relPath };
  }

  resolvePolicyFacts(
    workspace: Workspace,
    inputPath = ".",
    options: { forWrite?: boolean } = {}
  ): PolicyPathFacts {
    const resolved = this.resolve(workspace, inputPath, options);
    const realTarget = maybeRealpath(resolved.absPath);
    const targetAbsPath = realTarget ?? resolved.absPath;
    const targetExists = Boolean(realTarget);
    const existingParentCandidate = targetExists
      ? path.dirname(targetAbsPath)
      : closestExistingParent(path.dirname(resolved.absPath));
    const existingParent = maybeRealpath(existingParentCandidate);
    if (!existingParent || !isSubpath(existingParent, workspace.root)) {
      throw new CodexProError(`Path parent is outside the workspace: ${inputPath}`);
    }
    const parentStat = fs.statSync(existingParent);
    const parentIdentityPayload = `${existingParent}\0${parentStat.dev}\0${parentStat.ino}`;
    const existingParentIdentity = `parent_${createHash("sha256").update(parentIdentityPayload).digest("hex").slice(0, 24)}`;
    const canonicalRelPath = displayPath(targetAbsPath, workspace.root);
    const normalizedRelPath = normalizeRelPath(canonicalRelPath).normalize("NFC");
    const comparisonKey = this.platform === "win32"
      ? normalizedRelPath.toLocaleLowerCase("en-US")
      : normalizedRelPath;
    const unresolvedSuffix = targetExists
      ? []
      : normalizeRelPath(path.relative(existingParent, resolved.absPath))
          .split("/")
          .filter((segment) => segment && segment !== ".");

    for (const segment of unresolvedSuffix) {
      assertSafePathInput(segment, this.platform);
      if (segment === "..") {
        throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
      }
    }

    return {
      absPath: targetAbsPath,
      relPath: normalizedRelPath,
      comparisonKey,
      targetExists,
      existingParent,
      existingParentIdentity,
      unresolvedSuffix
    };
  }

  async assertTextFile(absPath: string, maxBytes: number): Promise<void> {
    const stat = await fsp.stat(absPath);
    if (!stat.isFile()) {
      throw new CodexProError(`Not a file: ${absPath}`);
    }
    if (stat.size > maxBytes) {
      throw new CodexProError(`File is too large (${stat.size} bytes). Limit: ${maxBytes} bytes.`);
    }
    if (stat.size === 0) return;
    const handle = await fsp.open(absPath, "r");
    try {
      const sample = Buffer.alloc(Math.min(64 * 1024, stat.size));
      let offset = 0;
      while (offset < stat.size) {
        const { bytesRead } = await handle.read(sample, 0, sample.length, offset);
        if (bytesRead === 0) break;
        if (sample.subarray(0, bytesRead).includes(0)) {
          throw new CodexProError("Refusing to read binary file.");
        }
        offset += bytesRead;
      }
    } finally {
      await handle.close();
    }
  }
}

export function userHome(): string {
  return os.homedir();
}

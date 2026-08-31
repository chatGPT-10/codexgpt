import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexGPTConfig } from "../config.js";
import { PathGuard, type Workspace } from "../guard.js";
import { DEFAULT_SEMANTIC_BUDGETS } from "./budgets.js";
import { readSemanticSourceSnapshot } from "./sourceSnapshot.js";
import type { SemanticSourceSnapshot } from "./types.js";

const SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json",
  ".py", ".go", ".rs", ".java", ".cs", ".c", ".cc", ".cpp", ".h", ".hpp"
];
const SKIPPED_DIRECTORIES = new Set([
  ".git", ".ai-bridge", "dist", "coverage", ".next", ".cache", "node_modules"
]);
const PACKAGE_DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts", ".json"];

export interface SemanticProject {
  snapshots: readonly SemanticSourceSnapshot[];
  partial: boolean;
  dependencyPartial: boolean;
  sourceOmittedCount: number;
  omittedCount: number;
}

async function readSnapshotBatch(
  root: string,
  relativePaths: readonly string[],
  maxBytes: number,
  blockedGlobs: string[],
  verificationPasses: 1 | 2 = 2,
  concurrency = 32,
  expectedSha256ByPath?: ReadonlyMap<string, string>
) {
  const results = [];
  const preparedBoundary = {
    root: fs.realpathSync.native(path.resolve(root)),
    guard: new PathGuard({ blockedGlobs })
  };
  const batchSize = Math.max(1, Math.min(128, Math.floor(concurrency)));
  for (let offset = 0; offset < relativePaths.length; offset += batchSize) {
    const slice = relativePaths.slice(offset, offset + batchSize);
    results.push(...await Promise.all(slice.map((relativePath) =>
      readSemanticSourceSnapshot({
        root,
        relativePath,
        maxBytes,
        blockedGlobs,
        preparedBoundary,
        verificationPasses,
        expectedRawSha256: expectedSha256ByPath?.get(relativePath)
      })
    )));
  }
  return results;
}

async function enumerateCandidateFiles(
  root: string,
  relativeDirectory: string,
  output: string[],
  maxFiles: number
): Promise<number> {
  if (output.length >= maxFiles) return 1;
  const absolute = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await fsp.readdir(absolute, { withFileTypes: true });
  } catch {
    return 0;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  let omitted = 0;
  for (const entry of entries) {
    if (output.length >= maxFiles) {
      omitted += 1;
      continue;
    }
    const relative = relativeDirectory
      ? `${relativeDirectory.replace(/\\/gu, "/")}/${entry.name}`
      : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      omitted += await enumerateCandidateFiles(root, relative, output, maxFiles);
      continue;
    }
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension))) output.push(relative);
  }
  return omitted;
}

function packageNamesFromText(text: string): string[] {
  const names = new Set<string>();
  const pattern = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"'./][^"']*)["']/gu;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier.startsWith("node:")) {
      names.add("@types/node");
      continue;
    }
    if (specifier.startsWith("@")) {
      const [scope, name] = specifier.split("/");
      if (scope && name) names.add(`${scope}/${name}`);
    } else {
      names.add(specifier.split("/")[0]);
    }
  }
  return [...names];
}

const GENERIC_DEPENDENCY_BLOCKS = new Set([
  "node_modules",
  "node_modules/**",
  "**/node_modules/**"
]);

function packageBlockedGlobs(blockedGlobs: readonly string[]): string[] {
  return blockedGlobs.filter((glob) =>
    !GENERIC_DEPENDENCY_BLOCKS.has(glob.replace(/\\/gu, "/").replace(/^\.\//u, ""))
  );
}

function sameSnapshotBinding(left: SemanticSourceSnapshot, right: SemanticSourceSnapshot): boolean {
  return left.relativePath === right.relativePath &&
    left.canonicalPathKey === right.canonicalPathKey &&
    left.canonicalParentPathKey === right.canonicalParentPathKey &&
    left.parentIdentity === right.parentIdentity &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.stableIdentity.dev === right.stableIdentity.dev &&
    left.stableIdentity.ino === right.stableIdentity.ino &&
    left.stableIdentity.nlink === right.stableIdentity.nlink;
}

function samePathInventory(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function enumeratePackageData(
  root: string,
  packageName: string,
  maxFiles: number
): Promise<{ files: string[]; truncated: boolean }> {
  const base = path.join("node_modules", ...packageName.split("/"));
  const output: string[] = [];
  let truncated = false;
  const visit = async (relativeDirectory: string): Promise<void> => {
    if (output.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(path.join(root, relativeDirectory), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (output.length >= maxFiles) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const relative = `${relativeDirectory.replace(/\\/gu, "/")}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relative);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (PACKAGE_DECLARATION_EXTENSIONS.some((extension) => lower.endsWith(extension))) output.push(relative);
      }
    }
  };
  await visit(base);
  return { files: output, truncated };
}

async function dependencyInventoryForSources(
  root: string,
  sourceSnapshots: readonly SemanticSourceSnapshot[],
  maxFiles: number
): Promise<{ paths: string[]; truncated: boolean }> {
  const packageNames = new Set<string>();
  for (const snapshot of sourceSnapshots) {
    if (!["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(snapshot.language)) continue;
    for (const packageName of packageNamesFromText(snapshot.utf8Text)) packageNames.add(packageName);
  }
  const paths: string[] = [];
  let truncated = false;
  for (const packageName of [...packageNames].sort()) {
    const remaining = maxFiles - sourceSnapshots.length - paths.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const inventory = await enumeratePackageData(root, packageName, remaining);
    paths.push(...inventory.files);
    if (inventory.truncated) truncated = true;
  }
  return { paths, truncated };
}

export async function revalidateSemanticSnapshots(
  config: CodexGPTConfig,
  workspace: Workspace,
  snapshots: readonly SemanticSourceSnapshot[]
): Promise<boolean> {
  const sourceSnapshots = snapshots.filter((snapshot) =>
    !snapshot.relativePath.replace(/\\/gu, "/").startsWith("node_modules/")
  );
  const dependencySnapshots = snapshots.filter((snapshot) =>
    snapshot.relativePath.replace(/\\/gu, "/").startsWith("node_modules/")
  );
  const sourceReads = await readSnapshotBatch(
    workspace.root,
    sourceSnapshots.map((snapshot) => snapshot.relativePath),
    DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
    config.blockedGlobs,
    1,
    128,
    new Map(sourceSnapshots.map((snapshot) => [snapshot.relativePath, snapshot.sha256]))
  );
  const dependencyReads = await readSnapshotBatch(
    workspace.root,
    dependencySnapshots.map((snapshot) => snapshot.relativePath),
    DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
    packageBlockedGlobs(config.blockedGlobs),
    1,
    128,
    new Map(dependencySnapshots.map((snapshot) => [snapshot.relativePath, snapshot.sha256]))
  );
  return sourceSnapshots.every((snapshot, index) => {
    const read = sourceReads[index];
    return read.ok && sameSnapshotBinding(snapshot, read.snapshot);
  }) && dependencySnapshots.every((snapshot, index) => {
    const read = dependencyReads[index];
    return read.ok && sameSnapshotBinding(snapshot, read.snapshot);
  });
}

export async function revalidateSemanticProject(
  config: CodexGPTConfig,
  workspace: Workspace,
  project: SemanticProject,
  options: { requiredPath?: string; includeDependencies?: boolean } = {}
): Promise<SemanticProject | null> {
  const maxFiles = Math.min(config.analysisLimits.maxAnalyzedFiles, DEFAULT_SEMANTIC_BUDGETS.maxWorkspaceFiles);
  const candidates: string[] = [];
  const omitted = await enumerateCandidateFiles(workspace.root, "", candidates, maxFiles);
  if (options.requiredPath && !candidates.includes(options.requiredPath)) candidates.unshift(options.requiredPath);
  if (omitted > 0) return null;

  const sourceSnapshots = project.snapshots.filter((snapshot) =>
    !snapshot.relativePath.replace(/\\/gu, "/").startsWith("node_modules/")
  );
  const dependencySnapshots = project.snapshots.filter((snapshot) =>
    snapshot.relativePath.replace(/\\/gu, "/").startsWith("node_modules/")
  );
  const currentSourcePaths = [...candidates].sort((left, right) => left.localeCompare(right));
  const cachedSourcePaths = sourceSnapshots
    .map((snapshot) => snapshot.relativePath)
    .sort((left, right) => left.localeCompare(right));
  if (!samePathInventory(currentSourcePaths, cachedSourcePaths)) return null;
  if (options.includeDependencies !== false) {
    // A bounded dependency project can be intentionally partial because of
    // file/byte ceilings. Re-resolving the same partial inventory on every
    // semantic call cannot make it complete and makes Node 20 diagnostics
    // repeatedly rebuild an otherwise valid project. Exact projects still
    // require exact dependency inventory parity; partial projects revalidate
    // every cached dependency snapshot below and remain explicitly partial.
    if (!project.dependencyPartial) {
      const dependencyInventory = await dependencyInventoryForSources(workspace.root, sourceSnapshots, maxFiles);
      const currentDependencyPaths = [...dependencyInventory.paths].sort((left, right) => left.localeCompare(right));
      const cachedDependencyPaths = dependencySnapshots
        .map((snapshot) => snapshot.relativePath)
        .sort((left, right) => left.localeCompare(right));
      if (dependencyInventory.truncated || !samePathInventory(currentDependencyPaths, cachedDependencyPaths)) return null;
    }
  }

  const sourceHashes = new Map(sourceSnapshots.map((snapshot) => [snapshot.relativePath, snapshot.sha256]));
  const dependencyHashes = new Map(dependencySnapshots.map((snapshot) => [snapshot.relativePath, snapshot.sha256]));
  const sourceReads = await readSnapshotBatch(
    workspace.root,
    sourceSnapshots.map((snapshot) => snapshot.relativePath),
    DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
    config.blockedGlobs,
    1,
    128,
    sourceHashes
  );
  const dependencyReads = options.includeDependencies === false
    ? []
    : await readSnapshotBatch(
        workspace.root,
        dependencySnapshots.map((snapshot) => snapshot.relativePath),
        DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
        packageBlockedGlobs(config.blockedGlobs),
        1,
        128,
        dependencyHashes
      );
  for (let index = 0; index < sourceSnapshots.length; index += 1) {
    const read = sourceReads[index];
    if (!read.ok || !sameSnapshotBinding(sourceSnapshots[index], read.snapshot)) return null;
  }
  if (options.includeDependencies !== false) {
    for (let index = 0; index < dependencySnapshots.length; index += 1) {
      const read = dependencyReads[index];
      if (!read.ok || !sameSnapshotBinding(dependencySnapshots[index], read.snapshot)) return null;
    }
  }
  return project;
}

export async function resolveSemanticProject(
  config: CodexGPTConfig,
  workspace: Workspace,
  options: { requiredPath?: string } = {}
): Promise<SemanticProject> {
  const maxFiles = Math.min(config.analysisLimits.maxAnalyzedFiles, DEFAULT_SEMANTIC_BUDGETS.maxWorkspaceFiles);
  const candidates: string[] = [];
  let omittedCount = await enumerateCandidateFiles(workspace.root, "", candidates, maxFiles);
  if (options.requiredPath && !candidates.includes(options.requiredPath)) candidates.unshift(options.requiredPath);

  const snapshots = new Map<string, SemanticSourceSnapshot>();
  let totalBytes = 0;
  const sourceReads = await readSnapshotBatch(
    workspace.root,
    candidates,
    DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
    config.blockedGlobs
  );
  for (let index = 0; index < candidates.length; index += 1) {
    const relativePath = candidates[index];
    if (snapshots.size >= maxFiles) {
      omittedCount += 1;
      continue;
    }
    const read = sourceReads[index];
    if (!read.ok) {
      if (relativePath === options.requiredPath) throw new Error(`Semantic source is unavailable: ${read.reason}`);
      omittedCount += 1;
      continue;
    }
    if (totalBytes + read.snapshot.byteLength > DEFAULT_SEMANTIC_BUDGETS.maxWorkspaceBytes) {
      omittedCount += 1;
      continue;
    }
    totalBytes += read.snapshot.byteLength;
    snapshots.set(read.snapshot.relativePath, read.snapshot);
  }

  const packageNames = new Set<string>();
  for (const snapshot of snapshots.values()) {
    if (!["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(snapshot.language)) continue;
    for (const packageName of packageNamesFromText(snapshot.utf8Text)) packageNames.add(packageName);
  }
  const sourceOmittedCount = omittedCount;
  const dependencyBlockedGlobs = packageBlockedGlobs(config.blockedGlobs);
  for (const packageName of [...packageNames].sort()) {
    if (snapshots.size >= maxFiles) break;
    const packageInventory = await enumeratePackageData(workspace.root, packageName, maxFiles - snapshots.size);
    const packageFiles = packageInventory.files;
    if (packageInventory.truncated) omittedCount += 1;
    const packageReads = await readSnapshotBatch(
      workspace.root,
      packageFiles,
      DEFAULT_SEMANTIC_BUDGETS.maxFileBytes,
      dependencyBlockedGlobs
    );
    for (let index = 0; index < packageFiles.length; index += 1) {
      const relativePath = packageFiles[index];
      if (snapshots.size >= maxFiles) break;
      const read = packageReads[index];
      if (!read.ok || totalBytes + read.snapshot.byteLength > DEFAULT_SEMANTIC_BUDGETS.maxWorkspaceBytes) {
        omittedCount += 1;
        continue;
      }
      totalBytes += read.snapshot.byteLength;
      snapshots.set(read.snapshot.relativePath, read.snapshot);
    }
  }

  return Object.freeze({
    snapshots: Object.freeze([...snapshots.values()]),
    partial: sourceOmittedCount > 0,
    dependencyPartial: omittedCount > sourceOmittedCount,
    sourceOmittedCount,
    omittedCount
  });
}

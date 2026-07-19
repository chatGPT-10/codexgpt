import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { GitCommandExecutor, GitRepositoryExecutionIdentity } from "./execution.js";
import type { GitObjectFormat } from "./parsers.js";

interface StablePathIdentity {
  path: string;
  kind: "file" | "directory";
  dev: string;
  ino: string;
  size: string;
  mtimeNs: string;
  nlink: number;
}

export interface GitRepositoryIdentity extends GitRepositoryExecutionIdentity {
  repositoryId: string;
  refStorage: "files" | "reftable";
  capabilityRevision: string;
  stableIdentityFingerprint: string;
  repositoryFingerprint: string;
  executionIsolation: "none";
  repositoryIntegrations: "disabled";
  sparseCheckout: boolean;
  splitIndex: boolean;
  mutableIdentities: Readonly<Record<string, StablePathIdentity | null>>;
  managedTaskWorktree?: true;
}

function gitError(code: string): Error {
  return new Error(code);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function stableIdentity(filePath: string, options: { required?: boolean; mutableFile?: boolean } = {}): Promise<StablePathIdentity | null> {
  let lexical: fs.Stats;
  try {
    lexical = await fsp.lstat(filePath);
  } catch (error) {
    if (!options.required && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  if (lexical.isSymbolicLink()) throw gitError("GIT_REPOSITORY_UNSAFE");
  let handle: fsp.FileHandle | null = null;
  try {
    if (lexical.isFile()) handle = await fsp.open(filePath, "r");
    const stat = handle ? await handle.stat({ bigint: true }) : await fsp.stat(filePath, { bigint: true });
    const realPath = await fsp.realpath(filePath);
    if (!samePath(realPath, path.resolve(filePath))) throw gitError("GIT_REPOSITORY_UNSAFE");
    const kind = stat.isFile() ? "file" : stat.isDirectory() ? "directory" : null;
    if (!kind) throw gitError("GIT_REPOSITORY_UNSAFE");
    if (options.mutableFile && (kind !== "file" || stat.nlink !== 1n)) throw gitError("GIT_REPOSITORY_UNSAFE");
    return Object.freeze({
      path: realPath,
      kind,
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
      size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString(),
      nlink: Number(stat.nlink)
    });
  } finally {
    await handle?.close();
  }
}

function identitiesEqual(left: StablePathIdentity | null, right: StablePathIdentity | null): boolean {
  if (left === null || right === null) return left === right;
  return samePath(left.path, right.path) && left.kind === right.kind && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink;
}

async function readBoundedUtf8File(filePath: string, maxBytes: number): Promise<string> {
  let handle: fsp.FileHandle;
  try {
    handle = await fsp.open(filePath, "r");
  } catch {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(maxBytes)) {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    }
    const content = await handle.readFile();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    }
  } finally {
    await handle.close();
  }
}

function parseLocalConfig(value: string): Map<string, string[]> {
  if (value.includes("\0") || Buffer.byteLength(value, "utf8") > 1_048_576) throw gitError("GIT_REPOSITORY_UNSAFE");
  const result = new Map<string, string[]>();
  let section = "";
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[([A-Za-z0-9.-]+)(?:\s+"(?:[^"\\]|\\.)*")?\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].toLocaleLowerCase("en-US");
      if (section === "include" || section === "includeif") throw gitError("GIT_REPOSITORY_UNSAFE");
      continue;
    }
    const keyMatch = /^([A-Za-z0-9.-]+)\s*(?:=\s*(.*))?$/.exec(line);
    if (!keyMatch || !section) throw gitError("GIT_REPOSITORY_UNSAFE");
    const key = `${section}.${keyMatch[1].toLocaleLowerCase("en-US")}`;
    const values = result.get(key) ?? [];
    values.push((keyMatch[2] ?? "true").trim());
    result.set(key, values);
  }
  return result;
}

async function directoryHasEntries(directory: string): Promise<boolean> {
  try {
    const handle = await fsp.opendir(directory);
    try {
      return await handle.read() !== null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
}

async function hasPromisorPack(gitDir: string): Promise<boolean> {
  let names: string[];
  try {
    names = await fsp.readdir(path.join(gitDir, "objects", "pack"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  return names.some((name) => /^pack-[a-f0-9]+\.promisor$/.test(name));
}

async function packedRefsContainReplacement(gitDir: string): Promise<boolean> {
  const packedRefsPath = path.join(gitDir, "packed-refs");
  let handle: fsp.FileHandle;
  try {
    handle = await fsp.open(packedRefsPath, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576) throw gitError("GIT_REPOSITORY_UNSAFE");
    const content = await handle.readFile({ encoding: "utf8" });
    return content.split(/\r?\n/).some((line) => /^[a-f0-9]+ refs\/replace\//.test(line));
  } finally {
    await handle.close();
  }
}

async function readObjectFormat(executor: GitCommandExecutor, repository: GitRepositoryExecutionIdentity): Promise<GitObjectFormat> {
  const result = await executor.run(repository, ["rev-parse", "--show-object-format"], { stdoutLimitBytes: 128, stderrLimitBytes: 1024, timeoutMs: 30_000 });
  if (result.status !== 0 || result.timedOut || result.stdoutTruncated) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  const value = result.stdout.toString("utf8").trim();
  if (value !== "sha1" && value !== "sha256") throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  return value;
}

async function hasReplacementRefs(
  executor: GitCommandExecutor,
  repository: GitRepositoryExecutionIdentity
): Promise<boolean> {
  const result = await executor.run(repository, [
    "for-each-ref",
    "--count=1",
    "--format=%(refname)",
    "refs/replace"
  ], { stdoutLimitBytes: 256, stderrLimitBytes: 1024, timeoutMs: 30_000 });
  if (result.status !== 0 || result.timedOut || result.stdoutTruncated) throw gitError("GIT_REPOSITORY_UNSAFE");
  return result.stdout.toString("utf8").trim().length > 0;
}

async function recursiveMutableInventory(
  root: string,
  keyPrefix: string,
  maxEntries = 4096
): Promise<Record<string, StablePathIdentity | null>> {
  const output: Record<string, StablePathIdentity | null> = {};
  const queue: Array<{ absolute: string; relative: string }> = [{ absolute: root, relative: "" }];
  let count = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const identity = await stableIdentity(current.absolute, { required: true });
    output[`${keyPrefix}${current.relative || "."}`] = identity;
    let entries;
    try {
      entries = await fsp.readdir(current.absolute, { withFileTypes: true });
    } catch {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
    for (const entry of entries) {
      count += 1;
      if (count > maxEntries) throw gitError("GIT_SCAN_LIMIT");
      const absolute = path.join(current.absolute, entry.name);
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw gitError("GIT_REPOSITORY_UNSAFE");
      if (entry.isDirectory()) {
        queue.push({ absolute, relative });
      } else if (entry.isFile()) {
        output[`${keyPrefix}${relative}`] = await stableIdentity(absolute, { required: true, mutableFile: true });
      } else {
        throw gitError("GIT_REPOSITORY_UNSAFE");
      }
    }
  }
  return output;
}

async function mutableIdentityInventory(
  worktreeRoot: string,
  gitDir: string,
  commonDir: string,
  refStorage: "files" | "reftable",
  gitEntryPath?: string
): Promise<Readonly<Record<string, StablePathIdentity | null>>> {
  const entries = await Promise.all([
    stableIdentity(worktreeRoot, { required: true }),
    stableIdentity(gitDir, { required: true }),
    stableIdentity(path.join(gitDir, "HEAD"), { required: true, mutableFile: true }),
    stableIdentity(path.join(commonDir, "config"), { required: true, mutableFile: true }),
    stableIdentity(path.join(gitDir, "index"), { mutableFile: true }),
    stableIdentity(path.join(commonDir, "packed-refs"), { mutableFile: true }),
    gitEntryPath ? stableIdentity(gitEntryPath, { required: true, mutableFile: true }) : null
  ]);
  const refs = await recursiveMutableInventory(path.join(commonDir, "refs"), "ref:");
  const objectInfo = await recursiveMutableInventory(path.join(commonDir, "objects", "info"), "object-info:");
  const objectPacks = await recursiveMutableInventory(path.join(commonDir, "objects", "pack"), "object-pack:");
  const reftable = refStorage === "reftable"
    ? await recursiveMutableInventory(path.join(commonDir, "reftable"), "reftable:")
    : {};
  return Object.freeze({
    worktreeRoot: entries[0],
    gitDir: entries[1],
    head: entries[2],
    config: entries[3],
    index: entries[4],
    packedRefs: entries[5],
    ...(gitEntryPath ? { gitEntry: entries[6] } : {}),
    ...refs,
    ...objectInfo,
    ...objectPacks,
    ...reftable
  });
}

function stableIdentityFingerprint(input: {
  worktreeRoot: StablePathIdentity;
  gitDir: StablePathIdentity;
  commonDir: string;
  objectFormat: GitObjectFormat;
  refStorage: "files" | "reftable";
  capabilityRevision: string;
}): string {
  const stableObject = (identity: StablePathIdentity) => ({
    path: identity.path,
    kind: identity.kind,
    dev: identity.dev,
    ino: identity.ino
  });
  return sha256(stableJson({
    schemaVersion: 1,
    worktreeRoot: stableObject(input.worktreeRoot),
    gitDir: stableObject(input.gitDir),
    commonDir: input.commonDir,
    objectFormat: input.objectFormat,
    refStorage: input.refStorage,
    capabilityRevision: input.capabilityRevision
  }));
}

function repositoryFingerprint(input: {
  worktreeRoot: string;
  gitDir: string;
  commonDir: string;
  objectFormat: GitObjectFormat;
  refStorage: "files" | "reftable";
  capabilityRevision: string;
  mutableIdentities: Readonly<Record<string, StablePathIdentity | null>>;
}): string {
  return sha256(stableJson({
    schemaVersion: 1,
    worktreeRoot: input.worktreeRoot,
    gitDir: input.gitDir,
    commonDir: input.commonDir,
    objectFormat: input.objectFormat,
    refStorage: input.refStorage,
    capabilityRevision: input.capabilityRevision,
    mutableIdentities: input.mutableIdentities
  }));
}

export class RepositoryIdentityRegistry {
  readonly #contextFingerprint: string;
  readonly #repositoriesByRoot = new Map<string, { repositoryId: string; stableIdentityFingerprint: string }>();
  readonly #branchesByRepository = new Map<string, Map<string, string>>();
  readonly #refsByBranchId = new Map<string, { repositoryId: string; ref: string }>();
  #disposed = false;

  constructor(options: { contextFingerprint: string }) {
    if (!options.contextFingerprint || options.contextFingerprint.length > 512) throw gitError("GIT_REPOSITORY_UNSAFE");
    this.#contextFingerprint = options.contextFingerprint;
  }

  repositoryId(canonicalRoot: string, stableIdentityFingerprint: string): string {
    this.#assertOpen();
    if (!/^[a-f0-9]{64}$/.test(stableIdentityFingerprint)) throw gitError("GIT_REPOSITORY_UNSAFE");
    const key = process.platform === "win32" ? canonicalRoot.toLocaleLowerCase("en-US") : canonicalRoot;
    const existing = this.#repositoriesByRoot.get(key);
    if (existing?.stableIdentityFingerprint === stableIdentityFingerprint) return existing.repositoryId;
    if (existing) {
      this.#branchesByRepository.delete(existing.repositoryId);
      for (const [branchId, record] of this.#refsByBranchId) {
        if (record.repositoryId === existing.repositoryId) this.#refsByBranchId.delete(branchId);
      }
    }
    const repositoryId = `repo_${randomBytes(16).toString("hex")}`;
    this.#repositoriesByRoot.set(key, { repositoryId, stableIdentityFingerprint });
    return repositoryId;
  }

  branchId(repositoryId: string, ref: string): string {
    this.#assertOpen();
    if (!/^repo_[a-f0-9]{32}$/.test(repositoryId) || !ref.startsWith("refs/heads/")) throw gitError("GIT_REPOSITORY_UNSAFE");
    const branches = this.#branchesByRepository.get(repositoryId) ?? new Map<string, string>();
    if (!this.#branchesByRepository.has(repositoryId)) this.#branchesByRepository.set(repositoryId, branches);
    const key = process.platform === "win32" ? ref.toLocaleLowerCase("en-US") : ref;
    const existing = branches.get(key);
    if (existing) return existing;
    const created = `branch_${randomBytes(16).toString("hex")}`;
    branches.set(key, created);
    this.#refsByBranchId.set(created, { repositoryId, ref });
    return created;
  }

  resolveBranch(repositoryId: string, branchId: string): string {
    this.#assertOpen();
    const record = this.#refsByBranchId.get(branchId);
    if (!record || record.repositoryId !== repositoryId) throw gitError("GIT_REF_CHANGED");
    return record.ref;
  }

  contextFingerprint(): string {
    this.#assertOpen();
    return this.#contextFingerprint;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#repositoriesByRoot.clear();
    this.#branchesByRepository.clear();
    this.#refsByBranchId.clear();
  }

  #assertOpen(): void {
    if (this.#disposed) throw gitError("GIT_REPOSITORY_UNSAFE");
  }
}

export async function admitGitRepository(input: {
  workspaceRoot: string;
  executor: GitCommandExecutor;
  registry: RepositoryIdentityRegistry;
}): Promise<GitRepositoryIdentity> {
  let worktreeRoot: string;
  try {
    worktreeRoot = await fsp.realpath(path.resolve(input.workspaceRoot));
  } catch {
    throw gitError("GIT_NOT_REPOSITORY");
  }
  const rootIdentity = await stableIdentity(worktreeRoot, { required: true });
  if (rootIdentity?.kind !== "directory") throw gitError("GIT_NOT_REPOSITORY");
  const gitEntry = path.join(worktreeRoot, ".git");
  const gitEntryIdentity = await stableIdentity(gitEntry, { required: true }).catch(() => {
    throw gitError("GIT_NOT_REPOSITORY");
  });
  if (gitEntryIdentity?.kind !== "directory") throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const gitDir = gitEntryIdentity.path;
  if (!isInside(gitDir, worktreeRoot)) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const commonDir = gitDir;

  const configPath = path.join(gitDir, "config");
  const configText = await readBoundedUtf8File(configPath, 1_048_576);
  const config = parseLocalConfig(configText);
  if (config.has("core.worktree")) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  if (config.has("extensions.worktreeconfig")) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  if (config.has("extensions.partialclone")) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  if ([...config.entries()].some(([key, values]) => key.endsWith(".promisor") && values.some((value) => value.toLocaleLowerCase("en-US") === "true"))) {
    throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  }
  const configuredRefStorage = config.get("extensions.refstorage")?.at(-1)?.toLocaleLowerCase("en-US");
  const refStorage: "files" | "reftable" = configuredRefStorage === undefined || configuredRefStorage === "files"
    ? "files"
    : configuredRefStorage === "reftable"
      ? "reftable"
      : (() => { throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT"); })();
  if (await directoryHasEntries(path.join(gitDir, "refs", "replace"))) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (refStorage === "files" && await packedRefsContainReplacement(gitDir)) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (await hasPromisorPack(gitDir)) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  if (await stableIdentity(path.join(gitDir, "objects", "info", "alternates"))) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (await stableIdentity(path.join(gitDir, "objects", "info", "http-alternates"))) throw gitError("GIT_REPOSITORY_UNSAFE");

  const provisional: GitRepositoryExecutionIdentity = { worktreeRoot, gitDir, commonDir, objectFormat: "sha1" };
  const objectFormat = await readObjectFormat(input.executor, provisional);
  if (await hasReplacementRefs(input.executor, { ...provisional, objectFormat })) throw gitError("GIT_REPOSITORY_UNSAFE");
  const sparseCheckout = config.get("core.sparsecheckout")?.at(-1)?.toLocaleLowerCase("en-US") === "true" ||
    Boolean(await stableIdentity(path.join(gitDir, "info", "sparse-checkout")));
  const sharedIndexEntries = (await fsp.readdir(gitDir).catch(() => [] as string[])).filter((name) => /^sharedindex\.[a-f0-9]+$/.test(name));
  const splitIndex = sharedIndexEntries.length > 0;
  const mutableIdentities = await mutableIdentityInventory(worktreeRoot, gitDir, commonDir, refStorage);
  const stableFingerprint = stableIdentityFingerprint({
    worktreeRoot: rootIdentity,
    gitDir: gitEntryIdentity,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision
  });
  const fingerprint = repositoryFingerprint({
    worktreeRoot,
    gitDir,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision,
    mutableIdentities
  });
  return Object.freeze({
    repositoryId: input.registry.repositoryId(worktreeRoot, stableFingerprint),
    worktreeRoot,
    gitDir,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision,
    stableIdentityFingerprint: stableFingerprint,
    repositoryFingerprint: fingerprint,
    executionIsolation: "none",
    repositoryIntegrations: "disabled",
    sparseCheckout,
    splitIndex,
    mutableIdentities
  });
}

export async function admitManagedTaskGitRepository(input: {
  workspaceRoot: string;
  expectedAdminDir: string;
  expectedRepositoryId: string;
  executor: GitCommandExecutor;
}): Promise<GitRepositoryIdentity> {
  let worktreeRoot: string;
  try {
    worktreeRoot = await fsp.realpath(path.resolve(input.workspaceRoot));
  } catch {
    throw gitError("GIT_NOT_REPOSITORY");
  }
  const rootIdentity = await stableIdentity(worktreeRoot, { required: true });
  if (rootIdentity?.kind !== "directory") throw gitError("GIT_NOT_REPOSITORY");
  const gitEntry = path.join(worktreeRoot, ".git");
  const gitEntryIdentity = await stableIdentity(gitEntry, { required: true }).catch(() => {
    throw gitError("GIT_NOT_REPOSITORY");
  });
  if (gitEntryIdentity?.kind !== "file") throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const marker = await readBoundedUtf8File(gitEntry, 4096);
  const markerMatch = /^gitdir: (.+)\r?\n?$/u.exec(marker);
  if (!markerMatch || markerMatch[1].includes("\0")) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const gitDir = await fsp.realpath(path.resolve(worktreeRoot, markerMatch[1])).catch(() => {
    throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  });
  const expectedAdminDir = await fsp.realpath(path.resolve(input.expectedAdminDir)).catch(() => {
    throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  });
  if (!samePath(gitDir, expectedAdminDir)) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const gitDirIdentity = await stableIdentity(gitDir, { required: true });
  if (gitDirIdentity?.kind !== "directory") throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const commonMarker = await readBoundedUtf8File(path.join(gitDir, "commondir"), 4096);
  if (!commonMarker.trim() || commonMarker.includes("\0")) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  const commonDir = await fsp.realpath(path.resolve(gitDir, commonMarker.trim())).catch(() => {
    throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  });
  const worktreesRoot = path.join(commonDir, "worktrees");
  if (!isInside(gitDir, worktreesRoot) || samePath(gitDir, worktreesRoot)) {
    throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  }

  const configPath = path.join(commonDir, "config");
  const configText = await readBoundedUtf8File(configPath, 1_048_576);
  const config = parseLocalConfig(configText);
  if (config.has("core.worktree")) throw gitError("GIT_METADATA_OUTSIDE_AUTHORITY");
  if (config.has("extensions.partialclone")) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  if ([...config.entries()].some(([key, values]) => key.endsWith(".promisor") && values.some((value) => value.toLocaleLowerCase("en-US") === "true"))) {
    throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  }
  const configuredRefStorage = config.get("extensions.refstorage")?.at(-1)?.toLocaleLowerCase("en-US");
  const refStorage: "files" | "reftable" = configuredRefStorage === undefined || configuredRefStorage === "files"
    ? "files"
    : configuredRefStorage === "reftable"
      ? "reftable"
      : (() => { throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT"); })();
  if (await directoryHasEntries(path.join(commonDir, "refs", "replace"))) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (refStorage === "files" && await packedRefsContainReplacement(commonDir)) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (await hasPromisorPack(commonDir)) throw gitError("GIT_UNSUPPORTED_REPOSITORY_FORMAT");
  if (await stableIdentity(path.join(commonDir, "objects", "info", "alternates"))) throw gitError("GIT_REPOSITORY_UNSAFE");
  if (await stableIdentity(path.join(commonDir, "objects", "info", "http-alternates"))) throw gitError("GIT_REPOSITORY_UNSAFE");

  const provisional: GitRepositoryExecutionIdentity = { worktreeRoot, gitDir, commonDir, objectFormat: "sha1" };
  const objectFormat = await readObjectFormat(input.executor, provisional);
  if (await hasReplacementRefs(input.executor, { ...provisional, objectFormat })) throw gitError("GIT_REPOSITORY_UNSAFE");
  const sparseCheckout = config.get("core.sparsecheckout")?.at(-1)?.toLocaleLowerCase("en-US") === "true" ||
    Boolean(await stableIdentity(path.join(gitDir, "info", "sparse-checkout")));
  const sharedIndexEntries = (await fsp.readdir(gitDir).catch(() => [] as string[])).filter((name) => /^sharedindex\.[a-f0-9]+$/u.test(name));
  const splitIndex = sharedIndexEntries.length > 0;
  const mutableIdentities = await mutableIdentityInventory(worktreeRoot, gitDir, commonDir, refStorage, gitEntry);
  const stableFingerprint = stableIdentityFingerprint({
    worktreeRoot: rootIdentity,
    gitDir: gitDirIdentity,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision
  });
  const fingerprint = repositoryFingerprint({
    worktreeRoot,
    gitDir,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision,
    mutableIdentities
  });
  return Object.freeze({
    repositoryId: input.expectedRepositoryId,
    worktreeRoot,
    gitDir,
    commonDir,
    objectFormat,
    refStorage,
    capabilityRevision: input.executor.capabilityRevision,
    stableIdentityFingerprint: stableFingerprint,
    repositoryFingerprint: fingerprint,
    executionIsolation: "none",
    repositoryIntegrations: "disabled",
    sparseCheckout,
    splitIndex,
    mutableIdentities,
    managedTaskWorktree: true
  });
}

export async function revalidateGitRepository(identity: GitRepositoryIdentity): Promise<void> {
  const currentRoot = await fsp.realpath(identity.worktreeRoot).catch(() => {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  });
  const currentGitDir = await fsp.realpath(identity.gitDir).catch(() => {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  });
  const currentCommonDir = await fsp.realpath(identity.commonDir).catch(() => {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  });
  if (!samePath(currentRoot, identity.worktreeRoot) || !samePath(currentGitDir, identity.gitDir) || !samePath(currentCommonDir, identity.commonDir)) {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  const gitEntry = path.join(identity.worktreeRoot, ".git");
  if (identity.managedTaskWorktree) {
    const marker = await readBoundedUtf8File(gitEntry, 4096).catch(() => {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    });
    const match = /^gitdir: (.+)\r?\n?$/u.exec(marker);
    const markerGitDir = match
      ? await fsp.realpath(path.resolve(identity.worktreeRoot, match[1])).catch(() => null)
      : null;
    const commonMarker = await readBoundedUtf8File(path.join(identity.gitDir, "commondir"), 4096).catch(() => "");
    const markerCommonDir = commonMarker.trim()
      ? await fsp.realpath(path.resolve(identity.gitDir, commonMarker.trim())).catch(() => null)
      : null;
    if (
      !markerGitDir ||
      !markerCommonDir ||
      !samePath(markerGitDir, identity.gitDir) ||
      !samePath(markerCommonDir, identity.commonDir) ||
      !isInside(identity.gitDir, path.join(identity.commonDir, "worktrees"))
    ) throw gitError("GIT_REPOSITORY_UNSAFE");
  } else if (!isInside(currentGitDir, currentRoot) || !samePath(currentGitDir, currentCommonDir)) {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  const current = await mutableIdentityInventory(
    identity.worktreeRoot,
    identity.gitDir,
    identity.commonDir,
    identity.refStorage,
    identity.managedTaskWorktree ? gitEntry : undefined
  );
  const expectedKeys = Object.keys(identity.mutableIdentities).sort();
  const currentKeys = Object.keys(current).sort();
  if (expectedKeys.length !== currentKeys.length || expectedKeys.some((key, index) => key !== currentKeys[index])) {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  for (const key of expectedKeys) {
    if (!identitiesEqual(identity.mutableIdentities[key] ?? null, current[key] ?? null)) {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    }
  }
}

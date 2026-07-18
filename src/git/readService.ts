import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import { hasSecretValue, sanitizeGitPatchText } from "../redact.js";
import type { z } from "zod";
import type { gitDiffDataV4Schema } from "../tools/schemas/gitDiff.js";
import type { gitStatusDataV4Schema } from "../tools/schemas/gitStatus.js";
import type { gitBranchDataV4Schema } from "../tools/schemas/gitBranch.js";
import type { gitLogDataV4Schema } from "../tools/schemas/gitLog.js";
import { gitV4LiteralPathSchema } from "../tools/schemas/gitV4Common.js";
import type { GitCommandExecutor, GitExecutionOptions, GitExecutionResult } from "./execution.js";
import {
  admitGitRepository,
  revalidateGitRepository,
  type GitRepositoryIdentity,
  type RepositoryIdentityRegistry
} from "./repositoryIdentity.js";
import {
  parseGitBatchCheck,
  parseGitBatchObjects,
  parseGitNumstatZ,
  parseGitRawDiffZ,
  parseGitStatusPorcelainV2,
  sanitizeGitPublicOneLine,
  type ParsedGitStatus,
  type ParsedGitStatusEntry
} from "./parsers.js";
import type { GitStateTokenFacts, GitStateTokenService } from "./stateToken.js";
import type { GitIntegrationGateV4 } from "./integrations.js";

export type GitStatusDataV4 = z.infer<typeof gitStatusDataV4Schema>;
export type GitDiffDataV4 = z.infer<typeof gitDiffDataV4Schema>;
export type GitBranchDataV4 = z.infer<typeof gitBranchDataV4Schema>;
export type GitLogDataV4 = z.infer<typeof gitLogDataV4Schema>;

export interface GitStatusWithDisplayV4 {
  data: GitStatusDataV4;
  currentBranchName: string | null;
}

export interface GitReadCoordinator {
  run<T>(workspace: Workspace, action: () => Promise<T>): Promise<T>;
}

export class ProcessLocalGitReadCoordinator implements GitReadCoordinator {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(workspace: Workspace, action: () => Promise<T>): Promise<T> {
    const key = process.platform === "win32"
      ? path.resolve(workspace.root).toLocaleLowerCase("en-US")
      : path.resolve(workspace.root);
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    this.#tails.set(key, tail);
    await previous.catch(() => {});
    try {
      return await action();
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }
}

const MAX_STATUS_BYTES = 1_048_576;
const MAX_PATCH_BYTES = 1_000_000;
const MAX_ENTRIES = 4096;
const MAX_ATTRIBUTE_FILES = 1024;
const MAX_ATTRIBUTE_DIRECTORIES = 4096;
const MAX_ATTRIBUTE_BYTES = 1_048_576;
const MAX_SCAN_FILE_BYTES = 524_288;
const MAX_SCAN_TOTAL_BYTES = 786_432;
const MAX_OBJECTS = 256;
const MAX_LOG_OBJECT_BYTES = 262_144;
const EMPTY_DIGEST = createHash("sha256").update("").digest("hex");

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

function posixPath(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decodeUtf8OrNull(value: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return null;
  }
}

async function readBoundedFile(file: string, maxBytes: number): Promise<Buffer> {
  let lexical;
  try {
    lexical = await fsp.lstat(file, { bigint: true });
  } catch {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1n || lexical.size > BigInt(maxBytes)) {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
  const handle = await fsp.open(file, "r").catch(() => {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  });
  try {
    const stat = await handle.stat({ bigint: true });
    if (
      !stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(maxBytes) ||
      stat.dev !== lexical.dev || stat.ino !== lexical.ino
    ) throw gitError("GIT_REPOSITORY_UNSAFE");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function outputText(value: Buffer, limit = MAX_STATUS_BYTES): string {
  if (value.length > limit) throw gitError("GIT_SCAN_LIMIT");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw gitError("GIT_REPOSITORY_UNSAFE");
  }
}

function parseLines(value: Buffer): string[] {
  return outputText(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function mapStatusEntry(entry: ParsedGitStatusEntry) {
  return {
    path: entry.path,
    old_path: entry.oldPath,
    index: entry.index,
    worktree: entry.worktree,
    submodule: entry.submodule
  };
}

function pathIsSecret(value: string): boolean {
  return hasSecretValue(value) || /(?:^|\/)(?:\.env(?:\.|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)|.*\.(?:pem|key|p12|pfx))$/i.test(value);
}

function publicPathSafe(value: string): boolean {
  return gitV4LiteralPathSchema.safeParse(value).success;
}

function bufferHasSecret(value: Buffer): boolean {
  return hasSecretValue(value.toString("latin1"));
}

function parseCommitDisplay(content: Buffer): {
  subject: string | null;
  authorName: string | null;
  timestamp: string;
} {
  const separator = content.indexOf("\n\n");
  if (separator < 0) throw gitError("GIT_REPOSITORY_UNSAFE");
  let authorLine: Buffer | null = null;
  let cursor = 0;
  while (cursor < separator) {
    const end = content.indexOf(0x0a, cursor);
    const lineEnd = end < 0 || end > separator ? separator : end;
    const line = content.subarray(cursor, lineEnd);
    if (line.length >= 7 && line.subarray(0, 7).toString("ascii") === "author ") {
      authorLine = line;
      break;
    }
    cursor = lineEnd + 1;
  }
  if (!authorLine) throw gitError("GIT_REPOSITORY_UNSAFE");
  const emailStart = authorLine.lastIndexOf(" <");
  const emailEnd = authorLine.lastIndexOf("> ");
  if (emailStart < 7 || emailEnd <= emailStart + 2) throw gitError("GIT_REPOSITORY_UNSAFE");
  const suffix = authorLine.subarray(emailEnd + 2).toString("ascii");
  const suffixMatch = /^(\d+) ([+-]\d{4})$/.exec(suffix);
  if (!suffixMatch) throw gitError("GIT_REPOSITORY_UNSAFE");
  const timestampSeconds = Number(suffixMatch[1]);
  if (!Number.isSafeInteger(timestampSeconds)) throw gitError("GIT_REPOSITORY_UNSAFE");
  const timestampDate = new Date(timestampSeconds * 1000);
  if (!Number.isFinite(timestampDate.getTime())) throw gitError("GIT_REPOSITORY_UNSAFE");

  const authorText = decodeUtf8OrNull(authorLine.subarray(7, emailStart));
  const subjectStart = separator + 2;
  const subjectEnd = content.indexOf(0x0a, subjectStart);
  const subjectBytes = content.subarray(subjectStart, subjectEnd < 0 ? content.length : subjectEnd);
  const subjectText = decodeUtf8OrNull(subjectBytes);
  return {
    subject: subjectText === null ? null : sanitizeGitPublicOneLine(subjectText, 240),
    authorName: authorText === null ? null : sanitizeGitPublicOneLine(authorText, 160),
    timestamp: timestampDate.toISOString()
  };
}

async function runRequired(
  executor: GitCommandExecutor,
  repository: GitRepositoryIdentity,
  args: readonly string[],
  options: GitExecutionOptions = {}
): Promise<GitExecutionResult> {
  const result = await executor.run(repository, args, options).catch(() => {
    throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  });
  if (result.timedOut || result.stdoutTruncated || result.stderrTruncated) throw gitError("GIT_SCAN_LIMIT");
  if (result.status !== 0) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  return result;
}

interface AttributeInventory {
  digest: string;
  complete: boolean;
  integrationsPresent: boolean;
}

export async function neutralizedFilterConfig(
  executor: GitCommandExecutor,
  repository: GitRepositoryIdentity
): Promise<string[]> {
  const result = await executor.run(repository, [
    "config",
    "--local",
    "--no-includes",
    "--null",
    "--get-regexp",
    "^filter\\..*\\.(clean|smudge|process|required)$"
  ], { stdoutLimitBytes: 128 * 1024 });
  if (
    result.timedOut ||
    result.stdoutTruncated ||
    result.stderrTruncated ||
    (result.status !== 0 && result.status !== 1)
  ) throw gitError("GIT_INTEGRATION_REQUIRED");
  if (result.status === 1) return [];
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  } catch {
    throw gitError("GIT_INTEGRATION_REQUIRED");
  }
  const names = new Set<string>();
  for (const record of text.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\n");
    const key = separator < 0 ? record : record.slice(0, separator);
    const match = /^filter\.([A-Za-z0-9._-]+)\.(?:clean|smudge|process|required)$/u.exec(key);
    if (!match || match[1].length > 64) throw gitError("GIT_INTEGRATION_REQUIRED");
    names.add(match[1]);
  }
  if (names.size > 32) throw gitError("GIT_SCAN_LIMIT");
  return [...names].sort().flatMap((name) => [
    `filter.${name}.process=`,
    `filter.${name}.clean=`,
    `filter.${name}.smudge=`,
    `filter.${name}.required=false`
  ]);
}

async function attributeInventory(repository: GitRepositoryIdentity): Promise<AttributeInventory> {
  const queue = [repository.worktreeRoot];
  const records: { path: string; digest: string }[] = [];
  let directories = 0;
  let totalBytes = 0;
  let complete = true;
  let integrationsPresent = false;

  const inspect = async (file: string, relative: string, optional = false) => {
    if (records.length >= MAX_ATTRIBUTE_FILES) {
      complete = false;
      return;
    }
    let content: Buffer;
    try {
      const handle = await fsp.open(file, "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_ATTRIBUTE_BYTES - totalBytes) {
          complete = false;
          return;
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return;
      complete = false;
      return;
    }
    totalBytes += content.length;
    const text = outputText(content, MAX_ATTRIBUTE_BYTES);
    if (/(?:^|\s)(?:filter|diff|merge|working-tree-encoding)(?:=|\s|$)/im.test(text)) integrationsPresent = true;
    records.push({ path: relative, digest: sha256(content) });
  };

  while (queue.length > 0) {
    const directory = queue.shift()!;
    directories += 1;
    if (directories > MAX_ATTRIBUTE_DIRECTORIES) {
      complete = false;
      break;
    }
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      complete = false;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        complete = false;
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (entry.isFile() && entry.name === ".gitattributes") {
        await inspect(absolute, posixPath(path.relative(repository.worktreeRoot, absolute)));
      }
    }
  }
  await inspect(path.join(repository.gitDir, "info", "attributes"), ".git/info/attributes", true);
  try {
    const configContent = await readBoundedFile(path.join(repository.gitDir, "config"), MAX_ATTRIBUTE_BYTES);
    const config = outputText(configContent, MAX_ATTRIBUTE_BYTES);
    records.push({ path: ".git/config", digest: sha256(configContent) });
    if (/^\s*\[(?:filter|diff|merge)(?:\s|\])/im.test(config) || /^\s*attributesfile\s*=/im.test(config)) {
      integrationsPresent = true;
    }
  } catch {
    complete = false;
  }
  return {
    digest: sha256(stableJson(records)),
    complete,
    integrationsPresent
  };
}

function literalPaths(workspace: Workspace, guard: PathGuard, paths: readonly string[] | undefined): string[] | undefined {
  if (!paths) return undefined;
  return paths.map((requested) => {
    try {
      const resolved = guard.resolve(workspace, requested);
      return posixPath(resolved.relPath);
    } catch {
      throw gitError("GIT_PATH_BLOCKED");
    }
  });
}

async function scanFile(
  file: string,
  workspaceRoot: string,
  budget: { total: number }
): Promise<{ complete: boolean; secret: boolean; unsafe: boolean; digest: string }> {
  let lexical;
  try {
    lexical = await fsp.lstat(file, { bigint: true });
  } catch {
    return { complete: false, secret: false, unsafe: false, digest: EMPTY_DIGEST };
  }
  if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1n) {
    return { complete: false, secret: false, unsafe: true, digest: EMPTY_DIGEST };
  }
  let handle: fsp.FileHandle;
  try {
    handle = await fsp.open(file, "r");
  } catch {
    return { complete: false, secret: false, unsafe: false, digest: EMPTY_DIGEST };
  }
  try {
    const [stat, realPath] = await Promise.all([
      handle.stat({ bigint: true }),
      fsp.realpath(file).catch(() => "")
    ]);
    if (
      !stat.isFile() || stat.nlink !== 1n || stat.dev !== lexical.dev || stat.ino !== lexical.ino ||
      !realPath || !isInside(realPath, workspaceRoot)
    ) {
      return { complete: false, secret: false, unsafe: true, digest: EMPTY_DIGEST };
    }
    if (stat.size > BigInt(MAX_SCAN_FILE_BYTES) || BigInt(budget.total) + stat.size > BigInt(MAX_SCAN_TOTAL_BYTES)) {
      return { complete: false, secret: false, unsafe: false, digest: EMPTY_DIGEST };
    }
    const content = await handle.readFile();
    budget.total += content.length;
    return { complete: true, secret: bufferHasSecret(content), unsafe: false, digest: sha256(content) };
  } finally {
    await handle.close();
  }
}

interface IndexEntry {
  path: string;
  oid: string;
  stage: number;
}

function parseIndexEntries(value: Buffer, oidLength: number): IndexEntry[] {
  const records = outputText(value).split("\0").filter(Boolean);
  return records.map((record) => {
    const tab = record.indexOf("\t");
    const match = /^(\d{6}) ([a-f0-9]+) ([0-3])$/.exec(tab < 0 ? "" : record.slice(0, tab));
    const filePath = tab < 0 ? "" : record.slice(tab + 1);
    if (!match || match[2].length !== oidLength || !filePath) throw gitError("GIT_REPOSITORY_UNSAFE");
    return { path: filePath, oid: match[2], stage: Number(match[3]) };
  });
}

async function readObjectsBatch(
  executor: GitCommandExecutor,
  repository: GitRepositoryIdentity,
  oids: readonly string[],
  expectedType: "blob" | "commit",
  maxObjectBytes: number,
  maxTotalBytes: number
) {
  if (oids.length === 0) return [];
  const stdin = Buffer.from(`${oids.join("\n")}\n`, "ascii");
  const checkResult = await runRequired(executor, repository, ["cat-file", "--batch-check"], {
    stdin,
    stdoutLimitBytes: Math.min(MAX_STATUS_BYTES, Math.max(1, oids.length * 112)),
    timeoutMs: 60_000
  });
  const checks = parseGitBatchCheck(checkResult.stdout, repository.objectFormat);
  if (
    checks.length !== oids.length ||
    checks.some((entry, index) => entry.oid !== oids[index] || entry.type !== expectedType)
  ) throw gitError("GIT_OBJECT_MISSING");
  let total = 0;
  for (const check of checks) {
    total += check.size;
    if (check.size > maxObjectBytes || total > maxTotalBytes) throw gitError("GIT_SCAN_LIMIT");
  }
  const batchLimit = total + checks.length * 128;
  if (batchLimit > MAX_STATUS_BYTES) throw gitError("GIT_SCAN_LIMIT");
  const contentResult = await runRequired(executor, repository, ["cat-file", "--batch"], {
    stdin,
    stdoutLimitBytes: Math.max(1, batchLimit),
    timeoutMs: 60_000
  });
  return parseGitBatchObjects(contentResult.stdout, checks, repository.objectFormat);
}

async function scanIndexObjects(
  executor: GitCommandExecutor,
  repository: GitRepositoryIdentity,
  paths: readonly string[] | undefined
): Promise<{ complete: boolean; secretPaths: Set<string>; digest: string }> {
  const args = ["ls-files", "--stage", "-z"];
  if (paths) args.push("--", ...paths);
  const listing = await runRequired(executor, repository, args, { stdoutLimitBytes: MAX_STATUS_BYTES });
  const entries = parseIndexEntries(listing.stdout, repository.objectFormat === "sha1" ? 40 : 64);
  if (entries.length > MAX_OBJECTS || entries.some((entry) => entry.stage !== 0)) {
    return { complete: false, secretPaths: new Set(), digest: sha256(listing.stdout) };
  }
  const uniqueOids = [...new Set(entries.map((entry) => entry.oid))];
  let objects;
  try {
    objects = await readObjectsBatch(
      executor,
      repository,
      uniqueOids,
      "blob",
      MAX_SCAN_FILE_BYTES,
      MAX_SCAN_TOTAL_BYTES
    );
  } catch (error) {
    if ((error as Error).message === "GIT_SCAN_LIMIT") {
      return { complete: false, secretPaths: new Set(), digest: sha256(listing.stdout) };
    }
    throw error;
  }
  const secretOids = new Set(objects.filter((entry) => bufferHasSecret(entry.content)).map((entry) => entry.oid));
  const objectDigests = objects.map((entry) => ({ oid: entry.oid, digest: sha256(entry.content) }));
  return {
    complete: true,
    secretPaths: new Set(entries.filter((entry) => secretOids.has(entry.oid)).map((entry) => entry.path)),
    digest: sha256(stableJson({ listing: sha256(listing.stdout), objects: objectDigests }))
  };
}

interface StatusSnapshot {
  repository: GitRepositoryIdentity;
  parsed: ParsedGitStatus;
  visibleEntries: ParsedGitStatusEntry[];
  visibleIgnoredPaths: string[];
  omittedBlocked: number;
  omittedSecret: number;
  complete: boolean;
  headDigest: string;
  indexDigest: string;
  worktreeDigest: string;
  ignoredDigest: string;
  attributesDigest: string;
  scopeDigest: string;
}

function snapshotStateDigest(snapshot: StatusSnapshot): string {
  return sha256(stableJson({
    repositoryId: snapshot.repository.repositoryId,
    repositoryFingerprint: snapshot.repository.repositoryFingerprint,
    headDigest: snapshot.headDigest,
    indexDigest: snapshot.indexDigest,
    worktreeDigest: snapshot.worktreeDigest,
    ignoredDigest: snapshot.ignoredDigest,
    attributesDigest: snapshot.attributesDigest,
    scopeDigest: snapshot.scopeDigest,
    complete: snapshot.complete,
    entries: snapshot.visibleEntries,
    ignored: snapshot.visibleIgnoredPaths,
    omittedBlocked: snapshot.omittedBlocked,
    omittedSecret: snapshot.omittedSecret
  }));
}

export class GitReadServiceV4 {
  readonly capabilityRevision: string;
  readonly #executor: GitCommandExecutor;
  readonly #registry: RepositoryIdentityRegistry;
  readonly #stateTokens: GitStateTokenService;
  readonly #contextFingerprint: string;
  readonly #coordinator: GitReadCoordinator;
  readonly #integrationGate: GitIntegrationGateV4 | null;

  constructor(options: {
    executor: GitCommandExecutor;
    registry: RepositoryIdentityRegistry;
    stateTokens: GitStateTokenService;
    contextFingerprint: string;
    coordinator?: GitReadCoordinator;
    integrationGate?: GitIntegrationGateV4;
  }) {
    if (options.registry.contextFingerprint() !== options.contextFingerprint) throw gitError("GIT_REPOSITORY_UNSAFE");
    this.capabilityRevision = options.executor.capabilityRevision;
    this.#executor = options.executor;
    this.#registry = options.registry;
    this.#stateTokens = options.stateTokens;
    this.#contextFingerprint = options.contextFingerprint;
    this.#coordinator = options.coordinator ?? new ProcessLocalGitReadCoordinator();
    this.#integrationGate = options.integrationGate ?? null;
  }

  currentBranchName(data: GitStatusDataV4): string | null {
    if (data.head.kind === "detached") return null;
    const ref = this.#registry.resolveBranch(data.repository_id, data.head.branch_id);
    if (!ref.startsWith("refs/heads/")) return null;
    return sanitizeGitPublicOneLine(ref.slice("refs/heads/".length), 240);
  }

  async #snapshot(input: {
    workspace: Workspace;
    guard: PathGuard;
    paths?: readonly string[];
  }): Promise<StatusSnapshot> {
    const repository = await admitGitRepository({ workspaceRoot: input.workspace.root, executor: this.#executor, registry: this.#registry });
    const paths = literalPaths(input.workspace, input.guard, input.paths);
    const configOverrides = await neutralizedFilterConfig(this.#executor, repository);
    const args = ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all", "--ignored=matching"];
    if (paths) args.push("--", ...paths);
    const result = await runRequired(this.#executor, repository, args, {
      stdoutLimitBytes: MAX_STATUS_BYTES,
      configOverrides
    });
    const parsed = parseGitStatusPorcelainV2(result.stdout, repository.objectFormat);
    const attributes = await attributeInventory(repository);
    const indexScan = await scanIndexObjects(this.#executor, repository, paths);
    const budget = { total: 0 };
    const visibleEntries: ParsedGitStatusEntry[] = [];
    let omittedBlocked = 0;
    let omittedSecret = 0;
    let contentComplete = indexScan.complete;
    const worktreeRecords: { path: string; digest: string }[] = [];

    for (const entry of parsed.entries) {
      if (!publicPathSafe(entry.path) || (entry.oldPath !== null && !publicPathSafe(entry.oldPath))) {
        omittedBlocked += 1;
        continue;
      }
      if (input.guard.isBlockedRelativePath(entry.path) || (entry.oldPath !== null && input.guard.isBlockedRelativePath(entry.oldPath))) {
        omittedBlocked += 1;
        continue;
      }
      if (pathIsSecret(entry.path) || (entry.oldPath !== null && pathIsSecret(entry.oldPath)) || indexScan.secretPaths.has(entry.path)) {
        omittedSecret += 1;
        continue;
      }
      if (entry.worktree !== "unmodified" && entry.worktree !== "deleted" && entry.worktree !== "unmerged") {
        const scanned = await scanFile(
          path.join(repository.worktreeRoot, ...entry.path.split("/")),
          repository.worktreeRoot,
          budget
        );
        contentComplete &&= scanned.complete;
        if (scanned.unsafe) {
          omittedBlocked += 1;
          continue;
        }
        if (scanned.secret) {
          omittedSecret += 1;
          continue;
        }
        worktreeRecords.push({ path: entry.path, digest: scanned.digest });
      }
      visibleEntries.push(entry);
    }
    const visibleIgnoredPaths: string[] = [];
    for (const ignored of parsed.ignoredPaths) {
      if (!publicPathSafe(ignored)) {
        omittedBlocked += 1;
      } else if (input.guard.isBlockedRelativePath(ignored)) {
        omittedBlocked += 1;
      } else if (pathIsSecret(ignored)) {
        omittedSecret += 1;
      } else {
        visibleIgnoredPaths.push(ignored);
      }
    }
    await revalidateGitRepository(repository);
    const complete =
      parsed.entries.length <= MAX_ENTRIES &&
      omittedBlocked === 0 &&
      omittedSecret === 0 &&
      contentComplete &&
      attributes.complete &&
      (!attributes.integrationsPresent || this.#integrationGate?.enabled === true) &&
      repository.refStorage === "files" &&
      !repository.sparseCheckout &&
      !repository.splitIndex;
    return {
      repository,
      parsed,
      visibleEntries,
      visibleIgnoredPaths,
      omittedBlocked,
      omittedSecret,
      complete,
      headDigest: sha256(stableJson(parsed.head)),
      indexDigest: indexScan.digest,
      worktreeDigest: sha256(stableJson({ status: sha256(result.stdout), files: worktreeRecords })),
      ignoredDigest: sha256(stableJson(visibleIgnoredPaths)),
      attributesDigest: attributes.digest,
      scopeDigest: sha256(stableJson(paths ?? ["<repository>"]))
    };
  }

  #stateFacts(snapshot: StatusSnapshot, workspaceId: string, resultDigest: string): GitStateTokenFacts {
    return {
      schemaVersion: 1,
      repositoryId: snapshot.repository.repositoryId,
      workspaceId,
      contextFingerprint: this.#contextFingerprint,
      capabilityRevision: this.#executor.capabilityRevision,
      repositoryFingerprint: snapshot.repository.repositoryFingerprint,
      headDigest: snapshot.headDigest,
      indexDigest: snapshot.indexDigest,
      worktreeDigest: snapshot.worktreeDigest,
      ignoredDigest: snapshot.ignoredDigest,
      attributesDigest: snapshot.attributesDigest,
      scopeDigest: snapshot.scopeDigest,
      resultDigest,
      complete: snapshot.complete
    };
  }

  status(input: {
    workspace: Workspace;
    guard: PathGuard;
    paths?: readonly string[];
  }): Promise<GitStatusDataV4> {
    return this.#coordinator.run(input.workspace, async () => (await this.#statusWithDisplay(input)).data);
  }

  statusWithDisplay(input: {
    workspace: Workspace;
    guard: PathGuard;
    paths?: readonly string[];
  }): Promise<GitStatusWithDisplayV4> {
    return this.#coordinator.run(input.workspace, () => this.#statusWithDisplay(input));
  }

  async #statusWithDisplay(input: {
    workspace: Workspace;
    guard: PathGuard;
    paths?: readonly string[];
  }): Promise<GitStatusWithDisplayV4> {
    const snapshot = await this.#snapshot(input);
    const head = snapshot.parsed.head.kind === "detached"
      ? { kind: "detached" as const, branch_id: null, oid: snapshot.parsed.head.oid! }
      : snapshot.parsed.head.kind === "unborn"
        ? { kind: "unborn" as const, branch_id: this.#registry.branchId(snapshot.repository.repositoryId, snapshot.parsed.head.ref!), oid: null }
        : { kind: "branch" as const, branch_id: this.#registry.branchId(snapshot.repository.repositoryId, snapshot.parsed.head.ref!), oid: snapshot.parsed.head.oid! };
    let tokenSnapshot = snapshot;
    if (snapshot.complete) {
      const rechecked = await this.#snapshot(input);
      if (snapshotStateDigest(rechecked) !== snapshotStateDigest(snapshot)) throw gitError("GIT_STATE_CHANGED");
      tokenSnapshot = rechecked;
    }
    const integrationReview = snapshot.complete && this.#integrationGate?.enabled
      ? await this.#integrationGate.review({
          workspaceId: input.workspace.id,
          repository: tokenSnapshot.repository,
          semanticStateDigest: snapshotStateDigest(tokenSnapshot)
        })
      : null;
    const withoutToken = {
      repository_id: snapshot.repository.repositoryId,
      head,
      entries: snapshot.visibleEntries.slice(0, MAX_ENTRIES).map(mapStatusEntry),
      changed_count: snapshot.visibleEntries.length,
      untracked_count: snapshot.visibleEntries.filter((entry) => entry.worktree === "untracked").length,
      ignored_count: snapshot.visibleIgnoredPaths.length,
      omitted_blocked_count: snapshot.omittedBlocked,
      omitted_secret_count: snapshot.omittedSecret,
      scan_complete: snapshot.complete,
      mutation_state: snapshot.complete ? "complete" as const : "incomplete" as const,
      integration_identity_count: integrationReview?.identities.length ?? 0,
      integration_identity_digest: integrationReview?.identitiesDigest ?? null,
      integration_identities: (integrationReview?.identities ?? []).map((identity) => ({
        kind: identity.kind,
        config_key_digest: identity.configKeyDigest,
        executable_digest: identity.executableDigest,
        content_digest: identity.contentDigest
      })),
      execution_isolation: "none" as const,
      repository_integrations: this.#integrationGate?.enabled
        ? "approved_full_access" as const
        : "disabled" as const
    };
    const facts = this.#stateFacts(tokenSnapshot, input.workspace.id, sha256(stableJson(withoutToken)));
    const currentBranchName = snapshot.parsed.head.ref?.startsWith("refs/heads/")
      ? sanitizeGitPublicOneLine(snapshot.parsed.head.ref.slice("refs/heads/".length), 240)
      : null;
    return {
      data: {
        ...withoutToken,
        state_token: snapshot.complete ? this.#stateTokens.mint(facts) : null,
        integration_review_token: integrationReview?.reviewToken ?? null
      },
      currentBranchName
    };
  }

  diff(input: {
    workspace: Workspace;
    guard: PathGuard;
    comparison: "worktree_to_index" | "index_to_head" | "head_to_base";
    paths?: readonly string[];
    includePatch?: boolean;
    taskWorktreeId?: string;
  }): Promise<GitDiffDataV4> {
    return this.#coordinator.run(input.workspace, () => this.#diff(input));
  }

  async #diff(input: {
    workspace: Workspace;
    guard: PathGuard;
    comparison: "worktree_to_index" | "index_to_head" | "head_to_base";
    paths?: readonly string[];
    includePatch?: boolean;
    taskWorktreeId?: string;
  }): Promise<GitDiffDataV4> {
    if (input.comparison === "head_to_base") throw gitError("TASK_WORKTREE_NOT_FOUND");
    const snapshot = await this.#snapshot({ workspace: input.workspace, guard: input.guard, paths: input.paths });
    const paths = literalPaths(input.workspace, input.guard, input.paths);
    const baseArgs = input.comparison === "index_to_head" ? ["diff", "--cached"] : ["diff"];
    const common = ["--no-ext-diff", "--no-textconv", "--no-abbrev", "-M", "-C"];
    const pathArgs = paths ? ["--", ...paths] : ["--"];
    await revalidateGitRepository(snapshot.repository);
    const raw = await runRequired(this.#executor, snapshot.repository, [...baseArgs, "--raw", "-z", ...common, ...pathArgs], { stdoutLimitBytes: MAX_STATUS_BYTES });
    await revalidateGitRepository(snapshot.repository);
    const numstat = await runRequired(this.#executor, snapshot.repository, [...baseArgs, "--numstat", "-z", ...common, ...pathArgs], { stdoutLimitBytes: MAX_STATUS_BYTES });
    await revalidateGitRepository(snapshot.repository);
    const rawChanges = parseGitRawDiffZ(raw.stdout, snapshot.repository.objectFormat);
    const stats = parseGitNumstatZ(numstat.stdout);
    const statsByPath = new Map(stats.map((entry) => [entry.path, entry]));
    const visibleStatusPaths = new Set(snapshot.visibleEntries.flatMap((entry) =>
      entry.oldPath === null ? [entry.path] : [entry.path, entry.oldPath]
    ));
    const changes = [];
    let omittedBlocked = snapshot.omittedBlocked;
    let omittedSecret = snapshot.omittedSecret;
    for (const change of rawChanges) {
      if (!visibleStatusPaths.has(change.path) && !(change.oldPath && visibleStatusPaths.has(change.oldPath))) continue;
      if (!publicPathSafe(change.path) || (change.oldPath && !publicPathSafe(change.oldPath))) {
        omittedBlocked += 1;
        continue;
      }
      if (input.guard.isBlockedRelativePath(change.path) || (change.oldPath && input.guard.isBlockedRelativePath(change.oldPath))) {
        omittedBlocked += 1;
        continue;
      }
      if (pathIsSecret(change.path) || (change.oldPath && pathIsSecret(change.oldPath))) {
        omittedSecret += 1;
        continue;
      }
      const stat = statsByPath.get(change.path);
      changes.push({
        path: change.path,
        change: change.change,
        old_path: change.oldPath,
        binary: stat?.binary ?? false,
        additions: stat?.additions ?? 0,
        deletions: stat?.deletions ?? 0
      });
    }
    let patch = "";
    let patchIncluded = input.includePatch ?? false;
    let truncated = false;
    if (patchIncluded && changes.length > 0) {
      const visiblePaths = changes.flatMap((change) => change.old_path ? [change.old_path, change.path] : [change.path]);
      const patchResult = await this.#executor.run(snapshot.repository, [...baseArgs, "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "-C", "--", ...visiblePaths], {
        stdoutLimitBytes: MAX_PATCH_BYTES,
        stderrLimitBytes: 4096,
        timeoutMs: 60_000
      }).catch(() => { throw gitError("GIT_CAPABILITY_UNAVAILABLE"); });
      if (patchResult.timedOut || patchResult.stdoutTruncated || patchResult.stderrTruncated) throw gitError("GIT_SCAN_LIMIT");
      if (patchResult.status !== 0) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
      await revalidateGitRepository(snapshot.repository);
      const sanitized = sanitizeGitPatchText(outputText(patchResult.stdout, MAX_PATCH_BYTES), MAX_PATCH_BYTES);
      patch = sanitized.text;
      truncated = patchResult.stdoutTruncated || sanitized.truncated;
      if (sanitized.secretRedacted) omittedSecret += 1;
    }
    const withoutToken = {
      repository_id: snapshot.repository.repositoryId,
      comparison: input.comparison,
      changes,
      additions: changes.reduce((sum, entry) => sum + (entry.additions ?? 0), 0),
      deletions: changes.reduce((sum, entry) => sum + (entry.deletions ?? 0), 0),
      binary_count: changes.filter((entry) => entry.binary).length,
      patch,
      patch_included: patchIncluded,
      truncated,
      omitted_blocked_count: omittedBlocked,
      omitted_secret_count: omittedSecret
    };
    const complete = snapshot.complete && !truncated && omittedBlocked === 0 && omittedSecret === 0 && rawChanges.length <= MAX_ENTRIES;
    let tokenSnapshot = snapshot;
    if (complete) {
      const rechecked = await this.#snapshot({ workspace: input.workspace, guard: input.guard, paths: input.paths });
      if (snapshotStateDigest(rechecked) !== snapshotStateDigest(snapshot)) throw gitError("GIT_STATE_CHANGED");
      tokenSnapshot = rechecked;
    }
    await revalidateGitRepository(snapshot.repository);
    const facts = { ...this.#stateFacts(tokenSnapshot, input.workspace.id, sha256(stableJson(withoutToken))), complete };
    return {
      ...withoutToken,
      state_token: complete ? this.#stateTokens.mint(facts) : null
    };
  }

  branches(input: { workspace: Workspace; guard: PathGuard }): Promise<GitBranchDataV4> {
    return this.#coordinator.run(input.workspace, () => this.#branches(input));
  }

  async #branches(input: { workspace: Workspace; guard: PathGuard }): Promise<GitBranchDataV4> {
    const snapshot = await this.#snapshot(input);
    await revalidateGitRepository(snapshot.repository);
    const result = await runRequired(this.#executor, snapshot.repository, [
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname)%00%(objectname)%00%(worktreepath)%00",
      "refs/heads"
    ], { stdoutLimitBytes: MAX_STATUS_BYTES });
    const fields = outputText(result.stdout).split("\0");
    const branches = [];
    const caseKeys = new Set<string>();
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const ref = fields[index].replace(/^\r?\n/, "");
      const oid = fields[index + 1];
      const worktreePath = fields[index + 2];
      if (!ref) continue;
      if (!ref.startsWith("refs/heads/") || !new RegExp(`^[a-f0-9]{${snapshot.repository.objectFormat === "sha1" ? 40 : 64}}$`).test(oid)) throw gitError("GIT_REPOSITORY_UNSAFE");
      const key = ref.toLocaleLowerCase("en-US");
      if (caseKeys.has(key)) throw gitError("GIT_REPOSITORY_UNSAFE");
      caseKeys.add(key);
      const shortName = ref.slice("refs/heads/".length);
      const name = sanitizeGitPublicOneLine(shortName, 240);
      const current = snapshot.parsed.head.ref === ref;
      branches.push({
        branch_id: this.#registry.branchId(snapshot.repository.repositoryId, ref),
        oid,
        current,
        checked_out: current || worktreePath.trim().length > 0,
        owned_task_worktree_id: null,
        name,
        name_omitted: name === null
      });
      if (branches.length > 512) throw gitError("GIT_SCAN_LIMIT");
    }
    await revalidateGitRepository(snapshot.repository);
    return {
      repository_id: snapshot.repository.repositoryId,
      branches,
      truncated: false,
      execution_isolation: "none",
      repository_integrations: "disabled"
    };
  }

  log(input: {
    workspace: Workspace;
    guard: PathGuard;
    branchId?: string;
    limit?: number;
  }): Promise<GitLogDataV4> {
    return this.#coordinator.run(input.workspace, () => this.#log(input));
  }

  async #log(input: {
    workspace: Workspace;
    guard: PathGuard;
    branchId?: string;
    limit?: number;
  }): Promise<GitLogDataV4> {
    const snapshot = await this.#snapshot(input);
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw gitError("GIT_SCAN_LIMIT");
    const revision = input.branchId
      ? this.#registry.resolveBranch(snapshot.repository.repositoryId, input.branchId)
      : "HEAD";
    await revalidateGitRepository(snapshot.repository);
    const result = await runRequired(this.#executor, snapshot.repository, ["rev-list", `--max-count=${limit + 1}`, "--parents", revision], { stdoutLimitBytes: MAX_STATUS_BYTES });
    await revalidateGitRepository(snapshot.repository);
    const lines = parseLines(result.stdout);
    const truncated = lines.length > limit;
    const selected = lines.slice(0, limit).map((line) => line.split(" "));
    const oidLength = snapshot.repository.objectFormat === "sha1" ? 40 : 64;
    const oidPattern = new RegExp(`^[a-f0-9]{${oidLength}}$`);
    if (selected.some((record) => !record.every((value) => oidPattern.test(value)))) {
      throw gitError("GIT_REPOSITORY_UNSAFE");
    }
    await revalidateGitRepository(snapshot.repository);
    const objects = await readObjectsBatch(
      this.#executor,
      snapshot.repository,
      selected.map(([oid]) => oid),
      "commit",
      MAX_LOG_OBJECT_BYTES,
      MAX_SCAN_TOTAL_BYTES
    );
    await revalidateGitRepository(snapshot.repository);
    const commits = [];
    for (let index = 0; index < selected.length; index += 1) {
      const [oid, ...parentOids] = selected[index];
      const display = parseCommitDisplay(objects[index].content);
      commits.push({
        oid,
        parent_oids: parentOids,
        subject: display.subject,
        subject_omitted: display.subject === null,
        author_name: display.authorName,
        author_name_omitted: display.authorName === null,
        timestamp: display.timestamp
      });
    }
    await revalidateGitRepository(snapshot.repository);
    return {
      repository_id: snapshot.repository.repositoryId,
      commits,
      truncated,
      execution_isolation: "none",
      repository_integrations: "disabled"
    };
  }
}

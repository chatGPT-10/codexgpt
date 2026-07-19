import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import { admitGitRepository } from "./repositoryIdentity.js";
import {
  GitMutationContextV4,
  gitMutationError,
  runGitRequired,
  sha256Git
} from "./mutationContext.js";
import { assertRawGitNormalizationV4 } from "./normalization.js";
import { replaceLiveIndexV4 } from "./privateIndex.js";
import { GitObjectQuarantine } from "./objectQuarantine.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitIntegrationGateV4 } from "./integrations.js";

export interface GitIndexTokenFactsV4 {
  repositoryId: string;
  workspaceId: string;
  capabilityRevision: string;
  repositoryFingerprint: string;
  headOid: string;
  indexTreeOid: string;
}

interface StoredIndexToken {
  facts: GitIndexTokenFactsV4;
  expiresAt: number;
}

export class GitIndexTokenServiceV4 {
  readonly #key: Buffer;
  readonly #tokens = new Map<string, StoredIndexToken>();
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(options: { key: Buffer; now?: () => number; ttlMs?: number }) {
    if (!Buffer.isBuffer(options.key) || options.key.length < 32) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    this.#key = Buffer.from(options.key);
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
  }

  mint(facts: GitIndexTokenFactsV4): string {
    const nonce = randomBytes(32);
    const mac = createHmac("sha256", this.#key).update("codexpro.git.index.v1\0").update(nonce).digest();
    const token = `gitx_${Buffer.concat([nonce, mac]).toString("base64url")}`;
    this.#tokens.set(token, { facts: Object.freeze({ ...facts }), expiresAt: this.#now() + this.#ttlMs });
    return token;
  }

  inspect(token: string): GitIndexTokenFactsV4 {
    if (typeof token !== "string" || !/^gitx_[A-Za-z0-9_-]+$/.test(token)) {
      throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    }
    const decoded = Buffer.from(token.slice(5), "base64url");
    if (decoded.length !== 64 || decoded.toString("base64url") !== token.slice(5)) {
      throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    }
    const expected = createHmac("sha256", this.#key)
      .update("codexpro.git.index.v1\0")
      .update(decoded.subarray(0, 32))
      .digest();
    if (!timingSafeEqual(expected, decoded.subarray(32))) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const stored = this.#tokens.get(token);
    if (!stored || stored.expiresAt < this.#now()) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    return stored.facts;
  }

  revoke(token: string): void {
    this.#tokens.delete(token);
  }

  dispose(): void {
    this.#tokens.clear();
    this.#key.fill(0);
  }
}

interface StagedPath {
  path: string;
  absPath: string;
  exists: boolean;
  content: Buffer | null;
  mode: "100644" | "100755";
  previouslyTracked: boolean;
  identity: string | null;
}

async function fileDigest(file: string): Promise<{ identity: string; content: Buffer }> {
  const handle = await fsp.open(file, "r").catch(() => {
    throw gitMutationError("GIT_INDEX_CHANGED");
  });
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > 32n * 1024n * 1024n) {
      throw gitMutationError("GIT_INDEX_CHANGED");
    }
    const content = await handle.readFile();
    return {
      identity: sha256Git(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.nlink}:${sha256Git(content)}`),
      content
    };
  } finally {
    await handle.close();
  }
}

async function scanPaths(
  context: GitMutationContextV4,
  repository: GitRepositoryIdentity,
  workspace: Workspace,
  guard: PathGuard,
  paths: readonly string[]
): Promise<StagedPath[]> {
  const output: StagedPath[] = [];
  for (const relPath of paths) {
    if (guard.isBlockedRelativePath(relPath) || hasSecretValue(relPath)) {
      throw gitMutationError("GIT_PATH_BLOCKED");
    }
    let resolved: { absPath: string; relPath: string };
    try {
      resolved = guard.resolve(workspace, relPath, { forWrite: false });
    } catch {
      const absPath = path.resolve(workspace.root, ...relPath.split("/"));
      const parent = await fsp.realpath(path.dirname(absPath)).catch(() => null);
      if (!parent || path.relative(workspace.root, parent).startsWith("..")) throw gitMutationError("GIT_PATH_BLOCKED");
      resolved = { absPath, relPath };
    }
    const lexical = await fsp.lstat(resolved.absPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw gitMutationError("GIT_PATH_BLOCKED");
    });
    let content: Buffer | null = null;
    let identity: string | null = null;
    let mode: "100644" | "100755" = "100644";
    if (lexical) {
      if (!lexical.isFile() || lexical.isSymbolicLink() || lexical.nlink !== 1 || lexical.size > 16 * 1024 * 1024) {
        throw gitMutationError("GIT_PATH_BLOCKED");
      }
      const bound = await fileDigest(resolved.absPath);
      content = bound.content;
      identity = bound.identity;
      if (hasSecretValue(content.toString("latin1"))) throw gitMutationError("GIT_SECRET_BLOCKED");
      mode = (lexical.mode & 0o111) !== 0 ? "100755" : "100644";
    }
    const tracked = await context.options.executor.run(repository, ["ls-files", "--error-unmatch", "--", relPath]);
    const previouslyTracked = tracked.status === 0;
    if (!lexical && !previouslyTracked) throw gitMutationError("GIT_STATE_CHANGED");
    output.push({ path: relPath, absPath: resolved.absPath, exists: Boolean(lexical), content, mode, previouslyTracked, identity });
  }
  return output;
}

interface BoundIndexEntryV4 {
  mode: "100644" | "100755";
  oid: string;
  stage: 0;
  path: string;
}

interface BoundHeadV4 {
  ref: string | null;
  oid: string;
}

async function boundHead(
  context: GitMutationContextV4,
  repository: GitRepositoryIdentity
): Promise<BoundHeadV4> {
  const symbolic = await context.options.executor.run(repository, [
    "symbolic-ref", "-q", "HEAD"
  ], { stdoutLimitBytes: 512 }).catch(() => {
    throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
  });
  if (symbolic.timedOut || symbolic.stdoutTruncated || symbolic.stderrTruncated) {
    throw gitMutationError("GIT_SCAN_LIMIT");
  }
  if (symbolic.status !== 0 && symbolic.status !== 1) throw gitMutationError("GIT_REF_CHANGED");
  let ref: string | null = null;
  if (symbolic.status === 0) {
    try {
      ref = new TextDecoder("utf-8", { fatal: true }).decode(symbolic.stdout).trim();
    } catch {
      throw gitMutationError("GIT_REF_CHANGED");
    }
    if (!ref.startsWith("refs/heads/") || /[\u0000\r\n]/u.test(ref)) {
      throw gitMutationError("GIT_REF_CHANGED");
    }
  } else if (symbolic.stdout.length !== 0) {
    throw gitMutationError("GIT_REF_CHANGED");
  }
  const oid = (await runGitRequired(
    context.options.executor,
    repository,
    ["rev-parse", "--verify", "HEAD"],
    { stdoutLimitBytes: 256 }
  )).stdout.toString("ascii").trim();
  const width = repository.objectFormat === "sha1" ? 40 : 64;
  if (!new RegExp(`^[a-f0-9]{${width}}$`, "u").test(oid)) throw gitMutationError("GIT_REF_CHANGED");
  return { ref, oid };
}

function assertHeadStable(expected: BoundHeadV4, current: BoundHeadV4): void {
  if (expected.ref !== current.ref || expected.oid !== current.oid) {
    throw gitMutationError("GIT_REF_CHANGED");
  }
}

async function indexEntries(
  context: GitMutationContextV4,
  repository: GitRepositoryIdentity,
  privateIndexPath?: string,
  objectDirectoryPath?: string
): Promise<Map<string, BoundIndexEntryV4>> {
  const listed = await runGitRequired(
    context.options.executor,
    repository,
    ["ls-files", "--stage", "-z", "--"],
    {
      privateIndexPath,
      objectDirectoryPath,
      stdoutLimitBytes: 8 * 1024 * 1024
    }
  );
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(listed.stdout);
  } catch {
    throw gitMutationError("GIT_INDEX_CHANGED");
  }
  const entries = new Map<string, BoundIndexEntryV4>();
  for (const record of text.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t(.+)$/u.exec(record);
    if (!match || entries.has(match[3])) throw gitMutationError("GIT_UNMERGED");
    entries.set(match[3], {
      mode: match[1] as "100644" | "100755",
      oid: match[2],
      stage: 0,
      path: match[3]
    });
  }
  return entries;
}

function assertUnselectedIndexStable(
  before: ReadonlyMap<string, BoundIndexEntryV4>,
  after: ReadonlyMap<string, BoundIndexEntryV4>,
  selected: ReadonlySet<string>
): void {
  const all = new Set([...before.keys(), ...after.keys()]);
  for (const relPath of all) {
    if (selected.has(relPath)) continue;
    const left = before.get(relPath);
    const right = after.get(relPath);
    if (
      !left ||
      !right ||
      left.mode !== right.mode ||
      left.oid !== right.oid ||
      left.stage !== right.stage
    ) throw gitMutationError("GIT_INDEX_CHANGED");
  }
}

async function scanApprovedIndexBlobs(
  context: GitMutationContextV4,
  repository: GitRepositoryIdentity,
  entries: ReadonlyMap<string, BoundIndexEntryV4>,
  paths: readonly string[],
  objectDirectoryPath: string
): Promise<string[]> {
  let total = 0;
  const objectIds: string[] = [];
  for (const relPath of paths) {
    const entry = entries.get(relPath);
    if (!entry) continue;
    const blob = await runGitRequired(
      context.options.executor,
      repository,
      ["cat-file", "blob", entry.oid],
      { objectDirectoryPath, stdoutLimitBytes: 16 * 1024 * 1024 }
    );
    total += blob.stdout.length;
    if (total > 32 * 1024 * 1024) throw gitMutationError("GIT_SCAN_LIMIT");
    if (hasSecretValue(blob.stdout.toString("latin1"))) throw gitMutationError("GIT_SECRET_BLOCKED");
    objectIds.push(entry.oid);
  }
  return [...new Set(objectIds)].sort();
}

export class GitIndexServiceV4 {
  constructor(
    readonly context: GitMutationContextV4,
    readonly indexTokens: GitIndexTokenServiceV4,
    private readonly hooks: {
      beforeIndexInstall?: () => void | Promise<void>;
      integrationGate?: GitIntegrationGateV4;
    } = {}
  ) {}

  async stage(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    paths: readonly string[];
  }): Promise<{
    repository_id: string;
    old_index_tree_oid: string;
    new_index_tree_oid: string;
    staged: Array<{
      path: string;
      change: "added" | "modified" | "deleted";
      old_path: null;
      binary: boolean;
      additions: null;
      deletions: null;
    }>;
    index_token: string;
    normalization: "raw_git_blobs";
    repository_integrations: "disabled";
    execution_isolation: "none";
  }> {
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken,
      paths: input.paths
    });
    const repository = verified.repository;
    if (repository.sparseCheckout) throw gitMutationError("GIT_SPARSE_CHECKOUT_UNSUPPORTED");
    if (repository.splitIndex) throw gitMutationError("GIT_SPLIT_INDEX_UNSUPPORTED");
    await assertRawGitNormalizationV4({
      executor: this.context.options.executor,
      repository,
      paths: input.paths
    });
    const stagedPaths = await scanPaths(this.context, repository, input.workspace, input.guard, input.paths);
    const oldTree = (await runGitRequired(
      this.context.options.executor,
      repository,
      ["write-tree"],
      { stdoutLimitBytes: 256 }
    )).stdout.toString("ascii").trim();
    const initialHead = await boundHead(this.context, repository);
    const headOid = initialHead.oid;
    const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-index");
    if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
    const privateIndex = path.join(privateRoot, "index");
    const liveIndex = path.join(repository.gitDir, "index");
    try {
      const initialIndex = await fileDigest(liveIndex);
      await fsp.writeFile(privateIndex, initialIndex.content, { flag: "wx", mode: 0o600 });
      for (const entry of stagedPaths) {
        if (!entry.exists) {
          await runGitRequired(
            this.context.options.executor,
            repository,
            ["update-index", "--force-remove", "--", entry.path],
            { privateIndexPath: privateIndex }
          );
          continue;
        }
        const object = await runGitRequired(
          this.context.options.executor,
          repository,
          ["hash-object", "-w", "--stdin", "--no-filters"],
          { stdin: entry.content!, stdoutLimitBytes: 256 }
        );
        const oid = object.stdout.toString("ascii").trim();
        await runGitRequired(
          this.context.options.executor,
          repository,
          ["update-index", "--add", "--cacheinfo", `${entry.mode},${oid},${entry.path}`],
          { privateIndexPath: privateIndex }
        );
      }
      const newTree = (await runGitRequired(
        this.context.options.executor,
        repository,
        ["write-tree"],
        { privateIndexPath: privateIndex, stdoutLimitBytes: 256 }
      )).stdout.toString("ascii").trim();
      if (newTree === oldTree) throw gitMutationError("GIT_STATE_CHANGED");
      await this.hooks.beforeIndexInstall?.();
      assertHeadStable(initialHead, await boundHead(this.context, repository));
      const currentIndex = await fileDigest(liveIndex);
      if (currentIndex.identity !== initialIndex.identity) throw gitMutationError("GIT_INDEX_CHANGED");
      await replaceLiveIndexV4({
        liveIndex,
        preparedIndex: privateIndex,
        expectedIdentity: initialIndex.identity
      });
      const changes = stagedPaths.map((entry) => ({
        path: entry.path,
        change: (!entry.exists ? "deleted" : entry.previouslyTracked ? "modified" : "added") as "added" | "modified" | "deleted",
        old_path: null,
        binary: entry.content?.includes(0) ?? false,
        additions: null,
        deletions: null
      }));
      const refreshedRepository = await this.context.admitWorkspace(input.workspace);
      const indexToken = this.indexTokens.mint({
        repositoryId: refreshedRepository.repositoryId,
        workspaceId: input.workspace.id,
        capabilityRevision: refreshedRepository.capabilityRevision,
        repositoryFingerprint: refreshedRepository.repositoryFingerprint,
        headOid,
        indexTreeOid: newTree
      });
      return {
        repository_id: repository.repositoryId,
        old_index_tree_oid: oldTree,
        new_index_tree_oid: newTree,
        staged: changes,
        index_token: indexToken,
        normalization: "raw_git_blobs",
        repository_integrations: "disabled",
        execution_isolation: "none"
      };
    } finally {
      await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
    }
  }

  async stageApproved(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    paths: readonly string[];
    integrationReviewToken: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }): Promise<{
    repository_id: string;
    old_index_tree_oid: string;
    new_index_tree_oid: string;
    staged: Array<{
      path: string;
      change: "added" | "modified" | "deleted";
      old_path: null;
      binary: boolean;
      additions: null;
      deletions: null;
    }>;
    index_token: string;
    normalization: "approved_full_access";
    repository_integrations: "approved_full_access";
    execution_isolation: "none";
  }> {
    const gate = this.hooks.integrationGate;
    if (!gate?.enabled) throw gitMutationError("GIT_INTEGRATION_REQUIRED");
    const reviewed = gate.inspect(input.integrationReviewToken);
    const stateFacts = this.context.options.stateTokens.inspect(input.stateToken);
    if (
      reviewed.workspaceId !== input.workspace.id ||
      reviewed.repositoryId !== stateFacts.repositoryId
    ) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken,
      paths: input.paths
    });
    const repository = verified.repository;
    if (repository.sparseCheckout) throw gitMutationError("GIT_SPARSE_CHECKOUT_UNSUPPORTED");
    if (repository.splitIndex) throw gitMutationError("GIT_SPLIT_INDEX_UNSUPPORTED");
    const selected = new Set(input.paths);
    const stagedPaths = await scanPaths(this.context, repository, input.workspace, input.guard, input.paths);
    const oldTree = (await runGitRequired(
      this.context.options.executor,
      repository,
      ["write-tree"],
      { stdoutLimitBytes: 256 }
    )).stdout.toString("ascii").trim();
    const initialHead = await boundHead(this.context, repository);
    const headOid = initialHead.oid;
    const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-integration-stage");
    if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
    const privateIndex = path.join(privateRoot, "index");
    const quarantineRoot = path.join(privateRoot, "objects");
    const liveIndex = path.join(repository.gitDir, "index");
    try {
      const initialIndex = await fileDigest(liveIndex);
      const beforeEntries = await indexEntries(this.context, repository);
      await fsp.writeFile(privateIndex, initialIndex.content, { flag: "wx", mode: 0o600 });
      await fsp.mkdir(quarantineRoot, { mode: 0o700 });
      const executed = await gate.execute({
        workspaceId: input.workspace.id,
        repository,
        reviewToken: input.integrationReviewToken,
        authorization: input.authorization,
        semanticStateDigest: reviewed.semanticStateDigest,
        expectedToolName: "git_stage",
        expectedCanonicalAction: "stage",
        request: {
          operation: "stage",
          paths: input.paths,
          privateIndexPath: privateIndex,
          objectDirectoryPath: quarantineRoot
        }
      });
      if (
        executed.result.status !== 0 ||
        executed.result.timedOut ||
        executed.result.stdoutTruncated ||
        executed.result.stderrTruncated
      ) throw gitMutationError("GIT_COMMAND_FAILED");
      const afterEntries = await indexEntries(
        this.context,
        repository,
        privateIndex,
        quarantineRoot
      );
      assertUnselectedIndexStable(beforeEntries, afterEntries, selected);
      const objectIds = await scanApprovedIndexBlobs(
        this.context,
        repository,
        afterEntries,
        input.paths,
        quarantineRoot
      );
      const newTree = (await runGitRequired(
        this.context.options.executor,
        repository,
        ["write-tree"],
        { privateIndexPath: privateIndex, objectDirectoryPath: quarantineRoot, stdoutLimitBytes: 256 }
      )).stdout.toString("ascii").trim();
      if (newTree === oldTree) throw gitMutationError("GIT_STATE_CHANGED");
      const rescanned = await scanPaths(this.context, repository, input.workspace, input.guard, input.paths);
      if (rescanned.some((entry, index) =>
        entry.path !== stagedPaths[index]?.path ||
        entry.identity !== stagedPaths[index]?.identity ||
        entry.exists !== stagedPaths[index]?.exists
      )) throw gitMutationError("GIT_STATE_CHANGED");
      assertHeadStable(initialHead, await boundHead(this.context, repository));
      if (objectIds.length > 0) {
        await new GitObjectQuarantine({ journal: () => undefined }).promote({
          repository,
          quarantineRoot,
          objects: objectIds.map((oid) => ({ oid }))
        });
      }
      await this.hooks.beforeIndexInstall?.();
      assertHeadStable(initialHead, await boundHead(this.context, repository));
      if ((await fileDigest(liveIndex)).identity !== initialIndex.identity) {
        throw gitMutationError("GIT_INDEX_CHANGED");
      }
      await replaceLiveIndexV4({
        liveIndex,
        preparedIndex: privateIndex,
        expectedIdentity: initialIndex.identity
      });
      const refreshedRepository = await this.context.admitWorkspace(input.workspace);
      const indexToken = this.indexTokens.mint({
        repositoryId: refreshedRepository.repositoryId,
        workspaceId: input.workspace.id,
        capabilityRevision: refreshedRepository.capabilityRevision,
        repositoryFingerprint: refreshedRepository.repositoryFingerprint,
        headOid,
        indexTreeOid: newTree
      });
      return {
        repository_id: repository.repositoryId,
        old_index_tree_oid: oldTree,
        new_index_tree_oid: newTree,
        staged: stagedPaths.map((entry) => ({
          path: entry.path,
          change: (!entry.exists ? "deleted" : entry.previouslyTracked ? "modified" : "added") as "added" | "modified" | "deleted",
          old_path: null,
          binary: afterEntries.has(entry.path) && (entry.content?.includes(0) ?? false),
          additions: null,
          deletions: null
        })),
        index_token: indexToken,
        normalization: "approved_full_access",
        repository_integrations: "approved_full_access",
        execution_isolation: "none"
      };
    } finally {
      await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
    }
  }
}

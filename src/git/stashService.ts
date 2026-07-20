import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import { admitGitRepository } from "./repositoryIdentity.js";
import { GitMutationContextV4, gitMutationError, runGitRequired, sha256Git } from "./mutationContext.js";
import type { GitReviewTokenServiceV4 } from "./reviewToken.js";
import { gitIndexIdentityV4, replaceLiveIndexV4 } from "./privateIndex.js";
import { DurableOpaqueRecordStoreV4 } from "./opaqueRecordStore.js";
import type { GitFileMutationV4, GitFileTransactionV4 } from "./fileTransaction.js";

interface StashEntryV4 {
  path: string;
  index: { mode: string; oid: string } | null;
  worktreeExisted: boolean;
  worktreeContent: string;
  head: { mode: string; oid: string } | null;
}

interface PrivateStashV4 {
  stashId: string;
  repositoryId: string;
  repositoryIdentityFingerprint: string;
  ownerFingerprint: string;
  taskWorktreeId: null;
  baseOid: string;
  ref: string;
  refOid: string;
  entries: StashEntryV4[];
  byteCount: number;
  createdAt: string;
}

interface CreateReviewV4 {
  workspaceId: string;
  repositoryId: string;
  repositoryFingerprint: string;
  baseOid: string;
  entries: StashEntryV4[];
  byteCount: number;
}

interface ApplyReviewV4 {
  workspaceId: string;
  repositoryId: string;
  repositoryFingerprint: string;
  stashId: string;
  baseOid: string;
  entries: StashEntryV4[];
  resultEntries: StashEntryV4[];
}

interface ForgetReviewV4 {
  workspaceId: string;
  repositoryId: string;
  stashId: string;
  expectedOid: string;
}

function parseEntry(value: Buffer, source: "tree" | "index"): { mode: string; oid: string } | null {
  if (value.length === 0) return null;
  const match = source === "tree"
    ? /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/.exec(value.toString("utf8"))
    : /^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t/.exec(value.toString("utf8"));
  if (!match) throw gitMutationError("GIT_UNMERGED");
  return { mode: match[1], oid: match[2] };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeValue<T>(base: T, current: T, stashed: T): T {
  if (sameValue(current, base)) return stashed;
  if (sameValue(stashed, base) || sameValue(current, stashed)) return current;
  throw gitMutationError("MERGE_CONFLICT");
}

async function gitEntry(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  source: "tree" | "index",
  relPath: string
) {
  const args = source === "tree"
    ? ["ls-tree", "-z", "HEAD", "--", relPath]
    : ["ls-files", "--stage", "-z", "--", relPath];
  const result = await context.options.executor.run(repository, args, { stdoutLimitBytes: 4096 });
  if (result.status !== 0 || result.timedOut || result.stdoutTruncated || result.stderrTruncated) {
    throw gitMutationError("GIT_STATE_CHANGED");
  }
  return parseEntry(result.stdout, source);
}

async function blob(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  oid: string
): Promise<Buffer> {
  const result = await runGitRequired(context.options.executor, repository, ["cat-file", "blob", oid], {
    stdoutLimitBytes: 16 * 1024 * 1024
  });
  if (hasSecretValue(result.stdout.toString("latin1"))) throw gitMutationError("GIT_SECRET_BLOCKED");
  return result.stdout;
}

async function ascii(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  args: string[]
) {
  return (await runGitRequired(context.options.executor, repository, args, { stdoutLimitBytes: 512 })).stdout.toString("utf8").trim();
}

async function identity(context: GitMutationContextV4, repository: Awaited<ReturnType<typeof admitGitRepository>>) {
  const read = async (key: string) => {
    const result = await context.options.executor.run(repository, ["config", "--local", "--no-includes", "--get", key], {
      stdoutLimitBytes: 1024
    });
    const value = result.stdout.toString("utf8").trim();
    if (result.status !== 0 || !value || /[\u0000\r\n]/u.test(value) || hasSecretValue(value)) {
      throw gitMutationError("GIT_IDENTITY_REQUIRED");
    }
    return value;
  };
  return { name: await read("user.name"), email: await read("user.email") };
}

export class GitStashServiceV4 {
  readonly #stashes = new Map<string, PrivateStashV4>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;

  constructor(
    readonly context: GitMutationContextV4,
    readonly reviews: GitReviewTokenServiceV4,
    readonly fileTransactions: GitFileTransactionV4,
    private readonly now: () => number = Date.now,
    private readonly options: {
      stateRoot?: string;
      masterKey?: Buffer;
      ownerFingerprint?: () => string;
    } = {}
  ) {
    this.#durable = options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "private-stashes",
          now,
          maxCiphertextCharacters: 64_000_000,
          maxPlaintextBytes: 48_000_000
        })
      : null;
  }

  async list(input: { workspace: Workspace }) {
    const repository = await this.context.admitWorkspace(input.workspace);
    const stashes = this.#allStashes()
      .filter((stash) =>
        stash.ownerFingerprint === this.#ownerFingerprint() &&
        stash.repositoryIdentityFingerprint === repository.stableIdentityFingerprint
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((stash) => ({
        stash_id: stash.stashId,
        task_worktree_id: stash.taskWorktreeId,
        path_count: stash.entries.length,
        byte_count: stash.byteCount,
        created_at: stash.createdAt
      }));
    return {
      action: "list" as const,
      repository_id: repository.repositoryId,
      stashes,
      truncated: false
    };
  }

  async prepareCreate(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    paths: readonly string[];
  }) {
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken,
      paths: input.paths
    });
    const repository = verified.repository;
    if (
      this.#retainedStashCount(
        this.#ownerFingerprint(),
        repository.stableIdentityFingerprint
      ) >= 64
    ) throw gitMutationError("GIT_SCAN_LIMIT");
    const baseOid = await ascii(this.context, repository, ["rev-parse", "--verify", "HEAD"]);
    const entries: StashEntryV4[] = [];
    let byteCount = 0;
    for (const relPath of input.paths) {
      if (input.guard.isBlockedRelativePath(relPath) || hasSecretValue(relPath)) throw gitMutationError("GIT_PATH_BLOCKED");
      const index = await gitEntry(this.context, repository, "index", relPath);
      const head = await gitEntry(this.context, repository, "tree", relPath);
      const absPath = path.resolve(input.workspace.root, ...relPath.split("/"));
      const worktree = await fsp.readFile(absPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw gitMutationError("GIT_PATH_BLOCKED");
      });
      if (worktree && hasSecretValue(worktree.toString("latin1"))) throw gitMutationError("GIT_SECRET_BLOCKED");
      byteCount += worktree?.length ?? 0;
      entries.push({
        path: relPath,
        index,
        worktreeExisted: worktree !== null,
        worktreeContent: (worktree ?? Buffer.alloc(0)).toString("base64"),
        head
      });
    }
    const reviewToken = this.reviews.mint<CreateReviewV4>("stash_create", {
      workspaceId: input.workspace.id,
      repositoryId: repository.repositoryId,
      repositoryFingerprint: repository.repositoryFingerprint,
      baseOid,
      entries,
      byteCount
    });
    return {
      action: "prepare_create" as const,
      repository_id: repository.repositoryId,
      review_token: reviewToken,
      path_count: entries.length,
      byte_count: byteCount,
      complete_rollback_retained: true as const,
      normalization: "raw_git_blobs" as const
    };
  }

  async executeCreate(input: { workspace: Workspace; guard: PathGuard; reviewToken: string }) {
    const review = this.reviews.inspect<CreateReviewV4>(input.reviewToken, "stash_create");
    if (review.workspaceId !== input.workspace.id) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const repository = await this.context.admitWorkspace(input.workspace);
    if (
      repository.repositoryId !== review.repositoryId ||
      repository.repositoryFingerprint !== review.repositoryFingerprint ||
      await ascii(this.context, repository, ["rev-parse", "--verify", "HEAD"]) !== review.baseOid
    ) throw gitMutationError("GIT_STATE_CHANGED");
    await this.#revalidateEntries(input.workspace, repository, review.entries);
    const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-stash-create");
    if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
    try {
    const stashIndex = path.join(privateRoot, "stash-index");
    const resetIndex = path.join(privateRoot, "reset-index");
    const liveIndex = path.join(repository.gitDir, "index");
    const liveIndexContent = await fsp.readFile(liveIndex);
    const liveIndexIdentity = await gitIndexIdentityV4(liveIndex);
    await runGitRequired(this.context.options.executor, repository, ["read-tree", review.baseOid], {
      privateIndexPath: stashIndex
    });
    for (const entry of review.entries) {
      if (entry.index) {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--add", "--cacheinfo", `${entry.index.mode},${entry.index.oid},${entry.path}`
        ], { privateIndexPath: stashIndex });
      } else {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--force-remove", "--", entry.path
        ], { privateIndexPath: stashIndex });
      }
    }
    const privateTree = await runGitRequired(this.context.options.executor, repository, ["write-tree"], {
      privateIndexPath: stashIndex,
      stdoutLimitBytes: 256
    });
    const selectedTreeOid = privateTree.stdout.toString("ascii").trim();
    const localIdentity = await identity(this.context, repository);
    const commit = await runGitRequired(this.context.options.executor, repository, [
      "commit-tree", selectedTreeOid, "-p", review.baseOid
    ], {
      stdin: Buffer.from("CodexGPT private stash\n", "utf8"),
      identity: {
        authorName: localIdentity.name,
        authorEmail: localIdentity.email,
        committerName: localIdentity.name,
        committerEmail: localIdentity.email
      },
      stdoutLimitBytes: 256
    });
    const refOid = commit.stdout.toString("ascii").trim();
    const stashId = `stash_${randomBytes(16).toString("hex")}`;
    const ref = `refs/codexgpt/stash/${stashId.slice(6)}`;
    const zero = "0".repeat(refOid.length);
    await fsp.writeFile(resetIndex, liveIndexContent);
    for (const entry of review.entries) {
      if (entry.head) {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--add", "--cacheinfo", `${entry.head.mode},${entry.head.oid},${entry.path}`
        ], { privateIndexPath: resetIndex });
      } else {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--force-remove", "--", entry.path
        ], { privateIndexPath: resetIndex });
      }
    }
    const operations: GitFileMutationV4[] = [];
    for (const entry of review.entries) {
      const oldBytes = Buffer.from(entry.worktreeContent, "base64");
      if (entry.head) {
        const bytes = await blob(this.context, repository, entry.head.oid);
        operations.push(entry.worktreeExisted
          ? { kind: "replace", path: entry.path, bytes, expectedSha256: sha256Git(oldBytes) }
          : { kind: "create", path: entry.path, bytes });
      } else if (entry.worktreeExisted) {
        operations.push({ kind: "delete", path: entry.path, expectedSha256: sha256Git(oldBytes) });
      }
    }
    let refUpdated = false;
    let indexUpdated = false;
    const createdAt = new Date(this.now()).toISOString();
    const stash: PrivateStashV4 = {
      stashId,
      repositoryId: repository.repositoryId,
      repositoryIdentityFingerprint: repository.stableIdentityFingerprint,
      ownerFingerprint: this.#ownerFingerprint(),
      taskWorktreeId: null,
      baseOid: review.baseOid,
      ref,
      refOid,
      entries: review.entries,
      byteCount: review.byteCount,
      createdAt
    };
    await this.fileTransactions.run({
      workspace: input.workspace,
      operations,
      commitGitState: async () => {
        try {
          await replaceLiveIndexV4({ liveIndex, preparedIndex: resetIndex, expectedIdentity: liveIndexIdentity });
          indexUpdated = true;
          const update = await this.context.options.executor.run(repository, ["update-ref", "--no-deref", ref, refOid, zero]);
          if (update.status !== 0) throw gitMutationError("GIT_REF_CHANGED");
          refUpdated = true;
          this.#setStash(stash);
        } catch (error) {
          if (refUpdated) {
            await this.context.options.executor.run(repository, ["update-ref", "--no-deref", "-d", ref, refOid]).catch(() => undefined);
          }
          if (indexUpdated) {
            const undoIndex = path.join(privateRoot, "undo-index");
            await fsp.writeFile(undoIndex, liveIndexContent);
            await replaceLiveIndexV4({
              liveIndex,
              preparedIndex: undoIndex,
              expectedIdentity: await gitIndexIdentityV4(liveIndex)
            }).catch(() => undefined);
          }
          throw error;
        }
        return null;
      }
    });
    this.reviews.consume<CreateReviewV4>(input.reviewToken, "stash_create");
    return {
      action: "execute_create" as const,
      repository_id: repository.repositoryId,
      stash_id: stashId,
      state_token: await this.context.refreshState({ workspace: input.workspace, guard: input.guard }),
      retained: true as const
    };
    } finally {
      await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
    }
  }

  async prepareApply(input: {
    workspace: Workspace;
    guard: PathGuard;
    stashId: string;
    stateToken: string;
  }) {
    const owned = await this.#ownedStash(input.workspace, input.stashId);
    const stash = owned.stash;
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken,
      paths: stash.entries.map((entry) => entry.path)
    });
    if (
      verified.repository.stableIdentityFingerprint !== stash.repositoryIdentityFingerprint ||
      await ascii(this.context, verified.repository, ["rev-parse", "--verify", "HEAD"]) !== stash.baseOid
    ) throw gitMutationError("GIT_STATE_CHANGED");
    const currentEntries: StashEntryV4[] = [];
    const resultEntries: StashEntryV4[] = [];
    for (const entry of stash.entries) {
      const abs = path.resolve(input.workspace.root, ...entry.path.split("/"));
      const current = await fsp.readFile(abs).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      const currentEntry: StashEntryV4 = {
        path: entry.path,
        index: await gitEntry(this.context, verified.repository, "index", entry.path),
        worktreeExisted: current !== null,
        worktreeContent: (current ?? Buffer.alloc(0)).toString("base64"),
        head: await gitEntry(this.context, verified.repository, "tree", entry.path)
      };
      currentEntries.push(currentEntry);
      const baseContent = entry.head
        ? (await blob(this.context, verified.repository, entry.head.oid)).toString("base64")
        : "";
      const mergedWorktree = mergeValue(
        { existed: entry.head !== null, content: baseContent },
        { existed: currentEntry.worktreeExisted, content: currentEntry.worktreeContent },
        { existed: entry.worktreeExisted, content: entry.worktreeContent }
      );
      resultEntries.push({
        path: entry.path,
        index: mergeValue(entry.head, currentEntry.index, entry.index),
        worktreeExisted: mergedWorktree.existed,
        worktreeContent: mergedWorktree.content,
        head: entry.head
      });
    }
    const reviewToken = this.reviews.mint<ApplyReviewV4>("stash_apply", {
      workspaceId: input.workspace.id,
      repositoryId: verified.repository.repositoryId,
      repositoryFingerprint: verified.repository.repositoryFingerprint,
      stashId: stash.stashId,
      baseOid: stash.baseOid,
      entries: currentEntries,
      resultEntries
    });
    return {
      action: "prepare_apply" as const,
      repository_id: verified.repository.repositoryId,
      review_token: reviewToken,
      stash_id: stash.stashId,
      path_count: stash.entries.length,
      byte_count: stash.byteCount,
      complete_rollback_retained: true as const,
      conflict_free: true as const,
      normalization: "raw_git_blobs" as const
    };
  }

  async executeApply(input: { workspace: Workspace; guard: PathGuard; reviewToken: string }) {
    const review = this.reviews.inspect<ApplyReviewV4>(input.reviewToken, "stash_apply");
    const owned = await this.#ownedStash(input.workspace, review.stashId);
    const stash = owned.stash;
    const repository = owned.repository;
    if (
      repository.repositoryId !== review.repositoryId ||
      repository.repositoryFingerprint !== review.repositoryFingerprint ||
      await ascii(this.context, repository, ["rev-parse", "--verify", "HEAD"]) !== review.baseOid
    ) throw gitMutationError("GIT_STATE_CHANGED");
    await this.#revalidateEntries(input.workspace, repository, review.entries);
    const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-stash-apply");
    if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
    try {
    const liveIndex = path.join(repository.gitDir, "index");
    const liveIndexContent = await fsp.readFile(liveIndex);
    const liveIndexIdentity = await gitIndexIdentityV4(liveIndex);
    const applyIndex = path.join(privateRoot, "apply-index");
    await fsp.writeFile(applyIndex, liveIndexContent);
    for (const entry of review.resultEntries) {
      if (entry.index) {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--add", "--cacheinfo", `${entry.index.mode},${entry.index.oid},${entry.path}`
        ], { privateIndexPath: applyIndex });
      } else {
        await runGitRequired(this.context.options.executor, repository, [
          "update-index", "--force-remove", "--", entry.path
        ], { privateIndexPath: applyIndex });
      }
    }
    const normalizedOperations: GitFileMutationV4[] = [];
    for (const entry of review.resultEntries) {
      const abs = path.resolve(input.workspace.root, ...entry.path.split("/"));
      const current = await fsp.readFile(abs).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
      const bytes = Buffer.from(entry.worktreeContent, "base64");
      if (entry.worktreeExisted) {
        normalizedOperations.push(current
          ? { kind: "replace", path: entry.path, bytes, expectedSha256: sha256Git(current) }
          : { kind: "create", path: entry.path, bytes });
      } else if (current) {
        normalizedOperations.push({ kind: "delete", path: entry.path, expectedSha256: sha256Git(current) });
      }
    }
    await this.fileTransactions.run({
      workspace: input.workspace,
      operations: normalizedOperations,
      commitGitState: async () => {
        await replaceLiveIndexV4({ liveIndex, preparedIndex: applyIndex, expectedIdentity: liveIndexIdentity });
        return null;
      }
    });
    this.reviews.consume<ApplyReviewV4>(input.reviewToken, "stash_apply");
    return {
      action: "execute_apply" as const,
      repository_id: repository.repositoryId,
      stash_id: stash.stashId,
      state_token: await this.context.refreshState({ workspace: input.workspace, guard: input.guard }),
      retained: true as const
    };
    } finally {
      await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
    }
  }

  async prepareForget(input: { workspace: Workspace; stashId: string }) {
    const owned = await this.#ownedStash(input.workspace, input.stashId);
    const stash = owned.stash;
    const repository = owned.repository;
    const reviewToken = this.reviews.mint<ForgetReviewV4>("stash_forget", {
      workspaceId: input.workspace.id,
      repositoryId: repository.repositoryId,
      stashId: stash.stashId,
      expectedOid: stash.refOid
    });
    return {
      action: "prepare_forget" as const,
      repository_id: repository.repositoryId,
      review_token: reviewToken,
      stash_id: stash.stashId,
      expected_oid: stash.refOid,
      created_at: stash.createdAt,
      age_seconds: Math.max(0, Math.floor((this.now() - Date.parse(stash.createdAt)) / 1000)),
      path_count: stash.entries.length,
      byte_count: stash.byteCount,
      rollback_cas_retained: true as const
    };
  }

  describeStash(_workspaceId: string, stashId: string): { repositoryId: string; refOid: string } {
    const stash = this.#getStash(stashId);
    if (!stash || stash.ownerFingerprint !== this.#ownerFingerprint()) {
      throw gitMutationError("TASK_WORKTREE_NOT_FOUND");
    }
    return { repositoryId: stash.repositoryId, refOid: stash.refOid };
  }

  async executeForget(input: { workspace: Workspace; reviewToken: string }) {
    const review = this.reviews.inspect<ForgetReviewV4>(input.reviewToken, "stash_forget");
    const owned = await this.#ownedStash(input.workspace, review.stashId);
    const stash = owned.stash;
    const repository = owned.repository;
    if (stash.refOid !== review.expectedOid) throw gitMutationError("GIT_REF_CHANGED");
    if (repository.repositoryId !== review.repositoryId) throw gitMutationError("GIT_STATE_CHANGED");
    const result = await this.context.options.executor.run(repository, [
      "update-ref", "--no-deref", "-d", stash.ref, stash.refOid
    ]);
    if (result.status !== 0) throw gitMutationError("GIT_REF_CHANGED");
    if (this.#durable) this.#durable.revoke(stash.stashId);
    else this.#stashes.delete(stash.stashId);
    this.reviews.consume<ForgetReviewV4>(input.reviewToken, "stash_forget");
    return {
      action: "execute_forget" as const,
      repository_id: repository.repositoryId,
      stash_id: stash.stashId,
      retained: false as const,
      gc_executed: false as const
    };
  }

  async #ownedStash(workspace: Workspace, stashId: string): Promise<{
    stash: PrivateStashV4;
    repository: Awaited<ReturnType<GitMutationContextV4["admitWorkspace"]>>;
  }> {
    const stash = this.#getStash(stashId);
    if (!stash || stash.ownerFingerprint !== this.#ownerFingerprint()) {
      throw gitMutationError("TASK_WORKTREE_NOT_FOUND");
    }
    const repository = await this.context.admitWorkspace(workspace);
    if (stash.repositoryIdentityFingerprint !== repository.stableIdentityFingerprint) {
      throw gitMutationError("TASK_WORKTREE_NOT_FOUND");
    }
    return { stash, repository };
  }

  async #revalidateEntries(
    workspace: Workspace,
    repository: Awaited<ReturnType<typeof admitGitRepository>>,
    entries: readonly StashEntryV4[]
  ): Promise<void> {
    for (const entry of entries) {
      const currentIndex = await gitEntry(this.context, repository, "index", entry.path);
      const currentHead = await gitEntry(this.context, repository, "tree", entry.path);
      const abs = path.resolve(workspace.root, ...entry.path.split("/"));
      const stat = await fsp.lstat(abs, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n)) throw gitMutationError("GIT_STATE_CHANGED");
      const content = stat ? await fsp.readFile(abs) : null;
      if (
        JSON.stringify(currentIndex) !== JSON.stringify(entry.index) ||
        JSON.stringify(currentHead) !== JSON.stringify(entry.head) ||
        (content !== null) !== entry.worktreeExisted ||
        (content && content.toString("base64") !== entry.worktreeContent)
      ) throw gitMutationError("GIT_STATE_CHANGED");
    }
  }

  #getStash(stashId: string): PrivateStashV4 | undefined {
    try {
      if (!this.#durable) return this.#stashes.get(stashId);
      return this.#durable.list<PrivateStashV4>("private_stash", {
        includeExpired: true
      }).find((entry) => entry.recordId === stashId)?.value;
    } catch (error) {
      if ((error as Error).message === "GIT_RECOVERY_REQUIRED") throw error;
      return undefined;
    }
  }

  #setStash(stash: PrivateStashV4): void {
    if (this.#durable) {
      this.#durable.put({
        recordId: stash.stashId,
        kind: "private_stash",
        value: stash,
        expiresAt: this.now() + 365 * 24 * 60 * 60_000
      });
    } else {
      this.#stashes.set(stash.stashId, stash);
    }
  }

  #allStashes(): PrivateStashV4[] {
    return this.#durable
      ? this.#durable.list<PrivateStashV4>("private_stash", { includeExpired: true })
          .map((entry) => entry.value)
      : [...this.#stashes.values()];
  }

  #retainedStashCount(ownerFingerprint: string, repositoryIdentityFingerprint: string): number {
    return this.#allStashes().filter((stash) =>
      stash.ownerFingerprint === ownerFingerprint &&
      stash.repositoryIdentityFingerprint === repositoryIdentityFingerprint
    ).length;
  }

  #ownerFingerprint(): string {
    const value = this.options.ownerFingerprint?.() ?? sha256Git("git-stash-default-owner-v1");
    if (!/^[a-f0-9]{64}$/u.test(value)) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    return value;
  }

  dispose(): void {
    this.#stashes.clear();
    this.#durable?.dispose();
  }
}

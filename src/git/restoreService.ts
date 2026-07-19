import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import { admitGitRepository } from "./repositoryIdentity.js";
import { GitMutationContextV4, gitMutationError, runGitRequired, sha256Git } from "./mutationContext.js";
import type { GitReviewTokenServiceV4 } from "./reviewToken.js";
import { gitIndexIdentityV4, replaceLiveIndexV4 } from "./privateIndex.js";
import type { GitFileTransactionV4, GitFileMutationV4 } from "./fileTransaction.js";

type RestoreMode = "index_from_head" | "worktree_from_index";

interface RestoreReviewV4 {
  workspaceId: string;
  repositoryId: string;
  repositoryFingerprint: string;
  mode: RestoreMode;
  paths: string[];
  headOid: string;
  indexTreeOid: string;
  worktreeUndo: Array<{ path: string; existed: boolean; content: string; digest: string }>;
}

async function asciiOid(context: GitMutationContextV4, repository: Awaited<ReturnType<typeof admitGitRepository>>, args: string[]): Promise<string> {
  return (await runGitRequired(context.options.executor, repository, args, { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
}

async function indexEntry(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  source: "HEAD" | "index",
  relPath: string
): Promise<{ mode: string; oid: string } | null> {
  const args = source === "HEAD"
    ? ["ls-tree", "-z", "HEAD", "--", relPath]
    : ["ls-files", "--stage", "-z", "--", relPath];
  const result = await context.options.executor.run(repository, args, { stdoutLimitBytes: 4096 });
  if (result.status !== 0 || result.timedOut || result.stdoutTruncated || result.stderrTruncated) {
    throw gitMutationError("GIT_STATE_CHANGED");
  }
  if (result.stdout.length === 0) return null;
  const text = result.stdout.toString("utf8");
  const match = source === "HEAD"
    ? /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t/.exec(text)
    : /^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t/.exec(text);
  if (!match) throw gitMutationError("GIT_UNMERGED");
  return { mode: match[1], oid: match[2] };
}

async function safeBlob(
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

export class GitRestoreServiceV4 {
  constructor(
    readonly context: GitMutationContextV4,
    readonly reviews: GitReviewTokenServiceV4,
    readonly fileTransactions: GitFileTransactionV4
  ) {}

  async prepare(input: {
    workspace: Workspace;
    guard: PathGuard;
    stateToken: string;
    mode: RestoreMode;
    paths: readonly string[];
  }) {
    const verified = await this.context.verifyState({
      workspace: input.workspace,
      guard: input.guard,
      stateToken: input.stateToken,
      paths: input.paths
    });
    const repository = verified.repository;
    const headOid = await asciiOid(this.context, repository, ["rev-parse", "--verify", "HEAD"]);
    const indexTreeOid = await asciiOid(this.context, repository, ["write-tree"]);
    const worktreeUndo: RestoreReviewV4["worktreeUndo"] = [];
    let affectedBytes = 0;
    for (const relPath of input.paths) {
      if (input.guard.isBlockedRelativePath(relPath) || hasSecretValue(relPath)) throw gitMutationError("GIT_PATH_BLOCKED");
      if (input.mode === "worktree_from_index") {
        const entry = await indexEntry(this.context, repository, "index", relPath);
        if (!entry) throw gitMutationError("GIT_STATE_CHANGED");
        await safeBlob(this.context, repository, entry.oid);
        const absPath = path.resolve(input.workspace.root, ...relPath.split("/"));
        const existing = await fsp.readFile(absPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw gitMutationError("GIT_PATH_BLOCKED");
        });
        affectedBytes += existing?.length ?? 0;
        worktreeUndo.push({
          path: relPath,
          existed: existing !== null,
          content: (existing ?? Buffer.alloc(0)).toString("base64"),
          digest: sha256Git(existing ?? Buffer.alloc(0))
        });
      }
    }
    const review: RestoreReviewV4 = {
      workspaceId: input.workspace.id,
      repositoryId: repository.repositoryId,
      repositoryFingerprint: repository.repositoryFingerprint,
      mode: input.mode,
      paths: [...input.paths],
      headOid,
      indexTreeOid,
      worktreeUndo
    };
    const reviewToken = this.reviews.mint("restore", review);
    return {
      action: "prepare" as const,
      repository_id: repository.repositoryId,
      review_token: reviewToken,
      mode: input.mode,
      paths: [...input.paths],
      affected_path_count: input.paths.length,
      affected_bytes: affectedBytes,
      complete_undo_retained: true,
      loss_summary: input.mode === "index_from_head"
        ? "Selected staged entries will be restored from HEAD; worktree bytes remain unchanged."
        : "Selected worktree bytes will be restored from the current index; encrypted undo is retained."
    };
  }

  async execute(input: {
    workspace: Workspace;
    guard: PathGuard;
    reviewToken: string;
  }) {
    const review = this.reviews.inspect<RestoreReviewV4>(input.reviewToken, "restore");
    if (review.workspaceId !== input.workspace.id) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const repository = await this.context.admitWorkspace(input.workspace);
    if (
      repository.repositoryId !== review.repositoryId ||
      await asciiOid(this.context, repository, ["rev-parse", "--verify", "HEAD"]) !== review.headOid ||
      await asciiOid(this.context, repository, ["write-tree"]) !== review.indexTreeOid
    ) throw gitMutationError("GIT_STATE_CHANGED");
    for (const undo of review.worktreeUndo) {
      const current = await fsp.readFile(path.resolve(input.workspace.root, ...undo.path.split("/"))).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw gitMutationError("GIT_STATE_CHANGED");
        }
      );
      if (
        (current !== null) !== undo.existed ||
        sha256Git(current ?? Buffer.alloc(0)) !== undo.digest
      ) throw gitMutationError("GIT_STATE_CHANGED");
    }
    if (review.mode === "index_from_head") {
      const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-restore");
      if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
      const privateIndex = path.join(privateRoot, "index");
      const liveIndex = path.join(repository.gitDir, "index");
      try {
        const expectedIdentity = await gitIndexIdentityV4(liveIndex);
        await fsp.copyFile(liveIndex, privateIndex);
        for (const relPath of review.paths) {
          const entry = await indexEntry(this.context, repository, "HEAD", relPath);
          if (entry) {
            await runGitRequired(this.context.options.executor, repository, [
              "update-index", "--add", "--cacheinfo", `${entry.mode},${entry.oid},${relPath}`
            ], { privateIndexPath: privateIndex });
          } else {
            await runGitRequired(this.context.options.executor, repository, [
              "update-index", "--force-remove", "--", relPath
            ], { privateIndexPath: privateIndex });
          }
        }
        await replaceLiveIndexV4({ liveIndex, preparedIndex: privateIndex, expectedIdentity });
      } finally {
        await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
      }
    } else {
      const operations: GitFileMutationV4[] = [];
      for (const relPath of review.paths) {
        const entry = await indexEntry(this.context, repository, "index", relPath);
        if (!entry) throw gitMutationError("GIT_STATE_CHANGED");
        const content = await safeBlob(this.context, repository, entry.oid);
        const undo = review.worktreeUndo.find((item) => item.path === relPath);
        if (!undo) throw gitMutationError("GIT_STATE_CHANGED");
        operations.push(undo.existed
          ? { kind: "replace", path: relPath, bytes: content, expectedSha256: undo.digest }
          : { kind: "create", path: relPath, bytes: content });
      }
      await this.fileTransactions.run({ workspace: input.workspace, operations });
    }
    this.reviews.consume<RestoreReviewV4>(input.reviewToken, "restore");
    const stateToken = await this.context.refreshState({ workspace: input.workspace, guard: input.guard });
    return {
      action: "execute" as const,
      repository_id: repository.repositoryId,
      mode: review.mode,
      restored_paths: review.paths,
      state_token: stateToken
    };
  }
}

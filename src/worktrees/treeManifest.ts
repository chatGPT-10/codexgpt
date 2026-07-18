import type { PathGuard } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import type { GitCommandExecutor } from "../git/execution.js";
import type { GitRepositoryIdentity } from "../git/repositoryIdentity.js";
import { runGitRequired } from "../git/mutationContext.js";

export interface TaskTreeEntryV1 {
  path: string;
  kind: "blob" | "gitlink";
  mode: "100644" | "100755" | "160000";
  oid: string;
  size: number;
}

export interface TaskTreeManifestV1 {
  schemaVersion: 1;
  treeOid: string;
  entries: readonly TaskTreeEntryV1[];
  fileCount: number;
  totalBytes: number;
}

const UNSAFE_SEGMENT = /^(?:\.git|git~1|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

function validatePath(value: string, guard: PathGuard): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value) ||
    hasSecretValue(value) ||
    guard.isBlockedRelativePath(value)
  ) throw new Error("TASK_WORKTREE_TREE_UNSAFE");
  for (const segment of value.split("/")) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes(":") ||
      /[. ]$/u.test(segment) ||
      UNSAFE_SEGMENT.test(segment)
    ) throw new Error("TASK_WORKTREE_TREE_UNSAFE");
  }
}

export async function buildTaskTreeManifest(input: {
  executor: GitCommandExecutor;
  repository: GitRepositoryIdentity;
  treeish: string;
  guard: PathGuard;
  maxFiles: number;
  maxBytes: number;
  objectDirectoryPath?: string;
}): Promise<TaskTreeManifestV1> {
  const treeOid = (await runGitRequired(input.executor, input.repository, [
    "rev-parse", "--verify", `${input.treeish}^{tree}`
  ], {
    stdoutLimitBytes: 256,
    objectDirectoryPath: input.objectDirectoryPath
  })).stdout.toString("ascii").trim();
  const listing = await runGitRequired(input.executor, input.repository, [
    "ls-tree", "-r", "-z", "--full-tree", treeOid
  ], {
    stdoutLimitBytes: Math.min(64 * 1024 * 1024, Math.max(4096, input.maxFiles * 512)),
    objectDirectoryPath: input.objectDirectoryPath
  });
  const entries: TaskTreeEntryV1[] = [];
  const folded = new Set<string>();
  let totalBytes = 0;
  let listingText: string;
  try {
    listingText = new TextDecoder("utf-8", { fatal: true }).decode(listing.stdout);
  } catch {
    throw new Error("TASK_WORKTREE_TREE_UNSAFE");
  }
  for (const record of listingText.split("\0")) {
    if (!record) continue;
    const match = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/u.exec(record);
    if (!match || match[1] === "120000") throw new Error("TASK_WORKTREE_TREE_UNSAFE");
    const [, mode, type, oid, relativePath] = match;
    validatePath(relativePath, input.guard);
    const key = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    if (folded.has(key)) throw new Error("TASK_WORKTREE_TREE_UNSAFE");
    folded.add(key);
    if (entries.length >= input.maxFiles) throw new Error("GIT_SCAN_LIMIT");
    if (mode === "160000") {
      if (type !== "commit") throw new Error("TASK_WORKTREE_TREE_UNSAFE");
      entries.push({ path: relativePath, kind: "gitlink", mode, oid, size: 0 });
      continue;
    }
    if (type !== "blob") throw new Error("TASK_WORKTREE_TREE_UNSAFE");
    const sizeText = (await runGitRequired(input.executor, input.repository, [
      "cat-file", "-s", oid
    ], {
      stdoutLimitBytes: 64,
      objectDirectoryPath: input.objectDirectoryPath
    })).stdout.toString("ascii").trim();
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || size > 32 * 1024 * 1024) {
      throw new Error("GIT_SCAN_LIMIT");
    }
    totalBytes += size;
    if (totalBytes > input.maxBytes) throw new Error("GIT_SCAN_LIMIT");
    const content = await runGitRequired(input.executor, input.repository, [
      "cat-file", "blob", oid
    ], {
      stdoutLimitBytes: size + 1,
      objectDirectoryPath: input.objectDirectoryPath
    });
    if (content.stdout.length !== size || hasSecretValue(content.stdout.toString("latin1"))) {
      throw new Error("GIT_SECRET_BLOCKED");
    }
    entries.push({
      path: relativePath,
      kind: "blob",
      mode: mode as "100644" | "100755",
      oid,
      size
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    treeOid,
    entries: Object.freeze(entries),
    fileCount: entries.filter((entry) => entry.kind === "blob").length,
    totalBytes
  });
}

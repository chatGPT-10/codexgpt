import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hasSecretValue } from "../redact.js";
import type { GitCommandExecutor } from "../git/execution.js";
import type { GitRepositoryIdentity } from "../git/repositoryIdentity.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import type { ManagedWorktreeRoot } from "./root.js";
import type { TaskTreeManifestV1 } from "./treeManifest.js";

export interface MaterializedTaskTree {
  target: string;
  entryCount: number;
  totalBytes: number;
  contentDigest: string;
}

export async function materializeTaskTree(input: {
  root: ManagedWorktreeRoot;
  target: string;
  executor: GitCommandExecutor;
  repository: GitRepositoryIdentity;
  manifest: TaskTreeManifestV1;
  existingTarget?: boolean;
}): Promise<MaterializedTaskTree> {
  if (path.dirname(input.target) !== input.root.root) throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  const staging = path.join(input.root.root, `.staging-${randomBytes(16).toString("hex")}`);
  const digestParts: string[] = [];
  await fsp.mkdir(staging, { mode: 0o700 });
  try {
    for (const entry of input.manifest.entries) {
      const destination = path.join(staging, ...entry.path.split("/"));
      if (!destination.startsWith(`${staging}${path.sep}`)) throw new Error("TASK_WORKTREE_TREE_UNSAFE");
      await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      if (entry.kind === "gitlink") {
        await fsp.mkdir(destination, { mode: 0o700 });
        digestParts.push(`${entry.path}\0gitlink\0${entry.oid}`);
        continue;
      }
      const blob = await runGitRequired(input.executor, input.repository, [
        "cat-file", "blob", entry.oid
      ], { stdoutLimitBytes: entry.size + 1 });
      if (blob.stdout.length !== entry.size || hasSecretValue(blob.stdout.toString("latin1"))) {
        throw new Error("GIT_SECRET_BLOCKED");
      }
      await fsp.writeFile(destination, blob.stdout, { flag: "wx", mode: entry.mode === "100755" ? 0o700 : 0o600 });
      const stat = await fsp.lstat(destination, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || Number(stat.size) !== entry.size) {
        throw new Error("TASK_WORKTREE_TREE_UNSAFE");
      }
      digestParts.push(`${entry.path}\0${entry.mode}\0${entry.oid}\0${sha256Git(blob.stdout)}`);
    }
    if (input.existingTarget) {
      const targetStat = await fsp.lstat(input.target);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error("TASK_WORKTREE_TREE_UNSAFE");
      for (const entry of await fsp.readdir(staging)) {
        await fsp.rename(path.join(staging, entry), path.join(input.target, entry));
      }
      await fsp.rmdir(staging);
    } else {
      await fsp.rename(staging, input.target);
    }
    return {
      target: input.target,
      entryCount: input.manifest.entries.length,
      totalBytes: input.manifest.totalBytes,
      contentDigest: sha256Git(digestParts.join("\n"))
    };
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { GitCommandExecutor } from "./execution.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import { gitMutationError, runGitRequired, sha256Git } from "./mutationContext.js";

export interface PrivateIndexEntryV4 {
  path: string;
  mode: string;
  oid: string;
}

export async function gitIndexIdentityV4(file: string): Promise<string> {
  const handle = await fsp.open(file, "r").catch(() => {
    throw gitMutationError("GIT_INDEX_CHANGED");
  });
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > 32n * 1024n * 1024n) {
      throw gitMutationError("GIT_INDEX_CHANGED");
    }
    return sha256Git(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.nlink}:${sha256Git(await handle.readFile())}`);
  } finally {
    await handle.close();
  }
}

export async function replaceLiveIndexV4(input: {
  liveIndex: string;
  preparedIndex: string;
  expectedIdentity: string;
}): Promise<void> {
  const directory = path.dirname(input.liveIndex);
  const nonce = randomBytes(8).toString("hex");
  const replacement = path.join(directory, `.codexgpt-index-${nonce}.new`);
  const backup = path.join(directory, `.codexgpt-index-${nonce}.bak`);
  let liveMoved = false;
  try {
    const bytes = await fsp.readFile(input.preparedIndex);
    if (bytes.length > 32 * 1024 * 1024) throw gitMutationError("GIT_INDEX_CHANGED");
    await fsp.writeFile(replacement, bytes, { flag: "wx", mode: 0o600 });
    if (await gitIndexIdentityV4(input.liveIndex) !== input.expectedIdentity) {
      throw gitMutationError("GIT_INDEX_CHANGED");
    }
    await fsp.rename(input.liveIndex, backup);
    liveMoved = true;
    await fsp.rename(replacement, input.liveIndex);
    liveMoved = false;
    await fsp.rm(backup, { force: true });
  } catch (error) {
    await fsp.rm(replacement, { force: true }).catch(() => {});
    if (liveMoved) await fsp.rename(backup, input.liveIndex).catch(() => {});
    throw error;
  }
}

export async function installPrivateIndexEntries(input: {
  executor: GitCommandExecutor;
  repository: GitRepositoryIdentity;
  entries: readonly (PrivateIndexEntryV4 | { path: string; remove: true })[];
}): Promise<string> {
  const privateRoot = await input.executor.createPrivateDirectory?.("git-private-index");
  if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
  const liveIndex = path.join(input.repository.gitDir, "index");
  const privateIndex = path.join(privateRoot, "index");
  try {
    const before = await gitIndexIdentityV4(liveIndex);
    await fsp.copyFile(liveIndex, privateIndex);
    for (const entry of input.entries) {
      if ("remove" in entry) {
        await runGitRequired(input.executor, input.repository, [
          "update-index", "--force-remove", "--", entry.path
        ], { privateIndexPath: privateIndex });
      } else {
        await runGitRequired(input.executor, input.repository, [
          "update-index", "--add", "--cacheinfo", `${entry.mode},${entry.oid},${entry.path}`
        ], { privateIndexPath: privateIndex });
      }
    }
    const tree = (await runGitRequired(input.executor, input.repository, ["write-tree"], {
      privateIndexPath: privateIndex,
      stdoutLimitBytes: 256
    })).stdout.toString("ascii").trim();
    await replaceLiveIndexV4({ liveIndex, preparedIndex: privateIndex, expectedIdentity: before });
    return tree;
  } finally {
    await input.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
  }
}

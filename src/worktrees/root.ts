import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface ManagedWorktreeRoot {
  root: string;
  volume: string;
  identity: string;
}

function outside(candidate: string, protectedPath: string): boolean {
  const relative = path.relative(protectedPath, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function admitManagedWorktreeRoot(input: {
  root: string;
  protectedRoots: readonly string[];
  create?: boolean;
}): Promise<ManagedWorktreeRoot> {
  const resolved = path.resolve(input.root);
  if (!path.isAbsolute(resolved) || resolved.startsWith("\\\\") || resolved.startsWith("//")) {
    throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  }
  for (const protectedRoot of input.protectedRoots) {
    const canonical = path.resolve(protectedRoot);
    if (outside(resolved, canonical) || outside(canonical, resolved)) {
      throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
    }
  }
  if (input.create) await fsp.mkdir(resolved, { recursive: true, mode: 0o700 });
  const canonical = await fsp.realpath(resolved).catch(() => {
    throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  });
  const stat = await fsp.lstat(canonical, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  const parsed = path.parse(canonical);
  if (!parsed.root || (process.platform === "win32" && !/^[A-Za-z]:\\$/u.test(parsed.root))) {
    throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  }
  return Object.freeze({
    root: canonical,
    volume: parsed.root.toLocaleLowerCase("en-US"),
    identity: createHash("sha256")
      .update(`${stat.dev}:${stat.ino}:${stat.birthtimeNs}`, "utf8")
      .digest("hex")
  });
}

export function managedTaskPath(root: ManagedWorktreeRoot, taskId: string): string {
  if (!/^task_[a-f0-9]{32}$/u.test(taskId)) throw new Error("TASK_WORKTREE_NOT_FOUND");
  const candidate = path.join(root.root, taskId);
  if (path.dirname(candidate) !== root.root) throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  return candidate;
}

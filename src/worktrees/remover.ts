import fsp from "node:fs/promises";
import path from "node:path";
import type { ManagedWorktreeRoot } from "./root.js";

async function inventoryOwnedTree(
  directory: string,
  root: string,
  files: string[],
  directories: string[]
): Promise<void> {
  const stat = await fsp.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
  directories.push(directory);
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    const lexical = await fsp.lstat(target, { bigint: true });
    if (lexical.isSymbolicLink() || lexical.nlink > 1n || entry.name.toLocaleLowerCase("en-US") === ".git") {
      throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    }
    if (lexical.isDirectory()) await inventoryOwnedTree(target, root, files, directories);
    else if (lexical.isFile()) files.push(target);
    else {
      throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    }
  }
}

export async function removeManagedTaskTree(input: {
  root: ManagedWorktreeRoot;
  target: string;
}): Promise<{ removedEntries: number }> {
  const canonicalParent = await fsp.realpath(path.dirname(input.target));
  if (canonicalParent !== input.root.root || path.dirname(input.target) !== input.root.root) {
    throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  }
  const files: string[] = [];
  const directories: string[] = [];
  await inventoryOwnedTree(input.target, input.root.root, files, directories);
  for (const file of files) await fsp.unlink(file);
  for (const directory of directories.reverse()) await fsp.rmdir(directory);
  return { removedEntries: files.length };
}

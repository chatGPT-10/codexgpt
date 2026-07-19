import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ManagedWorktreeRoot } from "./root.js";

async function inventoryOwnedTree(
  directory: string,
  root: string,
  treeRoot: string,
  files: string[],
  directories: string[],
  identities: string[],
  allowGitMarker: boolean
): Promise<void> {
  const stat = await fsp.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
  directories.push(directory);
  identities.push(`${path.relative(treeRoot, directory)}\0directory\0${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.nlink}`);
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    const lexical = await fsp.lstat(target, { bigint: true });
    const gitMarker = entry.name.toLocaleLowerCase("en-US") === ".git";
    if (lexical.isSymbolicLink() || (gitMarker && (!allowGitMarker || directory !== treeRoot))) {
      throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    }
    if (lexical.isDirectory()) await inventoryOwnedTree(target, root, treeRoot, files, directories, identities, false);
    else if (lexical.isFile()) {
      if (lexical.nlink > 1n) throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
      files.push(target);
      identities.push(`${path.relative(treeRoot, target)}\0file\0${lexical.dev}:${lexical.ino}:${lexical.size}:${lexical.mtimeNs}:${lexical.nlink}`);
    }
    else {
      throw new Error("TASK_WORKTREE_REMOVE_UNSAFE");
    }
  }
}

export async function validateManagedTaskTree(input: {
  root: ManagedWorktreeRoot;
  target: string;
  allowGitMarker?: boolean;
}): Promise<{ files: string[]; directories: string[]; identityDigest: string; entryCount: number }> {
  const canonicalParent = await fsp.realpath(path.dirname(input.target));
  if (canonicalParent !== input.root.root || path.dirname(input.target) !== input.root.root) {
    throw new Error("TASK_WORKTREE_ROOT_UNSAFE");
  }
  const files: string[] = [];
  const directories: string[] = [];
  const identities: string[] = [];
  await inventoryOwnedTree(
    input.target,
    input.root.root,
    input.target,
    files,
    directories,
    identities,
    input.allowGitMarker === true
  );
  identities.sort();
  return {
    files,
    directories,
    identityDigest: createHash("sha256").update(JSON.stringify(identities)).digest("hex"),
    entryCount: identities.length
  };
}

export async function removeManagedTaskTree(input: {
  root: ManagedWorktreeRoot;
  target: string;
  allowGitMarker?: boolean;
}): Promise<{ removedEntries: number }> {
  const { files, directories } = await validateManagedTaskTree(input);
  for (const file of files) await fsp.unlink(file);
  for (const directory of directories.reverse()) await fsp.rmdir(directory);
  return { removedEntries: files.length };
}

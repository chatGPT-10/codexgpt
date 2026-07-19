#!/usr/bin/env node
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeManagedTaskTree } from "../dist/worktrees/remover.js";

const base = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-worktree-delete-control-"));
const managed = path.join(base, "managed");
const outside = path.join(base, "outside");
let supported = true;
let unsupportedReason = null;
try {
  await fsp.mkdir(managed, { recursive: true });
  const canonicalManaged = await fsp.realpath(managed);
  const target = path.join(canonicalManaged, `task_${"1".repeat(32)}`);
  await fsp.mkdir(target);
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(outside, "canary.txt"), "outside-survives\n");
  try {
    await fsp.symlink(outside, path.join(target, "escape"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    supported = false;
    unsupportedReason = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "junction_creation_failed";
  }
  if (supported) {
    await removeManagedTaskTree({
      root: {
        root: canonicalManaged,
        volume: path.parse(managed).root.toLocaleLowerCase("en-US"),
        identity: "control"
      },
      target
    }).then(
      () => { throw new Error("unsafe removal unexpectedly succeeded"); },
      (error) => {
        if (!(error instanceof Error) || error.message !== "TASK_WORKTREE_REMOVE_UNSAFE") throw error;
      }
    );
    if (await fsp.readFile(path.join(outside, "canary.txt"), "utf8") !== "outside-survives\n") {
      throw new Error("outside canary changed");
    }
  }
  console.log(JSON.stringify({
    schemaVersion: 1,
    platform: process.platform,
    supported,
    unsupportedReason,
    unsafeRemovalRejected: supported,
    outsideCanarySurvived: true
  }));
} finally {
  const resolved = path.resolve(base);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())) throw new Error("unsafe cleanup root");
  await fsp.rm(resolved, { recursive: true, force: true });
}

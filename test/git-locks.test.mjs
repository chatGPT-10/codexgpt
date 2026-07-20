import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitLockManager } from "../dist/git/locks.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

async function withState(callback) {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-locks-"));
  const registry = new ProcessInstanceRegistry(stateRoot, { pid: 4242, now: () => 1_700_000_000_000, randomBytes: (size) => Buffer.alloc(size, 1) });
  try {
    await callback({ stateRoot, registry });
  } finally {
    registry.dispose();
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}

test("Gate R acquires repository then lexical worktree then file locks and releases in reverse", async () => {
  await withState(async ({ stateRoot, registry }) => {
    const events = [];
    const locks = new GitLockManager({
      stateRoot,
      registry,
      processCreationTime: async () => "proc-4242",
      randomBytes: (size) => Buffer.alloc(size, events.length + 2),
      onLockEvent: (event) => events.push(`${event.action}:${event.kind}:${event.stateKey}`)
    });
    const handle = await locks.acquire({
      operationId: `gop_${"a".repeat(32)}`,
      repositoryStateKey: `grs_${"b".repeat(32)}`,
      worktreeStateKeys: [`gws_${"d".repeat(32)}`, `gws_${"c".repeat(32)}`],
      async acquireFileLocks() {
        events.push("acquired:file:phase3");
        return { async release() { events.push("released:file:phase3"); } };
      }
    });
    assert.deepEqual(events.slice(0, 4), [
      `acquired:repository:grs_${"b".repeat(32)}`,
      `acquired:worktree:gws_${"c".repeat(32)}`,
      `acquired:worktree:gws_${"d".repeat(32)}`,
      "acquired:file:phase3"
    ]);
    await handle.release();
    assert.deepEqual(events.slice(-4), [
      "released:file:phase3",
      `released:worktree:gws_${"d".repeat(32)}`,
      `released:worktree:gws_${"c".repeat(32)}`,
      `released:repository:grs_${"b".repeat(32)}`
    ]);
  });
});

test("file-lock acquisition failure releases already acquired Gate R locks", async () => {
  await withState(async ({ stateRoot, registry }) => {
    const events = [];
    const locks = new GitLockManager({
      stateRoot,
      registry,
      processCreationTime: async () => "proc-4242",
      randomBytes: (size) => Buffer.alloc(size, 6),
      onLockEvent: (event) => events.push(`${event.action}:${event.kind}`)
    });
    const repositoryStateKey = `grs_${"7".repeat(32)}`;
    await assert.rejects(
      locks.acquire({
        operationId: `gop_${"8".repeat(32)}`,
        repositoryStateKey,
        worktreeStateKeys: [`gws_${"9".repeat(32)}`],
        async acquireFileLocks() { throw new Error("file lock busy"); }
      }),
      /file lock busy/
    );
    assert.deepEqual(events, [
      "acquired:repository",
      "acquired:worktree",
      "released:worktree",
      "released:repository"
    ]);
    assert.equal((await locks.diagnose({ repositoryStateKey }))[0].status, "free");
  });
});

test("foreign or stale Gate R locks are diagnosed without deletion", async () => {
  await withState(async ({ stateRoot, registry }) => {
    const locks = new GitLockManager({
      stateRoot,
      registry,
      processCreationTime: async (pid) => pid === 4242 ? "proc-4242" : null,
      randomBytes: (size) => Buffer.alloc(size, 8)
    });
    const repositoryStateKey = `grs_${"e".repeat(32)}`;
    const lockDirectory = locks.lockDirectory("repository", repositoryStateKey);
    await fs.mkdir(lockDirectory, { recursive: true });
    await fs.writeFile(path.join(lockDirectory, "owner.json"), JSON.stringify({
      schemaVersion: 1,
      lockToken: `glock_${"f".repeat(32)}`,
      kind: "repository",
      stateKey: repositoryStateKey,
      operationId: `gop_${"1".repeat(32)}`,
      instanceId: `instance_${"2".repeat(32)}`,
      pid: 9999,
      processCreationTime: "old-process",
      createdAt: new Date(1_700_000_000_000).toISOString()
    }) + "\n", "utf8");

    await assert.rejects(
      locks.acquire({ operationId: `gop_${"3".repeat(32)}`, repositoryStateKey }),
      /GIT_RECOVERY_REQUIRED/
    );
    assert.equal((await fs.stat(lockDirectory)).isDirectory(), true);
    assert.equal((await locks.diagnose({ repositoryStateKey }))[0].status, "foreign_or_stale");
  });
});

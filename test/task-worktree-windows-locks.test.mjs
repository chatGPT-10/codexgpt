import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";
import { createTaskWorktree, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";

async function childHoldingCwd(cwd) {
  const child = spawn(process.execPath, [
    "-e",
    "process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"
  ], { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", resolve);
  });
  return child;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
}

test("Windows external cwd keeps a reviewed task ready and returns TASK_WORKTREE_IN_USE", {
  skip: process.platform !== "win32" ? "Windows directory-handle control only" : false
}, async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "external cwd lock"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: taskId
    });
    const child = await childHoldingCwd(item.privateState.worktreePath);
    try {
      await assert.rejects(() => fixture.service.remove({
        action: "execute",
        workspace: fixture.workspace,
        taskWorktreeId: taskId,
        reviewToken: prepared.review_token,
        authorization: fixture.authorization
      }), /TASK_WORKTREE_IN_USE/);
      assert.equal((await fs.stat(item.privateState.worktreePath)).isDirectory(), true);
      assert.equal((await fs.stat(item.privateState.adminDir)).isDirectory(), true);
      assert.equal(fixture.store.read(taskId).record.state, "ready");
    } finally {
      await stopChild(child);
    }
    const removed = await fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: taskId,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    });
    assert.equal(removed.removed, true);
    await assert.rejects(() => fs.stat(item.privateState.worktreePath), { code: "ENOENT" });
    await assert.rejects(() => fs.stat(item.privateState.adminDir), { code: "ENOENT" });
    const branch = await fixture.executor.run(
      await fixture.manager.primaryRepository(fixture.workspace),
      ["show-ref", "--verify", item.privateState.branchRef]
    );
    assert.equal(branch.status, 0);
    const residue = (await fs.readdir(fixture.root.root)).filter((name) => name.includes("codexpro-removing"));
    assert.deepEqual(residue, []);
  });
});

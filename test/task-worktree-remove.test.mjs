import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTaskWorktree, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";
import { removeManagedTaskTree, validateManagedTaskTree } from "../dist/worktrees/remover.js";
import { taskRemovalQuarantinePaths } from "../dist/worktrees/remove.js";
import { TaskWorktreeRecoveryV4 } from "../dist/worktrees/recovery.js";
import { TaskWorktreeStoreV1 } from "../dist/worktrees/store.js";
import { TaskWorktreeManagerV4 } from "../dist/worktrees/manager.js";

async function withRemovalTree(callback) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-remove-tree-"));
  const rootPath = await fs.realpath(parent);
  const target = path.join(rootPath, "task_test");
  await fs.mkdir(path.join(target, "nested"), { recursive: true });
  try {
    await callback({ root: { root: rootPath, volume: path.parse(rootPath).root, identity: "test" }, target });
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

test("owned-tree removal accepts ordinary nested directory link counts", async () => {
  await withRemovalTree(async ({ root, target }) => {
    await fs.writeFile(path.join(target, "nested", "file.txt"), "owned\n");
    const result = await removeManagedTaskTree({ root, target });
    assert.equal(result.removedEntries, 1);
    assert.equal(await fs.stat(target).then(() => true).catch(() => false), false);
  });
});

test("owned-tree removal still rejects hard-linked files", async () => {
  await withRemovalTree(async ({ root, target }) => {
    const file = path.join(target, "nested", "file.txt");
    const sibling = path.join(root.root, "linked.txt");
    await fs.writeFile(file, "shared\n");
    await fs.link(file, sibling);
    await assert.rejects(() => removeManagedTaskTree({ root, target }), /TASK_WORKTREE_REMOVE_UNSAFE/);
    assert.equal(await fs.readFile(file, "utf8"), "shared\n");
  });
});

test("clean task removal is reviewed, revokes handles, and retains the branch", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove clean task"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    const removed = await fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    });
    assert.equal(removed.removed, true);
    assert.equal(await fs.stat(item.privateState.worktreePath).then(() => true).catch(() => false), false);
    const branch = await fixture.executor.run(
      await fixture.manager.primaryRepository(fixture.workspace),
      ["show-ref", "--verify", item.privateState.branchRef]
    );
    assert.equal(branch.status, 0);
    assert.throws(() => fixture.authority.getWorkspace(created.workspace_id), /TASK_WORKTREE_NOT_FOUND/);
  });
});

test("task removal rechecks cleanliness immediately before deletion", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove race task"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    const lateFile = path.join(item.privateState.worktreePath, "late.txt");
    await fs.writeFile(lateFile, "must survive\n");
    await assert.rejects(() => fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    }), /TASK_WORKTREE_DIRTY/);
    assert.equal(await fs.readFile(lateFile, "utf8"), "must survive\n");
  });
});

test("task removal drains an owned process that starts after review", async () => {
  let active = false;
  let drained = 0;
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove with owned process"
    });
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    active = true;
    const removed = await fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    });
    assert.equal(removed.removed, true);
    assert.equal(drained, 1);
    assert.equal(active, false);
  }, {
    hasActiveProcesses: () => active,
    drainActiveProcesses: () => {
      drained += 1;
      active = false;
    }
  });
});

test("task removal restores both exact paths when the durable removed transition fails", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove persistence failure"
    });
    const item = fixture.store.read(created.task.task_worktree_id);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: created.task.task_worktree_id
    });
    const originalUpdate = fixture.store.update.bind(fixture.store);
    fixture.store.update = (taskWorktreeId, patch) => {
      if (patch.state === "recovery_required") throw new Error("INJECT_STORE_FAILURE");
      return originalUpdate(taskWorktreeId, patch);
    };
    try {
      await assert.rejects(() => fixture.service.remove({
        action: "execute",
        workspace: fixture.workspace,
        taskWorktreeId: created.task.task_worktree_id,
        reviewToken: prepared.review_token,
        authorization: fixture.authorization
      }), /INJECT_STORE_FAILURE/);
    } finally {
      fixture.store.update = originalUpdate;
    }
    assert.equal((await fs.stat(item.privateState.worktreePath)).isDirectory(), true);
    assert.equal((await fs.stat(item.privateState.adminDir)).isDirectory(), true);
    assert.equal(fixture.store.read(created.task.task_worktree_id).record.state, "ready");
  });
});

test("task removal rejects a tracked hardlink during review without quarantine residue", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "remove hardlink review"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const outside = path.join(fixture.root.root, `${taskId}-outside-link.txt`);
    await fs.link(path.join(item.privateState.worktreePath, "tracked.txt"), outside);
    await assert.rejects(() => fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: taskId
    }), /TASK_WORKTREE_REMOVE_UNSAFE/);
    assert.equal((await fs.stat(item.privateState.worktreePath)).isDirectory(), true);
    assert.equal(fixture.store.read(taskId).record.state, "ready");
    const residue = (await fs.readdir(fixture.root.root)).filter((name) => name.includes("codexpro-removing"));
    assert.deepEqual(residue, []);
  });
});

test("restart recovery removes deterministic task quarantines and completes the tombstone", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "recover removal quarantine"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const worktreeInventory = await validateManagedTaskTree({
      root: fixture.root,
      target: item.privateState.worktreePath,
      allowGitMarker: true
    });
    const adminParent = path.dirname(item.privateState.adminDir);
    const adminInventory = await validateManagedTaskTree({
      root: { root: adminParent, volume: path.parse(adminParent).root.toLowerCase(), identity: "admin-parent" },
      target: item.privateState.adminDir
    });
    const quarantines = taskRemovalQuarantinePaths({
      managedRoot: fixture.root.root,
      taskWorktreeId: taskId,
      generation: item.record.generation,
      worktreePath: item.privateState.worktreePath,
      adminDir: item.privateState.adminDir
    });
    await fs.rename(item.privateState.worktreePath, quarantines.worktreeQuarantine);
    await fs.rename(item.privateState.adminDir, quarantines.adminQuarantine);
    fixture.store.update(taskId, {
      state: "recovery_required",
      privateState: {
        ...item.privateState,
        removalReview: {
          worktreeInventoryDigest: worktreeInventory.identityDigest,
          worktreeEntryCount: worktreeInventory.entryCount,
          adminInventoryDigest: adminInventory.identityDigest,
          adminEntryCount: adminInventory.entryCount
        }
      }
    });
    const reopenedStore = new TaskWorktreeStoreV1({
      stateRoot: fixture.stateRoot,
      masterKey: Buffer.alloc(32, 71)
    });
    const restartedManager = new TaskWorktreeManagerV4({
      ...fixture.manager.options,
      store: reopenedStore
    });
    assert.deepEqual(
      reopenedStore.read(taskId).privateState.removalReview,
      fixture.store.read(taskId).privateState.removalReview
    );
    const recovery = new TaskWorktreeRecoveryV4({
      manager: restartedManager,
      plans: fixture.plans,
      candidateWorkspaces: fixture.candidateWorkspaces,
      verificationReceipts: fixture.verificationReceipts,
      ownerFingerprint: () => fixture.ownerFingerprint
    });
    const result = await recovery.recover();
    assert.deepEqual(result, [{ taskWorktreeId: taskId, mergePlanId: null, outcome: "cleanup_completed" }]);
    assert.equal(reopenedStore.read(taskId).record.state, "removed");
    await assert.rejects(() => fs.stat(quarantines.worktreeQuarantine), { code: "ENOENT" });
    await assert.rejects(() => fs.stat(quarantines.adminQuarantine), { code: "ENOENT" });
  });
});

test("restart recovery preserves a quarantine whose reviewed inventory drifted", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "preserve drifted removal quarantine"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const worktreeInventory = await validateManagedTaskTree({
      root: fixture.root,
      target: item.privateState.worktreePath,
      allowGitMarker: true
    });
    const adminParent = path.dirname(item.privateState.adminDir);
    const adminRoot = { root: adminParent, volume: path.parse(adminParent).root.toLowerCase(), identity: "admin-parent" };
    const adminInventory = await validateManagedTaskTree({ root: adminRoot, target: item.privateState.adminDir });
    const quarantines = taskRemovalQuarantinePaths({
      managedRoot: fixture.root.root,
      taskWorktreeId: taskId,
      generation: item.record.generation,
      worktreePath: item.privateState.worktreePath,
      adminDir: item.privateState.adminDir
    });
    await fs.rename(item.privateState.worktreePath, quarantines.worktreeQuarantine);
    await fs.rename(item.privateState.adminDir, quarantines.adminQuarantine);
    fixture.store.update(taskId, {
      state: "recovery_required",
      privateState: {
        ...item.privateState,
        removalReview: {
          worktreeInventoryDigest: worktreeInventory.identityDigest,
          worktreeEntryCount: worktreeInventory.entryCount,
          adminInventoryDigest: adminInventory.identityDigest,
          adminEntryCount: adminInventory.entryCount
        }
      }
    });
    const foreign = path.join(quarantines.worktreeQuarantine, "foreign-after-crash.txt");
    await fs.writeFile(foreign, "preserve\n");
    const recovery = new TaskWorktreeRecoveryV4({
      manager: fixture.manager,
      plans: fixture.plans,
      candidateWorkspaces: fixture.candidateWorkspaces,
      verificationReceipts: fixture.verificationReceipts,
      ownerFingerprint: () => fixture.ownerFingerprint
    });
    assert.deepEqual(await recovery.recover(), [{
      taskWorktreeId: taskId,
      mergePlanId: null,
      outcome: "recovery_required"
    }]);
    assert.equal(fixture.store.read(taskId).record.state, "recovery_required");
    assert.equal(await fs.readFile(foreign, "utf8"), "preserve\n");
  });
});

test("failed second quarantine plus failed rollback enters durable recovery", async () => {
  let injected = false;
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "quarantine rollback failure"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: taskId
    });
    await assert.rejects(() => fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: taskId,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    }), /GIT_RECOVERY_REQUIRED/);
    assert.equal(injected, true);
    assert.equal(fixture.store.read(taskId).record.state, "recovery_required");
    const quarantine = taskRemovalQuarantinePaths({
      managedRoot: fixture.root.root,
      taskWorktreeId: taskId,
      generation: item.record.generation,
      worktreePath: item.privateState.worktreePath,
      adminDir: item.privateState.adminDir
    });
    assert.equal((await fs.stat(quarantine.worktreeQuarantine)).isDirectory(), true);
  }, {
    beforeAdminQuarantine: async ({ worktreeQuarantine, adminQuarantine }) => {
      injected = true;
      await fs.mkdir(adminQuarantine);
      const suffix = worktreeQuarantine.indexOf(".task_");
      if (suffix < 1) throw new Error("INJECT_QUARANTINE_NOT_FOUND");
      const original = worktreeQuarantine.slice(0, suffix);
      await fs.mkdir(original);
    }
  });
});

test("post-review quarantine drift rolls both trees back without deleting the new file", async () => {
  let lateFile;
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "quarantine inventory drift"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: taskId
    });
    await assert.rejects(() => fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: taskId,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    }), /GIT_STATE_CHANGED/);
    lateFile = path.join(item.privateState.worktreePath, "late-unreviewed.txt");
    assert.equal(await fs.readFile(lateFile, "utf8"), "preserve\n");
    assert.equal(fixture.store.read(taskId).record.state, "ready");
    const residue = (await fs.readdir(fixture.root.root)).filter((name) => name.includes("codexpro-removing"));
    assert.deepEqual(residue, []);
  }, {
    beforeAdminQuarantine: async ({ worktreeQuarantine }) => {
      await fs.writeFile(path.join(worktreeQuarantine, "late-unreviewed.txt"), "preserve\n");
    }
  });
});

test("post-review quarantine drift plus failed rollback enters durable recovery", async () => {
  let originalWorktree;
  let quarantinedLateFile;
  await withTaskWorktreeFixture(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    const created = await createTaskWorktree(fixture, {
      stateToken: status.state_token,
      taskName: "quarantine drift rollback failure"
    });
    const taskId = created.task.task_worktree_id;
    const item = fixture.store.read(taskId);
    originalWorktree = item.privateState.worktreePath;
    const prepared = await fixture.service.remove({
      action: "prepare",
      workspace: fixture.workspace,
      taskWorktreeId: taskId
    });
    await assert.rejects(() => fixture.service.remove({
      action: "execute",
      workspace: fixture.workspace,
      taskWorktreeId: taskId,
      reviewToken: prepared.review_token,
      authorization: fixture.authorization
    }), /GIT_RECOVERY_REQUIRED/);
    assert.equal(fixture.store.read(taskId).record.state, "recovery_required");
    const recovery = new TaskWorktreeRecoveryV4({
      manager: fixture.manager,
      plans: fixture.plans,
      candidateWorkspaces: fixture.candidateWorkspaces,
      verificationReceipts: fixture.verificationReceipts,
      ownerFingerprint: () => fixture.ownerFingerprint
    });
    assert.deepEqual(await recovery.recover(), [{
      taskWorktreeId: taskId,
      mergePlanId: null,
      outcome: "recovery_required"
    }]);
    assert.equal(fixture.store.read(taskId).record.state, "recovery_required");
    assert.equal(await fs.readFile(quarantinedLateFile, "utf8"), "preserve\n");
  }, {
    beforeAdminQuarantine: async ({ worktreeQuarantine }) => {
      quarantinedLateFile = path.join(worktreeQuarantine, "late-unreviewed.txt");
      await fs.writeFile(quarantinedLateFile, "preserve\n");
      await fs.mkdir(originalWorktree);
    }
  });
});

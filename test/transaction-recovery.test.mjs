import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathGuard } from "../dist/guard.js";
import {
  AtomicWorkspaceFs,
  ProcessInstanceRegistry,
  TransactionManifestStore,
  WorkspaceMutationLock,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState,
  recoveryActionForState,
  workspaceStateKeyForRoot
} from "../dist/transactions/index.js";

async function fixture(action) {
  const created = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-recovery-"));
  const root = await fsp.realpath(created);
  const workspaceRoot = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await fsp.mkdir(workspaceRoot);
  const workspace = { id: "ws_fixture", root: workspaceRoot, openedAt: "2026-07-14T00:00:00.000Z" };
  const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
  try {
    return await action({ root, workspaceRoot, stateRoot, workspace, config });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function nextManifest(previous, patch) {
  return {
    ...previous,
    ...patch,
    generation: previous.generation + 1,
    updatedAt: "2026-07-14T00:00:01.000Z"
  };
}

test("recovery state policy is closed and deterministic", () => {
  for (const state of ["preparing", "prepared"]) {
    assert.equal(recoveryActionForState(state), "rollback_cleanup");
  }
  for (const state of ["committing", "rolling_back", "recovery_required"]) {
    assert.equal(recoveryActionForState(state), "restore_before_state");
  }
  assert.equal(recoveryActionForState("committed_pending_participants"), "reconcile_participants");
  assert.equal(recoveryActionForState("committed"), "finish_cleanup");
  assert.equal(recoveryActionForState("rolled_back"), "finish_rollback_cleanup");
});

test("live mutation ownership defers redundant recovery without freezing the workspace", () => fixture(async ({ workspaceRoot, stateRoot, config }) => {
  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  const registry = new ProcessInstanceRegistry(stateRoot);
  try {
    await coordinator.ensureWorkspaceReady(workspaceRoot);
    const installation = loadOrCreateInstallationState({ stateRoot });
    const masterKey = installationMasterKey(installation);
    const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
    masterKey.fill(0);
    const lock = new WorkspaceMutationLock(stateRoot, registry).acquire({
      workspaceStateKey,
      transactionId: "tx_" + "9".repeat(32)
    });
    try {
      await coordinator.ensureWorkspaceReady(workspaceRoot);
    } finally {
      lock.release();
    }
    await coordinator.ensureWorkspaceReady(workspaceRoot);
  } finally {
    registry.dispose();
    coordinator.dispose();
  }
}));

test("unverifiable live mutation ownership remains fail-closed", () => fixture(async ({ workspaceRoot, stateRoot, config }) => {
  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  const ownerRegistry = new ProcessInstanceRegistry(stateRoot);
  let lock;
  try {
    const installation = loadOrCreateInstallationState({ stateRoot });
    const masterKey = installationMasterKey(installation);
    const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
    masterKey.fill(0);
    lock = new WorkspaceMutationLock(stateRoot, ownerRegistry).acquire({
      workspaceStateKey,
      transactionId: "tx_" + "8".repeat(32)
    });
    await fsp.rm(ownerRegistry.recordPath, { force: true });
    await assert.rejects(
      coordinator.ensureWorkspaceReady(workspaceRoot),
      (error) => error?.code === "TRANSACTION_BUSY"
    );
  } finally {
    lock?.release();
    ownerRegistry.dispose();
    coordinator.dispose();
  }
}));

test("committing recovery restores complete before-state and is idempotent", () => fixture(async ({ workspaceRoot, stateRoot, workspace, config }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "old-a");
  await fsp.writeFile(path.join(workspaceRoot, "c.txt"), "old-c");
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  const inspectedA = await atomicFs.inspect("a.txt");
  const inspectedC = await atomicFs.inspect("c.txt");
  const replace = await atomicFs.stageReplace("op_replace_a", "a.txt", Buffer.from("new-a"), inspectedA.before.sha256);
  const create = await atomicFs.stageCreate("op_create_b", "b.txt", Buffer.from("new-b"));
  const remove = await atomicFs.stageDelete("op_delete_c", "c.txt", inspectedC.before.sha256);
  const installedReplace = await atomicFs.install(replace);

  const installation = loadOrCreateInstallationState({ stateRoot });
  const masterKey = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
  masterKey.fill(0);
  const store = new TransactionManifestStore(stateRoot);
  const initial = {
    schemaVersion: 1,
    transactionId: "tx_" + "1".repeat(32),
    changeSetId: "cs_" + "2".repeat(32),
    workspaceStateKey,
    generation: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    state: "preparing",
    operations: [installedReplace.operation, create.operation, remove.operation],
    createdDirectories: [],
    requiredParticipants: ["audit"],
    participantFacts: { audit: "pending" }
  };
  store.writeInitial(initial);
  const committing = nextManifest(initial, { state: "committing" });
  store.writeNext(initial, committing);

  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  await coordinator.ensureWorkspaceReady(workspaceRoot);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "old-a");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "c.txt"), "utf8"), "old-c");
  assert.equal(store.list(workspaceStateKey).at(-1).state, "rolled_back");
  await coordinator.ensureWorkspaceReady(workspaceRoot);
  coordinator.dispose();
}));

test("committed recovery only finishes artifact cleanup", () => fixture(async ({ workspaceRoot, stateRoot, workspace, config }) => {
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  const prepared = await atomicFs.stageCreate("op_create_a", "committed.txt", Buffer.from("visible"));
  const installed = await atomicFs.install(prepared);
  const installation = loadOrCreateInstallationState({ stateRoot });
  const masterKey = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
  masterKey.fill(0);
  const store = new TransactionManifestStore(stateRoot);
  const initial = {
    schemaVersion: 1,
    transactionId: "tx_" + "3".repeat(32),
    changeSetId: "cs_" + "4".repeat(32),
    workspaceStateKey,
    generation: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    state: "preparing",
    operations: [installed.operation],
    createdDirectories: [],
    requiredParticipants: [],
    participantFacts: {}
  };
  store.writeInitial(initial);
  const committed = nextManifest(initial, { state: "committed" });
  store.writeNext(initial, committed);
  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  await coordinator.ensureWorkspaceReady(workspaceRoot);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "committed.txt"), "utf8"), "visible");
  await assert.rejects(() => fsp.stat(prepared.stageAbsPath), { code: "ENOENT" });
  assert.equal(store.list(workspaceStateKey).at(-1).state, "committed");
  coordinator.dispose();
}));

test("a cleaned committed manifest does not freeze a target changed by a later valid transaction", () => fixture(async ({ workspaceRoot, stateRoot, workspace, config }) => {
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  const prepared = await atomicFs.stageCreate("op_create_history", "history.txt", Buffer.from("first"));
  const installed = await atomicFs.install(prepared);
  await atomicFs.finalize(installed);
  const installation = loadOrCreateInstallationState({ stateRoot });
  const masterKey = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
  masterKey.fill(0);
  const store = new TransactionManifestStore(stateRoot);
  const initial = {
    schemaVersion: 1,
    transactionId: "tx_" + "7".repeat(32),
    changeSetId: "cs_" + "8".repeat(32),
    workspaceStateKey,
    generation: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    state: "preparing",
    operations: [installed.operation],
    createdDirectories: [],
    requiredParticipants: [],
    participantFacts: {}
  };
  store.writeInitial(initial);
  store.writeNext(initial, nextManifest(initial, { state: "committed" }));
  await fsp.writeFile(path.join(workspaceRoot, "history.txt"), "second");

  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  await coordinator.ensureWorkspaceReady(workspaceRoot);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "history.txt"), "utf8"), "second");
  coordinator.dispose();
}));

test("unprovable recovery freezes the workspace and retains evidence", () => fixture(async ({ workspaceRoot, stateRoot, workspace, config }) => {
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  const create = await atomicFs.stageCreate("op_create_a", "conflict.txt", Buffer.from("ours"));
  await fsp.writeFile(path.join(workspaceRoot, "conflict.txt"), "external");
  const installation = loadOrCreateInstallationState({ stateRoot });
  const masterKey = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
  masterKey.fill(0);
  const store = new TransactionManifestStore(stateRoot);
  const initial = {
    schemaVersion: 1,
    transactionId: "tx_" + "5".repeat(32),
    changeSetId: "cs_" + "6".repeat(32),
    workspaceStateKey,
    generation: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    state: "preparing",
    operations: [create.operation],
    createdDirectories: [],
    requiredParticipants: [],
    participantFacts: {}
  };
  store.writeInitial(initial);
  const prepared = nextManifest(initial, { state: "prepared" });
  store.writeNext(initial, prepared);
  const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      () => coordinator.ensureWorkspaceReady(workspaceRoot),
      (error) => error.code === "TRANSACTION_RECOVERY_REQUIRED"
    );
  }
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "conflict.txt"), "utf8"), "external");
  assert.equal((await fsp.stat(create.stageAbsPath)).isFile(), true);
  coordinator.dispose();
}));

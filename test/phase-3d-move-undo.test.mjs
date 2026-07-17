import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MoveChangeSetStore,
  MoveUndoChangeSetService
} from "../dist/changesets/index.js";
import { PathGuard } from "../dist/guard.js";
import { MovePathsService } from "../dist/moves/index.js";
import { pendingWorkspaceMutation } from "../dist/mutations/index.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  TransactionManifestV2Store,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState
} from "../dist/transactions/index.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const ownerBinding = "owner_" + "7".repeat(64);

async function fixture(action) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-move-undo-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const config = {
    blockedGlobs: [],
    maxWriteBytes: 1024 * 1024,
    moveMaxFileBytes: 64 * 1024 * 1024,
    moveMaxTotalBytes: 256 * 1024 * 1024,
    moveHashConcurrency: 4
  };
  const workspace = {
    id: "ws_move_undo",
    root: workspaceRoot,
    openedAt: "2026-07-15T00:00:00.000Z"
  };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const recovery = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  const guard = new PathGuard(config);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, {
    recoveryCoordinator: recovery
  });
  const key = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
  const store = new MoveChangeSetStore({ stateRoot, masterKey: key });
  const move = new MovePathsService({ engine, changeSetStore: store });
  const undo = new MoveUndoChangeSetService({
    engine,
    moveChangeSetStore: store,
    guard
  });
  try {
    return await action({ workspaceRoot, workspace, engine, store, move, undo });
  } finally {
    store.dispose();
    key.fill(0);
    recovery.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function commitMove({ workspace, move }, moves, createParents = false, contractVersion = 2) {
  const preparedResult = await move.prepare({
    workspace,
    moves,
    createParents,
    preview: false,
    requestId: "request_move_before_undo",
    ownerBinding,
    policyRevision: "policy_phase3d",
    contractVersion
  });
  const pending = pendingWorkspaceMutation(preparedResult);
  assert.ok(pending);
  await pending.commit({
    result: preparedResult,
    async persistAudit() {}
  });
  return pending.changeSetId;
}

function undoInput(workspace, changeSetId, preview, contractVersion = 2) {
  return {
    workspace,
    changeSetId,
    ownerBinding,
    policyRevision: "policy_phase3d",
    requestId: "request_move_undo",
    preview,
    contractVersion
  };
}

test("move undo preview is zero-mutation and committed undo restores the source", () => fixture(async ({
  workspaceRoot, workspace, engine, store, move, undo
}) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const originalId = await commitMove({ workspace, move }, [
    { source: "a.txt", destination: "b.txt", expectedSha256: sha("alpha") }
  ], false, 3);

  const preview = await undo.prepare(undoInput(workspace, originalId, true));
  assert.equal(preview.preview, true);
  assert.equal(preview.changeSetId, null);
  assert.deepEqual(preview.operations, [
    { kind: "move", source: "b.txt", destination: "a.txt" }
  ]);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "a.txt")), { code: "ENOENT" });

  const prepared = await undo.prepare(undoInput(workspace, originalId, false, 3));
  assert.ok(prepared.pending);
  await prepared.pending.commit({ result: { ok: true }, async persistAudit() {} });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });

  const workspaceKey = engine.workspaceStateKey(workspace.root);
  assert.equal(store.read(workspaceKey, originalId).state, "undone");
  assert.equal(store.read(workspaceKey, originalId).contractVersion, 3);
  const reverse = store.read(workspaceKey, prepared.changeSetId);
  assert.equal(reverse.toolName, "undo_change_set");
  assert.equal(reverse.revertsChangeSetId, originalId);
  assert.equal(reverse.contractVersion, 3);
  assert.equal(reverse.undoSupported, false);
  assert.equal(reverse.undoReason, "reverted_change_set");
}));

test("move undo removes only authenticated transaction-created empty directories", () => fixture(async ({
  workspaceRoot, workspace, move, undo
}) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const originalId = await commitMove({ workspace, move }, [
    { source: "a.txt", destination: "nested/deeper/b.txt", expectedSha256: sha("alpha") }
  ], true);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "nested/deeper/b.txt"), "utf8"), "alpha");

  const prepared = await undo.prepare(undoInput(workspace, originalId, false));
  await prepared.pending.commit({ result: { ok: true }, async persistAudit() {} });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "nested")), { code: "ENOENT" });
}));

test("move undo rejects replaced destination objects with zero mutation", () => fixture(async ({
  workspaceRoot, workspace, move, undo
}) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const originalId = await commitMove({ workspace, move }, [
    { source: "a.txt", destination: "b.txt", expectedSha256: sha("alpha") }
  ]);
  const replacementPath = path.join(workspaceRoot, "replacement.txt");
  await fsp.writeFile(replacementPath, "alpha");
  const [originalStat, replacementStat] = await Promise.all([
    fsp.stat(path.join(workspaceRoot, "b.txt"), { bigint: true }),
    fsp.stat(replacementPath, { bigint: true })
  ]);
  assert.notDeepEqual(
    { device: originalStat.dev, fileId: originalStat.ino },
    { device: replacementStat.dev, fileId: replacementStat.ino }
  );
  await fsp.unlink(path.join(workspaceRoot, "b.txt"));
  await fsp.rename(replacementPath, path.join(workspaceRoot, "b.txt"));

  await assert.rejects(
    () => undo.prepare(undoInput(workspace, originalId, true)),
    (error) => error?.code === "UNDO_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "a.txt")), { code: "ENOENT" });
}));

test("move undo reverses a complete cycle through the same V2 engine", () => fixture(async ({
  workspaceRoot, workspace, move, undo
}) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  await fsp.writeFile(path.join(workspaceRoot, "b.txt"), "bravo");
  const originalId = await commitMove({ workspace, move }, [
    { source: "a.txt", destination: "b.txt", expectedSha256: sha("alpha") },
    { source: "b.txt", destination: "a.txt", expectedSha256: sha("bravo") }
  ]);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "bravo");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "alpha");

  const prepared = await undo.prepare(undoInput(workspace, originalId, false));
  await prepared.pending.commit({ result: { ok: true }, async persistAudit() {} });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "bravo");
}));

test("move undo recovers when original change-set effect precedes its participant fact", async () => {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-move-undo-participant-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const config = {
    blockedGlobs: [],
    maxWriteBytes: 1024 * 1024,
    moveMaxFileBytes: 64 * 1024 * 1024,
    moveMaxTotalBytes: 256 * 1024 * 1024,
    moveHashConcurrency: 4
  };
  const workspace = {
    id: "ws_move_undo_participant",
    root: workspaceRoot,
    openedAt: "2026-07-15T00:00:00.000Z"
  };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const key = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
  const store = new MoveChangeSetStore({ stateRoot, masterKey: key });
  const participantAdapter = {
    probe(manifest, participant) {
      if (participant !== "original_change_set" || manifest.schemaVersion !== 2) return "unknown";
      const reference = manifest.participantReferences.original_change_set ?? "";
      const originalId = reference.replace(/^original_change_set:/, "");
      try {
        const original = store.read(manifest.workspaceStateKey, originalId);
        return original.state === "undone" ? "present" : original.state === "active" ? "absent" : "unknown";
      } catch {
        return "unknown";
      }
    }
  };
  const recovery = createDefaultTransactionRecoveryCoordinator(config, {
    stateRoot,
    participantAdapter
  });
  let injected = false;
  const engine = new AtomicTransactionEngine(
    config,
    new PathGuard(config),
    stateRoot,
    registry,
    {
      recoveryCoordinator: recovery,
      faultInjector: {
        hit(point, facts) {
          if (
            !injected &&
            point === "after_each_participant_effect_before_manifest" &&
            facts.participantIndex === 2
          ) {
            injected = true;
            throw new Error("simulated participant-fact crash");
          }
        }
      }
    }
  );
  const move = new MovePathsService({ engine, changeSetStore: store });
  const undo = new MoveUndoChangeSetService({
    engine,
    moveChangeSetStore: store,
    guard: new PathGuard(config)
  });
  try {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
    const originalId = await commitMove({ workspace, move }, [
      { source: "a.txt", destination: "b.txt", expectedSha256: sha("alpha") }
    ]);
    const prepared = await undo.prepare(undoInput(workspace, originalId, false));
    await assert.rejects(
      () => prepared.pending.commit({ result: { ok: true }, async persistAudit() {} }),
      (error) => error?.code === "TRANSACTION_RECOVERY_REQUIRED"
    );
    const workspaceKey = engine.workspaceStateKey(workspace.root);
    assert.equal(store.read(workspaceKey, originalId).state, "undone");
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });

    await recovery.ensureWorkspaceReady(workspaceRoot);
    const transactionStore = new TransactionManifestV2Store(stateRoot, key);
    try {
      const recovered = transactionStore.read(workspaceKey, prepared.pending.transactionId);
      assert.equal(recovered.state, "committed");
      assert.equal(recovered.participantFacts.original_change_set, "committed");
    } finally {
      transactionStore.dispose();
    }
    assert.equal(store.read(workspaceKey, originalId).state, "undone");
    assert.equal(store.read(workspaceKey, prepared.changeSetId).state, "active");
  } finally {
    store.dispose();
    key.fill(0);
    recovery.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
});

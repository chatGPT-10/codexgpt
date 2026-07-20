import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathGuard } from "../dist/guard.js";
import {
  AtomicWorkspaceFs,
  TransactionManifestStore,
  TransactionManifestV2Store,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot
} from "../dist/transactions/index.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(action) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-phase3d-recovery-"));
  const root = await fsp.realpath(raw);
  const workspaceRoot = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await fsp.mkdir(workspaceRoot);
  const workspace = { id: "ws_recovery", root: workspaceRoot, openedAt: "2026-07-15T00:00:00.000Z" };
  const config = {
    blockedGlobs: [],
    maxWriteBytes: 1024 * 1024,
    moveMaxFileBytes: 64 * 1024 * 1024
  };
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
    updatedAt: "2026-07-15T00:00:01.000Z"
  };
}

async function createPendingV1({ workspaceRoot, stateRoot, workspace, config }, participants) {
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  const prepared = await atomicFs.stageCreate("op_create_visible", "visible.txt", Buffer.from("visible"));
  const installed = await atomicFs.install(prepared);
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
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    state: "preparing",
    operations: [installed.operation],
    createdDirectories: [],
    requiredParticipants: participants,
    participantFacts: Object.fromEntries(participants.map((name) => [name, "pending"]))
  };
  store.writeInitial(initial);
  const pending = nextManifest(initial, { state: "committed_pending_participants" });
  store.writeNext(initial, pending);
  return { store, workspaceStateKey, prepared, pending };
}

test("V1 recovery completes commit only when every participant effect is present", () => fixture(async (context) => {
  const evidence = await createPendingV1(context, ["audit", "change_set"]);
  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: {
      probe() { return "present"; }
    }
  });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  assert.equal(await fsp.readFile(path.join(context.workspaceRoot, "visible.txt"), "utf8"), "visible");
  await assert.rejects(() => fsp.stat(evidence.prepared.stageAbsPath), { code: "ENOENT" });
  const recovered = evidence.store.list(evidence.workspaceStateKey).at(-1);
  assert.equal(recovered.state, "committed");
  assert.deepEqual(recovered.participantFacts, { audit: "committed", change_set: "committed" });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  coordinator.dispose();
}));

test("V1 recovery restores before-state when no participant effect is present", () => fixture(async (context) => {
  const evidence = await createPendingV1(context, ["audit", "change_set"]);
  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: {
      probe() { return "absent"; }
    }
  });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, "visible.txt")), { code: "ENOENT" });
  assert.equal(evidence.store.list(evidence.workspaceStateKey).at(-1).state, "rolled_back");
  coordinator.dispose();
}));

test("V1 recovery compensates partial participant effects before rollback", () => fixture(async (context) => {
  const evidence = await createPendingV1(context, ["audit", "change_set"]);
  const compensations = [];
  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: {
      probe(_manifest, participant) {
        return participant === "audit" ? "present" : "absent";
      },
      compensatePartial(manifest, present) {
        compensations.push({ transactionId: manifest.transactionId, present: [...present] });
      }
    }
  });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  assert.deepEqual(compensations, [{ transactionId: evidence.pending.transactionId, present: ["audit"] }]);
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, "visible.txt")), { code: "ENOENT" });
  const recovered = evidence.store.list(evidence.workspaceStateKey).at(-1);
  assert.equal(recovered.state, "rolled_back");
  assert.match(recovered.failureMessage, /compensated/i);
  coordinator.dispose();
}));

test("V1 recovery freezes on unknown participant evidence", () => fixture(async (context) => {
  await createPendingV1(context, ["audit"]);
  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: {
      probe() { return "unknown"; }
    }
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      () => coordinator.ensureWorkspaceReady(context.workspaceRoot),
      (error) => error.code === "TRANSACTION_RECOVERY_REQUIRED"
    );
  }
  assert.equal(await fsp.readFile(path.join(context.workspaceRoot, "visible.txt"), "utf8"), "visible");
  coordinator.dispose();
}));

async function moveFacts(workspaceRoot, sourceName, destinationName, content) {
  const source = path.join(workspaceRoot, sourceName);
  const destination = path.join(workspaceRoot, destinationName);
  const stage = path.join(workspaceRoot, ".codexgpt-txn-1234567890abcdef.move");
  await fsp.writeFile(source, content);
  const stat = await fsp.lstat(source, { bigint: true });
  const workspace = { id: "ws_move_facts", root: workspaceRoot, openedAt: "2026-07-15T00:00:00.000Z" };
  const guard = new PathGuard({ blockedGlobs: [] });
  const sourceFacts = guard.resolvePolicyFacts(workspace, sourceName, { forWrite: true });
  const destinationFacts = guard.resolvePolicyFacts(workspace, destinationName, { forWrite: true });
  const operation = {
    operationId: "op_move_001",
    kind: "move",
    state: "installed",
    sourceRelativePath: sourceFacts.relPath,
    destinationRelativePath: destinationFacts.relPath,
    sourceComparisonKey: sourceFacts.comparisonKey,
    destinationComparisonKey: destinationFacts.comparisonKey,
    sourceExistingParentRelativePath: path.relative(workspaceRoot, sourceFacts.existingParent).replaceAll("\\", "/") || ".",
    sourceExistingParentIdentity: sourceFacts.existingParentIdentity,
    destinationExistingParentRelativePath: path.relative(workspaceRoot, destinationFacts.existingParent).replaceAll("\\", "/") || ".",
    destinationExistingParentIdentity: destinationFacts.existingParentIdentity,
    stageRelativePath: path.basename(stage),
    objectIdentity: { device: stat.dev.toString(), fileId: stat.ino.toString() },
    version: {
      sha256: digest(content),
      bytes: Buffer.byteLength(content),
      mode: Number(stat.mode),
      atimeMs: Number(stat.atimeNs) / 1_000_000,
      mtimeMs: Number(stat.mtimeNs) / 1_000_000,
      ctimeMs: Number(stat.ctimeNs) / 1_000_000
    }
  };
  await fsp.link(source, stage);
  await fsp.unlink(source);
  await fsp.link(stage, destination);
  await fsp.unlink(stage);
  return { source, destination, stage, operation };
}

function v2Manifest(workspaceStateKey, operation, patch = {}) {
  return {
    schemaVersion: 2,
    transactionId: "tx_" + "3".repeat(32),
    changeSetId: "cs_" + "4".repeat(32),
    workspaceStateKey,
    generation: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    state: "committing",
    operations: [operation],
    plannedCreatedDirectories: [],
    createdDirectories: [],
    createdDirectoryIdentities: {},
    plannedRemovedDirectories: [],
    plannedRemovedDirectoryIdentities: {},
    removedDirectories: [],
    requiredParticipants: [],
    participantReferences: {},
    participantFacts: {},
    ...patch
  };
}

function persistV2CrashState(store, desired) {
  const initial = {
    ...desired,
    generation: 1,
    state: "preparing",
    operations: desired.operations.map((operation) => ({
      ...operation,
      state: "planned"
    }))
  };
  store.writeInitial(initial);
  const persisted = store.read(initial.workspaceStateKey, initial.transactionId);
  store.writeNext(persisted, {
    ...desired,
    generation: 2,
    updatedAt: "2026-07-15T00:00:01.000Z"
  });
}

test("V2 crash recovery restores before-state after source removal and destination installation", () => fixture(async (context) => {
  const facts = await moveFacts(context.workspaceRoot, "a.txt", "b.txt", "alpha");
  const installation = loadOrCreateInstallationState({ stateRoot: context.stateRoot });
  const key = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(context.workspaceRoot, key);
  const store = new TransactionManifestV2Store(context.stateRoot, key);
  persistV2CrashState(store, v2Manifest(workspaceStateKey, facts.operation));
  store.dispose();
  key.fill(0);

  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, { stateRoot: context.stateRoot });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  assert.equal(await fsp.readFile(facts.source, "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(facts.destination), { code: "ENOENT" });
  await assert.rejects(() => fsp.stat(facts.stage), { code: "ENOENT" });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  coordinator.dispose();
}));

test("V2 pending-participant recovery completes commit when all durable effects are present", () => fixture(async (context) => {
  const facts = await moveFacts(context.workspaceRoot, "a.txt", "b.txt", "alpha");
  const installation = loadOrCreateInstallationState({ stateRoot: context.stateRoot });
  const key = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(context.workspaceRoot, key);
  const store = new TransactionManifestV2Store(context.stateRoot, key);
  persistV2CrashState(store, v2Manifest(workspaceStateKey, facts.operation, {
    state: "committed_pending_participants",
    requiredParticipants: ["audit", "change_set"],
    participantReferences: { audit: "audit:tx_333", change_set: "change_set:cs_444" },
    participantFacts: { audit: "pending", change_set: "pending" }
  }));
  store.dispose();
  key.fill(0);

  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: { probe() { return "present"; } }
  });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  await assert.rejects(() => fsp.stat(facts.source), { code: "ENOENT" });
  assert.equal(await fsp.readFile(facts.destination, "utf8"), "alpha");
  const verifyKey = installationMasterKey(loadOrCreateInstallationState({ stateRoot: context.stateRoot }));
  const verifyStore = new TransactionManifestV2Store(context.stateRoot, verifyKey);
  const recovered = verifyStore.read(workspaceStateKey, "tx_" + "3".repeat(32));
  assert.equal(recovered.state, "committed");
  assert.equal(recovered.operations[0].state, "finalized");
  verifyStore.dispose();
  verifyKey.fill(0);
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  coordinator.dispose();
}));

test("V2 partial participant recovery compensates then restores before-state", () => fixture(async (context) => {
  const facts = await moveFacts(context.workspaceRoot, "a.txt", "b.txt", "alpha");
  const installation = loadOrCreateInstallationState({ stateRoot: context.stateRoot });
  const key = installationMasterKey(installation);
  const workspaceStateKey = workspaceStateKeyForRoot(context.workspaceRoot, key);
  const store = new TransactionManifestV2Store(context.stateRoot, key);
  persistV2CrashState(store, v2Manifest(workspaceStateKey, facts.operation, {
    state: "committed_pending_participants",
    requiredParticipants: ["audit", "change_set"],
    participantReferences: { audit: "audit:tx_333", change_set: "change_set:cs_444" },
    participantFacts: { audit: "pending", change_set: "pending" }
  }));
  store.dispose();
  key.fill(0);
  const compensated = [];
  const coordinator = createDefaultTransactionRecoveryCoordinator(context.config, {
    stateRoot: context.stateRoot,
    participantAdapter: {
      probe(_manifest, participant) { return participant === "audit" ? "present" : "absent"; },
      compensatePartial(manifest, present) { compensated.push([manifest.schemaVersion, ...present]); }
    }
  });
  await coordinator.ensureWorkspaceReady(context.workspaceRoot);
  assert.deepEqual(compensated, [[2, "audit"]]);
  assert.equal(await fsp.readFile(facts.source, "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(facts.destination), { code: "ENOENT" });
  coordinator.dispose();
}));

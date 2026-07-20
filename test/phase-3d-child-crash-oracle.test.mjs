import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  TransactionManifestV2Store,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot
} from "../dist/transactions/index.js";

const childScript = fileURLToPath(new URL("../fixtures/phase-3d-move-crash-child.mjs", import.meta.url));
const config = {
  blockedGlobs: [],
  maxWriteBytes: 1024 * 1024,
  moveMaxFileBytes: 64 * 1024 * 1024,
  moveMaxTotalBytes: 256 * 1024 * 1024,
  moveHashConcurrency: 4
};

const rollbackFaults = [
  "after_manifest_preparing",
  "after_manifest_prepared",
  "after_manifest_committing",
  "before_each_directory_create",
  "after_each_directory_create",
  "before_each_stage_link",
  "after_each_stage_link_before_manifest",
  "after_each_stage",
  "before_each_source_unlink",
  "after_each_source_unlink_before_manifest",
  "before_each_destination_link",
  "after_each_destination_link_before_manifest",
  "before_each_stage_unlink",
  "after_each_stage_unlink_before_manifest",
  "after_each_install"
];
const commitFaults = [
  "after_manifest_pending_participants",
  "after_manifest_commit_decided",
  "after_manifest_committed"
];
const frozenFaults = ["after_each_directory_create_before_manifest"];

async function childExit(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childScript, JSON.stringify(input)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function exists(file) {
  try {
    await fsp.lstat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function transactionArtifacts(directory) {
  if (!await exists(directory)) return [];
  const result = [];
  const visit = async (current) => {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.name.startsWith(".codexgpt-txn-")) result.push(absolute);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(absolute);
    }
  };
  await visit(directory);
  return result;
}

async function runFaultOracle(faultPoint, expected) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-phase3d-child-crash-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  try {
    const exited = await childExit({ stateRoot, workspaceRoot, faultPoint });
    assert.equal(exited.code, 86, `${faultPoint}: ${exited.stderr || exited.stdout}`);

    const recovery = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
    let recoveryError = null;
    try {
      await recovery.ensureWorkspaceReady(workspaceRoot);
    } catch (error) {
      recoveryError = error;
    }

    const installation = loadOrCreateInstallationState({ stateRoot });
    const key = installationMasterKey(installation);
    const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, key);
    const store = new TransactionManifestV2Store(stateRoot, key);
    try {
      const manifests = store.list(workspaceStateKey);
      assert.equal(manifests.length, 1);
      const manifest = manifests[0];
      if (expected === "rollback") {
        assert.equal(recoveryError, null);
        assert.equal(manifest.state, "rolled_back");
        assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
        assert.equal(await exists(path.join(workspaceRoot, "nested")), false);
        assert.deepEqual(await transactionArtifacts(workspaceRoot), []);
        await recovery.ensureWorkspaceReady(workspaceRoot);
        assert.equal(store.read(workspaceStateKey, manifest.transactionId).state, "rolled_back");
      } else if (expected === "commit") {
        assert.equal(recoveryError, null);
        assert.equal(manifest.state, "committed");
        assert.equal(await exists(path.join(workspaceRoot, "a.txt")), false);
        assert.equal(
          await fsp.readFile(path.join(workspaceRoot, "nested", "deeper", "b.txt"), "utf8"),
          "alpha"
        );
        assert.deepEqual(await transactionArtifacts(workspaceRoot), []);
        await recovery.ensureWorkspaceReady(workspaceRoot);
        assert.equal(store.read(workspaceStateKey, manifest.transactionId).state, "committed");
      } else {
        assert.equal(recoveryError?.code, "TRANSACTION_RECOVERY_REQUIRED");
        assert.equal(manifest.state, "recovery_required");
        assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
        assert.deepEqual(await transactionArtifacts(workspaceRoot), []);
        await assert.rejects(
          () => recovery.ensureWorkspaceReady(workspaceRoot),
          (error) => error?.code === "TRANSACTION_RECOVERY_REQUIRED"
        );
      }
    } finally {
      store.dispose();
      key.fill(0);
      recovery.dispose();
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test("real child-process crashes satisfy the deterministic move state oracle", async (context) => {
  for (const faultPoint of rollbackFaults) {
    await context.test(`${faultPoint} restores exact before-state`, () => runFaultOracle(faultPoint, "rollback"));
  }
  for (const faultPoint of commitFaults) {
    await context.test(`${faultPoint} completes the durable commit`, () => runFaultOracle(faultPoint, "commit"));
  }
  for (const faultPoint of frozenFaults) {
    await context.test(`${faultPoint} freezes with authenticated evidence`, () => runFaultOracle(faultPoint, "frozen"));
  }
});

async function runPostDecisionOracle(faultPoint, mode) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-phase3d-post-decision-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  const markerPath = path.join(root, "participant.marker");
  await fsp.mkdir(workspaceRoot);
  if (mode === "cleanup") {
    await fsp.mkdir(path.join(workspaceRoot, "nested", "deeper"), { recursive: true });
    await fsp.writeFile(path.join(workspaceRoot, "nested", "deeper", "b.txt"), "alpha");
  } else {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  }
  try {
    const exited = await childExit({ stateRoot, workspaceRoot, markerPath, faultPoint, mode });
    assert.equal(exited.code, 86, `${faultPoint}: ${exited.stderr || exited.stdout}`);
    const participantAdapter = mode === "participant" ? {
      async probe(_manifest, participant) {
        if (participant !== "probe") return "unknown";
        return await exists(markerPath) ? "present" : "absent";
      }
    } : undefined;
    const recovery = createDefaultTransactionRecoveryCoordinator(config, {
      stateRoot,
      participantAdapter
    });
    try {
      await recovery.ensureWorkspaceReady(workspaceRoot);
      const key = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
      const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, key);
      const store = new TransactionManifestV2Store(stateRoot, key);
      try {
        const [manifest] = store.list(workspaceStateKey);
        assert.equal(manifest.state, "committed");
        if (mode === "cleanup") {
          assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
          assert.equal(await exists(path.join(workspaceRoot, "nested")), false);
          assert.deepEqual(new Set(manifest.removedDirectories), new Set(["nested/deeper", "nested"]));
        } else {
          assert.equal(await exists(path.join(workspaceRoot, "a.txt")), false);
          assert.equal(
            await fsp.readFile(path.join(workspaceRoot, "nested", "deeper", "b.txt"), "utf8"),
            "alpha"
          );
          assert.equal(manifest.participantFacts.probe, "committed");
          assert.equal(await fsp.readFile(markerPath, "utf8"), "present");
        }
        assert.deepEqual(await transactionArtifacts(workspaceRoot), []);
        await recovery.ensureWorkspaceReady(workspaceRoot);
        assert.equal(store.read(workspaceStateKey, manifest.transactionId).state, "committed");
      } finally {
        store.dispose();
        key.fill(0);
      }
    } finally {
      recovery.dispose();
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test("real child crashes reconcile participant effect/fact boundaries", async (context) => {
  for (const faultPoint of [
    "after_each_participant_effect_before_manifest",
    "after_each_participant"
  ]) {
    await context.test(faultPoint, () => runPostDecisionOracle(faultPoint, "participant"));
  }
});

test("real child crashes complete post-decision directory cleanup idempotently", async (context) => {
  for (const faultPoint of [
    "after_manifest_commit_decided",
    "before_each_directory_remove",
    "after_each_directory_remove_before_manifest",
    "after_each_directory_remove"
  ]) {
    await context.test(faultPoint, () => runPostDecisionOracle(faultPoint, "cleanup"));
  }
});

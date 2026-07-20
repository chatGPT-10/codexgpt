import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TransactionManifestStore,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot
} from "../dist/transactions/index.js";

const childScript = fileURLToPath(
  new URL("../fixtures/transaction-crash-child.mjs", import.meta.url)
);

test("a process crash after the first visible install is recovered from persisted evidence", async () => {
  const created = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-crash-recovery-"));
  const root = await fsp.realpath(created);
  const workspaceRoot = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await fsp.mkdir(workspaceRoot);
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "old-a");
  await fsp.writeFile(path.join(workspaceRoot, "c.txt"), "old-c");
  try {
    const child = spawnSync(process.execPath, [childScript, stateRoot, workspaceRoot], {
      cwd: path.resolve(path.dirname(childScript), "../.."),
      encoding: "utf8",
      timeout: 30_000
    });
    assert.equal(child.status, 91, child.stderr || child.stdout);
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "new-a");
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "c.txt"), "utf8"), "old-c");

    const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
    const coordinator = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
    await coordinator.ensureWorkspaceReady(workspaceRoot);
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "old-a");
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "c.txt"), "utf8"), "old-c");
    await coordinator.ensureWorkspaceReady(workspaceRoot);

    const installation = loadOrCreateInstallationState({ stateRoot });
    const masterKey = installationMasterKey(installation);
    const workspaceStateKey = workspaceStateKeyForRoot(workspaceRoot, masterKey);
    masterKey.fill(0);
    const manifests = new TransactionManifestStore(stateRoot).list(workspaceStateKey);
    assert.equal(manifests.at(-1).state, "rolled_back");
    coordinator.dispose();
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

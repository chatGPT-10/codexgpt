import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MoveChangeSetStore } from "../dist/changesets/index.js";
import { PathGuard } from "../dist/guard.js";
import { MovePathsService } from "../dist/moves/index.js";
import { pendingWorkspaceMutation } from "../dist/mutations/index.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  createDefaultTransactionRecoveryCoordinator,
  installationMasterKey,
  loadOrCreateInstallationState
} from "../dist/transactions/index.js";
import { movePathsOutputSchema } from "../dist/tools/schemas/movePaths.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(action) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-move-service-"));
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
  const workspace = { id: "ws_move_service", root: workspaceRoot, openedAt: "2026-07-15T00:00:00.000Z" };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const recovery = createDefaultTransactionRecoveryCoordinator(config, { stateRoot });
  const engine = new AtomicTransactionEngine(config, new PathGuard(config), stateRoot, registry, {
    recoveryCoordinator: recovery
  });
  const key = installationMasterKey(loadOrCreateInstallationState({ stateRoot }));
  const store = new MoveChangeSetStore({ stateRoot, masterKey: key });
  const service = new MovePathsService({ engine, changeSetStore: store });
  try {
    return await action({ workspaceRoot, workspace, engine, store, service });
  } finally {
    store.dispose();
    key.fill(0);
    recovery.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function input(workspace, preview = false, contractVersion = 2) {
  return {
    workspace,
    moves: [{ source: "a.txt", destination: "b.txt", expectedSha256: sha("alpha") }],
    createParents: false,
    preview,
    requestId: "request_move",
    ownerBinding: "owner_" + "1".repeat(64),
    policyRevision: "policy_phase3d",
    contractVersion
  };
}

test("move service preview returns a valid result and no pending mutation", () => fixture(async ({ workspaceRoot, workspace, service }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const result = await service.prepare(input(workspace, true));
  assert.equal(result.isError, undefined);
  assert.equal(pendingWorkspaceMutation(result), null);
  assert.equal(movePathsOutputSchema.safeParse(result.structuredContent).success, true);
  assert.equal(result.structuredContent.data.preview, true);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
}));

test("move service publishes audit and zero-blob change set before returning committed success", () => fixture(async ({ workspaceRoot, workspace, engine, store, service }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const preparedResult = await service.prepare(input(workspace, false, 3));
  const pending = pendingWorkspaceMutation(preparedResult);
  assert.ok(pending);
  let audited = 0;
  const final = await pending.commit({
    result: preparedResult,
    async persistAudit() { audited += 1; }
  });
  assert.equal(audited, 1);
  assert.equal(movePathsOutputSchema.safeParse(final.structuredContent).success, true);
  assert.equal(final.structuredContent.data.preview, false);
  assert.equal(final.structuredContent.data.transaction.change_set_id, pending.changeSetId);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "a.txt")), { code: "ENOENT" });
  const manifest = store.read(engine.workspaceStateKey(workspace.root), pending.changeSetId);
  assert.equal(manifest.plaintextBytes, 0);
  assert.equal(manifest.ciphertextBytes, 0);
  assert.equal(manifest.operations[0].sourceRelativePath, "a.txt");
  assert.equal(manifest.operations[0].destinationRelativePath, "b.txt");
  assert.equal(manifest.contractVersion, 3);
}));

test("move prepare follows a completed V1 transaction on the same recovery coordinator", () => fixture(async ({
  workspaceRoot, workspace, engine, service
}) => {
  const preparedWrite = await engine.prepare({
    workspace,
    operations: [{
      operationId: "op_seed_v1",
      kind: "create",
      relativePath: "a.txt",
      bytes: Buffer.from("alpha"),
      expectedAbsent: true
    }],
    requiredParticipants: []
  });
  const pendingWrite = await preparedWrite.commit();
  await pendingWrite.finalize();
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");

  const result = await service.prepare(input(workspace));
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  await pendingWorkspaceMutation(result).rollback("test_cleanup");
}));

test("move service rolls back when required audit persistence fails", () => fixture(async ({ workspaceRoot, workspace, service }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const preparedResult = await service.prepare(input(workspace));
  const pending = pendingWorkspaceMutation(preparedResult);
  await assert.rejects(
    () => pending.commit({
      result: preparedResult,
      async persistAudit() { throw new Error("audit unavailable"); }
    }),
    /Audit|audit/i
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
  const projected = pending.projectFailure(new Error("audit unavailable"), preparedResult);
  assert.equal(projected.isError, true);
  assert.equal(projected.structuredContent.ok, false);
}));

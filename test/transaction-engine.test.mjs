import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathGuard } from "../dist/guard.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  TransactionManifestStore
} from "../dist/transactions/index.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-engine-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state-outside-workspace");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = { id: "ws_fixture", root: workspaceRoot, openedAt: "2026-07-14T00:00:00.000Z" };
  const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, new PathGuard(config), stateRoot, registry, options);
  try {
    return await action({ root, stateRoot, workspaceRoot, workspace, engine });
  } finally {
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function request(workspace) {
  return {
    workspace,
    requiredParticipants: ["audit"],
    operations: [
      { operationId: "op_replace_a", kind: "replace", relativePath: "a.txt", bytes: Buffer.from("new-a"), expectedSha256: digest("old-a") },
      { operationId: "op_create_b", kind: "create", relativePath: "b.txt", bytes: Buffer.from("new-b"), expectedAbsent: true },
      { operationId: "op_delete_c", kind: "delete", relativePath: "c.txt", expectedSha256: digest("old-c") }
    ]
  };
}

async function seed(workspaceRoot) {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "old-a");
  await fsp.writeFile(path.join(workspaceRoot, "c.txt"), "old-c");
}

async function assertBefore(workspaceRoot) {
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "old-a");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "c.txt"), "utf8"), "old-c");
}

test("three-operation transaction gates finalization on required participants", () => fixture(async ({ workspaceRoot, workspace, engine, stateRoot }) => {
  await seed(workspaceRoot);
  const prepared = await engine.prepare(request(workspace));
  await assertBefore(workspaceRoot);
  const pending = await prepared.commit();
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "new-a");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "new-b");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "c.txt")), { code: "ENOENT" });
  await assert.rejects(() => pending.finalize(), /participant/i);
  await assert.rejects(() => pending.commitParticipant("unknown", async () => {}), /participant/i);
  await pending.commitParticipant("audit", async () => {});
  await assert.rejects(() => pending.commitParticipant("audit", async () => {}), /already/i);
  const committed = await pending.finalize();
  assert.match(committed.transactionId, /^tx_[a-f0-9]{32}$/);
  assert.match(committed.changeSetId, /^cs_[a-f0-9]{32}$/);
  assert.equal(committed.operationCount, 3);
  assert.equal(committed.cleanupPending, false);
  const manifests = new TransactionManifestStore(stateRoot).list(
    engine.workspaceStateKey(workspace.root)
  );
  assert.equal(manifests.at(-1).state, "committed");
}));

test("all operations stage before deterministic visible installation", () => {
  const installed = [];
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    await seed(workspaceRoot);
    const original = request(workspace);
    const prepared = await engine.prepare({
      ...original,
      operations: [original.operations[2], original.operations[1], original.operations[0]]
    });
    await assertBefore(workspaceRoot);
    await prepared.commit();
    assert.deepEqual(installed, ["op_replace_a", "op_create_b", "op_delete_c"]);
  }, {
    faultInjector: {
      hit(point, facts) {
        if (point === "after_each_install") installed.push(facts.operationId);
      }
    }
  });
});

test("duplicate comparison paths reject before manifest creation", () => fixture(async ({ workspace, engine, stateRoot }) => {
  const duplicate = {
    workspace,
    requiredParticipants: [],
    operations: [
      { operationId: "op_a", kind: "create", relativePath: "same.txt", bytes: Buffer.from("a"), expectedAbsent: true },
      { operationId: "op_b", kind: "create", relativePath: "same.txt", bytes: Buffer.from("b"), expectedAbsent: true }
    ]
  };
  await assert.rejects(() => engine.prepare(duplicate), /duplicate/i);
  assert.deepEqual(new TransactionManifestStore(stateRoot).list(engine.workspaceStateKey(workspace.root)), []);
}));

for (const failAfter of [1, 2]) {
  test(`failure after install ${failAfter} restores complete before-state`, () => {
    let installs = 0;
    return fixture(async ({ workspaceRoot, workspace, engine }) => {
      await seed(workspaceRoot);
      const prepared = await engine.prepare(request(workspace));
      await assert.rejects(
        () => prepared.commit(),
        (error) => error.code === "TRANSACTION_FAILED"
      );
      await assertBefore(workspaceRoot);
    }, {
      faultInjector: {
        hit(point) {
          if (point === "after_each_install" && ++installs === failAfter) throw new Error("injected install failure");
        }
      }
    });
  });
}

test("participant failure rolls back while before-state evidence is retained", () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await seed(workspaceRoot);
  const pending = await (await engine.prepare(request(workspace))).commit();
  await assert.rejects(
    () => pending.commitParticipant("audit", async () => { throw new Error("audit unavailable"); }),
    (error) => error.code === "TRANSACTION_FAILED"
  );
  await assertBefore(workspaceRoot);
  await assert.rejects(() => pending.finalize(), /state/i);
}));

test("public engine failures do not expose absolute workspace roots", () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await seed(workspaceRoot);
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "drift");
  try {
    await engine.prepare(request(workspace));
    assert.fail("expected conflict");
  } catch (error) {
    assert.equal(error.code, "FILE_VERSION_CONFLICT");
    assert.equal(String(error.message).includes(workspaceRoot), false);
    assert.equal(JSON.stringify(error.safeDetails).includes(workspaceRoot), false);
  }
}));

test("create transactions stage before visibility and atomically create missing parent directories", () => fixture(async ({ workspaceRoot, workspace, engine, stateRoot }) => {
  const prepared = await engine.prepare({
    workspace,
    requiredParticipants: [],
    operations: [{
      operationId: "op_nested_create",
      kind: "create",
      relativePath: ".ai-bridge/current-plan.md",
      bytes: Buffer.from("# Plan\n"),
      expectedAbsent: true
    }]
  });
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
  const pending = await prepared.commit();
  const committed = await pending.finalize();
  assert.equal(committed.operationCount, 1);
  assert.equal(
    await fsp.readFile(path.join(workspaceRoot, ".ai-bridge", "current-plan.md"), "utf8"),
    "# Plan\n"
  );
  const manifests = new TransactionManifestStore(stateRoot).list(engine.workspaceStateKey(workspace.root));
  assert.deepEqual(manifests.at(-1).createdDirectories, [".ai-bridge"]);
}));

test("failure after a transaction-owned directory creation removes the empty directory and all staged artifacts", () => {
  let failed = false;
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    const prepared = await engine.prepare({
      workspace,
      requiredParticipants: [],
      operations: [{
        operationId: "op_nested_create",
        kind: "create",
        relativePath: ".ai-bridge/current-plan.md",
        bytes: Buffer.from("# Plan\n"),
        expectedAbsent: true
      }]
    });
    await assert.rejects(
      () => prepared.commit(),
      (error) => error.code === "TRANSACTION_FAILED"
    );
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
    assert.deepEqual(
      (await fsp.readdir(workspaceRoot)).filter((name) => name.startsWith(".codexgpt-txn-")),
      []
    );
  }, {
    faultInjector: {
      hit(point) {
        if (point === "after_each_directory_create" && !failed) {
          failed = true;
          throw new Error("injected directory failure");
        }
      }
    }
  });
});

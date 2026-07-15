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
  TransactionManifestV2Store,
  installationMasterKey,
  loadOrCreateInstallationState
} from "../dist/transactions/index.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-move-engine-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = { id: "ws_move", root: workspaceRoot, openedAt: "2026-07-15T00:00:00.000Z" };
  const { configOverrides = {}, ...engineOptions } = options;
  const config = {
    blockedGlobs: [],
    maxWriteBytes: 1024 * 1024,
    moveMaxFileBytes: 64 * 1024 * 1024,
    moveMaxTotalBytes: 256 * 1024 * 1024,
    moveHashConcurrency: 4,
    ...configOverrides
  };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, new PathGuard(config), stateRoot, registry, engineOptions);
  try {
    return await action({ root, stateRoot, workspaceRoot, workspace, engine });
  } finally {
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function request(workspace, moves, overrides = {}) {
  return {
    workspace,
    moves,
    createParents: false,
    requiredParticipants: [],
    participantReferences: {},
    ...overrides
  };
}

async function absent(file) {
  await assert.rejects(() => fsp.lstat(file), { code: "ENOENT" });
}

test("move engine commits a no-clobber move with parents and participant-gated commit_decided", () => fixture(async ({ stateRoot, workspaceRoot, workspace, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const prepared = await engine.prepareMove(request(workspace, [{
    source: "a.txt",
    destination: "nested/b.txt",
    expectedSha256: digest("alpha")
  }], {
    createParents: true,
    requiredParticipants: ["audit", "change_set"],
    participantReferences: {
      audit: "audit:tx_reference",
      change_set: "change_set:cs_reference"
    }
  }));
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
  await absent(path.join(workspaceRoot, "nested"));
  const pending = await prepared.commit();
  await absent(path.join(workspaceRoot, "a.txt"));
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "nested", "b.txt"), "utf8"), "alpha");
  await assert.rejects(() => pending.finalize(), /participant/i);
  await pending.commitParticipant("audit", async () => {});
  await pending.commitParticipant("change_set", async () => {});
  const committed = await pending.finalize();
  assert.equal(committed.operationCount, 1);
  assert.equal(committed.cleanupPending, false);
  const installation = loadOrCreateInstallationState({ stateRoot });
  const key = installationMasterKey(installation);
  const store = new TransactionManifestV2Store(stateRoot, key);
  try {
    const manifest = store.read(engine.workspaceStateKey(workspace.root), committed.transactionId);
    assert.equal(manifest.state, "committed");
    assert.equal(manifest.operations[0].state, "finalized");
    assert.deepEqual(manifest.createdDirectories, ["nested"]);
    assert.deepEqual(manifest.participantFacts, { audit: "committed", change_set: "committed" });
  } finally {
    store.dispose();
    key.fill(0);
  }
}));

test("move engine performs cycles and duplicate-object hard-link moves through stage-all/install-all", () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
  await fsp.writeFile(path.join(workspaceRoot, "b.txt"), "B");
  await fsp.link(path.join(workspaceRoot, "a.txt"), path.join(workspaceRoot, "alias.txt"));
  const pending = await (await engine.prepareMove(request(workspace, [
    { source: "a.txt", destination: "b.txt", expectedSha256: digest("A") },
    { source: "b.txt", destination: "a.txt", expectedSha256: digest("B") },
    { source: "alias.txt", destination: "alias-moved.txt", expectedSha256: digest("A") }
  ]))).commit();
  await pending.finalize();
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "B");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "A");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "alias-moved.txt"), "utf8"), "A");
  await absent(path.join(workspaceRoot, "alias.txt"));
}));

test("prepared move rollback leaves exact before-state and no transaction artifacts", () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
  const prepared = await engine.prepareMove(request(workspace, [{
    source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
  }]));
  await prepared.rollback("caller_cancelled");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
  await absent(path.join(workspaceRoot, "b.txt"));
  assert.deepEqual((await fsp.readdir(workspaceRoot)).sort(), ["a.txt"]);
}));

test("fault after installed move restores complete cycle before-state", () => {
  let installs = 0;
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
    await fsp.writeFile(path.join(workspaceRoot, "b.txt"), "B");
    const prepared = await engine.prepareMove(request(workspace, [
      { source: "a.txt", destination: "b.txt", expectedSha256: digest("A") },
      { source: "b.txt", destination: "a.txt", expectedSha256: digest("B") }
    ]));
    await assert.rejects(() => prepared.commit(), (error) => error.code === "TRANSACTION_FAILED");
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "B");
    assert.deepEqual((await fsp.readdir(workspaceRoot)).sort(), ["a.txt", "b.txt"]);
  }, {
    faultInjector: {
      hit(point) {
        if (point === "after_each_install" && ++installs === 1) throw new Error("injected move install failure");
      }
    }
  });
});

test("participant failure restores before-state while retaining authenticated recovery evidence", () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
  const pending = await (await engine.prepareMove(request(workspace, [{
    source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
  }], {
    requiredParticipants: ["audit"],
    participantReferences: { audit: "audit:tx_reference" }
  }))).commit();
  await assert.rejects(
    () => pending.commitParticipant("audit", async () => { throw new Error("audit unavailable"); }),
    (error) => error.code === "TRANSACTION_FAILED"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
  await absent(path.join(workspaceRoot, "b.txt"));
}));

test("native Windows case-only move installs exact requested entry spelling", { skip: process.platform !== "win32" }, () => fixture(async ({ workspaceRoot, workspace, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "Case.txt"), "case");
  const pending = await (await engine.prepareMove(request(workspace, [{
    source: "Case.txt", destination: "case.txt", expectedSha256: digest("case")
  }]))).commit();
  await pending.finalize();
  assert.deepEqual(await fsp.readdir(workspaceRoot), ["case.txt"]);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "case.txt"), "utf8"), "case");
}));

test("external target creation after prepare never clobbers the target", () => fixture(async ({
  workspaceRoot,
  workspace,
  engine
}) => {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
  const prepared = await engine.prepareMove(request(workspace, [{
    source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
  }]));
  await fsp.writeFile(path.join(workspaceRoot, "b.txt"), "external");
  await assert.rejects(
    () => prepared.commit(),
    (error) => error?.code === "FILE_VERSION_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "external");
}));

test("external source replacement after prepare freezes instead of moving an unrelated object", () => {
  let replacementPath;
  let sourcePath;
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    sourcePath = path.join(workspaceRoot, "a.txt");
    replacementPath = path.join(workspaceRoot, "replacement.txt");
    await fsp.writeFile(sourcePath, "A");
    await fsp.writeFile(replacementPath, "A");
    const [originalStat, replacementStat] = await Promise.all([
      fsp.stat(sourcePath, { bigint: true }),
      fsp.stat(replacementPath, { bigint: true })
    ]);
    assert.notDeepEqual(
      { device: originalStat.dev, fileId: originalStat.ino },
      { device: replacementStat.dev, fileId: replacementStat.ino }
    );
    const prepared = await engine.prepareMove(request(workspace, [{
      source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
    }]));
    await assert.rejects(
      () => prepared.commit(),
      (error) => error?.code === "ROLLBACK_FAILED"
    );
    assert.equal(await fsp.readFile(sourcePath, "utf8"), "A");
    await absent(path.join(workspaceRoot, "b.txt"));
    await absent(replacementPath);
  }, {
    faultInjector: {
      async hit(point) {
        if (point !== "after_each_source_unlink_before_manifest") return;
        await fsp.rename(replacementPath, sourcePath);
        throw new Error("injected external source replacement");
      }
    }
  });
});

test("native Windows rejects a destination parent replaced by a junction after prepare", {
  skip: process.platform !== "win32"
}, () => fixture(async ({ root, workspaceRoot, workspace, engine }) => {
  const destinationParent = path.join(workspaceRoot, "target");
  const outside = path.join(root, "outside");
  await fsp.mkdir(destinationParent);
  await fsp.mkdir(outside);
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
  const prepared = await engine.prepareMove(request(workspace, [{
    source: "a.txt", destination: "target/b.txt", expectedSha256: digest("A")
  }]));
  await fsp.rmdir(destinationParent);
  await fsp.symlink(outside, destinationParent, "junction");
  await assert.rejects(
    () => prepared.commit(),
    (error) => error?.code === "FILE_VERSION_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
  await absent(path.join(outside, "b.txt"));
}));

test("injected EXDEV fails closed as an unavailable atomic backend without mutation", () => {
  let linkAttempts = 0;
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
    const prepared = await engine.prepareMove(request(workspace, [{
      source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
    }]));
    await assert.rejects(
      () => prepared.commit(),
      (error) => error?.code === "ATOMIC_BACKEND_UNAVAILABLE"
    );
    assert.equal(linkAttempts, 1);
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "A");
    await absent(path.join(workspaceRoot, "b.txt"));
    assert.deepEqual((await fsp.readdir(workspaceRoot)).sort(), ["a.txt"]);
  }, {
    moveFilesystem: {
      async link() {
        linkAttempts += 1;
        const error = new Error("cross-device link unavailable");
        error.code = "EXDEV";
        throw error;
      }
    }
  });
});

test("native Windows retries transient sharing failures with revalidation and a fixed bound", {
  skip: process.platform !== "win32"
}, () => {
  let stageAttempts = 0;
  return fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "A");
    const pending = await (await engine.prepareMove(request(workspace, [{
      source: "a.txt", destination: "b.txt", expectedSha256: digest("A")
    }]))).commit();
    await pending.finalize();
    assert.equal(stageAttempts, 3);
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "A");
    await absent(path.join(workspaceRoot, "a.txt"));
  }, {
    moveFilesystem: {
      async link(source, destination) {
        if (path.basename(destination).startsWith(".codexpro-txn-")) {
          stageAttempts += 1;
          if (stageAttempts < 3) {
            const error = new Error("simulated sharing violation");
            error.code = "EPERM";
            throw error;
          }
        }
        return fsp.link(source, destination);
      }
    }
  });
});

test("move engine accepts the exact 64-operation capacity with a complete cycle", () => fixture(async ({
  workspaceRoot,
  workspace,
  engine
}) => {
  const count = 64;
  const moves = [];
  for (let index = 0; index < count; index += 1) {
    const name = `f${String(index).padStart(2, "0")}.txt`;
    const content = `value-${index}`;
    await fsp.writeFile(path.join(workspaceRoot, name), content);
    moves.push({
      source: name,
      destination: `f${String((index + 1) % count).padStart(2, "0")}.txt`,
      expectedSha256: digest(content)
    });
  }
  const pending = await (await engine.prepareMove(request(workspace, moves))).commit();
  const committed = await pending.finalize();
  assert.equal(committed.operationCount, count);
  for (let index = 0; index < count; index += 1) {
    const destination = `f${String((index + 1) % count).padStart(2, "0")}.txt`;
    assert.equal(await fsp.readFile(path.join(workspaceRoot, destination), "utf8"), `value-${index}`);
  }
}));

test("move byte limits accept exact boundaries and reject one byte above with zero mutation", async () => {
  await fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "exact.txt"), "12345678");
    const pending = await (await engine.prepareMove(request(workspace, [{
      source: "exact.txt", destination: "moved.txt", expectedSha256: digest("12345678")
    }]))).commit();
    await pending.finalize();
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "moved.txt"), "utf8"), "12345678");
  }, { configOverrides: { moveMaxFileBytes: 8, moveMaxTotalBytes: 8 } });

  await fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "too-large.txt"), "123456789");
    await assert.rejects(
      () => engine.prepareMove(request(workspace, [{
        source: "too-large.txt", destination: "moved.txt", expectedSha256: digest("123456789")
      }])),
      (error) => error?.code === "TRANSACTION_PRECONDITION_FAILED"
    );
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "too-large.txt"), "utf8"), "123456789");
    await absent(path.join(workspaceRoot, "moved.txt"));
  }, { configOverrides: { moveMaxFileBytes: 8, moveMaxTotalBytes: 8 } });

  await fixture(async ({ workspaceRoot, workspace, engine }) => {
    await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "12345");
    await fsp.writeFile(path.join(workspaceRoot, "b.txt"), "6789");
    await assert.rejects(
      () => engine.prepareMove(request(workspace, [
        { source: "a.txt", destination: "c.txt", expectedSha256: digest("12345") },
        { source: "b.txt", destination: "d.txt", expectedSha256: digest("6789") }
      ])),
      (error) => error?.code === "TRANSACTION_PRECONDITION_FAILED"
    );
    assert.deepEqual((await fsp.readdir(workspaceRoot)).sort(), ["a.txt", "b.txt"]);
  }, { configOverrides: { moveMaxFileBytes: 8, moveMaxTotalBytes: 8 } });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deriveTransactionSubkey,
  loadOrCreateInstallationState,
  resolveTransactionStateRoot,
  transactionStateDirectories,
  workspaceStateKeyForRoot
} from "../dist/transactions/index.js";

function withTempDirectory(action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-transaction-installation-"));
  try {
    return action(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("transaction state root follows explicit and platform-specific resolution", () => {
  assert.equal(
    resolveTransactionStateRoot({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\Noah\\AppData\\Local" },
      homeDir: "C:\\Users\\Noah"
    }),
    path.win32.resolve("C:\\Users\\Noah\\AppData\\Local", "CodexPro", "state", "v1")
  );
  assert.equal(
    resolveTransactionStateRoot({
      platform: "linux",
      env: { XDG_STATE_HOME: "/tmp/state" },
      homeDir: "/home/noah"
    }),
    path.posix.resolve("/tmp/state", "codexpro", "v1")
  );
  assert.equal(
    resolveTransactionStateRoot({
      platform: "win32",
      env: { CODEXPRO_HOME: "~/codexpro-home" },
      homeDir: "C:\\Users\\Noah"
    }),
    path.win32.resolve("C:\\Users\\Noah", "codexpro-home", "state", "v1")
  );
  assert.throws(
    () => resolveTransactionStateRoot({ platform: "win32", env: {}, homeDir: "C:\\Users\\Noah" }),
    /LOCALAPPDATA/
  );
});

test("transaction state directory helpers remain below the selected root", () => {
  const root = path.resolve("fixture-state");
  const directories = transactionStateDirectories(root);
  for (const value of Object.values(directories)) {
    assert.equal(path.relative(root, value).startsWith(".."), false);
  }
  assert.equal(directories.installationFile, path.join(root, "installation.json"));
});

test("installation state is exclusively created, synced, and reused", () => withTempDirectory((stateRoot) => {
  let randomCall = 0;
  const first = loadOrCreateInstallationState({
    stateRoot,
    randomBytes(size) {
      randomCall += 1;
      return Buffer.alloc(size, randomCall);
    },
    now: () => Date.parse("2026-07-14T00:00:00.000Z")
  });
  const second = loadOrCreateInstallationState({
    stateRoot,
    randomBytes: (size) => Buffer.alloc(size, 9),
    now: () => Date.parse("2030-01-01T00:00:00.000Z")
  });
  assert.deepEqual(second, first);
  assert.equal(Buffer.from(first.masterKeyBase64, "base64").length, 32);
  assert.match(first.installationId, /^install_[a-f0-9]{32}$/);
  const stat = fs.statSync(path.join(stateRoot, "installation.json"));
  if (process.platform !== "win32") assert.equal(stat.mode & 0o777, 0o600);
}));

test("installation state is not visible until its complete bytes are durable", () => withTempDirectory((stateRoot) => {
  const installationFile = path.join(stateRoot, "installation.json");
  const originalWriteFileSync = fs.writeFileSync;
  let observedStateWrite = false;
  fs.writeFileSync = function patchedWriteFileSync(...args) {
    if (typeof args[0] === "number" && !observedStateWrite) {
      observedStateWrite = true;
      assert.equal(fs.existsSync(installationFile), false);
    }
    return originalWriteFileSync.apply(this, args);
  };
  try {
    const state = loadOrCreateInstallationState({
      stateRoot,
      randomBytes: (size) => Buffer.alloc(size, 4),
      now: () => Date.parse("2026-07-14T00:00:00.000Z")
    });
    assert.match(state.installationId, /^install_[a-f0-9]{32}$/);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  assert.equal(observedStateWrite, true);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(installationFile, "utf8")));
}));

test("a stale ENOENT observation converges on the concurrently published installation state", () => withTempDirectory((stateRoot) => {
  const installationFile = path.join(stateRoot, "installation.json");
  const expected = loadOrCreateInstallationState({
    stateRoot,
    randomBytes: (size) => Buffer.alloc(size, 5),
    now: () => Date.parse("2026-07-14T00:00:00.000Z")
  });
  const originalReadFileSync = fs.readFileSync;
  let injected = false;
  fs.readFileSync = function patchedReadFileSync(...args) {
    if (!injected && typeof args[0] === "string" && path.resolve(args[0]) === installationFile) {
      injected = true;
      throw Object.assign(new Error("simulated stale absence"), { code: "ENOENT" });
    }
    return originalReadFileSync.apply(this, args);
  };
  try {
    const observed = loadOrCreateInstallationState({
      stateRoot,
      randomBytes: (size) => Buffer.alloc(size, 6),
      now: () => Date.parse("2030-01-01T00:00:00.000Z")
    });
    assert.deepEqual(observed, expected);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(injected, true);
}));

test("installation state fails closed for malformed or unknown persisted data", () => withTempDirectory((stateRoot) => {
  fs.mkdirSync(stateRoot, { recursive: true });
  const installationFile = path.join(stateRoot, "installation.json");
  for (const content of [
    "{",
    JSON.stringify({ schemaVersion: 1 }),
    JSON.stringify({
      schemaVersion: 1,
      installationId: "install_" + "1".repeat(32),
      masterKeyBase64: Buffer.alloc(31).toString("base64"),
      createdAt: "2026-07-14T00:00:00.000Z"
    }),
    JSON.stringify({
      schemaVersion: 1,
      installationId: "install_bad",
      masterKeyBase64: Buffer.alloc(32).toString("base64"),
      createdAt: "2026-07-14T00:00:00.000Z",
      token: "forbidden"
    })
  ]) {
    fs.writeFileSync(installationFile, content, "utf8");
    assert.throws(() => loadOrCreateInstallationState({ stateRoot }), /installation state/i);
  }
}));

test("HKDF labels and workspace keys are domain-separated and platform-stable", () => {
  const masterA = Buffer.alloc(32, 1);
  const masterB = Buffer.alloc(32, 2);
  const labels = ["audit", "workspace-state", "changeset"];
  const derived = labels.map((label) => deriveTransactionSubkey(masterA, label).toString("hex"));
  assert.equal(new Set(derived).size, labels.length);
  assert.throws(() => deriveTransactionSubkey(Buffer.alloc(31), "audit"), /invalid length/i);

  const windowsA = workspaceStateKeyForRoot("C:\\Repo\\Example", masterA, "win32");
  const windowsB = workspaceStateKeyForRoot("c:/repo/example/", masterA, "win32");
  assert.equal(windowsA, windowsB);
  assert.notEqual(windowsA, workspaceStateKeyForRoot("C:\\Repo\\Example", masterB, "win32"));
  assert.notEqual(
    workspaceStateKeyForRoot("/repo/Example", masterA, "linux"),
    workspaceStateKeyForRoot("/repo/example", masterA, "linux")
  );
  assert.match(windowsA, /^wsk_[a-f0-9]{32}$/);
});

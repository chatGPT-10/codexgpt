import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFileTransactionConfiguration,
  loadConfig
} from "../dist/config.js";
import { isReservedTransactionRelativePath, PathGuard } from "../dist/guard.js";
import { createCodexGPTServer } from "../dist/server.js";

function withEnv(name, value, action) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("file transactions default to legacy and reject unknown modes", () => {
  withEnv("CODEXGPT_FILE_TRANSACTIONS", undefined, () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "legacy");
  });
  withEnv("CODEXGPT_FILE_TRANSACTIONS", "atomic", () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "atomic");
  });
  withEnv("CODEXGPT_FILE_TRANSACTIONS", "unsafe", () => {
    assert.throws(() => loadConfig(["--bash", "off"]), /legacy or atomic/);
  });
});

test("Phase 3A refuses atomic mode while public workspace writers are enabled", () => {
  const atomicWritable = withEnv("CODEXGPT_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "workspace"])
  );
  assert.throws(
    () => assertFileTransactionConfiguration(atomicWritable, { workspaceMutatorsAtomic: false }),
    /requires transaction-backed workspace mutators/i
  );
  assert.throws(
    () => createCodexGPTServer(atomicWritable),
    /requires transaction-backed workspace mutators/i
  );

  const atomicReadOnly = withEnv("CODEXGPT_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "off"])
  );
  assert.doesNotThrow(() =>
    assertFileTransactionConfiguration(atomicReadOnly, { workspaceMutatorsAtomic: false })
  );
});

test("reserved transaction artifacts are blocked by path segment", () => {
  const guard = new PathGuard({ blockedGlobs: [] }, "win32");
  for (const candidate of [
    ".codexgpt-txn-a.stage",
    "src/.codexgpt-txn-a.backup",
    "SRC/.CODEXGPT-TXN-A.MOVE",
    "nested/.codexgpt-txn-dir/child"
  ]) {
    assert.equal(isReservedTransactionRelativePath(candidate, "win32"), true);
    assert.equal(guard.isBlockedRelativePath(candidate), true);
  }
  assert.equal(guard.isBlockedRelativePath("src/codexgpt-txn-normal.ts"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFileTransactionConfiguration,
  loadConfig
} from "../dist/config.js";
import { isReservedTransactionRelativePath, PathGuard } from "../dist/guard.js";
import { createCodexProServer } from "../dist/server.js";

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
  withEnv("CODEXPRO_FILE_TRANSACTIONS", undefined, () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "legacy");
  });
  withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () => {
    assert.equal(loadConfig(["--bash", "off"]).fileTransactions, "atomic");
  });
  withEnv("CODEXPRO_FILE_TRANSACTIONS", "unsafe", () => {
    assert.throws(() => loadConfig(["--bash", "off"]), /legacy or atomic/);
  });
});

test("Phase 3A refuses atomic mode while public workspace writers are enabled", () => {
  const atomicWritable = withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "workspace"])
  );
  assert.throws(
    () => assertFileTransactionConfiguration(atomicWritable, { workspaceMutatorsAtomic: false }),
    /requires transaction-backed workspace mutators/i
  );
  assert.throws(
    () => createCodexProServer(atomicWritable),
    /requires transaction-backed workspace mutators/i
  );

  const atomicReadOnly = withEnv("CODEXPRO_FILE_TRANSACTIONS", "atomic", () =>
    loadConfig(["--bash", "off", "--write", "off"])
  );
  assert.doesNotThrow(() =>
    assertFileTransactionConfiguration(atomicReadOnly, { workspaceMutatorsAtomic: false })
  );
});

test("reserved transaction artifacts are blocked by path segment", () => {
  const guard = new PathGuard({ blockedGlobs: [] }, "win32");
  for (const candidate of [
    ".codexpro-txn-a.stage",
    "src/.codexpro-txn-a.backup",
    "SRC/.CODEXPRO-TXN-A.MOVE",
    "nested/.codexpro-txn-dir/child"
  ]) {
    assert.equal(isReservedTransactionRelativePath(candidate, "win32"), true);
    assert.equal(guard.isBlockedRelativePath(candidate), true);
  }
  assert.equal(guard.isBlockedRelativePath("src/codexpro-txn-normal.ts"), false);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitRepositoryStore } from "../dist/git/repositoryStore.js";

async function withStore(callback) {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-repository-store-"));
  const masterKey = Buffer.alloc(32, 7);
  const store = new GitRepositoryStore({ stateRoot, masterKey, now: () => 1_700_000_000_000, randomBytes: (size) => Buffer.alloc(size, 9) });
  try {
    await callback({ stateRoot, store, masterKey });
  } finally {
    store.dispose();
    masterKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}

function identity() {
  return {
    repositoryId: `repo_${"a".repeat(32)}`,
    worktreeRoot: "C:\\private\\repo",
    gitDir: "C:\\private\\repo\\.git",
    commonDir: "C:\\private\\repo\\.git",
    objectFormat: "sha1",
    refStorage: "files",
    capabilityRevision: "b".repeat(64),
    stableIdentityFingerprint: "c".repeat(64),
    repositoryFingerprint: "d".repeat(64),
    executionIsolation: "none",
    repositoryIntegrations: "disabled",
    sparseCheckout: false,
    splitIndex: false,
    mutableIdentities: {}
  };
}

test("repository store authenticates records and encrypts canonical private paths", async () => {
  await withStore(async ({ stateRoot, store }) => {
    const created = store.register(identity());
    assert.match(created.repositoryStateKey, /^grs_[a-f0-9]{32}$/);
    assert.equal(created.state, "active");
    const persisted = await fs.readFile(store.recordPath(created.repositoryStateKey), "utf8");
    assert.equal(persisted.includes("C:\\\\private"), false);
    assert.equal(persisted.includes("worktreeRoot"), false);
    const restored = store.read(created.repositoryStateKey);
    assert.equal(restored.privateState.worktreeRoot, "C:\\private\\repo");
    assert.match(restored.record.repositoryId, /^repo_[a-f0-9]{32}$/);
    const processLocalIdentityChanged = { ...identity(), repositoryId: `repo_${"f".repeat(32)}` };
    assert.equal(store.register(processLocalIdentityChanged).repositoryId, restored.record.repositoryId);

    const parsed = JSON.parse(persisted);
    parsed.repositoryFingerprint = "e".repeat(64);
    await fs.writeFile(store.recordPath(created.repositoryStateKey), JSON.stringify(parsed) + "\n", "utf8");
    assert.throws(() => store.read(created.repositoryStateKey), /GIT_RECOVERY_REQUIRED/);
    assert.equal((await fs.stat(stateRoot)).isDirectory(), true);
  });
});

test("repository recovery freeze is monotonic and idempotent", async () => {
  await withStore(async ({ store }) => {
    const created = store.register(identity());
    const frozen = store.markRecoveryRequired(created.repositoryStateKey, "AUDIT_TERMINAL_UNPROVED");
    assert.equal(frozen.state, "recovery_required");
    assert.equal(frozen.recoveryCode, "AUDIT_TERMINAL_UNPROVED");
    assert.equal(store.markRecoveryRequired(created.repositoryStateKey, "AUDIT_TERMINAL_UNPROVED").generation, frozen.generation);
    const later = store.markRecoveryRequired(created.repositoryStateKey, "GIT_LOCK_RELEASE_UNPROVED");
    assert.equal(later.generation, frozen.generation);
    assert.equal(later.recoveryCode, "AUDIT_TERMINAL_UNPROVED");
    assert.throws(() => store.activate(created.repositoryStateKey), /GIT_RECOVERY_REQUIRED/);
  });
});

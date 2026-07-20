import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitOperationStore } from "../dist/git/operationStore.js";

async function withStore(callback) {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-operation-store-"));
  const masterKey = Buffer.alloc(32, 4);
  const store = new GitOperationStore({ stateRoot, masterKey, now: () => 1_700_000_000_000, randomBytes: (size) => Buffer.alloc(size, 5) });
  try {
    await callback({ store });
  } finally {
    store.dispose();
    masterKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}

function createInput() {
  return {
    repositoryStateKey: `grs_${"1".repeat(32)}`,
    repositoryId: `repo_${"2".repeat(32)}`,
    worktreeStateKeys: [`gws_${"3".repeat(32)}`],
    toolName: "git_commit",
    canonicalAction: "git_commit",
    requestId: "request-gate-r",
    authorizationEventId: `event_${"4".repeat(32)}`,
    subjectFingerprint: "5".repeat(64),
    contextFingerprint: "6".repeat(64),
    policyRevision: "policy-gate-r",
    resourceFingerprint: `sha256:${"9".repeat(64)}`,
    capabilityRevision: "7".repeat(64),
    configurationRevision: "8".repeat(64),
    participantRequirements: ["object_quarantine", "private_index", "ref_cas", "audit"],
    counts: { pathCount: 2, objectCount: 3 },
    privateState: {
      gitDir: "C:\\private\\repo\\.git",
      privateIndexPath: "C:\\private\\state\\index",
      expectedOldRef: "a".repeat(40)
    }
  };
}

test("operation journal is authenticated, encrypted, bounded, and transition-strict", async () => {
  await withStore(async ({ store }) => {
    const preparing = store.create(createInput());
    assert.equal(preparing.state, "preparing");
    const text = await fs.readFile(store.recordPath(preparing.repositoryStateKey, preparing.operationId), "utf8");
    assert.equal(text.includes("C:\\\\private"), false);
    assert.equal(text.includes("privateIndexPath"), false);
    const restored = store.read(preparing.repositoryStateKey, preparing.operationId);
    assert.equal(restored.privateState.privateIndexPath, "C:\\private\\state\\index");

    const prepared = store.transition(preparing, { state: "prepared" });
    const executing = store.transition(prepared, { state: "executing" });
    const observed = store.transition(executing, { state: "effect_observed", durableEffectObserved: true });
    const pending = store.transition(observed, { state: "audit_pending" });
    const committed = store.transition(pending, { state: "committed", terminalAuditEventId: `event_${"9".repeat(32)}`, resultCode: "OK" });
    assert.equal(committed.state, "committed");
    assert.equal(committed.durableEffectObserved, true);
    assert.throws(() => store.transition(committed, { state: "rolling_back" }), /GIT_RECOVERY_REQUIRED/);
  });
});

test("invalid transitions and oversized or sensitive public fields fail before persistence", async () => {
  await withStore(async ({ store }) => {
    const preparing = store.create(createInput());
    assert.throws(() => store.transition(preparing, { state: "committed" }), /GIT_RECOVERY_REQUIRED/);
    assert.throws(() => store.create({ ...createInput(), canonicalAction: "x\nsecret" }), /GIT_RECOVERY_REQUIRED/);
    assert.throws(() => store.create({ ...createInput(), counts: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`c${i}`, i])) }), /GIT_RECOVERY_REQUIRED/);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => store.create({ ...createInput(), privateState: cyclic }), /GIT_RECOVERY_REQUIRED/);
  });
});

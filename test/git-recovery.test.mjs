import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitLockManager } from "../dist/git/locks.js";
import { GitOperationStore } from "../dist/git/operationStore.js";
import { GitRepositoryStore } from "../dist/git/repositoryStore.js";
import { GitGateRRuntimeV4, GitRecoveryCoordinator } from "../dist/git/recovery.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

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

async function withStores(callback) {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-recovery-"));
  const masterKey = Buffer.alloc(32, 6);
  const repositoryStore = new GitRepositoryStore({ stateRoot, masterKey });
  const operationStore = new GitOperationStore({ stateRoot, masterKey });
  const registry = new ProcessInstanceRegistry(stateRoot, {
    pid: 4242,
    randomBytes: (size) => Buffer.alloc(size, 7)
  });
  const locks = new GitLockManager({
    stateRoot,
    registry,
    processCreationTime: async () => "proc-4242",
    randomBytes: (size) => Buffer.alloc(size, 8)
  });
  try {
    const repository = repositoryStore.register(identity());
    await callback({ repositoryStore, operationStore, repository, locks });
  } finally {
    registry.dispose();
    repositoryStore.dispose();
    operationStore.dispose();
    masterKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}

function operationInput(repository, participants) {
  return {
    repositoryStateKey: repository.repositoryStateKey,
    repositoryId: repository.repositoryId,
    worktreeStateKeys: [],
    toolName: "git_commit",
    canonicalAction: "git_commit",
    requestId: "request-recovery",
    authorizationEventId: `event_${"1".repeat(32)}`,
    subjectFingerprint: "2".repeat(64),
    contextFingerprint: "3".repeat(64),
    policyRevision: "policy-recovery",
    resourceFingerprint: `sha256:${"9".repeat(64)}`,
    capabilityRevision: "4".repeat(64),
    configurationRevision: "5".repeat(64),
    participantRequirements: participants,
    counts: {},
    privateState: {}
  };
}

test("startup recovery rolls back an operation with no durable participant", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository, locks }) => {
    const operation = operationStore.create(operationInput(repository, ["private_index", "audit"]));
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async () => "absent",
      recordRecovery: async () => {}
    });
    const results = await coordinator.recoverAll();
    assert.deepEqual(results.map((value) => value.outcome), ["rolled_back"]);
    assert.equal(operationStore.read(operation.repositoryStateKey, operation.operationId).record.state, "rolled_back");
    assert.equal(repositoryStore.read(repository.repositoryStateKey).record.state, "active");
  });
});

test("startup recovery freezes when exact Gate R lock ownership is unprovable", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository }) => {
    const operation = operationStore.create(operationInput(repository, ["private_index", "audit"]));
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks: { async acquire() { throw new Error("foreign lock"); } },
      probeParticipant: async () => "absent",
      recordRecovery: async () => {}
    });
    const results = await coordinator.recoverAll();
    assert.equal(results[0].outcome, "recovery_required");
    assert.equal(results[0].resultCode, "GIT_LOCK_OWNERSHIP_UNPROVED");
    assert.equal(operationStore.read(operation.repositoryStateKey, operation.operationId).record.state, "preparing");
    assert.equal(repositoryStore.read(repository.repositoryStateKey).record.state, "recovery_required");
  });
});

test("startup recovery freezes when an acquired Gate R lock cannot be released exactly", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository }) => {
    const operation = operationStore.create(operationInput(repository, ["private_index", "audit"]));
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks: { async acquire() { return { async release() { throw new Error("release failed"); } }; } },
      probeParticipant: async () => "absent",
      recordRecovery: async () => {}
    });
    const results = await coordinator.recoverAll();
    assert.equal(results[0].outcome, "recovery_required");
    assert.equal(results[0].resultCode, "GIT_LOCK_RELEASE_UNPROVED");
    assert.equal(operationStore.read(operation.repositoryStateKey, operation.operationId).record.state, "rolled_back");
    assert.equal(repositoryStore.read(repository.repositoryStateKey).record.state, "recovery_required");
  });
});

test("durable Git effect without provable terminal audit freezes repository", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository, locks }) => {
    let operation = operationStore.create(operationInput(repository, ["ref_cas", "audit"]));
    operation = operationStore.transition(operation, { state: "prepared" });
    operation = operationStore.transition(operation, { state: "executing" });
    operation = operationStore.transition(operation, { state: "effect_observed", durableEffectObserved: true });
    operation = operationStore.transition(operation, { state: "audit_pending" });
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async (_operation, participant) => participant === "ref_cas" ? "present" : "absent",
      recordRecovery: async () => { throw new Error("audit unavailable"); }
    });
    const results = await coordinator.recoverAll();
    assert.equal(results[0].outcome, "recovery_required");
    assert.equal(operationStore.read(operation.repositoryStateKey, operation.operationId).record.state, "recovery_required");
    assert.equal(repositoryStore.read(repository.repositoryStateKey).record.state, "recovery_required");
  });
});

test("terminal audit plus reconciled durable effect converges to committed", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository, locks }) => {
    let operation = operationStore.create(operationInput(repository, ["ref_cas", "audit"]));
    operation = operationStore.transition(operation, { state: "prepared" });
    operation = operationStore.transition(operation, { state: "executing" });
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async (_operation, participant) => participant === "ref_cas" || participant === "audit" ? "present" : "absent",
      resolveTerminalAuditEventId: async () => `event_${"6".repeat(32)}`,
      recordRecovery: async () => {}
    });
    const results = await coordinator.recoverAll();
    assert.equal(results[0].outcome, "committed");
    assert.equal(operationStore.read(operation.repositoryStateKey, operation.operationId).record.state, "committed");
  });
});

test("audit presence without exact terminal identity freezes instead of fabricating evidence", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository, locks }) => {
    let operation = operationStore.create(operationInput(repository, ["ref_cas", "audit"]));
    operation = operationStore.transition(operation, { state: "prepared" });
    operation = operationStore.transition(operation, { state: "executing" });
    const coordinator = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async (_operation, participant) => participant === "ref_cas" || participant === "audit" ? "present" : "absent",
      recordRecovery: async () => {}
    });
    const results = await coordinator.recoverAll();
    assert.equal(results[0].outcome, "recovery_required");
    assert.equal(results[0].resultCode, "AUDIT_TERMINAL_UNPROVED");
    assert.equal(repositoryStore.read(repository.repositoryStateKey).record.state, "recovery_required");
  });
});

test("Gate R remains unavailable after restart when any repository is already frozen", async () => {
  await withStores(async ({ repositoryStore, operationStore, repository, locks }) => {
    repositoryStore.markRecoveryRequired(repository.repositoryStateKey, "AUDIT_TERMINAL_UNPROVED");
    const recovery = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async () => "absent",
      recordRecovery: async () => {}
    });
    const runtime = new GitGateRRuntimeV4({
      recovery,
      operationStore,
      repositoryStore,
      locks,
      appendAuthorization: async () => { throw new Error("unreachable"); }
    });
    assert.deepEqual(await runtime.startupRecovery(), []);
    assert.equal(runtime.isReady(), false);
  });
});

test("Gate R persists authorization before creating an operation and taking locks", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-gate-r-runtime-"));
  const masterKey = Buffer.alloc(32, 9);
  const repositoryStore = new GitRepositoryStore({ stateRoot, masterKey, randomBytes: (size) => Buffer.alloc(size, 1) });
  const operationStore = new GitOperationStore({ stateRoot, masterKey, randomBytes: (size) => Buffer.alloc(size, 2) });
  const registry = new ProcessInstanceRegistry(stateRoot, { pid: 4242, randomBytes: (size) => Buffer.alloc(size, 3) });
  const order = [];
  const locks = new GitLockManager({
    stateRoot,
    registry,
    processCreationTime: async () => "proc-4242",
    randomBytes: (size) => Buffer.alloc(size, 4),
    onLockEvent: (event) => order.push(`lock:${event.action}:${event.kind}`)
  });
  try {
    const repository = repositoryStore.register(identity());
    const recovery = new GitRecoveryCoordinator({
      operationStore,
      repositoryStore,
      locks,
      probeParticipant: async () => "absent",
      recordRecovery: async () => {}
    });
    const runtime = new GitGateRRuntimeV4({
      recovery,
      operationStore,
      repositoryStore,
      locks,
      async appendAuthorization(event) {
        order.push("authorization:persisted");
        return { schemaVersion: 1, sequence: 1, previousMac: null, recordMac: "a".repeat(64), event };
      }
    });
    const authorization = {
      schemaVersion: 4,
      contractVersion: 4,
      eventId: `event_${"6".repeat(32)}`,
      eventType: "authorization",
      timestamp: new Date().toISOString(),
      requestId: "request-recovery",
      authorizationEventId: null,
      decisionId: "decision-gate-r-runtime",
      toolName: "git_commit",
      canonicalAction: "git_commit",
      workspaceId: "workspace-gate-r-runtime",
      policyRevision: "policy-recovery",
      subjectFingerprint: "2".repeat(64),
      contextFingerprint: "3".repeat(64),
      resultCode: "ALLOW",
      counts: { pathCount: 1 },
      repositoryId: repository.repositoryId,
      taskWorktreeId: null,
      operationId: null,
      outcome: "allow",
      riskClass: "R3",
      resourceFingerprint: `sha256:${"9".repeat(64)}`,
      approvalId: null,
      grantId: null
    };
    const operation = {
      ...operationInput(repository, ["ref_cas", "audit"]),
      capabilityRevision: repository.capabilityRevision,
      worktreeStateKeys: [],
      privateState: { expectedOldRef: "a".repeat(40) }
    };
    delete operation.authorizationEventId;
    await assert.rejects(runtime.prepareOperation({ authorization, operation }), /GIT_RECOVERY_REQUIRED/);
    await runtime.startupRecovery();
    await assert.rejects(
      runtime.prepareOperation({
        authorization: { ...authorization, contextFingerprint: "0".repeat(64) },
        operation
      }),
      /GIT_RECOVERY_REQUIRED/
    );
    assert.deepEqual(order, []);
    assert.equal(operationStore.list(repository.repositoryStateKey).length, 0);
    const prepared = await runtime.prepareOperation({ authorization, operation });
    assert.equal(prepared.operation.state, "prepared");
    assert.deepEqual(order.slice(0, 2), ["authorization:persisted", "lock:acquired:repository"]);
    await prepared.lock.release();
  } finally {
    registry.dispose();
    repositoryStore.dispose();
    operationStore.dispose();
    masterKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
});

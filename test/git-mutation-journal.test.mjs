import assert from "node:assert/strict";
import test from "node:test";
import { GitMutationJournalV4 } from "../dist/git/mutationJournal.js";

function authorization(repositoryId) {
  return {
    schemaVersion: 4,
    contractVersion: 4,
    eventId: `event_${"1".repeat(32)}`,
    eventType: "authorization",
    timestamp: new Date().toISOString(),
    requestId: "request_gate_i",
    authorizationEventId: null,
    decisionId: "decision_gate_i",
    toolName: "git_stage",
    canonicalAction: "stage",
    workspaceId: "workspace_gate_i",
    policyRevision: "policy-gate-i",
    subjectFingerprint: "2".repeat(64),
    contextFingerprint: "3".repeat(64),
    resultCode: "ALLOW",
    counts: { affectedPathCount: 1 },
    repositoryId,
    taskWorktreeId: null,
    operationId: null,
    outcome: "allow",
    riskClass: "R2",
    resourceFingerprint: `sha256:${"4".repeat(64)}`,
    approvalId: null,
    grantId: null
  };
}

test("Gate I mutation journal binds authorization, operation, terminal audit, and lock release", async () => {
  const calls = [];
  const runtime = {
    registerRepository(identity) {
      calls.push("register");
      return {
        repositoryStateKey: `grs_${"5".repeat(32)}`,
        repositoryId: `repo_${"6".repeat(32)}`,
        worktreeStateKeys: [],
        capabilityRevision: identity.capabilityRevision
      };
    },
    async prepareOperation(input) {
      calls.push(["prepare", input]);
      return {
        operation: {
          ...input.operation,
          operationId: `gop_${"7".repeat(32)}`,
          state: "prepared"
        },
        lock: { async release() {} }
      };
    },
    async completeOperation(_prepared, terminal) {
      calls.push(["complete", terminal]);
    },
    async beginEffect(prepared, privateState) {
      calls.push(["begin", privateState]);
      return {
        ...prepared,
        operation: { ...prepared.operation, state: "executing" }
      };
    },
    async observeEffect(prepared, privateState) {
      calls.push(["observe", privateState]);
      return {
        ...prepared,
        operation: { ...prepared.operation, state: "effect_observed" }
      };
    },
    async rollBackOperation() {
      calls.push("rollback");
    }
  };
  const repository = {
    repositoryId: `repo_${"8".repeat(32)}`,
    stableIdentityFingerprint: "9".repeat(64),
    capabilityRevision: "a".repeat(64)
  };
  const journal = new GitMutationJournalV4(runtime, "b".repeat(64));
  const result = await journal.run({
    authorization: authorization(repository.repositoryId),
    repository,
    toolName: "git_stage",
    canonicalAction: "stage",
    workspaceId: "workspace_gate_i",
    participants: ["private_index"],
    counts: { affectedPathCount: 1 },
    privateState: { reviewed: true },
    async effect() {
      calls.push("effect");
      return "done";
    }
  });
  assert.equal(result, "done");
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), [
    "register", "prepare", "begin", "effect", "observe", "complete"
  ]);
  assert.equal(calls[1][1].authorizedRepositoryId, repository.repositoryId);
  assert.deepEqual(calls[1][1].operation.participantRequirements, ["private_index", "audit"]);
  assert.equal(calls[5][1].durableEffectObserved, true);
});

test("Gate I mutation journal refuses missing authorization before durable effects", async () => {
  const journal = new GitMutationJournalV4({
    registerRepository() {
      throw new Error("must not register");
    }
  }, "b".repeat(64));
  let effected = false;
  await assert.rejects(() => journal.run({
    authorization: null,
    repository: {
      repositoryId: `repo_${"8".repeat(32)}`,
      stableIdentityFingerprint: "9".repeat(64),
      capabilityRevision: "a".repeat(64)
    },
    toolName: "git_stage",
    canonicalAction: "stage",
    workspaceId: "workspace_gate_i",
    participants: ["private_index"],
    counts: {},
    privateState: {},
    async effect() {
      effected = true;
    }
  }), /GIT_RECOVERY_REQUIRED/);
  assert.equal(effected, false);
});

test("Gate I pre-effect validation failure rolls back without entering effect state", async () => {
  const calls = [];
  const prepared = {
    operation: {
      operationId: `gop_${"7".repeat(32)}`,
      state: "prepared"
    },
    lock: { async release() {} }
  };
  const journal = new GitMutationJournalV4({
    registerRepository() {
      return {
        repositoryStateKey: `grs_${"5".repeat(32)}`,
        repositoryId: `repo_${"8".repeat(32)}`,
        worktreeStateKeys: [],
        capabilityRevision: "a".repeat(64)
      };
    },
    async prepareOperation() {
      return prepared;
    },
    async beginEffect() {
      calls.push("begin");
      return prepared;
    },
    async rollBackOperation() {
      calls.push("rollback");
    }
  }, "b".repeat(64));
  await assert.rejects(() => journal.run({
    authorization: authorization(`repo_${"8".repeat(32)}`),
    repository: {
      repositoryId: `repo_${"8".repeat(32)}`,
      stableIdentityFingerprint: "9".repeat(64),
      capabilityRevision: "a".repeat(64)
    },
    toolName: "git_stage",
    canonicalAction: "stage",
    workspaceId: "workspace_gate_i",
    participants: [],
    counts: {},
    privateState: {},
    async preEffect() {
      throw new Error("GIT_STATE_CHANGED");
    },
    async effect() {
      calls.push("effect");
    }
  }), /GIT_STATE_CHANGED/);
  assert.deepEqual(calls, ["rollback"]);
});

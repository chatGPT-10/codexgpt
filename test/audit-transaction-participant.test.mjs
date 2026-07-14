import assert from "node:assert/strict";
import test from "node:test";
import {
  attachExecutionAuditFacts,
  commitTransactionWithAudit,
  executionAuditFacts
} from "../dist/audit/transactionParticipant.js";

const context = {
  authorizationEvent: {
    schemaVersion: 2,
    eventId: `event_${"1".repeat(32)}`,
    eventType: "authorization",
    timestamp: "2026-07-14T12:00:00.000Z",
    requestId: `request_${"2".repeat(32)}`,
    authorizationEventId: null,
    decisionId: `decision_${"3".repeat(24)}`,
    credentialRef: null,
    transportSessionId: `session_${"4".repeat(32)}`,
    toolName: "write",
    canonicalAction: "write",
    workspaceId: `ws_${"5".repeat(32)}`,
    workspaceRef: `awr_${"6".repeat(32)}`,
    policyRevision: `policy_${"7".repeat(24)}`,
    resourceSummary: "filesystem:write:src/example.ts",
    resourceFingerprint: "8".repeat(64),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: ["rule.write"],
    approvalState: "not_required",
    grantId: null,
    sandboxBackend: "node-baseline",
    riskClass: "R2"
  },
  requirement: "required",
  riskClass: "R2",
  mutating: true
};

function pending(options = {}) {
  const order = options.order ?? [];
  return {
    transactionId: `tx_${"9".repeat(32)}`,
    changeSetId: `cs_${"a".repeat(32)}`,
    operationCount: 1,
    mutationKinds: ["replace"],
    async commitParticipant(name, action) {
      order.push(`participant:${name}:start`);
      await action();
      order.push(`participant:${name}:committed`);
    },
    async finalize() {
      order.push("finalize");
      return {
        transactionId: this.transactionId,
        changeSetId: this.changeSetId,
        committedAt: "2026-07-14T12:00:01.000Z",
        operationCount: 1,
        cleanupPending: false
      };
    },
    async rollback(reason) {
      order.push(`rollback:${reason}`);
      if (options.rollbackFailure) throw new Error("rollback failed");
    }
  };
}

function execution(pendingCommit) {
  return {
    status: "succeeded",
    resultCode: "OK",
    durationMs: 15,
    exitCode: null,
    boundedByteCounts: { written: 12 },
    changeSetId: pendingCommit.changeSetId,
    operationCount: pendingCommit.operationCount,
    mutationKinds: pendingCommit.mutationKinds,
    recoveryRequired: false
  };
}

test("execution audit facts are non-enumerable and never leak into MCP payload serialization", () => {
  const pendingCommit = pending();
  const result = { content: [{ type: "text", text: "ok" }], structuredContent: { ok: true } };
  const facts = {
    resultCode: "OK",
    exitCode: null,
    boundedByteCounts: { written: 12 },
    changeSetId: pendingCommit.changeSetId,
    operationCount: pendingCommit.operationCount,
    mutationKinds: pendingCommit.mutationKinds,
    pendingMutationCommit: pendingCommit
  };
  assert.equal(attachExecutionAuditFacts(result, facts), result);
  assert.equal(executionAuditFacts(result), facts);
  assert.deepEqual(Object.keys(result), ["content", "structuredContent"]);
  assert.equal(JSON.stringify(result).includes("pendingMutationCommit"), false);
  assert.equal(JSON.stringify(result).includes(pendingCommit.changeSetId), false);
});

test("audit participant persists terminal evidence before transaction finalization", async () => {
  const order = [];
  const pendingCommit = pending({ order });
  const runtime = {
    async persistExecution(actualContext, actualExecution) {
      order.push("persist_execution");
      assert.equal(actualContext, context);
      assert.deepEqual(actualExecution, execution(pendingCommit));
    }
  };
  const committed = await commitTransactionWithAudit({
    pending: pendingCommit,
    runtime,
    context,
    execution: execution(pendingCommit)
  });
  assert.equal(committed.changeSetId, pendingCommit.changeSetId);
  assert.deepEqual(order, [
    "participant:audit:start",
    "persist_execution",
    "participant:audit:committed",
    "finalize"
  ]);
});

test("audit append failure rolls back installed files and reports audit unavailable", async () => {
  const order = [];
  const pendingCommit = pending({ order });
  const runtime = {
    async persistExecution() {
      order.push("persist_execution");
      throw new Error("append failed");
    }
  };
  await assert.rejects(
    () => commitTransactionWithAudit({
      pending: pendingCommit,
      runtime,
      context,
      execution: execution(pendingCommit)
    }),
    (error) => error.code === "AUDIT_UNAVAILABLE"
  );
  assert.deepEqual(order, [
    "participant:audit:start",
    "persist_execution",
    "rollback:audit_completion_failed"
  ]);
});

test("unproven rollback becomes transaction recovery required", async () => {
  const order = [];
  const pendingCommit = pending({ order, rollbackFailure: true });
  const runtime = {
    async persistExecution() {
      order.push("persist_execution");
      throw new Error("append failed");
    }
  };
  await assert.rejects(
    () => commitTransactionWithAudit({
      pending: pendingCommit,
      runtime,
      context,
      execution: execution(pendingCommit)
    }),
    (error) => error.code === "TRANSACTION_RECOVERY_REQUIRED"
  );
  assert.deepEqual(order, [
    "participant:audit:start",
    "persist_execution",
    "rollback:audit_completion_failed"
  ]);
});

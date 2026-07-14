import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { attachExecutionAuditFacts } from "../dist/audit/transactionParticipant.js";
import {
  installPolicyKernel,
  isPolicyToolFailure
} from "../dist/policy/integration.js";

const decision = {
  schemaVersion: 1,
  decisionId: `decision_${"1".repeat(24)}`,
  outcome: "allow",
  reasonCode: null,
  policyRevision: `policy_${"2".repeat(24)}`,
  resourceFingerprint: "3".repeat(64),
  requiredApproval: null,
  requiredEnforcement: [],
  provenance: []
};

function authorizationEvent(outcome = "allow") {
  return {
    schemaVersion: 2,
    eventId: `event_${"4".repeat(32)}`,
    eventType: "authorization",
    timestamp: "2026-07-14T12:00:00.000Z",
    requestId: `request_${"5".repeat(32)}`,
    authorizationEventId: null,
    decisionId: decision.decisionId,
    credentialRef: null,
    transportSessionId: `session_${"6".repeat(32)}`,
    toolName: "read",
    canonicalAction: "read",
    workspaceId: `ws_${"7".repeat(32)}`,
    workspaceRef: `awr_${"8".repeat(32)}`,
    policyRevision: decision.policyRevision,
    resourceSummary: "filesystem:read:src/example.ts",
    resourceFingerprint: decision.resourceFingerprint,
    outcome,
    reasonCode: outcome === "allow" ? null : "POLICY_DENIED",
    safeRuleIds: ["rule.test"],
    approvalState: outcome === "allow" ? "not_required" : "denied",
    grantId: null,
    sandboxBackend: "node-baseline",
    riskClass: "R1"
  };
}

function serverWith(handler) {
  return {
    _registeredTools: {
      read: {
        inputSchema: z.object({}).strict(),
        handler
      }
    }
  };
}

function runtime(options = {}) {
  const order = options.order ?? [];
  const context = {
    authorizationEvent: authorizationEvent(options.outcome ?? "allow"),
    requirement: options.requirement ?? "required",
    riskClass: "R1",
    mutating: false
  };
  return {
    mode: options.mode ?? "enforce",
    order,
    async authorize() {
      order.push("authorize");
      return {
        decision: {
          ...decision,
          outcome: options.outcome ?? "allow",
          reasonCode: options.outcome && options.outcome !== "allow" ? "POLICY_DENIED" : null
        },
        auditEvent: null,
        auditContext: context
      };
    },
    async audit() {},
    async persistAuthorization(actual) {
      order.push("persist_authorization");
      assert.equal(actual, context);
      if (options.authorizationFailure) throw new Error("authorization append failed");
    },
    async persistExecution(actual, execution) {
      order.push(`persist_execution:${execution.status}`);
      assert.equal(actual, context);
      if (options.executionFailure) throw new Error("execution append failed");
      options.onExecution?.(execution);
    }
  };
}

test("policy wrapper persists authorization before handler and terminal execution after success", async () => {
  const order = [];
  const policy = runtime({ order, onExecution(execution) {
    assert.equal(execution.status, "succeeded");
    assert.equal(execution.resultCode, "OK");
    assert.ok(execution.durationMs >= 0);
  } });
  const server = serverWith(async () => {
    order.push("handler");
    return { content: [{ type: "text", text: "ok" }] };
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(result.isError, undefined);
  assert.deepEqual(order, [
    "authorize",
    "persist_authorization",
    "handler",
    "persist_execution:succeeded"
  ]);
});

test("enforce denial emits not_executed and never calls the handler", async () => {
  const order = [];
  const policy = runtime({ order, outcome: "deny", onExecution(execution) {
    assert.equal(execution.status, "not_executed");
    assert.equal(execution.operationCount, 0);
    assert.deepEqual(execution.mutationKinds, []);
  } });
  const server = serverWith(() => {
    order.push("handler");
    return { content: [] };
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(isPolicyToolFailure(result), true);
  assert.deepEqual(order, [
    "authorize",
    "persist_authorization",
    "persist_execution:not_executed"
  ]);
});

test("required authorization persistence failure fails closed before execution", async () => {
  const order = [];
  const policy = runtime({ order, authorizationFailure: true, requirement: "required" });
  const server = serverWith(() => {
    order.push("handler");
    return { content: [] };
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(isPolicyToolFailure(result), true);
  assert.deepEqual(order, ["authorize", "persist_authorization"]);
});

test("best-effort audit failure never converts an allowed decision into denial", async () => {
  const order = [];
  const policy = runtime({
    order,
    authorizationFailure: true,
    executionFailure: true,
    requirement: "best_effort"
  });
  const server = serverWith(() => {
    order.push("handler");
    return { content: [{ type: "text", text: "ok" }] };
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(result.isError, undefined);
  assert.deepEqual(order, [
    "authorize",
    "persist_authorization",
    "handler",
    "persist_execution:succeeded"
  ]);
});

test("required completion failure returns unavailable after a completed non-mutating action", async () => {
  const order = [];
  const policy = runtime({ order, executionFailure: true, requirement: "required" });
  const server = serverWith(() => {
    order.push("handler");
    return { content: [{ type: "text", text: "already completed" }] };
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(isPolicyToolFailure(result), true);
  assert.deepEqual(order, [
    "authorize",
    "persist_authorization",
    "handler",
    "persist_execution:succeeded"
  ]);
});

test("tool errors and thrown exceptions receive real terminal classifications", async () => {
  const returned = [];
  const policyForReturn = runtime({ onExecution: (execution) => returned.push(execution) });
  const returnServer = serverWith(() => ({ isError: true, content: [{ type: "text", text: "failed" }] }));
  installPolicyKernel(returnServer, policyForReturn);
  await returnServer._registeredTools.read.handler({});
  assert.equal(returned[0].status, "failed");
  assert.equal(returned[0].resultCode, "TOOL_ERROR");

  const thrown = [];
  const policyForThrow = runtime({ onExecution: (execution) => thrown.push(execution) });
  const throwServer = serverWith(() => { throw new Error("boom"); });
  installPolicyKernel(throwServer, policyForThrow);
  await assert.rejects(() => throwServer._registeredTools.read.handler({}), /boom/);
  assert.equal(thrown[0].status, "failed");
  assert.equal(thrown[0].resultCode, "HANDLER_EXCEPTION");
});

test("pending mutation facts use the audit participant before transaction finalization", async () => {
  const order = [];
  const policy = runtime({ order, onExecution(execution) {
    assert.equal(execution.changeSetId, `cs_${"a".repeat(32)}`);
    assert.equal(execution.operationCount, 1);
    assert.deepEqual(execution.mutationKinds, ["replace"]);
  } });
  const pending = {
    transactionId: `tx_${"b".repeat(32)}`,
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
    }
  };
  const server = serverWith(() => {
    order.push("handler");
    return attachExecutionAuditFacts(
      { content: [{ type: "text", text: "ok" }] },
      {
        resultCode: "OK",
        exitCode: null,
        boundedByteCounts: { written: 12 },
        changeSetId: pending.changeSetId,
        operationCount: pending.operationCount,
        mutationKinds: ["replace"],
        pendingMutationCommit: pending
      }
    );
  });
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.read.handler({});
  assert.equal(result.isError, undefined);
  assert.deepEqual(order, [
    "authorize",
    "persist_authorization",
    "handler",
    "participant:audit:start",
    "persist_execution:succeeded",
    "participant:audit:committed",
    "finalize"
  ]);
});

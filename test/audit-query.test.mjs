import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAuditQueryHandler,
  createDirectAuditQueryAdapterV2,
  createSupertoolAuditQueryAdapterV2
} from "../dist/audit/queryTool.js";
import { CANONICAL_CODEXGPT_CHILD_TOOLS } from "../dist/tools/schemas/codexgpt.js";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { queryAuditEventsInputV2Schema } from "../dist/audit/schemas.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-audit-query-"));
}

function hex32(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

function common(label, eventType, timestamp, toolName = "read") {
  return {
    schemaVersion: 2,
    eventId: `event_${hex32(label)}`,
    eventType,
    timestamp,
    requestId: `request_${hex32(`request:${label}`)}`,
    authorizationEventId: null,
    decisionId: `decision_${hex32(`decision:${label}`)}`,
    credentialRef: null,
    transportSessionId: null,
    toolName,
    canonicalAction: toolName,
    workspaceId: `ws_${"1".repeat(32)}`,
    workspaceRef: `awr_${"2".repeat(32)}`,
    policyRevision: `policy_${"3".repeat(32)}`
  };
}

function authorization(label, timestamp, toolName = "read") {
  return {
    ...common(label, "authorization", timestamp, toolName),
    resourceSummary: `filesystem:${toolName}:src/example.ts`,
    resourceFingerprint: createHash("sha256").update(label).digest("hex"),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: ["rule.test"],
    approvalState: "not_required",
    grantId: null,
    sandboxBackend: "node-baseline",
    riskClass: toolName === "read" ? "R1" : "R2"
  };
}

function execution(label, timestamp, authorizationEventId, status = "succeeded") {
  return {
    ...common(label, "execution", timestamp, "write"),
    authorizationEventId,
    status,
    resultCode: status === "succeeded" ? "OK" : "FAILED",
    durationMs: 10,
    exitCode: null,
    boundedByteCounts: { written: status === "succeeded" ? 12 : 0 },
    changeSetId: `cs_${hex32(`change:${label}`)}`,
    operationCount: 1,
    mutationKinds: ["replace"],
    recoveryRequired: false
  };
}

function open(rootPath, registry, now) {
  return PersistentAuditStore.open({
    stateRoot: rootPath,
    registry,
    now: () => now.value,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
}

async function seed(store, now) {
  const old = authorization("old", new Date(now.value - 2 * 24 * 60 * 60 * 1000).toISOString());
  const read = authorization("read", new Date(now.value - 60 * 60 * 1000).toISOString());
  const write = authorization("write", new Date(now.value - 30 * 60 * 1000).toISOString(), "write");
  const failedWrite = authorization("failed-write", new Date(now.value - 25 * 60 * 1000).toISOString(), "write");
  const success = execution("success", new Date(now.value - 20 * 60 * 1000).toISOString(), write.eventId);
  const failed = execution("failed", new Date(now.value - 10 * 60 * 1000).toISOString(), failedWrite.eventId, "failed");
  for (const event of [old, read, write, failedWrite, success, failed]) await store.append(event);
  return { old, read, write, failedWrite, success, failed };
}

test("query schema is strict and store enforces fixed range and limit bounds", async () => {
  assert.throws(() => queryAuditEventsInputV2Schema.parse({ regex: ".*" }), /unrecognized/i);
  assert.throws(() => queryAuditEventsInputV2Schema.parse({ limit: 101 }), /less than or equal/i);

  const stateRoot = root();
  const registry = new ProcessInstanceRegistry(stateRoot);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = open(stateRoot, registry, now);
    const events = await seed(store, now);
    const defaults = await store.query({});
    assert.deepEqual(defaults.records.map((record) => record.event.eventId), [
      events.failed.eventId,
      events.success.eventId,
      events.failedWrite.eventId,
      events.write.eventId,
      events.read.eventId
    ]);
    assert.equal(defaults.limit, 50);
    assert.equal(defaults.integrityState, "healthy");
    await assert.rejects(
      () => store.query({
        startTime: new Date(now.value - 8 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(now.value).toISOString()
      }),
      (error) => error.code === "AUDIT_RANGE_INVALID"
    );
    await assert.rejects(
      () => store.query({
        startTime: new Date(now.value).toISOString(),
        endTime: new Date(now.value - 1000).toISOString()
      }),
      (error) => error.code === "AUDIT_RANGE_INVALID"
    );
  } finally {
    registry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("query filters are exact and authenticated cursors paginate without duplicate or skip", async () => {
  const stateRoot = root();
  const registry = new ProcessInstanceRegistry(stateRoot);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = open(stateRoot, registry, now);
    const events = await seed(store, now);
    const first = await store.query({ eventTypes: ["execution"], limit: 1 });
    assert.deepEqual(first.records.map((record) => record.event.eventId), [events.failed.eventId]);
    assert.ok(first.nextCursor);
    const second = await store.query({ eventTypes: ["execution"], limit: 1, cursor: first.nextCursor });
    assert.deepEqual(second.records.map((record) => record.event.eventId), [events.success.eventId]);
    assert.equal(new Set([...first.records, ...second.records].map((record) => record.sequence)).size, 2);

    const byStatus = await store.query({ statuses: ["failed"] });
    assert.deepEqual(byStatus.records.map((record) => record.event.eventId), [events.failed.eventId]);
    const byTool = await store.query({ toolNames: ["read"] });
    assert.deepEqual(byTool.records.map((record) => record.event.eventId), [events.read.eventId]);
    const byRequest = await store.query({ requestIds: [events.write.requestId] });
    assert.deepEqual(byRequest.records.map((record) => record.event.eventId), [events.write.eventId]);
    const byChange = await store.query({ changeSetIds: [events.success.changeSetId] });
    assert.deepEqual(byChange.records.map((record) => record.event.eventId), [events.success.eventId]);
    const byWorkspace = await store.query({ workspaceRefs: [events.write.workspaceRef] });
    assert.equal(byWorkspace.records.length, 5);

    const tampered = `${first.nextCursor.slice(0, -1)}${first.nextCursor.endsWith("a") ? "b" : "a"}`;
    await assert.rejects(
      () => store.query({ eventTypes: ["execution"], limit: 1, cursor: tampered }),
      (error) => error.code === "AUDIT_CURSOR_INVALID"
    );
    await assert.rejects(
      () => store.query({ eventTypes: ["authorization"], limit: 1, cursor: first.nextCursor }),
      (error) => error.code === "AUDIT_CURSOR_INVALID"
    );
  } finally {
    registry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("shared query handler self-audits only the filter digest and result count", async () => {
  const stateRoot = root();
  const registry = new ProcessInstanceRegistry(stateRoot);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = open(stateRoot, registry, now);
    await seed(store, now);
    const handler = createAuditQueryHandler(store);
    const result = await handler({ eventTypes: ["execution"], limit: 2 });
    assert.equal(result.records.length, 2);
    const verified = await store.verify();
    const selfAudit = verified.at(-1).event;
    assert.equal(selfAudit.eventType, "administrative");
    assert.equal(selfAudit.administrativeAction, "audit_query");
    assert.equal(selfAudit.filterDigest, result.filterDigest);
    assert.equal(selfAudit.resultCount, 2);
    assert.equal(JSON.stringify(selfAudit).includes(eventsBodyNeedle()), false);
  } finally {
    registry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

function eventsBodyNeedle() {
  return "filesystem:write:src/example.ts";
}

test("dormant direct and supertool V2 adapters share one strict implementation without changing V1 registration", async () => {
  const calls = [];
  const shared = async (input) => {
    calls.push(input);
    return {
      schemaVersion: 2,
      records: [],
      nextCursor: null,
      filterDigest: "f".repeat(64),
      startTime: "2026-07-14T11:00:00.000Z",
      endTime: "2026-07-14T12:00:00.000Z",
      limit: input.limit ?? 50,
      integrityState: "healthy"
    };
  };
  const direct = createDirectAuditQueryAdapterV2(shared);
  const supertool = createSupertoolAuditQueryAdapterV2(shared);
  const input = { eventTypes: ["execution"], limit: 2 };
  assert.deepEqual(await direct(input), await supertool(input));
  assert.deepEqual(calls, [input, input]);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS.length, 28);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS.includes("query_audit_events"), false);
  await assert.rejects(() => direct({ regex: ".*" }), /invalid/i);
  await assert.rejects(() => supertool({ limit: 101 }), /invalid/i);
});

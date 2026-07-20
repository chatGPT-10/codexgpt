import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as auditSchemas from "../dist/audit/schemas.js";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

const hex32 = (value) => createHash("sha256").update(value).digest("hex").slice(0, 32);

function authorization(label, timestamp) {
  return {
    schemaVersion: 2,
    eventId: `event_${hex32(label)}`,
    eventType: "authorization",
    timestamp,
    requestId: `request_${hex32(`request:${label}`)}`,
    authorizationEventId: null,
    decisionId: `decision_${hex32(`decision:${label}`)}`,
    credentialRef: null,
    transportSessionId: "session-v3-audit",
    toolName: "write",
    canonicalAction: "write",
    workspaceId: "ws-v3-audit",
    workspaceRef: `awr_${"1".repeat(32)}`,
    policyRevision: "policy-v3",
    resourceSummary: "filesystem:write:bounded",
    resourceFingerprint: createHash("sha256").update(label).digest("hex"),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: [],
    approvalState: "granted",
    grantId: "grant-v3-audit",
    sandboxBackend: "node-baseline",
    riskClass: "R2"
  };
}

function lifecycle(label, timestamp, transition = "requested") {
  return {
    schemaVersion: 3,
    contractVersion: 3,
    eventId: `event_${hex32(label)}`,
    eventType: "approval_lifecycle",
    transition,
    timestamp,
    requestId: `request_${hex32(`request:${label}`)}`,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: "session-v3-audit",
    toolName: "run_command",
    canonicalAction: "run_command",
    workspaceId: "ws-v3-audit",
    workspaceRef: `awr_${"1".repeat(32)}`,
    policyRevision: "policy-v3",
    subjectFingerprint: "2".repeat(64),
    contextFingerprint: "3".repeat(64),
    resultCode: null,
    counts: {},
    approvalId: `approval_${hex32(`approval:${label}`)}`,
    grantId: null,
    reservationId: null
  };
}

function fixture() {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-v3-audit-"));
  const registry = new ProcessInstanceRegistry(stateRoot);
  const now = { value: Date.UTC(2026, 6, 16, 12) };
  const store = PersistentAuditStore.open({
    stateRoot,
    registry,
    now: () => now.value,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  return {
    stateRoot,
    registry,
    store,
    now,
    close() {
      store.dispose();
      registry.dispose();
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  };
}

test("V3 audit query schemas are strict and keep V2 input/output schemas unchanged", () => {
  assert.equal(auditSchemas.queryAuditEventsInputV2Schema.safeParse({ eventTypes: ["approval_lifecycle"] }).success, false);
  assert.equal(auditSchemas.queryAuditEventsInputV3Schema.safeParse({ eventTypes: ["approval_lifecycle"] }).success, true);
  assert.equal(auditSchemas.queryAuditEventsInputV3Schema.safeParse({ eventTypes: ["approval_lifecycle"], extra: true }).success, false);
  assert.equal(auditSchemas.queryAuditEventsResultV3Schema.safeParse({ schemaVersion: 2 }).success, false);
});

test("V2 hides V3 before pagination while V3 returns the authenticated union with a mutually invalid cursor", async () => {
  const context = fixture();
  try {
    const base = context.now.value - 60_000;
    const v2Old = authorization("v2-old", new Date(base).toISOString());
    const v3Old = lifecycle("v3-old", new Date(base + 10_000).toISOString());
    const v2New = authorization("v2-new", new Date(base + 20_000).toISOString());
    const v3New = lifecycle("v3-new", new Date(base + 30_000).toISOString(), "granted");
    for (const event of [v2Old, v3Old, v2New, v3New]) await context.store.append(event);

    const v2First = await context.store.query({ limit: 1 });
    assert.deepEqual(v2First.records.map((record) => record.event.eventId), [v2New.eventId]);
    assert.ok(v2First.nextCursor);
    const v2Second = await context.store.query({ limit: 1, cursor: v2First.nextCursor });
    assert.deepEqual(v2Second.records.map((record) => record.event.eventId), [v2Old.eventId]);
    assert.equal(v2Second.nextCursor, null);

    const v3First = await context.store.queryV3({ limit: 2 });
    assert.equal(v3First.schemaVersion, 3);
    assert.deepEqual(v3First.records.map((record) => record.event.eventId), [v3New.eventId, v2New.eventId]);
    assert.ok(v3First.nextCursor);
    const v3Second = await context.store.queryV3({ limit: 2, cursor: v3First.nextCursor });
    assert.deepEqual(v3Second.records.map((record) => record.event.eventId), [v3Old.eventId, v2Old.eventId]);
    assert.equal(v3Second.nextCursor, null);

    const lifecycleOnly = await context.store.queryV3({ eventTypes: ["approval_lifecycle"] });
    assert.deepEqual(lifecycleOnly.records.map((record) => record.event.eventId), [v3New.eventId, v3Old.eventId]);

    await assert.rejects(
      () => context.store.queryV3({ limit: 1, cursor: v2First.nextCursor }),
      (error) => error.code === "AUDIT_CURSOR_INVALID"
    );
    await assert.rejects(
      () => context.store.query({ limit: 2, cursor: v3First.nextCursor }),
      (error) => error.code === "AUDIT_CURSOR_INVALID"
    );
  } finally {
    context.close();
  }
});

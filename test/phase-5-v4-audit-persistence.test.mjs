import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PersistentAuditStore,
  createAuditQueryHandlerV4,
  createGitLifecycleAuditEventV4,
  queryAuditEventsV4
} from "../dist/audit/index.js";
import {
  auditEventV4Schema,
  queryAuditEventsResultV3Schema
} from "../dist/audit/schemas.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

async function withStore(callback) {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-v4-audit-"));
  const registry = new ProcessInstanceRegistry(stateRoot);
  const store = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 7, maxClosedBytes: 16 * 1024 * 1024 },
    now: () => 1_700_000_000_000
  });
  try {
    await callback(store);
  } finally {
    store.dispose();
    registry.dispose();
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}

function v2Event(id) {
  return {
    schemaVersion: 2,
    eventId: `event_${id.repeat(32)}`,
    eventType: "administrative",
    timestamp: new Date(1_700_000_000_000).toISOString(),
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: null,
    toolName: null,
    canonicalAction: "audit_test",
    workspaceId: null,
    workspaceRef: null,
    policyRevision: null,
    administrativeAction: "integrity_verification",
    filterDigest: null,
    resultCount: null,
    segmentIds: [],
    firstSequence: null,
    lastSequence: null,
    firstTimestamp: null,
    lastTimestamp: null,
    recordCount: null,
    firstMac: null,
    lastMac: null,
    policyReason: null,
    resultCode: "OK"
  };
}

function v3Event(id) {
  return {
    schemaVersion: 3,
    contractVersion: 3,
    eventId: `event_${id.repeat(32)}`,
    eventType: "snapshot_lifecycle",
    transition: "prepared",
    timestamp: new Date(1_700_000_000_000).toISOString(),
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: null,
    toolName: "workspace_snapshot",
    canonicalAction: "workspace_snapshot",
    workspaceId: "workspace-audit",
    workspaceRef: null,
    policyRevision: "policy-audit",
    subjectFingerprint: "1".repeat(64),
    contextFingerprint: "2".repeat(64),
    resultCode: "PREPARED",
    counts: {},
    snapshotId: "snapshot-audit"
  };
}

function v4Event() {
  return createGitLifecycleAuditEventV4({
    eventId: `event_${"4".repeat(32)}`,
    timestamp: new Date(1_700_000_000_000).toISOString(),
    transition: "effect_observed",
    operationId: `gop_${"5".repeat(32)}`,
    requestId: "request-audit-v4",
    authorizationEventId: `event_${"6".repeat(32)}`,
    toolName: "git_commit",
    canonicalAction: "git_commit",
    repositoryId: `repo_${"7".repeat(32)}`,
    taskWorktreeId: null,
    policyRevision: "policy-audit-v4",
    subjectFingerprint: "8".repeat(64),
    contextFingerprint: "9".repeat(64),
    resultCode: "EFFECT_OBSERVED",
    counts: { objectCount: 1 }
  });
}

function v4AuthorizationEvent() {
  return {
    schemaVersion: 4,
    contractVersion: 4,
    eventId: `event_${"d".repeat(32)}`,
    eventType: "authorization",
    timestamp: new Date(1_700_000_000_000).toISOString(),
    requestId: "request-terminal",
    authorizationEventId: null,
    decisionId: "decision-terminal",
    toolName: "git_commit",
    canonicalAction: "git_commit",
    workspaceId: "workspace-terminal",
    policyRevision: "policy-terminal",
    subjectFingerprint: "e".repeat(64),
    contextFingerprint: "f".repeat(64),
    resultCode: "ALLOW",
    counts: {},
    repositoryId: `repo_${"1".repeat(32)}`,
    taskWorktreeId: null,
    operationId: null,
    outcome: "allow",
    riskClass: "R3",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    approvalId: null,
    grantId: null
  };
}

function v4TerminalEvent() {
  return {
    schemaVersion: 4,
    contractVersion: 4,
    eventId: `event_${"c".repeat(32)}`,
    eventType: "terminal",
    timestamp: new Date(1_700_000_000_000).toISOString(),
    requestId: "request-terminal",
    authorizationEventId: `event_${"d".repeat(32)}`,
    decisionId: "decision-terminal",
    toolName: "git_commit",
    canonicalAction: "git_commit",
    workspaceId: "workspace-terminal",
    policyRevision: "policy-terminal",
    subjectFingerprint: "e".repeat(64),
    contextFingerprint: "f".repeat(64),
    resultCode: "OK",
    counts: {},
    repositoryId: `repo_${"1".repeat(32)}`,
    taskWorktreeId: null,
    operationId: `gop_${"2".repeat(32)}`,
    status: "succeeded",
    durableEffectObserved: true,
    recoveryRequired: false
  };
}

test("persisted audit chain accepts exact V2|V3|V4 while old readers filter V4 before pagination", async () => {
  await withStore(async (store) => {
    await store.append(v2Event("a"));
    await store.append(v3Event("b"));
    await store.append(v4Event());
    const verified = await store.verify();
    assert.deepEqual(verified.map((entry) => entry.event.schemaVersion), [2, 3, 4]);

    const v2 = await store.query({ limit: 1, startTime: new Date(1_699_999_999_000).toISOString(), endTime: new Date(1_700_000_001_000).toISOString() });
    assert.equal(v2.records.length, 1);
    assert.equal(v2.records[0].event.schemaVersion, 2);
    assert.equal(v2.nextCursor, null);

    const v3 = await store.queryV3({ limit: 1, startTime: new Date(1_699_999_999_000).toISOString(), endTime: new Date(1_700_000_001_000).toISOString() });
    assert.equal(v3.records.length, 1);
    assert.equal(v3.records[0].event.schemaVersion, 3);
    assert.notEqual(v3.nextCursor, null);

    const v4 = await queryAuditEventsV4(createAuditQueryHandlerV4(store), {
      limit: 10,
      startTime: new Date(1_699_999_999_000).toISOString(),
      endTime: new Date(1_700_000_001_000).toISOString()
    });
    assert.deepEqual(v4.records.map((record) => record.event.sourceSchemaVersion).sort(), [2, 3, 4]);
    assert.equal(v4.records.find((record) => record.event.sourceSchemaVersion === 4).event.repositoryId, `repo_${"7".repeat(32)}`);
    await assert.rejects(
      queryAuditEventsV4(createAuditQueryHandlerV4(store), { cursor: v3.nextCursor }),
      (error) => error?.code === "AUDIT_CURSOR_INVALID"
    );
  });
});

test("V3 public query schema rejects V4 records and V4 events reject hidden fields or control text", () => {
  const event = v4Event();
  assert.equal(queryAuditEventsResultV3Schema.safeParse({
    schemaVersion: 3,
    records: [{ sequence: 1, event }],
    nextCursor: null,
    filterDigest: "a".repeat(64),
    startTime: new Date(1_699_999_999_000).toISOString(),
    endTime: new Date(1_700_000_001_000).toISOString(),
    limit: 1,
    integrityState: "healthy"
  }).success, false);
  assert.equal(auditEventV4Schema.safeParse({ ...event, privatePath: "C:\\secret\\repo" }).success, false);
  assert.equal(auditEventV4Schema.safeParse({ ...event, resultCode: "OK\u202eFAIL" }).success, false);
  assert.equal(auditEventV4Schema.safeParse({ ...event, repositoryId: null }).success, false);
  assert.equal(auditEventV4Schema.safeParse({ ...v4AuthorizationEvent(), requestId: null }).success, false);
  assert.equal(auditEventV4Schema.safeParse({ ...v4TerminalEvent(), toolName: null }).success, false);
});

test("V4 terminal audit requires exact matching authorization evidence", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      store.append(v4TerminalEvent()),
      (error) => error?.code === "AUDIT_INTEGRITY_FAILURE"
    );
  });
  await withStore(async (store) => {
    await store.append(v4AuthorizationEvent());
    await assert.rejects(
      store.append({ ...v4TerminalEvent(), contextFingerprint: "0".repeat(64) }),
      (error) => error?.code === "AUDIT_INTEGRITY_FAILURE"
    );
  });
  await withStore(async (store) => {
    await store.append({ ...v4AuthorizationEvent(), outcome: "deny", resultCode: "DENY" });
    await assert.rejects(
      store.append(v4TerminalEvent()),
      (error) => error?.code === "AUDIT_INTEGRITY_FAILURE"
    );
  });
});

test("Gate R restart lookup resolves one exact V4 terminal event by operation identity", async () => {
  await withStore(async (store) => {
    await store.append(v4AuthorizationEvent());
    const terminal = v4TerminalEvent();
    await store.append(terminal);
    assert.equal(await store.findTerminalEventV4(terminal.operationId), terminal.eventId);
    assert.equal(await store.findTerminalEventV4(`gop_${"9".repeat(32)}`), null);
  });
});

test("V4 terminal audit is unique per authorization and operation", async () => {
  await withStore(async (store) => {
    const authorization = {
      schemaVersion: 4,
      contractVersion: 4,
      eventId: `event_${"d".repeat(32)}`,
      eventType: "authorization",
      timestamp: new Date(1_700_000_000_000).toISOString(),
      requestId: "request-terminal",
      authorizationEventId: null,
      decisionId: "decision-terminal",
      toolName: "git_commit",
      canonicalAction: "git_commit",
      workspaceId: "workspace-terminal",
      policyRevision: "policy-terminal",
      subjectFingerprint: "e".repeat(64),
      contextFingerprint: "f".repeat(64),
      resultCode: "ALLOW",
      counts: {},
      repositoryId: `repo_${"1".repeat(32)}`,
      taskWorktreeId: null,
      operationId: null,
      outcome: "allow",
      riskClass: "R3",
      resourceFingerprint: `sha256:${"a".repeat(64)}`,
      approvalId: null,
      grantId: null
    };
    await store.append(authorization);
    const base = {
      schemaVersion: 4,
      contractVersion: 4,
      eventId: `event_${"c".repeat(32)}`,
      eventType: "terminal",
      timestamp: new Date(1_700_000_000_000).toISOString(),
      requestId: "request-terminal",
      authorizationEventId: `event_${"d".repeat(32)}`,
      decisionId: "decision-terminal",
      toolName: "git_commit",
      canonicalAction: "git_commit",
      workspaceId: "workspace-terminal",
      policyRevision: "policy-terminal",
      subjectFingerprint: "e".repeat(64),
      contextFingerprint: "f".repeat(64),
      resultCode: "OK",
      counts: {},
      repositoryId: `repo_${"1".repeat(32)}`,
      taskWorktreeId: null,
      operationId: `gop_${"2".repeat(32)}`,
      status: "succeeded",
      durableEffectObserved: true,
      recoveryRequired: false
    };
    await store.append(base);
    await assert.rejects(
      store.append({ ...base, eventId: `event_${"3".repeat(32)}`, resultCode: "CONFLICT" }),
      (error) => error?.code === "AUDIT_INTEGRITY_FAILURE"
    );
  });
});

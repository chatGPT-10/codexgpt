import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PersistentAuditStore } from "../dist/audit/store.js";
import {
  approvalLifecycleAuditEventV3Schema,
  auditEventV3Schema,
  persistedAuditEventSchema
} from "../dist/audit/schemas.js";
import { createApprovalLifecycleSinkV3 } from "../dist/audit/lifecycleV3.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";
import { PendingApprovalStore } from "../dist/policy/pendingApprovals.js";
import { createAuthorizationFactsV3, semanticDigest } from "../dist/policy/authorizationFacts.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-audit-v3-"));
}

function hex32(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

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
    transportSessionId: "session-v2",
    toolName: "read",
    canonicalAction: "read",
    workspaceId: "workspace-v2",
    workspaceRef: null,
    policyRevision: "policy-v2",
    resourceSummary: "filesystem:read:src/example.ts",
    resourceFingerprint: createHash("sha256").update(label).digest("hex"),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: ["rule.test"],
    approvalState: "not_required",
    grantId: null,
    sandboxBackend: "node-baseline",
    riskClass: "R1"
  };
}

function facts() {
  return createAuthorizationFactsV3({
    serverId: "server-v3",
    credentialRef: "credential-v3",
    credentialRevision: "credential-revision-v3",
    transportKind: "http",
    transportSessionId: "session-v3",
    identityKind: "authenticated-subject",
    identitySubject: "subject-v3",
    workspaceId: "workspace-v3",
    leaseId: "lease-v3",
    policyRevision: "policy-v3",
    evidenceRevision: "evidence-v3",
    toolContractVersion: "3",
    toolName: "run_command",
    canonicalAction: "process.run-command",
    operation: "process.execute",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    inputDigest: `sha256:${"b".repeat(64)}`,
    semanticFactsDigest: semanticDigest({ backend: "pipe", argv: ["node", "fixture.mjs"] }),
    riskClass: "R3"
  });
}

const summary = {
  backend: "windows-native-pipe",
  actionKind: "process.execute",
  argumentCount: 2,
  logicalScope: "workspace-v3",
  identityLabel: "subject-v3",
  authoritySummary: "ambient host process execution",
  digestPrefix: "0123456789abcdef"
};

test("AuditEventV3 lifecycle schemas are strict, bounded, and reject unknown transitions", () => {
  const base = {
    schemaVersion: 3,
    contractVersion: 3,
    eventId: `event_${"1".repeat(32)}`,
    eventType: "approval_lifecycle",
    transition: "requested",
    timestamp: "2026-07-16T10:00:00.000Z",
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: "session-v3",
    toolName: "run_command",
    canonicalAction: "process.run-command",
    workspaceId: "workspace-v3",
    workspaceRef: null,
    policyRevision: "policy-v3",
    subjectFingerprint: "2".repeat(64),
    contextFingerprint: "3".repeat(64),
    resultCode: null,
    counts: { argumentCount: 2 },
    approvalId: `approval_${"4".repeat(32)}`,
    grantId: null,
    reservationId: null
  };
  assert.equal(approvalLifecycleAuditEventV3Schema.parse(base).transition, "requested");
  assert.equal(auditEventV3Schema.parse(base).schemaVersion, 3);
  assert.equal(persistedAuditEventSchema.parse(base).contractVersion, 3);
  assert.throws(() => auditEventV3Schema.parse({ ...base, transition: "approved" }), /invalid/i);
  assert.throws(() => auditEventV3Schema.parse({ ...base, rawCommand: "secret" }), /unrecognized/i);
  assert.throws(() => auditEventV3Schema.parse({
    ...base,
    counts: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`count${index}`, index]))
  }), /sixteen/i);
});

test("persistent MAC chain accepts V3 lifecycle events while V2 query projection hides them", async () => {
  const stateRoot = tempRoot();
  const registry = new ProcessInstanceRegistry(stateRoot);
  const now = { value: Date.UTC(2026, 6, 16, 10, 0, 0) };
  const store = PersistentAuditStore.open({
    stateRoot,
    registry,
    now: () => now.value,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  try {
    let randomValue = 0;
    const approvals = new PendingApprovalStore({
      now: () => now.value,
      randomBytes: (size) => Buffer.alloc(size, ++randomValue),
      lifecycleSink: createApprovalLifecycleSinkV3(store)
    });
    const requested = (await approvals.request({ facts: facts(), summary })).approval;
    now.value += 1_000;
    await approvals.prepare(requested.approvalId);
    now.value += 1_000;
    await approvals.approve(requested.approvalId, "grant-v3");
    now.value += 1_000;
    await approvals.markReserved("grant-v3", `reservation_${"5".repeat(32)}`);
    now.value += 1_000;
    await approvals.markConsumed("grant-v3", `reservation_${"5".repeat(32)}`);

    const v2 = authorization("visible-v2", new Date(now.value + 1_000).toISOString());
    await store.append(v2);
    const verified = await store.verify();
    const v3 = verified.filter((envelope) => envelope.event.schemaVersion === 3);
    assert.deepEqual(v3.map((envelope) => envelope.event.transition), [
      "requested", "prepared", "granted", "reserved", "consumed"
    ]);
    assert.equal(v3.every((envelope) => envelope.event.contractVersion === 3), true);
    assert.equal(v3.every((envelope) => envelope.event.approvalId === requested.approvalId), true);

    now.value += 2_000;
    const projected = await store.query({
      startTime: "2026-07-16T09:59:00.000Z",
      endTime: new Date(now.value).toISOString(),
      limit: 10
    });
    assert.deepEqual(projected.records.map((record) => record.event.eventId), [v2.eventId]);
    assert.equal(projected.records.every((record) => record.event.schemaVersion === 2), true);
    assert.equal(projected.nextCursor, null);
  } finally {
    store.dispose();
    registry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("failed lifecycle persistence prevents state transition and does not create an in-memory grant", async () => {
  const approvals = new PendingApprovalStore({
    randomBytes: (size) => Buffer.alloc(size, 7),
    lifecycleSink: async (transition) => {
      if (transition.to === "granted") throw new Error("AUDIT_UNAVAILABLE");
    }
  });
  const requested = (await approvals.request({
    facts: facts(),
    summary,
    createdAt: "2026-07-16T10:00:00.000Z"
  })).approval;
  await assert.rejects(
    approvals.approve(requested.approvalId, "grant-unpersisted", "2026-07-16T10:00:10.000Z"),
    /AUDIT_UNAVAILABLE/
  );
  assert.equal(approvals.get(requested.approvalId).state, "pending");
  assert.equal(approvals.get(requested.approvalId).grantId, null);
});

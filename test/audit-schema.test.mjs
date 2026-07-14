import assert from "node:assert/strict";
import test from "node:test";
import {
  auditEnvelopeV1Schema,
  auditEventV2Schema,
  authorizationAuditEventV2Schema,
  executionAuditEventV2Schema
} from "../dist/audit/schemas.js";
import {
  auditRecordMac,
  canonicalJson,
  workspaceAuditRef
} from "../dist/audit/canonicalJson.js";

const common = {
  schemaVersion: 2,
  eventId: `event_${"1".repeat(32)}`,
  eventType: "authorization",
  timestamp: "2026-07-14T12:00:00.000Z",
  requestId: `request_${"2".repeat(32)}`,
  authorizationEventId: null,
  decisionId: `decision_${"3".repeat(32)}`,
  credentialRef: `credential_${"4".repeat(32)}`,
  transportSessionId: `session_${"5".repeat(32)}`,
  toolName: "write",
  canonicalAction: "write",
  workspaceId: `ws_${"6".repeat(32)}`,
  workspaceRef: `awr_${"7".repeat(32)}`,
  policyRevision: `policy_${"8".repeat(32)}`
};

const authorization = {
  ...common,
  resourceSummary: "filesystem:write:src/example.ts",
  resourceFingerprint: "9".repeat(64),
  outcome: "allow",
  reasonCode: null,
  safeRuleIds: ["rule.workspace.write"],
  approvalState: "not_required",
  grantId: null,
  sandboxBackend: "node-baseline",
  riskClass: "R2"
};

const execution = {
  ...common,
  eventId: `event_${"a".repeat(32)}`,
  eventType: "execution",
  authorizationEventId: common.eventId,
  status: "succeeded",
  resultCode: "OK",
  durationMs: 12,
  exitCode: null,
  boundedByteCounts: { written: 4 },
  changeSetId: `cs_${"b".repeat(32)}`,
  operationCount: 1,
  mutationKinds: ["replace"],
  recoveryRequired: false
};

test("authorization and execution schemas accept exact safe V2 events", () => {
  assert.deepEqual(authorizationAuditEventV2Schema.parse(authorization), authorization);
  assert.deepEqual(executionAuditEventV2Schema.parse(execution), execution);
  assert.deepEqual(auditEventV2Schema.parse(authorization), authorization);
  assert.deepEqual(auditEventV2Schema.parse(execution), execution);
});

test("V2 event schemas reject unknown sensitive and inconsistent fields", () => {
  for (const [field, value] of [
    ["workspaceRoot", "C:\\Users\\Noah\\secret"],
    ["content", "file body"],
    ["diff", "-old +new"],
    ["authorization", "Bearer secret"],
    ["cookie", "session=secret"],
    ["privateKey", "PRIVATE KEY"]
  ]) {
    assert.throws(() => auditEventV2Schema.parse({ ...authorization, [field]: value }), /unrecognized/i);
  }
  assert.throws(
    () => executionAuditEventV2Schema.parse({ ...execution, authorizationEventId: null }),
    /authorization/i
  );
  assert.throws(
    () => executionAuditEventV2Schema.parse({
      ...execution,
      status: "not_executed",
      changeSetId: execution.changeSetId,
      operationCount: 1,
      mutationKinds: ["replace"]
    }),
    /not_executed/i
  );
  assert.throws(
    () => executionAuditEventV2Schema.parse({ ...execution, durationMs: Number.NaN }),
    /finite|number/i
  );
  assert.throws(
    () => executionAuditEventV2Schema.parse({ ...execution, mutationKinds: ["replace", "replace"] }),
    /unique/i
  );
});

test("canonical JSON is deterministic and rejects unsupported values", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [3, 2, 1] }),
    '{"a":{"x":3,"y":2},"list":[3,2,1],"z":1}'
  );
  assert.throws(() => canonicalJson({ value: Number.NaN }), /finite/i);
  assert.throws(() => canonicalJson({ value: undefined }), /unsupported/i);
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle), /cycle/i);
});

test("audit envelope HMAC is deterministic and chains exact canonical fields", () => {
  const key = Buffer.alloc(32, 7);
  const first = {
    storeVersion: 1,
    sequence: 1,
    segmentId: "audit-2026-07-14-000001",
    previousMac: "0".repeat(64),
    event: authorization
  };
  const reordered = {
    event: authorization,
    previousMac: "0".repeat(64),
    segmentId: "audit-2026-07-14-000001",
    sequence: 1,
    storeVersion: 1
  };
  const recordMac = auditRecordMac(key, first);
  assert.equal(recordMac, auditRecordMac(key, reordered));
  const envelope = auditEnvelopeV1Schema.parse({ ...first, recordMac });
  assert.equal(envelope.recordMac, recordMac);
  assert.equal(recordMac.length, 64);
});

test("workspace audit references are keyed opaque and platform-stable", () => {
  const key = Buffer.alloc(32, 9);
  const first = workspaceAuditRef("C:\\Repo", key, "win32");
  const equivalent = workspaceAuditRef("c:\\repo\\", key, "win32");
  assert.equal(first, equivalent);
  assert.match(first, /^awr_[a-f0-9]{32}$/);
  assert.notEqual(first, workspaceAuditRef("C:\\Other", key, "win32"));
  assert.equal(first.includes("Repo"), false);
});

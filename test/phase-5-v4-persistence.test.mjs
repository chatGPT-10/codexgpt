import assert from "node:assert/strict";
import test from "node:test";
import {
  queryAuditEventsInputV2Schema,
  queryAuditEventsInputV3Schema,
  queryAuditEventsInputV4Schema,
  queryAuditEventsResultV4Schema
} from "../dist/audit/schemas.js";
import {
  gitV4PersistentRecordHeaderSchema,
  gitV4StateReaderVersions
} from "../dist/tools/schemas/gitV4Common.js";
import * as contracts from "../dist/tools/contracts/index.js";

const digest = "a".repeat(64);

test("V4 audit query cursors are domain separated while V2 and V3 cursor readers remain exact", () => {
  const legacyCursor = `legacy.${digest}`;
  const v4Cursor = `v4:cursor.${digest}`;
  assert.equal(queryAuditEventsInputV2Schema.safeParse({ cursor: legacyCursor }).success, true);
  assert.equal(queryAuditEventsInputV3Schema.safeParse({ cursor: legacyCursor }).success, true);
  assert.equal(queryAuditEventsInputV4Schema.safeParse({ cursor: legacyCursor }).success, false);
  assert.equal(queryAuditEventsInputV4Schema.safeParse({ cursor: v4Cursor }).success, true);
  assert.equal(queryAuditEventsInputV2Schema.safeParse({ cursor: v4Cursor }).success, false);
  assert.equal(queryAuditEventsInputV3Schema.safeParse({ cursor: v4Cursor }).success, false);
});

test("V4 query projection has its own schema version and can represent an empty verified mixed-version page", () => {
  const value = {
    schemaVersion: 4,
    records: [],
    nextCursor: null,
    filterDigest: digest,
    startTime: "2026-07-18T00:00:00.000Z",
    endTime: "2026-07-18T01:00:00.000Z",
    limit: 100,
    integrityState: "healthy"
  };
  assert.equal(queryAuditEventsResultV4Schema.safeParse(value).success, true);
  assert.equal(queryAuditEventsResultV4Schema.safeParse({ ...value, schemaVersion: 3 }).success, false);
});

test("V4 normalized audit pages preserve source version facts for V2 V3 and V4 events", () => {
  assert.equal(queryAuditEventsInputV4Schema.safeParse({
    eventTypes: ["execution", "process_lifecycle", "git_operation"]
  }).success, true);

  const common = {
    schemaVersion: 4,
    timestamp: "2026-07-18T00:30:00.000Z",
    requestId: null,
    toolName: null,
    canonicalAction: "audit_action",
    repositoryId: null,
    taskWorktreeId: null,
    resultCode: null,
    counts: {}
  };
  const v2 = {
    ...common,
    sourceSchemaVersion: 2,
    sourceContractVersion: null,
    eventId: `event_${"1".repeat(32)}`,
    eventType: "execution",
    subjectFingerprint: null,
    contextFingerprint: null
  };
  const v3 = {
    ...common,
    sourceSchemaVersion: 3,
    sourceContractVersion: 3,
    eventId: `event_${"2".repeat(32)}`,
    eventType: "process_lifecycle",
    subjectFingerprint: digest,
    contextFingerprint: "b".repeat(64)
  };
  const v4 = {
    ...common,
    sourceSchemaVersion: 4,
    sourceContractVersion: 4,
    eventId: `event_${"3".repeat(32)}`,
    eventType: "git_operation",
    repositoryId: `repo_${"4".repeat(32)}`,
    subjectFingerprint: digest,
    contextFingerprint: "c".repeat(64)
  };
  const page = {
    schemaVersion: 4,
    records: [v2, v3, v4].map((event, index) => ({ sequence: index + 1, event })),
    nextCursor: null,
    filterDigest: digest,
    startTime: "2026-07-18T00:00:00.000Z",
    endTime: "2026-07-18T01:00:00.000Z",
    limit: 100,
    integrityState: "healthy"
  };
  assert.equal(queryAuditEventsResultV4Schema.safeParse(page).success, true);
  assert.equal(queryAuditEventsResultV4Schema.safeParse({
    ...page,
    records: [{ sequence: 1, event: { ...v2, sourceContractVersion: 1 } }]
  }).success, false);
  assert.equal(queryAuditEventsResultV4Schema.safeParse({
    ...page,
    records: [{ sequence: 1, event: { ...v3, repositoryId: `repo_${"5".repeat(32)}` } }]
  }).success, false);
});

test("same-binary rollback hides V4 tools without removing V4 reader schemas", () => {
  assert.equal(contracts.canonicalToolsForVersion(3).some((name) => contracts.CONTRACT_V4_ADDITIONS.includes(name)), false);
  assert.deepEqual(gitV4StateReaderVersions, [1, 2, 3, 4]);
  assert.equal(gitV4PersistentRecordHeaderSchema.safeParse({ schema_version: 4, contract_version: 4 }).success, true);
  assert.equal(gitV4PersistentRecordHeaderSchema.safeParse({ schema_version: 5, contract_version: 4 }).success, false);
});

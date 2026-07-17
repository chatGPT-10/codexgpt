import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { FullAccessLeaseManager } = await tsImport("../fixtures/ts-imports/full-access-imports.ts", import.meta.url);

const rootIdentity = Object.freeze({
  canonicalRoot: "C:\\Data",
  comparisonKey: "c:\\data",
  volumeSerial: "volume-1",
  directoryId: "directory-1",
  reparsePoint: false,
  mappedDrive: false
});

test("confirmed-root lease keeps independent idle and absolute expiry", async () => {
  let now = 0;
  const events = [];
  const manager = new FullAccessLeaseManager({
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, 7),
    quarantineProcessInput: async () => events.push("quarantine"),
    terminateBoundJobs: async () => events.push("terminate"),
    cleanupAuthorization: async () => events.push("cleanup")
  });
  const lease = manager.create({
    rootIdentity,
    access: "read_write",
    requestedLeaseMs: 30 * 60_000,
    bindingFingerprint: "binding-1",
    approvalId: "approval-1",
    grantId: "grant-1"
  });
  assert.equal(Date.parse(lease.idleExpiresAt), 10 * 60_000);
  assert.equal(Date.parse(lease.absoluteExpiresAt), 30 * 60_000);
  now = 9 * 60_000;
  const touched = manager.get(lease.workspaceId);
  assert.equal(Date.parse(touched.idleExpiresAt), 19 * 60_000);
  now = 18 * 60_000;
  manager.get(lease.workspaceId);
  now = 27 * 60_000;
  manager.get(lease.workspaceId);
  now = 29 * 60_000;
  assert.equal(Date.parse(manager.get(lease.workspaceId).idleExpiresAt), 30 * 60_000);
  now = 30 * 60_000;
  assert.throws(() => manager.get(lease.workspaceId), /expired/i);
  await manager.drainRevocations();
  assert.deepEqual(events, ["quarantine", "terminate", "cleanup"]);
});

test("read-only confirmed root cannot write and access class participates in handle identity", () => {
  let byte = 1;
  const manager = new FullAccessLeaseManager({
    now: () => 0,
    randomBytes: (size) => Buffer.alloc(size, byte++)
  });
  const readOnly = manager.create({ rootIdentity, access: "read_only", requestedLeaseMs: 60_000, bindingFingerprint: "same", approvalId: "a1", grantId: "g1" });
  const readWrite = manager.create({ rootIdentity, access: "read_write", requestedLeaseMs: 60_000, bindingFingerprint: "same", approvalId: "a2", grantId: "g2" });
  assert.notEqual(readOnly.workspaceId, readWrite.workspaceId);
  assert.notEqual(readOnly.leaseKey, readWrite.leaseKey);
  assert.throws(() => manager.assertWrite(readOnly.workspaceId), /read-only/i);
  assert.doesNotThrow(() => manager.assertWrite(readWrite.workspaceId));
});

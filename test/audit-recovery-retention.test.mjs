import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function temporaryStateRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-audit-recovery-"));
}

function hex32(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

function administrative(label, timestamp, policyReason = label) {
  return {
    schemaVersion: 2,
    eventId: `event_${hex32(label)}`,
    eventType: "administrative",
    timestamp,
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
    policyReason,
    resultCode: "OK"
  };
}

function openStore(root, registry, now, options = {}) {
  return PersistentAuditStore.open({
    stateRoot: root,
    registry,
    now: () => now.value,
    retention: options.retention ?? { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 },
    maxSegmentBytes: options.maxSegmentBytes
  });
}

function indexAt(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "audit", "index.json"), "utf8"));
}

function activeSegmentPath(root) {
  const index = indexAt(root);
  const active = index.segments.find((segment) => segment.state === "active");
  return path.join(root, "audit", "segments", active.fileName);
}

test("only an unclaimed incomplete final line is quarantined and followed by a recovery event", async () => {
  const root = temporaryStateRoot();
  const registry = new ProcessInstanceRegistry(root);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = openStore(root, registry, now);
    await store.append(administrative("tail-base", new Date(now.value).toISOString()));
    const segment = activeSegmentPath(root);
    fs.appendFileSync(segment, Buffer.from('{"partial":', "utf8"));

    const verified = await store.verify();
    assert.equal(verified.length, 2);
    assert.equal(verified[1].event.eventType, "recovery");
    assert.equal(verified[1].event.recoveryAction, "tail_quarantined");
    assert.equal(fs.readFileSync(segment, "utf8").endsWith("\n"), true);
    const quarantine = fs.readdirSync(path.join(root, "audit", "quarantine"));
    assert.equal(quarantine.length, 1);
    assert.equal(
      fs.readFileSync(path.join(root, "audit", "quarantine", quarantine[0]), "utf8"),
      '{"partial":'
    );
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-tail authentication damage sets integrity_failed and blocks further append", async () => {
  const root = temporaryStateRoot();
  const registry = new ProcessInstanceRegistry(root);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = openStore(root, registry, now);
    await store.append(administrative("damage-1", new Date(now.value).toISOString()));
    await store.append(administrative("damage-2", new Date(now.value + 1000).toISOString()));
    const segment = activeSegmentPath(root);
    const lines = fs.readFileSync(segment, "utf8").trimEnd().split("\n");
    const first = JSON.parse(lines[0]);
    first.event.canonicalAction = "tampered";
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(segment, `${lines.join("\n")}\n`, "utf8");

    await assert.rejects(() => store.verify(), (error) => error.code === "AUDIT_INTEGRITY_FAILURE");
    assert.equal(store.diagnostics().state, "integrity_failed");
    await assert.rejects(
      () => store.append(administrative("damage-3", new Date(now.value + 2000).toISOString())),
      (error) => error.code === "AUDIT_INTEGRITY_FAILURE"
    );
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("UTC-date rotation records an administrative event and carries the chain across segments", async () => {
  const root = temporaryStateRoot();
  const registry = new ProcessInstanceRegistry(root);
  const now = { value: Date.UTC(2026, 6, 14, 23, 59) };
  try {
    const store = openStore(root, registry, now);
    await store.append(administrative("rotation-day-1", new Date(now.value).toISOString()));
    now.value = Date.UTC(2026, 6, 15, 0, 1);
    await store.append(administrative("rotation-day-2", new Date(now.value).toISOString()));

    const verified = await store.verify();
    assert.deepEqual(verified.map((item) => item.event.eventType), [
      "administrative",
      "administrative",
      "administrative"
    ]);
    assert.equal(verified[1].event.administrativeAction, "segment_rotation");
    assert.equal(verified[2].previousMac, verified[1].recordMac);
    const index = indexAt(root);
    assert.equal(index.segments.length, 2);
    assert.equal(index.segments[0].state, "closed");
    assert.equal(index.segments[1].state, "active");
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("size rotation happens before the next ordinary record is placed in a new segment", async () => {
  const root = temporaryStateRoot();
  const registry = new ProcessInstanceRegistry(root);
  const now = { value: Date.UTC(2026, 6, 14, 12) };
  try {
    const store = openStore(root, registry, now, { maxSegmentBytes: 4096 });
    for (let index = 0; index < 8; index += 1) {
      await store.append(administrative(
        `size-${index}`,
        new Date(now.value + index * 1000).toISOString(),
        `${index}-${"x".repeat(200)}`
      ));
    }
    const verified = await store.verify();
    assert.equal(verified.some((item) => (
      item.event.eventType === "administrative" &&
      item.event.administrativeAction === "segment_rotation"
    )), true);
    assert.ok(indexAt(root).segments.length >= 2);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("retention appends a tombstone before deleting only the oldest closed prefix", async () => {
  const root = temporaryStateRoot();
  const registry = new ProcessInstanceRegistry(root);
  const now = { value: Date.UTC(2026, 6, 10, 12) };
  try {
    const store = openStore(root, registry, now, {
      retention: { maxAgeDays: 1, maxClosedBytes: 1500 }
    });
    await store.append(administrative("retain-1", new Date(now.value).toISOString()));
    now.value = Date.UTC(2026, 6, 11, 12);
    await store.append(administrative("retain-2", new Date(now.value).toISOString()));
    now.value = Date.UTC(2026, 6, 12, 12);
    await store.append(administrative("retain-3", new Date(now.value).toISOString()));
    const before = indexAt(root);
    const closedBefore = before.segments.filter((segment) => segment.state === "closed");
    assert.ok(closedBefore.length >= 2);

    now.value = Date.UTC(2026, 6, 15, 12);
    const pruned = await store.runRetention();
    assert.deepEqual(pruned, closedBefore.map((segment) => segment.segmentId));
    for (const segment of closedBefore) {
      assert.equal(fs.existsSync(path.join(root, "audit", "segments", segment.fileName)), false);
    }
    const after = indexAt(root);
    assert.equal(after.chainAnchorSequence, closedBefore.at(-1).lastSequence);
    assert.equal(after.chainAnchorMac, closedBefore.at(-1).lastMac);
    assert.equal(after.segments.some((segment) => segment.state === "active"), true);
    const verified = await store.verify();
    const tombstone = verified.find((item) => (
      item.event.eventType === "administrative" &&
      item.event.administrativeAction === "retention_prune"
    ));
    assert.ok(tombstone);
    assert.deepEqual(tombstone.event.segmentIds, pruned);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

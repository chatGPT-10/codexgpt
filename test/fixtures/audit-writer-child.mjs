import { createHash } from "node:crypto";
import { PersistentAuditStore } from "../../dist/audit/store.js";
import { ProcessInstanceRegistry } from "../../dist/transactions/workspaceLock.js";

const [stateRoot, writerId, rawCount] = process.argv.slice(2);
const count = Number(rawCount);
if (!stateRoot || !/^[0-9]+$/.test(writerId) || !Number.isInteger(count) || count < 1 || count > 1000) {
  throw new Error("invalid child arguments");
}

function hex32(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

function event(index) {
  return {
    schemaVersion: 2,
    eventId: `event_${hex32(`${writerId}:${index}`)}`,
    eventType: "administrative",
    timestamp: new Date(Date.UTC(2026, 6, 14, 12, 0, index)).toISOString(),
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: null,
    toolName: null,
    canonicalAction: "audit_writer_probe",
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
    policyReason: `writer-${writerId}`,
    resultCode: "OK"
  };
}

const registry = new ProcessInstanceRegistry(stateRoot);
try {
  const store = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  for (let index = 0; index < count; index += 1) {
    await store.append(event(index));
  }
  process.stdout.write(`${count}\n`);
} finally {
  registry.dispose();
}

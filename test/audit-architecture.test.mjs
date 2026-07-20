import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { probeAuditReadiness } from "../dist/audit/diagnostics.js";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { CANONICAL_CODEXGPT_CHILD_TOOLS } from "../dist/tools/schemas/codexgpt.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-audit-architecture-"));
}

function hex32(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

function administrative(label) {
  return {
    schemaVersion: 2,
    eventId: `event_${hex32(label)}`,
    eventType: "administrative",
    timestamp: "2026-07-14T12:00:00.000Z",
    requestId: null,
    authorizationEventId: null,
    decisionId: null,
    credentialRef: null,
    transportSessionId: null,
    toolName: null,
    canonicalAction: "architecture_probe",
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
    policyReason: "test",
    resultCode: "OK"
  };
}

test("audit implementation has no Git network shell database or background-worker dependency", () => {
  const directory = path.resolve("src/audit");
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".ts"));
  const source = files.map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
  for (const forbidden of [
    /node:child_process/,
    /node:net/,
    /node:http/,
    /node:https/,
    /worker_threads/,
    /\bsetInterval\s*\(/,
    /gitOps/,
    /bashOps/,
    /sqlite/i,
    /leveldb/i,
    /postgres/i
  ]) {
    assert.equal(forbidden.test(source), false, `forbidden audit dependency: ${forbidden}`);
  }
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS.length, 28);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS.includes("query_audit_events"), false);
});

test("readiness probe verifies lock key tail and retention without changing audit evidence", async () => {
  const stateRoot = tempRoot();
  const registry = new ProcessInstanceRegistry(stateRoot);
  try {
    const store = PersistentAuditStore.open({
      stateRoot,
      registry,
      retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
    });
    await store.append(administrative("before-probe"));
    const before = await store.verify();
    const probe = await probeAuditReadiness({
      auditMode: "required",
      auditRetention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
    }, { stateRoot });
    const after = await store.verify();
    assert.equal(probe.outcome, "pass");
    assert.equal(probe.reasonCode, "AUDIT_READY");
    assert.deepEqual(probe.checks, {
      stateDirectoryValid: true,
      installationKeyValid: true,
      writerLockValid: true,
      tailValid: true,
      retentionValid: true
    });
    assert.deepEqual(after.map((item) => item.recordMac), before.map((item) => item.recordMac));
    const text = JSON.stringify(probe);
    for (const secret of [
      stateRoot,
      "stateRoot",
      "masterKey",
      "recordKey",
      "cursorKey",
      "workspaceRoot",
      "quarantineBytes",
      "before-probe"
    ]) {
      assert.equal(text.includes(secret), false, `probe leaked ${secret}`);
    }
  } finally {
    registry.dispose();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("best-effort state-root unavailability warns while required audit fails closed", async () => {
  const unavailable = { resolveStateRoot: () => { throw new Error("missing native state environment"); } };
  const bestEffort = await probeAuditReadiness({
    auditMode: "auto",
    auditRetention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  }, unavailable);
  assert.equal(bestEffort.outcome, "warn");
  assert.equal(bestEffort.reasonCode, "AUDIT_UNINITIALIZED");

  const required = await probeAuditReadiness({
    auditMode: "required",
    auditRetention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  }, unavailable);
  assert.equal(required.outcome, "fail");
  assert.equal(required.reasonCode, "AUDIT_UNAVAILABLE");
});

test("public audit documentation describes default V1 and explicit exact V2 activation", () => {
  const configExample = fs.readFileSync(path.resolve("config.example.env"), "utf8");
  const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
  const readmeZh = fs.readFileSync(path.resolve("README_ZH.md"), "utf8");
  const security = fs.readFileSync(path.resolve("SECURITY.md"), "utf8");

  for (const variable of [
    "CODEXGPT_AUDIT_MODE",
    "CODEXGPT_AUDIT_RETENTION_DAYS",
    "CODEXGPT_AUDIT_RETENTION_BYTES"
  ]) {
    assert.match(configExample, new RegExp(`^${variable}=`, "m"));
    assert.match(readme, new RegExp(variable));
    assert.match(readmeZh, new RegExp(variable));
  }
  for (const variable of [
    "CODEXGPT_TOOL_CONTRACT_VERSION",
    "CODEXGPT_MOVE_MAX_FILE_BYTES",
    "CODEXGPT_MOVE_MAX_TOTAL_BYTES",
    "CODEXGPT_MOVE_HASH_CONCURRENCY"
  ]) {
    assert.match(configExample, new RegExp(`^${variable}=`, "m"));
  }
  assert.match(readme, /Writable atomic V1 requires persistent terminal audit/i);
  assert.match(readme, /Explicit contract V2 .* requires atomic transactions and persistent audit/i);
  assert.match(readme, /defines exactly 31 child tools/i);
  assert.match(readmeZh, /可写 atomic 操作必须持久化终态审计/);
  assert.match(readmeZh, /显式选择 Contract V2/);
  assert.match(readmeZh, /精确的 31 个子工具集合/);
  assert.match(security, /The production runtime is injected when atomic or non-legacy Policy\/audit configuration requires it/i);
  assert.match(security, /In contract V2 full mode, `query_audit_events` is an installation-level `audit:read` operation/i);
});

test("disabled and invalid audit readiness states remain bounded and path-free", async () => {
  const disabled = await probeAuditReadiness({
    auditMode: "off",
    auditRetention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  }, { stateRoot: path.resolve("unused-audit-state") });
  assert.equal(disabled.outcome, "skipped");
  assert.equal(disabled.reasonCode, "AUDIT_DISABLED");

  const invalid = await probeAuditReadiness({
    auditMode: "required",
    auditRetention: { maxAgeDays: 0, maxClosedBytes: 0 }
  }, { stateRoot: path.resolve("unused-audit-state") });
  assert.equal(invalid.outcome, "fail");
  assert.equal(invalid.reasonCode, "AUDIT_RETENTION_INVALID");
  assert.equal(JSON.stringify(invalid).includes(path.resolve("unused-audit-state")), false);
});

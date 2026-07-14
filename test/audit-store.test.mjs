import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function stateRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-audit-store-"));
}

function commonEvent(eventId, eventType, timestamp = "2026-07-14T12:00:00.000Z") {
  return {
    schemaVersion: 2,
    eventId,
    eventType,
    timestamp,
    requestId: `request_${"2".repeat(32)}`,
    authorizationEventId: null,
    decisionId: `decision_${"3".repeat(32)}`,
    credentialRef: null,
    transportSessionId: `session_${"5".repeat(32)}`,
    toolName: "write",
    canonicalAction: "write",
    workspaceId: `ws_${"6".repeat(32)}`,
    workspaceRef: `awr_${"7".repeat(32)}`,
    policyRevision: `policy_${"8".repeat(32)}`
  };
}

function authorization(eventId = `event_${"1".repeat(32)}`) {
  return {
    ...commonEvent(eventId, "authorization"),
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
}

function execution(authId, eventId = `event_${"a".repeat(32)}`) {
  return {
    ...commonEvent(eventId, "execution", "2026-07-14T12:00:00.100Z"),
    authorizationEventId: authId,
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
}

function child(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      processExec(),
      [path.resolve("test/fixtures/audit-writer-child.mjs"), ...args],
      { cwd: path.resolve("."), stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk) => { stdout += chunk; });
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.once("error", reject);
    process.once("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`child exited ${code}: ${stderr || stdout}`));
    });
  });
}

function processExec() {
  return process.execPath;
}

test("persistent audit store appends a durable canonical HMAC chain and reopens", async () => {
  const root = stateRoot();
  const registry = new ProcessInstanceRegistry(root);
  try {
    const store = PersistentAuditStore.open({
      stateRoot: root,
      registry,
      retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
    });
    const auth = authorization();
    const first = await store.append(auth);
    const second = await store.append(execution(auth.eventId));
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(second.previousMac, first.recordMac);

    const verified = await store.verify();
    assert.deepEqual(verified.map((item) => item.sequence), [1, 2]);
    assert.equal(verified[0].event.eventType, "authorization");
    assert.equal(verified[1].event.eventType, "execution");

    const reopened = PersistentAuditStore.open({
      stateRoot: root,
      registry,
      retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
    });
    assert.deepEqual((await reopened.verify()).map((item) => item.recordMac), [first.recordMac, second.recordMac]);
    const diagnostics = reopened.diagnostics();
    assert.equal(diagnostics.state, "healthy");
    assert.equal(diagnostics.lastCommittedSequence, 2);

    const indexText = fs.readFileSync(path.join(root, "audit", "index.json"), "utf8");
    assert.equal(indexText.includes('"event"'), false);
    const index = JSON.parse(indexText);
    const active = index.segments.find((item) => item.state === "active");
    const segmentText = fs.readFileSync(path.join(root, "audit", "segments", active.fileName), "utf8");
    assert.equal(segmentText.endsWith("\n"), true);
    assert.equal(segmentText.trimEnd().split("\n").length, 2);
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("retries are idempotent and conflicting terminal execution is rejected", async () => {
  const root = stateRoot();
  const registry = new ProcessInstanceRegistry(root);
  try {
    const store = PersistentAuditStore.open({
      stateRoot: root,
      registry,
      retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
    });
    const auth = authorization();
    const terminal = execution(auth.eventId);
    const firstAuth = await store.append(auth);
    const retryAuth = await store.append({ ...auth });
    assert.equal(retryAuth.sequence, firstAuth.sequence);
    assert.equal(retryAuth.recordMac, firstAuth.recordMac);
    const firstTerminal = await store.append(terminal);
    const retryTerminal = await store.append({ ...terminal });
    assert.equal(retryTerminal.sequence, firstTerminal.sequence);
    assert.equal((await store.verify()).length, 2);

    await assert.rejects(
      () => store.append({
        ...terminal,
        eventId: `event_${"c".repeat(32)}`,
        status: "failed",
        resultCode: "CONFLICT"
      }),
      (error) => error.code === "AUDIT_INTEGRITY_FAILURE"
    );
    assert.equal(store.diagnostics().state, "integrity_failed");
  } finally {
    registry.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("two processes serialize audit appends without gaps or partial lines", async () => {
  const root = stateRoot();
  const bootstrap = new ProcessInstanceRegistry(root);
  bootstrap.dispose();
  try {
    await Promise.all([
      child([root, "1", "25"]),
      child([root, "2", "25"])
    ]);
    const registry = new ProcessInstanceRegistry(root);
    try {
      const store = PersistentAuditStore.open({
        stateRoot: root,
        registry,
        retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
      });
      const verified = await store.verify();
      assert.equal(verified.length, 50);
      assert.deepEqual(verified.map((item) => item.sequence), Array.from({ length: 50 }, (_, index) => index + 1));
      assert.equal(new Set(verified.map((item) => item.event.eventId)).size, 50);
      for (let index = 1; index < verified.length; index += 1) {
        assert.equal(verified[index].previousMac, verified[index - 1].recordMac);
      }
    } finally {
      registry.dispose();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

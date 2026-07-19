import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VerificationReceiptServiceV4 } from "../dist/worktrees/verificationReceipts.js";

function terminalEvidence(now, overrides = {}) {
  return {
    mergePlanId: `merge_${"0".repeat(32)}`,
    category: "test",
    repositoryId: `repo_${"1".repeat(32)}`,
    repositoryIdentityFingerprint: "2".repeat(64),
    taskWorktreeId: `task_${"3".repeat(32)}`,
    taskGeneration: 2,
    candidateOid: "4".repeat(40),
    candidateTreeOid: "5".repeat(40),
    integrationWorkspaceId: `ws_${"6".repeat(32)}`,
    workspaceRootIdentity: "7".repeat(64),
    cleanStateDigest: "8".repeat(64),
    ownerFingerprint: "9".repeat(64),
    contextFingerprint: "a".repeat(64),
    commandDigest: "b".repeat(64),
    commandResourceFingerprint: "c".repeat(64),
    backendId: "test-backend",
    backendVersion: "v1",
    executableIdentity: "d".repeat(64),
    effectiveEnvironmentDigest: "e".repeat(64),
    cwdIdentity: "f".repeat(64),
    policyRevision: "policy-v4",
    capabilityRevision: "0".repeat(64),
    terminalAuditEventId: `event_${"1".repeat(32)}`,
    exitCode: 0,
    expiresAt: new Date(now + 60_000).toISOString(),
    ...overrides
  };
}

test("verification receipts bind candidate, owner, policy, capability, terminal audit, and expiry", () => {
  let now = Date.now();
  const service = new VerificationReceiptServiceV4(Buffer.alloc(32, 91), () => now);
  const evidence = terminalEvidence(now);
  const receipt = service.issueFromTerminalEvidence(evidence);
  const facts = {
    ...evidence,
    exitCode: 0,
    issuedAt: new Date(now).toISOString()
  };
  assert.deepEqual(service.verify(receipt, facts), facts);
  assert.throws(() => service.verify(receipt, { candidateOid: "7".repeat(40) }), /VERIFICATION_RECEIPT_INVALID/);
  now += 60_001;
  assert.throws(() => service.verify(receipt, {}), /VERIFICATION_RECEIPT_INVALID/);
});

test("verification receipt reservations enforce an exact category set and one-use consumption", () => {
  const now = Date.now();
  const service = new VerificationReceiptServiceV4(Buffer.alloc(32, 92), () => now);
  const testReceipt = service.issueFromTerminalEvidence(terminalEvidence(now));
  const lintReceipt = service.issueFromTerminalEvidence(terminalEvidence(now, {
    category: "lint",
    terminalAuditEventId: `event_${"2".repeat(32)}`
  }));
  assert.throws(() => service.reserveForMerge({
    tokens: [testReceipt],
    expected: { mergePlanId: terminalEvidence(now).mergePlanId },
    requiredCategories: ["test", "lint"]
  }), /MERGE_CHECKS_REQUIRED/);
  const first = service.reserveForMerge({
    tokens: [lintReceipt, testReceipt],
    expected: { mergePlanId: terminalEvidence(now).mergePlanId },
    requiredCategories: ["test", "lint"]
  });
  assert.throws(() => service.reserveForMerge({
    tokens: [testReceipt, lintReceipt],
    expected: {},
    requiredCategories: ["test", "lint"]
  }), /VERIFICATION_RECEIPT_INVALID/);
  first.release();
  const second = service.reserveForMerge({
    tokens: [testReceipt, lintReceipt],
    expected: {},
    requiredCategories: ["test", "lint"]
  });
  second.consume();
  assert.throws(() => service.verify(testReceipt, {}), /VERIFICATION_RECEIPT_INVALID/);
  assert.throws(() => service.verify(lintReceipt, {}), /VERIFICATION_RECEIPT_INVALID/);
});

test("verification receipts survive a same-binary restart when durable state is configured", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-receipt-restart-"));
  const masterKey = Buffer.alloc(32, 14);
  const tokenKey = Buffer.alloc(32, 15);
  const now = Date.now();
  const evidence = terminalEvidence(now, { policyRevision: "policy-receipt" });
  const facts = { ...evidence, exitCode: 0, issuedAt: new Date(now).toISOString() };
  try {
    const first = new VerificationReceiptServiceV4(
      Buffer.from(tokenKey),
      () => now,
      { stateRoot, masterKey }
    );
    const token = first.issueFromTerminalEvidence(evidence);
    first.dispose();
    const restarted = new VerificationReceiptServiceV4(
      Buffer.from(tokenKey),
      () => now + 1,
      { stateRoot, masterKey }
    );
    assert.deepEqual(restarted.verify(token, {
      taskWorktreeId: facts.taskWorktreeId,
      candidateOid: facts.candidateOid
    }), facts);
    restarted.dispose();
  } finally {
    masterKey.fill(0);
    tokenKey.fill(0);
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
});

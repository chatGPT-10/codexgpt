import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VerificationReceiptServiceV4 } from "../dist/worktrees/verificationReceipts.js";

test("verification receipts bind candidate, owner, policy, capability, terminal audit, and expiry", () => {
  let now = Date.now();
  const service = new VerificationReceiptServiceV4(Buffer.alloc(32, 91), () => now);
  const facts = {
    taskWorktreeId: `task_${"1".repeat(32)}`,
    candidateOid: "2".repeat(40),
    ownerFingerprint: "3".repeat(64),
    policyRevision: "policy-v4",
    capabilityRevision: "4".repeat(64),
    commandDigest: "5".repeat(64),
    terminalAuditEventId: `event_${"6".repeat(32)}`,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  };
  const receipt = service.issue(facts);
  assert.equal(service.verify(receipt, { candidateOid: facts.candidateOid }).taskWorktreeId, facts.taskWorktreeId);
  assert.throws(() => service.verify(receipt, { candidateOid: "7".repeat(40) }), /VERIFICATION_RECEIPT_INVALID/);
  now += 60_001;
  assert.throws(() => service.verify(receipt, {}), /VERIFICATION_RECEIPT_INVALID/);
});

test("verification receipts survive a same-binary restart when durable state is configured", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-receipt-restart-"));
  const masterKey = Buffer.alloc(32, 14);
  const tokenKey = Buffer.alloc(32, 15);
  const now = Date.now();
  const facts = {
    taskWorktreeId: `task_${"1".repeat(32)}`,
    candidateOid: "2".repeat(40),
    ownerFingerprint: "3".repeat(64),
    policyRevision: "policy-receipt",
    capabilityRevision: "4".repeat(64),
    commandDigest: "5".repeat(64),
    terminalAuditEventId: `event_${"6".repeat(32)}`,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  };
  try {
    const first = new VerificationReceiptServiceV4(
      Buffer.from(tokenKey),
      () => now,
      { stateRoot, masterKey }
    );
    const token = first.issue(facts);
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

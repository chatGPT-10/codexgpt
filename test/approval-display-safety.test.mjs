import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  LocalApprovalServer,
  renderLocalApprovalEntry
} = await tsImport("../src/control/localApprovalServer.ts", import.meta.url);
const { SessionGrantStore } = await tsImport("../src/policy/approval.ts", import.meta.url);
const { PendingApprovalStore } = await tsImport("../src/policy/pendingApprovals.ts", import.meta.url);
const { createAuthorizationFactsV3, semanticDigest } = await tsImport("../src/policy/authorizationFacts.ts", import.meta.url);

const serverId = "a".repeat(32);
const secretMarker = "SYNTHETIC_ENV_SECRET";

function facts() {
  const fingerprint = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  return createAuthorizationFactsV3({
    serverId,
    credentialRef: "cred_aaaaaaaaaaaaaaaa",
    credentialRevision: "credential-revision-1",
    transportKind: "http",
    transportSessionId: "session-display",
    identityKind: "authenticated_subject",
    identitySubject: "subject-display",
    workspaceId: "workspace-display",
    leaseId: "lease-display",
    policyRevision: "policy-display",
    evidenceRevision: "evidence-display",
    toolContractVersion: "3",
    toolName: "run_command",
    canonicalAction: "process.run_command",
    operation: "process.execute",
    resourceFingerprint: fingerprint("resource"),
    inputDigest: fingerprint("input"),
    semanticFactsDigest: semanticDigest({ argv: ["node", "fixture.mjs"] }),
    riskClass: "R3"
  });
}

test("approval display hides arguments by default and reveal mode escapes terminal-control text", async () => {
  const dangerous = [
    "plain",
    "line1\nline2",
    "escape\u001b[31mred",
    "back\bspace",
    "c1\u009b31m",
    "bidi\u202Etxt",
    "zero\u200Bwidth",
    "homoglyph-раураl",
    "x".repeat(1000),
    secretMarker
  ];
  const approvals = new PendingApprovalStore();
  await approvals.request({
    facts: facts(),
    summary: {
      backend: "windows-native-pipe",
      actionKind: "process.execute",
      argumentCount: dangerous.length,
      logicalScope: "workspace-display",
      identityLabel: "subject-display",
      authoritySummary: "ambient current-user authority; ask first",
      digestPrefix: "0123456789abcdef",
      revealArguments: dangerous
    },
    createdAt: "2026-07-16T10:00:00.000Z"
  });
  const server = new LocalApprovalServer({
    serverId,
    approvals,
    grants: new SessionGrantStore(),
    now: () => Date.parse("2026-07-16T10:00:01.000Z")
  });
  const response = await server.handle({
    schemaVersion: 3,
    contractVersion: 3,
    operation: "approvals.list",
    serverId
  });
  const entry = response.approvals[0];
  const normal = renderLocalApprovalEntry(entry);
  assert.equal(normal.includes(secretMarker), false);
  assert.equal(normal.includes("line1"), false);

  const revealed = renderLocalApprovalEntry(entry, { reveal: true });
  assert.equal(revealed.includes(secretMarker), true, "explicit reveal may show printable argument text");
  assert.equal(revealed.includes("\u001b"), false);
  assert.equal(revealed.includes("\u009b"), false);
  assert.equal(revealed.includes("\u202e"), false);
  assert.equal(revealed.includes("\u200b"), false);
  assert.match(revealed, /\\u\{001B\}/);
  assert.match(revealed, /\\u\{009B\}/);
  assert.match(revealed, /\\u\{202E\}/);
  assert.match(revealed, /\\u\{200B\}/);
  assert.equal(revealed.split("\n").some((line) => line.length > 260), false);
  assert.equal(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b\u202e]/u.test(revealed), false);
});

test("approval summary metadata rejects embedded controls instead of trusting terminal rendering", async () => {
  const approvals = new PendingApprovalStore();
  await assert.rejects(approvals.request({
    facts: facts(),
    summary: {
      backend: "windows-native-pipe\nspoof",
      actionKind: "process.execute",
      argumentCount: 1,
      logicalScope: "workspace-display",
      identityLabel: "subject-display",
      authoritySummary: "ask first",
      digestPrefix: "0123456789abcdef",
      revealArguments: []
    }
  }), /safe for approval display/i);
  assert.equal(approvals.size(), 0);
});

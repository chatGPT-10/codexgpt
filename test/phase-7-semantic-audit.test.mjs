import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  authorizationAuditEventV2Schema,
  executionAuditEventV2Schema
} from "../dist/audit/schemas.js";
import { PersistentAuditRuntimeV2 } from "../dist/audit/runtime.js";
import { SemanticPreviewStore } from "../dist/semantic/previewStore.js";

function sha(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function previewFacts() {
  const before = "export const value = 1;\n";
  const after = "export const renamed = 1;\n";
  const store = new SemanticPreviewStore({ random: (size) => Buffer.alloc(size, 7) });
  const created = store.create({
    workspaceId: "ws_audit",
    workspaceBindingDigest: `sha256:${"8".repeat(64)}`,
    workspaceAuthorityDigest: `sha256:${"7".repeat(64)}`,
    providerGeneration: 3,
    providerFacts: { provider: "builtin-typescript", engineVersion: "5.9.3" },
    oldName: "value",
    newName: "renamed",
    files: [{
      snapshot: {
        relativePath: "src/value.ts",
        canonicalPathKey: "c:/fixture/src/value.ts",
        canonicalParentPathKey: "c:/fixture/src",
        parentIdentity: `parent_${"9".repeat(24)}`,
        language: "typescript",
        utf8Text: before,
        sha256: sha(before),
        byteLength: Buffer.byteLength(before),
        lineIndex: [0],
        stableIdentity: { dev: "1", ino: "2", nlink: 1 }
      },
      edits: [{ path: "src/value.ts", start: 13, length: 5, newText: "renamed" }],
      resultingText: after,
      resultingSha256: sha(after)
    }]
  }, 2_000);
  return store.resolve(created.preview_id).semanticAuditFacts;
}

test("authorization and execution audit records carry one bounded semantic digest chain", async () => {
  const semanticFacts = previewFacts();
  const authorizationEvent = authorizationAuditEventV2Schema.parse({
    schemaVersion: 2,
    eventId: `event_${"1".repeat(32)}`,
    eventType: "authorization",
    timestamp: "2026-07-23T00:00:00.000Z",
    requestId: "request-semantic-audit",
    authorizationEventId: null,
    decisionId: "decision-semantic-audit",
    credentialRef: null,
    transportSessionId: "session-semantic-audit",
    toolName: "apply_patch",
    canonicalAction: "apply_patch",
    workspaceId: "ws_audit",
    workspaceRef: null,
    policyRevision: "policy-semantic-audit",
    resourceSummary: "semantic rename batch",
    resourceFingerprint: "2".repeat(64),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: [],
    approvalState: "not_required",
    grantId: null,
    sandboxBackend: "brokered",
    riskClass: "R2",
    semanticFacts
  });
  const appended = [];
  const runtime = new PersistentAuditRuntimeV2(
    { append(event) { appended.push(event); } },
    {
      now: () => Date.parse("2026-07-23T00:00:01.000Z"),
      eventId: () => `event_${"3".repeat(32)}`
    }
  );
  const context = {
    authorizationEvent,
    requirement: "required",
    riskClass: "R2",
    mutating: true,
    semanticFacts
  };
  await runtime.persistAuthorization(context);
  await runtime.persistExecution(context, {
    status: "succeeded",
    resultCode: "OK",
    durationMs: 10,
    exitCode: null,
    boundedByteCounts: {},
    changeSetId: `cs_${"4".repeat(32)}`,
    operationCount: 1,
    mutationKinds: ["replace"],
    recoveryRequired: false,
    semanticFacts
  });
  assert.equal(appended.length, 2);
  assert.equal(executionAuditEventV2Schema.parse(appended[1]).semanticFacts.semanticFactsDigest, semanticFacts.semanticFactsDigest);
  assert.equal(appended[0].semanticFacts.semanticFactsDigest, appended[1].semanticFacts.semanticFactsDigest);
  assert.equal(appended[1].semanticFacts.files[0].expectedSha256, semanticFacts.files[0].expectedSha256);
});

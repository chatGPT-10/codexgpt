import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  changeSetManifestSchema,
  changeSetManifestV1Schema,
  moveChangeSetManifestV2Schema
} from "../dist/changesets/schemas.js";
import {
  attachPreparedBatchMutation,
  attachPreparedFileMutation,
  attachPreparedPatchMutation
} from "../dist/mutations/writers.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function genericManifest(contractVersion, overrides = {}) {
  return {
    schemaVersion: 1,
    changeSetId: `cs_${"1".repeat(32)}`,
    transactionId: `tx_${"2".repeat(32)}`,
    workspaceStateKey: `wsk_${"3".repeat(32)}`,
    generation: 1,
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-07-17T10:00:00.000Z",
    toolName: "write",
    requestId: null,
    ownerBinding: `owner_${"4".repeat(64)}`,
    policyRevision: "policy-v3",
    contractVersion,
    state: "active",
    undoSupported: false,
    undoReason: "retention_disabled",
    operations: [{
      operationId: "op_write",
      kind: "create",
      relativePath: "a.txt",
      destinationRelativePath: null,
      before: { exists: false, sha256: null, bytes: 0, metadata: null },
      after: { exists: true, sha256: sha("a"), bytes: 1 },
      blobId: null
    }],
    plaintextBytes: 0,
    ciphertextBytes: 0,
    revertsChangeSetId: null,
    manifestMac: "f".repeat(64),
    ...overrides
  };
}

function moveManifest(contractVersion, overrides = {}) {
  return {
    schemaVersion: 2,
    changeSetId: `cs_${"5".repeat(32)}`,
    transactionId: `tx_${"6".repeat(32)}`,
    workspaceStateKey: `wsk_${"7".repeat(32)}`,
    generation: 1,
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-07-17T10:00:00.000Z",
    toolName: "move_paths",
    requestId: null,
    ownerBinding: `owner_${"8".repeat(64)}`,
    policyRevision: "policy-v3",
    contractVersion,
    state: "active",
    undoSupported: true,
    undoReason: null,
    operations: [{
      operationId: "op_move",
      kind: "move",
      sourceRelativePath: "a.txt",
      destinationRelativePath: "b.txt",
      sourceComparisonKey: "a.txt",
      destinationComparisonKey: "b.txt",
      objectIdentity: { device: "1", fileId: "2" },
      sha256: sha("a"),
      bytes: 1
    }],
    createdDirectories: [],
    createdDirectoryIdentities: {},
    plaintextBytes: 0,
    ciphertextBytes: 0,
    revertsChangeSetId: null,
    manifestMac: "e".repeat(64),
    ...overrides
  };
}

test("persisted mutation readers accept only schema/contract pairs 1/(1|2|3) and 2/(2|3)", () => {
  for (const contractVersion of [1, 2, 3]) {
    assert.equal(changeSetManifestV1Schema.parse(genericManifest(contractVersion)).contractVersion, contractVersion);
  }
  for (const contractVersion of [2, 3]) {
    assert.equal(moveChangeSetManifestV2Schema.parse(moveManifest(contractVersion)).contractVersion, contractVersion);
  }
  assert.equal(changeSetManifestSchema.safeParse(genericManifest(4)).success, false);
  assert.equal(changeSetManifestSchema.safeParse(moveManifest(1)).success, false);
  assert.equal(changeSetManifestSchema.safeParse({ ...genericManifest(3), schemaVersion: 3 }).success, false);
});

test("a successful non-retained V3 batch still emits a contract-3 manifest and suppresses only undo material", async () => {
  let preparation;
  const runtime = {
    async prepare(input) {
      preparation = input;
      return {};
    }
  };
  const operation = {
    operationId: "op_create",
    kind: "create",
    relativePath: "a.txt",
    bytes: Buffer.from("a"),
    expectedAbsent: true
  };
  const result = { ok: true };
  const returned = await attachPreparedBatchMutation({
    runtime,
    workspace: { id: "ws_v3", root: "D:\\repo", openedAt: "2026-07-16T10:00:00.000Z" },
    prepared: {
      operations: [{
        path: "a.txt",
        operation,
        before: { exists: false, sha256: null, bytes: null, metadata: null },
        afterSha256: sha("a")
      }]
    },
    context: {
      toolName: "codexgpt_self_test",
      requestId: null,
      ownerBinding: `owner_${"9".repeat(64)}`,
      policyRevision: "policy-v3",
      contractVersion: 3,
      retainChangeSet: false,
      now: () => Date.parse("2026-07-16T10:00:00.000Z")
    },
    result
  });
  assert.strictEqual(returned, result);
  const created = preparation.changeSet({
    transactionId: `tx_${"a".repeat(32)}`,
    changeSetId: `cs_${"b".repeat(32)}`,
    workspaceStateKey: `wsk_${"c".repeat(32)}`
  });
  assert.equal(created.manifest.schemaVersion, 1);
  assert.equal(created.manifest.contractVersion, 3);
  assert.equal(created.manifest.undoSupported, false);
  assert.equal(created.manifest.undoReason, "retention_disabled");
  assert.deepEqual(created.blobs, []);
});

test("every generic V3 file patch and batch writer emits the unchanged schema-1 manifest with caller contract 3", async () => {
  const operation = {
    operationId: "op_create",
    kind: "create",
    relativePath: "a.txt",
    bytes: Buffer.from("a"),
    expectedAbsent: true
  };
  const before = { exists: false, sha256: null, bytes: null, metadata: null };
  const workspace = { id: "ws_v3", root: "D:\\repo", openedAt: "2026-07-16T10:00:00.000Z" };
  const context = {
    requestId: null,
    ownerBinding: `owner_${"d".repeat(64)}`,
    policyRevision: "policy-v3",
    contractVersion: 3,
    now: () => Date.parse("2026-07-16T10:00:00.000Z")
  };
  const captured = [];
  const runtime = {
    async prepare(input) {
      captured.push(input);
      return {};
    }
  };

  await attachPreparedFileMutation({
    runtime,
    workspace,
    prepared: { operation, before, result: {} },
    context: { ...context, toolName: "write" },
    result: { ok: true }
  });
  await attachPreparedPatchMutation({
    runtime,
    workspace,
    prepared: {
      operations: [{ path: "a.txt", operation, before, afterSha256: sha("a") }],
      result: {}
    },
    context: { ...context, toolName: "apply_patch" },
    result: { ok: true }
  });
  await attachPreparedBatchMutation({
    runtime,
    workspace,
    prepared: {
      operations: [{ path: "a.txt", operation, before, afterSha256: sha("a") }],
      totalAfterBytes: 1
    },
    context: { ...context, toolName: "handoff_to_agent" },
    result: { ok: true }
  });

  assert.equal(captured.length, 3);
  for (const [index, preparation] of captured.entries()) {
    const created = preparation.changeSet({
      transactionId: `tx_${String(index + 1).repeat(32)}`,
      changeSetId: `cs_${String(index + 4).repeat(32)}`,
      workspaceStateKey: `wsk_${String(index + 7).repeat(32)}`
    });
    assert.equal(created.manifest.schemaVersion, 1);
    assert.equal(created.manifest.contractVersion, 3);
  }
});

function mutationWriterCalls(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["attachPreparedFileMutation", "attachPreparedPatchMutation", "attachPreparedBatchMutation"].includes(node.expression.text)
    ) {
      calls.push({ name: node.expression.text, text: node.getText(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

test("every production mutation-writer call site maps the selected public contract to its persisted contract instead of hard-coding V2", () => {
  const serverCalls = mutationWriterCalls(fileURLToPath(new URL("../src/server.ts", import.meta.url)));
  assert.deepEqual(
    Object.fromEntries(["attachPreparedFileMutation", "attachPreparedPatchMutation", "attachPreparedBatchMutation"].map((name) => [
      name,
      serverCalls.filter((call) => call.name === name).length
    ])),
    {
      attachPreparedFileMutation: 2,
      attachPreparedPatchMutation: 1,
      attachPreparedBatchMutation: 4
    }
  );
  for (const call of serverCalls) {
    assert.match(call.text, /contractVersion:\s*persistedMutationContractVersion\(config\.toolContractVersion\)/);
    assert.doesNotMatch(call.text, /contractVersion:\s*2\b/);
  }

  const localCalls = mutationWriterCalls(fileURLToPath(new URL("../src/mutations/localService.ts", import.meta.url)));
  assert.equal(localCalls.length, 1);
  assert.equal(localCalls[0].name, "attachPreparedBatchMutation");
  assert.match(localCalls[0].text, /contractVersion:\s*persistedMutationContractVersion\(this\.config\.toolContractVersion\)/);
  assert.doesNotMatch(localCalls[0].text, /contractVersion:\s*2\b/);
});

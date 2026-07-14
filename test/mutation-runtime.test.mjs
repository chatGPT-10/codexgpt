import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { z } from "zod";
import { PathGuard } from "../dist/guard.js";
import {
  ChangeSetStore
} from "../dist/changesets/index.js";
import {
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry,
  TransactionManifestStore
} from "../dist/transactions/index.js";
import { installPolicyKernel } from "../dist/policy/integration.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-mutation-runtime-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = {
    id: "ws_mutation_fixture",
    root: workspaceRoot,
    openedAt: "2026-07-14T00:00:00.000Z"
  };
  const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(
    config,
    new PathGuard(config),
    stateRoot,
    registry,
    options.engine ?? {}
  );
  const store = options.store ?? new ChangeSetStore({
    stateRoot,
    masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot })),
    now: () => Date.parse("2026-07-14T12:00:00.000Z")
  });
  const runtime = new WorkspaceMutationRuntime({ engine, changeSetStore: store });
  try {
    return await action({ root, stateRoot, workspaceRoot, workspace, engine, store, runtime });
  } finally {
    store.dispose?.();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function transaction(workspace) {
  return {
    workspace,
    operations: [
      {
        operationId: "op_replace_a",
        kind: "replace",
        relativePath: "a.txt",
        bytes: Buffer.from("new-a"),
        expectedSha256: digest("old-a")
      },
      {
        operationId: "op_create_b",
        kind: "create",
        relativePath: "b.txt",
        bytes: Buffer.from("new-b"),
        expectedAbsent: true
      },
      {
        operationId: "op_delete_c",
        kind: "delete",
        relativePath: "c.txt",
        expectedSha256: digest("old-c")
      }
    ]
  };
}

function changeSet({ transactionId, changeSetId, workspaceStateKey }) {
  const createdAt = "2026-07-14T12:00:00.000Z";
  return {
    manifest: {
      schemaVersion: 1,
      changeSetId,
      transactionId,
      workspaceStateKey,
      generation: 1,
      createdAt,
      updatedAt: createdAt,
      expiresAt: "2026-07-15T12:00:00.000Z",
      toolName: "mutation_fixture",
      requestId: "request-fixture",
      ownerBinding: `owner_${"5".repeat(64)}`,
      policyRevision: "policy-fixture",
      contractVersion: 1,
      state: "active",
      undoSupported: true,
      undoReason: null,
      operations: [
        {
          operationId: "op_replace_a",
          kind: "replace",
          relativePath: "a.txt",
          destinationRelativePath: null,
          before: {
            exists: true,
            sha256: digest("old-a"),
            bytes: 5,
            metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
          },
          after: { exists: true, sha256: digest("new-a"), bytes: 5 },
          blobId: `blob_${"1".repeat(32)}`
        },
        {
          operationId: "op_create_b",
          kind: "create",
          relativePath: "b.txt",
          destinationRelativePath: null,
          before: { exists: false, sha256: null, bytes: 0, metadata: null },
          after: { exists: true, sha256: digest("new-b"), bytes: 5 },
          blobId: null
        },
        {
          operationId: "op_delete_c",
          kind: "delete",
          relativePath: "c.txt",
          destinationRelativePath: null,
          before: {
            exists: true,
            sha256: digest("old-c"),
            bytes: 5,
            metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
          },
          after: { exists: false, sha256: null, bytes: 0 },
          blobId: `blob_${"2".repeat(32)}`
        }
      ],
      plaintextBytes: 10,
      ciphertextBytes: 84,
      revertsChangeSetId: null
    },
    blobs: [
      {
        blobId: `blob_${"1".repeat(32)}`,
        operationId: "op_replace_a",
        beforeSha256: digest("old-a"),
        plaintext: Buffer.from("old-a")
      },
      {
        blobId: `blob_${"2".repeat(32)}`,
        operationId: "op_delete_c",
        beforeSha256: digest("old-c"),
        plaintext: Buffer.from("old-c")
      }
    ]
  };
}

async function seed(workspaceRoot) {
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "old-a");
  await fsp.writeFile(path.join(workspaceRoot, "c.txt"), "old-c");
}

async function assertBefore(workspaceRoot) {
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "old-a");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "c.txt"), "utf8"), "old-c");
}

async function preparedResult(runtime, workspace, projection = ({ result }) => result) {
  return runtime.invokeProvider({
    requiresMutation: true,
    provider: async () => {
      const pending = await runtime.prepare({
        transaction: transaction(workspace),
        changeSet,
        project: projection
      });
      return attachPendingWorkspaceMutation({
        content: [{ type: "text", text: "prepared" }],
        structuredContent: { ok: true }
      }, pending);
    }
  });
}

function requiredPolicy(workspace, executions) {
  const authorizationEvent = {
    schemaVersion: 2,
    eventId: `event_${"4".repeat(32)}`,
    eventType: "authorization",
    timestamp: "2026-07-14T12:00:00.000Z",
    requestId: `request_${"5".repeat(32)}`,
    authorizationEventId: null,
    decisionId: `decision_${"1".repeat(24)}`,
    credentialRef: null,
    transportSessionId: `session_${"6".repeat(32)}`,
    toolName: "write",
    canonicalAction: "write",
    workspaceId: workspace.id,
    workspaceRef: `awr_${"8".repeat(32)}`,
    policyRevision: `policy_${"2".repeat(24)}`,
    resourceSummary: "filesystem:write:a.txt",
    resourceFingerprint: "3".repeat(64),
    outcome: "allow",
    reasonCode: null,
    safeRuleIds: ["rule.test"],
    approvalState: "not_required",
    grantId: null,
    sandboxBackend: "node-baseline",
    riskClass: "R2"
  };
  return {
    mode: "enforce",
    async authorize() {
      return {
        decision: {
          schemaVersion: 1,
          decisionId: authorizationEvent.decisionId,
          outcome: "allow",
          reasonCode: null,
          policyRevision: authorizationEvent.policyRevision,
          resourceFingerprint: authorizationEvent.resourceFingerprint,
          requiredApproval: null,
          requiredEnforcement: [],
          provenance: []
        },
        auditEvent: null,
        auditContext: {
          authorizationEvent,
          requirement: "required",
          riskClass: "R2",
          mutating: true
        }
      };
    },
    async audit() {},
    async persistAuthorization() {},
    async persistExecution(_context, execution) {
      executions.push(execution);
    }
  };
}

test("server-owned handshake commits create replace delete only after audit and change-set participants", () => fixture(async ({ workspaceRoot, workspace, runtime, store, engine }) => {
  await seed(workspaceRoot);
  const events = [];
  const result = await preparedResult(runtime, workspace, ({ result, committed, changeSet: manifest }) => ({
    ...result,
    committed,
    retained: manifest.undoSupported
  }));
  await assertBefore(workspaceRoot);
  const pending = pendingWorkspaceMutation(result);
  assert.ok(pending);
  assert.equal(Object.keys(result).some((key) => /pending|transaction/i.test(key)), false);
  assert.equal(JSON.stringify(result).includes(pending.transactionId), false);

  const committed = await pending.commit({
    result,
    persistAudit: async () => events.push("audit")
  });

  assert.deepEqual(events, ["audit"]);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "new-a");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "new-b");
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "c.txt")), { code: "ENOENT" });
  assert.equal(committed.committed.transactionId, pending.transactionId);
  assert.equal(committed.committed.changeSetId, pending.changeSetId);
  assert.equal(committed.retained, true);
  assert.equal(store.read(engine.workspaceStateKey(workspace.root), pending.changeSetId).transactionId, pending.transactionId);
  await assert.rejects(() => pending.commit({ result, persistAudit: async () => {} }), /finalized|state/i);
}));

test("required audit failure rolls back every visible operation and publishes no change set", () => fixture(async ({ workspaceRoot, workspace, runtime, store, engine }) => {
  await seed(workspaceRoot);
  const result = await preparedResult(runtime, workspace);
  const pending = pendingWorkspaceMutation(result);
  await assert.rejects(
    () => pending.commit({ result, persistAudit: async () => { throw new Error("audit append unavailable"); } }),
    (error) => error?.code === "AUDIT_UNAVAILABLE"
  );
  await assertBefore(workspaceRoot);
  assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
}));

test("change-set participant failure rolls back visible operations", () => {
  const failingStore = {
    create() { throw new Error("change-set disk unavailable"); },
    dispose() {}
  };
  return fixture(async ({ workspaceRoot, workspace, runtime }) => {
    await seed(workspaceRoot);
    const result = await preparedResult(runtime, workspace);
    const pending = pendingWorkspaceMutation(result);
    await assert.rejects(
      () => pending.commit({ result, persistAudit: async () => {} }),
      (error) => error?.code === "TRANSACTION_FAILED"
    );
    await assertBefore(workspaceRoot);
  }, { store: failingStore });
});

test("missing handle and provider exceptions fail closed and roll back prepared state", () => fixture(async ({ workspaceRoot, workspace, runtime }) => {
  await seed(workspaceRoot);
  await assert.rejects(
    () => runtime.invokeProvider({
      requiresMutation: true,
      provider: async () => {
        await runtime.prepare({ transaction: transaction(workspace), changeSet });
        return { structuredContent: { ok: true } };
      }
    }),
    (error) => error?.code === "TRANSACTION_PRECONDITION_FAILED"
  );
  await assertBefore(workspaceRoot);

  await assert.rejects(
    () => runtime.invokeProvider({
      requiresMutation: true,
      provider: async () => {
        await runtime.prepare({ transaction: transaction(workspace), changeSet });
        throw new Error("provider failed after preparation");
      }
    }),
    /provider failed/
  );
  await assertBefore(workspaceRoot);
}));

test("change-set facts must correlate exactly before any visible install", () => fixture(async ({ workspaceRoot, workspace, runtime }) => {
  await seed(workspaceRoot);
  await assert.rejects(
    () => runtime.invokeProvider({
      requiresMutation: true,
      provider: async () => {
        const pending = await runtime.prepare({
          transaction: transaction(workspace),
          changeSet(identity) {
            const mismatched = changeSet(identity);
            mismatched.manifest.operations[0].after.sha256 = digest("unrelated");
            return mismatched;
          }
        });
        return attachPendingWorkspaceMutation({ structuredContent: { ok: true } }, pending);
      }
    }),
    (error) => error?.code === "TRANSACTION_PRECONDITION_FAILED"
  );
  await assertBefore(workspaceRoot);
}));

test("a change set published before participant proof becomes recovery-required if proof fails", () => fixture(async ({ workspaceRoot, workspace, runtime, store, engine }) => {
  await seed(workspaceRoot);
  const result = await preparedResult(runtime, workspace);
  const pending = pendingWorkspaceMutation(result);
  await assert.rejects(
    () => pending.commit({ result, persistAudit: async () => {} }),
    (error) => error?.code === "TRANSACTION_FAILED"
  );
  await assertBefore(workspaceRoot);
  const manifests = store.list(engine.workspaceStateKey(workspace.root));
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0].state, "recovery_required");
  assert.equal(manifests[0].undoSupported, false);
}, {
  engine: {
    faultInjector: {
      hit(point, facts) {
        if (point === "after_each_participant" && facts.participantIndex === 1) {
          throw new Error("participant proof write failed");
        }
      }
    }
  }
}));

test("cleanup-pending success is returned only after a committed manifest is durable", () => fixture(async ({ stateRoot, workspaceRoot, workspace, runtime, engine }) => {
  await seed(workspaceRoot);
  const result = await preparedResult(runtime, workspace, ({ committed }) => committed);
  const pending = pendingWorkspaceMutation(result);
  const committed = await pending.commit({ result, persistAudit: async () => {} });
  assert.equal(committed.cleanupPending, true);
  const manifests = new TransactionManifestStore(stateRoot).list(engine.workspaceStateKey(workspace.root));
  assert.equal(manifests.at(-1).state, "committed");
}, {
  engine: {
    faultInjector: {
      hit(point) {
        if (point === "during_each_finalize") throw new Error("cleanup unavailable");
      }
    }
  }
}));

test("V1 projection exposes no transaction or change-set metadata", () => fixture(async ({ workspaceRoot, workspace, runtime }) => {
  await seed(workspaceRoot);
  const result = await preparedResult(runtime, workspace);
  const pending = pendingWorkspaceMutation(result);
  const publicResult = await pending.commit({ result, persistAudit: async () => {} });
  assert.deepEqual(publicResult.structuredContent, { ok: true });
  assert.equal(JSON.stringify(publicResult).includes(pending.transactionId), false);
  assert.equal(JSON.stringify(publicResult).includes(pending.changeSetId), false);
  assert.equal(pendingWorkspaceMutation(publicResult), pending);
}));

test("Policy Kernel consumes the private handle and finalizes only through required persistent audit", () => fixture(async ({ workspaceRoot, workspace, runtime }) => {
  await seed(workspaceRoot);
  const executions = [];
  const policy = requiredPolicy(workspace, executions);
  const server = {
    _registeredTools: {
      write: {
        inputSchema: z.object({}).strict(),
        handler: () => preparedResult(runtime, workspace)
      }
    }
  };
  installPolicyKernel(server, policy);
  const result = await server._registeredTools.write.handler({});
  assert.equal(result.isError, undefined);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "new-a");
  assert.equal(executions.length, 1);
  assert.match(executions[0].changeSetId, /^cs_[a-f0-9]{32}$/);
  assert.equal(executions[0].operationCount, 3);
  assert.deepEqual(executions[0].mutationKinds.sort(), ["create", "delete", "replace"]);
}));

test("post-audit participant failure returns one fail-closed result without a duplicate terminal event", () => {
  const failingStore = {
    create() { throw new Error("change-set disk unavailable"); },
    dispose() {}
  };
  return fixture(async ({ workspaceRoot, workspace, runtime }) => {
    await seed(workspaceRoot);
    const executions = [];
    const server = {
      _registeredTools: {
        write: {
          inputSchema: z.object({}).strict(),
          handler: () => preparedResult(runtime, workspace)
        }
      }
    };
    installPolicyKernel(server, requiredPolicy(workspace, executions));
    const result = await server._registeredTools.write.handler({});
    assert.equal(result.isError, true);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].status, "succeeded");
    await assertBefore(workspaceRoot);
  }, { store: failingStore });
});

test("required audit failure remains fail-closed across an independent process", () => fixture(async ({ stateRoot, workspaceRoot }) => {
  await fsp.writeFile(path.join(workspaceRoot, "subject.txt"), "old");
  const child = spawnSync(
    process.execPath,
    [path.resolve("fixtures/mutation-audit-failure-child.mjs"), stateRoot, workspaceRoot],
    { cwd: path.resolve("."), encoding: "utf8" }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "AUDIT_UNAVAILABLE",
    content: "old",
    changeSetCount: 0
  });
}));

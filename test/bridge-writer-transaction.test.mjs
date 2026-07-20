import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChangeSetStore } from "../dist/changesets/index.js";
import {
  AI_BRIDGE_SCAFFOLD_FILES,
  aiBridgeScaffoldWrites,
  prepareWorkspaceTextBatch
} from "../dist/fsOps.js";
import { PathGuard } from "../dist/guard.js";
import {
  prepareAgentHandoffMutation,
  prepareAgentHandoffRequest,
  preflightAgentHandoffOutput
} from "../dist/handoffOps.js";
import {
  attachPreparedBatchMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import {
  prepareProContextMutation,
  prepareProContextRequest,
  preflightProContextOutput
} from "../dist/proContext.js";
import { prepareAtomicCodexGPTSelfTest } from "../dist/selfTestOps.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry,
  TransactionManifestStore
} from "../dist/transactions/index.js";

const NOW = Date.parse("2026-07-15T00:00:00.000Z");
const OWNER = `owner_${"8".repeat(64)}`;

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-bridge-writer-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = { id: "ws_bridge", root: workspaceRoot, openedAt: new Date(NOW).toISOString() };
  const config = {
    blockedGlobs: [".env", "**/.env"],
    maxReadBytes: 1024 * 1024,
    maxWriteBytes: 1024 * 1024,
    maxOutputBytes: 1024 * 1024,
    contextDir: ".ai-bridge",
    writeMode: "workspace",
    toolMode: "full",
    bashMode: "off"
  };
  const guard = new PathGuard(config);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, {
    faultInjector: options.faultInjector,
    now: () => NOW
  });
  const store = new ChangeSetStore({
    stateRoot,
    masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot })),
    now: () => NOW
  });
  const runtime = new WorkspaceMutationRuntime({ engine, changeSetStore: store, now: () => NOW });
  try {
    return await action({ stateRoot, workspaceRoot, workspace, config, guard, engine, store, runtime });
  } finally {
    store.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function prepareAttached({ runtime, workspace, config, guard }, retainChangeSet = true) {
  const prepared = await prepareWorkspaceTextBatch(
    config,
    guard,
    workspace,
    aiBridgeScaffoldWrites(config)
  );
  return runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedBatchMutation({
      runtime,
      workspace,
      prepared,
      context: {
        toolName: "bridge_scaffold",
        requestId: "request-bridge",
        ownerBinding: OWNER,
        policyRevision: "policy-bridge",
        contractVersion: 2,
        now: () => NOW,
        retainChangeSet
      },
      result: { ok: true, created: prepared.createdPaths },
      project: ({ result, transaction, files }) => ({ ...result, transaction, files })
    })
  });
}

test("empty bridge scaffold is invisible until one transaction commits all files", () => fixture(async (context) => {
  const attached = await prepareAttached(context);
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
  const result = await pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} });
  assert.equal(result.transaction.operation_count, Object.keys(AI_BRIDGE_SCAFFOLD_FILES).length);
  assert.deepEqual(
    (await fsp.readdir(path.join(context.workspaceRoot, ".ai-bridge"))).sort(),
    Object.keys(AI_BRIDGE_SCAFFOLD_FILES).sort()
  );
}));

test("partial bridge scaffold preserves existing files and creates only missing companions", () => fixture(async (context) => {
  await fsp.mkdir(path.join(context.workspaceRoot, ".ai-bridge"));
  await fsp.writeFile(path.join(context.workspaceRoot, ".ai-bridge", "README.md"), "custom\n");
  const attached = await prepareAttached(context);
  const result = await pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} });
  assert.equal(await fsp.readFile(path.join(context.workspaceRoot, ".ai-bridge", "README.md"), "utf8"), "custom\n");
  assert.equal(result.transaction.operation_count, Object.keys(AI_BRIDGE_SCAFFOLD_FILES).length - 1);
}));

test("audit failure rolls back an empty scaffold including its transaction-owned directory", () => fixture(async (context) => {
  const attached = await prepareAttached(context);
  await assert.rejects(
    () => pendingWorkspaceMutation(attached).commit({
      result: attached,
      persistAudit: async () => { throw new Error("audit unavailable"); }
    }),
    (error) => error.code === "AUDIT_UNAVAILABLE"
  );
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
}));

test("non-retained self-test style batches publish no rollback blobs and are explicitly non-undoable", () => fixture(async (context) => {
  const attached = await prepareAttached(context, false);
  const result = await pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} });
  assert.equal(result.transaction.undo_supported, false);
  const manifest = context.store.read(
    context.engine.workspaceStateKey(context.workspace.root),
    result.transaction.change_set_id
  );
  assert.equal(manifest.undoReason, "retention_disabled");
  assert.equal(manifest.plaintextBytes, 0);
  assert.equal(manifest.ciphertextBytes, 0);
  assert.equal(manifest.operations.every((operation) => operation.blobId === null), true);
}));

test("aggregate byte limits reject before transaction state or workspace visibility", () => fixture(async (context) => {
  await assert.rejects(
    () => prepareWorkspaceTextBatch(
      context.config,
      context.guard,
      context.workspace,
      [
        { path: ".ai-bridge/a.md", content: "1234", mode: "replace" },
        { path: ".ai-bridge/b.md", content: "5678", mode: "replace" }
      ],
      { maxBatchBytes: 7 }
    ),
    (error) => error.code === "TRANSACTION_PRECONDITION_FAILED"
  );
  assert.deepEqual(
    new TransactionManifestStore(context.stateRoot).list(context.engine.workspaceStateKey(context.workspace.root)),
    []
  );
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
}));

test("handoff plan and both complete-file JSONL appends commit as one batch", () => fixture(async (context) => {
  const request = prepareAgentHandoffRequest(context.config, context.workspace, {
    agent: "codex",
    agentName: "Codex",
    title: "Atomic handoff",
    plan: "Implement the bounded change.",
    append: false,
    eventName: "handoff_to_codex",
    updatedAt: new Date(NOW).toISOString()
  });
  const output = await preflightAgentHandoffOutput(context.config, context.guard, context.workspace, request);
  const mutation = await prepareAgentHandoffMutation({
    config: context.config,
    guard: context.guard,
    workspace: context.workspace,
    request,
    output
  });
  const attached = await context.runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedBatchMutation({
      runtime: context.runtime,
      workspace: context.workspace,
      prepared: mutation.prepared,
      context: {
        toolName: "handoff_to_codex",
        requestId: "request-handoff",
        ownerBinding: OWNER,
        policyRevision: "policy-handoff",
        contractVersion: 1,
        now: () => NOW
      },
      result: mutation.result
    })
  });
  assert.equal(output.expectedCreatedContextFiles.length, Object.keys(AI_BRIDGE_SCAFFOLD_FILES).length);
  await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
  await pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} });
  assert.equal(
    await fsp.readFile(path.join(context.workspaceRoot, request.planPath), "utf8"),
    output.finalPlan
  );
  for (const logPath of [request.logPath, request.executionLogPath]) {
    assert.equal(await fsp.readFile(path.join(context.workspaceRoot, logPath), "utf8"), output.event);
  }
}));

test("a later handoff install fault leaves no plan, state, or log orphan", () => {
  let installs = 0;
  return fixture(async (context) => {
    const request = prepareAgentHandoffRequest(context.config, context.workspace, {
      agent: "codex",
      plan: "Fail after several installs.",
      append: false,
      eventName: "handoff_to_codex",
      updatedAt: new Date(NOW).toISOString()
    });
    const output = await preflightAgentHandoffOutput(context.config, context.guard, context.workspace, request);
    const mutation = await prepareAgentHandoffMutation({ ...context, request, output });
    const attached = await context.runtime.invokeProvider({
      requiresMutation: true,
      provider: () => attachPreparedBatchMutation({
        runtime: context.runtime,
        workspace: context.workspace,
        prepared: mutation.prepared,
        context: {
          toolName: "handoff_to_codex",
          requestId: null,
          ownerBinding: OWNER,
          policyRevision: "policy-handoff",
          contractVersion: 1,
          now: () => NOW
        },
        result: mutation.result
      })
    });
    await assert.rejects(
      () => pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} }),
      (error) => error.code === "TRANSACTION_FAILED"
    );
    await assert.rejects(() => fsp.stat(path.join(context.workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
  }, {
    faultInjector: {
      hit(point) {
        if (point === "after_each_install" && ++installs === 5) throw new Error("later install fault");
      }
    }
  });
});

test("pro-context scaffold and export artifact commit in one transaction", () => fixture(async (context) => {
  const request = await prepareProContextRequest(context.config, context.guard, context.workspace, {
    title: "Atomic Context",
    includeImportantFiles: false,
    includeChangedFiles: false,
    includeDiff: false,
    includeAiBridge: true,
    maxTotalBytes: 100_000
  });
  const output = await preflightProContextOutput(context.config, context.guard, context.workspace, request);
  const mutation = await prepareProContextMutation(
    context.config,
    context.guard,
    context.workspace,
    request,
    output
  );
  assert.equal(mutation.result.createdContextFiles.length, Object.keys(AI_BRIDGE_SCAFFOLD_FILES).length);
  assert.equal(mutation.result.aiContextFiles.length, 7);
  const attached = await context.runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedBatchMutation({
      runtime: context.runtime,
      workspace: context.workspace,
      prepared: mutation.prepared,
      context: {
        toolName: "export_pro_context",
        requestId: null,
        ownerBinding: OWNER,
        policyRevision: "policy-export",
        contractVersion: 1,
        now: () => NOW
      },
      result: mutation.result
    })
  });
  await pendingWorkspaceMutation(attached).commit({ result: attached, persistAudit: async () => {} });
  assert.equal(
    await fsp.readFile(path.join(context.workspaceRoot, output.path), "utf8"),
    mutation.result.markdown
  );
}));

test("atomic self-test prepares only its fixed artifact and commits a non-retained change set", () => fixture(async (context) => {
  const mutation = await prepareAtomicCodexGPTSelfTest({
    config: context.config,
    guard: context.guard,
    workspace: context.workspace,
    request: {
      write_probe: true,
      bash_probe: false,
      pro_context_probe: true,
      include_global_skills: false,
      max_skills: 1
    },
    expectedTools: [],
    registeredTools: []
  });
  assert.deepEqual(mutation.prepared.operations.map((operation) => operation.path), [
    ".ai-bridge/codexgpt-self-test.md"
  ]);
  assert.equal(mutation.result.write_probe.outcome, "pass");
  assert.equal(mutation.result.pro_context_probe.outcome, "pass");
  const attached = await context.runtime.invokeProvider({
    requiresMutation: false,
    provider: () => attachPreparedBatchMutation({
      runtime: context.runtime,
      workspace: context.workspace,
      prepared: mutation.prepared,
      context: {
        toolName: "codexgpt_self_test",
        requestId: null,
        ownerBinding: OWNER,
        policyRevision: "policy-self-test",
        contractVersion: 1,
        now: () => NOW,
        retainChangeSet: false
      },
      result: mutation.result,
      project: ({ result, transaction }) => ({ ...result, transaction })
    })
  });
  const committed = await pendingWorkspaceMutation(attached).commit({
    result: attached,
    persistAudit: async () => {}
  });
  assert.equal(committed.transaction.undo_supported, false);
  assert.deepEqual(await fsp.readdir(path.join(context.workspaceRoot, ".ai-bridge")), [
    "codexgpt-self-test.md"
  ]);
}));

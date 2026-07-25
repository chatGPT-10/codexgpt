import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PersistentAuditRuntimeV2,
  PersistentAuditStore
} from "../dist/audit/index.js";
import { loadConfig } from "../dist/config.js";
import { LocalApprovalRuntimeV3 } from "../dist/control/runtime.js";
import { PathGuard } from "../dist/guard.js";
import { bindGitExecutable, createGitCapabilityEvidence } from "../dist/git/capabilities.js";
import { createHttpPolicySessionSource } from "../dist/policy/identity.js";
import { policyIdentityScopes } from "../dist/policy/runtime.js";
import { describeFilesystemBatchResource } from "../dist/policy/resources.js";
import { createProductionCodexGPTServer } from "../dist/productionRuntime.js";
import { createCodexGPTServer } from "../dist/server.js";
import { SemanticPreviewStore } from "../dist/semantic/previewStore.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function configFor(root) {
  return withEnv({
    CODEXGPT_TOOL_CONTRACT_VERSION: "5",
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_SEMANTIC_PROVIDER: "builtin",
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce",
    CODEXGPT_BASH_MODE: "off"
  }, () => loadConfig([
    "--root", root,
    "--bash", "off",
    "--write", "workspace",
    "--tool-mode", "standard"
  ]));
}

function httpSource(config, sessionId, credential, key) {
  return createHttpPolicySessionSource({
    authenticationMode: "bearer",
    configuredCredential: credential,
    key,
    transportSessionId: () => sessionId,
    scopes: policyIdentityScopes(config)
  });
}

function serverDependencies({
  approvalRuntime,
  persistentAudit,
  sessionSource,
  semanticPreviewStore,
  undoChangeSetService = {}
}) {
  return {
    transactionRecoveryCoordinator: { ensureWorkspaceReady() {} },
    workspaceMutationRuntime: {},
    changeSetOwnerBindingKey: Buffer.alloc(32, 7),
    atomicMutationToolNames: new Set([
      "apply_patch",
      "codexgpt_self_test",
      "edit",
      "export_pro_context",
      "handoff_to_agent",
      "handoff_to_codex",
      "write"
    ]),
    persistentAuditRuntime: persistentAudit,
    localApprovalRuntimeV3: approvalRuntime,
    openCurrentWorkspaceSummaryProvider: async ({ workspace }) => ({
      text: "# Workspace",
      workspaceId: workspace.id,
      root: workspace.root,
      agentsLoaded: false,
      skills: [],
      skillInventory: [],
      skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
      gitStatus: "unavailable",
      standardGuidance: {
        status: "ok",
        instructionChain: [],
        instructionDiagnostics: [],
        skillCatalog: [],
        skillScan: {
          candidateCount: 0,
          validCount: 0,
          invalidCount: 0,
          scanComplete: true,
          scanTruncated: false,
          returnedTruncated: false,
          catalogComplete: true,
          catalogOmittedCount: 0,
          descriptionsShortened: 0,
          catalogChars: 0,
          ineligibleCount: 0
        }
      }
    }),
    policySessionContextSource: sessionSource,
    movePathsService: {},
    undoChangeSetService,
    v4ContractCapabilities: {
      nativeHostIdentityAvailable: true,
      localApprovalAvailable: true,
      gitCapabilityAvailable: true,
      contractV4MigrationAvailable: true
    },
    semanticPreviewStoreV5: semanticPreviewStore
  };
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

async function productionSessionOptions({
  config,
  stateHome,
  sessionId,
  credential,
  identityKey,
  approvalRuntime,
  semanticPreviewStore
}) {
  const binding = await bindGitExecutable(process.execPath);
  const evidence = createGitCapabilityEvidence({
    executable: binding,
    version: "git version 2.50.0",
    hostManifestRevision: "1".repeat(64),
    implementationRevision: "2".repeat(64)
  });
  return {
    stateRootOptions: {
      env: { ...process.env, CODEXGPT_HOME: stateHome }
    },
    policySessionContextSource: httpSource(config, sessionId, credential, identityKey),
    localApprovalRuntimeV3: approvalRuntime,
    gitReadServiceV4: { capabilityRevision: evidence.capabilityRevision },
    gitCapabilityEvidenceV4: evidence,
    semanticPreviewStoreV5: semanticPreviewStore
  };
}

test("HTTP owns process-lifecycle semantic preview and worker-health state outside per-session construction", async () => {
  const source = await fs.readFile(path.resolve("src/http.ts"), "utf8");
  const storeDeclaration = source.indexOf("const semanticPreviewStoreV5");
  const healthDeclaration = source.indexOf("const semanticWorkerHealthV5");
  const mcpRoute = source.indexOf('app.post("/mcp"');
  assert.ok(storeDeclaration >= 0);
  assert.ok(healthDeclaration > storeDeclaration);
  assert.ok(mcpRoute > healthDeclaration);
  assert.equal((source.match(/new SemanticPreviewStore\(/g) ?? []).length, 1);
  assert.equal((source.match(/createSemanticWorkerHealthRegistry\(/g) ?? []).length, 1);
  assert.equal((source.match(/LocalApprovalRuntimeV3\.start\(/g) ?? []).length, 1);
  assert.match(source.slice(mcpRoute), /createProductionCodexGPTServer[\s\S]*semanticPreviewStoreV5[\s\S]*semanticWorkerHealthV5[\s\S]*localApprovalRuntimeV3/);
  assert.match(await fs.readFile(path.resolve("src/tools/phase3dServer.ts"), "utf8"), /codexgpt\.undo-change-set\.approval-resource\.v1/);
});

test("HTTP reconnect retains one exact semantic preview authority and reaches R2 approval", { timeout: 30_000 }, async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-http-reconnect-")));
  const stateRoot = path.join(root, ".state");
  await fs.writeFile(path.join(root, "value.ts"), [
    "export function computeReconnectDelay(value: number): number {",
    "  return value + 1;",
    "}",
    "export const reconnectDelay = computeReconnectDelay(1);",
    ""
  ].join("\n"));

  const registry = new ProcessInstanceRegistry(stateRoot);
  const auditStore = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  const approvalRuntime = await LocalApprovalRuntimeV3.start({
    auditStore,
    stateBaseRoot: path.join(stateRoot, "control"),
    startNativeControl: false
  });
  const persistentAudit = new PersistentAuditRuntimeV2(auditStore);
  const semanticPreviewStore = new SemanticPreviewStore();
  const config = configFor(root);
  const credential = "phase7-http-reconnect-credential";
  const identityKey = Buffer.alloc(32, 9);
  let serverA;
  let foreignServer;
  let serverB;

  t.after(async () => {
    await Promise.allSettled([serverA?.close(), foreignServer?.close(), serverB?.close()]);
    await approvalRuntime.close().catch(() => {});
    auditStore.dispose();
    registry.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  serverA = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-session-a", credential, identityKey),
    semanticPreviewStore
  }));

  const preview = await serverA._registeredTools.semantic.handler({
    operation: "rename_preview",
    locator: {
      kind: "symbol",
      symbol: "computeReconnectDelay",
      path_hint: "value.ts"
    },
    new_name: "calculateReconnectDelay"
  });
  assert.equal(preview.structuredContent.ok, true, resultText(preview));
  const previewId = preview.structuredContent.data.result.preview_id;
  assert.match(previewId, /^sp_[A-Za-z0-9_-]{32}$/);

  await serverA.close();
  serverA = undefined;

  foreignServer = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-session-foreign", "foreign-credential", identityKey),
    semanticPreviewStore
  }));
  const foreignApply = await foreignServer._registeredTools.apply_patch.handler({
    semantic_preview_id: previewId
  });
  const foreignText = resultText(foreignApply);
  assert.equal(foreignApply.isError, true);
  assert.match(foreignText, /Code: SEMANTIC_PREVIEW_STALE/);
  assert.doesNotMatch(foreignText, /POLICY_CONFIG_INVALID|policy-unavailable/);
  await foreignServer.close();
  foreignServer = undefined;

  serverB = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-session-b", credential, identityKey),
    semanticPreviewStore
  }));
  const apply = await serverB._registeredTools.apply_patch.handler({
    semantic_preview_id: previewId
  });
  const text = resultText(apply);
  assert.equal(apply.isError, true);
  assert.match(text, /Code: APPROVAL_REQUIRED/);
  assert.doesNotMatch(text, /POLICY_CONFIG_INVALID|policy-unavailable/);
  assert.equal(await fs.readFile(path.join(root, "value.ts"), "utf8"), [
    "export function computeReconnectDelay(value: number): number {",
    "  return value + 1;",
    "}",
    "export const reconnectDelay = computeReconnectDelay(1);",
    ""
  ].join("\n"));
});

test("approved semantic preview grant survives another HTTP session rotation", { timeout: 30_000 }, async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-approval-reconnect-")));
  const stateRoot = path.join(root, ".state");
  await fs.writeFile(path.join(root, "value.ts"), [
    "export function computeReconnectGrant(value: number): number {",
    "  return value + 1;",
    "}",
    "export const reconnectGrant = computeReconnectGrant(1);",
    ""
  ].join("\n"));

  const registry = new ProcessInstanceRegistry(stateRoot);
  const auditStore = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  const approvalRuntime = await LocalApprovalRuntimeV3.start({
    auditStore,
    stateBaseRoot: path.join(stateRoot, "control"),
    startNativeControl: false
  });
  const persistentAudit = new PersistentAuditRuntimeV2(auditStore);
  const semanticPreviewStore = new SemanticPreviewStore();
  const config = configFor(root);
  const credential = "phase7-http-approval-reconnect-credential";
  const identityKey = Buffer.alloc(32, 11);
  const servers = [];

  t.after(async () => {
    await Promise.allSettled(servers.map((server) => server.close()));
    await approvalRuntime.close().catch(() => {});
    auditStore.dispose();
    registry.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  const serverA = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-approval-session-a", credential, identityKey),
    semanticPreviewStore
  }));
  servers.push(serverA);
  const preview = await serverA._registeredTools.semantic.handler({
    operation: "rename_preview",
    locator: {
      kind: "symbol",
      symbol: "computeReconnectGrant",
      path_hint: "value.ts"
    },
    new_name: "calculateReconnectGrant"
  });
  assert.equal(preview.structuredContent.ok, true, resultText(preview));
  const previewId = preview.structuredContent.data.result.preview_id;
  await serverA.close();

  const serverB = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-approval-session-b", credential, identityKey),
    semanticPreviewStore
  }));
  servers.push(serverB);
  const firstApply = await serverB._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
  assert.equal(firstApply.isError, true);
  assert.match(resultText(firstApply), /Code: APPROVAL_REQUIRED/);
  const pending = approvalRuntime.approvals.snapshot().find((record) => record.state === "pending");
  assert.ok(pending);
  assert.equal(
    pending.facts.transportSessionId,
    `semantic-preview:${preview.structuredContent.data.result.manifest_digest}`
  );
  assert.match(pending.facts.workspaceId, /^workspace-authority:[a-f0-9]{64}$/);
  assert.equal(pending.facts.semanticFactsDigest, `sha256:${createHash("sha256")
    .update("codexgpt.semantic.rename.apply.v1\0", "utf8")
    .update(preview.structuredContent.data.result.manifest_digest, "utf8")
    .digest("hex")}`);
  const granted = await approvalRuntime.server.handle({
    schemaVersion: 3,
    contractVersion: 3,
    operation: "approvals.approve",
    serverId: approvalRuntime.serverId,
    approvalId: pending.approvalId
  });
  assert.equal(granted.code, "APPROVAL_GRANTED");
  const siblingPreview = await serverB._registeredTools.semantic.handler({
    operation: "rename_preview",
    locator: {
      kind: "symbol",
      symbol: "computeReconnectGrant",
      path_hint: "value.ts"
    },
    new_name: "calculateReconnectGrant"
  });
  assert.equal(siblingPreview.structuredContent.ok, true, resultText(siblingPreview));
  const siblingPreviewId = siblingPreview.structuredContent.data.result.preview_id;
  assert.notEqual(siblingPreviewId, previewId);
  await serverB.close();

  const serverC = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-approval-session-c", credential, identityKey),
    semanticPreviewStore
  }));
  servers.push(serverC);
  const siblingApply = await serverC._registeredTools.apply_patch.handler({ semantic_preview_id: siblingPreviewId });
  assert.equal(siblingApply.isError, true);
  assert.match(resultText(siblingApply), /Code: APPROVAL_REQUIRED/);
  const retryApply = await serverC._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
  const retryText = resultText(retryApply);
  assert.equal(retryApply.isError, true);
  assert.doesNotMatch(retryText, /APPROVAL_REQUIRED|POLICY_CONFIG_INVALID|policy-unavailable/);
  const consumed = approvalRuntime.approvals.snapshot().find((record) => record.approvalId === pending.approvalId);
  assert.equal(consumed?.state, "consumed");
});

test("approved undo grant survives HTTP workspace and session rotation", { timeout: 30_000 }, async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-undo-approval-reconnect-")));
  const stateRoot = path.join(root, ".state");
  await fs.writeFile(path.join(root, "value.ts"), "export const value = 1;\n");

  const registry = new ProcessInstanceRegistry(stateRoot);
  const auditStore = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  const approvalRuntime = await LocalApprovalRuntimeV3.start({
    auditStore,
    stateBaseRoot: path.join(stateRoot, "control"),
    startNativeControl: false
  });
  const persistentAudit = new PersistentAuditRuntimeV2(auditStore);
  const semanticPreviewStore = new SemanticPreviewStore();
  const config = configFor(root);
  const guard = new PathGuard(config);
  const credential = "phase7-http-undo-reconnect-credential";
  const identityKey = Buffer.alloc(32, 13);
  const changeSetId = `cs_${"a".repeat(32)}`;
  const ownerBindings = [];
  let prepareCalls = 0;
  const undoChangeSetService = {
    describeResource({ workspace, changeSetId: requestedChangeSetId, ownerBinding }) {
      assert.equal(requestedChangeSetId, changeSetId);
      assert.match(ownerBinding, /^owner_[a-f0-9]{64}$/);
      ownerBindings.push(ownerBinding);
      return describeFilesystemBatchResource({
        workspace,
        guard,
        operation: "undo",
        entries: [{ sourcePath: "value.ts", destinationPath: null }]
      });
    },
    async prepare() {
      prepareCalls += 1;
      throw new Error("undo reconnect test reached the handler");
    }
  };
  const servers = [];

  t.after(async () => {
    await Promise.allSettled(servers.map((server) => server.close()));
    await approvalRuntime.close().catch(() => {});
    auditStore.dispose();
    registry.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  const serverA = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-undo-session-a", credential, identityKey),
    semanticPreviewStore,
    undoChangeSetService
  }));
  servers.push(serverA);
  const openedA = await serverA._registeredTools.open_current_workspace.handler({});
  assert.equal(openedA.structuredContent?.ok, true, resultText(openedA));
  const workspaceA = openedA.structuredContent.data.workspace_id;
  const firstUndo = await serverA._registeredTools.undo_change_set.handler({
    workspace_id: workspaceA,
    change_set_id: changeSetId,
    preview: false
  });
  assert.equal(firstUndo.isError, true);
  assert.match(resultText(firstUndo), /Code: APPROVAL_REQUIRED/);
  assert.equal(prepareCalls, 0);
  const pending = approvalRuntime.approvals.snapshot().find((record) => record.state === "pending");
  assert.ok(pending);
  assert.equal(pending.facts.transportSessionId, `undo-change-set:${changeSetId}`);
  assert.match(pending.facts.workspaceId, /^workspace-authority:[a-f0-9]{64}$/);
  assert.match(pending.facts.semanticFactsDigest, /^sha256:[a-f0-9]{64}$/);
  const granted = await approvalRuntime.server.handle({
    schemaVersion: 3,
    contractVersion: 3,
    operation: "approvals.approve",
    serverId: approvalRuntime.serverId,
    approvalId: pending.approvalId
  });
  assert.equal(granted.code, "APPROVAL_GRANTED");
  await serverA.close();

  const serverB = createCodexGPTServer(config, serverDependencies({
    approvalRuntime,
    persistentAudit,
    sessionSource: httpSource(config, "http-undo-session-b", credential, identityKey),
    semanticPreviewStore,
    undoChangeSetService
  }));
  servers.push(serverB);
  const openedB = await serverB._registeredTools.open_current_workspace.handler({});
  assert.equal(openedB.structuredContent?.ok, true, resultText(openedB));
  const workspaceB = openedB.structuredContent.data.workspace_id;
  assert.notEqual(workspaceB, workspaceA);
  const retryUndo = await serverB._registeredTools.undo_change_set.handler({
    workspace_id: workspaceB,
    change_set_id: changeSetId,
    preview: false
  });
  const retryText = resultText(retryUndo);
  assert.equal(retryUndo.isError, true);
  assert.doesNotMatch(retryText, /APPROVAL_REQUIRED|POLICY_CONFIG_INVALID|policy-unavailable/);
  assert.equal(prepareCalls, 1);
  assert.equal(new Set(ownerBindings).size, 1, "same credential must preserve exact change-set ownership");
  const consumed = approvalRuntime.approvals.snapshot().find((record) => record.approvalId === pending.approvalId);
  assert.equal(consumed?.state, "consumed");
});

test("production V5 change set remains undo-resolvable after HTTP session rotation", { timeout: 45_000 }, async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-production-undo-reconnect-")));
  const stateHome = path.join(root, ".state-home");
  const stateRoot = path.join(stateHome, "state", "v1");
  await fs.writeFile(path.join(root, "value.mjs"), [
    "export function computeReconnectUndo(value) {",
    "  return value + 1;",
    "}",
    "export const reconnectUndo = computeReconnectUndo(1);",
    ""
  ].join("\n"));

  const registry = new ProcessInstanceRegistry(stateRoot);
  const auditStore = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  const approvalRuntime = await LocalApprovalRuntimeV3.start({
    auditStore,
    stateBaseRoot: stateRoot,
    startNativeControl: false
  });
  const semanticPreviewStore = new SemanticPreviewStore();
  const config = configFor(root);
  const credential = "phase7-production-undo-reconnect-credential";
  const identityKey = Buffer.alloc(32, 17);
  const servers = [];
  const createServer = async (sessionId) => {
    const server = createProductionCodexGPTServer(config, await productionSessionOptions({
      config,
      stateHome,
      sessionId,
      credential,
      identityKey,
      approvalRuntime,
      semanticPreviewStore
    }));
    servers.push(server);
    return server;
  };

  t.after(async () => {
    await Promise.allSettled(servers.map((server) => server.close()));
    await approvalRuntime.close().catch(() => {});
    auditStore.dispose();
    registry.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  const previewServer = await createServer("production-undo-preview");
  const preview = await previewServer._registeredTools.semantic.handler({
    operation: "rename_preview",
    locator: { kind: "symbol", symbol: "computeReconnectUndo", path_hint: "value.mjs" },
    new_name: "calculateReconnectUndo"
  });
  assert.equal(preview.structuredContent?.ok, true, resultText(preview));
  const previewId = preview.structuredContent.data.result.preview_id;
  await previewServer.close();

  const approvalServer = await createServer("production-undo-apply-approval");
  const firstApply = await approvalServer._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
  assert.equal(firstApply.isError, true);
  assert.match(resultText(firstApply), /Code: APPROVAL_REQUIRED/);
  const applyApproval = approvalRuntime.approvals.snapshot().find((record) => record.state === "pending");
  assert.ok(applyApproval);
  const applyGranted = await approvalRuntime.server.handle({
    schemaVersion: 3,
    contractVersion: 3,
    operation: "approvals.approve",
    serverId: approvalRuntime.serverId,
    approvalId: applyApproval.approvalId
  });
  assert.equal(applyGranted.code, "APPROVAL_GRANTED");
  await approvalServer.close();

  const applyServer = await createServer("production-undo-apply");
  const applied = await applyServer._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
  assert.equal(applied.structuredContent?.ok, true, resultText(applied));
  const changeSetId = applied.structuredContent.data.transaction.change_set_id;
  assert.match(changeSetId, /^cs_[a-f0-9]{32}$/);
  await applyServer.close();

  const openServer = await createServer("production-undo-open");
  const opened = await openServer._registeredTools.open_current_workspace.handler({});
  assert.equal(opened.structuredContent?.ok, true, resultText(opened));
  const staleWorkspaceId = opened.structuredContent.data.workspace_id;
  await openServer.close();

  const staleServer = await createServer("production-undo-stale-handle");
  const staleUndo = await staleServer._registeredTools.undo_change_set.handler({
    workspace_id: staleWorkspaceId,
    change_set_id: changeSetId,
    preview: false
  });
  assert.equal(staleUndo.isError, true);
  assert.match(resultText(staleUndo), /POLICY_CONFIG_INVALID|policy-unavailable/);
  assert.equal(approvalRuntime.approvals.snapshot().filter((record) => record.state === "pending").length, 0);
  await staleServer.close();

  const undoServer = await createServer("production-undo-request");
  const undo = await undoServer._registeredTools.undo_change_set.handler({
    change_set_id: changeSetId,
    preview: false
  });
  assert.equal(undo.isError, true);
  assert.match(resultText(undo), /Code: APPROVAL_REQUIRED/);
  assert.doesNotMatch(resultText(undo), /POLICY_CONFIG_INVALID|policy-unavailable/);
});

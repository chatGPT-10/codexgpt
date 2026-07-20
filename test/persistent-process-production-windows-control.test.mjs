import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { LocalApprovalRuntimeV3 } from "../dist/control/runtime.js";
import { PersistentAuditStore } from "../dist/audit/store.js";
import { createStdioPolicySessionSource } from "../dist/policy/identity.js";
import { policyIdentityScopes } from "../dist/policy/runtime.js";
import { connectProductionCodexGPTServer, createProductionCodexGPTServer, disposeProductionCodexGPTServer } from "../dist/productionRuntime.js";
import { resolveTransactionStateRoot } from "../dist/transactions/stateRoot.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

async function waitForFile(file) {
  try {
    await fs.access(file);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const watcher = fs.watch(path.dirname(file));
  try {
    for await (const event of watcher) {
      if (String(event.filename ?? "") !== path.basename(file)) continue;
      try {
        await fs.access(file);
        return;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  } finally {
    await watcher.return?.();
  }
}

test("production V3 persistent process requires exact approval and remains locally terminable", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-production-process-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  await fs.mkdir(path.join(home, "permissions"), { recursive: true });
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(home, "permissions", "ambient.json"), JSON.stringify({
    schemaVersion: 3, id: "ambient", workspaceRoots: [workspace],
    fullAccess: { ambientFilesystem: true, ambientCredentials: true, ambientRegistry: true, unrestrictedNetwork: true, requireBlockedPathEnforcement: false, requireCredentialIsolation: false, requireRegistryIsolation: false, requireDeviceIsolation: false, requireNetworkEnforcement: false, requireSandbox: false }
  }));
  const previous = Object.fromEntries(["CODEXGPT_HOME", "CODEXGPT_FILE_TRANSACTIONS", "CODEXGPT_AUDIT_MODE", "CODEXGPT_POLICY_ENGINE", "CODEXGPT_TOOL_CONTRACT_VERSION", "CODEXGPT_TOOL_MODE", "CODEXGPT_PERMISSION_PROFILE", "CODEXGPT_EXECUTION_PROFILE"].map((name) => [name, process.env[name]]));
  Object.assign(process.env, { CODEXGPT_HOME: home, CODEXGPT_FILE_TRANSACTIONS: "atomic", CODEXGPT_AUDIT_MODE: "required", CODEXGPT_POLICY_ENGINE: "enforce", CODEXGPT_TOOL_CONTRACT_VERSION: "3", CODEXGPT_TOOL_MODE: "full", CODEXGPT_PERMISSION_PROFILE: "ambient", CODEXGPT_EXECUTION_PROFILE: "full_access" });
  let registry; let auditStore; let approval; let server; let client;
  try {
    const config = loadConfig(["--root", workspace, "--allow-root", workspace, "--bash", "off", "--write", "workspace"]);
    const stateRoot = resolveTransactionStateRoot({ env: { ...process.env, CODEXGPT_HOME: home } });
    registry = new ProcessInstanceRegistry(stateRoot);
    auditStore = PersistentAuditStore.open({ stateRoot, registry, retention: config.auditRetention });
    approval = await LocalApprovalRuntimeV3.start({ auditStore, stateBaseRoot: path.join(stateRoot, "control"), startNativeControl: false });
    const source = createStdioPolicySessionSource({ sessionId: "production-process-session", scopes: policyIdentityScopes(config) });
    server = createProductionCodexGPTServer(config, { policySessionContextSource: source, localApprovalRuntimeV3: approval, stateRootOptions: { env: { ...process.env, CODEXGPT_HOME: home } } });
    const pair = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "persistent-process-control", version: "1" });
    await connectProductionCodexGPTServer(server, pair[1]);
    await client.connect(pair[0]);
    const args = { command: { kind: "argv", executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }, cwd: { kind: "absolute_local", path: workspace }, mode: "full_access", terminal: "pipes", lifetime_ms: 60_000 };
    const first = await client.callTool({ name: "start_process", arguments: args });
    assert.equal(first.isError, true);
    const approvalId = first.content.map((item) => item.type === "text" ? item.text : "").join("\n").match(/Approval ID: (approval_[a-f0-9]{32})/)?.[1];
    assert.ok(approvalId);
    const granted = await approval.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId: approval.serverId, approvalId });
    assert.equal(granted.code, "APPROVAL_GRANTED");
    const started = await client.callTool({ name: "start_process", arguments: args });
    assert.equal(started.structuredContent.ok, true);
    const processId = started.structuredContent.data.process_id;
    assert.match(processId, /^process_[a-f0-9]{32}$/);
    const readyFile = path.join(root, "one-shot-ready.txt");
    const runArgs = {
      command: {
        kind: "argv",
        executable: process.execPath,
        args: [
          "-e",
          `import('node:fs').then(fs=>{fs.writeFileSync(${JSON.stringify(readyFile)},'ready');setTimeout(()=>{},2500)})`
        ]
      },
      cwd: { kind: "absolute_local", path: workspace },
      mode: "full_access",
      timeout_ms: 10_000
    };
    const runFirst = await client.callTool({ name: "run_command", arguments: runArgs });
    const runApprovalId = runFirst.content.map((item) => item.type === "text" ? item.text : "").join("\n").match(/Approval ID: (approval_[a-f0-9]{32})/)?.[1];
    assert.ok(runApprovalId);
    await approval.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId: approval.serverId, approvalId: runApprovalId });
    const slowRun = client.callTool({ name: "run_command", arguments: runArgs });
    await waitForFile(readyFile);
    const localRequest = approval.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "processes.terminate", serverId: approval.serverId, processId });
    const firstCompleted = await Promise.race([
      localRequest.then(() => "local_terminate"),
      slowRun.then(() => "one_shot_run", () => "one_shot_run")
    ]);
    assert.equal(firstCompleted, "local_terminate", "one-shot execution must not block persistent process control");
    const local = await localRequest;
    assert.equal(local.code, "PROCESS_TERMINATED");
    const runCompleted = await slowRun;
    assert.equal(runCompleted.structuredContent.ok, true);
    const restartFirst = await client.callTool({ name: "start_process", arguments: { ...args, command: { ...args.command, args: ["-e", "setInterval(()=>{},1000)", "second"] } } });
    const restartApprovalId = restartFirst.content.map((item) => item.type === "text" ? item.text : "").join("\n").match(/Approval ID: (approval_[a-f0-9]{32})/)?.[1];
    assert.ok(restartApprovalId);
    await approval.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId: approval.serverId, approvalId: restartApprovalId });
    const restartStarted = await client.callTool({ name: "start_process", arguments: { ...args, command: { ...args.command, args: ["-e", "setInterval(()=>{},1000)", "second"] } } });
    assert.equal(restartStarted.structuredContent.ok, true);
    await client.close();
    client = null;
    await disposeProductionCodexGPTServer(server);
    server = null;
    const afterClose = await approval.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "processes.list", serverId: approval.serverId });
    assert.equal(afterClose.processes.length, 0, "restart restores no public process handle");
    const verified = await auditStore.verify();
    assert.equal(verified.some((entry) => entry.event.schemaVersion === 3 && entry.event.eventType === "process_lifecycle" && entry.event.transition === "user_terminated"), true);
  } finally {
    await client?.close().catch(() => {});
    await disposeProductionCodexGPTServer(server).catch(() => {});
    await approval?.close().catch(() => {});
    auditStore?.dispose();
    registry?.dispose();
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete process.env[name] : process.env[name] = value;
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createStdioPolicySessionSource } from "../dist/policy/identity.js";
import { policyIdentityScopes } from "../dist/policy/runtime.js";
import {
  CONTRACT_V1_CHILD_TOOLS,
  CONTRACT_V2_CHILD_TOOLS,
  CONTRACT_V3_ADDITIONS,
  CONTRACT_V3_CHILD_TOOLS
} from "../dist/tools/contracts/index.js";
import {
  connectProductionCodexProServer,
  createProductionCodexProServer
} from "../dist/productionRuntime.js";

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const restore = () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    const result = action();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

async function fixture(action) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-production-runtime-"));
  const workspaceDirectory = path.join(root, "workspace");
  const stateHome = path.join(root, "home");
  await fs.mkdir(workspaceDirectory, { recursive: true });
  const workspaceRoot = await fs.realpath(workspaceDirectory);
  try {
    return await action({ root, workspaceRoot, stateHome });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function configFor(workspaceRoot, stateHome, overrides = {}) {
  return withEnv({
    CODEXPRO_HOME: stateHome,
    CODEXPRO_FILE_TRANSACTIONS: overrides.fileTransactions ?? "atomic",
    CODEXPRO_AUDIT_MODE: overrides.auditMode ?? "required",
    CODEXPRO_POLICY_ENGINE: overrides.policyEngineMode ?? "legacy",
    CODEXPRO_TOOL_CONTRACT_VERSION: overrides.toolContractVersion ?? "1",
    CODEXPRO_TOOL_MODE: overrides.toolMode ?? "standard",
    CODEXPRO_CODEX_SESSIONS: overrides.codexSessions ?? "off",
    CODEXPRO_CONNECTION_TEST: overrides.connectionTest ? "1" : undefined
  }, () => loadConfig([
    "--root", workspaceRoot,
    "--allow-root", workspaceRoot,
    "--bash", overrides.bashMode ?? "off",
    "--write", overrides.writeMode ?? "workspace"
  ]));
}

function sourceFor(config, sessionId) {
  return createStdioPolicySessionSource({
    sessionId,
    scopes: policyIdentityScopes(config)
  });
}

async function assertEventuallyMissing(targetPath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.stat(targetPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await assert.rejects(() => fs.stat(targetPath), { code: "ENOENT" });
}

function productionOptions(stateHome, overrides = {}) {
  return {
    stateRootOptions: {
      env: { ...process.env, CODEXPRO_HOME: stateHome }
    },
    ...overrides
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function canonicalValue(value, replacements = new Map()) {
  if (typeof value === "string") {
    if (replacements.has(value)) return replacements.get(value);
    if (/^policy_[a-f0-9]{24}$/.test(value)) return "<POLICY_REVISION>";
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, replacements));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    canonicalValue(value[key], replacements)
  ]));
}

function wireHash(value, replacements) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value, replacements)))
    .digest("hex");
}

function normalizedCallPayload(value) {
  const {
    codexpro_super_action: _superAction,
    wrapped_tool: _wrappedTool,
    ...payload
  } = value;
  return {
    ...payload,
    meta: { ...payload.meta, durationMs: 0 }
  };
}

function normalizedServerConfigCallPayload(value) {
  const payload = normalizedCallPayload(value);
  assert.equal(payload.codexpro_tool, "server_config");
  assert.ok(payload.data && typeof payload.data === "object");
  assert.ok(Array.isArray(payload.data.allowedRoots));
  assert.ok(payload.data.enforcement && typeof payload.data.enforcement === "object");
  assert.ok(Array.isArray(payload.data.enforcement.missingCapabilities));
  return {
    ...payload,
    data: {
      ...payload.data,
      defaultRoot: "<DEFAULT_ROOT>",
      allowedRoots: payload.data.allowedRoots.map((_, index) => `<ALLOWED_ROOT_${index}>`),
      codexDir: "<CODEX_DIR>",
      policyRevision: payload.data.policyRevision === null ? null : "<POLICY_REVISION>",
      grantRevision: payload.data.grantRevision === null ? null : "<GRANT_REVISION>",
      enforcement: {
        ...payload.data.enforcement,
        backendId: "<ENFORCEMENT_BACKEND>",
        evidenceRevision: "<ENFORCEMENT_EVIDENCE>",
        missingCapabilities: [...payload.data.enforcement.missingCapabilities].sort()
      }
    }
  };
}

async function connect(server, action) {
  const client = new Client({ name: "production-runtime-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await action(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

test("Gate R production wiring fails closed outside contract 4 or before startup recovery", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome, {
    toolContractVersion: "1",
    fileTransactions: "atomic",
    auditMode: "required"
  });
  assert.throws(
    () => createProductionCodexProServer(config, productionOptions(stateHome, {
      gitGateRRuntimeV4: { isReady: () => true }
    })),
    /Gate R requires contract 4/
  );
  assert.throws(
    () => createProductionCodexProServer(config, productionOptions(stateHome, {
      gitGateRRuntimeV4: { isReady: () => false }
    })),
    /Gate R requires contract 4/
  );
}));

test("legacy production construction creates no Phase 3 state or runtime", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome, {
    fileTransactions: "legacy",
    auditMode: "off",
    policyEngineMode: "legacy"
  });
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    observeRuntime: (value) => observations.push(value)
  }));
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0], {
    atomic: false,
    durableAudit: false,
    stateRoot: null,
    registryInstanceId: null,
    mutationRuntime: null,
    auditRuntime: null,
    localApprovalServerId: null,
    processHostConfigured: false,
    gitGateRReady: false
  });
  await server.close();
  await assert.rejects(() => fs.stat(path.join(stateHome, "state", "v1")), { code: "ENOENT" });
}));

test("one production server composes one runtime set and distinct servers never share it", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome);
  const first = [];
  const second = [];
  const serverA = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_runtime_a"),
    observeRuntime: (value) => first.push(value)
  }));
  const serverB = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_runtime_b"),
    observeRuntime: (value) => second.push(value)
  }));
  try {
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0].atomic, true);
    assert.equal(first[0].durableAudit, true);
    assert.equal(first[0].stateRoot, second[0].stateRoot);
    assert.notEqual(first[0].registryInstanceId, second[0].registryInstanceId);
    assert.notStrictEqual(first[0].mutationRuntime, second[0].mutationRuntime);
    assert.notStrictEqual(first[0].auditRuntime, second[0].auditRuntime);
  } finally {
    await Promise.allSettled([serverA.close(), serverB.close()]);
  }
}));

test("production construction disposes runtime state when an observation hook fails", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome);
  let observation;
  assert.throws(
    () => createProductionCodexProServer(config, productionOptions(stateHome, {
      policySessionContextSource: sourceFor(config, "session_observer_failure"),
      observeRuntime: (value) => {
        observation = value;
        throw new Error("observer failed");
      }
    })),
    /observer failed/
  );
  assert.ok(observation?.stateRoot);
  assert.ok(observation?.registryInstanceId);
  await assertEventuallyMissing(
    path.join(observation.stateRoot, "instances", `${observation.registryInstanceId}.json`)
  );
}));

test("failed transport startup disposes the production runtime", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome);
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_connect_failure"),
    observeRuntime: (value) => observations.push(value)
  }));
  const transport = {
    start: async () => { throw new Error("transport start failed"); },
    send: async () => {},
    close: async () => {}
  };
  await assert.rejects(
    () => connectProductionCodexProServer(server, transport),
    /transport start failed/
  );
  const observation = observations[0];
  await assert.rejects(
    () => fs.stat(path.join(observation.stateRoot, "instances", `${observation.registryInstanceId}.json`)),
    { code: "ENOENT" }
  );
}));

test("production close quiesces new tools and drains an active audited mutation", () => fixture(async ({
  workspaceRoot,
  stateHome
}) => {
  const config = configFor(workspaceRoot, stateHome);
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_lifecycle_drain"),
    observeRuntime: (value) => observations.push(value)
  }));
  const observation = observations[0];
  assert.ok(observation.auditRuntime);
  const enteredAudit = deferred();
  const releaseAudit = deferred();
  const originalPersistExecution = observation.auditRuntime.persistExecution.bind(observation.auditRuntime);
  observation.auditRuntime.persistExecution = async (...args) => {
    enteredAudit.resolve();
    await releaseAudit.promise;
    return originalPersistExecution(...args);
  };
  const tools = server._registeredTools;
  const invocation = tools.write.handler({ path: "drained.txt", content: "drained\n" });
  await enteredAudit.promise;

  let closeResolved = false;
  const closing = server.close().then(() => { closeResolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closeResolved, false);
  const rejected = await tools.read.handler({ path: "drained.txt" });
  assert.equal(rejected.isError, true);
  assert.match(rejected.content[0].text, /shutting down/i);
  const activeRegistry = await fs.stat(path.join(
    observation.stateRoot,
    "instances",
    `${observation.registryInstanceId}.json`
  ));
  assert.equal(activeRegistry.isFile(), true);

  releaseAudit.resolve();
  const result = await invocation;
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.ok, true);
  await closing;
  assert.equal(await fs.readFile(path.join(workspaceRoot, "drained.txt"), "utf8"), "drained\n");
  await assert.rejects(
    () => fs.stat(path.join(observation.stateRoot, "instances", `${observation.registryInstanceId}.json`)),
    { code: "ENOENT" }
  );
}));

test("client disconnect during an audited mutation leaves a committed or recoverable terminal state", () => fixture(async ({
  workspaceRoot,
  stateHome
}) => {
  const config = configFor(workspaceRoot, stateHome);
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_disconnect_drain"),
    observeRuntime: (value) => observations.push(value)
  }));
  const observation = observations[0];
  const enteredAudit = deferred();
  const releaseAudit = deferred();
  const originalPersistExecution = observation.auditRuntime.persistExecution.bind(observation.auditRuntime);
  observation.auditRuntime.persistExecution = async (...args) => {
    enteredAudit.resolve();
    await releaseAudit.promise;
    return originalPersistExecution(...args);
  };
  const client = new Client({ name: "disconnect-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const invocation = client.callTool({
    name: "write",
    arguments: { path: "disconnect.txt", content: "survived\n" }
  });
  await enteredAudit.promise;
  await clientTransport.close();
  releaseAudit.resolve();
  await Promise.allSettled([invocation]);
  await server.close();
  assert.equal(await fs.readFile(path.join(workspaceRoot, "disconnect.txt"), "utf8"), "survived\n");
  await assert.rejects(
    () => fs.stat(path.join(observation.stateRoot, "instances", `${observation.registryInstanceId}.json`)),
    { code: "ENOENT" }
  );
}));

test("workspace close concurrent with an audited mutation cannot strand partial state", () => fixture(async ({
  workspaceRoot,
  stateHome
}) => {
  const config = configFor(workspaceRoot, stateHome);
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_workspace_close_mutation"),
    observeRuntime: (value) => observations.push(value)
  }));
  const observation = observations[0];
  await connect(server, async (client) => {
    const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
    const workspaceId = opened.structuredContent.data.workspace_id;
    const enteredAudit = deferred();
    const releaseAudit = deferred();
    const originalPersistExecution = observation.auditRuntime.persistExecution.bind(observation.auditRuntime);
    observation.auditRuntime.persistExecution = async (...args) => {
      enteredAudit.resolve();
      await releaseAudit.promise;
      return originalPersistExecution(...args);
    };
    const mutation = client.callTool({
      name: "write",
      arguments: { workspace_id: workspaceId, path: "workspace-close.txt", content: "complete\n" }
    });
    await enteredAudit.promise;
    const closingWorkspace = client.callTool({
      name: "close_workspace",
      arguments: { workspace_id: workspaceId }
    });
    await new Promise((resolve) => setImmediate(resolve));
    releaseAudit.resolve();
    const [mutationResult, closeResult] = await Promise.all([mutation, closingWorkspace]);
    assert.equal(mutationResult.isError, undefined);
    assert.equal(mutationResult.structuredContent.ok, true);
    assert.equal(closeResult.isError, undefined);
    assert.equal(closeResult.structuredContent.ok, true);
  });
  assert.equal(await fs.readFile(path.join(workspaceRoot, "workspace-close.txt"), "utf8"), "complete\n");
}));

test("writable atomic contract V1 commits one audited change set even when configured Policy mode is legacy", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome);
  const observations = [];
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_atomic_write"),
    observeRuntime: (value) => observations.push(value)
  }));
  await connect(server, async (client) => {
    const result = await client.callTool({
      name: "write",
      arguments: { path: "atomic.txt", content: "atomic-v1\n" }
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(await fs.readFile(path.join(workspaceRoot, "atomic.txt"), "utf8"), "atomic-v1\n");
  });
  const stateRoot = observations[0].stateRoot;
  assert.ok(stateRoot);
  const auditSegments = await fs.readdir(path.join(stateRoot, "audit", "segments"));
  assert.ok(auditSegments.some((name) => name.endsWith(".jsonl")));
  const workspaceDirectories = await fs.readdir(path.join(stateRoot, "changesets"));
  assert.equal(workspaceDirectories.length, 1);
  const changeSets = await fs.readdir(path.join(stateRoot, "changesets", workspaceDirectories[0]));
  assert.equal(changeSets.length, 1);
}));

test("required audit corruption rejects production construction before a server is returned", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome);
  const stateRoot = path.join(stateHome, "state", "v1");
  await fs.mkdir(path.join(stateRoot, "audit"), { recursive: true });
  await fs.writeFile(path.join(stateRoot, "audit", "index.json"), "{not-json\n", "utf8");
  assert.throws(
    () => createProductionCodexProServer(config, productionOptions(stateHome, {
      policySessionContextSource: sourceFor(config, "session_corrupt_audit")
    })),
    /audit.*integrity|integrity.*audit/i
  );
}));

test("contract V1 wire snapshots freeze exact mode projections and direct/supertool calls", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const scenarios = [
    { id: "minimal", toolMode: "minimal", bashMode: "off", codexSessions: "off" },
    { id: "standard", toolMode: "standard", bashMode: "off", codexSessions: "off" },
    { id: "full", toolMode: "full", bashMode: "safe", codexSessions: "read" },
    { id: "connection", toolMode: "full", bashMode: "safe", codexSessions: "read", connectionTest: true }
  ];
  const snapshots = {};
  for (const scenario of scenarios) {
    const config = configFor(workspaceRoot, stateHome, scenario);
    const server = createProductionCodexProServer(config, productionOptions(stateHome, {
      policySessionContextSource: sourceFor(config, `session_v1_snapshot_${scenario.id}`)
    }));
    await connect(server, async (client) => {
      const listed = await client.listTools();
      const descriptors = listed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations
      }));
      snapshots[scenario.id] = {
        names: descriptors.map((tool) => tool.name),
        descriptorHash: wireHash(descriptors)
      };
      if (scenario.id === "standard") {
        const direct = await client.callTool({ name: "server_config", arguments: {} });
        const wrapped = await client.callTool({
          name: "codexpro",
          arguments: { action: "server_config", args: {} }
        });
        snapshots.standard.directCallHash = wireHash(
          normalizedServerConfigCallPayload(direct.structuredContent)
        );
        snapshots.standard.supertoolCallHash = wireHash(
          normalizedServerConfigCallPayload(wrapped.structuredContent)
        );
        snapshots.standard.supertoolEnvelope = {
          codexpro_super_action: wrapped.structuredContent.codexpro_super_action,
          wrapped_tool: wrapped.structuredContent.wrapped_tool
        };
        assert.deepEqual(
          canonicalValue(normalizedServerConfigCallPayload(wrapped.structuredContent)),
          canonicalValue(normalizedServerConfigCallPayload(direct.structuredContent))
        );
      }
    });
  }
  assert.deepEqual(snapshots, {
    minimal: {
      names: [
        "codexpro", "server_config", "codexpro_self_test", "close_workspace",
        "open_current_workspace", "open_workspace", "read", "write", "edit",
        "apply_patch", "show_changes"
      ],
      descriptorHash: "d37652c6a92d642739be2b0e04122aa95b11029ac0722f5a62b730195e8de9d3"
    },
    standard: {
      names: [
        "codexpro", "server_config", "codexpro_self_test", "load_skill",
        "close_workspace", "open_current_workspace", "open_workspace",
        "inspect_workspace", "tree", "search", "read", "write", "edit",
        "apply_patch", "show_changes", "read_handoff", "wait_for_handoff",
        "export_pro_context", "handoff_to_agent"
      ],
      descriptorHash: "5a29174c8ea440c2ec40f37216e8683561388bddb74da97664f67fa121c125db",
      directCallHash: "c14469627df4dfce5cb1f1d24c6c718049c370c09fa30161962c0336ae253b7b",
      supertoolCallHash: "c14469627df4dfce5cb1f1d24c6c718049c370c09fa30161962c0336ae253b7b",
      supertoolEnvelope: {
        codexpro_super_action: "server_config",
        wrapped_tool: "server_config"
      }
    },
    full: {
      names: [
        "codexpro", "server_config", "codexpro_self_test", "codexpro_inventory",
        "load_skill", "list_workspaces", "close_workspace", "open_current_workspace",
        "open_workspace", "workspace_snapshot", "inspect_workspace", "tree", "search",
        "read", "write", "edit", "apply_patch", "bash", "git_status", "git_diff",
        "show_changes", "read_handoff", "wait_for_handoff", "codex_context",
        "export_pro_context", "codex_sessions", "read_codex_session",
        "handoff_to_agent", "handoff_to_codex"
      ],
      descriptorHash: "d5ea2a275c78efc8450e20ee7ab1e16c51520328b4768802c927d6bcbb873a47"
    },
    connection: {
      names: [
        "server_config", "codexpro_inventory", "load_skill", "list_workspaces",
        "open_current_workspace", "open_workspace", "workspace_snapshot",
        "inspect_workspace", "tree", "search", "read", "git_status", "git_diff",
        "show_changes", "read_handoff", "wait_for_handoff", "codex_context",
        "codex_sessions", "read_codex_session"
      ],
      descriptorHash: "71f390fbea9c93f790237c6fa61e9b2c072df836550a9d3fd5c653940a093eee"
    }
  });
  assert.deepEqual(
    snapshots.full.names.filter((name) => name !== "codexpro").sort(),
    [...CONTRACT_V1_CHILD_TOOLS].sort()
  );
}));

test("contract V2 production construction exposes the exact 31-child universe", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome, {
    toolContractVersion: "2",
    toolMode: "full",
    bashMode: "safe",
    codexSessions: "read"
  });
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_v2_complete")
  }));
  await connect(server, async (client) => {
    const listed = await client.listTools();
    const childNames = listed.tools
      .map((tool) => tool.name)
      .filter((name) => name !== "codexpro")
      .sort();
    assert.deepEqual(childNames, [...CONTRACT_V2_CHILD_TOOLS].sort());
  });
}));

test("contract V3 production registration keeps exact profile projections and the closed 39-child full universe", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const scenarios = [
    { id: "minimal", toolMode: "minimal", connectionTest: false, expectedV3: [] },
    { id: "standard", toolMode: "standard", connectionTest: false, expectedV3: ["run_command", "read_process_output"] },
    { id: "full", toolMode: "full", connectionTest: false, expectedV3: [...CONTRACT_V3_ADDITIONS] },
    { id: "connection", toolMode: "full", connectionTest: true, expectedV3: [] }
  ];
  for (const scenario of scenarios) {
    const config = configFor(workspaceRoot, stateHome, {
      toolContractVersion: "3",
      toolMode: scenario.toolMode,
      connectionTest: scenario.connectionTest,
      policyEngineMode: "enforce",
      bashMode: "safe",
      codexSessions: "read"
    });
    const server = createProductionCodexProServer(config, productionOptions(stateHome, {
      policySessionContextSource: sourceFor(config, `session_v3_${scenario.id}`)
    }));
    await connect(server, async (client) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      const projectedV3 = names.filter((name) => CONTRACT_V3_ADDITIONS.includes(name));
      assert.deepEqual(projectedV3.sort(), [...scenario.expectedV3].sort());
      assert.equal(names.includes("bash"), false);
      if (scenario.id === "full") {
        const childNames = names.filter((name) => name !== "codexpro").sort();
        assert.deepEqual(childNames, [...CONTRACT_V3_CHILD_TOOLS].sort());
      }
    });
  }
}));

test("contract V2 direct and supertool wire paths share move undo and audit behavior", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome, {
    toolContractVersion: "2",
    toolMode: "full",
    policyEngineMode: "shadow"
  });
  const server = createProductionCodexProServer(config, productionOptions(stateHome, {
    policySessionContextSource: sourceFor(config, "session_v2_wire")
  }));
  await connect(server, async (client) => {
    const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
    assert.equal(opened.isError, undefined);
    const workspaceId = opened.structuredContent.data.workspace_id;

    const written = await client.callTool({
      name: "write",
      arguments: { workspace_id: workspaceId, path: "wire-a.txt", content: "wire-alpha\n" }
    });
    assert.equal(written.isError, undefined);
    const expectedSha256 = createHash("sha256").update("wire-alpha\n").digest("hex");
    const moveArgs = {
      workspace_id: workspaceId,
      moves: [{
        source: "wire-a.txt",
        destination: "wire-b.txt",
        expected_sha256: expectedSha256
      }],
      preview: true
    };

    const directPreview = await client.callTool({ name: "move_paths", arguments: moveArgs });
    const wrappedPreview = await client.callTool({
      name: "codexpro",
      arguments: { action: "move_paths", args: moveArgs }
    });
    assert.equal(directPreview.isError, undefined);
    assert.equal(wrappedPreview.isError, undefined);
    assert.equal(directPreview.structuredContent.data.preview, true);
    assert.deepEqual(
      wrappedPreview.structuredContent.data.moves,
      directPreview.structuredContent.data.moves
    );

    const moved = await client.callTool({
      name: "move_paths",
      arguments: { ...moveArgs, preview: false }
    });
    assert.equal(moved.isError, undefined);
    const moveChangeSetId = moved.structuredContent.data.transaction.change_set_id;
    assert.equal(await fs.readFile(path.join(workspaceRoot, "wire-b.txt"), "utf8"), "wire-alpha\n");
    await assert.rejects(() => fs.stat(path.join(workspaceRoot, "wire-a.txt")), { code: "ENOENT" });

    const undoArgs = {
      workspace_id: workspaceId,
      change_set_id: moveChangeSetId,
      preview: true
    };
    const wrappedUndoPreview = await client.callTool({
      name: "codexpro",
      arguments: { action: "undo_change_set", args: undoArgs }
    });
    assert.equal(wrappedUndoPreview.isError, undefined);
    assert.equal(wrappedUndoPreview.structuredContent.data.preview, true);
    assert.deepEqual(wrappedUndoPreview.structuredContent.data.operations, [
      { kind: "move", source: "wire-b.txt", destination: "wire-a.txt" }
    ]);

    const undone = await client.callTool({
      name: "undo_change_set",
      arguments: { ...undoArgs, preview: false }
    });
    assert.equal(undone.isError, undefined);
    assert.equal(undone.structuredContent.data.reverts_change_set_id, moveChangeSetId);
    assert.equal(await fs.readFile(path.join(workspaceRoot, "wire-a.txt"), "utf8"), "wire-alpha\n");
    await assert.rejects(() => fs.stat(path.join(workspaceRoot, "wire-b.txt")), { code: "ENOENT" });

    const directAudit = await client.callTool({
      name: "query_audit_events",
      arguments: { limit: 100 }
    });
    assert.equal(directAudit.isError, undefined);
    assert.ok(directAudit.structuredContent.data.records.length >= 4);
    assert.ok(directAudit.structuredContent.data.records.some((record) =>
      record.event.eventType === "execution" &&
      record.event.changeSetId === moveChangeSetId
    ));

    const wrappedAudit = await client.callTool({
      name: "codexpro",
      arguments: { action: "query_audit_events", args: { limit: 100 } }
    });
    assert.equal(wrappedAudit.isError, undefined);
    assert.ok(
      wrappedAudit.structuredContent.data.records.length >=
      directAudit.structuredContent.data.records.length
    );
  });
}));

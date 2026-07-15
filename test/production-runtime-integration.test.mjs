import assert from "node:assert/strict";
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
    CODEXPRO_TOOL_CONTRACT_VERSION: overrides.toolContractVersion ?? "1"
  }, () => loadConfig([
    "--root", workspaceRoot,
    "--allow-root", workspaceRoot,
    "--bash", "off",
    "--write", overrides.writeMode ?? "workspace"
  ]));
}

function sourceFor(config, sessionId) {
  return createStdioPolicySessionSource({
    sessionId,
    scopes: policyIdentityScopes(config)
  });
}

function productionOptions(stateHome, overrides = {}) {
  return {
    stateRootOptions: {
      env: { ...process.env, CODEXPRO_HOME: stateHome }
    },
    ...overrides
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
    auditRuntime: null
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
  await assert.rejects(
    () => fs.stat(path.join(observation.stateRoot, "instances", `${observation.registryInstanceId}.json`)),
    { code: "ENOENT" }
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

test("contract V2 remains fail-closed after production runtime composition", () => fixture(async ({ workspaceRoot, stateHome }) => {
  const config = configFor(workspaceRoot, stateHome, { toolContractVersion: "2", writeMode: "off" });
  assert.throws(
    () => createProductionCodexProServer(config, productionOptions(stateHome, {
      policySessionContextSource: sourceFor(config, "session_v2_incomplete")
    })),
    /incomplete.*move_paths/i
  );
}));

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const {
  createCodexGPTServer,
  loadConfig,
  ProcessManagerV3
} = await tsImport("../fixtures/ts-imports/phase-4a-integration-imports.ts", import.meta.url);

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

function config(toolMode = "standard", overrides = {}) {
  return withEnv({
    CODEXGPT_TOOL_CONTRACT_VERSION: "3",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: overrides.auditMode ?? "required",
    CODEXGPT_POLICY_ENGINE: overrides.policyMode ?? "enforce",
    CODEXGPT_TOOL_MODE: toolMode,
    CODEXGPT_EXECUTION_PROFILE: "off"
  }, () => loadConfig(["--root", process.cwd(), "--bash", "off", "--write", "off"]));
}

async function withClient(server, action) {
  const client = new Client({ name: "phase-4a-adversarial", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await action(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

test("standard projection cannot reach hidden process mutations through a stale supertool action", async () => {
  let handlerCalls = 0;
  let authorizationCalls = 0;
  const dependencies = {
    persistentAuditRuntime: {},
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {
      identity: { credentialRef: "phase4a-adversarial", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "phase4a-adversarial"
    },
    policyRuntime: {
      mode: "enforce",
      authorize() {
        authorizationCalls += 1;
        throw new Error("hidden action reached policy");
      },
      audit() {}
    },
    v3ToolHandlers: {
      start_process() {
        handlerCalls += 1;
        return {};
      }
    }
  };
  const server = createCodexGPTServer(config("standard"), dependencies);
  await withClient(server, async (client) => {
    const listed = await client.listTools();
    assert.equal(listed.tools.some((tool) => tool.name === "start_process"), false);
    const result = await client.callTool({
      name: "codexgpt",
      arguments: { action: "start_process", args: {} }
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "ACTION_NOT_AVAILABLE");
    assert.equal(handlerCalls, 0);
    assert.equal(authorizationCalls, 0);
  });
});

test("invalid V3 policy and audit modes fail before any execution handler can run", () => {
  let handlerCalls = 0;
  const dependencies = {
    persistentAuditRuntime: {},
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {
      identity: { credentialRef: "phase4a-invalid", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "phase4a-invalid"
    },
    v3ToolHandlers: {
      run_command() {
        handlerCalls += 1;
        return {};
      }
    }
  };
  for (const overrides of [
    { policyMode: "legacy", auditMode: "required" },
    { policyMode: "shadow", auditMode: "required" },
    { policyMode: "enforce", auditMode: "best_effort" }
  ]) {
    assert.throws(
      () => createCodexGPTServer(config("full", overrides), dependencies),
      /Policy Kernel enforce|required durable audit/i
    );
  }
  assert.equal(handlerCalls, 0);
});

test("start failure releases the process record, quota reservation, timer, and child handle", async () => {
  let terminateCalls = 0;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "phase4a-cleanup",
    backend: {
      async start() {
        return {
          write: async () => {},
          interrupt: async () => "unsupported",
          resize: async () => {},
          terminate: async () => { terminateCalls += 1; }
        };
      }
    },
    audit: {
      async record() {
        throw new Error("terminal audit unavailable");
      }
    }
  });
  await assert.rejects(manager.start({
    command: { kind: "powershell", script: "Write-Output cleanup", edition: "windows" },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access",
    terminal: "pipes"
  }), /terminal audit unavailable/);
  assert.equal(terminateCalls, 1);
  assert.equal(manager.list().data.process_count, 0);
  await manager.close();
});

test("local approval rejects AppContainer callers and full-access output never claims sandbox or human presence", async () => {
  const nativeControl = await fs.readFile("scripts/windows-local-control.cs", "utf8");
  const runCommandContract = await fs.readFile("test/run-command-contract.test.mjs", "utf8");
  const authority = await fs.readFile("src/process/authority.ts", "utf8");
  const controlClassification = await fs.readFile("scripts/test-domains.mjs", "utf8");
  assert.match(nativeControl, /TokenIsAppContainer/);
  assert.match(nativeControl, /CONTROL_APPCONTAINER_REJECTED/);
  assert.match(controlClassification, /local-control-pipe-windows-control\.test\.mjs/);
  assert.match(runCommandContract, /process_tree_control: "job_object_members_only"/);
  assert.match(runCommandContract, /broker_escape_resistance: "none"/);
  assert.match(authority, /not unforgeable proof of human presence/);
  assert.match(authority, /no broker-escape resistance/);
  assert.doesNotMatch(authority, /sandboxed full.access|guarantees human presence/i);
});

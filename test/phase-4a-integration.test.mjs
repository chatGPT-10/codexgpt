import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const {
  createCodexGPTServer,
  createExecutionFailure,
  loadConfig
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

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => port ? resolve(port) : reject(new Error("No free port available")));
    });
  });
}

function v3Config(toolMode = "full") {
  return withEnv({
    CODEXGPT_TOOL_CONTRACT_VERSION: "3",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce",
    CODEXGPT_TOOL_MODE: toolMode,
    CODEXGPT_EXECUTION_PROFILE: "off",
    CODEXGPT_LOCAL_FILE_ACCESS: "configured_roots"
  }, () => loadConfig([
    "--root", process.cwd(),
    "--allow-root", process.cwd(),
    "--bash", "off",
    "--write", "off"
  ]));
}

function allowDecision(toolName) {
  return {
    schemaVersion: 1,
    decisionId: `decision-${toolName}`,
    outcome: "allow",
    reasonCode: null,
    policyRevision: "policy-phase4a",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: [{
      sourceKind: "permission_profile",
      safeRuleId: "phase4a.integration",
      specificity: [1],
      grantId: null,
      approvalId: null,
      enforcementBackend: null
    }]
  };
}

function dependencies({ handlerCalls, authorizations }) {
  return {
    persistentAuditRuntime: {},
    auditQueryHandlerV3: async () => ({}),
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {
      identity: { credentialRef: "phase4a-integration", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "phase4a-integration"
    },
    toolResourceResolver: {
      describe() {
        return {
          resource: {
            schemaVersion: 1,
            kind: "process",
            fingerprint: `sha256:${"a".repeat(64)}`,
            summary: "phase4a integration"
          }
        };
      }
    },
    policyRuntime: {
      mode: "enforce",
      authorize(toolName) {
        authorizations.push(toolName);
        return { decision: allowDecision(toolName), auditEvent: null };
      },
      audit() {}
    },
    v3ToolHandlers: {
      run_command() {
        handlerCalls.push("run_command");
        const structuredContent = createExecutionFailure("run_command", "HOST_UNAVAILABLE");
        return {
          content: [{ type: "text", text: "bounded integration result" }],
          structuredContent,
          isError: true
        };
      }
    }
  };
}

async function withClient(server, action) {
  const client = new Client({ name: "phase-4a-integration", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await action(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

test("V3 direct and supertool execution traverse one live policy and handler path", async () => {
  const handlerCalls = [];
  const authorizations = [];
  const server = createCodexGPTServer(v3Config(), dependencies({ handlerCalls, authorizations }));
  await withClient(server, async (client) => {
    const args = {
      command: { kind: "powershell", script: "Write-Output integration", edition: "windows" },
      cwd: { kind: "absolute_local", path: process.cwd() },
      mode: "full_access"
    };
    const direct = await client.callTool({ name: "run_command", arguments: args });
    const wrapped = await client.callTool({
      name: "codexgpt",
      arguments: { action: "run_command", args }
    });
    assert.equal(direct.structuredContent.error.code, "HOST_UNAVAILABLE");
    assert.equal(wrapped.structuredContent.error.code, "HOST_UNAVAILABLE");
    assert.deepEqual(handlerCalls, ["run_command", "run_command"]);
    assert.deepEqual(authorizations, ["run_command", "run_command"]);
  });
});

test("V3 process descriptions route finite commands away from persistent processes", async () => {
  const server = createCodexGPTServer(v3Config(), dependencies({ handlerCalls: [], authorizations: [] }));
  await withClient(server, async (client) => {
    const listed = await client.listTools();
    const descriptions = Object.fromEntries(listed.tools.map((tool) => [tool.name, tool.description]));
    assert.equal(
      descriptions.run_command,
      "Run one finite full_access command with bounded retained output. This is ambient authority, not a sandbox. Use when: A bounded command expected to terminate, such as tests, build, lint, or typecheck, must run. Do not use when: A persistent or interactive command must run; use start_process."
    );
    assert.equal(
      descriptions.start_process,
      "Start one owned full_access process with a bounded lifetime. Use ConPTY for terminal-dependent Windows interaction, consume incremental output with next_cursor, and terminate the process when finished. This is ambient authority, not a sandbox. Use when: A persistent or interactive command such as a dev server, watcher, or REPL must run. Do not use when: A bounded command expected to terminate must run; use run_command."
    );
    assert.equal(
      descriptions.read_process_output,
      "Read one bounded incremental output page from a process owned by this transport and identity context. Pass the previous non-null next_cursor to avoid replay. With positive wait_ms and no unread output, an owned record whose output has not reached eof can hold the call for up to 30 seconds until output arrives, process state or lifecycle finalization changes, or the timeout expires. Persistent processes are created only by start_process in full tool mode; an exited, failed, or terminated record can remain eof=false while cleanup finalizes, while eof=true never waits."
    );
  });

  const standardServer = createCodexGPTServer(v3Config("standard"), dependencies({ handlerCalls: [], authorizations: [] }));
  await withClient(standardServer, async (client) => {
    const listed = await client.listTools();
    assert.equal(
      listed.tools.find((tool) => tool.name === "run_command")?.description,
      "Run one finite full_access command with bounded retained output. This is ambient authority, not a sandbox. Use when: A bounded command expected to terminate, such as tests, build, lint, or typecheck, must run. Do not use when: A persistent or interactive command must run; use start_process."
    );
    assert.equal(listed.tools.some((tool) => tool.name === "start_process"), false);
  });
});

test("POSIX command discovery never concatenates argv through shell true", async () => {
  const source = await fs.readFile("scripts/codexgpt.mjs", "utf8");
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.equal(source.match(/spawnSync\('\/bin\/sh', \['-c', 'command -v "\$1"'/g)?.length, 2);
});

test("doctor separates backend, Job, ConPTY, approval, root, full-access, and sandbox evidence", async () => {
  const port = await freePort();
  const result = spawnSync(process.execPath, [
    "scripts/codexgpt.mjs",
    "doctor",
    "--no-profile",
    "--port", String(port),
    "--root", process.cwd(),
    "--tunnel", "none",
    "--bash", "off"
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      CODEXGPT_TOOL_CONTRACT_VERSION: "3",
      CODEXGPT_POLICY_ENGINE: "enforce",
      CODEXGPT_AUDIT_MODE: "required",
      CODEXGPT_EXECUTION_PROFILE: "full_access",
      CODEXGPT_PERMISSION_PROFILE: "ambient",
      CODEXGPT_LOCAL_FILE_ACCESS: "configured_roots"
    }
  });
  const expectedStatus = process.platform === "win32" ? 0 : 1;
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  if (process.platform !== "win32") {
    assert.match(result.stdout, /FAIL Execution backend\s+full_access requires the packaged native Windows host/);
  }
  for (const label of [
    "Execution backend",
    "Job ownership",
    "ConPTY",
    "Approval pipe",
    "Confirmed roots",
    "Full access",
    "Sandbox evidence"
  ]) {
    assert.match(result.stdout, new RegExp(label));
  }
  assert.match(result.stdout, /ambient current-user authority/);
  assert.match(result.stdout, /unavailable; workspace mode must remain fail-closed/);
});

test("production runtime constructs one shared host, execution runtime, manager, and lifecycle audit coordinator", async () => {
  const source = await fs.readFile("src/productionRuntime.ts", "utf8");
  for (const expression of [
    "new WindowsProcessHostRuntime(",
    "new RunCommandRuntimeV3(",
    "new ProcessManagerV3(",
    "new ProcessAuditCoordinatorV3(",
    "new WindowsPersistentProcessBackendV3("
  ]) {
    assert.equal(source.split(expression).length - 1, 1, `${expression} must have one production construction site`);
  }
  assert.match(source, /dependencies\.toolResourceResolver = \{[\s\S]*manager\.describe/);
  assert.match(source, /dependencies\.v3ToolHandlers = \{[\s\S]*manager\.start[\s\S]*manager\.writeResult[\s\S]*manager\.terminateResult/);
  assert.match(source, /read_process_output: async \(args, extra\)[\s\S]*await manager\.readResult\(args, extra\?\.signal\)/);
  assert.match(source, /setProcessControl\(manager\.localControl\(\)\)/);
});

test("direct and supertool wrappers preserve the MCP cancellation signal", async () => {
  const handlerCalls = [];
  const deps = dependencies({ handlerCalls, authorizations: [] });
  const observed = [];
  deps.v3ToolHandlers.read_process_output = (_args, extra) => {
    observed.push(extra);
    const structuredContent = createExecutionFailure("read_process_output", "HOST_UNAVAILABLE");
    return { content: [{ type: "text", text: "cancel signal observed" }], structuredContent, isError: true };
  };
  const server = createCodexGPTServer(v3Config(), deps);
  const controller = new AbortController();
  const rawExtra = {
    signal: controller.signal,
    authInfo: { token: "test-token-must-not-reach-handler" },
    sessionId: "test-session",
    sendRequest: () => { throw new Error("must not be reachable"); }
  };
  const args = { process_id: `process_${"a".repeat(32)}`, wait_ms: 30_000 };
  await server._registeredTools.read_process_output.handler(args, rawExtra);
  await server._registeredTools.codexgpt.handler({ action: "read_process_output", args }, rawExtra);
  assert.equal(observed.length, 2);
  for (const extra of observed) {
    assert.notEqual(extra, rawExtra);
    assert.deepEqual(Object.keys(extra), ["signal"]);
    assert.equal(extra.signal, controller.signal);
    assert.equal(Object.isFrozen(extra), true);
    assert.equal("authInfo" in extra, false);
    assert.equal("sendRequest" in extra, false);
  }
});

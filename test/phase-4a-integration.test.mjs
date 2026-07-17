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
  createCodexProServer,
  createExecutionFailure,
  loadConfig
} = await tsImport("./fixtures/phase-4a-integration-imports.ts", import.meta.url);

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
    CODEXPRO_TOOL_CONTRACT_VERSION: "3",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "required",
    CODEXPRO_POLICY_ENGINE: "enforce",
    CODEXPRO_TOOL_MODE: toolMode,
    CODEXPRO_EXECUTION_PROFILE: "off",
    CODEXPRO_LOCAL_FILE_ACCESS: "configured_roots"
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
  const server = createCodexProServer(v3Config(), dependencies({ handlerCalls, authorizations }));
  await withClient(server, async (client) => {
    const args = {
      command: { kind: "powershell", script: "Write-Output integration", edition: "windows" },
      cwd: { kind: "absolute_local", path: process.cwd() },
      mode: "full_access"
    };
    const direct = await client.callTool({ name: "run_command", arguments: args });
    const wrapped = await client.callTool({
      name: "codexpro",
      arguments: { action: "run_command", args }
    });
    assert.equal(direct.structuredContent.error.code, "HOST_UNAVAILABLE");
    assert.equal(wrapped.structuredContent.error.code, "HOST_UNAVAILABLE");
    assert.deepEqual(handlerCalls, ["run_command", "run_command"]);
    assert.deepEqual(authorizations, ["run_command", "run_command"]);
  });
});

test("doctor separates backend, Job, ConPTY, approval, root, full-access, and sandbox evidence", async () => {
  const port = await freePort();
  const result = spawnSync(process.execPath, [
    "scripts/codexpro.mjs",
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
      CODEXPRO_TOOL_CONTRACT_VERSION: "3",
      CODEXPRO_POLICY_ENGINE: "enforce",
      CODEXPRO_AUDIT_MODE: "required",
      CODEXPRO_EXECUTION_PROFILE: "full_access",
      CODEXPRO_PERMISSION_PROFILE: "ambient",
      CODEXPRO_LOCAL_FILE_ACCESS: "configured_roots"
    }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
  assert.match(source, /setProcessControl\(manager\.localControl\(\)\)/);
});

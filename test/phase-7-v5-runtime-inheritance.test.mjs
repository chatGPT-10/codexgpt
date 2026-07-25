import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createCodexGPTServer } from "../dist/server.js";
import {
  CANONICAL_CODEXGPT_CHILD_TOOLS_V5,
  CODEXGPT_CHILD_OUTPUT_SCHEMAS_V5,
  codexgptOutputSchemaV5
} from "../dist/tools/schemas/codexgpt.js";

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

function v5Config(mode = "standard") {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: undefined,
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
  }, () => loadConfig(["--bash", "off", "--write", "off", "--tool-mode", mode]));
}

function allowDecision(toolName) {
  return {
    schemaVersion: 1,
    decisionId: `decision-${toolName}`,
    outcome: "allow",
    reasonCode: null,
    policyRevision: "policy-v5-contract",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: []
  };
}

async function connect(server, action) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "phase-7-v5-wire", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

function dependencies() {
  const previews = {
    resolve() { throw new Error("not used"); },
    reserve() { throw new Error("not used"); },
    consume() {},
    burn() {},
    invalidatePaths() {}
  };
  return {
    persistentAuditRuntime: { persistAuthorization() {}, persistExecution() {} },
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
    movePathsService: {},
    undoChangeSetService: {},
    gitReadServiceV4: {
      capabilityRevision: "git-v4-test",
      status() { throw new Error("synthetic status failure"); },
      log() { throw new Error("synthetic log failure"); },
      currentBranchName() { return null; }
    },
    policySessionContextSource: {
      identity: { credentialRef: "credential_v5", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "session_v5"
    },
    v4ContractCapabilities: {
      nativeHostIdentityAvailable: true,
      localApprovalAvailable: true,
      gitCapabilityAvailable: true,
      contractV4MigrationAvailable: true
    },
    policyRuntime: {
      mode: "enforce",
      authorize(toolName) {
        return { decision: allowDecision(toolName), auditEvent: null };
      },
      audit() {}
    },
    semanticManagerV5: {
      previews,
      async execute(_workspace, request) {
        return {
          requested_provider: "builtin",
          actual_provider: "builtin-typescript",
          state: "ready",
          capability: request.operation,
          language: "typescript",
          partial: false,
          omitted_count: 0,
          returned_count: 0,
          result_quality: "semantic",
          next_action: "Continue.",
          result: { locations: [] }
        };
      },
      async dispose() {}
    }
  };
}

test("V5 server registers exact V4 inheritance plus semantic in standard/full only", async () => {
  const standardConfig = v5Config("standard");
  standardConfig.writeMode = "workspace";
  const standardServer = createCodexGPTServer(standardConfig, dependencies());
  const standard = standardServer._registeredTools;
  assert.ok(standard.semantic);
  assert.equal(standard.semantic.annotations.readOnlyHint, true);
  assert.equal(standard.semantic.annotations.destructiveHint, false);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS_V5.length, 52);
  assert.equal(Object.keys(CODEXGPT_CHILD_OUTPUT_SCHEMAS_V5).length, 52);

  const result = await standard.semantic.handler({
    operation: "definition",
    locator: { kind: "symbol", symbol: "value" }
  });
  assert.equal(result.structuredContent.ok, true);
  assert.equal(result.structuredContent.data.actual_provider, "builtin-typescript");

  await connect(standardServer, async (client) => {
    const listedTools = (await client.listTools()).tools;
    const descriptor = listedTools.find((tool) => tool.name === "semantic");
    assert.ok(descriptor);
    assert.equal(descriptor.inputSchema.type, "object");
    for (const property of [
      "operation",
      "locator",
      "path",
      "severity",
      "include_declaration",
      "max_results",
      "new_name",
      "max_preview_chars",
      "workspace_id"
    ]) {
      assert.ok(descriptor.inputSchema.properties?.[property], `semantic descriptor must expose ${property}`);
    }
    assert.equal(descriptor.inputSchema.properties.locator.type, "object");
    assert.equal("anyOf" in descriptor.inputSchema.properties.locator, false);
    assert.deepEqual(
      Object.keys(descriptor.inputSchema.properties.locator.properties ?? {}).sort(),
      ["column", "kind", "line", "path", "path_hint", "symbol"]
    );
    assert.equal("pattern" in descriptor.inputSchema.properties.new_name, false);
    assert.equal("outputSchema" in descriptor, false);
    const applyPatchDescriptor = listedTools.find((tool) => tool.name === "apply_patch");
    assert.ok(applyPatchDescriptor);
    assert.equal(applyPatchDescriptor.inputSchema.type, "object");
    for (const property of ["workspace_id", "patch", "expected_files", "semantic_preview_id"]) {
      assert.ok(applyPatchDescriptor.inputSchema.properties?.[property], `apply_patch descriptor must expose ${property}`);
    }

    const opened = await client.callTool({
      name: "open_current_workspace",
      arguments: { include_tree: false, include_skills: false }
    });
    assert.equal(opened.isError, undefined);
    assert.equal(opened.structuredContent.ok, true);
    assert.equal(opened.structuredContent.data.git_status, "Git status unavailable for this workspace.");

    const wireResult = await client.callTool({
      name: "semantic",
      arguments: {
        operation: "definition",
        locator: { kind: "symbol", symbol: "value" }
      }
    });
    assert.equal(wireResult.isError, undefined);
    assert.equal(wireResult.structuredContent.ok, true);
    assert.equal(wireResult.structuredContent.data.actual_provider, "builtin-typescript");
  });

  const listed = await standard.codexgpt.handler({ action: "list_actions" });
  assert.equal(codexgptOutputSchemaV5.safeParse(listed.structuredContent).success, true);
  assert.equal(listed.structuredContent.data.actions.includes("semantic"), true);
  const serverConfig = await standard.server_config.handler({});
  assert.equal(serverConfig.structuredContent.data.toolContractVersion, 5);
  assert.equal(serverConfig.structuredContent.data.semanticProvider, "builtin");
  assert.equal(serverConfig.structuredContent.data.semanticActualProvider, "builtin-typescript");
  await standardServer.close();

  const fullServer = createCodexGPTServer(v5Config("full"), dependencies());
  assert.ok(fullServer._registeredTools.semantic);
  await fullServer.close();
});

test("V5 fails closed when the configured builtin semantic runtime is unavailable", () => {
  const disabled = v5Config("standard");
  disabled.semanticProvider = "none";
  assert.throws(
    () => createCodexGPTServer(disabled, dependencies()),
    /Contract V5 requires the builtin semantic runtime/
  );
});

test("legacy V4 and V5 minimal/connection-test never register semantic", async () => {
  const minimal = v5Config("standard");
  minimal.toolMode = "minimal";
  minimal.semanticMode = "legacy";
  minimal.toolContractVersion = 4;
  const minimalServer = createCodexGPTServer(minimal, dependencies());
  assert.equal(Boolean(minimalServer._registeredTools.semantic), false);
  await minimalServer.close();

  const connection = { ...v5Config("full"), connectionTest: true };
  const connectionServer = createCodexGPTServer(connection, dependencies());
  assert.equal(Boolean(connectionServer._registeredTools.semantic), false);
  await connectionServer.close();
});

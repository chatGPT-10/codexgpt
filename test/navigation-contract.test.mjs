import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  createCodexGPTServer,
  disposeCodexGPTServerLocalState,
  navigationRequestSchema,
  navigationResultSchema,
  semanticInputSchema,
  semanticDataSchema,
  CANONICAL_CODEXGPT_CHILD_TOOLS,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V2,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V3,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V4,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V5,
  resolveCodexGPTAction,
  resolveCodexGPTActionV2,
  resolveCodexGPTActionV3,
  resolveCodexGPTActionV4,
  resolveCodexGPTActionV5,
  loadConfig
} = await tsImport("../fixtures/ts-imports/navigation-contract-imports.ts", import.meta.url);

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

function v5Config() {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: "5",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
  }, () => loadConfig([
    "--root", process.cwd(),
    "--bash", "off",
    "--write", "off",
    "--tool-mode", "standard"
  ]));
}

function allowDecision(toolName) {
  return {
    schemaVersion: 1,
    decisionId: `decision-${toolName}`,
    outcome: "allow",
    reasonCode: null,
    policyRevision: "policy-p3-navigation",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: []
  };
}

function navigationDependencies() {
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
    changeSetOwnerBindingKey: Buffer.alloc(32, 9),
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
      capabilityRevision: "git-p3-navigation",
      status() { throw new Error("not used"); },
      log() { throw new Error("not used"); },
      currentBranchName() { return null; }
    },
    policySessionContextSource: {
      identity: { credentialRef: "credential_p3_navigation", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "session_p3_navigation"
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
          returned_count: 1,
          result_quality: "semantic",
          next_action: "Continue.",
          result: {
            locations: [{
              path: "src/guard.ts",
              range: { start: { line: 120, column: 7 }, end: { line: 120, column: 23 } },
              preview: "export class WorkspaceManager"
            }]
          }
        };
      },
      invalidateWorkspace() {},
      async dispose() {}
    }
  };
}

test("navigation request contract is strict and intent-aware", () => {
  assert.deepEqual(navigationRequestSchema.parse({
    intent: "definition",
    query: "WorkspaceManager",
    path: "src",
    max_results: 20,
    workspace_id: "ws_test"
  }), {
    intent: "definition",
    query: "WorkspaceManager",
    path: "src",
    max_results: 20,
    workspace_id: "ws_test"
  });
  assert.equal(navigationRequestSchema.safeParse({ intent: "definition" }).success, false);
  assert.equal(navigationRequestSchema.safeParse({ intent: "definition", query: "x".repeat(201) }).success, false);
  assert.equal(navigationRequestSchema.safeParse({ intent: "text", query: "x".repeat(500) }).success, true);
  assert.equal(navigationRequestSchema.safeParse({ intent: "diagnostics", query: "x" }).success, false);
  assert.equal(navigationRequestSchema.safeParse({ intent: "diagnostics", path: "src/a.ts" }).success, true);
  assert.equal(navigationRequestSchema.safeParse({ intent: "text", query: "x", unknown: true }).success, false);
});

test("semantic contract accepts additive navigate input and strict normalized output", () => {
  const input = semanticInputSchema.parse({
    operation: "navigate",
    intent: "references",
    query: "WorkspaceManager",
    path: "src"
  });
  assert.equal(input.operation, "navigate");

  const result = navigationResultSchema.parse({
    intent: "references",
    query: "WorkspaceManager",
    matches: [{
      path: "src/guard.ts",
      line: 120,
      column: 7,
      kind: "references",
      symbol: "WorkspaceManager",
      preview: "new WorkspaceManager(config)"
    }],
    provider: "builtin-typescript",
    quality: "semantic",
    fallback: false,
    truncated: false
  });
  const data = semanticDataSchema.parse({
    requested_provider: "builtin",
    actual_provider: "builtin-typescript",
    state: "ready",
    capability: "navigate",
    language: "typescript",
    partial: false,
    omitted_count: 0,
    returned_count: 1,
    result_quality: "semantic",
    next_action: "Read the exact returned range.",
    result
  });
  assert.equal(data.result.provider, "builtin-typescript");
  assert.equal(navigationResultSchema.safeParse({ ...result, fallback: true }).success, false);
  assert.equal(navigationResultSchema.safeParse({ ...result, unknown: true }).success, false);
});

test("navigate_code is a V5-only alias and direct tool counts remain exact", () => {
  assert.equal(resolveCodexGPTAction("navigate_code"), null);
  assert.equal(resolveCodexGPTActionV2("navigate_code"), null);
  assert.equal(resolveCodexGPTActionV3("navigate_code"), null);
  assert.equal(resolveCodexGPTActionV4("navigate_code"), null);
  assert.equal(resolveCodexGPTActionV5("navigate_code"), "semantic");
  assert.deepEqual([
    CANONICAL_CODEXGPT_CHILD_TOOLS.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V2.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V3.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V4.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V5.length
  ], [28, 31, 39, 51, 52]);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS_V5.includes("navigate_code"), false);
});

test("direct navigate and V5 navigate_code alias traverse the registered semantic handler", async () => {
  const server = createCodexGPTServer(v5Config(), navigationDependencies());
  try {
    const direct = await server._registeredTools.semantic.handler({
      operation: "navigate",
      intent: "definition",
      query: "WorkspaceManager",
      path: "src"
    });
    assert.equal(direct.structuredContent.ok, true);
    assert.equal(direct.structuredContent.data.capability, "navigate");
    assert.equal(direct.structuredContent.data.result.provider, "builtin-typescript");
    assert.equal(direct.structuredContent.data.result.matches[0].path, "src/guard.ts");

    const wrapped = await server._registeredTools.codexgpt.handler({
      action: "navigate_code",
      args: {
        intent: "definition",
        query: "WorkspaceManager",
        path: "src"
      }
    });
    assert.equal(wrapped.structuredContent.ok, true);
    assert.equal(wrapped.structuredContent.codexgpt_super_action, "navigate_code");
    assert.equal(wrapped.structuredContent.wrapped_tool, "semantic");
    assert.equal(wrapped.structuredContent.data.result.quality, "semantic");

    const rejected = await server._registeredTools.codexgpt.handler({
      action: "navigate_code",
      args: {
        operation: "rename_preview",
        locator: { kind: "symbol", symbol: "WorkspaceManager" },
        new_name: "Renamed"
      }
    });
    assert.equal(rejected.isError, true);
    assert.equal(rejected.structuredContent.error.code, "ACTION_ARGUMENTS_INVALID");
  } finally {
    await disposeCodexGPTServerLocalState(server);
  }
});

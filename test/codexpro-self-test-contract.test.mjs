import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport(
  "../src/tools/schemas/codexproSelfTest.ts",
  import.meta.url
).catch(() => null);

const {
  CODEXPRO_SELF_TEST_CHECK_NAMES,
  CODEXPRO_SELF_TEST_ERROR_MESSAGES,
  CODEXPRO_SELF_TEST_FAILED_WARNING,
  CODEXPRO_SELF_TEST_SKIPPED_WARNING,
  CODEXPRO_SELF_TEST_WARNED_WARNING,
  codexproSelfTestOutputSchema,
  createCodexProSelfTestFailure,
  createCodexProSelfTestSuccess
} = schemaModule ?? {};

const DATA_KEYS = [
  "bash_mode",
  "bash_session_guard",
  "checks",
  "counts",
  "expected_tools",
  "files_touched",
  "git",
  "http_auth",
  "inventory",
  "missing_tools",
  "probe_artifact",
  "registered_tools",
  "request",
  "root",
  "status",
  "terms_boundary",
  "tool_mode",
  "tool_set_matches",
  "unexpected_tools",
  "workspace_id",
  "write_mode"
].sort();

const CHECK_NAMES = [
  "workspace",
  "tool_mode",
  "write_mode",
  "bash_mode",
  "http_auth",
  "registered_tool_set",
  "inventory",
  "git_status",
  "write_edit_probe",
  "selected_only_pro_context",
  "bash_policy",
  "terms_boundary"
];

const ERROR_CODES = [
  "INTERNAL_ERROR",
  "SELF_TEST_EXECUTION_FAILED",
  "WORKSPACE_NOT_FOUND"
].sort();

const FIXED_ARTIFACT = ".ai-bridge/codexpro-self-test.md";

function createTestConfig(root, overrides = {}) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: "test-placeholder-token",
    requireHttpToken: true,
    allowedHosts: ["127.0.0.1:8787"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(root, "codex-history"),
    writeMode: "workspace",
    toolMode: "standard",
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge",
    toolCards: true,
    connectionTest: false,
    analysisEnabled: true,
    analysisLimits: {
      maxInventoryFiles: 20_000,
      maxAnalyzedFiles: 5_000,
      maxScannedBytes: 67_108_864,
      maxSymbols: 100_000,
      maxRelationships: 250_000
    },
    ...overrides
  };
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-self-test-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "codexpro-self-test-contract", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function callSelfTest(client, args = {}) {
  return client.callTool({ name: "codexpro_self_test", arguments: args });
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function parseResult(result) {
  assert.equal(typeof codexproSelfTestOutputSchema?.parse, "function");
  return codexproSelfTestOutputSchema.parse(result.structuredContent);
}

function termsBoundary() {
  return {
    local_workspace_bridge: true,
    provides_models: false,
    proxies_model_access: false,
    bypasses_quotas: false,
    remote_agent_execution: false
  };
}

function requestDefaults(overrides = {}) {
  return {
    write_probe: true,
    bash_probe: true,
    pro_context_probe: true,
    include_global_skills: true,
    max_skills: 40,
    ...overrides
  };
}

function sampleProviderResult(root, overrides = {}) {
  const expected = overrides.expected_tools ?? ["codexpro_self_test", "server_config"];
  const registered = overrides.registered_tools ?? ["codexpro_self_test", "server_config"];
  return {
    workspace_id: "ws_test",
    root,
    tool_mode: "standard",
    write_mode: "workspace",
    bash_mode: "off",
    bash_session_guard: { required: false, configured: false },
    http_auth: { enabled: true, required_for_public_access: true },
    request: requestDefaults(),
    expected_tools: [...expected],
    registered_tools: [...registered],
    inventory: {
      outcome: "pass",
      reason_code: null,
      skill_count: 0,
      mcp_server_count: 0,
      skills_truncated: false,
      mcp_servers_truncated: false
    },
    git: { repository_state: "clean", changed_entries: 0 },
    write_probe: {
      outcome: "pass",
      reason_code: "WRITE_EDIT_PROBE_PASSED",
      probe_artifact: FIXED_ARTIFACT,
      files_touched: [FIXED_ARTIFACT]
    },
    pro_context_probe: {
      outcome: "pass",
      reason_code: "PRO_CONTEXT_PROBE_PASSED"
    },
    bash_policy_probe: {
      outcome: "skipped",
      reason_code: "BASH_POLICY_UNAVAILABLE"
    },
    terms_boundary: termsBoundary(),
    ...overrides
  };
}

function sampleChecks(overrides = {}) {
  const byName = {
    workspace: ["pass", "WORKSPACE_READY", "Workspace access is available."],
    tool_mode: ["pass", "TOOL_MODE_VALID", "Tool mode is standard."],
    write_mode: ["pass", "WRITE_MODE_VALID", "Write mode is workspace."],
    bash_mode: ["pass", "BASH_MODE_VALID", "Bash mode is off."],
    http_auth: ["pass", "HTTP_AUTH_ENABLED", "HTTP authentication is enabled."],
    registered_tool_set: ["pass", "TOOL_SET_MATCH", "Expected and registered tool sets match."],
    inventory: ["pass", "INVENTORY_READY", "Inventory inspected 0 Skills and 0 MCP servers."],
    git_status: ["pass", "GIT_CLEAN", "The workspace Git state is clean."],
    write_edit_probe: ["pass", "WRITE_EDIT_PROBE_PASSED", "The fixed write/edit probe passed."],
    selected_only_pro_context: ["pass", "PRO_CONTEXT_PROBE_PASSED", "The selected-only Pro context probe passed."],
    bash_policy: ["skipped", "BASH_POLICY_UNAVAILABLE", "The Bash policy probe was unavailable in Bash-off mode."],
    terms_boundary: ["pass", "TERMS_BOUNDARY_VALID", "The local workspace bridge terms boundary is intact."]
  };
  for (const [name, value] of Object.entries(overrides)) byName[name] = value;
  return CHECK_NAMES.map((name) => ({
    name,
    status: byName[name][0],
    code: byName[name][1],
    message: byName[name][2]
  }));
}

function sampleData(root, overrides = {}) {
  const checks = overrides.checks ?? sampleChecks();
  const counts = {
    total: 12,
    passed: checks.filter((item) => item.status === "pass").length,
    warned: checks.filter((item) => item.status === "warn").length,
    failed: checks.filter((item) => item.status === "fail").length,
    skipped: checks.filter((item) => item.status === "skipped").length
  };
  return {
    workspace_id: "ws_test",
    root,
    status: counts.failed ? "fail" : counts.warned || counts.skipped ? "warn" : "pass",
    counts,
    tool_mode: "standard",
    write_mode: "workspace",
    bash_mode: "off",
    bash_session_guard: { required: false, configured: false },
    http_auth: { enabled: true, required_for_public_access: true },
    request: requestDefaults(),
    expected_tools: ["codexpro_self_test", "server_config"],
    registered_tools: ["codexpro_self_test", "server_config"],
    missing_tools: [],
    unexpected_tools: [],
    tool_set_matches: true,
    inventory: {
      skill_count: 0,
      mcp_server_count: 0,
      skills_truncated: false,
      mcp_servers_truncated: false
    },
    git: { repository_state: "clean", changed_entries: 0 },
    probe_artifact: FIXED_ARTIFACT,
    files_touched: [FIXED_ARTIFACT],
    checks,
    terms_boundary: termsBoundary(),
    ...overrides
  };
}

function assertFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: CODEXPRO_SELF_TEST_ERROR_MESSAGES[code],
    retryable: code === "SELF_TEST_EXECUTION_FAILED",
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp("Code: " + code));
  return parsed;
}

test("codexpro_self_test schema exports the exact six-field envelope and twenty-one-field data", async () => {
  await withTempWorkspace(async (root) => {
    assert.deepEqual(CODEXPRO_SELF_TEST_CHECK_NAMES, CHECK_NAMES);
    assert.deepEqual(Object.keys(CODEXPRO_SELF_TEST_ERROR_MESSAGES ?? {}).sort(), ERROR_CODES);
    assert.equal(typeof createCodexProSelfTestSuccess, "function");
    assert.equal(typeof createCodexProSelfTestFailure, "function");

    const success = createCodexProSelfTestSuccess(sampleData(root), 7);
    assert.deepEqual(Object.keys(success).sort(), [
      "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
    ]);
    assert.equal(success.codexpro_tool, "codexpro_self_test");
    assert.equal(success.codexpro_title, "CodexPro Self Test");
    assert.equal(success.ok, true);
    assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
    assert.deepEqual(success.data.checks.map((item) => item.name), CHECK_NAMES);
    assert.deepEqual(success.data.counts, {
      total: 12,
      passed: 11,
      warned: 0,
      failed: 0,
      skipped: 1
    });
    assert.deepEqual(success.meta, {
      schemaVersion: 1,
      durationMs: 7,
      warnings: [CODEXPRO_SELF_TEST_SKIPPED_WARNING]
    });
  });
});

test("codexpro_self_test schema derives exact warning order and keeps failed diagnostics successful", async () => {
  await withTempWorkspace(async (root) => {
    const checks = sampleChecks({
      registered_tool_set: ["fail", "TOOL_SET_MISMATCH", "Expected and registered tool sets differ."],
      inventory: ["warn", "INVENTORY_TRUNCATED", "Inventory results reached a configured limit."],
      bash_policy: ["skipped", "BASH_POLICY_DISABLED", "The Bash policy probe was disabled by request."]
    });
    const data = sampleData(root, {
      status: "fail",
      checks,
      counts: { total: 12, passed: 9, warned: 1, failed: 1, skipped: 1 },
      expected_tools: ["codexpro_self_test", "server_config"],
      registered_tools: ["codexpro_self_test"],
      missing_tools: ["server_config"],
      unexpected_tools: [],
      tool_set_matches: false,
      inventory: {
        skill_count: 40,
        mcp_server_count: 0,
        skills_truncated: true,
        mcp_servers_truncated: false
      }
    });
    const result = createCodexProSelfTestSuccess(data);
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "fail");
    assert.equal(result.error, null);
    assert.deepEqual(result.meta.warnings, [
      CODEXPRO_SELF_TEST_FAILED_WARNING,
      CODEXPRO_SELF_TEST_WARNED_WARNING,
      CODEXPRO_SELF_TEST_SKIPPED_WARNING
    ]);
  });
});

test("codexpro_self_test schema rejects cross-field, tool-set, path, terms, check, and secret drift", async () => {
  await withTempWorkspace(async (root) => {
    const mutations = [
      (data) => { data.counts.total = 11; },
      (data) => { data.counts.passed -= 1; },
      (data) => { data.status = "pass"; },
      (data) => { data.expected_tools.reverse(); },
      (data) => { data.expected_tools.push("server_config"); },
      (data) => { data.missing_tools = ["server_config"]; },
      (data) => { data.tool_set_matches = false; },
      (data) => { data.files_touched = ["src/server.ts"]; },
      (data) => { data.probe_artifact = "src/server.ts"; },
      (data) => { data.request.write_probe = false; },
      (data) => { data.git.repository_state = "changed"; },
      (data) => { data.bash_session_guard.required = true; },
      (data) => { data.terms_boundary.provides_models = true; },
      (data) => { data.inventory.skills_truncated = true; data.inventory.skill_count = 1; },
      (data) => { data.checks[0].name = "tool_mode"; },
      (data) => { data.checks[5].status = "pass"; data.checks[5].code = "TOOL_SET_MISMATCH"; },
      (data) => { data.checks[0].message = "bad\u0000message"; },
      (data) => { data.checks[0].message = "Bearer secret-placeholder"; },
      (data) => { data.extra = true; }
    ];
    for (const mutate of mutations) {
      const data = structuredClone(sampleData(root));
      mutate(data);
      assert.throws(() => createCodexProSelfTestSuccess(data));
    }
  });
});

test("codexpro_self_test schema exposes exactly three stable failures", () => {
  const cases = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing" }, false],
    ["WORKSPACE_NOT_FOUND", { source: "default_workspace", workspace_id: null }, false],
    ["SELF_TEST_EXECUTION_FAILED", {}, true],
    ["INTERNAL_ERROR", {}, false]
  ];
  for (const [code, details, retryable] of cases) {
    const result = createCodexProSelfTestFailure({ code, details }, 3);
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
    assert.deepEqual(result.error, {
      code,
      message: CODEXPRO_SELF_TEST_ERROR_MESSAGES[code],
      retryable,
      details
    });
    assert.deepEqual(result.meta, { schemaVersion: 1, durationMs: 3, warnings: [] });
  }
});

test("codexpro_self_test remains visible in every tool mode and advertises exact inputs, output, and annotations", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "codexpro_self_test");
        assert.ok(descriptor, toolMode);
        assert.equal(descriptor.inputSchema.properties.max_skills.minimum, 1);
        assert.equal(descriptor.inputSchema.properties.max_skills.maximum, 120);
        for (const name of [
          "workspace_id", "write_probe", "bash_probe", "pro_context_probe",
          "include_global_skills", "max_skills"
        ]) {
          assert.ok(descriptor.inputSchema.properties[name], name);
        }
        assert.deepEqual(descriptor.outputSchema.required.sort(), [
          "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
        ]);
        assert.equal(descriptor.annotations?.readOnlyHint, false);
        assert.equal(descriptor.annotations?.destructiveHint, false);
        assert.equal(descriptor.annotations?.idempotentHint, true);
        assert.equal(descriptor.annotations?.openWorldHint, false);
        assert.match(descriptor.description, /local diagnostics only/i);
        assert.match(descriptor.description, /\.ai-bridge\/codexpro-self-test\.md/);
        assert.match(descriptor.description, /does not execute agents/i);
      });
    }
  });
});

test("codexpro_self_test normalizes defaults before one Provider call and derives exact public data", async () => {
  await withTempWorkspace(async (root) => {
    let calls = 0;
    let observedContext;
    await withConfigClient(createTestConfig(root), {
      codexproSelfTestProvider: async (context) => {
        calls += 1;
        observedContext = context;
        return sampleProviderResult(root, {
          workspace_id: context.workspace.id,
          root: context.workspace.root,
          tool_mode: context.config.toolMode,
          write_mode: context.config.writeMode,
          bash_mode: context.config.bashMode,
          bash_session_guard: {
            required: context.config.requireBashSession,
            configured: Boolean(context.config.bashSessionId)
          },
          http_auth: {
            enabled: Boolean(context.config.authToken),
            required_for_public_access: true
          },
          request: context.request,
          expected_tools: context.expectedTools,
          registered_tools: context.registeredTools
        });
      }
    }, async (client) => {
      const result = await callSelfTest(client, {});
      const parsed = parseResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(calls, 1);
      assert.deepEqual(observedContext.request, requestDefaults());
      assert.notEqual(observedContext.expectedTools, observedContext.registeredTools);
      assert.equal(parsed.ok, true);
      assert.deepEqual(Object.keys(parsed.data).sort(), DATA_KEYS);
      assert.deepEqual(parsed.data.request, requestDefaults());
      assert.deepEqual(parsed.data.checks.map((item) => item.name), CHECK_NAMES);
      assert.equal(parsed.data.counts.total, 12);
      assert.equal(parsed.data.probe_artifact, FIXED_ARTIFACT);
      assert.deepEqual(parsed.data.files_touched, [FIXED_ARTIFACT]);
      assert.doesNotMatch(resultText(result), /test-placeholder-token|bash_session_id|Skill name|MCP server name/i);
      assert.ok(resultText(result).length < 5000);
    });
  });
});

test("codexpro_self_test derives missing and unexpected tools from independent observations", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      codexproSelfTestProvider: async (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: ["codexpro_self_test", "server_config", "tree"],
        registered_tools: ["codexpro_self_test", "search", "server_config"]
      })
    }, async (client) => {
      const parsed = parseResult(await callSelfTest(client, {
        write_probe: true,
        bash_probe: true,
        pro_context_probe: true,
        include_global_skills: true,
        max_skills: 40
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.status, "fail");
      assert.equal(parsed.data.tool_set_matches, false);
      assert.deepEqual(parsed.data.missing_tools, ["tree"]);
      assert.deepEqual(parsed.data.unexpected_tools, ["search"]);
      assert.equal(parsed.data.checks[5].name, "registered_tool_set");
      assert.equal(parsed.data.checks[5].status, "fail");
      assert.equal(parsed.data.counts.failed, 1);
      assert.equal(parsed.error, null);
    });
  });
});

test("codexpro_self_test maps workspace absence, Provider failure, and Provider drift to stable failures", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertFailure(
        await callSelfTest(client, { workspace_id: "missing-workspace" }),
        "WORKSPACE_NOT_FOUND",
        { source: "workspace_id", workspace_id: "missing-workspace" }
      );
    });

    await withConfigClient(createTestConfig(root), {
      codexproSelfTestProvider: async () => {
        throw new Error("raw provider secret test-placeholder-token");
      }
    }, async (client) => {
      const failed = await callSelfTest(client, { write_probe: false });
      assertFailure(failed, "SELF_TEST_EXECUTION_FAILED", {});
      assert.doesNotMatch(resultText(failed), /raw provider|test-placeholder-token/);
    });

    await withConfigClient(createTestConfig(root), {
      codexproSelfTestProvider: async (context) => ({
        ...sampleProviderResult(root, {
          workspace_id: context.workspace.id,
          root: context.workspace.root,
          tool_mode: context.config.toolMode,
          write_mode: context.config.writeMode,
          bash_mode: context.config.bashMode,
          request: context.request,
          expected_tools: context.expectedTools,
          registered_tools: context.registeredTools
        }),
        terms_boundary: { ...termsBoundary(), provides_models: true }
      })
    }, async (client) => {
      assertFailure(await callSelfTest(client), "INTERNAL_ERROR", {});
    });
  });
});

test("codexpro_self_test rejects aliased, duplicate, unsorted, identity, and secret-shaped Provider facts", async () => {
  await withTempWorkspace(async (root) => {
    const variants = [
      (context) => {
        const shared = ["codexpro_self_test", "server_config"];
        const result = sampleProviderResult(root, {
          workspace_id: context.workspace.id,
          root: context.workspace.root,
          tool_mode: context.config.toolMode,
          write_mode: context.config.writeMode,
          bash_mode: context.config.bashMode,
          request: context.request
        });
        result.expected_tools = shared;
        result.registered_tools = shared;
        return result;
      },
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: ["server_config", "codexpro_self_test"],
        registered_tools: context.registeredTools
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: ["codexpro_self_test", "codexpro_self_test"],
        registered_tools: context.registeredTools
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: root + path.sep,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: context.expectedTools,
        registered_tools: context.registeredTools
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: ["Bearer-secret-placeholder"],
        registered_tools: context.registeredTools
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: context.expectedTools,
        registered_tools: context.registeredTools,
        inventory: {
          outcome: "pass",
          reason_code: "INVENTORY_TRUNCATED",
          skill_count: context.request.max_skills,
          mcp_server_count: 0,
          skills_truncated: true,
          mcp_servers_truncated: false
        }
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: context.expectedTools,
        registered_tools: context.registeredTools,
        write_probe: {
          outcome: "pass",
          reason_code: "WRITE_EDIT_PROBE_CONFLICT",
          probe_artifact: FIXED_ARTIFACT,
          files_touched: [FIXED_ARTIFACT]
        }
      }),
      (context) => sampleProviderResult(root, {
        workspace_id: context.workspace.id,
        root: context.workspace.root,
        tool_mode: context.config.toolMode,
        write_mode: context.config.writeMode,
        bash_mode: context.config.bashMode,
        request: context.request,
        expected_tools: context.expectedTools,
        registered_tools: context.registeredTools,
        bash_policy_probe: {
          outcome: "pass",
          reason_code: "BASH_POLICY_FULL"
        }
      })
    ];

    for (const variant of variants) {
      await withConfigClient(createTestConfig(root), {
        codexproSelfTestProvider: async (context) => variant(context)
      }, async (client) => {
        assertFailure(await callSelfTest(client), "INTERNAL_ERROR", {});
      });
    }
  });
});

test("codexpro_self_test makes disabled probes explicit skipped outcomes across write and Bash modes", async () => {
  await withTempWorkspace(async (root) => {
    for (const [writeMode, bashMode] of [
      ["off", "off"],
      ["handoff", "safe"],
      ["workspace", "full"]
    ]) {
      await withConfigClient(createTestConfig(root, {
        writeMode,
        bashMode,
        bashSessionId: bashMode === "off" ? undefined : "guarded-session",
        requireBashSession: bashMode !== "off"
      }), {
        codexproSelfTestProvider: async (context) => sampleProviderResult(root, {
          workspace_id: context.workspace.id,
          root: context.workspace.root,
          tool_mode: context.config.toolMode,
          write_mode: context.config.writeMode,
          bash_mode: context.config.bashMode,
          bash_session_guard: {
            required: context.config.requireBashSession,
            configured: Boolean(context.config.bashSessionId)
          },
          request: context.request,
          expected_tools: context.expectedTools,
          registered_tools: context.registeredTools,
          write_probe: {
            outcome: "skipped",
            reason_code: "WRITE_EDIT_PROBE_DISABLED",
            probe_artifact: null,
            files_touched: []
          },
          pro_context_probe: {
            outcome: "skipped",
            reason_code: "PRO_CONTEXT_PROBE_DISABLED"
          },
          bash_policy_probe: {
            outcome: "skipped",
            reason_code: "BASH_POLICY_DISABLED"
          }
        })
      }, async (client) => {
        const parsed = parseResult(await callSelfTest(client, {
          write_probe: false,
          bash_probe: false,
          pro_context_probe: false,
          include_global_skills: false,
          max_skills: 1
        }));
        assert.equal(parsed.ok, true);
        assert.deepEqual(parsed.data.request, requestDefaults({
          write_probe: false,
          bash_probe: false,
          pro_context_probe: false,
          include_global_skills: false,
          max_skills: 1
        }));
        assert.equal(parsed.data.probe_artifact, null);
        assert.deepEqual(parsed.data.files_touched, []);
        assert.equal(parsed.data.checks[8].status, "skipped");
        assert.equal(parsed.data.checks[9].status, "skipped");
        assert.equal(parsed.data.checks[10].status, "skipped");
        assert.equal(parsed.data.counts.skipped, 3);
        assert.equal(parsed.data.status, bashMode === "full" ? "warn" : "warn");
        assert.equal(Object.hasOwn(parsed.data, "bash_session_id"), false);
      });
    }
  });
});

test("codexpro_self_test production probe writes, edits, and verifies only the fixed artifact", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { bashMode: "off" }), {}, async (client) => {
      const parsed = parseResult(await callSelfTest(client, {
        write_probe: true,
        bash_probe: false,
        pro_context_probe: false,
        include_global_skills: false,
        max_skills: 1
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.checks[8].name, "write_edit_probe");
      assert.equal(parsed.data.checks[8].status, "pass");
      assert.equal(parsed.data.checks[8].code, "WRITE_EDIT_PROBE_PASSED");
      assert.equal(parsed.data.probe_artifact, FIXED_ARTIFACT);
      assert.deepEqual(parsed.data.files_touched, [FIXED_ARTIFACT]);
      assert.equal(
        await fs.readFile(path.join(root, FIXED_ARTIFACT), "utf8"),
        "# CodexPro Self Test\n\nThis file is managed by CodexPro's local self-test.\nmarker: after\n"
      );
    });
  });
});

test("codexpro_self_test production probe migrates only the recognized legacy artifact", async () => {
  await withTempWorkspace(async (root) => {
    const artifact = path.join(root, FIXED_ARTIFACT);
    await fs.mkdir(path.dirname(artifact), { recursive: true });
    await fs.writeFile(
      artifact,
      [
        "# CodexPro Self Test",
        "",
        "Updated: 2026-07-14T04:09:39.294Z",
        `Workspace: ${root}`,
        "marker: after",
        ""
      ].join("\n"),
      "utf8"
    );

    await withConfigClient(createTestConfig(root, { bashMode: "off" }), {}, async (client) => {
      const parsed = parseResult(await callSelfTest(client, {
        write_probe: true,
        bash_probe: false,
        pro_context_probe: false,
        include_global_skills: false,
        max_skills: 1
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.checks[8].status, "pass");
      assert.equal(parsed.data.checks[8].code, "WRITE_EDIT_PROBE_PASSED");
      assert.equal(
        await fs.readFile(artifact, "utf8"),
        "# CodexPro Self Test\n\nThis file is managed by CodexPro's local self-test.\nmarker: after\n"
      );
    });
  });
});

test("codexpro_self_test production probe refuses unrelated pre-existing artifact content", async () => {
  await withTempWorkspace(async (root) => {
    const artifact = path.join(root, ".ai-bridge", "codexpro-self-test.md");
    await fs.mkdir(path.dirname(artifact), { recursive: true });
    await fs.writeFile(artifact, "# User notes\n\nDo not overwrite this file.\n", "utf8");

    await withConfigClient(createTestConfig(root, { bashMode: "off" }), {}, async (client) => {
      const parsed = parseResult(await callSelfTest(client, {
        write_probe: true,
        bash_probe: false,
        pro_context_probe: false,
        include_global_skills: false,
        max_skills: 1
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.status, "fail");
      assert.equal(parsed.data.checks[8].name, "write_edit_probe");
      assert.equal(parsed.data.checks[8].status, "fail");
      assert.equal(parsed.data.checks[8].code, "WRITE_EDIT_PROBE_CONFLICT");
      assert.equal(parsed.data.probe_artifact, null);
      assert.deepEqual(parsed.data.files_touched, []);
      assert.equal(await fs.readFile(artifact, "utf8"), "# User notes\n\nDo not overwrite this file.\n");
    });
  });
});

test("codexpro_self_test Tool Card is nested-only, bounded, failure-aware, and renders all four counts", () => {
  assert.match(toolCardWidgetHtml, /function selfTestResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "codexpro_self_test"/);
  assert.match(toolCardWidgetHtml, /selfTestResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /summaryItem\("Skipped"/);
  assert.match(toolCardWidgetHtml, /missing_tools/);
  assert.match(toolCardWidgetHtml, /unexpected_tools/);
  assert.match(toolCardWidgetHtml, /probe_artifact/);
  assert.doesNotMatch(toolCardWidgetHtml, /const checks = Array\.isArray\(data\.checks\)/);
  assert.doesNotMatch(toolCardWidgetHtml, /check\?\.detail/);
});

test("codexpro_self_test maintained consumers use nested data without editing protected Smoke sources", async () => {
  const compat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  const smoke = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const httpSmoke = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");

  for (const fragment of [
    "selfTest.structuredContent.data?.status",
    "selfTest.structuredContent.data?.expected_tools",
    "selfTest.structuredContent.data?.registered_tools",
    "selfTest.structuredContent.data?.files_touched",
    "handoffSelfTest.structuredContent.data?.status",
    "disabledSelfTest.structuredContent.data?.status",
    "guardedSelfTest.structuredContent.data?.checks"
  ]) {
    assert.match(compat, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(stress, /structuredContent\.data\?\.status/);
  assert.match(stress, /structuredContent\.data\?\.checks/);
  assert.match(smoke, /selfTest\.structuredContent\.status/);
  assert.match(httpSmoke, /codexpro_self_test/);
});

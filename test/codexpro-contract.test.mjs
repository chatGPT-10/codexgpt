import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { upgradeCodexProSupertool } = await tsImport("../src/codexproSupertool.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/codexpro.ts", import.meta.url).catch(() => null);

const {
  CANONICAL_CODEXPRO_CHILD_TOOLS,
  CODEXPRO_ACTION_ALIASES,
  CODEXPRO_ERROR_MESSAGES,
  codexproOutputSchema,
  codexproOutputShape,
  createCodexProFailure,
  createCodexProListActionsSuccess,
  resolveCodexProAction,
  wrapCodexProChildResult
} = schemaModule ?? {};

function createTestConfig(root, overrides = {}) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: undefined,
    requireHttpToken: false,
    allowedHosts: ["127.0.0.1:8787"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(root, ".codex-test"),
    writeMode: "workspace",
    toolMode: "full",
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge",
    toolCards: false,
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

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "codexpro-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-contract-"));
  const root = await fs.realpath(created);
  try {
    await fs.writeFile(path.join(root, "demo.txt"), "alpha\nbeta\n", "utf8");
    return await callback(root, created);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function parseCodexPro(result) {
  assert.equal(typeof codexproOutputSchema?.parse, "function");
  return codexproOutputSchema.parse(result.structuredContent);
}

function assertWrapperFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseCodexPro(result);
  assert.equal(parsed.codexpro_tool, "codexpro");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: CODEXPRO_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(code));
  assert.ok(!resultText(result).includes("ZodError"));
  assert.ok(!resultText(result).includes("TypeError"));
}

const EXPECTED_ALIASES = Object.freeze({
  open: "open_current_workspace",
  snapshot: "workspace_snapshot",
  changes: "show_changes",
  inventory: "codexpro_inventory",
  handoff_poll: "wait_for_handoff",
  pro_export: "export_pro_context",
  agent_handoff: "handoff_to_agent",
  codex_handoff: "handoff_to_codex"
});

test("codexpro module exposes the exact closed wrapper API", () => {
  assert.ok(schemaModule);
  assert.equal(typeof codexproOutputSchema?.parse, "function");
  assert.equal(typeof codexproOutputShape, "object");
  assert.equal(typeof createCodexProListActionsSuccess, "function");
  assert.equal(typeof createCodexProFailure, "function");
  assert.equal(typeof resolveCodexProAction, "function");
  assert.equal(typeof wrapCodexProChildResult, "function");
  assert.deepEqual(CODEXPRO_ACTION_ALIASES, EXPECTED_ALIASES);
  assert.equal(Array.isArray(CANONICAL_CODEXPRO_CHILD_TOOLS), true);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS.length, 27);
  assert.equal(new Set(CANONICAL_CODEXPRO_CHILD_TOOLS).size, 27);
  assert.ok(!CANONICAL_CODEXPRO_CHILD_TOOLS.includes("codexpro"));
});

test("codexpro upgrade safely skips the connection-test surface but rejects a corrupt registration", () => {
  assert.doesNotThrow(() => upgradeCodexProSupertool({ _registeredTools: {} }));
  assert.throws(
    () => upgradeCodexProSupertool({ _registeredTools: { codexpro: { handler: null } } }),
    /registration is unavailable/
  );
});

test("codexpro list_actions excludes registered entries that are explicitly disabled", async () => {
  const fakeServer = {
    _registeredTools: {
      codexpro: {
        inputSchema: z.object({ action: z.string(), args: z.record(z.unknown()).optional() }).strict(),
        annotations: {},
        enabled: true,
        handler: async () => ({ structuredContent: {} })
      },
      read: {
        inputSchema: z.object({}).strict(),
        enabled: false,
        handler: async () => ({ structuredContent: {} })
      }
    }
  };
  upgradeCodexProSupertool(fakeServer);
  const result = await fakeServer._registeredTools.codexpro.handler({ action: "list_actions" });
  assert.deepEqual(result.structuredContent.data.actions, []);
  assert.equal(result.structuredContent.data.action_count, 0);
});

test("codexpro dispatch invokes the registered target handler rather than the legacy wrapper", async () => {
  let legacyCalls = 0;
  let targetCalls = 0;
  const childResult = {
    content: [{ type: "text", text: "server config child" }],
    structuredContent: {
      codexpro_tool: "server_config",
      codexpro_title: "Server Config",
      ok: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "Configuration could not be read.",
        retryable: false,
        details: {}
      },
      meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
    },
    isError: true
  };
  const fakeServer = {
    _registeredTools: {
      codexpro: {
        inputSchema: z.object({ action: z.string(), args: z.record(z.unknown()).optional() }).strict(),
        annotations: {},
        enabled: true,
        handler: async () => {
          legacyCalls += 1;
          throw new Error("legacy wrapper must not be called");
        }
      },
      server_config: {
        inputSchema: z.object({}).strict(),
        enabled: true,
        handler: async () => {
          targetCalls += 1;
          return childResult;
        }
      }
    }
  };

  upgradeCodexProSupertool(fakeServer);
  const result = await fakeServer._registeredTools.codexpro.handler({
    action: "server_config",
    args: {}
  });

  assert.equal(legacyCalls, 0);
  assert.equal(targetCalls, 1);
  assert.deepEqual(result.content, childResult.content);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.codexpro_tool, "server_config");
  assert.equal(result.structuredContent.wrapped_tool, "server_config");
});

test("codexpro list_actions constructor sorts validates and rejects malformed envelopes", () => {
  const value = createCodexProListActionsSuccess(["read", "server_config", "read"], 4);
  assert.deepEqual(value, {
    codexpro_tool: "codexpro",
    codexpro_title: "CodexPro",
    ok: true,
    data: {
      actions: ["read", "server_config"],
      action_count: 2
    },
    error: null,
    meta: {
      schemaVersion: 1,
      durationMs: 4,
      warnings: []
    }
  });
  assert.throws(() => createCodexProListActionsSuccess(["codexpro"]));
  assert.throws(() => codexproOutputSchema.parse({ ...value, extra: true }));
  assert.throws(() => codexproOutputSchema.parse({
    ...value,
    data: { actions: ["server_config", "read"], action_count: 2 }
  }));
  assert.throws(() => codexproOutputSchema.parse({
    ...value,
    data: { actions: ["read", "read"], action_count: 2 }
  }));
  assert.throws(() => codexproOutputSchema.parse({
    ...value,
    data: { actions: ["read"], action_count: 2 }
  }));
});

test("codexpro aliases resolve only to fixed canonical tools", () => {
  for (const [alias, canonical] of Object.entries(EXPECTED_ALIASES)) {
    assert.equal(resolveCodexProAction(alias), canonical);
  }
  assert.equal(resolveCodexProAction("read"), "read");
  assert.equal(resolveCodexProAction("codexpro"), null);
  assert.equal(resolveCodexProAction("list_actions"), null);
  assert.equal(resolveCodexProAction("unknown"), null);
});

test("codexpro fixed failures are strict redacted and control-safe", () => {
  for (const [code, details] of [
    ["ACTION_NOT_AVAILABLE", { action: "unknown" }],
    ["ACTION_ARGUMENTS_INVALID", { action: "read", wrapped_tool: "read" }],
    ["CHILD_RESULT_INVALID", { action: "read", wrapped_tool: "read" }],
    ["INTERNAL_ERROR", {}]
  ]) {
    const value = createCodexProFailure({ code, details }, 2);
    assert.equal(value.ok, false);
    assert.equal(value.data, null);
    assert.deepEqual(value.error, {
      code,
      message: CODEXPRO_ERROR_MESSAGES[code],
      retryable: false,
      details
    });
    assert.deepEqual(value.meta, { schemaVersion: 1, durationMs: 2, warnings: [] });
  }
  const safe = createCodexProFailure({
    code: "ACTION_NOT_AVAILABLE",
    details: { action: `bad\r\n${"x".repeat(500)}` }
  });
  assert.equal(/[\r\n]/.test(safe.error.details.action), false);
  assert.ok(safe.error.details.action.length <= 160);
});

test("codexpro advertises exact input output and closed-world annotations in every mode", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "codexpro");
        assert.ok(descriptor, toolMode);
        assert.deepEqual(descriptor.inputSchema.required, ["action"]);
        assert.ok(descriptor.inputSchema.properties.action);
        assert.ok(descriptor.inputSchema.properties.args);
        assert.deepEqual(descriptor.outputSchema.required.sort(), [
          "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
        ]);
        assert.equal(descriptor.annotations?.readOnlyHint, false);
        assert.equal(descriptor.annotations?.destructiveHint, true);
        assert.equal(descriptor.annotations?.idempotentHint, false);
        assert.equal(descriptor.annotations?.openWorldHint, false);
      });
    }
  });
});

test("codexpro list_actions is nested sorted canonical and equal to actual registered direct tools", async () => {
  await withTempWorkspace(async (root) => {
    for (const overrides of [
      { toolMode: "minimal", bashMode: "off" },
      { toolMode: "standard", bashMode: "off" },
      { toolMode: "full", bashMode: "off" },
      { toolMode: "standard", writeMode: "off", bashMode: "off" },
      { toolMode: "minimal", writeMode: "handoff", bashMode: "off" },
      { toolMode: "standard", analysisEnabled: false, bashMode: "off" },
      { toolMode: "full", codexSessions: "metadata", bashMode: "off" },
      { toolMode: "full", codexSessions: "read", bashMode: "off" }
    ]) {
      await withConfigClient(createTestConfig(root, overrides), {}, async (client) => {
        const listed = await client.listTools();
        const direct = listed.tools.map((tool) => tool.name).filter((name) => name !== "codexpro").sort();
        const result = await callTool(client, "codexpro", { action: "list_actions" });
        const parsed = parseCodexPro(result);
        assert.equal(parsed.ok, true);
        assert.deepEqual(parsed.data.actions, direct);
        assert.equal(parsed.data.action_count, direct.length);
        assert.deepEqual(parsed.data.actions, [...parsed.data.actions].sort());
        for (const alias of Object.keys(EXPECTED_ALIASES)) {
          assert.ok(!parsed.data.actions.includes(alias));
        }
      });
    }
  });
});

test("codexpro preserves exact canonical and alias child envelopes content and isError", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const opened = await callTool(client, "codexpro", {
        action: "open",
        args: { include_tree: false }
      });
      assert.equal(opened.isError, undefined);
      assert.equal(opened.structuredContent.codexpro_tool, "open_current_workspace");
      assert.equal(opened.structuredContent.codexpro_super_action, "open");
      assert.equal(opened.structuredContent.wrapped_tool, "open_current_workspace");
      assert.equal(opened.structuredContent.ok, true);
      const workspaceId = opened.structuredContent.data.workspace_id;

      const direct = await callTool(client, "read", { workspace_id: workspaceId, path: "demo.txt" });
      const wrapped = await callTool(client, "codexpro", {
        action: "read",
        args: { workspace_id: workspaceId, path: "demo.txt" }
      });
      assert.equal(wrapped.structuredContent.codexpro_tool, "read");
      assert.equal(wrapped.structuredContent.codexpro_super_action, "read");
      assert.equal(wrapped.structuredContent.wrapped_tool, "read");
      const stripped = { ...wrapped.structuredContent };
      delete stripped.codexpro_super_action;
      delete stripped.wrapped_tool;
      assert.deepEqual(
        { ...stripped, meta: { ...stripped.meta, durationMs: 0 } },
        { ...direct.structuredContent, meta: { ...direct.structuredContent.meta, durationMs: 0 } }
      );
      assert.ok(stripped.meta.durationMs >= 0);
      assert.ok(direct.structuredContent.meta.durationMs >= 0);
      assert.deepEqual(wrapped.content, direct.content);
      assert.equal(wrapped.isError, direct.isError);

      const directFailure = await callTool(client, "read", { workspace_id: workspaceId, path: "missing.txt" });
      const wrappedFailure = await callTool(client, "codexpro", {
        action: "read",
        args: { workspace_id: workspaceId, path: "missing.txt" }
      });
      assert.equal(wrappedFailure.isError, true);
      assert.equal(wrappedFailure.structuredContent.codexpro_tool, "read");
      assert.equal(wrappedFailure.structuredContent.wrapped_tool, "read");
      assert.equal(wrappedFailure.structuredContent.error.code, directFailure.structuredContent.error.code);
    });
  });
});

test("codexpro rejects unknown recursive disabled and malformed actions with stable wrapper errors", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { toolMode: "minimal", bashMode: "off" }), {}, async (client) => {
      assertWrapperFailure(
        await callTool(client, "codexpro", { action: "unknown" }),
        "ACTION_NOT_AVAILABLE",
        { action: "unknown" }
      );
      assertWrapperFailure(
        await callTool(client, "codexpro", { action: "codexpro" }),
        "ACTION_NOT_AVAILABLE",
        { action: "codexpro" }
      );
      assertWrapperFailure(
        await callTool(client, "codexpro", { action: "search", args: { query: "alpha" } }),
        "ACTION_NOT_AVAILABLE",
        { action: "search" }
      );
      assertWrapperFailure(
        await callTool(client, "codexpro", { action: "read", args: { path: ["demo.txt"] } }),
        "ACTION_ARGUMENTS_INVALID",
        { action: "read", wrapped_tool: "read" }
      );
    });
  });
});

test("codexpro wrapper helper fails closed on identity drift extra wrapper fields and malformed child data", async () => {
  const child = {
    codexpro_tool: "server_config",
    codexpro_title: "Server Config",
    ok: false,
    data: null,
    error: {
      code: "INTERNAL_ERROR",
      message: "Configuration could not be read.",
      retryable: false,
      details: {}
    },
    meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
  };
  assert.throws(() => wrapCodexProChildResult("read", "read", child));
  assert.throws(() => wrapCodexProChildResult("server_config", "server_config", {
    ...child,
    codexpro_super_action: "server_config"
  }));
  assert.throws(() => wrapCodexProChildResult("server_config", "server_config", {
    ...child,
    legacy: "private diagnostic"
  }));
});

test("codexpro Tool Card and compatibility consumers use wrapper-owned nested data without touching protected sources", async () => {
  assert.match(toolCardWidgetHtml, /codexpro_tool === ["']codexpro["']/);
  assert.match(toolCardWidgetHtml, /action_count/);
  assert.match(toolCardWidgetHtml, /data\.actions|actions/);

  const smoke = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const httpSmoke = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const compatibility = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  const stressCompatibility = await fs.readFile(
    new URL("../scripts/stress-contract-compat.mjs", import.meta.url),
    "utf8"
  );

  assert.ok(smoke.includes("superActions.structuredContent.actions"));
  assert.ok(!smoke.includes("superActions.structuredContent.data.actions"));
  assert.ok(httpSmoke.length > 0);
  assert.match(compatibility, /superActions\.structuredContent\.data\.actions/);
  assert.match(compatibility, /expected.*replacement|replacement.*expected/i);
  assert.match(stress, /structuredContent\.actions/);
  assert.match(stressCompatibility, /structuredContent\.data\.actions/);
  assert.match(stressCompatibility, /action_count/);
  assert.match(stressCompatibility, /ACTION_NOT_AVAILABLE/);
  assert.match(stressCompatibility, /ACTION_ARGUMENTS_INVALID/);
  assert.match(stressCompatibility, /expected.*matches|matches.*expected/i);
});

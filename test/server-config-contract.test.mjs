import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  createServerConfigFailure,
  createServerConfigSuccess,
  serverConfigOutputSchema
} = await tsImport("../src/tools/schemas/serverConfig.ts", import.meta.url);

function sampleServerConfigData() {
  return {
    defaultRoot: "D:\\Dev\\codexpro",
    allowedRoots: ["D:\\Dev"],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authEnabled: true,
    allowedHosts: ["codexpro.example.invalid"],
    allowedOrigins: ["https://chatgpt.com"],
    allowQueryToken: true,
    bashMode: "off",
    bashAvailability: null,
    bashTranscript: "compact",
    bashSessionId: null,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: "D:\\Dev\\codexpro\\.codex-test",
    writeMode: "workspace",
    toolMode: "minimal",
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
    inheritEnv: false,
    contextDir: ".ai-bridge",
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    blockedGlobs: [".git/**"],
    registeredTools: ["server_config"],
    registeredToolCount: 1
  };
}

function createTestConfig() {
  const root = process.cwd();
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
    toolMode: "minimal",
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", "node_modules/**"],
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
    }
  };
}

async function withInMemoryClient(dependencies, callback) {
  const server = createCodexProServer(createTestConfig(), dependencies);
  const client = new Client({ name: "server-config-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

test("server_config success constructor produces the strict schema-v1 envelope", () => {
  const result = createServerConfigSuccess(sampleServerConfigData(), 7);
  const parsed = serverConfigOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "server_config");
  assert.equal(parsed.codexpro_title, "Server Config");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.equal(parsed.data.host, "127.0.0.1");
  assert.equal("host" in parsed, false);
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("server_config failure constructor produces only INTERNAL_ERROR", () => {
  const result = createServerConfigFailure("redacted failure", 3);
  const parsed = serverConfigOutputSchema.parse(result);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code: "INTERNAL_ERROR",
    message: "redacted failure",
    retryable: false,
    details: {}
  });
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 3,
    warnings: []
  });
});

test("server_config schema rejects inconsistent success and failure states", () => {
  assert.throws(() =>
    serverConfigOutputSchema.parse({
      ...createServerConfigSuccess(sampleServerConfigData(), 0),
      data: null
    })
  );
  assert.throws(() =>
    serverConfigOutputSchema.parse({
      ...createServerConfigFailure("failure", 0),
      error: null
    })
  );
});

test("server_config advertises the exact output schema and returns a valid success envelope", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "server_config");

    assert.ok(descriptor, "server_config must be registered");
    assert.ok(descriptor.outputSchema, "server_config must advertise outputSchema");
    assert.equal(descriptor.outputSchema.type, "object");
    assert.deepEqual(
      new Set(descriptor.outputSchema.required),
      new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
    );

    const result = await client.callTool({ name: "server_config", arguments: {} });
    const parsed = serverConfigOutputSchema.parse(result.structuredContent);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data);
    assert.equal(parsed.error, null);
    assert.equal("host" in parsed, false);
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.ok(parsed.meta.durationMs >= 0);
    assert.deepEqual(parsed.meta.warnings, []);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("CodexPro Server Config")));
  });
});

test("server_config converts an injected provider failure into a redacted INTERNAL_ERROR envelope", async () => {
  const secret = ["gh", "p_", "a".repeat(32)].join("");

  await withInMemoryClient(
    {
      serverConfigDataProvider: () => {
        throw new Error(`provider failed with ${secret}`);
      }
    },
    async (client) => {
      const result = await client.callTool({ name: "server_config", arguments: {} });
      const parsed = serverConfigOutputSchema.parse(result.structuredContent);
      const serialized = JSON.stringify(result);

      assert.equal(result.isError, true);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.data, null);
      assert.deepEqual(parsed.error, {
        code: "INTERNAL_ERROR",
        message: "Error: provider failed with [REDACTED_SECRET]",
        retryable: false,
        details: {}
      });
      assert.equal(parsed.meta.schemaVersion, 1);
      assert.ok(parsed.meta.durationMs >= 0);
      assert.deepEqual(parsed.meta.warnings, []);
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(parsed.error.message, /\n\s*at\s/);
      assert.ok(result.content.some((item) => item.type === "text"));
    }
  );
});

test("server_config tool card reads configuration fields from data", () => {
  assert.match(
    toolCardWidgetHtml,
    /const config = data\?\.data \?\? \{\};/
  );
  assert.match(
    toolCardWidgetHtml,
    /function renderServerConfig\(data\) \{\s*const config = data\?\.data \?\? \{\};/
  );
  assert.doesNotMatch(
    toolCardWidgetHtml,
    /function renderServerConfig\(data\) \{\s*const blocked = Array\.isArray\(data\.blockedGlobs\)/
  );
});

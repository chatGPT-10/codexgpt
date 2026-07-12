import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  SEARCH_ANALYSIS_DISABLED_WARNING,
  SEARCH_ANALYSIS_UNAVAILABLE_WARNING,
  SEARCH_ERROR_MESSAGES,
  createSearchFailure,
  createSearchSuccess,
  searchOutputSchema
} = await tsImport("../src/tools/schemas/search.ts", import.meta.url);

function createTestConfig(overrides = {}) {
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
    toolMode: "standard",
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
    },
    ...overrides
  };
}

async function withInMemoryClient(dependencies, callback, configOverrides = {}) {
  const server = createCodexProServer(createTestConfig(configOverrides), dependencies);
  const client = new Client({ name: "search-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function lexicalResult(overrides = {}) {
  return {
    text: "src/server.ts:2345: search",
    matches: [{ path: "src/server.ts", line: 2345, text: "search" }],
    truncated: false,
    used: "node",
    ...overrides
  };
}

function structuredMatch(overrides = {}) {
  return {
    path: "src/server.ts",
    line: 2345,
    text: "search",
    group: "definitions",
    score: 190,
    reasons: ["exact text match", "symbol definition"],
    confidence: "strong",
    source: "built-in analysis",
    ...overrides
  };
}

function analysisResult(overrides = {}) {
  const match = structuredMatch();
  return {
    schemaVersion: 1,
    query: "search",
    intent: "symbol",
    groups: {
      definitions: [match],
      references: [],
      tests: [],
      configuration: [],
      documentation: [],
      other: []
    },
    matches: [match],
    coverage: {
      inventoryFiles: 10,
      analyzedFiles: 9,
      scannedBytes: 1000,
      symbolCount: 20,
      relationshipCount: 30,
      truncated: false,
      warnings: []
    },
    warnings: [],
    cache: { hit: false, key: "analysis-key" },
    ...overrides
  };
}

function sampleData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    matches: [{ path: "src/server.ts", line: 2345, text: "search" }],
    truncated: false,
    used: "node",
    analysis: null,
    ...overrides
  };
}

function parseSearchResult(result) {
  return searchOutputSchema.parse(result.structuredContent);
}

const failureCases = [
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "../outside" }],
  ["PATH_BLOCKED", { path: ".git" }],
  ["FILE_NOT_FOUND", { path: "missing" }],
  ["INVALID_ARGUMENT", { argument: "regex" }],
  ["SEARCH_BACKEND_UNAVAILABLE", {}],
  ["SEARCH_COMMAND_FAILED", {}],
  ["INTERNAL_ERROR", {}]
];

test("search success constructor produces the strict schema-v1 envelope", () => {
  const parsed = searchOutputSchema.parse(createSearchSuccess(sampleData(), 7));
  assert.deepEqual(Object.keys(parsed).sort(), ["codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"]);
  assert.equal(parsed.codexpro_tool, "search");
  assert.equal(parsed.codexpro_title, "Search Files");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleData());
  assert.equal("matches" in parsed, false);
  assert.equal("text" in parsed, false);
  assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("search success constructor preserves exact structured analysis", () => {
  const analysis = analysisResult();
  const parsed = searchOutputSchema.parse(createSearchSuccess(sampleData({ analysis }), 1));
  assert.deepEqual(parsed.data.analysis, analysis);
});

test("search failure constructor produces every approved strict error", () => {
  for (const [code, details] of failureCases) {
    const parsed = searchOutputSchema.parse(createSearchFailure({ code, details }, 3));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code,
      message: SEARCH_ERROR_MESSAGES[code],
      retryable: false,
      details
    });
    assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 3, warnings: [] });
  }
});

test("search schema rejects unknown fields and invalid lexical values", () => {
  const success = createSearchSuccess(sampleData(), 0);
  assert.throws(() => searchOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => searchOutputSchema.parse({ ...success, data: { ...success.data, text: "legacy" } }));
  assert.throws(() => searchOutputSchema.parse({ ...success, data: { ...success.data, used: "grep" } }));
  assert.throws(() => searchOutputSchema.parse({
    ...success,
    data: { ...success.data, matches: [{ path: "x", line: 0, text: "bad" }] }
  }));
});

test("search schema rejects malformed analysis and inconsistent envelope states", () => {
  const success = createSearchSuccess(sampleData(), 0);
  const failure = createSearchFailure({ code: "INTERNAL_ERROR", details: {} }, 0);
  assert.throws(() => searchOutputSchema.parse({
    ...success,
    data: { ...success.data, analysis: analysisResult({ intent: "auto" }) }
  }));
  assert.throws(() => searchOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => searchOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => searchOutputSchema.parse({ ...failure, data: sampleData() }));
  assert.throws(() => searchOutputSchema.parse({ ...failure, error: null }));
});

test("search schema accepts only the two fixed degradation warnings", () => {
  const disabled = createSearchSuccess(sampleData(), 0, [SEARCH_ANALYSIS_DISABLED_WARNING]);
  const unavailable = createSearchSuccess(sampleData(), 0, [SEARCH_ANALYSIS_UNAVAILABLE_WARNING]);
  assert.deepEqual(disabled.meta.warnings, [SEARCH_ANALYSIS_DISABLED_WARNING]);
  assert.deepEqual(unavailable.meta.warnings, [SEARCH_ANALYSIS_UNAVAILABLE_WARNING]);
  assert.throws(() => searchOutputSchema.parse({
    ...disabled,
    meta: { ...disabled.meta, warnings: ["raw provider failure"] }
  }));
});

test("search advertises exact outputSchema and returns nested real lexical results", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "search");
    assert.ok(descriptor?.outputSchema);
    assert.deepEqual(new Set(descriptor.outputSchema.required), new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"]));

    const result = await client.callTool({ name: "search", arguments: { query: "registerCodexTool", path: "src/server.ts", max_results: 5 } });
    const parsed = parseSearchResult(result);
    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data.matches.length >= 1);
    assert.equal(parsed.data.analysis, null);
    assert.ok(["node", "ripgrep"].includes(parsed.data.used));
    assert.equal("matches" in parsed, false);
    assert.equal("text" in parsed.data, false);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("registerCodexTool")));
  });
});

test("search preserves exact injected analysis when structured search is requested", async () => {
  await withInMemoryClient({
    searchResultProvider: async () => lexicalResult({ analysis: analysisResult() })
  }, async (client) => {
    const result = await client.callTool({ name: "search", arguments: { query: "search", intent: "symbol" } });
    const parsed = parseSearchResult(result);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data.analysis, analysisResult());
    assert.deepEqual(parsed.meta.warnings, []);
  });
});

test("search discards unrequested provider analysis without a warning", async () => {
  await withInMemoryClient({
    searchResultProvider: async () => lexicalResult({ analysis: analysisResult() })
  }, async (client) => {
    const parsed = parseSearchResult(await client.callTool({ name: "search", arguments: { query: "search" } }));
    assert.equal(parsed.data.analysis, null);
    assert.deepEqual(parsed.meta.warnings, []);
  });
});

test("search safely distinguishes disabled and unavailable analysis", async () => {
  const disabledAnalysis = analysisResult({
    cache: { hit: false, key: "disabled" },
    warnings: ["Repository analysis is disabled by configuration."]
  });
  await withInMemoryClient({
    searchResultProvider: async () => lexicalResult({ analysis: disabledAnalysis })
  }, async (client) => {
    const parsed = parseSearchResult(await client.callTool({ name: "search", arguments: { query: "search", intent: "symbol" } }));
    assert.equal(parsed.data.analysis, null);
    assert.deepEqual(parsed.meta.warnings, [SEARCH_ANALYSIS_DISABLED_WARNING]);
  }, { analysisEnabled: false });

  const unavailableAnalysis = analysisResult({
    cache: { hit: false, key: "unavailable" },
    warnings: ["Repository analysis unavailable: secret-value"]
  });
  await withInMemoryClient({
    searchResultProvider: async () => lexicalResult({ analysis: unavailableAnalysis })
  }, async (client) => {
    const result = await client.callTool({ name: "search", arguments: { query: "search", intent: "symbol" } });
    const parsed = parseSearchResult(result);
    assert.equal(parsed.data.analysis, null);
    assert.deepEqual(parsed.meta.warnings, [SEARCH_ANALYSIS_UNAVAILABLE_WARNING]);
    assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  });
});

test("search degrades malformed optional analysis but fails malformed lexical output", async () => {
  await withInMemoryClient({
    searchResultProvider: async () => lexicalResult({ analysis: { bad: true } })
  }, async (client) => {
    const parsed = parseSearchResult(await client.callTool({ name: "search", arguments: { query: "search", intent: "symbol" } }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.analysis, null);
    assert.deepEqual(parsed.meta.warnings, [SEARCH_ANALYSIS_UNAVAILABLE_WARNING]);
  });

  await withInMemoryClient({
    searchResultProvider: async () => ({ text: "bad", matches: "not-an-array", truncated: false, used: "node" })
  }, async (client) => {
    const result = await client.callTool({ name: "search", arguments: { query: "search" } });
    const parsed = parseSearchResult(result);
    assert.equal(result.isError, true);
    assert.equal(parsed.error.code, "INTERNAL_ERROR");
  });
});

test("search maps safe provider failures to stable public errors", async () => {
  const cases = [
    [Object.assign(new Error("missing"), { code: "ENOENT" }), "FILE_NOT_FOUND"],
    [new Error("Path is blocked by safety rules: .git"), "PATH_BLOCKED"],
    [new Error("Path escapes workspace root: ../outside"), "PATH_OUTSIDE_WORKSPACE"],
    [new Error("Invalid regular expression: unterminated group"), "INVALID_ARGUMENT"],
    [new Error("regex search requires ripgrep. Install rg or retry with regex=false."), "SEARCH_BACKEND_UNAVAILABLE"],
    [new Error("ripgrep failed with exit code 2"), "SEARCH_COMMAND_FAILED"],
    [new Error("token=super-secret-value"), "INTERNAL_ERROR"]
  ];

  for (const [error, code] of cases) {
    await withInMemoryClient({ searchResultProvider: async () => { throw error; } }, async (client) => {
      const result = await client.callTool({ name: "search", arguments: { query: "[", regex: true, path: ".git" } });
      const parsed = parseSearchResult(result);
      assert.equal(result.isError, true);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.error.code, code);
      assert.equal(parsed.error.message, SEARCH_ERROR_MESSAGES[code]);
      assert.doesNotMatch(JSON.stringify(result), /super-secret-value/);
    });
  }
});

test("search maps unknown workspace to a stable failure", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({ name: "search", arguments: { workspace_id: "ws_missing", query: "x" } });
    const parsed = parseSearchResult(result);
    assert.equal(result.isError, true);
    assert.equal(parsed.error.code, "WORKSPACE_NOT_FOUND");
    assert.deepEqual(parsed.error.details, { workspace_id: "ws_missing" });
  });
});

test("search supertool wrapper preserves nested child contract", async () => {
  await withInMemoryClient({ searchResultProvider: async () => lexicalResult() }, async (client) => {
    const result = await client.callTool({ name: "codexpro", arguments: { action: "search", args: { query: "search" } } });
    const structured = result.structuredContent;
    assert.equal(structured.codexpro_tool, "search");
    assert.equal(structured.codexpro_super_action, "search");
    assert.equal(structured.wrapped_tool, "search");
    assert.equal(structured.ok, true);
    assert.ok(structured.data.matches.length === 1);
    assert.equal("matches" in structured, false);
    assert.equal("text" in structured, false);
  });
});

test("search Tool Card consumes nested match objects and nested analysis", () => {
  assert.match(toolCardWidgetHtml, /const search = data\?\.data \?\? \{\};/);
  assert.match(toolCardWidgetHtml, /search\.matches/);
  assert.match(toolCardWidgetHtml, /search\.analysis/);
  assert.doesNotMatch(toolCardWidgetHtml, /String\(data\.text \|\| ""\)/);
});

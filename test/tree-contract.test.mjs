import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const { ToolExecutionPipeline } = await tsImport("../src/tools/executionPipeline.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  TREE_ERROR_MESSAGES,
  createTreeFailure,
  createTreeSuccess,
  treeOutputSchema
} = await tsImport("../src/tools/schemas/tree.ts", import.meta.url);

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
    }
  };
}

async function withInMemoryClient(dependencies, callback) {
  const server = createCodexGPTServer(createTestConfig(), dependencies);
  const client = new Client({ name: "tree-contract-test", version: "0.0.0" });
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

function parseTreeResult(result) {
  return treeOutputSchema.parse(result.structuredContent);
}

function assertTreeFailure(result, code, details) {
  const parsed = parseTreeResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: TREE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

function sampleTreeData() {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexgpt",
    text: ".\n├── src/\n└── test/",
    entries: 2,
    truncated: false
  };
}

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "ws_missing" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "../outside" },
    message: "The requested path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".git" },
    message: "The requested path is blocked by safety rules."
  },
  {
    code: "FILE_NOT_FOUND",
    details: { path: "missing-directory" },
    message: "The requested path does not exist."
  },
  {
    code: "NOT_A_DIRECTORY",
    details: { path: "src/server.ts" },
    message: "The requested path is not a directory."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The file tree could not be generated because of an internal error."
  }
];

test("tree success constructor produces the strict schema-v1 envelope", () => {
  const result = createTreeSuccess(sampleTreeData(), 7);
  const parsed = treeOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexgpt_title",
    "codexgpt_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexgpt_tool, "tree");
  assert.equal(parsed.codexgpt_title, "File Tree");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleTreeData());
  assert.equal("workspace_id" in parsed, false);
  assert.equal("text" in parsed, false);
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("tree failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const result = createTreeFailure({ code: expected.code, details: expected.details }, 3);
    const parsed = treeOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(TREE_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("tree schema rejects unknown codes, wrong details, and additional fields", () => {
  const success = createTreeSuccess(sampleTreeData(), 0);
  const workspaceFailure = createTreeFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createTreeFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => treeOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    treeOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    treeOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong-shape" } }
    })
  );
  assert.throws(() =>
    treeOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("tree schema rejects inconsistent success and failure states", () => {
  const success = createTreeSuccess(sampleTreeData(), 0);
  const failure = createTreeFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => treeOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => treeOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => treeOutputSchema.parse({ ...failure, data: sampleTreeData() }));
  assert.throws(() => treeOutputSchema.parse({ ...failure, error: null }));
});

test("tree advertises the exact output schema and returns a valid real success envelope", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "tree");

    assert.ok(descriptor, "tree must be registered");
    assert.ok(descriptor.outputSchema, "tree must advertise outputSchema");
    assert.equal(descriptor.outputSchema.type, "object");
    assert.deepEqual(
      new Set(descriptor.outputSchema.required),
      new Set(["codexgpt_tool", "codexgpt_title", "ok", "data", "error", "meta"])
    );

    const result = await client.callTool({
      name: "tree",
      arguments: { path: "src/tools/schemas", max_depth: 1, max_entries: 20 }
    });
    const parsed = parseTreeResult(result);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.error, null);
    assert.ok(parsed.data);
    assert.equal(parsed.data.workspace_id.startsWith("ws_"), true);
    assert.equal(parsed.data.root, process.cwd());
    assert.match(parsed.data.text, /common\.ts/);
    assert.equal(parsed.data.entries, 20);
    assert.equal(parsed.data.truncated, true);
    assert.match(parsed.data.text, /\.\.\.\[tree truncated after 20 entries\]$/);
    assert.equal("workspace_id" in parsed, false);
    assert.equal("text" in parsed, false);
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.ok(parsed.meta.durationMs >= 0);
    assert.deepEqual(parsed.meta.warnings, []);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("common.ts")));
  });
});

test("tree traverses the injected execution pipeline without changing its public contract", async () => {
  const seen = [];
  const pipeline = new ToolExecutionPipeline();
  pipeline.usePre((execution) => {
    seen.push({
      toolName: execution.toolName,
      arguments: execution.arguments
    });
    return { kind: "allow" };
  });

  await withInMemoryClient({ toolExecutionPipeline: pipeline }, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "src/tools/schemas", max_depth: 1, max_entries: 20 }
    });
    const parsed = parseTreeResult(result);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.error, null);
    assert.equal(parsed.data.root, process.cwd());
    assert.equal(parsed.data.entries, 20);
    assert.equal(parsed.data.truncated, true);
  });

  assert.deepEqual(seen, [{
    toolName: "tree",
    arguments: { path: "src/tools/schemas", max_depth: 1, max_entries: 20 }
  }]);
});

test("tree maps an unknown explicit workspace to WORKSPACE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { workspace_id: "ws_missing_tree_contract" }
    });

    assertTreeFailure(result, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_tree_contract"
    });
  });
});

test("tree maps a relative escape to PATH_OUTSIDE_WORKSPACE", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "../outside" }
    });

    assertTreeFailure(result, "PATH_OUTSIDE_WORKSPACE", { path: "../outside" });
  });
});

test("tree maps a configured blocked path to PATH_BLOCKED", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: ".git" }
    });

    assertTreeFailure(result, "PATH_BLOCKED", { path: ".git" });
  });
});

test("tree maps a missing target to FILE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "__tree_contract_missing_directory__" }
    });

    assertTreeFailure(result, "FILE_NOT_FOUND", {
      path: "__tree_contract_missing_directory__"
    });
  });
});

test("tree maps an existing file to NOT_A_DIRECTORY", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "package.json" }
    });

    assertTreeFailure(result, "NOT_A_DIRECTORY", { path: "package.json" });
  });
});

test("tree converts an injected provider failure into a fixed redacted INTERNAL_ERROR", async () => {
  const secret = ["gh", "p_", "b".repeat(32)].join("");

  await withInMemoryClient(
    {
      treeResultProvider: async () => {
        throw new Error(`tree provider failed with ${secret}`);
      }
    },
    async (client) => {
      const result = await client.callTool({ name: "tree", arguments: {} });
      const serialized = JSON.stringify(result);

      assertTreeFailure(result, "INTERNAL_ERROR", {});
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(serialized, /tree provider failed/);
      assert.doesNotMatch(serialized, /\n\s*at\s/);
    }
  );
});

test("tree tool card reads successful fields only from nested data", () => {
  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "tree"\) \{\s*root\.innerHTML = renderTree\(data\);/
  );

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderTree\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderTree must exist");

  const renderer = rendererMatch[0];
  assert.match(
    toolCardWidgetHtml,
    /if \(data\?\.codexgpt_tool === "tree"\) \{\s*if \(data\?\.ok === false\)[\s\S]*?const tree = data\?\.data \?\? \{\};/
  );
  assert.match(renderer, /const tree = data\?\.data \?\? \{\};/);
  assert.match(renderer, /tree\.text/);
  assert.match(renderer, /tree\.entries/);
  assert.match(renderer, /tree\.truncated/);
  assert.match(renderer, /tree\.root/);
  assert.doesNotMatch(renderer, /data\?\.(?:text|entries|truncated|root)/);
});

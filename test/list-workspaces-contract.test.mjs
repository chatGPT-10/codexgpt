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
  "../src/tools/schemas/listWorkspaces.ts",
  import.meta.url
).catch(() => null);

const {
  LIST_WORKSPACES_ERROR_MESSAGES,
  createListWorkspacesFailure,
  createListWorkspacesSuccess,
  listWorkspacesOutputSchema
} = schemaModule ?? {};

function sampleListData(overrides = {}) {
  return {
    workspaces: [
      {
        id: "ws_0123456789abcdef01234567",
        root: "D:\\Dev\\project",
        openedAt: "2026-07-13T12:34:56.789Z"
      }
    ],
    count: 1,
    ...overrides
  };
}

const validOpenedAt = "2026-07-13T12:34:56.789Z";
const invalidOpenedAt = [
  "2026-07-13",
  "2026-07-13T12:34:56Z",
  "2026-07-13T12:34:56.789+02:00",
  "not-a-timestamp"
];

const failureCases = [
  {
    code: "WORKSPACE_LIST_FAILED",
    details: {},
    message: "The open workspace list could not be collected."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace list failed because of an internal error."
  }
];

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
  const client = new Client({ name: "list-workspaces-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-list-workspaces-contract-"));
  const root = await fs.realpath(created);
  try {
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

function parseListResult(result) {
  return listWorkspacesOutputSchema.parse(result.structuredContent);
}

function assertListFailure(result, code) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseListResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: LIST_WORKSPACES_ERROR_MESSAGES[code],
    retryable: false,
    details: {}
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(LIST_WORKSPACES_ERROR_MESSAGES[code]));
  return parsed;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

test("list_workspaces schema exports exact constructors and accepts populated and empty success", () => {
  assert.equal(typeof createListWorkspacesSuccess, "function");
  assert.equal(typeof createListWorkspacesFailure, "function");
  assert.equal(typeof listWorkspacesOutputSchema?.parse, "function");
  assert.equal(typeof LIST_WORKSPACES_ERROR_MESSAGES, "object");

  const success = createListWorkspacesSuccess(sampleListData(), 7);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(success.codexpro_tool, "list_workspaces");
  assert.equal(success.codexpro_title, "List Workspaces");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), ["count", "workspaces"]);
  assert.deepEqual(Object.keys(success.data.workspaces[0]).sort(), ["id", "openedAt", "root"]);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });

  const empty = createListWorkspacesSuccess({ workspaces: [], count: 0 });
  assert.deepEqual(empty.data, { workspaces: [], count: 0 });
});

test("list_workspaces schema creates both exact stable failures", () => {
  for (const failureCase of failureCases) {
    const result = createListWorkspacesFailure(
      { code: failureCase.code, details: failureCase.details },
      9
    );
    assert.deepEqual(result, {
      codexpro_tool: "list_workspaces",
      codexpro_title: "List Workspaces",
      ok: false,
      data: null,
      error: {
        code: failureCase.code,
        message: failureCase.message,
        retryable: false,
        details: {}
      },
      meta: { schemaVersion: 1, durationMs: 9, warnings: [] }
    });
  }
});

test("list_workspaces schema rejects flat, malformed, inconsistent, duplicate, and additional fields", () => {
  const success = createListWorkspacesSuccess(sampleListData());
  const failure = createListWorkspacesFailure({ code: "INTERNAL_ERROR", details: {} });

  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, workspaces: [] }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, count: 1 }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, codexpro_tool: "workspace_snapshot" }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, codexpro_title: "Workspaces" }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...failure, data: sampleListData() }));
  assert.throws(() => listWorkspacesOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: { ...success.data, extra: true }
  }));
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      workspaces: [{ ...success.data.workspaces[0], extra: true }]
    }
  }));

  for (const field of ["id", "root"]) {
    assert.throws(() => listWorkspacesOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        workspaces: [{ ...success.data.workspaces[0], [field]: "" }]
      }
    }));
  }

  for (const openedAt of invalidOpenedAt) {
    assert.throws(() => listWorkspacesOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        workspaces: [{ ...success.data.workspaces[0], openedAt }]
      }
    }));
  }

  assert.doesNotThrow(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      workspaces: [{ ...success.data.workspaces[0], openedAt: validOpenedAt }]
    }
  }));

  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: { ...success.data, count: -1 }
  }));
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: { ...success.data, count: 1.5 }
  }));
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: { ...success.data, count: 0 }
  }));

  const second = {
    id: "ws_abcdef0123456789abcdef01",
    root: "D:\\Dev\\other",
    openedAt: "2026-07-13T12:35:56.789Z"
  };
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: {
      workspaces: [success.data.workspaces[0], { ...second, id: success.data.workspaces[0].id }],
      count: 2
    }
  }));
  assert.throws(() => listWorkspacesOutputSchema.parse({
    ...success,
    data: {
      workspaces: [success.data.workspaces[0], { ...second, root: success.data.workspaces[0].root }],
      count: 2
    }
  }));
  assert.throws(() => createListWorkspacesFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
  }));
});

test("list_workspaces remains full-mode only and advertises an exact no-input output schema", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        assert.equal(listed.tools.some((tool) => tool.name === "list_workspaces"), false);
      });
    }

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "list_workspaces");
      assert.ok(descriptor);
      assert.deepEqual(descriptor.inputSchema.properties ?? {}, {});
      assert.deepEqual(descriptor.inputSchema.required ?? [], []);
      assert.ok(descriptor.outputSchema);
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );
    });
  });
});

test("list_workspaces returns exact nested empty success before any workspace is opened", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "list_workspaces");
      const parsed = parseListResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.data, { workspaces: [], count: 0 });
      assert.equal(parsed.error, null);
      assert.equal("workspaces" in result.structuredContent, false);
      assert.equal("count" in result.structuredContent, false);
      assert.match(resultText(result), /No workspaces opened/);
    });
  });
});

test("list_workspaces preserves real manager identity, canonical root, timestamp, and insertion order", async () => {
  await withTempWorkspace(async (root) => {
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    await fs.mkdir(first);
    await fs.mkdir(second);

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      await callTool(client, "open_workspace", { root: first, include_tree: false });
      await callTool(client, "open_workspace", { root: second, include_tree: false });
      const parsed = parseListResult(await callTool(client, "list_workspaces"));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.count, 2);
      assert.deepEqual(
        parsed.data.workspaces.map((workspace) => workspace.root),
        [await fs.realpath(first), await fs.realpath(second)]
      );
      for (const workspace of parsed.data.workspaces) {
        assert.match(workspace.id, /^ws_[0-9a-f]{24}$/);
        assert.equal(new Date(workspace.openedAt).toISOString(), workspace.openedAt);
      }
    });
  });
});

test("list_workspaces preserves injected provider order", async () => {
  await withTempWorkspace(async (root) => {
    const workspaces = [
      {
        id: "ws_bbbbbbbbbbbbbbbbbbbbbbbb",
        root: path.join(root, "b"),
        openedAt: "2026-07-13T12:35:56.789Z"
      },
      {
        id: "ws_aaaaaaaaaaaaaaaaaaaaaaaa",
        root: path.join(root, "a"),
        openedAt: "2026-07-13T12:34:56.789Z"
      }
    ];
    await withConfigClient(createTestConfig(root), {
      listWorkspacesProvider: async () => workspaces
    }, async (client) => {
      const parsed = parseListResult(await callTool(client, "list_workspaces"));
      assert.deepEqual(parsed.data.workspaces, workspaces);
      assert.equal(parsed.data.count, 2);
    });
  });
});

test("list_workspaces shares manager inventory across MCP server instances with the same config", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    let openedId;
    await withConfigClient(config, {}, async (client) => {
      const opened = await callTool(client, "open_current_workspace", { include_tree: false });
      openedId = opened.structuredContent.data.workspace_id;
    });

    await withConfigClient(config, {}, async (client) => {
      const parsed = parseListResult(await callTool(client, "list_workspaces"));
      assert.equal(parsed.data.count, 1);
      assert.equal(parsed.data.workspaces[0].id, openedId);
      assert.equal(parsed.data.workspaces[0].root, root);
    });
  });
});

test("list_workspaces classifies provider throw and rejection without leaking diagnostics", async () => {
  await withTempWorkspace(async (root) => {
    for (const listWorkspacesProvider of [
      () => { throw new Error(`private provider failure ${root}`); },
      async () => Promise.reject(new Error(`private async failure ${root}`))
    ]) {
      await withConfigClient(createTestConfig(root), { listWorkspacesProvider }, async (client) => {
        const result = await callTool(client, "list_workspaces");
        assertListFailure(result, "WORKSPACE_LIST_FAILED");
        assert.equal(resultText(result).includes(root), false);
        assert.equal(JSON.stringify(result.structuredContent).includes("private"), false);
      });
    }
  });
});

test("list_workspaces rejects malformed provider output as INTERNAL_ERROR without leaking it", async () => {
  await withTempWorkspace(async (root) => {
    const malformedCases = [
      "not-an-array",
      [{ id: "", root, openedAt: validOpenedAt }],
      [{ id: "ws_bad", root, openedAt: "not-a-timestamp" }],
      [
        { id: "ws_duplicate", root: path.join(root, "a"), openedAt: validOpenedAt },
        { id: "ws_duplicate", root: path.join(root, "b"), openedAt: "2026-07-13T12:35:56.789Z" }
      ],
      [
        { id: "ws_one", root, openedAt: validOpenedAt },
        { id: "ws_two", root, openedAt: "2026-07-13T12:35:56.789Z" }
      ],
      [{ id: "ws_extra", root, openedAt: validOpenedAt, diagnostic: "private" }]
    ];

    for (const malformed of malformedCases) {
      await withConfigClient(createTestConfig(root), {
        listWorkspacesProvider: async () => malformed
      }, async (client) => {
        const result = await callTool(client, "list_workspaces");
        assertListFailure(result, "INTERNAL_ERROR");
        assert.equal(JSON.stringify(result.structuredContent).includes(root), false);
        assert.equal(JSON.stringify(result.structuredContent).includes("private"), false);
      });
    }
  });
});

test("list_workspaces Tool Card is nested-first, handles failures, and retains flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function listWorkspacesResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "list_workspaces"/);
  assert.match(toolCardWidgetHtml, /data\?\.data &&/);
  assert.match(toolCardWidgetHtml, /return nested \? data\.data : \(data \?\? \{\}\)/);
  assert.match(toolCardWidgetHtml, /if \(data\?\.ok === false\) return data\?\.error\?\.code/);
  assert.match(toolCardWidgetHtml, /const listed = listWorkspacesResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /Array\.isArray\(listed\.workspaces\)/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Workspace list unavailable\."/);
});

test("list_workspaces supertool preserves the exact nested envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "list_workspaces",
        args: {}
      });
      assert.equal(result.structuredContent.codexpro_tool, "list_workspaces");
      assert.equal(result.structuredContent.codexpro_title, "List Workspaces");
      assert.equal(result.structuredContent.codexpro_super_action, "list_workspaces");
      assert.equal(result.structuredContent.wrapped_tool, "list_workspaces");
      assert.equal(result.structuredContent.ok, true);
      assert.deepEqual(result.structuredContent.data.workspaces, []);
      assert.equal(result.structuredContent.data.count, 0);
      assert.equal("workspaces" in result.structuredContent, false);
      assert.equal("count" in result.structuredContent, false);
    });
  });
});

test("list_workspaces protected HTTP Smoke consumer is migrated only by the exact fail-closed loader", async () => {
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const compat = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const oldText = "list.structuredContent.workspaces.map";
  const newText = "list.structuredContent.data?.workspaces.map";

  assert.equal(countOccurrences(protectedHttp, oldText), 1);
  assert.equal(protectedHttp.includes(newText), false);
  assert.equal(compat.includes(JSON.stringify(oldText)), true);
  assert.equal(compat.includes(JSON.stringify(newText)), true);
  assert.match(compat, /firstIndex < 0 \|\| firstIndex !== lastIndex/);
  assert.equal(compat.includes("writeFile"), false);
  assert.match(protectedMain, /list_workspaces/);
});

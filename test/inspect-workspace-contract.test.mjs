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
  "../src/tools/schemas/inspectWorkspace.ts",
  import.meta.url
).catch(() => null);

const {
  INSPECT_WORKSPACE_ERROR_MESSAGES,
  INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING,
  createInspectWorkspaceFailure,
  createInspectWorkspaceSuccess,
  inspectWorkspaceDataSchema,
  inspectWorkspaceOutputSchema,
  inspectWorkspaceProviderSchema
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
  const client = new Client({ name: "inspect-workspace-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(files, callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-inspect-contract-"));
  const root = await fs.realpath(created);
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");
    }
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

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function sampleProvider(root, workspaceId = "ws_0123456789abcdef01234567", overrides = {}) {
  const warnings = [];
  const files = [
    {
      path: "package.json",
      bytes: 32,
      modifiedMs: 1_783_944_000_000,
      language: "json",
      role: "config",
      generated: false,
      entrypoint: false
    },
    {
      path: "src/index.ts",
      bytes: 80,
      modifiedMs: 1_783_944_000_001.5,
      language: "typescript",
      role: "source",
      generated: false,
      entrypoint: true
    },
    {
      path: "src/service.ts",
      bytes: 64,
      modifiedMs: 1_783_944_000_002,
      language: "typescript",
      role: "source",
      generated: false,
      entrypoint: false
    }
  ];
  const symbols = [
    {
      name: "main",
      kind: "function",
      path: "src/index.ts",
      line: 1,
      exported: true,
      confidence: "strong"
    }
  ];
  const relationships = [
    {
      from: "src/index.ts",
      to: "src/service.ts",
      kind: "imports",
      confidence: "strong",
      source: "built-in import extraction"
    }
  ];
  return {
    schemaVersion: 1,
    workspaceId,
    root,
    languages: ["json", "typescript"],
    projectTypes: ["node"],
    entrypoints: ["src/index.ts"],
    importantFiles: ["package.json"],
    areas: [
      { path: "src", role: "source", files: 2 },
      { path: ".", role: "config", files: 1 }
    ],
    files,
    symbols,
    relationships,
    coverage: {
      inventoryFiles: files.length,
      analyzedFiles: 2,
      scannedBytes: 144,
      symbolCount: symbols.length,
      relationshipCount: relationships.length,
      truncated: false,
      warnings
    },
    warnings,
    fingerprint: "a".repeat(64),
    cache: { hit: false, key: `${workspaceId}:${"a".repeat(64)}:{}` },
    ...overrides
  };
}

function sampleData(root, overrides = {}) {
  const provider = sampleProvider(root);
  return {
    workspace_id: provider.workspaceId,
    root,
    path: ".",
    languages: provider.languages,
    project_types: provider.projectTypes,
    entrypoints: provider.entrypoints,
    important_files: provider.importantFiles,
    areas: provider.areas,
    files: provider.files,
    symbols: provider.symbols,
    relationships: provider.relationships,
    coverage: provider.coverage,
    warnings: [],
    output_limited: false,
    returned: { files: 3, symbols: 1, relationships: 1 },
    cache: provider.cache,
    ...overrides
  };
}

function parseInspectResult(result) {
  return inspectWorkspaceOutputSchema.parse(result.structuredContent);
}

function assertInspectFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseInspectResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: INSPECT_WORKSPACE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  return parsed;
}

const topKeys = ["codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"];
const dataKeys = [
  "areas",
  "cache",
  "coverage",
  "entrypoints",
  "files",
  "important_files",
  "languages",
  "output_limited",
  "path",
  "project_types",
  "relationships",
  "returned",
  "root",
  "symbols",
  "warnings",
  "workspace_id"
];

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "missing-workspace" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "[unsafe path omitted]" },
    message: "The requested analysis path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".env" },
    message: "The requested analysis path is blocked by safety rules."
  },
  {
    code: "ANALYSIS_FAILED",
    details: {},
    message: "The workspace analysis could not be completed."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace analysis failed because of an internal error."
  }
];

test("inspect_workspace schema exports exact constructors and nested success", () => {
  assert.equal(typeof createInspectWorkspaceSuccess, "function");
  assert.equal(typeof createInspectWorkspaceFailure, "function");
  assert.equal(typeof inspectWorkspaceOutputSchema?.parse, "function");
  assert.equal(typeof inspectWorkspaceProviderSchema?.parse, "function");
  assert.equal(typeof inspectWorkspaceDataSchema?.parse, "function");
  assert.equal(typeof INSPECT_WORKSPACE_ERROR_MESSAGES, "object");
  assert.equal(typeof INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING, "string");

  const success = createInspectWorkspaceSuccess(sampleData("D:\\Dev\\project"), 7);
  assert.deepEqual(Object.keys(success).sort(), topKeys);
  assert.equal(success.codexpro_tool, "inspect_workspace");
  assert.equal(success.codexpro_title, "Inspect Workspace");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), dataKeys);
  assert.deepEqual(Object.keys(success.data.files[0]).sort(), [
    "bytes", "entrypoint", "generated", "language", "modifiedMs", "path", "role"
  ]);
  assert.deepEqual(Object.keys(success.data.areas[0]).sort(), ["files", "path", "role"]);
  assert.deepEqual(Object.keys(success.data.symbols[0]).sort(), [
    "confidence", "exported", "kind", "line", "name", "path"
  ]);
  assert.deepEqual(Object.keys(success.data.relationships[0]).sort(), [
    "confidence", "from", "kind", "source", "to"
  ]);
  assert.deepEqual(Object.keys(success.data.coverage).sort(), [
    "analyzedFiles", "inventoryFiles", "relationshipCount", "scannedBytes",
    "symbolCount", "truncated", "warnings"
  ]);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
  assert.equal("schema_version" in success.data, false);
});

test("inspect_workspace schema creates five exact stable failures", () => {
  for (const failureCase of failureCases) {
    const result = createInspectWorkspaceFailure(
      { code: failureCase.code, details: failureCase.details },
      9
    );
    assert.deepEqual(result, {
      codexpro_tool: "inspect_workspace",
      codexpro_title: "Inspect Workspace",
      ok: false,
      data: null,
      error: {
        code: failureCase.code,
        message: failureCase.message,
        retryable: false,
        details: failureCase.details
      },
      meta: { schemaVersion: 1, durationMs: 9, warnings: [] }
    });
  }
});

test("inspect_workspace schemas reject malformed, inconsistent, and additional fields", () => {
  const success = createInspectWorkspaceSuccess(sampleData("D:\\Dev\\project"));
  const failure = createInspectWorkspaceFailure({ code: "INTERNAL_ERROR", details: {} });

  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...success, coverage: {} }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...success, schema_version: 1 }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...failure, data: success.data }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({
    ...success,
    data: { ...success.data, extra: true }
  }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({
    ...success,
    data: { ...success.data, returned: { ...success.data.returned, files: 99 } }
  }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({
    ...success,
    data: { ...success.data, output_limited: true }
  }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({
    ...success,
    data: { ...success.data, warnings: [INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING] }
  }));
  assert.throws(() => inspectWorkspaceOutputSchema.parse({
    ...success,
    meta: { ...success.meta, warnings: ["unexpected"] }
  }));
  assert.throws(() => createInspectWorkspaceFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
  }));

  const provider = sampleProvider("D:\\Dev\\project");
  assert.doesNotThrow(() => inspectWorkspaceProviderSchema.parse(provider));
  assert.throws(() => inspectWorkspaceProviderSchema.parse({ ...provider, fingerprint: "BAD" }));
  assert.throws(() => inspectWorkspaceProviderSchema.parse({
    ...provider,
    files: [...provider.files, provider.files[0]],
    coverage: { ...provider.coverage, inventoryFiles: 4 }
  }));
  assert.throws(() => inspectWorkspaceProviderSchema.parse({
    ...provider,
    coverage: { ...provider.coverage, symbolCount: 99 }
  }));
  assert.throws(() => inspectWorkspaceProviderSchema.parse({
    ...provider,
    warnings: ["private provider diagnostic"],
    coverage: { ...provider.coverage, warnings: ["private provider diagnostic"] }
  }));
});

test("inspect_workspace registration modes and exact descriptor are preserved", async () => {
  await withTempWorkspace({ "src/index.ts": "export function main() {}\n" }, async (root) => {
    for (const [overrides, expected] of [
      [{ toolMode: "minimal" }, false],
      [{ toolMode: "standard" }, true],
      [{ toolMode: "full" }, true],
      [{ analysisEnabled: false }, false]
    ]) {
      await withConfigClient(createTestConfig(root, overrides), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "inspect_workspace");
        assert.equal(Boolean(descriptor), expected);
        if (descriptor) {
          assert.ok(descriptor.outputSchema);
          assert.equal(descriptor.outputSchema.type, "object");
          assert.deepEqual(
            new Set(descriptor.outputSchema.required),
            new Set(topKeys)
          );
          assert.equal(descriptor.outputSchema.additionalProperties, false);
        }
      });
    }
  });
});

test("inspect_workspace returns exact nested root, scoped, omitted, and limited success", async () => {
  await withTempWorkspace({
    "package.json": "{\"name\":\"fixture\"}\n",
    "src/index.ts": "import './service.js';\nexport function main() {}\n",
    "src/service.ts": "export const service = 1;\n",
    ".env": "PRIVATE_TOKEN=hidden\n"
  }, async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const opened = await callTool(client, "open_current_workspace", { include_tree: false });
      const workspaceId = opened.structuredContent.data.workspace_id;

      const first = parseInspectResult(await callTool(client, "inspect_workspace", { workspace_id: workspaceId }));
      assert.equal(first.ok, true);
      assert.deepEqual(Object.keys(first.data).sort(), dataKeys);
      assert.equal(first.data.path, ".");
      assert.equal(first.data.root, root);
      assert.equal(first.data.cache.hit, false);
      assert.equal(first.data.files.some((file) => file.path === ".env"), false);
      assert.equal("coverage" in first, false);
      assert.equal("schema_version" in first, false);

      const warm = parseInspectResult(await callTool(client, "inspect_workspace", { workspace_id: workspaceId }));
      assert.equal(warm.data.cache.hit, true);

      const scoped = parseInspectResult(await callTool(client, "inspect_workspace", {
        workspace_id: workspaceId,
        path: "src"
      }));
      assert.equal(scoped.data.path, "src");
      assert.ok(scoped.data.files.every((file) => file.path.startsWith("src/")));
      assert.equal(scoped.data.coverage.inventoryFiles, first.data.coverage.inventoryFiles);

      const missing = parseInspectResult(await callTool(client, "inspect_workspace", {
        workspace_id: workspaceId,
        path: "safe-missing"
      }));
      assert.deepEqual(missing.data.files, []);
      assert.equal(missing.data.coverage.inventoryFiles, first.data.coverage.inventoryFiles);

      const omitted = parseInspectResult(await callTool(client, "inspect_workspace", {
        workspace_id: workspaceId,
        include_symbols: false,
        include_relationships: false
      }));
      assert.deepEqual(omitted.data.symbols, []);
      assert.deepEqual(omitted.data.relationships, []);
      assert.equal(omitted.data.output_limited, false);

      const limited = parseInspectResult(await callTool(client, "inspect_workspace", {
        workspace_id: workspaceId,
        max_files: 1,
        max_symbols: 1,
        max_relationships: 1
      }));
      assert.equal(limited.data.files.length, 1);
      assert.equal(limited.data.returned.files, 1);
      assert.equal(limited.data.output_limited, true);
      assert.equal(limited.data.warnings.at(-1), INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING);
    });
  });
});

test("inspect_workspace provider boundary validates identity, paths, failures, and diagnostics", async () => {
  await withTempWorkspace({
    "package.json": "{\"name\":\"fixture\"}\n",
    "src/index.ts": "export function main() {}\n",
    "src/service.ts": "export const service = 1;\n"
  }, async (root) => {
    let calls = 0;
    let seen;
    await withConfigClient(createTestConfig(root), {
      inspectWorkspaceProvider: async (input) => {
        calls += 1;
        seen = input;
        return sampleProvider(input.workspace.root, input.workspace.id);
      }
    }, async (client) => {
      const result = parseInspectResult(await callTool(client, "inspect_workspace", { path: "src" }));
      assert.equal(result.ok, true);
      assert.equal(result.data.path, "src");
    });
    assert.equal(calls, 1);
    assert.equal(seen.config.defaultRoot, root);
    assert.equal(seen.workspace.root, root);
    assert.equal(typeof seen.guard.resolve, "function");

    for (const inspectWorkspaceProvider of [
      () => { throw new Error(`private provider failure ${root}`); },
      async () => Promise.reject(new Error(`private async failure ${root}`))
    ]) {
      await withConfigClient(createTestConfig(root), { inspectWorkspaceProvider }, async (client) => {
        const result = await callTool(client, "inspect_workspace");
        assertInspectFailure(result, "ANALYSIS_FAILED", {});
        assert.equal(JSON.stringify(result).includes("private"), false);
        assert.equal(JSON.stringify(result).includes(root), false);
      });
    }

    const malformedProviders = [
      (workspace) => sampleProvider(workspace.root, "ws_wrong"),
      (workspace) => sampleProvider(path.join(workspace.root, "wrong"), workspace.id),
      (workspace) => {
        const provider = sampleProvider(workspace.root, workspace.id);
        return {
          ...provider,
          files: [{ ...provider.files[0], path: "../outside.ts" }, ...provider.files.slice(1)]
        };
      },
      (workspace) => {
        const provider = sampleProvider(workspace.root, workspace.id);
        return { ...provider, fingerprint: "invalid" };
      }
    ];

    for (const makeProvider of malformedProviders) {
      await withConfigClient(createTestConfig(root), {
        inspectWorkspaceProvider: async ({ workspace }) => makeProvider(workspace)
      }, async (client) => {
        const result = await callTool(client, "inspect_workspace");
        assertInspectFailure(result, "INTERNAL_ERROR", {});
        assert.equal(JSON.stringify(result).includes("outside.ts"), false);
        assert.equal(JSON.stringify(result).includes("invalid"), false);
      });
    }
  });
});

test("inspect_workspace classifies workspace and path failures without leaking unsafe details", async () => {
  await withTempWorkspace({ "src/index.ts": "export function main() {}\n" }, async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertInspectFailure(
        await callTool(client, "inspect_workspace", { workspace_id: "missing-workspace" }),
        "WORKSPACE_NOT_FOUND",
        { workspace_id: "missing-workspace" }
      );
      assertInspectFailure(
        await callTool(client, "inspect_workspace", { path: ".env" }),
        "PATH_BLOCKED",
        { path: ".env" }
      );
      const outside = await callTool(client, "inspect_workspace", { path: "../outside" });
      assertInspectFailure(outside, "PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" });
      assert.equal(JSON.stringify(outside).includes(root), false);
    });
  });
});

test("inspect_workspace Tool Card is nested-first, failure-aware, and retains flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function inspectWorkspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "inspect_workspace"/);
  assert.match(toolCardWidgetHtml, /return nested \? data\.data : \(data \?\? \{\}\)/);
  assert.match(toolCardWidgetHtml, /const analysis = inspectWorkspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.ok === false/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Workspace analysis unavailable\."/);
});

test("inspect_workspace supertool preserves the exact nested envelope", async () => {
  await withTempWorkspace({ "src/index.ts": "export function main() {}\n" }, async (root) => {
    await withConfigClient(createTestConfig(root, { toolMode: "full" }), {}, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "inspect_workspace",
        args: {}
      });
      assert.equal(result.structuredContent.codexpro_tool, "inspect_workspace");
      assert.equal(result.structuredContent.codexpro_title, "Inspect Workspace");
      assert.equal(result.structuredContent.codexpro_super_action, "inspect_workspace");
      assert.equal(result.structuredContent.wrapped_tool, "inspect_workspace");
      assert.equal(result.structuredContent.ok, true);
      assert.ok(result.structuredContent.data.coverage);
      assert.equal("coverage" in result.structuredContent, false);
    });
  });
});

test("inspect_workspace protected main Smoke migration is exact and fail-closed", async () => {
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const compat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const pairs = [
    ["cardInspect.structuredContent.coverage", "cardInspect.structuredContent.data?.coverage", 1],
    ["workspaceAnalysis.structuredContent.languages", "workspaceAnalysis.structuredContent.data?.languages", 1],
    ["workspaceAnalysis.structuredContent.coverage", "workspaceAnalysis.structuredContent.data?.coverage", 1],
    ["inspectAfterWrite.structuredContent.cache", "inspectAfterWrite.structuredContent.data?.cache", 2],
    ["inspectAfterWrite.structuredContent.files", "inspectAfterWrite.structuredContent.data?.files", 1],
    ["inspectAfterEdit.structuredContent.cache", "inspectAfterEdit.structuredContent.data?.cache", 2],
    ["inspectAfterPatch.structuredContent.cache", "inspectAfterPatch.structuredContent.data?.cache", 2]
  ];

  for (const [oldText, newText, count] of pairs) {
    assert.equal(countOccurrences(protectedMain, oldText), count);
    assert.equal(protectedMain.includes(newText), false);
    assert.equal(compat.includes(oldText), true);
    assert.equal(compat.includes(newText), true);
  }
  assert.match(compat, /replaceExactCount/);
  assert.equal(compat.includes("writeFile"), true);
  assert.equal(compat.includes("fs.writeFile(source"), false);
});

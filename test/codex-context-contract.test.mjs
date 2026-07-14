import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { PathGuard } = await tsImport("../src/guard.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const workspaceModule = await tsImport("../src/workspaceOps.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/codexContext.ts", import.meta.url).catch(() => null);

const { readCodexContext, resolveCodexContextTarget } = workspaceModule;
const {
  CODEX_CONTEXT_ERROR_MESSAGES,
  CODEX_CONTEXT_LIMITED_WARNING,
  CODEX_CONTEXT_REDACTED_WARNING,
  CODEX_CONTEXT_TRUNCATION_MARKER,
  CODEX_CONTEXT_UNAVAILABLE_WARNING,
  codexContextOutputSchema,
  codexContextPreview,
  createCodexContextFailure,
  createCodexContextSuccess
} = schemaModule ?? {};

const DATA_KEYS = [
  "agents_count",
  "agents_files",
  "ai_context_count",
  "ai_context_exists",
  "ai_context_files",
  "bash_mode",
  "context",
  "context_bytes",
  "context_source_bytes",
  "include_ai_bridge",
  "include_git_diff",
  "include_git_status",
  "included_git_diff",
  "included_git_status",
  "max_agent_bytes",
  "max_total_bytes",
  "output_limited",
  "preview",
  "redacted",
  "root",
  "target_kind",
  "target_path",
  "tool_mode",
  "truncated",
  "unavailable_count",
  "unavailable_sources",
  "workspace_id",
  "write_mode"
];

const AI_NAMES = [
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl"
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
  const client = new Client({ name: "codex-context-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codex-context-contract-"));
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

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function sampleData(overrides = {}) {
  const context = overrides.context ?? "# Codex Context\n\nReady.\n";
  const contextBytes = Buffer.byteLength(context, "utf8");
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    target_path: ".",
    target_kind: "directory",
    tool_mode: "full",
    write_mode: "workspace",
    bash_mode: "off",
    include_ai_bridge: false,
    include_git_status: false,
    include_git_diff: false,
    max_agent_bytes: 60_000,
    max_total_bytes: 1_000_000,
    agents_files: [],
    agents_count: 0,
    ai_context_exists: null,
    ai_context_files: [],
    ai_context_count: 0,
    unavailable_sources: [],
    unavailable_count: 0,
    included_git_status: false,
    included_git_diff: false,
    context,
    context_source_bytes: overrides.context_source_bytes ?? contextBytes,
    context_bytes: overrides.context_bytes ?? contextBytes,
    preview: overrides.preview ?? (codexContextPreview?.(context) ?? context),
    truncated: false,
    output_limited: false,
    redacted: false,
    ...overrides
  };
}

function framedProviderText(result, body = "Provider result.\n") {
  return [
    "# Codex Context",
    "",
    `Workspace: ${result.workspaceId}`,
    `Root: ${result.root}`,
    `Target path: ${result.targetPath}`,
    "Bash mode: off",
    "Write mode: workspace",
    "Tool mode: full",
    "",
    "## AGENTS Instructions",
    "",
    body,
    "",
    "## AI Bridge Context",
    "",
    "Provider bridge context.",
    ...(result.gitStatus !== undefined ? ["", "## Git Status", "", result.gitStatus] : []),
    ...(result.gitDiff !== undefined ? ["", "## Git Diff", "", result.gitDiff] : [])
  ].join("\n");
}

function providerResult(overrides = {}) {
  const result = {
    workspaceId: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    targetPath: ".",
    targetKind: "directory",
    agentsFiles: [],
    aiContextExists: null,
    aiContextFiles: [],
    unavailableSources: [],
    gitStatus: undefined,
    gitDiff: undefined,
    ...overrides
  };
  if (overrides.text === undefined) result.text = framedProviderText(result);
  return result;
}

function parseResult(result) {
  assert.equal(typeof codexContextOutputSchema?.parse, "function");
  return codexContextOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.deepEqual(parsed, {
    codexpro_tool: "codex_context",
    codexpro_title: "Codex Context",
    ok: false,
    data: null,
    error: {
      code,
      message: CODEX_CONTEXT_ERROR_MESSAGES[code],
      retryable: false,
      details
    },
    meta: {
      schemaVersion: 1,
      durationMs: parsed.meta.durationMs,
      warnings: []
    }
  });
  assert.ok(parsed.meta.durationMs >= 0);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  return parsed;
}

function expectDataFailure(mutator) {
  const data = structuredClone(sampleData());
  mutator(data);
  assert.throws(() => createCodexContextSuccess(data));
}

test("codex_context schema exports the exact six-field envelope and twenty-eight-field success", () => {
  assert.equal(typeof createCodexContextSuccess, "function");
  assert.equal(typeof createCodexContextFailure, "function");
  assert.equal(typeof codexContextOutputSchema?.parse, "function");
  assert.equal(typeof codexContextPreview, "function");
  assert.equal(typeof CODEX_CONTEXT_ERROR_MESSAGES, "object");
  assert.equal(CODEX_CONTEXT_TRUNCATION_MARKER, "\n...[context truncated]");

  const success = createCodexContextSuccess(sampleData(), 7);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(success.codexpro_tool, "codex_context");
  assert.equal(success.codexpro_title, "Codex Context");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
  assert.equal(success.data.context_bytes, Buffer.byteLength(success.data.context, "utf8"));
  assert.equal(success.data.preview, codexContextPreview(success.data.context));
});

test("codex_context schema derives exact ordered warnings and fixed failures", () => {
  const context = "[REDACTED]";
  const warned = createCodexContextSuccess(sampleData({
    context,
    context_source_bytes: Buffer.byteLength(context),
    context_bytes: Buffer.byteLength(context),
    preview: codexContextPreview?.(context) ?? context,
    unavailable_sources: [
      { source: "agents", path: "AGENTS.md", reason: "blocked", bytes: null },
      { source: "agents", path: "nested/agents.md", reason: "too_large", bytes: 70_000 }
    ],
    unavailable_count: 2,
    output_limited: true,
    redacted: true
  }));
  assert.deepEqual(warned.meta.warnings, [
    CODEX_CONTEXT_UNAVAILABLE_WARNING,
    CODEX_CONTEXT_LIMITED_WARNING,
    CODEX_CONTEXT_REDACTED_WARNING
  ]);

  const failures = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing" }],
    ["TARGET_PATH_BLOCKED", { source: "target_path" }],
    ["TARGET_PATH_OUTSIDE_WORKSPACE", { source: "target_path" }],
    ["TARGET_PATH_INVALID", { source: "target_path" }],
    ["CONTEXT_READ_FAILED", { target_path: "src/demo.ts" }],
    ["INTERNAL_ERROR", {}]
  ];
  for (const [code, details] of failures) {
    const failure = createCodexContextFailure({ code, details }, 3);
    assert.equal(failure.ok, false);
    assert.equal(failure.data, null);
    assert.deepEqual(failure.error, {
      code,
      message: CODEX_CONTEXT_ERROR_MESSAGES[code],
      retryable: false,
      details
    });
    assert.deepEqual(failure.meta, { schemaVersion: 1, durationMs: 3, warnings: [] });
  }
});

test("codex_context schema rejects flat fields and cross-field drift", () => {
  const success = createCodexContextSuccess(sampleData());
  const failure = createCodexContextFailure({ code: "INTERNAL_ERROR", details: {} });
  assert.throws(() => codexContextOutputSchema.parse({ ...success, workspace_id: success.data.workspace_id }));
  assert.throws(() => codexContextOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => codexContextOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => codexContextOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => codexContextOutputSchema.parse({ ...failure, data: success.data }));
  expectDataFailure((data) => { data.extra = true; });
  expectDataFailure((data) => { data.target_path = "../private"; });
  expectDataFailure((data) => { data.tool_mode = "standard"; });
  expectDataFailure((data) => { data.agents_files = ["AGENTS.md", "AGENTS.md"]; data.agents_count = 2; });
  expectDataFailure((data) => { data.agents_count = 1; });
  expectDataFailure((data) => { data.ai_context_exists = false; data.ai_context_files = [".ai-bridge/current-plan.md"]; data.ai_context_count = 1; });
  expectDataFailure((data) => { data.include_ai_bridge = true; data.ai_context_exists = null; });
  expectDataFailure((data) => { data.include_git_status = true; data.included_git_status = false; });
  expectDataFailure((data) => { data.context_bytes += 1; });
  expectDataFailure((data) => { data.context_source_bytes -= 1; });
  expectDataFailure((data) => { data.truncated = true; });
  expectDataFailure((data) => { data.output_limited = true; });
  expectDataFailure((data) => { data.preview = "drift"; });
  expectDataFailure((data) => { data.unavailable_sources = [{ source: "ai_bridge", path: ".ai-bridge/private.txt", reason: "missing", bytes: null }]; data.unavailable_count = 1; });
});

test("codex_context is full-only read-only time-varying and advertises preservation plus output schema", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        assert.equal((await client.listTools()).tools.some((tool) => tool.name === "codex_context"), false);
      });
    }
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const descriptor = (await client.listTools()).tools.find((tool) => tool.name === "codex_context");
      assert.ok(descriptor?.outputSchema);
      assert.deepEqual(new Set(descriptor.outputSchema.required), new Set([
        "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
      ]));
      assert.equal(descriptor.annotations?.readOnlyHint, true);
      assert.equal(descriptor.annotations?.destructiveHint, false);
      assert.equal(descriptor.annotations?.idempotentHint, false);
      assert.equal(descriptor.annotations?.openWorldHint, false);
      assert.equal(descriptor._meta?.["codexpro/preserveStructuredContent"], true);
    });
  });
});

test("codex_context target resolver canonicalizes root file dotted directory and missing future targets", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof resolveCodexContextTarget, "function");
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: new Date(0).toISOString() };
    await fs.mkdir(path.join(root, "src", "config.with.dot"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "demo.ts"), "export {};\n", "utf8");

    assert.deepEqual(await resolveCodexContextTarget(guard, workspace, "  "), { targetPath: ".", targetKind: "directory" });
    assert.deepEqual(await resolveCodexContextTarget(guard, workspace, "src/demo.ts"), { targetPath: "src/demo.ts", targetKind: "file" });
    assert.deepEqual(await resolveCodexContextTarget(guard, workspace, "src/config.with.dot"), { targetPath: "src/config.with.dot", targetKind: "directory" });
    assert.deepEqual(await resolveCodexContextTarget(guard, workspace, "src/future/new.ts"), { targetPath: "src/future/new.ts", targetKind: "missing" });
  });
});

test("codex_context target resolver rejects file parents and canonicalizes safe junction parents", async (context) => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: new Date(0).toISOString() };
    await fs.writeFile(path.join(root, "parent-file"), "not a directory\n", "utf8");
    await assert.rejects(
      resolveCodexContextTarget(guard, workspace, "parent-file/future.ts"),
      /parent|directory/i
    );

    const sourceDir = path.join(root, "canonical-source");
    const linkDir = path.join(root, "canonical-link");
    await fs.mkdir(sourceDir);
    try {
      await fs.symlink(sourceDir, linkDir, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        context.diagnostic("Junction creation is unavailable; canonical parent assertion skipped.");
        return;
      }
      throw error;
    }
    assert.deepEqual(
      await resolveCodexContextTarget(guard, workspace, "canonical-link/future.ts"),
      { targetPath: "canonical-source/future.ts", targetKind: "missing" }
    );
  });
});

test("codex_context reads nested AGENTS and fixed AI sources without creating absent context", async () => {
  await withTempWorkspace(async (root) => {
    await fs.mkdir(path.join(root, "src", "config.with.dot"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "root rule\n", "utf8");
    await fs.writeFile(path.join(root, "src", "AGENTS.override.md"), "src override\n", "utf8");
    await fs.writeFile(path.join(root, "src", "config.with.dot", "agents.md"), "dotted directory rule\n", "utf8");
    const bridge = path.join(root, ".ai-bridge");
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "current-plan.md"), "plan\n", "utf8");
    await fs.writeFile(path.join(bridge, "decisions.md"), "decision\n", "utf8");

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const parsed = parseResult(await callTool(client, "codex_context", {
        target_path: "src/config.with.dot",
        include_git: false,
        include_diff: false
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.target_kind, "directory");
      assert.deepEqual(parsed.data.agents_files, ["AGENTS.md", "src/AGENTS.override.md", "src/config.with.dot/agents.md"]);
      assert.deepEqual(parsed.data.ai_context_files, [".ai-bridge/current-plan.md", ".ai-bridge/decisions.md"]);
      assert.deepEqual(parsed.data.unavailable_sources.filter((item) => item.source === "ai_bridge").map((item) => item.path),
        AI_NAMES.filter((name) => !["current-plan.md", "decisions.md"].includes(name)).map((name) => `.ai-bridge/${name}`));
      assert.equal(parsed.data.included_git_status, false);
      assert.equal(parsed.data.included_git_diff, false);
      assert.ok(parsed.data.context.includes("dotted directory rule"));
      assert.equal(resultText({ content: [{ type: "text", text: parsed.data.context }] }), parsed.data.context);
    });

    const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-context-absent-"));
    try {
      const canonicalSecond = await fs.realpath(secondRoot);
      await withConfigClient(createTestConfig(canonicalSecond), {}, async (client) => {
        const parsed = parseResult(await callTool(client, "codex_context", { include_git: false }));
        assert.equal(parsed.data.ai_context_exists, false);
        assert.deepEqual(parsed.data.ai_context_files, []);
        assert.deepEqual(parsed.data.unavailable_sources.filter((item) => item.source === "ai_bridge"), []);
        await assert.rejects(fs.stat(path.join(canonicalSecond, ".ai-bridge")), { code: "ENOENT" });
      });
    } finally {
      await fs.rm(secondRoot, { recursive: true, force: true });
    }
  });
});

test("codex_context honors a safe custom context directory while keeping the fixed artifact allowlist", async () => {
  await withTempWorkspace(async (root) => {
    const contextDir = "custom-bridge";
    await fs.mkdir(path.join(root, contextDir));
    await fs.writeFile(path.join(root, contextDir, "current-plan.md"), "custom plan\n", "utf8");
    await withConfigClient(createTestConfig(root, { contextDir }), {}, async (client) => {
      const parsed = parseResult(await callTool(client, "codex_context", { include_git: false }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.ai_context_exists, true);
      assert.deepEqual(parsed.data.ai_context_files, [`${contextDir}/current-plan.md`]);
      assert.deepEqual(
        parsed.data.unavailable_sources.filter((item) => item.source === "ai_bridge").map((item) => item.path),
        AI_NAMES.slice(1).map((name) => `${contextDir}/${name}`)
      );
    });
  });
});

test("codex_context keeps AI status and diff switches independent and forwards exact provider context", async () => {
  await withTempWorkspace(async (root) => {
    let observed;
    await withConfigClient(createTestConfig(root, { maxReadBytes: 55_000 }), {
      codexContextProvider: async (context) => {
        observed = context;
        return providerResult({
          workspaceId: context.workspace.id,
          root: context.workspace.root,
          targetPath: context.targetPath,
          targetKind: context.targetKind,
          aiContextExists: null,
          gitDiff: "diff --git a/a b/a\n"
        });
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "codex_context", {
        target_path: ".",
        include_ai_bridge: false,
        include_git: false,
        include_diff: true,
        max_agent_bytes: 80_000
      }));
      assert.equal(parsed.data.include_git_status, false);
      assert.equal(parsed.data.included_git_status, false);
      assert.equal(parsed.data.include_git_diff, true);
      assert.equal(parsed.data.included_git_diff, true);
      assert.equal(parsed.data.max_agent_bytes, 55_000);
      assert.equal(observed.targetPath, ".");
      assert.equal(observed.targetKind, "directory");
      assert.equal(observed.includeAiBridge, false);
      assert.equal(observed.includeGitStatus, false);
      assert.equal(observed.includeGitDiff, true);
      assert.equal(observed.maxAgentBytes, 55_000);
    });
  });
});

test("codex_context returns stable target and workspace failures without leaking unsafe input", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertFailure(await callTool(client, "codex_context", { workspace_id: "missing-workspace" }),
        "WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing-workspace" });
      assertFailure(await callTool(client, "codex_context", { target_path: ".env" }),
        "TARGET_PATH_BLOCKED", { source: "target_path" });
      const outside = path.resolve(root, "..", `private-${path.basename(root)}.txt`);
      const outsideResult = await callTool(client, "codex_context", { target_path: outside });
      assertFailure(outsideResult, "TARGET_PATH_OUTSIDE_WORKSPACE", { source: "target_path" });
      assert.equal(JSON.stringify(outsideResult).includes(outside), false);
      assertFailure(await callTool(client, "codex_context", { target_path: "bad\0path" }),
        "TARGET_PATH_INVALID", { source: "target_path" });
    });
  });
});

test("codex_context maps provider throws and all identity presence and coverage drift safely", async () => {
  await withTempWorkspace(async (root) => {
    const secret = "sk-" + "P".repeat(24);
    await withConfigClient(createTestConfig(root), {
      codexContextProvider: async () => { throw new Error(`private ${secret}`); }
    }, async (client) => {
      const result = await callTool(client, "codex_context", { include_git: false });
      assertFailure(result, "CONTEXT_READ_FAILED", { target_path: "." });
      assert.equal(JSON.stringify(result).includes(secret), false);
    });

    const malformed = [
      providerResult({ workspaceId: "ws_wrong" }),
      providerResult({ root: path.join(root, "wrong") }),
      providerResult({ targetPath: "wrong" }),
      providerResult({ targetKind: "file" }),
      providerResult({ text: "# Codex Context\n\nIncomplete provider framing.\n" }),
      providerResult({ agentsFiles: ["nested/AGENTS.md", "AGENTS.md"] }),
      providerResult({ aiContextExists: true, aiContextFiles: [], unavailableSources: [] }),
      providerResult({ gitStatus: undefined }),
      providerResult({ unavailableSources: [{ source: "agents", path: "../private", reason: "read_failed", bytes: null }] })
    ];
    for (let index = 0; index < malformed.length; index += 1) {
      await withConfigClient(createTestConfig(root), {
        codexContextProvider: async (context) => ({
          ...malformed[index],
          ...(index === 0 ? {} : { workspaceId: context.workspace.id }),
          ...(index === 1 ? {} : { root: context.workspace.root }),
          ...(index === 2 ? {} : { targetPath: context.targetPath }),
          ...(index === 3 ? {} : { targetKind: context.targetKind })
        })
      }, async (client) => {
        const result = await callTool(client, "codex_context", { include_ai_bridge: index === 6, include_git: index === 7 });
        assertFailure(result, "INTERNAL_ERROR", {});
        assert.equal(JSON.stringify(result).includes(secret), false);
      });
    }
  });
});

test("codex_context redacts before UTF-8 capping and preserves exact byte and preview invariants", async () => {
  await withTempWorkspace(async (root) => {
    const secret = "sk-" + "S".repeat(24);
    const body = `${secret}\n${"界".repeat(4_000)}`;
    await withConfigClient(createTestConfig(root, { maxOutputBytes: 4_000 }), {
      codexContextProvider: async (context) => {
        const result = providerResult({
          workspaceId: context.workspace.id,
          root: context.workspace.root,
          targetPath: context.targetPath,
          targetKind: context.targetKind,
          gitStatus: "(no output)"
        });
        return { ...result, text: framedProviderText(result, body) };
      }
    }, async (client) => {
      const result = await callTool(client, "codex_context", { include_ai_bridge: false });
      const parsed = parseResult(result);
      assert.equal(JSON.stringify(result).includes(secret), false);
      assert.equal(parsed.data.redacted, true);
      assert.equal(parsed.data.truncated, true);
      assert.equal(parsed.data.output_limited, true);
      assert.ok(parsed.data.context_source_bytes > parsed.data.context_bytes);
      assert.equal(parsed.data.context_bytes, Buffer.byteLength(parsed.data.context, "utf8"));
      assert.ok(parsed.data.context_bytes <= 4_000);
      assert.ok(parsed.data.context.endsWith(CODEX_CONTEXT_TRUNCATION_MARKER));
      assert.equal(parsed.data.preview, codexContextPreview(parsed.data.context));
      assert.equal(parsed.data.context.includes("�"), false);
      assert.deepEqual(parsed.meta.warnings, [CODEX_CONTEXT_LIMITED_WARNING, CODEX_CONTEXT_REDACTED_WARNING]);
    });
  });
});

test("codex_context Tool Card is nested-first dedicated bounded and retains a flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function codexContextResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "codex_context"/);
  assert.match(toolCardWidgetHtml, /function renderCodexContext\(data\)/);
  assert.match(toolCardWidgetHtml, /context\.preview/);
  assert.match(toolCardWidgetHtml, /context\.agents_files/);
  assert.match(toolCardWidgetHtml, /context\.unavailable_sources/);
  assert.match(toolCardWidgetHtml, /tool === "codex_context"/);
  assert.match(toolCardWidgetHtml, /renderCodexContext\(data\)/);
});

test("codex_context Tool Cards preserve exact long structured context", async () => {
  await withTempWorkspace(async (root) => {
    const body = `${"x".repeat(40_000)}`;
    await withConfigClient(createTestConfig(root, { toolCards: true, maxOutputBytes: 100_000 }), {
      codexContextProvider: async (context) => {
        const result = providerResult({
          workspaceId: context.workspace.id,
          root: context.workspace.root,
          targetPath: context.targetPath,
          targetKind: context.targetKind,
          gitStatus: "(no output)"
        });
        return { ...result, text: framedProviderText(result, body) };
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "codex_context", { include_ai_bridge: false }));
      assert.ok(parsed.data.context.includes(body));
      assert.equal(parsed.data.context_bytes, Buffer.byteLength(parsed.data.context));
      assert.equal(parsed.data.context.includes("structured field truncated"), false);
      assert.ok(parsed.data.preview.length < parsed.data.context.length);
    });
  });
});

test("codex_context supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      codexContextProvider: async (context) => providerResult({
        workspaceId: context.workspace.id,
        root: context.workspace.root,
        targetPath: context.targetPath,
        targetKind: context.targetKind,
        gitStatus: "(no output)"
      })
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "codex_context",
        args: { include_ai_bridge: false }
      });
      assert.equal(result.structuredContent.codexpro_tool, "codex_context");
      assert.equal(result.structuredContent.codexpro_title, "Codex Context");
      assert.equal(result.structuredContent.codexpro_super_action, "codex_context");
      assert.equal(result.structuredContent.wrapped_tool, "codex_context");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.target_path, ".");
      assert.equal("target_path" in result.structuredContent, false);
    });
  });
});

test("codex_context compatibility consumers are exact and protected Smoke sources stay unchanged", async () => {
  const mainCompat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const httpCompat = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const normalizedMainCompat = mainCompat.replace(/\r\n/g, "\n");

  const mainReplacements = [
    ["codexContext.structuredContent.agents_files", "codexContext.structuredContent.data?.agents_files", 3],
    ["lowerContext.structuredContent.agents_files", "lowerContext.structuredContent.data?.agents_files", 2]
  ];
  for (const [before, after, expected] of mainReplacements) {
    assert.equal(countOccurrences(mainCompat, `'${before}'`), 1, before);
    assert.equal(countOccurrences(mainCompat, `'${after}'`), 1, after);
    assert.ok(normalizedMainCompat.includes([
      "  source = replaceExactCount(",
      "    source,",
      `    '${before}',`,
      `    '${after}',`,
      `    ${expected}`,
      "  );"
    ].join("\n")), before);
    assert.equal(countOccurrences(protectedMain, before), expected, before);
  }

  assert.equal(countOccurrences(httpCompat, '"codexContext.structuredContent.workspace_id"'), 1);
  assert.equal(countOccurrences(httpCompat, '"codexContext.structuredContent.data?.workspace_id"'), 1);
  assert.equal(countOccurrences(httpCompat, "replaceExactCount(source, oldText, newText, expectedCount)"), 1);
  assert.equal(countOccurrences(protectedHttp, "codexContext.structuredContent.workspace_id"), 2);
});

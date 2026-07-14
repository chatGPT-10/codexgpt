import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const proContextModule = await tsImport("../src/proContext.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/exportProContext.ts", import.meta.url).catch(() => null);

const {
  buildProContext,
  exportProContext,
  prepareProContextRequest
} = proContextModule;
const {
  EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_ERROR_MESSAGES,
  EXPORT_PRO_CONTEXT_LIMITED_WARNING,
  EXPORT_PRO_CONTEXT_REDACTED_WARNING,
  EXPORT_PRO_CONTEXT_UNAVAILABLE_WARNING,
  createExportProContextFailure,
  createExportProContextSuccess,
  exportProContextOutputSchema
} = schemaModule ?? {};

const DATA_KEYS = [
  "ai_context_file_count",
  "ai_context_files",
  "ai_context_unavailable",
  "ai_context_unavailable_count",
  "bash_mode",
  "bundle_truncated",
  "bytes",
  "candidate_count",
  "changed_file_count",
  "created_context_file_count",
  "created_context_files",
  "diff_truncated",
  "existed",
  "extra_glob_count",
  "extra_globs",
  "file_count",
  "files_included",
  "files_skipped",
  "include_ai_bridge",
  "include_changed_files",
  "include_diff",
  "include_important_files",
  "max_depth",
  "max_diff_bytes",
  "max_file_bytes",
  "max_files",
  "max_total_bytes",
  "omitted_count",
  "output_limited",
  "path",
  "redacted",
  "root",
  "selected_count",
  "selected_paths",
  "sha256",
  "skipped_count",
  "source_bytes",
  "title",
  "tool_mode",
  "truncated",
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

const SCAFFOLD_NAMES = [
  "README.md",
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl",
  "session-log.jsonl"
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

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
  const client = new Client({ name: "export-pro-context-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "export-pro-context-contract-"));
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
  const artifact = overrides.__artifact ?? "# CodexPro Context Bundle\n";
  const bytes = Buffer.byteLength(artifact, "utf8");
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    path: ".ai-bridge/pro-context.md",
    tool_mode: "full",
    write_mode: "workspace",
    bash_mode: "off",
    title: "CodexPro Context Bundle",
    include_important_files: false,
    include_changed_files: false,
    include_diff: false,
    include_ai_bridge: false,
    max_depth: 3,
    max_files: 24,
    max_file_bytes: 60_000,
    max_diff_bytes: 80_000,
    max_total_bytes: 700_000,
    selected_paths: ["demo.txt"],
    selected_count: 1,
    extra_globs: [],
    extra_glob_count: 0,
    changed_file_count: 0,
    candidate_count: 1,
    omitted_count: 0,
    files_included: ["demo.txt"],
    file_count: 1,
    files_skipped: [],
    skipped_count: 0,
    ai_context_files: [],
    ai_context_file_count: 0,
    ai_context_unavailable: [],
    ai_context_unavailable_count: 0,
    created_context_files: [],
    created_context_file_count: 0,
    existed: false,
    source_bytes: bytes,
    bytes,
    sha256: sha256(artifact),
    diff_truncated: false,
    bundle_truncated: false,
    truncated: false,
    output_limited: false,
    redacted: false,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "__artifact"))
  };
}

function preparedRequest(overrides = {}) {
  return {
    title: "CodexPro Context Bundle",
    selectedPaths: ["demo.txt"],
    extraGlobs: [],
    includeImportantFiles: false,
    includeChangedFiles: false,
    includeDiff: false,
    includeAiBridge: false,
    maxDepth: 3,
    maxFiles: 24,
    maxFileBytes: 60_000,
    maxDiffBytes: 80_000,
    maxTotalBytes: 700_000,
    ...overrides
  };
}

function providerResult(context, overrides = {}) {
  const request = context?.request ?? preparedRequest();
  const sourceMarkdown = overrides.sourceMarkdown ?? "# CodexPro Context Bundle\n\nProvider artifact.\n";
  const markdown = overrides.markdown ?? sourceMarkdown;
  const filesIncluded = overrides.filesIncluded ?? ["demo.txt"];
  const filesSkipped = overrides.filesSkipped ?? [];
  const candidateCount = overrides.candidateCount ?? filesIncluded.length + filesSkipped.length;
  const omittedCount = overrides.omittedCount ?? 0;
  const aiContextFiles = overrides.aiContextFiles ?? [];
  const aiContextUnavailable = overrides.aiContextUnavailable ?? [];
  const createdContextFiles = overrides.createdContextFiles ?? [];
  const diffTruncated = overrides.diffTruncated ?? false;
  const bundleTruncated = overrides.bundleTruncated ?? (sourceMarkdown !== markdown);
  return {
    workspaceId: overrides.workspaceId ?? context?.workspace?.id ?? "ws_0123456789abcdef01234567",
    root: overrides.root ?? context?.workspace?.root ?? "D:\\Dev\\project",
    path: overrides.path ?? `${context?.config?.contextDir ?? ".ai-bridge"}/pro-context.md`,
    title: overrides.title ?? request.title,
    selectedPaths: overrides.selectedPaths ?? [...request.selectedPaths],
    extraGlobs: overrides.extraGlobs ?? [...request.extraGlobs],
    includeImportantFiles: overrides.includeImportantFiles ?? request.includeImportantFiles,
    includeChangedFiles: overrides.includeChangedFiles ?? request.includeChangedFiles,
    includeDiff: overrides.includeDiff ?? request.includeDiff,
    includeAiBridge: overrides.includeAiBridge ?? request.includeAiBridge,
    maxDepth: overrides.maxDepth ?? request.maxDepth,
    maxFiles: overrides.maxFiles ?? request.maxFiles,
    maxFileBytes: overrides.maxFileBytes ?? request.maxFileBytes,
    maxDiffBytes: overrides.maxDiffBytes ?? request.maxDiffBytes,
    maxTotalBytes: overrides.maxTotalBytes ?? request.maxTotalBytes,
    changedFileCount: overrides.changedFileCount ?? 0,
    candidateCount,
    omittedCount,
    filesIncluded,
    filesSkipped,
    aiContextFiles,
    aiContextUnavailable,
    createdContextFiles,
    existed: overrides.existed ?? false,
    sourceMarkdown,
    markdown,
    sourceBytes: overrides.sourceBytes ?? Buffer.byteLength(sourceMarkdown, "utf8"),
    bytes: overrides.bytes ?? Buffer.byteLength(markdown, "utf8"),
    sha256: overrides.sha256 ?? sha256(markdown),
    diffTruncated,
    bundleTruncated,
    truncated: overrides.truncated ?? (diffTruncated || bundleTruncated),
    outputLimited: overrides.outputLimited ?? (
      diffTruncated || bundleTruncated || omittedCount > 0 ||
      filesSkipped.some((item) => item.reason === "too_large") ||
      aiContextUnavailable.some((item) => item.reason === "too_large" || item.reason === "output_limit")
    ),
    redacted: overrides.redacted ?? false
  };
}

async function writeProviderResult(context, overrides = {}) {
  const result = providerResult(context, overrides);
  const absolutePath = path.join(context.workspace.root, ...result.path.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, result.markdown, "utf8");
  return result;
}

function parseResult(result) {
  assert.equal(typeof exportProContextOutputSchema?.parse, "function");
  return exportProContextOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.deepEqual(parsed, {
    codexpro_tool: "export_pro_context",
    codexpro_title: "Export Pro Context",
    ok: false,
    data: null,
    error: {
      code,
      message: EXPORT_PRO_CONTEXT_ERROR_MESSAGES[code],
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
  assert.throws(() => createExportProContextSuccess(data));
}

test("export_pro_context schema exports the exact six-field envelope and forty-two-field success", () => {
  assert.equal(typeof createExportProContextSuccess, "function");
  assert.equal(typeof createExportProContextFailure, "function");
  assert.equal(typeof exportProContextOutputSchema?.parse, "function");
  assert.equal(EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER, "\n...[diff truncated]");
  assert.equal(EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER, "\n...[context bundle truncated]");

  const success = createExportProContextSuccess(sampleData(), 9);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
  ]);
  assert.equal(success.codexpro_tool, "export_pro_context");
  assert.equal(success.codexpro_title, "Export Pro Context");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 9, warnings: [] });
});

test("export_pro_context schema derives exact ordered warnings and ten fixed failures", () => {
  const artifact = "# [REDACTED_SECRET]\n";
  const warned = createExportProContextSuccess(sampleData({
    __artifact: artifact,
    max_files: 2,
    candidate_count: 3,
    omitted_count: 1,
    files_skipped: [{ path: "missing.txt", reason: "missing", bytes: null }],
    skipped_count: 1,
    output_limited: true,
    redacted: true
  }));
  assert.deepEqual(warned.meta.warnings, [
    EXPORT_PRO_CONTEXT_UNAVAILABLE_WARNING,
    EXPORT_PRO_CONTEXT_LIMITED_WARNING,
    EXPORT_PRO_CONTEXT_REDACTED_WARNING
  ]);

  const failures = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing" }],
    ["REQUEST_INVALID", { source: "extra_globs" }],
    ["SELECTION_PATH_BLOCKED", { source: "selected_paths" }],
    ["SELECTION_PATH_OUTSIDE_WORKSPACE", { source: "selected_paths" }],
    ["OUTPUT_PATH_BLOCKED", { source: "context_dir" }],
    ["OUTPUT_PATH_OUTSIDE_WORKSPACE", { source: "context_dir" }],
    ["CONTEXT_BUILD_FAILED", {}],
    ["CONTEXT_WRITE_FAILED", {}],
    ["CONTEXT_EXPORT_FAILED", {}],
    ["INTERNAL_ERROR", {}]
  ];
  for (const [code, details] of failures) {
    const failure = createExportProContextFailure({ code, details }, 4);
    assert.equal(failure.ok, false);
    assert.equal(failure.data, null);
    assert.deepEqual(failure.error, {
      code,
      message: EXPORT_PRO_CONTEXT_ERROR_MESSAGES[code],
      retryable: false,
      details
    });
    assert.deepEqual(failure.meta, { schemaVersion: 1, durationMs: 4, warnings: [] });
  }
});

test("export_pro_context schema rejects flat fields and cross-field drift", () => {
  const success = createExportProContextSuccess(sampleData());
  const failure = createExportProContextFailure({ code: "INTERNAL_ERROR", details: {} });
  assert.throws(() => exportProContextOutputSchema.parse({ ...success, path: success.data.path }));
  assert.throws(() => exportProContextOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => exportProContextOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => exportProContextOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => exportProContextOutputSchema.parse({ ...failure, data: success.data }));
  expectDataFailure((data) => { data.extra = true; });
  expectDataFailure((data) => { data.path = "../private"; });
  expectDataFailure((data) => { data.selected_count = 2; });
  expectDataFailure((data) => { data.extra_glob_count = 1; });
  expectDataFailure((data) => { data.candidate_count = 0; });
  expectDataFailure((data) => { data.omitted_count = 1; });
  expectDataFailure((data) => { data.files_included.push("demo.txt"); data.file_count = 2; data.candidate_count = 2; });
  expectDataFailure((data) => { data.files_skipped = [{ path: "../private", reason: "blocked", bytes: null }]; data.skipped_count = 1; data.candidate_count = 2; });
  expectDataFailure((data) => { data.ai_context_files = [".ai-bridge/current-plan.md"]; data.ai_context_file_count = 1; });
  expectDataFailure((data) => { data.created_context_files = [".ai-bridge/private.md"]; data.created_context_file_count = 1; data.include_ai_bridge = true; });
  expectDataFailure((data) => { data.source_bytes -= 1; });
  expectDataFailure((data) => { data.bundle_truncated = true; });
  expectDataFailure((data) => { data.truncated = true; });
  expectDataFailure((data) => { data.output_limited = true; });
  expectDataFailure((data) => { data.sha256 = "bad"; });
});

test("export_pro_context is standard/full write time-varying and advertises exact output", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        assert.equal((await client.listTools()).tools.some((tool) => tool.name === "export_pro_context"), false);
      });
    }
    for (const toolMode of ["standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const descriptor = (await client.listTools()).tools.find((tool) => tool.name === "export_pro_context");
        assert.ok(descriptor?.outputSchema);
        assert.deepEqual(new Set(descriptor.outputSchema.required), new Set([
          "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
        ]));
        assert.equal(descriptor.annotations?.readOnlyHint, false);
        assert.equal(descriptor.annotations?.destructiveHint, false);
        assert.equal(descriptor.annotations?.idempotentHint, false);
        assert.equal(descriptor.annotations?.openWorldHint, false);
        assert.equal(descriptor._meta?.["codexpro/preserveStructuredContent"], true);
      });
    }
    await withConfigClient(createTestConfig(root, { connectionTest: true }), {}, async (client) => {
      assert.equal((await client.listTools()).tools.some((tool) => tool.name === "export_pro_context"), false);
    });
  });
});

test("export_pro_context prepares bounded titles canonical selections safe globs and configured ceilings", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof prepareProContextRequest, "function");
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    const config = createTestConfig(root, {
      maxReadBytes: 55_000,
      maxWriteBytes: 10_000,
      maxOutputBytes: 45_000
    });
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: new Date(0).toISOString() };
    const prepared = await prepareProContextRequest(config, guard, workspace, {
      title: "  One\nTitle  ",
      selectedPaths: [path.join(root, "demo.txt"), "./demo.txt", "src/future.ts"],
      extraGlobs: ["src\\**\\*.ts", "src/**/*.ts"],
      maxFileBytes: 80_000,
      maxTotalBytes: 20_000
    });
    assert.equal(prepared.title, "One Title");
    assert.deepEqual(prepared.selectedPaths, ["demo.txt", "src/future.ts"]);
    assert.deepEqual(prepared.extraGlobs, ["src/**/*.ts"]);
    assert.equal(prepared.maxFileBytes, 55_000);
    assert.equal(prepared.maxDiffBytes, 45_000);
    assert.equal(prepared.maxTotalBytes, 10_000);
    assert.equal(prepared.includeImportantFiles, true);
    assert.equal(prepared.includeChangedFiles, true);
    assert.equal(prepared.includeDiff, true);
    assert.equal(prepared.includeAiBridge, true);
  });
});

test("export_pro_context rejects unsafe selections and globs before any scaffold write", async () => {
  await withTempWorkspace(async (root) => {
    const outside = path.resolve(root, "..", `private-${path.basename(root)}.txt`);
    const cases = [
      [{ selected_paths: [".env"] }, "SELECTION_PATH_BLOCKED", { source: "selected_paths" }],
      [{ selected_paths: [outside] }, "SELECTION_PATH_OUTSIDE_WORKSPACE", { source: "selected_paths" }],
      [{ selected_paths: ["bad\0path"] }, "REQUEST_INVALID", { source: "selected_paths" }],
      [{ extra_globs: ["../**/*.ts"] }, "REQUEST_INVALID", { source: "extra_globs" }]
    ];
    for (const [args, code, details] of cases) {
      await withConfigClient(createTestConfig(root), {}, async (client) => {
        const result = await callTool(client, "export_pro_context", args);
        assertFailure(result, code, details);
        assert.equal(JSON.stringify(result).includes(outside), false);
      });
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")), { code: "ENOENT" });
    }
  });
});

test("export_pro_context reports deterministic candidates omissions and safe skip reasons", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    await fs.writeFile(path.join(root, "large.txt"), "x".repeat(2_000), "utf8");
    await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
    await fs.mkdir(path.join(root, "folder"));
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const parsed = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["missing.txt", "folder", "large.txt", "binary.bin", "demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        include_ai_bridge: false,
        max_files: 4,
        max_file_bytes: 1_000,
        max_total_bytes: 20_000
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.candidate_count, 5);
      assert.equal(parsed.data.omitted_count, 1);
      assert.equal(parsed.data.file_count + parsed.data.skipped_count, 4);
      assert.deepEqual(parsed.data.files_included, ["demo.txt"]);
      assert.deepEqual(parsed.data.files_skipped, [
        { path: "binary.bin", reason: "not_text", bytes: 4 },
        { path: "folder", reason: "not_file", bytes: null },
        { path: "large.txt", reason: "too_large", bytes: 2_000 }
      ]);
      assert.equal(parsed.data.output_limited, true);
      assert.deepEqual(parsed.meta.warnings, [
        EXPORT_PRO_CONTEXT_UNAVAILABLE_WARNING,
        EXPORT_PRO_CONTEXT_LIMITED_WARNING
      ]);
      assert.equal(JSON.stringify(parsed).includes("Refusing to read binary"), false);
    });
  });
});

test("export_pro_context exposes fixed AI coverage created scaffold order custom directory and overwrite state", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    const contextDir = "custom-bridge";
    const config = createTestConfig(root, { contextDir });
    await withConfigClient(config, {}, async (client) => {
      const first = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        max_total_bytes: 20_000
      }));
      assert.deepEqual(first.data.created_context_files, SCAFFOLD_NAMES.map((name) => `${contextDir}/${name}`));
      assert.deepEqual(first.data.ai_context_files, AI_NAMES.map((name) => `${contextDir}/${name}`));
      assert.deepEqual(first.data.ai_context_unavailable, []);
      assert.equal(first.data.created_context_file_count, 9);
      assert.equal(first.data.ai_context_file_count, 7);
      assert.equal(first.data.existed, false);
      assert.equal(first.data.path, `${contextDir}/pro-context.md`);

      const second = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        max_total_bytes: 20_000
      }));
      assert.deepEqual(second.data.created_context_files, []);
      assert.equal(second.data.existed, true);
    });
  });

  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const parsed = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        include_ai_bridge: false,
        max_total_bytes: 20_000
      }));
      assert.deepEqual(parsed.data.ai_context_files, []);
      assert.deepEqual(parsed.data.ai_context_unavailable, []);
      assert.deepEqual(parsed.data.created_context_files, []);
      assert.deepEqual((await fs.readdir(path.join(root, ".ai-bridge"))).sort(), ["pro-context.md"]);
    });
  });
});

test("export_pro_context redacts before UTF-8 bundle capping and reports exact written integrity", async () => {
  await withTempWorkspace(async (root) => {
    const secret = "sk-" + "S".repeat(24);
    await fs.writeFile(path.join(root, "unicode.txt"), `${secret}\n${"界".repeat(12_000)}\n`, "utf8");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "export_pro_context", {
        selected_paths: ["unicode.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        include_ai_bridge: false,
        max_files: 1,
        max_file_bytes: 60_000,
        max_total_bytes: 20_000
      });
      const parsed = parseResult(result);
      const written = await fs.readFile(path.join(root, ".ai-bridge", "pro-context.md"), "utf8");
      assert.equal(written.includes(secret), false);
      assert.equal(written.includes("�"), false);
      assert.ok(written.endsWith(EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER));
      assert.equal(parsed.data.redacted, true);
      assert.equal(parsed.data.bundle_truncated, true);
      assert.equal(parsed.data.truncated, true);
      assert.ok(parsed.data.source_bytes > parsed.data.bytes);
      assert.equal(parsed.data.bytes, Buffer.byteLength(written, "utf8"));
      assert.ok(parsed.data.bytes <= 20_000);
      assert.equal(parsed.data.sha256, sha256(written));
      assert.equal(JSON.stringify(result).includes(secret), false);
      assert.equal(resultText(result).includes(written), false);
    });
  });
});

test("export_pro_context returns stable workspace and configured output failures without leakage", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertFailure(await callTool(client, "export_pro_context", { workspace_id: "missing-workspace" }),
        "WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing-workspace" });
    });
    await withConfigClient(createTestConfig(root, { contextDir: ".env" }), {}, async (client) => {
      assertFailure(await callTool(client, "export_pro_context", { include_ai_bridge: false }),
        "OUTPUT_PATH_BLOCKED", { source: "context_dir" });
    });
    await withConfigClient(createTestConfig(root, { contextDir: "../private-context" }), {}, async (client) => {
      const result = await callTool(client, "export_pro_context", { include_ai_bridge: false });
      assertFailure(result, "OUTPUT_PATH_OUTSIDE_WORKSPACE", { source: "context_dir" });
      assert.equal(JSON.stringify(result).includes("private-context"), false);
    });
  });
});

test("export_pro_context forwards one prepared request and rejects provider throw and semantic drift", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    let observed;
    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async (context) => {
        observed = context;
        return writeProviderResult(context);
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["./demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: false,
        include_ai_bridge: false
      }));
      assert.equal(parsed.ok, true);
      assert.deepEqual(observed.request.selectedPaths, ["demo.txt"]);
      assert.equal(observed.request.maxTotalBytes, 700_000);
      assert.equal(parsed.data.path, ".ai-bridge/pro-context.md");
      assert.equal("markdown" in parsed.data, false);
    });

    const secret = "sk-" + "P".repeat(24);
    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async () => { throw new Error(`private ${secret}`); }
    }, async (client) => {
      const result = await callTool(client, "export_pro_context", {
        selected_paths: ["demo.txt"], include_ai_bridge: false
      });
      assertFailure(result, "CONTEXT_EXPORT_FAILED", {});
      assert.equal(JSON.stringify(result).includes(secret), false);
    });

    const mutators = [
      (value) => { value.workspaceId = "ws_wrong"; },
      (value) => { value.path = "other/pro-context.md"; },
      (value) => { value.selectedPaths = ["other.txt"]; },
      (value) => { value.candidateCount += 1; },
      (value) => { value.createdContextFiles = [".ai-bridge/private.md"]; },
      (value) => { value.sourceBytes += 1; },
      (value) => { value.sha256 = "0".repeat(64); },
      (value) => { value.bundleTruncated = true; value.truncated = true; },
      (value) => { value.sourceMarkdown = "malformed"; }
    ];
    for (const mutate of mutators) {
      await withConfigClient(createTestConfig(root), {
        exportProContextProvider: async (context) => {
          const value = providerResult(context);
          mutate(value);
          return value;
        }
      }, async (client) => {
        assertFailure(await callTool(client, "export_pro_context", {
          selected_paths: ["demo.txt"],
          include_important_files: false,
          include_changed_files: false,
          include_diff: false,
          include_ai_bridge: false
        }), "INTERNAL_ERROR", {});
      });
    }
  });
});

test("export_pro_context verifies the provider artifact on disk before reporting success", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    const args = {
      selected_paths: ["demo.txt"],
      include_important_files: false,
      include_changed_files: false,
      include_diff: false,
      include_ai_bridge: false
    };

    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async (context) => providerResult(context)
    }, async (client) => {
      assertFailure(await callTool(client, "export_pro_context", args), "INTERNAL_ERROR", {});
    });

    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async (context) => {
        const result = providerResult(context);
        const absolutePath = path.join(root, ...result.path.split("/"));
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, "# Wrong artifact\n", "utf8");
        return result;
      }
    }, async (client) => {
      assertFailure(await callTool(client, "export_pro_context", args), "INTERNAL_ERROR", {});
    });
  });
});

test("export_pro_context includes the destination of a quoted Unicode Git rename", async () => {
  await withTempWorkspace(async (root) => {
    const oldName = "旧名.txt";
    const newName = "新名.txt";
    await fs.writeFile(path.join(root, oldName), "renamed\n", "utf8");
    runGit(root, ["init", "--quiet"]);
    runGit(root, ["config", "user.name", "CodexPro Test"]);
    runGit(root, ["config", "user.email", "codexpro-test@example.invalid"]);
    runGit(root, ["config", "core.quotepath", "true"]);
    runGit(root, ["add", "--", oldName]);
    runGit(root, ["commit", "--quiet", "-m", "add unicode file"]);
    await fs.rename(path.join(root, oldName), path.join(root, newName));
    runGit(root, ["add", "-A"]);

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const parsed = parseResult(await callTool(client, "export_pro_context", {
        include_important_files: false,
        include_changed_files: true,
        include_diff: false,
        include_ai_bridge: false,
        max_files: 4
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.changed_file_count, 1);
      assert.deepEqual(parsed.data.files_included, [newName]);
      assert.deepEqual(parsed.data.files_skipped, []);
    });
  });
});

test("export_pro_context provider validates independent diff and bundle truncation", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async (context) => {
        const sourceMarkdown = `# ${context.request.title}${EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER}\n${"界".repeat(8_000)}`;
        const marker = EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER;
        const budget = context.request.maxTotalBytes;
        let prefix = "";
        for (const character of sourceMarkdown) {
          if (Buffer.byteLength(prefix + character + marker, "utf8") > budget) break;
          prefix += character;
        }
        const markdown = prefix + marker;
        return writeProviderResult(context, {
          sourceMarkdown,
          markdown,
          diffTruncated: true,
          bundleTruncated: true,
          truncated: true,
          outputLimited: true
        });
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "export_pro_context", {
        selected_paths: ["demo.txt"],
        include_important_files: false,
        include_changed_files: false,
        include_diff: true,
        include_ai_bridge: false,
        max_total_bytes: 20_000
      }));
      assert.equal(parsed.data.diff_truncated, true);
      assert.equal(parsed.data.bundle_truncated, true);
      assert.equal(parsed.data.truncated, true);
      assert.equal(parsed.data.output_limited, true);
      assert.deepEqual(parsed.meta.warnings, [EXPORT_PRO_CONTEXT_LIMITED_WARNING]);
    });
  });
});

test("export_pro_context Tool Card is nested-first dedicated bounded and retains a flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function exportProContextResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "export_pro_context"/);
  assert.match(toolCardWidgetHtml, /function renderExportProContext\(data\)/);
  assert.match(toolCardWidgetHtml, /context\.files_included/);
  assert.match(toolCardWidgetHtml, /context\.files_skipped/);
  assert.match(toolCardWidgetHtml, /context\.created_context_files/);
  assert.match(toolCardWidgetHtml, /context\.sha256/);
  assert.match(toolCardWidgetHtml, /tool === "export_pro_context"/);
  assert.match(toolCardWidgetHtml, /renderExportProContext\(data\)/);
  assert.doesNotMatch(toolCardWidgetHtml, /tool === "export_pro_context"\) \{\s*root\.innerHTML = renderFile\(data\)/);
});

test("export_pro_context build and export compatibility wrappers retain CLI and self-test fields", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof buildProContext, "function");
    assert.equal(typeof exportProContext, "function");
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: new Date(0).toISOString() };
    const options = {
      selectedPaths: ["demo.txt"],
      includeImportantFiles: false,
      includeChangedFiles: false,
      includeDiff: false,
      includeAiBridge: false,
      maxFiles: 1,
      maxTotalBytes: 20_000
    };
    const built = await buildProContext(config, guard, workspace, options);
    assert.deepEqual(built.filesIncluded, ["demo.txt"]);
    assert.equal(typeof built.markdown, "string");
    const exported = await exportProContext(config, guard, workspace, options);
    assert.equal(exported.path, ".ai-bridge/pro-context.md");
    assert.deepEqual(exported.filesIncluded, ["demo.txt"]);
    assert.equal(Array.isArray(exported.filesSkipped), true);
    assert.equal(typeof exported.bytes, "number");
    assert.equal(typeof exported.truncated, "boolean");
    assert.equal(typeof exported.markdown, "string");
    assert.equal(exported.sha256, sha256(exported.markdown));
  });
});

test("export_pro_context supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "demo\n", "utf8");
    await withConfigClient(createTestConfig(root), {
      exportProContextProvider: async (context) => writeProviderResult(context)
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "pro_export",
        args: {
          selected_paths: ["demo.txt"],
          include_important_files: false,
          include_changed_files: false,
          include_diff: false,
          include_ai_bridge: false
        }
      });
      assert.equal(result.structuredContent.codexpro_tool, "export_pro_context");
      assert.equal(result.structuredContent.codexpro_title, "Export Pro Context");
      assert.equal(result.structuredContent.codexpro_super_action, "pro_export");
      assert.equal(result.structuredContent.wrapped_tool, "export_pro_context");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.path, ".ai-bridge/pro-context.md");
      assert.equal("path" in result.structuredContent, false);
    });
  });
});

test("export_pro_context compatibility consumers are exact and protected Smoke sources stay unchanged", async () => {
  const mainCompat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const httpCompat = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");

  const mainReplacements = [
    ["exported.structuredContent.path", "exported.structuredContent.data?.path", 1],
    ["exported.structuredContent.files_included", "exported.structuredContent.data?.files_included", 2],
    ["oneFileExport.structuredContent.files_included", "oneFileExport.structuredContent.data?.files_included", 2],
    ["exactExport.structuredContent.files_included", "exactExport.structuredContent.data?.files_included", 4]
  ];
  for (const [before, after, expected] of mainReplacements) {
    assert.equal(countOccurrences(mainCompat, `'${before}'`), 1, before);
    assert.equal(countOccurrences(mainCompat, `'${after}'`), 1, after);
    assert.ok(mainCompat.includes([
      "  source = replaceExactCount(",
      "    source,",
      `    '${before}',`,
      `    '${after}',`,
      `    ${expected}`,
      "  );"
    ].join("\n")), before);
    assert.equal(countOccurrences(protectedMain, before), expected, before);
  }

  assert.equal(countOccurrences(httpCompat, '"exported.structuredContent.path"'), 1);
  assert.equal(countOccurrences(httpCompat, '"exported.structuredContent.data?.path"'), 1);
  assert.equal(countOccurrences(protectedHttp, "exported.structuredContent.path"), 2);
  assert.equal(countOccurrences(stress, "exactExport.structuredContent.data?.files_included"), 3);
  assert.equal(countOccurrences(stress, "superExport.structuredContent.data?.files_included"), 3);
  assert.equal(countOccurrences(stress, "hiddenGlobExport.structuredContent.data?.files_included"), 2);
  assert.equal(countOccurrences(stress, ".structuredContent.files_included"), 0);
});

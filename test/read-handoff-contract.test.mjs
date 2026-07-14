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
const { readHandoffContext } = await tsImport("../src/workspaceOps.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/readHandoff.ts", import.meta.url).catch(() => null);

const {
  READ_HANDOFF_ARTIFACT_DEFINITIONS,
  READ_HANDOFF_ERROR_MESSAGES,
  READ_HANDOFF_LIMITED_WARNING,
  READ_HANDOFF_REDACTED_WARNING,
  READ_HANDOFF_UNAVAILABLE_WARNING,
  createReadHandoffFailure,
  createReadHandoffSuccess,
  readHandoffOutputSchema
} = schemaModule ?? {};

const EXPECTED_DEFINITIONS = [
  ["current-plan.md", "plan"],
  ["agent-status.md", "agent_status"],
  ["implementation-diff.patch", "implementation_diff"],
  ["codex-status.md", "codex_status"],
  ["decisions.md", "decisions"],
  ["open-questions.md", "open_questions"],
  ["execution-log.jsonl", "execution_log"]
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
  const client = new Client({ name: "read-handoff-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "read-handoff-contract-"));
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

function lineCount(text) {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
  return breaks + (/\r\n$|[\n\r]$/.test(text) ? 0 : 1);
}

function artifactPath(name, contextDir = ".ai-bridge") {
  return `${contextDir}/${name}`;
}

function sampleArtifact(overrides = {}) {
  const text = overrides.text ?? "# Current plan\n";
  const bytes = overrides.bytes ?? Buffer.byteLength(text, "utf8");
  return {
    path: artifactPath("current-plan.md"),
    kind: "plan",
    bytes,
    line_count: overrides.line_count ?? lineCount(text),
    returned_bytes: overrides.returned_bytes ?? Buffer.byteLength(text, "utf8"),
    redacted: false,
    text,
    ...overrides
  };
}

function defaultUnavailable(artifacts, contextDir = ".ai-bridge") {
  const readable = new Set(artifacts.map((artifact) => artifact.path));
  return EXPECTED_DEFINITIONS
    .map(([name, kind]) => ({ path: artifactPath(name, contextDir), kind }))
    .filter((item) => !readable.has(item.path))
    .map((item) => ({ ...item, reason: "missing", bytes: null }));
}

function sampleReadData(overrides = {}) {
  const contextDir = overrides.context_dir ?? ".ai-bridge";
  const contextExists = overrides.context_exists ?? true;
  const artifacts = overrides.artifacts ?? (contextExists ? [sampleArtifact()] : []);
  const unavailable = overrides.unavailable ?? (contextExists ? defaultUnavailable(artifacts, contextDir) : []);
  const files = overrides.files ?? artifacts.map((artifact) => artifact.path);
  const loadedBytes = overrides.loaded_bytes ?? artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  const returnedBytes = overrides.returned_bytes ?? artifacts.reduce((sum, artifact) => sum + artifact.returned_bytes, 0);
  const outputLimited = overrides.output_limited ?? unavailable.some((item) =>
    item.reason === "too_large" || item.reason === "output_limit"
  );
  const redacted = overrides.redacted ?? artifacts.some((artifact) => artifact.redacted);
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    context_dir: contextDir,
    context_exists: contextExists,
    max_file_bytes: 80_000,
    max_total_bytes: 240_000,
    artifacts,
    files,
    file_count: overrides.file_count ?? artifacts.length,
    unavailable,
    unavailable_count: overrides.unavailable_count ?? unavailable.length,
    loaded_bytes: loadedBytes,
    returned_bytes: returnedBytes,
    output_limited: outputLimited,
    redacted,
    ...overrides
  };
}

function publicToProvider(data) {
  return {
    contextDir: data.context_dir,
    contextExists: data.context_exists,
    artifacts: data.artifacts.map((artifact) => ({
      path: artifact.path,
      kind: artifact.kind,
      bytes: artifact.bytes,
      lineCount: artifact.line_count,
      text: artifact.text
    })),
    unavailable: data.unavailable.map((item) => ({ ...item }))
  };
}

function parseReadHandoffResult(result) {
  assert.equal(typeof readHandoffOutputSchema?.parse, "function");
  return readHandoffOutputSchema.parse(result.structuredContent);
}

function assertReadHandoffFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseReadHandoffResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: READ_HANDOFF_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(READ_HANDOFF_ERROR_MESSAGES[code]));
  return parsed;
}

test("read_handoff schema exports fixed definitions and exact populated and absent successes", () => {
  assert.equal(typeof createReadHandoffSuccess, "function");
  assert.equal(typeof createReadHandoffFailure, "function");
  assert.equal(typeof readHandoffOutputSchema?.parse, "function");
  assert.deepEqual(
    READ_HANDOFF_ARTIFACT_DEFINITIONS.map((item) => [item.name, item.kind]),
    EXPECTED_DEFINITIONS
  );

  const populated = createReadHandoffSuccess(sampleReadData(), 7);
  assert.deepEqual(Object.keys(populated).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(populated.codexpro_tool, "read_handoff");
  assert.equal(populated.codexpro_title, "Read Handoff");
  assert.equal(populated.ok, true);
  assert.equal(populated.error, null);
  assert.deepEqual(Object.keys(populated.data).sort(), [
    "artifacts",
    "context_dir",
    "context_exists",
    "file_count",
    "files",
    "loaded_bytes",
    "max_file_bytes",
    "max_total_bytes",
    "output_limited",
    "redacted",
    "returned_bytes",
    "root",
    "unavailable",
    "unavailable_count",
    "workspace_id"
  ]);
  assert.deepEqual(Object.keys(populated.data.artifacts[0]).sort(), [
    "bytes", "kind", "line_count", "path", "redacted", "returned_bytes", "text"
  ]);
  assert.deepEqual(Object.keys(populated.data.unavailable[0]).sort(), ["bytes", "kind", "path", "reason"]);
  assert.deepEqual(populated.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });

  const absent = createReadHandoffSuccess(sampleReadData({ context_exists: false }));
  assert.equal(absent.data.context_exists, false);
  assert.deepEqual(absent.data.artifacts, []);
  assert.deepEqual(absent.data.files, []);
  assert.deepEqual(absent.data.unavailable, []);
  assert.equal(absent.data.loaded_bytes, 0);
  assert.equal(absent.data.returned_bytes, 0);
  assert.equal(absent.data.output_limited, false);
  assert.equal(absent.data.redacted, false);
  assert.deepEqual(absent.meta.warnings, []);
});

test("read_handoff schema derives exact safe unavailable limited and redacted warnings", () => {
  const redactedText = "OPENAI_API_KEY= [REDACTED_SECRET]\n";
  const artifact = sampleArtifact({
    text: redactedText,
    bytes: 80,
    line_count: 1,
    returned_bytes: Buffer.byteLength(redactedText),
    redacted: true
  });
  const unavailable = defaultUnavailable([artifact]);
  unavailable[0] = { ...unavailable[0], reason: "blocked", bytes: null };
  unavailable[1] = { ...unavailable[1], reason: "too_large", bytes: 80_001 };
  const success = createReadHandoffSuccess(sampleReadData({ artifacts: [artifact], unavailable }));
  assert.deepEqual(success.meta.warnings, [
    READ_HANDOFF_UNAVAILABLE_WARNING,
    READ_HANDOFF_LIMITED_WARNING,
    READ_HANDOFF_REDACTED_WARNING
  ]);
});

test("read_handoff schema creates all exact stable failures", () => {
  const cases = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing-workspace" }],
    ["WORKSPACE_NOT_FOUND", { source: "default_workspace", workspace_id: null }],
    ["HANDOFF_READ_FAILED", { context_dir: ".ai-bridge" }],
    ["INTERNAL_ERROR", {}]
  ];
  for (const [code, details] of cases) {
    assert.deepEqual(createReadHandoffFailure({ code, details }, 9), {
      codexpro_tool: "read_handoff",
      codexpro_title: "Read Handoff",
      ok: false,
      data: null,
      error: {
        code,
        message: READ_HANDOFF_ERROR_MESSAGES[code],
        retryable: false,
        details
      },
      meta: { schemaVersion: 1, durationMs: 9, warnings: [] }
    });
  }
});

test("read_handoff schema rejects flat unsafe inconsistent drift and additional fields", () => {
  const success = createReadHandoffSuccess(sampleReadData());
  const failure = createReadHandoffFailure({ code: "INTERNAL_ERROR", details: {} });
  const expectDataFailure = (mutate) => {
    const candidate = structuredClone(success);
    mutate(candidate.data, candidate);
    assert.throws(() => readHandoffOutputSchema.parse(candidate));
  };

  assert.throws(() => readHandoffOutputSchema.parse({ ...success, files: success.data.files }));
  assert.throws(() => readHandoffOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => readHandoffOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => readHandoffOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => readHandoffOutputSchema.parse({ ...failure, data: success.data }));
  assert.throws(() => readHandoffOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => createReadHandoffFailure({ code: "INTERNAL_ERROR", details: { diagnostic: "private" } }));
  expectDataFailure((data) => { data.extra = true; });
  expectDataFailure((data) => { data.context_dir = "../private"; });
  expectDataFailure((data) => { data.artifacts[0].path = "D:/private/current-plan.md"; data.files[0] = data.artifacts[0].path; });
  expectDataFailure((data) => { data.artifacts[0].kind = "decisions"; });
  expectDataFailure((data) => { data.unavailable.pop(); data.unavailable_count -= 1; });
  expectDataFailure((data) => { data.unavailable.reverse(); });
  expectDataFailure((data) => { data.unavailable[0].path = data.artifacts[0].path; });
  expectDataFailure((data) => { data.files = []; });
  expectDataFailure((data) => { data.file_count += 1; });
  expectDataFailure((data) => { data.unavailable_count += 1; });
  expectDataFailure((data) => { data.loaded_bytes += 1; });
  expectDataFailure((data) => { data.returned_bytes += 1; });
  expectDataFailure((data) => { data.artifacts[0].returned_bytes += 1; });
  expectDataFailure((data) => { data.artifacts[0].bytes = data.max_file_bytes + 1; data.loaded_bytes = data.artifacts[0].bytes; });
  expectDataFailure((data) => { data.artifacts[0].line_count += 1; });
  expectDataFailure((data) => { data.redacted = true; });
  expectDataFailure((data) => { data.output_limited = true; });
  expectDataFailure((data) => { data.unavailable[0].reason = "too_large"; data.unavailable[0].bytes = null; data.output_limited = true; });
  expectDataFailure((data) => { data.context_exists = false; });
  assert.throws(() => readHandoffOutputSchema.parse({
    ...success,
    meta: { ...success.meta, warnings: ["private diagnostic"] }
  }));
});

test("read_handoff is standard full only read-only and advertises exact output schema", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { toolMode: "minimal" }), {}, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === "read_handoff"), false);
    });

    for (const toolMode of ["standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "read_handoff");
        assert.ok(descriptor);
        assert.ok(descriptor.outputSchema);
        assert.equal(descriptor.outputSchema.type, "object");
        assert.deepEqual(
          new Set(descriptor.outputSchema.required),
          new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
        );
        assert.equal(descriptor.annotations?.readOnlyHint, true);
        assert.equal(descriptor.annotations?.destructiveHint, false);
      });
    }
  });
});

test("read_handoff returns an exact non-creating absent-context success", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "read_handoff");
      const parsed = parseReadHandoffResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.context_dir, ".ai-bridge");
      assert.equal(parsed.data.context_exists, false);
      assert.deepEqual(parsed.data.artifacts, []);
      assert.deepEqual(parsed.data.unavailable, []);
      assert.deepEqual(parsed.meta.warnings, []);
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")), { code: "ENOENT" });
    });
  });
});

test("read_handoff reads fixed complete artifacts with missing empty redacted and byte semantics", async () => {
  await withTempWorkspace(async (root) => {
    const bridge = path.join(root, ".ai-bridge");
    const syntheticSecret = "sk-" + "R".repeat(24);
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "current-plan.md"), "# Plan\n\nDo the work.\n", "utf8");
    await fs.writeFile(path.join(bridge, "agent-status.md"), `OPENAI_API_KEY=${syntheticSecret}\n`, "utf8");
    await fs.writeFile(path.join(bridge, "decisions.md"), "", "utf8");

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "read_handoff", {});
      const parsed = parseReadHandoffResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.context_exists, true);
      assert.deepEqual(parsed.data.files, [
        ".ai-bridge/current-plan.md",
        ".ai-bridge/agent-status.md",
        ".ai-bridge/decisions.md"
      ]);
      assert.equal(parsed.data.file_count, 3);
      assert.equal(parsed.data.unavailable_count, 4);
      assert.equal(parsed.data.unavailable.every((item) => item.reason === "missing"), true);
      assert.deepEqual(parsed.meta.warnings, [READ_HANDOFF_REDACTED_WARNING]);
      const empty = parsed.data.artifacts.find((item) => item.kind === "decisions");
      assert.deepEqual(
        { bytes: empty.bytes, line_count: empty.line_count, returned_bytes: empty.returned_bytes, text: empty.text },
        { bytes: 0, line_count: 0, returned_bytes: 0, text: "" }
      );
      const redacted = parsed.data.artifacts.find((item) => item.kind === "agent_status");
      assert.equal(redacted.redacted, true);
      assert.equal(redacted.text.includes(syntheticSecret), false);
      assert.equal(redacted.text.includes("[REDACTED_SECRET]"), true);
      assert.equal(redacted.returned_bytes, Buffer.byteLength(redacted.text));
      assert.equal(parsed.data.loaded_bytes, parsed.data.artifacts.reduce((sum, item) => sum + item.bytes, 0));
      assert.equal(parsed.data.returned_bytes, parsed.data.artifacts.reduce((sum, item) => sum + item.returned_bytes, 0));
      assert.equal(JSON.stringify(result).includes(syntheticSecret), false);
    });
  });
});

test("read_handoff classifies per-file and aggregate bounds without partial artifact prefixes", async () => {
  await withTempWorkspace(async (root) => {
    const bridge = path.join(root, ".ai-bridge");
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "current-plan.md"), "a".repeat(9_001), "utf8");
    await fs.writeFile(path.join(bridge, "agent-status.md"), "b".repeat(5_000), "utf8");
    await fs.writeFile(path.join(bridge, "implementation-diff.patch"), "c".repeat(5_000), "utf8");

    await withConfigClient(createTestConfig(root, {
      maxReadBytes: 9_000,
      maxOutputBytes: 9_000
    }), {}, async (client) => {
      const parsed = parseReadHandoffResult(await callTool(client, "read_handoff"));
      assert.equal(parsed.data.max_file_bytes, 9_000);
      assert.equal(parsed.data.max_total_bytes, 9_000);
      assert.deepEqual(parsed.data.files, [".ai-bridge/agent-status.md"]);
      assert.equal(parsed.data.artifacts[0].text.length, 5_000);
      assert.deepEqual(
        parsed.data.unavailable.slice(0, 2).map((item) => [item.kind, item.reason, item.bytes]),
        [["plan", "too_large", 9_001], ["implementation_diff", "output_limit", 5_000]]
      );
      assert.equal(parsed.data.output_limited, true);
      assert.deepEqual(parsed.meta.warnings, [READ_HANDOFF_LIMITED_WARNING]);
    });
  });
});

test("read_handoff safely classifies blocked and non-text artifacts", async () => {
  await withTempWorkspace(async (root) => {
    const bridge = path.join(root, ".ai-bridge");
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "current-plan.md"), Buffer.from([0x00, 0x01, 0x02, 0x03]));
    await fs.writeFile(path.join(bridge, "decisions.md"), "private decision\n", "utf8");

    await withConfigClient(createTestConfig(root, {
      blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**", ".ai-bridge/decisions.md"]
    }), {}, async (client) => {
      const result = await callTool(client, "read_handoff");
      const parsed = parseReadHandoffResult(result);
      assert.deepEqual(
        parsed.data.unavailable.filter((item) => item.reason !== "missing").map((item) => [item.kind, item.reason, item.bytes]),
        [["plan", "not_text", 4], ["decisions", "blocked", null]]
      );
      assert.deepEqual(parsed.meta.warnings, [READ_HANDOFF_UNAVAILABLE_WARNING]);
      assert.equal(JSON.stringify(result).includes("private decision"), false);
    });
  });
});

test("read_handoff domain fails closed when the immediate pre-read boundary check changes", async () => {
  await withTempWorkspace(async (root) => {
    const bridge = path.join(root, ".ai-bridge");
    const currentPlan = path.join(bridge, "current-plan.md");
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(currentPlan, "# Plan\n", "utf8");
    let currentPlanResolutions = 0;
    const privateDiagnostic = `private boundary diagnostic ${root}`;
    const fakeGuard = {
      resolve(_workspace, inputPath) {
        if (inputPath === ".ai-bridge") {
          return { absPath: bridge, relPath: inputPath };
        }
        if (inputPath === ".ai-bridge/current-plan.md") {
          currentPlanResolutions += 1;
          if (currentPlanResolutions === 2) throw new Error(privateDiagnostic);
          return { absPath: currentPlan, relPath: inputPath };
        }
        return {
          absPath: path.join(root, ...inputPath.split("/")),
          relPath: inputPath
        };
      },
      async assertTextFile() {}
    };
    const workspace = {
      id: "ws_0123456789abcdef01234567",
      root,
      openedAt: new Date(0).toISOString()
    };
    const result = await readHandoffContext(
      createTestConfig(root),
      fakeGuard,
      workspace,
      { maxFileBytes: 80_000, maxTotalBytes: 240_000 }
    );
    assert.deepEqual(
      result.unavailable.find((item) => item.kind === "plan"),
      {
        path: ".ai-bridge/current-plan.md",
        kind: "plan",
        reason: "blocked",
        bytes: null
      }
    );
    assert.equal(JSON.stringify(result).includes(privateDiagnostic), false);
  });
});

test("read_handoff echoes provider context and returns stable workspace provider and malformed failures", async () => {
  await withTempWorkspace(async (root) => {
    let observed;
    const data = sampleReadData();
    await withConfigClient(createTestConfig(root), {
      readHandoffProvider: async (context) => {
        observed = context;
        return publicToProvider(data);
      }
    }, async (client) => {
      const parsed = parseReadHandoffResult(await callTool(client, "read_handoff"));
      assert.equal(parsed.ok, true);
      assert.equal(observed.workspace.root, root);
      assert.equal(observed.config.contextDir, ".ai-bridge");
      assert.deepEqual(observed.limits, { maxFileBytes: 80_000, maxTotalBytes: 240_000 });
      assert.equal(parsed.data.artifacts[0].text, data.artifacts[0].text);
    });

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertReadHandoffFailure(
        await callTool(client, "read_handoff", { workspace_id: "missing-workspace" }),
        "WORKSPACE_NOT_FOUND",
        { source: "workspace_id", workspace_id: "missing-workspace" }
      );
    });

    const privateFailure = `private provider failure ${root} ${"sk-" + "Q".repeat(24)}`;
    await withConfigClient(createTestConfig(root), {
      readHandoffProvider: async () => { throw new Error(privateFailure); }
    }, async (client) => {
      const result = await callTool(client, "read_handoff");
      assertReadHandoffFailure(result, "HANDOFF_READ_FAILED", { context_dir: ".ai-bridge" });
      assert.equal(JSON.stringify(result).includes(privateFailure), false);
      assert.equal(JSON.stringify(result).includes(root), false);
    });

    const malformed = publicToProvider(sampleReadData());
    malformed.artifacts[0].path = "D:/private/current-plan.md";
    malformed.diagnostic = privateFailure;
    await withConfigClient(createTestConfig(root), {
      readHandoffProvider: async () => malformed
    }, async (client) => {
      const result = await callTool(client, "read_handoff");
      assertReadHandoffFailure(result, "INTERNAL_ERROR", {});
      assert.equal(JSON.stringify(result).includes("private provider failure"), false);
      assert.equal(JSON.stringify(result).includes(root), false);
    });

    const omittedBody = publicToProvider(sampleReadData({
      artifacts: [sampleArtifact({
        text: "",
        bytes: 1,
        line_count: 0,
        returned_bytes: 0
      })]
    }));
    await withConfigClient(createTestConfig(root), {
      readHandoffProvider: async () => omittedBody
    }, async (client) => {
      assertReadHandoffFailure(
        await callTool(client, "read_handoff"),
        "INTERNAL_ERROR",
        {}
      );
    });
  });
});

test("read_handoff Tool Card is nested-first dedicated bounded and keeps historical flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function readHandoffResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "read_handoff"/);
  assert.match(toolCardWidgetHtml, /return nested \? data\.data : \(data \?\? \{\}\)/);
  assert.match(toolCardWidgetHtml, /function renderReadHandoff\(data\)/);
  assert.match(toolCardWidgetHtml, /previewLines\(artifact\.text, 20\)/);
  assert.match(toolCardWidgetHtml, /handoff\.unavailable/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Handoff context unavailable\."/);
  assert.match(toolCardWidgetHtml, /tool === "read_handoff"/);
  assert.match(toolCardWidgetHtml, /renderReadHandoff\(data\)/);
  assert.doesNotMatch(toolCardWidgetHtml, /tool === "read_handoff"[\s\S]{0,100}renderTextSummary/);
});

test("read_handoff with Tool Cards preserves long exact structured artifact bodies", async () => {
  await withTempWorkspace(async (root) => {
    const text = "x".repeat(40_000);
    const artifact = sampleArtifact({
      text,
      bytes: 40_000,
      line_count: 1,
      returned_bytes: 40_000
    });
    const data = sampleReadData({ artifacts: [artifact] });
    await withConfigClient(createTestConfig(root, { toolCards: true }), {
      readHandoffProvider: async () => publicToProvider(data)
    }, async (client) => {
      const parsed = parseReadHandoffResult(await callTool(client, "read_handoff"));
      assert.equal(parsed.data.artifacts[0].text.length, 40_000);
      assert.equal(parsed.data.artifacts[0].returned_bytes, 40_000);
      assert.equal(parsed.data.artifacts[0].text.includes("structured field truncated"), false);
    });
  });
});

test("read_handoff supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    const data = sampleReadData();
    await withConfigClient(createTestConfig(root), {
      readHandoffProvider: async () => publicToProvider(data)
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "read_handoff",
        args: {}
      });
      assert.equal(result.structuredContent.codexpro_tool, "read_handoff");
      assert.equal(result.structuredContent.codexpro_title, "Read Handoff");
      assert.equal(result.structuredContent.codexpro_super_action, "read_handoff");
      assert.equal(result.structuredContent.wrapped_tool, "read_handoff");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.artifacts[0].text, data.artifacts[0].text);
      assert.equal("files" in result.structuredContent, false);
      assert.equal("preview" in result.structuredContent, false);
    });
  });
});

test("read_handoff compatibility consumer is exact and protected Smoke sources stay unchanged", async () => {
  const mainCompat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const httpCompat = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");

  assert.match(mainCompat, /handoffContext\.structuredContent\.data\?\.files/);
  assert.equal(countOccurrences(mainCompat, "'handoffContext.structuredContent.files'"), 1);
  assert.equal(countOccurrences(mainCompat, "'handoffContext.structuredContent.data?.files'"), 1);
  assert.equal(httpCompat.includes("handoffContext.structuredContent"), false);
  assert.equal(countOccurrences(protectedMain, "handoffContext.structuredContent.files"), 1);
  assert.equal(countOccurrences(protectedHttp, "handoffContext.structuredContent"), 0);
});

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
const {
  READ_ERROR_MESSAGES,
  createReadFailure,
  createReadSuccess,
  readOutputSchema
} = await tsImport("../src/tools/schemas/read.ts", import.meta.url);

function sampleReadData() {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "src/server.ts",
    text: "1 | import path from \"node:path\";",
    startLine: 1,
    endLine: 1,
    totalLines: 20,
    bytes: 1234,
    sha256: "a".repeat(64),
    truncated: true
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
    details: { path: ".git/config" },
    message: "The requested path is blocked by safety rules."
  },
  {
    code: "FILE_NOT_FOUND",
    details: { path: "missing.txt" },
    message: "The requested path does not exist."
  },
  {
    code: "NOT_A_FILE",
    details: { path: "src" },
    message: "The requested path is not a regular file."
  },
  {
    code: "FILE_TOO_LARGE",
    details: { path: "large.txt", scope: "selection", limit_bytes: 1000 },
    message: "The requested file or selected line range exceeds the configured read limit."
  },
  {
    code: "FILE_NOT_TEXT",
    details: { path: "assets/image.bin" },
    message: "The requested file is not supported as text."
  },
  {
    code: "INVALID_LINE_RANGE",
    details: { path: "src/server.ts", start_line: 200, end_line: 100 },
    message: "The requested line range is invalid."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The file could not be read because of an internal error."
  }
];

test("read success constructor produces the strict schema-v1 envelope", () => {
  const result = createReadSuccess(sampleReadData(), 7);
  const parsed = readOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "read");
  assert.equal(parsed.codexpro_title, "Read File");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleReadData());
  assert.equal("path" in parsed, false);
  assert.equal("text" in parsed, false);
  assert.equal("bytes" in parsed, false);
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("read failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const result = createReadFailure(
      { code: expected.code, details: expected.details },
      3
    );
    const parsed = readOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(READ_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("read schema rejects unknown codes, wrong details, malformed data, and additional fields", () => {
  const success = createReadSuccess(sampleReadData(), 0);
  const workspaceFailure = createReadFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createReadFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => readOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    readOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    readOutputSchema.parse({ ...success, data: { ...success.data, sha256: "not-a-hash" } })
  );
  assert.throws(() =>
    readOutputSchema.parse({ ...success, data: { ...success.data, startLine: 10, endLine: 2 } })
  );
  assert.throws(() =>
    readOutputSchema.parse({ ...success, data: { ...success.data, endLine: 30, totalLines: 20 } })
  );
  assert.throws(() =>
    readOutputSchema.parse({ ...success, data: { ...success.data, truncated: false } })
  );
  assert.throws(() =>
    readOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong-shape" } }
    })
  );
  assert.throws(() =>
    readOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("read schema rejects inconsistent success and failure states", () => {
  const success = createReadSuccess(sampleReadData(), 0);
  const failure = createReadFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => readOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => readOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => readOutputSchema.parse({ ...failure, data: sampleReadData() }));
  assert.throws(() => readOutputSchema.parse({ ...failure, error: null }));
});

function createTestConfig(root = process.cwd(), overrides = {}) {
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

async function withInMemoryClient(options, callback) {
  const root = options.root ?? process.cwd();
  const server = createCodexProServer(
    createTestConfig(root, options.configOverrides ?? {}),
    options.dependencies ?? {}
  );
  const client = new Client({ name: "read-contract-test", version: "0.0.0" });
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

async function withTempWorkspace(files, callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-read-contract-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content);
    }
    return await callback(await fs.realpath(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function parseReadResult(result) {
  return readOutputSchema.parse(result.structuredContent);
}

function assertReadFailure(result, code, details) {
  const parsed = parseReadResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: READ_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

test("read advertises the exact output schema and returns a valid real success envelope", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "read");

    assert.ok(descriptor, "read must be registered");
    assert.ok(descriptor.outputSchema, "read must advertise outputSchema");
    assert.equal(descriptor.outputSchema.type, "object");
    assert.deepEqual(
      new Set(descriptor.outputSchema.required),
      new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
    );

    const result = await client.callTool({
      name: "read",
      arguments: { path: "package.json", start_line: 1, end_line: 3 }
    });
    const parsed = parseReadResult(result);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.error, null);
    assert.ok(parsed.data);
    assert.equal(parsed.data.workspace_id.startsWith("ws_"), true);
    assert.equal(parsed.data.root, process.cwd());
    assert.equal(parsed.data.path, "package.json");
    assert.match(parsed.data.text, /1\s+\|\s+\{/);
    assert.equal(parsed.data.startLine, 1);
    assert.equal(parsed.data.endLine, 3);
    assert.ok(parsed.data.totalLines >= 3);
    assert.ok(parsed.data.bytes > 0);
    assert.match(parsed.data.sha256, /^[a-f0-9]{64}$/);
    assert.equal(parsed.data.truncated, true);
    assert.equal("path" in parsed, false);
    assert.equal("text" in parsed, false);
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.ok(parsed.meta.durationMs >= 0);
    assert.deepEqual(parsed.meta.warnings, []);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("package.json")));
  });
});

test("read maps an unknown explicit workspace to WORKSPACE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "read",
      arguments: { workspace_id: "ws_missing_read_contract", path: "package.json" }
    });

    assertReadFailure(result, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_read_contract"
    });
  });
});

test("read maps outside paths safely to PATH_OUTSIDE_WORKSPACE", async () => {
  await withInMemoryClient({}, async (client) => {
    const relativeResult = await client.callTool({
      name: "read",
      arguments: { path: "../outside.txt" }
    });
    assertReadFailure(relativeResult, "PATH_OUTSIDE_WORKSPACE", {
      path: "../outside.txt"
    });

    const absoluteOutside = path.resolve(
      process.cwd(),
      "..",
      "__outside_read_contract__.txt"
    );
    const absoluteResult = await client.callTool({
      name: "read",
      arguments: { path: absoluteOutside }
    });
    assertReadFailure(absoluteResult, "PATH_OUTSIDE_WORKSPACE", {
      path: "[unsafe path omitted]"
    });
    assert.equal(JSON.stringify(absoluteResult).includes(absoluteOutside), false);
  });
});

test("read maps a configured blocked path to PATH_BLOCKED", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "read",
      arguments: { path: ".git/config" }
    });

    assertReadFailure(result, "PATH_BLOCKED", { path: ".git/config" });
  });
});

test("read maps a missing target to FILE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "read",
      arguments: { path: "__read_contract_missing_file__.txt" }
    });

    assertReadFailure(result, "FILE_NOT_FOUND", {
      path: "__read_contract_missing_file__.txt"
    });
  });
});

test("read maps an existing directory to NOT_A_FILE", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "read",
      arguments: { path: "src" }
    });

    assertReadFailure(result, "NOT_A_FILE", { path: "src" });
  });
});

test("read maps a complete file above maxReadBytes to FILE_TOO_LARGE", async () => {
  await withTempWorkspace(
    { "large.txt": "x".repeat(1500) },
    async (root) => {
      await withInMemoryClient(
        { root, configOverrides: { maxReadBytes: 1000 } },
        async (client) => {
          const result = await client.callTool({
            name: "read",
            arguments: { path: "large.txt" }
          });

          assertReadFailure(result, "FILE_TOO_LARGE", {
            path: "large.txt",
            scope: "file",
            limit_bytes: 1000
          });
        }
      );
    }
  );
});

test("read can scan a multi-megabyte text file while returning only a bounded line range", async () => {
  const largeText = `${"x".repeat(3 * 1024 * 1024)}\ntarget\n`;
  await withTempWorkspace(
    { "large-ranged.txt": largeText },
    async (root) => {
      await withInMemoryClient(
        { root, configOverrides: { maxReadBytes: 1000 } },
        async (client) => {
          const result = await client.callTool({
            name: "read",
            arguments: { path: "large-ranged.txt", start_line: 2, end_line: 2 }
          });
          const parsed = parseReadResult(result);
          assert.equal(parsed.ok, true);
          assert.equal(parsed.data.text, "2 | target");
          assert.ok(Buffer.byteLength(parsed.data.text, "utf8") < 1000);
          assert.ok(parsed.data.bytes > 3_000_000);
          assert.equal(parsed.data.truncated, true);
        }
      );
    }
  );
});

test("read maps a selected numbered range above maxReadBytes to FILE_TOO_LARGE", async () => {
  await withTempWorkspace(
    { "large-range.txt": `small\n${"x".repeat(1500)}\n` },
    async (root) => {
      await withInMemoryClient(
        { root, configOverrides: { maxReadBytes: 1000 } },
        async (client) => {
          const result = await client.callTool({
            name: "read",
            arguments: { path: "large-range.txt", start_line: 2, end_line: 2 }
          });

          assertReadFailure(result, "FILE_TOO_LARGE", {
            path: "large-range.txt",
            scope: "selection",
            limit_bytes: 1000
          });
        }
      );
    }
  );
});

test("read maps a NUL-containing file to FILE_NOT_TEXT", async () => {
  await withTempWorkspace(
    { "binary.bin": Buffer.from([65, 0, 66]) },
    async (root) => {
      await withInMemoryClient({ root }, async (client) => {
        const result = await client.callTool({
          name: "read",
          arguments: { path: "binary.bin" }
        });

        assertReadFailure(result, "FILE_NOT_TEXT", { path: "binary.bin" });
      });
    }
  );
});

test("read maps a start line beyond the file to INVALID_LINE_RANGE", async () => {
  await withTempWorkspace(
    { "short.txt": "one\ntwo\n" },
    async (root) => {
      await withInMemoryClient({ root }, async (client) => {
        const result = await client.callTool({
          name: "read",
          arguments: { path: "short.txt", start_line: 99 }
        });

        assertReadFailure(result, "INVALID_LINE_RANGE", {
          path: "short.txt",
          start_line: 99,
          end_line: null
        });
      });
    }
  );
});

test("read converts an injected provider failure into a fixed redacted INTERNAL_ERROR", async () => {
  const secret = ["gh", "p_", "b".repeat(32)].join("");

  await withInMemoryClient(
    {
      dependencies: {
        readResultProvider: async () => {
          throw new Error(`read provider failed with ${secret}`);
        }
      }
    },
    async (client) => {
      const result = await client.callTool({
        name: "read",
        arguments: { path: "package.json" }
      });
      const serialized = JSON.stringify(result);

      assertReadFailure(result, "INTERNAL_ERROR", {});
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(serialized, /read provider failed/);
      assert.doesNotMatch(serialized, /\n\s*at\s/);
    }
  );
});

test("read tool card reads successful fields only from nested data", () => {
  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "read"\) \{\s*root\.innerHTML = renderRead\(data\);/
  );

  assert.match(
    toolCardWidgetHtml,
    /if \(data\?\.codexpro_tool === "read"\) \{\s*if \(data\?\.ok === false\) return data\?\.error\?\.code[\s\S]*?const file = data\?\.data \?\? \{\};/
  );

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderRead\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderRead must exist");

  const renderer = rendererMatch[0];
  assert.match(renderer, /const file = data\?\.data \?\? \{\};/);
  assert.match(renderer, /file\.path/);
  assert.match(renderer, /file\.text/);
  assert.match(renderer, /file\.bytes/);
  assert.match(renderer, /file\.startLine/);
  assert.match(renderer, /file\.endLine/);
  assert.match(renderer, /file\.totalLines/);
  assert.match(renderer, /file\.truncated/);
  assert.doesNotMatch(
    renderer,
    /data\?\.(?:path|text|bytes|startLine|endLine|totalLines|truncated)/
  );
});

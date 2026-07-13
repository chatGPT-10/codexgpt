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
  WRITE_ERROR_MESSAGES,
  createWriteFailure,
  createWriteSuccess,
  writeOutputSchema
} = await tsImport("../src/tools/schemas/write.ts", import.meta.url);

function sampleWriteData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "src/example.ts",
    existed: true,
    bytes: 24,
    sha256: "a".repeat(64),
    additions: 2,
    deletions: 1,
    diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1,2 @@",
    ...overrides
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
    details: { path: "../outside.txt" },
    message: "The requested path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".git/config" },
    message: "The requested path is blocked by safety rules, including unsafe symlink targets."
  },
  {
    code: "NOT_A_FILE",
    details: { path: "src" },
    message: "The requested path is not a regular file."
  },
  {
    code: "FILE_NOT_TEXT",
    details: { path: "assets/image.bin" },
    message: "The existing target is not supported as a text file."
  },
  {
    code: "FILE_TOO_LARGE",
    details: { path: "large.txt", scope: "content", limit_bytes: 1000 },
    message: "The requested write exceeds the configured file-size limit."
  },
  {
    code: "SECRET_CONTENT_BLOCKED",
    details: { path: "notes.md" },
    message: "Secret-looking content is blocked because the requested content appears to contain a secret value."
  },
  {
    code: "FILE_ALREADY_EXISTS",
    details: { path: "existing.txt" },
    message: "The target already exists and overwrite was disabled."
  },
  {
    code: "PARENT_DIRECTORY_NOT_FOUND",
    details: { path: "missing/child.txt" },
    message: "The target parent directory does not exist and create_dirs was disabled."
  },
  {
    code: "WRITE_FAILED",
    details: {},
    message: "The file could not be written by the operating system."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The file could not be written because of an internal error."
  }
];

test("write success constructor produces the strict schema-v1 envelope", () => {
  const result = createWriteSuccess(sampleWriteData(), 7);
  const parsed = writeOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "write");
  assert.equal(parsed.codexpro_title, "Write File");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleWriteData());
  for (const legacyField of ["path", "bytes", "sha256", "additions", "deletions", "diff"]) {
    assert.equal(legacyField in parsed, false);
  }
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("write failure constructor produces every approved strict error", () => {
  for (const expected of failureCases) {
    const result = createWriteFailure(
      { code: expected.code, details: expected.details },
      3
    );
    const parsed = writeOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(WRITE_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("write schema rejects malformed data, wrong error details, and additional fields", () => {
  const success = createWriteSuccess(sampleWriteData(), 0);
  const workspaceFailure = createWriteFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createWriteFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => writeOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    writeOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    writeOutputSchema.parse({ ...success, data: { ...success.data, sha256: "not-a-hash" } })
  );
  assert.throws(() =>
    writeOutputSchema.parse({ ...success, data: { ...success.data, bytes: -1 } })
  );
  assert.throws(() =>
    writeOutputSchema.parse({ ...success, data: { ...success.data, additions: 1.5 } })
  );
  assert.throws(() =>
    writeOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong-shape" } }
    })
  );
  assert.throws(() =>
    writeOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("write schema rejects inconsistent success and failure states", () => {
  const success = createWriteSuccess(sampleWriteData(), 0);
  const failure = createWriteFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => writeOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => writeOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => writeOutputSchema.parse({ ...failure, data: sampleWriteData() }));
  assert.throws(() => writeOutputSchema.parse({ ...failure, error: null }));
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
  const client = new Client({ name: "write-contract-test", version: "0.0.0" });
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-write-contract-"));
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

function parseWriteResult(result) {
  return writeOutputSchema.parse(result.structuredContent);
}

function assertWriteFailure(result, code, details) {
  const parsed = parseWriteResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: WRITE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

test("write advertises an exact output schema and creates a file with a valid envelope", async () => {
  await withTempWorkspace({}, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "write");

      assert.ok(descriptor, "write must be registered");
      assert.ok(descriptor.outputSchema, "write must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({
        name: "write",
        arguments: { path: "created.txt", content: "created\n" }
      });
      const parsed = parseWriteResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.path, "created.txt");
      assert.equal(parsed.data.existed, false);
      assert.equal(parsed.data.bytes, Buffer.byteLength("created\n", "utf8"));
      assert.match(parsed.data.sha256, /^[a-f0-9]{64}$/);
      assert.ok(parsed.data.additions > 0);
      assert.equal(parsed.data.deletions, 0);
      assert.match(parsed.data.diff, /created\.txt/);
      assert.equal(await fs.readFile(path.join(root, "created.txt"), "utf8"), "created\n");
      assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("created.txt")));
      for (const legacyField of ["path", "bytes", "sha256", "additions", "deletions", "diff"]) {
        assert.equal(legacyField in parsed, false);
      }
    });
  });
});

test("write preserves overwrite, no-change, create_dirs, and overwrite=false behavior", async () => {
  await withTempWorkspace({ "existing.txt": "before\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const overwritten = parseWriteResult(await client.callTool({
        name: "write",
        arguments: { path: "existing.txt", content: "after\n" }
      }));
      assert.equal(overwritten.ok, true);
      assert.equal(overwritten.data.existed, true);
      assert.ok(overwritten.data.additions > 0);
      assert.ok(overwritten.data.deletions > 0);

      const unchanged = parseWriteResult(await client.callTool({
        name: "write",
        arguments: { path: "existing.txt", content: "after\n" }
      }));
      assert.equal(unchanged.ok, true);
      assert.equal(unchanged.data.additions, 0);
      assert.equal(unchanged.data.deletions, 0);
      assert.equal(unchanged.data.diff, "No changes in existing.txt.");

      const nested = parseWriteResult(await client.callTool({
        name: "write",
        arguments: { path: "nested/child.txt", content: "child\n", create_dirs: true }
      }));
      assert.equal(nested.ok, true);
      assert.equal(await fs.readFile(path.join(root, "nested", "child.txt"), "utf8"), "child\n");

      const refused = await client.callTool({
        name: "write",
        arguments: { path: "existing.txt", content: "blocked\n", overwrite: false }
      });
      assertWriteFailure(refused, "FILE_ALREADY_EXISTS", { path: "existing.txt" });
      assert.equal(await fs.readFile(path.join(root, "existing.txt"), "utf8"), "after\n");
    });
  });
});

test("write maps workspace and path policy failures safely", async () => {
  await withInMemoryClient({}, async (client) => {
    const missingWorkspace = await client.callTool({
      name: "write",
      arguments: { workspace_id: "ws_missing_write_contract", path: "file.txt", content: "x\n" }
    });
    assertWriteFailure(missingWorkspace, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_write_contract"
    });

    const relativeOutside = await client.callTool({
      name: "write",
      arguments: { path: "../outside.txt", content: "x\n" }
    });
    assertWriteFailure(relativeOutside, "PATH_OUTSIDE_WORKSPACE", { path: "../outside.txt" });

    const absoluteOutside = path.resolve(process.cwd(), "..", "__outside_write_contract__.txt");
    const absoluteResult = await client.callTool({
      name: "write",
      arguments: { path: absoluteOutside, content: "x\n" }
    });
    assertWriteFailure(absoluteResult, "PATH_OUTSIDE_WORKSPACE", {
      path: "[unsafe path omitted]"
    });
    assert.equal(JSON.stringify(absoluteResult).includes(absoluteOutside), false);

    const blocked = await client.callTool({
      name: "write",
      arguments: { path: ".git/config", content: "x\n" }
    });
    assertWriteFailure(blocked, "PATH_BLOCKED", { path: ".git/config" });
  });
});

test("write classifies directory, binary, size, secret, and missing-parent failures", async () => {
  await withTempWorkspace({
    "folder/keep.txt": "keep\n",
    "binary.bin": Buffer.from([0, 1, 2, 3]),
    "large.txt": "x".repeat(64)
  }, async (root) => {
    await withInMemoryClient({
      root,
      configOverrides: { maxReadBytes: 16, maxWriteBytes: 16 }
    }, async (client) => {
      const directory = await client.callTool({
        name: "write",
        arguments: { path: "folder", content: "x\n" }
      });
      assertWriteFailure(directory, "NOT_A_FILE", { path: "folder" });

      const binary = await client.callTool({
        name: "write",
        arguments: { path: "binary.bin", content: "text\n" }
      });
      assertWriteFailure(binary, "FILE_NOT_TEXT", { path: "binary.bin" });

      const contentTooLarge = await client.callTool({
        name: "write",
        arguments: { path: "new-large.txt", content: "x".repeat(17) }
      });
      assertWriteFailure(contentTooLarge, "FILE_TOO_LARGE", {
        path: "new-large.txt",
        scope: "content",
        limit_bytes: 16
      });

      const existingTooLarge = await client.callTool({
        name: "write",
        arguments: { path: "large.txt", content: "short\n" }
      });
      assertWriteFailure(existingTooLarge, "FILE_TOO_LARGE", {
        path: "large.txt",
        scope: "existing_file",
        limit_bytes: 16
      });

      const missingParent = await client.callTool({
        name: "write",
        arguments: { path: "missing/child.txt", content: "child\n", create_dirs: false }
      });
      assertWriteFailure(missingParent, "PARENT_DIRECTORY_NOT_FOUND", {
        path: "missing/child.txt"
      });
    });

    await withInMemoryClient({ root }, async (client) => {
      const secretValue = ["service", "_token: ", "yaml", "secretvalueabcdefghijklmnop"].join("");
      const secret = await client.callTool({
        name: "write",
        arguments: { path: "secret.txt", content: `${secretValue}\n` }
      });
      assertWriteFailure(secret, "SECRET_CONTENT_BLOCKED", { path: "secret.txt" });
      assert.equal(JSON.stringify(secret).includes(secretValue), false);
    });
  });
});

test("write maps recognized provider failures and malformed results without leaking diagnostics", async () => {
  const privateDiagnostic = path.join("D:\\private", "write-diagnostic.txt");
  const operatingSystemError = Object.assign(
    new Error(`permission denied at ${privateDiagnostic}`),
    { code: "EACCES" }
  );

  await withInMemoryClient({
    dependencies: {
      writeResultProvider: async () => {
        throw operatingSystemError;
      }
    }
  }, async (client) => {
    const result = await client.callTool({
      name: "write",
      arguments: { path: "safe.txt", content: "safe\n" }
    });
    assertWriteFailure(result, "WRITE_FAILED", {});
    assert.equal(JSON.stringify(result).includes(privateDiagnostic), false);
    assert.equal(JSON.stringify(result).includes("permission denied"), false);
  });

  await withInMemoryClient({
    dependencies: {
      writeResultProvider: async () => ({
        path: "safe.txt",
        bytes: -1,
        sha256: "invalid",
        existed: false,
        diff: { changed: true, additions: -1, deletions: 0, diff: "bad" }
      })
    }
  }, async (client) => {
    const result = await client.callTool({
      name: "write",
      arguments: { path: "safe.txt", content: "safe\n" }
    });
    assertWriteFailure(result, "INTERNAL_ERROR", {});
    assert.equal(JSON.stringify(result).includes("Zod"), false);
  });
});

test("write invalidates analysis only when the validated diff reports a change", async () => {
  await withTempWorkspace({ "src/example.ts": "export const value = 1;\n" }, async (root) => {
    let changed = false;
    await withInMemoryClient({
      root,
      dependencies: {
        writeResultProvider: async ({ path: requestedPath, content }) => ({
          path: requestedPath,
          bytes: Buffer.byteLength(content, "utf8"),
          sha256: "b".repeat(64),
          existed: true,
          diff: {
            changed,
            additions: changed ? 1 : 0,
            deletions: 0,
            diff: changed ? "--- a/src/example.ts\n+++ b/src/example.ts" : `No changes in ${requestedPath}.`
          }
        })
      }
    }, async (client) => {
      await client.callTool({ name: "inspect_workspace", arguments: {} });
      const warm = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(warm.structuredContent.data.cache.hit, true);

      await client.callTool({
        name: "write",
        arguments: { path: "src/example.ts", content: "unchanged\n" }
      });
      const afterUnchanged = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(afterUnchanged.structuredContent.data.cache.hit, true);

      changed = true;
      await client.callTool({
        name: "write",
        arguments: { path: "src/example.ts", content: "changed\n" }
      });
      const afterChanged = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(afterChanged.structuredContent.data.cache.hit, false);
    });
  });
});

test("write Tool Card consumes nested data and error while adjacent file tools keep the legacy renderer", () => {
  const renderWriteMatch = toolCardWidgetHtml.match(/function renderWrite\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(renderWriteMatch, "write must have a dedicated Tool Card renderer");
  const renderer = renderWriteMatch[0];

  assert.match(renderer, /data\?\.data/);
  assert.match(renderer, /writeData\.path/);
  assert.match(renderer, /writeData\.bytes/);
  assert.match(renderer, /writeData\.additions/);
  assert.match(renderer, /writeData\.deletions/);
  assert.match(renderer, /writeData\.diff/);
  assert.match(renderer, /data\?\.error/);
  assert.doesNotMatch(renderer, /data\.(?:path|bytes|additions|deletions|diff)/);

  assert.match(toolCardWidgetHtml, /tool === "write"\) \{\s*root\.innerHTML = renderWrite\(data\)/);
  assert.match(
    toolCardWidgetHtml,
    /tool === "edit"\) \{\s*root\.innerHTML = renderEdit\(data\)/
  );
  assert.match(
    toolCardWidgetHtml,
    /tool === "apply_patch"\) \{\s*root\.innerHTML = renderApplyPatch\(data\)/
  );
  assert.match(
    toolCardWidgetHtml,
    /tool === "export_pro_context"\) \{\s*root\.innerHTML = renderFile\(data\)/
  );
});

test("codexpro wrapper action write preserves the child envelope without legacy flat fields", async () => {
  await withTempWorkspace({}, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: {
          action: "write",
          args: { path: "wrapped.txt", content: "wrapped\n" }
        }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexpro_tool, "write");
      assert.equal(structured.codexpro_title, "Write File");
      assert.equal(structured.codexpro_super_action, "write");
      assert.equal(structured.wrapped_tool, "write");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.equal(structured.data.path, "wrapped.txt");
      for (const legacyField of ["path", "bytes", "sha256", "additions", "deletions", "diff"]) {
        assert.equal(legacyField in structured, false);
      }
    });
  });
});

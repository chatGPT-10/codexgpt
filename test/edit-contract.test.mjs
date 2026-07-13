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
  EDIT_ERROR_MESSAGES,
  createEditFailure,
  createEditSuccess,
  editOutputSchema
} = await tsImport("../src/tools/schemas/edit.ts", import.meta.url);

function sampleEditData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "src/example.ts",
    replacements: 1,
    bytes: 24,
    sha256: "a".repeat(64),
    additions: 2,
    deletions: 1,
    diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@",
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
    code: "FILE_NOT_FOUND",
    details: { path: "missing.txt" },
    message: "The requested file does not exist."
  },
  {
    code: "NOT_A_FILE",
    details: { path: "src" },
    message: "The requested path is not a regular file."
  },
  {
    code: "FILE_NOT_TEXT",
    details: { path: "asset.bin" },
    message: "The requested file is not supported as a text file."
  },
  {
    code: "FILE_TOO_LARGE",
    details: { path: "large.txt", scope: "edited_file", limit_bytes: 1000 },
    message: "The requested edit exceeds the configured file-size limit."
  },
  {
    code: "INVALID_ARGUMENT",
    details: { argument: "old_text" },
    message: "The requested edit contains an invalid argument."
  },
  {
    code: "OLD_TEXT_NOT_FOUND",
    details: { path: "src/example.ts" },
    message: "The requested old_text was not found in the file."
  },
  {
    code: "OLD_TEXT_NOT_UNIQUE",
    details: { path: "src/example.ts", matches: 3 },
    message: "The requested old_text matched more than once. Use a more specific old_text or enable replace_all."
  },
  {
    code: "REPLACEMENT_COUNT_MISMATCH",
    details: { path: "src/example.ts", expected: 2, actual: 3 },
    message: "The requested replacement count did not match the number of replacements that would be performed."
  },
  {
    code: "SECRET_CONTENT_BLOCKED",
    details: { path: "notes.md" },
    message: "Secret-looking content is blocked because the edited file appears to contain a secret value."
  },
  {
    code: "EDIT_FAILED",
    details: {},
    message: "The file could not be edited by the operating system."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The file could not be edited because of an internal error."
  }
];

test("edit success constructor produces the strict schema-v1 envelope", () => {
  const result = createEditSuccess(sampleEditData(), 7);
  const parsed = editOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "edit");
  assert.equal(parsed.codexpro_title, "Edit File");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleEditData());
  for (const legacyField of ["path", "replacements", "bytes", "sha256", "additions", "deletions", "diff"]) {
    assert.equal(legacyField in parsed, false);
  }
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("edit failure constructor produces every approved strict error", () => {
  for (const expected of failureCases) {
    const result = createEditFailure(
      { code: expected.code, details: expected.details },
      3
    );
    const parsed = editOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(EDIT_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("edit schema rejects malformed data, wrong error details, and additional fields", () => {
  const success = createEditSuccess(sampleEditData(), 0);
  const workspaceFailure = createEditFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createEditFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => editOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    editOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    editOutputSchema.parse({ ...success, data: { ...success.data, sha256: "not-a-hash" } })
  );
  assert.throws(() =>
    editOutputSchema.parse({ ...success, data: { ...success.data, replacements: 0 } })
  );
  assert.throws(() =>
    editOutputSchema.parse({ ...success, data: { ...success.data, bytes: -1 } })
  );
  assert.throws(() =>
    editOutputSchema.parse({ ...success, data: { ...success.data, additions: 1.5 } })
  );
  assert.throws(() =>
    editOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong-shape" } }
    })
  );
  assert.throws(() =>
    editOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, details: { leaked: true } }
    })
  );
  assert.throws(() =>
    editOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("edit schema rejects inconsistent success and failure states", () => {
  const success = createEditSuccess(sampleEditData(), 0);
  const failure = createEditFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => editOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => editOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => editOutputSchema.parse({ ...failure, data: sampleEditData() }));
  assert.throws(() => editOutputSchema.parse({ ...failure, error: null }));
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
  const client = new Client({ name: "edit-contract-test", version: "0.0.0" });
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-edit-contract-"));
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

function parseEditResult(result) {
  return editOutputSchema.parse(result.structuredContent);
}

function assertEditFailure(result, code, details) {
  const parsed = parseEditResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: EDIT_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
  return parsed;
}

test("edit advertises an exact output schema and performs one replacement", async () => {
  await withTempWorkspace({ "example.txt": "before\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "edit");

      assert.ok(descriptor, "edit must be registered");
      assert.ok(descriptor.outputSchema, "edit must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "before", new_text: "after" }
      });
      const parsed = parseEditResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.path, "example.txt");
      assert.equal(parsed.data.replacements, 1);
      assert.equal(parsed.data.bytes, Buffer.byteLength("after\n", "utf8"));
      assert.match(parsed.data.sha256, /^[a-f0-9]{64}$/);
      assert.ok(parsed.data.additions > 0);
      assert.ok(parsed.data.deletions > 0);
      assert.match(parsed.data.diff, /example\.txt/);
      assert.equal(await fs.readFile(path.join(root, "example.txt"), "utf8"), "after\n");
      for (const legacyField of ["path", "replacements", "bytes", "sha256", "additions", "deletions", "diff"]) {
        assert.equal(legacyField in parsed, false);
      }
    });
  });
});

test("edit preserves replace_all, expected counts, Unicode, and identical-text success", async () => {
  await withTempWorkspace({
    "many.txt": "x x\n",
    "unicode.txt": "Grüße 世界\n"
  }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const replaced = parseEditResult(await client.callTool({
        name: "edit",
        arguments: {
          path: "many.txt",
          old_text: "x",
          new_text: "y",
          replace_all: true,
          expected_replacements: 2
        }
      }));
      assert.equal(replaced.ok, true);
      assert.equal(replaced.data.replacements, 2);
      assert.equal(await fs.readFile(path.join(root, "many.txt"), "utf8"), "y y\n");

      const unicode = parseEditResult(await client.callTool({
        name: "edit",
        arguments: { path: "unicode.txt", old_text: "世界", new_text: "Welt" }
      }));
      assert.equal(unicode.ok, true);
      assert.equal(await fs.readFile(path.join(root, "unicode.txt"), "utf8"), "Grüße Welt\n");

      const identical = parseEditResult(await client.callTool({
        name: "edit",
        arguments: { path: "unicode.txt", old_text: "Welt", new_text: "Welt" }
      }));
      assert.equal(identical.ok, true);
      assert.equal(identical.data.replacements, 1);
      assert.equal(identical.data.additions, 0);
      assert.equal(identical.data.deletions, 0);
      assert.equal(identical.data.diff, "No changes in unicode.txt.");
    });
  });
});

test("edit maps workspace and path failures safely", async () => {
  await withInMemoryClient({}, async (client) => {
    const missingWorkspace = await client.callTool({
      name: "edit",
      arguments: {
        workspace_id: "ws_missing_edit_contract",
        path: "file.txt",
        old_text: "a",
        new_text: "b"
      }
    });
    assertEditFailure(missingWorkspace, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_edit_contract"
    });

    const relativeOutside = await client.callTool({
      name: "edit",
      arguments: { path: "../outside.txt", old_text: "a", new_text: "b" }
    });
    assertEditFailure(relativeOutside, "PATH_OUTSIDE_WORKSPACE", { path: "../outside.txt" });

    const absoluteOutside = path.resolve(process.cwd(), "..", "__outside_edit_contract__.txt");
    const absoluteResult = await client.callTool({
      name: "edit",
      arguments: { path: absoluteOutside, old_text: "a", new_text: "b" }
    });
    assertEditFailure(absoluteResult, "PATH_OUTSIDE_WORKSPACE", {
      path: "[unsafe path omitted]"
    });
    assert.equal(JSON.stringify(absoluteResult).includes(absoluteOutside), false);

    const blocked = await client.callTool({
      name: "edit",
      arguments: { path: ".git/config", old_text: "a", new_text: "b" }
    });
    assertEditFailure(blocked, "PATH_BLOCKED", { path: ".git/config" });
  });
});

test("edit classifies missing, directory, binary, and size failures", async () => {
  await withTempWorkspace({
    "folder/keep.txt": "keep\n",
    "binary.bin": Buffer.from([0, 1, 2, 3]),
    "large.txt": "x".repeat(64),
    "small.txt": "a\n"
  }, async (root) => {
    await withInMemoryClient({
      root,
      configOverrides: { maxReadBytes: 16, maxWriteBytes: 16 }
    }, async (client) => {
      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "missing.txt", old_text: "a", new_text: "b" }
      }), "FILE_NOT_FOUND", { path: "missing.txt" });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "folder", old_text: "a", new_text: "b" }
      }), "NOT_A_FILE", { path: "folder" });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "binary.bin", old_text: "a", new_text: "b" }
      }), "FILE_NOT_TEXT", { path: "binary.bin" });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "large.txt", old_text: "x", new_text: "y" }
      }), "FILE_TOO_LARGE", {
        path: "large.txt",
        scope: "existing_file",
        limit_bytes: 16
      });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "small.txt", old_text: "a", new_text: "z".repeat(32) }
      }), "FILE_TOO_LARGE", {
        path: "small.txt",
        scope: "edited_file",
        limit_bytes: 16
      });
    });
  });
});

test("edit classifies exact replacement precondition failures", async () => {
  await withTempWorkspace({ "example.txt": "same same\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "", new_text: "x" }
      }), "INVALID_ARGUMENT", { argument: "old_text" });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "missing", new_text: "x" }
      }), "OLD_TEXT_NOT_FOUND", { path: "example.txt" });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "same", new_text: "x" }
      }), "OLD_TEXT_NOT_UNIQUE", { path: "example.txt", matches: 2 });

      assertEditFailure(await client.callTool({
        name: "edit",
        arguments: {
          path: "example.txt",
          old_text: "same",
          new_text: "x",
          replace_all: true,
          expected_replacements: 3
        }
      }), "REPLACEMENT_COUNT_MISMATCH", {
        path: "example.txt",
        expected: 3,
        actual: 2
      });
    });
  });
});

test("edit blocks secret-looking final content without leaking it", async () => {
  await withTempWorkspace({ "notes.txt": "placeholder\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const secretLike = "ghp_" + "a".repeat(40);
      const result = await client.callTool({
        name: "edit",
        arguments: { path: "notes.txt", old_text: "placeholder", new_text: secretLike }
      });
      assertEditFailure(result, "SECRET_CONTENT_BLOCKED", { path: "notes.txt" });
      assert.equal(JSON.stringify(result).includes(secretLike), false);
      assert.equal(await fs.readFile(path.join(root, "notes.txt"), "utf8"), "placeholder\n");
    });
  });
});

test("edit classifies provider failures, malformed results, and returned-path mismatch", async () => {
  await withTempWorkspace({ "example.txt": "before\n" }, async (root) => {
    const leaked = `provider failed at ${path.join(root, "private.txt")} with before and after`;
    await withInMemoryClient({
      root,
      dependencies: {
        editResultProvider: async () => {
          const error = new Error(leaked);
          error.code = "EACCES";
          throw error;
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "before", new_text: "after" }
      });
      assertEditFailure(result, "EDIT_FAILED", {});
      assert.equal(JSON.stringify(result).includes(leaked), false);
      assert.equal(await fs.readFile(path.join(root, "example.txt"), "utf8"), "before\n");
    });

    await withInMemoryClient({
      root,
      dependencies: {
        editResultProvider: async () => ({
          path: "example.txt",
          replacements: 0,
          bytes: 6,
          sha256: "a".repeat(64),
          diff: { diff: "bad", additions: 0, deletions: 0, changed: false }
        })
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "before", new_text: "after" }
      });
      assertEditFailure(result, "INTERNAL_ERROR", {});
    });

    await withInMemoryClient({
      root,
      dependencies: {
        editResultProvider: async () => ({
          path: "different.txt",
          replacements: 1,
          bytes: 6,
          sha256: "a".repeat(64),
          diff: { diff: "No changes in different.txt.", additions: 0, deletions: 0, changed: false }
        })
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "edit",
        arguments: { path: "example.txt", old_text: "before", new_text: "after" }
      });
      assertEditFailure(result, "INTERNAL_ERROR", {});
    });
  });
});

test("edit invalidates analysis only after a validated changed result", async () => {
  await withTempWorkspace({ "src/example.ts": "export const value = 1;\n" }, async (root) => {
    let mode = "unchanged";
    await withInMemoryClient({
      root,
      dependencies: {
        editResultProvider: async ({ path: requestedPath }) => {
          if (mode === "throw") throw Object.assign(new Error("private provider detail"), { code: "EACCES" });
          if (mode === "malformed") {
            return {
              path: requestedPath,
              replacements: 0,
              bytes: 10,
              sha256: "c".repeat(64),
              diff: { changed: false, additions: 0, deletions: 0, diff: "bad" }
            };
          }
          if (mode === "mismatch") {
            return {
              path: "src/other.ts",
              replacements: 1,
              bytes: 10,
              sha256: "c".repeat(64),
              diff: { changed: false, additions: 0, deletions: 0, diff: "No changes in src/other.ts." }
            };
          }
          const changed = mode === "changed";
          return {
            path: requestedPath,
            replacements: 1,
            bytes: 10,
            sha256: "c".repeat(64),
            diff: {
              changed,
              additions: changed ? 1 : 0,
              deletions: changed ? 1 : 0,
              diff: changed
                ? "--- a/src/example.ts\n+++ b/src/example.ts"
                : `No changes in ${requestedPath}.`
            }
          };
        }
      }
    }, async (client) => {
      await client.callTool({ name: "inspect_workspace", arguments: {} });
      const warm = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(warm.structuredContent.cache.hit, true);

      for (const preservedMode of ["unchanged", "throw", "malformed", "mismatch"]) {
        mode = preservedMode;
        await client.callTool({
          name: "edit",
          arguments: { path: "src/example.ts", old_text: "value", new_text: "value" }
        });
        const after = await client.callTool({ name: "inspect_workspace", arguments: {} });
        assert.equal(after.structuredContent.cache.hit, true, `${preservedMode} must preserve cache`);
      }

      mode = "changed";
      await client.callTool({
        name: "edit",
        arguments: { path: "src/example.ts", old_text: "value", new_text: "changed" }
      });
      const afterChanged = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(afterChanged.structuredContent.cache.hit, false);
    });
  });
});

test("edit Tool Card consumes nested data and error while adjacent tools keep the legacy renderer", () => {
  const renderEditMatch = toolCardWidgetHtml.match(/function renderEdit\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(renderEditMatch, "edit must have a dedicated Tool Card renderer");
  const renderer = renderEditMatch[0];

  assert.match(renderer, /data\?\.data/);
  assert.match(renderer, /editData\.path/);
  assert.match(renderer, /editData\.replacements/);
  assert.match(renderer, /editData\.bytes/);
  assert.match(renderer, /editData\.sha256/);
  assert.match(renderer, /editData\.additions/);
  assert.match(renderer, /editData\.deletions/);
  assert.match(renderer, /editData\.diff/);
  assert.match(renderer, /data\?\.error/);
  assert.doesNotMatch(renderer, /data\.(?:path|replacements|bytes|sha256|additions|deletions|diff)/);

  assert.match(toolCardWidgetHtml, /tool === "edit"\) \{\s*root\.innerHTML = renderEdit\(data\)/);
  assert.match(
    toolCardWidgetHtml,
    /tool === "apply_patch" \|\| tool === "export_pro_context"/
  );
  assert.doesNotMatch(
    toolCardWidgetHtml,
    /tool === "edit" \|\| tool === "apply_patch"/
  );
});

test("codexpro wrapper action edit preserves strict success and failure envelopes", async () => {
  await withTempWorkspace({ "example.txt": "before\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: {
          action: "edit",
          args: { path: "example.txt", old_text: "before", new_text: "after" }
        }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexpro_tool, "edit");
      assert.equal(structured.codexpro_title, "Edit File");
      assert.equal(structured.codexpro_super_action, "edit");
      assert.equal(structured.wrapped_tool, "edit");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.equal(structured.data.path, "example.txt");
      for (const legacyField of ["path", "replacements", "bytes", "sha256", "additions", "deletions", "diff"]) {
        assert.equal(legacyField in structured, false);
      }
    });

    const leaked = path.join(root, "private-provider-detail.txt");
    await withInMemoryClient({
      root,
      dependencies: {
        editResultProvider: async () => {
          throw Object.assign(new Error(`permission denied at ${leaked}`), { code: "EACCES" });
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: {
          action: "edit",
          args: { path: "example.txt", old_text: "after", new_text: "final" }
        }
      });
      const structured = result.structuredContent;
      assert.equal(structured.codexpro_tool, "edit");
      assert.equal(structured.codexpro_super_action, "edit");
      assert.equal(structured.wrapped_tool, "edit");
      assert.equal(structured.ok, false);
      assert.equal(structured.error.code, "EDIT_FAILED");
      assert.equal(JSON.stringify(result).includes(leaked), false);
      assert.equal(JSON.stringify(result).includes("permission denied"), false);
    });
  });
});

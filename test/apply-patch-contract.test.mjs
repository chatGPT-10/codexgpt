import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const {
  ApplyPatchOperationError,
  createCodexProServer
} = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  APPLY_PATCH_ERROR_MESSAGES,
  applyPatchOutputSchema,
  createApplyPatchFailure,
  createApplyPatchSuccess
} = await tsImport("../src/tools/schemas/applyPatch.ts", import.meta.url);

void fs;
void os;
void path;
void Client;
void InMemoryTransport;
void ApplyPatchOperationError;
void createCodexProServer;
void toolCardWidgetHtml;

function sampleApplyPatchData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    paths: ["src/example.ts", "test/example.test.mjs"],
    stdout: "",
    stderr: "",
    additions: 12,
    deletions: 4,
    changed: true,
    diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@",
    ...overrides
  };
}

const failureCases = [
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" }],
  ["PATH_BLOCKED", { path: ".git/config" }],
  ["INVALID_ARGUMENT", { argument: "patch", reason: "empty" }],
  ["PATCH_TOO_LARGE", { limit_bytes: 1000 }],
  ["SECRET_CONTENT_BLOCKED", {}],
  ["SYMLINK_PATCH_BLOCKED", {}],
  ["PATCH_INVALID", { reason: "no_file_paths" }],
  ["GIT_UNAVAILABLE", {}],
  ["PATCH_CHECK_FAILED", {}],
  ["PATCH_APPLY_FAILED", {}],
  ["INTERNAL_ERROR", {}]
];

test("apply_patch success constructor returns the exact nested schema-v1 envelope", () => {
  const result = createApplyPatchSuccess(sampleApplyPatchData(), 7);

  assert.deepEqual(Object.keys(result).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(result.codexpro_tool, "apply_patch");
  assert.equal(result.codexpro_title, "Apply Patch");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, sampleApplyPatchData());
  assert.equal(result.error, null);
  assert.deepEqual(result.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
  assert.equal("paths" in result, false);
  assert.equal("changed" in result, false);
  assert.equal("diff" in result, false);
});

test("apply_patch success data is strict and rejects invalid path, stats, changed, and diff values", () => {
  const valid = createApplyPatchSuccess(sampleApplyPatchData());

  assert.throws(() => applyPatchOutputSchema.parse({ ...valid, unexpected: true }));
  assert.throws(() => applyPatchOutputSchema.parse({
    ...valid,
    data: { ...valid.data, unexpected: true }
  }));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ paths: [] })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ paths: [""] })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ paths: ["a.txt", "a.txt"] })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ additions: -1 })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ deletions: 1.5 })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ changed: false })));
  assert.throws(() => createApplyPatchSuccess(sampleApplyPatchData({ diff: "" })));
});

test("apply_patch failure constructors accept every approved fixed error", () => {
  for (const [code, details] of failureCases) {
    const result = createApplyPatchFailure({ code, details }, 3);
    assert.equal(result.codexpro_tool, "apply_patch");
    assert.equal(result.codexpro_title, "Apply Patch");
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
    assert.equal(result.error.code, code);
    assert.equal(result.error.message, APPLY_PATCH_ERROR_MESSAGES[code]);
    assert.equal(result.error.retryable, false);
    assert.deepEqual(result.error.details, details);
    assert.deepEqual(result.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("apply_patch failure schema rejects invalid state, details, and legacy fields", () => {
  const failure = createApplyPatchFailure({
    code: "PATCH_INVALID",
    details: { reason: "invalid_path_encoding" }
  });

  assert.throws(() => applyPatchOutputSchema.parse({ ...failure, paths: ["a.txt"] }));
  assert.throws(() => applyPatchOutputSchema.parse({ ...failure, data: sampleApplyPatchData() }));
  assert.throws(() => applyPatchOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => createApplyPatchFailure({
    code: "PATCH_INVALID",
    details: { reason: "other" }
  }));
  assert.throws(() => createApplyPatchFailure({
    code: "PATCH_CHECK_FAILED",
    details: { stderr: "raw diagnostic" }
  }));
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

async function withInMemoryClient(options, callback) {
  const root = options.root ?? process.cwd();
  const server = createCodexProServer(
    createTestConfig(root, options.configOverrides ?? {}),
    options.dependencies ?? {}
  );
  const client = new Client({ name: "apply-patch-contract-test", version: "0.0.0" });
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-apply-patch-contract-"));
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

function parseApplyPatchResult(result) {
  return applyPatchOutputSchema.parse(result.structuredContent);
}

function resultText(result) {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function assertApplyPatchFailure(result, code, details) {
  const parsed = parseApplyPatchResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: APPLY_PATCH_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  const text = resultText(result);
  assert.match(text, new RegExp(`Code: ${code}`));
  assert.ok(text.includes(APPLY_PATCH_ERROR_MESSAGES[code]));
  return parsed;
}

function singleFilePatch(file = "demo.txt", before = "before", after = "after") {
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1 @@",
    `-${before}`,
    `+${after}`,
    ""
  ].join("\n");
}

test("apply_patch advertises an exact output schema and applies a real patch", async () => {
  await withTempWorkspace({ "demo.txt": "before\n", "other.txt": "dirty\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "apply_patch");
      assert.ok(descriptor, "apply_patch must be registered");
      assert.ok(descriptor.outputSchema, "apply_patch must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const patch = singleFilePatch();
      const result = await client.callTool({
        name: "apply_patch",
        arguments: { patch }
      });
      const parsed = parseApplyPatchResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.deepEqual(parsed.data.paths, ["demo.txt"]);
      assert.equal(parsed.data.changed, true);
      assert.equal(parsed.data.stdout, "");
      assert.equal(parsed.data.stderr, "");
      assert.equal(parsed.data.diff, patch.trimEnd());
      assert.equal(parsed.data.diff.includes("other.txt"), false);
      assert.equal(
        (await fs.readFile(path.join(root, "demo.txt"), "utf8")).replace(/\r\n/g, "\n"),
        "after\n"
      );
      for (const legacyField of ["workspace_id", "root", "paths", "stdout", "stderr", "additions", "deletions", "changed", "diff"]) {
        assert.equal(legacyField in parsed, false);
      }
    });
  });
});

test("apply_patch returns fixed failures for invalid input and policy rejections", async () => {
  await withTempWorkspace({ "demo.txt": "before\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { workspace_id: "ws_missing", patch: singleFilePatch() }
      }), "WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" });

      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: "   \n" }
      }), "INVALID_ARGUMENT", { argument: "patch", reason: "empty" });

      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: "not a unified diff" }
      }), "PATCH_INVALID", { reason: "no_file_paths" });

      const invalidQuotedPatch = [
        '--- "a/demo.txt\\"',
        "+++ b/demo.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        ""
      ].join("\n");
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: invalidQuotedPatch }
      }), "PATCH_INVALID", { reason: "invalid_path_encoding" });

      const secretValue = "sk-" + "abcdefghijklmno";
      const secretPatch = singleFilePatch("demo.txt", "before", secretValue);
      const secretResult = await client.callTool({
        name: "apply_patch",
        arguments: { patch: secretPatch }
      });
      assertApplyPatchFailure(secretResult, "SECRET_CONTENT_BLOCKED", {});
      assert.equal(resultText(secretResult).includes(secretValue), false);

      const symlinkPatch = [
        "diff --git a/link b/link",
        "new file mode 120000",
        "--- /dev/null",
        "+++ b/link",
        "@@ -0,0 +1 @@",
        "+target",
        ""
      ].join("\n");
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: symlinkPatch }
      }), "SYMLINK_PATCH_BLOCKED", {});

      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch(".env") }
      }), "PATH_BLOCKED", { path: ".env" });

      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch("../outside.txt") }
      }), "PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" });
    });

    await withInMemoryClient({
      root,
      configOverrides: { maxWriteBytes: 32 }
    }, async (client) => {
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch() }
      }), "PATCH_TOO_LARGE", { limit_bytes: 32 });
    });
  });
});

test("apply_patch preserves size, secret, and symlink rejection precedence before path policy", async () => {
  await withTempWorkspace({ "demo.txt": "before\n" }, async (root) => {
    const secretValue = "sk-" + "abcdefghijklmno";
    await withInMemoryClient({ root }, async (client) => {
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch(".env", "before", secretValue) }
      }), "SECRET_CONTENT_BLOCKED", {});

      const symlinkBlockedPathPatch = [
        "diff --git a/.env b/.env",
        "new file mode 120000",
        "--- /dev/null",
        "+++ b/.env",
        "@@ -0,0 +1 @@",
        "+target",
        ""
      ].join("\n");
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: symlinkBlockedPathPatch }
      }), "SYMLINK_PATCH_BLOCKED", {});
    });

    await withInMemoryClient({
      root,
      configOverrides: { maxWriteBytes: 32 }
    }, async (client) => {
      assertApplyPatchFailure(await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch(".env") }
      }), "PATCH_TOO_LARGE", { limit_bytes: 32 });
    });
  });
});

test("apply_patch uses the injected provider and validates its exact returned path set", async () => {
  await withTempWorkspace({ "demo.txt": "before\n" }, async (root) => {
    const patch = singleFilePatch();
    let observed;
    await withInMemoryClient({
      root,
      dependencies: {
        applyPatchResultProvider: async (context) => {
          observed = context;
          return {
            paths: ["demo.txt"],
            stdout: "provider-out",
            stderr: "",
            additions: 1,
            deletions: 1,
            changed: true,
            diff: patch.trimEnd()
          };
        }
      }
    }, async (client) => {
      const parsed = parseApplyPatchResult(await client.callTool({
        name: "apply_patch",
        arguments: { patch }
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.stdout, "provider-out");
      assert.equal(observed.patch, patch);
      assert.equal(observed.workspace.root, root);
      assert.ok(observed.config);
      assert.ok(observed.guard);
    });

    const invalidResults = [
      {
        paths: ["demo.txt", "demo.txt"],
        stdout: "",
        stderr: "",
        additions: 1,
        deletions: 1,
        changed: true,
        diff: patch.trimEnd()
      },
      {
        paths: ["different.txt"],
        stdout: "",
        stderr: "",
        additions: 1,
        deletions: 1,
        changed: true,
        diff: patch.trimEnd()
      },
      {
        paths: ["../outside.txt"],
        stdout: "",
        stderr: "",
        additions: 1,
        deletions: 1,
        changed: true,
        diff: patch.trimEnd()
      },
      {
        paths: ["demo.txt"],
        stdout: "",
        stderr: "",
        additions: -1,
        deletions: 1,
        changed: true,
        diff: patch.trimEnd()
      }
    ];

    for (const providerResult of invalidResults) {
      await withInMemoryClient({
        root,
        dependencies: {
          applyPatchResultProvider: async () => providerResult
        }
      }, async (client) => {
        const result = await client.callTool({
          name: "apply_patch",
          arguments: { patch }
        });
        assertApplyPatchFailure(result, "INTERNAL_ERROR", {});
        assert.equal(resultText(result).includes("outside.txt"), false);
      });
    }
  });
});

test("apply_patch classifies Git operation stages without leaking diagnostics", async () => {
  await withTempWorkspace({ "demo.txt": "before\n" }, async (root) => {
    const patch = singleFilePatch();
    const stageCases = [
      ["git_unavailable", "GIT_UNAVAILABLE"],
      ["check_failed", "PATCH_CHECK_FAILED"],
      ["apply_failed", "PATCH_APPLY_FAILED"]
    ];

    for (const [kind, code] of stageCases) {
      await withInMemoryClient({
        root,
        dependencies: {
          applyPatchResultProvider: async () => {
            throw new ApplyPatchOperationError(kind);
          }
        }
      }, async (client) => {
        const result = await client.callTool({
          name: "apply_patch",
          arguments: { patch }
        });
        assertApplyPatchFailure(result, code, {});
        const text = resultText(result);
        assert.equal(text.includes("git apply"), false);
        assert.equal(text.includes(root), false);
      });
    }
  });
});

test("apply_patch maps a real git apply preflight mismatch to PATCH_CHECK_FAILED", async () => {
  await withTempWorkspace({ "demo.txt": "different\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "apply_patch",
        arguments: { patch: singleFilePatch() }
      });
      assertApplyPatchFailure(result, "PATCH_CHECK_FAILED", {});
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("patch failed:"), false);
      assert.equal(serialized.includes(root), false);
      assert.equal(await fs.readFile(path.join(root, "demo.txt"), "utf8"), "different\n");
    });
  });
});

test("apply_patch preserves normalized multi-file path discovery order", async () => {
  await withTempWorkspace({ "a.txt": "before-a\n", "b.txt": "before-b\n" }, async (root) => {
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-before-a",
      "+after-a",
      "--- a/b.txt",
      "+++ b/b.txt",
      "@@ -1 +1 @@",
      "-before-b",
      "+after-b",
      ""
    ].join("\n");
    await withInMemoryClient({ root }, async (client) => {
      const parsed = parseApplyPatchResult(await client.callTool({
        name: "apply_patch",
        arguments: { patch }
      }));
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.data.paths, ["a.txt", "b.txt"]);
      assert.equal(parsed.data.diff, patch.trimEnd());
      assert.equal(
        (await fs.readFile(path.join(root, "a.txt"), "utf8")).replace(/\r\n/g, "\n"),
        "after-a\n"
      );
      assert.equal(
        (await fs.readFile(path.join(root, "b.txt"), "utf8")).replace(/\r\n/g, "\n"),
        "after-b\n"
      );
    });
  });
});

test("apply_patch invalidates analysis only after a fully validated success", async () => {
  await withTempWorkspace({ "src/example.ts": "export const value = 1;\n" }, async (root) => {
    const patch = singleFilePatch("src/example.ts", "export const value = 1;", "export const value = 2;");
    let mode = "provider_error";
    await withInMemoryClient({
      root,
      dependencies: {
        applyPatchResultProvider: async () => {
          if (mode === "provider_error") throw new Error("private provider detail");
          if (mode === "malformed") {
            return {
              paths: [],
              stdout: "",
              stderr: "",
              additions: 1,
              deletions: 1,
              changed: true,
              diff: patch.trimEnd()
            };
          }
          if (mode === "duplicate") {
            return {
              paths: ["src/example.ts", "src/example.ts"],
              stdout: "",
              stderr: "",
              additions: 1,
              deletions: 1,
              changed: true,
              diff: patch.trimEnd()
            };
          }
          if (mode === "mismatch") {
            return {
              paths: ["src/other.ts"],
              stdout: "",
              stderr: "",
              additions: 1,
              deletions: 1,
              changed: true,
              diff: patch.trimEnd()
            };
          }
          if (mode === "unsafe") {
            return {
              paths: ["../outside.ts"],
              stdout: "",
              stderr: "",
              additions: 1,
              deletions: 1,
              changed: true,
              diff: patch.trimEnd()
            };
          }
          if (mode === "check_failed" || mode === "apply_failed") {
            throw new ApplyPatchOperationError(mode);
          }
          return {
            paths: ["src/example.ts"],
            stdout: "",
            stderr: "",
            additions: 1,
            deletions: 1,
            changed: true,
            diff: patch.trimEnd()
          };
        }
      }
    }, async (client) => {
      await client.callTool({ name: "inspect_workspace", arguments: {} });
      const warm = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(warm.structuredContent.data.cache.hit, true);

      for (const preservedMode of [
        "provider_error",
        "malformed",
        "duplicate",
        "mismatch",
        "unsafe",
        "check_failed",
        "apply_failed"
      ]) {
        mode = preservedMode;
        await client.callTool({
          name: "apply_patch",
          arguments: { patch }
        });
        const after = await client.callTool({ name: "inspect_workspace", arguments: {} });
        assert.equal(after.structuredContent.data.cache.hit, true, `${preservedMode} must preserve cache`);
      }

      mode = "success";
      const success = parseApplyPatchResult(await client.callTool({
        name: "apply_patch",
        arguments: { patch }
      }));
      assert.equal(success.ok, true);
      const afterSuccess = await client.callTool({ name: "inspect_workspace", arguments: {} });
      assert.equal(afterSuccess.structuredContent.data.cache.hit, false);
    });
  });
});

test("apply_patch Tool Card consumes nested data and leaves only export_pro_context on the legacy renderer", () => {
  const renderMatch = toolCardWidgetHtml.match(/function renderApplyPatch\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(renderMatch, "apply_patch must have a dedicated Tool Card renderer");
  const renderer = renderMatch[0];

  assert.match(renderer, /data\?\.data/);
  assert.match(renderer, /patchData\.paths/);
  assert.match(renderer, /patchData\.additions/);
  assert.match(renderer, /patchData\.deletions/);
  assert.match(renderer, /patchData\.diff/);
  assert.match(renderer, /data\?\.error/);
  assert.match(renderer, /slice\(0, 8\)/);
  assert.doesNotMatch(renderer, /data\.(?:paths|additions|deletions|diff)/);

  assert.match(
    toolCardWidgetHtml,
    /tool === "apply_patch"\) \{\s*root\.innerHTML = renderApplyPatch\(data\)/
  );
  assert.match(
    toolCardWidgetHtml,
    /tool === "export_pro_context"\) \{\s*root\.innerHTML = renderFile\(data\)/
  );
  assert.doesNotMatch(
    toolCardWidgetHtml,
    /tool === "apply_patch" \|\| tool === "export_pro_context"/
  );
});

test("codexpro wrapper action apply_patch preserves strict success and failure envelopes", async () => {
  await withTempWorkspace({ "demo.txt": "before\n" }, async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: {
          action: "apply_patch",
          args: { patch: singleFilePatch() }
        }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexpro_tool, "apply_patch");
      assert.equal(structured.codexpro_title, "Apply Patch");
      assert.equal(structured.codexpro_super_action, "apply_patch");
      assert.equal(structured.wrapped_tool, "apply_patch");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.deepEqual(structured.data.paths, ["demo.txt"]);
      for (const legacyField of ["workspace_id", "root", "paths", "stdout", "stderr", "additions", "deletions", "changed", "diff"]) {
        assert.equal(legacyField in structured, false);
      }
    });

    const leaked = path.join(root, "private-provider-detail.txt");
    await withInMemoryClient({
      root,
      dependencies: {
        applyPatchResultProvider: async () => {
          throw new Error(`provider failed at ${leaked}`);
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: {
          action: "apply_patch",
          args: { patch: singleFilePatch("demo.txt", "after", "final") }
        }
      });
      const structured = result.structuredContent;
      assert.equal(structured.codexpro_tool, "apply_patch");
      assert.equal(structured.codexpro_super_action, "apply_patch");
      assert.equal(structured.wrapped_tool, "apply_patch");
      assert.equal(structured.ok, false);
      assert.equal(structured.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(result).includes(leaked), false);
      assert.equal(JSON.stringify(result).includes("provider failed"), false);
    });
  });
});

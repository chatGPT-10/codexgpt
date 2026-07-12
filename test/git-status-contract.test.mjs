import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const {
  GIT_STATUS_ERROR_MESSAGES,
  createGitStatusFailure,
  createGitStatusSuccess,
  gitStatusOutputSchema
} = await tsImport("../src/tools/schemas/gitStatus.ts", import.meta.url);

function changedGitStatusData() {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace status",
    status: "## main...origin/main\n M src/server.ts\n?? new-file.txt",
    changed_files: ["M src/server.ts", "?? new-file.txt"],
    changed: true
  };
}

function cleanGitStatusData() {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace status",
    status: "## main...origin/main",
    changed_files: [],
    changed: false
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
    code: "GIT_NOT_REPOSITORY",
    details: {},
    message: "The workspace is not a Git repository."
  },
  {
    code: "GIT_UNAVAILABLE",
    details: {},
    message: "Git is not available to inspect this workspace."
  },
  {
    code: "GIT_COMMAND_FAILED",
    details: {},
    message: "Git could not inspect the workspace status."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The Git status could not be read because of an internal error."
  }
];

test("git_status success constructor produces the strict schema-v1 envelope", () => {
  for (const expectedData of [changedGitStatusData(), cleanGitStatusData()]) {
    const parsed = gitStatusOutputSchema.parse(createGitStatusSuccess(expectedData, 7));

    assert.deepEqual(Object.keys(parsed).sort(), [
      "codexpro_title",
      "codexpro_tool",
      "data",
      "error",
      "meta",
      "ok"
    ]);
    assert.equal(parsed.codexpro_tool, "git_status");
    assert.equal(parsed.codexpro_title, "Git Status");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, expectedData);
    assert.equal(parsed.error, null);
    assert.equal("status" in parsed, false);
    assert.equal("changed_files" in parsed, false);
    assert.equal("status_error" in parsed, false);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 7,
      warnings: []
    });
  }
});

test("git_status failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const parsed = gitStatusOutputSchema.parse(
      createGitStatusFailure({ code: expected.code, details: expected.details }, 3)
    );

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(GIT_STATUS_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("git_status schema rejects unknown fields, wrong details, branch records, and inconsistent changed state", () => {
  const changed = createGitStatusSuccess(changedGitStatusData(), 0);
  const clean = createGitStatusSuccess(cleanGitStatusData(), 0);
  const workspaceFailure = createGitStatusFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createGitStatusFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => gitStatusOutputSchema.parse({ ...changed, extra: true }));
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...changed,
      data: { ...changed.data, status_error: "legacy" }
    })
  );
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...changed,
      data: { ...changed.data, changed: false }
    })
  );
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...clean,
      data: { ...clean.data, changed: true }
    })
  );
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...changed,
      data: { ...changed.data, changed_files: ["## main"] }
    })
  );
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong" } }
    })
  );
  assert.throws(() =>
    gitStatusOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("git_status schema rejects inconsistent success and failure envelope states", () => {
  const success = createGitStatusSuccess(changedGitStatusData(), 0);
  const failure = createGitStatusFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => gitStatusOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => gitStatusOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => gitStatusOutputSchema.parse({ ...failure, data: cleanGitStatusData() }));
  assert.throws(() => gitStatusOutputSchema.parse({ ...failure, error: null }));
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
    toolMode: "full",
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
  const client = new Client({ name: "git-status-contract-test", version: "0.0.0" });
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

function runFixtureGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`
  );
  return result.stdout.trim();
}

async function withTempDirectory(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-status-contract-"));
  try {
    return await callback(await fs.realpath(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function withTempGitRepository(callback) {
  return withTempDirectory(async (root) => {
    await fs.writeFile(path.join(root, "demo.txt"), "alpha\n", "utf8");
    await fs.writeFile(path.join(root, "other.txt"), "one\n", "utf8");
    runFixtureGit(root, ["init"]);
    runFixtureGit(root, ["config", "user.email", "contract@example.invalid"]);
    runFixtureGit(root, ["config", "user.name", "Contract Test"]);
    runFixtureGit(root, ["add", "demo.txt", "other.txt"]);
    runFixtureGit(root, ["commit", "-m", "initial"]);
    return callback(root);
  });
}

function parseGitStatusResult(result) {
  return gitStatusOutputSchema.parse(result.structuredContent);
}

function assertGitStatusFailure(result, code, details) {
  const parsed = parseGitStatusResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: GIT_STATUS_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

test("git_status advertises the exact output schema and returns a valid clean repository envelope", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "git_status");

      assert.ok(descriptor, "git_status must be registered in full mode");
      assert.ok(descriptor.outputSchema, "git_status must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({ name: "git_status", arguments: {} });
      const parsed = parseGitStatusResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.path, "workspace status");
      assert.match(parsed.data.status, /^##/m);
      assert.deepEqual(parsed.data.changed_files, []);
      assert.equal(parsed.data.changed, false);
      assert.equal("status" in parsed, false);
      assert.equal("status_error" in parsed.data, false);
      assert.ok(parsed.meta.durationMs >= 0);
      assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("##")));
    });
  });
});

test("git_status preserves modified and untracked status-line semantics", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");
    await fs.writeFile(path.join(root, "new file.txt"), "new\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({ name: "git_status", arguments: {} });
      const parsed = parseGitStatusResult(result);

      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.changed, true);
      assert.ok(parsed.data.changed_files.some((line) => line.includes("demo.txt")));
      assert.ok(parsed.data.changed_files.some((line) => line.includes("new file.txt")));
      assert.equal(parsed.data.changed_files.some((line) => line.startsWith("##")), false);
    });
  });
});

test("git_status scopes to one safe path and keeps nonexistent pathspecs successful", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");
    await fs.appendFile(path.join(root, "other.txt"), "two\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const scoped = parseGitStatusResult(await client.callTool({
        name: "git_status",
        arguments: { path: "demo.txt" }
      }));
      assert.equal(scoped.data.path, "demo.txt");
      assert.equal(scoped.data.changed_files.length, 1);
      assert.ok(scoped.data.changed_files[0].includes("demo.txt"));
      assert.equal(scoped.data.changed_files.some((line) => line.includes("other.txt")), false);

      const missing = parseGitStatusResult(await client.callTool({
        name: "git_status",
        arguments: { path: "missing-safe-path.txt" }
      }));
      assert.equal(missing.ok, true);
      assert.equal(missing.data.path, "missing-safe-path.txt");
      assert.deepEqual(missing.data.changed_files, []);
      assert.equal(missing.data.changed, false);

      const blank = parseGitStatusResult(await client.callTool({
        name: "git_status",
        arguments: { path: "  " }
      }));
      assert.equal(blank.ok, true);
      assert.equal(blank.data.path, "  ");
      assert.equal(blank.data.changed_files.length, 2);
      assert.equal(blank.data.changed, true);
    });
  });
});

test("git_status maps an unknown explicit workspace to WORKSPACE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "git_status",
      arguments: { workspace_id: "ws_missing_git_status_contract" }
    });
    assertGitStatusFailure(result, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_git_status_contract"
    });
  });
});

test("git_status maps outside paths safely to PATH_OUTSIDE_WORKSPACE", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const relativeResult = await client.callTool({
        name: "git_status",
        arguments: { path: "../outside.txt" }
      });
      assertGitStatusFailure(relativeResult, "PATH_OUTSIDE_WORKSPACE", {
        path: "../outside.txt"
      });

      const absoluteOutside = path.resolve(root, "..", "outside-git-status.txt");
      const absoluteResult = await client.callTool({
        name: "git_status",
        arguments: { path: absoluteOutside }
      });
      assertGitStatusFailure(absoluteResult, "PATH_OUTSIDE_WORKSPACE", {
        path: "[unsafe path omitted]"
      });
      assert.equal(JSON.stringify(absoluteResult).includes(absoluteOutside), false);
    });
  });
});

test("git_status maps blocked paths to PATH_BLOCKED", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "git_status",
        arguments: { path: ".git/config" }
      });
      assertGitStatusFailure(result, "PATH_BLOCKED", { path: ".git/config" });
    });
  });
});

test("git_status maps an ordinary directory to GIT_NOT_REPOSITORY", async () => {
  await withTempDirectory(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({ name: "git_status", arguments: {} });
      assertGitStatusFailure(result, "GIT_NOT_REPOSITORY", {});
      assert.equal(JSON.stringify(result).includes(root), false);
    });
  });
});

test("git_status maps injected executable absence to GIT_UNAVAILABLE", async () => {
  await withInMemoryClient({
    dependencies: {
      gitStatusResultProvider: async () =>
        "git unavailable or failed: spawnSync git ENOENT"
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_status", arguments: {} });
    assertGitStatusFailure(result, "GIT_UNAVAILABLE", {});
    assert.doesNotMatch(JSON.stringify(result), /spawnSync git ENOENT/);
  });
});

test("git_status maps recognized Git command failures to GIT_COMMAND_FAILED", async () => {
  for (const providerOutput of [
    "fatal: unable to read index",
    "git unavailable or failed: spawnSync git EACCES"
  ]) {
    await withInMemoryClient({
      dependencies: {
        gitStatusResultProvider: async () => providerOutput
      }
    }, async (client) => {
      const result = await client.callTool({ name: "git_status", arguments: {} });
      assertGitStatusFailure(result, "GIT_COMMAND_FAILED", {});
      assert.equal(JSON.stringify(result).includes(providerOutput), false);
    });
  }
});

test("git_status maps malformed provider output to INTERNAL_ERROR", async () => {
  await withInMemoryClient({
    dependencies: {
      gitStatusResultProvider: async () => 123
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_status", arguments: {} });
    assertGitStatusFailure(result, "INTERNAL_ERROR", {});
  });
});

test("git_status converts a secret-bearing provider exception to fixed redacted INTERNAL_ERROR", async () => {
  const secret = ["gh", "p_", "c".repeat(32)].join("");

  await withInMemoryClient({
    dependencies: {
      gitStatusResultProvider: async () => {
        throw new Error(`git status provider failed with ${secret}`);
      }
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_status", arguments: {} });
    const serialized = JSON.stringify(result);

    assertGitStatusFailure(result, "INTERNAL_ERROR", {});
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /git status provider failed/);
    assert.doesNotMatch(serialized, /\n\s*at\s/);
  });
});

test("git_status tool card reads direct success and failure only from nested data and error", () => {
  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "git_status"\) \{\s*root\.innerHTML = renderStatus\(data\);/
  );

  assert.match(
    toolCardWidgetHtml,
    /if \(data\?\.codexpro_tool === "git_status"\) \{\s*if \(data\?\.ok === false\) return data\?\.error\?\.code[\s\S]*?const statusData = data\?\.data \?\? \{\};/
  );

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderStatus\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderStatus must exist");

  const renderer = rendererMatch[0];
  assert.match(renderer, /const statusData = data\?\.data \?\? \{\};/);
  assert.match(renderer, /const error = data\?\.error \?\? \{\};/);
  assert.match(renderer, /statusData\.changed_files/);
  assert.match(renderer, /statusData\.status/);
  assert.match(renderer, /statusData\.changed/);
  assert.match(renderer, /error\.message/);
  assert.doesNotMatch(renderer, /data\?\.(?:changed_files|status|changed|status_error)/);

  const changesRenderer = toolCardWidgetHtml.match(
    /function renderChanges\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(changesRenderer, "renderChanges must remain present");
  assert.match(changesRenderer[0], /data\.changed_files/);
});

test("codexpro action git_status preserves wrapper metadata and nested child contract", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: { action: "git_status", args: { path: "demo.txt" } }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexpro_tool, "git_status");
      assert.equal(structured.codexpro_super_action, "git_status");
      assert.equal(structured.wrapped_tool, "git_status");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.equal(structured.data.changed_files.length, 1);
      assert.ok(structured.data.changed_files[0].includes("demo.txt"));
      assert.equal("changed_files" in structured, false);
      assert.equal("status_error" in structured, false);
    });
  });
});

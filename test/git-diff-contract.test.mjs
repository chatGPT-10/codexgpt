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
  GIT_DIFF_ERROR_MESSAGES,
  createGitDiffFailure,
  createGitDiffSuccess,
  gitDiffOutputSchema
} = await tsImport("../src/tools/schemas/gitDiff.ts", import.meta.url);

function changedGitDiffData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace diff",
    staged: false,
    include_diff: true,
    additions: 1,
    deletions: 0,
    changed: true,
    diff: [
      "diff --git a/demo.txt b/demo.txt",
      "index 4a58007..fbbee86 100644",
      "--- a/demo.txt",
      "+++ b/demo.txt",
      "@@ -1 +1,2 @@",
      " alpha",
      "+beta"
    ].join("\n"),
    ...overrides
  };
}

function cleanGitDiffData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace diff",
    staged: false,
    include_diff: true,
    additions: 0,
    deletions: 0,
    changed: false,
    diff: "",
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
    message: "Git could not inspect the workspace diff."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The Git diff could not be read because of an internal error."
  }
];

test("git_diff success constructor produces the strict schema-v1 envelope", () => {
  const cases = [
    changedGitDiffData(),
    cleanGitDiffData(),
    changedGitDiffData({ include_diff: false, diff: "" }),
    changedGitDiffData({
      additions: 0,
      deletions: 0,
      diff: "diff --git a/demo.txt b/demo.txt\nold mode 100644\nnew mode 100755"
    })
  ];

  for (const expectedData of cases) {
    const parsed = gitDiffOutputSchema.parse(createGitDiffSuccess(expectedData, 7));

    assert.deepEqual(Object.keys(parsed).sort(), [
      "codexpro_title",
      "codexpro_tool",
      "data",
      "error",
      "meta",
      "ok"
    ]);
    assert.equal(parsed.codexpro_tool, "git_diff");
    assert.equal(parsed.codexpro_title, "Git Diff");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, expectedData);
    assert.equal(parsed.error, null);
    assert.equal("diff" in parsed, false);
    assert.equal("diff_error" in parsed, false);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 7,
      warnings: []
    });
  }
});

test("git_diff failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const parsed = gitDiffOutputSchema.parse(
      createGitDiffFailure({ code: expected.code, details: expected.details }, 3)
    );

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(GIT_DIFF_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("git_diff schema rejects unknown fields, legacy errors, invalid counts, and inconsistent diff state", () => {
  const changed = createGitDiffSuccess(changedGitDiffData(), 0);
  const clean = createGitDiffSuccess(cleanGitDiffData(), 0);
  const statsOnly = createGitDiffSuccess(
    changedGitDiffData({ include_diff: false, diff: "" }),
    0
  );
  const workspaceFailure = createGitDiffFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createGitDiffFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => gitDiffOutputSchema.parse({ ...changed, extra: true }));
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...changed,
      data: { ...changed.data, diff_error: "legacy" }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...changed,
      data: { ...changed.data, additions: -1 }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...statsOnly,
      data: { ...statsOnly.data, diff: "raw diff" }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...clean,
      data: { ...clean.data, additions: 1 }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...clean,
      data: { ...clean.data, diff: "raw diff" }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...changed,
      data: { ...changed.data, changed: false }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong" } }
    })
  );
  assert.throws(() =>
    gitDiffOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("git_diff schema rejects inconsistent success and failure envelope states", () => {
  const success = createGitDiffSuccess(changedGitDiffData(), 0);
  const failure = createGitDiffFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => gitDiffOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => gitDiffOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => gitDiffOutputSchema.parse({ ...failure, data: cleanGitDiffData() }));
  assert.throws(() => gitDiffOutputSchema.parse({ ...failure, error: null }));
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
  const client = new Client({ name: "git-diff-contract-test", version: "0.0.0" });
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-diff-contract-"));
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

function parseGitDiffResult(result) {
  return gitDiffOutputSchema.parse(result.structuredContent);
}

function assertGitDiffFailure(result, code, details) {
  const parsed = parseGitDiffResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: GIT_DIFF_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

test("git_diff advertises the exact output schema and returns a valid clean repository envelope", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "git_diff");

      assert.ok(descriptor, "git_diff must be registered in full mode");
      assert.ok(descriptor.outputSchema, "git_diff must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({ name: "git_diff", arguments: {} });
      const parsed = parseGitDiffResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.path, "workspace diff");
      assert.equal(parsed.data.staged, false);
      assert.equal(parsed.data.include_diff, true);
      assert.equal(parsed.data.additions, 0);
      assert.equal(parsed.data.deletions, 0);
      assert.equal(parsed.data.changed, false);
      assert.equal(parsed.data.diff, "");
      assert.equal("diff" in parsed, false);
      assert.equal("diff_error" in parsed.data, false);
      assert.ok(parsed.meta.durationMs >= 0);
    });
  });
});

test("git_diff preserves unstaged diff text and line statistics", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({ name: "git_diff", arguments: {} });
      const parsed = parseGitDiffResult(result);

      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.changed, true);
      assert.equal(parsed.data.additions, 1);
      assert.equal(parsed.data.deletions, 0);
      assert.match(parsed.data.diff, /\+beta/);
      assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("+beta")));
    });
  });
});

test("git_diff include_diff=false preserves stats and omits only raw diff", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "git_diff",
        arguments: { include_diff: false }
      });
      const parsed = parseGitDiffResult(result);

      assert.equal(parsed.data.include_diff, false);
      assert.equal(parsed.data.changed, true);
      assert.equal(parsed.data.additions, 1);
      assert.equal(parsed.data.deletions, 0);
      assert.equal(parsed.data.diff, "");
      assert.ok(result.content.some((item) =>
        item.type === "text" && item.text.includes("Raw diff omitted by include_diff=false")
      ));
    });
  });
});

test("git_diff separates staged and unstaged changes", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "staged\n", "utf8");
    runFixtureGit(root, ["add", "demo.txt"]);
    await fs.appendFile(path.join(root, "other.txt"), "unstaged\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const unstaged = parseGitDiffResult(await client.callTool({
        name: "git_diff",
        arguments: {}
      }));
      assert.equal(unstaged.data.staged, false);
      assert.match(unstaged.data.diff, /other\.txt/);
      assert.doesNotMatch(unstaged.data.diff, /demo\.txt/);

      const staged = parseGitDiffResult(await client.callTool({
        name: "git_diff",
        arguments: { staged: true }
      }));
      assert.equal(staged.data.staged, true);
      assert.match(staged.data.diff, /demo\.txt/);
      assert.doesNotMatch(staged.data.diff, /other\.txt/);
    });
  });
});

test("git_diff scopes to one safe path and keeps blank and nonexistent pathspecs successful", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");
    await fs.appendFile(path.join(root, "other.txt"), "two\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const scoped = parseGitDiffResult(await client.callTool({
        name: "git_diff",
        arguments: { path: "demo.txt" }
      }));
      assert.equal(scoped.data.path, "demo.txt");
      assert.match(scoped.data.diff, /demo\.txt/);
      assert.doesNotMatch(scoped.data.diff, /other\.txt/);

      const missing = parseGitDiffResult(await client.callTool({
        name: "git_diff",
        arguments: { path: "missing-safe-path.txt" }
      }));
      assert.equal(missing.ok, true);
      assert.equal(missing.data.path, "missing-safe-path.txt");
      assert.equal(missing.data.changed, false);
      assert.equal(missing.data.diff, "");

      const blank = parseGitDiffResult(await client.callTool({
        name: "git_diff",
        arguments: { path: "  " }
      }));
      assert.equal(blank.ok, true);
      assert.equal(blank.data.path, "  ");
      assert.equal(blank.data.changed, true);
      assert.match(blank.data.diff, /demo\.txt/);
      assert.match(blank.data.diff, /other\.txt/);
    });
  });
});

test("git_diff maps an unknown explicit workspace to WORKSPACE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "git_diff",
      arguments: { workspace_id: "ws_missing_git_diff_contract" }
    });
    assertGitDiffFailure(result, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_git_diff_contract"
    });
  });
});

test("git_diff maps outside paths safely to PATH_OUTSIDE_WORKSPACE", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const relativeResult = await client.callTool({
        name: "git_diff",
        arguments: { path: "../outside.txt" }
      });
      assertGitDiffFailure(relativeResult, "PATH_OUTSIDE_WORKSPACE", {
        path: "../outside.txt"
      });

      const absoluteOutside = path.resolve(root, "..", "outside-git-diff.txt");
      const absoluteResult = await client.callTool({
        name: "git_diff",
        arguments: { path: absoluteOutside }
      });
      assertGitDiffFailure(absoluteResult, "PATH_OUTSIDE_WORKSPACE", {
        path: "[unsafe path omitted]"
      });
      assert.equal(JSON.stringify(absoluteResult).includes(absoluteOutside), false);
    });
  });
});

test("git_diff maps blocked paths to PATH_BLOCKED", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "git_diff",
        arguments: { path: ".git/config" }
      });
      assertGitDiffFailure(result, "PATH_BLOCKED", { path: ".git/config" });
    });
  });
});

test("git_diff maps an ordinary directory to GIT_NOT_REPOSITORY", async () => {
  await withTempDirectory(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({ name: "git_diff", arguments: {} });
      assertGitDiffFailure(result, "GIT_NOT_REPOSITORY", {});
      assert.equal(JSON.stringify(result).includes(root), false);
    });
  });
});

test("git_diff maps injected executable absence to GIT_UNAVAILABLE", async () => {
  await withInMemoryClient({
    dependencies: {
      gitDiffResultProvider: async () =>
        "git unavailable or failed: spawnSync git ENOENT"
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_diff", arguments: {} });
    assertGitDiffFailure(result, "GIT_UNAVAILABLE", {});
    assert.doesNotMatch(JSON.stringify(result), /spawnSync git ENOENT/);
  });
});

test("git_diff maps recognized Git command failures to GIT_COMMAND_FAILED", async () => {
  for (const providerOutput of [
    "fatal: unable to read index",
    "git unavailable or failed: spawnSync git EACCES"
  ]) {
    await withInMemoryClient({
      dependencies: {
        gitDiffResultProvider: async () => providerOutput
      }
    }, async (client) => {
      const result = await client.callTool({ name: "git_diff", arguments: {} });
      assertGitDiffFailure(result, "GIT_COMMAND_FAILED", {});
      assert.equal(JSON.stringify(result).includes(providerOutput), false);
    });
  }
});

test("git_diff maps malformed provider output to INTERNAL_ERROR", async () => {
  await withInMemoryClient({
    dependencies: {
      gitDiffResultProvider: async () => 123
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_diff", arguments: {} });
    assertGitDiffFailure(result, "INTERNAL_ERROR", {});
  });
});

test("git_diff converts a secret-bearing provider exception to fixed redacted INTERNAL_ERROR", async () => {
  const secret = ["gh", "p_", "d".repeat(32)].join("");

  await withInMemoryClient({
    dependencies: {
      gitDiffResultProvider: async () => {
        throw new Error(`git diff provider failed with ${secret}`);
      }
    }
  }, async (client) => {
    const result = await client.callTool({ name: "git_diff", arguments: {} });
    const serialized = JSON.stringify(result);

    assertGitDiffFailure(result, "INTERNAL_ERROR", {});
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /git diff provider failed/);
    assert.doesNotMatch(serialized, /\n\s*at\s/);
  });
});

test("git_diff tool card reads direct success and failure only from nested data and error", () => {
  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "git_diff"\) \{\s*root\.innerHTML = renderGitDiff\(data\);/
  );

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderGitDiff\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderGitDiff must exist");

  const renderer = rendererMatch[0];
  assert.match(renderer, /const diffData = data\?\.data \?\? \{\};/);
  assert.match(renderer, /const error = data\?\.error \?\? \{\};/);
  assert.match(renderer, /diffData\.diff/);
  assert.match(renderer, /diffData\.additions/);
  assert.match(renderer, /diffData\.deletions/);
  assert.match(renderer, /diffData\.changed/);
  assert.match(renderer, /error\.message/);
  assert.doesNotMatch(renderer, /data\?\.(?:diff|additions|deletions|changed|diff_error)/);

  const changesRenderer = toolCardWidgetHtml.match(
    /function renderChanges\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(changesRenderer, "renderChanges must remain present");
  assert.match(changesRenderer[0], /data\.diff/);
  assert.match(changesRenderer[0], /data\.additions/);
});

test("codexpro action git_diff preserves wrapper metadata and nested child contract", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "codexpro",
        arguments: { action: "git_diff", args: { path: "demo.txt" } }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexpro_tool, "git_diff");
      assert.equal(structured.codexpro_super_action, "git_diff");
      assert.equal(structured.wrapped_tool, "git_diff");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.equal(structured.data.path, "demo.txt");
      assert.equal(structured.data.changed, true);
      assert.match(structured.data.diff, /demo\.txt/);
      assert.equal("diff" in structured, false);
      assert.equal("additions" in structured, false);
      assert.equal("deletions" in structured, false);
      assert.equal("changed" in structured, false);
      assert.equal("diff_error" in structured, false);
    });
  });
});

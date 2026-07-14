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
  SHOW_CHANGES_ANALYSIS_WARNING,
  SHOW_CHANGES_ERROR_MESSAGES,
  createShowChangesFailure,
  createShowChangesSuccess,
  showChangesOutputSchema
} = await tsImport("../src/tools/schemas/showChanges.ts", import.meta.url);

function exactAnalysis(overrides = {}) {
  return {
    schema_version: 1,
    changed_paths: ["src/server.ts"],
    affected_areas: ["src"],
    dependent_files: [
      {
        path: "src/http.ts",
        confidence: "strong",
        reasons: ["imports changed file"]
      }
    ],
    related_tests: [
      {
        path: "test/show-changes-contract.test.mjs",
        confidence: "exact",
        reasons: ["direct contract test"]
      }
    ],
    risk_signals: [
      {
        id: "public-api",
        label: "Public API",
        confidence: "strong",
        paths: ["src/server.ts"],
        reasons: ["public tool contract changed"]
      }
    ],
    recommended_commands: [
      {
        command: "npm test",
        source: "package.json",
        reasons: ["project test script"]
      }
    ],
    coverage: {
      inventoryFiles: 100,
      analyzedFiles: 90,
      scannedBytes: 100000,
      symbolCount: 200,
      relationshipCount: 300,
      truncated: false,
      warnings: []
    },
    warnings: [],
    cache: {
      hit: false,
      key: "analysis-cache-key"
    },
    ...overrides
  };
}

function changedShowChangesData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace changes",
    status: "## main...origin/main\n M src/server.ts",
    changed_files: [" M src/server.ts"],
    staged: false,
    include_diff: true,
    additions: 1,
    deletions: 0,
    changed: true,
    diff: [
      "diff --git a/src/server.ts b/src/server.ts",
      "--- a/src/server.ts",
      "+++ b/src/server.ts",
      "@@ -1 +1,2 @@",
      " alpha",
      "+beta"
    ].join("\n"),
    review_since: "last_shown",
    review_marked: true,
    review_checkpoint_hit: false,
    analysis: null,
    ...overrides
  };
}

function cleanShowChangesData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace changes",
    status: "## main...origin/main",
    changed_files: [],
    staged: false,
    include_diff: true,
    additions: 0,
    deletions: 0,
    changed: false,
    diff: "",
    review_since: "last_shown",
    review_marked: true,
    review_checkpoint_hit: false,
    analysis: null,
    ...overrides
  };
}

function checkpointHitData(overrides = {}) {
  return cleanShowChangesData({
    status: "## main...origin/main\n M src/server.ts",
    review_checkpoint_hit: true,
    ...overrides
  });
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
    message: "Git is not available to review this workspace."
  },
  {
    code: "GIT_COMMAND_FAILED",
    details: {},
    message: "Git could not review the workspace changes."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace changes could not be reviewed because of an internal error."
  }
];

test("show_changes success constructor produces the strict schema-v1 envelope", () => {
  const cases = [
    changedShowChangesData(),
    cleanShowChangesData(),
    checkpointHitData(),
    changedShowChangesData({
      include_diff: false,
      diff: "",
      review_marked: false
    }),
    changedShowChangesData({
      status: "## main...origin/main\n?? new.txt",
      changed_files: ["?? new.txt"],
      additions: 0,
      deletions: 0,
      diff: ""
    }),
    changedShowChangesData({
      additions: 0,
      deletions: 0,
      diff: "diff --git a/demo.txt b/demo.txt\nold mode 100644\nnew mode 100755"
    }),
    changedShowChangesData({ analysis: exactAnalysis() })
  ];

  for (const expectedData of cases) {
    const parsed = showChangesOutputSchema.parse(
      createShowChangesSuccess(expectedData, 7)
    );

    assert.deepEqual(Object.keys(parsed).sort(), [
      "codexpro_title",
      "codexpro_tool",
      "data",
      "error",
      "meta",
      "ok"
    ]);
    assert.equal(parsed.codexpro_tool, "show_changes");
    assert.equal(parsed.codexpro_title, "Show Changes");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, expectedData);
    assert.equal(parsed.error, null);
    assert.equal("status_error" in parsed, false);
    assert.equal("diff_error" in parsed, false);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 7,
      warnings: []
    });
  }
});

test("show_changes success constructor preserves only the fixed analysis warning", () => {
  const parsed = showChangesOutputSchema.parse(
    createShowChangesSuccess(
      changedShowChangesData(),
      4,
      [SHOW_CHANGES_ANALYSIS_WARNING]
    )
  );

  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 4,
    warnings: [
      "Change analysis was unavailable; Git review data is still complete."
    ]
  });
});

test("show_changes failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const parsed = showChangesOutputSchema.parse(
      createShowChangesFailure(
        { code: expected.code, details: expected.details },
        3
      )
    );

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(SHOW_CHANGES_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("show_changes schema rejects unknown, legacy, malformed analysis, and invalid review states", () => {
  const changed = createShowChangesSuccess(changedShowChangesData(), 0);
  const clean = createShowChangesSuccess(cleanShowChangesData(), 0);
  const checkpoint = createShowChangesSuccess(checkpointHitData(), 0);
  const statsOnly = createShowChangesSuccess(
    changedShowChangesData({
      include_diff: false,
      diff: "",
      review_marked: false
    }),
    0
  );

  assert.throws(() => showChangesOutputSchema.parse({ ...changed, extra: true }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, status_error: "legacy" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, diff_error: "legacy" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, additions: -1 }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, changed_files: [" M demo.txt"] }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, additions: 1 }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, diff: "raw diff" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, review_marked: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, review_checkpoint_hit: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, review_since: "workspace" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, changed: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, analysis: exactAnalysis() }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, changed: false }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, analysis: exactAnalysis() }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        dependent_files: [{
          path: "src/http.ts",
          confidence: "guess",
          reasons: []
        }]
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        risk_signals: [{
          id: "unknown-risk",
          label: "Unknown",
          confidence: "strong",
          paths: [],
          reasons: []
        }]
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        coverage: { ...exactAnalysis().coverage, extra: true }
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({ cache: { hit: false } })
    }
  }));
});

test("show_changes schema rejects inconsistent success and failure envelope states", () => {
  const success = createShowChangesSuccess(changedShowChangesData(), 0);
  const failure = createShowChangesFailure(
    { code: "INTERNAL_ERROR", details: {} },
    0
  );

  assert.throws(() => showChangesOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => showChangesOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...failure,
    data: cleanShowChangesData()
  }));
  assert.throws(() => showChangesOutputSchema.parse({ ...failure, error: null }));
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
  const client = new Client({ name: "show-changes-contract-test", version: "0.0.0" });
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-show-changes-contract-"));
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

function parseShowChangesResult(result) {
  return showChangesOutputSchema.parse(result.structuredContent);
}

function assertShowChangesFailure(result, code, details) {
  const parsed = parseShowChangesResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: SHOW_CHANGES_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}

function internalAnalysis(overrides = {}) {
  return {
    schemaVersion: 1,
    changedPaths: ["demo.txt"],
    affectedAreas: ["."],
    dependentFiles: [],
    relatedTests: [],
    riskSignals: [],
    recommendedCommands: [],
    coverage: {
      inventoryFiles: 2,
      analyzedFiles: 2,
      scannedBytes: 16,
      symbolCount: 0,
      relationshipCount: 0,
      truncated: false,
      warnings: []
    },
    warnings: [],
    cache: { hit: false, key: "fixture-analysis" },
    ...overrides
  };
}

test("show_changes advertises the exact output schema and returns a valid clean envelope", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "show_changes");

      assert.ok(descriptor, "show_changes must be registered in full mode");
      assert.ok(descriptor.outputSchema, "show_changes must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({
        name: "show_changes",
        arguments: { mark_reviewed: false }
      });
      const parsed = parseShowChangesResult(result);

      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.path, "workspace changes");
      assert.equal(parsed.data.changed, false);
      assert.deepEqual(parsed.data.changed_files, []);
      assert.equal(parsed.data.diff, "");
      assert.equal(parsed.data.review_marked, false);
      assert.equal(parsed.data.review_checkpoint_hit, false);
      assert.equal(parsed.data.analysis, null);
    });
  });
});

test("show_changes preserves review data, checkpoints, and workspace bypass", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root, configOverrides: { analysisEnabled: false } }, async (client) => {
      const first = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: {}
      }));
      assert.equal(first.data.changed, true);
      assert.equal(first.data.additions, 1);
      assert.equal(first.data.deletions, 0);
      assert.match(first.data.diff, /\+beta/);
      assert.ok(first.data.changed_files.some((line) => line.includes("demo.txt")));
      assert.equal(first.data.review_marked, true);
      assert.equal(first.data.review_checkpoint_hit, false);

      const repeated = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: {}
      }));
      assert.equal(repeated.data.changed, false);
      assert.deepEqual(repeated.data.changed_files, []);
      assert.equal(repeated.data.additions, 0);
      assert.equal(repeated.data.deletions, 0);
      assert.equal(repeated.data.diff, "");
      assert.equal(repeated.data.review_checkpoint_hit, true);

      const workspaceReview = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { since: "workspace", mark_reviewed: false }
      }));
      assert.equal(workspaceReview.data.changed, true);
      assert.equal(workspaceReview.data.review_checkpoint_hit, false);
      assert.match(workspaceReview.data.diff, /\+beta/);
    });
  });
});

test("show_changes include_diff=false preserves stats without consuming the full checkpoint", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root, configOverrides: { analysisEnabled: false } }, async (client) => {
      const statsOnly = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { include_diff: false }
      }));
      assert.equal(statsOnly.data.changed, true);
      assert.equal(statsOnly.data.additions, 1);
      assert.equal(statsOnly.data.diff, "");
      assert.equal(statsOnly.data.review_marked, false);
      assert.equal(statsOnly.data.review_checkpoint_hit, false);

      const full = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: {}
      }));
      assert.equal(full.data.changed, true);
      assert.equal(full.data.review_checkpoint_hit, false);
      assert.match(full.data.diff, /\+beta/);
    });
  });
});

test("show_changes preserves staged selection and path scoping", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");
    await fs.appendFile(path.join(root, "other.txt"), "two\n", "utf8");
    runFixtureGit(root, ["add", "other.txt"]);

    await withInMemoryClient({ root, configOverrides: { analysisEnabled: false } }, async (client) => {
      const unstaged = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { path: "demo.txt", mark_reviewed: false }
      }));
      assert.equal(unstaged.data.staged, false);
      assert.match(unstaged.data.diff, /demo\.txt/);
      assert.doesNotMatch(unstaged.data.diff, /other\.txt/);
      assert.ok(unstaged.data.changed_files.every((line) => !line.includes("other.txt")));

      const staged = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { path: "other.txt", staged: true, mark_reviewed: false }
      }));
      assert.equal(staged.data.staged, true);
      assert.match(staged.data.diff, /other\.txt/);
      assert.doesNotMatch(staged.data.diff, /demo\.txt/);
    });
  });
});

test("show_changes maps exact analysis and safely degrades analysis failures", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({
      root,
      dependencies: {
        showChangesAnalysisProvider: async () => internalAnalysis()
      }
    }, async (client) => {
      const parsed = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { mark_reviewed: false }
      }));
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.data.analysis, {
        schema_version: 1,
        changed_paths: ["demo.txt"],
        affected_areas: ["."],
        dependent_files: [],
        related_tests: [],
        risk_signals: [],
        recommended_commands: [],
        coverage: internalAnalysis().coverage,
        warnings: [],
        cache: { hit: false, key: "fixture-analysis" }
      });
      assert.deepEqual(parsed.meta.warnings, []);
    });

    const privateMarker = "private-marker-value-1234567890";
    await withInMemoryClient({
      root,
      dependencies: {
        showChangesAnalysisProvider: async () => {
          throw new Error(`analysis failed with ${privateMarker}`);
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "show_changes",
        arguments: { mark_reviewed: false }
      });
      const parsed = parseShowChangesResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.changed, true);
      assert.equal(parsed.data.analysis, null);
      assert.deepEqual(parsed.meta.warnings, [SHOW_CHANGES_ANALYSIS_WARNING]);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(privateMarker));
    });

    await withInMemoryClient({
      root,
      dependencies: {
        showChangesAnalysisProvider: async () => ({})
      }
    }, async (client) => {
      const parsed = parseShowChangesResult(await client.callTool({
        name: "show_changes",
        arguments: { mark_reviewed: false }
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.analysis, null);
      assert.deepEqual(parsed.meta.warnings, [SHOW_CHANGES_ANALYSIS_WARNING]);
    });
  });
});

test("show_changes maps workspace, path, and non-repository failures", async () => {
  await withTempGitRepository(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      assertShowChangesFailure(
        await client.callTool({
          name: "show_changes",
          arguments: { workspace_id: "ws_missing" }
        }),
        "WORKSPACE_NOT_FOUND",
        { workspace_id: "ws_missing" }
      );

      assertShowChangesFailure(
        await client.callTool({
          name: "show_changes",
          arguments: { path: "../outside" }
        }),
        "PATH_OUTSIDE_WORKSPACE",
        { path: "../outside" }
      );

      assertShowChangesFailure(
        await client.callTool({
          name: "show_changes",
          arguments: { path: ".git/config" }
        }),
        "PATH_BLOCKED",
        { path: ".git/config" }
      );
    });
  });

  await withTempDirectory(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      assertShowChangesFailure(
        await client.callTool({ name: "show_changes", arguments: {} }),
        "GIT_NOT_REPOSITORY",
        {}
      );
    });
  });
});

test("show_changes classifies injected status and diff provider failures without leaking raw exceptions", async () => {
  const cases = [
    {
      dependencies: {
        showChangesStatusProvider: async () => "git unavailable or failed: spawn git ENOENT"
      },
      code: "GIT_UNAVAILABLE"
    },
    {
      dependencies: {
        showChangesStatusProvider: async () => "fatal: status failed"
      },
      code: "GIT_COMMAND_FAILED"
    },
    {
      dependencies: {
        showChangesStatusProvider: async () => ({ invalid: true })
      },
      code: "INTERNAL_ERROR"
    },
    {
      dependencies: {
        showChangesStatusProvider: async () => "## main",
        showChangesDiffProvider: async () => "git unavailable or failed: spawn git ENOENT"
      },
      code: "GIT_UNAVAILABLE"
    },
    {
      dependencies: {
        showChangesStatusProvider: async () => "## main",
        showChangesDiffProvider: async () => "error: diff failed"
      },
      code: "GIT_COMMAND_FAILED"
    },
    {
      dependencies: {
        showChangesStatusProvider: async () => "## main",
        showChangesDiffProvider: async () => ({ invalid: true })
      },
      code: "INTERNAL_ERROR"
    }
  ];

  for (const fixture of cases) {
    await withInMemoryClient({ dependencies: fixture.dependencies }, async (client) => {
      assertShowChangesFailure(
        await client.callTool({ name: "show_changes", arguments: {} }),
        fixture.code,
        {}
      );
    });
  }

  const privateMarker = "private-marker-value-9876543210";
  await withInMemoryClient({
    dependencies: {
      showChangesStatusProvider: async () => {
        throw new Error(`status exploded with ${privateMarker}`);
      }
    }
  }, async (client) => {
    const result = await client.callTool({ name: "show_changes", arguments: {} });
    assertShowChangesFailure(result, "INTERNAL_ERROR", {});
    assert.doesNotMatch(JSON.stringify(result), new RegExp(privateMarker));
  });
});

test("show_changes tool card reads direct results only from data, error, and meta", () => {
  const subtitleMatch = toolCardWidgetHtml.match(
    /if \(data\?\.codexpro_tool === "show_changes"\) \{[\s\S]*?\n    \}/
  );
  assert.ok(subtitleMatch, "show_changes subtitle branch must exist");
  assert.match(subtitleMatch[0], /const review = data\?\.data \?\? \{\};/);
  assert.match(subtitleMatch[0], /const error = data\?\.error \?\? \{\};/);
  assert.doesNotMatch(subtitleMatch[0], /status_error|diff_error/);

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderChanges\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderChanges must exist");
  const renderer = rendererMatch[0];
  assert.match(renderer, /const review = data\?\.data \?\? \{\};/);
  assert.match(renderer, /const error = data\?\.error \?\? \{\};/);
  assert.match(renderer, /const warnings = Array\.isArray\(data\?\.meta\?\.warnings\)/);
  assert.match(renderer, /review\.changed_files/);
  assert.match(renderer, /review\.diff/);
  assert.match(renderer, /error\.message/);
  assert.doesNotMatch(renderer, /status_error|diff_error/);
  assert.doesNotMatch(renderer, /data\.(?:changed_files|diff|additions|deletions|changed|analysis)/);

  const analysisRendererMatch = toolCardWidgetHtml.match(
    /function renderChangeAnalysis\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(analysisRendererMatch, "renderChangeAnalysis must exist");
  assert.match(analysisRendererMatch[0], /const review = data\?\.data \?\? \{\};/);
  assert.match(analysisRendererMatch[0], /const analysis = review\.analysis \?\? \{\};/);

  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "show_changes"\) \{\s*const review = data\?\.data \?\? \{\};\s*root\.innerHTML = review\.analysis \? renderChangeAnalysis\(data\) : renderChanges\(data\);/
  );
});

test("codexpro show_changes action and changes alias preserve wrapper metadata and nested child contract", async () => {
  await withTempGitRepository(async (root) => {
    await fs.appendFile(path.join(root, "demo.txt"), "beta\n", "utf8");

    await withInMemoryClient({ root, configOverrides: { analysisEnabled: false } }, async (client) => {
      for (const action of ["show_changes", "changes"]) {
        const result = await client.callTool({
          name: "codexpro",
          arguments: {
            action,
            args: { path: "demo.txt", mark_reviewed: false }
          }
        });
        const structured = result.structuredContent;

        assert.equal(structured.codexpro_tool, "show_changes");
        assert.equal(structured.codexpro_super_action, action);
        assert.equal(structured.wrapped_tool, "show_changes");
        assert.equal(structured.ok, true);
        assert.equal(structured.error, null);
        assert.equal(structured.data.path, "demo.txt");
        assert.equal(structured.data.changed, true);
        assert.match(structured.data.diff, /demo\.txt/);
        assert.equal(structured.data.review_marked, false);
        assert.equal("status" in structured, false);
        assert.equal("changed_files" in structured, false);
        assert.equal("diff" in structured, false);
        assert.equal("analysis" in structured, false);
        assert.equal("status_error" in structured, false);
        assert.equal("diff_error" in structured, false);
      }
    });
  });
});

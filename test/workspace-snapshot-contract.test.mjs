import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport(
  "../src/tools/schemas/workspaceSnapshot.ts",
  import.meta.url
).catch(() => null);

const {
  WORKSPACE_SNAPSHOT_ERROR_MESSAGES,
  createWorkspaceSnapshotFailure,
  createWorkspaceSnapshotSuccess,
  workspaceSnapshotOutputSchema
} = schemaModule ?? {};

function sampleSnapshotData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\project",
    agents_loaded: true,
    agents_path: "AGENTS.md",
    skills: ["workspace-skill", "plugin-skill"],
    skill_inventory: [
      {
        name: "workspace-skill",
        description: null,
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
      },
      {
        name: "plugin-skill",
        description: "Plugin description",
        source: "plugin",
        path: "~/.codex/plugins/cache/example/plugin-skill/SKILL.md"
      }
    ],
    skill_counts: { total: 2, workspace: 1, user: 0, plugin: 1, other: 0 },
    tree: ".\n└── package.json",
    git_status: "## main",
    ai_context_files: [
      ".ai-bridge/current-plan.md",
      ".ai-bridge/decisions.md"
    ],
    bash_mode: "full",
    write_mode: "workspace",
    tool_mode: "full",
    ...overrides
  };
}

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { source: "workspace_id", workspace_id: "ws_missing" },
    message: "The requested workspace is not open."
  },
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { source: "default_workspace", workspace_id: null },
    message: "The requested workspace is not open."
  },
  {
    code: "SNAPSHOT_SUMMARY_FAILED",
    details: {},
    message: "The workspace summary could not be collected."
  },
  {
    code: "AI_CONTEXT_FAILED",
    details: {},
    message: "The AI handoff context could not be collected."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace snapshot failed because of an internal error."
  }
];

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
    bashMode: "safe",
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
  const server = createCodexGPTServer(config, dependencies ?? {});
  const client = new Client({ name: "workspace-snapshot-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-workspace-snapshot-contract-"));
  const root = await fs.realpath(created);
  try {
    await fs.writeFile(path.join(root, "AGENTS.md"), "# Test instructions\n", "utf8");
    return await callback(root, created);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function parseSnapshotResult(result) {
  return workspaceSnapshotOutputSchema.parse(result.structuredContent);
}

function assertSnapshotFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseSnapshotResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: WORKSPACE_SNAPSHOT_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(WORKSPACE_SNAPSHOT_ERROR_MESSAGES[code]));
  return parsed;
}

function emptySummary(context, overrides = {}) {
  return {
    text: [
      "# Workspace",
      "",
      "## Git status",
      "",
      "## main",
      "",
      "## Recent commits",
      "",
      "abc123 test commit"
    ].join("\n"),
    workspaceId: context.workspace.id,
    root: context.workspace.root,
    agentsLoaded: false,
    agentsPath: undefined,
    skills: [],
    skillInventory: [],
    skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
    tree: ".\n└── package.json",
    gitStatus: "## main",
    ...overrides
  };
}

function skillSummary(context, overrides = {}) {
  const inventory = [
    {
      name: "workspace-skill",
      description: undefined,
      source: "workspace",
      path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
    },
    {
      name: "plugin-skill",
      description: "Plugin description",
      source: "plugin",
      path: "~/.codex/plugins/cache/example/plugin-skill/SKILL.md"
    }
  ];
  return emptySummary(context, {
    agentsLoaded: true,
    agentsPath: "AGENTS.md",
    skills: inventory.map((item) => item.name),
    skillInventory: inventory,
    skillCounts: { total: 2, workspace: 1, user: 0, plugin: 1, other: 0 },
    ...overrides
  });
}

function emptyAiContext(overrides = {}) {
  return {
    text: "No .ai-bridge handoff context exists yet.",
    files: [],
    ...overrides
  };
}

test("workspace_snapshot schema module exists", () => {
  assert.ok(schemaModule, "workspaceSnapshot.ts must exist and be importable");
});

test("workspace_snapshot success constructor produces the strict schema-v1 envelope", () => {
  assert.equal(typeof createWorkspaceSnapshotSuccess, "function");
  const parsed = workspaceSnapshotOutputSchema.parse(
    createWorkspaceSnapshotSuccess(sampleSnapshotData(), 7)
  );
  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexgpt_title",
    "codexgpt_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexgpt_tool, "workspace_snapshot");
  assert.equal(parsed.codexgpt_title, "Workspace Snapshot");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleSnapshotData());
  assert.deepEqual(Object.keys(parsed.data).sort(), [
    "agents_loaded",
    "agents_path",
    "ai_context_files",
    "bash_mode",
    "git_status",
    "root",
    "skill_counts",
    "skill_inventory",
    "skills",
    "tool_mode",
    "tree",
    "workspace_id",
    "write_mode"
  ]);
  assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("workspace_snapshot failure constructor produces every approved strict error", () => {
  assert.equal(typeof createWorkspaceSnapshotFailure, "function");
  for (const expected of failureCases) {
    const parsed = workspaceSnapshotOutputSchema.parse(
      createWorkspaceSnapshotFailure(
        { code: expected.code, details: expected.details },
        4
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
    assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 4, warnings: [] });
  }
});

test("workspace_snapshot schema rejects malformed, flat, inconsistent, and additional fields", () => {
  const success = createWorkspaceSnapshotSuccess(sampleSnapshotData());
  const failure = createWorkspaceSnapshotFailure({
    code: "WORKSPACE_NOT_FOUND",
    details: { source: "workspace_id", workspace_id: "ws_missing" }
  });
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, workspace_id: "legacy" }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, codexgpt_tool: "open_workspace" }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...failure, data: sampleSnapshotData() }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: { ...success.data, extra: true } }));
  for (const field of ["workspace_id", "root", "tree", "git_status"]) {
    assert.throws(() => workspaceSnapshotOutputSchema.parse({
      ...success,
      data: { ...success.data, [field]: "" }
    }));
  }
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: { ...success.data, agents_path: undefined } }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: { ...success.data, tree: null } }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: { ...success.data, ai_context_files: undefined } }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({
    ...success,
    data: { ...success.data, skill_counts: { ...success.data.skill_counts, total: -1 } }
  }));
  assert.throws(() => workspaceSnapshotOutputSchema.parse({ ...success, data: { ...success.data, tool_mode: "invalid" } }));
  assert.throws(() => createWorkspaceSnapshotFailure({
    code: "WORKSPACE_NOT_FOUND",
    details: { source: "workspace_id", workspace_id: null }
  }));
  assert.throws(() => createWorkspaceSnapshotFailure({
    code: "WORKSPACE_NOT_FOUND",
    details: { source: "default_workspace", workspace_id: "ws_private" }
  }));
  assert.throws(() => createWorkspaceSnapshotFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
  }));
});

test("workspace_snapshot remains full-mode only and advertises an exact output schema", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        assert.equal(listed.tools.some((tool) => tool.name === "workspace_snapshot"), false);
      });
    }
    await withConfigClient(createTestConfig(root, { toolMode: "full" }), {}, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "workspace_snapshot");
      assert.ok(descriptor);
      assert.ok(descriptor.outputSchema);
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexgpt_tool", "codexgpt_title", "ok", "data", "error", "meta"])
      );
    });
  });
});

test("workspace_snapshot returns exact nested data with approved defaults", async () => {
  await withTempWorkspace(async (root) => {
    let seenOptions;
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async (context) => {
        seenOptions = context.options;
        return emptySummary(context);
      },
      workspaceSnapshotAiContextProvider: async () => emptyAiContext()
    }, async (client) => {
      const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
      const parsed = parseSnapshotResult(result);
      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.agents_path, null);
      assert.equal(parsed.data.tree, ".\n└── package.json");
      assert.deepEqual(parsed.data.ai_context_files, []);
      assert.deepEqual(seenOptions, {
        includeTree: true,
        maxDepth: 3,
        maxEntries: 500,
        includeSkills: false,
        includeGlobalSkills: false
      });
      assert.equal("root" in parsed, false);
      assert.match(resultText(result), /## Recent commits/);
      assert.match(resultText(result), /## AI handoff context/);
    });
  });
});

test("workspace_snapshot passes requested limits and skill options", async () => {
  await withTempWorkspace(async (root) => {
    let seenOptions;
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async (context) => {
        seenOptions = context.options;
        return skillSummary(context);
      },
      workspaceSnapshotAiContextProvider: async () => emptyAiContext()
    }, async (client) => {
      const parsed = parseSnapshotResult(await client.callTool({
        name: "workspace_snapshot",
        arguments: {
          max_depth: 8,
          max_files: 3000,
          include_skills: true,
          include_global_skills: true
        }
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.skill_inventory[0].description, null);
      assert.deepEqual(seenOptions, {
        includeTree: true,
        maxDepth: 8,
        maxEntries: 3000,
        includeSkills: true,
        includeGlobalSkills: true
      });
    });
  });
});

test("workspace_snapshot normalizes allowed AI context files without creating context", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async (context) => emptySummary(context),
      workspaceSnapshotAiContextProvider: async () => ({
        text: "private handoff body",
        files: ["./.ai-bridge/current-plan.md", ".ai-bridge/decisions.md"]
      })
    }, async (client) => {
      const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
      const parsed = parseSnapshotResult(result);
      assert.deepEqual(parsed.data.ai_context_files, [
        ".ai-bridge/current-plan.md",
        ".ai-bridge/decisions.md"
      ]);
      assert.equal(JSON.stringify(parsed).includes("private handoff body"), false);
    });
    await assert.rejects(fs.stat(path.join(root, ".ai-bridge")), { code: "ENOENT" });
  });
});

test("workspace_snapshot keeps missing AI context and non-Git roots successful", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
      const parsed = parseSnapshotResult(result);
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.data.ai_context_files, []);
      assert.match(parsed.data.git_status.toLowerCase(), /not a git repository|git unavailable|fatal:/);
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")), { code: "ENOENT" });
    });
  });
});

test("workspace_snapshot returns a redacted WORKSPACE_NOT_FOUND failure", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({
        name: "workspace_snapshot",
        arguments: { workspace_id: "ws_missing_private" }
      });
      assertSnapshotFailure(result, "WORKSPACE_NOT_FOUND", {
        source: "workspace_id",
        workspace_id: "ws_missing_private"
      });
      assert.equal(JSON.stringify(result).includes(root), false);
      assert.equal(JSON.stringify(result).includes("Unknown workspace_id"), false);
    });
  });
});

test("workspace_snapshot returns SNAPSHOT_SUMMARY_FAILED for summary provider exceptions", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async () => {
        throw new Error("private summary diagnostic");
      }
    }, async (client) => {
      const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
      assertSnapshotFailure(result, "SNAPSHOT_SUMMARY_FAILED", {});
      assert.equal(JSON.stringify(result).includes("private summary diagnostic"), false);
    });
  });
});

test("workspace_snapshot returns AI_CONTEXT_FAILED for AI provider exceptions", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async (context) => emptySummary(context),
      workspaceSnapshotAiContextProvider: async () => {
        throw new Error("private AI diagnostic");
      }
    }, async (client) => {
      const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
      assertSnapshotFailure(result, "AI_CONTEXT_FAILED", {});
      assert.equal(JSON.stringify(result).includes("private AI diagnostic"), false);
    });
  });
});

test("workspace_snapshot rejects malformed summary provider results", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      (context) => emptySummary(context, { workspaceId: "ws_other" }),
      (context) => emptySummary(context, { root: path.join(root, "other") }),
      (context) => emptySummary(context, { agentsLoaded: false, agentsPath: "AGENTS.md" }),
      (context) => emptySummary(context, { agentsLoaded: true, agentsPath: undefined }),
      (context) => emptySummary(context, { agentsLoaded: true, agentsPath: "./AGENTS.md" }),
      (context) => emptySummary(context, { skills: ["unexpected"] }),
      (context) => emptySummary(context, { skillCounts: { total: 1, workspace: 0, user: 0, plugin: 0, other: 0 } }),
      (context) => emptySummary(context, { tree: "" }),
      (context) => emptySummary(context, { gitStatus: "" }),
      (context) => ({ ...emptySummary(context), extra: true })
    ];
    for (const provider of cases) {
      await withConfigClient(createTestConfig(root), {
        workspaceSnapshotSummaryProvider: async (context) => provider(context),
        workspaceSnapshotAiContextProvider: async () => emptyAiContext()
      }, async (client) => {
        assertSnapshotFailure(
          await client.callTool({ name: "workspace_snapshot", arguments: {} }),
          "INTERNAL_ERROR",
          {}
        );
      });
    }
  });
});

test("workspace_snapshot rejects global skills when global discovery is disabled", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async (context) => skillSummary(context),
      workspaceSnapshotAiContextProvider: async () => emptyAiContext()
    }, async (client) => {
      assertSnapshotFailure(await client.callTool({
        name: "workspace_snapshot",
        arguments: { include_skills: true, include_global_skills: false }
      }), "INTERNAL_ERROR", {});
    });
  });
});

test("workspace_snapshot rejects malformed, duplicate, outside, and unapproved AI files", async () => {
  await withTempWorkspace(async (root) => {
    const aiCases = [
      { text: "x", files: [".ai-bridge/current-plan.md", "./.ai-bridge/current-plan.md"] },
      { text: "x", files: ["../private.md"] },
      { text: "x", files: [path.join(root, "private.md")] },
      { text: "x", files: [".ai-bridge/unapproved.md"] },
      { text: "x", files: [], extra: true }
    ];
    for (const aiResult of aiCases) {
      await withConfigClient(createTestConfig(root), {
        workspaceSnapshotSummaryProvider: async (context) => emptySummary(context),
        workspaceSnapshotAiContextProvider: async () => aiResult
      }, async (client) => {
        const result = await client.callTool({ name: "workspace_snapshot", arguments: {} });
        assertSnapshotFailure(result, "INTERNAL_ERROR", {});
        assert.equal(JSON.stringify(result).includes("private.md"), false);
        assert.equal(JSON.stringify(result).includes("unapproved.md"), false);
      });
    }
  });
});

test("workspace_snapshot Tool Card consumes nested data and retains flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /workspace_snapshot/);
  assert.match(toolCardWidgetHtml, /data\?\.data/);
  assert.match(toolCardWidgetHtml, /const workspace = workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /workspace\.git_status/);
});

test("workspace_snapshot Tool Card lists AI filenames without file contents", () => {
  assert.match(toolCardWidgetHtml, /workspace\.ai_context_files/);
  assert.match(toolCardWidgetHtml, /AI handoff/);
  assert.match(toolCardWidgetHtml, /No readable AI handoff files/);
});

test("codexgpt workspace_snapshot action and snapshot alias preserve strict envelopes", async () => {
  await withTempWorkspace(async (root) => {
    const dependencies = {
      workspaceSnapshotSummaryProvider: async (context) => emptySummary(context),
      workspaceSnapshotAiContextProvider: async () => emptyAiContext()
    };
    await withConfigClient(createTestConfig(root), dependencies, async (client) => {
      for (const action of ["workspace_snapshot", "snapshot"]) {
        const result = await client.callTool({ name: "codexgpt", arguments: { action, args: {} } });
        const structured = result.structuredContent;
        assert.equal(structured.codexgpt_tool, "workspace_snapshot");
        assert.equal(structured.codexgpt_title, "Workspace Snapshot");
        assert.equal(structured.codexgpt_super_action, action);
        assert.equal(structured.wrapped_tool, "workspace_snapshot");
        assert.equal(structured.ok, true);
        assert.equal(structured.data.root, root);
        assert.equal("root" in structured, false);
        assert.equal("workspace_id" in structured, false);
      }
    });
    await withConfigClient(createTestConfig(root), {
      workspaceSnapshotSummaryProvider: async () => {
        throw new Error("private wrapped diagnostic");
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "codexgpt",
        arguments: { action: "workspace_snapshot", args: {} }
      });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, "SNAPSHOT_SUMMARY_FAILED");
      assert.equal(JSON.stringify(result).includes("private wrapped diagnostic"), false);
    });
  });
});

test("Smoke compatibility migrates the protected snapshot tree consumer in memory", async () => {
  const source = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  assert.match(source, /snapshotAlias\.structuredContent\.data\?\.tree/);
  assert.match(source, /expectedCount/);
  assert.match(source, /previousPathext/);
  assert.match(source, /process\.env\.PATHEXT/);
  assert.match(source, /sourceURL=codexgpt-smoke-compat\.mjs/);
  assert.match(source, /data:text\/javascript;base64/);
});

test("HTTP Smoke compatibility migrates the protected snapshot workspace-id consumer in memory", async () => {
  const source = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  assert.match(source, /snapshot\.structuredContent\.data\?\.workspace_id/);
  assert.match(source, /sourceURL=codexgpt-http-smoke-compat\.mjs/);
  assert.match(source, /data:text\/javascript;base64/);
});

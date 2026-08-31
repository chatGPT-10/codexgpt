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
const schemaModule = await tsImport("../src/tools/schemas/openWorkspace.ts", import.meta.url).catch(() => null);
const {
  OPEN_WORKSPACE_ERROR_MESSAGES,
  createOpenWorkspaceFailure,
  createOpenWorkspaceSuccess,
  openWorkspaceOutputSchema
} = schemaModule ?? {};

function sampleWorkspaceData(overrides = {}) {
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
    bash_mode: "full",
    write_mode: "workspace",
    tool_mode: "standard",
    ...overrides
  };
}

const failureCases = [
  {
    code: "ROOT_ALIAS_CONFLICT",
    details: { fields: ["root", "path"] },
    message: "The root and path arguments identify different workspace roots."
  },
  {
    code: "ROOT_PATH_INVALID",
    details: { source: "root" },
    message: "The requested workspace root is not a valid local workspace path."
  },
  {
    code: "ROOT_NOT_FOUND",
    details: { source: "path" },
    message: "The requested workspace root does not exist."
  },
  {
    code: "ROOT_NOT_DIRECTORY",
    details: { source: "root" },
    message: "The requested workspace root is not a directory."
  },
  {
    code: "ROOT_NOT_ALLOWED",
    details: { source: "configured_default_root" },
    message: "The requested workspace root is outside the allowed roots."
  },
  {
    code: "WORKSPACE_OPEN_FAILED",
    details: { source: "root" },
    message: "The requested workspace could not be opened."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace summary failed because of an internal error."
  }
];

test("open_workspace schema module exists", () => {
  assert.ok(schemaModule, "openWorkspace.ts must exist and be importable");
});

test("open_workspace success constructor produces the strict schema-v1 envelope", () => {
  assert.equal(typeof createOpenWorkspaceSuccess, "function");
  const result = createOpenWorkspaceSuccess(sampleWorkspaceData(), 7);
  const parsed = openWorkspaceOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexgpt_title",
    "codexgpt_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexgpt_tool, "open_workspace");
  assert.equal(parsed.codexgpt_title, "Open Workspace");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleWorkspaceData());
  assert.deepEqual(Object.keys(parsed.data).sort(), [
    "agents_loaded",
    "agents_path",
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
  for (const legacyField of ["workspace_id", "root", "agents_loaded", "tree", "git_status", "tool_mode"]) {
    assert.equal(legacyField in parsed, false);
  }
  assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("open_workspace failure constructor produces every approved strict error", () => {
  assert.equal(typeof createOpenWorkspaceFailure, "function");
  for (const expected of failureCases) {
    const parsed = openWorkspaceOutputSchema.parse(
      createOpenWorkspaceFailure({ code: expected.code, details: expected.details }, 4)
    );
    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(OPEN_WORKSPACE_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, { schemaVersion: 1, durationMs: 4, warnings: [] });
  }
});

test("open_workspace schema rejects malformed, flat, inconsistent, and additional fields", () => {
  const success = createOpenWorkspaceSuccess(sampleWorkspaceData(), 0);
  const failure = createOpenWorkspaceFailure(
    { code: "ROOT_NOT_FOUND", details: { source: "root" } },
    0
  );

  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, workspace_id: "legacy-flat" }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, codexgpt_tool: "open_current_workspace" }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, codexgpt_title: "Open Current Workspace" }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...failure, data: sampleWorkspaceData() }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, extra: true } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, workspace_id: "" } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, root: "" } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, git_status: "" } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, agents_path: undefined } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, tree: undefined } }));
  assert.throws(() => openWorkspaceOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skill_inventory: [{ ...success.data.skill_inventory[0], extra: true }]
    }
  }));
  assert.throws(() => openWorkspaceOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skill_counts: { ...success.data.skill_counts, extra: 1 }
    }
  }));
  assert.throws(() => openWorkspaceOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skill_counts: { ...success.data.skill_counts, total: -1 }
    }
  }));
  assert.throws(() => createOpenWorkspaceFailure({
    code: "ROOT_NOT_FOUND",
    details: { source: "root", root: "C:/private" }
  }));
  assert.throws(() => createOpenWorkspaceFailure({
    code: "ROOT_ALIAS_CONFLICT",
    details: { fields: ["path", "root"] }
  }));
  assert.throws(() => createOpenWorkspaceFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
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
    bashMode: "safe",
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

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexGPTServer(config, dependencies ?? {});
  const client = new Client({ name: "open-workspace-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-workspace-contract-"));
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

function parseWorkspaceResult(result) {
  return openWorkspaceOutputSchema.parse(result.structuredContent);
}

function assertWorkspaceFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseWorkspaceResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: OPEN_WORKSPACE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(OPEN_WORKSPACE_ERROR_MESSAGES[code]));
  return parsed;
}

function emptySummary(context, overrides = {}) {
  return {
    text: "# Workspace\n\n## Git status\n\n## main\n\n## Recent commits\n\nabc123 test commit",
    workspaceId: context.workspace.id,
    root: context.workspace.root,
    agentsLoaded: false,
    agentsPath: undefined,
    skills: [],
    skillInventory: [],
    skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
    tree: context.options.includeTree ? ".\n└── package.json" : undefined,
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

test("open_workspace advertises an exact output schema in every tool mode", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "open_workspace");
        assert.ok(descriptor, `open_workspace must be registered in ${toolMode}`);
        assert.ok(descriptor.outputSchema, "open_workspace must advertise outputSchema");
        assert.equal(descriptor.outputSchema.type, "object");
        assert.deepEqual(
          new Set(descriptor.outputSchema.required),
          new Set(["codexgpt_tool", "codexgpt_title", "ok", "data", "error", "meta"])
        );
      });
    }
  });
});

test("open_workspace returns exact nested data with approved defaults and nullable normalization", async () => {
  await withTempWorkspace(async (root) => {
    let seenOptions;
    await withConfigClient(createTestConfig(root, { bashMode: "full" }), {
      openWorkspaceSummaryProvider: async (context) => {
        seenOptions = context.options;
        return emptySummary(context);
      }
    }, async (client) => {
      const result = await client.callTool({ name: "open_workspace", arguments: {} });
      const parsed = parseWorkspaceResult(result);
      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.agents_path, null);
      assert.equal(parsed.data.tree, null);
      assert.deepEqual(parsed.data.skills, []);
      assert.deepEqual(parsed.data.skill_inventory, []);
      assert.deepEqual(parsed.data.skill_counts, { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 });
      assert.equal(parsed.data.bash_mode, "full");
      assert.equal(parsed.data.write_mode, "workspace");
      assert.equal(parsed.data.tool_mode, "standard");
      assert.deepEqual(seenOptions, {
        includeTree: false,
        maxDepth: 3,
        maxEntries: 500,
        includeSkills: false,
        includeGlobalSkills: false
      });
      assert.equal("root" in parsed, false);
      assert.match(resultText(result), /## Recent commits/);
    });
  });
});

test("open_workspace passes requested tree and skill options and normalizes skill descriptions", async () => {
  await withTempWorkspace(async (root) => {
    let seenOptions;
    await withConfigClient(createTestConfig(root), {
      openWorkspaceSummaryProvider: async (context) => {
        seenOptions = context.options;
        return skillSummary(context);
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "open_workspace",
        arguments: {
          root,
          include_tree: false,
          max_depth: 8,
          max_files: 3000,
          include_skills: true,
          include_global_skills: true
        }
      });
      const parsed = parseWorkspaceResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.tree, null);
      assert.equal(parsed.data.skill_inventory[0].description, null);
      assert.deepEqual(seenOptions, {
        includeTree: false,
        maxDepth: 8,
        maxEntries: 3000,
        includeSkills: true,
        includeGlobalSkills: true
      });
    });
  });
});

test("open_workspace resolves trimmed root/path aliases deterministically", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const dependencies = { openWorkspaceSummaryProvider: async (context) => emptySummary(context) };
    await withConfigClient(config, dependencies, async (client) => {
      const rootOnly = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { root: `  ${root}  `, include_tree: false }
      }));
      const pathOnly = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { path: `  ${root}  `, include_tree: false }
      }));
      const matching = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { root: ` ${root} `, path: root, include_tree: false }
      }));
      const blankRoot = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { root: "   ", path: root, include_tree: false }
      }));
      const bothBlank = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { root: "   ", path: "   ", include_tree: false }
      }));
      const ids = [rootOnly, pathOnly, matching, blankRoot, bothBlank].map((item) => item.data.workspace_id);
      assert.equal(new Set(ids).size, 1);
      for (const item of [rootOnly, pathOnly, matching, blankRoot, bothBlank]) {
        assert.equal(item.ok, true);
        assert.equal(item.data.root, root);
      }
    });
  });
});

test("open_workspace rejects differing effective aliases without leaking either root", async () => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-alias-first-"));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-alias-second-"));
  try {
    const root = await fs.realpath(first);
    const other = await fs.realpath(second);
    await withConfigClient(createTestConfig(root, { allowedRoots: [root, other] }), {}, async (client) => {
      const result = await client.callTool({
        name: "open_workspace",
        arguments: { root, path: other }
      });
      assertWorkspaceFailure(result, "ROOT_ALIAS_CONFLICT", { fields: ["root", "path"] });
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(root), false);
      assert.equal(serialized.includes(other), false);
    });
  } finally {
    await fs.rm(first, { recursive: true, force: true });
    await fs.rm(second, { recursive: true, force: true });
  }
});

test("open_workspace returns stable safe root-stage failures", async () => {
  await withTempWorkspace(async (root) => {
    const missing = path.join(root, "missing-workspace");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({
        name: "open_workspace",
        arguments: { path: missing }
      });
      assertWorkspaceFailure(result, "ROOT_NOT_FOUND", { source: "path" });
      assert.equal(JSON.stringify(result).includes(missing), false);
    });

    const filePath = path.join(root, "workspace.txt");
    await fs.writeFile(filePath, "not a directory", "utf8");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({
        name: "open_workspace",
        arguments: { root: filePath }
      });
      assertWorkspaceFailure(result, "ROOT_NOT_DIRECTORY", { source: "root" });
      assert.equal(JSON.stringify(result).includes(filePath), false);
    });

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({
        name: "open_workspace",
        arguments: { root: "bad\0path" }
      });
      assertWorkspaceFailure(result, "ROOT_PATH_INVALID", { source: "root" });
      assert.equal(JSON.stringify(result).includes("bad\\u0000path"), false);
    });

    const accessError = Object.assign(new Error("private root diagnostic"), { code: "EACCES" });
    await withConfigClient(createTestConfig(root), {
      openWorkspaceProvider: () => {
        throw accessError;
      }
    }, async (client) => {
      const result = await client.callTool({ name: "open_workspace", arguments: { root } });
      assertWorkspaceFailure(result, "WORKSPACE_OPEN_FAILED", { source: "root" });
      assert.equal(JSON.stringify(result).includes("private root diagnostic"), false);
    });
  });

  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-outside-"));
  const allowedDir = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-allowed-"));
  try {
    const outside = await fs.realpath(outsideDir);
    const allowed = await fs.realpath(allowedDir);
    await withConfigClient(createTestConfig(allowed), {}, async (client) => {
      const result = await client.callTool({ name: "open_workspace", arguments: { root: outside } });
      assertWorkspaceFailure(result, "ROOT_NOT_ALLOWED", { source: "root" });
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(outside), false);
      assert.equal(serialized.includes(allowed), false);
    });
  } finally {
    await fs.rm(outsideDir, { recursive: true, force: true });
    await fs.rm(allowedDir, { recursive: true, force: true });
  }
});

test("open_workspace treats provider-time filesystem failures as INTERNAL_ERROR", async () => {
  await withTempWorkspace(async (root) => {
    const providerError = Object.assign(new Error("private provider path"), { code: "ENOENT" });
    await withConfigClient(createTestConfig(root), {
      openWorkspaceSummaryProvider: async () => {
        throw providerError;
      }
    }, async (client) => {
      const result = await client.callTool({ name: "open_workspace", arguments: { root } });
      assertWorkspaceFailure(result, "INTERNAL_ERROR", {});
      assert.equal(JSON.stringify(result).includes("private provider path"), false);
    });
  });
});

test("open_workspace rejects provider identity, AGENTS, skill, count, inclusion, and shape mismatches", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      (context) => emptySummary(context, { workspaceId: "ws_other" }),
      (context) => emptySummary(context, { root: path.join(root, "other") }),
      (context) => emptySummary(context, { agentsLoaded: false, agentsPath: "AGENTS.md" }),
      (context) => emptySummary(context, { agentsLoaded: true, agentsPath: undefined }),
      (context) => skillSummary(context, { agentsPath: "./AGENTS.md" }),
      (context) => skillSummary(context, { agentsPath: "../private/AGENTS.md" }),
      (context) => skillSummary(context, { skills: ["plugin-skill", "workspace-skill"] }),
      (context) => skillSummary(context, {
        skillCounts: { total: 3, workspace: 1, user: 0, plugin: 1, other: 0 }
      }),
      (context) => ({ ...emptySummary(context), extra: true }),
      (context) => emptySummary(context, { gitStatus: "" }),
      (context) => emptySummary(context, { tree: undefined }),
      (context) => emptySummary(context, { skills: ["unexpected"] })
    ];

    for (const provider of cases) {
      await withConfigClient(createTestConfig(root), {
        openWorkspaceSummaryProvider: async (context) => provider(context)
      }, async (client) => {
        assertWorkspaceFailure(await client.callTool({
          name: "open_workspace",
          arguments: { root, include_tree: true, include_skills: false }
        }), "INTERNAL_ERROR", {});
      });
    }

    await withConfigClient(createTestConfig(root), {
      openWorkspaceSummaryProvider: async (context) => emptySummary(context, { tree: "unexpected" })
    }, async (client) => {
      assertWorkspaceFailure(await client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }), "INTERNAL_ERROR", {});
    });
  });
});

test("open_workspace rejects global skills when include_global_skills is false", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      openWorkspaceSummaryProvider: async (context) => skillSummary(context)
    }, async (client) => {
      assertWorkspaceFailure(await client.callTool({
        name: "open_workspace",
        arguments: {
          root,
          include_tree: false,
          include_skills: true,
          include_global_skills: false
        }
      }), "INTERNAL_ERROR", {});
    });
  });
});

test("open_workspace keeps non-Git roots successful, reuses IDs, and ignores bootstrap_context", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const first = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false, bootstrap_context: true }
      }));
      const second = parseWorkspaceResult(await client.callTool({
        name: "open_workspace",
        arguments: { path: root, include_tree: false }
      }));
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.equal(first.data.workspace_id, second.data.workspace_id);
      assert.match(first.data.git_status.toLowerCase(), /not a git repository|git unavailable|fatal:/);
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")), { code: "ENOENT" });
    });
  });
});

test("Smoke compatibility migrates protected direct workspace consumers in memory", async () => {
  const source = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  assert.match(source, /cardOpened\.structuredContent\.data\?\.workspace_id/);
  assert.match(source, /opened\.structuredContent\.data\?\.workspace_id/);
  assert.match(source, /openedByPath\.structuredContent\.data\?\.workspace_id/);
  assert.match(source, /expectedCount/);
  assert.match(source, /sourceURL=codexgpt-smoke-compat\.mjs/);
  assert.match(source, /data:text\/javascript;base64/);
  assert.doesNotMatch(source, /await import\(['"]\.\/smoke\.mjs['"]\)/);
});

test("HTTP Smoke compatibility uses a bounded source label for transformed failures", async () => {
  const source = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  assert.match(source, /sourceURL=codexgpt-http-smoke-compat\.mjs/);
  assert.match(source, /data:text\/javascript;base64/);
});

test("open_workspace Tool Card consumes nested direct-open data and retains flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /open_current_workspace/);
  assert.match(toolCardWidgetHtml, /open_workspace/);
  assert.match(toolCardWidgetHtml, /data\?\.data/);
  assert.match(toolCardWidgetHtml, /const workspace = workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /workspace\.skill_inventory/);
  assert.match(toolCardWidgetHtml, /workspace\.git_status/);
  assert.match(toolCardWidgetHtml, /workspace\.root/);
});

test("codexgpt direct open_workspace action preserves strict success and failure envelopes", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      openWorkspaceSummaryProvider: async (context) => emptySummary(context)
    }, async (client) => {
      const result = await client.callTool({
        name: "codexgpt",
        arguments: { action: "open_workspace", args: { root, include_tree: false } }
      });
      const structured = result.structuredContent;
      assert.equal(structured.codexgpt_tool, "open_workspace");
      assert.equal(structured.codexgpt_title, "Open Workspace");
      assert.equal(structured.codexgpt_super_action, "open_workspace");
      assert.equal(structured.wrapped_tool, "open_workspace");
      assert.equal(structured.ok, true);
      assert.equal(structured.data.root, root);
      assert.equal("root" in structured, false);
      assert.equal("workspace_id" in structured, false);
    });

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await client.callTool({
        name: "codexgpt",
        arguments: { action: "open_workspace", args: { root, path: path.join(root, "other") } }
      });
      const structured = result.structuredContent;
      assert.equal(result.isError, true);
      assert.equal(structured.codexgpt_tool, "open_workspace");
      assert.equal(structured.codexgpt_super_action, "open_workspace");
      assert.equal(structured.wrapped_tool, "open_workspace");
      assert.equal(structured.ok, false);
      assert.equal(structured.data, null);
      assert.equal(structured.error.code, "ROOT_ALIAS_CONFLICT");
    });
  });
});

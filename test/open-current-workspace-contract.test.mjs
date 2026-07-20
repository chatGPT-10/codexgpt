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
const {
  OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES,
  createOpenCurrentWorkspaceFailure,
  createOpenCurrentWorkspaceSuccess,
  openCurrentWorkspaceOutputSchema
} = await tsImport("../src/tools/schemas/openCurrentWorkspace.ts", import.meta.url);

function sampleWorkspaceData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexgpt",
    agents_loaded: true,
    agents_path: "AGENTS.md",
    skills: ["brainstorming", "plugin-skill"],
    skill_inventory: [
      {
        name: "brainstorming",
        description: "Explore requirements before implementation.",
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/brainstorming/SKILL.md"
      },
      {
        name: "plugin-skill",
        description: null,
        source: "plugin",
        path: "~/.codex/plugins/cache/example/plugin-skill/SKILL.md"
      }
    ],
    skill_counts: {
      total: 2,
      workspace: 1,
      user: 0,
      plugin: 1,
      other: 0
    },
    tree: null,
    git_status: "## main...origin/main",
    bash_mode: "full",
    write_mode: "workspace",
    tool_mode: "standard",
    ...overrides
  };
}

const failureCases = [
  {
    code: "DEFAULT_ROOT_NOT_FOUND",
    details: { source: "configured_default_root" },
    message: "The configured default workspace root does not exist."
  },
  {
    code: "DEFAULT_ROOT_NOT_DIRECTORY",
    details: { source: "configured_default_root" },
    message: "The configured default workspace root is not a directory."
  },
  {
    code: "ROOT_NOT_ALLOWED",
    details: { source: "configured_default_root" },
    message: "The configured default workspace root is outside the allowed roots."
  },
  {
    code: "WORKSPACE_OPEN_FAILED",
    details: { source: "configured_default_root" },
    message: "The configured default workspace could not be opened."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The current workspace summary failed because of an internal error."
  }
];

test("open_current_workspace success constructor produces the strict schema-v1 envelope", () => {
  const result = createOpenCurrentWorkspaceSuccess(sampleWorkspaceData(), 9);
  const parsed = openCurrentWorkspaceOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexgpt_title",
    "codexgpt_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexgpt_tool, "open_current_workspace");
  assert.equal(parsed.codexgpt_title, "Open Current Workspace");
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
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 9,
    warnings: []
  });
});

test("open_current_workspace failure constructor produces every approved strict error", () => {
  for (const expected of failureCases) {
    const result = createOpenCurrentWorkspaceFailure(
      { code: expected.code, details: expected.details },
      4
    );
    const parsed = openCurrentWorkspaceOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 4,
      warnings: []
    });
  }
});

test("open_current_workspace schema rejects malformed and additional fields", () => {
  const success = createOpenCurrentWorkspaceSuccess(sampleWorkspaceData(), 0);

  assert.throws(() => openCurrentWorkspaceOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        skill_inventory: [{ ...success.data.skill_inventory[0], extra: true }]
      }
    })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({
      ...success,
      data: { ...success.data, skill_counts: { ...success.data.skill_counts, extra: 0 } }
    })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, workspace_id: "" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, root: "" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, git_status: "" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, agents_path: "" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, tree: "" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, bash_mode: "powershell" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, write_mode: "read" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({ ...success, data: { ...success.data, tool_mode: "extended" } })
  );
  assert.throws(() =>
    openCurrentWorkspaceOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        skill_inventory: [{ ...success.data.skill_inventory[0], description: undefined }]
      }
    })
  );
  assert.doesNotThrow(() =>
    openCurrentWorkspaceOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        agents_loaded: false,
        agents_path: null,
        skills: [],
        skill_inventory: [],
        skill_counts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
        tree: "src/\n└── server.ts"
      }
    })
  );
});

test("open_current_workspace schema enforces envelope consistency and exact error details", () => {
  const success = createOpenCurrentWorkspaceSuccess(sampleWorkspaceData(), 0);
  const failure = createOpenCurrentWorkspaceFailure(
    { code: "DEFAULT_ROOT_NOT_FOUND", details: { source: "configured_default_root" } },
    0
  );

  assert.throws(() => openCurrentWorkspaceOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => openCurrentWorkspaceOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => openCurrentWorkspaceOutputSchema.parse({ ...failure, data: sampleWorkspaceData() }));
  assert.throws(() => openCurrentWorkspaceOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() =>
    createOpenCurrentWorkspaceFailure({
      code: "DEFAULT_ROOT_NOT_FOUND",
      details: { source: "configured_default_root", root: "C:/private" }
    })
  );
  assert.throws(() =>
    createOpenCurrentWorkspaceFailure({
      code: "INTERNAL_ERROR",
      details: { diagnostic: "private" }
    })
  );
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

async function withInMemoryClient(options, callback) {
  const root = options.root ?? process.cwd();
  const server = createCodexGPTServer(
    createTestConfig(root, options.configOverrides ?? {}),
    options.dependencies ?? {}
  );
  const client = new Client({ name: "open-current-workspace-contract-test", version: "0.0.0" });
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

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexGPTServer(config, dependencies ?? {});
  const client = new Client({ name: "open-current-workspace-config-test", version: "0.0.0" });
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

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-open-current-contract-"));
  const root = await fs.realpath(created);
  try {
    await fs.writeFile(path.join(root, "AGENTS.md"), "# Test instructions\n", "utf8");
    return await callback(root);
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
  return openCurrentWorkspaceOutputSchema.parse(result.structuredContent);
}

function assertWorkspaceFailure(result, code, details) {
  assert.equal(result.isError, true);
  const parsed = parseWorkspaceResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES[code]));
  return parsed;
}

function summaryFromContext(context, overrides = {}) {
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
  return {
    text: "# Workspace\n\n## Git status\n\n## main\n\n## Recent commits\n\nabc123 test commit",
    workspaceId: context.workspace.id,
    root: context.workspace.root,
    agentsLoaded: true,
    agentsPath: "AGENTS.md",
    skills: inventory.map((item) => item.name),
    skillInventory: inventory,
    skillCounts: { total: 2, workspace: 1, user: 0, plugin: 1, other: 0 },
    tree: context.options.includeTree ? "src/\n└── server.ts" : undefined,
    gitStatus: "## main",
    ...overrides
  };
}

test("open_current_workspace advertises an exact output schema in every tool mode", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard", "full"]) {
      await withInMemoryClient({ root, configOverrides: { toolMode } }, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "open_current_workspace");
        assert.ok(descriptor, `open_current_workspace must be registered in ${toolMode}`);
        assert.ok(descriptor.outputSchema, "open_current_workspace must advertise outputSchema");
        assert.equal(descriptor.outputSchema.type, "object");
        assert.deepEqual(
          new Set(descriptor.outputSchema.required),
          new Set(["codexgpt_tool", "codexgpt_title", "ok", "data", "error", "meta"])
        );
      });
    }
  });
});

test("open_current_workspace returns exact nested data and normalized nullable descriptions", async () => {
  await withTempWorkspace(async (root) => {
    let seenOptions;
    await withInMemoryClient({
      root,
      configOverrides: { toolMode: "standard", bashMode: "full" },
      dependencies: {
        openCurrentWorkspaceSummaryProvider: async (context) => {
          seenOptions = context.options;
          return summaryFromContext(context);
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "open_current_workspace",
        arguments: { include_tree: false, include_skills: true, include_global_skills: true }
      });
      const parsed = parseWorkspaceResult(result);

      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.agents_path, "AGENTS.md");
      assert.equal(parsed.data.tree, null);
      assert.equal(parsed.data.skill_inventory[0].description, null);
      assert.equal(parsed.data.bash_mode, "full");
      assert.equal(parsed.data.write_mode, "workspace");
      assert.equal(parsed.data.tool_mode, "standard");
      assert.deepEqual(seenOptions, {
        includeTree: false,
        maxDepth: 2,
        includeSkills: true,
        includeGlobalSkills: true
      });
      assert.equal("root" in parsed, false);
      assert.equal("skill_inventory" in parsed, false);
      assert.match(resultText(result), /## Recent commits/);
    });
  });
});

test("open_current_workspace enforces requested tree and skill inclusion", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      {
        arguments: { include_tree: false, include_skills: true },
        mutate: (summary) => ({ ...summary, tree: "unexpected tree" })
      },
      {
        arguments: { include_tree: true, include_skills: true },
        mutate: (summary) => ({ ...summary, tree: undefined })
      },
      {
        arguments: { include_tree: false, include_skills: false },
        mutate: (summary) => summary
      }
    ];

    for (const item of cases) {
      await withInMemoryClient({
        root,
        dependencies: {
          openCurrentWorkspaceSummaryProvider: async (context) => item.mutate(summaryFromContext(context))
        }
      }, async (client) => {
        assertWorkspaceFailure(await client.callTool({
          name: "open_current_workspace",
          arguments: item.arguments
        }), "INTERNAL_ERROR", {});
      });
    }

    await withInMemoryClient({
      root,
      dependencies: {
        openCurrentWorkspaceSummaryProvider: async (context) => summaryFromContext(context, {
          agentsLoaded: false,
          agentsPath: undefined,
          skills: [],
          skillInventory: [],
          skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 }
        })
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "open_current_workspace",
        arguments: { include_tree: false, include_skills: false }
      });
      const parsed = parseWorkspaceResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.agents_path, null);
      assert.deepEqual(parsed.data.skills, []);
      assert.deepEqual(parsed.data.skill_inventory, []);
      assert.deepEqual(parsed.data.skill_counts, {
        total: 0,
        workspace: 0,
        user: 0,
        plugin: 0,
        other: 0
      });
    });
  });
});

test("open_current_workspace rejects provider identity, AGENTS, skill, count and shape mismatches", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      (context) => summaryFromContext(context, { workspaceId: "ws_other" }),
      (context) => summaryFromContext(context, { root: path.join(root, "other") }),
      (context) => summaryFromContext(context, { agentsLoaded: false, agentsPath: "AGENTS.md" }),
      (context) => summaryFromContext(context, { agentsLoaded: true, agentsPath: undefined }),
      (context) => summaryFromContext(context, { agentsPath: "./AGENTS.md" }),
      (context) => summaryFromContext(context, { agentsPath: "../private/AGENTS.md" }),
      (context) => summaryFromContext(context, { skills: ["plugin-skill", "workspace-skill"] }),
      (context) => summaryFromContext(context, {
        skillCounts: { total: 3, workspace: 1, user: 0, plugin: 1, other: 0 }
      }),
      (context) => ({ ...summaryFromContext(context), extra: true }),
      (context) => summaryFromContext(context, { gitStatus: "" })
    ];

    for (const provider of cases) {
      await withInMemoryClient({
        root,
        dependencies: { openCurrentWorkspaceSummaryProvider: async (context) => provider(context) }
      }, async (client) => {
        assertWorkspaceFailure(await client.callTool({
          name: "open_current_workspace",
          arguments: { include_tree: false, include_skills: true }
        }), "INTERNAL_ERROR", {});
      });
    }
  });
});

test("open_current_workspace returns stable safe default-root failures", async () => {
  const missing = path.join(os.tmpdir(), `codexgpt-missing-${Date.now()}-${Math.random()}`);
  await withConfigClient(createTestConfig(missing, { allowedRoots: [os.tmpdir()] }), {}, async (client) => {
    const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
    assertWorkspaceFailure(result, "DEFAULT_ROOT_NOT_FOUND", { source: "configured_default_root" });
    assert.equal(resultText(result).includes(missing), false);
  });

  const fileDir = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-root-file-"));
  const filePath = path.join(fileDir, "workspace.txt");
  await fs.writeFile(filePath, "not a directory", "utf8");
  try {
    await withConfigClient(createTestConfig(filePath, { allowedRoots: [fileDir] }), {}, async (client) => {
      const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
      assertWorkspaceFailure(result, "DEFAULT_ROOT_NOT_DIRECTORY", { source: "configured_default_root" });
      assert.equal(resultText(result).includes(filePath), false);
    });
  } finally {
    await fs.rm(fileDir, { recursive: true, force: true });
  }

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-outside-root-"));
  const allowed = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-allowed-root-"));
  try {
    const realOutside = await fs.realpath(outside);
    const realAllowed = await fs.realpath(allowed);
    await withConfigClient(createTestConfig(realOutside, { allowedRoots: [realAllowed] }), {}, async (client) => {
      const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
      assertWorkspaceFailure(result, "ROOT_NOT_ALLOWED", { source: "configured_default_root" });
      assert.equal(resultText(result).includes(realOutside), false);
      assert.equal(resultText(result).includes(realAllowed), false);
    });
  } finally {
    await fs.rm(outside, { recursive: true, force: true });
    await fs.rm(allowed, { recursive: true, force: true });
  }

  await withTempWorkspace(async (root) => {
    const accessError = Object.assign(new Error("private filesystem path"), { code: "EACCES" });
    await withInMemoryClient({
      root,
      dependencies: {
        openCurrentWorkspaceSummaryProvider: async () => {
          throw accessError;
        }
      }
    }, async (client) => {
      const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
      assertWorkspaceFailure(result, "WORKSPACE_OPEN_FAILED", { source: "configured_default_root" });
      assert.equal(resultText(result).includes("private filesystem path"), false);
    });
  });
});

test("open_current_workspace keeps a non-Git directory as a successful workspace", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      const result = await client.callTool({
        name: "open_current_workspace",
        arguments: { include_tree: false, include_skills: false }
      });
      const parsed = parseWorkspaceResult(result);
      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.root, root);
      assert.match(parsed.data.git_status.toLowerCase(), /not a git repository|git unavailable|fatal:/);
    });
  });
});

test("open_current_workspace Tool Card consumes nested data and keeps flat workspace compatibility", () => {
  assert.match(toolCardWidgetHtml, /function workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexgpt_tool === "open_current_workspace"/);
  assert.match(toolCardWidgetHtml, /data\?\.data \?\? \{\}/);
  assert.match(toolCardWidgetHtml, /function renderWorkspace\(data\)/);
  assert.match(toolCardWidgetHtml, /const workspace = workspaceResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.ok === false/);
  assert.match(toolCardWidgetHtml, /data\?\.error/);
  assert.match(toolCardWidgetHtml, /workspace\.skill_inventory/);
  assert.match(toolCardWidgetHtml, /workspace\.git_status/);
  assert.match(toolCardWidgetHtml, /workspace\.root/);
});

test("Smoke lowercase AGENTS compatibility reads the migrated nested workspace contract", async () => {
  const smokeSource = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  assert.match(smokeSource, /lowerOpened\.structuredContent\.data\?\.agents_path/);
  assert.doesNotMatch(smokeSource, /lowerOpened\.structuredContent\.agents_path/);
});

test("codexgpt open alias preserves strict success and failure envelopes", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({
      root,
      dependencies: {
        openCurrentWorkspaceSummaryProvider: async (context) => summaryFromContext(context, {
          agentsLoaded: false,
          agentsPath: undefined,
          skills: [],
          skillInventory: [],
          skillCounts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 }
        })
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "codexgpt",
        arguments: {
          action: "open",
          args: { include_tree: false, include_skills: false }
        }
      });
      const structured = result.structuredContent;

      assert.equal(structured.codexgpt_tool, "open_current_workspace");
      assert.equal(structured.codexgpt_title, "Open Current Workspace");
      assert.equal(structured.codexgpt_super_action, "open");
      assert.equal(structured.wrapped_tool, "open_current_workspace");
      assert.equal(structured.ok, true);
      assert.equal(structured.error, null);
      assert.equal(structured.data.root, root);
      assert.equal("root" in structured, false);
      assert.equal("skill_inventory" in structured, false);
    });

    await withInMemoryClient({
      root,
      dependencies: {
        openCurrentWorkspaceSummaryProvider: async () => {
          throw new Error("private provider diagnostic");
        }
      }
    }, async (client) => {
      const result = await client.callTool({
        name: "codexgpt",
        arguments: { action: "open", args: {} }
      });
      const structured = result.structuredContent;

      assert.equal(result.isError, true);
      assert.equal(structured.codexgpt_tool, "open_current_workspace");
      assert.equal(structured.codexgpt_super_action, "open");
      assert.equal(structured.wrapped_tool, "open_current_workspace");
      assert.equal(structured.ok, false);
      assert.equal(structured.data, null);
      assert.equal(structured.error.code, "INTERNAL_ERROR");
      assert.equal(resultText(result).includes("private provider diagnostic"), false);
    });
  });
});

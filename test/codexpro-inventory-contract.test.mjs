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
const schemaModule = await tsImport(
  "../src/tools/schemas/codexproInventory.ts",
  import.meta.url
).catch(() => null);

const {
  CODEXPRO_INVENTORY_ERROR_MESSAGES,
  CODEXPRO_INVENTORY_MCP_SERVER_LIMIT,
  CODEXPRO_INVENTORY_MCP_SERVERS_TRUNCATED_WARNING,
  CODEXPRO_INVENTORY_SKILLS_TRUNCATED_WARNING,
  codexproInventoryOutputSchema,
  createCodexProInventoryFailure,
  createCodexProInventorySuccess
} = schemaModule ?? {};

function createTestConfig(root, overrides = {}) {
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
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "codexpro-inventory-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-inventory-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root, created);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function sampleSkills() {
  return [
    {
      name: "workspace-skill",
      description: "Workspace instructions.",
      source: "workspace",
      path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
    },
    {
      name: "user-skill",
      description: null,
      source: "user",
      path: "~/.codex/skills/user-skill/SKILL.md"
    }
  ];
}

function sampleMcpServers() {
  return [
    { name: "alpha", source: "user codex config" },
    { name: "local-tools", source: "workspace config" }
  ];
}

function skillCounts(skills) {
  const counts = { total: skills.length, workspace: 0, user: 0, plugin: 0, other: 0 };
  for (const skill of skills) counts[skill.source] += 1;
  return counts;
}

function sampleInventoryData(overrides = {}) {
  const skills = overrides.skills ?? sampleSkills();
  const mcpServers = overrides.mcp_servers ?? sampleMcpServers();
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    bash_mode: "off",
    write_mode: "workspace",
    tool_mode: "full",
    include_global_skills: true,
    include_mcp_servers: true,
    max_skills: 120,
    mcp_server_limit: 120,
    skills,
    skill_count: skills.length,
    skill_counts: skillCounts(skills),
    skills_truncated: false,
    mcp_servers: mcpServers,
    mcp_server_count: mcpServers.length,
    mcp_servers_truncated: false,
    ...overrides
  };
}

function parseInventoryResult(result) {
  assert.equal(typeof codexproInventoryOutputSchema?.parse, "function");
  return codexproInventoryOutputSchema.parse(result.structuredContent);
}

function assertInventoryFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseInventoryResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: CODEXPRO_INVENTORY_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(CODEXPRO_INVENTORY_ERROR_MESSAGES[code]));
  return parsed;
}

test("codexpro_inventory schema exports exact constructors and creates empty and populated success", () => {
  assert.equal(CODEXPRO_INVENTORY_MCP_SERVER_LIMIT, 120);
  assert.equal(typeof createCodexProInventorySuccess, "function");
  assert.equal(typeof createCodexProInventoryFailure, "function");
  assert.equal(typeof codexproInventoryOutputSchema?.parse, "function");
  assert.equal(typeof CODEXPRO_INVENTORY_ERROR_MESSAGES, "object");

  const populated = createCodexProInventorySuccess(sampleInventoryData(), 7);
  assert.deepEqual(Object.keys(populated).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(populated.codexpro_tool, "codexpro_inventory");
  assert.equal(populated.codexpro_title, "CodexPro Inventory");
  assert.equal(populated.ok, true);
  assert.equal(populated.error, null);
  assert.deepEqual(Object.keys(populated.data).sort(), [
    "bash_mode",
    "include_global_skills",
    "include_mcp_servers",
    "max_skills",
    "mcp_server_count",
    "mcp_server_limit",
    "mcp_servers",
    "mcp_servers_truncated",
    "root",
    "skill_count",
    "skill_counts",
    "skills",
    "skills_truncated",
    "tool_mode",
    "workspace_id",
    "write_mode"
  ]);
  assert.deepEqual(Object.keys(populated.data.skills[0]).sort(), ["description", "name", "path", "source"]);
  assert.deepEqual(Object.keys(populated.data.mcp_servers[0]).sort(), ["name", "source"]);
  assert.deepEqual(populated.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });

  const empty = createCodexProInventorySuccess(sampleInventoryData({
    include_global_skills: false,
    include_mcp_servers: false,
    skills: [],
    skill_count: 0,
    skill_counts: { total: 0, workspace: 0, user: 0, plugin: 0, other: 0 },
    mcp_servers: [],
    mcp_server_count: 0
  }));
  assert.deepEqual(empty.data.skills, []);
  assert.deepEqual(empty.data.mcp_servers, []);
  assert.equal(empty.data.skill_count, 0);
  assert.equal(empty.data.mcp_server_count, 0);
});

test("codexpro_inventory schema derives exact bounded warnings", () => {
  const twoSkills = sampleSkills();
  const skillsTruncated = createCodexProInventorySuccess(sampleInventoryData({
    max_skills: 2,
    skills: twoSkills,
    skill_count: 2,
    skill_counts: skillCounts(twoSkills),
    skills_truncated: true
  }));
  assert.deepEqual(skillsTruncated.meta.warnings, [CODEXPRO_INVENTORY_SKILLS_TRUNCATED_WARNING]);

  const mcpServers = Array.from({ length: 120 }, (_, index) => ({
    name: `server-${String(index).padStart(3, "0")}`,
    source: "workspace config"
  }));
  const both = createCodexProInventorySuccess(sampleInventoryData({
    max_skills: 2,
    skills: twoSkills,
    skill_count: 2,
    skill_counts: skillCounts(twoSkills),
    skills_truncated: true,
    mcp_servers: mcpServers,
    mcp_server_count: 120,
    mcp_servers_truncated: true
  }));
  assert.deepEqual(both.meta.warnings, [
    CODEXPRO_INVENTORY_SKILLS_TRUNCATED_WARNING,
    CODEXPRO_INVENTORY_MCP_SERVERS_TRUNCATED_WARNING
  ]);
});

test("codexpro_inventory schema creates all exact stable failures", () => {
  const cases = [
    {
      code: "WORKSPACE_NOT_FOUND",
      details: { source: "workspace_id", workspace_id: "missing-workspace" },
      message: "The requested workspace is not open."
    },
    {
      code: "WORKSPACE_NOT_FOUND",
      details: { source: "default_workspace", workspace_id: null },
      message: "The requested workspace is not open."
    },
    {
      code: "INVENTORY_DISCOVERY_FAILED",
      details: {},
      message: "The CodexPro capability inventory could not be collected."
    },
    {
      code: "INTERNAL_ERROR",
      details: {},
      message: "The CodexPro capability inventory failed because of an internal error."
    }
  ];

  for (const failureCase of cases) {
    const failure = createCodexProInventoryFailure({
      code: failureCase.code,
      details: failureCase.details
    }, 9);
    assert.deepEqual(failure, {
      codexpro_tool: "codexpro_inventory",
      codexpro_title: "CodexPro Inventory",
      ok: false,
      data: null,
      error: {
        code: failureCase.code,
        message: failureCase.message,
        retryable: false,
        details: failureCase.details
      },
      meta: { schemaVersion: 1, durationMs: 9, warnings: [] }
    });
  }
});

test("codexpro_inventory schema rejects flat malformed inconsistent duplicate unsafe and additional fields", () => {
  const success = createCodexProInventorySuccess(sampleInventoryData());
  const failure = createCodexProInventoryFailure({ code: "INTERNAL_ERROR", details: {} });

  assert.throws(() => codexproInventoryOutputSchema.parse({ ...success, skills: [] }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...success, widget_uri: "ui://tool-card" }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...failure, data: success.data }));
  assert.throws(() => codexproInventoryOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: { ...success.data, extra: true }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skills: [{ ...success.data.skills[0], path: "D:\\private\\SKILL.md" }]
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skills: [
        { ...success.data.skills[0], name: " workspace-skill" },
        success.data.skills[1]
      ]
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      mcp_servers: [
        { ...success.data.mcp_servers[0], name: "   " },
        success.data.mcp_servers[1]
      ]
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skills: [{ ...success.data.skills[0], description: undefined }]
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: { ...success.data, skill_count: 99 }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skill_counts: { ...success.data.skill_counts, user: 0 }
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skills: [...success.data.skills].reverse()
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      skills: [success.data.skills[0], success.data.skills[0]],
      skill_count: 2,
      skill_counts: { total: 2, workspace: 2, user: 0, plugin: 0, other: 0 }
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: { ...success.data, include_global_skills: false }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: { ...success.data, max_skills: 3, skills_truncated: true }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: { ...success.data, include_mcp_servers: false }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      mcp_servers: [{ name: "private", source: "D:\\private\\mcp.json" }]
    }
  }));
  assert.throws(() => codexproInventoryOutputSchema.parse({
    ...success,
    meta: { ...success.meta, warnings: ["private diagnostic"] }
  }));
  assert.throws(() => createCodexProInventoryFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
  }));
});

test("codexpro_inventory is full-mode only and advertises its exact output schema", async () => {
  await withTempWorkspace(async (root) => {
    for (const toolMode of ["minimal", "standard"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        assert.equal(listed.tools.some((tool) => tool.name === "codexpro_inventory"), false);
      });
    }

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "codexpro_inventory");
      assert.ok(descriptor);
      assert.ok(descriptor.outputSchema);
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );
    });
  });
});

test("codexpro_inventory real bounded workspace discovery returns deterministic nested data and truncation", async () => {
  await withTempWorkspace(async (root) => {
    for (const name of ["alpha", "beta", "gamma"]) {
      const skillDir = path.join(root, ".codex", "skills", name);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} instructions\n---\n\n# PRIVATE BODY ${name}\n`,
        "utf8"
      );
    }

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "codexpro_inventory", {
        include_global_skills: false,
        include_mcp_servers: false,
        max_skills: 2
      });
      const parsed = parseInventoryResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.workspace_id.length > 0, true);
      assert.equal(parsed.data.root, root);
      assert.equal(parsed.data.include_global_skills, false);
      assert.equal(parsed.data.include_mcp_servers, false);
      assert.equal(parsed.data.max_skills, 2);
      assert.equal(parsed.data.skill_count, 2);
      assert.deepEqual(parsed.data.skills.map((skill) => skill.name), ["alpha", "beta"]);
      assert.ok(parsed.data.skills.every((skill) => skill.source === "workspace"));
      assert.ok(parsed.data.skills.every((skill) => skill.path.startsWith("$WORKSPACE/")));
      assert.equal(JSON.stringify(parsed.data).includes("PRIVATE BODY"), false);
      assert.deepEqual(parsed.data.skill_counts, { total: 2, workspace: 2, user: 0, plugin: 0, other: 0 });
      assert.equal(parsed.data.skills_truncated, true);
      assert.deepEqual(parsed.data.mcp_servers, []);
      assert.equal(parsed.data.mcp_server_count, 0);
      assert.equal(parsed.data.mcp_servers_truncated, false);
      assert.deepEqual(parsed.meta.warnings, [CODEXPRO_INVENTORY_SKILLS_TRUNCATED_WARNING]);
      assert.equal("skills" in result.structuredContent, false);
      assert.equal("widget_uri" in result.structuredContent, false);
    });
  });
});

test("codexpro_inventory effective include flags and limits are echoed and enforced against provider output", async () => {
  await withTempWorkspace(async (root) => {
    let observed;
    await withConfigClient(createTestConfig(root), {
      codexproInventoryProvider: async (context) => {
        observed = context;
        return {
          skills: [{
            name: "workspace-only",
            description: undefined,
            source: "workspace",
            path: "$WORKSPACE/.codex/skills/workspace-only/SKILL.md"
          }],
          skillsTruncated: false,
          mcpServers: [],
          mcpServersTruncated: false
        };
      }
    }, async (client) => {
      const result = await callTool(client, "codexpro_inventory", {
        include_global_skills: false,
        include_mcp_servers: false,
        max_skills: 7
      });
      const parsed = parseInventoryResult(result);
      assert.equal(observed.workspace.root, root);
      assert.deepEqual(observed.options, {
        includeGlobalSkills: false,
        includeMcpServers: false,
        maxSkills: 7
      });
      assert.equal(parsed.data.include_global_skills, false);
      assert.equal(parsed.data.include_mcp_servers, false);
      assert.equal(parsed.data.max_skills, 7);
      assert.equal(parsed.data.skills[0].description, null);
      assert.deepEqual(parsed.data.mcp_servers, []);
    });
  });
});

test("codexpro_inventory unknown workspace returns WORKSPACE_NOT_FOUND without a root leak", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "codexpro_inventory", {
        workspace_id: "missing-workspace",
        include_global_skills: false,
        include_mcp_servers: false
      });
      assertInventoryFailure(result, "WORKSPACE_NOT_FOUND", {
        source: "workspace_id",
        workspace_id: "missing-workspace"
      });
      assert.equal(resultText(result).includes(root), false);
      assert.equal(JSON.stringify(result.structuredContent).includes(root), false);
    });
  });
});

test("codexpro_inventory provider throw and rejection return INVENTORY_DISCOVERY_FAILED", async () => {
  await withTempWorkspace(async (root) => {
    for (const codexproInventoryProvider of [
      () => { throw new Error(`private provider failure ${root}`); },
      async () => Promise.reject(new Error(`private async failure ${root}`))
    ]) {
      await withConfigClient(createTestConfig(root), { codexproInventoryProvider }, async (client) => {
        const result = await callTool(client, "codexpro_inventory", {
          include_global_skills: false,
          include_mcp_servers: false
        });
        assertInventoryFailure(result, "INVENTORY_DISCOVERY_FAILED", {});
        assert.equal(resultText(result).includes(root), false);
        assert.equal(JSON.stringify(result.structuredContent).includes("private"), false);
      });
    }
  });
});

test("codexpro_inventory malformed provider output returns INTERNAL_ERROR without diagnostics", async () => {
  await withTempWorkspace(async (root) => {
    const malformedCases = [
      "not-an-object",
      { skills: [], skillsTruncated: false, mcpServers: [] },
      {
        skills: [{
          name: "outside",
          description: "private-diagnostic",
          source: "workspace",
          path: `${root}/private/SKILL.md`
        }],
        skillsTruncated: false,
        mcpServers: [],
        mcpServersTruncated: false
      },
      {
        skills: [],
        skillsTruncated: false,
        mcpServers: [{ name: "server", source: "private source", diagnostic: root }],
        mcpServersTruncated: false
      },
      {
        skills: [],
        skillsTruncated: false,
        mcpServers: [],
        mcpServersTruncated: false,
        diagnostic: `private-diagnostic ${root}`
      }
    ];

    for (const malformed of malformedCases) {
      await withConfigClient(createTestConfig(root), {
        codexproInventoryProvider: async () => malformed
      }, async (client) => {
        const result = await callTool(client, "codexpro_inventory", {
          include_global_skills: false,
          include_mcp_servers: false
        });
        assertInventoryFailure(result, "INTERNAL_ERROR", {});
        assert.equal(resultText(result).includes(root), false);
        assert.equal(JSON.stringify(result.structuredContent).includes("private-diagnostic"), false);
      });
    }
  });
});

test("codexpro_inventory Tool Card is nested-first handles failures and retains flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function inventoryResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "codexpro_inventory"/);
  assert.match(toolCardWidgetHtml, /return nested \? data\.data : \(data \?\? \{\}\)/);
  assert.match(toolCardWidgetHtml, /if \(data\?\.ok === false\)/);
  assert.match(toolCardWidgetHtml, /const inventory = inventoryResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /inventory\.skills_truncated/);
  assert.match(toolCardWidgetHtml, /inventory\.mcp_servers_truncated/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Inventory unavailable\."/);
});

test("codexpro_inventory supertool preserves the nested inventory envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      codexproInventoryProvider: async () => ({
        skills: [],
        skillsTruncated: false,
        mcpServers: [],
        mcpServersTruncated: false
      })
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "inventory",
        args: { include_global_skills: false, include_mcp_servers: false }
      });
      assert.equal(result.structuredContent.codexpro_tool, "codexpro_inventory");
      assert.equal(result.structuredContent.codexpro_title, "CodexPro Inventory");
      assert.equal(result.structuredContent.codexpro_super_action, "inventory");
      assert.equal(result.structuredContent.wrapped_tool, "codexpro_inventory");
      assert.equal(result.structuredContent.ok, true);
      assert.deepEqual(result.structuredContent.data.skills, []);
      assert.deepEqual(result.structuredContent.data.mcp_servers, []);
      assert.equal("skills" in result.structuredContent, false);
      assert.equal("widget_uri" in result.structuredContent, false);
    });
  });
});

test("codexpro_inventory Stress consumers read nested data and protected Smoke sources remain unchanged", async () => {
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");

  for (const oldRead of [
    "inventory.structuredContent.skill_count",
    "inventory.structuredContent.skills",
    "inventory.structuredContent.mcp_server_count",
    "superInventory.structuredContent.mcp_server_count"
  ]) {
    assert.equal(stress.includes(oldRead), false, oldRead);
  }
  for (const newRead of [
    "inventory.structuredContent.data?.skill_count",
    "inventory.structuredContent.data?.skills",
    "inventory.structuredContent.data?.mcp_server_count",
    "superInventory.structuredContent.data?.mcp_server_count"
  ]) {
    assert.equal(stress.includes(newRead), true, newRead);
  }
  assert.match(stress, /skills_truncated/);
  assert.match(stress, /mcp_servers_truncated/);
  assert.equal(countOccurrences(protectedMain, "inventory.structuredContent.codexpro_tool"), 1);
  assert.equal(countOccurrences(protectedHttp, "inventory.structuredContent.codexpro_tool"), 1);
  assert.equal(protectedMain.includes("inventory.structuredContent.skill_count"), false);
  assert.equal(protectedHttp.includes("inventory.structuredContent.skill_count"), false);
});

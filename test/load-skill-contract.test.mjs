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
const { LoadSkillError } = await tsImport("../src/capabilitiesOps.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/loadSkill.ts", import.meta.url).catch(() => null);

const {
  LOAD_SKILL_ERROR_MESSAGES,
  LOAD_SKILL_REDACTED_WARNING,
  LOAD_SKILL_TRUNCATED_WARNING,
  createLoadSkillFailure,
  createLoadSkillSuccess,
  loadSkillOutputSchema
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
  const client = new Client({ name: "load-skill-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "load-skill-contract-"));
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

function sampleSkill(overrides = {}) {
  return {
    name: "workspace-skill",
    description: "Workspace instructions.",
    source: "workspace",
    path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md",
    ...overrides
  };
}

function sampleSelector(overrides = {}) {
  return {
    name: "workspace-skill",
    source: "workspace",
    path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md",
    ...overrides
  };
}

function sampleLoadData(overrides = {}) {
  const text = overrides.text ?? "# Workspace Skill\n";
  const sourceBytes = overrides.bytes ?? Buffer.byteLength(text, "utf8");
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    selector: sampleSelector(),
    skill: sampleSkill(),
    include_global_skills: false,
    max_skills: 500,
    max_bytes: 40_000,
    bytes: sourceBytes,
    returned_bytes: Buffer.byteLength(text, "utf8"),
    total_bytes: sourceBytes,
    truncated: false,
    resolution_truncated: false,
    redacted: false,
    text,
    ...overrides
  };
}

function parseLoadSkillResult(result) {
  assert.equal(typeof loadSkillOutputSchema?.parse, "function");
  return loadSkillOutputSchema.parse(result.structuredContent);
}

function assertLoadSkillFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseLoadSkillResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: LOAD_SKILL_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(LOAD_SKILL_ERROR_MESSAGES[code]));
  return parsed;
}

async function writeSkill(root, relativeDir, name, body, description = `${name} instructions`) {
  const dir = path.join(root, relativeDir);
  await fs.mkdir(dir, { recursive: true });
  const content = body === null
    ? ""
    : `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
  await fs.writeFile(path.join(dir, "SKILL.md"), content, "utf8");
  return path.join(dir, "SKILL.md");
}

test("load_skill schema exports exact constructors and fourteen-field success", () => {
  assert.equal(typeof createLoadSkillSuccess, "function");
  assert.equal(typeof createLoadSkillFailure, "function");
  assert.equal(typeof loadSkillOutputSchema?.parse, "function");
  assert.equal(typeof LOAD_SKILL_ERROR_MESSAGES, "object");

  const success = createLoadSkillSuccess(sampleLoadData(), 7);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(success.codexpro_tool, "load_skill");
  assert.equal(success.codexpro_title, "Load Skill");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), [
    "bytes",
    "include_global_skills",
    "max_bytes",
    "max_skills",
    "redacted",
    "resolution_truncated",
    "returned_bytes",
    "root",
    "selector",
    "skill",
    "text",
    "total_bytes",
    "truncated",
    "workspace_id"
  ]);
  assert.deepEqual(Object.keys(success.data.selector).sort(), ["name", "path", "source"]);
  assert.deepEqual(Object.keys(success.data.skill).sort(), ["description", "name", "path", "source"]);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("load_skill schema derives exact truncation and redaction warnings", () => {
  const truncatedText = "x".repeat(1000);
  const truncated = createLoadSkillSuccess(sampleLoadData({
    max_bytes: 1000,
    bytes: 1000,
    returned_bytes: 1000,
    total_bytes: 1500,
    truncated: true,
    text: truncatedText
  }));
  assert.deepEqual(truncated.meta.warnings, [LOAD_SKILL_TRUNCATED_WARNING]);

  const redactedText = "OPENAI_API_KEY= [REDACTED_SECRET]\n";
  const both = createLoadSkillSuccess(sampleLoadData({
    max_bytes: 1000,
    bytes: 1000,
    returned_bytes: Buffer.byteLength(redactedText),
    total_bytes: 1500,
    truncated: true,
    redacted: true,
    text: redactedText
  }));
  assert.deepEqual(both.meta.warnings, [
    LOAD_SKILL_TRUNCATED_WARNING,
    LOAD_SKILL_REDACTED_WARNING
  ]);
});

test("load_skill schema creates every exact stable failure", () => {
  const selector = sampleSelector({ source: null, path: null });
  const skill = sampleSkill();
  const candidates = [
    skill,
    sampleSkill({ path: "$WORKSPACE/.agents/skills/workspace-skill/SKILL.md" })
  ];
  const cases = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing-workspace" }],
    ["WORKSPACE_NOT_FOUND", { source: "default_workspace", workspace_id: null }],
    ["INVALID_SKILL_SELECTOR", { field: "path", reason: "source_path_mismatch" }],
    ["SKILL_NOT_FOUND", { selector, include_global_skills: true, max_skills: 500 }],
    ["SKILL_AMBIGUOUS", {
      selector,
      candidates,
      candidates_truncated: false,
      resolution_truncated: false
    }],
    ["SKILL_RESOLUTION_LIMIT_REACHED", {
      selector,
      include_global_skills: true,
      max_skills: 1
    }],
    ["SKILL_BOUNDARY_VIOLATION", { skill }],
    ["SKILL_READ_FAILED", { skill }],
    ["INTERNAL_ERROR", {}]
  ];

  for (const [code, details] of cases) {
    const failure = createLoadSkillFailure({ code, details }, 9);
    assert.deepEqual(failure, {
      codexpro_tool: "load_skill",
      codexpro_title: "Load Skill",
      ok: false,
      data: null,
      error: {
        code,
        message: LOAD_SKILL_ERROR_MESSAGES[code],
        retryable: false,
        details
      },
      meta: { schemaVersion: 1, durationMs: 9, warnings: [] }
    });
  }
});

test("load_skill schema rejects flat unsafe inconsistent and additional fields", () => {
  const success = createLoadSkillSuccess(sampleLoadData());
  const failure = createLoadSkillFailure({ code: "INTERNAL_ERROR", details: {} });

  assert.throws(() => loadSkillOutputSchema.parse({ ...success, text: "flat" }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...success, widget_uri: "ui://tool-card" }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...failure, data: success.data }));
  assert.throws(() => loadSkillOutputSchema.parse({ ...failure, error: null }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, extra: true }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, returned_bytes: success.data.returned_bytes + 1 }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, truncated: true }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, total_bytes: success.data.bytes + 1 }
  }));
  const ambiguous = createLoadSkillFailure({
    code: "SKILL_AMBIGUOUS",
    details: {
      selector: sampleSelector({ source: null, path: null }),
      candidates: [
        sampleSkill(),
        sampleSkill({ path: "$WORKSPACE/.agents/skills/workspace-skill/SKILL.md" })
      ],
      candidates_truncated: false,
      resolution_truncated: false
    }
  });
  assert.throws(() => loadSkillOutputSchema.parse({
    ...ambiguous,
    error: {
      ...ambiguous.error,
      details: {
        ...ambiguous.error.details,
        candidates: [
          { ...ambiguous.error.details.candidates[0], name: "different-skill" },
          ambiguous.error.details.candidates[1]
        ]
      }
    }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, resolution_truncated: true, selector: { ...success.data.selector, path: null } }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: { ...success.data, skill: { ...success.data.skill, name: "other" } }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      selector: { ...success.data.selector, path: "D:\\private\\SKILL.md" }
    }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    data: {
      ...success.data,
      include_global_skills: false,
      selector: sampleSelector({ source: "user", path: "~/.codex/skills/workspace-skill/SKILL.md" }),
      skill: sampleSkill({ source: "user", path: "~/.codex/skills/workspace-skill/SKILL.md" })
    }
  }));
  assert.throws(() => loadSkillOutputSchema.parse({
    ...success,
    meta: { ...success.meta, warnings: ["private diagnostic"] }
  }));
  assert.throws(() => createLoadSkillFailure({
    code: "INTERNAL_ERROR",
    details: { diagnostic: "private" }
  }));
});

test("load_skill is standard/full only read-only and advertises its exact output schema", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { toolMode: "minimal" }), {}, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === "load_skill"), false);
    });

    for (const toolMode of ["standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "load_skill");
        assert.ok(descriptor);
        assert.ok(descriptor.outputSchema);
        assert.equal(descriptor.outputSchema.type, "object");
        assert.deepEqual(
          new Set(descriptor.outputSchema.required),
          new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
        );
        assert.equal(descriptor.annotations?.readOnlyHint, true);
        assert.equal(descriptor.annotations?.destructiveHint, false);
      });
    }
  });
});

test("load_skill real exact-path success reports partial discovery truncation redaction and byte semantics", async () => {
  await withTempWorkspace(async (root) => {
    const syntheticSecret = "sk-" + "Z".repeat(24);
    const body = `# Alpha\n\nOPENAI_API_KEY=${syntheticSecret}\n${"x".repeat(1500)}\n`;
    await writeSkill(root, ".codex/skills/alpha", "alpha", body);
    await writeSkill(root, ".codex/skills/beta", "beta", "# Beta\n");

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "load_skill", {
        name: "alpha",
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/alpha/SKILL.md",
        max_skills: 1,
        max_bytes: 1000
      });
      const parsed = parseLoadSkillResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.root, root);
      assert.deepEqual(parsed.data.selector, {
        name: "alpha",
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/alpha/SKILL.md"
      });
      assert.equal(parsed.data.skill.name, "alpha");
      assert.equal(parsed.data.include_global_skills, false);
      assert.equal(parsed.data.max_skills, 1);
      assert.equal(parsed.data.max_bytes, 1000);
      assert.equal(parsed.data.bytes, 1000);
      assert.equal(parsed.data.total_bytes > parsed.data.bytes, true);
      assert.equal(parsed.data.truncated, true);
      assert.equal(parsed.data.resolution_truncated, true);
      assert.equal(parsed.data.redacted, true);
      assert.equal(parsed.data.returned_bytes, Buffer.byteLength(parsed.data.text));
      assert.equal(parsed.data.text.includes(syntheticSecret), false);
      assert.equal(parsed.data.text.includes("[REDACTED_SECRET]"), true);
      assert.deepEqual(parsed.meta.warnings, [
        LOAD_SKILL_TRUNCATED_WARNING,
        LOAD_SKILL_REDACTED_WARNING
      ]);
      assert.equal("text" in result.structuredContent, false);
      assert.equal("skill" in result.structuredContent, false);
    });
  });
});

test("load_skill supports an empty SKILL body with exact zero-byte semantics", async () => {
  await withTempWorkspace(async (root) => {
    await writeSkill(root, ".codex/skills/empty-skill", "empty-skill", null);
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "load_skill", {
        name: "empty-skill",
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/empty-skill/SKILL.md",
        include_global_skills: false
      });
      const parsed = parseLoadSkillResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.text, "");
      assert.equal(parsed.data.bytes, 0);
      assert.equal(parsed.data.returned_bytes, 0);
      assert.equal(parsed.data.total_bytes, 0);
      assert.equal(parsed.data.truncated, false);
      assert.deepEqual(parsed.meta.warnings, []);
    });
  });
});

test("load_skill echoes effective provider options and validates returned identity", async () => {
  await withTempWorkspace(async (root) => {
    let observed;
    const providerText = "# Provider Skill\n";
    await withConfigClient(createTestConfig(root), {
      loadSkillProvider: async (context) => {
        observed = context;
        return {
          skill: {
            name: "provider-skill",
            description: undefined,
            source: "workspace",
            path: "$WORKSPACE/.codex/skills/provider-skill/SKILL.md"
          },
          text: providerText,
          bytes: Buffer.byteLength(providerText),
          totalBytes: Buffer.byteLength(providerText),
          truncated: false,
          discoveryTruncated: false
        };
      }
    }, async (client) => {
      const result = await callTool(client, "load_skill", {
        name: "provider-skill",
        source: "workspace",
        max_skills: 7,
        max_bytes: 2222
      });
      const parsed = parseLoadSkillResult(result);
      assert.equal(observed.workspace.root, root);
      assert.deepEqual(observed.options, {
        name: "provider-skill",
        source: "workspace",
        path: undefined,
        includeGlobal: false,
        maxSkills: 7,
        maxBytes: 2222
      });
      assert.equal(parsed.data.skill.description, null);
      assert.equal(parsed.data.max_skills, 7);
      assert.equal(parsed.data.max_bytes, 2222);
      assert.equal(parsed.data.text, providerText);
    });

    await withConfigClient(createTestConfig(root), {
      loadSkillProvider: async () => ({
        skill: sampleSkill({ name: "wrong-name" }),
        text: "private provider body",
        bytes: 21,
        totalBytes: 21,
        truncated: false,
        discoveryTruncated: false
      })
    }, async (client) => {
      const result = await callTool(client, "load_skill", { name: "requested-name" });
      assertLoadSkillFailure(result, "INTERNAL_ERROR", {});
      assert.equal(JSON.stringify(result.structuredContent).includes("private provider body"), false);
    });
  });
});

test("load_skill returns stable workspace selector and provider failures without leaks", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const missingWorkspace = await callTool(client, "load_skill", {
        workspace_id: "missing-workspace",
        name: "skill"
      });
      assertLoadSkillFailure(missingWorkspace, "WORKSPACE_NOT_FOUND", {
        source: "workspace_id",
        workspace_id: "missing-workspace"
      });

      const invalid = await callTool(client, "load_skill", {
        name: "skill",
        source: "workspace",
        path: "~/.codex/skills/skill/SKILL.md"
      });
      assertLoadSkillFailure(invalid, "INVALID_SKILL_SELECTOR", {
        field: "path",
        reason: "source_path_mismatch"
      });
    });

    await withConfigClient(createTestConfig(root), {
      loadSkillProvider: async () => {
        throw new Error(`private provider failure ${root} ${"sk-" + "Q".repeat(24)}`);
      }
    }, async (client) => {
      const result = await callTool(client, "load_skill", { name: "skill" });
      assertLoadSkillFailure(result, "INTERNAL_ERROR", {});
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(root), false);
      assert.equal(serialized.includes("private provider failure"), false);
    });

    for (const code of ["SKILL_BOUNDARY_VIOLATION", "SKILL_READ_FAILED"]) {
      const skill = sampleSkill();
      await withConfigClient(createTestConfig(root), {
        loadSkillProvider: async () => {
          throw new LoadSkillError(code, {
            selector: sampleSelector(),
            skill
          });
        }
      }, async (client) => {
        const result = await callTool(client, "load_skill", {
          name: skill.name,
          source: skill.source,
          path: skill.path
        });
        assertLoadSkillFailure(result, code, { skill });
      });
    }
  });
});

test("load_skill distinguishes not-found ambiguity and bounded-resolution failure", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const missing = await callTool(client, "load_skill", {
        name: "missing-skill",
        source: "workspace",
        include_global_skills: false
      });
      assertLoadSkillFailure(missing, "SKILL_NOT_FOUND", {
        selector: { name: "missing-skill", source: "workspace", path: null },
        include_global_skills: false,
        max_skills: 500
      });
    });

    await writeSkill(root, ".codex/skills/dup-a", "duplicate", "# A\n");
    await writeSkill(root, ".agents/skills/dup-b", "duplicate", "# B\n");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const ambiguous = await callTool(client, "load_skill", {
        name: "duplicate",
        source: "workspace",
        include_global_skills: false
      });
      const parsed = assertLoadSkillFailure(ambiguous, "SKILL_AMBIGUOUS", {
        selector: { name: "duplicate", source: "workspace", path: null },
        candidates: [
          {
            name: "duplicate",
            description: "duplicate instructions",
            source: "workspace",
            path: "$WORKSPACE/.agents/skills/dup-b/SKILL.md"
          },
          {
            name: "duplicate",
            description: "duplicate instructions",
            source: "workspace",
            path: "$WORKSPACE/.codex/skills/dup-a/SKILL.md"
          }
        ],
        candidates_truncated: false,
        resolution_truncated: false
      });
      assert.equal(parsed.error.details.candidates.length, 2);
    });
  });

  await withTempWorkspace(async (root) => {
    await writeSkill(root, ".codex/skills/alpha", "alpha", "# Alpha\n");
    await writeSkill(root, ".codex/skills/beta", "beta", "# Beta\n");
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const limited = await callTool(client, "load_skill", {
        name: "alpha",
        source: "workspace",
        include_global_skills: false,
        max_skills: 1
      });
      assertLoadSkillFailure(limited, "SKILL_RESOLUTION_LIMIT_REACHED", {
        selector: { name: "alpha", source: "workspace", path: null },
        include_global_skills: false,
        max_skills: 1
      });

      const exact = await callTool(client, "load_skill", {
        name: "alpha",
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/alpha/SKILL.md",
        include_global_skills: false,
        max_skills: 1
      });
      const parsed = parseLoadSkillResult(exact);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.resolution_truncated, true);
    });
  });
});

test("load_skill malformed provider results are fixed INTERNAL_ERROR", async () => {
  await withTempWorkspace(async (root) => {
    const malformedCases = [
      "not-an-object",
      { skill: sampleSkill(), text: "x", bytes: 1, totalBytes: 1, truncated: false },
      {
        skill: sampleSkill({ path: `${root}/private/SKILL.md` }),
        text: "private diagnostic",
        bytes: 18,
        totalBytes: 18,
        truncated: false,
        discoveryTruncated: false
      },
      {
        skill: sampleSkill(),
        text: "short",
        bytes: 5,
        totalBytes: 6,
        truncated: false,
        discoveryTruncated: false,
        diagnostic: root
      },
      {
        skill: sampleSkill(),
        text: "x".repeat(1_000),
        bytes: 1,
        totalBytes: 1,
        truncated: false,
        discoveryTruncated: false
      }
    ];

    for (const malformed of malformedCases) {
      await withConfigClient(createTestConfig(root), {
        loadSkillProvider: async () => malformed
      }, async (client) => {
        const result = await callTool(client, "load_skill", { name: "workspace-skill" });
        assertLoadSkillFailure(result, "INTERNAL_ERROR", {});
        assert.equal(JSON.stringify(result).includes("private diagnostic"), false);
      });
    }
  });
});

test("load_skill Tool Card is nested-first bounded and retains historical flat fallback", () => {
  assert.match(toolCardWidgetHtml, /function loadSkillResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "load_skill"/);
  assert.match(toolCardWidgetHtml, /return nested \? data\.data : \(data \?\? \{\}\)/);
  assert.match(toolCardWidgetHtml, /function renderLoadSkill\(data\)/);
  assert.match(toolCardWidgetHtml, /previewLines\(skillData\.text, 80\)/);
  assert.match(toolCardWidgetHtml, /skillData\.redacted/);
  assert.match(toolCardWidgetHtml, /skillData\.truncated/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Skill unavailable\."/);
  assert.match(toolCardWidgetHtml, /tool === "load_skill"/);
  assert.match(toolCardWidgetHtml, /renderLoadSkill\(data\)/);
});

test("load_skill with Tool Cards preserves a long exact structured body", async () => {
  await withTempWorkspace(async (root) => {
    const text = "x".repeat(40_000);
    await withConfigClient(createTestConfig(root, { toolCards: true }), {
      loadSkillProvider: async () => ({
        skill: sampleSkill(),
        text,
        bytes: 40_000,
        totalBytes: 40_000,
        truncated: false,
        discoveryTruncated: false
      })
    }, async (client) => {
      const result = await callTool(client, "load_skill", {
        name: "workspace-skill",
        source: "workspace",
        max_bytes: 40_000
      });
      const parsed = parseLoadSkillResult(result);
      assert.equal(parsed.data.text.length, 40_000);
      assert.equal(parsed.data.returned_bytes, 40_000);
      assert.equal(parsed.data.text.includes("structured field truncated"), false);
    });
  });
});

test("load_skill supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    const text = "# Wrapped Skill\n";
    await withConfigClient(createTestConfig(root), {
      loadSkillProvider: async () => ({
        skill: sampleSkill(),
        text,
        bytes: Buffer.byteLength(text),
        totalBytes: Buffer.byteLength(text),
        truncated: false,
        discoveryTruncated: false
      })
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "load_skill",
        args: { name: "workspace-skill", source: "workspace" }
      });
      assert.equal(result.structuredContent.codexpro_tool, "load_skill");
      assert.equal(result.structuredContent.codexpro_title, "Load Skill");
      assert.equal(result.structuredContent.codexpro_super_action, "load_skill");
      assert.equal(result.structuredContent.wrapped_tool, "load_skill");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.text, text);
      assert.equal("text" in result.structuredContent, false);
      assert.equal("skill" in result.structuredContent, false);
    });
  });
});

test("load_skill consumers use nested data and protected Smoke sources stay unchanged", async () => {
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  const mainCompat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const httpCompat = await fs.readFile(new URL("../scripts/http-smoke-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");

  assert.equal(stress.includes("loaded.structuredContent.text"), false);
  assert.equal(stress.includes("loadedLast.structuredContent.text"), false);
  assert.equal(stress.includes("loadedByName.structuredContent.text"), false);
  assert.match(stress, /loaded\.structuredContent\.data\?\.text/);
  assert.match(stress, /loadedLast\.structuredContent\.data\?\.text/);
  assert.match(stress, /loadedByName\.structuredContent\.data\?\.text/);
  assert.match(stress, /returned_bytes/);
  assert.match(stress, /resolution_truncated/);

  assert.match(mainCompat, /loadedSkill\.structuredContent\.data\?\.skill\?\.name/);
  assert.match(mainCompat, /loadedSkill\.structuredContent\.data\?\.text/);
  assert.match(httpCompat, /loadedSkill\.structuredContent\.data\?\.skill\?\.name/);
  assert.match(httpCompat, /loadedSkill\.structuredContent\.data\?\.text/);

  assert.equal(countOccurrences(protectedMain, "loadedSkill.structuredContent.skill?.name"), 1);
  assert.equal(countOccurrences(protectedMain, "loadedSkill.structuredContent.text"), 1);
  assert.equal(countOccurrences(protectedHttp, "loadedSkill.structuredContent.skill?.name"), 1);
  assert.equal(countOccurrences(protectedHttp, "loadedSkill.structuredContent.text"), 1);
});

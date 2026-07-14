import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/handoffToCodex.ts", import.meta.url).catch(() => null);
const handoffModule = await tsImport("../src/handoffOps.ts", import.meta.url).catch(() => null);

const {
  HANDOFF_TO_CODEX_APPEND_WARNING,
  HANDOFF_TO_CODEX_DIFF_TRUNCATION_SUFFIX,
  HANDOFF_TO_CODEX_ERROR_MESSAGES,
  HANDOFF_TO_CODEX_SCAFFOLD_NAMES,
  createHandoffToCodexFailure,
  createHandoffToCodexSuccess,
  handoffToCodexOutputSchema
} = schemaModule ?? {};

const { writePreparedAgentHandoff } = handoffModule ?? {};

const DATA_KEYS = [
  "additions",
  "agent",
  "agent_name",
  "append_applied",
  "append_requested",
  "changed",
  "created_context_file_count",
  "created_context_files",
  "deletions",
  "diff",
  "diff_bytes",
  "diff_path",
  "diff_truncated",
  "event_bytes",
  "event_sha256",
  "execution_log_path",
  "log_path",
  "logged_count",
  "logged_paths",
  "max_write_bytes",
  "model",
  "plan_bytes",
  "plan_file_existed_before",
  "plan_path",
  "plan_sha256",
  "previous_bytes",
  "prior_plan_available",
  "prompt",
  "prompt_bytes",
  "root",
  "status_path",
  "title",
  "tool_mode",
  "updated_at",
  "workspace_id",
  "write_mode"
];

const SCAFFOLD_NAMES = [
  "README.md",
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl",
  "session-log.jsonl"
];

const ERROR_CODES = [
  "WORKSPACE_NOT_FOUND",
  "REQUEST_INVALID",
  "OUTPUT_PATH_BLOCKED",
  "OUTPUT_PATH_OUTSIDE_WORKSPACE",
  "OUTPUT_PATH_INVALID",
  "EXISTING_PLAN_TOO_LARGE",
  "EXISTING_PLAN_NOT_TEXT",
  "EXISTING_PLAN_READ_FAILED",
  "PLAN_TOO_LARGE",
  "PLAN_SECRET_BLOCKED",
  "SCAFFOLD_WRITE_FAILED",
  "PLAN_WRITE_FAILED",
  "LOG_WRITE_FAILED",
  "HANDOFF_WRITE_FAILED",
  "INTERNAL_ERROR"
];

const UPDATED_AT = "2026-07-13T15:16:17.000Z";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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
    writeMode: "handoff",
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
    toolCards: true,
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

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-codex-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "handoff-to-codex-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
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

function sampleData(overrides = {}) {
  const plan = "# Codex implementation plan\n\nUpdated: 2026-07-13T15:16:17.000Z\n";
  const diff = "--- a/.ai-bridge/current-plan.md\n+++ b/.ai-bridge/current-plan.md\n@@ -1,1 +1,3 @@\n-\n+# Codex implementation plan";
  const prompt = "Read .ai-bridge/current-plan.md and execute it in small, reviewable steps.";
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    tool_mode: "full",
    write_mode: "handoff",
    agent: "codex",
    agent_name: "Codex",
    model: null,
    title: "Codex implementation plan",
    updated_at: UPDATED_AT,
    append_requested: false,
    append_applied: false,
    max_write_bytes: 1_000_000,
    plan_path: ".ai-bridge/current-plan.md",
    status_path: ".ai-bridge/agent-status.md",
    diff_path: ".ai-bridge/implementation-diff.patch",
    log_path: ".ai-bridge/session-log.jsonl",
    execution_log_path: ".ai-bridge/execution-log.jsonl",
    created_context_files: [],
    created_context_file_count: 0,
    plan_file_existed_before: false,
    prior_plan_available: false,
    previous_bytes: 0,
    plan_bytes: Buffer.byteLength(plan, "utf8"),
    plan_sha256: sha256(plan),
    additions: 3,
    deletions: 1,
    changed: true,
    diff,
    diff_bytes: Buffer.byteLength(diff, "utf8"),
    diff_truncated: false,
    logged_paths: [".ai-bridge/session-log.jsonl", ".ai-bridge/execution-log.jsonl"],
    logged_count: 2,
    event_bytes: 240,
    event_sha256: "b".repeat(64),
    prompt,
    prompt_bytes: Buffer.byteLength(prompt, "utf8"),
    ...overrides
  };
}

function parseResult(result) {
  assert.equal(typeof handoffToCodexOutputSchema?.parse, "function");
  return handoffToCodexOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.equal(parsed.error.code, code);
  assert.equal(parsed.error.message, HANDOFF_TO_CODEX_ERROR_MESSAGES[code]);
  assert.deepEqual(parsed.error.details, details);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  return parsed;
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

test("handoff_to_codex schema exports the exact six-field envelope and thirty-six-field success", () => {
  assert.equal(typeof createHandoffToCodexSuccess, "function");
  assert.equal(typeof createHandoffToCodexFailure, "function");
  assert.equal(typeof handoffToCodexOutputSchema?.parse, "function");
  assert.equal(HANDOFF_TO_CODEX_DIFF_TRUNCATION_SUFFIX, "\n...[diff truncated to 60000 chars]");
  assert.deepEqual(HANDOFF_TO_CODEX_SCAFFOLD_NAMES, SCAFFOLD_NAMES);

  const success = createHandoffToCodexSuccess(sampleData(), 7);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
  ]);
  assert.equal(success.codexpro_tool, "handoff_to_codex");
  assert.equal(success.codexpro_title, "Handoff To Codex");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("handoff_to_codex schema derives one warning and all fifteen safe failures", () => {
  assert.deepEqual(Object.keys(HANDOFF_TO_CODEX_ERROR_MESSAGES ?? {}).sort(), [...ERROR_CODES].sort());
  const warned = createHandoffToCodexSuccess(sampleData({ append_requested: true }), 1);
  assert.deepEqual(warned.meta.warnings, [HANDOFF_TO_CODEX_APPEND_WARNING]);

  for (const code of ERROR_CODES) {
    const failure = createHandoffToCodexFailure(
      code === "REQUEST_INVALID"
        ? { code, details: { source: "plan" } }
        : code === "WORKSPACE_NOT_FOUND"
          ? { code, details: { source: "default_workspace", workspace_id: null } }
          : code.startsWith("OUTPUT_PATH_")
            ? { code, details: { source: "context_dir" } }
            : { code, details: {} },
      2
    );
    assert.equal(failure.ok, false);
    assert.equal(failure.error.code, code);
    assert.deepEqual(failure.meta.warnings, []);
  }
});

test("handoff_to_codex schema rejects target, mode, path, count, byte, and diff drift", () => {
  assert.equal(typeof createHandoffToCodexSuccess, "function");
  const mutations = [
    (data) => { data.tool_mode = "standard"; },
    (data) => { data.agent = "opencode"; },
    (data) => { data.agent_name = "OpenCode"; },
    (data) => { data.model = "provider/model"; },
    (data) => { data.append_applied = true; },
    (data) => { data.plan_path = "other/current-plan.md"; },
    (data) => { data.created_context_file_count = 1; },
    (data) => { data.logged_paths.reverse(); },
    (data) => { data.diff_bytes += 1; },
    (data) => { data.prompt_bytes -= 1; },
    (data) => { data.diff_truncated = true; }
  ];
  for (const mutate of mutations) {
    const data = structuredClone(sampleData());
    mutate(data);
    assert.throws(() => createHandoffToCodexSuccess(data));
  }
  assert.throws(() => handoffToCodexOutputSchema.parse({ ...createHandoffToCodexSuccess(sampleData()), agent: "codex" }));
});

test("handoff_to_codex remains full-only and advertises only the exact direct contract", async () => {
  await withTempWorkspace(async (root) => {
    for (const [toolMode, writeMode, connectionTest, expected] of [
      ["full", "off", false, true],
      ["full", "handoff", false, true],
      ["full", "workspace", false, true],
      ["standard", "handoff", false, false],
      ["minimal", "handoff", false, false],
      ["full", "handoff", true, false]
    ]) {
      await withConfigClient(
        createTestConfig(root, { toolMode, writeMode, connectionTest }),
        {},
        async (client) => {
          const listed = await client.listTools();
          const descriptor = listed.tools.find((tool) => tool.name === "handoff_to_codex");
          assert.equal(Boolean(descriptor), expected, `${toolMode}/${writeMode}/${connectionTest}`);
          if (descriptor) {
            assert.deepEqual(Object.keys(descriptor.inputSchema.properties).sort(), ["append", "plan", "title", "workspace_id"]);
            assert.deepEqual(descriptor.inputSchema.required, ["plan"]);
            assert.deepEqual(descriptor.outputSchema.required, [
              "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
            ]);
            const advertisedData = descriptor.outputSchema.properties.data.anyOf.find(
              (candidate) => candidate.type === "object"
            );
            assert.deepEqual(advertisedData.properties.tool_mode, { type: "string", const: "full" });
            assert.deepEqual(advertisedData.properties.agent, { type: "string", const: "codex" });
            assert.deepEqual(advertisedData.properties.agent_name, { type: "string", const: "Codex" });
            assert.deepEqual(advertisedData.properties.model, { type: "null" });
            assert.equal(descriptor.annotations.destructiveHint, false);
          }
        }
      );
    }
  });
});

test("handoff_to_codex MCP success returns exact fixed identity and durable facts", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToCodexNow: () => UPDATED_AT }, async (client) => {
      const result = await callTool(client, "handoff_to_codex", {
        title: "Codex plan",
        plan: "- next"
      });
      const parsed = parseResult(result);
      assert.equal(result.isError, undefined);
      assert.equal(parsed.ok, true);
      assert.deepEqual(Object.keys(parsed.data).sort(), DATA_KEYS);
      assert.equal(parsed.data.agent, "codex");
      assert.equal(parsed.data.agent_name, "Codex");
      assert.equal(parsed.data.model, null);
      assert.equal(parsed.data.tool_mode, "full");
      assert.equal(parsed.data.updated_at, UPDATED_AT);
      assert.equal("agent" in result.structuredContent, false);

      const plan = await fs.readFile(path.join(root, ".ai-bridge", "current-plan.md"), "utf8");
      assert.equal(parsed.data.plan_sha256, sha256(plan));
      for (const name of ["session-log.jsonl", "execution-log.jsonl"]) {
        const log = await fs.readFile(path.join(root, ".ai-bridge", name), "utf8");
        const event = JSON.parse(log.trim());
        assert.equal(event.event, "handoff_to_codex");
        assert.equal(event.plan_hash, parsed.data.plan_sha256);
      }
      assert.match(resultText(result), /Codex prompt:/);
      assert.match(resultText(result), new RegExp(parsed.data.plan_sha256));
    });
  });
});

test("handoff_to_codex preserves defaults and meaningful append semantics", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToCodexNow: () => UPDATED_AT }, async (client) => {
      const first = parseResult(await callTool(client, "handoff_to_codex", { plan: "- first" }));
      assert.equal(first.data.title, "Codex implementation plan");
      assert.equal(first.data.append_requested, false);
      assert.equal(first.data.append_applied, false);

      const second = parseResult(await callTool(client, "handoff_to_codex", { plan: "- second", append: true }));
      assert.equal(second.data.plan_file_existed_before, true);
      assert.equal(second.data.prior_plan_available, true);
      assert.equal(second.data.append_requested, true);
      assert.equal(second.data.append_applied, true);
      assert.equal(second.data.previous_bytes, first.data.plan_bytes);
      assert.deepEqual(second.meta.warnings, []);
      assert.match(await fs.readFile(path.join(root, ".ai-bridge", "current-plan.md"), "utf8"), /- first[\s\S]+- second/);
    });
  });
});

test("handoff_to_codex returns stable request and generated-plan failures without writes", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(
      createTestConfig(root, { maxWriteBytes: 400 }),
      { handoffToCodexNow: () => UPDATED_AT },
      async (client) => {
        const empty = await callTool(client, "handoff_to_codex", { plan: "   " });
        assertFailure(empty, "REQUEST_INVALID", { source: "plan" });
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));

        const longTitle = await callTool(client, "handoff_to_codex", {
          title: "t".repeat(121),
          plan: "x"
        });
        assertFailure(longTitle, "REQUEST_INVALID", { source: "title" });
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));

        const oversized = await callTool(client, "handoff_to_codex", { plan: "x".repeat(500) });
        assertFailure(oversized, "PLAN_TOO_LARGE", {});
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));
      }
    );
  });
});

test("handoff_to_codex keeps existing-plan reads bounded independently from writes", async () => {
  await withTempWorkspace(async (root) => {
    const existing = "x".repeat(200);
    await fs.mkdir(path.join(root, ".ai-bridge"));
    await fs.writeFile(path.join(root, ".ai-bridge", "current-plan.md"), existing, "utf8");
    await withConfigClient(
      createTestConfig(root, { maxReadBytes: 100, maxWriteBytes: 1_000 }),
      { handoffToCodexNow: () => UPDATED_AT },
      async (client) => {
        const result = await callTool(client, "handoff_to_codex", { plan: "- next", append: true });
        assertFailure(result, "EXISTING_PLAN_TOO_LARGE", {});
        assert.equal(await fs.readFile(path.join(root, ".ai-bridge", "current-plan.md"), "utf8"), existing);
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge", "session-log.jsonl")));
      }
    );
  });
});

test("handoff_to_codex rejects provider identity drift", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      handoffToCodexNow: () => UPDATED_AT,
      handoffToCodexProvider: async (context) => ({
        ...(await writePreparedAgentHandoff(context)),
        agent: "opencode"
      })
    }, async (client) => {
      assertFailure(await callTool(client, "handoff_to_codex", { plan: "x" }), "INTERNAL_ERROR", {});
    });
  });
});

test("handoff_to_codex rejects a missing durable plan", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      handoffToCodexNow: () => UPDATED_AT,
      handoffToCodexProvider: async (context) => {
        const written = await writePreparedAgentHandoff(context);
        await fs.rm(path.join(root, ".ai-bridge", "current-plan.md"));
        return written;
      }
    }, async (client) => {
      assertFailure(await callTool(client, "handoff_to_codex", { plan: "x" }), "INTERNAL_ERROR", {});
    });
  });
});

test("handoff_to_codex rejects mismatched durable log tails", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      handoffToCodexNow: () => UPDATED_AT,
      handoffToCodexProvider: async (context) => {
        const written = await writePreparedAgentHandoff(context);
        await fs.appendFile(path.join(root, ".ai-bridge", "execution-log.jsonl"), "{}\n");
        return written;
      }
    }, async (client) => {
      assertFailure(await callTool(client, "handoff_to_codex", { plan: "x" }), "INTERNAL_ERROR", {});
    });
  });
});

test("handoff Tool Card is nested-first for both direct tools with no flat fallback", () => {
  const helper = toolCardWidgetHtml.match(/function handoffToAgentResultData\(data\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(helper, /data\?\.codexpro_tool === "handoff_to_codex"/);
  assert.match(helper, /data\?\.codexpro_tool === "handoff_to_agent"/);
  assert.match(toolCardWidgetHtml, /handoff\.plan_sha256/);
  assert.match(toolCardWidgetHtml, /truncate\(handoff\.prompt/);
  assert.match(toolCardWidgetHtml, /truncate\(handoff\.diff/);
  assert.doesNotMatch(helper, /return nested \? data\.data : \(data \?\? \{\}\)/);
});

test("handoff_to_codex supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToCodexNow: () => UPDATED_AT }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "codex_handoff",
        args: { plan: "- next" }
      });
      assert.equal(result.structuredContent.codexpro_tool, "handoff_to_codex");
      assert.equal(result.structuredContent.codexpro_title, "Handoff To Codex");
      assert.equal(result.structuredContent.codexpro_super_action, "codex_handoff");
      assert.equal(result.structuredContent.wrapped_tool, "handoff_to_codex");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.agent, "codex");
      assert.equal("agent" in result.structuredContent, false);
    });
  });
});

test("handoff_to_codex consumers migrate exactly while protected Smoke sources remain unchanged", async () => {
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const agentContract = await fs.readFile(new URL("./handoff-to-agent-contract.test.mjs", import.meta.url), "utf8");
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  const server = await fs.readFile(new URL("../src/server.ts", import.meta.url), "utf8");

  assert.equal(countOccurrences(protectedMain, "name: 'handoff_to_codex'"), 1);
  assert.equal(countOccurrences(protectedHttp, "'handoff_to_codex'"), 2);
  assert.doesNotMatch(agentContract, /codex\.structuredContent\.agent/);
  assert.match(stress, /codex_handoff/);
  assert.match(stress, /structuredContent\.data\.agent === 'codex'/);
  assert.doesNotMatch(server, /writeAgentHandoff/);
});

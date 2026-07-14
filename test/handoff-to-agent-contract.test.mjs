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
const { PathGuard } = await tsImport("../src/guard.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/handoffToAgent.ts", import.meta.url).catch(() => null);
const handoffModule = await tsImport("../src/handoffOps.ts", import.meta.url).catch(() => null);

const {
  HANDOFF_TO_AGENT_APPEND_WARNING,
  HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX,
  HANDOFF_TO_AGENT_ERROR_MESSAGES,
  HANDOFF_TO_AGENT_SCAFFOLD_NAMES,
  createHandoffToAgentFailure,
  createHandoffToAgentSuccess,
  handoffToAgentOutputSchema
} = schemaModule ?? {};

const {
  prepareAgentHandoffRequest,
  preflightAgentHandoffOutput,
  writePreparedAgentHandoff
} = handoffModule ?? {};

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

const UPDATED_AT = "2026-07-13T12:34:56.000Z";

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
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-agent-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "handoff-to-agent-contract-test", version: "0.0.0" });
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
  const plan = "# Agent implementation plan\n\nUpdated: 2026-07-13T12:34:56.000Z\n";
  const diff = "--- a/.ai-bridge/current-plan.md\n+++ b/.ai-bridge/current-plan.md\n@@ -1,1 +1,3 @@\n-\n+# Agent implementation plan";
  const prompt = "Read .ai-bridge/current-plan.md and execute it in small, reviewable steps.";
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    tool_mode: "full",
    write_mode: "handoff",
    agent: "opencode",
    agent_name: "OpenCode",
    model: "provider/model",
    title: "Agent implementation plan",
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
    event_sha256: "a".repeat(64),
    prompt,
    prompt_bytes: Buffer.byteLength(prompt, "utf8"),
    ...overrides
  };
}

function parseResult(result) {
  assert.equal(typeof handoffToAgentOutputSchema?.parse, "function");
  return handoffToAgentOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code, details) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.equal(parsed.error.code, code);
  assert.equal(parsed.error.message, HANDOFF_TO_AGENT_ERROR_MESSAGES[code]);
  assert.deepEqual(parsed.error.details, details);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  return parsed;
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

test("handoff_to_agent schema exports the exact six-field envelope and thirty-six-field success", () => {
  assert.equal(typeof createHandoffToAgentSuccess, "function");
  assert.equal(typeof createHandoffToAgentFailure, "function");
  assert.equal(typeof handoffToAgentOutputSchema?.parse, "function");
  assert.equal(HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX, "\n...[diff truncated to 60000 chars]");
  assert.deepEqual(HANDOFF_TO_AGENT_SCAFFOLD_NAMES, SCAFFOLD_NAMES);

  const success = createHandoffToAgentSuccess(sampleData(), 7);
  assert.deepEqual(Object.keys(success).sort(), [
    "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
  ]);
  assert.equal(success.codexpro_tool, "handoff_to_agent");
  assert.equal(success.codexpro_title, "Handoff To Agent");
  assert.equal(success.ok, true);
  assert.equal(success.error, null);
  assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
  assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
});

test("handoff_to_agent schema derives the append warning and all fifteen safe failures", () => {
  assert.deepEqual(Object.keys(HANDOFF_TO_AGENT_ERROR_MESSAGES ?? {}).sort(), [...ERROR_CODES].sort());
  const warned = createHandoffToAgentSuccess(sampleData({ append_requested: true }), 1);
  assert.deepEqual(warned.meta.warnings, [HANDOFF_TO_AGENT_APPEND_WARNING]);

  for (const code of ERROR_CODES) {
    const failure = createHandoffToAgentFailure(
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

test("handoff_to_agent schema rejects append, fixed-path, count, byte, hash, and diff drift", () => {
  assert.equal(typeof createHandoffToAgentSuccess, "function");
  const mutations = [
    (data) => { data.append_applied = true; },
    (data) => { data.prior_plan_available = true; },
    (data) => { data.previous_bytes = 1; },
    (data) => { data.plan_path = "other/current-plan.md"; },
    (data) => { data.created_context_file_count = 1; },
    (data) => { data.logged_paths.reverse(); },
    (data) => { data.plan_bytes = data.max_write_bytes + 1; },
    (data) => { data.plan_sha256 = "A".repeat(64); },
    (data) => { data.diff_bytes += 1; },
    (data) => { data.diff_truncated = true; },
    (data) => { data.prompt_bytes += 1; },
    (data) => { data.changed = false; }
  ];
  for (const mutate of mutations) {
    const data = structuredClone(sampleData());
    mutate(data);
    assert.throws(() => createHandoffToAgentSuccess(data));
  }
});

test("handoff_to_agent descriptor and mode visibility advertise only the direct exact contract", async () => {
  await withTempWorkspace(async (root) => {
    for (const [toolMode, writeMode, expected] of [
      ["full", "workspace", true],
      ["standard", "off", true],
      ["minimal", "handoff", true],
      ["minimal", "off", false]
    ]) {
      await withConfigClient(createTestConfig(root, { toolMode, writeMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "handoff_to_agent");
        assert.equal(Boolean(descriptor), expected, `${toolMode}/${writeMode}`);
        if (descriptor) {
          assert.deepEqual(descriptor.outputSchema.required, [
            "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
          ]);
          assert.equal(descriptor.annotations.destructiveHint, false);
        }
      });
    }
  });
});

test("handoff request preparation is immutable, deterministic, shell-safe, and rejects before writes", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof prepareAgentHandoffRequest, "function");
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: UPDATED_AT };
    const request = prepareAgentHandoffRequest(config, workspace, {
      agent: "OpenCode",
      agentName: "  Open   Code  ",
      model: "provider/a'b",
      title: "  Ship   feature  ",
      plan: "\n- do it\n",
      append: true,
      eventName: "handoff_to_agent",
      updatedAt: UPDATED_AT
    });
    assert.equal(request.agent, "opencode");
    assert.equal(request.agentName, "Open Code");
    assert.equal(request.title, "Ship feature");
    assert.equal(request.plan, "- do it");
    assert.equal(request.updatedAt, UPDATED_AT);
    assert.match(request.prompt, /--model 'provider\/a'\\''b'/);
    assert.ok(Object.isFrozen(request));

    for (const options of [
      { agent: "../bad", title: "x", plan: "x" },
      { agent: "custom", title: "x", plan: "   " },
      { agent: "custom", title: "x", plan: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }
    ]) {
      await assert.rejects(async () => {
        const invalid = prepareAgentHandoffRequest(config, workspace, {
          ...options,
          append: false,
          eventName: "handoff_to_agent",
          updatedAt: UPDATED_AT
        });
        await preflightAgentHandoffOutput(config, guard, workspace, invalid);
      });
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));
    }
  });
});

test("handoff preflight distinguishes absent, placeholder, and meaningful prior plans", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof preflightAgentHandoffOutput, "function");
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: UPDATED_AT };
    const prepared = prepareAgentHandoffRequest(config, workspace, {
      agent: "opencode", title: "Plan", plan: "- next", append: true,
      eventName: "handoff_to_agent", updatedAt: UPDATED_AT
    });

    const absent = await preflightAgentHandoffOutput(config, guard, workspace, prepared);
    assert.equal(absent.planFileExistedBefore, false);
    assert.equal(absent.priorPlanAvailable, false);
    assert.equal(absent.appendApplied, false);
    assert.equal(absent.previousBytes, 0);
    await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));

    await fs.mkdir(path.join(root, ".ai-bridge"));
    const placeholder = "# Current Plan\n\nNo plan written yet.\n";
    await fs.writeFile(path.join(root, ".ai-bridge", "current-plan.md"), placeholder);
    const scaffold = await preflightAgentHandoffOutput(config, guard, workspace, prepared);
    assert.equal(scaffold.planFileExistedBefore, true);
    assert.equal(scaffold.priorPlanAvailable, false);
    assert.equal(scaffold.appendApplied, false);
    assert.equal(scaffold.previousBytes, Buffer.byteLength(placeholder));

    await fs.writeFile(path.join(root, ".ai-bridge", "current-plan.md"), "# Prior\n");
    const prior = await preflightAgentHandoffOutput(config, guard, workspace, prepared);
    assert.equal(prior.planFileExistedBefore, true);
    assert.equal(prior.priorPlanAvailable, true);
    assert.equal(prior.appendApplied, true);
    assert.match(prior.finalPlan, /^# Prior\n\n---\n\n# Plan/);
  });
});

test("handoff preflight treats the canonical Windows CRLF scaffold as no prior plan", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: UPDATED_AT };
    await fs.mkdir(path.join(root, ".ai-bridge"));
    const placeholder = "# Current Plan\r\n\r\nNo plan written yet.\r\n";
    await fs.writeFile(path.join(root, ".ai-bridge", "current-plan.md"), placeholder);
    const request = prepareAgentHandoffRequest(config, workspace, {
      agent: "opencode", title: "Plan", plan: "- next", append: true,
      eventName: "handoff_to_agent", updatedAt: UPDATED_AT
    });
    const output = await preflightAgentHandoffOutput(config, guard, workspace, request);
    assert.equal(output.planFileExistedBefore, true);
    assert.equal(output.priorPlanAvailable, false);
    assert.equal(output.appendApplied, false);
    assert.equal(output.finalPlan, request.body);
  });
});

test("handoff preflight rejects a context directory or existing ancestor that is a file before provider writes", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: UPDATED_AT };
    await fs.writeFile(path.join(root, ".ai-bridge"), "not a directory\n");
    const request = prepareAgentHandoffRequest(config, workspace, {
      agent: "opencode", title: "Plan", plan: "- next", append: false,
      eventName: "handoff_to_agent", updatedAt: UPDATED_AT
    });
    await assert.rejects(
      preflightAgentHandoffOutput(config, guard, workspace, request),
      (error) => error?.name === "HandoffOperationError" && error?.code === "OUTPUT_PATH_INVALID"
    );
    assert.equal(await fs.readFile(path.join(root, ".ai-bridge"), "utf8"), "not a directory\n");

    const nestedConfig = createTestConfig(root, { contextDir: ".bridge/nested" });
    const nestedGuard = new PathGuard(nestedConfig);
    await fs.writeFile(path.join(root, ".bridge"), "not a directory\n");
    const nestedRequest = prepareAgentHandoffRequest(nestedConfig, workspace, {
      agent: "opencode", title: "Plan", plan: "- next", append: false,
      eventName: "handoff_to_agent", updatedAt: UPDATED_AT
    });
    await assert.rejects(
      preflightAgentHandoffOutput(nestedConfig, nestedGuard, workspace, nestedRequest),
      (error) => error?.name === "HandoffOperationError" && error?.code === "OUTPUT_PATH_INVALID"
    );
    assert.equal(await fs.readFile(path.join(root, ".bridge"), "utf8"), "not a directory\n");
  });
});

test("handoff domain writes exact plan and the same deterministic event to both logs", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof writePreparedAgentHandoff, "function");
    const config = createTestConfig(root);
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: UPDATED_AT };
    const request = prepareAgentHandoffRequest(config, workspace, {
      agent: "opencode", model: "provider/model", title: "Plan", plan: "- next", append: false,
      eventName: "handoff_to_agent", updatedAt: UPDATED_AT
    });
    const output = await preflightAgentHandoffOutput(config, guard, workspace, request);
    const result = await writePreparedAgentHandoff({ config, guard, workspace, request, output });
    const plan = await fs.readFile(path.join(root, ...result.planPath.split("/")), "utf8");
    assert.equal(plan, result.finalPlan);
    assert.equal(result.planSha256, sha256(plan));
    assert.equal(result.planBytes, Buffer.byteLength(plan));
    assert.equal(result.createdContextFiles.length, 9);
    const sessionLog = await fs.readFile(path.join(root, ...result.logPath.split("/")), "utf8");
    const executionLog = await fs.readFile(path.join(root, ...result.executionLogPath.split("/")), "utf8");
    assert.equal(sessionLog, result.event);
    assert.equal(executionLog, result.event);
    assert.equal(result.eventSha256, sha256(result.event));
    assert.match(result.event, new RegExp(`"plan_hash":"${result.planSha256}"`));
  });
});

test("handoff_to_agent MCP success returns exact nested facts verified from disk", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToAgentNow: () => UPDATED_AT }, async (client) => {
      const result = await callTool(client, "handoff_to_agent", {
        agent: "opencode",
        model: "provider/model",
        title: "Plan",
        plan: "- next",
        append: true
      });
      const parsed = parseResult(result);
      assert.equal(parsed.ok, true);
      assert.deepEqual(Object.keys(parsed.data).sort(), DATA_KEYS);
      assert.equal(parsed.data.agent, "opencode");
      assert.equal(parsed.data.append_requested, true);
      assert.equal(parsed.data.append_applied, false);
      assert.deepEqual(parsed.meta.warnings, [HANDOFF_TO_AGENT_APPEND_WARNING]);
      assert.equal(parsed.data.plan_sha256, sha256(await fs.readFile(path.join(root, ".ai-bridge", "current-plan.md"), "utf8")));
      for (const logName of ["session-log.jsonl", "execution-log.jsonl"]) {
        const log = await fs.readFile(path.join(root, ".ai-bridge", logName), "utf8");
        assert.equal(Buffer.byteLength(log), parsed.data.event_bytes);
        assert.equal(sha256(log), parsed.data.event_sha256);
      }
      assert.equal("agent" in result.structuredContent, false);
      assert.match(resultText(result), new RegExp(parsed.data.plan_sha256));
    });
  });
});

test("handoff_to_agent returns stable safe failures and invalid input creates no bridge", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { maxWriteBytes: 400 }), { handoffToAgentNow: () => UPDATED_AT }, async (client) => {
      const invalid = await callTool(client, "handoff_to_agent", { agent: "../bad", plan: "x" });
      assertFailure(invalid, "REQUEST_INVALID", { source: "agent" });
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));

      const oversized = await callTool(client, "handoff_to_agent", { plan: "x".repeat(500) });
      assertFailure(oversized, "PLAN_TOO_LARGE", {});
      await assert.rejects(fs.stat(path.join(root, ".ai-bridge")));
    });
  });
});

test("handoff_to_agent rejects an existing plan above the read limit even below the write limit", async () => {
  await withTempWorkspace(async (root) => {
    const existingPlan = "x".repeat(200);
    await fs.mkdir(path.join(root, ".ai-bridge"));
    await fs.writeFile(path.join(root, ".ai-bridge", "current-plan.md"), existingPlan, "utf8");

    await withConfigClient(
      createTestConfig(root, { maxReadBytes: 100, maxWriteBytes: 1_000 }),
      { handoffToAgentNow: () => UPDATED_AT },
      async (client) => {
        const result = await callTool(client, "handoff_to_agent", {
          agent: "opencode",
          title: "Bounded read",
          plan: "- next",
          append: true
        });
        assertFailure(result, "EXISTING_PLAN_TOO_LARGE", {});
        assert.equal(
          await fs.readFile(path.join(root, ".ai-bridge", "current-plan.md"), "utf8"),
          existingPlan
        );
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge", "session-log.jsonl")));
      }
    );
  });
});

test("handoff_to_agent rejects provider identity drift and missing durable plan", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      handoffToAgentNow: () => UPDATED_AT,
      handoffToAgentProvider: async (context) => ({
        ...(await writePreparedAgentHandoff(context)),
        agent: "pi"
      })
    }, async (client) => {
      const drift = await callTool(client, "handoff_to_agent", { agent: "opencode", plan: "x" });
      assertFailure(drift, "INTERNAL_ERROR", {});
    });

    await fs.rm(path.join(root, ".ai-bridge"), { recursive: true, force: true });
    await withConfigClient(createTestConfig(root), {
      handoffToAgentNow: () => UPDATED_AT,
      handoffToAgentProvider: async (context) => {
        const written = await writePreparedAgentHandoff(context);
        await fs.rm(path.join(root, ".ai-bridge", "current-plan.md"));
        return written;
      }
    }, async (client) => {
      const missing = await callTool(client, "handoff_to_agent", { plan: "x" });
      assertFailure(missing, "INTERNAL_ERROR", {});
    });
  });
});

test("handoff_to_agent rejects mismatched durable log tails", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      handoffToAgentNow: () => UPDATED_AT,
      handoffToAgentProvider: async (context) => {
        const written = await writePreparedAgentHandoff(context);
        await fs.appendFile(path.join(root, ".ai-bridge", "session-log.jsonl"), "{}\n");
        return written;
      }
    }, async (client) => {
      const result = await callTool(client, "handoff_to_agent", { plan: "x" });
      assertFailure(result, "INTERNAL_ERROR", {});
    });
  });
});

test("handoff Tool Card is nested-first and bounded for both direct tools", () => {
  assert.match(toolCardWidgetHtml, /function handoffToAgentResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "handoff_to_agent"/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "handoff_to_codex"/);
  assert.match(toolCardWidgetHtml, /handoff\.plan_sha256/);
  assert.match(toolCardWidgetHtml, /handoff\.append_applied/);
  assert.match(toolCardWidgetHtml, /truncate\(handoff\.prompt/);
  assert.match(toolCardWidgetHtml, /truncate\(handoff\.diff/);
  assert.match(toolCardWidgetHtml, /tool === "handoff_to_agent"/);
  assert.match(toolCardWidgetHtml, /tool === "handoff_to_codex"/);
});

test("handoff_to_agent supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToAgentNow: () => UPDATED_AT }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "agent_handoff",
        args: { agent: "opencode", plan: "- next" }
      });
      assert.equal(result.structuredContent.codexpro_tool, "handoff_to_agent");
      assert.equal(result.structuredContent.codexpro_title, "Handoff To Agent");
      assert.equal(result.structuredContent.codexpro_super_action, "agent_handoff");
      assert.equal(result.structuredContent.wrapped_tool, "handoff_to_agent");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.agent, "opencode");
      assert.equal("agent" in result.structuredContent, false);
    });
  });
});

test("handoff compatibility is exact, protected Smoke is unchanged, and Slice 24 is nested", async () => {
  const compat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const stress = await fs.readFile(new URL("../scripts/stress.mjs", import.meta.url), "utf8");
  assert.equal(countOccurrences(protectedMain, "agentHandoff.structuredContent.agent"), 1);
  assert.equal(countOccurrences(compat, "'agentHandoff.structuredContent.agent'"), 1);
  assert.equal(countOccurrences(compat, "'agentHandoff.structuredContent.data?.agent'"), 1);
  assert.equal(countOccurrences(protectedMain, "}, /File is too large/);"), 1);
  assert.equal(countOccurrences(compat, "'}, /File is too large/);'"), 1);
  assert.equal(countOccurrences(compat, "'}, /EXISTING_PLAN_TOO_LARGE/);'"), 1);
  assert.match(stress, /handoff\.structuredContent\.data\.agent/);

  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), { handoffToAgentNow: () => UPDATED_AT }, async (client) => {
      const codex = await callTool(client, "handoff_to_codex", { plan: "- next" });
      assert.equal(codex.structuredContent.ok, true);
      assert.equal(codex.structuredContent.data.agent, "codex");
      assert.equal("agent" in codex.structuredContent, false);
    });
  });
});

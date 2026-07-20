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
const sessionModule = await tsImport("../src/codexSessions.ts", import.meta.url);
const schemaModule = await tsImport(
  "../src/tools/schemas/readCodexSession.ts",
  import.meta.url
).catch(() => null);

const {
  CODEX_SESSION_READ_FILE_LIMIT,
  CodexSessionReadOperationError,
  readCodexSession
} = sessionModule;

const {
  READ_CODEX_SESSION_ERROR_MESSAGES,
  READ_CODEX_SESSION_REDACTED_WARNING,
  READ_CODEX_SESSION_TRUNCATED_WARNING,
  readCodexSessionOutputSchema,
  createReadCodexSessionFailure,
  createReadCodexSessionSuccess
} = schemaModule ?? {};

const SESSION_A = "019cc369-bd7c-7891-b371-7b20b4fe0b18";
const SESSION_B = "019cc368-1111-7222-8333-123456789abc";
const MAX_SOURCE_BYTES = 20_000_000;

const DATA_KEYS = [
  "codex_dir",
  "codex_sessions_mode",
  "content_bytes",
  "max_messages",
  "max_source_file_bytes",
  "max_total_bytes",
  "message_count",
  "messages",
  "output_limited",
  "redacted_message_count",
  "requested_session_id",
  "requested_source_path",
  "roots",
  "selection",
  "session",
  "source_file_bytes",
  "tool_mode",
  "truncated",
  "truncated_message_count",
  "truncation_reason"
].sort();

const MESSAGE_KEYS = [
  "bytes",
  "content",
  "kind",
  "ordinal",
  "redacted",
  "role",
  "timestamp",
  "truncated"
].sort();

const SESSION_KEYS = [
  "created_at",
  "last_active_at",
  "project_dir",
  "provider_id",
  "resume_command",
  "session_id",
  "source_path",
  "storage",
  "title"
].sort();

const ERROR_CODES = [
  "INTERNAL_ERROR",
  "REQUEST_INVALID",
  "SESSION_FILE_TOO_LARGE",
  "SESSION_ID_MISMATCH",
  "SESSION_NOT_FOUND",
  "SESSION_READ_FAILED",
  "SESSION_RESOLUTION_INCOMPLETE",
  "SOURCE_PATH_OUTSIDE_ROOTS"
].sort();

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
    codexSessions: "read",
    codexDir: path.join(root, "codex-history"),
    writeMode: "off",
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
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "read-codex-session-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexGPTServer(config, dependencies ?? {});
  const client = new Client({ name: "read-codex-session-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
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

function historyRoots(codexDir) {
  return [
    path.join(codexDir, "sessions"),
    path.join(codexDir, "archived_sessions")
  ];
}

function sampleSession(root, overrides = {}) {
  const codexDir = path.join(root, "codex-history");
  const storage = overrides.storage ?? "active";
  const sessionId = overrides.session_id ?? SESSION_A;
  const sourceRoot = storage === "active"
    ? historyRoots(codexDir)[0]
    : historyRoots(codexDir)[1];
  return {
    provider_id: "codex",
    session_id: sessionId,
    storage,
    title: "Read transcript",
    project_dir: root,
    created_at: 1_783_936_800_000,
    last_active_at: 1_783_937_100_000,
    source_path: path.join(sourceRoot, "rollout-" + sessionId + ".jsonl"),
    resume_command: "codex resume " + sessionId,
    ...overrides
  };
}

function sampleMessage(content = "Hello", overrides = {}) {
  return {
    ordinal: 1,
    kind: "message",
    role: "user",
    timestamp: 1_783_936_800_000,
    content,
    bytes: Buffer.byteLength(content, "utf8"),
    redacted: false,
    truncated: false,
    ...overrides
  };
}

function sampleData(root, overrides = {}) {
  const codexDir = path.join(root, "codex-history");
  const messages = overrides.messages ?? [sampleMessage()];
  const contentBytes = messages.reduce((total, message) => total + message.bytes, 0);
  const redactedCount = messages.filter((message) => message.redacted).length;
  const truncatedCount = messages.filter((message) => message.truncated).length;
  const reason = Object.prototype.hasOwnProperty.call(overrides, "truncation_reason")
    ? overrides.truncation_reason
    : null;
  const session = overrides.session ?? sampleSession(root);
  return {
    codex_dir: codexDir,
    roots: historyRoots(codexDir),
    codex_sessions_mode: "read",
    tool_mode: "standard",
    selection: "session_id",
    requested_session_id: session.session_id,
    requested_source_path: null,
    max_messages: 80,
    max_total_bytes: 80_000,
    max_source_file_bytes: MAX_SOURCE_BYTES,
    source_file_bytes: 1_000,
    session,
    messages,
    message_count: messages.length,
    content_bytes: contentBytes,
    redacted_message_count: redactedCount,
    truncated_message_count: truncatedCount,
    truncated: reason !== null,
    truncation_reason: reason,
    output_limited: reason !== null,
    ...overrides
  };
}

function publicToProvider(data) {
  return {
    codex_dir: data.codex_dir,
    roots: data.roots,
    selection: data.selection,
    requested_session_id: data.requested_session_id,
    requested_source_path: data.requested_source_path,
    max_messages: data.max_messages,
    max_total_bytes: data.max_total_bytes,
    max_source_file_bytes: data.max_source_file_bytes,
    source_file_bytes: data.source_file_bytes,
    session: data.session,
    messages: data.messages,
    truncation_reason: data.truncation_reason
  };
}

function parseResult(result) {
  assert.equal(typeof readCodexSessionOutputSchema?.parse, "function");
  return readCodexSessionOutputSchema.parse(result.structuredContent);
}

function expectedFailureDetails(code, override = {}) {
  if (code === "REQUEST_INVALID") return { reason: "selector_required", ...override };
  if (code === "SESSION_NOT_FOUND") return { selector: "session_id", ...override };
  if (code === "SESSION_RESOLUTION_INCOMPLETE") return { selector: "session_id" };
  if (code === "SESSION_FILE_TOO_LARGE") {
    return { max_source_file_bytes: MAX_SOURCE_BYTES };
  }
  return {};
}

function assertFailure(result, code, details = expectedFailureDetails(code)) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: READ_CODEX_SESSION_ERROR_MESSAGES[code],
    retryable: code === "SESSION_READ_FAILED",
    details
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp("Code: " + code));
  return parsed;
}

function responseItem(payload, timestamp = "2026-07-13T10:00:00.000Z") {
  return { timestamp, type: "response_item", payload };
}

async function writeSession(codexDir, options = {}) {
  const storage = options.storage ?? "active";
  const id = options.id ?? SESSION_A;
  const directory = path.join(
    codexDir,
    storage === "active" ? "sessions" : "archived_sessions",
    "2026",
    "07",
    "13"
  );
  await fs.mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, options.fileName ?? "rollout-" + id + ".jsonl");
  const events = options.events ?? [
    responseItem({ type: "message", role: "user", content: options.title ?? "Read me" })
  ];
  const lines = [
    JSON.stringify({
      timestamp: "2026-07-13T09:59:00.000Z",
      type: "session_meta",
      payload: { id, cwd: options.cwd ?? path.dirname(codexDir) }
    }),
    ...events.map((event) => JSON.stringify(event))
  ];
  await fs.writeFile(sourcePath, lines.join("\n") + "\n", "utf8");
  return sourcePath;
}

test("read_codex_session schema exports the exact envelope and twenty-field success", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof createReadCodexSessionSuccess, "function");
    assert.equal(typeof createReadCodexSessionFailure, "function");
    assert.equal(typeof readCodexSessionOutputSchema?.parse, "function");

    const success = createReadCodexSessionSuccess(sampleData(root), 7);
    assert.deepEqual(Object.keys(success).sort(), [
      "codexgpt_title", "codexgpt_tool", "data", "error", "meta", "ok"
    ]);
    assert.equal(success.codexgpt_tool, "read_codex_session");
    assert.equal(success.codexgpt_title, "Read Codex Session");
    assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
    assert.deepEqual(Object.keys(success.data.session).sort(), SESSION_KEYS);
    assert.deepEqual(Object.keys(success.data.messages[0]).sort(), MESSAGE_KEYS);
    assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
  });
});

test("read_codex_session schema derives both warnings and all eight stable failures", async () => {
  await withTempWorkspace(async (root) => {
    assert.deepEqual(Object.keys(READ_CODEX_SESSION_ERROR_MESSAGES ?? {}).sort(), ERROR_CODES);

    const partial = sampleMessage("partial\n...[message truncated]", { truncated: true });
    const limited = createReadCodexSessionSuccess(sampleData(root, {
      messages: [partial],
      truncation_reason: "byte_limit"
    }));
    assert.deepEqual(limited.meta.warnings, [READ_CODEX_SESSION_TRUNCATED_WARNING]);

    const redacted = sampleMessage("[REDACTED_SECRET]", { redacted: true });
    const safe = createReadCodexSessionSuccess(sampleData(root, { messages: [redacted] }));
    assert.deepEqual(safe.meta.warnings, [READ_CODEX_SESSION_REDACTED_WARNING]);

    const redactedPartial = sampleMessage(
      "[REDACTED_SECRET]\n...[message truncated]",
      { redacted: true, truncated: true }
    );
    const both = createReadCodexSessionSuccess(sampleData(root, {
      messages: [redactedPartial],
      truncation_reason: "byte_limit"
    }));
    assert.deepEqual(both.meta.warnings, [
      READ_CODEX_SESSION_TRUNCATED_WARNING,
      READ_CODEX_SESSION_REDACTED_WARNING
    ]);

    for (const code of ERROR_CODES) {
      const details = expectedFailureDetails(code);
      const failure = createReadCodexSessionFailure({ code, details }, 3);
      assert.equal(failure.error.message, READ_CODEX_SESSION_ERROR_MESSAGES[code]);
      assert.equal(failure.error.retryable, code === "SESSION_READ_FAILED");
      assert.deepEqual(failure.meta.warnings, []);
    }
  });
});

test("read_codex_session schema rejects selector path message byte secret and truncation drift", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof createReadCodexSessionSuccess, "function");
    const mutations = [
      (data) => { data.roots.pop(); },
      (data) => { data.requested_session_id = SESSION_B; },
      (data) => { data.selection = "source_path"; },
      (data) => { data.session.source_path = path.join(root, "outside.jsonl"); },
      (data) => { data.messages[0].ordinal = 2; },
      (data) => { data.messages[0].bytes += 1; },
      (data) => { data.messages[0].content = "bad\u0000control"; },
      (data) => { data.messages[0].content = "sk-" + "x".repeat(20); },
      (data) => { data.content_bytes += 1; },
      (data) => { data.redacted_message_count += 1; },
      (data) => { data.truncated = true; },
      (data) => { data.output_limited = true; },
      (data) => { data.extra = true; }
    ];
    for (const mutate of mutations) {
      const data = structuredClone(sampleData(root));
      mutate(data);
      assert.throws(() => createReadCodexSessionSuccess(data));
    }
  });
});

test("read_codex_session hardening rejects message timestamps outside the JavaScript Date range", async () => {
  await withTempWorkspace(async (root) => {
    const message = sampleMessage("future", { timestamp: 8_640_000_000_000_001 });
    assert.throws(() => createReadCodexSessionSuccess(sampleData(root, {
      messages: [message]
    })));
  });
});

test("read_codex_session hardening requires the fixed marker on a partial message", async () => {
  await withTempWorkspace(async (root) => {
    const message = sampleMessage("unmarked partial", { truncated: true });
    assert.throws(() => createReadCodexSessionSuccess(sampleData(root, {
      messages: [message],
      truncation_reason: "byte_limit"
    })));
  });
});

test("read_codex_session remains read-opt-in across tool modes and advertises the exact contract", async () => {
  await withTempWorkspace(async (root) => {
    for (const codexSessions of ["off", "metadata", "read"]) {
      for (const toolMode of ["minimal", "standard", "full"]) {
        await withConfigClient(createTestConfig(root, { codexSessions, toolMode }), {}, async (client) => {
          const listed = await client.listTools();
          const descriptor = listed.tools.find((tool) => tool.name === "read_codex_session");
          assert.equal(Boolean(descriptor), codexSessions === "read", codexSessions + "/" + toolMode);
          if (!descriptor) return;
          assert.equal(descriptor.inputSchema.properties.session_id.maxLength, 128);
          assert.equal(descriptor.inputSchema.properties.source_path.maxLength, 4096);
          assert.equal(descriptor.inputSchema.properties.max_messages.minimum, 1);
          assert.equal(descriptor.inputSchema.properties.max_messages.maximum, 400);
          assert.equal(descriptor.inputSchema.properties.max_total_bytes.minimum, 4000);
          assert.equal(descriptor.inputSchema.properties.max_total_bytes.maximum, 400000);
          assert.deepEqual(descriptor.outputSchema.required.sort(), [
            "codexgpt_title", "codexgpt_tool", "data", "error", "meta", "ok"
          ]);
          assert.equal(descriptor._meta?.["codexgpt/preserveStructuredContent"], true);
          assert.equal(descriptor.annotations?.readOnlyHint, true);
        });
      }
    }
  });
});

test("readCodexSession returns exact safe snapshot facts and ordered event kinds", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const sourcePath = await writeSession(config.codexDir, {
      events: [
        responseItem({ type: "message", role: "user", content: "First" }),
        responseItem({ type: "function_call", name: "bash", arguments: "hidden" }),
        responseItem({ type: "function_call_output", output: "Done" }),
        responseItem({ type: "reasoning", summary: "ignored" })
      ]
    });
    const stat = await fs.stat(sourcePath);
    const result = await readCodexSession(config, {
      sessionId: SESSION_A,
      maxMessages: 10,
      maxTotalBytes: 8000
    });
    assert.equal(result.selection, "session_id");
    assert.equal(result.source_file_bytes, stat.size);
    assert.equal(result.max_source_file_bytes, MAX_SOURCE_BYTES);
    assert.deepEqual(result.messages.map((message) => message.kind), [
      "message", "function_call", "function_call_output"
    ]);
    assert.deepEqual(result.messages.map((message) => message.ordinal), [1, 2, 3]);
    assert.equal(result.messages[1].content, "[Tool: bash]");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "text"), false);
  });
});

test("read_codex_session returns exact request failures before invoking its Provider", async () => {
  await withTempWorkspace(async (root) => {
    let calls = 0;
    await withConfigClient(createTestConfig(root), {
      readCodexSessionProvider: async () => {
        calls += 1;
        throw new Error("must not run");
      }
    }, async (client) => {
      assertFailure(await callTool(client, "read_codex_session", {}), "REQUEST_INVALID", {
        reason: "selector_required"
      });
      assertFailure(await callTool(client, "read_codex_session", {
        session_id: SESSION_A.toUpperCase()
      }), "REQUEST_INVALID", { reason: "session_id_invalid" });
      assertFailure(await callTool(client, "read_codex_session", {
        source_path: "relative/session.jsonl"
      }), "REQUEST_INVALID", { reason: "source_path_invalid" });
      assert.equal(calls, 0);
    });
  });
});

test("read_codex_session normalizes id path and combined selectors exactly once", async () => {
  await withTempWorkspace(async (root) => {
    const base = sampleData(root);
    const seen = [];
    await withConfigClient(createTestConfig(root), {
      readCodexSessionProvider: async ({ request }) => {
        seen.push(structuredClone(request));
        const selection = request.selection;
        const data = sampleData(root, {
          selection,
          requested_session_id: request.sessionId ?? null,
          requested_source_path: request.sourcePath ?? null,
          session: sampleSession(root, { source_path: request.sourcePath ?? base.session.source_path }),
          max_messages: request.maxMessages,
          max_total_bytes: request.maxTotalBytes
        });
        return publicToProvider(data);
      }
    }, async (client) => {
      const calls = [
        { args: { session_id: SESSION_A }, selection: "session_id" },
        { args: { source_path: base.session.source_path }, selection: "source_path" },
        { args: { session_id: SESSION_A, source_path: base.session.source_path }, selection: "both" }
      ];
      for (const item of calls) {
        const parsed = parseResult(await callTool(client, "read_codex_session", item.args));
        assert.equal(parsed.data.selection, item.selection);
        assert.equal(parsed.data.max_messages, 80);
        assert.equal(parsed.data.max_total_bytes, 80_000);
      }
    });
    assert.deepEqual(seen.map((request) => request.selection), ["session_id", "source_path", "both"]);
  });
});

test("readCodexSession distinguishes confirmed absence from incomplete bounded id resolution", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await assert.rejects(
      readCodexSession(config, { sessionId: SESSION_A }),
      (error) => error?.code === "SESSION_NOT_FOUND" && error?.details?.selector === "session_id"
    );

    const first = "00000000-0000-4000-8000-000000000001";
    const omitted = "00000000-0000-4000-8000-000000000002";
    await writeSession(config.codexDir, { id: first, fileName: "a-" + first + ".jsonl" });
    await writeSession(config.codexDir, { id: omitted, fileName: "b-" + omitted + ".jsonl" });
    await assert.rejects(
      readCodexSession(config, {
        sessionId: omitted,
        scanFileLimit: 1,
        maxMessages: 10,
        maxTotalBytes: 8000
      }),
      (error) => error?.code === "SESSION_RESOLUTION_INCOMPLETE"
    );
  });
});

test("readCodexSession rejects path escape symlink escape and selector mismatch with typed failures", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const sourcePath = await writeSession(config.codexDir);
    await assert.rejects(
      readCodexSession(config, { sessionId: SESSION_B, sourcePath }),
      (error) => error?.code === "SESSION_ID_MISMATCH"
    );

    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "read-codex-outside-"));
    try {
      const outside = await writeSession(path.join(outsideDir, "history"));
      await assert.rejects(
        readCodexSession(config, { sourcePath: outside }),
        (error) => error?.code === "SOURCE_PATH_OUTSIDE_ROOTS"
      );

      const activeRoot = historyRoots(config.codexDir)[0];
      await fs.mkdir(activeRoot, { recursive: true });
      const link = path.join(activeRoot, "escape");
      await fs.symlink(path.dirname(outside), link, process.platform === "win32" ? "junction" : "dir");
      const escaped = path.join(link, path.basename(outside));
      await assert.rejects(
        readCodexSession(config, { sourcePath: escaped }),
        (error) => error?.code === "SOURCE_PATH_OUTSIDE_ROOTS"
      );
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

test("readCodexSession exposes the fixed source ceiling and rejects an oversized snapshot", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const sourcePath = await writeSession(config.codexDir);
    await fs.truncate(sourcePath, MAX_SOURCE_BYTES + 1);
    assert.equal(CODEX_SESSION_READ_FILE_LIMIT, MAX_SOURCE_BYTES);
    await assert.rejects(
      readCodexSession(config, { sourcePath }),
      (error) => error?.code === "SESSION_FILE_TOO_LARGE" &&
        error?.details?.max_source_file_bytes === MAX_SOURCE_BYTES
    );
  });
});

test("readCodexSession normalizes roles and controls and redacts before byte accounting", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const secret = "sk-" + "x".repeat(20);
    await writeSession(config.codexDir, {
      events: [
        responseItem({ type: "message", role: "rogue\nrole", content: "hello\u0000world " + secret }),
        responseItem({ type: "function_call", name: "bash\u0000bad" }),
        responseItem({ type: "function_call_output", output: "done\u007fnow" })
      ]
    });
    const result = await readCodexSession(config, {
      sessionId: SESSION_A,
      maxMessages: 10,
      maxTotalBytes: 8000
    });
    assert.deepEqual(result.messages.map((message) => message.role), ["unknown", "assistant", "tool"]);
    assert.equal(result.messages[0].content, "hello world [REDACTED_SECRET]");
    assert.equal(result.messages[1].content, "[Tool: bash bad]");
    assert.equal(result.messages[2].content, "done now");
    assert.equal(result.messages[0].redacted, true);
    assert.equal(result.redacted_message_count, 1);
    assert.equal(result.content_bytes, result.messages.reduce((sum, message) => sum + message.bytes, 0));
    assert.equal(JSON.stringify(result).includes(secret), false);
  });
});

test("readCodexSession returns a Unicode-safe marked final prefix inside the byte budget", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, {
      events: [responseItem({ type: "message", role: "user", content: "🙂".repeat(2000) })]
    });
    const result = await readCodexSession(config, {
      sessionId: SESSION_A,
      maxMessages: 10,
      maxTotalBytes: 4000
    });
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].truncated, true);
    assert.match(result.messages[0].content, /\.\.\.\[message truncated\]$/);
    assert.ok(result.messages[0].bytes <= 4000);
    assert.equal(result.content_bytes, result.messages[0].bytes);
    assert.equal(result.truncation_reason, "byte_limit");
    assert.equal(result.truncated_message_count, 1);
  });
});

test("readCodexSession distinguishes exact-limit EOF from omitted message and byte content", async () => {
  await withTempWorkspace(async (root) => {
    const exactConfig = createTestConfig(path.join(root, "exact"));
    await fs.mkdir(exactConfig.defaultRoot, { recursive: true });
    await writeSession(exactConfig.codexDir, {
      events: [responseItem({ type: "message", role: "user", content: "a".repeat(4000) })]
    });
    const exact = await readCodexSession(exactConfig, {
      sessionId: SESSION_A,
      maxMessages: 1,
      maxTotalBytes: 4000
    });
    assert.equal(exact.truncation_reason, null);
    assert.equal(exact.content_bytes, 4000);

    const limitedConfig = createTestConfig(path.join(root, "limited"));
    await fs.mkdir(limitedConfig.defaultRoot, { recursive: true });
    await writeSession(limitedConfig.codexDir, {
      events: [
        responseItem({ type: "message", role: "user", content: "first" }),
        responseItem({ type: "message", role: "assistant", content: "second" })
      ]
    });
    const limited = await readCodexSession(limitedConfig, {
      sessionId: SESSION_A,
      maxMessages: 1,
      maxTotalBytes: 4000
    });
    assert.equal(limited.messages.length, 1);
    assert.equal(limited.truncation_reason, "message_limit");
    assert.equal(limited.messages[0].truncated, false);
  });
});

test("readCodexSession hardening rejects conflicting session identity in the opened snapshot", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    const sourcePath = await writeSession(config.codexDir, {
      events: [
        {
          timestamp: "2026-07-13T09:59:30.000Z",
          type: "session_meta",
          payload: { id: SESSION_B, cwd: root }
        },
        responseItem({ type: "message", role: "user", content: "must not cross identity" })
      ]
    });
    await assert.rejects(
      readCodexSession(config, { sourcePath }),
      (error) => error?.code === "SESSION_READ_FAILED"
    );
  });
});

test("read_codex_session maps typed Provider failures and rejects malformed Provider drift", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof CodexSessionReadOperationError, "function");
    const config = createTestConfig(root);
    const typedCases = [
      ["SESSION_NOT_FOUND", { selector: "session_id" }],
      ["SESSION_RESOLUTION_INCOMPLETE", { selector: "session_id" }],
      ["SOURCE_PATH_OUTSIDE_ROOTS", {}],
      ["SESSION_ID_MISMATCH", {}],
      ["SESSION_FILE_TOO_LARGE", { max_source_file_bytes: MAX_SOURCE_BYTES }],
      ["SESSION_READ_FAILED", {}]
    ];
    for (const [code, details] of typedCases) {
      await withConfigClient(config, {
        readCodexSessionProvider: async () => {
          throw new CodexSessionReadOperationError(code, details);
        }
      }, async (client) => {
        assertFailure(await callTool(client, "read_codex_session", {
          session_id: SESSION_A
        }), code, details);
      });
    }

    await withConfigClient(config, {
      readCodexSessionProvider: async () => {
        throw new Error("private path and secret must not escape");
      }
    }, async (client) => {
      const result = await callTool(client, "read_codex_session", { session_id: SESSION_A });
      assertFailure(result, "SESSION_READ_FAILED", {});
      assert.doesNotMatch(resultText(result), /private path|secret must not escape/);
    });

    const base = publicToProvider(sampleData(root));
    const mutations = [
      (value) => { value.codex_dir = path.join(root, "other"); },
      (value) => { value.requested_session_id = SESSION_B; },
      (value) => { value.messages[0].bytes += 1; },
      (value) => { value.messages[0].content = "sk-" + "y".repeat(20); },
      (value) => { value.extra = true; }
    ];
    for (const mutate of mutations) {
      const provider = structuredClone(base);
      mutate(provider);
      await withConfigClient(config, {
        readCodexSessionProvider: async () => provider
      }, async (client) => {
        assertFailure(await callTool(client, "read_codex_session", {
          session_id: SESSION_A
        }), "INTERNAL_ERROR", {});
      });
    }
  });
});

test("read_codex_session hardening fails closed before generic redaction can rewrite session identity", async () => {
  await withTempWorkspace(async (root) => {
    const provider = publicToProvider(sampleData(root));
    provider.session.title = "sk-" + "z".repeat(20);
    await withConfigClient(createTestConfig(root), {
      readCodexSessionProvider: async () => provider
    }, async (client) => {
      assertFailure(await callTool(client, "read_codex_session", {
        session_id: SESSION_A
      }), "INTERNAL_ERROR", {});
    });
  });
});

test("read_codex_session human text and Tool Card use bounded nested transcript consumers", async () => {
  await withTempWorkspace(async (root) => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      sampleMessage("Message " + String(index + 1) + " " + "x".repeat(700), {
        ordinal: index + 1,
        role: index % 2 ? "assistant" : "user"
      })
    );
    const data = sampleData(root, { messages, max_messages: 12 });
    await withConfigClient(createTestConfig(root), {
      readCodexSessionProvider: async () => publicToProvider(data)
    }, async (client) => {
      const result = await callTool(client, "read_codex_session", { session_id: SESSION_A, max_messages: 12 });
      const parsed = parseResult(result);
      assert.equal(parsed.data.messages.length, 12);
      assert.match(resultText(result), /Returned messages: 12/);
    });
  });

  const helper = toolCardWidgetHtml.match(
    /function readCodexSessionResultData\(data\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  const renderer = toolCardWidgetHtml.match(
    /function renderReadCodexSession\(data\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  assert.match(toolCardWidgetHtml, /read_codex_session: "Codex transcript"/);
  assert.match(helper, /data\?\.codexgpt_tool === "read_codex_session"/);
  assert.match(helper, /return nested \? data\.data : \{\}/);
  assert.match(renderer, /messages\.slice\(0, 8\)/);
  assert.match(renderer, /truncate\([^,]+, 600\)/);
  assert.match(toolCardWidgetHtml, /renderReadCodexSession\(data\)/);
});

test("read_codex_session nests Slice 25 source-path adjacency without protected-source edits", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, { title: "Readable by nested source path" });
    await withConfigClient(config, {}, async (client) => {
      const listedRaw = await callTool(client, "codex_sessions", { max_sessions: 1 });
      const listed = listedRaw.structuredContent.data;
      const sourcePath = listed.sessions[0].source_path;
      const read = parseResult(await callTool(client, "read_codex_session", {
        source_path: sourcePath,
        max_messages: 10
      }));
      assert.equal(read.data.session.session_id, SESSION_A);
      assert.equal(read.data.message_count, 1);
      assert.equal(read.data.requested_source_path, sourcePath);
    });
  });

  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const compat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  assert.equal(countOccurrences(protectedMain, "read_codex_session"), 9);
  assert.equal(countOccurrences(protectedHttp, "read_codex_session"), 0);
  assert.equal(countOccurrences(compat, "read_codex_session"), 0);
  assert.equal(countOccurrences(protectedMain, ".structuredContent.session."), 0);
  assert.equal(countOccurrences(protectedMain, ".structuredContent.message_count"), 0);
});

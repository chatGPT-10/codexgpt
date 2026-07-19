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
const sessionModule = await tsImport("../src/codexSessions.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/codexSessions.ts", import.meta.url).catch(() => null);

const {
  CODEX_SESSION_SCAN_DEPTH_LIMIT,
  CODEX_SESSION_SCAN_FILE_LIMIT,
  listCodexSessions
} = sessionModule;

const {
  CODEX_SESSIONS_DISCOVERY_TRUNCATED_WARNING,
  CODEX_SESSIONS_ERROR_MESSAGES,
  CODEX_SESSIONS_RESULTS_TRUNCATED_WARNING,
  codexSessionsOutputSchema,
  createCodexSessionsFailure,
  createCodexSessionsSuccess
} = schemaModule ?? {};

const DATA_KEYS = [
  "codex_dir",
  "codex_sessions_mode",
  "discovery_truncated",
  "duplicate_file_count",
  "excluded_file_count",
  "indexed_session_count",
  "max_sessions",
  "output_limited",
  "query",
  "results_truncated",
  "roots",
  "scan_depth_limit",
  "scan_file_limit",
  "scanned_file_count",
  "session_count",
  "sessions",
  "tool_mode",
  "total_found"
];

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
];

const ERROR_CODES = ["SESSION_INDEX_FAILED", "INTERNAL_ERROR"];
const SESSION_A = "019cc369-bd7c-7891-b371-7b20b4fe0b18";
const SESSION_B = "019cc368-1111-7222-8333-123456789abc";
const SESSION_C = "019cc367-aaaa-7333-8444-123456789def";
const SESSION_D = "019cc366-bbbb-7444-8555-123456789aaa";

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
    codexSessions: "metadata",
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
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sessions-contract-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "codex-sessions-contract-test", version: "0.0.0" });
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

function canonicalId(index) {
  return "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
}

function sampleSession(root, id = SESSION_A, overrides = {}) {
  const codexDir = path.join(root, "codex-history");
  const storage = overrides.storage ?? "active";
  const sourceRoot = storage === "active"
    ? historyRoots(codexDir)[0]
    : historyRoots(codexDir)[1];
  return {
    provider_id: "codex",
    session_id: id,
    storage,
    title: "Session " + id.slice(-4),
    project_dir: root,
    created_at: 1_783_936_800_000,
    last_active_at: 1_783_937_100_000,
    source_path: path.join(sourceRoot, "rollout-" + id + ".jsonl"),
    resume_command: "codex resume " + id,
    ...overrides
  };
}

function sampleData(root, sessions = [sampleSession(root)], overrides = {}) {
  const codexDir = path.join(root, "codex-history");
  const indexedCount = overrides.indexed_session_count ?? sessions.length;
  const excludedCount = overrides.excluded_file_count ?? 0;
  const duplicateCount = overrides.duplicate_file_count ?? 0;
  const totalFound = overrides.total_found ?? sessions.length;
  const sessionCount = overrides.session_count ?? sessions.length;
  const discoveryTruncated = overrides.discovery_truncated ?? false;
  const resultsTruncated = overrides.results_truncated ?? totalFound > sessionCount;
  return {
    codex_dir: codexDir,
    roots: historyRoots(codexDir),
    codex_sessions_mode: "metadata",
    tool_mode: "standard",
    query: null,
    max_sessions: 30,
    scan_file_limit: 3000,
    scan_depth_limit: 6,
    scanned_file_count: overrides.scanned_file_count ??
      indexedCount + excludedCount + duplicateCount,
    indexed_session_count: indexedCount,
    excluded_file_count: excludedCount,
    duplicate_file_count: duplicateCount,
    sessions,
    session_count: sessionCount,
    total_found: totalFound,
    discovery_truncated: discoveryTruncated,
    results_truncated: resultsTruncated,
    output_limited: overrides.output_limited ??
      (discoveryTruncated || resultsTruncated),
    ...overrides
  };
}

function publicToProvider(data) {
  return {
    codex_dir: data.codex_dir,
    roots: data.roots,
    scan_file_limit: data.scan_file_limit,
    scan_depth_limit: data.scan_depth_limit,
    scanned_file_count: data.scanned_file_count,
    indexed_session_count: data.indexed_session_count,
    excluded_file_count: data.excluded_file_count,
    duplicate_file_count: data.duplicate_file_count,
    sessions: data.sessions,
    total_found: data.total_found,
    discovery_truncated: data.discovery_truncated
  };
}

function parseResult(result) {
  assert.equal(typeof codexSessionsOutputSchema?.parse, "function");
  return codexSessionsOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: CODEX_SESSIONS_ERROR_MESSAGES[code],
    retryable: false,
    details: {}
  });
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp("Code: " + code));
  return parsed;
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
  const fileName = options.fileName ?? "rollout-" + id + ".jsonl";
  const sourcePath = path.join(directory, fileName);
  const payloadId = Object.prototype.hasOwnProperty.call(options, "payloadId")
    ? options.payloadId
    : id;
  const timestamp = options.timestamp ?? "2026-07-13T10:00:00.000Z";
  const payload = {
    id: payloadId,
    cwd: options.cwd ?? path.dirname(codexDir),
    ...(options.source ? { source: options.source } : {})
  };
  const lines = [
    JSON.stringify({ timestamp, type: "session_meta", payload }),
    ...(!options.omitUserMessage
      ? [JSON.stringify({
          timestamp: options.messageTimestamp ?? timestamp,
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: options.title ?? "Session " + id
          }
        })]
      : []),
    ...(options.middleLines ?? []),
    ...(options.tailTitle
      ? [JSON.stringify({
          timestamp: options.tailTimestamp ?? "2026-07-13T10:01:00.000Z",
          type: "response_item",
          payload: { type: "message", role: "assistant", content: options.tailTitle }
        })]
      : [])
  ];
  await fs.writeFile(sourcePath, lines.join("\n") + "\n", "utf8");
  return sourcePath;
}

test("codex_sessions schema exports the exact envelope and eighteen-field success", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof createCodexSessionsSuccess, "function");
    assert.equal(typeof createCodexSessionsFailure, "function");
    assert.equal(typeof codexSessionsOutputSchema?.parse, "function");

    const success = createCodexSessionsSuccess(sampleData(root), 7);
    assert.deepEqual(Object.keys(success).sort(), [
      "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
    ]);
    assert.equal(success.codexpro_tool, "codex_sessions");
    assert.equal(success.codexpro_title, "Codex Sessions");
    assert.equal(success.ok, true);
    assert.equal(success.error, null);
    assert.deepEqual(Object.keys(success.data).sort(), DATA_KEYS);
    assert.deepEqual(Object.keys(success.data.sessions[0]).sort(), SESSION_KEYS);
    assert.deepEqual(success.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
  });
});

test("codex_sessions schema derives both warnings and both fixed safe failures", async () => {
  await withTempWorkspace(async (root) => {
    assert.deepEqual(Object.keys(CODEX_SESSIONS_ERROR_MESSAGES ?? {}).sort(), ERROR_CODES.sort());

    const discovery = createCodexSessionsSuccess(sampleData(root, [sampleSession(root)], {
      discovery_truncated: true,
      output_limited: true
    }));
    assert.deepEqual(discovery.meta.warnings, [CODEX_SESSIONS_DISCOVERY_TRUNCATED_WARNING]);

    const limited = createCodexSessionsSuccess(sampleData(root, [sampleSession(root)], {
      max_sessions: 1,
      indexed_session_count: 2,
      scanned_file_count: 2,
      total_found: 2,
      results_truncated: true,
      output_limited: true
    }));
    assert.deepEqual(limited.meta.warnings, [CODEX_SESSIONS_RESULTS_TRUNCATED_WARNING]);

    const both = createCodexSessionsSuccess(sampleData(root, [sampleSession(root)], {
      max_sessions: 1,
      indexed_session_count: 2,
      scanned_file_count: 2,
      total_found: 2,
      discovery_truncated: true,
      results_truncated: true,
      output_limited: true
    }));
    assert.deepEqual(both.meta.warnings, [
      CODEX_SESSIONS_DISCOVERY_TRUNCATED_WARNING,
      CODEX_SESSIONS_RESULTS_TRUNCATED_WARNING
    ]);

    for (const code of ERROR_CODES) {
      const failure = createCodexSessionsFailure({ code, details: {} }, 3);
      assert.equal(failure.ok, false);
      assert.equal(failure.error.message, CODEX_SESSIONS_ERROR_MESSAGES[code]);
      assert.deepEqual(failure.meta.warnings, []);
    }
  });
});

test("codex_sessions schema rejects path, identity, command, order, count, and completeness drift", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof createCodexSessionsSuccess, "function");
    assert.equal(typeof codexSessionsOutputSchema?.parse, "function");
    const newer = sampleSession(root, SESSION_A, { last_active_at: 200 });
    const older = sampleSession(root, SESSION_B, { last_active_at: 100 });
    const mutations = [
      (data) => { data.roots.pop(); },
      (data) => { data.sessions[0].session_id = "bad; whoami"; },
      (data) => { data.sessions[0].resume_command = "codex resume safe && whoami"; },
      (data) => { data.sessions[0].storage = "archived"; },
      (data) => { data.sessions[0].source_path = path.join(root, "outside.jsonl"); },
      (data) => { data.sessions[0].summary = "must not cross"; },
      (data) => { data.session_count += 1; },
      (data) => { data.scanned_file_count += 1; },
      (data) => { data.results_truncated = true; },
      (data) => { data.output_limited = true; }
    ];
    for (const mutate of mutations) {
      const data = structuredClone(sampleData(root));
      mutate(data);
      assert.throws(() => createCodexSessionsSuccess(data));
    }

    assert.throws(() => createCodexSessionsSuccess(sampleData(root, [older, newer], {
      indexed_session_count: 2,
      scanned_file_count: 2,
      total_found: 2,
      session_count: 2
    })));
    assert.throws(() => codexSessionsOutputSchema.parse({
      ...createCodexSessionsSuccess(sampleData(root)),
      sessions: []
    }));
  });
});

test("codex_sessions visibility remains opt-in across tool modes and advertises the exact contract", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      ["off", "minimal", false, false],
      ["metadata", "minimal", true, false],
      ["metadata", "standard", true, false],
      ["metadata", "full", true, false],
      ["read", "minimal", true, true],
      ["read", "standard", true, true],
      ["read", "full", true, true]
    ];
    for (const [codexSessions, toolMode, expectList, expectRead] of cases) {
      await withConfigClient(createTestConfig(root, { codexSessions, toolMode }), {}, async (client) => {
        const listed = await client.listTools();
        const descriptor = listed.tools.find((tool) => tool.name === "codex_sessions");
        const readDescriptor = listed.tools.find((tool) => tool.name === "read_codex_session");
        assert.equal(Boolean(descriptor), expectList, codexSessions + "/" + toolMode);
        assert.equal(Boolean(readDescriptor), expectRead, codexSessions + "/" + toolMode);
        if (!descriptor) return;

        assert.equal(descriptor.inputSchema.properties.max_sessions.minimum, 1);
        assert.equal(descriptor.inputSchema.properties.max_sessions.maximum, 200);
        assert.equal(descriptor.inputSchema.properties.query.maxLength, 500);
        assert.deepEqual(descriptor.outputSchema.required, [
          "codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"
        ]);
        const advertisedData = descriptor.outputSchema.properties.data.anyOf.find(
          (candidate) => candidate.type === "object"
        );
        assert.deepEqual(Object.keys(advertisedData.properties).sort(), DATA_KEYS);
        assert.equal(descriptor.annotations.readOnlyHint, true);
        assert.equal(descriptor.annotations.openWorldHint, false);
      });
    }
  });
});

test("listCodexSessions safely indexes, orders, de-duplicates, and accounts for candidate files", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(CODEX_SESSION_SCAN_FILE_LIMIT, 3000);
    assert.equal(CODEX_SESSION_SCAN_DEPTH_LIMIT, 6);
    const config = createTestConfig(root);
    const codexDir = config.codexDir;

    await writeSession(codexDir, {
      id: SESSION_A,
      timestamp: "2026-07-13T10:00:00.000Z",
      title: "Active A"
    });
    await writeSession(codexDir, {
      id: SESSION_A,
      storage: "archived",
      timestamp: "2026-07-13T09:00:00.000Z",
      title: "Archived duplicate A"
    });
    await writeSession(codexDir, {
      id: SESSION_B,
      timestamp: "2026-07-13T11:00:00.000Z",
      title: "Newest B"
    });
    await writeSession(codexDir, {
      id: "unsafe",
      fileName: "unsafe.jsonl",
      payloadId: "bad; whoami",
      timestamp: "2026-07-13T12:00:00.000Z"
    });
    await writeSession(codexDir, {
      id: SESSION_C,
      payloadId: "bad && calc",
      timestamp: "2026-07-13T08:00:00.000Z",
      title: "Filename fallback C"
    });
    await writeSession(codexDir, {
      id: SESSION_D,
      source: { subagent: "reviewer" },
      timestamp: "2026-07-13T13:00:00.000Z"
    });

    const result = await listCodexSessions(config, { maxSessions: 30 });
    assert.equal(result.scan_file_limit, 3000);
    assert.equal(result.scan_depth_limit, 6);
    assert.equal(result.scanned_file_count, 6);
    assert.equal(result.indexed_session_count, 3);
    assert.equal(result.excluded_file_count, 2);
    assert.equal(result.duplicate_file_count, 1);
    assert.equal(result.total_found, 3);
    assert.equal(result.discovery_truncated, false);
    assert.deepEqual(result.sessions.map((item) => item.session_id), [
      SESSION_B, SESSION_A, SESSION_C
    ]);
    assert.equal(result.sessions[1].storage, "active");
    assert.equal(result.sessions[2].resume_command, "codex resume " + SESSION_C);
    assert.doesNotMatch(JSON.stringify(result), /whoami|calc|reviewer/);
  });
});

test("listCodexSessions reports deliberate discovery limits instead of claiming completeness", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, { id: SESSION_A, fileName: "a-" + SESSION_A + ".jsonl" });
    await writeSession(config.codexDir, { id: SESSION_B, fileName: "b-" + SESSION_B + ".jsonl" });
    await writeSession(config.codexDir, { id: SESSION_C, fileName: "c-" + SESSION_C + ".jsonl" });

    const result = await listCodexSessions(config, {
      maxSessions: 30,
      scanFileLimit: 2,
      scanDepthLimit: 6
    });
    assert.equal(result.scan_file_limit, 2);
    assert.equal(result.scan_depth_limit, 6);
    assert.equal(result.scanned_file_count, 2);
    assert.equal(result.indexed_session_count, 2);
    assert.equal(result.discovery_truncated, true);
  });
});

test("listCodexSessions uses ordinal candidate order at the file limit", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, {
      id: SESSION_A,
      fileName: "Z-" + SESSION_A + ".jsonl"
    });
    await writeSession(config.codexDir, {
      id: SESSION_B,
      fileName: "a-" + SESSION_B + ".jsonl"
    });

    const result = await listCodexSessions(config, {
      maxSessions: 30,
      scanFileLimit: 1,
      scanDepthLimit: 6
    });
    assert.equal(result.discovery_truncated, true);
    assert.deepEqual(result.sessions.map((item) => item.session_id), [SESSION_A]);
  });
});

test("listCodexSessions marks an unusable configured root as incomplete", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await fs.mkdir(config.codexDir, { recursive: true });
    await fs.writeFile(path.join(config.codexDir, "sessions"), "not a directory", "utf8");

    const result = await listCodexSessions(config, { maxSessions: 30 });
    assert.equal(result.scanned_file_count, 0);
    assert.equal(result.discovery_truncated, true);
  });
});

test("listCodexSessions bounds project-basename fallback titles", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, {
      id: SESSION_A,
      cwd: path.join(root, "x".repeat(120)),
      omitUserMessage: true
    });

    const result = await listCodexSessions(config, { maxSessions: 30 });
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].title.length, 96);
    assert.match(result.sessions[0].title, /…$/);
  });
});

test("listCodexSessions sanitizes control characters in metadata titles", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root);
    await writeSession(config.codexDir, {
      id: SESSION_A,
      title: "Safe\u0000\u007fTitle"
    });

    const result = await listCodexSessions(config, { maxSessions: 30 });
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].title, "Safe Title");
  });
});

test("codex_sessions real handler returns nested metadata only with exact request facts", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root, { codexSessions: "read" });
    await writeSession(config.codexDir, {
      id: SESSION_A,
      title: "Visible metadata title",
      middleLines: [
        JSON.stringify({
          timestamp: "2026-07-13T10:00:30.000Z",
          type: "response_item",
          payload: { type: "function_call_output", output: "x".repeat(140_000) }
        })
      ],
      tailTitle: "Secret tail summary"
    });

    await withConfigClient(config, {}, async (client) => {
      const result = await callTool(client, "codex_sessions", { max_sessions: 5 });
      const parsed = parseResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.codex_sessions_mode, "read");
      assert.equal(parsed.data.tool_mode, "standard");
      assert.equal(parsed.data.max_sessions, 5);
      assert.equal(parsed.data.query, null);
      assert.equal(parsed.data.session_count, 1);
      assert.equal("sessions" in result.structuredContent, false);
      assert.deepEqual(Object.keys(parsed.data.sessions[0]).sort(), SESSION_KEYS);
      assert.doesNotMatch(JSON.stringify(parsed), /Secret tail summary/);

      const searched = parseResult(await callTool(client, "codex_sessions", {
        query: "Secret tail summary",
        max_sessions: 5
      }));
      assert.equal(searched.data.total_found, 0);
      assert.equal(searched.data.session_count, 0);
      assert.doesNotMatch(JSON.stringify(searched), /Secret tail summary.*Secret tail summary/);
    });
  });
});

test("codex_sessions normalizes its request once before the Provider boundary", async () => {
  await withTempWorkspace(async (root) => {
    let seen;
    const data = sampleData(root, [
      sampleSession(root, SESSION_A, { title: "Alpha Beta" })
    ], { query: "Alpha Beta", max_sessions: 7 });
    await withConfigClient(createTestConfig(root), {
      codexSessionsProvider: async (context) => {
        seen = context;
        return publicToProvider(data);
      }
    }, async (client) => {
      const result = parseResult(await callTool(client, "codex_sessions", {
        query: "  Alpha\n\tBeta  ",
        max_sessions: 7
      }));
      assert.equal(result.data.query, "Alpha Beta");
      assert.equal(result.data.max_sessions, 7);
      assert.deepEqual(seen.options, { maxSessions: 7, query: "Alpha Beta" });
      assert.equal(seen.config.codexDir, path.join(root, "codex-history"));
    });
  });
});

test("codex_sessions safely normalizes non-whitespace control characters in queries", async () => {
  await withTempWorkspace(async (root) => {
    let seen;
    const data = sampleData(root, [
      sampleSession(root, SESSION_A, { title: "Alpha Beta" })
    ], { query: "Alpha Beta", max_sessions: 7 });
    await withConfigClient(createTestConfig(root), {
      codexSessionsProvider: async (context) => {
        seen = context.options;
        return publicToProvider(data);
      }
    }, async (client) => {
      const result = parseResult(await callTool(client, "codex_sessions", {
        query: "Alpha\u0000\u007fBeta",
        max_sessions: 7
      }));
      assert.equal(result.ok, true);
      assert.equal(result.data.query, "Alpha Beta");
      assert.deepEqual(seen, { maxSessions: 7, query: "Alpha Beta" });
    });
  });
});

test("codex_sessions maps Provider exceptions to one stable redacted operational failure", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      codexSessionsProvider: async () => {
        throw new Error("C:\\secret\\history.jsonl access denied TOKEN=do-not-leak");
      }
    }, async (client) => {
      const result = await callTool(client, "codex_sessions", {});
      assertFailure(result, "SESSION_INDEX_FAILED");
      assert.doesNotMatch(JSON.stringify(result), /secret|TOKEN|access denied/i);
    });
  });
});

test("codex_sessions rejects malformed Provider identity, roots, sources, counts, order, and extra fields", async () => {
  await withTempWorkspace(async (root) => {
    const newer = sampleSession(root, SESSION_A, { last_active_at: 200 });
    const older = sampleSession(root, SESSION_B, { last_active_at: 100 });
    const mutations = [
      (provider) => { provider.codex_dir = path.join(root, "other-history"); },
      (provider) => { provider.roots.reverse(); },
      (provider) => { provider.sessions[0].source_path = path.join(root, "outside.jsonl"); },
      (provider) => { provider.scanned_file_count += 1; },
      (provider) => { provider.scan_file_limit = 2; },
      (provider) => { provider.sessions[0].summary = "tail summary"; },
      (provider) => {
        provider.sessions = [older, newer];
        provider.scanned_file_count = 2;
        provider.indexed_session_count = 2;
        provider.total_found = 2;
      }
    ];

    for (const mutate of mutations) {
      const data = sampleData(root);
      const provider = structuredClone(publicToProvider(data));
      mutate(provider);
      await withConfigClient(createTestConfig(root), {
        codexSessionsProvider: async () => provider
      }, async (client) => {
        assertFailure(await callTool(client, "codex_sessions", {}), "INTERNAL_ERROR");
      });
    }
  });
});

test("codex_sessions rejects path-equivalent but noncanonical Provider identity", async () => {
  await withTempWorkspace(async (root) => {
    const provider = publicToProvider(sampleData(root));
    provider.codex_dir += path.sep + ".";
    await withConfigClient(createTestConfig(root), {
      codexSessionsProvider: async () => provider
    }, async (client) => {
      assertFailure(await callTool(client, "codex_sessions", {}), "INTERNAL_ERROR");
    });
  });
});

test("codex_sessions human text stays bounded when structured data returns forty sessions", async () => {
  await withTempWorkspace(async (root) => {
    const sessions = Array.from({ length: 40 }, (_, index) =>
      sampleSession(root, canonicalId(index + 1), {
        title: "Session title " + String(index + 1).padStart(2, "0"),
        last_active_at: 1_000 - index,
        created_at: 1_000 - index
      })
    );
    const data = sampleData(root, sessions, {
      max_sessions: 40,
      indexed_session_count: 40,
      scanned_file_count: 40,
      total_found: 40,
      session_count: 40
    });
    await withConfigClient(createTestConfig(root), {
      codexSessionsProvider: async () => publicToProvider(data)
    }, async (client) => {
      const raw = await callTool(client, "codex_sessions", { max_sessions: 40 });
      const parsed = parseResult(raw);
      assert.equal(parsed.data.session_count, 40);
      assert.ok(countOccurrences(resultText(raw), "codex resume ") <= 30);
      assert.match(resultText(raw), /10 additional sessions are available in structured data/);
    });
  });
});

test("codex_sessions Tool Card is nested-only and bounds visible session rows", () => {
  const helper = toolCardWidgetHtml.match(
    /function codexSessionsResultData\(data\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  const renderer = toolCardWidgetHtml.match(
    /function renderCodexSessions\(data\) \{[\s\S]*?\n  \}/
  )?.[0] ?? "";
  assert.match(toolCardWidgetHtml, /codex_sessions: "Codex sessions"/);
  assert.match(helper, /data\?\.codexpro_tool === "codex_sessions"/);
  assert.match(helper, /return nested \? data\.data : \{\}/);
  assert.doesNotMatch(helper, /data \?\? \{\}/);
  assert.match(renderer, /sessions\.slice\(0, 12\)/);
  assert.match(renderer, /truncate\(/);
  assert.match(toolCardWidgetHtml, /tool === "codex_sessions"/);
  assert.match(toolCardWidgetHtml, /renderCodexSessions\(data\)/);
});

test("codex_sessions protected-Smoke consumers migrate only through exact in-memory substitutions", async () => {
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");
  const compat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");

  const defaultCodexDirSource = "const expectedDefaultCodexDir = path.join(os.homedir(), '.codex');";
  assert.equal(countOccurrences(protectedMain, defaultCodexDirSource), 1);
  assert.equal(countOccurrences(compat, defaultCodexDirSource), 1);
  assert.match(
    compat,
    /const lexicalDefaultCodexDir = path\.resolve\(os\.homedir\(\), '\.codex'\);/
  );
  assert.match(
    compat,
    /await fs\.realpath\(lexicalDefaultCodexDir\)\.catch\(\(\) => lexicalDefaultCodexDir\)/
  );

  const replacements = [
    [
      "metadataSessions.structuredContent.total_found",
      "metadataSessions.structuredContent.data?.total_found"
    ],
    [
      "codexSessions.structuredContent.sessions",
      "codexSessions.structuredContent.data?.sessions"
    ],
    [
      "topOneSessions.structuredContent.sessions",
      "topOneSessions.structuredContent.data?.sessions"
    ],
    [
      "largeTailSessions.structuredContent.total_found",
      "largeTailSessions.structuredContent.data?.total_found"
    ]
  ];
  for (const [oldText, newText] of replacements) {
    assert.equal(countOccurrences(protectedMain, oldText), 1);
    assert.equal(countOccurrences(compat, oldText), 1);
    assert.equal(countOccurrences(compat, newText), 1);
  }
  assert.match(
    compat,
    /JSON\.stringify\(metadataSessions\.structuredContent\.data\?\.sessions \?\? \[\]\)\.includes/
  );
  assert.match(
    compat,
    /JSON\.stringify\(largeTailSessions\.structuredContent\.data\?\.sessions \?\? \[\]\)\.includes/
  );
  assert.equal(countOccurrences(protectedHttp, "codex_sessions"), 0);
});

test("codex_sessions nested source_path remains compatible with the legacy bounded read tool", async () => {
  await withTempWorkspace(async (root) => {
    const config = createTestConfig(root, { codexSessions: "read" });
    await writeSession(config.codexDir, {
      id: SESSION_A,
      title: "Readable by source path"
    });
    await withConfigClient(config, {}, async (client) => {
      const listed = parseResult(await callTool(client, "codex_sessions", { max_sessions: 1 }));
      const sourcePath = listed.data.sessions[0].source_path;
      const read = await callTool(client, "read_codex_session", {
        source_path: sourcePath,
        max_messages: 10
      });
      assert.equal(read.structuredContent.data?.session.session_id, SESSION_A);
      assert.equal(read.structuredContent.data?.message_count, 1);
      assert.match(resultText(read), /Readable by source path/);
    });
  });
});

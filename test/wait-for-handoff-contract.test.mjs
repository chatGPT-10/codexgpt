import assert from "node:assert/strict";
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
const workspaceModule = await tsImport("../src/workspaceOps.ts", import.meta.url);
const schemaModule = await tsImport("../src/tools/schemas/waitForHandoff.ts", import.meta.url).catch(() => null);

const {
  readHandoffRunState,
  readWaitForHandoffArtifacts,
  waitForHandoffLimits
} = workspaceModule;

const {
  WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS,
  WAIT_FOR_HANDOFF_ARTIFACT_UNAVAILABLE_WARNING,
  WAIT_FOR_HANDOFF_DEADLINE_WARNING,
  WAIT_FOR_HANDOFF_ERROR_MESSAGES,
  WAIT_FOR_HANDOFF_LIMITED_WARNING,
  WAIT_FOR_HANDOFF_REDACTED_WARNING,
  createWaitForHandoffFailure,
  createWaitForHandoffSuccess,
  waitForHandoffOutputSchema
} = schemaModule ?? {};

const EXPECTED_DEFINITIONS = [
  ["agent-status.md", "status"],
  ["implementation-diff.patch", "diff"],
  ["execution-log.jsonl", "log"],
  ["loop-tests.txt", "tests"]
];

const DATA_KEYS = [
  "artifact_count",
  "artifact_paths",
  "artifacts",
  "awaited_completed",
  "awaited_terminal",
  "context_dir",
  "expected_plan_hash",
  "iteration_stale",
  "max_artifact_bytes",
  "max_state_bytes",
  "max_total_bytes",
  "max_wait_seconds",
  "next_poll_after_seconds",
  "output_limited",
  "plan_hash_mismatch",
  "poll_ms",
  "redacted",
  "requested_artifacts",
  "returned_bytes",
  "root",
  "run",
  "since_iteration",
  "state",
  "state_file",
  "state_present",
  "succeeded",
  "unavailable",
  "unavailable_count",
  "wait_outcome",
  "workspace_id"
];

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
  const client = new Client({ name: "wait-for-handoff-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "wait-for-handoff-contract-"));
  const root = await fs.realpath(created);
  try {
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

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
  return breaks + (/\r\n$|[\n\r]$/.test(text) ? 0 : 1);
}

function artifactPaths(contextDir = ".ai-bridge") {
  return {
    status: `${contextDir}/agent-status.md`,
    diff: `${contextDir}/implementation-diff.patch`,
    log: `${contextDir}/execution-log.jsonl`,
    tests: `${contextDir}/loop-tests.txt`
  };
}

function rawRun(overrides = {}) {
  const state = overrides.state ?? "completed";
  const terminal = state !== "running";
  return {
    version: 1,
    state,
    iteration: 2,
    plan_hash: "plan-a",
    started_at: "2026-07-13T10:00:00.000Z",
    finished_at: terminal ? "2026-07-13T10:00:01.000Z" : null,
    updated_at: "2026-07-13T10:00:01.000Z",
    executor: "codex",
    model: null,
    exit_code: state === "completed" ? 0 : state === "failed" ? 2 : null,
    timed_out: state === "timed_out",
    duration_ms: terminal ? 1_000 : null,
    ...overrides
  };
}

function publicRun(overrides = {}) {
  return { ...rawRun(), redacted: false, ...overrides };
}

function sampleArtifact(overrides = {}) {
  const text = overrides.text ?? "# Agent status\n\nDone.\n";
  return {
    path: artifactPaths().status,
    kind: "status",
    source_bytes: overrides.source_bytes ?? Buffer.byteLength(text, "utf8"),
    line_count: overrides.line_count ?? lineCount(text),
    returned_bytes: overrides.returned_bytes ?? Buffer.byteLength(text, "utf8"),
    truncated: false,
    redacted: false,
    text,
    ...overrides
  };
}

function sampleData(overrides = {}) {
  const run = overrides.run === undefined ? publicRun() : overrides.run;
  const requested = overrides.requested_artifacts ?? ["status"];
  const artifacts = overrides.artifacts ?? [sampleArtifact()];
  const unavailable = overrides.unavailable ?? [];
  const matched = overrides.wait_outcome !== "deadline";
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root: "D:\\Dev\\project",
    context_dir: ".ai-bridge",
    state_file: ".ai-bridge/handoff-run-state.json",
    artifact_paths: artifactPaths(),
    state_present: run !== null,
    state: matched ? run?.state ?? "unknown" : run ? "running" : "unknown",
    wait_outcome: matched ? "matched_terminal" : "deadline",
    awaited_terminal: matched,
    awaited_completed: matched && run?.state === "completed",
    succeeded: matched && run?.state === "completed",
    expected_plan_hash: null,
    since_iteration: null,
    plan_hash_mismatch: false,
    iteration_stale: false,
    max_wait_seconds: 20,
    poll_ms: 1_000,
    next_poll_after_seconds: matched ? null : 1,
    max_state_bytes: 64_000,
    max_artifact_bytes: 80_000,
    max_total_bytes: 40_000,
    run,
    requested_artifacts: requested,
    artifacts: matched ? artifacts : [],
    artifact_count: matched ? artifacts.length : 0,
    unavailable: matched ? unavailable : [],
    unavailable_count: matched ? unavailable.length : 0,
    returned_bytes: matched ? artifacts.reduce((sum, item) => sum + item.returned_bytes, 0) : 0,
    output_limited: matched && (
      artifacts.some((item) => item.truncated) ||
      unavailable.some((item) => item.reason === "too_large" || item.reason === "output_limit")
    ),
    redacted: Boolean(run?.redacted) || (matched && artifacts.some((item) => item.redacted)),
    ...overrides
  };
}

function stateProviderResult(run) {
  if (run === null) {
    return {
      stateFile: ".ai-bridge/handoff-run-state.json",
      present: false,
      bytes: null,
      text: null
    };
  }
  const text = JSON.stringify(run);
  return {
    stateFile: ".ai-bridge/handoff-run-state.json",
    present: true,
    bytes: Buffer.byteLength(text, "utf8"),
    text
  };
}

function rawArtifact(overrides = {}) {
  const text = overrides.text ?? "# Agent status\n\nDone.\n";
  return {
    path: artifactPaths().status,
    kind: "status",
    bytes: overrides.bytes ?? Buffer.byteLength(text, "utf8"),
    lineCount: overrides.lineCount ?? lineCount(text),
    text,
    ...overrides
  };
}

function artifactProviderResult(requestedKinds = ["status"], overrides = {}) {
  const artifacts = overrides.artifacts ?? [rawArtifact()];
  return {
    contextDir: ".ai-bridge",
    requestedKinds,
    artifacts,
    unavailable: overrides.unavailable ?? [],
    ...overrides
  };
}

function fakeClock(start = 0) {
  let current = start;
  const sleeps = [];
  return {
    now: () => current,
    sleep: async (ms) => {
      sleeps.push(ms);
      current += ms;
    },
    sleeps
  };
}

function parseResult(result) {
  assert.equal(typeof waitForHandoffOutputSchema?.parse, "function");
  return waitForHandoffOutputSchema.parse(result.structuredContent);
}

function assertFailure(result, code, details, retryable = false) {
  assert.equal(result.isError, true, JSON.stringify(result));
  const parsed = parseResult(result);
  assert.deepEqual(parsed, {
    codexpro_tool: "wait_for_handoff",
    codexpro_title: "Wait For Handoff",
    ok: false,
    data: null,
    error: {
      code,
      message: WAIT_FOR_HANDOFF_ERROR_MESSAGES[code],
      retryable,
      details
    },
    meta: {
      schemaVersion: 1,
      durationMs: parsed.meta.durationMs,
      warnings: []
    }
  });
  assert.ok(parsed.meta.durationMs >= 0);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  return parsed;
}

test("wait_for_handoff schema exports fixed definitions and exact matched and deadline successes", () => {
  assert.equal(typeof createWaitForHandoffSuccess, "function");
  assert.equal(typeof createWaitForHandoffFailure, "function");
  assert.equal(typeof waitForHandoffOutputSchema?.parse, "function");
  assert.deepEqual(
    WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS.map((item) => [item.name, item.kind]),
    EXPECTED_DEFINITIONS
  );

  const matched = createWaitForHandoffSuccess(sampleData(), 7);
  assert.deepEqual(Object.keys(matched).sort(), [
    "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
  ]);
  assert.equal(matched.codexpro_tool, "wait_for_handoff");
  assert.equal(matched.codexpro_title, "Wait For Handoff");
  assert.equal(matched.ok, true);
  assert.equal(matched.error, null);
  assert.deepEqual(Object.keys(matched.data).sort(), DATA_KEYS);
  assert.deepEqual(Object.keys(matched.data.run).sort(), [
    "duration_ms", "executor", "exit_code", "finished_at", "iteration", "model", "plan_hash",
    "redacted", "started_at", "state", "timed_out", "updated_at", "version"
  ]);
  assert.deepEqual(Object.keys(matched.data.artifacts[0]).sort(), [
    "kind", "line_count", "path", "redacted", "returned_bytes", "source_bytes", "text", "truncated"
  ]);
  assert.deepEqual(matched.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });

  const deadline = createWaitForHandoffSuccess(sampleData({
    run: null,
    wait_outcome: "deadline",
    requested_artifacts: ["status", "diff", "log", "tests"]
  }));
  assert.equal(deadline.data.state_present, false);
  assert.equal(deadline.data.state, "unknown");
  assert.equal(deadline.data.awaited_terminal, false);
  assert.equal(deadline.data.next_poll_after_seconds, 1);
  assert.deepEqual(deadline.data.artifacts, []);
  assert.deepEqual(deadline.meta.warnings, [WAIT_FOR_HANDOFF_DEADLINE_WARNING]);
});

test("wait_for_handoff schema derives exact warnings and creates all stable failures", () => {
  const redactedText = "OPENAI_API_KEY=[REDACTED_SECRET]\n";
  const artifact = sampleArtifact({
    text: redactedText,
    source_bytes: 80,
    line_count: 1,
    returned_bytes: Buffer.byteLength(redactedText),
    truncated: true,
    redacted: true
  });
  const unavailable = [{
    path: artifactPaths().diff,
    kind: "diff",
    reason: "blocked",
    bytes: null
  }];
  const warned = createWaitForHandoffSuccess(sampleData({
    requested_artifacts: ["status", "diff"],
    artifacts: [artifact],
    unavailable,
    unavailable_count: 1,
    output_limited: true,
    redacted: true
  }));
  assert.deepEqual(warned.meta.warnings, [
    WAIT_FOR_HANDOFF_ARTIFACT_UNAVAILABLE_WARNING,
    WAIT_FOR_HANDOFF_LIMITED_WARNING,
    WAIT_FOR_HANDOFF_REDACTED_WARNING
  ]);

  const cases = [
    ["WORKSPACE_NOT_FOUND", { source: "workspace_id", workspace_id: "missing-workspace" }, false],
    ["WORKSPACE_NOT_FOUND", { source: "default_workspace", workspace_id: null }, false],
    ["HANDOFF_STATE_READ_FAILED", { context_dir: ".ai-bridge", state_file: ".ai-bridge/handoff-run-state.json" }, false],
    ["HANDOFF_STATE_INVALID", { state_file: ".ai-bridge/handoff-run-state.json" }, true],
    ["HANDOFF_ARTIFACT_READ_FAILED", { context_dir: ".ai-bridge" }, false],
    ["INTERNAL_ERROR", {}, false]
  ];
  for (const [code, details, retryable] of cases) {
    const failure = createWaitForHandoffFailure({ code, details }, 9);
    assert.equal(failure.error.message, WAIT_FOR_HANDOFF_ERROR_MESSAGES[code]);
    assert.equal(failure.error.retryable, retryable);
    assert.deepEqual(failure.error.details, details);
    assert.deepEqual(failure.meta, { schemaVersion: 1, durationMs: 9, warnings: [] });
  }
});

test("wait_for_handoff schema rejects flat unsafe inconsistent lifecycle match coverage and byte drift", () => {
  const success = createWaitForHandoffSuccess(sampleData());
  const failure = createWaitForHandoffFailure({ code: "INTERNAL_ERROR", details: {} });
  const expectDataFailure = (mutate) => {
    const candidate = structuredClone(success);
    mutate(candidate.data, candidate);
    assert.throws(() => waitForHandoffOutputSchema.parse(candidate));
  };

  assert.throws(() => waitForHandoffOutputSchema.parse({ ...success, state: "completed" }));
  assert.throws(() => waitForHandoffOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() => waitForHandoffOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => waitForHandoffOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => waitForHandoffOutputSchema.parse({ ...failure, data: success.data }));
  expectDataFailure((data) => { data.extra = true; });
  expectDataFailure((data) => { data.state_file = "../private.json"; });
  expectDataFailure((data) => { data.artifact_paths.status = ".ai-bridge/private.txt"; });
  expectDataFailure((data) => { data.state_present = false; });
  expectDataFailure((data) => { data.state = "running"; });
  expectDataFailure((data) => { data.wait_outcome = "deadline"; });
  expectDataFailure((data) => { data.awaited_terminal = false; });
  expectDataFailure((data) => { data.awaited_completed = false; });
  expectDataFailure((data) => { data.succeeded = false; });
  expectDataFailure((data) => { data.plan_hash_mismatch = true; });
  expectDataFailure((data) => { data.iteration_stale = true; });
  expectDataFailure((data) => { data.next_poll_after_seconds = 1; });
  expectDataFailure((data) => { data.run.finished_at = null; });
  expectDataFailure((data) => { data.run.exit_code = 2; });
  expectDataFailure((data) => { data.run.timed_out = true; });
  expectDataFailure((data) => { data.requested_artifacts = ["diff", "status"]; });
  expectDataFailure((data) => { data.artifacts[0].path = ".ai-bridge/private.txt"; });
  expectDataFailure((data) => { data.artifacts[0].returned_bytes += 1; });
  expectDataFailure((data) => { data.artifacts[0].line_count += 1; });
  expectDataFailure((data) => { data.artifact_count += 1; });
  expectDataFailure((data) => { data.returned_bytes += 1; });
  expectDataFailure((data) => { data.output_limited = true; });
  expectDataFailure((data) => { data.redacted = true; });
  assert.throws(() => waitForHandoffOutputSchema.parse({
    ...success,
    meta: { ...success.meta, warnings: ["private diagnostic"] }
  }));
});

test("wait_for_handoff is standard full only read-only time-varying and advertises exact output schema", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root, { toolMode: "minimal" }), {}, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === "wait_for_handoff"), false);
    });

    for (const toolMode of ["standard", "full"]) {
      await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
        const descriptor = (await client.listTools()).tools.find((tool) => tool.name === "wait_for_handoff");
        assert.ok(descriptor?.outputSchema);
        assert.deepEqual(
          new Set(descriptor.outputSchema.required),
          new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
        );
        assert.equal(descriptor.annotations?.readOnlyHint, true);
        assert.equal(descriptor.annotations?.destructiveHint, false);
        assert.equal(descriptor.annotations?.idempotentHint, false);
      });
    }
  });
});

test("wait_for_handoff reads a real matching terminal run and only fixed bounded redacted artifacts", async () => {
  await withTempWorkspace(async (root) => {
    const bridge = path.join(root, ".ai-bridge");
    const syntheticSecret = "sk-" + "W".repeat(24);
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "private.txt"), "must never be returned\n", "utf8");
    await fs.writeFile(path.join(bridge, "agent-status.md"), `OPENAI_API_KEY=${syntheticSecret}\nDone.\n`, "utf8");
    await fs.writeFile(path.join(bridge, "implementation-diff.patch"), "d".repeat(14_000), "utf8");
    await fs.writeFile(
      path.join(bridge, "execution-log.jsonl"),
      Array.from({ length: 25 }, (_, index) => `line-${String(index + 1).padStart(2, "0")}`).join("\n") + "\n",
      "utf8"
    );
    await fs.writeFile(path.join(bridge, "handoff-run-state.json"), JSON.stringify({
      ...rawRun({ executor: syntheticSecret }),
      status_file: ".ai-bridge/private.txt",
      diff_file: ".ai-bridge/private.txt",
      log_file: ".ai-bridge/private.txt",
      tests_file: ".ai-bridge/private.txt"
    }), "utf8");

    await withConfigClient(createTestConfig(root), {}, async (client) => {
      const result = await callTool(client, "wait_for_handoff", {
        workspace_id: undefined,
        plan_hash: "plan-a",
        since_iteration: 1,
        max_wait_seconds: 1,
        poll_ms: 250
      });
      const parsed = parseResult(result);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.state, "completed");
      assert.equal(parsed.data.wait_outcome, "matched_terminal");
      assert.equal(parsed.data.run.executor.includes(syntheticSecret), false);
      assert.equal(parsed.data.run.redacted, true);
      assert.deepEqual(parsed.data.requested_artifacts, ["status", "diff", "log", "tests"]);
      assert.deepEqual(parsed.data.artifacts.map((item) => item.kind), ["status", "diff", "log"]);
      assert.deepEqual(parsed.data.unavailable, [{
        path: ".ai-bridge/loop-tests.txt",
        kind: "tests",
        reason: "missing",
        bytes: null
      }]);
      assert.equal(parsed.data.artifact_paths.status, ".ai-bridge/agent-status.md");
      assert.equal(parsed.data.artifact_paths.diff, ".ai-bridge/implementation-diff.patch");
      assert.equal(parsed.data.artifacts.some((item) => item.text.includes("must never be returned")), false);
      const status = parsed.data.artifacts.find((item) => item.kind === "status");
      const diff = parsed.data.artifacts.find((item) => item.kind === "diff");
      const log = parsed.data.artifacts.find((item) => item.kind === "log");
      assert.equal(status.redacted, true);
      assert.equal(status.text.includes(syntheticSecret), false);
      assert.equal(diff.truncated, true);
      assert.ok(diff.returned_bytes <= 12_000);
      assert.equal(log.text.includes("line-01"), false);
      assert.equal(log.text.includes("line-06"), true);
      assert.equal(log.text.includes("line-25"), true);
      assert.ok(log.line_count <= 20);
      assert.equal(parsed.data.output_limited, true);
      assert.equal(parsed.data.redacted, true);
      assert.deepEqual(parsed.meta.warnings, [
        WAIT_FOR_HANDOFF_LIMITED_WARNING,
        WAIT_FOR_HANDOFF_REDACTED_WARNING
      ]);
      assert.equal(JSON.stringify(result).includes(syntheticSecret), false);
    });
  });
});

test("wait_for_handoff polls missing and running observations to a matching terminal state without oversleeping", async () => {
  await withTempWorkspace(async (root) => {
    const clock = fakeClock();
    const observations = [null, rawRun({ state: "running" }), rawRun()];
    let reads = 0;
    let artifactContext;
    await withConfigClient(createTestConfig(root), {
      waitForHandoffNow: clock.now,
      waitForHandoffSleep: clock.sleep,
      waitForHandoffStateProvider: async () => stateProviderResult(observations[Math.min(reads++, observations.length - 1)]),
      waitForHandoffArtifactsProvider: async (context) => {
        artifactContext = context;
        return artifactProviderResult(context.requestedKinds);
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "wait_for_handoff", {
        plan_hash: "plan-a",
        since_iteration: 1,
        max_wait_seconds: 1,
        poll_ms: 250,
        include_diff: false,
        include_log_excerpt: false,
        include_tests: false
      }));
      assert.equal(parsed.data.state, "completed");
      assert.equal(parsed.data.awaited_terminal, true);
      assert.equal(parsed.data.awaited_completed, true);
      assert.equal(parsed.data.succeeded, true);
      assert.equal(reads, 3);
      assert.deepEqual(clock.sleeps, [250, 250]);
      assert.deepEqual(artifactContext.requestedKinds, ["status"]);
      assert.deepEqual(artifactContext.limits, { maxArtifactBytes: 80_000, maxTotalBytes: 40_000 });
    });
  });
});

test("wait_for_handoff remains bounded when the injected wall clock does not advance", async () => {
  await withTempWorkspace(async (root) => {
    let reads = 0;
    const sleeps = [];
    await withConfigClient(createTestConfig(root), {
      waitForHandoffNow: () => 0,
      waitForHandoffSleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        if (sleeps.length > 4) throw new Error("unbounded polling");
      },
      waitForHandoffStateProvider: async () => {
        reads += 1;
        return stateProviderResult(null);
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "wait_for_handoff", {
        max_wait_seconds: 1,
        poll_ms: 250
      }));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.wait_outcome, "deadline");
      assert.deepEqual(sleeps, [250, 250, 250, 250]);
      assert.equal(reads, 5);
    });
  });
});

test("wait_for_handoff returns exact deadline hash-mismatch and stale-iteration pending states", async () => {
  await withTempWorkspace(async (root) => {
    const missingClock = fakeClock();
    let missingReads = 0;
    await withConfigClient(createTestConfig(root), {
      waitForHandoffNow: missingClock.now,
      waitForHandoffSleep: missingClock.sleep,
      waitForHandoffStateProvider: async () => {
        missingReads += 1;
        return stateProviderResult(null);
      }
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "wait_for_handoff", {
        max_wait_seconds: 1,
        poll_ms: 5_000
      }));
      assert.equal(parsed.data.state, "unknown");
      assert.equal(parsed.data.state_present, false);
      assert.equal(parsed.data.wait_outcome, "deadline");
      assert.equal(parsed.data.next_poll_after_seconds, 5);
      assert.deepEqual(missingClock.sleeps, [1_000]);
      assert.equal(missingReads, 2);
      assert.deepEqual(parsed.meta.warnings, [WAIT_FOR_HANDOFF_DEADLINE_WARNING]);
    });

    for (const [args, expected] of [
      [{ plan_hash: "other-plan" }, { plan_hash_mismatch: true, iteration_stale: false }],
      [{ since_iteration: 2 }, { plan_hash_mismatch: false, iteration_stale: true }]
    ]) {
      const clock = fakeClock();
      await withConfigClient(createTestConfig(root), {
        waitForHandoffNow: clock.now,
        waitForHandoffSleep: clock.sleep,
        waitForHandoffStateProvider: async () => stateProviderResult(rawRun())
      }, async (client) => {
        const parsed = parseResult(await callTool(client, "wait_for_handoff", {
          ...args,
          max_wait_seconds: 1,
          poll_ms: 500
        }));
        assert.equal(parsed.data.state, "running");
        assert.equal(parsed.data.run.state, "completed");
        assert.equal(parsed.data.wait_outcome, "deadline");
        assert.equal(parsed.data.plan_hash_mismatch, expected.plan_hash_mismatch);
        assert.equal(parsed.data.iteration_stale, expected.iteration_stale);
        assert.deepEqual(parsed.data.artifacts, []);
      });
    }
  });
});

test("wait_for_handoff preserves matched failed and timed_out terminal meanings", async () => {
  await withTempWorkspace(async (root) => {
    for (const state of ["failed", "timed_out"]) {
      const run = rawRun({ state });
      await withConfigClient(createTestConfig(root), {
        waitForHandoffStateProvider: async () => stateProviderResult(run),
        waitForHandoffArtifactsProvider: async (context) => artifactProviderResult(context.requestedKinds)
      }, async (client) => {
        const parsed = parseResult(await callTool(client, "wait_for_handoff", {
          max_wait_seconds: 1,
          include_diff: false,
          include_log_excerpt: false,
          include_tests: false
        }));
        assert.equal(parsed.data.state, state);
        assert.equal(parsed.data.awaited_terminal, true);
        assert.equal(parsed.data.awaited_completed, false);
        assert.equal(parsed.data.succeeded, false);
        assert.equal(parsed.data.run.timed_out, state === "timed_out");
      });
    }
  });
});

test("wait_for_handoff returns stable workspace state artifact and malformed-provider failures without leaks", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {}, async (client) => {
      assertFailure(
        await callTool(client, "wait_for_handoff", { workspace_id: "missing-workspace", max_wait_seconds: 1 }),
        "WORKSPACE_NOT_FOUND",
        { source: "workspace_id", workspace_id: "missing-workspace" }
      );
    });

    const privateDiagnostic = `private ${root} ${"sk-" + "X".repeat(24)}`;
    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => { throw new Error(privateDiagnostic); }
    }, async (client) => {
      const result = await callTool(client, "wait_for_handoff", { max_wait_seconds: 1 });
      assertFailure(result, "HANDOFF_STATE_READ_FAILED", {
        context_dir: ".ai-bridge",
        state_file: ".ai-bridge/handoff-run-state.json"
      });
      assert.equal(JSON.stringify(result).includes(privateDiagnostic), false);
      assert.equal(JSON.stringify(result).includes(root), false);
    });

    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => {
        const text = "{ invalid json";
        return { stateFile: ".ai-bridge/handoff-run-state.json", present: true, bytes: Buffer.byteLength(text), text };
      }
    }, async (client) => {
      assertFailure(
        await callTool(client, "wait_for_handoff", { max_wait_seconds: 1 }),
        "HANDOFF_STATE_INVALID",
        { state_file: ".ai-bridge/handoff-run-state.json" },
        true
      );
    });

    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => ({
        stateFile: ".ai-bridge/private.json",
        present: true,
        bytes: 1,
        text: "{}",
        diagnostic: privateDiagnostic
      })
    }, async (client) => {
      assertFailure(await callTool(client, "wait_for_handoff", { max_wait_seconds: 1 }), "INTERNAL_ERROR", {});
    });

    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async () => { throw new Error(privateDiagnostic); }
    }, async (client) => {
      const result = await callTool(client, "wait_for_handoff", { max_wait_seconds: 1 });
      assertFailure(result, "HANDOFF_ARTIFACT_READ_FAILED", { context_dir: ".ai-bridge" });
      assert.equal(JSON.stringify(result).includes(privateDiagnostic), false);
    });

    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async () => artifactProviderResult(["status"], {
        artifacts: [rawArtifact({ path: ".ai-bridge/private.txt" })],
        diagnostic: privateDiagnostic
      })
    }, async (client) => {
      assertFailure(
        await callTool(client, "wait_for_handoff", {
          max_wait_seconds: 1,
          include_diff: false,
          include_log_excerpt: false,
          include_tests: false
        }),
        "INTERNAL_ERROR",
        {}
      );
    });
  });
});

test("wait_for_handoff rejects provider artifact arrays that violate fixed relative order", async () => {
  await withTempWorkspace(async (root) => {
    const diff = rawArtifact({
      path: artifactPaths().diff,
      kind: "diff",
      text: "diff --git a/a.txt b/a.txt\n"
    });
    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async (context) => artifactProviderResult(context.requestedKinds, {
        artifacts: [diff, rawArtifact()]
      })
    }, async (client) => {
      assertFailure(
        await callTool(client, "wait_for_handoff", {
          max_wait_seconds: 1,
          include_diff: true,
          include_log_excerpt: false,
          include_tests: false
        }),
        "INTERNAL_ERROR",
        {}
      );
    });
  });
});

test("wait_for_handoff domain readers distinguish missing state and classify only fixed requested artifacts", async () => {
  await withTempWorkspace(async (root) => {
    assert.equal(typeof readHandoffRunState, "function");
    assert.equal(typeof readWaitForHandoffArtifacts, "function");
    assert.equal(typeof waitForHandoffLimits, "function");
    const config = createTestConfig(root, {
      maxReadBytes: 10,
      maxOutputBytes: 20,
      blockedGlobs: [".ai-bridge/implementation-diff.patch"]
    });
    const guard = new PathGuard(config);
    const workspace = { id: "ws_0123456789abcdef01234567", root, openedAt: new Date(0).toISOString() };
    assert.deepEqual(waitForHandoffLimits(config), {
      maxStateBytes: 10,
      maxArtifactBytes: 10,
      maxTotalBytes: 20
    });
    assert.deepEqual(await readHandoffRunState(config, guard, workspace, 10), {
      stateFile: ".ai-bridge/handoff-run-state.json",
      present: false,
      bytes: null,
      text: null
    });

    const bridge = path.join(root, ".ai-bridge");
    await fs.mkdir(bridge, { recursive: true });
    await fs.writeFile(path.join(bridge, "handoff-run-state.json"), "{}", "utf8");
    await fs.writeFile(path.join(bridge, "agent-status.md"), Buffer.from([0, 1, 2]));
    await fs.writeFile(path.join(bridge, "implementation-diff.patch"), "blocked", "utf8");
    const state = await readHandoffRunState(config, guard, workspace, 10);
    assert.equal(state.present, true);
    assert.equal(state.bytes, 2);
    assert.equal(state.text, "{}");
    const result = await readWaitForHandoffArtifacts(
      config,
      guard,
      workspace,
      ["status", "diff", "tests"],
      10
    );
    assert.deepEqual(result.requestedKinds, ["status", "diff", "tests"]);
    assert.deepEqual(result.artifacts, []);
    assert.deepEqual(result.unavailable.map((item) => [item.kind, item.reason, item.bytes]), [
      ["status", "not_text", 3],
      ["diff", "blocked", null],
      ["tests", "missing", null]
    ]);
    assert.equal(JSON.stringify(result).includes("private.txt"), false);
  });
});

test("wait_for_handoff enforces UTF-8 excerpt and aggregate bounds after redaction", async () => {
  await withTempWorkspace(async (root) => {
    const secret = "sk-" + "Y".repeat(24);
    const statusText = `${"界".repeat(3_000)}\n${secret}\n`;
    const diffText = "z".repeat(12_000);
    await withConfigClient(createTestConfig(root, { maxOutputBytes: 7_000 }), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async (context) => artifactProviderResult(context.requestedKinds, {
        artifacts: [
          rawArtifact({ text: statusText }),
          rawArtifact({
            path: artifactPaths().diff,
            kind: "diff",
            text: diffText,
            bytes: Buffer.byteLength(diffText),
            lineCount: 1
          })
        ]
      })
    }, async (client) => {
      const result = await callTool(client, "wait_for_handoff", {
        max_wait_seconds: 1,
        include_log_excerpt: false,
        include_tests: false
      });
      const parsed = parseResult(result);
      assert.ok(parsed.data.returned_bytes <= 7_000);
      assert.equal(parsed.data.returned_bytes, parsed.data.artifacts.reduce((sum, item) => sum + item.returned_bytes, 0));
      assert.equal(parsed.data.artifacts.every((item) => item.returned_bytes === Buffer.byteLength(item.text, "utf8")), true);
      assert.equal(JSON.stringify(result).includes(secret), false);
      assert.equal(parsed.data.output_limited, true);
      assert.equal(parsed.data.redacted, true);
    });
  });
});

test("wait_for_handoff Tool Card is nested-first dedicated and bounded", () => {
  assert.match(toolCardWidgetHtml, /function waitForHandoffResultData\(data\)/);
  assert.match(toolCardWidgetHtml, /data\?\.codexpro_tool === "wait_for_handoff"/);
  assert.match(toolCardWidgetHtml, /function renderWaitForHandoff\(data\)/);
  assert.match(toolCardWidgetHtml, /previewLines\(artifact\.text, 20\)/);
  assert.match(toolCardWidgetHtml, /wait\.unavailable/);
  assert.match(toolCardWidgetHtml, /error\.message \|\| "Handoff wait unavailable\."/);
  assert.match(toolCardWidgetHtml, /tool === "wait_for_handoff"/);
  assert.match(toolCardWidgetHtml, /renderWaitForHandoff\(data\)/);
});

test("wait_for_handoff with Tool Cards preserves exact structured excerpts", async () => {
  await withTempWorkspace(async (root) => {
    const text = "x".repeat(12_000);
    await withConfigClient(createTestConfig(root, { toolCards: true }), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async (context) => artifactProviderResult(context.requestedKinds, {
        artifacts: [rawArtifact({
          path: artifactPaths().diff,
          kind: "diff",
          text,
          bytes: 12_000,
          lineCount: 1
        })],
        unavailable: [{
          path: artifactPaths().status,
          kind: "status",
          reason: "missing",
          bytes: null
        }]
      })
    }, async (client) => {
      const parsed = parseResult(await callTool(client, "wait_for_handoff", {
        max_wait_seconds: 1,
        include_diff: true,
        include_log_excerpt: false,
        include_tests: false
      }));
      assert.equal(parsed.data.artifacts[0].text, text);
      assert.equal(parsed.data.artifacts[0].returned_bytes, 12_000);
      assert.equal(parsed.data.artifacts[0].text.includes("structured field truncated"), false);
    });
  });
});

test("wait_for_handoff supertool preserves the exact nested child envelope", async () => {
  await withTempWorkspace(async (root) => {
    await withConfigClient(createTestConfig(root), {
      waitForHandoffStateProvider: async () => stateProviderResult(rawRun()),
      waitForHandoffArtifactsProvider: async (context) => artifactProviderResult(context.requestedKinds)
    }, async (client) => {
      const result = await callTool(client, "codexpro", {
        action: "handoff_poll",
        args: {
          max_wait_seconds: 1,
          include_diff: false,
          include_log_excerpt: false,
          include_tests: false
        }
      });
      assert.equal(result.structuredContent.codexpro_tool, "wait_for_handoff");
      assert.equal(result.structuredContent.codexpro_title, "Wait For Handoff");
      assert.equal(result.structuredContent.codexpro_super_action, "handoff_poll");
      assert.equal(result.structuredContent.wrapped_tool, "wait_for_handoff");
      assert.equal(result.structuredContent.ok, true);
      assert.equal(result.structuredContent.data.succeeded, true);
      assert.equal("succeeded" in result.structuredContent, false);
    });
  });
});

test("wait_for_handoff compatibility consumer is exact and protected Smoke sources stay unchanged", async () => {
  const mainCompat = await fs.readFile(new URL("../scripts/smoke-platform-compat.mjs", import.meta.url), "utf8");
  const protectedMain = await fs.readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");
  const protectedHttp = await fs.readFile(new URL("../scripts/http-smoke.mjs", import.meta.url), "utf8");

  const replacements = [
    ["waitCompleted.structuredContent.awaited_completed", "waitCompleted.structuredContent.data?.awaited_completed"],
    ["waitCompleted.structuredContent.state", "waitCompleted.structuredContent.data?.state"],
    ["waitCompleted.structuredContent.awaited_terminal", "waitCompleted.structuredContent.data?.awaited_terminal"],
    ["waitCompleted.structuredContent.succeeded", "waitCompleted.structuredContent.data?.succeeded"],
    ["waitCompleted.structuredContent.exit_code", "waitCompleted.structuredContent.data?.run?.exit_code"],
    ["waitCompleted.structuredContent.status_file", "waitCompleted.structuredContent.data?.artifact_paths?.status"],
    ["waitMismatch.structuredContent.awaited_completed", "waitMismatch.structuredContent.data?.awaited_completed"],
    ["waitMismatch.structuredContent.state", "waitMismatch.structuredContent.data?.state"],
    ["waitMismatch.structuredContent.plan_hash_mismatch", "waitMismatch.structuredContent.data?.plan_hash_mismatch"],
    ["waitFailed.structuredContent.awaited_terminal", "waitFailed.structuredContent.data?.awaited_terminal"],
    ["waitFailed.structuredContent.awaited_completed", "waitFailed.structuredContent.data?.awaited_completed"],
    ["waitFailed.structuredContent.succeeded", "waitFailed.structuredContent.data?.succeeded"],
    ["waitFailed.structuredContent.state", "waitFailed.structuredContent.data?.state"],
    ["waitFailed.structuredContent.status_file", "waitFailed.structuredContent.data?.artifact_paths?.status"],
    ["waitFailed.structuredContent.diff_file", "waitFailed.structuredContent.data?.artifact_paths?.diff"],
    ["waitTimedOut.structuredContent.awaited_terminal", "waitTimedOut.structuredContent.data?.awaited_terminal"],
    ["waitTimedOut.structuredContent.awaited_completed", "waitTimedOut.structuredContent.data?.awaited_completed"],
    ["waitTimedOut.structuredContent.succeeded", "waitTimedOut.structuredContent.data?.succeeded"],
    ["waitTimedOut.structuredContent.state", "waitTimedOut.structuredContent.data?.state"]
  ];
  for (const [before, after] of replacements) {
    assert.equal(countOccurrences(mainCompat, `'${before}'`), 1, before);
    assert.equal(countOccurrences(mainCompat, `'${after}'`), 1, after);
    assert.equal(countOccurrences(protectedMain, before), 1, before);
  }
  assert.equal(countOccurrences(protectedHttp, "waitCompleted.structuredContent"), 0);
});

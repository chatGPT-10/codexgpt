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
const {
  BASH_ERROR_MESSAGES,
  bashOutputSchema,
  createBashFailure,
  createBashSuccess
} = await tsImport("../src/tools/schemas/bash.ts", import.meta.url);

function sampleBashData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    command: "npm run build",
    cwd: ".",
    exitCode: 0,
    signal: null,
    durationMs: 1842,
    stdout: "build passed\n",
    stderr: "",
    truncated: false,
    bash_session_id: null,
    ...overrides
  };
}

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "ws_missing" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "INVALID_ARGUMENT",
    details: { argument: "command", reason: "empty" },
    message: "The Bash request contains an invalid argument."
  },
  {
    code: "BASH_SESSION_CONFIGURATION_INVALID",
    details: { reason: "missing_server_session_id" },
    message: "The Bash session guard is enabled but the server session configuration is invalid."
  },
  {
    code: "BASH_SESSION_REQUIRED",
    details: { expected_session_id: "main" },
    message: "A Bash session id is required for this server."
  },
  {
    code: "BASH_SESSION_MISMATCH",
    details: { expected_session_id: "main" },
    message: "The provided Bash session id does not match this server."
  },
  {
    code: "COMMAND_POLICY_DENIED",
    details: { reason: "blocked_pattern" },
    message: "The command is not allowed by the current Bash policy."
  },
  {
    code: "SHELL_BACKEND_UNAVAILABLE",
    details: { backend: "bash" },
    message: "The Bash backend is unavailable on this server."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "[unsafe path omitted]" },
    message: "The requested working directory is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".git" },
    message: "The requested working directory is blocked by workspace safety rules."
  },
  {
    code: "COMMAND_START_FAILED",
    details: { backend: "bash" },
    message: "The Bash process could not be started."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The Bash request failed because of an internal error."
  }
];

test("bash success constructor produces the strict schema-v1 envelope", () => {
  const result = createBashSuccess(sampleBashData(), 7);
  const parsed = bashOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "bash");
  assert.equal(parsed.codexpro_title, "Bash");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleBashData());
  for (const legacyField of [
    "command",
    "cwd",
    "exitCode",
    "signal",
    "durationMs",
    "stdout",
    "stderr",
    "truncated",
    "bashSessionId",
    "bash_session_id"
  ]) {
    assert.equal(legacyField in parsed, false);
  }
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("bash failure constructor produces every approved strict error", () => {
  for (const expected of failureCases) {
    const result = createBashFailure(
      { code: expected.code, details: expected.details },
      3
    );
    const parsed = bashOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(BASH_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("bash schema rejects malformed success data and additional fields", () => {
  const success = createBashSuccess(sampleBashData(), 0);

  assert.throws(() => bashOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, command: "" } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, cwd: "" } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, exitCode: -1 } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, exitCode: 1.5 } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, signal: "" } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, durationMs: -1 } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, bash_session_id: " bad" } })
  );
  assert.throws(() =>
    bashOutputSchema.parse({ ...success, data: { ...success.data, bash_session_id: "a".repeat(65) } })
  );

  assert.doesNotThrow(() =>
    bashOutputSchema.parse({
      ...success,
      data: {
        ...success.data,
        exitCode: null,
        signal: "SIGTERM",
        truncated: true,
        bash_session_id: "main.session-1"
      }
    })
  );
});

test("bash schema enforces envelope consistency and exact error details", () => {
  const success = createBashSuccess(sampleBashData(), 0);
  const workspaceFailure = createBashFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );

  assert.throws(() => bashOutputSchema.parse({ ...success, data: null }));
  assert.throws(() =>
    bashOutputSchema.parse({
      ...success,
      error: workspaceFailure.error
    })
  );
  assert.throws(() =>
    bashOutputSchema.parse({
      ...workspaceFailure,
      data: sampleBashData()
    })
  );
  assert.throws(() => bashOutputSchema.parse({ ...workspaceFailure, error: null }));
  assert.throws(() =>
    createBashFailure({
      code: "COMMAND_POLICY_DENIED",
      details: { reason: "other" }
    })
  );
  assert.throws(() =>
    createBashFailure({
      code: "INTERNAL_ERROR",
      details: { diagnostic: "raw" }
    })
  );
  assert.throws(() =>
    createBashFailure({
      code: "BASH_SESSION_MISMATCH",
      details: { expected_session_id: "main", provided_session_id: "other" }
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

async function withInMemoryClient(options, callback) {
  const root = options.root ?? process.cwd();
  const server = createCodexProServer(
    createTestConfig(root, options.configOverrides ?? {}),
    options.dependencies ?? {}
  );
  const client = new Client({ name: "bash-contract-test", version: "0.0.0" });
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
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-bash-contract-"));
  const root = await fs.realpath(created);
  try {
    await fs.mkdir(path.join(root, ".git"), { recursive: true });
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

function parseBashResult(result) {
  return bashOutputSchema.parse(result.structuredContent);
}

function assertBashFailure(result, code, details) {
  assert.equal(result.isError, true);
  const parsed = parseBashResult(result);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: BASH_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.match(resultText(result), new RegExp(`Code: ${code}`));
  assert.ok(resultText(result).includes(BASH_ERROR_MESSAGES[code]));
  return parsed;
}

function providerResult(overrides = {}) {
  return {
    command: "pwd",
    cwd: ".",
    exitCode: 0,
    signal: null,
    durationMs: 4,
    stdout: "D:/Dev/codexpro\n",
    stderr: "",
    truncated: false,
    ...overrides
  };
}

test("bash advertises an exact output schema and returns nested execution data", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({
      root,
      dependencies: { bashResultProvider: async () => providerResult() }
    }, async (client) => {
      const listed = await client.listTools();
      const descriptor = listed.tools.find((tool) => tool.name === "bash");
      assert.ok(descriptor, "bash must be registered");
      assert.ok(descriptor.outputSchema, "bash must advertise outputSchema");
      assert.equal(descriptor.outputSchema.type, "object");
      assert.deepEqual(
        new Set(descriptor.outputSchema.required),
        new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
      );

      const result = await client.callTool({
        name: "bash",
        arguments: { command: "pwd" }
      });
      const parsed = parseBashResult(result);

      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.error, null);
      assert.equal(parsed.data.command, "pwd");
      assert.equal(parsed.data.cwd, ".");
      assert.equal(parsed.data.exitCode, 0);
      assert.equal(parsed.data.signal, null);
      assert.equal(parsed.data.truncated, false);
      assert.equal(parsed.data.bash_session_id, null);
      assert.ok(parsed.data.stdout.trim());
      assert.equal("exitCode" in parsed, false);
      assert.equal("bashSessionId" in parsed, false);
    });
  });
});

test("bash is not registered when Bash mode is off", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({ root, configOverrides: { bashMode: "off" } }, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === "bash"), false);
    });
  });
});

test("bash keeps non-zero exits, signals, and truncation as successful command outcomes", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({
      root,
      dependencies: {
        bashResultProvider: async () => providerResult({
          exitCode: 2,
          signal: "SIGTERM",
          truncated: true,
          stderr: "verification failed\n"
        })
      }
    }, async (client) => {
      const result = await client.callTool({ name: "bash", arguments: { command: "pwd" } });
      const parsed = parseBashResult(result);
      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.exitCode, 2);
      assert.equal(parsed.data.signal, "SIGTERM");
      assert.equal(parsed.data.truncated, true);
      assert.equal(parsed.data.stderr, "verification failed\n");
    });
  });
});

test("bash returns stable failures for workspace, empty command, session, and policy errors", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({ root }, async (client) => {
      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { workspace_id: "ws_missing", command: "pwd" }
      }), "WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" });

      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "   " }
      }), "INVALID_ARGUMENT", { argument: "command", reason: "empty" });

      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd && echo unsafe" }
      }), "COMMAND_POLICY_DENIED", { reason: "blocked_pattern" });

      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "node --version" }
      }), "COMMAND_POLICY_DENIED", { reason: "not_allowlisted" });
    });

    await withInMemoryClient({
      root,
      configOverrides: { bashSessionId: "main", requireBashSession: true }
    }, async (client) => {
      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd" }
      }), "BASH_SESSION_REQUIRED", { expected_session_id: "main" });

      const mismatch = await client.callTool({
        name: "bash",
        arguments: { command: "pwd", session_id: "private-other" }
      });
      assertBashFailure(mismatch, "BASH_SESSION_MISMATCH", { expected_session_id: "main" });
      assert.equal(resultText(mismatch).includes("private-other"), false);
    });

    await withInMemoryClient({
      root,
      configOverrides: { bashSessionId: undefined, requireBashSession: true }
    }, async (client) => {
      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd" }
      }), "BASH_SESSION_CONFIGURATION_INVALID", { reason: "missing_server_session_id" });
    });
  });
});

test("bash returns stable safe failures for cwd, backend, and process start errors", async () => {
  await withTempWorkspace(async (root) => {
    await withInMemoryClient({
      root,
      dependencies: { bashResultProvider: async () => providerResult() }
    }, async (client) => {
      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd", cwd: ".git" }
      }), "PATH_BLOCKED", { path: ".git" });

      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd", cwd: "../outside" }
      }), "PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" });
    });

    await withInMemoryClient({
      root,
      dependencies: {
        bashResultProvider: async () => {
          throw new Error("Bash backend is unavailable. C:/private/bash.exe missing");
        }
      }
    }, async (client) => {
      const result = await client.callTool({ name: "bash", arguments: { command: "pwd" } });
      assertBashFailure(result, "SHELL_BACKEND_UNAVAILABLE", { backend: "bash" });
      assert.equal(resultText(result).includes("C:/private/bash.exe"), false);
    });

    const startError = Object.assign(new Error("spawn C:/private/bash.exe failed"), { code: "ENOENT" });
    await withInMemoryClient({
      root,
      dependencies: {
        bashResultProvider: async () => {
          throw startError;
        }
      }
    }, async (client) => {
      const result = await client.callTool({ name: "bash", arguments: { command: "pwd" } });
      assertBashFailure(result, "COMMAND_START_FAILED", { backend: "bash" });
      assert.equal(resultText(result).includes("C:/private/bash.exe"), false);
    });
  });
});

test("bash rejects malformed or identity-mismatched provider results as internal errors", async () => {
  await withTempWorkspace(async (root) => {
    const cases = [
      { result: { ...providerResult(), extra: true } },
      { result: providerResult({ command: "npm run build" }) },
      { result: providerResult({ cwd: "subdir" }) },
      { result: providerResult({ durationMs: -1 }) },
      { result: providerResult({ exitCode: -1 }) },
      { result: providerResult({ signal: "" }) },
      { result: providerResult({ bashSessionId: "unexpected" }) }
    ];

    for (const item of cases) {
      await withInMemoryClient({
        root,
        dependencies: { bashResultProvider: async () => item.result }
      }, async (client) => {
        assertBashFailure(await client.callTool({
          name: "bash",
          arguments: { command: "pwd" }
        }), "INTERNAL_ERROR", {});
      });
    }

    await withInMemoryClient({
      root,
      configOverrides: { bashSessionId: "main", requireBashSession: false },
      dependencies: { bashResultProvider: async () => providerResult() }
    }, async (client) => {
      assertBashFailure(await client.callTool({
        name: "bash",
        arguments: { command: "pwd" }
      }), "INTERNAL_ERROR", {});
    });
  });
});

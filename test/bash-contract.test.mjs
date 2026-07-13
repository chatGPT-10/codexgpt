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

void fs;
void os;
void path;
void Client;
void InMemoryTransport;
void createCodexProServer;
void toolCardWidgetHtml;

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

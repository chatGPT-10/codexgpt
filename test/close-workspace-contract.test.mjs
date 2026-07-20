import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const {
  closeWorkspaceOutputSchema,
  createCloseWorkspaceFailure,
  createCloseWorkspaceSuccess
} = await tsImport("../src/tools/schemas/closeWorkspace.ts", import.meta.url);

function configFor(root, overrides = {}) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: undefined,
    requireHttpToken: false,
    allowedHosts: ["127.0.0.1"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(root, ".codex-test"),
    writeMode: "workspace",
    toolMode: "standard",
    policyEngineMode: "legacy",
    permissionProfileId: undefined,
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    workspaceTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge",
    toolCards: false,
    connectionTest: false,
    analysisEnabled: false,
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

async function withConnection(toolMode, callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-close-workspace-"));
  const root = await fs.realpath(created);
  const server = createCodexGPTServer(configFor(root, { toolMode }));
  const client = new Client({ name: "close-workspace-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await callback({ client, root });
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(created, { recursive: true, force: true });
  }
}

function structured(result) {
  assert.ok(result.structuredContent, JSON.stringify(result));
  return result.structuredContent;
}

async function openWorkspace(client, root) {
  const result = structured(await client.callTool({
    name: "open_workspace",
    arguments: { root, include_tree: false }
  }));
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data.workspace_id;
}

test("close_workspace constructors enforce the exact strict envelope", () => {
  const workspaceId = `ws_${"11".repeat(16)}`;
  const success = createCloseWorkspaceSuccess({
    workspace_id: workspaceId,
    closed_at: "2026-07-14T00:00:00.000Z",
    state: "closed"
  });
  assert.equal(closeWorkspaceOutputSchema.parse(success).ok, true);
  assert.throws(() => closeWorkspaceOutputSchema.parse({ ...success, root: "C:\\private" }));
  assert.throws(() => closeWorkspaceOutputSchema.parse({
    ...success,
    data: { ...success.data, reason: "expired" }
  }));

  const failure = createCloseWorkspaceFailure({
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: workspaceId }
  });
  assert.equal(closeWorkspaceOutputSchema.parse(failure).ok, false);
  assert.throws(() => closeWorkspaceOutputSchema.parse({
    ...failure,
    error: { ...failure.error, details: { ...failure.error.details, root: "C:\\private" } }
  }));
});

for (const toolMode of ["minimal", "standard", "full"]) {
  test(`close_workspace is registered in ${toolMode} mode and invalidates immediately`, async () => {
    await withConnection(toolMode, async ({ client, root }) => {
      const workspaceId = await openWorkspace(client, root);
      const closed = structured(await client.callTool({
        name: "close_workspace",
        arguments: { workspace_id: workspaceId }
      }));

      assert.equal(closed.codexgpt_tool, "close_workspace");
      assert.equal(closed.codexgpt_title, "Close Workspace");
      assert.equal(closed.ok, true);
      assert.deepEqual(Object.keys(closed.data).sort(), ["closed_at", "state", "workspace_id"]);
      assert.equal(closed.data.workspace_id, workspaceId);
      assert.equal(closed.data.state, "closed");
      assert.equal(new Date(closed.data.closed_at).toISOString(), closed.data.closed_at);
      assert.equal(closed.error, null);
      assert.deepEqual(Object.keys(closed).sort(), [
        "codexgpt_title",
        "codexgpt_tool",
        "data",
        "error",
        "meta",
        "ok"
      ]);

      const stale = structured(await client.callTool({
        name: "read",
        arguments: { workspace_id: workspaceId, path: "package.json" }
      }));
      assert.equal(stale.ok, false);
      assert.equal(stale.error.code, "WORKSPACE_NOT_FOUND");

      const reopenedId = await openWorkspace(client, root);
      assert.notEqual(reopenedId, workspaceId);
    });
  });
}

test("close_workspace returns one safe not-found shape for unknown and already closed handles", async () => {
  await withConnection("standard", async ({ client, root }) => {
    const unknown = structured(await client.callTool({
      name: "close_workspace",
      arguments: { workspace_id: `ws_${"aa".repeat(16)}` }
    }));
    assert.equal(unknown.ok, false);
    assert.equal(unknown.error.code, "WORKSPACE_NOT_FOUND");
    assert.deepEqual(unknown.error.details, { workspace_id: `ws_${"aa".repeat(16)}` });

    const workspaceId = await openWorkspace(client, root);
    const first = structured(await client.callTool({
      name: "close_workspace",
      arguments: { workspace_id: workspaceId }
    }));
    assert.equal(first.ok, true);
    const second = structured(await client.callTool({
      name: "close_workspace",
      arguments: { workspace_id: workspaceId }
    }));
    assert.equal(second.ok, false);
    assert.equal(second.error.code, "WORKSPACE_NOT_FOUND");
    assert.deepEqual(Object.keys(second.error.details), ["workspace_id"]);
  });
});

test("codexgpt supertool delegates close_workspace to the same lifecycle handler", async () => {
  await withConnection("standard", async ({ client, root }) => {
    const workspaceId = await openWorkspace(client, root);
    const closed = structured(await client.callTool({
      name: "codexgpt",
      arguments: {
        action: "close_workspace",
        args: { workspace_id: workspaceId }
      }
    }));

    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.equal(closed.codexgpt_tool, "close_workspace");
    assert.equal(closed.codexgpt_super_action, "close_workspace");
    assert.equal(closed.wrapped_tool, "close_workspace");

    const stale = structured(await client.callTool({
      name: "tree",
      arguments: { workspace_id: workspaceId, max_depth: 1 }
    }));
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, "WORKSPACE_NOT_FOUND");
  });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const guardModule = await tsImport("../src/guard.ts", import.meta.url);
const serverModule = await tsImport("../src/server.ts", import.meta.url);
const { WorkspaceManager, workspaceKeyForRoot } = guardModule;
const { createCodexGPTServer } = serverModule;

function configFor(root, overrides = {}) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    httpSessionTtlMs: 60_000,
    workspaceTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge",
    ...overrides
  };
}

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-workspace-lifecycle-"));
  const root = await fs.realpath(created);
  try {
    return await callback(root);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

function randomSequence(...hexValues) {
  let index = 0;
  return (size) => {
    assert.equal(size, 16);
    const value = hexValues[index] ?? hexValues.at(-1);
    index += 1;
    return Buffer.from(value, "hex");
  };
}

function binding(overrides = {}) {
  return {
    transportSessionId: () => "session-a",
    identityBinding: "identity-a",
    policyRevision: () => "policy-a",
    now: () => 1_700_000_000_000,
    randomBytes: randomSequence("11".repeat(16), "22".repeat(16), "33".repeat(16)),
    ...overrides
  };
}

test("workspaceKeyForRoot is stable and Windows-case-insensitive", () => {
  assert.equal(typeof workspaceKeyForRoot, "function");
  const first = workspaceKeyForRoot("C:\\Dev\\CodexGPT", "win32");
  const second = workspaceKeyForRoot("c:/dev/codexgpt", "win32");
  assert.match(first, /^wk_[0-9a-f]{24}$/);
  assert.equal(first, second);
  assert.notEqual(
    workspaceKeyForRoot("/Dev/CodexGPT", "linux"),
    workspaceKeyForRoot("/dev/codexgpt", "linux")
  );
});

test("same root reuses one active opaque handle inside a lifecycle domain", async () => {
  await withTempWorkspace(async (root) => {
    const manager = new WorkspaceManager(configFor(root), binding());
    const first = manager.openWorkspace(root);
    const second = manager.openWorkspace(root);

    assert.equal(first.id, second.id);
    assert.match(first.id, /^ws_[0-9a-f]{32}$/);
    assert.notEqual(first.id, workspaceKeyForRoot(root));
    assert.deepEqual(Object.keys(first).sort(), ["id", "openedAt", "root"]);
  });
});

test("same canonical root receives different handles in different lifecycle domains", async () => {
  await withTempWorkspace(async (root) => {
    const firstManager = new WorkspaceManager(configFor(root), binding());
    const secondManager = new WorkspaceManager(
      configFor(root),
      binding({
        transportSessionId: () => "session-b",
        randomBytes: randomSequence("44".repeat(16))
      })
    );

    const first = firstManager.openWorkspace(root);
    const second = secondManager.openWorkspace(root);

    assert.notEqual(first.id, second.id);
    assert.throws(() => secondManager.getWorkspace(first.id), /Unknown workspace_id/);
  });
});

test("workspace semantic authority survives transport rotation but binds root identity and policy", async () => {
  await withTempWorkspace(async (root) => {
    const siblingCreated = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-workspace-authority-sibling-"));
    const sibling = await fs.realpath(siblingCreated);
    try {
      const config = { ...configFor(root), allowedRoots: [root, sibling] };
      const firstManager = new WorkspaceManager(config, binding({
        transportSessionId: () => "session-a",
        randomBytes: randomSequence("51".repeat(16))
      }));
      const secondManager = new WorkspaceManager(config, binding({
        transportSessionId: () => "session-b",
        randomBytes: randomSequence("52".repeat(16))
      }));
      const first = firstManager.openWorkspace(root);
      const second = secondManager.openWorkspace(root);

      assert.notEqual(first.id, second.id);
      assert.equal(
        firstManager.workspaceAuthorityDigest(first.id),
        secondManager.workspaceAuthorityDigest(second.id)
      );

      const foreignIdentity = new WorkspaceManager(config, binding({
        transportSessionId: () => "session-c",
        identityBinding: "identity-b",
        randomBytes: randomSequence("53".repeat(16))
      }));
      const foreignPolicy = new WorkspaceManager(config, binding({
        transportSessionId: () => "session-d",
        policyRevision: () => "policy-b",
        randomBytes: randomSequence("54".repeat(16))
      }));
      const foreignRoot = new WorkspaceManager(
        { ...configFor(sibling), allowedRoots: [root, sibling] },
        binding({
          transportSessionId: () => "session-e",
          randomBytes: randomSequence("55".repeat(16))
        })
      );

      assert.notEqual(
        firstManager.workspaceAuthorityDigest(first.id),
        foreignIdentity.workspaceAuthorityDigest(foreignIdentity.openWorkspace(root).id)
      );
      assert.notEqual(
        firstManager.workspaceAuthorityDigest(first.id),
        foreignPolicy.workspaceAuthorityDigest(foreignPolicy.openWorkspace(root).id)
      );
      assert.notEqual(
        firstManager.workspaceAuthorityDigest(first.id),
        foreignRoot.workspaceAuthorityDigest(foreignRoot.openWorkspace(sibling).id)
      );
    } finally {
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });
});

test("strict getWorkspace rejects omitted ids while resolveWorkspace owns legacy fallback", async () => {
  await withTempWorkspace(async (root) => {
    const manager = new WorkspaceManager(configFor(root), binding());

    assert.throws(() => manager.getWorkspace(), /workspace_id is required/);
    const resolved = manager.resolveWorkspace();
    assert.equal(resolved.root, root);
    assert.equal(manager.getWorkspace(resolved.id).id, resolved.id);
  });
});

test("close invalidates immediately and reopening rotates the public handle", async () => {
  await withTempWorkspace(async (root) => {
    const manager = new WorkspaceManager(configFor(root), binding());
    const opened = manager.openWorkspace(root);

    const closed = manager.closeWorkspace(opened.id);
    assert.deepEqual(closed, {
      workspaceId: opened.id,
      closedAt: new Date(1_700_000_000_000).toISOString(),
      state: "closed"
    });
    assert.throws(() => manager.getWorkspace(opened.id), /Unknown workspace_id/);
    assert.throws(() => manager.closeWorkspace(opened.id), /Unknown workspace_id/);

    const reopened = manager.openWorkspace(root);
    assert.notEqual(reopened.id, opened.id);
  });
});

test("idle expiry removes active handles and reopening creates a new handle", async () => {
  await withTempWorkspace(async (root) => {
    let now = 1_700_000_000_000;
    const manager = new WorkspaceManager(
      configFor(root, { workspaceTtlMs: 60_000 }),
      binding({ now: () => now })
    );
    const opened = manager.openWorkspace(root);

    now += 60_001;
    assert.throws(() => manager.getWorkspace(opened.id), /Unknown workspace_id/);
    assert.deepEqual(manager.listWorkspaces(), []);

    const reopened = manager.openWorkspace(root);
    assert.notEqual(reopened.id, opened.id);
  });
});

test("successful strict resolution refreshes idle expiry", async () => {
  await withTempWorkspace(async (root) => {
    let now = 1_700_000_000_000;
    const manager = new WorkspaceManager(
      configFor(root, { workspaceTtlMs: 60_000 }),
      binding({ now: () => now })
    );
    const opened = manager.openWorkspace(root);

    now += 40_000;
    assert.equal(manager.getWorkspace(opened.id).id, opened.id);
    now += 40_000;
    assert.equal(manager.getWorkspace(opened.id).id, opened.id);
  });
});

test("transport and policy invalidation revoke only stale lifecycle records", async () => {
  await withTempWorkspace(async (root) => {
    let revision = "policy-a";
    const manager = new WorkspaceManager(
      configFor(root),
      binding({ policyRevision: () => revision })
    );
    const first = manager.openWorkspace(root);

    revision = "policy-b";
    manager.revokeForPolicyRevision(revision);
    assert.throws(() => manager.getWorkspace(first.id), /Unknown workspace_id/);

    const second = manager.openWorkspace(root);
    manager.revokeAll("transport_closed");
    assert.throws(() => manager.getWorkspace(second.id), /Unknown workspace_id/);
    assert.deepEqual(manager.listWorkspaces(), []);
  });
});

function serverConfigFor(root, overrides = {}) {
  return {
    ...configFor(root),
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
    fileTransactions: "legacy",
    toolMode: "standard",
    policyEngineMode: "legacy",
    permissionProfileId: undefined,
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
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

async function createServerClient(config, dependencies = {}) {
  const server = createCodexGPTServer(config, dependencies);
  const client = new Client({ name: "workspace-lifecycle-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => Promise.allSettled([client.close(), server.close()])
  };
}

function structured(result) {
  assert.ok(result.structuredContent, JSON.stringify(result));
  return result.structuredContent;
}

test("independent MCP servers never share workspace handles", async () => {
  await withTempWorkspace(async (root) => {
    const first = await createServerClient(serverConfigFor(root));
    const second = await createServerClient(serverConfigFor(root));
    try {
      const firstOpen = structured(await first.client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }));
      const secondOpen = structured(await second.client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }));
      assert.equal(firstOpen.ok, true);
      assert.equal(secondOpen.ok, true);
      assert.notEqual(firstOpen.data.workspace_id, secondOpen.data.workspace_id);

      const foreign = structured(await second.client.callTool({
        name: "tree",
        arguments: { workspace_id: firstOpen.data.workspace_id, max_depth: 1 }
      }));
      assert.equal(foreign.ok, false);
      assert.equal(foreign.error.code, "WORKSPACE_NOT_FOUND");
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});

test("legacy omitted workspace_id resolves only the current server default", async () => {
  await withTempWorkspace(async (root) => {
    const connection = await createServerClient(serverConfigFor(root));
    try {
      const result = structured(await connection.client.callTool({
        name: "tree",
        arguments: { max_depth: 1 }
      }));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.data.root, root);
      assert.match(result.data.workspace_id, /^ws_[0-9a-f]{32}$/);
    } finally {
      await connection.close();
    }
  });
});

test("workspace readiness runs before handle issuance and refresh", async () => {
  await withTempWorkspace(async (root) => {
    const uses = [];
    const manager = new WorkspaceManager(configFor(root), binding({
      beforeWorkspaceUse: (canonicalRoot) => uses.push(canonicalRoot)
    }));
    const opened = manager.openWorkspace(root);
    manager.getWorkspace(opened.id);
    assert.deepEqual(uses, [root, root]);
  });
});

test("workspace readiness failure neither issues nor refreshes a handle", async () => {
  await withTempWorkspace(async (root) => {
    let fail = true;
    let now = 1_700_000_000_000;
    const manager = new WorkspaceManager(configFor(root), binding({
      now: () => now,
      beforeWorkspaceUse() {
        if (fail) throw new Error("TRANSACTION_RECOVERY_REQUIRED");
      }
    }));
    assert.throws(() => manager.openWorkspace(root), /TRANSACTION_RECOVERY_REQUIRED/);
    assert.deepEqual(manager.listWorkspaces(), []);
    fail = false;
    const opened = manager.openWorkspace(root);
    now += 30_000;
    fail = true;
    assert.throws(() => manager.getWorkspace(opened.id), /TRANSACTION_RECOVERY_REQUIRED/);
    now += 30_001;
    assert.throws(() => manager.getWorkspace(opened.id), /Unknown workspace_id/);
  });
});

test("atomic read-only server recovers before issuing a workspace handle", async () => {
  await withTempWorkspace(async (root) => {
    const recovered = [];
    const connection = await createServerClient(
      serverConfigFor(root, { writeMode: "off", fileTransactions: "atomic" }),
      {
        transactionRecoveryCoordinator: {
          ensureWorkspaceReady(canonicalRoot) {
            recovered.push(canonicalRoot);
          }
        }
      }
    );
    try {
      const opened = structured(await connection.client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }));
      assert.equal(opened.ok, true);
      assert.deepEqual(recovered, [root]);
    } finally {
      await connection.close();
    }
  });
});

test("legacy server ignores an injected transaction recovery coordinator", async () => {
  await withTempWorkspace(async (root) => {
    const recovered = [];
    const connection = await createServerClient(
      serverConfigFor(root, { fileTransactions: "legacy" }),
      {
        transactionRecoveryCoordinator: {
          ensureWorkspaceReady(canonicalRoot) {
            recovered.push(canonicalRoot);
          }
        }
      }
    );
    try {
      const opened = structured(await connection.client.callTool({
        name: "open_workspace",
        arguments: { root, include_tree: false }
      }));
      assert.equal(opened.ok, true);
      assert.deepEqual(recovered, []);
    } finally {
      await connection.close();
    }
  });
});

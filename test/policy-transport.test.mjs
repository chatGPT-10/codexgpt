import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const {
  createHttpPolicySessionSource,
  createStdioPolicySessionSource
} = await tsImport("../src/policy/identity.ts", import.meta.url);
const { acceptedAuthenticationMode } = await tsImport("../src/policy/transport.ts", import.meta.url);
const { policyIdentityScopes } = await tsImport("../src/policy/runtime.ts", import.meta.url);

function config(overrides = {}) {
  const root = process.cwd();
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
    policyEngineMode: "enforce",
    permissionProfileId: undefined,
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

async function withClient(server, callback) {
  const client = new Client({ name: "policy-transport-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

test("accepted HTTP authentication facts prefer Bearer and never return raw credentials", () => {
  assert.equal(acceptedAuthenticationMode({ authConfigured: true, bearerMatched: true, queryMatched: true }), "bearer");
  assert.equal(acceptedAuthenticationMode({ authConfigured: true, bearerMatched: false, queryMatched: true }), "query_token");
  assert.equal(acceptedAuthenticationMode({ authConfigured: false, bearerMatched: false, queryMatched: false }), "loopback_none");
  assert.throws(() => acceptedAuthenticationMode({ authConfigured: true, bearerMatched: false, queryMatched: false }), /authenticated/i);
});

test("policy identity scopes are conservative projections of current modes", () => {
  const off = policyIdentityScopes(config({ writeMode: "off", bashMode: "off" }));
  assert.ok(off.includes("filesystem:read"));
  assert.equal(off.includes("filesystem:write"), false);
  assert.equal(off.includes("shell:execute"), false);

  const full = policyIdentityScopes(config({ writeMode: "workspace", bashMode: "full" }));
  assert.ok(full.includes("filesystem:write"));
  assert.ok(full.includes("shell:verify"));
  assert.ok(full.includes("shell:execute"));
});

test("query and bearer session sources produce distinct safe identities", () => {
  const key = Buffer.alloc(32, 4);
  const scopes = policyIdentityScopes(config());
  const query = createHttpPolicySessionSource({
    authenticationMode: "query_token",
    configuredCredential: "shared-value-one",
    key,
    transportSessionId: () => "session-query",
    scopes
  });
  const bearer = createHttpPolicySessionSource({
    authenticationMode: "bearer",
    configuredCredential: "shared-value-one",
    key,
    transportSessionId: () => "session-bearer",
    scopes
  });
  assert.equal(query.identity.authenticationMode, "query_token");
  assert.equal(bearer.identity.authenticationMode, "bearer");
  assert.equal(query.identity.subject, null);
  assert.equal(JSON.stringify([query.identity, bearer.identity]).includes("shared-value-one"), false);
});

test("server builds the default enforce runtime from a STDIO context source", async () => {
  const cfg = config();
  const source = createStdioPolicySessionSource({
    sessionId: "stdio-policy-test",
    scopes: policyIdentityScopes(cfg)
  });
  const audits = [];
  const server = createCodexProServer(cfg, {
    policySessionContextSource: source,
    policyAuditSink: (event) => audits.push(event)
  });
  await withClient(server, async (client) => {
    const read = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.equal(read.isError, undefined);
    assert.equal(read.structuredContent.codexpro_tool, "read");

    const write = await client.callTool({ name: "write", arguments: { path: ".ai-bridge/policy-test.txt", content: "test" } });
    assert.equal(write.isError, true);
    assert.equal(write.structuredContent, undefined);
    assert.match(write.content[0].text, /APPROVAL_REQUIRED/);
  });
  assert.equal(audits.length, 2);
  assert.equal(audits[0].outcome, "allow");
  assert.equal(audits[1].outcome, "approval_required");
});

test("full Bash in enforce mode fails closed when OS sandbox capabilities are unavailable", async () => {
  const cfg = config({ bashMode: "full" });
  const source = createStdioPolicySessionSource({ sessionId: "stdio-bash-test", scopes: policyIdentityScopes(cfg) });
  const server = createCodexProServer(cfg, { policySessionContextSource: source });
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "bash", arguments: { command: "node --version" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /SHELL_SANDBOX_UNAVAILABLE/);
  });
});

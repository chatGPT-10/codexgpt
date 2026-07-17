import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const {
  createPolicyToolFailure,
  isPolicyToolFailure
} = await tsImport("../src/policy/integration.ts", import.meta.url);
const { TOOL_POLICY_DEFINITIONS } = await tsImport("../src/policy/toolPolicy.ts", import.meta.url);
const { CANONICAL_CODEXPRO_CHILD_TOOLS } = await tsImport("../src/tools/schemas/codexpro.ts", import.meta.url);

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
    toolMode: "minimal",
    policyEngineMode: "legacy",
    permissionProfileId: undefined,
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", "node_modules/**"],
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
  const client = new Client({ name: "policy-integration-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function denyDecision(code = "POLICY_DENIED") {
  return {
    schemaVersion: 1,
    decisionId: "decision-deny",
    outcome: "deny",
    reasonCode: code,
    policyRevision: "policy-test",
    resourceFingerprint: "sha256:" + "a".repeat(64),
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: [{
      sourceKind: "permission_profile",
      safeRuleId: "profile.test.deny",
      specificity: [1],
      grantId: null,
      approvalId: null,
      enforcementBackend: null
    }]
  };
}

function allowDecision() {
  return {
    ...denyDecision(),
    decisionId: "decision-allow",
    outcome: "allow",
    reasonCode: null,
    provenance: [{
      sourceKind: "session_grant",
      safeRuleId: "approval.r3.grant",
      specificity: [],
      grantId: "grant-v3",
      approvalId: null,
      enforcementBackend: null
    }]
  };
}

function fakeRuntime(mode, decision, audits = []) {
  return {
    mode,
    authorize(toolName) {
      return {
        decision,
        auditEvent: {
          schemaVersion: 1,
          eventId: `event-${toolName}`,
          timestamp: "2026-07-14T10:00:00.000Z",
          requestId: "request-1",
          decisionId: decision.decisionId,
          credentialRef: null,
          transportSessionId: "session-1",
          toolName,
          canonicalAction: toolName,
          workspaceId: "ws_test",
          relativeResourceSummary: "test",
          resourceFingerprint: decision.resourceFingerprint,
          policyRevision: decision.policyRevision,
          outcome: decision.outcome,
          reasonCode: decision.reasonCode,
          safeRuleIds: ["profile.test.deny"],
          approvalState: decision.outcome === "approval_required" ? "required" : "denied",
          grantId: null,
          sandboxBackend: "test-backend",
          durationMs: 0,
          resultCode: null,
          exitCode: null,
          boundedByteCounts: {}
        }
      };
    },
    audit(event) {
      audits.push(event);
    }
  };
}

test("every canonical child tool has one explicit policy definition", () => {
  assert.deepEqual(
    Object.keys(TOOL_POLICY_DEFINITIONS).sort(),
    [...CANONICAL_CODEXPRO_CHILD_TOOLS].sort()
  );
});

test("enforce denies the same read through direct and supertool paths", async () => {
  const runtime = fakeRuntime("enforce", denyDecision());
  const server = createCodexProServer(config({ policyEngineMode: "enforce", toolMode: "full" }), { policyRuntime: runtime });
  await withClient(server, async (client) => {
    const direct = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    const wrapped = await client.callTool({ name: "codexpro", arguments: { action: "read", args: { path: "README.md", end_line: 1 } } });
    assert.equal(direct.isError, true);
    assert.equal(wrapped.isError, true);
    assert.equal(direct.structuredContent, undefined);
    assert.equal(wrapped.structuredContent, undefined);
    assert.match(direct.content[0].text, /POLICY_DENIED/);
    assert.equal(wrapped.content[0].text, direct.content[0].text);
  });
});

test("legacy mode preserves existing exact tool envelopes", async () => {
  const server = createCodexProServer(config({ policyEngineMode: "legacy" }));
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.codexpro_tool, "read");
  });
});

test("shadow mode executes the legacy result and records only the comparison audit", async () => {
  const audits = [];
  const runtime = fakeRuntime("shadow", denyDecision(), audits);
  const server = createCodexProServer(config({ policyEngineMode: "shadow" }), { policyRuntime: runtime });
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.codexpro_tool, "read");
  });
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes(process.cwd()), false);
});

test("policy failures are branded non-enumerably and contain bounded safe text only", () => {
  const sensitiveMarker = "sensitive-marker-value";
  const failure = createPolicyToolFailure({ ...denyDecision(), unsafe: sensitiveMarker });
  assert.equal(isPolicyToolFailure(failure), true);
  assert.equal(Object.keys(failure).includes("policyFailure"), false);
  assert.equal(JSON.stringify(failure).includes(sensitiveMarker), false);
  assert.equal(failure.structuredContent, undefined);
  assert.equal(failure.isError, true);
});

test("a reserved V3 grant commits after required authorization audit and before one handler call", async () => {
  const order = [];
  let handlerCalls = 0;
  const runtime = {
    mode: "enforce",
    authorize() {
      return {
        decision: allowDecision(),
        auditEvent: null,
        auditContext: {
          authorizationEvent: {},
          requirement: "required",
          riskClass: "R3",
          mutating: false
        },
        reservation: {
          schemaVersion: 3,
          commit() { order.push("commit"); },
          burn() { order.push("burn"); }
        }
      };
    },
    audit() {},
    persistAuthorization() { order.push("authorization-audit"); },
    persistExecution() { order.push("execution-audit"); }
  };
  const server = createCodexProServer(config({ policyEngineMode: "enforce" }), {
    policyRuntime: runtime,
    readResultProvider() {
      handlerCalls += 1;
      order.push("handler");
      return {
        path: "README.md",
        text: "ok",
        startLine: 1,
        endLine: 1,
        totalLines: 1,
        bytes: 2,
        sha256: "a".repeat(64),
        truncated: false
      };
    }
  });
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.equal(result.isError, undefined);
  });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(order.slice(0, 3), ["authorization-audit", "commit", "handler"]);
  assert.equal(order.includes("burn"), false);
});

test("required authorization audit failure burns a V3 reservation and executes zero handlers", async () => {
  let handlerCalls = 0;
  let burns = 0;
  const runtime = {
    mode: "enforce",
    authorize() {
      return {
        decision: allowDecision(),
        auditEvent: null,
        auditContext: {
          authorizationEvent: {},
          requirement: "required",
          riskClass: "R3",
          mutating: false
        },
        reservation: {
          schemaVersion: 3,
          commit() { throw new Error("must not commit"); },
          burn() { burns += 1; }
        }
      };
    },
    audit() {},
    persistAuthorization() { throw new Error("AUDIT_UNAVAILABLE"); },
    persistExecution() {}
  };
  const server = createCodexProServer(config({ policyEngineMode: "enforce" }), {
    policyRuntime: runtime,
    readResultProvider() {
      handlerCalls += 1;
      return "must not execute";
    }
  });
  await withClient(server, async (client) => {
    const result = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /POLICY_CONFIG_INVALID/);
  });
  assert.equal(handlerCalls, 0);
  assert.equal(burns, 1);
});

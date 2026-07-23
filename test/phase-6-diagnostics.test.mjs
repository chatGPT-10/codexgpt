import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const { summarizeGuidanceDiagnostics } = await tsImport("../src/guidance/diagnostics.ts", import.meta.url);

function config(root) {
  return {
    defaultRoot: root, allowedRoots: [root], host: "127.0.0.1", port: 8787,
    widgetDomain: "https://example.invalid", authToken: undefined, requireHttpToken: false,
    allowedHosts: ["127.0.0.1:8787"], allowedOrigins: [], allowQueryToken: false,
    bashMode: "off", bashTranscript: "compact", requireBashSession: false,
    codexSessions: "off", codexDir: path.join(root, ".codex-test"), writeMode: "workspace",
    toolMode: "standard", guidanceMode: "standard", inheritEnv: false,
    maxReadBytes: 1_000_000, maxWriteBytes: 1_000_000, maxOutputBytes: 1_000_000,
    maxSearchResults: 200, maxHttpSessions: 16, httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge", toolCards: false, connectionTest: false, analysisEnabled: true,
    analysisLimits: { maxInventoryFiles: 20_000, maxAnalyzedFiles: 5_000, maxScannedBytes: 67_108_864, maxSymbols: 100_000, maxRelationships: 250_000 },
    instructionFallbacks: ["agents.md", ".agents.md"], maxInstructionTotalBytes: 32_768,
    maxSkillCandidates: 100, maxSkillCatalogChars: 8_000
  };
}

test("diagnostic summary remains concise and points to one next action", () => {
  const result = summarizeGuidanceDiagnostics([
    { status: "warning", code: "INSTRUCTION_NAME_COLLISION", path: "AGENTS.md", count: 2, action: "Remove the duplicate." },
    { status: "warning", code: "SKILL_SCAN_TRUNCATED", path: null, count: 1, action: "Raise the bounded scan cap." }
  ]);
  assert.equal(result.count, 3);
  assert.equal(result.first.code, "INSTRUCTION_NAME_COLLISION");
  assert.equal(result.action, "Remove the duplicate.");
});

test("guidance-only self-test cannot create the write-probe artifact", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-guidance-self-test-")));
  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-guidance-self-test", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name: "codexgpt_self_test", arguments: { guidance_only: true } });
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.data.request.write_probe, false);
    assert.equal(result.structuredContent.data.request.bash_probe, false);
    assert.equal(result.structuredContent.data.request.pro_context_probe, false);
    assert.equal(result.structuredContent.data.request.include_global_skills, false);
    assert.equal(result.structuredContent.data.guidance_mode, "standard");
    assert.equal(result.structuredContent.data.guidance_status, "ok");
    assert.deepEqual(result.structuredContent.data.guidance_diagnostics, []);
    assert.equal(result.structuredContent.data.skill_scan.invalid_count, 0);
    assert.equal(result.structuredContent.data.probe_artifact, null);
    assert.deepEqual(result.structuredContent.data.files_touched, []);
    await assert.rejects(() => fs.stat(path.join(root, ".ai-bridge", "codexgpt-self-test.md")), { code: "ENOENT" });
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

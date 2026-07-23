import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);

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
    contextDir: ".ai-bridge", toolCards: false, connectionTest: false,
    analysisEnabled: true,
    analysisLimits: { maxInventoryFiles: 20_000, maxAnalyzedFiles: 5_000, maxScannedBytes: 67_108_864, maxSymbols: 100_000, maxRelationships: 250_000 },
    instructionFallbacks: [], maxInstructionTotalBytes: 32_768, maxSkillCandidates: 100, maxSkillCatalogChars: 8_000
  };
}

test("standard workspace open returns root instruction bodies and bounded Skill metadata", async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "phase6-root-bootstrap-"));
  const root = await fs.realpath(created);
  await fs.writeFile(path.join(root, "AGENTS.md"), "ROOT GUIDANCE");
  const skillDir = path.join(root, ".agents", "skills", "verify-build");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: verify-build\ndescription: Verify the build\n---\nSECRET BODY MUST STAY LAZY\n");

  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-root-bootstrap", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.data.guidance_mode, "standard");
    assert.equal(result.structuredContent.data.instruction_chain[0].text, "ROOT GUIDANCE");
    assert.deepEqual(result.structuredContent.data.skill_catalog.map((item) => item.name), ["verify-build"]);
    const text = result.content.map((item) => item.text ?? "").join("\n");
    assert.match(text, /ROOT GUIDANCE/);
    assert.match(text, /verify-build/);
    assert.doesNotMatch(text, /SECRET BODY MUST STAY LAZY/);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(created, { recursive: true, force: true });
  }
});

test("standard server config exposes ready status without changing the legacy shape", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-server-config-")));
  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-server-config", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name: "server_config", arguments: {} });
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.data.guidanceMode, "standard");
    assert.equal(result.structuredContent.data.guidanceReadiness, "ready");
    assert.equal(result.structuredContent.data.maxInstructionTotalBytes, 32_768);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("connection-test mode keeps dynamic context and lifecycle mutation tools hidden", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-connection-test-")));
  const server = createCodexGPTServer({ ...config(root), connectionTest: true });
  const client = new Client({ name: "phase6-connection-test", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    assert.equal(names.has("codex_context"), false);
    assert.equal(names.has("close_workspace"), false);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("standard load_skill reports stable resource policy failures", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-resource-error-")));
  const skillDir = path.join(root, ".agents", "skills", "resource-error");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: resource-error\ndescription: Resource error contract\n---\nBody");
  await fs.writeFile(path.join(skillDir, "references", ".env"), "TOKEN=not-returned");
  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-resource-error", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({
      name: "load_skill",
      arguments: { name: "resource-error", target_path: ".", resource_path: "references/.env" }
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "SKILL_RESOURCE_BLOCKED");
    assert.equal(JSON.stringify(result).includes("not-returned"), false);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("standard open reports invalid Skills and never auto-discloses explicit-only metadata", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-open-diagnostics-")));
  const invalid = path.join(root, ".agents", "skills", "invalid");
  const explicitOnly = path.join(root, ".agents", "skills", "explicit-only");
  await fs.mkdir(path.join(explicitOnly, "agents"), { recursive: true });
  await fs.mkdir(invalid, { recursive: true });
  await fs.writeFile(path.join(invalid, "SKILL.md"), "not frontmatter");
  await fs.writeFile(path.join(explicitOnly, "SKILL.md"), "---\nname: explicit-only\ndescription: MUST NOT AUTO DISCLOSE\n---\nBody");
  await fs.writeFile(path.join(explicitOnly, "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-open-diagnostics", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name: "open_current_workspace", arguments: {} });
    assert.equal(result.structuredContent.data.guidance_status, "warning");
    assert.equal(result.structuredContent.data.skill_scan.invalid_count, 1);
    assert.ok(result.structuredContent.data.instruction_diagnostics.some((item) => item.code === "SKILL_METADATA_INVALID"));
    assert.equal(JSON.stringify(result.structuredContent).includes("MUST NOT AUTO DISCLOSE"), false);
    assert.equal(JSON.stringify(result.structuredContent).includes("explicit-only"), false);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("standard direct and supertool open return the same guidance projection", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-supertool-parity-")));
  await fs.writeFile(path.join(root, "AGENTS.md"), "SUPERTOOL RULES");
  const server = createCodexGPTServer(config(root));
  const client = new Client({ name: "phase6-supertool-parity", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const direct = await client.callTool({ name: "open_current_workspace", arguments: {} });
    const wrapped = await client.callTool({ name: "codexgpt", arguments: { action: "open", args: {} } });
    const fields = (data) => ({
      guidance_mode: data.guidance_mode,
      guidance_status: data.guidance_status,
      instruction_chain: data.instruction_chain,
      skill_catalog: data.skill_catalog,
      skill_scan: data.skill_scan
    });
    assert.deepEqual(fields(wrapped.structuredContent.data), fields(direct.structuredContent.data));
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});

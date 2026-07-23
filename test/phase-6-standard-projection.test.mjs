import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);

function config(root, guidanceMode = "standard") {
  return {
    defaultRoot: root, allowedRoots: [root], host: "127.0.0.1", port: 8787, widgetDomain: "https://example.invalid",
    requireHttpToken: false, allowedHosts: ["127.0.0.1:8787"], allowedOrigins: [], allowQueryToken: false,
    bashMode: "off", bashTranscript: "compact", requireBashSession: false, codexSessions: "off", codexDir: path.join(root, ".codex-test"),
    writeMode: "workspace", toolMode: "standard", guidanceMode, inheritEnv: false, maxReadBytes: 1_000_000, maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000, maxSearchResults: 200, maxHttpSessions: 16, httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"], contextDir: ".ai-bridge", toolCards: false,
    connectionTest: false, analysisEnabled: true,
    analysisLimits: { maxInventoryFiles: 20_000, maxAnalyzedFiles: 5_000, maxScannedBytes: 67_108_864, maxSymbols: 100_000, maxRelationships: 250_000 },
    instructionFallbacks: [], maxInstructionTotalBytes: 32_768, maxSkillCandidates: 100, maxSkillCatalogChars: 8_000
  };
}

async function withClient(serverConfig, callback) {
  const server = createCodexGPTServer(serverConfig);
  const client = new Client({ name: "phase6-standard-projection", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try { return await callback(client); } finally { await Promise.allSettled([client.close(), server.close()]); }
}

test("standard guidance promotes existing codex_context without changing legacy standard projection", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-projection-")));
  try {
    await withClient(config(root, "legacy"), async (client) => {
      assert.equal((await client.listTools()).tools.some((tool) => tool.name === "codex_context"), false);
    });
    await withClient(config(root, "standard"), async (client) => {
      assert.equal((await client.listTools()).tools.some((tool) => tool.name === "codex_context"), true);
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard codex_context returns target instruction chain and matching target Skill catalog with quiet defaults", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-context-")));
  try {
    await fs.mkdir(path.join(root, "packages", "app", ".agents", "skills", "app-flow"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "root rules");
    await fs.writeFile(path.join(root, "packages", "app", "AGENTS.md"), "app rules");
    await fs.writeFile(path.join(root, "packages", "app", ".agents", "skills", "app-flow", "SKILL.md"), "---\nname: app-flow\ndescription: Work on app\n---\napp body");
    await withClient(config(root), async (client) => {
      const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
      const workspaceId = opened.structuredContent.data.workspace_id;
      const result = await client.callTool({ name: "codex_context", arguments: { workspace_id: workspaceId, target_path: "packages/app/file.ts" } });
      assert.equal(result.structuredContent.ok, true, JSON.stringify(result.structuredContent));
      const data = result.structuredContent.data;
      assert.equal(data.guidance_mode, "standard");
      assert.deepEqual(data.instruction_chain.map((item) => item.text), ["root rules", "app rules"]);
      assert.deepEqual(data.skill_catalog.map((item) => item.name), ["app-flow"]);
      assert.equal(data.include_ai_bridge, false);
      assert.equal(data.include_git_status, false);
      assert.equal(data.include_git_diff, false);
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard load_skill binds bare-name resolution to target scope and keeps global discovery off", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-load-target-")));
  try {
    const rootSkill = path.join(root, ".agents", "skills", "duplicate");
    const nestedSkill = path.join(root, "nested", ".agents", "skills", "duplicate");
    await fs.mkdir(rootSkill, { recursive: true });
    await fs.mkdir(nestedSkill, { recursive: true });
    await fs.writeFile(path.join(rootSkill, "SKILL.md"), "---\nname: duplicate\ndescription: Root workflow\n---\nROOT BODY");
    await fs.writeFile(path.join(nestedSkill, "SKILL.md"), "---\nname: duplicate\ndescription: Nested workflow\n---\nNESTED BODY");
    await fs.mkdir(path.join(nestedSkill, "references"), { recursive: true });
    await fs.writeFile(path.join(nestedSkill, "references", "guide.md"), "RESOURCE BODY");
    await withClient(config(root), async (client) => {
      const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
      const result = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        target_path: "nested/file.ts",
        name: "duplicate",
        path: "$WORKSPACE/nested/.agents/skills/duplicate/SKILL.md"
      } });
      assert.equal(result.structuredContent.ok, true, JSON.stringify(result.structuredContent));
      assert.match(result.structuredContent.data.text, /NESTED BODY/);
      assert.doesNotMatch(result.structuredContent.data.text, /ROOT BODY/);
      assert.equal(result.structuredContent.data.include_global_skills, false);
      const indexed = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        target_path: "nested/file.ts",
        name: "duplicate",
        path: "$WORKSPACE/nested/.agents/skills/duplicate/SKILL.md",
        include_resource_index: true
      } });
      assert.equal(indexed.structuredContent.data.kind, "body_with_index");
      assert.deepEqual(indexed.structuredContent.data.resource_index, ["references/guide.md"]);
      const resource = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        target_path: "nested/file.ts",
        name: "duplicate",
        path: "$WORKSPACE/nested/.agents/skills/duplicate/SKILL.md",
        resource_path: "references/guide.md"
      } });
      assert.equal(resource.structuredContent.data.kind, "resource");
      assert.equal(resource.structuredContent.data.text, "RESOURCE BODY");
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard global Skill identity stays private until an explicit configured-root selector is used", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-global-private-")));
  try {
    const codexDir = path.join(root, "configured-codex-home");
    const globalSkill = path.join(codexDir, "skills", "private-flow");
    await fs.mkdir(globalSkill, { recursive: true });
    await fs.writeFile(path.join(globalSkill, "SKILL.md"), "---\nname: private-flow\ndescription: Private workflow\n---\nPRIVATE GLOBAL BODY");
    await withClient({ ...config(root), codexDir }, async (client) => {
      const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
      assert.equal(JSON.stringify(opened.structuredContent).includes("private-flow"), false);
      const optedIn = await client.callTool({ name: "open_current_workspace", arguments: { include_skills: true, include_global_skills: true } });
      assert.equal(optedIn.structuredContent.data.skill_catalog.some((item) => item.name === "private-flow"), true);
      const loaded = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        name: "private-flow",
        source: "user",
        path: "$CODEX_DIR/skills/private-flow/SKILL.md"
      } });
      assert.equal(loaded.structuredContent.ok, true, JSON.stringify(loaded.structuredContent));
      assert.match(loaded.structuredContent.data.text, /PRIVATE GLOBAL BODY/);
      assert.equal(loaded.structuredContent.data.include_global_skills, true);
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard body loading truncates safely and canonicalizes indexed target identity", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-load-truncate-")));
  try {
    const skillDir = path.join(root, "nested", ".agents", "skills", "large");
    await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: large\ndescription: Large body\n---\n${"x".repeat(2_000)}`);
    await fs.writeFile(path.join(skillDir, "references", "guide.md"), "guide");
    await withClient(config(root), async (client) => {
      const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
      const result = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        target_path: "nested/./file.ts",
        name: "large",
        path: "$WORKSPACE/nested/.agents/skills/large/SKILL.md",
        max_bytes: 1_000,
        include_resource_index: true
      } });
      assert.equal(result.structuredContent.ok, true, JSON.stringify(result.structuredContent));
      assert.equal(result.structuredContent.data.truncated, true);
      assert.equal(result.structuredContent.data.returned_bytes <= 1_000, true);
      assert.equal(result.structuredContent.data.target_path, "nested/file.ts");
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard bare-name loading refuses implicit-disabled Skills while exact selection remains available", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-explicit-skill-")));
  try {
    const skillDir = path.join(root, ".agents", "skills", "explicit-only");
    await fs.mkdir(path.join(skillDir, "agents"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: explicit-only\ndescription: Explicit workflow\n---\nEXPLICIT BODY");
    await fs.writeFile(path.join(skillDir, "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
    await withClient(config(root), async (client) => {
      const opened = await client.callTool({ name: "open_current_workspace", arguments: {} });
      const bare = await client.callTool({ name: "load_skill", arguments: { workspace_id: opened.structuredContent.data.workspace_id, name: "explicit-only" } });
      assert.equal(bare.structuredContent.error.code, "SKILL_NOT_FOUND");
      const exact = await client.callTool({ name: "load_skill", arguments: {
        workspace_id: opened.structuredContent.data.workspace_id,
        name: "explicit-only",
        path: "$WORKSPACE/.agents/skills/explicit-only/SKILL.md"
      } });
      assert.equal(exact.structuredContent.ok, true, JSON.stringify(exact.structuredContent));
      assert.match(exact.structuredContent.data.text, /EXPLICIT BODY/);
      assert.match(exact.content.map((item) => item.text ?? "").join("\n"), /explicit selection required; never invoke this Skill implicitly/);
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("standard explicit global discovery shares one strict candidate budget with workspace discovery", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-global-budget-")));
  try {
    const workspaceSkill = path.join(root, ".agents", "skills", "workspace-only");
    const codexDir = path.join(root, "configured-codex-home");
    const globalSkill = path.join(codexDir, "skills", "global-over-budget");
    await fs.mkdir(workspaceSkill, { recursive: true });
    await fs.mkdir(globalSkill, { recursive: true });
    await fs.writeFile(path.join(workspaceSkill, "SKILL.md"), "---\nname: workspace-only\ndescription: Workspace workflow\n---\nBody");
    await fs.writeFile(path.join(globalSkill, "SKILL.md"), "---\nname: global-over-budget\ndescription: Global workflow\n---\nBody");
    await withClient({ ...config(root), codexDir, maxSkillCandidates: 1 }, async (client) => {
      const result = await client.callTool({ name: "open_current_workspace", arguments: { include_global_skills: true } });
      assert.equal(result.structuredContent.ok, true, JSON.stringify(result.structuredContent));
      assert.equal(result.structuredContent.data.skill_scan.candidate_count <= 1, true);
      assert.equal(result.structuredContent.data.skill_scan.scan_truncated, true);
      assert.equal(result.structuredContent.data.skill_catalog.some((item) => item.name === "global-over-budget"), false);
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

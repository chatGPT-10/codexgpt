import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createProductionCodexGPTServer } from "../dist/productionRuntime.js";
import { createStdioPolicySessionSource } from "../dist/policy/identity.js";
import { policyIdentityScopes } from "../dist/policy/runtime.js";

for (const policyMode of ['legacy', 'enforce']) {
test(`C2C production V1 atomic handoff preserves ${policyMode} Policy and source access`, async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "c2c-production-"));
  const root = await fs.realpath(created);
  const workspace = path.join(root, "workspace");
  const stateHome = path.join(root, "state");
  let server;
  let client;
  try {
    await fs.mkdir(path.join(workspace, "src"), { recursive: true });
    const sourcePath = path.join(workspace, "src", "sample.ts");
    await fs.writeFile(sourcePath, "export const value = 1;\n");
    const git = (...args) => execFileSync("git", ["-C", workspace, "-c", "core.autocrlf=false", ...args], { encoding: "utf8" });
    git("init", "--quiet");
    git("add", "src/sample.ts");
    git("-c", "user.name=C2C Test", "-c", "user.email=c2c@example.invalid", "commit", "--quiet", "-m", "fixture");
    const expectedSource = "export const value = 2;\n";
    await fs.writeFile(sourcePath, expectedSource);
    const environment = {
      CODEXGPT_HOME: stateHome, LOCALAPPDATA: path.join(root, "local-data"),
      CODEXGPT_AUTH_MODE: "legacy", CODEXGPT_C2C_RUNTIME: "1",
      CODEXGPT_FILE_TRANSACTIONS: "atomic", CODEXGPT_AUDIT_MODE: "required",
      CODEXGPT_POLICY_ENGINE: policyMode, CODEXGPT_TOOL_CONTRACT_VERSION: "1",
      CODEXGPT_TOOL_MODE: "standard", CODEXGPT_CODEX_SESSIONS: "off",
      CODEXGPT_GUIDANCE_MODE: "legacy", CODEXGPT_EXECUTION_PROFILE: "off",
      CODEXGPT_GIT_MODE: "read", CODEXGPT_GIT_INTEGRATIONS: "off"
    };
    const config = loadConfig(["--root", workspace, "--bash", "off", "--write", "handoff"], { cwd: workspace, environment });
    const policySessionContextSource = createStdioPolicySessionSource({ sessionId: "c2c-production-v1", scopes: policyIdentityScopes(config) });
    server = createProductionCodexGPTServer(config, { stateRootOptions: { env: environment }, policySessionContextSource });
    client = new Client({ name: "c2c-production", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    const opened = await client.callTool({ name: "open_current_workspace", arguments: { include_tree: false } });
    assert.equal(opened.structuredContent.ok, true, JSON.stringify(opened.structuredContent));
    const workspace_id = opened.structuredContent.data.workspace_id;
    for (const action of ["write", "edit", "apply_patch", "bash", "run_command", "start_process", "git_stage", "git_commit", "agent_handoff", "pro_export"]) {
      const denied = await client.callTool({ name: "codexgpt", arguments: { action, args: { workspace_id, path: "src/sample.ts", content: "unsafe" } } });
      assert.equal(denied.isError, true, action);
      assert.equal(denied.structuredContent.error.code, "ACTION_NOT_AVAILABLE", action);
    }
    const diff = await client.callTool({ name: "git_diff", arguments: { workspace_id, path: "src/sample.ts" } });
    assert.equal(diff.structuredContent?.ok, true, JSON.stringify(diff));
    assert.match(diff.structuredContent.data.diff, /\+export const value = 2;/);
    const handoff = await client.callTool({ name: "handoff_to_codex", arguments: { workspace_id, title: "C2C atomic smoke", plan: "Review src/sample.ts; preserve the current source contents." } });
    if (policyMode === 'enforce') {
      assert.equal(handoff.isError, true);
      assert.match(JSON.stringify(handoff), /APPROVAL_REQUIRED/);
      await assert.rejects(fs.stat(path.join(workspace, '.ai-bridge', 'current-plan.md')), { code: 'ENOENT' });
      assert.equal(await fs.readFile(sourcePath, 'utf8'), expectedSource);
      return;
    }
    assert.equal(handoff.structuredContent?.ok, true, JSON.stringify(handoff));
    const plan = await fs.readFile(path.join(workspace, ".ai-bridge", "current-plan.md"), "utf8");
    assert.match(plan, /Review src\/sample.ts/);
    assert.equal(await fs.readFile(sourcePath, "utf8"), expectedSource);
    const segments = await fs.readdir(path.join(stateHome, "state", "v1", "audit", "segments"));
    assert.ok(segments.some((name) => name.endsWith(".jsonl")), "production audit must be durable");
    const audit = (await Promise.all(segments.filter((name) => name.endsWith(".jsonl")).map((name) => fs.readFile(path.join(stateHome, "state", "v1", "audit", "segments", name), "utf8")))).join("\n");
    assert.match(audit, /handoff_to_codex/);
  } finally {
    await Promise.allSettled([client?.close(), server?.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
});
}

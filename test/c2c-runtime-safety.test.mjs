import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const { upgradeCodexGPTSupertool } = await tsImport("../src/codexgptSupertool.ts", import.meta.url);

const denied = ["write", "edit", "apply_patch", "bash", "run_command", "start_process",
  "write_process_input", "interrupt_process", "terminate_process", "resize_process_terminal",
  "open_full_access_workspace", "git_create_branch", "git_stage", "git_commit", "git_restore",
  "git_stash", "create_task_worktree", "merge_task_worktree", "remove_task_worktree",
  "undo_change_set", "handoff_to_agent", "export_pro_context", "codex_sessions", "read_codex_session"];

async function fixture(authMode, toolContractVersion, run) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "c2c-runtime-safety-"));
  const root = await fs.realpath(created);
  let server;
  let client;
  try {
    await fs.writeFile(path.join(root, "demo.txt"), "before\n");
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "sample.ts"), "export const value = 1;\n");
    execFileSync("git", ["init", "--quiet", root]);
    execFileSync("git", ["-C", root, "-c", "core.autocrlf=false", "add", "demo.txt"]);
    execFileSync("git", ["-C", root, "-c", "user.name=C2C Test", "-c", "user.email=c2c@example.invalid", "commit", "--quiet", "-m", "fixture"]);
    await fs.writeFile(path.join(root, "demo.txt"), "before\nafter\n");
    const loaded = loadConfig(["--root", root, "--bash", "off", "--write", "handoff"], {
      cwd: root,
      environment: {
        LOCALAPPDATA: path.join(root, "local-data"),
        CODEXGPT_AUTH_MODE: "legacy", CODEXGPT_TOOL_MODE: "standard",
        CODEXGPT_POLICY_ENGINE: "legacy", CODEXGPT_FILE_TRANSACTIONS: "legacy",
        CODEXGPT_GUIDANCE_MODE: "legacy", CODEXGPT_TOOL_CONTRACT_VERSION: "1"
      }
    });
    // Exercise OAuth-specific tool projection, not HTTP authentication or an OAuth grant.
    const config = { ...loaded, authMode, c2cRuntime: true, toolContractVersion,
      semanticMode: toolContractVersion === 5 ? "standard" : "legacy",
      codexSessions: "off", executionProfile: "off", gitMode: "read", gitIntegrations: "off", toolCards: false };
    server = createCodexGPTServer(config);
    client = new Client({ name: "c2c-runtime-safety", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    await run(client, root);
  } finally {
    await Promise.allSettled([client?.close(), server?.close()]);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function mustDeny(client, name, args) {
  try {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name}/${args.action ?? "direct"} unexpectedly succeeded`);
    if (name === "codexgpt") assert.equal(result.structuredContent?.error?.code, "ACTION_NOT_AVAILABLE");
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    assert.match(String(error), /not found|not available|unknown tool/i);
  }
}

for (const authMode of ["legacy", "oauth"]) {
  for (const version of [1]) {
    test(`C2C ${authMode} V${version} rejects direct and wrapper mutations without touching source`, async () => {
      await fixture(authMode, version, async (client, root) => {
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        for (const name of denied) assert.ok(!names.includes(name), `${name} must be hidden`);
        for (const name of ["handoff_to_codex", "read", "git_diff", "show_changes"]) assert.ok(names.includes(name), `${name} must remain available`);
        const opened = await client.callTool({ name: "open_current_workspace", arguments: { include_tree: false } });
        const workspace_id = opened.structuredContent.data.workspace_id;
        const traversal = await client.callTool({ name: "read", arguments: { workspace_id, path: "../outside.txt" } });
        assert.equal(traversal.isError, true);
        const args = { workspace_id, path: "demo.txt", content: "unsafe\n", old_text: "before", new_text: "unsafe",
          patch: "--- a/demo.txt\n+++ b/demo.txt\n@@ -1,2 +1 @@\n-before\n-after\n+unsafe\n",
          command: "echo unsafe", plan: "unsafe", title: "unsafe", name: "unsafe", branch: "unsafe" };
        for (const name of denied) {
          await mustDeny(client, name, args);
          await mustDeny(client, "codexgpt", { action: name, args });
        }
        for (const name of ["write", "edit", "apply_patch"]) {
          const sourceArgs = { workspace_id, path: "src/sample.ts", content: "unsafe\n", old_text: "export const value = 1;", new_text: "unsafe",
            patch: "--- a/src/sample.ts\n+++ b/src/sample.ts\n@@ -1 +1 @@\n-export const value = 1;\n+unsafe\n" };
          await mustDeny(client, name, sourceArgs);
          await mustDeny(client, "codexgpt", { action: name, args: sourceArgs });
        }
        assert.equal(await fs.readFile(path.join(root, "src", "sample.ts"), "utf8"), "export const value = 1;\n");
        for (const action of ["agent_handoff", "pro_export", "verify_change"]) {
          await mustDeny(client, "codexgpt", { action, args });
        }
        await mustDeny(client, "codexgpt", { action: "write", args: { workspace_id, path: ".ai-bridge/current-plan.md", content: "unsafe" } });
        assert.equal(await fs.readFile(path.join(root, "demo.txt"), "utf8"), "before\nafter\n");
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge/current-plan.md")), { code: "ENOENT" });
        const diff = await client.callTool({ name: "git_diff", arguments: { workspace_id, path: "demo.txt" } });
        assert.equal(diff.isError, undefined);
        assert.equal(diff.structuredContent.ok, true);
        assert.match(diff.structuredContent.data.diff, /\+after/);
        const secretPlan = await client.callTool({ name: "handoff_to_codex", arguments: { workspace_id, plan: "sk-" + "R".repeat(24) } });
        assert.equal(secretPlan.isError, true);
        assert.equal(secretPlan.structuredContent.error.code, "PLAN_SECRET_BLOCKED");
        await assert.rejects(fs.stat(path.join(root, ".ai-bridge/current-plan.md")), { code: "ENOENT" });
        const handoff = await client.callTool({ name: "handoff_to_codex", arguments: { workspace_id, title: "Bounded C2C plan", plan: "Review demo.txt and preserve its existing content." } });
        assert.equal(handoff.isError, undefined, JSON.stringify(handoff.structuredContent));
        assert.equal(handoff.structuredContent.ok, true);
        assert.match(await fs.readFile(path.join(root, ".ai-bridge/current-plan.md"), "utf8"), /Review demo.txt/);
        assert.equal(await fs.readFile(path.join(root, "demo.txt"), "utf8"), "before\nafter\n");
      });
    });
  }
}

test("C2C V5 wrapper advertises no workflow actions and cannot invoke a supplied verification handler", async () => {
  let called = false;
  const server = { _registeredTools: { codexgpt: { handler: async () => ({}) } } };
  upgradeCodexGPTSupertool(server, 5, {
    disableWorkflowActions: true,
    verifyChange: async () => { called = true; throw new Error("must never run"); }
  });
  const handler = server._registeredTools.codexgpt.handler;
  const actions = await handler({ action: "list_actions" });
  assert.equal(actions.structuredContent.ok, true);
  assert.deepEqual(actions.structuredContent.data.workflow_actions, []);
  const deniedResult = await handler({ action: "verify_change", args: {} });
  assert.equal(deniedResult.isError, true);
  assert.equal(deniedResult.structuredContent.error.code, "ACTION_NOT_AVAILABLE");
  assert.equal(called, false);
});

test("C2C handoff refuses a junction redirect for its fixed context directory", async () => {
  await fixture("legacy", 1, async (client, root) => {
    const escape = path.join(root, "redirect-target");
    await fs.mkdir(escape);
    await fs.symlink(escape, path.join(root, ".ai-bridge"), process.platform === "win32" ? "junction" : "dir");
    const result = await client.callTool({ name: "handoff_to_codex", arguments: { plan: "Review demo.txt." } });
    assert.equal(result.isError, true);
    await assert.rejects(fs.stat(path.join(escape, "current-plan.md")), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(root, "demo.txt"), "utf8"), "before\nafter\n");
  });
});

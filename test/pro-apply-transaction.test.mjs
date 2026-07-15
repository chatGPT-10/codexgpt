import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { aiBridgeScaffoldWrites, prepareWorkspaceTextBatch } from "../dist/fsOps.js";
import { PathGuard, WorkspaceManager } from "../dist/guard.js";
import { LocalMutationService } from "../dist/mutations/index.js";

async function fixture(action) {
  const root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-pro-apply-")));
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  try {
    return await action({ root, workspaceRoot });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test("pro-apply commits scaffold, plan, and both logs atomically and append preserves prior plan", () => fixture(async ({ root, workspaceRoot }) => {
  const firstPlan = path.join(root, "first-plan.md");
  const secondPlan = path.join(root, "second-plan.md");
  await fsp.writeFile(firstPlan, "# First Plan\n\nDo one thing.\n");
  await fsp.writeFile(secondPlan, "# Second Plan\n\nDo another thing.\n");
  const env = {
    ...process.env,
    CODEXPRO_HOME: path.join(root, "codex-home"),
    CODEXPRO_AUDIT_MODE: "required"
  };
  const first = spawnSync(process.execPath, [
    "scripts/pro-apply.mjs",
    "--root", workspaceRoot,
    "--file", firstPlan
  ], { cwd: process.cwd(), env, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = spawnSync(process.execPath, [
    "scripts/pro-apply.mjs",
    "--root", workspaceRoot,
    "--file", secondPlan,
    "--append"
  ], { cwd: process.cwd(), env, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr || second.stdout);

  const bridge = path.join(workspaceRoot, ".ai-bridge");
  const plan = await fsp.readFile(path.join(bridge, "current-plan.md"), "utf8");
  assert.match(plan, /# First Plan/);
  assert.match(plan, /# Second Plan/);
  assert.match(plan, /\n---\n/);
  for (const logName of ["session-log.jsonl", "execution-log.jsonl"]) {
    const records = (await fsp.readFile(path.join(bridge, logName), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.equal(records.every((record) => record.event === "pro_apply"), true);
  }
}));

test("pro-apply mutation service rolls back every file when durable audit fails", () => fixture(async ({ root, workspaceRoot }) => {
  const config = loadConfig(["--root", workspaceRoot]);
  const guard = new PathGuard(config);
  const workspaces = new WorkspaceManager(config);
  const workspace = workspaces.openWorkspace(workspaceRoot);
  const prepared = await prepareWorkspaceTextBatch(
    config,
    guard,
    workspace,
    aiBridgeScaffoldWrites(config)
  );
  const service = new LocalMutationService(config, guard, {
    stateRoot: path.join(root, "state"),
    persistAudit: async () => { throw new Error("injected audit failure"); }
  });
  try {
    await assert.rejects(
      () => service.executeBatch(workspace, prepared, { ok: true }, { toolName: "pro_apply" }),
      (error) => error.code === "AUDIT_UNAVAILABLE"
    );
  } finally {
    service.dispose();
  }
  await assert.rejects(() => fsp.stat(path.join(workspaceRoot, ".ai-bridge")), { code: "ENOENT" });
}));

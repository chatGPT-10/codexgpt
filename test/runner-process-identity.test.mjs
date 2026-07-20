import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { processCreationTime } from "../scripts/long-task-runner.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(repositoryRoot, "scripts", "long-task-runner.mjs");
const longFixture = path.join(repositoryRoot, "fixtures", "runner-long-lived-child.mjs");

async function execute(args, options = {}) {
  return await execFileAsync(process.execPath, [runner, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
}

async function waitForCompletion(root, runId, deadlineMs = 15_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const state = JSON.parse((await execute(["status", "--root", root, "--run", runId])).stdout);
    if (state.status === "completed" || state.status === "stopped") return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Run ${runId} did not become terminal.`);
}

test("process creation identity is available for the current process", async () => {
  const created = await processCreationTime(process.pid);
  assert.equal(typeof created, "string");
  assert.ok(created.length > 0);
});

test("worker evidence mismatch makes a live PID stale and never blocks a same-kind retry", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-runner-identity-"));
  let first;
  let second;
  try {
    first = JSON.parse((await execute([
      "start",
      "--root", root,
      "--kind", "identity-probe",
      "--",
      process.execPath,
      longFixture,
      "2500"
    ])).stdout);

    const evidencePath = path.join(first.directory, "worker-evidence.json");
    const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
    evidence.workerNonce = "0".repeat(64);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

    const stale = JSON.parse((await execute(["status", "--root", root, "--run", first.runId])).stdout);
    assert.equal(stale.status, "stale");
    assert.equal(stale.identity.owned, false);
    assert.equal(stale.identity.reason, "worker_evidence_mismatch");

    second = JSON.parse((await execute([
      "start",
      "--root", root,
      "--kind", "identity-probe",
      "--",
      process.execPath,
      "-e",
      "console.log('replacement-run')"
    ])).stdout);
    assert.notEqual(second.runId, first.runId);
    assert.ok(["running", "completed"].includes(second.status));
    const completedSecond = second.status === "completed" ? second : await waitForCompletion(root, second.runId);
    assert.equal(completedSecond.result.exitCode, 0);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const completedFirst = JSON.parse((await execute(["status", "--root", root, "--run", first.runId])).stdout);
    assert.equal(completedFirst.status, "completed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("replacing a run directory is detected before status trusts replacement metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-runner-path-"));
  try {
    const started = JSON.parse((await execute([
      "start",
      "--root", root,
      "--kind", "path-probe",
      "--",
      process.execPath,
      longFixture,
      "1200"
    ])).stdout);
    const moved = `${started.directory}-original`;
    await fs.rename(started.directory, moved);
    await fs.mkdir(started.directory);
    for (const name of ["metadata.json", "worker-evidence.json", "command.json"]) {
      await fs.copyFile(path.join(moved, name), path.join(started.directory, name));
    }

    await assert.rejects(
      execute(["status", "--root", root, "--run", started.runId]),
      (error) => error.code === 1 && /directory identity changed/.test(error.stderr)
    );
    await new Promise((resolve) => setTimeout(resolve, 1600));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

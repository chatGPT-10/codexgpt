import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(repositoryRoot, "scripts", "long-task-runner.mjs");
const floodFixture = path.join(repositoryRoot, "fixtures", "runner-output-flood-child.mjs");

async function execute(args, options = {}) {
  return await execFileAsync(process.execPath, [runner, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
}

async function waitForTerminal(root, runId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = JSON.parse((await execute(["status", "--root", root, "--run", runId])).stdout);
    if (state.status === "completed") return state;
    assert.notEqual(state.status, "stale");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Runner flood fixture did not complete.");
}

test("detached runner retains a bounded tail and records dropped stdout/stderr bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-bounds-"));
  try {
    const started = JSON.parse((await execute([
      "start",
      "--root", root,
      "--kind", "bounded-flood",
      "--log-limit-bytes", "4096",
      "--",
      process.execPath,
      floodFixture,
      "262144"
    ])).stdout);
    const state = await waitForTerminal(root, started.runId);
    const [stdout, stderr, stdoutStat, stderrStat] = await Promise.all([
      fs.readFile(state.result.stdoutPath, "utf8"),
      fs.readFile(state.result.stderrPath, "utf8"),
      fs.stat(state.result.stdoutPath),
      fs.stat(state.result.stderrPath)
    ]);

    assert.ok(stdoutStat.size <= 4096);
    assert.ok(stderrStat.size <= 4096);
    assert.match(stdout, /STDOUT-TAIL/);
    assert.match(stderr, /STDERR-TAIL/);
    assert.equal(state.result.stdout.retainedBytes, stdoutStat.size);
    assert.equal(state.result.stderr.retainedBytes, stderrStat.size);
    assert.ok(state.result.stdout.droppedBytes > 250000);
    assert.ok(state.result.stderr.droppedBytes > 250000);
    assert.equal(state.result.stdout.truncated, true);
    assert.equal(state.result.stderr.truncated, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runner rejects log caps above the hard maximum before creating a run", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-limit-"));
  try {
    await assert.rejects(
      execute([
        "start",
        "--root", root,
        "--kind", "invalid-limit",
        "--log-limit-bytes", String(8 * 1024 * 1024 + 1),
        "--",
        process.execPath,
        "-e",
        "console.log('never')"
      ]),
      (error) => error.code === 2 && /positive integer/.test(error.stderr)
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

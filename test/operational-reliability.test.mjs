import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createBoundedCliEnvironment } from "../dist/cliEnvironment.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerScript = path.join(repositoryRoot, "scripts", "long-task-runner.mjs");
const summaryScript = path.join(repositoryRoot, "scripts", "run-and-summarize.mjs");
const toolchainScript = path.join(repositoryRoot, "scripts", "toolchain-manager.mjs");

async function execute(script, args, options = {}) {
  return await execFileAsync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
}

async function pollRun(root, runId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { stdout } = await execute(runnerScript, ["status", "--root", root, "--run", runId]);
    const state = JSON.parse(stdout);
    if (state.status === "completed") return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Detached run ${runId} did not complete.`);
}

test("bounded CLI environment restores Windows GitHub discovery without token inheritance or CI mode", () => {
  const hostEnv = {
    PATH: "C:\\Tools",
    USERPROFILE: "C:\\Users\\Noah",
    GH_TOKEN: ["gh", "p_", "a".repeat(28)].join(""),
    GITHUB_TOKEN: ["github", "_pat_", "b".repeat(28)].join(""),
    CI: "1"
  };
  const env = createBoundedCliEnvironment({
    hostEnv,
    platform: "win32",
    includeCi: false
  });

  assert.equal(env.USERPROFILE, hostEnv.USERPROFILE);
  assert.equal(env.APPDATA, "C:\\Users\\Noah\\AppData\\Roaming");
  assert.equal(env.LOCALAPPDATA, "C:\\Users\\Noah\\AppData\\Local");
  assert.equal(env.GH_CONFIG_DIR, "C:\\Users\\Noah\\AppData\\Roaming\\GitHub CLI");
  assert.equal(env.CI, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
});

test("detached runner rejects duplicate kinds and records an exact completed result", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-test-"));
  try {
    const started = await execute(runnerScript, [
      "start",
      "--root", root,
      "--kind", "probe",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => console.log('runner-ok'), 700)"
    ]);
    const metadata = JSON.parse(started.stdout);
    assert.equal(metadata.kind, "probe");
    assert.equal(metadata.status, "running");

    await assert.rejects(
      execute(runnerScript, [
        "start",
        "--root", root,
        "--kind", "probe",
        "--",
        process.execPath,
        "-e",
        "console.log('duplicate')"
      ]),
      (error) => error.code === 1 && /already active/.test(error.stderr)
    );

    const state = await pollRun(root, metadata.runId);
    assert.equal(state.result.exitCode, 0);
    assert.equal(state.result.signal, null);
    const stdout = await fs.readFile(state.result.stdoutPath, "utf8");
    assert.match(stdout, /runner-ok/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("detached runner stops only the exact recorded process tree and reports stopped state", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-stop-test-"));
  try {
    const started = await execute(runnerScript, [
      "start",
      "--root", root,
      "--kind", "stop-probe",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => console.log('too-late'), 10000)"
    ]);
    const metadata = JSON.parse(started.stdout);
    const stopped = await execute(runnerScript, ["stop", "--root", root, "--run", metadata.runId]);
    assert.equal(JSON.parse(stopped.stdout).status, "stop_requested");
    const status = await execute(runnerScript, ["status", "--root", root, "--run", metadata.runId]);
    const state = JSON.parse(status.stdout);
    assert.equal(state.status, "stopped");
    assert.equal(state.stopped.runId, metadata.runId);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("detached runner rejects secret-looking command arguments before persisting metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-secret-test-"));
  const token = ["gh", "p_", "c".repeat(28)].join("");
  try {
    await assert.rejects(
      execute(runnerScript, [
        "start",
        "--root", root,
        "--kind", "secret-probe",
        "--",
        process.execPath,
        "-e",
        `console.log('${token}')`
      ]),
      (error) => error.code === 2 && /secret-looking command argument/.test(error.stderr)
    );
    const entries = await fs.readdir(root);
    assert.deepEqual(entries, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bounded failure summary redacts token-shaped output and preserves the first assertion", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-summary-test-"));
  const token = ["gh", "p_", "a".repeat(28)].join("");
  try {
    await assert.rejects(
      execute(summaryScript, [
        "--label", "probe",
        "--log-dir", root,
        "--",
        process.execPath,
        "-e",
        `console.error('AssertionError actual: ${token}'); process.exit(7)`
      ]),
      (error) => error.code === 7
    );
    const [summary, log] = await Promise.all([
      fs.readFile(path.join(root, "probe-summary.md"), "utf8"),
      fs.readFile(path.join(root, "probe.log"), "utf8")
    ]);
    assert.match(summary, /AssertionError actual:/);
    assert.match(summary, /\[REDACTED_GITHUB_TOKEN\]/);
    assert.equal(summary.includes(token), false);
    assert.equal(log.includes(token), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("toolchain status is deterministic and keeps managed runtimes outside Temp", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-toolchain-status-"));
  try {
    const { stdout } = await execute(toolchainScript, ["status", "--root", root]);
    const status = JSON.parse(stdout);
    assert.equal(status.root, root);
    assert.equal(status.toolchains["20"].expectedVersion, "v20.20.2");
    assert.equal(status.toolchains["24"].expectedVersion, "v24.15.0");
    assert.equal(status.toolchains["20"].ready, false);
    assert.equal(status.toolchains["24"].ready, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

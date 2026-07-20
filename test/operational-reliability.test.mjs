import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createBoundedCliEnvironment } from "../dist/cliEnvironment.js";
import { createDetachedRunnerEnvironment, stopExactWindowsTree } from "../scripts/long-task-runner.mjs";

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

test("detached runner derives only missing Windows user application-data paths", () => {
  const hostEnv = {
    USERPROFILE: "C:\\Users\\Noah",
    APPDATA: "D:\\Existing\\Roaming",
    CUSTOM_VALUE: "preserved"
  };
  const env = createDetachedRunnerEnvironment({ hostEnv, platform: "win32" });
  assert.notEqual(env, hostEnv);
  assert.equal(env.USERPROFILE, hostEnv.USERPROFILE);
  assert.equal(env.APPDATA, hostEnv.APPDATA);
  assert.equal(env.LOCALAPPDATA, "C:\\Users\\Noah\\AppData\\Local");
  assert.equal(env.CUSTOM_VALUE, "preserved");
  assert.equal(hostEnv.LOCALAPPDATA, undefined);

  const homeParts = createDetachedRunnerEnvironment({
    hostEnv: { HOMEDRIVE: "C:", HOMEPATH: "\\Users\\Noah" },
    platform: "win32"
  });
  assert.equal(homeParts.USERPROFILE, "C:\\Users\\Noah");
  assert.equal(homeParts.APPDATA, "C:\\Users\\Noah\\AppData\\Roaming");
  assert.equal(homeParts.LOCALAPPDATA, "C:\\Users\\Noah\\AppData\\Local");

  assert.deepEqual(
    createDetachedRunnerEnvironment({ hostEnv: { HOME: "/home/noah" }, platform: "linux" }),
    { HOME: "/home/noah" }
  );
});

test("detached runner rejects duplicate kinds and records an exact completed result", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-runner-test-"));
  try {
    const started = await execute(runnerScript, [
      "start",
      "--root", root,
      "--kind", "probe",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => console.log('runner-ok'), 5000)"
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

test("Windows exact stop retries transient taskkill failure without widening the owned PID", async () => {
  const calls = [];
  let attempts = 0;
  await stopExactWindowsTree({
    pid: 4242,
    expectedCreationTime: "20260717051540.000000+000",
    creationTimeFor: async (pid) => {
      assert.equal(pid, 4242);
      return "20260717051540.000000+000";
    },
    taskkill: (pid) => {
      calls.push(pid);
      attempts += 1;
      return attempts < 3
        ? { status: 1, stdout: "", stderr: "transient resource shortage" }
        : { status: 0, stdout: "SUCCESS", stderr: "" };
    },
    wait: async () => {}
  });
  assert.deepEqual(calls, [4242, 4242, 4242]);
});

test("detached runner rejects secret-looking command arguments before persisting metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-runner-secret-test-"));
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-summary-test-"));
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

test("bounded summary launches npm through the active Node runtime on Windows", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-summary-npm-test-"));
  try {
    const { stdout } = await execute(summaryScript, [
      "--label", "npm-version",
      "--log-dir", root,
      "--",
      "npm",
      "--version"
    ]);
    assert.match(stdout, /^\d+\.\d+\.\d+/m);
    const log = await fs.readFile(path.join(root, "npm-version.log"), "utf8");
    assert.match(log, /^\d+\.\d+\.\d+/m);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("toolchain status is deterministic and keeps managed runtimes outside Temp", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-toolchain-status-"));
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

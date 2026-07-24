import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  pruneTerminalRuns,
  startWorkerLeaseRenewal,
  waitForTerminalPublication,
  WORKER_LEASE_MS
} from "../scripts/long-task-runner.mjs";
import * as longTaskRunner from "../scripts/long-task-runner.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanupRunner = path.join(repositoryRoot, "scripts", "run-with-cleanup.mjs");
const longRunner = path.join(repositoryRoot, "scripts", "long-task-runner.mjs");

async function executeLongRunner(args, options = {}) {
  return await execFileAsync(process.execPath, [longRunner, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
}

async function waitForTerminal(root, runId, deadlineMs = WORKER_LEASE_MS + 30_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const state = JSON.parse((await executeLongRunner(["status", "--root", root, "--run", runId])).stdout);
    if (state.status === "completed" || state.status === "stopped") return state;
    assert.notEqual(state.status, "stale");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Run ${runId} did not become terminal.`);
}

async function waitForPath(target, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(target);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${target}.`);
}

async function waitForJson(target, predicate, deadlineMs = WORKER_LEASE_MS) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(await fs.readFile(target, "utf8"));
      if (predicate(value)) return value;
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for matching JSON at ${target}.`);
}

test("terminal publication grace tolerates delayed Windows result visibility", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-terminal-publication-"));
  const result = { schemaVersion: 2, runId: "delayed-result" };
  let publishError;
  const publish = new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const pending = path.join(directory, "result.json.pending");
        await fs.writeFile(pending, `${JSON.stringify(result)}\n`, "utf8");
        await fs.rename(pending, path.join(directory, "result.json"));
      } catch (error) {
        publishError = error;
      } finally {
        resolve();
      }
    }, 2_000);
  });

  try {
    const terminal = await waitForTerminalPublication(directory);
    await publish;
    if (publishError) throw publishError;
    assert.deepEqual(terminal.result, result);
    assert.equal(terminal.stopped, undefined);
  } finally {
    await publish;
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("worker lease renewal retries promptly after a transient publication failure", async () => {
  const scheduled = [];
  const callbacks = [];
  let attempts = 0;
  let unrefCalls = 0;
  const stop = startWorkerLeaseRenewal({
    publish: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient lease publication failure");
    },
    renewMs: 15_000,
    retryMs: 1_000,
    setTimer: (callback, delay) => {
      scheduled.push(delay);
      callbacks.push(callback);
      return { unref() { unrefCalls += 1; } };
    },
    clearTimer: () => {}
  });
  try {
    assert.deepEqual(scheduled, [15_000]);
    assert.equal(unrefCalls, 0);
    await callbacks.shift()();
    assert.deepEqual(scheduled, [15_000, 1_000]);
    await callbacks.shift()();
    assert.deepEqual(scheduled, [15_000, 1_000, 15_000]);
  } finally {
    stop();
  }
});

test("worker lease target preflight rejects directory replacement without retrying", async () => {
  assert.equal(typeof longTaskRunner.assertWorkerLeaseTarget, "function");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-lease-target-"));
  const target = path.join(root, "worker-lease.json");
  try {
    await fs.mkdir(target);
    assert.throws(
      () => longTaskRunner.assertWorkerLeaseTarget(target),
      (error) => error?.code === "WORKER_LEASE_PATH_UNSAFE"
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("terminal result publication survives a failed observational lease refresh", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-lease-refresh-failure-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-lease-refresh-failure-temp-"));
  const releasePath = path.join(runRoot, "release-worker");
  const childCompletedPath = path.join(runRoot, "release-worker-completed");
  try {
    const source = [
      "const fs = require('node:fs');",
      `const release = ${JSON.stringify(releasePath)};`,
      `const completed = ${JSON.stringify(childCompletedPath)};`,
      "const timer = setInterval(() => {",
      "  if (!fs.existsSync(release)) return;",
      "  clearInterval(timer);",
      "  fs.writeFileSync(completed, 'released\\n');",
      "  process.exit(0);",
      "}, 25);"
    ].join("");
    const started = JSON.parse((await executeLongRunner([
      "start",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--kind", "lease-refresh-failure",
      "--",
      process.execPath,
      "-e",
      source
    ])).stdout);
    const directory = path.join(runRoot, started.runId);
    const leasePath = path.join(directory, "worker-lease.json");
    await waitForJson(leasePath, (lease) => lease.phase === "running");
    await fs.rm(leasePath);
    await fs.mkdir(leasePath);
    await fs.writeFile(releasePath, "go\n", "utf8");
    await waitForPath(childCompletedPath);

    const result = await waitForJson(
      path.join(directory, "result.json"),
      (value) => value.runId === started.runId,
      WORKER_LEASE_MS + 30_000
    );
    assert.equal(result.exitCode, 0);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("initial observational lease failure does not suppress task execution or terminal result", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-initial-lease-failure-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-initial-lease-failure-temp-"));
  const runId = "initial-lease-failure";
  const directory = path.join(runRoot, runId);
  const releasePath = path.join(runRoot, "release-child");
  const childStartedPath = path.join(runRoot, "child-started");
  let workerProcess;
  let workerExit;
  try {
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    const source = [
      "const fs = require('node:fs');",
      `const started = ${JSON.stringify(childStartedPath)};`,
      `const release = ${JSON.stringify(releasePath)};`,
      "fs.writeFileSync(started, 'started\\n');",
      "const timeout = setTimeout(() => process.exit(98), 5000);",
      "const timer = setInterval(() => {",
      "  if (!fs.existsSync(release)) return;",
      "  clearInterval(timer);",
      "  clearTimeout(timeout);",
      "  process.exitCode = 7;",
      "}, 25);"
    ].join("");
    const command = {
      schemaVersion: 2,
      runId,
      kind: "initial-lease-failure",
      cwd: repositoryRoot,
      argv: [process.execPath, "-e", source],
      workerNonce: "a".repeat(64),
      commandDigest: "",
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
      tempRoot,
      logLimitBytes: 4096,
      retentionCount: 20,
      retentionDays: 14
    };
    command.commandDigest = createHash("sha256").update(JSON.stringify({
      cwd: command.cwd,
      argv: command.argv,
      tempRoot: command.tempRoot,
      logLimitBytes: command.logLimitBytes,
      retentionCount: command.retentionCount,
      retentionDays: command.retentionDays
    })).digest("hex");
    await fs.writeFile(path.join(directory, "command.json"), `${JSON.stringify(command, null, 2)}\n`, "utf8");
    await fs.mkdir(path.join(directory, "worker-lease.json"));

    workerProcess = spawn(process.execPath, [longRunner, "__worker", "--run-dir", directory], {
      cwd: repositoryRoot,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let workerStderr = "";
    workerProcess.stderr.setEncoding("utf8");
    workerProcess.stderr.on("data", (chunk) => {
      workerStderr += chunk;
    });
    workerExit = new Promise((resolve, reject) => {
      workerProcess.once("error", reject);
      workerProcess.once("close", (code, signal) => resolve({ code, signal }));
    });

    await waitForPath(path.join(directory, "worker-evidence.json"), 5_000);
    await waitForPath(childStartedPath, 3_000);
    assert.equal(workerProcess.exitCode, null, `Worker exited before task release: ${workerStderr}`);

    await fs.writeFile(releasePath, "go\n", "utf8");
    const exited = await workerExit;
    assert.deepEqual(exited, { code: 7, signal: null }, workerStderr);

    const result = JSON.parse(await fs.readFile(path.join(directory, "result.json"), "utf8"));
    assert.equal(result.runId, runId);
    assert.equal(result.exitCode, 7);
    assert.equal(result.signal, null);
    assert.equal(result.error, null);
    assert.equal(result.temporaryState.cleaned, true);
    assert.equal(await fs.readFile(childStartedPath, "utf8"), "started\n");
    assert.equal((await fs.stat(path.join(directory, "worker-lease.json"))).isDirectory(), true);
  } finally {
    if (workerProcess?.exitCode === null) {
      await fs.writeFile(releasePath, "go\n", "utf8").catch(() => {});
      await Promise.race([
        workerExit?.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 6_000))
      ]);
      if (workerProcess.exitCode === null) workerProcess.kill("SIGKILL");
    }
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("worker finalization publishes an authoritative successful result", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-finalization-lease-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-finalization-lease-temp-"));
  try {
    const started = JSON.parse((await executeLongRunner([
      "start",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--kind", "finalization-lease",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)"
    ])).stdout);
    const directory = path.join(runRoot, started.runId);
    const result = await waitForJson(
      path.join(directory, "result.json"),
      (value) => value.runId === started.runId,
      WORKER_LEASE_MS + 30_000
    );
    assert.equal(result.exitCode, 0);

    const terminal = await waitForTerminal(runRoot, started.runId);
    assert.equal(terminal.result.exitCode, 0);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("retention defers terminal evidence while its exact worker is still alive", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-live-terminal-run-"));
  const runId = "2020-01-01T00-00-00-000Z-live-terminal-aaaaaaaa";
  const directory = path.join(root, runId);
  try {
    await fs.mkdir(directory);
    const [stat, workerCreationTime] = await Promise.all([
      fs.stat(directory, { bigint: true }),
      longTaskRunner.processCreationTime(process.pid)
    ]);
    assert.ok(workerCreationTime);
    const metadata = {
      schemaVersion: 2,
      runId,
      kind: "live-terminal",
      workerPid: process.pid,
      workerNonce: "a".repeat(64),
      workerCreationTime,
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt: "2020-01-01T00:00:00.000Z",
      directory,
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
      command: [process.execPath, "-e", ""],
      cwd: repositoryRoot,
      logLimitBytes: 4096,
      retentionCount: 1,
      retentionDays: 1,
      host: os.hostname()
    };
    const evidence = {
      schemaVersion: 2,
      runId,
      workerPid: metadata.workerPid,
      workerNonce: metadata.workerNonce,
      workerCreationTime: metadata.workerCreationTime,
      commandDigest: metadata.commandDigest,
      workerCommandDigest: metadata.workerCommandDigest,
      publishedAt: metadata.startedAt
    };
    const result = {
      schemaVersion: 2,
      runId,
      completedAt: "2020-01-01T00:00:01.000Z"
    };
    await Promise.all([
      fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata)}\n`, "utf8"),
      fs.writeFile(path.join(directory, "worker-evidence.json"), `${JSON.stringify(evidence)}\n`, "utf8"),
      fs.writeFile(path.join(directory, "result.json"), `${JSON.stringify(result)}\n`, "utf8")
    ]);

    const report = await pruneTerminalRuns(root, { keepCount: 1, maxAgeDays: 1 });
    assert.equal(report.removed, 0);
    assert.equal(report.retained, 1);
    assert.equal(report.failed, 0);
    assert.deepEqual(await fs.readdir(root), [runId]);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("retention excludes the preserved in-progress run before state evaluation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-preserved-run-"));
  const runId = "2026-07-20T00-00-00-000Z-preserved-run-aaaaaaaa";
  const directory = path.join(root, runId);
  try {
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    const metadata = {
      schemaVersion: 2,
      runId,
      kind: "preserved-run",
      workerPid: 999999,
      workerNonce: "a".repeat(64),
      workerCreationTime: "linux:1",
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt: "2026-07-20T00:00:00.000Z",
      directory,
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
      command: [process.execPath, "-e", ""],
      cwd: repositoryRoot,
      logLimitBytes: 4096,
      retentionCount: 1,
      retentionDays: 14,
      host: os.hostname()
    };
    const evidence = {
      schemaVersion: 2,
      runId,
      workerPid: metadata.workerPid,
      workerNonce: metadata.workerNonce,
      workerCreationTime: metadata.workerCreationTime,
      commandDigest: metadata.commandDigest,
      workerCommandDigest: metadata.workerCommandDigest,
      publishedAt: metadata.startedAt
    };
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata)}\n`, "utf8");
    await fs.writeFile(path.join(directory, "worker-evidence.json"), `${JSON.stringify(evidence)}\n`, "utf8");

    const startedAt = performance.now();
    const report = await pruneTerminalRuns(root, {
      keepCount: 1,
      maxAgeDays: 14,
      preserveRunId: runId
    });
    const elapsedMs = performance.now() - startedAt;

    assert.ok(elapsedMs < 1_000, `Preserved run evaluation took ${elapsedMs}ms.`);
    assert.equal(report.scanned, 0);
    assert.equal(report.failed, 0);
    assert.deepEqual((await fs.readdir(root)).sort(), [runId]);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function waitForDirectoryCount(root, expected, deadlineMs = 5_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const count = entries.filter((entry) => entry.isDirectory()).length;
    if (count === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await fs.readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length, expected);
}

async function createAbandonedOwnedRoot(baseRoot) {
  const moduleUrl = pathToFileURL(path.join(repositoryRoot, "scripts", "owned-temp-root.mjs")).href;
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    [
      `const { createOwnedTempRoot } = await import(${JSON.stringify(moduleUrl)});`,
      `const owned = await createOwnedTempRoot("abandoned", { baseRoot: ${JSON.stringify(baseRoot)}, sweep: false });`,
      "console.log(owned.path);",
      "setInterval(() => {}, 1000);"
    ].join("")
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const rootPath = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lineEnd = stdout.indexOf("\n");
      if (lineEnd !== -1) resolve(stdout.slice(0, lineEnd).trim());
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!stdout.includes("\n")) reject(new Error(`Owned-root child exited ${code}: ${stderr}`));
    });
  });
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("close", resolve));
  return rootPath;
}

function tempProbeSource(exitCode = 0) {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const temp = process.env.TEMP || process.env.TMP || process.env.TMPDIR;",
    "if (!temp) process.exit(91);",
    "fs.mkdirSync(temp, { recursive: true });",
    "fs.writeFileSync(path.join(temp, 'probe.txt'), 'temporary');",
    "console.log(JSON.stringify({ temp, tmp: process.env.TMP, tmpdir: process.env.TMPDIR }));",
    `process.exit(${exitCode});`
  ].join("");
}

test("the generic cleanup runner removes its complete owned TEMP tree on success and failure", async () => {
  const baseRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-run-"));
  try {
    for (const expectedExit of [0, 7]) {
      const result = spawnSync(process.execPath, [
        cleanupRunner,
        "--base-root", baseRoot,
        "--",
        process.execPath,
        "-e",
        tempProbeSource(expectedExit),
        "--",
        "--purpose", "INVALID-CHILD-VALUE!"
      ], {
        cwd: repositoryRoot,
        encoding: "utf8",
        windowsHide: true
      });
      assert.equal(result.status, expectedExit, result.stderr);
      const probe = JSON.parse(result.stdout.trim());
      assert.equal(probe.temp, probe.tmp);
      assert.equal(probe.temp, probe.tmpdir);
      await assert.rejects(() => fs.lstat(path.dirname(probe.temp)), { code: "ENOENT" });
      assert.deepEqual(await fs.readdir(baseRoot), []);
    }
  } finally {
    await fs.rm(baseRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the generic cleanup runner removes owned TEMP after a termination signal", async () => {
  const baseRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-signal-"));
  try {
    const source = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const temp = process.env.TEMP || process.env.TMP || process.env.TMPDIR;",
      "fs.writeFileSync(path.join(temp, 'signal-probe.txt'), 'temporary');",
      "console.log(JSON.stringify({ temp, pid: process.pid }));",
      "setInterval(() => {}, 1000);"
    ].join("");
    const wrapper = spawn(process.execPath, [
      cleanupRunner,
      "--base-root", baseRoot,
      "--",
      process.execPath,
      "-e",
      source
    ], {
      cwd: repositoryRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const probe = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      wrapper.stdout.setEncoding("utf8");
      wrapper.stderr.setEncoding("utf8");
      wrapper.stdout.on("data", (chunk) => {
        stdout += chunk;
        const lineEnd = stdout.indexOf("\n");
        if (lineEnd !== -1) resolve(JSON.parse(stdout.slice(0, lineEnd)));
      });
      wrapper.stderr.on("data", (chunk) => { stderr += chunk; });
      wrapper.once("error", reject);
      wrapper.once("exit", (code) => {
        if (!stdout.includes("\n")) reject(new Error(`Cleanup wrapper exited ${code}: ${stderr}`));
      });
    });
    wrapper.kill("SIGTERM");
    const exit = await new Promise((resolve) => wrapper.once("close", (code, signal) => resolve({ code, signal })));
    if (process.platform === "win32") {
      assert.equal(exit.code, null);
      try {
        process.kill(probe.pid, "SIGKILL");
      } catch {
        // The child may already have exited with its force-terminated parent.
      }
      const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-signal-runs-"));
      try {
        const report = JSON.parse((await executeLongRunner([
          "clean",
          "--root", runRoot,
          "--temp-root", baseRoot,
          "--retention-count", "1",
          "--retention-days", "1"
        ])).stdout);
        assert.equal(report.staleTemporaryState.removed, 1);
      } finally {
        await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } else {
      assert.equal(exit.code, 143);
    }
    await assert.rejects(() => fs.lstat(path.dirname(probe.temp)), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(baseRoot), []);
  } finally {
    await fs.rm(baseRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("detached tasks use an owned TEMP tree and remove it before terminal completion", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-long-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-long-temp-"));
  try {
    const started = JSON.parse((await executeLongRunner([
      "start",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--kind", "owned-temp-probe",
      "--",
      process.execPath,
      "-e",
      tempProbeSource(0),
      "--",
      "--retention-count", "999"
    ])).stdout);
    const state = await waitForTerminal(runRoot, started.runId);
    assert.equal(state.retentionCount, 20);
    assert.equal(state.result.exitCode, 0);
    const probe = JSON.parse((await fs.readFile(state.result.stdoutPath, "utf8")).trim());
    assert.equal(probe.temp, probe.tmp);
    assert.equal(probe.temp, probe.tmpdir);
    await assert.rejects(() => fs.lstat(path.dirname(probe.temp)), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(tempRoot), []);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("terminal detached-run evidence is automatically pruned to the configured retention count", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-retention-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-retention-temp-"));
  try {
    let latestRunId;
    for (let index = 0; index < 3; index += 1) {
      const started = JSON.parse((await executeLongRunner([
        "start",
        "--root", runRoot,
        "--temp-root", tempRoot,
        "--retention-count", "1",
        "--retention-days", "36500",
        "--kind", `retention-${index}`,
        "--",
        process.execPath,
        "-e",
        `console.log(${JSON.stringify(`run-${index}`)})`
      ])).stdout);
      latestRunId = started.runId;
      const state = await waitForTerminal(runRoot, started.runId);
      assert.equal(state.result.exitCode, 0);
      assert.equal(state.result.retention.failed, 0, JSON.stringify(state.result.retention));
    }

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await pruneTerminalRuns(runRoot, { keepCount: 1, maxAgeDays: 36_500 });
      const count = (await fs.readdir(runRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).length;
      if (count === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await waitForDirectoryCount(runRoot, 1);

    const states = JSON.parse((await executeLongRunner(["list", "--root", runRoot])).stdout);
    assert.equal(states.length, 1);
    assert.equal(states[0].runId, latestRunId);
    assert.equal(states[0].status, "completed");
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("cleanup prunes terminal legacy run evidence only after direct-child and terminal validation", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-legacy-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-legacy-temp-"));
  try {
    const runId = "2020-01-01T00-00-00-000Z-legacy-cleanup-aaaaaaaa";
    const directory = path.join(runRoot, runId);
    await fs.mkdir(directory);
    const stdoutPath = path.join(directory, "stdout.log");
    const stderrPath = path.join(directory, "stderr.log");
    await fs.writeFile(stdoutPath, "legacy\n", "utf8");
    await fs.writeFile(stderrPath, "", "utf8");
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({
      schemaVersion: 1,
      runId,
      kind: "legacy-cleanup",
      workerPid: 999999,
      startedAt: "2020-01-01T00:00:00.000Z",
      directory,
      command: [process.execPath, "-e", "console.log('legacy')"],
      cwd: repositoryRoot
    })}\n`, "utf8");
    await fs.writeFile(path.join(directory, "result.json"), `${JSON.stringify({
      schemaVersion: 1,
      runId,
      kind: "legacy-cleanup",
      startedAt: "2020-01-01T00:00:00.000Z",
      completedAt: "2020-01-01T00:00:01.000Z",
      exitCode: 0,
      signal: null,
      error: null,
      stdoutPath,
      stderrPath
    })}\n`, "utf8");

    const report = JSON.parse((await executeLongRunner([
      "clean",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--retention-count", "20",
      "--retention-days", "1"
    ])).stdout);

    assert.equal(report.runEvidence.removed, 1);
    assert.equal(report.runEvidence.failed, 0);
    await assert.rejects(() => fs.lstat(directory), { code: "ENOENT" });
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("cleanup preserves malformed legacy metadata instead of exiting or escaping the run root", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-invalid-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-invalid-temp-"));
  try {
    const entryName = "2020-01-01T00-00-00-000Z-invalid-cleanup-bbbbbbbb";
    const directory = path.join(runRoot, entryName);
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({
      schemaVersion: 1,
      runId: "../outside",
      kind: "invalid-cleanup",
      workerPid: 999999,
      startedAt: "2020-01-01T00:00:00.000Z",
      directory,
      command: [process.execPath],
      cwd: repositoryRoot
    })}\n`, "utf8");
    await fs.writeFile(path.join(directory, "result.json"), `${JSON.stringify({
      schemaVersion: 1,
      runId: "../outside",
      kind: "invalid-cleanup",
      startedAt: "2020-01-01T00:00:00.000Z",
      completedAt: "2020-01-01T00:00:01.000Z",
      exitCode: 0
    })}\n`, "utf8");

    let report;
    try {
      await executeLongRunner([
        "clean",
        "--root", runRoot,
        "--temp-root", tempRoot,
        "--retention-count", "1",
        "--retention-days", "1"
      ]);
      assert.fail("Malformed run evidence must make explicit cleanup incomplete.");
    } catch (error) {
      assert.equal(error.code, 1);
      report = JSON.parse(error.stdout);
    }

    assert.equal(report.runEvidence.removed, 0);
    assert.equal(report.runEvidence.failed, 0);
    assert.equal(report.runEvidence.invalid, 1);
    assert.match(report.runEvidence.errors[0].error, /does not match its containing directory/u);
    assert.equal((await fs.lstat(directory)).isDirectory(), true);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("cleanup binds terminal metadata to its containing run directory", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-bound-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-bound-temp-"));
  try {
    const victimRunId = "2021-01-01T00-00-00-000Z-victim-cleanup-cccccccc";
    const attackerEntry = "2020-01-01T00-00-00-000Z-attacker-cleanup-dddddddd";
    const victimDirectory = path.join(runRoot, victimRunId);
    const attackerDirectory = path.join(runRoot, attackerEntry);
    await fs.mkdir(victimDirectory);
    await fs.mkdir(attackerDirectory);

    const writeLegacyTerminal = async (directory, runId, startedAt) => {
      await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId,
        kind: "directory-binding",
        workerPid: 999999,
        startedAt,
        directory,
        command: [process.execPath],
        cwd: repositoryRoot
      })}\n`, "utf8");
      await fs.writeFile(path.join(directory, "result.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId,
        kind: "directory-binding",
        startedAt,
        completedAt: startedAt,
        exitCode: 0
      })}\n`, "utf8");
    };

    await writeLegacyTerminal(victimDirectory, victimRunId, "2021-01-01T00:00:00.000Z");
    await writeLegacyTerminal(attackerDirectory, victimRunId, "2020-01-01T00:00:00.000Z");

    let report;
    try {
      await executeLongRunner([
        "clean",
        "--root", runRoot,
        "--temp-root", tempRoot,
        "--retention-count", "1",
        "--retention-days", "36500"
      ]);
      assert.fail("Mismatched run metadata must make explicit cleanup incomplete.");
    } catch (error) {
      assert.equal(error.code, 1);
      report = JSON.parse(error.stdout);
    }

    assert.equal(report.runEvidence.removed, 0);
    assert.equal(report.runEvidence.retained, 1);
    assert.equal(report.runEvidence.invalid, 1);
    assert.equal((await fs.lstat(victimDirectory)).isDirectory(), true);
    assert.equal((await fs.lstat(attackerDirectory)).isDirectory(), true);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the detached worker rejects a tampered command digest before spawning", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-digest-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-digest-temp-"));
  try {
    const runId = "digest-probe";
    const directory = path.join(runRoot, runId);
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    await fs.writeFile(path.join(directory, "command.json"), `${JSON.stringify({
      schemaVersion: 2,
      runId,
      kind: "digest-probe",
      cwd: repositoryRoot,
      argv: [process.execPath, "-e", "console.log('must-not-run')"],
      workerNonce: "a".repeat(64),
      commandDigest: "b".repeat(64),
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
      tempRoot,
      logLimitBytes: 4096,
      retentionCount: 20,
      retentionDays: 14
    })}\n`, "utf8");

    await assert.rejects(
      executeLongRunner(["__worker", "--run-dir", directory]),
      (error) => error.code === 2 && /command file or digest is invalid/u.test(error.stderr)
    );
    await assert.rejects(() => fs.lstat(path.join(directory, "worker-evidence.json")), { code: "ENOENT" });
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("cleanup recovers a terminal run left in its verified prune claim after an interruption", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-claim-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-claim-temp-"));
  try {
    const runId = "2026-07-22T00-00-00-000Z-claim-recovery-eeeeeeee";
    const directory = path.join(runRoot, runId);
    const startedAt = "2026-07-22T00:00:00.000Z";
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    const stdoutPath = path.join(directory, "stdout.log");
    const stderrPath = path.join(directory, "stderr.log");
    await fs.writeFile(stdoutPath, "claim-recovery\n", "utf8");
    await fs.writeFile(stderrPath, "", "utf8");
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({
      schemaVersion: 2,
      runId,
      kind: "claim-recovery",
      workerPid: 999999,
      workerNonce: "a".repeat(64),
      workerCreationTime: "linux:1",
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt,
      directory,
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
      command: [process.execPath, "-e", "console.log('claim-recovery')"],
      cwd: repositoryRoot,
      logLimitBytes: 4096,
      retentionCount: 20,
      retentionDays: 36500,
      host: os.hostname()
    })}\n`, "utf8");
    await fs.writeFile(path.join(directory, "result.json"), `${JSON.stringify({
      schemaVersion: 2,
      runId,
      kind: "claim-recovery",
      startedAt,
      completedAt: "2026-07-22T00:00:01.000Z",
      exitCode: 0,
      signal: null,
      error: null,
      temporaryState: { cleaned: true },
      stdoutPath,
      stderrPath
    })}\n`, "utf8");

    const claimed = path.join(runRoot, `.codexgpt-run-prune-${"a".repeat(32)}`);
    await fs.rename(directory, claimed);
    const report = JSON.parse((await executeLongRunner([
      "clean",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--retention-count", "20",
      "--retention-days", "36500"
    ])).stdout);

    assert.equal(report.runEvidence.claimed.removed, 1);
    assert.equal(report.runEvidence.claimed.failed, 0);
    await assert.rejects(() => fs.lstat(claimed), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(runRoot), []);
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the cleanup command removes only exact stale CodexGPT-owned roots from the selected TEMP base", async () => {
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-command-runs-"));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-clean-command-temp-"));
  try {
    const abandoned = await createAbandonedOwnedRoot(tempRoot);
    const foreign = path.join(tempRoot, "foreign-application-temp");
    await fs.mkdir(foreign);
    await fs.writeFile(path.join(foreign, "keep.txt"), "not CodexGPT-owned", "utf8");

    const report = JSON.parse((await executeLongRunner([
      "clean",
      "--root", runRoot,
      "--temp-root", tempRoot,
      "--retention-count", "1",
      "--retention-days", "1"
    ])).stdout);

    assert.equal(report.staleTemporaryState.removed, 1);
    assert.equal(report.staleTemporaryState.active, 0);
    await assert.rejects(() => fs.lstat(abandoned), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(foreign, "keep.txt"), "utf8"), "not CodexGPT-owned");
  } finally {
    await fs.rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the repository exposes cleanup-backed focused-test and arbitrary-task commands", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["task:run"], "node scripts/run-with-cleanup.mjs");
  assert.equal(
    pkg.scripts["test:focused"],
    "node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test"
  );
});

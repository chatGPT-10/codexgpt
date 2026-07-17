import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { processCreationTime, RUNNER_SCHEMA_VERSION } from "../scripts/long-task-runner.mjs";

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

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("detached runner stops only the exact recorded process tree and reports stopped state", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-stop-test-"));
  try {
    const started = await execute([
      "start",
      "--root", root,
      "--kind", "stop-probe",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => console.log('too-late'), 10000)"
    ]);
    const metadata = JSON.parse(started.stdout);
    const stopped = await execute(
      ["stop", "--root", root, "--run", metadata.runId],
      { timeout: 25_000 }
    );
    assert.equal(JSON.parse(stopped.stdout).status, "stop_requested");
    const status = await execute(["status", "--root", root, "--run", metadata.runId]);
    const state = JSON.parse(status.stdout);
    assert.equal(state.status, "stopped");
    assert.equal(state.stopped.runId, metadata.runId);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stale creation-time ownership refuses taskkill and keeps the unrelated process alive", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-runner-stop-identity-"));
  const control = spawn(process.execPath, [longFixture, "30000"], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: "ignore"
  });
  try {
    const creationTime = await processCreationTime(control.pid);
    assert.equal(typeof creationTime, "string");
    const runId = "stale-pid-reuse-oracle";
    const directory = path.join(root, runId);
    await fs.mkdir(directory);
    const directoryStat = await fs.stat(directory, { bigint: true });
    const directoryIdentity = { dev: String(directoryStat.dev), ino: String(directoryStat.ino) };
    const nonce = "a".repeat(64);
    const metadata = {
      schemaVersion: RUNNER_SCHEMA_VERSION,
      runId,
      kind: "identity-control",
      workerPid: control.pid,
      workerNonce: nonce,
      workerCreationTime: `${creationTime}-reused`,
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt: new Date().toISOString(),
      directory,
      directoryIdentity,
      command: [process.execPath, longFixture, "30000"],
      cwd: repositoryRoot,
      logLimitBytes: 4096,
      host: os.hostname()
    };
    const evidence = {
      schemaVersion: RUNNER_SCHEMA_VERSION,
      runId,
      workerPid: control.pid,
      workerNonce: nonce,
      workerCreationTime: metadata.workerCreationTime,
      workerCommandDigest: metadata.workerCommandDigest,
      commandDigest: metadata.commandDigest,
      publishedAt: new Date().toISOString()
    };
    await Promise.all([
      fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
      fs.writeFile(path.join(directory, "worker-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
    ]);

    const state = JSON.parse((await execute(["status", "--root", root, "--run", runId])).stdout);
    assert.equal(state.status, "stale");
    assert.equal(state.identity.reason, "process_identity_mismatch");

    await assert.rejects(
      execute(["stop", "--root", root, "--run", runId]),
      (error) => error.code === 1 && /is stale; no process tree/.test(error.stderr)
    );
    assert.equal(alive(control.pid), true);
  } finally {
    if (alive(control.pid)) {
      spawnSync("taskkill.exe", ["/PID", String(control.pid), "/T", "/F"], { windowsHide: true, encoding: "utf8" });
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

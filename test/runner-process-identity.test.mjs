import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  processCreationTime,
  runState,
  TERMINAL_PUBLICATION_LEASE_MS,
  terminalPublicationLeaseActive,
  verifyWorkerIdentity,
  waitForTerminalPublication
} from "../scripts/long-task-runner.mjs";

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

test("exact evidence distinguishes temporary identity unavailability from a dead worker", async () => {
  const metadata = {
    schemaVersion: 2,
    runId: "identity-unavailable",
    workerPid: 4242,
    workerNonce: "a".repeat(64),
    workerCreationTime: "linux:123",
    workerCommandDigest: "b".repeat(64),
    commandDigest: "c".repeat(64)
  };
  const evidence = {
    schemaVersion: 2,
    runId: metadata.runId,
    workerPid: metadata.workerPid,
    workerNonce: metadata.workerNonce,
    workerCreationTime: metadata.workerCreationTime,
    workerCommandDigest: metadata.workerCommandDigest,
    commandDigest: metadata.commandDigest
  };

  const unavailable = await verifyWorkerIdentity(metadata, evidence, {
    processCreationTime: async () => undefined,
    processIsAlive: () => true
  });
  assert.deepEqual(unavailable, { owned: false, reason: "process_identity_unavailable" });

  const dead = await verifyWorkerIdentity(metadata, evidence, {
    processCreationTime: async () => undefined,
    processIsAlive: () => false
  });
  assert.deepEqual(dead, { owned: false, reason: "process_identity_mismatch" });
});

test("an exact bounded finalization lease keeps terminal publication observable without ownership", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-finalizing-"));
  const runId = "finalizing-run";
  const directory = path.join(root, runId);
  try {
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    const metadata = {
      schemaVersion: 2,
      runId,
      kind: "finalizing",
      workerPid: 999999,
      workerNonce: "a".repeat(64),
      workerCreationTime: "linux:1",
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt: new Date().toISOString(),
      directory,
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) }
    };
    const evidence = {
      schemaVersion: 2,
      runId,
      workerPid: metadata.workerPid,
      workerNonce: metadata.workerNonce,
      workerCreationTime: metadata.workerCreationTime,
      workerCommandDigest: metadata.workerCommandDigest,
      commandDigest: metadata.commandDigest,
      publishedAt: metadata.startedAt
    };
    const publishedAtMs = Date.now();
    const finalizing = {
      ...evidence,
      publishedAt: new Date(publishedAtMs).toISOString(),
      expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS).toISOString()
    };
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata)}\n`, "utf8");
    await fs.writeFile(path.join(directory, "worker-evidence.json"), `${JSON.stringify(evidence)}\n`, "utf8");
    await fs.writeFile(path.join(directory, "finalizing.json"), `${JSON.stringify(finalizing)}\n`, "utf8");

    assert.equal(terminalPublicationLeaseActive(metadata, evidence, finalizing, publishedAtMs), true);
    assert.equal(terminalPublicationLeaseActive(metadata, evidence, {
      ...finalizing,
      expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS + 1).toISOString()
    }, publishedAtMs), false);

    const state = await runState(directory);
    assert.equal(state.status, "running");
    assert.deepEqual(state.identity, { owned: false, reason: "terminal_publication_in_progress" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("terminal observation notices an exact lease published during its bounded wait", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-finalizing-wait-"));
  const metadata = {
    schemaVersion: 2,
    runId: "finalizing-wait",
    workerPid: 999999,
    workerNonce: "d".repeat(64),
    workerCreationTime: "linux:2",
    workerCommandDigest: "e".repeat(64),
    commandDigest: "f".repeat(64)
  };
  const evidence = {
    schemaVersion: 2,
    runId: metadata.runId,
    workerPid: metadata.workerPid,
    workerNonce: metadata.workerNonce,
    workerCreationTime: metadata.workerCreationTime,
    workerCommandDigest: metadata.workerCommandDigest,
    commandDigest: metadata.commandDigest
  };
  const publishedAtMs = Date.now();
  const finalizing = {
    ...evidence,
    publishedAt: new Date(publishedAtMs).toISOString(),
    expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS).toISOString()
  };
  let publishError;
  const publish = new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await fs.writeFile(path.join(directory, "finalizing.json"), `${JSON.stringify(finalizing)}\n`, "utf8");
      } catch (error) {
        publishError = error;
      } finally {
        resolve();
      }
    }, 200);
  });

  try {
    const startedAt = performance.now();
    const observed = await waitForTerminalPublication(directory, 2_000, { metadata, evidence });
    const elapsedMs = performance.now() - startedAt;
    await publish;
    if (publishError) throw publishError;
    assert.ok(elapsedMs < 1_000, `Lease observation took ${elapsedMs}ms.`);
    assert.deepEqual(observed.finalizing, finalizing);
    assert.equal(observed.result, undefined);
    assert.equal(observed.stopped, undefined);
  } finally {
    await publish;
    await fs.rm(directory, { recursive: true, force: true });
  }
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

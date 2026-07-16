#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const argv = process.argv.slice(2);
const action = argv[0] ?? "list";

function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function safeSegment(value, fallback) {
  const normalized = String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function looksSecret(value) {
  return /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|Authorization\s*:\s*Bearer\s+\S+|[?&](?:token|access_token|key)=/i.test(String(value));
}

function stateRoot() {
  return path.resolve(option("--root", path.join(".ai-bridge", "runs")));
}

function runDirectory(root, runId) {
  const resolved = path.resolve(root, runId);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail("Invalid run id.", 2);
  return resolved;
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function runState(directory) {
  const metadata = await readJson(path.join(directory, "metadata.json"));
  const result = await readJson(path.join(directory, "result.json"));
  const stopped = await readJson(path.join(directory, "stopped.json"));
  if (!metadata) return undefined;
  return {
    ...metadata,
    status: result ? "completed" : stopped ? "stopped" : processAlive(metadata.workerPid) ? "running" : "orphaned",
    result: result ?? null,
    stopped: stopped ?? null
  };
}

async function listStates(root) {
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const states = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const state = await runState(path.join(root, entry.name));
    if (state) states.push(state);
  }
  return states.sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
}

async function worker() {
  const directory = path.resolve(option("--run-dir"));
  const commandFile = path.join(directory, "command.json");
  const command = await readJson(commandFile);
  if (!command || !Array.isArray(command.argv) || command.argv.length === 0) fail("Worker command file is invalid.", 2);

  const stdoutPath = path.join(directory, "stdout.log");
  const stderrPath = path.join(directory, "stderr.log");
  const stdout = fs.openSync(stdoutPath, "a");
  const stderr = fs.openSync(stderrPath, "a");
  const startedAt = new Date().toISOString();
  let child;
  let spawnError;
  try {
    child = spawn(command.argv[0], command.argv.slice(1), {
      cwd: command.cwd,
      env: process.env,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr]
    });
    await fsp.writeFile(path.join(directory, "child.json"), `${JSON.stringify({ pid: child.pid }, null, 2)}\n`, "utf8");
  } catch (error) {
    spawnError = error;
  }

  const outcome = spawnError
    ? { code: 127, signal: null, error: spawnError.stack ?? spawnError.message }
    : await new Promise((resolve) => {
      child.once("error", (error) => resolve({ code: 127, signal: null, error: error.stack ?? error.message }));
      child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, error: null }));
    });

  fs.closeSync(stdout);
  fs.closeSync(stderr);
  const result = {
    schemaVersion: 1,
    runId: command.runId,
    kind: command.kind,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: outcome.code,
    signal: outcome.signal,
    error: outcome.error,
    stdoutPath,
    stderrPath
  };
  await fsp.writeFile(path.join(directory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.exitCode = outcome.code;
}

if (action === "__worker") {
  await worker();
} else if (action === "start") {
  const separator = argv.indexOf("--");
  if (separator === -1 || separator === argv.length - 1) {
    fail("Usage: node scripts/long-task-runner.mjs start --kind <kind> [--root <dir>] [--cwd <dir>] -- <command> [args...]", 2);
  }
  const root = stateRoot();
  const kind = safeSegment(option("--kind", "task"), "task");
  const existing = (await listStates(root)).find((state) => state.kind === kind && state.status === "running");
  if (existing) fail(`A ${kind} runner is already active: ${existing.runId}. Check it before retrying.`);

  const commandArgv = argv.slice(separator + 1);
  if (commandArgv.some(looksSecret)) {
    fail("Refusing to persist a secret-looking command argument. Pass credentials through an approved runtime mechanism, not the detached runner command line.", 2);
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}-${randomBytes(4).toString("hex")}`;
  const directory = runDirectory(root, runId);
  await fsp.mkdir(directory, { recursive: true });
  const command = {
    schemaVersion: 1,
    runId,
    kind,
    cwd: path.resolve(option("--cwd", process.cwd())),
    argv: commandArgv
  };
  await fsp.writeFile(path.join(directory, "command.json"), `${JSON.stringify(command, null, 2)}\n`, "utf8");

  const workerProcess = spawn(process.execPath, [path.resolve(process.argv[1]), "__worker", "--run-dir", directory], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  workerProcess.unref();
  const metadata = {
    schemaVersion: 1,
    runId,
    kind,
    workerPid: workerProcess.pid,
    startedAt: new Date().toISOString(),
    directory,
    command: command.argv,
    cwd: command.cwd
  };
  await fsp.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...metadata, status: "running" }, null, 2));
} else if (action === "status") {
  const root = stateRoot();
  const runId = option("--run");
  if (!runId) fail("status requires --run <run-id>.", 2);
  const state = await runState(runDirectory(root, runId));
  if (!state) fail(`Unknown run: ${runId}.`);
  console.log(JSON.stringify(state, null, 2));
} else if (action === "list") {
  console.log(JSON.stringify(await listStates(stateRoot()), null, 2));
} else if (action === "stop") {
  const root = stateRoot();
  const runId = option("--run");
  if (!runId) fail("stop requires --run <run-id>.", 2);
  const directory = runDirectory(root, runId);
  const state = await runState(directory);
  if (!state) fail(`Unknown run: ${runId}.`);
  if (state.status !== "running") fail(`Run ${runId} is ${state.status}; no process tree will be terminated.`);

  if (process.platform === "win32") {
    const stopped = spawnSync("taskkill.exe", ["/PID", String(state.workerPid), "/T", "/F"], { encoding: "utf8", windowsHide: true });
    if (stopped.status !== 0) fail(`Unable to stop exact run ${runId}: ${stopped.stderr || stopped.stdout}`);
  } else {
    try {
      process.kill(-state.workerPid, "SIGTERM");
    } catch {
      process.kill(state.workerPid, "SIGTERM");
    }
  }
  await fsp.writeFile(path.join(directory, "stopped.json"), `${JSON.stringify({ runId, stoppedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ runId, status: "stop_requested" }, null, 2));
} else {
  fail("Usage: node scripts/long-task-runner.mjs <start|status|list|stop> ...", 2);
}

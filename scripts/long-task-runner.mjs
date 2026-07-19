#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeJsonAtomicFile } from "./atomic-file.mjs";
import { processCreationTime } from "./process-identity.mjs";

export { processCreationTime } from "./process-identity.mjs";

export const RUNNER_SCHEMA_VERSION = 2;
export const DEFAULT_LOG_LIMIT_BYTES = 1024 * 1024;
export const MAX_LOG_LIMIT_BYTES = 8 * 1024 * 1024;

export function createDetachedRunnerEnvironment({ hostEnv = process.env, platform = process.platform } = {}) {
  const environment = { ...hostEnv };
  if (platform !== "win32") return environment;
  const userProfile = environment.USERPROFILE ||
    (environment.HOMEDRIVE && environment.HOMEPATH
      ? `${environment.HOMEDRIVE}${environment.HOMEPATH}`
      : undefined);
  if (!userProfile) return environment;
  environment.USERPROFILE ??= userProfile;
  environment.APPDATA ??= path.win32.join(userProfile, "AppData", "Roaming");
  environment.LOCALAPPDATA ??= path.win32.join(userProfile, "AppData", "Local");
  return environment;
}

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

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    fail(`Expected a positive integer no greater than ${maximum}.`, 2);
  }
  return parsed;
}

function stateRoot() {
  return path.resolve(option("--root", path.join(".ai-bridge", "runs")));
}

function runDirectory(root, runId) {
  const resolved = path.resolve(root, runId);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) fail("Invalid run id.", 2);
  return resolved;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandDigest(command) {
  return digest(JSON.stringify({ cwd: command.cwd, argv: command.argv }));
}

function workerCommandDigest({ executable, script, directory }) {
  return digest(JSON.stringify({ executable: path.resolve(executable), script: path.resolve(script), directory: path.resolve(directory) }));
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeJsonAtomic(directory, filename, value) {
  await writeJsonAtomicFile(path.join(directory, filename), value);
}

function statIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino)
  };
}

async function ensureDirectoryWithoutLinks(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const remainder = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (const segment of remainder) {
    current = path.join(current, segment);
    try {
      const entry = await fsp.lstat(current, { bigint: true });
      if (entry.isSymbolicLink()) throw new Error(`Runner state path contains a symbolic link or junction: ${current}`);
      if (!entry.isDirectory()) throw new Error(`Runner state path is not a directory: ${current}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await fsp.mkdir(current);
      const entry = await fsp.lstat(current, { bigint: true });
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Runner state directory creation was replaced: ${current}`);
    }
  }
  const real = await fsp.realpath(absolute);
  const stat = await fsp.stat(absolute, { bigint: true });
  return { path: path.resolve(real), identity: statIdentity(stat) };
}

async function verifyDirectoryWithoutLinks(target, expectedIdentity) {
  const checked = await ensureDirectoryWithoutLinks(target);
  if (expectedIdentity && (checked.identity.dev !== expectedIdentity.dev || checked.identity.ino !== expectedIdentity.ino)) {
    throw new Error(`Runner state directory identity changed: ${target}`);
  }
  return checked;
}

function boundedTaskkillError(result) {
  return String(result?.stderr || result?.stdout || `exit ${result?.status ?? "unknown"}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 512);
}

export async function stopExactWindowsTree(options) {
  const pid = options.pid;
  const expectedCreationTime = options.expectedCreationTime;
  const creationTimeFor = options.creationTimeFor ?? processCreationTime;
  const taskkill = options.taskkill ?? ((targetPid) =>
    spawnSync("taskkill.exe", ["/PID", String(targetPid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000,
      killSignal: "SIGKILL"
    }));
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let current = await creationTimeFor(pid);
  if (!current || current !== expectedCreationTime) {
    throw new Error("Exact worker identity changed before termination.");
  }
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = taskkill(pid);
    if (result?.status === 0) return;
    lastError = boundedTaskkillError(result);
    current = await creationTimeFor(pid);
    if (!current || current !== expectedCreationTime) return;
    if (attempt < 3) await wait(attempt * 100);
  }
  throw new Error(`taskkill failed after 3 exact-owned attempts: ${lastError}`);
}

class BoundedTail {
  constructor(limitBytes) {
    this.limitBytes = limitBytes;
    this.chunks = [];
    this.retainedBytes = 0;
    this.totalBytes = 0;
  }

  push(chunk) {
    const buffer = Buffer.from(chunk);
    this.totalBytes += buffer.length;
    if (buffer.length >= this.limitBytes) {
      this.chunks = [buffer.subarray(buffer.length - this.limitBytes)];
      this.retainedBytes = this.limitBytes;
      return;
    }
    this.chunks.push(buffer);
    this.retainedBytes += buffer.length;
    while (this.retainedBytes > this.limitBytes && this.chunks.length > 0) {
      const excess = this.retainedBytes - this.limitBytes;
      const first = this.chunks[0];
      if (first.length <= excess) {
        this.chunks.shift();
        this.retainedBytes -= first.length;
      } else {
        this.chunks[0] = first.subarray(excess);
        this.retainedBytes -= excess;
      }
    }
  }

  bytes() {
    return Buffer.concat(this.chunks, this.retainedBytes);
  }

  summary() {
    return {
      totalBytes: this.totalBytes,
      retainedBytes: this.retainedBytes,
      droppedBytes: Math.max(0, this.totalBytes - this.retainedBytes),
      truncated: this.totalBytes > this.retainedBytes
    };
  }
}

function workerEvidenceMatches(metadata, evidence) {
  return Boolean(metadata && evidence &&
    metadata.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.runId === metadata.runId &&
    evidence.workerPid === metadata.workerPid &&
    evidence.workerNonce === metadata.workerNonce &&
    evidence.commandDigest === metadata.commandDigest &&
    evidence.workerCommandDigest === metadata.workerCommandDigest &&
    evidence.workerCreationTime === metadata.workerCreationTime);
}

async function verifyWorkerIdentity(metadata, evidence) {
  if (!metadata || metadata.schemaVersion !== RUNNER_SCHEMA_VERSION) return { owned: false, reason: "unsupported_metadata" };
  if (!evidence || evidence.schemaVersion !== RUNNER_SCHEMA_VERSION) return { owned: false, reason: "missing_worker_evidence" };
  if (!workerEvidenceMatches(metadata, evidence)) return { owned: false, reason: "worker_evidence_mismatch" };
  const currentCreationTime = await processCreationTime(metadata.workerPid);
  if (!currentCreationTime || currentCreationTime !== metadata.workerCreationTime) {
    return { owned: false, reason: "process_identity_mismatch" };
  }
  return { owned: true, reason: "exact_worker_identity" };
}

async function readRunFiles(directory) {
  const metadata = await readJson(path.join(directory, "metadata.json"));
  if (!metadata) return undefined;
  await verifyDirectoryWithoutLinks(directory, metadata.directoryIdentity);
  const [result, stopped, evidence] = await Promise.all([
    readJson(path.join(directory, "result.json")),
    readJson(path.join(directory, "stopped.json")),
    readJson(path.join(directory, "worker-evidence.json"))
  ]);
  return { metadata, result, stopped, evidence };
}

async function waitForTerminalPublication(directory, deadlineMs = 1_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const [result, stopped] = await Promise.all([
      readJson(path.join(directory, "result.json")),
      readJson(path.join(directory, "stopped.json"))
    ]);
    if (result || stopped) return { result, stopped };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { result: undefined, stopped: undefined };
}

async function runState(directory) {
  const files = await readRunFiles(directory);
  if (!files) return undefined;
  const { metadata, result, stopped, evidence } = files;
  let status;
  let identity;
  if (stopped) {
    status = "stopped";
    identity = { owned: false, reason: "stop_recorded" };
  } else if (result) {
    status = "completed";
    identity = { owned: false, reason: "result_recorded" };
  } else {
    identity = await verifyWorkerIdentity(metadata, evidence);
    if (identity.owned) {
      status = "running";
    } else {
      const exactEvidence = workerEvidenceMatches(metadata, evidence);
      const terminal = exactEvidence
        ? await waitForTerminalPublication(directory)
        : {
            result: await readJson(path.join(directory, "result.json")),
            stopped: await readJson(path.join(directory, "stopped.json"))
          };
      if (terminal.stopped) {
        status = "stopped";
        return { ...metadata, status, identity: { owned: false, reason: "stop_recorded" }, result: terminal.result ?? null, stopped: terminal.stopped };
      }
      if (terminal.result) {
        status = "completed";
        return { ...metadata, status, identity: { owned: false, reason: "result_recorded" }, result: terminal.result, stopped: null };
      }
      status = "stale";
    }
  }
  return {
    ...metadata,
    status,
    identity,
    result: result ?? null,
    stopped: stopped ?? null
  };
}

async function listStates(root) {
  let entries = [];
  try {
    await verifyDirectoryWithoutLinks(root);
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const states = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const state = await runState(path.join(root, entry.name));
      if (state) states.push(state);
    } catch (error) {
      states.push({ runId: entry.name, status: "stale", identity: { owned: false, reason: "state_path_invalid" }, error: error.message });
    }
  }
  return states.sort((left, right) => String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? "")));
}

async function waitForWorkerEvidence(directory, expectedNonce, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const evidence = await readJson(path.join(directory, "worker-evidence.json"));
    if (evidence?.workerNonce === expectedNonce) return evidence;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Detached runner worker did not publish identity evidence.");
}

async function worker() {
  const directory = path.resolve(option("--run-dir"));
  const command = await readJson(path.join(directory, "command.json"));
  if (!command || command.schemaVersion !== RUNNER_SCHEMA_VERSION || !Array.isArray(command.argv) || command.argv.length === 0) {
    fail("Worker command file is invalid.", 2);
  }
  await verifyDirectoryWithoutLinks(directory, command.directoryIdentity);
  const workerCreationTime = await processCreationTime(process.pid);
  if (!workerCreationTime) fail("Worker process creation time is unavailable.", 2);
  const workerScript = path.resolve(process.argv[1]);
  const evidence = {
    schemaVersion: RUNNER_SCHEMA_VERSION,
    runId: command.runId,
    workerPid: process.pid,
    workerNonce: command.workerNonce,
    workerCreationTime,
    commandDigest: command.commandDigest,
    workerCommandDigest: workerCommandDigest({ executable: process.execPath, script: workerScript, directory }),
    publishedAt: new Date().toISOString()
  };
  await writeJsonAtomic(directory, "worker-evidence.json", evidence);

  const stdoutTail = new BoundedTail(command.logLimitBytes);
  const stderrTail = new BoundedTail(command.logLimitBytes);
  const startedAt = new Date().toISOString();
  let child;
  let spawnError;
  try {
    child = spawn(command.argv[0], command.argv.slice(1), {
      cwd: command.cwd,
      env: createDetachedRunnerEnvironment(),
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => stdoutTail.push(chunk));
    child.stderr.on("data", (chunk) => stderrTail.push(chunk));
    await writeJsonAtomic(directory, "child.json", { schemaVersion: RUNNER_SCHEMA_VERSION, pid: child.pid, workerNonce: command.workerNonce });
  } catch (error) {
    spawnError = error;
  }

  const outcome = spawnError
    ? { code: 127, signal: null, error: spawnError.stack ?? spawnError.message }
    : await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", (error) => finish({ code: 127, signal: null, error: error.stack ?? error.message }));
      child.once("close", (code, signal) => finish({ code: code ?? 1, signal, error: null }));
    });

  await verifyDirectoryWithoutLinks(directory, command.directoryIdentity);
  const stdoutPath = path.join(directory, "stdout.log");
  const stderrPath = path.join(directory, "stderr.log");
  await Promise.all([
    fsp.writeFile(stdoutPath, stdoutTail.bytes()),
    fsp.writeFile(stderrPath, stderrTail.bytes())
  ]);
  const result = {
    schemaVersion: RUNNER_SCHEMA_VERSION,
    runId: command.runId,
    kind: command.kind,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: outcome.code,
    signal: outcome.signal,
    error: outcome.error,
    stdoutPath,
    stderrPath,
    stdout: stdoutTail.summary(),
    stderr: stderrTail.summary()
  };
  await writeJsonAtomic(directory, "result.json", result);
  process.exitCode = outcome.code;
}

async function main() {
  if (action === "__worker") {
    await worker();
  } else if (action === "start") {
    const separator = argv.indexOf("--");
    if (separator === -1 || separator === argv.length - 1) {
      fail("Usage: node scripts/long-task-runner.mjs start --kind <kind> [--root <dir>] [--cwd <dir>] [--log-limit-bytes N] -- <command> [args...]", 2);
    }
    const root = stateRoot();
    await ensureDirectoryWithoutLinks(root);
    const kind = safeSegment(option("--kind", "task"), "task");
    const existing = (await listStates(root)).find((state) => state.kind === kind && state.status === "running");
    if (existing) fail(`A ${kind} runner is already active: ${existing.runId}. Check it before retrying.`);

    const commandArgv = argv.slice(separator + 1);
    if (commandArgv.some(looksSecret)) {
      fail("Refusing to persist a secret-looking command argument. Pass credentials through an approved runtime mechanism, not the detached runner command line.", 2);
    }
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}-${randomBytes(4).toString("hex")}`;
    const directory = runDirectory(root, runId);
    const checkedDirectory = await ensureDirectoryWithoutLinks(directory);
    const workerNonce = randomBytes(32).toString("hex");
    const command = {
      schemaVersion: RUNNER_SCHEMA_VERSION,
      runId,
      kind,
      cwd: path.resolve(option("--cwd", process.cwd())),
      argv: commandArgv,
      workerNonce,
      commandDigest: "",
      directoryIdentity: checkedDirectory.identity,
      logLimitBytes: positiveInteger(option("--log-limit-bytes"), DEFAULT_LOG_LIMIT_BYTES, MAX_LOG_LIMIT_BYTES)
    };
    command.commandDigest = commandDigest(command);
    await writeJsonAtomic(directory, "command.json", command);

    const scriptPath = path.resolve(process.argv[1]);
    const workerProcess = spawn(process.execPath, [scriptPath, "__worker", "--run-dir", directory], {
      cwd: process.cwd(),
      env: createDetachedRunnerEnvironment(),
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    });
    workerProcess.unref();
    const observedCreationTimePromise = processCreationTime(workerProcess.pid);
    const evidence = await waitForWorkerEvidence(directory, workerNonce);
    const observedCreationTime = await observedCreationTimePromise;
    if (!observedCreationTime || observedCreationTime !== evidence.workerCreationTime) {
      fail("Worker creation-time handshake could not be verified.");
    }
    const metadata = {
      schemaVersion: RUNNER_SCHEMA_VERSION,
      runId,
      kind,
      workerPid: workerProcess.pid,
      workerNonce,
      workerCreationTime: observedCreationTime,
      workerCommandDigest: evidence.workerCommandDigest,
      commandDigest: command.commandDigest,
      startedAt: new Date().toISOString(),
      directory,
      directoryIdentity: checkedDirectory.identity,
      command: command.argv,
      cwd: command.cwd,
      logLimitBytes: command.logLimitBytes,
      host: os.hostname()
    };
    if (!workerEvidenceMatches(metadata, evidence)) fail("Worker evidence handshake did not match the exact command identity.");
    await writeJsonAtomic(directory, "metadata.json", metadata);
    const [result, stopped] = await Promise.all([
      readJson(path.join(directory, "result.json")),
      readJson(path.join(directory, "stopped.json"))
    ]);
    const state = {
      ...metadata,
      status: stopped ? "stopped" : result ? "completed" : "running",
      identity: stopped
        ? { owned: false, reason: "stop_recorded" }
        : result
          ? { owned: false, reason: "result_recorded" }
          : { owned: true, reason: "exact_startup_identity" },
      result: result ?? null,
      stopped: stopped ?? null
    };
    console.log(JSON.stringify(state, null, 2));
  } else if (action === "status") {
    const root = stateRoot();
    const runId = option("--run");
    if (!runId) fail("status requires --run <run-id>.", 2);
    await verifyDirectoryWithoutLinks(root);
    const state = await runState(runDirectory(root, runId));
    if (!state) fail(`Unknown run: ${runId}.`);
    console.log(JSON.stringify(state, null, 2));
  } else if (action === "list") {
    const root = stateRoot();
    try {
      console.log(JSON.stringify(await listStates(root), null, 2));
    } catch (error) {
      if (error?.code === "ENOENT") console.log("[]");
      else throw error;
    }
  } else if (action === "stop") {
    const root = stateRoot();
    const runId = option("--run");
    if (!runId) fail("stop requires --run <run-id>.", 2);
    await verifyDirectoryWithoutLinks(root);
    const directory = runDirectory(root, runId);
    const state = await runState(directory);
    if (!state) fail(`Unknown run: ${runId}.`);
    if (state.status !== "running") fail(`Run ${runId} is ${state.status}; no process tree will be terminated.`);
    const files = await readRunFiles(directory);
    const identity = await verifyWorkerIdentity(files.metadata, files.evidence);
    if (!identity.owned) fail(`Refusing to stop run ${runId}: ${identity.reason}.`);

    if (process.platform === "win32") {
      try {
        await stopExactWindowsTree({
          pid: state.workerPid,
          expectedCreationTime: state.workerCreationTime
        });
      } catch (error) {
        fail(`Unable to stop exact run ${runId}: ${error instanceof Error ? error.message : "taskkill failed"}`);
      }
    } else {
      try {
        process.kill(-state.workerPid, "SIGTERM");
      } catch {
        process.kill(state.workerPid, "SIGTERM");
      }
    }
    await verifyDirectoryWithoutLinks(directory, state.directoryIdentity);
    await writeJsonAtomic(directory, "stopped.json", {
      schemaVersion: RUNNER_SCHEMA_VERSION,
      runId,
      workerPid: state.workerPid,
      workerCreationTime: state.workerCreationTime,
      workerNonce: state.workerNonce,
      stoppedAt: new Date().toISOString()
    });
    console.log(JSON.stringify({ runId, status: "stop_requested" }, null, 2));
  } else {
    fail("Usage: node scripts/long-task-runner.mjs <start|status|list|stop> ...", 2);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}

#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeJsonAtomicFile } from "./atomic-file.mjs";
import { createOwnedTempEnvironment, sweepStaleOwnedTempRoots } from "./owned-temp-root.mjs";
import { processCreationTime } from "./process-identity.mjs";

export { processCreationTime } from "./process-identity.mjs";

export const RUNNER_SCHEMA_VERSION = 2;
export const DEFAULT_LOG_LIMIT_BYTES = 1024 * 1024;
export const MAX_LOG_LIMIT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_RUN_RETENTION_COUNT = 20;
export const DEFAULT_RUN_RETENTION_DAYS = 14;

const RUN_PRUNE_CLAIM_PATTERN = /^\.codexgpt-run-prune-[a-f0-9]{32}$/u;

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
const commandSeparator = argv.indexOf("--");
const optionArgv = commandSeparator === -1 ? argv : argv.slice(0, commandSeparator);

function option(name, fallback) {
  const index = optionArgv.indexOf(name);
  return index === -1 ? fallback : optionArgv[index + 1];
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

function resolveRunDirectory(root, runId) {
  const resolvedRoot = path.resolve(root);
  if (
    typeof runId !== "string" ||
    runId.length < 1 ||
    runId.length > 256 ||
    path.basename(runId) !== runId ||
    runId === "." ||
    runId === ".."
  ) throw new Error("Invalid run id.");
  const resolved = path.resolve(resolvedRoot, runId);
  if (!sameResolvedPath(path.dirname(resolved), resolvedRoot)) throw new Error("Invalid run id.");
  return resolved;
}

function runDirectory(root, runId) {
  try {
    return resolveRunDirectory(root, runId);
  } catch {
    fail("Invalid run id.", 2);
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandDigest(command) {
  return digest(JSON.stringify({
    cwd: command.cwd,
    argv: command.argv,
    tempRoot: command.tempRoot,
    logLimitBytes: command.logLimitBytes,
    retentionCount: command.retentionCount,
    retentionDays: command.retentionDays
  }));
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
  const expectedRunId = path.basename(directory);
  if (metadata.runId !== expectedRunId) {
    throw new Error("Run metadata id does not match its containing directory.");
  }
  await verifyDirectoryWithoutLinks(directory, metadata.directoryIdentity);
  const [result, stopped, evidence] = await Promise.all([
    readJson(path.join(directory, "result.json")),
    readJson(path.join(directory, "stopped.json")),
    readJson(path.join(directory, "worker-evidence.json"))
  ]);
  if (result && result.runId !== expectedRunId) {
    throw new Error("Run result id does not match its containing directory.");
  }
  if (stopped && stopped.runId !== expectedRunId) {
    throw new Error("Run stop record id does not match its containing directory.");
  }
  return { metadata, result, stopped, evidence };
}

export async function waitForTerminalPublication(directory, deadlineMs = 5_000) {
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
    if (!entry.isDirectory() || entry.isSymbolicLink() || RUN_PRUNE_CLAIM_PATTERN.test(entry.name)) continue;
    try {
      const state = await runState(path.join(root, entry.name));
      if (state) states.push(state);
    } catch (error) {
      states.push({ runId: entry.name, status: "stale", identity: { owned: false, reason: "state_path_invalid" }, error: error.message });
    }
  }
  return states.sort((left, right) => String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? "")));
}

function identityEquals(left, right) {
  return Boolean(left && right && String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino));
}

function sameResolvedPath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32"
    ? a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US")
    : a === b;
}

function terminalTimestamp(state) {
  const value = state.result?.completedAt ?? state.stopped?.stoppedAt ?? state.startedAt;
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function terminalRecordMatches(metadata, result, stopped) {
  if (metadata?.schemaVersion === RUNNER_SCHEMA_VERSION) {
    return Boolean(
      (result?.schemaVersion === RUNNER_SCHEMA_VERSION && result.runId === metadata.runId) ||
      (stopped?.schemaVersion === RUNNER_SCHEMA_VERSION && stopped.runId === metadata.runId)
    );
  }
  if (metadata?.schemaVersion === 1) {
    return Boolean(result?.runId === metadata.runId || stopped?.runId === metadata.runId);
  }
  return false;
}

async function recoverClaimedRunDirectories(root) {
  const summary = { scanned: 0, removed: 0, failed: 0, errors: [], missing: false };
  let entries;
  let canonicalRoot;
  try {
    const rootLexical = await fsp.lstat(root, { bigint: true });
    if (!rootLexical.isDirectory() || rootLexical.isSymbolicLink()) {
      throw new Error("Runner state root is not a safe directory.");
    }
    canonicalRoot = await fsp.realpath(root);
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      summary.missing = true;
      return summary;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !RUN_PRUNE_CLAIM_PATTERN.test(entry.name)) continue;
    summary.scanned += 1;
    try {
      const claimed = path.join(root, entry.name);
      const lexical = await fsp.lstat(claimed, { bigint: true });
      if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw new Error("Claimed run path is unsafe.");
      const canonical = await fsp.realpath(claimed);
      if (!sameResolvedPath(canonical, path.join(canonicalRoot, entry.name))) {
        throw new Error("Claimed run path is not canonical.");
      }
      const [metadata, result, stopped] = await Promise.all([
        readJson(path.join(claimed, "metadata.json")),
        readJson(path.join(claimed, "result.json")),
        readJson(path.join(claimed, "stopped.json"))
      ]);
      if (
        !metadata ||
        ![1, RUNNER_SCHEMA_VERSION].includes(metadata.schemaVersion) ||
        typeof metadata.runId !== "string" ||
        (metadata.schemaVersion === RUNNER_SCHEMA_VERSION &&
          !identityEquals(statIdentity(lexical), metadata.directoryIdentity))
      ) throw new Error("Claimed run metadata is invalid.");
      let original;
      try {
        original = resolveRunDirectory(root, metadata.runId);
      } catch {
        throw new Error("Claimed run id is invalid.");
      }
      if (!terminalRecordMatches(metadata, result, stopped)) throw new Error("Claimed run is not terminal.");
      await fsp.rm(claimed, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      summary.removed += 1;
    } catch (error) {
      summary.failed += 1;
      if (summary.errors.length < 8) {
        summary.errors.push({
          claim: entry.name,
          error: String(error?.code ?? error?.message ?? error).slice(0, 512)
        });
      }
    }
  }
  return summary;
}

async function removeTerminalRun(root, state) {
  if (state.status !== "completed" && state.status !== "stopped") {
    throw new Error(`Refusing to prune non-terminal run ${state.runId}.`);
  }
  const directory = resolveRunDirectory(root, state.runId);
  const lexical = await fsp.lstat(directory, { bigint: true });
  const lexicalIdentity = statIdentity(lexical);
  const expectedIdentity = state.schemaVersion === 1 ? lexicalIdentity : state.directoryIdentity;
  if (
    ![1, RUNNER_SCHEMA_VERSION].includes(state.schemaVersion) ||
    !lexical.isDirectory() ||
    lexical.isSymbolicLink() ||
    !identityEquals(lexicalIdentity, expectedIdentity) ||
    !terminalRecordMatches(state, state.result, state.stopped)
  ) {
    throw new Error(`Run directory identity or terminal evidence is invalid before pruning: ${state.runId}`);
  }
  const canonicalRoot = await fsp.realpath(root);
  const canonical = await fsp.realpath(directory);
  const expectedCanonical = path.join(canonicalRoot, path.basename(directory));
  if (!sameResolvedPath(canonical, expectedCanonical)) throw new Error(`Run directory is not canonical: ${state.runId}`);
  const stable = await fsp.lstat(directory, { bigint: true });
  if (!identityEquals(statIdentity(stable), expectedIdentity)) {
    throw new Error(`Run directory identity changed during pruning: ${state.runId}`);
  }
  const claimed = path.join(root, `.codexgpt-run-prune-${randomBytes(16).toString("hex")}`);
  await fsp.rename(directory, claimed);
  const claimedLexical = await fsp.lstat(claimed, { bigint: true });
  if (!claimedLexical.isDirectory() || claimedLexical.isSymbolicLink() || !identityEquals(statIdentity(claimedLexical), expectedIdentity)) {
    throw new Error(`Claimed run directory identity changed: ${state.runId}`);
  }
  const claimedCanonical = await fsp.realpath(claimed);
  const expectedClaimedCanonical = path.join(canonicalRoot, path.basename(claimed));
  if (!sameResolvedPath(claimedCanonical, expectedClaimedCanonical)) {
    throw new Error(`Claimed run directory is not canonical: ${state.runId}`);
  }
  try {
    await fsp.rm(claimed, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    try {
      await fsp.rename(claimed, directory);
    } catch {
      // Preserve the claimed directory rather than deleting an identity-ambiguous replacement.
    }
    throw error;
  }
}

async function pruneTerminalRuns(root, options = {}) {
  const keepCount = positiveInteger(options.keepCount, DEFAULT_RUN_RETENTION_COUNT, 10_000);
  const maxAgeDays = positiveInteger(options.maxAgeDays, DEFAULT_RUN_RETENTION_DAYS, 36_500);
  const preserveRunId = options.preserveRunId;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const claimed = await recoverClaimedRunDirectories(root);
  if (claimed.missing) {
    return { scanned: 0, removed: 0, retained: 0, failed: 0, invalid: 0, keepCount, maxAgeDays, errors: [], claimed };
  }
  const states = await listStates(root);
  const invalidStates = states.filter((state) => state.status === "stale" && typeof state.error === "string");
  const terminal = states
    .filter((state) => state.status === "completed" || state.status === "stopped")
    .filter((state) => state.runId !== preserveRunId)
    .sort((left, right) => terminalTimestamp(right) - terminalTimestamp(left));
  const retainedAllowance = Math.max(0, keepCount - (preserveRunId ? 1 : 0));
  const result = {
    scanned: terminal.length,
    removed: 0,
    retained: 0,
    failed: 0,
    invalid: invalidStates.length,
    keepCount,
    maxAgeDays,
    errors: invalidStates.slice(0, 8).map((state) => ({
      runId: state.runId,
      error: String(state.error).slice(0, 512)
    })),
    claimed
  };
  for (let index = 0; index < terminal.length; index += 1) {
    const state = terminal[index];
    const expiredByCount = index >= retainedAllowance;
    const expiredByAge = terminalTimestamp(state) < cutoff;
    if (!expiredByCount && !expiredByAge) {
      result.retained += 1;
      continue;
    }
    try {
      await removeTerminalRun(root, state);
      result.removed += 1;
    } catch (error) {
      result.failed += 1;
      if (result.errors.length < 8) {
        result.errors.push({
          runId: state.runId,
          error: String(error?.code ?? error?.message ?? error).slice(0, 512)
        });
      }
    }
  }
  return result;
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
  if (
    !command ||
    command.schemaVersion !== RUNNER_SCHEMA_VERSION ||
    !Array.isArray(command.argv) ||
    command.argv.length === 0 ||
    typeof command.cwd !== "string" ||
    typeof command.tempRoot !== "string" ||
    !Number.isSafeInteger(command.logLimitBytes) ||
    !Number.isSafeInteger(command.retentionCount) ||
    !Number.isSafeInteger(command.retentionDays) ||
    typeof command.commandDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(command.commandDigest) ||
    command.commandDigest !== commandDigest(command)
  ) {
    fail("Worker command file or digest is invalid.", 2);
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
  let taskTemp;
  let child;
  let spawnError;
  let outcome;
  let cleanupError;
  try {
    try {
      taskTemp = await createOwnedTempEnvironment("detached-task", {
        baseRoot: command.tempRoot,
        hostEnvironment: createDetachedRunnerEnvironment()
      });
      child = spawn(command.argv[0], command.argv.slice(1), {
        cwd: command.cwd,
        env: taskTemp.environment,
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

    outcome = spawnError
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
  } finally {
    if (taskTemp) {
      try {
        await taskTemp.cleanup();
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (cleanupError) {
    const detail = String(cleanupError?.code ?? cleanupError?.message ?? "unknown").slice(0, 512);
    outcome = {
      code: outcome?.code === 0 ? 1 : outcome?.code ?? 1,
      signal: outcome?.signal ?? null,
      error: [outcome?.error, `TASK_TEMP_CLEANUP_FAILED: ${detail}`].filter(Boolean).join("\n")
    };
  }

  await verifyDirectoryWithoutLinks(directory, command.directoryIdentity);
  const stdoutPath = path.join(directory, "stdout.log");
  const stderrPath = path.join(directory, "stderr.log");
  await Promise.all([
    fsp.writeFile(stdoutPath, stdoutTail.bytes()),
    fsp.writeFile(stderrPath, stderrTail.bytes())
  ]);
  let retention;
  try {
    retention = await pruneTerminalRuns(path.dirname(directory), {
      keepCount: command.retentionCount,
      maxAgeDays: command.retentionDays,
      preserveRunId: command.runId
    });
  } catch (error) {
    retention = {
      scanned: 0,
      removed: 0,
      retained: 0,
      failed: 1,
      keepCount: command.retentionCount,
      maxAgeDays: command.retentionDays,
      error: String(error?.message ?? error).slice(0, 512)
    };
  }
  const result = {
    schemaVersion: RUNNER_SCHEMA_VERSION,
    runId: command.runId,
    kind: command.kind,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: outcome.code,
    signal: outcome.signal,
    error: outcome.error,
    temporaryState: {
      cleaned: cleanupError === undefined
    },
    retention,
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
      fail("Usage: node scripts/long-task-runner.mjs start --kind <kind> [--root <dir>] [--temp-root <dir>] [--cwd <dir>] [--log-limit-bytes N] [--retention-count N] [--retention-days N] -- <command> [args...]", 2);
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
      tempRoot: path.resolve(option("--temp-root", os.tmpdir())),
      logLimitBytes: positiveInteger(option("--log-limit-bytes"), DEFAULT_LOG_LIMIT_BYTES, MAX_LOG_LIMIT_BYTES),
      retentionCount: positiveInteger(option("--retention-count"), DEFAULT_RUN_RETENTION_COUNT, 10_000),
      retentionDays: positiveInteger(option("--retention-days"), DEFAULT_RUN_RETENTION_DAYS, 36_500)
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
      retentionCount: command.retentionCount,
      retentionDays: command.retentionDays,
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
  } else if (action === "clean") {
    const root = stateRoot();
    const tempRoot = path.resolve(option("--temp-root", os.tmpdir()));
    const staleTemporaryState = await sweepStaleOwnedTempRoots({
      baseRoot: tempRoot,
      limit: positiveInteger(option("--sweep-limit"), 1024, 10_000)
    });
    const runEvidence = await pruneTerminalRuns(root, {
      keepCount: positiveInteger(option("--retention-count"), DEFAULT_RUN_RETENTION_COUNT, 10_000),
      maxAgeDays: positiveInteger(option("--retention-days"), DEFAULT_RUN_RETENTION_DAYS, 36_500)
    });
    console.log(JSON.stringify({
      schemaVersion: 1,
      tempRoot,
      runRoot: root,
      staleTemporaryState,
      runEvidence
    }, null, 2));
    if (
      staleTemporaryState.limited ||
      staleTemporaryState.invalid > 0 ||
      runEvidence.invalid > 0 ||
      runEvidence.failed > 0 ||
      runEvidence.claimed.failed > 0
    ) process.exitCode = 1;
  } else {
    fail("Usage: node scripts/long-task-runner.mjs <start|status|list|stop|clean> ...", 2);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}

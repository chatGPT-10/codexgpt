import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { processCreationTimeSync, processIsAlive } from "./process-identity.mjs";

export const OWNED_TEMP_SCHEMA_VERSION = 1;
export const OWNED_TEMP_MARKER = ".codexgpt-owned-temp-v1.json";
export const OWNED_TEMP_PREFIX = "codexgpt-owned-v1-";

const PURPOSE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const ROOT_NAME_PATTERN = /^codexgpt-owned-v1-([a-z][a-z0-9-]{0,31})-([1-9][0-9]{0,9})-([a-f0-9]{16})-([A-Za-z0-9_-]{6,})$/u;
const CLAIM_NAME_PATTERN = /^(codexgpt-owned-v1-[a-z][a-z0-9-]{0,31}-[1-9][0-9]{0,9}-[a-f0-9]{16}-[A-Za-z0-9_-]{6,})\.claim-([a-f0-9]{32})$/u;
const MAX_MARKER_BYTES = 4096;
const DEFAULT_SWEEP_LIMIT = 1024;
const activeRoots = new Map();
const sweepOffsets = new Map();
let exitCleanupInstalled = false;
let currentProcessStartedAt;
let currentProcessIdentityChecked = false;

function ownedTempError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32"
    ? a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US")
    : a === b;
}

function assertPurpose(purpose) {
  if (typeof purpose !== "string" || !PURPOSE_PATTERN.test(purpose)) {
    throw ownedTempError("OWNED_TEMP_PURPOSE_INVALID");
  }
  return purpose;
}

function boundedSweepLimit(value) {
  const parsed = value ?? DEFAULT_SWEEP_LIMIT;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw ownedTempError("OWNED_TEMP_SWEEP_LIMIT_INVALID");
  }
  return parsed;
}

function directoryIdentity(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
}

function identityMatches(stat, expected) {
  return !expected || (String(stat.dev) === expected.dev && String(stat.ino) === expected.ino);
}

function normalizeBaseSync(baseRoot = os.tmpdir()) {
  const requested = path.resolve(baseRoot);
  const lexical = fs.lstatSync(requested, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw ownedTempError("OWNED_TEMP_BASE_UNSAFE");
  const canonical = fs.realpathSync.native(requested);
  return canonical;
}

async function normalizeBase(baseRoot = os.tmpdir()) {
  const requested = path.resolve(baseRoot);
  const lexical = await fsp.lstat(requested, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw ownedTempError("OWNED_TEMP_BASE_UNSAFE");
  const canonical = await fsp.realpath(requested);
  return canonical;
}

function markerKeysAreExact(marker) {
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return false;
  const keys = Object.keys(marker).sort().join("\0");
  const legacy = [
      "createdAt",
      "kind",
      "nonce",
      "pid",
      "purpose",
      "rootName",
      "schemaVersion"
    ].sort().join("\0");
  const current = [
    "createdAt",
    "kind",
    "nonce",
    "pid",
    "processStartedAt",
    "purpose",
    "rootName",
    "schemaVersion"
  ].sort().join("\0");
  return keys === legacy || keys === current;
}

function validateMarker(marker, rootName) {
  const match = ROOT_NAME_PATTERN.exec(rootName);
  if (
    !markerKeysAreExact(marker) ||
    marker.schemaVersion !== OWNED_TEMP_SCHEMA_VERSION ||
    marker.kind !== "codexgpt-owned-temp" ||
    typeof marker.purpose !== "string" ||
    !PURPOSE_PATTERN.test(marker.purpose) ||
    typeof marker.rootName !== "string" ||
    marker.rootName !== rootName ||
    !Number.isSafeInteger(marker.pid) ||
    marker.pid < 1 ||
    typeof marker.nonce !== "string" ||
    !/^[a-f0-9]{16}$/u.test(marker.nonce) ||
    typeof marker.createdAt !== "string" ||
    !Number.isFinite(Date.parse(marker.createdAt)) ||
    (Object.hasOwn(marker, "processStartedAt") && (
      typeof marker.processStartedAt !== "string" ||
      marker.processStartedAt.length < 1 ||
      marker.processStartedAt.length > 256
    )) ||
    !match ||
    match[1] !== marker.purpose ||
    Number(match[2]) !== marker.pid ||
    match[3] !== marker.nonce
  ) throw ownedTempError("OWNED_TEMP_MARKER_INVALID");
  return Object.freeze({ ...marker });
}

function parseCandidateName(rootName) {
  const direct = ROOT_NAME_PATTERN.exec(rootName);
  if (direct) return { actualRootName: rootName, markerRootName: rootName, match: direct, claimed: false };
  const claim = CLAIM_NAME_PATTERN.exec(rootName);
  if (!claim) return null;
  const original = claim[1];
  const originalMatch = ROOT_NAME_PATTERN.exec(original);
  if (!originalMatch) return null;
  return { actualRootName: rootName, markerRootName: original, match: originalMatch, claimed: true };
}

function candidatePath(baseRoot, rootName) {
  if (!parseCandidateName(rootName)) throw ownedTempError("OWNED_TEMP_PATH_INVALID");
  const candidate = path.resolve(baseRoot, rootName);
  if (!samePath(path.dirname(candidate), baseRoot)) throw ownedTempError("OWNED_TEMP_PATH_INVALID");
  return candidate;
}

function readVerifiedOwnedRootSync(baseRoot, rootName, expectedIdentity) {
  const parsed = parseCandidateName(rootName);
  if (!parsed) throw ownedTempError("OWNED_TEMP_PATH_INVALID");
  const root = candidatePath(baseRoot, rootName);
  const lexical = fs.lstatSync(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink() || !identityMatches(lexical, expectedIdentity)) {
    throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  }
  const canonical = fs.realpathSync.native(root);
  if (!samePath(canonical, root)) throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  const markerPath = path.join(root, OWNED_TEMP_MARKER);
  const markerLexical = fs.lstatSync(markerPath, { bigint: true });
  if (
    !markerLexical.isFile() ||
    markerLexical.isSymbolicLink() ||
    markerLexical.nlink !== 1n ||
    markerLexical.size < 2n ||
    markerLexical.size > BigInt(MAX_MARKER_BYTES)
  ) throw ownedTempError("OWNED_TEMP_MARKER_INVALID");
  const descriptor = fs.openSync(markerPath, "r");
  try {
    const bytes = fs.readFileSync(descriptor);
    const stable = fs.fstatSync(descriptor, { bigint: true });
    if (
      !stable.isFile() ||
      stable.nlink !== 1n ||
      stable.dev !== markerLexical.dev ||
      stable.ino !== markerLexical.ino ||
      stable.size !== markerLexical.size ||
      stable.mtimeNs !== markerLexical.mtimeNs
    ) throw ownedTempError("OWNED_TEMP_MARKER_INVALID");
    return {
      root,
      identity: directoryIdentity(lexical),
      marker: validateMarker(JSON.parse(bytes.toString("utf8")), parsed.markerRootName)
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

async function readVerifiedOwnedRoot(baseRoot, rootName, expectedIdentity) {
  const parsed = parseCandidateName(rootName);
  if (!parsed) throw ownedTempError("OWNED_TEMP_PATH_INVALID");
  const root = candidatePath(baseRoot, rootName);
  const lexical = await fsp.lstat(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink() || !identityMatches(lexical, expectedIdentity)) {
    throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  }
  const canonical = await fsp.realpath(root);
  if (!samePath(canonical, root)) throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  const markerPath = path.join(root, OWNED_TEMP_MARKER);
  const markerLexical = await fsp.lstat(markerPath, { bigint: true });
  if (
    !markerLexical.isFile() ||
    markerLexical.isSymbolicLink() ||
    markerLexical.nlink !== 1n ||
    markerLexical.size < 2n ||
    markerLexical.size > BigInt(MAX_MARKER_BYTES)
  ) throw ownedTempError("OWNED_TEMP_MARKER_INVALID");
  const handle = await fsp.open(markerPath, "r");
  try {
    const [bytes, stable] = await Promise.all([handle.readFile(), handle.stat({ bigint: true })]);
    if (
      !stable.isFile() ||
      stable.nlink !== 1n ||
      stable.dev !== markerLexical.dev ||
      stable.ino !== markerLexical.ino ||
      stable.size !== markerLexical.size ||
      stable.mtimeNs !== markerLexical.mtimeNs
    ) throw ownedTempError("OWNED_TEMP_MARKER_INVALID");
    return {
      root,
      identity: directoryIdentity(lexical),
      marker: validateMarker(JSON.parse(bytes.toString("utf8")), parsed.markerRootName)
    };
  } finally {
    await handle.close();
  }
}

function processStartedAt() {
  if (!currentProcessIdentityChecked) {
    currentProcessStartedAt = processCreationTimeSync(process.pid);
    currentProcessIdentityChecked = true;
  }
  return currentProcessStartedAt;
}

function ownerIsActive(marker, cache) {
  if (!processIsAlive(marker.pid)) return false;
  if (!Object.hasOwn(marker, "processStartedAt")) return true;
  let current = cache.get(marker.pid);
  if (!cache.has(marker.pid)) {
    current = processCreationTimeSync(marker.pid);
    cache.set(marker.pid, current);
  }
  return !current || current === marker.processStartedAt;
}

function claimName(markerRootName) {
  return `${markerRootName}.claim-${randomBytes(16).toString("hex")}`;
}

function removeVerifiedRootSync(baseRoot, rootName, expectedIdentity) {
  const verified = readVerifiedOwnedRootSync(baseRoot, rootName, expectedIdentity);
  const finalIdentity = fs.lstatSync(verified.root, { bigint: true });
  if (!identityMatches(finalIdentity, verified.identity)) throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  const claimedRootName = claimName(verified.marker.rootName);
  const claimedRoot = candidatePath(baseRoot, claimedRootName);
  fs.renameSync(verified.root, claimedRoot);
  const claimed = readVerifiedOwnedRootSync(baseRoot, claimedRootName, verified.identity);
  fs.rmSync(claimed.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function removeVerifiedRoot(baseRoot, rootName, expectedIdentity) {
  const verified = await readVerifiedOwnedRoot(baseRoot, rootName, expectedIdentity);
  const finalIdentity = await fsp.lstat(verified.root, { bigint: true });
  if (!identityMatches(finalIdentity, verified.identity)) throw ownedTempError("OWNED_TEMP_IDENTITY_CHANGED");
  const claimedRootName = claimName(verified.marker.rootName);
  const claimedRoot = candidatePath(baseRoot, claimedRootName);
  await fsp.rename(verified.root, claimedRoot);
  const claimed = await readVerifiedOwnedRoot(baseRoot, claimedRootName, verified.identity);
  await fsp.rm(claimed.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function installExitCleanup() {
  if (exitCleanupInstalled) return;
  exitCleanupInstalled = true;
  process.once("exit", () => {
    for (const record of [...activeRoots.values()]) {
      try {
        removeVerifiedRootSync(record.baseRoot, record.rootName, record.identity);
      } catch {
        // A changed or locked root is intentionally preserved for a later exact sweep.
      }
    }
  });
}

function createMarker(purpose, rootName, nonce) {
  const startedAt = processStartedAt();
  return Object.freeze({
    schemaVersion: OWNED_TEMP_SCHEMA_VERSION,
    kind: "codexgpt-owned-temp",
    purpose,
    rootName,
    pid: process.pid,
    nonce,
    ...(startedAt ? { processStartedAt: startedAt } : {}),
    createdAt: new Date().toISOString()
  });
}

function makeHandle(record) {
  let cleaned = false;
  let cleanupPromise;
  return Object.freeze({
    path: record.root,
    marker: record.marker,
    async cleanup() {
      if (cleaned) return;
      if (!cleanupPromise) {
        cleanupPromise = (async () => {
          await removeVerifiedRoot(record.baseRoot, record.rootName, record.identity);
          cleaned = true;
          activeRoots.delete(record.root);
        })();
      }
      try {
        await cleanupPromise;
      } finally {
        if (!cleaned) cleanupPromise = undefined;
      }
    },
    cleanupSync() {
      if (cleaned) return;
      if (cleanupPromise) throw ownedTempError("OWNED_TEMP_CLEANUP_IN_PROGRESS");
      removeVerifiedRootSync(record.baseRoot, record.rootName, record.identity);
      cleaned = true;
      activeRoots.delete(record.root);
    }
  });
}

function selectedCandidateNames(baseRoot, entries, limit, result) {
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(OWNED_TEMP_PREFIX)) continue;
    if (parseCandidateName(entry.name)) names.push(entry.name);
    else result.invalid += 1;
  }
  names.sort();
  result.limited = names.length > limit;
  if (names.length === 0) return [];
  let offset = sweepOffsets.get(baseRoot);
  if (!Number.isSafeInteger(offset)) offset = randomInt(names.length);
  offset %= names.length;
  const count = Math.min(limit, names.length);
  const selected = Array.from({ length: count }, (_, index) => names[(offset + index) % names.length]);
  sweepOffsets.delete(baseRoot);
  sweepOffsets.set(baseRoot, (offset + count) % names.length);
  if (sweepOffsets.size > 128) sweepOffsets.delete(sweepOffsets.keys().next().value);
  return selected;
}

function removeEmptyUnmarkedRootSync(baseRoot, rootName) {
  const parsed = parseCandidateName(rootName);
  if (!parsed || parsed.claimed) return "invalid";
  const root = candidatePath(baseRoot, rootName);
  const lexical = fs.lstatSync(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) return "invalid";
  if (activeRoots.has(root) || processIsAlive(Number(parsed.match[2]))) return "active";
  try {
    fs.lstatSync(path.join(root, OWNED_TEMP_MARKER));
    return "invalid";
  } catch (error) {
    if (error?.code !== "ENOENT") return "invalid";
  }
  if (!samePath(fs.realpathSync.native(root), root)) return "invalid";
  if (fs.readdirSync(root).length !== 0) return "invalid";
  const stable = fs.lstatSync(root, { bigint: true });
  if (!identityMatches(stable, directoryIdentity(lexical))) return "invalid";
  fs.rmdirSync(root);
  return "removed";
}

async function removeEmptyUnmarkedRoot(baseRoot, rootName) {
  const parsed = parseCandidateName(rootName);
  if (!parsed || parsed.claimed) return "invalid";
  const root = candidatePath(baseRoot, rootName);
  const lexical = await fsp.lstat(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) return "invalid";
  if (activeRoots.has(root) || processIsAlive(Number(parsed.match[2]))) return "active";
  try {
    await fsp.lstat(path.join(root, OWNED_TEMP_MARKER));
    return "invalid";
  } catch (error) {
    if (error?.code !== "ENOENT") return "invalid";
  }
  if (!samePath(await fsp.realpath(root), root)) return "invalid";
  if ((await fsp.readdir(root)).length !== 0) return "invalid";
  const stable = await fsp.lstat(root, { bigint: true });
  if (!identityMatches(stable, directoryIdentity(lexical))) return "invalid";
  await fsp.rmdir(root);
  return "removed";
}

export function sweepStaleOwnedTempRootsSync(options = {}) {
  const baseRoot = normalizeBaseSync(options.baseRoot);
  const limit = boundedSweepLimit(options.limit);
  const result = { scanned: 0, removed: 0, active: 0, invalid: 0, limited: false };
  const names = selectedCandidateNames(
    baseRoot,
    fs.readdirSync(baseRoot, { withFileTypes: true }),
    limit,
    result
  );
  const identityCache = new Map();
  for (const rootName of names) {
    result.scanned += 1;
    try {
      const verified = readVerifiedOwnedRootSync(baseRoot, rootName);
      if (activeRoots.has(verified.root) || ownerIsActive(verified.marker, identityCache)) {
        result.active += 1;
        continue;
      }
      removeVerifiedRootSync(baseRoot, rootName, verified.identity);
      result.removed += 1;
    } catch (error) {
      try {
        const state = removeEmptyUnmarkedRootSync(baseRoot, rootName);
        result[state] += 1;
      } catch {
        result.invalid += 1;
      }
    }
  }
  return Object.freeze(result);
}

export async function sweepStaleOwnedTempRoots(options = {}) {
  const baseRoot = await normalizeBase(options.baseRoot);
  const limit = boundedSweepLimit(options.limit);
  const result = { scanned: 0, removed: 0, active: 0, invalid: 0, limited: false };
  const names = selectedCandidateNames(
    baseRoot,
    await fsp.readdir(baseRoot, { withFileTypes: true }),
    limit,
    result
  );
  const identityCache = new Map();
  for (const rootName of names) {
    result.scanned += 1;
    try {
      const verified = await readVerifiedOwnedRoot(baseRoot, rootName);
      if (activeRoots.has(verified.root) || ownerIsActive(verified.marker, identityCache)) {
        result.active += 1;
        continue;
      }
      await removeVerifiedRoot(baseRoot, rootName, verified.identity);
      result.removed += 1;
    } catch (error) {
      try {
        const state = await removeEmptyUnmarkedRoot(baseRoot, rootName);
        result[state] += 1;
      } catch {
        result.invalid += 1;
      }
    }
  }
  return Object.freeze(result);
}

export function createOwnedTempRootSync(purpose, options = {}) {
  const safePurpose = assertPurpose(purpose);
  const baseRoot = normalizeBaseSync(options.baseRoot);
  if (options.sweep !== false) sweepStaleOwnedTempRootsSync({ baseRoot, limit: options.sweepLimit });
  const nonce = randomBytes(8).toString("hex");
  const prefix = path.join(baseRoot, `${OWNED_TEMP_PREFIX}${safePurpose}-${process.pid}-${nonce}-`);
  const root = fs.mkdtempSync(prefix);
  const rootName = path.basename(root);
  const lexical = fs.lstatSync(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw ownedTempError("OWNED_TEMP_CREATE_UNSAFE");
  let marker;
  try {
    marker = createMarker(safePurpose, rootName, nonce);
    fs.writeFileSync(path.join(root, OWNED_TEMP_MARKER), `${JSON.stringify(marker)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    try {
      const current = fs.lstatSync(root, { bigint: true });
      if (identityMatches(current, directoryIdentity(lexical)) && fs.readdirSync(root).length === 0) {
        fs.rmdirSync(root);
      }
    } catch {
      // A non-empty or identity-changed root is preserved for exact stale-root recovery.
    }
    throw error;
  }
  const record = Object.freeze({ root, rootName, baseRoot, identity: directoryIdentity(lexical), marker });
  activeRoots.set(root, record);
  installExitCleanup();
  return makeHandle(record);
}

export async function createOwnedTempRoot(purpose, options = {}) {
  const safePurpose = assertPurpose(purpose);
  const baseRoot = await normalizeBase(options.baseRoot);
  if (options.sweep !== false) await sweepStaleOwnedTempRoots({ baseRoot, limit: options.sweepLimit });
  const nonce = randomBytes(8).toString("hex");
  const prefix = path.join(baseRoot, `${OWNED_TEMP_PREFIX}${safePurpose}-${process.pid}-${nonce}-`);
  const root = await fsp.mkdtemp(prefix);
  const rootName = path.basename(root);
  const lexical = await fsp.lstat(root, { bigint: true });
  if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw ownedTempError("OWNED_TEMP_CREATE_UNSAFE");
  let marker;
  try {
    marker = createMarker(safePurpose, rootName, nonce);
    await fsp.writeFile(path.join(root, OWNED_TEMP_MARKER), `${JSON.stringify(marker)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    try {
      const current = await fsp.lstat(root, { bigint: true });
      if (identityMatches(current, directoryIdentity(lexical)) && (await fsp.readdir(root)).length === 0) {
        await fsp.rmdir(root);
      }
    } catch {
      // A non-empty or identity-changed root is preserved for exact stale-root recovery.
    }
    throw error;
  }
  const record = Object.freeze({ root, rootName, baseRoot, identity: directoryIdentity(lexical), marker });
  activeRoots.set(root, record);
  installExitCleanup();
  return makeHandle(record);
}

export async function createOwnedTempEnvironment(purpose, options = {}) {
  const hostEnvironment = options.hostEnvironment ?? process.env;
  const inheritedBaseRoot = hostEnvironment.CODEXGPT_OWNED_TEMP_BASE;
  const owned = await createOwnedTempRoot(purpose, {
    ...options,
    ...(options.baseRoot === undefined && inheritedBaseRoot
      ? { baseRoot: inheritedBaseRoot }
      : {})
  });
  const ownedBaseRoot = path.dirname(owned.path);
  const tempPath = path.join(owned.path, "child-temp");
  try {
    await fsp.mkdir(tempPath, { mode: 0o700 });
  } catch (error) {
    try {
      await owned.cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "OWNED_TEMP_ENVIRONMENT_CREATE_FAILED");
    }
    throw error;
  }
  return Object.freeze({
    rootPath: owned.path,
    tempPath,
    marker: owned.marker,
    environment: Object.freeze({
      ...hostEnvironment,
      CODEXGPT_OWNED_TEMP_BASE: ownedBaseRoot,
      TEMP: tempPath,
      TMP: tempPath,
      TMPDIR: tempPath
    }),
    cleanup: owned.cleanup,
    cleanupSync: owned.cleanupSync
  });
}

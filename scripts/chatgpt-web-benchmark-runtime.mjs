#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REQUIRED_BUILD_ARTIFACTS = Object.freeze([
  "dist/http.js",
  "dist/server.js"
]);

function pathApiFor(input) {
  return /^[A-Za-z]:[\\/]/u.test(String(input)) ? path.win32 : path;
}

function normalizeSha(value, label) {
  const sha = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(`${label} must be an exact 40-character Git SHA.`);
  return sha;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
    stdio: options.stdio ?? "pipe"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    const stdout = String(result.stdout ?? "").trim();
    throw new Error(
      `${options.label ?? command} failed with exit code ${result.status}.${stderr ? ` ${stderr}` : stdout ? ` ${stdout}` : ""}`
    );
  }
  const stdout = String(result.stdout ?? "");
  return options.trimOutput === false ? stdout : stdout.trim();
}

async function exactFileDigest(filePath) {
  const bytes = await fsp.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertDirectory(directory, label) {
  let stat;
  try {
    stat = await fsp.stat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} does not exist: ${directory}`);
    throw error;
  }
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${directory}`);
}

async function defaultResolveHead(checkoutRoot) {
  return runChecked("git", ["-C", checkoutRoot, "rev-parse", "HEAD"], {
    label: "git rev-parse"
  });
}

async function assertTrackedWorktreeClean(checkoutRoot) {
  const status = runChecked("git", ["-C", checkoutRoot, "status", "--porcelain", "--untracked-files=no"], {
    label: "git status"
  });
  if (status) throw new Error(`Benchmark server checkout has tracked changes and is not safe to use: ${status}`);
}

function readWorktreeStatus(checkoutRoot) {
  return runChecked("git", ["-C", checkoutRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    label: "git status",
    trimOutput: false
  });
}

function normalizedOverlayManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Benchmark successor overlay manifest must be an object.");
  }
  if (value.schemaVersion !== 1) throw new Error("Benchmark successor overlay manifest schemaVersion must be 1.");
  const label = String(value.label ?? "").trim();
  if (!label) throw new Error("Benchmark successor overlay manifest label is required.");
  if (!Array.isArray(value.entries) || value.entries.length === 0 || value.entries.length > 64) {
    throw new Error("Benchmark successor overlay manifest must contain 1-64 entries.");
  }
  const seen = new Set();
  const entries = value.entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Benchmark successor overlay entries must be objects.");
    }
    const relativePath = String(entry.path ?? "").trim();
    if (
      !relativePath ||
      relativePath.includes("\\") ||
      relativePath.startsWith("/") ||
      /^[A-Za-z]:/u.test(relativePath) ||
      relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Benchmark successor overlay path is invalid: ${relativePath || "(empty)"}`);
    }
    if (seen.has(relativePath)) throw new Error(`Benchmark successor overlay path is duplicated: ${relativePath}`);
    seen.add(relativePath);
    const status = String(entry.status ?? "").trim();
    if (status !== "modified" && status !== "untracked") {
      throw new Error(`Benchmark successor overlay status must be modified or untracked: ${relativePath}`);
    }
    const sha256 = String(entry.sha256 ?? "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new Error(`Benchmark successor overlay sha256 is invalid: ${relativePath}`);
    }
    return Object.freeze({ path: relativePath, status, sha256 });
  });
  return Object.freeze({ schemaVersion: 1, label, entries: Object.freeze(entries) });
}

export async function assertExactOverlayState({ checkoutRoot, expectedOverlay, statusText }) {
  const checkout = await fsp.realpath(checkoutRoot);
  const overlay = normalizedOverlayManifest(expectedOverlay);
  const lines = String(statusText ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const actual = new Map();
  for (const line of lines) {
    if (line.length < 4) throw new Error(`Benchmark server checkout has an unsupported status line: ${line}`);
    const code = line.slice(0, 2);
    const relativePath = line.slice(3);
    if (code !== "??" && code[0] !== " ") {
      throw new Error(`Benchmark successor overlay must not contain staged changes: ${line}`);
    }
    const status = code === "??" ? "untracked" : code === " M" ? "modified" : null;
    if (!status) throw new Error(`Benchmark successor overlay has an unsupported worktree change: ${line}`);
    if (!relativePath || actual.has(relativePath)) {
      throw new Error(`Benchmark successor overlay has an invalid or duplicate status path: ${relativePath || "(empty)"}`);
    }
    actual.set(relativePath, status);
  }
  if (actual.size !== overlay.entries.length) {
    throw new Error("Benchmark server checkout does not match the exact reviewed overlay path set.");
  }
  for (const entry of overlay.entries) {
    if (actual.get(entry.path) !== entry.status) {
      throw new Error(`Benchmark server checkout does not match the exact reviewed overlay: ${entry.path}`);
    }
    const digest = await exactFileDigest(path.join(checkout, ...entry.path.split("/")));
    if (digest !== entry.sha256) {
      throw new Error(`Benchmark successor overlay digest mismatch for ${entry.path}.`);
    }
  }
  return Object.freeze({
    label: overlay.label,
    entries: overlay.entries
  });
}

export async function assertBenchmarkCheckout({
  sourceRoot,
  checkoutRoot,
  expectedSha,
  expectedOverlay,
  resolveHead = defaultResolveHead,
  assertClean = assertTrackedWorktreeClean,
  readStatus = readWorktreeStatus
}) {
  const expected = normalizeSha(expectedSha, "expectedSha");
  const source = await fsp.realpath(sourceRoot);
  const checkout = await fsp.realpath(checkoutRoot);
  if (source.toLocaleLowerCase("en-US") === checkout.toLocaleLowerCase("en-US")) {
    throw new Error("Benchmark server checkout must be isolated from the source checkout.");
  }

  await assertDirectory(path.join(source, "node_modules"), "Source node_modules");
  for (const file of ["package.json", "package-lock.json"]) {
    const sourceDigest = await exactFileDigest(path.join(source, file));
    const checkoutDigest = await exactFileDigest(path.join(checkout, file));
    if (sourceDigest !== checkoutDigest) {
      throw new Error(`${file} in the benchmark checkout does not match the approved source dependency identity.`);
    }
  }

  const actual = normalizeSha(await resolveHead(checkout), "actual checkout HEAD");
  if (actual !== expected) {
    throw new Error(`Benchmark checkout ref mismatch: expected ${expected}, actual ${actual}.`);
  }
  const overlay = expectedOverlay
    ? await assertExactOverlayState({
        checkoutRoot: checkout,
        expectedOverlay,
        statusText: await readStatus(checkout)
      })
    : null;
  if (!overlay) await assertClean(checkout);

  return Object.freeze({
    sourceRoot: source,
    checkoutRoot: checkout,
    head: actual,
    packageIdentityMatches: true,
    overlay
  });
}

export async function ensureSharedNodeModules({ sourceRoot, checkoutRoot }) {
  const source = await fsp.realpath(sourceRoot);
  const checkout = await fsp.realpath(checkoutRoot);
  const sourceModules = path.join(source, "node_modules");
  const checkoutModules = path.join(checkout, "node_modules");
  await assertDirectory(sourceModules, "Source node_modules");

  try {
    await fsp.lstat(checkoutModules);
    const existingReal = await fsp.realpath(checkoutModules);
    const sourceReal = await fsp.realpath(sourceModules);
    if (existingReal.toLocaleLowerCase("en-US") !== sourceReal.toLocaleLowerCase("en-US")) {
      throw new Error(
        `node_modules already exists in the benchmark checkout and is not the approved shared dependency root: ${checkoutModules}`
      );
    }
    return Object.freeze({ created: false, path: checkoutModules, target: sourceReal });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await fsp.symlink(sourceModules, checkoutModules, process.platform === "win32" ? "junction" : "dir");
  const linkedReal = await fsp.realpath(checkoutModules);
  const sourceReal = await fsp.realpath(sourceModules);
  if (linkedReal.toLocaleLowerCase("en-US") !== sourceReal.toLocaleLowerCase("en-US")) {
    throw new Error("Shared node_modules link did not resolve to the approved dependency root.");
  }
  return Object.freeze({ created: true, path: checkoutModules, target: sourceReal });
}

export async function prepareBenchmarkCheckout({
  sourceRoot,
  checkoutRoot,
  expectedSha,
  expectedOverlay,
  nodePath = process.execPath
}) {
  const identity = await assertBenchmarkCheckout({ sourceRoot, checkoutRoot, expectedSha, expectedOverlay });
  const dependencyLink = await ensureSharedNodeModules({
    sourceRoot: identity.sourceRoot,
    checkoutRoot: identity.checkoutRoot
  });

  const tscPath = path.join(identity.checkoutRoot, "node_modules", "typescript", "bin", "tsc");
  runChecked(nodePath, [tscPath, "-p", "tsconfig.json"], {
    cwd: identity.checkoutRoot,
    label: "benchmark checkout build",
    stdio: "inherit"
  });

  for (const relativePath of REQUIRED_BUILD_ARTIFACTS) {
    const artifactPath = path.join(identity.checkoutRoot, relativePath);
    if (!fs.existsSync(artifactPath)) throw new Error(`Benchmark build is missing required artifact: ${relativePath}`);
  }
  if (expectedOverlay) {
    await assertExactOverlayState({
      checkoutRoot: identity.checkoutRoot,
      expectedOverlay,
      statusText: readWorktreeStatus(identity.checkoutRoot)
    });
  } else {
    await assertTrackedWorktreeClean(identity.checkoutRoot);
  }

  return Object.freeze({
    ...identity,
    dependencyLink,
    buildArtifacts: REQUIRED_BUILD_ARTIFACTS
  });
}

export function startInvocation({
  checkoutRoot,
  profileRoot,
  targetRoot,
  cloudflaredPath,
  nodePath = process.execPath
}) {
  for (const [label, value] of Object.entries({ checkoutRoot, profileRoot, targetRoot, cloudflaredPath, nodePath })) {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is required.`);
  }
  const pathApi = pathApiFor(checkoutRoot);
  return Object.freeze({
    command: nodePath,
    args: Object.freeze([
      pathApi.join(checkoutRoot, "scripts", "codexgpt-entry.mjs"),
      "start",
      "--root",
      profileRoot,
      "--allow-root",
      targetRoot,
      "--no-copy-url",
      "--cloudflared",
      cloudflaredPath,
      "--no-install-cloudflared"
    ])
  });
}

function optionValue(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith("--")) return "";
  return argv[index + 1];
}

function requiredOption(argv, name) {
  const value = optionValue(argv, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function loadOverlayManifest(manifestPath) {
  if (!manifestPath) return undefined;
  const text = await fsp.readFile(manifestPath, "utf8");
  return normalizedOverlayManifest(JSON.parse(text));
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "";
  if (command === "prepare") {
    const result = await prepareBenchmarkCheckout({
      sourceRoot: requiredOption(argv, "source-root"),
      checkoutRoot: requiredOption(argv, "checkout"),
      expectedSha: requiredOption(argv, "expected-sha"),
      expectedOverlay: await loadOverlayManifest(optionValue(argv, "overlay-manifest")),
      nodePath: optionValue(argv, "node") || process.execPath
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "describe-start") {
    const result = startInvocation({
      checkoutRoot: requiredOption(argv, "checkout"),
      profileRoot: requiredOption(argv, "profile-root"),
      targetRoot: requiredOption(argv, "target-root"),
      cloudflaredPath: requiredOption(argv, "cloudflared"),
      nodePath: optionValue(argv, "node") || process.execPath
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error("Usage: chatgpt-web-benchmark-runtime.mjs prepare|describe-start [options]");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(`[benchmark-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

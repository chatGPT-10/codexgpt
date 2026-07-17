#!/usr/bin/env node
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

async function read(relativePath) {
  return await fsp.readFile(path.join(root, relativePath), "utf8");
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) failures.push(`${label} is missing required marker: ${needle}`);
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) failures.push(`${label} contains forbidden marker: ${needle}`);
}

async function requireFile(relativePath) {
  try {
    const stat = await fsp.stat(path.join(root, relativePath));
    if (!stat.isFile()) failures.push(`${relativePath} must be a file.`);
  } catch {
    failures.push(`Missing required file: ${relativePath}`);
  }
}

const requiredFiles = [
  "scripts/ci-change-classifier.mjs",
  "scripts/ci-failure-summary.mjs",
  "scripts/exact-head-ci.mjs",
  "scripts/long-task-runner.mjs",
  "scripts/run-and-summarize.mjs",
  "scripts/toolchain-manager.mjs",
  "scripts/toolchains.json",
  "scripts/test-domains.mjs",
  "scripts/windows-process-host-manifest.json",
  "scripts/windows-process-host-protocol-v1.json",
  "scripts/windows-conpty-probe-child.mjs",
  "scripts/windows-process-host.cs",
  "scripts/windows-process-host.ps1",
  "src/cliEnvironment.ts",
  "test/fixtures/filesystem-identity.js",
  "test/operational-reliability.test.mjs",
  "test/test-domain-classification.test.mjs"
];
await Promise.all(requiredFiles.map(requireFile));

const processHostManifest = JSON.parse(await read("scripts/windows-process-host-manifest.json"));
const processHostSources = [
  ["productionPowerShellSha256", "scripts/windows-process-host.ps1"],
  ["productionCSharpSha256", "scripts/windows-process-host.cs"],
  ["conPtyWorkerSha256", "scripts/windows-conpty-worker.ps1"],
  ["conPtyProbeChildSha256", "scripts/windows-conpty-probe-child.mjs"],
  ["protocolSha256", "scripts/windows-process-host-protocol-v1.json"]
];
if (
  processHostManifest.schemaVersion !== 1 || processHostManifest.protocolName !== "CXP4" ||
  processHostManifest.protocolVersion !== 1 || processHostManifest.headerLength !== 64
) failures.push("Windows process-host manifest contract must remain exact CXP4 protocol V1 with a 64-byte header.");
for (const [field, relativePath] of processHostSources) {
  const digest = createHash("sha256").update(await fsp.readFile(path.join(root, relativePath))).digest("hex");
  if (processHostManifest[field] !== digest) failures.push(`Windows process-host manifest digest drifted for ${relativePath}.`);
}

const [agents, packageText, workflow, config, fsOps, mutationTest, gitignore, toolchainText, cliEnvironment, configExample, toolchainManager, smokeCompat] = await Promise.all([
  read("AGENTS.md"),
  read("package.json"),
  read(".github/workflows/ci.yml"),
  read("src/config.ts"),
  read("src/fsOps.ts"),
  read("test/mutation-architecture.test.mjs"),
  read(".gitignore"),
  read("scripts/toolchains.json"),
  read("src/cliEnvironment.ts"),
  read("config.example.env"),
  read("scripts/toolchain-manager.mjs"),
  read("scripts/smoke-platform-compat.mjs")
]);

for (const marker of [
  "### 5.8 Operational reliability gates",
  "scripts/toolchain-manager.mjs",
  "scripts/long-task-runner.mjs",
  "scripts/exact-head-ci.mjs",
  "scripts/ci-failure-summary.mjs",
  "scripts/test-domains.mjs",
  "never create a follow-up repository commit solely to record the run ID",
  "Mutation review identity must use repository path, syscall type, and a normalized semantic AST/call digest",
  "Large single files must be read through explicit line ranges",
  "npm run policy:check"
]) requireText(agents, marker, "AGENTS.md");

const packageJson = JSON.parse(packageText);
for (const script of [
  "policy:check",
  "ci:classify",
  "ci:failure-summary",
  "ci:exact-head",
  "task:runner",
  "toolchain:status",
  "toolchain:ensure",
  "toolchain:matrix",
  "test:ordinary",
  "test:control-domain"
]) {
  if (typeof packageJson.scripts?.[script] !== "string") failures.push(`package.json is missing script ${script}.`);
}

const toolchains = JSON.parse(toolchainText);
if (toolchains.stableRoot !== "%LOCALAPPDATA%\\CodexPro\\toolchains") failures.push("Toolchain stableRoot must stay outside Temp.");
for (const [major, version] of [["20", "20.20.2"], ["24", "24.15.0"]]) {
  const entry = toolchains.toolchains?.[major];
  if (entry?.version !== version) failures.push(`Node ${major} must be pinned to ${version}.`);
  if (entry?.shasums !== "SHASUMS256.txt") failures.push(`Node ${major} must use official SHASUMS256.txt.`);
  if (entry?.archive !== `node-v${version}-win-x64.zip`) failures.push(`Node ${major} archive name is not exact.`);
}

requireText(config, "CODEXPRO_MAX_READ_BYTES, 250_000", "src/config.ts");
requireText(configExample, "CODEXPRO_MAX_READ_BYTES=250000", "config.example.env");
requireText(configExample, "Raising output limits to work around connector 502 responses is not recommended", "config.example.env");
requireText(cliEnvironment, "delete env.GH_TOKEN", "src/cliEnvironment.ts");
requireText(cliEnvironment, "delete env.GITHUB_TOKEN", "src/cliEnvironment.ts");
requireText(cliEnvironment, "GH_CONFIG_DIR", "src/cliEnvironment.ts");
requireText(toolchainManager, "npm_node_execpath: paths.node", "scripts/toolchain-manager.mjs");
requireText(toolchainManager, "npm_execpath: paths.npmCli", "scripts/toolchain-manager.mjs");
requireText(smokeCompat, "\"'x'.repeat(190000)\"", "scripts/smoke-platform-compat.mjs");
requireText(smokeCompat, "\"'x'.repeat(260000)\"", "scripts/smoke-platform-compat.mjs");
requireText(fsOps, "Math.max(config.maxReadBytes, 8 * 1024 * 1024)", "src/fsOps.ts");
requireText(fsOps, "each returned range remains capped by maxReadBytes", "src/fsOps.ts");
requireText(mutationTest, "key: `${primitive}:${callDigest(node, sourceFile)}`", "mutation architecture gate");
requireText(mutationTest, "reviewedIdentity", "mutation architecture gate");
forbidText(mutationTest, "Stale mutation allowlist entries (line/call drift)", "mutation architecture gate");
requireText(gitignore, ".ai-bridge/", ".gitignore");

for (const marker of [
  "classify:",
  "policy:",
  "needs: classify",
  "needs.classify.outputs.runtime == 'true'",
  "npm run policy:check",
  "scripts/run-and-summarize.mjs",
  "test/test-domain-classification.test.mjs",
  "actions/upload-artifact@v7.0.1"
]) requireText(workflow, marker, "CI workflow");

const activeDocs = [
  "AGENTS.md",
  "Memory.md",
  "docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md",
  "docs/superpowers/plans/2026-07-15-phase-3d-move-paths-and-acceptance.md"
];
for (const relativePath of activeDocs) {
  const text = await read(relativePath);
  forbidText(text, "%LOCALAPPDATA%\\Temp\\codexpro-node20-20.20.2", relativePath);
}

if (failures.length > 0) {
  console.error("Repository policy violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Repository operational policy: PASS");

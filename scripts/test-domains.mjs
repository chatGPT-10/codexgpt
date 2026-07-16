#!/usr/bin/env node
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTROL_DOMAIN_TESTS = Object.freeze([
  "handoff-to-agent-contract.test.mjs",
  "handoff-to-codex-contract.test.mjs",
  "phase-3d-child-crash-oracle.test.mjs",
  "phase-3d-multiprocess-lock.test.mjs",
  "wait-for-handoff-contract.test.mjs"
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const testDirectory = path.join(repositoryRoot, "test");
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

export async function classifyTestDomains() {
  const all = (await fsp.readdir(testDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => entry.name)
    .sort();
  const controlSet = new Set(CONTROL_DOMAIN_TESTS);
  const missingControl = CONTROL_DOMAIN_TESTS.filter((name) => !all.includes(name));
  if (missingControl.length > 0) {
    throw new Error(`Configured control-domain tests are missing: ${missingControl.join(", ")}`);
  }
  return {
    all,
    ordinary: all.filter((name) => !controlSet.has(name)),
    control: all.filter((name) => controlSet.has(name))
  };
}

function localControlDomainApproved() {
  return process.env.GITHUB_ACTIONS === "true" ||
    process.env.CI_CONTROL_DOMAIN === "1" ||
    process.env.CODEXPRO_ALLOW_CONTROL_DOMAIN_TESTS === "1";
}

const domains = await classifyTestDomains();
const domain = option("--domain", "ordinary");
if (!Object.hasOwn(domains, domain)) fail("--domain must be ordinary, control, or all.", 2);

if (action === "list") {
  console.log(JSON.stringify({
    schemaVersion: 1,
    domain,
    count: domains[domain].length,
    tests: domains[domain]
  }, null, 2));
} else if (action === "run") {
  if (domain === "control" && !localControlDomainApproved()) {
    fail(
      "Control-domain tests are blocked in connector-backed local execution. Run them in GitHub Actions, an independent native terminal, or set CODEXPRO_ALLOW_CONTROL_DOMAIN_TESTS=1 after proving process-domain isolation.",
      2
    );
  }
  if (domain === "all" && !localControlDomainApproved()) {
    fail(
      "The all domain contains connector-hostile control-domain tests. Use --domain ordinary locally; the complete all-domain suite remains authoritative in isolated CI.",
      2
    );
  }

  const concurrency = option("--test-concurrency", process.platform === "win32" ? "1" : undefined);
  const nodeArgs = ["--test"];
  if (concurrency) nodeArgs.push(`--test-concurrency=${concurrency}`);
  nodeArgs.push(...domains[domain].map((name) => path.posix.join("test", name)));
  console.log(JSON.stringify({
    schemaVersion: 1,
    domain,
    count: domains[domain].length,
    concurrency: concurrency ?? "runtime-default",
    authority: domain === "ordinary" ? "local-non-control-domain" : "isolated-control-domain"
  }));

  const child = spawn(process.execPath, nodeArgs, {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: "inherit"
  });
  const exitCode = await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(error.stack ?? error.message);
      resolve(127);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} else {
  fail("Usage: node scripts/test-domains.mjs <list|run> [--domain ordinary|control|all] [--test-concurrency N]", 2);
}

#!/usr/bin/env node
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOwnedTempEnvironment } from "./owned-temp-root.mjs";
import {
  prepareTestPerformanceDirectory,
  validateTestPerformanceReport,
  verifyTestPerformanceDirectory
} from "./test-performance-reporter.mjs";
import {
  buildTestExecutionShards,
  validateTestExecutionPartition,
  validateTestExecutionProfileInventory
} from "./test-execution-profiles.mjs";

export const SERIAL_PROCESS_TESTS = Object.freeze([
  "operational-reliability.test.mjs",
  "phase-7-repository-acceptance.test.mjs",
  "runner-log-bounds.test.mjs",
  "runner-process-identity.test.mjs",
  "runner-stop-identity-windows-control.test.mjs",
  "task-cleanup-lifecycle.test.mjs"
]);

export const CONTROL_DOMAIN_TESTS = Object.freeze([
  "conpty-close-order-windows-control.test.mjs",
  "git-execution-windows-control.test.mjs",
  "handoff-to-agent-contract.test.mjs",
  "handoff-to-codex-contract.test.mjs",
  "local-control-pipe-windows-control.test.mjs",
  "phase-3d-child-crash-oracle.test.mjs",
  "phase-3d-multiprocess-lock.test.mjs",
  "runner-stop-identity-windows-control.test.mjs",
  "windows-sandbox-control.test.mjs",
  "wait-for-handoff-contract.test.mjs",
  "windows-process-host-integration-windows-control.test.mjs",
  "run-command-windows-control.test.mjs",
  "process-lifecycle-windows-control.test.mjs",
  "persistent-process-production-windows-control.test.mjs",
  "process-local-control-cli.test.mjs",
  "windows-process-host-control.test.mjs",
  "task-worktree-windows-locks.test.mjs",
  "worktree-windows-control.test.mjs"
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const testDirectory = path.join(repositoryRoot, "test");
const performanceReporter = path.join(scriptDirectory, "test-performance-reporter.mjs");
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
    process.env.CODEXGPT_ALLOW_CONTROL_DOMAIN_TESTS === "1";
}

function performanceReportPath(performanceDirectory, domain, shard) {
  const nodeMajor = process.versions.node.split(".")[0];
  if (process.env.GITHUB_ACTIONS === "true") {
    return path.join(
      performanceDirectory,
      `test-performance-${domain}-${shard}-${process.platform}-node${nodeMajor}.json`
    );
  }
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return path.join(
    performanceDirectory,
    `test-performance-${domain}-${shard}-${process.platform}-node${nodeMajor}-${timestamp}-${process.pid}.json`
  );
}

async function runNodeTests(testNames, concurrency, environment, performanceState, shard) {
  if (testNames.length === 0) return 0;
  const nodeArgs = ["--test"];
  if (concurrency) nodeArgs.push(`--test-concurrency=${concurrency}`);
  let childEnvironment = environment;
  let destination = null;
  if (performanceState !== null) {
    destination = performanceReportPath(performanceState.performance.path, domain, shard);
    nodeArgs.push(
      `--test-reporter=${process.stdout.isTTY ? "spec" : "tap"}`,
      `--test-reporter=${pathToFileURL(performanceReporter).href}`,
      "--test-reporter-destination=stdout",
      `--test-reporter-destination=${destination}`
    );
    childEnvironment = {
      ...environment,
      CODEXGPT_TEST_PERFORMANCE_DOMAIN: domain,
      CODEXGPT_TEST_PERFORMANCE_SHARD: shard
    };
    console.log(JSON.stringify({
      schemaVersion: 1,
      performanceReport: path.relative(repositoryRoot, destination).split(path.sep).join("/")
    }));
  }
  nodeArgs.push(...testNames.map((name) => path.posix.join("test", name)));
  const child = spawn(process.execPath, nodeArgs, {
    cwd: repositoryRoot,
    env: childEnvironment,
    shell: false,
    windowsHide: true,
    stdio: "inherit"
  });
  let exitCode = await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(error.stack ?? error.message);
      resolve(127);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (performanceState !== null) {
    try {
      await verifyTestPerformanceDirectory(performanceState);
      await validateTestPerformanceReport(destination, {
        domain,
        shard,
        testNames,
        architecture: process.arch
      });
    } catch (error) {
      console.error(`Performance report validation failed: ${error?.message ?? "unknown"}`);
      if (exitCode === 0) exitCode = 1;
    }
  }
  return exitCode;
}

const domains = await classifyTestDomains();
validateTestExecutionProfileInventory(domains.all, {
  controlTests: CONTROL_DOMAIN_TESTS,
  serialTests: SERIAL_PROCESS_TESTS
});
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
      "Control-domain tests are blocked in connector-backed local execution. Run them in GitHub Actions, an independent native terminal, or set CODEXGPT_ALLOW_CONTROL_DOMAIN_TESTS=1 after proving process-domain isolation.",
      2
    );
  }
  if (domain === "all" && !localControlDomainApproved()) {
    fail(
      "The all domain contains connector-hostile control-domain tests. Use --domain ordinary locally; the complete all-domain suite remains authoritative in isolated CI.",
      2
    );
  }

  const requestedConcurrency = option("--test-concurrency", undefined);
  const testTopology = option(
    "--test-topology",
    process.env.CODEXGPT_TEST_TOPOLOGY ?? "layered"
  );
  const performance = argv.includes("--performance");
  const performanceState = performance ? await prepareTestPerformanceDirectory() : null;
  let shards;
  try {
    shards = buildTestExecutionShards(domains[domain], {
      platform: process.platform,
      topology: testTopology,
      requestedConcurrency,
      controlTests: CONTROL_DOMAIN_TESTS,
      serialTests: SERIAL_PROCESS_TESTS
    });
    validateTestExecutionPartition(domains[domain], shards);
  } catch (error) {
    fail(error?.message ?? "TEST_CLASSIFICATION_INVALID", 2);
  }
  console.log(JSON.stringify({
    schemaVersion: 1,
    domain,
    count: domains[domain].length,
    testTopology,
    shards: shards.map((shard) => ({
      name: shard.name,
      count: shard.tests.length,
      concurrency: shard.concurrency ?? "runtime-default"
    })),
    performance,
    authority: domain === "ordinary" ? "local-non-control-domain" : "isolated-control-domain"
  }));

  const suiteTemp = await createOwnedTempEnvironment(`tests-${domain}`);
  let exitCode = 1;
  try {
    exitCode = 0;
    for (const shard of shards) {
      if (exitCode !== 0) break;
      exitCode = await runNodeTests(
        shard.tests,
        shard.concurrency,
        suiteTemp.environment,
        performanceState,
        shard.name
      );
    }
  } finally {
    try {
      await suiteTemp.cleanup();
    } catch (error) {
      console.error(`Owned test temporary state could not be removed: ${error?.code ?? error?.message ?? "unknown"}`);
      if (exitCode === 0) exitCode = 1;
    }
  }
  process.exitCode = exitCode;
} else {
  fail("Usage: node scripts/test-domains.mjs <list|run> [--domain ordinary|control|all] [--test-concurrency N] [--test-topology layered|legacy] [--performance]", 2);
}

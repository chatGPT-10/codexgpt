#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { createBoundedCliEnvironment } from "../dist/cliEnvironment.js";

const args = process.argv.slice(2);
const command = args[0] ?? "verify";

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

function ghJson(ghArgs) {
  const result = spawnSync("gh", ghArgs, {
    cwd: process.cwd(),
    env: createBoundedCliEnvironment({ includeCi: false }),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error) fail(`Unable to run GitHub CLI: ${result.error.message}`);
  if (result.status !== 0) fail(`GitHub CLI failed: gh ${ghArgs.join(" ")}`, result.stderr.trim());
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`GitHub CLI returned invalid JSON: ${error.message}`, result.stdout.slice(0, 2000));
  }
}

function assertFullSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? "")) fail("--head must be an exact 40-character commit SHA.");
  return value.toLowerCase();
}

function findRun(head, workflow) {
  const runs = ghJson([
    "run", "list",
    "--commit", head,
    "--workflow", workflow,
    "--limit", "20",
    "--json", "databaseId,status,conclusion,headSha,url,createdAt,workflowName"
  ]);
  const exact = runs.filter((run) => String(run.headSha).toLowerCase() === head);
  if (exact.length === 0) fail(`No ${workflow} run exists for exact head ${head}.`);
  exact.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return exact[0];
}

if (command === "auth") {
  const result = spawnSync("gh", ["auth", "status"], {
    env: createBoundedCliEnvironment({ includeCi: false }),
    encoding: "utf8",
    windowsHide: true
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

if (command !== "find" && command !== "verify") {
  fail("Usage: node scripts/exact-head-ci.mjs <find|verify|auth> --head <full-sha> [--run <id>] [--workflow CI] [--output <ignored-json-path>]");
}

const head = assertFullSha(option("--head"));
const workflow = option("--workflow") ?? "CI";
const requestedRun = option("--run");
const selected = requestedRun
  ? ghJson(["run", "view", requestedRun, "--json", "databaseId,status,conclusion,headSha,url,createdAt,workflowName"])
  : findRun(head, workflow);

if (String(selected.headSha).toLowerCase() !== head) {
  fail(`Run ${selected.databaseId} belongs to ${selected.headSha}, not exact head ${head}.`);
}

let evidence = {
  schemaVersion: 1,
  headSha: head,
  runId: Number(selected.databaseId),
  workflow: selected.workflowName ?? workflow,
  status: selected.status,
  conclusion: selected.conclusion ?? null,
  url: selected.url,
  verifiedAt: new Date().toISOString(),
  repositoryWriteRequired: false
};

if (command === "verify") {
  const detail = ghJson([
    "run", "view", String(selected.databaseId),
    "--json", "databaseId,status,conclusion,headSha,url,workflowName,jobs"
  ]);
  if (detail.status !== "completed" || detail.conclusion !== "success") {
    fail(`Exact-head run ${detail.databaseId} is not successful: status=${detail.status}, conclusion=${detail.conclusion ?? "none"}.`);
  }
  const failedJobs = (detail.jobs ?? []).filter((job) => job.conclusion !== "success" && job.conclusion !== "skipped");
  if (failedJobs.length > 0) {
    fail(`Exact-head run ${detail.databaseId} contains non-success jobs: ${failedJobs.map((job) => `${job.name}=${job.conclusion}`).join(", ")}.`);
  }
  evidence = {
    ...evidence,
    status: detail.status,
    conclusion: detail.conclusion,
    jobs: (detail.jobs ?? []).map((job) => ({ name: job.name, status: job.status, conclusion: job.conclusion }))
  };
}

const output = `${JSON.stringify(evidence, null, 2)}\n`;
const outputPath = option("--output");
if (outputPath) {
  const resolved = path.resolve(outputPath);
  const allowedRoot = path.resolve(".ai-bridge");
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    fail("--output must stay under .ai-bridge so CI evidence never creates a tracked closure commit.");
  }
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.writeFile(resolved, output, "utf8");
}
process.stdout.write(output);

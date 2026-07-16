#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createBoundedCliEnvironment } from "../dist/cliEnvironment.js";

const argv = process.argv.slice(2);
function option(name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const runId = option("--run");
const maxLines = Number(option("--max-lines") ?? 220);
const contextLines = Number(option("--context") ?? 2);
if (!/^\d+$/.test(runId ?? "")) {
  console.error("Usage: npm run ci:failure-summary -- --run <run-id> [--max-lines 220] [--context 2]");
  process.exit(2);
}

const match = /(?:\bnot ok\b|AssertionError|ERR_ASSERTION|\bactual\s*:|\bexpected\s*:|\boperator\s*:|\berror\s*:|npm ERR!|ELIFECYCLE|Process completed with exit code|Caused by:|UnhandledPromiseRejection|\bSIG(?:TERM|KILL|INT)\b)/i;
const child = spawn("gh", ["run", "view", runId, "--log-failed"], {
  cwd: process.cwd(),
  env: createBoundedCliEnvironment({ includeCi: false }),
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});

const selected = [];
const selectedSet = new Set();
const recent = [];
let pendingContext = 0;
let buffer = "";
let stderr = "";
let dropped = 0;

function add(line) {
  if (selectedSet.has(line)) return;
  if (selected.length >= maxLines) {
    dropped += 1;
    return;
  }
  selectedSet.add(line);
  selected.push(line);
}

function consumeLine(line) {
  recent.push(line);
  if (recent.length > contextLines + 1) recent.shift();
  if (match.test(line)) {
    for (const prior of recent) add(prior);
    pendingContext = contextLines;
    return;
  }
  if (pendingContext > 0) {
    add(line);
    pendingContext -= 1;
  }
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) consumeLine(line);
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
  if (stderr.length > 32_000) stderr = stderr.slice(-32_000);
});

const exitCode = await new Promise((resolve) => {
  child.once("error", (error) => {
    stderr += `\n${error.stack ?? error.message}`;
    resolve(127);
  });
  child.once("close", (code) => resolve(code ?? 1));
});
if (buffer) consumeLine(buffer);

if (exitCode !== 0) {
  console.error(`gh run view ${runId} --log-failed exited ${exitCode}.`);
  console.error(stderr.trim());
  process.exit(exitCode);
}

if (selected.length === 0) {
  console.log(`Run ${runId}: no matching assertion/error lines were found in failed-step logs.`);
} else {
  console.log(`# Compact failure summary for run ${runId}`);
  console.log(selected.join("\n"));
  if (dropped > 0) console.log(`\n[${dropped} additional matching/context lines omitted by --max-lines]`);
}

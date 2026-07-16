#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
if (separator === -1 || separator === argv.length - 1) {
  console.error("Usage: node scripts/run-and-summarize.mjs --label <name> [--log-dir <dir>] -- <command> [args...]");
  process.exit(2);
}

function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const label = option("--label", "command").replace(/[^a-zA-Z0-9._-]+/g, "-");
const logDir = path.resolve(option("--log-dir", path.join(".ai-bridge", "ci-logs")));
const command = argv[separator + 1];
const args = argv.slice(separator + 2);
const maxSummaryLines = 160;
const contextRadius = 2;
const failurePattern = /(?:\bnot ok\b|AssertionError|ERR_ASSERTION|\bactual\s*:|\bexpected\s*:|\boperator\s*:|\berror\s*:|npm ERR!|ELIFECYCLE|Process completed with exit code|Caused by:|UnhandledPromiseRejection|\bSIG(?:TERM|KILL|INT)\b)/i;

function redact(text) {
  return text
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|access_token|key)=)[^&\s]+/gi, "$1[REDACTED]");
}

await fsp.mkdir(logDir, { recursive: true });
const logPath = path.join(logDir, `${label}.log`);
const summaryPath = path.join(logDir, `${label}-summary.md`);
const logStream = fs.createWriteStream(logPath, { flags: "w", encoding: "utf8" });
const recent = [];
const selected = [];
const selectedSet = new Set();
let lineBuffer = "";

function rememberLine(line) {
  recent.push(line);
  if (recent.length > contextRadius) recent.shift();
  if (!failurePattern.test(line)) return;
  for (const context of recent) {
    if (selectedSet.has(context)) continue;
    selectedSet.add(context);
    selected.push(context);
  }
  if (selected.length > maxSummaryLines) selected.splice(0, selected.length - maxSummaryLines);
}

function consume(chunk, destination) {
  const redacted = redact(chunk.toString("utf8"));
  destination.write(redacted);
  logStream.write(redacted);
  lineBuffer += redacted;
  const lines = lineBuffer.split(/\r?\n/);
  lineBuffer = lines.pop() ?? "";
  for (const line of lines) rememberLine(line);
}

function resolveLaunch(program, programArgs) {
  if (process.platform !== "win32" || (program !== "npm" && program !== "npx")) {
    return { executable: program, args: programArgs };
  }

  const cliName = program === "npm" ? "npm-cli.js" : "npx-cli.js";
  const configuredNpmCli = process.env.npm_execpath;
  const configuredCandidate = configuredNpmCli
    ? path.join(path.dirname(configuredNpmCli), cliName)
    : undefined;
  const bundledCandidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", cliName);
  const cliPath = [configuredCandidate, bundledCandidate]
    .find((candidate) => candidate && fs.existsSync(candidate));
  if (!cliPath) {
    throw new Error(`Unable to resolve ${cliName} for the active Node runtime ${process.execPath}.`);
  }
  return { executable: process.execPath, args: [cliPath, ...programArgs] };
}

let launch;
try {
  launch = resolveLaunch(command, args);
} catch (error) {
  console.error(redact(error.stack ?? error.message));
  process.exit(127);
}
const child = spawn(launch.executable, launch.args, {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  windowsHide: true,
  stdio: ["inherit", "pipe", "pipe"]
});
child.stdout.on("data", (chunk) => consume(chunk, process.stdout));
child.stderr.on("data", (chunk) => consume(chunk, process.stderr));

const result = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ code: 127, signal: null, error }));
  child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, error: null }));
});
if (lineBuffer) rememberLine(lineBuffer);
await new Promise((resolve) => logStream.end(resolve));

if (result.code !== 0) {
  const lines = selected.length > 0 ? selected : ["No matching assertion/error lines were found; inspect the bounded log artifact."];
  const summary = [
    `# ${label} failure summary`,
    "",
    `- Command: \`${redact([command, ...args].join(" "))}\``,
    `- Exit code: ${result.code}`,
    `- Signal: ${result.signal ?? "none"}`,
    `- Redacted log: \`${path.relative(process.cwd(), logPath).split(path.sep).join("/")}\``,
    "",
    "```text",
    ...lines.slice(-maxSummaryLines),
    "```",
    ""
  ].join("\n");
  await fsp.writeFile(summaryPath, summary, "utf8");
  console.error(`\n::group::${label} compact failure summary`);
  console.error(summary);
  console.error("::endgroup::");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fsp.appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
  }
}

if (result.error) console.error(redact(result.error.stack ?? result.error.message));
process.exitCode = result.code;

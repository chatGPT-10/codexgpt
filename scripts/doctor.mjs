import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);

function argumentValue(name) {
  const inline = args.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return "";
}

function canonicalRoot() {
  const input = argumentValue("root") || process.env.CODEXGPT_ROOT || process.env.CODEBASE_BRIDGE_REPO_ROOT || process.cwd();
  const resolved = path.resolve(input);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function savedProfileCheck(options = {}) {
  const quiet = Boolean(options.quiet);
  if (args.includes("--no-profile")) {
    return {
      status: "ok",
      label: "Saved profile validation",
      detail: "skipped because --no-profile is set"
    };
  }

  const root = canonicalRoot();
  const home = process.env.CODEXGPT_HOME
    ? path.resolve(process.env.CODEXGPT_HOME)
    : path.join(os.homedir(), ".codexgpt");
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(home, "profiles", `${profileId}.json`);
  if (!fs.existsSync(profilePath)) {
    return {
      status: "ok",
      label: "Saved profile validation",
      detail: "no saved profile for this workspace"
    };
  }

  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!quiet) console.error(`FAIL Saved profile      ${detail}`);
    return { status: "fail", label: "Saved profile validation", detail };
  }

  const checks = [
    ["Bash mode", profile?.bash, ["off", "safe", "full"]],
    ["Write mode", profile?.write, ["off", "handoff", "workspace"]],
    ["Tool mode", profile?.toolMode, ["minimal", "standard", "full"]],
    ["Semantic Provider", profile?.semanticProvider, ["builtin", "none"]]
  ];
  const invalid = [];
  for (const [label, value, allowed] of checks) {
    if (value === undefined || allowed.includes(value)) continue;
    const detail = `${label}: invalid saved value`;
    invalid.push(detail);
    if (!quiet) console.error(`FAIL ${String(label).padEnd(18)} invalid saved value`);
  }
  return invalid.length
    ? { status: "fail", label: "Saved profile validation", detail: invalid.join("; ") }
    : { status: "ok", label: "Saved profile validation", detail: "saved values are valid" };
}

function savedProfileUsesOAuth() {
  if (args.includes("--no-profile")) return false;
  const root = canonicalRoot();
  const home = process.env.CODEXGPT_HOME
    ? path.resolve(process.env.CODEXGPT_HOME)
    : path.join(os.homedir(), ".codexgpt");
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(home, "profiles", `${profileId}.json`);
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    return profile?.authMode === "oauth" || Boolean(profile?.oauthStateRef || profile?.oauthIssuer || profile?.oauthResource);
  } catch {
    return false;
  }
}

function savedProfileBashMode() {
  if (args.includes("--no-profile")) return "";

  const root = canonicalRoot();
  const home = process.env.CODEXGPT_HOME
    ? path.resolve(process.env.CODEXGPT_HOME)
    : path.join(os.homedir(), ".codexgpt");
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(home, "profiles", `${profileId}.json`);
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "";
    if (profile.root && profile.root !== root) return "";
    return ["off", "safe", "full"].includes(profile.bash) ? profile.bash : "";
  } catch {
    return "";
  }
}

function requestedBashMode() {
  if (args.includes("--no-bash")) return "off";
  return argumentValue("bash") || process.env.CODEXGPT_BASH_MODE || savedProfileBashMode() || "safe";
}

function commandPath(command) {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;
  if (process.platform === "win32") {
    const located = spawnSync("where", [command], { encoding: "utf8", windowsHide: true });
    if (located.status === 0) {
      return String(located.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? command;
    }
    const direct = spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true });
    return direct.status === 0 ? command : "";
  }
  const result = spawnSync("/bin/sh", ["-c", "command -v \"$1\"", "codexgpt-doctor", command], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return String(result.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function shellCheck() {
  const mode = requestedBashMode();
  if (mode === "off") {
    return {
      status: "ok",
      label: "Bash executable",
      detail: "not required because Bash mode is off"
    };
  }

  const command = process.env.CODEXGPT_DOCTOR_BASH_COMMAND || "bash";
  const executable = commandPath(command);
  if (executable) {
    return { status: "ok", label: "Bash executable", detail: executable };
  }

  const detail = process.platform === "win32"
    ? "Bash was not found. Install Git Bash, or run with --no-bash until the native PowerShell backend is available."
    : "Bash was not found. Install Bash, or run with --no-bash.";
  return { status: "fail", label: "Bash executable", detail };
}

function printCheck(check) {
  const line = `${check.status === "ok" ? "OK  " : check.status === "warn" ? "WARN" : "FAIL"} ${check.label.padEnd(18)} ${check.detail}`;
  if (check.status === "fail") console.error(line);
  else console.log(line);
}

function appendWrapperChecks(report, wrapperChecks) {
  report.checks.push(...wrapperChecks);
  report.summary = {
    failures: report.checks.filter((check) => check.status === "fail").length,
    warnings: report.checks.filter((check) => check.status === "warn").length
  };
  report.ok = report.summary.failures === 0;
  return report;
}

const jsonOutput = args.includes("--json");
const shellResult = shellCheck();
if (!jsonOutput) printCheck(shellResult);
if (args.includes("--shell-check-only")) {
  process.exitCode = shellResult.status === "ok" ? 0 : 1;
} else {
  const profileResult = savedProfileCheck({ quiet: jsonOutput });
  const forwarded = args.filter((value) => value !== "--shell-check-only");
  const result = spawnSync(process.execPath, [path.join(scriptDir, "codexgpt.mjs"), "doctor", ...forwarded], {
    cwd: process.cwd(),
    env: process.env,
    ...(jsonOutput ? { encoding: "utf8" } : { stdio: "inherit" }),
    windowsHide: true
  });
  if (result.error) throw result.error;
  let oauthStatus = 0;
  let oauthResult;
  if (savedProfileUsesOAuth()) {
    oauthResult = spawnSync(process.execPath, [path.join(scriptDir, "oauth-admin.mjs"), "doctor", "--root", canonicalRoot()], {
      cwd: projectRoot,
      env: { ...process.env, CODEXGPT_ROOT: canonicalRoot() },
      ...(jsonOutput ? { encoding: "utf8" } : { stdio: "inherit" }),
      windowsHide: true
    });
    if (oauthResult.error) throw oauthResult.error;
    oauthStatus = oauthResult.status ?? 1;
  }
  if (jsonOutput) {
    if (result.stderr) process.stderr.write(result.stderr);
    let report;
    try {
      report = JSON.parse(result.stdout || "");
    } catch {
      throw new Error("Internal doctor did not return valid JSON.");
    }
    const wrapperChecks = [shellResult, profileResult];
    if (oauthResult) {
      wrapperChecks.push({
        status: oauthStatus === 0 ? "ok" : "fail",
        label: "OAuth diagnostics",
        detail: oauthStatus === 0 ? "OAuth diagnostics passed" : "OAuth diagnostics reported blockers"
      });
      if (oauthResult.stderr) process.stderr.write(oauthResult.stderr);
    }
    appendWrapperChecks(report, wrapperChecks);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  process.exitCode = result.status === 0 && oauthStatus === 0 && shellResult.status === "ok" && profileResult.status === "ok"
    ? 0
    : result.status || oauthStatus || 1;
}

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
  const input = argumentValue("root") || process.env.CODEXGPT_ROOT || process.cwd();
  const resolved = path.resolve(input);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function savedProfileCheck() {
  if (args.includes("--no-profile")) return true;

  const root = canonicalRoot();
  const home = process.env.CODEXGPT_HOME
    ? path.resolve(process.env.CODEXGPT_HOME)
    : path.join(os.homedir(), ".codexgpt");
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(home, "profiles", `${profileId}.json`);
  if (!fs.existsSync(profilePath)) return true;

  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } catch (error) {
    console.error(`FAIL Saved profile      ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  const checks = [
    ["Bash mode", profile?.bash, ["off", "safe", "full"]],
    ["Write mode", profile?.write, ["off", "handoff", "workspace"]],
    ["Tool mode", profile?.toolMode, ["minimal", "standard", "full"]]
  ];
  let valid = true;
  for (const [label, value, allowed] of checks) {
    if (value === undefined || allowed.includes(value)) continue;
    console.error(`FAIL ${String(label).padEnd(18)} invalid saved value: ${value}`);
    valid = false;
  }
  return valid;
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
    console.log("OK   Bash executable    not required because Bash mode is off");
    return true;
  }

  const command = process.env.CODEXGPT_DOCTOR_BASH_COMMAND || "bash";
  const executable = commandPath(command);
  if (executable) {
    console.log(`OK   Bash executable    ${executable}`);
    return true;
  }

  const detail = process.platform === "win32"
    ? "Bash was not found. Install Git Bash, or run with --no-bash until the native PowerShell backend is available."
    : "Bash was not found. Install Bash, or run with --no-bash.";
  console.error(`FAIL Bash executable    ${detail}`);
  return false;
}

const shellAvailable = shellCheck();
if (args.includes("--shell-check-only")) {
  process.exitCode = shellAvailable ? 0 : 1;
} else {
  const profileValid = savedProfileCheck();
  const forwarded = args.filter((value) => value !== "--shell-check-only");
  const result = spawnSync(process.execPath, [path.join(scriptDir, "codexgpt.mjs"), "doctor", ...forwarded], {
    cwd: projectRoot,
    env: { ...process.env, CODEXGPT_ROOT: canonicalRoot() },
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exitCode = result.status === 0 && shellAvailable && profileValid ? 0 : result.status || 1;
}

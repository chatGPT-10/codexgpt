#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function canonicalInvocationPath(input, platform = process.platform) {
  const resolved = path.resolve(input);
  let canonical = resolved;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {}
  return platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function isMainInvocation(metaUrl, argvPath = process.argv[1], platform = process.platform) {
  if (!argvPath) return false;
  return canonicalInvocationPath(fileURLToPath(metaUrl), platform) === canonicalInvocationPath(argvPath, platform);
}

function optionValue(argv, name) {
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  return "";
}

function expandHome(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function canonicalRoot(argv, env = process.env) {
  const input = optionValue(argv, "root") || env.CODEXGPT_ROOT || env.CODEBASE_BRIDGE_REPO_ROOT || process.cwd();
  const resolved = path.resolve(expandHome(input));
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function CodexGPTHome(env = process.env) {
  const configured = env.CODEXGPT_HOME?.trim();
  return configured ? path.resolve(expandHome(configured)) : path.join(os.homedir(), ".codexgpt");
}

function savedProfileHostname(argv, env = process.env) {
  const explicit =
    optionValue(argv, "hostname") ||
    optionValue(argv, "url") ||
    env.CODEXGPT_PUBLIC_HOSTNAME ||
    env.CODEXGPT_HOSTNAME ||
    env.NGROK_DOMAIN ||
    "";
  if (explicit || argv.includes("--no-profile")) return explicit;

  const root = canonicalRoot(argv, env);
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(CodexGPTHome(env), "profiles", `${profileId}.json`);
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    return typeof profile?.hostname === "string" ? profile.hostname.trim() : "";
  } catch {
    return "";
  }
}

export function launchEnvironment(argv, env = process.env) {
  const cliHostname = optionValue(argv, "hostname") || optionValue(argv, "url");
  if (
    !cliHostname &&
    !env.CODEXGPT_PUBLIC_HOSTNAME &&
    (env.CODEXGPT_HOSTNAME || env.NGROK_DOMAIN)
  ) {
    return env;
  }
  const publicHostname = savedProfileHostname(argv, env);
  return publicHostname
    ? { ...env, CODEXGPT_PUBLIC_HOSTNAME: publicHostname }
    : env;
}

function boolFromValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function savedProfileAuthMode(argv, env = process.env) {
  const explicit = env.CODEXGPT_AUTH_MODE?.trim();
  if (explicit || argv.includes("--no-profile")) return explicit || "";
  const root = canonicalRoot(argv, env);
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(CodexGPTHome(env), "profiles", `${profileId}.json`);
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "";
    if (profile.root && profile.root !== root) return "";
    return typeof profile.authMode === "string" ? profile.authMode.trim() : "";
  } catch {
    return "";
  }
}

export function connectorAuthOutputEnvironment(argv, env = process.env) {
  const subcommand = argv[0] && !argv[0].startsWith("-") ? argv[0] : "start";
  const connectorCommands = new Set(["start", "stable", "connection-test", "ngrok", "tailscale"]);
  if (!connectorCommands.has(subcommand) || argv.includes("--no-auth")) return env;
  if (savedProfileAuthMode(argv, env) === "oauth") {
    return { ...env, CODEXGPT_ALLOW_QUERY_TOKEN: "0" };
  }

  if (!("CODEXGPT_ALLOW_QUERY_TOKEN" in env)) {
    return {
      ...env,
      CODEXGPT_ALLOW_QUERY_TOKEN: "1"
    };
  }

  if (boolFromValue(env.CODEXGPT_ALLOW_QUERY_TOKEN, false)) return env;

  const shimPath = path.join(scriptDir, "connector-auth-output-shim.cjs").replaceAll("\\", "/");
  const requireOption = `--require "${shimPath.replaceAll('"', '\\"')}"`;
  const previousNodeOptions = env.NODE_OPTIONS ?? "";
  return {
    ...env,
    NODE_OPTIONS: [previousNodeOptions, requireOption].filter(Boolean).join(" "),
    CODEXGPT_CONNECTOR_AUTH_PREVIOUS_NODE_OPTIONS: previousNodeOptions,
    CODEXGPT_CONNECTOR_AUTH_OUTPUT_SHIM: "1"
  };
}

function savedProfileTunnel(argv, env = process.env) {
  if (argv.includes("--no-profile")) return "";

  const root = canonicalRoot(argv, env);
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(CodexGPTHome(env), "profiles", `${profileId}.json`);
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "";
    if (profile.root && profile.root !== root) return "";
    return typeof profile.tunnel === "string" ? profile.tunnel.trim() : "";
  } catch {
    return "";
  }
}

export function requiresVerifiedCloudflared(argv, env = process.env) {
  if (argv.includes("--version") || argv.includes("-v") || argv.includes("--help")) return false;
  if (argv.includes("--no-install-cloudflared") || optionValue(argv, "cloudflared")) return false;

  const subcommand = argv[0] && !argv[0].startsWith("-") ? argv[0] : "start";
  if (subcommand === "stable") return true;
  if (subcommand !== "start" && subcommand !== "connection-test") return false;

  const effectiveTunnel =
    optionValue(argv, "tunnel") ||
    env.CODEXGPT_TUNNEL?.trim() ||
    savedProfileTunnel(argv, env) ||
    "cloudflare";
  return effectiveTunnel === "cloudflare" || effectiveTunnel === "cloudflare-named";
}

export function verifiedCloudflaredPath(env = process.env, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const configuredHome = env.CODEXGPT_HOME?.trim();
  const home = configuredHome
    ? pathApi.resolve(configuredHome)
    : pathApi.join(os.homedir(), ".codexgpt");
  const binary = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return pathApi.join(home, "bin", binary);
}

export function withVerifiedCloudflaredArgs(argv, env = process.env, platform = process.platform) {
  return [
    ...argv,
    "--cloudflared",
    verifiedCloudflaredPath(env, platform),
    "--no-install-cloudflared"
  ];
}

function runNodeScript(scriptName, args, env = process.env) {
  return spawnSync(process.execPath, [path.join(scriptDir, scriptName), ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true
  });
}

function exitFrom(result) {
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const subcommand = argv[0] && !argv[0].startsWith("-") ? argv[0] : "start";

  if (subcommand === "install-cloudflared" || argv.includes("--install-cloudflared")) {
    exitFrom(runNodeScript("cloudflared-installer.mjs", ["install"]));
    return;
  }

  if (subcommand === "auth") {
    exitFrom(runNodeScript("oauth-admin.mjs", argv.slice(1)));
    return;
  }

  if (subcommand === "control") {
    const host = path.join(process.cwd(), "dist", "controlHost.js");
    if (!fs.existsSync(host)) throw new Error(`Missing ${host}. Run npm run build first.`);
    const result = spawnSync(process.execPath, [host, ...argv.slice(1)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true
    });
    exitFrom(result);
    return;
  }

  if (subcommand === "doctor") {
    const doctorArgs = argv.slice(1);
    const plannedStartArgs = ["start", ...doctorArgs];
    const doctorEnv = connectorAuthOutputEnvironment(
      plannedStartArgs,
      launchEnvironment(plannedStartArgs)
    );
    exitFrom(runNodeScript("doctor.mjs", doctorArgs, doctorEnv));
    return;
  }

  let forwarded = [...argv];
  if (requiresVerifiedCloudflared(argv)) {
    const ensured = runNodeScript("cloudflared-installer.mjs", ["ensure"]);
    if (ensured.error || ensured.status !== 0) {
      exitFrom(ensured);
      return;
    }
    forwarded = withVerifiedCloudflaredArgs(forwarded);
  }

  const launchEnv = launchEnvironment(forwarded);
  exitFrom(runNodeScript("codexgpt.mjs", forwarded, connectorAuthOutputEnvironment(forwarded, launchEnv)));
}

if (isMainInvocation(import.meta.url)) {
  main().catch((error) => {
    console.error(`[codexgpt] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { LocalAdminSessionManager } from "./auth/localAdminSession.js";
import { createLifecycleStatusSource } from "./control/lifecycleStatus.js";
import { createRuntimeChildManager } from "./control/runtimeChildManager.js";
import { createRuntimeOwnershipSupervisor } from "./control/runtimeOwnership.js";
import { createWorkspaceControlSettings } from "./control/workspaceControlSettings.js";
import { createLifecycleControlApp } from "./http/lifecycleControlApp.js";
import { readWorkspaceProfile } from "./profileStore.js";

const DEFAULT_PORT = 8791;
const execFileAsync = promisify(execFile);

function optionValue(argv: readonly string[], name: string): string {
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "";
}

function workspaceRoot(argv: readonly string[]): string {
  const input = optionValue(argv, "root") || process.cwd();
  const resolved = path.resolve(input);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error("CONTROL_WORKSPACE_INVALID");
  return fs.realpathSync.native(resolved);
}

function controlPort(argv: readonly string[]): number {
  const raw = optionValue(argv, "port") || String(DEFAULT_PORT);
  if (!/^\d+$/.test(raw)) throw new Error("CONTROL_PORT_INVALID");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("CONTROL_PORT_INVALID");
  return port;
}

async function windowsProcessCreationTime(pid: number): Promise<string | null> {
  if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0) return null;
  const systemRoot = path.join(path.parse(process.execPath).root, "Windows");
  const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const command = `$p=Get-Process -Id ${pid} -ErrorAction Stop;[Console]::Out.Write($p.StartTime.ToUniversalTime().ToString('O'))`;
  try {
    const result = await execFileAsync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 8_192
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function waitForRuntimeHealth(root: string): Promise<boolean> {
  const profile = readWorkspaceProfile(root);
  const port = /^\d+$/.test(String(profile.port ?? "")) ? Number(profile.port) : 8787;
  const hostHeader = typeof profile.hostname === "string" && profile.hostname ? profile.hostname : `127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const healthy = await new Promise<boolean>((resolve) => {
      const request = http.get({ host: "127.0.0.1", port, path: "/healthz", headers: { Host: hostHeader }, timeout: 1_000 }, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.once("timeout", () => request.destroy());
      request.once("error", () => resolve(false));
    });
    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function terminateOwnedRuntimeTree(pid: number): Promise<boolean> {
  if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0) return false;
  const taskkill = path.join(path.parse(process.execPath).root, "Windows", "System32", "taskkill.exe");
  try {
    await execFileAsync(taskkill, ["/PID", String(pid), "/T", "/F"], { timeout: 10_000, windowsHide: true, maxBuffer: 8_192 });
  } catch {
    return false;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!await windowsProcessCreationTime(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv[0] === "help") {
    console.log("Usage: codexgpt control --root <workspace> [--port 8791]");
    return;
  }
  const root = workspaceRoot(argv);
  const port = controlPort(argv);
  const origin = `http://127.0.0.1:${port}`;
  const sessions = new LocalAdminSessionManager();
  const ownership = createRuntimeOwnershipSupervisor({ workspaceRoot: root, processCreationTime: windowsProcessCreationTime });
  const workspaceSettings = createWorkspaceControlSettings(root);
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runtimeStart = createRuntimeChildManager({
    ownership,
    launch: () => {
      const settings = workspaceSettings.snapshot();
      const args = [path.join(projectRoot, "scripts", "codexgpt-entry.mjs"), "start", "--root", root];
      for (const allowedRoot of settings.allowedRoots.slice(1)) args.push("--allow-root", allowedRoot);
      return spawn(process.execPath, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CODEXGPT_TOOL_MODE: settings.effectiveToolMode,
        CODEXGPT_WRITE_MODE: settings.effectiveWriteMode,
        CODEXGPT_BASH_MODE: settings.effectiveBashMode,
        CODEXGPT_EXECUTION_PROFILE: settings.executionProfile
      },
      stdio: "ignore",
      windowsHide: true
      });
    },
    processCreationTime: windowsProcessCreationTime,
    waitForReady: () => waitForRuntimeHealth(root),
    terminate: terminateOwnedRuntimeTree
  });
  const app = createLifecycleControlApp({
    sessions,
    origin,
    statusSource: createLifecycleStatusSource(root, ownership),
    runtimeControl: runtimeStart,
    workspaceSettings
  });
  const server = app.listen(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  const bootstrap = sessions.issueBootstrap({ origin });
  console.error(`[CodexGPT] Independent local Control Plane on ${origin}`);
  console.error(`[CodexGPT] Open ${bootstrap.url}`);
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    void runtimeStart.stop().catch(() => {}).finally(() => {
      server.close(() => process.exit(0));
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error) => {
  console.error(`[codexgpt-control] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function windowsProcessCreationTime(pid) {
  const systemRoot = process.env.SystemRoot?.trim() || process.env.WINDIR?.trim();
  if (!systemRoot) return undefined;
  const powershell = path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "$ErrorActionPreference='Stop'",
    `$p=Get-Process -Id ${pid}`,
    "$p.StartTime.ToUniversalTime().ToString('O')"
  ].join(";");
  const result = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000
  });
  if (result.status !== 0) return undefined;
  const value = String(result.stdout ?? "").trim();
  return value || undefined;
}

function linuxProcessCreationTime(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const closing = stat.lastIndexOf(")");
    if (closing < 0) return undefined;
    const fields = stat.slice(closing + 2).trim().split(/\s+/u);
    const startTicks = fields[19];
    return startTicks ? `linux:${startTicks}` : undefined;
  } catch {
    return undefined;
  }
}

function unixProcessCreationTime(pid) {
  const ps = fs.existsSync("/bin/ps") ? "/bin/ps" : "/usr/bin/ps";
  const result = spawnSync(ps, ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    timeout: 5_000
  });
  if (result.status !== 0) return undefined;
  const value = String(result.stdout ?? "").trim();
  return value ? `ps:${value}` : undefined;
}

export function processCreationTimeSync(pid) {
  if (!processIsAlive(pid)) return undefined;
  if (process.platform === "win32") return windowsProcessCreationTime(pid);
  if (process.platform === "linux") return linuxProcessCreationTime(pid);
  return unixProcessCreationTime(pid);
}

export async function processCreationTime(pid) {
  return processCreationTimeSync(pid);
}

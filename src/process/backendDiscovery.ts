import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { processHostError } from "./windowsHostProtocol.js";
import type { ReviewedExplicitBackendV1, WindowsBackendKindV1, WindowsBackendSourceV1, WindowsExecutableBindingV1 } from "./types.js";

interface Candidate {
  path: string;
  sha256?: string;
  kind: WindowsBackendKindV1;
  backendId: string;
  backendVersion: string;
  source: WindowsBackendSourceV1;
  required: boolean;
}

export interface DiscoverWindowsBackendsOptions {
  platform?: NodeJS.Platform;
  systemRoot?: string;
  programFiles?: string;
  localAppData?: string;
  explicit?: readonly ReviewedExplicitBackendV1[];
}

async function bindCandidate(candidate: Candidate): Promise<WindowsExecutableBindingV1 | null> {
  let handle: Awaited<ReturnType<typeof fsp.open>>;
  try {
    handle = await fsp.open(candidate.path, "r");
  } catch (error) {
    if (!candidate.required && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw processHostError("BACKEND_UNAVAILABLE");
  }
  try {
    const [stat, content, realPath] = await Promise.all([handle.stat({ bigint: true }), handle.readFile(), fsp.realpath(candidate.path)]);
    if (!stat.isFile()) throw processHostError("BACKEND_UNAVAILABLE");
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (candidate.sha256 && sha256 !== candidate.sha256.toLowerCase()) throw processHostError("BACKEND_STALE");
    return Object.freeze({
      schemaVersion: 1,
      backendId: candidate.backendId,
      backendVersion: candidate.backendVersion,
      kind: candidate.kind,
      source: candidate.source,
      path: realPath,
      realPath,
      sha256,
      identity: `sha256:${sha256}:dev:${stat.dev.toString()}:ino:${stat.ino.toString()}`
    });
  } finally {
    await handle.close();
  }
}

function fixedCandidates(options: DiscoverWindowsBackendsOptions): Candidate[] {
  const systemDrive = path.parse(process.execPath).root.replace(/[\\/]$/, "");
  const systemRoot = path.resolve(options.systemRoot ?? path.join(`${systemDrive}\\`, "Windows"));
  const programFiles = path.resolve(options.programFiles ?? path.join(`${systemDrive}\\`, "Program Files"));
  const localAppData = path.resolve(options.localAppData ?? path.join(os.homedir(), "AppData", "Local"));
  const explicit = (options.explicit ?? []).map((entry): Candidate => ({
    path: path.resolve(entry.path),
    sha256: entry.sha256,
    kind: entry.kind,
    backendId: entry.backendId,
    backendVersion: entry.backendVersion ?? "reviewed",
    source: "reviewed_explicit",
    required: true
  }));
  return [
    ...explicit,
    { path: path.join(programFiles, "PowerShell", "7", "pwsh.exe"), kind: "powershell", backendId: "powershell-core", backendVersion: "7", source: "powershell_core_verified_location", required: false },
    { path: path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), kind: "powershell", backendId: "windows-powershell", backendVersion: "5.1", source: "windows_builtin", required: false },
    { path: path.join(programFiles, "Git", "bin", "bash.exe"), kind: "bash", backendId: "git-bash", backendVersion: "verified-location", source: "git_bash_verified_location", required: false },
    { path: path.join(localAppData, "Programs", "Git", "bin", "bash.exe"), kind: "bash", backendId: "git-bash-user", backendVersion: "verified-location", source: "git_bash_verified_location", required: false }
  ];
}

export async function discoverWindowsBackends(options: DiscoverWindowsBackendsOptions = {}): Promise<readonly WindowsExecutableBindingV1[]> {
  if ((options.platform ?? process.platform) !== "win32") throw processHostError("BACKEND_UNAVAILABLE");
  const results: WindowsExecutableBindingV1[] = [];
  const seen = new Set<string>();
  for (const candidate of fixedCandidates(options)) {
    const key = candidate.path.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    const binding = await bindCandidate(candidate);
    if (binding) results.push(binding);
  }
  return Object.freeze(results);
}

export function selectWindowsBackend(
  backends: readonly WindowsExecutableBindingV1[],
  kind: WindowsBackendKindV1,
  edition: "auto" | "core" | "windows" = "auto"
): WindowsExecutableBindingV1 {
  const selected = backends.find((backend) => backend.kind === kind && (
    kind !== "powershell" || edition === "auto" || (edition === "core" ? backend.backendId === "powershell-core" : backend.source === "windows_builtin")
  ));
  if (!selected) throw processHostError("BACKEND_UNAVAILABLE");
  return selected;
}

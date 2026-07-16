import path from "node:path";

export interface BoundedCliEnvironmentOptions {
  inheritEnv?: boolean;
  includeCi?: boolean;
  hostEnv?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

const WINDOWS_PASSTHROUGH_KEYS = [
  "ALLUSERSPROFILE",
  "ComSpec",
  "HOMEDRIVE",
  "HOMEPATH",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "windir"
] as const;

function copyDefined(target: NodeJS.ProcessEnv, source: NodeJS.ProcessEnv, keys: readonly string[]): void {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== "") target[key] = value;
  }
}

export function createBoundedCliEnvironment(
  options: BoundedCliEnvironmentOptions = {}
): NodeJS.ProcessEnv {
  const hostEnv = options.hostEnv ?? process.env;
  const platform = options.platform ?? process.platform;
  const includeCi = options.includeCi ?? true;

  if (options.inheritEnv) {
    const inherited: NodeJS.ProcessEnv = { ...hostEnv, NO_COLOR: "1" };
    if (includeCi) inherited.CI = hostEnv.CI ?? "1";
    else delete inherited.CI;
    return inherited;
  }

  const env: NodeJS.ProcessEnv = {
    PATH: hostEnv.PATH ?? (platform === "win32" ? "" : "/usr/local/bin:/usr/bin:/bin"),
    HOME: hostEnv.HOME ?? hostEnv.USERPROFILE ?? "",
    USER: hostEnv.USER ?? "",
    SHELL: hostEnv.SHELL ?? (platform === "win32" ? "" : "/bin/bash"),
    TMPDIR: hostEnv.TMPDIR ?? (platform === "win32" ? hostEnv.TEMP ?? hostEnv.TMP ?? "" : "/tmp"),
    TERM: "dumb",
    NO_COLOR: "1"
  };
  if (includeCi) env.CI = "1";

  if (platform === "win32") {
    copyDefined(env, hostEnv, WINDOWS_PASSTHROUGH_KEYS);
    const userProfile = hostEnv.USERPROFILE?.trim() ? hostEnv.USERPROFILE : undefined;
    const appData = hostEnv.APPDATA?.trim()
      ? hostEnv.APPDATA
      : userProfile
        ? path.win32.join(userProfile, "AppData", "Roaming")
        : undefined;
    const localAppData = hostEnv.LOCALAPPDATA?.trim()
      ? hostEnv.LOCALAPPDATA
      : userProfile
        ? path.win32.join(userProfile, "AppData", "Local")
        : undefined;

    if (userProfile) env.USERPROFILE = userProfile;
    if (appData) {
      env.APPDATA = appData;
      env.GH_CONFIG_DIR = hostEnv.GH_CONFIG_DIR?.trim()
        ? hostEnv.GH_CONFIG_DIR
        : path.win32.join(appData, "GitHub CLI");
    } else if (hostEnv.GH_CONFIG_DIR?.trim()) {
      env.GH_CONFIG_DIR = hostEnv.GH_CONFIG_DIR;
    }
    if (localAppData) env.LOCALAPPDATA = localAppData;
  }

  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

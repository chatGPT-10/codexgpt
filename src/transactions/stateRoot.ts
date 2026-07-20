import os from "node:os";
import path from "node:path";
import { TransactionError } from "./types.js";

export interface TransactionStateRootOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

function pathApiFor(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

function expandHomeWith(
  homeDir: string,
  value: string,
  platform: NodeJS.Platform
): string {
  const api = pathApiFor(platform);
  if (value === "~") return homeDir;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return api.join(homeDir, value.slice(2));
  }
  return value;
}

export function resolveTransactionStateRoot(
  options: TransactionStateRootOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const api = pathApiFor(platform);
  const explicit = env.CODEXGPT_HOME?.trim();
  if (explicit) {
    return api.resolve(expandHomeWith(homeDir, explicit, platform), "state", "v1");
  }
  if (platform === "win32") {
    const local = env.LOCALAPPDATA?.trim();
    if (!local) {
      throw new TransactionError(
        "TRANSACTION_PRECONDITION_FAILED",
        "Windows transaction state requires LOCALAPPDATA or CODEXGPT_HOME."
      );
    }
    return api.resolve(local, "CodexGPT", "state", "v1");
  }
  const base = env.XDG_STATE_HOME?.trim() || api.join(homeDir, ".local", "state");
  return api.resolve(base, "codexgpt", "v1");
}

export interface TransactionStateDirectories {
  root: string;
  installationFile: string;
  instances: string;
  locks: string;
  workspaceLocks: string;
  auditLocks: string;
  transactions: string;
  changesets: string;
  audit: string;
}

export function transactionStateDirectories(stateRoot: string): TransactionStateDirectories {
  const root = path.resolve(stateRoot);
  const locks = path.join(root, "locks");
  return {
    root,
    installationFile: path.join(root, "installation.json"),
    instances: path.join(root, "instances"),
    locks,
    workspaceLocks: path.join(locks, "workspaces"),
    auditLocks: path.join(locks, "audit"),
    transactions: path.join(root, "transactions"),
    changesets: path.join(root, "changesets"),
    audit: path.join(root, "audit")
  };
}

export function transactionWorkspaceStateDirectory(
  stateRoot: string,
  category: "transactions" | "changesets",
  workspaceStateKey: string
): string {
  if (!/^wsk_[a-f0-9]{32}$/.test(workspaceStateKey)) {
    throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Workspace state key is invalid.");
  }
  return path.join(path.resolve(stateRoot), category, workspaceStateKey);
}

export function normalizeCanonicalWorkspaceRoot(
  canonicalRoot: string,
  platform: NodeJS.Platform = process.platform
): string {
  const api = pathApiFor(platform);
  let normalized = api.normalize(canonicalRoot).replace(/\\/g, "/").normalize("NFC");
  while (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

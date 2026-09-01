import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CodexGPTHome, profileIdForRoot } from "../profileStore.js";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";

export type BrowserPermissionMode = "read_only" | "edit" | "run_safe";

const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceRoot: z.string().min(1).max(32768),
  additionalRoots: z.array(z.string().min(1).max(32768)).max(12),
  permissionMode: z.enum(["read_only", "edit", "run_safe"])
}).strict();

export interface WorkspaceControlSettingsSnapshot {
  readonly workspaceRoot: string;
  readonly allowedRoots: readonly string[];
  readonly permissionMode: BrowserPermissionMode;
  readonly effectiveToolMode: "minimal" | "standard" | "full";
  readonly effectiveWriteMode: "off" | "workspace";
  readonly effectiveBashMode: "off" | "safe";
  readonly executionProfile: "off";
}

export interface WorkspaceControlSettings {
  snapshot(): WorkspaceControlSettingsSnapshot;
  previewRoot(input: string): { root: string; alreadyAllowed: boolean; confirmation: string };
  addRoot(input: string, confirmation: string): WorkspaceControlSettingsSnapshot;
  removeRoot(root: string): WorkspaceControlSettingsSnapshot;
  setPermissionMode(mode: BrowserPermissionMode): WorkspaceControlSettingsSnapshot;
}

function settingsError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function pathKey(value: string): string {
  return process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
}

function canonicalDirectory(input: string): string {
  if (typeof input !== "string" || !input.trim() || input.length > 32767) throw settingsError("CONTROL_WORKSPACE_PATH_INVALID");
  const value = input.trim();
  if (/^(?:\\\\|\/\/|\\\\[?.]\\)/.test(value) || /[\x00-\x1f]/.test(value) || /[. ]$/.test(value)) {
    throw settingsError("CONTROL_WORKSPACE_PATH_INVALID");
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw settingsError("CONTROL_WORKSPACE_ROOT_TOO_BROAD");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw settingsError("CONTROL_WORKSPACE_PATH_INVALID");
  }
  if (!stat.isDirectory()) throw settingsError("CONTROL_WORKSPACE_PATH_INVALID");
  return fs.realpathSync.native(resolved);
}

function effective(mode: BrowserPermissionMode): Omit<WorkspaceControlSettingsSnapshot, "workspaceRoot" | "allowedRoots" | "permissionMode"> {
  if (mode === "read_only") return { effectiveToolMode: "minimal", effectiveWriteMode: "off", effectiveBashMode: "off", executionProfile: "off" };
  if (mode === "edit") return { effectiveToolMode: "standard", effectiveWriteMode: "workspace", effectiveBashMode: "off", executionProfile: "off" };
  return { effectiveToolMode: "full", effectiveWriteMode: "workspace", effectiveBashMode: "safe", executionProfile: "off" };
}

export function createWorkspaceControlSettings(root: string, stateRoot = path.join(CodexGPTHome(), "control-plane", "v1")): WorkspaceControlSettings {
  const workspaceRoot = canonicalDirectory(root);
  const store = new AtomicJsonFileStore(stateRoot, SettingsSchema);
  const filePath = path.join(path.resolve(stateRoot), "settings", `${profileIdForRoot(workspaceRoot)}.json`);
  const read = () => {
    if (!fs.existsSync(filePath)) return { schemaVersion: 1 as const, workspaceRoot, additionalRoots: [], permissionMode: "read_only" as const };
    const value = store.read(filePath);
    if (pathKey(value.workspaceRoot) !== pathKey(workspaceRoot)) throw settingsError("CONTROL_WORKSPACE_SETTINGS_INVALID");
    return value;
  };
  const project = (value: z.infer<typeof SettingsSchema>): WorkspaceControlSettingsSnapshot => ({
    workspaceRoot,
    allowedRoots: [workspaceRoot, ...value.additionalRoots],
    permissionMode: value.permissionMode,
    ...effective(value.permissionMode)
  });
  const write = (value: z.infer<typeof SettingsSchema>): WorkspaceControlSettingsSnapshot => {
    store.write(filePath, value);
    return project(value);
  };
  return Object.freeze({
    snapshot: () => project(read()),
    previewRoot: (input: string) => {
      const rootCandidate = canonicalDirectory(input);
      return { root: rootCandidate, alreadyAllowed: project(read()).allowedRoots.some((item) => pathKey(item) === pathKey(rootCandidate)), confirmation: rootCandidate };
    },
    addRoot: (input: string, confirmation: string) => {
      const rootCandidate = canonicalDirectory(input);
      if (confirmation !== rootCandidate) throw settingsError("CONTROL_WORKSPACE_CONFIRMATION_REQUIRED");
      const current = read();
      if (pathKey(rootCandidate) === pathKey(workspaceRoot) || current.additionalRoots.some((item) => pathKey(item) === pathKey(rootCandidate))) return project(current);
      return write({ ...current, additionalRoots: [...current.additionalRoots, rootCandidate] });
    },
    removeRoot: (input: string) => {
      const rootCandidate = canonicalDirectory(input);
      if (pathKey(rootCandidate) === pathKey(workspaceRoot)) throw settingsError("CONTROL_WORKSPACE_ROOT_REQUIRED");
      const current = read();
      return write({ ...current, additionalRoots: current.additionalRoots.filter((item) => pathKey(item) !== pathKey(rootCandidate)) });
    },
    setPermissionMode: (permissionMode: BrowserPermissionMode) => {
      if (permissionMode !== "read_only" && permissionMode !== "edit" && permissionMode !== "run_safe") throw settingsError("CONTROL_PERMISSION_MODE_INVALID");
      return write({ ...read(), permissionMode });
    }
  });
}

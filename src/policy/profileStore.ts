import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { codexProHome } from "../profileStore.js";
import {
  compiledPermissionProfileV1Schema,
  compiledPermissionProfileV3Schema,
  permissionProfileDocumentV1Schema,
  permissionProfileDocumentV3Schema
} from "./schemas.js";
import type {
  CompiledPermissionProfileV1,
  CompiledPermissionProfileV3,
  FilesystemRuleV1,
  PermissionProfileDocumentV1,
  PermissionProfileDocumentV3,
  PolicySourceHashV1
} from "./types.js";

const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_PROFILE_BYTES = 256 * 1024;

export class PolicyConfigError extends Error {
  readonly code = "POLICY_CONFIG_INVALID" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PolicyConfigError";
  }
}

export interface LoadedPermissionProfileGraph {
  id: string;
  order: PermissionProfileDocumentV1[];
  sourceHashes: PolicySourceHashV1[];
}

export interface LoadedPermissionProfileGraphV3 {
  id: string;
  order: Array<PermissionProfileDocumentV1 | PermissionProfileDocumentV3>;
  sourceHashes: PolicySourceHashV1[];
}

export function permissionDir(home = codexProHome()): string {
  return path.join(home, "permissions");
}

export function permissionProfilePath(id: string, home = codexProHome()): string {
  if (!PROFILE_ID.test(id)) {
    throw new PolicyConfigError("Invalid permission profile id.");
  }
  return path.join(permissionDir(home), `${id}.json`);
}

function isFileError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function readAndValidateProfile(id: string, home?: string): { document: PermissionProfileDocumentV1; sha256: string } {
  const filePath = permissionProfilePath(id, home);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (isFileError(error, "ENOENT")) {
      throw new PolicyConfigError("Permission profile does not exist.", { cause: error });
    }
    throw new PolicyConfigError("Permission profile metadata could not be read.", { cause: error });
  }
  if (stat.isSymbolicLink()) {
    throw new PolicyConfigError("Permission profile documents must not be symbolic links.");
  }
  if (!stat.isFile()) {
    throw new PolicyConfigError("Permission profile path is not a regular file.");
  }
  if (stat.size > MAX_PROFILE_BYTES) {
    throw new PolicyConfigError("Permission profile is too large; the maximum is 256 KiB.");
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw new PolicyConfigError("Permission profile could not be read.", { cause: error });
  }
  if (bytes.length > MAX_PROFILE_BYTES) {
    throw new PolicyConfigError("Permission profile is too large; the maximum is 256 KiB.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new PolicyConfigError("Permission profile is not valid JSON.", { cause: error });
  }

  const result = permissionProfileDocumentV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new PolicyConfigError("Permission profile does not match Permission Profile V1.", { cause: result.error });
  }
  if (result.data.id !== id) {
    throw new PolicyConfigError("Permission profile id does not match its file name.");
  }

  return {
    document: result.data,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export function loadPermissionProfileGraph(
  id: string,
  options: { home?: string; maxDepth?: number } = {}
): LoadedPermissionProfileGraph {
  const maxDepth = options.maxDepth ?? 8;
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 8) {
    throw new PolicyConfigError("Permission profile inheritance depth must be between one and eight.");
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const order: PermissionProfileDocumentV1[] = [];
  const sourceHashes: PolicySourceHashV1[] = [];

  const visit = (currentId: string, depth: number): void => {
    if (depth > maxDepth) {
      throw new PolicyConfigError("Permission profile inheritance exceeds eight levels.");
    }
    if (active.has(currentId)) {
      throw new PolicyConfigError("Permission profile inheritance cycle detected.");
    }
    if (visited.has(currentId)) return;

    active.add(currentId);
    const loaded = readAndValidateProfile(currentId, options.home);
    if (loaded.document.extends) visit(loaded.document.extends, depth + 1);
    active.delete(currentId);
    visited.add(currentId);
    order.push(loaded.document);
    sourceHashes.push({ id: currentId, sha256: loaded.sha256 });
  };

  visit(id, 1);
  return { id, order, sourceHashes };
}

function readAndValidateProfileForV3(
  id: string,
  home?: string
): { document: PermissionProfileDocumentV1 | PermissionProfileDocumentV3; sha256: string } {
  const filePath = permissionProfilePath(id, home);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    throw new PolicyConfigError("Permission profile does not exist or could not be inspected.", { cause: error });
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_PROFILE_BYTES) {
    throw new PolicyConfigError("Permission profile must be a bounded regular file, not a symbolic link.");
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw new PolicyConfigError("Permission profile could not be read.", { cause: error });
  }
  if (bytes.length > MAX_PROFILE_BYTES) throw new PolicyConfigError("Permission profile is too large; the maximum is 256 KiB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new PolicyConfigError("Permission profile is not valid JSON.", { cause: error });
  }
  const v1 = permissionProfileDocumentV1Schema.safeParse(parsed);
  const v3 = v1.success ? null : permissionProfileDocumentV3Schema.safeParse(parsed);
  const document = v1.success ? v1.data : v3?.success ? v3.data : null;
  if (!document) throw new PolicyConfigError("Permission profile does not match Permission Profile V1 or V3.");
  if (document.id !== id) throw new PolicyConfigError("Permission profile id does not match its file name.");
  return { document, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function loadPermissionProfileGraphV3(
  id: string,
  options: { home?: string; maxDepth?: number } = {}
): LoadedPermissionProfileGraphV3 {
  const maxDepth = options.maxDepth ?? 8;
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 8) {
    throw new PolicyConfigError("Permission profile inheritance depth must be between one and eight.");
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const order: Array<PermissionProfileDocumentV1 | PermissionProfileDocumentV3> = [];
  const sourceHashes: PolicySourceHashV1[] = [];
  const visit = (currentId: string, depth: number): void => {
    if (depth > maxDepth) throw new PolicyConfigError("Permission profile inheritance exceeds eight levels.");
    if (active.has(currentId)) throw new PolicyConfigError("Permission profile inheritance cycle detected.");
    if (visited.has(currentId)) return;
    active.add(currentId);
    const loaded = readAndValidateProfileForV3(currentId, options.home);
    if (loaded.document.extends) visit(loaded.document.extends, depth + 1);
    active.delete(currentId);
    visited.add(currentId);
    order.push(loaded.document);
    sourceHashes.push({ id: currentId, sha256: loaded.sha256 });
  };
  visit(id, 1);
  if (order.at(-1)?.schemaVersion !== 3) {
    throw new PolicyConfigError("Contract V3 requires a Permission Profile V3 leaf document.");
  }
  return { id, order, sourceHashes };
}

function normalizeRulePath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/")).normalize("NFC");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function normalizedSelector(rule: FilesystemRuleV1, platform: NodeJS.Platform): string {
  if (rule.selector.kind === "deny_glob") {
    const pattern = rule.selector.pattern.normalize("NFC");
    return `deny_glob:${platform === "win32" ? pattern.toLocaleLowerCase("en-US") : pattern}`;
  }
  return `${rule.selector.kind}:${normalizeRulePath(rule.selector.path, platform)}`;
}

function canonicalizeWorkspaceRoot(root: string, platform: NodeJS.Platform): string {
  if (!path.isAbsolute(root) && !path.win32.isAbsolute(root)) {
    throw new PolicyConfigError("Permission profile workspace roots must be absolute existing directories.");
  }
  if (platform === "win32") {
    const win = root.replaceAll("/", "\\");
    if (win.startsWith("\\\\") || win.startsWith("\\\\?\\") || win.startsWith("\\\\.\\") || /^[A-Za-z]:[^\\]/.test(win)) {
      throw new PolicyConfigError("Permission profile workspace root uses an unsupported Windows path form.");
    }
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch (error) {
    throw new PolicyConfigError("Permission profile workspace root does not exist.", { cause: error });
  }
  if (!stat.isDirectory()) {
    throw new PolicyConfigError("Permission profile workspace root is not a directory.");
  }
  return fs.realpathSync.native(root);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

export function compilePermissionProfile(
  graph: LoadedPermissionProfileGraph,
  platform: NodeJS.Platform = process.platform
): CompiledPermissionProfileV1 {
  if (graph.order.length === 0 || graph.order.at(-1)?.id !== graph.id) {
    throw new PolicyConfigError("Permission profile graph is incomplete or out of order.");
  }

  let workspaceRoots: string[] = [];
  let filesystemDefault: "deny" | "read" = "deny";
  const rules: FilesystemRuleV1[] = [];
  let gitRead = false;
  let gitWrite = false;
  let gitRemoteWrite = false;
  let shellMode: "disabled" | "verify" | "execute" = "disabled";
  let shellRequireSandbox = true;
  let processManage = false;
  let processPersistent = false;
  let processRequireSandbox = true;
  let networkEnabled = false;
  const networkRules: NonNullable<PermissionProfileDocumentV1["network"]>["rules"] = [];
  let networkAllowLoopback = false;
  let networkAllowPrivate = false;
  let networkAllowLinkLocal = false;
  let networkRequireEnforcement = true;

  for (const document of graph.order) {
    if (document.workspaceRoots !== undefined) workspaceRoots = [...document.workspaceRoots];
    if (document.filesystem?.default !== undefined) filesystemDefault = document.filesystem.default;
    if (document.filesystem?.rules) rules.push(...document.filesystem.rules);
    if (document.git?.read !== undefined) gitRead = document.git.read;
    if (document.git?.write !== undefined) gitWrite = document.git.write;
    if (document.git?.remoteWrite !== undefined) gitRemoteWrite = document.git.remoteWrite;
    if (document.shell?.mode !== undefined) shellMode = document.shell.mode;
    if (document.shell?.requireSandbox !== undefined) shellRequireSandbox = document.shell.requireSandbox;
    if (document.process?.manage !== undefined) processManage = document.process.manage;
    if (document.process?.persistent !== undefined) processPersistent = document.process.persistent;
    if (document.process?.requireSandbox !== undefined) processRequireSandbox = document.process.requireSandbox;
    if (document.network?.enabled !== undefined) networkEnabled = document.network.enabled;
    if (document.network?.rules) networkRules.push(...document.network.rules);
    if (document.network?.allowLoopback !== undefined) networkAllowLoopback = document.network.allowLoopback;
    if (document.network?.allowPrivate !== undefined) networkAllowPrivate = document.network.allowPrivate;
    if (document.network?.allowLinkLocal !== undefined) networkAllowLinkLocal = document.network.allowLinkLocal;
    if (document.network?.requireEnforcement !== undefined) networkRequireEnforcement = document.network.requireEnforcement;
  }

  const ruleIds = new Set<string>();
  const selectors = new Map<string, FilesystemRuleV1>();
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) {
      throw new PolicyConfigError("Permission profile contains a duplicate filesystem rule id.");
    }
    ruleIds.add(rule.id);
    const selectorKey = normalizedSelector(rule, platform);
    const existing = selectors.get(selectorKey);
    if (existing) {
      throw new PolicyConfigError(
        existing.access === rule.access
          ? "Permission profile contains a duplicate normalized filesystem selector."
          : "Permission profile contains conflicting normalized filesystem selectors."
      );
    }
    selectors.set(selectorKey, rule);
  }

  const networkRuleIds = new Set<string>();
  for (const rule of networkRules) {
    if (networkRuleIds.has(rule.id)) {
      throw new PolicyConfigError("Permission profile contains a duplicate network rule id.");
    }
    networkRuleIds.add(rule.id);
  }

  const compiled = compiledPermissionProfileV1Schema.parse({
    schemaVersion: 1,
    id: graph.id,
    sourceProfileIds: graph.order.map((document) => document.id),
    workspaceRoots: workspaceRoots.map((root) => canonicalizeWorkspaceRoot(root, platform)),
    filesystem: {
      default: filesystemDefault,
      rules: rules.map((rule) => structuredClone(rule))
    },
    git: { read: gitRead, write: gitWrite, remoteWrite: gitRemoteWrite },
    shell: { mode: shellMode, requireSandbox: shellRequireSandbox },
    process: { manage: processManage, persistent: processPersistent, requireSandbox: processRequireSandbox },
    network: {
      enabled: networkEnabled,
      rules: networkRules.map((rule) => structuredClone(rule)),
      allowLoopback: networkAllowLoopback,
      allowPrivate: networkAllowPrivate,
      allowLinkLocal: networkAllowLinkLocal,
      requireEnforcement: networkRequireEnforcement
    }
  });

  return deepFreeze(compiled);
}

export function compilePermissionProfileV3(
  graph: LoadedPermissionProfileGraphV3,
  platform: NodeJS.Platform = process.platform
): CompiledPermissionProfileV3 {
  const leaf = graph.order.at(-1);
  if (graph.order.length === 0 || leaf?.id !== graph.id || leaf.schemaVersion !== 3) {
    throw new PolicyConfigError("Permission Profile V3 graph must end with its V3 leaf document.");
  }
  const v1Graph: LoadedPermissionProfileGraph = {
    id: graph.id,
    order: graph.order.map((document) => {
      const { schemaVersion: _schemaVersion, ...rest } = document;
      if ("fullAccess" in rest) delete rest.fullAccess;
      return { schemaVersion: 1, ...rest } as PermissionProfileDocumentV1;
    }),
    sourceHashes: graph.sourceHashes
  };
  const base = compilePermissionProfile(v1Graph, platform);
  const fullAccess = {
    ambientFilesystem: false,
    ambientCredentials: false,
    ambientRegistry: false,
    unrestrictedNetwork: false,
    requireBlockedPathEnforcement: true,
    requireCredentialIsolation: true,
    requireRegistryIsolation: true,
    requireDeviceIsolation: true,
    requireNetworkEnforcement: true,
    requireSandbox: true
  };
  for (const document of graph.order) {
    if (document.schemaVersion === 3 && document.fullAccess) Object.assign(fullAccess, document.fullAccess);
  }
  return deepFreeze(compiledPermissionProfileV3Schema.parse({
    ...base,
    schemaVersion: 3,
    fullAccess
  }));
}

export function policyRevisionForSources(
  sourceHashes: readonly PolicySourceHashV1[],
  hardPolicyRevision: string,
  capabilityRevision: string
): string {
  const payload = JSON.stringify({
    schemaVersion: 1,
    sourceHashes: sourceHashes.map(({ id, sha256 }) => ({ id, sha256 })),
    hardPolicyRevision,
    capabilityRevision
  });
  return `policy_${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24)}`;
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_ANALYSIS_LIMITS, type AnalysisLimits } from "./analysis/types.js";
import type { RiskClass } from "./policy/types.js";
import type { ChangeSetRetentionConfig } from "./changesets/types.js";

export type BashMode = "off" | "safe" | "full";
export type BashTranscriptMode = "compact" | "full";
export type CodexSessionsMode = "off" | "metadata" | "read";
export type WriteMode = "off" | "handoff" | "workspace";
export type ToolMode = "minimal" | "standard" | "full";
export type FileTransactionMode = "legacy" | "atomic";
export type ToolContractVersion = 1 | 2;

export type PolicyEngineMode = "legacy" | "shadow" | "enforce";
export type AuditMode = "auto" | "off" | "best_effort" | "required";
export type AuditRequirement = "disabled" | "best_effort" | "required";

export interface AuditRetentionConfig {
  maxAgeDays: number;
  maxClosedBytes: number;
}

export interface CodexProConfig {
  defaultRoot: string;
  allowedRoots: string[];
  host: string;
  port: number;
  widgetDomain: string;
  authToken?: string;
  requireHttpToken: boolean;
  allowedHosts: string[];
  allowedOrigins: string[];
  allowQueryToken: boolean;
  bashMode: BashMode;
  bashTranscript: BashTranscriptMode;
  bashSessionId?: string;
  requireBashSession: boolean;
  codexSessions: CodexSessionsMode;
  codexDir: string;
  writeMode: WriteMode;
  fileTransactions: FileTransactionMode;
  toolContractVersion: ToolContractVersion;
  toolMode: ToolMode;
  policyEngineMode: PolicyEngineMode;
  auditMode: AuditMode;
  auditRetention: AuditRetentionConfig;
  changeSetRetention: ChangeSetRetentionConfig;
  permissionProfileId?: string;
  inheritEnv: boolean;
  maxReadBytes: number;
  maxWriteBytes: number;
  moveMaxFileBytes: number;
  moveMaxTotalBytes: number;
  moveHashConcurrency: number;
  maxOutputBytes: number;
  maxSearchResults: number;
  maxHttpSessions: number;
  httpSessionTtlMs: number;
  workspaceTtlMs?: number;
  blockedGlobs: string[];
  contextDir: string;
  toolCards: boolean;
  connectionTest: boolean;
  analysisEnabled: boolean;
  analysisLimits: AnalysisLimits;
}

const DEFAULT_BLOCKED_GLOBS = [
  ".git",
  ".git/**",
  "**/.git/**",
  "node_modules",
  "node_modules/**",
  "**/node_modules/**",
  ".env",
  ".env/**",
  ".env.*",
  ".env.*/**",
  "**/.env",
  "**/.env/**",
  "**/.env.*",
  "**/.env.*/**",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa",
  "**/id_rsa.*",
  "**/id_ed25519",
  "**/id_ed25519.*",
  "**/.ssh/**",
  "dist",
  "dist/**",
  "**/dist/**",
  "build",
  "build/**",
  "**/build/**",
  ".next",
  ".next/**",
  "**/.next/**",
  "coverage",
  "coverage/**",
  "**/coverage/**",
  ".cache",
  ".cache/**",
  "**/.cache/**"
];

function parseArgs(argv: string[]): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const withoutPrefix = raw.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");
    let key: string;
    let value: string | boolean;
    if (eqIndex >= 0) {
      key = withoutPrefix.slice(0, eqIndex);
      value = withoutPrefix.slice(eqIndex + 1);
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }

    if (key === "allow-root") {
      const prev = out[key];
      if (Array.isArray(prev)) prev.push(String(value));
      else if (prev) out[key] = [String(prev), String(value)];
      else out[key] = [String(value)];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function expandHome(input: string): string {
  if (!input || input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function splitList(value: string | undefined, delimiter: string = path.delimiter): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitRoots(value: string | undefined): string[] {
  return splitList(value, path.delimiter);
}

function toRealDir(input: string): string {
  const expanded = expandHome(input);
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  return fs.realpathSync.native(resolved);
}

function toCanonicalPath(input: string): string {
  const resolved = path.resolve(expandHome(input));
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

function numberFrom(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function bashModeFrom(value: string | undefined): BashMode {
  if (value === "off" || value === "safe" || value === "full") return value;
  return "safe";
}

function bashTranscriptFrom(value: string | undefined): BashTranscriptMode {
  if (value === "compact" || value === "full") return value;
  return "compact";
}

function codexSessionsFrom(value: string | undefined): CodexSessionsMode {
  if (value === "metadata" || value === "read") return value;
  if (value === "1" || value === "true" || value === "yes" || value === "on") return "metadata";
  return "off";
}

function bashSessionIdFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed)) {
    throw new Error("CODEXPRO_BASH_SESSION_ID must be 1-64 characters using letters, numbers, dot, underscore, or dash, and must start with a letter or number.");
  }
  return trimmed;
}

function writeModeFrom(value: string | undefined): WriteMode {
  if (value === "off" || value === "handoff" || value === "workspace") return value;
  return "workspace";
}

function strictNumberFrom(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function fileTransactionModeFrom(value: string | undefined): FileTransactionMode {
  const normalized = value?.trim();
  if (!normalized) return "legacy";
  if (normalized === "legacy" || normalized === "atomic") return normalized;
  throw new Error("CODEXPRO_FILE_TRANSACTIONS must be legacy or atomic.");
}

function toolContractVersionFrom(value: string | undefined): ToolContractVersion {
  const normalized = value?.trim();
  if (!normalized || normalized === "1") return 1;
  if (normalized === "2") return 2;
  throw new Error("CODEXPRO_TOOL_CONTRACT_VERSION must be 1 or 2.");
}

export interface FileTransactionCapabilities {
  workspaceMutatorsAtomic: boolean;
}

export function assertFileTransactionConfiguration(
  config: Pick<CodexProConfig, "fileTransactions" | "writeMode">,
  capabilities: FileTransactionCapabilities
): void {
  if (
    config.fileTransactions === "atomic" &&
    config.writeMode !== "off" &&
    !capabilities.workspaceMutatorsAtomic
  ) {
    throw new Error(
      "CODEXPRO_FILE_TRANSACTIONS=atomic requires transaction-backed workspace mutators; disable writes or use legacy when the runtime cannot provide them."
    );
  }
}

function toolModeFrom(value: string | undefined): ToolMode {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return "standard";
}

function policyEngineModeFrom(value: string | undefined): PolicyEngineMode {
  const normalized = value?.trim();
  if (!normalized) return "legacy";
  if (normalized === "legacy" || normalized === "shadow" || normalized === "enforce") return normalized;
  throw new Error("CODEXPRO_POLICY_ENGINE must be legacy, shadow, or enforce.");
}

export interface ToolContractCapabilities {
  durableAuditAvailable: boolean;
  stateRootAvailable: boolean;
  movePathsAvailable: boolean;
}

export function assertToolContractConfiguration(
  config: Pick<CodexProConfig, "fileTransactions" | "auditMode"> &
    Partial<Pick<CodexProConfig, "toolContractVersion">>,
  capabilities: ToolContractCapabilities
): void {
  // Existing programmatic callers may omit the new field for one migration
  // cycle. Missing remains contract V1, matching loadConfig's default.
  if (config.toolContractVersion === undefined || config.toolContractVersion === 1) return;
  if (config.toolContractVersion !== 2) {
    throw new Error("Unsupported tool contract version.");
  }
  if (config.fileTransactions !== "atomic") {
    throw new Error("CODEXPRO_TOOL_CONTRACT_VERSION=2 requires CODEXPRO_FILE_TRANSACTIONS=atomic.");
  }
  if (!capabilities.movePathsAvailable) {
    throw new Error("Contract V2 is incomplete without the Phase 3D move_paths runtime.");
  }
  if (config.auditMode === "off") {
    throw new Error("Contract V2 requires persistent audit; CODEXPRO_AUDIT_MODE cannot be off.");
  }
  if (!capabilities.durableAuditAvailable) {
    throw new Error("Contract V2 requires an available persistent audit runtime.");
  }
  if (!capabilities.stateRootAvailable) {
    throw new Error("Contract V2 requires an available Phase 3 state root.");
  }
}

function auditModeFrom(value: string | undefined): AuditMode {
  const normalized = value?.trim();
  if (!normalized) return "auto";
  if (
    normalized === "auto" ||
    normalized === "off" ||
    normalized === "best_effort" ||
    normalized === "required"
  ) return normalized;
  throw new Error("CODEXPRO_AUDIT_MODE must be auto, off, best_effort, or required.");
}

function riskRank(riskClass: RiskClass): number {
  return Number(riskClass.slice(1));
}

export function resolveAuditRequirement(
  config: Pick<CodexProConfig, "auditMode" | "policyEngineMode">,
  riskClass: RiskClass,
  mutating: boolean
): AuditRequirement {
  if (config.auditMode === "off") return "disabled";
  if (config.auditMode === "best_effort") return "best_effort";
  if (config.auditMode === "required") return "required";
  return config.policyEngineMode === "enforce" && mutating && riskRank(riskClass) >= 2
    ? "required"
    : "best_effort";
}

export interface AuditConfigurationCapabilities {
  durableStoreAvailable: boolean;
}

export function assertAuditConfiguration(
  config: Pick<CodexProConfig, "auditMode" | "policyEngineMode">,
  capabilities: AuditConfigurationCapabilities
): void {
  if (config.policyEngineMode === "enforce" && config.auditMode === "off") {
    throw new Error("CODEXPRO_AUDIT_MODE cannot be off when CODEXPRO_POLICY_ENGINE=enforce.");
  }
  if (config.auditMode === "required" && !capabilities.durableStoreAvailable) {
    throw new Error("CODEXPRO_AUDIT_MODE=required needs an available durable audit store.");
  }
}

function permissionProfileIdFrom(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error("CODEXPRO_PERMISSION_PROFILE must be 1-64 lowercase characters using letters, numbers, dot, underscore, or dash.");
  }
  return normalized;
}

function widgetDomainFrom(value: string | undefined): string {
  const raw = value?.trim() || "https://rebel0789.github.io";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`CODEXPRO_WIDGET_DOMAIN must be a valid origin URL, got: ${raw}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error("CODEXPRO_WIDGET_DOMAIN must use https.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("CODEXPRO_WIDGET_DOMAIN must be an origin only, for example https://widgets.example.com.");
  }
  return parsed.origin;
}

function contextDirFrom(value: string | undefined): string {
  const raw = (value?.trim() || ".ai-bridge").replaceAll("\\", "/");
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error("CODEXPRO_CONTEXT_DIR must be a workspace-relative hidden directory, for example .ai-bridge.");
  }

  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must stay inside the workspace.");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must be a simple relative directory path.");
  }
  if (!parts[0].startsWith(".")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must start with a hidden directory such as .ai-bridge.");
  }

  const blocked = new Set([".git", ".ssh", ".gnupg", ".cache", "node_modules", "src", "dist", "build", ".next", "coverage"]);
  if (parts.some((part) => blocked.has(part))) {
    throw new Error("CODEXPRO_CONTEXT_DIR cannot point at source, dependency, build, cache, or credential directories.");
  }
  return normalized;
}

function boolFrom(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function normalizeAllowedHost(value: string): string {
  let raw = value.trim().toLowerCase();
  if (!raw) throw new Error("CODEXPRO_ALLOWED_HOSTS contains an empty host.");
  if (raw.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`CODEXPRO_ALLOWED_HOSTS contains an invalid host: ${value}`);
    }
    raw = parsed.hostname.toLowerCase();
  }
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  const portSeparator = raw.lastIndexOf(":");
  if (portSeparator > 0 && raw.indexOf(":") === portSeparator && /^\d+$/.test(raw.slice(portSeparator + 1))) {
    raw = raw.slice(0, portSeparator);
  }
  if (!raw || raw === "*" || /[\\/\s]/.test(raw)) {
    throw new Error(`CODEXPRO_ALLOWED_HOSTS contains an invalid host: ${value}`);
  }
  return raw;
}

function allowedHostsFrom(value: string | undefined, bindHost: string): string[] {
  const hosts = ["127.0.0.1", "localhost", "::1", ...splitList(value, ",")];
  if (bindHost !== "0.0.0.0" && bindHost !== "::") hosts.push(bindHost);
  return [...new Set(hosts.map(normalizeAllowedHost))];
}

function allowedOriginsFrom(value: string | undefined): string[] {
  return [...new Set(splitList(value, ",").map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CODEXPRO_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error(`CODEXPRO_ALLOWED_ORIGINS must contain HTTP(S) origins only: ${origin}`);
    }
    return parsed.origin;
  }))];
}

export function loadConfig(argv = process.argv.slice(2)): CodexProConfig {
  const args = parseArgs(argv);

  const rootFromArgs = typeof args.root === "string" ? args.root : undefined;
  const root = rootFromArgs ?? process.env.CODEXPRO_ROOT ?? process.env.CODEBASE_BRIDGE_REPO_ROOT ?? process.cwd();
  const defaultRoot = toRealDir(root);

  const allowRootArgs = Array.isArray(args["allow-root"])
    ? args["allow-root"]
    : typeof args["allow-root"] === "string"
      ? [args["allow-root"]]
      : [];
  const envAllowedRoots = [
    ...splitRoots(process.env.CODEXPRO_ALLOWED_ROOTS),
    ...splitRoots(process.env.CODEBASE_BRIDGE_ALLOWED_ROOTS)
  ];

  const allowHome = process.env.CODEXPRO_ALLOW_HOME === "1" || args["allow-home"] === true;
  const requestedAllowed = [defaultRoot, ...allowRootArgs, ...envAllowedRoots, ...(allowHome ? [os.homedir()] : [])];
  const allowedRoots = [...new Set(requestedAllowed.map(toRealDir))];

  const portArg = typeof args.port === "string" ? args.port : undefined;
  const hostArg = typeof args.host === "string" ? args.host : undefined;
  const bashArg = typeof args.bash === "string" ? args.bash : undefined;
  const bashTranscriptArg = typeof args["bash-transcript"] === "string" ? args["bash-transcript"] : undefined;
  const bashSessionArg = typeof args["bash-session"] === "string" ? args["bash-session"] : undefined;
  const codexSessionsArg = typeof args["codex-sessions"] === "string" ? args["codex-sessions"] : undefined;
  const codexDirArg = typeof args["codex-dir"] === "string" ? args["codex-dir"] : undefined;
  const requireBashSessionArg =
    args["require-bash-session"] === true
      ? "true"
      : typeof args["require-bash-session"] === "string"
        ? args["require-bash-session"]
        : undefined;
  const writeArg = typeof args.write === "string" ? args.write : undefined;
  const fileTransactionsArg = typeof args["file-transactions"] === "string"
    ? args["file-transactions"]
    : undefined;
  if (args["tool-contract-version"] === true) {
    throw new Error("--tool-contract-version requires a value of 1 or 2.");
  }
  const toolContractVersionArg = typeof args["tool-contract-version"] === "string"
    ? args["tool-contract-version"]
    : undefined;
  const toolModeArg = typeof args["tool-mode"] === "string" ? args["tool-mode"] : undefined;
  const policyEngineArg = typeof args["policy-engine"] === "string" ? args["policy-engine"] : undefined;
  const auditModeArg = typeof args["audit-mode"] === "string" ? args["audit-mode"] : undefined;
  const permissionProfileArg = typeof args["permission-profile"] === "string" ? args["permission-profile"] : undefined;
  const widgetDomainArg = typeof args["widget-domain"] === "string" ? args["widget-domain"] : undefined;
  const toolCardsArg =
    args["tool-cards"] === true
      ? "true"
      : typeof args["tool-cards"] === "string"
        ? args["tool-cards"]
        : undefined;
  const extraBlockedGlobs = splitList(process.env.CODEXPRO_BLOCKED_GLOBS, ",");
  const host = hostArg ?? process.env.CODEXPRO_HOST ?? process.env.HOST ?? "127.0.0.1";
  const authToken = process.env.CODEXPRO_HTTP_TOKEN ?? process.env.CODEBASE_BRIDGE_HTTP_TOKEN;
  const allowNoToken = boolFrom(process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN, false) && isLoopbackHost(host);
  const requireHttpToken =
    (!authToken && !allowNoToken) ||
    boolFrom(process.env.CODEXPRO_REQUIRE_HTTP_TOKEN, false) ||
    boolFrom(process.env.CODEXPRO_TUNNEL_MODE, false) ||
    (!isLoopbackHost(host) && !allowNoToken);
  const allowedHostHints = [
    process.env.CODEXPRO_ALLOWED_HOSTS,
    process.env.CODEXPRO_PUBLIC_HOSTNAME,
    process.env.CODEXPRO_HOSTNAME,
    process.env.NGROK_DOMAIN
  ].filter((value): value is string => Boolean(value));
  const allowedHosts = allowedHostsFrom(allowedHostHints.join(","), host);
  const allowedOrigins = allowedOriginsFrom(process.env.CODEXPRO_ALLOWED_ORIGINS);
  const allowQueryToken = boolFrom(process.env.CODEXPRO_ALLOW_QUERY_TOKEN, false);
  const bashSessionId = bashSessionIdFrom(bashSessionArg ?? process.env.CODEXPRO_BASH_SESSION_ID);
  const requireBashSession = boolFrom(requireBashSessionArg ?? process.env.CODEXPRO_REQUIRE_BASH_SESSION, false);
  if (requireBashSession && !bashSessionId) {
    throw new Error("CODEXPRO_REQUIRE_BASH_SESSION requires CODEXPRO_BASH_SESSION_ID or --bash-session.");
  }

  const config: CodexProConfig = {
    defaultRoot,
    allowedRoots,
    host,
    port: numberFrom(portArg ?? process.env.CODEXPRO_PORT ?? process.env.PORT, 8787, 1, 65535),
    widgetDomain: widgetDomainFrom(widgetDomainArg ?? process.env.CODEXPRO_WIDGET_DOMAIN),
    authToken,
    requireHttpToken,
    allowedHosts,
    allowedOrigins,
    allowQueryToken,
    bashMode: bashModeFrom(bashArg ?? process.env.CODEXPRO_BASH_MODE),
    bashTranscript: bashTranscriptFrom(bashTranscriptArg ?? process.env.CODEXPRO_BASH_TRANSCRIPT),
    bashSessionId,
    requireBashSession,
    codexSessions: codexSessionsFrom(codexSessionsArg ?? process.env.CODEXPRO_CODEX_SESSIONS),
    codexDir: toCanonicalPath(codexDirArg || process.env.CODEXPRO_CODEX_DIR || path.join(os.homedir(), ".codex")),
    writeMode: writeModeFrom(writeArg ?? process.env.CODEXPRO_WRITE_MODE),
    fileTransactions: fileTransactionModeFrom(
      fileTransactionsArg ?? process.env.CODEXPRO_FILE_TRANSACTIONS
    ),
    toolContractVersion: toolContractVersionFrom(
      toolContractVersionArg ?? process.env.CODEXPRO_TOOL_CONTRACT_VERSION
    ),
    toolMode: toolModeFrom(toolModeArg ?? process.env.CODEXPRO_TOOL_MODE),
    policyEngineMode: policyEngineModeFrom(policyEngineArg ?? process.env.CODEXPRO_POLICY_ENGINE),
    auditMode: auditModeFrom(auditModeArg ?? process.env.CODEXPRO_AUDIT_MODE),
    auditRetention: {
      maxAgeDays: numberFrom(process.env.CODEXPRO_AUDIT_RETENTION_DAYS, 30, 1, 365),
      maxClosedBytes: numberFrom(
        process.env.CODEXPRO_AUDIT_RETENTION_BYTES,
        100 * 1024 * 1024,
        1024 * 1024,
        2 * 1024 * 1024 * 1024
      )
    },
    changeSetRetention: {
      maxPlaintextBytesPerChangeSet: strictNumberFrom(
        "CODEXPRO_CHANGE_SET_MAX_PLAINTEXT_BYTES",
        process.env.CODEXPRO_CHANGE_SET_MAX_PLAINTEXT_BYTES,
        8 * 1024 * 1024,
        1024,
        64 * 1024 * 1024
      ),
      maxInstallationCiphertextBytes: strictNumberFrom(
        "CODEXPRO_CHANGE_SET_MAX_INSTALLATION_BYTES",
        process.env.CODEXPRO_CHANGE_SET_MAX_INSTALLATION_BYTES,
        128 * 1024 * 1024,
        1024 * 1024,
        2 * 1024 * 1024 * 1024
      ),
      maxActivePerWorkspace: strictNumberFrom(
        "CODEXPRO_CHANGE_SET_MAX_ACTIVE_PER_WORKSPACE",
        process.env.CODEXPRO_CHANGE_SET_MAX_ACTIVE_PER_WORKSPACE,
        20,
        1,
        1000
      ),
      activeRetentionMs: strictNumberFrom(
        "CODEXPRO_CHANGE_SET_RETENTION_MS",
        process.env.CODEXPRO_CHANGE_SET_RETENTION_MS,
        24 * 60 * 60_000,
        60_000,
        30 * 24 * 60 * 60_000
      ),
      tombstoneRetentionMs: strictNumberFrom(
        "CODEXPRO_CHANGE_SET_TOMBSTONE_RETENTION_MS",
        process.env.CODEXPRO_CHANGE_SET_TOMBSTONE_RETENTION_MS,
        30 * 24 * 60 * 60_000,
        24 * 60 * 60_000,
        365 * 24 * 60 * 60_000
      )
    },
    permissionProfileId: permissionProfileIdFrom(permissionProfileArg ?? process.env.CODEXPRO_PERMISSION_PROFILE),
    inheritEnv: process.env.CODEXPRO_INHERIT_ENV === "1",
    maxReadBytes: numberFrom(process.env.CODEXPRO_MAX_READ_BYTES, 250_000, 4_000, 2_000_000),
    maxWriteBytes: numberFrom(process.env.CODEXPRO_MAX_WRITE_BYTES, 1_000_000, 1_000, 10_000_000),
    moveMaxFileBytes: strictNumberFrom(
      "CODEXPRO_MOVE_MAX_FILE_BYTES",
      process.env.CODEXPRO_MOVE_MAX_FILE_BYTES,
      64 * 1024 * 1024,
      1,
      1024 * 1024 * 1024
    ),
    moveMaxTotalBytes: strictNumberFrom(
      "CODEXPRO_MOVE_MAX_TOTAL_BYTES",
      process.env.CODEXPRO_MOVE_MAX_TOTAL_BYTES,
      256 * 1024 * 1024,
      1,
      4 * 1024 * 1024 * 1024
    ),
    moveHashConcurrency: strictNumberFrom(
      "CODEXPRO_MOVE_HASH_CONCURRENCY",
      process.env.CODEXPRO_MOVE_HASH_CONCURRENCY,
      4,
      1,
      16
    ),
    maxOutputBytes: numberFrom(process.env.CODEXPRO_MAX_OUTPUT_BYTES, 120_000, 4_000, 2_000_000),
    maxSearchResults: numberFrom(process.env.CODEXPRO_MAX_SEARCH_RESULTS, 200, 5, 2_000),
    maxHttpSessions: numberFrom(process.env.CODEXPRO_MAX_HTTP_SESSIONS, 64, 1, 512),
    httpSessionTtlMs: numberFrom(process.env.CODEXPRO_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    workspaceTtlMs: numberFrom(
      process.env.CODEXPRO_WORKSPACE_TTL_MS,
      numberFrom(process.env.CODEXPRO_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
      60_000,
      24 * 60 * 60_000
    ),
    blockedGlobs: [...DEFAULT_BLOCKED_GLOBS, ...extraBlockedGlobs],
    contextDir: contextDirFrom(process.env.CODEXPRO_CONTEXT_DIR),
    toolCards: boolFrom(toolCardsArg ?? process.env.CODEXPRO_TOOL_CARDS, false),
    connectionTest: boolFrom(process.env.CODEXPRO_CONNECTION_TEST, false),
    analysisEnabled: boolFrom(process.env.CODEXPRO_ANALYSIS, true),
    analysisLimits: {
      maxInventoryFiles: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_INVENTORY_FILES, DEFAULT_ANALYSIS_LIMITS.maxInventoryFiles, 100, 100_000),
      maxAnalyzedFiles: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_ANALYZED_FILES, DEFAULT_ANALYSIS_LIMITS.maxAnalyzedFiles, 10, 50_000),
      maxScannedBytes: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_SCANNED_BYTES, DEFAULT_ANALYSIS_LIMITS.maxScannedBytes, 1_000_000, 512 * 1024 * 1024),
      maxSymbols: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_SYMBOLS, DEFAULT_ANALYSIS_LIMITS.maxSymbols, 100, 1_000_000),
      maxRelationships: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_RELATIONSHIPS, DEFAULT_ANALYSIS_LIMITS.maxRelationships, 100, 2_000_000)
    }
  };
  assertAuditConfiguration(config, { durableStoreAvailable: true });
  return config;
}

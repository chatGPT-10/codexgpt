import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { DEFAULT_ANALYSIS_LIMITS, type AnalysisLimits } from "./analysis/types.js";
import type { RiskClass } from "./policy/types.js";
import type { ChangeSetRetentionConfig } from "./changesets/types.js";
import { resolveGuidanceMode, type GuidanceMode } from "./guidance/mode.js";
import {
  assertHttpAuthModeCompatibility,
  resolveHttpAuthMode,
  resolveOAuthDeploymentConfiguration,
  resolveOAuthRootSelection
} from "./auth/configuration.js";
import type { AuthModeSource, HttpAuthMode, OAuthDeploymentConfiguration } from "./auth/types.js";
import { ConfigResolutionError, resolveConfigBootstrap } from "./configResolver.js";
import { profileIdForRoot, readWorkspaceProfile, type WorkspaceProfile } from "./profileStore.js";
import { resolveTransactionStateRoot } from "./transactions/stateRoot.js";

export type BashMode = "off" | "safe" | "full";
export type BashTranscriptMode = "compact" | "full";
export type CodexSessionsMode = "off" | "metadata" | "read";
export type WriteMode = "off" | "handoff" | "workspace";
export type ToolMode = "minimal" | "standard" | "full";
export type FileTransactionMode = "legacy" | "atomic";
export type ToolContractVersion = 1 | 2 | 3 | 4 | 5;
export type PersistedMutationContractVersion = 1 | 2 | 3;
export type SemanticMode = "legacy" | "standard";
export type SemanticProviderSelection = "builtin" | "none";
export type OAuthWorkspaceCapabilityMode = "session_local" | "oauth_cross_transport";

export function persistedMutationContractVersion(
  version: ToolContractVersion
): PersistedMutationContractVersion {
  return version === 4 || version === 5 ? 3 : version;
}

export function persistedV2ContractVersion(version: 2 | 3 | 4 | 5): 2 | 3 {
  return version === 2 ? 2 : 3;
}
export type LocalFileAccessMode = "configured_roots" | "confirmed_roots";
export type ExecutionProfile = "off" | "full_access" | "workspace";
export type ExecutionDependencies = "off" | "node_modules";
export type GitMode = "read" | "local";
export type GitIntegrationsMode = "off" | "approved_full_access";

export type PolicyEngineMode = "legacy" | "shadow" | "enforce";
export type AuditMode = "auto" | "off" | "best_effort" | "required";
export type AuditRequirement = "disabled" | "best_effort" | "required";

export interface AuditRetentionConfig {
  maxAgeDays: number;
  maxClosedBytes: number;
}

export interface ConfigLoadOptions {
  persistedUserAuthMode?: string;
  workspaceProfile?: WorkspaceProfile;
  platform?: NodeJS.Platform;
  filesystemPlatform?: NodeJS.Platform;
  environment?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  profileLoader?: (root: string) => WorkspaceProfile;
  homeDir?: string;
}

export interface CodexGPTConfig {
  defaultRoot: string;
  allowedRoots: string[];
  host: string;
  port: number;
  widgetDomain: string;
  authMode: HttpAuthMode;
  authModeSource: AuthModeSource;
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
  localFileAccess: LocalFileAccessMode;
  executionProfile: ExecutionProfile;
  executionDependencies: ExecutionDependencies;
  gitMode: GitMode;
  gitIntegrations: GitIntegrationsMode;
  taskWorktreeRoot: string;
  taskWorktreeMaxCount: number;
  taskWorktreeMaxFiles: number;
  taskWorktreeMaxBytes: number;
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
  oauthWorkspaceCapabilityMode?: OAuthWorkspaceCapabilityMode;
  blockedGlobs: string[];
  contextDir: string;
  toolCards: boolean;
  connectionTest: boolean;
  analysisEnabled: boolean;
  analysisLimits: AnalysisLimits;
  guidanceMode: GuidanceMode;
  semanticMode: SemanticMode;
  semanticProvider: SemanticProviderSelection;
  instructionFallbacks: string[];
  maxInstructionTotalBytes: number;
  maxSkillCandidates: number;
  maxSkillCatalogChars: number;
  transactionStateRoot: string | null;
  logRequests: boolean;
  logToolCalls: boolean;
  oauthDeployment?: Readonly<OAuthDeploymentConfiguration>;
}

export interface EffectiveConfigSnapshot {
  readonly effective: CodexGPTConfig;
  readonly publicFingerprint: string;
  integrityProof(key: string): string;
  toJSON(): Readonly<{
    effective: Readonly<Record<string, unknown>>;
    publicFingerprint: string;
  }>;
}

export type ConfigFingerprintErrorCode =
  | "CONFIG_FINGERPRINT_INVALID"
  | "CONFIG_FINGERPRINT_MISMATCH"
  | "CONFIG_INTEGRITY_INVALID"
  | "CONFIG_INTEGRITY_MISMATCH";

export class ConfigFingerprintError extends Error {
  readonly name = "ConfigFingerprintError";

  constructor(
    readonly code: ConfigFingerprintErrorCode,
    readonly remediation: string,
    message: string
  ) {
    super(message);
  }

  toJSON(): Readonly<{ code: ConfigFingerprintErrorCode; remediation: string }> {
    return Object.freeze({ code: this.code, remediation: this.remediation });
  }
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

function instructionFallbacksFrom(value: string | undefined): string[] {
  const names = value === undefined ? ["agents.md", ".agents.md"] : splitList(value, ",");
  if (names.length > 8) {
    throw new Error("CODEXGPT_INSTRUCTION_FALLBACKS accepts at most eight basenames.");
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (
      name !== path.basename(name) ||
      name === "." ||
      name === ".." ||
      /[\\/:\u0000-\u001f\u007f]/.test(name) ||
      name.endsWith(".") ||
      name.endsWith(" ") ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name)
    ) {
      throw new Error("CODEXGPT_INSTRUCTION_FALLBACKS must contain safe basenames only.");
    }
    const key = name.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      throw new Error("CODEXGPT_INSTRUCTION_FALLBACKS must not contain case-insensitive duplicates.");
    }
    seen.add(key);
  }
  return names;
}

function splitRoots(value: string | undefined): string[] {
  return splitList(value, path.delimiter);
}

function toRealDir(input: string, cwd = process.cwd()): string {
  const expanded = expandHome(input);
  const resolved = path.resolve(cwd, expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  return fs.realpathSync.native(resolved);
}

function toCanonicalPath(input: string, cwd = process.cwd()): string {
  const resolved = path.resolve(cwd, expandHome(input));
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

function environmentSnapshot(
  input: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform
): Readonly<Record<string, string | undefined>> {
  if (platform !== "win32") {
    return Object.freeze(Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined)));
  }
  const candidates = new Map<string, ReadonlyArray<readonly [string, string]>>();
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const key = name.toLocaleUpperCase("en-US");
    candidates.set(key, Object.freeze([...(candidates.get(key) ?? []), Object.freeze([name, value] as const)]));
  }
  const target = Object.freeze(Object.create(null)) as Readonly<Record<string, string | undefined>>;
  return new Proxy(target, {
    get: (_target, property) => {
      if (typeof property !== "string") return undefined;
      const matches = candidates.get(property.toLocaleUpperCase("en-US")) ?? [];
      if (matches.length > 1) {
        const origins = matches.map(([name]) => ({
          kind: "environment" as const,
          variable: name,
          scope: "current-process" as const
        }));
        throw new ConfigResolutionError(
          "CONFIG_SOURCE_CONFLICT",
          property,
          origins,
          `Keep exactly one Windows environment spelling for ${property}.`,
          `Configuration ${property} has multiple current-process environment sources: ${matches.map(([name]) => name).join(", ")}. Keep exactly one Windows environment spelling for ${property}.`
        );
      }
      return matches[0]?.[1];
    }
  });
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
    throw new Error("CODEXGPT_BASH_SESSION_ID must be 1-64 characters using letters, numbers, dot, underscore, or dash, and must start with a letter or number.");
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
  throw new Error("CODEXGPT_FILE_TRANSACTIONS must be legacy or atomic.");
}

function toolContractVersionFrom(value: string | undefined): ToolContractVersion {
  const normalized = value?.trim();
  if (!normalized || normalized === "1") return 1;
  if (normalized === "2") return 2;
  if (normalized === "3") return 3;
  if (normalized === "4") return 4;
  if (normalized === "5") return 5;
  throw new Error("CODEXGPT_TOOL_CONTRACT_VERSION must be 1, 2, 3, 4, or 5.");
}

function semanticModeFrom(value: string | undefined): SemanticMode {
  const normalized = value?.trim();
  if (!normalized || normalized === "legacy") return "legacy";
  if (normalized === "standard") return "standard";
  throw new Error("CODEXGPT_SEMANTIC_MODE must be legacy or standard.");
}

function oauthWorkspaceCapabilityModeFrom(value: string | undefined): OAuthWorkspaceCapabilityMode {
  const normalized = value?.trim();
  if (!normalized || normalized === "oauth_cross_transport") return "oauth_cross_transport";
  if (normalized === "session_local") return "session_local";
  throw new Error("CODEXGPT_OAUTH_WORKSPACE_CAPABILITY_MODE must be session_local or oauth_cross_transport.");
}

function semanticProviderFrom(value: string | undefined): SemanticProviderSelection {
  const normalized = value?.trim();
  if (!normalized || normalized === "builtin") return "builtin";
  if (normalized === "none") return "none";
  throw new Error("CODEXGPT_SEMANTIC_PROVIDER must be builtin or none in Phase 7 Core.");
}

export interface FileTransactionCapabilities {
  workspaceMutatorsAtomic: boolean;
}

export function assertFileTransactionConfiguration(
  config: Pick<CodexGPTConfig, "fileTransactions" | "writeMode">,
  capabilities: FileTransactionCapabilities
): void {
  if (
    config.fileTransactions === "atomic" &&
    config.writeMode !== "off" &&
    !capabilities.workspaceMutatorsAtomic
  ) {
    throw new Error(
      "CODEXGPT_FILE_TRANSACTIONS=atomic requires transaction-backed workspace mutators; disable writes or use legacy when the runtime cannot provide them."
    );
  }
}

function toolModeFrom(value: string | undefined): ToolMode {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return "standard";
}

function gitModeFrom(value: string | undefined): GitMode {
  if (!value) return "read";
  if (value === "read" || value === "local") return value;
  throw new Error(`Invalid Git mode: ${value}`);
}

function gitIntegrationsFrom(value: string | undefined): GitIntegrationsMode {
  if (!value) return "off";
  if (value === "off" || value === "approved_full_access") return value;
  throw new Error(`Invalid Git integrations mode: ${value}`);
}

function policyEngineModeFrom(value: string | undefined): PolicyEngineMode {
  const normalized = value?.trim();
  if (!normalized) return "legacy";
  if (normalized === "legacy" || normalized === "shadow" || normalized === "enforce") return normalized;
  throw new Error("CODEXGPT_POLICY_ENGINE must be legacy, shadow, or enforce.");
}

function localFileAccessFrom(value: string | undefined): LocalFileAccessMode {
  const normalized = value?.trim();
  if (!normalized) return "configured_roots";
  if (normalized === "configured_roots" || normalized === "confirmed_roots") return normalized;
  throw new Error("CODEXGPT_LOCAL_FILE_ACCESS must be configured_roots or confirmed_roots.");
}

function executionProfileFrom(value: string | undefined): ExecutionProfile {
  const normalized = value?.trim();
  if (!normalized) return "off";
  if (normalized === "off" || normalized === "full_access" || normalized === "workspace") return normalized;
  throw new Error("CODEXGPT_EXECUTION_PROFILE must be off, full_access, or workspace.");
}

function executionDependenciesFrom(value: string | undefined): ExecutionDependencies {
  const normalized = value?.trim();
  if (!normalized) return "off";
  if (normalized === "off" || normalized === "node_modules") return normalized;
  throw new Error("CODEXGPT_EXECUTION_DEPENDENCIES must be off or node_modules.");
}

export interface ToolContractCapabilities {
  durableAuditAvailable: boolean;
  stateRootAvailable: boolean;
  movePathsAvailable: boolean;
  stableSessionAvailable?: boolean;
  atomicStateReadersAvailable?: boolean;
  contractV3MigrationAvailable?: boolean;
  nativeHostIdentityAvailable?: boolean;
  localApprovalAvailable?: boolean;
  gitCapabilityAvailable?: boolean;
  contractV4MigrationAvailable?: boolean;
  semanticRuntimeAvailable?: boolean;
  contractV5MigrationAvailable?: boolean;
}

export function assertToolContractConfiguration(
  config: Pick<CodexGPTConfig, "fileTransactions" | "auditMode" | "policyEngineMode"> &
    Partial<Pick<CodexGPTConfig, "toolContractVersion" | "toolMode" | "connectionTest">>,
  capabilities: ToolContractCapabilities
): void {
  // Existing programmatic callers may omit the new field for one migration
  // cycle. Missing remains contract V1, matching loadConfig's default.
  if (config.toolContractVersion === undefined || config.toolContractVersion === 1) return;
  if (
    config.toolContractVersion !== 2 &&
    config.toolContractVersion !== 3 &&
    config.toolContractVersion !== 4 &&
    config.toolContractVersion !== 5
  ) {
    throw new Error("Unsupported tool contract version.");
  }
  const contractLabel = `Contract V${config.toolContractVersion}`;
  if (config.fileTransactions !== "atomic") {
    throw new Error(`${contractLabel} requires CODEXGPT_FILE_TRANSACTIONS=atomic.`);
  }
  if (!capabilities.movePathsAvailable) {
    throw new Error(`${contractLabel} is incomplete without the Phase 3D move_paths runtime.`);
  }
  if (config.auditMode === "off") {
    throw new Error(`${contractLabel} requires persistent audit; CODEXGPT_AUDIT_MODE cannot be off.`);
  }
  if (!capabilities.durableAuditAvailable) {
    throw new Error(`${contractLabel} requires an available persistent audit runtime.`);
  }
  if (!capabilities.stateRootAvailable) {
    throw new Error(`${contractLabel} requires an available Phase 3 state root.`);
  }
  const exposesInheritedV3Actions =
    (config.toolContractVersion === 3 || config.toolContractVersion === 4 || config.toolContractVersion === 5) &&
    config.connectionTest !== true &&
    config.toolMode !== "minimal";
  if (exposesInheritedV3Actions) {
    if (config.policyEngineMode !== "enforce") {
      throw new Error("Contract V3 requires Policy Kernel enforce mode.");
    }
    if (config.auditMode !== "auto" && config.auditMode !== "required") {
      throw new Error("Contract V3 requires required durable audit semantics.");
    }
    if (!capabilities.stableSessionAvailable) {
      throw new Error("Contract V3 requires a stable transport session and identity context.");
    }
    if (!capabilities.atomicStateReadersAvailable) {
      throw new Error("Contract V3 requires the Phase 3 atomic mutation and persisted-state readers.");
    }
    if (!capabilities.contractV3MigrationAvailable) {
      throw new Error("Contract V3 migration gate is not complete.");
    }
  }
  const exposesV4Actions =
    (config.toolContractVersion === 4 || config.toolContractVersion === 5) &&
    config.connectionTest !== true &&
    config.toolMode !== "minimal";
  if (exposesV4Actions) {
    if (!capabilities.nativeHostIdentityAvailable) {
      throw new Error("Contract V4 requires verified native host identity.");
    }
    if (!capabilities.localApprovalAvailable) {
      throw new Error("Contract V4 requires the local approval runtime.");
    }
    if (!capabilities.gitCapabilityAvailable) {
      throw new Error("Contract V4 requires successful Git capability evidence.");
    }
    if (!capabilities.contractV4MigrationAvailable) {
      throw new Error("Contract V4 migration gate is not complete.");
    }
  }
  const exposesV5Actions =
    config.toolContractVersion === 5 &&
    config.connectionTest !== true &&
    config.toolMode !== "minimal";
  if (exposesV5Actions) {
    if (!capabilities.semanticRuntimeAvailable) {
      throw new Error("Contract V5 requires the builtin semantic runtime.");
    }
    if (!capabilities.contractV5MigrationAvailable) {
      throw new Error("Contract V5 migration gate is not complete.");
    }
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
  throw new Error("CODEXGPT_AUDIT_MODE must be auto, off, best_effort, or required.");
}

function riskRank(riskClass: RiskClass): number {
  return Number(riskClass.slice(1));
}

export function resolveAuditRequirement(
  config: Pick<CodexGPTConfig, "auditMode" | "policyEngineMode">,
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
  config: Pick<CodexGPTConfig, "auditMode" | "policyEngineMode">,
  capabilities: AuditConfigurationCapabilities
): void {
  if (config.policyEngineMode === "enforce" && config.auditMode === "off") {
    throw new Error("CODEXGPT_AUDIT_MODE cannot be off when CODEXGPT_POLICY_ENGINE=enforce.");
  }
  if (config.auditMode === "required" && !capabilities.durableStoreAvailable) {
    throw new Error("CODEXGPT_AUDIT_MODE=required needs an available durable audit store.");
  }
}

function permissionProfileIdFrom(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error("CODEXGPT_PERMISSION_PROFILE must be 1-64 lowercase characters using letters, numbers, dot, underscore, or dash.");
  }
  return normalized;
}

function widgetDomainFrom(value: string | undefined): string {
  const raw = value?.trim() || "https://rebel0789.github.io";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`CODEXGPT_WIDGET_DOMAIN must be a valid origin URL, got: ${raw}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error("CODEXGPT_WIDGET_DOMAIN must use https.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("CODEXGPT_WIDGET_DOMAIN must be an origin only, for example https://widgets.example.com.");
  }
  return parsed.origin;
}

function contextDirFrom(value: string | undefined): string {
  const raw = (value?.trim() || ".ai-bridge").replaceAll("\\", "/");
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error("CODEXGPT_CONTEXT_DIR must be a workspace-relative hidden directory, for example .ai-bridge.");
  }

  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("CODEXGPT_CONTEXT_DIR must stay inside the workspace.");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("CODEXGPT_CONTEXT_DIR must be a simple relative directory path.");
  }
  if (!parts[0].startsWith(".")) {
    throw new Error("CODEXGPT_CONTEXT_DIR must start with a hidden directory such as .ai-bridge.");
  }

  const blocked = new Set([".git", ".ssh", ".gnupg", ".cache", "node_modules", "src", "dist", "build", ".next", "coverage"]);
  if (parts.some((part) => blocked.has(part))) {
    throw new Error("CODEXGPT_CONTEXT_DIR cannot point at source, dependency, build, cache, or credential directories.");
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
  if (!raw) throw new Error("CODEXGPT_ALLOWED_HOSTS contains an empty host.");
  if (raw.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`CODEXGPT_ALLOWED_HOSTS contains an invalid host: ${value}`);
    }
    raw = parsed.hostname.toLowerCase();
  }
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  const portSeparator = raw.lastIndexOf(":");
  if (portSeparator > 0 && raw.indexOf(":") === portSeparator && /^\d+$/.test(raw.slice(portSeparator + 1))) {
    raw = raw.slice(0, portSeparator);
  }
  if (!raw || raw === "*" || /[\\/\s]/.test(raw)) {
    throw new Error(`CODEXGPT_ALLOWED_HOSTS contains an invalid host: ${value}`);
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
      throw new Error(`CODEXGPT_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error(`CODEXGPT_ALLOWED_ORIGINS must contain HTTP(S) origins only: ${origin}`);
    }
    return parsed.origin;
  }))];
}

export function loadConfig(
  argv = process.argv.slice(2),
  options: ConfigLoadOptions = {}
): CodexGPTConfig {
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const environmentInput = options.environment ?? process.env;
  const bootstrap = resolveConfigBootstrap({
    argv,
    environment: environmentInput,
    cwd,
    platform,
    filesystemPlatform: options.filesystemPlatform ?? process.platform
  });
  const environment = environmentSnapshot(environmentInput, platform);
  const args = parseArgs(argv);

  const rootFromArgs = bootstrap.origins.get("root")?.kind === "cli"
    ? bootstrap.effective.rootInput
    : undefined;
  const defaultRoot = toRealDir(bootstrap.effective.rootInput, cwd);
  const workspaceProfile = bootstrap.effective.noProfile
    ? {}
    : options.workspaceProfile ?? (options.profileLoader
      ? options.profileLoader(defaultRoot)
      : readWorkspaceProfile(defaultRoot, environment, cwd));
  const resolvedAuthMode = resolveHttpAuthMode({
    currentProcess: environment.CODEXGPT_AUTH_MODE,
    persistedUser: options.persistedUserAuthMode,
    profile: workspaceProfile.authMode,
    profileFile: workspaceProfile.profilePath
  });

  const allowRootArgs = Array.isArray(args["allow-root"])
    ? args["allow-root"]
    : typeof args["allow-root"] === "string"
      ? [args["allow-root"]]
      : [];
  const envAllowedRoots = [
    ...splitRoots(environment.CODEXGPT_ALLOWED_ROOTS),
    ...splitRoots(environment.CODEBASE_BRIDGE_ALLOWED_ROOTS)
  ];

  const allowHome = environment.CODEXGPT_ALLOW_HOME === "1" || args["allow-home"] === true;
  const requestedAllowed = [defaultRoot, ...allowRootArgs, ...envAllowedRoots, ...(allowHome ? [os.homedir()] : [])];
  const allowedRoots = [...new Set(requestedAllowed.map((root) => toRealDir(root, cwd)))];

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
    throw new Error("--tool-contract-version requires a value of 1, 2, 3, 4, or 5.");
  }
  const toolContractVersionArg = typeof args["tool-contract-version"] === "string"
    ? args["tool-contract-version"]
    : undefined;
  const toolModeArg = typeof args["tool-mode"] === "string" ? args["tool-mode"] : undefined;
  const toolMode = toolModeFrom(toolModeArg ?? environment.CODEXGPT_TOOL_MODE);
  const guidanceModeInput = environment.CODEXGPT_GUIDANCE_MODE;
  const guidanceMode = guidanceModeInput === undefined && toolMode === "minimal"
    ? "legacy"
    : resolveGuidanceMode(guidanceModeInput);
  const semanticMode = semanticModeFrom(environment.CODEXGPT_SEMANTIC_MODE);
  const explicitToolContractVersion = toolContractVersionArg ?? environment.CODEXGPT_TOOL_CONTRACT_VERSION;
  if (semanticMode === "standard" && explicitToolContractVersion !== undefined && explicitToolContractVersion.trim() !== "5") {
    throw new Error("CODEXGPT_SEMANTIC_MODE=standard contradicts an explicit tool contract other than V5.");
  }
  if (semanticMode === "legacy" && explicitToolContractVersion?.trim() === "5") {
    throw new Error("CODEXGPT_TOOL_CONTRACT_VERSION=5 requires CODEXGPT_SEMANTIC_MODE=standard.");
  }
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
  const extraBlockedGlobs = splitList(environment.CODEXGPT_BLOCKED_GLOBS, ",");
  const host = hostArg ?? environment.CODEXGPT_HOST ?? environment.HOST ?? "127.0.0.1";
  const authToken = environment.CODEXGPT_HTTP_TOKEN ?? environment.CODEBASE_BRIDGE_HTTP_TOKEN;
  const allowNoToken = boolFrom(environment.CODEXGPT_ALLOW_NO_HTTP_TOKEN, false) && isLoopbackHost(host);
  const requireHttpToken =
    (!authToken && !allowNoToken) ||
    boolFrom(environment.CODEXGPT_REQUIRE_HTTP_TOKEN, false) ||
    boolFrom(environment.CODEXGPT_TUNNEL_MODE, false) ||
    (!isLoopbackHost(host) && !allowNoToken);
  const allowedHostHints = [
    environment.CODEXGPT_ALLOWED_HOSTS,
    environment.CODEXGPT_PUBLIC_HOSTNAME,
    environment.CODEXGPT_HOSTNAME,
    environment.NGROK_DOMAIN
  ].filter((value): value is string => Boolean(value));
  const allowedHosts = allowedHostsFrom(allowedHostHints.join(","), host);
  const allowedOrigins = allowedOriginsFrom(environment.CODEXGPT_ALLOWED_ORIGINS);
  const allowQueryToken = boolFrom(environment.CODEXGPT_ALLOW_QUERY_TOKEN, false);
  assertHttpAuthModeCompatibility({
    mode: resolvedAuthMode.mode,
    allowQueryToken,
    allowNoHttpToken: allowNoToken,
    legacyTokenPresent: Boolean(authToken)
  });
  let oauthDeployment: Readonly<OAuthDeploymentConfiguration> | undefined;
  if (resolvedAuthMode.mode === "oauth") {
    resolveOAuthRootSelection({
      explicitRoot: rootFromArgs ? defaultRoot : undefined,
      currentDirectory: toRealDir(cwd, cwd),
      matchingProfileRoot: workspaceProfile.root,
      platform
    });
    oauthDeployment = resolveOAuthDeploymentConfiguration({
      canonicalRoot: defaultRoot,
      profileId: profileIdForRoot(defaultRoot),
      hostname: workspaceProfile.hostname ?? "",
      issuer: workspaceProfile.oauthIssuer,
      resource: workspaceProfile.oauthResource,
      platform,
      tunnel: workspaceProfile.tunnel ?? "",
      tunnelName: workspaceProfile.tunnelName ?? "",
      tunnelOwner: workspaceProfile.tunnelOwner ?? "",
      publicHost: host,
      publicPort: strictNumberFrom(
        "OAuth public port",
        portArg ?? environment.CODEXGPT_PORT ?? environment.PORT ?? workspaceProfile.port,
        8787,
        1,
        65535
      ),
      localAdminHost: "127.0.0.1",
      localAdminPort: strictNumberFrom(
        "OAuth local-admin port",
        workspaceProfile.localAdminPort,
        8788,
        1,
        65535
      )
    });
  }
  const bashSessionId = bashSessionIdFrom(bashSessionArg ?? environment.CODEXGPT_BASH_SESSION_ID);
  const requireBashSession = boolFrom(requireBashSessionArg ?? environment.CODEXGPT_REQUIRE_BASH_SESSION, false);
  if (requireBashSession && !bashSessionId) {
    throw new Error("CODEXGPT_REQUIRE_BASH_SESSION requires CODEXGPT_BASH_SESSION_ID or --bash-session.");
  }

  const config: CodexGPTConfig = {
    defaultRoot,
    allowedRoots,
    host,
    port: numberFrom(portArg ?? environment.CODEXGPT_PORT ?? environment.PORT, 8787, 1, 65535),
    widgetDomain: widgetDomainFrom(widgetDomainArg ?? environment.CODEXGPT_WIDGET_DOMAIN),
    authMode: resolvedAuthMode.mode,
    authModeSource: resolvedAuthMode.source,
    authToken,
    requireHttpToken,
    allowedHosts,
    allowedOrigins,
    allowQueryToken,
    bashMode: bashModeFrom(bashArg ?? environment.CODEXGPT_BASH_MODE),
    bashTranscript: bashTranscriptFrom(bashTranscriptArg ?? environment.CODEXGPT_BASH_TRANSCRIPT),
    bashSessionId,
    requireBashSession,
    codexSessions: codexSessionsFrom(codexSessionsArg ?? environment.CODEXGPT_CODEX_SESSIONS),
    codexDir: toCanonicalPath(codexDirArg || environment.CODEXGPT_CODEX_DIR || path.join(os.homedir(), ".codex"), cwd),
    writeMode: writeModeFrom(writeArg ?? environment.CODEXGPT_WRITE_MODE),
    fileTransactions: fileTransactionModeFrom(
      fileTransactionsArg ?? environment.CODEXGPT_FILE_TRANSACTIONS
    ),
    toolContractVersion: toolContractVersionFrom(
      semanticMode === "standard" ? "5" : explicitToolContractVersion
    ),
    toolMode,
    policyEngineMode: policyEngineModeFrom(policyEngineArg ?? environment.CODEXGPT_POLICY_ENGINE),
    auditMode: auditModeFrom(auditModeArg ?? environment.CODEXGPT_AUDIT_MODE),
    auditRetention: {
      maxAgeDays: numberFrom(environment.CODEXGPT_AUDIT_RETENTION_DAYS, 30, 1, 365),
      maxClosedBytes: numberFrom(
        environment.CODEXGPT_AUDIT_RETENTION_BYTES,
        100 * 1024 * 1024,
        1024 * 1024,
        2 * 1024 * 1024 * 1024
      )
    },
    changeSetRetention: {
      maxPlaintextBytesPerChangeSet: strictNumberFrom(
        "CODEXGPT_CHANGE_SET_MAX_PLAINTEXT_BYTES",
        environment.CODEXGPT_CHANGE_SET_MAX_PLAINTEXT_BYTES,
        8 * 1024 * 1024,
        1024,
        64 * 1024 * 1024
      ),
      maxInstallationCiphertextBytes: strictNumberFrom(
        "CODEXGPT_CHANGE_SET_MAX_INSTALLATION_BYTES",
        environment.CODEXGPT_CHANGE_SET_MAX_INSTALLATION_BYTES,
        128 * 1024 * 1024,
        1024 * 1024,
        2 * 1024 * 1024 * 1024
      ),
      maxActivePerWorkspace: strictNumberFrom(
        "CODEXGPT_CHANGE_SET_MAX_ACTIVE_PER_WORKSPACE",
        environment.CODEXGPT_CHANGE_SET_MAX_ACTIVE_PER_WORKSPACE,
        20,
        1,
        1000
      ),
      activeRetentionMs: strictNumberFrom(
        "CODEXGPT_CHANGE_SET_RETENTION_MS",
        environment.CODEXGPT_CHANGE_SET_RETENTION_MS,
        24 * 60 * 60_000,
        60_000,
        30 * 24 * 60 * 60_000
      ),
      tombstoneRetentionMs: strictNumberFrom(
        "CODEXGPT_CHANGE_SET_TOMBSTONE_RETENTION_MS",
        environment.CODEXGPT_CHANGE_SET_TOMBSTONE_RETENTION_MS,
        30 * 24 * 60 * 60_000,
        24 * 60 * 60_000,
        365 * 24 * 60 * 60_000
      )
    },
    permissionProfileId: permissionProfileIdFrom(permissionProfileArg ?? environment.CODEXGPT_PERMISSION_PROFILE),
    localFileAccess: localFileAccessFrom(environment.CODEXGPT_LOCAL_FILE_ACCESS),
    executionProfile: executionProfileFrom(environment.CODEXGPT_EXECUTION_PROFILE),
    executionDependencies: executionDependenciesFrom(environment.CODEXGPT_EXECUTION_DEPENDENCIES),
    gitMode: gitModeFrom(environment.CODEXGPT_GIT_MODE),
    gitIntegrations: gitIntegrationsFrom(environment.CODEXGPT_GIT_INTEGRATIONS),
    taskWorktreeRoot: path.resolve(
      cwd,
      environment.CODEXGPT_TASK_WORKTREE_ROOT ??
      path.join(environment.LOCALAPPDATA ?? os.homedir(), "CodexGPT", "worktrees")
    ),
    taskWorktreeMaxCount: numberFrom(environment.CODEXGPT_TASK_WORKTREE_MAX_COUNT, 32, 1, 128),
    taskWorktreeMaxFiles: numberFrom(environment.CODEXGPT_TASK_WORKTREE_MAX_FILES, 100_000, 1, 1_000_000),
    taskWorktreeMaxBytes: numberFrom(
      environment.CODEXGPT_TASK_WORKTREE_MAX_BYTES,
      2 * 1024 * 1024 * 1024,
      1024 * 1024,
      16 * 1024 * 1024 * 1024
    ),
    inheritEnv: environment.CODEXGPT_INHERIT_ENV === "1",
    maxReadBytes: numberFrom(environment.CODEXGPT_MAX_READ_BYTES, 250_000, 4_000, 2_000_000),
    maxWriteBytes: numberFrom(environment.CODEXGPT_MAX_WRITE_BYTES, 1_000_000, 1_000, 10_000_000),
    moveMaxFileBytes: strictNumberFrom(
      "CODEXGPT_MOVE_MAX_FILE_BYTES",
      environment.CODEXGPT_MOVE_MAX_FILE_BYTES,
      64 * 1024 * 1024,
      1,
      1024 * 1024 * 1024
    ),
    moveMaxTotalBytes: strictNumberFrom(
      "CODEXGPT_MOVE_MAX_TOTAL_BYTES",
      environment.CODEXGPT_MOVE_MAX_TOTAL_BYTES,
      256 * 1024 * 1024,
      1,
      4 * 1024 * 1024 * 1024
    ),
    moveHashConcurrency: strictNumberFrom(
      "CODEXGPT_MOVE_HASH_CONCURRENCY",
      environment.CODEXGPT_MOVE_HASH_CONCURRENCY,
      4,
      1,
      16
    ),
    maxOutputBytes: numberFrom(environment.CODEXGPT_MAX_OUTPUT_BYTES, 120_000, 4_000, 2_000_000),
    maxSearchResults: numberFrom(environment.CODEXGPT_MAX_SEARCH_RESULTS, 200, 5, 2_000),
    maxHttpSessions: numberFrom(environment.CODEXGPT_MAX_HTTP_SESSIONS, 64, 1, 512),
    httpSessionTtlMs: numberFrom(environment.CODEXGPT_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    workspaceTtlMs: numberFrom(
      environment.CODEXGPT_WORKSPACE_TTL_MS,
      numberFrom(environment.CODEXGPT_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
      60_000,
      24 * 60 * 60_000
    ),
    oauthWorkspaceCapabilityMode: oauthWorkspaceCapabilityModeFrom(
      environment.CODEXGPT_OAUTH_WORKSPACE_CAPABILITY_MODE
    ),
    blockedGlobs: [...DEFAULT_BLOCKED_GLOBS, ...extraBlockedGlobs],
    contextDir: contextDirFrom(environment.CODEXGPT_CONTEXT_DIR),
    toolCards: boolFrom(toolCardsArg ?? environment.CODEXGPT_TOOL_CARDS, false),
    connectionTest: boolFrom(environment.CODEXGPT_CONNECTION_TEST, false),
    analysisEnabled: boolFrom(environment.CODEXGPT_ANALYSIS, true),
    analysisLimits: {
      maxInventoryFiles: numberFrom(environment.CODEXGPT_ANALYSIS_MAX_INVENTORY_FILES, DEFAULT_ANALYSIS_LIMITS.maxInventoryFiles, 100, 100_000),
      maxAnalyzedFiles: numberFrom(environment.CODEXGPT_ANALYSIS_MAX_ANALYZED_FILES, DEFAULT_ANALYSIS_LIMITS.maxAnalyzedFiles, 10, 50_000),
      maxScannedBytes: numberFrom(environment.CODEXGPT_ANALYSIS_MAX_SCANNED_BYTES, DEFAULT_ANALYSIS_LIMITS.maxScannedBytes, 1_000_000, 512 * 1024 * 1024),
      maxSymbols: numberFrom(environment.CODEXGPT_ANALYSIS_MAX_SYMBOLS, DEFAULT_ANALYSIS_LIMITS.maxSymbols, 100, 1_000_000),
      maxRelationships: numberFrom(environment.CODEXGPT_ANALYSIS_MAX_RELATIONSHIPS, DEFAULT_ANALYSIS_LIMITS.maxRelationships, 100, 2_000_000)
    },
    guidanceMode,
    semanticMode,
    semanticProvider: semanticMode === "standard"
      ? semanticProviderFrom(environment.CODEXGPT_SEMANTIC_PROVIDER)
      : "builtin",
    instructionFallbacks: instructionFallbacksFrom(environment.CODEXGPT_INSTRUCTION_FALLBACKS),
    maxInstructionTotalBytes: numberFrom(environment.CODEXGPT_MAX_INSTRUCTION_TOTAL_BYTES, 32_768, 1_000, 200_000),
    maxSkillCandidates: numberFrom(environment.CODEXGPT_MAX_SKILL_CANDIDATES, 1_000, 1, 10_000),
    maxSkillCatalogChars: numberFrom(environment.CODEXGPT_MAX_SKILL_CATALOG_CHARS, 8_000, 1_000, 32_000),
    transactionStateRoot:
      platform === "win32" &&
      !environment.CODEXGPT_HOME?.trim() &&
      !environment.LOCALAPPDATA?.trim()
        ? null
        : resolveTransactionStateRoot({
            platform,
            env: {
              CODEXGPT_HOME: environment.CODEXGPT_HOME,
              LOCALAPPDATA: environment.LOCALAPPDATA,
              XDG_STATE_HOME: environment.XDG_STATE_HOME
            },
            homeDir: options.homeDir ?? os.homedir()
          }),
    logRequests: environment.CODEXGPT_LOG_REQUESTS === "1",
    logToolCalls:
      environment.CODEXGPT_LOG_TOOL_CALLS === "1" ||
      environment.CODEXGPT_LOG_REQUESTS === "1",
    oauthDeployment
  };
  if (
    config.toolContractVersion !== 3 &&
    config.toolContractVersion !== 4 &&
    config.toolContractVersion !== 5 &&
    (
      config.localFileAccess !== "configured_roots" ||
      config.executionProfile !== "off" ||
      config.executionDependencies !== "off"
    )
  ) {
    throw new Error("Contract V3 is required for confirmed roots, execution profiles, or execution dependency views.");
  }
  if (config.guidanceMode === "standard" && config.toolMode === "minimal") {
    throw new Error("CODEXGPT_GUIDANCE_MODE=standard requires CODEXGPT_TOOL_MODE=standard or full.");
  }
  if (
    config.toolContractVersion !== 4 &&
    config.toolContractVersion !== 5 &&
    (config.gitMode !== "read" || config.gitIntegrations !== "off")
  ) {
    throw new Error("Contract V4 is required for local Git mutations or repository integrations.");
  }
  if (config.gitIntegrations === "approved_full_access" && config.gitMode !== "local") {
    throw new Error("Approved Git integrations require local Git mutation mode.");
  }
  if (config.gitIntegrations === "approved_full_access" && config.executionProfile !== "full_access") {
    throw new Error("Approved Git integrations require the explicit full_access execution profile.");
  }
  if (config.semanticMode === "standard" && config.toolMode === "minimal") {
    throw new Error("CODEXGPT_SEMANTIC_MODE=standard requires CODEXGPT_TOOL_MODE=standard or full.");
  }
  assertAuditConfiguration(config, { durableStoreAvailable: true });
  return config;
}

function freezeConfigValue<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("Effective configuration must not contain cycles.");
  seen.add(value);
  for (const nested of Object.values(value)) freezeConfigValue(nested, seen);
  seen.delete(value);
  return Object.freeze(value);
}

function publicConfigProjection(config: CodexGPTConfig): Readonly<Record<string, unknown>> {
  const projection: Record<string, unknown> = {};
  for (const key of Object.keys(config).sort()) {
    projection[key] = key === "authToken"
      ? config.authToken ? "set" : "missing"
      : config[key as keyof CodexGPTConfig];
  }
  return freezeConfigValue(projection);
}

function canonicalConfigValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Effective configuration contains a non-finite number.");
    return ["number", Object.is(value, -0) ? "-0" : value];
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new Error("Effective configuration contains an unsupported or cyclic value.");
  }
  seen.add(value);
  const encoded = Array.isArray(value)
    ? ["array", value.map((item) => canonicalConfigValue(item, seen))]
    : [
        "object",
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((key) => [key, canonicalConfigValue((value as Record<string, unknown>)[key], seen)])
      ];
  seen.delete(value);
  return encoded;
}

export function loadResolvedConfig(
  argv = process.argv.slice(2),
  options: ConfigLoadOptions = {}
): EffectiveConfigSnapshot {
  const effective = freezeConfigValue(loadConfig(argv, options));
  const publicProjection = publicConfigProjection(effective);
  const publicFingerprint = createHash("sha256")
    .update(JSON.stringify(["codexgpt-effective-config-v1", canonicalConfigValue(publicProjection)]))
    .digest("hex");
  const publicJson = Object.freeze({ effective: publicProjection, publicFingerprint });
  const exactEncoding = JSON.stringify([
    "codexgpt-effective-config-integrity-v1",
    canonicalConfigValue(effective)
  ]);
  const integrityProof = (key: string): string => {
    if (!/^[a-f0-9]{64}$/u.test(key)) {
      throw new ConfigFingerprintError(
        "CONFIG_INTEGRITY_INVALID",
        "Stop the foreground server, then rerun the same codexgpt start command.",
        "The launcher supplied an invalid configuration integrity key."
      );
    }
    return createHmac("sha256", Buffer.from(key, "hex")).update(exactEncoding).digest("hex");
  };
  const snapshot = {
    effective,
    publicFingerprint,
    integrityProof,
    toJSON: () => publicJson,
    [inspect.custom]: () => publicJson
  };
  return Object.freeze(snapshot);
}

export function assertExpectedConfigFingerprint(
  snapshot: EffectiveConfigSnapshot,
  expected: string | undefined,
  root = snapshot.effective.defaultRoot
): void {
  if (expected === undefined || expected === "") return;
  void root;
  const restart = "Stop the foreground server, then rerun the same codexgpt start command.";
  if (!/^[a-f0-9]{64}$/u.test(expected)) {
    throw new ConfigFingerprintError(
      "CONFIG_FINGERPRINT_INVALID",
      restart,
      `The launcher supplied an invalid configuration fingerprint. ${restart}`
    );
  }
  if (snapshot.publicFingerprint !== expected) {
    throw new ConfigFingerprintError(
      "CONFIG_FINGERPRINT_MISMATCH",
      restart,
      `The server resolved a different effective configuration than its launcher. ${restart}`
    );
  }
}

export function assertExpectedConfigIntegrity(
  snapshot: EffectiveConfigSnapshot,
  expected: string | undefined,
  key: string | undefined
): void {
  if ((expected === undefined || expected === "") && (key === undefined || key === "")) return;
  const restart = "Stop the foreground server, then rerun the same codexgpt start command.";
  if (!/^[a-f0-9]{64}$/u.test(expected ?? "") || !/^[a-f0-9]{64}$/u.test(key ?? "")) {
    throw new ConfigFingerprintError(
      "CONFIG_INTEGRITY_INVALID",
      restart,
      `The launcher supplied an invalid configuration integrity proof. ${restart}`
    );
  }
  const actual = snapshot.integrityProof(key!);
  if (!timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected!, "hex"))) {
    throw new ConfigFingerprintError(
      "CONFIG_INTEGRITY_MISMATCH",
      restart,
      `The server resolved a different complete effective configuration than its launcher. ${restart}`
    );
  }
}

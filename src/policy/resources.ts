import { createHash } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { domainToASCII } from "node:url";
import type { PathGuard, Workspace } from "../guard.js";
import {
  filesystemResourceV1Schema,
  gitResourceV1Schema,
  networkResourceV1Schema,
  processResourceV1Schema,
  shellResourceV1Schema
} from "./schemas.js";
import type {
  FilesystemResourceV1,
  GitResourceV1,
  NetworkAddressClass,
  NetworkResourceV1,
  ProcessResourceV1,
  ShellResourceV1
} from "./types.js";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "resourceFingerprint")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function fingerprintResource(value: unknown): string {
  const serialized = JSON.stringify(stableValue(value));
  return `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`;
}

function normalizedRelativePath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/")).normalize("NFC");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export interface DescribeFilesystemInput {
  platform?: NodeJS.Platform;
  workspace: Workspace;
  guard: PathGuard;
  operation: FilesystemResourceV1["operation"];
  inputPath: string;
}

export function describeFilesystemResource(input: DescribeFilesystemInput): FilesystemResourceV1 {
  const forWrite = input.operation === "write" || input.operation === "delete" || input.operation === "move";
  const facts = input.guard.resolvePolicyFacts(input.workspace, input.inputPath, { forWrite });
  const comparisonKey = normalizedRelativePath(facts.relPath, input.platform ?? process.platform);
  const base = {
    schemaVersion: 1 as const,
    kind: "filesystem" as const,
    operation: input.operation,
    workspaceId: input.workspace.id,
    relativePath: facts.relPath,
    comparisonKey,
    targetExists: facts.targetExists,
    containment: "inside" as const,
    existingParentIdentity: facts.existingParentIdentity,
    unresolvedSuffix: facts.unresolvedSuffix
  };
  return filesystemResourceV1Schema.parse({ ...base, resourceFingerprint: fingerprintResource(base) });
}

export interface DescribeGitInput {
  workspaceId: string;
  operation: GitResourceV1["operation"];
  repositoryKey: string;
  relativePaths?: string[];
  refs?: string[];
  remoteName?: string | null;
  remoteHost?: string | null;
  platform?: NodeJS.Platform;
}

export function describeGitResource(input: DescribeGitInput): GitResourceV1 {
  const platform = input.platform ?? process.platform;
  const base = {
    schemaVersion: 1 as const,
    kind: "git" as const,
    operation: input.operation,
    workspaceId: input.workspaceId,
    repositoryKey: input.repositoryKey,
    relativePaths: (input.relativePaths ?? []).map((value) => normalizedRelativePath(value, platform)),
    refs: [...(input.refs ?? [])],
    remoteName: input.remoteName ?? null,
    remoteHost: input.remoteHost ? normalizeNetworkHost(input.remoteHost) : null
  };
  return gitResourceV1Schema.parse({ ...base, resourceFingerprint: fingerprintResource(base) });
}

export interface DescribeShellInput {
  workspaceId: string;
  operation: ShellResourceV1["operation"];
  backend: ShellResourceV1["backend"];
  cwd: string;
  commandKind: ShellResourceV1["commandKind"];
  command: string;
  executable: string | null;
  argumentCount: number;
  persistence: boolean;
  requestedNetwork: boolean;
  platform?: NodeJS.Platform;
}

export function describeShellResource(input: DescribeShellInput): ShellResourceV1 {
  const commandDigest = `sha256:${createHash("sha256").update(input.command, "utf8").digest("hex")}`;
  const base = {
    schemaVersion: 1 as const,
    kind: "shell" as const,
    operation: input.operation,
    workspaceId: input.workspaceId,
    backend: input.backend,
    cwd: normalizedRelativePath(input.cwd, input.platform ?? process.platform),
    commandKind: input.commandKind,
    executable: input.executable,
    argumentCount: input.argumentCount,
    commandDigest,
    persistence: input.persistence,
    requestedNetwork: input.requestedNetwork
  };
  return shellResourceV1Schema.parse({ ...base, resourceFingerprint: fingerprintResource(base) });
}

export interface DescribeProcessInput {
  operation: ProcessResourceV1["operation"];
  workspaceId: string | null;
  processId: string | null;
  persistence: boolean;
  executable: string | null;
}

export function describeProcessResource(input: DescribeProcessInput): ProcessResourceV1 {
  const executableDigest = input.executable === null
    ? null
    : `sha256:${createHash("sha256").update(input.executable, "utf8").digest("hex")}`;
  const base = {
    schemaVersion: 1 as const,
    kind: "process" as const,
    operation: input.operation,
    workspaceId: input.workspaceId,
    processId: input.processId,
    persistence: input.persistence,
    executableDigest
  };
  return processResourceV1Schema.parse({ ...base, resourceFingerprint: fingerprintResource(base) });
}

function normalizeDnsName(value: string): string {
  const ascii = domainToASCII(value.toLocaleLowerCase("en-US"));
  if (!ascii || ascii.length > 253 || ascii.includes("..")) {
    throw new Error("Network host is invalid.");
  }
  const labels = ascii.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("Network host is invalid.");
  }
  return ascii;
}

export function normalizeNetworkHost(input: string): string {
  let raw = input.trim();
  if (!raw || raw.includes("/") || raw.includes("\\") || /\s/.test(raw)) {
    throw new Error("Network host is invalid.");
  }
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  if (raw.endsWith(".")) raw = raw.slice(0, -1);
  if (!raw) throw new Error("Network host is invalid.");

  if (net.isIP(raw)) return raw.toLocaleLowerCase("en-US");
  const wildcard = raw.startsWith("**.") ? "**." : raw.startsWith("*.") ? "*." : "";
  const suffix = wildcard ? raw.slice(wildcard.length) : raw;
  if (suffix.includes("*") || raw.includes(":") || suffix.includes("/")) {
    throw new Error("Network host wildcard is invalid.");
  }
  return `${wildcard}${normalizeDnsName(suffix)}`;
}

function classifyIpv4(address: string): NetworkAddressClass {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (a === 127) return "loopback";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 169 && b === 254) return "link_local";
  if (a >= 224 && a <= 239) return "multicast";
  if (a === 0) return "unspecified";
  if (
    a >= 240 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  ) return "reserved";
  return "public";
}

export function classifyNetworkAddress(address: string): NetworkAddressClass {
  const kind = net.isIP(address);
  if (kind === 4) return classifyIpv4(address);
  if (kind !== 6) throw new Error("Resolved network address is invalid.");
  const normalized = address.toLocaleLowerCase("en-US");
  if (normalized === "::1") return "loopback";
  if (normalized === "::") return "unspecified";
  if (/^f[cd]/.test(normalized)) return "private";
  if (/^fe[89ab]/.test(normalized)) return "link_local";
  if (normalized.startsWith("ff")) return "multicast";
  if (normalized.startsWith("2001:db8:")) return "reserved";
  if (normalized.startsWith("::ffff:")) {
    const ipv4 = normalized.slice("::ffff:".length);
    if (net.isIP(ipv4) === 4) return classifyIpv4(ipv4);
  }
  return "public";
}

export interface DescribeNetworkInput {
  operation: NetworkResourceV1["operation"];
  workspaceId: string | null;
  scheme: NetworkResourceV1["scheme"];
  host: string;
  port: number;
  resolvedAddresses?: string[];
}

export function describeNetworkResource(input: DescribeNetworkInput): NetworkResourceV1 {
  const host = normalizeNetworkHost(input.host);
  if (host.startsWith("*")) throw new Error("Concrete network resources cannot use wildcard hosts.");
  const ipKind = net.isIP(host);
  const resolvedAddresses = [...new Set(input.resolvedAddresses ?? (ipKind ? [host] : []))];
  for (const address of resolvedAddresses) {
    if (!net.isIP(address)) throw new Error("Resolved network address is invalid.");
  }
  const addressClasses = [...new Set(resolvedAddresses.map(classifyNetworkAddress))];
  const base = {
    schemaVersion: 1 as const,
    kind: "network" as const,
    operation: input.operation,
    workspaceId: input.workspaceId,
    scheme: input.scheme,
    host,
    port: input.port,
    hostKind: ipKind === 4 ? "ipv4" as const : ipKind === 6 ? "ipv6" as const : "dns" as const,
    resolvedAddresses,
    addressClasses
  };
  return networkResourceV1Schema.parse({ ...base, resourceFingerprint: fingerprintResource(base) });
}

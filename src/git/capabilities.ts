import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

export interface GitExecutableBinding {
  schemaVersion: 1;
  realPath: string;
  sha256: string;
  identity: string;
  dev: string;
  ino: string;
  size: string;
  mtimeNs: string;
}

export interface GitCapabilityEvidence {
  schemaVersion: 1;
  executable: GitExecutableBinding;
  version: string;
  capabilityRevision: string;
  executionIsolation: "none";
  repositoryIntegrations: "disabled";
}

const issuedCapabilityEvidence = new WeakSet<object>();

function gitError(code: string): Error {
  return new Error(code);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  return platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

export function enumerateGitExecutableCandidates(options: {
  platform?: NodeJS.Platform;
  programFiles?: string;
} = {}): readonly string[] {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const systemDrive = path.win32.parse(process.execPath).root.replace(/[\\/]$/, "") || "C:";
    const programFiles = path.win32.resolve(options.programFiles ?? `${systemDrive}\\Program Files`);
    return Object.freeze([
      path.win32.join(programFiles, "Git", "cmd", "git.exe"),
      path.win32.join(programFiles, "Git", "bin", "git.exe")
    ]);
  }
  return Object.freeze(["/usr/bin/git", "/usr/local/bin/git"]);
}

export async function bindGitExecutable(executablePath: string): Promise<GitExecutableBinding> {
  if (typeof executablePath !== "string" || executablePath.includes("\0") || !path.isAbsolute(executablePath)) {
    throw gitError("GIT_EXECUTABLE_INVALID");
  }
  let handle: fsp.FileHandle;
  try {
    handle = await fsp.open(executablePath, "r");
  } catch {
    throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  }
  try {
    const [stat, content, realPath] = await Promise.all([
      handle.stat({ bigint: true }),
      handle.readFile(),
      fsp.realpath(executablePath)
    ]);
    if (!stat.isFile()) throw gitError("GIT_EXECUTABLE_INVALID");
    const digest = sha256(content);
    return Object.freeze({
      schemaVersion: 1,
      realPath,
      sha256: digest,
      identity: `sha256:${digest}:dev:${stat.dev.toString()}:ino:${stat.ino.toString()}`,
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
      size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString()
    });
  } finally {
    await handle.close();
  }
}

export async function verifyGitExecutableBinding(
  binding: GitExecutableBinding,
  platform: NodeJS.Platform = process.platform
): Promise<GitExecutableBinding> {
  const current = await bindGitExecutable(binding.realPath).catch(() => {
    throw gitError("GIT_EXECUTABLE_CHANGED");
  });
  if (
    !samePath(current.realPath, binding.realPath, platform) ||
    current.sha256 !== binding.sha256 ||
    current.dev !== binding.dev ||
    current.ino !== binding.ino ||
    current.size !== binding.size
  ) throw gitError("GIT_EXECUTABLE_CHANGED");
  return current;
}

export async function resolveGitExecutable(options: {
  explicitPath?: string;
  platform?: NodeJS.Platform;
  programFiles?: string;
} = {}): Promise<GitExecutableBinding> {
  if (options.explicitPath) return bindGitExecutable(options.explicitPath);
  for (const candidate of enumerateGitExecutableCandidates(options)) {
    try {
      return await bindGitExecutable(candidate);
    } catch (error) {
      if ((error as Error).message !== "GIT_CAPABILITY_UNAVAILABLE") throw error;
    }
  }
  throw gitError("GIT_CAPABILITY_UNAVAILABLE");
}

export function assertGitCapabilityEvidence(value: unknown): GitCapabilityEvidence {
  const evidence = value as Partial<GitCapabilityEvidence>;
  const executable = evidence?.executable as Partial<GitExecutableBinding> | undefined;
  if (
    !evidence || typeof evidence !== "object" || !issuedCapabilityEvidence.has(evidence as object) ||
    evidence.schemaVersion !== 1 || evidence.executionIsolation !== "none" ||
    evidence.repositoryIntegrations !== "disabled" ||
    typeof evidence.version !== "string" || !/^git version \d+\.\d+\.\d+(?:\.[A-Za-z0-9.-]+)?$/.test(evidence.version) ||
    typeof evidence.capabilityRevision !== "string" || !/^[a-f0-9]{64}$/.test(evidence.capabilityRevision) ||
    !executable || executable.schemaVersion !== 1 || typeof executable.realPath !== "string" ||
    typeof executable.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(executable.sha256) ||
    typeof executable.identity !== "string" || typeof executable.dev !== "string" ||
    typeof executable.ino !== "string" || typeof executable.size !== "string" ||
    typeof executable.mtimeNs !== "string"
  ) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  return evidence as GitCapabilityEvidence;
}

export function createGitCapabilityEvidence(input: {
  executable: GitExecutableBinding;
  version: string;
  hostManifestRevision: string;
  implementationRevision: string;
}): GitCapabilityEvidence {
  if (
    !/^git version \d+\.\d+\.\d+(?:\.[A-Za-z0-9.-]+)?$/.test(input.version) ||
    !/^[a-f0-9]{64}$/.test(input.hostManifestRevision) ||
    !/^[a-f0-9]{64}$/.test(input.implementationRevision)
  ) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  const capabilityRevision = sha256(stableJson({
    schemaVersion: 1,
    executable: {
      realPath: input.executable.realPath,
      sha256: input.executable.sha256,
      identity: input.executable.identity
    },
    version: input.version,
    hostManifestRevision: input.hostManifestRevision,
    implementationRevision: input.implementationRevision,
    executionIsolation: "none",
    repositoryIntegrations: "disabled"
  }));
  const evidence = Object.freeze({
    schemaVersion: 1 as const,
    executable: input.executable,
    version: input.version,
    capabilityRevision,
    executionIsolation: "none" as const,
    repositoryIntegrations: "disabled" as const
  });
  issuedCapabilityEvidence.add(evidence);
  return evidence;
}

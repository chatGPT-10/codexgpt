import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WindowsProcessHostRuntime } from "../process/windowsHostClient.js";
import {
  createGitCapabilityEvidence,
  resolveGitExecutable,
  verifyGitExecutableBinding,
  type GitCapabilityEvidence,
  type GitExecutableBinding
} from "./capabilities.js";
import type { GitObjectFormat } from "./parsers.js";

export interface GitRepositoryExecutionIdentity {
  worktreeRoot: string;
  gitDir: string;
  commonDir: string;
  objectFormat: GitObjectFormat;
}

export interface GitExecutionResult {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
}

export interface GitExecutionOptions {
  stdin?: Buffer;
  timeoutMs?: number;
  stdoutLimitBytes?: number;
  stderrLimitBytes?: number;
  configOverrides?: readonly string[];
  privateIndexPath?: string;
  objectDirectoryPath?: string;
  identity?: Readonly<{
    authorName: string;
    authorEmail: string;
    committerName: string;
    committerEmail: string;
    systemAuthorDate?: string;
    systemCommitterDate?: string;
  }>;
}

export interface GitCommandExecutor {
  readonly capabilityRevision: string;
  createPrivateDirectory?(prefix: string): Promise<string>;
  removePrivateDirectory?(directory: string): Promise<void>;
  run(
    repository: GitRepositoryExecutionIdentity | null,
    args: readonly string[],
    options?: GitExecutionOptions
  ): Promise<GitExecutionResult>;
  runApprovedIntegration?(
    repository: GitRepositoryExecutionIdentity,
    request: GitApprovedIntegrationRequest
  ): Promise<GitExecutionResult>;
}

export type GitApprovedIntegrationRequest =
  | {
      operation: "stage";
      paths: readonly string[];
      privateIndexPath: string;
      objectDirectoryPath: string;
    }
  | {
      operation: "commit";
      message: Buffer;
      privateIndexPath: string;
      objectDirectoryPath: string;
      shadowGitDir: string;
      hooksPath: string;
    }
  | { operation: "merge_tree"; targetOid: string; taskOid: string; objectDirectoryPath: string }
  | {
      operation: "checkout_index";
      privateIndexPath: string;
      destinationPrefix: string;
      paths: readonly string[];
    };

const FIXED_CONFIG = Object.freeze([
  "advice.detachedHead=false",
  "core.askPass=",
  "core.editor=",
  "core.fsmonitor=false",
  "core.hooksPath=NUL",
  "core.pager=cat",
  "credential.helper=",
  "diff.external=",
  "gc.auto=0",
  "maintenance.auto=false",
  "pager.branch=false",
  "pager.diff=false",
  "pager.log=false",
  "pager.status=false",
  "protocol.allow=never",
  "protocol.file.allow=never",
  "sequence.editor=",
  "tag.gpgSign=false",
  "commit.gpgSign=false"
]);
const APPROVED_INTEGRATION_FIXED_CONFIG = Object.freeze([
  "advice.detachedHead=false",
  "core.askPass=",
  "core.editor=",
  "core.pager=cat",
  "credential.helper=",
  "diff.external=",
  "gc.auto=0",
  "maintenance.auto=false",
  "pager.branch=false",
  "pager.diff=false",
  "pager.log=false",
  "pager.status=false",
  "protocol.allow=never",
  "protocol.file.allow=never",
  "sequence.editor="
]);
const MAX_ARGUMENTS = 384;
const MAX_ARGUMENT_BYTES = 8192;
const MAX_ARGUMENT_TOTAL_BYTES = 65_536;
const MAX_STDIN_BYTES = 131_072;
const MAX_OUTPUT_BYTES = 1_048_576;
const IMPLEMENTATION_REVISION = createHash("sha256").update(JSON.stringify({
  schemaVersion: 1,
  fixedConfig: FIXED_CONFIG,
  approvedIntegrationFixedConfig: APPROVED_INTEGRATION_FIXED_CONFIG,
  approvedIntegrationOperations: ["stage-private", "commit-shadow", "merge-tree-quarantine", "checkout-private"],
  limits: {
    arguments: MAX_ARGUMENTS,
    argumentBytes: MAX_ARGUMENT_BYTES,
    argumentTotalBytes: MAX_ARGUMENT_TOTAL_BYTES,
    stdinBytes: MAX_STDIN_BYTES,
    outputBytes: MAX_OUTPUT_BYTES
  },
  executionIsolation: "none",
  repositoryIntegrations: ["disabled", "approved_full_access"]
})).digest("hex");

function gitError(code: string): Error {
  return new Error(code);
}

function validateArguments(args: readonly string[]): string[] {
  if (!Array.isArray(args) || args.length > MAX_ARGUMENTS) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  let total = 0;
  const output: string[] = [];
  for (const argument of args) {
    if (typeof argument !== "string" || argument.includes("\0")) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    const bytes = Buffer.byteLength(argument, "utf8");
    if (bytes > MAX_ARGUMENT_BYTES) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    total += bytes;
    if (total > MAX_ARGUMENT_TOTAL_BYTES) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    output.push(argument);
  }
  return output;
}

function validateConfigOverrides(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  if (values.length > 128) throw gitError("GIT_INTEGRATION_REQUIRED");
  return values.map((value) => {
    if (
      typeof value !== "string" || value.length < 1 || value.length > 1024 || value.includes("\0") ||
      !/^(?:filter\.[A-Za-z0-9._-]+\.(?:clean|smudge|required|process)|diff\.[A-Za-z0-9._-]+\.(?:command|textconv)|merge\.[A-Za-z0-9._-]+\.driver)=/.test(value)
    ) throw gitError("GIT_INTEGRATION_REQUIRED");
    return value;
  });
}

function boundedInt(value: number | undefined, fallback: number, maximum: number): number {
  const actual = value ?? fallback;
  if (!Number.isSafeInteger(actual) || actual < 1 || actual > maximum) throw gitError("GIT_SCAN_LIMIT");
  return actual;
}

function safePrivatePath(value: string | undefined, root: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.includes("\0")) throw gitError("GIT_REPOSITORY_UNSAFE");
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw gitError("GIT_REPOSITORY_UNSAFE");
  return resolved;
}

function safeIdentity(value: GitExecutionOptions["identity"]): Record<string, string> {
  if (!value) return {};
  const required = [
    value.authorName,
    value.authorEmail,
    value.committerName,
    value.committerEmail
  ];
  if (required.some((item) =>
    typeof item !== "string" || item.length < 1 || item.length > 320 ||
    /[\u0000\r\n]/u.test(item)
  )) throw gitError("GIT_IDENTITY_REQUIRED");
  const dates = [value.systemAuthorDate, value.systemCommitterDate].filter(
    (item): item is string => item !== undefined
  );
  if (dates.some((item) =>
    item.length > 80 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(item)
  )) throw gitError("GIT_IDENTITY_REQUIRED");
  return {
    GIT_AUTHOR_NAME: value.authorName,
    GIT_AUTHOR_EMAIL: value.authorEmail,
    GIT_COMMITTER_NAME: value.committerName,
    GIT_COMMITTER_EMAIL: value.committerEmail,
    ...(value.systemAuthorDate ? { GIT_AUTHOR_DATE: value.systemAuthorDate } : {}),
    ...(value.systemCommitterDate ? { GIT_COMMITTER_DATE: value.systemCommitterDate } : {})
  };
}

function cleanWindowsEnvironment(home: string, tempRoot: string): Record<string, string> {
  const systemDrive = path.win32.parse(process.execPath).root.replace(/[\\/]$/, "") || "C:";
  const systemRoot = path.win32.join(`${systemDrive}\\`, "Windows");
  return {
    SystemDrive: systemDrive,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ProgramData: path.win32.join(`${systemDrive}\\`, "ProgramData"),
    ComSpec: path.win32.join(systemRoot, "System32", "cmd.exe"),
    PATH: `${path.win32.join(systemRoot, "System32")};${systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: tempRoot,
    TMP: tempRoot,
    HOME: home,
    XDG_CONFIG_HOME: path.win32.join(home, "xdg"),
    LC_ALL: "C",
    LANG: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "NUL",
    GIT_CONFIG_GLOBAL: "NUL",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_ALLOW_PROTOCOL: "",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_LFS_SKIP_SMUDGE: "1"
  };
}

function hostManifestRevision(manifest: unknown): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export class WindowsHostGitExecutor implements GitCommandExecutor {
  readonly capabilityRevision: string;
  readonly capability: GitCapabilityEvidence;
  readonly #binding: GitExecutableBinding;
  readonly #hostRuntime: WindowsProcessHostRuntime;
  readonly #home: string;
  readonly #tempRoot: string;
  #disposed = false;

  private constructor(input: {
    binding: GitExecutableBinding;
    hostRuntime: WindowsProcessHostRuntime;
    home: string;
    tempRoot: string;
    capability: GitCapabilityEvidence;
  }) {
    this.#binding = input.binding;
    this.#hostRuntime = input.hostRuntime;
    this.#home = input.home;
    this.#tempRoot = input.tempRoot;
    this.capability = input.capability;
    this.capabilityRevision = input.capability.capabilityRevision;
  }

  static async start(options: {
    hostRuntime: WindowsProcessHostRuntime;
    explicitGitPath?: string;
    programFiles?: string;
  }): Promise<WindowsHostGitExecutor> {
    if (process.platform !== "win32") throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    const binding = await resolveGitExecutable({
      explicitPath: options.explicitGitPath,
      platform: "win32",
      programFiles: options.programFiles
    });
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-git-exec-"));
    const home = path.join(tempRoot, "home");
    await fsp.mkdir(path.join(home, "xdg"), { recursive: true });
    try {
      const client = await options.hostRuntime.get();
      const environment = cleanWindowsEnvironment(home, tempRoot);
      const { body } = await client.request("run", {
        executable: binding.realPath,
        arguments: ["--version"],
        cwd: tempRoot,
        environment,
        stdinBase64: "",
        timeoutMs: 30_000,
        stdoutLimitBytes: 4096,
        stderrLimitBytes: 4096
      }, { timeoutMs: 40_000 });
      const stdout = Buffer.from(typeof body.stdoutBase64 === "string" ? body.stdoutBase64 : "", "base64").toString("utf8").trim();
      if (body.timedOut === true || body.exitCode !== 0 || !/^git version /.test(stdout)) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
      const capability = createGitCapabilityEvidence({
        executable: binding,
        version: stdout,
        hostManifestRevision: hostManifestRevision(client.manifest),
        implementationRevision: IMPLEMENTATION_REVISION
      });
      return new WindowsHostGitExecutor({ binding, hostRuntime: options.hostRuntime, home, tempRoot, capability });
    } catch (error) {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async run(
    repository: GitRepositoryExecutionIdentity | null,
    args: readonly string[],
    options: GitExecutionOptions = {}
  ): Promise<GitExecutionResult> {
    if (this.#disposed) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    await verifyGitExecutableBinding(this.#binding, "win32");
    const requested = validateArguments(args);
    const stdin = options.stdin ?? Buffer.alloc(0);
    if (!Buffer.isBuffer(stdin) || stdin.length > MAX_STDIN_BYTES) throw gitError("GIT_SCAN_LIMIT");
    const timeoutMs = boundedInt(options.timeoutMs, 60_000, 600_000);
    const stdoutLimitBytes = boundedInt(options.stdoutLimitBytes, MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES);
    const stderrLimitBytes = boundedInt(options.stderrLimitBytes, 4096, MAX_OUTPUT_BYTES);
    const config = [...FIXED_CONFIG, ...validateConfigOverrides(options.configOverrides)];
    const privateIndexPath = safePrivatePath(options.privateIndexPath, this.#tempRoot);
    const objectDirectoryPath = safePrivatePath(options.objectDirectoryPath, this.#tempRoot);
    const repositoryArgs = repository
      ? [
          `--git-dir=${repository.gitDir}`,
          `--work-tree=${repository.worktreeRoot}`,
          "--literal-pathspecs"
        ]
      : [];
    const arguments_ = [
      ...repositoryArgs,
      ...config.flatMap((entry) => ["-c", entry]),
      ...requested
    ];
    validateArguments(arguments_);
    const client = await this.#hostRuntime.get();
    const { body } = await client.request("run", {
      executable: this.#binding.realPath,
      arguments: arguments_,
      cwd: repository?.worktreeRoot ?? this.#tempRoot,
      environment: {
        ...cleanWindowsEnvironment(this.#home, this.#tempRoot),
        ...(privateIndexPath ? { GIT_INDEX_FILE: privateIndexPath } : {}),
        ...(objectDirectoryPath ? {
          GIT_OBJECT_DIRECTORY: objectDirectoryPath,
          ...(repository ? { GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repository.commonDir, "objects") } : {})
        } : {}),
        ...safeIdentity(options.identity)
      },
      stdinBase64: stdin.toString("base64"),
      timeoutMs,
      stdoutLimitBytes,
      stderrLimitBytes
    }, { timeoutMs: timeoutMs + 10_000 });
    return {
      status: typeof body.exitCode === "number" ? body.exitCode : 1,
      stdout: Buffer.from(typeof body.stdoutBase64 === "string" ? body.stdoutBase64 : "", "base64"),
      stderr: Buffer.from(typeof body.stderrBase64 === "string" ? body.stderrBase64 : "", "base64"),
      stdoutTruncated: body.stdoutTruncated === true,
      stderrTruncated: body.stderrTruncated === true,
      timedOut: body.timedOut === true
    };
  }

  async runApprovedIntegration(
    repository: GitRepositoryExecutionIdentity,
    request: GitApprovedIntegrationRequest
  ): Promise<GitExecutionResult> {
    if (this.#disposed) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    await verifyGitExecutableBinding(this.#binding, "win32");
    let requested: string[];
    let stdin: Buffer = Buffer.alloc(0);
    let privateIndexPath: string | undefined;
    let objectDirectoryPath: string | undefined;
    let shadowGitDir: string | undefined;
    let hooksPath: string | undefined;
    if (request.operation === "stage") {
      if (request.paths.length < 1 || request.paths.length > 256) throw gitError("GIT_SCAN_LIMIT");
      if (request.paths.some((item) =>
        typeof item !== "string" ||
        item.length < 1 ||
        item.length > MAX_ARGUMENT_BYTES ||
        item.includes("\0")
      )) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
      requested = ["add", "--pathspec-from-file=-", "--pathspec-file-nul"];
      stdin = Buffer.from(`${request.paths.join("\0")}\0`, "utf8");
      privateIndexPath = safePrivatePath(request.privateIndexPath, this.#tempRoot);
      objectDirectoryPath = safePrivatePath(request.objectDirectoryPath, this.#tempRoot);
      if (!privateIndexPath || !objectDirectoryPath) throw gitError("GIT_REPOSITORY_UNSAFE");
    } else if (request.operation === "commit") {
      if (!Buffer.isBuffer(request.message) || request.message.length < 1 || request.message.length > 16 * 1024) {
        throw gitError("GIT_SCAN_LIMIT");
      }
      requested = ["commit", "--file=-"];
      stdin = request.message;
      privateIndexPath = safePrivatePath(request.privateIndexPath, this.#tempRoot);
      objectDirectoryPath = safePrivatePath(request.objectDirectoryPath, this.#tempRoot);
      shadowGitDir = safePrivatePath(request.shadowGitDir, this.#tempRoot);
      if (
        !privateIndexPath ||
        !objectDirectoryPath ||
        !shadowGitDir ||
        !path.isAbsolute(request.hooksPath) ||
        request.hooksPath.includes("\0")
      ) throw gitError("GIT_REPOSITORY_UNSAFE");
      hooksPath = path.resolve(request.hooksPath);
    } else if (request.operation === "merge_tree") {
      if (
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(request.targetOid) ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(request.taskOid)
      ) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
      requested = ["merge-tree", "--write-tree", "-z", request.targetOid, request.taskOid];
      objectDirectoryPath = safePrivatePath(request.objectDirectoryPath, this.#tempRoot);
      if (!objectDirectoryPath) throw gitError("GIT_REPOSITORY_UNSAFE");
    } else if (request.operation === "checkout_index") {
      if (
        request.paths.length < 1 ||
        request.paths.length > 4096 ||
        request.paths.some((item) =>
          typeof item !== "string" ||
          item.length < 1 ||
          item.length > MAX_ARGUMENT_BYTES ||
          item.includes("\0")
        )
      ) throw gitError("GIT_SCAN_LIMIT");
      privateIndexPath = safePrivatePath(request.privateIndexPath, this.#tempRoot);
      const destination = safePrivatePath(request.destinationPrefix, this.#tempRoot);
      if (!privateIndexPath || !destination) throw gitError("GIT_REPOSITORY_UNSAFE");
      requested = ["checkout-index", "--force", "-z", "--stdin", `--prefix=${destination}${path.sep}`];
      stdin = Buffer.from(`${request.paths.join("\0")}\0`, "utf8");
    } else {
      throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    }
    const repositoryArgs = [
      `--git-dir=${shadowGitDir ?? repository.gitDir}`,
      `--work-tree=${repository.worktreeRoot}`,
      "--literal-pathspecs"
    ];
    const approvedConfig = hooksPath
      ? [...APPROVED_INTEGRATION_FIXED_CONFIG, `core.hooksPath=${hooksPath}`]
      : APPROVED_INTEGRATION_FIXED_CONFIG;
    const arguments_ = [
      ...repositoryArgs,
      ...approvedConfig.flatMap((entry) => ["-c", entry]),
      ...validateArguments(requested)
    ];
    validateArguments(arguments_);
    const client = await this.#hostRuntime.get();
    const environment = cleanWindowsEnvironment(this.#home, this.#tempRoot);
    delete environment.GIT_LFS_SKIP_SMUDGE;
    const { body } = await client.request("run", {
      executable: this.#binding.realPath,
      arguments: arguments_,
      cwd: repository.worktreeRoot,
      environment: {
        ...environment,
        ...(privateIndexPath ? { GIT_INDEX_FILE: privateIndexPath } : {}),
        ...(objectDirectoryPath ? {
          GIT_OBJECT_DIRECTORY: objectDirectoryPath,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repository.commonDir, "objects")
        } : {})
      },
      stdinBase64: stdin.toString("base64"),
      timeoutMs: 10 * 60_000,
      stdoutLimitBytes: MAX_OUTPUT_BYTES,
      stderrLimitBytes: MAX_OUTPUT_BYTES
    }, { timeoutMs: 10 * 60_000 + 10_000 });
    return {
      status: typeof body.exitCode === "number" ? body.exitCode : 1,
      stdout: Buffer.from(typeof body.stdoutBase64 === "string" ? body.stdoutBase64 : "", "base64"),
      stderr: Buffer.from(typeof body.stderrBase64 === "string" ? body.stderrBase64 : "", "base64"),
      stdoutTruncated: body.stdoutTruncated === true,
      stderrTruncated: body.stderrTruncated === true,
      timedOut: body.timedOut === true
    };
  }

  async createPrivateDirectory(prefix: string): Promise<string> {
    if (this.#disposed || !/^[a-z][a-z0-9-]{0,31}$/.test(prefix)) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    return fsp.mkdtemp(path.join(this.#tempRoot, `${prefix}-`));
  }

  async removePrivateDirectory(directory: string): Promise<void> {
    if (this.#disposed) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
    const resolved = safePrivatePath(directory, this.#tempRoot);
    if (!resolved || resolved === this.#tempRoot) throw gitError("GIT_REPOSITORY_UNSAFE");
    await fsp.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await fsp.rm(this.#tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

#!/usr/bin/env node
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootDefault = path.resolve(scriptDirectory, "..");
const manifestPathDefault = path.join(scriptDirectory, "git-execution-manifest-v1.json");
const ZERO_SHA1 = "0".repeat(40);
const ZERO_SHA256 = "0".repeat(64);
const SAFE_REF = /^refs\/codexgpt\/gate-g0\/[A-Za-z0-9._/-]{1,160}$/;
const SAFE_RELATIVE_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\0)[^\\]{1,512}$/;
const SERVICE_PATH_AUTHORITIES = new WeakSet();
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:token|password|secret|authorization)=([^\s&]+)/gi,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi
];

function gitError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isWindowsAbsolute(value) {
  return typeof value === "string" && path.win32.isAbsolute(value);
}

function platformPath(...values) {
  return values.some((value) => typeof value === "string" && /^[A-Za-z]:[\\/]/.test(value)) ? path.win32 : path;
}

function requireAbsolute(value, code = "GIT_PATH_INVALID") {
  if (typeof value !== "string" || value.includes("\0")) throw gitError(code);
  const api = platformPath(value);
  if (!api.isAbsolute(value)) throw gitError(code);
  return api.normalize(value);
}

function requireExactKeys(value, keys, code = "GIT_COMMAND_REJECTED") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw gitError(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw gitError(code);
}

function oidLength(objectFormat) {
  if (objectFormat === "sha1") return 40;
  if (objectFormat === "sha256") return 64;
  throw gitError("GIT_OBJECT_FORMAT_UNSUPPORTED");
}

function requireOid(value, objectFormat) {
  const length = oidLength(objectFormat);
  if (typeof value !== "string" || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) throw gitError("GIT_OID_INVALID");
  return value;
}

function requireRef(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || value.includes("..") || value.endsWith("/") || value.includes("@{")) {
    throw gitError("GIT_REF_INVALID");
  }
  return value;
}

function requireRelativePath(value) {
  if (typeof value !== "string") throw gitError("GIT_PATH_INVALID");
  const normalized = value.replaceAll("\\", "/");
  if (!SAFE_RELATIVE_PATH.test(normalized) || normalized.startsWith("./") || normalized.endsWith("/") || normalized.includes("//")) {
    throw gitError("GIT_PATH_INVALID");
  }
  return normalized;
}

function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw gitError("GIT_MANIFEST_INVALID");
  const requiredStrings = {
    capabilityName: "codexgpt-git-execution",
    commandTransport: "direct_argv",
    executionIsolation: "none",
    repositoryIntegrations: "disabled",
    processTreeControl: "job_object_members_only",
    brokerEscapeResistance: "none",
    promptPolicy: "fail_closed",
    remotePolicy: "deny_all"
  };
  if (value.schemaVersion !== 1 || value.capabilityVersion !== 1) throw gitError("GIT_MANIFEST_INVALID");
  for (const [key, expected] of Object.entries(requiredStrings)) {
    if (value[key] !== expected) throw gitError("GIT_MANIFEST_INVALID");
  }
  const expectedCandidateOrder = [
    "%ProgramFiles%\\Git\\cmd\\git.exe",
    "%ProgramFiles%\\Git\\bin\\git.exe"
  ];
  const expectedOperations = [
    "version",
    "init_private_probe",
    "object_format",
    "worktree_list_porcelain_z",
    "status_porcelain_v2",
    "diff_no_ext",
    "hash_object_write_raw",
    "read_tree_empty",
    "read_tree_oid",
    "update_index_cacheinfo",
    "write_tree",
    "commit_tree",
    "update_ref_expected_old",
    "merge_tree_write_stdin_z",
    "cat_file_exists",
    "positive_control_add"
  ];
  const expectedFixedConfigKeys = [
    "advice.detachedHead=false",
    "core.askPass=",
    "core.editor=",
    "core.fsmonitor=false",
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
  ];
  const expectedDeniedPrefixes = ["GIT_", "SSH_"];
  const expectedDeniedNames = [
    "ALL_PROXY",
    "CREDENTIALS_DIRECTORY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "PAGER"
  ];
  const expectedLimits = {
    stdinBytes: 131072,
    stdoutBytes: 1048576,
    stderrBytes: 1048576,
    diagnosticBytes: 4096,
    timeoutMs: 60000,
    argumentCount: 128,
    argumentBytes: 8192,
    argumentTotalBytes: 65536
  };
  for (const [actual, expected] of [
    [value.candidateOrder, expectedCandidateOrder],
    [value.allowedOperations, expectedOperations],
    [value.fixedConfigKeys, expectedFixedConfigKeys],
    [value.deniedEnvironmentPrefixes, expectedDeniedPrefixes],
    [value.deniedEnvironmentNames, expectedDeniedNames]
  ]) {
    if (!Array.isArray(actual) || stableJson(actual) !== stableJson(expected)) throw gitError("GIT_MANIFEST_INVALID");
  }
  if (!value.limits || stableJson(value.limits) !== stableJson(expectedLimits)) throw gitError("GIT_MANIFEST_INVALID");
  return Object.freeze({
    ...value,
    candidateOrder: Object.freeze([...value.candidateOrder]),
    allowedOperations: Object.freeze([...value.allowedOperations]),
    fixedConfigKeys: Object.freeze([...value.fixedConfigKeys]),
    deniedEnvironmentPrefixes: Object.freeze([...value.deniedEnvironmentPrefixes]),
    deniedEnvironmentNames: Object.freeze([...value.deniedEnvironmentNames]),
    limits: Object.freeze({ ...value.limits })
  });
}

export async function loadGitExecutionManifest(options = {}) {
  const manifestPath = path.resolve(options.manifestPath ?? manifestPathDefault);
  const raw = await fsp.readFile(manifestPath, "utf8");
  return validateManifest(JSON.parse(raw));
}

export async function computeGateG0ImplementationRevision(options = {}) {
  const fixturesRoot = path.resolve(options.fixturesRoot ?? path.join(repositoryRootDefault, "fixtures"));
  const files = [
    ["git-capability-spike", fileURLToPath(import.meta.url)],
    ["git-execution-manifest-v1", path.resolve(options.manifestPath ?? manifestPathDefault)],
    ["git-canary-child", path.join(fixturesRoot, "git-canary-child.mjs")],
    ["git-fake-askpass", path.join(fixturesRoot, "git-fake-askpass.mjs")],
    ["git-fake-editor", path.join(fixturesRoot, "git-fake-editor.mjs")],
    ["git-fake-credential-helper", path.join(fixturesRoot, "git-fake-credential-helper.mjs")]
  ];
  const records = await Promise.all(files.map(async ([name, file]) => ({
    name,
    sha256: sha256(await fsp.readFile(file))
  })));
  return sha256(stableJson(records));
}

export function computeGitCapabilityRevision(input) {
  if (!input || typeof input !== "object" || !/^[a-f0-9]{64}$/.test(input.implementationRevision ?? "") || !/^[a-f0-9]{64}$/.test(input.host?.manifestRevision ?? "")) {
    throw gitError("GIT_CAPABILITY_REVISION_INPUT_INVALID");
  }
  return sha256(stableJson({
    manifest: input.manifest,
    binding: {
      path: input.binding?.realPath,
      sha256: input.binding?.sha256,
      identity: input.binding?.identity
    },
    version: input.version,
    features: input.features,
    host: input.host,
    implementationRevision: input.implementationRevision
  }));
}

export function enumerateGitExecutableCandidates(options = {}) {
  if ((options.platform ?? process.platform) !== "win32") return Object.freeze([]);
  const systemDrive = path.win32.parse(process.execPath).root.replace(/[\\/]$/, "") || "C:";
  const programFiles = path.win32.resolve(options.programFiles ?? `${systemDrive}\\Program Files`);
  return Object.freeze([
    path.win32.join(programFiles, "Git", "cmd", "git.exe"),
    path.win32.join(programFiles, "Git", "bin", "git.exe")
  ]);
}

export async function bindGitExecutable(executablePath) {
  const requested = requireAbsolute(executablePath, "GIT_EXECUTABLE_INVALID");
  let handle;
  try {
    handle = await fsp.open(requested, "r");
  } catch {
    throw gitError("GIT_EXECUTABLE_UNAVAILABLE");
  }
  try {
    const [stat, content, realPath] = await Promise.all([
      handle.stat({ bigint: true }),
      handle.readFile(),
      fsp.realpath(requested)
    ]);
    if (!stat.isFile()) throw gitError("GIT_EXECUTABLE_INVALID");
    const digest = sha256(content);
    return Object.freeze({
      schemaVersion: 1,
      path: realPath,
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

export async function verifyGitExecutableBinding(binding) {
  if (!binding || binding.schemaVersion !== 1 || typeof binding.realPath !== "string") throw gitError("GIT_EXECUTABLE_DRIFT");
  const current = await bindGitExecutable(binding.realPath);
  if (current.realPath.toLocaleLowerCase("en-US") !== binding.realPath.toLocaleLowerCase("en-US") || current.sha256 !== binding.sha256 || current.dev !== binding.dev || current.ino !== binding.ino || current.size !== binding.size) {
    throw gitError("GIT_EXECUTABLE_DRIFT");
  }
  return current;
}

async function resolveGitExecutable(options = {}) {
  if (options.gitPath) return await bindGitExecutable(options.gitPath);
  for (const candidate of enumerateGitExecutableCandidates(options)) {
    try {
      return await bindGitExecutable(candidate);
    } catch (error) {
      if (error.code !== "GIT_EXECUTABLE_UNAVAILABLE") throw error;
    }
  }
  throw gitError("GIT_EXECUTABLE_UNAVAILABLE");
}

function fixedWindowsEnvironment(servicePaths) {
  const api = path.win32;
  const executableDrive = api.parse(process.execPath).root.replace(/[\\/]$/, "") || "C:";
  const systemRoot = api.resolve(servicePaths.systemRoot ?? `${executableDrive}\\Windows`);
  const home = requireAbsolute(servicePaths.home, "GIT_SERVICE_PATH_INVALID");
  const tempRoot = requireAbsolute(servicePaths.tempRoot, "GIT_SERVICE_PATH_INVALID");
  return {
    SystemDrive: executableDrive,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ProgramData: api.join(`${executableDrive}\\`, "ProgramData"),
    ComSpec: api.join(systemRoot, "System32", "cmd.exe"),
    PATH: `${api.join(systemRoot, "System32")};${systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: tempRoot,
    TMP: tempRoot,
    HOME: home,
    XDG_CONFIG_HOME: api.join(home, "xdg"),
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

function operationToArguments(operation, repository) {
  const format = repository?.objectFormat ?? "sha1";
  switch (operation.kind) {
    case "version":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["--version"], stdin: Buffer.alloc(0), repositoryScoped: false };
    case "init_private_probe":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["init", "--quiet", "--initial-branch=main", repository.workTree], stdin: Buffer.alloc(0), repositoryScoped: false };
    case "object_format":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["rev-parse", "--show-object-format"], stdin: Buffer.alloc(0), repositoryScoped: true };
    case "worktree_list_porcelain_z":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["worktree", "list", "--porcelain", "-z"], stdin: Buffer.alloc(0), repositoryScoped: true };
    case "status_porcelain_v2":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["status", "--porcelain=v2", "-z", "--untracked-files=no"], stdin: Buffer.alloc(0), repositoryScoped: true };
    case "diff_no_ext":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--"], stdin: Buffer.alloc(0), repositoryScoped: true };
    case "hash_object_write_raw":
      requireExactKeys(operation, ["kind", "stdin"]);
      if (!Buffer.isBuffer(operation.stdin)) throw gitError("GIT_STDIN_INVALID");
      return { arguments: ["hash-object", "-w", "--stdin", "--no-filters"], stdin: operation.stdin, repositoryScoped: true };
    case "read_tree_empty":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["read-tree", "--empty"], stdin: Buffer.alloc(0), repositoryScoped: true, requiresPrivateIndex: true };
    case "read_tree_oid":
      requireExactKeys(operation, ["kind", "oid"]);
      return { arguments: ["read-tree", requireOid(operation.oid, format)], stdin: Buffer.alloc(0), repositoryScoped: true, requiresPrivateIndex: true };
    case "update_index_cacheinfo":
      requireExactKeys(operation, ["kind", "mode", "oid", "path"]);
      if (!["100644", "100755", "120000"].includes(operation.mode)) throw gitError("GIT_MODE_INVALID");
      return {
        arguments: ["update-index", "--add", "--cacheinfo", `${operation.mode},${requireOid(operation.oid, format)},${requireRelativePath(operation.path)}`],
        stdin: Buffer.alloc(0),
        repositoryScoped: true,
        requiresPrivateIndex: true
      };
    case "write_tree":
      requireExactKeys(operation, ["kind"]);
      return { arguments: ["write-tree"], stdin: Buffer.alloc(0), repositoryScoped: true, requiresPrivateIndex: true };
    case "commit_tree": {
      requireExactKeys(operation, ["kind", "message", "parentOids", "treeOid"]);
      if (!Array.isArray(operation.parentOids) || operation.parentOids.length > 2) throw gitError("GIT_COMMAND_REJECTED");
      const message = Buffer.isBuffer(operation.message) ? operation.message : Buffer.from(String(operation.message), "utf8");
      const args = ["commit-tree", requireOid(operation.treeOid, format)];
      for (const parent of operation.parentOids) args.push("-p", requireOid(parent, format));
      return { arguments: args, stdin: message, repositoryScoped: true, commitIdentity: true };
    }
    case "update_ref_expected_old":
      requireExactKeys(operation, ["kind", "newOid", "oldOid", "ref"]);
      return {
        arguments: ["update-ref", requireRef(operation.ref), requireOid(operation.newOid, format), requireOid(operation.oldOid, format)],
        stdin: Buffer.alloc(0),
        repositoryScoped: true
      };
    case "merge_tree_write_stdin_z": {
      requireExactKeys(operation, ["kind", "pairs"]);
      if (!Array.isArray(operation.pairs) || operation.pairs.length !== 1) throw gitError("GIT_COMMAND_REJECTED");
      const lines = operation.pairs.map((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2) throw gitError("GIT_COMMAND_REJECTED");
        return `${requireOid(pair[0], format)} ${requireOid(pair[1], format)}`;
      });
      return {
        arguments: ["merge-tree", "--write-tree", "--stdin", "-z"],
        stdin: Buffer.from(`${lines.join("\n")}\n`, "utf8"),
        repositoryScoped: true,
        objectOnlyMerge: true
      };
    }
    case "cat_file_exists":
      requireExactKeys(operation, ["kind", "oid"]);
      return { arguments: ["cat-file", "-e", `${requireOid(operation.oid, format)}^{object}`], stdin: Buffer.alloc(0), repositoryScoped: true };
    case "positive_control_add":
      requireExactKeys(operation, ["kind", "path"]);
      return { arguments: ["add", "--", requireRelativePath(operation.path)], stdin: Buffer.alloc(0), repositoryScoped: true, positiveControl: true };
    default:
      throw gitError("GIT_COMMAND_REJECTED");
  }
}

function validateArguments(argumentsList, manifest) {
  if (argumentsList.length > manifest.limits.argumentCount) throw gitError("GIT_ARGUMENTS_TOO_LARGE");
  let total = 0;
  for (const argument of argumentsList) {
    if (typeof argument !== "string" || argument.includes("\0") || Buffer.byteLength(argument, "utf8") > manifest.limits.argumentBytes) throw gitError("GIT_ARGUMENT_INVALID");
    total += Buffer.byteLength(argument, "utf8");
  }
  if (total > manifest.limits.argumentTotalBytes) throw gitError("GIT_ARGUMENTS_TOO_LARGE");
}

export function buildSafeGitInvocation(input) {
  const { manifest, binding, repository, operation, servicePathAuthority, servicePaths } = input;
  if (!manifest || manifest.schemaVersion !== 1 || !binding || binding.schemaVersion !== 1) throw gitError("GIT_CAPABILITY_UNAVAILABLE");
  if (!servicePaths || typeof servicePaths !== "object") throw gitError("GIT_SERVICE_PATH_INVALID");
  const operationShape = operationToArguments(operation, repository);
  const executable = requireAbsolute(binding.realPath, "GIT_EXECUTABLE_INVALID");
  const environment = fixedWindowsEnvironment(servicePaths);
  const argumentsList = [];

  if (operationShape.repositoryScoped) {
    if (!repository || typeof repository !== "object") throw gitError("GIT_REPOSITORY_REQUIRED");
    const gitDir = requireAbsolute(repository.gitDir, "GIT_REPOSITORY_INVALID");
    const workTree = requireAbsolute(repository.workTree, "GIT_REPOSITORY_INVALID");
    argumentsList.push(`--git-dir=${gitDir}`, `--work-tree=${workTree}`);
  }

  let servicePathIdentity = null;
  const hasServiceOverride = servicePaths.privateIndex || servicePaths.objectDirectory || servicePaths.objectAlternates;
  if (hasServiceOverride) {
    if (!SERVICE_PATH_AUTHORITIES.has(servicePathAuthority) || servicePathAuthority.schemaVersion !== 1 || typeof servicePathAuthority.verify !== "function" || !servicePathAuthority.verify(repository, servicePaths, servicePaths.identity)) {
      throw gitError("GIT_SERVICE_PATH_IDENTITY_REQUIRED");
    }
    servicePathIdentity = servicePaths.identity;
  }
  if (operationShape.requiresPrivateIndex && !servicePaths.privateIndex) throw gitError("GIT_PRIVATE_INDEX_REQUIRED");
  if (servicePaths.privateIndex) environment.GIT_INDEX_FILE = requireAbsolute(servicePaths.privateIndex, "GIT_SERVICE_PATH_INVALID");
  if (servicePaths.objectDirectory) environment.GIT_OBJECT_DIRECTORY = requireAbsolute(servicePaths.objectDirectory, "GIT_SERVICE_PATH_INVALID");
  if (servicePaths.objectAlternates) environment.GIT_ALTERNATE_OBJECT_DIRECTORIES = requireAbsolute(servicePaths.objectAlternates, "GIT_SERVICE_PATH_INVALID");

  if (!operationShape.positiveControl) {
    argumentsList.push("--no-replace-objects", "--literal-pathspecs");
    const hooks = requireAbsolute(servicePaths.hooks, "GIT_SERVICE_PATH_INVALID").replaceAll("\\", "/");
    const config = [...manifest.fixedConfigKeys, `core.hooksPath=${hooks}`];
    for (const driver of repository?.filterDrivers ?? []) {
      if (typeof driver !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(driver)) throw gitError("GIT_FILTER_DRIVER_INVALID");
      config.push(`filter.${driver}.clean=`, `filter.${driver}.smudge=`, `filter.${driver}.process=`, `filter.${driver}.required=false`);
    }
    for (const driver of repository?.diffDrivers ?? []) {
      if (typeof driver !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(driver)) throw gitError("GIT_DIFF_DRIVER_INVALID");
      config.push(`diff.${driver}.command=`, `diff.${driver}.textconv=`);
    }
    for (const entry of config) argumentsList.push("-c", entry);
  }

  if (operationShape.objectOnlyMerge && Array.isArray(repository.customMergeDrivers) && repository.customMergeDrivers.length > 0) {
    throw gitError("GIT_CUSTOM_MERGE_DRIVER_UNSUPPORTED");
  }
  if (operationShape.commitIdentity) {
    environment.GIT_AUTHOR_NAME = "CodexGPT Gate G0";
    environment.GIT_AUTHOR_EMAIL = "gate-g0@codexgpt.invalid";
    environment.GIT_COMMITTER_NAME = "CodexGPT Gate G0";
    environment.GIT_COMMITTER_EMAIL = "gate-g0@codexgpt.invalid";
    environment.GIT_AUTHOR_DATE = "2000-01-01T00:00:00Z";
    environment.GIT_COMMITTER_DATE = "2000-01-01T00:00:00Z";
  }
  argumentsList.push(...operationShape.arguments);
  validateArguments(argumentsList, manifest);
  if (operationShape.stdin.length > manifest.limits.stdinBytes) throw gitError("GIT_STDIN_TOO_LARGE");

  return Object.freeze({
    schemaVersion: 1,
    executable,
    arguments: Object.freeze(argumentsList),
    environment: Object.freeze(environment),
    cwd: operation.kind === "init_private_probe" ? path.win32.dirname(repository.workTree) : repository?.workTree ?? servicePaths.tempRoot,
    stdin: Buffer.from(operationShape.stdin),
    timeoutMs: manifest.limits.timeoutMs,
    stdoutLimitBytes: manifest.limits.stdoutBytes,
    stderrLimitBytes: manifest.limits.stderrBytes,
    executionIsolation: manifest.executionIsolation,
    repositoryIntegrations: operationShape.positiveControl ? "positive_control_unrestricted" : manifest.repositoryIntegrations,
    remotePolicy: manifest.remotePolicy,
    promptPolicy: manifest.promptPolicy,
    servicePathIdentity,
    positiveControl: operationShape.positiveControl === true
  });
}

export function sanitizeGitDiagnostic(value, maxBytes = 4096) {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "?");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (match) => match.startsWith("http") ? "https://[REDACTED]@" : "[REDACTED]");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  return bytes.subarray(0, Math.max(0, maxBytes - 16)).toString("utf8") + "\n[TRUNCATED]";
}

export async function executeGitInvocation(host, invocation, options = {}) {
  await verifyGitExecutableBinding(options.binding);
  const response = await host.request("run", {
    executable: invocation.executable,
    arguments: [...invocation.arguments],
    cwd: invocation.cwd,
    environment: { ...invocation.environment },
    stdinBase64: invocation.stdin.toString("base64"),
    timeoutMs: invocation.timeoutMs,
    stdoutLimitBytes: invocation.stdoutLimitBytes,
    stderrLimitBytes: invocation.stderrLimitBytes
  }, { timeoutMs: invocation.timeoutMs + 15_000 });
  const body = response.body;
  const stdout = typeof body.stdoutBase64 === "string" ? Buffer.from(body.stdoutBase64, "base64") : Buffer.alloc(0);
  const stderr = typeof body.stderrBase64 === "string" ? Buffer.from(body.stderrBase64, "base64") : Buffer.alloc(0);
  const allowedExitCodes = options.allowedExitCodes ?? [0];
  if (body.timedOut === true) throw gitError("GIT_EXECUTION_TIMEOUT");
  if (body.stdoutTruncated === true || body.stderrTruncated === true) throw gitError("GIT_OUTPUT_TRUNCATED");
  if (!allowedExitCodes.includes(Number(body.exitCode))) {
    throw gitError("GIT_EXECUTION_FAILED", sanitizeGitDiagnostic(stderr.toString("utf8") || stdout.toString("utf8")));
  }
  if (body.jobAssignedAtCreation !== true || body.exactHandleList !== true || body.imageIdentityVerified !== true) throw gitError("GIT_HOST_IDENTITY_UNPROVED");
  return Object.freeze({ body, stdout, stderr });
}

function parseSingleOid(buffer, objectFormat) {
  const value = buffer.toString("utf8").trim();
  return requireOid(value, objectFormat);
}

export function parseMergeTreeWriteTreeStdinZ(buffer, objectFormat) {
  const bytes = Buffer.from(buffer);
  const fields = bytes.toString("utf8").split("\0");
  if (fields.length < 3 || (fields[0] !== "0" && fields[0] !== "1")) throw gitError("GIT_MERGE_OUTPUT_INVALID");
  let treeOid;
  try {
    treeOid = requireOid(fields[1], objectFormat);
  } catch {
    throw gitError("GIT_MERGE_OUTPUT_INVALID");
  }
  if (fields[0] === "1") {
    if (fields.slice(2).some((field) => field !== "")) throw gitError("GIT_MERGE_OUTPUT_INVALID");
    return { clean: true, treeOid, conflictRecordCount: 0 };
  }
  const firstSectionEnd = fields.indexOf("", 2);
  if (firstSectionEnd === -1) throw gitError("GIT_MERGE_OUTPUT_INVALID");
  const stageEntries = fields.slice(2, firstSectionEnd).filter(Boolean);
  const stageEntry = new RegExp(`^\\d{6} [a-f0-9]{${oidLength(objectFormat)}} [123]\\t[^\\0]+$`);
  if (stageEntries.length < 3 || stageEntries.some((entry) => !stageEntry.test(entry))) throw gitError("GIT_MERGE_OUTPUT_INVALID");
  const paths = new Set(stageEntries.map((entry) => entry.slice(entry.indexOf("\t") + 1)));
  return { clean: false, treeOid, conflictRecordCount: paths.size };
}

function quoteConfigCommand(parts) {
  return parts.map((part) => `"${String(part).replaceAll("\\", "/").replaceAll('"', '\\"')}"`).join(" ");
}

async function countCanaries(markerPath) {
  try {
    const text = await fsp.readFile(markerPath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

function gitServicePathPayload(repository, servicePaths) {
  if (!repository || typeof repository !== "object" || !servicePaths || typeof servicePaths !== "object") throw gitError("GIT_SERVICE_PATH_INVALID");
  const payload = {
    schemaVersion: 1,
    gitDir: requireAbsolute(repository.gitDir, "GIT_REPOSITORY_INVALID"),
    workTree: requireAbsolute(repository.workTree, "GIT_REPOSITORY_INVALID"),
    commonGitDir: requireAbsolute(repository.commonGitDir, "GIT_REPOSITORY_INVALID"),
    objectFormat: repository.objectFormat ?? "sha1",
    privateIndex: servicePaths.privateIndex ? requireAbsolute(servicePaths.privateIndex, "GIT_SERVICE_PATH_INVALID") : null,
    objectDirectory: servicePaths.objectDirectory ? requireAbsolute(servicePaths.objectDirectory, "GIT_SERVICE_PATH_INVALID") : null,
    objectAlternates: servicePaths.objectAlternates ? requireAbsolute(servicePaths.objectAlternates, "GIT_SERVICE_PATH_INVALID") : null
  };
  oidLength(payload.objectFormat);
  if (!payload.privateIndex && !payload.objectDirectory && !payload.objectAlternates) throw gitError("GIT_SERVICE_PATH_INVALID");
  return Buffer.from(stableJson(payload), "utf8");
}

export function createGitServicePathAuthority(secret = randomBytes(32)) {
  const key = Buffer.from(secret);
  if (key.length !== 32) throw gitError("GIT_SERVICE_PATH_AUTHORITY_INVALID");
  let active = true;
  const requireActive = () => {
    if (!active) throw gitError("GIT_SERVICE_PATH_AUTHORITY_UNAVAILABLE");
  };
  const authority = Object.freeze({
    schemaVersion: 1,
    seal(repository, servicePaths) {
      requireActive();
      return `gate-g0-v1:${createHmac("sha256", key).update(gitServicePathPayload(repository, servicePaths)).digest("hex")}`;
    },
    verify(repository, servicePaths, identity) {
      requireActive();
      if (typeof identity !== "string" || !/^gate-g0-v1:[a-f0-9]{64}$/.test(identity)) return false;
      const expected = Buffer.from(createHmac("sha256", key).update(gitServicePathPayload(repository, servicePaths)).digest("hex"), "hex");
      const actual = Buffer.from(identity.slice("gate-g0-v1:".length), "hex");
      return timingSafeEqual(expected, actual);
    },
    destroy() {
      if (!active) return;
      key.fill(0);
      active = false;
    }
  });
  SERVICE_PATH_AUTHORITIES.add(authority);
  return authority;
}

async function writeMaliciousRepositoryConfig({ gitDir, workTree, fixturesRoot, markerPath, phase }) {
  const configPath = path.join(gitDir, "config");
  const node = process.execPath;
  const canary = path.join(fixturesRoot, "git-canary-child.mjs");
  const askpass = path.join(fixturesRoot, "git-fake-askpass.mjs");
  const editor = path.join(fixturesRoot, "git-fake-editor.mjs");
  const credential = path.join(fixturesRoot, "git-fake-credential-helper.mjs");
  const filterCommand = quoteConfigCommand([node, canary, markerPath, "filter"]);
  let fragment = `\n[filter "canary"]\n\tclean = ${filterCommand}\n\tsmudge = ${filterCommand}\n`;
  if (phase === "full") {
    const generic = quoteConfigCommand([node, canary, markerPath, "integration"]);
    fragment += `\n[filter "lfs"]\n\tclean = ${generic}\n\tsmudge = ${generic}\n\tprocess = ${generic}\n\trequired = true\n[merge "canary"]\n\tdriver = ${generic} %O %A %B %L %P\n[diff "canary"]\n\tcommand = ${generic}\n\ttextconv = ${generic}\n[diff "lfs"]\n\tcommand = ${generic}\n\ttextconv = ${generic}\n[core]\n\tfsmonitor = ${generic}\n\teditor = ${quoteConfigCommand([node, editor, markerPath])}\n\tpager = ${generic}\n\taskPass = ${quoteConfigCommand([node, askpass, markerPath])}\n[credential]\n\thelper = ${quoteConfigCommand([node, credential, markerPath])}\n[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = ${generic}\n[alias]\n\tstatus = !${generic}\n[include]\n\tpath = ../gate-g0-included.cfg\n`;
    await fsp.writeFile(path.join(workTree, "gate-g0-included.cfg"), `[pager]\n\tstatus = ${generic}\n`, "utf8");
    const hookBody = `#!/bin/sh\n${quoteConfigCommand([node, canary, markerPath, "hook"])}\n`;
    await Promise.all([
      fsp.writeFile(path.join(gitDir, "hooks", "pre-commit"), hookBody, "utf8"),
      fsp.writeFile(path.join(gitDir, "hooks", "reference-transaction"), hookBody, "utf8")
    ]);
  }
  await fsp.appendFile(configPath, fragment, "utf8");
}

async function writeMaliciousExternalConfigs({ home, tempRoot, fixturesRoot, markerPath }) {
  const generic = quoteConfigCommand([process.execPath, path.join(fixturesRoot, "git-canary-child.mjs"), markerPath, "external-config"]);
  const config = `[filter "global"]\n\tclean = ${generic}\n\tsmudge = ${generic}\n[filter "system"]\n\tclean = ${generic}\n\tsmudge = ${generic}\n[core]\n\thooksPath = ${path.join(tempRoot, "external-hooks").replaceAll("\\", "/")}\n\tfsmonitor = ${generic}\n[credential]\n\thelper = ${generic}\n`;
  const xdgGit = path.join(home, "xdg", "git");
  await fsp.mkdir(xdgGit, { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(home, ".gitconfig"), config, "utf8"),
    fsp.writeFile(path.join(xdgGit, "config"), config, "utf8"),
    fsp.writeFile(path.join(tempRoot, "system.gitconfig"), config, "utf8")
  ]);
}

export function mapGitCapabilityFailure(operationKind, error) {
  if (operationKind === "merge_tree_write_stdin_z" && ["GIT_EXECUTION_FAILED", "GIT_MERGE_OUTPUT_INVALID"].includes(error?.code)) {
    return gitError("GIT_MERGE_CAPABILITY_UNAVAILABLE");
  }
  return error;
}

function gitRepository(workTree, objectFormat = "sha1") {
  return Object.freeze({
    workTree,
    gitDir: path.join(workTree, ".git"),
    commonGitDir: path.join(workTree, ".git"),
    objectFormat
  });
}

async function runOperation(context, operation, overrides = {}) {
  const invocation = buildSafeGitInvocation({
    manifest: context.manifest,
    binding: context.binding,
    repository: overrides.repository ?? context.repository,
    operation,
    servicePathAuthority: context.servicePathAuthority,
    servicePaths: {
      tempRoot: context.tempRoot,
      home: context.home,
      hooks: context.hooks,
      ...(overrides.servicePaths ?? {})
    },
    callerEnvironment: overrides.callerEnvironment ?? process.env
  });
  const result = await executeGitInvocation(context.host, invocation, { binding: context.binding, allowedExitCodes: overrides.allowedExitCodes });
  context.hostResults.push(result.body);
  return result;
}

async function createCommit(context, { parent = null, additions, message }) {
  const indexPath = path.join(context.indexes, `index-${randomBytes(8).toString("hex")}`);
  const identity = context.servicePathAuthority.seal(context.repository, { privateIndex: indexPath });
  if (parent) {
    await runOperation(context, { kind: "read_tree_oid", oid: parent }, { servicePaths: { privateIndex: indexPath, identity } });
  } else {
    await runOperation(context, { kind: "read_tree_empty" }, { servicePaths: { privateIndex: indexPath, identity } });
  }
  for (const [relativePath, content] of additions) {
    const blobResult = await runOperation(context, { kind: "hash_object_write_raw", stdin: Buffer.from(content, "utf8") });
    const blob = parseSingleOid(blobResult.stdout, context.repository.objectFormat);
    await runOperation(context, { kind: "update_index_cacheinfo", mode: "100644", oid: blob, path: relativePath }, { servicePaths: { privateIndex: indexPath, identity } });
  }
  const treeResult = await runOperation(context, { kind: "write_tree" }, { servicePaths: { privateIndex: indexPath, identity } });
  const tree = parseSingleOid(treeResult.stdout, context.repository.objectFormat);
  const commitResult = await runOperation(context, { kind: "commit_tree", treeOid: tree, parentOids: parent ? [parent] : [], message: Buffer.from(`${message}\n`, "utf8") });
  return { tree, commit: parseSingleOid(commitResult.stdout, context.repository.objectFormat) };
}

function objectFilePath(objectsRoot, oid) {
  return path.join(objectsRoot, oid.slice(0, 2), oid.slice(2));
}

export async function runGitCapabilityProbe(options = {}) {
  if (process.platform !== "win32") throw gitError("GIT_WINDOWS_CONTROL_REQUIRED");
  if (!options.host || typeof options.host.request !== "function") throw gitError("GIT_HOST_REQUIRED");
  const manifest = await loadGitExecutionManifest({ manifestPath: options.manifestPath });
  const binding = await resolveGitExecutable({ gitPath: options.gitPath, platform: "win32", programFiles: options.programFiles, localAppData: options.localAppData });
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-g0-"));
  const workTree = path.join(tempRoot, "repository");
  const home = path.join(tempRoot, "home");
  const hooks = path.join(tempRoot, "empty-hooks");
  const indexes = path.join(tempRoot, "indexes");
  const markerPath = path.join(tempRoot, "canary.log");
  const fixturesRoot = path.resolve(options.fixturesRoot ?? path.join(repositoryRootDefault, "fixtures"));
  const implementationRevision = await computeGateG0ImplementationRevision({ manifestPath: options.manifestPath, fixturesRoot });
  const repository = gitRepository(workTree);
  const servicePathAuthority = createGitServicePathAuthority();
  const context = { host: options.host, manifest, binding, tempRoot, home, hooks, indexes, repository, servicePathAuthority, hostResults: [] };

  try {
    await Promise.all([fsp.mkdir(workTree), fsp.mkdir(home), fsp.mkdir(hooks), fsp.mkdir(indexes)]);
    await writeMaliciousExternalConfigs({ home, tempRoot, fixturesRoot, markerPath });
    await runOperation(context, { kind: "init_private_probe" });
    await writeMaliciousRepositoryConfig({ gitDir: repository.gitDir, workTree, fixturesRoot, markerPath, phase: "filter" });
    await fsp.writeFile(path.join(workTree, ".gitattributes"), "positive.txt filter=canary diff=canary\nlfs.txt filter=lfs diff=lfs\nglobal.txt filter=global\nsystem.txt filter=system\ncustom-conflict.txt merge=canary\n", "utf8");
    await fsp.writeFile(path.join(workTree, "positive.txt"), "positive control\n", "utf8");
    await runOperation(context, { kind: "positive_control_add", path: "positive.txt" });
    const positiveControlExecutions = await countCanaries(markerPath);
    if (positiveControlExecutions !== 1) throw gitError("GIT_CANARY_ORACLE_INVALID");
    await fsp.writeFile(markerPath, "", "utf8");
    await writeMaliciousRepositoryConfig({ gitDir: repository.gitDir, workTree, fixturesRoot, markerPath, phase: "full" });
    await Promise.all([
      fsp.writeFile(path.join(workTree, "lfs.txt"), "lfs canary\n", "utf8"),
      fsp.writeFile(path.join(workTree, "global.txt"), "global canary\n", "utf8"),
      fsp.writeFile(path.join(workTree, "system.txt"), "system canary\n", "utf8")
    ]);

    const versionResult = await runOperation(context, { kind: "version" });
    const version = versionResult.stdout.toString("utf8").trim();
    if (!/^git version \d+\.\d+\.\d+/.test(version)) throw gitError("GIT_VERSION_UNPROVED");

    const objectFormatResult = await runOperation(context, { kind: "object_format" });
    const objectFormat = objectFormatResult.stdout.toString("utf8").trim();
    if (!['sha1', 'sha256'].includes(objectFormat)) throw gitError("GIT_OBJECT_FORMAT_UNSUPPORTED");
    context.repository = Object.freeze({
      ...gitRepository(workTree, objectFormat),
      filterDrivers: Object.freeze(["canary", "lfs"]),
      diffDrivers: Object.freeze(["canary", "lfs"])
    });

    const worktreeResult = await runOperation(context, { kind: "worktree_list_porcelain_z" });
    if (!worktreeResult.stdout.includes(Buffer.from("worktree ", "utf8")) || !worktreeResult.stdout.includes(0)) throw gitError("GIT_WORKTREE_PORCELAIN_UNPROVED");
    await runOperation(context, { kind: "status_porcelain_v2" }, {
      callerEnvironment: {
        ...process.env,
        GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
        GIT_CONFIG_SYSTEM: path.join(tempRoot, "system.gitconfig"),
        GIT_ASKPASS: path.join(fixturesRoot, "git-fake-askpass.mjs"),
        SSH_ASKPASS: path.join(fixturesRoot, "git-fake-askpass.mjs")
      }
    });
    await runOperation(context, { kind: "diff_no_ext" });
    const rawBlobResult = await runOperation(context, { kind: "hash_object_write_raw", stdin: Buffer.from("gate-g0-raw-blob\n", "utf8") });
    parseSingleOid(rawBlobResult.stdout, objectFormat);

    const base = await createCommit(context, { parent: null, additions: [["base.txt", "base\n"]], message: "base" });
    const ref = "refs/codexgpt/gate-g0/probe";
    await runOperation(context, { kind: "update_ref_expected_old", ref, newOid: base.commit, oldOid: objectFormat === "sha1" ? ZERO_SHA1 : ZERO_SHA256 });
    const left = await createCommit(context, { parent: base.commit, additions: [["left.txt", "left\n"]], message: "left" });
    const right = await createCommit(context, { parent: base.commit, additions: [["right.txt", "right\n"]], message: "right" });
    let cleanMergeResult;
    let cleanMerge;
    try {
      cleanMergeResult = await runOperation(context, { kind: "merge_tree_write_stdin_z", pairs: [[left.commit, right.commit]] });
      cleanMerge = parseMergeTreeWriteTreeStdinZ(cleanMergeResult.stdout, objectFormat);
    } catch (error) {
      throw mapGitCapabilityFailure("merge_tree_write_stdin_z", error);
    }
    if (!cleanMerge.clean) throw gitError("GIT_MERGE_CAPABILITY_UNAVAILABLE");

    const conflictBase = await createCommit(context, { parent: null, additions: [["plain-conflict.txt", "base\n"]], message: "conflict base" });
    const conflictLeft = await createCommit(context, { parent: conflictBase.commit, additions: [["plain-conflict.txt", "left\n"]], message: "conflict left" });
    const conflictRight = await createCommit(context, { parent: conflictBase.commit, additions: [["plain-conflict.txt", "right\n"]], message: "conflict right" });
    const conflictMergeResult = await runOperation(context, { kind: "merge_tree_write_stdin_z", pairs: [[conflictLeft.commit, conflictRight.commit]] });
    const conflictMerge = parseMergeTreeWriteTreeStdinZ(conflictMergeResult.stdout, objectFormat);
    if (conflictMerge.clean || conflictMerge.conflictRecordCount < 1) throw gitError("GIT_MERGE_CONFLICT_STATUS_UNPROVED");

    assertCustomMergeDriverRejected(context, conflictLeft.commit, conflictRight.commit);

    const quarantine = path.join(tempRoot, "quarantine", "objects");
    await fsp.mkdir(quarantine, { recursive: true });
    const quarantineIdentity = context.servicePathAuthority.seal(context.repository, {
      objectDirectory: quarantine,
      objectAlternates: path.join(context.repository.gitDir, "objects")
    });
    const quarantineBlobResult = await runOperation(context, { kind: "hash_object_write_raw", stdin: Buffer.from(`quarantine-${randomBytes(32).toString("hex")}\n`, "utf8") }, {
      servicePaths: {
        objectDirectory: quarantine,
        objectAlternates: path.join(repository.gitDir, "objects"),
        identity: quarantineIdentity
      }
    });
    const quarantineOid = parseSingleOid(quarantineBlobResult.stdout, objectFormat);
    const quarantineObject = objectFilePath(quarantine, quarantineOid);
    const mainObject = objectFilePath(path.join(repository.gitDir, "objects"), quarantineOid);
    await fsp.access(quarantineObject);
    let mainExists = true;
    try { await fsp.access(mainObject); } catch (error) { if (error.code === "ENOENT") mainExists = false; else throw error; }
    if (mainExists) throw gitError("GIT_QUARANTINE_LEAK");
    await fsp.rm(path.dirname(quarantine), { recursive: true, force: true });
    try { await fsp.access(mainObject); mainExists = true; } catch (error) { if (error.code === "ENOENT") mainExists = false; else throw error; }

    await verifyGitExecutableBinding(binding);
    const safeModeExecutions = await countCanaries(markerPath);
    if (safeModeExecutions !== 0) throw gitError("GIT_INTEGRATION_EXECUTED");

    const host = summarizeHost(context.hostResults, options.host);
    const finalImplementationRevision = await computeGateG0ImplementationRevision({ manifestPath: options.manifestPath, fixturesRoot });
    if (finalImplementationRevision !== implementationRevision) throw gitError("GIT_CAPABILITY_IMPLEMENTATION_DRIFT");
    const features = Object.freeze({
      objectFormat,
      worktreeListPorcelainZ: true,
      statusPorcelainV2: true,
      externalConfigIsolation: true,
      externalDiffAndTextconvDisabled: true,
      rawHashObject: true,
      privateIndex: true,
      commitTree: true,
      expectedOldRefUpdate: true,
      objectOnlyMerge: true,
      mergeConflictStatus: true,
      quarantineRejectedObjectsPromoted: mainExists ? 1 : 0
    });
    const capabilityRevision = computeGitCapabilityRevision({
      manifest,
      binding,
      version,
      features,
      host,
      implementationRevision
    });
    return Object.freeze({
      schemaVersion: 1,
      gate: "G0",
      status: "passed",
      capabilityRevision,
      implementationRevision,
      git: Object.freeze({ path: binding.realPath, sha256: binding.sha256, identity: binding.identity, version }),
      features,
      canaries: Object.freeze({ positiveControlExecutions, safeModeExecutions }),
      host,
      executionIsolation: manifest.executionIsolation,
      repositoryIntegrations: manifest.repositoryIntegrations,
      remotePolicy: manifest.remotePolicy,
      promptPolicy: manifest.promptPolicy
    });
  } finally {
    servicePathAuthority.destroy();
    await fsp.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function assertCustomMergeDriverRejected(context, left, right) {
  assertThrowsCode(() => buildSafeGitInvocation({
    manifest: context.manifest,
    binding: context.binding,
    repository: { ...context.repository, customMergeDrivers: ["canary"] },
    operation: { kind: "merge_tree_write_stdin_z", pairs: [[left, right]] },
    servicePaths: { tempRoot: context.tempRoot, home: context.home, hooks: context.hooks }
  }), "GIT_CUSTOM_MERGE_DRIVER_UNSUPPORTED");
}

function assertThrowsCode(fn, code) {
  try {
    fn();
  } catch (error) {
    if (error?.code === code) return;
    throw error;
  }
  throw gitError("GIT_EXPECTED_REJECTION_MISSING");
}

function summarizeHost(results, hostRuntime) {
  if (!Array.isArray(results) || results.length === 0) throw gitError("GIT_HOST_IDENTITY_UNPROVED");
  const all = (key, expected) => results.every((result) => result[key] === expected);
  if (!all("jobAssignedAtCreation", true) || !all("exactHandleList", true) || !all("imageIdentityVerified", true) || !all("processTreeControl", "job_object_members_only") || !all("brokerEscapeResistance", "none")) {
    throw gitError("GIT_HOST_IDENTITY_UNPROVED");
  }
  const hostManifest = hostRuntime?.manifest;
  if (!hostManifest || hostManifest.schemaVersion !== 1 || hostManifest.protocolName !== "CXP4" || hostManifest.protocolVersion !== 1 || !/^[a-f0-9]{64}$/.test(hostManifest.productionPowerShellSha256 ?? "") || !/^[a-f0-9]{64}$/.test(hostManifest.productionCSharpSha256 ?? "") || !/^[a-f0-9]{64}$/.test(hostManifest.protocolSha256 ?? "")) {
    throw gitError("GIT_HOST_IDENTITY_UNPROVED");
  }
  return Object.freeze({
    manifestRevision: sha256(stableJson(hostManifest)),
    jobAssignedAtCreation: true,
    exactHandleList: true,
    imageIdentityVerified: true,
    processTreeControl: "job_object_members_only",
    brokerEscapeResistance: "none"
  });
}

async function main() {
  if (process.platform !== "win32") {
    console.error("GIT_WINDOWS_CONTROL_REQUIRED");
    process.exitCode = 2;
    return;
  }
  const clientModule = await import(pathToFileURL(path.join(repositoryRootDefault, "dist", "process", "windowsHostClient.js")).href);
  const host = await clientModule.WindowsProcessHostClient.start({ scriptsRoot: scriptDirectory });
  try {
    const evidence = await runGitCapabilityProbe({ host, repositoryRoot: repositoryRootDefault, scriptsRoot: scriptDirectory, fixturesRoot: path.join(repositoryRootDefault, "fixtures") });
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await host.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.code ?? "GIT_GATE_G0_FAILED");
    process.exitCode = 1;
  });
}

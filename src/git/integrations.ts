import fsp from "node:fs/promises";
import path from "node:path";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitApprovedIntegrationRequest, GitCommandExecutor, GitExecutionResult } from "./execution.js";
import { runGitRequired, sha256Git } from "./mutationContext.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import type { GitReviewTokenServiceV4 } from "./reviewToken.js";

export interface GitIntegrationIdentityV4 {
  kind: "hook" | "filter" | "merge_driver" | "fsmonitor" | "signing" | "identity";
  configKeyDigest: string;
  executableDigest: string | null;
  contentDigest: string;
}

interface GitIntegrationReviewBindingV4 extends GitIntegrationIdentityV4 {
  canonicalPath: string | null;
  stableIdentity: string | null;
}

interface GitIntegrationBindingV4 extends GitIntegrationReviewBindingV4 {
  snapshotContent: Buffer | null;
  hookName: string | null;
}

interface GitIntegrationCommandV4 {
  key: string;
  tokens: string[];
  paths: Array<{ tokenIndex: number; canonicalPath: string }>;
  serialization: "shell" | "program";
}

export interface GitIntegrationReviewFactsV4 {
  workspaceId: string;
  repositoryId: string;
  repositoryFingerprint: string;
  capabilityRevision: string;
  identities: GitIntegrationReviewBindingV4[];
  identitiesDigest: string;
  semanticStateDigest: string;
  hooksPath: string;
  configDigest: string;
  implementationRevision: string;
}

const HOOK_NAMES = Object.freeze([
  "pre-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "post-index-change",
  "post-rewrite",
  "reference-transaction",
  "pre-merge-commit",
  "post-merge"
]);
const MAX_INTEGRATION_EXECUTABLE_BYTES = 256n * 1024n * 1024n;
const MAX_INTEGRATION_EXECUTABLE_TOTAL_BYTES = 512n * 1024n * 1024n;
const MAX_INTEGRATION_EXECUTABLES = 32;
const MAX_INTEGRATION_PATH_CHARS = 2048;
const SCRIPT_DEPENDENCY_EXTENSIONS = new Set([
  ".bat", ".cmd", ".cjs", ".dll", ".jar", ".js", ".mjs", ".pl", ".ps1", ".py", ".rb", ".sh"
]);
const INTEGRATION_CONFIG_PATTERN = "^(include(if\\..*)?\\.path|core\\.(hookspath|fsmonitor|attributesfile)|commit\\.gpgsign|gpg\\.(program|format|openpgp\\.program|x509\\.program|ssh\\.(program|defaultkeycommand))|user\\.(name|email|signingkey)|filter\\..*\\.(clean|smudge|process|required)|merge\\.(default|renormalize)|merge\\..*\\.(driver|recursive))$";
const INTEGRATION_IMPLEMENTATION_REVISION = sha256Git(JSON.stringify({
  schemaVersion: 3,
  hooks: HOOK_NAMES,
  configPattern: INTEGRATION_CONFIG_PATTERN,
  scriptDependencyExtensions: [...SCRIPT_DEPENDENCY_EXTENSIONS].sort(),
  limits: {
    executableBytes: String(MAX_INTEGRATION_EXECUTABLE_BYTES),
    executableTotalBytes: String(MAX_INTEGRATION_EXECUTABLE_TOTAL_BYTES),
    executables: MAX_INTEGRATION_EXECUTABLES,
    pathChars: MAX_INTEGRATION_PATH_CHARS,
    identities: 128
  },
  configIncludes: "rejected",
  externalAttributesFile: "rejected",
  signingSelectors: "explicit-effective-program-and-key-v1",
  executionBundle: "stable-config-and-executable-snapshot-v2",
  executionIsolation: "none"
}));

interface ExecutableFingerprintV4 {
  canonicalPath: string;
  executableDigest: string;
  contentDigest: string;
  stableIdentity: string;
  content: Buffer;
}

interface ExecutableDiscoveryBudgetV4 {
  cache: Map<string, ExecutableFingerprintV4>;
  totalBytes: bigint;
}

function integrationError(): Error {
  return new Error("GIT_INTEGRATION_REQUIRED");
}

function commandTokens(value: string): string[] {
  const trimmed = value.trim();
  if (
    /[\u0000\r\n&|;<>`']/u.test(trimmed) ||
    trimmed.includes("$(") ||
    trimmed.includes("${")
  ) throw integrationError();
  const tokens: string[] = [];
  let offset = 0;
  while (offset < trimmed.length) {
    while (/\s/u.test(trimmed[offset] ?? "")) offset += 1;
    if (offset >= trimmed.length) break;
    if (trimmed[offset] === '"') {
      const closing = trimmed.indexOf('"', offset + 1);
      if (closing < 0 || (closing + 1 < trimmed.length && !/\s/u.test(trimmed[closing + 1]))) {
        throw integrationError();
      }
      const token = trimmed.slice(offset + 1, closing);
      if (!token || token.includes('"')) throw integrationError();
      tokens.push(token);
      offset = closing + 1;
    } else {
      let closing = offset;
      while (closing < trimmed.length && !/\s/u.test(trimmed[closing])) closing += 1;
      const token = trimmed.slice(offset, closing);
      if (!token || token.includes('"')) throw integrationError();
      tokens.push(token);
      offset = closing;
    }
  }
  if (tokens.length < 1 || !path.isAbsolute(tokens[0])) throw integrationError();
  return tokens;
}

function bindConfigurationFact(
  kind: GitIntegrationIdentityV4["kind"],
  key: string,
  value: string
): GitIntegrationBindingV4 {
  return Object.freeze({
    kind,
    configKeyDigest: sha256Git(key),
    executableDigest: null,
    contentDigest: sha256Git(Buffer.from(`${key}\0${value}`, "utf8")),
    canonicalPath: null,
    stableIdentity: null,
    snapshotContent: null,
    hookName: null
  });
}

async function bindExecutable(
  kind: GitIntegrationIdentityV4["kind"],
  key: string,
  executable: string,
  value: string,
  budget: ExecutableDiscoveryBudgetV4,
  hookName: string | null = null
): Promise<GitIntegrationBindingV4> {
  const canonicalPath = await fsp.realpath(executable).catch(() => {
    throw integrationError();
  });
  if (canonicalPath.length > MAX_INTEGRATION_PATH_CHARS) throw new Error("GIT_SCAN_LIMIT");
  const cacheKey = process.platform === "win32"
    ? canonicalPath.toLocaleLowerCase("en-US")
    : canonicalPath;
  const cached = budget.cache.get(cacheKey);
  if (cached) {
    return Object.freeze({
      kind,
      configKeyDigest: sha256Git(key),
      executableDigest: cached.executableDigest,
      contentDigest: sha256Git(JSON.stringify({ value, executableContentDigest: cached.contentDigest })),
      canonicalPath: cached.canonicalPath,
      stableIdentity: cached.stableIdentity,
      snapshotContent: cached.content,
      hookName
    });
  }
  const lexical = await fsp.lstat(canonicalPath, { bigint: true }).catch(() => {
    throw integrationError();
  });
  if (
    !lexical.isFile() ||
    lexical.isSymbolicLink() ||
    lexical.nlink !== 1n ||
    lexical.size > MAX_INTEGRATION_EXECUTABLE_BYTES
  ) throw integrationError();
  if (
    budget.cache.size >= MAX_INTEGRATION_EXECUTABLES ||
    budget.totalBytes + lexical.size > MAX_INTEGRATION_EXECUTABLE_TOTAL_BYTES
  ) throw new Error("GIT_SCAN_LIMIT");
  budget.totalBytes += lexical.size;
  const handle = await fsp.open(canonicalPath, "r").catch(() => {
    throw integrationError();
  });
  try {
    const [content, stat] = await Promise.all([handle.readFile(), handle.stat({ bigint: true })]);
    if (
      !stat.isFile() ||
      stat.nlink !== 1n ||
      stat.dev !== lexical.dev ||
      stat.ino !== lexical.ino ||
      stat.size !== lexical.size ||
      stat.mtimeNs !== lexical.mtimeNs
    ) throw integrationError();
    const fingerprint = Object.freeze({
      canonicalPath,
      executableDigest: sha256Git(canonicalPath),
      contentDigest: sha256Git(content),
      stableIdentity: sha256Git(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.nlink}`),
      content
    });
    budget.cache.set(cacheKey, fingerprint);
    return Object.freeze({
      kind,
      configKeyDigest: sha256Git(key),
      executableDigest: fingerprint.executableDigest,
      contentDigest: sha256Git(JSON.stringify({ value, executableContentDigest: fingerprint.contentDigest })),
      canonicalPath: fingerprint.canonicalPath,
      stableIdentity: fingerprint.stableIdentity,
      snapshotContent: fingerprint.content,
      hookName
    });
  } finally {
    await handle.close();
  }
}

async function bindCommand(
  kind: GitIntegrationIdentityV4["kind"],
  key: string,
  value: string,
  repository: GitRepositoryIdentity,
  budget: ExecutableDiscoveryBudgetV4,
  serialization: "shell" | "program" = "shell"
): Promise<{ bindings: GitIntegrationBindingV4[]; command: GitIntegrationCommandV4 }> {
  const tokens = commandTokens(value);
  if (serialization === "program" && tokens.length !== 1) throw integrationError();
  const bindings = [await bindExecutable(kind, key, tokens[0], value, budget)];
  const paths = [{ tokenIndex: 0, canonicalPath: bindings[0].canonicalPath! }];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const candidateValue = token.includes("=") ? token.slice(token.indexOf("=") + 1) : token;
    if (!SCRIPT_DEPENDENCY_EXTENSIONS.has(path.extname(candidateValue).toLocaleLowerCase("en-US"))) continue;
    const candidate = path.isAbsolute(candidateValue)
      ? candidateValue
      : path.resolve(repository.worktreeRoot, candidateValue);
    const binding = await bindExecutable(
      kind,
      `${key}:dependency:${index}`,
      candidate,
      `${value}\0dependency:${index}`,
      budget
    );
    bindings.push(binding);
    paths.push({ tokenIndex: index, canonicalPath: binding.canonicalPath! });
  }
  return { bindings, command: { key, tokens, paths, serialization } };
}

function parseConfigRecords(value: Buffer): Array<{ key: string; value: string }> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw integrationError();
  }
  const output: Array<{ key: string; value: string }> = [];
  for (const record of text.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\n");
    if (separator < 1) throw integrationError();
    const key = record.slice(0, separator).toLocaleLowerCase("en-US");
    const child = record.slice(separator + 1).trim();
    if (!child || /[\u0000\r\n]/u.test(key)) throw integrationError();
    output.push({ key, value: child });
  }
  return output;
}

function identitiesDigest(identities: readonly GitIntegrationReviewBindingV4[]): string {
  return sha256Git(JSON.stringify({
    implementationRevision: INTEGRATION_IMPLEMENTATION_REVISION,
    identities: identities.map((identity) => ({
      kind: identity.kind,
      configKeyDigest: identity.configKeyDigest,
      executableDigest: identity.executableDigest,
      contentDigest: identity.contentDigest,
      stableIdentity: identity.stableIdentity
    }))
  }));
}

function reviewBinding(identity: GitIntegrationBindingV4): GitIntegrationReviewBindingV4 {
  return Object.freeze({
    kind: identity.kind,
    configKeyDigest: identity.configKeyDigest,
    executableDigest: identity.executableDigest,
    contentDigest: identity.contentDigest,
    canonicalPath: identity.canonicalPath,
    stableIdentity: identity.stableIdentity
  });
}

async function readStableConfig(repository: GitRepositoryIdentity): Promise<{
  bytes: Buffer;
  digest: string;
  identity: string;
}> {
  const file = path.join(repository.commonDir, "config");
  const lexical = await fsp.lstat(file, { bigint: true }).catch(() => {
    throw integrationError();
  });
  if (
    !lexical.isFile() ||
    lexical.isSymbolicLink() ||
    lexical.nlink !== 1n ||
    lexical.size < 1n ||
    lexical.size > 1024n * 1024n
  ) throw integrationError();
  const handle = await fsp.open(file, "r").catch(() => {
    throw integrationError();
  });
  try {
    const [bytes, stable] = await Promise.all([handle.readFile(), handle.stat({ bigint: true })]);
    if (
      !stable.isFile() ||
      stable.nlink !== 1n ||
      stable.dev !== lexical.dev ||
      stable.ino !== lexical.ino ||
      stable.size !== lexical.size ||
      stable.mtimeNs !== lexical.mtimeNs
    ) throw integrationError();
    return {
      bytes,
      digest: sha256Git(bytes),
      identity: sha256Git(`${stable.dev}:${stable.ino}:${stable.size}:${stable.mtimeNs}:${stable.nlink}`)
    };
  } finally {
    await handle.close();
  }
}

function commandToken(value: string): string {
  if (!value || /[\u0000\r\n"]/u.test(value)) throw integrationError();
  return `"${value}"`;
}

async function removePrivateConfigKey(
  executor: GitCommandExecutor,
  configPath: string,
  key: string,
  required: boolean
): Promise<void> {
  const options = { stdoutLimitBytes: 256, stderrLimitBytes: 4096, timeoutMs: 30_000 };
  const removed = await executor.run(null, ["config", "--file", configPath, "--unset-all", key], options);
  if (
    removed.timedOut ||
    removed.stdoutTruncated ||
    removed.stderrTruncated ||
    (removed.status !== 0 && !(removed.status === 5 && !required))
  ) throw integrationError();
  const verified = await executor.run(null, ["config", "--file", configPath, "--get-all", key], options);
  if (
    verified.timedOut ||
    verified.stdoutTruncated ||
    verified.stderrTruncated ||
    verified.status !== 1 ||
    verified.stdout.length !== 0
  ) throw integrationError();
}

interface DiscoveredIntegrationsV4 {
  identities: GitIntegrationBindingV4[];
  hooksPath: string;
  configBytes: Buffer;
  configDigest: string;
  configIdentity: string;
  commands: GitIntegrationCommandV4[];
}

export class GitIntegrationGateV4 {
  constructor(private readonly options: {
    executor: GitCommandExecutor;
    reviews: GitReviewTokenServiceV4;
    enabled: boolean;
  }) {}

  get enabled(): boolean {
    return this.options.enabled;
  }

  async #discover(repository: GitRepositoryIdentity): Promise<DiscoveredIntegrationsV4> {
    if (!this.options.enabled) {
      return {
        identities: [],
        hooksPath: "",
        configBytes: Buffer.alloc(0),
        configDigest: sha256Git(Buffer.alloc(0)),
        configIdentity: sha256Git("disabled"),
        commands: []
      };
    }
    const configBefore = await readStableConfig(repository);
    const result = await this.options.executor.run(repository, [
      "config", "--local", "--no-includes", "--null", "--get-regexp",
      INTEGRATION_CONFIG_PATTERN
    ], { stdoutLimitBytes: 128 * 1024 });
    if (
      result.timedOut ||
      result.stdoutTruncated ||
      result.stderrTruncated ||
      (result.status !== 0 && result.status !== 1)
    ) throw integrationError();
    const records = result.status === 1 ? [] : parseConfigRecords(result.stdout);
    const identities: GitIntegrationBindingV4[] = [];
    const commands: GitIntegrationCommandV4[] = [];
    let hooksRoot = path.join(repository.commonDir, "hooks");
    let signingEnabled: boolean | null = null;
    let signingFormat: "openpgp" | "x509" | "ssh" = "openpgp";
    let signingFormatSeen = false;
    let signingKeyPresent = false;
    const signingPrograms = new Map<string, Array<{ key: string; value: string }>>();
    const signingDefaultKeyCommands: Array<{ key: string; value: string }> = [];
    const executableBudget: ExecutableDiscoveryBudgetV4 = { cache: new Map(), totalBytes: 0n };
    for (const record of records) {
      if (record.key.startsWith("include.") || record.key.startsWith("includeif.")) {
        throw integrationError();
      }
      if (record.key === "core.attributesfile") throw integrationError();
      if (record.key === "core.hookspath") {
        if (
          !record.value ||
          record.value.includes("\0") ||
          (!path.isAbsolute(record.value) && record.value.split(/[\\/]/u).some((segment) => segment === ".."))
        ) throw integrationError();
        hooksRoot = path.resolve(repository.worktreeRoot, record.value);
        continue;
      }
      if (record.key === "commit.gpgsign") {
        if (signingEnabled !== null) throw integrationError();
        if (/^(?:true|yes|on|1)$/iu.test(record.value)) signingEnabled = true;
        else if (/^(?:false|no|off|0)$/iu.test(record.value)) signingEnabled = false;
        else throw integrationError();
        identities.push(bindConfigurationFact("signing", record.key, record.value));
        continue;
      }
      if (record.key === "gpg.format") {
        if (signingFormatSeen || !/^(?:openpgp|x509|ssh)$/u.test(record.value)) throw integrationError();
        signingFormat = record.value as "openpgp" | "x509" | "ssh";
        signingFormatSeen = true;
        identities.push(bindConfigurationFact("signing", record.key, record.value));
        continue;
      }
      if (
        record.key === "gpg.program" ||
        record.key === "gpg.openpgp.program" ||
        record.key === "gpg.x509.program" ||
        record.key === "gpg.ssh.program"
      ) {
        const values = signingPrograms.get(record.key) ?? [];
        values.push(record);
        signingPrograms.set(record.key, values);
        continue;
      }
      if (record.key === "gpg.ssh.defaultkeycommand") {
        signingDefaultKeyCommands.push(record);
        continue;
      }
      if (
        record.key === "user.signingkey" ||
        record.key === "user.name" ||
        record.key === "user.email"
      ) {
        if (record.key === "user.signingkey") signingKeyPresent = true;
        identities.push(bindConfigurationFact(
          record.key.startsWith("user.") && record.key !== "user.signingkey" ? "identity" : "signing",
          record.key,
          record.value
        ));
        continue;
      }
      if (
        record.key.endsWith(".required") ||
        record.key.endsWith(".recursive") ||
        record.key === "merge.default" ||
        record.key === "merge.renormalize"
      ) {
        identities.push(bindConfigurationFact(
          record.key.startsWith("filter.") ? "filter" : "merge_driver",
          record.key,
          record.value
        ));
        continue;
      }
      if (record.key === "core.fsmonitor" && /^(?:false|no|off|0)$/iu.test(record.value)) {
        identities.push(bindConfigurationFact("fsmonitor", record.key, record.value));
        continue;
      }
      const kind = record.key === "core.fsmonitor"
        ? "fsmonitor"
        : record.key.startsWith("filter.")
          ? "filter"
          : record.key.startsWith("merge.")
            ? "merge_driver"
            : "signing";
      const bound = await bindCommand(
        kind,
        record.key,
        record.value,
        repository,
        executableBudget
      );
      identities.push(...bound.bindings);
      commands.push(bound.command);
    }
    if (signingEnabled === true) {
      if (!signingKeyPresent || signingDefaultKeyCommands.length !== 0) throw integrationError();
      const effectiveKey = signingFormat === "openpgp"
        ? (signingPrograms.has("gpg.openpgp.program") ? "gpg.openpgp.program" : "gpg.program")
        : `gpg.${signingFormat}.program`;
      const effectivePrograms = signingPrograms.get(effectiveKey) ?? [];
      if (effectivePrograms.length !== 1) throw integrationError();
      const program = effectivePrograms[0];
      const bound = await bindCommand(
        "signing",
        program.key,
        program.value,
        repository,
        executableBudget,
        "program"
      );
      identities.push(...bound.bindings);
      commands.push(bound.command);
      for (const [key, values] of signingPrograms) {
        if (key === effectiveKey) continue;
        for (const value of values) identities.push(bindConfigurationFact("signing", value.key, value.value));
      }
    } else {
      for (const values of signingPrograms.values()) {
        for (const program of values) {
          identities.push(bindConfigurationFact("signing", program.key, program.value));
        }
      }
      for (const command of signingDefaultKeyCommands) {
        identities.push(bindConfigurationFact("signing", command.key, command.value));
      }
    }
    const hooksRootIdentity = await fsp.lstat(hooksRoot, { bigint: true }).catch(
      (error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error)
    );
    if (hooksRootIdentity) {
      if (!hooksRootIdentity.isDirectory() || hooksRootIdentity.isSymbolicLink()) throw integrationError();
      for (const hook of HOOK_NAMES) {
        const candidate = path.join(hooksRoot, hook);
        const exists = await fsp.lstat(candidate, { bigint: true }).catch(
          (error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error)
        );
        if (!exists) continue;
        identities.push(await bindExecutable("hook", `hook:${hook}`, candidate, hook, executableBudget, hook));
      }
    }
    identities.sort((left, right) =>
      `${left.kind}:${left.configKeyDigest}:${left.contentDigest}`.localeCompare(
        `${right.kind}:${right.configKeyDigest}:${right.contentDigest}`,
        "en"
      )
    );
    if (identities.length > 128) throw new Error("GIT_SCAN_LIMIT");
    const configAfter = await readStableConfig(repository);
    if (
      configAfter.digest !== configBefore.digest ||
      configAfter.identity !== configBefore.identity
    ) throw new Error("GIT_STATE_CHANGED");
    return {
      identities,
      hooksPath: await fsp.realpath(hooksRoot).catch(() => hooksRoot),
      configBytes: configAfter.bytes,
      configDigest: configAfter.digest,
      configIdentity: configAfter.identity,
      commands
    };
  }

  async discover(repository: GitRepositoryIdentity): Promise<GitIntegrationBindingV4[]> {
    if (!this.options.enabled) return [];
    return (await this.#discover(repository)).identities;
  }

  async review(input: {
    workspaceId: string;
    repository: GitRepositoryIdentity;
    semanticStateDigest: string;
  }): Promise<{ reviewToken: string; identities: GitIntegrationIdentityV4[]; identitiesDigest: string }> {
    if (
      !this.options.enabled ||
      !/^[a-f0-9]{64}$/u.test(input.semanticStateDigest)
    ) throw integrationError();
    const discovered = await this.#discover(input.repository);
    const identities = discovered.identities;
    const reviewedIdentities = identities.map(reviewBinding);
    const digest = identitiesDigest(reviewedIdentities);
    const reviewToken = this.options.reviews.mint<GitIntegrationReviewFactsV4>("git_integration", {
      workspaceId: input.workspaceId,
      repositoryId: input.repository.repositoryId,
      repositoryFingerprint: input.repository.repositoryFingerprint,
      capabilityRevision: input.repository.capabilityRevision,
      identities: reviewedIdentities,
      identitiesDigest: digest,
      semanticStateDigest: input.semanticStateDigest,
      hooksPath: discovered.hooksPath,
      configDigest: discovered.configDigest,
      implementationRevision: INTEGRATION_IMPLEMENTATION_REVISION
    });
    return {
      reviewToken,
      identities: reviewedIdentities.map(({ kind, configKeyDigest, executableDigest, contentDigest }) => ({
        kind,
        configKeyDigest,
        executableDigest,
        contentDigest
      })),
      identitiesDigest: digest
    };
  }

  inspect(reviewToken: string): GitIntegrationReviewFactsV4 {
    if (!this.options.enabled) throw integrationError();
    const reviewed = this.options.reviews.inspect<GitIntegrationReviewFactsV4>(reviewToken, "git_integration");
    if (reviewed.implementationRevision !== INTEGRATION_IMPLEMENTATION_REVISION) {
      throw new Error("GIT_STATE_TOKEN_INVALID");
    }
    return reviewed;
  }

  approvalPreview(reviewToken: string): string[] {
    const reviewed = this.inspect(reviewToken);
    const byPath = new Map<string, Set<string>>();
    for (const identity of reviewed.identities) {
      if (!identity.canonicalPath) continue;
      const kinds = byPath.get(identity.canonicalPath) ?? new Set<string>();
      kinds.add(identity.kind);
      byPath.set(identity.canonicalPath, kinds);
    }
    if (byPath.size > MAX_INTEGRATION_EXECUTABLES) throw new Error("GIT_SCAN_LIMIT");
    return [...byPath.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([canonicalPath, kinds]) => `${[...kinds].sort().join("+")}: ${canonicalPath}`);
  }

  async #materialize(
    discovered: DiscoveredIntegrationsV4,
    request: GitApprovedIntegrationRequest
  ): Promise<{ request: GitApprovedIntegrationRequest & {
    integrationGitDir: string;
    integrationConfigOverrides: string[];
    hooksPath: string;
  }; cleanup: () => Promise<void> }> {
    const privateRoot = await this.options.executor.createPrivateDirectory?.("git-integration-bundle");
    if (!privateRoot || !this.options.executor.removePrivateDirectory) throw integrationError();
    const hooksPath = path.join(privateRoot, "hooks");
    const binPath = path.join(privateRoot, "bin");
    const integrationGitDir = request.operation === "commit"
      ? request.shadowGitDir
      : path.join(privateRoot, "repo.git");
    const snapshotPaths = new Map<string, string>();
    try {
      await Promise.all([
        fsp.mkdir(hooksPath, { mode: 0o700 }),
        fsp.mkdir(binPath, { mode: 0o700 }),
        fsp.mkdir(path.join(integrationGitDir, "objects"), { recursive: true, mode: 0o700 }),
        request.operation === "commit"
          ? Promise.resolve()
          : fsp.mkdir(path.join(integrationGitDir, "refs", "heads"), { recursive: true, mode: 0o700 })
      ]);
      if (request.operation !== "commit") {
        await fsp.writeFile(
          path.join(integrationGitDir, "HEAD"),
          "ref: refs/heads/codexgpt-integration\n",
          { flag: "wx", mode: 0o600 }
        );
      }
      const privateConfigPath = path.join(integrationGitDir, "config");
      await fsp.writeFile(privateConfigPath, discovered.configBytes, {
        flag: "wx",
        mode: 0o600
      });
      for (const key of [...new Set(discovered.commands.map((command) => command.key))].sort()) {
        await removePrivateConfigKey(this.options.executor, privateConfigPath, key, true);
      }
      await removePrivateConfigKey(this.options.executor, privateConfigPath, "core.hookspath", false);
      let executableIndex = 0;
      for (const identity of discovered.identities) {
        if (!identity.snapshotContent || !identity.canonicalPath) continue;
        if (identity.hookName) {
          await fsp.writeFile(path.join(hooksPath, identity.hookName), identity.snapshotContent, {
            flag: "wx",
            mode: 0o700
          });
          continue;
        }
        const cacheKey = process.platform === "win32"
          ? identity.canonicalPath.toLocaleLowerCase("en-US")
          : identity.canonicalPath;
        if (snapshotPaths.has(cacheKey)) continue;
        const extension = path.extname(identity.canonicalPath);
        const destination = path.join(binPath, `integration-${executableIndex}${extension}`);
        executableIndex += 1;
        await fsp.writeFile(destination, identity.snapshotContent, { flag: "wx", mode: 0o700 });
        snapshotPaths.set(cacheKey, destination);
      }
      const integrationConfigOverrides = discovered.commands.map((command) => {
        const tokens = [...command.tokens];
        for (const item of command.paths) {
          const cacheKey = process.platform === "win32"
            ? item.canonicalPath.toLocaleLowerCase("en-US")
            : item.canonicalPath;
          const snapshot = snapshotPaths.get(cacheKey);
          if (!snapshot) throw integrationError();
          const original = tokens[item.tokenIndex];
          const separator = original.indexOf("=");
          tokens[item.tokenIndex] = separator >= 0
            ? `${original.slice(0, separator + 1)}${snapshot}`
            : snapshot;
        }
        const value = command.serialization === "program"
          ? tokens[0]
          : tokens.map(commandToken).join(" ");
        return `${command.key}=${value}`;
      });
      return {
        request: {
          ...request,
          integrationGitDir,
          integrationConfigOverrides,
          hooksPath
        },
        cleanup: () => this.options.executor.removePrivateDirectory!(privateRoot)
      };
    } catch (error) {
      await this.options.executor.removePrivateDirectory(privateRoot).catch(() => {});
      throw error;
    }
  }

  async execute(input: {
    workspaceId: string;
    repository: GitRepositoryIdentity;
    reviewToken: string;
    authorization: AuthorizationAuditEventV4 | null | undefined;
    request: GitApprovedIntegrationRequest;
    semanticStateDigest: string;
    expectedToolName: "git_stage" | "git_commit" | "merge_task_worktree";
    expectedCanonicalAction: "stage" | "commit" | "task_merge_prepare_review" | "task_merge_prepare_finalize" | "task_merge_execute";
  }): Promise<{ result: GitExecutionResult; identities: GitIntegrationIdentityV4[] }> {
    if (
      !this.options.enabled ||
      !input.authorization ||
      input.authorization.outcome !== "allow" ||
      input.authorization.riskClass !== "R3" ||
      !input.authorization.approvalId ||
      !input.authorization.grantId ||
      input.authorization.toolName !== input.expectedToolName ||
      input.authorization.canonicalAction !== input.expectedCanonicalAction ||
      input.authorization.workspaceId !== input.workspaceId ||
      input.authorization.repositoryId !== input.repository.repositoryId ||
      !this.options.executor.runApprovedIntegration
    ) throw integrationError();
    const reviewed = this.inspect(input.reviewToken);
    if (
      reviewed.workspaceId !== input.workspaceId ||
      reviewed.repositoryId !== input.repository.repositoryId ||
      reviewed.repositoryFingerprint !== input.repository.repositoryFingerprint ||
      reviewed.capabilityRevision !== input.repository.capabilityRevision ||
      reviewed.semanticStateDigest !== input.semanticStateDigest
    ) {
      this.options.reviews.consume<GitIntegrationReviewFactsV4>(input.reviewToken, "git_integration");
      throw new Error("GIT_STATE_CHANGED");
    }
    const current = await this.#discover(input.repository);
    if (
      identitiesDigest(current.identities) !== reviewed.identitiesDigest ||
      current.hooksPath !== reviewed.hooksPath ||
      current.configDigest !== reviewed.configDigest
    ) {
      this.options.reviews.consume<GitIntegrationReviewFactsV4>(input.reviewToken, "git_integration");
      throw new Error("GIT_STATE_CHANGED");
    }
    this.options.reviews.consume<GitIntegrationReviewFactsV4>(input.reviewToken, "git_integration");
    const materialized = await this.#materialize(current, input.request);
    try {
      const result = await this.options.executor.runApprovedIntegration(input.repository, materialized.request);
      return {
        result,
        identities: current.identities.map(({ kind, configKeyDigest, executableDigest, contentDigest }) => ({
          kind,
          configKeyDigest,
          executableDigest,
          contentDigest
        }))
      };
    } finally {
      await materialized.cleanup();
    }
  }
}

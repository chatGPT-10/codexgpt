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

interface GitIntegrationBindingV4 extends GitIntegrationIdentityV4 {
  canonicalPath: string | null;
  stableIdentity: string | null;
}

export interface GitIntegrationReviewFactsV4 {
  workspaceId: string;
  repositoryId: string;
  repositoryFingerprint: string;
  capabilityRevision: string;
  identities: GitIntegrationBindingV4[];
  identitiesDigest: string;
  semanticStateDigest: string;
  hooksPath: string;
}

const HOOK_NAMES = Object.freeze([
  "pre-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "post-rewrite",
  "reference-transaction",
  "pre-merge-commit",
  "post-merge"
]);
const MAX_INTEGRATION_EXECUTABLE_BYTES = 256n * 1024n * 1024n;

function integrationError(): Error {
  return new Error("GIT_INTEGRATION_REQUIRED");
}

function commandExecutable(value: string): string {
  const trimmed = value.trim();
  if (
    /[\u0000\r\n&|;<>`]/u.test(trimmed) ||
    trimmed.includes("$(") ||
    trimmed.includes("${")
  ) throw integrationError();
  const quoted = /^"([^"]+)"(?:\s|$)/u.exec(trimmed);
  const executable = quoted?.[1] ?? /^(\S+)/u.exec(trimmed)?.[1] ?? "";
  if (!path.isAbsolute(executable) || /[\u0000\r\n]/u.test(executable)) throw integrationError();
  return executable;
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
    stableIdentity: null
  });
}

async function bindExecutable(
  kind: GitIntegrationIdentityV4["kind"],
  key: string,
  executable: string,
  value: string
): Promise<GitIntegrationBindingV4> {
  const canonicalPath = await fsp.realpath(executable).catch(() => {
    throw integrationError();
  });
  const lexical = await fsp.lstat(canonicalPath, { bigint: true }).catch(() => {
    throw integrationError();
  });
  if (
    !lexical.isFile() ||
    lexical.isSymbolicLink() ||
    lexical.nlink !== 1n ||
    lexical.size > MAX_INTEGRATION_EXECUTABLE_BYTES
  ) throw integrationError();
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
    return Object.freeze({
      kind,
      configKeyDigest: sha256Git(key),
      executableDigest: sha256Git(canonicalPath),
      contentDigest: sha256Git(Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0]), content])),
      canonicalPath,
      stableIdentity: sha256Git(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.nlink}`)
    });
  } finally {
    await handle.close();
  }
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

function identitiesDigest(identities: readonly GitIntegrationBindingV4[]): string {
  return sha256Git(JSON.stringify(identities.map((identity) => ({
    kind: identity.kind,
    configKeyDigest: identity.configKeyDigest,
    executableDigest: identity.executableDigest,
    contentDigest: identity.contentDigest,
    stableIdentity: identity.stableIdentity
  }))));
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

  async #discover(repository: GitRepositoryIdentity): Promise<{
    identities: GitIntegrationBindingV4[];
    hooksPath: string;
  }> {
    if (!this.options.enabled) return { identities: [], hooksPath: "" };
    const result = await this.options.executor.run(repository, [
      "config", "--local", "--no-includes", "--null", "--get-regexp",
      "^(core\\.hooksPath|core\\.fsmonitor|commit\\.gpgsign|gpg\\.(program|format)|gpg\\.ssh\\.program|user\\.(name|email|signingkey)|filter\\..*\\.(clean|smudge|process|required)|merge\\..*\\.(driver|recursive))$"
    ], { stdoutLimitBytes: 128 * 1024 });
    if (
      result.timedOut ||
      result.stdoutTruncated ||
      result.stderrTruncated ||
      (result.status !== 0 && result.status !== 1)
    ) throw integrationError();
    const records = result.status === 1 ? [] : parseConfigRecords(result.stdout);
    const identities: GitIntegrationBindingV4[] = [];
    let hooksRoot = path.join(repository.gitDir, "hooks");
    let signingEnabled = false;
    const signingPrograms: Array<{ key: string; value: string }> = [];
    for (const record of records) {
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
        if (/^(?:true|yes|on|1)$/iu.test(record.value)) signingEnabled = true;
        else if (!/^(?:false|no|off|0)$/iu.test(record.value)) throw integrationError();
        identities.push(bindConfigurationFact("signing", record.key, record.value));
        continue;
      }
      if (record.key === "gpg.program" || record.key === "gpg.ssh.program") {
        signingPrograms.push(record);
        continue;
      }
      if (
        record.key === "gpg.format" ||
        record.key === "user.signingkey" ||
        record.key === "user.name" ||
        record.key === "user.email"
      ) {
        identities.push(bindConfigurationFact(
          record.key.startsWith("user.") && record.key !== "user.signingkey" ? "identity" : "signing",
          record.key,
          record.value
        ));
        continue;
      }
      if (record.key.endsWith(".required") || record.key.endsWith(".recursive")) {
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
      identities.push(await bindExecutable(
        kind,
        record.key,
        commandExecutable(record.value),
        record.value
      ));
    }
    if (signingEnabled) {
      if (signingPrograms.length !== 1) throw integrationError();
      const program = signingPrograms[0];
      identities.push(await bindExecutable(
        "signing",
        program.key,
        commandExecutable(program.value),
        program.value
      ));
    } else {
      for (const program of signingPrograms) {
        identities.push(bindConfigurationFact("signing", program.key, program.value));
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
        identities.push(await bindExecutable("hook", `hook:${hook}`, candidate, hook));
      }
    }
    identities.sort((left, right) =>
      `${left.kind}:${left.configKeyDigest}:${left.contentDigest}`.localeCompare(
        `${right.kind}:${right.configKeyDigest}:${right.contentDigest}`,
        "en"
      )
    );
    if (identities.length > 128) throw new Error("GIT_SCAN_LIMIT");
    return { identities, hooksPath: await fsp.realpath(hooksRoot).catch(() => hooksRoot) };
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
    const digest = identitiesDigest(identities);
    const reviewToken = this.options.reviews.mint<GitIntegrationReviewFactsV4>("git_integration", {
      workspaceId: input.workspaceId,
      repositoryId: input.repository.repositoryId,
      repositoryFingerprint: input.repository.repositoryFingerprint,
      capabilityRevision: input.repository.capabilityRevision,
      identities,
      identitiesDigest: digest,
      semanticStateDigest: input.semanticStateDigest,
      hooksPath: discovered.hooksPath
    });
    return {
      reviewToken,
      identities: identities.map(({ kind, configKeyDigest, executableDigest, contentDigest }) => ({
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
    return this.options.reviews.inspect<GitIntegrationReviewFactsV4>(reviewToken, "git_integration");
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
      current.hooksPath !== reviewed.hooksPath
    ) {
      this.options.reviews.consume<GitIntegrationReviewFactsV4>(input.reviewToken, "git_integration");
      throw new Error("GIT_STATE_CHANGED");
    }
    this.options.reviews.consume<GitIntegrationReviewFactsV4>(input.reviewToken, "git_integration");
    const request = input.request.operation === "commit"
      ? { ...input.request, hooksPath: reviewed.hooksPath }
      : input.request;
    const result = await this.options.executor.runApprovedIntegration(input.repository, request);
    return {
      result,
      identities: current.identities.map(({ kind, configKeyDigest, executableDigest, contentDigest }) => ({
        kind,
        configKeyDigest,
        executableDigest,
        contentDigest
      }))
    };
  }
}

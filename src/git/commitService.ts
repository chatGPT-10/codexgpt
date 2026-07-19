import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import { hasSecretValue } from "../redact.js";
import { admitGitRepository } from "./repositoryIdentity.js";
import type { GitIndexTokenServiceV4 } from "./indexService.js";
import {
  GitMutationContextV4,
  gitMutationError,
  runGitRequired,
  sha256Git
} from "./mutationContext.js";
import type { GitIntegrationGateV4 } from "./integrations.js";
import { GitObjectQuarantine } from "./objectQuarantine.js";

function safeUtf8(value: Buffer, code: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value).trim();
  } catch {
    throw gitMutationError(code);
  }
}

function parseNulPaths(value: Buffer): string[] {
  return safeUtf8(value, "GIT_REPOSITORY_UNSAFE").split("\0").filter(Boolean);
}

async function localIdentity(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>
): Promise<{ name: string; email: string }> {
  const read = async (key: "user.name" | "user.email") => {
    const result = await context.options.executor.run(repository, [
      "config", "--local", "--no-includes", "--get", key
    ], { stdoutLimitBytes: 1024 });
    if (result.status !== 0 || result.timedOut || result.stdoutTruncated || result.stderrTruncated) {
      throw gitMutationError("GIT_IDENTITY_REQUIRED");
    }
    const value = safeUtf8(result.stdout, "GIT_IDENTITY_REQUIRED");
    if (!value || value.length > 320 || /[\u0000\r\n]/u.test(value) || hasSecretValue(value)) {
      throw gitMutationError("GIT_IDENTITY_REQUIRED");
    }
    return value;
  };
  return { name: await read("user.name"), email: await read("user.email") };
}

async function stagedPathsAndCounts(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  guard: PathGuard
): Promise<{
  paths: string[];
  counts: { added: number; modified: number; deleted: number; renamed: number };
}> {
  const result = await runGitRequired(context.options.executor, repository, [
    "diff", "--cached", "--name-status", "-z", "--no-renames", "--"
  ]);
  const fields = parseNulPaths(result.stdout);
  if (fields.length === 0 || fields.length % 2 !== 0) throw gitMutationError("GIT_STATE_CHANGED");
  const paths: string[] = [];
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0 };
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const relPath = fields[index + 1];
    if (!/^[AMD]$/.test(status) || guard.isBlockedRelativePath(relPath) || hasSecretValue(relPath)) {
      throw gitMutationError(status && /^[AMD]$/.test(status) ? "GIT_PATH_BLOCKED" : "GIT_UNMERGED");
    }
    if (status === "A") counts.added += 1;
    else if (status === "M") counts.modified += 1;
    else counts.deleted += 1;
    paths.push(relPath);
  }
  return { paths, counts };
}

async function scanStagedBlobs(
  context: GitMutationContextV4,
  repository: Awaited<ReturnType<typeof admitGitRepository>>,
  paths: readonly string[]
): Promise<void> {
  let total = 0;
  for (const relPath of paths) {
    const entry = await context.options.executor.run(
      repository,
      ["ls-files", "--stage", "-z", "--", relPath],
      { stdoutLimitBytes: 4096 }
    );
    if (entry.status !== 0 || entry.timedOut || entry.stdoutTruncated || entry.stderrTruncated) {
      throw gitMutationError("GIT_INDEX_CHANGED");
    }
    if (entry.stdout.length === 0) continue;
    const match = /^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t/.exec(entry.stdout.toString("utf8"));
    if (!match) throw gitMutationError("GIT_UNMERGED");
    const blob = await runGitRequired(
      context.options.executor,
      repository,
      ["cat-file", "blob", match[2]],
      { stdoutLimitBytes: 16 * 1024 * 1024 }
    );
    total += blob.stdout.length;
    if (total > 32 * 1024 * 1024) throw gitMutationError("GIT_SCAN_LIMIT");
    if (hasSecretValue(blob.stdout.toString("latin1"))) throw gitMutationError("GIT_SECRET_BLOCKED");
  }
}

async function readStableFile(file: string, maximum: number): Promise<Buffer> {
  const lexical = await fsp.lstat(file, { bigint: true }).catch(() => {
    throw gitMutationError("GIT_REPOSITORY_UNSAFE");
  });
  if (
    !lexical.isFile() ||
    lexical.isSymbolicLink() ||
    lexical.nlink !== 1n ||
    lexical.size > BigInt(maximum)
  ) throw gitMutationError("GIT_REPOSITORY_UNSAFE");
  const handle = await fsp.open(file, "r").catch(() => {
    throw gitMutationError("GIT_REPOSITORY_UNSAFE");
  });
  try {
    const [bytes, stat] = await Promise.all([handle.readFile(), handle.stat({ bigint: true })]);
    if (
      !stat.isFile() ||
      stat.nlink !== 1n ||
      stat.dev !== lexical.dev ||
      stat.ino !== lexical.ino ||
      stat.size !== lexical.size ||
      stat.mtimeNs !== lexical.mtimeNs
    ) throw gitMutationError("GIT_REPOSITORY_UNSAFE");
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseCommitObject(
  value: Buffer,
  oidWidth: 40 | 64
): { treeOid: string; parentOids: string[]; signed: boolean; message: Buffer } {
  const separator = value.indexOf(Buffer.from("\n\n"));
  if (separator < 1) throw gitMutationError("GIT_STATE_CHANGED");
  let headers: string;
  try {
    headers = new TextDecoder("utf-8", { fatal: true }).decode(value.subarray(0, separator));
  } catch {
    throw gitMutationError("GIT_STATE_CHANGED");
  }
  const tree = new RegExp(`^tree ([a-f0-9]{${oidWidth}})$`, "mu").exec(headers)?.[1];
  const parents = [...headers.matchAll(new RegExp(`^parent ([a-f0-9]{${oidWidth}})$`, "gmu"))]
    .map((match) => match[1]);
  if (!tree || parents.length < 1 || parents.length > 2) throw gitMutationError("GIT_STATE_CHANGED");
  return {
    treeOid: tree,
    parentOids: parents,
    signed: /^gpgsig /mu.test(headers),
    message: value.subarray(separator + 2)
  };
}

async function createShadowGitDirectory(input: {
  privateRoot: string;
  headOid: string;
  indexBytes: Buffer;
}): Promise<{
  shadowGitDir: string;
  privateIndex: string;
  quarantineRoot: string;
  shadowRefFile: string;
}> {
  const shadowGitDir = path.join(input.privateRoot, "shadow.git");
  const privateIndex = path.join(input.privateRoot, "index");
  const quarantineRoot = path.join(input.privateRoot, "objects");
  const shadowRefFile = path.join(shadowGitDir, "refs", "heads", "codexpro-integration");
  await fsp.mkdir(path.dirname(shadowRefFile), { recursive: true, mode: 0o700 });
  await fsp.mkdir(quarantineRoot, { mode: 0o700 });
  await fsp.writeFile(privateIndex, input.indexBytes, { flag: "wx", mode: 0o600 });
  await fsp.writeFile(path.join(shadowGitDir, "HEAD"), "ref: refs/heads/codexpro-integration\n", {
    flag: "wx",
    mode: 0o600
  });
  await fsp.writeFile(shadowRefFile, `${input.headOid}\n`, { flag: "wx", mode: 0o600 });
  return { shadowGitDir, privateIndex, quarantineRoot, shadowRefFile };
}

export class GitCommitServiceV4 {
  constructor(
    private readonly context: GitMutationContextV4,
    private readonly indexTokens: GitIndexTokenServiceV4,
    private readonly hooks: {
      beforeRefUpdate?: () => void | Promise<void>;
      integrationGate?: GitIntegrationGateV4;
    } = {}
  ) {}

  async commit(input: {
    workspace: Workspace;
    guard: PathGuard;
    indexToken: string;
    message: string;
  }): Promise<{
    repository_id: string;
    commit_oid: string;
    tree_oid: string;
    parent_oids: string[];
    file_counts: { added: number; modified: number; deleted: number; renamed: number };
    hooks_executed: false;
    signature: "none";
    state_token: string;
    repository_integrations: "disabled";
    execution_isolation: "none";
  }> {
    if (!input.message || Buffer.byteLength(input.message, "utf8") > 16 * 1024 || hasSecretValue(input.message)) {
      throw gitMutationError("GIT_SECRET_BLOCKED");
    }
    const token = this.indexTokens.inspect(input.indexToken);
    if (
      token.workspaceId !== input.workspace.id ||
      token.capabilityRevision !== this.context.options.executor.capabilityRevision
    ) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const repository = await this.context.admitWorkspace(input.workspace);
    if (
      repository.repositoryId !== token.repositoryId ||
      repository.repositoryFingerprint !== token.repositoryFingerprint
    ) throw gitMutationError("GIT_INDEX_CHANGED");
    const headRefResult = await this.context.options.executor.run(repository, [
      "symbolic-ref", "-q", "HEAD"
    ], { stdoutLimitBytes: 512 });
    if (headRefResult.status !== 0) throw gitMutationError("GIT_REF_CHANGED");
    const headRef = safeUtf8(headRefResult.stdout, "GIT_REF_CHANGED");
    if (!headRef.startsWith("refs/heads/")) throw gitMutationError("GIT_REF_CHANGED");
    const headOid = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["rev-parse", "--verify", "HEAD"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_REF_CHANGED");
    if (headOid !== token.headOid) throw gitMutationError("GIT_REF_CHANGED");
    const treeOid = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["write-tree"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_INDEX_CHANGED");
    if (treeOid !== token.indexTreeOid) throw gitMutationError("GIT_INDEX_CHANGED");
    const staged = await stagedPathsAndCounts(this.context, repository, input.guard);
    await scanStagedBlobs(this.context, repository, staged.paths);
    const identity = await localIdentity(this.context, repository);
    const finalHead = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["rev-parse", "--verify", "HEAD"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_REF_CHANGED");
    const finalTree = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["write-tree"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_INDEX_CHANGED");
    if (finalHead !== headOid) throw gitMutationError("GIT_REF_CHANGED");
    if (finalTree !== treeOid) throw gitMutationError("GIT_INDEX_CHANGED");
    const commitObject = await runGitRequired(
      this.context.options.executor,
      repository,
      ["commit-tree", treeOid, "-p", headOid],
      {
        stdin: Buffer.from(input.message, "utf8"),
        stdoutLimitBytes: 256,
        identity: {
          authorName: identity.name,
          authorEmail: identity.email,
          committerName: identity.name,
          committerEmail: identity.email
        }
      }
    );
    const commitOid = safeUtf8(commitObject.stdout, "GIT_STATE_CHANGED");
    await this.hooks.beforeRefUpdate?.();
    const update = await this.context.options.executor.run(repository, [
      "update-ref", "--no-deref", headRef, commitOid, headOid
    ]);
    if (update.status !== 0 || update.timedOut || update.stdoutTruncated || update.stderrTruncated) {
      throw gitMutationError("GIT_REF_CHANGED");
    }
    this.indexTokens.revoke(input.indexToken);
    const stateToken = await this.context.refreshState({
      workspace: input.workspace,
      guard: input.guard
    });
    return {
      repository_id: repository.repositoryId,
      commit_oid: commitOid,
      tree_oid: treeOid,
      parent_oids: [headOid],
      file_counts: staged.counts,
      hooks_executed: false,
      signature: "none",
      state_token: stateToken,
      repository_integrations: "disabled",
      execution_isolation: "none"
    };
  }

  async commitApproved(input: {
    workspace: Workspace;
    guard: PathGuard;
    indexToken: string;
    message: string;
    integrationReviewToken: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }): Promise<{
    repository_id: string;
    commit_oid: string;
    tree_oid: string;
    parent_oids: string[];
    file_counts: { added: number; modified: number; deleted: number; renamed: number };
    hooks_executed: boolean;
    signature: "none" | "repository_config";
    state_token: string;
    repository_integrations: "approved_full_access";
    execution_isolation: "none";
  }> {
    if (!input.message || Buffer.byteLength(input.message, "utf8") > 16 * 1024 || hasSecretValue(input.message)) {
      throw gitMutationError("GIT_SECRET_BLOCKED");
    }
    const gate = this.hooks.integrationGate;
    if (!gate?.enabled) throw gitMutationError("GIT_INTEGRATION_REQUIRED");
    const reviewed = gate.inspect(input.integrationReviewToken);
    const token = this.indexTokens.inspect(input.indexToken);
    if (
      token.workspaceId !== input.workspace.id ||
      reviewed.workspaceId !== input.workspace.id ||
      reviewed.repositoryId !== token.repositoryId ||
      token.capabilityRevision !== this.context.options.executor.capabilityRevision
    ) throw gitMutationError("GIT_STATE_TOKEN_INVALID");
    const repository = await this.context.admitWorkspace(input.workspace);
    if (
      repository.repositoryId !== token.repositoryId ||
      repository.repositoryFingerprint !== token.repositoryFingerprint
    ) throw gitMutationError("GIT_INDEX_CHANGED");
    const headRefResult = await this.context.options.executor.run(repository, [
      "symbolic-ref", "-q", "HEAD"
    ], { stdoutLimitBytes: 512 });
    if (headRefResult.status !== 0) throw gitMutationError("GIT_REF_CHANGED");
    const headRef = safeUtf8(headRefResult.stdout, "GIT_REF_CHANGED");
    if (!headRef.startsWith("refs/heads/")) throw gitMutationError("GIT_REF_CHANGED");
    const headOid = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["rev-parse", "--verify", "HEAD"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_REF_CHANGED");
    if (headOid !== token.headOid) throw gitMutationError("GIT_REF_CHANGED");
    const treeOid = safeUtf8((await runGitRequired(
      this.context.options.executor,
      repository,
      ["write-tree"],
      { stdoutLimitBytes: 256 }
    )).stdout, "GIT_INDEX_CHANGED");
    if (treeOid !== token.indexTreeOid) throw gitMutationError("GIT_INDEX_CHANGED");
    const staged = await stagedPathsAndCounts(this.context, repository, input.guard);
    await scanStagedBlobs(this.context, repository, staged.paths);
    const liveIndex = path.join(repository.gitDir, "index");
    const indexBytes = await readStableFile(liveIndex, 32 * 1024 * 1024);
    const indexDigest = sha256Git(indexBytes);
    const privateRoot = await this.context.options.executor.createPrivateDirectory?.("git-integration-commit");
    if (!privateRoot) throw gitMutationError("GIT_CAPABILITY_UNAVAILABLE");
    try {
      const shadow = await createShadowGitDirectory({
        privateRoot,
        headOid,
        indexBytes
      });
      const executed = await gate.execute({
        workspaceId: input.workspace.id,
        repository,
        reviewToken: input.integrationReviewToken,
        authorization: input.authorization,
        semanticStateDigest: reviewed.semanticStateDigest,
        expectedToolName: "git_commit",
        expectedCanonicalAction: "commit",
        request: {
          operation: "commit",
          message: Buffer.from(`${input.message}\n`, "utf8"),
          privateIndexPath: shadow.privateIndex,
          objectDirectoryPath: shadow.quarantineRoot,
          shadowGitDir: shadow.shadowGitDir
        }
      });
      if (
        executed.result.status !== 0 ||
        executed.result.timedOut ||
        executed.result.stdoutTruncated ||
        executed.result.stderrTruncated
      ) throw gitMutationError("GIT_COMMAND_FAILED");
      const commitOid = (await readStableFile(shadow.shadowRefFile, 256)).toString("ascii").trim();
      if (!new RegExp(`^[a-f0-9]{${repository.objectFormat === "sha1" ? 40 : 64}}$`, "u").test(commitOid)) {
        throw gitMutationError("GIT_STATE_CHANGED");
      }
      const commitObject = await runGitRequired(
        this.context.options.executor,
        repository,
        ["cat-file", "commit", commitOid],
        { objectDirectoryPath: shadow.quarantineRoot, stdoutLimitBytes: 1024 * 1024 }
      );
      const parsed = parseCommitObject(
        commitObject.stdout,
        repository.objectFormat === "sha1" ? 40 : 64
      );
      if (
        parsed.treeOid !== treeOid ||
        parsed.parentOids.length !== 1 ||
        parsed.parentOids[0] !== headOid ||
        hasSecretValue(parsed.message.toString("latin1"))
      ) throw gitMutationError("GIT_STATE_CHANGED");
      const finalHead = safeUtf8((await runGitRequired(
        this.context.options.executor,
        repository,
        ["rev-parse", "--verify", "HEAD"],
        { stdoutLimitBytes: 256 }
      )).stdout, "GIT_REF_CHANGED");
      const finalTree = safeUtf8((await runGitRequired(
        this.context.options.executor,
        repository,
        ["write-tree"],
        { stdoutLimitBytes: 256 }
      )).stdout, "GIT_INDEX_CHANGED");
      const finalIndex = await readStableFile(liveIndex, 32 * 1024 * 1024);
      if (
        finalHead !== headOid ||
        finalTree !== treeOid ||
        sha256Git(finalIndex) !== indexDigest
      ) throw gitMutationError(finalHead !== headOid ? "GIT_REF_CHANGED" : "GIT_INDEX_CHANGED");
      await new GitObjectQuarantine({ journal: () => undefined }).promote({
        repository,
        quarantineRoot: shadow.quarantineRoot,
        objects: [{ oid: commitOid }]
      });
      await this.hooks.beforeRefUpdate?.();
      const update = await this.context.options.executor.run(repository, [
        "update-ref", "--no-deref", headRef, commitOid, headOid
      ]);
      if (update.status !== 0 || update.timedOut || update.stdoutTruncated || update.stderrTruncated) {
        throw gitMutationError("GIT_REF_CHANGED");
      }
      this.indexTokens.revoke(input.indexToken);
      const stateToken = await this.context.refreshState({
        workspace: input.workspace,
        guard: input.guard
      });
      return {
        repository_id: repository.repositoryId,
        commit_oid: commitOid,
        tree_oid: treeOid,
        parent_oids: [headOid],
        file_counts: staged.counts,
        hooks_executed: reviewed.identities.some((identity) => identity.kind === "hook"),
        signature: parsed.signed ? "repository_config" : "none",
        state_token: stateToken,
        repository_integrations: "approved_full_access",
        execution_isolation: "none"
      };
    } finally {
      indexBytes.fill(0);
      await this.context.options.executor.removePrivateDirectory?.(privateRoot).catch(() => {});
    }
  }
}

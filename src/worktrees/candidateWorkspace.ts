import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import { DurableOpaqueRecordStoreV4 } from "../git/opaqueRecordStore.js";
import type { GitRepositoryIdentity } from "../git/repositoryIdentity.js";
import { admitGitRepository } from "../git/repositoryIdentity.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import { GitObjectQuarantine } from "../git/objectQuarantine.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import { materializeTaskTree } from "./materializer.js";
import { removeManagedTaskTree } from "./remover.js";
import { buildTaskTreeManifest, type TaskTreeManifestV1 } from "./treeManifest.js";
import type { VerificationReceiptServiceV4 } from "./verificationReceipts.js";

export interface CandidateVerificationRequestV4 {
  mergePlanId: string;
  integrationWorkspaceId: string;
  category: string;
}

export interface CandidateWorkspaceRecordV4 {
  schemaVersion: 1;
  integrationWorkspaceId: string;
  mergePlanId: string;
  taskWorktreeId: string;
  taskGeneration: number;
  repositoryId: string;
  repositoryIdentityFingerprint: string;
  capabilityRevision: string;
  ownerFingerprint: string;
  contextFingerprint: string;
  candidateOid: string;
  candidateTreeOid: string;
  manifestDigest: string;
  primaryWorkspaceRoot: string;
  rootPath: string;
  rootIdentity: string;
  ownsRoot: boolean;
  gitMarkerDigest: string | null;
  requiredCategories: string[];
  expiresAt: string;
}

export interface CandidateExecutionBindingV4 {
  request: CandidateVerificationRequestV4;
  cwd: string;
  record: Readonly<CandidateWorkspaceRecordV4>;
}

export interface CandidateCleanEvidenceV4 {
  cleanStateDigest: string;
  manifestDigest: string;
  candidateOid: string;
  candidateTreeOid: string;
  rootIdentity: string;
}

export interface CandidateTerminalExecutionFactsV4 {
  commandDigest: string;
  commandResourceFingerprint: string;
  backendId: string;
  backendVersion: string;
  executableIdentity: string;
  effectiveEnvironmentDigest: string;
  cwdIdentity: string;
  policyRevision: string;
  terminalAuditEventId: string;
  exitCode: number;
}

export interface ReviewedCandidateArtifactV4 {
  schemaVersion: 1;
  artifactId: string;
  reviewTokenDigest: string | null;
  taskWorktreeId: string;
  repositoryId: string;
  repositoryIdentityFingerprint: string;
  capabilityRevision: string;
  ownerFingerprint: string;
  contextFingerprint: string;
  targetOid: string;
  taskOid: string;
  candidateOid: string;
  candidateTreeOid: string;
  scanDigest: string;
  objectIds: string[];
  objectIdsDigest: string;
  rootPath: string;
  rootIdentity: string;
  expiresAt: string;
}

function candidateError(): Error {
  return new Error("MERGE_CHECKS_REQUIRED");
}

function manifestDigest(manifest: TaskTreeManifestV1): string {
  return sha256Git(JSON.stringify({
    treeOid: manifest.treeOid,
    totalBytes: manifest.totalBytes,
    entries: manifest.entries
  }));
}

async function directoryIdentity(directory: string): Promise<string> {
  const canonical = await fsp.realpath(directory).catch(() => {
    throw candidateError();
  });
  if (canonical !== directory) throw candidateError();
  const stat = await fsp.lstat(canonical, { bigint: true }).catch(() => {
    throw candidateError();
  });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw candidateError();
  return sha256Git(`${stat.dev}:${stat.ino}:${stat.birthtimeNs}`);
}

async function stableFile(
  file: string,
  maximum: number,
  expectedExecutable?: boolean
): Promise<Buffer> {
  const lexical = await fsp.lstat(file, { bigint: true }).catch(() => {
    throw candidateError();
  });
  if (
    !lexical.isFile() ||
    lexical.isSymbolicLink() ||
    lexical.nlink !== 1n ||
    lexical.size > BigInt(maximum)
  ) throw candidateError();
  const handle = await fsp.open(file, "r").catch(() => {
    throw candidateError();
  });
  try {
    const [bytes, stable] = await Promise.all([handle.readFile(), handle.stat({ bigint: true })]);
    if (
      !stable.isFile() ||
      stable.nlink !== 1n ||
      stable.dev !== lexical.dev ||
      stable.ino !== lexical.ino ||
      stable.size !== lexical.size ||
      stable.mtimeNs !== lexical.mtimeNs ||
      stable.mode !== lexical.mode ||
      (
        expectedExecutable !== undefined &&
        process.platform !== "win32" &&
        ((stable.mode & 0o111n) !== 0n) !== expectedExecutable
      )
    ) throw candidateError();
    return bytes;
  } finally {
    await handle.close();
  }
}

function gitBlobOid(bytes: Buffer, format: "sha1" | "sha256"): string {
  return createHash(format)
    .update(`blob ${bytes.length}\0`, "ascii")
    .update(bytes)
    .digest("hex");
}

export class CandidateVerificationWorkspaceV4 {
  readonly #records = new Map<string, CandidateWorkspaceRecordV4>();
  readonly #reviewedCandidates = new Map<string, ReviewedCandidateArtifactV4>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;
  readonly #now: () => number;

  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    guard: PathGuard;
    ownerFingerprint: () => string;
    contextFingerprint: () => string;
    verificationReceipts: VerificationReceiptServiceV4;
    requiredCategories?: readonly string[];
    now?: () => number;
    stateRoot?: string;
    masterKey?: Buffer;
  }) {
    this.#now = options.now ?? Date.now;
    const categories = options.requiredCategories ?? ["test"];
    if (
      categories.length < 1 ||
      categories.length > 8 ||
      categories.some((value) => !/^[a-z][a-z0-9_-]{0,31}$/u.test(value)) ||
      new Set(categories).size !== categories.length
    ) throw candidateError();
    this.#durable = options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "candidate-workspaces",
          now: this.#now
        })
      : null;
  }

  get requiredCategories(): readonly string[] {
    return Object.freeze([...(this.options.requiredCategories ?? ["test"])].sort());
  }

  async retainReviewedCandidate(input: {
    repository: GitRepositoryIdentity;
    taskWorktreeId: string;
    targetOid: string;
    taskOid: string;
    candidateOid: string;
    candidateTreeOid: string;
    scanDigest: string;
    objectIds: readonly string[];
    quarantineRoot: string;
    expiresAt: string;
  }): Promise<{ artifactId: string; objectIdsDigest: string }> {
    await this.cleanupExpiredReviewedCandidates();
    const width = input.repository.objectFormat === "sha1" ? 40 : 64;
    const oidPattern = new RegExp(`^[a-f0-9]{${width}}$`, "u");
    const objectIds = [...input.objectIds].sort();
    if (
      !/^task_[a-f0-9]{32}$/u.test(input.taskWorktreeId) ||
      !oidPattern.test(input.targetOid) ||
      !oidPattern.test(input.taskOid) ||
      !oidPattern.test(input.candidateOid) ||
      !oidPattern.test(input.candidateTreeOid) ||
      !/^[a-f0-9]{64}$/u.test(input.scanDigest) ||
      objectIds.length < 1 ||
      objectIds.length > 256 ||
      objectIds.some((oid) => !oidPattern.test(oid)) ||
      new Set(objectIds).size !== objectIds.length ||
      !objectIds.includes(input.candidateOid) ||
      Date.parse(input.expiresAt) <= this.#now()
    ) throw new Error("GIT_STATE_CHANGED");
    const artifactId = `artifact_${randomBytes(16).toString("hex")}`;
    const rootPath = path.join(this.options.manager.options.root.root, artifactId);
    const objectIdsDigest = sha256Git(JSON.stringify(objectIds));
    await fsp.mkdir(rootPath, { mode: 0o700 });
    try {
      await new GitObjectQuarantine({ journal: () => undefined }).promote({
        repository: {
          commonDir: rootPath,
          objectFormat: input.repository.objectFormat
        },
        quarantineRoot: input.quarantineRoot,
        objects: objectIds.map((oid) => ({ oid }))
      });
      const record: ReviewedCandidateArtifactV4 = Object.freeze({
        schemaVersion: 1 as const,
        artifactId,
        reviewTokenDigest: null,
        taskWorktreeId: input.taskWorktreeId,
        repositoryId: input.repository.repositoryId,
        repositoryIdentityFingerprint: input.repository.stableIdentityFingerprint,
        capabilityRevision: input.repository.capabilityRevision,
        ownerFingerprint: this.options.ownerFingerprint(),
        contextFingerprint: sha256Git(this.options.contextFingerprint()),
        targetOid: input.targetOid,
        taskOid: input.taskOid,
        candidateOid: input.candidateOid,
        candidateTreeOid: input.candidateTreeOid,
        scanDigest: input.scanDigest,
        objectIds,
        objectIdsDigest,
        rootPath,
        rootIdentity: await directoryIdentity(rootPath),
        expiresAt: input.expiresAt
      });
      if (this.#durable) {
        this.#durable.put({
          recordId: artifactId,
          kind: "reviewed_candidate",
          value: record,
          expiresAt: Date.parse(record.expiresAt)
        });
      } else {
        this.#reviewedCandidates.set(artifactId, record);
      }
      return { artifactId, objectIdsDigest };
    } catch (error) {
      await removeManagedTaskTree({
        root: this.options.manager.options.root,
        target: rootPath
      }).catch(() => {});
      throw error;
    }
  }

  bindReviewedCandidate(artifactId: string, reviewToken: string): void {
    const record = this.#getReviewedCandidate(artifactId);
    if (record.reviewTokenDigest !== null) throw new Error("GIT_STATE_CHANGED");
    const updated = Object.freeze({ ...record, reviewTokenDigest: sha256Git(reviewToken) });
    if (this.#durable) this.#durable.replace(artifactId, "reviewed_candidate", updated);
    else this.#reviewedCandidates.set(artifactId, updated);
  }

  async openReviewedCandidate(input: {
    artifactId: string;
    reviewToken: string;
    repository: GitRepositoryIdentity;
    taskWorktreeId: string;
    targetOid: string;
    taskOid: string;
    candidateOid: string;
    candidateTreeOid: string;
    scanDigest: string;
    objectIdsDigest: string;
  }): Promise<{ objectDirectoryPath: string; objectIds: string[] }> {
    const record = this.#getReviewedCandidate(input.artifactId);
    if (
      record.reviewTokenDigest !== sha256Git(input.reviewToken) ||
      record.taskWorktreeId !== input.taskWorktreeId ||
      record.repositoryId !== input.repository.repositoryId ||
      record.repositoryIdentityFingerprint !== input.repository.stableIdentityFingerprint ||
      record.capabilityRevision !== input.repository.capabilityRevision ||
      record.ownerFingerprint !== this.options.ownerFingerprint() ||
      record.contextFingerprint !== sha256Git(this.options.contextFingerprint()) ||
      record.targetOid !== input.targetOid ||
      record.taskOid !== input.taskOid ||
      record.candidateOid !== input.candidateOid ||
      record.candidateTreeOid !== input.candidateTreeOid ||
      record.scanDigest !== input.scanDigest ||
      record.objectIdsDigest !== input.objectIdsDigest ||
      await directoryIdentity(record.rootPath) !== record.rootIdentity
    ) throw new Error("GIT_STATE_CHANGED");
    return {
      objectDirectoryPath: path.join(record.rootPath, "objects"),
      objectIds: [...record.objectIds]
    };
  }

  async cleanupReviewedCandidate(artifactId: string): Promise<void> {
    const record = this.#findReviewedCandidate(artifactId, true);
    if (!record) return;
    const lexical = await fsp.lstat(record.rootPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (lexical) {
      if (await directoryIdentity(record.rootPath) !== record.rootIdentity) {
        throw new Error("GIT_RECOVERY_REQUIRED");
      }
      await removeManagedTaskTree({
        root: this.options.manager.options.root,
        target: record.rootPath
      });
    }
    if (this.#durable) this.#durable.revoke(artifactId);
    else this.#reviewedCandidates.delete(artifactId);
  }

  async cleanupReviewedCandidateForToken(reviewToken: string): Promise<void> {
    const digest = sha256Git(reviewToken);
    const record = this.#listReviewedCandidates(true).find((item) => item.reviewTokenDigest === digest);
    if (record) await this.cleanupReviewedCandidate(record.artifactId);
  }

  async cleanupExpiredReviewedCandidates(): Promise<number> {
    const expired = this.#listReviewedCandidates(true)
      .filter((record) => Date.parse(record.expiresAt) <= this.#now());
    for (const record of expired) await this.cleanupReviewedCandidate(record.artifactId);
    return expired.length;
  }

  allocateId(): string {
    return `ws_${randomBytes(16).toString("hex")}`;
  }

  async create(input: {
    workspace: Workspace;
    repository: GitRepositoryIdentity;
    taskWorktreeId: string;
    taskGeneration: number;
    mergePlanId: string;
    candidateOid: string;
    manifest: TaskTreeManifestV1;
    expiresAt: string;
    aliasTaskRoot?: string;
    integrationWorkspaceId?: string;
  }): Promise<string> {
    if (
      !/^merge_[a-f0-9]{32}$/u.test(input.mergePlanId) ||
      !/^task_[a-f0-9]{32}$/u.test(input.taskWorktreeId) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.candidateOid) ||
      !Number.isSafeInteger(input.taskGeneration) ||
      input.taskGeneration < 1 ||
      Date.parse(input.expiresAt) <= this.#now()
    ) throw candidateError();
    const integrationWorkspaceId = input.integrationWorkspaceId ?? this.allocateId();
    if (!/^ws_[a-f0-9]{32}$/u.test(integrationWorkspaceId)) throw candidateError();
    const ownsRoot = !input.aliasTaskRoot;
    const rootPath = input.aliasTaskRoot
      ? path.resolve(input.aliasTaskRoot)
      : path.join(this.options.manager.options.root.root, `verify_${randomBytes(16).toString("hex")}`);
    if (ownsRoot) {
      await materializeTaskTree({
        root: this.options.manager.options.root,
        target: rootPath,
        executor: this.options.manager.options.context.options.executor,
        repository: input.repository,
        manifest: input.manifest
      });
    }
    try {
      const gitMarkerDigest = ownsRoot
        ? null
        : sha256Git(await stableFile(path.join(rootPath, ".git"), 32 * 1024));
      const record: CandidateWorkspaceRecordV4 = Object.freeze({
        schemaVersion: 1 as const,
        integrationWorkspaceId,
        mergePlanId: input.mergePlanId,
        taskWorktreeId: input.taskWorktreeId,
        taskGeneration: input.taskGeneration,
        repositoryId: input.repository.repositoryId,
        repositoryIdentityFingerprint: input.repository.stableIdentityFingerprint,
        capabilityRevision: input.repository.capabilityRevision,
        ownerFingerprint: this.options.ownerFingerprint(),
        contextFingerprint: sha256Git(this.options.contextFingerprint()),
        candidateOid: input.candidateOid,
        candidateTreeOid: input.manifest.treeOid,
        manifestDigest: manifestDigest(input.manifest),
        primaryWorkspaceRoot: input.workspace.root,
        rootPath,
        rootIdentity: await directoryIdentity(rootPath),
        ownsRoot,
        gitMarkerDigest,
        requiredCategories: [...this.requiredCategories],
        expiresAt: input.expiresAt
      });
      await this.#validate(record);
      if (this.#durable) {
        this.#durable.put({
          recordId: integrationWorkspaceId,
          kind: "candidate_workspace",
          value: record,
          expiresAt: Date.parse(record.expiresAt)
        });
      } else {
        this.#records.set(integrationWorkspaceId, record);
      }
      return integrationWorkspaceId;
    } catch (error) {
      if (ownsRoot) {
        await removeManagedTaskTree({
          root: this.options.manager.options.root,
          target: rootPath
        }).catch(() => {});
      }
      throw error;
    }
  }

  describeExecution(request: CandidateVerificationRequestV4): CandidateExecutionBindingV4 {
    const record = this.#get(request.integrationWorkspaceId);
    if (
      record.mergePlanId !== request.mergePlanId ||
      !record.requiredCategories.includes(request.category) ||
      record.ownerFingerprint !== this.options.ownerFingerprint() ||
      record.contextFingerprint !== sha256Git(this.options.contextFingerprint()) ||
      Date.parse(record.expiresAt) <= this.#now()
    ) throw candidateError();
    return Object.freeze({ request: Object.freeze({ ...request }), cwd: record.rootPath, record });
  }

  async beginExecution(binding: CandidateExecutionBindingV4): Promise<CandidateCleanEvidenceV4> {
    const current = this.describeExecution(binding.request);
    if (current.record.rootIdentity !== binding.record.rootIdentity) throw candidateError();
    return this.#validate(current.record);
  }

  async completeExecution(
    binding: CandidateExecutionBindingV4,
    before: CandidateCleanEvidenceV4
  ): Promise<CandidateCleanEvidenceV4> {
    const after = await this.#validate(this.describeExecution(binding.request).record);
    if (after.cleanStateDigest !== before.cleanStateDigest) throw candidateError();
    return after;
  }

  issueReceipt(
    binding: CandidateExecutionBindingV4,
    clean: CandidateCleanEvidenceV4,
    terminal: CandidateTerminalExecutionFactsV4
  ): string {
    const record = this.describeExecution(binding.request).record;
    if (
      clean.cleanStateDigest.length !== 64 ||
      clean.candidateOid !== record.candidateOid ||
      clean.candidateTreeOid !== record.candidateTreeOid ||
      clean.rootIdentity !== record.rootIdentity
    ) throw candidateError();
    return this.options.verificationReceipts.issueFromTerminalEvidence({
      mergePlanId: record.mergePlanId,
      category: binding.request.category,
      repositoryId: record.repositoryId,
      repositoryIdentityFingerprint: record.repositoryIdentityFingerprint,
      taskWorktreeId: record.taskWorktreeId,
      taskGeneration: record.taskGeneration,
      candidateOid: record.candidateOid,
      candidateTreeOid: record.candidateTreeOid,
      integrationWorkspaceId: record.integrationWorkspaceId,
      workspaceRootIdentity: record.rootIdentity,
      cleanStateDigest: clean.cleanStateDigest,
      ownerFingerprint: record.ownerFingerprint,
      contextFingerprint: record.contextFingerprint,
      commandDigest: terminal.commandDigest,
      commandResourceFingerprint: terminal.commandResourceFingerprint,
      backendId: terminal.backendId,
      backendVersion: terminal.backendVersion,
      executableIdentity: terminal.executableIdentity,
      effectiveEnvironmentDigest: terminal.effectiveEnvironmentDigest,
      cwdIdentity: terminal.cwdIdentity,
      policyRevision: terminal.policyRevision,
      capabilityRevision: record.capabilityRevision,
      terminalAuditEventId: terminal.terminalAuditEventId,
      exitCode: terminal.exitCode,
      expiresAt: record.expiresAt
    });
  }

  async cleanup(integrationWorkspaceId: string): Promise<void> {
    const record = this.#find(integrationWorkspaceId, true);
    if (!record) return;
    if (record.ownsRoot) {
      const lexical = await fsp.lstat(record.rootPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (lexical) {
        if (await directoryIdentity(record.rootPath) !== record.rootIdentity) {
          throw new Error("GIT_RECOVERY_REQUIRED");
        }
        await removeManagedTaskTree({
          root: this.options.manager.options.root,
          target: record.rootPath
        });
      }
    }
    if (this.#durable) this.#durable.revoke(integrationWorkspaceId);
    else this.#records.delete(integrationWorkspaceId);
  }

  has(integrationWorkspaceId: string): boolean {
    return this.#find(integrationWorkspaceId, true) !== null;
  }

  dispose(): void {
    this.#records.clear();
    this.#reviewedCandidates.clear();
    this.#durable?.dispose();
  }

  #getReviewedCandidate(artifactId: string): Readonly<ReviewedCandidateArtifactV4> {
    const record = this.#findReviewedCandidate(artifactId, false);
    if (!record) throw new Error("GIT_STATE_CHANGED");
    return record;
  }

  #findReviewedCandidate(
    artifactId: string,
    includeExpired: boolean
  ): Readonly<ReviewedCandidateArtifactV4> | null {
    if (!/^artifact_[a-f0-9]{32}$/u.test(artifactId)) throw new Error("GIT_STATE_CHANGED");
    const record = this.#durable
      ? this.#durable.list<ReviewedCandidateArtifactV4>("reviewed_candidate", { includeExpired })
          .find((item) => item.recordId === artifactId)?.value ?? null
      : this.#reviewedCandidates.get(artifactId) ?? null;
    if (!record || (!includeExpired && Date.parse(record.expiresAt) <= this.#now())) return null;
    return Object.freeze(record);
  }

  #listReviewedCandidates(includeExpired: boolean): ReviewedCandidateArtifactV4[] {
    const records = this.#durable
      ? this.#durable.list<ReviewedCandidateArtifactV4>("reviewed_candidate", { includeExpired })
          .map((item) => item.value)
      : [...this.#reviewedCandidates.values()]
          .filter((record) => includeExpired || Date.parse(record.expiresAt) > this.#now());
    return records.map((record) => ({ ...record, objectIds: [...record.objectIds] }));
  }

  async #validate(record: CandidateWorkspaceRecordV4): Promise<CandidateCleanEvidenceV4> {
    if (await directoryIdentity(record.rootPath) !== record.rootIdentity) throw candidateError();
    const task = this.options.manager.options.store.read(record.taskWorktreeId);
    if (
      task.record.generation !== record.taskGeneration ||
      task.record.headOid !== record.candidateOid && !record.ownsRoot ||
      task.privateState.ownerFingerprint !== record.ownerFingerprint
    ) throw candidateError();
    const repository = await admitGitRepository({
      workspaceRoot: record.primaryWorkspaceRoot,
      executor: this.options.manager.options.context.options.executor,
      registry: this.options.manager.options.context.options.registry
    });
    if (
      repository.repositoryId !== record.repositoryId ||
      repository.stableIdentityFingerprint !== record.repositoryIdentityFingerprint ||
      repository.capabilityRevision !== record.capabilityRevision
    ) throw candidateError();
    const manifest = await buildTaskTreeManifest({
      executor: this.options.manager.options.context.options.executor,
      repository,
      treeish: record.candidateOid,
      guard: this.options.guard,
      maxFiles: this.options.manager.options.maxFiles,
      maxBytes: this.options.manager.options.maxBytes
    });
    if (
      manifest.treeOid !== record.candidateTreeOid ||
      manifestDigest(manifest) !== record.manifestDigest
    ) throw candidateError();
    if (!record.ownsRoot) {
      const taskRepository = {
        ...repository,
        worktreeRoot: task.privateState.worktreePath,
        gitDir: task.privateState.adminDir ?? repository.gitDir
      };
      const status = await this.options.manager.options.context.options.executor.run(taskRepository, [
        "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
      ], { stdoutLimitBytes: 4 * 1024 * 1024 });
      const head = (await runGitRequired(
        this.options.manager.options.context.options.executor,
        taskRepository,
        ["rev-parse", "--verify", "HEAD"],
        { stdoutLimitBytes: 256 }
      )).stdout.toString("ascii").trim();
      if (
        status.status !== 0 ||
        status.stdout.length !== 0 ||
        head !== record.candidateOid ||
        sha256Git(await stableFile(path.join(record.rootPath, ".git"), 32 * 1024)) !== record.gitMarkerDigest
      ) throw candidateError();
    }
    const expectedFiles = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    const allowedDirectories = new Set<string>();
    for (const entry of manifest.entries) {
      const parts = entry.path.split("/");
      for (let index = 1; index < parts.length; index += 1) {
        allowedDirectories.add(parts.slice(0, index).join("/"));
      }
      if (entry.kind === "gitlink") allowedDirectories.add(entry.path);
    }
    const seenFiles = new Set<string>();
    const digestParts: string[] = [];
    let totalBytes = 0;
    const visit = async (directory: string, prefix: string): Promise<void> => {
      for (const child of await fsp.readdir(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${child.name}` : child.name;
        if (!record.ownsRoot && relative === ".git") continue;
        const target = path.join(directory, child.name);
        const lexical = await fsp.lstat(target, { bigint: true });
        if (lexical.isSymbolicLink()) throw candidateError();
        if (lexical.isDirectory()) {
          if (!allowedDirectories.has(relative)) throw candidateError();
          const expected = expectedFiles.get(relative);
          if (expected?.kind === "gitlink") {
            if ((await fsp.readdir(target)).length !== 0) throw candidateError();
            seenFiles.add(relative);
            digestParts.push(`${relative}\0gitlink\0${expected.oid}`);
          } else {
            await visit(target, relative);
          }
          continue;
        }
        const expected = expectedFiles.get(relative);
        if (!expected || expected.kind !== "blob") throw candidateError();
        const bytes = await stableFile(
          target,
          32 * 1024 * 1024,
          expected.mode === "100755"
        );
        totalBytes += bytes.length;
        if (
          totalBytes > this.options.manager.options.maxBytes ||
          bytes.length !== expected.size ||
          gitBlobOid(bytes, repository.objectFormat) !== expected.oid
        ) throw candidateError();
        seenFiles.add(relative);
        digestParts.push(`${relative}\0${expected.mode}\0${expected.oid}\0${sha256Git(bytes)}`);
      }
    };
    await visit(record.rootPath, "");
    if (seenFiles.size !== expectedFiles.size || [...expectedFiles.keys()].some((name) => !seenFiles.has(name))) {
      throw candidateError();
    }
    return Object.freeze({
      cleanStateDigest: sha256Git(JSON.stringify({
        rootIdentity: record.rootIdentity,
        manifestDigest: record.manifestDigest,
        digestParts
      })),
      manifestDigest: record.manifestDigest,
      candidateOid: record.candidateOid,
      candidateTreeOid: record.candidateTreeOid,
      rootIdentity: record.rootIdentity
    });
  }

  #get(integrationWorkspaceId: string, includeExpired = false): Readonly<CandidateWorkspaceRecordV4> {
    const record = this.#find(integrationWorkspaceId, includeExpired);
    if (!record) throw candidateError();
    return record;
  }

  #find(
    integrationWorkspaceId: string,
    includeExpired = false
  ): Readonly<CandidateWorkspaceRecordV4> | null {
    if (!/^ws_[a-f0-9]{32}$/u.test(integrationWorkspaceId)) throw candidateError();
    if (this.#durable) {
      if (!includeExpired) {
        const record = this.#durable.get<CandidateWorkspaceRecordV4>(
          integrationWorkspaceId,
          "candidate_workspace"
        );
        return record ? Object.freeze(record) : null;
      }
      const found = this.#durable.list<CandidateWorkspaceRecordV4>("candidate_workspace", {
        includeExpired: true
      }).find((item) => item.recordId === integrationWorkspaceId);
      if (!found) return null;
      return Object.freeze(found.value);
    }
    const record = this.#records.get(integrationWorkspaceId);
    return record ?? null;
  }
}

import fsp from "node:fs/promises";
import path from "node:path";
import type { PathGuard, Workspace } from "../guard.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import { runGitRequired, sha256Git } from "../git/mutationContext.js";
import type { TaskWorktreeManagerV4 } from "./manager.js";
import type { MergePlanStoreV4 } from "./mergePlanStore.js";
import { buildTaskTreeManifest } from "./treeManifest.js";
import { assertRawGitNormalizationV4 } from "../git/normalization.js";
import { gitIndexIdentityV4, replaceLiveIndexV4 } from "../git/privateIndex.js";
import type {
  VerificationReceiptReservationV4,
  VerificationReceiptServiceV4
} from "./verificationReceipts.js";
import type { GitFileMutationV4, GitFileTransactionV4 } from "../git/fileTransaction.js";
import type { GitIntegrationGateV4 } from "../git/integrations.js";
import { neutralizedFilterConfig } from "../git/readService.js";
import { hasSecretValue } from "../redact.js";
import type { CandidateVerificationWorkspaceV4 } from "./candidateWorkspace.js";

interface UndoEntry {
  path: string;
  existed: boolean;
  content: Buffer;
  digest: string;
}

function checkedOutBranches(value: Buffer): Set<string> {
  const output = new Set<string>();
  for (const field of value.toString("utf8").split(/\0|\r?\n/u)) {
    if (field.startsWith("branch refs/heads/")) output.add(field.slice("branch ".length));
  }
  return output;
}

export class TaskWorktreeMergeExecuteV4 {
  constructor(private readonly options: {
    manager: TaskWorktreeManagerV4;
    plans: MergePlanStoreV4;
    ownerFingerprint: () => string;
    verificationReceipts: VerificationReceiptServiceV4;
    fileTransactions: GitFileTransactionV4;
    integrationGate?: GitIntegrationGateV4;
    candidateWorkspaces: CandidateVerificationWorkspaceV4;
  }) {}

  describePlan(id: string, ownerFingerprint: string) {
    return this.options.plans.get(id, ownerFingerprint);
  }

  async execute(input: {
    workspace: Workspace;
    guard: PathGuard;
    taskWorktreeId: string;
    mergePlanId: string;
    verificationReceipts?: readonly string[];
    skipChecks?: boolean;
    integrationReviewToken?: string;
    authorization?: AuthorizationAuditEventV4 | null;
  }) {
    const owner = this.options.ownerFingerprint();
    const planReservation = this.options.plans.reserve(input.mergePlanId, owner);
    const plan = planReservation.plan;
    let receiptReservation: VerificationReceiptReservationV4 | null = null;
    let completed = false;
    let effectObserved = false;
    try {
    if (plan.taskWorktreeId !== input.taskWorktreeId) {
      throw new Error("MERGE_PLAN_INVALID");
    }
    const receipts = input.verificationReceipts ?? [];
    if (input.skipChecks === true && receipts.length !== 0) throw new Error("MERGE_CHECKS_REQUIRED");
    if (receipts.length === 0 && input.skipChecks !== true) throw new Error("MERGE_CHECKS_REQUIRED");
    const task = await this.options.manager.revalidate(input.taskWorktreeId, owner);
    const repository = await this.options.manager.primaryRepository(input.workspace);
    const executor = this.options.manager.options.context.options.executor;
    const integrationReview = input.integrationReviewToken
      ? this.options.integrationGate?.inspect(input.integrationReviewToken)
      : null;
    if (input.integrationReviewToken && (
      !this.options.integrationGate?.enabled ||
      integrationReview?.workspaceId !== input.workspace.id ||
      integrationReview.repositoryId !== repository.repositoryId
    )) throw new Error("GIT_INTEGRATION_REQUIRED");
    if (
      (plan.repositoryIntegrations === "approved_full_access") !== Boolean(integrationReview)
    ) throw new Error("GIT_INTEGRATION_REQUIRED");
    if (
      task.record.generation !== plan.taskGeneration ||
      repository.stableIdentityFingerprint !== plan.repositoryIdentityFingerprint ||
      repository.capabilityRevision !== plan.capabilityRevision ||
      sha256Git(this.options.manager.options.context.options.contextFingerprint) !== plan.contextFingerprint ||
      (plan.policyRevision !== null && input.authorization?.policyRevision !== plan.policyRevision) ||
      (integrationReview?.identitiesDigest ?? null) !== plan.integrationIdentitiesDigest ||
      (integrationReview?.configDigest ?? null) !== plan.integrationConfigDigest ||
      (integrationReview?.semanticStateDigest ?? null) !== plan.integrationSemanticStateDigest
    ) throw new Error("GIT_STATE_CHANGED");
    const candidateBinding = this.options.candidateWorkspaces.describeExecution({
      mergePlanId: plan.mergePlanId,
      integrationWorkspaceId: plan.integrationWorkspaceId,
      category: plan.requiredCheckCategories[0]
    });
    await this.options.candidateWorkspaces.beginExecution(candidateBinding);
    if (input.skipChecks !== true) {
      receiptReservation = this.options.verificationReceipts.reserveForMerge({
        tokens: receipts,
        requiredCategories: plan.requiredCheckCategories,
        expected: {
          mergePlanId: plan.mergePlanId,
          repositoryId: plan.repositoryId,
          repositoryIdentityFingerprint: plan.repositoryIdentityFingerprint,
          taskWorktreeId: plan.taskWorktreeId,
          taskGeneration: plan.taskGeneration,
          candidateOid: plan.candidateOid,
          candidateTreeOid: plan.candidateTreeOid,
          integrationWorkspaceId: plan.integrationWorkspaceId,
          ownerFingerprint: owner,
          contextFingerprint: plan.contextFingerprint,
          capabilityRevision: plan.capabilityRevision,
          ...(plan.policyRevision ? { policyRevision: plan.policyRevision } : {})
        }
      });
    }
    const currentRefResult = await executor.run(repository, [
      "symbolic-ref", "-q", "HEAD"
    ], { stdoutLimitBytes: 512 });
    if (currentRefResult.timedOut || currentRefResult.stdoutTruncated || currentRefResult.stderrTruncated) {
      throw new Error("GIT_STATE_CHANGED");
    }
    const currentRef = currentRefResult.status === 0
      ? currentRefResult.stdout.toString("utf8").trim()
      : "";
    const currentOid = (await runGitRequired(executor, repository, [
      "rev-parse", "--verify", plan.targetRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    const taskOid = (await runGitRequired(executor, repository, [
      "rev-parse", "--verify", plan.taskRef
    ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
    if (
      repository.repositoryId !== plan.repositoryId ||
      currentOid !== plan.targetOid ||
      taskOid !== plan.taskOid ||
      task.record.headOid !== plan.taskOid
    ) throw new Error("GIT_STATE_CHANGED");
    if (currentRef !== plan.targetRef) {
      const proveUnchecked = async () => {
        const result = await runGitRequired(executor, repository, [
          "worktree", "list", "--porcelain", "-z"
        ], { stdoutLimitBytes: 1024 * 1024 });
        return {
          digest: sha256Git(result.stdout),
          checkedOut: checkedOutBranches(result.stdout)
        };
      };
      const first = await proveUnchecked();
      const refBetween = (await runGitRequired(executor, repository, [
        "rev-parse", "--verify", plan.targetRef
      ], { stdoutLimitBytes: 256 })).stdout.toString("ascii").trim();
      const second = await proveUnchecked();
      if (
        first.checkedOut.has(plan.targetRef) ||
        second.checkedOut.has(plan.targetRef) ||
        first.digest !== second.digest ||
        refBetween !== plan.targetOid
      ) throw new Error("GIT_STATE_CHANGED");
      const result = await this.options.manager.options.journal.run({
        authorization: input.authorization,
        repository,
        toolName: "merge_task_worktree",
        canonicalAction: "task_merge_execute",
        workspaceId: input.workspace.id,
        participants: ["ref_cas", "task_registry"],
        counts: { affectedPathCount: 0, affectedRefCount: 1 },
        privateState: {
          mergePlanId: plan.mergePlanId,
          targetRef: plan.targetRef,
          targetOid: plan.targetOid,
          candidateOid: plan.candidateOid,
          checkoutInventoryDigest: first.digest
        },
        effect: async () => {
          const ref = await executor.run(repository, [
            "update-ref", "--no-deref", plan.targetRef, plan.candidateOid, plan.targetOid
          ]);
          if (ref.status !== 0) throw new Error("GIT_REF_CHANGED");
          this.options.manager.options.store.update(task.record.taskWorktreeId, {
            state: "ready",
            headOid: plan.taskOid
          });
          return {
            action: "execute" as const,
            repository_id: repository.repositoryId,
            task_worktree_id: task.record.taskWorktreeId,
            merge_plan_id: plan.mergePlanId,
            target_old_oid: plan.targetOid,
            target_new_oid: plan.candidateOid,
            integrated: true as const,
            task_retained: true as const,
            execution_isolation: "none" as const,
            repository_integrations: plan.repositoryIntegrations
          };
        }
      });
      effectObserved = true;
      this.options.plans.transition(
        plan.mergePlanId,
        owner,
        "prepared",
        "effect_observed"
      );
      await this.#completePlan({ plan, repository, executor });
      receiptReservation?.consume();
      planReservation.consume();
      completed = true;
      return result;
    }
    const dirty = await executor.run(repository, [
      "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored=matching"
    ], {
      stdoutLimitBytes: 4 * 1024 * 1024,
      configOverrides: await neutralizedFilterConfig(executor, repository)
    });
    if (dirty.status !== 0 || dirty.stdout.length !== 0) throw new Error("GIT_STATE_CHANGED");
    const targetManifest = await buildTaskTreeManifest({
      executor,
      repository,
      treeish: plan.targetOid,
      guard: input.guard,
      maxFiles: this.options.manager.options.maxFiles,
      maxBytes: this.options.manager.options.maxBytes
    });
    const candidateManifest = await buildTaskTreeManifest({
      executor,
      repository,
      treeish: plan.candidateOid,
      guard: input.guard,
      maxFiles: this.options.manager.options.maxFiles,
      maxBytes: this.options.manager.options.maxBytes
    });
    const before = new Map(targetManifest.entries.map((entry) => [entry.path, entry]));
    const after = new Map(candidateManifest.entries.map((entry) => [entry.path, entry]));
    const paths = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => before.get(name)?.oid !== after.get(name)?.oid || before.get(name)?.mode !== after.get(name)?.mode)
      .sort();
    if (!integrationReview) {
      await assertRawGitNormalizationV4({ executor, repository, paths });
    }
    const liveIndex = path.join(repository.gitDir, "index");
    const liveIndexIdentity = await gitIndexIdentityV4(liveIndex);
    const liveIndexContent = await fsp.readFile(liveIndex);
    const undo: UndoEntry[] = [];
    for (const relativePath of paths) {
      const absolute = path.join(input.workspace.root, ...relativePath.split("/"));
      const old = await fsp.readFile(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      undo.push({
        path: relativePath,
        existed: old !== null,
        content: old ?? Buffer.alloc(0),
        digest: sha256Git(old ?? Buffer.alloc(0))
      });
    }
    const result = await this.options.manager.options.journal.run({
      authorization: input.authorization,
      repository,
      toolName: "merge_task_worktree",
      canonicalAction: "task_merge_execute",
      workspaceId: input.workspace.id,
      participants: ["private_index", "file_transaction", "ref_cas", "task_registry"],
      counts: { affectedPathCount: paths.length },
      privateState: {
        mergePlanId: plan.mergePlanId,
        targetRef: plan.targetRef,
        targetOid: plan.targetOid,
        candidateOid: plan.candidateOid,
        pathSetDigest: sha256Git(JSON.stringify(paths.map(sha256Git))),
        indexIdentity: liveIndexIdentity,
        indexContentDigest: sha256Git(liveIndexContent),
        fileUndoDigest: sha256Git(JSON.stringify(undo.map((entry) => ({
          pathDigest: sha256Git(entry.path),
          existed: entry.existed,
          contentDigest: entry.digest
        }))))
      },
      effect: async () => {
        const privateRoot = await executor.createPrivateDirectory?.("git-merge-execute");
        if (!privateRoot) throw new Error("GIT_CAPABILITY_UNAVAILABLE");
        const privateIndex = path.join(privateRoot, "index");
        const hydratedRoot = path.join(privateRoot, "hydrated");
        let refUpdated = false;
        let indexUpdated = false;
        let integrationsExecuted = false;
        let hydratedTotalBytes = 0;
        try {
          await fsp.writeFile(privateIndex, liveIndexContent);
          await runGitRequired(executor, repository, ["read-tree", plan.candidateOid], {
            privateIndexPath: privateIndex
          });
          const preparedIndexDigest = sha256Git(await fsp.readFile(privateIndex));
          const preparedTreeOid = (await runGitRequired(executor, repository, ["write-tree"], {
            privateIndexPath: privateIndex,
            stdoutLimitBytes: 256
          })).stdout.toString("ascii").trim();
          if (preparedTreeOid !== candidateManifest.treeOid) throw new Error("GIT_INDEX_CHANGED");
          const hydratedPaths = paths.filter((relativePath) => {
            const entry = after.get(relativePath);
            return entry?.kind === "blob";
          });
          if (integrationReview && hydratedPaths.length > 0) {
            await fsp.mkdir(hydratedRoot, { mode: 0o700 });
            const hydrated = await this.options.integrationGate!.execute({
              workspaceId: input.workspace.id,
              repository,
              reviewToken: input.integrationReviewToken!,
              authorization: input.authorization,
              semanticStateDigest: integrationReview.semanticStateDigest,
              expectedToolName: "merge_task_worktree",
              expectedCanonicalAction: "task_merge_execute",
              request: {
                operation: "checkout_index",
                privateIndexPath: privateIndex,
                destinationPrefix: hydratedRoot,
                paths: hydratedPaths
              }
            });
            if (
              hydrated.result.status !== 0 ||
              hydrated.result.timedOut ||
              hydrated.result.stdoutTruncated ||
              hydrated.result.stderrTruncated
            ) throw new Error("GIT_COMMAND_FAILED");
            if (sha256Git(await fsp.readFile(privateIndex)) !== preparedIndexDigest) {
              throw new Error("GIT_INDEX_CHANGED");
            }
            integrationsExecuted = true;
          }
          const operations: GitFileMutationV4[] = [];
          for (const relativePath of paths) {
            const entry = after.get(relativePath);
            if (!entry || entry.kind === "gitlink") {
              const old = undo.find((item) => item.path === relativePath)!;
              if (old.existed) operations.push({
                kind: "delete",
                path: relativePath,
                expectedSha256: old.digest
              });
            } else {
              const bytes = integrationsExecuted
                ? await this.#readHydratedFile(
                    path.join(hydratedRoot, ...relativePath.split("/")),
                    hydratedRoot,
                    this.options.manager.options.maxBytes - hydratedTotalBytes
                  )
                : (await runGitRequired(executor, repository, ["cat-file", "blob", entry.oid], {
                    stdoutLimitBytes: entry.size + 1
                  })).stdout;
              if (integrationsExecuted) {
                hydratedTotalBytes += bytes.length;
                if (hydratedTotalBytes > this.options.manager.options.maxBytes) {
                  throw new Error("GIT_SCAN_LIMIT");
                }
              }
              if (hasSecretValue(bytes.toString("latin1"))) throw new Error("GIT_SECRET_BLOCKED");
              const old = undo.find((item) => item.path === relativePath)!;
              operations.push(old.existed
                ? {
                    kind: "replace",
                    path: relativePath,
                    bytes,
                    expectedSha256: old.digest
                  }
                : { kind: "create", path: relativePath, bytes });
            }
          }
          await this.options.fileTransactions.run({
            workspace: input.workspace,
            operations,
            commitGitState: async () => {
              try {
                await replaceLiveIndexV4({
                  liveIndex,
                  preparedIndex: privateIndex,
                  expectedIdentity: liveIndexIdentity
                });
                indexUpdated = true;
                const ref = await executor.run(repository, [
                  "update-ref", "--no-deref", plan.targetRef, plan.candidateOid, plan.targetOid
                ]);
                if (ref.status !== 0) throw new Error("GIT_REF_CHANGED");
                refUpdated = true;
                this.options.manager.options.store.update(task.record.taskWorktreeId, {
                  state: "ready",
                  headOid: plan.taskOid
                });
              } catch (error) {
                if (refUpdated) {
                  await executor.run(repository, [
                    "update-ref", "--no-deref", plan.targetRef, plan.targetOid, plan.candidateOid
                  ]).catch(() => undefined);
                }
                if (indexUpdated) {
                  const undoIndex = path.join(privateRoot, "undo-index");
                  await fsp.writeFile(undoIndex, liveIndexContent);
                  await replaceLiveIndexV4({
                    liveIndex,
                    preparedIndex: undoIndex,
                    expectedIdentity: await gitIndexIdentityV4(liveIndex)
                  }).catch(() => undefined);
                }
                this.options.manager.options.store.update(task.record.taskWorktreeId, {
                  state: "merge_prepared",
                  headOid: plan.taskOid
                });
                throw error;
              }
              return null;
            }
          });
          return {
            action: "execute" as const,
            repository_id: repository.repositoryId,
            task_worktree_id: task.record.taskWorktreeId,
            merge_plan_id: plan.mergePlanId,
            target_old_oid: plan.targetOid,
            target_new_oid: plan.candidateOid,
            integrated: true as const,
            task_retained: true as const,
            execution_isolation: "none" as const,
            repository_integrations: plan.repositoryIntegrations
          };
        } catch (error) {
          throw error;
        } finally {
          await executor.removePrivateDirectory?.(privateRoot).catch(() => {});
        }
      }
    });
    effectObserved = true;
    this.options.plans.transition(
      plan.mergePlanId,
      owner,
      "prepared",
      "effect_observed"
    );
    await this.#completePlan({ plan, repository, executor });
    receiptReservation?.consume();
    planReservation.consume();
    completed = true;
    return result;
    } catch (error) {
      if (effectObserved) {
        try {
          const currentPlan = this.options.plans.getForRecovery(plan.mergePlanId, owner);
          if (currentPlan.lifecycleState === "prepared") {
            this.options.plans.transition(
              plan.mergePlanId,
              owner,
              "prepared",
              "recovery_required"
            );
          } else if (currentPlan.lifecycleState === "effect_observed") {
            this.options.plans.transition(
              plan.mergePlanId,
              owner,
              "effect_observed",
              "recovery_required"
            );
          }
        } catch { }
        try {
          const currentTask = this.options.manager.options.store.read(plan.taskWorktreeId);
          if (currentTask.record.state !== "recovery_required") {
            this.options.manager.options.store.update(plan.taskWorktreeId, {
              state: "recovery_required",
              headOid: plan.taskOid
            });
          }
        } catch { }
      }
      throw error;
    } finally {
      if (!completed) {
        receiptReservation?.release();
        planReservation.release();
      }
    }
  }

  async #completePlan(input: {
    plan: ReturnType<MergePlanStoreV4["get"]>;
    repository: Awaited<ReturnType<TaskWorktreeManagerV4["primaryRepository"]>>;
    executor: TaskWorktreeManagerV4["options"]["context"]["options"]["executor"];
  }): Promise<void> {
    if (input.plan.candidateRef) {
      const deleted = await input.executor.run(input.repository, [
        "update-ref", "--no-deref", "-d", input.plan.candidateRef, input.plan.candidateOid
      ]);
      if (deleted.status !== 0) {
        const probe = await input.executor.run(input.repository, [
          "show-ref", "--verify", "--quiet", input.plan.candidateRef
        ]);
        if (
          probe.status !== 1 ||
          probe.timedOut ||
          probe.stdoutTruncated ||
          probe.stderrTruncated
        ) throw new Error("GIT_RECOVERY_REQUIRED");
      }
    }
    await this.options.candidateWorkspaces.cleanup(input.plan.integrationWorkspaceId).catch(() => {
      throw new Error("GIT_RECOVERY_REQUIRED");
    });
  }

  async #readHydratedFile(file: string, root: string, maximumTotal: number): Promise<Buffer> {
    if (!Number.isSafeInteger(maximumTotal) || maximumTotal < 0) throw new Error("GIT_SCAN_LIMIT");
    const lexical = await fsp.lstat(file, { bigint: true }).catch(() => {
      throw new Error("GIT_STATE_CHANGED");
    });
    if (
      !lexical.isFile() ||
      lexical.isSymbolicLink() ||
      lexical.nlink !== 1n ||
      lexical.size > 32n * 1024n * 1024n ||
      lexical.size > BigInt(maximumTotal)
    ) throw new Error("GIT_SCAN_LIMIT");
    const handle = await fsp.open(file, "r");
    try {
      const [bytes, stat, canonical] = await Promise.all([
        handle.readFile(),
        handle.stat({ bigint: true }),
        fsp.realpath(file)
      ]);
      const relative = path.relative(await fsp.realpath(root), canonical);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        stat.dev !== lexical.dev ||
        stat.ino !== lexical.ino ||
        stat.size !== lexical.size ||
        stat.mtimeNs !== lexical.mtimeNs
      ) throw new Error("GIT_STATE_CHANGED");
      return bytes;
    } finally {
      await handle.close();
    }
  }
}

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
import type { VerificationReceiptServiceV4 } from "./verificationReceipts.js";
import type { GitFileMutationV4, GitFileTransactionV4 } from "../git/fileTransaction.js";
import type { GitIntegrationGateV4 } from "../git/integrations.js";
import { neutralizedFilterConfig } from "../git/readService.js";
import { hasSecretValue } from "../redact.js";

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
    const plan = this.options.plans.get(input.mergePlanId, owner);
    if (plan.taskWorktreeId !== input.taskWorktreeId) {
      throw new Error("MERGE_PLAN_INVALID");
    }
    const receipts = input.verificationReceipts ?? [];
    if (receipts.length === 0 && input.skipChecks !== true) throw new Error("MERGE_CHECKS_REQUIRED");
    for (const receipt of receipts) {
      this.options.verificationReceipts.verify(receipt, {
        taskWorktreeId: plan.taskWorktreeId,
        candidateOid: plan.candidateOid,
        ownerFingerprint: owner
      });
    }
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
      return this.options.manager.options.journal.run({
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
          this.options.plans.consume(plan.mergePlanId, owner);
          this.options.manager.options.store.update(task.record.taskWorktreeId, {
            state: "ready",
            headOid: plan.taskOid
          });
          if (plan.candidateRef) {
            const deleted = await executor.run(repository, [
              "update-ref", "--no-deref", "-d", plan.candidateRef, plan.candidateOid
            ]);
            if (deleted.status !== 0) throw new Error("GIT_RECOVERY_REQUIRED");
          }
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
            repository_integrations: "disabled" as const
          };
        }
      });
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
    let rollbackBytes = liveIndexContent.length;
    for (const relativePath of paths) {
      const absolute = path.join(input.workspace.root, ...relativePath.split("/"));
      const old = await fsp.readFile(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      rollbackBytes += old?.length ?? 0;
      if (rollbackBytes > 220 * 1024) throw new Error("GIT_SCAN_LIMIT");
      undo.push({
        path: relativePath,
        existed: old !== null,
        content: old ?? Buffer.alloc(0),
        digest: sha256Git(old ?? Buffer.alloc(0))
      });
    }
    return this.options.manager.options.journal.run({
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
        pathDigests: paths.map(sha256Git),
        rollbackBytes,
        indexUndo: liveIndexContent.toString("base64"),
        fileUndo: undo.map((entry) => ({
          path: entry.path,
          existed: entry.existed,
          content: entry.content.toString("base64")
        }))
      },
      effect: async () => {
        const privateRoot = await executor.createPrivateDirectory?.("git-merge-execute");
        if (!privateRoot) throw new Error("GIT_CAPABILITY_UNAVAILABLE");
        const privateIndex = path.join(privateRoot, "index");
        const hydratedRoot = path.join(privateRoot, "hydrated");
        let refUpdated = false;
        let indexUpdated = false;
        let integrationsExecuted = false;
        try {
          await fsp.writeFile(privateIndex, liveIndexContent);
          await runGitRequired(executor, repository, ["read-tree", plan.candidateOid], {
            privateIndexPath: privateIndex
          });
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
                    this.options.manager.options.maxBytes
                  )
                : (await runGitRequired(executor, repository, ["cat-file", "blob", entry.oid], {
                    stdoutLimitBytes: entry.size + 1
                  })).stdout;
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
                if (plan.candidateRef) {
                  const deleted = await executor.run(repository, [
                    "update-ref", "--no-deref", "-d", plan.candidateRef, plan.candidateOid
                  ]);
                  if (deleted.status !== 0) throw new Error("GIT_RECOVERY_REQUIRED");
                }
                this.options.plans.consume(plan.mergePlanId, owner);
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
            repository_integrations: integrationsExecuted
              ? "approved_full_access" as const
              : "disabled" as const
          };
        } catch (error) {
          throw error;
        } finally {
          await executor.removePrivateDirectory?.(privateRoot).catch(() => {});
        }
      }
    });
  }

  async #readHydratedFile(file: string, root: string, maximumTotal: number): Promise<Buffer> {
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

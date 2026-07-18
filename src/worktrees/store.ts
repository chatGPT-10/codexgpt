import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import {
  canonicalGateRJson,
  deriveGateRSubkey,
  openGitState,
  sealGitState,
  type SealedGitStateV1
} from "../git/durableState.js";

export type TaskWorktreeStateV1 = "preparing" | "ready" | "merge_prepared" | "recovery_required" | "removed";

export interface TaskWorktreePrivateStateV1 {
  ownerFingerprint: string;
  repositoryId: string;
  worktreePath: string;
  adminDir: string | null;
  branchRef: string;
  targetRef: string;
}

export interface TaskWorktreeRecordV1 {
  schemaVersion: 1;
  taskWorktreeId: string;
  ownerBindingVersion: 1;
  repositoryId: string;
  branchId: string;
  targetBranchId: string;
  baseOid: string;
  headOid: string;
  generation: number;
  state: TaskWorktreeStateV1;
  privateState: SealedGitStateV1;
  createdAt: string;
  updatedAt: string;
  recordMac: string;
}

const sealed = z.object({
  schemaVersion: z.literal(1),
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string()
}).strict();
const recordSchema: z.ZodType<TaskWorktreeRecordV1> = z.object({
  schemaVersion: z.literal(1),
  taskWorktreeId: z.string().regex(/^task_[a-f0-9]{32}$/u),
  ownerBindingVersion: z.literal(1),
  repositoryId: z.string().regex(/^repo_[a-f0-9]{32}$/u),
  branchId: z.string().regex(/^branch_[a-f0-9]{32}$/u),
  targetBranchId: z.string().regex(/^branch_[a-f0-9]{32}$/u),
  baseOid: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  headOid: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  generation: z.number().int().positive(),
  state: z.enum(["preparing", "ready", "merge_prepared", "recovery_required", "removed"]),
  privateState: sealed,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  recordMac: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

function unsigned(record: TaskWorktreeRecordV1): Omit<TaskWorktreeRecordV1, "recordMac"> {
  const { recordMac: _ignored, ...rest } = record;
  return rest;
}

export class TaskWorktreeStoreV1 {
  readonly #directory: string;
  readonly #atomic: AtomicJsonFileStore<TaskWorktreeRecordV1>;
  readonly #sealKey: Buffer;
  readonly #macKey: Buffer;

  constructor(private readonly options: {
    stateRoot: string;
    masterKey: Buffer;
    now?: () => number;
  }) {
    this.#directory = path.join(path.resolve(options.stateRoot), "git", "task-worktrees");
    this.#atomic = new AtomicJsonFileStore(options.stateRoot, recordSchema);
    this.#sealKey = deriveGateRSubkey(options.masterKey, "task-worktree-private");
    this.#macKey = deriveGateRSubkey(options.masterKey, "task-worktree-record");
  }

  create(input: Omit<TaskWorktreePrivateStateV1, "adminDir" | "worktreePath"> & {
    managedRoot: string;
    branchId: string;
    targetBranchId: string;
    baseOid: string;
    taskWorktreeId?: string;
  }): { record: TaskWorktreeRecordV1; privateState: TaskWorktreePrivateStateV1 } {
    const taskWorktreeId = input.taskWorktreeId ?? `task_${randomBytes(16).toString("hex")}`;
    if (!/^task_[a-f0-9]{32}$/u.test(taskWorktreeId) || fs.existsSync(this.pathFor(taskWorktreeId))) {
      throw new Error("TASK_WORKTREE_NOT_FOUND");
    }
    const now = new Date(this.options.now?.() ?? Date.now()).toISOString();
    const privateState: TaskWorktreePrivateStateV1 = {
      ownerFingerprint: input.ownerFingerprint,
      repositoryId: input.repositoryId,
      worktreePath: path.join(input.managedRoot, taskWorktreeId),
      adminDir: null,
      branchRef: input.branchRef,
      targetRef: input.targetRef
    };
    const base = {
      schemaVersion: 1 as const,
      taskWorktreeId,
      ownerBindingVersion: 1 as const,
      repositoryId: input.repositoryId,
      branchId: input.branchId,
      targetBranchId: input.targetBranchId,
      baseOid: input.baseOid,
      headOid: input.baseOid,
      generation: 1,
      state: "preparing" as const,
      privateState: sealGitState(
        this.#sealKey,
        `task-worktree:${taskWorktreeId}`,
        privateState,
        randomBytes
      ),
      createdAt: now,
      updatedAt: now
    };
    const record = recordSchema.parse({
      ...base,
      recordMac: createHmac("sha256", this.#macKey).update(canonicalGateRJson(base)).digest("hex")
    });
    this.#atomic.write(this.pathFor(taskWorktreeId), record);
    return { record, privateState };
  }

  read(taskWorktreeId: string): { record: TaskWorktreeRecordV1; privateState: TaskWorktreePrivateStateV1 } {
    if (!fs.existsSync(this.pathFor(taskWorktreeId))) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const record = this.#atomic.read(this.pathFor(taskWorktreeId));
    const expected = createHmac("sha256", this.#macKey).update(canonicalGateRJson(unsigned(record))).digest("hex");
    if (expected !== record.recordMac) throw new Error("TASK_WORKTREE_NOT_FOUND");
    const value = openGitState(
      this.#sealKey,
      `task-worktree:${taskWorktreeId}`,
      record.privateState
    ) as TaskWorktreePrivateStateV1;
    if (
      !/^[a-f0-9]{64}$/u.test(value.ownerFingerprint) ||
      value.repositoryId !== record.repositoryId ||
      !path.isAbsolute(value.worktreePath) ||
      !value.branchRef.startsWith("refs/heads/codex/") ||
      !value.targetRef.startsWith("refs/heads/")
    ) throw new Error("TASK_WORKTREE_NOT_FOUND");
    return { record, privateState: value };
  }

  list(ownerFingerprint: string, repositoryId?: string): TaskWorktreeRecordV1[] {
    if (!/^[a-f0-9]{64}$/u.test(ownerFingerprint)) throw new Error("TASK_WORKTREE_NOT_FOUND");
    return this.listAll()
      .filter((item) =>
        item.privateState.ownerFingerprint === ownerFingerprint &&
        (!repositoryId || item.record.repositoryId === repositoryId)
      )
      .map((item) => item.record)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  listAll(): Array<{ record: TaskWorktreeRecordV1; privateState: TaskWorktreePrivateStateV1 }> {
    const names = fs.existsSync(this.#directory)
      ? fs.readdirSync(this.#directory, { withFileTypes: true }).filter((entry) => entry.isFile())
      : [];
    const output: Array<{ record: TaskWorktreeRecordV1; privateState: TaskWorktreePrivateStateV1 }> = [];
    for (const name of names) {
      const match = /^(task_[a-f0-9]{32})\.json$/u.exec(name.name);
      if (!match) continue;
      try {
        const item = this.read(match[1]);
        output.push(item);
      } catch {
        throw new Error("GIT_RECOVERY_REQUIRED");
      }
    }
    return output.sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));
  }

  update(
    taskWorktreeId: string,
    input: {
      state: TaskWorktreeStateV1;
      headOid?: string;
      privateState?: TaskWorktreePrivateStateV1;
    }
  ): TaskWorktreeRecordV1 {
    const current = this.read(taskWorktreeId);
    const nextPrivate = input.privateState ?? current.privateState;
    const base = {
      ...unsigned(current.record),
      generation: current.record.generation + 1,
      state: input.state,
      headOid: input.headOid ?? current.record.headOid,
      privateState: sealGitState(this.#sealKey, `task-worktree:${taskWorktreeId}`, nextPrivate, randomBytes),
      updatedAt: new Date(this.options.now?.() ?? Date.now()).toISOString()
    };
    const next = recordSchema.parse({
      ...base,
      recordMac: createHmac("sha256", this.#macKey).update(canonicalGateRJson(base)).digest("hex")
    });
    this.#atomic.write(this.pathFor(taskWorktreeId), next);
    return next;
  }

  pathFor(taskWorktreeId: string): string {
    if (!/^task_[a-f0-9]{32}$/u.test(taskWorktreeId)) throw new Error("TASK_WORKTREE_NOT_FOUND");
    return path.join(this.#directory, `${taskWorktreeId}.json`);
  }
}

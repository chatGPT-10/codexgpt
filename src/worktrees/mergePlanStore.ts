import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { DurableOpaqueRecordStoreV4 } from "../git/opaqueRecordStore.js";
import type { WorkspaceLockHandle, WorkspaceMutationLock } from "../transactions/workspaceLock.js";

export type MergePlanLifecycleStateV4 =
  | "preparing"
  | "prepared"
  | "effect_observed"
  | "recovery_required";

export interface MergePlanV4 {
  mergePlanId: string;
  lifecycleState: MergePlanLifecycleStateV4;
  taskWorktreeId: string;
  taskGeneration: number;
  repositoryId: string;
  repositoryIdentityFingerprint: string;
  capabilityRevision: string;
  contextFingerprint: string;
  policyRevision: string | null;
  ownerFingerprint: string;
  primaryWorkspaceRoot: string;
  targetRef: string;
  taskRef: string;
  candidateRef: string | null;
  targetOid: string;
  taskOid: string;
  candidateOid: string;
  candidateTreeOid: string;
  manifestDigest: string;
  diffDigest: string;
  historyDigest: string;
  checksComplete: boolean;
  receiptIds: string[];
  integrationWorkspaceId: string;
  requiredCheckCategories: string[];
  affectedPathCount: number;
  affectedByteCount: number;
  scanDigest: string;
  repositoryIntegrations: "disabled" | "approved_full_access";
  integrationIdentitiesDigest: string | null;
  integrationConfigDigest: string | null;
  integrationSemanticStateDigest: string | null;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
}

interface PlanReservationV4 {
  plan: MergePlanV4;
  consume(): MergePlanV4;
  release(): void;
}

export class MergePlanStoreV4 {
  readonly #plans = new Map<string, MergePlanV4>();
  readonly #reservations = new Map<string, string>();
  readonly #taskReservations = new Map<string, string>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;
  readonly #now: () => number;
  readonly #lifecycleLock: WorkspaceMutationLock | null;

  constructor(options: (() => number) | {
    now?: () => number;
    stateRoot?: string;
    masterKey?: Buffer;
    lifecycleLock?: WorkspaceMutationLock;
  } = Date.now) {
    const configured = typeof options === "function" ? null : options;
    this.#now = typeof options === "function" ? options : options.now ?? Date.now;
    this.#durable = configured?.stateRoot && configured.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: configured.stateRoot,
          masterKey: configured.masterKey,
          namespace: "merge-plans",
          now: this.#now
        })
      : null;
    this.#lifecycleLock = configured?.lifecycleLock ?? null;
  }

  allocateId(): string {
    return `merge_${randomBytes(16).toString("hex")}`;
  }

  create(input: Omit<MergePlanV4, "mergePlanId" | "createdAt" | "expiresAt" | "consumed"> & {
    mergePlanId?: string;
  }): MergePlanV4 {
    const now = this.#now();
    const retained = this.#durable
      ? this.#durable.list<MergePlanV4>("merge_plan").length
      : [...this.#plans.values()].filter((plan) => Date.parse(plan.expiresAt) >= now).length;
    if (retained >= 64) throw new Error("GIT_SCAN_LIMIT");
    const mergePlanId = input.mergePlanId ?? this.allocateId();
    if (!/^merge_[a-f0-9]{32}$/u.test(mergePlanId)) throw new Error("MERGE_PLAN_INVALID");
    const { mergePlanId: _provided, ...facts } = input;
    const plan = Object.freeze({
      ...facts,
      mergePlanId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
      consumed: false
    });
    this.#validate(plan, plan.ownerFingerprint, false);
    if (this.#durable) {
      this.#durable.put({
        recordId: plan.mergePlanId,
        kind: "merge_plan",
        value: plan,
        expiresAt: Date.parse(plan.expiresAt)
      });
    } else {
      this.#plans.set(plan.mergePlanId, plan);
    }
    return plan;
  }

  get(id: string, ownerFingerprint: string): MergePlanV4 {
    const plan = this.#getActive(id);
    this.#validate(plan, ownerFingerprint, true);
    return plan;
  }

  getForRecovery(id: string, ownerFingerprint: string): MergePlanV4 {
    const plan = this.#getIncludingExpired(id);
    this.#validate(plan, ownerFingerprint, false);
    return plan;
  }

  listForRecovery(ownerFingerprint?: string): MergePlanV4[] {
    const plans = this.#durable
      ? this.#durable.list<MergePlanV4>("merge_plan", { includeExpired: true }).map((item) => item.value)
      : [...this.#plans.values()];
    return plans
      .filter((plan) => ownerFingerprint === undefined || plan.ownerFingerprint === ownerFingerprint)
      .map((plan) => {
        this.#validate(plan, plan.ownerFingerprint, false);
        return plan;
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  transition(
    id: string,
    ownerFingerprint: string,
    expected: MergePlanLifecycleStateV4,
    next: MergePlanLifecycleStateV4
  ): MergePlanV4 {
    const plan = this.getForRecovery(id, ownerFingerprint);
    if (plan.lifecycleState !== expected) throw new Error("MERGE_PLAN_INVALID");
    const updated = Object.freeze({ ...plan, lifecycleState: next });
    if (this.#durable) this.#durable.replace(id, "merge_plan", updated);
    else this.#plans.set(id, updated);
    return updated;
  }

  reserveTask(taskWorktreeId: string): { release(): void } {
    if (!/^task_[a-f0-9]{32}$/u.test(taskWorktreeId) || this.#taskReservations.has(taskWorktreeId)) {
      throw new Error("MERGE_PLAN_INVALID");
    }
    const durableLock = this.#acquireLock("task", taskWorktreeId);
    const reservationId = randomBytes(16).toString("hex");
    this.#taskReservations.set(taskWorktreeId, reservationId);
    let active = true;
    return Object.freeze({
      release: () => {
        if (!active) return;
        if (this.#taskReservations.get(taskWorktreeId) === reservationId) {
          this.#taskReservations.delete(taskWorktreeId);
        }
        durableLock?.release();
        active = false;
      }
    });
  }

  reserve(id: string, ownerFingerprint: string): PlanReservationV4 {
    return this.#reserve(id, ownerFingerprint, false);
  }

  reserveForRecovery(id: string, ownerFingerprint: string): PlanReservationV4 {
    return this.#reserve(id, ownerFingerprint, true);
  }

  consume(id: string, ownerFingerprint: string): MergePlanV4 {
    if (this.#reservations.has(id)) throw new Error("MERGE_PLAN_INVALID");
    return this.#consumeUnreserved(id, ownerFingerprint, false);
  }

  consumeForRecovery(id: string, ownerFingerprint: string): MergePlanV4 {
    if (this.#reservations.has(id)) throw new Error("MERGE_PLAN_INVALID");
    return this.#consumeUnreserved(id, ownerFingerprint, true);
  }

  dispose(): void {
    this.#plans.clear();
    this.#reservations.clear();
    this.#taskReservations.clear();
    this.#durable?.dispose();
  }

  #reserve(id: string, ownerFingerprint: string, recovery: boolean): PlanReservationV4 {
    if (this.#reservations.has(id)) throw new Error("MERGE_PLAN_INVALID");
    const durableLock = this.#acquireLock("plan", id);
    let plan: MergePlanV4;
    try {
      plan = recovery ? this.getForRecovery(id, ownerFingerprint) : this.get(id, ownerFingerprint);
    } catch (error) {
      durableLock?.release();
      throw error;
    }
    const reservationId = randomBytes(16).toString("hex");
    this.#reservations.set(id, reservationId);
    let active = true;
    return Object.freeze({
      plan,
      consume: () => {
        if (!active || this.#reservations.get(id) !== reservationId) {
          throw new Error("MERGE_PLAN_INVALID");
        }
        this.#reservations.delete(id);
        active = false;
        try {
          return this.#consumeUnreserved(id, ownerFingerprint, true);
        } finally {
          durableLock?.release();
        }
      },
      release: () => {
        if (!active) return;
        if (this.#reservations.get(id) === reservationId) this.#reservations.delete(id);
        durableLock?.release();
        active = false;
      }
    });
  }

  #consumeUnreserved(id: string, ownerFingerprint: string, recovery: boolean): MergePlanV4 {
    const plan = recovery ? this.getForRecovery(id, ownerFingerprint) : this.get(id, ownerFingerprint);
    const consumed = Object.freeze({ ...plan, consumed: true });
    if (this.#durable) this.#durable.consume<MergePlanV4>(id, "merge_plan");
    else this.#plans.delete(id);
    return consumed;
  }

  #getActive(id: string): MergePlanV4 | undefined {
    return this.#durable
      ? this.#durable.get<MergePlanV4>(id, "merge_plan")
      : this.#plans.get(id);
  }

  #getIncludingExpired(id: string): MergePlanV4 | undefined {
    if (!this.#durable) return this.#plans.get(id);
    return this.#durable.list<MergePlanV4>("merge_plan", { includeExpired: true })
      .find((item) => item.recordId === id)?.value;
  }

  #validate(
    plan: MergePlanV4 | undefined,
    ownerFingerprint: string,
    executable: boolean
  ): asserts plan is MergePlanV4 {
    const integrationDigest = (value: string | null) => value === null || /^[a-f0-9]{64}$/u.test(value);
    if (
      !plan ||
      plan.ownerFingerprint !== ownerFingerprint ||
      !["preparing", "prepared", "effect_observed", "recovery_required"].includes(plan.lifecycleState) ||
      !/^task_[a-f0-9]{32}$/u.test(plan.taskWorktreeId) ||
      !Number.isSafeInteger(plan.taskGeneration) ||
      plan.taskGeneration < 1 ||
      !/^repo_[a-f0-9]{32}$/u.test(plan.repositoryId) ||
      !/^[a-f0-9]{64}$/u.test(plan.repositoryIdentityFingerprint) ||
      !/^[a-f0-9]{64}$/u.test(plan.capabilityRevision) ||
      !/^[a-f0-9]{64}$/u.test(plan.contextFingerprint) ||
      !/^[a-f0-9]{64}$/u.test(plan.ownerFingerprint) ||
      !path.isAbsolute(plan.primaryWorkspaceRoot) ||
      !plan.targetRef.startsWith("refs/heads/") ||
      !plan.taskRef.startsWith("refs/heads/codex/") ||
      (plan.candidateRef !== null && !plan.candidateRef.startsWith("refs/codexpro/candidates/")) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(plan.targetOid) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(plan.taskOid) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(plan.candidateOid) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(plan.candidateTreeOid) ||
      !/^[a-f0-9]{64}$/u.test(plan.manifestDigest) ||
      !/^[a-f0-9]{64}$/u.test(plan.diffDigest) ||
      !/^[a-f0-9]{64}$/u.test(plan.historyDigest) ||
      !/^ws_[a-f0-9]{32}$/u.test(plan.integrationWorkspaceId) ||
      plan.requiredCheckCategories.length < 1 ||
      plan.requiredCheckCategories.length > 8 ||
      plan.requiredCheckCategories.some((category) => !/^[a-z][a-z0-9_-]{0,31}$/u.test(category)) ||
      new Set(plan.requiredCheckCategories).size !== plan.requiredCheckCategories.length ||
      (plan.repositoryIntegrations !== "disabled" && plan.repositoryIntegrations !== "approved_full_access") ||
      !integrationDigest(plan.integrationIdentitiesDigest) ||
      !integrationDigest(plan.integrationConfigDigest) ||
      !integrationDigest(plan.integrationSemanticStateDigest) ||
      (plan.repositoryIntegrations === "approved_full_access") !== Boolean(plan.integrationIdentitiesDigest) ||
      (plan.repositoryIntegrations === "approved_full_access") !== Boolean(plan.integrationConfigDigest) ||
      (plan.repositoryIntegrations === "approved_full_access") !== Boolean(plan.integrationSemanticStateDigest) ||
      plan.consumed ||
      !Number.isFinite(Date.parse(plan.createdAt)) ||
      !Number.isFinite(Date.parse(plan.expiresAt)) ||
      (executable && plan.lifecycleState !== "prepared") ||
      (executable && Date.parse(plan.expiresAt) < this.#now())
    ) throw new Error("MERGE_PLAN_INVALID");
  }

  #acquireLock(domain: "plan" | "task", id: string): WorkspaceLockHandle | null {
    if (!this.#lifecycleLock) return null;
    const key = createHash("sha256").update(`merge-${domain}\0${id}`).digest("hex").slice(0, 32);
    return this.#lifecycleLock.acquire({
      workspaceStateKey: `wsk_${key}`,
      transactionId: `tx_${randomBytes(16).toString("hex")}`
    });
  }
}

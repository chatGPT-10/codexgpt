import { randomBytes } from "node:crypto";
import { DurableOpaqueRecordStoreV4 } from "../git/opaqueRecordStore.js";

export interface MergePlanV4 {
  mergePlanId: string;
  taskWorktreeId: string;
  repositoryId: string;
  ownerFingerprint: string;
  targetRef: string;
  taskRef: string;
  candidateRef: string | null;
  targetOid: string;
  taskOid: string;
  candidateOid: string;
  checksComplete: boolean;
  receiptIds: string[];
  affectedPathCount: number;
  affectedByteCount: number;
  scanDigest: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
}

export class MergePlanStoreV4 {
  readonly #plans = new Map<string, MergePlanV4>();
  readonly #durable: DurableOpaqueRecordStoreV4 | null;
  readonly #now: () => number;

  constructor(options: (() => number) | {
    now?: () => number;
    stateRoot?: string;
    masterKey?: Buffer;
  } = Date.now) {
    this.#now = typeof options === "function" ? options : options.now ?? Date.now;
    this.#durable = typeof options !== "function" && options.stateRoot && options.masterKey
      ? new DurableOpaqueRecordStoreV4({
          stateRoot: options.stateRoot,
          masterKey: options.masterKey,
          namespace: "merge-plans",
          now: this.#now
        })
      : null;
  }

  create(input: Omit<MergePlanV4, "mergePlanId" | "createdAt" | "expiresAt" | "consumed">): MergePlanV4 {
    const retained = this.#durable
      ? this.#durable.list<MergePlanV4>("merge_plan", { includeExpired: true }).length
      : this.#plans.size;
    if (retained >= 64) throw new Error("GIT_SCAN_LIMIT");
    const createdAt = new Date(this.#now()).toISOString();
    const plan = Object.freeze({
      ...input,
      mergePlanId: `merge_${randomBytes(16).toString("hex")}`,
      createdAt,
      expiresAt: new Date(this.#now() + 30 * 60_000).toISOString(),
      consumed: false
    });
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
    const plan = this.#durable
      ? this.#durable.get<MergePlanV4>(id, "merge_plan")
      : this.#plans.get(id);
    if (
      !plan ||
      plan.ownerFingerprint !== ownerFingerprint ||
      plan.consumed ||
      Date.parse(plan.expiresAt) < this.#now()
    ) throw new Error("MERGE_PLAN_INVALID");
    return plan;
  }

  consume(id: string, ownerFingerprint: string): MergePlanV4 {
    const plan = this.get(id, ownerFingerprint);
    const consumed = Object.freeze({ ...plan, consumed: true });
    if (this.#durable) this.#durable.consume<MergePlanV4>(id, "merge_plan");
    else this.#plans.delete(id);
    return consumed;
  }

  dispose(): void {
    this.#plans.clear();
    this.#durable?.dispose();
  }
}

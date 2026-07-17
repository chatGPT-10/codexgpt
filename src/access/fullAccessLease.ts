import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import type { RootIdentityV1 } from "./rootAdmission.js";

export type ConfirmedRootAccess = "read_only" | "read_write";
export type ConfirmedRootRevocationReason = "closed" | "expired" | "revoked" | "policy_stale" | "transport_closed";

export interface FullAccessLeaseV1 {
  schemaVersion: 1;
  workspaceId: string;
  leaseId: string;
  leaseKey: string;
  accessClass: "confirmed_root";
  access: ConfirmedRootAccess;
  rootIdentity: RootIdentityV1;
  bindingFingerprint: string;
  approvalId: string;
  grantId: string;
  openedAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

export interface FullAccessLeaseManagerOptions {
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  quarantineProcessInput?: (workspaceId: string, reason: ConfirmedRootRevocationReason) => void | Promise<void>;
  terminateBoundJobs?: (workspaceId: string, reason: ConfirmedRootRevocationReason) => void | Promise<void>;
  cleanupAuthorization?: (workspaceId: string, reason: ConfirmedRootRevocationReason) => void | Promise<void>;
}

interface LeaseRecord {
  lease: FullAccessLeaseV1;
  idleDeadline: number;
  absoluteDeadline: number;
}

const IDLE_MS = 10 * 60_000;
const ABSOLUTE_MAX_MS = 30 * 60_000;

function timestamp(value: number): string {
  return new Date(value).toISOString();
}

export class FullAccessLeaseManager {
  readonly #records = new Map<string, LeaseRecord>();
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #quarantine: NonNullable<FullAccessLeaseManagerOptions["quarantineProcessInput"]>;
  readonly #terminate: NonNullable<FullAccessLeaseManagerOptions["terminateBoundJobs"]>;
  readonly #cleanup: NonNullable<FullAccessLeaseManagerOptions["cleanupAuthorization"]>;
  #revocationTail: Promise<void> = Promise.resolve();

  constructor(options: FullAccessLeaseManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#quarantine = options.quarantineProcessInput ?? (() => undefined);
    this.#terminate = options.terminateBoundJobs ?? (() => undefined);
    this.#cleanup = options.cleanupAuthorization ?? (() => undefined);
  }

  create(input: {
    rootIdentity: RootIdentityV1;
    access: ConfirmedRootAccess;
    requestedLeaseMs: number;
    bindingFingerprint: string;
    approvalId: string;
    grantId: string;
  }): FullAccessLeaseV1 {
    if (!Number.isSafeInteger(input.requestedLeaseMs) || input.requestedLeaseMs < 60_000 || input.requestedLeaseMs > ABSOLUTE_MAX_MS) {
      throw new Error("Confirmed-root lease duration must be between one and thirty minutes.");
    }
    const now = this.#now();
    const absoluteDeadline = now + input.requestedLeaseMs;
    const workspaceId = this.#nextId("ws");
    const leaseId = this.#nextId("lease");
    const leaseKey = `confirmed_${createHash("sha256").update(JSON.stringify({
      root: input.rootIdentity.comparisonKey,
      access: input.access,
      leaseId,
      binding: input.bindingFingerprint
    })).digest("hex").slice(0, 32)}`;
    const idleDeadline = Math.min(now + IDLE_MS, absoluteDeadline);
    const lease: FullAccessLeaseV1 = Object.freeze({
      schemaVersion: 1,
      workspaceId,
      leaseId,
      leaseKey,
      accessClass: "confirmed_root",
      access: input.access,
      rootIdentity: structuredClone(input.rootIdentity),
      bindingFingerprint: input.bindingFingerprint,
      approvalId: input.approvalId,
      grantId: input.grantId,
      openedAt: timestamp(now),
      idleExpiresAt: timestamp(idleDeadline),
      absoluteExpiresAt: timestamp(absoluteDeadline)
    });
    this.#records.set(workspaceId, { lease, idleDeadline, absoluteDeadline });
    return structuredClone(lease);
  }

  get(workspaceId: string, touch = true): FullAccessLeaseV1 {
    const record = this.#records.get(workspaceId);
    if (!record) throw new Error("Unknown confirmed-root workspace.");
    const now = this.#now();
    if (now >= record.idleDeadline || now >= record.absoluteDeadline) {
      this.#revoke(record, "expired");
      throw new Error("Confirmed-root lease expired.");
    }
    if (touch) {
      record.idleDeadline = Math.min(now + IDLE_MS, record.absoluteDeadline);
      record.lease = Object.freeze({ ...record.lease, idleExpiresAt: timestamp(record.idleDeadline) });
    }
    return structuredClone(record.lease);
  }

  assertWrite(workspaceId: string): FullAccessLeaseV1 {
    const lease = this.get(workspaceId);
    if (lease.access !== "read_write") throw new Error("Confirmed-root lease is read-only.");
    return lease;
  }

  list(): FullAccessLeaseV1[] {
    this.prune();
    return [...this.#records.values()].map((record) => structuredClone(record.lease));
  }

  close(workspaceId: string, reason: ConfirmedRootRevocationReason = "closed"): void {
    const record = this.#records.get(workspaceId);
    if (record) this.#revoke(record, reason);
  }

  revokeWhere(predicate: (lease: FullAccessLeaseV1) => boolean, reason: ConfirmedRootRevocationReason): number {
    let count = 0;
    for (const record of [...this.#records.values()]) {
      if (!predicate(record.lease)) continue;
      this.#revoke(record, reason);
      count += 1;
    }
    return count;
  }

  prune(): number {
    const now = this.#now();
    return this.revokeWhere(
      (lease) => now >= Date.parse(lease.idleExpiresAt) || now >= Date.parse(lease.absoluteExpiresAt),
      "expired"
    );
  }

  async drainRevocations(): Promise<void> {
    await this.#revocationTail;
  }

  #revoke(record: LeaseRecord, reason: ConfirmedRootRevocationReason): void {
    this.#records.delete(record.lease.workspaceId);
    const previous = this.#revocationTail;
    this.#revocationTail = previous.then(async () => {
      let failure: unknown;
      try { await this.#quarantine(record.lease.workspaceId, reason); } catch (error) { failure = error; }
      try { await this.#terminate(record.lease.workspaceId, reason); } catch (error) { failure ??= error; }
      try { await this.#cleanup(record.lease.workspaceId, reason); } catch (error) { failure ??= error; }
      if (failure) throw failure;
    }, async () => {
      await this.#quarantine(record.lease.workspaceId, reason);
      await this.#terminate(record.lease.workspaceId, reason);
      await this.#cleanup(record.lease.workspaceId, reason);
    });
  }

  #nextId(prefix: string): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const value = this.#randomBytes(16);
      if (!Buffer.isBuffer(value) || value.length !== 16) throw new Error("Confirmed-root random source returned an invalid value.");
      const id = `${prefix}_${value.toString("hex")}`;
      if (![...this.#records.values()].some((record) => record.lease.workspaceId === id || record.lease.leaseId === id)) return id;
    }
    throw new Error("Confirmed-root identifier collision.");
  }
}

export function fullAccessWarning(access: ConfirmedRootAccess): string {
  return `This ${access === "read_write" ? "read-write" : "read-only"} root requires local confirmation. It is a brokered file boundary, not a sandbox, and does not sandbox or automatically authorize current-user processes.`;
}

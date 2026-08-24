import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import type { Workspace } from "../guard.js";

export type WorkspaceCapabilityRevocationReason =
  | "closed"
  | "expired"
  | "transport_closed"
  | "policy_revision_changed";

export interface WorkspaceCapabilityRevocationEvent {
  id: string;
  key: string;
  reason: WorkspaceCapabilityRevocationReason;
}

export interface OAuthWorkspaceCapabilityPrincipalV1 {
  authDomain: "oauth";
  deploymentBindingId: string;
  deploymentIncarnationId: string;
  ownerRef: string;
  clientRef: string;
  resource: string;
  grantId: string;
  grantRevision: number;
}

interface WorkspaceCapabilityRecord {
  workspace: Workspace;
  workspaceKey: string;
  principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>;
  principalDigest: string;
  policyRevision: string | null;
  expiresAtMs: number;
}

interface WorkspaceCapabilityTombstone {
  workspaceId: string;
  revokedAt: string;
  reason: WorkspaceCapabilityRevocationReason;
}

export interface WorkspaceCapabilityBindingFacts {
  workspaceKey: string;
  principalDigest: string;
  policyRevision: string | null;
}

export interface WorkspaceCapabilityRegistryOptions {
  ttlMs: number;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  maxTombstones?: number;
  maxPerPrincipal?: number;
  maxActive?: number;
}

export interface WorkspaceCapabilityIssueInput {
  root: string;
  workspaceKey: string;
}

export interface ClosedWorkspaceCapability {
  workspaceId: string;
  closedAt: string;
  state: "closed";
}

export class WorkspaceCapabilityCapacityError extends Error {
  constructor() {
    super("Workspace capability capacity is full.");
    this.name = "WorkspaceCapabilityCapacityError";
  }
}

function principalMaterial(principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>): string {
  return JSON.stringify({
    authDomain: principal.authDomain,
    deploymentBindingId: principal.deploymentBindingId,
    deploymentIncarnationId: principal.deploymentIncarnationId,
    ownerRef: principal.ownerRef,
    clientRef: principal.clientRef,
    resource: principal.resource,
    grantId: principal.grantId,
    grantRevision: principal.grantRevision
  });
}

function samePrincipal(
  left: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
  right: Readonly<OAuthWorkspaceCapabilityPrincipalV1>
): boolean {
  return left.authDomain === right.authDomain &&
    left.deploymentBindingId === right.deploymentBindingId &&
    left.deploymentIncarnationId === right.deploymentIncarnationId &&
    left.ownerRef === right.ownerRef &&
    left.clientRef === right.clientRef &&
    left.resource === right.resource &&
    left.grantId === right.grantId &&
    left.grantRevision === right.grantRevision;
}

function frozenPrincipal(
  principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>
): Readonly<OAuthWorkspaceCapabilityPrincipalV1> {
  return Object.freeze({
    authDomain: "oauth" as const,
    deploymentBindingId: principal.deploymentBindingId,
    deploymentIncarnationId: principal.deploymentIncarnationId,
    ownerRef: principal.ownerRef,
    clientRef: principal.clientRef,
    resource: principal.resource,
    grantId: principal.grantId,
    grantRevision: principal.grantRevision
  });
}

export function oauthWorkspaceCapabilityPrincipalDigest(
  principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>
): string {
  return `sha256:${createHash("sha256")
    .update("codexgpt.oauth.workspace-capability-principal.v1\0", "utf8")
    .update(principalMaterial(principal), "utf8")
    .digest("hex")}`;
}

export class WorkspaceCapabilityRegistry {
  readonly #records = new Map<string, WorkspaceCapabilityRecord>();
  readonly #workspaceIdsByDedupeKey = new Map<string, string>();
  readonly #tombstones = new Map<string, WorkspaceCapabilityTombstone>();
  readonly #listeners = new Set<(
    event: WorkspaceCapabilityRevocationEvent
  ) => void | Promise<void>>();
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #maxTombstones: number;
  readonly #maxPerPrincipal: number;
  readonly #maxActive: number;
  #disposed = false;

  constructor(options: WorkspaceCapabilityRegistryOptions) {
    this.#ttlMs = Math.max(60_000, Math.min(24 * 60 * 60_000, options.ttlMs));
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#maxTombstones = Math.max(16, Math.min(4096, options.maxTombstones ?? 256));
    this.#maxPerPrincipal = Math.max(1, Math.min(4096, options.maxPerPrincipal ?? 64));
    this.#maxActive = Math.max(this.#maxPerPrincipal, Math.min(16_384, options.maxActive ?? 256));
  }

  issueOrReuse(
    input: WorkspaceCapabilityIssueInput,
    principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
    policyRevision: string | null,
    beforeWorkspaceUse: (canonicalRoot: string) => void = () => undefined
  ): Workspace {
    this.#assertActive();
    this.pruneExpired();
    const staleForPrincipal = [...this.#records.values()].filter((record) =>
      samePrincipal(record.principal, principal) && record.policyRevision !== policyRevision
    );
    if (staleForPrincipal.length > 0) {
      const revokedAt = new Date(this.#now()).toISOString();
      for (const record of staleForPrincipal) {
        this.#revokeRecord(record, "policy_revision_changed", revokedAt);
      }
    }
    const principalDigest = oauthWorkspaceCapabilityPrincipalDigest(principal);
    const dedupeKey = this.#dedupeKey(principalDigest, input.workspaceKey, policyRevision);
    const existingId = this.#workspaceIdsByDedupeKey.get(dedupeKey);
    if (existingId) {
      const existing = this.#records.get(existingId);
      if (
        existing &&
        samePrincipal(existing.principal, principal) &&
        existing.policyRevision === policyRevision
      ) {
        beforeWorkspaceUse(existing.workspace.root);
        return this.#touch(existing);
      }
      this.#workspaceIdsByDedupeKey.delete(dedupeKey);
    }

    let principalCount = 0;
    for (const record of this.#records.values()) {
      if (record.principalDigest === principalDigest) principalCount += 1;
    }
    if (principalCount >= this.#maxPerPrincipal || this.#records.size >= this.#maxActive) {
      throw new WorkspaceCapabilityCapacityError();
    }

    beforeWorkspaceUse(input.root);
    const now = this.#now();
    const id = this.#nextWorkspaceId();
    const workspace: Workspace = {
      id,
      root: input.root,
      openedAt: new Date(now).toISOString()
    };
    const record: WorkspaceCapabilityRecord = {
      workspace,
      workspaceKey: input.workspaceKey,
      principal: frozenPrincipal(principal),
      principalDigest,
      policyRevision,
      expiresAtMs: now + this.#ttlMs
    };
    this.#records.set(id, record);
    this.#workspaceIdsByDedupeKey.set(dedupeKey, id);
    return { ...workspace };
  }

  resolve(
    workspaceId: string,
    principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
    policyRevision: string | null,
    beforeWorkspaceUse: (canonicalRoot: string) => void = () => undefined
  ): Workspace | undefined {
    if (this.#disposed) return undefined;
    this.pruneExpired();
    const record = this.#records.get(workspaceId);
    if (!record || !samePrincipal(record.principal, principal)) return undefined;
    if (record.policyRevision !== policyRevision) {
      this.#revokeRecord(record, "policy_revision_changed");
      return undefined;
    }
    beforeWorkspaceUse(record.workspace.root);
    return this.#touch(record);
  }

  close(
    workspaceId: string,
    principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
    policyRevision: string | null
  ): ClosedWorkspaceCapability | undefined {
    if (this.#disposed) return undefined;
    this.pruneExpired();
    const record = this.#records.get(workspaceId);
    if (!record || !samePrincipal(record.principal, principal)) return undefined;
    if (record.policyRevision !== policyRevision) {
      this.#revokeRecord(record, "policy_revision_changed");
      return undefined;
    }
    const closedAt = new Date(this.#now()).toISOString();
    this.#revokeRecord(record, "closed", closedAt);
    return { workspaceId, closedAt, state: "closed" };
  }

  list(
    principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
    policyRevision: string | null
  ): Workspace[] {
    if (this.#disposed) return [];
    this.pruneExpired();
    const result: Workspace[] = [];
    for (const record of [...this.#records.values()]) {
      if (!samePrincipal(record.principal, principal)) continue;
      if (record.policyRevision !== policyRevision) {
        this.#revokeRecord(record, "policy_revision_changed");
        continue;
      }
      result.push({ ...record.workspace });
    }
    return result;
  }

  bindingFacts(
    workspaceId: string,
    principal: Readonly<OAuthWorkspaceCapabilityPrincipalV1>,
    policyRevision: string | null
  ): WorkspaceCapabilityBindingFacts | undefined {
    if (this.#disposed) return undefined;
    const record = this.#records.get(workspaceId);
    if (
      !record ||
      !samePrincipal(record.principal, principal) ||
      record.policyRevision !== policyRevision ||
      record.expiresAtMs <= this.#now()
    ) return undefined;
    return {
      workspaceKey: record.workspaceKey,
      principalDigest: record.principalDigest,
      policyRevision: record.policyRevision
    };
  }

  revokeForPolicyRevision(activePolicyRevision: string): void {
    if (this.#disposed) return;
    const revokedAt = new Date(this.#now()).toISOString();
    for (const record of [...this.#records.values()]) {
      if (record.policyRevision === activePolicyRevision) continue;
      this.#revokeRecord(record, "policy_revision_changed", revokedAt);
    }
  }

  onWorkspaceRevoked(
    listener: (event: WorkspaceCapabilityRevocationEvent) => void | Promise<void>
  ): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  pruneExpired(): void {
    if (this.#disposed) return;
    const now = this.#now();
    const revokedAt = new Date(now).toISOString();
    for (const record of [...this.#records.values()]) {
      if (record.expiresAtMs <= now) this.#revokeRecord(record, "expired", revokedAt);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#records.clear();
    this.#workspaceIdsByDedupeKey.clear();
    this.#tombstones.clear();
    this.#listeners.clear();
  }

  #touch(record: WorkspaceCapabilityRecord): Workspace {
    record.expiresAtMs = this.#now() + this.#ttlMs;
    return { ...record.workspace };
  }

  #dedupeKey(principalDigest: string, workspaceKey: string, policyRevision: string | null): string {
    return `${principalDigest}\0${workspaceKey}\0${policyRevision ?? ""}`;
  }

  #nextWorkspaceId(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = this.#randomBytes(16);
      if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
        throw new Error("Workspace id generator returned an invalid value.");
      }
      const id = `ws_${bytes.toString("hex")}`;
      if (!this.#records.has(id) && !this.#tombstones.has(id)) return id;
    }
    throw new Error("Workspace id generation failed.");
  }

  #revokeRecord(
    record: WorkspaceCapabilityRecord,
    reason: WorkspaceCapabilityRevocationReason,
    revokedAt = new Date(this.#now()).toISOString()
  ): void {
    this.#records.delete(record.workspace.id);
    const dedupeKey = this.#dedupeKey(record.principalDigest, record.workspaceKey, record.policyRevision);
    if (this.#workspaceIdsByDedupeKey.get(dedupeKey) === record.workspace.id) {
      this.#workspaceIdsByDedupeKey.delete(dedupeKey);
    }
    this.#tombstones.set(record.workspace.id, {
      workspaceId: record.workspace.id,
      revokedAt,
      reason
    });
    const event: WorkspaceCapabilityRevocationEvent = {
      id: record.workspace.id,
      key: record.workspaceKey,
      reason
    };
    for (const listener of this.#listeners) {
      try {
        const pending = listener(event);
        if (pending && typeof (pending as PromiseLike<void>).then === "function") {
          void Promise.resolve(pending).catch(() => undefined);
        }
      } catch {
        // Revocation remains authoritative even if a cache observer fails.
      }
    }
    while (this.#tombstones.size > this.#maxTombstones) {
      const oldest = this.#tombstones.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#tombstones.delete(oldest);
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Workspace capability registry is disposed.");
  }
}

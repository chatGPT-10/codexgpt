import { timingSafeEqual } from "node:crypto";
import { AuthStateLock, type AuthStateLockHandle } from "./deploymentLock.js";
import { OAuthProtocolError, authConfigurationError } from "./errors.js";
import type {
  AuthStateAuditEvent,
  AuthStateStore,
  DeploymentGrantRecordV1,
  DeploymentStateV1,
  OAuthGrantRecordV1
} from "./stateStore.js";
import type { OAuthScope } from "./types.js";

export const OAUTH_REFRESH_IDLE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const OAUTH_REFRESH_ABSOLUTE_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
export const OAUTH_ACTIVE_GRANT_DEPLOYMENT_LIMIT = 64;
export const OAUTH_ACTIVE_GRANT_CLIENT_LIMIT = 8;

export type GrantRevokeReason = OAuthGrantRecordV1["revokeReason"] extends infer T
  ? Exclude<T, null>
  : never;

export interface SafeOAuthGrantView {
  grantId: string;
  clientRef: string;
  scopes: readonly OAuthScope[];
  status: OAuthGrantRecordV1["status"];
  grantRevision: number;
  refreshGeneration: number;
  createdAt: string;
  lastUsedAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  revokeReason: OAuthGrantRecordV1["revokeReason"];
}

export interface GrantStoreOptions {
  store: AuthStateStore;
  locks: AuthStateLock;
  bindingId: string;
  incarnationId: string;
  ownerRef: string;
  resource: string;
  now?: () => number;
}

export interface CreateGrantInput {
  grantId: string;
  clientId: string;
  clientRef: string;
  scopes: readonly OAuthScope[];
  familyHandle: string;
  refreshTokenHash: string;
  authorizationCodeHash: string;
}

export interface RotateRefreshInput {
  familyHandle: string;
  generation: bigint;
  presentedTokenHash: string;
  nextTokenHash: string;
  clientId: string;
  clientRef: string;
  resource: string;
  scopes: readonly OAuthScope[];
}

export type RefreshMutationResult =
  | { kind: "rotated"; grant: OAuthGrantRecordV1 }
  | { kind: "replayed"; grant: OAuthGrantRecordV1 };

function deploymentLockName(bindingId: string): `deployment_binding_${string}` {
  if (!/^binding_[a-f0-9]{32}$/.test(bindingId)) {
    throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth deployment binding identifier is invalid.");
  }
  return `deployment_${bindingId}` as `deployment_binding_${string}`;
}

export function isOAuthGrantRecord(record: DeploymentGrantRecordV1): record is OAuthGrantRecordV1 {
  return "familyHandle" in record && "refreshTokenHash" in record;
}

function exactHashEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function invalidGrant(): OAuthProtocolError {
  return new OAuthProtocolError("invalid_grant", "The OAuth grant is invalid.");
}

export class OAuthGrantStore {
  readonly #store: AuthStateStore;
  readonly #locks: AuthStateLock;
  readonly #bindingId: string;
  readonly #incarnationId: string;
  readonly #ownerRef: string;
  readonly #resource: string;
  readonly #now: () => number;

  constructor(options: GrantStoreOptions) {
    this.#store = options.store;
    this.#locks = options.locks;
    this.#bindingId = options.bindingId;
    this.#incarnationId = options.incarnationId;
    this.#ownerRef = options.ownerRef;
    this.#resource = options.resource;
    this.#now = options.now ?? Date.now;
  }

  async create(input: CreateGrantInput): Promise<OAuthGrantRecordV1> {
    return await this.#mutate("authorization_code_exchanged", (state, now) => {
      const grants = [...state.grants];
      if (!/^grant_[a-f0-9]{32}$/.test(input.grantId)) {
        throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth grant identifier is invalid.");
      }
      if (grants.some((record) => isOAuthGrantRecord(record) && record.grantId === input.grantId)) {
        throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth grant identifier already exists.");
      }
      if (grants.some((record) => isOAuthGrantRecord(record) && record.authorizationCodeHash === input.authorizationCodeHash)) {
        throw invalidGrant();
      }
      const active = grants.filter((record) => isOAuthGrantRecord(record) && record.status === "active");
      if (active.length >= OAUTH_ACTIVE_GRANT_DEPLOYMENT_LIMIT || active.filter((record) => record.clientRef === input.clientRef).length >= OAUTH_ACTIVE_GRANT_CLIENT_LIMIT) {
        throw new OAuthProtocolError("temporarily_unavailable", "OAuth grant capacity is temporarily full.", 503);
      }
      const createdAt = new Date(now).toISOString();
      const absoluteExpiresAt = new Date(now + OAUTH_REFRESH_ABSOLUTE_LIFETIME_MS).toISOString();
      const idleExpiresAt = new Date(Math.min(now + OAUTH_REFRESH_IDLE_LIFETIME_MS, Date.parse(absoluteExpiresAt))).toISOString();
      const grant: OAuthGrantRecordV1 = {
        grantId: input.grantId,
        familyHandle: input.familyHandle,
        clientRef: input.clientRef,
        clientId: input.clientId,
        ownerRef: this.#ownerRef,
        resource: this.#resource,
        scopes: [...input.scopes],
        active: true,
        status: "active",
        grantRevision: 0,
        refreshGeneration: 0,
        refreshTokenHash: input.refreshTokenHash,
        authorizationCodeHash: input.authorizationCodeHash,
        createdAt,
        lastUsedAt: createdAt,
        idleExpiresAt,
        absoluteExpiresAt,
        revokedAt: null,
        revokeReason: null
      };
      return { grants: [...grants, grant], result: structuredClone(grant) };
    });
  }

  async rotateRefresh(input: RotateRefreshInput): Promise<RefreshMutationResult> {
    return await this.#mutate<RefreshMutationResult>("refresh_rotated", (state, now) => {
      const grants = [...state.grants];
      const index = grants.findIndex((record) => isOAuthGrantRecord(record) && record.familyHandle === input.familyHandle);
      if (index < 0 || !isOAuthGrantRecord(grants[index])) throw invalidGrant();
      const current = grants[index] as OAuthGrantRecordV1;
      if (current.status !== "active" || !this.#clientApproved(state, current.clientId, current.clientRef)) throw invalidGrant();
      if (
        current.clientId !== input.clientId ||
        current.clientRef !== input.clientRef ||
        current.resource !== input.resource
      ) {
        throw invalidGrant();
      }
      if (
        current.scopes.length !== input.scopes.length ||
        current.scopes.some((scope, index) => scope !== input.scopes[index])
      ) {
        throw new OAuthProtocolError("invalid_scope", "Refresh scope must exactly match the current grant.");
      }
      if (Date.parse(current.idleExpiresAt) <= now || Date.parse(current.absoluteExpiresAt) <= now) {
        const expired = this.#terminal(current, now, "expired");
        grants[index] = expired;
        return {
          grants,
          result: { kind: "replayed" as const, grant: structuredClone(expired) },
          transition: "grant_expired" as const,
          throwAfterPersist: invalidGrant()
        };
      }
      const currentGeneration = BigInt(current.refreshGeneration);
      if (input.generation < currentGeneration) {
        const revoked = this.#terminal(current, now, "replay");
        grants[index] = revoked;
        return {
          grants,
          result: { kind: "replayed" as const, grant: structuredClone(revoked) },
          transition: "refresh_replayed" as const
        };
      }
      if (input.generation !== currentGeneration || !exactHashEqual(current.refreshTokenHash, input.presentedTokenHash)) {
        throw invalidGrant();
      }
      if (current.refreshGeneration >= Number.MAX_SAFE_INTEGER) {
        const revoked = this.#terminal(current, now, "replay");
        grants[index] = revoked;
        return {
          grants,
          result: { kind: "replayed" as const, grant: structuredClone(revoked) },
          transition: "refresh_replayed" as const
        };
      }
      const next: OAuthGrantRecordV1 = {
        ...current,
        refreshGeneration: current.refreshGeneration + 1,
        refreshTokenHash: input.nextTokenHash,
        lastUsedAt: new Date(now).toISOString(),
        idleExpiresAt: new Date(Math.min(now + OAUTH_REFRESH_IDLE_LIFETIME_MS, Date.parse(current.absoluteExpiresAt))).toISOString()
      };
      grants[index] = next;
      return { grants, result: { kind: "rotated" as const, grant: structuredClone(next) } };
    });
  }

  async validateAccess(input: {
    grantId: string;
    clientId: string;
    ownerRef: string;
    resource: string;
    grantRevision: number;
    scopes: readonly OAuthScope[];
  }): Promise<OAuthGrantRecordV1> {
    let handle: AuthStateLockHandle | null = null;
    try {
      handle = this.#locks.acquire(deploymentLockName(this.#bindingId));
      const state = this.#readState();
      const record = state.grants.find((entry) => isOAuthGrantRecord(entry) && entry.grantId === input.grantId);
      if (!record || !isOAuthGrantRecord(record)) throw invalidGrant();
      const now = this.#now();
      if (record.status !== "active" || !this.#clientApproved(state, record.clientId, record.clientRef)) throw invalidGrant();
      if (Date.parse(record.idleExpiresAt) <= now || Date.parse(record.absoluteExpiresAt) <= now) {
        const grants = state.grants.map((entry) => entry === record ? this.#terminal(record, now, "expired") : entry);
        await this.#write(state, grants, "grant_expired", now);
        throw invalidGrant();
      }
      if (
        record.clientId !== input.clientId ||
        record.ownerRef !== input.ownerRef ||
        record.resource !== input.resource ||
        record.grantRevision !== input.grantRevision ||
        record.scopes.length !== input.scopes.length ||
        record.scopes.some((scope, index) => scope !== input.scopes[index])
      ) {
        throw invalidGrant();
      }
      return structuredClone(record);
    } finally {
      handle?.release();
    }
  }

  async revokeFamily(input: {
    familyHandle: string;
    clientRef?: string;
    reason: Exclude<GrantRevokeReason, "expired" | "scope_revision">;
  }): Promise<boolean> {
    return await this.#mutate("grant_revoked", (state, now) => {
      const grants = [...state.grants];
      const index = grants.findIndex((record) => isOAuthGrantRecord(record) && record.familyHandle === input.familyHandle);
      if (index < 0 || !isOAuthGrantRecord(grants[index])) return { grants, result: false, changed: false };
      const current = grants[index] as OAuthGrantRecordV1;
      if (input.clientRef && current.clientRef !== input.clientRef) return { grants, result: false, changed: false };
      if (current.status !== "active") return { grants, result: false, changed: false };
      grants[index] = this.#terminal(current, now, input.reason);
      return { grants, result: true };
    });
  }

  async revokeGrant(grantId: string, reason: Exclude<GrantRevokeReason, "expired" | "scope_revision"> = "local"): Promise<boolean> {
    return await this.#mutate("grant_revoked", (state, now) => {
      const grants = [...state.grants];
      const index = grants.findIndex((record) => isOAuthGrantRecord(record) && record.grantId === grantId);
      if (index < 0 || !isOAuthGrantRecord(grants[index])) return { grants, result: false, changed: false };
      const current = grants[index] as OAuthGrantRecordV1;
      if (current.status !== "active") return { grants, result: false, changed: false };
      grants[index] = this.#terminal(current, now, reason);
      return { grants, result: true };
    });
  }

  async revokeClient(clientRef: string): Promise<number> {
    return await this.#mutate("grant_revoked", (state, now) => {
      let count = 0;
      const grants = state.grants.map((record) => {
        if (!isOAuthGrantRecord(record) || record.status !== "active" || record.clientRef !== clientRef) return record;
        count += 1;
        return this.#terminal(record, now, "client");
      });
      return { grants, result: count, changed: count > 0 };
    });
  }

  async revokeOwner(): Promise<number> {
    return await this.#mutate("grant_revoked", (state, now) => {
      let count = 0;
      const grants = state.grants.map((record) => {
        if (!isOAuthGrantRecord(record) || record.status !== "active" || record.ownerRef !== this.#ownerRef) return record;
        count += 1;
        return this.#terminal(record, now, "owner");
      });
      return { grants, result: count, changed: count > 0 };
    });
  }

  listSafe(limit = 128): SafeOAuthGrantView[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 128) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth grant list limit is invalid.");
    }
    return this.#readState().grants
      .filter(isOAuthGrantRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((grant) => Object.freeze({
        grantId: grant.grantId,
        clientRef: grant.clientRef,
        scopes: Object.freeze([...grant.scopes]),
        status: grant.status,
        grantRevision: grant.grantRevision,
        refreshGeneration: grant.refreshGeneration,
        createdAt: grant.createdAt,
        lastUsedAt: grant.lastUsedAt,
        idleExpiresAt: grant.idleExpiresAt,
        absoluteExpiresAt: grant.absoluteExpiresAt,
        revokedAt: grant.revokedAt,
        revokeReason: grant.revokeReason
      }));
  }

  getByFamily(familyHandle: string): OAuthGrantRecordV1 | undefined {
    const record = this.#readState().grants.find((entry) => isOAuthGrantRecord(entry) && entry.familyHandle === familyHandle);
    return record && isOAuthGrantRecord(record) ? structuredClone(record) : undefined;
  }

  getByGrantId(grantId: string): OAuthGrantRecordV1 | undefined {
    const record = this.#readState().grants.find((entry) => isOAuthGrantRecord(entry) && entry.grantId === grantId);
    return record && isOAuthGrantRecord(record) ? structuredClone(record) : undefined;
  }

  #clientApproved(state: DeploymentStateV1, clientId: string, clientRef: string): boolean {
    const client = (state.clients ?? []).find((entry) => entry.clientId === clientId);
    return Boolean(client && client.clientRef === clientRef && client.status === "approved");
  }

  #terminal(current: OAuthGrantRecordV1, now: number, reason: GrantRevokeReason): OAuthGrantRecordV1 {
    return {
      ...current,
      active: false,
      status: reason === "expired" ? "expired" : "revoked",
      grantRevision: current.grantRevision + 1,
      revokedAt: new Date(now).toISOString(),
      revokeReason: reason
    };
  }

  #readState(): DeploymentStateV1 {
    const state = this.#store.readDeployment(this.#bindingId, this.#incarnationId);
    if (state.bindingId !== this.#bindingId || state.incarnationId !== this.#incarnationId) {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth grant store identity changed.");
    }
    return state;
  }

  async #write(
    current: DeploymentStateV1,
    grants: DeploymentGrantRecordV1[],
    transition: AuthStateAuditEvent["transition"],
    now: number
  ): Promise<void> {
    const { integrity: _integrity, ...withoutIntegrity } = current;
    await this.#store.writeDeployment({
      ...withoutIntegrity,
      generation: current.generation + 1,
      grants,
      updatedAt: new Date(now).toISOString()
    }, transition);
  }

  async #mutate<T>(
    defaultTransition: AuthStateAuditEvent["transition"],
    action: (state: DeploymentStateV1, now: number) => Promise<{
      grants: DeploymentGrantRecordV1[];
      result: T;
      changed?: boolean;
      transition?: AuthStateAuditEvent["transition"];
      throwAfterPersist?: Error;
    }> | {
      grants: DeploymentGrantRecordV1[];
      result: T;
      changed?: boolean;
      transition?: AuthStateAuditEvent["transition"];
      throwAfterPersist?: Error;
    }
  ): Promise<T> {
    let handle: AuthStateLockHandle | null = null;
    try {
      handle = this.#locks.acquire(deploymentLockName(this.#bindingId));
      const current = this.#readState();
      const now = this.#now();
      const mutation = await action(current, now);
      if (mutation.changed === false) return mutation.result;
      await this.#write(current, mutation.grants, mutation.transition ?? defaultTransition, now);
      if (mutation.throwAfterPersist) throw mutation.throwAfterPersist;
      return mutation.result;
    } finally {
      handle?.release();
    }
  }

}

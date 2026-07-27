import {
  AuthorizationStore,
  type SafePendingAuthorization
} from "./authorizationStore.js";
import { OAuthClientStore, clientRefForId, type SafeOAuthClientView } from "./clientStore.js";
import type { OAuthGrantStore, SafeOAuthGrantView } from "./grantStore.js";

export interface OAuthOwnerApprovalControl {
  list(): SafePendingAuthorization[] | Promise<SafePendingAuthorization[]>;
  approve(pendingId: string): boolean | Promise<boolean>;
  deny(pendingId: string): boolean | Promise<boolean>;
}

export interface OAuthOwnerClientControl {
  list(): SafeOAuthClientView[] | Promise<SafeOAuthClientView[]>;
  revoke(clientId: string): boolean | Promise<boolean>;
  pruneUnapproved(): number | Promise<number>;
}

export interface OAuthOwnerGrantControl {
  list(): SafeOAuthGrantView[] | Promise<SafeOAuthGrantView[]>;
  revoke(grantId: string): boolean | Promise<boolean>;
  revokeOwner(): number | Promise<number>;
}

export class OAuthOwnerApprovalService implements OAuthOwnerApprovalControl {
  constructor(readonly authorizations: AuthorizationStore) {}

  list(): Promise<SafePendingAuthorization[]> {
    return this.authorizations.listSafe();
  }

  approve(pendingId: string): Promise<boolean> {
    return this.authorizations.approve(pendingId);
  }

  deny(pendingId: string): Promise<boolean> {
    return this.authorizations.deny(pendingId);
  }
}

export class OAuthOwnerGrantService implements OAuthOwnerGrantControl {
  constructor(readonly grants: OAuthGrantStore) {}

  list(): SafeOAuthGrantView[] {
    return this.grants.listSafe();
  }

  revoke(grantId: string): Promise<boolean> {
    return this.grants.revokeGrant(grantId, "local");
  }

  revokeOwner(): Promise<number> {
    return this.grants.revokeOwner();
  }
}

export class OAuthOwnerClientService implements OAuthOwnerClientControl {
  constructor(
    readonly clients: OAuthClientStore,
    readonly grants?: OAuthGrantStore
  ) {}

  list(): SafeOAuthClientView[] {
    return this.clients.listSafe();
  }

  async revoke(clientId: string): Promise<boolean> {
    const clientChanged = await this.clients.revoke(clientId);
    const grantsChanged = await this.grants?.revokeClient(clientRefForId(clientId)) ?? 0;
    return clientChanged || grantsChanged > 0;
  }

  pruneUnapproved(): Promise<number> {
    return this.clients.pruneUnapproved();
  }
}

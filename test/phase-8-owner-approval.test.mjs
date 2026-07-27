import assert from "node:assert/strict";
import test from "node:test";
import { LocalApprovalServer } from "../dist/control/localApprovalServer.js";
import { PendingApprovalStore } from "../dist/policy/pendingApprovals.js";
import { SessionGrantStore } from "../dist/policy/approval.js";
import { localControlRequestV3Schema } from "../dist/control/schemas.js";
import { OAuthOwnerClientService } from "../dist/auth/ownerApproval.js";

function pendingEntry(overrides = {}) {
  return {
    pendingId: "pending_ABCDEFGHIJKLMNOPQRSTUV",
    correlationCode: "ABCD-2345",
    canonicalRoot: "D:\\Dev\\codexpro",
    clientLabel: "ChatGPT",
    clientRef: "clientref_0123456789abcdef0123456789abcdef",
    redirectHost: "chatgpt.com",
    redirectPath: "/connector/oauth/callback_12345678",
    scopes: ["codexgpt:read"],
    scopesMatchCurrentConfiguration: true,
    status: "pending",
    createdAt: "2026-07-26T12:00:00.000Z",
    expiresAt: "2026-07-26T12:05:00.000Z",
    ...overrides
  };
}

function server(control, clients, oauthGrants, oauthSigningKeys) {
  return new LocalApprovalServer({
    serverId: "a".repeat(32),
    approvals: new PendingApprovalStore(),
    grants: new SessionGrantStore(),
    oauthAuthorizations: control,
    oauthClients: clients,
    oauthGrants,
    oauthSigningKeys
  });
}

function request(operation, extra = {}) {
  return {
    schemaVersion: 3,
    contractVersion: 3,
    serverId: "a".repeat(32),
    operation,
    ...extra
  };
}

test("current-user local control lists only safe OAuth approval facts", async () => {
  const entry = pendingEntry();
  const local = server({
    list: () => [entry],
    approve: () => false,
    deny: () => false
  });
  const response = await local.handle(request("oauth.authorizations.list"));
  assert.equal(response.ok, true);
  assert.deepEqual(response.oauthAuthorizations, [entry]);
  const serialized = JSON.stringify(response);
  for (const forbidden of ["state_", "code_challenge", "browserBinding", "client_id", "authorization code"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("local control alone can approve or deny an exact pending id", async () => {
  const entry = pendingEntry();
  let status = "pending";
  const control = {
    list: () => [pendingEntry({ status })],
    approve: (pendingId) => {
      assert.equal(pendingId, entry.pendingId);
      if (status !== "pending") return false;
      status = "approved";
      return true;
    },
    deny: (pendingId) => {
      assert.equal(pendingId, entry.pendingId);
      if (status !== "pending") return false;
      status = "denied";
      return true;
    }
  };
  const approveServer = server(control);
  const approved = await approveServer.handle(request("oauth.authorizations.approve", { pendingId: entry.pendingId }));
  assert.equal(approved.code, "OAUTH_AUTHORIZATION_APPROVED");
  assert.equal(approved.oauthAuthorizations[0].status, "approved");
  const deniedAfterApproval = await approveServer.handle(request("oauth.authorizations.deny", { pendingId: entry.pendingId }));
  assert.equal(deniedAfterApproval.code, "OAUTH_AUTHORIZATION_NOT_FOUND");
  assert.equal(deniedAfterApproval.ok, false);

  status = "pending";
  const denyServer = server(control);
  const denied = await denyServer.handle(request("oauth.authorizations.deny", { pendingId: entry.pendingId }));
  assert.equal(denied.code, "OAUTH_AUTHORIZATION_DENIED");
  assert.equal(denied.oauthAuthorizations[0].status, "denied");
});

test("current-user local control lists and revokes OAuth clients for capacity recovery", async () => {
  const clientId = `client_${"A".repeat(43)}`;
  let status = "approved";
  const clients = {
    list: () => [{
      clientId,
      clientRef: "clientref_0123456789abcdef0123456789abcdef",
      label: "ChatGPT",
      redirectHost: "chatgpt.com",
      redirectPath: "/connector/oauth/callback_12345678",
      status,
      createdAt: "2026-07-26T12:00:00.000Z",
      expiresAt: "2026-07-27T12:00:00.000Z",
      approvedAt: "2026-07-26T12:01:00.000Z"
    }],
    revoke: (exactClientId) => {
      assert.equal(exactClientId, clientId);
      if (status === "revoked") return false;
      status = "revoked";
      return true;
    },
    pruneUnapproved: () => 0
  };
  const local = server(undefined, clients);
  const listed = await local.handle(request("oauth.clients.list"));
  assert.equal(listed.oauthClients[0].clientId, clientId);
  const revoked = await local.handle(request("oauth.clients.revoke", { clientId }));
  assert.equal(revoked.code, "OAUTH_CLIENT_REVOKED");
  assert.equal(revoked.oauthClients[0].status, "revoked");
});

test("current-user local control prunes unapproved clients", async () => {
  let count = 2;
  const clients = {
    list: () => [],
    revoke: () => false,
    pruneUnapproved: () => {
      const result = count;
      count = 0;
      return result;
    }
  };
  const local = server(undefined, clients);
  const pruned = await local.handle(request("oauth.clients.prune_unapproved"));
  assert.equal(pruned.code, "OAUTH_UNAPPROVED_CLIENTS_PRUNED");
  assert.equal(pruned.changed, true);
  const retried = await local.handle(request("oauth.clients.prune_unapproved"));
  assert.equal(retried.code, "OAUTH_CLIENT_NOT_FOUND");
  assert.equal(retried.ok, true);
});

test("client revoke retries complete a previously failed grant cascade", async () => {
  let clientChanged = true;
  let grantAttempts = 0;
  const service = new OAuthOwnerClientService(
    {
      revoke: async () => {
        const changed = clientChanged;
        clientChanged = false;
        return changed;
      },
      listSafe: () => []
    },
    {
      revokeClient: async () => {
        grantAttempts += 1;
        if (grantAttempts === 1) throw new Error("audit-offline");
        return 1;
      }
    }
  );
  await assert.rejects(() => service.revoke(`client_${"A".repeat(43)}`), /audit-offline/);
  assert.equal(await service.revoke(`client_${"A".repeat(43)}`), true);
  assert.equal(grantAttempts, 2);
});

test("current-user local control lists, revokes, and owner-revokes OAuth grants without secret fields", async () => {
  const grantId = `grant_${"b".repeat(32)}`;
  let status = "active";
  let revokeReason = null;
  const grants = {
    list: () => [{
      grantId,
      clientRef: "clientref_0123456789abcdef0123456789abcdef",
      scopes: ["codexgpt:read"],
      status,
      grantRevision: status === "active" ? 0 : 1,
      refreshGeneration: 7,
      createdAt: "2026-07-26T12:00:00.000Z",
      lastUsedAt: "2026-07-26T12:01:00.000Z",
      idleExpiresAt: "2026-10-24T12:01:00.000Z",
      absoluteExpiresAt: "2027-07-26T12:00:00.000Z",
      revokedAt: status === "active" ? null : "2026-07-26T12:02:00.000Z",
      revokeReason
    }],
    revoke: (exactGrantId) => {
      assert.equal(exactGrantId, grantId);
      if (status !== "active") return false;
      status = "revoked";
      revokeReason = "local";
      return true;
    },
    revokeOwner: () => {
      if (status !== "active") return 0;
      status = "revoked";
      revokeReason = "owner";
      return 1;
    }
  };
  const local = server(undefined, undefined, grants);
  const listed = await local.handle(request("oauth.grants.list"));
  assert.equal(listed.oauthGrants[0].grantId, grantId);
  for (const forbidden of ["familyHandle", "refreshTokenHash", "authorizationCodeHash", "clientId", "access_token", "refresh_token"]) {
    assert.equal(JSON.stringify(listed).includes(forbidden), false, forbidden);
  }
  const revoked = await local.handle(request("oauth.grants.revoke", { grantId }));
  assert.equal(revoked.code, "OAUTH_GRANT_REVOKED");
  assert.equal(revoked.oauthGrants[0].revokeReason, "local");

  status = "active";
  revokeReason = null;
  const ownerRevoked = await local.handle(request("oauth.grants.revoke_owner"));
  assert.equal(ownerRevoked.code, "OAUTH_OWNER_GRANTS_REVOKED");
  assert.equal(ownerRevoked.oauthGrants[0].revokeReason, "owner");
});

test("signing-key rotation may atomically revoke owner grants first", async () => {
  const order = [];
  const grants = {
    list: () => [],
    revoke: () => false,
    revokeOwner: () => { order.push("revoke"); return 3; }
  };
  const signing = {
    rotate: ({ revokeAll }) => { assert.equal(revokeAll, true); order.push("rotate"); }
  };
  const local = server(undefined, undefined, grants, signing);
  const response = await local.handle(request("oauth.signing.rotate", { revokeAll: true }));
  assert.equal(response.code, "OAUTH_SIGNING_KEY_ROTATED_AND_GRANTS_REVOKED");
  assert.deepEqual(order, ["revoke", "rotate"]);
});

test("OAuth local-control schemas reject malformed identifiers and unknown operations", () => {
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.authorizations.approve", { pendingId: "latest" })).success, false);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.authorizations.approve", { pendingId: pendingEntry().pendingId })).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.clients.revoke", { clientId: "latest" })).success, false);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.clients.revoke", { clientId: `client_${"A".repeat(43)}` })).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.grants.revoke", { grantId: "latest" })).success, false);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.grants.revoke", { grantId: `grant_${"b".repeat(32)}` })).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.grants.revoke_owner")).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.clients.prune_unapproved")).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.signing.rotate", { revokeAll: true })).success, true);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.signing.rotate", { revokeAll: "yes" })).success, false);
  assert.equal(localControlRequestV3Schema.safeParse(request("oauth.approve", { pendingId: pendingEntry().pendingId })).success, false);
});

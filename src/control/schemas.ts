import { z } from "zod";

export const localServerIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const approvalIdV3Schema = z.string().regex(/^approval_[a-f0-9]{32}$/);
export const processIdV3Schema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const oauthPendingIdV3Schema = z.string().regex(/^pending_[A-Za-z0-9_-]{22}$/);
export const oauthClientIdV3Schema = z.string().regex(/^client_[A-Za-z0-9_-]{43}$/);
export const oauthGrantIdV3Schema = z.string().regex(/^grant_[a-f0-9]{32}$/);

const common = {
  schemaVersion: z.literal(3),
  contractVersion: z.literal(3),
  serverId: localServerIdSchema
};

export const localApprovalListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.list")
}).strict();

export const localApprovalWatchRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.watch"),
  afterSequence: z.number().int().nonnegative().safe(),
  timeoutMs: z.number().int().min(1).max(30_000)
}).strict();

export const localApprovalApproveRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.approve"),
  approvalId: approvalIdV3Schema
}).strict();

export const localApprovalDenyRequestV3Schema = z.object({
  ...common,
  operation: z.literal("approvals.deny"),
  approvalId: approvalIdV3Schema
}).strict();

export const localProcessListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("processes.list")
}).strict();

export const localProcessTerminateRequestV3Schema = z.object({
  ...common,
  operation: z.literal("processes.terminate"),
  processId: processIdV3Schema
}).strict();

export const localOAuthAdminBootstrapRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.admin.bootstrap")
}).strict();

export const localOAuthAuthorizationListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.authorizations.list")
}).strict();

export const localOAuthAuthorizationApproveRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.authorizations.approve"),
  pendingId: oauthPendingIdV3Schema
}).strict();

export const localOAuthAuthorizationDenyRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.authorizations.deny"),
  pendingId: oauthPendingIdV3Schema
}).strict();

export const localOAuthClientListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.clients.list")
}).strict();

export const localOAuthClientRevokeRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.clients.revoke"),
  clientId: oauthClientIdV3Schema
}).strict();

export const localOAuthClientPruneRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.clients.prune_unapproved")
}).strict();

export const localOAuthSigningRotateRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.signing.rotate"),
  revokeAll: z.boolean()
}).strict();

export const localOAuthGrantListRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.grants.list")
}).strict();

export const localOAuthGrantRevokeRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.grants.revoke"),
  grantId: oauthGrantIdV3Schema
}).strict();

export const localOAuthOwnerRevokeRequestV3Schema = z.object({
  ...common,
  operation: z.literal("oauth.grants.revoke_owner")
}).strict();

export const localControlRequestV3Schema = z.discriminatedUnion("operation", [
  localApprovalListRequestV3Schema,
  localApprovalWatchRequestV3Schema,
  localApprovalApproveRequestV3Schema,
  localApprovalDenyRequestV3Schema,
  localProcessListRequestV3Schema,
  localProcessTerminateRequestV3Schema,
  localOAuthAdminBootstrapRequestV3Schema,
  localOAuthAuthorizationListRequestV3Schema,
  localOAuthAuthorizationApproveRequestV3Schema,
  localOAuthAuthorizationDenyRequestV3Schema,
  localOAuthClientListRequestV3Schema,
  localOAuthClientRevokeRequestV3Schema,
  localOAuthClientPruneRequestV3Schema,
  localOAuthSigningRotateRequestV3Schema,
  localOAuthGrantListRequestV3Schema,
  localOAuthGrantRevokeRequestV3Schema,
  localOAuthOwnerRevokeRequestV3Schema
]);

export type LocalControlRequestV3 = z.infer<typeof localControlRequestV3Schema>;

export const localControlResponseV3Schema = z.object({
  schemaVersion: z.literal(3),
  contractVersion: z.literal(3),
  serverId: localServerIdSchema,
  ok: z.boolean(),
  code: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/),
  sequence: z.number().int().nonnegative().safe(),
  approvals: z.array(z.object({
    approvalId: approvalIdV3Schema,
    state: z.enum(["pending", "prepared", "granted", "denied", "expired", "reserved", "consumed", "burned"]),
    riskClass: z.enum(["R1", "R2", "R3"]),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    grantId: z.string().min(1).max(160).nullable(),
    reservationId: z.string().min(1).max(160).nullable(),
    summary: z.object({
      backend: z.string().min(1).max(80),
      actionKind: z.string().min(1).max(80),
      argumentCount: z.number().int().nonnegative(),
      logicalScope: z.string().min(1).max(160),
      identityLabel: z.string().min(1).max(120),
      authoritySummary: z.string().min(1).max(200),
      digestPrefix: z.string().regex(/^[a-f0-9]{8,32}$/),
      revealArguments: z.array(z.string().max(4096)).max(32).default([])
    }).strict()
  }).strict()).max(32),
  processes: z.array(z.object({
    processId: processIdV3Schema,
    state: z.string().min(1).max(80),
    summary: z.string().min(1).max(240)
  }).strict()).max(128),
  oauthAdminBootstrapUrl: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}\/#bootstrap=[A-Za-z0-9_-]{43}$/).optional(),
  oauthAuthorizations: z.array(z.object({
    pendingId: oauthPendingIdV3Schema,
    correlationCode: z.string().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
    canonicalRoot: z.string().min(1).max(32768),
    clientLabel: z.string().min(1).max(128),
    clientRef: z.string().regex(/^clientref_[a-f0-9]{32}$/),
    redirectHost: z.string().min(1).max(253),
    redirectPath: z.string().min(1).max(2048),
    scopes: z.array(z.enum(["codexgpt:read", "codexgpt:write", "codexgpt:execute"])).min(1).max(3),
    scopesMatchCurrentConfiguration: z.boolean(),
    status: z.enum(["pending", "approved", "denied", "expired"]),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true })
  }).strict()).max(32).optional(),
  oauthClients: z.array(z.object({
    clientId: oauthClientIdV3Schema,
    clientRef: z.string().regex(/^clientref_[a-f0-9]{32}$/),
    label: z.string().min(1).max(128),
    redirectHost: z.string().min(1).max(253),
    redirectPath: z.string().min(1).max(2048),
    status: z.enum(["unapproved", "approved", "revoked"]),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    approvedAt: z.string().datetime({ offset: true }).nullable()
  }).strict()).max(48).optional(),
  oauthGrants: z.array(z.object({
    grantId: oauthGrantIdV3Schema,
    clientRef: z.string().regex(/^clientref_[a-f0-9]{32}$/),
    scopes: z.array(z.enum(["codexgpt:read", "codexgpt:write", "codexgpt:execute"])).min(1).max(3),
    status: z.enum(["active", "revoked", "expired"]),
    grantRevision: z.number().int().nonnegative().safe(),
    refreshGeneration: z.number().int().nonnegative().safe(),
    createdAt: z.string().datetime({ offset: true }),
    lastUsedAt: z.string().datetime({ offset: true }),
    idleExpiresAt: z.string().datetime({ offset: true }),
    absoluteExpiresAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    revokeReason: z.enum(["public", "local", "client", "owner", "replay", "expired", "scope_revision"]).nullable()
  }).strict()).max(128).optional(),
  grantId: z.string().min(1).max(160).nullable(),
  changed: z.boolean()
}).strict();

export type LocalControlResponseV3 = z.infer<typeof localControlResponseV3Schema>;

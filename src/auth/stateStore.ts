import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import { authConfigurationError } from "./errors.js";
import {
  OAUTH_CREDENTIAL_PROVIDER,
  type CredentialStore
} from "./credentialStore.js";

const opaqueId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-f0-9]{32}$`));
const timestampSchema = z.string().datetime({ offset: true });
const integritySchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const protectedValueSchema = z.string().min(4).max(131072).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const hostnameSchema = z.string().min(1).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/);
const publicJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(40).max(64),
  y: z.string().min(40).max(64),
  kid: z.string().regex(/^kid_[a-f0-9]{32}$/),
  alg: z.literal("ES256"),
  use: z.literal("sig")
}).strict();

export const InstallationOwnerRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  ownerRef: opaqueId("ownerref"),
  credentialProvider: z.literal(OAUTH_CREDENTIAL_PROVIDER),
  protectedSubject: protectedValueSchema,
  createdAt: timestampSchema,
  integrity: integritySchema
}).strict();

const LegacyDeploymentGrantRecordV1Schema = z.object({
  grantId: opaqueId("grant"),
  clientRef: opaqueId("clientref"),
  active: z.boolean(),
  grantRevision: z.number().int().nonnegative().safe(),
  refreshGeneration: z.number().int().nonnegative().safe()
}).strict();

export const OAuthGrantRecordV1Schema = z.object({
  grantId: opaqueId("grant"),
  familyHandle: z.string().regex(/^family_[a-f0-9]{32}$/),
  clientRef: opaqueId("clientref"),
  clientId: z.string().regex(/^client_[A-Za-z0-9_-]{43}$/),
  ownerRef: opaqueId("ownerref"),
  resource: z.string().url().max(2048),
  scopes: z.array(z.enum(["codexgpt:read", "codexgpt:write", "codexgpt:execute"])).min(1).max(3),
  active: z.boolean(),
  status: z.enum(["active", "revoked", "expired"]),
  grantRevision: z.number().int().nonnegative().safe(),
  refreshGeneration: z.number().int().nonnegative().safe(),
  refreshTokenHash: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/),
  authorizationCodeHash: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema,
  idleExpiresAt: timestampSchema,
  absoluteExpiresAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
  revokeReason: z.enum(["public", "local", "client", "owner", "replay", "expired", "scope_revision"]).nullable()
}).strict().superRefine((value, context) => {
  if ((value.status === "active") !== value.active) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["active"], message: "OAuth grant active state is inconsistent." });
  }
  if ((value.status === "active") !== (value.revokedAt === null && value.revokeReason === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "OAuth grant terminal state is inconsistent." });
  }
  const canonicalScopes = ["codexgpt:read", "codexgpt:write", "codexgpt:execute"]
    .filter((scope) => value.scopes.includes(scope as (typeof value.scopes)[number]));
  if (
    canonicalScopes.length !== value.scopes.length ||
    canonicalScopes.some((scope, index) => scope !== value.scopes[index])
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopes"], message: "OAuth grant scopes are not canonical." });
  }
  if (
    Date.parse(value.createdAt) > Date.parse(value.lastUsedAt) ||
    Date.parse(value.lastUsedAt) > Date.parse(value.idleExpiresAt) ||
    Date.parse(value.idleExpiresAt) > Date.parse(value.absoluteExpiresAt)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["idleExpiresAt"], message: "OAuth grant lifetime ordering is invalid." });
  }
  if (
    (value.status === "expired") !== (value.revokeReason === "expired") ||
    (value.status === "revoked" && value.revokeReason === "expired")
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokeReason"], message: "OAuth grant terminal reason is inconsistent." });
  }
});

export const DeploymentGrantRecordV1Schema = z.union([
  OAuthGrantRecordV1Schema,
  LegacyDeploymentGrantRecordV1Schema
]);

export const RegisteredOAuthClientV1Schema = z.object({
  clientId: z.string().regex(/^client_[A-Za-z0-9_-]{43}$/),
  clientRef: opaqueId("clientref"),
  redirectUri: z.string().max(2048).refine(
    (value) => value === "https://chatgpt.com/connector_platform_oauth_redirect" ||
      /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{8,160}$/.test(value),
    "OAuth client redirect URI is invalid."
  ),
  clientName: z.string().min(1).max(128).nullable(),
  clientUri: z.string().url().max(2048).nullable(),
  logoUri: z.string().url().max(2048).nullable(),
  tosUri: z.string().url().max(2048).nullable(),
  policyUri: z.string().url().max(2048).nullable(),
  contacts: z.array(z.string().min(1).max(128)).max(8),
  softwareId: z.string().min(1).max(128).nullable(),
  softwareVersion: z.string().min(1).max(128).nullable(),
  issuedAt: z.number().int().positive().safe(),
  status: z.enum(["unapproved", "approved", "revoked"]),
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  approvedAt: timestampSchema.nullable()
}).strict().superRefine((value, context) => {
  if ((value.status === "approved") !== (value.approvedAt !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedAt"], message: "Approved client state is inconsistent." });
  }
  if ((value.status === "unapproved") !== (value.expiresAt !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Unapproved client expiry is inconsistent." });
  }
});

export const DeploymentStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  generation: z.number().int().positive(),
  bindingId: opaqueId("binding"),
  incarnationId: opaqueId("incarnation"),
  recoveryEpoch: opaqueId("epoch"),
  canonicalRoot: z.string().min(1).max(32768),
  profileId: z.string().regex(/^[a-f0-9]{24}$/),
  hostname: hostnameSchema,
  issuer: z.string().url(),
  resource: z.string().url(),
  ownerRef: opaqueId("ownerref"),
  credentialProvider: z.literal(OAUTH_CREDENTIAL_PROVIDER),
  protectedSigningPrivateJwk: protectedValueSchema,
  activePublicJwk: publicJwkSchema,
  previousPublicJwks: z.array(publicJwkSchema).max(4),
  protectedRefreshPepper: protectedValueSchema,
  grants: z.array(DeploymentGrantRecordV1Schema).max(4096),
  clients: z.array(RegisteredOAuthClientV1Schema).max(48).optional(),
  recoveryRequired: z.boolean(),
  auditCursorRef: z.string().regex(/^auditref_[a-f0-9]{32}$/).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  integrity: integritySchema
}).strict().superRefine((value, context) => {
  const expectedIssuer = `https://${value.hostname}`;
  if (value.issuer !== expectedIssuer || value.resource !== `${expectedIssuer}/mcp`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["issuer"], message: "Deployment URL identity is inconsistent." });
  }
  const allKids = [value.activePublicJwk.kid, ...value.previousPublicJwks.map((key) => key.kid)];
  if (new Set(allKids).size !== allKids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["previousPublicJwks"], message: "OAuth signing key identifiers must be unique." });
  }
  const clients = value.clients ?? [];
  if (new Set(clients.map((client) => client.clientId)).size !== clients.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clients"], message: "OAuth client identifiers must be unique." });
  }
  if (new Set(clients.map((client) => client.clientRef)).size !== clients.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clients"], message: "OAuth client references must be unique." });
  }
  const oauthGrants = value.grants.filter((grant): grant is OAuthGrantRecordV1 => "familyHandle" in grant);
  if (new Set(oauthGrants.map((grant) => grant.grantId)).size !== oauthGrants.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "OAuth grant identifiers must be unique." });
  }
  if (new Set(oauthGrants.map((grant) => grant.familyHandle)).size !== oauthGrants.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "OAuth refresh family handles must be unique." });
  }
  if (new Set(oauthGrants.map((grant) => grant.authorizationCodeHash)).size !== oauthGrants.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "OAuth authorization codes must map to one grant." });
  }
  const clientById = new Map(clients.map((client) => [client.clientId, client]));
  for (const [index, grant] of oauthGrants.entries()) {
    const client = clientById.get(grant.clientId);
    const invalidClientBinding = grant.status === "active"
      ? !client || client.clientRef !== grant.clientRef
      : Boolean(client && client.clientRef !== grant.clientRef);
    if (
      grant.ownerRef !== value.ownerRef || grant.resource !== value.resource || invalidClientBinding
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants", index], message: "OAuth grant deployment binding is invalid." });
    }
  }
  const active = oauthGrants.filter((grant) => grant.status === "active");
  if (active.length > 64) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "OAuth active grant deployment capacity is exceeded." });
  }
  const activeByClient = new Map<string, number>();
  for (const grant of active) activeByClient.set(grant.clientRef, (activeByClient.get(grant.clientRef) ?? 0) + 1);
  if ([...activeByClient.values()].some((count) => count > 8)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "OAuth active grant client capacity is exceeded." });
  }
});

export const DeploymentRegistryEntryV1Schema = z.object({
  identityKey: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  canonicalRoot: z.string().min(1).max(32768),
  profileId: z.string().regex(/^[a-f0-9]{24}$/),
  hostname: hostnameSchema,
  issuer: z.string().url(),
  resource: z.string().url(),
  bindingId: opaqueId("binding"),
  currentIncarnationId: opaqueId("incarnation"),
  tunnelOwnerMarker: z.object({
    tunnel: z.literal("cloudflare-named"),
    tunnelName: z.string().min(1).max(128),
    tunnelOwner: z.literal("codexgpt"),
    bindingId: opaqueId("binding")
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.tunnelOwnerMarker.bindingId !== value.bindingId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tunnelOwnerMarker", "bindingId"], message: "Tunnel owner marker binding mismatch." });
  }
});

export const DeploymentRegistryV1Schema = z.object({
  schemaVersion: z.literal(1),
  generation: z.number().int().positive(),
  entries: z.array(DeploymentRegistryEntryV1Schema).max(256),
  updatedAt: timestampSchema,
  integrity: integritySchema
}).strict();

export type InstallationOwnerRecordV1 = z.infer<typeof InstallationOwnerRecordV1Schema>;
export type DeploymentStateV1 = z.infer<typeof DeploymentStateV1Schema>;
export type DeploymentRegistryV1 = z.infer<typeof DeploymentRegistryV1Schema>;
export type DeploymentRegistryEntryV1 = z.infer<typeof DeploymentRegistryEntryV1Schema>;
export type RegisteredOAuthClientV1 = z.infer<typeof RegisteredOAuthClientV1Schema>;
export type DeploymentGrantRecordV1 = z.infer<typeof DeploymentGrantRecordV1Schema>;
export type OAuthGrantRecordV1 = z.infer<typeof OAuthGrantRecordV1Schema>;

export interface AuthStateAuditEvent {
  transition:
    | "installation_owner_created"
    | "deployment_state_written"
    | "registry_written"
    | "deployment_recovered"
    | "deployment_backup_created"
    | "signing_key_rotated"
    | "state_migrated"
    | "client_registered"
    | "client_approved"
    | "client_revoked"
    | "authorization_requested"
    | "authorization_approved"
    | "authorization_denied"
    | "authorization_expired"
    | "authorization_code_created"
    | "authorization_code_exchanged"
    | "refresh_rotated"
    | "refresh_replayed"
    | "grant_revoked"
    | "grant_expired";
  bindingId: string | null;
  incarnationId: string | null;
  generation: number;
  stateDigest: string;
}

export interface AuthStateAuditAppender {
  append(event: AuthStateAuditEvent): void | Promise<void>;
}

export interface AuthStateStoreDependencies {
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
  audit: AuthStateAuditAppender;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key !== "integrity") output[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}

export function authStateIntegrity(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
}

function withIntegrity<T extends Record<string, unknown>>(value: T): T & { integrity: string } {
  return { ...value, integrity: authStateIntegrity(value) };
}

function verifyIntegrity(value: { integrity: string }): void {
  if (value.integrity !== authStateIntegrity(value)) {
    throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth state integrity verification failed.");
  }
}

function checkedId(prefix: string, value: string): string {
  if (!new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(value)) {
    throw authConfigurationError("OAUTH_STATE_INVALID", `OAuth ${prefix} identifier is invalid.`);
  }
  return value;
}

function assertDurableWrite(result: "supported" | "unsupported" | "failed"): void {
  if (result === "failed") {
    throw authConfigurationError(
      "OAUTH_STATE_RECOVERY_REQUIRED",
      "OAuth state replacement completed without a verifiable directory durability boundary."
    );
  }
}

export function authStatePaths(stateRoot: string): Readonly<{
  root: string;
  installationDirectory: string;
  ownerFile: string;
  deploymentsDirectory: string;
  registryFile: string;
  runtimeDirectory: string;
}> {
  const root = path.resolve(stateRoot);
  return Object.freeze({
    root,
    installationDirectory: path.join(root, "installation"),
    ownerFile: path.join(root, "installation", "owner.json"),
    deploymentsDirectory: path.join(root, "deployments"),
    registryFile: path.join(root, "deployments", "registry.json"),
    runtimeDirectory: path.join(root, "runtime")
  });
}

export function deploymentStateFile(stateRoot: string, bindingId: string, incarnationId: string): string {
  checkedId("binding", bindingId);
  checkedId("incarnation", incarnationId);
  return path.join(
    authStatePaths(stateRoot).deploymentsDirectory,
    bindingId,
    "incarnations",
    incarnationId,
    "state.json"
  );
}

export function deploymentBackupsDirectory(stateRoot: string, bindingId: string, incarnationId: string): string {
  checkedId("binding", bindingId);
  checkedId("incarnation", incarnationId);
  return path.join(
    authStatePaths(stateRoot).deploymentsDirectory,
    bindingId,
    "incarnations",
    incarnationId,
    "backups"
  );
}

export function deploymentBackupFile(
  stateRoot: string,
  bindingId: string,
  incarnationId: string,
  backupId: string
): string {
  if (!/^backup_[0-9]{13}_[a-f0-9]{32}\.json$/.test(backupId)) {
    throw authConfigurationError("OAUTH_BACKUP_INVALID", "OAuth backup identifier is invalid.");
  }
  return path.join(deploymentBackupsDirectory(stateRoot, bindingId, incarnationId), backupId);
}

export class AuthStateStore {
  readonly #paths: ReturnType<typeof authStatePaths>;
  readonly #ownerStore: AtomicJsonFileStore<InstallationOwnerRecordV1>;
  readonly #deploymentStore: AtomicJsonFileStore<DeploymentStateV1>;
  readonly #registryStore: AtomicJsonFileStore<DeploymentRegistryV1>;
  readonly #credentialStore: CredentialStore;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #now: () => number;
  readonly #audit: AuthStateAuditAppender;

  constructor(stateRoot: string, credentialStore: CredentialStore, dependencies: AuthStateStoreDependencies) {
    this.#paths = authStatePaths(stateRoot);
    this.#credentialStore = credentialStore;
    this.#randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
    this.#now = dependencies.now ?? Date.now;
    this.#audit = dependencies.audit;
    this.#ownerStore = new AtomicJsonFileStore(this.#paths.root, InstallationOwnerRecordV1Schema);
    this.#deploymentStore = new AtomicJsonFileStore(this.#paths.root, DeploymentStateV1Schema);
    this.#registryStore = new AtomicJsonFileStore(this.#paths.root, DeploymentRegistryV1Schema);
  }

  paths(): ReturnType<typeof authStatePaths> {
    return this.#paths;
  }

  async initializeOwner(): Promise<{ record: InstallationOwnerRecordV1; subject: string }> {
    if (fs.existsSync(this.#paths.ownerFile)) {
      const record = this.readOwner();
      const plaintext = await this.#credentialStore.unprotect(record.protectedSubject, "codexgpt-owner-v1");
      try {
        const subject = Buffer.from(plaintext).toString("utf8");
        if (!/^subject_[A-Za-z0-9_-]{43}$/.test(subject)) {
          throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth owner subject is invalid.");
        }
        return { record, subject };
      } finally {
        plaintext.fill(0);
      }
    }
    const ownerRef = `ownerref_${this.#random(16).toString("hex")}`;
    const subject = `subject_${this.#random(32).toString("base64url")}`;
    const subjectBytes = Buffer.from(subject, "utf8");
    let protectedSubject: string;
    try {
      protectedSubject = await this.#credentialStore.protect(subjectBytes, "codexgpt-owner-v1");
    } finally {
      subjectBytes.fill(0);
    }
    const record = InstallationOwnerRecordV1Schema.parse(withIntegrity({
      schemaVersion: 1 as const,
      ownerRef,
      credentialProvider: OAUTH_CREDENTIAL_PROVIDER,
      protectedSubject,
      createdAt: new Date(this.#now()).toISOString()
    }));
    await this.#auditBefore("installation_owner_created", null, null, 1, record);
    assertDurableWrite(this.#ownerStore.write(this.#paths.ownerFile, record));
    return { record, subject };
  }

  readOwner(): InstallationOwnerRecordV1 {
    try {
      const value = this.#ownerStore.read(this.#paths.ownerFile);
      verifyIntegrity(value);
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === "OAUTH_STATE_RECOVERY_REQUIRED") throw error;
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth installation owner state is unavailable.");
    }
  }

  readDeployment(bindingId: string, incarnationId: string): DeploymentStateV1 {
    try {
      const value = this.#deploymentStore.read(deploymentStateFile(this.#paths.root, bindingId, incarnationId));
      verifyIntegrity(value);
      if (value.recoveryRequired) {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth deployment requires explicit recovery.");
      }
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === "OAUTH_STATE_RECOVERY_REQUIRED") throw error;
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth deployment state is unavailable.");
    }
  }

  async writeDeployment(value: Omit<DeploymentStateV1, "integrity">, transition: AuthStateAuditEvent["transition"] = "deployment_state_written"): Promise<DeploymentStateV1> {
    const record = DeploymentStateV1Schema.parse(withIntegrity(value));
    await this.#auditBefore(transition, record.bindingId, record.incarnationId, record.generation, record);
    assertDurableWrite(this.#deploymentStore.write(deploymentStateFile(this.#paths.root, record.bindingId, record.incarnationId), record));
    return record;
  }

  async createDeploymentBackup(bindingId: string, incarnationId: string): Promise<string> {
    const current = this.readDeployment(bindingId, incarnationId);
    const backupId = `backup_${String(this.#now()).padStart(13, "0")}_${this.#random(16).toString("hex")}.json`;
    const backupFile = deploymentBackupFile(this.#paths.root, bindingId, incarnationId, backupId);
    if (fs.existsSync(backupFile)) {
      throw authConfigurationError("OAUTH_BACKUP_CONFLICT", "OAuth backup identifier already exists.");
    }
    await this.#auditBefore(
      "deployment_backup_created",
      current.bindingId,
      current.incarnationId,
      current.generation,
      current
    );
    assertDurableWrite(this.#deploymentStore.write(backupFile, current));
    return backupId;
  }

  readDeploymentBackup(bindingId: string, incarnationId: string, backupId: string): DeploymentStateV1 {
    try {
      const value = this.#deploymentStore.read(deploymentBackupFile(this.#paths.root, bindingId, incarnationId, backupId));
      verifyIntegrity(value);
      if (value.bindingId !== bindingId || value.incarnationId !== incarnationId) {
        throw authConfigurationError("OAUTH_BACKUP_INVALID", "OAuth backup identity does not match its storage path.");
      }
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === "OAUTH_BACKUP_INVALID") throw error;
      throw authConfigurationError("OAUTH_BACKUP_INVALID", "OAuth backup is missing, malformed, or fails integrity verification.");
    }
  }

  listDeploymentBackups(bindingId: string, incarnationId: string): string[] {
    const directory = deploymentBackupsDirectory(this.#paths.root, bindingId, incarnationId);
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw authConfigurationError("OAUTH_BACKUP_INVALID", "OAuth backup directory is unreadable.");
    }
    return names
      .filter((name) => /^backup_[0-9]{13}_[a-f0-9]{32}\.json$/.test(name))
      .sort();
  }

  listBindingBackups(bindingId: string): Array<{ backupId: string; incarnationId: string }> {
    checkedId("binding", bindingId);
    const incarnationsDirectory = path.join(
      this.#paths.deploymentsDirectory,
      bindingId,
      "incarnations"
    );
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(incarnationsDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw authConfigurationError("OAUTH_BACKUP_INVALID", "OAuth incarnation directory is unreadable.");
    }
    const backups: Array<{ backupId: string; incarnationId: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^incarnation_[a-f0-9]{32}$/.test(entry.name)) continue;
      for (const backupId of this.listDeploymentBackups(bindingId, entry.name)) {
        backups.push({ backupId, incarnationId: entry.name });
      }
    }
    return backups.sort((left, right) =>
      left.backupId.localeCompare(right.backupId) || left.incarnationId.localeCompare(right.incarnationId)
    );
  }

  readRegistry(): DeploymentRegistryV1 | null {
    if (!fs.existsSync(this.#paths.registryFile)) return null;
    try {
      const value = this.#registryStore.read(this.#paths.registryFile);
      verifyIntegrity(value);
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === "OAUTH_STATE_RECOVERY_REQUIRED") throw error;
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth deployment registry is unavailable.");
    }
  }

  async writeRegistry(
    value: Omit<DeploymentRegistryV1, "integrity">,
    identity: { bindingId: string; incarnationId: string }
  ): Promise<DeploymentRegistryV1> {
    checkedId("binding", identity.bindingId);
    checkedId("incarnation", identity.incarnationId);
    const record = DeploymentRegistryV1Schema.parse(withIntegrity(value));
    await this.#auditBefore("registry_written", identity.bindingId, identity.incarnationId, record.generation, record);
    assertDurableWrite(this.#registryStore.write(this.#paths.registryFile, record));
    return record;
  }

  #random(size: number): Buffer {
    const value = this.#randomBytes(size);
    if (!Buffer.isBuffer(value) || value.length !== size) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth state random source is invalid.");
    }
    return value;
  }

  async #auditBefore(
    transition: AuthStateAuditEvent["transition"],
    bindingId: string | null,
    incarnationId: string | null,
    generation: number,
    value: unknown
  ): Promise<void> {
    try {
      await this.#audit.append({
        transition,
        bindingId,
        incarnationId,
        generation,
        stateDigest: authStateIntegrity(value)
      });
    } catch {
      throw authConfigurationError("OAUTH_AUDIT_FAILURE", "OAuth state transition could not be durably audited.");
    }
  }
}

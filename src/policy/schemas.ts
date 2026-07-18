import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../audit/canonicalJson.js";
import {
  POLICY_SCOPES,
  POLICY_SCOPES_V3,
  POLICY_SCOPES_V4,
  type AuditEventV1,
  type CompiledPermissionProfileV1,
  type CompiledPermissionProfileV3,
  type CompiledPolicySnapshotV1,
  type GitResourceV4,
  type PermissionProfileDocumentV1,
  type PermissionProfileDocumentV3,
  type PolicyDecisionV1,
  type RequestContextV1,
  type RequestContextV3,
  type RequestIdentityV1,
  type RequestIdentityV3,
  type ResourceDescriptorV1,
  type ResourceDescriptorV4,
  type SandboxCapabilityReportV1,
  type SessionGrantV1
} from "./types.js";

const safeIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const profileIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bareSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const isoDateSchema = z.string().datetime({ offset: true });
const safeRuleIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const relativePolicyPathSchema = z.string().min(1).max(500).superRefine((value, context) => {
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Policy paths must use workspace-relative POSIX syntax." });
    return;
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "..")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Policy paths must not contain empty or parent segments." });
  }
  if (value !== "." && segments.some((segment) => segment === ".")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only the root selector may use dot." });
  }
});

export const filesystemSelectorV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact"), path: relativePolicyPathSchema }).strict(),
  z.object({ kind: z.literal("subtree"), path: relativePolicyPathSchema }).strict(),
  z.object({
    kind: z.literal("deny_glob"),
    pattern: z.string().min(1).max(500).refine((value) => !value.includes("\0") && !value.includes("\\"), {
      message: "Deny globs must use POSIX separators."
    })
  }).strict()
]);

export const filesystemRuleV1Schema = z.object({
  id: safeRuleIdSchema,
  selector: filesystemSelectorV1Schema,
  access: z.enum(["deny", "read", "write"])
}).strict().superRefine((value, context) => {
  if (value.selector.kind === "deny_glob" && value.access !== "deny") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["access"],
      message: "Deny-glob selectors may only deny."
    });
  }
});

const portSchema = z.number().int().min(1).max(65535);
const portRangeSchema = z.object({
  from: portSchema,
  to: portSchema
}).strict().superRefine((value, context) => {
  if (value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "Port range start must not exceed end." });
  }
});

export const networkRuleV1Schema = z.object({
  id: safeRuleIdSchema,
  host: z.string().min(1).max(253),
  ports: z.union([z.array(portSchema).max(256), z.array(portRangeSchema).max(64)]),
  access: z.enum(["allow", "deny"])
}).strict();

const filesystemDocumentSchema = z.object({
  default: z.enum(["deny", "read"]).optional(),
  rules: z.array(filesystemRuleV1Schema).max(2048).optional()
}).strict();

const gitDocumentSchema = z.object({
  read: z.boolean().optional(),
  write: z.boolean().optional(),
  remoteWrite: z.boolean().optional()
}).strict();

const shellDocumentSchema = z.object({
  mode: z.enum(["disabled", "verify", "execute"]).optional(),
  requireSandbox: z.boolean().optional()
}).strict();

const processDocumentSchema = z.object({
  manage: z.boolean().optional(),
  persistent: z.boolean().optional(),
  requireSandbox: z.boolean().optional()
}).strict().superRefine((value, context) => {
  if (value.persistent === true && value.manage === false) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["persistent"], message: "Persistent processes require process management." });
  }
});

const networkDocumentSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z.array(networkRuleV1Schema).max(2048).optional(),
  allowLoopback: z.boolean().optional(),
  allowPrivate: z.boolean().optional(),
  allowLinkLocal: z.boolean().optional(),
  requireEnforcement: z.boolean().optional()
}).strict();

export const permissionProfileDocumentV1Schema: z.ZodType<PermissionProfileDocumentV1> = z.object({
  schemaVersion: z.literal(1),
  id: profileIdSchema,
  extends: profileIdSchema.optional(),
  description: z.string().max(500).optional(),
  workspaceRoots: z.array(z.string().min(1).max(1000)).max(64).optional(),
  filesystem: filesystemDocumentSchema.optional(),
  git: gitDocumentSchema.optional(),
  shell: shellDocumentSchema.optional(),
  process: processDocumentSchema.optional(),
  network: networkDocumentSchema.optional()
}).strict();

export const compiledPermissionProfileV1Schema: z.ZodType<CompiledPermissionProfileV1> = z.object({
  schemaVersion: z.literal(1),
  id: profileIdSchema,
  sourceProfileIds: z.array(profileIdSchema).min(1).max(8),
  workspaceRoots: z.array(z.string().min(1).max(1000)).max(64),
  filesystem: z.object({
    default: z.enum(["deny", "read"]),
    rules: z.array(filesystemRuleV1Schema).max(2048)
  }).strict(),
  git: z.object({ read: z.boolean(), write: z.boolean(), remoteWrite: z.boolean() }).strict(),
  shell: z.object({ mode: z.enum(["disabled", "verify", "execute"]), requireSandbox: z.boolean() }).strict(),
  process: z.object({ manage: z.boolean(), persistent: z.boolean(), requireSandbox: z.boolean() }).strict(),
  network: z.object({
    enabled: z.boolean(),
    rules: z.array(networkRuleV1Schema).max(2048),
    allowLoopback: z.boolean(),
    allowPrivate: z.boolean(),
    allowLinkLocal: z.boolean(),
    requireEnforcement: z.boolean()
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.process.persistent && !value.process.manage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["process", "persistent"], message: "Persistent processes require process management." });
  }
  if (value.git.remoteWrite && !value.git.write) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["git", "remoteWrite"], message: "Git remote write requires Git write." });
  }
});

const fullAccessPermissionV3Schema = z.object({
  ambientFilesystem: z.boolean(),
  ambientCredentials: z.boolean(),
  ambientRegistry: z.boolean(),
  unrestrictedNetwork: z.boolean(),
  requireBlockedPathEnforcement: z.boolean(),
  requireCredentialIsolation: z.boolean(),
  requireRegistryIsolation: z.boolean(),
  requireDeviceIsolation: z.boolean(),
  requireNetworkEnforcement: z.boolean(),
  requireSandbox: z.boolean()
}).strict();

export const permissionProfileDocumentV3Schema: z.ZodType<PermissionProfileDocumentV3> = z.object({
  schemaVersion: z.literal(3),
  id: profileIdSchema,
  extends: profileIdSchema.optional(),
  description: z.string().max(500).optional(),
  workspaceRoots: z.array(z.string().min(1).max(1000)).max(64).optional(),
  filesystem: filesystemDocumentSchema.optional(),
  git: gitDocumentSchema.optional(),
  shell: shellDocumentSchema.optional(),
  process: processDocumentSchema.optional(),
  network: networkDocumentSchema.optional(),
  fullAccess: fullAccessPermissionV3Schema.partial().optional()
}).strict();

export const compiledPermissionProfileV3Schema: z.ZodType<CompiledPermissionProfileV3> = z.object({
  schemaVersion: z.literal(3),
  id: profileIdSchema,
  sourceProfileIds: z.array(profileIdSchema).min(1).max(8),
  workspaceRoots: z.array(z.string().min(1).max(1000)).max(64),
  filesystem: z.object({
    default: z.enum(["deny", "read"]),
    rules: z.array(filesystemRuleV1Schema).max(2048)
  }).strict(),
  git: z.object({ read: z.boolean(), write: z.boolean(), remoteWrite: z.boolean() }).strict(),
  shell: z.object({ mode: z.enum(["disabled", "verify", "execute"]), requireSandbox: z.boolean() }).strict(),
  process: z.object({ manage: z.boolean(), persistent: z.boolean(), requireSandbox: z.boolean() }).strict(),
  network: z.object({
    enabled: z.boolean(),
    rules: z.array(networkRuleV1Schema).max(2048),
    allowLoopback: z.boolean(),
    allowPrivate: z.boolean(),
    allowLinkLocal: z.boolean(),
    requireEnforcement: z.boolean()
  }).strict(),
  fullAccess: fullAccessPermissionV3Schema
}).strict().superRefine((value, context) => {
  if (value.process.persistent && !value.process.manage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["process", "persistent"], message: "Persistent processes require process management." });
  }
  if (value.git.remoteWrite && !value.git.write) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["git", "remoteWrite"], message: "Git remote write requires Git write." });
  }
});

export const policySourceHashV1Schema = z.object({
  id: profileIdSchema,
  sha256: bareSha256Schema
}).strict();

export const compiledPolicySnapshotV1Schema: z.ZodType<CompiledPolicySnapshotV1> = z.object({
  schemaVersion: z.literal(1),
  policyRevision: safeIdSchema,
  sourceHashes: z.array(policySourceHashV1Schema).min(1).max(8),
  hardPolicyRevision: safeIdSchema,
  permissionProfile: compiledPermissionProfileV1Schema,
  identityScopeMappingRevision: safeIdSchema,
  approvalPolicyRevision: safeIdSchema,
  capabilityRevision: safeIdSchema,
  createdAt: isoDateSchema
}).strict();

export const requestIdentityV1Schema: z.ZodType<RequestIdentityV1> = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum([
    "local_process",
    "loopback_unauthenticated",
    "shared_secret_query",
    "shared_secret_bearer",
    "oauth_subject"
  ]),
  authenticationMode: z.enum(["stdio", "loopback_none", "query_token", "bearer", "oauth2"]),
  credentialRef: z.string().regex(/^cred_[a-z2-7]{16,52}$/).nullable(),
  subject: z.string().min(1).max(240).nullable(),
  scopes: z.array(z.enum(POLICY_SCOPES)).max(POLICY_SCOPES.length),
  assuranceLevel: z.enum(["local", "low", "shared_secret", "strong"])
}).strict().superRefine((value, context) => {
  const expected = {
    local_process: ["stdio", "local", false, false],
    loopback_unauthenticated: ["loopback_none", "low", false, false],
    shared_secret_query: ["query_token", "shared_secret", true, false],
    shared_secret_bearer: ["bearer", "shared_secret", true, false],
    oauth_subject: ["oauth2", "strong", true, true]
  } as const;
  const [mode, assurance, requiresCredential, requiresSubject] = expected[value.kind];
  if (value.authenticationMode !== mode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authenticationMode"], message: "Authentication mode does not match identity kind." });
  }
  if (value.assuranceLevel !== assurance) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["assuranceLevel"], message: "Assurance level does not match identity kind." });
  }
  if (requiresCredential !== (value.credentialRef !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentialRef"], message: "Credential reference presence does not match identity kind." });
  }
  if (requiresSubject !== (value.subject !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "Subject presence does not match identity kind." });
  }
});

export const requestIdentityV3Schema: z.ZodType<RequestIdentityV3> = z.object({
  schemaVersion: z.literal(3),
  kind: z.enum([
    "local_process",
    "loopback_unauthenticated",
    "shared_secret_query",
    "shared_secret_bearer",
    "oauth_subject"
  ]),
  authenticationMode: z.enum(["stdio", "loopback_none", "query_token", "bearer", "oauth2"]),
  credentialRef: z.string().regex(/^cred_[a-z2-7]{16,52}$/).nullable(),
  subject: z.string().min(1).max(240).nullable(),
  scopes: z.array(z.enum(POLICY_SCOPES_V3)).max(POLICY_SCOPES_V3.length),
  assuranceLevel: z.enum(["local", "low", "shared_secret", "strong"])
}).strict().superRefine((value, context) => {
  const expected = {
    local_process: ["stdio", "local", false, false],
    loopback_unauthenticated: ["loopback_none", "low", false, false],
    shared_secret_query: ["query_token", "shared_secret", true, false],
    shared_secret_bearer: ["bearer", "shared_secret", true, false],
    oauth_subject: ["oauth2", "strong", true, true]
  } as const;
  const [mode, assurance, requiresCredential, requiresSubject] = expected[value.kind];
  if (value.authenticationMode !== mode) context.addIssue({ code: z.ZodIssueCode.custom, path: ["authenticationMode"], message: "Authentication mode does not match identity kind." });
  if (value.assuranceLevel !== assurance) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assuranceLevel"], message: "Assurance level does not match identity kind." });
  if (requiresCredential !== (value.credentialRef !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["credentialRef"], message: "Credential reference does not match identity kind." });
  if (requiresSubject !== (value.subject !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "Subject does not match identity kind." });
});

export const requestContextV1Schema: z.ZodType<RequestContextV1> = z.object({
  schemaVersion: z.literal(1),
  requestId: safeIdSchema,
  transportKind: z.enum(["stdio", "streamable_http"]),
  transportSessionId: safeIdSchema,
  identity: requestIdentityV1Schema,
  workspaceId: safeIdSchema.nullable(),
  runtimeProfileId: safeIdSchema,
  permissionProfileId: profileIdSchema,
  policyRevision: safeIdSchema,
  sessionGrantRevision: safeIdSchema,
  receivedAt: isoDateSchema
}).strict().superRefine((value, context) => {
  if (value.transportKind === "stdio" && value.identity.authenticationMode !== "stdio") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity"], message: "STDIO requests require a local-process identity." });
  }
  if (value.transportKind === "streamable_http" && value.identity.authenticationMode === "stdio") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity"], message: "HTTP requests cannot use a STDIO identity." });
  }
});

const resourceBase = {
  schemaVersion: z.literal(1),
  resourceFingerprint: sha256Schema
};

export const filesystemResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("filesystem"),
  operation: z.enum(["read", "list", "search", "write", "delete", "move"]),
  workspaceId: safeIdSchema,
  relativePath: relativePolicyPathSchema,
  comparisonKey: z.string().min(1).max(1000),
  targetExists: z.boolean(),
  containment: z.enum(["inside", "outside", "unknown"]),
  existingParentIdentity: z.string().min(1).max(1000),
  unresolvedSuffix: z.array(z.string().min(1).max(255)).max(256)
}).strict();

export const requestContextV3Schema: z.ZodType<RequestContextV3> = z.object({
  schemaVersion: z.literal(3),
  requestId: safeIdSchema,
  transportKind: z.enum(["stdio", "streamable_http"]),
  transportSessionId: safeIdSchema,
  identity: requestIdentityV3Schema,
  workspaceId: safeIdSchema.nullable(),
  runtimeProfileId: profileIdSchema,
  permissionProfileId: profileIdSchema,
  policyRevision: safeIdSchema,
  sessionGrantRevision: safeIdSchema,
  receivedAt: isoDateSchema
}).strict();

const filesystemBatchEntryV1Schema = z.object({
  sourceRelativePath: relativePolicyPathSchema.nullable(),
  destinationRelativePath: relativePolicyPathSchema.nullable(),
  sourceComparisonKey: z.string().min(1).max(1000).nullable(),
  destinationComparisonKey: z.string().min(1).max(1000).nullable()
}).strict().superRefine((value, context) => {
  if (value.sourceRelativePath === null && value.destinationRelativePath === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A batch entry requires a source or destination path." });
  }
  if ((value.sourceRelativePath === null) !== (value.sourceComparisonKey === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Batch source path facts are incomplete." });
  }
  if ((value.destinationRelativePath === null) !== (value.destinationComparisonKey === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Batch destination path facts are incomplete." });
  }
});

export const filesystemBatchResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("filesystem_batch"),
  operation: z.enum(["move", "undo", "patch"]),
  workspaceId: safeIdSchema,
  entries: z.array(filesystemBatchEntryV1Schema).min(1).max(64)
}).strict();

export const gitResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("git"),
  operation: z.enum(["read", "write", "history_write", "remote_write"]),
  workspaceId: safeIdSchema,
  repositoryKey: z.string().min(1).max(1000),
  relativePaths: z.array(relativePolicyPathSchema).max(2048),
  refs: z.array(z.string().min(1).max(500)).max(128),
  remoteName: z.string().min(1).max(200).nullable(),
  remoteHost: z.string().min(1).max(253).nullable()
}).strict();

function sortedUniqueStrings(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export function computeGitResourceV4Fingerprint(
  value: Omit<GitResourceV4, "resourceFingerprint">
): string {
  return `sha256:${createHash("sha256")
    .update("git-resource-v4\0", "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex")}`;
}

export const gitResourceV4Schema: z.ZodType<GitResourceV4> = z.object({
  schemaVersion: z.literal(4),
  kind: z.literal("git_v4"),
  operation: z.enum([
    "read",
    "create_branch",
    "stage",
    "commit",
    "restore_review",
    "restore_execute",
    "stash_list",
    "stash_create",
    "stash_apply_review",
    "stash_apply_execute",
    "stash_forget_review",
    "stash_forget_execute",
    "task_create_review",
    "task_create",
    "task_list",
    "task_get",
    "task_merge_prepare_review",
    "task_merge_prepare_finalize",
    "task_merge_execute",
    "task_remove"
  ]),
  repositoryId: z.string().regex(/^repo_[a-f0-9]{32}$/),
  worktreeId: z.string().regex(/^task_[a-f0-9]{32}$/).nullable(),
  branchId: z.string().regex(/^branch_[a-f0-9]{32}$/).nullable(),
  pathDigests: z.array(bareSha256Schema).max(256).refine(sortedUniqueStrings),
  refDigests: z.array(bareSha256Schema).max(128).refine(sortedUniqueStrings),
  objectIds: z.array(z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)).max(512)
    .refine(sortedUniqueStrings),
  affectedPathCount: z.number().int().nonnegative().safe(),
  affectedByteCount: z.number().int().nonnegative().safe(),
  stateTokenFingerprint: bareSha256Schema.nullable(),
  integrationMode: z.enum(["off", "approved_full_access"]),
  executionIsolation: z.literal("none"),
  resourceFingerprint: sha256Schema
}).strict().superRefine((value, context) => {
  const { resourceFingerprint, ...semantic } = value;
  if (resourceFingerprint !== computeGitResourceV4Fingerprint(semantic)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resourceFingerprint"],
      message: "V4 Git resource fingerprint does not match its semantic fields."
    });
  }
});

export const shellResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("shell"),
  operation: z.enum(["verify", "execute"]),
  workspaceId: safeIdSchema,
  backend: z.enum(["bash", "powershell", "cmd", "other"]),
  cwd: relativePolicyPathSchema,
  commandKind: z.enum(["verification", "opaque"]),
  executable: z.string().min(1).max(500).nullable(),
  argumentCount: z.number().int().nonnegative().max(10000),
  commandDigest: sha256Schema,
  persistence: z.boolean(),
  requestedNetwork: z.boolean()
}).strict();

export const processResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("process"),
  operation: z.enum(["start", "inspect", "signal", "terminate"]),
  workspaceId: safeIdSchema.nullable(),
  processId: safeIdSchema.nullable(),
  persistence: z.boolean(),
  executableDigest: sha256Schema.nullable()
}).strict();

export const networkResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("network"),
  operation: z.enum(["connect", "redirect"]),
  workspaceId: safeIdSchema.nullable(),
  scheme: z.enum(["http", "https", "tcp", "tls"]),
  host: z.string().min(1).max(253),
  port: portSchema,
  hostKind: z.enum(["dns", "ipv4", "ipv6"]),
  resolvedAddresses: z.array(z.string().min(1).max(100)).max(256),
  addressClasses: z.array(z.enum(["loopback", "private", "link_local", "multicast", "unspecified", "reserved", "public"])).max(256)
}).strict();

export const auditResourceV1Schema = z.object({
  ...resourceBase,
  kind: z.literal("audit"),
  operation: z.literal("query"),
  workspaceId: safeIdSchema.nullable(),
  filterDigest: bareSha256Schema
}).strict();

export const resourceDescriptorV1Schema: z.ZodType<ResourceDescriptorV1> = z.discriminatedUnion("kind", [
  filesystemResourceV1Schema,
  filesystemBatchResourceV1Schema,
  gitResourceV1Schema,
  shellResourceV1Schema,
  processResourceV1Schema,
  networkResourceV1Schema,
  auditResourceV1Schema
]);

export const resourceDescriptorV4Schema: z.ZodType<ResourceDescriptorV4> = z.union([
  resourceDescriptorV1Schema,
  gitResourceV4Schema
]);

const platformSchema = z.enum(["aix", "android", "darwin", "freebsd", "haiku", "linux", "openbsd", "sunos", "win32", "cygwin", "netbsd"]);

export const sandboxCapabilityReportV1Schema: z.ZodType<SandboxCapabilityReportV1> = z.object({
  schemaVersion: z.literal(1),
  backendId: safeIdSchema,
  backendVersion: safeIdSchema,
  platform: platformSchema,
  filesystemReadBoundary: z.enum(["none", "brokered", "kernel_enforced"]),
  filesystemWriteBoundary: z.enum(["none", "brokered", "kernel_enforced"]),
  processTreeControl: z.enum(["none", "best_effort", "job_object", "strong"]),
  networkEgressControl: z.enum(["none", "proxy_only", "platform_enforced"]),
  environmentIsolation: z.enum(["none", "filtered", "isolated"]),
  credentialIsolation: z.enum(["none", "partial", "isolated"]),
  registryIsolation: z.enum(["none", "partial", "isolated"]),
  supportsPeerAddressVerification: z.boolean(),
  supportsRedirectReauthorization: z.boolean(),
  supportsRevocation: z.boolean(),
  evidenceRevision: safeIdSchema
}).strict();

export const requiredCapabilityV1Schema = z.object({
  name: z.enum([
    "filesystemReadBoundary",
    "filesystemWriteBoundary",
    "processTreeControl",
    "networkEgressControl",
    "environmentIsolation",
    "credentialIsolation",
    "registryIsolation",
    "supportsPeerAddressVerification",
    "supportsRedirectReauthorization",
    "supportsRevocation"
  ]),
  minimum: z.union([z.string().min(1).max(80), z.boolean()])
}).strict();

export const policyDecisionProvenanceV1Schema = z.object({
  sourceKind: z.enum(["hard_policy", "deployment", "identity_scope", "permission_profile", "session_grant", "approval_policy", "enforcement"]),
  safeRuleId: safeRuleIdSchema.nullable(),
  specificity: z.array(z.number().int()).max(8),
  grantId: safeIdSchema.nullable(),
  approvalId: safeIdSchema.nullable(),
  enforcementBackend: safeIdSchema.nullable()
}).strict();

export const approvalRequirementV1Schema = z.object({
  riskClass: z.enum(["R1", "R2", "R3"]),
  maxTtlMs: z.number().int().positive().max(30 * 60_000),
  uses: z.number().int().positive().nullable()
}).strict().superRefine((value, context) => {
  const max = value.riskClass === "R1" ? 30 * 60_000 : value.riskClass === "R2" ? 5 * 60_000 : 2 * 60_000;
  if (value.maxTtlMs > max) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxTtlMs"], message: "Approval TTL exceeds the risk-class ceiling." });
  }
  if (value.riskClass === "R3" && value.uses !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["uses"], message: "R3 approvals are one-use." });
  }
});

export const policyDecisionV1Schema: z.ZodType<PolicyDecisionV1> = z.object({
  schemaVersion: z.literal(1),
  decisionId: safeIdSchema,
  outcome: z.enum(["allow", "deny", "approval_required", "enforcement_unavailable"]),
  reasonCode: z.enum([
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "POLICY_CONTEXT_STALE",
    "POLICY_RESOURCE_INVALID",
    "POLICY_CONFIG_INVALID",
    "SHELL_SANDBOX_UNAVAILABLE",
    "PROCESS_SANDBOX_UNAVAILABLE",
    "NETWORK_ENFORCEMENT_UNAVAILABLE"
  ]).nullable(),
  policyRevision: safeIdSchema,
  resourceFingerprint: sha256Schema,
  requiredApproval: approvalRequirementV1Schema.nullable(),
  requiredEnforcement: z.array(requiredCapabilityV1Schema).max(16),
  provenance: z.array(policyDecisionProvenanceV1Schema).max(32)
}).strict().superRefine((value, context) => {
  if (value.outcome === "allow" && value.reasonCode !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Allowed decisions do not have an error reason." });
  }
  if (value.outcome !== "allow" && value.reasonCode === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Refused decisions require a reason." });
  }
  if ((value.outcome === "approval_required") !== (value.requiredApproval !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredApproval"], message: "Approval details must match the outcome." });
  }
  if (value.outcome === "approval_required" && value.reasonCode !== "APPROVAL_REQUIRED") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Approval-required decisions use APPROVAL_REQUIRED." });
  }
});

export const sessionGrantV1Schema: z.ZodType<SessionGrantV1> = z.object({
  schemaVersion: z.literal(1),
  grantId: safeIdSchema,
  credentialRef: z.string().regex(/^cred_[a-z2-7]{16,52}$/).nullable(),
  transportSessionId: safeIdSchema,
  workspaceId: safeIdSchema.nullable(),
  policyRevision: safeIdSchema,
  toolContractVersion: safeIdSchema,
  operation: z.string().min(1).max(160),
  resourceFingerprint: sha256Schema,
  inputDigest: sha256Schema,
  riskClass: z.enum(["R1", "R2", "R3"]),
  issuedAt: isoDateSchema,
  expiresAt: isoDateSchema,
  usesRemaining: z.number().int().positive().nullable()
}).strict().superRefine((value, context) => {
  const issued = Date.parse(value.issuedAt);
  const expires = Date.parse(value.expiresAt);
  const maxTtl = value.riskClass === "R1" ? 30 * 60_000 : value.riskClass === "R2" ? 5 * 60_000 : 2 * 60_000;
  if (expires <= issued || expires - issued > maxTtl) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Grant expiry exceeds the risk-class ceiling." });
  }
  if (value.riskClass === "R3" && value.usesRemaining !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["usesRemaining"], message: "R3 grants are exactly one-use." });
  }
});

export const auditEventV1Schema: z.ZodType<AuditEventV1> = z.object({
  schemaVersion: z.literal(1),
  eventId: safeIdSchema,
  timestamp: isoDateSchema,
  requestId: safeIdSchema,
  decisionId: safeIdSchema,
  credentialRef: z.string().regex(/^cred_[a-z2-7]{16,52}$/).nullable(),
  transportSessionId: safeIdSchema,
  toolName: z.string().min(1).max(80),
  canonicalAction: z.string().min(1).max(80),
  workspaceId: safeIdSchema.nullable(),
  relativeResourceSummary: z.string().max(240),
  resourceFingerprint: sha256Schema,
  policyRevision: safeIdSchema,
  outcome: z.enum(["allow", "deny", "approval_required", "enforcement_unavailable"]),
  reasonCode: z.enum([
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "POLICY_CONTEXT_STALE",
    "POLICY_RESOURCE_INVALID",
    "POLICY_CONFIG_INVALID",
    "SHELL_SANDBOX_UNAVAILABLE",
    "PROCESS_SANDBOX_UNAVAILABLE",
    "NETWORK_ENFORCEMENT_UNAVAILABLE"
  ]).nullable(),
  safeRuleIds: z.array(safeRuleIdSchema).max(16),
  approvalState: z.enum(["not_required", "required", "granted", "denied"]),
  grantId: safeIdSchema.nullable(),
  sandboxBackend: safeIdSchema,
  durationMs: z.number().nonnegative(),
  resultCode: z.string().min(1).max(160).nullable(),
  exitCode: z.number().int().nullable(),
  boundedByteCounts: z.record(z.number().int().nonnegative())
}).strict();

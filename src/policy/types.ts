export const POLICY_SCHEMA_VERSION = 1 as const;

export const POLICY_SCOPES = [
  "workspace:open",
  "filesystem:read",
  "filesystem:write",
  "git:read",
  "git:write",
  "git:remote-write",
  "shell:verify",
  "shell:execute",
  "process:manage",
  "network:connect",
  "audit:read",
  "admin:profile",
  "admin:credentials"
] as const;

export const POLICY_SCOPES_V3 = [
  ...POLICY_SCOPES,
  "workspace:full-access",
  "host:full-access",
  "process:persistent"
] as const;

export const POLICY_SCOPES_V4 = [
  ...POLICY_SCOPES_V3,
  "git:index:write",
  "git:refs:write",
  "git:commit",
  "git:merge",
  "worktree:manage"
] as const;

export type PolicyScope = typeof POLICY_SCOPES[number];
export type PolicyScopeV3 = typeof POLICY_SCOPES_V3[number];
export type PolicyScopeV4 = typeof POLICY_SCOPES_V4[number];
export type PolicyEngineMode = "legacy" | "shadow" | "enforce";
export type PolicyOutcome = "allow" | "deny" | "approval_required" | "enforcement_unavailable";
export type PolicyReasonCode =
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "POLICY_CONTEXT_STALE"
  | "POLICY_RESOURCE_INVALID"
  | "POLICY_CONFIG_INVALID"
  | "SHELL_SANDBOX_UNAVAILABLE"
  | "PROCESS_SANDBOX_UNAVAILABLE"
  | "NETWORK_ENFORCEMENT_UNAVAILABLE";
export type RiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
export type FilesystemAccess = "deny" | "read" | "write";
export type PolicySourceKind =
  | "hard_policy"
  | "deployment"
  | "identity_scope"
  | "permission_profile"
  | "session_grant"
  | "approval_policy"
  | "enforcement";

export interface ExactFilesystemSelectorV1 {
  kind: "exact";
  path: string;
}

export interface SubtreeFilesystemSelectorV1 {
  kind: "subtree";
  path: string;
}

export interface DenyGlobFilesystemSelectorV1 {
  kind: "deny_glob";
  pattern: string;
}

export type FilesystemSelectorV1 =
  | ExactFilesystemSelectorV1
  | SubtreeFilesystemSelectorV1
  | DenyGlobFilesystemSelectorV1;

export interface FilesystemRuleV1 {
  id: string;
  selector: FilesystemSelectorV1;
  access: FilesystemAccess;
}

export interface NetworkRuleV1 {
  id: string;
  host: string;
  ports: number[] | Array<{ from: number; to: number }>;
  access: "allow" | "deny";
}

export interface PermissionProfileDocumentV1 {
  schemaVersion: 1;
  id: string;
  extends?: string;
  description?: string;
  workspaceRoots?: string[];
  filesystem?: {
    default?: "deny" | "read";
    rules?: FilesystemRuleV1[];
  };
  git?: {
    read?: boolean;
    write?: boolean;
    remoteWrite?: boolean;
  };
  shell?: {
    mode?: "disabled" | "verify" | "execute";
    requireSandbox?: boolean;
  };
  process?: {
    manage?: boolean;
    persistent?: boolean;
    requireSandbox?: boolean;
  };
  network?: {
    enabled?: boolean;
    rules?: NetworkRuleV1[];
    allowLoopback?: boolean;
    allowPrivate?: boolean;
    allowLinkLocal?: boolean;
    requireEnforcement?: boolean;
  };
}

export interface CompiledPermissionProfileV1 {
  schemaVersion: 1;
  id: string;
  sourceProfileIds: string[];
  workspaceRoots: string[];
  filesystem: {
    default: "deny" | "read";
    rules: FilesystemRuleV1[];
  };
  git: {
    read: boolean;
    write: boolean;
    remoteWrite: boolean;
  };
  shell: {
    mode: "disabled" | "verify" | "execute";
    requireSandbox: boolean;
  };
  process: {
    manage: boolean;
    persistent: boolean;
    requireSandbox: boolean;
  };
  network: {
    enabled: boolean;
    rules: NetworkRuleV1[];
    allowLoopback: boolean;
    allowPrivate: boolean;
    allowLinkLocal: boolean;
    requireEnforcement: boolean;
  };
}

export interface FullAccessPermissionV3 {
  ambientFilesystem: boolean;
  ambientCredentials: boolean;
  ambientRegistry: boolean;
  unrestrictedNetwork: boolean;
  requireBlockedPathEnforcement: boolean;
  requireCredentialIsolation: boolean;
  requireRegistryIsolation: boolean;
  requireDeviceIsolation: boolean;
  requireNetworkEnforcement: boolean;
  requireSandbox: boolean;
}

export interface PermissionProfileDocumentV3 {
  schemaVersion: 3;
  id: string;
  extends?: string;
  description?: string;
  workspaceRoots?: string[];
  filesystem?: PermissionProfileDocumentV1["filesystem"];
  git?: PermissionProfileDocumentV1["git"];
  shell?: PermissionProfileDocumentV1["shell"];
  process?: PermissionProfileDocumentV1["process"];
  network?: PermissionProfileDocumentV1["network"];
  fullAccess?: Partial<FullAccessPermissionV3>;
}

export interface CompiledPermissionProfileV3 extends Omit<CompiledPermissionProfileV1, "schemaVersion"> {
  schemaVersion: 3;
  fullAccess: FullAccessPermissionV3;
}

export interface PolicySourceHashV1 {
  id: string;
  sha256: string;
}

export interface CompiledPolicySnapshotV1 {
  schemaVersion: 1;
  policyRevision: string;
  sourceHashes: PolicySourceHashV1[];
  hardPolicyRevision: string;
  permissionProfile: CompiledPermissionProfileV1;
  identityScopeMappingRevision: string;
  approvalPolicyRevision: string;
  capabilityRevision: string;
  createdAt: string;
}

export interface RequestIdentityV1 {
  schemaVersion: 1;
  kind:
    | "local_process"
    | "loopback_unauthenticated"
    | "shared_secret_query"
    | "shared_secret_bearer"
    | "oauth_subject";
  authenticationMode: "stdio" | "loopback_none" | "query_token" | "bearer" | "oauth2";
  credentialRef: string | null;
  subject: string | null;
  scopes: PolicyScope[];
  assuranceLevel: "local" | "low" | "shared_secret" | "strong";
}

export interface RequestIdentityV3 extends Omit<RequestIdentityV1, "schemaVersion" | "scopes"> {
  schemaVersion: 3;
  scopes: PolicyScopeV3[];
}

export interface OAuthRequestIdentityV2 {
  schemaVersion: 2;
  kind: "oauth_subject";
  authenticationMode: "oauth2";
  credentialRef: string;
  credentialRevision: string;
  subject: string;
  ownerId: string;
  tokenId: string;
  clientRef: string;
  scopes: PolicyScopeV4[];
  assuranceLevel: "strong";
}

export type RequestIdentity = RequestIdentityV1 | RequestIdentityV3 | OAuthRequestIdentityV2;

export interface RequestContextV1 {
  schemaVersion: 1;
  requestId: string;
  transportKind: "stdio" | "streamable_http";
  transportSessionId: string;
  identity: RequestIdentity;
  workspaceId: string | null;
  runtimeProfileId: string;
  permissionProfileId: string;
  policyRevision: string;
  sessionGrantRevision: string;
  receivedAt: string;
}

export interface RequestContextV3 extends Omit<RequestContextV1, "schemaVersion" | "identity"> {
  schemaVersion: 3;
  identity: RequestIdentityV3;
}

export interface FilesystemResourceV1 {
  schemaVersion: 1;
  kind: "filesystem";
  operation: "read" | "list" | "search" | "write" | "delete" | "move";
  workspaceId: string;
  relativePath: string;
  comparisonKey: string;
  targetExists: boolean;
  containment: "inside" | "outside" | "unknown";
  existingParentIdentity: string;
  unresolvedSuffix: string[];
  resourceFingerprint: string;
}

export interface FilesystemBatchResourceEntryV1 {
  sourceRelativePath: string | null;
  destinationRelativePath: string | null;
  sourceComparisonKey: string | null;
  destinationComparisonKey: string | null;
}

export interface FilesystemBatchResourceV1 {
  schemaVersion: 1;
  kind: "filesystem_batch";
  operation: "move" | "undo" | "patch";
  workspaceId: string;
  entries: FilesystemBatchResourceEntryV1[];
  resourceFingerprint: string;
}

export interface GitResourceV1 {
  schemaVersion: 1;
  kind: "git";
  operation: "read" | "write" | "history_write" | "remote_write";
  workspaceId: string;
  repositoryKey: string;
  relativePaths: string[];
  refs: string[];
  remoteName: string | null;
  remoteHost: string | null;
  resourceFingerprint: string;
}

export type GitOperationV4 =
  | "read"
  | "create_branch"
  | "stage"
  | "commit"
  | "restore_review"
  | "restore_execute"
  | "stash_list"
  | "stash_create"
  | "stash_apply_review"
  | "stash_apply_execute"
  | "stash_forget_review"
  | "stash_forget_execute"
  | "task_create_review"
  | "task_create"
  | "task_list"
  | "task_get"
  | "task_merge_prepare_review"
  | "task_merge_prepare_finalize"
  | "task_merge_execute"
  | "task_remove";

export interface GitResourceV4 {
  schemaVersion: 4;
  kind: "git_v4";
  operation: GitOperationV4;
  repositoryId: string;
  worktreeId: string | null;
  branchId: string | null;
  pathDigests: string[];
  refDigests: string[];
  objectIds: string[];
  affectedPathCount: number;
  affectedByteCount: number;
  stateTokenFingerprint: string | null;
  integrationMode: "off" | "approved_full_access";
  executionIsolation: "none";
  resourceFingerprint: string;
}

export interface ShellResourceV1 {
  schemaVersion: 1;
  kind: "shell";
  operation: "verify" | "execute";
  workspaceId: string;
  backend: "bash" | "powershell" | "cmd" | "other";
  cwd: string;
  commandKind: "verification" | "opaque";
  executable: string | null;
  argumentCount: number;
  commandDigest: string;
  persistence: boolean;
  requestedNetwork: boolean;
  resourceFingerprint: string;
}

export interface ProcessResourceV1 {
  schemaVersion: 1;
  kind: "process";
  operation: "start" | "inspect" | "signal" | "terminate";
  workspaceId: string | null;
  processId: string | null;
  persistence: boolean;
  executableDigest: string | null;
  resourceFingerprint: string;
}

export type NetworkAddressClass =
  | "loopback"
  | "private"
  | "link_local"
  | "multicast"
  | "unspecified"
  | "reserved"
  | "public";

export interface NetworkResourceV1 {
  schemaVersion: 1;
  kind: "network";
  operation: "connect" | "redirect";
  workspaceId: string | null;
  scheme: "http" | "https" | "tcp" | "tls";
  host: string;
  port: number;
  hostKind: "dns" | "ipv4" | "ipv6";
  resolvedAddresses: string[];
  addressClasses: NetworkAddressClass[];
  resourceFingerprint: string;
}

export interface AuditResourceV1 {
  schemaVersion: 1;
  kind: "audit";
  operation: "query";
  workspaceId: string | null;
  filterDigest: string;
  resourceFingerprint: string;
}

export type ResourceDescriptorV1 =
  | FilesystemResourceV1
  | FilesystemBatchResourceV1
  | GitResourceV1
  | ShellResourceV1
  | ProcessResourceV1
  | NetworkResourceV1
  | AuditResourceV1;

export type ResourceDescriptorV4 = ResourceDescriptorV1 | GitResourceV4;

export type CapabilityLevel =
  | "none"
  | "brokered"
  | "kernel_enforced"
  | "best_effort"
  | "job_object"
  | "strong"
  | "proxy_only"
  | "platform_enforced"
  | "filtered"
  | "isolated"
  | "partial";

export interface SandboxCapabilityReportV1 {
  schemaVersion: 1;
  backendId: string;
  backendVersion: string;
  platform: NodeJS.Platform;
  filesystemReadBoundary: "none" | "brokered" | "kernel_enforced";
  filesystemWriteBoundary: "none" | "brokered" | "kernel_enforced";
  processTreeControl: "none" | "best_effort" | "job_object" | "strong";
  networkEgressControl: "none" | "proxy_only" | "platform_enforced";
  environmentIsolation: "none" | "filtered" | "isolated";
  credentialIsolation: "none" | "partial" | "isolated";
  registryIsolation: "none" | "partial" | "isolated";
  supportsPeerAddressVerification: boolean;
  supportsRedirectReauthorization: boolean;
  supportsRevocation: boolean;
  evidenceRevision: string;
}

export interface RequiredCapabilityV1 {
  name:
    | "filesystemReadBoundary"
    | "filesystemWriteBoundary"
    | "processTreeControl"
    | "networkEgressControl"
    | "environmentIsolation"
    | "credentialIsolation"
    | "registryIsolation"
    | "supportsPeerAddressVerification"
    | "supportsRedirectReauthorization"
    | "supportsRevocation";
  minimum: string | boolean;
}

export interface PolicyDecisionProvenanceV1 {
  sourceKind: PolicySourceKind;
  safeRuleId: string | null;
  specificity: number[];
  grantId: string | null;
  approvalId: string | null;
  enforcementBackend: string | null;
}

export interface ApprovalRequirementV1 {
  riskClass: Exclude<RiskClass, "R0" | "R4">;
  maxTtlMs: number;
  uses: number | null;
}

export interface PolicyDecisionV1 {
  schemaVersion: 1;
  decisionId: string;
  outcome: PolicyOutcome;
  reasonCode: PolicyReasonCode | null;
  policyRevision: string;
  resourceFingerprint: string;
  requiredApproval: ApprovalRequirementV1 | null;
  requiredEnforcement: RequiredCapabilityV1[];
  provenance: PolicyDecisionProvenanceV1[];
}

export interface SessionGrantV1 {
  schemaVersion: 1;
  grantId: string;
  credentialRef: string | null;
  credentialRevision?: string;
  transportSessionId: string;
  workspaceId: string | null;
  policyRevision: string;
  toolContractVersion: string;
  operation: string;
  resourceFingerprint: string;
  inputDigest: string;
  riskClass: Exclude<RiskClass, "R0" | "R4">;
  issuedAt: string;
  expiresAt: string;
  usesRemaining: number | null;
}

export interface AuditEventV1 {
  schemaVersion: 1;
  eventId: string;
  timestamp: string;
  requestId: string;
  decisionId: string;
  credentialRef: string | null;
  transportSessionId: string;
  toolName: string;
  canonicalAction: string;
  workspaceId: string | null;
  relativeResourceSummary: string;
  resourceFingerprint: string;
  policyRevision: string;
  outcome: PolicyOutcome;
  reasonCode: PolicyReasonCode | null;
  safeRuleIds: string[];
  approvalState: "not_required" | "required" | "granted" | "denied";
  grantId: string | null;
  sandboxBackend: string;
  durationMs: number;
  resultCode: string | null;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
}

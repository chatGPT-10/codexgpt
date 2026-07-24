export type TransactionErrorCode =
  | "FILE_VERSION_CONFLICT"
  | "TRANSACTION_BUSY"
  | "ATOMIC_BACKEND_UNAVAILABLE"
  | "TRANSACTION_PRECONDITION_FAILED"
  | "TRANSACTION_FAILED"
  | "ROLLBACK_FAILED"
  | "TRANSACTION_RECOVERY_REQUIRED"
  | "TRANSACTION_STATE_CORRUPT";

export type SafeTransactionDetail = string | number | boolean | null;

export class TransactionError extends Error {
  constructor(
    readonly code: TransactionErrorCode,
    message: string,
    readonly safeDetails: Readonly<Record<string, SafeTransactionDetail>> = {}
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

export type TransactionManifestState =
  | "preparing"
  | "prepared"
  | "committing"
  | "committed_pending_participants"
  | "committed"
  | "rolling_back"
  | "rolled_back"
  | "recovery_required";

export type TransactionOperationKind = "create" | "replace" | "delete" | "move";

export type TransactionOperationState =
  | "planned"
  | "staged"
  | "backup_ready"
  | "target_absent_confirmed"
  | "installed"
  | "finalized"
  | "rolled_back";

export type ParticipantFact = "pending" | "committed" | "failed";
export type DirectorySyncCapability = "supported" | "unsupported" | "failed";

export interface FileMetadataV1 {
  mode: number;
  atimeMs: number;
  mtimeMs: number;
}

export interface ExistingFileFactV1 {
  exists: true;
  sha256: string;
  identity: string;
  bytes: number;
  metadata: FileMetadataV1;
  existingParentIdentity?: string;
}

export interface AbsentFileFactV1 {
  exists: false;
  sha256: null;
  identity: null;
  bytes: 0;
  metadata: null;
  existingParentIdentity?: string;
  volumeDevice?: string;
}

export type BeforeFileFactV1 = ExistingFileFactV1 | AbsentFileFactV1;

export interface AfterPresentFileFactV1 {
  exists: true;
  sha256: string;
  bytes: number;
  identity?: string;
}

export interface AfterAbsentFileFactV1 {
  exists: false;
  sha256: null;
  bytes: 0;
  identity?: null;
}

export type AfterFileFactV1 = AfterPresentFileFactV1 | AfterAbsentFileFactV1;

export interface TransactionOperationV1 {
  operationId: string;
  kind: TransactionOperationKind;
  state: TransactionOperationState;
  relativePath: string;
  comparisonKey: string;
  stageRelativePath: string | null;
  backupRelativePath: string | null;
  before: BeforeFileFactV1;
  after: AfterFileFactV1;
}

export interface TransactionManifestV1 {
  schemaVersion: 1;
  transactionId: string;
  changeSetId: string;
  workspaceStateKey: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
  state: TransactionManifestState;
  operations: TransactionOperationV1[];
  createdDirectories: string[];
  requiredParticipants: string[];
  participantFacts: Record<string, ParticipantFact>;
  semanticFactsDigest?: string;
  failureCode?: TransactionErrorCode;
  failureMessage?: string;
  directorySync?: DirectorySyncCapability;
}

export type TransactionRequestOperationV1 =
  | {
      operationId: string;
      kind: "create";
      relativePath: string;
      bytes: Buffer;
      expectedAbsent: true;
    }
  | {
      operationId: string;
      kind: "replace";
      relativePath: string;
      bytes: Buffer;
      expectedSha256: string | null;
      expectedStableIdentity?: { dev: string; ino: string };
      expectedParentIdentity?: string;
    }
  | {
      operationId: string;
      kind: "delete";
      relativePath: string;
      expectedSha256: string | null;
    };

export interface TransactionWorkspaceV1 {
  id: string;
  root: string;
  openedAt: string;
}

export interface TransactionRequestV1 {
  workspace: TransactionWorkspaceV1;
  operations: TransactionRequestOperationV1[];
  requiredParticipants: string[];
  semanticFactsDigest?: string;
  finalizationGuard?: () => void;
}

export interface FileObjectIdentityV2 {
  device: string;
  fileId: string;
}

export interface MoveFileVersionV2 {
  sha256: string;
  bytes: number;
  mode: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
}

export type MoveOperationStateV2 =
  | "planned"
  | "staged_link_ready"
  | "source_name_removed"
  | "destination_link_ready"
  | "installed"
  | "finalized"
  | "rolled_back";

export interface MoveTransactionOperationV2 {
  operationId: string;
  kind: "move";
  state: MoveOperationStateV2;
  sourceRelativePath: string;
  destinationRelativePath: string;
  sourceComparisonKey: string;
  destinationComparisonKey: string;
  sourceExistingParentRelativePath: string;
  sourceExistingParentIdentity: string;
  destinationExistingParentRelativePath: string;
  destinationExistingParentIdentity: string;
  stageRelativePath: string;
  objectIdentity: FileObjectIdentityV2;
  version: MoveFileVersionV2;
}

export type TransactionManifestStateV2 =
  | "preparing"
  | "prepared"
  | "committing"
  | "committed_pending_participants"
  | "commit_decided"
  | "committed"
  | "rolling_back"
  | "rolled_back"
  | "recovery_required";

export interface TransactionManifestV2 {
  schemaVersion: 2;
  transactionId: string;
  changeSetId: string;
  workspaceStateKey: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
  state: TransactionManifestStateV2;
  operations: MoveTransactionOperationV2[];
  plannedCreatedDirectories: string[];
  createdDirectories: string[];
  createdDirectoryIdentities: Record<string, FileObjectIdentityV2>;
  plannedRemovedDirectories: string[];
  plannedRemovedDirectoryIdentities: Record<string, FileObjectIdentityV2>;
  removedDirectories: string[];
  requiredParticipants: string[];
  participantReferences: Record<string, string>;
  participantFacts: Record<string, ParticipantFact>;
  failureCode?: TransactionErrorCode;
  failureMessage?: string;
  directorySync?: DirectorySyncCapability;
  manifestMac: string;
}

export type TransactionManifest = TransactionManifestV1 | TransactionManifestV2;

export type ParticipantRecoveryProbeResult = "present" | "absent" | "unknown";

export interface ParticipantRecoveryAdapter {
  probe(
    manifest: TransactionManifest,
    participant: string
  ): ParticipantRecoveryProbeResult | Promise<ParticipantRecoveryProbeResult>;
  compensatePartial?(
    manifest: TransactionManifest,
    presentParticipants: readonly string[]
  ): void | Promise<void>;
  recordRecovery?(
    manifest: TransactionManifest,
    action: "rollback_completed" | "cleanup_completed" | "workspace_frozen",
    resultCode: string
  ): void | Promise<void>;
}

export interface MoveTransactionRequestOperationV2 {
  operationId: string;
  kind: "move";
  sourceRelativePath: string;
  destinationRelativePath: string;
  expectedSha256: string;
}

export interface MoveTransactionRequestV2 {
  workspace: TransactionWorkspaceV1;
  operations: MoveTransactionRequestOperationV2[];
  createParents: boolean;
  requiredParticipants: string[];
  participantReferences: Record<string, string>;
}

export interface CommittedTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly committedAt: string;
  readonly operationCount: number;
  readonly cleanupPending: boolean;
}

export interface PreparedTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;
  commit(): Promise<PendingTransactionCommit>;
  rollback(reason: string): Promise<void>;
}

export interface PendingTransactionCommit {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds: readonly TransactionOperationKind[];
  commitParticipant(name: string, action: () => Promise<void>): Promise<void>;
  finalize(): Promise<CommittedTransaction>;
  rollback(reason: string): Promise<void>;
}

export type TransactionFaultPoint =
  | "after_manifest_preparing"
  | "before_each_directory_create"
  | "after_each_directory_create_before_manifest"
  | "after_each_directory_create"
  | "before_each_stage_link"
  | "after_each_stage_link_before_manifest"
  | "after_each_stage"
  | "before_each_source_unlink"
  | "after_each_source_unlink_before_manifest"
  | "after_manifest_prepared"
  | "after_manifest_committing"
  | "before_each_destination_link"
  | "after_each_destination_link_before_manifest"
  | "before_each_stage_unlink"
  | "after_each_stage_unlink_before_manifest"
  | "after_each_install"
  | "after_manifest_pending_participants"
  | "after_each_participant_effect_before_manifest"
  | "after_each_participant"
  | "after_manifest_commit_decided"
  | "before_each_directory_remove"
  | "after_each_directory_remove_before_manifest"
  | "after_each_directory_remove"
  | "after_manifest_committed"
  | "during_each_rollback"
  | "during_each_finalize";

export interface TransactionFaultInjector {
  hit(
    point: TransactionFaultPoint,
    facts: Readonly<Record<string, string | number>>
  ): void | Promise<void>;
}

export interface InstallationStateV1 {
  schemaVersion: 1;
  installationId: string;
  masterKeyBase64: string;
  createdAt: string;
}

export interface ProcessInstanceRecordV1 {
  schemaVersion: 1;
  instanceId: string;
  pid: number;
  createdAt: string;
}

export interface WorkspaceLockOwnerV1 {
  schemaVersion: 1;
  lockToken: string;
  instanceId: string;
  pid: number;
  transactionId: string;
  createdAt: string;
}

export interface PreparedAtomicOperation {
  readonly operation: TransactionOperationV1;
  readonly targetAbsPath: string;
  readonly stageAbsPath: string | null;
  readonly backupAbsPath: string | null;
  readonly artifactParentAbsPath: string;
  readonly missingDirectories: readonly {
    relativePath: string;
    absPath: string;
  }[];
}

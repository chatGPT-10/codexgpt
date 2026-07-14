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

export type TransactionOperationKind = "create" | "replace" | "delete";

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
  commitParticipant(name: string, action: () => Promise<void>): Promise<void>;
  finalize(): Promise<CommittedTransaction>;
  rollback(reason: string): Promise<void>;
}

export type TransactionFaultPoint =
  | "after_manifest_preparing"
  | "after_each_stage"
  | "after_manifest_prepared"
  | "after_manifest_committing"
  | "after_each_install"
  | "after_manifest_pending_participants"
  | "after_each_participant"
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
}

import type { FileMetadataV1, FileObjectIdentityV2 } from "../transactions/types.js";

export type ChangeSetState =
  | "active"
  | "undone"
  | "undo_expired"
  | "recovery_required";

export type ChangeSetUndoReason =
  | "retention_disabled"
  | "plaintext_limit"
  | "installation_limit"
  | "workspace_count_limit"
  | "retention_unavailable"
  | "operation_unsupported"
  | "reverted_change_set"
  | "expired"
  | "already_undone"
  | "recovery_required";

export type ChangeSetOperationKind = "create" | "replace" | "delete" | "move";

export interface ChangeSetFileFactV1 {
  exists: boolean;
  sha256: string | null;
  bytes: number;
  metadata?: FileMetadataV1 | null;
}

export interface ChangeSetOperationV1 {
  operationId: string;
  kind: ChangeSetOperationKind;
  relativePath: string;
  destinationRelativePath: string | null;
  before: ChangeSetFileFactV1;
  after: ChangeSetFileFactV1;
  blobId: string | null;
}

export interface ChangeSetManifestV1 {
  schemaVersion: 1;
  changeSetId: string;
  transactionId: string;
  workspaceStateKey: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  toolName: string;
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 1 | 2;
  state: ChangeSetState;
  undoSupported: boolean;
  undoReason: ChangeSetUndoReason | null;
  operations: ChangeSetOperationV1[];
  plaintextBytes: number;
  ciphertextBytes: number;
  revertsChangeSetId: string | null;
  manifestMac: string;
}

export type ChangeSetManifestDraftV1 = Omit<ChangeSetManifestV1, "manifestMac">;

export interface MoveChangeSetOperationV2 {
  operationId: string;
  kind: "move";
  sourceRelativePath: string;
  destinationRelativePath: string;
  sourceComparisonKey: string;
  destinationComparisonKey: string;
  objectIdentity: FileObjectIdentityV2;
  sha256: string;
  bytes: number;
}

export interface MoveChangeSetManifestV2 {
  schemaVersion: 2;
  changeSetId: string;
  transactionId: string;
  workspaceStateKey: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  toolName: "move_paths" | "undo_change_set";
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 2;
  state: ChangeSetState;
  undoSupported: boolean;
  undoReason: ChangeSetUndoReason | null;
  operations: MoveChangeSetOperationV2[];
  createdDirectories: string[];
  createdDirectoryIdentities: Record<string, FileObjectIdentityV2>;
  plaintextBytes: 0;
  ciphertextBytes: 0;
  revertsChangeSetId: string | null;
  manifestMac: string;
}

export type MoveChangeSetManifestDraftV2 = Omit<MoveChangeSetManifestV2, "manifestMac">;
export type ChangeSetManifest = ChangeSetManifestV1 | MoveChangeSetManifestV2;

export interface ChangeSetRetentionConfig {
  maxPlaintextBytesPerChangeSet: number;
  maxInstallationCiphertextBytes: number;
  maxActivePerWorkspace: number;
  activeRetentionMs: number;
  tombstoneRetentionMs: number;
}

export type ChangeSetErrorCode =
  | "CHANGE_SET_INVALID"
  | "CHANGE_SET_NOT_FOUND"
  | "CHANGE_SET_STATE_CONFLICT"
  | "CHANGE_SET_LIMIT_EXCEEDED"
  | "CHANGE_SET_UNAVAILABLE"
  | "CHANGE_SET_INTEGRITY_FAILURE";

export class ChangeSetError extends Error {
  constructor(readonly code: ChangeSetErrorCode, message: string) {
    super(message);
    this.name = "ChangeSetError";
  }
}

export interface ChangeSetBlobContext {
  changeSetId: string;
  blobId: string;
  operationId: string;
  beforeSha256: string;
}

export interface TransactionResultV2 {
  change_set_id: string;
  transaction_id: string;
  before_state: "absent" | "present" | "mixed";
  operation_count: number;
  undo_supported: boolean;
  committed_at: string;
}

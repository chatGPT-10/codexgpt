import type { FileHandle } from "node:fs/promises";
import type { Workspace } from "../guard.js";
import type { FileObjectIdentityV2, MoveFileVersionV2 } from "../transactions/types.js";
import type { MovePathsErrorCode } from "../tools/schemas/movePaths.js";

export class MovePathsError extends Error {
  constructor(
    readonly code: MovePathsErrorCode,
    message: string,
    readonly details: { source?: string; destination?: string } = {}
  ) {
    super(message);
    this.name = "MovePathsError";
  }
}

export interface MovePathRequest {
  source: string;
  destination: string;
  expectedSha256: string;
}

export interface MoveDirectoryFact {
  relativePath: string;
  objectIdentity: FileObjectIdentityV2;
}

export interface MovePrepareRequest {
  workspace: Workspace;
  moves: readonly MovePathRequest[];
  createParents: boolean;
  removeEmptyDirectoriesAfterInstall?: readonly MoveDirectoryFact[];
  requiredParticipants: readonly string[];
  participantReferences?: Readonly<Record<string, string>>;
}

export interface MovePlannerConfig {
  blockedGlobs: string[];
  moveMaxFileBytes: number;
  moveMaxTotalBytes: number;
  moveHashConcurrency: number;
}

export interface InspectedMovePath {
  callerIndex: number;
  operationId: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
  sourceComparisonKey: string;
  destinationComparisonKey: string;
  sourceAbsPath: string;
  sourceExistingParent: string;
  sourceExistingParentRelativePath: string;
  sourceExistingParentIdentity: string;
  destinationAbsPath: string;
  destinationExistingParent: string;
  destinationExistingParentRelativePath: string;
  destinationExistingParentIdentity: string;
  missingDirectories: readonly { relativePath: string; absPath: string }[];
  objectIdentity: FileObjectIdentityV2;
  version: MoveFileVersionV2;
  handle: FileHandle;
}

export interface MoveCommittedTransaction {
  transactionId: string;
  changeSetId: string;
  committedAt: string;
  operationCount: number;
  cleanupPending: boolean;
}

export interface PendingMoveTransactionCommit {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  commitParticipant(name: string, action: () => Promise<void>): Promise<void>;
  finalize(): Promise<MoveCommittedTransaction>;
  rollback(reason: string): Promise<void>;
}

export interface PreparedMoveTransaction {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operations: readonly InspectedMovePath[];
  readonly createdDirectories: readonly string[];
  createdDirectoryFacts(): readonly MoveDirectoryFact[];
  readonly totalBytes: number;
  commit(): Promise<PendingMoveTransactionCommit>;
  rollback(reason: string): Promise<void>;
}

export interface InspectedMoveBatch {
  workspace: Workspace;
  operations: InspectedMovePath[];
  createdDirectories: readonly string[];
  totalBytes: number;
  close(): Promise<void>;
}

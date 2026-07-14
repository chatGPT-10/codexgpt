import type {
  ChangeSetManifestV1,
  CreateChangeSetInput
} from "../changesets/index.js";
import type {
  CommittedTransaction,
  TransactionOperationKind,
  TransactionRequestV1
} from "../transactions/index.js";

export interface MutationToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChangeSetIdentity {
  transactionId: string;
  changeSetId: string;
  workspaceStateKey: string;
}

export interface MutationProjectionInput<T extends object> {
  result: T;
  committed: CommittedTransaction;
  changeSet: ChangeSetManifestV1;
}

export interface MutationFailureProjectionInput<T extends object> {
  result: T;
  error: unknown;
}

export interface WorkspaceMutationPreparation<T extends object> {
  transaction: Omit<TransactionRequestV1, "requiredParticipants">;
  changeSet(identity: ChangeSetIdentity): CreateChangeSetInput;
  project?(input: MutationProjectionInput<T>): T;
  projectFailure?(input: MutationFailureProjectionInput<T>): T | null;
}

export interface MutationCommitInput<T extends object> {
  result: T;
  persistAudit(): void | Promise<void>;
}

export interface PendingWorkspaceMutation {
  readonly transactionId: string;
  readonly changeSetId: string;
  readonly operationCount: number;
  readonly mutationKinds: readonly TransactionOperationKind[];
  commit<T extends object>(input: MutationCommitInput<T>): Promise<T>;
  projectFailure<T extends object>(error: unknown, result: T): T | null;
  rollback(reason: string): Promise<void>;
}

export interface MutationProviderInvocation<T extends object> {
  requiresMutation: boolean;
  provider(): T | Promise<T>;
}

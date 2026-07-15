export {
  TransactionError,
  type AbsentFileFactV1,
  type AfterFileFactV1,
  type BeforeFileFactV1,
  type CommittedTransaction,
  type DirectorySyncCapability,
  type ExistingFileFactV1,
  type FileMetadataV1,
  type InstallationStateV1,
  type ParticipantFact,
  type ParticipantRecoveryAdapter,
  type ParticipantRecoveryProbeResult,
  type PendingTransactionCommit,
  type PreparedAtomicOperation,
  type PreparedTransaction,
  type ProcessInstanceRecordV1,
  type SafeTransactionDetail,
  type TransactionErrorCode,
  type TransactionFaultInjector,
  type TransactionFaultPoint,
  type FileObjectIdentityV2,
  type MoveFileVersionV2,
  type MoveOperationStateV2,
  type MoveTransactionOperationV2,
  type MoveTransactionRequestOperationV2,
  type MoveTransactionRequestV2,
  type TransactionManifest,
  type TransactionManifestState,
  type TransactionManifestStateV2,
  type TransactionManifestV1,
  type TransactionManifestV2,
  type TransactionOperationKind,
  type TransactionOperationState,
  type TransactionOperationV1,
  type TransactionRequestOperationV1,
  type TransactionRequestV1,
  type TransactionWorkspaceV1,
  type WorkspaceLockOwnerV1
} from "./types.js";

export {
  AtomicWorkspaceFs,
  type AtomicWorkspaceFsDependencies,
  type InspectedWorkspacePath
} from "./atomicFs.js";

export {
  AtomicJsonFileStore,
  TransactionManifestStore,
  manifestPathFor,
  type AtomicStateDependencies
} from "./atomicStateFile.js";

export { TransactionManifestV2Store } from "./manifestV2Store.js";

export {
  deriveTransactionSubkey,
  installationMasterKey,
  loadOrCreateInstallationState,
  workspaceStateKeyForRoot,
  type InstallationStateOptions
} from "./installation.js";

export {
  AtomicTransactionEngine,
  type AtomicTransactionEngineOptions,
  type TransactionRecoveryHook
} from "./engine.js";

export {
  DurableParticipantRecoveryAdapter,
  createDurableParticipantRecoveryAdapter,
  type DurableParticipantRecoveryAdapterOptions
} from "./participantRecovery.js";

export {
  TransactionRecoveryCoordinator,
  createDefaultTransactionRecoveryCoordinator,
  recoveryActionForState,
  type TransactionRecoveryAction,
  type TransactionRecoveryCoordinatorOptions
} from "./recovery.js";

export {
  ProcessInstanceRegistry,
  WorkspaceLockHandle,
  WorkspaceMutationLock,
  classifyProcessLiveness,
  type ProcessInstanceRegistryOptions,
  type ProcessLiveness,
  type WorkspaceLockDependencies,
  type WorkspaceLockInput
} from "./workspaceLock.js";

export {
  normalizeCanonicalWorkspaceRoot,
  resolveTransactionStateRoot,
  transactionStateDirectories,
  transactionWorkspaceStateDirectory,
  type TransactionStateDirectories,
  type TransactionStateRootOptions
} from "./stateRoot.js";

export {
  changeSetIdSchema,
  fileIdentitySchema,
  fileObjectIdentityV2Schema,
  fileMetadataV1Schema,
  installationIdSchema,
  installationStateV1Schema,
  lockTokenSchema,
  moveFileVersionV2Schema,
  moveTransactionOperationV2Schema,
  operationIdSchema,
  processInstanceIdSchema,
  processInstanceRecordV1Schema,
  sha256Schema,
  transactionIdSchema,
  transactionManifestSchema,
  transactionManifestV1Schema,
  transactionManifestV2Schema,
  transactionOperationV1Schema,
  transactionRelativePathSchema,
  workspaceLockOwnerV1Schema,
  workspaceStateKeySchema
} from "./schemas.js";

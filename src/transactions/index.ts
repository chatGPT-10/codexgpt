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
  type PendingTransactionCommit,
  type PreparedAtomicOperation,
  type PreparedTransaction,
  type ProcessInstanceRecordV1,
  type SafeTransactionDetail,
  type TransactionErrorCode,
  type TransactionFaultInjector,
  type TransactionFaultPoint,
  type TransactionManifestState,
  type TransactionManifestV1,
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
  fileMetadataV1Schema,
  installationIdSchema,
  installationStateV1Schema,
  lockTokenSchema,
  operationIdSchema,
  processInstanceIdSchema,
  processInstanceRecordV1Schema,
  sha256Schema,
  transactionIdSchema,
  transactionManifestV1Schema,
  transactionOperationV1Schema,
  transactionRelativePathSchema,
  workspaceLockOwnerV1Schema,
  workspaceStateKeySchema
} from "./schemas.js";

export {
  WorkspaceMutationRuntime,
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  type WorkspaceMutationRuntimeOptions
} from "./runtime.js";

export {
  attachPreparedPatchMutation,
  attachPreparedFileMutation,
  attachPreparedBatchMutation,
  preserveMutationResult
} from "./writers.js";
export type {
  AttachPreparedPatchMutationInput,
  AttachPreparedFileMutationInput,
  AttachPreparedBatchMutationInput,
  BatchMutationContext,
  BatchMutationFileProjection,
  BatchMutationPublicProjection,
  FileMutationContext,
  FileMutationPublicProjection,
  PatchMutationContext,
  PatchMutationFileProjection,
  PatchMutationPublicProjection
} from "./writers.js";

export type {
  ChangeSetIdentity,
  MutationCommitInput,
  MutationFailureProjectionInput,
  MutationProjectionInput,
  MutationProviderInvocation,
  MutationToolResult,
  PendingWorkspaceMutation,
  WorkspaceMutationPreparation
} from "./types.js";

export {
  LocalMutationService,
  type ExecuteLocalBatchOptions,
  type LocalMutationServiceOptions
} from "./localService.js";

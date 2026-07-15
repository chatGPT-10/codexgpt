export {
  WorkspaceMutationRuntime,
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  type WorkspaceMutationRuntimeOptions
} from "./runtime.js";

export {
  attachPreparedPatchMutation,
  attachPreparedFileMutation,
  preserveMutationResult
} from "./writers.js";
export type {
  AttachPreparedPatchMutationInput,
  AttachPreparedFileMutationInput,
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

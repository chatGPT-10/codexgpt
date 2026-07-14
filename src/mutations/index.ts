export {
  WorkspaceMutationRuntime,
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  type WorkspaceMutationRuntimeOptions
} from "./runtime.js";

export {
  attachPreparedFileMutation,
  preserveMutationResult
} from "./writers.js";
export type {
  AttachPreparedFileMutationInput,
  FileMutationContext,
  FileMutationPublicProjection
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

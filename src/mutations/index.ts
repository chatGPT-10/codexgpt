export {
  WorkspaceMutationRuntime,
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  type WorkspaceMutationRuntimeOptions
} from "./runtime.js";

export {
  preserveMutationResult
} from "./writers.js";

export type {
  ChangeSetIdentity,
  MutationCommitInput,
  MutationProjectionInput,
  MutationProviderInvocation,
  MutationToolResult,
  PendingWorkspaceMutation,
  WorkspaceMutationPreparation
} from "./types.js";

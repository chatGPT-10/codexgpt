import type {
  CanonicalToolV4Addition,
  ToolContractDescriptor,
  ToolContractProjectionInput
} from "./types.js";

export const CONTRACT_V4_ADDITIONS = Object.freeze([
  "git_log",
  "git_branch",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "git_restore",
  "git_stash",
  "create_task_worktree",
  "list_task_worktrees",
  "get_task_worktree",
  "merge_task_worktree",
  "remove_task_worktree"
] as const satisfies readonly CanonicalToolV4Addition[]);

const STANDARD_AND_FULL = Object.freeze(["standard", "full"] as const);
const FULL_ONLY = Object.freeze(["full"] as const);

const V4_DESCRIPTORS = Object.freeze({
  git_log: { name: "git_log", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  git_branch: { name: "git_branch", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  git_create_branch: { name: "git_create_branch", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  git_stage: { name: "git_stage", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  git_commit: { name: "git_commit", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  git_restore: { name: "git_restore", introducedIn: 4, modes: FULL_ONLY, connectionTest: false },
  git_stash: { name: "git_stash", introducedIn: 4, modes: FULL_ONLY, connectionTest: false },
  create_task_worktree: { name: "create_task_worktree", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  list_task_worktrees: { name: "list_task_worktrees", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  get_task_worktree: { name: "get_task_worktree", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  merge_task_worktree: { name: "merge_task_worktree", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false },
  remove_task_worktree: { name: "remove_task_worktree", introducedIn: 4, modes: STANDARD_AND_FULL, connectionTest: false }
} as const satisfies Record<CanonicalToolV4Addition, ToolContractDescriptor>);

export function v4ToolsForProjection(
  input: ToolContractProjectionInput
): readonly CanonicalToolV4Addition[] {
  if (input.version !== 4 || input.connectionTest) return Object.freeze([]);
  return Object.freeze(CONTRACT_V4_ADDITIONS.filter((name) =>
    (V4_DESCRIPTORS[name].modes as readonly string[]).includes(input.mode)
  ));
}

export function v4ContractDescriptor(name: CanonicalToolV4Addition): ToolContractDescriptor {
  return V4_DESCRIPTORS[name];
}

import type { ZodType } from "zod";
import type { CanonicalTool } from "../contracts/types.js";

export type ToolCategory =
  | "inspect"
  | "navigate"
  | "mutate"
  | "verify"
  | "process"
  | "git"
  | "admin";

export type ToolMutability = "read" | "write";
export type ToolExecutionMode = "parallel" | "exclusive";
export type ToolWorkspaceMode = "none" | "optional" | "required";

export interface ToolExecutionContext<TWorkspace = unknown> {
  readonly signal?: AbortSignal;
  readonly extra?: unknown;
  readonly workspace?: TWorkspace;
}

export interface ToolSelectionContract {
  readonly name: string;
  readonly category: ToolCategory;
  readonly intent: string;
  readonly useWhen: readonly string[];
  readonly doNotUseWhen: readonly string[];
  readonly mutability: ToolMutability;
  readonly execution: ToolExecutionMode;
  readonly workspace: ToolWorkspaceMode;
}

export interface ToolDefinition<I = unknown, O = unknown, TWorkspace = unknown>
  extends ToolSelectionContract {
  readonly inputSchema: ZodType<I>;
  readonly outputSchema: ZodType<O>;
  readonly handler: (input: I, context: ToolExecutionContext<TWorkspace>) => Promise<O>;
}

type SelectionOverride = Partial<Omit<ToolSelectionContract, "name">> &
  Pick<ToolSelectionContract, "intent" | "useWhen" | "doNotUseWhen">;

const NAVIGATE_TOOLS = new Set<string>([
  "tree",
  "search",
  "semantic",
  "inspect_workspace",
  "codex_context",
  "load_skill"
]);
const VERIFY_TOOLS = new Set<string>([
  "show_changes",
  "codexgpt_self_test",
  "query_audit_events"
]);
const PROCESS_TOOLS = new Set<string>([
  "bash",
  "run_command",
  "start_process",
  "read_process_output",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "list_processes"
]);
const GIT_TOOLS = new Set<string>([
  "git_status",
  "git_diff",
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
]);
const ADMIN_TOOLS = new Set<string>([
  "server_config",
  "codexgpt_inventory",
  "list_workspaces",
  "open_current_workspace",
  "open_workspace",
  "open_full_access_workspace",
  "close_workspace",
  "workspace_snapshot",
  "codex_sessions",
  "read_codex_session"
]);
const WRITE_TOOLS = new Set<string>([
  "write",
  "edit",
  "apply_patch",
  "move_paths",
  "undo_change_set",
  "export_pro_context",
  "handoff_to_agent",
  "handoff_to_codex",
  "wait_for_handoff",
  "bash",
  "run_command",
  "start_process",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "git_restore",
  "git_stash",
  "create_task_worktree",
  "get_task_worktree",
  "merge_task_worktree",
  "remove_task_worktree",
  "open_full_access_workspace",
  "close_workspace"
]);
const NO_WORKSPACE_TOOLS = new Set<string>([
  "server_config",
  "codexgpt_inventory",
  "codexgpt_self_test",
  "list_workspaces",
  "open_current_workspace",
  "open_workspace",
  "open_full_access_workspace",
  "close_workspace",
  "codex_sessions",
  "read_codex_session",
  "read_handoff",
  "wait_for_handoff",
  "query_audit_events"
]);
const REQUIRED_WORKSPACE_TOOLS = new Set<string>([
  "git_log",
  "git_branch",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "git_restore",
  "git_stash",
  "create_task_worktree",
  "list_task_worktrees",
  "merge_task_worktree",
  "remove_task_worktree",
  "move_paths"
]);

const ROUTING_OVERRIDES: Readonly<Record<string, SelectionOverride>> = Object.freeze({
  read: {
    intent: "Read one known text file or exact line range.",
    useWhen: ["The exact file/path is already known."],
    doNotUseWhen: [
      "The file/path is unknown; use tree for names, search for exact text, or semantic for definitions/references first."
    ],
    category: "inspect"
  },
  write: {
    intent: "Create a text file or replace its complete contents.",
    useWhen: ["A new file or a complete known-file replacement is required."],
    doNotUseWhen: ["Existing content must be preserved while changing exact locations; use edit or apply_patch."],
    category: "mutate",
    mutability: "write",
    execution: "exclusive"
  },
  tree: {
    intent: "Discover workspace files and directory structure.",
    useWhen: ["An unknown filename or directory must be discovered."],
    doNotUseWhen: ["Exact text, error messages, configuration keys, or symbol occurrences are needed; use search."],
    category: "navigate"
  },
  search: {
    intent: "Find lexical occurrences in workspace text.",
    useWhen: ["Exact text, strings, error messages, configuration keys, or lexical symbol occurrences are needed."],
    doNotUseWhen: [
      "An unknown filename or directory must be discovered; use tree.",
      "Semantic definitions or references are needed and semantic is available."
    ],
    category: "navigate"
  },
  semantic: {
    intent: "Route one bounded code-navigation request across owned semantics, honest lexical fallback, and file discovery.",
    useWhen: [
      "Definitions, references, implementations, diagnostics, filenames, text, or uncertain provider availability must be located with operation=navigate (or V5 navigate_code).",
      "Exact semantic diagnostics or rename impact are needed through the legacy semantic operations."
    ],
    doNotUseWhen: ["Only raw exact text, error messages, or configuration keys are wanted without routing; use search."],
    category: "navigate"
  },
  workspace_snapshot: {
    intent: "Collect one compact task-start snapshot of workspace state.",
    useWhen: ["Git status, recent commits, bridge context, and a compact tree are needed together."],
    doNotUseWhen: ["Deep repository topology or target-specific instructions are needed; use inspect_workspace or codex_context."],
    category: "admin"
  },
  inspect_workspace: {
    intent: "Build a bounded structural repository map.",
    useWhen: ["Languages, project types, entrypoints, areas, symbols, relationships, or coverage warnings are needed."],
    doNotUseWhen: ["Exact files/text or target-specific instructions are needed; use tree, search, or codex_context."],
    category: "navigate"
  },
  codex_context: {
    intent: "Load the instruction chain and applicable Skill catalog for one target.",
    useWhen: ["Target-specific AGENTS instructions, Skills, or optional bridge/git context are needed before work."],
    doNotUseWhen: ["A broad repository map or compact workspace-state snapshot is needed; use inspect_workspace or workspace_snapshot."],
    category: "navigate"
  },
  edit: {
    intent: "Apply one exact replacement in one text file.",
    useWhen: ["A small, exact single-file replacement is required."],
    doNotUseWhen: ["Multiple locations or files must change; use apply_patch."],
    category: "mutate",
    mutability: "write",
    execution: "exclusive"
  },
  apply_patch: {
    intent: "Apply one bounded atomic multi-location patch or approved semantic rename.",
    useWhen: ["Changing multiple locations or files atomically is required."],
    doNotUseWhen: ["A small, exact single-file replacement is sufficient; use edit."],
    category: "mutate",
    mutability: "write",
    execution: "exclusive"
  },
  run_command: {
    intent: "Run one finite command and return bounded retained output.",
    useWhen: ["A bounded command expected to terminate, such as tests, build, lint, or typecheck, must run."],
    doNotUseWhen: ["A persistent or interactive command must run; use start_process."],
    category: "process",
    mutability: "write",
    execution: "exclusive"
  },
  start_process: {
    intent: "Start one owned persistent or interactive process.",
    useWhen: ["A persistent or interactive command such as a dev server, watcher, or REPL must run."],
    doNotUseWhen: ["A bounded command expected to terminate must run; use run_command."],
    category: "process",
    mutability: "write",
    execution: "exclusive"
  }
});

function humanize(name: string): string {
  return name.replaceAll("_", " ");
}

function categoryFor(name: string): ToolCategory {
  if (NAVIGATE_TOOLS.has(name)) return "navigate";
  if (VERIFY_TOOLS.has(name)) return "verify";
  if (PROCESS_TOOLS.has(name)) return "process";
  if (GIT_TOOLS.has(name)) return "git";
  if (ADMIN_TOOLS.has(name)) return "admin";
  if (WRITE_TOOLS.has(name)) return "mutate";
  return "inspect";
}

function freezeStrings(values: readonly string[], label: string): readonly string[] {
  if (values.length === 0 || values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${label} must contain at least one non-empty instruction.`);
  }
  return Object.freeze(values.map((value) => value.trim()));
}

export function toolSelectionContract(name: CanonicalTool | string): ToolSelectionContract {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Tool name must be a non-empty string.");
  }
  const normalizedName = name.trim();
  const override = ROUTING_OVERRIDES[normalizedName];
  const category = override?.category ?? categoryFor(normalizedName);
  const mutability = override?.mutability ?? (WRITE_TOOLS.has(normalizedName) ? "write" : "read");
  const execution = override?.execution ?? (mutability === "write" ? "exclusive" : "parallel");
  const workspace = override?.workspace ?? (
    NO_WORKSPACE_TOOLS.has(normalizedName)
      ? "none"
      : REQUIRED_WORKSPACE_TOOLS.has(normalizedName)
        ? "required"
        : "optional"
  );
  const label = humanize(normalizedName);
  return Object.freeze({
    name: normalizedName,
    category,
    intent: override?.intent ?? `${mutability === "read" ? "Inspect" : "Change"} the bounded ${label} capability.`,
    useWhen: freezeStrings(
      override?.useWhen ?? [`The requested task specifically requires ${label}.`],
      `${normalizedName}.useWhen`
    ),
    doNotUseWhen: freezeStrings(
      override?.doNotUseWhen ?? ["A narrower dedicated tool can complete the task with less authority or less output."],
      `${normalizedName}.doNotUseWhen`
    ),
    mutability,
    execution,
    workspace
  });
}

export function renderToolDescription(name: CanonicalTool | string, baseDescription: string): string {
  const base = baseDescription.trim();
  if (!base) throw new Error(`Tool ${name} must provide a non-empty base description.`);
  const selection = toolSelectionContract(name);
  return [
    base,
    `Use when: ${selection.useWhen.join(" ")}`,
    `Do not use when: ${selection.doNotUseWhen.join(" ")}`
  ].join(" ");
}

export function defineTool<I, O, TWorkspace = unknown>(
  input: ToolDefinition<I, O, TWorkspace>
): ToolDefinition<I, O, TWorkspace> {
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    throw new Error("Tool definition name must be a non-empty string.");
  }
  if (typeof input.intent !== "string" || input.intent.trim().length === 0) {
    throw new Error(`Tool ${input.name} intent must be non-empty.`);
  }
  if (!input.inputSchema || typeof input.inputSchema.parse !== "function") {
    throw new Error(`Tool ${input.name} inputSchema must be a Zod schema.`);
  }
  if (!input.outputSchema || typeof input.outputSchema.parse !== "function") {
    throw new Error(`Tool ${input.name} outputSchema must be a Zod schema.`);
  }
  if (typeof input.handler !== "function") {
    throw new Error(`Tool ${input.name} handler must be a function.`);
  }
  return Object.freeze({
    ...input,
    name: input.name.trim(),
    intent: input.intent.trim(),
    useWhen: freezeStrings(input.useWhen, `${input.name}.useWhen`),
    doNotUseWhen: freezeStrings(input.doNotUseWhen, `${input.name}.doNotUseWhen`)
  });
}

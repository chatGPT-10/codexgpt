import process from "node:process";
import { z } from "zod";
import { applyContextBudget, type ContextBudgetLimits } from "./contextBudget.js";
import { detectProject, type ProjectDetectionIo } from "./projectDetector.js";

const detectedValueSchema = z.object({
  value: z.string().min(1),
  source: z.string().min(1),
  confidence: z.enum(["confirmed", "inferred"])
}).strict();

const commandSetSchema = z.object({
  build: z.array(detectedValueSchema).max(32),
  test: z.array(detectedValueSchema).max(32),
  lint: z.array(detectedValueSchema).max(32),
  typecheck: z.array(detectedValueSchema).max(32)
}).strict();

const workspaceContextDraftSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    root: z.string().min(1),
    platform: z.string().min(1)
  }).strict(),
  project: z.object({
    manifests: z.array(z.string().min(1)).max(32),
    languages: z.array(detectedValueSchema).max(32),
    package_manager: detectedValueSchema.nullable(),
    commands: commandSetSchema
  }).strict(),
  git: z.object({
    available: z.boolean(),
    branch: z.string().min(1).nullable(),
    dirty: z.boolean().nullable(),
    modified_files: z.number().int().nonnegative().nullable(),
    source: z.literal("git_status")
  }).strict(),
  guidance: z.object({
    instruction_files: z.array(z.string().min(1)).max(256),
    available_skills: z.array(z.object({
      name: z.string().min(1),
      description: z.string(),
      source: z.enum(["workspace", "user", "plugin", "other"]),
      applicability: z.enum(["implicit", "load_on_request"])
    }).strict()).max(200),
    detail_tools: z.array(z.enum(["codex_context", "load_skill", "tree", "git_diff"]))
  }).strict(),
  capabilities: z.object({
    semantic: z.enum(["available", "unavailable"]),
    persistent_process: z.enum(["available", "unavailable"])
  }).strict()
}).strict();

export const workspaceContextSnapshotSchema = workspaceContextDraftSchema.extend({
  budget: z.object({
    max_chars: z.number().int().min(1_000).max(32_000),
    actual_chars: z.number().int().nonnegative(),
    truncated: z.boolean(),
    omitted_instruction_files: z.number().int().nonnegative(),
    omitted_skills: z.number().int().nonnegative(),
    omitted_project_items: z.number().int().nonnegative()
  }).strict()
}).strict().superRefine((value, context) => {
  const actual = JSON.stringify(value).length;
  if (actual !== value.budget.actual_chars) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "actual_chars"], message: "Workspace context budget length is not self-consistent." });
  }
  if (actual > value.budget.max_chars) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "max_chars"], message: "Workspace context exceeds its character budget." });
  }
});

export type WorkspaceContextSnapshot = z.infer<typeof workspaceContextSnapshotSchema>;

export interface WorkspaceContextSkill {
  name: string;
  description?: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  applicability?: "implicit" | "load_on_request";
}

export interface BuildWorkspaceContextOptions extends ProjectDetectionIo {
  workspace: { id: string; root: string };
  platform?: string;
  gitStatus: string;
  instructionFiles?: string[];
  skills?: WorkspaceContextSkill[];
  capabilities: { semantic: boolean; persistentProcess: boolean };
  budget?: ContextBudgetLimits;
}

function gitUnavailable(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized.startsWith("fatal:") ||
    normalized.startsWith("error:") ||
    normalized.startsWith("git unavailable or failed:") ||
    normalized.startsWith("git exited with status") ||
    normalized.includes("not a git repository") ||
    normalized === "git history unavailable for this workspace.";
}

export function parseWorkspaceGitStatus(status: string): {
  available: boolean;
  branch: string | null;
  dirty: boolean | null;
  modified_files: number | null;
  source: "git_status";
} {
  if (gitUnavailable(status)) {
    return { available: false, branch: null, dirty: null, modified_files: null, source: "git_status" };
  }
  const lines = status.split(/\r?\n/u).map((line) => line.trimEnd()).filter((line) => line.trim());
  const head = lines[0]?.startsWith("## ") ? lines.shift()!.slice(3).trim() : null;
  let branch = head;
  if (branch?.startsWith("No commits yet on ")) branch = branch.slice("No commits yet on ".length);
  else if (branch?.startsWith("HEAD (")) branch = "HEAD";
  else if (branch?.includes("...")) branch = branch.slice(0, branch.indexOf("..."));
  const changes = lines.filter((line) => line !== "(no output)");
  return {
    available: true,
    branch: branch || null,
    dirty: changes.length > 0,
    modified_files: changes.length,
    source: "git_status"
  };
}

export async function buildWorkspaceContextSnapshot(options: BuildWorkspaceContextOptions): Promise<WorkspaceContextSnapshot> {
  const project = await detectProject({
    root: options.workspace.root,
    ...(options.readText ? { readText: options.readText } : {}),
    ...(options.fileExists ? { fileExists: options.fileExists } : {})
  });
  const draft = workspaceContextDraftSchema.parse({
    workspace: {
      id: options.workspace.id,
      root: options.workspace.root,
      platform: options.platform ?? process.platform
    },
    project: {
      manifests: project.manifests,
      languages: project.languages,
      package_manager: project.packageManager,
      commands: project.commands
    },
    git: parseWorkspaceGitStatus(options.gitStatus),
    guidance: {
      instruction_files: [...new Set(options.instructionFiles ?? [])],
      available_skills: (options.skills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description ?? "",
        source: skill.source,
        applicability: skill.applicability ?? "load_on_request"
      })),
      detail_tools: ["codex_context", "load_skill", "tree", "git_diff"]
    },
    capabilities: {
      semantic: options.capabilities.semantic ? "available" : "unavailable",
      persistent_process: options.capabilities.persistentProcess ? "available" : "unavailable"
    }
  });
  return workspaceContextSnapshotSchema.parse(applyContextBudget(draft, options.budget));
}

export function renderWorkspaceContextSnapshot(snapshot: WorkspaceContextSnapshot): string {
  return [
    "# Workspace Context Snapshot",
    "",
    "Use this bounded bootstrap context before requesting lazy details with codex_context, load_skill, tree, or git_diff.",
    "",
    JSON.stringify(snapshot, null, 2)
  ].join("\n");
}

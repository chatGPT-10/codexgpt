export interface ContextBudgetLimits {
  maxChars?: number;
  maxSkills?: number;
  maxInstructionFiles?: number;
  maxDescriptionChars?: number;
}

type BudgetableDraft = {
  workspace: Record<string, unknown>;
  project: {
    manifests: string[];
    languages: Array<Record<string, unknown>>;
    package_manager: Record<string, unknown> | null;
    commands: Record<"build" | "test" | "lint" | "typecheck", Array<Record<string, unknown>>>;
  };
  git: Record<string, unknown>;
  guidance: {
    instruction_files: string[];
    available_skills: Array<{ name: string; description: string; source: string; applicability: string }>;
    detail_tools: string[];
  };
  capabilities: Record<string, unknown>;
};

function serializedLength(value: unknown): number {
  return JSON.stringify(value).length;
}

export function applyContextBudget<T extends BudgetableDraft>(draft: T, limits: ContextBudgetLimits = {}): T & {
  budget: {
    max_chars: number;
    actual_chars: number;
    truncated: boolean;
    omitted_instruction_files: number;
    omitted_skills: number;
    omitted_project_items: number;
  };
} {
  const maxChars = Math.max(1_000, Math.min(32_000, Math.floor(limits.maxChars ?? 12_000)));
  const maxSkills = Math.max(0, Math.min(200, Math.floor(limits.maxSkills ?? 40)));
  const maxInstructionFiles = Math.max(0, Math.min(256, Math.floor(limits.maxInstructionFiles ?? 64)));
  const maxDescriptionChars = Math.max(32, Math.min(1_000, Math.floor(limits.maxDescriptionChars ?? 240)));
  const instructionFiles = [...draft.guidance.instruction_files].sort((a, b) => a.localeCompare(b));
  const skills = [...draft.guidance.available_skills]
    .sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))
    .map((skill) => ({
      ...skill,
      description: skill.description.length > maxDescriptionChars
        ? `${skill.description.slice(0, maxDescriptionChars - 1).trimEnd()}…`
        : skill.description
    }));
  let omittedInstructionFiles = Math.max(0, instructionFiles.length - maxInstructionFiles);
  let omittedSkills = Math.max(0, skills.length - maxSkills);
  let omittedProjectItems = 0;
  const output = {
    ...draft,
    project: {
      ...draft.project,
      manifests: [...draft.project.manifests],
      languages: [...draft.project.languages],
      commands: {
        build: [...draft.project.commands.build],
        test: [...draft.project.commands.test],
        lint: [...draft.project.commands.lint],
        typecheck: [...draft.project.commands.typecheck]
      }
    },
    guidance: {
      instruction_files: instructionFiles.slice(0, maxInstructionFiles),
      available_skills: skills.slice(0, maxSkills),
      detail_tools: [...draft.guidance.detail_tools]
    },
    budget: {
      max_chars: maxChars,
      actual_chars: 0,
      truncated: omittedInstructionFiles > 0 || omittedSkills > 0,
      omitted_instruction_files: omittedInstructionFiles,
      omitted_skills: omittedSkills,
      omitted_project_items: omittedProjectItems
    }
  } as T & {
    budget: {
      max_chars: number;
      actual_chars: number;
      truncated: boolean;
      omitted_instruction_files: number;
      omitted_skills: number;
      omitted_project_items: number;
    };
  };

  const updateBudget = () => {
    output.budget.omitted_instruction_files = omittedInstructionFiles;
    output.budget.omitted_skills = omittedSkills;
    output.budget.omitted_project_items = omittedProjectItems;
    output.budget.truncated = omittedInstructionFiles > 0 || omittedSkills > 0 || omittedProjectItems > 0;
    let previous = -1;
    while (previous !== output.budget.actual_chars) {
      previous = output.budget.actual_chars;
      output.budget.actual_chars = serializedLength(output);
    }
  };
  updateBudget();

  const commandKinds: Array<"typecheck" | "lint" | "test" | "build"> = ["typecheck", "lint", "test", "build"];
  while (output.budget.actual_chars > maxChars) {
    if (output.guidance.available_skills.length > 0) {
      output.guidance.available_skills.pop();
      omittedSkills += 1;
    } else if (output.guidance.instruction_files.length > 0) {
      output.guidance.instruction_files.pop();
      omittedInstructionFiles += 1;
    } else {
      const kind = commandKinds.find((candidate) => output.project.commands[candidate].length > 0);
      if (kind) {
        output.project.commands[kind].pop();
        omittedProjectItems += 1;
      } else if (output.project.languages.length > 0) {
        output.project.languages.pop();
        omittedProjectItems += 1;
      } else if (output.project.manifests.length > 0) {
        output.project.manifests.pop();
        omittedProjectItems += 1;
      } else {
        break;
      }
    }
    updateBudget();
  }
  updateBudget();
  return output;
}

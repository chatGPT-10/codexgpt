import type { StandardSkillRecord } from "./skillDiscovery.js";

export interface SkillCatalogEntry {
  name: string;
  description: string;
  source: StandardSkillRecord["source"];
  path: string;
  compatibility: string | null;
  loadable: boolean;
  implicitEligible: boolean;
  requirementsState: StandardSkillRecord["requirementsState"];
  specCompliant: boolean;
}

export interface SkillCatalogResult {
  entries: SkillCatalogEntry[];
  serialized: string;
  characterCount: number;
  catalogComplete: boolean;
  catalogOmittedCount: number;
  descriptionsShortened: number;
  ineligibleCount: number;
}

const SOURCE_RANK: Record<StandardSkillRecord["source"], number> = {
  workspace: 0,
  user: 1,
  plugin: 2,
  other: 3
};

function publicEntry(skill: StandardSkillRecord, descriptionLimit: number): SkillCatalogEntry {
  const description = skill.description.length > descriptionLimit
    ? `${skill.description.slice(0, Math.max(1, descriptionLimit - 1)).trimEnd()}…`
    : skill.description;
  return {
    name: skill.name,
    description,
    source: skill.source,
    path: skill.path,
    compatibility: skill.compatibility,
    loadable: skill.loadable,
    implicitEligible: skill.implicitEligible,
    requirementsState: skill.requirementsState,
    specCompliant: skill.specCompliant
  };
}

function serialize(entries: SkillCatalogEntry[], omitted: number, shortened: number): string {
  return JSON.stringify({
    skills: entries,
    catalog_complete: omitted === 0,
    catalog_omitted_count: omitted,
    descriptions_shortened: shortened
  });
}

export function buildSkillCatalog(skills: StandardSkillRecord[], requestedMaxChars = 8_000): SkillCatalogResult {
  const maxChars = Math.max(1_000, Math.min(32_000, Math.floor(requestedMaxChars)));
  const eligible = skills.filter((skill) => skill.loadable && skill.implicitEligible)
    .sort((left, right) => SOURCE_RANK[left.source] - SOURCE_RANK[right.source] || left.proximity - right.proximity || left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  const ineligibleCount = skills.length - eligible.length;
  let descriptionLimit = 1_000;
  let included = eligible.length;
  let entries: SkillCatalogEntry[] = [];
  let shortened = 0;
  let serialized = "";

  const rebuild = () => {
    entries = eligible.slice(0, included).map((skill) => publicEntry(skill, descriptionLimit));
    shortened = entries.filter((entry, index) => entry.description !== eligible[index]!.description).length;
    serialized = serialize(entries, eligible.length - included, shortened);
  };
  rebuild();
  while (serialized.length > maxChars && descriptionLimit > 32) {
    descriptionLimit = Math.max(32, descriptionLimit - 32);
    rebuild();
  }
  while (serialized.length > maxChars && included > 0) {
    included -= 1;
    rebuild();
  }
  if (serialized.length > maxChars) {
    entries = [];
    shortened = 0;
    serialized = serialize([], eligible.length, 0);
  }
  return {
    entries,
    serialized,
    characterCount: serialized.length,
    catalogComplete: included === eligible.length,
    catalogOmittedCount: eligible.length - included,
    descriptionsShortened: shortened,
    ineligibleCount
  };
}

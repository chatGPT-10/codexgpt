import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const catalog = await tsImport("../src/guidance/skillCatalog.ts", import.meta.url).catch(() => null);

function skill(index, description = `Skill ${index}`) {
  return {
    name: `skill-${String(index).padStart(3, "0")}`,
    description,
    source: "workspace",
    path: `$WORKSPACE/.agents/skills/skill-${String(index).padStart(3, "0")}/SKILL.md`,
    compatibility: null,
    loadable: true,
    implicitInvocation: true,
    requirementsState: "none",
    implicitEligible: true,
    specCompliant: true,
    legacyParse: false,
    metadataRedacted: false,
    proximity: 0,
    warnings: []
  };
}

test("catalog budget shortens descriptions before deterministically omitting the tail", () => {
  assert.ok(catalog);
  const skills = Array.from({ length: 30 }, (_, index) => skill(index, `Description ${index} ${"x".repeat(300)}`));
  const result = catalog.buildSkillCatalog(skills, 1_500);
  assert.ok(result.serialized.length <= 1_500);
  assert.equal(result.characterCount, result.serialized.length);
  assert.equal(result.catalogComplete, false);
  assert.ok(result.descriptionsShortened > 0);
  assert.ok(result.catalogOmittedCount > 0);
  assert.deepEqual(result.entries.map((entry) => entry.name), [...result.entries.map((entry) => entry.name)].sort());
});

test("implicit catalog excludes explicit-only and dependency-unverified Skills", () => {
  assert.ok(catalog);
  const explicitOnly = { ...skill(1), implicitInvocation: false, implicitEligible: false };
  const dependency = { ...skill(2), requirementsState: "declared_unverified", implicitEligible: false };
  const ready = skill(3);
  const result = catalog.buildSkillCatalog([explicitOnly, dependency, ready], 8_000);
  assert.deepEqual(result.entries.map((entry) => entry.name), [ready.name]);
  assert.equal(result.ineligibleCount, 2);
});

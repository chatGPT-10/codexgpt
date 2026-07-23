import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { parseOpenAISkillMetadata } = await tsImport("../src/guidance/openaiSkillMetadata.ts", import.meta.url);
const { buildSkillCatalog } = await tsImport("../src/guidance/skillCatalog.ts", import.meta.url);

function record(name, companion) {
  return {
    name, description: `${name} description`, source: "workspace", path: `$WORKSPACE/.agents/skills/${name}/SKILL.md`,
    compatibility: null, loadable: true, implicitInvocation: companion.implicitInvocation,
    requirementsState: companion.requirementsState,
    implicitEligible: companion.implicitInvocation && companion.requirementsState === "none",
    specCompliant: true, legacyParse: false, metadataRedacted: false, proximity: 0,
    warnings: [], absPath: "not-public", root: "not-public"
  };
}

test("implicit catalog excludes explicit-only and dependency-unverified Skills", () => {
  const implicit = parseOpenAISkillMetadata("policy:\n  allow_implicit_invocation: true\n");
  const explicitOnly = parseOpenAISkillMetadata("policy:\n  allow_implicit_invocation: false\n");
  const dependency = parseOpenAISkillMetadata("dependencies:\n  tools: [git]\n");
  assert.ok(implicit && explicitOnly && dependency);
  const catalog = buildSkillCatalog([
    record("implicit", implicit),
    record("explicit-only", explicitOnly),
    record("dependency", dependency)
  ]);
  assert.deepEqual(catalog.entries.map((item) => item.name), ["implicit"]);
  assert.equal(catalog.ineligibleCount, 2);
});

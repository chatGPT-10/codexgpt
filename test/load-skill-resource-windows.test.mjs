import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { normalizeSkillResourcePath } = await tsImport("../src/guidance/skillResources.ts", import.meta.url);

test("Skill resource normalization is deterministic for Windows input", () => {
  assert.equal(normalizeSkillResourcePath(".\\references\\guide.md"), "references/guide.md");
  assert.throws(() => normalizeSkillResourcePath("references\\guide.md:stream"), /SKILL_RESOURCE_BOUNDARY_VIOLATION/);
  assert.throws(() => normalizeSkillResourcePath("C:\\outside.txt"), /SKILL_RESOURCE_BOUNDARY_VIOLATION/);
});

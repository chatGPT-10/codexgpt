import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { discoverInstructions } = await tsImport("../src/guidance/instructions.ts", import.meta.url);
const { discoverTargetSkills, resolveExactWorkspaceSkill } = await tsImport("../src/guidance/skillDiscovery.ts", import.meta.url);

test("one target binding drives both instruction and Skill resolution", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-integration-")));
  try {
    const target = "module/src/file.ts";
    const skillDir = path.join(root, "module", ".agents", "skills", "module-flow");
    await fs.mkdir(path.join(root, "module", "src"), { recursive: true });
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(root, "module", "AGENTS.md"), "module rules");
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: module-flow\ndescription: Module workflow\n---\nBODY");
    const instructions = await discoverInstructions({ root, targetPath: target, maxFileBytes: 60_000, maxTotalBytes: 32_768, blockedGlobs: [] });
    const skills = await discoverTargetSkills({ root, targetPath: target, maxCandidates: 100, maxSkills: 100, blockedGlobs: [] });
    assert.deepEqual(instructions.files.map((item) => item.path), ["module/AGENTS.md"]);
    assert.deepEqual(skills.skills.map((item) => item.name), ["module-flow"]);
    const exact = await resolveExactWorkspaceSkill({ root, targetPath: target, selector: skills.skills[0].path, blockedGlobs: [] });
    assert.equal(exact.name, "module-flow");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { discoverExplicitGlobalSkills, resolveExactGlobalSkill } = await tsImport("../src/guidance/skillDiscovery.ts", import.meta.url);

test("configured global Skill discovery exposes only sanitized opt-in selectors", async () => {
  const codexDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-global-privacy-")));
  const skillDir = path.join(codexDir, "skills", "private-root");
  try {
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: private-root\ndescription: Private root without absolute disclosure\n---\nBody");
    const result = await discoverExplicitGlobalSkills({ codexDir, maxCandidates: 100, maxSkills: 100, blockedGlobs: [] });
    const skill = result.skills.find((item) => item.name === "private-root");
    assert.ok(skill);
    assert.equal(skill.path, "$CODEX_DIR/skills/private-root/SKILL.md");
    assert.equal(JSON.stringify({ ...skill, absPath: undefined, root: undefined }).includes(codexDir), false);
    const exact = await resolveExactGlobalSkill({ codexDir, selector: skill.path, blockedGlobs: [] });
    assert.equal(exact.name, "private-root");
  } finally {
    await fs.rm(codexDir, { recursive: true, force: true });
  }
});

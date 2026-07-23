import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { discoverTargetSkills } = await tsImport("../src/guidance/skillDiscovery.ts", import.meta.url);
const { loadSkillResource } = await tsImport("../src/guidance/skillResources.ts", import.meta.url);

test("discovering and reading a Skill never executes its scripts or package hooks", async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "phase6-no-exec-"));
  const root = await fs.realpath(created);
  const skillRoot = path.join(root, ".agents", "skills", "canary");
  const marker = path.join(root, "executed.txt");
  try {
    await fs.mkdir(path.join(skillRoot, "scripts"), { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: canary\ndescription: Execution canary\n---\nDo not execute scripts.");
    await fs.writeFile(path.join(skillRoot, "scripts", "canary.ps1"), `Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value executed`);
    await fs.writeFile(path.join(skillRoot, "package.json"), JSON.stringify({ scripts: { install: "node -e process.exit(99)" } }));
    const discovered = await discoverTargetSkills({ root, targetPath: ".", maxCandidates: 10, maxSkills: 10, blockedGlobs: [] });
    assert.equal(discovered.skills[0]?.name, "canary");
    const script = await loadSkillResource({ root, skillRoot, resourcePath: "scripts/canary.ps1", maxBytes: 10_000, blockedGlobs: [] });
    assert.match(script.text, /Set-Content/);
    await assert.rejects(() => fs.stat(marker), { code: "ENOENT" });
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
});

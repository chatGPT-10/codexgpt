import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const discovery = await tsImport("../src/guidance/skillDiscovery.ts", import.meta.url).catch(() => null);

async function addSkill(root, relativeDir, name, description = name) {
  const dir = path.join(root, relativeDir, ".agents", "skills", name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
}

async function withRoot(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-skill-discovery-"));
  const root = await fs.realpath(created);
  try { return await callback(root); } finally { await fs.rm(created, { recursive: true, force: true }); }
}

test("target Skill discovery walks closest target directory through workspace root", async () => {
  assert.ok(discovery);
  await withRoot(async (root) => {
    await fs.mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
    await addSkill(root, ".", "root-skill");
    await addSkill(root, path.join("packages", "app"), "app-skill");
    const result = await discovery.discoverTargetSkills({
      root,
      targetPath: "packages/app/src/file.ts",
      maxCandidates: 100,
      maxSkills: 100,
      blockedGlobs: [".env", ".env.*"]
    });
    assert.deepEqual(result.skills.map((item) => item.name), ["app-skill", "root-skill"]);
    assert.equal(result.candidateCount, 2);
    assert.equal(result.validCount, 2);
    assert.equal(result.invalidCount, 0);
    assert.equal(result.scanComplete, true);
    assert.match(result.skills[0].path, /^\$WORKSPACE\//);
  });
});

test("invalid candidates do not consume the returned Skill allowance", async () => {
  assert.ok(discovery);
  await withRoot(async (root) => {
    const base = path.join(root, ".agents", "skills");
    await fs.mkdir(path.join(base, "a-invalid"), { recursive: true });
    await fs.writeFile(path.join(base, "a-invalid", "SKILL.md"), "not-frontmatter");
    await addSkill(root, ".", "z-valid");
    const result = await discovery.discoverTargetSkills({ root, targetPath: ".", maxCandidates: 10, maxSkills: 1, blockedGlobs: [] });
    assert.deepEqual(result.skills.map((item) => item.name), ["z-valid"]);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.scanComplete, true);
  });
});

test("scan truncation is truthful and exact path resolution remains direct", async () => {
  assert.ok(discovery);
  await withRoot(async (root) => {
    await addSkill(root, ".", "a-skill");
    await addSkill(root, ".", "b-skill");
    const result = await discovery.discoverTargetSkills({ root, targetPath: ".", maxCandidates: 1, maxSkills: 10, blockedGlobs: [] });
    assert.equal(result.scanTruncated, true);
    assert.equal(result.scanComplete, false);
    const exact = await discovery.resolveExactWorkspaceSkill({ root, targetPath: ".", selector: "$WORKSPACE/.agents/skills/b-skill/SKILL.md", blockedGlobs: [] });
    assert.equal(exact.name, "b-skill");
  });
});

test("configured global discovery bounds inspected entries even when they contain no Skill files", async () => {
  assert.ok(discovery);
  const codexDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-global-scan-bound-")));
  try {
    for (let index = 0; index < 20; index += 1) {
      await fs.mkdir(path.join(codexDir, "skills", `empty-${String(index).padStart(2, "0")}`), { recursive: true });
    }
    const result = await discovery.discoverExplicitGlobalSkills({ codexDir, maxCandidates: 5, maxSkills: 5, blockedGlobs: [] });
    assert.equal(result.scanTruncated, true);
    assert.equal(result.candidateCount, 0);
  } finally {
    await fs.rm(codexDir, { recursive: true, force: true });
  }
});

test("automatic Skill discovery never exposes secret-looking selector paths", async () => {
  assert.ok(discovery);
  await withRoot(async (root) => {
    const secretSegment = `ghp_${"a".repeat(32)}`;
    const dir = path.join(root, ".agents", "skills", secretSegment);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "---\nname: safe-name\ndescription: Safe description\n---\nBody");
    const result = await discovery.discoverTargetSkills({ root, targetPath: ".", maxCandidates: 10, maxSkills: 10, blockedGlobs: [] });
    assert.equal(result.skills.length, 0);
    assert.equal(result.diagnostics[0]?.code, "SKILL_PATH_REDACTED");
    assert.equal(JSON.stringify(result).includes(secretSegment), false);
  });
});

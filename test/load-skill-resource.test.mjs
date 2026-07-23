import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const resources = await tsImport("../src/guidance/skillResources.ts", import.meta.url).catch(() => null);

async function withSkill(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-skill-resource-"));
  const root = await fs.realpath(created);
  const skillRoot = path.join(root, ".agents", "skills", "demo");
  await fs.mkdir(path.join(skillRoot, "references"), { recursive: true });
  await fs.mkdir(path.join(skillRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: demo\ndescription: Demo\n---\n# Demo\n");
  await fs.writeFile(path.join(skillRoot, "references", "guide.md"), "guide");
  await fs.writeFile(path.join(skillRoot, "scripts", "check.ps1"), "Write-Output ok");
  try { return await callback(root, skillRoot); } finally { await fs.rm(created, { recursive: true, force: true }); }
}

test("resource selector normalizes Windows separators and returns bounded text", async () => {
  assert.ok(resources);
  await withSkill(async (root, skillRoot) => {
    const result = await resources.loadSkillResource({ root, skillRoot, resourcePath: ".\\references\\guide.md", maxBytes: 100, blockedGlobs: [".env", ".env.*"] });
    assert.equal(result.path, "references/guide.md");
    assert.equal(result.text, "guide");
  });
});

test("resource index is path-only, bounded, and limited to known directories", async () => {
  assert.ok(resources);
  await withSkill(async (root, skillRoot) => {
    await fs.writeFile(path.join(skillRoot, "ignored.txt"), "ignored");
    const result = await resources.indexSkillResources({ root, skillRoot, maxEntries: 10, blockedGlobs: [] });
    assert.deepEqual(result.paths, ["references/guide.md", "scripts/check.ps1"]);
    assert.equal(result.truncated, false);
  });
});

test("resource loading blocks traversal and secret paths before reading", async () => {
  assert.ok(resources);
  await withSkill(async (root, skillRoot) => {
    await fs.writeFile(path.join(skillRoot, "references", ".env"), "SECRET=value");
    await assert.rejects(() => resources.loadSkillResource({ root, skillRoot, resourcePath: "../SKILL.md", maxBytes: 100, blockedGlobs: [".env", ".env.*"] }), /SKILL_RESOURCE_BOUNDARY_VIOLATION/);
    await assert.rejects(() => resources.loadSkillResource({ root, skillRoot, resourcePath: "references/.env", maxBytes: 100, blockedGlobs: [".env", ".env.*"] }), /SKILL_RESOURCE_BLOCKED/);
  });
});

test("resource indexing bounds directory-only scans and does not follow cycles forever", async () => {
  assert.ok(resources);
  await withSkill(async (root, skillRoot) => {
    for (let index = 0; index < 20; index += 1) {
      await fs.mkdir(path.join(skillRoot, "references", `empty-${String(index).padStart(2, "0")}`));
    }
    if (process.platform === "win32") {
      await fs.symlink(path.join(skillRoot, "references"), path.join(skillRoot, "references", "cycle"), "junction");
    }
    const result = await resources.indexSkillResources({ root, skillRoot, maxEntries: 2, blockedGlobs: [] });
    assert.equal(result.truncated, true);
    assert.ok(result.paths.length <= 2);
  });
});

test("resource paths that resemble credentials are neither indexed nor returned in errors", async () => {
  assert.ok(resources);
  await withSkill(async (root, skillRoot) => {
    const secretName = `ghp_${"b".repeat(32)}.md`;
    await fs.writeFile(path.join(skillRoot, "references", secretName), "not a credential");
    const index = await resources.indexSkillResources({ root, skillRoot, maxEntries: 10, blockedGlobs: [] });
    assert.equal(JSON.stringify(index).includes(secretName), false);
    await assert.rejects(() => resources.loadSkillResource({ root, skillRoot, resourcePath: `references/${secretName}`, maxBytes: 1_000, blockedGlobs: [] }), /SKILL_RESOURCE_BLOCKED/);
  });
});

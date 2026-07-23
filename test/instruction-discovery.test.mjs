import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const instructions = await tsImport("../src/guidance/instructions.ts", import.meta.url).catch(() => null);

async function withRoot(callback) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-instructions-"));
  const root = await fs.realpath(created);
  try { return await callback(root); } finally { await fs.rm(created, { recursive: true, force: true }); }
}

test("instruction discovery selects one file per directory in root-to-target order", async () => {
  assert.ok(instructions);
  await withRoot(async (root) => {
    await fs.mkdir(path.join(root, "src", "feature"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "root");
    await fs.writeFile(path.join(root, "src", "AGENTS.md"), "src");
    await fs.writeFile(path.join(root, "src", "AGENTS.override.md"), "override");
    await fs.writeFile(path.join(root, "src", "feature", "agents.md"), "feature");
    const result = await instructions.discoverInstructions({
      root,
      targetPath: "src/feature/file.ts",
      fallbackNames: ["agents.md", ".agents.md"],
      maxFileBytes: 60_000,
      maxTotalBytes: 32_768,
      blockedGlobs: [".env", ".env.*"]
    });
    assert.equal(result.targetKind, "missing");
    assert.deepEqual(result.files.map((item) => item.path), [
      "AGENTS.md",
      "src/AGENTS.override.md",
      "src/feature/agents.md"
    ]);
    assert.deepEqual(result.files.map((item) => item.text), ["root", "override", "feature"]);
    assert.deepEqual(result.diagnostics, []);
  });
});

test("empty instruction falls through but a broken higher-precedence candidate does not", async () => {
  assert.ok(instructions);
  await withRoot(async (root) => {
    await fs.writeFile(path.join(root, "AGENTS.override.md"), "   \n");
    await fs.writeFile(path.join(root, "AGENTS.md"), "canonical");
    let result = await instructions.discoverInstructions({ root, targetPath: ".", maxFileBytes: 100, maxTotalBytes: 100, blockedGlobs: [] });
    assert.deepEqual(result.files.map((item) => item.path), ["AGENTS.md"]);

    await fs.writeFile(path.join(root, "AGENTS.override.md"), Buffer.from([65, 0, 66]));
    result = await instructions.discoverInstructions({ root, targetPath: ".", maxFileBytes: 100, maxTotalBytes: 100, blockedGlobs: [] });
    assert.deepEqual(result.files, []);
    assert.equal(result.diagnostics[0].code, "INSTRUCTION_NOT_TEXT");
  });
});

test("combined budget returns only complete prefix files", async () => {
  assert.ok(instructions);
  await withRoot(async (root) => {
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "AGENTS.md"), "1234");
    await fs.writeFile(path.join(root, "nested", "AGENTS.md"), "5678");
    const result = await instructions.discoverInstructions({ root, targetPath: "nested", maxFileBytes: 100, maxTotalBytes: 6, blockedGlobs: [] });
    assert.deepEqual(result.files.map((item) => item.text), ["1234"]);
    assert.equal(result.diagnostics[0].code, "INSTRUCTION_TOTAL_BUDGET_EXCEEDED");
    assert.equal(result.complete, false);
  });
});

test("fallback basenames are bounded and Windows-safe", () => {
  assert.ok(instructions);
  assert.deepEqual(instructions.validateInstructionFallbacks(undefined), ["agents.md", ".agents.md"]);
  assert.throws(() => instructions.validateInstructionFallbacks(["nested/AGENTS.md"]));
  assert.throws(() => instructions.validateInstructionFallbacks(["alpha.md", "ALPHA.md"]));
  assert.throws(() => instructions.validateInstructionFallbacks(Array.from({ length: 9 }, (_, i) => `a${i}.md`)));
});

test("instruction discovery rejects a secret-looking target path before provenance output", async () => {
  assert.ok(instructions);
  await withRoot(async (root) => {
    const secretTarget = `ghp_${"c".repeat(32)}`;
    await fs.mkdir(path.join(root, secretTarget));
    await assert.rejects(() => instructions.discoverInstructions({
      root,
      targetPath: secretTarget,
      maxFileBytes: 60_000,
      maxTotalBytes: 32_768,
      blockedGlobs: []
    }), /blocked by safety rules/);
  });
});

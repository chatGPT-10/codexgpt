import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { discoverInstructions } = await tsImport("../src/guidance/instructions.ts", import.meta.url);

test("instruction discovery binds a Windows-style target to the same root-to-target chain", async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "phase6-instructions-win-"));
  const root = await fs.realpath(created);
  try {
    await fs.mkdir(path.join(root, "pkg", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "root rules");
    await fs.writeFile(path.join(root, "pkg", "AGENTS.md"), "package rules");
    const result = await discoverInstructions({ root, targetPath: "pkg\\src\\file.ts", maxFileBytes: 60_000, maxTotalBytes: 32_768, blockedGlobs: [] });
    assert.deepEqual(result.files.map((item) => item.path), ["AGENTS.md", "pkg/AGENTS.md"]);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
});

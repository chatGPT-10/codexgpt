import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { readGuidanceText } = await tsImport("../src/guidance/safeTextReader.ts", import.meta.url);

test("safe guidance reader accepts Windows separators but rejects ADS syntax", async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "phase6-safe-reader-win-"));
  const root = await fs.realpath(created);
  try {
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "AGENTS.md"), "nested rules");
    const loaded = await readGuidanceText({ root, relativePath: "nested\\AGENTS.md", maxBytes: 1_000, blockedGlobs: [] });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.text, "nested rules");
    const ads = await readGuidanceText({ root, relativePath: "nested\\AGENTS.md:secret", maxBytes: 1_000, blockedGlobs: [] });
    assert.equal(ads.ok, false);
    assert.equal(ads.reason, "READ_BOUNDARY_VIOLATION");
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
});

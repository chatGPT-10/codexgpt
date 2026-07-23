import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("public help keeps source-checkout users on the supported entry layer", async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["scripts/codexgpt-entry.mjs", "--help"],
    { cwd: process.cwd(), windowsHide: true }
  );
  const output = `${stdout}\n${stderr}`;

  assert.match(
    output,
    /node\s+["']?(?:\.?[\\/])?scripts[\\/]codexgpt-entry\.mjs["']?\s+--root\b[^\r\n]*\s--tunnel\s+cloudflare\b/i,
    "source-checkout help must name the supported public entry"
  );
  assert.doesNotMatch(
    output,
    /node\s+["']?(?:\.?[\\/])?scripts[\\/]codexgpt\.mjs["']?(?:\s|$)/i,
    "public help must not recommend bypassing entry-layer protections"
  );

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(
    packageJson.bin?.codexgpt,
    "scripts/codexgpt-entry.mjs",
    "the published codexgpt command must use the supported public entry"
  );
});

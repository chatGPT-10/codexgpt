import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function npmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(npmCli, `Unable to locate npm CLI. Checked: ${candidates.join(", ")}`);
  return npmCli;
}

test("published package keeps website assets but excludes internal memory archives", () => {
  const result = spawnSync(process.execPath, [npmCliPath(), "pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true
  });

  assert.equal(result.status, 0, `npm pack failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.length, 1);
  const files = report[0].files.map((entry) => entry.path.replaceAll("\\", "/"));

  assert.ok(files.includes("docs/index.html"), "Published package must retain the documentation website");
  assert.equal(
    files.some((file) => file.startsWith("docs/memory/")),
    false,
    "Published package must not contain internal project memory"
  );
});

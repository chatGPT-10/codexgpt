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

test("public repository metadata points to the current fork while Pages stays on the existing host", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert.equal(pkg.repository.url, "git+https://github.com/chatGPT-10/codexgpt.git");
  assert.equal(pkg.bugs.url, "https://github.com/chatGPT-10/codexgpt/issues");
  assert.equal(pkg.homepage, "https://rebel0789.github.io/codexpro/");

  for (const relativePath of ["README.md", "README_ZH.md", "docs/index.html", "docs/zh.html", "src/http.ts"]) {
    const source = fs.readFileSync(path.resolve(relativePath), "utf8");
    assert.equal(
      source.includes("https://github.com/rebel0789/codexpro"),
      false,
      `${relativePath} still points repository links at the former upstream location`
    );
  }
  assert.match(fs.readFileSync(path.resolve("README.md"), "utf8"), /https:\/\/rebel0789\.github\.io\/codexpro\//);
  assert.match(fs.readFileSync(path.resolve("src\/http.ts"), "utf8"), /const docsUrl = "https:\/\/rebel0789\.github\.io\/codexpro\/";/);
});

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

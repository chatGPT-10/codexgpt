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
  for (const requiredGateRFile of [
    "dist/git/durableState.js",
    "dist/git/locks.js",
    "dist/git/objectQuarantine.js",
    "dist/git/operationStore.js",
    "dist/git/recovery.js",
    "dist/git/repositoryStore.js",
    "dist/git/resources.js",
    "dist/audit/lifecycleV4.js"
  ]) {
    assert.ok(files.includes(requiredGateRFile), `Published package must retain ${requiredGateRFile}`);
  }
  for (const requiredNativeHostFile of [
    "scripts/windows-conpty-probe-child.mjs",
    "scripts/windows-conpty-worker.ps1",
    "scripts/windows-local-control-spike.cs",
    "scripts/windows-local-control-spike.mjs",
    "scripts/windows-local-control-spike.ps1",
    "scripts/windows-local-control.cs",
    "scripts/windows-local-control.ps1",
    "scripts/windows-local-control-manifest.json",
    "scripts/windows-native-api-inventory-v1.json",
    "scripts/windows-process-host-manifest.json",
    "scripts/windows-process-host-protocol-v1.json",
    "scripts/windows-process-host.cs",
    "scripts/windows-process-host.ps1"
  ]) {
    assert.ok(files.includes(requiredNativeHostFile), `Published package must retain ${requiredNativeHostFile}`);
  }
  for (const internalSpikeFile of [
    "scripts/git-capability-spike.mjs",
    "scripts/worktree-delete-control.mjs",
    "scripts/git-execution-manifest-v1.json",
    "scripts/windows-process-host-spike.mjs",
    "scripts/windows-sandbox-attack-probe.cs",
    "scripts/windows-sandbox-cleanup.ps1",
    "scripts/windows-sandbox-evidence.mjs",
    "scripts/windows-sandbox-spike.cs",
    "scripts/windows-sandbox-spike.mjs",
    "scripts/windows-sandbox-spike.ps1"
  ]) {
    assert.equal(files.includes(internalSpikeFile), false, `Published package must exclude ${internalSpikeFile}`);
  }
  assert.equal(
    files.some((file) => file.startsWith("fixtures/sandbox-attacks/")),
    false,
    "Published package must exclude Gate-S attack fixtures"
  );
  assert.equal(
    files.some((file) => file.startsWith("fixtures/git-")),
    false,
    "Published package must exclude private Gate-G0 canary fixtures"
  );
  assert.equal(
    files.some((file) => file.startsWith("fixtures/ts-imports/")),
    false,
    "Published package must exclude test-only TypeScript import barrels"
  );
  assert.equal(
    files.some((file) => file.startsWith("docs/memory/")),
    false,
    "Published package must not contain internal project memory"
  );
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const testRoot = fileURLToPath(new URL("./", import.meta.url));

async function listTestModules(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const modules = [];
  for (const entry of entries) {
    const relativePath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      modules.push(...await listTestModules(path.join(directory, entry.name), `${relativePath}/`));
    } else if (entry.name.endsWith(".mjs")) {
      modules.push(relativePath);
    }
  }
  return modules;
}

function jobBlock(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.notEqual(start, -1, `Missing ${jobName} CI job`);
  const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : workflow.length;
  return workflow.slice(start, end === -1 ? workflow.length : end);
}

function stepBlock(job, stepName) {
  const start = job.indexOf(`      - name: ${stepName}`);
  assert.notEqual(start, -1, `Missing ${stepName} step`);
  const end = job.indexOf("      - name:", start + 1);
  return job.slice(start, end === -1 ? job.length : end);
}

test("CI classifies changes, always enforces policy, and bounds full-matrix logs", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
  const workflowDocument = parseDocument(workflow, { uniqueKeys: true });
  assert.deepEqual(
    workflowDocument.errors.map((error) => error.message),
    [],
    "CI workflow must remain valid YAML without duplicate keys"
  );
  const classify = jobBlock(workflow, "classify", "policy");
  const policy = jobBlock(workflow, "policy", "ubuntu");
  const ubuntu = jobBlock(workflow, "ubuntu", "windows");
  const windows = jobBlock(workflow, "windows");

  assert.match(classify, /fetch-depth:\s*0/, "change classification requires full base/head history");
  assert.match(classify, /scripts\/ci-change-classifier\.mjs/);
  assert.match(policy, /needs:\s*classify/);
  assert.match(policy, /run:\s*npm run policy:check/);
  assert.match(policy, /test\/mutation-architecture\.test\.mjs/);
  assert.match(policy, /test\/operational-reliability\.test\.mjs/);
  assert.match(policy, /test\/test-domain-classification\.test\.mjs/);
  assert.match(policy, /test\/read-contract\.test\.mjs/);
  assert.match(policy, /test\/package-contents\.test\.mjs/);
  assert.match(
    stepBlock(policy, "Check package contents"),
    /run:\s*npm pack --dry-run\s*(?:\r?\n|$)/,
    "the central package gate must exercise the real prepack lifecycle"
  );
  assert.doesNotMatch(stepBlock(policy, "Check package contents"), /--ignore-scripts/);
  const packageMetadata = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageMetadata.scripts.prepack, "npm run build");

  for (const [name, block] of [["Ubuntu", ubuntu], ["Windows", windows]]) {
    const regression = stepBlock(block, "Regression Tests");
    const packageManifest = stepBlock(block, "Check package manifest");
    assert.match(block, /needs:\s*classify/, `${name} CI must depend on change classification`);
    assert.match(block, /if:\s*needs\.classify\.outputs\.runtime == 'true'/, `${name} full matrix must be runtime-only`);
    assert.match(
      regression,
      /scripts\/run-and-summarize\.mjs[^\r\n]*-- node scripts\/test-domains\.mjs run --domain all --performance/,
      `${name} CI must run the complete authoritative test domain through the bounded summary wrapper`
    );
    assert.match(regression, /id:\s*regression/);
    assert.match(
      block,
      /scripts\/run-and-summarize\.mjs[^\r\n]*-- npm run smoke/,
      `${name} CI must run the complete smoke suite through the bounded summary wrapper`
    );
    assert.match(block, /actions\/upload-artifact@v7\.0\.1/, `${name} CI must upload bounded failure evidence`);
    assert.match(packageManifest, /run:\s*npm pack --dry-run --ignore-scripts/);
    assert.ok(block.indexOf("      - name: Build") < block.indexOf("      - name: Check package manifest"));
    assert.ok(block.indexOf("      - name: Check package manifest") < block.indexOf("      - name: Regression Tests"));
    const performanceSteps = [...block.matchAll(/      - name: Upload performance report(?: \(legacy\))?[\s\S]*?(?=\n      - name:|\s*$)/g)]
      .map((match) => match[0]);
    assert.ok(performanceSteps.length >= 1);
    for (const performance of performanceSteps) {
      assert.match(performance, /if:\s*\$\{\{ !cancelled\(\) && steps\.regression\.outcome == 'success'/);
      assert.match(performance, /name:\s*ci-performance-[^\r\n]*-attempt-\$\{\{ github\.run_attempt \}\}/);
      assert.doesNotMatch(performance, /\.ai-bridge\/performance\/\*\.json/);
      assert.match(performance, /include-hidden-files:\s*true/);
      assert.match(performance, /if-no-files-found:\s*error/);
      assert.match(performance, /retention-days:\s*14/);
    }
    if (name === "Windows") {
      assert.match(block, /CODEXGPT_TEST_TOPOLOGY:\s*\$\{\{ vars\.CODEXGPT_TEST_TOPOLOGY \|\| 'layered' \}\}/);
      const reportVerification = stepBlock(block, "Verify Windows performance reports");
      assert.match(reportVerification, /id:\s*performance_reports/);
      assert.match(reportVerification, /if:\s*\$\{\{ !cancelled\(\) && steps\.regression\.outcome == 'success' \}\}/);
      assert.match(reportVerification, /\$env:CODEXGPT_TEST_TOPOLOGY -eq 'legacy'/);
      assert.match(reportVerification, /@\('main'\)/);
      assert.match(reportVerification, /@\('fast', 'safe', 'isolated'\)/);
      assert.match(reportVerification, /Test-Path -LiteralPath \$report -PathType Leaf/);
      assert.match(reportVerification, /throw "Missing required performance report: \$report"/);
      const layeredPerformance = stepBlock(block, "Upload performance report");
      for (const shard of ["fast", "safe", "isolated"]) {
        assert.match(
          layeredPerformance,
          new RegExp(`\\.ai-bridge/performance/test-performance-all-${shard}-win32-node\\$\\{\\{ matrix\\.node-version \\}\\}\\.json`)
        );
      }
      assert.match(layeredPerformance, /env\.CODEXGPT_TEST_TOPOLOGY != 'legacy'/);
      assert.match(layeredPerformance, /steps\.performance_reports\.outcome == 'success'/);
      const legacyPerformance = stepBlock(block, "Upload performance report (legacy)");
      assert.match(legacyPerformance, /test-performance-all-main-win32-node\$\{\{ matrix\.node-version \}\}\.json/);
      assert.match(legacyPerformance, /env\.CODEXGPT_TEST_TOPOLOGY == 'legacy'/);
      assert.match(legacyPerformance, /steps\.performance_reports\.outcome == 'success'/);
    } else {
      const performance = performanceSteps[0];
      assert.match(performance, /\.ai-bridge\/performance\/test-performance-all-main-linux-node\$\{\{ matrix\.node-version \}\}\.json/);
      assert.match(performance, /\.ai-bridge\/performance\/test-performance-all-serial-linux-node\$\{\{ matrix\.node-version \}\}\.json/);
    }
    assert.match(block, /retention-days:\s*14/, `${name} CI failure logs must have bounded retention`);
    assert.match(block, /- name:\s*Build[\s\S]*?run:\s*npm run build/);
  }

  assert.doesNotMatch(
    windows,
    /node scripts\/settings-smoke\.mjs(?:\s|$)/,
    "Windows CI must not bypass the platform compatibility wrapper"
  );
});

test("Node test discovery contains only test modules and the reviewed Phase 8 helpers under test", async () => {
  const modules = await listTestModules(testRoot);
  const reviewedHelpers = new Set([
    "phase-8-auth-test-helpers.mjs",
    "phase-8-token-test-helpers.mjs"
  ]);
  const nonTests = modules.filter((relativePath) => (
    !relativePath.endsWith(".test.mjs") && !reviewedHelpers.has(relativePath)
  ));
  assert.deepEqual(nonTests, [], `move unreviewed executable fixtures outside test/: ${nonTests.join(", ")}`);
});

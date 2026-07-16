import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("CI classifies changes, always enforces policy, and bounds full-matrix logs", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
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

  for (const [name, block] of [["Ubuntu", ubuntu], ["Windows", windows]]) {
    assert.match(block, /needs:\s*classify/, `${name} CI must depend on change classification`);
    assert.match(block, /if:\s*needs\.classify\.outputs\.runtime == 'true'/, `${name} full matrix must be runtime-only`);
    assert.match(
      block,
      /scripts\/run-and-summarize\.mjs[^\r\n]*-- node --test/,
      `${name} CI must run complete Node test discovery through the bounded summary wrapper`
    );
    assert.match(
      block,
      /scripts\/run-and-summarize\.mjs[^\r\n]*-- npm run smoke/,
      `${name} CI must run the complete smoke suite through the bounded summary wrapper`
    );
    assert.match(block, /actions\/upload-artifact@v7\.0\.1/, `${name} CI must upload bounded failure evidence`);
    assert.match(block, /retention-days:\s*14/, `${name} CI failure logs must have bounded retention`);
  }

  assert.doesNotMatch(
    windows,
    /node scripts\/settings-smoke\.mjs(?:\s|$)/,
    "Windows CI must not bypass the platform compatibility wrapper"
  );
});

test("Node test discovery contains only test modules under test", async () => {
  const modules = await listTestModules(testRoot);
  const nonTests = modules.filter((relativePath) => !relativePath.endsWith(".test.mjs"));
  assert.deepEqual(nonTests, [], `move executable fixtures outside test/: ${nonTests.join(", ")}`);
});

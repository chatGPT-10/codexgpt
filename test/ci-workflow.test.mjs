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

test("Ubuntu and Windows CI run the complete regression and smoke suites", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
  const ubuntu = jobBlock(workflow, "ubuntu", "windows");
  const windows = jobBlock(workflow, "windows");

  for (const [name, block] of [["Ubuntu", ubuntu], ["Windows", windows]]) {
    assert.match(block, /run:\s*node --test\s*(?:\r?\n|$)/, `${name} CI must use Node test discovery without shell-expanded paths`);
    assert.match(block, /run:\s*npm run smoke/, `${name} CI must run the complete smoke suite`);
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

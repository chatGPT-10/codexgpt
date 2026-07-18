import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_V4_CHILD_TOOLS } from "../dist/tools/contracts/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relative) {
  return fs.readFile(path.join(root, relative), "utf8");
}

test("Phase 5 safe builders contain no checkout-oriented, remote, force, credential, or destructive porcelain", async () => {
  const files = [
    "src/git/branchService.ts",
    "src/git/indexService.ts",
    "src/git/commitService.ts",
    "src/git/restoreService.ts",
    "src/git/stashService.ts",
    "src/worktrees/manager.ts",
    "src/worktrees/mergePrepare.ts",
    "src/worktrees/mergeExecute.ts",
    "src/worktrees/remove.ts"
  ];
  const text = (await Promise.all(files.map(source))).join("\n");
  const prohibited = /[\[,]\s*["'](?:checkout|switch|reset|clean|merge|pull|push|fetch|clone|remote|credential)["']/gu;
  assert.equal(prohibited.test('["checkout", "--force"]'), true, "positive control");
  prohibited.lastIndex = 0;
  assert.deepEqual([...text.matchAll(prohibited)].map((match) => match[0]), []);
  assert.equal(/\bshell\s*:\s*true\b/u.test(text), false);
  assert.equal(text.includes("refs/stash"), false);
  assert.equal(text.includes("worktree\", \"remove"), false);
});

test("Phase 5 public contract has no remote, force, arbitrary-command, branch-delete, or GC tool", () => {
  const forbidden = /(remote|push|pull|fetch|force|credential|arbitrary|delete_branch|reset|clean|gc)/iu;
  assert.deepEqual(CONTRACT_V4_CHILD_TOOLS.filter((name) => forbidden.test(name)), []);
  assert.equal(CONTRACT_V4_CHILD_TOOLS.length, 51);
});

test("supported launch paths bootstrap V4 Git before connect and Gate X fails closed without automatic full_access hosting", async () => {
  const [stdio, http, runtime, execution, policy] = await Promise.all([
    source("src/stdio.ts"),
    source("src/http.ts"),
    source("src/productionRuntime.ts"),
    source("src/git/execution.ts"),
    source("src/policy/runtime.ts")
  ]);
  for (const text of [stdio, http]) {
    assert.match(text, /createProductionGitBootstrapV4/u);
    assert.match(text, /connectProductionCodexProServer/u);
  }
  assert.match(runtime, /await productionRuntimes\.get\(server\)\?\.startup\(\)/u);
  assert.match(runtime, /Approved repository integrations require the automatic Git bootstrap and full_access host/u);
  assert.deepEqual(
    [...execution.matchAll(/operation:\s*"(stage|commit|merge_tree|checkout_index)"/gu)].map((match) => match[1]),
    ["stage", "commit", "merge_tree", "checkout_index"]
  );
  assert.match(execution, /else if \(request\.operation === "checkout_index"\)/u);
  assert.match(execution, /objectDirectoryPath = safePrivatePath\(request\.objectDirectoryPath, this\.#tempRoot\);\s*if \(!objectDirectoryPath\) throw gitError\("GIT_REPOSITORY_UNSAFE"\)/u);
  assert.match(execution, /privateIndexPath = safePrivatePath\(request\.privateIndexPath, this\.#tempRoot\);\s*const destination = safePrivatePath\(request\.destinationPrefix, this\.#tempRoot\);\s*if \(!privateIndexPath \|\| !destination\) throw gitError\("GIT_REPOSITORY_UNSAFE"\)/u);
  assert.match(execution, /throw gitError\("GIT_CAPABILITY_UNAVAILABLE"\)/u);
  assert.doesNotMatch(execution, /request\.(?:args|command|subcommand)/u);
  assert.match(policy, /executionDisplay\.kind === "git_v4" &&\s*executionDisplay\.integrationMode === "approved_full_access"/u);
  assert.match(policy, /approved Git integration: ambient current-user full_access; no filesystem, credential, registry, network, or broker isolation; typed operation only/u);
});

test("Phase 5 public documentation states the workflow and isolation boundaries", async () => {
  const [readme, readmeZh, security, design] = await Promise.all([
    source("README.md"),
    source("README_ZH.md"),
    source("SECURITY.md"),
    source("design.md")
  ]);
  for (const text of [readme, security]) {
    assert.match(text, /not an OS sandbox/u);
    assert.match(text, /branch, commits, (?:and )?private stashes/u);
    assert.match(text, /Merge preparation|merge preparation/u);
    assert.match(text, /external Git processes|unrelated Git processes/u);
  }
  assert.match(readmeZh, /不是操作系统 sandbox/u);
  assert.match(readmeZh, /保留 branch、commit 和私有 stash/u);
  assert.match(design, /workflow isolation rather than process or credential isolation/u);
});

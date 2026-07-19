import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("real sparse checkout prevents V4 mutation token minting", async () => {
  await withGitMutationRepository(async (fixture) => {
    runGit(fixture.root, ["config", "core.sparseCheckout", "true"]);
    await fs.mkdir(path.join(fixture.root, ".git", "info"), { recursive: true });
    await fs.writeFile(path.join(fixture.root, ".git", "info", "sparse-checkout"), "tracked.txt\n", "utf8");
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    assert.equal(status.mutation_state, "incomplete");
    assert.equal(status.state_token, null);
  });
});

test("real split index prevents V4 mutation token minting", async () => {
  await withGitMutationRepository(async (fixture) => {
    runGit(fixture.root, ["update-index", "--split-index"]);
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    assert.equal(status.mutation_state, "incomplete");
    assert.equal(status.state_token, null);
  });
});

test("real unmerged index is rejected by exact V4 staging", async () => {
  await withGitMutationRepository(async (fixture) => {
    runGit(fixture.root, ["switch", "-c", "conflict-side"]);
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "side\n", "utf8");
    runGit(fixture.root, ["commit", "-am", "side"]);
    runGit(fixture.root, ["switch", "main"]);
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "main\n", "utf8");
    runGit(fixture.root, ["commit", "-am", "main"]);
    runGit(fixture.root, ["merge", "conflict-side"], undefined, { allowFailure: true });
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    assert.equal(status.entries[0].index, "unmerged");
    assert.equal(status.mutation_state, "incomplete");
    assert.equal(status.state_token, null);
  });
});

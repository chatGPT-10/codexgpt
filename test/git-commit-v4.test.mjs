import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitCommitServiceV4 } from "../dist/git/commitService.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 commit rescans the exact index, uses local identity, and updates only current ref", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const indexService = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    const staged = await indexService.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    });
    const commitService = new GitCommitServiceV4(fixture.mutationContext, fixture.indexTokens);
    const committed = await commitService.commit({
      workspace: fixture.workspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "Record exact staged change"
    });
    assert.equal(committed.parent_oids.length, 1);
    assert.equal(committed.file_counts.modified, 1);
    assert.equal(committed.hooks_executed, false);
    assert.equal(committed.signature, "none");
    assert.equal(runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString().trim(), committed.commit_oid);
    assert.equal(fixture.calls.some((args) => args[0] === "commit"), false);
  });
});

test("V4 commit blocks secret messages and externally staged secret content", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const indexService = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    const staged = await indexService.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    });
    const service = new GitCommitServiceV4(fixture.mutationContext, fixture.indexTokens);
    await assert.rejects(() => service.commit({
      workspace: fixture.workspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "TOKEN=abcdefghijklmnopqrstuvwxyz1234567890"
    }), /GIT_SECRET_BLOCKED/);
    await fs.writeFile(path.join(fixture.root, "external.txt"), "TOKEN=abcdefghijklmnopqrstuvwxyz1234567890\n");
    runGit(fixture.root, ["add", "external.txt"]);
    await assert.rejects(() => service.commit({
      workspace: fixture.workspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "Safe message"
    }), /GIT_INDEX_CHANGED|GIT_SECRET_BLOCKED/);
  });
});

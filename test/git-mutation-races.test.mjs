import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitCommitServiceV4 } from "../dist/git/commitService.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 commit leaves an immutable orphan but reports no success when the ref races", async () => {
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
    const original = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString().trim();
    const service = new GitCommitServiceV4(fixture.mutationContext, fixture.indexTokens, {
      beforeRefUpdate() {
        runGit(fixture.root, ["commit", "--allow-empty", "-m", "external race"]);
      }
    });
    await assert.rejects(() => service.commit({
      workspace: fixture.workspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "Candidate"
    }), /GIT_REF_CHANGED/);
    assert.notEqual(runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString().trim(), original);
  });
});

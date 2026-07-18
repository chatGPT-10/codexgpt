import assert from "node:assert/strict";
import test from "node:test";
import { GitBranchServiceV4 } from "../dist/git/branchService.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 branch creation uses expected-absent local codex refs without switching HEAD", async () => {
  await withGitMutationRepository(async (fixture) => {
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    assert.match(status.state_token, /^gst_/);
    const service = new GitBranchServiceV4(fixture.mutationContext);
    const created = await service.create({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      name: "codex/task-one",
      base: { kind: "current_head" }
    });
    assert.equal(created.created, true);
    assert.equal(runGit(fixture.root, ["symbolic-ref", "--short", "HEAD"]).stdout.toString().trim(), "main");
    assert.equal(runGit(fixture.root, ["rev-parse", "refs/heads/codex/task-one"]).stdout.toString().trim(), created.oid);
    assert.equal(fixture.calls.some((args) => args[0] === "checkout" || args[0] === "switch"), false);
  });
});

test("V4 branch creation rejects secret-looking names and existing refs before overwrite", async () => {
  await withGitMutationRepository(async (fixture) => {
    const service = new GitBranchServiceV4(fixture.mutationContext);
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    await assert.rejects(() => service.create({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      name: "codex/TOKEN-abcdefghijklmnopqrstuvwxyz1234567890",
      base: { kind: "current_head" }
    }), /GIT_SECRET_BLOCKED/);
    runGit(fixture.root, ["branch", "codex/existing"]);
    const refreshed = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard });
    await assert.rejects(() => service.create({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: refreshed.state_token,
      name: "codex/existing",
      base: { kind: "current_head" }
    }), /GIT_REF_CHANGED/);
  });
});

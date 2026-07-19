import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { withTaskWorktreeFixture, createTaskWorktree } from "../fixtures/task-worktree-v4-helper.mjs";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";
import { GitRepositoryAdmissionV4 } from "../dist/git/admission.js";
import { GitReadServiceV4 } from "../dist/git/readService.js";
import { GitMutationContextV4 } from "../dist/git/mutationContext.js";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitCommitServiceV4 } from "../dist/git/commitService.js";

test("managed task workspace supports the V4 status stage and commit product path", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const primaryStatus = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard
    });
    const created = await createTaskWorktree(fixture, {
      stateToken: primaryStatus.state_token,
      taskName: "product path"
    });
    const taskWorkspace = fixture.authority.getWorkspace(created.workspace_id);
    const taskRecord = fixture.store.read(created.task.task_worktree_id).record;
    const admission = new GitRepositoryAdmissionV4({
      executor: fixture.executor,
      registry: fixture.registry
    });
    admission.setManagedTaskResolver((workspace) => fixture.authority.admitGitWorkspace(workspace));
    const readService = new GitReadServiceV4({
      executor: fixture.executor,
      registry: fixture.registry,
      stateTokens: fixture.stateTokens,
      contextFingerprint: "context-v4-mutation",
      admission
    });
    const context = new GitMutationContextV4({
      executor: fixture.executor,
      registry: fixture.registry,
      stateTokens: fixture.stateTokens,
      readService,
      contextFingerprint: "context-v4-mutation",
      admission
    });
    const index = new GitIndexServiceV4(context, fixture.indexTokens);
    const commit = new GitCommitServiceV4(context, fixture.indexTokens);
    const mainHead = runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"]).stdout.toString("ascii").trim();

    await fs.writeFile(path.join(taskWorkspace.root, "tracked.txt"), "task product path\n", "utf8");
    const status = await readService.status({
      workspace: taskWorkspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    assert.equal(status.repository_id, taskRecord.repositoryId);
    assert.equal(status.mutation_state, "complete", JSON.stringify(status));

    const staged = await index.stage({
      workspace: taskWorkspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    });
    const committed = await commit.commit({
      workspace: taskWorkspace,
      guard: fixture.guard,
      indexToken: staged.index_token,
      message: "commit through managed task workspace"
    });

    assert.equal(runGit(taskWorkspace.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim(), committed.commit_oid);
    assert.equal(runGit(fixture.workspace.root, ["rev-parse", "refs/heads/main"]).stdout.toString("ascii").trim(), mainHead);
  });
});

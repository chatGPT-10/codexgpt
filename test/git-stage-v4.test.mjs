import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { assertRawGitNormalizationV4 } from "../dist/git/normalization.js";
import { admitGitRepository } from "../dist/git/repositoryIdentity.js";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";

test("V4 stage records only exact add/modify/delete paths through a private index", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n");
    await fs.rm(path.join(fixture.root, "delete.txt"));
    await fs.writeFile(path.join(fixture.root, "new.txt"), "new\n");
    const paths = ["tracked.txt", "delete.txt", "new.txt"];
    const status = await fixture.readService.status({ workspace: fixture.workspace, guard: fixture.guard, paths });
    const service = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    const staged = await service.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths
    });
    assert.match(staged.index_token, /^gitx_/);
    assert.deepEqual(staged.staged.map((entry) => [entry.path, entry.change]), [
      ["tracked.txt", "modified"],
      ["delete.txt", "deleted"],
      ["new.txt", "added"]
    ]);
    const cached = runGit(fixture.root, ["diff", "--cached", "--name-only"]).stdout.toString().trim().split(/\r?\n/).sort();
    assert.deepEqual(cached, [...paths].sort());
    assert.equal(fixture.calls.some((args) => args[0] === "add"), false);
  });
});

test("V4 stage detects an index race before installation", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const service = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens, {
      beforeIndexInstall() {
        runGit(fixture.root, ["update-index", "--refresh"], undefined, { allowFailure: true });
        return fs.appendFile(path.join(fixture.root, ".git", "index"), Buffer.from([0]));
      }
    });
    await assert.rejects(() => service.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    }), /GIT_INDEX_CHANGED/);
  });
});

test("V4 stage rejects effective checkout normalization before object creation", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n");
    runGit(fixture.root, ["config", "core.autocrlf", "true"]);
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const service = new GitIndexServiceV4(fixture.mutationContext, fixture.indexTokens);
    await assert.rejects(() => service.stage({
      workspace: fixture.workspace,
      guard: fixture.guard,
      stateToken: status.state_token,
      paths: ["tracked.txt"]
    }), /GIT_NORMALIZATION_REQUIRED/);
    assert.equal(fixture.calls.some((args) => args[0] === "hash-object"), false);
  });
});

test("V4 stage rejects affected clean filters and EOL attributes before object creation", async () => {
  await withGitMutationRepository(async (fixture) => {
    await fs.writeFile(path.join(fixture.root, ".gitattributes"), "tracked.txt filter=unsafe eol=crlf\n");
    runGit(fixture.root, ["add", ".gitattributes"]);
    runGit(fixture.root, ["commit", "-m", "attributes"]);
    await fs.writeFile(path.join(fixture.root, "tracked.txt"), "attribute-change\n");
    const status = await fixture.readService.status({
      workspace: fixture.workspace,
      guard: fixture.guard,
      paths: ["tracked.txt"]
    });
    const before = fixture.calls.filter((args) => args[0] === "hash-object").length;
    assert.equal(status.state_token, null);
    const repository = await admitGitRepository({
      workspaceRoot: fixture.workspace.root,
      executor: fixture.executor,
      registry: fixture.registry
    });
    await assert.rejects(() => assertRawGitNormalizationV4({
      executor: fixture.executor,
      repository,
      paths: ["tracked.txt"]
    }), /GIT_NORMALIZATION_REQUIRED/);
    assert.equal(
      fixture.calls.filter((args) => args[0] === "hash-object").length,
      before
    );
  });
});

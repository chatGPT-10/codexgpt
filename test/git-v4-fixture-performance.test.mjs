import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  runGit,
  withGitMutationRepository
} from "../fixtures/git-v4-test-helper.mjs";

test("Git mutation fixtures use one owned root while preserving repository identity configuration", async () => {
  await withGitMutationRepository(async (fixture) => {
    const canonicalFixtureRoot = await fs.realpath(fixture.fixtureRoot);
    assert.equal(path.dirname(await fs.realpath(fixture.root)), canonicalFixtureRoot);
    assert.equal(path.dirname(await fs.realpath(fixture.privateRoot)), canonicalFixtureRoot);
    assert.equal(path.dirname(await fs.realpath(fixture.stateRoot)), canonicalFixtureRoot);
    assert.equal(
      runGit(fixture.root, ["config", "--get", "user.name"]).stdout.toString("utf8").trim(),
      "CodexGPT Test"
    );
    assert.equal(
      runGit(fixture.root, ["config", "--get", "user.email"]).stdout.toString("utf8").trim(),
      "codexgpt@example.invalid"
    );
    assert.deepEqual(
      fixture.setupGitCalls.map((args) => args[0]),
      ["init", "add", "commit"],
      "fixture setup must not reintroduce git config subprocesses"
    );
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  RepositoryIdentityRegistry,
  admitGitRepository,
  revalidateGitRepository
} from "../dist/git/repositoryIdentity.js";

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function testExecutor() {
  return {
    capabilityRevision: "f".repeat(64),
    async run(repository, args, options = {}) {
      const prefix = repository
        ? [`--git-dir=${repository.gitDir}`, `--work-tree=${repository.worktreeRoot}`]
        : [];
      const result = spawnSync("git", [...prefix, ...args], {
        cwd: repository?.worktreeRoot ?? process.cwd(),
        input: options.stdin,
        encoding: null,
        maxBuffer: options.stdoutLimitBytes ?? 1_048_576,
        env: { ...process.env, NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" }
      });
      return {
        status: result.status ?? 1,
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr ?? Buffer.alloc(0),
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false
      };
    }
  };
}

async function withRepository(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-identity-"));
  try {
    runGit(root, ["init"]);
    runGit(root, ["config", "user.email", "identity@example.invalid"]);
    runGit(root, ["config", "user.name", "Identity Test"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "alpha\n", "utf8");
    runGit(root, ["add", "tracked.txt"]);
    runGit(root, ["commit", "-m", "initial"]);
    await callback(await fs.realpath(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("repository admission returns opaque stable runtime IDs and exact primary-repository identities", async () => {
  await withRepository(async (root) => {
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-a" });
    const first = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });
    const second = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });

    assert.match(first.repositoryId, /^repo_[a-f0-9]{32}$/);
    assert.equal(first.repositoryId, second.repositoryId);
    assert.equal(first.worktreeRoot, root);
    assert.equal(first.gitDir, path.join(root, ".git"));
    assert.equal(first.commonDir, first.gitDir);
    assert.ok(["sha1", "sha256"].includes(first.objectFormat));
    assert.equal(first.executionIsolation, "none");
    assert.equal(first.repositoryIntegrations, "disabled");
    assert.equal(first.repositoryId.includes(root.toLowerCase()), false);

    await revalidateGitRepository(first);
    registry.dispose();
  });
});

test("repository admission rejects external metadata, alternates, replacement refs, promisors, partial clones, and mutable metadata hard links", async () => {
  await withRepository(async (root) => {
    const executor = testExecutor();
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-b" });

    const alternates = path.join(root, ".git", "objects", "info", "alternates");
    await fs.writeFile(alternates, "C:/foreign/objects\n", "utf8");
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_REPOSITORY_UNSAFE/);
    await fs.rm(alternates);

    const replacement = path.join(root, ".git", "refs", "replace");
    await fs.mkdir(replacement, { recursive: true });
    await fs.writeFile(path.join(replacement, "a".repeat(40)), "b".repeat(40), "utf8");
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_REPOSITORY_UNSAFE/);
    await fs.rm(replacement, { recursive: true, force: true });

    const packedRefs = path.join(root, ".git", "packed-refs");
    const packedRefsBefore = await fs.readFile(packedRefs, "utf8").catch(() => "");
    await fs.writeFile(packedRefs, `${packedRefsBefore}${"c".repeat(40)} refs/replace/${"d".repeat(40)}\n`, "utf8");
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_REPOSITORY_UNSAFE/);
    if (packedRefsBefore) await fs.writeFile(packedRefs, packedRefsBefore, "utf8");
    else await fs.rm(packedRefs);

    const promisor = path.join(root, ".git", "objects", "pack", `pack-${"e".repeat(40)}.promisor`);
    await fs.writeFile(promisor, "", "utf8");
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_UNSUPPORTED_REPOSITORY_FORMAT/);
    await fs.rm(promisor);

    runGit(root, ["config", "extensions.partialClone", "origin"]);
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_UNSUPPORTED_REPOSITORY_FORMAT/);
    runGit(root, ["config", "--unset", "extensions.partialClone"]);

    const configPath = path.join(root, ".git", "config");
    const hardLink = path.join(root, ".git", "config-copy");
    await fs.link(configPath, hardLink);
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_REPOSITORY_UNSAFE/);
    await fs.rm(hardLink);

    runGit(root, ["branch", "topic"]);
    const topicRef = path.join(root, ".git", "refs", "heads", "topic");
    const topicCopy = path.join(root, ".git", "refs", "heads", "topic-copy");
    await fs.link(topicRef, topicCopy);
    await assert.rejects(() => admitGitRepository({ workspaceRoot: root, executor, registry }), /GIT_REPOSITORY_UNSAFE/);
    await fs.rm(topicCopy);
    registry.dispose();
  });
});

test("arbitrary linked worktrees remain outside primary-repository admission until managed task identity exists", async () => {
  await withRepository(async (root) => {
    const linked = `${root}-linked`;
    try {
      runGit(root, ["branch", "linked-topic"]);
      runGit(root, ["worktree", "add", linked, "linked-topic"]);
      const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-linked" });
      await assert.rejects(
        () => admitGitRepository({ workspaceRoot: linked, executor: testExecutor(), registry }),
        /GIT_METADATA_OUTSIDE_AUTHORITY/
      );
      registry.dispose();
    } finally {
      runGit(root, ["worktree", "remove", "--force", linked]);
      await fs.rm(linked, { recursive: true, force: true });
    }
  });
});

test("bare repositories are not admitted as workspace repositories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-bare-"));
  try {
    runGit(root, ["init", "--bare"]);
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-bare" });
    await assert.rejects(
      () => admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry }),
      /GIT_NOT_REPOSITORY/
    );
    registry.dispose();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("repository registry rotates opaque IDs when the stable repository identity changes", () => {
  const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-rotation" });
  const first = registry.repositoryId("C:/repo", "1".repeat(64));
  const repeated = registry.repositoryId("C:/repo", "1".repeat(64));
  const replaced = registry.repositoryId("C:/repo", "2".repeat(64));
  assert.equal(first, repeated);
  assert.notEqual(first, replaced);
  registry.dispose();
});

test("repository revalidation detects identity replacement without exposing private paths", async () => {
  await withRepository(async (root) => {
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-c" });
    const identity = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });
    const headPath = path.join(root, ".git", "HEAD");
    const original = await fs.readFile(headPath);
    await fs.rename(headPath, `${headPath}.old`);
    await fs.writeFile(headPath, original);
    await assert.rejects(() => revalidateGitRepository(identity), /GIT_REPOSITORY_UNSAFE/);
    registry.dispose();
  });
});

test("repository revalidation detects newly added mutable refs and object-resolution metadata", async () => {
  await withRepository(async (root) => {
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-d" });
    const identity = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });
    runGit(root, ["branch", "late-ref"]);
    await assert.rejects(() => revalidateGitRepository(identity), /GIT_REPOSITORY_UNSAFE/);
    registry.dispose();
  });

  await withRepository(async (root) => {
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-e" });
    const identity = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });
    const alternates = path.join(root, ".git", "objects", "info", "alternates");
    await fs.writeFile(alternates, `${path.join(root, ".git", "objects")}\n`, "utf8");
    await assert.rejects(() => revalidateGitRepository(identity), /GIT_REPOSITORY_UNSAFE/);
    registry.dispose();
  });

  await withRepository(async (root) => {
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-f" });
    const identity = await admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry });
    const promisor = path.join(root, ".git", "objects", "pack", `pack-${"f".repeat(40)}.promisor`);
    await fs.writeFile(promisor, "", "utf8");
    await assert.rejects(() => revalidateGitRepository(identity), /GIT_REPOSITORY_UNSAFE/);
    registry.dispose();
  });
});

test("repository admission rejects oversized local config before unbounded parsing", async () => {
  await withRepository(async (root) => {
    const configPath = path.join(root, ".git", "config");
    await fs.appendFile(configPath, `\n# ${"x".repeat(1_100_000)}\n`, "utf8");
    const registry = new RepositoryIdentityRegistry({ contextFingerprint: "context-config-limit" });
    await assert.rejects(
      () => admitGitRepository({ workspaceRoot: root, executor: testExecutor(), registry }),
      /GIT_REPOSITORY_UNSAFE|GIT_SCAN_LIMIT/
    );
    registry.dispose();
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { createCodexGPTServer } from "../dist/server.js";
import {
  GitReadServiceV4,
  ProcessLocalGitReadCoordinator
} from "../dist/git/readService.js";
import { RepositoryIdentityRegistry } from "../dist/git/repositoryIdentity.js";
import { GitStateTokenService } from "../dist/git/stateToken.js";
import {
  gitStatusDataV4Schema,
  gitStatusOutputSchemaV4
} from "../dist/tools/schemas/gitStatus.js";
import {
  gitDiffDataV4Schema,
  gitDiffOutputSchemaV4
} from "../dist/tools/schemas/gitDiff.js";
import { gitLogDataV4Schema } from "../dist/tools/schemas/gitLog.js";
import { gitBranchDataV4Schema } from "../dist/tools/schemas/gitBranch.js";

function runGit(root, args, input) {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" }
  });
  assert.equal(result.status, 0, (result.stderr ?? Buffer.alloc(0)).toString("utf8"));
  return result.stdout ?? Buffer.alloc(0);
}

function executor() {
  return {
    capabilityRevision: "9".repeat(64),
    async run(repository, args, options = {}) {
      const prefix = repository
        ? [`--git-dir=${repository.gitDir}`, `--work-tree=${repository.worktreeRoot}`]
        : [];
      const result = spawnSync("git", [...prefix, ...args], {
        cwd: repository?.worktreeRoot ?? process.cwd(),
        input: options.stdin,
        encoding: null,
        maxBuffer: options.stdoutLimitBytes ?? 1_048_576,
        env: {
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          PATH: process.env.PATH,
          NO_COLOR: "1",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
          GIT_NO_LAZY_FETCH: "1",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_OPTIONAL_LOCKS: "0"
        }
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

async function withRepository(callback, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-v4-read-"));
  try {
    runGit(root, [
      "init",
      "--initial-branch=main",
      ...(options.refFormat ? [`--ref-format=${options.refFormat}`] : [])
    ]);
    runGit(root, ["config", "user.email", "reader@example.invalid"]);
    runGit(root, ["config", "user.name", "Reader Test"]);
    await fs.writeFile(path.join(root, "tracked.txt"), "alpha\n", "utf8");
    await fs.writeFile(path.join(root, "secret.env"), "TOKEN=abcdefghijklmnopqrstuvwxyz1234567890\n", "utf8");
    runGit(root, ["add", "tracked.txt"]);
    runGit(root, ["commit", "-m", "initial subject"]);
    runGit(root, ["branch", "topic"]);
    await callback(await fs.realpath(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function createService(root, gitExecutor = executor()) {
  const contextFingerprint = "context-v4-reader";
  const registry = new RepositoryIdentityRegistry({ contextFingerprint });
  const tokens = new GitStateTokenService({ key: Buffer.alloc(32, 11), ttlMs: 60_000 });
  const service = new GitReadServiceV4({
    executor: gitExecutor,
    registry,
    stateTokens: tokens,
    contextFingerprint
  });
  const workspace = { id: "workspace_v4", root, openedAt: new Date().toISOString() };
  const guard = new PathGuard({ blockedGlobs: ["**/*.env", "**/.env", "**/.env.*"] });
  return { service, workspace, guard, dispose() { tokens.dispose(); registry.dispose(); } };
}

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function v4Config(root) {
  return withEnv({
    CODEXGPT_ROOT: root,
    CODEXGPT_TOOL_CONTRACT_VERSION: "4",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
  }, () => loadConfig(["--bash", "off", "--write", "off", "--tool-mode", "full"]));
}

function v4Dependencies(service) {
  return {
    persistentAuditRuntime: { persistAuthorization() {}, persistExecution() {} },
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {
      identity: { credentialRef: "credential_v4_read", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "session_v4_read"
    },
    v4ContractCapabilities: {
      nativeHostIdentityAvailable: true,
      localApprovalAvailable: true,
      gitCapabilityAvailable: true,
      contractV4MigrationAvailable: true
    },
    gitReadServiceV4: service,
    policyRuntime: {
      mode: "enforce",
      authorize(toolName) {
        return {
          decision: {
            schemaVersion: 1,
            decisionId: `decision-${toolName}`,
            outcome: "allow",
            reasonCode: null,
            policyRevision: "policy-v4-read",
            resourceFingerprint: `sha256:${"a".repeat(64)}`,
            requiredApproval: null,
            requiredEnforcement: [],
            provenance: []
          },
          auditEvent: null
        };
      },
      audit() {}
    }
  };
}

test("process-local Git read coordination serializes the same worktree", async () => {
  const coordinator = new ProcessLocalGitReadCoordinator();
  const workspace = { id: "workspace_lock", root: "C:/repo", openedAt: new Date().toISOString() };
  let active = 0;
  let maximum = 0;
  const action = () => coordinator.run(workspace, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
  });
  await Promise.all([action(), action(), action()]);
  assert.equal(maximum, 1);
});

test("V4 git status returns typed bounded state, omits blocked paths, and mints a token only for complete scope", async () => {
  await withRepository(async (root) => {
    await fs.appendFile(path.join(root, "tracked.txt"), "beta\n", "utf8");
    await fs.writeFile(path.join(root, "new file.txt"), "new\n", "utf8");
    const fixture = createService(root);
    try {
      const data = await fixture.service.status({ workspace: fixture.workspace, guard: fixture.guard });
      assert.equal(gitStatusDataV4Schema.safeParse(data).success, true);
      assert.match(data.repository_id, /^repo_[a-f0-9]{32}$/);
      assert.equal(data.entries.some((entry) => entry.path === "tracked.txt"), true);
      assert.equal(data.entries.some((entry) => entry.path === "new file.txt"), true);
      assert.equal(data.entries.some((entry) => entry.path === "secret.env"), false);
      assert.equal(data.omitted_blocked_count, 1);
      assert.equal(data.scan_complete, false);
      assert.equal(data.mutation_state, "incomplete");
      assert.equal(data.state_token, null);
      assert.equal(data.execution_isolation, "none");
      assert.equal(data.repository_integrations, "disabled");

      const scoped = await fixture.service.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      assert.equal(scoped.scan_complete, true);
      assert.equal(scoped.mutation_state, "complete");
      assert.match(scoped.state_token, /^gst_/);
      assert.deepEqual(scoped.entries.map((entry) => entry.path), ["tracked.txt"]);
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 status never follows hard links or symlinks outside the admitted workspace", async () => {
  await withRepository(async (root) => {
    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.txt`);
    try {
      await fs.writeFile(outside, "TOKEN=abcdefghijklmnopqrstuvwxyz1234567890\n", "utf8");
      await fs.link(outside, path.join(root, "linked.txt"));
      const fixture = createService(root);
      try {
        const data = await fixture.service.status({ workspace: fixture.workspace, guard: fixture.guard });
        assert.equal(data.entries.some((entry) => entry.path === "linked.txt"), false);
        assert.equal(data.omitted_blocked_count > 0, true);
        assert.equal(data.omitted_secret_count, 0);
        assert.equal(data.scan_complete, false);
        assert.equal(data.state_token, null);
      } finally {
        fixture.dispose();
      }
    } finally {
      await fs.rm(outside, { force: true });
    }
  });
});

test("V4 status omits repository paths that cannot enter the public path schema", async () => {
  await withRepository(async (root) => {
    const base = executor();
    const oid = runGit(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
    const unsafeExecutor = {
      ...base,
      async run(repository, args, options) {
        if (args[0] === "status") {
          return {
            status: 0,
            stdout: Buffer.from(`# branch.oid ${oid}\0# branch.head main\0? bad\nname.txt\0`, "utf8"),
            stderr: Buffer.alloc(0),
            stdoutTruncated: false,
            stderrTruncated: false,
            timedOut: false
          };
        }
        return base.run(repository, args, options);
      }
    };
    const fixture = createService(root, unsafeExecutor);
    try {
      const data = await fixture.service.status({ workspace: fixture.workspace, guard: fixture.guard });
      assert.equal(data.entries.length, 0);
      assert.equal(data.omitted_blocked_count, 1);
      assert.equal(data.scan_complete, false);
      assert.equal(data.state_token, null);
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 status refuses a token when repository state changes between exact snapshots", async () => {
  await withRepository(async (root) => {
    const base = executor();
    let statusCalls = 0;
    const racingExecutor = {
      ...base,
      async run(repository, args, options) {
        if (args[0] === "status") {
          statusCalls += 1;
          if (statusCalls === 2) await fs.appendFile(path.join(root, "tracked.txt"), "external-race\n", "utf8");
        }
        return base.run(repository, args, options);
      }
    };
    const fixture = createService(root, racingExecutor);
    try {
      await assert.rejects(
        () => fixture.service.status({
          workspace: fixture.workspace,
          guard: fixture.guard,
          paths: ["tracked.txt"]
        }),
        /GIT_STATE_CHANGED/
      );
      assert.equal(statusCalls, 2);
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 diff rejects object-resolution metadata introduced after the initial snapshot", async () => {
  await withRepository(async (root) => {
    const outsideObjects = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-alt-"));
    const base = executor();
    let injected = false;
    const racingExecutor = {
      ...base,
      async run(repository, args, options) {
        if (!injected && args[0] === "diff") {
          injected = true;
          await fs.writeFile(
            path.join(root, ".git", "objects", "info", "alternates"),
            `${outsideObjects}\n`,
            "utf8"
          );
        }
        return base.run(repository, args, options);
      }
    };
    const fixture = createService(root, racingExecutor);
    try {
      await fs.appendFile(path.join(root, "tracked.txt"), "beta\n", "utf8");
      await assert.rejects(
        () => fixture.service.diff({
          workspace: fixture.workspace,
          guard: fixture.guard,
          comparison: "worktree_to_index",
          paths: ["tracked.txt"],
          includePatch: false
        }),
        /GIT_REPOSITORY_UNSAFE/
      );
    } finally {
      fixture.dispose();
      await fs.rm(outsideObjects, { recursive: true, force: true });
    }
  });
});

test("V4 git diff combines raw and numstat facts, redacts patch secrets, and never tokens incomplete output", async () => {
  await withRepository(async (root) => {
    await fs.appendFile(path.join(root, "tracked.txt"), "TOKEN=abcdefghijklmnopqrstuvwxyz1234567890\n", "utf8");
    const fixture = createService(root);
    try {
      const data = await fixture.service.diff({
        workspace: fixture.workspace,
        guard: fixture.guard,
        comparison: "worktree_to_index",
        paths: ["tracked.txt"],
        includePatch: true
      });
      assert.equal(gitDiffDataV4Schema.safeParse(data).success, true);
      assert.equal(data.changes.length, 0);
      assert.equal(data.additions, 0);
      assert.equal(data.deletions, 0);
      assert.equal(data.patch, "");
      assert.equal(data.omitted_secret_count > 0, true);
      assert.equal(data.state_token, null);
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 read output and time limits fail as GIT_SCAN_LIMIT without retaining diagnostics", async () => {
  await withRepository(async (root) => {
    const base = executor();
    const limitedExecutor = {
      ...base,
      async run(repository, args, options) {
        if (args[0] === "status") {
          return {
            status: 0,
            stdout: Buffer.from("partial-secret-diagnostic"),
            stderr: Buffer.from("private-root-and-token"),
            stdoutTruncated: true,
            stderrTruncated: true,
            timedOut: false
          };
        }
        return base.run(repository, args, options);
      }
    };
    const fixture = createService(root, limitedExecutor);
    try {
      await assert.rejects(
        () => fixture.service.status({ workspace: fixture.workspace, guard: fixture.guard }),
        (error) => error instanceof Error && error.message === "GIT_SCAN_LIMIT"
      );
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 git log and branch reads use opaque branch IDs and sanitized machine-derived metadata", async () => {
  await withRepository(async (root) => {
    const fixture = createService(root);
    try {
      const branches = await fixture.service.branches({ workspace: fixture.workspace, guard: fixture.guard });
      assert.equal(gitBranchDataV4Schema.safeParse(branches).success, true);
      assert.equal(branches.branches.length, 2);
      assert.equal(branches.branches.filter((branch) => branch.current).length, 1);
      assert.equal(branches.branches.every((branch) => /^branch_[a-f0-9]{32}$/.test(branch.branch_id)), true);
      assert.equal(branches.branches.some((branch) => branch.name === "main"), true);
      assert.equal(branches.branches.some((branch) => branch.name === "topic"), true);

      const main = branches.branches.find((branch) => branch.name === "main");
      const log = await fixture.service.log({
        workspace: fixture.workspace,
        guard: fixture.guard,
        branchId: main.branch_id,
        limit: 10
      });
      assert.equal(gitLogDataV4Schema.safeParse(log).success, true);
      assert.equal(log.commits.length, 1);
      assert.equal(log.commits[0].subject, "initial subject");
      assert.equal(log.commits[0].author_name, "Reader Test");
      assert.equal(log.execution_isolation, "none");
      assert.equal(log.repository_integrations, "disabled");
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 git log omits invalid UTF-8 display fields while preserving typed commit facts", async () => {
  await withRepository(async (root) => {
    const tree = runGit(root, ["rev-parse", "HEAD^{tree}"]).toString("utf8").trim();
    const commit = Buffer.concat([
      Buffer.from(
        `tree ${tree}\nauthor Reader Test <reader@example.invalid> 1700000000 +0000\ncommitter Reader Test <reader@example.invalid> 1700000000 +0000\n\nlegacy-`,
        "utf8"
      ),
      Buffer.from([0xff]),
      Buffer.from("-subject\n", "utf8")
    ]);
    const oid = runGit(root, ["hash-object", "-t", "commit", "-w", "--stdin"], commit).toString("utf8").trim();
    runGit(root, ["update-ref", "refs/heads/main", oid]);
    const fixture = createService(root);
    try {
      const branches = await fixture.service.branches({ workspace: fixture.workspace, guard: fixture.guard });
      const main = branches.branches.find((branch) => branch.name === "main");
      const log = await fixture.service.log({
        workspace: fixture.workspace,
        guard: fixture.guard,
        branchId: main.branch_id,
        limit: 5
      });
      assert.equal(log.commits[0].oid, oid);
      assert.equal(log.commits[0].subject, null);
      assert.equal(log.commits[0].subject_omitted, true);
      assert.equal(log.commits[0].author_name, "Reader Test");
      assert.equal(log.commits[0].timestamp, "2023-11-14T22:13:20.000Z");
    } finally {
      fixture.dispose();
    }
  });
});

test("V4 MCP handlers use the typed read service and never fall back to legacy human-output providers", async () => {
  await withRepository(async (root) => {
    await fs.appendFile(path.join(root, "tracked.txt"), "beta\n", "utf8");
    const fixture = createService(root);
    const server = createCodexGPTServer(v4Config(root), v4Dependencies(fixture.service));
    try {
      const tools = server._registeredTools;
      const opened = await tools.open_current_workspace.handler({});
      const workspaceId = opened.structuredContent.data.workspace_id;

      const statusResult = await tools.git_status.handler({ workspace_id: workspaceId, paths: ["tracked.txt"] });
      assert.equal(statusResult.isError, undefined);
      assert.equal(statusResult.structuredContent.ok, true);
      assert.match(statusResult.structuredContent.data.repository_id, /^repo_/);
      assert.equal("root" in statusResult.structuredContent.data, false);
      assert.equal("status" in statusResult.structuredContent.data, false);

      const diffResult = await tools.git_diff.handler({
        workspace_id: workspaceId,
        comparison: "worktree_to_index",
        paths: ["tracked.txt"],
        include_patch: false
      });
      assert.equal(diffResult.isError, undefined);
      assert.equal(diffResult.structuredContent.ok, true);
      assert.equal(diffResult.structuredContent.data.patch, "");

      const branchResult = await tools.git_branch.handler({ workspace_id: workspaceId });
      assert.equal(branchResult.isError, undefined);
      const main = branchResult.structuredContent.data.branches.find((branch) => branch.name === "main");
      assert.ok(main);

      const logResult = await tools.git_log.handler({ workspace_id: workspaceId, branch_id: main.branch_id, limit: 5 });
      assert.equal(logResult.isError, undefined);
      assert.equal(logResult.structuredContent.data.commits[0].subject, "initial subject");

      const changesResult = await tools.show_changes.handler({
        workspace_id: workspaceId,
        include_diff: false,
        since: "workspace",
        mark_reviewed: false
      });
      assert.equal(changesResult.isError, undefined);
      assert.equal(changesResult.structuredContent.data.changed_files.some((line) => line.includes("tracked.txt")), true);

      const snapshotResult = await tools.workspace_snapshot.handler({
        workspace_id: workspaceId,
        include_tree: false,
        include_skills: false,
        include_ai_context: false
      });
      assert.equal(snapshotResult.isError, undefined);
      assert.equal(snapshotResult.structuredContent.data.git_status.includes("tracked.txt"), true);
      assert.equal(snapshotResult.structuredContent.data.git_status.includes("## main"), true);
      assert.equal(snapshotResult.structuredContent.data.git_status.includes("branch_"), false);

      const contextResult = await tools.codex_context.handler({
        workspace_id: workspaceId,
        target_path: ".",
        include_ai_bridge: false,
        include_git: true,
        include_diff: true
      });
      assert.equal(contextResult.isError, undefined);
      assert.equal(contextResult.structuredContent.data.context.includes("tracked.txt"), true);
      assert.equal(contextResult.structuredContent.data.context.includes("beta"), true);
    } finally {
      fixture.dispose();
      await server.close();
    }
  });
});

test("V4 inherited Git consumers fail closed when the typed read service is absent", async () => {
  await withRepository(async (root) => {
    const server = createCodexGPTServer(v4Config(root), v4Dependencies(undefined));
    try {
      const result = await server._registeredTools.open_current_workspace.handler({});
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, "INTERNAL_ERROR");
      assert.equal(JSON.stringify(result.structuredContent).includes("GIT_V4_HANDLER_UNAVAILABLE"), false);
    } finally {
      await server.close();
    }
  });
});

test("V4 reftable repositories remain readable but never produce mutation state tokens", async () => {
  await withRepository(async (root) => {
    const fixture = createService(root);
    try {
      const status = await fixture.service.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      assert.equal(gitStatusDataV4Schema.safeParse(status).success, true);
      assert.equal(status.scan_complete, false);
      assert.equal(status.mutation_state, "incomplete");
      assert.equal(status.state_token, null);

      const branches = await fixture.service.branches({ workspace: fixture.workspace, guard: fixture.guard });
      assert.equal(branches.branches.some((branch) => branch.name === "main"), true);
      const main = branches.branches.find((branch) => branch.name === "main");
      const log = await fixture.service.log({
        workspace: fixture.workspace,
        guard: fixture.guard,
        branchId: main.branch_id,
        limit: 5
      });
      assert.equal(log.commits[0].subject, "initial subject");
    } finally {
      fixture.dispose();
    }
  }, { refFormat: "reftable" });
});

test("V4 structured success envelopes validate without legacy root/path fields", () => {
  const statusData = {
    repository_id: `repo_${"a".repeat(32)}`,
    head: { kind: "detached", branch_id: null, oid: "b".repeat(40) },
    entries: [],
    changed_count: 0,
    untracked_count: 0,
    ignored_count: 0,
    omitted_blocked_count: 0,
    omitted_secret_count: 0,
    scan_complete: true,
    mutation_state: "complete",
    state_token: `gst_${"A".repeat(28)}`,
    integration_review_token: null,
    integration_identity_count: 0,
    integration_identity_digest: null,
    integration_identities: [],
    execution_isolation: "none",
    repository_integrations: "disabled"
  };
  assert.equal(gitStatusOutputSchemaV4.safeParse({
    codexgpt_tool: "git_status",
    codexgpt_title: "Git Status",
    ok: true,
    data: statusData,
    error: null,
    meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
  }).success, true);
  assert.equal(gitDiffOutputSchemaV4.safeParse({
    codexgpt_tool: "git_diff",
    codexgpt_title: "Git Diff",
    ok: true,
    data: {
      repository_id: statusData.repository_id,
      comparison: "worktree_to_index",
      changes: [], additions: 0, deletions: 0, binary_count: 0,
      patch: "", patch_included: false, truncated: false,
      omitted_blocked_count: 0, omitted_secret_count: 0,
      state_token: statusData.state_token
    },
    error: null,
    meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
  }).success, true);
});

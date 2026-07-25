import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PathGuard } from "../dist/guard.js";
import { GitReadServiceV4 } from "../dist/git/readService.js";
import { RepositoryIdentityRegistry } from "../dist/git/repositoryIdentity.js";
import { GitStateTokenService } from "../dist/git/stateToken.js";
import { GitMutationContextV4 } from "../dist/git/mutationContext.js";
import { GitIndexTokenServiceV4 } from "../dist/git/indexService.js";
import { AtomicTransactionEngine, ProcessInstanceRegistry } from "../dist/transactions/index.js";
import { GitFileTransactionV4 } from "../dist/git/fileTransaction.js";

export function runGit(root, args, input, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_LAZY_FETCH: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      ...options.env
    }
  });
  if (options.allowFailure !== true) {
    assert.equal(result.status, 0, (result.stderr ?? Buffer.alloc(0)).toString("utf8"));
  }
  return result;
}

export async function withGitMutationRepository(callback, options = {}) {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-v4-"));
  const root = path.join(fixtureRoot, "repository");
  const privateRoot = path.join(fixtureRoot, "private");
  const stateRoot = path.join(fixtureRoot, "state");
  const setupGitCalls = [];
  const runSetupGit = (args, input) => {
    setupGitCalls.push([...args]);
    return runGit(root, args, input);
  };
  try {
    await Promise.all([
      fs.mkdir(root),
      fs.mkdir(privateRoot),
      fs.mkdir(stateRoot)
    ]);
    const safeHooksRoot = path.join(privateRoot, "safe-hooks");
    await fs.mkdir(safeHooksRoot);
    runSetupGit(["init", "--initial-branch=main", ...(options.objectFormat ? [`--object-format=${options.objectFormat}`] : [])]);
    await fs.appendFile(
      path.join(root, ".git", "config"),
      "\n[user]\n\tname = CodexGPT Test\n\temail = codexgpt@example.invalid\n",
      "utf8"
    );
    await fs.writeFile(path.join(root, "tracked.txt"), "alpha\n", "utf8");
    await fs.writeFile(path.join(root, "delete.txt"), "remove\n", "utf8");
    runSetupGit(["add", "tracked.txt", "delete.txt"]);
    runSetupGit(["commit", "-m", "initial"]);
    const calls = [];
    const executionResults = [];
    const approvedCalls = [];
    const executor = {
      capabilityRevision: "9".repeat(64),
      async createPrivateDirectory(prefix) {
        return fs.mkdtemp(path.join(privateRoot, `${prefix}-`));
      },
      async removePrivateDirectory(directory) {
        await fs.rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100
        });
      },
      async run(repository, args, options = {}) {
        calls.push([...args]);
        const prefix = repository
          ? [`--git-dir=${repository.gitDir}`, `--work-tree=${repository.worktreeRoot}`]
          : [];
        const env = {
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          PATH: process.env.PATH,
          NO_COLOR: "1",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
          GIT_NO_LAZY_FETCH: "1",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_OPTIONAL_LOCKS: "0",
          ...(options.privateIndexPath ? { GIT_INDEX_FILE: options.privateIndexPath } : {}),
          ...(options.objectDirectoryPath ? { GIT_OBJECT_DIRECTORY: options.objectDirectoryPath } : {}),
          ...(options.objectDirectoryPath && repository
            ? { GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repository.commonDir, "objects") }
            : {}),
          ...(options.identity ? {
            GIT_AUTHOR_NAME: options.identity.authorName,
            GIT_AUTHOR_EMAIL: options.identity.authorEmail,
            GIT_COMMITTER_NAME: options.identity.committerName,
            GIT_COMMITTER_EMAIL: options.identity.committerEmail,
            ...(options.identity.systemAuthorDate ? { GIT_AUTHOR_DATE: options.identity.systemAuthorDate } : {}),
            ...(options.identity.systemCommitterDate ? { GIT_COMMITTER_DATE: options.identity.systemCommitterDate } : {})
          } : {})
        };
        const config = [
          `core.hooksPath=${safeHooksRoot}`,
          ...(options.configOverrides ?? [])
        ].flatMap((entry) => ["-c", entry]);
        const result = spawnSync("git", [...prefix, ...config, ...args], {
          cwd: repository?.worktreeRoot ?? root,
          input: options.stdin,
          encoding: null,
          maxBuffer: options.stdoutLimitBytes ?? 32 * 1024 * 1024,
          env
        });
        executionResults.push({
          args: [...args],
          status: result.status ?? 1,
          stderr: (result.stderr ?? Buffer.alloc(0)).toString("utf8").replace(/\s+/gu, " ").trim().slice(0, 512)
        });
        return {
          status: result.status ?? 1,
          stdout: result.stdout ?? Buffer.alloc(0),
          stderr: result.stderr ?? Buffer.alloc(0),
          stdoutTruncated: false,
          stderrTruncated: false,
          timedOut: false
        };
      },
      async runApprovedIntegration(repository, request) {
        approvedCalls.push(structuredClone({
          ...request,
          ...(request.message ? { message: `<${request.message.length} bytes>` } : {})
        }));
        let args;
        let input;
        const gitDir = request.integrationGitDir;
        const integrationConfig = [
          ...(request.integrationConfigOverrides ?? []),
          `core.hooksPath=${request.hooksPath}`
        ].flatMap((entry) => ["-c", entry]);
        const env = {
          ...process.env,
          NO_COLOR: "1",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
          GIT_NO_LAZY_FETCH: "1",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_OPTIONAL_LOCKS: "0"
        };
        if (request.operation === "stage") {
          args = ["--literal-pathspecs", ...integrationConfig, "add", "--pathspec-from-file=-", "--pathspec-file-nul"];
          input = Buffer.from(`${request.paths.join("\0")}\0`, "utf8");
          env.GIT_INDEX_FILE = request.privateIndexPath;
          env.GIT_OBJECT_DIRECTORY = request.objectDirectoryPath;
          env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(repository.commonDir, "objects");
        } else if (request.operation === "commit") {
          args = ["--literal-pathspecs", ...integrationConfig, "commit", "--file=-"];
          input = request.message;
          env.GIT_INDEX_FILE = request.privateIndexPath;
          env.GIT_OBJECT_DIRECTORY = request.objectDirectoryPath;
          env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(repository.commonDir, "objects");
        } else if (request.operation === "merge_tree") {
          args = ["--literal-pathspecs", ...integrationConfig, "merge-tree", "--write-tree", "-z", request.targetOid, request.taskOid];
          env.GIT_OBJECT_DIRECTORY = request.objectDirectoryPath;
          env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(repository.commonDir, "objects");
        } else {
          args = ["--literal-pathspecs", ...integrationConfig, "checkout-index", "--force", "-z", "--stdin", `--prefix=${request.destinationPrefix}${path.sep}`];
          input = Buffer.from(`${request.paths.join("\0")}\0`, "utf8");
          env.GIT_INDEX_FILE = request.privateIndexPath;
        }
        env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(repository.commonDir, "objects");
        const execute = (commandArgs, commandInput, maxBuffer = 32 * 1024 * 1024) => {
          const result = spawnSync("git", [`--git-dir=${gitDir}`, `--work-tree=${repository.worktreeRoot}`, ...commandArgs], {
            cwd: repository.worktreeRoot,
            input: commandInput,
            encoding: null,
            maxBuffer,
            env
          });
          return {
            status: result.status ?? 1,
            stdout: result.stdout ?? Buffer.alloc(0),
            stderr: result.stderr ?? Buffer.alloc(0),
            stdoutTruncated: false,
            stderrTruncated: false,
            timedOut: false
          };
        };
        if (request.operation !== "stage") return { result: execute(args, input) };
        const readTreeOid = (result) => {
          const treeText = result.stdout.toString("ascii");
          const expected = repository.objectFormat === "sha1"
            ? /^[a-f0-9]{40}\r?\n?$/u
            : /^[a-f0-9]{64}\r?\n?$/u;
          if (!expected.test(treeText)) throw new Error("GIT_COMMAND_FAILED");
          return treeText.trim();
        };
        const writeTreeArgs = ["--literal-pathspecs", ...integrationConfig, "write-tree"];
        const oldTree = execute(writeTreeArgs, undefined, 256);
        if (oldTree.status !== 0) return { result: oldTree };
        const primary = execute(args, input);
        if (primary.status !== 0) return { result: primary };
        const newTree = execute(writeTreeArgs, undefined, 256);
        if (newTree.status !== 0) return { result: newTree };
        return {
          result: newTree,
          stageOldTreeOid: readTreeOid(oldTree),
          stageTreeOid: readTreeOid(newTree)
        };
      }
    };
    const contextFingerprint = "context-v4-mutation";
    const registry = new RepositoryIdentityRegistry({ contextFingerprint });
    const stateTokens = new GitStateTokenService({ key: Buffer.alloc(32, 31), ttlMs: 60_000 });
    const readService = new GitReadServiceV4({
      executor,
      registry,
      stateTokens,
      contextFingerprint
    });
    const mutationContext = new GitMutationContextV4({
      executor,
      registry,
      stateTokens,
      readService,
      contextFingerprint
    });
    const indexTokens = new GitIndexTokenServiceV4({ key: Buffer.alloc(32, 41), ttlMs: 60_000 });
    const workspace = { id: "workspace_v4_mutation", root: await fs.realpath(root), openedAt: new Date().toISOString() };
    const guard = new PathGuard({ blockedGlobs: [".git", ".git/**", "**/.git/**", "**/*.env", "**/.env*"] });
    const processRegistry = new ProcessInstanceRegistry(stateRoot);
    const transactionEngine = new AtomicTransactionEngine(
      { blockedGlobs: [".git", ".git/**", "**/.git/**", "**/*.env", "**/.env*"], maxWriteBytes: 16 * 1024 * 1024 },
      guard,
      stateRoot,
      processRegistry
    );
    const fileTransactions = new GitFileTransactionV4(transactionEngine);
    try {
      await callback({
        fixtureRoot,
        root: workspace.root,
        privateRoot,
        stateRoot,
        setupGitCalls: setupGitCalls.map((args) => Object.freeze([...args])),
        executor,
        calls,
        executionResults,
        approvedCalls,
        registry,
        stateTokens,
        readService,
        mutationContext,
        indexTokens,
        workspace,
        guard,
        fileTransactions
      });
    } finally {
      processRegistry.dispose();
      indexTokens.dispose();
      stateTokens.dispose();
      registry.dispose();
    }
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

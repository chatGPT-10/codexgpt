import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";
import { GitReadServiceV4, neutralizedFilterConfig } from "../dist/git/readService.js";
import { GitMutationContextV4 } from "../dist/git/mutationContext.js";
import { GitIndexServiceV4 } from "../dist/git/indexService.js";
import { GitCommitServiceV4 } from "../dist/git/commitService.js";
import { GitIntegrationGateV4 } from "../dist/git/integrations.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";
import { GitMutationServiceV4 } from "../dist/git/mutationService.js";

function authorization(input) {
  return {
    schemaVersion: 4,
    contractVersion: 4,
    eventId: `event_${input.toolName}`,
    eventType: "authorization",
    timestamp: new Date().toISOString(),
    requestId: `request_${input.toolName}`,
    authorizationEventId: null,
    decisionId: `decision_${input.toolName}`,
    toolName: input.toolName,
    canonicalAction: input.canonicalAction,
    workspaceId: input.workspaceId,
    policyRevision: "policy_gate_x",
    subjectFingerprint: "subject_gate_x",
    contextFingerprint: "context-v4-mutation",
    resultCode: "ALLOW",
    counts: {},
    repositoryId: input.repositoryId,
    taskWorktreeId: null,
    operationId: null,
    outcome: "allow",
    riskClass: "R3",
    resourceFingerprint: input.resourceFingerprint ?? `sha256:${"a".repeat(64)}`,
    approvalId: "approval_gate_x",
    grantId: "grant_gate_x"
  };
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

test("safe reads replace repository filters with a fixed non-required failure sentinel", async () => {
  const repository = { repositoryId: "repo", repositoryFingerprint: "f".repeat(64) };
  const executor = {
    async run(_repository, args) {
      assert.deepEqual(args, [
        "config",
        "--local",
        "--no-includes",
        "--null",
        "--get-regexp",
        "^filter\\..*\\.(clean|smudge|process|required)$"
      ]);
      return {
        status: 0,
        stdout: Buffer.from("filter.codexgpt.clean\nreviewed-filter\0", "utf8"),
        stderr: Buffer.alloc(0),
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false
      };
    }
  };
  assert.deepEqual(await neutralizedFilterConfig(executor, repository), [
    "filter.codexgpt.process=",
    "filter.codexgpt.clean=! :",
    "filter.codexgpt.smudge=! :",
    "filter.codexgpt.required=false"
  ]);
});

test("Gate X stages through a private index, runs reviewed filters, and commits through a shadow Git dir", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 73) });
    try {
      const marker = path.join(fixture.root, "integration-marker.txt");
      const postIndexMarker = path.join(fixture.root, "post-index-marker.txt");
      const canary = path.resolve("fixtures", "git-canary-child.mjs");
      const filterCommand = `${quote(process.execPath)} ${quote(canary)} ${quote(marker)} filter`;
      runGit(fixture.root, ["config", "filter.codexgpt.clean", filterCommand]);
      await fs.writeFile(path.join(fixture.root, ".gitattributes"), "tracked.txt filter=codexgpt\n", "utf8");
      runGit(fixture.root, ["add", ".gitattributes"]);
      runGit(fixture.root, ["commit", "-m", "attributes"]);
      await fs.rm(marker, { force: true });
      const hooksRoot = path.join(fixture.root, "reviewed-hooks");
      await fs.mkdir(hooksRoot);
      runGit(fixture.root, ["config", "core.hooksPath", hooksRoot]);
      const hook = path.join(hooksRoot, "pre-commit");
      await fs.writeFile(hook, [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.appendFileSync(${JSON.stringify(marker)}, 'hook\\n');`,
        ""
      ].join("\n"), { mode: 0o755 });
      await fs.chmod(hook, 0o755);
      const postIndexHook = path.join(hooksRoot, "post-index-change");
      await fs.writeFile(postIndexHook, [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.appendFileSync(${JSON.stringify(postIndexMarker)}, 'post-index\\n');`,
        ""
      ].join("\n"), { mode: 0o755 });
      await fs.chmod(postIndexHook, 0o755);
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "beta\n", "utf8");

      const gate = new GitIntegrationGateV4({
        executor: fixture.executor,
        reviews,
        enabled: true
      });
      const readService = new GitReadServiceV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        contextFingerprint: "context-v4-mutation",
        integrationGate: gate
      });
      const context = new GitMutationContextV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        readService,
        contextFingerprint: "context-v4-mutation"
      });
      const index = new GitIndexServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const commit = new GitCommitServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const mutations = new GitMutationServiceV4({
        branch: { context },
        index,
        commit,
        integrationGate: gate
      });

      const status = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      assert.equal(status.repository_integrations, "approved_full_access");
      assert.match(status.integration_review_token, /^review_/u);
      assert.ok(status.integration_identity_count >= 3);
      const describedStage = mutations.describe("git_stage", {
        state_token: status.state_token,
        paths: ["tracked.txt"],
        integration_review_token: status.integration_review_token
      });
      assert.equal(describedStage.riskClass, "R3");
      assert.ok(describedStage.requiredScopes.includes("shell:execute"));
      assert.ok(describedStage.requiredScopes.includes("host:full-access"));
      const preview = describedStage.approvalRevealArguments;
      const [realNode, realCanary, realHook, realPostIndexHook] = await Promise.all([
        fs.realpath(process.execPath),
        fs.realpath(canary),
        fs.realpath(hook),
        fs.realpath(postIndexHook)
      ]);
      assert.ok(preview.some((entry) => entry.endsWith(realNode)));
      assert.ok(preview.some((entry) => entry.endsWith(realCanary)));
      assert.ok(preview.some((entry) => entry.endsWith(realHook)));
      assert.ok(preview.some((entry) => entry.endsWith(realPostIndexHook)));
      await assert.rejects(() => mutations.stage({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"]
      }), /GIT_INTEGRATION_REQUIRED/);
      await assert.rejects(() => fs.readFile(marker), { code: "ENOENT" });
      const staged = await index.stageApproved({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"],
        integrationReviewToken: status.integration_review_token,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: status.repository_id
        })
      });
      assert.equal(staged.normalization, "approved_full_access");
      assert.equal(staged.execution_isolation, "none");
      const liveTree = runGit(
        fixture.root,
        ["cat-file", "-e", `${staged.new_index_tree_oid}^{tree}`],
        undefined,
        { allowFailure: true }
      );
      assert.equal(liveTree.status, 0, "approved stage must promote the complete new tree before deleting quarantine");
      const stageMarkers = (await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u);
      assert.ok(stageMarkers.length >= 1);
      assert.deepEqual(new Set(stageMarkers), new Set(["filter"]));
      const postIndexMarkers = (await fs.readFile(postIndexMarker, "utf8")).trim().split(/\r?\n/u);
      assert.ok(postIndexMarkers.length >= 1);
      assert.deepEqual(new Set(postIndexMarkers), new Set(["post-index"]));
      assert.equal(fixture.approvedCalls[0].operation, "stage");
      assert.ok(fixture.approvedCalls[0].privateIndexPath.includes("git-integration-stage-"));

      const commitStatus = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard
      });
      const beforeHead = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim();
      let committed;
      try {
        committed = await commit.commitApproved({
          workspace: fixture.workspace,
          guard: fixture.guard,
          indexToken: staged.index_token,
          message: "approved integration commit",
          integrationReviewToken: commitStatus.integration_review_token,
          authorization: authorization({
            toolName: "git_commit",
            canonicalAction: "commit",
            workspaceId: fixture.workspace.id,
            repositoryId: commitStatus.repository_id
          })
        });
      } catch (error) {
        const lastGit = fixture.executionResults.at(-1) ?? null;
        throw new Error(`${error?.message ?? error}; last_safe_git=${JSON.stringify(lastGit)}`);
      }
      assert.equal(committed.repository_integrations, "approved_full_access");
      assert.equal(committed.hooks_executed, true);
      assert.equal(committed.signature, "none");
      assert.equal(committed.parent_oids[0], beforeHead);
      assert.equal(runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim(), committed.commit_oid);
      const finalMarkers = (await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u);
      assert.equal(finalMarkers.filter((entry) => entry === "hook").length, 1);
      assert.ok(finalMarkers.filter((entry) => entry === "filter").length >= stageMarkers.length);
      assert.deepEqual(new Set(finalMarkers), new Set(["filter", "hook"]));
      assert.equal(fixture.approvedCalls[1].operation, "commit");
      assert.ok(fixture.approvedCalls[1].shadowGitDir.includes("git-integration-commit-"));
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X rejects local config includes and external attributes before any approved process spawn", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 75) });
    try {
      const repository = await import("../dist/git/repositoryIdentity.js").then(({ admitGitRepository }) =>
        admitGitRepository({
          workspaceRoot: fixture.workspace.root,
          executor: fixture.executor,
          registry: fixture.registry
        })
      );
      const included = path.join(fixture.root, "included-git-config");
      await fs.writeFile(included, "[filter \"unreviewed\"]\n\tclean = unreviewed-command\n", "utf8");
      runGit(fixture.root, ["config", "include.path", included]);
      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      await assert.rejects(() => gate.review({
        workspaceId: fixture.workspace.id,
        repository,
        semanticStateDigest: "8".repeat(64)
      }), /GIT_INTEGRATION_REQUIRED/);
      assert.equal(fixture.approvedCalls.length, 0);
      runGit(fixture.root, ["config", "--unset-all", "include.path"]);
      runGit(fixture.root, ["config", "core.attributesFile", included]);
      await assert.rejects(() => gate.review({
        workspaceId: fixture.workspace.id,
        repository,
        semanticStateDigest: "b".repeat(64)
      }), /GIT_INTEGRATION_REQUIRED/);
      assert.equal(fixture.approvedCalls.length, 0);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X stage rejects integration-induced ref drift before installing the live index", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 79) });
    try {
      const hook = path.join(fixture.root, ".git", "hooks", "pre-commit");
      await fs.writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      await fs.chmod(hook, 0o755);
      await fs.appendFile(path.join(fixture.root, "tracked.txt"), "beta\n", "utf8");
      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      const readService = new GitReadServiceV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        contextFingerprint: "context-v4-mutation",
        integrationGate: gate
      });
      const context = new GitMutationContextV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        readService,
        contextFingerprint: "context-v4-mutation"
      });
      const index = new GitIndexServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const status = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const originalHead = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim();
      const tree = runGit(fixture.root, ["rev-parse", "HEAD^{tree}"]).stdout.toString("ascii").trim();
      const racedHead = runGit(
        fixture.root,
        ["commit-tree", tree, "-p", originalHead],
        Buffer.from("approved integration ref race\n", "utf8")
      ).stdout.toString("ascii").trim();
      const executeApproved = fixture.executor.runApprovedIntegration.bind(fixture.executor);
      fixture.executor.runApprovedIntegration = async (repository, request) => {
        const result = await executeApproved(repository, request);
        if (request.operation === "stage") {
          runGit(fixture.root, ["update-ref", "refs/heads/main", racedHead, originalHead]);
        }
        return result;
      };
      await assert.rejects(() => index.stageApproved({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"],
        integrationReviewToken: status.integration_review_token,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: status.repository_id
        })
      }), /GIT_REF_CHANGED/);
      assert.equal(runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim(), racedHead);
      assert.equal(runGit(fixture.root, ["diff", "--cached", "--name-only"]).stdout.length, 0);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X executes an immutable integration snapshot across final revalidation and spawn", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 80) });
    try {
      const script = path.join(fixture.root, "reviewed-filter.mjs");
      const marker = path.join(fixture.root, "snapshot-marker.txt");
      const source = (label) => [
        "import fs from 'node:fs';",
        "let parentCommand = null;",
        "try { parentCommand = fs.readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').replaceAll('\\0', ' ').trim(); } catch {}",
        `fs.appendFileSync(process.argv[2], JSON.stringify({ label: ${JSON.stringify(label)}, parentCommand, argv: process.argv }) + '\\n');`,
        "process.stdin.pipe(process.stdout);",
        ""
      ].join("\n");
      await fs.writeFile(script, source("reviewed"), "utf8");
      const filterCommand = `${quote(process.execPath)} ${quote(script)} ${quote(marker)}`;
      runGit(fixture.root, ["config", "filter.snapshot.clean", filterCommand]);
      await fs.writeFile(path.join(fixture.root, ".gitattributes"), "tracked.txt filter=snapshot\n", "utf8");
      runGit(fixture.root, ["add", ".gitattributes"]);
      runGit(fixture.root, ["commit", "-m", "snapshot attributes"]);
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "snapshot content\n", "utf8");
      const baseExecute = fixture.executor.runApprovedIntegration.bind(fixture.executor);
      const executor = {
        ...fixture.executor,
        async runApprovedIntegration(repository, request) {
          const retainedCommand = runGit(fixture.root, [
            "config",
            "--file",
            path.join(request.integrationGitDir, "config"),
            "--get-all",
            "filter.snapshot.clean"
          ], undefined, { allowFailure: true });
          assert.equal(retainedCommand.status, 1);
          assert.equal(request.integrationConfigOverrides.some((entry) => entry.includes(script)), false);
          await fs.rm(marker, { force: true });
          await fs.writeFile(script, source("drifted"), "utf8");
          return baseExecute(repository, request);
        }
      };
      const gate = new GitIntegrationGateV4({ executor, reviews, enabled: true });
      const readService = new GitReadServiceV4({
        executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        contextFingerprint: "context-v4-mutation",
        integrationGate: gate
      });
      const context = new GitMutationContextV4({
        executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        readService,
        contextFingerprint: "context-v4-mutation"
      });
      const index = new GitIndexServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const status = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const staged = await index.stageApproved({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"],
        integrationReviewToken: status.integration_review_token,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: status.repository_id
        })
      });
      assert.equal(staged.normalization, "approved_full_access");
      const executions = (await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
      assert.ok(executions.length >= 1);
      assert.deepEqual(new Set(executions.map((entry) => entry.label)), new Set(["reviewed"]), executions);
      assert.match(await fs.readFile(script, "utf8"), /drifted/u);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X binds interpreted script dependencies and burns review on script drift", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 76) });
    try {
      const script = path.join(fixture.root, "reviewed-filter.mjs");
      const marker = path.join(fixture.root, "dependency-marker.txt");
      await fs.copyFile(path.resolve("fixtures", "git-canary-child.mjs"), script);
      runGit(fixture.root, ["config", "filter.dependency.clean", `${quote(process.execPath)} ${quote(script)} ${quote(marker)} dependency`]);
      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      const repository = await import("../dist/git/repositoryIdentity.js").then(({ admitGitRepository }) =>
        admitGitRepository({
          workspaceRoot: fixture.workspace.root,
          executor: fixture.executor,
          registry: fixture.registry
        })
      );
      const reviewed = await gate.review({
        workspaceId: fixture.workspace.id,
        repository,
        semanticStateDigest: "9".repeat(64)
      });
      const realScript = await fs.realpath(script);
      assert.ok(gate.approvalPreview(reviewed.reviewToken).some((entry) => entry.endsWith(realScript)));
      await fs.appendFile(script, "\n// drift\n", "utf8");
      await assert.rejects(() => gate.execute({
        workspaceId: fixture.workspace.id,
        repository,
        reviewToken: reviewed.reviewToken,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: repository.repositoryId
        }),
        semanticStateDigest: "9".repeat(64),
        expectedToolName: "git_stage",
        expectedCanonicalAction: "stage",
        request: {
          operation: "stage",
          paths: ["tracked.txt"],
          privateIndexPath: path.join(fixture.root, "private-index"),
          objectDirectoryPath: path.join(fixture.root, "private-objects")
        }
      }), /GIT_STATE_CHANGED/);
      assert.equal(fixture.approvedCalls.length, 0);
      assert.throws(() => gate.inspect(reviewed.reviewToken), /GIT_STATE_TOKEN_INVALID/);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X fails closed when executable identity fan-out exceeds its bounded review budget", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 77) });
    try {
      for (let index = 0; index < 33; index += 1) {
        const executable = path.join(fixture.root, `filter-${String(index).padStart(2, "0")}.cmd`);
        await fs.writeFile(executable, "@exit /b 0\n", "utf8");
        runGit(fixture.root, ["config", `filter.f${index}.clean`, quote(executable)]);
      }
      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      const repository = await import("../dist/git/repositoryIdentity.js").then(({ admitGitRepository }) =>
        admitGitRepository({
          workspaceRoot: fixture.workspace.root,
          executor: fixture.executor,
          registry: fixture.registry
        })
      );
      await assert.rejects(() => gate.review({
        workspaceId: fixture.workspace.id,
        repository,
        semanticStateDigest: "a".repeat(64)
      }), /GIT_SCAN_LIMIT/);
      assert.equal(fixture.approvedCalls.length, 0);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X signs only the shadow commit through an explicitly reviewed SSH signer", {
  skip: process.platform !== "win32"
}, async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 78) });
    try {
      const systemSigner = path.join(process.env.WINDIR ?? "C:\\Windows", "System32", "OpenSSH", "ssh-keygen.exe");
      const signer = path.join(fixture.root, ".git", "codexgpt-ssh-keygen.exe");
      const key = path.join(fixture.root, ".git", "codexgpt-signing-key");
      const generated = spawnSync(systemSigner, ["-q", "-t", "ed25519", "-N", "", "-f", key], {
        cwd: fixture.root,
        encoding: "utf8",
        shell: false,
        windowsHide: true
      });
      assert.equal(generated.status, 0, generated.stderr || generated.stdout);
      await fs.copyFile(systemSigner, signer);
      runGit(fixture.root, ["config", "commit.gpgsign", "true"]);
      runGit(fixture.root, ["config", "gpg.format", "ssh"]);
      runGit(fixture.root, ["config", "gpg.ssh.program", signer]);
      runGit(fixture.root, ["config", "user.signingkey", key]);
      await fs.writeFile(path.join(fixture.root, "tracked.txt"), "signed\n", "utf8");

      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      const readService = new GitReadServiceV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        contextFingerprint: "context-v4-mutation",
        integrationGate: gate
      });
      const context = new GitMutationContextV4({
        executor: fixture.executor,
        registry: fixture.registry,
        stateTokens: fixture.stateTokens,
        readService,
        contextFingerprint: "context-v4-mutation"
      });
      const index = new GitIndexServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const commit = new GitCommitServiceV4(context, fixture.indexTokens, { integrationGate: gate });
      const status = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard,
        paths: ["tracked.txt"]
      });
      const realSigner = await fs.realpath(signer);
      assert.ok(gate.approvalPreview(status.integration_review_token).some((entry) => entry.endsWith(realSigner)));
      const staged = await index.stageApproved({
        workspace: fixture.workspace,
        guard: fixture.guard,
        stateToken: status.state_token,
        paths: ["tracked.txt"],
        integrationReviewToken: status.integration_review_token,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: status.repository_id
        })
      });
      const commitStatus = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard
      });
      const committed = await commit.commitApproved({
        workspace: fixture.workspace,
        guard: fixture.guard,
        indexToken: staged.index_token,
        message: "signed through reviewed configuration",
        integrationReviewToken: commitStatus.integration_review_token,
        authorization: authorization({
          toolName: "git_commit",
          canonicalAction: "commit",
          workspaceId: fixture.workspace.id,
          repositoryId: commitStatus.repository_id
        })
      });
      assert.equal(committed.signature, "repository_config");
      assert.equal(committed.hooks_executed, false);
      const raw = runGit(fixture.root, ["cat-file", "commit", committed.commit_oid]).stdout.toString("utf8");
      assert.match(raw, /^gpgsig -----BEGIN SSH SIGNATURE-----/mu);
    } finally {
      reviews.dispose();
    }
  });
});

test("Gate X rejects signing configurations whose effective executable is not exactly reviewable", async () => {
  const cases = [
    {
      name: "ssh does not fall back to gpg.program",
      entries: [["gpg.format", "ssh"], ["gpg.program", process.execPath]]
    },
    {
      name: "x509 does not fall back to gpg.program",
      entries: [["gpg.format", "x509"], ["gpg.program", process.execPath]]
    },
    {
      name: "ssh defaultKeyCommand is never ambient",
      entries: [
        ["gpg.format", "ssh"],
        ["gpg.ssh.program", process.execPath],
        ["gpg.ssh.defaultKeyCommand", process.execPath]
      ]
    }
  ];
  for (const current of cases) {
    await withGitMutationRepository(async (fixture) => {
      const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 81) });
      try {
        runGit(fixture.root, ["config", "commit.gpgsign", "true"]);
        runGit(fixture.root, ["config", "user.signingkey", "gate-x-test-key"]);
        for (const [key, value] of current.entries) runGit(fixture.root, ["config", key, value]);
        const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
        const repository = await import("../dist/git/repositoryIdentity.js").then(({ admitGitRepository }) =>
          admitGitRepository({
            workspaceRoot: fixture.workspace.root,
            executor: fixture.executor,
            registry: fixture.registry
          })
        );
        await assert.rejects(() => gate.review({
          workspaceId: fixture.workspace.id,
          repository,
          semanticStateDigest: "b".repeat(64)
        }), /GIT_INTEGRATION_REQUIRED/, current.name);
        assert.equal(fixture.approvedCalls.length, 0, current.name);
      } finally {
        reviews.dispose();
      }
    });
  }
});

test("Gate X burns a reviewed token on executable identity drift before spawn", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 74) });
    try {
      const hook = path.join(fixture.root, ".git", "hooks", "pre-commit");
      await fs.writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      await fs.chmod(hook, 0o755);
      const gate = new GitIntegrationGateV4({ executor: fixture.executor, reviews, enabled: true });
      const repository = await import("../dist/git/repositoryIdentity.js").then(({ admitGitRepository }) =>
        admitGitRepository({
          workspaceRoot: fixture.workspace.root,
          executor: fixture.executor,
          registry: fixture.registry
        })
      );
      const reviewed = await gate.review({
        workspaceId: fixture.workspace.id,
        repository,
        semanticStateDigest: "7".repeat(64)
      });
      await fs.appendFile(hook, "exit 1\n");
      const callsBefore = fixture.approvedCalls.length;
      await assert.rejects(() => gate.execute({
        workspaceId: fixture.workspace.id,
        repository,
        reviewToken: reviewed.reviewToken,
        authorization: authorization({
          toolName: "git_stage",
          canonicalAction: "stage",
          workspaceId: fixture.workspace.id,
          repositoryId: repository.repositoryId
        }),
        semanticStateDigest: "7".repeat(64),
        expectedToolName: "git_stage",
        expectedCanonicalAction: "stage",
        request: {
          operation: "stage",
          paths: ["tracked.txt"],
          privateIndexPath: path.join(fixture.root, "private-index"),
          objectDirectoryPath: path.join(fixture.root, "private-objects")
        }
      }), /GIT_STATE_CHANGED/);
      assert.equal(fixture.approvedCalls.length, callsBefore);
      assert.throws(() => gate.inspect(reviewed.reviewToken), /GIT_STATE_TOKEN_INVALID/);
    } finally {
      reviews.dispose();
    }
  });
});

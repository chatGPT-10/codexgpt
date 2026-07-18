import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { withGitMutationRepository, runGit } from "../fixtures/git-v4-test-helper.mjs";
import { GitReadServiceV4 } from "../dist/git/readService.js";
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

test("Gate X stages through a private index, runs reviewed filters, and commits through a shadow Git dir", async () => {
  await withGitMutationRepository(async (fixture) => {
    const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 73) });
    try {
      const marker = path.join(fixture.root, "integration-marker.txt");
      const canary = path.resolve("fixtures", "git-canary-child.mjs");
      const filterCommand = `${quote(process.execPath)} ${quote(canary)} ${quote(marker)} filter`;
      runGit(fixture.root, ["config", "filter.codexpro.clean", filterCommand]);
      await fs.writeFile(path.join(fixture.root, ".gitattributes"), "tracked.txt filter=codexpro\n", "utf8");
      runGit(fixture.root, ["add", ".gitattributes"]);
      runGit(fixture.root, ["commit", "-m", "attributes"]);
      await fs.rm(marker, { force: true });
      const hook = path.join(fixture.root, ".git", "hooks", "pre-commit");
      await fs.writeFile(hook, [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.appendFileSync(${JSON.stringify(marker)}, 'hook\\n');`,
        ""
      ].join("\n"), { mode: 0o755 });
      await fs.chmod(hook, 0o755);
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
      const stageMarkers = (await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u);
      assert.ok(stageMarkers.length >= 1);
      assert.deepEqual(new Set(stageMarkers), new Set(["filter"]));
      assert.equal(fixture.approvedCalls[0].operation, "stage");
      assert.ok(fixture.approvedCalls[0].privateIndexPath.includes("git-integration-stage-"));

      const commitStatus = await readService.status({
        workspace: fixture.workspace,
        guard: fixture.guard
      });
      const beforeHead = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout.toString("ascii").trim();
      const committed = await commit.commitApproved({
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

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runGit } from "../fixtures/git-v4-test-helper.mjs";
import {
  createChangedTask,
  withTaskWorktreeFixture
} from "../fixtures/task-worktree-v4-helper.mjs";
import { CandidateVerificationWorkspaceV4 } from "../dist/worktrees/candidateWorkspace.js";
import { TaskWorktreeMergePrepareV4 } from "../dist/worktrees/mergePrepare.js";
import { TaskWorktreeServiceV4 } from "../dist/worktrees/service.js";

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function authorization(fixture, described, canonicalAction) {
  return {
    schemaVersion: 4,
    contractVersion: 4,
    eventId: `event_${canonicalAction}`,
    eventType: "authorization",
    timestamp: new Date().toISOString(),
    requestId: `request_${canonicalAction}`,
    authorizationEventId: null,
    decisionId: `decision_${canonicalAction}`,
    toolName: "merge_task_worktree",
    canonicalAction,
    workspaceId: fixture.workspace.id,
    policyRevision: "policy_gate_x_worktree",
    subjectFingerprint: "subject_gate_x_worktree",
    contextFingerprint: "context-v4-mutation",
    resultCode: "ALLOW",
    counts: {},
    repositoryId: described.resource.repositoryId,
    taskWorktreeId: described.resource.worktreeId,
    operationId: null,
    outcome: "allow",
    riskClass: "R3",
    resourceFingerprint: described.resource.resourceFingerprint,
    approvalId: `approval_${canonicalAction}`,
    grantId: `grant_${canonicalAction}`
  };
}

async function approvedMerge(fixture, input, integrationReviewToken) {
  const args = {
    action: input.action,
    workspace_id: fixture.workspace.id,
    task_worktree_id: input.taskWorktreeId,
    integration_review_token: integrationReviewToken
  };
  let canonicalAction;
  if (input.action === "prepare") {
    canonicalAction = "task_merge_prepare_review";
    if (input.message) args.message = input.message;
  } else if (input.action === "finalize") {
    canonicalAction = "task_merge_prepare_finalize";
    args.review_token = input.reviewToken;
  } else {
    canonicalAction = "task_merge_execute";
    args.merge_plan_id = input.mergePlanId;
    args.verification_receipts = input.verificationReceipts ?? [];
    args.skip_checks = input.skipChecks === true;
  }
  const described = fixture.service.describe("merge_task_worktree", args);
  assert.equal(described.riskClass, "R3");
  assert.equal(
    described.requiredScopes.includes("host:full-access"),
    typeof integrationReviewToken === "string"
  );
  return fixture.service.merge({
    ...input,
    workspace: fixture.workspace,
    guard: fixture.guard,
    integrationReviewToken,
    authorization: authorization(fixture, described, canonicalAction)
  });
}

async function integrationStatus(fixture) {
  return fixture.integrationReadService.status({
    workspace: fixture.workspace,
    guard: fixture.guard
  });
}

test("Gate X uses only private checkout hydration for an approved fast-forward merge", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const task = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(
      path.join(task.privateState.worktreePath, ".gitattributes"),
      "tracked.txt filter=codexpro\n",
      "utf8"
    );
    runGit(task.privateState.worktreePath, ["add", ".gitattributes"]);
    runGit(task.privateState.worktreePath, ["commit", "-m", "task attributes"]);

    const marker = path.join(fixture.workspace.root, "checkout-filter-marker.txt");
    const canary = path.resolve("fixtures", "git-canary-child.mjs");
    runGit(fixture.workspace.root, [
      "config",
      "filter.codexpro.smudge",
      `${quote(process.execPath)} ${quote(canary)} ${quote(marker)} checkout`
    ]);

    const prepareStatus = await integrationStatus(fixture);
    assert.throws(() => fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id
    }), /GIT_INTEGRATION_REQUIRED/);
    const prepared = await approvedMerge(fixture, {
      action: "prepare",
      taskWorktreeId: created.task.task_worktree_id
    }, prepareStatus.integration_review_token);
    assert.equal(prepared.status, "checks_required");
    assert.equal(prepared.repository_integrations, "approved_full_access");
    assert.equal(fixture.approvedCalls.length, 0);

    const executeStatus = await integrationStatus(fixture);
    const executed = await approvedMerge(fixture, {
      action: "execute",
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true
    }, executeStatus.integration_review_token);
    assert.equal(executed.integrated, true);
    assert.equal(executed.repository_integrations, "approved_full_access");
    assert.equal(executed.execution_isolation, "none");
    assert.equal(fixture.approvedCalls.length, 1);
    assert.equal(fixture.approvedCalls[0].operation, "checkout_index");
    assert.deepEqual(
      new Set((await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u)),
      new Set(["checkout"])
    );
    await assert.rejects(() => fs.lstat(fixture.approvedCalls[0].destinationPrefix), { code: "ENOENT" });
  }, { integrations: true });
});

test("Gate X rejects a checkout integration that mutates its private index", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const task = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(
      path.join(task.privateState.worktreePath, ".gitattributes"),
      "tracked.txt filter=index-drift\n",
      "utf8"
    );
    runGit(task.privateState.worktreePath, ["add", ".gitattributes"]);
    runGit(task.privateState.worktreePath, ["commit", "-m", "index drift attributes"]);

    const filter = path.join(fixture.base, "index-drift-filter.mjs");
    await fs.writeFile(filter, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "for await (const chunk of process.stdin) process.stdout.write(chunk);",
      "fs.writeFileSync(process.env.GIT_INDEX_FILE, Buffer.from('corrupt-private-index'));",
      ""
    ].join("\n"), { mode: 0o755 });
    runGit(fixture.workspace.root, [
      "config",
      "filter.index-drift.smudge",
      `${quote(process.execPath)} ${quote(filter)}`
    ]);

    const prepareStatus = await integrationStatus(fixture);
    const prepared = await approvedMerge(fixture, {
      action: "prepare",
      taskWorktreeId: created.task.task_worktree_id
    }, prepareStatus.integration_review_token);
    const headBefore = runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim();
    const executeStatus = await integrationStatus(fixture);
    await assert.rejects(() => approvedMerge(fixture, {
      action: "execute",
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true
    }, executeStatus.integration_review_token), /GIT_INDEX_CHANGED|GIT_STATE_CHANGED/);
    assert.equal(runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim(), headBefore);
    assert.equal(runGit(fixture.workspace.root, ["status", "--porcelain"]).status, 0);
  }, { integrations: true });
});

test("Gate X performs divergent custom-driver planning only in object quarantine", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    await fs.writeFile(path.join(fixture.workspace.root, "tracked.txt"), "main-change\n", "utf8");
    runGit(fixture.workspace.root, ["add", "tracked.txt"]);
    runGit(fixture.workspace.root, ["commit", "-m", "main change"]);

    const marker = path.join(fixture.workspace.root, "merge-driver-marker.txt");
    const driver = path.join(fixture.workspace.root, "merge-driver.mjs");
    const unreachableContent = Buffer.from("unreachable quarantine canary\n", "utf8");
    const unreachableOid = runGit(fixture.workspace.root, ["hash-object", "--stdin"], unreachableContent)
      .stdout.toString("ascii").trim();
    await fs.writeFile(driver, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "import { createHash } from 'node:crypto';",
      "import { deflateSync } from 'node:zlib';",
      "const [marker, current, other] = process.argv.slice(2);",
      "fs.appendFileSync(marker, 'merge-driver\\n');",
      "fs.copyFileSync(other, current);",
      `const body = Buffer.from(${JSON.stringify(unreachableContent.toString("utf8"))}, 'utf8');`,
      "const loose = Buffer.concat([Buffer.from(`blob ${body.length}\\0`, 'ascii'), body]);",
      "const oid = createHash('sha1').update(loose).digest('hex');",
      "const target = path.join(process.env.GIT_OBJECT_DIRECTORY, oid.slice(0, 2), oid.slice(2));",
      "fs.mkdirSync(path.dirname(target), { recursive: true });",
      "fs.writeFileSync(target, deflateSync(loose), { flag: 'wx' });",
      ""
    ].join("\n"), { mode: 0o755 });
    runGit(fixture.workspace.root, [
      "config",
      "merge.codexpro.driver",
      `${quote(process.execPath)} ${quote(driver)} ${quote(marker)} %A %B`
    ]);
    runGit(fixture.workspace.root, ["config", "merge.default", "codexpro"]);

    const prepareStatus = await integrationStatus(fixture);
    const reviewed = await approvedMerge(fixture, {
      action: "prepare",
      taskWorktreeId: created.task.task_worktree_id,
      message: "reviewed custom merge"
    }, prepareStatus.integration_review_token);
    assert.equal(reviewed.status, "approval_required");
    assert.equal(reviewed.repository_integrations, "approved_full_access");
    assert.equal(fixture.approvedCalls.length, 1);
    assert.equal(fixture.approvedCalls[0].operation, "merge_tree");
    await assert.rejects(() => fs.lstat(fixture.approvedCalls[0].objectDirectoryPath), { code: "ENOENT" });
    const reviewedFacts = fixture.reviews.inspect(reviewed.review_token, "task_merge_finalize");
    const retainedRoot = path.join(fixture.root.root, reviewedFacts.artifactId);
    assert.equal((await fs.lstat(path.join(retainedRoot, "objects"))).isDirectory(), true);
    assert.notEqual(runGit(fixture.workspace.root, ["cat-file", "-e", reviewed.candidate_oid], undefined, {
      allowFailure: true
    }).status, 0);
    const retainedCandidate = path.join(
      retainedRoot,
      "objects",
      reviewed.candidate_oid.slice(0, 2),
      reviewed.candidate_oid.slice(2)
    );
    const exactCandidateBytes = await fs.readFile(retainedCandidate);
    await fs.chmod(retainedCandidate, 0o600);
    await fs.writeFile(retainedCandidate, Buffer.from("corrupt reviewed candidate", "utf8"));
    const tamperDescription = fixture.service.describe("merge_task_worktree", {
      action: "finalize",
      workspace_id: fixture.workspace.id,
      task_worktree_id: created.task.task_worktree_id,
      review_token: reviewed.review_token
    });
    await assert.rejects(() => fixture.service.merge({
      action: "finalize",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      reviewToken: reviewed.review_token,
      authorization: authorization(fixture, tamperDescription, "task_merge_prepare_finalize")
    }), /GIT_MERGE_CAPABILITY_UNAVAILABLE|GIT_STATE_CHANGED/);
    assert.equal(fixture.approvedCalls.length, 1);
    await fs.writeFile(retainedCandidate, exactCandidateBytes);

    fixture.baseCandidateWorkspaces.dispose();
    const restartedCandidates = new CandidateVerificationWorkspaceV4({
      manager: fixture.manager,
      guard: fixture.guard,
      ownerFingerprint: () => fixture.ownerFingerprint,
      contextFingerprint: () => "context-v4-mutation",
      verificationReceipts: fixture.verificationReceipts,
      stateRoot: fixture.stateRoot,
      masterKey: Buffer.alloc(32, 74)
    });
    try {
      const restartedPrepare = new TaskWorktreeMergePrepareV4({
        manager: fixture.manager,
        plans: fixture.plans,
        reviews: fixture.reviews,
        ownerFingerprint: () => fixture.ownerFingerprint,
        integrationGate: fixture.integrationGate,
        candidateWorkspaces: restartedCandidates
      });
      const restartedService = new TaskWorktreeServiceV4({
        manager: fixture.manager,
        authority: fixture.authority,
        ownerFingerprint: () => fixture.ownerFingerprint,
        mergePrepare: restartedPrepare,
        integrationGate: fixture.integrationGate
      });
      const described = restartedService.describe("merge_task_worktree", {
        action: "finalize",
        workspace_id: fixture.workspace.id,
        task_worktree_id: created.task.task_worktree_id,
        review_token: reviewed.review_token
      });
      const prepared = await restartedService.merge({
        action: "finalize",
        workspace: fixture.workspace,
        guard: fixture.guard,
        taskWorktreeId: created.task.task_worktree_id,
        reviewToken: reviewed.review_token,
        authorization: authorization(fixture, described, "task_merge_prepare_finalize")
      });
      assert.equal(prepared.status, "checks_required");
      assert.equal(prepared.repository_integrations, "approved_full_access");
      assert.equal(fixture.approvedCalls.length, 1);
      assert.equal((await fs.readFile(marker, "utf8")).trim().split(/\r?\n/u).length, 1);
      assert.notEqual(runGit(fixture.workspace.root, ["cat-file", "-e", unreachableOid], undefined, {
        allowFailure: true
      }).status, 0);
      await assert.rejects(() => fs.lstat(retainedRoot), { code: "ENOENT" });
    } finally {
      restartedCandidates.dispose();
    }
  }, { integrations: true, durableLifecycle: true });
});

test("Gate X bounds aggregate filter expansion before any live merge write", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const task = fixture.store.read(created.task.task_worktree_id);
    await fs.writeFile(path.join(task.privateState.worktreePath, ".gitattributes"), [
      "expanded-a.txt filter=expand",
      "expanded-b.txt filter=expand",
      ""
    ].join("\n"), "utf8");
    await fs.writeFile(path.join(task.privateState.worktreePath, "expanded-a.txt"), "a\n", "utf8");
    await fs.writeFile(path.join(task.privateState.worktreePath, "expanded-b.txt"), "b\n", "utf8");
    runGit(task.privateState.worktreePath, ["add", ".gitattributes", "expanded-a.txt", "expanded-b.txt"]);
    runGit(task.privateState.worktreePath, ["commit", "-m", "expanding filter inputs"]);

    const expander = path.join(fixture.base, "expanding-filter.mjs");
    await fs.writeFile(expander, [
      "#!/usr/bin/env node",
      "for await (const _chunk of process.stdin) {}",
      "process.stdout.write(Buffer.alloc(1200 * 1024, 120));",
      ""
    ].join("\n"), { mode: 0o755 });
    runGit(fixture.workspace.root, [
      "config",
      "filter.expand.smudge",
      `${quote(process.execPath)} ${quote(expander)}`
    ]);

    const prepareStatus = await integrationStatus(fixture);
    const prepared = await approvedMerge(fixture, {
      action: "prepare",
      taskWorktreeId: created.task.task_worktree_id
    }, prepareStatus.integration_review_token);
    const headBefore = runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim();
    const executeStatus = await integrationStatus(fixture);
    await assert.rejects(() => approvedMerge(fixture, {
      action: "execute",
      taskWorktreeId: created.task.task_worktree_id,
      mergePlanId: prepared.merge_plan_id,
      skipChecks: true
    }, executeStatus.integration_review_token), /GIT_SCAN_LIMIT/);
    assert.equal(runGit(fixture.workspace.root, ["rev-parse", "HEAD"]).stdout.toString().trim(), headBefore);
    await assert.rejects(() => fs.lstat(path.join(fixture.workspace.root, "expanded-a.txt")), { code: "ENOENT" });
    await assert.rejects(() => fs.lstat(path.join(fixture.workspace.root, "expanded-b.txt")), { code: "ENOENT" });
    const checkout = fixture.approvedCalls.find((call) => call.operation === "checkout_index");
    assert.ok(checkout);
    await assert.rejects(() => fs.lstat(checkout.destinationPrefix), { code: "ENOENT" });
  }, { integrations: true, maxBytes: 2 * 1024 * 1024 });
});

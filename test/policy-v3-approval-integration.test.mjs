import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PersistentAuditRuntimeV2,
  PersistentAuditStore
} from "../dist/audit/index.js";
import { LocalApprovalRuntimeV3 } from "../dist/control/runtime.js";
import { PathGuard, WorkspaceManager } from "../dist/guard.js";
import { createStdioPolicySessionSource } from "../dist/policy/identity.js";
import { createDefaultPolicyRuntime, policyIdentityScopes } from "../dist/policy/runtime.js";
import { describeProcessActionResourceV3 } from "../dist/policy/executionResources.js";
import { ProcessInstanceRegistry } from "../dist/transactions/workspaceLock.js";

function config(root) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    allowHome: false,
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: undefined,
    requireHttpToken: false,
    allowedHosts: ["127.0.0.1:8787"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(root, ".codex-test"),
    writeMode: "workspace",
    toolMode: "minimal",
    toolContractVersion: 3,
    policyEngineMode: "enforce",
    permissionProfileId: undefined,
    localFileAccess: "configured_roots",
    executionProfile: "off",
    executionDependencies: "off",
    auditMode: "required",
    auditRetention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 },
    fileTransactions: "legacy",
    changeSetRetention: { activeRetentionMs: 24 * 60 * 60_000, terminalRetentionMs: 24 * 60 * 60_000 },
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    workspaceTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", "node_modules/**"],
    contextDir: ".ai-bridge",
    toolCards: false,
    connectionTest: false,
    analysisEnabled: false,
    analysisLimits: {
      maxInventoryFiles: 20_000,
      maxAnalyzedFiles: 5_000,
      maxScannedBytes: 67_108_864,
      maxSymbols: 100_000,
      maxRelationships: 250_000
    }
  };
}

test("V3 default policy runtime issues durable pending state and atomically reserves one exact retry", async (t) => {
  const workspaceRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-v3-policy-workspace-")));
  const stateRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-v3-policy-state-")));
  const registry = new ProcessInstanceRegistry(stateRoot);
  const auditStore = PersistentAuditStore.open({
    stateRoot,
    registry,
    retention: { maxAgeDays: 30, maxClosedBytes: 100 * 1024 * 1024 }
  });
  const approvalRuntime = await LocalApprovalRuntimeV3.start({
    auditStore,
    stateBaseRoot: path.join(stateRoot, "control"),
    startNativeControl: false
  });
  t.after(async () => {
    await approvalRuntime.close().catch(() => {});
    auditStore.dispose();
    registry.dispose();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });

  const activeConfig = config(workspaceRoot);
  const workspaces = new WorkspaceManager(activeConfig, {
    transportSessionId: () => "session-v3-policy",
    identityBinding: "identity-v3-policy",
    policyRevision: () => "policy-test"
  });
  const workspace = workspaces.defaultWorkspace();
  const guard = new PathGuard(activeConfig);
  const sessionSource = createStdioPolicySessionSource({
    sessionId: "session-v3-policy",
    scopes: policyIdentityScopes(activeConfig)
  });
  const persistentAudit = new PersistentAuditRuntimeV2(auditStore);
  for (const contractVersion of [1, 2]) {
    const legacyConfig = { ...activeConfig, toolContractVersion: contractVersion };
    const legacyRuntime = createDefaultPolicyRuntime({
      config: legacyConfig,
      workspaces,
      guard,
      sessionSource,
      persistentAudit,
      localApprovalRuntimeV3: approvalRuntime
    });
    const legacyResult = await legacyRuntime.authorize("write", {
      workspace_id: workspace.id,
      path: `legacy-${contractVersion}.txt`,
      content: "legacy wire remains unchanged"
    });
    assert.equal(legacyResult.decision.outcome, "approval_required");
    assert.equal(legacyResult.localApproval, undefined);
  }
  assert.equal(approvalRuntime.approvals.size(), 0, "V1/V2 must create no pending approval state");

  const runtime = createDefaultPolicyRuntime({
    config: activeConfig,
    workspaces,
    guard,
    sessionSource,
    persistentAudit,
    localApprovalRuntimeV3: approvalRuntime
  });
  const args = {
    workspace_id: workspace.id,
    path: "approved.txt",
    content: "bounded test content"
  };

  const first = await runtime.authorize("write", args);
  assert.equal(first.decision.outcome, "approval_required");
  assert.equal(first.localApproval.serverId, approvalRuntime.serverId);
  assert.match(first.localApproval.approvalId, /^approval_[a-f0-9]{32}$/);
  assert.equal(approvalRuntime.approvals.size(), 1);
  assert.equal(JSON.stringify(approvalRuntime.approvals.snapshot()).includes("bounded test content"), false);

  const localDecision = await approvalRuntime.server.handle({
    schemaVersion: 3,
    contractVersion: 3,
    operation: "approvals.approve",
    serverId: approvalRuntime.serverId,
    approvalId: first.localApproval.approvalId
  });
  assert.equal(localDecision.code, "APPROVAL_GRANTED");

  const retries = await Promise.all(Array.from({ length: 24 }, () => runtime.authorize("write", args)));
  const winners = retries.filter((result) => result.decision.outcome === "allow" && result.reservation);
  assert.equal(winners.length, 1);
  assert.equal(retries.filter((result) => result.decision.outcome === "approval_required").length, 23);

  const winner = winners[0];
  assert.ok(winner.auditContext);
  await runtime.persistAuthorization(winner.auditContext);
  await runtime.persistExecution(winner.auditContext, {
    status: "succeeded",
    resultCode: null,
    durationMs: 1,
    exitCode: null,
    boundedByteCounts: { after_bytes: 1 },
    changeSetId: null,
    revertsChangeSetId: null,
    operationCount: 0,
    mutationKinds: [],
    recoveryRequired: false
  });
  await winner.reservation.commit();
  assert.equal(approvalRuntime.approvals.get(first.localApproval.approvalId).state, "consumed");
  assert.equal(approvalRuntime.grants.size(), 1, "R2 grants remain reusable until expiry; R3 one-use is covered separately");

  const reusable = await runtime.authorize("write", args);
  assert.equal(reusable.decision.outcome, "allow");
  assert.ok(reusable.reservation);
  await runtime.persistAuthorization(reusable.auditContext);
  await reusable.reservation.commit();
  assert.equal(approvalRuntime.approvals.get(first.localApproval.approvalId).state, "consumed");
  assert.equal(approvalRuntime.grants.size(), 1);

  for (const inheritedContractVersion of [4, 5]) {
    const inheritedConfig = { ...activeConfig, toolContractVersion: inheritedContractVersion };
    const inheritedRuntime = createDefaultPolicyRuntime({
      config: inheritedConfig,
      workspaces,
      guard,
      sessionSource,
      persistentAudit,
      localApprovalRuntimeV3: approvalRuntime
    });
    const inheritedArgs = {
      workspace_id: workspace.id,
      path: `approved-v${inheritedContractVersion}.txt`,
      content: `bounded inherited contract ${inheritedContractVersion}`
    };
    const inheritedFirst = await inheritedRuntime.authorize("write", inheritedArgs);
    assert.equal(inheritedFirst.decision.outcome, "approval_required");
    const inheritedApproval = approvalRuntime.approvals.get(inheritedFirst.localApproval.approvalId);
    assert.equal(inheritedApproval.facts.toolContractVersion, String(inheritedContractVersion));
    await approvalRuntime.server.handle({
      schemaVersion: 3,
      contractVersion: 3,
      operation: "approvals.approve",
      serverId: approvalRuntime.serverId,
      approvalId: inheritedFirst.localApproval.approvalId
    });
    const inheritedRetry = await inheritedRuntime.authorize("write", inheritedArgs);
    assert.equal(inheritedRetry.decision.outcome, "allow");
    assert.ok(inheritedRetry.reservation);
    await inheritedRetry.reservation.commit();
    const inheritedConsumed = approvalRuntime.approvals.get(inheritedFirst.localApproval.approvalId);
    assert.match(inheritedConsumed.grantId, /^grant_[a-f0-9]{24}$/);
    approvalRuntime.grants.revokeGrant(inheritedConsumed.grantId);
  }

  const executionConfig = { ...activeConfig, executionProfile: "full_access" };
  const executionResource = {
    schemaVersion: 3,
    kind: "execution",
    operation: "run_command",
    backendId: "fake",
    argumentCount: 2,
    accessMode: "full_access",
    workspaceId: null,
    resourceFingerprint: `sha256:${"a".repeat(64)}`
  };
  const executionRuntime = createDefaultPolicyRuntime({
    config: executionConfig,
    workspaces,
    guard,
    sessionSource,
    persistentAudit,
    localApprovalRuntimeV3: approvalRuntime,
    resourceResolver: {
      describe: () => ({
        resource: executionResource,
        semanticFactsDigest: `sha256:${"b".repeat(64)}`,
        riskClass: "R3",
        requiredScopes: ["shell:execute", "process:manage", "host:full-access"]
      })
    }
  });
  const executionArgs = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: ["one", "two words"] }, cwd: { kind: "absolute_local", path: workspaceRoot }, mode: "full_access" };
  const executionFirst = await executionRuntime.authorize("run_command", executionArgs);
  assert.equal(executionFirst.decision.outcome, "approval_required");
  const executionApproval = approvalRuntime.approvals.get(executionFirst.localApproval.approvalId);
  assert.equal(executionApproval.summary.backend, "fake");
  assert.match(executionApproval.summary.authoritySummary, /current-user unrestricted filesystem, credentials, registry, and network/);
  assert.deepEqual(executionApproval.summary.revealArguments, ["C:\\bound\\tool.exe", "one", "two words"]);

  const gitRevealArguments = [
    "filter: C:\\reviewed\\filter.exe",
    "hook: C:\\reviewed\\pre-commit.cmd"
  ];
  const gitDisplayRuntime = createDefaultPolicyRuntime({
    config: executionConfig,
    workspaces,
    guard,
    sessionSource,
    persistentAudit,
    localApprovalRuntimeV3: approvalRuntime,
    resourceResolver: {
      describe: () => ({
        resource: {
          schemaVersion: 4,
          kind: "git_v4",
          operation: "stage",
          repositoryId: `repo_${"1".repeat(32)}`,
          worktreeId: null,
          branchId: null,
          pathDigests: [],
          refDigests: [],
          objectIds: [],
          affectedPathCount: 1,
          affectedByteCount: 0,
          stateTokenFingerprint: "2".repeat(64),
          integrationMode: "approved_full_access",
          executionIsolation: "none",
          resourceFingerprint: `sha256:${"c".repeat(64)}`
        },
        semanticFactsDigest: `sha256:${"d".repeat(64)}`,
        riskClass: "R3",
        requiredScopes: ["shell:execute", "host:full-access"],
        approvalRevealArguments: gitRevealArguments
      })
    }
  });
  const gitDisplayFirst = await gitDisplayRuntime.authorize("run_command", { integration_review_token: "opaque" });
  assert.equal(gitDisplayFirst.decision.outcome, "approval_required");
  const gitDisplayApproval = approvalRuntime.approvals.get(gitDisplayFirst.localApproval.approvalId);
  assert.match(gitDisplayApproval.summary.authoritySummary, /approved Git integration.*no filesystem, credential, registry, network, or broker isolation/i);
  assert.equal(gitDisplayApproval.summary.argumentCount, gitRevealArguments.length);
  assert.deepEqual(gitDisplayApproval.summary.revealArguments, gitRevealArguments);

  await approvalRuntime.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId: approvalRuntime.serverId, approvalId: executionFirst.localApproval.approvalId });
  const executionRetries = await Promise.all(Array.from({ length: 24 }, () => executionRuntime.authorize("run_command", executionArgs)));
  const executionWinners = executionRetries.filter((result) => result.decision.outcome === "allow" && result.reservation);
  assert.equal(executionWinners.length, 1, "one R3 retry owns the atomic grant reservation");
  assert.equal(executionRetries.filter((result) => result.decision.outcome === "approval_required").length, 23);
  assert.match(executionWinners[0].decision.provenance[0].grantId, /^grant_[a-f0-9]{24}$/);
  await executionWinners[0].reservation.commit();
  assert.equal(approvalRuntime.grants.size(), 1, "the one-use R3 grant is consumed while the earlier reusable R2 grant remains");

  const inputRuntime = createDefaultPolicyRuntime({
    config: executionConfig,
    workspaces,
    guard,
    sessionSource,
    persistentAudit,
    localApprovalRuntimeV3: approvalRuntime,
    resourceResolver: {
      describe: (_toolName, input) => {
        const resource = describeProcessActionResourceV3({
          operation: "write_process_input",
          processId: input.process_id,
          generation: 17,
          owned: true,
          contextMatches: true,
          terminal: "pipes",
          input: Buffer.from(input.data),
          close: input.close === true
        });
        return {
          resource,
          semanticFactsDigest: resource.semanticFactsDigest,
          riskClass: resource.riskClass,
          requiredScopes: ["process:manage"]
        };
      }
    }
  });
  const inputArgs = { process_id: `process_${"1".repeat(32)}`, data: "exact-input-alpha", close: false };
  const inputFirst = await inputRuntime.authorize("write_process_input", inputArgs);
  assert.equal(inputFirst.decision.outcome, "approval_required");
  await approvalRuntime.server.handle({ schemaVersion: 3, contractVersion: 3, operation: "approvals.approve", serverId: approvalRuntime.serverId, approvalId: inputFirst.localApproval.approvalId });
  const inputRetries = await Promise.all(Array.from({ length: 24 }, () => inputRuntime.authorize("write_process_input", inputArgs)));
  const inputWinners = inputRetries.filter((result) => result.decision.outcome === "allow" && result.reservation);
  assert.equal(inputWinners.length, 1, "one exact input approval permits exactly one concurrent write retry");
  await inputWinners[0].reservation.commit();
  const changedInput = await inputRuntime.authorize("write_process_input", { ...inputArgs, data: "exact-input-beta" });
  assert.equal(changedInput.decision.outcome, "approval_required", "different input bytes require a fresh local approval");

  const verified = await auditStore.verify();
  const v2Evidence = await auditStore.query({
    eventTypes: ["authorization", "execution"],
    limit: 100
  });
  assert.equal(v2Evidence.records.every((record) => record.event.schemaVersion === 2), true);
  assert.equal(v2Evidence.records.some((record) => record.event.eventType === "authorization"), true);
  assert.equal(v2Evidence.records.some((record) => record.event.eventType === "execution"), true);
  const lifecycle = verified
    .filter((entry) => entry.event.schemaVersion === 3)
    .map((entry) => entry.event.transition);
  assert.deepEqual(lifecycle.slice(0, 5), ["requested", "prepared", "granted", "reserved", "consumed"]);
});

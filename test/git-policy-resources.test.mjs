import assert from "node:assert/strict";
import test from "node:test";
import {
  createGitResourceV4,
  gitV4PolicyDefinition,
  localGitApprovalSummaryV4,
  requiredScopesForGitV4Tool
} from "../dist/git/resources.js";
import {
  createAuthorizationFactsV4,
  authorizationFactsMatchV4,
  semanticDigestV4
} from "../dist/policy/authorizationFacts.js";
import { gateRPolicyDefinition, toolPolicyDefinition } from "../dist/policy/toolPolicy.js";

const baseResource = {
  operation: "commit",
  repositoryId: `repo_${"a".repeat(32)}`,
  worktreeId: null,
  branchId: `branch_${"b".repeat(32)}`,
  pathDigests: ["c".repeat(64)],
  refDigests: ["d".repeat(64)],
  objectIds: ["e".repeat(40)],
  affectedPathCount: 1,
  affectedByteCount: 12,
  stateTokenFingerprint: "f".repeat(64),
  integrationMode: "off",
  executionIsolation: "none"
};

test("Gate R Git resources are closed semantic facts without private paths or commands", () => {
  const resource = createGitResourceV4(baseResource);
  assert.equal(resource.schemaVersion, 4);
  assert.match(resource.resourceFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(resource).includes("C:\\"), false);
  assert.equal(JSON.stringify(resource).includes("--git-dir"), false);
  const localSummary = localGitApprovalSummaryV4(resource);
  assert.deepEqual(localSummary, {
    operation: "commit",
    repositoryId: baseResource.repositoryId,
    worktreeId: null,
    branchId: baseResource.branchId,
    affectedPathCount: 1,
    affectedByteCount: 12,
    pathDigestCount: 1,
    refDigestCount: 1,
    objectCount: 1,
    integrationMode: "off",
    executionIsolation: "none",
    resourceFingerprint: resource.resourceFingerprint
  });
  assert.equal(JSON.stringify(localSummary).includes(baseResource.pathDigests[0]), false);
  assert.equal(JSON.stringify(localSummary).includes(baseResource.refDigests[0]), false);
  assert.equal(JSON.stringify(localSummary).includes(baseResource.objectIds[0]), false);
  assert.throws(
    () => localGitApprovalSummaryV4({ ...resource, affectedByteCount: resource.affectedByteCount + 1 }),
    /GIT_RECOVERY_REQUIRED/
  );
  assert.throws(
    () => createGitResourceV4({ ...baseResource, pathDigests: [baseResource.pathDigests[0], baseResource.pathDigests[0]] }),
    /GIT_RECOVERY_REQUIRED/
  );
  assert.deepEqual(requiredScopesForGitV4Tool("git_commit"), ["git:commit", "git:refs:write"]);
  assert.deepEqual(requiredScopesForGitV4Tool("git_stage"), ["git:index:write", "filesystem:read"]);
  assert.deepEqual(gitV4PolicyDefinition("git_commit"), {
    riskClass: "R3",
    requiredScopes: ["git:commit", "git:refs:write"],
    resourceMode: "resolved",
    handlerState: "enabled"
  });
  assert.deepEqual(gateRPolicyDefinition("git_commit"), gitV4PolicyDefinition("git_commit"));
  assert.deepEqual(gitV4PolicyDefinition("git_restore", "restore_review"), {
    riskClass: "R1",
    requiredScopes: ["git:read"],
    resourceMode: "resolved",
    handlerState: "enabled"
  });
  assert.deepEqual(gitV4PolicyDefinition("git_restore", "restore_execute"), {
    riskClass: "R3",
    requiredScopes: ["git:index:write", "filesystem:write"],
    resourceMode: "resolved",
    handlerState: "enabled"
  });
  assert.equal(gitV4PolicyDefinition("git_stash", "stash_list").riskClass, "R0");
  assert.equal(gitV4PolicyDefinition("git_stash", "stash_apply_execute").riskClass, "R3");
  assert.equal(gitV4PolicyDefinition("merge_task_worktree", "task_merge_prepare_review").riskClass, "R2");
  assert.equal(gitV4PolicyDefinition("merge_task_worktree", "task_merge_prepare_finalize").riskClass, "R3");
  assert.throws(() => gitV4PolicyDefinition("git_restore"), /GIT_RECOVERY_REQUIRED/);
  assert.throws(() => gitV4PolicyDefinition("git_restore", "commit"), /GIT_RECOVERY_REQUIRED/);
  assert.throws(() => gateRPolicyDefinition("git_stash"), /GIT_RECOVERY_REQUIRED/);
  assert.equal(toolPolicyDefinition("git_commit").resourceMode, "resolved");
});

test("V4 authorization facts cannot replay across repository, owner, session, or revision", () => {
  const input = {
    serverId: "server-gate-r",
    ownerId: "owner-gate-r",
    credentialRef: "credential-gate-r",
    credentialRevision: "credential-revision-1",
    transportKind: "stdio",
    transportSessionId: "session-gate-r",
    repositoryId: baseResource.repositoryId,
    worktreeId: null,
    policyRevision: "policy-gate-r",
    configurationRevision: "config-gate-r",
    capabilityRevision: "capability-gate-r",
    pathPolicyRevision: "path-policy-gate-r",
    secretPolicyRevision: "secret-policy-gate-r",
    toolContractVersion: "4",
    toolName: "git_commit",
    canonicalAction: "git_commit",
    operation: "commit",
    resourceFingerprint: createGitResourceV4(baseResource).resourceFingerprint,
    inputDigest: semanticDigestV4({ message: "omitted" }),
    semanticFactsDigest: semanticDigestV4(baseResource),
    riskClass: "R3",
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  const facts = createAuthorizationFactsV4(input);
  assert.equal(authorizationFactsMatchV4(facts, createAuthorizationFactsV4(input)), true);
  assert.equal(authorizationFactsMatchV4(facts, createAuthorizationFactsV4({ ...input, repositoryId: `repo_${"9".repeat(32)}` })), false);
  assert.equal(authorizationFactsMatchV4(facts, createAuthorizationFactsV4({ ...input, ownerId: "owner-other" })), false);
  assert.equal(authorizationFactsMatchV4(facts, createAuthorizationFactsV4({ ...input, transportSessionId: "session-other" })), false);
  assert.equal(authorizationFactsMatchV4(facts, createAuthorizationFactsV4({ ...input, capabilityRevision: "capability-other" })), false);
  assert.throws(() => createAuthorizationFactsV4({ ...input, riskClass: "R4" }), /riskClass/);
  assert.throws(() => createAuthorizationFactsV4({ ...input, issuedAt: input.expiresAt, expiresAt: input.issuedAt }), /timestamps/);
  assert.throws(() => createAuthorizationFactsV4({ ...input, operation: "commit\u202eallow" }), /control text/);
  assert.throws(() => semanticDigestV4({ value: Number.NaN }), /finite/);
  assert.throws(() => semanticDigestV4({ value: new Date() }), /plain objects/);
  assert.notEqual(semanticDigestV4({ value: null }), semanticDigestV4({ value: "null" }));
});

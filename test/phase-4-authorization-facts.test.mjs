import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const policy = await tsImport("./fixtures/phase-4-policy-imports.ts", import.meta.url);
const {
  createAuthorizationFactsV3,
  semanticDigest
} = policy;
const { describeExecutionResourceV3 } = policy;
const {
  createDefaultPolicyRuntime,
  createStdioPolicySessionSource,
  loadConfig,
  PathGuard,
  policyIdentityScopes,
  WorkspaceManager
} = policy;

function resource(overrides = {}) {
  return describeExecutionResourceV3({
    operation: "start_process",
    command: { kind: "argv", executable: "node.exe", args: ["worker.mjs", "--safe"] },
    effectiveEnvironmentDigest: semanticDigest({ PATH: "resolved-not-caller" }),
    logicalCwd: "workspace:.",
    absoluteCwdIdentity: semanticDigest({ volume: "v", file: "f" }),
    backend: {
      backendId: "argv-native",
      backendVersion: "1",
      executableIdentity: semanticDigest({ file: "node.exe", identity: "stable" })
    },
    terminal: "conpty",
    deadlineMs: 45_000,
    lifetimeMs: 900_000,
    networkPosture: "deny_all",
    accessMode: "workspace",
    workspaceId: "workspace-test",
    leaseId: null,
    snapshotId: "snapshot-test",
    contractVersion: 3,
    policyRevision: "policy-test",
    evidenceRevision: "evidence-test",
    identityRevision: "identity-test",
    transportRevision: "transport-test",
    ...overrides
  });
}

function facts(execution) {
  return createAuthorizationFactsV3({
    serverId: "server-test",
    credentialRef: null,
    credentialRevision: "credential-test",
    transportKind: "stdio",
    transportSessionId: "transport-test",
    identityKind: "local_process",
    identitySubject: null,
    workspaceId: execution.workspaceId,
    leaseId: execution.leaseId,
    policyRevision: execution.policyRevision,
    evidenceRevision: execution.evidenceRevision,
    toolContractVersion: "3",
    toolName: "start_process",
    canonicalAction: "process.start",
    operation: "execution.start_process",
    resourceFingerprint: execution.resourceFingerprint,
    inputDigest: semanticDigest({ schemaVersion: 3, action: "process.start" }),
    semanticFactsDigest: execution.semanticFactsDigest,
    riskClass: "R3"
  });
}

test("authorization facts change for every execution authority boundary", () => {
  const base = resource();
  const changes = [
    resource({ terminal: "pipes" }),
    resource({ deadlineMs: 46_000 }),
    resource({ lifetimeMs: 901_000 }),
    resource({ networkPosture: "unrestricted_host" }),
    resource({ accessMode: "full_access", snapshotId: null, leaseId: "lease-test" }),
    resource({ evidenceRevision: "evidence-next" }),
    resource({ transportRevision: "transport-next" })
  ];
  const baseFacts = facts(base);
  for (const changed of changes) {
    assert.notEqual(facts(changed).bindingFingerprint, baseFacts.bindingFingerprint);
  }
});

test("authorization summaries never retain scripts argv env or canonical private roots", () => {
  const described = resource({
    command: { kind: "powershell", script: "$env:TOP_SECRET='synthetic-value'; Get-ChildItem C:\\Users\\Private" }
  });
  const serialized = JSON.stringify({ described, facts: facts(described) });
  assert.doesNotMatch(serialized, /TOP_SECRET|synthetic-value|Get-ChildItem|Users\\Private/);
});

test("V3 runtime refuses an execution resolver that omits semantic facts", async () => {
  const activeConfig = {
    ...loadConfig(["--root", process.cwd()]),
    toolContractVersion: 3,
    policyEngineMode: "enforce",
    bashMode: "full"
  };
  const workspaces = new WorkspaceManager(activeConfig, {
    transportSessionId: () => "semantic-session",
    identityBinding: "semantic-identity",
    policyRevision: () => "semantic-policy"
  });
  const processResource = {
    schemaVersion: 1,
    kind: "process",
    operation: "start",
    workspaceId: workspaces.defaultWorkspace().id,
    processId: null,
    persistence: false,
    executableDigest: "sha256:" + "e".repeat(64),
    resourceFingerprint: "sha256:" + "f".repeat(64)
  };
  const runtime = createDefaultPolicyRuntime({
    config: activeConfig,
    workspaces,
    guard: new PathGuard(activeConfig),
    sessionSource: createStdioPolicySessionSource({
      sessionId: "semantic-session",
      scopes: policyIdentityScopes(activeConfig)
    }),
    resourceResolver: { describe: () => ({ resource: processResource }) }
  });
  await assert.rejects(
    () => runtime.authorize("run_command", { mode: "full_access" }),
    /semantic authorization facts/
  );
});

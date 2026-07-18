import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { createCodexProServer } from "../dist/server.js";
import * as contracts from "../dist/tools/contracts/index.js";
import {
  CANONICAL_CODEXPRO_CHILD_TOOLS_V1,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V2,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V3,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V4,
  CODEXPRO_CHILD_OUTPUT_SCHEMAS_V4,
  codexproOutputSchemaV4,
  resolveCodexProActionV4
} from "../dist/tools/schemas/codexpro.js";

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

function v4Config(toolMode = "standard") {
  return withEnv({
    CODEXPRO_TOOL_CONTRACT_VERSION: "4",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "required",
    CODEXPRO_POLICY_ENGINE: "enforce"
  }, () => loadConfig([
    "--bash", "off",
    "--write", "off",
    "--tool-mode", toolMode
  ]));
}

function allowDecision(toolName) {
  return {
    schemaVersion: 1,
    decisionId: `decision-${toolName}`,
    outcome: "allow",
    reasonCode: null,
    policyRevision: "policy-v4-contract",
    resourceFingerprint: `sha256:${"a".repeat(64)}`,
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: []
  };
}

function dependencies() {
  return {
    persistentAuditRuntime: { persistAuthorization() {}, persistExecution() {} },
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {
      identity: { credentialRef: "credential_v4", scopes: [] },
      transportKind: "stdio",
      transportSessionId: () => "session_v4"
    },
    v4ContractCapabilities: {
      nativeHostIdentityAvailable: true,
      localApprovalAvailable: true,
      gitCapabilityAvailable: true,
      contractV4MigrationAvailable: true
    },
    policyRuntime: {
      mode: "enforce",
      authorize(toolName) {
        return { decision: allowDecision(toolName), auditEvent: null };
      },
      audit() {}
    }
  };
}

const V4_STANDARD_ADDITIONS = [
  "git_log",
  "git_branch",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "create_task_worktree",
  "list_task_worktrees",
  "get_task_worktree",
  "merge_task_worktree",
  "remove_task_worktree"
];

test("V4 inheritance does not change the exact V1 V2 or V3 universes", () => {
  assert.strictEqual(CANONICAL_CODEXPRO_CHILD_TOOLS_V1, contracts.CONTRACT_V1_CHILD_TOOLS);
  assert.strictEqual(CANONICAL_CODEXPRO_CHILD_TOOLS_V2, contracts.CONTRACT_V2_CHILD_TOOLS);
  assert.strictEqual(CANONICAL_CODEXPRO_CHILD_TOOLS_V3, contracts.CONTRACT_V3_CHILD_TOOLS);
  assert.strictEqual(CANONICAL_CODEXPRO_CHILD_TOOLS_V4, contracts.CONTRACT_V4_CHILD_TOOLS);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V1.length, 28);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V2.length, 31);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V3.length, 39);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V4.length, 51);
  assert.deepEqual(contracts.v2ToolsForProjection({ version: 4, mode: "full", connectionTest: false }),
    contracts.CONTRACT_V2_ADDITIONS);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 4, mode: "full", connectionTest: false }),
    contracts.CONTRACT_V3_ADDITIONS);
});

test("V4 has one exact child output schema per tool and no mutation convenience aliases", () => {
  assert.deepEqual(Object.keys(CODEXPRO_CHILD_OUTPUT_SCHEMAS_V4).sort(), [...CANONICAL_CODEXPRO_CHILD_TOOLS_V4].sort());
  assert.equal(Object.keys(CODEXPRO_CHILD_OUTPUT_SCHEMAS_V4).length, 51);
  for (const alias of ["commit", "branch", "stage", "restore", "stash", "merge", "remove_task"]) {
    assert.equal(resolveCodexProActionV4(alias), null, alias);
  }
  for (const name of contracts.CONTRACT_V4_ADDITIONS) {
    assert.equal(resolveCodexProActionV4(name), name);
  }
});

test("V4 standard registers inherited tools plus ten disabled V4 slots and supertool lists the same closed set", async () => {
  const server = createCodexProServer(v4Config("standard"), dependencies());
  const tools = server._registeredTools;
  assert.ok(tools && typeof tools === "object");
  for (const name of V4_STANDARD_ADDITIONS) assert.ok(tools[name], `${name} must be registered`);
  assert.equal(tools.git_stage.annotations.destructiveHint, false);
  assert.equal(tools.get_task_worktree.annotations.destructiveHint, false);
  assert.equal(tools.git_commit.annotations.destructiveHint, true);
  assert.equal(tools.create_task_worktree.annotations.destructiveHint, true);
  assert.equal(Boolean(tools.git_restore), false);
  assert.equal(Boolean(tools.git_stash), false);
  assert.equal(Boolean(tools.bash), false);

  const direct = await tools.git_log.handler({ workspace_id: "ws_missing" });
  assert.equal(direct.isError, true);
  assert.equal(direct.structuredContent.error.code, "GIT_V4_HANDLER_UNAVAILABLE");

  const listed = await tools.codexpro.handler({ action: "list_actions" });
  assert.equal(listed.isError, undefined);
  assert.equal(codexproOutputSchemaV4.safeParse(listed.structuredContent).success, true);
  const directNames = Object.keys(tools).filter((name) => name !== "codexpro" && tools[name].enabled !== false).sort();
  assert.deepEqual(listed.structuredContent.data.actions, directNames);
});

test("V4 full adds restore, stash, and the V4 audit slot while minimal and connection-test add no V4 tools", async () => {
  const full = createCodexProServer(v4Config("full"), dependencies())._registeredTools;
  assert.ok(full.git_restore);
  assert.ok(full.git_stash);
  assert.ok(full.query_audit_events);
  const audit = await full.query_audit_events.handler({});
  assert.equal(audit.isError, true);
  assert.equal(audit.structuredContent.error.code, "AUDIT_UNAVAILABLE");

  const minimal = createCodexProServer(v4Config("minimal"), dependencies())._registeredTools;
  for (const name of contracts.CONTRACT_V4_ADDITIONS) assert.equal(Boolean(minimal[name]), false, name);

  const connectionConfig = { ...v4Config("full"), connectionTest: true };
  const connection = createCodexProServer(connectionConfig, dependencies())._registeredTools;
  for (const name of contracts.CONTRACT_V4_ADDITIONS) assert.equal(Boolean(connection[name]), false, name);
});

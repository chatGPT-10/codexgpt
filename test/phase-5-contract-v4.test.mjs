import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, assertToolContractConfiguration } from "../dist/config.js";
import * as contracts from "../dist/tools/contracts/index.js";
import {
  gitLogCommitV4Schema,
  gitLogInputV4Schema
} from "../dist/tools/schemas/gitLog.js";
import { gitCreateBranchInputV4Schema } from "../dist/tools/schemas/gitCreateBranch.js";
import { gitBranchEntryV4Schema, gitBranchInputV4Schema } from "../dist/tools/schemas/gitBranch.js";
import { gitStageInputV4Schema } from "../dist/tools/schemas/gitStage.js";
import { gitCommitInputV4Schema } from "../dist/tools/schemas/gitCommit.js";
import { gitRestoreDataV4Schema, gitRestoreInputV4Schema } from "../dist/tools/schemas/gitRestore.js";
import { gitStashDataV4Schema, gitStashInputV4Schema } from "../dist/tools/schemas/gitStash.js";
import { createTaskWorktreeInputV4Schema } from "../dist/tools/schemas/createTaskWorktree.js";
import { listTaskWorktreesInputV4Schema } from "../dist/tools/schemas/listTaskWorktrees.js";
import { getTaskWorktreeInputV4Schema } from "../dist/tools/schemas/getTaskWorktree.js";
import { mergeTaskWorktreeDataV4Schema, mergeTaskWorktreeInputV4Schema } from "../dist/tools/schemas/mergeTaskWorktree.js";
import { removeTaskWorktreeInputV4Schema } from "../dist/tools/schemas/removeTaskWorktree.js";
import { gitDiffInputV4Schema } from "../dist/tools/schemas/gitDiff.js";
import { gitStatusInputV4Schema } from "../dist/tools/schemas/gitStatus.js";
import { queryAuditEventsInputSchemaV4 } from "../dist/tools/schemas/queryAuditEvents.js";
import {
  gitV4CodexBranchNameSchema,
  gitV4LiteralPathSchema,
  gitV4SafeMultilineTextSchema,
  gitV4SafeOneLineTextSchema
} from "../dist/tools/schemas/gitV4Common.js";
import {
  DISABLED_V4_TOOL_POLICY,
  toolPolicyDefinition
} from "../dist/policy/toolPolicy.js";

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

function config(changes = {}, argv = ["--bash", "off", "--write", "off"]) {
  return withEnv({
    CODEXPRO_TOOL_CONTRACT_VERSION: undefined,
    CODEXPRO_FILE_TRANSACTIONS: undefined,
    CODEXPRO_AUDIT_MODE: undefined,
    CODEXPRO_POLICY_ENGINE: undefined,
    ...changes
  }, () => loadConfig(argv));
}

const COMPLETE_V4_CAPABILITIES = Object.freeze({
  durableAuditAvailable: true,
  stateRootAvailable: true,
  movePathsAvailable: true,
  stableSessionAvailable: true,
  atomicStateReadersAvailable: true,
  contractV3MigrationAvailable: true,
  nativeHostIdentityAvailable: true,
  localApprovalAvailable: true,
  gitCapabilityAvailable: true,
  contractV4MigrationAvailable: true
});

const V4_ADDITIONS = Object.freeze([
  "git_log",
  "git_branch",
  "git_create_branch",
  "git_stage",
  "git_commit",
  "git_restore",
  "git_stash",
  "create_task_worktree",
  "list_task_worktrees",
  "get_task_worktree",
  "merge_task_worktree",
  "remove_task_worktree"
]);

test("contract V4 parses explicitly while V1 remains default", () => {
  assert.equal(config().toolContractVersion, 1);
  assert.equal(config({ CODEXPRO_TOOL_CONTRACT_VERSION: "4" }).toolContractVersion, 4);
  assert.equal(config({}, ["--bash", "off", "--write", "off", "--tool-contract-version", "4"]).toolContractVersion, 4);
  assert.throws(
    () => config({ CODEXPRO_TOOL_CONTRACT_VERSION: "5" }),
    /CODEXPRO_TOOL_CONTRACT_VERSION must be 1, 2, 3, or 4/
  );
});

test("V1=28 V2=31 V3=39 and V4=51 are exact frozen canonical universes", () => {
  assert.equal(contracts.CONTRACT_V1_CHILD_TOOLS.length, 28);
  assert.equal(contracts.CONTRACT_V2_CHILD_TOOLS.length, 31);
  assert.equal(contracts.CONTRACT_V3_CHILD_TOOLS.length, 39);
  assert.equal(contracts.CONTRACT_V4_CHILD_TOOLS.length, 51);
  assert.equal(new Set(contracts.CONTRACT_V4_CHILD_TOOLS).size, 51);
  assert.equal(contracts.CONTRACT_V4_CHILD_TOOLS.includes("bash"), false);
  assert.equal(contracts.CONTRACT_V4_CHILD_TOOLS.includes("git_apply_patch"), false);
  assert.deepEqual(contracts.CONTRACT_V4_CHILD_TOOLS.slice(0, 39), contracts.CONTRACT_V3_CHILD_TOOLS);
  assert.deepEqual(contracts.CONTRACT_V4_CHILD_TOOLS.slice(39), V4_ADDITIONS);
  assert.strictEqual(contracts.canonicalToolsForVersion(4), contracts.CONTRACT_V4_CHILD_TOOLS);
  assert.equal(Object.isFrozen(contracts.CONTRACT_V4_CHILD_TOOLS), true);
});

test("V4 profile projection exposes ten standard additions, twelve full additions, and none in minimal or connection test", () => {
  assert.deepEqual(contracts.v4ToolsForProjection({ version: 4, mode: "minimal", connectionTest: false }), []);
  assert.deepEqual(contracts.v4ToolsForProjection({ version: 4, mode: "standard", connectionTest: false }),
    V4_ADDITIONS.filter((name) => name !== "git_restore" && name !== "git_stash"));
  assert.deepEqual(contracts.v4ToolsForProjection({ version: 4, mode: "full", connectionTest: false }), V4_ADDITIONS);
  assert.deepEqual(contracts.v4ToolsForProjection({ version: 4, mode: "full", connectionTest: true }), []);
  assert.deepEqual(contracts.v4ToolsForProjection({ version: 3, mode: "full", connectionTest: false }), []);
  assert.equal(contracts.contractIncludesV2(4), true);
  assert.equal(contracts.contractIncludesV3(4), true);
  assert.equal(contracts.contractIncludesV4(4), true);
});

test("V4 startup fails closed unless all contract, native-host, local-approval, and Git capability dependencies exist", () => {
  const valid = config({
    CODEXPRO_TOOL_CONTRACT_VERSION: "4",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "required",
    CODEXPRO_POLICY_ENGINE: "enforce"
  });
  assert.doesNotThrow(() => assertToolContractConfiguration(valid, COMPLETE_V4_CAPABILITIES));
  for (const [field, pattern] of [
    ["durableAuditAvailable", /durable|persistent audit/i],
    ["stateRootAvailable", /state root/i],
    ["movePathsAvailable", /move_paths/i],
    ["stableSessionAvailable", /stable.*session/i],
    ["atomicStateReadersAvailable", /atomic.*readers/i],
    ["contractV3MigrationAvailable", /V3 migration gate/i],
    ["nativeHostIdentityAvailable", /native host identity/i],
    ["localApprovalAvailable", /local approval/i],
    ["gitCapabilityAvailable", /Git capability/i],
    ["contractV4MigrationAvailable", /V4 migration gate/i]
  ]) {
    assert.throws(
      () => assertToolContractConfiguration(valid, { ...COMPLETE_V4_CAPABILITIES, [field]: false }),
      pattern
    );
  }
});

test("V4 policy catalog activates only completed read and local Git gates", () => {
  const active = new Set([
    "git_log",
    "git_branch",
    "git_create_branch",
    "git_stage",
    "git_commit",
    "git_restore",
    "git_stash",
    "create_task_worktree",
    "list_task_worktrees",
    "get_task_worktree",
    "merge_task_worktree",
    "remove_task_worktree"
  ]);
  for (const name of V4_ADDITIONS) {
    if (active.has(name)) assert.notStrictEqual(toolPolicyDefinition(name), DISABLED_V4_TOOL_POLICY, name);
    else assert.strictEqual(toolPolicyDefinition(name), DISABLED_V4_TOOL_POLICY, name);
  }
});

test("V4 path and branch names reject Windows ambiguity and unsafe Git ref forms", () => {
  for (const path of [
    "CON",
    "docs/NUL.txt",
    "src/COM1.js",
    "src/name.",
    "src/name ",
    "src/file:stream",
    "src/file?.txt",
    "src/file*.txt",
    "src/file|name.txt",
    "src/file<name>.txt",
    "src/line\nbreak.txt",
    "src/tab\tname.txt",
    "src/escape\u001b.txt",
    "src/bidi\u202e.txt",
    `src/${"x".repeat(256)}`
  ]) {
    assert.equal(gitV4LiteralPathSchema.safeParse(path).success, false, path);
  }
  for (const path of ["src/concept.ts", "docs/nul-safe.md", "src/COM10.js"]) {
    assert.equal(gitV4LiteralPathSchema.safeParse(path).success, true, path);
  }
  for (const branch of [
    "codex/.hidden",
    "codex/topic.lock",
    "codex/topic.LOCK",
    "codex/topic/sub.lock",
    "codex/topic./next",
    "codex/CON",
    "codex/topic|pipe",
    "codex/topic<angle>",
    "codex/topic\u202e",
    "codex/topic@{1}",
    "codex/topic..next",
    "codex/topic//next"
  ]) {
    assert.equal(gitV4CodexBranchNameSchema.safeParse(branch).success, false, branch);
  }
  assert.equal(gitV4CodexBranchNameSchema.safeParse("codex/phase-5a1").success, true);
});

test("V4 public text rejects terminal and bidi injection while multiline fields retain CR LF and TAB", () => {
  const oneLine = gitV4SafeOneLineTextSchema(240, true);
  const multiline = gitV4SafeMultilineTextSchema(240, true);
  assert.equal(oneLine.safeParse("safe subject").success, true);
  assert.equal(oneLine.safeParse("line\nbreak").success, false);
  assert.equal(multiline.safeParse("line one\n\tline two\r\n").success, true);
  for (const value of ["ansi\u001b[31m", "c1\u0085", "bidi\u202e", "isolate\u2067"]) {
    assert.equal(oneLine.safeParse(value).success, false, value);
    assert.equal(multiline.safeParse(value).success, false, value);
  }
});

test("V4 output schemas bind omission, review, and merge-plan facts exactly", () => {
  const oid = "a".repeat(40);
  const repositoryId = `repo_${"b".repeat(32)}`;
  const taskId = `task_${"c".repeat(32)}`;
  const reviewToken = `review_${"d".repeat(32)}`;
  const timestamp = "2026-07-18T04:00:00.000Z";

  const logCommit = {
    oid,
    parent_oids: [],
    subject: null,
    subject_omitted: true,
    author_name: "Author",
    author_name_omitted: false,
    timestamp
  };
  assert.equal(gitLogCommitV4Schema.safeParse(logCommit).success, true);
  assert.equal(gitLogCommitV4Schema.safeParse({ ...logCommit, subject_omitted: false }).success, false);

  const branchEntry = {
    branch_id: `branch_${"e".repeat(32)}`,
    oid,
    current: true,
    checked_out: true,
    owned_task_worktree_id: null,
    name: null,
    name_omitted: true
  };
  assert.equal(gitBranchEntryV4Schema.safeParse(branchEntry).success, true);
  assert.equal(gitBranchEntryV4Schema.safeParse({ ...branchEntry, name_omitted: false }).success, false);

  const restoreReview = {
    action: "prepare",
    repository_id: repositoryId,
    review_token: reviewToken,
    mode: "worktree_from_index",
    paths: ["src/a.ts"],
    affected_path_count: 1,
    affected_bytes: 12,
    complete_undo_retained: true,
    loss_summary: "One file will be restored."
  };
  assert.equal(gitRestoreDataV4Schema.safeParse(restoreReview).success, true);
  assert.equal(gitRestoreDataV4Schema.safeParse({ ...restoreReview, affected_path_count: 2 }).success, false);

  const forgetReview = {
    action: "prepare_forget",
    repository_id: repositoryId,
    review_token: reviewToken,
    stash_id: `stash_${"f".repeat(32)}`,
    expected_oid: oid,
    created_at: timestamp,
    age_seconds: 10,
    path_count: 1,
    byte_count: 12,
    rollback_cas_retained: true
  };
  assert.equal(gitStashDataV4Schema.safeParse(forgetReview).success, true);
  assert.equal(gitStashDataV4Schema.safeParse({ ...forgetReview, conflict_free: true }).success, false);

  const conflictReview = {
    action: "prepare",
    repository_id: repositoryId,
    task_worktree_id: taskId,
    merge_plan_id: null,
    review_token: null,
    status: "conflicted",
    target_oid: oid,
    task_oid: "b".repeat(40),
    candidate_oid: null,
    changes: [],
    conflicts: [{ path: "src/conflict.ts" }],
    path_scan_complete: true,
    secret_scan_complete: true,
    history_scan_complete: true,
    checks_complete: false,
    integration_workspace_id: null,
    required_check_categories: [],
    execution_isolation: "none",
    repository_integrations: "disabled",
    expires_at: null
  };
  assert.equal(mergeTaskWorktreeDataV4Schema.safeParse(conflictReview).success, true);
  assert.equal(mergeTaskWorktreeDataV4Schema.safeParse({
    ...conflictReview,
    merge_plan_id: `merge_${"1".repeat(32)}`
  }).success, false);
});

test("every V4 input schema rejects raw Git escape hatches", () => {
  const stateToken = `gst_${"a".repeat(32)}`;
  const indexToken = `gitx_${"b".repeat(32)}`;
  const reviewToken = `review_${"c".repeat(32)}`;
  const taskId = `task_${"d".repeat(32)}`;
  const schemas = [
    ["git_log", gitLogInputV4Schema, { workspace_id: "ws_1", limit: 10 }],
    ["git_branch", gitBranchInputV4Schema, { workspace_id: "ws_1" }],
    ["git_create_branch", gitCreateBranchInputV4Schema, {
      workspace_id: "ws_1", state_token: stateToken, name: "codex/phase-5a1", base: { kind: "current_head" }
    }],
    ["git_stage", gitStageInputV4Schema, { workspace_id: "ws_1", state_token: stateToken, paths: ["src/a.ts"] }],
    ["git_commit", gitCommitInputV4Schema, { workspace_id: "ws_1", index_token: indexToken, message: "Commit message" }],
    ["git_restore", gitRestoreInputV4Schema, {
      action: "prepare", workspace_id: "ws_1", state_token: stateToken, mode: "worktree_from_index", paths: ["src/a.ts"]
    }],
    ["git_stash", gitStashInputV4Schema, { action: "list", workspace_id: "ws_1" }],
    ["create_task_worktree", createTaskWorktreeInputV4Schema, {
      action: "prepare", workspace_id: "ws_1", state_token: stateToken, task_name: "phase-5a1"
    }],
    ["list_task_worktrees", listTaskWorktreesInputV4Schema, { workspace_id: "ws_1" }],
    ["get_task_worktree", getTaskWorktreeInputV4Schema, { workspace_id: "ws_1", task_worktree_id: taskId }],
    ["merge_task_worktree", mergeTaskWorktreeInputV4Schema, {
      action: "prepare", workspace_id: "ws_1", task_worktree_id: taskId
    }],
    ["remove_task_worktree", removeTaskWorktreeInputV4Schema, {
      action: "execute", workspace_id: "ws_1", task_worktree_id: taskId, review_token: reviewToken
    }],
    ["git_status", gitStatusInputV4Schema, { workspace_id: "ws_1" }],
    ["git_diff", gitDiffInputV4Schema, { workspace_id: "ws_1", comparison: "worktree_to_index" }],
    ["query_audit_events", queryAuditEventsInputSchemaV4, {}]
  ];
  const forbiddenFields = ["revision", "flags", "remote", "config", "environment", "executable", "command"];
  for (const [name, schema, valid] of schemas) {
    assert.equal(schema.safeParse(valid).success, true, `${name} baseline`);
    for (const forbidden of forbiddenFields) {
      assert.equal(schema.safeParse({ ...valid, [forbidden]: "unsafe" }).success, false, `${name}.${forbidden}`);
    }
  }

  assert.equal(gitCreateBranchInputV4Schema.safeParse({
    workspace_id: "ws_1",
    state_token: stateToken,
    name: "feature/raw-name",
    base: { kind: "current_head" }
  }).success, false);
  assert.equal(gitDiffInputV4Schema.safeParse({
    workspace_id: "ws_1",
    comparison: "worktree_to_index",
    staged: true
  }).success, false);
});

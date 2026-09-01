import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  changeWorkflowStateSchema,
  verifyChangeInputV1Schema,
  verifyChangeOutputSchema,
  createVerifyChangeSuccess,
  createVerifyChangeFailure,
  mutationWorkflowFacts,
  CANONICAL_CODEXGPT_CHILD_TOOLS,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V2,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V3,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V4,
  CANONICAL_CODEXGPT_CHILD_TOOLS_V5,
  resolveCodexGPTAction,
  resolveCodexGPTActionV2,
  resolveCodexGPTActionV3,
  resolveCodexGPTActionV4,
  resolveCodexGPTActionV5
} = await tsImport("../fixtures/ts-imports/change-workflow-contract-imports.ts", import.meta.url);

const CHANGE_SET = `cs_${"1".repeat(32)}`;
const TRANSACTION = `tx_${"2".repeat(32)}`;

function workflow(overrides = {}) {
  return {
    schema_version: 1,
    change_set_id: CHANGE_SET,
    changed_files: ["src/a.ts"],
    stage: "verified",
    verification: {
      status: "passed",
      available: true,
      auto_run: false,
      recommended: [{
        check: "test",
        command: "npm test",
        source: "package.json:scripts.test",
        confidence: "confirmed"
      }],
      action: "verify_change",
      completed_at: "2026-08-31T08:00:00.000Z"
    },
    review: {
      status: "pending",
      required: true,
      action: "show_changes",
      git_diff_available: true,
      inspection_checklist: [
        "unexpected_files",
        "formatting",
        "generated_artifacts",
        "dependency_changes",
        "accidental_deletion"
      ],
      completed_at: null
    },
    complete: false,
    ready: false,
    ...overrides
  };
}

test("workflow and verify schemas are strict, bounded, and command-free", () => {
  assert.equal(changeWorkflowStateSchema.parse(workflow()).verification.auto_run, false);
  assert.deepEqual(changeWorkflowStateSchema.parse(workflow()).review.inspection_checklist, [
    "unexpected_files",
    "formatting",
    "generated_artifacts",
    "dependency_changes",
    "accidental_deletion"
  ]);
  assert.deepEqual(verifyChangeInputV1Schema.parse({
    workspace_id: "ws_p4",
    change_set_id: CHANGE_SET,
    checks: ["build", "test"],
    timeout_ms: 120_000
  }).checks, ["build", "test"]);
  assert.equal(verifyChangeInputV1Schema.safeParse({
    workspace_id: "ws_p4",
    change_set_id: CHANGE_SET,
    checks: ["test"],
    command: "Invoke-Anything"
  }).success, false);
  assert.equal(verifyChangeInputV1Schema.safeParse({
    workspace_id: "ws_p4",
    change_set_id: CHANGE_SET,
    checks: ["test", "test"]
  }).success, false);
  assert.equal(changeWorkflowStateSchema.safeParse({ ...workflow(), unknown: true }).success, false);
});

test("verify result distinguishes completed failing checks from action failure", () => {
  const successfulAction = createVerifyChangeSuccess({
    workspace_id: "ws_p4",
    change_set_id: CHANGE_SET,
    workflow: workflow({
      verification: { ...workflow().verification, status: "failed" }
    }),
    checks: [{
      check: "test",
      command: "npm test",
      source: "package.json:scripts.test",
      status: "failed",
      exit_code: 1,
      process_id: null,
      summary: "1 test failed"
    }],
    overall_status: "failed",
    next_action: {
      tool: "show_changes",
      args: { workspace_id: "ws_p4", change_set_id: CHANGE_SET, include_diff: true, mark_reviewed: true }
    }
  });
  assert.equal(verifyChangeOutputSchema.parse(successfulAction).ok, true);
  assert.equal(successfulAction.data.overall_status, "failed");

  const unavailable = createVerifyChangeFailure("VERIFICATION_UNAVAILABLE", { change_set_id: CHANGE_SET });
  assert.equal(verifyChangeOutputSchema.parse(unavailable).ok, false);
  assert.equal(unavailable.error.retryable, false);
});

test("mutation facts cover committed write, patch, move, and undo but reject preview/failure", () => {
  const transaction = {
    change_set_id: CHANGE_SET,
    transaction_id: TRANSACTION,
    before_state: "present",
    operation_count: 1,
    undo_supported: true,
    committed_at: "2026-08-31T08:00:00.000Z"
  };
  assert.deepEqual(mutationWorkflowFacts("write", {
    ok: true,
    data: { path: "src/a.ts", transaction }
  }), { changeSetId: CHANGE_SET, changedFiles: ["src/a.ts"] });
  assert.deepEqual(mutationWorkflowFacts("apply_patch", {
    ok: true,
    data: { paths: ["src/a.ts", "test/a.test.ts"], transaction: { ...transaction, operation_count: 2 } }
  }), { changeSetId: CHANGE_SET, changedFiles: ["src/a.ts", "test/a.test.ts"] });
  assert.deepEqual(mutationWorkflowFacts("move_paths", {
    ok: true,
    data: {
      preview: false,
      moves: [{ source: "src/old.ts", destination: "src/new.ts" }],
      transaction
    }
  }), { changeSetId: CHANGE_SET, changedFiles: ["src/old.ts", "src/new.ts"] });
  assert.deepEqual(mutationWorkflowFacts("undo_change_set", {
    ok: true,
    data: {
      preview: false,
      change_set_id: CHANGE_SET,
      operations: [{ kind: "restore", path: "src/a.ts" }]
    }
  }), { changeSetId: CHANGE_SET, changedFiles: ["src/a.ts"] });
  assert.equal(mutationWorkflowFacts("move_paths", { ok: true, data: { preview: true, transaction: null } }), null);
  assert.equal(mutationWorkflowFacts("write", { ok: false, data: null }), null);
});

test("verify_change is composite-only and direct tool counts remain exact", () => {
  assert.equal(resolveCodexGPTAction("verify_change"), null);
  assert.equal(resolveCodexGPTActionV2("verify_change"), null);
  assert.equal(resolveCodexGPTActionV3("verify_change"), null);
  assert.equal(resolveCodexGPTActionV4("verify_change"), null);
  assert.equal(resolveCodexGPTActionV5("verify_change"), null);
  assert.deepEqual([
    CANONICAL_CODEXGPT_CHILD_TOOLS.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V2.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V3.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V4.length,
    CANONICAL_CODEXGPT_CHILD_TOOLS_V5.length
  ], [28, 31, 39, 51, 52]);
  assert.equal(CANONICAL_CODEXGPT_CHILD_TOOLS_V5.includes("verify_change"), false);
});

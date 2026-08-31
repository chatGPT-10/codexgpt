import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  ChangeWorkflowError,
  ChangeWorkflowService
} = await tsImport("../src/workflows/changeWorkflow.ts", import.meta.url);

const NOW = Date.parse("2026-08-31T08:00:00.000Z");
const WORKSPACE = Object.freeze({ id: "ws_p4_fixture", root: "D:\\workspace\\p4" });
const OWNER = `owner_${"a".repeat(64)}`;
const FOREIGN_OWNER = `owner_${"b".repeat(64)}`;
const CHANGE_SET = `cs_${"1".repeat(32)}`;

function commands() {
  return {
    build: [{ value: "npm run build", source: "package.json:scripts.build", confidence: "confirmed" }],
    test: [
      { value: "npm test", source: "package.json:scripts.test", confidence: "confirmed" },
      { value: "cargo test", source: "Cargo.toml", confidence: "inferred" }
    ],
    lint: [{ value: "npm run lint", source: "package.json:scripts.lint", confidence: "confirmed" }],
    typecheck: []
  };
}

function service() {
  return new ChangeWorkflowService({
    commandProvider: async () => commands(),
    now: () => NOW
  });
}

test("recordApplied emits bounded owner-bound next-state from confirmed P2 commands only", async () => {
  const subject = service();
  const state = await subject.recordApplied({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    changedFiles: ["src/a.ts", "src/a.ts", "test/a.test.ts"],
    verificationAvailable: true
  });

  assert.equal(state.schema_version, 1);
  assert.equal(state.stage, "applied");
  assert.equal(state.complete, false);
  assert.equal(state.ready, false);
  assert.deepEqual(state.changed_files, ["src/a.ts", "test/a.test.ts"]);
  assert.deepEqual(
    state.verification.recommended.map(({ check, command, confidence }) => ({ check, command, confidence })),
    [
      { check: "test", command: "npm test", confidence: "confirmed" },
      { check: "lint", command: "npm run lint", confidence: "confirmed" },
      { check: "build", command: "npm run build", confidence: "confirmed" }
    ]
  );
  assert.equal(state.verification.recommended.some((item) => item.command === "cargo test"), false);
  assert.equal(state.verification.auto_run, false);
  assert.equal(state.review.required, true);
});

test("verify executes only selected confirmed checks and records honest terminal pass/fail", async () => {
  const subject = service();
  await subject.recordApplied({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    changedFiles: ["src/a.ts"],
    verificationAvailable: true
  });
  const requests = [];
  const verified = await subject.verify({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    checks: ["build", "test"],
    timeoutMs: 90_000,
    runCheck: async (request) => {
      requests.push(request);
      return request.check === "build"
        ? { status: "passed", exitCode: 0, processId: `process_${"2".repeat(32)}`, summary: "build ok" }
        : { status: "failed", exitCode: 1, processId: `process_${"3".repeat(32)}`, summary: "1 test failed" };
    }
  });

  assert.deepEqual(requests.map((item) => item.check), ["build", "test"]);
  assert.equal(requests.every((item) => item.commandSpec.kind === "powershell"), true);
  assert.equal(requests.every((item) => item.cwd === WORKSPACE.root), true);
  assert.equal(requests[0].commandSpec.script.includes("npm run build"), true);
  assert.equal(verified.workflow.stage, "verified");
  assert.equal(verified.workflow.verification.status, "failed");
  assert.equal(verified.workflow.review.status, "pending");
  assert.equal(verified.checks[0].status, "passed");
  assert.equal(verified.checks[1].status, "failed");
});

test("verify rejects missing, foreign-owner, duplicate, and unconfirmed workflow requests", async () => {
  const subject = service();
  await assert.rejects(
    () => subject.verify({
      workspace: WORKSPACE,
      ownerBinding: OWNER,
      changeSetId: CHANGE_SET,
      checks: ["test"],
      runCheck: async () => { throw new Error("must not run"); }
    }),
    (error) => error instanceof ChangeWorkflowError && error.code === "WORKFLOW_NOT_FOUND"
  );
  await subject.recordApplied({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    changedFiles: ["src/a.ts"],
    verificationAvailable: true
  });
  await assert.rejects(
    () => subject.verify({
      workspace: WORKSPACE,
      ownerBinding: FOREIGN_OWNER,
      changeSetId: CHANGE_SET,
      checks: ["test"],
      runCheck: async () => { throw new Error("must not run"); }
    }),
    (error) => error instanceof ChangeWorkflowError && error.code === "WORKFLOW_OWNER_MISMATCH"
  );
  await assert.rejects(
    () => subject.verify({
      workspace: WORKSPACE,
      ownerBinding: OWNER,
      changeSetId: CHANGE_SET,
      checks: ["test", "test"],
      runCheck: async () => { throw new Error("must not run"); }
    }),
    (error) => error instanceof ChangeWorkflowError && error.code === "INVALID_CHECK_SELECTION"
  );
  await assert.rejects(
    () => subject.verify({
      workspace: WORKSPACE,
      ownerBinding: OWNER,
      changeSetId: CHANGE_SET,
      checks: ["typecheck"],
      runCheck: async () => { throw new Error("must not run"); }
    }),
    (error) => error instanceof ChangeWorkflowError && error.code === "CHECK_NOT_CONFIRMED"
  );
});

test("review linkage is explicit and completion remains distinct from readiness", async () => {
  const subject = service();
  await subject.recordApplied({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    changedFiles: ["src/a.ts"],
    verificationAvailable: true
  });
  await subject.verify({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    checks: ["test"],
    runCheck: async () => ({ status: "failed", exitCode: 1, processId: null, summary: "failed" })
  });

  const incomplete = subject.markReviewed({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    includeDiff: false,
    markReviewed: true,
    checkpointHit: false,
    scopePath: null,
    reviewedPaths: ["src/a.ts"]
  });
  assert.equal(incomplete.review.status, "incomplete");
  assert.equal(incomplete.complete, false);

  const omitted = subject.markReviewed({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    includeDiff: true,
    markReviewed: true,
    checkpointHit: false,
    scopePath: null,
    reviewedPaths: []
  });
  assert.equal(omitted.review.status, "incomplete");
  assert.equal(omitted.complete, false);

  const terminal = subject.markReviewed({
    workspace: WORKSPACE,
    ownerBinding: OWNER,
    changeSetId: CHANGE_SET,
    includeDiff: true,
    markReviewed: true,
    checkpointHit: false,
    scopePath: null,
    reviewedPaths: ["src/a.ts"]
  });
  assert.equal(terminal.stage, "reviewed");
  assert.equal(terminal.review.status, "completed");
  assert.equal(terminal.complete, true);
  assert.equal(terminal.ready, false);
});

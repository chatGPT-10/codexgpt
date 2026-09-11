import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { createTask, transition, C2CTransitionError } = await tsImport("../src/c2c/stateMachine.ts", import.meta.url);
const base = { protocol: 1, taskId: "c2c_test", iteration: 1 };
const plan = { ...base, state: "PLAN", planPath: ".ai-bridge/current-plan.md", planSha256: "a".repeat(64), planBytes: 30 };
const executed = { ...base, state: "EXECUTED", executionId: "exec_test", planSha256: plan.planSha256, changedFiles: 1, checks: "recorded" };
const init = { ...base, state: "INIT", iteration: 0, workspaceId: "workspace", goal: "Implement" };
const events = {
  SEND_INIT: { type: "SEND_INIT", message: init },
  RECEIVE_PLAN: { type: "RECEIVE", message: plan },
  START_EXECUTION: { type: "START_EXECUTION" },
  COMPLETE_EXECUTION: { type: "COMPLETE_EXECUTION", message: executed },
  SEND_EXECUTED: { type: "SEND_EXECUTED", message: executed },
  RECEIVE_DONE: { type: "RECEIVE", message: { ...base, state: "DONE", summary: "Verified" } },
  RECEIVE_BLOCKED: { type: "RECEIVE", message: { ...base, state: "BLOCKED", reason: "Blocked", needs: "User" } },
  RECEIVE_ERROR: { type: "RECEIVE", message: { ...base, state: "ERROR", reason: "Failed" } },
  FAIL: { type: "FAIL" },
  REQUIRE_RECOVERY: { type: "REQUIRE_RECOVERY" }
};
function snapshots() {
  const list = [createTask("c2c_test")];
  for (const name of ["SEND_INIT", "RECEIVE_PLAN", "START_EXECUTION", "COMPLETE_EXECUTION", "SEND_EXECUTED"]) {
    list.push(transition(list.at(-1), events[name]));
  }
  for (const name of ["RECEIVE_DONE", "RECEIVE_BLOCKED", "RECEIVE_ERROR", "REQUIRE_RECOVERY"]) list.push(transition(list[5], events[name]));
  return list;
}
test("complete iteration, independent review, next iteration and immutable input", () => {
  const list = snapshots();
  assert.deepEqual(list.slice(0, 6).map(s => s.waitingFor), ["NONE", "CHATGPT_PLAN", "CODEX_EXECUTION", "CODEX_EXECUTION", "NONE", "CHATGPT_REVIEW"]);
  const review = list[5];
  const before = structuredClone(review);
  const next = transition(review, { type: "RECEIVE", message: { ...plan, iteration: 2 } });
  assert.equal(next.state, "PLAN_RECEIVED");
  assert.equal(next.iteration, 2);
  assert.equal(next.execution, null);
  assert.deepEqual(review, before);
  assert.equal(list[6].waitingFor, "NONE");
  assert.equal(list[7].waitingFor, "USER");
});
const allowed = {
  IDLE: ["SEND_INIT"],
  INIT_SENT: ["RECEIVE_PLAN", "RECEIVE_BLOCKED", "RECEIVE_ERROR", "FAIL", "REQUIRE_RECOVERY"],
  PLAN_RECEIVED: ["START_EXECUTION", "FAIL", "REQUIRE_RECOVERY"],
  EXECUTING: ["COMPLETE_EXECUTION", "FAIL", "REQUIRE_RECOVERY"],
  EXECUTED_LOCAL: ["SEND_EXECUTED", "FAIL", "REQUIRE_RECOVERY"],
  EXECUTED_SENT: ["RECEIVE_PLAN", "RECEIVE_DONE", "RECEIVE_BLOCKED", "RECEIVE_ERROR", "FAIL", "REQUIRE_RECOVERY"],
  DONE: [], BLOCKED: [], ERROR: [], RECOVERY_REQUIRED: []
};
for (const state of Object.keys(allowed)) for (const name of Object.keys(events)) {
  test(`${state} / ${name}: ${allowed[state].includes(name) ? "allow" : "reject"}`, () => {
    const snapshot = snapshots().find(s => s.state === state);
    const event = structuredClone(events[name]);
    if (event.type === "RECEIVE") event.message.iteration = name === "RECEIVE_PLAN" ? snapshot.iteration + 1 : snapshot.iteration;
    if (allowed[state].includes(name)) {
      const target = { SEND_INIT: "INIT_SENT", RECEIVE_PLAN: "PLAN_RECEIVED", START_EXECUTION: "EXECUTING", COMPLETE_EXECUTION: "EXECUTED_LOCAL", SEND_EXECUTED: "EXECUTED_SENT", RECEIVE_DONE: "DONE", RECEIVE_BLOCKED: "BLOCKED", RECEIVE_ERROR: "ERROR", FAIL: "ERROR", REQUIRE_RECOVERY: "RECOVERY_REQUIRED" };
      assert.equal(transition(snapshot, event).state, target[name]);
    }
    else assert.throws(() => transition(snapshot, event), C2CTransitionError);
  });
}
test("reject duplicate, replay, future, wrong task, hash mismatch and changed execution receipt", () => {
  const list = snapshots();
  for (const iteration of [0, 1, 3]) assert.throws(() => transition(list[5], { type: "RECEIVE", message: { ...plan, iteration } }), C2CTransitionError);
  assert.throws(() => transition(list[2], events.RECEIVE_PLAN), C2CTransitionError);
  for (const patch of [{ taskId: "c2c_wrong" }, { planSha256: "b".repeat(64) }, { iteration: 2 }]) {
    assert.throws(() => transition(list[3], { type: "COMPLETE_EXECUTION", message: { ...executed, ...patch } }), C2CTransitionError);
  }
  for (const patch of [{ executionId: "exec_other" }, { changedFiles: 2 }]) {
    assert.throws(() => transition(list[4], { type: "SEND_EXECUTED", message: { ...executed, ...patch } }), C2CTransitionError);
  }
  assert.throws(() => transition(list[5], events.SEND_EXECUTED), C2CTransitionError);
});
for (const state of Object.keys(allowed)) test(`${state} rejects executor messages and HANDOFF as incoming review`, () => {
  const snapshot = snapshots().find(s => s.state === state);
  const handoff = { ...base, state: "HANDOFF", originalGoal: "Implement", progress: "Started", currentState: "EXECUTING", knownIssues: "None", nextExpectedStep: "Review" };
  for (const message of [init, executed, handoff]) {
    assert.throws(() => transition(snapshot, { type: "RECEIVE", message }), C2CTransitionError);
  }
});
test("untrusted snapshots/events fail closed; no HANDOFF recovery or authority side effects", () => {
  for (const snapshot of [{}, { ...snapshots()[0], iteration: -1 }, { ...snapshots()[3], plan: null }, { ...snapshots()[5], waitingFor: "USER" }]) {
    assert.throws(() => transition(snapshot, events.FAIL), C2CTransitionError);
  }
  assert.throws(() => transition(createTask("c2c_test"), { type: "SEND_INIT", message: init, command: "run" }), C2CTransitionError);
  assert.throws(() => transition(snapshots()[5], { type: "RESUME" }), C2CTransitionError);
  assert.throws(() => createTask("bad task"), C2CTransitionError);
});

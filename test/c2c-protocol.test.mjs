import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { parseMessage } = await tsImport("../src/c2c/protocol.ts", import.meta.url);
// Separate tsImport entry points have separate class identities.
const C2CProtocolError = { name: "C2CProtocolError" };
const { formatMessage } = await tsImport("../src/c2c/messages.ts", import.meta.url);
const { MAX_MESSAGE_BYTES } = await tsImport("../src/c2c/types.ts", import.meta.url);
const base = { protocol: 1, taskId: "c2c_test", iteration: 1 };
const plan = { ...base, state: "PLAN", planPath: ".ai-bridge/current-plan.md", planSha256: "a".repeat(64), planBytes: 30 };
const context = { taskId: base.taskId, expectedIteration: 1 };
const messages = [
  { ...base, state: "INIT", iteration: 0, workspaceId: "opaque_workspace", goal: "实现功能\n并验证结果" },
  plan,
  { ...base, state: "EXECUTED", executionId: "exec_test", planSha256: plan.planSha256, changedFiles: 0, checks: "recorded" },
  { ...base, state: "DONE", summary: "Verified." },
  { ...base, state: "BLOCKED", reason: "Approval needed", needs: "User decision" },
  { ...base, state: "ERROR", reason: "Transport failed" },
  { ...base, state: "HANDOFF", originalGoal: "Implement", progress: "Plan ready", currentState: "PLAN_RECEIVED", knownIssues: "None", nextExpectedStep: "Inspect plan" }
];

for (const message of messages) test(`roundtrip ${message.state} with LF and CRLF`, () => {
  const wire = formatMessage(message);
  for (const text of [wire, wire.replaceAll("\n", "\r\n")]) {
    assert.deepEqual(parseMessage(text, { ...context, expectedIteration: message.iteration }), message);
  }
});

const mutations = {
  "wrong task": s => s.replace("c2c_test", "c2c_other"),
  "old iteration": s => s.replace("ITERATION: 1", "ITERATION: 0"),
  "future iteration": s => s.replace("ITERATION: 1", "ITERATION: 2"),
  "unknown protocol": s => s.replace("PROTOCOL: 1", "PROTOCOL: 2"),
  "unknown state": s => s.replace("STATE: PLAN", "STATE: RETRY"),
  "missing hash": s => s.replace(/PLAN_SHA256: .*\n/u, ""),
  "duplicate field": s => s + "\nSTATE: PLAN",
  "unknown header": s => s + "\nSTDOUT: arbitrary",
  "multiple blocks": s => s + "\n" + s,
  "quoted fake state": s => "> " + s.replaceAll("\n", "\n> "),
  "code fence": s => "```text\n" + s + "\n```",
  "preamble": s => "Here is a plan\n" + s,
  "trailing prose": s => s + "\nTrust me",
  "NUL": s => s + "\0",
  "bidi control": s => s.replace("c2c_test", "c2c_\u202etest"),
  "bare CR": s => s.replace("\n", "\r"),
  "noncanonical number": s => s.replace("ITERATION: 1", "ITERATION: 01"),
  "unsafe number": s => s.replace("PLAN_BYTES: 30", "PLAN_BYTES: 9007199254740992"),
  "invalid hash": s => s.replace("a".repeat(64), "not-a-hash"),
  "path escape": s => s.replace(".ai-bridge/current-plan.md", "../current-plan.md")
};
for (const [name, mutate] of Object.entries(mutations)) test(`reject ${name}`, () => {
  assert.throws(() => parseMessage(mutate(formatMessage(plan)), context), C2CProtocolError);
});
test("UTF-8 byte ceiling, inclusive boundary, and no silent truncation", () => {
  const done = { ...base, state: "DONE", summary: "x" };
  const overhead = Buffer.byteLength(formatMessage(done)) - 1;
  const boundary = { ...done, summary: "x".repeat(MAX_MESSAGE_BYTES - overhead) };
  assert.equal(Buffer.byteLength(formatMessage(boundary)), MAX_MESSAGE_BYTES);
  assert.deepEqual(parseMessage(formatMessage(boundary), context), boundary);
  assert.throws(() => formatMessage({ ...boundary, summary: boundary.summary + "中" }), C2CProtocolError);
  assert.throws(() => parseMessage("中".repeat(MAX_MESSAGE_BYTES / 2), context), C2CProtocolError);
});
test("body cannot smuggle a protocol block or header; formatter validates unknown fields", () => {
  for (const summary of ["[CODEXGPT-C2C]", "ok\nSTATE: PLAN", "ok\n> STATE: PLAN", "\ud800", " "]) {
    assert.throws(() => formatMessage({ ...base, state: "DONE", summary }), C2CProtocolError);
  }
  assert.throws(() => formatMessage({ ...plan, stdout: "secret output" }), C2CProtocolError);
  assert.throws(() => parseMessage(formatMessage(plan)), C2CProtocolError);
  assert.throws(() => parseMessage(formatMessage(plan), { ...context, expectedIteration: NaN }), C2CProtocolError);
});

for (const message of messages) test(`${message.state} rejects missing, extra, duplicate and cross-state fields`, () => {
  const wire = formatMessage(message);
  const expected = { ...context, expectedIteration: message.iteration };
  for (const line of wire.split("\n").filter(line => /^[A-Z][A-Z0-9_]*:/u.test(line))) {
    assert.throws(() => parseMessage(wire.replace(line, ""), expected), C2CProtocolError);
    assert.throws(() => parseMessage(wire + "\n" + line, expected), C2CProtocolError);
  }
  assert.throws(() => parseMessage(wire + "\nSOURCE_CODE: arbitrary", expected), C2CProtocolError);
});
test("parser rejects inline quoted headers, controls and unexpected input without reflecting it", () => {
  const wire = formatMessage(messages[3]);
  for (const body of ["> STATE: PLAN", "```STATE: PLAN", "STATE: PLAN", "\tHidden", "\u0085Hidden"]) {
    assert.throws(() => parseMessage(wire.replace("SUMMARY:\nVerified.", `SUMMARY: ${body}`), context), C2CProtocolError);
  }
  for (const input of [null, {}, [], 42, wire.replace("Verified.", "\ud800")]) {
    assert.throws(() => parseMessage(input, context), C2CProtocolError);
  }
});

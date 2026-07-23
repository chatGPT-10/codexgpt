import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { serverInstructions } = await tsImport("../src/server.ts", import.meta.url);
const { summarizeGuidanceDiagnostics } = await tsImport("../src/guidance/diagnostics.ts", import.meta.url);

test("standard server instructions require target context before mutation and after subtree switches", () => {
  const text = serverInstructions({
    guidanceMode: "standard", connectionTest: false, writeMode: "workspace", bashMode: "off",
    toolContractVersion: 1, toolMode: "standard", codexSessions: "off"
  });
  assert.match(text, /codex_context\(target_path\) before the first mutation/);
  assert.match(text, /again after crossing into another subtree/);
  assert.match(text, /at most one matching implicit_eligible Skill/);
  assert.match(text, /explicit-only or dependency-unverified Skills require an explicit user request/);
  assert.match(text, /omit workspace_id on subsequent default-workspace tool calls/);
  assert.match(text, /workspace handles are transport-session scoped/);
});

test("legacy server instructions remain free of Phase 6 target-call requirements", () => {
  const text = serverInstructions({
    guidanceMode: "legacy", connectionTest: false, writeMode: "workspace", bashMode: "off",
    toolContractVersion: 1, toolMode: "standard", codexSessions: "off"
  });
  assert.doesNotMatch(text, /codex_context\(target_path\) before the first mutation/);
});

test("guidance diagnostics expose one action without leaking extra detail", () => {
  assert.deepEqual(summarizeGuidanceDiagnostics([]), {
    status: "ok", count: 0, first: null, action: "No guidance action is required."
  });
  const item = { status: "warning", code: "INSTRUCTION_FILE_TOO_LARGE", path: "AGENTS.md", count: 1, action: "Reduce the file." };
  const summary = summarizeGuidanceDiagnostics([item]);
  assert.equal(summary.status, "warning");
  assert.equal(summary.first, item);
  assert.equal(summary.action, "Reduce the file.");
});

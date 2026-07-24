import assert from "node:assert/strict";
import test from "node:test";
import { serverInstructions } from "../dist/server.js";

function config(toolContractVersion) {
  return {
    connectionTest: false,
    writeMode: "workspace",
    bashMode: "off",
    toolContractVersion,
    guidanceMode: "standard",
    codexSessions: "off",
    requireBashSession: false,
    toolMode: "standard"
  };
}

test("V5 routing separates preview-only intent from explicit apply and forbids token narration", () => {
  const instructions = serverInstructions(config(5));
  assert.match(instructions, /inspect rename impact.*stop without applying/i);
  assert.match(instructions, /explicit request to complete the rename/i);
  assert.match(instructions, /never quote, narrate, or expose that token/i);
  assert.match(instructions, /verify with diagnostics\/show_changes/i);
  assert.doesNotMatch(serverInstructions(config(4)), /preview_id|rename impact/i);
});

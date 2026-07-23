import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const mode = await tsImport("../src/guidance/mode.ts", import.meta.url);

test("omitted guidance mode defaults to ready standard after the live ChatGPT gate", () => {
  assert.equal(mode.DEFAULT_GUIDANCE_MODE, "standard");
  assert.equal(mode.STANDARD_GUIDANCE_READINESS, "ready");
  assert.equal(mode.resolveGuidanceMode(undefined), "standard");
  assert.equal(mode.guidanceReadiness("standard"), "ready");
});

test("rollback is one explicit restart flag and invalid values fail actionably", () => {
  assert.equal(mode.resolveGuidanceMode("legacy"), "legacy");
  assert.equal(mode.resolveGuidanceMode("standard"), "standard");
  assert.throws(() => mode.resolveGuidanceMode("auto"), /legacy or standard/);
});

test("doctor reports the activated default and explicit rollback truthfully", async () => {
  const source = await fs.readFile(new URL("../scripts/codexgpt.mjs", import.meta.url), "utf8");
  assert.match(source, /guidanceModeInput \?\? 'standard'/u);
  assert.match(source, /standard is ready and enabled by default/u);
  assert.match(source, /explicit legacy rollback mode/u);
  assert.doesNotMatch(source, /live ChatGPT acceptance gate remains blocked/u);
});

test("doctor mirrors omitted minimal guidance compatibility", async () => {
  const source = await fs.readFile(new URL("../scripts/codexgpt.mjs", import.meta.url), "utf8");
  assert.match(source, /guidanceModeInput === undefined && toolMode === 'minimal'/u);
  assert.match(source, /minimal mode uses legacy compatibility because codex_context is unavailable/u);
});

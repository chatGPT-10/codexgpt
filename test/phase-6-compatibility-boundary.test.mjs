import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const modeModule = await tsImport("../src/guidance/mode.ts", import.meta.url).catch(() => null);
const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);

function withEnv(values, callback) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("Phase 6 guidance mode defaults to standard after activation and validates explicit values", () => {
  assert.ok(modeModule, "src/guidance/mode.ts must exist");
  assert.equal(modeModule.DEFAULT_GUIDANCE_MODE, "standard");
  assert.equal(modeModule.resolveGuidanceMode(undefined), "standard");
  assert.equal(modeModule.resolveGuidanceMode(" legacy "), "legacy");
  assert.equal(modeModule.resolveGuidanceMode("STANDARD"), "standard");
  assert.throws(
    () => modeModule.resolveGuidanceMode("enabled"),
    /CODEXGPT_GUIDANCE_MODE must be legacy or standard/
  );
});

test("Phase 6 readiness is diagnostic state and does not widen authority", () => {
  assert.ok(modeModule, "src/guidance/mode.ts must exist");
  assert.equal(modeModule.guidanceReadiness("legacy"), "not_ready");
  assert.equal(modeModule.guidanceReadiness("standard"), "ready");
  assert.deepEqual(Object.keys(modeModule.guidanceRuntimeState("standard")).sort(), [
    "mode",
    "readiness"
  ]);
});

test("legacy Smoke compatibility wrappers pin the rollback mode explicitly", async () => {
  const wrappers = [
    "smoke-platform-compat.mjs",
    "http-smoke-compat.mjs",
    "settings-smoke-platform-compat.mjs",
    "execute-handoff-smoke-platform-compat.mjs"
  ];
  for (const name of wrappers) {
    const source = await fs.readFile(new URL(`../scripts/${name}`, import.meta.url), "utf8");
    assert.match(source, /CODEXGPT_GUIDANCE_MODE\s*=\s*["']legacy["']/u, name);
  }
});

test("Phase 6 config defaults and validates instruction fallback basenames at startup", () => {
  const defaults = withEnv({
    CODEXGPT_GUIDANCE_MODE: undefined,
    CODEXGPT_INSTRUCTION_FALLBACKS: undefined
  }, () => loadConfig(["--bash", "off", "--write", "off"]));
  assert.deepEqual(defaults.instructionFallbacks, ["agents.md", ".agents.md"]);
  const omittedMinimal = withEnv({ CODEXGPT_GUIDANCE_MODE: undefined }, () =>
    loadConfig(["--bash", "off", "--write", "off", "--tool-mode", "minimal"])
  );
  assert.equal(omittedMinimal.guidanceMode, "legacy");
  assert.throws(() => withEnv({ CODEXGPT_INSTRUCTION_FALLBACKS: "notes.md,NOTES.md" }, () =>
    loadConfig(["--bash", "off", "--write", "off"])
  ), /case-insensitive duplicates/);
  assert.throws(() => withEnv({ CODEXGPT_GUIDANCE_MODE: "standard" }, () =>
    loadConfig(["--bash", "off", "--write", "off", "--tool-mode", "minimal"])
  ), /requires CODEXGPT_TOOL_MODE=standard or full/);
});

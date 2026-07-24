import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const configModule = await tsImport("../src/config.ts", import.meta.url);
const contracts = await tsImport("../src/tools/contracts/index.ts", import.meta.url);
const semanticSchema = await tsImport("../src/tools/schemas/semantic.ts", import.meta.url).catch(() => null);

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

function load(changes = {}) {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: undefined,
    CODEXGPT_TOOL_CONTRACT_VERSION: undefined,
    ...changes
  }, () => configModule.loadConfig(["--bash", "off", "--write", "off"]));
}

test("explicit semantic standard maps to V5 while omitted and legacy stay exact", () => {
  assert.equal(load().toolContractVersion, 1);
  assert.equal(load().semanticMode, "legacy");
  assert.equal(load({ CODEXGPT_SEMANTIC_MODE: "legacy" }).toolContractVersion, 1);
  assert.equal(load({ CODEXGPT_SEMANTIC_MODE: "standard" }).toolContractVersion, 5);
  assert.equal(load({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: "5"
  }).toolContractVersion, 5);
  assert.throws(() => load({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: "4"
  }), /contradict/i);
});

test("V5 is exact V4 plus one semantic tool and inherited predicates include V5", () => {
  assert.equal(contracts.CONTRACT_V1_CHILD_TOOLS.length, 28);
  assert.equal(contracts.CONTRACT_V2_CHILD_TOOLS.length, 31);
  assert.equal(contracts.CONTRACT_V3_CHILD_TOOLS.length, 39);
  assert.equal(contracts.CONTRACT_V4_CHILD_TOOLS.length, 51);
  assert.equal(contracts.CONTRACT_V5_CHILD_TOOLS.length, 52);
  assert.deepEqual(contracts.CONTRACT_V5_CHILD_TOOLS.slice(0, 51), contracts.CONTRACT_V4_CHILD_TOOLS);
  assert.deepEqual(contracts.CONTRACT_V5_CHILD_TOOLS.slice(51), ["semantic"]);
  assert.equal(contracts.contractIncludesV2(5), true);
  assert.equal(contracts.contractIncludesV3(5), true);
  assert.equal(contracts.contractIncludesV4(5), true);
  assert.equal(contracts.contractIncludesV5(5), true);
  assert.deepEqual(contracts.v5ToolsForProjection({ version: 5, mode: "standard", connectionTest: false }), ["semantic"]);
  assert.deepEqual(contracts.v5ToolsForProjection({ version: 5, mode: "full", connectionTest: false }), ["semantic"]);
  assert.deepEqual(contracts.v5ToolsForProjection({ version: 5, mode: "minimal", connectionTest: false }), []);
  assert.deepEqual(contracts.v5ToolsForProjection({ version: 5, mode: "full", connectionTest: true }), []);
});

test("semantic input is a strict operation-discriminated union", () => {
  assert.ok(semanticSchema);
  const definition = {
    operation: "definition",
    locator: { kind: "symbol", symbol: "value", path_hint: "src/main.ts" },
    max_results: 20
  };
  assert.equal(semanticSchema.semanticInputSchema.safeParse(definition).success, true);
  assert.equal(semanticSchema.semanticInputSchema.safeParse({ ...definition, path: "src/main.ts" }).success, false);
  assert.equal(semanticSchema.semanticInputSchema.safeParse({
    operation: "diagnostics",
    path: "src/main.ts",
    locator: { kind: "symbol", symbol: "value" }
  }).success, false);
  assert.equal(semanticSchema.semanticInputSchema.safeParse({
    operation: "rename_preview",
    locator: { kind: "position", path: "src/main.ts", line: 1, column: 1 },
    new_name: "bad/name"
  }).success, false);
});

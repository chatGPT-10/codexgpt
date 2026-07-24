import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, assertToolContractConfiguration } from "../dist/config.js";
import { createCodexGPTServer } from "../dist/server.js";
import * as contracts from "../dist/tools/contracts/index.js";

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
    CODEXGPT_TOOL_CONTRACT_VERSION: undefined,
    CODEXGPT_FILE_TRANSACTIONS: undefined,
    CODEXGPT_AUDIT_MODE: undefined,
    CODEXGPT_POLICY_ENGINE: undefined,
    ...changes
  }, () => loadConfig(argv));
}

const COMPLETE_V3_CAPABILITIES = Object.freeze({
  durableAuditAvailable: true,
  stateRootAvailable: true,
  movePathsAvailable: true,
  stableSessionAvailable: true,
  atomicStateReadersAvailable: true,
  contractV3MigrationAvailable: true
});

const V3_ADDITIONS = Object.freeze([
  "open_full_access_workspace",
  "run_command",
  "start_process",
  "read_process_output",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "list_processes"
]);

test("contract V3 parses explicitly while V1 remains the default", () => {
  assert.equal(config().toolContractVersion, 1);
  assert.equal(config({ CODEXGPT_TOOL_CONTRACT_VERSION: "3" }).toolContractVersion, 3);
  assert.equal(config({}, ["--bash", "off", "--write", "off", "--tool-contract-version", "3"]).toolContractVersion, 3);
  assert.throws(
    () => config({ CODEXGPT_TOOL_CONTRACT_VERSION: "6" }),
    /CODEXGPT_TOOL_CONTRACT_VERSION must be 1, 2, 3, 4, or 5/
  );
});

test("V1=28 V2=31 and V3=39 are exact frozen canonical universes", () => {
  assert.equal(contracts.CONTRACT_V1_CHILD_TOOLS.length, 28);
  assert.equal(contracts.CONTRACT_V2_CHILD_TOOLS.length, 31);
  assert.equal(contracts.CONTRACT_V3_CHILD_TOOLS.length, 39);
  assert.equal(new Set(contracts.CONTRACT_V3_CHILD_TOOLS).size, 39);
  assert.equal(contracts.CONTRACT_V3_CHILD_TOOLS.includes("bash"), false);
  assert.deepEqual(
    contracts.CONTRACT_V3_CHILD_TOOLS.slice(0, 30),
    contracts.CONTRACT_V2_CHILD_TOOLS.filter((name) => name !== "bash")
  );
  assert.deepEqual(contracts.CONTRACT_V3_CHILD_TOOLS.slice(30), V3_ADDITIONS);
  assert.strictEqual(contracts.canonicalToolsForVersion(1), contracts.CONTRACT_V1_CHILD_TOOLS);
  assert.strictEqual(contracts.canonicalToolsForVersion(2), contracts.CONTRACT_V2_CHILD_TOOLS);
  assert.strictEqual(contracts.canonicalToolsForVersion(3), contracts.CONTRACT_V3_CHILD_TOOLS);
  assert.equal(Object.isFrozen(contracts.CONTRACT_V3_CHILD_TOOLS), true);
});

test("V3 profile projection is descriptor-driven and keeps inherited V2 capability", () => {
  assert.equal(typeof contracts.contractIncludesV2, "function");
  assert.equal(contracts.contractIncludesV2(1), false);
  assert.equal(contracts.contractIncludesV2(2), true);
  assert.equal(contracts.contractIncludesV2(3), true);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "minimal", connectionTest: false }), []);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "standard", connectionTest: false }), [
    "run_command",
    "read_process_output"
  ]);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "full", connectionTest: false }), V3_ADDITIONS);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "full", connectionTest: true }), []);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 2, mode: "full", connectionTest: false }), []);
});

test("V3 startup fails closed unless enforce, required durable audit, stable session, atomic readers, and migration gate exist", () => {
  const valid = config({
    CODEXGPT_TOOL_CONTRACT_VERSION: "3",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
  });
  assert.doesNotThrow(() => assertToolContractConfiguration(valid, COMPLETE_V3_CAPABILITIES));

  for (const [field, pattern] of [
    ["durableAuditAvailable", /(?:durable|persistent) audit/i],
    ["stateRootAvailable", /Phase 3 state root/i],
    ["movePathsAvailable", /move_paths/i],
    ["stableSessionAvailable", /stable.*session/i],
    ["atomicStateReadersAvailable", /atomic.*readers/i],
    ["contractV3MigrationAvailable", /migration gate/i]
  ]) {
    assert.throws(
      () => assertToolContractConfiguration(valid, { ...COMPLETE_V3_CAPABILITIES, [field]: false }),
      pattern
    );
  }

  assert.throws(
    () => assertToolContractConfiguration({ ...valid, policyEngineMode: "shadow" }, COMPLETE_V3_CAPABILITIES),
    /Policy Kernel enforce/i
  );
  assert.throws(
    () => assertToolContractConfiguration({ ...valid, auditMode: "best_effort" }, COMPLETE_V3_CAPABILITIES),
    /required durable audit/i
  );
});

test("legacy shadow and best-effort V3 startup fail before any registered handler can run", () => {
  let handlerCalls = 0;
  const dependencies = {
    persistentAuditRuntime: { persistAuthorization() {}, persistExecution() {} },
    workspaceMutationRuntime: {},
    movePathsService: {},
    undoChangeSetService: {},
    policySessionContextSource: {},
    v3ToolHandlers: {
      run_command() {
        handlerCalls += 1;
        return {};
      }
    }
  };
  const cases = [
    { CODEXGPT_POLICY_ENGINE: "legacy", CODEXGPT_AUDIT_MODE: "required" },
    { CODEXGPT_POLICY_ENGINE: "shadow", CODEXGPT_AUDIT_MODE: "required" },
    { CODEXGPT_POLICY_ENGINE: "enforce", CODEXGPT_AUDIT_MODE: "best_effort" }
  ];
  for (const overrides of cases) {
    const invalid = config({
      CODEXGPT_TOOL_CONTRACT_VERSION: "3",
      CODEXGPT_FILE_TRANSACTIONS: "atomic",
      ...overrides
    });
    assert.throws(
      () => createCodexGPTServer(invalid, dependencies),
      /Policy Kernel enforce|required durable audit/i
    );
  }
  assert.equal(handlerCalls, 0);
});

test("V3 minimal and connection-test projections add no new authority and skip V3-only startup capabilities", () => {
  const baseCapabilities = {
    durableAuditAvailable: true,
    stateRootAvailable: true,
    movePathsAvailable: true
  };
  const minimal = config({
    CODEXGPT_TOOL_CONTRACT_VERSION: "3",
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "legacy"
  }, ["--bash", "off", "--write", "off", "--tool-mode", "minimal"]);
  assert.doesNotThrow(() => assertToolContractConfiguration(minimal, baseCapabilities));

  const connection = {
    ...minimal,
    toolMode: "full",
    connectionTest: true
  };
  assert.doesNotThrow(() => assertToolContractConfiguration(connection, baseCapabilities));
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "minimal", connectionTest: false }), []);
  assert.deepEqual(contracts.v3ToolsForProjection({ version: 3, mode: "full", connectionTest: true }), []);
});

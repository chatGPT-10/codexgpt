import assert from "node:assert/strict";
import test from "node:test";
import {
  assertToolContractConfiguration,
  loadConfig
} from "../dist/config.js";
import { createCodexProServer } from "../dist/server.js";
import {
  CANONICAL_CODEXPRO_CHILD_TOOLS,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V1,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V2,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V3,
  canonicalCodexProChildTools
} from "../dist/tools/schemas/codexpro.js";

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

function config(overrides = {}, argv = ["--bash", "off"]) {
  return withEnv({
    CODEXPRO_TOOL_CONTRACT_VERSION: undefined,
    CODEXPRO_FILE_TRANSACTIONS: undefined,
    CODEXPRO_AUDIT_MODE: undefined,
    CODEXPRO_POLICY_ENGINE: undefined,
    ...overrides
  }, () => loadConfig(argv));
}

const COMPLETE_V2_CAPABILITIES = Object.freeze({
  durableAuditAvailable: true,
  stateRootAvailable: true,
  movePathsAvailable: true
});

test("tool contract version defaults to 1 and rejects unknown values", () => {
  assert.equal(config().toolContractVersion, 1);
  assert.equal(config({ CODEXPRO_TOOL_CONTRACT_VERSION: "2" }).toolContractVersion, 2);
  assert.equal(config({}, ["--bash", "off", "--tool-contract-version", "2"]).toolContractVersion, 2);
  assert.throws(
    () => config({ CODEXPRO_TOOL_CONTRACT_VERSION: "v2" }),
    /CODEXPRO_TOOL_CONTRACT_VERSION must be 1, 2, 3, or 4/
  );
  assert.throws(
    () => config({}, ["--bash", "off", "--tool-contract-version"]),
    /--tool-contract-version requires a value of 1, 2, 3, or 4/
  );
});

test("canonical V1 and V2 stay exact while V3 reserves its complete 39-tool snapshot", () => {
  assert.strictEqual(CANONICAL_CODEXPRO_CHILD_TOOLS, CANONICAL_CODEXPRO_CHILD_TOOLS_V1);
  assert.strictEqual(canonicalCodexProChildTools(1), CANONICAL_CODEXPRO_CHILD_TOOLS_V1);
  assert.strictEqual(canonicalCodexProChildTools(2), CANONICAL_CODEXPRO_CHILD_TOOLS_V2);
  assert.strictEqual(canonicalCodexProChildTools(3), CANONICAL_CODEXPRO_CHILD_TOOLS_V3);
  assert.equal(Object.isFrozen(CANONICAL_CODEXPRO_CHILD_TOOLS_V1), true);
  assert.equal(Object.isFrozen(CANONICAL_CODEXPRO_CHILD_TOOLS_V2), true);
  assert.equal(Object.isFrozen(CANONICAL_CODEXPRO_CHILD_TOOLS_V3), true);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V1.length, 28);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V2.length, 31);
  assert.equal(new Set(CANONICAL_CODEXPRO_CHILD_TOOLS_V2).size, 31);
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS_V3.length, 39);
  assert.deepEqual(
    CANONICAL_CODEXPRO_CHILD_TOOLS_V2.slice(0, 28),
    CANONICAL_CODEXPRO_CHILD_TOOLS_V1
  );
  assert.deepEqual(CANONICAL_CODEXPRO_CHILD_TOOLS_V2.slice(28), [
    "query_audit_events",
    "undo_change_set",
    "move_paths"
  ]);
});

test("contract V2 requires atomic transactions persistent audit state and move_paths", () => {
  const legacyV2 = config({ CODEXPRO_TOOL_CONTRACT_VERSION: "2" });
  assert.throws(
    () => assertToolContractConfiguration(legacyV2, COMPLETE_V2_CAPABILITIES),
    /CODEXPRO_FILE_TRANSACTIONS=atomic/
  );

  const atomicV2 = config({
    CODEXPRO_TOOL_CONTRACT_VERSION: "2",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "required"
  }, ["--bash", "off", "--write", "off"]);
  assert.throws(
    () => assertToolContractConfiguration(atomicV2, {
      ...COMPLETE_V2_CAPABILITIES,
      durableAuditAvailable: false
    }),
    /persistent audit runtime/
  );
  assert.throws(
    () => assertToolContractConfiguration(atomicV2, {
      ...COMPLETE_V2_CAPABILITIES,
      stateRootAvailable: false
    }),
    /Phase 3 state root/
  );
  assert.throws(
    () => assertToolContractConfiguration(atomicV2, {
      ...COMPLETE_V2_CAPABILITIES,
      movePathsAvailable: false
    }),
    /incomplete.*move_paths/i
  );
  assert.doesNotThrow(() =>
    assertToolContractConfiguration(atomicV2, COMPLETE_V2_CAPABILITIES)
  );

  const auditOffV2 = config({
    CODEXPRO_TOOL_CONTRACT_VERSION: "2",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "off"
  }, ["--bash", "off", "--write", "off"]);
  assert.throws(
    () => assertToolContractConfiguration(auditOffV2, COMPLETE_V2_CAPABILITIES),
    /persistent audit.*cannot be off/i
  );
});

test("production server rejects incomplete V2 before tool registration", () => {
  const atomicV2 = config({
    CODEXPRO_TOOL_CONTRACT_VERSION: "2",
    CODEXPRO_FILE_TRANSACTIONS: "atomic",
    CODEXPRO_AUDIT_MODE: "required"
  }, ["--bash", "off", "--write", "off"]);
  assert.throws(
    () => createCodexProServer(atomicV2),
    /incomplete.*move_paths/i
  );

  assert.doesNotThrow(() => createCodexProServer(config()));
});

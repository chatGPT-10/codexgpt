import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuditConfiguration,
  loadConfig,
  resolveAuditRequirement
} from "../dist/config.js";

function withEnv(values, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
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

const AUDIT_ENV = {
  CODEXGPT_AUDIT_MODE: undefined,
  CODEXGPT_AUDIT_RETENTION_DAYS: undefined,
  CODEXGPT_AUDIT_RETENTION_BYTES: undefined,
  CODEXGPT_POLICY_ENGINE: undefined
};

test("audit configuration defaults to auto with bounded retention", () => {
  withEnv(AUDIT_ENV, () => {
    const config = loadConfig(["--bash", "off"]);
    assert.equal(config.auditMode, "auto");
    assert.deepEqual(config.auditRetention, {
      maxAgeDays: 30,
      maxClosedBytes: 100 * 1024 * 1024
    });
  });
});

test("audit mode is strict and retention stays within fixed bounds", () => {
  withEnv({ ...AUDIT_ENV, CODEXGPT_AUDIT_MODE: "required" }, () => {
    assert.equal(loadConfig(["--bash", "off"]).auditMode, "required");
  });
  withEnv({ ...AUDIT_ENV, CODEXGPT_AUDIT_MODE: "unsafe" }, () => {
    assert.throws(
      () => loadConfig(["--bash", "off"]),
      /auto, off, best_effort, or required/
    );
  });
  withEnv({
    ...AUDIT_ENV,
    CODEXGPT_AUDIT_RETENTION_DAYS: "0",
    CODEXGPT_AUDIT_RETENTION_BYTES: "1"
  }, () => {
    assert.deepEqual(loadConfig(["--bash", "off"]).auditRetention, {
      maxAgeDays: 1,
      maxClosedBytes: 1024 * 1024
    });
  });
  withEnv({
    ...AUDIT_ENV,
    CODEXGPT_AUDIT_RETENTION_DAYS: "9999",
    CODEXGPT_AUDIT_RETENTION_BYTES: String(4 * 1024 * 1024 * 1024)
  }, () => {
    assert.deepEqual(loadConfig(["--bash", "off"]).auditRetention, {
      maxAgeDays: 365,
      maxClosedBytes: 2 * 1024 * 1024 * 1024
    });
  });
});

test("auto audit is best effort except enforce-mode R2 or higher mutations", () => {
  assert.equal(
    resolveAuditRequirement({ auditMode: "auto", policyEngineMode: "legacy" }, "R2", true),
    "best_effort"
  );
  assert.equal(
    resolveAuditRequirement({ auditMode: "auto", policyEngineMode: "shadow" }, "R3", true),
    "best_effort"
  );
  assert.equal(
    resolveAuditRequirement({ auditMode: "auto", policyEngineMode: "enforce" }, "R1", false),
    "best_effort"
  );
  assert.equal(
    resolveAuditRequirement({ auditMode: "auto", policyEngineMode: "enforce" }, "R2", true),
    "required"
  );
  assert.equal(
    resolveAuditRequirement({ auditMode: "auto", policyEngineMode: "enforce" }, "R3", true),
    "required"
  );
});

test("invalid required-audit configurations fail closed", () => {
  withEnv({
    ...AUDIT_ENV,
    CODEXGPT_POLICY_ENGINE: "enforce",
    CODEXGPT_AUDIT_MODE: "off"
  }, () => {
    assert.throws(() => loadConfig(["--bash", "off"]), /cannot be off/i);
  });
  assert.throws(
    () => assertAuditConfiguration(
      { auditMode: "off", policyEngineMode: "enforce" },
      { durableStoreAvailable: true }
    ),
    /cannot be off/i
  );
  assert.throws(
    () => assertAuditConfiguration(
      { auditMode: "required", policyEngineMode: "legacy" },
      { durableStoreAvailable: false }
    ),
    /durable audit store/i
  );
  assert.doesNotThrow(() => assertAuditConfiguration(
    { auditMode: "best_effort", policyEngineMode: "legacy" },
    { durableStoreAvailable: false }
  ));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_SANDBOX_ISOLATION_KEYS,
  REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS,
  projectSandboxCapabilityEvidence,
  runWindowsSandboxSpike,
  validateSandboxCapabilityEvidence
} from "../scripts/windows-sandbox-spike.mjs";

const windowsOnly = process.platform === "win32" ? test : test.skip;

windowsOnly("Gate S emits complete restricted-identity, attack-oracle, backend, and cleanup evidence", async () => {
  const evidence = validateSandboxCapabilityEvidence(await runWindowsSandboxSpike());

  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.probeRevision, "phase-4b0-gate-s-v1");
  assert.match(evidence.fixtureDigest, /^[a-f0-9]{64}$/);
  assert.equal(typeof evidence.usedElevation, "boolean");

  for (const key of [
    "profileCreated", "profileDeleted", "uniqueProfile", "collisionRejected", "isAppContainer",
    "isLpac", "appContainerSidMatches", "hostChildAgreement", "jobMember"
  ]) {
    assert.equal(typeof evidence.identity[key], "boolean", `${key} identity fact was not classified`);
  }
  assert.ok(["proved", "backend_incompatible", "partial"].includes(evidence.identity.lpacStatus));
  for (const key of ["integrityRid", "capabilityCount", "restrictedSidCount"]) {
    assert.equal(Number.isInteger(evidence.identity[key]), true, `${key} identity fact was not numeric`);
  }

  for (const backend of Object.values(evidence.backends)) {
    assert.ok(["proved", "unavailable"].includes(backend.status));
    assert.equal(typeof backend.classification, "string");
    assert.ok(backend.exitCode === null || Number.isInteger(backend.exitCode));
  }

  assert.deepEqual(Object.keys(evidence.isolation).sort(), [...REQUIRED_SANDBOX_ISOLATION_KEYS].sort());
  assert.deepEqual(Object.keys(evidence.positiveControls).sort(), [...REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS].sort());
  for (const result of Object.values(evidence.isolation)) {
    assert.ok(["denied", "allowed", "partial", "non_policy_failure"].includes(result.status));
    assert.equal(typeof result.classification, "string");
    assert.equal(Number.isInteger(result.code), true);
  }
  for (const key of REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS) {
    assert.equal(typeof evidence.positiveControls[key], "boolean", `${key} positive control was not classified`);
  }

  for (const key of [
    "normalProbeExited", "crashProbeExited", "partialSpawnRejected", "jobEmpty", "profileDeleted",
    "privateTreeDeleted", "privateRegistryDeleted", "namedObjectsClosed", "noResidualAclTargets", "persistentSystemStateChanged"
  ]) {
    assert.equal(typeof evidence.cleanup[key], "boolean", `${key} cleanup fact was not classified`);
  }
  assert.equal(evidence.cleanup.persistentSystemStateChanged, false);

  const projection = projectSandboxCapabilityEvidence(evidence);
  if (evidence.result === "proved") {
    assert.deepEqual(evidence.identity, {
      profileCreated: true,
      profileDeleted: true,
      uniqueProfile: true,
      collisionRejected: true,
      isAppContainer: true,
      isLpac: false,
      lpacStatus: evidence.identity.lpacStatus,
      appContainerSidMatches: true,
      hostChildAgreement: true,
      integrityRid: evidence.identity.integrityRid,
      capabilityCount: 0,
      restrictedSidCount: evidence.identity.restrictedSidCount,
      jobMember: true
    });
    assert.equal(evidence.identity.lpacStatus, "proved");
    assert.ok(evidence.identity.integrityRid < 0x2000);
    assert.ok(evidence.identity.restrictedSidCount >= 0);
    assert.equal(evidence.backends.windowsPowerShell.status, "proved");
    for (const [surface, result] of Object.entries(evidence.isolation)) {
      assert.equal(result.status, "denied", `${surface} was not denied: ${JSON.stringify(result)}`);
    }
    for (const key of REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS) {
      assert.equal(evidence.positiveControls[key], true, `${key} positive control failed`);
    }
    assert.deepEqual(evidence.cleanup, {
      normalProbeExited: true,
      crashProbeExited: true,
      partialSpawnRejected: true,
      jobEmpty: true,
      profileDeleted: true,
      privateTreeDeleted: true,
      privateRegistryDeleted: true,
      namedObjectsClosed: true,
      noResidualAclTargets: true,
      persistentSystemStateChanged: false
    });
    assert.equal(evidence.reason, null);
    assert.equal(projection.workspaceSandbox, "proved");
  } else {
    assert.equal(evidence.result, "blocked");
    assert.equal(typeof evidence.reason, "string");
    assert.ok(evidence.reason.length > 0);
    assert.equal(projection.workspaceSandbox, "unavailable");
    assert.equal(projection.fallback, "none");
  }
});

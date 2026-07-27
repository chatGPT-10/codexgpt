import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

test("known old schema migrates copy-on-write after a verified backup", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const old = fixture.auth.createKnownDeploymentStateV0ForTest(initialized.state);
    const file = fixture.auth.deploymentStateFile(fixture.stateRoot, old.bindingId, old.incarnationId);
    fs.writeFileSync(file, `${JSON.stringify(old)}\n`, "utf8");
    const migrated = await fixture.auth.migrateKnownDeploymentStateV0({
      store: fixture.store,
      bindingId: old.bindingId,
      incarnationId: old.incarnationId
    });
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.generation, old.generation + 1);
    assert.equal(migrated.recoveryRequired, false);
    assert.deepEqual(migrated.previousPublicJwks, []);
    const backup = path.join(path.dirname(file), "backups", `state-v0-generation-${old.generation}.json`);
    assert.equal(fs.existsSync(backup), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(backup, "utf8")), old);
  } finally {
    fixture.cleanup();
  }
});

test("future schema is never stripped or rewritten by an old binary", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const file = fixture.auth.deploymentStateFile(
      fixture.stateRoot,
      initialized.state.bindingId,
      initialized.state.incarnationId
    );
    const future = { ...initialized.state, schemaVersion: 99, futureAuthority: "preserve-me" };
    const text = `${JSON.stringify(future)}\n`;
    fs.writeFileSync(file, text, "utf8");
    await assert.rejects(
      () => fixture.auth.migrateKnownDeploymentStateV0({
        store: fixture.store,
        bindingId: initialized.state.bindingId,
        incarnationId: initialized.state.incarnationId
      }),
      (error) => error?.code === "OAUTH_STATE_MIGRATION_REQUIRED"
    );
    assert.equal(fs.readFileSync(file, "utf8"), text);
  } finally {
    fixture.cleanup();
  }
});

test("old schema with invalid integrity enters recovery-required without backup", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const old = fixture.auth.createKnownDeploymentStateV0ForTest(initialized.state);
    old.generation += 1;
    const file = fixture.auth.deploymentStateFile(fixture.stateRoot, old.bindingId, old.incarnationId);
    fs.writeFileSync(file, `${JSON.stringify(old)}\n`, "utf8");
    await assert.rejects(
      () => fixture.auth.migrateKnownDeploymentStateV0({
        store: fixture.store,
        bindingId: old.bindingId,
        incarnationId: old.incarnationId
      }),
      (error) => error?.code === "OAUTH_STATE_RECOVERY_REQUIRED"
    );
    assert.equal(fs.existsSync(path.join(path.dirname(file), "backups")), false);
  } finally {
    fixture.cleanup();
  }
});

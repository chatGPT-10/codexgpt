import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

test("signing rotation publishes a new kid and retains only the old public key", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const old = initialized.state;
    const rotated = await fixture.coordinator.rotateSigningKey(fixture.configuration.identityKey);
    const backups = fixture.store.listDeploymentBackups(old.bindingId, old.incarnationId);
    assert.equal(backups.length, 1);
    assert.deepEqual(
      fixture.store.readDeploymentBackup(old.bindingId, old.incarnationId, backups[0]),
      old
    );
    assert.equal(rotated.bindingId, old.bindingId);
    assert.equal(rotated.incarnationId, old.incarnationId);
    assert.equal(rotated.generation, old.generation + 1);
    assert.notEqual(rotated.activePublicJwk.kid, old.activePublicJwk.kid);
    assert.notEqual(rotated.protectedSigningPrivateJwk, old.protectedSigningPrivateJwk);
    assert.deepEqual(rotated.previousPublicJwks, [old.activePublicJwk]);
    assert.equal(JSON.stringify(rotated).includes('"d"'), false);
    const privateKey = await fixture.keyManager.loadPrivateKey(rotated);
    assert.equal(privateKey.type, "private");
    const persisted = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(persisted.activePublicJwk.kid, rotated.activePublicJwk.kid);
    const stateText = fs.readFileSync(
      fixture.auth.deploymentStateFile(fixture.stateRoot, rotated.bindingId, rotated.incarnationId),
      "utf8"
    );
    assert.equal(stateText.includes(old.protectedSigningPrivateJwk), false);
    const backupText = fs.readFileSync(
      fixture.auth.deploymentBackupFile(fixture.stateRoot, old.bindingId, old.incarnationId, backups[0]),
      "utf8"
    );
    assert.equal(backupText.includes(old.protectedSigningPrivateJwk), true);
  } finally {
    fixture.cleanup();
  }
});

test("protected key material cannot be opened under another purpose", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    await assert.rejects(
      () => fixture.credentialStore.unprotect(initialized.state.protectedSigningPrivateJwk, "codexgpt-owner-v1"),
      (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
    );
  } finally {
    fixture.cleanup();
  }
});

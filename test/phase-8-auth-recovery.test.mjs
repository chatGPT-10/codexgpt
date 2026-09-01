import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

async function stateWithActiveGrant(fixture, state) {
  return fixture.store.writeDeployment({
    ...state,
    generation: state.generation + 1,
    grants: [{
      grantId: "grant_" + "1".repeat(32),
      clientRef: "clientref_" + "2".repeat(32),
      active: true,
      grantRevision: 3,
      refreshGeneration: 7
    }],
    updatedAt: new Date(Date.parse(state.updatedAt) + 1000).toISOString()
  });
}

test("recovery restore is a security reset with stable binding and new authority", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const backup = await stateWithActiveGrant(fixture, initialized.state);
    const registryBefore = fixture.store.readRegistry();
    const markerBefore = structuredClone(registryBefore.entries[0].tunnelOwnerMarker);
    const restored = await fixture.coordinator.restoreAsSecurityReset(
      fixture.configuration.identityKey,
      backup
    );
    assert.equal(restored.bindingId, backup.bindingId);
    assert.notEqual(restored.incarnationId, backup.incarnationId);
    assert.notEqual(restored.recoveryEpoch, backup.recoveryEpoch);
    assert.notEqual(restored.activePublicJwk.kid, backup.activePublicJwk.kid);
    assert.notEqual(restored.protectedRefreshPepper, backup.protectedRefreshPepper);
    assert.deepEqual(restored.grants, []);
    assert.deepEqual(restored.previousPublicJwks, []);
    const registryAfter = fixture.store.readRegistry();
    const backups = fixture.store.listBindingBackups(restored.bindingId);
    assert.equal(backups.length, 1);
    assert.equal(backups[0].incarnationId, backup.incarnationId);
    assert.deepEqual(
      fixture.store.readDeploymentBackup(restored.bindingId, backups[0].incarnationId, backups[0].backupId),
      backup
    );
    assert.deepEqual(registryAfter.entries[0].tunnelOwnerMarker, markerBefore);
    assert.equal(registryAfter.entries[0].currentIncarnationId, restored.incarnationId);
    assert.equal(
      fs.existsSync(fixture.auth.deploymentStateFile(fixture.stateRoot, backup.bindingId, backup.incarnationId)),
      true
    );
  } finally {
    fixture.cleanup();
  }
});

test("rebind is a security reset that preserves issuer and binding but moves canonical ownership", async () => {
  const fixture = createFoundation();
  const targetRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-rebind-target-")));
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const beforeRebind = await stateWithActiveGrant(fixture, initialized.state);
    const targetConfiguration = fixture.auth.resolveOAuthDeploymentConfiguration({
      canonicalRoot: targetRoot,
      profileId: "b".repeat(24),
      hostname: fixture.configuration.hostname,
      platform: "win32",
      tunnel: "cloudflare-named",
      tunnelName: fixture.configuration.tunnelName,
      tunnelOwner: "codexgpt",
      publicHost: "127.0.0.1",
      publicPort: 8787,
      localAdminHost: "127.0.0.1",
      localAdminPort: 8788
    });
    const rebound = await fixture.coordinator.rebindAsSecurityReset(
      fixture.configuration.identityKey,
      targetConfiguration
    );
    assert.equal(rebound.bindingId, initialized.state.bindingId);
    assert.notEqual(rebound.incarnationId, initialized.state.incarnationId);
    assert.equal(rebound.canonicalRoot, targetRoot);
    assert.equal(rebound.profileId, "b".repeat(24));
    assert.deepEqual(rebound.grants, []);
    assert.deepEqual(rebound.clients, []);
    const entry = fixture.registry.resolve(fixture.configuration.identityKey);
    assert.equal(entry.canonicalRoot, targetRoot);
    assert.equal(entry.profileId, "b".repeat(24));
    assert.equal(entry.currentIncarnationId, rebound.incarnationId);
    const backups = fixture.store.listBindingBackups(rebound.bindingId);
    assert.equal(backups.length, 1);
    assert.equal(backups[0].incarnationId, beforeRebind.incarnationId);
    assert.deepEqual(
      fixture.store.readDeploymentBackup(rebound.bindingId, backups[0].incarnationId, backups[0].backupId),
      beforeRebind
    );
    assert.equal(
      fs.existsSync(fixture.auth.deploymentStateFile(fixture.stateRoot, initialized.state.bindingId, initialized.state.incarnationId)),
      true
    );
  } finally {
    fixture.cleanup();
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("initialize rejects an existing hostname bound to another canonical deployment", async () => {
  const fixture = createFoundation();
  const targetRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-conflict-target-")));
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const targetConfiguration = fixture.auth.resolveOAuthDeploymentConfiguration({
      canonicalRoot: targetRoot,
      profileId: "b".repeat(24),
      hostname: fixture.configuration.hostname,
      platform: "win32",
      tunnel: "cloudflare-named",
      tunnelName: fixture.configuration.tunnelName,
      tunnelOwner: "codexgpt",
      publicHost: "127.0.0.1",
      publicPort: 8787,
      localAdminHost: "127.0.0.1",
      localAdminPort: 8788
    });

    await assert.rejects(
      () => fixture.coordinator.initialize(targetConfiguration),
      (error) => error?.code === "OAUTH_STATE_CONFLICT"
    );
    const current = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(current.bindingId, initialized.state.bindingId);
    assert.equal(current.canonicalRoot, fixture.workspaceRoot);
    assert.equal(current.profileId, fixture.configuration.profileId);
  } finally {
    fixture.cleanup();
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("tampered recovery backup is rejected before creating a new incarnation", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const tampered = { ...initialized.state, generation: initialized.state.generation + 1 };
    await assert.rejects(
      () => fixture.coordinator.restoreAsSecurityReset(fixture.configuration.identityKey, tampered),
      (error) => error?.code === "OAUTH_STATE_RECOVERY_REQUIRED"
    );
    const current = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(current.incarnationId, initialized.state.incarnationId);
    assert.deepEqual(fixture.store.listBindingBackups(current.bindingId), []);
  } finally {
    fixture.cleanup();
  }
});

test("crash before registry publish leaves old incarnation authoritative", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    let candidate;
    await assert.rejects(
      () => fixture.coordinator.restoreAsSecurityReset(
        fixture.configuration.identityKey,
        initialized.state,
        {
          afterIncarnationWrite(state) {
            candidate = state;
            throw new Error("crash-before-pointer");
          }
        }
      ),
      /crash-before-pointer/
    );
    const current = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(current.incarnationId, initialized.state.incarnationId);
    assert.notEqual(candidate.incarnationId, current.incarnationId);
    assert.equal(
      fs.existsSync(fixture.auth.deploymentStateFile(fixture.stateRoot, candidate.bindingId, candidate.incarnationId)),
      true
    );
  } finally {
    fixture.cleanup();
  }
});

test("crash after registry publish exposes one complete new incarnation", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    let candidate;
    await assert.rejects(
      () => fixture.coordinator.restoreAsSecurityReset(
        fixture.configuration.identityKey,
        initialized.state,
        {
          afterRegistryPublish(state) {
            candidate = state;
            throw new Error("crash-after-pointer");
          }
        }
      ),
      /crash-after-pointer/
    );
    const current = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(current.incarnationId, candidate.incarnationId);
    assert.deepEqual(current.grants, []);
    assert.equal(current.recoveryRequired, false);
  } finally {
    fixture.cleanup();
  }
});

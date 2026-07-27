import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

const { PersistentAuditStore } = await tsImport("../src/audit/store.ts", import.meta.url);
const { ProcessInstanceRegistry } = await tsImport("../src/transactions/workspaceLock.ts", import.meta.url);
const { PersistentAuthStateAuditAppender } = await tsImport("../src/auth/audit.ts", import.meta.url);

test("every durable auth transition is audited before publication with safe fields only", async () => {
  let fixture;
  const observed = [];
  fixture = createFoundation({
    audit: {
      append(event) {
        observed.push(structuredClone(event));
        if (event.transition === "installation_owner_created") {
          assert.equal(fs.existsSync(fixture.store.paths().ownerFile), false);
        }
        if (event.transition === "deployment_state_written") {
          assert.equal(
            fs.existsSync(fixture.auth.deploymentStateFile(fixture.stateRoot, event.bindingId, event.incarnationId)),
            false
          );
        }
        if (event.transition === "registry_written") {
          assert.equal(fs.existsSync(fixture.store.paths().registryFile), false);
        }
      }
    }
  });
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    assert.deepEqual(observed.map((event) => event.transition), [
      "installation_owner_created",
      "deployment_state_written",
      "registry_written"
    ]);
    const serialized = JSON.stringify(observed);
    assert.equal(serialized.includes(initialized.ownerSubject), false);
    assert.equal(serialized.includes(initialized.state.protectedSigningPrivateJwk), false);
    assert.equal(serialized.includes(initialized.state.protectedRefreshPepper), false);
    for (const event of observed) {
      assert.deepEqual(Object.keys(event).sort(), [
        "bindingId",
        "generation",
        "incarnationId",
        "stateDigest",
        "transition"
      ]);
      assert.match(event.stateDigest, /^sha256:[a-f0-9]{64}$/);
    }
  } finally {
    fixture.cleanup();
  }
});

test("auth transitions use the existing installation-wide MAC-chained audit store", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-persistent-audit-"));
  const auditRegistry = new ProcessInstanceRegistry(stateRoot);
  const persistentAudit = PersistentAuditStore.open({
    stateRoot,
    registry: auditRegistry,
    retention: { maxAgeDays: 30, maxClosedBytes: 16 * 1024 * 1024 }
  });
  const fixture = createFoundation({
    stateRoot,
    audit: new PersistentAuthStateAuditAppender(persistentAudit)
  });
  try {
    await fixture.coordinator.initialize(fixture.configuration);
    const result = await persistentAudit.queryV4({ eventTypes: ["auth_state"], limit: 10 });
    assert.deepEqual(result.records.map((record) => record.event.canonicalAction).reverse(), [
      "auth_state.installation_owner_created",
      "auth_state.deployment_state_written",
      "auth_state.registry_written"
    ]);
    for (const record of result.records) {
      assert.equal(record.event.eventType, "auth_state");
      assert.equal(record.event.sourceSchemaVersion, 5);
      assert.equal(record.event.sourceContractVersion, 5);
      assert.match(record.event.subjectFingerprint, /^[a-f0-9]{64}$/);
      assert.match(record.event.contextFingerprint, /^[a-f0-9]{64}$/);
      assert.deepEqual(record.event.counts, { generation: record.event.counts.generation });
    }
  } finally {
    persistentAudit.dispose();
    auditRegistry.dispose();
    fixture.cleanup();
  }
});

test("audit writer failure prevents the corresponding state publication", async () => {
  const fixture = createFoundation({
    audit: {
      append(event) {
        if (event.transition === "deployment_state_written") throw new Error("audit unavailable");
      }
    }
  });
  try {
    await assert.rejects(
      () => fixture.coordinator.initialize(fixture.configuration),
      (error) => error?.code === "OAUTH_AUDIT_FAILURE"
    );
    assert.equal(fs.existsSync(fixture.store.paths().ownerFile), true);
    assert.equal(fs.existsSync(fixture.store.paths().registryFile), false);
    const deployments = pathEntries(fixture.store.paths().deploymentsDirectory);
    assert.deepEqual(deployments, []);
  } finally {
    fixture.cleanup();
  }
});

function pathEntries(directory) {
  try {
    return fs.readdirSync(directory).filter((name) => name !== "registry.json");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

test("owner audit failure leaves no protected owner record", async () => {
  const fixture = createFoundation({ audit: { append() { throw new Error("audit unavailable"); } } });
  try {
    await assert.rejects(
      () => fixture.store.initializeOwner(),
      (error) => error?.code === "OAUTH_AUDIT_FAILURE"
    );
    assert.equal(fs.existsSync(fixture.store.paths().ownerFile), false);
  } finally {
    fixture.cleanup();
  }
});

test("DCR and authorization transitions audit before client, pending, terminal, and code publication", async () => {
  let clientStore;
  let authorizations;
  const observed = [];
  const fixture = createFoundation({
    audit: {
      append(event) {
        observed.push(structuredClone(event));
        if (event.transition === "client_registered") {
          const state = fixture.store.readDeployment(event.bindingId, event.incarnationId);
          assert.equal((state.clients ?? []).length, 0);
        }
      }
    }
  });
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const identity = fixture.auth.createOAuthDeploymentIdentity({
      issuer: initialized.state.issuer,
      resource: initialized.state.resource,
      hostname: initialized.state.hostname,
      profileId: initialized.state.profileId,
      bindingId: initialized.state.bindingId,
      incarnationId: initialized.state.incarnationId,
      recoveryEpoch: initialized.state.recoveryEpoch
    });
    clientStore = new fixture.auth.OAuthClientStore({
      store: fixture.store,
      locks: fixture.locks,
      bindingId: initialized.state.bindingId,
      incarnationId: initialized.state.incarnationId
    });
    const metadata = fixture.auth.parseDynamicClientRegistration(JSON.stringify({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"]
    }));
    const client = await clientStore.register(metadata);

    const authorizationAudit = {
      append(event) {
        observed.push(structuredClone(event));
        if (event.transition === "authorization_requested") assert.equal(authorizations.pendingCount(), 0);
        if (event.transition === "authorization_approved") {
          assert.equal(authorizations.snapshotSafe()[0].status, "pending");
        }
        if (event.transition === "authorization_code_created") {
          assert.equal(authorizations.codeCount(), 0);
          assert.equal(authorizations.snapshotSafe()[0].status, "approved");
        }
      }
    };
    authorizations = new fixture.auth.AuthorizationStore({
      identity,
      canonicalRoot: initialized.state.canonicalRoot,
      enabledScopes: ["codexgpt:read"],
      clients: clientStore,
      audit: authorizationAudit
    });
    const created = await authorizations.create({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      state: "state_12345678",
      resource: identity.resource,
      scopes: ["codexgpt:read"],
      codeChallenge: "A".repeat(43)
    });
    await authorizations.approve(created.pendingId);
    await authorizations.continue(created.pendingId, created.browserBinding);
    assert.deepEqual(observed.slice(-4).map((event) => event.transition), [
      "authorization_requested",
      "client_approved",
      "authorization_approved",
      "authorization_code_created"
    ]);
    const serialized = JSON.stringify(observed.slice(-5));
    for (const forbidden of [client.client_id, created.browserBinding, "state_12345678", "A".repeat(43)]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  } finally {
    fixture.cleanup();
  }
});

test("audit failure leaves no registered client, pending authorization, terminal grant, or code", async () => {
  const fixture = createFoundation({
    audit: {
      append(event) {
        if (event.transition === "client_registered") throw new Error("audit unavailable");
      }
    }
  });
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const clients = new fixture.auth.OAuthClientStore({
      store: fixture.store,
      locks: fixture.locks,
      bindingId: initialized.state.bindingId,
      incarnationId: initialized.state.incarnationId
    });
    const metadata = fixture.auth.parseDynamicClientRegistration(JSON.stringify({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"]
    }));
    await assert.rejects(() => clients.register(metadata), (error) => error?.code === "OAUTH_AUDIT_FAILURE");
    const durable = fixture.store.readDeployment(initialized.state.bindingId, initialized.state.incarnationId);
    assert.equal((durable.clients ?? []).length, 0);
  } finally {
    fixture.cleanup();
  }

  const second = createFoundation();
  try {
    const initialized = await second.coordinator.initialize(second.configuration);
    const identity = second.auth.createOAuthDeploymentIdentity({
      issuer: initialized.state.issuer,
      resource: initialized.state.resource,
      hostname: initialized.state.hostname,
      profileId: initialized.state.profileId,
      bindingId: initialized.state.bindingId,
      incarnationId: initialized.state.incarnationId,
      recoveryEpoch: initialized.state.recoveryEpoch
    });
    const clients = new second.auth.OAuthClientStore({
      store: second.store,
      locks: second.locks,
      bindingId: initialized.state.bindingId,
      incarnationId: initialized.state.incarnationId
    });
    const metadata = second.auth.parseDynamicClientRegistration(JSON.stringify({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"]
    }));
    const client = await clients.register(metadata);

    const requestedFailure = new second.auth.AuthorizationStore({
      identity,
      canonicalRoot: initialized.state.canonicalRoot,
      enabledScopes: ["codexgpt:read"],
      clients,
      audit: { append(event) { if (event.transition === "authorization_requested") throw new Error("audit unavailable"); } }
    });
    await assert.rejects(() => requestedFailure.create({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      state: "state_12345678",
      resource: identity.resource,
      scopes: ["codexgpt:read"],
      codeChallenge: "A".repeat(43)
    }), (error) => error?.code === "OAUTH_AUDIT_FAILURE");
    assert.equal(requestedFailure.pendingCount(), 0);

    const codeFailure = new second.auth.AuthorizationStore({
      identity,
      canonicalRoot: initialized.state.canonicalRoot,
      enabledScopes: ["codexgpt:read"],
      clients,
      audit: { append(event) { if (event.transition === "authorization_code_created") throw new Error("audit unavailable"); } }
    });
    const created = await codeFailure.create({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0],
      state: "state_87654321",
      resource: identity.resource,
      scopes: ["codexgpt:read"],
      codeChallenge: "B".repeat(43)
    });
    await codeFailure.approve(created.pendingId);
    await assert.rejects(
      () => codeFailure.continue(created.pendingId, created.browserBinding),
      (error) => error?.code === "OAUTH_AUDIT_FAILURE"
    );
    assert.equal(codeFailure.codeCount(), 0);
    assert.equal(codeFailure.snapshotSafe()[0].status, "approved");
  } finally {
    second.cleanup();
  }
});

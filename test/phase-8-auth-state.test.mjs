import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

test("installation owner and deployment state contain only protected secret material", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    assert.equal(initialized.created, true);
    assert.match(initialized.ownerSubject, /^subject_[A-Za-z0-9_-]{43}$/);
    const ownerText = fs.readFileSync(fixture.store.paths().ownerFile, "utf8");
    assert.equal(ownerText.includes(initialized.ownerSubject), false);
    const stateText = fs.readFileSync(
      fixture.auth.deploymentStateFile(fixture.stateRoot, initialized.state.bindingId, initialized.state.incarnationId),
      "utf8"
    );
    assert.equal(stateText.includes('"d"'), false);
    assert.equal(stateText.includes("subject_"), false);
    assert.equal(initialized.state.grants.length, 0);
    assert.equal(initialized.state.previousPublicJwks.length, 0);
    assert.equal(fixture.registry.readCurrentState(fixture.configuration.identityKey).incarnationId, initialized.state.incarnationId);
  } finally {
    fixture.cleanup();
  }
});

test("concurrent initializers publish one valid deployment and fail the contender closed", async () => {
  const fixture = createFoundation();
  try {
    const results = await Promise.allSettled([
      fixture.coordinator.initialize(fixture.configuration),
      fixture.coordinator.initialize(fixture.configuration)
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection.reason?.code, "OAUTH_STATE_BUSY");
    const current = fixture.registry.readCurrentState(fixture.configuration.identityKey);
    assert.equal(current.recoveryRequired, false);
    assert.equal(fixture.store.readRegistry().entries.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("distinct deployments share only the installation owner and never keys or state", async () => {
  const fixture = createFoundation();
  const otherRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(path.dirname(fixture.workspaceRoot), "codexgpt-phase8-other-")));
  try {
    const first = await fixture.coordinator.initialize(fixture.configuration);
    const secondConfiguration = fixture.auth.resolveOAuthDeploymentConfiguration({
      canonicalRoot: otherRoot,
      profileId: "b".repeat(24),
      hostname: "mcp-two.example.com",
      platform: "win32",
      tunnel: "cloudflare-named",
      tunnelName: "codexgpt-oauth-two",
      tunnelOwner: "codexgpt",
      publicHost: "127.0.0.1",
      publicPort: 9797,
      localAdminHost: "127.0.0.1",
      localAdminPort: 9798
    });
    const second = await fixture.coordinator.initialize(secondConfiguration);
    assert.equal(first.ownerSubject, second.ownerSubject);
    assert.notEqual(first.state.bindingId, second.state.bindingId);
    assert.notEqual(first.state.incarnationId, second.state.incarnationId);
    assert.notEqual(first.state.activePublicJwk.kid, second.state.activePublicJwk.kid);
    assert.notEqual(first.state.protectedRefreshPepper, second.state.protectedRefreshPepper);
    assert.equal(fixture.store.readRegistry().entries.length, 2);
  } finally {
    fs.rmSync(otherRoot, { recursive: true, force: true });
    fixture.cleanup();
  }
});

test("tampered state enters recovery-required and is never normalized on read", async () => {
  const fixture = createFoundation();
  try {
    const initialized = await fixture.coordinator.initialize(fixture.configuration);
    const file = fixture.auth.deploymentStateFile(fixture.stateRoot, initialized.state.bindingId, initialized.state.incarnationId);
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.generation += 1;
    fs.writeFileSync(file, `${JSON.stringify(tampered)}\n`, "utf8");
    assert.throws(
      () => fixture.store.readDeployment(initialized.state.bindingId, initialized.state.incarnationId),
      (error) => error?.code === "OAUTH_STATE_RECOVERY_REQUIRED"
    );
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).generation, tampered.generation);
  } finally {
    fixture.cleanup();
  }
});

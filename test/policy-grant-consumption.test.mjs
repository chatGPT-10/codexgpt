import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { SessionGrantStore } = await tsImport("../src/policy/approval.ts", import.meta.url);

const fingerprint = (character) => `sha256:${character.repeat(64)}`;

const context = Object.freeze({
  schemaVersion: 1,
  requestId: "request-v3",
  transportKind: "http",
  transportSessionId: "session-v3",
  identity: {
    schemaVersion: 1,
    kind: "authenticated_subject",
    authenticationMode: "bearer",
    credentialRef: "cred_abcdefghijklmnop",
    subject: "subject-v3",
    scopes: ["shell:execute"],
    assuranceLevel: "authenticated"
  },
  workspaceId: "workspace-v3",
  runtimeProfileId: "runtime-v3",
  permissionProfileId: "profile-v3",
  policyRevision: "policy-v3",
  sessionGrantRevision: "grant-revision-0",
  receivedAt: "2026-07-16T10:00:00.000Z"
});

function sequentialRandom() {
  let value = 0;
  return (size) => Buffer.alloc(size, ++value);
}

function issueInput(overrides = {}) {
  return {
    context,
    operation: "process.execute",
    resourceFingerprint: fingerprint("a"),
    inputDigest: fingerprint("b"),
    riskClass: "R3",
    toolContractVersion: "3",
    issuedAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-07-16T10:02:00.000Z",
    usesRemaining: 1,
    ...overrides
  };
}

function matchInput(overrides = {}) {
  return {
    context,
    operation: "process.execute",
    resourceFingerprint: fingerprint("a"),
    inputDigest: fingerprint("b"),
    riskClass: "R3",
    toolContractVersion: "3",
    now: "2026-07-16T10:01:00.000Z",
    ...overrides
  };
}

test("concurrent exact R3 retries reserve exactly one execution right", async () => {
  const store = new SessionGrantStore({ randomBytes: sequentialRandom() });
  const grant = store.issue(issueInput());
  const reservations = await Promise.all(Array.from({ length: 32 }, async () => store.reserveMatching(matchInput())));
  const winners = reservations.filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].grantId, grant.grantId);
  assert.equal(store.reservationCount(), 1);
  assert.equal(store.findMatching(matchInput()), null, "a reserved grant must not remain visible to evaluator snapshots");
  assert.equal(store.snapshot().length, 0);

  assert.equal(store.commitConsume(winners[0].reservationId), true);
  assert.equal(store.commitConsume(winners[0].reservationId), false);
  assert.equal(store.reservationResult(winners[0].reservationId), "consumed");
  assert.equal(store.size(), 0);
  assert.equal(store.reserveMatching(matchInput()), null);
});

test("required audit failure burns R3 before handler and never refunds it", async () => {
  const store = new SessionGrantStore({ randomBytes: sequentialRandom() });
  store.issue(issueInput());
  const reservation = store.reserveMatching(matchInput());
  assert.ok(reservation);
  let handlerCalls = 0;
  try {
    await Promise.reject(new Error("AUDIT_UNAVAILABLE"));
    handlerCalls += 1;
  } catch {
    assert.equal(store.burnReservation(reservation.reservationId), true);
  }
  assert.equal(handlerCalls, 0);
  assert.equal(store.reservationResult(reservation.reservationId), "burned");
  assert.equal(store.size(), 0);
  assert.equal(store.reserveMatching(matchInput()), null, "burned R3 must never be refunded");
});

test("R2 burn closes only the reservation while preserving reusable grant authority", () => {
  const store = new SessionGrantStore({ randomBytes: sequentialRandom() });
  store.issue(issueInput({
    riskClass: "R2",
    expiresAt: "2026-07-16T10:05:00.000Z",
    usesRemaining: null
  }));
  const match = matchInput({ riskClass: "R2" });
  const first = store.reserveMatching(match);
  assert.ok(first);
  assert.equal(store.burnReservation(first.reservationId), true);
  assert.equal(store.reservationResult(first.reservationId), "burned");
  assert.equal(store.size(), 1);

  const second = store.reserveMatching(match);
  assert.ok(second);
  assert.notEqual(second.reservationId, first.reservationId);
  assert.equal(store.commitConsume(second.reservationId), true);
  assert.equal(store.size(), 1, "unlimited R2 remains reusable after one committed reservation");
  assert.ok(store.findMatching(match));
});

test("changed action, input, session, workspace, policy, contract, or risk cannot reserve", () => {
  const variants = [
    { operation: "process.input" },
    { resourceFingerprint: fingerprint("c") },
    { inputDigest: fingerprint("d") },
    { context: { ...context, transportSessionId: "session-other" } },
    { context: { ...context, workspaceId: "workspace-other" } },
    { context: { ...context, policyRevision: "policy-other" } },
    { toolContractVersion: "2" },
    { riskClass: "R2" }
  ];
  for (const variant of variants) {
    const store = new SessionGrantStore({ randomBytes: sequentialRandom() });
    store.issue(issueInput());
    assert.equal(store.reserveMatching(matchInput(variant)), null);
  }
});

test("revocation or expiry burns an active reservation and removes the grant", () => {
  const revoked = new SessionGrantStore({ randomBytes: sequentialRandom() });
  revoked.issue(issueInput());
  const reservation = revoked.reserveMatching(matchInput());
  assert.ok(reservation);
  revoked.revokeTransportSession(context.transportSessionId);
  assert.equal(revoked.reservationResult(reservation.reservationId), "burned");
  assert.equal(revoked.size(), 0);

  const expired = new SessionGrantStore({ randomBytes: sequentialRandom() });
  expired.issue(issueInput());
  const expiringReservation = expired.reserveMatching(matchInput());
  assert.ok(expiringReservation);
  assert.equal(expired.findMatching(matchInput({ now: "2026-07-16T10:02:00.000Z" })), null);
  assert.equal(expired.reservationResult(expiringReservation.reservationId), "burned");
  assert.equal(expired.size(), 0);
});

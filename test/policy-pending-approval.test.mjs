import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  ApprovalQueueError,
  PendingApprovalStore
} = await tsImport("../src/policy/pendingApprovals.ts", import.meta.url);
const {
  createAuthorizationFactsV3,
  semanticDigest
} = await tsImport("../src/policy/authorizationFacts.ts", import.meta.url);

function fingerprint(character) {
  return `sha256:${character.repeat(64)}`;
}

function facts(overrides = {}) {
  return createAuthorizationFactsV3({
    serverId: "server-a",
    credentialRef: "credential-a",
    credentialRevision: "credential-revision-1",
    transportKind: "http",
    transportSessionId: "session-a",
    identityKind: "authenticated_subject",
    identitySubject: "subject-a",
    workspaceId: "workspace-a",
    leaseId: "lease-a",
    policyRevision: "policy-1",
    evidenceRevision: "evidence-1",
    toolContractVersion: "3",
    toolName: "run_command",
    canonicalAction: "process.run_command",
    operation: "process.execute",
    resourceFingerprint: fingerprint("a"),
    inputDigest: fingerprint("b"),
    semanticFactsDigest: semanticDigest({ argv: ["node", "fixture.mjs"], cwd: ".", backend: "pipe" }),
    riskClass: "R3",
    ...overrides
  });
}

const summary = Object.freeze({
  backend: "windows-native-pipe",
  actionKind: "process.execute",
  argumentCount: 2,
  logicalScope: "workspace-a",
  identityLabel: "subject-a",
  authoritySummary: "ambient host process execution",
  digestPrefix: "0123456789abcdef"
});

function sequentialRandom() {
  let value = 0;
  return (size) => {
    value += 1;
    return Buffer.alloc(size, value);
  };
}

async function request(store, overrides = {}, createdAt = "2026-07-16T10:00:00.000Z") {
  return store.request({ facts: facts(overrides), summary, createdAt });
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof ApprovalQueueError && error.code === code);
}

test("V3 identical requests deduplicate without extending TTL or duplicating lifecycle evidence", async () => {
  const transitions = [];
  const store = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    lifecycleSink: (transition) => transitions.push(transition)
  });
  const results = await Promise.all(Array.from({ length: 16 }, () => request(store)));
  const ids = new Set(results.map((result) => result.approval.approvalId));
  const expiries = new Set(results.map((result) => result.approval.expiresAt));
  assert.equal(ids.size, 1);
  assert.equal(expiries.size, 1);
  assert.equal(results.filter((result) => result.deduplicated === false).length, 1);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].to, "pending");
  assert.equal(store.size(), 1);

  const retry = await request(store, {}, "2026-07-16T10:01:00.000Z");
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.approval.expiresAt, "2026-07-16T10:02:00.000Z");
  assert.equal(transitions.length, 1);
});

test("authorization binding changes cannot match the same approval", () => {
  const base = facts();
  const variants = [
    facts({ canonicalAction: "codexpro.process.run_command" }),
    facts({ semanticFactsDigest: fingerprint("c") }),
    facts({ identitySubject: "subject-b" }),
    facts({ credentialRevision: "credential-revision-2" }),
    facts({ transportSessionId: "session-b" }),
    facts({ workspaceId: "workspace-b" }),
    facts({ leaseId: "lease-b" }),
    facts({ policyRevision: "policy-2" }),
    facts({ evidenceRevision: "evidence-2" }),
    facts({ riskClass: "R2" })
  ];
  for (const variant of variants) assert.notEqual(variant.bindingFingerprint, base.bindingFingerprint);
  assert.equal(new Set(variants.map((variant) => variant.bindingFingerprint)).size, variants.length);
});

test("direct and supertool routes share only the same exact canonical action binding", () => {
  const direct = facts({ toolName: "run_command" });
  const supertool = facts({ toolName: "codexpro", canonicalAction: "process.run_command" });
  const otherAction = facts({ toolName: "codexpro", canonicalAction: "process.terminate" });

  assert.equal(supertool.bindingFingerprint, direct.bindingFingerprint);
  assert.notEqual(otherAction.bindingFingerprint, direct.bindingFingerprint);
});

test("server, session, and rate limits fail closed with APPROVAL_QUEUE_FULL", async () => {
  const sessionStore = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    maxServerPending: 8,
    maxSessionPending: 2,
    maxNewPerSessionPerMinute: 8
  });
  await request(sessionStore, { inputDigest: fingerprint("c") });
  await request(sessionStore, { inputDigest: fingerprint("d") });
  await rejectsCode(request(sessionStore, { inputDigest: fingerprint("e") }), "APPROVAL_QUEUE_FULL");

  const serverStore = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    maxServerPending: 3,
    maxSessionPending: 3,
    maxNewPerSessionPerMinute: 10
  });
  await request(serverStore, { transportSessionId: "session-1", inputDigest: fingerprint("f") });
  await request(serverStore, { transportSessionId: "session-2", inputDigest: fingerprint("1") });
  await request(serverStore, { transportSessionId: "session-3", inputDigest: fingerprint("2") });
  await rejectsCode(request(serverStore, { transportSessionId: "session-4", inputDigest: fingerprint("3") }), "APPROVAL_QUEUE_FULL");

  const rateStore = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    maxServerPending: 20,
    maxSessionPending: 20,
    maxNewPerSessionPerMinute: 2
  });
  await request(rateStore, { inputDigest: fingerprint("4") });
  await request(rateStore, { inputDigest: fingerprint("5") });
  await rejectsCode(request(rateStore, { inputDigest: fingerprint("6") }), "APPROVAL_QUEUE_FULL");
  const duplicate = await request(rateStore, { inputDigest: fingerprint("4") });
  assert.equal(duplicate.deduplicated, true, "duplicates must not consume rate budget");
});

test("default queue limits are exactly server 32, session 8, and 10 new requests per minute", async () => {
  const sessionStore = new PendingApprovalStore({ randomBytes: sequentialRandom() });
  for (let index = 0; index < 8; index += 1) {
    await request(sessionStore, { inputDigest: semanticDigest({ session: index }) });
  }
  await rejectsCode(
    request(sessionStore, { inputDigest: semanticDigest({ session: 8 }) }),
    "APPROVAL_QUEUE_FULL"
  );

  const serverStore = new PendingApprovalStore({ randomBytes: sequentialRandom() });
  for (let index = 0; index < 32; index += 1) {
    await request(serverStore, {
      transportSessionId: `server-limit-session-${Math.floor(index / 8)}`,
      inputDigest: semanticDigest({ server: index })
    });
  }
  await rejectsCode(request(serverStore, {
    transportSessionId: "server-limit-session-overflow",
    inputDigest: semanticDigest({ server: 32 })
  }), "APPROVAL_QUEUE_FULL");

  const rateStore = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    maxServerPending: 20,
    maxSessionPending: 20
  });
  for (let index = 0; index < 10; index += 1) {
    await request(rateStore, { inputDigest: semanticDigest({ rate: index }) });
  }
  await rejectsCode(
    request(rateStore, { inputDigest: semanticDigest({ rate: 10 }) }),
    "APPROVAL_QUEUE_FULL"
  );
});

test("approval lifecycle is closed, idempotent, and exactly bound to one reservation", async () => {
  const transitions = [];
  const store = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    lifecycleSink: (transition) => transitions.push(`${transition.from ?? "none"}->${transition.to}`)
  });
  const created = (await request(store)).approval;
  const prepared = await store.prepare(created.approvalId, "2026-07-16T10:00:10.000Z");
  assert.equal(prepared.state, "prepared");
  assert.equal((await store.prepare(created.approvalId, "2026-07-16T10:00:11.000Z")).transitionSequence, prepared.transitionSequence);

  const granted = await store.approve(created.approvalId, "grant-a", "2026-07-16T10:00:20.000Z");
  assert.equal(granted.state, "granted");
  assert.equal((await store.approve(created.approvalId, "grant-other", "2026-07-16T10:00:21.000Z")).grantId, "grant-a");
  await rejectsCode(store.deny(created.approvalId, "2026-07-16T10:00:22.000Z"), "APPROVAL_STATE_CONFLICT");

  const reserved = await store.markReserved("grant-a", "reservation-a", "2026-07-16T10:00:30.000Z");
  assert.equal(reserved.state, "reserved");
  await rejectsCode(store.markConsumed("grant-a", "reservation-other"), "APPROVAL_STATE_CONFLICT");
  const consumed = await store.markConsumed("grant-a", "reservation-a", "2026-07-16T10:00:40.000Z");
  assert.equal(consumed.state, "consumed");
  assert.equal((await store.markConsumed("grant-a", "reservation-a", "2026-07-16T10:00:41.000Z")).transitionSequence, consumed.transitionSequence);
  assert.deepEqual(transitions, [
    "none->pending",
    "pending->prepared",
    "prepared->granted",
    "granted->reserved",
    "reserved->consumed"
  ]);
});

test("denial, expiry, and revocation are audited terminal transitions", async () => {
  const transitions = [];
  const store = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    lifecycleSink: (transition) => transitions.push({ to: transition.to, code: transition.resultCode })
  });
  const denied = (await request(store, { inputDigest: fingerprint("7") })).approval;
  assert.equal((await store.deny(denied.approvalId, "2026-07-16T10:00:10.000Z")).state, "denied");
  assert.equal((await store.deny(denied.approvalId)).state, "denied");
  await rejectsCode(store.approve(denied.approvalId, "grant-denied"), "APPROVAL_STATE_CONFLICT");

  const expiring = (await request(store, { inputDigest: fingerprint("8") })).approval;
  assert.equal(await store.expire("2026-07-16T10:02:00.000Z"), 1);
  assert.equal(store.get(expiring.approvalId).state, "expired");

  const transport = (await request(store, { inputDigest: fingerprint("9") }, "2026-07-16T10:03:00.000Z")).approval;
  assert.equal(await store.revokeTransportSession(transport.facts.transportSessionId, "2026-07-16T10:03:10.000Z"), 1);
  assert.equal(store.get(transport.approvalId).state, "expired");
  assert.ok(transitions.some((transition) => transition.to === "denied" && transition.code === "DENIED"));
  assert.ok(transitions.some((transition) => transition.to === "expired" && transition.code === "EXPIRED"));
  assert.ok(transitions.some((transition) => transition.to === "expired" && transition.code === "TRANSPORT_REVOKED"));
});

test("unpersistable lifecycle evidence leaves approval state unchanged", async () => {
  let fail = false;
  const store = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    lifecycleSink: () => {
      if (fail) throw new Error("AUDIT_UNAVAILABLE");
    }
  });
  const created = (await request(store)).approval;
  fail = true;
  await assert.rejects(store.prepare(created.approvalId), /AUDIT_UNAVAILABLE/);
  assert.equal(store.get(created.approvalId).state, "pending");

  const rejectingStore = new PendingApprovalStore({
    randomBytes: sequentialRandom(),
    lifecycleSink: () => { throw new Error("AUDIT_UNAVAILABLE"); }
  });
  await assert.rejects(request(rejectingStore), /AUDIT_UNAVAILABLE/);
  assert.equal(rejectingStore.size(), 0);
});

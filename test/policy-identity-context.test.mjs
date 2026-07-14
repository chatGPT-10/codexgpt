import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  credentialRef,
  createHttpPolicySessionSource,
  createStdioPolicySessionSource,
  identityForLoopback,
  identityForSharedSecret,
  identityForStdio,
  identityKeyPath,
  loadOrCreateIdentityKey
} = await tsImport("../src/policy/identity.ts", import.meta.url);
const { createRequestContext } = await tsImport("../src/policy/context.ts", import.meta.url);

const READ_SCOPES = ["workspace:open", "filesystem:read"];

function cleanup(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

test("credential references are stable locally and differ across installations", () => {
  const raw = "synthetic-shared-secret";
  const one = credentialRef(raw, Buffer.alloc(32, 1));
  const two = credentialRef(raw, Buffer.alloc(32, 1));
  const other = credentialRef(raw, Buffer.alloc(32, 2));
  assert.equal(one, two);
  assert.notEqual(one, other);
  assert.equal(one.includes(raw), false);
  assert.match(one, /^cred_[a-z2-7]{26}$/);
});

test("identity key store creates exactly 32 bytes and reuses the existing installation key", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-identity-home-"));
  try {
    const first = loadOrCreateIdentityKey({ home, randomBytes: () => Buffer.alloc(32, 7) });
    const second = loadOrCreateIdentityKey({ home, randomBytes: () => Buffer.alloc(32, 8) });
    assert.deepEqual(first, Buffer.alloc(32, 7));
    assert.deepEqual(second, first);
    assert.equal(fs.readFileSync(identityKeyPath(home)).length, 32);
  } finally {
    cleanup(home);
  }
});

test("identity key store rejects malformed existing key material", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-identity-home-"));
  try {
    fs.mkdirSync(path.dirname(identityKeyPath(home)), { recursive: true });
    fs.writeFileSync(identityKeyPath(home), Buffer.alloc(31));
    assert.throws(() => loadOrCreateIdentityKey({ home }), /invalid length/i);
  } finally {
    cleanup(home);
  }
});

test("query and bearer identities have no subject and no raw credential", () => {
  const key = Buffer.alloc(32, 9);
  for (const mode of ["query_token", "bearer"]) {
    const identity = identityForSharedSecret(mode, "synthetic-shared-secret", key, READ_SCOPES);
    assert.equal(identity.subject, null);
    assert.equal(identity.assuranceLevel, "shared_secret");
    assert.equal(JSON.stringify(identity).includes("synthetic-shared-secret"), false);
  }
});

test("STDIO and explicit loopback identities use distinct assurance and authentication modes", () => {
  const stdio = identityForStdio(READ_SCOPES);
  const loopback = identityForLoopback(READ_SCOPES);
  assert.equal(stdio.kind, "local_process");
  assert.equal(stdio.authenticationMode, "stdio");
  assert.equal(loopback.kind, "loopback_unauthenticated");
  assert.equal(loopback.authenticationMode, "loopback_none");
});

test("request context contains no raw credential and is deeply frozen", () => {
  const key = Buffer.alloc(32, 10);
  const source = createHttpPolicySessionSource({
    authenticationMode: "bearer",
    configuredCredential: "synthetic-shared-secret",
    key,
    transportSessionId: () => "http-session-1",
    scopes: READ_SCOPES
  });
  const context = createRequestContext(source, {
    requestId: "request-1",
    workspaceId: "ws_test",
    runtimeProfileId: "runtime-default",
    permissionProfileId: "compat-v1",
    policyRevision: "policy-1",
    sessionGrantRevision: "grant-revision-0",
    receivedAt: "2026-07-14T10:00:00.000Z"
  });
  assert.equal(JSON.stringify(context).includes("synthetic-shared-secret"), false);
  assert.equal(context.identity.authenticationMode, "bearer");
  assert.equal(context.transportSessionId, "http-session-1");
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.identity));
});

test("STDIO source has one process-lifetime session id and rejects empty ids", () => {
  const source = createStdioPolicySessionSource({ sessionId: "stdio-session-1", scopes: READ_SCOPES });
  assert.equal(source.transportKind, "stdio");
  assert.equal(source.transportSessionId(), "stdio-session-1");
  assert.throws(() => createStdioPolicySessionSource({ sessionId: "", scopes: READ_SCOPES }), /session/i);
});

test("HTTP context refuses a pending or missing transport session id", () => {
  const source = createHttpPolicySessionSource({
    authenticationMode: "loopback_none",
    configuredCredential: undefined,
    key: Buffer.alloc(32, 1),
    transportSessionId: () => "pending",
    scopes: READ_SCOPES
  });
  assert.throws(() => createRequestContext(source, {
    requestId: "request-1",
    workspaceId: null,
    runtimeProfileId: "runtime-default",
    permissionProfileId: "compat-v1",
    policyRevision: "policy-1",
    sessionGrantRevision: "grant-revision-0",
    receivedAt: "2026-07-14T10:00:00.000Z"
  }), /session/i);
});

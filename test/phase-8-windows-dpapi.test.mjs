import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  MemoryCredentialStore,
  WindowsDpapiCredentialStore,
  createProductionCredentialStore
} = await tsImport("../src/auth/index.ts", import.meta.url);

const signingPurpose = "codexgpt-deployment-v1:binding_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:incarnation_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:signing-key";

test("Windows DPAPI CurrentUser round trip uses disposable bytes", { skip: process.platform !== "win32" }, async () => {
  const store = new WindowsDpapiCredentialStore();
  await store.probe();
  const plaintext = Buffer.from("disposable-phase-8-dpapi-secret", "utf8");
  const protectedValue = await store.protect(plaintext, signingPurpose);
  assert.notEqual(protectedValue, plaintext.toString("base64"));
  const restored = await store.unprotect(protectedValue, signingPurpose);
  try {
    assert.deepEqual(Buffer.from(restored), plaintext);
  } finally {
    plaintext.fill(0);
    restored.fill(0);
  }
  await assert.rejects(
    () => store.unprotect(protectedValue, "codexgpt-owner-v1"),
    (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
  );
  const corrupt = `${protectedValue.slice(0, -4)}AAAA`;
  await assert.rejects(
    () => store.unprotect(corrupt, signingPurpose),
    (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
  );
});

test("credential bytes enter only helper stdin, never argv or environment", async () => {
  const captured = {};
  const store = new WindowsDpapiCredentialStore({
    platform: "win32",
    run(command, args, options) {
      captured.command = command;
      captured.args = [...args];
      captured.options = options;
      return {
        pid: 1,
        output: [],
        stdout: JSON.stringify({
          schemaVersion: 1,
          protocolName: "CXDPAPI",
          protocolVersion: 1,
          ok: true,
          provider: "windows-dpapi-current-user",
          payloadBase64: "YWJjZA==",
          code: null
        }),
        stderr: "",
        status: 0,
        signal: null,
        error: undefined
      };
    }
  });
  const secret = Buffer.from("stdin-only-secret", "utf8");
  await store.protect(secret, signingPurpose);
  const serializedArgs = JSON.stringify(captured.args);
  const serializedEnv = JSON.stringify(captured.options.env);
  assert.equal(serializedArgs.includes("stdin-only-secret"), false);
  assert.equal(serializedEnv.includes("stdin-only-secret"), false);
  assert.equal(serializedArgs.includes(secret.toString("base64")), false);
  assert.equal(serializedEnv.includes(secret.toString("base64")), false);
  assert.equal(String(captured.options.input).includes(secret.toString("base64")), true);
  secret.fill(0);
});

test("malformed output, stderr anomaly, helper failure, and oversize payload fail closed", async () => {
  const cases = [
    { stdout: "not-json", stderr: "", status: 0, error: undefined },
    {
      stdout: JSON.stringify({ schemaVersion: 1, protocolName: "CXDPAPI", protocolVersion: 1, ok: true, provider: "wrong", payloadBase64: null, code: null }),
      stderr: "",
      status: 0,
      error: undefined
    },
    {
      stdout: JSON.stringify({ schemaVersion: 1, protocolName: "CXDPAPI", protocolVersion: 1, ok: true, provider: "windows-dpapi-current-user", payloadBase64: null, code: null }),
      stderr: "unexpected",
      status: 0,
      error: undefined
    },
    { stdout: "", stderr: "", status: 1, error: undefined },
    { stdout: "", stderr: "", status: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) }
  ];
  for (const item of cases) {
    const store = new WindowsDpapiCredentialStore({
      platform: "win32",
      run() {
        return { pid: 1, output: [], signal: null, ...item };
      }
    });
    await assert.rejects(
      () => store.probe(),
      (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
    );
  }
  const store = new WindowsDpapiCredentialStore({ platform: "win32", run() { throw new Error("must not run"); } });
  await assert.rejects(
    () => store.protect(Buffer.alloc(65537), signingPurpose),
    (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
  );
});

test("manifest drift fails before helper execution", () => {
  const source = path.resolve("scripts");
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-dpapi-manifest-"));
  try {
    for (const name of [
      "windows-credential-host-manifest.json",
      "windows-credential-host-protocol-v1.json",
      "windows-credential-host.ps1",
      "windows-credential-host.cs"
    ]) {
      fs.copyFileSync(path.join(source, name), path.join(copy, name));
    }
    fs.appendFileSync(path.join(copy, "windows-credential-host.cs"), "\n// drift\n", "utf8");
    assert.throws(
      () => new WindowsDpapiCredentialStore({ platform: "win32", scriptsRoot: copy }),
      (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
    );
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test("production selection has no non-Windows or injected-provider fallback", () => {
  assert.throws(
    () => createProductionCredentialStore({ platform: "linux" }),
    (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_UNAVAILABLE"
  );
  const selected = createProductionCredentialStore({ platform: "win32" });
  assert.equal(selected instanceof WindowsDpapiCredentialStore, true);
  assert.equal(selected instanceof MemoryCredentialStore, false);
  assert.throws(
    () => new WindowsDpapiCredentialStore({ platform: "linux" }),
    (error) => error?.code === "OAUTH_CREDENTIAL_PROVIDER_UNAVAILABLE"
  );
});

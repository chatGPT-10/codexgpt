import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { inspect } from "node:util";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  ConfigFingerprintError,
  assertExpectedConfigIntegrity,
  assertExpectedConfigFingerprint,
  loadResolvedConfig
} = await tsImport("../src/config.ts", import.meta.url);

function fixture() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-config-fingerprint-")));
}

test("complete effective config fingerprints are source-independent and secret-redacted", () => {
  const root = fixture();
  try {
    const fromCli = loadResolvedConfig(["--root", root, "--bash", "off", "--write", "off"], {
      environment: { CODEXGPT_HTTP_TOKEN: "first-secret", CODEXGPT_HOME: path.join(root, "home") },
      cwd: root,
      workspaceProfile: {}
    });
    const fromEnvironment = loadResolvedConfig(["--root", root], {
      environment: {
        CODEXGPT_BASH_MODE: "off",
        CODEXGPT_WRITE_MODE: "off",
        CODEXGPT_HTTP_TOKEN: "second-secret",
        CODEXGPT_HOME: path.join(root, "home")
      },
      cwd: root,
      workspaceProfile: {}
    });

    assert.equal(fromCli.publicFingerprint, fromEnvironment.publicFingerprint);
    assert.equal(Object.isFrozen(fromCli), true);
    assert.equal(Object.isFrozen(fromCli.effective), true);
    assert.equal(Object.isFrozen(fromCli.effective.allowedRoots), true);
    const serialized = JSON.stringify(fromCli);
    assert.doesNotMatch(serialized, /first-secret|second-secret/);
    assert.doesNotMatch(inspect(fromCli), /first-secret|second-secret/);
    assert.equal(fromCli.toJSON().effective.authToken, "set");
    assert.deepEqual(Object.keys(fromCli.toJSON().effective).sort(), Object.keys(fromCli.effective).sort());

    const missing = loadResolvedConfig(["--root", root, "--bash", "off", "--write", "off"], {
      environment: { CODEXGPT_HOME: path.join(root, "home") },
      cwd: root,
      workspaceProfile: {}
    });
    assert.notEqual(fromCli.publicFingerprint, missing.publicFingerprint);

    const integrityKey = "11".repeat(32);
    const firstProof = fromCli.integrityProof(integrityKey);
    const secondProof = fromEnvironment.integrityProof(integrityKey);
    assert.notEqual(firstProof, secondProof);
    assert.doesNotThrow(() => assertExpectedConfigIntegrity(fromCli, firstProof, integrityKey));
    assert.throws(
      () => assertExpectedConfigIntegrity(fromEnvironment, firstProof, integrityKey),
      (error) => error.code === "CONFIG_INTEGRITY_MISMATCH"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("expected fingerprint validation is fail-closed and gives one safe restart action", () => {
  const root = fixture();
  try {
    const snapshot = loadResolvedConfig(["--root", root, "--bash", "off", "--write", "off"], {
      environment: { CODEXGPT_HOME: path.join(root, "home") },
      cwd: root,
      workspaceProfile: {}
    });
    assert.doesNotThrow(() => assertExpectedConfigFingerprint(snapshot, snapshot.publicFingerprint, root));
    assert.throws(
      () => assertExpectedConfigFingerprint(snapshot, "0".repeat(64), root),
      (error) => {
        assert.ok(error instanceof ConfigFingerprintError);
        assert.equal(error.code, "CONFIG_FINGERPRINT_MISMATCH");
        assert.equal(error.remediation, "Stop the foreground server, then rerun the same codexgpt start command.");
        assert.doesNotMatch(JSON.stringify(error), /HTTP_TOKEN|secret/i);
        return true;
      }
    );
    assert.throws(
      () => assertExpectedConfigFingerprint(snapshot, "invalid", root),
      (error) => error.code === "CONFIG_FINGERPRINT_INVALID"
    );

    const hostileRoot = `${root}; Write-Output 'PWNED'`;
    assert.throws(
      () => assertExpectedConfigFingerprint(snapshot, "0".repeat(64), hostileRoot),
      (error) => {
        assert.doesNotMatch(error.remediation, /PWNED|;/);
        return true;
      }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprints cover runtime state, request logging, tool logging, and OAuth deployment", { skip: process.platform !== "win32" }, () => {
  const root = fixture();
  try {
    const baseProfile = {
      version: 1,
      root,
      authMode: "oauth",
      hostname: "mcp.example.test",
      oauthIssuer: "https://mcp.example.test",
      oauthResource: "https://mcp.example.test/mcp",
      tunnel: "cloudflare-named",
      tunnelName: "codexgpt-test",
      tunnelOwner: "codexgpt",
      localAdminPort: "8788"
    };
    const commonEnvironment = {
      CODEXGPT_AUTH_MODE: "oauth",
      CODEXGPT_ALLOW_QUERY_TOKEN: "0",
      CODEXGPT_ALLOW_NO_HTTP_TOKEN: "0",
      CODEXGPT_HOST: "127.0.0.1",
      CODEXGPT_PORT: "8787"
    };
    const baseline = loadResolvedConfig(["--root", root], {
      environment: { ...commonEnvironment, CODEXGPT_HOME: "D:\\state-one" },
      cwd: root,
      workspaceProfile: baseProfile
    });
    const changedRuntime = loadResolvedConfig(["--root", root], {
      environment: {
        ...commonEnvironment,
        CODEXGPT_HOME: "D:\\state-two",
        CODEXGPT_LOG_REQUESTS: "1",
        CODEXGPT_LOG_TOOL_CALLS: "1"
      },
      cwd: root,
      workspaceProfile: { ...baseProfile, localAdminPort: "8789" }
    });

    assert.notEqual(baseline.publicFingerprint, changedRuntime.publicFingerprint);
    assert.equal(baseline.effective.transactionStateRoot, "D:\\state-one\\state\\v1");
    assert.equal(changedRuntime.effective.logRequests, true);
    assert.equal(changedRuntime.effective.logToolCalls, true);
    assert.equal(changedRuntime.effective.oauthDeployment.listeners.localAdminPort, 8789);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the HTTP runtime rejects a launcher fingerprint mismatch before listening", () => {
  const root = fixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-config-fingerprint-home-"));
  try {
    const result = spawnSync(process.execPath, ["dist/http.js", "--root", root, "--no-profile"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEXGPT_HOME: home,
        CODEXGPT_HOST: "127.0.0.1",
        CODEXGPT_ALLOW_NO_HTTP_TOKEN: "1",
        CODEXGPT_BASH_MODE: "off",
        CODEXGPT_WRITE_MODE: "off",
        CODEXGPT_EXPECTED_CONFIG_FINGERPRINT: "0".repeat(64)
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /server resolved a different effective configuration/i);
    assert.doesNotMatch(result.stderr, /CODEXGPT_HTTP_TOKEN|Bearer\s+/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("the HTTP runtime rejects an exact secret mismatch even when the public fingerprint matches", async () => {
  const root = fixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-config-integrity-home-"));
  const common = {
    ...process.env,
    CODEXGPT_HOME: home,
    CODEXGPT_HOST: "127.0.0.1",
    CODEXGPT_BASH_MODE: "off",
    CODEXGPT_WRITE_MODE: "off",
    CODEXGPT_HTTP_TOKEN: "launcher-secret"
  };
  try {
    const snapshot = loadResolvedConfig(["--root", root, "--no-profile"], {
      environment: common,
      cwd: process.cwd()
    });
    const integrityKey = "22".repeat(32);
    const child = spawn(process.execPath, ["dist/http.js", "--root", root, "--no-profile"], {
      cwd: process.cwd(),
      env: {
        ...common,
        CODEXGPT_HTTP_TOKEN: "server-secret",
        CODEXGPT_EXPECTED_CONFIG_FINGERPRINT: snapshot.publicFingerprint,
        CODEXGPT_CONFIG_INTEGRITY_KEY: integrityKey,
        CODEXGPT_EXPECTED_CONFIG_INTEGRITY: snapshot.integrityProof(integrityKey)
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exit = await Promise.race([
      new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal }))),
      new Promise((_, reject) => setTimeout(() => reject(new Error("HTTP mismatch child did not exit")), 10_000))
    ]);
    assert.notEqual(exit.code, 0);
    assert.match(stderr, /different complete effective configuration/i);
    assert.doesNotMatch(stderr, /launcher-secret|server-secret/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

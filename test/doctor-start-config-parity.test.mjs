import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(args, root, home) {
  return spawnSync(process.execPath, ["scripts/codexgpt.mjs", ...args, "--root", root], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CODEXGPT_HOME: home,
      CODEXGPT_AUTH_MODE: undefined,
      CODEXGPT_HTTP_TOKEN: undefined,
      CODEBASE_BRIDGE_HTTP_TOKEN: undefined,
      CODEXGPT_BASH_MODE: undefined,
      CODEXGPT_WRITE_MODE: undefined,
      CODEXGPT_TOOL_MODE: undefined
    },
    encoding: "utf8",
    windowsHide: true
  });
}

function runPublicEntry(args, root, home) {
  return spawnSync(process.execPath, ["scripts/codexgpt-entry.mjs", ...args, "--root", root], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CODEXGPT_HOME: home,
      CODEXGPT_AUTH_MODE: undefined,
      CODEXGPT_HTTP_TOKEN: undefined,
      CODEBASE_BRIDGE_HTTP_TOKEN: undefined,
      CODEXGPT_ALLOW_QUERY_TOKEN: undefined,
      CODEXGPT_BASH_MODE: undefined,
      CODEXGPT_WRITE_MODE: undefined,
      CODEXGPT_TOOL_MODE: undefined
    },
    encoding: "utf8",
    windowsHide: true
  });
}

function fingerprintFromDoctor(output) {
  return output.match(/Config fingerprint[\s\S]{0,120}?([a-f0-9]{64})/i)?.[1];
}

test("doctor and start expose the same complete effective configuration fingerprint", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-start-config-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const start = run([
      "start", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off", "--print-env-only"
    ], root, home);
    assert.equal(start.status, 0, start.stderr);
    const environment = JSON.parse(start.stdout);
    assert.match(environment.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT, /^[a-f0-9]{64}$/);
    assert.match(environment.CODEXGPT_EXPECTED_CONFIG_INTEGRITY, /^[a-f0-9]{64}$/);
    assert.equal(environment.CODEXGPT_CONFIG_INTEGRITY_KEY, "<redacted>");

    const doctor = run([
      "doctor", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(fingerprintFromDoctor(doctor.stdout), environment.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("doctor reports a saved runtime fingerprint mismatch with an exact restart action", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-config-mismatch-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const runtimeDir = path.join(home, "runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
    fs.writeFileSync(path.join(runtimeDir, `${profileId}.json`), `${JSON.stringify({
      version: 1,
      root,
      pid: process.pid,
      configFingerprint: "0".repeat(64)
    })}\n`);

    const doctor = run([
      "doctor", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /Config match\s+current configuration differs from the live runtime record/i);
    assert.match(doctor.stdout, /codexgpt start --tunnel none --no-auth --no-profile --bash off --write off --root /i);
    assert.match(doctor.stdout, /--root '.*workspace'/i);
    assert.doesNotMatch(doctor.stdout, /--root [^'\r\n]*;/i);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("doctor ignores stale runtime fingerprints instead of claiming a match", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-stale-config-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const start = run([
      "start", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off", "--print-env-only"
    ], root, home);
    const fingerprint = JSON.parse(start.stdout).CODEXGPT_EXPECTED_CONFIG_FINGERPRINT;
    const runtimeDir = path.join(home, "runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
    fs.writeFileSync(path.join(runtimeDir, `${profileId}.json`), `${JSON.stringify({
      version: 1,
      root,
      pid: 2_147_483_647,
      configFingerprint: fingerprint
    })}\n`);

    const doctor = run([
      "doctor", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /Config match\s+no live runtime record; comparison skipped/i);
    assert.doesNotMatch(doctor.stdout, /matches the (?:saved|live) runtime/i);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("doctor treats a matching live owned runtime port as active instead of blocked", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-live-config-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  try {
    const start = run([
      "start", "--tunnel", "none", "--no-auth", "--no-profile", "--port", String(port),
      "--bash", "off", "--write", "off", "--print-env-only"
    ], root, home);
    const fingerprint = JSON.parse(start.stdout).CODEXGPT_EXPECTED_CONFIG_FINGERPRINT;
    const runtimeDir = path.join(home, "runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
    fs.writeFileSync(path.join(runtimeDir, `${profileId}.json`), `${JSON.stringify({
      version: 1,
      root,
      pid: process.pid,
      localBase: `http://127.0.0.1:${port}`,
      configFingerprint: fingerprint
    })}\n`);

    const doctor = run([
      "doctor", "--tunnel", "none", "--no-auth", "--no-profile", "--port", String(port),
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /Local port\s+owned runtime active/i);
    assert.doesNotMatch(doctor.stdout, /Local port\s+Local port .*already in use/i);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("start preserves strict resolver errors for invalid profile flags and duplicate roots", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-start-strict-config-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const valuedFlag = run([
      "start", "--tunnel", "none", "--no-auth", "--no-profile=false",
      "--bash", "off", "--write", "off", "--print-env-only"
    ], root, home);
    assert.notEqual(valuedFlag.status, 0);
    assert.match(valuedFlag.stderr, /Use --no-profile without a value/i);

    const duplicateRoot = run([
      "start", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off", "--print-env-only", "--root", root
    ], root, home);
    assert.notEqual(duplicateRoot.status, 0);
    assert.match(duplicateRoot.stderr, /root is set more than once/i);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("the supported public entry applies the same connector-auth environment to doctor and start", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-entry-config-parity-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const start = runPublicEntry([
      "start", "--tunnel", "none", "--no-profile",
      "--bash", "off", "--write", "off", "--print-env-only"
    ], root, home);
    assert.equal(start.status, 0, start.stderr);
    const environment = JSON.parse(start.stdout);

    const doctor = runPublicEntry([
      "doctor", "--tunnel", "none", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(fingerprintFromDoctor(doctor.stdout), environment.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("doctor --json embeds the exact secret-redacted config explanation and structured checks", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-json-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  try {
    const explain = run([
      "config", "explain", "--json", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(explain.status, 0, explain.stderr);
    const expectedConfiguration = JSON.parse(explain.stdout);

    const doctor = run([
      "doctor", "--json", "--tunnel", "none", "--no-auth", "--no-profile",
      "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    const report = JSON.parse(doctor.stdout);

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, "doctor");
    assert.equal(report.ok, true);
    assert.deepEqual(report.configuration, expectedConfiguration);
    assert.deepEqual(report.summary, {
      failures: 0,
      warnings: report.checks.filter((check) => check.status === "warn").length
    });
    assert.ok(report.checks.length > 0);
    assert.ok(report.checks.every((check) => (
      ["ok", "warn", "fail"].includes(check.status) &&
      typeof check.label === "string" &&
      typeof check.detail === "string"
    )));
    assert.ok(report.checks.some((check) => check.label === "Config match"));
    assert.equal(fs.existsSync(home), false, "read-only diagnostics must not create CODEXGPT_HOME");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("doctor --json keeps structured output and a nonzero exit when diagnostics find a blocker", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-doctor-json-blocker-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  try {
    const doctor = run([
      "doctor", "--json", "--tunnel", "none", "--no-auth", "--no-profile",
      "--port", String(port), "--bash", "off", "--write", "off"
    ], root, home);
    assert.equal(doctor.status, 1, doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.ok, false);
    assert.ok(report.summary.failures >= 1);
    assert.equal(report.checks.find((check) => check.label === "Local port")?.status, "fail");
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("the supported public doctor --json is pure JSON and never echoes configured secrets", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-public-doctor-json-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  const secret = "doctor-json-secret-that-must-not-appear";
  try {
    const doctor = runPublicEntry([
      "doctor", "--json", "--tunnel", "none", "--no-profile",
      "--bash", "off", "--write", "off", "--token", secret
    ], root, home);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.doesNotMatch(doctor.stdout, new RegExp(secret));
    const report = JSON.parse(doctor.stdout);

    assert.equal(report.command, "doctor");
    assert.equal(report.configuration.runtime.authToken, "set");
    assert.equal(report.configuration.inputs.find((input) => input.key === "auth.token")?.value, "set");
    assert.ok(report.checks.some((check) => check.label === "Bash executable"));
    assert.ok(report.checks.some((check) => check.label === "Saved profile validation"));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("public doctor --json promotes selected legacy auth-token input to a structured warning", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-public-doctor-compat-"));
  const workspace = path.join(base, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.realpathSync.native(workspace);
  const home = path.join(base, "home");
  const secret = "legacy-doctor-token-secret";
  try {
    const result = spawnSync(process.execPath, [
      "scripts/codexgpt-entry.mjs", "doctor", "--json", "--tunnel", "none", "--no-profile",
      "--bash", "off", "--write", "off", "--root", root
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        CODEXGPT_HOME: home,
        CODEXGPT_HTTP_TOKEN: undefined,
        CODEBASE_BRIDGE_HTTP_TOKEN: secret
      },
      encoding: "utf8",
      windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    const report = JSON.parse(result.stdout);
    assert.equal(report.configuration.diagnostics[0]?.key, "auth.token");
    assert.ok(report.checks.some((check) => (
      check.status === "warn" &&
      check.label === "Config compatibility" &&
      /CODEXGPT_HTTP_TOKEN/.test(check.detail)
    )));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

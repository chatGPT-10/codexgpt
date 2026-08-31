import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import { launchEnvironment, requiresVerifiedCloudflared } from "../scripts/codexgpt-entry.mjs";
import { saveWorkspaceProfileFileSync } from "../scripts/workspace-profile-persistence.mjs";

const { loadResolvedConfig } = await tsImport("../src/config.ts", import.meta.url);
const entry = path.resolve("scripts/codexgpt-entry.mjs");

function cleanEnvironment(home, additions = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith("CODEXGPT_") ||
      key.startsWith("CODEBASE_BRIDGE_") ||
      ["HOST", "PORT", "NGROK_DOMAIN", "TAILSCALE_FUNNEL_HOSTNAME"].includes(key)
    ) {
      delete environment[key];
    }
  }
  return {
    ...environment,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    CODEXGPT_HOME: home,
    CODEXGPT_HTTP_TOKEN: "network-compatibility-test-token",
    ...additions
  };
}

function publicPlan(cwd, home, additions = {}, extraArgs = []) {
  const result = spawnSync(process.execPath, [
    entry,
    "start",
    "--no-profile",
    "--tunnel", "none",
    "--bash", "off",
    "--write", "off",
    "--print-env-only",
    ...extraArgs
  ], {
    cwd,
    env: cleanEnvironment(home, additions),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function directRuntime(cwd, home, additions = {}) {
  return loadResolvedConfig(["--no-profile"], {
    cwd,
    environment: cleanEnvironment(home, {
      CODEXGPT_BASH_MODE: "off",
      CODEXGPT_WRITE_MODE: "off",
      ...additions
    })
  });
}

function publicExplanation(cwd, home, additions = {}, extraArgs = []) {
  const result = spawnSync(process.execPath, [
    entry,
    "config", "explain", "tunnel.hostname",
    "--no-profile",
    "--tunnel", "none",
    "--bash", "off",
    "--write", "off",
    "--json",
    ...extraArgs
  ], {
    cwd,
    env: cleanEnvironment(home, additions),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function publicRootExplanation(cwd, home, additions = {}, extraArgs = []) {
  const result = spawnSync(process.execPath, [
    entry,
    "config", "explain", "workspace.root",
    "--no-profile",
    "--tunnel", "none",
    "--bash", "off",
    "--write", "off",
    "--json",
    ...extraArgs
  ], {
    cwd,
    env: cleanEnvironment(home, additions),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("network compatibility inventory freezes the public-entry and direct-runtime boundary", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-network-compat-"));
  const cwdInput = path.join(base, "cwd");
  const targetInput = path.join(base, "target");
  const home = path.join(base, "home");
  const hostname = "compatibility.example.test";
  fs.mkdirSync(cwdInput, { recursive: true });
  fs.mkdirSync(targetInput, { recursive: true });
  const cwd = fs.realpathSync.native(cwdInput);
  const target = fs.realpathSync.native(targetInput);
  try {
    const canonicalRoot = publicPlan(cwd, home, { CODEXGPT_ROOT: target });
    const compatibilityRoot = publicPlan(cwd, home, { CODEBASE_BRIDGE_REPO_ROOT: target });
    const canonicalNetwork = publicPlan(cwd, home, {
      CODEXGPT_HOST: "127.0.0.2",
      CODEXGPT_PORT: "9123"
    });
    const genericNetwork = publicPlan(cwd, home, { HOST: "127.0.0.2", PORT: "9123" });
    const canonicalHostname = publicPlan(cwd, home, { CODEXGPT_PUBLIC_HOSTNAME: hostname });
    const hostnameAlias = publicPlan(cwd, home, { CODEXGPT_HOSTNAME: hostname });
    const ngrokAlias = publicPlan(cwd, home, { NGROK_DOMAIN: hostname });
    const tailscaleAlias = publicPlan(cwd, home, { TAILSCALE_FUNNEL_HOSTNAME: hostname });
    const directCompatibilityRoot = directRuntime(cwd, home, { CODEBASE_BRIDGE_REPO_ROOT: target });
    const directGenericNetwork = directRuntime(cwd, home, { HOST: "127.0.0.2", PORT: "9123" });

    const observed = {
      compatibilityRootPublic: compatibilityRoot.CODEXGPT_ROOT === canonicalRoot.CODEXGPT_ROOT,
      compatibilityRootDirect: directCompatibilityRoot.effective.defaultRoot === target,
      genericHostPublic: genericNetwork.CODEXGPT_HOST === canonicalNetwork.CODEXGPT_HOST,
      genericPortPublic: genericNetwork.CODEXGPT_PORT === canonicalNetwork.CODEXGPT_PORT,
      genericHostDirect: directGenericNetwork.effective.host === "127.0.0.2",
      genericPortDirect: directGenericNetwork.effective.port === 9123,
      hostnameAliasPublic: hostnameAlias.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT === canonicalHostname.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT,
      ngrokAliasPublic: ngrokAlias.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT === canonicalHostname.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT,
      tailscaleAliasPublic: tailscaleAlias.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT === canonicalHostname.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT
    };
    assert.deepEqual(observed, {
      compatibilityRootPublic: true,
      compatibilityRootDirect: true,
      genericHostPublic: false,
      genericPortPublic: false,
      genericHostDirect: true,
      genericPortDirect: true,
      hostnameAliasPublic: true,
      ngrokAliasPublic: true,
      tailscaleAliasPublic: false
    });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("legacy root parity preserves profile selection and emits one value-free migration diagnostic", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-root-compat-"));
  const cwdInput = path.join(base, "cwd");
  const targetInput = path.join(base, "target");
  const home = path.join(base, "home");
  fs.mkdirSync(cwdInput, { recursive: true });
  fs.mkdirSync(targetInput, { recursive: true });
  const cwd = fs.realpathSync.native(cwdInput);
  const target = fs.realpathSync.native(targetInput);
  try {
    const profileId = createHash("sha256").update(target).digest("hex").slice(0, 24);
    saveWorkspaceProfileFileSync(path.join(home, "profiles", `${profileId}.json`), target, {
      tunnel: "ngrok",
      hostname: "root-profile.example.test",
      port: "9234"
    });
    const compatibilityEnvironment = cleanEnvironment(home, { CODEBASE_BRIDGE_REPO_ROOT: target });
    assert.equal(requiresVerifiedCloudflared(["start"], compatibilityEnvironment), false);
    assert.equal(
      launchEnvironment(["start"], compatibilityEnvironment).CODEXGPT_PUBLIC_HOSTNAME,
      "root-profile.example.test"
    );
    const planned = spawnSync(process.execPath, [
      entry,
      "start",
      "--tunnel", "none",
      "--bash", "off",
      "--write", "off",
      "--print-env-only"
    ], {
      cwd,
      env: compatibilityEnvironment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000
    });
    assert.equal(planned.status, 0, planned.stderr);
    const documentStart = planned.stdout.indexOf("{");
    assert.notEqual(documentStart, -1, planned.stdout);
    const plannedEnvironment = JSON.parse(planned.stdout.slice(documentStart));
    assert.equal(plannedEnvironment.CODEXGPT_ROOT, target);
    assert.equal(plannedEnvironment.CODEXGPT_PORT, "9234");

    const compatibility = publicRootExplanation(cwd, home, { CODEBASE_BRIDGE_REPO_ROOT: target });
    assert.deepEqual(compatibility.inputs[0].source, {
      kind: "compatibility",
      source: "current-process environment CODEBASE_BRIDGE_REPO_ROOT",
      removeAfter: "the configuration resolver migration window"
    });
    assert.deepEqual(compatibility.diagnostics, [{
      code: "CONFIG_COMPATIBILITY_INPUT",
      severity: "warning",
      key: "workspace.root",
      message: "Configuration workspace.root uses compatibility source current-process environment CODEBASE_BRIDGE_REPO_ROOT; migrate to --root or CODEXGPT_ROOT before the configuration resolver migration window.",
      origin: {
        kind: "compatibility",
        source: "current-process environment CODEBASE_BRIDGE_REPO_ROOT",
        removeAfter: "the configuration resolver migration window"
      },
      replacement: "--root or CODEXGPT_ROOT",
      remediation: "$env:CODEXGPT_ROOT = $env:CODEBASE_BRIDGE_REPO_ROOT; Remove-Item Env:CODEBASE_BRIDGE_REPO_ROOT"
    }]);
    assert.doesNotMatch(JSON.stringify(compatibility.diagnostics), new RegExp(target.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")));

    const canonical = publicRootExplanation(cwd, home, {
      CODEXGPT_ROOT: target,
      CODEBASE_BRIDGE_REPO_ROOT: cwd
    });
    assert.deepEqual(canonical.inputs[0].source, {
      kind: "environment",
      variable: "CODEXGPT_ROOT",
      scope: "current-process"
    });
    assert.deepEqual(canonical.diagnostics, []);

    const cli = publicRootExplanation(cwd, home, {
      CODEXGPT_ROOT: cwd,
      CODEBASE_BRIDGE_REPO_ROOT: cwd
    }, ["--root", target]);
    assert.deepEqual(cli.inputs[0].source, { kind: "cli", argument: "--root" });
    assert.deepEqual(cli.diagnostics, []);

    const doctor = spawnSync(process.execPath, [
      entry,
      "doctor", "--json", "--no-profile", "--tunnel", "none", "--bash", "off", "--write", "off"
    ], {
      cwd,
      env: cleanEnvironment(home, { CODEBASE_BRIDGE_REPO_ROOT: target }),
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000
    });
    assert.equal(doctor.status, 0, doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.configuration.diagnostics[0]?.key, "workspace.root");
    assert.ok(report.checks.some((check) => (
      check.status === "warn" &&
      check.label === "Config compatibility" &&
      check.detail.includes("CODEBASE_BRIDGE_REPO_ROOT") &&
      !check.detail.includes(target)
    )));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("CODEXGPT_HOSTNAME preserves compatibility provenance without changing value or fingerprint", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-hostname-compat-"));
  const cwdInput = path.join(base, "cwd");
  const home = path.join(base, "home");
  const hostname = "compatibility.example.test";
  fs.mkdirSync(cwdInput, { recursive: true });
  const cwd = fs.realpathSync.native(cwdInput);
  try {
    const canonical = publicExplanation(cwd, home, { CODEXGPT_PUBLIC_HOSTNAME: hostname });
    const codexgptAlias = publicExplanation(cwd, home, { CODEXGPT_HOSTNAME: hostname });
    const urlAlias = publicExplanation(cwd, home, {}, ["--url", hostname]);
    const tailscaleOnly = publicExplanation(cwd, home, { TAILSCALE_FUNNEL_HOSTNAME: hostname });
    const selected = (document) => document.inputs[0];

    const launchedAlias = launchEnvironment(
      ["start", "--no-profile"],
      cleanEnvironment(home, { CODEXGPT_HOSTNAME: hostname })
    );
    assert.equal(Object.hasOwn(launchedAlias, "CODEXGPT_PUBLIC_HOSTNAME"), false);

    assert.deepEqual(selected(canonical).source, {
      kind: "environment",
      variable: "CODEXGPT_PUBLIC_HOSTNAME",
      scope: "current-process"
    });
    assert.deepEqual(codexgptAlias.runtime, canonical.runtime);
    assert.equal(codexgptAlias.publicFingerprint, canonical.publicFingerprint);
    assert.deepEqual(selected(codexgptAlias).source, {
      kind: "compatibility",
      source: "current-process environment CODEXGPT_HOSTNAME",
      removeAfter: "the configuration resolver migration window"
    });
    assert.deepEqual(codexgptAlias.diagnostics, [{
      code: "CONFIG_COMPATIBILITY_INPUT",
      severity: "warning",
      key: "tunnel.hostname",
      message: "Configuration tunnel.hostname uses compatibility source current-process environment CODEXGPT_HOSTNAME; migrate to CODEXGPT_PUBLIC_HOSTNAME before the configuration resolver migration window.",
      origin: {
        kind: "compatibility",
        source: "current-process environment CODEXGPT_HOSTNAME",
        removeAfter: "the configuration resolver migration window"
      },
      replacement: "CODEXGPT_PUBLIC_HOSTNAME",
      remediation: "$env:CODEXGPT_PUBLIC_HOSTNAME = $env:CODEXGPT_HOSTNAME; Remove-Item Env:CODEXGPT_HOSTNAME"
    }]);
    assert.doesNotMatch(JSON.stringify(codexgptAlias.diagnostics), new RegExp(hostname));
    assert.deepEqual(selected(urlAlias).source, { kind: "cli", argument: "--url" });
    assert.deepEqual(selected(tailscaleOnly), {
      key: "tunnel.hostname",
      value: "",
      secret: false,
      restartRequired: true,
      source: { kind: "default", rule: "no stable public hostname" },
      overridden: [],
      diagnostics: []
    });
    const canonicalWins = publicExplanation(cwd, home, {
      CODEXGPT_PUBLIC_HOSTNAME: hostname,
      CODEXGPT_HOSTNAME: "shadowed.example.test"
    });
    assert.deepEqual(selected(canonicalWins).source, selected(canonical).source);
    assert.deepEqual(canonicalWins.diagnostics, []);

    const cliWins = publicExplanation(cwd, home, { CODEXGPT_HOSTNAME: "shadowed.example.test" }, [
      "--hostname", hostname
    ]);
    assert.deepEqual(selected(cliWins).source, { kind: "cli", argument: "--hostname" });
    assert.deepEqual(cliWins.diagnostics, []);

    const doctor = spawnSync(process.execPath, [
      entry,
      "doctor", "--json", "--no-profile", "--tunnel", "none", "--bash", "off", "--write", "off"
    ], {
      cwd,
      env: cleanEnvironment(home, { CODEXGPT_HOSTNAME: hostname }),
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000
    });
    assert.equal(doctor.status, 0, doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.configuration.diagnostics[0]?.key, "tunnel.hostname");
    assert.ok(report.checks.some((check) => (
      check.status === "warn" &&
      check.label === "Config compatibility" &&
      check.detail.includes("CODEXGPT_HOSTNAME") &&
      !check.detail.includes(hostname)
    )));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("NGROK_DOMAIN preserves mode-ambiguous provenance without changing cross-mode value or fingerprint", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-ngrok-domain-compat-"));
  const cwdInput = path.join(base, "cwd");
  const home = path.join(base, "home");
  const hostname = "mode-ambiguous.example.test";
  fs.mkdirSync(cwdInput, { recursive: true });
  const cwd = fs.realpathSync.native(cwdInput);
  try {
    const selected = (document) => document.inputs[0];
    const explainInMode = (environment, tunnel) => publicExplanation(
      cwd,
      home,
      environment,
      ["--tunnel", tunnel]
    );
    const canonicalNone = explainInMode({ CODEXGPT_PUBLIC_HOSTNAME: hostname }, "none");
    const compatibilityNone = explainInMode({ NGROK_DOMAIN: hostname }, "none");
    const canonicalNgrok = explainInMode({ CODEXGPT_PUBLIC_HOSTNAME: hostname }, "ngrok");
    const compatibilityNgrok = explainInMode({ NGROK_DOMAIN: hostname }, "ngrok");

    const launched = launchEnvironment(
      ["start", "--no-profile"],
      cleanEnvironment(home, { NGROK_DOMAIN: hostname })
    );
    assert.equal(Object.hasOwn(launched, "CODEXGPT_PUBLIC_HOSTNAME"), false);

    for (const [canonical, compatibility] of [
      [canonicalNone, compatibilityNone],
      [canonicalNgrok, compatibilityNgrok]
    ]) {
      assert.deepEqual(compatibility.runtime, canonical.runtime);
      assert.equal(compatibility.publicFingerprint, canonical.publicFingerprint);
      assert.deepEqual(selected(compatibility).source, {
        kind: "compatibility",
        source: "current-process environment NGROK_DOMAIN",
        removeAfter: "not scheduled",
        classification: "mode-ambiguous",
        namedTunnelMode: "ngrok",
        effectiveScope: "all-tunnel-modes"
      });
      assert.deepEqual(compatibility.diagnostics, []);
    }

    const canonicalWins = explainInMode({
      CODEXGPT_PUBLIC_HOSTNAME: hostname,
      NGROK_DOMAIN: "shadowed.example.test"
    }, "none");
    assert.deepEqual(selected(canonicalWins).source, selected(canonicalNone).source);
    assert.deepEqual(canonicalWins.diagnostics, []);

    const cliWins = publicExplanation(cwd, home, { NGROK_DOMAIN: "shadowed.example.test" }, [
      "--tunnel", "none", "--hostname", hostname
    ]);
    assert.deepEqual(selected(cliWins).source, { kind: "cli", argument: "--hostname" });
    assert.deepEqual(cliWins.diagnostics, []);

    const doctor = spawnSync(process.execPath, [
      entry,
      "doctor", "--json", "--no-profile", "--tunnel", "none", "--bash", "off", "--write", "off"
    ], {
      cwd,
      env: cleanEnvironment(home, { NGROK_DOMAIN: hostname }),
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000
    });
    assert.equal(doctor.status, 0, doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    const hostnameInput = report.configuration.inputs.find((input) => input.key === "tunnel.hostname");
    assert.equal(hostnameInput.source.classification, "mode-ambiguous");
    assert.deepEqual(report.configuration.diagnostics, []);
    assert.ok(!report.checks.some((check) => check.label === "Config compatibility"));

    const textExplanation = spawnSync(process.execPath, [
      entry,
      "config", "explain", "tunnel.hostname",
      "--no-profile", "--tunnel", "none", "--bash", "off", "--write", "off"
    ], {
      cwd,
      env: cleanEnvironment(home, { NGROK_DOMAIN: hostname }),
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000
    });
    assert.equal(textExplanation.status, 0, textExplanation.stderr);
    assert.match(
      textExplanation.stdout,
      /selected: mode-ambiguous compatibility source current-process environment NGROK_DOMAIN \(named for ngrok; effective across all tunnel modes\)/u
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

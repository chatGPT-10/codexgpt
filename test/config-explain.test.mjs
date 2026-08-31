import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { explainInput } from "../scripts/config-explain.mjs";
import { saveWorkspaceProfileFileSync } from "../scripts/workspace-profile-persistence.mjs";

const execFileAsync = promisify(execFile);

function fixture(prefix) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function cleanEnvironment(home, additions = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("CODEXGPT_") || key.startsWith("CODEBASE_BRIDGE_")) delete environment[key];
  }
  return { ...environment, NO_COLOR: "1", CODEXGPT_HOME: home, ...additions };
}

function profilePath(home, root) {
  const id = createHash("sha256").update(root).digest("hex").slice(0, 24);
  return path.join(home, "profiles", `${id}.json`);
}

async function explain(argv, environment) {
  return execFileAsync(
    process.execPath,
    ["scripts/codexgpt-entry.mjs", "config", "explain", ...argv],
    { cwd: process.cwd(), env: environment, windowsHide: true, timeout: 15_000 }
  );
}

function input(payload, key) {
  const found = payload.inputs.find((entry) => entry.key === key);
  assert.ok(found, `missing explained input ${key}`);
  return found;
}

test("config explanation treats every non-empty secret literal as set", () => {
  const explained = explainInput({
    key: "auth.token",
    value: "missing",
    secret: true,
    candidates: [{ present: true, source: { kind: "cli", argument: "--token" } }]
  });
  assert.equal(explained.value, "set");
});

test("config explain --json reuses the start plan and reports exact override sources", async () => {
  const root = fixture("codexgpt-config-explain-root-");
  const home = fixture("codexgpt-config-explain-home-");
  const cliSecret = "cli-config-explain-secret";
  const environmentSecret = "environment-config-explain-secret";
  const profileSecret = "profile-config-explain-secret";
  try {
    saveWorkspaceProfileFileSync(profilePath(home, root), root, {
      tunnel: "none",
      port: "9200",
      token: profileSecret
    });
    const { stdout, stderr } = await explain(
      [
        "--root", root,
        "--tunnel", "none",
        "--port", "9100",
        "--bash", "off",
        "--write", "off",
        "--token", cliSecret,
        "--json"
      ],
      cleanEnvironment(home, {
        CODEXGPT_PORT: "9000",
        CODEXGPT_HTTP_TOKEN: environmentSecret
      })
    );

    assert.equal(stderr, "");
    const payload = JSON.parse(stdout);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.command, "config explain");
    assert.equal(payload.runtime.defaultRoot, root);
    assert.equal(payload.runtime.port, 9100);
    assert.equal(payload.runtime.authToken, "set");
    assert.match(payload.publicFingerprint, /^[a-f0-9]{64}$/);

    const port = input(payload, "server.port");
    assert.equal(port.value, 9100);
    assert.deepEqual(port.source, { kind: "cli", argument: "--port" });
    assert.deepEqual(
      port.overridden.map((entry) => entry.source.kind),
      ["environment", "profile"]
    );
    assert.equal(port.overridden[0].source.variable, "CODEXGPT_PORT");
    assert.equal(port.overridden[1].source.jsonPath, "$.port");
    assert.equal(port.overridden[1].source.file, profilePath(home, root));
    assert.match(port.overridden[0].reason, /lower precedence than CLI --port/i);

    const token = input(payload, "auth.token");
    assert.equal(token.secret, true);
    assert.equal(token.value, "set");
    assert.deepEqual(token.source, { kind: "cli", argument: "--token" });
    assert.deepEqual(
      token.overridden.map((entry) => entry.source.kind),
      ["environment", "profile"]
    );
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, new RegExp(cliSecret));
    assert.doesNotMatch(serialized, new RegExp(environmentSecret));
    assert.doesNotMatch(serialized, new RegExp(profileSecret));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("legacy auth-token input stays equivalent and returns one secret-safe migration command", async () => {
  const root = fixture("codexgpt-config-explain-compat-root-");
  const home = fixture("codexgpt-config-explain-compat-home-");
  const canonicalSecret = "canonical-auth-token-secret";
  const compatibilitySecret = "compatibility-auth-token-secret";
  const args = [
    "--root", root,
    "--no-profile",
    "--tunnel", "none",
    "--bash", "off",
    "--write", "off",
    "--json"
  ];
  try {
    const canonical = JSON.parse((await explain(args, cleanEnvironment(home, {
      CODEXGPT_HTTP_TOKEN: canonicalSecret
    }))).stdout);
    const compatibility = JSON.parse((await explain(args, cleanEnvironment(home, {
      CODEBASE_BRIDGE_HTTP_TOKEN: compatibilitySecret
    }))).stdout);

    assert.deepEqual(compatibility.runtime, canonical.runtime);
    assert.equal(compatibility.publicFingerprint, canonical.publicFingerprint);
    assert.deepEqual(canonical.diagnostics, []);
    assert.deepEqual(input(canonical, "auth.token").source, {
      kind: "environment",
      variable: "CODEXGPT_HTTP_TOKEN",
      scope: "current-process"
    });
    assert.deepEqual(input(compatibility, "auth.token").source, {
      kind: "compatibility",
      source: "current-process environment CODEBASE_BRIDGE_HTTP_TOKEN",
      removeAfter: "the configuration resolver migration window"
    });
    assert.deepEqual(compatibility.diagnostics, [{
      code: "CONFIG_COMPATIBILITY_INPUT",
      severity: "warning",
      key: "auth.token",
      message: "Configuration auth.token uses compatibility source current-process environment CODEBASE_BRIDGE_HTTP_TOKEN; migrate to CODEXGPT_HTTP_TOKEN before the configuration resolver migration window.",
      origin: {
        kind: "compatibility",
        source: "current-process environment CODEBASE_BRIDGE_HTTP_TOKEN",
        removeAfter: "the configuration resolver migration window"
      },
      replacement: "CODEXGPT_HTTP_TOKEN",
      remediation: "$env:CODEXGPT_HTTP_TOKEN = $env:CODEBASE_BRIDGE_HTTP_TOKEN; Remove-Item Env:CODEBASE_BRIDGE_HTTP_TOKEN",
      valueState: "set"
    }]);
    const serialized = JSON.stringify(compatibility);
    assert.doesNotMatch(serialized, new RegExp(canonicalSecret));
    assert.doesNotMatch(serialized, new RegExp(compatibilitySecret));

    const textResult = await explain(args.filter((value) => value !== "--json"), cleanEnvironment(home, {
      CODEBASE_BRIDGE_HTTP_TOKEN: compatibilitySecret
    }));
    assert.match(textResult.stdout, /CONFIG_COMPATIBILITY_INPUT/);
    assert.match(textResult.stdout, /\$env:CODEXGPT_HTTP_TOKEN = \$env:CODEBASE_BRIDGE_HTTP_TOKEN/);
    assert.doesNotMatch(textResult.stdout, new RegExp(compatibilitySecret));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("config explain is read-only and --no-profile explains defaults without first-run setup", async () => {
  const root = fixture("codexgpt-config-explain-readonly-root-");
  const container = fixture("codexgpt-config-explain-readonly-container-");
  const home = path.join(container, "absent-home");
  try {
    const { stdout, stderr } = await explain(
      [
        "--root", root,
        "--no-profile",
        "--tunnel", "none",
        "--no-auth",
        "--bash", "off",
        "--write", "off",
        "--codex-dir", ".codex",
        "--json"
      ],
      cleanEnvironment(home)
    );

    assert.equal(stderr, "");
    const payload = JSON.parse(stdout);
    assert.equal(payload.runtime.defaultRoot, root);
    assert.equal(payload.runtime.codexDir, path.join(root, ".codex"));
    assert.equal(payload.runtime.authToken, "missing");
    assert.equal(Object.hasOwn(payload.runtime, "bashSessionId"), true);
    assert.equal(payload.runtime.bashSessionId, null);
    assert.equal(input(payload, "profile.disabled").value, true);
    assert.deepEqual(input(payload, "profile.disabled").source, { kind: "cli", argument: "--no-profile" });
    assert.deepEqual(input(payload, "server.port").source, {
      kind: "default",
      rule: "CodexGPT local port default"
    });
    assert.equal(fs.existsSync(home), false, "explaining configuration must not create state or profiles");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test("config explain text is actionable and never prints secret values", async () => {
  const root = fixture("codexgpt-config-explain-text-root-");
  const container = fixture("codexgpt-config-explain-text-container-");
  const home = path.join(container, "absent-home");
  const secret = "text-config-explain-secret";
  try {
    const { stdout, stderr } = await explain(
      ["--root", root, "--no-profile", "--tunnel", "none", "--bash", "off", "--write", "off"],
      cleanEnvironment(home, { CODEXGPT_HTTP_TOKEN: secret })
    );

    assert.equal(stderr, "");
    assert.match(stdout, /CodexGPT config explain/i);
    assert.match(stdout, /auth\.token\s+=\s+set/i);
    assert.match(stdout, /environment CODEXGPT_HTTP_TOKEN/i);
    assert.match(stdout, /effective:\s+after restart/i);
    assert.match(stdout, /codexgpt start/i);
    assert.match(stdout, /--json.*complete secret-redacted runtime/i);
    assert.doesNotMatch(stdout, new RegExp(secret));
    assert.equal(fs.existsSync(home), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(container, { recursive: true, force: true });
  }
});

test("config explain can select one public key and rejects unknown keys", async () => {
  const root = fixture("codexgpt-config-explain-key-root-");
  const container = fixture("codexgpt-config-explain-key-container-");
  const home = path.join(container, "absent-home");
  try {
    const selected = await execFileAsync(
      process.execPath,
      [
        "scripts/codexgpt-entry.mjs", "config", "explain", "auth.mode",
        "--root", root, "--no-profile", "--tunnel", "none", "--no-auth", "--bash", "off", "--write", "off", "--json"
      ],
      { cwd: process.cwd(), env: cleanEnvironment(home), windowsHide: true, timeout: 15_000 }
    );
    const payload = JSON.parse(selected.stdout);
    assert.deepEqual(payload.inputs.map((entry) => entry.key), ["auth.mode"]);
    assert.equal(payload.runtime.authMode, "legacy");
    assert.match(payload.next.command, /codexgpt start/i);

    await assert.rejects(
      execFileAsync(
        process.execPath,
        ["scripts/codexgpt-entry.mjs", "config", "explain", "unknown.key", "--root", root, "--no-profile"],
        { cwd: process.cwd(), env: cleanEnvironment(home), windowsHide: true, timeout: 15_000 }
      ),
      (error) => {
        assert.match(error.stderr, /Unknown configuration key: unknown\.key/i);
        assert.match(error.stderr, /auth\.mode/i);
        return true;
      }
    );
    assert.equal(fs.existsSync(home), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(container, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const { compileCompatibilityProfile } = await tsImport("../src/policy/compat.ts", import.meta.url);
const {
  readWorkspaceProfile,
  saveWorkspaceProfile,
  sanitizeWorkspaceProfile
} = await tsImport("../src/profileStore.ts", import.meta.url);

const ENV_KEYS = [
  "CODEXGPT_ROOT",
  "CODEXGPT_ALLOWED_ROOTS",
  "CODEXGPT_ALLOW_HOME",
  "CODEXGPT_POLICY_ENGINE",
  "CODEXGPT_PERMISSION_PROFILE",
  "CODEXGPT_BASH_MODE",
  "CODEXGPT_WRITE_MODE",
  "CODEXGPT_TOOL_MODE",
  "CODEXGPT_BLOCKED_GLOBS",
  "CODEXGPT_HOME"
];

function withEnv(values, callback) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    return callback();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function config(overrides = {}) {
  return {
    defaultRoot: process.cwd(),
    allowedRoots: [process.cwd()],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: undefined,
    requireHttpToken: false,
    allowedHosts: ["127.0.0.1"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(process.cwd(), ".codex-test"),
    writeMode: "off",
    toolMode: "minimal",
    policyEngineMode: "legacy",
    permissionProfileId: undefined,
    inheritEnv: false,
    maxReadBytes: 180000,
    maxWriteBytes: 1000000,
    maxOutputBytes: 120000,
    maxSearchResults: 200,
    maxHttpSessions: 64,
    httpSessionTtlMs: 1800000,
    blockedGlobs: [
      ".git",
      ".git/**",
      ".env",
      ".env.*",
      "node_modules",
      "node_modules/**",
      "dist/**",
      "custom-cache/**"
    ],
    contextDir: ".ai-bridge",
    toolCards: false,
    connectionTest: false,
    analysisEnabled: true,
    analysisLimits: {
      maxInventoryFiles: 20000,
      maxAnalyzedFiles: 5000,
      maxScannedBytes: 67108864,
      maxSymbols: 100000,
      maxRelationships: 250000
    },
    ...overrides
  };
}

for (const [writeMode, expectedWrite] of [
  ["off", []],
  ["handoff", [".ai-bridge"]],
  ["workspace", ["."]]
]) {
  test(`writeMode ${writeMode} compiles without broader write access`, () => {
    const profile = compileCompatibilityProfile(config({ writeMode }));
    const writeRules = profile.filesystem.rules.filter((rule) => rule.access === "write");
    assert.deepEqual(writeRules.map((rule) => rule.selector.path), expectedWrite);
  });
}

test("toolMode stays outside permission rules and Bash modes compile conservatively", () => {
  const safe = compileCompatibilityProfile(config({ toolMode: "full", bashMode: "safe" }));
  assert.equal(JSON.stringify(safe).includes("toolMode"), false);
  assert.equal(safe.shell.mode, "verify");
  assert.equal(safe.shell.requireSandbox, true);

  assert.equal(compileCompatibilityProfile(config({ bashMode: "off" })).shell.mode, "disabled");
  assert.equal(compileCompatibilityProfile(config({ bashMode: "full" })).shell.mode, "execute");
});

test("compatibility compiler preserves non-hard blocked globs and excludes hard secret globs", () => {
  const profile = compileCompatibilityProfile(config());
  const patterns = profile.filesystem.rules
    .filter((rule) => rule.selector.kind === "deny_glob")
    .map((rule) => rule.selector.pattern);
  assert.ok(patterns.includes("node_modules/**"));
  assert.ok(patterns.includes("dist/**"));
  assert.ok(patterns.includes("custom-cache/**"));
  assert.equal(patterns.includes(".env"), false);
  assert.equal(patterns.includes(".git/**"), false);
});

test("loadConfig defaults to legacy and accepts exact shadow/enforce values", () => {
  withEnv({ CODEXGPT_ROOT: process.cwd() }, () => {
    assert.equal(loadConfig([]).policyEngineMode, "legacy");
  });
  withEnv({ CODEXGPT_ROOT: process.cwd(), CODEXGPT_POLICY_ENGINE: "shadow" }, () => {
    assert.equal(loadConfig([]).policyEngineMode, "shadow");
  });
  withEnv({ CODEXGPT_ROOT: process.cwd(), CODEXGPT_POLICY_ENGINE: "enforce" }, () => {
    assert.equal(loadConfig([]).policyEngineMode, "enforce");
  });
});

test("invalid policy engine or permission profile id fails closed", () => {
  withEnv({ CODEXGPT_ROOT: process.cwd(), CODEXGPT_POLICY_ENGINE: "permit" }, () => {
    assert.throws(() => loadConfig([]), /CODEXGPT_POLICY_ENGINE/);
  });
  withEnv({ CODEXGPT_ROOT: process.cwd(), CODEXGPT_PERMISSION_PROFILE: "../escape" }, () => {
    assert.throws(() => loadConfig([]), /CODEXGPT_PERMISSION_PROFILE/);
  });
});

test("runtime profile persists policy mode and permission-profile reference without secret expansion", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-policy-profile-home-"));
  try {
    withEnv({ CODEXGPT_HOME: home }, () => {
      saveWorkspaceProfile(process.cwd(), {
        policyEngine: "shadow",
        permissionProfile: "review",
        token: "synthetic-secret"
      });
      const saved = readWorkspaceProfile(process.cwd());
      assert.equal(saved.policyEngine, "shadow");
      assert.equal(saved.permissionProfile, "review");
      const sanitized = sanitizeWorkspaceProfile(saved);
      assert.equal(sanitized.token, "<saved>");
      assert.equal(sanitized.permissionProfile, "review");
      assert.equal(JSON.stringify(sanitized).includes("synthetic-secret"), false);
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

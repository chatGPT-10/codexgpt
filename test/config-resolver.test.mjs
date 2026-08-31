import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import { tsImport } from "tsx/esm/api";

const {
  ConfigResolutionError,
  buildResolvedConfig,
  environmentCandidates,
  resolveConfigBootstrap,
  resolveConfigValue
} = await tsImport("../src/configResolver.ts", import.meta.url);

const parseMode = (raw) => {
  if (typeof raw !== "string" || !["legacy", "oauth"].includes(raw.trim())) {
    throw new Error("expected legacy or oauth");
  }
  return raw.trim();
};

function modeInput(overrides = {}) {
  return {
    key: "auth.mode",
    currentProcess: [],
    persistedUser: [],
    profile: [],
    defaultValue: "legacy",
    defaultRule: "legacy remains the compatibility default",
    parse: parseMode,
    ...overrides
  };
}

test("bootstrap inputs resolve root from CLI, environment, compatibility, then cwd", () => {
  const base = {
    argv: [],
    environment: {},
    cwd: "D:\\工作区\\current",
    platform: "win32"
  };
  const cases = [
    [base, "D:\\工作区\\current", "default"],
    [{ ...base, environment: { CODEBASE_BRIDGE_REPO_ROOT: "D:\\legacy" } }, "D:\\legacy", "compatibility"],
    [{ ...base, environment: { CODEXGPT_ROOT: "D:\\current", CODEBASE_BRIDGE_REPO_ROOT: "D:\\legacy" } }, "D:\\current", "environment"],
    [{ ...base, argv: ["--root", "D:\\cli"], environment: { CODEXGPT_ROOT: "D:\\current" } }, "D:\\cli", "cli"]
  ];

  for (const [input, expectedRoot, expectedKind] of cases) {
    const resolved = resolveConfigBootstrap(input);
    assert.equal(resolved.effective.rootInput, expectedRoot);
    assert.equal(resolved.origins.get("root").kind, expectedKind);
  }
});

test("bootstrap rejects a missing or relative explicit cwd", () => {
  for (const cwd of ["", "relative", "C:relative", "\\workspace", "/tmp/workspace", "\\\\server\\share", "\\\\?\\C:\\workspace"]) {
    assert.throws(
      () => resolveConfigBootstrap({ argv: [], environment: {}, cwd, platform: "win32" }),
      (error) => error.code === "CONFIG_VALUE_INVALID" && error.origins[0]?.kind === "default"
    );
  }
  assert.throws(
    () => resolveConfigBootstrap({ argv: [], environment: {}, cwd: "\\\\server\\share", platform: "win32" }),
    (error) => error.remediation.includes("drive-qualified local path") && error.remediation.includes("UNC")
  );
});

test("bootstrap separates environment semantics from host filesystem path syntax", () => {
  const resolved = resolveConfigBootstrap({
    argv: [],
    environment: { codexgpt_root: "/tmp/workspace" },
    cwd: "/tmp",
    platform: "win32",
    filesystemPlatform: "linux"
  });
  assert.equal(resolved.effective.rootInput, "/tmp/workspace");
  assert.equal(resolved.origins.get("root").variable, "codexgpt_root");
});

test("bootstrap rejects duplicate roots and preserves exact Windows environment spelling", () => {
  assert.throws(
    () => resolveConfigBootstrap({
      argv: ["--root=D:\\one", "--root", "D:\\two"],
      environment: {},
      cwd: "D:\\cwd",
      platform: "win32"
    }),
    (error) => error.code === "CONFIG_SOURCE_CONFLICT" && error.origins.length === 2
  );
  const resolved = resolveConfigBootstrap({
    argv: [],
    environment: { codexgpt_root: "D:\\Unicode 工作区\\ " },
    cwd: "D:\\cwd",
    platform: "win32"
  });
  assert.equal(resolved.effective.rootInput, "D:\\Unicode 工作区\\ ");
  assert.equal(resolved.origins.get("root").variable, "codexgpt_root");
});

test("bootstrap does not validate shadowed lower-priority root inputs", () => {
  const resolved = resolveConfigBootstrap({
    argv: ["--root", "D:\\cli"],
    environment: { CODEXGPT_ROOT: "" },
    cwd: "D:\\cwd",
    platform: "win32"
  });
  assert.equal(resolved.effective.rootInput, "D:\\cli");
  assert.equal(resolved.origins.get("root").kind, "cli");
});

test("--no-profile is a fingerprinted bootstrap decision and rejects an assigned value", () => {
  const base = {
    environment: {},
    cwd: "D:\\cwd",
    platform: "win32"
  };
  const enabled = resolveConfigBootstrap({ ...base, argv: ["--no-profile"] });
  const disabled = resolveConfigBootstrap({ ...base, argv: [] });
  assert.equal(enabled.effective.noProfile, true);
  assert.equal(disabled.effective.noProfile, false);
  assert.notEqual(enabled.publicFingerprint, disabled.publicFingerprint);
  assert.throws(
    () => resolveConfigBootstrap({ ...base, argv: ["--no-profile=false"] }),
    (error) => error.code === "CONFIG_VALUE_INVALID" && error.origins[0]?.argument === "--no-profile"
  );
  assert.throws(
    () => resolveConfigBootstrap({ ...base, argv: ["--no-profile", "false"] }),
    (error) => error.code === "CONFIG_VALUE_INVALID" && error.origins[0]?.argument === "--no-profile"
  );
});

test("configuration precedence is CLI, current process, persisted user, profile, then default", () => {
  const cases = [
    {
      input: modeInput(),
      expected: ["legacy", "default"]
    },
    {
      input: modeInput({ profile: [{ value: "oauth", origin: { kind: "profile", file: "p.json", jsonPath: "$.authMode" } }] }),
      expected: ["oauth", "profile"]
    },
    {
      input: modeInput({
        persistedUser: [{ value: "oauth", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "persisted-user" } }],
        profile: [{ value: "legacy", origin: { kind: "profile", file: "p.json", jsonPath: "$.authMode" } }]
      }),
      expected: ["oauth", "environment"]
    },
    {
      input: modeInput({
        currentProcess: [{ value: "legacy", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "current-process" } }],
        persistedUser: [{ value: "oauth", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "persisted-user" } }]
      }),
      expected: ["legacy", "environment"]
    },
    {
      input: modeInput({
        cli: [{ value: "oauth", origin: { kind: "cli", argument: "--auth-mode" } }],
        currentProcess: [{ value: "legacy", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "current-process" } }]
      }),
      expected: ["oauth", "cli"]
    }
  ];

  for (const { input, expected } of cases) {
    const resolved = resolveConfigValue(input);
    assert.equal(resolved.value, expected[0]);
    assert.equal(resolved.origin.kind, expected[1]);
  }
});

test("compatibility keys apply only when the canonical key is absent", () => {
  const legacy = {
    value: "oauth",
    origin: {
      kind: "compatibility",
      source: "environment CODEBASE_BRIDGE_AUTH_MODE",
      removeAfter: "the configuration migration window"
    }
  };
  const compatibility = resolveConfigValue(modeInput({
    compatibility: [legacy],
    compatibilityReplacement: "CODEXGPT_AUTH_MODE",
    compatibilityRemediation: "$env:CODEXGPT_AUTH_MODE = $env:CODEBASE_BRIDGE_AUTH_MODE; Remove-Item Env:CODEBASE_BRIDGE_AUTH_MODE"
  }));
  assert.equal(compatibility.value, "oauth");
  assert.deepEqual(compatibility.diagnostics, [{
    code: "CONFIG_COMPATIBILITY_INPUT",
    severity: "warning",
    key: "auth.mode",
    message: "Configuration auth.mode uses compatibility source environment CODEBASE_BRIDGE_AUTH_MODE; migrate to CODEXGPT_AUTH_MODE before the configuration migration window.",
    origin: legacy.origin,
    replacement: "CODEXGPT_AUTH_MODE",
    remediation: "$env:CODEXGPT_AUTH_MODE = $env:CODEBASE_BRIDGE_AUTH_MODE; Remove-Item Env:CODEBASE_BRIDGE_AUTH_MODE"
  }]);

  const canonical = resolveConfigValue(modeInput({
    profile: [{ value: "legacy", origin: { kind: "profile", file: "p.json", jsonPath: "$.authMode" } }],
    compatibility: [legacy]
  }));
  assert.equal(canonical.value, "legacy");
  assert.equal(canonical.origin.kind, "profile");
  assert.deepEqual(canonical.diagnostics, []);
});

test("same-layer duplicates fail with a stable code and both sources", () => {
  assert.throws(
    () => resolveConfigValue(modeInput({
      currentProcess: [
        { value: "legacy", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "current-process" } },
        { value: "oauth", origin: { kind: "environment", variable: "codexgpt_auth_mode", scope: "current-process" } }
      ]
    })),
    (error) => {
      assert.ok(error instanceof ConfigResolutionError);
      assert.equal(error.code, "CONFIG_SOURCE_CONFLICT");
      assert.match(error.message, /CODEXGPT_AUTH_MODE/);
      assert.match(error.message, /codexgpt_auth_mode/);
      assert.equal(error.toJSON().code, "CONFIG_SOURCE_CONFLICT");
      return true;
    }
  );
});

test("invalid values identify their exact source without echoing the raw value", () => {
  const secret = "not-a-mode-secret-value";
  assert.throws(
    () => resolveConfigValue(modeInput({
      currentProcess: [{ value: secret, origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "current-process" } }]
    })),
    (error) => {
      assert.equal(error.code, "CONFIG_VALUE_INVALID");
      assert.match(error.message, /CODEXGPT_AUTH_MODE/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.deepEqual(error.toJSON().origins, [{
        kind: "environment",
        variable: "CODEXGPT_AUTH_MODE",
        scope: "current-process"
      }]);
      assert.equal(error.toJSON().message, undefined);
      return true;
    }
  );
});

test("secret parser failures discard untrusted causes and remain redacted under inspection", () => {
  const secret = "TOP-SECRET-519";
  assert.throws(
    () => resolveConfigValue({
      key: "auth.token",
      currentProcess: [{ value: secret, origin: { kind: "environment", variable: "CODEXGPT_HTTP_TOKEN", scope: "current-process" } }],
      defaultValue: undefined,
      defaultRule: "token is absent unless configured",
      parse: (value) => {
        throw new Error(`rejected ${value}`);
      },
      secret: true
    }),
    (error) => {
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(inspect(error), new RegExp(secret));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
      return true;
    }
  );
});

test("secret resolved values redact their direct JSON and inspection projections", () => {
  const secret = "S3CRET-direct-519";
  const resolved = resolveConfigValue({
    key: "auth.token",
    currentProcess: [{ value: secret, origin: { kind: "environment", variable: "CODEXGPT_HTTP_TOKEN", scope: "current-process" } }],
    defaultValue: undefined,
    defaultRule: "token is absent unless configured",
    parse: (value) => value,
    secret: true
  });
  assert.equal(resolved.value, secret);
  assert.doesNotMatch(JSON.stringify(resolved), new RegExp(secret));
  assert.doesNotMatch(inspect(resolved), new RegExp(secret));
  assert.equal(resolved.toJSON().value, "set");
});

test("layer candidates must carry matching structured origins", () => {
  assert.throws(
    () => resolveConfigValue(modeInput({
      cli: [{ value: "oauth", origin: { kind: "profile", file: "p.json", jsonPath: "$.authMode" } }]
    })),
    (error) => error.code === "CONFIG_SOURCE_INVALID" && /CLI/.test(error.message)
  );
});

test("Windows environment lookup is case-insensitive and preserves empty or padded input for validation", () => {
  const found = environmentCandidates(
    { codexgpt_auth_mode: " oauth " },
    "CODEXGPT_AUTH_MODE",
    "current-process",
    "win32"
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].value, " oauth ");
  assert.equal(found[0].origin.variable, "codexgpt_auth_mode");
  assert.equal(resolveConfigValue(modeInput({ currentProcess: found })).value, "oauth");

  const empty = environmentCandidates(
    { CODEXGPT_AUTH_MODE: "" },
    "CODEXGPT_AUTH_MODE",
    "current-process",
    "win32"
  );
  assert.equal(empty.length, 1);
  assert.throws(() => resolveConfigValue(modeInput({ currentProcess: empty })), /CODEXGPT_AUTH_MODE/);
});

test("public fingerprints are stable, key-order independent, and redact secrets", () => {
  const authMode = resolveConfigValue(modeInput({
    currentProcess: [{ value: "oauth", origin: { kind: "environment", variable: "CODEXGPT_AUTH_MODE", scope: "current-process" } }]
  }));
  const firstSecret = resolveConfigValue({
    key: "auth.token",
    currentProcess: [{ value: "first-secret", origin: { kind: "environment", variable: "CODEXGPT_HTTP_TOKEN", scope: "current-process" } }],
    defaultValue: undefined,
    defaultRule: "token is absent unless configured",
    parse: (value) => value,
    secret: true
  });
  const secondSecret = resolveConfigValue({
    key: "auth.token",
    currentProcess: [{ value: "second-secret", origin: { kind: "environment", variable: "CODEXGPT_HTTP_TOKEN", scope: "current-process" } }],
    defaultValue: undefined,
    defaultRule: "token is absent unless configured",
    parse: (value) => value,
    secret: true
  });

  const first = buildResolvedConfig({
    authToken: { key: "auth.token", resolved: firstSecret },
    authMode: { key: "auth.mode", resolved: authMode }
  });
  const reordered = buildResolvedConfig({
    authMode: { key: "auth.mode", resolved: authMode },
    authToken: { key: "auth.token", resolved: secondSecret }
  });

  assert.equal(first.publicFingerprint, reordered.publicFingerprint);
  assert.deepEqual([...first.origins.keys()], ["auth.mode", "auth.token"]);
  assert.equal(first.effective.authToken, "first-secret");
  assert.doesNotMatch(JSON.stringify(first), /first-secret|second-secret/);
  assert.doesNotMatch(inspect(first), /first-secret|second-secret/);
  assert.throws(() => first.origins.set("port", { kind: "default", rule: "test" }), TypeError);

  const legacyMode = resolveConfigValue(modeInput());
  const differentValue = buildResolvedConfig({ authMode: { key: "auth.mode", resolved: legacyMode } });
  const differentProperty = buildResolvedConfig({ mode: { key: "auth.mode", resolved: authMode } });
  const oauthOnly = buildResolvedConfig({ authMode: { key: "auth.mode", resolved: authMode } });
  assert.notEqual(oauthOnly.publicFingerprint, differentValue.publicFingerprint);
  assert.notEqual(oauthOnly.publicFingerprint, differentProperty.publicFingerprint);
});

test("resolved origins are immutable snapshots", () => {
  const source = { kind: "profile", file: "D:\\配置\\project.json", jsonPath: "$.authMode" };
  const resolved = resolveConfigValue(modeInput({ profile: [{ value: "oauth", origin: source }] }));
  source.file = "D:\\tampered.json";
  assert.equal(resolved.origin.file, "D:\\配置\\project.json");
  assert.throws(() => {
    resolved.origin.file = "D:\\other.json";
  }, TypeError);
});

test("fingerprint encoding distinguishes missing values and rejects non-JSON numbers with their source", () => {
  const missing = resolveConfigValue({
    key: "sample",
    defaultValue: undefined,
    defaultRule: "missing",
    parse: (value) => value
  });
  const object = resolveConfigValue({
    key: "sample",
    defaultValue: { state: "missing" },
    defaultRule: "object",
    parse: (value) => value
  });
  assert.notEqual(
    buildResolvedConfig({ sample: { key: "sample", resolved: missing } }).publicFingerprint,
    buildResolvedConfig({ sample: { key: "sample", resolved: object } }).publicFingerprint
  );

  assert.throws(
    () => resolveConfigValue({
      key: "sample",
      currentProcess: [{ value: "NaN", origin: { kind: "environment", variable: "CODEXGPT_SAMPLE", scope: "current-process" } }],
      defaultValue: 0,
      defaultRule: "zero",
      parse: () => Number.NaN
    }),
    (error) => error.code === "CONFIG_FINGERPRINT_VALUE_INVALID" &&
      error.toJSON().origins[0]?.variable === "CODEXGPT_SAMPLE"
  );
});

test("resolved config rejects structurally forged values and diagnostics", () => {
  const owned = resolveConfigValue(modeInput());
  const forged = {
    ...owned,
    diagnostics: [{
      code: "CONFIG_COMPATIBILITY_INPUT",
      severity: "warning",
      key: "auth.mode",
      message: "secret=S3CRET-diag",
      origin: { kind: "compatibility", source: "forged", removeAfter: "never" }
    }]
  };
  for (const key of Reflect.ownKeys(owned)) {
    if (Object.prototype.hasOwnProperty.call(forged, key)) continue;
    Object.defineProperty(forged, key, Object.getOwnPropertyDescriptor(owned, key));
  }
  assert.throws(
    () => buildResolvedConfig({ authMode: { key: "auth.mode", resolved: forged } }),
    (error) => error.code === "CONFIG_SOURCE_INVALID" && !JSON.stringify(error).includes("S3CRET-diag")
  );
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  assertDeploymentBindingCompatible,
  normalizeOAuthHostname,
  resolveEnabledOAuthScopes,
  resolveHttpAuthMode,
  resolveOAuthDeploymentConfiguration,
  resolveOAuthRootSelection
} = await tsImport("../src/auth/configuration.ts", import.meta.url);
const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const {
  profileIdForRoot,
  profilePathForRoot,
  readWorkspaceProfile,
  saveWorkspaceProfile
} = await tsImport("../src/profileStore.ts", import.meta.url);

function withEnvironment(overrides, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function oauthProfile(root, overrides = {}) {
  return {
    version: 2,
    root,
    authMode: "oauth",
    hostname: "mcp.example.com",
    tunnel: "cloudflare-named",
    tunnelName: "codexgpt-oauth",
    tunnelOwner: "codexgpt",
    port: "8787",
    localAdminPort: "8788",
    oauthIssuer: "https://mcp.example.com",
    oauthResource: "https://mcp.example.com/mcp",
    oauthCredentialProvider: "windows-dpapi-current-user",
    oauthStateRef: "state_A234567890abcdef",
    ...overrides
  };
}

test("auth mode resolver is strict and preserves exact precedence and source", () => {
  assert.deepEqual(resolveHttpAuthMode({}), { mode: "legacy", source: "default" });
  assert.deepEqual(resolveHttpAuthMode({ profile: "oauth" }), { mode: "oauth", source: "profile" });
  assert.deepEqual(
    resolveHttpAuthMode({ profile: "legacy", persistedUser: "oauth" }),
    { mode: "oauth", source: "persisted-user" }
  );
  assert.deepEqual(
    resolveHttpAuthMode({ currentProcess: "legacy", persistedUser: "oauth", profile: "oauth" }),
    { mode: "legacy", source: "current-process" }
  );
  assert.throws(
    () => resolveHttpAuthMode({ currentProcess: "auto" }),
    (error) => error?.code === "AUTH_MODE_INVALID"
  );
  assert.throws(
    () => resolveHttpAuthMode({ currentProcess: "   " }),
    (error) => error?.code === "AUTH_MODE_INVALID"
  );
  assert.throws(
    () => resolveHttpAuthMode({ currentProcess: "legacy", profile: "mixed" }),
    (error) => error?.code === "AUTH_MODE_INVALID"
  );
});

test("OAuth root selection requires an explicit root or an exact current-directory profile", () => {
  const root = path.win32.normalize("D:/Dev/repository");
  assert.equal(
    resolveOAuthRootSelection({ explicitRoot: root, currentDirectory: path.win32.dirname(root) }),
    root
  );
  assert.equal(
    resolveOAuthRootSelection({ currentDirectory: root, matchingProfileRoot: root, platform: "win32" }),
    root
  );
  assert.throws(
    () => resolveOAuthRootSelection({ currentDirectory: path.win32.dirname(root), matchingProfileRoot: root, platform: "win32" }),
    (error) => error?.code === "OAUTH_ROOT_REQUIRED"
  );
  assert.throws(
    () => resolveOAuthRootSelection({ explicitRoot: "relative-root", currentDirectory: root, platform: "win32" }),
    (error) => error?.code === "OAUTH_DEPLOYMENT_INVALID"
  );
});

test("OAuth hostname normalization rejects ambiguous or attacker-controlled URL components", () => {
  assert.equal(normalizeOAuthHostname("MCP.Example.com"), "mcp.example.com");
  assert.equal(normalizeOAuthHostname("https://mcp.example.com/mcp"), "mcp.example.com");
  for (const value of [
    "https://user@mcp.example.com",
    "https://mcp.example.com/other",
    "https://mcp.example.com/?query=1",
    "https://mcp.example.com/#fragment",
    "*.example.com",
    "mcp.example.com.",
    "https://mcp.example.com:8443",
    "https://bad_host.example.com",
    "127.0.0.1",
    "https://mcp.example.com\\@evil.example",
    "https://mcp.example.com/%2e%2e"
  ]) {
    assert.throws(
      () => normalizeOAuthHostname(value),
      (error) => error?.code === "OAUTH_HOSTNAME_INVALID",
      value
    );
  }
});

test("deployment configuration derives stable issuer/resource and ordered scopes", () => {
  const root = path.win32.normalize("D:/Dev/repository");
  const base = {
    canonicalRoot: root,
    profileId: "a".repeat(24),
    hostname: "mcp.example.com",
    platform: "win32",
    tunnel: "cloudflare-named",
    tunnelName: "codexgpt-oauth",
    tunnelOwner: "codexgpt",
    publicHost: "127.0.0.1",
    publicPort: 8787,
    localAdminHost: "127.0.0.1",
    localAdminPort: 8788
  };
  const one = resolveOAuthDeploymentConfiguration(base);
  const two = resolveOAuthDeploymentConfiguration({ ...base, publicPort: 9797, localAdminPort: 9798 });
  assert.equal(one.issuer, "https://mcp.example.com");
  assert.equal(one.resource, "https://mcp.example.com/mcp");
  assert.equal(one.identityKey, two.identityKey);
  assert.notDeepEqual(one.listeners, two.listeners);
  assert.deepEqual(resolveEnabledOAuthScopes({}), ["codexgpt:read"]);
  assert.deepEqual(resolveEnabledOAuthScopes({ writeEnabled: true }), ["codexgpt:read", "codexgpt:write"]);
  assert.deepEqual(resolveEnabledOAuthScopes({ writeEnabled: true, executeEnabled: true }), [
    "codexgpt:read",
    "codexgpt:write",
    "codexgpt:execute"
  ]);
  assert.deepEqual(resolveEnabledOAuthScopes({ executeEnabled: true }), ["codexgpt:read", "codexgpt:execute"]);
});

test("deployment root canonicality follows host path syntax without weakening Windows roots", () => {
  const base = {
    profileId: "a".repeat(24),
    hostname: "mcp.example.com",
    platform: "win32",
    tunnel: "cloudflare-named",
    tunnelName: "codexgpt-oauth",
    tunnelOwner: "codexgpt",
    publicHost: "127.0.0.1",
    publicPort: 8787,
    localAdminHost: "127.0.0.1",
    localAdminPort: 8788
  };
  const canonicalRoot = "/tmp/codexgpt-repository";
  if (process.platform === "win32") {
    assert.throws(
      () => resolveOAuthDeploymentConfiguration({ ...base, canonicalRoot }),
      (error) => error?.code === "OAUTH_DEPLOYMENT_INVALID"
    );
    return;
  }
  assert.equal(
    resolveOAuthDeploymentConfiguration({ ...base, canonicalRoot }).canonicalRoot,
    canonicalRoot
  );
  assert.throws(
    () => resolveOAuthDeploymentConfiguration({ ...base, canonicalRoot: "/tmp/../codexgpt-repository" }),
    (error) => error?.code === "OAUTH_DEPLOYMENT_INVALID"
  );
});

test("one issuer/resource/hostname cannot bind to a conflicting canonical root", () => {
  const existing = resolveOAuthDeploymentConfiguration({
    canonicalRoot: path.win32.normalize("D:/Dev/one"),
    profileId: "a".repeat(24),
    hostname: "mcp.example.com",
    platform: "win32",
    tunnel: "cloudflare-named",
    tunnelName: "codexgpt-oauth",
    tunnelOwner: "codexgpt",
    publicHost: "127.0.0.1",
    publicPort: 8787,
    localAdminHost: "127.0.0.1",
    localAdminPort: 8788
  });
  const conflicting = resolveOAuthDeploymentConfiguration({
    ...existing,
    platform: "win32",
    canonicalRoot: path.win32.normalize("D:/Dev/two"),
    profileId: "b".repeat(24),
    publicPort: 9797,
    localAdminPort: 9798
  });
  assert.throws(
    () => assertDeploymentBindingCompatible(existing, conflicting, "win32"),
    (error) => error?.code === "OAUTH_DEPLOYMENT_CONFLICT"
  );
});

test("workspace profile reads and writes only reviewed OAuth selectors", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-profile-"));
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-root-")));
  try {
    withEnvironment({ CODEXGPT_HOME: home }, () => {
      saveWorkspaceProfile(root, oauthProfile(root));
      const saved = readWorkspaceProfile(root);
      assert.equal(saved.authMode, "oauth");
      assert.equal(saved.oauthIssuer, "https://mcp.example.com");
      assert.equal(saved.oauthResource, "https://mcp.example.com/mcp");
      assert.equal(saved.oauthCredentialProvider, "windows-dpapi-current-user");
      assert.equal(saved.oauthStateRef, "state_A234567890abcdef");
      assert.throws(
        () => saveWorkspaceProfile(root, { ...oauthProfile(root), oauthPrivateJwk: "forbidden" }),
        (error) => error?.code === "OAUTH_PROFILE_FIELD_FORBIDDEN"
      );
      assert.throws(
        () => saveWorkspaceProfile(root, { ...oauthProfile(root), oauthResource: "https://other.example.com/mcp" }),
        (error) => error?.code === "OAUTH_DEPLOYMENT_INVALID"
      );

      fs.writeFileSync(
        profilePathForRoot(root),
        `${JSON.stringify({ ...oauthProfile(root), oauthPrivateJwk: "forbidden" })}\n`,
        "utf8"
      );
      assert.throws(
        () => readWorkspaceProfile(root),
        (error) => error?.code === "OAUTH_PROFILE_FIELD_FORBIDDEN"
      );
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace profile keeps separate reviewed Legacy and OAuth routes", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-profile-routes-"));
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-root-routes-")));
  try {
    withEnvironment({ CODEXGPT_HOME: home }, () => {
      saveWorkspaceProfile(root, oauthProfile(root, {
        authMode: "legacy",
        hostname: "legacy.example.com",
        tunnelName: "codexgpt-legacy",
        tunnelOwner: undefined,
        port: "8789",
        localAdminPort: undefined,
        authRoutes: {
          legacy: {
            tunnel: "cloudflare-named",
            hostname: "legacy.example.com",
            tunnelName: "codexgpt-legacy",
            port: "8789"
          },
          oauth: {
            tunnel: "cloudflare-named",
            hostname: "mcp.example.com",
            tunnelName: "codexgpt-oauth",
            tunnelOwner: "codexgpt",
            port: "8787",
            localAdminPort: "8788",
            cloudflareConfig: path.join(home, "oauth-tunnel.yml")
          }
        }
      }));
      const saved = readWorkspaceProfile(root);
      assert.equal(saved.authMode, "legacy");
      assert.equal(saved.hostname, "legacy.example.com");
      assert.equal(saved.authRoutes.oauth.hostname, "mcp.example.com");
      assert.equal(saved.oauthIssuer, "https://mcp.example.com");
      assert.equal(saved.oauthResource, "https://mcp.example.com/mcp");

      assert.throws(
        () => saveWorkspaceProfile(root, {
          ...saved,
          authRoutes: {
            ...saved.authRoutes,
            oauth: { ...saved.authRoutes.oauth, token: "forbidden" }
          }
        }),
        (error) => error?.code === "OAUTH_PROFILE_FIELD_FORBIDDEN"
      );
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadConfig keeps legacy default, rejects mixed credentials, and activates listener-only OAuth", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-config-")));
  try {
    withEnvironment(
      {
        CODEXGPT_AUTH_MODE: undefined,
        CODEXGPT_ALLOW_QUERY_TOKEN: undefined,
        CODEXGPT_ALLOW_NO_HTTP_TOKEN: undefined,
        CODEXGPT_HTTP_TOKEN: undefined,
        CODEBASE_BRIDGE_HTTP_TOKEN: undefined,
        CODEXGPT_TUNNEL_MODE: undefined
      },
      () => {
        const legacy = loadConfig(["--root", root, "--bash", "off", "--write", "off"], {
          workspaceProfile: { root },
          persistedUserAuthMode: undefined
        });
        assert.equal(legacy.authMode, "legacy");
        assert.equal(legacy.authModeSource, "default");

        const persisted = loadConfig(["--root", root, "--bash", "off", "--write", "off"], {
          workspaceProfile: { root, authMode: "legacy" },
          persistedUserAuthMode: "legacy"
        });
        assert.equal(persisted.authModeSource, "persisted-user");
      }
    );

    withEnvironment(
      {
        CODEXGPT_AUTH_MODE: "oauth",
        CODEXGPT_ALLOW_QUERY_TOKEN: "1",
        CODEXGPT_ALLOW_NO_HTTP_TOKEN: undefined,
        CODEXGPT_HTTP_TOKEN: undefined,
        CODEBASE_BRIDGE_HTTP_TOKEN: undefined
      },
      () => {
        assert.throws(
          () => loadConfig(["--root", root], { workspaceProfile: oauthProfile(root), platform: "win32" }),
          (error) => error?.code === "AUTH_MODE_CONFLICT"
        );
      }
    );

    withEnvironment(
      {
        CODEXGPT_AUTH_MODE: "oauth",
        CODEXGPT_ALLOW_QUERY_TOKEN: undefined,
        CODEXGPT_ALLOW_NO_HTTP_TOKEN: undefined,
        CODEXGPT_HTTP_TOKEN: undefined,
        CODEBASE_BRIDGE_HTTP_TOKEN: undefined,
        CODEXGPT_TUNNEL_MODE: undefined
      },
      () => {
        const oauth = loadConfig(["--root", root], {
          workspaceProfile: oauthProfile(root),
          platform: "win32"
        });
        assert.equal(oauth.authMode, "oauth");
        assert.equal(oauth.authModeSource, "current-process");
        assert.equal(oauth.authToken, undefined);
        assert.equal(oauth.allowQueryToken, false);
        assert.throws(
          () => loadConfig(["--root", root], {
            workspaceProfile: oauthProfile(root, { localAdminPort: "not-a-port" }),
            platform: "win32"
          }),
          /OAuth local-admin port/
        );
      }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

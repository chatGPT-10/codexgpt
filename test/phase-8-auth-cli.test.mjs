import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  authUsage,
  cloudflaredSuccessOutput,
  createFixedAddressLookup,
  isStaleOAuthRebindAlias,
  parseAuthInvocation,
  preflightExistingTunnelConfig,
  resolvePublicProbeAddress,
  selectOwnedTunnel,
  tunnelDnsRouteArgs,
  setupJournalPath,
  updateSetupJournal,
  validateTunnelOwnerMarker,
  writeTunnelOwnerMarker
} from "../scripts/oauth-admin.mjs";
import {
  oauthRuntimeStatusPath,
  writeOAuthRuntimeStatus
} from "../dist/auth/runtimeStatus.js";
import {
  createDedicatedTunnelConfig,
  validateDedicatedTunnelConfig
} from "../dist/auth/cloudflareConfig.js";
import { profileIdForRoot as workspaceProfileIdForRoot, readWorkspaceProfile, saveWorkspaceProfile } from "../dist/profileStore.js";
import { resolveTransactionStateRoot } from "../dist/transactions/stateRoot.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-cli-"));
  return fs.realpathSync.native(root);
}

function profile(root, overrides = {}) {
  return {
    authMode: "oauth",
    tunnel: "cloudflare-named",
    hostname: "mcp.example.com",
    tunnelName: "codexgpt-test",
    tunnelOwner: "codexgpt",
    port: "17877",
    localAdminPort: "17878",
    oauthIssuer: "https://mcp.example.com",
    oauthResource: "https://mcp.example.com/mcp",
    oauthCredentialProvider: "windows-dpapi-current-user",
    oauthStateRef: "state_0123456789abcdef0123456789abcdef",
    ...overrides
  };
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [path.join(projectRoot, "scripts", "codexgpt-entry.mjs"), ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000
  });
}

test("auth command parser keeps nested operations and exact targets", () => {
  assert.deepEqual(parseAuthInvocation(["client", "remove", `client_${"A".repeat(43)}`, "--root", "D:\\Dev\\x"]), {
    command: "client",
    operation: "client.remove",
    target: `client_${"A".repeat(43)}`,
    argv: ["client", "remove", `client_${"A".repeat(43)}`, "--root", "D:\\Dev\\x"]
  });
  assert.equal(parseAuthInvocation(["recover", "unlock", `authrun_${"b".repeat(32)}`]).operation, "recover.unlock");
  assert.match(authUsage(), /auth setup/);
  assert.match(authUsage(), /--no-tunnel-changes/);
  assert.match(authUsage(), /--confirm-forced-relink/);
});

test("rebind recognizes only an exact stale OAuth selector alias", () => {
  const source = profile("D:\\old", { cloudflareConfig: "C:\\oauth\\tunnel.yml" });
  const target = profile("D:\\new", { cloudflareConfig: "C:\\oauth\\tunnel.yml" });
  assert.equal(isStaleOAuthRebindAlias(target, source), true);
  assert.equal(
    isStaleOAuthRebindAlias({ ...target, oauthStateRef: "state_different_binding_reference" }, source),
    false
  );
  assert.equal(
    isStaleOAuthRebindAlias({ ...target, hostname: "other.example.com" }, source),
    false
  );
  assert.equal(
    isStaleOAuthRebindAlias({ ...target, authMode: "legacy" }, source),
    false
  );
});

test("global launcher passes the explicit canonical root to the OAuth HTTP child", () => {
  const source = fs.readFileSync(path.join(projectRoot, "scripts", "codexgpt.mjs"), "utf8");
  assert.match(
    source,
    /spawnLogged\('codexgpt', process\.execPath, \[httpPath, '--root', root,\s*\.\.\.\(args\.noProfile/,
    "The packaged launcher must pass --root and the resolved no-profile bootstrap to dist/http.js because OAuth rejects environment-only root selection."
  );
});

test("settings capability changes preserve the complete OAuth profile selectors", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-settings-home-"));
  const previousHome = process.env.CODEXGPT_HOME;
  process.env.CODEXGPT_HOME = home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.CODEXGPT_HOME;
    else process.env.CODEXGPT_HOME = previousHome;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  saveWorkspaceProfile(root, profile(root, {
    write: "workspace",
    bash: "full",
    toolMode: "full",
    policyEngine: "enforce"
  }));
  const result = run([
    "settings",
    "set",
    "--root",
    root,
    "--write",
    "off",
    "--bash",
    "off"
  ], { CODEXGPT_HOME: home });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const saved = readWorkspaceProfile(root);
  assert.equal(saved.authMode, "oauth");
  assert.equal(saved.localAdminPort, "17878");
  assert.equal(saved.tunnelOwner, "codexgpt");
  assert.equal(saved.oauthIssuer, "https://mcp.example.com");
  assert.equal(saved.oauthResource, "https://mcp.example.com/mcp");
  assert.equal(saved.oauthCredentialProvider, "windows-dpapi-current-user");
  assert.equal(saved.oauthStateRef, "state_0123456789abcdef0123456789abcdef");
  assert.equal(saved.write, "off");
  assert.equal(saved.bash, "off");
  assert.equal(saved.policyEngine, "enforce");
});

test("settings migrates a pre-route rollback profile without copying credentials into auth routes", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-settings-migration-home-"));
  const previousHome = process.env.CODEXGPT_HOME;
  process.env.CODEXGPT_HOME = home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.CODEXGPT_HOME;
    else process.env.CODEXGPT_HOME = previousHome;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  saveWorkspaceProfile(root, profile(root, {
    authMode: "legacy",
    token: "legacy-token-must-remain-private",
    cloudflareConfig: path.join(home, "oauth-tunnel.yml")
  }));
  const result = run([
    "settings", "set", "--root", root,
    "--tunnel", "cloudflare-named",
    "--hostname", "legacy.example.com",
    "--tunnel-name", "codexgpt-legacy",
    "--port", "17879"
  ], { CODEXGPT_HOME: home });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /legacy-token-must-remain-private/);

  const saved = readWorkspaceProfile(root);
  assert.equal(saved.authMode, "legacy");
  assert.equal(saved.hostname, "legacy.example.com");
  assert.equal(saved.tunnelName, "codexgpt-legacy");
  assert.equal(saved.authRoutes.legacy.hostname, "legacy.example.com");
  assert.equal(saved.authRoutes.oauth.hostname, "mcp.example.com");
  assert.equal(saved.authRoutes.oauth.localAdminPort, "17878");
  assert.equal(saved.authRoutes.oauth.tunnelOwner, "codexgpt");
  assert.equal(saved.oauthIssuer, "https://mcp.example.com");
  assert.equal(saved.oauthResource, "https://mcp.example.com/mcp");
  assert.equal(saved.token, "legacy-token-must-remain-private");
  assert.equal(Object.hasOwn(saved.authRoutes.legacy, "token"), false);
  assert.equal(Object.hasOwn(saved.authRoutes.oauth, "token"), false);
});

test("setup journal preserves a bounded monotonic phase history", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    updateSetupJournal(root, { phase: "preflight" });
    updateSetupJournal(root, { phase: "candidate-local-state" });
    updateSetupJournal(root, { phase: "candidate-local-state", bindingId: `binding_${"a".repeat(32)}` });
    updateSetupJournal(root, { phase: "mode-committed" });
    const journal = JSON.parse(fs.readFileSync(setupJournalPath(root), "utf8"));
    assert.deepEqual(journal.history.map((entry) => entry.phase), [
      "preflight",
      "candidate-local-state",
      "mode-committed"
    ]);
    assert.equal(journal.bindingId, `binding_${"a".repeat(32)}`);
    assert.equal(journal.profileId, workspaceProfileIdForRoot(root));
    assert.equal(journal.canonicalRoot, root);
    assert.equal(Date.parse(journal.updatedAt) >= Date.parse(journal.createdAt), true);
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
});

test("tunnel owner marker is exact and never rewrites ingress", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-marker-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const configPath = path.join(home, "config.yml");
  const configText = "tunnel: exact\ningress:\n  - service: http_status:404\n";
  fs.writeFileSync(configPath, configText);
  const expected = {
    profileId: "a".repeat(24),
    bindingId: `binding_${"b".repeat(32)}`,
    tunnelId: "11111111-2222-4333-8444-555555555555",
    tunnelName: "codexgpt-test",
    hostname: "mcp.example.com"
  };
  writeTunnelOwnerMarker(configPath, expected);
  assert.equal(validateTunnelOwnerMarker(configPath, expected).owner, "codexgpt");
  assert.throws(
    () => validateTunnelOwnerMarker(configPath, { ...expected, profileId: "c".repeat(24) }),
    /AUTH_TUNNEL_OWNERSHIP_UNPROVEN/
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), configText);
});

test("setup rejects shared or unowned tunnel config before local mutation and prints a dedicated-tunnel command", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-tunnel-preflight-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const configPath = path.join(home, "shared.yml");
  const tunnelId = "11111111-2222-4333-8444-555555555555";
  const credentialsFile = path.join(home, `${tunnelId}.json`);
  const input = {
    root,
    profileId: workspaceProfileIdForRoot(root),
    configPath,
    hostname: "mcp.example.com",
    tunnelName: "shared-tunnel",
    publicPort: 17877,
    localAdminPort: 17878,
    validateDedicatedTunnelConfig
  };

  const sharedText = `tunnel: ${tunnelId}\ncredentials-file: ${credentialsFile.replaceAll("\\", "\\\\")}\ningress:\n  - hostname: unrelated.example.com\n    service: http://127.0.0.1:19000\n  - hostname: mcp.example.com\n    service: http://127.0.0.1:17877\n  - service: http_status:404\n`;
  fs.writeFileSync(configPath, sharedText);
  assert.throws(
    () => preflightExistingTunnelConfig(input),
    (error) => {
      assert.equal(error.code, "AUTH_TUNNEL_SHARED_CONFIG");
      assert.match(error.repairCommand, /auth setup/);
      assert.match(error.repairCommand, /--tunnel-name shared-tunnel-dedicated/);
      assert.match(error.repairCommand, /--cloudflare-config/);
      assert.equal(error.repairCommand.includes(configPath), false);
      return true;
    }
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), sharedText);
  assert.equal(fs.existsSync(`${configPath}.owner.json`), false);

  const dedicatedText = createDedicatedTunnelConfig({
    tunnelId,
    credentialsFile,
    hostname: "mcp.example.com",
    publicPort: 17877
  });
  fs.writeFileSync(configPath, dedicatedText);
  assert.throws(
    () => preflightExistingTunnelConfig(input),
    (error) => {
      assert.equal(error.code, "AUTH_TUNNEL_OWNERSHIP_UNPROVEN");
      assert.match(error.repairCommand, /auth setup/);
      assert.match(error.repairCommand, /--tunnel-name shared-tunnel-dedicated/);
      assert.equal(error.repairCommand.includes(configPath), false);
      return true;
    }
  );
  assert.equal(fs.readFileSync(configPath, "utf8"), dedicatedText);
  assert.equal(fs.existsSync(`${configPath}.owner.json`), false);

  const setupSource = fs.readFileSync(path.join(projectRoot, "scripts", "oauth-admin.mjs"), "utf8");
  const preflightCall = setupSource.indexOf("const existingTunnel = preflightExistingTunnelConfig({");
  const journalMutation = setupSource.indexOf("updateSetupJournal(root, { phase: \"preflight\"");
  const stateMutation = setupSource.indexOf("coordinator.initialize(configuration)");
  const profileMutation = setupSource.indexOf("modules.profile.saveWorkspaceProfile(root, candidateProfile)");
  assert.equal(preflightCall >= 0, true);
  assert.equal(preflightCall < journalMutation, true);
  assert.equal(preflightCall < stateMutation, true);
  assert.equal(preflightCall < profileMutation, true);
});

test("setup reuses only an exact statically owned tunnel config", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-tunnel-owned-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const configPath = path.join(home, "owned.yml");
  const tunnelId = "11111111-2222-4333-8444-555555555555";
  const credentialsFile = path.join(home, `${tunnelId}.json`);
  const profileId = workspaceProfileIdForRoot(root);
  fs.writeFileSync(configPath, createDedicatedTunnelConfig({
    tunnelId,
    credentialsFile,
    hostname: "mcp.example.com",
    publicPort: 17877
  }));
  writeTunnelOwnerMarker(configPath, {
    profileId,
    bindingId: `binding_${"b".repeat(32)}`,
    tunnelId,
    tunnelName: "codexgpt-test",
    hostname: "mcp.example.com"
  });

  const result = preflightExistingTunnelConfig({
    root,
    profileId,
    configPath,
    hostname: "mcp.example.com",
    tunnelName: "codexgpt-test",
    publicPort: 17877,
    localAdminPort: 17878,
    validateDedicatedTunnelConfig
  });
  assert.equal(result.validation.tunnelId, tunnelId);
  assert.equal(result.marker.bindingId, `binding_${"b".repeat(32)}`);
});

test("cloudflared machine-readable success output ignores stderr warnings", () => {
  const stdout = '[{"id":"11111111-2222-4333-8444-555555555555","name":"codexgpt-test"}]\n';
  const stderr = '{"level":"warn","message":"A newer cloudflared version is available"}\n';
  assert.equal(cloudflaredSuccessOutput({ stdout, stderr }), stdout);
  assert.deepEqual(JSON.parse(cloudflaredSuccessOutput({ stdout, stderr })), [
    { id: "11111111-2222-4333-8444-555555555555", name: "codexgpt-test" }
  ]);
});

test("public OAuth probe uses explicit public DNS and pins HTTPS lookup", async () => {
  const calls = [];
  const resolver = {
    async resolve4(hostname) {
      calls.push(["resolve4", hostname]);
      return ["104.21.33.49"];
    },
    async resolve6(hostname) {
      calls.push(["resolve6", hostname]);
      return ["2606:4700:3032::6815:2131"];
    }
  };
  const resolved = await resolvePublicProbeAddress("mcp.example.com", resolver);
  assert.deepEqual(resolved, { address: "104.21.33.49", family: 4 });
  assert.deepEqual(calls, [["resolve4", "mcp.example.com"]]);

  const lookup = createFixedAddressLookup(resolved);
  const single = await new Promise((resolve, reject) => {
    lookup("mcp.example.com", {}, (error, address, family) => error ? reject(error) : resolve({ address, family }));
  });
  assert.deepEqual(single, resolved);
  const all = await new Promise((resolve, reject) => {
    lookup("mcp.example.com", { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses));
  });
  assert.deepEqual(all, [resolved]);
});

test("DNS routing uses the exact tunnel UUID instead of an ambiguous name", () => {
  const tunnelId = "1a32acd1-ad71-4388-a610-0404c917ed7d";
  assert.deepEqual(tunnelDnsRouteArgs(tunnelId, "mcp.example.com"), [
    "tunnel",
    "--no-autoupdate",
    "route",
    "dns",
    tunnelId,
    "mcp.example.com"
  ]);
  assert.throws(
    () => tunnelDnsRouteArgs("codexgpt", "mcp.example.com"),
    /AUTH_TUNNEL_CREATE_UNVERIFIED/
  );
});

test("tunnel selection reuses only the exact journal-owned id", () => {
  const ownedId = "11111111-2222-4333-8444-555555555555";
  assert.deepEqual(
    selectOwnedTunnel([{ id: ownedId, name: "codexgpt-test" }], "codexgpt-test", ownedId),
    { id: ownedId, name: "codexgpt-test" }
  );
  assert.equal(selectOwnedTunnel([], "codexgpt-test", ""), null);
  assert.throws(
    () => selectOwnedTunnel([{ id: ownedId, name: "codexgpt-test" }], "codexgpt-test", ""),
    /AUTH_TUNNEL_NAME_CONFLICT/
  );
  assert.throws(
    () => selectOwnedTunnel([
      { id: ownedId, name: "codexgpt-test" },
      { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "codexgpt-test" }
    ], "codexgpt-test", ownedId),
    /AUTH_TUNNEL_NAME_AMBIGUOUS/
  );
});

test("named tunnel startup health uses public DNS independent of the local resolver", () => {
  const launcherSource = fs.readFileSync(path.join(projectRoot, "scripts", "codexgpt.mjs"), "utf8");
  assert.match(launcherSource, /resolvePublicProbeAddress/);
  assert.match(launcherSource, /waitForPublicHealth\(publicBase, token, cloudflared, 'tunnel', true\)/);
});

test("OAuth runtime status binds the native-control pid to its matching creation time", () => {
  const httpSource = fs.readFileSync(path.join(projectRoot, "src", "http.ts"), "utf8");
  assert.match(httpSource, /const nativeControlReady = localApprovalRuntime\.nativeControl\(\)!\.ready;/);
  assert.match(httpSource, /pid: nativeControlReady\.pid,/);
  assert.match(httpSource, /processCreationTime: nativeControlReady\.processCreationTime,/);
  assert.doesNotMatch(httpSource, /pid: process\.pid,\s*processCreationTime: localApprovalRuntime\.nativeControl\(\)!\.ready\.processCreationTime,/s);
});

test("supported entry routes auth help without starting the connector", () => {
  const result = run(["auth", "help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CodexGPT OAuth administration/);
  assert.doesNotMatch(result.stdout, /Starting local MCP server/);
});

test("auth status is workspace-scoped and never prints saved secrets", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root, { authMode: "legacy", token: "do-not-print-this-token" }));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
  const result = run(["auth", "status", "--root", root, "--json"], {
    CODEXGPT_HOME: home,
    CODEXGPT_AUTH_MODE: "legacy"
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.root, root);
  assert.equal(parsed.mode, "legacy");
  assert.equal(parsed.modeSource, "current-process");
  assert.equal(parsed.runtime, null);
  assert.equal(result.stdout.includes("do-not-print-this-token"), false);
});

test("auth status removes a stale runtime marker instead of trusting a reused pid", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root, { authMode: "legacy" }));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
  const transactionStateRoot = resolveTransactionStateRoot({
    env: { ...process.env, CODEXGPT_HOME: home },
    platform: process.platform,
    homeDir: os.homedir()
  });
  const oauthStateRoot = path.join(transactionStateRoot, "oauth");
  const profileId = workspaceProfileIdForRoot(root);
  writeOAuthRuntimeStatus(oauthStateRoot, {
    schemaVersion: 1,
    profileId,
    canonicalRoot: root,
    bindingId: `binding_${"a".repeat(32)}`,
    incarnationId: `incarnation_${"b".repeat(32)}`,
    serverId: "c".repeat(32),
    pid: process.pid,
    processCreationTime: "2000-01-01T00:00:00.000Z",
    localAdminOrigin: "http://127.0.0.1:17878",
    startedAt: "2000-01-01T00:00:00.000Z"
  });
  const marker = oauthRuntimeStatusPath(oauthStateRoot, profileId);
  assert.equal(fs.existsSync(marker), true);
  const result = run(["auth", "status", "--root", root, "--json"], {
    CODEXGPT_HOME: home,
    CODEXGPT_AUTH_MODE: "legacy"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).runtime, null);
  assert.equal(fs.existsSync(marker), false);
});

test("rollback records one explicit pre-route Legacy endpoint without copying credentials", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-rollback-migration-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root, {
      token: "legacy-token-must-not-print",
      cloudflareConfig: path.join(home, "oauth-tunnel.yml")
    }));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }

  const missing = run(["auth", "rollback", "--root", root], { CODEXGPT_HOME: home });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /AUTH_LEGACY_ROUTE_MISSING/);
  assert.doesNotMatch(`${missing.stdout}\n${missing.stderr}`, /legacy-token-must-not-print/);

  const partial = run([
    "auth", "rollback", "--root", root,
    "--legacy-hostname", "legacy.example.com"
  ], { CODEXGPT_HOME: home });
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /AUTH_LEGACY_ROUTE_MISSING/);

  const migrated = run([
    "auth", "rollback", "--root", root,
    "--legacy-hostname", "legacy.example.com",
    "--legacy-tunnel-name", "codexgpt-legacy",
    "--legacy-public-port", "17879"
  ], { CODEXGPT_HOME: home });
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assert.match(migrated.stdout, /Recorded retained Legacy route/);
  assert.doesNotMatch(`${migrated.stdout}\n${migrated.stderr}`, /legacy-token-must-not-print/);

  process.env.CODEXGPT_HOME = home;
  try {
    const saved = readWorkspaceProfile(root);
    assert.equal(saved.authMode, "legacy");
    assert.equal(saved.hostname, "legacy.example.com");
    assert.equal(saved.tunnelName, "codexgpt-legacy");
    assert.equal(saved.port, "17879");
    assert.equal(saved.authRoutes.legacy.hostname, "legacy.example.com");
    assert.equal(saved.authRoutes.oauth.hostname, "mcp.example.com");
    assert.equal(saved.authRoutes.oauth.localAdminPort, "17878");
    assert.equal(saved.authRoutes.oauth.cloudflareConfig, path.join(home, "oauth-tunnel.yml"));
    assert.equal(saved.token, "legacy-token-must-not-print");
    assert.equal(Object.hasOwn(saved.authRoutes.legacy, "token"), false);
    assert.equal(Object.hasOwn(saved.authRoutes.oauth, "token"), false);
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
});

test("rollback activates the retained Legacy route and preserves the OAuth route", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root, {
      token: "legacy-token-must-not-print",
      authRoutes: {
        legacy: {
          tunnel: "cloudflare-named",
          hostname: "legacy.example.com",
          tunnelName: "codexgpt-legacy",
          port: "17879"
        },
        oauth: {
          tunnel: "cloudflare-named",
          hostname: "mcp.example.com",
          tunnelName: "codexgpt-test",
          tunnelOwner: "codexgpt",
          port: "17877",
          localAdminPort: "17878",
          cloudflareConfig: path.join(home, "oauth-tunnel.yml")
        }
      }
    }));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }

  const result = run(["auth", "rollback", "--root", root], { CODEXGPT_HOME: home });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /legacy-token-must-not-print/);
  assert.match(result.stdout, /use the separately retained Legacy App/i);
  assert.match(result.stdout, /start --root/);

  process.env.CODEXGPT_HOME = home;
  try {
    const saved = readWorkspaceProfile(root);
    assert.equal(saved.authMode, "legacy");
    assert.equal(saved.hostname, "legacy.example.com");
    assert.equal(saved.tunnelName, "codexgpt-legacy");
    assert.equal(saved.port, "17879");
    assert.equal(saved.localAdminPort, undefined);
    assert.equal(saved.authRoutes.oauth.hostname, "mcp.example.com");
    assert.equal(saved.authRoutes.oauth.localAdminPort, "17878");
    assert.equal(saved.oauthIssuer, "https://mcp.example.com");
    assert.equal(saved.oauthResource, "https://mcp.example.com/mcp");
    assert.equal(saved.oauthStateRef, "state_0123456789abcdef0123456789abcdef");
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
});

test("rollback fails closed when current-process auth mode overrides the profile", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
  const result = run(["auth", "rollback", "--root", root], {
    CODEXGPT_HOME: home,
    CODEXGPT_AUTH_MODE: "oauth"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AUTH_MODE_ENV_OVERRIDE/);
  assert.match(result.stderr, /Remove-Item Env:CODEXGPT_AUTH_MODE/);
  process.env.CODEXGPT_HOME = home;
  try {
    assert.equal(readWorkspaceProfile(root).authMode, "oauth");
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
});

test("recovery commands require destructive intent flags", (t) => {
  const root = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, profile(root));
  } finally {
    delete process.env.CODEXGPT_HOME;
  }
  const reinitialize = run(["auth", "reinitialize", "--root", root], { CODEXGPT_HOME: home });
  assert.equal(reinitialize.status, 1);
  assert.match(reinitialize.stderr, /OAUTH_REVOKE_ALL_REQUIRED/);
  const reinitializeConfirmedIntent = run(["auth", "reinitialize", "--revoke-all", "--root", root], { CODEXGPT_HOME: home });
  assert.equal(reinitializeConfirmedIntent.status, 1);
  assert.match(reinitializeConfirmedIntent.stderr, /AUTH_CONFIRMATION_REQUIRED/);
  assert.match(reinitializeConfirmedIntent.stderr, /--confirm-reinitialize/);

  const restore = run(["auth", "recover", "restore", `backup_${"1".repeat(13)}_${"a".repeat(32)}.json`, "--root", root], { CODEXGPT_HOME: home });
  assert.equal(restore.status, 1);
  assert.match(restore.stderr, /AUTH_CONFIRMATION_REQUIRED/);
  assert.match(restore.stderr, /--confirm-forced-relink/);

  const unlock = run(["auth", "recover", "unlock", `authrun_${"b".repeat(32)}`, "--root", root], { CODEXGPT_HOME: home });
  assert.equal(unlock.status, 1);
  assert.match(unlock.stderr, /AUTH_CONFIRMATION_REQUIRED/);
  assert.match(unlock.stderr, /--confirm-dead-owner/);

  const revokeAll = run(["auth", "revoke", "--all", "--root", root], { CODEXGPT_HOME: home });
  assert.equal(revokeAll.status, 1);
  assert.match(revokeAll.stderr, /AUTH_CONFIRMATION_REQUIRED/);
  assert.match(revokeAll.stderr, /--confirm-revoke-all/);

  const rebind = run(["auth", "rebind", "--from-root", root, "--root", root, "--hostname", "mcp.example.com"], { CODEXGPT_HOME: home });
  assert.equal(rebind.status, 1);
  assert.match(rebind.stderr, /OAUTH_REVOKE_ALL_REQUIRED/);

  const sameRootRebind = run([
    "auth", "rebind", "--from-root", root, "--root", root,
    "--hostname", "mcp.example.com", "--revoke-all"
  ], { CODEXGPT_HOME: home });
  assert.equal(sameRootRebind.status, 1);
  assert.match(sameRootRebind.stderr, /OAUTH_STATE_CONFLICT/);
});

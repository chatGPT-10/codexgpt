#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Resolver as DnsResolver } from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  installVerifiedCloudflared,
  managedCloudflaredInstallPath,
  verifiedInstalledCloudflaredVersion
} from "./cloudflared-installer.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const DEFAULT_PUBLIC_PORT = 8787;
const DEFAULT_LOCAL_ADMIN_PORT = 8788;
const SETUP_JOURNAL_SCHEMA = 1;
const SAFE_BACKUP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export function authUsage() {
  return `CodexGPT OAuth administration

Usage:
  codexgpt auth setup --root <workspace> --hostname <host> --tunnel-name <name>
  codexgpt auth status --root <workspace> [--json]
  codexgpt auth pending --root <workspace>
  codexgpt auth open --root <workspace>
  codexgpt auth approve <correlation-code> --root <workspace>
  codexgpt auth deny <correlation-code> --root <workspace>
  codexgpt auth clients --root <workspace>
  codexgpt auth client remove <client-id> --root <workspace>
  codexgpt auth prune --unapproved --root <workspace>
  codexgpt auth revoke <grant-id> --root <workspace>
  codexgpt auth revoke --all --root <workspace>
  codexgpt auth rotate-signing-key [--revoke-all] --root <workspace>
  codexgpt auth rollback --root <workspace>
  codexgpt auth recover inspect --root <workspace>
  codexgpt auth recover restore <backup-id> --root <workspace>
  codexgpt auth recover unlock <exact-owner-id> --root <workspace>
  codexgpt auth reinitialize --revoke-all --root <workspace>
  codexgpt auth rebind --from-root <old> --root <new> --hostname <host> --revoke-all

Setup controls:
  --no-tunnel-changes   Perform local checks and print exact remaining Cloudflare commands.
  --provision-tunnel    Explicitly allow bounded named-tunnel and DNS provisioning.
  --no-start            Stop the verified candidate after setup commits.
  --public-port <port>  Public loopback listener. Default: 8787.
  --local-admin-port <port> Local-only admin listener. Default: 8788.
  --cloudflare-config <path> Dedicated generated ingress config path.
  --legacy-hostname <host>  One-time pre-route migration input for auth rollback.
  --legacy-tunnel-name <name> One-time retained Legacy named-tunnel input.
  --legacy-public-port <port> One-time retained Legacy loopback port input.
  --confirm-revoke-all      Required for noninteractive owner-wide grant revocation.
  --confirm-forced-relink   Required for noninteractive backup restore.
  --confirm-dead-owner      Required for noninteractive stale-lock recovery.
  --confirm-reinitialize    Required for noninteractive deployment reinitialization.
`;
}

function authError(code, message, repairCommand = "") {
  const error = Object.assign(new Error(`${code}: ${message}`), { code });
  if (repairCommand) error.repairCommand = repairCommand;
  return error;
}

function expandHome(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function CodexGPTHome(env = process.env) {
  const configured = env.CODEXGPT_HOME?.trim();
  return configured ? path.resolve(expandHome(configured)) : path.join(os.homedir(), ".codexgpt");
}

function commandArgument(value) {
  const text = String(value);
  return /^[A-Za-z0-9._:/=-]+$/.test(text) ? text : `"${text.replaceAll('"', '""')}"`;
}

function supportedCommand(args) {
  const installedPackage = projectRoot.split(path.sep).some((part) => part.toLocaleLowerCase("en-US") === "node_modules");
  const prefix = installedPackage
    ? "codexgpt"
    : `node ${commandArgument(path.join(projectRoot, "scripts", "codexgpt-entry.mjs"))}`;
  return `${prefix} ${args.map(commandArgument).join(" ")}`.trim();
}

function optionValue(argv, name) {  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  return "";
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function exactPort(value, label) {
  const parsed = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw authError("OAUTH_DEPLOYMENT_INVALID", `${label} must be an integer from 1 to 65535.`);
  }
  return parsed;
}

export function parseAuthInvocation(argv) {
  const command = argv[0] ?? "help";
  let operation = command;
  let target = "";
  if (command === "client") {
    operation = `client.${argv[1] ?? ""}`;
    target = argv[2] ?? "";
  } else if (command === "recover") {
    operation = `recover.${argv[1] ?? ""}`;
    target = argv[2] ?? "";
  } else {
    target = argv[1] && !argv[1].startsWith("--") ? argv[1] : "";
  }
  return Object.freeze({ command, operation, target, argv: [...argv] });
}

function canonicalDirectory(input) {
  const resolved = path.resolve(expandHome(input));
  let canonical;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    throw authError("OAUTH_ROOT_REQUIRED", `Workspace root does not exist: ${resolved}`);
  }
  if (!fs.statSync(canonical).isDirectory()) throw authError("OAUTH_ROOT_REQUIRED", `Workspace root is not a directory: ${canonical}`);
  return canonical;
}

function profileIdForRoot(root) {
  return createHash("sha256").update(root).digest("hex").slice(0, 24);
}

async function runtimeModules() {
  const dist = (...parts) => pathToFileURL(path.join(projectRoot, "dist", ...parts)).href;
  const [profile, stateRoot, auth, control, audit, locks, config] = await Promise.all([
    import(dist("profileStore.js")),
    import(dist("transactions", "stateRoot.js")),
    import(dist("auth", "index.js")),
    import(dist("control", "localApprovalClient.js")),
    import(dist("audit", "store.js")),
    import(dist("transactions", "workspaceLock.js")),
    import(dist("config.js"))
  ]);
  return { profile, stateRoot, auth, control, audit, locks, config };
}

function resolveRoot(argv, profileModule, options = {}) {
  const explicit = optionValue(argv, options.name ?? "root");
  if (explicit) return canonicalDirectory(explicit);
  const cwd = canonicalDirectory(process.cwd());
  const profile = profileModule.readWorkspaceProfile(cwd);
  if (profile.root === cwd) return cwd;
  throw authError(
    "OAUTH_ROOT_REQUIRED",
    "OAuth administration requires --root unless the current directory has one exact matching profile.",
    supportedCommand(["auth", argv[0] ?? "status", "--root", cwd])
  );
}

function oauthStateRoots(modules) {
  const transactionStateRoot = modules.stateRoot.resolveTransactionStateRoot();
  return { transactionStateRoot, oauthStateRoot: path.join(transactionStateRoot, "oauth") };
}

function stableProfilePayload(profile, overrides = {}) {
  const { profilePath, version, updatedAt, ...rest } = profile ?? {};
  return { ...rest, ...overrides };
}

const REBIND_ALIAS_REQUIRED_FIELDS = [
  "tunnel",
  "hostname",
  "tunnelName",
  "tunnelOwner",
  "port",
  "localAdminPort",
  "cloudflareConfig",
  "oauthIssuer",
  "oauthResource",
  "oauthCredentialProvider",
  "oauthStateRef"
];

const REBIND_ALIAS_OPTIONAL_FIELDS = ["cloudflareTokenFile", "noInstallCloudflared"];

function profileOAuthSelector(profile, field) {
  return profile?.authRoutes?.oauth?.[field] ?? profile?.[field];
}

export function isStaleOAuthRebindAlias(targetProfile, sourceProfile) {
  if (targetProfile?.authMode !== "oauth") return false;
  const requiredMatches = REBIND_ALIAS_REQUIRED_FIELDS.every((field) => {
    const sourceValue = profileOAuthSelector(sourceProfile, field);
    return sourceValue !== undefined && profileOAuthSelector(targetProfile, field) === sourceValue;
  });
  if (!requiredMatches) return false;
  return REBIND_ALIAS_OPTIONAL_FIELDS.every((field) =>
    profileOAuthSelector(targetProfile, field) === profileOAuthSelector(sourceProfile, field)
  );
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch {}
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function writeTextAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch {}
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

export function setupJournalPath(root) {
  return path.join(CodexGPTHome(), "auth-setup", `${profileIdForRoot(root)}.json`);
}

export function readSetupJournal(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(setupJournalPath(root), "utf8"));
    if (
      parsed?.schemaVersion !== SETUP_JOURNAL_SCHEMA ||
      parsed.profileId !== profileIdForRoot(root) ||
      parsed.canonicalRoot !== root
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function updateSetupJournal(root, values) {
  const filePath = setupJournalPath(root);
  const previous = readSetupJournal(root) ?? {};
  const now = new Date().toISOString();
  const existingHistory = Array.isArray(previous.history)
    ? previous.history.filter((entry) => entry && typeof entry.phase === "string" && typeof entry.at === "string")
    : [];
  const nextHistory = typeof values.phase === "string" && existingHistory.at(-1)?.phase !== values.phase
    ? [...existingHistory, { phase: values.phase, at: now }].slice(-64)
    : existingHistory.slice(-64);
  const journal = {
    ...previous,
    ...values,
    schemaVersion: SETUP_JOURNAL_SCHEMA,
    profileId: profileIdForRoot(root),
    canonicalRoot: root,
    createdAt: previous.createdAt ?? now,
    updatedAt: now,
    history: nextHistory
  };
  writeJsonAtomic(filePath, journal);
  return journal;
}

function managedCloudflaredPath() {
  return managedCloudflaredInstallPath();
}

function defaultCloudflareConfigPath(root) {
  return path.join(CodexGPTHome(), "oauth", "tunnels", profileIdForRoot(root), "config.yml");
}

function dedicatedTunnelName(tunnelName) {
  const suffix = "-dedicated";
  if (tunnelName.endsWith(suffix)) return tunnelName;
  return `${tunnelName.slice(0, 128 - suffix.length)}${suffix}`;
}

function sameNativePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32"
    ? a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US")
    : a === b;
}

function dedicatedTunnelConfigPath(root, configPath) {
  const defaultPath = path.resolve(defaultCloudflareConfigPath(root));
  const directory = path.dirname(defaultPath);
  const candidates = [defaultPath];
  for (let index = 1; index <= 100; index += 1) {
    candidates.push(path.join(directory, index === 1 ? "config.dedicated.yml" : `config.dedicated-${index}.yml`));
  }
  const selected = candidates.find((candidate) => !sameNativePath(candidate, configPath) && !fs.existsSync(candidate));
  if (!selected) {
    throw authError("AUTH_TUNNEL_CONFIG_PATH_EXHAUSTED", "No unused dedicated Cloudflare config path is available.");
  }
  return selected;
}

function dedicatedTunnelCommand(input) {
  return supportedCommand([
    "auth", "setup",
    "--root", input.root,
    "--hostname", input.hostname,
    "--tunnel-name", dedicatedTunnelName(input.tunnelName),
    "--cloudflare-config", dedicatedTunnelConfigPath(input.root, input.configPath)
  ]);
}

function tunnelOwnerMarkerPath(configPath) {
  return `${configPath}.owner.json`;
}

export function writeTunnelOwnerMarker(configPath, input) {
  writeJsonAtomic(tunnelOwnerMarkerPath(configPath), {
    schemaVersion: 1,
    owner: "codexgpt",
    profileId: input.profileId,
    bindingId: input.bindingId,
    tunnelId: input.tunnelId,
    tunnelName: input.tunnelName,
    hostname: input.hostname,
    createdAt: new Date().toISOString()
  });
}

export function validateTunnelOwnerMarker(configPath, input) {
  let marker;
  try { marker = JSON.parse(fs.readFileSync(tunnelOwnerMarkerPath(configPath), "utf8")); }
  catch { throw authError("AUTH_TUNNEL_OWNERSHIP_UNPROVEN", "Dedicated tunnel config lacks a CodexGPT ownership marker."); }
  if (
    marker?.schemaVersion !== 1 || marker.owner !== "codexgpt" ||
    marker.profileId !== input.profileId || marker.bindingId !== input.bindingId ||
    marker.tunnelId !== input.tunnelId || marker.tunnelName !== input.tunnelName ||
    marker.hostname !== input.hostname
  ) {
    throw authError("AUTH_TUNNEL_OWNERSHIP_UNPROVEN", "Dedicated tunnel ownership marker does not match this workspace and deployment.");
  }
  return marker;
}

export function preflightExistingTunnelConfig(input) {
  if (!fs.existsSync(input.configPath)) return null;
  const repairCommand = dedicatedTunnelCommand(input);
  const text = fs.readFileSync(input.configPath, "utf8");
  let validation;
  try {
    validation = input.validateDedicatedTunnelConfig(text, {
      hostname: input.hostname,
      publicPort: input.publicPort,
      localAdminPort: input.localAdminPort
    });
  } catch (error) {
    if (["AUTH_TUNNEL_SHARED_CONFIG", "AUTH_TUNNEL_ADMIN_EXPOSED", "AUTH_TUNNEL_INGRESS_INVALID"].includes(error?.code)) {
      throw authError(
        error.code,
        "Existing Cloudflare config is shared or unsafe and will not be modified.",
        repairCommand
      );
    }
    throw error;
  }

  let marker;
  try { marker = JSON.parse(fs.readFileSync(tunnelOwnerMarkerPath(input.configPath), "utf8")); }
  catch {
    throw authError(
      "AUTH_TUNNEL_OWNERSHIP_UNPROVEN",
      "Existing Cloudflare config is not owned by this CodexGPT deployment and will not be modified.",
      repairCommand
    );
  }
  if (
    marker?.schemaVersion !== 1 || marker.owner !== "codexgpt" ||
    marker.profileId !== input.profileId ||
    !/^binding_[a-f0-9]{32}$/.test(String(marker.bindingId ?? "")) ||
    marker.tunnelId !== validation.tunnelId || marker.tunnelName !== input.tunnelName ||
    marker.hostname !== input.hostname
  ) {
    throw authError(
      "AUTH_TUNNEL_OWNERSHIP_UNPROVEN",
      "Existing Cloudflare ownership marker does not match this workspace and tunnel and will not be modified.",
      repairCommand
    );
  }
  return { text, validation, marker };
}

function powershellPath() {
  const drive = path.parse(process.execPath).root;
  return path.join(drive, "Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function persistedUserAuthMode() {
  if (process.platform !== "win32") return "";
  const result = spawnSync(powershellPath(), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "[Console]::Out.Write([Environment]::GetEnvironmentVariable('CODEXGPT_AUTH_MODE','User'))"
  ], { encoding: "utf8", windowsHide: true, timeout: 5_000 });
  return result.status === 0 ? String(result.stdout ?? "").trim() : "";
}

function windowsProcessCreationTime(pid) {
  if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0) return "";
  const command = `$p=Get-Process -Id ${pid} -ErrorAction Stop;[Console]::Out.Write($p.StartTime.ToUniversalTime().ToString('O'))`;
  const result = spawnSync(powershellPath(), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command
  ], { encoding: "utf8", windowsHide: true, timeout: 5_000 });
  return result.status === 0 ? String(result.stdout ?? "").trim() : "";
}

function currentOAuthRuntime(modules, oauthStateRoot, profileId) {
  const runtime = modules.auth.readOAuthRuntimeStatus(oauthStateRoot, profileId);
  if (!runtime) return null;
  const liveCreationTime = windowsProcessCreationTime(runtime.pid);
  if (liveCreationTime && liveCreationTime === runtime.processCreationTime) return runtime;
  modules.auth.removeOAuthRuntimeStatus(oauthStateRoot, profileId, {
    pid: runtime.pid,
    serverId: runtime.serverId
  });
  return null;
}

function checkPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => reject(authError("OAUTH_PORT_IN_USE", `Local port ${port} is already in use.`, "Stop the owning process or select a different port.")));
    server.listen(port, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function safeRuntimeView(runtime) {
  if (!runtime) return null;
  return {
    running: true,
    pid: runtime.pid,
    startedAt: runtime.startedAt,
    localAdminOrigin: runtime.localAdminOrigin,
    bindingId: runtime.bindingId,
    incarnationId: runtime.incarnationId
  };
}

async function onlineContext(root, modules) {
  const profile = modules.profile.readWorkspaceProfile(root);
  const profileId = modules.profile.profileIdForRoot(root);
  const { transactionStateRoot, oauthStateRoot } = oauthStateRoots(modules);
  const runtime = currentOAuthRuntime(modules, oauthStateRoot, profileId);
  if (!runtime || runtime.canonicalRoot !== root) {
    throw authError(
      "OAUTH_SERVICE_NOT_RUNNING",
      "The OAuth service is not running for this workspace.",
      supportedCommand(["start", "--root", root])
    );
  }
  const client = new modules.control.LocalApprovalClient({ stateBaseRoot: transactionStateRoot });
  return { profile, profileId, transactionStateRoot, oauthStateRoot, runtime, client };
}

async function withOfflineAuth(root, modules, action) {
  const profile = modules.profile.readWorkspaceProfile(root);
  const profileId = modules.profile.profileIdForRoot(root);
  const { transactionStateRoot, oauthStateRoot } = oauthStateRoots(modules);
  const runtime = currentOAuthRuntime(modules, oauthStateRoot, profileId);
  if (runtime) throw authError("OAUTH_STATE_BUSY", "Stop the OAuth service before running this offline recovery operation.");
  const auditRegistry = new modules.locks.ProcessInstanceRegistry(transactionStateRoot);
  const auditStore = modules.audit.PersistentAuditStore.open({
    stateRoot: transactionStateRoot,
    registry: auditRegistry,
    retention: { maxAgeDays: 30, maxClosedBytes: 512 * 1024 * 1024 }
  });
  const credentialStore = modules.auth.createProductionCredentialStore();
  const authInstance = new modules.auth.AuthProcessInstanceRegistry(oauthStateRoot);
  try {
    await credentialStore.probe();
    const store = new modules.auth.AuthStateStore(oauthStateRoot, credentialStore, {
      audit: new modules.auth.PersistentAuthStateAuditAppender(auditStore)
    });
    const locks = new modules.auth.AuthStateLock(oauthStateRoot, authInstance);
    const registry = new modules.auth.DeploymentRegistry(store);
    const coordinator = new modules.auth.AuthDeploymentCoordinator(
      store,
      new modules.auth.AuthKeyManager(credentialStore),
      registry,
      locks
    );
    return await action({ profile, profileId, transactionStateRoot, oauthStateRoot, store, locks, registry, coordinator });
  } finally {
    authInstance.dispose();
    auditStore.dispose();
    auditRegistry.dispose();
  }
}

function deploymentConfiguration(root, profile, modules, overrides = {}) {
  const profileId = modules.profile.profileIdForRoot(root);
  const oauthRoute = profile.authRoutes?.oauth ?? {};
  return modules.auth.resolveOAuthDeploymentConfiguration({
    canonicalRoot: root,
    profileId,
    hostname: overrides.hostname ?? oauthRoute.hostname ?? profile.hostname ?? "",
    issuer: overrides.issuer ?? profile.oauthIssuer,
    resource: overrides.resource ?? profile.oauthResource,
    tunnel: overrides.tunnel ?? oauthRoute.tunnel ?? profile.tunnel ?? "",
    tunnelName: overrides.tunnelName ?? oauthRoute.tunnelName ?? profile.tunnelName ?? "",
    tunnelOwner: overrides.tunnelOwner ?? oauthRoute.tunnelOwner ?? profile.tunnelOwner ?? "",
    publicHost: "127.0.0.1",
    publicPort: Number(overrides.publicPort ?? oauthRoute.port ?? profile.port ?? DEFAULT_PUBLIC_PORT),
    localAdminHost: "127.0.0.1",
    localAdminPort: Number(overrides.localAdminPort ?? oauthRoute.localAdminPort ?? profile.localAdminPort ?? DEFAULT_LOCAL_ADMIN_PORT)
  });
}

function printRows(rows) {
  for (const [label, value] of rows) console.log(`${String(label).padEnd(14)} ${value}`);
}

function safeLists(authorizations, clients, grants) {
  return {
    authorizations: authorizations.oauthAuthorizations ?? [],
    clients: clients.oauthClients ?? [],
    grants: grants.oauthGrants ?? []
  };
}

async function commandStatus(root, modules, json = false) {
  const profile = modules.profile.readWorkspaceProfile(root);
  const resolution = modules.auth.resolveHttpAuthMode({
    currentProcess: process.env.CODEXGPT_AUTH_MODE,
    persistedUser: persistedUserAuthMode() || undefined,
    profile: profile.authMode
  });
  const { oauthStateRoot } = oauthStateRoots(modules);
  const runtime = currentOAuthRuntime(modules, oauthStateRoot, modules.profile.profileIdForRoot(root));
  let live = null;
  if (runtime) {
    try {
      const context = await onlineContext(root, modules);
      const [authorizations, clients, grants] = await Promise.all([
        context.client.listOAuthAuthorizations(runtime.serverId),
        context.client.listOAuthClients(runtime.serverId),
        context.client.listOAuthGrants(runtime.serverId)
      ]);
      live = safeLists(authorizations, clients, grants);
    } catch {
      live = null;
    }
  }
  const result = {
    root,
    mode: resolution.mode,
    modeSource: resolution.source,
    configured: profile.authMode === "oauth",
    hostname: profile.hostname ?? null,
    resource: profile.oauthResource ?? null,
    tunnel: profile.tunnel ?? null,
    tunnelName: profile.tunnelName ?? null,
    runtime: safeRuntimeView(runtime),
    live
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else printRows([
    ["Workspace", root],
    ["Mode", `${result.mode} (${result.modeSource})`],
    ["Hostname", result.hostname ?? "not configured"],
    ["Tunnel", result.tunnelName ? `${result.tunnel} / ${result.tunnelName}` : "not configured"],
    ["Runtime", runtime ? `running pid=${runtime.pid}` : "stopped"],
    ["Pending", live ? live.authorizations.filter((entry) => entry.status === "pending").length : "unavailable"],
    ["Clients", live ? live.clients.filter((entry) => entry.status !== "revoked").length : "unavailable"],
    ["Active grants", live ? live.grants.filter((entry) => entry.status === "active").length : "unavailable"]
  ]);
  return result;
}

async function listOnline(root, modules, kind) {
  const context = await onlineContext(root, modules);
  const response = kind === "pending"
    ? await context.client.listOAuthAuthorizations(context.runtime.serverId)
    : kind === "clients"
      ? await context.client.listOAuthClients(context.runtime.serverId)
      : await context.client.listOAuthGrants(context.runtime.serverId);
  const entries = kind === "pending" ? response.oauthAuthorizations ?? [] : kind === "clients" ? response.oauthClients ?? [] : response.oauthGrants ?? [];
  if (entries.length === 0) {
    console.log(`No OAuth ${kind}.`);
    return entries;
  }
  for (const entry of entries) {
    if (kind === "pending") {
      console.log(`${entry.correlationCode}  ${entry.status}  ${entry.clientLabel}  ${entry.scopes.join(",")}  expires=${entry.expiresAt}`);
    } else if (kind === "clients") {
      console.log(`${entry.clientId}  ${entry.status}  ${entry.label}  ${entry.redirectHost}${entry.redirectPath}`);
    } else {
      console.log(`${entry.grantId}  ${entry.status}  ${entry.scopes.join(",")}  expires=${entry.absoluteExpiresAt}`);
    }
  }
  return entries;
}

async function resolvePending(context, target) {
  const response = await context.client.listOAuthAuthorizations(context.runtime.serverId);
  const normalized = target.toUpperCase();
  const matches = (response.oauthAuthorizations ?? []).filter((entry) =>
    entry.status === "pending" && (entry.pendingId === target || entry.correlationCode === normalized)
  );
  if (matches.length !== 1) throw authError("OAUTH_AUTHORIZATION_NOT_FOUND", "The pending authorization was not found or was ambiguous.");
  return matches[0];
}

function openBrowser(url) {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/#bootstrap=[A-Za-z0-9_-]{43}$/.test(url)) {
    throw authError("AUTH_ADMIN_BOOTSTRAP_INVALID", "Refusing to open an invalid local admin bootstrap URL.");
  }
  const windows = process.platform === "win32";
  const executable = windows ? powershellPath() : "xdg-open";
  const args = windows
    ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:CODEXGPT_ADMIN_BOOTSTRAP"]
    : [url];
  const result = spawnSync(executable, args, {
    env: windows ? { ...process.env, CODEXGPT_ADMIN_BOOTSTRAP: url } : process.env,
    stdio: "ignore",
    windowsHide: true,
    timeout: 10_000
  });
  if (result.error || result.status !== 0) {
    throw authError("AUTH_ADMIN_BROWSER_OPEN_FAILED", "The local OAuth administration page could not be opened in the current Windows session.");
  }
}

export function cloudflaredSuccessOutput(result) {
  return String(result?.stdout ?? "");
}

function runCloudflared(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
    throw authError("AUTH_TUNNEL_COMMAND_FAILED", detail || result.error?.message || `cloudflared exited ${result.status}`);
  }
  return cloudflaredSuccessOutput(result);
}

function cloudflareLoginMaterial() {
  return path.join(os.homedir(), ".cloudflared", "cert.pem");
}

function listCloudflareTunnels(binary) {
  const output = runCloudflared(binary, ["tunnel", "--no-autoupdate", "list", "--output", "json"]);
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw authError("AUTH_TUNNEL_LIST_INVALID", "cloudflared returned invalid tunnel inventory JSON."); }
  return Array.isArray(parsed) ? parsed : [];
}

function tunnelIdentity(entry) {
  const id = String(entry?.id ?? entry?.uuid ?? "").toLowerCase();
  const name = String(entry?.name ?? "");
  return { id, name };
}

export function selectOwnedTunnel(inventory, tunnelName, expectedTunnelId = "") {
  const matches = inventory.map(tunnelIdentity).filter((entry) => entry.name === tunnelName);
  if (matches.length > 1) {
    throw authError("AUTH_TUNNEL_NAME_AMBIGUOUS", "Multiple Cloudflare tunnels have the requested name.");
  }
  if (matches.length === 0) return null;
  if (matches[0].id !== expectedTunnelId) {
    throw authError(
      "AUTH_TUNNEL_NAME_CONFLICT",
      `Cloudflare tunnel name '${tunnelName}' already exists without exact ownership evidence. Choose a new dedicated tunnel name.`
    );
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(matches[0].id)) {
    throw authError("AUTH_TUNNEL_CREATE_UNVERIFIED", "Cloudflare tunnel id is invalid.");
  }
  return matches[0];
}

function ensureTunnel(binary, tunnelName, expectedTunnelId = "") {
  if (!fs.existsSync(cloudflareLoginMaterial())) {
    throw authError("AUTH_TUNNEL_LOGIN_REQUIRED", "Cloudflare owner login material is missing.");
  }
  let tunnels = listCloudflareTunnels(binary);
  let selected = selectOwnedTunnel(tunnels, tunnelName, expectedTunnelId);
  let created = false;
  if (!selected) {
    runCloudflared(binary, ["tunnel", "--no-autoupdate", "create", tunnelName]);
    created = true;
    tunnels = listCloudflareTunnels(binary);
    const createdMatches = tunnels.map(tunnelIdentity).filter((entry) => entry.name === tunnelName);
    if (createdMatches.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(createdMatches[0].id)) {
      throw authError("AUTH_TUNNEL_CREATE_UNVERIFIED", "The created Cloudflare tunnel could not be identified exactly.");
    }
    selected = createdMatches[0];
  }
  return { tunnelId: selected.id, created };
}

export function tunnelDnsRouteArgs(tunnelId, hostname) {
  const normalizedTunnelId = String(tunnelId ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedTunnelId)) {
    throw authError("AUTH_TUNNEL_CREATE_UNVERIFIED", "Cloudflare tunnel id is invalid.");
  }
  return ["tunnel", "--no-autoupdate", "route", "dns", normalizedTunnelId, hostname];
}

function routeTunnelDns(binary, tunnelId, hostname) {
  runCloudflared(binary, tunnelDnsRouteArgs(tunnelId, hostname));
}

function printTunnelPlan(root, binary, tunnelName, hostname, configPath, publicPort) {
  console.log("Cloudflare changes not performed.");
  console.log(`Resume command: ${supportedCommand(["auth", "setup", "--root", root, "--hostname", hostname, "--tunnel-name", tunnelName, "--provision-tunnel"])}`);
  console.log("Remaining commands:");
  console.log(`  "${binary}" tunnel login`);
  console.log(`  "${binary}" tunnel create ${tunnelName}`);
  console.log(`  "${binary}" tunnel route dns ${tunnelName} ${hostname}`);
  console.log(`  Write dedicated ingress to: ${configPath}`);
  console.log(`  Required ingress: ${hostname} -> http://127.0.0.1:${publicPort}; final http_status:404`);
}

async function confirmProvision(tunnelName, hostname) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Create/reuse Cloudflare tunnel '${tunnelName}' and route '${hostname}'? Type YES: `);
    return answer === "YES";
  } finally {
    rl.close();
  }
}

async function requireDestructiveConfirmation(argv, flag, phrase, effect) {
  if (hasFlag(argv, flag)) return;
  if (!process.stdin.isTTY) {
    throw authError(
      "AUTH_CONFIRMATION_REQUIRED",
      `${effect} Noninteractive execution requires --${flag}.`,
      `Re-run the same command with --${flag}`
    );
  }
  console.log(effect);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type ${phrase} to continue: `);
    if (answer !== phrase) throw authError("AUTH_CONFIRMATION_DECLINED", "Destructive OAuth operation was not confirmed.");
  } finally {
    rl.close();
  }
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 15_000 });
  } else child.kill("SIGTERM");
}

function createPublicDnsResolver() {
  const resolver = new DnsResolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  return resolver;
}

export async function resolvePublicProbeAddress(hostname, resolver = createPublicDnsResolver()) {
  try {
    const addresses = await resolver.resolve4(hostname);
    const address = addresses.find((value) => net.isIPv4(value));
    if (address) return { address, family: 4 };
  } catch {}
  try {
    const addresses = await resolver.resolve6(hostname);
    const address = addresses.find((value) => net.isIPv6(value));
    if (address) return { address, family: 6 };
  } catch {}
  throw authError("AUTH_EXTERNAL_DNS_UNAVAILABLE", `Public DNS did not resolve ${hostname}.`);
}

export function createFixedAddressLookup(resolved) {
  const address = String(resolved?.address ?? "");
  const family = Number(resolved?.family);
  if (net.isIP(address) !== family || (family !== 4 && family !== 6)) {
    throw authError("AUTH_EXTERNAL_DNS_INVALID", "Public DNS returned an invalid address.");
  }
  return (_hostname, lookupOptions, callback) => {
    const done = typeof lookupOptions === "function" ? lookupOptions : callback;
    const all = typeof lookupOptions === "object" && lookupOptions?.all === true;
    queueMicrotask(() => {
      if (all) done(null, [{ address, family }]);
      else done(null, address, family);
    });
  };
}

function requestJson(url, options = {}) {
  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
  if (!transport) return Promise.reject(authError("AUTH_DOCTOR_URL_INVALID", "Doctor probe URL must use HTTP or HTTPS."));
  const maximumBytes = options.maximumBytes ?? 64 * 1024;
  return new Promise((resolve, reject) => {
    const request = transport.get({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      timeout: options.timeoutMs ?? 5_000,
      lookup: options.lookup,
      headers: { accept: "application/json", host: options.hostHeader ?? parsed.host }
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(authError("AUTH_DOCTOR_HTTP_FAILED", `${url} returned HTTP ${response.statusCode}.`));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maximumBytes) request.destroy(authError("AUTH_DOCTOR_RESPONSE_TOO_LARGE", `${url} exceeded the response limit.`));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(authError("AUTH_DOCTOR_RESPONSE_INVALID", `${url} returned invalid JSON.`)); }
      });
    });
    request.on("timeout", () => request.destroy(authError("AUTH_DOCTOR_TIMEOUT", `${url} timed out.`)));
    request.on("error", reject);
  });
}

async function verifyPublicOAuthSurface(hostname, expectedState) {
  const base = `https://${hostname}`;
  const resolved = await resolvePublicProbeAddress(hostname);
  const lookup = createFixedAddressLookup(resolved);
  const [protectedResource, authorizationServer, jwks, health] = await Promise.all([
    requestJson(`${base}/.well-known/oauth-protected-resource/mcp`, { lookup }),
    requestJson(`${base}/.well-known/oauth-authorization-server`, { lookup }),
    requestJson(`${base}/jwks`, { lookup }),
    requestJson(`${base}/healthz`, { lookup })
  ]);
  const expectedResource = `${base}/mcp`;
  if (
    protectedResource?.resource !== expectedResource ||
    !Array.isArray(protectedResource?.authorization_servers) ||
    protectedResource.authorization_servers.length !== 1 ||
    protectedResource.authorization_servers[0] !== base ||
    !Array.isArray(protectedResource?.scopes_supported) ||
    !protectedResource.scopes_supported.includes("codexgpt:read")
  ) {
    throw authError("AUTH_EXTERNAL_METADATA_MISMATCH", "Protected-resource metadata does not match the configured issuer/resource.");
  }
  const expectedEndpoints = {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    jwks_uri: `${base}/jwks`
  };
  for (const [field, expected] of Object.entries(expectedEndpoints)) {
    if (authorizationServer?.[field] !== expected) {
      throw authError("AUTH_EXTERNAL_METADATA_MISMATCH", `Authorization-server metadata field ${field} is inconsistent.`);
    }
  }
  if (!Array.isArray(jwks?.keys) || jwks.keys.length < 1 || jwks.keys.some((key) => key?.kty !== "EC" || key?.crv !== "P-256" || key?.alg !== "ES256" || key?.use !== "sig")) {
    throw authError("AUTH_EXTERNAL_JWKS_INVALID", "Public JWKS is missing or contains an unsupported key.");
  }
  if (expectedState && !jwks.keys.some((key) => key.kid === expectedState.activePublicJwk.kid)) {
    throw authError("AUTH_EXTERNAL_JWKS_MISMATCH", "Public JWKS does not contain the active local signing key.");
  }
  if (health?.ok !== true || health?.authMode !== "oauth" || health?.mcpAvailable !== true) {
    throw authError("AUTH_EXTERNAL_HEALTH_INVALID", "Public OAuth health does not report authenticated MCP availability.");
  }
  return { protectedResource, authorizationServer, jwks, health };
}

function publicMetadataProbe(hostname, expectedState, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (Date.now() >= deadline) {
        reject(authError("AUTH_EXTERNAL_PROBE_FAILED", `Public OAuth surface did not become healthy at https://${hostname}.`));
        return;
      }
      try {
        resolve(await verifyPublicOAuthSurface(hostname, expectedState));
      } catch {
        setTimeout(attempt, 500);
      }
    };
    void attempt();
  });
}

async function commandSetup(root, invocation, modules) {
  if (process.platform !== "win32") throw authError("OAUTH_DEPLOYMENT_INVALID", "Phase 8 Core OAuth setup requires native Windows.");
  const argv = invocation.argv;
  const existing = modules.profile.readWorkspaceProfile(root);
  const savedOAuthRoute = existing.authRoutes?.oauth ?? (existing.authMode === "oauth"
    ? modules.profile.workspaceAuthRouteFromProfile(existing)
    : {});
  const hostname = modules.auth.normalizeOAuthHostname(optionValue(argv, "hostname") || savedOAuthRoute.hostname || existing.hostname || "");
  const tunnelName = optionValue(argv, "tunnel-name") || savedOAuthRoute.tunnelName || existing.tunnelName || "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tunnelName)) throw authError("OAUTH_DEPLOYMENT_INVALID", "--tunnel-name is required and invalid.");
  const publicPort = exactPort(optionValue(argv, "public-port") || savedOAuthRoute.port || existing.port || DEFAULT_PUBLIC_PORT, "Public port");
  const localAdminPort = exactPort(optionValue(argv, "local-admin-port") || savedOAuthRoute.localAdminPort || existing.localAdminPort || DEFAULT_LOCAL_ADMIN_PORT, "Local-admin port");
  if (publicPort === localAdminPort) throw authError("OAUTH_DEPLOYMENT_INVALID", "Public and local-admin ports must be distinct.");
  const profileId = modules.profile.profileIdForRoot(root);
  const configPath = path.resolve(optionValue(argv, "cloudflare-config") || savedOAuthRoute.cloudflareConfig || existing.cloudflareConfig || defaultCloudflareConfigPath(root));
  const oauthRoute = {
    tunnel: "cloudflare-named",
    hostname,
    tunnelName,
    tunnelOwner: "codexgpt",
    port: String(publicPort),
    localAdminPort: String(localAdminPort),
    cloudflareConfig: configPath,
    ...(savedOAuthRoute.cloudflareTokenFile ? { cloudflareTokenFile: savedOAuthRoute.cloudflareTokenFile } : {}),
    ...(savedOAuthRoute.noInstallCloudflared ? { noInstallCloudflared: true } : {})
  };
  const retainedLegacyRoute = existing.authRoutes?.legacy ?? (existing.authMode !== "oauth"
    ? modules.profile.workspaceAuthRouteFromProfile(existing)
    : undefined);
  const authRoutes = {
    ...existing.authRoutes,
    ...(retainedLegacyRoute ? { legacy: retainedLegacyRoute } : {}),
    oauth: oauthRoute
  };
  const configuration = modules.auth.resolveOAuthDeploymentConfiguration({
    canonicalRoot: root,
    profileId: modules.profile.profileIdForRoot(root),
    hostname,
    tunnel: "cloudflare-named",
    tunnelName,
    tunnelOwner: "codexgpt",
    publicHost: "127.0.0.1",
    publicPort,
    localAdminHost: "127.0.0.1",
    localAdminPort
  });

  const existingTunnel = preflightExistingTunnelConfig({
    root,
    profileId,
    configPath,
    hostname,
    tunnelName,
    publicPort,
    localAdminPort,
    validateDedicatedTunnelConfig: modules.auth.validateDedicatedTunnelConfig
  });

  const { oauthStateRoot } = oauthStateRoots(modules);
  const running = currentOAuthRuntime(modules, oauthStateRoot, profileId);
  if (running) {
    if (running.canonicalRoot !== root || running.localAdminOrigin !== `http://127.0.0.1:${localAdminPort}`) {
      throw authError("OAUTH_STATE_CONFLICT", "The running OAuth instance does not match the requested workspace/listener configuration.");
    }
    if (!existingTunnel) {
      throw authError("AUTH_TUNNEL_CONFIG_INVALID", "The running OAuth instance has no saved dedicated tunnel config.");
    }
    validateTunnelOwnerMarker(configPath, {
      profileId,
      bindingId: running.bindingId,
      tunnelId: existingTunnel.validation.tunnelId,
      tunnelName,
      hostname
    });
    await verifyPublicOAuthSurface(hostname, null);
    modules.profile.saveWorkspaceProfile(root, modules.profile.applyWorkspaceAuthRoute(stableProfilePayload(existing, {
      authMode: "oauth",
      authRoutes,
      oauthIssuer: configuration.issuer,
      oauthResource: configuration.resource
    }), oauthRoute));
    updateSetupJournal(root, { phase: "mode-committed", bindingId: running.bindingId, incarnationId: running.incarnationId });
    updateSetupJournal(root, { phase: "foreground-running", candidatePid: running.pid });
    console.log("OAuth already ready");
    console.log(`Server URL  https://${hostname}/mcp`);
    console.log("Admin       local only");
    console.log(`Status      ${supportedCommand(["auth", "status", "--root", root])}`);
    return;
  }

  await checkPortFree(publicPort);
  await checkPortFree(localAdminPort);
  updateSetupJournal(root, { phase: "preflight", hostname, tunnelName, publicPort, localAdminPort });
  const cloudflared = await installVerifiedCloudflared({ ensureOnly: true });
  const initialized = await withOfflineAuth(root, modules, async ({ coordinator }) => coordinator.initialize(configuration));
  updateSetupJournal(root, {
    phase: "candidate-local-state",
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId
  });

  const candidateProfile = modules.profile.applyWorkspaceAuthRoute(stableProfilePayload(existing, {
    root,
    authRoutes,
    oauthIssuer: configuration.issuer,
    oauthResource: configuration.resource,
    oauthCredentialProvider: "windows-dpapi-current-user",
    oauthStateRef: `state_${initialized.state.bindingId.slice("binding_".length)}`,
    authMode: existing.authMode ?? "legacy"
  }), oauthRoute);

  let tunnelId = "";
  if (existingTunnel) {
    tunnelId = existingTunnel.validation.tunnelId;
    validateTunnelOwnerMarker(configPath, {
      profileId: modules.profile.profileIdForRoot(root),
      bindingId: initialized.state.bindingId,
      tunnelId,
      tunnelName,
      hostname
    });
    updateSetupJournal(root, { phase: "tunnel-created", tunnelId, tunnelCreated: false });
    updateSetupJournal(root, { phase: "dns-routed", tunnelId, dnsRouteVerifiedByExternalProbe: true });
    updateSetupJournal(root, { phase: "ingress-written", tunnelId, configDigest: existingTunnel.validation.digest });
  } else {
    const noTunnelChanges = hasFlag(argv, "no-tunnel-changes");
    let provision = hasFlag(argv, "provision-tunnel");
    if (!provision && process.stdin.isTTY && !noTunnelChanges) provision = await confirmProvision(tunnelName, hostname);
    if (!provision) {
      updateSetupJournal(root, { phase: "login-required" });
      printTunnelPlan(root, cloudflared, tunnelName, hostname, configPath, publicPort);
      throw authError("AUTH_TUNNEL_PROVISIONING_REQUIRED", "Re-run with --provision-tunnel after reviewing the printed Cloudflare changes.");
    }
    if (!fs.existsSync(cloudflareLoginMaterial())) {
      updateSetupJournal(root, { phase: "login-required" });
      const resume = supportedCommand(["auth", "setup", "--root", root, "--hostname", hostname, "--tunnel-name", tunnelName, "--provision-tunnel"]);
      if (!process.stdin.isTTY) {
        throw authError("AUTH_TUNNEL_LOGIN_REQUIRED", "Cloudflare owner login material is missing.", `${cloudflared} tunnel login; ${resume}`);
      }
      runCloudflared(cloudflared, ["tunnel", "--no-autoupdate", "login"], { timeout: 300_000 });
      if (!fs.existsSync(cloudflareLoginMaterial())) {
        throw authError("AUTH_TUNNEL_LOGIN_REQUIRED", "Cloudflare login completed without producing owner login material.", resume);
      }
    }
    const priorJournal = readSetupJournal(root);
    const resumableTunnelId =
      priorJournal?.hostname === hostname && priorJournal?.tunnelName === tunnelName &&
      typeof priorJournal?.tunnelId === "string"
        ? priorJournal.tunnelId
        : "";
    const ensured = ensureTunnel(cloudflared, tunnelName, resumableTunnelId);
    tunnelId = ensured.tunnelId;
    updateSetupJournal(root, { phase: "tunnel-created", tunnelId, tunnelCreated: ensured.created });
    routeTunnelDns(cloudflared, tunnelId, hostname);
    updateSetupJournal(root, { phase: "dns-routed", tunnelId });
    const credentialsFile = path.join(os.homedir(), ".cloudflared", `${tunnelId}.json`);
    if (!fs.existsSync(credentialsFile)) throw authError("AUTH_TUNNEL_CREDENTIALS_INVALID", `Tunnel credential file was not found: ${credentialsFile}`);
    const configText = modules.auth.createDedicatedTunnelConfig({ tunnelId, credentialsFile, hostname, publicPort });
    writeTextAtomic(configPath, configText);
    const validation = modules.auth.validateDedicatedTunnelConfig(configText, { tunnelId, hostname, publicPort, localAdminPort });
    writeTunnelOwnerMarker(configPath, {
      profileId: modules.profile.profileIdForRoot(root),
      bindingId: initialized.state.bindingId,
      tunnelId,
      tunnelName,
      hostname
    });
    updateSetupJournal(root, { phase: "ingress-written", tunnelId, configDigest: validation.digest });
  }

  modules.profile.saveWorkspaceProfile(root, candidateProfile);

  const childArgs = [
    path.join(scriptDir, "codexgpt.mjs"), "start",
    "--root", root,
    "--tunnel", "cloudflare-named",
    "--hostname", hostname,
    "--tunnel-name", tunnelName,
    "--cloudflare-config", configPath,
    "--cloudflared", cloudflared,
    "--no-install-cloudflared",
    "--no-copy-url"
  ];
  const candidate = spawn(process.execPath, childArgs, {
    cwd: root,
    env: { ...process.env, CODEXGPT_AUTH_MODE: "oauth", CODEXGPT_ALLOW_QUERY_TOKEN: "0" },
    stdio: "inherit",
    windowsHide: true
  });
  updateSetupJournal(root, { phase: "candidate-listener-started", candidatePid: candidate.pid ?? null });
  let exited = false;
  candidate.once("exit", () => { exited = true; });
  try {
    await Promise.race([
      publicMetadataProbe(hostname, initialized.state),
      new Promise((_, reject) => candidate.once("exit", (code) => reject(authError("AUTH_CANDIDATE_EXITED", `Candidate OAuth service exited with code ${code}.`))))
    ]);
    updateSetupJournal(root, { phase: "external-probe" });
    modules.profile.saveWorkspaceProfile(root, stableProfilePayload(candidateProfile, { authMode: "oauth" }));
    updateSetupJournal(root, { phase: "mode-committed" });
    console.log("OAuth ready");
    console.log(`Server URL  https://${hostname}/mcp`);
    console.log("Admin       local only");
    console.log("Next        in the OAuth App, choose Scan Tools once or recreate the App, then approve the link on this PC");
    console.log(`Rollback    use the retained Legacy App after: ${supportedCommand(["auth", "rollback", "--root", root])}`);
    if (hasFlag(argv, "no-start") || !process.stdin.isTTY) {
      stopProcessTree(candidate);
      updateSetupJournal(root, { phase: "configured-no-start", candidatePid: null });
      console.log(`Start       ${supportedCommand(["start", "--root", root])}`);
      return;
    }
    updateSetupJournal(root, { phase: "foreground-running" });
    await new Promise((resolve, reject) => candidate.once("exit", (code) => code === 0 ? resolve() : reject(authError("AUTH_SERVICE_EXITED", `OAuth service exited with code ${code}.`))));
  } catch (error) {
    if (!exited) stopProcessTree(candidate);
    throw error;
  }
}

async function commandRollback(root, invocation, modules) {
  const profile = modules.profile.readWorkspaceProfile(root);
  const { oauthStateRoot } = oauthStateRoots(modules);
  const runtime = currentOAuthRuntime(modules, oauthStateRoot, modules.profile.profileIdForRoot(root));
  const currentProcess = process.env.CODEXGPT_AUTH_MODE?.trim();
  const persistedUser = persistedUserAuthMode();
  const resolution = modules.auth.resolveHttpAuthMode({ currentProcess: currentProcess || undefined, persistedUser: persistedUser || undefined, profile: profile.authMode });
  if (resolution.source === "current-process") {
    throw authError("AUTH_MODE_ENV_OVERRIDE", "Current-process CODEXGPT_AUTH_MODE overrides the workspace profile.", "Remove-Item Env:CODEXGPT_AUTH_MODE");
  }
  if (resolution.source === "persisted-user") {
    throw authError("AUTH_MODE_ENV_OVERRIDE", "Persisted user CODEXGPT_AUTH_MODE overrides the workspace profile.", "[Environment]::SetEnvironmentVariable('CODEXGPT_AUTH_MODE',$null,'User')");
  }
  const oauthRoute = profile.authRoutes?.oauth ?? modules.profile.workspaceAuthRouteFromProfile(profile);
  let legacyRoute = profile.authRoutes?.legacy;
  if (!legacyRoute) {
    const hostnameInput = optionValue(invocation.argv, "legacy-hostname");
    const tunnelNameInput = optionValue(invocation.argv, "legacy-tunnel-name");
    const publicPortInput = optionValue(invocation.argv, "legacy-public-port");
    const anyMigrationInput = Boolean(hostnameInput || tunnelNameInput || publicPortInput);
    if (!hostnameInput || !tunnelNameInput || !publicPortInput) {
      const migrationCommand = supportedCommand([
        "auth", "rollback", "--root", root,
        "--legacy-hostname", "<retained-legacy-hostname>",
        "--legacy-tunnel-name", "<retained-legacy-tunnel-name>",
        "--legacy-public-port", "<retained-legacy-port>"
      ]);
      throw authError(
        "AUTH_LEGACY_ROUTE_MISSING",
        anyMigrationInput
          ? "The one-time retained Legacy route migration requires hostname, tunnel name, and public port together."
          : "The pre-migration Legacy App route is not recorded, so rollback cannot choose a safe endpoint.",
        migrationCommand
      );
    }
    const hostname = modules.auth.normalizeOAuthHostname(hostnameInput);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tunnelNameInput)) {
      throw authError("OAUTH_DEPLOYMENT_INVALID", "--legacy-tunnel-name is invalid.");
    }
    const publicPort = exactPort(publicPortInput, "Legacy public port");
    legacyRoute = {
      tunnel: "cloudflare-named",
      hostname,
      tunnelName: tunnelNameInput,
      port: String(publicPort),
      ...(profile.noInstallCloudflared ? { noInstallCloudflared: true } : {})
    };
    console.log("Recorded retained Legacy route from explicit safe routing inputs; no credential was copied into routes or displayed.");
  }
  const switched = modules.profile.applyWorkspaceAuthRoute(stableProfilePayload(profile, {
    authMode: "legacy",
    authRoutes: { ...profile.authRoutes, legacy: legacyRoute, oauth: oauthRoute }
  }), legacyRoute);
  modules.profile.saveWorkspaceProfile(root, switched);
  console.log("Authentication mode set to legacy. OAuth state, keys, grants, clients, audit, and Cloudflare routes were preserved.");
  if (runtime) {
    console.log(`Current run  still OAuth in pid ${runtime.pid}; press q in its terminal to stop it`);
  }
  console.log(`Restart      ${supportedCommand(["start", "--root", root])}`);
  console.log("ChatGPT      use the separately retained Legacy App after the restart");
}

function backupFilesForState(store, oauthStateRoot, state, auth) {
  return store.listBindingBackups(state.bindingId)
    .filter((entry) => SAFE_BACKUP_ID.test(entry.backupId))
    .map((entry) => {
      const filePath = auth.deploymentBackupFile(
        oauthStateRoot,
        state.bindingId,
        entry.incarnationId,
        entry.backupId
      );
      return {
        id: entry.backupId,
        incarnationId: entry.incarnationId,
        path: filePath,
        bytes: fs.statSync(filePath).size
      };
    });
}

async function commandRecover(root, invocation, modules) {
  if (invocation.operation === "recover.restore") {
    await requireDestructiveConfirmation(
      invocation.argv,
      "confirm-forced-relink",
      "FORCE RELINK",
      "Backup restore creates a new signing key, pepper, epoch, and incarnation; every prior token remains invalid and ChatGPT must relink."
    );
  }
  if (invocation.operation === "recover.unlock") {
    await requireDestructiveConfirmation(
      invocation.argv,
      "confirm-dead-owner",
      "RECOVER DEAD OWNER",
      "Dead-owner recovery quarantines only the exact verified stale lock and does not stop a live process."
    );
  }
  return await withOfflineAuth(root, modules, async (context) => {
    const configuration = deploymentConfiguration(root, context.profile, modules);
    const state = context.registry.readCurrentState(configuration.identityKey);
    if (invocation.operation === "recover.inspect") {
      const backups = backupFilesForState(context.store, context.oauthStateRoot, state, modules.auth);
      console.log(JSON.stringify({
        root,
        bindingId: state.bindingId,
        incarnationId: state.incarnationId,
        generation: state.generation,
        recoveryRequired: state.recoveryRequired,
        backups: backups.map(({ id, incarnationId, bytes }) => ({ id, incarnationId, bytes }))
      }, null, 2));
      return;
    }
    if (invocation.operation === "recover.restore") {
      const backupId = invocation.target;
      if (!SAFE_BACKUP_ID.test(backupId)) throw authError("OAUTH_BACKUP_INVALID", "Backup id is invalid.");
      const backup = backupFilesForState(context.store, context.oauthStateRoot, state, modules.auth).find((entry) => entry.id === backupId);
      if (!backup) throw authError("OAUTH_BACKUP_NOT_FOUND", "Verified OAuth backup was not found.");
      const parsed = context.store.readDeploymentBackup(state.bindingId, backup.incarnationId, backup.id);
      const restored = await context.coordinator.restoreAsSecurityReset(configuration.identityKey, parsed);
      console.log(`OAuth state restored as security reset. New incarnation: ${restored.incarnationId}`);
      console.log("All restored grants are inactive; relink ChatGPT before use.");
      return;
    }
    if (invocation.operation === "recover.unlock") {
      const exactOwnerId = invocation.target;
      if (!/^authrun_[a-f0-9]{32}$/.test(exactOwnerId)) throw authError("OAUTH_LOCK_OWNER_INVALID", "Exact owner id must be an authrun identifier.");
      const lockRoot = path.join(context.oauthStateRoot, "runtime", "locks");
      const candidates = fs.existsSync(lockRoot) ? fs.readdirSync(lockRoot).filter((name) => name.endsWith(".lock")) : [];
      let matched = "";
      for (const name of candidates) {
        try {
          const owner = JSON.parse(fs.readFileSync(path.join(lockRoot, name, "owner.json"), "utf8"));
          if (owner.runId === exactOwnerId) { matched = owner.lockName; break; }
        } catch {}
      }
      if (!matched) throw authError("OAUTH_LOCK_OWNER_NOT_FOUND", "Exact dead lock owner was not found.");
      const handle = context.locks.acquire(matched);
      handle.release();
      console.log(`Recovered dead OAuth lock owner ${exactOwnerId}.`);
      return;
    }
    throw authError("OAUTH_COMMAND_INVALID", "Unknown recover operation.");
  });
}

async function commandReinitialize(root, invocation, modules) {
  if (!hasFlag(invocation.argv, "revoke-all")) throw authError("OAUTH_REVOKE_ALL_REQUIRED", "reinitialize requires --revoke-all.");
  await requireDestructiveConfirmation(
    invocation.argv,
    "confirm-reinitialize",
    "REINITIALIZE OAUTH",
    "Reinitialization rotates deployment authority and revokes every prior token and grant while preserving the stable binding and tunnel."
  );
  await withOfflineAuth(root, modules, async (context) => {
    const configuration = deploymentConfiguration(root, context.profile, modules);
    const current = context.registry.readCurrentState(configuration.identityKey);
    const reset = await context.coordinator.restoreAsSecurityReset(configuration.identityKey, current);
    console.log(`OAuth deployment reinitialized. New incarnation: ${reset.incarnationId}`);
    console.log("All prior access and refresh tokens are invalid; relink ChatGPT.");
  });
}

async function commandRebind(root, invocation, modules) {
  if (!hasFlag(invocation.argv, "revoke-all")) throw authError("OAUTH_REVOKE_ALL_REQUIRED", "rebind requires --revoke-all.");
  const fromRootRaw = optionValue(invocation.argv, "from-root");
  if (!fromRootRaw) throw authError("OAUTH_ROOT_REQUIRED", "rebind requires --from-root.");
  const fromRoot = canonicalDirectory(fromRootRaw);
  if (fromRoot === root) {
    throw authError("OAUTH_STATE_CONFLICT", "rebind requires distinct source and target workspace roots.");
  }
  const fromProfile = modules.profile.readWorkspaceProfile(fromRoot);
  const hostname = modules.auth.normalizeOAuthHostname(optionValue(invocation.argv, "hostname") || fromProfile.hostname || "");
  if (hostname !== fromProfile.hostname) throw authError("OAUTH_STATE_CONFLICT", "Core rebind preserves the existing hostname/issuer/resource.");
  const targetProfile = modules.profile.readWorkspaceProfile(root);
  if (
    (targetProfile.authMode === "oauth" || targetProfile.oauthStateRef ||
      targetProfile.oauthIssuer || targetProfile.oauthResource) &&
    !isStaleOAuthRebindAlias(targetProfile, fromProfile)
  ) {
    throw authError("OAUTH_STATE_CONFLICT", "Target workspace already has OAuth deployment selectors.");
  }
  const { oauthStateRoot } = oauthStateRoots(modules);
  if (currentOAuthRuntime(modules, oauthStateRoot, modules.profile.profileIdForRoot(root))) {
    throw authError("OAUTH_STATE_BUSY", "Stop the target workspace runtime before rebind.");
  }
  await withOfflineAuth(fromRoot, modules, async (context) => {
    const oldConfiguration = deploymentConfiguration(fromRoot, fromProfile, modules);
    const current = context.registry.readCurrentState(oldConfiguration.identityKey);
    if (!fromProfile.cloudflareConfig) {
      throw authError("AUTH_TUNNEL_OWNERSHIP_UNPROVEN", "Rebind requires the existing dedicated tunnel config and owner marker.");
    }
    const tunnelValidation = modules.auth.validateDedicatedTunnelConfig(
      fs.readFileSync(fromProfile.cloudflareConfig, "utf8"),
      {
        hostname: oldConfiguration.hostname,
        publicPort: oldConfiguration.listeners.publicPort,
        localAdminPort: oldConfiguration.listeners.localAdminPort
      }
    );
    validateTunnelOwnerMarker(fromProfile.cloudflareConfig, {
      profileId: current.profileId,
      bindingId: current.bindingId,
      tunnelId: tunnelValidation.tunnelId,
      tunnelName: fromProfile.tunnelName,
      hostname
    });
    const newConfiguration = modules.auth.resolveOAuthDeploymentConfiguration({
      canonicalRoot: root,
      profileId: modules.profile.profileIdForRoot(root),
      hostname,
      tunnel: "cloudflare-named",
      tunnelName: fromProfile.tunnelName ?? "",
      tunnelOwner: "codexgpt",
      publicHost: "127.0.0.1",
      publicPort: Number(fromProfile.port ?? DEFAULT_PUBLIC_PORT),
      localAdminHost: "127.0.0.1",
      localAdminPort: Number(fromProfile.localAdminPort ?? DEFAULT_LOCAL_ADMIN_PORT)
    });
    const rebound = await context.coordinator.rebindAsSecurityReset(oldConfiguration.identityKey, newConfiguration);
    writeTunnelOwnerMarker(fromProfile.cloudflareConfig, {
      profileId: rebound.profileId,
      bindingId: rebound.bindingId,
      tunnelId: tunnelValidation.tunnelId,
      tunnelName: fromProfile.tunnelName,
      hostname
    });
    modules.profile.saveWorkspaceProfile(root, stableProfilePayload(targetProfile, {
      ...stableProfilePayload(fromProfile),
      root,
      authMode: "oauth",
      oauthStateRef: `state_${rebound.bindingId.slice("binding_".length)}`
    }));
    modules.profile.saveWorkspaceProfile(fromRoot, stableProfilePayload(fromProfile, { authMode: "legacy" }));
    console.log(`OAuth hostname rebound to ${root}. New incarnation: ${rebound.incarnationId}`);
    console.log("All prior grants and tokens were revoked. Cloudflare routes were not changed.");
  });
}

async function commandDoctor(root, modules) {
  const profile = modules.profile.readWorkspaceProfile(root);
  const checks = [];
  const record = (status, name, detail) => checks.push({
    status: status === true ? "ok" : status === false ? "fail" : status,
    name,
    detail
  });
  record(process.platform === "win32", "Native Windows", process.platform);

  let configuration = null;
  try {
    configuration = deploymentConfiguration(root, profile, modules);
    record(true, "OAuth profile", "complete reviewed selector set");
  } catch (error) {
    record(false, "OAuth profile", error.message);
  }

  const { oauthStateRoot } = oauthStateRoots(modules);
  let credentialStore = null;
  try {
    credentialStore = modules.auth.createProductionCredentialStore();
    await credentialStore.probe();
    record(true, "DPAPI CurrentUser", "available");
  } catch (error) {
    record(false, "DPAPI CurrentUser", error.message);
  }

  let currentState = null;
  if (configuration && credentialStore) {
    try {
      const store = new modules.auth.AuthStateStore(oauthStateRoot, credentialStore, {
        audit: { append() {} }
      });
      const registry = new modules.auth.DeploymentRegistry(store);
      const owner = store.readOwner();
      const entry = registry.resolve(configuration.identityKey);
      if (!entry) throw authError("OAUTH_STATE_CONFLICT", "Configured issuer/resource is not registered.");
      currentState = registry.readCurrentState(configuration.identityKey);
      if (
        currentState.ownerRef !== owner.ownerRef ||
        currentState.canonicalRoot !== root ||
        currentState.profileId !== modules.profile.profileIdForRoot(root) ||
        currentState.recoveryRequired
      ) {
        throw authError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth registry, owner, profile, or deployment state is inconsistent.");
      }
      record(true, "OAuth state", `binding ${currentState.bindingId}; generation ${currentState.generation}`);
    } catch (error) {
      record(false, "OAuth state", error.message);
    }
  } else {
    record(false, "OAuth state", "profile or DPAPI prerequisite unavailable");
  }

  try {
    const binary = managedCloudflaredPath();
    const version = verifiedInstalledCloudflaredVersion(binary);
    record(Boolean(version), "Managed cloudflared", version || "unavailable or SHA-256/version verification failed");
  } catch (error) {
    record(false, "Managed cloudflared", error.message);
  }

  let tunnelValidation = null;
  if (profile.cloudflareConfig && configuration) {
    try {
      tunnelValidation = modules.auth.validateDedicatedTunnelConfig(fs.readFileSync(profile.cloudflareConfig, "utf8"), {
        hostname: configuration.hostname,
        publicPort: configuration.listeners.publicPort,
        localAdminPort: configuration.listeners.localAdminPort
      });
      record(true, "Tunnel ingress", "dedicated public listener plus final 404");
    } catch (error) {
      record(false, "Tunnel ingress", error.message);
    }
  } else {
    record(false, "Tunnel ingress", "not configured");
  }
  if (tunnelValidation && currentState) {
    try {
      validateTunnelOwnerMarker(profile.cloudflareConfig, {
        profileId: currentState.profileId,
        bindingId: currentState.bindingId,
        tunnelId: tunnelValidation.tunnelId,
        tunnelName: profile.tunnelName,
        hostname: profile.hostname
      });
      record(true, "Tunnel ownership", "owner marker matches profile and stable binding");
    } catch (error) {
      record(false, "Tunnel ownership", error.message);
    }
  } else {
    record(false, "Tunnel ownership", "ingress or local state unavailable");
  }

  let runtime = null;
  try {
    runtime = currentOAuthRuntime(modules, oauthStateRoot, modules.profile.profileIdForRoot(root));
    record(runtime ? "ok" : "warn", "OAuth runtime", runtime ? `pid ${runtime.pid}; exact creation time verified` : "stopped");
  } catch (error) {
    record(false, "OAuth runtime", error.message);
  }

  if (runtime) {
    try {
      const localHealth = await requestJson(`${runtime.localAdminOrigin}/healthz`, {
        hostHeader: new URL(runtime.localAdminOrigin).host
      });
      if (localHealth?.ok !== true || localHealth?.ownerChannel !== "local-control-cli" || localHealth?.ownerChannelAvailable !== true) {
        throw authError("AUTH_ADMIN_HEALTH_INVALID", "Local admin listener is not attached to the current-user owner channel.");
      }
      record(true, "Local admin", `${runtime.localAdminOrigin}; owner channel available`);
    } catch (error) {
      record(false, "Local admin", error.message);
    }

    try {
      const context = await onlineContext(root, modules);
      await Promise.all([
        context.client.listOAuthAuthorizations(runtime.serverId),
        context.client.listOAuthClients(runtime.serverId),
        context.client.listOAuthGrants(runtime.serverId)
      ]);
      record(true, "Owner control", "current-user named pipe accepted safe list operations");
    } catch (error) {
      record(false, "Owner control", error.message);
    }

    if (configuration) {
      try {
        await verifyPublicOAuthSurface(configuration.hostname, currentState);
        record(true, "Public OAuth", "resource metadata, issuer endpoints, JWKS, and MCP health are consistent");
      } catch (error) {
        record(false, "Public OAuth", error.message);
      }
    } else {
      record(false, "Public OAuth", "profile unavailable");
    }
  } else {
    record("warn", "Local admin", "runtime stopped; probe not applicable");
    record("warn", "Owner control", "runtime stopped; probe not applicable");
    record("warn", "Public OAuth", "runtime stopped; probe not applicable");
  }

  for (const check of checks) {
    const marker = check.status === "ok" ? "OK  " : check.status === "warn" ? "WARN" : "FAIL";
    console.log(`${marker} ${check.name.padEnd(22)} ${check.detail}`);
  }
  if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
  return checks;
}

export async function runAuth(argv = process.argv.slice(2)) {
  if (!fs.existsSync(path.join(projectRoot, "dist", "auth", "index.js"))) {
    throw authError("OAUTH_BUILD_REQUIRED", "Missing built OAuth modules. Run npm run build.");
  }
  const invocation = parseAuthInvocation(argv);
  if (invocation.operation === "help" || hasFlag(argv, "help")) {
    console.log(authUsage());
    return;
  }
  const modules = await runtimeModules();
  const root = resolveRoot(argv, modules.profile);
  switch (invocation.operation) {
    case "setup": return await commandSetup(root, invocation, modules);
    case "status": return await commandStatus(root, modules, hasFlag(argv, "json"));
    case "doctor": return await commandDoctor(root, modules);
    case "pending": return await listOnline(root, modules, "pending");
    case "clients": return await listOnline(root, modules, "clients");
    case "open": {
      const context = await onlineContext(root, modules);
      const response = await context.client.issueOAuthAdminBootstrap(context.runtime.serverId);
      if (!response.ok || !response.oauthAdminBootstrapUrl) throw authError(response.code, "Local admin bootstrap could not be issued.");
      openBrowser(response.oauthAdminBootstrapUrl);
      console.log("Opened the local OAuth administration page. The one-time bootstrap was not printed.");
      return;
    }
    case "approve":
    case "deny": {
      if (!invocation.target) throw authError("OAUTH_AUTHORIZATION_REQUIRED", `${invocation.operation} requires a correlation code.`);
      const context = await onlineContext(root, modules);
      const pending = await resolvePending(context, invocation.target);
      const response = invocation.operation === "approve"
        ? await context.client.approveOAuthAuthorization(context.runtime.serverId, pending.pendingId)
        : await context.client.denyOAuthAuthorization(context.runtime.serverId, pending.pendingId);
      if (!response.ok) throw authError(response.code, "OAuth authorization operation failed.");
      console.log(`${pending.correlationCode} ${invocation.operation === "approve" ? "approved" : "denied"}.`);
      return;
    }
    case "client.remove": {
      if (!invocation.target) throw authError("OAUTH_CLIENT_REQUIRED", "client remove requires a client id.");
      const context = await onlineContext(root, modules);
      const response = await context.client.revokeOAuthClient(context.runtime.serverId, invocation.target);
      if (!response.ok) throw authError(response.code, "OAuth client was not found.");
      console.log(response.code);
      return;
    }
    case "prune": {
      if (!hasFlag(argv, "unapproved")) throw authError("OAUTH_PRUNE_TARGET_REQUIRED", "prune requires --unapproved.");
      const context = await onlineContext(root, modules);
      const response = await context.client.pruneUnapprovedOAuthClients(context.runtime.serverId);
      if (!response.ok) throw authError(response.code, "OAuth unapproved-client pruning failed.");
      console.log(response.code);
      return;
    }
    case "revoke": {
      const revokeAll = hasFlag(argv, "all");
      if (revokeAll) {
        await requireDestructiveConfirmation(
          argv,
          "confirm-revoke-all",
          "REVOKE ALL GRANTS",
          "Owner-wide revocation invalidates every active OAuth grant for this workspace but does not remove registered clients or Cloudflare state."
        );
      } else if (!invocation.target) {
        throw authError("OAUTH_GRANT_REQUIRED", "revoke requires a grant id or --all.");
      }
      const context = await onlineContext(root, modules);
      const response = revokeAll
        ? await context.client.revokeOAuthOwnerGrants(context.runtime.serverId)
        : await context.client.revokeOAuthGrant(context.runtime.serverId, invocation.target);
      if (!response.ok) throw authError(response.code, "OAuth grant revocation failed.");
      console.log(response.code);
      return;
    }
    case "rotate-signing-key": {
      const context = await onlineContext(root, modules);
      const response = await context.client.rotateOAuthSigningKey(context.runtime.serverId, hasFlag(argv, "revoke-all"));
      if (!response.ok) throw authError(response.code, "OAuth signing-key rotation failed.");
      console.log(response.code);
      return;
    }
    case "rollback": return await commandRollback(root, invocation, modules);
    case "recover.inspect":
    case "recover.restore":
    case "recover.unlock": return await commandRecover(root, invocation, modules);
    case "reinitialize": return await commandReinitialize(root, invocation, modules);
    case "rebind": return await commandRebind(root, invocation, modules);
    default: throw authError("OAUTH_COMMAND_INVALID", `Unknown auth command: ${invocation.operation}\n\n${authUsage()}`);
  }
}

export function isMainInvocation(metaUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath && metaUrl === pathToFileURL(path.resolve(argvPath)).href);
}

if (isMainInvocation(import.meta.url)) {
  runAuth().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error?.repairCommand) console.error(`Repair: ${error.repairCommand}`);
    process.exitCode = 1;
  });
}
